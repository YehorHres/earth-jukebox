// Режим дослідження «дотик до карти» (етап 12).
// E / кнопка — увімкнути; стрілки (Shift — більший крок), миша, дотик — рух зонда; Enter — повторити опис;
// Home — центр карти; Esc або E — вийти.
// Звук зонда: висота = значення в точці, панорама = горизонталь; поза областю даних — тиша.
// Озвучення: місце (широта/довгота на плоскій карті, частина диска на глобусі) і значення.
import { scaleValue, hueRampValue, DATA_MIN_SAT, DATA_MIN_VAL } from "../analysis/frame-context.js";
import { logLight } from "../features/scene.js";
import { announce, prefs } from "../a11y/announcer.js";
import { playNote } from "../audio/instruments.js";
import { snapToMode } from "../composer/theory.js";

const $ = id => document.getElementById(id);
const pct = v => `${Math.round(v * 100)} %`;
const LEVEL = v => (v < 0.2 ? "дуже низьке" : v < 0.4 ? "низьке" : v < 0.6 ? "середнє" : v < 0.8 ? "високе" : "дуже високе");

/* ---------------- чисті функції (тестуються окремо) ---------------- */

/**
 * Значення пікселів околиці точки: медіана тих, що несуть дані.
 * @param {Uint8ClampedArray} data RGBA околиці
 * @returns {{ value: number|null, kind: "data"|"land"|"none" }}
 */
export function valueFromPixels(data, { scaleRefs = null, sceneType = "heatmap" } = {}) {
  const vals = [];
  let grey = 0, total = 0;
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), v = max / 255, s = max ? (max - min) / max : 0;
    total++;
    let x = -1;
    if (scaleRefs) x = v >= 0.08 ? scaleValue(scaleRefs, r, g, b) : -1;
    else if (sceneType === "nightlights") x = logLight((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
    else if (sceneType === "heatmap" || sceneType === "mixed") {
      if (s >= DATA_MIN_SAT && v >= DATA_MIN_VAL) {
        const d = max - min;
        let hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        hh *= 60; if (hh < 0) hh += 360;
        x = hueRampValue(hh);
      } else if (sceneType === "mixed") x = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    } else x = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (x >= 0) vals.push(x);
    else if (s < 0.2 && v >= 0.15 && v <= 0.75) grey++;
  }
  if (vals.length >= Math.max(2, total * 0.08)) {
    vals.sort((a, b) => a - b);
    return { value: vals[Math.floor(vals.length / 2)], kind: "data" };
  }
  return { value: null, kind: grey > total * 0.5 ? "land" : "none" };
}

/**
 * Опис місця точки (x, y — частки кадру 0..1).
 * @param {object} p профіль { projection, region: { shape, full, norm: { bbox, disk } } }
 */
export function placeOf(x, y, p) {
  const reg = p?.region, n = reg?.norm;
  if (reg?.shape === "disk" && n?.disk) {
    const aspect = (p.maskW || 2) / (p.maskH || 1);
    const dx = (x - n.disk.cx) / n.disk.r, dy = (n.disk.cy - y) / (n.disk.r * aspect);
    if (dx * dx + dy * dy > 1) return { inside: false, text: "поза диском (космос)" };
    const lat = Math.round(Math.asin(Math.max(-1, Math.min(1, dy))) * 180 / Math.PI);
    const v = dy > 0.5 ? "північ" : dy < -0.5 ? "південь" : "центр";
    const h = dx < -0.33 ? ", захід (ліворуч)" : dx > 0.33 ? ", схід (праворуч)" : "";
    return { inside: true, text: `${v} диска${h}, ≈ ${Math.abs(lat)}° ${lat >= 0 ? "пн." : "пд."} ш. видимої півкулі`, lat };
  }
  const bb = n?.bbox || { x0: 0, y0: 0, x1: 1, y1: 1 };
  if (x < bb.x0 || x > bb.x1 || y < bb.y0 || y > bb.y1) return { inside: false, text: "поза картою (рамка, підписи)" };
  const rx = (x - bb.x0) / (bb.x1 - bb.x0), ry = (y - bb.y0) / (bb.y1 - bb.y0);
  if ((p?.projection || "equirect") === "equirect") {
    const lon = Math.round(-180 + 360 * rx), lat = Math.round(90 - 180 * ry);
    return { inside: true, lat, lon,
      text: `${Math.abs(lat)}° ${lat >= 0 ? "пн." : "пд."} ш., ${Math.abs(lon)}° ${lon >= 0 ? "сх." : "зх."} д.` };
  }
  const v = ry < 0.33 ? "угорі" : ry > 0.66 ? "унизу" : "посередині", h = rx < 0.33 ? "ліворуч" : rx > 0.66 ? "праворуч" : "в центрі";
  return { inside: true, text: `${v} ${h} карти` };
}

/** Текст значення: % шкали, рівень, одиниці (лише якщо діапазон відомий з каталогу). */
export function valueText(r, { topic = null, range = null, colorMore = null } = {}) {
  if (r.kind === "land") return "суша — даних немає";
  if (r.value === null) return "тут даних немає";
  let s = `${pct(r.value)} шкали, ${LEVEL(r.value)}`;
  if (range && Number.isFinite(range.min) && Number.isFinite(range.max))
    s = `≈ ${(range.min + r.value * (range.max - range.min)).toFixed(range.digits ?? 1)} ${range.units || ""} (${pct(r.value)} шкали)`;
  // що означає «більше» саме для кольору цієї карти (з каталогу), інакше — для теми
  const more = colorMore || topic?.more?.uk;
  if (more) s += `; більше — це ${more}`;
  return s;
}

/* ---------------- режим у застосунку ---------------- */
export function setupExplore(app, { engine }) {
  const btn = $("exploreBtn"), viewer = $("viewer"), cursor = $("cursor");
  const probeCanvas = document.createElement("canvas");
  const pg = probeCanvas.getContext("2d", { willReadFrequently: true });
  const state = { on: false, x: 0.5, y: 0.5, last: null, lastSound: 0, speakTimer: 0 };
  app.explore = state;

  const profile = () => app.stillProfile || app.profile;
  const media = () => app.source?.el;
  const mediaSize = () => { const el = media(); return { w: el?.videoWidth || el?.naturalWidth || el?.width || 1, h: el?.videoHeight || el?.naturalHeight || el?.height || 1 }; };

  function center() {
    const n = profile()?.region?.norm;
    if (n?.disk) { state.x = n.disk.cx; state.y = n.disk.cy; }
    else if (n?.bbox) { state.x = (n.bbox.x0 + n.bbox.x1) / 2; state.y = (n.bbox.y0 + n.bbox.y1) / 2; }
    else { state.x = 0.5; state.y = 0.5; }
  }

  /** Прочитати околицю точки з поточного кадру й визначити значення. */
  function probe() {
    const p = profile(), el = media();
    const place = placeOf(state.x, state.y, p);
    let r = { value: null, kind: "none" };
    if (place.inside && el) {
      const { w, h } = mediaSize(), R = Math.max(4, Math.round(Math.min(w, h) / 90));
      probeCanvas.width = probeCanvas.height = 2 * R + 1;
      try {
        pg.drawImage(el, state.x * w - R, state.y * h - R, 2 * R + 1, 2 * R + 1, 0, 0, 2 * R + 1, 2 * R + 1);
        const data = pg.getImageData(0, 0, 2 * R + 1, 2 * R + 1).data;
        r = valueFromPixels(data, { scaleRefs: p?.scale?.found ? Float32Array.from(p.scale.refs.flat()) : null, sceneType: p?.sceneType });
      } catch { r = { value: null, kind: "none" }; }
    }
    state.last = { place, r, text: `${place.text}: ${place.inside ? valueText(r, { topic: app.topic, range: app.catalogItem?.valueRange, colorMore: app.catalogItem?.colorMore }) : "тиша"}` };
    return state.last;
  }

  function sound(res, { touch = false } = {}) {
    if (!res.place.inside || res.r.value === null || !app.score) return;
    const now = performance.now();
    if (now - state.lastSound < 90) return;
    state.lastSound = now;
    engine.init(null, { waitResume: false }).then(() => {
      const h = app.score.harmony.bars[0];
      const midi = snapToMode(Math.round(55 + res.r.value * 29), h.root, h.mode);
      const inst = app.score.parts.find(p => p.id === "melody")?.instrument || "piano";
      engine.fade(0.9, 0.02);
      playNote(engine, engine.bus("probe", { send: 0.2 }), inst, { midi, dur: 0.35, vel: 0.6, pan: state.x * 2 - 1, legato: false }, engine.ctx.currentTime + 0.01);
    });
    // вібрація — лише при дотику (на телефоні); з клавіатури чи мишею браузер її блокує
    if (touch && navigator.vibrate) navigator.vibrate(Math.round(15 + 150 * res.r.value));
  }

  function draw() {
    const g = cursor.getContext("2d"), r0 = cursor.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cursor.width = Math.round(r0.width * dpr); cursor.height = Math.round(r0.height * dpr);
    g.clearRect(0, 0, cursor.width, cursor.height);
    if (!state.on) return;
    const { w, h } = mediaSize(), k = Math.min(cursor.width / w, cursor.height / h);
    const ox = (cursor.width - w * k) / 2, oy = (cursor.height - h * k) / 2;
    const px = ox + state.x * w * k, py = oy + state.y * h * k;
    g.strokeStyle = "rgba(242,201,76,0.95)"; g.lineWidth = 2 * dpr;
    g.beginPath(); g.arc(px, py, 9 * dpr, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(px - 16 * dpr, py); g.lineTo(px + 16 * dpr, py); g.moveTo(px, py - 16 * dpr); g.lineTo(px, py + 16 * dpr); g.stroke();
  }

  function update({ speak = true, immediate = false, touch = false } = {}) {
    const res = probe();
    draw();
    sound(res, { touch });
    $("explore-readout").textContent = res.text;
    clearTimeout(state.speakTimer);
    if (speak) state.speakTimer = setTimeout(() => announce(res.text, { force: true }), immediate ? 0 : 280);
  }

  function setOn(on) {
    if (on === state.on || !app.score) return;
    state.on = on;
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "✋ Вийти з дослідження" : "🖐 Дослідити карту";
    viewer.classList.toggle("exploring", on);
    $("explore-readout").hidden = !on;
    if (on) {
      if (app.player?.playing) { app.player.pause(); $("play").textContent = "▶ Грати"; $("play").setAttribute("aria-pressed", "false"); }
      center();
      announce("Режим дослідження. Стрілки — рух зонда, Shift — більший крок, Home — центр карти, Enter — повторити, Escape — вийти. " +
        "Висота звуку — значення, ліворуч чи праворуч — положення; поза картою — тиша.", { force: true });
      setTimeout(() => update({ speak: true }), prefs.voice ? 4500 : 1200);
    } else { draw(); announce("Режим дослідження вимкнено.", { force: true }); }
  }

  btn.addEventListener("click", () => setOn(!state.on));

  // клавіатура: перехоплюємо раніше за плеєр (стрілки там — перемотка)
  document.addEventListener("keydown", e => {
    if (e.target?.matches?.("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "KeyE" && app.score) { e.preventDefault(); e.stopImmediatePropagation(); setOn(!state.on); return; }
    if (!state.on) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault(); e.stopImmediatePropagation();
      state.x = Math.max(0, Math.min(1, state.x + moves[e.key][0]));
      state.y = Math.max(0, Math.min(1, state.y + moves[e.key][1]));
      update();
    } else if (e.key === "Home") { e.preventDefault(); e.stopImmediatePropagation(); center(); update(); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); update({ immediate: true }); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); setOn(false); }
    else if (e.key === " ") { e.preventDefault(); e.stopImmediatePropagation(); }   // пробіл не запускає трек під час дослідження
  }, true);

  // миша й дотик: зонд іде за вказівником
  const fromPointer = ev => {
    const r = viewer.getBoundingClientRect(), { w, h } = mediaSize();
    const k = Math.min(r.width / w, r.height / h), ox = (r.width - w * k) / 2, oy = (r.height - h * k) / 2;
    state.x = Math.max(0, Math.min(1, (ev.clientX - r.left - ox) / (w * k)));
    state.y = Math.max(0, Math.min(1, (ev.clientY - r.top - oy) / (h * k)));
  };
  viewer.addEventListener("pointermove", ev => { if (!state.on) return; fromPointer(ev); update({ touch: ev.pointerType === "touch" }); });
  viewer.addEventListener("pointerdown", ev => { if (!state.on) return; ev.preventDefault(); fromPointer(ev); update({ immediate: true, touch: ev.pointerType === "touch" }); });

  return { setOn, state, update, probe };
}
