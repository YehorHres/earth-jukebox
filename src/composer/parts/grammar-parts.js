// Партії граматики звуку (v5-A): голос даних, солісти зон, точка відліку, тіки часу, ерікони.
// Правила однакові для всіх тем (src/grammar.js); тема дає лише колір тембру й набір знаків.
import { snapToMode, stepInMode } from "../theory.js";
import { chordPcs, nearest } from "./common.js";
import { valueToMidi, voiceOf, motifFor, earconFor, polarity, REF_INTRO, DEFAULT_TICK } from "../../grammar.js";

const pol = meta => (meta.polarity ?? polarity(null));

/** Тембри солістів зон: не такі, як у контрмелодії й арпеджіо, і різні між собою. */
export const soloTimbres = instr => [...new Set([instr.melody, "clarinet", "flute", "harp", "cello"])].filter(x => x && x !== instr.counter && x !== instr.arp && x !== instr.dataVoice).slice(0, 2);

// Голос даних = мелодія треку (v6): МОТИВ теми, що повторюється й розвивається. Дані керують транспозицією мотиву
// (значення ↑ → мотив вище), густотою ритму (зміни ↑ → дрібніші тривалості), подвоєннями (кульмінація, тепле / холодне).
// Сольфеджіо (етап 16) збережено: діатоніка; сильні долі — звуки акорду; слабкі — поступовий рух; стрибок понад кварту —
// лише на звук акорду й з поверненням кроком; фрази 4 + 4: напівкаденція (V) і повна (V → I); остання нота — тоніка.
// Варіації: такти розділу — мотив, мотив (секвенція за даними), обернення («відповідь»), орнамент; однаково — не більше 2 разів поспіль.
export const dataVoice = {
  id: "dataVoice", grammar: true,
  label: "Голос даних",
  role: "Мелодія: мотив теми справжнім інструментом; більше → мотив вище, швидші зміни → дрібніший ритм; у кульмінації — подвоєння. Панорама — де на карті зосереджені дані",
  active: () => true,
  render(ctx, out) {
    const { bar, bars, b, meter, h, state, meta } = ctx, p = bar.params;
    const voice = voiceOf(meta.topic), motif = motifFor(meta.topic, meter, meta);
    const v0 = p.value ?? 0.5, v1 = bars[b + 1]?.params.value ?? v0;
    const cadence = h.cadence || null;
    if (p.dark && !cadence) { state.sig = null; return; }    // нічна карта: темрява — тиша
    // варіант мотиву за місцем у розділі: A, A, обернення, орнамент; густота ритму — від швидкості змін
    if (bar.sectionStart) state.k = 0;
    const k = (state.k = (state.k ?? 0) + 1) - 1, variant = [0, 0, 1, 2][k % 4];
    const d = p.density ?? 0.4, onBeat = s => meter.beats.includes(s);
    let cells = motif.notes.map(([s, deg]) => [s, variant === 1 ? -deg : deg]);
    if (d < 0.35) { const c = cells.filter(([s]) => onBeat(s)); cells = c.length >= 2 ? c : cells.filter((_, i) => i % 2 === 0); }
    if (d >= 0.7 || variant === 2) {                         // дрібніші тривалості: прохідні ноти між нотами мотиву
      const extra = [];
      cells.forEach(([s, deg], i) => { const ns = cells[i + 1]?.[0] ?? meter.steps, nd = cells[i + 1]?.[1] ?? deg;
        if (ns - s >= 4 && (d >= 0.7 || i % 2 === 0)) extra.push([s + 2 * Math.floor((ns - s) / 4), nd === deg ? deg + 1 : Math.round((deg + nd) / 2 + 0.01)]); });
      cells = [...cells, ...extra].sort((x, y) => x[0] - y[0]);
    }
    if (cadence === "final") cells = [[0, 0]];
    else if (cadence) {                                    // каденція: коротко → довга нота → подих
      const mid = meter.strong[1] ?? meter.beats[Math.ceil(meter.beats.length / 2)] ?? meter.beats[1] ?? 0;
      cells = cells.filter(([s]) => s < mid).slice(0, 3).concat([[mid, 0]]);
    }
    const stepDur = bar.dur / meter.steps;
    const [LO, HI] = [voice.range[0] - 2, voice.range[1] + 2];
    const triad = chordPcs(h, { max: 3 }), tonicPc = ((h.root % 12) + 12) % 12;
    const near = (pcs, x) => pcs.map(pc => nearest(pc, Math.round(x), LO, HI)).sort((m, q) => Math.abs(m - x) - Math.abs(q - x))[0];
    // звук акорду для сильної долі: у межах ~терції від цілі, найближчий до попередньої ноти (голосоведення)
    const chordNear = (x, prev) => { const c = triad.map(pc => nearest(pc, Math.round(x), LO, HI)).filter(m => Math.abs(m - x) <= 3.5);
      return prev === undefined || !c.length ? near(triad, x) : c.sort((m, q) => Math.abs(m - prev) - Math.abs(q - prev) || Math.abs(m - x) - Math.abs(q - x))[0]; };
    const degShift = (m, deg) => { let x = snapToMode(Math.round(m), h.root, h.mode); for (let i = 0; i < Math.abs(deg); i++) x = stepInMode(x, Math.sign(deg), h.root, h.mode); return x; };
    // артикуляція з даних: легато ↔ стакато (швидкість змін; подія < 5 кадрів), крещендо ← тренд, акцент ← подія
    const legato = !p.staccato && (p.articulation ?? 0.3) < 0.55;
    const swell = ((p.dynamics ?? 0.5) - 0.5) * 2;
    const evSteps = bar.events.map(e => e.offset * meter.steps);
    const drive = p.drive ?? p.energy ?? 0.5, climax = bar.section === "climax";
    // подвоєння: кульмінація / пік енергії — другий інструмент і октава; тепле / холодне — шари теми
    const layers = [];
    if (climax || drive > 0.8) { layers.push({ inst: voice.double[0], shift: voice.double[1], gain: 0.6 }); if (voice.range[1] + 12 <= 100 && voice.double[1] !== 12) layers.push({ inst: voice.inst, shift: 12, gain: 0.35 }); }
    else if (voice.warm && v0 > 0.66) layers.push({ inst: voice.warm[0], shift: voice.warm[1], gain: 0.45 });
    else if (voice.cold && v0 < 0.34) layers.push({ inst: voice.cold[0], shift: voice.cold[1], gain: 0.55 });
    const lp = voice.coldLp && v0 < 0.4 && !climax ? Math.round(1100 + 9000 * v0) : undefined;
    const made = [];
    cells.forEach(([s, deg], k2) => {
      const t = bar.t0 + s * stepDur;
      if (t < REF_INTRO + 0.1) return;                       // спершу — референсний тон наодинці
      const v = v0 + (v1 - v0) * (s / meter.steps), anchor = valueToMidi(v, voice.range), prev = state.last;
      const target = deg ? Math.max(LO, Math.min(HI, degShift(anchor, deg))) : anchor;
      const end = !!cadence && k2 === cells.length - 1, strong = meter.strong.includes(s);
      let midi, rule;
      if (end) {
        midi = near(triad, target); rule = "cadence";
        if (cadence !== "half") { const ton = near([tonicPc], target); if (cadence === "final" || Math.abs(ton - target) <= 3) midi = ton; }
      } else if (prev === undefined || strong) { midi = chordNear(target, prev); rule = "chord"; }
      else if (state.recover) { midi = stepInMode(prev, state.recover, h.root, h.mode); rule = "recover"; }
      else {
        midi = snapToMode(Math.round(target), h.root, h.mode); rule = "motif";
        const diff = midi - prev;
        if (Math.abs(diff) > 5) { midi = near(triad, target); rule = "leap"; }
        else if (Math.abs(diff) > 2) midi = stepInMode(prev, Math.sign(diff), h.root, h.mode);
      }
      state.recover = prev !== undefined && !end && Math.abs(midi - prev) > 5 ? -Math.sign(midi - prev) : 0;
      const next = cells[k2 + 1]?.[0] ?? meter.steps, gap = (next - s) * stepDur;
      const accent = evSteps.some(x => x >= s && x < next);
      const vel = (0.5 + 0.45 * drive) * (1 + 0.2 * swell * (2 * s / meter.steps - 1)) * (accent ? 1.2 : 1);
      let dur = cadence === "final" ? bar.dur * 0.95 : end ? (meter.steps - s) * stepDur * 0.7 : gap * (legato ? 0.96 : 0.45);
      if (voice.short && cadence !== "final") dur = Math.min(dur, 0.4);
      const n = { t, midi, dur, vel: Math.max(0.3, Math.min(1, vel)), pan: (p.pan || 0) * 0.8, attack: 0.03,
        value: v, legato, fixed: true, rule, strong, accent, step: s, motif: motif.id, variant,
        cadence: end ? cadence : undefined, fade: cadence === "final" };
      if (lp) n.lp = lp;
      made.push(n);
      state.last = midi;
    });
    // мотив не звучить однаково більше 2 разів поспіль: далі — варіація інструментом (подвоєння)
    const sigOf = ls => made.map(n => `${n.step}:${n.midi}`).join(",") + "|" + ls.map(l => l.inst + l.shift).join("+") + "|" + h.chords[0].chord.degree;
    let sig = sigOf(layers);
    state.run = sig === state.sig ? (state.run || 1) + 1 : 1;
    if (state.run > 2 && made.length && cadence !== "final") {
      const alt = layers.some(l => l.inst === voice.double[0]) ? [] : [...layers, { inst: voice.double[0], shift: voice.double[1], gain: 0.5 }];
      layers.length = 0; layers.push(...alt);
      sig = sigOf(layers); state.run = 1;
    }
    state.sig = sig;
    for (const n of made) { if (layers.length) n.layers = layers; n.sig = sig; out.push(n); }
  },
};

export const soloists = {
  id: "soloists", grammar: true,
  label: "Солісти зон",
  role: "До двох зон карти, що найбільше відрізняються від решти: вище — більше; панорама — де зона (захід ліворуч, схід праворуч)",
  active: (o, ctx) => o > 0.45 && ctx.bar.section !== "intro" && (ctx.bar.params.soloZones?.length || 0) > 0,
  render(ctx, out) {
    const { bar, meter, h, instr, meta } = ctx, stepDur = bar.dur / meter.steps, range = voiceOf(meta.topic).range;
    const timbres = soloTimbres(instr);
    const at = meter.beats.length > 2 ? [meter.beats[1], meter.beats[3] ?? meter.beats[2]] : [meter.beats[1] ?? Math.floor(meter.steps / 2)];
    bar.params.soloZones.forEach((z, k) => {
      // октавою нижче за голос даних — не перекривають його
      const midi = snapToMode(Math.round(valueToMidi(z.value, range)) - (range[0] >= 58 ? 12 : 0), h.root, h.mode);
      for (const s of at) out.push({ inst: timbres[k], t: bar.t0 + (s + k) * stepDur, midi, dur: stepDur * 3, vel: 0.55, pan: -0.9 + 1.8 * z.col / 15, zone: z.col, solo: k });
    });
  },
};

export const reference = {
  id: "reference", grammar: true,
  label: "Точка відліку",
  role: "Референсний тон: так звучить середнє значення за все відео — 1–2 с на початку треку (дрон-орієнтир — лише як опція)",
  active: () => true,
  render(ctx, out) {
    const { bar, b, h, meta, state } = ctx;
    if (state.midi === undefined) state.midi = snapToMode(Math.round(valueToMidi(meta.reference?.value ?? 0.5, voiceOf(meta.topic).range)), h.root, h.mode);
    if (b === 0) out.push({ t: 0, midi: state.midi, dur: REF_INTRO, vel: 0.6, pan: 0, fixed: true, ref: "intro" });
    if (!ctx.opts?.drone) return;                          // v6: дрон-орієнтир вимкнено за замовчуванням
    const t = b === 0 ? REF_INTRO + 0.1 : bar.t0;
    out.push({ t, midi: state.midi, dur: bar.t0 + bar.dur - t, vel: 0.14, pan: 0, fixed: true, ref: "drone" });
  },
};

export const ticks = {
  id: "ticks", grammar: true,
  label: "Тіки шкали часу",
  role: "Опція (вимкнено за замовчуванням): дуже тихий клік на кожну одиницю часу (або кожні 10 с), сильніший — на кожен 4-й чи 12-й",
  active: (o, ctx) => !!ctx.opts?.ticks,
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
      if (ec) out.push({ t: e.time, midi: 0, dur: ec.spec.dur, vel: 0.9, pan: e.col !== undefined ? -0.85 + 1.7 * e.col / 15 : 0, ec: ec.spec, earcon: ec.id, eventTime: e.time, fixed: true });
    }
  },
};

// Другий голос (блок F): друга лінія графіка — нижче за голос даних, іншим тембром, праворуч. Звучить лише коли є params.value2.
export const secondVoice = {
  id: "secondVoice", grammar: true,
  label: "Другий голос (друга лінія графіка)",
  role: "Друга лінія графіка: вища лінія — вища нота; інший тембр, октавою нижче, у правому вусі",
  active: (o, ctx) => ctx.bar.params.value2 !== undefined,
  render(ctx, out) {
    const { bar, bars, b, meter, h, meta, instr } = ctx, range = voiceOf(meta.topic).range;
    const v0 = bar.params.value2, v1 = bars[b + 1]?.params.value2 ?? v0, half = meter.steps / 2, stepDur = bar.dur / meter.steps;
    const inst = soloTimbres(instr)[1] || soloTimbres(instr)[0] || "clarinet";
    [0, half].forEach((s, k) => out.push({ inst, t: bar.t0 + s * stepDur, midi: snapToMode(Math.round(valueToMidi(k ? (v0 + v1) / 2 : v0, range)) - 12, h.root, h.mode), dur: half * stepDur * 0.95, vel: 0.6, pan: 0.6, line: 2 }));
  },
};

export const GRAMMAR_PARTS = [dataVoice, soloists, reference, ticks, earcons, secondVoice];
