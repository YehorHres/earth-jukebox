// Бас: тоніка й квінта акорду на сильних долях розміру; рух до наступного акорду — за рухливістю даних.
// Тембр — від теми: тривалі (дрон, саб-бас, туба, фагот) грають довгими нотами, щипкові — піцикато.
import { chordRootPc, nearest } from "./common.js";

const SUSTAINED = new Set(["drone", "subbass", "tuba", "bassoon", "cello", "organ"]);

export default {
  id: "bass",
  label: "Бас",
  role: "Загальний рівень даних: тоніка/квінта на сильних долях, рух — за трендом",
  active: o => o > 0.15,
  render(ctx, out) {
    const { bar, h, nextH, beat, state, meter, instr } = ctx;
    const p = bar.params;
    const sixteenth = beat / 4;
    const rootPc = chordRootPc(h);
    const lo = instr.bass === "subbass" ? 26 : 33;
    const root = nearest(rootPc, state.last ?? 40, lo, lo + 17);
    state.last = root;
    const vel = 0.45 + 0.4 * p.energy;
    if (instr.bass === "drone" || instr.bass === "subbass") {
      // дрон / саб-бас: одна довга нота на такт, легато
      out.push({ t: bar.t0, midi: root - 12 >= 24 ? root - 12 : root, dur: bar.dur * 1.05, vel: 0.35 + 0.3 * p.energy, legato: true });
      return;
    }
    const sustained = SUSTAINED.has(instr.bass);
    const len = sustained ? beat * (1.6 + 1.2 * (1 - p.articulation)) : beat * (0.55 + 0.6 * (1 - p.articulation));
    const [s0, s1] = meter.strong;
    out.push({ t: bar.t0, midi: root, dur: p.density < 0.3 && !s1 ? bar.dur * 0.9 : len, vel, legato: sustained });
    if (s1 && p.density >= 0.3) out.push({ t: bar.t0 + s1 * sixteenth, midi: root + 7 <= lo + 19 ? root + 7 : root - 5, dur: len, vel: vel * 0.85, legato: sustained });
    // наближення до наступного кореня (прохідна нота перед тактом), коли дані рухаються
    if (nextH && p.motion > 0.45) {
      const next = nearest(chordRootPc(nextH), root, lo, lo + 19);
      if (next !== root) out.push({ t: bar.t0 + bar.dur - beat * 0.5, midi: next + (next > root ? -1 : 1), dur: beat * 0.45, vel: vel * 0.7, offbeat: true });
    }
  },
};
