// Бібліотека звуків (етап 11): реєстр інструментів.
//   registerInstrument({ id, family, kind: "sample" | "synth", range: [lo, hi], tags, label, fallback, load })
// Семпли вантажаться ліниво — тема/стиль тягне тільки своє; без інтернету (або без файлів) грає
// запасний синтезатор (fallback). Синтезатори працюють завжди.
import { INSTRUMENT_LABEL, synthNames } from "../instruments.js";
import { SAMPLE_SETS, loadSamples } from "../samples.js";

const LIB = new Map();

export function registerInstrument(def) {
  if (!def.id || !def.kind) throw new Error("інструмент: потрібні id і kind");
  LIB.set(def.id, { family: "other", range: [24, 108], tags: [], label: INSTRUMENT_LABEL[def.id] || def.id, ...def });
}
export const listInstruments = () => [...LIB.values()];
export const getInstrument = id => LIB.get(id);
export const families = () => [...new Set(listInstruments().map(i => i.family))];

/** Завантажити семпли для набору інструментів (лише тих, що мають kind:"sample"). */
export function loadFor(ctx, ids, onProgress) {
  // інструмент-«обробка» семплів іншого (feltpiano → piano) тягне їхні семпли
  const want = [...new Set(ids.map(id => LIB.get(id)?.loads || id))].filter(id => LIB.get(id)?.kind === "sample");
  return loadSamples(ctx, want, onProgress);
}

/* ---------------- семпли (CC-BY 3.0, nbrosowsky/tonejs-instruments) ---------------- */
const SAMPLES = [
  ["piano", "keys", [36, 96], ["тепле", "чітке"], "piano"],
  ["violin", "strings", [55, 100], ["спів", "легато"], "violin"],
  ["contrabass", "bass", [28, 55], ["низ", "піцикато"], "contrabass"],
  ["flute", "woodwind", [60, 96], ["повітря", "легке"], "flute"],
  ["harp", "plucked", [36, 96], ["арпеджіо", "прозоре"], "harp"],
  ["horn", "brass", [36, 77], ["тепле", "благородне"], "horn"],
  ["tuba", "brass", [26, 55], ["важке", "низ"], "tuba"],
  ["trombone", "brass", [38, 72], ["потужне"], "brass"],
  ["trumpet", "brass", [52, 84], ["яскраве", "сигнал"], "brass"],
  ["saxophone", "woodwind", [49, 80], ["джаз", "тепле"], "clarinet"],
  ["organ", "keys", [36, 84], ["урочисте", "тривале"], "organ"],
  ["harmonium", "keys", [48, 84], ["тривале", "м'яке"], "organ"],
  ["xylophone", "mallets", [67, 100], ["дзвінке", "коротке"], "marimba"],
  ["guitar", "plucked", [40, 76], ["акустичне", "щипкове"], "harp"],
  ["eguitar", "plucked", [40, 81], ["електричне"], "pizz"],
];
for (const [id, family, range, tags, fallback] of SAMPLES)
  if (SAMPLE_SETS[id]) registerInstrument({ id, family, kind: "sample", range, tags, fallback, notes: SAMPLE_SETS[id] });

/* ---------------- синтезатори (Web Audio, завжди доступні) ---------------- */
const SYNTHS = {
  strings: ["strings", [40, 88]], cello: ["strings", [36, 72]], tremolo: ["strings", [36, 88]], pizz: ["strings", [36, 84]], harmonics: ["strings", [60, 100]],
  drone: ["pads", [24, 60]], warmpad: ["pads", [36, 84]], glasspad: ["pads", [48, 96]], choir: ["voice", [48, 79]],
  subbass: ["bass", [24, 48]], clarinet: ["woodwind", [50, 89]], bassoon: ["woodwind", [34, 72]],
  celesta: ["mallets", [60, 108]], glockenspiel: ["mallets", [72, 108]], bells: ["mallets", [60, 100]], fmbell: ["mallets", [55, 100]],
  glass: ["mallets", [60, 100]], marimba: ["mallets", [45, 96]], kalimba: ["mallets", [55, 91]], handpan: ["mallets", [48, 79]],
  brass: ["brass", [45, 79]], lead: ["electronic", [55, 91]], pluck: ["electronic", [45, 91]],
  thunder: ["fx", [20, 40]], swell: ["fx", [0, 127]],
  wind: ["textures", [0, 127]], rain: ["textures", [0, 127]], waves: ["textures", [0, 127]], crackle: ["textures", [0, 127]], air: ["textures", [0, 127]], granular: ["textures", [0, 127]],
  feltpiano: ["keys", [36, 96]],
  shaker: ["perc", [0, 127]], kick: ["perc", [0, 127]], snare: ["perc", [0, 127]], timpani: ["perc", [36, 55]],
  cymbal: ["perc", [0, 127]], kick808: ["perc", [0, 127]], clap: ["perc", [0, 127]], hihat: ["perc", [0, 127]], tom: ["perc", [36, 60]],
  woodblock: ["perc", [0, 127]], stone: ["perc", [0, 127]], waterdrop: ["perc", [0, 127]], logdrum: ["perc", [36, 60]], softkick: ["perc", [0, 127]], brush: ["perc", [0, 127]],
};
const known = new Set(synthNames());
for (const [id, [family, range]] of Object.entries(SYNTHS))
  if (known.has(id) && !LIB.has(id)) registerInstrument({ id, family, kind: "synth", range, ...(id === "feltpiano" ? { loads: "piano", tags: ["м'яке", "приглушене"] } : {}) });
