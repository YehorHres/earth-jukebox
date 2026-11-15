// v10 §2–3 — партії для завантажених відео з «точковими» даними й пожежею. Звучать лише коли мапер дав
// params.points / params.burned (галерея їх не має — її партитури не змінюються).
// Принцип нічних вогнів: кожна точка / кластер → звук на своєму місці (панорама = положення), густота = кількість
// точок на видимій поверхні, нова точка → новий звук. Характер — свій у кожної теми:
//   lightning — різкий яскравий тріск + сухий удар, а за мить — далекий низький гуркіт грому;
//   fire      — тепле потріскування, іскри вгору (маримба), тривожніше з кількістю вогню;
//   cloud     — м'які щільні «хмари»: тихі подихи шуму й скляні ноти, що густішають;
//   lights    — дзвінкі ноти (як вогники).
import { chordPcs, nearest } from "./common.js";
import { pentatonic } from "./stars.js";
import { snapToMode } from "../theory.js";

/** Скільки звуків-точок у такті для частки точок 0..1 (0 — тиша). */
export const pointCount = v => (v < 0.02 ? 0 : Math.round(1 + 15 * v));
export const POINT_STYLE = { storms: "lightning", fires: "fire", co2: "cloud", nightlights: "lights", aerosols: "cloud" };
export const pointStyleOf = topicId => POINT_STYLE[topicId] || "lights";
const panOf = c => -0.85 + 1.7 * c / 15;

const SPEC = {
  crack: { noise: [9000, 2600, 1.2], tone: [2600, 320, "sawtooth"], dur: 0.07 },
  thunder: { noise: [170, 48, 0.8], tone: [70, 38, "sine"], dur: 1.5 },
  crackle: { noise: [2700, 1900, 9], dur: 0.035 },
  ember: { noise: [900, 2400, 3], dur: 0.12 },
  puff: { noise: [420, 760, 1.1], dur: 0.55 },
};

export const points = {
  id: "points", upload: true,
  label: "Точки даних",
  role: "Точкові дані: кожна точка / кластер — короткий звук на своєму місці (ліве ↔ праве вухо); кількість звуків за такт = частка точок на видимій поверхні; нова точка — новий звук",
  active: (o, ctx) => ctx.bar.params.points !== undefined && ctx.meta.pointStyle !== "lights-stars",
  render(ctx, out) {
    const { bar, h, rng, meter, state, meta } = ctx, p = bar.params, style = meta.pointStyle || "lights";
    const n = pointCount(p.points), prev = state.v;
    state.v = p.points;
    if (!n) return;
    const cols = (p.pointCols || []).map((v, c) => ({ v, c })).filter(x => x.v > 0.02);
    if (!cols.length) cols.push({ v: 1, c: 8 });
    const tot = cols.reduce((s, x) => s + 0.05 + x.v, 0), stepDur = bar.dur / meter.steps, pcs = pentatonic(h);
    const quiet = bar.section === "intro" ? 0.5 : 1;
    let thunder = 0;
    for (let k = 0; k < n; k++) {
      let r = rng() * tot, pick = cols[0];
      for (const x of cols) { r -= 0.05 + x.v; if (r <= 0) { pick = x; break; } }
      // момент у такті — теж за положенням (захід → схід), з легким розкидом
      const step = Math.min(meter.steps - 1, Math.floor((pick.c + rng()) / 16 * meter.steps)), t = bar.t0 + step * stepDur, pan = panOf(pick.c), w = 0.4 + 0.6 * pick.v;
      if (style === "lightning") {
        out.push({ inst: "earcon", ec: SPEC.crack, t, midi: 0, dur: SPEC.crack.dur, vel: (0.3 + 0.35 * w) * quiet, pan, col: pick.c, point: true, fixed: true });
        if (k % 2 === 0) out.push({ inst: "pizz", t, midi: nearest(pcs[rng.int(0, pcs.length - 1)], 76 + Math.round(8 * w), 67, 91), dur: 0.12, vel: (0.3 + 0.3 * w) * quiet, pan, col: pick.c, echo: true });
        // далекий грім: із затримкою, низько, майже по центру; що більше спалахів — то частіше (до 3 за такт)
        if (thunder < 1 + Math.floor(2.2 * p.points) && (k === 0 || rng() < 0.3)) { thunder++; out.push({ inst: "earcon", ec: SPEC.thunder, t: t + 0.45 + 0.4 * rng(), midi: 0, dur: SPEC.thunder.dur, vel: (0.3 + 0.45 * p.points) * quiet, pan: pan * 0.35, echo: true, thunder: true, fixed: true }); }
      } else if (style === "fire") {
        out.push({ inst: "earcon", ec: SPEC.crackle, t, midi: 0, dur: SPEC.crackle.dur, vel: (0.3 + 0.4 * w) * quiet, pan, col: pick.c, point: true, fixed: true });
        if (k % 3 === 0) out.push({ inst: "marimba", t, midi: nearest(pcs[rng.int(0, pcs.length - 1)], 64 + Math.round(10 * w), 57, 81), dur: 0.3, vel: (0.3 + 0.3 * w) * quiet, pan, col: pick.c, echo: true });
      } else if (style === "cloud") {
        out.push({ inst: "glass", t, midi: nearest(pcs[rng.int(0, pcs.length - 1)], 69 + Math.round(8 * w), 62, 84), dur: 0.9 + 0.8 * p.points, vel: (0.2 + 0.28 * w) * quiet, pan, col: pick.c, point: true });
        if (k % 4 === 0) out.push({ inst: "earcon", ec: SPEC.puff, t, midi: 0, dur: SPEC.puff.dur, vel: (0.12 + 0.2 * p.points) * quiet, pan, echo: true, fixed: true });
      } else {
        out.push({ inst: ["xylophone", "celesta", "glockenspiel"][k % 3], t, midi: nearest(pcs[rng.int(0, pcs.length - 1)], 84 + Math.round(pick.v * 10), 76, 100), dur: 0.25, vel: (0.22 + 0.4 * w) * quiet, pan, col: pick.c, point: true });
      }
    }
    // нова точка → новий звук: точок стало помітно більше — яскравий знак у найактивнішій зоні
    if (prev !== undefined && p.points - prev > 0.1) {
      const top = cols.reduce((q, x) => (x.v > q.v ? x : q), cols[0]), t = bar.t0 + Math.floor(meter.steps / 2) * stepDur;
      if (style === "fire") [0, 1, 2].forEach(i => out.push({ inst: "marimba", t: t + i * stepDur, midi: nearest(pcs[i % pcs.length], 76 + 4 * i, 72, 96), dur: 0.2, vel: 0.5, pan: panOf(top.c), echo: true, spark: true }));
      else out.push({ inst: style === "lightning" ? "earcon" : "glockenspiel", ...(style === "lightning" ? { ec: SPEC.crack } : {}), t, midi: style === "lightning" ? 0 : nearest(pcs[0], 96, 88, 103), dur: 0.3, vel: 0.65, pan: panOf(top.c), echo: true, spark: true, fixed: style === "lightning" });
    }
  },
};

// Пожежа — другий голос: «уже згоріло» (сіре) → низький дрон, що монотонно наростає («рахунок втрат»).
export const burned = {
  id: "burned", upload: true,
  label: "Згоріла площа",
  role: "Пожежа: низький дрон «рахунок втрат» — висота й гучність монотонно ростуть із часткою вже згорілої (сірої) площі; ніколи не спадає",
  active: (o, ctx) => ctx.bar.params.burned !== undefined,
  render(ctx, out) {
    const { bar, h, state } = ctx, v = bar.params.burned;
    // висота не спадає: щабель ладу над низькою тонікою (до октави й квінти), гучність — разом із нею
    const root = nearest(((h.root % 12) + 12) % 12, 31, 26, 37);
    const midi = Math.max(state.midi ?? 0, snapToMode(root + Math.round(19 * v), h.root, h.mode));
    state.midi = midi;
    out.push({ inst: "drone", t: bar.t0, midi, dur: bar.dur * 1.02, vel: 0.16 + 0.6 * v, pan: 0, burned: v, fixed: true, legato: true });
    if (v > 0.5) out.push({ inst: "contrabass", t: bar.t0, midi: midi + 12, dur: bar.dur * 0.9, vel: 0.2 + 0.4 * (v - 0.5), pan: 0, burned: v, echo: true });
  },
};

// «Де більше»: найактивніша зона — окремий солюючий голос; панорама = її горизонтальне положення.
export const hotZone = {
  id: "hotZone", upload: true,
  label: "Соліст «де більше»",
  role: "Найактивніша зона карти — окремий голос: панорама = її положення (захід — ліве вухо, схід — праве), висота = значення в цій зоні",
  active: (o, ctx) => !!ctx.bar.params.hot && ctx.bar.section !== "intro",
  render(ctx, out) {
    const { bar, meter, h, meta } = ctx, z = bar.params.hot, stepDur = bar.dur / meter.steps;
    const at = meter.beats.length > 2 ? [meter.beats[1], meter.beats[meter.beats.length - 1]] : [meter.beats[1] ?? Math.floor(meter.steps / 2)];
    const midi = snapToMode(60 + Math.round(14 * z.value), h.root, h.mode), triad = chordPcs(h, { max: 3 });
    at.forEach((s, k) => out.push({ inst: meta.hotInst || "clarinet", t: bar.t0 + s * stepDur, midi: k ? nearest(triad[0], midi, 55, 79) : midi, dur: stepDur * 2.6, vel: 0.42 + 0.3 * z.strength, pan: -0.9 + 1.8 * z.col / 15, zone: z.col, hot: true }));
  },
};

export const UPLOAD_PARTS = [points, burned, hotZone];
