// i18n інтерфейсу: t(key) — тексти UI (src/i18n/uk.js, en.js), tr(text) — переклад текстів, що приходять
// з модулів звуку й аналізу (їх не змінюємо: перекладаємо на виході, див. dynamic-en.js).
// Мова: ?lang=uk|en (без збереження) → localStorage → мова браузера (uk → українська, інакше англійська).
import uk from "./uk.js";
import en from "./en.js";
import { translate, registerExact } from "./dynamic-en.js";

const DICTS = { uk, en };
const KEY = "ecosphear.lang";
const CYR = /[Ѐ-ӿ]/;
let lang = null;
const subs = new Set();

function initial() {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "uk" || q === "en") return q;
    const s = localStorage.getItem(KEY);
    if (s === "uk" || s === "en") return s;
  } catch { /* приватний режим / sandbox */ }
  return (navigator.language || "").toLowerCase().startsWith("uk") ? "uk" : "en";
}

export const getLang = () => (lang ??= initial());
/** Мова синтезу й розпізнавання мовлення. */
export const speechLang = () => (getLang() === "uk" ? "uk-UA" : "en-US");
export const hasKey = (key, l) => Object.prototype.hasOwnProperty.call(DICTS[l], key);

/** Текст інтерфейсу за ключем; {name} — підстановки. */
export function t(key, vars) {
  const l = getLang();
  let s = DICTS[l][key] ?? DICTS.uk[key];
  if (s === undefined) { console.warn("i18n: немає ключа", key); return key; }
  if (typeof s === "function") return s(vars || {});
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s;
}

/** Переклад тексту з модулів звуку/аналізу (в українському режимі — без змін). */
export function tr(s) {
  if (getLang() === "uk" || typeof s !== "string" || !CYR.test(s)) return s;
  return translate(s);
}

/** Поле об'єкта мовою інтерфейсу: obj[field + "_en"] в англійському режимі, інакше obj[field]. */
export function pick(obj, field) {
  if (!obj) return "";
  if (getLang() === "en") return obj[field + "_en"] ?? (obj[field] && typeof obj[field] === "object" ? obj[field].en : tr(obj[field]));
  return obj[field] && typeof obj[field] === "object" ? obj[field].uk : obj[field];
}

/** Пари «українською → англійською» з даних (теми, каталог, стилі) для tr(). */
export { registerExact };

/** Застосувати переклад до розмітки: data-i18n (текст), data-i18n-html, data-i18n-attr="aria-label:key;placeholder:key". */
export function applyDom(root = document) {
  if (!root.querySelector("[data-i18n], [data-i18n-html], [data-i18n-attr]")) return;   // напр. test.html
  root.querySelectorAll("[data-i18n]").forEach(el => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll("[data-i18n-html]").forEach(el => (el.innerHTML = t(el.dataset.i18nHtml)));
  root.querySelectorAll("[data-i18n-attr]").forEach(el => {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":").map(x => x.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
  document.documentElement.lang = getLang();
  document.title = t("doc.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("doc.description"));
}

/** Змінити мову: зберегти, оновити розмітку й повідомити підписників (вони перемальовують динамічні частини). */
export function setLang(l, { persist = true } = {}) {
  if (l !== "uk" && l !== "en") return;
  lang = l;
  if (persist) try { localStorage.setItem(KEY, l); } catch { /* ігноруємо */ }
  if (typeof document !== "undefined") applyDom();
  subs.forEach(f => { try { f(l); } catch (e) { console.error(e); } });
}
export const onLang = f => (subs.add(f), () => subs.delete(f));
