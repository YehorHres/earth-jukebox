// Автотести двигуна (розділ 8 ТЗ). Відкрити test.html через локальний сервер.
// Кожен етап додає свої перевірки до списку SUITES.
import { openVideo, openImage, openSynthetic } from "./media/sources.js";
import { passA } from "./analysis/pass-a.js";

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
  check("Звук (темне відео): тихіший за ECCO2, але не тиша", rd.rms > 0.002 && rd.rms < r.rms, `RMS ${rd.rms.toFixed(3)} (ECCO2 ${r.rms.toFixed(3)}), пік ${rd.peak.toFixed(3)}`);
  window.__score = s1;
});

SUITES.push(async function stage5() {
  const { compose } = await import("./composer/composer.js");
  const me = window.__mapEcco, md = window.__mapDark;
  const s = compose(me, { seed: "ecco" });
  const mel = s.notes.filter(n => n.part === "melody" && !n.motif);
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
  check("Контрмелодія вступає з наростанням / кульмінацією", counterBars.size > 0 && !counterBars.has("intro"), [...counterBars].join(", ") || "не звучить");
  const acc = s.notes.filter(n => n.part === "accents");
  const evBars = me.bars.filter(b => b.events.length).length;
  check("Акценти: є на подіях, дзвони на кульмінації даних", acc.length > 0 && (acc.some(n => n.inst === "bells") || !me.bars.some(b => b.events.some(e => e.type === "globalMax"))), `${acc.length} нот акцентів у ${evBars} тактах з подіями; інструменти: ${[...new Set(acc.map(n => n.inst))].join(", ")}`);
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

(async () => {
  for (const s of SUITES) {
    try { await s(); }
    catch (e) { console.error(e); report(`${s.name}: виняток`, false, e.message); }
  }
  check("Консоль без помилок", errors.length === 0, errors.join(" | ") || "помилок немає");
  const failed = results.filter(r => !r.ok).length;
  document.getElementById("summary").textContent = failed ? `Не пройдено: ${failed} з ${results.length}` : `Усі ${results.length} перевірок пройдено ✔`;
  window.__testResults = results;
})();
