// Базові ознаки (усі типи сцен). Значення — «abs»: фізична шкала 0..1 (balanceLR: -1..1).
import { registerFeature } from "./registry.js";
import { clamp } from "../util/stats.js";

/** Спільні проміжні величини: середня luma, std, статика. */
function lumaStats(ctx, shared) {
  if (shared.lumaStats) return shared.lumaStats;
  const { luma, inside } = ctx, n = ctx.insideCount;
  let s = 0, s2 = 0;
  for (let i = 0; i < ctx.n; i++) { if (inside && !inside[i]) continue; s += luma[i]; s2 += luma[i] * luma[i]; }
  const m = s / n;
  return (shared.lumaStats = { mean: m, std: Math.sqrt(Math.max(0, s2 / n - m * m)) });
}
// «не рахувати»: статичні пікселі (підписи, суша) і все поза областю даних (рамка, космос)
const isStatic = (ctx, i) => ctx.masks?.staticMask?.[i] === 1 || (ctx.inside !== null && ctx.inside !== undefined && !ctx.inside[i]);
const isIn = (ctx, i) => !ctx.inside || ctx.inside[i] === 1;

registerFeature({
  id: "warmth", label: "Тепловий індекс", group: "basic",
  describe: v => v < 0.25 ? "холодно" : v < 0.5 ? "прохолодно" : v < 0.75 ? "тепло" : "дуже тепло",
  compute(ctx) {
    let s = 0, c = 0;
    for (let i = 0; i < ctx.n; i++) if (ctx.isData[i] && ctx.ramp[i] >= 0) { s += ctx.ramp[i]; c++; }
    return c > ctx.insideCount * 0.002 ? s / c : NaN;
  },
});

registerFeature({
  id: "saturation", label: "Насиченість", group: "basic",
  compute(ctx) {
    let s = 0, c = 0;
    for (let i = 0; i < ctx.n; i++) if (ctx.val[i] >= 0.06 && !isStatic(ctx, i)) { s += ctx.sat[i]; c++; }
    return c ? s / c : 0;
  },
});

registerFeature({
  id: "brightness", label: "Яскравість", group: "basic",
  compute: (ctx, sh) => lumaStats(ctx, sh).mean,
});

registerFeature({
  id: "contrast", label: "Контраст", group: "basic",
  compute: (ctx, sh) => clamp(lumaStats(ctx, sh).std / 0.35),
});

registerFeature({
  id: "activeMass", label: "Активна маса (частка даних)", group: "basic",
  compute: ctx => ctx.dataCount / ctx.insideCount,
});

registerFeature({
  id: "landShare", label: "Частка суші", group: "basic",
  compute(ctx) {
    const land = ctx.masks?.landMask;
    let c = 0;
    if (land) { for (let i = 0; i < ctx.n; i++) if (isIn(ctx, i)) c += land[i]; }
    else for (let i = 0; i < ctx.n; i++) if (isIn(ctx, i) && ctx.sat[i] < 0.2 && ctx.val[i] > 0.2 && ctx.val[i] < 0.75) c++;
    return c / ctx.insideCount;
  },
});

/** Зважені координати активності — для центру мас і балансу. */
function massCenter(ctx, shared) {
  if (shared.mass) return shared.mass;
  const { w, h, isData, val } = ctx;
  let sw = 0, sy = 0, left = 0, right = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!isData[i]) continue;
    const wt = val[i];
    sw += wt; sy += wt * y;
    if (x < w / 2) left += wt; else right += wt;
  }
  return (shared.mass = { cy: sw ? sy / sw : h / 2, left, right });
}

registerFeature({
  id: "centerY", label: "Вертикальний центр мас", group: "basic",
  describe: v => v > 0.6 ? "північ" : v < 0.4 ? "південь" : "центр",
  compute: (ctx, sh) => 1 - massCenter(ctx, sh).cy / (ctx.h - 1),
});

registerFeature({
  id: "balanceLR", label: "Баланс захід/схід", group: "basic", range: [-1, 1],
  describe: v => v < -0.15 ? "захід" : v > 0.15 ? "схід" : "рівно",
  compute(ctx, sh) { const { left, right } = massCenter(ctx, sh); return left + right ? (right - left) / (right + left) : 0; },
});

registerFeature({
  id: "outliers", label: "Викиди > 3σ", group: "basic",
  compute(ctx, sh) {
    const { mean, std } = lumaStats(ctx, sh), thr = mean + 3 * std;
    let c = 0;
    for (let i = 0; i < ctx.n; i++) if (ctx.luma[i] > thr && !isStatic(ctx, i)) c++;
    return clamp((c / ctx.insideCount) * 50);
  },
});

registerFeature({
  id: "frameDiff", label: "Зміна між кадрами", group: "basic",
  compute(ctx) {
    if (!ctx.prevLuma) return 0;
    let s = 0, c = 0;
    for (let i = 0; i < ctx.n; i++) if (!isStatic(ctx, i)) { s += Math.abs(ctx.luma[i] - ctx.prevLuma[i]); c++; }
    return c ? clamp((s / c) * 10) : 0;
  },
});

registerFeature({
  id: "edgeDensity", label: "Щільність контурів (Собель)", group: "basic",
  compute(ctx) {
    const { w, h, luma } = ctx;
    let s = 0, c = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (isStatic(ctx, i)) continue;
      const gx = luma[i - w + 1] + 2 * luma[i + 1] + luma[i + w + 1] - luma[i - w - 1] - 2 * luma[i - 1] - luma[i + w - 1];
      const gy = luma[i + w - 1] + 2 * luma[i + w] + luma[i + w + 1] - luma[i - w - 1] - 2 * luma[i - w] - luma[i - w + 1];
      s += Math.sqrt(gx * gx + gy * gy); c++;
    }
    return c ? clamp((s / c) / 1.5) : 0;
  },
});

registerFeature({
  id: "entropy", label: "Ентропія", group: "basic",
  compute(ctx) {
    const hist = new Float32Array(32);
    for (let i = 0; i < ctx.n; i++) if (isIn(ctx, i)) hist[Math.min(31, Math.floor(ctx.luma[i] * 32))]++;
    let e = 0;
    for (const c of hist) if (c) { const p = c / ctx.insideCount; e -= p * Math.log2(p); }
    return e / 5;
  },
});

registerFeature({
  id: "colorClusters", label: "Кольорові кластери (K-Means)", group: "basic",
  compute(ctx) {
    // мала сітка 32×16, k ≤ 6, детермінована ініціалізація (за яскравістю)
    const pts = [], { w, h } = ctx;
    for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < 32; gx++) {
      const i = Math.floor((gy + 0.5) * h / 16) * w + Math.floor((gx + 0.5) * w / 32);
      if (ctx.val[i] < 0.06 || isStatic(ctx, i)) continue;
      // HSV → координати конуса, щоб відтінок «загортався»
      const a = ctx.hue[i] * Math.PI / 180, r = ctx.sat[i] * ctx.val[i];
      pts.push([r * Math.cos(a), r * Math.sin(a), ctx.val[i], ctx.luma[i]]);
    }
    if (pts.length < 6) return 0;
    pts.sort((a, b) => a[3] - b[3]);
    const k = 6, C = Array.from({ length: k }, (_, j) => pts[Math.floor((j + 0.5) * pts.length / k)].slice(0, 3));
    const lab = new Int8Array(pts.length);
    for (let it = 0; it < 6; it++) {
      for (let p = 0; p < pts.length; p++) {
        let best = 0, bd = Infinity;
        for (let j = 0; j < k; j++) { const d = (pts[p][0] - C[j][0]) ** 2 + (pts[p][1] - C[j][1]) ** 2 + (pts[p][2] - C[j][2]) ** 2; if (d < bd) { bd = d; best = j; } }
        lab[p] = best;
      }
      for (let j = 0; j < k; j++) {
        let s0 = 0, s1 = 0, s2 = 0, c = 0;
        for (let p = 0; p < pts.length; p++) if (lab[p] === j) { s0 += pts[p][0]; s1 += pts[p][1]; s2 += pts[p][2]; c++; }
        if (c) C[j] = [s0 / c, s1 / c, s2 / c];
      }
    }
    // рахуємо кластери з часткою > 4 %, зливаючи майже однакові центри
    const counts = new Array(k).fill(0);
    for (const l of lab) counts[l]++;
    const kept = [];
    for (let j = 0; j < k; j++) {
      if (counts[j] / pts.length < 0.04) continue;
      if (kept.some(q => (C[q][0] - C[j][0]) ** 2 + (C[q][1] - C[j][1]) ** 2 + (C[q][2] - C[j][2]) ** 2 < 0.01)) continue;
      kept.push(j);
    }
    return kept.length / k;
  },
});
