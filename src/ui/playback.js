// Відтворення: композитор → плеєр, курсор сканування на кадрі, «Зараз звучить», партії (mute/solo),
// повідомлення для скрінрідера (розділи й події — не частіше ніж раз на 4 такти), клавіатура.
import { compose } from "../composer/composer.js";
import { Engine } from "../audio/engine.js";
import { Player } from "../audio/player.js";
import { INSTRUMENT_LABEL, hasSampler } from "../audio/instruments.js";
import { loadFor } from "../audio/library/index.js";
import { loadStyle, loadStyles } from "../styles/index.js";
import { renderOffline, toWav } from "../audio/render.js";
import { legendItems, playItem, playLegend, playIntro, stopIntro } from "../a11y/legend.js";
import { announce, setMinGap, stopVoice, prefs } from "../a11y/announcer.js";
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
    if (introRunning) { stopIntro(); return; }                      // повторне натискання — пропустити вступ
    if (player.playing) { player.pause(); setPlayUI(false); stopVoice(); return; }
    // голосовий вступ перед першим відтворенням треку (вимикається)
    if (prefs.intro && !introDone && player.time === 0) {
      introDone = true; introRunning = true;
      $("play").textContent = "⏭ Пропустити вступ";
      const c = app.catalogItem?.card;
      const items = legendItems(app.mapping.meta.preset, ctxLegend()).filter(it => it.intro);
      await playIntro(engine, { title: app.topic && app.topic.id !== "generic" ? app.topic.name.uk : (app.catalogItem?.title || "Ваша карта"), years: c?.years, items });
      introRunning = false;
    }
    await player.play(); setPlayUI(true);
  }
  let introDone = false, introRunning = false;
  const ctxLegend = () => ({ topic: app.topic, colorMore: app.catalogItem?.colorMore, score: app.score });

  /* ---- курсор сканування: колонка кадру, яку зараз «грає» мелодія ---- */
  function mediaRect() {
    const W = cursor.width, H = cursor.height, s = app.source;
    const mw = s?.el?.naturalWidth || s?.width, mh = s?.el?.naturalHeight || s?.height;
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
    if (app.source?.scan) {
      // фото: лінія сканування рухається по всій карті
      const r = mediaRect(), L = app.source.scan.lineAt(t);
      cg.fillStyle = "rgba(242,201,76,0.95)";
      if (L.dir === "we") cg.fillRect(r.x + L.x * r.w - 1.5 * dpr, r.y, 3 * dpr, r.h);
      else cg.fillRect(r.x, r.y + L.y * r.h - 1.5 * dpr, r.w, 3 * dpr);
      return;
    }
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
      const instr = p.id === "drums" ? `набір: ${app.score.kit?.label || "оркестровий"}` : `${INSTRUMENT_LABEL[p.instrument] || p.instrument}${hasSampler(p.instrument) ? " · справжні семпли" : ""}`;
      const name = Object.assign(document.createElement("span"), { className: st.mute ? "off" : "on", title: p.role });
      name.append(`${k + 1}. ${p.label} `, Object.assign(document.createElement("small"), { className: "keys", textContent: `(${instr})` }));
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
    stopIntro(); introRunning = false; introDone = false;
    // seed = відео + тема: те саме відео з тією самою темою — той самий трек
    app.score = compose(app.mapping, { seed: `${app.catalogItem?.id || app.source.name}|${app.mapping.meta.topic}`, style: app.style || null });
    player.load(app.score, app.mapping, app.source);
    setMinGap(Math.max(4000, app.score.barDur * 4 * 1000));
    lastSection = null; lastAnnouncedBar = -99;
    renderParts();
    renderLegend();
    describeTimeline();
    onBar(0, true);
    $("play").disabled = false;
    $("legendBtn").disabled = false;
    $("wavBtn").disabled = false;
    $("exploreBtn").disabled = false;
    // семпли — у фоні; грати можна одразу (поки що синтезатори)
    const insts = [...new Set(app.score.notes.map(n => n.inst))];
    const decoder = new OfflineAudioContext(1, 1, 44100);
    const status = $("status"), base = status.textContent;
    loadFor(decoder, insts, (d, n) => { status.textContent = `${base} Семпли інструментів: ${d}/${n}…`; })
      .then(({ loaded, failed }) => {
        status.textContent = `${base} ${loaded.length ? `Справжні інструменти: ${loaded.map(i => INSTRUMENT_LABEL[i]).join(", ")}.` : ""}${failed.length ? ` Синтезатор замість: ${failed.map(i => INSTRUMENT_LABEL[i]).join(", ")}.` : ""}`;
        renderParts();
      });
  }

  /* ---- аудіолегенда ---- */
  function renderLegend() {
    const items = legendItems(app.mapping.meta.preset, ctxLegend());
    $("legend-list").replaceChildren(...items.map((it, k) => {
      const li = document.createElement("li");
      const b = Object.assign(document.createElement("button"), { textContent: `▶ ${it.text}` });
      b.addEventListener("click", async () => {
        if (player.playing) { player.pause(); setPlayUI(false); }
        await engine.init(); engine.fade(0.9, 0.02);
        playItem(engine, it);
      });
      li.appendChild(b);
      return li;
    }));
    $("legend-wrap").hidden = false;
  }
  async function legend() {
    if (!app.mapping) return;
    if (player.playing) { player.pause(); setPlayUI(false); }
    const btns = [...$("legend-list").querySelectorAll("button")];
    await playLegend(engine, app.mapping.meta.preset, k => btns.forEach((b, i) => b.classList.toggle("now", i === k)), ctxLegend());
  }
  $("legendBtn").addEventListener("click", legend);

  /* ---- експорт треку у WAV (для плейлиста / журі) ---- */
  $("wavBtn").addEventListener("click", async () => {
    const btn = $("wavBtn");
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = "Рендеринг…";
    announce("Готую трек у форматі WAV, зачекайте.", { force: true });
    try {
      const muted = app.score.parts.filter(p => engine.getPart(p.id).mute).map(p => p.id);
      const { buffer } = await renderOffline(app.score, app.mapping, { muted });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(toWav(buffer));
      a.download = `earth-jukebox-${(app.catalogItem?.id || app.source.name).replace(/[^\w.-]+/g, "_")}.wav`;
      a.click();
      announce("Трек збережено.", { force: true });
    } catch (e) { announce("Не вдалося зберегти трек: " + e.message, { force: true }); }
    btn.textContent = old; btn.disabled = false;
  });

  /* ---- таймлайн для скрінрідера: текстовий опис подій і розділів ---- */
  function describeTimeline() {
    const m = app.mapping, a = app.analysis;
    const secs = m.meta.sections.map(s => `${s.label} ${fmtTime(s.b0 * m.meta.barDur)}–${fmtTime(Math.min(a.profile.durationSec || 1e9, s.b1 * m.meta.barDur))}`).join("; ");
    const ev = m.bars.flatMap(b => b.events).slice(0, 8).map(e => `${fmtTime(e.time)} ${e.text}`).join("; ");
    $("timeline").setAttribute("aria-label", `Таймлайн. Розділи: ${secs}. ${ev ? "Головні події: " + ev + "." : "Помітних подій немає."} Клік або стрілки — перехід у часі.`);
  }

  /* ---- стиль звучання (етап 11): перекриває лише інструменти партій; дані й мапінг ті самі ---- */
  loadStyles().then(styles => {
    const sel = $("style");
    for (const st of styles) sel.appendChild(Object.assign(document.createElement("option"), { value: st.id, textContent: st.name.uk }));
  });
  $("style").addEventListener("change", async e => {
    const st = await loadStyle(e.target.value);
    app.style = st;
    if (!app.mapping) return;
    const was = player.playing, at = player.time;
    await onMapped();
    if (at) await player.seek(at);
    if (was) { await player.play(); setPlayUI(true); }
    announce(st ? `Стиль: ${st.name.uk}. ${st.why}. Дані, гармонія й ритм — ті самі.` : "Стиль: за темою карти.", { force: true });
  });

  app.seekTo = t => { if (app.score) player.seek(t); };
  $("play").addEventListener("click", toggle);

  document.addEventListener("keydown", e => {
    if (e.target?.matches?.("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey || !app.score) return;
    if (e.key === " " && !e.target?.matches?.("button")) { e.preventDefault(); toggle(); }
    else if (e.code === "KeyL") { e.preventDefault(); legend(); }
    else if (e.code === "KeyM") {
      const b = Math.min(app.mapping.bars.length - 1, Math.floor(player.time / app.score.barDur));
      announce(`${fmtTime(player.time)}, ${app.mapping.bars[b].sectionLabel}. ${mappingTable.describe(b)}.`, { force: true });
    }
    else if (e.key === "ArrowRight") { e.preventDefault(); player.seek(player.time + 5); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); player.seek(player.time - 5); }
    else if (/^Digit[1-9]$/.test(e.code)) {
      const p = app.score.parts[Number(e.code.slice(5)) - 1];
      if (p) { e.preventDefault(); togglePart(p.id, e.shiftKey ? "solo" : "mute"); }
    }
  });

  return { onMapped, stop: () => { player.stop(); setPlayUI(false); } };
}
