/* Chế độ màu sáng/tối dùng chung cho trang chủ và trò chơi.
   Nạp trong <head> (không defer) để trang có đúng màu ngay từ đầu, không bị chớp.
   Chưa chọn thì theo cài đặt của thiết bị; đã chọn thì lưu ở localStorage. */
(() => {
  const KEY = "spellquest-theme", root = document.documentElement;
  const mq = window.matchMedia ? matchMedia("(prefers-color-scheme: light)") : null;
  const saved = () => { try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; } catch (e) { return null; } };
  const current = () => saved() || (mq && mq.matches ? "light" : "dark");

  function paint(b) {
    const light = root.dataset.theme === "light";
    b.dataset.mode = light ? "light" : "dark";
    const t = b.querySelector("[data-theme-label]");
    if (t) t.textContent = light ? "Màu tối" : "Màu sáng";
    b.title = light ? "Chuyển sang màu tối" : "Chuyển sang màu sáng";
  }
  function apply() {
    const t = current();
    if (root.dataset.theme === t) return;
    root.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === "light" ? "#f4f0e6" : "#0d0d1e";
    document.querySelectorAll("[data-theme-toggle]").forEach(paint);
    window.dispatchEvent(new CustomEvent("sq-theme", {detail: t}));
  }
  function toggle() {
    try { localStorage.setItem(KEY, root.dataset.theme === "light" ? "dark" : "light"); } catch (e) {}
    apply();
  }

  apply();
  if (mq && mq.addEventListener) mq.addEventListener("change", apply);
  window.addEventListener("storage", e => { if (e.key === KEY) apply(); });
  document.addEventListener("DOMContentLoaded", () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = root.dataset.theme === "light" ? "#f4f0e6" : "#0d0d1e";
    document.querySelectorAll("[data-theme-toggle]").forEach(b => { paint(b); b.addEventListener("click", toggle); });
  });
  window.SQTheme = {current, toggle};
})();
