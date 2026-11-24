/* Bản đồ từ vựng 3D. Dữ liệu do scripts/build.mjs sinh từ data/lessons/*.json. */
const {lessons: LESSONS, topics: TOPICS, words: WORDS, links: LINKS} = JSON.parse(document.getElementById("map-data").textContent);
/* ===================== HẾT PHẦN DỮ LIỆU ===================== */

const $ = id => document.getElementById(id);
const PAL = ["#4e79a7","#f28e2b","#e15759","#59a14f","#76b7b2","#b07aa1","#edc948","#ff9da7","#9c755f","#86bcb6","#d37295","#8cd17d"];
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/đ/g,"d").trim();
/* Từ hay sai: đọc trực tiếp từ tiến độ các bài trên chính thiết bị này. */
function readMistakes() {
  const w = {}; let latest = 0;
  const pad = n => String(n).padStart(2, "0");
  const day = t => { const d = new Date(t); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  LESSONS.forEach(l => {
    let stats = {};
    try { stats = JSON.parse(localStorage.getItem("spellquest-miss-b" + l.id) || "{}") || {}; } catch (e) {}
    Object.values(stats).forEach(s => {
      if (!s || !s.w || !(s.wrong > 0)) return;
      const k = norm(s.w), d = s.lastWrong ? day(s.lastWrong) : "", cur = w[k];
      latest = Math.max(latest, s.last || 0);
      if (!cur) w[k] = {n: s.wrong, s: s.streak || 0, d};
      else { cur.n += s.wrong; cur.s = Math.min(cur.s, s.streak || 0); if (d > cur.d) cur.d = d; }
    });
  });
  const t = new Date(latest);
  return {at: latest ? day(latest) + " " + pad(t.getHours()) + ":" + pad(t.getMinutes()) : "", w};
}
let MISTAKES = readMistakes();
function hash(s){ let h = 2166136261; for(const ch of String(s)){ h ^= ch.charCodeAt(0); h = Math.imul(h,16777619); } return (h>>>0)/4294967295; }
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

/* ---------- prepare data ---------- */
const seen = new Set();
const words = WORDS.filter(x => { const k = norm(x.w); if(!x.w || seen.has(k)) return false; seen.add(k); return true; });
const byW = new Map(words.map(w => [norm(w.w), w]));
const topics = TOPICS.slice();
const topicById = {};
topics.forEach(t => topicById[t.id] = t);
words.forEach(w => {
  if(!topicById[w.topic]){
    const t = {id:w.topic || "khac", vi:w.topic || "Khác", en:""};
    if(!topicById[t.id]){ topics.push(t); topicById[t.id] = t; }
    w.topic = t.id;
  }
});
/* Vị trí chủ đề do scripts/layout.mjs tính sẵn lúc build; chỉ chủ đề lạ (không có trong dữ liệu) mới cần đặt tạm ở đây. */
const missing = topics.filter(t => !Array.isArray(t.c));
missing.forEach((t,k) => {
  const n = missing.length, y = n === 1 ? 0.6 : 1 - 2*(k+0.5)/n, r = Math.sqrt(1-y*y), th = k*2.39996 + 0.7;
  t.c = [Math.cos(th)*r*1.25, y*0.9, Math.sin(th)*r*1.25];
});
topics.forEach((t,i) => {
  t.color = t.color || PAL[i % PAL.length];
  const ws = words.filter(w => w.topic === t.id);
  t.n = ws.length;
  t.R = 0.1 + 0.055*Math.sqrt(ws.length);
  const rot = hash(t.id)*6.283;
  ws.forEach((w,k) => {
    const n = ws.length;
    const y = n === 1 ? 0 : 1 - 2*(k+0.5)/n;
    const r = Math.sqrt(Math.max(0,1-y*y));
    const th = k*2.39996 + rot;
    const s = t.R*(0.55 + 0.45*hash(w.w));
    w.p = [t.c[0] + Math.cos(th)*r*s, t.c[1] + y*s*0.85, t.c[2] + Math.sin(th)*r*s];
  });
  t.lp = [t.c[0], t.c[1] + t.R + 0.09, t.c[2]];
});
/* Lùi camera vừa đủ để thấy hết bản đồ, dù có thêm bao nhiêu chủ đề. */
const EXTENT = Math.max(1.6, ...topics.filter(t => t.n > 0).map(t => Math.hypot(...t.c) + t.R + 0.1));
const FAR = Math.max(7, 3.4*EXTENT/1.6*2);
const lessonById = {}; LESSONS.forEach((l,i) => { l.i = i; lessonById[l.id] = l; });
const types = [...new Set(words.map(w => w.t))];
const links = LINKS.map(([a,b]) => [byW.get(norm(a)), byW.get(norm(b))]).filter(([a,b]) => a && b && a !== b);
const relOf = w => links.filter(([a,b]) => a===w || b===w).map(([a,b]) => a===w ? b : a);
const usedTopics = topics.filter(t => t.n > 0);
const MASTER = 3;
const linkMistakes = () => words.forEach(w => { const m = (MISTAKES.w || {})[norm(w.w)]; w.miss = m && m.n > 0 ? m : null; });
linkMistakes();
const needWords = () => words.filter(w => w.miss && (w.miss.s || 0) < MASTER).sort((a,b) => b.miss.n - a.miss.n);
const MISS_GROUPS = [
  {id:"M3", name:"Sai từ 3 lần", color:"#b5172e"},
  {id:"M2", name:"Sai 2 lần", color:"#e15759"},
  {id:"M1", name:"Sai 1 lần", color:"#f28e2b"},
  {id:"MF", name:"Đã sửa được", sub:"đúng 3 lần liền", color:"#59a14f"},
  {id:"M0", name:"Chưa sai lần nào", color:"#c4c6d0"}
];
function missGroup(w){
  const m = w.miss;
  if(!m) return "M0";
  if((m.s || 0) >= MASTER) return "MF";
  return m.n >= 3 ? "M3" : m.n === 2 ? "M2" : "M1";
}
function fmtAt(t){ if(!t) return ""; const d = new Date(t.replace(" ", "T")); return isNaN(d) ? t : `${d.getDate()}/${d.getMonth()+1} lúc ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function fmtDay(t){ if(!t) return ""; const p = String(t).split("-"); return p.length === 3 ? `${+p[2]}/${+p[1]}` : t; }

$("sWords").textContent = words.length;
$("sLessons").textContent = new Set(words.map(w => w.l)).size;
$("sTopics").textContent = usedTopics.length;
$("srList").innerHTML = words.map(w => `<li>${esc(w.w)}: ${esc(w.vi)}</li>`).join("");

/* ---------- state ---------- */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const st = {mode:"topic", iso:null, sel:null, hits:null, labels:true, links:true, auto:!reduce, lastTouch:0};
const HOME = {yaw:0.55, pitch:-0.22, dist:3.4*EXTENT/1.6};
const cam = {yaw:HOME.yaw, pitch:HOME.pitch, dist:HOME.dist, ty:null, tp:null, td:null, vy:0, vp:0};

function groupOf(w){
  if(st.mode === "miss") return missGroup(w);
  if(st.mode === "topic") return w.topic;
  if(st.mode === "lesson") return "L" + w.l;
  return "T" + w.t;
}
function colorOf(w){
  if(st.mode === "miss"){ const id = missGroup(w); return MISS_GROUPS.find(g => g.id === id).color; }
  if(st.mode === "topic") return topicById[w.topic].color;
  if(st.mode === "lesson"){ const l = lessonById[w.l]; return PAL[(l ? l.i : w.l) % PAL.length]; }
  return PAL[types.indexOf(w.t) % PAL.length];
}
function groups(){
  if(st.mode === "miss") return MISS_GROUPS.map(g => Object.assign({}, g, {n:words.filter(w => missGroup(w) === g.id).length})).filter(g => g.n > 0);
  if(st.mode === "topic") return usedTopics.map(t => ({id:t.id, name:t.vi, sub:t.en, color:t.color, n:t.n}));
  if(st.mode === "lesson"){
    const ids = [...new Set(words.map(w => w.l))].sort((a,b) => a-b);
    return ids.map(id => { const l = lessonById[id]; return {id:"L"+id, name:`Bài ${id}`, sub:l ? l.name : "", color:PAL[(l ? l.i : id) % PAL.length], n:words.filter(w => w.l===id).length}; });
  }
  return types.map((t,i) => ({id:"T"+t, name:t, sub:"", color:PAL[i % PAL.length], n:words.filter(w => w.t===t).length}));
}

/* ---------- canvas & projection ---------- */
const cv = $("cv"), ctx = cv.getContext("2d");
let W = 0, H = 0, F = 1, dirty = true;
function fit(){
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  F = Math.min(W, H*1.15)*1.05;
  dirty = true;
}
addEventListener("resize", fit);
function proj(p){
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const x1 = p[0]*cy + p[2]*sy, z1 = -p[0]*sy + p[2]*cy;
  const y2 = p[1]*cp - z1*sp, z2 = p[1]*sp + z1*cp;
  const s = F/(cam.dist + z2);
  return {x:W/2 + x1*s, y:H*0.52 - y2*s, z:z2, s};
}
function shade(z){ return Math.max(0.35, Math.min(1, 0.72 - z*0.32)); }

function haloText(txt, x, y, fill, alpha, weight, size, align){
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px "Be Vietnam Pro", system-ui, sans-serif`;
  ctx.textAlign = align || "left";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size*0.3);
  ctx.strokeStyle = "rgba(250,250,247,.95)";
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(txt, x, y);
}

function active(w){
  if(st.iso && groupOf(w) !== st.iso) return false;
  if(st.hits && !st.hits.has(w)) return false;
  return true;
}

function draw(){
  ctx.clearRect(0,0,W,H);
  const P = new Map();
  words.forEach(w => P.set(w, proj(w.p)));
  const focus = st.sel ? new Set([st.sel, ...relOf(st.sel)]) : null;

  if(st.links){
    ctx.lineWidth = 1.2;
    links.forEach(([a,b]) => {
      const pa = P.get(a), pb = P.get(b);
      const on = active(a) && active(b);
      const hl = focus && (a === st.sel || b === st.sel);
      ctx.globalAlpha = hl ? 0.85 : on ? 0.22 * shade((pa.z+pb.z)/2) : 0.06;
      ctx.strokeStyle = hl ? "#1d2230" : "#5a6070";
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
  }

  const order = words.slice().sort((a,b) => P.get(b).z - P.get(a).z);
  const many = words.length > 140;
  for(const w of order){
    const p = P.get(w), on = active(w), d = shade(p.z);
    const needs = st.mode === "miss" && w.miss && (w.miss.s || 0) < MASTER;
    let r = Math.max(3, Math.min(13, 6.2 * p.s / (F/3.4)));
    if(needs) r *= 1 + Math.min(w.miss.n, 5)*0.2;
    ctx.globalAlpha = on ? (st.mode === "miss" && !w.miss ? d*0.5 : d) : 0.12;
    ctx.fillStyle = colorOf(w);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.fill();
    if(w === st.sel){
      ctx.globalAlpha = 1; ctx.lineWidth = 2.5; ctx.strokeStyle = "#1d2230";
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, Math.PI*2); ctx.stroke();
    }
    p.r = r;
    const showLabel = w === st.sel || (focus && focus.has(w)) || (st.hits && st.hits.has(w)) ||
      (st.labels && on && (!many || p.z < -0.2)) || (needs && on);
    if(showLabel){
      const size = Math.max(11, Math.min(17, 13 * p.s / (F/3.4)));
      const strong = w === st.sel || (st.hits && st.hits.has(w)) || (needs && w.miss.n >= 2);
      haloText(w.w, p.x + r + 4, p.y + size*0.35, "#1d2230", strong ? 1 : (on ? Math.min(1, d + 0.1) : 0.3), strong ? 700 : 500, strong ? size + 2 : size);
    }
  }

  topics.forEach(t => {
    if(!t.n) return;
    const p = proj(t.lp);
    const on = !st.iso || st.mode !== "topic" || st.iso === t.id;
    const size = Math.max(13, Math.min(22, 17 * p.s / (F/3.4)));
    haloText(t.vi, p.x, p.y, "#1d2230", on ? Math.min(1, shade(p.z) + 0.25) : 0.25, 700, size, "center");
    if(t.en) haloText(t.en, p.x, p.y + size*0.95, "#656b7b", on ? shade(p.z) : 0.2, 500, Math.max(10, size*0.62), "center");
  });
  ctx.globalAlpha = 1;
  draw.P = P;
}

/* ---------- animation loop ---------- */
const angDiff = (a,b) => { let d = (b - a) % (Math.PI*2); if(d > Math.PI) d -= Math.PI*2; if(d < -Math.PI) d += Math.PI*2; return d; };
const clampPitch = p => Math.max(-1.25, Math.min(1.25, p));
let dragging = false;
function tick(){
  let moving = false;
  if(cam.ty !== null){
    const dy = angDiff(cam.yaw, cam.ty), dp = cam.tp - cam.pitch, dd = cam.td - cam.dist;
    cam.yaw += dy*0.12; cam.pitch += dp*0.12; cam.dist += dd*0.12;
    if(Math.abs(dy) < 0.002 && Math.abs(dp) < 0.002 && Math.abs(dd) < 0.004){ cam.ty = null; }
    moving = true;
  } else if(!dragging && (Math.abs(cam.vy) > 0.0002 || Math.abs(cam.vp) > 0.0002)){
    cam.yaw += cam.vy; cam.pitch = clampPitch(cam.pitch + cam.vp);
    cam.vy *= 0.93; cam.vp *= 0.93; moving = true;
  } else if(st.auto && !dragging && !st.sel && performance.now() - st.lastTouch > 2500){
    cam.yaw += 0.0016; moving = true;
  }
  if(moving || dirty){ draw(); dirty = false; }
  requestAnimationFrame(tick);
}
function lookAt(p, dist){
  const R = Math.hypot(p[0], p[2]) || 0.0001;
  cam.ty = Math.atan2(p[0], -p[2]);
  cam.tp = clampPitch(Math.atan2(-p[1], R));
  cam.td = dist;
  cam.vy = cam.vp = 0;
}

/* ---------- gestures ---------- */
const ptrs = new Map();
let down = null, moved = 0, pinch = null;
const pdist = () => { const a = [...ptrs.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
cv.addEventListener("pointerdown", e => {
  try{ cv.setPointerCapture(e.pointerId); }catch(_){}
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  st.lastTouch = performance.now();
  cam.ty = null; cam.vy = cam.vp = 0;
  if(ptrs.size === 1){ down = {x:e.clientX, y:e.clientY}; moved = 0; dragging = true; cv.classList.add("drag"); }
  if(ptrs.size === 2){ pinch = {d:pdist(), dist:cam.dist}; moved = 99; }
});
cv.addEventListener("pointermove", e => {
  const prev = ptrs.get(e.pointerId);
  if(!prev) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  st.lastTouch = performance.now();
  if(ptrs.size === 1){
    moved += Math.abs(dx) + Math.abs(dy);
    const k = 0.0065;
    cam.yaw -= dx*k; cam.pitch = clampPitch(cam.pitch + dy*k);
    cam.vy = -dx*k*0.6; cam.vp = dy*k*0.6;
    dirty = true;
  } else if(ptrs.size === 2 && pinch){
    cam.dist = Math.max(1.5, Math.min(FAR, pinch.dist * pinch.d / Math.max(10, pdist())));
    dirty = true;
  }
});
function up(e){
  if(!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if(ptrs.size < 2) pinch = null;
  if(ptrs.size === 0){
    dragging = false; cv.classList.remove("drag");
    if(moved < 7 && e.type === "pointerup") tap(e.clientX, e.clientY);
  }
}
cv.addEventListener("pointerup", up);
cv.addEventListener("pointercancel", up);
cv.addEventListener("wheel", e => {
  e.preventDefault();
  cam.ty = null;
  cam.dist = Math.max(1.5, Math.min(FAR, cam.dist * Math.exp(e.deltaY*0.0012)));
  st.lastTouch = performance.now(); dirty = true;
}, {passive:false});
function tap(x, y){
  const P = draw.P; if(!P) return;
  let best = null, bd = Infinity;
  words.forEach(w => {
    const p = P.get(w); if(!active(w)) return;
    const d = Math.hypot(p.x - x, p.y - y) - p.z*4;
    if(Math.hypot(p.x - x, p.y - y) < Math.max(18, p.r + 10) && d < bd){ bd = d; best = w; }
  });
  if(best) select(best); else if(st.sel){ st.sel = null; renderCard(); dirty = true; }
}
addEventListener("keydown", e => {
  if(SQSync.isOpen() || e.target.tagName === "INPUT") return;
  const k = e.key;
  if(k === "/"){ e.preventDefault(); $("q").focus(); return; }
  if(k === "ArrowLeft"){ cam.yaw -= 0.12; } else if(k === "ArrowRight"){ cam.yaw += 0.12; }
  else if(k === "ArrowUp"){ cam.pitch = clampPitch(cam.pitch - 0.1); } else if(k === "ArrowDown"){ cam.pitch = clampPitch(cam.pitch + 0.1); }
  else if(k === "+" || k === "="){ cam.dist = Math.max(1.5, cam.dist*0.88); } else if(k === "-"){ cam.dist = Math.min(FAR, cam.dist*1.13); }
  else if(k === "Escape" && st.sel){ st.sel = null; renderCard(); }
  else return;
  cam.ty = null; st.lastTouch = performance.now(); dirty = true;
});

/* ---------- selection card ---------- */
function select(w){
  st.sel = w;
  st.lastTouch = performance.now();
  lookAt(w.p, Math.min(cam.dist, 2.6));
  renderCard();
  dirty = true;
}
function renderCard(){
  const c = $("card");
  const w = st.sel;
  if(!w){
    c.innerHTML = `<p class="hint"><b>Chạm vào một chấm</b> để xem nghĩa, câu ví dụ và nghe phát âm.</p>
      <p class="hint">Kéo để xoay bản đồ. Chụm hai ngón (hoặc cuộn chuột) để phóng to. Chạm tên chủ đề ở chú thích để bay tới cụm đó.</p>`;
    return;
  }
  const t = topicById[w.topic], l = lessonById[w.l];
  const ex = w.ex ? esc(w.ex).replace("___", `<mark>${esc(w.w)}</mark>`) : "";
  const rel = relOf(w);
  c.innerHTML = `<button class="x" type="button" id="cClose" aria-label="Đóng">×</button>
    <div class="kicker"><span class="tag"><i style="background:${t.color}"></i>${esc(t.vi)}</span><span>${esc(w.t)}</span><span>· Bài ${esc(w.l)}${l ? " · " + esc(l.name) : ""}</span></div>
    <h2>${esc(w.w)}</h2>
    <p class="vi">${esc(w.vi)}</p>
    ${ex ? `<p class="ex">${ex}</p>` : ""}
    ${w.miss ? `<div class="misl${(w.miss.s||0) >= MASTER ? " ok" : ""}"><b>Sai ${w.miss.n} lần</b><span>đúng liền ${Math.min(w.miss.s||0, MASTER)}/${MASTER}</span>${w.miss.d ? `<span>sai gần nhất ${fmtDay(w.miss.d)}</span>` : ""}</div>` : ""}
    <div class="row"><button class="btn dark" type="button" id="cSay">Nghe</button><button class="btn" type="button" id="cSlow">Nghe chậm</button></div>
    ${rel.length ? `<div class="rel">Từ liên quan:${rel.map(r => `<button class="chip" type="button" data-w="${esc(r.w)}">${esc(r.w)}</button>`).join("")}</div>` : ""}
    ${l && l.game ? `<a href="${esc(l.game)}" target="_blank" rel="noopener">Ôn bài ${esc(l.id)} trong Spell Quest ↗</a>` : ""}
    ${l && l.game && w.miss && (w.miss.s||0) < MASTER ? `<a href="${esc(l.game)}#tu-hay-sai" target="_blank" rel="noopener">Ôn riêng các từ hay sai của bài ${esc(l.id)} ↗</a>` : ""}`;
  $("cClose").onclick = () => { st.sel = null; renderCard(); dirty = true; };
  $("cSay").onclick = () => say(w.w, false);
  $("cSlow").onclick = () => say(w.w, true);
  c.querySelectorAll(".rel .chip").forEach(b => b.onclick = () => select(byW.get(norm(b.dataset.w))));
}

/* ---------- legend & controls ---------- */
function renderLegend(){
  const g = groups();
  const L = $("legend");
  L.classList.toggle("iso", !!st.iso);
  const isMiss = st.mode === "miss";
  const hasMiss = words.some(w => w.miss);
  L.innerHTML = `<div class="lh">${st.mode === "topic" ? "Chủ đề (chạm để bay tới)" : st.mode === "lesson" ? "Bài học" : isMiss ? "Từ hay sai" + (MISTAKES.at ? ` · cập nhật ${esc(fmtAt(MISTAKES.at))}` : "") : "Loại từ"}</div>` +
    (isMiss && !hasMiss ? `<div class="lnote">Chưa có dữ liệu. Chơi phần 1 trong các bài Spell Quest, từ bạn viết sai sẽ tự hiện ở đây.</div>` : "") +
    g.map(x => `<button class="li" type="button" data-g="${esc(x.id)}" aria-pressed="${st.iso === x.id}"><i style="background:${x.color}"></i><span>${esc(x.name)}${x.sub && (st.mode === "lesson" || isMiss) ? ` <small>${esc(x.sub)}</small>` : ""}</span><small>${x.n}</small></button>`).join("") +
    (isMiss && needWords().length ? `<div class="lh">Sai nhiều nhất (chạm để xem)</div>` + needWords().slice(0, 8).map(w =>
      `<button class="li w" type="button" data-w="${esc(w.w)}"><i style="background:${colorOf(w)}"></i><span>${esc(w.w)}</span><small>${w.miss.n}×</small></button>`).join("") : "");
  L.querySelectorAll(".li[data-w]").forEach(b => b.onclick = () => { st.iso = null; select(byW.get(norm(b.dataset.w))); renderLegend(); });
  L.querySelectorAll(".li[data-g]").forEach(b => b.onclick = () => {
    const id = b.dataset.g;
    st.iso = st.iso === id ? null : id;
    if(st.mode === "topic" && st.iso){ const t = topicById[id]; lookAt(t.c, 2.7); }
    if(!st.iso){ cam.td = HOME.dist; }
    if(st.sel && !active(st.sel)){ st.sel = null; renderCard(); }
    st.lastTouch = performance.now();
    renderLegend(); dirty = true;
  });
}
$("modes").querySelectorAll("button").forEach(b => b.onclick = () => {
  st.mode = b.dataset.m; st.iso = null;
  $("modes").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  renderLegend(); dirty = true;
});
function toggle(id, key){
  const b = $(id);
  b.setAttribute("aria-pressed", String(st[key]));
  b.onclick = () => { st[key] = !st[key]; b.setAttribute("aria-pressed", String(st[key])); st.lastTouch = 0; dirty = true; };
}
toggle("tLabels","labels"); toggle("tLinks","links"); toggle("tAuto","auto");
$("tReset").onclick = () => {
  st.sel = null; st.iso = null; st.hits = null; $("q").value = ""; $("msg").textContent = "";
  cam.ty = HOME.yaw; cam.tp = HOME.pitch; cam.td = HOME.dist;
  renderLegend(); renderCard(); dirty = true;
};

/* ---------- search ---------- */
function doSearch(){
  const q = norm($("q").value);
  const m = $("msg");
  if(!q){ st.hits = null; m.textContent = ""; m.className = "msg"; dirty = true; return []; }
  const hits = words.filter(w => norm(w.w).includes(q) || norm(w.vi).includes(q));
  st.hits = new Set(hits);
  m.className = "msg" + (hits.length ? "" : " no");
  m.textContent = hits.length ? `${hits.length} từ khớp. Nhấn Enter để xem từ đầu tiên.` : "Chưa có từ này trên bản đồ.";
  dirty = true;
  return hits;
}
$("q").addEventListener("input", doSearch);
$("q").addEventListener("keydown", e => {
  if(e.key === "Enter"){ const h = doSearch(); if(h.length){ st.iso = null; renderLegend(); if(h.length === 1){ st.hits = null; $("msg").textContent = ""; } select(h[0]); $("q").blur(); } }
  if(e.key === "Escape"){ $("q").value = ""; doSearch(); $("q").blur(); }
});

/* ---------- voice ---------- */
const NOVELTY = /(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandpa|grandma|eddy|flo|reed|rocko|sandy|shelley)/i;
function vScore(v){
  const n = v.name.toLowerCase(); let s = 0;
  if(/premium/.test(n)) s += 60; else if(/enhanced|natural|neural|online/.test(n)) s += 45;
  if(/google/.test(n)) s += 30;
  if(/(ava|zoe|samantha|allison|susan|evan|nathan|serena|daniel|kate|oliver|karen|moira|tessa|aria|jenny|libby|sonia|ryan)/.test(n)) s += 15;
  if(/^en[-_]us/i.test(v.lang)) s += 6; else if(/^en[-_]gb/i.test(v.lang)) s += 5; else s += 2;
  return s;
}
const hasSys = "speechSynthesis" in window;
let voices = [], tts = null;
function loadVoices(){ if(hasSys) voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang) && !NOVELTY.test(v.name)).sort((a,b) => vScore(b) - vScore(a)); }
if(hasSys){ loadVoices(); try{ speechSynthesis.addEventListener("voiceschanged", loadVoices); }catch(_){ speechSynthesis.onvoiceschanged = loadVoices; } }
(async () => { try{ if(window.claude && typeof window.claude.use === "function") tts = await window.claude.use("tts"); }catch(_){ tts = null; } })();
function saySys(text, slow){
  if(!hasSys){ $("msg").textContent = "Thiết bị này không phát được âm thanh."; return; }
  const u = new SpeechSynthesisUtterance(text);
  const v = voices[0];
  if(v){ u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
  u.rate = slow ? 0.65 : 0.92;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function say(text, slow){
  try{
    if(tts){ tts.speak(text, {voice:"buttery", rate: slow ? 0.7 : 0.95, language:"en"}).catch(() => { tts = null; saySys(text, slow); }); }
    else saySys(text, slow);
  }catch(_){ saySys(text, slow); }
}

/* ---------- start ---------- */
function setMode(m){
  st.mode = m; st.iso = null;
  $("modes").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.m === m)));
  renderLegend(); dirty = true;
}
if(location.hash === "#hay-sai") setMode("miss");
addEventListener("hashchange", () => { if(location.hash === "#hay-sai") setMode("miss"); });
function refreshMistakes(){ MISTAKES = readMistakes(); linkMistakes(); renderLegend(); renderCard(); dirty = true; }
window.addEventListener("sq-sync", refreshMistakes);
window.addEventListener("storage", e => { if (e.key && e.key.startsWith("spellquest-miss-")) refreshMistakes(); });
fit();
renderLegend();
renderCard();
requestAnimationFrame(tick);
