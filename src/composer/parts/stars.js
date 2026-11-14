// «Зоряний дощ» для нічних карт: короткі дзвінкі ноти, к-сть = густота світлових точок;
// місце в стерео — колонки, де є світло (contour).
import { chordPcs, nearest } from "./common.js";

export default {
  id: "stars",
  label: "Зоряний дощ",
  role: "Нічні вогні: к-сть коротких нот = к-сть світлових точок; стерео — де саме світло",
  active: o => o > 0.2,   // лише якщо тема вмикає цю партію (nightlights)
  render(ctx, out) {
    const { bar, h, rng } = ctx;
    const p = bar.params;
    const lit = p.contour.map((v, c) => ({ v, c })).filter(x => x.v !== null);
    if (!lit.length) return;
    const n = Math.round(2 + p.density * 10);
    const pcs = chordPcs(h, { max: 4 });
    for (let k = 0; k < n; k++) {
      // колонка зважено за кількістю світла
      const tot = lit.reduce((s, x) => s + 0.1 + x.v, 0);
      let r = rng() * tot, pick = lit[0];
      for (const x of lit) { r -= 0.1 + x.v; if (r <= 0) { pick = x; break; } }
      const t = bar.t0 + (pick.c + rng()) / 16 * bar.dur;
      out.push({ t, midi: nearest(pcs[rng.int(0, pcs.length - 1)], 82 + Math.round(pick.v * 8), 74, 98), dur: 0.25, vel: 0.15 + 0.35 * pick.v, pan: -0.8 + 1.6 * pick.c / 15 });
    }
  },
};
