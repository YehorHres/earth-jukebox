// Швидкість мовлення для ВСЬОГО озвучення (під курсором, вступ, W, підсумок): 0.5×–2×, крок 0.25 (PROMPT-v10 §7).
const KEY = "ej.speechRate";
export const RATE_MIN = 0.5, RATE_MAX = 2, RATE_STEP = 0.25;

export const clampRate = v => Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round((Number(v) || 1) / RATE_STEP) * RATE_STEP));

let rate = 1;
try { rate = clampRate(localStorage.getItem(KEY) ?? 1); } catch { /* приватний режим */ }
const subs = new Set();

export const getSpeechRate = () => rate;
export function setSpeechRate(v) {
  rate = clampRate(v);
  try { localStorage.setItem(KEY, String(rate)); } catch { /* приватний режим */ }
  for (const f of subs) f(rate);
  return rate;
}
export const onSpeechRate = f => (subs.add(f), () => subs.delete(f));

/** Швидкість для SpeechSynthesisUtterance: базова швидкість модуля × вибір користувача (межі Web Speech: 0.1…10). */
export const utterRate = (base = 1) => Math.min(10, Math.max(0.1, base * rate));
/** Оцінка тривалості фрази в секундах (≈ 14 символів/с при 1×) — для пауз без голосу й тесту «вступ ≤ 20 с». */
export const speechSeconds = (text, r = rate) => (text.length / 14) / r;
