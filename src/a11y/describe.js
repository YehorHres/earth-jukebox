// Текстові описи для картки «Що двигун зрозумів про відео» і для скрінрідера.
import { getFeature } from "../features/index.js";

export const SCENE_LABEL = {
  heatmap: "Теплова карта (кольорова шкала синій → червоний)",
  nightlights: "Нічна карта вогнів (темний кадр, яскраві точки)",
  truecolor: "Супутниковий знімок у справжніх кольорах",
  chart: "Графік або діаграма",
  mixed: "Змішана візуалізація",
};

export const SCALE_LABEL = {
  none: "змін не виявлено (менші за шум)",
  tiny: "зміни ледь помітні",
  small: "зміни малі",
  moderate: "зміни помірні",
  large: "зміни великі",
};

export const fmtTime = s => {
  const m = Math.floor(s / 60), ss = Math.round(s - m * 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};
const pct = x => `${Math.round(x * 100)} %`;

/**
 * Список речень картки. analysis (прохід B) — необов'язковий: додає кульмінацію, події, підсилення.
 */
export function describeProfile(p, source, analysis = null) {
  const lines = [];
  const conf = p.confidence >= 0.7 ? "" : p.confidence >= 0.4 ? " (впевненість середня)" : " (впевненість низька)";
  lines.push(`${SCENE_LABEL[p.sceneType]}${conf}.`);
  if (p.isStill) lines.push("Одне зображення: музика сканує кадр зліва направо, часових змін немає.");
  else {
    const frames = analysis ? `${analysis.count} кадрів аналізу (${analysis.rate.toFixed(analysis.rate % 1 ? 1 : 0)} за секунду), ` : "";
    lines.push(`${frames}${p.durationSec.toFixed(1)} с, ${Math.round(p.fps)} кадрів/с у відео.`);
  }
  if (!p.isStill) {
    const what = p.sceneType === "heatmap" ? "значення за кольоровою шкалою" : "яскравість";
    let s;
    if (p.changeScale === "none")
      s = `${capital(SCALE_LABEL.none)}: жодна зона кадру не змінюється сильніше за шум відео. Музика буде спокійною, без вигаданих подій.`;
    else
      s = `${capital(SCALE_LABEL[p.changeScale])}: у найактивнішій зоні ${what} змінюється до ${(p.changeAmp * 100).toFixed(1)} % шкали; ` +
        `це в ${p.changeRatio.toFixed(0)}× більше за шум, тобто зміни справжні. Змінюється ${pct(p.changeArea)} зон кадру.`;
    lines.push(s);
    const lf = analysis?.leadFeature, g = lf && analysis.norm[lf];
    if (g && g.gain > 1.5)
      lines.push(`Головна ознака для музики — «${analysis.labels[lf]}». Вона змінюється мало (±${(g.spread * 50).toFixed(1)} % шкали), ` +
        `тому для руху в музиці зміни підсилено ×${g.gain.toFixed(g.gain < 10 ? 1 : 0)}${g.scale === "log" ? " (лог-шкала)" : ""}. Настрій музики лишається за абсолютним значенням.`);
    else if (g) lines.push(`Головна ознака для музики — «${analysis.labels[lf]}» (розмах ±${(g.spread * 50).toFixed(1)} % шкали, без підсилення).`);
    if (analysis?.hotspots?.length) lines.push(`Найактивніші зони — «солісти» оркестру: ${analysis.hotspots.map(h => h.label).join("; ")}.`);
  }
  if (analysis?.climax) {
    const c = analysis.climax;
    lines.push(`Кульмінація на ${fmtTime(c.time)} — ${c.text}.`);
  }
  const per = analysis?.period ?? p.period;
  if (per) lines.push(`Знайдено повторюваний цикл ~${per.seconds.toFixed(0)} с — він стане мотивом, що повертається.`);
  else if (!p.isStill && p.changeScale !== "none") lines.push("Повторюваного циклу не знайдено.");
  if (analysis?.events) {
    const n = analysis.events.filter(e => (e.type === "peak" || e.type === "changePoint") && e.strength >= 0.5).length;
    if (n) lines.push(`Помітних подій (сильні піки, зміни режиму): ${n} — вони стануть акцентами в музиці.`);
    else if (p.changeScale !== "none") lines.push("Різких подій немає — зміни плавні.");
  }
  // область даних і шкала кольорів (етап 10)
  const rg = p.region;
  if (rg && !rg.full) {
    const what = rg.shape === "disk" ? "диск (глобус)" : rg.shape === "rect" ? "прямокутна карта" : "область неправильної форми";
    lines.push(`Область даних: ${what}, ${pct(rg.area)} кадру. Усе навколо (рамки, космос, чорні смуги, підписи) з аналізу виключено.`);
  }
  if (p.scale?.found) lines.push(`Знайдено шкалу кольорів (${p.scale.orientation === "vertical" ? "вертикальну" : "горизонтальну"}) — значення читаються за нею, сама шкала з аналізу вирізана.`);
  else if (p.sceneType === "heatmap") lines.push("Шкали кольорів у кадрі немає — значення оцінюємо за відтінком: синій — менше, червоний — більше.");
  const excl = [];
  if (p.shares.land > 0.01) excl.push(`суша (${pct(p.shares.land)} кадру)`);
  if (p.sceneType === "nightlights") lines.push(`Темрява займає ${pct(1 - p.sceneStats.litShare)} кадру — у музиці це глибокий дрон із довгою луною.`);
  else if (p.shares.bg > 0.01) excl.push(`статичний фон (${pct(p.shares.bg)})`);
  if (p.shares.overlay > 0.002) excl.push(`підписи, легенда та інші статичні елементи (${pct(p.shares.overlay)})`);
  if (excl.length) lines.push(`Виключено з аналізу динаміки: ${excl.join(", ")}. Суша й фон звучать як пауза в мелодії.`);
  const cuts = (analysis?.cuts ?? []).filter(c => !c.edge), edge = (analysis?.cuts ?? []).filter(c => c.edge);
  if (cuts.length) lines.push(`Склейки або переходи між частинами відео: ${cuts.map(c => fmtTime(c.time)).join(", ")} — у музиці там межі розділів.`);
  if (edge.length) lines.push("Перехідні кадри на початку чи в кінці відео (затемнення, титри) пропускаємо.");
  if (p.serviceTimes.length) lines.push(`Службові кадри (чорні/однотонні): ${p.serviceTimes.length} — їх пропускаємо.`);
  return lines;
}

const capital = s => s[0].toUpperCase() + s.slice(1);
