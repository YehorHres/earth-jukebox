// Аудіодвигун на чистому Web Audio (без зовнішніх бібліотек — працює офлайн).
// Ланцюг: інструмент → шина партії (mute/solo) → [сухий сигнал + посил на реверб] → компресор → лімітер → вихід.

const c01 = x => Math.max(0, Math.min(1, x ?? 0.5));
/** Гучність такту: енергія (рух, rel) × загальний рівень (abs) → підсилення. */
export const levelFor = params => (0.35 + 0.65 * c01(params.energy)) * (0.4 + 0.6 * c01(params.level));

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
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.25;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.1;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    // рівень після компресора — щоб тиха музика лишалась тихою (компресор її не «підтягує»)
    this.levelNode = ctx.createGain();
    this.levelNode.gain.value = 0.8;
    this.dip = ctx.createBiquadFilter(); this.dip.type = "lowpass"; this.dip.frequency.value = 20000; this.dip.Q.value = 0.7;
    this.master.connect(this.dip).connect(comp).connect(this.levelNode).connect(limiter).connect(ctx.destination);
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

  /** Шина партії: gain (mute/solo) → сухий + посил на реверб. */
  bus(id, { send = 0.3 } = {}) {
    if (this.buses.has(id)) return this.buses.get(id).input;
    const ctx = this.ctx;
    const input = ctx.createGain(), out = ctx.createGain(), sendG = ctx.createGain();
    input.connect(out);
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
    this.levelNode.gain.setTargetAtTime(v, at ?? this.ctx.currentTime, 0.6);
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
