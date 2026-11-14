// Ударні — перкусія емоцій (етап 16): вступають за даними, а не «тримають сітку».
// Рух у даних (енергія + густота змін): спокій → тиша; помірно → м'які щітки на опорних долях;
// активно → малюнок під розмір (4/4, 3/4, 6/8, 5/4 — свої акценти), без постійних шістнадцятих.
// Події: у такті з подією — брейк (ударні замовкають, звучить ерікон), перед подією — наростання.
// Характер — від теми: steady, flowing, pastoral, driving, storm (литаври), slow / sparse (лише щітки), rain / none (без ударних).
// Литаври — на переходах розділів і на початку кульмінації.

/** Рівень ударних за даними: 0 — тиша, 1 — щітки, 2 — малюнок. */
export function drumLevel(p, rhythm) {
  const drive = 0.5 * (p.energy ?? 0) + 0.5 * (p.density ?? 0);
  const lvl = drive < 0.4 ? 0 : drive < 0.55 ? 1 : 2;
  return rhythm === "slow" || rhythm === "sparse" ? Math.min(1, lvl) : lvl;
}

export default {
  id: "drums",
  label: "Ударні",
  role: "Перкусія за даними: спокій — тиша або м'які щітки, рух — малюнок під розмір; перед подією — наростання, на події — пауза; литаври — на переходах",
  active: (o, ctx) => !["none"].includes(ctx.profile.rhythm),
  render(ctx, out) {
    const { bar, o, meter, profile, bars, b } = ctx;
    const p = bar.params, r = profile.rhythm;
    const n = meter.steps, step = bar.dur / n;
    const e = 0.6 + 0.6 * p.energy;
    const evNow = bar.events.length > 0, evNext = (bars[b + 1]?.events.length || 0) > 0;
    // брейк: від моменту події до кінця такту ударні мовчать
    const until = evNow ? Math.min(...bar.events.map(x => x.offset)) * n : n;
    const hit = (inst, s, vel, extra) => { if (s < until) out.push({ inst, t: bar.t0 + s * step, midi: inst === "timpani" ? 41 : 0, dur: inst === "kick" ? 0.3 : inst === "snare" ? 0.15 : inst === "timpani" ? 0.3 : 0.06, vel: Math.min(1, vel), ...extra }); };
    const level = r === "rain" || bar.section === "intro" || o <= 0.35 ? 0 : drumLevel(p, r);

    if (level === 1) {
      // м'які щітки: лише опорні долі розміру
      if (r === "slow") hit("kick", 0, 0.22 + 0.2 * p.energy, { brush: true });
      else meter.strong.forEach((s, k) => hit("shaker", s, (k ? 0.13 : 0.17) * e, { brush: true }));
    } else if (level === 2) {
      const hard = r === "driving" || r === "storm";
      const weak = meter.beats.filter(s => !meter.strong.includes(s));
      hit("kick", meter.strong[0], 0.35 + 0.4 * p.energy);
      // друга опора розміру (4/4 — 3-тя доля, 6/8 — 4-та восьма, 5/4 — початок групи «+2»)
      if (meter.strong[1] !== undefined) hit(hard ? "kick" : "shaker", meter.strong[1], hard ? 0.3 + 0.3 * p.energy : 0.3 * e);
      // слабкі долі: 3/4 — «ум-па-па», 4/4 — 2 і 4, 5/4 — 2, 3 і 5
      weak.forEach((s, k) => {
        if (r === "storm") hit("timpani", s, 0.15 + 0.25 * p.density, { fixed: true });
        else if (r === "driving") hit("snare", s, 0.25 * e);
        else if (meter.id !== "4/4" || k % 2 === 1 || p.density > 0.6) hit("shaker", s, 0.2 * e);
      });
      // 6/8: легка третя восьма кожної групи — «гойдання»
      if (meter.id === "6/8" && p.density > 0.5) for (const s of [4, 10]) hit("shaker", s, 0.14 * e, { offbeat: true });
      // восьмі — лише коли дані справді швидкі й тема це дозволяє
      if (hard && p.density > 0.75) for (let s = 2; s < n; s += 4) hit("shaker", s, 0.13 * e, { offbeat: true });
    }

    // наростання перед подією наступного такту (якщо там не перехід розділу — його веде тремоло литавр)
    if (evNext && !bar.transition && bar.section !== "intro" && r !== "rain" && o > 0.35 && !evNow) {
      const inst = r === "driving" || r === "storm" ? "snare" : "shaker";
      for (let k = 0; k < 4; k++) hit(inst, n - 8 + 2 * k, (0.1 + 0.09 * k) * e, { build: true });
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
