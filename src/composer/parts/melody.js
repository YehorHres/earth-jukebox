// Головна мелодія (скрипка / флейта): сканує кадр зліва направо (contour з 16 колонок).
// Висота — дані колонки; ритм — мотив фрази (повторюється для впізнаваності);
// фраза 4 такти: мотив → повтор із варіацією (дані нового такту) → розвиток → каданс.
// Панорама: колонка кадру → захід ліворуч, схід праворуч. Суша / фон — паузи.
import { chordPcs, nearest } from "./common.js";
import { snapToMode } from "../theory.js";
import { colOfStep } from "../meter.js";

/** Ритм такту: позиції кроків (шістнадцятих) за густотою — для будь-якого розміру. */
function rhythmFor(density, rng, meter) {
  const n = meter.steps, every = k => Array.from({ length: Math.ceil(n / k) }, (_, i) => i * k);
  const q = meter.id === "6/8" ? every(2).filter(s => s % 6 !== 4) : every(4);           // 6/8: «довга-коротка»
  const sets = [
    q,                                                                                     // чверті
    [...new Set([...q, ...every(4).map(s => s + 2).filter((s, i) => i % 2 === 1 && s < n)])].sort((a, b) => a - b),
    every(2),                                                                              // восьмі
    [...new Set([...every(2), ...every(8).map(s => s + 3).filter(s => s < n)])].sort((a, b) => a - b),
  ];
  const i = Math.min(3, Math.floor(density * 4));
  const r = sets[i].slice();
  // трохи «дихання» у мотиві (seeded): прибрати одну слабку долю
  if (r.length > 4 && rng.chance(0.5)) r.splice(1 + rng.int(0, r.length - 3), 1);
  return r;
}

// нижня нота мелодії для тембру теми
const LOW = { cello: 50, horn: 55, choir: 60, marimba: 60, glass: 72, flute: 67, violin: 64, piano: 62, clarinet: 58, harmonics: 72 };

export default {
  id: "melody",
  label: "Мелодія",
  role: "Сканує кадр зліва направо: вище нота — більше значення (тепліше / світліше) в цій смузі; суша — пауза",
  // етап 16: мелодія треку — голос даних; ця партія грає лише без нього (grammar: false), ніколи одночасно
  active: (o, ctx) => !ctx.grammar && (o > 0.32 && ctx.bar.section !== "intro" || (ctx.bar.section === "intro" && ctx.meta.still)),
  render(ctx, out) {
    const { bar, h, rng, state, meta, b, meter, instr } = ctx;
    const p = bar.params, phrase = meta.phrase;
    const posInPhrase = b % phrase;
    const contour = p.contour;
    const lo = (LOW[instr.melody] ?? 64) + Math.round(p.register * 8), span = 14;     // ~ півтори октави
    const stepDur = bar.dur / meter.steps;
    const chordSet = new Set(chordPcs(h, { max: 4 }));

    // мотив фрази: ритм першого такту фрази повторюється
    if (posInPhrase === 0 || !state.rhythm) state.rhythm = rhythmFor(p.density, rng, meter);
    let rhythm = state.rhythm;
    const cadence = posInPhrase === phrase - 1;
    if (cadence) {                                     // каданс: коротко → довга нота на другій сильній долі
      const mid = meter.strong[1] ?? meter.beats[Math.floor(meter.beats.length / 2)] ?? Math.floor(meter.steps / 2);
      rhythm = rhythm.filter(s => s < mid).slice(0, 3).concat([mid]);
    }

    // повернення мотиву (returnOfState / цикл): та сама мелодія, що й на початку теми
    if (bar.motifReturn && state.firstMotif) {
      for (const n of state.firstMotif) out.push({ ...n, t: bar.t0 + n.rel * bar.dur, dur: n.relDur * bar.dur, vel: n.vel * (0.6 + 0.5 * p.energy), motif: true });
      return;
    }

    const notes = [];
    let prev = state.last ?? lo + span / 2;
    rhythm.forEach((s, k) => {
      const col = colOfStep(s, meter);                 // крок → колонка кадру (зліва направо)
      const v = contour[col];
      if (v === null) return;                          // суша / фон — пауза
      let midi = Math.round(lo + v * span);
      midi = snapToMode(midi, h.root, h.mode);
      // сильні долі — звук акорду (консонанс)
      if (meter.strong.includes(s) || (cadence && k === rhythm.length - 1)) {
        let best = midi, bd = 99;
        for (const pc of chordSet) { const m = nearest(pc, midi, lo - 3, lo + span + 3); if (Math.abs(m - midi) < bd) { bd = Math.abs(m - midi); best = m; } }
        midi = best;
      }
      // без стрибків понад сексту
      while (midi - prev > 9) midi -= 12;
      while (prev - midi > 9) midi += 12;
      prev = midi;
      const next = rhythm[k + 1] ?? meter.steps;
      const gap = (next - s) * stepDur;
      const legato = p.articulation < 0.45;
      const dur = cadence && k === rhythm.length - 1 ? bar.dur * 0.48 : gap * (legato ? 1.0 : 0.5);
      const cover = p.contourCover?.[col] ?? 0.5;
      notes.push({
        t: bar.t0 + s * stepDur, midi, dur, legato,
        vel: (0.45 + 0.4 * p.energy) * (0.75 + 0.4 * Math.min(1, cover * 2)) * (meter.beats.includes(s) ? 1 : 0.85),
        pan: -0.7 + 1.4 * col / 15, offbeat: s % 4 === 2,
      });
    });
    state.last = prev;
    if (!state.firstMotif && notes.length >= 3 && bar.section !== "intro")
      state.firstMotif = notes.map(n => ({ ...n, rel: (n.t - bar.t0) / bar.dur, relDur: n.dur / bar.dur }));
    out.push(...notes);
  },
};
