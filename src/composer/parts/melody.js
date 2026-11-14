// Головна мелодія (скрипка / флейта): сканує кадр зліва направо (contour з 16 колонок).
// Висота — дані колонки; ритм — мотив фрази (повторюється для впізнаваності);
// фраза 4 такти: мотив → повтор із варіацією (дані нового такту) → розвиток → каданс.
// Панорама: колонка кадру → захід ліворуч, схід праворуч. Суша / фон — паузи.
import { chordPcs, nearest } from "./common.js";
import { snapToMode } from "../theory.js";

/** Ритм такту: позиції 0..15 (шістнадцяті) за густотою. */
function rhythmFor(density, rng) {
  const sets = [
    [0, 4, 8, 12],                         // чверті
    [0, 4, 6, 8, 12, 14],                  // чверті з восьмими
    [0, 2, 4, 6, 8, 10, 12, 14],           // восьмі
    [0, 2, 3, 4, 6, 8, 10, 11, 12, 14],    // з шістнадцятими
  ];
  const i = Math.min(3, Math.floor(density * 4));
  const r = sets[i].slice();
  // трохи «дихання» у мотиві (seeded): прибрати одну слабку долю
  if (r.length > 4 && rng.chance(0.5)) r.splice(1 + rng.int(0, r.length - 3), 1);
  return r;
}

export default {
  id: "melody",
  label: "Мелодія",
  role: "Сканує кадр зліва направо: вище нота — більше значення (тепліше / світліше) в цій смузі; суша — пауза",
  active: (o, ctx) => o > 0.32 && ctx.bar.section !== "intro" || (ctx.bar.section === "intro" && ctx.meta.still),
  render(ctx, out) {
    const { bar, h, rng, state, meta, b } = ctx;
    const p = bar.params, phrase = meta.phrase;
    const posInPhrase = b % phrase;
    const contour = p.contour;
    const lo = 64 + Math.round(p.register * 8), span = 14;     // ~ півтори октави
    const stepDur = bar.dur / 16;
    const chordSet = new Set(chordPcs(h, { max: 4 }));

    // мотив фрази: ритм першого такту фрази повторюється
    if (posInPhrase === 0 || !state.rhythm) state.rhythm = rhythmFor(p.density, rng);
    let rhythm = state.rhythm;
    const cadence = posInPhrase === phrase - 1;
    if (cadence) rhythm = rhythm.filter(s => s < 8).slice(0, 3).concat([8]);   // каданс: коротко → довга нота

    // повернення мотиву (returnOfState / цикл): та сама мелодія, що й на початку теми
    if (bar.motifReturn && state.firstMotif) {
      for (const n of state.firstMotif) out.push({ ...n, t: bar.t0 + n.rel * bar.dur, dur: n.relDur * bar.dur, vel: n.vel * (0.6 + 0.5 * p.energy), motif: true });
      return;
    }

    const notes = [];
    let prev = state.last ?? lo + span / 2;
    rhythm.forEach((s, k) => {
      const col = s;                                   // крок = колонка кадру
      const v = contour[col];
      if (v === null) return;                          // суша / фон — пауза
      let midi = Math.round(lo + v * span);
      midi = snapToMode(midi, h.root, h.mode);
      // сильні долі — звук акорду (консонанс)
      if (s % 8 === 0 || (cadence && k === rhythm.length - 1)) {
        let best = midi, bd = 99;
        for (const pc of chordSet) { const m = nearest(pc, midi, lo - 3, lo + span + 3); if (Math.abs(m - midi) < bd) { bd = Math.abs(m - midi); best = m; } }
        midi = best;
      }
      // без стрибків понад сексту
      while (midi - prev > 9) midi -= 12;
      while (prev - midi > 9) midi += 12;
      prev = midi;
      const next = rhythm[k + 1] ?? 16;
      const gap = (next - s) * stepDur;
      const legato = p.articulation < 0.45;
      const dur = cadence && k === rhythm.length - 1 ? bar.dur * 0.48 : gap * (legato ? 1.0 : 0.5);
      const cover = p.contourCover?.[col] ?? 0.5;
      notes.push({
        t: bar.t0 + s * stepDur, midi, dur, legato,
        vel: (0.45 + 0.4 * p.energy) * (0.75 + 0.4 * Math.min(1, cover * 2)) * (s % 4 === 0 ? 1 : 0.85),
        pan: -0.7 + 1.4 * col / 15, offbeat: s % 4 === 2,
      });
    });
    state.last = prev;
    if (!state.firstMotif && notes.length >= 3 && bar.section !== "intro")
      state.firstMotif = notes.map(n => ({ ...n, rel: (n.t - bar.t0) / bar.dur, relDur: n.dur / bar.dur }));
    out.push(...notes);
  },
};
