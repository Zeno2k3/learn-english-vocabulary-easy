/* Hiện kỷ lục và số từ cần ôn của từng bài, lấy từ tiến độ lưu trên thiết bị. */
const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
};
function renderProgress() {
  document.querySelectorAll(".lesson").forEach(card => {
    const id = card.dataset.id;
    const best = Number(read("spellquest-best-b" + id, 0)) || 0;
    const need = Object.values(read("spellquest-miss-b" + id, {}) || {}).filter(s => s && s.wrong > 0 && (s.streak || 0) < 3).length;
    const el = card.querySelector(".prog");
    el.textContent = "";
    el.hidden = !best && !need;
    if (el.hidden) return;
    el.textContent = best ? "Kỷ lục " + best : "";
    if (need) {
      if (best) el.append(" · ");
      const b = document.createElement("b");
      b.textContent = "Cần ôn " + need + " từ";
      el.append(b);
    }
  });
}
renderProgress();
window.addEventListener("sq-sync", renderProgress);
window.addEventListener("storage", e => { if (e.key && e.key.startsWith("spellquest-")) renderProgress(); });
