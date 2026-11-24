/* Spell Quest: engine dùng chung cho mọi bài. Dữ liệu bài học nằm trong data/lessons/*.json. */
const LESSON = JSON.parse(document.getElementById("lesson-data").textContent);
const KEY = name => "spellquest-" + name + "-b" + LESSON.id;
const CUE = LESSON.words.some(w => w.img) ? "Nhìn hình" : "Đọc câu gợi ý";
const WORDS = LESSON.words;
/* mỗi lượt chơi mới trộn lại thứ tự từ; tránh lặp đúng thứ tự của lượt trước */
function mixWords(a, prev){
  const same = (x, y) => y && x.length === y.length && x.every((it, k) => it === y[k]);
  let r = a.slice();
  for(let t = 0; t < 6; t++){
    r = a.slice();
    for(let i = r.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    if(r.length < 2 || (!same(r, prev) && !(prev && prev.length && r[0] === prev[0]))) break;
  }
  return r;
}
let LIST = mixWords(WORDS);
WORDS.forEach(it => { if(it.img){ const im = new Image(); im.src = it.img; } });
const MAX_HEARTS = 3;
const $ = id => document.getElementById(id);

const S = {i:0, hearts:MAX_HEARTS, score:0, best:0, phase:"write", usedHint:false, firstShown:false, mode:"pen", typed:[]};
const MODE_KEY = KEY("mode");
try { S.best = parseInt(localStorage.getItem(KEY("best"))||"0",10)||0; } catch(e) {}

const HEART = [".XX.XX.","XXXXXXX","XXXXXXX",".XXXXX.","..XXX..","...X..."];
function heartSvg(full){
  let r = "";
  HEART.forEach((row,y)=>[...row].forEach((c,x)=>{ if(c==="X") r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
  return `<svg viewBox="0 0 7 6" shape-rendering="crispEdges" fill="${full?'var(--heart)':'var(--heart-dim)'}" aria-hidden="true">${r}</svg>`;
}
const pad4 = n => String(n).padStart(4,"0");
const pad2 = n => String(n).padStart(2,"0");

function renderHud(){
  $("hearts").innerHTML = Array.from({length:MAX_HEARTS},(_,k)=>heartSvg(k < S.hearts)).join("");
  $("hearts").setAttribute("aria-label", `Còn ${S.hearts} tim`);
  $("score").textContent = pad4(S.score);
  $("best").textContent = pad4(Math.max(S.best,S.score));
  $("track").innerHTML = LIST.map((_,k)=>`<i class="${k<S.i?'done':k===S.i?'now':''}"></i>`).join("");
}

const answerLetters = () => LIST[S.i].w.replace(/[ -]/g,"").toLowerCase();
function renderSlots(mode){
  const w = LIST[S.i].w, ans = answerLetters();
  let j = -1;
  $("slots").innerHTML = [...w].map((ch,k)=>{
    if(ch===" ") return `<span class="slot gap"></span>`;
    if(ch==="-") return `<span class="slot dash">-</span>`;
    j++;
    let show = "";
    let cls = "slot";
    if(mode==="answer"){ show = ch; cls += " ok"; }
    else if(S.mode==="type"){
      const t = S.typed[j];
      if(mode==="check"){ show = t || ""; cls += (t && t===ans[j]) ? " ok" : " bad"; }
      else {
        if(t){ show = t; cls += " shown"; }
        else if(j===0 && S.firstShown){ show = ch; cls += " hintl"; }
        if(j===S.typed.length) cls += " cur";
      }
    }
    else if(k===0 && S.firstShown){ show = ch; cls += " shown"; }
    return `<span class="${cls}">${escapeHtml(show)}</span>`;
  }).join("");
}

function renderTag(){
  const it = LIST[S.i];
  const letters = it.w.replace(/[ -]/g,"").length;
  const nw = it.w.split(" ").length;
  let h = `${escapeHtml(it.t)} · ${letters} chữ cái${nw>1?` · ${nw} từ`:""}${it.w.includes("-")?" · có dấu gạch nối":""}`;
  if(S.ipaShown && it.ipa) h += ` · <span class="ipa">/${escapeHtml(it.ipa)}/</span>`;
  $("tag").innerHTML = h;
}
function renderWord(){
  const it = LIST[S.i];
  const letters = it.w.replace(/[ -]/g,"").length;
  $("stage").textContent = `${S.review ? "ÔN TỪ SAI" : "STAGE"} ${pad2(S.i+1)}/${pad2(LIST.length)}`;
  $("card").classList.toggle("hasimg", !!it.img);
  $("pic").hidden = !it.img;
  if(it.img) $("pic").innerHTML = `<img src="${escapeHtml(it.img)}" alt="Hình món đồ cần đoán" draggable="false">`;
  $("meaning").textContent = it.img ? (it.h ? "Gợi ý: " + it.h : "") : (it.q || it.vi);
  renderTag();
  $("hintIpa").hidden = !it.ipa;
  $("hintIpa").classList.remove("on"); $("hintIpa").textContent = "PHIÊN ÂM";
  $("example").textContent = "";
  $("hintFirst").classList.remove("on");
  renderSlots("write");
}

function setStatus(msg, kind){
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

function renderActions(){
  const a = $("actions");
  if(S.mode==="type"){
    if(S.phase==="retry"){
      a.innerHTML = `<button class="btn big go" id="retryBtn" type="button">GÕ LẠI ↵</button>`;
      $("retryBtn").onclick = typeRetry;
    } else if(S.phase==="write"){
      a.innerHTML = `<button class="btn big go" id="checkBtn" type="button">KIỂM TRA ↵</button>`;
      $("checkBtn").onclick = typeSubmit;
    } else if(S.phase==="correct"){
      a.innerHTML = `<button class="btn big go" id="nextBtn" type="button">TỪ TIẾP ▶ ↵</button>`;
      $("nextBtn").onclick = typeNext;
    } else a.innerHTML = "";
    return;
  }
  if(S.phase==="write"){
    a.innerHTML = `<button class="btn big go" id="revealBtn" type="button">XEM ĐÁP ÁN</button>`;
    $("revealBtn").onclick = reveal;
  } else {
    a.innerHTML = `<button class="btn big go" id="rightBtn" type="button">ĐÚNG ✓</button><button class="btn big bad" id="wrongBtn" type="button">SAI ✗</button>`;
    $("rightBtn").onclick = markRight;
    $("wrongBtn").onclick = markWrong;
  }
}

function reveal(){
  if(!strokes.some(s=>!s.erase)){
    setStatus("Viết từ vào ô trước rồi mới xem đáp án nhé.", "err");
    return;
  }
  S.phase = "reveal";
  renderSlots("answer");
  showAnswer();
  setStatus("So từng chữ cái với chữ bạn viết. Bạn viết đúng không?");
  renderActions();
  $("rightBtn").focus();
}

function markRight(){
  recordResult(LIST[S.i].w, true);
  const gained = 100 + (S.usedHint ? 0 : 50);
  S.score += gained;
  saveBest();
  if(S.i === LIST.length-1){ renderHud(); showWin(); return; }
  S.i++;
  nextWordReset();
  setStatus(`Chính xác! +${gained} điểm. Sang từ tiếp theo.`, "good");
}

function markWrong(){
  recordResult(LIST[S.i].w, false);
  S.hearts--;
  renderHud();
  const hs = $("hearts").children;
  if(hs[S.hearts]) { hs[S.hearts].classList.add("pop"); }
  $("card").classList.remove("shake"); void $("card").offsetWidth; $("card").classList.add("shake");
  if(S.hearts <= 0){ showLose(); return; }
  S.phase = "write";
  clearCanvas();
  renderSlots("write");
  $("example").textContent = "";
  renderActions();
  setStatus(`Mất 1 tim, còn ${S.hearts}. Viết lại từ này nhé.`, "err");
}

/* answer + explanation shown under the card after answering */
function showAnswer(){
  const it = LIST[S.i];
  let h = `Đáp án: <em>${escapeHtml(it.w)}</em>` + (it.ipa ? ` <span class="ipa">/${escapeHtml(it.ipa)}/</span>` : "") + (it.vi ? ` · ${escapeHtml(it.vi)}` : "");
  if(it.ex) h += `<br>${escapeHtml(it.ex).replace("___", `<em>${escapeHtml(it.w)}</em>`).replace(/\[\[(.+?)\]\]/g, "<em>$1</em>")}`;
  $("example").innerHTML = h;
}

/* ---------- typing mode (computer keyboard) ---------- */
function typeSubmit(){
  if(S.mode!=="type" || S.phase!=="write") return;
  if(!S.typed.length){ setStatus("Gõ từ tiếng Anh trước rồi bấm Enter nhé.", "err"); return; }
  const ok = S.typed.join("") === answerLetters();
  renderSlots("check");
  if(ok){
    S.phase = "correct";
    renderActions();
    showAnswer();
    setStatus("Chính xác! Đọc giải thích rồi bấm Enter để sang từ tiếp theo.", "good");
    return;
  }
  recordResult(LIST[S.i].w, false);
  S.hearts--;
  renderHud();
  const hs = $("hearts").children;
  if(hs[S.hearts]) hs[S.hearts].classList.add("pop");
  $("card").classList.remove("shake"); void $("card").offsetWidth; $("card").classList.add("shake");
  showAnswer();
  if(S.hearts <= 0){
    S.phase = "busy"; renderActions();
    setStatus("Sai rồi, hết tim.", "err");
    setTimeout(showLose, 1200);
    return;
  }
  S.phase = "retry";
  renderActions();
  setStatus(`Sai rồi, mất 1 tim (còn ${S.hearts}). Ô đỏ là chữ sai. So với đáp án rồi bấm Enter để gõ lại.`, "err");
}
function typeNext(){
  if(S.phase!=="correct") return;
  S.phase = "busy";
  markRight();
}
function typeRetry(){
  if(S.phase!=="retry") return;
  S.phase = "write";
  S.typed = [];
  renderSlots("write");
  $("example").textContent = "";
  renderActions();
  setStatus(`Gõ lại từ này nhé. Còn ${S.hearts} tim.`);
}
function defaultMode(){
  try { const m = localStorage.getItem(MODE_KEY); if(m==="pen" || m==="type") return m; } catch(e) {}
  const touch = (navigator.maxTouchPoints||0) > 0 || (window.matchMedia && matchMedia("(pointer: coarse)").matches);
  return touch ? "pen" : "type";
}
function setMode(m, save){
  S.mode = m;
  $("app").classList.toggle("typing", m==="type");
  $("modeBtn").textContent = m==="type" ? "✎ CHUYỂN SANG VIẾT TAY" : "⌨ CHUYỂN SANG GÕ PHÍM";
  if(save){ try { localStorage.setItem(MODE_KEY, m); } catch(e) {} }
  S.phase = "write";
  S.typed = [];
  clearCanvas();
  renderSlots("write");
  $("example").textContent = "";
  renderActions();
  setStatus(m==="type" ? CUE + ", gõ từ tiếng Anh bằng bàn phím, rồi bấm Enter."
                       : CUE + ", viết từ tiếng Anh vào ô, rồi bấm “Xem đáp án”.");
  if(m==="pen") requestAnimationFrame(fit);
}
$("modeBtn").onclick = () => setMode(S.mode==="type" ? "pen" : "type", true);

document.addEventListener("keydown", e => {
  if(SQSync.isOpen() || S.mode!=="type" || $("viewWrite").hidden || !$("overlay").hidden) return;
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  const isLetter = /^[a-zA-Z'\-]$/.test(k);
  const isOther = k.length===1 && /\p{L}/u.test(k) && !isLetter;
  if(!isLetter && !isOther && !["Backspace","Enter"," ","1","2","3","4"].includes(k)) return;
  e.preventDefault();
  const ae = document.activeElement;
  if(ae && ae !== document.body && ae.blur) ae.blur();
  if(k==="Enter"){ if(e.repeat) return; if(S.phase==="retry") typeRetry(); else if(S.phase==="correct") typeNext(); else typeSubmit(); return; }
  if(k==="1"){ $("hintIpa").click(); return; }
  if(k==="2"){ say(false); return; }
  if(k==="3"){ say(true); return; }
  if(k==="4"){ $("hintFirst").click(); return; }
  if(S.phase!=="write") return;
  if(isOther){ setStatus("Có vẻ bộ gõ tiếng Việt đang bật. Chuyển sang E (tiếng Anh) rồi gõ lại nhé.", "err"); return; }
  if(k==="Backspace") S.typed.pop();
  else if(isLetter && /[-']/.test(k) && !answerLetters().includes(k)) return;
  else if(isLetter && S.typed.length < answerLetters().length) S.typed.push(k.toLowerCase());
  renderSlots("write");
  if($("status").classList.contains("err")) setStatus("Gõ xong thì bấm Enter.");
}, true);

function nextWordReset(){
  S.phase = "write";
  S.usedHint = false;
  S.firstShown = false;
  S.ipaShown = false;
  S.typed = [];
  clearCanvas();
  renderWord();
  renderHud();
  renderActions();
}

function saveBest(){
  if(S.score > S.best){ S.best = S.score; try{ localStorage.setItem(KEY("best"), String(S.best)); }catch(e){} SQSync.touch(LESSON.id); }
}

function openModal(kind, title, text, btn){
  $("modal").className = "modal " + kind;
  $("mTitle").textContent = title;
  $("mText").textContent = text;
  $("mBtn").textContent = btn;
  $("mBtn2").hidden = !S.review;
  $("overlay").hidden = false;
  $("mBtn").focus();
}
function showLose(){
  if(S.hearts > 0) return;
  saveBest();
  openModal("lose","GAME OVER",`Bạn đã sai 3 lần ở từ số ${S.i+1}. Điểm: ${S.score}. Chơi lại lượt mới, các từ sẽ được trộn lại.`,S.review ? "ÔN LẠI TỪ ĐẦU" : "CHƠI LẠI TỪ ĐẦU");
}
function showWin(){
  saveBest();
  openModal("win","YOU WIN!",`Bạn viết đúng cả ${LIST.length} từ, còn ${S.hearts} tim. Điểm: ${S.score}.`,S.review ? "ÔN LẠI" : "CHƠI LẠI");
}
$("mBtn").onclick = () => {
  $("overlay").hidden = true;
  if(S.review){
    const l = missLists().need.map(x => x.it);
    if(!l.length){ exitReview(); showView("miss"); return; }
    LIST = mixWords(l, LIST); $("track").style.setProperty("--n", LIST.length); $("revTxt").textContent = `ĐANG ÔN ${LIST.length} TỪ HAY SAI`;
  } else LIST = mixWords(WORDS, LIST);
  S.i = 0; S.hearts = MAX_HEARTS; S.score = 0;
  nextWordReset();
  setStatus("Lượt mới, thứ tự các từ đã được trộn lại. Cố lên!");
};

$("hintIpa").onclick = () => {
  const it = LIST[S.i];
  if(S.phase!=="write" || !it.ipa || S.ipaShown) return;
  S.ipaShown = true; S.usedHint = true;
  $("hintIpa").classList.add("on"); $("hintIpa").textContent = "PHIÊN ÂM ✓";
  renderTag();
};
$("hintFirst").onclick = () => {
  if(S.phase!=="write") return;
  S.firstShown = true; S.usedHint = true;
  $("hintFirst").classList.add("on");
  renderSlots("write");
};
/* ---------- voice ---------- */
const NOVELTY = /(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox)/i;
function voiceScore(v){
  const n = v.name.toLowerCase();
  let s = 0;
  if(/\b(fred|junior|ralph|kathy|grandpa|grandma|eddy|flo|reed|rocko|sandy|shelley)\b/.test(n)) s -= 20;
  if(/premium/.test(n)) s += 60;
  else if(/enhanced|natural|neural|online/.test(n)) s += 45;
  if(/google/.test(n)) s += 30;
  if(/(ava|zoe|samantha|allison|susan|evan|nathan|joelle|noelle|serena|daniel|kate|oliver|jamie|karen|moira|tessa|aria|jenny|guy|libby|sonia|ryan)/.test(n)) s += 15;
  if(/^en[-_]us/i.test(v.lang)) s += 6; else if(/^en[-_]gb/i.test(v.lang)) s += 5; else s += 2;
  return s;
}
let sysVoices = [], claudeTts = null, voiceChoice = "";
try { voiceChoice = localStorage.getItem(KEY("voice")) || ""; } catch(e) {}
const hasSys = "speechSynthesis" in window;

function loadVoices(){
  if(!hasSys) return;
  sysVoices = speechSynthesis.getVoices()
    .filter(v => /^en/i.test(v.lang) && !NOVELTY.test(v.name))
    .sort((a,b) => voiceScore(b) - voiceScore(a));
  fillVoiceSelect();
}
function fillVoiceSelect(){
  const sel = $("voiceSel");
  const opts = [];
  if(claudeTts) opts.push(`<option value="claude">Claude (tự nhiên nhất)</option>`);
  sysVoices.forEach(v => opts.push(`<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name)} · ${escapeHtml(v.lang)}</option>`));
  sel.innerHTML = opts.join("") || `<option value="">Không có giọng tiếng Anh</option>`;
  const ok = [...sel.options].some(o => o.value === voiceChoice);
  sel.value = ok ? voiceChoice : (sel.options[0] ? sel.options[0].value : "");
  const best = sysVoices[0];
  $("voiceTip").hidden = !!claudeTts || (best && voiceScore(best) >= 45);
  $("hintSay").hidden = $("hintSlow").hidden = !claudeTts && !hasSys;
  $("voiceSel").parentElement.hidden = !claudeTts && !sysVoices.length;
}
$("voiceSel").onchange = e => {
  voiceChoice = e.target.value;
  try { localStorage.setItem(KEY("voice"), voiceChoice); } catch(_) {}
};
if(hasSys){
  loadVoices();
  speechSynthesis.addEventListener ? speechSynthesis.addEventListener("voiceschanged", loadVoices) : (speechSynthesis.onvoiceschanged = loadVoices);
}
(async () => {
  try {
    if(window.claude && typeof window.claude.use === "function"){
      claudeTts = await window.claude.use("tts");
      if(claudeTts){ fillVoiceSelect(); }
    }
  } catch(e) { claudeTts = null; }
})();

function speakSystem(text, slow){
  if(!hasSys) return;
  const u = new SpeechSynthesisUtterance(text);
  const v = sysVoices.find(x => x.voiceURI === $("voiceSel").value) || sysVoices[0];
  if(v){ u.voice = v; u.lang = v.lang; } else { u.lang = "en-US"; }
  u.rate = slow ? 0.65 : 0.92;
  u.pitch = 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
function say(slow, txt){
  const text = txt || LIST[S.i].w;
  try{
    if(claudeTts && $("voiceSel").value === "claude"){
      claudeTts.speak(text, {voice:"buttery", rate: slow ? 0.7 : 0.95, language:"en"})
        .catch(err => {
          if(err && err.code === "not_granted"){ claudeTts = null; fillVoiceSelect(); }
          speakSystem(text, slow);
        });
    } else {
      speakSystem(text, slow);
    }
  }catch(e){ setStatus("Thiết bị này không phát được âm thanh.", "err"); }
}
$("hintSay").onclick = () => say(false);
$("hintSlow").onclick = () => say(true);

function escapeHtml(s){ return s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

/* ---------- writing pad ---------- */
const cv = $("cv"), ctx = cv.getContext("2d"), pad = $("pad");
let strokes = [], cur = null, curId = null;
let tool = "pen", color = "#5debc0", penOnly = false, penSeen = false;
const SIZES = [{n:"MẢNH",v:2.5},{n:"VỪA",v:4},{n:"ĐẬM",v:6.5}];
let sizeIdx = 1;

function fit(){
  const r = pad.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width*dpr));
  cv.height = Math.max(1, Math.round(r.height*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
  redraw();
}
function pt(e){
  const r = cv.getBoundingClientRect();
  const p = e.pointerType==="pen" ? (e.pressure || 0.5) : 0.5;
  return {x:e.clientX-r.left, y:e.clientY-r.top, p};
}
function widthFor(s, p){ return s.erase ? s.size*5 : s.size*(0.55 + p*0.9); }
function styleFor(s){
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
}
function drawDot(s){
  const a = s.pts[0];
  styleFor(s);
  ctx.beginPath(); ctx.arc(a.x, a.y, widthFor(s,a.p)/2, 0, Math.PI*2); ctx.fill();
}
function drawSeg(s, i){
  const P = s.pts;
  styleFor(s);
  ctx.lineWidth = widthFor(s, P[i].p);
  ctx.beginPath();
  if(i===1){
    const m = {x:(P[0].x+P[1].x)/2, y:(P[0].y+P[1].y)/2};
    ctx.moveTo(P[0].x,P[0].y); ctx.lineTo(m.x,m.y);
  } else {
    const a=P[i-2], b=P[i-1], c=P[i];
    ctx.moveTo((a.x+b.x)/2,(a.y+b.y)/2);
    ctx.quadraticCurveTo(b.x,b.y,(b.x+c.x)/2,(b.y+c.y)/2);
  }
  ctx.stroke();
}
function redraw(){
  ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height); ctx.restore();
  for(const s of strokes){ drawDot(s); for(let i=1;i<s.pts.length;i++) drawSeg(s,i); }
  ctx.globalCompositeOperation = "source-over";
  $("padhint").hidden = strokes.length > 0;
}
function clearCanvas(){ strokes = []; cur = null; redraw(); }

cv.addEventListener("pointerdown", e => {
  if(e.pointerType==="pen" && !penSeen){ penSeen = true; setPenOnly(true); }
  if(penOnly && e.pointerType==="touch") return;
  if(cur) return;
  e.preventDefault();
  try{ cv.setPointerCapture(e.pointerId); }catch(_){}
  curId = e.pointerId;
  cur = {color, size:SIZES[sizeIdx].v, erase:tool==="eraser", pts:[pt(e)]};
  strokes.push(cur);
  drawDot(cur);
  $("padhint").hidden = true;
  if($("status").classList.contains("err") && S.phase==="write") setStatus("Viết xong thì bấm “Xem đáp án”.");
});
cv.addEventListener("pointermove", e => {
  if(!cur || e.pointerId!==curId) return;
  e.preventDefault();
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for(const ev of (evs.length?evs:[e])){
    cur.pts.push(pt(ev));
    drawSeg(cur, cur.pts.length-1);
  }
  ctx.globalCompositeOperation = "source-over";
});
function endStroke(e){ if(cur && e.pointerId===curId){ cur = null; curId = null; } }
cv.addEventListener("pointerup", endStroke);
cv.addEventListener("pointercancel", endStroke);
cv.addEventListener("touchstart", e => { if(!penOnly || [...e.touches].some(t=>t.touchType==="stylus")) e.preventDefault(); }, {passive:false});
cv.addEventListener("touchmove", e => e.preventDefault(), {passive:false});

function setTool(t){
  tool = t;
  $("toolPen").classList.toggle("on", t==="pen");
  $("toolEraser").classList.toggle("on", t==="eraser");
}
function setPenOnly(v){
  penOnly = v;
  const b = $("penOnlyBtn");
  b.textContent = "CHỈ PENCIL: " + (v ? "BẬT" : "TẮT");
  b.classList.toggle("on", v);
  b.setAttribute("aria-pressed", String(v));
}
$("toolPen").onclick = () => setTool("pen");
$("toolEraser").onclick = () => setTool("eraser");
$("undoBtn").onclick = () => { strokes.pop(); redraw(); };
$("clearBtn").onclick = clearCanvas;
$("penOnlyBtn").onclick = () => setPenOnly(!penOnly);
$("sizeBtn").onclick = () => { sizeIdx = (sizeIdx+1)%SIZES.length; $("sizeBtn").textContent = "NÉT: " + SIZES[sizeIdx].n; };
document.querySelectorAll(".swatch").forEach(b => b.onclick = () => {
  color = b.dataset.color;
  document.querySelectorAll(".swatch").forEach(x=>x.classList.toggle("on", x===b));
  setTool("pen");
});

if("ResizeObserver" in window) new ResizeObserver(fit).observe(pad); else window.addEventListener("resize", fit);

document.addEventListener("keydown", e => {
  if(SQSync.isOpen() || !$("overlay").hidden) return;
  if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="z"){ e.preventDefault(); strokes.pop(); redraw(); }
});

/* ---------- part 2: common mistakes quiz ---------- */
const QUIZ = LESSON.quiz;
const Q = {order:[], pos:0, right:0, answered:false, results:[], best:0, view:"write"};
try { Q.best = parseInt(localStorage.getItem(KEY("qbest"))||"0",10)||0; } catch(e) {}
const KEYS = ["1","2","3","4"];
function shuffle(a){ a = a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function quizStart(indices){
  Q.order = shuffle(indices || QUIZ.map((_,k)=>k));
  Q.pos = 0; Q.right = 0; Q.results = [];
  $("qResult").hidden = true; $("qCard").hidden = false; $("qBar").hidden = false;
  quizRender();
}
function quizHud(){
  const n = Q.order.length;
  $("qNum").textContent = `${pad2(Math.min(Q.pos+1,n))}/${pad2(n)}`;
  $("qRight").textContent = pad2(Q.right);
  $("qBest").textContent = pad2(Q.best);
  $("qTrack").style.setProperty("--n", n);
  $("qTrack").innerHTML = Q.order.map((_,k)=>{
    const r = Q.results[k];
    return `<i class="${r===true?'done':r===false?'miss':k===Q.pos?'now':''}"></i>`;
  }).join("");
}
function quizRender(){
  const it = QUIZ[Q.order[Q.pos]];
  Q.answered = false;
  $("qStage").textContent = `CÂU ${pad2(Q.pos+1)}/${pad2(Q.order.length)}`;
  $("qTag").textContent = "Lỗi: " + it.tag;
  $("qText").innerHTML = escapeHtml(it.q).replace("___", `<span class="blank">______</span>`) + `<span class="vi">${escapeHtml(it.vi)}</span>`;
  const opts = shuffle(it.o.map((text,k)=>({text, ok:k===0})));
  $("qOpts").innerHTML = opts.map((o,k)=>`<button class="opt" type="button" data-ok="${o.ok}"><span class="k">${k+1}</span><span>${escapeHtml(o.text)}</span></button>`).join("");
  [...$("qOpts").children].forEach(b => b.onclick = () => quizPick(b));
  $("qExplain").hidden = true;
  $("qNext").hidden = true;
  $("qStatus").className = "status";
  $("qStatus").textContent = "Chọn đáp án đúng. Bấm vào ô hoặc nhấn phím 1 đến " + opts.length + ".";
  quizHud();
}
function quizPick(btn){
  if(Q.answered) return;
  Q.answered = true;
  const it = QUIZ[Q.order[Q.pos]];
  const ok = btn.dataset.ok === "true";
  Q.results[Q.pos] = ok;
  if(ok) Q.right++;
  [...$("qOpts").children].forEach(b => {
    b.disabled = true;
    if(b.dataset.ok === "true") b.classList.add("right");
    else if(b === btn) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  const ex = $("qExplain");
  ex.className = "explain" + (ok ? "" : " bad");
  ex.innerHTML = `<h3>${ok ? "ĐÚNG RỒI!" : "CHƯA ĐÚNG"}</h3><div>${escapeHtml(it.why)}</div><div class="rule">Ghi nhớ: ${escapeHtml(it.rule)}</div>`;
  ex.hidden = false;
  if(!ok){ $("qCard").classList.remove("shake"); void $("qCard").offsetWidth; $("qCard").classList.add("shake"); }
  $("qStatus").className = "status " + (ok ? "good" : "err");
  $("qStatus").textContent = ok ? "Chính xác. Đọc phần giải thích rồi sang câu tiếp." : "Đọc kỹ giải thích để hiểu vì sao nhé.";
  $("qNext").textContent = Q.pos === Q.order.length-1 ? "XEM KẾT QUẢ ▶" : "CÂU TIẾP ▶";
  $("qNext").hidden = false;
  $("qNext").focus();
  quizHud();
}
$("qNext").onclick = () => {
  if(!Q.answered) return;
  if(Q.pos < Q.order.length-1){ Q.pos++; quizRender(); }
  else quizFinish();
};
function quizFinish(){
  const n = Q.order.length;
  if(n === QUIZ.length && Q.right > Q.best){ Q.best = Q.right; try{ localStorage.setItem(KEY("qbest"), String(Q.best)); }catch(e){} SQSync.touch(LESSON.id); }
  const wrongIdx = Q.order.filter((_,k)=>Q.results[k]===false);
  const msg = Q.right === n ? "Hoàn hảo! Bạn đã nắm chắc các lỗi thường gặp." :
              Q.right >= n*0.75 ? "Rất tốt. Xem lại vài câu sai bên dưới là ổn." :
              "Cần ôn thêm. Đọc kỹ phần ghi nhớ của các câu sai rồi làm lại nhé.";
  const review = wrongIdx.map(k => {
    const it = QUIZ[k];
    const q = it.q.includes("___") ? escapeHtml(it.q).replace("___", `<b>${escapeHtml(it.o[0])}</b>`) : `${escapeHtml(it.q)} <b>${escapeHtml(it.o[0])}</b>`;
    return `<div>${q}<br><span style="color:var(--muted)">${escapeHtml(it.rule)}</span></div>`;
  }).join("");
  $("qResult").innerHTML = `<h2>KẾT QUẢ</h2><div class="big">${Q.right}/${n}</div><p style="margin:0;font-size:26px">${msg}</p>` +
    (wrongIdx.length ? `<div class="review"><div style="border:none;padding:0;color:var(--muted)">Các câu bạn làm sai (đáp án đúng tô vàng):</div>${review}</div>` : "") +
    `<div class="actions"><button class="btn big go" type="button" id="qAgain">LÀM LẠI TẤT CẢ</button>` +
    (wrongIdx.length ? `<button class="btn big" type="button" id="qRetry">LÀM LẠI CÂU SAI</button>` : "") + `</div>`;
  $("qCard").hidden = true; $("qBar").hidden = true; $("qResult").hidden = false;
  $("qAgain").onclick = () => quizStart();
  if(wrongIdx.length) $("qRetry").onclick = () => quizStart(wrongIdx);
  quizHud();
  $("qNum").textContent = `${pad2(n)}/${pad2(n)}`;
  $("qAgain").focus();
}

/* ---------- part 3: book exercises ---------- */
const EX = LESSON.exercises;
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
const LINT = LESSON.lint.map(r => [new RegExp(r.pattern, r.flags), r.message]);
function lint(t){ return LINT.filter(([re]) => re.test(t)).map(([,m]) => m); }
const norm = s => s.toLowerCase().replace(/[’‘]/g,"'").replace(/[.,!?;:]/g," ").replace(/\s+/g," ").trim();

const B = {ex:0, ans:{}, res:{}, shown:{}, active:null};
try { const saved = JSON.parse(localStorage.getItem(KEY("book"))||"null"); if(saved){ B.ans = saved.ans||{}; B.res = saved.res||{}; } } catch(e) {}
function bSave(){
  const body = JSON.stringify({ans:B.ans,res:B.res});
  let prev = null;
  try{ prev = localStorage.getItem(KEY("book")); localStorage.setItem(KEY("book"), body); }catch(e){}
  if(body !== prev) SQSync.touchBook(LESSON.id);
}
const key = (e,i) => `${EX[e].id}-${i}`;
const SCORED = () => EX.flatMap((ex,e) => {
  if(ex.type==="gaps") return ex.items.flatMap((it,i)=>it.t.map((g,j)=>typeof g==="object"&&!g.ex?key(e,i+"_"+j):null).filter(Boolean));
  if(ex.type==="fill") return ex.parts.map((p,i)=>typeof p==="object"&&!p.ex?key(e,i):null).filter(Boolean);
  if(ex.items) return ex.items.map((it,i)=>it.ex?null:key(e,i)).filter(Boolean);
  return [];
});
function bHud(){
  const all = SCORED();
  const ok = all.filter(k => B.res[k] === true).length;
  $("bNum").textContent = EX[B.ex].id;
  $("bScore").textContent = `${pad2(ok)}/${pad2(all.length)}`;
  $("exNav").innerHTML = EX.map((ex,e) => {
    const ks = all.filter(k => k.startsWith(ex.id+"-"));
    const done = ks.length && ks.every(k => B.res[k] === true);
    return `<button class="btn small${e===B.ex?' on':''}${done&&e!==B.ex?' done':''}" type="button" data-e="${e}">BÀI ${ex.id}</button>`;
  }).join("");
  [...$("exNav").children].forEach(b => b.onclick = () => { B.ex = +b.dataset.e; bRender(); });
}
function bStatus(msg, kind){ const el=$("bStatus"); el.textContent = msg; el.className = "status" + (kind?" "+kind:""); }

function bRender(){
  const ex = EX[B.ex], e = B.ex;
  B.active = null;
  let h = `<div class="exhead"><h2><span>${ex.id}</span>${escapeHtml(ex.en)}</h2></div>`;
  if(ex.type==="type"){
    h += `<div class="rows">` + ex.items.map((it,i) => {
      const k = key(e,i), v = it.ex ? it.a[0] : (B.ans[k] !== undefined ? B.ans[k] : (ex.wide ? it.p : ""));
      const cls = it.ex ? "exm" : B.res[k]===true ? "ok" : B.res[k]===false ? "no" : "";
      const pic = it.img ? `<img class="rimg" src="${escapeHtml(it.img)}" alt="Hình số ${i+1}">` : it.pic ? `<span class="pic" aria-hidden="true">${it.pic}</span>` : "";
      return `<div class="row${ex.wide?' wide':''}${it.img?' imgrow':''}"><span class="no-">${i+1}</span><div class="p">${pic}${escapeHtml(it.p)}</div>
        <input class="inp ${cls}" id="in-${k}" data-k="${k}" value="${escapeHtml(v)}" ${it.ex?'readonly aria-label="Ví dụ"':'aria-label="Câu trả lời '+(i+1)+'"'} autocomplete="off" autocapitalize="${ex.wide?'sentences':'off'}" autocorrect="off" spellcheck="false">
        <div class="fb" id="fb-${k}"></div></div>`;
    }).join("") + `</div>`;
  }
  if(ex.type==="gaps"){
    h += `<div class="rows">` + ex.items.map((it,i) => `<div class="row wide"><span class="no-">${i+1}</span><div class="p gl">` + it.t.map((g,j) => {
      if(typeof g === "string") return escapeHtml(g);
      const k = key(e, i+"_"+j), pre = g.p||"", suf = g.s||"";
      const full = g.a[0], exv = full.slice(pre.length, full.length - suf.length);
      const v = g.ex ? exv : (B.ans[k]||"");
      const cls = g.ex ? "exm" : B.res[k]===true ? "ok" : B.res[k]===false ? "no" : "";
      const w = Math.max(4, Math.max(...g.a.map(x=>x.length)) - pre.length - suf.length + 3);
      return `<span class="gw">${escapeHtml(pre)}<input class="inp gi ${cls}" style="width:${w}ch" id="in-${k}" data-k="${k}" value="${escapeHtml(v)}" ${g.ex?'readonly aria-label="Ví dụ"':'aria-label="Ô trống"'} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">${escapeHtml(suf)}</span>`;
    }).join("") + `</div><div class="fb" id="fb-${key(e,i)}"></div></div>`).join("") + `</div>`;
  }
  if(ex.type==="cross"){
    const cells = crossCells(ex), done = {};
    ex.items.forEach((it,i) => { done[i] = B.res[key(e,i)]; });
    let g = `<div class="xgrid" style="grid-template-columns:repeat(${ex.cols},46px)">`;
    for(let r=0;r<ex.rows;r++) for(let c=0;c<ex.cols;c++){
      const cell = cells[r+"_"+c];
      if(!cell){ g += `<span class="xb"></span>`; continue; }
      const ck = `${ex.id}-x${r}_${c}`, v = B.ans[ck]||"";
      const okc = cell.w.some(i => done[i]===true), noc = !okc && cell.w.some(i => done[i]===false);
      g += `<span class="xc${okc?' ok':noc?' no':''}">${cell.n?`<i>${cell.n}</i>`:""}<input id="x-${r}_${c}" data-r="${r}" data-c="${c}" value="${escapeHtml(v.toUpperCase())}" aria-label="Ô hàng ${r+1} cột ${c+1}" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false"></span>`;
    }
    g += `</div>`;
    const cl = ex.items.map((it,i) => `<div class="xclue" data-i="${i}"><b>${it.n} ${it.dir==="a"?"→":"↓"}</b><span><span class="pic" aria-hidden="true">${it.pic}</span>${escapeHtml(it.hint||"")} <span style="color:var(--muted)">(${it.a.length} chữ cái)</span></span><div class="fb" id="fb-${key(e,i)}"></div></div>`).join("");
    h += `<div class="xwrap">${g}<div class="xclues">${cl}</div></div>`;
  }
  if(ex.type==="fill"){
    h += `<div class="bank"><span class="lbl">Từ trong khung:</span>` + ex.box.map(w => `<button class="btn small" type="button" data-w="${w}">${w}</button>`).join("") + `</div>`;
    h += `<div class="para">` + ex.parts.map((p,i) => {
      if(typeof p === "string") return escapeHtml(p);
      const k = key(e,i), v = p.ex ? p.a : (B.ans[k]||"");
      const cls = p.ex ? "exm" : B.res[k]===true ? "ok" : B.res[k]===false ? "no" : "";
      return `<button class="gapb ${cls}" type="button" id="g-${k}" data-k="${k}" ${p.ex?'disabled':''} aria-label="Ô trống">${escapeHtml(v)||"&nbsp;"}</button>`;
    }).join("") + `</div><div class="fb" id="fbFill" style="grid-column:auto"></div>`;
  }
  if(ex.type==="sentence"){
    h += `<div class="rows">` + ex.items.map((it,i) => {
      const k = key(e,i), model = `${it.n} was born in ${it.b} and died in ${it.d}.`;
      const v = it.ex ? model : (B.ans[k]||"");
      const cls = it.ex ? "exm" : B.res[k]===true ? "ok" : B.res[k]===false ? "no" : "";
      return `<div class="row wide"><span class="no-">${i+1}</span><div class="p">${escapeHtml(it.n)} (${it.b}–${it.d})</div>
        <span></span><input class="inp ${cls}" id="in-${k}" data-k="${k}" value="${escapeHtml(v)}" ${it.ex?'readonly':''} placeholder="${escapeHtml(it.n)} was born in …" aria-label="Câu ${i+1}" autocomplete="off" autocapitalize="sentences" autocorrect="off" spellcheck="false">
        <div class="fb" id="fb-${k}"></div></div>`;
    }).join("") + `</div>`;
  }
  if(ex.type==="choose"){
    h += `<div class="rows">` + ex.items.map((it,i) => {
      const k = key(e,i), v = it.ex ? it.a : (B.ans[k]||"");
      const st = it.ex ? "" : B.res[k]===true ? "ok" : B.res[k]===false ? "no" : "";
      return `<div class="row${ex.wide?' wide':''}"><span class="no-">${i+1}</span><div class="p">${escapeHtml(it.p).replace("___", `<span style="color:var(--gold)">${v?escapeHtml(v):"______"}</span>`)}</div>
        <div class="chs">` + ex.choices.map(c => `<button class="btn ${c===v?(st||'sel'):''}" type="button" data-k="${k}" data-c="${c}" ${it.ex?'disabled':''}>${c}</button>`).join("") + `</div>
        <div class="fb" id="fb-${k}"></div></div>`;
    }).join("") + `</div>`;
  }
  if(ex.type==="free"){
    h += `<div class="rows">`;
    if(ex.example) h += `<div class="row wide"><span class="no-">1</span><input class="inp exm" readonly value="${escapeHtml(ex.example)}" aria-label="Ví dụ"></div>`;
    h += ex.frames.map((f,i) => {
      const k = key(e,i), n = i + (ex.example?2:1);
      return `<div class="row wide"><span class="no-">${n}</span><textarea class="inp" rows="1" id="in-${k}" data-k="${k}" placeholder="${escapeHtml(f)}" aria-label="Câu ${n}" autocapitalize="sentences" autocorrect="off" spellcheck="false">${escapeHtml(B.ans[k]||"")}</textarea>
        <div class="fb" id="fb-${k}"></div></div>`;
    }).join("") + `</div><div class="note">${escapeHtml(ex.note)}</div>`;
  }
  h += `<div class="model" id="model" hidden></div>`;
  $("exCard").innerHTML = h;
  bWire();
  const freeT = ex.type==="free";
  $("bActions").innerHTML = `<button class="btn" type="button" id="bReset">LÀM LẠI</button>
    <button class="btn" type="button" id="bShow">${freeT?"XEM BÀI MẪU":"XEM ĐÁP ÁN"}</button>
    <button class="btn big go" type="button" id="bCheck">KIỂM TRA</button>`;
  $("bCheck").onclick = bCheck; $("bShow").onclick = bShow; $("bReset").onclick = bReset;
  bStatus(freeT ? "Viết câu của bạn, rồi bấm Kiểm tra để dò các lỗi thường gặp." :
          ex.type==="fill" ? "Chạm vào ô trống, rồi chạm một từ trong khung để điền." :
          ex.type==="choose" ? "Chọn một đáp án cho mỗi câu." :
          ex.type==="gaps" ? "Gõ vào từng ô trống (chữ in sẵn trước hoặc sau ô là gợi ý), rồi bấm Kiểm tra." :
          ex.type==="cross" ? "Chạm một ô rồi gõ chữ, ô tự nhảy sang chữ kế tiếp. Chạm gợi ý để nhảy tới từ đó. Enter để kiểm tra." :
          "Gõ hoặc viết bằng Apple Pencil vào từng ô, rồi bấm Kiểm tra.");
  bHud();
}

function crossCells(ex){
  const m = {};
  ex.items.forEach((it,i) => [...it.a].forEach((ch,j) => {
    const r = it.r + (it.dir==="d"?j:0), c = it.c + (it.dir==="a"?j:0), id = r+"_"+c;
    if(!m[id]) m[id] = {ch, w:[], n:0};
    m[id].w.push(i);
    if(j===0) m[id].n = it.n;
  }));
  return m;
}
function crossWord(ex, i){
  const it = ex.items[i];
  return [...it.a].map((_,j) => (B.ans[`${ex.id}-x${it.r+(it.dir==="d"?j:0)}_${it.c+(it.dir==="a"?j:0)}`]||"").toLowerCase()).join("");
}
function bWire(){
  const ex = EX[B.ex];
  $("exCard").querySelectorAll(".inp[data-k]").forEach(el => el.addEventListener("input", () => {
    B.ans[el.dataset.k] = el.value; delete B.res[el.dataset.k];
    el.classList.remove("ok","no"); const fb=$("fb-"+el.dataset.k); if(fb){ fb.textContent=""; fb.className="fb"; }
    if($("bStatus").classList.contains("err")) bStatus("");
    bSave();
  }));
  if(ex.type==="fill"){
    const gaps = [...$("exCard").querySelectorAll(".gapb:not(:disabled)")];
    const setActive = g => { gaps.forEach(x=>x.classList.toggle("active", x===g)); B.active = g ? g.dataset.k : null; };
    gaps.forEach(g => g.onclick = () => setActive(g));
    setActive(gaps.find(g => !B.ans[g.dataset.k]) || gaps[0]);
    $("exCard").querySelectorAll(".bank .btn").forEach(b => b.onclick = () => {
      if(!B.active){ bStatus("Chạm vào một ô trống trước.", "err"); return; }
      const k = B.active, g = $("g-"+k);
      B.ans[k] = b.dataset.w; delete B.res[k];
      g.textContent = b.dataset.w; g.classList.remove("ok","no");
      bSave(); bStatus("");
      const next = gaps.find(x => !B.ans[x.dataset.k]);
      setActive(next || g);
    });
  }
  if(ex.type==="cross"){
    const inputs = [...$("exCard").querySelectorAll(".xgrid input")];
    const at = (r,c) => $("x-"+r+"_"+c);
    const cells = crossCells(ex);
    const step = (el, d) => {
      const r = +el.dataset.r, c = +el.dataset.c;
      const dirs = [B.xdir||"a", (B.xdir||"a")==="a"?"d":"a"];
      for(const dir of dirs){
        const n = dir==="a" ? at(r, c+d) : at(r+d, c);
        const inWord = cells[r+"_"+c].w.some(i => ex.items[i].dir===dir);
        if(n && inWord){ B.xdir = dir; n.focus(); n.select && n.select(); return; }
      }
    };
    const hl = i => $("exCard").querySelectorAll(".xclue").forEach(x => x.classList.toggle("on", +x.dataset.i===i));
    inputs.forEach(el => {
      el.addEventListener("focus", () => {
        try{ el.select(); }catch(_){}
        const ws = cells[el.dataset.r+"_"+el.dataset.c].w;
        if(ws.length===1) B.xdir = ex.items[ws[0]].dir;
        const i = ws.find(i => ex.items[i].dir===B.xdir); hl(i===undefined ? ws[0] : i);
      });
      el.addEventListener("input", ev => {
        const ch = (((ev.data || el.value) + "").match(/[a-z]/ig)||[]).pop() || "";
        if(el.value && !ch && /\p{L}/u.test(el.value)) bStatus("Có vẻ bộ gõ tiếng Việt đang bật. Chuyển sang E rồi gõ lại nhé.", "err");
        el.value = ch.toUpperCase();
        B.ans[`${ex.id}-x${el.dataset.r}_${el.dataset.c}`] = ch.toLowerCase();
        cells[el.dataset.r+"_"+el.dataset.c].w.forEach(i => delete B.res[key(B.ex,i)]);
        el.parentElement.classList.remove("ok","no");
        bSave();
        if(ch) step(el, 1);
      });
      el.addEventListener("keydown", ev => {
        if(ev.key==="Backspace" && !el.value){ ev.preventDefault(); step(el, -1); }
        else if(ev.key==="ArrowRight"){ B.xdir="a"; step(el,1); } else if(ev.key==="ArrowLeft"){ B.xdir="a"; step(el,-1); }
        else if(ev.key==="ArrowDown"){ B.xdir="d"; step(el,1); } else if(ev.key==="ArrowUp"){ B.xdir="d"; step(el,-1); }
        else if(ev.key==="Enter"){ ev.preventDefault(); bCheck(); }
      });
    });
    $("exCard").querySelectorAll(".xclue").forEach(x => x.onclick = () => {
      const it = ex.items[+x.dataset.i]; B.xdir = it.dir;
      const el = at(it.r, it.c); if(el) el.focus();
    });
  }
  if(ex.type==="choose"){
    $("exCard").querySelectorAll(".chs .btn").forEach(b => b.onclick = () => {
      B.ans[b.dataset.k] = b.dataset.c; delete B.res[b.dataset.k]; bSave(); bRender();
    });
  }
}

function bCheck(){
  const ex = EX[B.ex], e = B.ex;
  let total = 0, ok = 0, filled = 0, issues = 0;
  if(ex.type==="type" || ex.type==="sentence" || ex.type==="choose"){
    ex.items.forEach((it,i) => {
      if(it.ex) return;
      const k = key(e,i), v = (B.ans[k]||"").trim(); total++;
      const fb = $("fb-"+k), inp = $("in-"+k);
      if(!v){ delete B.res[k]; return; }
      filled++;
      let good = false, msg = "";
      if(ex.type==="type"){
        good = it.a.map(norm).includes(norm(v));
        const l = lint(v);
        msg = good ? "Đúng." : (l[0] || (it.hint ? "Chưa đúng. Gợi ý: " + it.hint : "Chưa đúng. Đọc lại và thử lại."));
      } else if(ex.type==="sentence"){
        const n = norm(v);
        const hasBorn = new RegExp(`\\bwas born in ${it.b}\\b`).test(n);
        const hasDied = new RegExp(`\\bdied in ${it.d}\\b`).test(n);
        const l = lint(v);
        good = hasBorn && hasDied && !l.length;
        msg = good ? "Đúng." : l[0] || (!hasBorn ? `Cần có “was born in ${it.b}”.` : `Cần có “died in ${it.d}”.`);
      } else {
        good = v === it.a;
        msg = good ? "Đúng. " + it.why : "Chưa đúng. Gợi ý: " + it.why.split(":")[0] + ".";
      }
      B.res[k] = good; if(good) ok++;
      if(inp){ inp.classList.toggle("ok", good); inp.classList.toggle("no", !good); }
      if(fb){ fb.textContent = msg; fb.className = "fb " + (good ? "ok" : "no"); }
    });
    if(ex.type==="choose") { bSave(); const keep = {}; ex.items.forEach((it,i)=>{ const k=key(e,i); keep[k]=$("fb-"+k)?.textContent||""; }); bRender(); ex.items.forEach((it,i)=>{ const k=key(e,i), fb=$("fb-"+k); if(fb&&keep[k]){ fb.textContent=keep[k]; fb.className="fb "+(B.res[k]?"ok":"no"); } }); }
  }
  if(ex.type==="gaps"){
    ex.items.forEach((it,i) => {
      const msgs = []; let rowFilled = false, rowBad = false;
      it.t.forEach((g,j) => {
        if(typeof g !== "object" || g.ex) return;
        const k = key(e, i+"_"+j), v = (B.ans[k]||"").trim(), inp = $("in-"+k); total++;
        if(!v){ delete B.res[k]; if(inp) inp.classList.remove("ok","no"); return; }
        filled++; rowFilled = true;
        const A = g.a.map(norm), pre = g.p||"", suf = g.s||"", good = [v, pre+v, v+suf, pre+v+suf].some(x => A.includes(norm(x)));
        B.res[k] = good; if(good) ok++; else { rowBad = true; msgs.push(lint(v)[0] || g.hint || ""); }
        if(inp){ inp.classList.toggle("ok", good); inp.classList.toggle("no", !good); }
      });
      const fb = $("fb-"+key(e,i));
      if(fb){
        if(!rowFilled){ fb.textContent = ""; fb.className = "fb"; }
        else if(rowBad){ fb.textContent = "Ô đỏ chưa đúng. " + (msgs.filter(Boolean)[0] ? "Gợi ý: " + msgs.filter(Boolean)[0] : "Đọc lại câu và thử lại."); fb.className = "fb no"; }
        else { fb.textContent = "Đúng."; fb.className = "fb ok"; }
      }
    });
  }
  if(ex.type==="fill"){
    const wrong = [];
    ex.parts.forEach((p,i) => {
      if(typeof p !== "object" || p.ex) return;
      const k = key(e,i), v = B.ans[k]||""; total++;
      if(!v){ delete B.res[k]; return; }
      filled++;
      const good = v.toLowerCase() === p.a.toLowerCase();
      B.res[k] = good; if(good) ok++; else wrong.push(p.a);
      const g = $("g-"+k); g.classList.toggle("ok", good); g.classList.toggle("no", !good);
    });
    const fb = $("fbFill");
    fb.textContent = wrong.length ? "Ô đỏ chưa đúng. Gợi ý: " + wrong.map(a => ex.why[a]).join(" · ") : (filled ? "Các ô đã điền đều đúng." : "");
    fb.className = "fb " + (wrong.length ? "no" : "ok");
  }
  if(ex.type==="cross"){
    ex.items.forEach((it,i) => {
      const k = key(e,i), v = crossWord(ex, i); total++;
      const fb = $("fb-"+k);
      if(!v.replace(/ /g,"")){ delete B.res[k]; if(fb) fb.textContent=""; return; }
      filled++;
      const good = v === it.a;
      B.res[k] = good; if(good) ok++;
    });
    bSave(); const msgs = {}; ex.items.forEach((it,i) => { const k = key(e,i); msgs[k] = B.res[k]===true ? "Đúng." : B.res[k]===false ? (crossWord(ex,i).length < it.a.length ? "Còn ô trống." : "Chưa đúng, kiểm tra lại từng chữ.") : ""; });
    bRender();
    ex.items.forEach((it,i) => { const k = key(e,i), fb = $("fb-"+k); if(fb && msgs[k]){ fb.textContent = msgs[k]; fb.className = "fb " + (B.res[k] ? "ok" : "no"); } });
  }
  if(ex.type==="free"){
    ex.frames.forEach((f,i) => {
      const k = key(e,i), v = (B.ans[k]||"").trim(), fb = $("fb-"+k);
      if(!v){ fb.textContent=""; return; }
      filled++;
      const l = lint(v);
      if(ex.needBorn && !/\b(was|were)\s+born\b/i.test(v)) l.push("Câu nên có was born / were born.");
      if(ex.needBorn && !/\b(1\d{3}|20\d{2})\b/.test(v)) l.push("Thêm năm sinh để trả lời câu hỏi When?");
      if(!/[.!?]\s*$/.test(v)) l.push("Nhớ kết thúc câu bằng dấu chấm.");
      if(!/^[A-Z]/.test(v)) l.push("Viết hoa chữ cái đầu câu.");
      issues += l.length;
      fb.textContent = l.length ? l.join(" ") : "Không thấy lỗi thường gặp nào.";
      fb.className = "fb " + (l.length ? "warn" : "ok");
    });
    if(!filled){ bStatus("Viết ít nhất một câu trước khi kiểm tra.", "err"); return; }
    bStatus(issues ? `Có ${issues} điểm cần xem lại (chữ vàng).` : "Tốt lắm! Không thấy lỗi thường gặp nào.", issues ? "" : "good");
    return;
  }
  bSave(); bHud();
  if(!filled){ bStatus("Điền ít nhất một ô trước khi kiểm tra.", "err"); return; }
  bStatus(`Đúng ${ok}/${total}.` + (filled < total ? ` Còn ${total-filled} ô chưa làm.` : ok===total ? " Xuất sắc!" : " Sửa ô đỏ rồi kiểm tra lại."), ok===total ? "good" : "");
}

function bShow(){
  const ex = EX[B.ex], m = $("model");
  let lines = [];
  if(ex.type==="type") lines = ex.items.map((it,i)=>`${i+1}. ${it.a[0]}${it.a.length>1&&!it.ex?` (cũng đúng: ${it.a.slice(1).filter(x=>!/^(a|the|to) /.test(x)).join(", ")||"—"})`:""}`.replace(" (cũng đúng: —)",""));
  if(ex.type==="fill") lines = [ex.parts.map(p => typeof p==="string" ? p : p.a.toUpperCase()).join("")];
  if(ex.type==="sentence") lines = ex.items.map((it,i)=>`${i+1}. ${it.n} was born in ${it.b} and died in ${it.d}.`);
  if(ex.type==="choose") lines = ex.items.map((it,i)=>`${i+1}. ${it.p.replace("___", it.a.toUpperCase())}`);
  if(ex.type==="free") lines = ex.model;
  if(ex.type==="gaps") lines = ex.items.map((it,i) => {
    const alts = [];
    const t = it.t.map(g => { if(typeof g === "string") return g; if(g.a.length > 1 && !g.ex) alts.push(g.a.slice(1).join(", ")); return g.a[0].toUpperCase(); }).join("");
    return `${i+1}. ${t}` + (alts.length ? ` (cũng đúng: ${alts.join("; ")})` : "");
  });
  if(ex.type==="cross") lines = ex.items.map(it => `${it.n} ${it.dir==="a"?"→":"↓"} ${it.a.toUpperCase()}`);
  m.innerHTML = `<h3>${ex.type==="free"?"BÀI MẪU (bạn viết theo thông tin của mình)":"ĐÁP ÁN"}</h3>` + lines.map(l=>`<div>${escapeHtml(l)}</div>`).join("");
  m.hidden = !m.hidden;
  $("bShow").textContent = m.hidden ? (ex.type==="free"?"XEM BÀI MẪU":"XEM ĐÁP ÁN") : "ẨN";
}
function bReset(){
  const id = EX[B.ex].id + "-";
  Object.keys(B.ans).forEach(k => { if(k.startsWith(id)) delete B.ans[k]; });
  Object.keys(B.res).forEach(k => { if(k.startsWith(id)) delete B.res[k]; });
  bSave(); bRender();
}

function showView(v){
  Q.view = v;
  const map = {write:["viewWrite","hudWrite","tabWrite","#viet-tu"], quiz:["viewQuiz","hudQuiz","tabQuiz","#trac-nghiem"], book:["viewBook","hudBook","tabBook","#bai-tap"], miss:["viewMiss","hudMiss","tabMiss","#tu-hay-sai"]};
  Object.entries(map).forEach(([name,[view,hud,tab]]) => {
    const on = name === v;
    $(view).hidden = !on; $(hud).hidden = !on;
    $(tab).classList.toggle("on", on); $(tab).setAttribute("aria-pressed", String(on));
  });
  try { if(window.speechSynthesis) speechSynthesis.cancel(); } catch(e) {}
  try { history.replaceState(null, "", map[v][3]); } catch(e) {}
  if(v === "write") fit();
  if(v === "miss") renderMiss();
}
const viewFromHash = () => location.hash === "#tu-hay-sai" ? "miss" : (location.hash === "#trac-nghiem" && QUIZ.length) ? "quiz" : (location.hash === "#bai-tap" && EX.length) ? "book" : "write";
$("tabWrite").onclick = () => { if(S.review) exitReview(); showView("write"); };
$("tabQuiz").onclick = () => showView("quiz");
$("tabBook").onclick = () => showView("book");
$("tabQuiz").hidden = !QUIZ.length;
$("tabBook").hidden = !EX.length;
$("tabs").hidden = false;

/* ---------- từ hay sai: ghi mỗi lần sai, lưu trên máy và đồng bộ qua Supabase (src/sync/sync.js) ---------- */
const MISS_KEY = KEY("miss");
const MASTER = 3;
const M = {stats:{}, wipeArm:false};
const wkey = w => String(w).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "x";
try { M.stats = JSON.parse(localStorage.getItem(MISS_KEY)||"{}") || {}; } catch(e) { M.stats = {}; }
function missSaveLocal(){ try{ localStorage.setItem(MISS_KEY, JSON.stringify(M.stats)); }catch(e){} }
function recordResult(w, ok){
  const k = wkey(w);
  let s = M.stats[k];
  if(ok && !s) return;
  if(!s) s = {w, wrong:0, right:0, streak:0, last:0, lastWrong:0};
  const at = SQSync.stamp(LESSON.id, s.last);
  if(ok){ s.right++; s.streak++; } else { s.wrong++; s.streak = 0; s.lastWrong = at; }
  s.w = w; s.last = at;
  M.stats[k] = s;
  missSaveLocal(); SQSync.touch(LESSON.id); missHud();
  if(!$("viewMiss").hidden) renderMiss();
}
function missItems(){
  const byKey = {};
  WORDS.forEach(it => { byKey[wkey(it.w)] = it; });
  return Object.entries(M.stats).filter(([k,s]) => s && s.wrong > 0 && byKey[k]).map(([k,s]) => Object.assign({k, it:byKey[k]}, s));
}
function missLists(){
  const all = missItems();
  const need = all.filter(x => x.streak < MASTER).sort((a,b) => b.wrong - a.wrong || b.lastWrong - a.lastWrong);
  const fixed = all.filter(x => x.streak >= MASTER).sort((a,b) => b.wrong - a.wrong);
  return {need, fixed};
}
function missHud(){
  const {need, fixed} = missLists();
  $("mNeed").textContent = pad2(need.length);
  $("mFixed").textContent = pad2(fixed.length);
  $("tabMiss").textContent = "TỪ HAY SAI" + (need.length ? ` (${need.length})` : "");
}
function fmtDay(t){ if(!t) return ""; const d = new Date(t); return `${d.getDate()}/${d.getMonth()+1}`; }
function missRow(x, max, fixed){
  const pct = Math.max(8, Math.round(x.wrong / max * 100));
  const sub = fixed ? "đã đúng 3 lần liền" : `đúng liền ${x.streak}/${MASTER} · sai gần nhất ${fmtDay(x.lastWrong)}`;
  return `<div class="mrow${fixed?' fixed':''}"><button class="btn say" type="button" data-say="${escapeHtml(x.it.w)}" aria-label="Nghe ${escapeHtml(x.it.w)}">▶</button>
    <div><div class="mw">${x.it.img ? `<img src="${escapeHtml(x.it.img)}" alt="">` : ""}${escapeHtml(x.it.w)}${x.it.ipa ? `<span class="ipa">/${escapeHtml(x.it.ipa)}/</span>` : ""}</div><div class="mv">${escapeHtml(x.it.vi || "")}</div></div>
    <div class="mc">${x.wrong} lần sai<small>${sub}</small><span class="mbar" style="width:${pct}px"></span></div></div>`;
}
function renderMiss(){
  const {need, fixed} = missLists();
  const max = Math.max(1, ...need.map(x => x.wrong), ...fixed.map(x => x.wrong));
  let h = `<div class="mhead"><h2>Từ hay sai</h2><span class="sync">${SQSync.signedIn() ? "Đồng bộ giữa iPad và máy tính" : "Chỉ lưu trên máy này"}</span></div>
    <p class="mintro">Mỗi lần viết sai ở phần 1 đều được ghi lại. Viết đúng ${MASTER} lần liền thì từ chuyển xuống mục “Đã sửa được”.</p>`;
  if(!need.length && !fixed.length){
    h += `<div class="mempty">Chưa có từ nào bị sai. Chơi phần 1, từ nào bạn viết sai sẽ hiện ở đây.</div>`;
  } else {
    h += need.length ? `<div class="mlist">${need.map(x => missRow(x, max, false)).join("")}</div>`
                     : `<div class="mempty">Không còn từ nào cần ôn. Giỏi lắm!</div>`;
    if(fixed.length) h += `<div class="msec">Đã sửa được (${fixed.length})</div><div class="mlist">${fixed.map(x => missRow(x, max, true)).join("")}</div>`;
  }
  $("missCard").innerHTML = h;
  $("missCard").querySelectorAll("[data-say]").forEach(b => b.onclick = () => say(false, b.dataset.say));
  const a = $("mActions");
  a.innerHTML = (need.length ? `<button class="btn big go" type="button" id="mReview">ÔN ${need.length} TỪ NÀY ▶</button>` : "") +
    (need.length || fixed.length ? `<button class="btn wipe" type="button" id="mWipe">XOÁ THỐNG KÊ</button>` : "");
  if($("mReview")) $("mReview").onclick = startReview;
  if($("mWipe")) $("mWipe").onclick = wipeMiss;
  M.wipeArm = false;
  $("mStatus").className = "status";
  $("mStatus").textContent = need.length ? `Có ${need.length} từ cần ôn, xếp theo số lần sai.` : "";
  missHud();
}
function wipeMiss(){
  const b = $("mWipe");
  if(!M.wipeArm){ M.wipeArm = true; b.classList.add("arm"); b.textContent = "BẤM LẦN NỮA ĐỂ XOÁ"; $("mStatus").textContent = "Thao tác này xoá toàn bộ lịch sử sai của bài này."; return; }
  const maxLast = Math.max(0, ...Object.values(M.stats).map(s => (s && s.last) || 0));
  M.stats = {}; missSaveLocal();
  SQSync.wipe(LESSON.id, maxLast);
  renderMiss();
  $("mStatus").textContent = "Đã xoá thống kê.";
}
function startReview(){
  const list = missLists().need.map(x => x.it);
  if(!list.length) return;
  LIST = mixWords(list); S.review = true;
  S.i = 0; S.hearts = MAX_HEARTS; S.score = 0;
  $("track").style.setProperty("--n", LIST.length);
  $("revBar").hidden = false;
  $("revTxt").textContent = `ĐANG ÔN ${LIST.length} TỪ HAY SAI`;
  showView("write");
  nextWordReset();
  setStatus(`Đang ôn ${LIST.length} từ hay sai. Viết đúng ${MASTER} lần liền thì từ được tính là đã sửa.`);
}
function exitReview(){
  LIST = mixWords(WORDS, LIST); S.review = false;
  $("revBar").hidden = true;
  S.i = 0; S.hearts = MAX_HEARTS; S.score = 0;
  $("track").style.setProperty("--n", LIST.length);
  nextWordReset();
  setStatus("Đã quay lại chơi đủ các từ của bài.");
}
$("exitReview").onclick = exitReview;
$("revList").onclick = () => { exitReview(); showView("miss"); };
$("mBtn2").onclick = () => { $("overlay").hidden = true; exitReview(); showView("miss"); };
$("tabMiss").onclick = () => showView("miss");
function syncApply(){
  try { M.stats = JSON.parse(localStorage.getItem(MISS_KEY)||"{}") || {}; } catch(e) { M.stats = {}; }
  S.best = Math.max(S.best, parseInt(localStorage.getItem(KEY("best"))||"0",10)||0);
  Q.best = Math.max(Q.best, parseInt(localStorage.getItem(KEY("qbest"))||"0",10)||0);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY("book"))||"null"); } catch(e) {}
  const ans = (saved && saved.ans) || {}, res = (saved && saved.res) || {};
  if(JSON.stringify({ans,res}) !== JSON.stringify({ans:B.ans,res:B.res})){
    B.ans = ans; B.res = res;
    if(EX.length){
      /* đang gõ dở thì chờ rời ô rồi mới vẽ lại, tránh mất con trỏ */
      if($("viewBook").contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) B.stale = true;
      else bRender();
    }
  }
  missHud(); renderHud();
  if(QUIZ.length) quizHud();
  if(!$("viewMiss").hidden) renderMiss();
}
$("viewBook").addEventListener("focusout", e => {
  if(!B.stale || (e.relatedTarget && $("viewBook").contains(e.relatedTarget))) return;
  B.stale = false; bRender();
});
window.addEventListener("sq-sync", e => { if(e.detail.lessons.includes(LESSON.id)) syncApply(); });
window.addEventListener("sq-sync-auth", () => { if(!$("viewMiss").hidden) renderMiss(); });
window.addEventListener("storage", e => { if([MISS_KEY, KEY("best"), KEY("qbest"), KEY("book")].includes(e.key)) syncApply(); });
missHud();
window.addEventListener("hashchange", () => showView(viewFromHash()));
if(EX.length) bRender();
document.addEventListener("keydown", e => {
  if(SQSync.isOpen() || Q.view !== "quiz" || e.metaKey || e.ctrlKey || e.altKey) return;
  if(!Q.answered && $("qResult").hidden){
    const k = KEYS.indexOf(e.key);
    const b = $("qOpts").children[k];
    if(b){ e.preventDefault(); quizPick(b); }
  } else if(e.key === "Enter" && !$("qNext").hidden && document.activeElement !== $("qNext")){
    e.preventDefault(); $("qNext").click();
  }
});
if(QUIZ.length) quizStart();
showView(viewFromHash());

$("track").style.setProperty("--n", LIST.length);
renderWord();
renderHud();
setMode(defaultMode(), false);
fit();
