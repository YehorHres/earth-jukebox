// Єдина граматика звуку (v5, етап A): те саме в даних звучить ОДНАКОВО в усіх темах.
// «Вивчив раз — розумієш будь-яку карту». Таблицю показуємо в UI, README й аудіолегенді.
// Тема змінює лише тембр (колір голосу даних, знаки-ерікони), а не правила.

export const GRAMMAR = [
  { data: "Значення головної величини (більше / менше за змістом теми)", sound: "Висота голосу даних: більше → вище", part: "dataVoice" },
  { data: "Площа / охоплення", sound: "Гучність і кількість голосів", part: "оркестровка" },
  { data: "Швидкість змін", sound: "Густота ритму й темп (темп — лише між фразами)", part: "ритм" },
  { data: "Аномалія, рекорд, невизначеність", sound: "Напруга: дисонанс, тремоло, шорсткість", part: "гармонія" },
  { data: "Дискретна подія (спалах, новий об'єкт, різкий стрибок)", sound: "Ерікон — фіксований короткий звук-знак теми", part: "earcons" },
  { data: "Положення по горизонталі (захід ↔ схід, ліво ↔ право диска)", sound: "Панорама: ліве ↔ праве вухо", part: "панорама" },
  { data: "Положення по вертикалі", sound: "Висотою НЕ кодуємо (висота зайнята значенням) — повідомляємо голосом", part: "мовлення" },
  { data: "Час відео", sound: "Час треку + тихі «тіки» шкали часу", part: "ticks" },
];

/** Діапазон голосу даних (MIDI): 2 октави над супроводом. */
export const VOICE_RANGE = [62, 86];
/** Одночасно на першому плані: голос даних + до 2 солістів зон. */
export const FOREGROUND_MAX = 3;
/** Мінімальна відстань між зонами солістів (із 16 колонок кадру). */
export const SOLO_MIN_GAP = 3;
/** Супровід тихіший за голос даних (−6…−10 дБ) і має виріз у частотах під нього. */
export const ACCOMP_DB = -7;
export const VOICE_CUT = { f: 1200, q: 0.7, db: -4 };
/** Приглушення музики під час мовлення (≥ 10 дБ). */
export const DUCK_DB = -14;
/** Референсний тон на початку треку, с. */
export const REF_INTRO = 1.5;
/** Тіки шкали часу за замовчуванням: кожні 10 с, сильніший — кожен 4-й. */
export const DEFAULT_TICK = { seconds: 10, strong: 4, label: "10 секунд" };

/** Партії граматики (не супровід): звучать на повному рівні. */
export const LEAD_PARTS = ["dataVoice", "soloists", "reference", "ticks", "earcons"];

/** Етап 16 — бюджет партій: одночасно ≤ 6 (у вступі ≤ 3 + короткі знаки); знаки (тіки, ерікони) — завжди. */
export const PARTS_MAX = 6;
export const INTRO_PARTS_MAX = 3;
export const SIGNAL_PARTS = ["earcons", "ticks"];
/** Хто отримує місце в такті: спершу дані й знаки (і рідка фонова текстура теми), далі — супровід за розділом форми. */
const PART_HEAD = ["dataVoice", "reference", "earcons", "ticks", "stars"];
const PART_BY_SECTION = {
  intro: ["pad", "texture", "bass", "arp"],
  build: ["pad", "bass", "counter", "arp", "drums", "soloists", "texture"],
  climax: ["bass", "pad", "drums", "counter", "soloists", "arp"],
  development: ["pad", "bass", "soloists", "arp", "drums", "texture"],
  resolution: ["pad", "arp", "bass", "texture", "soloists"],
  theme: ["pad", "bass", "arp", "soloists", "texture", "drums"],
};
export const partPriority = section => [...PART_HEAD, ...(PART_BY_SECTION[section] || PART_BY_SECTION.theme)];
/** Скільки партій (без знаків) дозволяють форма й дані: оркестровка + частка зон, що змінюються (тутті ↔ соло). */
export function partsCap(bar, last = false) {
  if (bar.section === "intro" || last) return INTRO_PARTS_MAX;
  const o = bar.params.orchestration ?? 0.5, tu = bar.params.tutti ?? 0.5;
  const c = (o < 0.35 ? 4 : o < 0.55 ? 5 : 6) + (tu > 0.6 ? 1 : tu < 0.15 ? -1 : 0);
  return Math.max(3, Math.min(PARTS_MAX, c));
}

/** Полярність: +1 — більше значення ознаки = «більше» за змістом теми; −1 — навпаки (moreMeans: "down"). */
export const polarity = topic => (topic?.moreMeans === "down" ? -1 : 1);
export const orient = (v, pol) => (pol < 0 ? 1 - v : v);
export const valueToMidi = v => VOICE_RANGE[0] + Math.max(0, Math.min(1, v)) * (VOICE_RANGE[1] - VOICE_RANGE[0]);

/** Колір голосу даних — від теми (тембр = тема), правила — спільні. */
const VOICE_COLOR = {
  co2: { wave: "sawtooth", formant: 700 }, temperature: { wave: "sawtooth", formant: 1300 }, "ocean-currents": { wave: "triangle", formant: 900 },
  ice: { wave: "sine", formant: 2600 }, fires: { wave: "sawtooth", formant: 1800 }, precipitation: { wave: "triangle", formant: 2000 },
  storms: { wave: "square", formant: 1000 }, vegetation: { wave: "triangle", formant: 1100 }, nightlights: { wave: "sine", formant: 3000 },
  clouds: { wave: "triangle", formant: 1600 }, "sea-level": { wave: "sawtooth", formant: 600 }, ozone: { wave: "sine", formant: 2200 },
  aerosols: { wave: "square", formant: 1500 },
};
export const voiceColor = topicId => VOICE_COLOR[topicId] || { wave: "triangle", formant: 1400 };

/* ---------------- ерікони: фіксовані знаки подій ---------------- */
// spec: noise [f0, f1, Q] — смуга шуму з ковзанням; tone [f0, f1, wave] — тон із ковзанням; dur — с.
// cls: up — пік / рекорд / перетин угору; down — спад / мінімум; jump — різка зміна режиму.
const E = (id, cls, label, text, spec) => ({ id, cls, label, text, spec });
const COMMON_JUMP = E("jump", "jump", "стук", "різка зміна режиму", { noise: [1200, 500, 4], tone: [220, 110, "sine"], dur: 0.14 });
const DEFAULT_EARCONS = [
  E("up", "up", "сигнал угору", "пік або рекорд", { tone: [660, 990, "triangle"], dur: 0.22 }),
  E("down", "down", "сигнал униз", "спад або мінімум", { tone: [660, 440, "triangle"], dur: 0.26 }),
  COMMON_JUMP,
];
const EARCONS = {
  storms: [
    E("gust", "up", "поштовх вітру", "шторм посилюється", { noise: [400, 2600, 2], dur: 0.45 }),
    E("calm", "down", "вітер стихає", "шторм слабшає", { noise: [2200, 300, 2], dur: 0.6 }),
    E("lightning", "jump", "блискавка", "різкий стрибок", { noise: [7000, 1500, 1], tone: [3000, 180, "sawtooth"], dur: 0.22 }),
  ],
  ice: [
    E("crack", "up", "тріск", "льоду найбільше", { noise: [3200, 2400, 9], tone: [1800, 600, "square"], dur: 0.09 }),
    E("drop", "down", "крапля", "льоду найменше, тане", { tone: [1500, 650, "sine"], dur: 0.16 }),
    COMMON_JUMP,
  ],
  nightlights: [
    E("spark", "up", "іскра", "вогнів стає більше", { noise: [9000, 7000, 3], tone: [2600, 5200, "triangle"], dur: 0.09 }),
    E("fade", "down", "згасання", "вогнів стає менше", { tone: [1200, 380, "sine"], dur: 0.32 }),
    COMMON_JUMP,
  ],
  fires: [
    E("flare", "up", "спалах", "пожеж найбільше", { noise: [700, 5200, 1.5], dur: 0.3 }),
    E("hiss", "down", "шипіння", "вогонь згасає", { noise: [5200, 1400, 2], dur: 0.5 }),
    E("crackle", "jump", "тріск", "різка зміна", { noise: [2800, 2000, 10], tone: [900, 300, "square"], dur: 0.08 }),
  ],
  co2: [
    E("puff", "up", "порив", "CO₂ найбільше", { noise: [300, 1300, 1.5], dur: 0.5 }),
    E("exhale", "down", "видих", "CO₂ найменше", { noise: [1300, 240, 1.5], dur: 0.6 }),
    COMMON_JUMP,
  ],
};
/** 2–4 знаки теми, однакові по всьому треку. */
export const earconsFor = topicId => EARCONS[topicId] || DEFAULT_EARCONS;

/** Клас події (з урахуванням полярності теми) або null — знака немає (наприклад, повернення мотиву). */
export function eventClass(e, pol = 1) {
  let c = null;
  if (e.type === "peak" || e.type === "globalMax" || (e.type === "thresholdCross" && e.dir === "up")) c = "up";
  else if (e.type === "trough" || e.type === "globalMin" || (e.type === "thresholdCross" && e.dir === "down")) c = "down";
  else if (e.type === "changePoint") c = "jump";
  if (pol < 0 && c && c !== "jump") c = c === "up" ? "down" : "up";
  return c;
}
/** Одна подія — один знак. */
export function earconFor(topicId, e, pol = 1) {
  const cls = eventClass(e, pol);
  return cls ? earconsFor(topicId).find(x => x.cls === cls) || null : null;
}

/**
 * Солісти зон: до 2 колонок кадру, що найбільше відхиляються від медіани кадру,
 * не ближче ніж SOLO_MIN_GAP зон одна від одної. prev — колонки попереднього такту (щоб соліст не «стрибав»).
 */
export function pickSoloZones(contour, pol = 1, prev = []) {
  const vals = contour.filter(v => v !== null).sort((a, b) => a - b);
  if (vals.length < 6) return [];
  const med = vals[Math.floor(vals.length / 2)];
  const cand = [];
  contour.forEach((v, col) => {
    if (v === null) return;
    const dev = Math.abs(v - med);
    const keep = prev.some(p => Math.abs(p - col) <= 1) ? 0.08 : 0;
    if (dev + keep >= 0.22) cand.push({ col, value: orient(v, pol), score: dev + keep });
  });
  cand.sort((a, b) => b.score - a.score || a.col - b.col);
  const out = [];
  for (const c of cand) {
    if (out.length >= FOREGROUND_MAX - 1) break;
    if (out.every(o => Math.abs(o.col - c.col) >= SOLO_MIN_GAP)) out.push({ col: c.col, value: c.value });
  }
  return out;
}
