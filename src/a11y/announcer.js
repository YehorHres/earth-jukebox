// aria-live повідомлення + необов'язкове озвучення голосом (мовою інтерфейсу; тексти модулів аналізу перекладаються tr).
import { tr, speechLang } from "../i18n/index.js";
import { utterRate } from "./speech.js";
let live = null, minGapMs = 0, lastAt = 0;
export const prefs = { announce: true, voice: false, intro: true, introVoice: true };

/** duck(on) — приглушити музику під час мовлення (ставить ui/playback.js). */
export const speechHooks = { duck: null };

export function initAnnouncer(el) { live = el; }

/** force — важливе (завжди); throttle — не частіше ніж раз на minGap (для повідомлень під час музики). */
export function announce(text, { force = false, throttle = false } = {}) {
  if (!live || (!prefs.announce && !force)) return;
  text = tr(text);
  const now = performance.now();
  if (throttle && now - lastAt < minGapMs) return;
  lastAt = now;
  live.textContent = "";
  setTimeout(() => (live.textContent = text), 30);
  if (prefs.voice && window.speechSynthesis) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang(); u.rate = utterRate(1.1);
    u.onstart = () => speechHooks.duck?.(true);
    u.onend = u.onerror = () => { if (!speechSynthesis.pending) speechHooks.duck?.(false); };
    speechSynthesis.speak(u);
  }
}

export function setMinGap(ms) { minGapMs = ms; }
export function stopVoice() { if (window.speechSynthesis) speechSynthesis.cancel(); }
