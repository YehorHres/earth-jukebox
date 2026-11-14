// Мастеринг треку (v4-14): калібрування гучності й балансу офлайн-рендером.
// Усі треки зводяться до однієї цілі (−16 LUFS), L/R вирівнюються до ±0.5 дБ; стеля −1 dBFS — у двигуні.
import { renderOffline } from "./render.js";
import { measure } from "./measure.js";
import { TARGET_LUFS } from "./engine.js";

const cache = new Map();

/**
 * @returns {{ gainDb, balanceDb, measured }} — параметри для engine.setMaster і виміри останнього проходу
 * passes — скільки уточнень (кожне = повний офлайн-рендер треку); key — кеш у пам'яті
 */
export async function calibrate(score, mapping, { passes = 2, key = null, sampleRate = 44100 } = {}) {
  if (key && cache.has(key)) return cache.get(key);
  let cal = { gainDb: 0, balanceDb: 0 }, m = null;
  for (let i = 0; i < passes; i++) {
    const r = await renderOffline(score, mapping, { master: cal, sampleRate });
    m = measure(r.buffer);
    if (m.lufs <= -69) break;                                    // тиша — нічого нормувати
    cal = { gainDb: Math.max(-24, Math.min(30, cal.gainDb + (TARGET_LUFS - m.lufs))), balanceDb: cal.balanceDb + m.balanceDb };
  }
  const out = { ...cal, measured: m };
  if (key) cache.set(key, out);
  return out;
}
