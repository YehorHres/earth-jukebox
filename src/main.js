// Earth Jukebox v2 — склеює шари та інтерфейс.
import { openVideo, openImage, openSynthetic } from "./media/sources.js";
import { analyzeSource, prepareImageScan } from "./analysis/analyze.js";
import { describeProfile, SCALE_LABEL } from "./a11y/describe.js";
import { initAnnouncer, announce, prefs, stopVoice } from "./a11y/announcer.js";
import { createTimeline } from "./ui/timeline.js";
import { presetFor, mapAnalysis } from "./mapping/mapper.js";
import { loadTopics, getTopic } from "./topics/topics.js";
import { setupTopicInput } from "./ui/topic-input.js";
import { createMappingTable } from "./ui/mapping-table.js";
import { setupPlayback } from "./ui/playback.js";
import { setupExplore } from "./ui/explore.js";
import { GRAMMAR } from "./grammar.js";
import { setupGalleryMenu } from "./ui/gallery-menu.js";
import { applyMotion, MOTION_LABEL, MOTION_NOTE } from "./analysis/motion.js";
import { resolvePolarity } from "./analysis/palette.js";
import { loadEic, matchEic, cardSettings, cardLines } from "./eic/match.js";
import { t, tr, pick, getLang, setLang, onLang, applyDom, registerExact, speechLang } from "./i18n/index.js";
import { setupTooltips } from "./ui/tooltip.js";
import { setupHoverSpeech } from "./ui/hover-speech.js";
import { cardYears } from "./a11y/explain.js";
import { getSpeechRate, setSpeechRate, utterRate, RATE_STEP } from "./a11y/speech.js";

const $ = id => document.getElementById(id);
const NO_CACHE = new URLSearchParams(location.search).has("nocache");   // ?nocache — завжди аналізувати заново
const app = { scanDir: "we", source: null, profile: null, analysis: null, catalogItem: null, busy: false };
window.jukebox = app; // для налагодження й автотестів

applyDom();
initAnnouncer($("live"));
const galleryMenu = setupGalleryMenu();
app.tooltips = setupTooltips();
app.hoverSpeech = setupHoverSpeech();
const timeline = createTimeline($("timeline"), $("tl-legend"), {
  tipEl: $("tl-tip"),
  onSeek: t => {
    if (app.score) return app.seekTo(t);
    if (app.source?.kind === "video") app.source.el.currentTime = t;
    timeline.setCursor(t);
  },
});
const mappingTable = createMappingTable($("mapping"));
const playback = setupPlayback(app, { timeline, mappingTable });
const onMapped = playback.onMapped;
const explore = setupExplore(app, { engine: app.engine });   // шар 3: партитура й плеєр після мапінгу
let lastStatus = () => t("status.none");
/** s — рядок (текст модулів аналізу, перекладається tr) або функція () => текст мовою UI. */
const setStatus = s => { lastStatus = typeof s === "function" ? s : () => tr(s); $("status").textContent = lastStatus(); };
const setProgress = p => ($("progress").firstElementChild.style.width = `${Math.round(p * 100)}%`);

/* ---------------- галерея й завантаження ---------------- */
async function loadCatalog() {
  const res = await fetch("samples/catalog.json");
  const items = await res.json();
  const g = $("gallery");
  for (const it of items) {
    if (it.hidden) continue;   // тестові пункти: лишаються в каталозі для test.html, у галереї не показуємо
    const b = document.createElement("button");
    b.dataset.kind = it.kind;
    b.dataset.tip = "tip.galleryItem";
    b.dataset.id = it.id;
    labelGalleryItem(b, it);
    b.addEventListener("click", () => loadItem(it));
    g.appendChild(b);
  }
  return items;
}

/** Підпис пункту галереї мовою інтерфейсу (назва + опис для скрінрідера). */
function labelGalleryItem(b, it) {
  b.textContent = pick(it, "title");
  b.setAttribute("aria-description", pick(it, "desc"));
}

function loadItem(it) {
  app.catalogItem = it;
  return loadSource(pick(it, "title"), async () => {
    if (it.kind === "synthetic") return openSynthetic(it.synth, { name: it.title });
    if (it.kind === "image") return openImage(it.src[0], { name: it.title });
    return openVideo(it.src, { name: it.id, fps: it.fps });
  }, it);
}

function loadFile(file) {
  if (!file) return;
  app.catalogItem = null;
  return loadSource(file.name, () => file.type.startsWith("image/") ? openImage(file) : openVideo(file), null);
}

async function loadSource(title, open, item) {
  if (app.busy) return;
  app.busy = true;
  stopVoice();
  playback.stop();
  app.profile = app.analysis = app.mapping = app.score = null;
  app.eicCard = null; app.eicMatch = null; $("eic-offer").hidden = true;
  $("mapping-wrap").hidden = true;
  $("parts-wrap").hidden = true;
  explore.setOn(false);
  ["play", "legendBtn", "exportBtn", "wavBtn", "exploreBtn"].forEach(id => ($(id).disabled = true));
  $("legend-wrap").hidden = true;
  $("card").hidden = true;
  $("timeline-wrap").hidden = true;
  setProgress(0);
  try {
    setStatus(() => t("status.opening", { title }));
    let src = await open(), scaleHint = null;
    app.stillProfile = null;
    // фото → режим сканування: лінія йде по карті (із заходу на схід або з півночі на південь)
    if (src.kind === "image" && !src.scan) {
      setStatus(() => t("status.imageScan"));
      const prep = await prepareImageScan(src, app.scanDir);
      src = prep.source; scaleHint = prep.scaleHint;
      app.stillProfile = prep.stillProfile;          // область і шкала всього фото — для режиму дослідження
    }
    $("scanDir").hidden = !src.scan;
    $("scanDir").textContent = t(app.scanDir === "we" ? "scan.we" : "scan.ns");
    app.source = src;
    showMedia(src);
    announce(t("status.opened", { title, desc: item ? pick(item, "desc") : "" }), { force: true });

    const t0 = performance.now();
    let lastSpoken = -1;
    app.analysis = await analyzeSource(src, {
      sceneOverride: item?.sceneType || null,
      projection: projectionOf(src, item),
      precomputedUrl: NO_CACHE ? null : item?.analysis || null,
      useCache: !NO_CACHE,
      scaleHint,
      motion: item ? item.motionType || "temporal" : null,   // галерея — як раніше; своє відео — тип руху визначається сам
      layout: !item,                                           // static / chart / composite — лише для своїх відео
      onProgress: (stage, p, msg, profile) => {
        if (stage === "A") { setProgress(p * 0.15); setStatus(msg); }
        if (stage === "A-done") { app.profile = profile; renderCard(false); drawMasks(); }
        if (stage === "B") {
          setProgress(0.15 + 0.85 * p); setStatus(msg);
          const q = Math.floor(p * 4);                       // скрінрідеру — раз на 25 %
          if (q > lastSpoken && q < 4) { lastSpoken = q; announce(msg, { throttle: false }); }
        }
      },
    });
    app.profile = app.analysis.profile;
    // статичне відео або графік: звучить сканування кадру — показуємо цей кадр і лінію сканування
    if (app.analysis.replacedSource) { src = app.source = app.analysis.replacedSource; showMedia(src); }
    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    setProgress(1);
    const an = app.analysis;
    setStatus(() => t("status.analysisSummary", {
      how: an.fromCache ? tr("Аналіз узято з кешу") : an.fromPrecomputed ? tr("Готовий аналіз завантажено") : t("status.analysisDone", { s: dt }),
      n: an.count, e: an.events.length }));
    renderCard();
    $("timeline-wrap").hidden = false;     // спершу показати — інакше canvas має ширину 0
    timeline.set(app.analysis);

    // тема: з галереї — підставляється сама; для свого файлу — нейтральна, доки користувач не скаже
    // своє відео: тема й полярність, збережені для цього файлу минулого разу
    const saved = item ? null : loadRead(src.key);
    app.polarityChoice = saved?.polarity || "auto";
    app.topic = getTopic(item?.topic || saved?.topic || "generic");
    topicInput.set(item?.topic || saved?.topic ? app.topic : null);
    if (!item?.topic && !saved?.topic) announce(t("status.askTopic"), { force: true });

    showReadOptions(item);
    if (!item) offerEic(src.name, saved);
    // шари 2–3: мапінг і партитура
    await remap();
    $("exportBtn").disabled = false;
    drawMasks();
    // фокус на «Грати»: інакше пробіл на кнопці галереї знову запустив би аналіз
    if (document.activeElement?.closest("#gallery, #drop") || document.activeElement === document.body) $("play").focus();
  } catch (e) {
    console.error(e);
    // формат, якого браузер не декодує, — зрозуміла порада замість технічної помилки (текст + aria-live)
    const msg = () => (e.code === "format" ? tr(e.message) : t("status.error", { msg: e.message }));
    setStatus(msg);
    announce(msg(), { force: true });
  } finally {
    app.busy = false;
  }
}

/** Мапінг і композиція для поточної теми (без повторного аналізу відео). */
async function remap() {
  app.preset = await presetFor(app.profile.sceneType, app.topic);
  // v7 §3: полярність — лише для завантажених файлів (галерея: як задано темою)
  const polRes = app.catalogItem ? null : resolvePolarity(app.polarityChoice, app.profile, app.topic);
  app.polarityText = polRes ? polRes.text : "";
  if (polRes) $("polarity-hint").textContent = tr(polRes.text);
  app.mapping = mapAnalysis(app.analysis, app.preset, { topic: app.topic, timeUnit: app.catalogItem?.timeUnit || null, polarity: polRes ? polRes.pol : null, name: app.catalogItem ? null : app.source?.name || null });
  timeline.setSections(app.mapping.meta.sections.map(s => ({
    label: tr(s.label), t0: s.b0 * app.mapping.meta.barDur, t1: s.b1 * app.mapping.meta.barDur,
  })));
  timeline.setYears(cardYears(app.eicCard || app.catalogItem?.card));
  $("mapping-wrap").hidden = false;
  mappingTable.set(app.mapping, app.preset, app.analysis);
  await onMapped?.();
}
app.setTopic = async topic => {
  app.topic = topic;
  if (!app.analysis || app.busy) return;
  saveRead();
  const wasPlaying = app.player?.playing;
  await remap();
  setStatus(() => t("status.topic", { name: pick(app.topic, "name"), key: app.score.key, meter: app.score.meter.id, bpm: app.score.bpm }));
  if (wasPlaying) app.player.play();
};

/* ---------------- v7: як читати завантажене відео (тип руху) ---------------- */
function showReadOptions(item) {
  const mo = app.analysis?.motion, show = !item && !!app.analysis;
  $("read-opts").hidden = !show;
  if (!show) return;
  $("polarity").value = app.polarityChoice || "auto";
  if (app.polarityText) $("polarity-hint").textContent = tr(app.polarityText);
  $("motion-row").hidden = $("motion-hint").hidden = !mo || (app.source?.kind !== "video" && !app.source?.scan) || !!app.stillProfile;
  $("motionType").disabled = ["static", "chart"].includes(mo?.type);   // ці типи вже замінили відео скануванням кадру
  if (!mo) return;
  if (![...$("motionType").options].some(o => o.value === mo.type)) $("motionType").add(new Option(tr(MOTION_LABEL[mo.type] || mo.type), mo.type));
  $("motionType").value = mo.type;
  $("motion-hint").textContent = `${t(mo.auto ? "motion.auto" : "motion.manual")}${mo.why ? `: ${tr(mo.why)}` : ""}. ${tr(mo.note || MOTION_NOTE[mo.type] || "")}`;
}
$("motionType").addEventListener("change", async e => {
  if (!app.analysis || app.busy) return;
  const wasPlaying = app.player?.playing;
  app.analysis = applyMotion(app.analysis, e.target.value, { auto: false });
  showReadOptions(null);
  renderCard(false);
  timeline.set(app.analysis);
  await remap();
  announce(t("motion.announce", { label: tr(MOTION_LABEL[e.target.value]), note: tr(MOTION_NOTE[e.target.value] || "") }), { force: true });
  if (wasPlaying) app.player.play();
});

/* ---------------- v7 §3: «що означає більше» — полярність голосу даних ---------------- */
const READ_KEY = "ecosphear-read:";
function loadRead(key) { try { return JSON.parse(localStorage.getItem(READ_KEY + key) || "null"); } catch { return null; } }
function saveRead() {
  if (app.catalogItem || !app.source) return;
  try { localStorage.setItem(READ_KEY + app.source.key, JSON.stringify({ topic: app.topic?.id === "generic" ? null : app.topic?.id, polarity: app.polarityChoice, eic: app.eicCard?.id ?? (app.eicDeclined ? 0 : null) })); } catch { /* приватний режим — не зберігаємо */ }
}
$("polarity").addEventListener("change", async e => {
  app.polarityChoice = e.target.value;
  if (!app.analysis || app.busy) return;
  const wasPlaying = app.player?.playing;
  saveRead();
  await remap();
  announce($("polarity-hint").textContent, { force: true });
  if (wasPlaying) app.player.play();
});

/* ---------------- v8: картка NASA EIC за назвою файлу ---------------- */
/** Поле картки мовою інтерфейсу: card[field + "_en"] в англійському режимі (якщо є). */
const cardField = (card, f) => (getLang() === "en" ? card[f + "_en"] ?? tr(card[f]) : card[f]);
/** Картка з полями мовою інтерфейсу — для cardLines (src/eic/match.js не змінюємо). */
const localCard = card => (getLang() === "en"
  ? { ...card, desc: cardField(card, "desc"), variable: cardField(card, "variable"), units: cardField(card, "units"), colors: cardField(card, "colors"),
      region: cardField(card, "region"), years: cardField(card, "years"), credit: cardField(card, "credit") }
  : card);
const eicLines = card => cardLines(localCard(card)).map(tr);
function showEicOffer() {
  const m = app.eicMatch;
  $("eic-text").textContent = t("eic.offer", { title: pick(m.card, "title"), why: tr(m.why) });
}
function offerEic(fileName, saved) {
  app.eicDeclined = saved?.eic === 0;
  const m = matchEic(fileName, app.eic);
  if (!m || app.eicDeclined) return;
  app.eicMatch = m;
  if (saved?.eic === m.card.id) { app.eicCard = m.card; return; }          // уже підтверджено минулого разу
  showEicOffer();
  $("eic-offer").hidden = false;
  announce($("eic-text").textContent + " " + t("eic.offerHint"), { force: true });
}
/** Застосувати картку: тема, тип руху, полярність, опис. */
app.applyEicCard = async card => {
  app.eicCard = card; app.eicDeclined = false;
  $("eic-offer").hidden = true;
  if (!app.analysis || app.busy) return;
  const set = cardSettings(card), wasPlaying = app.player?.playing;
  if (set.topic) { app.topic = getTopic(set.topic); topicInput.set(app.topic); }
  app.polarityChoice = set.polarity;
  if (set.motion && app.analysis.motion && app.analysis.motion.type !== set.motion && !app.analysis.replacedSource) app.analysis = applyMotion(app.analysis, set.motion, { auto: false });
  showReadOptions(null);
  saveRead();
  renderCard(false);
  timeline.set(app.analysis);
  await remap();
  announce(t("eic.applied", { title: pick(card, "title"), topic: pick(app.topic, "name"), line: eicLines(card)[0] }), { force: true });
  $("play").focus();
  if (wasPlaying) app.player.play();
};
$("eic-yes").addEventListener("click", () => app.eicMatch && app.applyEicCard(app.eicMatch.card));
$("eic-no").addEventListener("click", () => {
  app.eicDeclined = true; $("eic-offer").hidden = true; saveRead();
  announce(t("eic.declined"), { force: true });
  $("topic").focus();
});

/** Плоска карта світу має пропорцію ~2:1; глобус і графіки — ні (тоді без широт/довгот у підписах). */
export function projectionOf(src, item) {
  if (item?.projection) return item.projection;
  const r = src.width && src.height ? src.width / src.height : 0;
  return r > 1.9 && r < 2.1 ? "equirect" : "other";
}

function showMedia(src) {
  const viewer = $("viewer");
  // прибираємо попереднє медіа, але не шари поверх нього (маски й курсор сканування)
  viewer.querySelectorAll("video, img, canvas:not(#overlay):not(#cursor)").forEach(n => n.remove());
  $("placeholder").hidden = true;
  if (src.kind === "image") src.el.alt = app.catalogItem ? pick(app.catalogItem, "desc") : t("image.alt", { name: src.name });
  viewer.insertBefore(src.el, $("overlay"));
}

/* ---------------- картка «що зрозумів» ---------------- */
function renderCard(speak = true) {
  const p = app.profile;
  const lines = describeProfile(p, app.source, app.analysis);
  const card = app.catalogItem?.card;
  if (app.eicCard) lines.unshift(...eicLines(app.eicCard));
  if (card) lines.unshift(t("card.data", { variable: pick(card, "variable"), units: pick(card, "units"), region: pick(card, "region"), years: pick(card, "years"), authors: pick(card, "authors") }));
  if (app.catalogItem?.desc) lines.unshift(t("card.whatOn", { desc: pick(app.catalogItem, "desc") }));
  if (!app.analysis) lines.push(t("card.pending"));
  $("card-lines").replaceChildren(...lines.map(t => Object.assign(document.createElement("li"), { textContent: t })));
  const tags = [
    [p.sceneType, true],
    [t("card.confidence", { pct: Math.round(p.confidence * 100) })],
    [SCALE_LABEL()[p.changeScale]],
    p.period ? [t("card.cycle", { s: p.period.seconds.toFixed(0) })] : null,
  ].filter(Boolean);
  $("card-tags").replaceChildren(...tags.map(([t, hi]) => Object.assign(document.createElement("span"), { className: "tag" + (hi ? " hi" : ""), textContent: t })));
  $("card").hidden = false;
  if (speak) announce(t("card.announce") + " " + lines.join(" "), { force: true });
  const a = app.analysis;
  $("debug").textContent = JSON.stringify({
    profile: debugProfile(p),
    ...(a && { rate: a.rate, count: a.count, processor: a.processor, seconds: a.seconds, passBSeconds: a.passBSeconds,
      norm: round(a.norm), events: round(a.events), period: a.period, climax: round(a.climax), cuts: a.cuts,
      hotspots: a.hotspots.map(h => ({ label: h.label, spread: +h.spread.toFixed(3) })) }),
  }, null, 1);
}

const round = o => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "number" ? +v.toPrecision(4) : v)));
function debugProfile(p) {
  const { staticMask, landMask, bgMask, overlayMask, regionMask, ...rest } = p;
  return round(rest);
}

/* ---------------- маски поверх кадру ---------------- */
function drawMasks() {
  const cv = $("overlay"), p = app.profile;
  const g = cv.getContext("2d");
  if (!$("showMasks").checked || !p) { g.clearRect(0, 0, cv.width, cv.height); return; }
  cv.width = p.maskW; cv.height = p.maskH;
  const img = g.createImageData(p.maskW, p.maskH);
  for (let i = 0; i < p.maskW * p.maskH; i++) {
    const c = p.regionMask && !p.regionMask[i] ? [255, 140, 0] : p.landMask[i] ? [60, 200, 90] : p.bgMask[i] ? [60, 110, 255] : p.overlayMask[i] ? [230, 60, 230] : null;
    if (!c) continue;
    img.data.set([...c, 150], i * 4);
  }
  g.putImageData(img, 0, 0);
}
$("showMasks").addEventListener("change", drawMasks);

/* ---------------- експорт ---------------- */
$("exportBtn").addEventListener("click", () => {
  const data = JSON.parse($("debug").textContent || "{}");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  a.download = `earth-jukebox-${app.source?.name || "analysis"}.json`;
  a.click();
});

/* ---------------- доступність і клавіатура ---------------- */
$("announce").addEventListener("change", e => (prefs.announce = e.target.checked));
$("voice").addEventListener("change", e => (prefs.voice = e.target.checked));
$("intro").addEventListener("change", e => (prefs.intro = e.target.checked));
// v10 §7: швидкість мовлення (0.5×–2×) — повзунок і клавіші − / =; після зміни — фраза-приклад
const rateEl = $("speechRate");
const showRate = () => {
  const r = getSpeechRate(), txt = t("speech.rateVal", { r: String(r).replace(".", getLang() === "uk" ? "," : ".") });
  rateEl.value = r; $("speechRateVal").textContent = txt; rateEl.setAttribute("aria-valuetext", txt);
};
function changeRate(v) {
  setSpeechRate(v); showRate();
  const text = t("speech.sample", { r: $("speechRateVal").textContent });
  if (window.speechSynthesis) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang(); u.rate = utterRate(1.05);
    speechSynthesis.speak(u);
  }
  announce(text, { force: true });
}
rateEl.addEventListener("change", e => changeRate(e.target.value));
showRate();
document.addEventListener("keydown", e => {
  if (e.target?.matches?.("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "-" || k === "_") { e.preventDefault(); changeRate(getSpeechRate() - RATE_STEP); return; }
  if (k === "=" || k === "+") { e.preventDefault(); changeRate(getSpeechRate() + RATE_STEP); return; }
  if (e.code === "KeyD" && app.profile) {
    announce(t("card.announce") + " " + describeProfile(app.profile, app.source, app.analysis).join(" "), { force: true });
  }
});

/* ---------------- файл / перетягування ---------------- */
const fileName = () => ($("file-name").textContent = app.lastFile?.name || t("drop.none"));
$("file").addEventListener("change", e => { app.lastFile = e.target.files[0]; fileName(); loadFile(e.target.files[0]); });
$("scanDir").addEventListener("click", () => {
  app.scanDir = app.scanDir === "we" ? "ns" : "we";
  announce(t(app.scanDir === "we" ? "scan.sayWe" : "scan.sayNs"), { force: true });
  if (app.catalogItem) loadItem(app.catalogItem); else if (app.lastFile) loadFile(app.lastFile);
});
const drop = $("drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => { app.lastFile = e.dataTransfer.files[0]; fileName(); loadFile(app.lastFile); });

app.topics = await loadTopics();
app.eic = await loadEic().catch(() => []);
// пари «українською → англійською» з даних: тексти модулів звуку (напр. «… + тема «Океанські течії»») перекладаються на виході
for (const tp of app.topics) {
  registerExact(tp.name?.uk, tp.name?.en);
  registerExact(tp.more?.uk, tp.more?.en);
  registerExact(tp.soundProfile?.why, tp.soundProfile?.why_en);
}
const topicInput = setupTopicInput({ topics: app.topics, onTopic: t => app.setTopic(t) });
app.catalog = await loadCatalog();
app.loadItem = loadItem;
app.loadFile = loadFile;

// граматика звуку (v5-A): одна таблиця для всіх тем
function renderGrammar() {
  const tb = document.getElementById("grammar-rows");
  if (!tb) return;
  tb.replaceChildren(...GRAMMAR.map(r => {
    const row = document.createElement("tr");
    row.append(Object.assign(document.createElement("th"), { scope: "row", textContent: pick(r, "data") }), Object.assign(document.createElement("td"), { textContent: pick(r, "sound") }));
    return row;
  }));
}
renderGrammar();
for (const it of app.catalog) {
  registerExact(it.title, it.title_en); registerExact(it.desc, it.desc_en); registerExact(it.colorMore, it.colorMore_en);
}

/* ---------------- мова інтерфейсу ---------------- */
function syncLangButtons() {
  for (const l of ["uk", "en"]) $(`lang-${l}`).setAttribute("aria-pressed", String(getLang() === l));
}
for (const l of ["uk", "en"]) $(`lang-${l}`).addEventListener("click", () => {
  if (getLang() === l) return;
  setLang(l);
  announce(t("lang.announce"), { force: true });
});
/** Перемалювати все, що створює JS: галерея, граматика, картка, таймлайн, мапінг, плеєр. */
onLang(() => {
  syncLangButtons();
  showRate();
  for (const b of $("gallery").querySelectorAll("button")) { const it = app.catalog.find(x => x.id === b.dataset.id); if (it) labelGalleryItem(b, it); }
  galleryMenu.refresh();
  renderGrammar();
  fileName();
  $("status").textContent = lastStatus();
  $("scanDir").textContent = t(app.scanDir === "we" ? "scan.we" : "scan.ns");
  if (app.profile) renderCard(false);
  if (app.analysis) { timeline.set(app.analysis); showReadOptions(app.catalogItem); }
  if (app.eicMatch && !$("eic-offer").hidden) showEicOffer();
  if (app.mapping) {
    timeline.setSections(app.mapping.meta.sections.map(s => ({ label: tr(s.label), t0: s.b0 * app.mapping.meta.barDur, t1: s.b1 * app.mapping.meta.barDur })));
    mappingTable.set(app.mapping, app.preset, app.analysis);
  }
  topicInput.refresh();
  playback.refresh();
});
syncLangButtons();
$("scanDir").textContent = t("scan.we");
