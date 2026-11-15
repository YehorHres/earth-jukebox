// Аудіодвигун на чистому Web Audio (без зовнішніх бібліотек — працює офлайн).
// Ланцюг (v4-14): інструмент → шина партії [HPF → виріз 350 Гц → LPF] (mute/solo) → [сухий + посил на реверб]
//   → сума → «провал» → м'який компресор → рівень від даних (v6: ≈ 12 дБ усередині треку) → нормалізація гучності треку (−16 LUFS, один раз)
//   → баланс L/R → лімітер → стеля −1 dBFS → вихід.

import { ACCOMP_DB, VOICE_CUT, DUCK_DB } from "../grammar.js";

/** Діапазон гучності від даних усередині треку, дБ (v6): тихі епізоди справді тихі, кульмінація — повна. */
export const LEVEL_DB = [-7, 3];

const c01 = x => Math.max(0, Math.min(1, x ?? 0.5));
export const TARGET_LUFS = -16, CEILING = 0.88;      // 0.88 ≈ −1.1 dBFS
/**
 * Динаміка від даних (v6): відносна енергія такту (drive — енергія, розтягнута в межах відео) керує гучністю
 * в діапазоні LEVEL_DB (разом зі складом партій — ≈ 12 дБ); легке згладжування з попереднім тактом. Вступ — тихіше (форма), кульмінація — повна.
 * Абсолютна яскравість / площа кадру (level) не впливає: наближення камери не робить трек гучнішим.
 */
export function levelDb(mapping, b) {
  const bars = mapping.bars, u = k => c01(bars[k].params.drive ?? bars[k].params.energy);
  const x = b > 0 ? 0.75 * u(b) + 0.25 * u(b - 1) : u(b);
  // форма: вступ — тихо (нижня третина діапазону), кульмінація — найгучніше (верх діапазону + 1 дБ)
  const sec = bars[b].section, y = sec === "intro" ? 0.25 * x : sec === "climax" ? Math.max(x, 0.75) : x;
  return LEVEL_DB[0] + (LEVEL_DB[1] - LEVEL_DB[0]) * y + (sec === "climax" ? 1 : sec === "intro" ? -2 : 0);
}
export const levelFor = (mapping, b) => Math.pow(10, levelDb(mapping, b) / 20);

// EQ партій: high-pass усім, крім басу; м'який виріз 250–500 Гц у педів і арпеджіо; бас — low-pass, суббас — HPF 32 Гц
export const PART_EQ = {
  bass: { hp: 32, lp: 1800 }, pad: { hp: 180, cut: [350, -4] }, arp: { hp: 130, cut: [350, -3] },
  melody: { hp: 120 }, counter: { hp: 100 }, accents: { hp: 40 }, drums: { hp: 35 }, texture: { hp: 150 }, stars: { hp: 300 },
};

/** Спецефект «провал у спектрі» (озон, аерозолі): менше значення — нижча частота зрізу. */
export const dipFor = (mapping, b) => {
  const fx = mapping?.meta?.soundProfile?.fx || [];
  if (fx.includes("choke")) return 1500 + 16500 * (1 - chokeFor(mapping, b)) ** 2;
  if (!fx.includes("dip")) return 20000;
  const e = c01(mapping.bars[b]?.params?.energy);
  return 500 + 14000 * e * e;
};
/**
 * «Задуха» (етап 17, CO₂): ріст величини (тренд за 20 кадрів, dynamics > 0.5) закриває фільтр і звужує стерео,
 * спад — розширює й відкриває. 0 — вільно, 1 — найтісніше.
 */
export const chokeFor = (mapping, b) => {
  if (!mapping?.meta?.soundProfile?.fx?.includes("choke")) return 0;
  return c01(((mapping.bars[b]?.params?.dynamics ?? 0.5) - 0.5) * 2.2);
};
/** Ширина стерео такту: 1 — повна, 0.25 — майже моно. */
export const widthFor = (mapping, b) => 1 - 0.75 * chokeFor(mapping, b);

export class Engine {
  constructor() {
    this.ctx = null;
    this.buses = new Map();
    this.partState = new Map();   // id → { mute, solo }
    this.space = 0.3;
    this.lead = null;             // партії першого плану (граматика звуку); решта — супровід
  }

  /** @param {BaseAudioContext} [given] — напр. OfflineAudioContext для тестів і експорту в WAV */
  async init(given = null, { waitResume = true } = {}) {
    if (this.ctx) {
      if (this.ctx.state !== "running" && this.ctx.resume) { const p = this.ctx.resume(); if (waitResume) await p; }
      return this.ctx;
    }
    const ctx = given || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    this.ctx = ctx;
    // мастер: компресор (склеює мікс) → лімітер (нічого не хрипить)
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 2; comp.attack.value = 0.03; comp.release.value = 0.3;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 3; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.12;
    // нормалізація гучності треку й баланс L/R (значення дає калібрування — audio/master.js)
    this.normGain = ctx.createGain();
    const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
    this.balL = ctx.createGain(); this.balR = ctx.createGain();
    // стеля: м'яке обмеження до CEILING (вхід поза ±1 теж дає рівно CEILING)
    const shaper = ctx.createWaveShaper(), N = 2049, curve = new Float32Array(N), knee = 0.6;
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1, a = Math.abs(x);
      const y = a <= knee ? a : knee + (CEILING - knee) * Math.tanh((a - knee) / (CEILING - knee)) / Math.tanh((1 - knee) / (CEILING - knee));
      curve[i] = Math.sign(x) * y;
    }
    shaper.curve = curve; shaper.oversample = "4x";
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    // рівень після компресора — щоб тиха музика лишалась тихою (компресор її не «підтягує»)
    this.levelNode = ctx.createGain();
    this.levelNode.gain.value = 1;
    this.dip = ctx.createBiquadFilter(); this.dip.type = "lowpass"; this.dip.frequency.value = 20000; this.dip.Q.value = 0.7;
    this.master.connect(this.dip).connect(comp).connect(this.levelNode).connect(this.normGain).connect(split);
    // ширина стерео (етап 17): L' = a·L + b·R, R' = a·R + b·L; a = (1 + w) / 2, b = (1 − w) / 2
    this.wA = [ctx.createGain(), ctx.createGain()]; this.wB = [ctx.createGain(), ctx.createGain()];
    this.wA.forEach(g => (g.gain.value = 1)); this.wB.forEach(g => (g.gain.value = 0));
    split.connect(this.wA[0], 0); split.connect(this.wB[0], 1); this.wA[0].connect(this.balL); this.wB[0].connect(this.balL);
    split.connect(this.wA[1], 1); split.connect(this.wB[1], 0); this.wA[1].connect(this.balR); this.wB[1].connect(this.balR);
    this.balL.connect(merge, 0, 0); this.balR.connect(merge, 0, 1);
    // ducking: музика приглушується під час мовлення (після мастера — не впливає на калібрування гучності)
    this.duckNode = ctx.createGain();
    merge.connect(limiter).connect(shaper).connect(this.duckNode).connect(ctx.destination);
    this.setMaster(this.masterCal || { gainDb: 0, balanceDb: 0 });
    // реверб: згенерована імпульсна характеристика (стерео, ~3.5 с)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 3.6, 2.4);
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.9;
    this.reverb.connect(this.reverbReturn).connect(this.master);
    // спільний буфер шуму (шейкер, литаври, подих флейти)
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; }
    if (!given && ctx.state !== "running") { const p = ctx.resume(); if (waitResume) await p; }
    return ctx;
  }

  /** Калібрування мастера: підсилення до цільової гучності й вирівнювання L/R (balanceDb = на скільки L гучніший за R). */
  setMaster({ gainDb = 0, balanceDb = 0, voiceDb = 0 } = {}) {
    this.masterCal = { gainDb, balanceDb, voiceDb };
    if (!this.ctx) return;
    this.applyMix();
    const t = this.ctx.currentTime;
    const set = (param, v) => { if (t < 0.01) param.value = v; else param.setTargetAtTime(v, t, 0.05); };
    set(this.normGain.gain, Math.pow(10, gainDb / 20));
    set(this.balL.gain, Math.pow(10, -balanceDb / 40));
    set(this.balR.gain, Math.pow(10, balanceDb / 40));
  }

  /** Партії першого плану (score.lead). Решта шин — супровід: тихіше (ACCOMP_DB) і виріз у частотах під голос даних. */
  setLead(ids) { this.lead = ids ? new Set(ids) : null; this.applyMix(); }
  isAccomp(id) { return !!this.lead && !this.lead.has(id) && id !== "legend"; }

  /** Приглушити музику під мовлення (≥ 10 дБ) і повернути. */
  duck(on, at) {
    if (!this.ctx) return;
    this.duckNode.gain.setTargetAtTime(on ? Math.pow(10, DUCK_DB / 20) : 1, at ?? this.ctx.currentTime, on ? 0.04 : 0.12);
  }

  /** Шина партії: EQ партії → gain (mute/solo) → сухий + посил на реверб. */
  bus(id, { send = 0.3 } = {}) {
    if (this.buses.has(id)) return this.buses.get(id).input;
    const ctx = this.ctx;
    const input = ctx.createGain(), out = ctx.createGain(), sendG = ctx.createGain();
    const eq = PART_EQ[id];
    let node = input;
    const add = (type, f, q, g) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; if (g) b.gain.value = g; node.connect(b); node = b; };
    if (eq?.hp) add("highpass", eq.hp, 0.7);
    if (eq?.cut) add("peaking", eq.cut[0], 1, eq.cut[1]);
    if (eq?.lp) add("lowpass", eq.lp, 0.7);
    const cut = ctx.createBiquadFilter(); cut.type = "peaking"; cut.frequency.value = VOICE_CUT.f; cut.Q.value = VOICE_CUT.q; cut.gain.value = this.isAccomp(id) ? VOICE_CUT.db : 0;
    node.connect(cut); node = cut;
    node.connect(out);
    out.connect(this.master);
    out.connect(sendG).connect(this.reverb);
    sendG.gain.value = send * this.space * 2;
    this.buses.set(id, { input, out, send: sendG, baseSend: send, cut });
    this.applyMix();
    return input;
  }

  /** Простір (реверберація) із параметра space такту. */
  setSpace(v, at) {
    this.space = v;
    if (!this.ctx) return;
    for (const b of this.buses.values()) b.send.gain.setTargetAtTime(b.baseSend * (0.4 + 1.6 * v), at ?? this.ctx.currentTime, 0.5);
  }

  setPart(id, patch) {
    this.partState.set(id, { ...(this.partState.get(id) || { mute: false, solo: false }), ...patch });
    this.applyMix();
  }
  getPart(id) { return this.partState.get(id) || { mute: false, solo: false }; }

  applyMix() {
    if (!this.ctx) return;
    const anySolo = [...this.partState.values()].some(s => s.solo);
    for (const [id, b] of this.buses) {
      const st = this.getPart(id);
      const on = anySolo ? st.solo : !st.mute;
      const acc = this.isAccomp(id);
      b.cut.gain.value = acc ? VOICE_CUT.db : 0;
      // голос даних: підсилення з калібрування (на +3…+4 дБ над супроводом); супровід не приглушуємо
      const g = acc ? Math.pow(10, ACCOMP_DB / 20) : id === "dataVoice" ? Math.pow(10, (this.masterCal?.voiceDb || 0) / 20) : 1;
      b.out.gain.setTargetAtTime(on ? g : 0, this.ctx.currentTime, 0.03);
    }
  }

  /** Загальна гучність такту (енергія даних): тиха темна карта звучить тихо — чесно. */
  setLevel(v, at) {
    if (!this.ctx) return;
    this.level = v;
    if (!this.levelSet) { this.levelSet = true; this.levelNode.gain.setValueAtTime(v, at ?? this.ctx.currentTime); }   // початок треку — одразу на рівні вступу
    else this.levelNode.gain.setTargetAtTime(v, at ?? this.ctx.currentTime, 0.6);
  }

  setWidth(w, at) {
    if (!this.ctx) return;
    const t = at ?? this.ctx.currentTime, a = (1 + w) / 2, b = (1 - w) / 2;
    for (const g of this.wA) g.gain.setTargetAtTime(a, t, 1.2);
    for (const g of this.wB) g.gain.setTargetAtTime(b, t, 1.2);
  }

  setDip(freq, at) { if (this.ctx) this.dip.frequency.setTargetAtTime(freq, at ?? this.ctx.currentTime, 0.8); }

  /** Плавно приглушити все (пауза), повернути (продовження). */
  fade(to, time = 0.08) { if (this.ctx) this.master.gain.setTargetAtTime(to, this.ctx.currentTime, time); }
}

function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let s = 987 + c * 7;
    for (let i = 0; i < len; i++) {
      s = (s * 16807) % 2147483647;
      const n = (s / 2147483647) * 2 - 1;
      // ранні відбиття + експоненційний хвіст
      d[i] = n * Math.pow(1 - i / len, decay) * (i < ctx.sampleRate * 0.01 ? i / (ctx.sampleRate * 0.01) : 1);
    }
  }
  return buf;
}
