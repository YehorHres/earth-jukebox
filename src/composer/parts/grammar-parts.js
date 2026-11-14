// Партії граматики звуку (v5-A): голос даних, солісти зон, точка відліку, тіки часу, ерікони.
// Правила однакові для всіх тем (src/grammar.js); тема дає лише колір тембру й набір знаків.
import { snapToMode } from "../theory.js";
import { valueToMidi, voiceColor, earconFor, polarity, REF_INTRO, DEFAULT_TICK } from "../../grammar.js";

const pol = meta => (meta.polarity ?? polarity(null));

export const dataVoice = {
  id: "dataVoice", grammar: true,
  label: "Голос даних",
  role: "Говорить головною величиною: більше → вище. Завжди на першому плані; панорама — де на карті зосереджені дані",
  active: () => true,
  render(ctx, out) {
    const { bar, bars, b, meter, h, state, meta } = ctx, p = bar.params;
    const v0 = p.value ?? 0.5, v1 = bars[b + 1]?.params.value ?? v0;
    // швидкість змін → густота ритму: сильні долі → усі долі → долі з половинками
    const d = p.density ?? 0.4;
    let pos = d < 0.35 ? meter.strong : meter.beats;
    if (d >= 0.7) pos = [...new Set(meter.beats.flatMap((s, k) => [s, s + Math.floor(((meter.beats[k + 1] ?? meter.steps) - s) / 2)]))];
    const stepDur = bar.dur / meter.steps, color = voiceColor(meta.topic);
    pos.forEach((s, k) => {
      const t = bar.t0 + s * stepDur;
      if (t < REF_INTRO + 0.1) return;                       // спершу — референсний тон наодинці
      const v = v0 + (v1 - v0) * (s / meter.steps);
      const midi = snapToMode(Math.round(valueToMidi(v)), h.root, h.mode);
      const next = pos[k + 1] ?? meter.steps;
      out.push({ t, midi, dur: (next - s) * stepDur * 0.96, vel: Math.min(1, 0.8 + 0.18 * (p.energy ?? 0.5)), pan: (p.pan || 0) * 0.5,
        from: state.last, color, value: v, legato: true, fixed: true });
      state.last = midi;
    });
  },
};

export const soloists = {
  id: "soloists", grammar: true,
  label: "Солісти зон",
  role: "До двох зон карти, що найбільше відрізняються від решти: вище — більше; панорама — де зона (захід ліворуч, схід праворуч)",
  active: (o, ctx) => o > 0.45 && ctx.bar.section !== "intro" && (ctx.bar.params.soloZones?.length || 0) > 0,
  render(ctx, out) {
    const { bar, meter, h, instr } = ctx, stepDur = bar.dur / meter.steps;
    const timbres = [instr.counter || "horn", instr.arp || "harp"];
    const at = meter.beats.length > 2 ? [meter.beats[1], meter.beats[3] ?? meter.beats[2]] : [meter.beats[1] ?? Math.floor(meter.steps / 2)];
    bar.params.soloZones.forEach((z, k) => {
      // октавою нижче за голос даних — не перекривають його
      const midi = snapToMode(Math.round(valueToMidi(z.value)) - 12, h.root, h.mode);
      for (const s of at) out.push({ inst: timbres[k], t: bar.t0 + (s + k) * stepDur, midi, dur: stepDur * 3, vel: 0.55, pan: -0.9 + 1.8 * z.col / 15, zone: z.col, solo: k });
    });
  },
};

export const reference = {
  id: "reference", grammar: true,
  label: "Точка відліку",
  role: "Референсний тон: так звучить середнє значення за все відео. На початку — 1–2 с, далі — тихий дрон-орієнтир",
  active: () => true,
  render(ctx, out) {
    const { bar, b, h, meta, state } = ctx;
    if (state.midi === undefined) state.midi = snapToMode(Math.round(valueToMidi(meta.reference?.value ?? 0.5)), h.root, h.mode);
    if (b === 0) out.push({ t: 0, midi: state.midi, dur: REF_INTRO, vel: 0.9, pan: 0, fixed: true, ref: "intro" });
    const t = b === 0 ? REF_INTRO + 0.1 : bar.t0;
    out.push({ t, midi: state.midi, dur: bar.t0 + bar.dur - t, vel: 0.14, pan: 0, fixed: true, ref: "drone" });
  },
};

export const ticks = {
  id: "ticks", grammar: true,
  label: "Тіки шкали часу",
  role: "Дуже тихий клік на кожну одиницю часу (або кожні 10 с), сильніший — на кожен 4-й чи 12-й",
  active: () => true,
  render(ctx, out) {
    const { bar, meta } = ctx, tk = meta.tick || DEFAULT_TICK;
    for (let k = Math.max(1, Math.ceil(bar.t0 / tk.seconds - 1e-9)); k * tk.seconds < bar.t0 + bar.dur - 1e-9; k++) {
      const strong = k % tk.strong === 0;
      out.push({ t: k * tk.seconds, midi: 0, dur: 0.05, vel: strong ? 0.8 : 0.45, pan: 0, strong, fixed: true });
    }
  },
};

export const earcons = {
  id: "earcons", grammar: true,
  label: "Ерікони подій",
  role: "Фіксований короткий звук-знак теми на кожну подію (одна подія — один знак), точно в момент події",
  active: (o, ctx) => ctx.bar.events.length > 0,
  render(ctx, out) {
    const { bar, meta } = ctx;
    for (const e of bar.events) {
      const ec = earconFor(meta.topic, e, pol(meta));
      if (ec) out.push({ t: e.time, midi: 0, dur: ec.spec.dur, vel: 0.9, pan: 0, ec: ec.spec, earcon: ec.id, eventTime: e.time, fixed: true });
    }
  },
};

export const GRAMMAR_PARTS = [dataVoice, soloists, reference, ticks, earcons];
