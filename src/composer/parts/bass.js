// Бас: тоніка й квінта акорду; рух до наступного акорду — за трендом/рухливістю даних.
import { chordRootPc, nearest } from "./common.js";

export default {
  id: "bass",
  label: "Бас",
  role: "Полярні пояси й загальний рівень: тоніка/квінта, рух за трендом",
  active: o => o > 0.15,
  render(ctx, out) {
    const { bar, h, nextH, beat, state, scene } = ctx;
    const p = bar.params;
    const rootPc = chordRootPc(h);
    const root = nearest(rootPc, state.last ?? 40, 33, 50);
    state.last = root;
    const vel = 0.45 + 0.4 * p.energy;
    if (scene === "nightlights") {
      // дрон: одна довга нота на такт, легато
      out.push({ t: bar.t0, midi: root - 12 >= 24 ? root - 12 : root, dur: bar.dur * 1.05, vel: 0.35 + 0.2 * p.energy });
      return;
    }
    const pizz = beat * (0.55 + 0.6 * (1 - p.articulation));
    out.push({ t: bar.t0, midi: root, dur: p.density < 0.3 ? beat * 1.8 : pizz, vel });
    if (p.density >= 0.3) out.push({ t: bar.t0 + 2 * beat, midi: root + 7 <= 52 ? root + 7 : root - 5, dur: pizz, vel: vel * 0.85 });
    // наближення до наступного кореня (прохідна нота на 4-ту долю), коли дані рухаються
    if (nextH && p.motion > 0.45) {
      const next = nearest(chordRootPc(nextH), root, 33, 52);
      if (next !== root) out.push({ t: bar.t0 + 3 * beat + beat * 0.5, midi: next + (next > root ? -1 : 1), dur: beat * 0.45, vel: vel * 0.7, offbeat: true });
    }
  },
};
