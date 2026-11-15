// Відтворення: композитор → плеєр, курсор сканування на кадрі, «Зараз звучить», партії (mute/solo),
// повідомлення для скрінрідера (розділи й події — не частіше ніж раз на 4 такти), клавіатура.
import { compose } from "../composer/composer.js";
import { Engine } from "../audio/engine.js";
import { Player, RATES } from "../audio/player.js";
import { INSTRUMENT_LABEL, hasSampler } from "../audio/instruments.js";
import { loadFor } from "../audio/library/index.js";
import { loadStyle, loadStyles } from "../styles/index.js";
import { renderOffline, toWav } from "../audio/render.js";
import { calibrate } from "../audio/master.js";
import { scoreHash } from "../audio/report.js";
import { legendItems, playItem, playLegend, playShortIntro, stopIntro, setDuckEngine } from "../a11y/legend.js";
import { introText, whatNow, trackSummary } from "../a11y/explain.js";
import { speechHooks } from "../a11y/announcer.js";
import { announce, setMinGap, stopVoice, prefs } from "../a11y/announcer.js";
import { fmtTime } from "../a11y/describe.js";
import { noteName } from "../composer/theory.js";
import { t, tr, pick, getLang } from "../i18n/index.js";

const $ = id => document.getElementById(id);

export function setupPlayback(app, { timeline, mappingTable }) {
  const engine = new Engine();
  setDuckEngine(engine);
  speechHooks.duck = on => engine.duck(on);
  app.engine = engine;
  const cursor = $("cursor"), cg = cursor.getContext("2d");
  let lastAnnouncedBar = -99, lastSection = null;

  const player = new Player(engine, {
    onBar: (b, seeked) => onBar(b, seeked),
    onTick: t => { timeline.setCursor(Math.min(t, app.analysis.profile.durationSec || t)); drawCursor(t); },
    onEnd: () => { setPlayUI(false); showSummary(true); },
  });
  app.player = player;

  function setPlayUI(on) {
    $("play").textContent = t(on ? "btn.pause" : "btn.play");
    $("play").dataset.icon = on ? "pause" : "play";
    $("play").setAttribute("aria-pressed", on ? "true" : "false");
  }

  async function toggle() {
    if (!app.score) return;
    if (introRunning) { stopIntro(); return; }                      // повторне натискання — пропустити вступ
    if (player.playing) { player.pause(); setPlayUI(false); stopVoice(); return; }
    // голосовий вступ перед першим відтворенням треку (вимикається)
    if (prefs.intro && !introDone && player.time === 0) {
      introDone = true; introRunning = true;
      $("play").textContent = t("btn.skipIntro");
      $("play").dataset.icon = "skip";
      const title = app.catalogItem ? pick(app.catalogItem, "title") : app.eicCard ? pick(app.eicCard, "title") : app.topic && app.topic.id !== "generic" ? pick(app.topic, "name") : t("intro.yourMap");
      await playShortIntro(engine, { text: introText({ title, card: cardOf(), topic: app.topic, colorMore: app.catalogItem?.colorMore, where: app.mapping?.meta.where || null }), topicId: app.topic?.id, score: app.score });
      introRunning = false;
    }
    await player.play(); setPlayUI(true);
  }
  let introDone = false, introRunning = false;
  const cardOf = () => app.eicCard || app.catalogItem?.card || null;
  const explainCtx = () => ({ analysis: app.analysis, mapping: app.mapping, card: cardOf() });
  /** Підсумок треку: текстом на сторінці й (після кінця) голосом / aria-live. */
  function showSummary(say) {
    const el = $("track-summary");
    if (!app.analysis || !el) return;
    el.textContent = trackSummary(explainCtx());
    el.hidden = false;
    if (say) announce(`${t("end")} ${el.textContent}`, { force: true });
  }
  const whatNowText = () => whatNow(explainCtx(), player.time);
  $("whatBtn")?.addEventListener("click", () => app.score && announce(whatNowText(), { force: true }));
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
    const chord = h ? `${noteName(h.root + h.chords[0].chord.root)} (${tr(h.chords[0].chord.ext)}${h.chords[0].chord.sus ? `, ${tr("затримка")}` : ""})` : "—";
    const parts = sb.active.map(id => tr(app.score.parts.find(p => p.id === id)?.label)).filter(Boolean).join(", ");
    const rows = [
      [t("now.time"), t("now.timeVal", { t: fmtTime(bar.t0), b: b + 1, n: m.bars.length })],
      [t("now.section"), tr(bar.sectionLabel)],
      [t("now.key"), `${noteName(h.root)} ${tr(h.mode.label)}`],
      [t("now.chord"), chord],
      [t("now.tempo"), `${app.score.bpm} BPM`],
      [t("now.lead"), sb.lead ? t("now.leadVal", { solo: sb.streams > 1 ? t("now.soloists", { n: sb.streams - 1 }) : "", s: sb.streams }) : "—"],
      [t("now.accomp"), parts || "—"],
      [t("now.events"), bar.events.length ? bar.events.map(e => tr(e.text)).join("; ") : "—"],
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
      const label = tr(p.label);
      const instr = p.id === "drums" ? t("parts.kit", { kit: tr(app.score.kit?.label || "оркестровий") }) : `${tr(INSTRUMENT_LABEL[p.instrument] || p.instrument)}${hasSampler(p.instrument) ? t("parts.samples") : ""}`;
      const name = Object.assign(document.createElement("span"), { className: st.mute ? "off" : "on" });
      name.dataset.role = tr(p.role || "");
      name.append(`${k + 1}. ${label} `, Object.assign(document.createElement("small"), { className: "keys", textContent: `(${instr})` }));
      const mute = Object.assign(document.createElement("button"), { textContent: t(st.mute ? "parts.unmute" : "parts.mute") });
      mute.dataset.tip = "tip.mute";
      mute.setAttribute("aria-label", t(st.mute ? "parts.ariaUnmute" : "parts.ariaMute", { p: label }));
      mute.setAttribute("aria-pressed", st.mute ? "true" : "false");
      mute.addEventListener("click", () => togglePart(p.id, "mute"));
      const solo = Object.assign(document.createElement("button"), { textContent: t("parts.solo") });
      solo.dataset.tip = "tip.solo";
      solo.setAttribute("aria-label", t("parts.ariaSolo", { p: label }));
      solo.setAttribute("aria-pressed", st.solo ? "true" : "false");
      solo.addEventListener("click", () => togglePart(p.id, "solo"));
      const vol = volSlider(`part:${p.id}`, t("mix.ariaPart", { p: label }), v => engine.setPart(p.id, { vol: v }));
      name.append(vol);
      root.append(name, mute, solo);
    });
    $("parts-wrap").hidden = false;
  }

  /* ---- v10 §8: мікшер — гучність кожної партії й загальна; партитуру не змінює; localStorage ---- */
  const MIX_KEY = "ej.mix";
  const mix = (() => { try { return JSON.parse(localStorage.getItem(MIX_KEY)) || {}; } catch { return {}; } })();
  const saveMix = () => { try { localStorage.setItem(MIX_KEY, JSON.stringify(mix)); } catch { /* приватний режим */ } };
  const pctText = v => t("mix.valueText", { v: Math.round(v * 100) });
  /** Повзунок 0–150 % (крок 5). key — ключ у localStorage; apply(лінійне підсилення). */
  function volSlider(key, aria, apply) {
    const v = mix[key] ?? 1, el = Object.assign(document.createElement("input"), { type: "range", min: 0, max: 150, step: 5, value: Math.round(v * 100), className: "vol" });
    el.dataset.tip = "tip.mixVol";
    el.setAttribute("aria-label", aria);
    el.setAttribute("aria-valuetext", pctText(v));
    apply(v);
    el.addEventListener("input", () => {
      const x = el.value / 100;
      mix[key] = x; saveMix(); apply(x);
      el.setAttribute("aria-valuetext", pctText(x));
    });
    return el;
  }
  function renderMaster() {
    const wrap = $("mix-master");
    if (!wrap) return;
    wrap.replaceChildren(Object.assign(document.createElement("span"), { textContent: t("mix.master") }),
      volSlider("master", t("mix.master"), v => engine.setUserVolume(v)));
  }
  renderMaster();

  /* ---- v10 §8: швидкість відтворення (відео й музика разом; висота нот та сама) ---- */
  const rateSel = $("playRate");
  function setRate(r, say) {
    r = player.setRate(r);
    if (rateSel) rateSel.value = String(r);
    if (say) announce(t("rate.say", { r: String(r).replace(".", getLang() === "uk" ? "," : ".") }), { force: true });
  }
  rateSel?.addEventListener("change", e => setRate(Number(e.target.value), true));
  function togglePart(id, what) {
    const st = engine.getPart(id), p = app.score.parts.find(q => q.id === id);
    engine.setPart(id, { [what]: !st[what] });
    renderParts();
    const label = tr(p.label);
    announce(what === "mute" ? t(!st.mute ? "parts.sayMuted" : "parts.sayUnmuted", { p: label }) : t(!st.solo ? "parts.saySoloOn" : "parts.saySoloOff", { p: label }), { force: true });
  }

  /* ---- після мапінгу: пишемо партитуру ---- */
  async function onMapped() {
    player.stop(); setPlayUI(false);
    stopIntro(); introRunning = false; introDone = false;
    // seed = відео + тема: те саме відео з тією самою темою — той самий трек
    app.score = compose(app.mapping, { seed: `${app.catalogItem?.id || app.source.name}|${app.mapping.meta.topic}`, style: app.style || null, drone: !!prefs.drone, ticks: !!prefs.ticks });
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
    if ($("whatBtn")) $("whatBtn").disabled = false;
    showSummary(false);
    // семпли — у фоні; грати можна одразу (поки що синтезатори)
    const insts = app.score.instruments;
    const decoder = new OfflineAudioContext(1, 1, 44100);
    const status = $("status"), base = status.textContent;
    // семпли вантажаться у фоні: якщо за цей час обрали інше відео чи тему, старий трек уже не актуальний
    const score = app.score;
    const current = () => app.score === score;
    loadFor(decoder, insts, (d, n) => { if (current()) status.textContent = t("status.samples", { base, d, n }); })
      .then(({ loaded, failed }) => {
        if (!current()) return;
        const names = list => list.map(i => tr(INSTRUMENT_LABEL[i] || i)).join(", ");
        status.textContent = `${base} ${loaded.length ? t("status.realInstr", { list: names(loaded) }) : ""}${failed.length ? t("status.synthInstead", { list: names(failed) }) : ""}`;
        renderParts();
      })
      .then(() => applyMaster(score, current));
    // до калібрування — типове підсилення галереї (щоб перший звук не був голоснішим за ціль)
    score.master = { gainDb: -2.5, balanceDb: 0, voiceDb: 0 };
    engine.setMaster(score.master);
  }

  /** Мастер треку: з готового звіту галереї (якщо партитура та сама) або фонове калібрування. */
  let storedReport = null;
  async function applyMaster(score, current) {
    try {
      storedReport ??= await fetch("renders/audio-report.json").then(r => (r.ok ? r.json() : { rows: [] })).catch(() => ({ rows: [] }));
      const row = storedReport.rows.find(r => r.id === app.catalogItem?.id && r.hash === scoreHash(score));
      const cal = row ? { gainDb: row.gainDb, balanceDb: row.calBalanceDb, voiceDb: row.voiceDb || 0 }
        : await calibrate(score, app.mapping, { passes: 1, sampleRate: 22050, key: scoreHash(score) + (app.style?.id || "") });
      if (!current()) return;
      score.master = { gainDb: cal.gainDb, balanceDb: cal.balanceDb, voiceDb: cal.voiceDb || 0 };
      engine.setMaster(score.master);
    } catch (e) { console.warn("Калібрування гучності не вдалося:", e.message); }
  }

  /* ---- аудіолегенда ---- */
  function renderLegend() {
    const items = legendItems(app.mapping.meta.preset, ctxLegend());
    $("legend-list").replaceChildren(...items.map((it, k) => {
      const li = document.createElement("li");
      const b = Object.assign(document.createElement("button"), { textContent: it.text });
      b.dataset.tip = "tip.legendItem";
      b.addEventListener("click", async () => {
        if (player.playing) { player.pause(); setPlayUI(false); }
        await engine.init(); engine.fade(0.9, 0.02);
        playItem(engine, it);
      });
      b.dataset.icon = "play";
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
  // v6: дрон-орієнтир і тіки шкали часу — опції (вимкнено за замовчуванням); зміна — трек пишеться заново
  for (const id of ["drone", "ticks"]) $(id)?.addEventListener("change", e => { prefs[id] = e.target.checked; if (app.mapping) onMapped(); });
  $("wavBtn").addEventListener("click", async () => {
    const btn = $("wavBtn");
    btn.disabled = true;
    btn.textContent = t("btn.rendering");
    announce(t("wav.preparing"), { force: true });
    try {
      const muted = app.score.parts.filter(p => engine.getPart(p.id).mute).map(p => p.id);
      const { buffer } = await renderOffline(app.score, app.mapping, { muted });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(toWav(buffer));
      a.download = `earth-jukebox-${(app.catalogItem?.id || app.source.name).replace(/[^\w.-]+/g, "_")}.wav`;
      a.click();
      announce(t("wav.saved"), { force: true });
    } catch (e) { announce(t("wav.failed", { msg: e.message }), { force: true }); }
    btn.textContent = t("btn.wav"); btn.disabled = false;
  });

  /* ---- таймлайн для скрінрідера: текстовий опис подій і розділів ---- */
  function describeTimeline() {
    const m = app.mapping, a = app.analysis;
    const secs = m.meta.sections.map(s => `${tr(s.label)} ${fmtTime(s.b0 * m.meta.barDur)}–${fmtTime(Math.min(a.profile.durationSec || 1e9, s.b1 * m.meta.barDur))}`).join("; ");
    const ev = m.bars.flatMap(b => b.events).slice(0, 8).map(e => `${fmtTime(e.time)} ${tr(e.text)}`).join("; ");
    $("tl-desc").textContent = t("tl.describe", { secs, ev: ev ? t("tl.events", { ev }) : t("tl.noEvents") });
  }

  /* ---- стиль звучання (етап 11): перекриває лише інструменти партій; дані й мапінг ті самі ---- */
  let styleList = [];
  const styleOptions = () => {
    for (const o of $("style").options) { const st = styleList.find(x => x.id === o.value); if (st) o.textContent = pick(st, "name"); }
  };
  loadStyles().then(styles => {
    styleList = styles;
    const sel = $("style");
    for (const st of styles) sel.appendChild(Object.assign(document.createElement("option"), { value: st.id, textContent: pick(st, "name") }));
  });
  $("style").addEventListener("change", async e => {
    const st = await loadStyle(e.target.value);
    app.style = st;
    if (!app.mapping) return;
    const was = player.playing, at = player.time;
    await onMapped();
    if (at) await player.seek(at);
    if (was) { await player.play(); setPlayUI(true); }
    announce(st ? t("style.announce", { name: pick(st, "name"), why: pick(st, "why") }) : t("style.announceTopic"), { force: true });
  });

  app.seekTo = t => { if (app.score) player.seek(t); };
  $("play").addEventListener("click", toggle);

  document.addEventListener("keydown", e => {
    if (e.target?.matches?.("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey || !app.score) return;
    if (e.key === " " && !e.target?.matches?.("button")) { e.preventDefault(); toggle(); }
    else if (e.code === "KeyL") { e.preventDefault(); legend(); }
    else if (e.code === "KeyW") { e.preventDefault(); announce(whatNowText(), { force: true }); }
    else if (e.code === "KeyM") {
      const b = Math.min(app.mapping.bars.length - 1, Math.floor(player.time / app.score.barDur));
      announce(`${fmtTime(player.time)}, ${tr(app.mapping.bars[b].sectionLabel)}. ${mappingTable.describe(b)}.`, { force: true });
    }
    else if (e.code === "BracketLeft" || e.code === "BracketRight") { e.preventDefault(); const i = RATES.indexOf(player.rate) + (e.code === "BracketRight" ? 1 : -1); setRate(RATES[Math.max(0, Math.min(RATES.length - 1, i))], true); }
    else if (e.key === "ArrowRight") { e.preventDefault(); player.seek(player.time + 5); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); player.seek(player.time - 5); }
    else if (/^Digit[1-9]$/.test(e.code)) {
      const p = app.score.parts[Number(e.code.slice(5)) - 1];
      if (p) { e.preventDefault(); togglePart(p.id, e.shiftKey ? "solo" : "mute"); }
    }
  });

  /** Мову змінили: підписи пульта, партій, легенди, «Зараз звучить», опис таймлайну. */
  function refresh() {
    if (introRunning) $("play").textContent = t("btn.skipIntro"); else setPlayUI(player.playing);
    styleOptions();
    renderMaster();
    if (!app.score) return;
    renderParts();
    renderLegend();
    describeTimeline();
    onBar(Math.min(app.mapping.bars.length - 1, Math.floor(player.time / app.score.barDur)), true);
    if (!$("track-summary").hidden) showSummary(false);
  }

  return { onMapped, refresh, stop: () => { player.stop(); setPlayUI(false); } };
}
