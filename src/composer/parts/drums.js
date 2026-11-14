// Ударні: ритмічний характер — від теми, густота — від даних, литаври — на переходах і кульмінації.
// Характери: steady (рівний), slow (повільний, важкий), sparse (рідкий), driving (наполегливий),
// storm (шторм: гуркіт і литаври), pastoral (6/8, легкий), flowing (хвилями), rain / none (без ударних).
import { euclid } from "./common.js";

export default {
  id: "drums",
  label: "Ударні",
  role: "Ритм за густотою змін (характер — від теми); литаври — на переходах і кульмінації",
  active: (o, ctx) => ctx.profile.rhythm !== "none" && (o > 0.5 || ctx.bar.transition || ctx.bar.section === "climax"),
  render(ctx, out) {
    const { bar, o, meter, profile } = ctx;
    const p = bar.params, r = profile.rhythm;
    const n = meter.steps, step = bar.dur / n;
    const at = s => bar.t0 + s * step;
    const full = o > 0.5;
    const e = 0.6 + 0.6 * p.energy;
    if (full && r !== "rain") {
      if (r === "steady" || r === "flowing" || r === "driving" || r === "pastoral") {
        // шейкер: евклідів ритм, к-сть ударів = густота (для 6/8 — групи по 3 восьмі)
        const k = r === "driving" ? Math.round(n * (0.4 + 0.5 * p.density)) : r === "pastoral" ? Math.round(n / 2 * (0.4 + 0.6 * p.density)) : Math.max(2, Math.round(2 + p.density * (n * 0.6)));
        const hits = euclid(Math.max(2, Math.min(n, k)), n);
        for (let s = 0; s < n; s++) if (hits[s]) out.push({ inst: "shaker", t: at(s), midi: 0, dur: 0.06, vel: (meter.beats.includes(s) ? 0.32 : 0.2) * e, offbeat: s % 2 === 1 });
      }
      if (r === "steady" || r === "driving" || r === "flowing") {
        if (p.energy > 0.45) out.push({ inst: "kick", t: bar.t0, midi: 0, dur: 0.3, vel: 0.35 + 0.4 * p.energy });
        if (meter.strong[1] && p.energy > (r === "driving" ? 0.4 : 0.7)) out.push({ inst: "kick", t: at(meter.strong[1]), midi: 0, dur: 0.3, vel: 0.3 + 0.3 * p.energy });
      }
      if (r === "driving") {
        // «малий барабан» на слабких долях (2 і 4 / 3+2)
        meter.beats.filter(b => !meter.strong.includes(b)).forEach((b, k) => { if (k % 2 === 0 || p.density > 0.6) out.push({ inst: "snare", t: at(b), midi: 0, dur: 0.15, vel: 0.25 * e }); });
      }
      if (r === "slow" && p.energy > 0.5) out.push({ inst: "kick", t: bar.t0, midi: 0, dur: 0.5, vel: 0.3 + 0.3 * p.energy });
      if (r === "storm") {
        // шторм: гуркіт на сильних долях, тремоло литавр при високій щільності
        out.push({ inst: "kick", t: bar.t0, midi: 0, dur: 0.6, vel: 0.4 + 0.4 * p.energy });
        if (p.density > 0.5) for (let k = 0; k < 8; k++) out.push({ inst: "timpani", t: at(Math.floor(k * n / 8)), midi: 41, dur: 0.3, vel: 0.12 + 0.2 * p.density, fixed: true });
      }
      if (r === "sparse" && p.energy > 0.6) out.push({ inst: "shaker", t: at(meter.beats[meter.beats.length - 1]), midi: 0, dur: 0.06, vel: 0.15 });
    }
    // литаври: тремоло-крещендо перед новим розділом, удар на початку кульмінації
    const tpRoot = 41 + ((ctx.h.root + ctx.h.chords[0].chord.root) % 12) % 7;   // F2..B2
    const beat = ctx.beat;
    if (bar.transition) {
      const k = 10, startT = bar.t0 + bar.dur - 2 * beat;
      for (let i = 0; i < k; i++) out.push({ inst: "timpani", t: startT + i * (2 * beat / k), midi: tpRoot, dur: 0.4, vel: 0.15 + 0.5 * (i / k), fixed: true });
    }
    if (bar.sectionStart && bar.section === "climax") out.push({ inst: "timpani", t: bar.t0, midi: tpRoot, dur: 1.2, vel: 0.85, fixed: true }, { inst: "cymbal", t: bar.t0, midi: 0, dur: 2, vel: 0.7, fixed: true });
  },
};
