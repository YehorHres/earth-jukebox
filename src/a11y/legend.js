// Аудіолегенда під тип сцени: «так звучить холодна вода / тепла вода / місто / темрява».
// Кожен пункт — кнопка (можна переслухати); клавіша L — уся легенда підряд.
import { playNote } from "../audio/instruments.js";
import { announce, prefs } from "../a11y/announcer.js";
import { earconsFor, voiceOf, valueToMidi, DEFAULT_TICK, EARCONS_EN } from "../grammar.js";
import { getLang, t, tr, pick, speechLang } from "../i18n/index.js";
import { utterRate, getSpeechRate } from "./speech.js";

/** Текст мовою інтерфейсу: L(українською, англійською). */
const L = (uk, en) => (getLang() === "en" ? en : uk);

const A = 57; // A3
const seq = (inst, notes, step, opts = {}) => notes.map((m, k) => ({ inst, t: k * step, midi: m, dur: opts.dur ?? step * 1.4, vel: opts.vel ?? 0.6, pan: opts.pan ? opts.pan(k, notes.length) : 0 }));
const chord = (inst, notes, t = 0, dur = 2.4, vel = 0.5) => notes.map(m => ({ inst, t, midi: m, dur, vel, pan: 0 }));

const COMMON = () => [
  { text: L("Захід — ліворуч, схід — праворуч: мелодія сканує кадр зліва направо.", "West is on the left, east on the right: the melody scans the frame left to right."), notes: () => seq("violin", [69, 71, 73, 74, 76, 78, 80, 81], 0.22, { pan: (k, n) => -0.9 + 1.8 * k / (n - 1) }) },
  { text: L("Суша або фон без даних — пауза в мелодії.", "Land or background without data is a rest in the melody."), notes: () => [...seq("violin", [69, 71], 0.3), ...seq("violin", [76, 74], 0.3).map(n => ({ ...n, t: n.t + 1.4 }))] },
  { text: L("Більше змін у даних — дрібніший ритм: чверті, восьмі, шістнадцяті.", "More change in the data means a finer rhythm: quarters, eighths, sixteenths."), notes: () => [
    ...seq("piano", [57, 61, 64, 69], 0.5, { vel: 0.5 }),
    ...seq("piano", [57, 61, 64, 69, 64, 61, 57, 61], 0.25, { vel: 0.5 }).map(n => ({ ...n, t: n.t + 2.1 })),
    ...seq("piano", [57, 61, 64, 69, 73, 69, 64, 61, 57, 61, 64, 69, 73, 69, 64, 61], 0.125, { vel: 0.5 }).map(n => ({ ...n, t: n.t + 4.2 })),
  ] },
  { text: L("Пік або рекорд даних — дзвін. Перетин рекордного рівня — короткий акорд мідних.", "A data peak or record is a bell. Crossing a record level is a short brass chord."), notes: () => [...chord("bells", [81, 85, 88], 0, 2.5, 0.7), ...chord("brass", [57, 61, 64], 1.8, 0.35, 0.7)] },
  { text: L("Зміна режиму в даних — удар литавр; перед новим розділом — тремоло литавр і наростання шуму.", "A regime change in the data is a timpani hit; before a new section, a timpani roll and a rising swell."), notes: () => [
    { inst: "timpani", t: 0, midi: 45, dur: 1, vel: 0.8 },
    ...Array.from({ length: 10 }, (_, k) => ({ inst: "timpani", t: 1.2 + k * 0.12, midi: 45, dur: 0.4, vel: 0.15 + 0.06 * k })),
    { inst: "swell", t: 1.2, midi: 0, dur: 1.2, vel: 0.7 },
  ] },
];

const SCENES = () => ({
  heatmap: [
    { text: L("Холодна вода, синій колір: низькі ноти мелодії, світлий мажорний лад.", "Cold water, blue: low melody notes, a bright major mode."), notes: () => [...chord("strings", [A, A + 4, A + 7, A + 11]), ...seq("violin", [64, 66, 68, 69], 0.4, { vel: 0.55 })] },
    { text: L("Тепла вода, червоний колір: високі ноти, темний фригійський лад і напруга.", "Warm water, red: high notes, a dark Phrygian mode and tension."), notes: () => [...chord("strings", [A, A + 1, A + 3, A + 7]), ...seq("violin", [81, 82, 84, 81], 0.4, { vel: 0.65 })] },
    { text: L("Вода теплішає, тепла стає рекордно багато — більше інструментів і гучніше.", "The water warms and warm water reaches a record — more instruments, louder."), notes: () => [...chord("strings", [A, A + 3, A + 7], 0, 3, 0.3), ...seq("contrabass", [45, 45, 52, 45], 0.6, { vel: 0.7, dur: 0.4 }), ...seq("piano", [69, 72, 76, 81, 76, 72, 69, 72], 0.3, { vel: 0.6 })] },
  ],
  nightlights: [
    { text: L("Темрява: глибокий дрон із довгою луною.", "Darkness: a deep drone with a long echo."), notes: () => [{ inst: "drone", t: 0, midi: 37, dur: 3, vel: 0.8 }] },
    { text: L("Вогні міст: короткі дзвінкі ноти «зоряного дощу». Що більше вогнів, то густіший дощ.", "City lights: short ringing notes of a “star rain”. The more lights, the denser the rain."), notes: () => [
      ...[0, 0.6, 1.1].map((t, k) => ({ inst: "celesta", t, midi: [85, 88, 92][k], dur: 0.3, vel: 0.5, pan: [-0.5, 0.3, -0.1][k] })),
      ...Array.from({ length: 14 }, (_, k) => ({ inst: "celesta", t: 1.8 + k * 0.11, midi: [85, 88, 92, 95, 97][k % 5], dur: 0.25, vel: 0.4, pan: -0.8 + (k * 0.37) % 1.6 })),
    ] },
    { text: L("Місто, що росте, — світло яскравішає: мелодія вище, гармонія напруженіша.", "A growing city — the light gets brighter: the melody rises, the harmony gets tenser."), notes: () => [...chord("strings", [49, 52, 56], 0, 3, 0.35), ...seq("flute", [68, 71, 73, 76, 80], 0.4, { vel: 0.6 })] },
  ],
  truecolor: [
    { text: L("Хмари й лід, білий колір: більше енергії й руху.", "Clouds and ice, white: more energy and motion."), notes: () => seq("harp", [67, 71, 74, 79, 83], 0.2) },
    { text: L("Рослинність, зелений колір: світлий лад.", "Vegetation, green: a bright mode."), notes: () => [...chord("strings", [55, 59, 62, 66]), ...seq("flute", [74, 76, 78, 79], 0.4)] },
  ],
});

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
    const more = (colorMore && tr(colorMore)) || pick(topic, "more") || L("більше значення", "a larger value");
    items.push({ intro: true, text: L(`${topic.name.uk}: ${more} — голос даних звучить вище, менше — нижче.`, `${pick(topic, "name")}: ${more} — the data voice sounds higher, less — lower.`),
      notes: () => { const vo = voiceOf(topic.id); return seq(vo.inst, [0, 5, 9, 12, 17, 24].map(d => vo.range[0] + d), 0.35, { vel: 0.8 }); } });
    items.push({ intro: true, text: L(`Тембр теми: ${topic.soundProfile.why}.`, `Topic timbre: ${topic.soundProfile.why_en || tr(topic.soundProfile.why)}.`), notes: () => [...chord(pad, [48, 55, 60, 64], 0, 2.6, 0.45), ...seq(mel, [67, 72], 0.6, { vel: 0.5 }).map(n => ({ ...n, t: n.t + 0.6 }))] });
  }
  // граматика звуку (v5-A): точка відліку, тіки часу й кожен ерікон теми
  const g = score?.grammar, tid = topic?.id || "generic";
  if (g || topic) {
    const vo = voiceOf(tid), ref = Math.round(valueToMidi(g?.reference?.value ?? 0.5, vo.range)), tk = g?.tick || DEFAULT_TICK;
    items.push({ grammar: "reference", text: L("Точка відліку: на початку треку звучить референсний тон — середнє значення за все відео. Голос даних вище за нього — більше, нижче — менше.", "Reference point: at the start of the track a reference tone plays — the average value of the whole video. A data voice above it means more, below it means less."),
      notes: () => [{ inst: "reftone", t: 0, midi: ref, dur: 1.5, vel: 0.9, pan: 0 }, ...seq(vo.inst, [ref + 7, ref - 5], 0.7, { vel: 0.8 }).map(n => ({ ...n, t: n.t + 1.7 }))] });
    items.push({ grammar: "ticks", text: L(`Шкала часу (опція, вимкнено за замовчуванням): тихий клік кожні ${tk.label}, сильніший — кожен ${tk.strong}-й.`, `Time scale (option, off by default): a quiet click every ${tk.label_en || tk.label}, a stronger one every ${tk.strong}th.`),
      notes: () => Array.from({ length: 5 }, (_, k) => ({ inst: "tick", t: k * 0.5, midi: 0, dur: 0.05, vel: k % 4 === 0 ? 0.8 : 0.45, strong: k % 4 === 0, pan: 0 })) });
    for (const ec of earconsFor(tid)) items.push({ grammar: "earcon", earcon: ec.id, text: L(`Знак події «${ec.label}»: ${ec.text}.`, `Event sign “${EARCONS_EN[ec.id]?.[0] || ec.label}”: ${EARCONS_EN[ec.id]?.[1] || ec.text}.`),
      notes: () => [0, 0.9].map(t => ({ inst: "earcon", t, midi: 0, dur: ec.spec.dur, vel: 0.9, pan: 0, ec: ec.spec })) });
  }
  const sc = SCENES();
  return [...items, ...(sc[scene] || sc.heatmap), ...COMMON()];
}

/** Сказати голосом (speechSynthesis) і дочекатися кінця; без синтезу — aria-live і пауза за довжиною тексту. */
let duckEngine = null;
/** Двигун, який приглушується під час мовлення (ducking). */
export function setDuckEngine(engine) { duckEngine = engine; }
const unduck = v => { duckEngine?.duck(false); return v; };

export function say(text, lang = speechLang()) {
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
  if (!window.speechSynthesis || !prefs.introVoice || !hasLang) { announce(text, { force: true }); return wait(Math.min(6000, 600 + text.length * 45) / getSpeechRate()); }
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = utterRate(1.05);
    const done = () => { clearTimeout(t); res(); };
    const t = setTimeout(done, 1500 + text.length * 120 / getSpeechRate());   // підстраховка, якщо голос не відповів
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

/** v10 §7: короткий вступ (текст ≤ 20 с) і 1 с тон-орієнтир — середнє значення відео на голосі даних. */
export async function playShortIntro(engine, { text, topicId, score }) {
  introCancel?.();
  let stopped = false;
  introCancel = () => { stopped = true; if (window.speechSynthesis) speechSynthesis.cancel(); };
  await engine.init();
  setDuckEngine(engine);
  engine.fade(0.9, 0.02);
  await say(text);
  if (stopped) return false;
  const vo = voiceOf(topicId || "generic"), ref = Math.round(valueToMidi(score?.grammar?.reference?.value ?? 0.5, vo.range));
  await wait(playItem(engine, { notes: () => [{ inst: "reftone", t: 0, midi: ref, dur: 1, vel: 0.9, pan: 0 }] }) * 1000);
  return !stopped;
}

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
  announce(t("legend.announce"), { force: true });
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
