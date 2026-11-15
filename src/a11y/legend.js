// Аудіолегенда під тип сцени: «так звучить холодна вода / тепла вода / місто / темрява».
// Кожен пункт — кнопка (можна переслухати); клавіша L — уся легенда підряд.
import { playNote } from "../audio/instruments.js";
import { announce, prefs } from "../a11y/announcer.js";
import { earconsFor, voiceOf, valueToMidi, DEFAULT_TICK } from "../grammar.js";

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

/**
 * Пункти легенди: спершу — тема цієї карти (що означає «більше» і як звучить тема), далі — тип сцени й загальні.
 * @param ctx { topic, colorMore, score } — необов'язково
 */
export function legendItems(scene, ctx = {}) {
  const items = [];
  const { topic, colorMore, score } = ctx;
  if (topic && topic.id !== "generic") {
    const mel = score?.parts.find(p => p.id === "melody")?.instrument || "violin";
    const pad = score?.parts.find(p => p.id === "pad")?.instrument || "strings";
    const more = colorMore || topic.more?.uk || "більше значення";
    items.push({ intro: true, text: `${topic.name.uk}: ${more} — голос даних звучить вище, менше — нижче.`,
      notes: () => { const vo = voiceOf(topic.id); return seq(vo.inst, [0, 5, 9, 12, 17, 24].map(d => vo.range[0] + d), 0.35, { vel: 0.8 }); } });
    items.push({ intro: true, text: `Тембр теми: ${topic.soundProfile.why}.`, notes: () => [...chord(pad, [48, 55, 60, 64], 0, 2.6, 0.45), ...seq(mel, [67, 72], 0.6, { vel: 0.5 }).map(n => ({ ...n, t: n.t + 0.6 }))] });
  }
  // граматика звуку (v5-A): точка відліку, тіки часу й кожен ерікон теми
  const g = score?.grammar, tid = topic?.id || "generic";
  if (g || topic) {
    const vo = voiceOf(tid), ref = Math.round(valueToMidi(g?.reference?.value ?? 0.5, vo.range)), tk = g?.tick || DEFAULT_TICK;
    items.push({ grammar: "reference", text: "Точка відліку: на початку треку звучить референсний тон — середнє значення за все відео. Голос даних вище за нього — більше, нижче — менше.",
      notes: () => [{ inst: "reftone", t: 0, midi: ref, dur: 1.5, vel: 0.9, pan: 0 }, ...seq(vo.inst, [ref + 7, ref - 5], 0.7, { vel: 0.8 }).map(n => ({ ...n, t: n.t + 1.7 }))] });
    items.push({ grammar: "ticks", text: `Шкала часу (опція, вимкнено за замовчуванням): тихий клік кожні ${tk.label}, сильніший — кожен ${tk.strong}-й.`,
      notes: () => Array.from({ length: 5 }, (_, k) => ({ inst: "tick", t: k * 0.5, midi: 0, dur: 0.05, vel: k % 4 === 0 ? 0.8 : 0.45, strong: k % 4 === 0, pan: 0 })) });
    for (const ec of earconsFor(tid)) items.push({ grammar: "earcon", earcon: ec.id, text: `Знак події «${ec.label}»: ${ec.text}.`,
      notes: () => [0, 0.9].map(t => ({ inst: "earcon", t, midi: 0, dur: ec.spec.dur, vel: 0.9, pan: 0, ec: ec.spec })) });
  }
  return [...items, ...(SCENES[scene] || SCENES.heatmap), ...COMMON];
}

/** Сказати голосом (speechSynthesis) і дочекатися кінця; без синтезу — aria-live і пауза за довжиною тексту. */
let duckEngine = null;
/** Двигун, який приглушується під час мовлення (ducking). */
export function setDuckEngine(engine) { duckEngine = engine; }
const unduck = v => { duckEngine?.duck(false); return v; };

export function say(text, lang = "uk-UA") {
  duckEngine?.duck(true);
  return sayRaw(text, lang).then(unduck, unduck);
}
function sayRaw(text, lang) {
  const st = document.getElementById("status");
  if (st) st.textContent = text;                          // видимий текст вступу
  // голос є — говоримо ним (без aria-live, щоб скрінрідер не дублював); немає — aria-live
  // голос є і він говорить цією мовою — говоримо ним (без aria-live, щоб скрінрідер не дублював);
  // інакше — aria-live (скрінрідер), а не чужомовний голос
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const hasLang = voices.length === 0 || voices.some(v => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
  if (!window.speechSynthesis || !prefs.introVoice || !hasLang) { announce(text, { force: true }); return wait(Math.min(6000, 600 + text.length * 45)); }
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = 1.05;
    const done = () => { clearTimeout(t); res(); };
    const t = setTimeout(done, 1500 + text.length * 120);   // підстраховка, якщо голос не відповів
    u.onend = done; u.onerror = done;
    speechSynthesis.speak(u);
  });
}

let introCancel = null;
/**
 * Голосовий вступ перед треком (етап 13): тема й роки, потім пункти теми з аудіолегенди.
 * Повертає true, якщо вступ дограв до кінця (не перерваний).
 */
export async function playIntro(engine, { title, years, items }) {
  introCancel?.();
  let stopped = false;
  introCancel = () => { stopped = true; if (window.speechSynthesis) speechSynthesis.cancel(); };
  await engine.init();
  setDuckEngine(engine);
  engine.fade(0.9, 0.02);
  await say(`${title}${years ? ", " + years : ""}.`);
  for (const it of items) {
    if (stopped) return false;
    await say(it.text);
    if (stopped) return false;
    await wait(playItem(engine, it) * 1000);
  }
  return !stopped;
}
export function stopIntro() { introCancel?.(); }

/** Зіграти один пункт легенди (engine вже ініціалізований жестом користувача). */
export function playItem(engine, item, at = engine.ctx.currentTime + 0.05) {
  const notes = item.notes();
  for (const n of notes) playNote(engine, engine.bus(`legend`, { send: 0.35 }), n.inst, n, at + n.t);
  return notes.reduce((m, n) => Math.max(m, n.t + n.dur), 0) + 0.6;
}

let cancel = null;
/** Уся легенда підряд: текст (скрінрідер / голос) → звук → наступний пункт. */
export async function playLegend(engine, scene, onItem = () => {}, ctx = {}) {
  cancel?.();
  let stopped = false;
  cancel = () => (stopped = true);
  await engine.init();
  engine.fade(0.9, 0.02);
  const items = legendItems(scene, ctx);
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
