/* Trình chỉnh sửa dữ liệu Spell Quest. Không dùng thư viện, chạy cùng editor/server.mjs. */
"use strict";

const $ = s => document.querySelector(s);
const S = { ov: null, doc: null, tab: "words", check: null, bad: new Set(), collapsed: new WeakSet(), filter: "" };

const WORD_ORDER = ["w", "ipa", "t", "vi", "topic", "q", "img", "h", "ex"];
const QUIZ_ORDER = ["tag", "q", "vi", "o", "why", "rule"];
const TOPIC_ORDER = ["id", "vi", "en"];
const LINT_ORDER = ["pattern", "flags", "message"];
const LESSON_ORDER = ["$schema", "id", "title", "topics", "words", "quiz", "exercises", "lint", "links"];
const EX_COMMON = ["id", "type", "wide", "en", "vi"];
const DEFAULT_TYPES = ["danh từ", "danh từ số nhiều", "cụm danh từ", "động từ", "cụm động từ", "tính từ", "trạng từ", "giới từ", "thán từ"];

const EX_TYPES = {
  type:     { name: "Gõ đáp án", help: "items: [{ p: đề, vi?, img?, a: [các đáp án đúng], hint?, ex?: true (câu mẫu) }]", skel: { items: [{ p: "", a: [""] }] } },
  fill:     { name: "Điền từ trong khung vào đoạn văn", help: "box: [các từ trong khung], parts: [\"chữ\", { a: \"đáp án\" }, \"chữ\" …], why?: { đáp án: giải thích }", skel: { box: [], parts: ["", { a: "" }, ""] } },
  sentence: { name: "Viết câu sinh / mất", help: "items: [{ n: tên người, b: năm sinh, d: năm mất, ex?: true }]", skel: { items: [{ n: "", b: 1900, d: 2000 }] } },
  choose:   { name: "Chọn từ trong danh sách", help: "choices: [các lựa chọn], items: [{ p: đề có ___, a: \"đáp án\", why? }]", skel: { choices: [""], items: [{ p: "___", a: "" }] } },
  cross:    { name: "Ô chữ", help: "rows, cols: kích thước; items: [{ n: số, dir: \"a\" (ngang) hoặc \"d\" (dọc), r: hàng, c: cột (từ 0), a: đáp án, pic?, hint? }]", skel: { rows: 6, cols: 6, items: [{ n: 1, dir: "a", r: 0, c: 0, a: "", pic: "" }] } },
  free:     { name: "Viết tự do", help: "example?, lines: số dòng, frames: [khung câu], model: [câu mẫu], note?", skel: { lines: 3, frames: [], model: [], note: "" } },
  gaps:     { name: "Điền vào chỗ trống trong câu", help: "items: [{ t: [\"chữ\", { p?: chữ đầu, s?: chữ cuối, a: [đáp án], hint? }, \"chữ\" …] }]", skel: { items: [{ t: ["", { a: [""] }, ""] }] } },
};

/* ---------- Tiện ích ---------- */

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const pad2 = n => String(n).padStart(2, "0");
const clone = v => JSON.parse(JSON.stringify(v));

/* Giống cách viết trong file: mảng ngắn chỉ gồm chữ/số nằm trên một dòng, dễ đọc hơn trong ô JSON. */
function pretty(value, width = 90) {
  const prim = v => v === null || typeof v !== "object";
  const go = (v, cur, keyLen) => {
    if (prim(v)) return JSON.stringify(v);
    const inner = cur + "  ";
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      if (v.every(prim)) { const one = "[" + v.map(x => JSON.stringify(x)).join(", ") + "]"; if (cur.length + keyLen + one.length <= width) return one; }
      return "[\n" + v.map(x => inner + go(x, inner, 0)).join(",\n") + "\n" + cur + "]";
    }
    const keys = Object.keys(v).filter(k => v[k] !== undefined);
    if (!keys.length) return "{}";
    const one = "{ " + keys.map(k => JSON.stringify(k) + ": " + JSON.stringify(v[k])).join(", ") + " }";
    if (keys.every(k => prim(v[k]) || (Array.isArray(v[k]) && v[k].every(prim))) && cur.length + keyLen + one.length <= width) return one;
    return "{\n" + keys.map(k => { const kk = JSON.stringify(k) + ": "; return inner + kk + go(v[k], inner, kk.length); }).join(",\n") + "\n" + cur + "}";
  };
  return go(value, "", 0);
}

/* Đặt giá trị nhưng giữ thứ tự khoá quen thuộc, để file JSON đọc giống bản viết tay. Giá trị rỗng thì xoá khoá. */
function setKey(obj, key, val, order) {
  if (val === undefined || val === "" || (typeof val === "number" && Number.isNaN(val))) { delete obj[key]; return; }
  if (key in obj || !order) { obj[key] = val; return; }
  const idx = order.indexOf(key);
  const entries = Object.entries(obj);
  let at = entries.length;
  if (idx >= 0) { const j = entries.findIndex(([k]) => order.indexOf(k) > idx); if (j >= 0) at = j; }
  entries.splice(at, 0, [key, val]);
  for (const k of Object.keys(obj)) delete obj[k];
  for (const [k, v] of entries) obj[k] = v;
}
function replaceContent(obj, entries) {
  for (const k of Object.keys(obj)) delete obj[k];
  for (const [k, v] of entries) obj[k] = v;
}
function arr(obj, key, order) {
  if (!Array.isArray(obj[key])) setKey(obj, key, [], order);
  return obj[key];
}

async function api(path, data) {
  const opt = data === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
  const res = await fetch(path, opt);
  const json = await res.json().catch(() => ({ error: "Máy chủ trả lời không hợp lệ" }));
  if (!res.ok) throw Object.assign(new Error(json.error || res.statusText), { status: res.status });
  return json;
}

let toastTimer;
function toast(msg, kind = "") {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast show " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 2600);
}

/* ---------- Trạng thái tài liệu ---------- */

function changed() {
  if (!S.doc) return;
  S.doc.dirty = true;
  updateStatus();
  scheduleCheck();
  updateTabCounts();
}

function updateStatus() {
  const d = S.doc, st = $("#status");
  $("#btnSave").disabled = !d;
  $("#btnCheck").disabled = !d;
  if (!d) { st.textContent = ""; $("#docTitle").textContent = ""; $("#preview").hidden = true; return; }
  if (d.sample) {
    $("#btnSave").disabled = true; $("#btnCheck").disabled = true; $("#preview").hidden = true;
    st.textContent = "Chỉ xem"; st.className = "status";
    document.title = "Bài mẫu · Spell Quest";
    $("#docTitle").textContent = "Bài mẫu (ghép từ các bài có sẵn)";
    return;
  }
  st.textContent = d.isNew ? "Bài mới, chưa lưu" : d.dirty ? "● Chưa lưu" : "Đã lưu";
  st.className = "status " + (d.dirty || d.isNew ? "dirty" : "saved");
  document.title = (d.dirty ? "● " : "") + (d.kind === "topics" ? "topics.json" : d.file) + " · Spell Quest";
  $("#docTitle").textContent = d.kind === "topics" ? "data/topics.json" : "data/lessons/" + d.file;
  const pv = $("#preview");
  if (d.kind === "lesson" && !d.isNew && Number.isInteger(d.data.id)) { pv.hidden = false; pv.href = "http://localhost:4173/lessons/" + d.data.id + "/"; pv.title = "Cần đang chạy npm run dev"; }
  else pv.hidden = true;
}

function confirmLeave() {
  return !S.doc || !S.doc.dirty || confirm("Bạn chưa lưu thay đổi. Bỏ thay đổi và tiếp tục?");
}

window.addEventListener("beforeunload", e => { if (S.doc && S.doc.dirty) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- Danh sách bên trái ---------- */

async function loadOverview() {
  S.ov = await api("/api/overview");
  renderSide();
  fillDatalists();
}

function renderSide() {
  const cur = S.doc && S.doc.kind === "lesson" ? S.doc.file : null;
  const items = S.ov.lessons.map(l => h("a", { class: "side-item" + (l.file === cur ? " active" : ""), href: "#/lesson/" + l.file },
    h("span", { class: "num" }, l.broken ? "!" : pad2(l.id)),
    h("span", { class: "nm" }, h("b", {}, l.broken ? l.file : l.title || "(chưa có tên)"),
      h("small", {}, l.broken ? "JSON lỗi: " + l.broken : l.words + " từ · " + l.quiz + " trắc nghiệm · " + l.exercises + " bài tập"))));
  if (S.doc && S.doc.isNew) items.push(h("a", { class: "side-item active", href: "#/new" }, h("span", { class: "num" }, "＋"), h("span", { class: "nm" }, h("b", {}, S.doc.data.title || "Bài mới"), h("small", {}, S.doc.file + " · chưa lưu"))));
  $("#lessonList").replaceChildren(...items);
  $("#globalList").replaceChildren(h("a", { class: "side-item" + (S.doc && S.doc.kind === "topics" ? " active" : ""), href: "#/topics" },
    h("span", { class: "num" }, "◎"), h("span", { class: "nm" }, h("b", {}, "Chủ đề bản đồ 3D"), h("small", {}, "topics.json · " + S.ov.topics.length + " chủ đề"))));
  $("#refList").replaceChildren(h("a", { class: "side-item sample-item" + (S.doc && S.doc.sample ? " active" : ""), href: "#/sample" },
    h("span", { class: "num" }, "💡"), h("span", { class: "nm" }, h("b", {}, "Bài mẫu đầy đủ"), h("small", {}, "Đủ mọi phần · 7 dạng bài tập"))));
}

function fillDatalists() {
  const types = new Set(DEFAULT_TYPES);
  const words = new Map();
  for (const w of S.ov.words) words.set(w.w.toLowerCase(), w);
  if (S.doc && S.doc.kind === "lesson") for (const w of S.doc.data.words || []) {
    if (w.t) types.add(w.t);
    if (w.w) words.set(w.w.toLowerCase(), { w: w.w, l: S.doc.data.id });
  }
  $("#dl-types").replaceChildren(...[...types].map(t => h("option", { value: t })));
  $("#dl-words").replaceChildren(...[...words.values()].map(w => h("option", { value: w.w }, "Bài " + w.l)));
  const imgs = S.doc && S.doc.images ? S.doc.images : [];
  $("#dl-images").replaceChildren(...imgs.map(f => h("option", { value: "img/" + f })));
}

/* ---------- Mở tài liệu ---------- */

async function route() {
  const m = location.hash.match(/^#\/(lesson|topics|new|sample)(?:\/([^/]+))?(?:\/(\w+))?/);
  if (!m) { if (S.ov.lessons[0]) location.replace("#/lesson/" + S.ov.lessons[0].file); return; }
  let [, kind, file, tab] = m;
  if (kind === "sample" && !tab && file && LESSON_TABS.some(t => t[0] === file)) { tab = file; file = undefined; }
  const same = S.doc && ((kind === "topics" && S.doc.kind === "topics") || (kind === "lesson" && S.doc.file === file && !S.doc.isNew) || (kind === "new" && S.doc.isNew) || (kind === "sample" && S.doc.sample));
  if (same) { if (tab && tab !== S.tab) { S.tab = tab; render(); } return; }
  if (kind === "new") { if (!S.doc || !S.doc.isNew) location.replace("#/lesson/" + (S.ov.lessons[0] || {}).file); return; }
  if (!confirmLeave()) { history.replaceState(null, "", S.doc.hashBase + "/" + S.tab); return; }
  try {
    if (kind === "sample") {
      const r = await api("/api/sample");
      S.doc = { kind: "lesson", sample: true, file: "99-bai-mau.json", base: r.base, data: r.lesson, sources: r.sources, images: r.images, mtime: 0, dirty: false, hashBase: "#/sample" };
      S.tab = LESSON_TABS.some(t => t[0] === tab) ? tab : "words";
    } else if (kind === "topics") {
      const r = await api("/api/topics");
      S.doc = { kind: "topics", data: r.data, mtime: r.mtime, dirty: false, hashBase: "#/topics" };
      S.tab = tab === "json" ? "json" : "topics";
    } else {
      const keep = S.doc && S.doc.kind === "lesson" && LESSON_TABS.some(t => t[0] === S.tab);
      const r = await api("/api/lesson?file=" + encodeURIComponent(file));
      S.doc = { kind: "lesson", file: r.file, base: r.file.replace(/\.json$/, ""), data: r.data, mtime: r.mtime, images: r.images, dirty: false, hashBase: "#/lesson/" + r.file };
      S.tab = tab || (keep ? S.tab : "words");
    }
  } catch (e) { toast(e.message, "err"); return; }
  S.bad.clear(); S.check = null; S.filter = "";
  renderSide(); fillDatalists(); render(); updateStatus(); runCheck();
}

window.addEventListener("hashchange", route);

/* ---------- Tabs ---------- */

const LESSON_TABS = [
  ["info", "Thông tin", null],
  ["words", "Từ vựng", "words"],
  ["quiz", "Trắc nghiệm", "quiz"],
  ["exercises", "Bài tập", "exercises"],
  ["topics", "Chủ đề mới", "topics"],
  ["links", "Liên kết", "links"],
  ["lint", "Dò lỗi", "lint"],
  ["json", "JSON", null],
];

function setTab(tab) {
  S.tab = tab;
  history.replaceState(null, "", S.doc.hashBase + "/" + tab);
  render();
}

function renderTabs() {
  const d = S.doc;
  const tabs = d.kind === "topics" ? [["topics", "Chủ đề", null], ["json", "JSON", null]] : LESSON_TABS;
  $("#tabs").replaceChildren(...tabs.map(([id, name, key]) => h("button", { class: "tab" + (S.tab === id ? " active" : ""), "data-tab": id, onclick: () => setTab(id) },
    name, key ? h("span", { class: "count", "data-count": key }) : null,
    h("span", { class: "dot", "data-dot": id }))));
  updateTabCounts();
}

function updateTabCounts() {
  if (!S.doc) return;
  const data = S.doc.data;
  for (const el of document.querySelectorAll("[data-count]")) {
    const v = S.doc.kind === "topics" ? data : data[el.dataset.count];
    el.textContent = Array.isArray(v) ? v.length : 0;
  }
}

/* ---------- Ô nhập ---------- */

function field(obj, key, o = {}) {
  let input;
  const cur = obj[key];
  const common = { placeholder: o.placeholder || "", list: o.list, class: o.mono ? "mono" : "", spellcheck: o.spell === false ? "false" : undefined };
  if (o.kind === "textarea") input = h("textarea", { ...common, rows: o.rows || 2 });
  else if (o.kind === "select") {
    input = h("select", {}, h("option", { value: "" }, o.placeholder || "— chọn —"),
      o.options.map(([v, label]) => h("option", { value: v }, label)));
    if (cur !== undefined && cur !== "" && !o.options.some(([v]) => v === cur)) input.append(h("option", { value: cur }, cur + " (chưa có)"));
  } else input = h("input", { ...common, type: o.num ? "number" : "text", step: o.step });
  input.value = cur === undefined || cur === null ? "" : cur;
  const onInput = () => {
    let v = input.value;
    if (o.num) v = v === "" ? undefined : Number(v);
    if (o.parse) v = o.parse(v);
    setKey(obj, key, v, o.order);
    changed();
    if (o.onChange) o.onChange(v);
    input.classList.toggle("missing", !!o.req && (v === undefined || v === ""));
  };
  input.addEventListener(o.kind === "select" ? "change" : "input", onInput);
  if (o.req && (cur === undefined || cur === "")) input.classList.add("missing");
  return h("label", { class: "f" + (o.wide ? " wide" : "") + (o.cls ? " " + o.cls : "") },
    h("span", { class: "lab" }, o.label, o.req ? h("b", { class: "req", title: "Bắt buộc" }, "*") : null),
    input, o.hint ? h("small", {}, o.hint) : null);
}

function checkbox(obj, key, label, order) {
  const input = h("input", { type: "checkbox", checked: !!obj[key] });
  input.addEventListener("change", () => { setKey(obj, key, input.checked ? true : undefined, order); changed(); });
  return h("label", { class: "check" }, input, " ", label);
}

function stringList(obj, key, o = {}) {
  const list = Array.isArray(obj[key]) ? obj[key] : [];
  const box = h("div", { class: "slist" });
  const draw = () => {
    box.replaceChildren(...list.map((v, i) => {
      const input = h("input", { value: v, placeholder: (typeof o.placeholder === "function" ? o.placeholder(i) : o.placeholder) || "", list: o.list });
      input.addEventListener("input", () => { list[i] = input.value; changed(); });
      return h("div", { class: "srow" + (o.firstCorrect && i === 0 ? " correct" : "") },
        o.firstCorrect ? (i === 0 ? h("span", { class: "badge ok", title: "Đáp án đúng luôn đứng đầu" }, "Đúng")
          : h("button", { class: "icon", type: "button", title: "Đặt làm đáp án đúng", onclick: () => { list.unshift(...list.splice(i, 1)); changed(); draw(); } }, "✓")) : null,
        input,
        h("button", { class: "icon", type: "button", title: "Xoá", onclick: () => { list.splice(i, 1); changed(); draw(); } }, "✕"));
    }), h("button", { class: "btn small ghost", type: "button", onclick: () => {
      if (!Array.isArray(obj[key])) setKey(obj, key, list, o.order);
      list.push(""); changed(); draw(); box.querySelectorAll("input")[list.length - 1].focus();
    } }, "＋ " + (o.addLabel || "Thêm")));
  };
  draw();
  return h("div", { class: "f wide" }, h("span", { class: "lab" }, o.label, o.req ? h("b", { class: "req" }, "*") : null), box, o.hint ? h("small", {}, o.hint) : null);
}

function imgSrc(v) {
  const m = String(v || "").match(/^img\/([^/]+)$/);
  return m && S.doc.images.includes(m[1]) ? "/images/" + S.doc.base + "/" + encodeURIComponent(m[1]) + "?t=" + (S.doc.imgStamp || 0) : null;
}

async function uploadImage(suggest) {
  const pick = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/gif" });
  const file = await new Promise(ok => { pick.addEventListener("change", () => ok(pick.files[0])); pick.click(); });
  if (!file) return null;
  const ext = (file.name.match(/\.(jpe?g|png|webp|gif)$/i) || [, "jpg"])[1].toLowerCase().replace("jpeg", "jpg");
  let name = prompt("Tên file ảnh (lưu vào data/images/" + S.doc.base + "/):", (slug(suggest) || slug(file.name.replace(/\.\w+$/, "")) || "anh") + "." + ext);
  if (!name) return null;
  name = name.trim().toLowerCase();
  const data = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = bad; r.readAsDataURL(file); });
  const send = overwrite => api("/api/image", { base: S.doc.base, name, data, overwrite });
  let r;
  try { r = await send(false); }
  catch (e) {
    if (e.status !== 409 || !confirm(e.message + ". Ghi đè ảnh cũ?")) { toast(e.message, "err"); return null; }
    r = await send(true);
  }
  S.doc.images = r.images; S.doc.imgStamp = Date.now();
  fillDatalists();
  toast("Đã lưu ảnh " + name);
  return r.img;
}

function imageField(obj, key, o = {}) {
  const thumb = h("div", { class: "thumb" });
  const input = h("input", { value: obj[key] || "", list: "dl-images", placeholder: "img/ten-anh.jpg" });
  const draw = () => {
    const src = imgSrc(obj[key]);
    thumb.replaceChildren(src ? h("img", { src, alt: "" }) : h("span", {}, obj[key] ? "Không thấy ảnh" : "Chưa có ảnh"));
    thumb.classList.toggle("bad", !!obj[key] && !src);
  };
  input.addEventListener("input", () => { setKey(obj, key, input.value.trim(), o.order); changed(); draw(); if (o.onChange) o.onChange(); });
  const up = h("button", { class: "btn small ghost", type: "button", onclick: async () => {
    const img = await uploadImage(o.suggest ? o.suggest() : "");
    if (img) { input.value = img; setKey(obj, key, img, o.order); changed(); draw(); if (o.onChange) o.onChange(); }
  } }, "Tải ảnh lên");
  draw();
  return h("div", { class: "f img-field" + (o.wide ? " wide" : "") }, h("span", { class: "lab" }, o.label || "Ảnh"),
    h("div", { class: "img-row" }, thumb, h("div", { class: "img-ctl" }, input, up)), o.hint ? h("small", {}, o.hint) : null);
}

/* ---------- Bài mẫu ---------- */

/* Liên kết mở bài mẫu (đúng tab đang xem) ở thẻ trình duyệt khác, để không rời bài đang sửa. */
function sampleLink(tab) {
  if (S.doc && S.doc.sample) return null;
  return h("a", { class: "sample-link", href: "#/sample/" + tab, target: "_blank", rel: "noopener", title: "Mở bài mẫu ở thẻ mới" }, "💡 Xem ví dụ mẫu ↗");
}

const SAMPLE_NOTES = {
  info: "Mỗi bài cần số bài (trùng số đầu tên file) và tên bài. Các phần còn lại nằm ở các tab bên trên.",
  words: "Hai kiểu thẻ từ: từ #1 dùng câu gợi ý (q), từ #2 dùng ảnh (img). Mỗi từ cần ít nhất một trong hai.",
  quiz: "Đáp án đúng luôn đứng đầu danh sách, trò chơi tự trộn thứ tự khi hiện ra.",
  exercises: "Đủ 7 dạng bài tập, mỗi dạng một bài. Phần nội dung (JSON) của mỗi dạng có cấu trúc khác nhau, xem dòng hướng dẫn phía trên ô JSON.",
  topics: "Chủ đề này là mẫu tự đặt. Chỉ khai báo ở đây khi bài cần chủ đề chưa có trong topics.json.",
  links: "Mỗi dòng nối hai từ liên quan trên bản đồ 3D.",
  lint: "Ô Thử vẫn gõ được: thử gõ một câu sai để xem quy tắc bắt lỗi thế nào.",
  json: "Toàn bộ bài mẫu đúng như khi ghi ra file data/lessons/*.json.",
};

function sampleBanner() {
  const src = (S.doc.sources || {})[S.tab] || [];
  return h("div", { class: "sample-banner" },
    h("div", {}, h("b", {}, "Bài mẫu, chỉ để xem."), " " + (SAMPLE_NOTES[S.tab] || "")),
    src.length ? h("small", { class: "muted" }, "Ví dụ ở tab này lấy từ: " + src.join(", ") + ".") : null);
}

/* Khoá mọi ô nhập của bài mẫu, trừ ô có class keep-edit (ô lọc, ô thử quy tắc). */
function lockView(view) {
  for (const el of view.querySelectorAll("input, textarea")) {
    if (el.classList.contains("keep-edit")) continue;
    if (["checkbox", "color", "file"].includes(el.type)) el.disabled = true; else { el.readOnly = true; el.placeholder = ""; }
  }
  for (const el of view.querySelectorAll("select")) el.disabled = true;
}

/* ---------- Danh sách thẻ ---------- */

function listEditor(list, o) {
  const wrap = h("div", { class: "cards" });
  const rerender = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };
  list.forEach((item, i) => {
    const title = h("span", { class: "card-title" });
    const setTitle = () => title.replaceChildren(...[].concat(o.title(item, i)).filter(x => x !== null && x !== undefined && x !== false));
    setTitle();
    const collapsed = S.collapsed.has(item);
    const body = h("div", { class: "card-body" }, o.body(item, i, setTitle));
    const card = h("div", { class: "card" + (collapsed ? " collapsed" : ""), id: o.prefix + "-" + i, "data-search": o.search ? o.search(item) : "" },
      h("div", { class: "card-head" },
        h("button", { class: "icon fold", type: "button", title: "Thu gọn / mở", onclick: () => { if (S.collapsed.has(item)) S.collapsed.delete(item); else S.collapsed.add(item); card.classList.toggle("collapsed"); } }, "▾"),
        h("span", { class: "idx" }, "#" + (i + 1)), title,
        h("span", { class: "card-tools" },
          h("button", { class: "icon", type: "button", title: "Lên", disabled: i === 0, onclick: () => { list.splice(i - 1, 0, ...list.splice(i, 1)); changed(); rerender(); } }, "↑"),
          h("button", { class: "icon", type: "button", title: "Xuống", disabled: i === list.length - 1, onclick: () => { list.splice(i + 1, 0, ...list.splice(i, 1)); changed(); rerender(); } }, "↓"),
          h("button", { class: "icon", type: "button", title: "Nhân bản", onclick: () => { list.splice(i + 1, 0, clone(item)); changed(); rerender(); } }, "⧉"),
          h("button", { class: "icon danger", type: "button", title: "Xoá", onclick: () => { if (confirm("Xoá " + o.noun + " #" + (i + 1) + "?")) { list.splice(i, 1); changed(); rerender(); } } }, "✕"))),
      body);
    wrap.append(card);
  });
  const add = h("button", { class: "btn add", type: "button", onclick: async () => {
    const item = await o.make();
    if (!item) return;
    list.push(item); changed(); render();
    const el = document.getElementById(o.prefix + "-" + (list.length - 1));
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); const f = el.querySelector("input,textarea,select"); if (f) f.focus({ preventScroll: true }); }
  } }, "＋ Thêm " + o.noun);
  return h("div", {}, wrap, list.length ? null : h("p", { class: "muted" }, "Chưa có " + o.noun + " nào."), add);
}

function toolbar(...kids) { return h("div", { class: "toolbar" }, ...kids); }

function foldAll(list, fold) {
  for (const it of list) fold ? S.collapsed.add(it) : S.collapsed.delete(it);
  render();
}

/* ---------- Các tab của bài học ---------- */

function topicOptions() {
  const out = S.ov.topics.map(t => [t.id, t.id + " · " + t.vi]);
  for (const t of S.doc.data.topics || []) if (t && t.id && !out.some(([v]) => v === t.id)) out.push([t.id, t.id + " · " + (t.vi || "") + " (chủ đề mới của bài)"]);
  return out;
}

function tabInfo() {
  const d = S.doc.data;
  const n = k => (Array.isArray(d[k]) ? d[k].length : 0);
  const gallery = h("div", { class: "gallery" }, (S.doc.images || []).map(f => {
    const used = (d.words || []).some(w => w.img === "img/" + f) || JSON.stringify(d.exercises || []).includes('"img/' + f + '"');
    return h("figure", { class: used ? "" : "unused", title: used ? "" : "Chưa dùng trong bài" }, h("img", { src: "/images/" + S.doc.base + "/" + encodeURIComponent(f) + "?t=" + (S.doc.imgStamp || 0), alt: f, loading: "lazy" }), h("figcaption", {}, f));
  }));
  return h("div", { class: "stack" },
    h("div", { class: "panel" },
      h("h3", {}, "Thông tin bài"),
      h("div", { class: "grid" },
        field(d, "id", { label: "Số bài", num: true, req: true, order: LESSON_ORDER, hint: "Phải trùng số đầu tên file (" + S.doc.file + ")." , onChange: updateStatus }),
        field(d, "title", { label: "Tên bài", req: true, order: LESSON_ORDER, cls: "span2", onChange: () => { if (S.doc.isNew) renderSide(); } })),
      h("div", { class: "stats" },
        [["words", "từ vựng"], ["quiz", "câu trắc nghiệm"], ["exercises", "bài tập"], ["topics", "chủ đề mới"], ["links", "liên kết"], ["lint", "quy tắc dò lỗi"]]
          .map(([k, label]) => h("button", { class: "stat", type: "button", onclick: () => setTab(k) }, h("b", {}, n(k)), h("span", {}, label))))),
    h("div", { class: "panel" },
      h("div", { class: "panel-head" }, h("h3", {}, "Ảnh của bài"), h("button", { class: "btn small ghost", type: "button", onclick: async () => { if (await uploadImage("")) render(); } }, "Tải ảnh lên")),
      h("p", { class: "muted" }, "Thư mục data/images/" + S.doc.base + "/. Ảnh mờ là ảnh chưa dùng trong bài."),
      S.doc.images.length ? gallery : h("p", { class: "muted" }, "Bài này chưa có ảnh.")));
}

function tabWords() {
  const d = S.doc.data;
  const list = arr(d, "words", LESSON_ORDER);
  const opts = topicOptions();
  const search = h("input", { class: "search keep-edit", type: "search", placeholder: "Lọc theo từ hoặc nghĩa…", value: S.filter });
  const applyFilter = () => {
    const q = slug(search.value);
    S.filter = search.value;
    for (const c of document.querySelectorAll(".cards > .card")) c.hidden = !!q && !c.dataset.search.includes(q);
  };
  search.addEventListener("input", applyFilter);
  const ed = listEditor(list, {
    prefix: "words", noun: "từ",
    search: w => slug([w.w, w.vi, w.topic].join(" ")),
    title: w => [h("b", {}, w.w || "(chưa có từ)"), w.vi ? h("span", { class: "muted" }, " — " + w.vi) : null, w.topic ? h("span", { class: "tag" }, w.topic) : null,
      w.img ? h("span", { class: "tag img" }, "ảnh") : null],
    body: (w, i, setTitle) => {
      const upd = () => { setTitle(); const c = document.getElementById("words-" + i); if (c) c.dataset.search = slug([w.w, w.vi, w.topic].join(" ")); };
      return h("div", { class: "grid" },
        field(w, "w", { label: "Từ tiếng Anh", req: true, order: WORD_ORDER, onChange: upd, spell: false, placeholder: "Ví dụ: honeymoon", hint: "Chỉ chữ cái, dấu cách, gạch nối, nháy đơn." }),
        field(w, "ipa", { label: "Phiên âm", order: WORD_ORDER, mono: true, spell: false, placeholder: "ˈhʌnimuːn", hint: "Anh-Anh, không có dấu /." }),
        field(w, "t", { label: "Loại từ", req: true, order: WORD_ORDER, list: "dl-types", placeholder: "Ví dụ: danh từ" }),
        field(w, "vi", { label: "Nghĩa tiếng Việt", req: true, order: WORD_ORDER, onChange: upd, placeholder: "Ví dụ: tuần trăng mật" }),
        field(w, "topic", { label: "Chủ đề", req: true, kind: "select", options: opts, order: WORD_ORDER, onChange: upd }),
        field(w, "h", { label: "Gợi ý ngắn khi có ảnh", order: WORD_ORDER, cls: "span2", placeholder: "Ví dụ: đội trên đầu khi trời nắng" }),
        field(w, "q", { label: "Câu gợi ý (q)", kind: "textarea", wide: true, order: WORD_ORDER, placeholder: "Ví dụ: Cưới xong, hai vợ chồng đi Đà Lạt một tuần để nghỉ ngơi bên nhau. Chuyến đi ngay sau đám cưới ấy gọi là gì?", hint: "Cần có câu gợi ý hoặc ảnh." }),
        imageField(w, "img", { order: WORD_ORDER, wide: true, suggest: () => w.w, onChange: upd }),
        field(w, "ex", { label: "Câu ví dụ", kind: "textarea", wide: true, order: WORD_ORDER, placeholder: "Ví dụ: They went to Paris on their ___.", hint: "Chỗ trống viết ___, phần tô vàng đánh dấu [[…]]." }));
    },
    make: () => ({}),
  });
  setTimeout(applyFilter);
  return h("div", {}, toolbar(search, h("span", { class: "grow" }), sampleLink("words"),
    h("button", { class: "btn small ghost", type: "button", onclick: () => foldAll(list, true) }, "Thu gọn tất cả"),
    h("button", { class: "btn small ghost", type: "button", onclick: () => foldAll(list, false) }, "Mở tất cả")), ed);
}

function tabQuiz() {
  const list = arr(S.doc.data, "quiz", LESSON_ORDER);
  return h("div", {}, S.doc.sample ? null : toolbar(h("span", { class: "grow" }), sampleLink("quiz")), listEditor(list, {
    prefix: "quiz", noun: "câu trắc nghiệm",
    title: q => [q.tag ? h("span", { class: "tag" }, q.tag) : null, " ", h("b", {}, q.q || "(chưa có câu hỏi)")],
    body: (q, i, setTitle) => h("div", { class: "grid" },
      field(q, "tag", { label: "Nhãn lỗi", order: QUIZ_ORDER, onChange: setTitle, placeholder: "Ví dụ: good at" }),
      field(q, "q", { label: "Câu hỏi", req: true, order: QUIZ_ORDER, cls: "span2", onChange: setTitle, placeholder: "Ví dụ: She is good ___ English.", hint: "Chỗ trống viết ___." }),
      field(q, "vi", { label: "Dịch tiếng Việt", order: QUIZ_ORDER, wide: true, placeholder: "Ví dụ: Cô ấy giỏi tiếng Anh." }),
      stringList(q, "o", { label: "Đáp án", req: true, firstCorrect: true, placeholder: i => i === 0 ? "Đáp án đúng, ví dụ: at" : "Đáp án sai, ví dụ: " + (["in", "on", "for"][i - 1] || "with"), order: QUIZ_ORDER, addLabel: "Thêm đáp án", hint: "Đáp án đúng luôn đứng đầu, trò chơi tự trộn. Cần ít nhất 2 đáp án." }),
      field(q, "why", { label: "Giải thích", req: true, kind: "textarea", wide: true, order: QUIZ_ORDER, placeholder: "Ví dụ: Sau good dùng giới từ at để nói về khả năng." }),
      field(q, "rule", { label: "Quy tắc ghi nhớ", req: true, wide: true, order: QUIZ_ORDER, placeholder: "Ví dụ: good at + môn học hoặc kỹ năng." })),
    make: () => ({ q: "", o: ["", "", "", ""] }),
  }));
}

function exerciseBody(ex, i, setTitle) {
  const key = "ex-" + i;
  const restOf = () => Object.fromEntries(Object.entries(ex).filter(([k]) => !EX_COMMON.includes(k)));
  const ta = h("textarea", { class: "mono json", rows: 8, spellcheck: "false" });
  ta.value = pretty(restOf());
  const msg = h("small", { class: "json-msg" });
  const help = h("small", { class: "type-help" });
  const drawHelp = () => { const t = EX_TYPES[ex.type]; help.textContent = t ? t.name + ". " + t.help : "Chọn dạng bài tập."; };
  drawHelp();
  ta.addEventListener("input", () => {
    let rest;
    try { rest = JSON.parse(ta.value || "{}"); if (!isObj(rest)) throw new Error("phải là một object { … }"); }
    catch (e) { S.bad.add(key); ta.classList.add("invalid"); msg.textContent = "JSON chưa đúng: " + e.message; return; }
    S.bad.delete(key); ta.classList.remove("invalid"); msg.textContent = "";
    const entries = [];
    for (const k of Object.keys(ex)) { if (EX_COMMON.includes(k)) entries.push([k, ex[k]]); else if (k in rest) entries.push([k, rest[k]]); }
    for (const k of Object.keys(rest)) if (!EX_COMMON.includes(k) && !(k in ex)) entries.push([k, rest[k]]);
    replaceContent(ex, entries);
    changed();
  });
  const fmtBtn = h("button", { class: "btn small ghost", type: "button", onclick: () => { if (!S.bad.has(key)) ta.value = pretty(restOf()); } }, "Định dạng lại");
  return h("div", { class: "grid" },
    field(ex, "id", { label: "Số bài tập", req: true, order: EX_COMMON, onChange: setTitle, placeholder: "6.1" }),
    field(ex, "type", { label: "Dạng", req: true, kind: "select", options: Object.entries(EX_TYPES).map(([k, t]) => [k, k + " · " + t.name]), order: EX_COMMON, onChange: () => { setTitle(); drawHelp(); } }),
    h("div", { class: "f" }, h("span", { class: "lab" }, "Hiển thị"), checkbox(ex, "wide", "Ô nhập rộng (wide)", EX_COMMON)),
    field(ex, "en", { label: "Đề bài tiếng Anh", wide: true, order: EX_COMMON, onChange: setTitle, placeholder: "Ví dụ: Complete the sentences with words from the box." }),
    field(ex, "vi", { label: "Đề bài tiếng Việt", wide: true, order: EX_COMMON, placeholder: "Ví dụ: Hoàn thành các câu bằng từ trong khung." }),
    h("div", { class: "f wide" }, h("span", { class: "lab" }, "Nội dung bài tập (JSON)", h("span", { class: "grow" }), fmtBtn), help, ta, msg));
}

function tabExercises() {
  const list = arr(S.doc.data, "exercises", LESSON_ORDER);
  return h("div", {}, S.doc.sample ? null : toolbar(h("span", { class: "muted" }, "Mỗi dạng bài tập có cấu trúc JSON riêng."), h("span", { class: "grow" }), sampleLink("exercises")), listEditor(list, {
    prefix: "exercises", noun: "bài tập",
    title: ex => [h("b", {}, ex.id || "?"), " ", h("span", { class: "tag" }, ex.type || "chưa chọn dạng"), h("span", { class: "muted" }, " " + (ex.en || ""))],
    body: exerciseBody,
    make: () => {
      const type = prompt("Dạng bài tập (" + Object.keys(EX_TYPES).join(", ") + "):", "type");
      if (!type) return null;
      if (!EX_TYPES[type]) { toast("Không có dạng " + type, "err"); return null; }
      const nums = list.map(e => String(e.id || "")).filter(Boolean);
      const next = nums.length ? nums[nums.length - 1].replace(/(\d+)$/, n => Number(n) + 1) : (S.doc.data.id || 1) + ".1";
      return { id: next, type, en: "", ...clone(EX_TYPES[type].skel) };
    },
  }));
}

function topicBody(t, i, setTitle, usage) {
  return h("div", { class: "grid" },
    field(t, "id", { label: "Mã chủ đề", req: true, order: TOPIC_ORDER, mono: true, onChange: setTitle, placeholder: "Ví dụ: wedding", hint: "Viết liền, không dấu." }),
    field(t, "vi", { label: "Tên tiếng Việt", req: true, order: TOPIC_ORDER, onChange: setTitle, placeholder: "Ví dụ: Đám cưới" }),
    field(t, "en", { label: "Tên tiếng Anh", order: TOPIC_ORDER, placeholder: "Ví dụ: Wedding" }),
    usage !== undefined ? h("p", { class: "muted wide" }, (usage ? usage + " từ đang dùng chủ đề này." : "Chưa có từ nào dùng chủ đề này.") + " Vị trí và màu trên bản đồ 3D được tự tính lại mỗi lần build, không cần nhập.") : null);
}

function topicTitle(t) { return [h("b", { class: "mono" }, t.id || "(chưa có mã)"), h("span", { class: "muted" }, " — " + (t.vi || "")), ]; }

function tabLessonTopics() {
  const list = arr(S.doc.data, "topics", LESSON_ORDER);
  return h("div", {}, h("p", { class: "muted intro" }, "Chỉ khai báo chủ đề MỚI của bài này. Chủ đề đã có trong topics.json thì chọn thẳng ở tab Từ vựng. ", sampleLink("topics")),
    listEditor(list, { prefix: "topics", noun: "chủ đề", title: topicTitle, body: (t, i, st) => topicBody(t, i, st, (S.doc.data.words || []).filter(w => w.topic === t.id).length), make: () => ({ id: "", vi: "" }) }));
}

function tabLinks() {
  const list = arr(S.doc.data, "links", LESSON_ORDER);
  const rows = h("div", { class: "links" });
  const draw = () => rows.replaceChildren(...list.map((pair, i) => {
    if (!Array.isArray(pair)) list[i] = pair = ["", ""];
    const inp = k => { const el = h("input", { value: pair[k] || "", list: "dl-words", placeholder: "từ " + (k + 1) }); el.addEventListener("input", () => { pair[k] = el.value; changed(); }); return el; };
    return h("div", { class: "link-row", id: "links-" + i }, h("span", { class: "idx" }, "#" + (i + 1)), inp(0), h("span", { class: "arrow" }, "↔"), inp(1),
      h("button", { class: "icon danger", type: "button", title: "Xoá", onclick: () => { list.splice(i, 1); changed(); draw(); } }, "✕"));
  }), h("button", { class: "btn add", type: "button", onclick: () => { list.push(["", ""]); changed(); draw(); rows.querySelectorAll(".link-row:last-of-type input")[0].focus(); } }, "＋ Thêm liên kết"));
  draw();
  return h("div", {}, h("p", { class: "muted intro" }, "Cặp từ liên quan được nối với nhau trên bản đồ 3D. Có thể nối tới từ của bài khác (gõ để xem gợi ý). ", sampleLink("links")), rows);
}

function tabLint() {
  const list = arr(S.doc.data, "lint", LESSON_ORDER);
  return h("div", {}, h("p", { class: "muted intro" }, "Biểu thức chính quy dò lỗi thường gặp trong câu trả lời phần 3. Gõ câu thử ở mỗi quy tắc để xem có bắt được không. ", sampleLink("lint")),
    listEditor(list, {
      prefix: "lint", noun: "quy tắc",
      title: r => [h("code", {}, r.pattern || "(chưa có biểu thức)"), r.flags ? h("span", { class: "tag" }, "/" + r.flags) : null],
      body: (r, i, setTitle) => {
        const out = h("small", { class: "test-out" });
        const test = h("input", { class: "keep-edit", placeholder: "Gõ một câu để thử, ví dụ: I am born in 1990." });
        const run = () => {
          if (!test.value) { out.textContent = ""; out.className = "test-out"; return; }
          try { const hit = new RegExp(r.pattern || "", r.flags || "").test(test.value); out.textContent = hit ? "Bắt được → " + (r.message || "") : "Không khớp"; out.className = "test-out " + (hit ? "hit" : "miss"); }
          catch (e) { out.textContent = "Biểu thức sai: " + e.message; out.className = "test-out err"; }
        };
        test.addEventListener("input", run);
        const onPat = () => { setTitle(); run(); };
        return h("div", { class: "grid" },
          field(r, "pattern", { label: "Biểu thức", req: true, mono: true, spell: false, order: LINT_ORDER, cls: "span2", onChange: onPat, placeholder: "Ví dụ: \\b(am|is|are)\\s+born\\b" }),
          field(r, "flags", { label: "Cờ", mono: true, order: LINT_ORDER, placeholder: "i", onChange: onPat }),
          field(r, "message", { label: "Lời giải thích", req: true, kind: "textarea", wide: true, order: LINT_ORDER, placeholder: "Ví dụ: Sinh ra là chuyện đã qua: dùng was born / were born, không dùng am/is/are born." }),
          h("div", { class: "f wide" }, h("span", { class: "lab" }, "Thử"), test, out));
      },
      make: () => ({ pattern: "", flags: "i", message: "" }),
    }));
}

function tabJson() {
  const ta = h("textarea", { class: "mono json big", spellcheck: "false" });
  ta.value = JSON.stringify(S.doc.data, null, 2);
  const msg = h("small", { class: "json-msg" });
  const apply = h("button", { class: "btn primary small", type: "button", disabled: true, onclick: () => {
    let v;
    try { v = JSON.parse(ta.value); } catch (e) { msg.textContent = "JSON chưa đúng: " + e.message; return; }
    if (S.doc.kind === "topics" ? !Array.isArray(v) : !isObj(v)) { msg.textContent = S.doc.kind === "topics" ? "topics.json phải là một mảng [ … ]" : "Bài học phải là một object { … }"; return; }
    S.doc.data = v; S.bad.clear(); changed(); fillDatalists(); apply.disabled = true; msg.textContent = ""; toast("Đã áp dụng. Bấm Lưu để ghi vào file.");
  } }, "Áp dụng thay đổi");
  ta.addEventListener("input", () => {
    apply.disabled = false;
    try { JSON.parse(ta.value); msg.textContent = ""; ta.classList.remove("invalid"); } catch (e) { msg.textContent = "JSON chưa đúng: " + e.message; ta.classList.add("invalid"); }
  });
  if (S.doc.sample) {
    const copy = h("button", { class: "btn small keep", type: "button", onclick: async () => {
      try { await navigator.clipboard.writeText(ta.value); toast("Đã chép JSON của bài mẫu", "ok"); }
      catch (e) { ta.select(); toast("Không chép được tự động, hãy bấm Ctrl+C", "err"); }
    } }, "Chép JSON");
    return h("div", {}, toolbar(h("span", { class: "grow" }), copy), ta);
  }
  return h("div", {}, toolbar(h("span", { class: "muted" }, "Sửa trực tiếp toàn bộ dữ liệu. Bấm Áp dụng trước khi chuyển tab hoặc lưu."), h("span", { class: "grow" }), apply), ta, msg);
}

function tabGlobalTopics() {
  const list = S.doc.data;
  return h("div", {}, h("p", { class: "muted intro" }, "Các chủ đề dùng chung cho mọi bài, là các cụm trên bản đồ 3D."),
    listEditor(list, { prefix: "topics", noun: "chủ đề", title: topicTitle, body: (t, i, st) => topicBody(t, i, st, S.ov.usage[t.id] || 0), make: () => ({ id: "", vi: "", en: "" }) }));
}

/* ---------- Vẽ ---------- */

function render() {
  if (!S.doc) return;
  renderTabs();
  const d = S.doc;
  let view;
  if (S.tab === "json") view = tabJson();
  else if (d.kind === "topics") view = tabGlobalTopics();
  else view = ({ info: tabInfo, words: tabWords, quiz: tabQuiz, exercises: tabExercises, topics: tabLessonTopics, links: tabLinks, lint: tabLint }[S.tab] || tabWords)();
  if (d.sample) { view = h("div", { class: "readonly" }, sampleBanner(), view); lockView(view); }
  $("#content").replaceChildren(view);
  paintIssues();
}

/* ---------- Kiểm tra ---------- */

let checkTimer, checkSeq = 0;
function scheduleCheck() { clearTimeout(checkTimer); checkTimer = setTimeout(runCheck, 600); }

async function runCheck() {
  if (!S.doc) return null;
  if (S.doc.sample) { S.check = null; paintIssues(); return null; }
  const seq = ++checkSeq;
  try {
    const r = S.doc.kind === "topics" ? await api("/api/check", { topics: S.doc.data }) : await api("/api/check", { file: S.doc.file, data: S.doc.data });
    if (seq !== checkSeq) return r;
    S.check = r; paintIssues();
    return r;
  } catch (e) { toast("Không kiểm tra được: " + e.message, "err"); return null; }
}

const ISSUE_TARGETS = [
  [/^từ #(\d+)/, "words"], [/^câu trắc nghiệm #(\d+)/, "quiz"], [/^bài tập #(\d+)/, "exercises"], [/^lint #(\d+)/, "lint"],
  [/^từ "([^"]+)" dùng chủ đề/, "words-by-name"], [/liên kết/, "links"], [/chủ đề/, "topics"], [/^"id"|^thiếu "title"/, "info"], [/^ảnh|^không thấy ảnh/, "words"],
];

function goIssue(msg) {
  for (const [re, tab] of ISSUE_TARGETS) {
    const m = msg.match(re);
    if (!m) continue;
    let t = tab, idx = m[1] ? Number(m[1]) - 1 : -1;
    if (tab === "words-by-name") { t = "words"; idx = (S.doc.data.words || []).findIndex(w => w.w === m[1]); }
    if (S.doc.kind === "topics") t = "topics";
    if (S.tab !== t) setTab(t);
    if (idx >= 0) {
      const el = document.getElementById(t + "-" + idx);
      if (el) { if (el.classList.contains("collapsed")) el.querySelector(".fold").click(); el.hidden = false; el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
    }
    return;
  }
}

function paintIssues() {
  const box = $("#issues"), r = S.check;
  if (!r || !S.doc) { box.hidden = true; return; }
  box.hidden = false;
  const errs = r.errors || [], warns = r.warnings || [];
  $("#issueSum").replaceChildren(...[h("span", { class: "pill " + (errs.length ? "err" : "ok") }, errs.length ? errs.length + " lỗi" : "Không có lỗi"), warns.length ? h("span", { class: "pill warn" }, warns.length + " lưu ý") : null].filter(Boolean));
  const item = (m, kind) => h("button", { class: "issue " + kind, type: "button", onclick: () => goIssue(m) }, m);
  $("#issueList").replaceChildren(...[
    ...errs.map(m => item(m, "err")), ...warns.map(m => item(m, "warn")),
    !errs.length && !warns.length ? h("p", { class: "muted" }, "Dữ liệu hợp lệ, build sẽ chạy được.") : null,
    r.others ? h("p", { class: "muted" }, "Các file khác đang có " + r.others + " lỗi.") : null].filter(Boolean));
  const tabErr = {};
  for (const m of errs) for (const [re, tab] of ISSUE_TARGETS) if (re.test(m)) { tabErr[tab === "words-by-name" ? "words" : tab] = true; break; }
  for (const el of document.querySelectorAll("[data-dot]")) el.classList.toggle("on", !!tabErr[el.dataset.dot]);
}

/* ---------- Lưu ---------- */

async function save(force = false) {
  const d = S.doc;
  if (!d || d.sample) return;
  if (S.bad.size) { toast("Còn ô JSON chưa đúng cú pháp ở tab Bài tập, sửa xong mới lưu được.", "err"); return; }
  if (!force) {
    const r = await runCheck();
    if (r && r.errors.length && !confirm("Còn " + r.errors.length + " lỗi. Khi còn lỗi, website sẽ không build bài này.\n\nVẫn lưu?")) return;
  }
  try {
    const r = d.kind === "topics"
      ? await api("/api/topics", { data: d.data, mtime: d.mtime, force })
      : await api("/api/lesson", { file: d.file, data: d.data, mtime: d.mtime, create: !!d.isNew, force });
    d.mtime = r.mtime; d.dirty = false;
    if (d.isNew) { d.isNew = false; d.hashBase = "#/lesson/" + d.file; history.replaceState(null, "", d.hashBase + "/" + S.tab); }
    toast("Đã lưu " + (d.kind === "topics" ? "topics.json" : d.file), "ok");
    await loadOverview();
    updateStatus(); runCheck();
  } catch (e) {
    if (e.status === 409 && !d.isNew && confirm(e.message + "\n\nLưu đè lên bản trên đĩa?")) return save(true);
    toast(e.message, "err");
  }
}

/* ---------- Bài mới ---------- */

function openNew() {
  if (!confirmLeave()) return;
  const dlg = $("#newDialog"), f = $("#newForm");
  const next = Math.max(0, ...S.ov.lessons.map(l => Number(l.id) || 0)) + 1;
  f.reset();
  f.id.value = next;
  const auto = () => { if (!f.file.dataset.touched) f.file.value = pad2(f.id.value || next) + "-" + (slug(f.title.value) || "ten-bai") + ".json"; };
  f.id.oninput = auto; f.title.oninput = auto; f.file.oninput = () => (f.file.dataset.touched = "1");
  delete f.file.dataset.touched;
  auto();
  dlg.showModal();
  dlg.onclose = async () => {
    if (dlg.returnValue !== "ok") return;
    const id = Number(f.id.value), title = f.title.value.trim(), file = f.file.value.trim();
    if (S.ov.lessons.some(l => l.file === file)) { toast("File " + file + " đã có", "err"); return; }
    let data;
    if (f.fromTemplate.checked) { data = await api("/api/template"); data.id = id; data.title = title; }
    else data = { $schema: "../lesson.schema.json", id, title, topics: [], words: [{}], quiz: [], exercises: [], lint: [], links: [] };
    S.doc = { kind: "lesson", file, base: file.replace(/\.json$/, ""), data, mtime: 0, images: [], dirty: true, isNew: true, hashBase: "#/new/x" };
    S.tab = "words"; S.bad.clear(); S.check = null;
    history.replaceState(null, "", "#/new/x/words");
    renderSide(); fillDatalists(); render(); updateStatus(); runCheck();
  };
}

/* ---------- Khởi động ---------- */

$("#btnSave").addEventListener("click", () => save());
$("#btnCheck").addEventListener("click", async () => { const r = await runCheck(); if (r) toast(r.errors.length ? r.errors.length + " lỗi, xem cột bên phải" : "Không có lỗi", r.errors.length ? "err" : "ok"); });
$("#btnNew").addEventListener("click", openNew);
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
});

loadOverview().then(route).catch(e => {
  $("#content").replaceChildren(h("div", { class: "empty err" }, "Không kết nối được máy chủ: " + e.message));
});
