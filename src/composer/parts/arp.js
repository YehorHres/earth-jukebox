// Арпеджіо (фортепіано / арфа / челеста): помірні широти; дрібність = густота змін.
import { chordPcs, nearest, stepsFor } from "./common.js";

export default {
  id: "arp",
  label: "Арпеджіо",
  role: "Помірні широти; дрібність (чверті → восьмі → шістнадцяті) = швидкість змін",
  // у вступі — лише в другій половині (вступ = 2 партії: педи й бас)
  active: (o, ctx) => o > 0.3 && (ctx.bar.section !== "intro" || ctx.bar.sectionPos >= 0.5),
  render(ctx, out) {
    const { bar, h, rng } = ctx;
    const p = bar.params;
    const steps = stepsFor(p.density);
    const stepDur = bar.dur / steps;
    const base = 60 + Math.round(p.register * 10);
    const pcs = chordPcs(h, { max: 4 });
    // ноти акорду у двох октавах
    const tones = [];
    for (let o = 0; o < 2; o++) for (const pc of pcs) tones.push(nearest(pc, base + 12 * o + 2, base - 2, base + 26));
    tones.sort((a, b) => a - b);
    const uniq = [...new Set(tones)];
    // візерунок: угору або угору-вниз (більше руху — «хвиля»)
    const pattern = p.motion > 0.45 ? [...uniq, ...uniq.slice(1, -1).reverse()] : uniq;
    const len = stepDur * (1.7 - 1.3 * p.articulation);   // легато ↔ стакато
    const vel = 0.25 + 0.4 * p.energy;
    const pan = p.pan * 0.7;
    const offset = rng.int(0, 1);
    for (let s = 0; s < steps; s++) {
      if (steps === 16 && p.density < 0.8 && s % 4 === 3 && rng.chance(0.4)) continue;   // «дихання»
      out.push({
        t: bar.t0 + s * stepDur, midi: pattern[(s + offset) % pattern.length], dur: len,
        vel: vel * (s % (steps / 4) === 0 ? 1 : 0.75), pan: pan + (s % 2 ? 0.12 : -0.12), offbeat: s % 2 === 1,
      });
    }
  },
};
