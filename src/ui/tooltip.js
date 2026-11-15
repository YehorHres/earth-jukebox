// Підказки (WCAG 1.4.13): з'являються при наведенні мишею (~0.4 с) і при фокусі з клавіатури;
// Esc закриває; не виходять за край екрана; на підказку можна навести мишу — вона не зникає;
// елемент отримує aria-describedby="tip", тож скрінрідер читає ту саму підказку.
// Текст — data-tip="ключ" (src/i18n/uk.js, en.js). Атрибут title не використовуємо.
import { t, onLang } from "../i18n/index.js";

const SHOW_DELAY = 400, MARGIN = 8;

/** Елемент із підказкою для вузла під курсором / у фокусі: сам [data-tip] або поле всередині <label>. */
export function tipTarget(node) {
  const el = node?.closest?.("[data-tip]");
  if (el) return el;
  const ctl = node?.closest?.("label")?.control;
  return ctl?.dataset?.tip ? ctl : null;
}
export const tipText = el => (el?.dataset?.tip ? t(el.dataset.tip) : "");

export function setupTooltips() {
  const tip = document.getElementById("tip");
  let current = null, timer = 0, keyboard = false;

  function describe(el, on) {
    const ids = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(x => x && x !== "tip");
    if (on) ids.push("tip");
    if (ids.length) el.setAttribute("aria-describedby", ids.join(" ")); else el.removeAttribute("aria-describedby");
  }
  function place(el) {
    const r = el.getBoundingClientRect();
    tip.style.left = "0px"; tip.style.top = "0px";
    const tw = tip.offsetWidth, th = tip.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const x = Math.max(MARGIN, Math.min(vw - tw - MARGIN, r.left + r.width / 2 - tw / 2));
    let y = r.bottom + MARGIN;
    if (y + th > vh - MARGIN) y = r.top - th - MARGIN;           // знизу немає місця — над елементом
    y = Math.max(MARGIN, Math.min(vh - th - MARGIN, y));
    tip.style.left = `${Math.round(x)}px`; tip.style.top = `${Math.round(y)}px`;
  }
  function show(el) {
    const text = tipText(el);
    if (!text) return;
    if (current && current !== el) describe(current, false);
    current = el;
    tip.textContent = text;
    tip.hidden = false;
    describe(el, true);
    place(el);
  }
  function hide() {
    clearTimeout(timer);
    if (!current) return;
    describe(current, false);
    current = null;
    tip.hidden = true;
  }

  // модальність вводу: підказка при фокусі — лише для клавіатури (клік мишею фокусує кнопку без підказки-дубля)
  document.addEventListener("keydown", () => (keyboard = true), true);
  document.addEventListener("pointerdown", () => (keyboard = false), true);

  document.addEventListener("pointerover", e => {
    if (e.pointerType === "touch") return;
    if (tip.contains(e.target)) { clearTimeout(timer); return; }    // курсор на самій підказці — не ховати
    const el = tipTarget(e.target);
    if (el === current) { clearTimeout(timer); return; }
    clearTimeout(timer);
    if (!el) { if (current && document.activeElement !== current) timer = setTimeout(hide, 150); return; }
    timer = setTimeout(() => show(el), SHOW_DELAY);
  });
  document.addEventListener("pointerout", e => {
    const el = tipTarget(e.target);
    if (!el || el.contains(e.relatedTarget) || tip.contains(e.relatedTarget)) return;
    clearTimeout(timer);
    if (current === el && document.activeElement !== el) timer = setTimeout(hide, 150);
  });
  tip.addEventListener("pointerleave", e => { if (current && !current.contains(e.relatedTarget) && document.activeElement !== current) hide(); });
  document.addEventListener("focusin", e => {
    const el = tipTarget(e.target);
    clearTimeout(timer);
    if (el && keyboard) show(el); else if (current && current !== el) hide();
  });
  document.addEventListener("focusout", e => { if (current && tipTarget(e.target) === current) hide(); });
  // Esc ховає підказку; інші дії Esc (закрити список, вийти з дослідження) — наступним натисканням
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && current) { hide(); e.stopPropagation(); e.preventDefault(); }
  }, true);
  window.addEventListener("scroll", () => current && place(current), true);
  window.addEventListener("resize", () => current && place(current));
  // текст змінився (мова) або елемент зник
  onLang(() => { if (current) { tip.textContent = tipText(current); place(current); } });
  document.addEventListener("click", () => { if (current && !current.isConnected) hide(); });

  return { show, hide, current: () => current };
}
