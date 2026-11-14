// Шар 2 — мапінг: аналіз відео (шар 1) + таблиця-пресет (JSON) → параметри кожного такту.
// Вихід: { meta, bars: [{ bar, t0, dur, params: {...}, explain: {...}, events, section, ... }] }
// Кожен параметр = base + Σ weight · curve(ознака), обрізаний до діапазону; explain — внески джерел.
import { applyCurve, CURVE_LABEL } from "./curves.js";
import { computeForm, SECTION_LABEL } from "./form.js";
import { getFeature } from "../features/index.js";
import { clamp, percentile, mean } from "../util/stats.js";

export const PARAMS = ["energy", "density", "tension", "brightness", "register", "pan", "motion", "articulation", "space"];
export const PARAM_LABEL = {
  energy: "Енергія (гучність, к-сть інструментів)", density: "Густота ритму", tension: "Напруга (гармонія, дисонанс)",
  brightness: "Світлість ладу", register: "Регістр мелодії", pan: "Панорама (захід ↔ схід)", motion: "Рухливість",
  articulation: "Артикуляція (легато ↔ стакато)", space: "Простір (реверберація)", accent: "Акценти подій",
  orchestration: "Оркестровка", contour: "Контур мелодії",
};
export const CHANNEL_LABEL = { abs: "абс.", rel: "відн.", rank: "ранг", d1: "зміна за кадр", speed10: "швидкість", accel20: "прискорення", trend40: "тренд" };
const TEMPORAL = new Set(["d1", "speed10", "accel20", "trend40"]);

const presetCache = new Map();
export async function loadPreset(id) {
  if (!presetCache.has(id)) {
    const url = new URL(`./presets/${id}.json`, import.meta.url);
    presetCache.set(id, fetch(url).then(r => { if (!r.ok) throw new Error(`пресет ${id}: HTTP ${r.status}`); return r.json(); }));
  }
  return presetCache.get(id);
}
export const presetForScene = s => (["heatmap", "nightlights", "truecolor"].includes(s) ? s : "default");

/** Підпис джерела для пояснень. */
export function sourceLabel(a, src) {
  const name = a.labels?.[src.feature] || getFeature(src.feature)?.label || src.feature;
  return `${name} (${CHANNEL_LABEL[src.channel] || src.channel})`;
}

/** Ряд значень джерела + нормування до [0,1] або [-1,1]. */
function sourceSeries(a, src) {
  const f = src.feature, ch = src.channel;
  if (ch === "abs") {
    const arr = a.abs[f];
    if (!arr) return null;
    const range = src.in || getFeature(f)?.range || [0, 1];
    const signed = range[0] < 0;
    const norm = v => signed ? clamp(v / Math.max(Math.abs(range[0]), range[1]), -1, 1) : clamp((v - range[0]) / (range[1] - range[0]));
    return { arr, norm };
  }
  if (ch === "rel") return a.rel[f] ? { arr: a.rel[f], norm: v => v } : null;
  if (ch === "rank") return a.rank[f] ? { arr: a.rank[f], norm: v => v } : null;
  if (TEMPORAL.has(ch)) { const arr = a.temporal[`${f}.${ch}`]; return arr ? { arr, norm: v => v } : null; }
  return null;
}

function aggregate(arr, idx, how = "mean") {
  if (!idx.length) return 0;
  if (how === "max") { let m = -Infinity; for (const i of idx) m = Math.max(m, arr[i]); return m; }
  let s = 0;
  for (const i of idx) s += arr[i];
  return s / idx.length;
}

/**
 * @param {object} a аналіз (analyze.js)
 * @param {object} preset JSON-пресет
 */
export function mapAnalysis(a, preset) {
  const p = a.profile, dur = p.durationSec, still = p.isStill || a.count === 1;
  const noChange = p.changeScale === "none";

  // ---- темп усього треку
  const tp = preset.tempo;
  const ts = sourceSeries(a, tp);
  let tempoX = 0;
  if (ts && !noChange) {
    const all = [];
    for (let i = 0; i < a.count; i++) if (a.valid[i]) all.push(a.abs[tp.feature][i]);
    tempoX = clamp((mean(all) - tp.in[0]) / (tp.in[1] - tp.in[0]));
  }
  const bpm = Math.round(tp.bpm[0] + (tp.bpm[1] - tp.bpm[0]) * tempoX);
  const barDur = 240 / bpm;
  const nBars = still ? 8 : Math.max(4, Math.ceil(dur / barDur));

  // ---- кадри кожного такту
  const barFrames = [];
  for (let b = 0; b < nBars; b++) {
    if (still) { barFrames.push([0]); continue; }
    const t0 = b * barDur, t1 = t0 + barDur;
    const idx = [];
    for (let i = 0; i < a.count; i++) if (a.times[i] >= t0 && a.times[i] < t1 && a.valid[i]) idx.push(i);
    if (!idx.length) {
      // такт без валідних кадрів (кінець відео або склейка) — найближчий валідний кадр
      let best = 0, bd = Infinity;
      for (let i = 0; i < a.count; i++) { const d = Math.abs(a.times[i] - (t0 + t1) / 2); if (a.valid[i] && d < bd) { bd = d; best = i; } }
      idx.push(best);
    }
    barFrames.push(idx);
  }

  // ---- контур мелодії: нормування колонок по всьому відео (робастно)
  const colVals = [], colCov = [];
  for (let i = 0; i < a.count; i++) if (a.valid[i]) {
    for (const v of a.zones[i].cols) if (v !== null) colVals.push(v);
    for (const c of a.zones[i].colsCover) colCov.push(c);
  }
  const c5 = percentile(colVals, 5), c95 = percentile(colVals, 95), cSpan = Math.max(c95 - c5, 1e-6);
  // колонка, де даних помітно менше, ніж зазвичай (суша, фон), — пауза в мелодії
  const restCover = Math.max(0.04, 0.65 * percentile(colCov, 50));
  // акценти — лише від сильних подій провідних ознак
  const accentFeatures = new Set([a.leadFeature, ...a.keyFeatures.slice(0, 2), "hotspot1"].filter(Boolean));
  const minStrength = preset.accent.minStrength ?? 0.5;
  let lastAccentBar = -9;

  // ---- параметри по тактах
  const bars = [];
  const prev = {};
  for (let b = 0; b < nBars; b++) {
    const idx = barFrames[b];
    const params = {}, explain = {};
    for (const name of PARAMS) {
      const def = preset.params[name];
      if (!def) continue;
      const range = def.range || [0, 1];
      let v = def.base || 0;
      const parts = [{ source: "база", contrib: def.base || 0 }];
      for (const src of def.sources) {
        const s = sourceSeries(a, src);
        if (!s) { parts.push({ source: sourceLabel(a, src), contrib: 0, missing: true }); continue; }
        let x = s.norm(aggregate(s.arr, idx, src.agg));
        if (src.abs) x = Math.abs(x);
        const y = (src.weight || 0) * applyCurve(src.curve, x, src.invert && x >= 0);
        v += y;
        parts.push({ source: sourceLabel(a, src), x, contrib: y });
      }
      v = clamp(v, range[0], range[1]);
      // згладжування між тактами — без «смикання»
      const sm = def.smooth ?? 0.3;
      if (b > 0 && prev[name] !== undefined) v = prev[name] * sm + v * (1 - sm);
      prev[name] = v;
      params[name] = v;
      explain[name] = parts.filter(q => Math.abs(q.contrib) > 1e-4 || q.missing).sort((q, r) => Math.abs(r.contrib) - Math.abs(q.contrib));
    }

    // контур: 16 колонок, null = пауза (суша / фон / немає даних)
    const contour = [], contourCover = [];
    for (let c = 0; c < 16; c++) {
      let s = 0, n = 0, cov = 0;
      for (const i of idx) { const v = a.zones[i].cols[c]; cov += a.zones[i].colsCover[c]; if (v !== null) { s += v; n++; } }
      cov /= idx.length;
      contourCover.push(cov);
      contour.push(n && cov >= restCover ? clamp((s / n - c5) / cSpan) : null);
    }
    params.contour = contour;
    params.contourCover = contourCover;

    // події такту: усі — для пояснень; сильні — акценти (не більше 2, не в сусідніх тактах без потреби)
    const t0 = b * barDur;
    const all = still ? [] : a.events
      .filter(e => preset.accent.events.includes(e.type) && e.time >= t0 && e.time < t0 + barDur)
      .map(e => ({ ...e, offset: (e.time - t0) / barDur }));
    let evs = all.filter(e => accentFeatures.has(e.feature) && (e.strength >= minStrength || e.type === "globalMax" || e.type === "returnOfState"))
      .sort((p, q) => q.strength - p.strength).slice(0, 2);
    if (evs.length && b - lastAccentBar < 2 && !evs.some(e => e.strength >= 0.85 || e.type === "globalMax")) evs = [];
    if (evs.length) lastAccentBar = b;
    params.accent = evs.reduce((m, e) => Math.max(m, e.strength), 0);
    explain.accent = evs.map(e => ({ source: e.text, contrib: e.strength }));

    bars.push({ bar: b, t0, dur: barDur, frames: idx, params, explain, events: evs, allEvents: all });
  }

  // ---- форма треку
  const climaxBar = a.climax && !still ? Math.min(nBars - 1, Math.floor(a.climax.time / barDur)) : null;
  const { sections, formCurve, phrase } = computeForm(nBars, { climaxBar, energy: bars.map(x => x.params.energy), noChange });
  const cutBars = new Set((a.cuts || []).filter(c => !c.edge).map(c => Math.floor(c.time / barDur)));
  for (const s of sections) for (let b = s.b0; b < s.b1; b++) {
    const bar = bars[b];
    bar.section = s.id;
    bar.sectionLabel = s.label;
    bar.sectionPos = s.b1 - s.b0 > 1 ? (b - s.b0) / (s.b1 - s.b0 - 1) : 0;
    bar.sectionStart = b === s.b0;
    bar.transition = b === s.b1 - 1 && b < nBars - 1;      // останній такт перед новим розділом
    bar.cut = cutBars.has(b);
    bar.params.section = s.id;
    const orch = clamp(0.55 * formCurve[b] + 0.45 * bar.params.energy);
    bar.params.orchestration = orch;
    bar.explain.orchestration = [
      { source: `форма треку: ${s.label}`, contrib: 0.55 * formCurve[b] },
      { source: "енергія даних", contrib: 0.45 * bar.params.energy },
    ];
  }

  // ---- повернення мотиву: returnOfState і цикли (сезони)
  for (const bar of bars) bar.motifReturn = bar.allEvents.some(e => e.type === "returnOfState");
  if (a.period && !still) {
    const per = a.period.seconds;
    for (let b = 1; b < nBars; b++) if (Math.floor(bars[b].t0 / per) > Math.floor(bars[b - 1].t0 / per)) bars[b].motifReturn = true;
  }

  // примітка про масштаб для пояснень (розділ 2 ТЗ)
  const lf = a.leadFeature, ln = lf && a.norm[lf];
  const scaleNote = ln ? `Відносні значення (відн.) розтягнуто в межах цього відео: «${a.labels[lf]}» змінюється на ±${(ln.spread * 50).toFixed(1)} % шкали, підсилення ×${ln.gain.toFixed(ln.gain < 10 ? 1 : 0)}${ln.scale === "log" ? ", лог-шкала" : ""}.`
    : noChange ? "Значущих змін немає: відносні значення не підсилюються, музика спокійна." : "";

  return {
    meta: {
      preset: preset.id, presetTitle: preset.title, bpm, barDur, nBars, phrase, sections, still, noChange, scaleNote,
      tempoWhy: tp.why, tempoX, sceneType: p.sceneType, duration: still ? nBars * barDur : dur,
      key: a.key,
    },
    bars,
  };
}

export { SECTION_LABEL, CURVE_LABEL };
