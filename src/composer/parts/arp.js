// Арпеджіо: дрібність (чверті → восьмі → шістнадцяті) = густота змін; працює в будь-якому розмірі.
// Для «вихрових» тем (течії) при великій рухливості — кружляюча фігура (вгору-вниз).
import { chordPcs, nearest } from "./common.js";

export default {
  id: "arp",
  label: "Арпеджіо",
  role: "Дрібність (чверті → восьмі → шістнадцяті) = швидкість змін; рух даних — «хвиля» вгору-вниз",
  // у вступі — лише в другій половині (вступ = 2 партії: педи й бас)
  active: (o, ctx) => o > 0.3 && (ctx.bar.section !== "intro" || ctx.bar.sectionPos >= 0.5),
  render(ctx, out) {
    const { bar, h, rng, meter, profile } = ctx;
    const p = bar.params;
    // кроків у такті: чверті / восьмі / шістнадцяті
    const div = p.density < 0.33 ? 4 : p.density < 0.66 ? 2 : 1;
    const steps = Math.max(1, Math.round(meter.steps / div));
    const stepDur = bar.dur / steps;
    // рідкісний характер (лід, аерозолі): лише кожна друга нота
    const sparse = profile.rhythm === "sparse";
    const base = 60 + Math.round(p.register * 10);
    const pcs = chordPcs(h, { max: 4 });
    const tones = [];
    for (let o = 0; o < 2; o++) for (const pc of pcs) tones.push(nearest(pc, base + 12 * o + 2, base - 2, base + 26));
    const uniq = [...new Set(tones.sort((a, b) => a - b))];
    const pattern = p.motion > 0.45 ? [...uniq, ...uniq.slice(1, -1).reverse()] : uniq;
    const len = stepDur * (1.7 - 1.3 * p.articulation);   // легато ↔ стакато
    const vel = 0.25 + 0.4 * p.energy;
    const pan = p.pan * 0.7;
    const offset = rng.int(0, 1);
    const beatEvery = Math.max(1, Math.round(4 / div));
    for (let s = 0; s < steps; s++) {
      if (sparse && s % 2 === 1) continue;
      if (div === 1 && p.density < 0.8 && s % 4 === 3 && rng.chance(0.4)) continue;   // «дихання»
      out.push({
        t: bar.t0 + s * stepDur, midi: pattern[(s + offset) % pattern.length], dur: len,
        vel: vel * (s % beatEvery === 0 ? 1 : 0.75), pan: pan + (s % 2 ? 0.12 : -0.12), offbeat: s % 2 === 1,
      });
    }
  },
};
