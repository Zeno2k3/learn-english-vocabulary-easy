#!/usr/bin/env node
/* Kiểm tra data/lessons/*.json rồi sinh website tĩnh vào dist/. Không cần cài thư viện. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const FILE_RE = /^(\d+)-[a-z0-9-]+\.json$/;
const EX_REQUIRED = { type: ["items"], choose: ["items", "choices"], gaps: ["items"], cross: ["items", "rows", "cols"], fill: ["parts"], sentence: ["items"], free: [] };
const LT_ESCAPE = "\\" + "u003c";

const text = v => typeof v === "string" && v.trim() !== "";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const safeJson = v => JSON.stringify(v).replace(/</g, LT_ESCAPE);
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
const wordKey = w => String(w).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const pad2 = n => String(n).padStart(2, "0");

function collectImages(node, out = []) {
  if (Array.isArray(node)) node.forEach(x => collectImages(x, out));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) k === "img" && typeof v === "string" ? out.push(v) : collectImages(v, out);
  return out;
}

function checkCrossword(ex, err) {
  const grid = new Map();
  for (const it of ex.items) {
    const word = String(it.a || "").toLowerCase();
    [...word].forEach((ch, i) => {
      const r = it.r + (it.dir === "d" ? i : 0), c = it.c + (it.dir === "a" ? i : 0), cell = r + ":" + c;
      if (r >= ex.rows || c >= ex.cols) err("bài " + ex.id + ": từ \"" + word + "\" vượt ra ngoài ô chữ");
      if (grid.has(cell) && grid.get(cell) !== ch) err("bài " + ex.id + ": từ \"" + word + "\" giao sai chữ tại hàng " + r + ", cột " + c);
      grid.set(cell, ch);
    });
  }
}

function checkLesson(l, name, base, rep) {
  const err = m => rep.errors.push(name + ": " + m);
  const prefix = Number(name.match(FILE_RE)[1]);
  if (!Number.isInteger(l.id) || l.id < 1) err("\"id\" phải là số nguyên dương");
  else if (l.id !== prefix) err("\"id\" là " + l.id + " nhưng tên file bắt đầu bằng " + prefix);
  if (!text(l.title)) err("thiếu \"title\"");
  for (const k of ["topics", "quiz", "exercises", "lint", "links"]) if (l[k] !== undefined && !Array.isArray(l[k])) err("\"" + k + "\" phải là mảng");
  if (!Array.isArray(l.words) || !l.words.length) { err("\"words\" phải có ít nhất một từ"); return; }

  const seen = new Set();
  l.words.forEach((w, i) => {
    const at = "từ #" + (i + 1) + (text(w.w) ? " (" + w.w + ")" : "");
    for (const k of ["w", "vi", "t", "topic"]) if (!text(w[k])) err(at + ": thiếu \"" + k + "\"");
    if (!text(w.q) && !text(w.img)) err(at + ": cần \"q\" (câu gợi ý) hoặc \"img\" (ảnh)");
    if (!text(w.w)) return;
    if (!/^[A-Za-z' -]+$/.test(w.w)) err(at + ": đáp án chỉ được chứa chữ cái, dấu cách, dấu gạch nối, dấu nháy đơn");
    const k = wordKey(w.w);
    if (seen.has(k)) err(at + ": từ bị lặp trong bài");
    seen.add(k);
    if (!text(w.ipa)) rep.warnings.push(name + ": " + at + " chưa có phiên âm \"ipa\"");
    if (!text(w.ex)) rep.warnings.push(name + ": " + at + " chưa có câu ví dụ \"ex\"");
  });

  (Array.isArray(l.quiz) ? l.quiz : []).forEach((q, i) => {
    for (const k of ["q", "why", "rule"]) if (!text(q[k])) err("câu trắc nghiệm #" + (i + 1) + ": thiếu \"" + k + "\"");
    if (!Array.isArray(q.o) || q.o.length < 2) err("câu trắc nghiệm #" + (i + 1) + ": \"o\" cần ít nhất 2 đáp án, đáp án đúng đặt đầu tiên");
  });

  (Array.isArray(l.exercises) ? l.exercises : []).forEach((ex, i) => {
    const at = "bài tập #" + (i + 1) + (ex.id ? " (" + ex.id + ")" : "");
    if (!text(ex.id)) err(at + ": thiếu \"id\"");
    if (!(ex.type in EX_REQUIRED)) { err(at + ": \"type\" không hợp lệ, chọn một trong: " + Object.keys(EX_REQUIRED).join(", ")); return; }
    const missing = EX_REQUIRED[ex.type].filter(k => ex[k] === undefined);
    missing.forEach(k => err(at + ": thiếu \"" + k + "\""));
    if (ex.type === "cross" && !missing.length) checkCrossword(ex, err);
  });

  (Array.isArray(l.lint) ? l.lint : []).forEach((r, i) => {
    if (!text(r.message)) err("lint #" + (i + 1) + ": thiếu \"message\"");
    try { new RegExp(r.pattern, r.flags || ""); } catch (e) { err("lint #" + (i + 1) + ": biểu thức sai (" + e.message + ")"); }
  });

  for (const img of new Set(collectImages([l.words, l.exercises]))) {
    const m = img.match(/^img\/([^/]+)$/);
    if (!m) err("ảnh \"" + img + "\" phải có dạng img/ten-anh.jpg");
    else if (!existsSync(join(DATA, "images", base, m[1]))) err("không thấy ảnh data/images/" + base + "/" + m[1]);
  }
}

export function loadSite() {
  const rep = { errors: [], warnings: [] };
  const dir = join(DATA, "lessons");
  const lessons = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json") || name.startsWith("_")) continue;
    if (!FILE_RE.test(name)) { rep.errors.push(name + ": tên file phải có dạng 06-ten-bai.json (chữ thường, không dấu)"); continue; }
    let lesson;
    try { lesson = JSON.parse(readFileSync(join(dir, name), "utf8")); }
    catch (e) { rep.errors.push(name + ": JSON sai cú pháp (" + e.message + ")"); continue; }
    const base = name.replace(/\.json$/, "");
    checkLesson(lesson, name, base, rep);
    const arr = v => (Array.isArray(v) ? v : []);
    lessons.push({ ...lesson, base, file: name, words: arr(lesson.words), topics: arr(lesson.topics), quiz: arr(lesson.quiz), exercises: arr(lesson.exercises), lint: arr(lesson.lint), links: arr(lesson.links) });
  }
  lessons.sort((a, b) => a.id - b.id);
  lessons.forEach((l, i) => { if (i && l.id === lessons[i - 1].id) rep.errors.push(l.file + ": trùng id " + l.id + " với " + lessons[i - 1].file); });

  const topics = JSON.parse(readFileSync(join(DATA, "topics.json"), "utf8"));
  const topicIds = new Set(topics.map(t => t.id));
  for (const l of lessons) for (const t of l.topics) {
    if (!text(t.id) || !text(t.vi)) { rep.errors.push(l.file + ": chủ đề mới cần \"id\" và \"vi\""); continue; }
    if (topicIds.has(t.id)) { rep.errors.push(l.file + ": chủ đề \"" + t.id + "\" đã tồn tại, chỉ cần dùng lại id này"); continue; }
    topicIds.add(t.id); topics.push(t);
  }

  const firstSeen = new Map();
  for (const l of lessons) for (const w of l.words) {
    if (!text(w.w)) continue;
    if (!topicIds.has(w.topic)) rep.errors.push(l.file + ": từ \"" + w.w + "\" dùng chủ đề \"" + w.topic + "\" chưa có. Khai báo trong \"topics\" của bài");
    const k = w.w.toLowerCase();
    if (firstSeen.has(k)) rep.warnings.push(l.file + ": từ \"" + w.w + "\" đã có ở bài " + firstSeen.get(k) + ", bản đồ 3D giữ bản của bài đó");
    else firstSeen.set(k, l.id);
  }
  for (const l of lessons) for (const pair of l.links) {
    if (!Array.isArray(pair) || pair.length !== 2) { rep.errors.push(l.file + ": mỗi liên kết phải là cặp [\"từ 1\", \"từ 2\"]"); continue; }
    for (const w of pair) if (!firstSeen.has(String(w).toLowerCase())) rep.errors.push(l.file + ": liên kết tới từ \"" + w + "\" chưa có trong bài nào");
  }
  return { lessons, topics, firstSeen, rep };
}

function asset(from, to, prefix = "") {
  const body = prefix + readFileSync(join(SRC, from), "utf8");
  mkdirSync(join(DIST, "assets"), { recursive: true });
  writeFileSync(join(DIST, "assets", to), body);
  return "assets/" + to + "?v=" + createHash("sha256").update(body).digest("hex").slice(0, 8);
}

function page(path, html) {
  mkdirSync(dirname(join(DIST, path)), { recursive: true });
  writeFileSync(join(DIST, path), html);
}

/* Chỉ khoá công khai được đưa vào website. Khoá bí mật lọt vào đây sẽ làm build thất bại. */
function syncConfig(rep) {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!url && !key) return null;
  if (!url || !key) { rep.errors.push("cần đặt cả SUPABASE_URL và SUPABASE_PUBLISHABLE_KEY"); return null; }
  if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(url)) rep.errors.push("SUPABASE_URL phải dùng https");
  let role = "";
  if (key.startsWith("eyJ")) { try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch (e) {} }
  if (key.startsWith("sb_secret_") || role === "service_role") rep.errors.push("SUPABASE_PUBLISHABLE_KEY đang là khoá bí mật, không được đưa vào website");
  return { url, key };
}

function renderHome(lessons, wordCount, vars) {
  const cards = lessons.map(l => {
    const meta = [l.words.length + " từ"];
    if (l.quiz.length) meta.push(l.quiz.length + " trắc nghiệm");
    if (l.exercises.length) meta.push(l.exercises.length + " bài tập");
    return '<a class="lesson" href="lessons/' + l.id + '/" data-id="' + l.id + '"><span class="num">' + pad2(l.id) + '</span><span class="name">' + esc(l.title) + '</span><span class="meta">' + meta.join(" · ") + '</span><span class="prog" hidden></span></a>';
  }).join("\n");
  return fill(readFileSync(join(SRC, "home/home.html"), "utf8"), { ...vars, LESSONS: cards, LESSON_COUNT: lessons.length, WORD_COUNT: wordCount });
}

export function build() {
  const { lessons, topics, firstSeen, rep } = loadSite();
  const sync = syncConfig(rep);
  if (rep.errors.length) return rep;
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, ".nojekyll"), "");

  const gameCss = asset("game/game.css", "game.css"), gameJs = asset("game/game.js", "game.js");
  const mapCss = asset("map/map.css", "map.css"), mapJs = asset("map/map.js", "map.js");
  const homeCss = asset("home/home.css", "home.css"), homeJs = asset("home/home.js", "home.js");
  const syncCss = asset("sync/sync.css", "sync.css"), syncJs = asset("sync/sync.js", "sync.js", "window.SQ_SYNC_CONFIG=" + safeJson(sync) + ";\n");

  const gameTpl = readFileSync(join(SRC, "game/game.html"), "utf8");
  for (const l of lessons) {
    const data = { id: l.id, title: l.title, words: l.words.map(({ topic, ...w }) => w), quiz: l.quiz, exercises: l.exercises, lint: l.lint };
    page("lessons/" + l.id + "/index.html", fill(gameTpl, {
      TITLE: esc("Spell Quest bài " + l.id), HEADING: esc("Bài " + l.id + " · " + l.title),
      CUE: l.words.some(w => w.img) ? "Nhìn hình" : "Đọc câu gợi ý",
      CSS: "../../" + gameCss, JS: "../../" + gameJs, SYNC_CSS: "../../" + syncCss, SYNC_JS: "../../" + syncJs, DATA: safeJson(data),
    }));
    const img = join(DATA, "images", l.base);
    if (existsSync(img)) cpSync(img, join(DIST, "lessons", String(l.id), "img"), { recursive: true });
  }

  const seen = new Set();
  const words = lessons.flatMap(l => l.words.map(w => ({ w: w.w, vi: w.vi, t: w.t, l: l.id, topic: w.topic, ex: String(w.ex || "").replace(/\[\[|\]\]/g, "") })))
    .filter(w => { const k = w.w.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const mapData = { lessons: lessons.map(l => ({ id: l.id, name: l.title, game: "../lessons/" + l.id + "/" })), topics, words, links: lessons.flatMap(l => l.links) };
  page("map/index.html", fill(readFileSync(join(SRC, "map/map.html"), "utf8"), { CSS: "../" + mapCss, JS: "../" + mapJs, SYNC_CSS: "../" + syncCss, SYNC_JS: "../" + syncJs, DATA: safeJson(mapData) }));
  page("index.html", renderHome(lessons, firstSeen.size, { CSS: homeCss, JS: homeJs, SYNC_CSS: syncCss, SYNC_JS: syncJs }));
  rep.summary = lessons.length + " bài, " + words.length + " từ trên bản đồ 3D, " + topics.length + " chủ đề";
  return rep;
}

export function report(rep) {
  rep.warnings.forEach(w => console.warn("Lưu ý: " + w));
  rep.errors.forEach(e => console.error("LỖI: " + e));
  if (rep.errors.length) console.error("\nChưa build vì có " + rep.errors.length + " lỗi. Website giữ nguyên bản cũ.");
  else if (rep.summary) console.log("Đã build: " + rep.summary);
  else console.log("Dữ liệu hợp lệ.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rep = process.argv.includes("--check") ? loadSite().rep : build();
  report(rep);
  process.exit(rep.errors.length ? 1 : 0);
}
