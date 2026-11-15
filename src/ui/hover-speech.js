// Озвучення під курсором для слабозорих: читає підказку (або підпис / текст) елемента під мишею
// через speechSynthesis мовою інтерфейсу. За замовчуванням ВИМКНЕНО (не заважає скрінрідерам).
// Вмикання: кнопка в розділі «Доступність» або Alt+Shift+S (не конфліктує з NVDA / JAWS / VoiceOver). Стан — у localStorage.
// Затримка ~0.3 с; нове наведення перериває попереднє мовлення; під час мовлення музика приглушується (engine.duck).
import { t, speechLang } from "../i18n/index.js";
import { announce, speechHooks } from "../a11y/announcer.js";
import { utterRate } from "../a11y/speech.js";
import { tipTarget, tipText } from "./tooltip.js";

const KEY = "ecosphear.hoverSpeech", DELAY = 300;
const READABLE = "button, a, input, select, summary, label, h1, h2, h3, legend, p, li, dt, dd, th, td, .tag";

const load = () => { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } };
const save = on => { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* ігноруємо */ } };
const clean = s => (s || "").replace(/\s+/g, " ").trim();

/** Що читати для вузла під курсором: елемент керування з підказкою або найближчий текстовий блок. */
export function speakTarget(node) {
  if (!node?.closest || node.closest("#tip, [aria-hidden='true']:not(.file-btn)")) return null;
  return tipTarget(node) || node.closest(READABLE);
}
/** Текст для мовлення: підпис елемента + підказка (та сама, що в tooltip.js). */
export function speechText(el) {
  if (!el) return "";
  const tip = tipText(el);
  const name = clean(el.getAttribute("aria-label") || (el.labels?.[0] && el.labels[0].textContent) || el.textContent || el.placeholder || el.value);
  const text = tip ? (name && name !== tip ? `${name}. ${tip}` : tip) : name;
  return text.length > 500 ? text.slice(0, 500) + "…" : text;
}

export function setupHoverSpeech() {
  const btn = document.getElementById("hoverSpeak");
  let on = load(), timer = 0, last = null;

  function speak(text) {
    if (!window.speechSynthesis || !text) return;
    speechSynthesis.cancel();                       // нове наведення перериває попереднє
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang(); u.rate = utterRate(1.05);
    u.onstart = () => speechHooks.duck?.(true);     // приглушити музику (функція плеєра)
    u.onend = u.onerror = () => { if (!speechSynthesis.speaking && !speechSynthesis.pending) speechHooks.duck?.(false); };
    speechSynthesis.speak(u);
  }
  function stop() {
    clearTimeout(timer); last = null;
    if (window.speechSynthesis) speechSynthesis.cancel();
    speechHooks.duck?.(false);
  }
  function apply() { btn.setAttribute("aria-pressed", String(on)); }
  function set(v) {
    on = v; save(on); apply();
    announce(t(on ? "hover.on" : "hover.off"), { force: true });
    if (on) speak(t("hover.on")); else stop();
  }

  btn.addEventListener("click", () => set(!on));
  document.addEventListener("keydown", e => {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyS") { e.preventDefault(); e.stopPropagation(); set(!on); }
  }, true);

  document.addEventListener("pointerover", e => {
    if (!on || e.pointerType === "touch") return;
    const el = speakTarget(e.target);
    if (!el || el === last) return;
    last = el;
    clearTimeout(timer);
    timer = setTimeout(() => speak(speechText(el)), DELAY);
  });
  document.addEventListener("pointerout", e => {
    if (!on || !last) return;
    if (!last.contains(e.relatedTarget)) { clearTimeout(timer); last = null; }
  });

  apply();
  return { isOn: () => on, set, speechText };
}
