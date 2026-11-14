// Акценти подій: дзвони / челеста на піках, брас-стаб на перетині рекордного рівня,
// литаври на зміні режиму, повернення мотиву — челеста; свел перед новим розділом.
import { chordPcs, nearest } from "./common.js";

export default {
  id: "accents",
  label: "Акценти подій",
  role: "Піки й рекорди — дзвони, перетин рекордного рівня — брас, зміна режиму — литаври, свел перед розділом",
  active: (o, ctx) => ctx.bar.events.length > 0 || (ctx.bar.transition && ["build", "climax"].includes(ctx.bars[ctx.b + 1]?.section)),
  render(ctx, out) {
    const { bar, h, scene, rng } = ctx;
    const pcs = chordPcs(h, { max: 3 });
    const bell = scene === "nightlights" ? "celesta" : "bells";
    for (const e of bar.events) {
      const t = bar.t0 + Math.min(0.95, e.offset) * bar.dur;
      const v = 0.35 + 0.5 * e.strength;
      const pan = e.feature?.startsWith("hotspot") ? 0.3 : 0;
      switch (e.type) {
        case "globalMax":
          pcs.forEach((pc, k) => out.push({ inst: bell, t: t + k * 0.06, midi: nearest(pc, 79 + k * 4, 72, 96), dur: 2.5, vel: v, pan: -0.3 + 0.3 * k, fixed: true }));
          break;
        case "peak":
          out.push({ inst: bell, t, midi: nearest(pcs[rng.int(0, pcs.length - 1)], 81, 74, 93), dur: 1.8, vel: v, pan });
          break;
        case "trough":
          out.push({ inst: bell, t, midi: nearest(pcs[0], 62, 55, 70), dur: 2, vel: v * 0.7, pan });
          break;
        case "thresholdCross":
          if (e.dir === "up") pcs.forEach(pc => out.push({ inst: scene === "nightlights" ? "celesta" : "brass", t, midi: nearest(pc, 64, 55, 76), dur: 0.35, vel: v * 0.9, pan, fixed: true }));
          else out.push({ inst: "horn", t, midi: nearest(pcs[0], 50, 43, 57), dur: 1.2, vel: v * 0.8, pan });
          break;
        case "changePoint":
          out.push({ inst: "timpani", t, midi: 41 + (h.root + h.chords[0].chord.root) % 7, dur: 1, vel: v, fixed: true });
          break;
        case "returnOfState":
          pcs.forEach((pc, k) => out.push({ inst: "celesta", t: t + k * 0.12, midi: nearest(pc, 84, 76, 96), dur: 0.8, vel: v * 0.7, pan: 0.2 }));
          break;
      }
    }
    // свел (наростання шуму, як тарілка) перед наростанням / кульмінацією
    if (bar.transition && ["build", "climax"].includes(ctx.bars[ctx.b + 1]?.section))
      out.push({ inst: "swell", t: bar.t0 + bar.dur / 2, midi: 0, dur: bar.dur / 2, vel: 0.5 + 0.3 * bar.params.energy, fixed: true });
  },
};
