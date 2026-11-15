// Плеєр: планує ноти партитури на AudioContext із запасом (lookahead) і тримає відео синхронно з музикою.
// Музика — головний годинник; відео підлаштовується (дрейф > 80 мс → перемотка).
import { playNote } from "./instruments.js";
import { levelFor, dipFor, widthFor } from "./engine.js";

const LOOKAHEAD = 0.25, TICK_MS = 30, DRIFT = 0.08, NUDGE = 0.02;
/** v10 §8: швидкості відтворення (висота нот не змінюється — змінюються лише моменти й тривалості нот). */
export const RATES = [0.5, 0.75, 1, 1.25, 1.5];
// посил на реверб для кожної партії
export const SEND = { dataVoice: 0.22, soloists: 0.3, reference: 0.1, ticks: 0.05, earcons: 0.25, texture: 0.5, pad: 0.45, drums: 0.15, melody: 0.35, counter: 0.4, accents: 0.55, stars: 0.6, arp: 0.3, bass: 0.15 };

export class Player {
  constructor(engine, { onBar = () => {}, onTick = () => {}, onEnd = () => {} } = {}) {
    this.eng = engine;
    this.cb = { onBar, onTick, onEnd };
    this.score = null; this.source = null; this.mapping = null;
    this.playing = false; this.pos = 0; this.startCtx = 0; this.idx = 0; this.lastBar = -1;
    this.timer = null; this.raf = 0; this.rate = 1;
  }

  /** Швидкість відтворення: музика й відео разом; позиція не стрибає. */
  setRate(r) {
    r = RATES.includes(r) ? r : 1;
    if (this.playing) { this.pos = this.time; this.startCtx = this.eng.ctx.currentTime; }
    this.rate = r;
    if (this.source?.kind === "video") this.source.el.playbackRate = r;
    return r;
  }

  load(score, mapping, source) {
    this.stop();
    this.score = score; this.mapping = mapping; this.source = source;
    this.pos = 0; this.idx = 0; this.lastBar = -1;
  }

  get time() { return this.playing ? this.pos + Math.max(0, this.eng.ctx.currentTime - this.startCtx) * this.rate : this.pos; }
  get duration() { return this.score ? this.score.duration : 0; }

  async play() {
    if (!this.score || this.playing) return;
    await this.eng.init();
    this.eng.setLead(this.score.lead);
    for (const p of this.score.parts) this.eng.bus(p.id, { send: SEND[p.id] ?? 0.3 });
    if (this.pos >= this.duration - 0.05) this.pos = 0;
    this.eng.fade(0.9, 0.02);
    this.startCtx = this.eng.ctx.currentTime + 0.06;
    this.idx = this.firstNoteAt(this.pos);
    this.playing = true;
    this.lastBar = -1;
    this.syncVideo(true);
    if (this.source?.kind === "video") { this.source.el.playbackRate = this.rate; this.source.el.play().catch(() => {}); }
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    const loop = () => { if (!this.playing) return; this.frame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    if (!this.playing) return;
    this.pos = this.time;
    this.playing = false;
    clearInterval(this.timer); cancelAnimationFrame(this.raf);
    this.eng.fade(0.0001, 0.05);           // заплановані ноти гасимо плавно
    if (this.source?.kind === "video") this.source.el.pause();
  }

  stop() { this.pause(); this.pos = 0; }

  async seek(t) {
    const was = this.playing;
    if (was) this.pause();
    this.pos = Math.max(0, Math.min(this.duration - 0.01, t));
    this.syncVideo(true);
    this.cb.onTick(this.pos);
    const bar = Math.floor(this.pos / this.score.barDur);
    this.cb.onBar(bar, true);
    if (was) { await new Promise(r => setTimeout(r, 90)); this.play(); }
  }

  firstNoteAt(t) {
    const notes = this.score.notes;
    let lo = 0, hi = notes.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (notes[m].t < t) lo = m + 1; else hi = m; }
    return lo;
  }

  /** Планування нот у вікні [зараз, зараз + LOOKAHEAD]. */
  tick() {
    const ctx = this.eng.ctx, now = this.time, horizon = now + LOOKAHEAD * this.rate, k = this.rate;
    const notes = this.score.notes;
    while (this.idx < notes.length && notes[this.idx].t < horizon) {
      const n = notes[this.idx++];
      if (n.t < now - 0.05) continue;     // пропущені (після перемотки) — не граємо
      const at = this.startCtx + (n.t - this.pos) / k;
      const bus = this.eng.bus(n.part);
      try { playNote(this.eng, bus, n.inst, k === 1 ? n : { ...n, dur: n.dur / k }, Math.max(ctx.currentTime, at)); } catch (e) { console.warn("нота не зіграна:", e.message); }
    }
    // автоматизація простору за тактами
    const bar = Math.floor(now / this.score.barDur);
    if (bar !== this.lastBar && bar < this.mapping.bars.length) {
      this.lastBar = bar;
      const at = Math.max(this.eng.ctx.currentTime, this.startCtx + (bar * this.score.barDur - this.pos) / k);
      this.eng.setSpace(this.mapping.bars[bar].params.space, at);
      this.eng.setLevel(levelFor(this.mapping, bar), at);
      this.eng.setDip(dipFor(this.mapping, bar), at);
      this.eng.setWidth(widthFor(this.mapping, bar), at);
      this.cb.onBar(bar, false);
    }
    this.syncVideo(false);
    if (now >= this.duration + 1.5) { this.pause(); this.pos = 0; this.cb.onEnd(); }
  }

  /** Відео слідує за музикою. */
  syncVideo(force) {
    const s = this.source;
    if (!s) return;
    const t = this.time;
    if (s.kind === "video") {
      const v = s.el, target = Math.min(t, s.duration - 0.05);
      if (t >= s.duration - 0.05) { if (!v.paused) v.pause(); return; }
      const d = v.currentTime - target;
      if (force || Math.abs(d) > DRIFT) { v.currentTime = target; v.playbackRate = this.rate; }
      // м'яке підтягування (< 50 мс без перемотки): трохи швидше/повільніше, поки розбіжність > 20 мс
      else v.playbackRate = this.rate * (Math.abs(d) > NUDGE ? (d > 0 ? 0.96 : 1.04) : 1);
      if (this.playing && v.paused && t < s.duration - 0.1) v.play().catch(() => {});
    } else if (s.kind === "synthetic" && force) s.frameAt(Math.min(t, s.duration));
  }

  frame() {
    const t = this.time;
    if (this.source?.kind === "synthetic") this.source.frameAt(Math.min(t, this.source.duration));
    this.cb.onTick(t);
  }
}
