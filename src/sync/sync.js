/* Đồng bộ tiến độ qua Supabase. localStorage vẫn là nơi giao diện đọc, nên web chạy được cả khi mất mạng. */
(() => {
  const CFG = window.SQ_SYNC_CONFIG || null;
  const enabled = !!(CFG && CFG.url && CFG.key);
  const SESSION = "spellquest-sync-session", DIRTY = "spellquest-sync-dirty";
  const k = (name, id) => "spellquest-" + name + "-b" + id;
  const metaKey = id => "spellquest-syncmeta-b" + id;
  const int = v => Math.max(0, Math.floor(Number(v)) || 0);
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; } };
  const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} };
  const token36 = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
  const canon = v => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
    : v && typeof v === "object" ? "{" + Object.keys(v).sort().map(x => JSON.stringify(x) + ":" + canon(v[x])).join(",") + "}"
    : JSON.stringify(v ?? null);
  const hasBook = b => !!b && (Object.keys(b.ans || {}).length > 0 || Object.keys(b.res || {}).length > 0);

  const session = () => read(SESSION, null);
  const signedIn = () => enabled && !!session();
  const dirtyMap = () => read(DIRTY, {}) || {};
  function markDirty(id) { const d = dirtyMap(); d[id] = token36(); write(DIRTY, d); }
  function localIds() {
    const ids = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const m = /^spellquest-(?:best|qbest|book|miss)-b(\d+)$/.exec(localStorage.key(i) || "");
      if (m) ids.add(m[1]);
    }
    return [...ids];
  }

  function snapshot(id) {
    const meta = read(metaKey(id), {}) || {}, book = read(k("book", id), null), stats = {};
    Object.entries(read(k("miss", id), {}) || {}).forEach(([key, s]) => {
      if (s && s.w) stats[key] = {w: String(s.w), wrong: int(s.wrong), right: int(s.right), streak: int(s.streak), last: int(s.last), lastWrong: int(s.lastWrong)};
    });
    return {
      id: Number(id), best: int(read(k("best", id), 0)), quizBest: int(read(k("qbest", id), 0)),
      book: hasBook(book) ? {ans: book.ans || {}, res: book.res || {}} : {},
      bookAt: int(meta.bookAt), wipedAt: int(meta.wipedAt), stats
    };
  }

  function store(id, v) {
    let changed = false;
    const put = (key, value) => {
      const had = read(key, null);
      if (canon(had) === canon(value)) return;
      try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); changed = true; } catch (e) {}
    };
    put(k("best", id), v.best || null);
    put(k("qbest", id), v.quizBest || null);
    put(k("book", id), hasBook(v.book) ? {ans: v.book.ans || {}, res: v.book.res || {}} : null);
    put(k("miss", id), Object.keys(v.stats || {}).length ? v.stats : null);
    write(metaKey(id), {bookAt: int(v.bookAt), wipedAt: int(v.wipedAt)});
    return changed;
  }

  /* Cùng quy tắc với hàm sync_progress trong database. */
  function mergeLesson(l, s) {
    const wipedAt = Math.max(l.wipedAt, s.wipedAt), stats = {};
    for (const key of new Set([...Object.keys(l.stats), ...Object.keys(s.stats)])) {
      const a = l.stats[key] && l.stats[key].last > wipedAt ? l.stats[key] : null;
      const b = s.stats[key] && s.stats[key].last > wipedAt ? s.stats[key] : null;
      if (!a && !b) continue;
      if (!a || !b) { stats[key] = a || b; continue; }
      const newer = a.last >= b.last ? a : b;
      stats[key] = {...newer, wrong: Math.max(a.wrong, b.wrong), right: Math.max(a.right, b.right), last: Math.max(a.last, b.last), lastWrong: Math.max(a.lastWrong, b.lastWrong)};
    }
    const localBook = l.bookAt >= s.bookAt;
    return {id: l.id, best: Math.max(l.best, s.best), quizBest: Math.max(l.quizBest, s.quizBest), book: localBook ? l.book : s.book, bookAt: Math.max(l.bookAt, s.bookAt), wipedAt, stats};
  }

  function applyServer(data, sent) {
    const changed = [], dirty = dirtyMap();
    let more = false;
    for (const raw of data.lessons || []) {
      const id = String(raw.id), local = snapshot(id);
      const row = {id: raw.id, best: int(raw.best), quizBest: int(raw.quizBest), book: raw.book || {}, bookAt: int(raw.bookAt), wipedAt: int(raw.wipedAt), stats: raw.stats || {}};
      const touched = (dirty[id] || "") !== (sent[id] || "");
      let next = touched ? mergeLesson(local, row) : row;
      /* Bài làm cũ từ trước khi có đồng bộ không có mốc thời gian: gộp để không thiết bị nào mất bài. */
      if (!local.bookAt && hasBook(local.book)) {
        const book = {ans: {...local.book.ans, ...(row.book.ans || {})}, res: {...local.book.res, ...(row.book.res || {})}};
        if (canon(book) !== canon(row.book)) { next = {...next, book, bookAt: Math.max(Date.now(), row.bookAt + 1)}; dirty[id] = token36(); more = true; }
      }
      if (store(id, next)) changed.push(raw.id);
    }
    for (const id of Object.keys(sent)) if (dirty[id] === sent[id]) delete dirty[id];
    write(DIRTY, dirty);
    if (changed.length) window.dispatchEvent(new CustomEvent("sq-sync", {detail: {lessons: changed}}));
    return more;
  }

  const headers = bearer => {
    const h = {apikey: CFG.key, "Content-Type": "application/json"};
    if (bearer) h.Authorization = "Bearer " + bearer;
    return h;
  };
  const authUrl = path => CFG.url + "/auth/v1/" + path;

  function saveSession(j, prev) {
    const s = {
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      email: (j.user && j.user.email) || (prev && prev.email) || "", uid: (j.user && j.user.id) || (prev && prev.uid) || ""
    };
    write(SESSION, s);
    return s;
  }
  function dropSession() {
    try { localStorage.removeItem(SESSION); } catch (e) {}
    window.dispatchEvent(new CustomEvent("sq-sync-auth"));
  }

  /* Khoá giữa các tab để hai tab không cùng dùng một refresh token. */
  async function accessToken(rejected) {
    const s = session();
    if (!s) return null;
    if (s.access_token !== rejected && s.expires_at * 1000 - Date.now() > 60000) return s.access_token;
    const refresh = async () => {
      const cur = session();
      if (!cur) return null;
      if (cur.access_token !== rejected && cur.expires_at * 1000 - Date.now() > 60000) return cur.access_token;
      const r = await fetch(authUrl("token?grant_type=refresh_token"), {method: "POST", headers: headers(), body: JSON.stringify({refresh_token: cur.refresh_token})});
      if (r.status === 400 || r.status === 401 || r.status === 403) { dropSession(); return null; }
      if (!r.ok) throw new Error("refresh " + r.status);
      return saveSession(await r.json(), cur).access_token;
    };
    return navigator.locks ? navigator.locks.request("spellquest-auth", refresh) : refresh();
  }

  let busy = false, again = false, timer = 0, retry = 0, retryTimer = 0, lastRun = 0, status = "idle";
  function setStatus(s) { status = s; paint(); }

  async function callSync(lessons, keepalive) {
    const body = JSON.stringify({payload: {lessons}});
    const post = t => fetch(CFG.url + "/rest/v1/rpc/sync_progress", {method: "POST", headers: headers(t), body, keepalive: !!keepalive && body.length < 60000});
    let t = await accessToken();
    if (!t) return null;
    let r = await post(t);
    if (r.status === 401) {
      t = await accessToken(t);
      if (!t) return null;
      r = await post(t);
    }
    if (!r.ok) throw new Error("sync " + r.status);
    return r.json();
  }

  async function run(keepalive) {
    if (!signedIn()) { setStatus("idle"); return; }
    if (busy) { again = true; return; }
    busy = true; clearTimeout(timer); clearTimeout(retryTimer);
    setStatus("busy");
    try {
      const sent = dirtyMap();
      const data = await callSync(Object.keys(sent).map(snapshot), keepalive === true);
      if (!data) { setStatus("idle"); return; }
      if (applyServer(data, sent)) again = true;
      retry = 0; lastRun = Date.now();
      setStatus("ok");
    } catch (e) {
      retry = Math.min(retry + 1, 6);
      setStatus(navigator.onLine === false ? "offline" : "error");
      retryTimer = setTimeout(run, Math.min(60000, 2000 * 2 ** retry));
    } finally {
      busy = false;
      if (again) { again = false; schedule(300); }
    }
  }
  function schedule(ms) {
    if (!signedIn()) return;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }

  function touch(id) { if (!enabled) return; markDirty(id); schedule(1500); }
  function touchBook(id) {
    if (!enabled) return;
    const meta = read(metaKey(id), {}) || {};
    write(metaKey(id), {...meta, bookAt: Math.max(Date.now(), int(meta.bookAt) + 1)});
    touch(id);
  }
  function wipe(id, maxLast) {
    if (!enabled) return;
    const meta = read(metaKey(id), {}) || {};
    write(metaKey(id), {...meta, wipedAt: Math.max(Date.now(), int(maxLast), int(meta.wipedAt) + 1)});
    touch(id);
  }
  /* Mốc thời gian luôn sau bản ghi trước và sau lần xoá gần nhất, kể cả khi đồng hồ thiết bị chạy chậm. */
  function stamp(id, prev) {
    const meta = enabled ? read(metaKey(id), {}) || {} : {};
    return Math.max(Date.now(), int(prev) + 1, int(meta.wipedAt) + 1);
  }

  async function login(email, password) {
    const r = await fetch(authUrl("token?grant_type=password"), {method: "POST", headers: headers(), body: JSON.stringify({email, password})});
    if (!r.ok) throw new Error(r.status === 400 || r.status === 401 ? "Sai email hoặc mật khẩu." : "Máy chủ đang lỗi, thử lại sau.");
    saveSession(await r.json());
    localIds().forEach(markDirty);
    window.dispatchEvent(new CustomEvent("sq-sync-auth"));
    await run();
  }
  async function logout() {
    const s = session();
    dropSession();
    clearTimeout(timer); clearTimeout(retryTimer);
    setStatus("idle");
    if (s) fetch(authUrl("logout?scope=local"), {method: "POST", headers: headers(s.access_token)}).catch(() => {});
  }

  let pill = null, dlg = null;
  const LABEL = {busy: "Đang đồng bộ…", ok: "Đã đồng bộ", offline: "Chờ có mạng", error: "Lỗi đồng bộ", idle: "Đã đăng nhập"};
  function paint() {
    if (!pill) return;
    const on = signedIn();
    pill.textContent = "☁ " + (on ? LABEL[status] : "Đăng nhập đồng bộ");
    pill.dataset.state = on ? status : "out";
    if (dlg && dlg.open && dlg.dataset.view !== (on ? "in" : "out")) renderDialog();
    window.dispatchEvent(new CustomEvent("sq-sync-paint"));
  }
  function open() { if (!dlg) return; renderDialog(); dlg.showModal(); }
  const label = () => signedIn() ? LABEL[status] : "Đăng nhập";
  function renderDialog() {
    const s = session();
    dlg.dataset.view = s ? "in" : "out";
    if (s) {
      dlg.innerHTML = '<h2>Đồng bộ tiến độ</h2><p class="sqs-who"></p><p class="sqs-msg" role="status"></p><div class="sqs-row"><button type="button" data-a="now" class="sqs-go">Đồng bộ ngay</button><button type="button" data-a="out">Đăng xuất</button><button type="button" data-a="close">Đóng</button></div>';
      dlg.querySelector(".sqs-who").textContent = s.email;
      dlg.querySelector(".sqs-msg").textContent = "Đăng xuất không xoá tiến độ trên máy này.";
      dlg.querySelector('[data-a="now"]').onclick = async () => { await run(); dlg.querySelector(".sqs-msg").textContent = LABEL[status] + "."; };
      dlg.querySelector('[data-a="out"]').onclick = () => { logout(); renderDialog(); };
    } else {
      dlg.innerHTML = '<h2>Đăng nhập để đồng bộ</h2><form><label>Email<input name="email" type="email" required autocomplete="username" autocapitalize="off" spellcheck="false"></label><label>Mật khẩu<input name="password" type="password" required autocomplete="current-password"></label><p class="sqs-msg" role="alert"></p><div class="sqs-row"><button type="submit" class="sqs-go">Đăng nhập</button><button type="button" data-a="close">Để sau</button></div></form>';
      const f = dlg.querySelector("form"), msg = dlg.querySelector(".sqs-msg");
      f.onsubmit = async e => {
        e.preventDefault();
        const b = f.querySelector('[type="submit"]');
        b.disabled = true; msg.textContent = "Đang đăng nhập…";
        try { await login(f.email.value.trim(), f.password.value); dlg.close(); }
        catch (err) { msg.textContent = err instanceof TypeError ? "Không kết nối được máy chủ." : err.message; }
        finally { b.disabled = false; }
      };
    }
    dlg.querySelector('[data-a="close"]').onclick = () => dlg.close();
  }

  /* Trò chơi và bản đồ bắt phím toàn trang, nên phải bỏ qua khi hộp đăng nhập đang mở. */
  window.SQSync = {enabled, signedIn, touch, touchBook, wipe, stamp, run, open, label, email: () => (session() || {}).email || "", state: () => signedIn() ? status : "out", isOpen: () => !!(dlg && dlg.open)};
  if (!enabled) return;

  pill = document.createElement("button");
  pill.type = "button"; pill.className = "sqs-pill";
  dlg = document.createElement("dialog");
  dlg.className = "sqs-dialog";
  pill.onclick = () => { renderDialog(); dlg.showModal(); };
  document.body.append(pill, dlg);
  paint();

  window.addEventListener("sq-sync-auth", paint);
  window.addEventListener("online", () => run());
  window.addEventListener("pagehide", () => { if (Object.keys(dirtyMap()).length) run(true); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { if (Object.keys(dirtyMap()).length) run(true); }
    else if (Date.now() - lastRun > 15000) run();
  });
  run();
})();
