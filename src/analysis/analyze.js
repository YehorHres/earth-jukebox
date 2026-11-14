// Повний аналіз відео: прохід A → прохід B → нормалізація abs/rel → часові ознаки → події.
// Результат (колонковий формат — ряди по кадрах):
// { version, key, profile, rate, count, times, valid, abs: {f: []}, rel: {f: []}, temporal: {"f.trend40": []},
//   rank: {f: []}, zones: [кадр → zones], norm: {f: info}, events, cuts, period, climax, hotspots, keyFeatures }
// Один кадр у форматі CLAUDE.md: getFrame(analysis, i) → { time, features, rel, zones }.
import { passA } from "./pass-a.js";
import { passB } from "./pass-b.js";
import { normalizeSeries, globalRank } from "./normalize.js";
import { temporalFeatures, TEMPORAL_KEYS } from "./temporal.js";
import { detectEvents } from "./events.js";
import { cacheGet, cachePut } from "./cache.js";
import { listFeatures, getFeature, MAIN_FEATURE } from "../features/index.js";
import { BANDS } from "../features/zones.js";
import { median, percentile, smooth, autocorr, std, mean } from "../util/stats.js";

export const ANALYSIS_VERSION = 7;

export const KEY_FEATURES = {
  heatmap: ["warmth", "hotShare", "coldShare", "activeMass", "centerY"],
  nightlights: ["lightLog", "lightPoints", "lightClusters", "agglomeration", "darkShare"],
  truecolor: ["whiteness", "greenness", "waterBlue", "brightness"],
  chart: ["brightness", "contrast", "edgeDensity", "activeMass"],
  mixed: ["brightness", "warmth", "activeMass", "edgeDensity"],
};
const STORY = {
  heatmap: { feature: "hotShare", text: "найбільша площа теплої води" },
  nightlights: { feature: "lightLog", text: "найбільше світла" },
  truecolor: { feature: "whiteness", text: "найбільше хмар і льоду" },
  chart: { feature: "brightness", text: "найвище значення" },
  mixed: { feature: "brightness", text: "найяскравіший момент" },
};

export async function analyzeSource(source, { sceneOverride = null, onProgress = () => {}, useCache = true, precomputedUrl = null } = {}) {
  const key = `v${ANALYSIS_VERSION}|${source.key}|${sceneOverride || ""}`;
  if (useCache) {
    const hit = await cacheGet(key);
    if (hit) { onProgress("cache", 1, "Аналіз узято з кешу"); return { ...hit, fromCache: true }; }
  }
  if (precomputedUrl) {
    const pre = await loadPrecomputed(precomputedUrl, key);
    if (pre) { onProgress("cache", 1, "Готовий аналіз завантажено"); return pre; }
  }
  const t0 = performance.now();
  const profile = await passA(source, { sceneOverride, onProgress: (p, msg) => onProgress("A", p, msg) });
  onProgress("A-done", 1, "Огляд завершено", profile);
  const pb = await passB(source, profile, { onProgress: (p, i, n) => onProgress("B", p, `Аналізую кадр ${i} з ${n}`) });
  const analysis = buildAnalysis(profile, pb);
  analysis.key = key;
  analysis.seconds = (performance.now() - t0) / 1000;
  analysis.passBSeconds = pb.seconds;
  analysis.processor = pb.processor;
  if (useCache) await cachePut(key, analysis);
  return analysis;
}

/** Чиста функція: сирі кадри проходу B + профіль → повний аналіз. */
export function buildAnalysis(profile, pb) {
  const frames = pb.frames, n = frames.length, rate = pb.rate;
  const feats = listFeatures();
  const times = Float32Array.from(frames, f => f.time);
  const abs = {};
  for (const f of feats) abs[f.id] = Float32Array.from(frames, fr => fr.features[f.id]);

  // ---- службові кадри й склейки
  const valid = new Uint8Array(n).fill(1);
  const cuts = [];
  for (let i = 0; i < n; i++) if (abs.brightness[i] < 0.02 || abs.contrast[i] < 0.01) valid[i] = 0;
  if (valid.every(v => !v)) valid.fill(1);     // повністю темне відео — це не «службові кадри»
  if (n > 4) {
    // два детектори: різкий стрибок яскравості (склейка, титр) і зміна «розкладки» кадру —
    // покриття даними по клітинках (рух камери: суша й океан міняються місцями)
    const fd = Array.from(abs.frameDiff), med = median(fd), mad = median(fd.map(v => Math.abs(v - med))) || 1e-6;
    const lay = [0];
    for (let i = 1; i < n; i++) {
      const a = frames[i].zones.gridCover, b = frames[i - 1].zones.gridCover;
      let s = 0;
      for (let c = 0; c < a.length; c++) s += Math.abs(a[c] - b[c]);
      lay.push(s / a.length);
    }
    const lmed = median(lay.slice(1)), lmad = median(lay.slice(1).map(v => Math.abs(v - lmed))) || 1e-6;
    for (let i = 1; i < n; i++) {
      const jump = fd[i] > Math.max(0.2, med + 10 * mad, 2.5 * med);
      const layout = lay[i] > Math.max(0.03, lmed + 12 * lmad, 4 * lmed);
      if (!jump && !layout) continue;
      valid[i] = 0;
      // сусідні кадри стрибка (перехід/наплив) — одна склейка
      const last = cuts[cuts.length - 1];
      if (last && i - last.endFrame <= Math.max(2, Math.round(rate * 1.5))) { last.endFrame = i; last.endTime = times[i]; }
      else cuts.push({ frame: i, time: times[i], endFrame: i, endTime: times[i] });
    }
    // між кадрами однієї склейки дані теж «змішані» — не враховуємо
    for (const c of cuts) for (let i = c.frame; i <= c.endFrame; i++) valid[i] = 0;
    // переходи в перших/останніх 3 % — затемнення, титри, петля відео; це не межі розділів
    for (const c of cuts) c.edge = c.frame < n * 0.03 || c.endFrame > n * 0.97;
  }
  // службові кадри заповнюємо попереднім валідним значенням (дані в них немає)
  for (const f of feats) {
    const a = abs[f.id];
    let last = null;
    for (let i = 0; i < n; i++) { if (valid[i]) last = a[i]; else if (last !== null) a[i] = last; }
    const firstValid = valid.indexOf(1);
    for (let i = 0; i < firstValid; i++) a[i] = a[firstValid];
  }

  // ---- «гарячі точки» — ряди найактивніших зон як окремі ознаки-солісти.
  // Середнє по всьому кадру не бачить локальних змін (місто, що росте, займає 1 % кадру).
  const noChange = profile.changeScale === "none";
  const zones = frames.map(f => f.zones);
  const hotspots = noChange ? [] : findHotspots(zones, profile, times);
  const labels = Object.fromEntries(feats.map(f => [f.id, f.label]));
  const series = feats.map(f => ({ id: f.id, range: f.range, noise: f.id === "frameDiff" ? profile.noiseFloor * 5 : profile.featureNoise[f.id] || 0 }));
  hotspots.forEach((hs, k) => {
    const id = `hotspot${k + 1}`;
    const x = Float32Array.from(hs.series);
    let last = null;
    for (let i = 0; i < n; i++) { if (Number.isFinite(x[i]) && valid[i]) last = x[i]; else x[i] = last ?? NaN; }
    const first = x.find(Number.isFinite) ?? 0;
    for (let i = 0; i < n; i++) if (!Number.isFinite(x[i])) x[i] = first;
    abs[id] = x;
    labels[id] = `Гаряча точка ${k + 1} (${hs.label})`;
    // шум зони — з різниць сусідніх кадрів (консервативно: включає й реальні зміни)
    const dif = [];
    for (let i = 1; i < n; i++) if (valid[i] && valid[i - 1]) dif.push(Math.abs(x[i] - x[i - 1]));
    series.push({ id, range: [0, 1], noise: median(dif) });
    hs.id = id;
  });

  // ---- нормалізація abs/rel
  const rel = {}, norm = {}, temporal = {}, rank = {};
  for (const s of series) {
    const r = normalizeSeries(abs[s.id], { noise: s.noise, range: s.range, valid });
    if (noChange) r.info.significant = false;     // змін немає — жодна ознака не «грає драму»
    rel[s.id] = r.rel; norm[s.id] = r.info;
    if (n > 1 && r.info.significant) {
      const t = temporalFeatures(r.rel, r.info.relNoise);
      for (const k of TEMPORAL_KEYS) temporal[`${s.id}.${k}`] = t[k];
    } else {
      // без значущих змін немає ні швидкості, ні тренду
      for (const k of TEMPORAL_KEYS) temporal[`${s.id}.${k}`] = new Float32Array(n);
    }
    rank[s.id] = globalRank(abs[s.id], valid);
  }

  const sceneType = profile.sceneType;
  const keyFeatures = [...(KEY_FEATURES[sceneType] || KEY_FEATURES.mixed)];
  if (abs.hotspot1) keyFeatures.push("hotspot1");
  const events = n > 1 ? detectEvents({ times, abs, rel, norm, valid, rate, keyFeatures, labels, zonesCols: zones.map(z => z.cols) }) : [];

  // ---- провідна ознака: перша значуща з «історії» сцени → головної → гарячої точки → ключових
  const main = MAIN_FEATURE[sceneType] || "brightness";
  const story = STORY[sceneType] || STORY.mixed;
  const leadFeature = [story.feature, main, "hotspot1", ...keyFeatures].find(f => norm[f]?.significant) || null;

  // ---- періодичність (уточнення на повному ряді)
  let period = null;
  if (n > 16 && leadFeature) {
    const x = smooth(Array.from(abs[leadFeature]), Math.max(1, Math.round(rate * 0.5)));
    let best = 0, bestLag = 0;
    const minLag = Math.max(3, Math.round(rate * 2)), maxLag = Math.floor(n / 2);
    let prev = autocorr(x, minLag - 1), cur = autocorr(x, minLag);
    for (let lag = minLag; lag < maxLag; lag++) {
      const next = autocorr(x, lag + 1);
      if (cur > best && cur >= prev && cur >= next) { best = cur; bestLag = lag; }
      prev = cur; cur = next;
    }
    if (best > 0.6) period = { seconds: bestLag / rate, frames: bestLag, strength: best };
  }

  // ---- кульмінація
  let climax = null;
  if (leadFeature && n > 1) {
    // шукаємо всередині відео (5–95 %): краї — це зазвичай титри/затемнення й крайовий ефект згладжування
    const x = smooth(Array.from(abs[leadFeature]), Math.max(1, Math.round(rate * 2)));
    const lo = n > 20 ? Math.floor(n * 0.05) : 0, hi = n > 20 ? Math.ceil(n * 0.95) : n;
    let iMax = -1;
    for (let i = lo; i < hi; i++) if (valid[i] && (iMax < 0 || x[i] > x[iMax])) iMax = i;
    if (iMax < 0) iMax = Math.max(0, valid.indexOf(1));
    const hs = hotspots.find(h => h.id === leadFeature);
    climax = { frame: iMax, time: times[iMax], feature: leadFeature, value: abs[leadFeature][iMax],
      text: leadFeature === story.feature ? story.text
        : hs ? `${sceneType === "nightlights" ? "найбільше світла" : "найвище значення"} у зоні «${hs.label}»`
        : `найвище значення «${labels[leadFeature]}»` };
  }

  return {
    version: ANALYSIS_VERSION, profile, rate, count: n, times, valid, abs, rel, temporal, rank, zones, norm, labels,
    events, cuts, period, climax, hotspots, keyFeatures, mainFeature: main, leadFeature,
  };
}

/** «Гарячі точки»: top-3 клітинки сітки з найбільшою зміною за відео — «солісти» оркестру. */
function findHotspots(zones, profile, times) {
  const n = zones.length;
  if (n < 4) return [];
  const nCells = zones[0].grid.length, cols = 16;
  const cand = [];
  for (let c = 0; c < nCells; c++) {
    const s = [];
    for (let i = 0; i < n; i++) if (zones[i].grid[c] !== null) s.push(zones[i].grid[c]);
    if (s.length < n * 0.6) continue;
    const spread = percentile(s, 95) - percentile(s, 5);
    if (spread < 4 * (profile.noiseCell || 0)) continue;
    cand.push({ cell: c, spread, std: std(s, mean(s)) });
  }
  cand.sort((a, b) => b.spread - a.spread);
  const picked = [];
  for (const c of cand) {
    const x = c.cell % cols, y = Math.floor(c.cell / cols);
    if (picked.some(p => Math.max(Math.abs(p.col - x), Math.abs(p.row - y)) < 2)) continue;
    const fy = (y + 0.5) / 8, band = BANDS.find(b => fy >= b.y0 && fy < b.y1);
    const lon = -180 + (x + 0.5) * 22.5;
    const lonText = Math.abs(lon) < 12 ? "нульовий меридіан" : `≈${Math.round(Math.abs(lon))}° ${lon < 0 ? "зх." : "сх."} д.`;
    const series = Float32Array.from(zones, z => (z.grid[c.cell] ?? NaN));
    picked.push({ cell: c.cell, col: x, row: y, spread: c.spread, label: `${band.label}, ${lonText}`, series });
    if (picked.length === 3) break;
  }
  return picked;
}

/** Кадр у форматі між шарами (CLAUDE.md): { time, features, rel, zones }. */
export function getFrame(a, i) {
  const features = {}, rel = {};
  for (const k in a.abs) { features[k] = a.abs[k][i]; rel[k] = a.rel[k][i]; }
  for (const k in a.temporal) features[k] = a.temporal[k][i];
  return { time: a.times[i], features, rel, zones: a.zones[i], pos: a.count > 1 ? i / (a.count - 1) : 0 };
}

/* ---------- готовий аналіз для галереї (етап 8) ---------- */
async function loadPrecomputed(url, key) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const { deserializeAnalysis } = await import("./serialize.js");
    const a = deserializeAnalysis(await res.json());
    return a.version === ANALYSIS_VERSION ? { ...a, key, fromPrecomputed: true } : null;
  } catch { return null; }
}
