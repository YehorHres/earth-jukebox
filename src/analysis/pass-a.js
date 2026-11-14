// Прохід A — «огляд»: 32 кадри по всьому відео → профіль відео.
// { sceneType, confidence, sceneScores, staticMask, landMask, bgMask, overlayMask, maskW, maskH,
//   ranges, noiseFloor, featureNoise, changeRatio, changeScale, mainFeature, cuts, serviceTimes,
//   period, durationSec, fps, sampleCount }
import { grab, analysisSize } from "../media/frames.js";
import { buildContext, hueRampValue, DATA_MIN_SAT } from "./frame-context.js";
import { computeFrame, MAIN_FEATURE, listFeatures } from "../features/index.js";
import { describeRange, median, percentile, autocorr, clamp } from "../util/stats.js";
import { detectRegion, detectScale } from "./region.js";

const N_SAMPLES = 32, N_NOISE_PAIRS = 4, MASK_W = 160;

export async function passA(source, { onProgress = () => {}, sceneOverride = null } = {}) {
  const { w, h } = analysisSize(source, MASK_W);
  const n = w * h, dur = source.duration;
  const isStill = source.isStatic || !dur;
  const times = isStill ? [0] : Array.from({ length: N_SAMPLES }, (_, k) => (k + 0.5) / N_SAMPLES * dur);

  // ---- 1. зчитування огляду + пар сусідніх кадрів (для шуму)
  const frames = [];
  for (let k = 0; k < times.length; k++) {
    frames.push(grab(await source.seek(times[k]), w, h).data.slice());
    onProgress((k + 1) / (times.length + 2 * N_NOISE_PAIRS), `Огляд відео: кадр ${k + 1} з ${times.length}`);
  }
  const pairs = [];
  if (!isStill) {
    const dt = 1 / (source.fps || 30);
    for (let j = 0; j < N_NOISE_PAIRS; j++) {
      const t = (j + 0.3) / N_NOISE_PAIRS * dur;
      const a = grab(await source.seek(t), w, h).data.slice();
      const b = grab(await source.seek(Math.min(dur - 0.02, t + dt)), w, h).data.slice();
      pairs.push([a, b]);
      onProgress((times.length + 2 * (j + 1)) / (times.length + 2 * N_NOISE_PAIRS), "Оцінка рівня шуму…");
    }
  }

  // ---- 2. попіксельна статистика по часу
  const sR = new Float32Array(n), sG = new Float32Array(n), sB = new Float32Array(n);
  const qR = new Float32Array(n), qG = new Float32Array(n), qB = new Float32Array(n);
  const mSat = new Float32Array(n), mVal = new Float32Array(n), maxSat = new Float32Array(n);
  for (const d of frames) {
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = d[p] / 255, g = d[p + 1] / 255, b = d[p + 2] / 255;
      sR[i] += r; sG[i] += g; sB[i] += b; qR[i] += r * r; qG[i] += g * g; qB[i] += b * b;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), s = max > 0.08 ? (max - min) / max : 0;
      mVal[i] += max; mSat[i] += s;
      if (s > maxSat[i]) maxSat[i] = s;
    }
  }
  const F = frames.length, pxStd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = c => Math.max(0, c);
    const sr = Math.sqrt(v(qR[i] / F - (sR[i] / F) ** 2)), sg = Math.sqrt(v(qG[i] / F - (sG[i] / F) ** 2)), sb = Math.sqrt(v(qB[i] / F - (sB[i] / F) ** 2));
    pxStd[i] = Math.max(sr, sg, sb);
    mSat[i] /= F; mVal[i] /= F;
  }

  // ---- 3. шум: різниця сусідніх кадрів у «спокійних» пікселях + шум стиснення
  let noiseFloor = 1 / 255;
  if (pairs.length) {
    const calmThr = percentile(Array.from(pxStd), 25);
    const diffs = [];
    for (const [a, b] of pairs)
      for (let i = 0, p = 0; i < n; i++, p += 4)
        if (pxStd[i] <= calmThr) diffs.push((Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2])) / 765);
    noiseFloor = Math.max(1 / 255, median(diffs) + 0.5 / 255);
  }

  // ---- 4. маски
  const staticThr = Math.max(1.5 / 255, 2 * noiseFloor);
  const staticMask = new Uint8Array(n), landMask = new Uint8Array(n), bgMask = new Uint8Array(n), overlayMask = new Uint8Array(n);
  if (!isStill) {
    for (let i = 0; i < n; i++) {
      // суша: стабільно сіра (у жодному кадрі не насичена), трохи «мерехтить» від стиснення — це ок
      if (maxSat[i] < 0.25 && mVal[i] >= 0.12 && mVal[i] <= 0.75 && pxStd[i] < 0.05) landMask[i] = 1;
      if (pxStd[i] >= staticThr) continue;
      staticMask[i] = 1;
      if (mVal[i] < 0.1) bgMask[i] = 1;
    }
    majority(landMask, w, h); majority(bgMask, w, h);
    for (let i = 0; i < n; i++) if (landMask[i]) bgMask[i] = 0;
  } else {
    // одне фото: часу немає — суша/фон тільки за кольором
    for (let i = 0; i < n; i++) {
      if (mSat[i] < 0.2 && mVal[i] >= 0.2 && mVal[i] <= 0.75) landMask[i] = 1;
    }
  }

  // ---- 4б. область даних і службові елементи (етап 10): рамки, космос, чорні смуги, шкала кольорів
  const meanRGB = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { meanRGB[3 * i] = sR[i] / F; meanRGB[3 * i + 1] = sG[i] / F; meanRGB[3 * i + 2] = sB[i] / F; }
  const scale = detectScale({ w, h, meanRGB, mSat, mVal, pxStd, still: isStill, staticThr });
  const region = detectRegion({ w, h, meanRGB, mVal, pxStd, still: isStill, staticThr });
  const regionMask = region.mask;
  if (scale.found) for (let i = 0; i < n; i++) if (scale.mask[i]) regionMask[i] = 0;
  const inRegion = i => regionMask[i] === 1;
  const regionArea = Math.max(1, regionMask.reduce((s, v) => s + v, 0));
  // поза областю — не суша, не фон даних (це рамка/космос), щоб не плутати частки
  for (let i = 0; i < n; i++) if (!inRegion(i)) { landMask[i] = 0; bgMask[i] = 0; }

  // ---- 5. тип сцени (лише в області даних: чорний космос навколо глобуса — не «нічна карта»)
  const scene = classifyScene(frames, n, staticMask, regionMask);
  const sceneType = sceneOverride || scene.type;
  // статичні накладки: підписи, легенда, логотипи. Для нічних карт статичні кольорові вогні — це дані.
  for (let i = 0; i < n; i++) {
    if (!staticMask[i] || landMask[i] || bgMask[i] || !inRegion(i)) continue;
    if (sceneType === "nightlights" && mSat[i] >= 0.25) continue;
    overlayMask[i] = 1;
  }
  const scaleRefs = scale.found ? Float32Array.from(scale.refs.flat()) : null;
  const masks = { staticMask, landMask, bgMask, overlayMask, regionMask, scaleRefs, disk: region.disk };

  // ---- 6. ознаки на кадрах огляду → діапазони
  const series = {};
  for (const f of listFeatures()) series[f.id] = [];
  for (const d of frames) {
    const { features } = computeFrame(buildContext(d, w, h, masks, null, sceneType), false);
    for (const k in features) series[k].push(features[k]);
  }
  const ranges = {};
  for (const k in series) ranges[k] = describeRange(series[k]);

  // шум кожної ознаки: різниця між сусідніми кадрами
  const featureNoise = {};
  for (const f of listFeatures()) featureNoise[f.id] = 0;
  if (pairs.length) {
    const per = {};
    for (const [a, b] of pairs) {
      const fa = computeFrame(buildContext(a, w, h, masks, null, sceneType), false).features;
      const fb = computeFrame(buildContext(b, w, h, masks, null, sceneType), false).features;
      for (const k in fa) (per[k] ||= []).push(Math.abs(fa[k] - fb[k]));
    }
    for (const k in per) featureNoise[k] = median(per[k]);
  }

  // ---- 7. масштаб змін по зонах 16×8: значущість (відношення до шуму) + амплітуда
  // Середнє по всьому кадру «топить» локальні зміни (місто, що росте) у шумі, тому міряємо по зонах.
  const mainFeature = MAIN_FEATURE[sceneType] || "brightness";
  const cellVal = d => cellMeans(d, w, h, sceneType, masks, region.bbox);
  const cellSeries = frames.map(cellVal);                 // [кадр][клітинка]
  const nCells = GRID_C * GRID_R;
  const cellNoise = [];
  for (const [a, b] of pairs) {
    const ca = cellVal(a), cb = cellVal(b);
    for (let c = 0; c < nCells; c++) if (ca[c] !== null && cb[c] !== null) cellNoise.push(Math.abs(ca[c] - cb[c]));
  }
  const noiseCell = Math.max(1e-4, median(cellNoise));
  const cells = [];
  for (let c = 0; c < nCells; c++) {
    const s = cellSeries.map(f => f[c]).filter(v => v !== null);
    if (s.length < F * 0.6) continue;
    const spread = percentile(s, 95) - percentile(s, 5);
    cells.push({ c, spread, ratio: spread / (2 * noiseCell) });
  }
  const significant = cells.filter(x => x.ratio >= SIGNIFICANT);
  const changeRatio = isStill ? 0 : Math.max(0, ...cells.map(x => x.ratio));
  const changeAmp = significant.length ? Math.max(...significant.map(x => x.spread)) : 0;
  const changeArea = cells.length ? significant.length / cells.length : 0;
  const changeScale = isStill || !significant.length ? "none" :
    changeAmp < 0.03 ? "tiny" : changeAmp < 0.08 ? "small" : changeAmp < 0.18 ? "moderate" : "large";
  const spread = ranges[mainFeature].p95 - ranges[mainFeature].p5;

  // ---- 8. службові кадри (чорні / однотонні) — грубо; прохід B уточнить склейки
  const serviceTimes = [];
  frames.forEach((d, k) => {
    const s = series.brightness[k], c = series.contrast[k];
    if (s < 0.02 || c < 0.01) serviceTimes.push(times[k]);
  });

  // ---- 9. періодичність (грубо, на 32 кадрах)
  let period = null;
  if (!isStill && changeScale !== "none") {
    const sr = series[mainFeature];
    let best = 0, bestLag = 0;
    for (let lag = 3; lag <= Math.floor(F / 2); lag++) {
      const ac = autocorr(sr, lag);
      if (ac > best && ac >= autocorr(sr, lag - 1) && ac >= autocorr(sr, lag + 1)) { best = ac; bestLag = lag; }
    }
    if (best > 0.6 && bestLag * 2 <= F) period = { seconds: bestLag * dur / F, strength: best, coarse: true };
  }

  const share = m => { let c = 0; for (let i = 0; i < n; i++) if (m[i] && inRegion(i)) c++; return c / regionArea; };
  return {
    sceneType, sceneDetected: scene.type, confidence: sceneOverride ? 1 : scene.confidence, sceneScores: scene.scores, sceneStats: scene.stats,
    maskW: w, maskH: h, staticMask, landMask, bgMask, overlayMask, regionMask,
    region: { shape: region.shape, area: region.area, full: region.full, bbox: region.bbox, disk: region.disk, norm: region.norm },
    scale: scale.found ? { found: true, orientation: scale.orientation, refs: scale.refs, norm: scale.norm } : { found: false },
    shares: { static: share(staticMask), land: share(landMask), bg: share(bgMask), overlay: share(overlayMask) },
    ranges, featureNoise, noiseFloor, noiseCell, mainFeature, changeRatio, changeScale, changeAmp, changeArea,
    mainSpread: spread, cuts: [], serviceTimes, period,
    durationSec: dur, fps: source.fps, isStill, sampleCount: F,
  };
}

const GRID_C = 16, GRID_R = 8, SIGNIFICANT = 4;

/**
 * Середня «головна величина» в кожній клітинці 16×8:
 * heatmap — значення за шкалою кольору; інші — яскравість (перцептивна амплітуда, без лог-підсилення).
 */
function cellMeans(d, w, h, sceneType, masks, bb) {
  const sum = new Float64Array(GRID_C * GRID_R), cnt = new Uint32Array(GRID_C * GRID_R);
  const bw = bb.x1 - bb.x0 + 1, bh = bb.y1 - bb.y0 + 1;
  for (let y = bb.y0; y <= bb.y1; y++) {
    const gy = Math.min(GRID_R - 1, Math.floor((y - bb.y0) * GRID_R / bh));
    for (let x = bb.x0; x <= bb.x1; x++) {
      const i = y * w + x;
      if (masks.landMask[i] || masks.overlayMask[i] || !masks.regionMask[i]) continue;
      const p = i * 4, r = d[p], g = d[p + 1], b = d[p + 2];
      let v;
      if (sceneType === "heatmap") {
        const max = Math.max(r, g, b), min = Math.min(r, g, b), dd = max - min;
        if (max < 46 || dd / max < DATA_MIN_SAT) continue;
        let hh = max === r ? ((g - b) / dd) % 6 : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
        hh *= 60; if (hh < 0) hh += 360;
        v = hueRampValue(hh);
        if (v < 0) continue;
      } else v = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const c = gy * GRID_C + Math.min(GRID_C - 1, Math.floor((x - bb.x0) * GRID_C / bw));
      sum[c] += v; cnt[c]++;
    }
  }
  const cellArea = (bw / GRID_C) * (bh / GRID_R);
  return Array.from(sum, (s, c) => (cnt[c] > cellArea * 0.05 ? s / cnt[c] : null));
}

/** Мажоритарний фільтр 3×3 — прибирає «пил» у масках. */
function majority(mask, w, h) {
  const src = mask.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
      s += src[yy * w + xx]; c++;
    }
    mask[y * w + x] = s * 2 > c ? 1 : 0;
  }
}

/** Класифікатор типу сцени на простих правилах (з упевненістю). */
function classifyScene(frames, n, staticMask, regionMask) {
  let sat = 0, warm = 0, cold = 0, bright = 0, lit = 0, white = 0, earth = 0, total = 0;
  const vals = [], hist = new Map();
  for (const d of frames) {
    for (let i = 0, p = 0; i < n; i += 3, p += 12) {      // кожен 3-й піксель — досить
      if (regionMask && !regionMask[i]) continue;
      const r = d[p], g = d[p + 1], b = d[p + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b), v = max / 255, s = max ? (max - min) / max : 0;
      let hh = 0; const dd = max - min;
      if (dd) { if (max === r) hh = ((g - b) / dd) % 6; else if (max === g) hh = (b - r) / dd + 2; else hh = (r - g) / dd + 4; hh *= 60; if (hh < 0) hh += 360; }
      total++; vals.push(v);
      if (s >= 0.35 && v >= 0.18) { sat++; if (hh <= 60 || hh >= 330) warm++; else if (hh >= 170 && hh <= 260) cold++; }
      if (v > 0.5) bright++;
      if (v > 0.2) lit++;
      if (v > 0.75 && s < 0.15) white++;
      if (s > 0.15 && hh >= 20 && hh <= 160 && v > 0.15 && v < 0.75) earth++;
      const q = (r >> 5) << 6 | (g >> 5) << 3 | (b >> 5);
      hist.set(q, (hist.get(q) || 0) + 1);
    }
  }
  const st = {
    satShare: sat / total, warmShare: sat ? warm / sat : 0, coldShare: sat ? cold / sat : 0,
    medianV: median(vals), brightShare: bright / total, litShare: lit / total, whiteShare: white / total, earthShare: earth / total,
    dominantShare: Math.max(...hist.values()) / total,
    staticShare: staticMask.reduce((s, v) => s + v, 0) / n,
  };
  const scores = {
    heatmap: clamp(st.satShare / 0.3) * (st.warmShare > 0.05 && st.coldShare > 0.05 ? 1 : 0.55),
    // темний кадр + рідкі яскраві точки (є хоч трохи світла) + мало насиченого кольору
    nightlights: (st.medianV < 0.15 ? 1 : st.medianV < 0.25 ? 0.4 : 0) * (1 - clamp(st.satShare / 0.15)) *
      (st.brightShare < 0.2 ? 1 : 0.3) * (st.litShare > 0.0005 && st.litShare < 0.35 ? 1 : 0.2),
    truecolor: clamp(st.whiteShare / 0.08) * clamp(st.earthShare / 0.15) * (st.satShare < 0.6 ? 1 : 0.5),
    // графік: світлий однотонний фон, багато статики, тонкі лінії
    chart: (st.dominantShare > 0.45 ? clamp((st.dominantShare - 0.45) / 0.3) : 0) * (st.medianV > 0.5 ? 1 : 0.15) * clamp(st.staticShare / 0.5) * (1 - clamp(st.satShare / 0.4)),
    mixed: 0.25,
  };
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [type, best] = sorted[0], second = sorted[1][1];
  const confidence = clamp(best * (0.5 + 0.5 * (best - second) / Math.max(best, 1e-6)));
  return { type, confidence, scores, stats: st };
}
