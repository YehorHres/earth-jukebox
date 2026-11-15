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

// 8. Таймлайн (шкала, перетягування, клавіші, aria), швидкість відтворення, мікшер
V10UI_SUITES.push(async function timelineMixer(check) {
  const { scaleTicks } = await import("./ui/timeline.js");
  const { Player, RATES } = await import("./audio/player.js");
  const yl = scaleTicks(160, [2017, 2023]).map(x => x.label), tl = scaleTicks(160).map(x => x.label);
  check("v10 §8: шкала таймлайну — роки з картки або час (≤ 9 міток)", yl[0] === "2017" && yl.at(-1) === "2023" && tl[0] === "0:00" && tl.includes("0:30") && tl.length <= 9 && yl.length <= 9, `роки: ${yl.join(" ")}; час: ${tl.join(" ")}`);

  // швидкість: годинник музики × rate, без стрибка позиції; відео — та сама швидкість, дрейф > 20 мс підтягується без перемотки
  const ctx = { currentTime: 0 }, video = { currentTime: 0, playbackRate: 1, paused: false, play: () => Promise.resolve(), pause() {} };
  const p = new Player({ ctx });
  p.score = { duration: 100, barDur: 2 }; p.source = { kind: "video", el: video, duration: 100 };
  p.playing = true; p.pos = 10; p.startCtx = 0; ctx.currentTime = 2;
  const before = p.time; p.setRate(1.5); ctx.currentTime = 4; const after = p.time;
  video.currentTime = after - 0.03; p.syncVideo(false); const nudged = video.playbackRate, seekedSmall = Math.abs(video.currentTime - (after - 0.03)) < 1e-9;
  video.currentTime = after - 0.2; p.syncVideo(false); const fixed = Math.abs(video.currentTime - after) < 1e-9;
  check("v10 §8: швидкість 0.5×–1.5× — музика й відео разом; позиція не стрибає; розбіжність > 20 мс підтягується (< 50 мс), > 80 мс — перемотка",
    RATES.join() === "0.5,0.75,1,1.25,1.5" && before === 12 && Math.abs(after - 15) < 1e-9 && nudged > 1.5 && seekedSmall && fixed && p.rate === 1.5,
    `час ${before} → ${after.toFixed(2)} (2 с × 1.5); відео підтягнуто швидкістю ${nudged.toFixed(2)}; велика розбіжність — перемотка: ${fixed}`);

  const { openApp } = await import("./tests-ui.js");
  const prevMix = localStorage.getItem("ej.mix");
  const { fr, w, doc } = await openApp("index.html");
  try {
    await w.jukebox.loadItem(w.jukebox.catalog[0]);
    for (let i = 0; i < 40 && !doc.querySelector("#parts input.vol"); i++) await new Promise(r => setTimeout(r, 250));
    const cv = doc.getElementById("timeline"), app = w.jukebox;
    const { scoreHash } = await import("./audio/report.js");
    const h0 = scoreHash(app.score);
    const key = k => cv.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true }));
    key("End"); await new Promise(r => setTimeout(r, 150)); const endNow = Number(cv.getAttribute("aria-valuenow")), endText = cv.getAttribute("aria-valuetext");
    key("Home"); await new Promise(r => setTimeout(r, 150)); const homeNow = Number(cv.getAttribute("aria-valuenow"));
    const r = cv.getBoundingClientRect(), pe = (type, x) => cv.dispatchEvent(new w.PointerEvent(type, { clientX: r.left + x * r.width, clientY: r.top + 10, pointerId: 1, bubbles: true }));
    pe("pointerdown", 0.2); pe("pointermove", 0.4); pe("pointermove", 0.5); pe("pointerup", 0.5);
    await new Promise(r => setTimeout(r, 200));
    const dragNow = Number(cv.getAttribute("aria-valuenow")), dur = Number(cv.getAttribute("aria-valuemax"));
    check("v10 §8: таймлайн — role=slider, Home/End, перетягування мишею/пальцем, aria-valuetext «час з тривалості, розділ»",
      cv.getAttribute("role") === "slider" && homeNow === 0 && endNow >= dur - 1 && Math.abs(dragNow - dur * 0.5) <= Math.max(2, dur * 0.05) && /\d:\d\d (з|of) \d:\d\d, \S/.test(endText) && Math.abs(app.player.time - dur * 0.5) < Math.max(2, dur * 0.05),
      `End → ${endNow} («${endText}»), Home → ${homeNow}, перетягування до 50 % → ${dragNow} з ${dur}`);

    const vols = [...doc.querySelectorAll("#parts input.vol")], master = doc.querySelector("#mix-master input");
    const v0 = vols[0]; v0.value = 40; v0.dispatchEvent(new w.Event("input"));
    master.value = 80; master.dispatchEvent(new w.Event("input"));
    const stored = JSON.parse(localStorage.getItem("ej.mix") || "{}"), pid = app.score.parts[0].id;
    const ok = vols.length === app.score.parts.length && vols.every(v => v.dataset.tip && v.getAttribute("aria-label")) && master.dataset.tip &&
      v0.getAttribute("aria-valuetext").includes("40") && stored[`part:${pid}`] === 0.4 && stored.master === 0.8 && app.engine.getPart(pid).vol === 0.4 && app.engine.userVol === 0.8 && scoreHash(app.score) === h0;
    check("v10 §8: мікшер — повзунок кожної партії й загальна гучність, aria-valuetext, localStorage; партитура не змінюється",
      ok, `${vols.length} партій + загальна; збережено ${JSON.stringify(stored)}; партитура ${scoreHash(app.score) === h0 ? "та сама" : "ЗМІНИЛАСЬ"}`);
  } finally {
    fr.remove();
    if (prevMix === null) localStorage.removeItem("ej.mix"); else localStorage.setItem("ej.mix", prevMix);
  }
});
