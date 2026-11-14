// aria-live повідомлення + необов'язкове озвучення голосом.
let live = null, minGapMs = 0, lastAt = 0;
export const prefs = { announce: true, voice: false, intro: true, introVoice: true };

export function initAnnouncer(el) { live = el; }

/** force — важливе (завжди); throttle — не частіше ніж раз на minGap (для повідомлень під час музики). */
export function announce(text, { force = false, throttle = false } = {}) {
  if (!live || (!prefs.announce && !force)) return;
  const now = performance.now();
  if (throttle && now - lastAt < minGapMs) return;
  lastAt = now;
  live.textContent = "";
  setTimeout(() => (live.textContent = text), 30);
  if (prefs.voice && window.speechSynthesis) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "uk-UA"; u.rate = 1.1;
    speechSynthesis.speak(u);
  }
}

export function setMinGap(ms) { minGapMs = ms; }
export function stopVoice() { if (window.speechSynthesis) speechSynthesis.cancel(); }
