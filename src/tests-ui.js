// Тести інтерфейсу (ui-en): переклад, підказки, озвучення під курсором.
// Застосунок відкривається в iframe; вибір мови користувача в localStorage після тестів відновлюється.
export const UI_SUITES = [];

const wait = ms => new Promise(r => setTimeout(r, ms));
const CYR = /[Ѐ-ӿ]/;
const LANG_KEY = "ecosphear.lang";

/** Відкрити застосунок в iframe й дочекатися каталогу. */
export async function openApp(src) {
  const fr = document.createElement("iframe");
  fr.style.cssText = "width:1280px;height:900px;position:absolute;left:-4000px;top:0";
  fr.src = src;
  document.body.appendChild(fr);
  await new Promise(r => fr.addEventListener("load", r, { once: true }));
  const w = fr.contentWindow;
  for (let i = 0; i < 80 && !w.jukebox?.catalog; i++) await wait(250);
  return { fr, w, doc: fr.contentDocument };
}
/** Зберегти й відновити вибір мови користувача (тести клацають перемикач). */
async function keepLang(fn) {
  const prev = localStorage.getItem(LANG_KEY);
  try { return await fn(); } finally { if (prev === null) localStorage.removeItem(LANG_KEY); else localStorage.setItem(LANG_KEY, prev); }
}

/** Видимі тексти й текстові атрибути документа (без прихованих елементів). */
function visibleTexts(doc) {
  const out = [];
  const shown = el => { for (let e = el; e && e !== doc.documentElement; e = e.parentElement) { if (e.hidden || e.getAttribute?.("aria-hidden") === "true" && !e.matches(".file-btn, .file-name")) return false; } return !!(el.offsetParent || el.getClientRects().length); };
  // сирий JSON аналізу в «Технічних даних» — дані, а не тексти інтерфейсу
  const dbg = doc.getElementById("debug"), dbgText = dbg.textContent; dbg.textContent = "";
  for (const line of doc.body.innerText.split("\n")) if (line.trim()) out.push(line.trim());
  dbg.textContent = dbgText;
  for (const el of doc.body.querySelectorAll("*")) {
    if (!shown(el)) continue;
    for (const a of ["aria-label", "placeholder", "aria-description", "alt", "title"]) { const v = el.getAttribute(a); if (v) out.push(`[${a}] ${v}`); }
  }
  for (const id of ["status", "topic-hint"]) out.push(doc.getElementById(id).textContent);
  out.push(doc.getElementById("timeline").getAttribute("aria-label") || "");
  return out;
}

UI_SUITES.push(async function i18n(check) {
  const uk = (await import("./i18n/uk.js")).default, en = (await import("./i18n/en.js")).default;
  const diff = [...Object.keys(uk).filter(k => !(k in en)), ...Object.keys(en).filter(k => !(k in uk))];
  const html = await (await fetch("index.html")).text();
  const used = [...html.matchAll(/data-(?:i18n|i18n-html|tip)="([^"]+)"/g)].map(m => m[1])
    .concat([...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap(m => m[1].split(";").map(p => p.split(":")[1]?.trim())));
  const unknown = [...new Set(used)].filter(k => !(k in uk) || !(k in en));
  check("i18n: словники uk і en мають однакові ключі; усі ключі з index.html є в обох", !diff.length && !unknown.length,
    [...diff, ...unknown].join(", ") || `${Object.keys(uk).length} ключів`);

  await keepLang(async () => {
    const { fr, w, doc } = await openApp("index.html?lang=en");
    try {
      await w.jukebox.loadItem(w.jukebox.catalog[0]);
      for (let i = 0; i < 60 && !w.jukebox.score; i++) await wait(250);
      // розкрити все, що користувач може побачити: список галереї, тексти для розробників, список тем
      doc.getElementById("gallery-panel").hidden = false;
      doc.querySelector("details").open = true;
      await wait(400);
      const bad = visibleTexts(doc).filter(s => CYR.test(s));
      check("i18n: у режимі EN у видимому інтерфейсі немає кирилиці (кнопки, картка, легенда, партії, мапінг, статус)",
        !bad.length && doc.documentElement.lang === "en", bad.slice(0, 6).join(" | ") || `lang=${doc.documentElement.lang}`);
      doc.getElementById("gallery-panel").hidden = true;

      doc.getElementById("lang-uk").click(); await wait(300);
      const ukOk = doc.documentElement.lang === "uk" && doc.getElementById("play").textContent === "Грати"
        && doc.getElementById("lang-uk").getAttribute("aria-pressed") === "true" && /Тема|Тему/.test(doc.getElementById("topic-hint").textContent);
      doc.getElementById("lang-en").click(); await wait(300);
      const enOk = doc.documentElement.lang === "en" && doc.getElementById("play").textContent === "Play"
        && !CYR.test(doc.getElementById("readout").textContent) && !CYR.test(doc.getElementById("parts").textContent);
      check("i18n: перемикач UA/EN міняє мову без перезавантаження (кнопки, підказка теми, «Зараз звучить», партії) і <html lang>",
        ukOk && enOk, `uk: ${ukOk}, en: ${enOk}`);
    } finally { fr.remove(); }
  });
});

UI_SUITES.push(async function tooltips(check) {
  const uk = (await import("./i18n/uk.js")).default, en = (await import("./i18n/en.js")).default;
  await keepLang(async () => {
    const { fr, w, doc } = await openApp("index.html?lang=uk");
    try {
      await w.jukebox.loadItem(w.jukebox.catalog[0]);
      for (let i = 0; i < 60 && !w.jukebox.score; i++) await wait(250);
      doc.getElementById("topic").value = "щось незрозуміле";
      doc.getElementById("topic").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));   // показати список тем
      await wait(200);
      // кожен елемент керування (статичний і створений JS: галерея, теми, партії, легенда) має підказку uk + en
      const ctrls = [...doc.querySelectorAll("button, select, summary, input:not([type=hidden])")].filter(el => el.id !== "lang-x");
      const noTip = ctrls.filter(el => { const k = el.dataset.tip || el.closest("label")?.control?.dataset.tip; return !k || !uk[k] || !en[k]; })
        .map(el => el.id || el.textContent.trim().slice(0, 24) || el.tagName);
      check("Підказки: кожна кнопка, перемикач і поле мають підказку українською й англійською (data-tip, не title)",
        !noTip.length && ctrls.length > 40, noTip.join(", ") || `${ctrls.length} елементів`);

      const tip = doc.getElementById("tip"), langEn = doc.getElementById("lang-en"), play = doc.getElementById("play");
      langEn.dispatchEvent(new w.PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
      await wait(150);
      const early = tip.hidden;
      await wait(450);
      const r = tip.getBoundingClientRect(), vw = doc.documentElement.clientWidth;
      const hoverOk = early && !tip.hidden && tip.textContent === uk["tip.lang"] && /\btip\b/.test(langEn.getAttribute("aria-describedby") || "")
        && r.left >= 0 && r.right <= vw && r.top >= 0;
      doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await wait(50);
      const escOk = tip.hidden && !/\btip\b/.test(langEn.getAttribute("aria-describedby") || "");
      // фокус із клавіатури
      doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      play.focus();
      if (!doc.hasFocus()) play.dispatchEvent(new w.FocusEvent("focusin", { bubbles: true }));   // фонова вкладка не надсилає focusin
      await wait(50);
      const focusOk = !tip.hidden && tip.textContent === uk["tip.play"];
      play.blur(); play.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true })); await wait(50);
      check("Підказки: наведення ~0.4 с і фокус з клавіатури показують підказку, Esc закриває, не виходить за край екрана, aria-describedby",
        hoverOk && escOk && focusOk && tip.hidden, `наведення: ${hoverOk}, Esc: ${escOk}, фокус: ${focusOk}, межі: ${Math.round(r.left)}–${Math.round(r.right)} із ${vw}`);
    } finally { fr.remove(); }
  });
});

UI_SUITES.push(async function hover_speech(check) {
  const prev = localStorage.getItem("ecosphear.hoverSpeech");
  localStorage.removeItem("ecosphear.hoverSpeech");
  try {
    await keepLang(async () => {
      const { fr, w, doc } = await openApp("index.html?lang=en");
      try {
        const btn = doc.getElementById("hoverSpeak");
        const offByDefault = btn.getAttribute("aria-pressed") === "false" && !w.jukebox.hoverSpeech.isOn();
        // одна з перших зупинок Tab
        const tabbables = [...doc.querySelectorAll("a[href], button, input, select, summary, [tabindex]:not([tabindex='-1'])")]
          .filter(el => !el.disabled && !el.closest("[hidden]") && el.tabIndex >= 0 && (el.offsetParent || el.getClientRects().length));
        const pos = tabbables.indexOf(btn);
        const key = () => doc.body.dispatchEvent(new w.KeyboardEvent("keydown", { key: "S", code: "KeyS", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
        key(); await wait(50);
        const onAfterKey = btn.getAttribute("aria-pressed") === "true" && localStorage.getItem("ecosphear.hoverSpeech") === "on";
        btn.focus(); btn.click(); await wait(50);   // Enter / Space на кнопці = click
        const offAfterBtn = btn.getAttribute("aria-pressed") === "false" && localStorage.getItem("ecosphear.hoverSpeech") === "off";
        const text = w.jukebox.hoverSpeech.speechText(doc.getElementById("play"));
        check("Озвучення під курсором: вимкнено за замовчуванням, перемикач серед перших у Tab, Alt+Shift+S і кнопка з клавіатури, стан у localStorage, текст = підпис + підказка мовою UI",
          offByDefault && pos >= 0 && pos <= 4 && onAfterKey && offAfterBtn && /^Play\. Play or pause/.test(text),
          `за замовч.: ${offByDefault}, позиція Tab: ${pos + 1}, Alt+Shift+S: ${onAfterKey}, кнопка: ${offAfterBtn}, текст: «${text}»`);
        w.speechSynthesis?.cancel();
      } finally { fr.remove(); }
    });
  } finally { if (prev === null) localStorage.removeItem("ecosphear.hoverSpeech"); else localStorage.setItem("ecosphear.hoverSpeech", prev); }
});
