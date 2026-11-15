// Введення теми: текст або голос (Web Speech API), UA/EN.
// Розпізнали → aria-live «Розпізнано: … Enter — підтвердити, Esc — змінити»; не розпізнали → список тем.
import { matchTopic, topicName } from "../topics/topics.js";
import { announce } from "../a11y/announcer.js";
import { t, getLang, speechLang } from "../i18n/index.js";

const $ = id => document.getElementById(id);

export function setupTopicInput({ topics, onTopic }) {
  const input = $("topic"), hint = $("topic-hint"), list = $("topic-list"), mic = $("mic");
  let current = null, pending = null, timer = 0, lastHint = () => t("topic.none");

  // мова теми й розпізнавання голосу = мова інтерфейсу (перемикач UA/EN угорі сторінки)
  const label = tp => topicName(tp, getLang());
  const why = tp => (getLang() === "en" ? tp.soundProfile.why_en || tp.soundProfile.why : tp.soundProfile.why);
  /** text — функція, щоб підказку можна було перекласти при зміні мови. */
  function setHint(text) { lastHint = typeof text === "function" ? text : () => text; hint.textContent = lastHint(); }

  function showList(show) {
    list.hidden = !show;
    if (!show) return;
    list.replaceChildren(...topics.map(tp => {
      const li = document.createElement("li");
      const b = Object.assign(document.createElement("button"), { type: "button", textContent: label(tp) });
      b.dataset.tip = "tip.topicItem";
      b.addEventListener("click", () => { apply(tp); input.focus(); });
      li.appendChild(b);
      return li;
    }));
  }

  function evaluate(speak) {
    const m = matchTopic(input.value, topics);
    pending = m.topic;
    if (!input.value.trim()) { setHint(() => (current ? t("topic.current", { name: label(current) }) : t("topic.none"))); return m; }
    if (m.topic) {
      const tp = m.topic, pct = Math.round(m.score * 100);
      setHint(() => t("topic.recognized", { name: label(tp), pct }));
      if (speak) announce(t("topic.recognized", { name: label(tp), pct }), { force: true });
    } else {
      setHint(() => t("topic.unrecognized"));
      if (speak) announce(t("topic.unrecognized"), { force: true });
    }
    return m;
  }

  function apply(tp) {
    current = tp; pending = null;
    input.value = label(tp);
    showList(false);
    setHint(() => t("topic.applied", { name: label(tp), why: why(tp) }));
    announce(t("topic.appliedSay", { name: label(tp), why: why(tp) }), { force: true });
    onTopic(tp);
  }

  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => evaluate(true), 450); });
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      const m = evaluate(false);
      if (m.topic) apply(m.topic);
      else { showList(true); announce(t("topic.chooseList", { n: topics.length }), { force: true }); }
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.value = current ? label(current) : "";
      showList(false);
      setHint(() => (current ? t("topic.current", { name: label(current) }) : t("topic.none")));
      announce(t("topic.cancel"), { force: true });
    }
  });

  // голос: Web Speech API; немає підтримки — мікрофон ховаємо, лишаємо текст
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    mic.hidden = false;
    let rec = null;
    mic.addEventListener("click", () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = speechLang();
      rec.interimResults = false; rec.maxAlternatives = 3;
      mic.setAttribute("aria-pressed", "true");
      announce(t("topic.listening"), { force: true });
      rec.onresult = ev => {
        // з кількох варіантів розпізнавання беремо той, що найкраще збігся з темою
        const alts = [...ev.results[0]].map(r => r.transcript);
        const best = alts.map(a => ({ a, m: matchTopic(a, topics) })).sort((x, y) => y.m.score - x.m.score)[0];
        input.value = best.a;
        evaluate(true);
      };
      rec.onerror = ev => announce(t("topic.voiceError", { err: ev.error }), { force: true });
      rec.onend = () => { rec = null; mic.setAttribute("aria-pressed", "false"); input.focus(); };
      rec.start();
    });
  }

  return {
    /** Тема з галереї підставляється сама (без повторного оголошення), але її можна змінити. */
    set(tp, { silent = true } = {}) {
      current = tp; input.value = tp ? label(tp) : "";
      setHint(() => (tp ? t("topic.set", { name: label(tp), why: why(tp) }) : t("topic.unset")));
      if (!silent && tp) announce(t("topic.current", { name: label(tp) }), { force: true });
    },
    /** Мову змінили: назва теми в полі, підказка, список тем. */
    refresh() {
      if (current && (!input.value.trim() || input.value === topicName(current, getLang() === "en" ? "uk" : "en"))) input.value = label(current);
      hint.textContent = lastHint();
      if (!list.hidden) showList(true);
    },
    get: () => current,
  };
}
