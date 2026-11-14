// Шар 3 — композитор. Читає ТІЛЬКИ результат шару 2 (мапінг) і пише партитуру:
// score = { bpm, barDur, duration, key, harmony, parts: [{ id, label, instrument, role }],
//           notes: [{ part, inst, t, midi, dur, vel, pan }], bars: [{ active: [partId], why }] }
// Дані керують музичними рішеннями (гармонія, партії, форма), а не окремими нотами.
import { makeRng } from "../util/rng.js";
import { planHarmony } from "./harmony.js";
import { humanize } from "./humanize.js";
import bass from "./parts/bass.js";
import pad from "./parts/pad.js";
import arp from "./parts/arp.js";
import drums from "./parts/drums.js";

export const PARTS = [pad, bass, arp, drums];

/** Додати партію (етап 5+: мелодія, контрмелодія, акценти…) — без зміни решти. */
export function registerPart(part, index = PARTS.length) { if (!PARTS.some(p => p.id === part.id)) PARTS.splice(index, 0, part); }

// інструменти партій під тип сцени (розділ 5–6 ТЗ)
export const INSTRUMENTS = {
  default: { pad: "strings", bass: "contrabass", arp: "piano", drums: "perc", melody: "violin", counter: "cello", accents: "bells", stars: "celesta" },
  heatmap: { pad: "strings", bass: "contrabass", arp: "piano", drums: "perc", melody: "violin", counter: "horn", accents: "bells", stars: "celesta" },
  nightlights: { pad: "strings", bass: "drone", arp: "harp", drums: "perc", melody: "flute", counter: "glockenspiel", accents: "celesta", stars: "celesta" },
  truecolor: { pad: "strings", bass: "cello", arp: "harp", drums: "perc", melody: "flute", counter: "horn", accents: "bells", stars: "celesta" },
};

export function compose(mapping, { seed = "earth-jukebox" } = {}) {
  const rng = makeRng(seed);
  const { bars, meta } = mapping;
  const scene = meta.preset;
  const harmony = planHarmony(mapping, rng);
  const instr = INSTRUMENTS[scene] || INSTRUMENTS.default;
  const notes = [];
  const state = Object.fromEntries(PARTS.map(p => [p.id, {}]));
  const barInfo = [];
  const beat = meta.barDur / 4;

  for (let b = 0; b < bars.length; b++) {
    const bar = bars[b], o = bar.params.orchestration;
    const ctx = { bar, h: harmony.bars[b], nextH: harmony.bars[b + 1], prevH: harmony.bars[b - 1], beat, rng, scene, meta, o, bars, b };
    const active = [];
    for (const part of PARTS) {
      if (!part.active(o, ctx)) continue;
      active.push(part.id);
      const out = [];
      part.render({ ...ctx, state: state[part.id] }, out);
      for (const n of out) notes.push({ part: part.id, inst: n.inst || instr[part.id], pan: bar.params.pan * 0.4, ...n });
    }
    barInfo.push({ active, why: harmony.bars[b].why, mode: harmony.bars[b].mode.label, level: harmony.bars[b].level });
  }

  // «людське» виконання — окремо для кожної партії (seeded)
  const byPart = {};
  for (const n of notes) (byPart[n.part] ||= []).push(n);
  for (const id in byPart) humanize(byPart[id], makeRng(`${seed}:${id}`), { timing: id === "pad" ? 0.006 : 0.012, vel: 0.1, swing: id === "arp" ? beat * 0.04 : 0 });
  notes.sort((a, b) => a.t - b.t);

  return {
    bpm: meta.bpm, barDur: meta.barDur, duration: bars.length * meta.barDur, scene,
    key: harmony.keyName, harmony, notes, bars: barInfo,
    parts: PARTS.map(p => ({ id: p.id, label: p.label, instrument: instr[p.id] || "perc", role: p.role })),
  };
}
