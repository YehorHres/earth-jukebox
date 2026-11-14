// Аудіодвигун на чистому Web Audio (без зовнішніх бібліотек — працює офлайн).
// Ланцюг (v4-14): інструмент → шина партії [HPF → виріз 350 Гц → LPF] (mute/solo) → [сухий + посил на реверб]
//   → сума → «провал» → м'який компресор → рівень від даних (±4 дБ) → нормалізація гучності треку (−16 LUFS)
//   → баланс L/R → лімітер → стеля −1 dBFS → вихід.

const c01 = x => Math.max(0, Math.min(1, x ?? 0.5));
export const TARGET_LUFS = -16, CEILING = 0.88;      // 0.88 ≈ −1.1 dBFS
/**
 * Динаміка від даних: ±4 дБ навколо цілі, від ВІДНОСНОЇ енергії (rel) із довгим згладжуванням
 * (середнє за 4 такти) — наближення камери чи яскравість кадру не роблять трек гучнішим.
 */
export function levelFor(mapping, b) {
  const bars = mapping.bars;
  let s = 0, n = 0;
  for (let k = Math.max(0, b - 3); k <= Math.min(bars.length - 1, b); k++) { s += c01(bars[k].params.energy); n++; }
  const db = Math.max(-4, Math.min(4, -4 + 8 * (n ? s / n : 0.5)));
  return Math.pow(10, db / 20);
}

// EQ партій: high-pass усім, крім басу; м'який виріз 250–500 Гц у педів і арпеджіо; бас — low-pass, суббас — HPF 32 Гц
export const PART_EQ = {
  bass: { hp: 32, lp: 1800 }, pad: { hp: 180, cut: [350, -4] }, arp: { hp: 130, cut: [350, -3] },
  melody: { hp: 120 }, counter: { hp: 100 }, accents: { hp: 40 }, drums: { hp: 35 }, texture: { hp: 150 }, stars: { hp: 300 },
};

/** Спецефект «провал у спектрі» (озон, аерозолі): менше значення — нижча частота зрізу. */
export const dipFor = (mapping, b) => {
  if (!mapping?.meta?.soundProfile?.fx?.includes("dip")) return 20000;
  const e = c01(mapping.bars[b]?.params?.energy);
  return 500 + 14000 * e * e;
};

export class Engine {
  constructor() {
    this.ctx = null;
    this.buses = new Map();
    this.partState = new Map();   // id → { mute, solo }
    this.space = 0.3;
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
    split.connect(this.balL, 0); split.connect(this.balR, 1);
    this.balL.connect(merge, 0, 0); this.balR.connect(merge, 0, 1);
    merge.connect(limiter).connect(shaper).connect(ctx.destination);
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
  setMaster({ gainDb = 0, balanceDb = 0 } = {}) {
    this.masterCal = { gainDb, balanceDb };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (param, v) => { if (t < 0.01) param.value = v; else param.setTargetAtTime(v, t, 0.05); };
    set(this.normGain.gain, Math.pow(10, gainDb / 20));
    set(this.balL.gain, Math.pow(10, -balanceDb / 40));
    set(this.balR.gain, Math.pow(10, balanceDb / 40));
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
    node.connect(out);
    out.connect(this.master);
    out.connect(sendG).connect(this.reverb);
    sendG.gain.value = send * this.space * 2;
    this.buses.set(id, { input, out, send: sendG, baseSend: send });
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
      b.out.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.03);
    }
  }

  /** Загальна гучність такту (енергія даних): тиха темна карта звучить тихо — чесно. */
  setLevel(v, at) {
    if (!this.ctx) return;
    this.level = v;
    this.levelNode.gain.setTargetAtTime(v, at ?? this.ctx.currentTime, 1.5);
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
