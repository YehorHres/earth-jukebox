// v4-15: фон у кожному кадрі, дата/змінний текст, рух камери. Чистий модуль (працює і у Worker).
import { floodFromBorder, components } from "./region.js";

/**
 * Фон ОДНОГО кадру: майже чорне або однотонне (колір рамки цього кадру), з'єднане з рамкою кадру.
 * Лише «товсті» ділянки (ерозія 4-сусідів) — тонкі темні проміжки між лініями даних не рахуються.
 * Однотонний НЕ чорний фон приймаємо, тільки якщо він є на всіх чотирьох сторонах кадру
 * (білі полярні смуги згори й знизу — це лід, дані, а не рамка).
 * @param {Uint8ClampedArray} d RGBA
 * @returns {Uint8Array} 1 = фон
 */
export function frameBackground(d, w, h) {
  const n = w * h;
  const q = i => (d[4 * i] >> 3) << 10 | (d[4 * i + 1] >> 3) << 5 | (d[4 * i + 2] >> 3);
  const sides = [[], [], [], []];
  for (let x = 0; x < w; x++) { sides[0].push(x); sides[1].push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { sides[2].push(y * w); sides[3].push(y * w + w - 1); }
  const hist = new Map();
  for (const s of sides) for (const i of s) hist.set(q(i), (hist.get(q(i)) || 0) + 1);
  let bgQ = -1, bgN = 0;
  for (const [k, v] of hist) if (v > bgN) { bgN = v; bgQ = k; }
  const br = ((bgQ >> 10) & 31) << 3, bgc = ((bgQ >> 5) & 31) << 3, bb = (bgQ & 31) << 3;
  const near = i => Math.abs(d[4 * i] - br) + Math.abs(d[4 * i + 1] - bgc) + Math.abs(d[4 * i + 2] - bb) < 36;
  const dark = Math.max(br, bgc, bb) < 20;
  const onAllSides = sides.every(s => s.reduce((c, i) => c + (near(i) ? 1 : 0), 0) / s.length >= 0.3);
  const useColor = !dark && bgN / (2 * w + 2 * h) >= 0.4 && onAllSides;
  const like = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const mx = Math.max(d[4 * i], d[4 * i + 1], d[4 * i + 2]);
    like[i] = mx < 18 || (useColor && near(i)) ? 1 : 0;
  }
  const thick = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!like[i]) continue;
    thick[i] = (x === 0 || like[i - 1]) && (x === w - 1 || like[i + 1]) && (y === 0 || like[i - w]) && (y === h - 1 || like[i + w]) ? 1 : 0;
  }
  const bg = floodFromBorder(i => thick[i] === 1, w, h);
  // повертаємо край, «з'їдений» ерозією (1 піксель)
  const out = bg.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (out[i] || !like[i]) continue;
    if ((x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w])) out[i] = 1;
  }
  return out;
}

/** Область за кадрами огляду, коли фон рухається (камера, наближення): об'єднання «не фону» по кадрах. */
export function regionFromFrames(bgCount, F, w, h) {
  const n = w * h, nonBg = new Uint8Array(n);
  for (let i = 0; i < n; i++) nonBg[i] = bgCount[i] < 0.9 * F ? 1 : 0;
  const { lab, sizes } = components(nonBg, w, h);
  let best = -1;
  sizes.forEach((s, k) => { if (best < 0 || s > sizes[best]) best = k; });
  const mask = new Uint8Array(n);
  if (best >= 0) for (let i = 0; i < n; i++) mask[i] = lab[i] === best ? 1 : 0;
  const outside = floodFromBorder(i => !mask[i], w, h);
  for (let i = 0; i < n; i++) mask[i] = outside[i] ? 0 : 1;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (area < n * 0.02) { mask.fill(1); x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; area = n; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const full = bw >= w * 0.9 && bh >= h * 0.9 && area / (bw * bh) >= 0.93;
  return { mask, shape: area / (bw * bh) >= 0.93 ? "rect" : "other", disk: null, area: area / n, full, bbox: { x0, y0, x1, y1 },
    norm: { bbox: { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h }, disk: null } };
}

/**
 * Дата / змінний текст: дрібні світлі ненасичені пікселі, що «блимають» (цифри міняються), у кутах кадру,
 * зібрані в невеликий широкий прямокутник. Повертає маску (з запасом) і рамки (частки кадру).
 */
export function detectDynamicText({ w, h, pxStd, maxVal, minSat, exclude = null }) {
  const n = w * h, cand = new Uint8Array(n);
  const mx = Math.round(w * 0.3), my = Math.round(h * 0.22);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (exclude && exclude[i]) continue;
    if (!((x < mx || x >= w - mx) && (y < my || y >= h - my))) continue;       // лише кути кадру
    if (maxVal[i] > 0.6 && minSat[i] < 0.25 && pxStd[i] > 0.06) cand[i] = 1;
  }
  // зліплюємо сусідні літери: розширення по горизонталі
  const dil = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!cand[y * w + x]) continue;
    for (let dx = -3; dx <= 3; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) dil[y * w + xx] = 1; }
  }
  const { lab, sizes } = components(dil, w, h);
  const mask = new Uint8Array(n), boxes = [];
  sizes.forEach((size, id) => {
    let x0 = w, y0 = h, x1 = -1, y1 = -1, c = 0;
    for (let i = 0; i < n; i++) if (lab[i] === id) { const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (cand[i]) c++; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (c < 4 || bw * bh > n * 0.03 || bw < bh * 1.5 || bh > h * 0.12) return;   // текст: малий, широкий, низький
    boxes.push({ x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h });
    for (let y = Math.max(0, y0 - 2); y <= Math.min(h - 1, y1 + 2); y++) for (let x = Math.max(0, x0 - 2); x <= Math.min(w - 1, x1 + 2); x++) mask[y * w + x] = 1;
  });
  return { mask, boxes };
}

/* ---------- рух камери: глобальний масштаб і зсув між сусідніми кадрами ---------- */
export const CAM_W = 40, CAM_H = 20;

/** Зменшена яскравість кадру (CAM_W×CAM_H, середнє по блоках). */
export function smallLuma(luma, w, h) {
  const out = new Float32Array(CAM_W * CAM_H), cnt = new Uint16Array(CAM_W * CAM_H);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(CAM_H - 1, Math.floor(y * CAM_H / h)) * CAM_W;
    for (let x = 0; x < w; x++) { const c = gy + Math.min(CAM_W - 1, Math.floor(x * CAM_W / w)); out[c] += luma[y * w + x]; cnt[c]++; }
  }
  for (let i = 0; i < out.length; i++) out[i] /= cnt[i] || 1;
  return out;
}

/**
 * Найкраще глобальне перетворення prev → cur серед масштабів і зсувів.
 * @returns {{ scale, dx, dy, gain, motion }} gain — наскільки воно краще за «камера стоїть» (0..1);
 *   motion — сила руху камери 0..1 (0, якщо найкраще — тотожне перетворення або виграш малий)
 */
export function estimateCamera(prev, cur) {
  const W = CAM_W, H = CAM_H, cx = (W - 1) / 2, cy = (H - 1) / 2;
  const sad = (s, dx, dy) => {
    let sum = 0, c = 0;
    for (let y = 2; y < H - 2; y++) for (let x = 3; x < W - 3; x++) {
      // звідки точка (x, y) поточного кадру взялась у попередньому
      const px = Math.round(cx + (x - cx) / s - dx), py = Math.round(cy + (y - cy) / s - dy);
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      sum += Math.abs(cur[y * W + x] - prev[py * W + px]); c++;
    }
    return c > W * H * 0.4 ? sum / c : Infinity;
  };
  const id = sad(1, 0, 0);
  let best = { scale: 1, dx: 0, dy: 0, v: id };
  for (const s of [0.92, 0.96, 1, 1.04, 1.08]) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
    if (s === 1 && !dx && !dy) continue;
    const v = sad(s, dx, dy);
    if (v < best.v) best = { scale: s, dx, dy, v };
  }
  const gain = id > 1e-6 ? 1 - best.v / id : 0;
  const moved = best.scale !== 1 || best.dx || best.dy;
  // рух камери — лише якщо глобальне перетворення пояснює зміну кадру помітно краще і зміна не шумова
  const motion = moved && gain > 0.3 && id > 0.004 ? Math.min(1, Math.abs(Math.log(best.scale)) * 8 + Math.hypot(best.dx, best.dy) / 3) : 0;
  return { scale: best.scale, dx: best.dx, dy: best.dy, gain, motion };
}
