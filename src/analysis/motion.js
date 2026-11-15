// Тип руху відео (PROMPT-v7 §1): що саме змінюється в кадрі — дані чи точка зору.
//   temporal        — карта/глобус на місці, змінюються дані (як раніше);
//   rotating-globe  — глобус обертається: це СКАНУВАННЯ простору, а не зміна даних;
//   camera-pan-zoom — камера їде / наближається над картою;
//   static, chart, composite — блок F.
// Для типів ≠ temporal рух не дає подій, гучності й «трендів»; голос даних читає те, що зараз перед слухачем.
import { normalizeSeries, globalRank } from "./normalize.js";
import { TEMPORAL_KEYS } from "./temporal.js";
import { median, percentile, smooth } from "../util/stats.js";

export const MOTION_TYPES = ["temporal", "rotating-globe", "camera-pan-zoom"];
export const MOTION_LABEL = {
  temporal: "дані змінюються в часі (карта на місці)",
  "rotating-globe": "глобус обертається",
  "camera-pan-zoom": "камера рухається над картою",
  static: "нерухоме зображення (сканування)",
  chart: "графік",
  composite: "кілька панелей",
};
export const MOTION_NOTE = {
  temporal: "Карта на місці: звучать зміни даних у часі.",
  "rotating-globe": "Глобус обертається: звучить те, що зараз у центрі диска — меридіан перед слухачем; захід диска — ліворуч, схід — праворуч. Обертання — це огляд простору, а не зміна даних, тому воно не дає подій і не керує гучністю.",
  "camera-pan-zoom": "Камера рухається над картою: звучить те, що зараз у кадрі. Рух камери не дає подій і не керує гучністю.",
};
/** Тип руху, для якого рух у кадрі не є зміною даних. */
export const motionOff = a => !!a?.motion && a.motion.type !== "temporal";

/**
 * Глобальний зсув текстури prev → cur у центральному вікні кадру (центр диска / карти).
 * @returns {{ dx, dy, gain, id }} dx, dy — частки ширини кадру (субпіксельно по x); gain — наскільки зсув
 *   пояснює зміну кадру краще за «нічого не рухалось» (0..1); id — середня різниця без зсуву
 */
export function estimateFlow(prev, cur, w, h) {
  const x0 = Math.floor(w * 0.25), x1 = Math.ceil(w * 0.75), y0 = Math.floor(h * 0.25), y1 = Math.ceil(h * 0.75);
  const R = Math.max(3, Math.min(x0 - 1, Math.round(w * 0.035))), RY = Math.max(1, Math.min(y0 - 1, Math.round(w * 0.012)));
  const sad = (dx, dy) => {
    let s = 0, c = 0;
    for (let y = y0; y < y1; y += 2) {
      const row = y * w, prow = (y - dy) * w;
      for (let x = x0; x < x1; x += 2) { s += Math.abs(cur[row + x] - prev[prow + x - dx]); c++; }
    }
    return c ? s / c : 0;
  };
  const id = sad(0, 0);
  let best = id, bx = 0, by = 0;
  for (let dy = -RY; dy <= RY; dy++) for (let dx = -R; dx <= R; dx++) {
    if (!dx && !dy) continue;
    const v = sad(dx, dy);
    if (v < best - 1e-9) { best = v; bx = dx; by = dy; }
  }
  let off = 0;
  if (Math.abs(bx) < R) {
    const l = sad(bx - 1, by), r = sad(bx + 1, by), den = l - 2 * best + r;
    if (den > 1e-9) off = Math.max(-0.5, Math.min(0.5, (l - r) / (2 * den)));
  }
  return { dx: (bx + off) / w, dy: by / w, gain: id > 1e-6 ? 1 - best / id : 0, id, w };
}

/**
 * Класифікація типу руху за зсувами проходу B.
 * @param {Array} frames кадри проходу B ({ flow, cam })
 * @returns {{ type, auto, confidence, why, stats }}
 */
export function classifyMotion(frames, profile, valid = null) {
  const sh = [], dxs = [], dys = [];
  let seen = 0, moving = 0, zoom = 0, pos = 0;
  frames.forEach((f, i) => {
    if (!f?.flow || (valid && !valid[i])) return;
    seen++;
    const px = Math.hypot(f.flow.dx, f.flow.dy) * f.flow.w;
    const zoomed = f.cam?.motion > 0 && f.cam.scale !== 1;
    if (zoomed) zoom++;
    if (f.flow.gain > 0.3 && px >= 0.4 && f.flow.id > 0.004) {
      moving++; sh.push(px); dxs.push(f.flow.dx * f.flow.w); dys.push(Math.abs(f.flow.dy * f.flow.w));
      if (f.flow.dx > 0) pos++;
    }
  });
  const stats = { frames: seen, movingShare: seen ? moving / seen : 0, zoomShare: seen ? zoom / seen : 0 };
  const none = { type: "temporal", auto: true, confidence: seen ? 1 - Math.min(1, stats.movingShare / 0.3) : 0.5, stats,
    why: seen ? `глобального зсуву кадру немає (${Math.round(stats.movingShare * 100)} % кадрів) — змінюються самі дані` : "один кадр або замало кадрів" };
  if (seen < 8 || profile.isStill || profile.scan) return none;
  const ax = dxs.map(Math.abs), mx = ax.length ? median(ax) : 0, my = dys.length ? median(dys) : 0;
  const oneWay = moving ? Math.max(pos, moving - pos) / moving : 0;
  const steady = mx > 0 ? (percentile(ax, 75) - percentile(ax, 25)) / mx : 9;
  Object.assign(stats, { medianDx: mx, medianDy: my, oneWay, steady, dir: pos * 2 >= moving ? "east" : "west" });
  const disk = profile.region?.shape === "disk";
  // диск знайдено — досить горизонтального зсуву в один бік; диска немає (глобус на весь кадр, підписи) —
  // вимагаємо ще й суто горизонтального сталого зсуву без наближення: так обертається глобус, камера так не їздить
  const pureScan = stats.movingShare >= 0.5 && oneWay >= 0.9 && mx >= 4 * my + 0.3 && steady < 0.5 && stats.zoomShare < 0.1;
  if ((disk && stats.movingShare >= 0.5 && oneWay >= 0.85 && mx >= 2.5 * my + 0.2) || pureScan) {
    return { type: "rotating-globe", auto: true, stats, confidence: Math.min(1, 0.5 + 0.5 * stats.movingShare) * (steady < 0.8 ? 1 : 0.7),
      why: `текстура ${disk ? "всередині диска" : "в центрі кадру"} стало зсувається горизонтально (${Math.round(stats.movingShare * 100)} % кадрів, в один бік — ${Math.round(oneWay * 100)} %)` };
  }
  if (stats.movingShare >= 0.3 || stats.zoomShare >= 0.3 || stats.movingShare + stats.zoomShare >= 0.4) {
    return { type: "camera-pan-zoom", auto: true, stats, confidence: Math.min(1, 0.4 + Math.max(stats.movingShare, stats.zoomShare)),
      why: `увесь кадр зсувається або масштабується разом (зсув — ${Math.round(stats.movingShare * 100)} % кадрів, наближення — ${Math.round(stats.zoomShare * 100)} %)` };
  }
  return none;
}

/** Значення в центральній смузі кадру (колонки 6–9 із 16) — меридіан, що зараз «перед слухачем». */
export function centerSeries(zones) {
  const out = new Float32Array(zones.length);
  let last = NaN;
  zones.forEach((z, i) => {
    let s = 0, c = 0;
    for (let k = 6; k <= 9; k++) if (z.cols[k] !== null) { s += z.cols[k] * z.colsCover[k]; c += z.colsCover[k]; }
    if (c > 0) last = s / c;
    out[i] = last;
  });
  const first = out.find(Number.isFinite) ?? 0.5;
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) out[i] = first;
  return out;
}

/** Кульмінація — найвище (згладжене) значення провідної ознаки всередині відео (5–95 %). */
export function climaxOf(a, feature, text) {
  const n = a.count, x = smooth(Array.from(a.abs[feature]), Math.max(1, Math.round(a.rate * 2)));
  const lo = n > 20 ? Math.floor(n * 0.05) : 0, hi = n > 20 ? Math.ceil(n * 0.95) : n;
  let iMax = -1;
  for (let i = lo; i < hi; i++) if (a.valid[i] && (iMax < 0 || x[i] > x[iMax])) iMax = i;
  if (iMax < 0) iMax = Math.max(0, a.valid.indexOf(1));
  return { frame: iMax, time: a.times[iMax], feature, value: a.abs[feature][iMax], text };
}

/** Короткі спалахи (блискавки): сплеск різниці кадрів на тлі сталого руху — єдині події для типів ≠ temporal. */
function flashes(a, feature) {
  const fd = a.abs.frameDiff, n = a.count, out = [];
  if (!fd || n < 16) return out;
  const win = Math.max(3, Math.round(a.rate)), gap = Math.max(2, Math.round(a.rate));
  let last = -1e9;
  for (let i = 1; i < n - 1; i++) {
    if (!a.valid[i] || i - last < gap) continue;
    const loc = [];
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) if (Math.abs(j - i) > 1) loc.push(fd[j]);
    const med = median(loc), mad = median(loc.map(v => Math.abs(v - med))) || 1e-6;
    const k = (fd[i] - med) / Math.max(mad, 0.002);
    if (k < 8 || fd[i] < fd[i - 1] || fd[i] < 1.5 * med) continue;
    last = i;
    out.push({ type: "peak", frame: i, time: a.times[i], feature, strength: Math.min(1, 0.5 + k / 40), value: fd[i], flash: true, text: "короткий спалах у кадрі" });
  }
  return out;
}

/**
 * Застосувати тип руху до аналізу (авто або вибір користувача). Повертає новий об'єкт аналізу;
 * вихідні («часові») події, провідну ознаку й кульмінацію зберігає в temporalBase — щоб можна було повернутись.
 */
export function applyMotion(a, type, { auto = false } = {}) {
  const base = a.temporalBase || { events: a.events, leadFeature: a.leadFeature, hotspots: a.hotspots, period: a.period, climax: a.climax, keyFeatures: a.keyFeatures };
  const motion = { ...(a.motion || {}), type, auto, label: MOTION_LABEL[type], note: MOTION_NOTE[type] || "" };
  if (type === "temporal" || a.count < 2) return { ...a, ...base, temporalBase: base, motion };
  const out = { ...a, temporalBase: base, motion, abs: { ...a.abs }, rel: { ...a.rel }, norm: { ...a.norm }, rank: { ...a.rank }, temporal: { ...a.temporal }, labels: { ...a.labels } };
  let lead = base.leadFeature && !/^hotspot/.test(base.leadFeature) ? base.leadFeature : a.mainFeature;
  if (type === "rotating-globe") {
    const id = "centerValue", x = centerSeries(a.zones), dif = [];
    for (let i = 1; i < a.count; i++) if (a.valid[i] && a.valid[i - 1]) dif.push(Math.abs(x[i] - x[i - 1]));
    // шум — малі перцентилі різниць сусідніх кадрів (медіана вже містить саме сканування)
    const r = normalizeSeries(x, { noise: dif.length ? percentile(dif, 20) : 0, range: [0, 1], valid: a.valid });
    out.abs[id] = x; out.rel[id] = r.rel; out.norm[id] = r.info; out.rank[id] = globalRank(x, a.valid);
    for (const k of TEMPORAL_KEYS) out.temporal[`${id}.${k}`] = new Float32Array(a.count);
    out.labels[id] = "Значення в центрі диска (меридіан перед слухачем)";
    if (r.info.significant) lead = id;
  }
  if (!out.norm[lead]?.significant) lead = [a.mainFeature, ...a.keyFeatures].find(f => !/^hotspot/.test(f) && out.norm[f]?.significant) || null;
  out.leadFeature = lead;
  out.keyFeatures = [...new Set([lead, ...base.keyFeatures.filter(f => !/^hotspot/.test(f))].filter(Boolean))];
  out.hotspots = [];
  out.period = null;
  out.events = lead ? flashes(out, lead) : [];
  out.climax = lead ? climaxOf(out, lead, type === "rotating-globe" ? "найвище значення в центрі диска" : `найвище значення «${out.labels[lead]}» у кадрі`) : null;
  return out;
}
