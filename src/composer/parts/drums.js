// Ударні: шейкер (ритм за густотою), м'який бас-барабан, литаври на переходах і кульмінації.
import { euclid } from "./common.js";

export default {
  id: "drums",
  label: "Ударні",
  role: "Ритм за густотою змін; литаври — на переходах і кульмінації",
  active: (o, ctx) => o > 0.5 || ctx.bar.transition || ctx.bar.section === "climax",
  render(ctx, out) {
    const { bar, beat, scene, o } = ctx;
    const p = bar.params;
    const full = o > 0.5;
    if (full) {
      // шейкер: евклідів ритм, кількість ударів = густота
      const n = 16, hits = euclid(Math.max(2, Math.round(2 + p.density * 10)), n);
      for (let s = 0; s < n; s++) if (hits[s]) out.push({ inst: "shaker", t: bar.t0 + s * bar.dur / n, midi: 0, dur: 0.06, vel: (s % 4 === 0 ? 0.32 : 0.2) * (0.6 + 0.6 * p.energy), offbeat: s % 2 === 1 });
      if (scene !== "nightlights") {
        if (p.energy > 0.45) out.push({ inst: "kick", t: bar.t0, midi: 0, dur: 0.3, vel: 0.35 + 0.4 * p.energy });
        if (p.energy > 0.7) out.push({ inst: "kick", t: bar.t0 + 2 * beat, midi: 0, dur: 0.3, vel: 0.3 + 0.3 * p.energy });
      }
    }
    // литаври: тремоло-крещендо перед новим розділом, удар на початку кульмінації
    const tpRoot = 41 + ((ctx.h.root + ctx.h.chords[0].chord.root) % 12) % 7;   // F2..B2
    if (bar.transition) {
      const n = 10;
      for (let k = 0; k < n; k++) out.push({ inst: "timpani", t: bar.t0 + 2 * beat + k * (2 * beat / n), midi: tpRoot, dur: 0.4, vel: 0.15 + 0.5 * (k / n), fixed: true });
    }
    if (bar.sectionStart && bar.section === "climax") out.push({ inst: "timpani", t: bar.t0, midi: tpRoot, dur: 1.2, vel: 0.85, fixed: true });
  },
};
