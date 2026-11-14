// Відтворення: композитор → плеєр, курсор сканування на кадрі, «Зараз звучить», партії (mute/solo),
// повідомлення для скрінрідера (розділи й події — не частіше ніж раз на 4 такти), клавіатура.
import { compose } from "../composer/composer.js";
import { Engine } from "../audio/engine.js";
import { Player } from "../audio/player.js";
import { INSTRUMENT_LABEL } from "../audio/instruments.js";
import { announce, setMinGap, stopVoice } from "../a11y/announcer.js";
import { fmtTime } from "../a11y/describe.js";
import { noteName } from "../composer/theory.js";

const $ = id => document.getElementById(id);

export function setupPlayback(app, { timeline, mappingTable }) {
  const engine = new Engine();
  app.engine = engine;
  const cursor = $("cursor"), cg = cursor.getContext("2d");
  let lastAnnouncedBar = -99, lastSection = null;

  const player = new Player(engine, {
    onBar: (b, seeked) => onBar(b, seeked),
    onTick: t => { timeline.setCursor(Math.min(t, app.analysis.profile.durationSec || t)); drawCursor(t); },
    onEnd: () => { setPlayUI(false); announce("Кінець треку.", { force: true }); },
  });
  app.player = player;

  function setPlayUI(on) {
    $("play").textContent = on ? "⏸ Пауза" : "▶ Грати";
    $("play").setAttribute("aria-pressed", on ? "true" : "false");
  }

  async function toggle() {
    if (!app.score) return;
    if (player.playing) { player.pause(); setPlayUI(false); stopVoice(); }
    else { await player.play(); setPlayUI(true); }
  }

  /* ---- курсор сканування: колонка кадру, яку зараз «грає» мелодія ---- */
  function mediaRect() {
    const W = cursor.width, H = cursor.height, s = app.source;
    const mw = s?.width, mh = s?.height;
    if (!mw || !mh) return { x: 0, y: 0, w: W, h: H };
    const k = Math.min(W / mw, H / mh);
    return { x: (W - mw * k) / 2, y: (H - mh * k) / 2, w: mw * k, h: mh * k };
  }
  function drawCursor(t) {
    const r0 = cursor.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const W = Math.round(r0.width * dpr), H = Math.round(r0.height * dpr);
    if (cursor.width !== W || cursor.height !== H) { cursor.width = W; cursor.height = H; }
    cg.clearRect(0, 0, W, H);
    if (!app.score || (!player.playing && t === 0)) return;
    const barDur = app.score.barDur, inBar = (t % barDur) / barDur, step = Math.min(15, Math.floor(inBar * 16));
    const r = mediaRect(), cw = r.w / 16;
    cg.fillStyle = "rgba(255,255,255,0.10)";
    cg.fillRect(r.x + step * cw, r.y, cw, r.h);
    cg.fillStyle = "rgba(242,201,76,0.95)";
    cg.fillRect(r.x + (inBar * 16) * cw - 1.5 * dpr, r.y, 3 * dpr, r.h);
  }

  /* ---- «Зараз звучить» ---- */
  function onBar(b, seeked) {
    const m = app.mapping, bar = m.bars[Math.min(b, m.bars.length - 1)], sb = app.score.bars[Math.min(b, app.score.bars.length - 1)];
    if (!bar) return;
    mappingTable.update(b);
    const h = app.score.harmony.bars[b];
    const chord = h ? `${noteName(h.root + h.chords[0].chord.root)} (${h.chords[0].chord.ext}${h.chords[0].chord.sus ? ", затримка" : ""})` : "—";
    const parts = sb.active.map(id => app.score.parts.find(p => p.id === id)?.label).filter(Boolean).join(", ");
    const rows = [
      ["Час", `${fmtTime(bar.t0)} · такт ${b + 1} з ${m.bars.length}`],
      ["Розділ", bar.sectionLabel],
      ["Тональність", `${noteName(h.root)} ${h.mode.label}`],
      ["Акорд", chord],
      ["Темп", `${app.score.bpm} BPM`],
      ["Грають", parts],
      ["Події", bar.events.length ? bar.events.map(e => e.text).join("; ") : "—"],
    ];
    $("readout").replaceChildren(...rows.flatMap(([k, v]) => [Object.assign(document.createElement("dt"), { textContent: k }), Object.assign(document.createElement("dd"), { textContent: v })]));
    if (seeked) return;
    // скрінрідер: зміна розділу — завжди; події й зведення — не частіше ніж раз на 4 такти
    if (bar.section !== lastSection) {
      lastSection = bar.section;
      lastAnnouncedBar = b;
      announce(`${bar.sectionLabel}. ${noteName(h.root)} ${h.mode.label}. ${bar.events[0] ? bar.events[0].text + "." : ""}`);
    } else if (b - lastAnnouncedBar >= 4 && (bar.events.length || (b - lastAnnouncedBar) >= 8)) {
      lastAnnouncedBar = b;
      announce(bar.events.length ? `${fmtTime(bar.t0)}: ${bar.events.map(e => e.text).join("; ")}.` : `${fmtTime(bar.t0)}: ${mappingTable.describe(b)}.`, { throttle: true });
    }
  }

  /* ---- партії: mute / solo ---- */
  function renderParts() {
    const root = $("parts");
    root.replaceChildren();
    app.score.parts.forEach((p, k) => {
      const st = engine.getPart(p.id);
      const name = Object.assign(document.createElement("span"), { textContent: `${k + 1}. ${p.label}`, className: st.mute ? "off" : "on", title: `${INSTRUMENT_LABEL[p.instrument] || p.instrument}. ${p.role}` });
      const mute = Object.assign(document.createElement("button"), { textContent: st.mute ? "Увімк." : "Вимк." });
      mute.setAttribute("aria-label", `${st.mute ? "Увімкнути" : "Вимкнути"} партію ${p.label}`);
      mute.setAttribute("aria-pressed", st.mute ? "true" : "false");
      mute.addEventListener("click", () => togglePart(p.id, "mute"));
      const solo = Object.assign(document.createElement("button"), { textContent: "Соло" });
      solo.setAttribute("aria-label", `Соло: ${p.label}`);
      solo.setAttribute("aria-pressed", st.solo ? "true" : "false");
      solo.addEventListener("click", () => togglePart(p.id, "solo"));
      root.append(name, mute, solo);
    });
    $("parts-wrap").hidden = false;
  }
  function togglePart(id, what) {
    const st = engine.getPart(id), p = app.score.parts.find(q => q.id === id);
    engine.setPart(id, { [what]: !st[what] });
    renderParts();
    announce(what === "mute" ? `${p.label}: ${!st.mute ? "вимкнено" : "увімкнено"}` : `${p.label}: соло ${!st.solo ? "увімкнено" : "вимкнено"}`, { force: true });
  }

  /* ---- після мапінгу: пишемо партитуру ---- */
  async function onMapped() {
    player.stop(); setPlayUI(false);
    app.score = compose(app.mapping, { seed: app.analysis.key || app.source.key });
    player.load(app.score, app.mapping, app.source);
    setMinGap(Math.max(4000, app.score.barDur * 4 * 1000));
    lastSection = null; lastAnnouncedBar = -99;
    renderParts();
    onBar(0, true);
    $("play").disabled = false;
    $("legendBtn").disabled = false;
  }

  app.seekTo = t => { if (app.score) player.seek(t); };
  $("play").addEventListener("click", toggle);

  document.addEventListener("keydown", e => {
    if (e.target.matches("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey || !app.score) return;
    if (e.key === " " && !e.target.matches("button")) { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); player.seek(player.time + 5); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); player.seek(player.time - 5); }
    else if (/^Digit[1-9]$/.test(e.code)) {
      const p = app.score.parts[Number(e.code.slice(5)) - 1];
      if (p) { e.preventDefault(); togglePart(p.id, e.shiftKey ? "solo" : "mute"); }
    }
  });

  return { onMapped, stop: () => { player.stop(); setPlayUI(false); } };
}
