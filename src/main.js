// Earth Jukebox v2 — склеює шари та інтерфейс.
import { openVideo, openImage, openSynthetic } from "./media/sources.js";
import { passA } from "./analysis/pass-a.js";
import { describeProfile, SCENE_LABEL, SCALE_LABEL } from "./a11y/describe.js";
import { initAnnouncer, announce, prefs, stopVoice } from "./a11y/announcer.js";

const $ = id => document.getElementById(id);
const app = { source: null, profile: null, analysis: null, catalogItem: null, busy: false };
window.jukebox = app; // для налагодження й автотестів

initAnnouncer($("live"));
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
  app.profile = app.analysis = null;
  ["play", "legendBtn", "exportBtn"].forEach(id => ($(id).disabled = true));
  $("card").hidden = true;
  setProgress(0);
  try {
    setStatus(`Відкриваю «${title}»…`);
    const src = await open();
    app.source = src;
    showMedia(src);
    announce(`Відкрито «${title}». ${item?.desc ?? ""} Аналізую відео, зачекайте.`, { force: true });

    const t0 = performance.now();
    app.profile = await passA(src, {
      sceneOverride: item?.sceneType || null,
      onProgress: (p, msg) => { setProgress(p); setStatus(msg); },
    });
    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    setProgress(1);
    setStatus(`Огляд відео завершено за ${dt} с.`);
    renderCard();
    $("exportBtn").disabled = false;
    drawMasks();
  } catch (e) {
    console.error(e);
    setStatus("Помилка: " + e.message);
    announce("Помилка: " + e.message, { force: true });
  } finally {
    app.busy = false;
  }
}

function showMedia(src) {
  const viewer = $("viewer");
  viewer.querySelectorAll("video, img, canvas:not(#overlay)").forEach(n => n.remove());
  $("placeholder").hidden = true;
  if (src.kind === "image") src.el.alt = app.catalogItem?.desc || `Завантажене зображення ${src.name}`;
  viewer.insertBefore(src.el, $("overlay"));
}

/* ---------------- картка «що зрозумів» ---------------- */
function renderCard() {
  const p = app.profile;
  const lines = describeProfile(p, app.source, app.analysis);
  $("card-lines").replaceChildren(...lines.map(t => Object.assign(document.createElement("li"), { textContent: t })));
  const tags = [
    [p.sceneType, true],
    [`впевненість ${Math.round(p.confidence * 100)} %`],
    [SCALE_LABEL[p.changeScale]],
    p.period ? [`цикл ~${p.period.seconds.toFixed(0)} с`] : null,
  ].filter(Boolean);
  $("card-tags").replaceChildren(...tags.map(([t, hi]) => Object.assign(document.createElement("span"), { className: "tag" + (hi ? " hi" : ""), textContent: t })));
  $("card").hidden = false;
  announce("Що двигун зрозумів про відео. " + lines.join(" "), { force: true });
  $("debug").textContent = JSON.stringify(debugProfile(p), null, 1);
}

function debugProfile(p) {
  const { staticMask, landMask, bgMask, overlayMask, ...rest } = p;
  const round = o => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "number" ? +v.toPrecision(4) : v)));
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
    const c = p.landMask[i] ? [60, 200, 90] : p.bgMask[i] ? [60, 110, 255] : p.overlayMask[i] ? [230, 60, 230] : null;
    if (!c) continue;
    img.data.set([...c, 150], i * 4);
  }
  g.putImageData(img, 0, 0);
}
$("showMasks").addEventListener("change", drawMasks);

/* ---------------- експорт ---------------- */
$("exportBtn").addEventListener("click", () => {
  const data = { profile: debugProfile(app.profile), analysis: app.analysis };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  a.download = `earth-jukebox-${app.source?.name || "analysis"}.json`;
  a.click();
});

/* ---------------- доступність і клавіатура ---------------- */
$("announce").addEventListener("change", e => (prefs.announce = e.target.checked));
$("voice").addEventListener("change", e => (prefs.voice = e.target.checked));
document.addEventListener("keydown", e => {
  if (e.target.matches("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if ((k === "d" || k === "в") && app.profile) {
    announce("Що двигун зрозумів про відео. " + describeProfile(app.profile, app.source, app.analysis).join(" "), { force: true });
  }
});

/* ---------------- файл / перетягування ---------------- */
$("file").addEventListener("change", e => loadFile(e.target.files[0]));
const drop = $("drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => loadFile(e.dataTransfer.files[0]));

app.catalog = await loadCatalog();
app.loadItem = loadItem;
