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
