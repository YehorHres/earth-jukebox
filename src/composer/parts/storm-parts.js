// ISS-блискавки (pointStyle "lightning"): шари вступають за кількістю спалахів на видимому диску.
//   мало     — поодинокі сухі тріски (панорама = місце) + далекий грім із затримкою (партія points);
//   більше   — пед-акорди під спалахами, тремоло струнних, м'який пульс литавр (half-time);
//   багато   — мідні наростання й густий ритм литавр (чверті → восьмі, double-time).
// Гармонія: i–VI–III–VII у мінорі (такт = акорд); напруга росте з кількістю спалахів:
//   0 — тризвук, 1 — add9 (сусідня нота), 2 — sus4 + мала септима, 3 — зменшений vii°7 / кластер із b6.
// Кульмінація — там, де спалахів найбільше; коли їх меншає, шари знімаються й акорд очищується (розв'язка).
import { nearest } from "./common.js";
import { points } from "./upload-parts.js";

const PROG = [[0, 3, 7], [8, 0, 3], [3, 7, 10], [10, 2, 5]], NAMES = ["i", "VI", "III", "VII"];
export const STORM_THRESHOLDS = { stormPad: 0.1, stormTrem: 0.28, stormTimp: 0.42, stormBrass: 0.62 };
const c01 = v => Math.max(0, Math.min(1, v || 0));

/** Акорд такту: { pcs, root, tension 0..3, name }. */
export function stormChord(b, x, last, tonic = 2) {
  const k = last ? 0 : b % 4, tension = last ? 0 : x >= 0.78 ? 3 : x >= 0.55 ? 2 : x >= 0.3 ? 1 : 0;
  let pcs = PROG[k].slice(), name = NAMES[k];
  const root = pcs[0];
  if (tension === 1) { pcs.push((root + 2) % 12); name += "add9"; }
  else if (tension === 2) { pcs[1] = (root + 5) % 12; pcs.push((root + 10) % 12); name += "7sus4"; }
  else if (tension === 3) {
    if (k === 3) { pcs = [11, 2, 5, 8]; name = "vii°7"; }
    else { pcs.push((root + 2) % 12, (pcs[2] + 1) % 12); name += "add9(b6)"; }
  }
  return { pcs: pcs.map(p => (p + tonic) % 12), root: (pcs[0] + tonic) % 12, tension, name };
}

const mk = (id, label, role) => ({ id, label, role, storm: true, active: () => true, render() {} });
export const STORM_PARTS = [
  mk("stormPad", "Пед-акорди грози", "Блискавки: тихі акорди струнних під спалахами; прогресія i–VI–III–VII, напруга акорду росте з кількістю спалахів"),
  mk("stormTrem", "Тремоло струнних", "Блискавки: тремоло вступає, коли спалахів стає більше; що їх більше — то вище й яскравіше"),
  mk("stormTimp", "Литаври", "Блискавки: м'який пульс (half-time), при багатьох спалахах — густий ритм (double-time)"),
  mk("stormBrass", "Мідні", "Блискавки: мідні наростання лише там, де спалахів найбільше (кульмінація)"),
];

/** Один такт грози: додає ноти в notes, повертає { active, chord, x }. */
export function stormBar(ctx, state, notes) {
  const { bar, b, bars, rng } = ctx, p = bar.params, last = b === bars.length - 1;
  const x = c01(p.points ?? p.drive), T = STORM_THRESHOLDS, active = [];
  const tonic = ctx.tonic ?? 2, ch = stormChord(b, x, last, tonic), beat = bar.dur / 4, t0 = bar.t0, pan = (p.pan || 0) * 0.4;
  const push = (part, n) => notes.push({ part, pan, ...n });

  // 1. спалахи: тріски + грім (панорама = місце спалаху); ноти-відлуння піцикато — з акорду такту
  const pts = [];
  if (points.active(0, ctx)) points.render({ ...ctx, state: state.points }, pts);
  for (const n of pts) {
    if (n.inst === "pizz") n.midi = nearest(ch.pcs[rng.int(0, ch.pcs.length - 1)], 70 + Math.round(16 * x), 64, 93);
    if (n.thunder) n.vel *= 0.6 + 0.6 * x;
    push("points", n);
  }
  if (pts.length) active.push("points");

  // 2. пед-акорд під спалахами
  if (x >= T.stormPad) {
    active.push("stormPad");
    const vel = 0.14 + 0.4 * x, voices = Math.min(ch.pcs.length, 2 + Math.round(2.5 * x));
    push("stormPad", { inst: "strings", t: t0, midi: nearest(ch.root, 41, 36, 47), dur: bar.dur * 1.02, vel, legato: true });
    for (let i = 0; i < voices; i++) push("stormPad", { inst: "strings", t: t0, midi: nearest(ch.pcs[(i + 1) % ch.pcs.length], 53 + 4 * i + Math.round(8 * x), 48, 74), dur: bar.dur * 1.02, vel: vel * 0.85, legato: true, pan: -0.3 + 0.6 * i / Math.max(1, voices - 1) });
  }
  // 3. тремоло струнних: регістр росте з кількістю спалахів
  if (x >= T.stormTrem) {
    active.push("stormTrem");
    const top = 62 + Math.round(22 * x), k = x >= 0.6 ? 3 : 2;
    for (let i = 0; i < k; i++) push("stormTrem", { inst: "tremolo", t: t0, midi: nearest(ch.pcs[(i * 2 + (ch.tension ? ch.pcs.length - 1 : 0)) % ch.pcs.length], top - 5 * i, 57, 91), dur: bar.dur, vel: 0.16 + 0.42 * x, pan: 0.5 - 0.5 * i });
  }
  // 4. литаври: half-time → чверті → double-time
  if (x >= T.stormTimp) {
    active.push("stormTimp");
    const div = x >= 0.8 ? 8 : x >= 0.6 ? 4 : 2, lo = nearest(ch.root, 43, 38, 49), fifth = nearest(ch.pcs[Math.min(2, ch.pcs.length - 1)], 48, 43, 53);
    for (let i = 0; i < div; i++) {
      const strong = i % (div / 2) === 0;
      push("stormTimp", { inst: "timpani", t: t0 + i * bar.dur / div, midi: strong || i % 2 === 0 ? lo : fifth, dur: 0.6, vel: (strong ? 0.34 : 0.22) + 0.42 * x, pan: 0.1 });
    }
  }
  // 5. мідні наростання: голоси входять один за одним, кожен гучніший
  if (x >= T.stormBrass) {
    active.push("stormBrass");
    const base = 50 + Math.round(12 * x), n = Math.min(ch.pcs.length, x >= 0.8 ? 4 : 3);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * beat * (x >= 0.8 ? 0.5 : 1);
      push("stormBrass", { inst: i % 2 ? "horn" : "trombone", t, midi: nearest(ch.pcs[i % ch.pcs.length], base + 5 * i, 43, 77), dur: t0 + bar.dur - t, vel: 0.26 + 0.14 * i + 0.34 * x, pan: -0.25 + 0.2 * i });
    }
    if (x >= 0.85) push("stormBrass", { inst: "swell", t: t0 + 2 * beat, midi: 60, dur: 2 * beat, vel: 0.3 + 0.3 * x });
  }
  return { active, chord: ch, x };
}
