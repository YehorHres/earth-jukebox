// Офлайн-рендер партитури (OfflineAudioContext): автотести і експорт треку у WAV.
import { Engine, levelFor } from "./engine.js";
import { playNote } from "./instruments.js";

export async function renderOffline(score, mapping, { from = 0, seconds = null, sampleRate = 44100, muted = [] } = {}) {
  const dur = seconds ?? score.duration + 2;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sampleRate), sampleRate);
  const eng = new Engine();
  await eng.init(ctx);
  for (const p of score.parts) eng.bus(p.id, { send: p.id === "pad" ? 0.45 : p.id === "drums" ? 0.15 : 0.3 });
  for (const id of muted) eng.setPart(id, { mute: true });
  for (const b of mapping.bars) if (b.t0 + b.dur > from && b.t0 < from + dur) {
    const at = Math.max(0, b.t0 - from);
    eng.setSpace(b.params.space, at);
    eng.setLevel(levelFor(b.params), at);
  }
  for (const n of score.notes) {
    if (n.t < from || n.t >= from + dur - 0.5) continue;
    playNote(eng, eng.bus(n.part), n.inst, n, n.t - from);
  }
  const buf = await ctx.startRendering();
  let peak = 0, sum = 0;
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < L.length; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); peak = Math.max(peak, a, b); sum += L[i] * L[i] + R[i] * R[i]; }
  return { buffer: buf, peak, rms: Math.sqrt(sum / (2 * L.length)) };
}

/** AudioBuffer → WAV (16 біт). */
export function toWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); out.setUint32(4, 36 + len * ch * 2, true); w(8, "WAVE"); w(12, "fmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, len * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([out], { type: "audio/wav" });
}
