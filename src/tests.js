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
  const { loadPreset, mapAnalysis, PARAMS } = await import("./mapping/mapper.js");
  const run = async (src, preset) => { const a = await analyzeSource(src); return { a, m: mapAnalysis(a, await loadPreset(preset)) }; };
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
  const me = mapAnalysis(ae, await loadPreset("heatmap"));
  const acc = me.bars.filter(b => b.params.accent > 0).length;
  check("ECCO2: мапінг, акценти подій (не в кожному такті), суша = паузи в контурі", inRange(me) && acc > 0 && acc <= me.bars.length * 0.6 && me.bars.some(b => b.params.contour.includes(null)),
    `${me.meta.nBars} тактів, ${me.meta.bpm} BPM, тактів з акцентами ${acc}; ${order(me)}; контур такту 5: ${me.bars[5].params.contour.map(v => v === null ? "·" : Math.round(v * 9)).join("")}`);
  window.__mapEcco = me; window.__mapDark = md;
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
