// Контрмелодія (валторна / віолончель / глокеншпіль): відповідає мелодії (питання–відповідь).
// Ведучі тони акорду (терція, септима), протилежний рух; звучить лише в наростанні й кульмінації.
import { chordPcs, nearest } from "./common.js";

export default {
  id: "counter",
  label: "Контрмелодія",
  role: "Відповідає мелодії в парних тактах фрази; ведучі тони гармонії; лише в наростанні й кульмінації",
  active: (o, ctx) => o > 0.6 && ["build", "climax"].includes(ctx.bar.section),
  render(ctx, out) {
    const { bar, h, nextH, state, b, meta } = ctx;
    const p = bar.params;
    const answer = b % 2 === 1 || bar.section === "climax";      // відповідь — у парних тактах фрази
    if (!answer) return;
    const pcs = chordPcs(h, { max: 4 });
    const guide = pcs.slice(1);                                    // терція, квінта, септима
    const target = state.last ?? 57;
    const pick = (cands, near) => cands.map(pc => nearest(pc, near, 48, 67)).sort((x, y) => Math.abs(x - near) - Math.abs(y - near))[0];
    const n1 = pick(guide, target);
    const beat = bar.dur / 4;
    const vel = 0.3 + 0.4 * p.energy;
    out.push({ t: bar.t0 + (bar.section === "climax" ? 0 : beat), midi: n1, dur: beat * (bar.section === "climax" ? 2 : 1.6), vel, pan: -0.35, legato: true });
    // друга нота — назустріч наступному акорду (протилежно до руху мелодії вгору — вниз)
    const nn = nextH ? pick(chordPcs(nextH, { max: 4 }).slice(1), n1 + (p.motion > 0.5 ? -2 : 1)) : n1;
    out.push({ t: bar.t0 + 2.5 * beat, midi: nn, dur: beat * 1.4, vel: vel * 0.9, pan: -0.35, legato: true });
    state.last = nn;
    if (meta.still) state.last = n1;
  },
};
