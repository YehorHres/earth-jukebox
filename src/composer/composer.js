// Шар 3 — композитор. Читає ТІЛЬКИ результат шару 2 (мапінг) і пише партитуру:
// score = { bpm, barDur, duration, key, meter, harmony, parts: [{ id, label, instrument, role }],
//           notes: [{ part, inst, t, midi, dur, vel, pan }], bars: [{ active: [partId], why }], why }
// Тембр = тема (soundProfile з мапінгу), ноти = дані. Дані керують музичними рішеннями, а не окремими нотами.
import { makeRng } from "../util/rng.js";
import { planHarmony } from "./harmony.js";
import { humanize } from "./humanize.js";
import { meterOf } from "./meter.js";
import { kitOf } from "../audio/library/kits.js";
import bass from "./parts/bass.js";
import pad from "./parts/pad.js";
import arp from "./parts/arp.js";
import drums from "./parts/drums.js";
import melody from "./parts/melody.js";
import counter from "./parts/counter.js";
import accents from "./parts/accents.js";
import stars from "./parts/stars.js";
import texture from "./parts/texture.js";
import { colorByTopic } from "./topic-color.js";
import { GRAMMAR_PARTS, soloTimbres } from "./parts/grammar-parts.js";
import { UPLOAD_PARTS } from "./parts/upload-parts.js";
import { LEAD_PARTS, FOREGROUND_MAX, earconsFor, partPriority, PARTS_MAX, SIGNAL_PARTS, partsCap, voiceOf, motifFor } from "../grammar.js";

// порядок = номери клавіш 1–9 для mute/solo
export const PARTS = [pad, bass, arp, drums, melody, counter, accents, stars, texture];

/** Додати партію — без зміни решти. */
export function registerPart(part, index = PARTS.length) { if (!PARTS.some(p => p.id === part.id)) PARTS.splice(index, 0, part); }

// нейтральний оркестр (тема generic / не вказана)
export const DEFAULT_INSTRUMENTS = { dataVoice: "voice", reference: "reftone", ticks: "tick", earcons: "earcon", pad: "strings", bass: "contrabass", arp: "piano", drums: "perc", melody: "violin", counter: "horn", accents: "bells", stars: "celesta", texture: "air" };
const DEFAULT_PARTS = ["pad", "bass", "arp", "drums", "melody", "counter", "accents"];

/**
 * @param {object} opts { seed, style, grammar } — style (етап 11) перекриває лише інструменти партій;
 *   grammar: false — без партій граматики звуку (голос даних, солісти, точка відліку, тіки, ерікони);
 *   drone / ticks (v6, вимкнено за замовчуванням) — дрон-орієнтир і тіки шкали часу
 */
export function compose(mapping, { seed = "earth-jukebox", style = null, grammar = true, drone = false, ticks = false } = {}) {
  const rng = makeRng(seed);
  const { bars, meta } = mapping;
  const sp = meta.soundProfile || {};
  const meter = meta.meter || meterOf("4/4");
  const harmony = planHarmony(mapping, rng);
  const instr = { ...DEFAULT_INSTRUMENTS, ...(sp.instruments || {}), ...(style?.instruments || {}) };
  const allowed = new Set(sp.parts || DEFAULT_PARTS);
  // v6: голос даних — справжній інструмент теми (стиль може перекрити)
  const voice = voiceOf(meta.topic);
  if (grammar && !style?.instruments?.dataVoice) instr.dataVoice = voice.inst;
  const opts = { drone, ticks }, lights = grammar && allowed.has("stars");
  // голос даних — перша партія (клавіша 1); решта партій граматики — після супроводу
  const G = grammar ? GRAMMAR_PARTS : [];
  // v10: партії завантажених відео (точки, «згоріло», соліст «де більше») — звучать лише коли мапер дав їм параметри
  const parts = [...G.slice(0, 1), ...PARTS.filter(p => allowed.has(p.id)), ...G.slice(1), ...(grammar ? UPLOAD_PARTS : [])];
  instr.soloists = soloTimbres(instr)[0];
  // етап 16: порядок, у якому партії отримують місце в такті, — за розділом форми (бюджет ≤ PARTS_MAX); без граматики — як раніше, без ліміту
  const orders = {};
  const orderFor = section => (orders[section] ||= (() => { const pr = partPriority(section), prio = id => { if (id === "drums" && meta.twoVoices) return 4.5; const i = pr.indexOf(id); return i < 0 ? 99 : i; };      // v10 §3: ударні пожежі — голос «горить зараз», завжди мають місце
    return [...parts].sort((x, y) => prio(x.id) - prio(y.id)); })());
  const kitId = style?.kit || sp.kit || "orchestral", kit = kitOf(kitId);
  const profile = { rhythm: sp.rhythm || "steady", fx: sp.fx || [], instruments: instr, kit };
  const notes = [];
  const state = Object.fromEntries(parts.map(p => [p.id, {}]));
  const barInfo = [];
  const beat = meta.barDur / meter.quarters;        // чверть

  for (let b = 0; b < bars.length; b++) {
    const bar = bars[b], o = bar.params.orchestration;
    const last = b === bars.length - 1, climax = grammar && bar.section === "climax";
    const ctx = { bar, h: harmony.bars[b], nextH: harmony.bars[b + 1], prevH: harmony.bars[b - 1], beat, rng, meta, meter, profile, instr, o, bars, b, grammar, opts };
    const active = [], lead = [];
    // вогники нічної карти — головна текстура: поза вступом і фіналом не забирають місце в супроводу
    const up = (bar.params.points !== undefined ? 1 : 0) + (bar.params.burned !== undefined ? 1 : 0) + (bar.params.hot && bar.section !== "intro" ? 1 : 0) + (meta.twoVoices && bar.section !== "intro" ? 1 : 0);      // точки, «згоріло» й соліст «де більше» не забирають місце в супроводу
    const cap = grammar ? Math.min(PARTS_MAX, partsCap(bar, last) + (lights && bar.section !== "intro" && !last ? 1 : 0) + up) : Infinity;
    const dark = lights && bar.params.dark && !last;
    let sustained = 0, signals = 0;
    for (const part of grammar ? orderFor(bar.section) : parts) {
      // кульмінація — повний склад: партії теми вступають незалежно від порога оркестровки
      if (!part.active(climax ? Math.max(o, 0.8) : o, ctx)) continue;
      if (dark && (part.id === "pad" || part.id === "bass" || part.id === "arp")) continue;   // темрява — тиша, а не гул
      const signal = SIGNAL_PARTS.includes(part.id);
      if (!signal && sustained >= Math.min(cap, PARTS_MAX - signals)) continue;      // місць немає — партія чекає
      const out = [];
      part.render({ ...ctx, state: state[part.id] }, out);
      if (!out.length) continue;                                                     // партія мовчить — місця не займає
      if (signal) signals++; else sustained++;
      (part.grammar ? lead : active).push(part.id);
      for (const n of out) {
        // ударні: роль (kick, snare, shaker, timpani, cymbal) → інструмент набору теми/стилю
        const inst = part.id === "drums" && kit[n.inst] ? kit[n.inst] : n.inst || instr[part.id];
        notes.push({ part: part.id, pan: bar.params.pan * 0.4, ...n, inst });
      }
    }
    // ліміт уваги: на першому плані ≤ 3 потоки даних (голос даних + до 2 солістів зон)
    const streams = (lead.includes("dataVoice") ? 1 : 0) + (lead.includes("soloists") ? Math.min(FOREGROUND_MAX - 1, bar.params.soloZones?.length || 0) : 0);
    barInfo.push({ active, lead, streams, count: sustained + signals, sustained, cap, why: harmony.bars[b].why, mode: harmony.bars[b].mode.label, level: harmony.bars[b].level });
  }

  // акорди підлаштовуються під регістр голосу даних: педи й арпеджіо не піднімаються до нього (октавою нижче)
  if (grammar && voice.range[0] >= 60) {
    const floor = [];
    for (const n of notes) if (n.part === "dataVoice") { const b = Math.min(bars.length - 1, Math.floor(n.t / meta.barDur + 1e-6)); floor[b] = Math.min(floor[b] ?? 127, n.midi); }
    for (const n of notes) if (n.part === "pad" || n.part === "arp") {
      const f = floor[Math.min(bars.length - 1, Math.floor(n.t / meta.barDur + 1e-6))];
      if (f !== undefined) while (n.midi > f - 3 && n.midi - 12 >= 36) n.midi -= 12;
    }
  }

  // етап 17: колір теми — як звучать ноти (фільтр, тремоло, панорама, легато), не які
  const colorWhy = colorByTopic(notes, { bars, barDur: meta.barDur, fx: profile.fx, barInfo });

  // «людське» виконання — окремо для кожної партії (seeded)
  const byPart = {};
  for (const n of notes) (byPart[n.part] ||= []).push(n);
  for (const id in byPart) if (id !== "texture") humanize(byPart[id], makeRng(`${seed}:${id}`), { timing: id === "pad" ? 0.006 : 0.012, vel: 0.1, swing: id === "arp" ? beat * 0.04 : 0 });
  notes.sort((a, b) => a.t - b.t);

  return {
    bpm: meta.bpm, barDur: meta.barDur, duration: bars.length * meta.barDur, topic: meta.topic, meter,
    key: harmony.keyName, harmony, notes,
    lead: grammar ? LEAD_PARTS : null,
    voice: grammar ? { instrument: instr.dataVoice, range: voice.range, motif: motifFor(meta.topic, meter).id } : null,
    // усі тембри треку (разом із шарами подвоєнь) — для завантаження семплів
    instruments: [...new Set(notes.flatMap(n => [n.inst, ...(n.layers || []).map(l => l.inst)]))],
    grammar: grammar ? { reference: meta.reference || null, tick: meta.tick || null, polarity: meta.polarity ?? 1, earcons: earconsFor(meta.topic) } : null, bars: barInfo, why: { ...(meta.why || {}), ...(colorWhy.length ? { color: colorWhy.join("; ") } : {}) }, kit: { id: kitId, label: kit.label }, style: style?.id || null,
    // партії, які справді звучать у цьому треку
    parts: parts.filter(p => byPart[p.id]).map(p => ({ id: p.id, label: p.label, instrument: instr[p.id] || "perc", role: p.role })),
  };
}
