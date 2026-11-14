// Музичний розмір такту. Темп (BPM) — завжди в чвертях; такт = quarters чвертей = steps шістнадцятих.
export const METERS = {
  "4/4": { id: "4/4", quarters: 4, steps: 16, strong: [0, 8], beats: [0, 4, 8, 12], label: "4/4 (рівний)" },
  "3/4": { id: "3/4", quarters: 3, steps: 12, strong: [0], beats: [0, 4, 8], label: "3/4 (вальс)" },
  "6/8": { id: "6/8", quarters: 3, steps: 12, strong: [0, 6], beats: [0, 6], label: "6/8 (колисковий, пасторальний)" },
  "5/4": { id: "5/4", quarters: 5, steps: 20, strong: [0, 12], beats: [0, 4, 8, 12, 16], label: "5/4 (неспокійний, 3+2)" },
};
export const meterOf = id => METERS[id] || METERS["4/4"];

/** Колонка кадру (0..15) для кроку такту — мелодія сканує кадр зліва направо при будь-якому розмірі. */
export const colOfStep = (s, meter) => Math.min(15, Math.floor(s * 16 / meter.steps));
