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

const $ = id => document.getElementById(id);
const NO_CACHE = new URLSearchParams(location.search).has("nocache");   // ?nocache — завжди аналізувати заново
const app = { scanDir: "we", source: null, profile: null, analysis: null, catalogItem: null, busy: false };
window.jukebox = app; // для налагодження й автотестів

initAnnouncer($("live"));
const timeline = createTimeline($("timeline"), $("tl-legend"), {
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
const setStatus = s => ($("status").textContent = s);
const setProgress = p => ($("progress").firstElementChild.style.width = `${Math.round(p * 100)}%`);

/* ---------------- галерея й завантаження ---------------- */
async function loadCatalog() {
  const res = await fetch("samples/catalog.json");
  const items = await res.json();
  const g = $("gallery");
  for (const it of items) {
    const b = document.createElement("button");
    b.textContent = (it.kind === "synthetic" ? "🧪 " : "🎧 ") + it.title;
    b.title = it.desc;
    b.setAttribute("aria-description", it.desc);
    b.addEventListener("click", () => loadItem(it));
    g.appendChild(b);
  }
  return items;
}

function loadItem(it) {
  app.catalogItem = it;
  return loadSource(it.title, async () => {
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
  $("mapping-wrap").hidden = true;
  $("parts-wrap").hidden = true;
  explore.setOn(false);
  ["play", "legendBtn", "exportBtn", "wavBtn", "exploreBtn"].forEach(id => ($(id).disabled = true));
  $("legend-wrap").hidden = true;
  $("card").hidden = true;
  $("timeline-wrap").hidden = true;
  setProgress(0);
  try {
    setStatus(`Відкриваю «${title}»…`);
    let src = await open(), scaleHint = null;
    app.stillProfile = null;
    // фото → режим сканування: лінія йде по карті (із заходу на схід або з півночі на південь)
    if (src.kind === "image" && !src.scan) {
      setStatus("Огляд зображення: область даних і шкала кольорів…");
      const prep = await prepareImageScan(src, app.scanDir);
      src = prep.source; scaleHint = prep.scaleHint;
      app.stillProfile = prep.stillProfile;          // область і шкала всього фото — для режиму дослідження
    }
    $("scanDir").hidden = !src.scan;
    $("scanDir").textContent = app.scanDir === "we" ? "↔ Сканування: захід → схід" : "↕ Сканування: північ → південь";
    app.source = src;
    showMedia(src);
    announce(`Відкрито «${title}». ${item?.desc ?? ""} Аналізую відео, зачекайте.`, { force: true });

    const t0 = performance.now();
    let lastSpoken = -1;
    app.analysis = await analyzeSource(src, {
      sceneOverride: item?.sceneType || null,
      projection: projectionOf(src, item),
      precomputedUrl: NO_CACHE ? null : item?.analysis || null,
      useCache: !NO_CACHE,
      scaleHint,
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
    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    setProgress(1);
    const how = app.analysis.fromCache ? "Аналіз узято з кешу" : app.analysis.fromPrecomputed ? "Готовий аналіз завантажено" : `Аналіз виконано за ${dt} с`;
    setStatus(`${how}: ${app.analysis.count} кадрів, подій: ${app.analysis.events.length}.`);
    renderCard();
    $("timeline-wrap").hidden = false;     // спершу показати — інакше canvas має ширину 0
    timeline.set(app.analysis);

    // тема: з галереї — підставляється сама; для свого файлу — нейтральна, доки користувач не скаже
    app.topic = getTopic(item?.topic || "generic");
    topicInput.set(item?.topic ? app.topic : null);
    if (!item?.topic) announce("Що на цій карті? Напишіть або скажіть тему в полі «Що на цій карті?» — від неї залежить звучання.", { force: true });

    // шари 2–3: мапінг і партитура
    await remap();
    $("exportBtn").disabled = false;
    drawMasks();
    // фокус на «Грати»: інакше пробіл на кнопці галереї знову запустив би аналіз
    if (document.activeElement?.closest("#gallery, #drop") || document.activeElement === document.body) $("play").focus();
  } catch (e) {
    console.error(e);
    setStatus("Помилка: " + e.message);
    announce("Помилка: " + e.message, { force: true });
  } finally {
    app.busy = false;
  }
}

/** Мапінг і композиція для поточної теми (без повторного аналізу відео). */
async function remap() {
  app.preset = await presetFor(app.profile.sceneType, app.topic);
  app.mapping = mapAnalysis(app.analysis, app.preset, { topic: app.topic });
  timeline.setSections(app.mapping.meta.sections.map(s => ({
    label: s.label, t0: s.b0 * app.mapping.meta.barDur, t1: s.b1 * app.mapping.meta.barDur,
  })));
  $("mapping-wrap").hidden = false;
  mappingTable.set(app.mapping, app.preset, app.analysis);
  await onMapped?.();
}
app.setTopic = async t => {
  app.topic = t;
  if (!app.analysis || app.busy) return;
  const wasPlaying = app.player?.playing;
  await remap();
  setStatus(`Тема: ${t.name.uk}. ${app.score.key}, ${app.score.meter.id}, ${app.score.bpm} BPM.`);
  if (wasPlaying) app.player.play();
};

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
  if (src.kind === "image") src.el.alt = app.catalogItem?.desc || `Завантажене зображення ${src.name}`;
  viewer.insertBefore(src.el, $("overlay"));
}

/* ---------------- картка «що зрозумів» ---------------- */
function renderCard(speak = true) {
  const p = app.profile;
  const lines = describeProfile(p, app.source, app.analysis);
  const card = app.catalogItem?.card;
  if (card) lines.unshift(`Дані: ${card.variable}. Одиниці: ${card.units}. Регіон: ${card.region}. Період: ${card.years}. Автори: ${card.authors}.`);
  if (app.catalogItem?.desc) lines.unshift(`Що на відео: ${app.catalogItem.desc}`);
  if (!app.analysis) lines.push("Детальний аналіз кожного кадру триває…");
  $("card-lines").replaceChildren(...lines.map(t => Object.assign(document.createElement("li"), { textContent: t })));
  const tags = [
    [p.sceneType, true],
    [`впевненість ${Math.round(p.confidence * 100)} %`],
    [SCALE_LABEL[p.changeScale]],
    p.period ? [`цикл ~${p.period.seconds.toFixed(0)} с`] : null,
  ].filter(Boolean);
  $("card-tags").replaceChildren(...tags.map(([t, hi]) => Object.assign(document.createElement("span"), { className: "tag" + (hi ? " hi" : ""), textContent: t })));
  $("card").hidden = false;
  if (speak) announce("Що двигун зрозумів про відео. " + lines.join(" "), { force: true });
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
document.addEventListener("keydown", e => {
  if (e.target?.matches?.("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.code === "KeyD" && app.profile) {
    announce("Що двигун зрозумів про відео. " + describeProfile(app.profile, app.source, app.analysis).join(" "), { force: true });
  }
});

/* ---------------- файл / перетягування ---------------- */
$("file").addEventListener("change", e => { app.lastFile = e.target.files[0]; loadFile(e.target.files[0]); });
$("scanDir").addEventListener("click", () => {
  app.scanDir = app.scanDir === "we" ? "ns" : "we";
  announce(app.scanDir === "we" ? "Сканування із заходу на схід." : "Сканування з півночі на південь.", { force: true });
  if (app.catalogItem) loadItem(app.catalogItem); else if (app.lastFile) loadFile(app.lastFile);
});
const drop = $("drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => { app.lastFile = e.dataTransfer.files[0]; loadFile(app.lastFile); });

app.topics = await loadTopics();
const topicInput = setupTopicInput({ topics: app.topics, onTopic: t => app.setTopic(t) });
app.catalog = await loadCatalog();
app.loadItem = loadItem;
