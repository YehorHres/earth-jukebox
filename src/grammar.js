// Єдина граматика звуку (v5, етап A): те саме в даних звучить ОДНАКОВО в усіх темах.
// «Вивчив раз — розумієш будь-яку карту». Таблицю показуємо в UI, README й аудіолегенді.
// Тема змінює лише тембр (колір голосу даних, знаки-ерікони), а не правила.

export const GRAMMAR = [
  { data: "Значення головної величини (більше / менше за змістом теми)", sound: "Висота голосу даних: більше → вище (мотив теми транспонується)", part: "dataVoice", data_en: "Value of the main quantity (more / less, by the topic's meaning)", sound_en: "Pitch of the data voice: more → higher (the topic motif is transposed)" },
  { data: "Площа / охоплення", sound: "Гучність (≈ 12 дБ) і кількість партій (2–3 → 6–7), ударні", part: "оркестровка", data_en: "Area / extent", sound_en: "Loudness (≈ 12 dB) and number of parts (2–3 → 6–7), drums" },
  { data: "Швидкість змін", sound: "Густота ритму й темп (темп — лише між фразами)", part: "ритм", data_en: "Speed of change", sound_en: "Rhythmic density and tempo (tempo changes only between phrases)" },
  { data: "Аномалія, рекорд, невизначеність", sound: "Напруга: дисонанс, тремоло, шорсткість", part: "гармонія", data_en: "Anomaly, record, uncertainty", sound_en: "Tension: dissonance, tremolo, roughness" },
  { data: "Дискретна подія (спалах, новий об'єкт, різкий стрибок)", sound: "Ерікон — фіксований короткий звук-знак теми", part: "earcons", data_en: "Discrete event (flash, new object, sudden jump)", sound_en: "Earcon — a fixed short sound sign of the topic" },
  { data: "Положення по горизонталі (захід ↔ схід, ліво ↔ право диска)", sound: "Панорама: ліве ↔ праве вухо", part: "панорама", data_en: "Horizontal position (west ↔ east, left ↔ right of the disc)", sound_en: "Panning: left ↔ right ear" },
  { data: "Положення по вертикалі", sound: "Висотою НЕ кодуємо (висота зайнята значенням) — повідомляємо голосом", part: "мовлення", data_en: "Vertical position", sound_en: "NOT encoded by pitch (pitch is taken by the value) — announced by voice" },
  { data: "Час відео", sound: "Час треку (опція: тихі «тіки» шкали часу)", part: "ticks", data_en: "Video time", sound_en: "Track time (option: quiet time-scale “ticks”)" },
];

/** Діапазон голосу даних (MIDI) за замовчуванням; у теми — свій, під її інструмент (voiceOf). */
export const VOICE_RANGE = [62, 86];
/** Одночасно на першому плані: голос даних + до 2 солістів зон. */
export const FOREGROUND_MAX = 3;
/** Мінімальна відстань між зонами солістів (із 16 колонок кадру). */
export const SOLO_MIN_GAP = 3;
/** v6: супровід НЕ приглушуємо; голос даних лише на +3…+4 дБ над ним (підбирає калібрування), виріз під голос ≤ 3 дБ. */
export const ACCOMP_DB = 0;
export const VOICE_LEAD_DB = 3.5;
export const VOICE_CUT = { f: 1200, q: 0.7, db: -2 };
/** Приглушення музики під час мовлення (≥ 10 дБ). */
export const DUCK_DB = -14;
/** Референсний тон на початку треку, с. Дрон-орієнтир і тіки шкали часу — лише як опція (compose({ drone, ticks })). */
export const REF_INTRO = 1.5;
/** Тіки шкали часу (опція): кожні 10 с, сильніший — кожен 4-й. */
export const DEFAULT_TICK = { seconds: 10, strong: 4, label: "10 секунд", label_en: "10 seconds" };

/** Партії граматики (не супровід). */
export const LEAD_PARTS = ["dataVoice", "soloists", "reference", "ticks", "earcons", "points", "burned", "hotZone"];

/** v6 — бюджет партій від даних: спокій 2–3 → пік 6–7; у вступі й в останньому такті ≤ 2 (+ короткі знаки). */
export const PARTS_MAX = 7;
export const INTRO_PARTS_MAX = 2;
export const SIGNAL_PARTS = ["earcons", "ticks", "reference"];
/** Хто отримує місце в такті: спершу дані й знаки (і вогники нічної карти), далі — супровід за розділом форми. */
const PART_HEAD = ["dataVoice", "reference", "earcons", "ticks", "stars", "points", "burned", "hotZone"];
const PART_BY_SECTION = {
  intro: ["pad", "texture", "bass", "arp"],
  build: ["pad", "bass", "drums", "arp", "counter", "soloists", "texture"],
  climax: ["bass", "pad", "drums", "counter", "arp", "soloists", "texture"],
  development: ["pad", "bass", "arp", "drums", "soloists", "texture", "counter"],
  resolution: ["pad", "arp", "bass", "texture", "soloists"],
  theme: ["pad", "bass", "arp", "drums", "soloists", "texture"],
};
export const partPriority = section => [...PART_HEAD, ...(PART_BY_SECTION[section] || PART_BY_SECTION.theme)];
/** Скільки партій (без знаків) дозволяють дані й форма: відносна енергія (drive) + частка зон, що змінюються; кульмінація — повний склад. */
export function partsCap(bar, last = false) {
  if (bar.section === "intro" || last) return INTRO_PARTS_MAX;
  if (bar.section === "climax") return PARTS_MAX;
  const p = bar.params, o = p.orchestration ?? 0.5, x = p.drive !== undefined ? 0.6 * p.drive + 0.4 * o : o, tu = p.tutti ?? 0.5;
  const c = 2 + Math.round(5 * x) + (tu > 0.6 ? 1 : tu < 0.15 ? -1 : 0);
  return Math.max(2, Math.min(PARTS_MAX, c));
}

/** Полярність: +1 — більше значення ознаки = «більше» за змістом теми; −1 — навпаки (moreMeans: "down"). */
export const polarity = topic => (topic?.moreMeans === "down" ? -1 : 1);
export const orient = (v, pol) => (pol < 0 ? 1 - v : v);
export const valueToMidi = (v, range = VOICE_RANGE) => range[0] + Math.max(0, Math.min(1, v)) * (range[1] - range[0]);

/**
 * v6: голос даних — СПРАВЖНІЙ інструмент теми (семпли; синтез — лише запасний, без семплів).
 * inst — тембр; range — регістр під інструмент; double — [інструмент, зсув] подвоєння в кульмінації;
 * warm / cold — шари для високих / низьких значень (океан: тепле — флейта вгорі, холодне — віолончель унизу й low-pass); short — короткі дзвінкі ноти.
 */
const VOICE = {
  "ocean-currents": { inst: "violin", range: [62, 86], double: ["flute", 12], warm: ["flute", 12], cold: ["cello", -12], coldLp: true },
  temperature: { inst: "piano", range: [60, 84], double: ["violin", 0] },
  storms: { inst: "trombone", range: [45, 67], double: ["horn", 0] },
  nightlights: { inst: "xylophone", range: [72, 96], double: ["piano", 0], short: true },
  co2: { inst: "horn", range: [50, 72], double: ["trumpet", 12] },
  ice: { inst: "piano", range: [67, 91], double: ["harp", 0] },
  fires: { inst: "saxophone", range: [55, 77], double: ["trumpet", 0] },
  precipitation: { inst: "harp", range: [60, 84], double: ["piano", 0] },
  vegetation: { inst: "flute", range: [64, 88], double: ["violin", 0] },
  clouds: { inst: "flute", range: [64, 88], double: ["harp", 0] },
  "sea-level": { inst: "violin", range: [58, 82], double: ["horn", -12] },
  ozone: { inst: "flute", range: [64, 88], double: ["harp", 0] },
  aerosols: { inst: "saxophone", range: [55, 77], double: ["piano", 0] },
};
export const voiceOf = topicId => VOICE[topicId] || { inst: "violin", range: VOICE_RANGE, double: ["flute", 12] };

/**
 * v6: мотив теми — 4–8 нот зі своїм ритмом та інтервалами: [крок такту (шістнадцяті), щабель ладу відносно опори].
 * Опору (транспозицію) дає значення даних; сильні долі підлаштовуються під акорд (тональна секвенція).
 */
const M = (id, steps, notes) => ({ id, steps, notes });
const MOTIFS = {
  "ocean-currents": M("хвиля", 12, [[0, 0], [4, 1], [6, 2], [8, 1], [10, 0]]),
  temperature: M("підйом", 16, [[0, 0], [4, 1], [6, 2], [8, 2], [12, 1], [14, 0]]),
  storms: M("фанфара бурі", 16, [[0, 0], [2, 0], [4, 1], [8, 2], [10, 1], [12, 0], [14, -1]]),
  nightlights: M("дзинь-дзелень", 16, [[0, 0], [2, 1], [4, 2], [6, 1], [8, 2], [12, 4]]),
  co2: M("подих", 16, [[0, 0], [6, 1], [8, 2], [14, 1]]),
  ice: M("крижинка", 12, [[0, 0], [4, 2], [6, 1], [8, 0]]),
  fires: M("язики полум'я", 20, [[0, 0], [2, 1], [4, 2], [8, 1], [12, 0], [14, 1], [16, 2]]),
};
const METER_MOTIFS = {
  16: M("крок 4/4", 16, [[0, 0], [4, 1], [8, 2], [10, 1], [12, 0]]),
  12: M("крок 3", 12, [[0, 0], [4, 1], [8, 2], [10, 1]]),
  20: M("крок 5/4", 20, [[0, 0], [4, 1], [8, 2], [12, 1], [16, 0]]),
};
/** Мотив теми під розмір такту (якщо розмір інший — запасний мотив цього розміру). */
export function motifFor(topicId, meter, meta = null) {
  if (meta?.motif && (!meter || meta.motif.steps === meter.steps)) return meta.motif;      // v10 §4: «відбиток» карти завантаженого відео
  const m = MOTIFS[topicId];
  if (m && (!meter || m.steps === meter.steps)) return m;
  return METER_MOTIFS[meter?.steps] || METER_MOTIFS[16];
}

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
/** Англійські назви й значення ериконів (id → [назва, що означає]) — лише тексти для інтерфейсу. */
export const EARCONS_EN = {
  jump: ["thud", "a sharp regime change"], up: ["rising signal", "a peak or record"], down: ["falling signal", "a dip or minimum"],
  gust: ["wind gust", "the storm intensifies"], calm: ["wind dies down", "the storm weakens"], lightning: ["lightning", "a sudden jump"],
  crack: ["crack", "the most ice"], drop: ["drop", "the least ice, melting"],
  spark: ["spark", "more lights"], fade: ["fade", "fewer lights"],
  flare: ["flare", "the most fires"], hiss: ["hiss", "the fire dies down"], crackle: ["crackle", "a sharp change"],
  puff: ["puff", "the most CO₂"], exhale: ["exhale", "the least CO₂"],
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
  // v10 §2: спалах блискавок (нові точки) — знак «блискавка» теми, якщо він у неї є
  if (e.flash) { const l = earconsFor(topicId).find(x => x.id === "lightning"); if (l) return l; }
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
