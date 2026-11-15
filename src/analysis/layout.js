// Типи static, chart, composite (PROMPT-v7 §1, блок F).
//   static    — дані майже не змінюються, камера стоїть → кадр сканується як зображення (захід → схід);
//   chart     — графік: x = час треку, y = висота голосу даних; друга лінія — другий голос; перетини — ерікон;
//   composite — кілька панелей поруч: читаємо найбільшу.
import { normalizeSeries, globalRank } from "./normalize.js";
import { TEMPORAL_KEYS } from "./temporal.js";
import { MOTION_LABEL } from "./motion.js";

export const LAYOUT_NOTE = {
  static: "Дані у відео майже не змінюються, камера стоїть: кадр звучить як зображення — лінія сканування йде із заходу на схід.",
  chart: "Графік: час треку — це вісь x (зліва направо), висота голосу даних — висота лінії.",
  composite: "У кадрі кілька панелей: звучить найбільша.",
};

/** Кадр відео → нерухоме зображення-джерело (canvas), яке можна сканувати як фото. */
export async function stillFromVideo(source, t) {
  const frame = await source.seek(Math.max(0, Math.min(source.duration - 0.05, t)));
  const k = Math.min(1, 960 / source.width), c = document.createElement("canvas");
  c.width = Math.max(8, Math.round(source.width * k)); c.height = Math.max(8, Math.round(source.height * k));
  c.getContext("2d", { willReadFrequently: true }).drawImage(frame, 0, 0, c.width, c.height);
  c.setAttribute("role", "img");
  return { kind: "image", name: source.name, el: c, duration: 0, fps: 1, isStatic: true, width: c.width, height: c.height, key: `${source.key}|still@${t.toFixed(2)}`, async seek() { return c; } };
}

/**
 * Панелі кадру: розрізаємо по «жолобах» — суцільних статичних смугах кольору рамки на всю висоту (ширину).
 * @returns {Array<{x0,y0,x1,y1,area}>} у клітинках сітки w×h, від найбільшої; порожньо — одна панель
 */
export function findPanels({ w, h, meanRGB, pxStd, staticThr }) {
  const lum = i => 0.2126 * meanRGB[3 * i] + 0.7152 * meanRGB[3 * i + 1] + 0.0722 * meanRGB[3 * i + 2];
  const thr = Math.max(staticThr, 3 / 255);
  /** смуга (стовпчик / рядок) однорідна й статична на відрізку [a, b) іншої осі? → її яскравість або −1 */
  const uniform = (vertical, k, a, b) => {
    let s = 0, s2 = 0, c = 0;
    for (let q = a; q < b; q++) { const i = vertical ? q * w + k : k * w + q; if (pxStd[i] > thr) return -1; const v = lum(i); s += v; s2 += v * v; c++; }
    const m = s / c;
    return s2 / c - m * m < 0.0004 ? m : -1;
  };
  /** розрізати вісь на відрізки даних, розділені жолобами завширшки ≥ minGap (вужчі смуги — частина панелі) */
  const split = (vertical, k0, k1, a, b, minGap) => {
    const parts = [];
    let start = null, lastData = -1, gap = 0;
    for (let k = k0; k < k1; k++) {
      if (uniform(vertical, k, a, b) >= 0) { gap++; continue; }
      if (start === null) start = k;
      else if (gap >= minGap) { parts.push([start, lastData]); start = k; }
      gap = 0; lastData = k;
    }
    if (start !== null) parts.push([start, lastData]);
    return parts;
  };
  const minGapX = Math.max(2, Math.round(w * 0.012)), minGapY = Math.max(2, Math.round(h * 0.02));
  const out = [];
  for (const [x0, x1] of split(true, 0, w, 0, h, minGapX)) {
    const rows = split(false, 0, h, x0, x1 + 1, minGapY);
    for (const [y0, y1] of rows.length ? rows : [[0, h - 1]]) out.push({ x0, y0, x1, y1, area: (x1 - x0 + 1) * (y1 - y0 + 1) / (w * h) });
  }
  const big = out.filter(p => p.area >= 0.06).sort((p, q) => q.area - p.area);
  return big.length >= 2 ? big : [];
}

/**
 * Лінії графіка з кадру: насичені кольорові пікселі, згруповані за відтінком (до 2 ліній).
 * @returns {{ lines: [{ hue, values: Float32Array(w) (0..1, NaN — лінії немає), cover }], w }}
 */
export function extractChartLines(data, w, h) {
  const BINS = 12, cols = Array.from({ length: BINS }, () => ({ sum: new Float64Array(w), cnt: new Uint16Array(w), total: 0 }));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4, r = data[p], g = data[p + 1], b = data[p + 2], max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (max < 60 || d / max < 0.45) continue;                       // осі, підписи, фон — не лінії даних
    let hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60; if (hh < 0) hh += 360;
    const c = cols[Math.floor(hh / (360 / BINS)) % BINS];
    c.sum[x] += y; c.cnt[x]++; c.total++;
  }
  const cand = cols.map((c, k) => { let cover = 0; for (let x = 0; x < w; x++) if (c.cnt[x]) cover++; return { k, c, cover: cover / w }; })
    .filter(q => q.cover >= 0.25).sort((p, q) => q.cover - p.cover).slice(0, 2).sort((p, q) => p.k - q.k);   // дві найдовші лінії; порядок — за відтінком (червона перша)
  if (!cand.length) return { lines: [], w };
  let lo = Infinity, hi = -Infinity;
  const raw = cand.map(q => { const ys = new Float32Array(w).fill(NaN); for (let x = 0; x < w; x++) if (q.c.cnt[x]) { const y = q.c.sum[x] / q.c.cnt[x]; ys[x] = y; if (y < lo) lo = y; if (y > hi) hi = y; } return ys; });
  const span = Math.max(hi - lo, 1);
  return { w, lines: cand.map((q, i) => ({ hue: (q.k + 0.5) * (360 / BINS), cover: q.cover, values: raw[i].map(y => (Number.isNaN(y) ? NaN : 1 - (y - lo) / span)) })) };
}

/** Додати ряд до аналізу (abs / rel / norm / rank / нульові часові ознаки). */
function addSeries(a, id, x, label) {
  const dif = [];
  for (let i = 1; i < a.count; i++) dif.push(Math.abs(x[i] - x[i - 1]));
  dif.sort((p, q) => p - q);
  const r = normalizeSeries(x, { noise: dif.length ? dif[Math.floor(dif.length * 0.1)] : 0, range: [0, 1], valid: a.valid });
  a.abs[id] = x; a.rel[id] = r.rel; a.norm[id] = r.info; a.rank[id] = globalRank(x, a.valid);
  for (const k of TEMPORAL_KEYS) a.temporal[`${id}.${k}`] = new Float32Array(a.count);
  a.labels[id] = label;
  return r.info;
}

/**
 * Графік: аналіз сканування кадру + лінії → провідна ознака = висота першої лінії, друга лінія — другий голос,
 * перетини ліній — події (ерікони). Змінює й повертає аналіз.
 */
export function applyChart(a, chart) {
  const n = a.count, at = i => {                                   // колонка графіка під лінією сканування кадру i
    const p = n > 1 ? i / (n - 1) : 0;
    return Math.max(0, Math.min(chart.w - 1, Math.round((0.125 + 0.75 * p) * (chart.w - 1))));
  };
  const series = line => {
    const x = new Float32Array(n);
    let last = NaN;
    for (let i = 0; i < n; i++) { const v = line.values[at(i)]; if (!Number.isNaN(v)) last = v; x[i] = last; }
    const first = x.find(v => !Number.isNaN(v)) ?? 0.5;
    for (let i = 0; i < n; i++) if (Number.isNaN(x[i])) x[i] = first;
    return x;
  };
  const s1 = series(chart.lines[0]), info = addSeries(a, "chartLine1", s1, "Висота лінії графіка");
  a.leadFeature = info.significant ? "chartLine1" : a.leadFeature;
  a.keyFeatures = ["chartLine1", ...a.keyFeatures.filter(f => !/^hotspot/.test(f))];
  a.hotspots = [];
  const events = [];
  if (chart.lines[1]) {
    const s2 = series(chart.lines[1]);
    addSeries(a, "chartLine2", s2, "Висота другої лінії графіка");
    const gap = Math.max(2, Math.round(a.rate * 2));
    let last = -1e9;
    for (let i = 1; i < n; i++) {
      const d0 = s1[i - 1] - s2[i - 1], d1 = s1[i] - s2[i];
      if (d0 * d1 < 0 && Math.abs(d1 - d0) > 0.005 && i - last >= gap) { last = i; events.push({ type: "peak", frame: i, time: a.times[i], feature: "chartLine1", strength: 0.9, value: s1[i], crossing: true, text: "перетин ліній графіка" }); }
    }
  }
  a.events = events;
  a.period = null;
  if (info.significant) { let iMax = 0; for (let i = 1; i < n; i++) if (s1[i] > s1[iMax]) iMax = i; a.climax = { frame: iMax, time: a.times[iMax], feature: "chartLine1", value: s1[iMax], text: "найвища точка лінії графіка" }; }
  a.motion = { type: "chart", auto: true, confidence: a.profile.confidence, label: MOTION_LABEL.chart, lines: chart.lines.length,
    why: `знайдено ${chart.lines.length === 1 ? "одну лінію" : "дві лінії"} графіка`,
    note: LAYOUT_NOTE.chart + (chart.lines[1] ? " Друга лінія — другий голос (нижче, праворуч); перетин ліній позначає короткий звук-знак." : "") };
  return a;
}
