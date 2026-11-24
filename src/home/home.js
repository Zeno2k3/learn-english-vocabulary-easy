/* Trang chủ: tiến độ từng bài (localStorage, đồng bộ qua src/sync/sync.js), tìm kiếm, lọc và rút gọn danh sách bài. */
const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
};
const $ = id => document.getElementById(id);
const MASTER = 3, PER_WORD = 150, SEG = 10;
const PAGE = 9;          // số bài hiện sẵn khi không tìm, không lọc
const fmt = n => n.toLocaleString("vi-VN");
const pad2 = n => String(n).padStart(2, "0");
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/* Bỏ dấu để gõ "ao khoac" vẫn ra "áo khoác". */
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();

const cards = [...document.querySelectorAll(".lesson")];
let INDEX = [];
try { INDEX = JSON.parse($("lessonIndex").textContent) || []; } catch (e) {}
const LESSON = new Map(INDEX.map(l => [String(l.id), {
  title: norm(l.title),
  words: (l.words || []).map(([w, vi]) => ({w, vi, nw: norm(w), nv: norm(vi)}))
}]));
const ui = {q: "", filter: "all", expanded: false};

/* ---------- tiến độ ---------- */
function progressOf(id) {
  const best = Number(read("spellquest-best-b" + id, 0)) || 0;
  const quiz = Number(read("spellquest-qbest-b" + id, 0)) || 0;
  const need = Object.values(read("spellquest-miss-b" + id, {}) || {})
    .filter(s => s && s.wrong > 0 && (s.streak || 0) < MASTER).length;
  return {best, quiz, need};
}

function renderProgress() {
  let played = 0, needTotal = 0;
  const review = [], count = {all: cards.length, play: 0, need: 0, new: 0, done: 0};
  cards.forEach(card => {
    const id = card.dataset.id, words = Number(card.dataset.words) || 0;
    const {best, quiz, need} = progressOf(id);
    const max = words * PER_WORD, pct = max ? Math.min(1, best / max) : 0;
    const on = best ? Math.max(1, Math.floor(pct * SEG)) : 0;
    if (best || quiz) played++;
    needTotal += need;
    if (need) review.push({id, name: card.querySelector(".name").textContent, need});

    const state = need ? "need" : pct >= 1 ? "done" : best || quiz ? "play" : "new";
    card.dataset.state = state;
    count[state]++;
    card.querySelectorAll(".bar i").forEach((i, k) => { i.className = k < on ? "on" : ""; });

    const prog = card.querySelector(".prog");
    prog.textContent = "";
    if (!best && !quiz && !need) { prog.textContent = "Chưa chơi"; return; }
    const parts = [];
    if (best) parts.push("Kỷ lục " + fmt(best) + "/" + fmt(max));
    if (quiz) parts.push("Trắc nghiệm đúng " + quiz + " câu");
    prog.append(parts.join(" · "));
    if (need) {
      if (parts.length) prog.append(" ");
      prog.append(el("b", "badge", "Cần ôn " + need + " từ"));
    }
  });

  $("statPlayed").textContent = played;
  $("statNeed").textContent = needTotal;
  document.querySelector(".stat.need").classList.toggle("hot", needTotal > 0);
  document.querySelectorAll(".filters button").forEach(b => {
    const n = count[b.dataset.f] || 0;
    b.querySelector("small").textContent = n;
    b.hidden = b.dataset.f !== "all" && !n && ui.filter !== b.dataset.f;
  });

  const box = $("review"), list = $("reviewList");
  box.hidden = !review.length;
  list.textContent = "";
  if (review.length) {
    review.sort((a, b) => b.need - a.need);
    $("reviewSum").textContent = needTotal + " từ bạn hay viết sai ở " + review.length + " bài. Viết đúng " + MASTER + " lần liền thì từ được tính là đã sửa.";
    review.forEach(r => {
      const a = el("a", "ritem");
      a.href = "lessons/" + r.id + "/#tu-hay-sai";
      a.append(el("span", "rnum", pad2(r.id)), el("span", "rname", r.name), el("b", "rcount", r.need + " từ"));
      list.append(a);
    });
  }
  applyView();
}

/* ---------- tìm kiếm + lọc ---------- */
/* Gõ số thì tìm theo số bài; gõ chữ thì tìm trong tên bài, rồi trong từ tiếng Anh và nghĩa tiếng Việt. */
function matchOf(card, q) {
  if (!q) return {ok: true, hits: []};
  const id = card.dataset.id, l = LESSON.get(id);
  if (/^\d+$/.test(q)) return {ok: Number(q) === Number(id), hits: []};
  const title = l ? l.title : norm(card.querySelector(".name").textContent);
  if (title.includes(q)) return {ok: true, hits: []};
  if (!l || q.length < 2) return {ok: false, hits: []};
  const starts = w => w.nw.startsWith(q) || w.nv.startsWith(q);
  const hits = l.words.filter(w => w.nw.includes(q) || w.nv.includes(q)).sort((a, b) => starts(b) - starts(a));
  return {ok: hits.length > 0, hits};
}

function applyView() {
  const q = norm(ui.q), raw = ui.q.trim(), shown = [];
  cards.forEach(card => {
    const m = matchOf(card, q);
    const ok = m.ok && (ui.filter === "all" || card.dataset.state === ui.filter);
    const hit = card.querySelector(".hit");
    hit.hidden = !ok || !m.hits.length;
    if (!hit.hidden) {
      const more = m.hits.length > 3 ? " và " + (m.hits.length - 3) + " từ khác" : "";
      hit.textContent = "Có từ: " + m.hits.slice(0, 3).map(w => w.w + " (" + w.vi + ")").join(", ") + more;
    }
    card.hidden = !ok;
    if (ok) shown.push(card);
  });

  const extra = !q && !ui.expanded ? Math.max(0, shown.length - PAGE) : 0;
  if (extra) shown.slice(PAGE).forEach(c => { c.hidden = true; });
  $("moreBox").hidden = !extra;
  if (extra) $("more").textContent = "Xem thêm " + extra + " bài";

  const filtered = q || ui.filter !== "all";
  $("found").textContent = filtered && shown.length ? "Tìm thấy " + shown.length + " bài" + (raw ? " cho “" + raw + "”" : "") : "";
  $("empty").hidden = shown.length > 0;
  if (!shown.length) $("emptyText").textContent = raw
    ? "Không có bài hoặc từ nào khớp “" + raw + "”" + (ui.filter !== "all" ? " trong mục đang lọc." : ".")
    : "Chưa có bài nào ở mục này.";
}

const input = $("q");
input.addEventListener("input", () => { ui.q = input.value; applyView(); });
input.addEventListener("keydown", e => { if (e.key === "Escape" && input.value) { e.preventDefault(); input.value = ""; ui.q = ""; applyView(); } });
document.addEventListener("keydown", e => {
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || (window.SQSync && SQSync.isOpen())) return;
  e.preventDefault(); input.focus(); input.select();
});
const setFilter = f => {
  ui.filter = f; ui.expanded = false;
  document.querySelectorAll(".filters button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.f === f)));
  renderProgress();
};
document.querySelectorAll(".filters button").forEach(b => b.addEventListener("click", () => setFilter(b.dataset.f)));
$("more").addEventListener("click", () => {
  const before = new Set(cards.filter(c => !c.hidden));
  ui.expanded = true; applyView();
  const first = cards.find(c => !c.hidden && !before.has(c));
  if (first) first.focus();
});
$("clear").addEventListener("click", () => { input.value = ""; ui.q = ""; setFilter("all"); input.focus(); });

/* ---------- tài khoản ---------- */
function renderAccount() {
  const S = window.SQSync, b = $("acct");
  if (!S || !S.enabled) return;
  b.hidden = false;
  b.dataset.state = S.state();
  $("acctText").textContent = S.signedIn() ? S.label() : "Đăng nhập";
  b.title = S.signedIn() ? S.email() + " · bấm để đồng bộ hoặc đăng xuất" : "Đăng nhập để đồng bộ tiến độ giữa các thiết bị";
}
$("acct").addEventListener("click", () => window.SQSync && SQSync.open());
window.addEventListener("sq-sync-paint", renderAccount);
window.addEventListener("sq-sync-auth", renderAccount);

renderProgress();
renderAccount();
window.addEventListener("sq-sync", renderProgress);
window.addEventListener("storage", e => { if (e.key && e.key.startsWith("spellquest-")) renderProgress(); });

/* ---------- nền ô vuông nổi lên khi rê chuột ----------
   Lưới 24px giống nền CSS (background-attachment: fixed nên canvas cố định khớp đúng ô).
   Ô dưới con trỏ nổi hẳn, 8 ô quanh nổi nhẹ, ô vừa đi qua hạ dần tạo vệt.
   Chỉ chạy trên máy có chuột và khi không bật giảm chuyển động. */
(() => {
  const cv = $("tiles");
  const ok = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!cv || !ok || !cv.getContext) { if (cv) cv.remove(); return; }
  const ctx = cv.getContext("2d");
  const CELL = 24, LIFT = 4, RISE = 90, FALL = 650;   // px, px, ms để nổi hết, ms để hạ hết
  const cells = new Map();                             // "x,y" -> {x, y, a: độ nổi 0..1}
  let C = {}, cur = null, last = null, raf = 0, prev = 0, w = 0, h = 0;

  function colors() {
    const s = getComputedStyle(document.documentElement);
    C = {tile: s.getPropertyValue("--tile").trim(), hi: s.getPropertyValue("--tile-hi").trim(),
      lo: s.getPropertyValue("--tile-lo").trim(), shadow: s.getPropertyValue("--tile-shadow").trim()};
  }
  function size() {
    const d = window.devicePixelRatio || 1;
    w = innerWidth; h = innerHeight;
    cv.width = Math.round(w * d); cv.height = Math.round(h * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    kick();
  }
  const cellAt = (x, y) => ({x: Math.floor(x / CELL), y: Math.floor(y / CELL)});
  function bump(cx, cy, a) {
    const k = cx + "," + cy, c = cells.get(k);
    if (c) c.peak = Math.max(c.peak || 0, a); else cells.set(k, {x: cx, y: cy, a: 0, peak: a});
  }
  /* Ô đang dưới con trỏ (mạnh) và vòng ô quanh nó (nhẹ). */
  const targetOf = c => !cur ? 0 : Math.max(Math.abs(c.x - cur.x), Math.abs(c.y - cur.y)) === 0 ? 1 : Math.max(Math.abs(c.x - cur.x), Math.abs(c.y - cur.y)) === 1 ? 0.4 : 0;

  function draw(c) {
    const a = c.a, lift = Math.round(LIFT * a);
    const x = c.x * CELL + 1, y = c.y * CELL + 1, s = CELL - 1;
    ctx.globalAlpha = Math.min(1, a * 1.4);
    ctx.fillStyle = C.shadow; ctx.fillRect(x - lift + 2, y - lift + 2, s + lift, s + lift);
    ctx.fillStyle = C.tile; ctx.fillRect(x - lift, y - lift, s, s);
    ctx.fillStyle = C.hi; ctx.fillRect(x - lift, y - lift, s, 2); ctx.fillRect(x - lift, y - lift, 2, s);
    ctx.fillStyle = C.lo; ctx.fillRect(x - lift, y - lift + s - 2, s, 2); ctx.fillRect(x - lift + s - 2, y - lift, 2, s);
  }
  function frame(t) {
    const dt = Math.min(64, t - (prev || t)); prev = t; raf = 0;
    ctx.clearRect(0, 0, w, h);
    let busy = false;
    const live = [];
    for (const [k, c] of cells) {
      const goal = Math.max(targetOf(c), c.peak || 0);
      c.peak = 0;
      if (goal > c.a) c.a = Math.min(goal, c.a + dt / RISE);
      else c.a = Math.max(goal, c.a - dt / FALL);
      if (c.a <= 0 && goal <= 0) { cells.delete(k); continue; }
      if (c.a !== goal) busy = true;
      live.push(c);
    }
    live.sort((p, q) => p.a - q.a).forEach(draw);   // ô nổi cao nhất vẽ sau cùng, nằm trên bóng ô bên cạnh
    ctx.globalAlpha = 1;
    if (busy) kick(); else prev = 0;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  addEventListener("pointermove", e => {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    const p = {x: e.clientX, y: e.clientY};
    /* đi nhanh thì nội suy để vệt không bị đứt quãng */
    if (last) {
      const n = Math.min(40, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / (CELL / 2)));
      for (let i = 1; i < n; i++) { const q = cellAt(last.x + (p.x - last.x) * i / n, last.y + (p.y - last.y) * i / n); bump(q.x, q.y, 0.8); }
    }
    last = p; cur = cellAt(p.x, p.y);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) bump(cur.x + dx, cur.y + dy, 0);
    kick();
  }, {passive: true});
  const leave = () => { cur = null; last = null; kick(); };
  document.documentElement.addEventListener("pointerleave", leave);
  addEventListener("blur", leave);
  addEventListener("resize", size);
  addEventListener("sq-theme", () => { colors(); kick(); });
  colors(); size();
})();
