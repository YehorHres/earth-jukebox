// Один прохід пікселів на кадр: h, s, v, luma + маски з проходу A.
// Чистий модуль (без DOM) — працює і в основному потоці, і у Worker.

export const DATA_MIN_SAT = 0.35;   // нижче — сіре (суша, підписи)
export const DATA_MIN_VAL = 0.18;   // нижче — фон

/**
 * Значення пікселя за колірною шкалою «синій → червоний» (як у прототипі).
 * 0 = синій (холодно), 1 = червоний (тепло), -1 = немає даних.
 */
export function hueRampValue(h) {
  if (h > 260 && h < 330) return -1;      // фіолетових у типовій шкалі немає
  if (h >= 330) h = 0;                     // червоний «загортається»
  if (h > 240) h = 240;
  return (240 - h) / 240;
}

/** Розтягнути маску (mw×mh) на сітку w×h методом найближчого сусіда. */
export function resampleMask(mask, mw, mh, w, h) {
  if (!mask) return null;
  if (mw === w && mh === h) return mask;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const my = Math.min(mh - 1, Math.floor(y * mh / h)) * mw;
    for (let x = 0; x < w; x++) out[y * w + x] = mask[my + Math.min(mw - 1, Math.floor(x * mw / w))];
  }
  return out;
}

/** Значення кольору за знайденою шкалою (32 опорні кольори, 0 = «менше», 1 = «більше»); кеш за 15-бітним кольором. */
const scaleCache = new WeakMap();
export function scaleValue(refs, r, g, b) {
  let cache = scaleCache.get(refs);
  if (!cache) { cache = new Map(); scaleCache.set(refs, cache); }
  const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
  let v = cache.get(key);
  if (v !== undefined) return v;
  const R = r / 255, G = g / 255, B = b / 255, N = refs.length / 3;
  let best = -1, bd = Infinity;
  for (let k = 0; k < N; k++) {
    const d = (refs[3 * k] - R) ** 2 + (refs[3 * k + 1] - G) ** 2 + (refs[3 * k + 2] - B) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  v = bd < 0.02 ? best / (N - 1) : -1;          // далеко від шкали — не дані (підписи, суша)
  cache.set(key, v);
  return v;
}

/**
 * @param {Uint8ClampedArray} data RGBA
 * @param {object} masks { staticMask, landMask, bgMask, overlayMask, regionMask, scaleRefs, disk } на сітці w×h (або null)
 * @param {Float32Array|null} prevLuma luma попереднього кадру
 */
export function buildContext(data, w, h, masks = null, prevLuma = null, sceneType = "mixed") {
  const n = w * h;
  const hue = new Float32Array(n), sat = new Float32Array(n), val = new Float32Array(n), luma = new Float32Array(n);
  const ramp = new Float32Array(n);          // значення за шкалою (знайденою в кадрі або синій→червоний), -1 = немає
  const isData = new Uint8Array(n);          // піксель несе дані (не фон, не суша, не статика, в області даних)
  // виключаємо: сушу, статичний фон, статичні накладки (підписи, логотипи) і все поза областю даних
  // для нічних карт темрява всередині області — частина даних
  const land = masks?.landMask, bg = sceneType === "nightlights" ? null : masks?.bgMask, st = masks?.overlayMask;
  const inside = masks?.regionMask || null, refs = masks?.scaleRefs || null;
  let dataCount = 0, insideCount = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const v = max / 255, s = max === 0 ? 0 : (max - min) / max, d = max - min;
    let hh = 0;
    if (d > 0) {
      if (max === r) hh = ((g - b) / d) % 6; else if (max === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4;
      hh *= 60; if (hh < 0) hh += 360;
    }
    hue[i] = hh; sat[i] = s; val[i] = v;
    luma[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (inside && !inside[i]) { ramp[i] = -1; continue; }
    insideCount++;
    ramp[i] = refs ? (v >= 0.08 ? scaleValue(refs, r, g, b) : -1)
      : s >= DATA_MIN_SAT && v >= DATA_MIN_VAL ? hueRampValue(hh) : -1;
    const masked = (st && st[i]) || (land && land[i]) || (bg && bg[i]);
    let dataPx;
    if (sceneType === "nightlights") dataPx = !masked && v >= 0.06;  // для нічних карт дані = світло
    else dataPx = !masked && ramp[i] >= 0;
    if (!dataPx && !masked && sceneType !== "heatmap" && sceneType !== "nightlights") dataPx = v >= DATA_MIN_VAL; // truecolor/chart/mixed
    isData[i] = dataPx ? 1 : 0;
    dataCount += isData[i];
  }
  return { w, h, n, hue, sat, val, luma, ramp, isData, dataCount, prevLuma, masks, sceneType,
    inside, insideCount: insideCount || n, disk: masks?.disk || null, scaled: !!refs };
}
