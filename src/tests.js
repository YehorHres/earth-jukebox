// Автотести двигуна (розділ 8 ТЗ). Відкрити test.html через локальний сервер.
// Кожен етап додає свої перевірки до списку SUITES.
import { openVideo, openImage, openSynthetic } from "./media/sources.js";
import { passA } from "./analysis/pass-a.js";
import { FINAL_SUITES } from "./tests-final.js";
import { UI_SUITES } from "./tests-ui.js";
import { setLang } from "./i18n/index.js";

// Тести перевіряють українські тексти двигуна — сторінка тестів завжди українською (вибір мови сайту не змінюється).
setLang("uk", { persist: false });

const rows = document.getElementById("rows");
const results = [];
const errors = [];
window.addEventListener("error", e => errors.push(e.message));
window.addEventListener("unhandledrejection", e => errors.push(String(e.reason)));

function report(name, ok, detail) {
  results.push({ name, ok, detail });
  const tr = document.createElement("tr");
  tr.innerHTML = `<td></td><td class="${ok ? "pass" : "fail"}">${ok ? "✔ так" : "✘ ні"}</td><td class="d"></td>`;
  tr.cells[0].textContent = name;
  tr.cells[2].textContent = detail;
  rows.appendChild(tr);
}
const check = (name, cond, detail = "") => report(name, !!cond, detail);

/** Статичне фото: теплова карта з градієнтом, намальована на canvas. */
function makeHeatmapImage() {
  const c = document.createElement("canvas"); c.width = 320; c.height = 160;
  const g = c.getContext("2d");
  for (let y = 0; y < 160; y++) {
    const t = 1 - Math.abs(y - 80) / 80; // тепло на «екваторі»
    g.fillStyle = `hsl(${240 - 240 * t}, 90%, 50%)`; g.fillRect(0, y, 320, 1);
  }
  g.fillStyle = "rgb(90,90,90)"; g.fillRect(60, 30, 50, 90); g.fillRect(200, 50, 70, 60); // «континенти»
  return c.toDataURL("image/png");
}

export const SUITES = [];

SUITES.push(async function stage1() {
  // 1. ECCO2
  const t0 = performance.now();
  const ecco = await openVideo(["samples/ecco2_sst_flow.webm", "samples/ecco2_sst_flow.mp4"], { name: "ecco2_sst_flow" });
  const pe = await passA(ecco);
  const dt = (performance.now() - t0) / 1000;
  check("ECCO2: тип сцени = heatmap", pe.sceneType === "heatmap", `${pe.sceneType}, впевненість ${pe.confidence.toFixed(2)}`);
  check("ECCO2: суша виключена (15–45 % кадру)", pe.shares.land > 0.15 && pe.shares.land < 0.45, `суша ${(pe.shares.land * 100).toFixed(1)} %`);
  check("ECCO2: зміни значущі", pe.changeScale !== "none" && pe.changeRatio > 4, `${pe.changeScale}, ×${pe.changeRatio.toFixed(1)} над шумом`);
  check("ECCO2: огляд < 15 с", dt < 15, `${dt.toFixed(1)} с (разом із завантаженням файлу)`);
  window.__ecco = { source: ecco, profile: pe };

  // 2. Синтетичне темне відео з малими змінами
  const dark = openSynthetic("dark-lights");
  const pd = await passA(dark);
  check("Темне відео: тип = nightlights", pd.sceneType === "nightlights", `${pd.sceneType}, ${pd.confidence.toFixed(2)}`);
  check("Темне відео: масштаб tiny/small", ["tiny", "small"].includes(pd.changeScale), `${pd.changeScale}, амплітуда ${(pd.changeAmp * 100).toFixed(2)} %, ×${pd.changeRatio.toFixed(1)}`);
  check("Темне відео: статичний підпис у масці", pd.shares.overlay + pd.shares.land > 0 && pd.shares.overlay + pd.shares.land < 0.05, `підписи ${(pd.shares.overlay * 100).toFixed(2)} %, «суша» ${(pd.shares.land * 100).toFixed(2)} %`);

  // 3. Статичне відео
  const st = openSynthetic("static-dark");
  const ps = await passA(st);
  check("Статичне відео: змін немає", ps.changeScale === "none", `${ps.changeScale}, ×${ps.changeRatio.toFixed(2)}`);
  check("Статичне відео: без фальшивого циклу", !ps.period, ps.period ? `цикл ${ps.period.seconds} с` : "циклу немає");

  // 4. Статичне фото
  const img = await openImage(makeHeatmapImage(), { name: "test-heatmap.png" });
  const pi = await passA(img);
  check("Фото: аналіз без помилок, тип heatmap", pi.isStill && pi.sceneType === "heatmap", `${pi.sceneType}, суша ${(pi.shares.land * 100).toFixed(1)} %`);
  window.__still = { source: img, profile: pi };
});

SUITES.push(async function stage2() {
  const { analyzeSource } = await import("./analysis/analyze.js");
  const { cacheGet } = await import("./analysis/cache.js");
  // темне відео: прохід B, підсилення, події
  const dark = openSynthetic("dark-lights");
  const t0 = performance.now();
  const a1 = await analyzeSource(dark, { useCache: false });
  const dt = (performance.now() - t0) / 1000;
  const lf = a1.leadFeature, ln = lf && a1.norm[lf];
  check("Темне відео: прохід B у Worker", a1.processor.startsWith("worker"), `${a1.processor}, ${a1.count} кадрів за ${dt.toFixed(1)} с`);
  check("Темне відео: зміни значущі й підсилені (gain > 1)", ln && ln.significant && ln.gain > 1, ln ? `${a1.labels[lf]}: розмах ${(ln.spread * 100).toFixed(2)} %, gain ×${ln.gain.toFixed(1)}, шкала ${ln.scale}` : "провідної ознаки немає");
  const relSpan = lf ? Math.max(...a1.rel[lf]) - Math.min(...a1.rel[lf]) : 0;
  check("Темне відео: rel розтягнуто на більшу частину шкали", relSpan > 0.6, `розмах rel = ${relSpan.toFixed(2)}`);
  check("Темне відео: є кульмінація (місто найяскравіше ближче до кінця)", a1.climax && a1.climax.time > dark.duration * 0.6, a1.climax ? `${a1.climax.time.toFixed(1)} с` : "немає");
  // детермінованість
  const a2 = await analyzeSource(openSynthetic("dark-lights"), { useCache: false });
  let same = a1.count === a2.count;
  for (const k in a1.abs) for (let i = 0; same && i < a1.count; i++) if (a1.abs[k][i] !== a2.abs[k][i]) same = false;
  check("Детермінованість: однаковий файл → однаковий аналіз", same && a1.events.length === a2.events.length, `${a1.count} кадрів, подій ${a1.events.length} / ${a2.events.length}`);
  // кеш
  await analyzeSource(openSynthetic("dark-lights"));
  const hit = await analyzeSource(openSynthetic("dark-lights"));
  check("Кеш IndexedDB: повторний аналіз миттєвий", hit.fromCache === true, hit.fromCache ? "узято з кешу" : "кеш не спрацював");
  // статичне відео — без фальшивих подій
  const as = await analyzeSource(openSynthetic("static-dark"), { useCache: false });
  const sig = Object.entries(as.norm).filter(([, v]) => v.significant).map(([k]) => k);
  check("Статичне відео: жодної значущої ознаки, подій немає", !sig.length && !as.events.length && !as.climax, `значущі: ${sig.join(", ") || "немає"}; подій ${as.events.length}`);
  const tr = Math.max(...Array.from(as.temporal["lightLog.trend40"], Math.abs));
  check("Статичне відео: тренд ≈ 0", tr < 0.35, `max |trend40| = ${tr.toFixed(2)}`);
  // фото
  const img = await openImage(makeHeatmapImage(), { name: "test-heatmap.png" });
  const ai = await analyzeSource(img, { useCache: false });
  check("Фото: 1 кадр, часові ознаки = 0", ai.count === 1 && ai.temporal["warmth.trend40"][0] === 0 && ai.zones[0].cols.length === 16, `кадрів ${ai.count}, колонок ${ai.zones[0].cols.length}`);
  window.__dark = a1;
});

SUITES.push(async function stage3() {
  const { analyzeSource } = await import("./analysis/analyze.js");
  const { presetFor, mapAnalysis, PARAMS } = await import("./mapping/mapper.js");
  const { loadTopics, getTopic } = await import("./topics/topics.js");
  await loadTopics();
  // тема визначає звучання; для перевірок шару 2 — теми з рівним розміром 4/4
  const TOPIC_OF = { nightlights: "nightlights", heatmap: "temperature" };
  const run = async (src, preset) => { const a = await analyzeSource(src); const t = getTopic(TOPIC_OF[preset] || "generic"); return { a, m: mapAnalysis(a, await presetFor(a.profile.sceneType, t), { topic: t }) }; };
  const inRange = m => m.bars.every(b => PARAMS.every(p => Number.isFinite(b.params[p]) && b.params[p] >= (p === "pan" ? -1 : 0) && b.params[p] <= 1));
  const order = m => m.meta.sections.map(s => s.id).join(" → ");

  const { a: ad, m: md } = await run(openSynthetic("dark-lights"), "nightlights");
  check("Мапінг (темне відео): параметри в межах, explain є", inRange(md) && md.bars.every(b => b.explain.energy.length), `${md.meta.nBars} тактів по ${md.meta.barDur.toFixed(2)} с, ${md.meta.bpm} BPM`);
  const half = Math.floor(md.bars.length / 2);
  const e1 = md.bars.slice(0, half).reduce((s, b) => s + b.params.energy, 0) / half, e2 = md.bars.slice(half).reduce((s, b) => s + b.params.energy, 0) / (md.bars.length - half);
  check("Мапінг (темне відео): енергія зростає разом зі світлом міста", e2 > e1 + 0.05, `перша половина ${e1.toFixed(2)}, друга ${e2.toFixed(2)}`);
  const cl = md.meta.sections.find(s => s.id === "climax");
  check("Форма: вступ → … → кульмінація → розв'язка, кульмінація ближче до кінця", order(md).startsWith("intro") && order(md).endsWith("resolution") && cl && cl.b0 >= md.meta.nBars * 0.4, order(md));
  check("Яскравість ладу темна для темної карти (abs)", md.bars.every(b => b.params.brightness < 0.5), `brightness ${Math.min(...md.bars.map(b => b.params.brightness)).toFixed(2)}…${Math.max(...md.bars.map(b => b.params.brightness)).toFixed(2)}`);

  const { m: ms } = await run(openSynthetic("static-dark"), "nightlights");
  const eS = ms.bars.map(b => b.params.energy), tS = ms.bars.map(b => b.params.tension);
  check("Статичне відео: без акцентів і кульмінації, спокійні параметри", ms.bars.every(b => b.params.accent === 0) && !ms.meta.sections.some(s => s.id === "climax") && Math.max(...eS) - Math.min(...eS) < 0.1 && Math.max(...tS) < 0.4,
    `${order(ms)}; енергія ${Math.min(...eS).toFixed(2)}…${Math.max(...eS).toFixed(2)}, напруга ≤ ${Math.max(...tS).toFixed(2)}`);

  const { m: mi } = await run(window.__still.source, "heatmap");
  check("Фото: 8 тактів сканування, контур мелодії з даних", mi.bars.length === 8 && mi.bars[0].params.contour.filter(v => v !== null).length >= 8, `контур: ${mi.bars[0].params.contour.map(v => v === null ? "·" : Math.round(v * 9)).join("")}`);

  const ecco = window.__ecco;
  const ae = await analyzeSource(ecco.source);
  const me = mapAnalysis(ae, await presetFor(ae.profile.sceneType, getTopic("temperature")), { topic: getTopic("temperature") });
  const acc = me.bars.filter(b => b.params.accent > 0).length;
  check("ECCO2: мапінг, акценти подій (не в кожному такті), суша = паузи в контурі", inRange(me) && acc > 0 && acc <= me.bars.length * 0.6 && me.bars.some(b => b.params.contour.includes(null)),
    `${me.meta.nBars} тактів, ${me.meta.bpm} BPM, тактів з акцентами ${acc}; ${order(me)}; контур такту 5: ${me.bars[5].params.contour.map(v => v === null ? "·" : Math.round(v * 9)).join("")}`);
  window.__mapEcco = me; window.__mapDark = md;
});

SUITES.push(async function stage4() {
  const { compose } = await import("./composer/composer.js");
  const { renderOffline } = await import("./audio/render.js");
  const me = window.__mapEcco, md = window.__mapDark;
  const s1 = compose(me, { seed: "ecco" }), s2 = compose(me, { seed: "ecco" });
  const valid = s => s.notes.every(n => Number.isFinite(n.t) && n.t >= 0 && n.dur > 0 && n.vel > 0 && n.vel <= 1 && (n.midi === 0 || (n.midi >= 21 && n.midi <= 108)));
  check("Композитор (ECCO2): ноти коректні", s1.notes.length > 100 && valid(s1), `${s1.notes.length} нот, ${s1.bpm} BPM, тональність ${s1.key}, партії: ${s1.parts.map(p => p.id).join(", ")}`);
  check("Композитор: детермінованість (seed)", JSON.stringify(s1.notes) === JSON.stringify(s2.notes), "дві партитури однакові");
  const introParts = Math.max(...s1.bars.filter((_, b) => me.bars[b].section === "intro" && !me.bars[b].transition).map(x => x.active.length));
  const climaxParts = Math.max(...s1.bars.filter((_, b) => me.bars[b].section === "climax").map(x => x.active.length));
  check("Оркестровка: вступ ≤ 3 партії, кульмінація — більше", introParts <= 3 && climaxParts > introParts, `вступ ${introParts}, кульмінація ${climaxParts}`);
  const modes = new Set(s1.harmony.bars.map(h => h.mode.label));
  check("Гармонія: лад із даних, акорди змінюються", s1.harmony.bars.length === me.bars.length && new Set(s1.harmony.bars.map(h => h.chords[0].chord.degree)).size >= 3, `лади: ${[...modes].join(", ")}; модуляцій ${s1.harmony.modulations.length}`);
  // голосоведення педів: середній рух голосу між акордами невеликий
  const padBars = {};
  for (const n of s1.notes) if (n.part === "pad") (padBars[Math.round(n.t / s1.barDur)] ||= []).push(n.midi);
  const keys = Object.keys(padBars).map(Number).sort((a, b) => a - b);
  let mv = 0, cnt = 0;
  for (let k = 1; k < keys.length; k++) { const a = padBars[keys[k - 1]].sort((x, y) => x - y), b = padBars[keys[k]].sort((x, y) => x - y); for (const v of b) { mv += Math.min(...a.map(p => Math.abs(p - v))); cnt++; } }
  check("Голосоведення педів: мінімальний рух голосів", cnt && mv / cnt < 3, `середній рух ${(mv / cnt).toFixed(2)} півтону`);
  const sd = compose(md, { seed: "dark" });
  check("Нічна карта: дрон і арфа замість контрабаса й фортепіано", sd.parts.find(p => p.id === "bass").instrument === "drone" && sd.parts.find(p => p.id === "arp").instrument === "harp", sd.parts.map(p => `${p.id}=${p.instrument}`).join(", "));
  // офлайн-рендер: звучить, не клипує
  const r = await renderOffline(s1, me, { from: 0, seconds: 12 });
  check("Звук (офлайн-рендер 12 с ECCO2): є сигнал, без перевантаження", r.rms > 0.005 && r.peak <= 1.0, `RMS ${r.rms.toFixed(3)}, пік ${r.peak.toFixed(3)}`);
  const rd = await renderOffline(sd, md, { from: md.meta.duration * 0.6, seconds: 10 });
  check("Звук (темне відео): не тиша, без перевантаження", rd.rms > 0.002 && rd.peak <= 1, `RMS ${rd.rms.toFixed(3)}, пік ${rd.peak.toFixed(3)}`);
  window.__score = s1;
});

SUITES.push(async function stage5() {
  const { compose } = await import("./composer/composer.js");
  const me = window.__mapEcco, md = window.__mapDark;
  // етап 16: партія melody грає лише без голосу даних (grammar: false) — її правила перевіряємо в цьому режимі
  const s = compose(me, { seed: "ecco" }), sOld = compose(me, { seed: "ecco", grammar: false });
  const mel = sOld.notes.filter(n => n.part === "melody" && !n.motif);
  // висота мелодії відповідає даним колонки (кореляція рангів)
  // крок мелодії з урахуванням «людського» зсуву (нота на 0-му кроці може прозвучати на мілісекунди раніше)
  const stepOf = n => { const g = Math.round(n.t / s.barDur * 16); return { b: Math.min(me.bars.length - 1, Math.floor(g / 16)), col: g % 16 }; };
  const pairs = mel.map(n => { const { b, col } = stepOf(n); return [me.bars[b].params.contour[col], n.midi, col, n.pan]; }).filter(p => p[0] !== null);
  const rank = arr => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); idx.forEach(([, i], k) => (r[i] = k)); return r; };
  const corr = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
  const rho = pairs.length > 5 ? corr(rank(pairs.map(p => p[0])), rank(pairs.map(p => p[1]))) : 0;
  check("Мелодія: висота відповідає даним колонки", mel.length > 20 && rho > 0.4, `${mel.length} нот, кореляція рангів ρ = ${rho.toFixed(2)}`);
  const panOk = pairs.every(p => Math.abs(p[3] - (-0.7 + 1.4 * p[2] / 15)) < 0.15);
  check("Мелодія: панорама = колонка кадру (захід ліворуч, схід праворуч)", panOk, "");
  // паузи там, де даних немає
  let restViol = 0;
  for (const n of mel) { const { b, col } = stepOf(n); if (me.bars[b].params.contour[col] === null) restViol++; }
  check("Мелодія: на суші пауза", restViol === 0, `порушень ${restViol}`);
  const counterBars = new Set(s.notes.filter(n => n.part === "counter").map(n => me.bars[Math.min(me.bars.length - 1, Math.floor(n.t / s.barDur))].section));
  check("Контрмелодія — лише в наростанні й кульмінації", counterBars.size > 0 && [...counterBars].every(x => x === "build" || x === "climax"), [...counterBars].join(", ") || "не звучить");
  const acc = sOld.notes.filter(n => n.part === "accents");
  const evBars = me.bars.filter(b => b.events.length).length;
  check("Акценти: без голосу даних — на подіях (дзвони на кульмінації); з граматикою звуку — мовчать (подію позначає ерікон)", !s.notes.some(n => n.part === "accents") && acc.length > 0 && (acc.some(n => n.inst === "bells") || !me.bars.some(b => b.events.some(e => e.type === "globalMax"))), `${acc.length} нот акцентів у ${evBars} тактах з подіями; інструменти: ${[...new Set(acc.map(n => n.inst))].join(", ")}`);
  const sd = compose(md, { seed: "dark" });
  check("Нічна карта: «зоряний дощ», без брас-стабів", sd.notes.some(n => n.part === "stars") && !sd.notes.some(n => n.inst === "brass"), `зірок ${sd.notes.filter(n => n.part === "stars").length}`);
  check("Теплова карта: без «зоряного дощу»", !s.parts.some(p => p.id === "stars"), s.parts.map(p => p.id).join(", "));
  window.__score = s;
});

SUITES.push(async function stage6() {
  const S = await import("./audio/samples.js");
  const I = await import("./audio/instruments.js");
  const { renderOffline } = await import("./audio/render.js");
  const s = window.__score, me = window.__mapEcco;
  const insts = [...new Set(s.notes.map(n => n.inst))];
  const r = await S.loadSamples(new OfflineAudioContext(1, 1, 44100), insts);
  check("Семпли: завантажено для інструментів треку", r.loaded.length >= 3 && !r.failed.length, `семпли: ${r.loaded.join(", ")}; синтезатор: ${insts.filter(i => !I.hasSampler(i)).join(", ")}`);
  const out = await renderOffline(s, me, { from: me.meta.duration * 0.45, seconds: 12 });
  check("Звук із семплами: є сигнал, без перевантаження", out.rms > 0.005 && out.peak <= 1, `RMS ${out.rms.toFixed(3)}, пік ${out.peak.toFixed(3)}`);
  // запасний варіант: семплів немає → синтезатор, музика не мовчить
  S.SAMPLE_SETS.cello = ["C3"];
  const rc = await S.loadSamples(new OfflineAudioContext(1, 1, 44100), ["cello"]);
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const { Engine } = await import("./audio/engine.js");
  const e = new Engine(); await e.init(ctx);
  I.playNote(e, e.bus("t"), "cello", { midi: 48, dur: 0.5, vel: 0.7, pan: 0 }, 0.01);
  const b = await ctx.startRendering(); let m = 0; for (const v of b.getChannelData(0)) m = Math.max(m, Math.abs(v));
  check("Немає семплів → синтезатор (музика не мовчить)", rc.failed.includes("cello") && m > 0.01, `статус: ${S.sampleStatus.cello}, пік ${m.toFixed(3)}`);
  delete S.SAMPLE_SETS.cello;
});

SUITES.push(async function stage7() {
  const { renderOffline, toWav } = await import("./audio/render.js");
  const { legendItems, playItem } = await import("./a11y/legend.js");
  const { Engine } = await import("./audio/engine.js");
  const s = window.__score, me = window.__mapEcco;
  const r = await renderOffline(s, me, { from: 0, seconds: 3 });
  const wav = toWav(r.buffer);
  check("Експорт WAV: коректний розмір файлу", wav.size === 44 + r.buffer.length * 2 * 2, `${(wav.size / 1024).toFixed(0)} КБ за 3 с`);
  // аудіолегенда: кожен пункт звучить
  let silent = [];
  for (const scene of ["heatmap", "nightlights"]) for (const it of legendItems(scene)) {
    const ctx = new OfflineAudioContext(2, 44100 * 2, 44100);
    const e = new Engine(); await e.init(ctx);
    playItem(e, it, 0.01);
    const b = await ctx.startRendering(); let m = 0; for (const v of b.getChannelData(0)) m = Math.max(m, Math.abs(v));
    if (m < 0.005) silent.push(it.text.slice(0, 30));
  }
  check("Аудіолегенда: усі пункти звучать (heatmap, nightlights)", !silent.length, silent.join("; ") || `${legendItems("heatmap").length + legendItems("nightlights").length} пунктів`);
});

SUITES.push(async function stage9() {
  const T = await import("./topics/topics.js");
  const topics = await T.loadTopics();
  const { presetFor, mapAnalysis } = await import("./mapping/mapper.js");
  const { compose } = await import("./composer/composer.js");
  const { renderOffline } = await import("./audio/render.js");
  const { analyzeSource } = await import("./analysis/analyze.js");
  // зіставлення тексту з темою (ТЗ v3, етап 9.6)
  const cases = [["викиди CO2", "co2"], ["вуглекислий газ", "co2"], ["carbon dioxide emissions", "co2"], ["СО2", "co2"], ["це о два", "co2"],
    ["гроза", "storms"], ["ураган", "storms"], ["hurricane", "storms"], ["thunderstorm", "storms"], ["урагани над Атлантикою", "storms"],
    ["морський лід", "ice"], ["льоду в Арктиці", "ice"], ["лісові пожежі", "fires"], ["sea surface temperature", "temperature"], ["NDVI", "vegetation"]];
  const bad = cases.filter(([q, id]) => T.matchTopic(q, topics).topic?.id !== id).map(([q, id]) => `${q} → ${T.matchTopic(q, topics).topic?.id || "—"} (треба ${id})`);
  check("Тема з тексту: CO₂, шторми, лід, пожежі, температура, NDVI (uk/en)", !bad.length, bad.join("; ") || `${cases.length} фраз розпізнано`);
  check("Тема з тексту: нерелевантне не вгадуємо", !T.matchTopic("бананові ціни", topics).topic, "«бананові ціни» → немає збігу");
  check("Теми без російської: усі мають uk і en синоніми", topics.every(t => t.synonyms.uk.length && t.synonyms.en.length && t.soundProfile && t.name.uk && t.name.en), `${topics.length} тем`);

  // одне відео з різними темами → різні інструменти, розмір/BPM/тональність
  const a = await analyzeSource(window.__ecco.source);
  const trackFor = async id => { const t = T.getTopic(id); const m = mapAnalysis(a, await presetFor(a.profile.sceneType, t), { topic: t }); return { m, s: compose(m, { seed: `ecco2|${id}` }) }; };
  const sig = x => `${x.s.key} ${x.s.meter.id} ${x.s.bpm} BPM | ${x.s.parts.map(p => p.instrument).join(",")}`;
  const res = {};
  for (const id of ["co2", "storms", "ice", "vegetation", "ocean-currents"]) res[id] = await trackFor(id);
  const sigs = Object.values(res).map(sig);
  check("Одне відео, різні теми → різні тембри й характер", new Set(sigs).size === sigs.length, Object.entries(res).map(([k, v]) => `${k}: ${sig(v)}`).join(" · "));
  check("Тема задає розмір: лід 3/4, рослинність 6/8, CO₂ 4/4", res.ice.s.meter.id === "3/4" && res.vegetation.s.meter.id === "6/8" && res.co2.s.meter.id === "4/4", "");
  const bpmOk = Object.entries(res).every(([id, v]) => { const r = T.getTopic(id).soundProfile.bpm; return v.s.bpm >= r[0] && v.s.bpm <= r[1]; });
  check("BPM у діапазоні теми, усе пояснено (why)", bpmOk && Object.values(res).every(v => v.m.meta.why.key && v.m.meta.why.tempo && v.m.meta.why.sound), res.co2.m.meta.why.key);
  const again = compose(res.storms.m, { seed: "ecco2|storms" });
  check("Однаковий seed → однаковий трек", JSON.stringify(again.notes) === JSON.stringify(res.storms.s.notes), `${again.notes.length} нот`);
  // кожна тема рендериться офлайн без помилок і звучить
  const silent = [];
  for (const t of topics) {
    const x = await trackFor(t.id);
    const r = await renderOffline(x.s, x.m, { from: x.m.meta.duration * 0.4, seconds: 4 });
    if (!(r.rms > 0.003) || r.peak > 1) silent.push(`${t.id} (RMS ${r.rms.toFixed(3)}, пік ${r.peak.toFixed(2)})`);
  }
  check("Кожна з тем звучить (офлайн-рендер), без перевантаження", !silent.length, silent.join("; ") || `${topics.length} тем`);
});

SUITES.push(async function stage10() {
  const { SCENES } = await import("./media/synthetic-scenes.js");
  const { analyzeSource, prepareImageScan } = await import("./analysis/analyze.js");
  const { presetFor, mapAnalysis } = await import("./mapping/mapper.js");
  const { compose } = await import("./composer/composer.js");
  const { renderOffline } = await import("./audio/render.js");
  const T = await import("./topics/topics.js"); await T.loadTopics();
  const iou = (p, sc) => {
    const { maskW: w, maskH: h, regionMask: m } = p; let inter = 0, uni = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = sc.truth((x + 0.5) * sc.w / w, (y + 0.5) * sc.h / h) ? 1 : 0, r = m[y * w + x];
      if (t && r) inter++; if (t || r) uni++;
    }
    return inter / uni;
  };
  const playOk = async a => {
    const t = T.getTopic(a.profile.sceneType === "nightlights" ? "nightlights" : "temperature");
    const m = mapAnalysis(a, await presetFor(a.profile.sceneType, t), { topic: t });
    const sc = compose(m, { seed: a.key });
    const r = await renderOffline(sc, m, { from: 0, seconds: 3 });
    return { ok: sc.notes.length > 0 && r.peak <= 1 && Number.isFinite(r.rms), m, notes: sc.notes.length };
  };
  const rows = [];
  for (const id of ["globe", "globe-night", "flatmap", "map-scale", "bars", "dark", "bright", "short", "long", "vertical", "chart"]) {
    const sc = SCENES[id];
    const a = await analyzeSource(openSynthetic(id), { useCache: false });
    const p = a.profile, io = iou(p, sc);
    const shapeOk = sc.shape === "any" || (sc.shape === "full" ? p.region.full : p.region.shape === sc.shape);
    const play = await playOk(a);
    rows.push({ id, io, shapeOk, a, play });
    check(`Стійкість «${id}»: область IoU ≥ 0.9, форма, трек грає`, io >= 0.9 && shapeOk && play.ok,
      `IoU ${io.toFixed(3)}, форма ${p.region.full ? "весь кадр" : p.region.shape}, ${p.sceneType}, ${a.count} кадрів, ${play.notes} нот`);
  }
  const get = id => rows.find(r => r.id === id).a;
  const ms = get("map-scale");
  let scaleInRegion = 0;
  if (ms.profile.scale.found) { const n = ms.profile.scale.norm, { maskW: w, maskH: h } = ms.profile; for (let y = Math.floor(n.y0 * h); y < Math.ceil(n.y1 * h); y++) for (let x = Math.floor(n.x0 * w); x < Math.ceil(n.x1 * w); x++) scaleInRegion += ms.profile.regionMask[y * w + x]; }
  check("Шкалу кольорів знайдено й вирізано (знизу — менше)", ms.profile.scale.found && ms.profile.scale.orientation === "vertical" && scaleInRegion === 0 && ms.profile.scale.refs[0][2] > ms.profile.scale.refs[0][0],
    ms.profile.scale.found ? `перший колір ${ms.profile.scale.refs[0].map(v => v.toFixed(2))}, у області пікселів шкали: ${scaleInRegion}` : "не знайдено");
  check("Хибних шкал немає (глобус, плоска карта, смуги, графік)", ["globe", "flatmap", "bars", "chart", "vertical"].every(id => !get(id).profile.scale.found), "");
  const g = get("globe"), gn = get("globe-night");
  const am = Math.max(...g.abs.activeMass), dk = Math.max(...gn.abs.darkShare);
  check("Космос не в ознаках: глобус — теплова карта, нічний глобус — нічна; частки рахуються в диску", g.profile.sceneType === "heatmap" && gn.profile.sceneType === "nightlights" && am > 0.5 && dk < 0.5,
    `activeMass глобуса до ${am.toFixed(2)} (з космосом було б ≈ ${(am / 3).toFixed(2)}), темрява нічного до ${dk.toFixed(2)}`);
  check("Зони диска: підписи «північ/центр/південь диска»", g.hotspots.every(h => /диска/.test(h.label)), g.hotspots.map(h => h.label).join("; ") || "немає гарячих точок");
  check("Дуже довге відео (10 хв) проріджено до ≤ 800 кадрів, коротке (3 с) — кожен кадр", get("long").count <= 800 && get("short").count === 75, `10 хв → ${get("long").count} кадрів; 3 с → ${get("short").count}`);
  // фото: режим сканування
  const c = document.createElement("canvas"); c.width = 640; c.height = 360;
  SCENES["map-scale"].draw(c.getContext("2d"), 0, 640, 360);
  const still = await openImage(c.toDataURL(), { name: "scan-test.png" });
  const prep = await prepareImageScan(still, "we");
  const as = await analyzeSource(prep.source, { useCache: false, scaleHint: prep.scaleHint });
  const ps = await playOk(as);
  const b = prep.source.scan.bounds;
  check("Фото: сканування захід→схід 45 с у межах карти, шкала з фото, трек грає", as.count === 90 && !as.profile.isStill && as.profile.scale.found && b.x0 > 0.05 && b.x1 < 0.9 && ps.ok && ps.m.meta.duration > 30 && ps.m.meta.duration <= 61,
    `${as.count} положень, межі x ${b.x0.toFixed(2)}–${b.x1.toFixed(2)}, тривалість ${ps.m.meta.duration.toFixed(0)} с, ${ps.m.meta.nBars} тактів, подій ${as.events.length}`);
  const prepNS = await prepareImageScan(still, "ns");
  const L1 = prepNS.source.scan.lineAt(0), L2 = prepNS.source.scan.lineAt(45);
  check("Фото: напрям північ→південь (лінія йде згори вниз)", L1.dir === "ns" && L2.y > L1.y, `y ${L1.y.toFixed(2)} → ${L2.y.toFixed(2)}`);
});

SUITES.push(async function stage11() {
  const L = await import("./audio/library/index.js");
  const I = await import("./audio/instruments.js");
  const { KITS } = await import("./audio/library/kits.js");
  const { loadStyles } = await import("./styles/index.js");
  const { Engine } = await import("./audio/engine.js");
  const { compose } = await import("./composer/composer.js");
  const { renderOffline } = await import("./audio/render.js");
  const all = L.listInstruments();
  const r = await L.loadFor(new OfflineAudioContext(1, 1, 44100), all.map(i => i.id));
  check("Бібліотека: ≥ 15 семплів CC-BY і ≥ 40 синтезаторів, родини", all.filter(i => i.kind === "sample").length >= 15 && all.filter(i => i.kind === "synth").length >= 40 && !r.failed.length,
    `${all.length} інструментів (${all.filter(i => i.kind === "sample").length} семплів, ${all.filter(i => i.kind === "synth").length} синтезаторів); родини: ${L.families().join(", ")}`);
  const peakOf = async (inst, midi) => {
    const ctx = new OfflineAudioContext(2, 44100 * 1.5, 44100);
    const e = new Engine(); await e.init(ctx);
    I.playNote(e, e.bus("t", { send: 0 }), inst, { midi, dur: 0.8, vel: 0.7, pan: 0, amount: 0.6 }, 0.02);
    const b = await ctx.startRendering(); let m = 0; for (const v of b.getChannelData(0)) m = Math.max(m, Math.abs(v)); return m;
  };
  const silent = [];
  for (const i of all) {
    const midi = Math.round((Math.max(24, i.range[0]) + Math.min(108, i.range[1])) / 2);
    if ((await peakOf(i.id, midi)) < 0.003) silent.push(i.id);
    if (i.kind === "sample" && (await peakOf(I.FALLBACK[i.id] || i.id, midi)) < 0.003) silent.push(`${i.id} (запасний синтезатор)`);
  }
  check("Кожен інструмент бібліотеки звучить (і запасні синтезатори семплів)", !silent.length, silent.join(", ") || `${all.length} інструментів`);
  // стиль змінює лише інструменти: ті самі ноти, ритм і форма
  const m = window.__mapEcco, base = compose(m, { seed: "s11" });
  const styles = await loadStyles();
  // стиль не чіпає даних: та сама гармонія (тональність, лади, акорди) і ті самі моменти нот партій;
  // висота може зсунутись в регістр нового інструмента, бас-дрон тримає довгу ноту — це тембр, не дані
  const sig = s => s.harmony.bars.map(h => `${h.root}${h.mode.id}${h.chords[0].chord.degree}`).join(",") + "#" +
    s.notes.filter(n => ["pad", "arp", "melody", "counter", "accents"].includes(n.part)).map(n => `${n.part}:${n.t.toFixed(3)}`).join("|");
  const bad = [], diffs = [];
  for (const st of styles) {
    const s = compose(m, { seed: "s11", style: st });
    if (sig(s) !== sig(base)) bad.push(st.id);
    diffs.push(`${st.id}: ${s.parts.map(p => p.instrument).slice(0, 5).join(",")} / ${s.kit.id}`);
    const out = await renderOffline(s, m, { from: m.meta.duration * 0.45, seconds: 3 });
    if (!(out.rms > 0.003) || out.peak > 1) bad.push(`${st.id} (рендер)`);
  }
  check("Стилі: та сама гармонія й ритм, інші інструменти; кожен стиль звучить", !bad.length, bad.join(", ") || diffs.join(" · "));
  const drumsInst = st => new Set(compose(m, { seed: "s11", style: st }).notes.filter(n => n.part === "drums").map(n => n.inst));
  const el = drumsInst(styles.find(s => s.id === "electronic")), orch = drumsInst(styles.find(s => s.id === "orchestral"));
  check("Набори ударних: електронний ≠ оркестровий", [...el].some(i => ["kick808", "clap", "hihat", "tom"].includes(i)) && ![...orch].some(i => ["kick808", "clap", "hihat"].includes(i)) && Object.keys(KITS).length >= 4,
    `електронний: ${[...el].join(",")}; оркестровий: ${[...orch].join(",")}`);
});

SUITES.push(async function stage12() {
  const X = await import("./ui/explore.js");
  // місце на плоскій карті й на диску
  const flat = { projection: "equirect", region: { shape: "rect", full: true, norm: { bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } } } };
  const a = X.placeOf(0.5, 0.5, flat), b = X.placeOf(0.25, 0.25, flat);
  check("Зонд: широта/довгота на плоскій карті", a.lat === 0 && a.lon === 0 && b.lat === 45 && b.lon === -90, `${a.text} · ${b.text}`);
  const globe = { maskW: 160, maskH: 90, region: { shape: "disk", norm: { disk: { cx: 0.5, cy: 0.5, r: 0.2 } } } };
  const c = X.placeOf(0.5, 0.5 - 0.2 * (160 / 90) * 0.9, globe), d = X.placeOf(0.05, 0.5, globe);
  check("Зонд: глобус — частина диска, космос — поза диском", c.inside && /північ диска/.test(c.text) && !d.inside, `${c.text} · ${d.text}`);
  // значення з пікселів: тепле, холодне, суша, нічні вогні
  const px = (rgb, n = 25) => { const a = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) a.set([...rgb, 255], i * 4); return a; };
  const warm = X.valueFromPixels(px([240, 30, 20])), cold = X.valueFromPixels(px([20, 40, 240])), land = X.valueFromPixels(px([95, 95, 95]));
  const lit = X.valueFromPixels(px([200, 170, 110]), { sceneType: "nightlights" }), dark = X.valueFromPixels(px([4, 5, 9]), { sceneType: "nightlights" });
  check("Зонд: значення — тепле > холодне, суша, вогні > темрява", warm.value > 0.9 && cold.value < 0.1 && land.kind === "land" && lit.value > dark.value,
    `тепле ${warm.value.toFixed(2)}, холодне ${cold.value.toFixed(2)}, сіре: ${land.kind}, вогні ${lit.value.toFixed(2)} / темрява ${dark.value.toFixed(2)}`);
  const vt = X.valueText({ value: 0.5, kind: "data" }, { range: { min: 0, max: 30, units: "°C" } });
  check("Зонд: одиниці лише якщо діапазон відомий", /15\.0 °C/.test(vt) && !/°C/.test(X.valueText({ value: 0.5, kind: "data" })), vt);

  // повний сценарій лише з клавіатури (застосунок в iframe)
  const fr = document.createElement("iframe");
  fr.style.cssText = "width:900px;height:700px;position:absolute;left:-2000px";
  fr.src = "index.html?lang=uk";
  document.body.appendChild(fr);
  await new Promise(r => fr.addEventListener("load", r, { once: true }));
  const w = fr.contentWindow, doc = fr.contentDocument;
  w.addEventListener("error", e => errors.push("застосунок: " + e.message));  // помилки обробників у iframe теж рахуємо
  for (let i = 0; i < 160 && !w.jukebox?.catalog; i++) await new Promise(r => setTimeout(r, 250));   // до 40 с: у фоновій вкладці завантаження повільне
  const key = (k, o = {}) => doc.body.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, code: o.code || (k.length === 1 ? "Key" + k.toUpperCase() : k), shiftKey: !!o.shift, bubbles: true, cancelable: true }));
  await w.jukebox.loadItem(w.jukebox.catalog[0]);
  const log = [];
  key("e"); await new Promise(r => setTimeout(r, 1400));
  const st = w.jukebox.explore;
  log.push(`E → ${st.on ? "увімкнено" : "ні"}`);
  const x0 = st.x;
  key("ArrowRight"); key("ArrowRight", { shift: true });
  log.push(`→, Shift+→: x ${x0.toFixed(2)} → ${st.x.toFixed(2)}`);
  const movedOk = Math.abs(st.x - x0 - 0.12) < 1e-6 && w.jukebox.player.time === 0;
  key("Home"); const homeOk = Math.abs(st.x - x0) < 1e-6;
  key("Enter");
  // aria-live оновлюється таймером (30 мс); у фоновій вкладці таймери сповільнені — чекаємо на опис точки до 3 с
  for (let i = 0; i < 30 && !/пн\.|пд\./.test(doc.getElementById("live").textContent); i++) await new Promise(r => setTimeout(r, 100));
  const live = doc.getElementById("live").textContent;
  log.push(`Enter → «${live.slice(0, 60)}…»`);
  key("Escape"); await new Promise(r => setTimeout(r, 100));
  log.push(`Esc → ${st.on ? "увімкнено" : "вимкнено"}`);
  check("Сценарій лише з клавіатури: E, стрілки (Shift — більший крок), Home, Enter, Esc; трек не перемотується", movedOk && homeOk && /пн\.|пд\./.test(live) && !st.on, log.join("; "));
  fr.remove();
});

SUITES.push(async function stage13() {
  const { deserializeAnalysis } = await import("./analysis/serialize.js");
  const { ANALYSIS_VERSION } = await import("./analysis/analyze.js");
  const T = await import("./topics/topics.js"); await T.loadTopics();
  const { legendItems } = await import("./a11y/legend.js");
  const cat = await (await fetch("samples/catalog.json")).json();
  const real = cat.filter(i => i.kind === "video");
  const topics = new Set(real.map(i => i.topic));
  const bad = [];
  for (const it of real) {
    const c = it.card || {};
    if (!["variable", "units", "region", "years", "authors", "source"].every(k => c[k])) bad.push(`${it.id}: неповна картка`);
    if (!T.getTopic(it.topic) || T.getTopic(it.topic).id !== it.topic) bad.push(`${it.id}: тема ${it.topic}`);
    try {
      const a = deserializeAnalysis(await (await fetch(it.analysis)).json());
      if (a.version !== ANALYSIS_VERSION) bad.push(`${it.id}: застаріла версія аналізу ${a.version}`);
    } catch (e) { bad.push(`${it.id}: аналіз ${e.message}`); }
    for (const src of it.src) { const r = await fetch(src, { method: "HEAD" }); if (!r.ok) bad.push(`${src}: HTTP ${r.status}`); }
  }
  check("Галерея: ≥ 4 справжні відео NASA різних тем, картки, готові аналізи, webm + mp4", real.length >= 4 && topics.size >= 4 && !bad.length,
    bad.join("; ") || `${real.length} відео, теми: ${[...topics].join(", ")}`);
  const intro = legendItems("heatmap", { topic: T.getTopic("ice"), colorMore: "більше льоду" }).filter(i => i.intro);
  check("Голосовий вступ: пункти теми (що означає «більше», тембр)", intro.length === 2 && /більше льоду/.test(intro[0].text) && /Тембр теми/.test(intro[1].text), intro.map(i => i.text).join(" / "));
  const readme = await (await fetch("README.md")).text();
  check("README: як працює, звук ← дані, ліцензії й автори", /Як це працює/.test(readme) && /Звук ← дані/.test(readme) && /CC-BY 3\.0/.test(readme) && real.every(i => readme.includes(i.card.source.replace("https://", "").replace(/\/$/, "").split("/").pop() || "svs")), "");
});

SUITES.push(async function stage14() {
  const M = await import("./audio/measure.js");
  const { Engine, levelFor, CEILING, PART_EQ } = await import("./audio/engine.js");
  const { renderOffline } = await import("./audio/render.js");
  const { buildTrack, scoreHash, CRITERIA } = await import("./audio/report.js");
  const I = await import("./audio/instruments.js");
  // вимірювач: відомі сигнали
  const fs = 44100, N = fs * 3, tone = (f, a) => Float32Array.from({ length: N }, (_, i) => a * Math.sin(2 * Math.PI * f * i / fs));
  const l1k = M.lufs(tone(1000, 0.1), tone(1000, 0.1), fs);
  const b40 = M.bandShares(tone(40, 0.3), tone(40, 0.3), fs), b1k = M.bandShares(tone(1000, 0.3), tone(1000, 0.3), fs);
  check("Вимірювач: LUFS синуса 1 кГц −20 dBFS ≈ −20; смуги 40 Гц і 1 кГц", Math.abs(l1k + 20) < 0.4 && b40[0] > 0.95 && b1k[3] > 0.95, `LUFS ${l1k.toFixed(2)}; 40 Гц → «<60» ${(b40[0] * 100).toFixed(0)} %; 1 кГц → «500–2k» ${(b1k[3] * 100).toFixed(0)} %`);
  // стеля −1 dBFS: навмисно перевантажений вхід
  const ctx = new OfflineAudioContext(2, fs * 2, fs), e = new Engine();
  e.masterCal = { gainDb: 24, balanceDb: 0 }; await e.init(ctx);
  for (let k = 0; k < 12; k++) I.playNote(e, e.bus("melody"), "brass", { midi: 48 + k * 2, dur: 1.5, vel: 1, pan: 0 }, 0.05);
  const hot = M.measure(await ctx.startRendering());
  check("Мастер: стеля −1 dBFS навіть при перевантаженні +24 дБ", hot.peakDb <= -1 && hot.peakDb > -3, `пік ${hot.peakDb.toFixed(2)} dBFS (стеля ${(20 * Math.log10(CEILING)).toFixed(2)})`);
  // баланс L/R: зсунутий сигнал вирівнюється калібруванням
  const pan = async bal => { const c = new OfflineAudioContext(2, fs, fs), g = new Engine(); g.masterCal = { gainDb: 0, balanceDb: bal }; await g.init(c); I.playNote(g, g.bus("melody"), "piano", { midi: 60, dur: 0.8, vel: 0.7, pan: -0.6 }, 0.02); return M.measure(await c.startRendering()).balanceDb; };
  const off = await pan(0), fixed = await pan(off);
  check("Мастер: автоматичне вирівнювання L/R до ±0.5 дБ", Math.abs(off) > 2 && Math.abs(fixed) <= 0.5, `до ${off.toFixed(2)} дБ → після ${fixed.toFixed(2)} дБ`);
  // рівень від даних: лише ±4 дБ і від відносної енергії (наближення камери не робить гучніше)
  const m = window.__mapEcco, lv = m.bars.map((_, b) => 20 * Math.log10(levelFor(m, b)));
  const zoomed = { ...m, bars: m.bars.map(b => ({ ...b, params: { ...b.params, level: 1 } })) };
  // v6 (ТЗ «контраст»): усередині треку гучність керується енергією даних у широкому діапазоні (було ±4 дБ вирівнювання)
  check("Динаміка від даних: діапазон ≥ 6 дБ на рівні мастера (у межах −9…+4 дБ), не залежить від абсолютної яскравості/площі", Math.max(...lv) <= 4.01 && Math.min(...lv) >= -9.01 && Math.max(...lv) - Math.min(...lv) >= 6 && zoomed.bars.every((_, b) => levelFor(zoomed, b) === levelFor(m, b)), `${Math.min(...lv).toFixed(1)}…${Math.max(...lv).toFixed(1)} дБ`);
  check("EQ партій: HPF усім, крім басу; бас — LPF і HPF 32 Гц; виріз 350 Гц у педів і арпеджіо", PART_EQ.bass.lp && PART_EQ.bass.hp <= 35 && PART_EQ.pad.hp >= 150 && PART_EQ.pad.cut[1] < 0 && PART_EQ.arp.cut[1] < 0 && ["melody", "counter", "texture", "stars"].every(p => PART_EQ[p].hp >= 100), "");
  // збережений звіт 5 треків галереї: критерії + актуальність (партитура та сама, що дає композитор зараз)
  const rep = await (await fetch("renders/audio-report.json")).json();
  const cat = (await (await fetch("samples/catalog.json")).json()).filter(i => i.kind === "video");
  const stale = [];
  for (const it of cat) { const row = rep.rows.find(r => r.id === it.id); const tr = await buildTrack(it); if (!row || row.hash !== scoreHash(tr.score)) stale.push(it.id); }
  check("Аудіозвіт галереї актуальний (перерендерено після останніх змін композитора)", !stale.length, stale.length ? `застарів для: ${stale.join(", ")} — запустіть tools/audio-report.html?run` : `${rep.rows.length} треків, ${rep.createdAt.slice(0, 16)}`);
  const lu = rep.rows.map(r => r.lufs);
  check("Аудіозвіт: пік ≤ −1 dBFS; −16 LUFS ± 0.5; < 60 Гц ≤ 25 % (шторми в кульмінації ≤ 40 %); |L−R| ≤ 0.5 дБ; критерії v6 (контраст, різні треки)", rep.ok && !rep.problems.length && Math.max(...lu) - Math.min(...lu) <= CRITERIA.lufsSpread,
    rep.problems.join("; ") || rep.rows.map(r => `${r.id.split("_")[0]}: ${r.lufs.toFixed(1)} LUFS, пік ${r.peakDb.toFixed(1)}, <60 Гц ${(r.bands[0] * 100).toFixed(0)} %`).join(" · "));
  // живий контроль: уривок одного треку зі збереженим мастером — пік під стелею
  const tr = await buildTrack(cat.find(i => i.id === "hurricane_beryl")), row = rep.rows.find(r => r.id === "hurricane_beryl");
  const ex = await renderOffline(tr.score, tr.mapping, { from: tr.mapping.meta.duration * 0.3, seconds: 8, master: { gainDb: row.gainDb, balanceDb: row.calBalanceDb } });
  check("Уривок «урагану» зі збереженим мастером: пік ≤ −1 dBFS", M.measure(ex.buffer).peakDb <= -1, `пік ${M.measure(ex.buffer).peakDb.toFixed(2)} dBFS`);
});

SUITES.push(async function stage15() {
  const { SCENES } = await import("./media/synthetic-scenes.js");
  const { analyzeSource } = await import("./analysis/analyze.js");
  const { serializeAnalysis, deserializeAnalysis } = await import("./analysis/serialize.js");
  const at = (p, sc, x, y) => p.regionMask[Math.floor(y * p.maskH / sc.h) * p.maskW + Math.floor(x * p.maskW / sc.w)];
  const iou = (p, sc) => {
    const { maskW: w, maskH: h, regionMask: m } = p; let inter = 0, uni = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = sc.truth((x + 0.5) * sc.w / w, (y + 0.5) * sc.h / h) ? 1 : 0, r = m[y * w + x];
      if (t && r) inter++; if (t || r) uni++;
    }
    return inter / uni;
  };
  // 1) letterbox + шкала + дата: смуги — фон, шкала й дата — поза областю
  let sc = SCENES["letterbox-date"], a = await analyzeSource(openSynthetic("letterbox-date"), { useCache: false }), p = a.profile;
  const bars = at(p, sc, 320, 10) + at(p, sc, 320, 350) + at(p, sc, 320, 338), dateIn = at(p, sc, 40, 58) + at(p, sc, 100, 58);
  check("Етап 15: letterbox + шкала + дата — смуги, шкала й дата поза областю", iou(p, sc) >= 0.85 && !bars && !dateIn && p.textBoxes?.length > 0,
    `IoU ${iou(p, sc).toFixed(3)}, рамок тексту ${p.textBoxes?.length || 0}, пікселів смуг/дати в області ${bars}/${dateIn}`);
  // 2) карта країни на чорному з наближенням: рух камери знайдено, у цей час подій немає, чорна рамка — не дані
  sc = SCENES["country-zoom"]; a = await analyzeSource(openSynthetic("country-zoom"), { useCache: false }); p = a.profile;
  const [z0, z1] = sc.zoom, segOk = a.camera.segments.some(s => s.time <= z0 + 0.6 && s.endTime >= z1 - 0.6);
  const inZoom = a.events.filter(e => e.time > z0 && e.time <= z1 + 0.3);
  const corners = at(p, sc, 4, 4) + at(p, sc, 476, 4) + at(p, sc, 4, 266) + at(p, sc, 476, 266);
  check("Етап 15: наближення камери знайдено, подій під час руху немає, кути-рамка поза областю",
    p.dynamicBg && segOk && !inZoom.length && !corners && iou(p, sc) >= 0.8,
    `рухомий фон ${p.dynamicBg}, рух камери ${a.camera.segments.map(s => `${s.time.toFixed(1)}–${s.endTime.toFixed(1)} с`).join(", ") || "—"}, подій у русі ${inZoom.length}, IoU ${iou(p, sc).toFixed(3)}`);
  const rt = deserializeAnalysis(JSON.parse(JSON.stringify(serializeAnalysis(a))));
  check("Етап 15: дані про рух камери переживають збереження аналізу", rt.camera?.segments?.length === a.camera.segments.length);
  // 3) білі полярні смуги — лід, тобто дані; камера стоїть
  sc = SCENES["polar-white"]; a = await analyzeSource(openSynthetic("polar-white"), { useCache: false }); p = a.profile;
  check("Етап 15: білі полярні смуги — дані (не фон), руху камери немає", iou(p, sc) >= 0.95 && a.camera.movingShare < 0.05,
    `IoU ${iou(p, sc).toFixed(3)}, частка «руху камери» ${(a.camera.movingShare * 100).toFixed(0)} %`);
});

SUITES.push(async function stageA() {
  // v5-A: єдина граматика звуку + голос даних на першому плані
  const G = await import("./grammar.js");
  const { analyzeSource } = await import("./analysis/analyze.js");
  const { presetFor, mapAnalysis } = await import("./mapping/mapper.js");
  const T = await import("./topics/topics.js");
  const { compose } = await import("./composer/composer.js");
  const { Engine } = await import("./audio/engine.js");
  const I = await import("./audio/instruments.js");
  const { leadOverAccomp } = await import("./audio/report.js");
  const { legendItems } = await import("./a11y/legend.js");
  const topics = await T.loadTopics();
  const rank = arr => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); idx.forEach(([, i], k) => (r[i] = k)); return r; };
  const corr = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy || 1); };

  // 1) монотонність: синтетичне відео, головна величина рівно росте / падає; полярність — moreMeans
  const a = await analyzeSource(openSynthetic("dark-lights")), lf = a.leadFeature, n = a.count;
  const withRel = f => ({ ...a, rel: { ...a.rel, [lf]: Float32Array.from({ length: n }, (_, i) => f(i / (n - 1))) } });
  const night = T.getTopic("nightlights"), preset = await presetFor(a.profile.sceneType, night);
  const rho = (an, topic) => { const m = mapAnalysis(an, preset, { topic }), v = compose(m, { seed: "A" }).notes.filter(x => x.part === "dataVoice"); return { r: corr(rank(v.map(x => x.t)), v.map(x => x.midi)), k: v.length }; };
  const up = rho(withRel(x => x), night), down = rho(withRel(x => 1 - x), night), inv = rho(withRel(x => x), { ...night, moreMeans: "down" });
  check("A: голос даних монотонний — ріст → вище (ρ ≥ 0.9), падіння → нижче; полярність за moreMeans", up.r >= 0.9 && down.r <= -0.9 && inv.r <= -0.9 && up.k > 10 && topics.every(t => ["up", "down"].includes(t.moreMeans)),
    `ріст ρ = ${up.r.toFixed(2)}, падіння ρ = ${down.r.toFixed(2)}, moreMeans: down ρ = ${inv.r.toFixed(2)}; ${up.k} нот`);

  // 2) ліміт уваги: ≤ 3 потоки, солісти — не ближче ніж 3 зони, різні тембри, розведені в панорамі
  const me = window.__mapEcco, s = compose(me, { seed: "ecco" });
  const maxStreams = Math.max(...s.bars.map(b => b.streams));
  const zonesOk = me.bars.every(b => b.params.soloZones.length <= 2 && (b.params.soloZones.length < 2 || Math.abs(b.params.soloZones[0].col - b.params.soloZones[1].col) >= G.SOLO_MIN_GAP));
  const solo = s.notes.filter(x => x.part === "soloists"), s0 = solo.filter(x => x.solo === 0), s1 = solo.filter(x => x.solo === 1);
  const timbres = !s1.length || new Set([s0[0].inst, s1[0].inst]).size === 2;
  check("A: на першому плані ≤ 3 потоки даних; солісти зон ≥ 3 зони один від одного, різні тембри, панорама = зона", maxStreams <= G.FOREGROUND_MAX && maxStreams >= 1 && zonesOk && timbres && solo.every(x => Math.abs(x.pan - (-0.9 + 1.8 * x.zone / 15)) < 1e-6),
    `макс. потоків ${maxStreams}, нот солістів ${solo.length} (${[...new Set(solo.map(x => x.inst))].join(", ") || "—"})`);

  // 3) голос даних гучніший за супровід на ≥ 6 дБ; акорди не перекривають його регістр
  // v6: голос даних — лише на +3…+4 дБ над супроводом (було ≥ 6): підсилення голосу підбирає калібрування (voiceTrim)
  const { voiceTrim } = await import("./audio/master.js");
  const vdb = await voiceTrim(s, me, { seconds: 8 });
  const leadDb = await leadOverAccomp(s, me, { from: me.meta.duration * 0.4, seconds: 8, master: { gainDb: 0, balanceDb: 0, voiceDb: vdb } });
  const floor = [];
  for (const x of s.notes) if (x.part === "dataVoice") { const b = Math.floor(x.t / s.barDur + 1e-6); floor[b] = Math.min(floor[b] ?? 127, x.midi); }
  const over = s.notes.filter(x => (x.part === "pad" || x.part === "arp") && x.midi >= 48 && floor[Math.round(x.t / s.barDur - 0.5 + 1e-3)] !== undefined && x.midi > floor[Math.floor(x.t / s.barDur + 0.02)] - 3).length;
  check("A (v6): голос даних над супроводом на 2…5 дБ (ціль +3.5), супровід не приглушено; педи й арпеджіо нижче за його регістр", leadDb >= 2 && leadDb <= 5 && G.ACCOMP_DB === 0 && G.VOICE_CUT.db >= -3 && over === 0, `різниця ${leadDb.toFixed(1)} дБ (уривок 8 с ECCO2, підсилення голосу ${vdb.toFixed(1)} дБ); нот супроводу в регістрі голосу: ${over}`);

  // 4) точка відліку й тіки шкали часу
  const ref = s.notes.filter(x => x.part === "reference"), dv = s.notes.filter(x => x.part === "dataVoice"), tk = s.notes.filter(x => x.part === "ticks");
  const intro = ref.find(x => x.ref === "intro");
  // v6: референсний тон — лише 1–2 с на початку; дрон-орієнтир і тіки вимкнено за замовчуванням, лишаються як опція
  const so = compose(me, { seed: "ecco", drone: true, ticks: true }), refO = so.notes.filter(x => x.part === "reference"), tkO = so.notes.filter(x => x.part === "ticks");
  const tickOk = tkO.length === Math.ceil(so.duration / 10) - 1 && tkO.every((x, k) => Math.abs(x.t - (k + 1) * 10) < 1e-6 && x.strong === ((k + 1) % 4 === 0));
  check("A (v6): референсний тон 1–2 с лише на початку (голос даних — після нього); дрон і тіки вимкнено за замовчуванням; з опцією — дрон у кожному такті, тіки кожні 10 с",
    intro && intro.t === 0 && intro.dur >= 1 && intro.dur <= 2 && dv[0].t >= intro.dur && ref.length === 1 && tk.length === 0
      && new Set(refO.map(x => x.midi)).size === 1 && refO.filter(x => x.ref === "drone").length === me.bars.length && tickOk
      && ["reference", "dataVoice"].every(id => s.parts.some(q => q.id === id)) && so.parts.some(q => q.id === "ticks") && s.parts[0].id === "dataVoice",
    `референс ${intro?.dur} с, MIDI ${intro?.midi}; голос даних із ${dv[0].t.toFixed(2)} с; за замовчуванням: нот дрона ${ref.length - 1}, тіків ${tk.length}; з опцією: ${refO.length - 1} і ${tkO.length}`);

  // 5) ерікони: ≤ 100 мс від події, одна подія — один знак, кожен знак є в легенді
  const pol = me.meta.polarity, evs = me.bars.flatMap(b => b.events).filter(e => G.eventClass(e, pol)), ec = s.notes.filter(x => x.part === "earcons");
  const late = evs.filter(e => ec.filter(x => Math.abs(x.t - e.time) <= 0.1 && x.earcon === G.earconFor(me.meta.topic, e, pol).id).length < 1).length;
  const missing = [];
  for (const t of topics) {
    const ids = G.earconsFor(t.id), items = legendItems("heatmap", { topic: t });
    if (ids.length < 2 || ids.length > 4 || new Set(ids.map(x => x.id)).size !== ids.length) missing.push(`${t.id}: ${ids.length} знаків`);
    for (const e of ids) if (!items.some(it => it.earcon === e.id && it.text.includes(e.label))) missing.push(`${t.id}/${e.id}`);
  }
  const octx = new OfflineAudioContext(2, 44100 * 2, 44100), oe = new Engine(); await oe.init(octx);
  I.playNote(oe, oe.bus("earcons"), "earcon", { midi: 0, dur: 0.2, vel: 0.9, pan: 0, ec: G.earconsFor("storms")[0].spec }, 0.5);
  const ob = (await octx.startRendering()).getChannelData(0);
  let onset = -1, pk = 0; for (const v of ob) pk = Math.max(pk, Math.abs(v));
  for (let i = 0; i < ob.length; i++) if (Math.abs(ob[i]) > pk * 0.1) { onset = i / 44100 - 0.5; break; }
  check("A: ерікон ≤ 100 мс від події, одна подія — один знак, 2–4 знаки на тему, кожен є в легенді", ec.length === evs.length && late === 0 && !missing.length && onset >= 0 && onset <= 0.1 && pk > 0.01,
    missing.join("; ") || `подій ${evs.length}, еріконів ${ec.length}, запізнілих ${late}; звук через ${(onset * 1000).toFixed(0)} мс`);

  // 6) ducking під мовленням ≥ 10 дБ
  const dctx = new OfflineAudioContext(2, 44100 * 3, 44100), de = new Engine(); await de.init(dctx);
  I.playNote(de, de.bus("reference"), "reftone", { midi: 69, dur: 2.9, vel: 0.9, pan: 0 }, 0.01);
  de.duck(true, 1.5);
  const db = (await dctx.startRendering()).getChannelData(0), rms = (t0, t1) => { let q = 0; for (let i = Math.floor(t0 * 44100); i < t1 * 44100; i++) q += db[i] * db[i]; return Math.sqrt(q / ((t1 - t0) * 44100)); };
  const duckDb = 20 * Math.log10(rms(0.5, 1.4) / rms(2.1, 2.8));
  check("A: під час мовлення музика приглушується на ≥ 10 дБ (ducking)", duckDb >= 10, `−${duckDb.toFixed(1)} дБ`);

  // 7) граматика в UI й README
  const readme = await (await fetch("README.md")).text(), html = await (await fetch("index.html")).text();
  check("A: таблиця граматики (8 правил) — у src/grammar.js, UI й README", G.GRAMMAR.length === 8 && /## Граматика звуку/.test(readme) && /більше → вище/.test(readme) && /id="grammar-rows"/.test(html), `${G.GRAMMAR.length} правил`);
});

SUITES.push(async function stage16() {
  // етап 16: бюджет партій, голос даних = мелодія за сольфеджіо, ударні як перкусія, артикуляція з даних
  const G = await import("./grammar.js");
  const { buildTrack } = await import("./audio/report.js");
  const { bpmCapFor } = await import("./mapping/mapper.js");
  const { compose } = await import("./composer/composer.js");
  const { chordPcs } = await import("./composer/parts/common.js");
  const { drumLevel } = await import("./composer/parts/drums.js");
  const T = await import("./topics/topics.js");
  const cat = (await (await fetch("samples/catalog.json")).json()).filter(i => i.kind === "video" && i.analysis);
  const barOf = (s, n) => Math.min(s.bars.length - 1, Math.floor((n.t + (n.fixed ? 1e-6 : 0.03)) / s.barDur));
  const stat = [];
  for (const it of cat) {
    const { mapping: m, score: s, analysis: a } = await buildTrack(it);
    const per = s.bars.map(() => new Set());
    for (const n of s.notes) per[barOf(s, n)].add(n.part);
    const sust = per.map(x => [...x].filter(id => !G.SIGNAL_PARTS.includes(id)).length);
    stat.push({ id: it.id.split("_")[0], item: it, m, s, a, per, sust, max: Math.max(...per.map(x => x.size)),
      intro: Math.max(...sust.filter((_, b) => m.bars[b].section === "intro")) });
  }

  // 1) перевантаження
  check("16 (v6: бюджет 7): одночасно ≤ 7 партій на всіх треках галереї; у вступі ≤ 2 (+ короткі знаки: референсний тон, ерікон)",
    stat.length >= 4 && stat.every(x => x.max <= G.PARTS_MAX && x.intro <= G.INTRO_PARTS_MAX && x.s.bars.every(b => b.count <= G.PARTS_MAX)),
    stat.map(x => `${x.id}: макс. ${x.max}, вступ ${x.intro}`).join(" · "));
  check("16: голос даних і melody не звучать одночасно; події позначає тільки ерікон (accents мовчать)",
    stat.every(x => !x.per.some(p => p.has("dataVoice") && p.has("melody")) && !x.s.notes.some(n => n.part === "accents" || n.part === "melody")) && stat.some(x => x.s.notes.some(n => n.part === "earcons")),
    `еріконів: ${stat.map(x => x.s.notes.filter(n => n.part === "earcons").length).join(", ")}`);
  // v6 (ТЗ «дзинь-дзелень»): вогники — головна текстура nightlights (було: рідка фонова); кількість нот за такт = кількість вогнів
  const starBars = stat.map(x => x.per.filter(p => p.has("stars")));
  const { starsPerBar, spearman } = await import("./audio/report.js");
  const nl = stat.find(x => x.m.meta.topic === "nightlights"), sp = nl && starsPerBar(nl.s, nl.m), sRho = nl ? spearman(sp.counts, sp.lights) : 0;
  const lpAbs = nl ? nl.m.bars.map(b => b.frames.reduce((q, i) => q + nl.a.abs[nl.m.meta.lightsFeature][i], 0) / b.frames.length) : [], sRhoAbs = nl ? spearman(sp.counts, lpAbs) : 0;
  const darkOk = !nl || nl.m.bars.every((b, i) => !b.params.dark || sp.counts[i] === 0);
  const starN = nl ? nl.s.notes.filter(n => n.part === "stars" && !n.chord && !n.spark) : [];
  check("v6: вогники — лише в nightlights; нот за такт ↔ кількість вогнів (lightPoints; якщо вона насичена — lightLog) ρ ≥ 0.8; темрява — тиша; панорама ноти = позиція вогню; короткі дзвінкі тембри",
    stat.every((x, i) => !starBars[i].length || x.m.meta.topic === "nightlights") && nl && sRho >= 0.8 && sRhoAbs >= 0.8 && darkOk && Math.max(...sp.counts) >= 2 * Math.max(1, Math.min(...sp.counts.filter(c => c > 0)))
      && starN.every(n => Math.abs(n.pan - (-0.85 + 1.7 * n.col / 15)) < 1e-6 && n.dur <= 0.3 && n.midi >= 76 && ["xylophone", "celesta", "glockenspiel"].includes(n.inst)),
    nl ? `ρ = ${sRho.toFixed(2)} (з абсолютною кількістю вогнів ${sRhoAbs.toFixed(2)}); нот за такт ${Math.min(...sp.counts)}…${Math.max(...sp.counts)}; усього ${starN.length}` : "немає треку nightlights");
  const ctrSec = new Set(stat.flatMap(x => x.s.notes.filter(n => n.part === "counter").map(n => x.m.bars[barOf(x.s, n)].section)));
  const soloOk = stat.every(x => { const ci = new Set(x.s.notes.filter(n => n.part === "counter").map(n => n.inst)); return x.s.notes.filter(n => n.part === "soloists").every(n => !ci.has(n.inst)); });
  check("16: контрмелодія — лише в наростанні й кульмінації; солісти зон — інший тембр", [...ctrSec].every(x => x === "build" || x === "climax") && soloOk,
    `розділи контрмелодії: ${[...ctrSec].join(", ") || "не звучить"}; тембри солістів: ${[...new Set(stat.flatMap(x => x.s.notes.filter(n => n.part === "soloists").map(n => n.inst)))].join(", ") || "—"}`);

  // 2) мелодія за сольфеджіо (голос даних)
  let total = 0, notDia = 0, strongBad = 0, leapBad = 0, leaps = 0, steps = 0, moves = 0, half = 0, full = 0, cadBad = 0, finalBad = 0;
  for (const x of stat) {
    const v = x.s.notes.filter(n => n.part === "dataVoice"), H = x.s.harmony.bars;
    v.forEach((n, i) => {
      const bi = barOf(x.s, n), h = H[bi], triad = chordPcs(h, { max: 3 }), pc = n.midi % 12, inTriad = triad.includes(pc);
      total++;
      if (!h.mode.steps.includes((((n.midi - h.root) % 12) + 12) % 12) && !inTriad) notDia++;
      if ((n.strong || n.cadence) && !inTriad) strongBad++;
      if (n.cadence === "half") { half++; if (h.chords[0].chord.degree !== 4) cadBad++; }
      if (n.cadence === "full") { full++; if (h.chords[0].chord.degree !== 0 || (bi > 0 && H[bi - 1].chords[0].chord.degree !== 4 && !x.m.bars[bi - 1].transition && x.m.bars[bi - 1].section !== "intro")) cadBad++; }
      if (!i) return;
      const d = n.midi - v[i - 1].midi, nx = v[i + 1];
      moves++;
      if (Math.abs(d) <= 2) steps++;
      if (Math.abs(d) > 5) {
        leaps++;
        if (!inTriad) leapBad++;
        else if (nx && !n.cadence && !nx.strong && !nx.cadence && !(Math.sign(nx.midi - n.midi) === -Math.sign(d) && Math.abs(nx.midi - n.midi) <= 2)) leapBad++;
      }
    });
    const lastN = v[v.length - 1], hl = H[H.length - 1];
    if (!lastN || lastN.cadence !== "final" || !lastN.fade || lastN.midi % 12 !== ((hl.root % 12) + 12) % 12 || hl.chords[0].chord.degree !== 0) finalBad++;
  }
  check("16: мелодія — діатоніка ладу; сильні долі й каденції — звуки акорду", total > 100 && notDia === 0 && strongBad === 0, `${total} нот; поза ладом ${notDia}; сильних долей не на звуці акорду ${strongBad}`);
  check("16: переважно поступовий рух; стрибок понад кварту — лише на звук акорду й з поверненням кроком назад", steps / moves >= 0.5 && leapBad === 0 && leaps / moves <= 0.15,
    `кроків (≤ секунда) ${(100 * steps / moves).toFixed(0)} %, стрибків понад кварту ${leaps} з ${moves}, порушень ${leapBad}`);
  check("16: фрази 4 + 4 — напівкаденція (V) і повна (V → I); остання нота кожного треку — тоніка з загасанням", half > 0 && full > 0 && cadBad === 0 && finalBad === 0,
    `напівкаденцій ${half}, повних ${full}, порушень ${cadBad}; треків без тоніки в кінці ${finalBad}`);

  // 3) ударні — перкусія: без постійних шістнадцятих, у спокої тиша, на події брейк
  let odd = 0, calmHits = 0, afterEvent = 0, drumBars = 0, quietBars = 0;
  for (const x of stat) {
    const meter = x.s.meter, step = x.s.barDur / meter.steps, r = T.getTopic(x.item.topic).soundProfile.rhythm;
    for (const n of x.s.notes) {
      if (n.part !== "drums" || n.fixed) continue;
      const bi = barOf(x.s, n), bar = x.m.bars[bi], rel = (n.t - bar.t0) / step;
      if (Math.round(rel) % 2 !== 0) odd++;
      if (!n.build && drumLevel(bar.params, r) === 0 && bar.section !== "climax") calmHits++;      // v6: у кульмінації — повний склад
      if (bar.events.length && rel > Math.min(...bar.events.map(e => e.offset)) * meter.steps + 0.5) afterEvent++;
    }
    x.per.forEach(p => (p.has("drums") ? drumBars++ : quietBars++));
  }
  check("16: ударні — без постійних шістнадцятих; спокійні дані — тиша (крім кульмінації — повний склад); у такті з подією — брейк", odd === 0 && calmHits === 0 && afterEvent === 0 && drumBars > 0 && quietBars > 0,
    `ударів на шістнадцятих ${odd}, у спокої ${calmHits}, після події в такті ${afterEvent}; тактів з ударними ${drumBars}, без них ${quietBars}`);

  // 4) артикуляція з даних (таблиця команди) — на треку галереї з підставленими параметрами
  const m0 = stat[0].m, withP = o => ({ ...m0, bars: m0.bars.map(b => ({ ...b, params: { ...b.params, ...o } })) });
  const dv = o => compose(withP(o), { seed: "art" }).notes.filter(n => n.part === "dataVoice");
  const gapsOf = v => v.slice(0, -1).map((n, i) => n.dur / (v[i + 1].t - n.t)).filter((_, i) => !v[i].cadence);
  const med = a => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];
  const stac = dv({ staccato: 1 }), leg = dv({ staccato: 0, articulation: 0.1 });
  const slope = v => { let up = 0, dn = 0; const by = {}; v.forEach(n => { if (!n.accent && !n.cadence) (by[Math.floor(n.t / m0.meta.barDur + 1e-6)] ||= []).push(n.vel); }); for (const a of Object.values(by)) if (a.length > 1) (a[a.length - 1] > a[0] ? up++ : a[a.length - 1] < a[0] ? dn++ : 0); return { up, dn }; };
  const cr = slope(dv({ dynamics: 1 })), dim = slope(dv({ dynamics: 0 }));
  const accN = stat.flatMap(x => x.s.notes.filter(n => n.part === "dataVoice" && n.accent)).length, evN = stat.reduce((q, x) => q + x.m.bars.filter(b => b.events.length).length, 0);
  const capT = G.partsCap({ section: "build", params: { orchestration: 0.6, tutti: 0.9 } }), capS = G.partsCap({ section: "build", params: { orchestration: 0.6, tutti: 0.05 } });
  check("16: артикуляція з даних — стакато ↔ легато, крещендо / димінуендо ← тренд, акцент ← подія, тутті / соло ← частка зон",
    stac.every(n => !n.legato) && med(gapsOf(stac)) < 0.6 && med(gapsOf(leg)) > 0.9 && cr.up > 0 && cr.dn === 0 && dim.dn > 0 && dim.up === 0 && (accN > 0 || evN === 0) && capT > capS
      && stat.every(x => x.m.bars.every(b => b.params.dynamics >= 0 && b.params.dynamics <= 1 && b.params.tutti >= 0 && b.params.tutti <= 1)),
    `стакато: тривалість ${(100 * med(gapsOf(stac))).toFixed(0)} % кроку, легато ${(100 * med(gapsOf(leg))).toFixed(0)} %; крещендо в ${cr.up} тактах, димінуендо в ${dim.dn}; акцентованих нот ${accN} (тактів з подіями ${evN}); тутті ${capT} партій, соло ${capS}`);

  // 5) темп, настрій, крапка
  const darkBad = stat.filter(x => { const tm = T.getTopic(x.item.topic).soundProfile.modes || []; return tm.some(id => id !== "aeolian" && id !== "phrygian") && x.s.harmony.bars.some(h => h.level !== "tense" && ["aeolian", "phrygian"].includes(h.mode.id)); }).length;
  const endOk = stat.every(x => { const r0 = x.m.bars.findIndex(b => b.section === "resolution"); return x.sust[x.sust.length - 1] <= G.INTRO_PARTS_MAX && (r0 < 0 || x.sust[x.sust.length - 1] <= x.sust[r0]); });
  check("16: BPM ≤ 130 (шторм — ≤ 160) і один на трек; темні лади — лише на аномаліях (висока напруга); розв'язка знімає шари (у кінці ≤ 2 партії)",
    stat.every(x => x.s.bpm <= bpmCapFor(T.getTopic(x.item.topic))) && darkBad === 0 && endOk,
    stat.map(x => `${x.id}: ${x.s.bpm} BPM, лади ${[...new Set(x.s.harmony.bars.map(h => h.mode.label))].join("/")}, у кінці ${x.sust[x.sust.length - 1]}`).join(" · "));
});

SUITES.push(async function heat_loudness() {
  // safe-8: у темах тепла (ocean-currents, temperature) гучність — від частки тепла й площі, не від швидкості змін
  const R = await import("./audio/report.js");
  const { presetFor } = await import("./mapping/mapper.js");
  const T = await import("./topics/topics.js");
  await T.loadTopics();
  const temporal = new Set(["d1", "speed10", "accel20", "trend40"]);
  const bad = [];
  for (const id of R.HEAT_TOPICS) {
    const p = await presetFor("heatmap", T.getTopic(id));
    if (p.params.energy.sources.some(s => temporal.has(s.channel)) || p.params.level.sources.some(s => temporal.has(s.channel))) bad.push(`${id}: швидкість у гучності`);
    if (!p.params.density.sources.some(s => s.channel === "speed10")) bad.push(`${id}: швидкість не в густоті`);
    if (p.climax?.feature !== "hotShare") bad.push(`${id}: кульмінація не за часткою тепла`);
  }
  check("Теми тепла: гучність/енергія без швидкості змін (speed10 — лише густота ритму); кульмінація за часткою тепла", !bad.length, bad.join("; ") || R.HEAT_TOPICS.join(", "));
  const cat = (await (await fetch("samples/catalog.json")).json()).filter(i => i.kind === "video" && i.analysis);
  const ecco = await R.buildTrack(cat.find(i => i.id === "ecco2_sst_flow"));
  const heat = ecco.mapping.bars.map(b => b.frames.reduce((s, i) => s + ecco.analysis.rel.hotShare[i], 0) / b.frames.length);
  const cl = ecco.mapping.meta.sections.find(s => s.id === "climax");
  const mean = (b0, b1) => heat.slice(b0, b1).reduce((p, q) => p + q, 0) / (b1 - b0), len = cl.b1 - cl.b0;
  let best = -1;
  const intro = ecco.mapping.meta.sections.find(s => s.id === "intro").b1, res = ecco.mapping.meta.sections.find(s => s.id === "resolution").b0;
  for (let s = intro; s + len <= res; s++) best = Math.max(best, mean(s, s + len));
  check("ECCO2: кульмінація — у вікні з найбільшою часткою тепла (з точністю до фрази)", mean(cl.b0, cl.b1) >= best - 0.05, `кульмінація ${cl.b0}–${cl.b1}: тепло ${mean(cl.b0, cl.b1).toFixed(2)}, максимум вікна ${best.toFixed(2)}`);
  const rep = await (await fetch("renders/audio-report.json")).json(), row = rep.rows.find(r => r.id === "ecco2_sst_flow");
  check("ECCO2: гучність (3 с) ↔ частка тепла ρ ≥ 0.6; на охолодженні гучність не зростає", row?.heatRho >= R.CRITERIA.heatRho && row?.coolRiseDb !== null && row.coolRiseDb <= R.CRITERIA.coolRiseDb,
    row ? `ρ = ${row.heatRho?.toFixed(2)}, охолодження: ${row.coolRiseDb?.toFixed(1)} дБ` : "немає рядка в audio-report.json");
  // інші треки галереї не змінилися (хеші партитур — як у safe-7)
  const SAFE7 = { night_lights_rotating: "uocih4mas8", hurricane_beryl: "2fek06b0l51", co2_oco2_year: "8wccjvbzuf", sea_ice_2022: "zjcci3vwx9" };
  const changed = [];
  for (const [id, h] of Object.entries(SAFE7)) { const t = await R.buildTrack(cat.find(i => i.id === id)); if (R.scoreHash(t.score) !== h) changed.push(id); }
  check("Інші 4 треки галереї не змінилися (партитури = safe-7)", !changed.length, changed.join(", ") || Object.keys(SAFE7).join(", "));
});

SUITES.push(async function stage_v6() {
  // v6 «музика й контраст»: справжній інструмент і мотив теми, різні треки, контраст розділів, варіації мотиву
  const G = await import("./grammar.js");
  const R = await import("./audio/report.js");
  const { SAMPLE_SETS } = await import("./audio/samples.js");
  const { drumLevel } = await import("./composer/parts/drums.js");
  const { LEVEL_DB } = await import("./audio/engine.js");
  const T = await import("./topics/topics.js");
  const cat = (await (await fetch("samples/catalog.json")).json()).filter(i => i.kind === "video" && i.analysis);
  const rep = await (await fetch("renders/audio-report.json")).json();
  const tr = [];
  for (const it of cat) tr.push({ id: it.id.split("_")[0], full: it.id, ...(await R.buildTrack(it)) });
  const barOf = (s, n) => Math.min(s.bars.length - 1, Math.floor((n.t + 1e-6) / s.barDur));
  const row = x => rep.rows.find(r => r.id === x.full) || {};

  // 1) голос даних — семплований інструмент теми, без гліссандо й без осциляторного «голосу»
  const voiceOk = tr.every(x => { const vo = G.voiceOf(x.mapping.meta.topic), dv = x.score.notes.filter(n => n.part === "dataVoice");
    return dv.length > 10 && SAMPLE_SETS[vo.inst] && dv.every(n => n.inst === vo.inst && n.from === undefined && n.midi >= vo.range[0] - 2 && n.midi <= vo.range[1] + 2) && x.score.instruments.includes(vo.inst); });
  check("v6: голос даних грає справжнім (семплованим) інструментом теми у своєму регістрі; гліссандо немає", voiceOk && !tr.some(x => x.score.notes.some(n => n.inst === "voice")),
    tr.map(x => `${x.id}: ${x.score.voice.instrument}`).join(" · "));

  // 2) мотив теми: 4–8 нот, транспозиція за даними, не однаково більше 2 разів поспіль
  let motifBad = 0, repBad = 0, rhoMin = 1;
  for (const x of tr) {
    const mo = G.motifFor(x.mapping.meta.topic, x.score.meter), dv = x.score.notes.filter(n => n.part === "dataVoice");
    if (mo.notes.length < 4 || mo.notes.length > 8 || mo.steps !== x.score.meter.steps || dv.some(n => n.motif !== mo.id)) motifBad++;
    const by = x.score.bars.map(() => []);
    for (const n of dv) by[barOf(x.score, n)].push(n);
    const sig = by.map(v => (v.length ? v[0].sig : null));
    for (let b = 2; b < sig.length; b++) if (sig[b] && sig[b] === sig[b - 1] && sig[b] === sig[b - 2]) repBad++;
    const bi = by.map((v, b) => b).filter(b => by[b].length);
    rhoMin = Math.min(rhoMin, R.spearman(bi.map(b => x.mapping.bars[b].params.value), bi.map(b => by[b].reduce((q, n) => q + n.midi, 0) / by[b].length)));
  }
  check("v6: мелодія — мотив теми (4–8 нот), транспонується за даними (ρ значення ↔ висота такту ≥ 0.8); однаково — не більше 2 разів поспіль", motifBad === 0 && repBad === 0 && rhoMin >= 0.8,
    `мотиви: ${tr.map(x => x.score.voice.motif).join(", ")}; три однакові такти поспіль: ${repBad}; мін. ρ = ${rhoMin.toFixed(2)}`);

  // 3) треки галереї звучать по-різному
  const sh = tr.map(x => ({ id: x.id, ...R.trackShape(x.score, x.mapping), drums: T.getTopic(x.item.topic).soundProfile.rhythm, centroid: row(x).centroid, nd: row(x).noteDensity }));
  const same = [], close = [];
  for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) {
    const p = sh[i], q = sh[j], rel = (u, v) => Math.abs(u - v) / Math.max(u, v, 1e-9);
    if (p.voice === q.voice && p.motif === q.motif && Math.abs(p.bpm - q.bpm) <= 5) same.push(`${p.id}=${q.id}`);
    if (!(rel(p.centroid, q.centroid) >= R.CRITERIA.centroidGap) || !(rel(p.nd, q.nd) >= R.CRITERIA.densityGap)) close.push(`${p.id}≈${q.id}`);
  }
  check("v6: жодні два треки галереї не мають однакових (інструмент голосу + мотив + темп ±5 BPM); у кожної теми свій голос і мотив; спектральний центр і густота нот різні",
    tr.length >= 5 && !same.length && !close.length && new Set(sh.map(x => x.voice)).size === sh.length && new Set(sh.map(x => x.motif)).size === sh.length,
    sh.map(x => `${x.id}: ${x.voice}, «${x.motif}», ${x.bpm} BPM, ${x.meter}, ${x.key}, ударні ${x.drums}, центр ${Math.round(x.centroid)} Гц, ${x.nd?.toFixed(1)} нот/с`).join(" · ") + (same.length || close.length ? ` — збіги: ${[...same, ...close].join(", ")}` : ""));

  // 4) розділи відрізняються: кульмінація — повний склад, найгучніше, найвищий регістр
  const secBad = tr.filter(x => { const s = R.trackShape(x.score, x.mapping), r = row(x); return !(s.partsClimax - s.partsIntro >= 3) || !(r.climaxLufs - r.introLufs >= 6); });
  const dbl = tr.every(x => x.score.notes.some(n => n.part === "dataVoice" && n.layers && x.mapping.bars[barOf(x.score, n)].section === "climax"));
  check("v6: кульмінація ≥ вступ + 6 дБ і + 3 партії; у кульмінації голос подвоєно (другий інструмент / октава)", !secBad.length && dbl,
    tr.map(x => { const s = R.trackShape(x.score, x.mapping), r = row(x); return `${x.id}: партій ${s.partsIntro?.toFixed(1)} → ${s.partsClimax?.toFixed(1)}, гучність +${(r.climaxLufs - r.introLufs).toFixed(1)} дБ`; }).join(" · "));

  // 5) контраст на слух: звіт — ρ(енергія, гучність 3 с) ≥ 0.7, LRA ≥ 8 LU, пік ≤ −1 dBFS, −16 LUFS ± 0.5
  const cBad = rep.rows.filter(r => !(r.rho >= 0.7) || !(r.lra >= 8) || !(r.peakDb <= -1) || !(Math.abs(r.lufs + 16) <= 0.5));
  check("v6: кореляція енергії даних із короткочасною гучністю (3 с, після вступу) ρ ≥ 0.7; LRA ≥ 8 LU; пік ≤ −1 dBFS; −16 LUFS ± 0.5 — для кожного треку", rep.rows.length >= 5 && !cBad.length && LEVEL_DB[1] - LEVEL_DB[0] >= 8,
    rep.rows.map(r => `${r.id.split("_")[0]}: ρ ${r.rho?.toFixed(2)}, LRA ${r.lra?.toFixed(1)}, ${r.lufs.toFixed(1)} LUFS, пік ${r.peakDb.toFixed(1)}`).join(" · "));

  // 6) ударні від даних: тиша → щітки → половинний → звичайний → подвійний; шторм — більше шарів на піках
  const lv = [0.1, 0.36, 0.5, 0.65, 0.9].map(d => drumLevel({ drive: d, density: d }, "storm"));
  const st = tr.find(x => x.mapping.meta.topic === "storms"), kinds = {};
  if (st) for (const n of st.score.notes) if (n.part === "drums") { const l = drumLevel(st.mapping.bars[barOf(st.score, n)].params, "storm"); (kinds[l] ||= new Set()).add(n.inst); }
  const kn = Object.keys(kinds).map(Number).sort(), layersUp = kn.length >= 2 && kinds[kn[kn.length - 1]].size > kinds[kn[0]].size;
  check("v6: ударні — 5 рівнів від даних (тиша, щітки, половинний, звичайний, подвійний розмір); шторм: сильніший шторм — більше шарів ударних і брасу", lv.join() === "0,1,2,3,4" && drumLevel({ drive: 1, density: 1 }, "sparse") === 1 && st && layersUp,
    `рівні ${lv.join(" → ")}; шторм: ${kn.map(l => `рівень ${l} — ${kinds[l].size} тембрів`).join(", ")}`);

  // 7) океан: тепле → світліший лад; пресет теми не обертає світлість
  const oc = tr.find(x => x.mapping.meta.topic === "ocean-currents");
  const br = oc ? R.spearman(oc.mapping.bars.map(b => b.params.brightness), oc.mapping.bars.map(b => b.frames.reduce((q, i) => q + oc.analysis.rel.hotShare[i], 0) / b.frames.length)) : 0;
  check("v6: океанічні течії — більше теплої води → світліший лад (мажор), холодна → мінор, низькі струнні й low-pass", oc && br >= 0.6 && G.voiceOf("ocean-currents").cold && G.voiceOf("ocean-currents").warm,
    `ρ(частка теплої води, світлість ладу) = ${br.toFixed(2)}; лади: ${oc ? [...new Set(oc.score.harmony.bars.map(h => h.mode.label))].join(" / ") : "—"}`);
});

for (const f of FINAL_SUITES) SUITES.push(Object.defineProperty(() => f(check), "name", { value: f.name }));
for (const f of UI_SUITES) SUITES.push(Object.defineProperty(() => f(check), "name", { value: f.name }));

// ?only=golden,motion — лише названі набори (для швидких ітерацій; перед комітом — повний прогін)
const ONLY = new URLSearchParams(location.search).get("only")?.split(",");

(async () => {
  for (const s of SUITES) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    try { await s(); }
    catch (e) { console.error(e); report(`${s.name}: виняток`, false, e.message); }
  }
  check("Консоль без помилок", errors.length === 0, errors.join(" | ") || "помилок немає");
  const failed = results.filter(r => !r.ok).length;
  document.getElementById("summary").textContent = failed ? `Не пройдено: ${failed} з ${results.length}` : `Усі ${results.length} перевірок пройдено ✔`;
  window.__testResults = results;
})();
