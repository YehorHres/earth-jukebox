// Аудіолегенда під тип сцени: «так звучить холодна вода / тепла вода / місто / темрява».
// Кожен пункт — кнопка (можна переслухати); клавіша L — уся легенда підряд.
import { playNote } from "../audio/instruments.js";
import { announce, prefs } from "../a11y/announcer.js";

const A = 57; // A3
const seq = (inst, notes, step, opts = {}) => notes.map((m, k) => ({ inst, t: k * step, midi: m, dur: opts.dur ?? step * 1.4, vel: opts.vel ?? 0.6, pan: opts.pan ? opts.pan(k, notes.length) : 0 }));
const chord = (inst, notes, t = 0, dur = 2.4, vel = 0.5) => notes.map(m => ({ inst, t, midi: m, dur, vel, pan: 0 }));

const COMMON = [
  { text: "Захід — ліворуч, схід — праворуч: мелодія сканує кадр зліва направо.", notes: () => seq("violin", [69, 71, 73, 74, 76, 78, 80, 81], 0.22, { pan: (k, n) => -0.9 + 1.8 * k / (n - 1) }) },
  { text: "Суша або фон без даних — пауза в мелодії.", notes: () => [...seq("violin", [69, 71], 0.3), ...seq("violin", [76, 74], 0.3).map(n => ({ ...n, t: n.t + 1.4 }))] },
  { text: "Більше змін у даних — дрібніший ритм: чверті, восьмі, шістнадцяті.", notes: () => [
    ...seq("piano", [57, 61, 64, 69], 0.5, { vel: 0.5 }),
    ...seq("piano", [57, 61, 64, 69, 64, 61, 57, 61], 0.25, { vel: 0.5 }).map(n => ({ ...n, t: n.t + 2.1 })),
    ...seq("piano", [57, 61, 64, 69, 73, 69, 64, 61, 57, 61, 64, 69, 73, 69, 64, 61], 0.125, { vel: 0.5 }).map(n => ({ ...n, t: n.t + 4.2 })),
  ] },
  { text: "Пік або рекорд даних — дзвін. Перетин рекордного рівня — короткий акорд мідних.", notes: () => [...chord("bells", [81, 85, 88], 0, 2.5, 0.7), ...chord("brass", [57, 61, 64], 1.8, 0.35, 0.7)] },
  { text: "Зміна режиму в даних — удар литавр; перед новим розділом — тремоло литавр і наростання шуму.", notes: () => [
    { inst: "timpani", t: 0, midi: 45, dur: 1, vel: 0.8 },
    ...Array.from({ length: 10 }, (_, k) => ({ inst: "timpani", t: 1.2 + k * 0.12, midi: 45, dur: 0.4, vel: 0.15 + 0.06 * k })),
    { inst: "swell", t: 1.2, midi: 0, dur: 1.2, vel: 0.7 },
  ] },
];

const SCENES = {
  heatmap: [
    { text: "Холодна вода, синій колір: низькі ноти мелодії, світлий мажорний лад.", notes: () => [...chord("strings", [A, A + 4, A + 7, A + 11]), ...seq("violin", [64, 66, 68, 69], 0.4, { vel: 0.55 })] },
    { text: "Тепла вода, червоний колір: високі ноти, темний фригійський лад і напруга.", notes: () => [...chord("strings", [A, A + 1, A + 3, A + 7]), ...seq("violin", [81, 82, 84, 81], 0.4, { vel: 0.65 })] },
    { text: "Вода теплішає, тепла стає рекордно багато — більше інструментів і гучніше.", notes: () => [...chord("strings", [A, A + 3, A + 7], 0, 3, 0.3), ...seq("contrabass", [45, 45, 52, 45], 0.6, { vel: 0.7, dur: 0.4 }), ...seq("piano", [69, 72, 76, 81, 76, 72, 69, 72], 0.3, { vel: 0.6 })] },
  ],
  nightlights: [
    { text: "Темрява: глибокий дрон із довгою луною.", notes: () => [{ inst: "drone", t: 0, midi: 37, dur: 3, vel: 0.8 }] },
    { text: "Вогні міст: короткі дзвінкі ноти «зоряного дощу». Що більше вогнів, то густіший дощ.", notes: () => [
      ...[0, 0.6, 1.1].map((t, k) => ({ inst: "celesta", t, midi: [85, 88, 92][k], dur: 0.3, vel: 0.5, pan: [-0.5, 0.3, -0.1][k] })),
      ...Array.from({ length: 14 }, (_, k) => ({ inst: "celesta", t: 1.8 + k * 0.11, midi: [85, 88, 92, 95, 97][k % 5], dur: 0.25, vel: 0.4, pan: -0.8 + (k * 0.37) % 1.6 })),
    ] },
    { text: "Місто, що росте, — світло яскравішає: мелодія вище, гармонія напруженіша.", notes: () => [...chord("strings", [49, 52, 56], 0, 3, 0.35), ...seq("flute", [68, 71, 73, 76, 80], 0.4, { vel: 0.6 })] },
  ],
  truecolor: [
    { text: "Хмари й лід, білий колір: більше енергії й руху.", notes: () => seq("harp", [67, 71, 74, 79, 83], 0.2) },
    { text: "Рослинність, зелений колір: світлий лад.", notes: () => [...chord("strings", [55, 59, 62, 66]), ...seq("flute", [74, 76, 78, 79], 0.4)] },
  ],
};

export function legendItems(scene) { return [...(SCENES[scene] || SCENES.heatmap), ...COMMON]; }

/** Зіграти один пункт легенди (engine вже ініціалізований жестом користувача). */
export function playItem(engine, item, at = engine.ctx.currentTime + 0.05) {
  const notes = item.notes();
  for (const n of notes) playNote(engine, engine.bus(`legend`, { send: 0.35 }), n.inst, n, at + n.t);
  return notes.reduce((m, n) => Math.max(m, n.t + n.dur), 0) + 0.6;
}

let cancel = null;
/** Уся легенда підряд: текст (скрінрідер / голос) → звук → наступний пункт. */
export async function playLegend(engine, scene, onItem = () => {}) {
  cancel?.();
  let stopped = false;
  cancel = () => (stopped = true);
  await engine.init();
  engine.fade(0.9, 0.02);
  const items = legendItems(scene);
  announce("Аудіолегенда.", { force: true });
  await wait(900);
  for (let k = 0; k < items.length && !stopped; k++) {
    onItem(k);
    announce(items[k].text, { force: true });
    await wait(prefs.voice ? 3200 : 1600);
    if (stopped) break;
    const len = playItem(engine, items[k]);
    await wait(len * 1000);
  }
  onItem(-1);
}
export function stopLegend() { cancel?.(); }
const wait = ms => new Promise(r => setTimeout(r, ms));
