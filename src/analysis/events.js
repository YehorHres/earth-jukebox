// Детектор подій над усім відео (розділ 3 ТЗ). Можливий, бо аналіз зроблено наперед.
// Подія: { type, frame, time, feature, strength (0..1), value, text }
// Чесність: ознака без значущих змін (розмах < 4× шуму) подій не породжує.
import { smooth, median } from "../util/stats.js";

/**
 * @param {object} a { times, abs, rel, norm, valid, rate, keyFeatures: [ids], labels: {id: label} }
 */
export function detectEvents(a) {
  const { times, abs, rel, norm, valid, rate, keyFeatures, labels } = a;
  const n = times.length;
  const events = [];
  if (n < 8) return events;
  const sr = Math.max(1, Math.round(rate * 0.5));             // згладжування ~0.5 с
  const minGap = Math.max(3, Math.round(rate * 3));            // події однієї ознаки — не частіше ніж раз на 3 с

  for (const f of keyFeatures) {
    const info = norm[f];
    if (!info?.significant) continue;
    const x = smooth(Array.from(abs[f]), sr);
    const span = info.p95 - info.p5 || 1e-9;
    const noise = info.noise;
    const label = labels[f] || f;

    // --- peak / trough: локальні екстремуми зі значущою «висотою» (prominence)
    const win = Math.max(3, Math.round(rate * 1.5));
    let lastPeak = -1e9;
    for (let i = win; i < n - win; i++) {
      if (!valid[i]) continue;
      let isMax = true, isMin = true, lo = Infinity, hi = -Infinity;
      for (let j = i - win; j <= i + win; j++) {
        if (x[j] > x[i]) isMax = false;
        if (x[j] < x[i]) isMin = false;
        if (x[j] < lo) lo = x[j];
        if (x[j] > hi) hi = x[j];
      }
      if (!isMax && !isMin) continue;
      // висота відносно найнижчої (найвищої) точки в ширшому вікні
      const wide = win * 3;
      let ref = isMax ? Infinity : -Infinity;
      for (let j = Math.max(0, i - wide); j <= Math.min(n - 1, i + wide); j++) ref = isMax ? Math.min(ref, x[j]) : Math.max(ref, x[j]);
      const prom = Math.abs(x[i] - ref);
      if (prom < Math.max(3 * noise, 0.35 * span) || i - lastPeak < minGap) continue;
      lastPeak = i;
      events.push({ type: isMax ? "peak" : "trough", frame: i, time: times[i], feature: f, strength: Math.min(1, prom / span), value: abs[f][i],
        text: `${isMax ? "пік" : "спад"}: ${label}` });
    }

    // --- thresholdCross: перетин p90 угору / p10 униз (з гістерезисом)
    const p90 = info.p5 + 0.94 * span, p10 = info.p5 + 0.06 * span;   // ≈ p90 / p10 за діапазоном p5..p95
    const hyst = Math.max(noise, 0.05 * span);
    let above = x[0] >= p90, below = x[0] <= p10, lastCross = -1e9;
    for (let i = 1; i < n; i++) {
      if (!valid[i]) continue;
      if (!above && x[i] >= p90 + hyst * 0.5 && i - lastCross >= minGap) { above = true; lastCross = i; events.push({ type: "thresholdCross", dir: "up", frame: i, time: times[i], feature: f, strength: 0.7, value: abs[f][i], text: `${label}: перетнула верхній рівень (10 % найвищих значень)` }); }
      else if (above && x[i] < p90 - hyst) above = false;
      if (!below && x[i] <= p10 - hyst * 0.5 && i - lastCross >= minGap) { below = true; lastCross = i; events.push({ type: "thresholdCross", dir: "down", frame: i, time: times[i], feature: f, strength: 0.6, value: abs[f][i], text: `${label}: опустилася до нижнього рівня (10 % найнижчих)` }); }
      else if (below && x[i] > p10 + hyst) below = false;
    }

    // --- changePoint: різниця середніх у вікнах до/після
    const W = Math.max(4, Math.round(rate * 3));
    const diff = new Float32Array(n);
    for (let i = W; i < n - W; i++) {
      let a1 = 0, a2 = 0;
      for (let j = i - W; j < i; j++) a1 += x[j];
      for (let j = i; j < i + W; j++) a2 += x[j];
      diff[i] = (a2 - a1) / W;
    }
    const cpGap = Math.max(minGap, Math.round(rate * 8));
    let lastCp = -1e9;
    for (let i = W + 1; i < n - W - 1; i++) {
      const d = Math.abs(diff[i]);
      if (d < Math.max(4 * noise, 0.4 * span) || d < Math.abs(diff[i - 1]) || d < Math.abs(diff[i + 1]) || i - lastCp < cpGap) continue;
      lastCp = i;
      events.push({ type: "changePoint", frame: i, time: times[i], feature: f, strength: Math.min(1, d / span), value: abs[f][i], dir: diff[i] > 0 ? "up" : "down",
        text: `зміна режиму: ${label} ${diff[i] > 0 ? "зростає" : "спадає"}` });
    }
  }

  // --- globalMax / globalMin головної ознаки
  const main = keyFeatures[0];
  if (norm[main]?.significant) {
    const x = smooth(Array.from(abs[main]), sr);
    let iMax = -1, iMin = -1;
    for (let i = 0; i < n; i++) {
      if (!valid[i]) continue;
      if (iMax < 0 || x[i] > x[iMax]) iMax = i;
      if (iMin < 0 || x[i] < x[iMin]) iMin = i;
    }
    events.push({ type: "globalMax", frame: iMax, time: times[iMax], feature: main, strength: 1, value: abs[main][iMax], text: `найвище значення за все відео: ${labels[main]}` });
    events.push({ type: "globalMin", frame: iMin, time: times[iMin], feature: main, strength: 1, value: abs[main][iMin], text: `найнижче значення за все відео: ${labels[main]}` });
  }

  events.push(...detectReturns(a));
  events.sort((p, q) => p.frame - q.frame);
  return events;
}

/** returnOfState: стан, схожий на вже бачений (після того як відео від нього «пішло»). */
function detectReturns({ times, rel, norm, valid, rate, keyFeatures, zonesCols }) {
  const feats = keyFeatures.filter(f => norm[f]?.significant);
  if (!feats.length) return [];
  const n = times.length, step = Math.max(1, Math.round(rate / 2));   // ~2 стани на секунду
  const idx = [];
  for (let i = 0; i < n; i += step) if (valid[i]) idx.push(i);
  const vec = i => {
    const v = feats.map(f => rel[f][i]);
    if (zonesCols) for (const c of zonesCols[i]) v.push(c === null ? 0.5 : c);
    return v;
  };
  const V = idx.map(vec);
  const dist = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2; return Math.sqrt(s / a.length); };
  const sample = [];
  for (let a = 0; a < V.length; a += 3) for (let b = a + 3; b < V.length; b += 7) sample.push(dist(V[a], V[b]));
  const typical = median(sample);
  if (!(typical > 1e-6)) return [];
  const gapFrames = Math.max(rate * 8, n * 0.15);
  const out = [];
  let last = -1e9;
  for (let a = 0; a < V.length; a++) {
    const i = idx[a];
    if (i - last < gapFrames) continue;
    let best = Infinity, bestJ = -1;
    for (let b = 0; b < a; b++) {
      if (i - idx[b] < gapFrames) break;
      const d = dist(V[a], V[b]);
      if (d < best) { best = d; bestJ = b; }
    }
    if (bestJ < 0 || best > 0.3 * typical) continue;
    // між ними відео мало «піти» далеко від цього стану
    let away = 0;
    for (let b = bestJ + 1; b < a; b++) away = Math.max(away, dist(V[a], V[b]));
    if (away < 1.5 * typical) continue;
    last = i;
    out.push({ type: "returnOfState", frame: i, time: times[i], feature: feats[0], strength: Math.min(1, 1 - best / (0.3 * typical)), refFrame: idx[bestJ], refTime: times[idx[bestJ]],
      text: `повернення до стану, як на ${times[idx[bestJ]].toFixed(0)} с` });
  }
  return out;
}
