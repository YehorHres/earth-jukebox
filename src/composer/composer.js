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

// порядок = номери клавіш 1–9 для mute/solo
export const PARTS = [pad, bass, arp, drums, melody, counter, accents, stars, texture];

/** Додати партію — без зміни решти. */
export function registerPart(part, index = PARTS.length) { if (!PARTS.some(p => p.id === part.id)) PARTS.splice(index, 0, part); }

// нейтральний оркестр (тема generic / не вказана)
export const DEFAULT_INSTRUMENTS = { pad: "strings", bass: "contrabass", arp: "piano", drums: "perc", melody: "violin", counter: "horn", accents: "bells", stars: "celesta", texture: "air" };
const DEFAULT_PARTS = ["pad", "bass", "arp", "drums", "melody", "counter", "accents"];

/**
 * @param {object} opts { seed, style } — style (етап 11) перекриває лише інструменти партій
 */
export function compose(mapping, { seed = "earth-jukebox", style = null } = {}) {
  const rng = makeRng(seed);
  const { bars, meta } = mapping;
  const sp = meta.soundProfile || {};
  const meter = meta.meter || meterOf("4/4");
  const harmony = planHarmony(mapping, rng);
  const instr = { ...DEFAULT_INSTRUMENTS, ...(sp.instruments || {}), ...(style?.instruments || {}) };
  const allowed = new Set(sp.parts || DEFAULT_PARTS);
  const parts = PARTS.filter(p => allowed.has(p.id));
  const kitId = style?.kit || sp.kit || "orchestral", kit = kitOf(kitId);
  const profile = { rhythm: sp.rhythm || "steady", fx: sp.fx || [], instruments: instr, kit };
  const notes = [];
  const state = Object.fromEntries(parts.map(p => [p.id, {}]));
  const barInfo = [];
  const beat = meta.barDur / meter.quarters;        // чверть

  for (let b = 0; b < bars.length; b++) {
    const bar = bars[b], o = bar.params.orchestration;
    const ctx = { bar, h: harmony.bars[b], nextH: harmony.bars[b + 1], prevH: harmony.bars[b - 1], beat, rng, meta, meter, profile, instr, o, bars, b };
    const active = [];
    for (const part of parts) {
      if (!part.active(o, ctx)) continue;
      active.push(part.id);
      const out = [];
      part.render({ ...ctx, state: state[part.id] }, out);
      for (const n of out) {
        // ударні: роль (kick, snare, shaker, timpani, cymbal) → інструмент набору теми/стилю
        const inst = part.id === "drums" && kit[n.inst] ? kit[n.inst] : n.inst || instr[part.id];
        notes.push({ part: part.id, pan: bar.params.pan * 0.4, ...n, inst });
      }
    }
    barInfo.push({ active, why: harmony.bars[b].why, mode: harmony.bars[b].mode.label, level: harmony.bars[b].level });
  }

  // «людське» виконання — окремо для кожної партії (seeded)
  const byPart = {};
  for (const n of notes) (byPart[n.part] ||= []).push(n);
  for (const id in byPart) if (id !== "texture") humanize(byPart[id], makeRng(`${seed}:${id}`), { timing: id === "pad" ? 0.006 : 0.012, vel: 0.1, swing: id === "arp" ? beat * 0.04 : 0 });
  notes.sort((a, b) => a.t - b.t);

  return {
    bpm: meta.bpm, barDur: meta.barDur, duration: bars.length * meta.barDur, topic: meta.topic, meter,
    key: harmony.keyName, harmony, notes, bars: barInfo, why: meta.why || {}, kit: { id: kitId, label: kit.label }, style: style?.id || null,
    // партії, які справді звучать у цьому треку
    parts: parts.filter(p => byPart[p.id]).map(p => ({ id: p.id, label: p.label, instrument: instr[p.id] || "perc", role: p.role })),
  };
}
