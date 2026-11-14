// Музична теорія: лади, діатонічні акорди, банки прогресій, голосоведення.

// від найсвітлішого до найтемнішого (розділ 5 ТЗ)
export const MODES = [
  { id: "lydian", label: "лідійський", steps: [0, 2, 4, 6, 7, 9, 11] },
  { id: "ionian", label: "мажор", steps: [0, 2, 4, 5, 7, 9, 11] },
  { id: "mixolydian", label: "міксолідійський", steps: [0, 2, 4, 5, 7, 9, 10] },
  { id: "dorian", label: "дорійський", steps: [0, 2, 3, 5, 7, 9, 10] },
  { id: "aeolian", label: "мінор", steps: [0, 2, 3, 5, 7, 8, 10] },
  { id: "phrygian", label: "фригійський", steps: [0, 1, 3, 5, 7, 8, 10] },
];

/** brightness 1 → лідійський … 0 → фригійський. */
export function modeFor(brightness) {
  const i = Math.round((1 - Math.max(0, Math.min(1, brightness))) * (MODES.length - 1));
  return MODES[i];
}

export const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
export const noteName = m => NOTE_NAMES[((m % 12) + 12) % 12];

/** Нота ступеня degree (0..∞) ладу від root (midi). */
export function degreeToMidi(root, mode, degree) {
  const s = mode.steps, o = Math.floor(degree / 7), d = ((degree % 7) + 7) % 7;
  return root + 12 * o + s[d];
}

/** Діатонічний акорд на ступені: тризвук + розширення за напругою. Повертає класи висот (0..11 від root) і ступені. */
export function chordOn(mode, degree, tension) {
  const pick = k => ({ deg: degree + k, pc: degreeToMidi(0, mode, degree + k) % 12 });
  const tones = [pick(0), pick(2), pick(4)];
  let ext = "тризвук";
  if (tension >= 0.3) { tones.push(pick(6)); ext = "септакорд"; }
  if (tension >= 0.55) { tones.push(pick(8)); ext = "з ноною"; }
  if (tension >= 0.78) {
    // кластер: мала секунда над основним тоном / тритон — тривога на піку
    tones.push({ deg: degree, pc: (tones[0].pc + 1) % 12, color: true });
    tones.push({ deg: degree, pc: (tones[0].pc + 6) % 12, color: true });
    ext = "кластер з малою секундою й тритоном";
  }
  return { degree, root: tones[0].pc, tones, ext };
}

// банки прогресій (ступені ладу) за рівнем напруги
export const PROGRESSIONS = {
  calm: [[0, 4, 5, 3], [0, 3, 0, 4], [0, 5, 3, 4], [5, 3, 0, 4]],
  medium: [[5, 3, 0, 4], [0, 2, 5, 4], [3, 4, 2, 5], [0, 5, 1, 4]],
  tense: [[0, 1, 4, 0], [5, 6, 4, 0], [0, 3, 1, 4], [1, 0, 6, 4]],
};
export const tensionLevel = t => (t < 0.35 ? "calm" : t < 0.65 ? "medium" : "tense");

/**
 * Голосоведення: розкласти класи висот у діапазоні [lo, hi] так, щоб голоси рухалися мінімально
 * від попереднього акорду (prev — масив midi). Повертає відсортований масив midi.
 */
export function voiceLead(pcs, prev, lo, hi, root) {
  const n = pcs.length;
  if (!prev || !prev.length) {
    // перший акорд: щільно від середини діапазону
    const center = (lo + hi) / 2 - 6;
    return pcs.map(pc => nearestPc(pc, center + 3)).sort((a, b) => a - b);
  }
  // для кожної ноти — найближча октава до будь-якого голосу попереднього акорду
  const center = prev.reduce((s, v) => s + v, 0) / prev.length;
  let best = null, bestCost = Infinity;
  for (let shift = -6; shift <= 6; shift += 3) {
    const notes = pcs.map(pc => nearestPc(pc, center + shift)).sort((a, b) => a - b);
    if (notes[0] < lo || notes[notes.length - 1] > hi) continue;
    let cost = 0;
    for (const v of notes) cost += Math.min(...prev.map(p => Math.abs(p - v)));
    if (cost < bestCost) { bestCost = cost; best = notes; }
  }
  return best || pcs.map(pc => nearestPc(pc, (lo + hi) / 2)).sort((a, b) => a - b);

  function nearestPc(pc, target) {
    let m = Math.round((target - pc - (root || 0)) / 12) * 12 + pc + (root || 0);
    while (m < lo) m += 12;
    while (m > hi) m -= 12;
    return m;
  }
}

/** Сусідній ступінь ладу від midi в напрямку dir (+1 / −1) — поступовий рух. */
export function stepInMode(midi, dir, root, mode) {
  for (let m = midi + dir; Math.abs(m - midi) <= 3; m += dir) if (mode.steps.includes((((m - root) % 12) + 12) % 12)) return m;
  return midi + dir;
}

/** Найближча нота ладу до midi. */
export function snapToMode(midi, root, mode) {
  let best = midi, bd = 99;
  for (let d = -2; d <= 2; d++) {
    const m = midi + d, pc = (((m - root) % 12) + 12) % 12;
    if (mode.steps.includes(pc) && Math.abs(d) < bd) { bd = Math.abs(d); best = m; }
  }
  return best;
}
