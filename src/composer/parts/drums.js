// Ударні — перкусія емоцій (етап 16): вступають за даними, а не «тримають сітку».
// Рух у даних (енергія + густота змін): спокій → тиша; помірно → м'які щітки на опорних долях;
// ріст → половинний розмір → малюнок під розмір (4/4, 3/4, 6/8, 5/4 — свої акценти) → подвійний (восьмі), без шістнадцятих.
// Події: у такті з подією — брейк (ударні замовкають, звучить ерікон), перед подією — наростання.
// Характер — від теми: steady, flowing, pastoral, driving, storm (литаври), slow / sparse (лише щітки), rain / none (без ударних).
// Литаври — на переходах розділів і на початку кульмінації.

/**
 * Рівень ударних за даними (v6): 0 — тиша, 1 — щітки, 2 — половинний розмір (half-time),
 * 3 — звичайний малюнок, 4 — подвійний (double-time). Рух = відносна енергія (drive) + густота змін.
 */
export function drumLevel(p, rhythm) {
  // v10 (завантажені відео): рівень ударних — лише від «кількості» даних (активний вогонь, точки), без руху в кадрі
  const x = p.quantity !== undefined ? p.quantity : 0.65 * (p.drive ?? p.energy ?? 0) + 0.35 * (p.density ?? 0);
  const lvl = x < 0.3 ? 0 : x < 0.42 ? 1 : x < 0.56 ? 2 : x < 0.72 ? 3 : 4;
  return rhythm === "sparse" ? Math.min(1, lvl) : rhythm === "slow" ? Math.min(2, lvl) : lvl;
}

export default {
  id: "drums",
  label: "Ударні",
  role: "Перкусія за даними: спокій — тиша або щітки; ріст — половинний → звичайний → подвійний розмір; на піках — литаври, тарілки, брас-удари; на події — пауза",
  active: (o, ctx) => !["none"].includes(ctx.profile.rhythm),
  render(ctx, out) {
    const { bar, o, meter, profile, bars, b } = ctx;
    const p = bar.params, r = profile.rhythm;
    const n = meter.steps, step = bar.dur / n;
    const q = p.quantity, drv = q ?? p.drive ?? p.energy;      // v10: у завантажених відео сила ударів — від «кількості» даних
    const e = 0.5 + 0.7 * drv;
    const evNow = bar.events.length > 0, evNext = (bars[b + 1]?.events.length || 0) > 0;
    // брейк: від моменту події до кінця такту ударні мовчать
    const until = evNow && !ctx.meta.quantity ? Math.min(...bar.events.map(x => x.offset)) * n : n;      // v10: у завантажених відео знак події короткий — ударні не замовкають
    const hit = (inst, s, vel, extra) => { if (s < until) out.push({ inst, t: bar.t0 + s * step, midi: inst === "timpani" ? 41 : 0, dur: inst === "kick" ? 0.3 : inst === "snare" ? 0.15 : inst === "timpani" ? 0.3 : 0.06, vel: Math.min(1, vel), ...extra }); };
    let level = r === "rain" || bar.section === "intro" || (q === undefined && o <= 0.35) ? 0 : drumLevel(p, r);
    // кульмінація — повний склад: ударні принаймні в половинному розмірі (щітки — для «рідких» тем)
    if (ctx.grammar && bar.section === "climax" && r !== "rain" && q === undefined) level = Math.max(level, r === "sparse" ? 1 : 2);
    const hard = r === "driving" || r === "storm";
    const mid = meter.strong[1] ?? meter.beats[Math.ceil(meter.beats.length / 2)] ?? meter.beats[1];
    const tpRoot = 41 + ((ctx.h.root + ctx.h.chords[0].chord.root) % 12) % 7;   // F2..B2

    if (level === 1) {
      // м'які щітки: лише опорні долі розміру
      if (r === "slow") hit("kick", 0, 0.22 + 0.2 * drv, { brush: true });
      else meter.strong.forEach((s, k) => hit("shaker", s, (k ? 0.13 : 0.17) * e, { brush: true }));
    } else if (level === 2) {
      // половинний розмір: бас-барабан на «раз», один удар посеред такту
      hit("kick", 0, 0.3 + 0.3 * drv);
      if (mid !== undefined) hit(hard ? "snare" : "shaker", mid, hard ? 0.24 * e : 0.26 * e);
      if (r === "storm") hit("timpani", meter.beats[meter.beats.length - 1], 0.15 + 0.2 * p.density, { fixed: true });
    } else if (level >= 3) {
      const dbl = level === 4;
      const weak = meter.beats.filter(s => !meter.strong.includes(s));
      hit("kick", meter.strong[0], 0.35 + 0.4 * drv);
      // друга опора розміру (4/4 — 3-тя доля, 6/8 — 4-та восьма, 5/4 — початок групи «+2»)
      if (meter.strong[1] !== undefined) hit(hard || dbl ? "kick" : "shaker", meter.strong[1], hard || dbl ? 0.3 + 0.3 * drv : 0.3 * e);
      // слабкі долі: 3/4 — «ум-па-па», 4/4 — 2 і 4, 5/4 — 2, 3 і 5
      weak.forEach((s, k) => {
        if (r === "storm") { hit("timpani", s, 0.15 + 0.25 * p.density, { fixed: true }); hit("snare", s, 0.22 * e); }
        else if (r === "driving" || dbl) hit("snare", s, 0.25 * e);
        else if (meter.id !== "4/4" || k % 2 === 1 || p.density > 0.6) hit("shaker", s, 0.2 * e);
      });
      // 6/8: легка третя восьма кожної групи — «гойдання»
      if (meter.id === "6/8" && (dbl || p.density > 0.5)) for (const s of [4, 10]) hit("shaker", s, 0.14 * e, { offbeat: true });
      // подвійний розмір: восьмі між долями (без шістнадцятих) і бас-барабан на кожну долю
      if (dbl) {
        for (let s = 2; s < n; s += 4) hit(hard ? "snare" : "shaker", s, (hard ? 0.14 : 0.16) * e, { offbeat: true });
        for (const s of weak) hit("kick", s, 0.22 + 0.25 * drv);
        // пік: тарілка й литаври на «раз»; шторм — ще й брас-удар (тромбони) на опорні долі
        if (ctx.grammar && until > 0) {
          out.push({ inst: "cymbal", t: bar.t0, midi: 0, dur: 1.6, vel: 0.35 + 0.3 * drv, fixed: true, peak: true }, { inst: "timpani", t: bar.t0, midi: tpRoot, dur: 0.8, vel: 0.45 + 0.35 * drv, fixed: true, peak: true });
          if (r === "storm") for (const s of meter.strong) if (s < until) out.push({ inst: "trombone", t: bar.t0 + s * step, midi: tpRoot + 12, dur: step * 3, vel: 0.5 + 0.3 * drv, fixed: true, legato: false, stab: true });
        }
      }
    }

    // наростання перед подією наступного такту (якщо там не перехід розділу — його веде тремоло литавр)
    if (evNext && !bar.transition && bar.section !== "intro" && r !== "rain" && o > 0.35 && !evNow) {
      const inst = r === "driving" || r === "storm" ? "snare" : "shaker";
      for (let k = 0; k < 4; k++) hit(inst, n - 8 + 2 * k, (0.1 + 0.09 * k) * e, { build: true });
    }

    // литаври: тремоло-крещендо перед новим розділом, удар на початку кульмінації
    const beat = ctx.beat;
    if (bar.transition) {
      const k = 10, startT = bar.t0 + bar.dur - 2 * beat;
      for (let i = 0; i < k; i++) out.push({ inst: "timpani", t: startT + i * (2 * beat / k), midi: tpRoot, dur: 0.4, vel: 0.15 + 0.5 * (i / k), fixed: true });
    }
    if (bar.sectionStart && bar.section === "climax") out.push({ inst: "timpani", t: bar.t0, midi: tpRoot, dur: 1.2, vel: 0.85, fixed: true }, { inst: "cymbal", t: bar.t0, midi: 0, dur: 2, vel: 0.7, fixed: true });
  },
};
