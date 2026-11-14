// Введення теми: текст або голос (Web Speech API), UA/EN.
// Розпізнали → aria-live «Розпізнано: … Enter — підтвердити, Esc — змінити»; не розпізнали → список тем.
import { matchTopic, topicName } from "../topics/topics.js";
import { announce } from "../a11y/announcer.js";

const $ = id => document.getElementById(id);

export function setupTopicInput({ topics, onTopic }) {
  const input = $("topic"), hint = $("topic-hint"), list = $("topic-list"), mic = $("mic");
  let lang = "uk", current = null, pending = null, timer = 0;

  const label = t => topicName(t, lang);
  function setHint(text) { hint.textContent = text; }

  function showList(show) {
    list.hidden = !show;
    if (!show) return;
    list.replaceChildren(...topics.map(t => {
      const li = document.createElement("li");
      const b = Object.assign(document.createElement("button"), { type: "button", textContent: label(t) });
      b.addEventListener("click", () => { apply(t); input.focus(); });
      li.appendChild(b);
      return li;
    }));
  }

  function evaluate(speak) {
    const m = matchTopic(input.value, topics);
    pending = m.topic;
    if (!input.value.trim()) { setHint(current ? `Тема: ${label(current)}.` : "Тему не вибрано."); return m; }
    if (m.topic) {
      const msg = `Розпізнано: ${label(m.topic)} (впевненість ${Math.round(m.score * 100)} %). Enter — підтвердити, Esc — змінити.`;
      setHint(msg);
      if (speak) announce(msg, { force: true });
    } else {
      const msg = "Тему не розпізнано. Натисніть Enter, щоб вибрати зі списку, або спробуйте інші слова.";
      setHint(msg);
      if (speak) announce(msg, { force: true });
    }
    return m;
  }

  function apply(t) {
    current = t; pending = null;
    input.value = label(t);
    showList(false);
    setHint(`Тема: ${label(t)}. Звук: ${t.soundProfile.why}.`);
    announce(`Тема: ${label(t)}. ${t.soundProfile.why}.`, { force: true });
    onTopic(t);
  }

  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => evaluate(true), 450); });
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      const m = evaluate(false);
      if (m.topic) apply(m.topic);
      else { showList(true); announce(`Тему не розпізнано. Виберіть зі списку з ${topics.length} тем: Tab — далі, Enter — вибрати.`, { force: true }); }
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.value = current ? label(current) : "";
      showList(false);
      setHint(current ? `Тема: ${label(current)}.` : "Тему не вибрано.");
      announce("Зміну теми скасовано.", { force: true });
    }
  });

  // мова: впливає на розпізнавання голосу й назви тем
  for (const [id, l] of [["lang-uk", "uk"], ["lang-en", "en"]]) {
    $(id).addEventListener("click", () => {
      lang = l;
      $("lang-uk").setAttribute("aria-pressed", String(l === "uk"));
      $("lang-en").setAttribute("aria-pressed", String(l === "en"));
      if (current) input.value = label(current);
      announce(l === "uk" ? "Мова: українська." : "Language: English.", { force: true });
    });
  }

  // голос: Web Speech API; немає підтримки — мікрофон ховаємо, лишаємо текст
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    mic.hidden = false;
    let rec = null;
    mic.addEventListener("click", () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = lang === "uk" ? "uk-UA" : "en-US";
      rec.interimResults = false; rec.maxAlternatives = 3;
      mic.setAttribute("aria-pressed", "true");
      announce(lang === "uk" ? "Слухаю. Скажіть, що на карті." : "Listening. Say what is on the map.", { force: true });
      rec.onresult = ev => {
        // з кількох варіантів розпізнавання беремо той, що найкраще збігся з темою
        const alts = [...ev.results[0]].map(r => r.transcript);
        const best = alts.map(a => ({ a, m: matchTopic(a, topics) })).sort((x, y) => y.m.score - x.m.score)[0];
        input.value = best.a;
        evaluate(true);
      };
      rec.onerror = ev => announce(`Голос не розпізнано (${ev.error}). Введіть текстом.`, { force: true });
      rec.onend = () => { rec = null; mic.setAttribute("aria-pressed", "false"); input.focus(); };
      rec.start();
    });
  }

  return {
    /** Тема з галереї підставляється сама (без повторного оголошення), але її можна змінити. */
    set(t, { silent = true } = {}) {
      current = t; input.value = t ? label(t) : "";
      setHint(t ? `Тема: ${label(t)}. Звук: ${t.soundProfile.why}. Змінити — введіть інше й натисніть Enter.` : "Тему не вказано — звучить нейтральний оркестр. Напишіть або скажіть, що на карті.");
      if (!silent && t) announce(`Тема: ${label(t)}.`, { force: true });
    },
    get: () => current,
  };
}
