// Ліниве завантаження семплів справжніх інструментів (vendor/samples, CC-BY 3.0 — див. README).
// Поки семпли вантажаться або якщо їх немає (офлайн, file://) — грають синтезатори. Музика ніколи не мовчить.
import { registerSampler, hasSampler } from "./instruments.js";

const NOTE = { C: 0, Cs: 1, D: 2, Ds: 3, E: 4, F: 5, Fs: 6, G: 7, Gs: 8, A: 9, As: 10, B: 11 };
const toMidi = name => { const m = name.match(/^([A-G]s?)(\d)$/); return 12 * (Number(m[2]) + 1) + NOTE[m[1]]; };

export const SAMPLE_SETS = {
  piano: ["C3", "Fs3", "C4", "Fs4", "C5", "Fs5", "C6"],
  violin: ["G3", "C4", "E4", "A4", "C5", "E5", "A5", "C6"],
  flute: ["C4", "E4", "A4", "C5", "E5", "A5", "C6"],
  harp: ["C3", "G3", "D4", "A4", "E5", "B5", "F6"],
  contrabass: ["G1", "C2", "E2", "A2", "Cs3", "E3"],
  horn: ["C2", "G2", "D3", "F3", "C4"],
};

const BASE = new URL("../../vendor/samples/", import.meta.url);
const loading = new Map();
export const sampleStatus = {};     // інструмент → "loading" | "ready" | "synth"

/**
 * Завантажити семпли потрібних інструментів. onProgress(done, total).
 * @param {BaseAudioContext} ctx — для decodeAudioData
 */
export async function loadSamples(ctx, instruments, onProgress = () => {}) {
  const wanted = [...new Set(instruments)].filter(i => SAMPLE_SETS[i] && !hasSampler(i));
  const total = wanted.reduce((s, i) => s + SAMPLE_SETS[i].length, 0);
  let done = 0;
  await Promise.all(wanted.map(inst => {
    if (!loading.has(inst)) {
      sampleStatus[inst] = "loading";
      loading.set(inst, (async () => {
        try {
          const buffers = await Promise.all(SAMPLE_SETS[inst].map(async n => {
            const res = await fetch(new URL(`${inst}/${n}.mp3`, BASE));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
            onProgress(++done, total);
            return { midi: toMidi(n), buffer: trimSilence(buffer) };
          }));
          registerSampler(inst, buffers);
          sampleStatus[inst] = "ready";
        } catch (e) {
          console.warn(`Семпли «${inst}» недоступні — грає синтезатор:`, e.message);
          sampleStatus[inst] = "synth";
        }
      })());
    }
    return loading.get(inst);
  }));
  return { loaded: wanted.filter(i => sampleStatus[i] === "ready"), failed: wanted.filter(i => sampleStatus[i] === "synth") };
}

/** Прибрати тишу на початку MP3 (затримка кодера), щоб ноти не запізнювались. */
function trimSilence(buf) {
  const d = buf.getChannelData(0), thr = 0.003;
  let i = 0;
  const max = Math.min(d.length, Math.floor(buf.sampleRate * 0.15));
  while (i < max && Math.abs(d[i]) < thr) i++;
  if (i < 8) return buf;
  const out = new AudioBuffer({ length: buf.length - i, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(i), c);
  return out;
}
