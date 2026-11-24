#!/usr/bin/env node
/* Trình chỉnh sửa dữ liệu bài học, chỉ chạy trên máy: npm run editor rồi mở http://localhost:4174.
   Đọc và ghi trực tiếp data/lessons/*.json, data/topics.json và ảnh trong data/images/. */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSite } from "../scripts/build.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const DATA = join(ROOT, "data");
const LESSONS = join(DATA, "lessons");
const IMAGES = join(DATA, "images");
const TOPICS = join(DATA, "topics.json");
const PUBLIC = join(ROOT, "editor", "public");
const PORT = Number(process.env.EDITOR_PORT) || 4174;
const HOST = "127.0.0.1";
const FILE_RE = /^(\d+)-[a-z0-9-]+\.json$/;
const IMG_RE = /^[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp|gif)$/i;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

/* Ghi JSON giống cách các file đang viết: mảng ngắn chỉ gồm chữ/số nằm trên một dòng. */
function formatJson(value, indent, width) {
  if (!width) return JSON.stringify(value, null, indent);
  const pad = " ".repeat(indent);
  const prim = v => v === null || typeof v !== "object";
  const go = (v, cur, keyLen) => {
    if (prim(v)) return JSON.stringify(v);
    const inner = cur + pad;
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      if (v.every(prim)) {
        const one = "[" + v.map(x => JSON.stringify(x)).join(", ") + "]";
        if (cur.length + keyLen + one.length <= width) return one;
      }
      return "[\n" + v.map(x => inner + go(x, inner, 0)).join(",\n") + "\n" + cur + "]";
    }
    const keys = Object.keys(v).filter(k => v[k] !== undefined);
    if (!keys.length) return "{}";
    return "{\n" + keys.map(k => { const kk = JSON.stringify(k) + ": "; return inner + kk + go(v[k], inner, kk.length); }).join(",\n") + "\n" + cur + "}";
  };
  return go(value, "", 0);
}

/* Đoán kiểu định dạng của file đang có để lần lưu sau không làm xáo trộn cả file trên git. */
function detectStyle(src) {
  const indent = ((src.match(/\n( +)\S/) || [])[1] || "  ").length;
  const eol = src.endsWith("\n");
  try {
    const v = JSON.parse(src);
    for (const width of [0, 80, 100, 120, 160]) if (formatJson(v, indent, width) + (eol ? "\n" : "") === src) return { indent, width, eol };
  } catch (e) {}
  return { indent, width: 100, eol: true };
}

const styles = new Map();
function readJson(path) {
  const src = readFileSync(path, "utf8");
  styles.set(path, detectStyle(src));
  return { data: JSON.parse(src), mtime: statSync(path).mtimeMs };
}
function writeJson(path, data) {
  const s = styles.get(path) || { indent: 2, width: 100, eol: true };
  writeFileSync(path, formatJson(data, s.indent, s.width) + (s.eol ? "\n" : ""));
  styles.set(path, s);
  return statSync(path).mtimeMs;
}

const lessonFiles = () => readdirSync(LESSONS).filter(f => FILE_RE.test(f)).sort();
const baseOf = f => f.replace(/\.json$/, "");
const listImages = base => { const d = join(IMAGES, base); return existsSync(d) ? readdirSync(d).filter(f => IMG_RE.test(f)).sort() : []; };

function overview() {
  const lessons = [], usage = {}, words = [];
  for (const file of lessonFiles()) {
    try {
      const l = JSON.parse(readFileSync(join(LESSONS, file), "utf8"));
      const list = Array.isArray(l.words) ? l.words : [];
      for (const w of list) {
        if (w && w.topic) usage[w.topic] = (usage[w.topic] || 0) + 1;
        if (w && typeof w.w === "string" && w.w) words.push({ w: w.w, l: l.id, file });
      }
      lessons.push({ file, id: l.id, title: l.title, words: list.length, quiz: (l.quiz || []).length, exercises: (l.exercises || []).length, topics: (l.topics || []).map(t => t.id) });
    } catch (e) { lessons.push({ file, broken: e.message }); }
  }
  let topics = [];
  try { topics = JSON.parse(readFileSync(TOPICS, "utf8")); } catch (e) {}
  return { lessons, topics, usage, words };
}

/* Chỉ giữ lỗi và lưu ý thuộc về file đang sửa. */
function check(draft, file) {
  const { rep } = loadSite(draft);
  if (!file) return rep;
  const pick = a => a.filter(m => m.startsWith(file + ": ")).map(m => m.slice(file.length + 2));
  return { errors: pick(rep.errors), warnings: pick(rep.warnings), others: rep.errors.filter(m => !m.startsWith(file + ": ")).length };
}

function body(req, limit = 25e6) {
  return new Promise((ok, bad) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { bad(Object.assign(new Error("Dữ liệu quá lớn"), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { ok(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { bad(Object.assign(new Error("JSON gửi lên không hợp lệ"), { code: 400 })); } });
    req.on("error", bad);
  });
}

const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const fail = (code, msg) => Object.assign(new Error(msg), { code });
const isObj = v => v && typeof v === "object" && !Array.isArray(v);

async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  if (m === "GET" && p === "/api/overview") return send(res, 200, overview());

  if (m === "GET" && p === "/api/lesson") {
    const file = url.searchParams.get("file") || "";
    if (!FILE_RE.test(file) || !existsSync(join(LESSONS, file))) throw fail(404, "Không thấy file " + file);
    const { data, mtime } = readJson(join(LESSONS, file));
    return send(res, 200, { file, data, mtime, images: listImages(baseOf(file)) });
  }
  if (m === "GET" && p === "/api/topics") { const { data, mtime } = readJson(TOPICS); return send(res, 200, { data, mtime }); }
  if (m === "GET" && p === "/api/template") return send(res, 200, JSON.parse(readFileSync(join(LESSONS, "_template.json"), "utf8")));

  if (m !== "POST") throw fail(404, "Không có đường dẫn này");
  const b = await body(req);

  if (p === "/api/check") {
    if (b.topics) { if (!Array.isArray(b.topics)) throw fail(400, "topics phải là mảng"); return send(res, 200, check({ topics: b.topics })); }
    if (!FILE_RE.test(b.file || "")) throw fail(400, "Tên file phải có dạng 06-ten-bai.json");
    return send(res, 200, check({ lessons: { [b.file]: b.data } }, b.file));
  }

  if (p === "/api/lesson") {
    const { file, data, mtime, create, force } = b;
    if (!FILE_RE.test(file || "")) throw fail(400, "Tên file phải có dạng 06-ten-bai.json (chữ thường, không dấu)");
    if (!isObj(data)) throw fail(400, "Nội dung bài phải là một object");
    const path = join(LESSONS, file);
    if (create) {
      if (existsSync(path)) throw fail(409, "File " + file + " đã có, chọn tên khác");
      const id = Number(file.match(FILE_RE)[1]);
      const dup = lessonFiles().find(f => Number(f.match(FILE_RE)[1]) === id);
      if (dup) throw fail(409, "Số bài " + id + " đã dùng cho " + dup);
      styles.set(path, { indent: 2, width: 100, eol: true });
    } else {
      if (!existsSync(path)) throw fail(404, "Không thấy file " + file);
      const disk = statSync(path).mtimeMs;
      if (!force && mtime && Math.abs(disk - mtime) > 1) throw fail(409, "File đã bị sửa ở nơi khác sau khi bạn mở. Tải lại hoặc lưu đè.");
      if (!styles.has(path)) styles.set(path, detectStyle(readFileSync(path, "utf8")));
    }
    const newMtime = writeJson(path, data);
    return send(res, 200, { ok: true, mtime: newMtime, report: check({}, file) });
  }

  if (p === "/api/topics") {
    if (!Array.isArray(b.data)) throw fail(400, "topics.json phải là một mảng");
    const disk = statSync(TOPICS).mtimeMs;
    if (!b.force && b.mtime && Math.abs(disk - b.mtime) > 1) throw fail(409, "topics.json đã bị sửa ở nơi khác sau khi bạn mở. Tải lại hoặc lưu đè.");
    if (!styles.has(TOPICS)) styles.set(TOPICS, detectStyle(readFileSync(TOPICS, "utf8")));
    const mtime = writeJson(TOPICS, b.data);
    return send(res, 200, { ok: true, mtime, report: check({}) });
  }

  if (p === "/api/image") {
    const { base, name, data, overwrite } = b;
    if (!/^\d+-[a-z0-9-]+$/.test(base || "")) throw fail(400, "Tên bài không hợp lệ");
    if (!IMG_RE.test(name || "")) throw fail(400, "Tên ảnh chỉ dùng chữ thường không dấu, số, dấu gạch, đuôi .jpg .png .webp .gif");
    const dir = join(IMAGES, base), path = join(dir, name);
    if (existsSync(path) && !overwrite) throw fail(409, "Ảnh " + name + " đã có");
    const buf = Buffer.from(String(data || ""), "base64");
    if (!buf.length) throw fail(400, "Ảnh rỗng");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, buf);
    return send(res, 200, { ok: true, img: "img/" + name, images: listImages(base) });
  }
  throw fail(404, "Không có đường dẫn này");
}

createServer(async (req, res) => {
  try {
    /* Chỉ nhận yêu cầu từ chính trang này, chặn trang web khác gửi lệnh ghi file vào máy. */
    const host = String(req.headers.host || "");
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) throw fail(403, "Host không hợp lệ");
    const url = new URL(req.url, "http://" + host);
    if (url.pathname.startsWith("/api/")) {
      if (req.method === "POST") {
        const origin = req.headers.origin;
        if (origin && origin !== "http://" + host) throw fail(403, "Origin không hợp lệ");
        if (!String(req.headers["content-type"] || "").startsWith("application/json")) throw fail(415, "Cần Content-Type application/json");
      }
      return await api(req, res, url);
    }
    let path;
    const im = url.pathname.match(/^\/images\/(\d+-[a-z0-9-]+)\/([^/]+)$/);
    if (im) { const name = decodeURIComponent(im[2]); if (!IMG_RE.test(name)) throw fail(404, "Không thấy"); path = join(IMAGES, im[1], name); }
    else {
      const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (!/^[a-z0-9-]+\.(html|css|js)$/.test(name)) throw fail(404, "Không thấy");
      path = join(PUBLIC, name);
    }
    if (!existsSync(path)) throw fail(404, "Không thấy");
    res.writeHead(200, { "Content-Type": TYPES[extname(path).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(readFileSync(path));
  } catch (e) {
    if (!e.code || typeof e.code !== "number") console.error(e);
    send(res, typeof e.code === "number" ? e.code : 500, { error: e.message });
  }
}).listen(PORT, HOST, () => console.log("Trình chỉnh sửa: http://localhost:" + PORT + "  (Ctrl+C để tắt)"));
