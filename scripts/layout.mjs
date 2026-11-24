/* Tự tính vị trí 3D và màu của các chủ đề trên bản đồ, chạy mỗi lần build.
   Mỗi chủ đề là một quả cầu chứa các từ của nó (bán kính lớn dần theo số từ). Mô phỏng lực đơn giản:
   - các quả cầu đẩy nhau, không bao giờ chồng lên nhau (chừa thêm chỗ cho nhãn tên),
   - chủ đề cùng bài học, hoặc có từ được nối với nhau (links), kéo lại gần nhau,
   - một lực nhẹ kéo tất cả về tâm để bản đồ gọn.
   Màu: mỗi chủ đề một màu riêng, chia đều vòng màu; chủ đề nằm càng gần nhau thì màu càng khác nhau.
   Không dùng số ngẫu nhiên: cùng dữ liệu thì luôn ra cùng một vị trí. */

/* Bán kính quả cầu chủ đề, src/map/map.js dùng đúng công thức này để rải từ. */
export const topicRadius = n => 0.1 + 0.055 * Math.sqrt(n);

const GAP = 0.28; // khoảng hở tối thiểu giữa hai quả cầu, đủ cho nhãn tên nằm phía trên

function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

/* topics: [{ id }], words: [{ topic, l (số bài), w }], links: [[từ, từ]].
   Trả về Map id -> { c: [x, y, z], R, color } cho các chủ đề có ít nhất một từ. */
export function layoutTopics(topics, words, links = []) {
  const byId = new Map();
  topics.forEach((t, order) => byId.set(t.id, { id: t.id, order, n: 0, lessons: new Set(), first: Infinity }));
  for (const w of words) {
    const t = byId.get(w.topic);
    if (!t) continue;
    t.n++; t.lessons.add(w.l); t.first = Math.min(t.first, w.l);
  }
  const nodes = [...byId.values()].filter(t => t.n > 0).sort((a, b) => a.first - b.first || a.order - b.order);
  const N = nodes.length, out = new Map();
  if (!N) return out;
  nodes.forEach((t, i) => { t.i = i; t.R = topicRadius(t.n); });

  /* Độ gắn kết giữa hai chủ đề. */
  const wt = Array.from({ length: N }, () => new Float64Array(N));
  const add = (a, b, v) => { if (a !== b) { wt[a][b] += v; wt[b][a] += v; } };
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++)
    for (const l of nodes[a].lessons) if (nodes[b].lessons.has(l)) add(a, b, 1);
  const topicOfWord = new Map(words.map(w => [String(w.w).toLowerCase(), byId.get(w.topic)]));
  for (const [x, y] of links) {
    const a = topicOfWord.get(String(x).toLowerCase()), b = topicOfWord.get(String(y).toLowerCase());
    if (a && b && a.n && b.n) add(a.i, b.i, 0.35);
  }

  /* Vị trí ban đầu: mỗi bài một vùng trên mặt cầu (xếp kiểu hoa hướng dương), chủ đề của bài quây quanh vùng đó. */
  const lessonIds = [...new Set(nodes.map(t => t.first))];
  const spread = 0.55 * Math.cbrt(N);
  const anchor = new Map(lessonIds.map((l, k) => {
    const m = lessonIds.length, y = m === 1 ? 0 : 1 - 2 * (k + 0.5) / m, r = Math.sqrt(1 - y * y), th = k * 2.39996;
    return [l, [Math.cos(th) * r * spread, y * spread, Math.sin(th) * r * spread]];
  }));
  const P = nodes.map(t => {
    const a = anchor.get(t.first), u = hash(t.id) * 6.283, v = hash(t.id + "v") * 2 - 1, r = 0.25;
    return [a[0] + Math.cos(u) * r, a[1] + v * r, a[2] + Math.sin(u) * r];
  });

  const minD = (a, b) => nodes[a].R + nodes[b].R + GAP;
  const ITER = 500;
  for (let it = 0; it < ITER; it++) {
    const cool = 1 - it / ITER, step = 0.06 * cool + 0.004;
    const F = P.map(() => [0, 0, 0]);
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
      let dx = P[b][0] - P[a][0], dy = P[b][1] - P[a][1], dz = P[b][2] - P[a][2];
      let d = Math.hypot(dx, dy, dz);
      if (d < 1e-6) { dx = hash(a + ":" + b) - 0.5; dy = 0.1; dz = 0.1; d = Math.hypot(dx, dy, dz); }
      const ux = dx / d, uy = dy / d, uz = dz / d, m = minD(a, b);
      let f = -0.02 * (m * m) / (d * d);              // đẩy nhẹ ở xa để rải đều
      if (d < m * 1.35) f -= 0.6 * (m * 1.35 - d);     // đẩy mạnh khi sắp chạm nhau
      if (wt[a][b]) f += 0.08 * Math.min(wt[a][b], 2) * (d - m * 1.1); // kéo các chủ đề liên quan
      F[a][0] += f * ux; F[a][1] += f * uy; F[a][2] += f * uz;
      F[b][0] -= f * ux; F[b][1] -= f * uy; F[b][2] -= f * uz;
    }
    for (let a = 0; a < N; a++) {
      const g = 0.03;
      F[a][0] -= g * P[a][0]; F[a][1] -= g * P[a][1] * 1.4; F[a][2] -= g * P[a][2];
      const len = Math.hypot(...F[a]), k = len > step ? step / len : 1;
      for (let i = 0; i < 3; i++) P[a][i] += F[a][i] * k;
    }
  }

  /* Chốt lại: tách hẳn mọi cặp còn chồng nhau. */
  for (let pass = 0; pass < 300; pass++) {
    let moved = false;
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
      const d = [0, 1, 2].map(i => P[b][i] - P[a][i]), len = Math.hypot(...d) || 1e-6, m = minD(a, b);
      if (len >= m) continue;
      const push = (m - len) / 2 + 1e-4;
      for (let i = 0; i < 3; i++) { P[a][i] -= d[i] / len * push; P[b][i] += d[i] / len * push; }
      moved = true;
    }
    if (!moved) break;
  }

  const cen = [0, 1, 2].map(i => P.reduce((s, p) => s + p[i], 0) / N);
  const r3 = v => Math.round(v * 1000) / 1000;
  const colors = assignColors(P);
  nodes.forEach((t, i) => out.set(t.id, { c: P[i].map((v, k) => r3(v - cen[k])), R: t.R, color: colors[i] }));
  return out;
}

/* ---------- Màu ---------- */

/* OKLCH -> sRGB. OKLCH chia độ sáng đều theo mắt người nên các màu cùng L trông đậm nhạt như nhau. */
function oklchToRgb(L, C, hDeg) {
  const h = hDeg * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return lin.map(v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
}
/* Giảm độ rực đến khi màu nằm trong dải sRGB, tránh màu bị cắt lệch. */
function oklchHex(L, C, h) {
  let rgb = oklchToRgb(L, C, h);
  while (rgb.some(v => v < 0 || v > 1) && C > 0.02) { C -= 0.005; rgb = oklchToRgb(L, C, h); }
  return { hex: "#" + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join(""), lab: [L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)] };
}

/* Tạo N màu chia đều vòng màu (xen kẽ 3 mức sáng khi nhiều chủ đề), rồi phát cho từng chủ đề:
   chọn màu khác nhất so với các chủ đề đã có màu ở gần nó. Các màu đều đủ đậm để đọc trên nền trắng và nền tối. */
function assignColors(P) {
  const N = P.length, levels = N <= 10 ? [0.62] : N <= 20 ? [0.58, 0.7] : [0.56, 0.68, 0.78];
  const pool = Array.from({ length: N }, (_, i) => oklchHex(levels[i % levels.length], 0.16, (25 + i * 360 / N) % 360));
  const used = new Array(N).fill(false), color = new Array(N);
  for (let i = 0; i < N; i++) {
    let best = -1, bestScore = -Infinity;
    for (let k = 0; k < N; k++) {
      if (used[k]) continue;
      let score = Infinity;
      for (let j = 0; j < i; j++) {
        const dE = Math.hypot(...pool[k].lab.map((v, x) => v - color[j].lab[x]));
        const dP = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]);
        score = Math.min(score, dE * (1 + dP * dP));
      }
      if (score > bestScore) { bestScore = score; best = k; }
    }
    used[best] = true; color[i] = pool[best];
  }
  return color.map(c => c.hex);
}
