// Мастеринг треку (v4-14): калібрування гучності й балансу офлайн-рендером.
// Усі треки зводяться до однієї цілі (−16 LUFS), L/R вирівнюються до ±0.5 дБ; стеля −1 dBFS — у двигуні.
import { renderOffline } from "./render.js";
import { measure } from "./measure.js";
import { TARGET_LUFS } from "./engine.js";
import { LEAD_PARTS, VOICE_LEAD_DB } from "../grammar.js";

/** На скільки дБ голос даних гучніший за супровід (уривок seconds с від from). */
export async function leadOverAccomp(score, mapping, { from = 0, seconds = 8, master = null, sampleRate = 44100 } = {}) {
  const v = measure((await renderOffline(score, mapping, { from, seconds, master, sampleRate, solo: ["dataVoice"] })).buffer).lufs;
  const a = measure((await renderOffline(score, mapping, { from, seconds, master, sampleRate, muted: LEAD_PARTS })).buffer).lufs;
  return v <= -69 || a <= -69 ? null : v - a;
}
/** Підсилення голосу даних, щоб він був на VOICE_LEAD_DB (+3…+4 дБ) над супроводом — не більше. */
export async function voiceTrim(score, mapping, { sampleRate = 44100, seconds = 10 } = {}) {
  if (!score.lead) return 0;
  const d = await leadOverAccomp(score, mapping, { from: mapping.meta.duration * 0.4, seconds, sampleRate, master: { gainDb: 0, balanceDb: 0, voiceDb: 0 } });
  if (d === null) return 0;
  // друге уточнення: компресор мастера нелінійний, тож перевіряємо результат уже з підсиленням
  const v1 = Math.max(-10, Math.min(10, VOICE_LEAD_DB - d));
  const d1 = await leadOverAccomp(score, mapping, { from: mapping.meta.duration * 0.4, seconds, sampleRate, master: { gainDb: 0, balanceDb: 0, voiceDb: v1 } });
  return d1 === null ? v1 : Math.max(-10, Math.min(10, v1 + (VOICE_LEAD_DB - d1)));
}

const cache = new Map();

/**
 * @returns {{ gainDb, balanceDb, measured }} — параметри для engine.setMaster і виміри останнього проходу
 * passes — скільки уточнень (кожне = повний офлайн-рендер треку); key — кеш у пам'яті
 */
export async function calibrate(score, mapping, { passes = 2, key = null, sampleRate = 44100 } = {}) {
  if (key && cache.has(key)) return cache.get(key);
  let cal = { gainDb: 0, balanceDb: 0, voiceDb: await voiceTrim(score, mapping, { sampleRate }) }, m = null;
  for (let i = 0; i < passes; i++) {
    const r = await renderOffline(score, mapping, { master: cal, sampleRate });
    m = measure(r.buffer);
    if (m.lufs <= -69) break;                                    // тиша — нічого нормувати
    cal = { ...cal, gainDb: Math.max(-24, Math.min(30, cal.gainDb + (TARGET_LUFS - m.lufs))), balanceDb: cal.balanceDb + m.balanceDb };
  }
  const out = { ...cal, measured: m };
  if (key) cache.set(key, out);
  return out;
}
