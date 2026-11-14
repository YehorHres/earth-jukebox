// Педи: струнна група легато, гармонічна «підкладка». Гучність — активна маса / енергія.
import { chordPcs, lead } from "./common.js";

export default {
  id: "pad",
  label: "Струнні (педи)",
  role: "Гармонічна підкладка; гучність — енергія та кількість даних на кадрі",
  active: () => true,
  render(ctx, out) {
    const { bar, h, state } = ctx;
    const p = bar.params;
    const pcs = chordPcs(h, { max: 5 });
    const voices = lead(pcs, state.prev, 50, 77);
    state.prev = voices;
    const vel = 0.14 + 0.32 * p.energy;
    voices.forEach((m, k) => out.push({
      t: bar.t0, midi: m, dur: bar.dur * 1.04, vel: vel / Math.sqrt(voices.length / 3),
      pan: (k / Math.max(1, voices.length - 1) - 0.5) * 0.6, legato: true, fixed: k > 0,
    }));
  },
};
