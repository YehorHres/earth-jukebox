// Спільні допоміжні функції для партій.
import { voiceLead } from "../theory.js";

/** Абсолютні класи висот акорду (0..11). */
export function chordPcs(h, { sus = false, max = 6 } = {}) {
  const ch = h.chords[0].chord;
  let tones = ch.tones.slice(0, max).map(t => (h.root + t.pc) % 12);
  if (sus || ch.sus) {
    // затримка (sus4): терцію замінюємо чистою квартою над основним тоном
    const fourth = (h.root + ch.tones[0].pc + 5) % 12;
    tones = [tones[0], fourth, ...tones.slice(2)];
  }
  return [...new Set(tones)];
}

export const chordRootPc = h => (h.root + h.chords[0].chord.root) % 12;

/** Найближча до target нота з класом висоти pc у діапазоні [lo, hi]. */
export function nearest(pc, target, lo = 0, hi = 127) {
  let m = Math.round((target - pc) / 12) * 12 + pc;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}

export function lead(pcs, prev, lo, hi) { return voiceLead(pcs, prev, lo, hi, 0); }

/** Рівномірно розставити k ударів на n кроків (евклідів ритм). */
export function euclid(k, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.floor((i + 1) * k / n) - Math.floor(i * k / n) === 1);
  return out;
}

/** Кроків у такті за густотою: чверті → восьмі → шістнадцяті. */
export const stepsFor = density => (density < 0.33 ? 4 : density < 0.66 ? 8 : 16);
