// Інструменти. Спершу — синтезатори з близьким тембром (працюють завжди, офлайн).
// Етап 6: якщо семпли завантажились — грає Sampler, інакше лишається синтезатор.
// Інтерфейс: play(engine, dest, note, t) де note = { midi, dur, vel, pan }.
import { topicSynths } from "./synths-topic.js";
import { grammarSynths } from "./synths-grammar.js";

export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export const INSTRUMENT_LABEL = {
  voice: "голос даних (колір — від теми)", reftone: "референсний тон", tick: "клік шкали часу", earcon: "звук-знак події",
  strings: "струнні (легато)", contrabass: "контрабас pizz.", cello: "віолончель", drone: "глибокий дрон", piano: "фортепіано",
  harp: "арфа", celesta: "челеста", glockenspiel: "глокеншпіль", bells: "дзвони", violin: "скрипка", flute: "флейта",
  subbass: "саб-бас", thunder: "грім", tuba: "туба", organ: "орган", choir: "хор", warmpad: "теплий пед", glasspad: "холодний (скляний) пед",
  tremolo: "тремоло струнних", pizz: "піцикато струнних", marimba: "маримба", kalimba: "калімба", glass: "скло", harmonics: "флажолети",
  fmbell: "FM-дзвони", feltpiano: "м'яке фортепіано (felt)", clarinet: "кларнет", bassoon: "фагот", snare: "малий барабан",
  wind: "вітер", rain: "дощ", waves: "хвилі", crackle: "тріск вогню", air: "повітря", granular: "гранулярна текстура",
  tuba: "туба", trombone: "тромбон", trumpet: "труба", saxophone: "саксофон", organ: "орган", harmonium: "фісгармонія",
  xylophone: "ксилофон", guitar: "акустична гітара", eguitar: "електрогітара", handpan: "ханпан", lead: "синт-лід", pluck: "синт-щипок",
  cymbal: "тарілка", kick808: "електронний бас-барабан", clap: "плеск", hihat: "хай-хет", tom: "том", woodblock: "дерев'яна коробочка",
  stone: "камінь", waterdrop: "крапля води", logdrum: "дерев'яний барабан", softkick: "м'який удар", brush: "щітка",
  horn: "валторна", brass: "брас-стаб", swell: "свел (як тарілка)", perc: "перкусія (шейкер, литаври)", shaker: "шейкер", kick: "м'який барабан", timpani: "литаври",
};

function out(eng, dest, t, pan) {
  const p = eng.ctx.createStereoPanner();
  p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan || 0)), t);
  p.connect(dest);
  return p;
}

/** ADSR-обвідна на GainNode. */
function env(ctx, t, { a = 0.01, d = 0.1, s = 0.7, r = 0.2, dur, peak }) {
  const g = ctx.createGain();
  const end = t + Math.max(dur, a + 0.01);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(peak * s, t + a, d / 3 + 1e-3);
  g.gain.setTargetAtTime(0.0001, end, r / 4 + 1e-3);
  return { g, stop: end + r * 1.6 };
}

function osc(ctx, type, freq, t, stop, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  o.start(t); o.stop(stop);
  return o;
}

function vibrato(ctx, target, t, stop, rate = 5.2, cents = 6, delay = 0.25) {
  const lfo = ctx.createOscillator(), depth = ctx.createGain();
  lfo.frequency.value = rate;
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(cents, t + delay + 0.3);
  lfo.connect(depth).connect(target.detune);
  lfo.start(t); lfo.stop(stop);
}

const SYNTH = {
  strings(eng, dest, n, t) {
    const ctx = eng.ctx, f = mtof(n.midi);
    const { g, stop } = env(ctx, t, { a: 0.45, d: 0.6, s: 0.85, r: 1.1, dur: n.dur, peak: 0.11 * n.vel });
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900 + 2200 * n.vel; lp.Q.value = 0.5;
    lp.connect(g).connect(out(eng, dest, t, n.pan));
    for (const det of [-8, 7]) { const o = osc(ctx, "sawtooth", f, t, stop, det); vibrato(ctx, o, t, stop, 4.8 + det * 0.02, 5, 0.4); o.connect(lp); }
  },
  cello(eng, dest, n, t) {
    const ctx = eng.ctx, f = mtof(n.midi);
    const { g, stop } = env(ctx, t, { a: 0.12, d: 0.4, s: 0.8, r: 0.5, dur: n.dur, peak: 0.2 * n.vel });
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400; lp.Q.value = 1.2;
    lp.connect(g).connect(out(eng, dest, t, n.pan));
    const o = osc(ctx, "sawtooth", f, t, stop); vibrato(ctx, o, t, stop, 5.5, 7, 0.2); o.connect(lp);
  },
  contrabass(eng, dest, n, t) {
    const ctx = eng.ctx, f = mtof(n.midi);
    const { g, stop } = env(ctx, t, { a: 0.008, d: 0.35, s: 0.25, r: 0.25, dur: n.dur, peak: 0.5 * n.vel });
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(350, t + 0.3);
    lp.connect(g).connect(out(eng, dest, t, n.pan));
    osc(ctx, "triangle", f, t, stop).connect(lp);
    const sub = osc(ctx, "sine", f, t, stop), sg = ctx.createGain(); sg.gain.value = 0.6; sub.connect(sg).connect(lp);
  },
  drone(eng, dest, n, t) {
    const ctx = eng.ctx, f = mtof(n.midi);
    const { g, stop } = env(ctx, t, { a: 1.2, d: 1, s: 0.9, r: 2.2, dur: n.dur, peak: 0.2 * n.vel });
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
    lp.connect(g).connect(out(eng, dest, t, n.pan));
    osc(ctx, "sine", f, t, stop).connect(lp);
    const o2 = osc(ctx, "triangle", f * 1.5, t, stop, 4), g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2).connect(lp);
    const o3 = osc(ctx, "sine", f * 2, t, stop), g3 = ctx.createGain(); g3.gain.value = 0.3; o3.connect(g3).connect(lp);   // октава вгору: дрон чути й на малих колонках
  },
  piano(eng, dest, n, t) {
    const ctx = eng.ctx, f = mtof(n.midi);
    const decay = Math.max(0.6, 3.2 - (n.midi - 48) * 0.04);
    const g = ctx.createGain(), peak = 0.22 * n.vel, stop = t + Math.min(decay, n.dur + 0.6) + 0.3;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.setTargetAtTime(0.0001, t + 0.004, decay / 4);
    g.gain.setTargetAtTime(0.0001, t + n.dur + 0.05, 0.12);  // відпускання клавіші
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(5000 * (0.5 + n.vel), t); lp.frequency.exponentialRampToValueAtTime(900, t + decay * 0.6);
    lp.connect(g).connect(out(eng, dest, t, n.pan));
    osc(ctx, "triangle", f, t, stop).connect(lp);
    const h2 = osc(ctx, "sine", f * 2, t, stop, 3), hg = ctx.createGain(); hg.gain.setValueAtTime(0.35, t); hg.gain.setTargetAtTime(0.0001, t, decay / 8); h2.connect(hg).connect(lp);
    const h3 = osc(ctx, "sine", f * 3.01, t, stop), hg3 = ctx.createGain(); hg3.gain.setValueAtTime(0.12, t); hg3.gain.setTargetAtTime(0.0001, t, decay / 12); h3.connect(hg3).connect(lp);
  },
  harp(eng, dest, n, t) {
    const ctx = eng.ctx, f = mtof(n.midi);
    const g = ctx.createGain(), peak = 0.24 * n.vel, stop = t + 1.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.003); g.gain.setTargetAtTime(0.0001, t + 0.003, 0.35);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(1200, t + 0.4);
    lp.connect(g).connect(out(eng, dest, t, n.pan));
    osc(ctx, "triangle", f, t, stop).connect(lp);
    const o2 = osc(ctx, "sine", f * 2, t, stop), g2 = ctx.createGain(); g2.gain.value = 0.2; o2.connect(g2).connect(lp);
  },
  celesta(eng, dest, n, t) { bell(eng, dest, n, t, [[1, 1], [4.0, 0.25], [9.2, 0.06]], 0.9, 0.17); },
  glockenspiel(eng, dest, n, t) { bell(eng, dest, { ...n, midi: n.midi + 12 }, t, [[1, 1], [2.76, 0.3], [5.4, 0.12]], 1.3, 0.13); },
  bells(eng, dest, n, t) { bell(eng, dest, n, t, [[1, 1], [2.0, 0.5], [2.76, 0.35], [5.4, 0.15], [8.9, 0.06]], 3.2, 0.16); },
  violin(eng, dest, n, t) {
    const ctx = eng.ctx, f = mtof(n.midi);
    const { g, stop } = env(ctx, t, { a: n.legato === false ? 0.03 : 0.09, d: 0.3, s: 0.85, r: 0.35, dur: n.dur, peak: 0.13 * n.vel });
    const bp = ctx.createBiquadFilter(); bp.type = "peaking"; bp.frequency.value = 2800; bp.gain.value = 6; bp.Q.value = 1.4;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200;
    bp.connect(lp).connect(g).connect(out(eng, dest, t, n.pan));
    const o = osc(ctx, "sawtooth", f, t, stop); vibrato(ctx, o, t, stop, 5.6, 9, 0.18); o.connect(bp);
  },
  flute(eng, dest, n, t) {
    const ctx = eng.ctx, f = mtof(n.midi);
    const { g, stop } = env(ctx, t, { a: 0.07, d: 0.2, s: 0.85, r: 0.25, dur: n.dur, peak: 0.2 * n.vel });
    g.connect(out(eng, dest, t, n.pan));
    const o = osc(ctx, "sine", f, t, stop); vibrato(ctx, o, t, stop, 5, 7, 0.25); o.connect(g);
    const o2 = osc(ctx, "triangle", f * 2, t, stop), g2 = ctx.createGain(); g2.gain.value = 0.12; o2.connect(g2).connect(g);
    // подих
    const nz = ctx.createBufferSource(); nz.buffer = eng.noise; nz.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 2; bp.Q.value = 3;
    const ng = ctx.createGain(); ng.gain.value = 0.05;
    nz.connect(bp).connect(ng).connect(g); nz.start(t, Math.random()); nz.stop(stop);
  },
  horn(eng, dest, n, t) {
    const ctx = eng.ctx, f = mtof(n.midi);
    const { g, stop } = env(ctx, t, { a: 0.07, d: 0.3, s: 0.8, r: 0.4, dur: n.dur, peak: 0.16 * n.vel });
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(700 + 900 * n.vel, t + 0.12);
    lp.connect(g).connect(out(eng, dest, t, n.pan));
    const o = osc(ctx, "sawtooth", f, t, stop); vibrato(ctx, o, t, stop, 4.5, 4, 0.4); o.connect(lp);
    const o2 = osc(ctx, "triangle", f, t, stop, -5); o2.connect(lp);
  },
  brass(eng, dest, n, t) {
    const ctx = eng.ctx, f = mtof(n.midi);
    const { g, stop } = env(ctx, t, { a: 0.02, d: 0.25, s: 0.4, r: 0.3, dur: n.dur, peak: 0.16 * n.vel });
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 2;
    lp.frequency.setValueAtTime(3500, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.35);
    lp.connect(g).connect(out(eng, dest, t, n.pan));
    for (const det of [-6, 6]) osc(ctx, "sawtooth", f, t, stop, det).connect(lp);
  },
  shaker(eng, dest, n, t) {
    const ctx = eng.ctx;
    const s = ctx.createBufferSource(); s.buffer = eng.noise;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12 * n.vel, t + 0.006); g.gain.setTargetAtTime(0.0001, t + 0.01, 0.025);
    s.connect(hp).connect(g).connect(out(eng, dest, t, (n.pan || 0) + 0.25));
    s.start(t, (t * 7.3) % 1.5); s.stop(t + 0.12);
  },
  swell(eng, dest, n, t) {
    // «тарілка-свел»: шум, що наростає до межі розділу
    const ctx = eng.ctx;
    const s = ctx.createBufferSource(); s.buffer = eng.noise; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "highpass"; bp.frequency.setValueAtTime(2500, t); bp.frequency.exponentialRampToValueAtTime(7000, t + n.dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * n.vel, t + n.dur); g.gain.setTargetAtTime(0.0001, t + n.dur, 0.06);
    s.connect(bp).connect(g).connect(out(eng, dest, t, 0.15));
    s.start(t, (t * 1.7) % 1); s.stop(t + n.dur + 0.4);
  },
  kick(eng, dest, n, t) {
    const ctx = eng.ctx;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.45 * n.vel, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.01, 0.09);
    o.connect(g).connect(out(eng, dest, t, 0)); o.start(t); o.stop(t + 0.5);
  },
  timpani(eng, dest, n, t) {
    const ctx = eng.ctx, f = mtof(n.midi);
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(f * 1.04, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * n.vel, t + 0.006); g.gain.setTargetAtTime(0.0001, t + 0.02, 0.35 * Math.min(1.5, n.dur + 0.3));
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 1.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    const nz = ctx.createBufferSource(); nz.buffer = eng.noise;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25 * n.vel, t); ng.gain.setTargetAtTime(0.0001, t, 0.03);
    const dst = out(eng, dest, t, -0.2);
    o.connect(g); o2.connect(g2).connect(g); g.connect(dst);
    nz.connect(lp).connect(ng).connect(dst);
    o.start(t); o.stop(t + 2); o2.start(t); o2.stop(t + 2); nz.start(t, (t * 3.1) % 1.5); nz.stop(t + 0.2);
  },
};

Object.assign(SYNTH, topicSynths({ out, env, osc, vibrato, mtof, bell }));
Object.assign(SYNTH, grammarSynths({ out, mtof }));

function bell(eng, dest, n, t, partials, decay, level) {
  const ctx = eng.ctx, f = mtof(n.midi), dst = out(eng, dest, t, n.pan);
  for (const [ratio, amp] of partials) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(level * amp * n.vel, t + 0.003);
    g.gain.setTargetAtTime(0.0001, t + 0.003, decay / (2 + ratio * 0.6));
    osc(ctx, "sine", f * ratio, t, t + decay * 2).connect(g).connect(dst);
  }
}

/* ---------- семпли (етап 6) ---------- */
const samplers = new Map();     // інструмент → { buffers: [{ midi, buffer }] }
export function registerSampler(inst, buffers) { samplers.set(inst, { buffers: buffers.sort((a, b) => a.midi - b.midi) }); }
export const hasSampler = inst => samplers.has(inst);

function playSample(eng, dest, n, t, s, inst) {
  const ctx = eng.ctx;
  let best = s.buffers[0];
  for (const b of s.buffers) if (Math.abs(b.midi - n.midi) < Math.abs(best.midi - n.midi)) best = b;
  const src = ctx.createBufferSource();
  src.buffer = best.buffer;
  src.playbackRate.value = Math.pow(2, (n.midi - best.midi) / 12);
  const g = ctx.createGain();
  const sustained = SUSTAINED.has(inst);
  const level = (SAMPLE_LEVEL[inst] ?? 0.5) * n.vel;
  const a = sustained ? (n.legato === false ? 0.03 : 0.12) : n.soft ? 0.035 : 0.002;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(level, t + a);
  const rel = sustained ? 0.35 : 0.6;
  g.gain.setTargetAtTime(0.0001, t + Math.max(n.dur, a + 0.02), rel / 3);
  src.connect(g).connect(out(eng, dest, t, n.pan));
  src.start(t);
  src.stop(t + Math.min(best.buffer.duration / src.playbackRate.value, n.dur + rel * 2.5) + 0.05);
}
// рівні вирівняно з синтезаторами (RMS однієї ноти, vel 0.6): заміна синтезатора на семпл не змінює баланс
export const SAMPLE_LEVEL = { piano: 0.37, harp: 0.47, violin: 0.39, contrabass: 0.82, flute: 0.5, horn: 0.48,
  tuba: 0.5, trombone: 0.25, trumpet: 0.25, saxophone: 0.3, organ: 0.25, harmonium: 0.29, xylophone: 0.69, guitar: 0.4, eguitar: 0.48 };
const SUSTAINED = new Set(["strings", "cello", "violin", "flute", "horn", "tuba", "trombone", "trumpet", "saxophone", "organ", "harmonium"]);

// запасний синтезатор для інструментів, що існують лише як семпли (офлайн / файлів немає)
export const FALLBACK = { tuba: "tuba", trombone: "brass", trumpet: "brass", saxophone: "clarinet", organ: "organ", harmonium: "organ",
  xylophone: "marimba", guitar: "harp", eguitar: "pizz" };

/** Зіграти ноту: семпл, якщо є (і для тривалої ноти семпл досить довгий), інакше синтезатор — музика ніколи не мовчить. */
export function playNote(eng, dest, inst, n, t) {
  // м'яке фортепіано (етап 17, лід): семпли фортепіано з low-pass і м'якою атакою
  if (inst === "feltpiano") { inst = "piano"; n = { ...n, lp: n.lp ?? 1500, soft: true }; }
  dest = shapeNote(eng, dest, n, t);
  const s = samplers.get(inst);
  if (s) {
    // тривала нота довша за семпл — синтезатор (без обриву звуку посеред ноти)
    const near = s.buffers.reduce((b, x) => (Math.abs(x.midi - n.midi) < Math.abs(b.midi - n.midi) ? x : b), s.buffers[0]);
    const len = near.buffer.duration / Math.pow(2, (n.midi - near.midi) / 12);
    if (!(SUSTAINED.has(inst) && n.dur > len * 0.95 && (SYNTH[inst] || SYNTH[FALLBACK[inst]]))) return playSample(eng, dest, n, t, s, inst);
  }
  (SYNTH[inst] || SYNTH[FALLBACK[inst]] || SYNTH.piano)(eng, dest, n, t);
}

/**
 * Обробка однієї ноти (етап 17): n.lp — low-pass (Гц: «закритий» тембр, прохолода, задуха);
 * n.flutter — тремоло гучності (Гц: нервові духові на поривах). Без полів — нота як була.
 */
function shapeNote(eng, dest, n, t) {
  const ctx = eng.ctx;
  let d = dest;
  if (n.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = n.lp; f.Q.value = 0.5; f.connect(d); d = f; }
  if (n.flutter) {
    const g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    g.gain.value = 0.65; depth.gain.value = 0.35; lfo.frequency.value = n.flutter;
    lfo.connect(depth).connect(g.gain); lfo.start(t); lfo.stop(t + (n.dur || 0.5) + 1.5);
    g.connect(d); d = g;
  }
  return d;
}

SYNTH.feltpiano = (eng, dest, n, t) => SYNTH.piano(eng, dest, n, t);
export const synthNames = () => Object.keys(SYNTH);
