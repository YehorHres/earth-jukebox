// v10 §1 — «кількість» для завантажених відео: гучність, густота, напруга, регістр, тембр і форма треку
// йдуть за ЧАСТКОЮ ДАНИХ НА ВИДИМІЙ ПОВЕРХНІ, а не за площею на екрані, рухом камери чи позицією в треку.
//   points — точкові дані (блискавки, хмара точок, вогні): частка точок на видимій поверхні;
//   fire   — пожежа: активний вогонь (жовте / помаранчеве / червоне);
//   value  — решта: значення головної величини (на обертовому глобусі — те, що зараз у центрі диска).
import { clamp, percentile } from "../util/stats.js";

/** Теми, де дані — окремі точки. */
export const POINT_TOPICS = new Set(["storms", "nightlights", "co2", "fires"]);
export const KIND_LABEL = { points: "частка точок на видимій поверхні", fire: "активний вогонь, частка видимої поверхні", value: "значення головної величини" };

/** Чи дані цього відео — «точки» (дрібні яскраві плями на темному / однорідному тлі). */
export const isPoints = (a, topic) => !!(a.norm?.pointShare?.significant && a.rel?.pointShare) && (POINT_TOPICS.has(topic?.id) || a.profile?.sceneType === "nightlights");

export const barMean = (series, bars) => bars.map(b => { let s = 0; for (const i of b.frames) s += series[i]; return s / b.frames.length; });
const stretch = x => { const lo = percentile(x, 3), hi = percentile(x, 97), span = hi - lo; return span > 1e-6 ? x.map(v => clamp((v - lo) / span)) : x.map(() => 0.5); };

/**
 * @returns {null | { kind, feature, label, q: number[] (0..1 за такт), span }}
 */
export function quantityModel(a, bars, { topic = null, pol = 1, valueSeries = null, valueFeature = null, valueLabel = "" } = {}) {
  const sig = f => !!(a.norm?.[f]?.significant && a.rel?.[f]);
  const tid = topic?.id;
  let kind = "value", feature = valueFeature, series = valueSeries, signed = pol;
  if (tid === "fires" && sig("fireShare")) { kind = "fire"; feature = "fireShare"; series = a.rel.fireShare; signed = 1; }
  // обертовий глобус: звучить те, що зараз перед слухачем (центр диска), — і гучність, і висота йдуть за ним
  else if (a.motion?.type === "rotating-globe" && valueFeature === "centerValue" && series) kind = "value";
  else if (isPoints(a, topic)) { kind = "points"; feature = "pointShare"; series = a.rel.pointShare; signed = 1; }
  if (!series) return null;
  let raw = barMean(series, bars).map(v => clamp(v));
  if (signed < 0) raw = raw.map(v => 1 - v);
  // наближення камери: якщо значення в кадрі змінюється разом із площею видимої поверхні (диск на пів кадру → затока на весь екран),
  // цю частину вилучаємо — те, що пояснюється зумом, не є зміною даних (для часток точок / вогню знаменник уже є сама поверхня)
  let zoomFix = 0;
  if (kind === "value" && a.abs?.surface && a.motion?.type !== "rotating-globe") {
    const S = barMean(a.abs.surface, bars), n = raw.length, mS = S.reduce((p, v) => p + v, 0) / n, mR = raw.reduce((p, v) => p + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (S[i] - mS) * (raw[i] - mR); sxx += (S[i] - mS) ** 2; syy += (raw[i] - mR) ** 2; }
    const r = sxy / Math.sqrt(sxx * syy || 1);
    if (Math.max(...S) - Math.min(...S) > 0.15 && Math.abs(r) > 0.2) { const beta = sxy / sxx; raw = raw.map((v, i) => v - beta * (S[i] - mS)); zoomFix = r; const lo = Math.min(...raw), hi = Math.max(...raw); if (lo < 0 || hi > 1) raw = raw.map(v => (v - lo) / Math.max(hi - lo, 1e-6)); }
  }
  const span = percentile(raw, 97) - percentile(raw, 3);
  // майже рівний ряд не розтягуємо на всю шкалу: рівні дані — рівна музика
  const k = Math.min(1, span / 0.2), st = stretch(raw), q = raw.map((v, i) => k * st[i] + (1 - k) * v);
  // легке згладжування між тактами (як в інших параметрів)
  for (let i = 1; i < q.length; i++) q[i] = 0.3 * q[i - 1] + 0.7 * q[i];
  const label = kind === "value" ? `${valueLabel} (відн.${zoomFix ? ", з поправкою на наближення камери" : ""})` : `${a.labels?.[feature] || feature} (відн.)`;
  return { kind, feature, label, q, span, zoomFix };
}

/** Записати «кількість» у параметри тактів: узгоджено гучність, густоту, напругу, регістр і яскравість тембру. */
export function applyQuantity(bars, model, { keepRhythm = false } = {}) {
  const src = c => [{ source: `${model.label} — ${KIND_LABEL[model.kind]}`, contrib: c }];
  bars.forEach((bar, b) => {
    const x = model.q[b], p = bar.params, e = bar.explain;
    p.quantity = x;
    p.level = x; e.level = src(x);
    p.energy = clamp(0.08 + 0.87 * x); e.energy = src(p.energy);
    p.tension = clamp(0.06 + 0.8 * x); e.tension = src(p.tension);
    // «швидкість змін → ритм» лишається для карт, де дані справді змінюються в часі (не рух камери)
    const d = clamp(0.15 + 0.75 * x);
    p.density = keepRhythm && p.density !== undefined ? 0.5 * p.density + 0.5 * d : d; e.density = src(p.density);
    p.register = clamp(0.25 + 0.6 * x); e.register = src(p.register);
    p.bright = x; e.bright = src(x);
    if (model.kind !== "value") { p.value = x; e.value = src(x); }
    p.drive = x; e.drive = src(x);
  });
}

/* ---------------- v10 §2, §3, §5, §10: точки, пожежа, «де більше», події ---------------- */
const median = x => { const s = x.slice().sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
const sigOf = (a, f) => !!(a.norm?.[f]?.significant && a.rel?.[f]);
export const isFire = (a, topic) => topic?.id === "fires" && sigOf(a, "fireShare");

/** Короткі сплески ряду (нові точки / нові осередки): стрибок над медіаною попередніх кадрів. col — де саме з'явилось. */
export function flashEvents(a, feature, text, key = "qp") {
  const x = a.abs?.[feature], n = a.count, out = [];
  if (!x || n < 12) return out;
  const dif = [];
  for (let i = 1; i < n; i++) if (a.valid[i] && a.valid[i - 1]) dif.push(Math.abs(x[i] - x[i - 1]));
  const mad = median(dif), gap = Math.max(2, Math.round(a.rate));
  let last = -1e9;
  for (let i = 5; i < n; i++) {
    if (!a.valid[i] || i - last < gap) continue;
    const base = median(Array.from(x.subarray(i - 5, i))), d = x[i] - base;
    if (d < Math.max(0.012, 5 * mad) || x[i] < x[i - 1]) continue;
    last = i;
    let col;
    const now = a.zones[i]?.[key], was = a.zones[i - 1]?.[key];
    if (now && was) { col = 0; for (let c = 1; c < now.length; c++) if (now[c] - was[c] > now[col] - was[col]) col = c; }
    out.push({ type: "peak", frame: i, time: a.times[i], feature, strength: clamp(0.5 + d / 0.15), value: x[i], flash: true, text, ...(col !== undefined ? { col } : {}) });
  }
  return out;
}

/** §10 «менше хаосу»: не більше однієї події на minGap секунд — лишаються найсильніші. */
export function thinEvents(events, minGap = 2.5) {
  const kept = [];
  for (const e of events.slice().sort((p, q) => q.strength - p.strength || p.time - q.time))
    if (kept.every(k => Math.abs(k.time - e.time) >= minGap)) kept.push(e);
  return kept.sort((p, q) => p.time - q.time);
}

const colMean = (a, bar, key) => {
  const out = new Array(16).fill(0); let n = 0;
  for (const i of bar.frames) { const z = a.zones[i]?.[key]; if (!z) continue; n++; for (let c = 0; c < 16; c++) out[c] += z[c]; }
  return n ? out.map(v => v / n) : null;
};
const SIDE = { west: { uk: "на заході (ліворуч)", en: "in the west (left)" }, center: { uk: "у центрі", en: "in the centre" }, east: { uk: "на сході (праворуч)", en: "in the east (right)" } };
export const sideOf = col => (col <= 4 ? "west" : col >= 11 ? "east" : "center");
export const sideText = (col, lang = "uk") => SIDE[sideOf(col)][lang] || SIDE[sideOf(col)].uk;

/**
 * Точки, вогонь і «де більше» → параметри тактів. Повертає { pointStyle, where } для meta.
 * points / pointCols — густота й місця звуків-точок; burned — «рахунок втрат» (неспадний); hot — найактивніша зона (соліст);
 * pan — центр мас даних по горизонталі (захід — ліве вухо, схід — праве).
 */
export function applyUploadVoices(a, bars, { topic = null, pol = 1, model = null, styleOf = () => "lights", stars = false } = {}) {
  const pts = isPoints(a, topic), fire = isFire(a, topic), key = fire ? "qf" : pts ? "qp" : null;
  const burnedSig = fire && sigOf(a, "burnedShare"), bs = burnedSig ? barMean(a.rel.burnedShare, bars) : null, pv = pts && !fire ? barMean(a.rel.pointShare, bars) : null;
  let run = 0, prevCol = null;
  const total = new Array(16).fill(0);
  bars.forEach((bar, b) => {
    const p = bar.params, e = bar.explain;
    let dist = key ? colMean(a, bar, key) : null;
    if (dist) {
      const mx = Math.max(...dist, 1e-9);
      p.points = fire ? model?.q[b] ?? 0 : clamp(pv[b]);
      p.pointCols = dist.map(v => v / mx);
      e.points = [{ source: fire ? "активний вогонь: кількість потріскувань за такт" : "частка точок на видимій поверхні: кількість звуків за такт", contrib: p.points }];
      // панорама голосу даних — центр мас точок / вогню по горизонталі
      let sw = 0, sx = 0; dist.forEach((v, c) => { sw += v; sx += v * (c / 7.5 - 1); });
      if (sw > 0) { p.pan = clamp(sx / sw, -1, 1); e.pan = [{ source: "горизонтальне положення даних (захід ↔ схід)", contrib: p.pan }]; }
    } else if (p.contour) dist = p.contour.map(v => (v === null ? 0 : pol < 0 ? 1 - v : v));
    if (burnedSig) { run = Math.max(run, clamp(bs[b])); p.burned = run; e.burned = [{ source: "згоріла площа (сіре) — накопичений максимум", contrib: run }]; }
    if (dist) {
      let col = 0; for (let c = 1; c < 16; c++) if (dist[c] > dist[col]) col = c;
      // соліст не «стрибає»: лишається в попередній зоні, поки нова не переважить на 10 %
      if (prevCol !== null && dist[prevCol] >= 0.9 * dist[col]) col = prevCol;
      prevCol = col;
      const mx = Math.max(...dist, 1e-9), sorted = dist.slice().sort((x, y) => x - y), med = sorted[8];
      if (dist[col] > 0) p.hot = { col, value: key ? clamp(p.points ?? 0.5) : clamp(dist[col]), strength: clamp((dist[col] - med) / mx) };
      e.hot = p.hot ? [{ source: `найактивніша зона — колонка ${col + 1} із 16 (${sideText(col)})`, contrib: p.hot.strength }] : [];
      const wgt = model ? model.q[b] : 1;
      dist.forEach((v, c) => (total[c] += wgt * v / mx));
    }
  });
  let top = 0; for (let c = 1; c < 16; c++) if (total[c] > total[top]) top = c;
  const any = total.some(v => v > 0), rot = a.motion?.type === "rotating-globe";
  // обертовий глобус: «де» — це момент обертання (усе проходить через центр диска), тож називаємо час максимуму
  let where = null;
  if (any && model) {
    let bMax = 0; model.q.forEach((v, b) => { if (v > model.q[bMax]) bMax = b; });
    const t = bars[bMax].t0, mm = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
    where = { col: top, side: sideOf(top), time: t, bar: bMax, rotating: rot,
      uk: rot ? `найбільше — близько ${mm}, коли ця частина глобуса проходить перед слухачем` : `найбільше — ${sideText(top, "uk")}; пік — близько ${mm}`,
      en: rot ? `the most is at about ${mm}, when that part of the globe passes in front of the listener` : `the most is ${sideText(top, "en")}; the peak is at about ${mm}` };
  }
  return { pointStyle: key ? (stars && !fire ? "lights-stars" : fire ? "fire" : styleOf(topic?.id)) : null, where, fire, points: pts };
}
