// Тести PROMPT-v10 блоків 7–8 (голос пояснює, швидкість мовлення, таймлайн, швидкість відтворення, мікшер).
export const V10UI_SUITES = [];

const both = async (fn) => {
  const { getLang, setLang } = await import("./i18n/index.js");
  const prev = getLang(), out = [];
  for (const l of ["uk", "en"]) { setLang(l, { persist: false }); out.push(await fn(l)); }
  setLang(prev, { persist: false });
  return out;
};

// 7. Голос пояснює: вступ ≤ 20 с, W «Що зараз?», підсумок; швидкість мовлення 0.5×–2×
V10UI_SUITES.push(async function voiceExplains(check) {
  const { buildTrack } = await import("./audio/report.js");
  const { getTopic, loadTopics } = await import("./topics/topics.js");
  const E = await import("./a11y/explain.js"), S = await import("./a11y/speech.js");
  await loadTopics();
  const cat = (await (await fetch("samples/catalog.json")).json()).filter(i => i.kind === "video" && i.analysis);
  const bad = [], longest = [];
  for (const it of cat) {
    const tr = await buildTrack(it), topic = getTopic(it.topic), card = it.card;
    await both(l => {
      const title = l === "en" ? it.title_en : it.title;
      const intro = E.introText({ title, card, topic, colorMore: it.colorMore });
      longest.push(S.speechSeconds(intro, 1));
      if (S.speechSeconds(intro, 1) > E.INTRO_MAX_SEC) bad.push(`${it.id}/${l}: вступ ${S.speechSeconds(intro, 1).toFixed(1)} с`);
      if (!intro.startsWith(title)) bad.push(`${it.id}/${l}: вступ без назви`);
      if (!/(захід|west)/.test(intro)) bad.push(`${it.id}/${l}: вступ не каже, як слухати`);
      const t = tr.analysis.profile.durationSec * 0.6, w = E.whatNow({ analysis: tr.analysis, card }, t);
      if (!w.includes(":") || !/(росте|падає|змінюється|rising|falling|steady)/.test(w)) bad.push(`${it.id}/${l}: W «${w}»`);
      if (E.cardYears(card) && !/\b(19|20)\d\d\b/.test(w)) bad.push(`${it.id}/${l}: W без дати`);
      const s = E.trackSummary({ analysis: tr.analysis, mapping: tr.mapping, card });
      const ev = tr.mapping.bars.reduce((q, b) => q + b.events.length, 0);
      if (!s.includes(String(ev)) || !/(Максимум|Maximum)/.test(s)) bad.push(`${it.id}/${l}: підсумок «${s}»`);
    });
  }
  check("v10 §7: вступ ≤ 20 с (uk + en) — назва, як слухати; W — час/дата, напрям, наскільки; підсумок — тренд, максимум, події",
    !bad.length, bad.join("; ") || `найдовший вступ ${Math.max(...longest).toFixed(1)} с, ${cat.length} відео × 2 мови`);

  const r0 = S.getSpeechRate();
  const steps = [0.3, 0.5, 0.62, 1, 1.4, 2, 3].map(v => S.setSpeechRate(v));
  const stored = localStorage.getItem("ej.speechRate");
  S.setSpeechRate(2); const u2 = S.utterRate(1); S.setSpeechRate(0.5); const u05 = S.utterRate(1);
  S.setSpeechRate(r0);
  check("v10 §7: швидкість мовлення 0.5×–2× з кроком 0.25, зберігається в localStorage, множить швидкість усіх голосів",
    steps.join() === "0.5,0.5,0.5,1,1.5,2,2" && stored === "2" && u2 === 2 && u05 === 0.5, `кроки ${steps.join(", ")}; localStorage=${stored}; 2× → ${u2}, 0.5× → ${u05}`);

  const html = await (await fetch("index.html")).text();
  const D = await Promise.all([import("./i18n/uk.js"), import("./i18n/en.js")]).then(m => m.map(x => x.default || Object.values(x)[0]));
  const keys = ["opt.speechRate", "tip.speechRate", "speech.sample", "btn.what", "tip.what"];
  const miss = keys.filter(k => !D.every(d => d && k in d));
  const ui = /id="speechRate"[^>]*min="0.5"[^>]*max="2"[^>]*step="0.25"[^>]*data-tip=/.test(html) && /id="whatBtn"[^>]*aria-keyshortcuts="W"[^>]*data-tip=/.test(html) && /id="track-summary"/.test(html);
  check("v10 §7: повзунок швидкості, кнопка «Що зараз?» (W) і підсумок на сторінці — з підказками, uk + en", ui && !miss.length, miss.length ? `немає ключів: ${miss.join(", ")}` : "є");
});
