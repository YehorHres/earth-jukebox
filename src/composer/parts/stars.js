// «Вогники» нічної карти (v6 — «дзинь-дзелень»): короткі дзвінкі ноти в пентатоніці ладу.
// Кількість нот за такт = кількість вогнів (lights = світлові точки, відн.): більше вогнів → помітно густіший «дощ» нот;
// панорама й момент кожної ноти — горизонтальна позиція вогню (колонка кадру). Темрява — тиша.
// Великі кластери (агломерації) → акорд-дзвін; вогнів стало більше → нова яскрава нота-«іскра».
import { chordPcs, nearest } from "./common.js";

/** Скільки нот-вогників у такті для частки вогнів 0..1 (0 — темрява). */
export const starCount = (lights, dark) => (dark || lights < 0.03 ? 0 : Math.round(1 + 15 * lights));
const TIMBRES = ["xylophone", "celesta", "glockenspiel"];

/** Пентатоніка ладу: мажорна (1 2 3 5 6) для ладів із великою терцією, мінорна (1 3 4 5 7) — з малою. */
export function pentatonic(h) {
  const st = h.mode.steps, major = st[2] === 4;
  return (major ? [0, 1, 2, 4, 5] : [0, 2, 3, 4, 6]).map(i => (h.root + st[i]) % 12);
}

export default {
  id: "stars",
  label: "Вогники",
  role: "Нічні вогні: кількість коротких дзвінких нот за такт = кількість світлових точок; стерео — де саме світло; кластер міст — акорд-дзвін",
  // лише якщо тема вмикає цю партію (nightlights)
  active: (o, ctx) => ctx.grammar || o > 0.2,
  render(ctx, out) {
    const { bar, h, rng, meter, state } = ctx;
    const p = bar.params;
    const lit = p.contour.map((v, c) => ({ v, c })).filter(x => x.v !== null);
    const lights = p.lights ?? p.density ?? 0, prev = state.lights;
    state.lights = lights;
    const n = ctx.grammar ? starCount(lights, p.dark) : Math.round(2 + p.density * 10);
    if (!lit.length || !n) return;
    const pcs = ctx.grammar ? pentatonic(h) : chordPcs(h, { max: 4 });
    const stepDur = bar.dur / meter.steps, tot = lit.reduce((s, x) => s + 0.1 + x.v, 0);
    for (let k = 0; k < n; k++) {
      // колонка зважено за кількістю світла
      let r = rng() * tot, pick = lit[0];
      for (const x of lit) { r -= 0.1 + x.v; if (r <= 0) { pick = x; break; } }
      const step = Math.min(meter.steps - 1, Math.floor((pick.c + rng()) / 16 * meter.steps));
      out.push({ inst: ctx.grammar ? TIMBRES[k % 3] : undefined, t: bar.t0 + step * stepDur, midi: nearest(pcs[rng.int(0, pcs.length - 1)], 84 + Math.round(pick.v * 10), 76, 100),
        dur: 0.25, vel: (0.22 + 0.4 * pick.v) * (bar.section === "intro" ? 0.35 : 1), pan: -0.85 + 1.7 * pick.c / 15, col: pick.c });
    }
    if (!ctx.grammar) return;
    // агломерація — акорд-дзвін на початку такту (панорама — найяскравіша колонка)
    const top = lit.reduce((q, x) => (x.v > q.v ? x : q), lit[0]);
    if ((p.clusters ?? 0) > 0.6) for (const pc of chordPcs(h, { max: 3 }))
      out.push({ inst: "bells", t: bar.t0, midi: nearest(pc, 76, 67, 88), dur: 1.6, vel: 0.3 + 0.2 * p.clusters, pan: -0.85 + 1.7 * top.c / 15, chord: true });
    // вогнів стало помітно більше — «іскра»: нова висока нота
    if (prev !== undefined && lights - prev > 0.1)
      out.push({ inst: "glockenspiel", t: bar.t0 + Math.floor(meter.steps / 2) * stepDur, midi: nearest(pcs[0], 98, 91, 103), dur: 0.3, vel: 0.6, pan: -0.85 + 1.7 * top.c / 15, spark: true });
  },
};
