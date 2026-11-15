// Текстові описи для картки «Що двигун зрозумів про відео» і для скрінрідера.
import { getFeature } from "../features/index.js";
import { getLang, tr } from "../i18n/index.js";

/** Текст мовою інтерфейсу: L(українською, англійською). */
const L = (uk, en) => (getLang() === "en" ? en : uk);

export const SCENE_LABEL = () => ({
  heatmap: L("Теплова карта (кольорова шкала синій → червоний)", "Heat map (blue → red colour scale)"),
  nightlights: L("Нічна карта вогнів (темний кадр, яскраві точки)", "Night-lights map (dark frame, bright points)"),
  truecolor: L("Супутниковий знімок у справжніх кольорах", "True-colour satellite image"),
  chart: L("Графік або діаграма", "Chart or diagram"),
  mixed: L("Змішана візуалізація", "Mixed visualization"),
});

export const SCALE_LABEL = () => ({
  none: L("змін не виявлено (менші за шум)", "no changes detected (smaller than noise)"),
  tiny: L("зміни ледь помітні", "changes are barely noticeable"),
  small: L("зміни малі", "changes are small"),
  moderate: L("зміни помірні", "changes are moderate"),
  large: L("зміни великі", "changes are large"),
});

export const fmtTime = s => {
  const m = Math.floor(s / 60), ss = Math.round(s - m * 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};
const pct = x => (getLang() === "en" ? `${Math.round(x * 100)}%` : `${Math.round(x * 100)} %`);

/**
 * Список речень картки. analysis (прохід B) — необов'язковий: додає кульмінацію, події, підсилення.
 */
export function describeProfile(p, source, analysis = null) {
  const lines = [];
  const SCENE = SCENE_LABEL(), SCALE = SCALE_LABEL();
  const conf = p.confidence >= 0.7 ? "" : p.confidence >= 0.4 ? L(" (впевненість середня)", " (medium confidence)") : L(" (впевненість низька)", " (low confidence)");
  lines.push(`${p.scale?.palette ? L("Карта з власною шкалою кольорів (легенди в кадрі немає)", "A map with its own colour scale (no legend in the frame)") : SCENE[p.sceneType]}${conf}.`);
  if (p.scan) lines.push(L(`Зображення: лінія сканування йде ${p.scan.dir === "we" ? "із заходу на схід (зліва направо)" : "з півночі на південь (згори вниз)"} за ${Math.round(p.durationSec)} с; зміни вздовж карти звучать як зміни в часі.`,
    `Image: the scan line moves ${p.scan.dir === "we" ? "from west to east (left to right)" : "from north to south (top to bottom)"} over ${Math.round(p.durationSec)} s; changes along the map sound like changes in time.`));
  else if (p.isStill) lines.push(L("Одне зображення: музика сканує кадр зліва направо, часових змін немає.", "A single image: the music scans the frame left to right; there are no changes over time."));
  else {
    const rate = analysis?.rate.toFixed(analysis.rate % 1 ? 1 : 0);
    const frames = analysis ? L(`${analysis.count} кадрів аналізу (${rate} за секунду), `, `${analysis.count} analysis frames (${rate} per second), `) : "";
    lines.push(L(`${frames}${p.durationSec.toFixed(1)} с, ${Math.round(p.fps)} кадрів/с у відео.`, `${frames}${p.durationSec.toFixed(1)} s, ${Math.round(p.fps)} fps in the video.`));
  }
  // v7 §1: тип руху — що саме змінюється в кадрі (дані чи точка зору)
  const mo = analysis?.motion;
  if (mo && mo.type !== "temporal") lines.push(L(`Тип руху${mo.auto ? " (визначено автоматично)" : " (вибрано вручну)"}: ${mo.label}. ${mo.note}`,
    `Motion type${mo.auto ? " (detected automatically)" : " (chosen manually)"}: ${tr(mo.label)}. ${tr(mo.note)}`));
  if (!p.isStill) {
    const what = p.sceneType === "heatmap" ? L("значення за кольоровою шкалою", "the colour-scale value") : L("яскравість", "brightness");
    let s;
    if (p.changeScale === "none")
      s = L(`${capital(SCALE.none)}: жодна зона кадру не змінюється сильніше за шум відео. Музика буде спокійною, без вигаданих подій.`,
        `${capital(SCALE.none)}: no zone of the frame changes more than the video noise. The music will stay calm, with no invented events.`);
    else
      s = L(`${capital(SCALE[p.changeScale])}: у найактивнішій зоні ${what} змінюється до ${(p.changeAmp * 100).toFixed(1)} % шкали; ` +
        `це в ${p.changeRatio.toFixed(0)}× більше за шум, тобто зміни справжні. Змінюється ${pct(p.changeArea)} зон кадру.`,
        `${capital(SCALE[p.changeScale])}: in the most active zone ${what} changes by up to ${(p.changeAmp * 100).toFixed(1)}% of the scale; ` +
        `that is ${p.changeRatio.toFixed(0)}× the noise, so the changes are real. ${pct(p.changeArea)} of the frame zones change.`);
    lines.push(s);
    const lf = analysis?.leadFeature, g = lf && analysis.norm[lf];
    const lfl = lf && tr(analysis.labels[lf]);
    if (g && g.gain > 1.5)
      lines.push(L(`Головна ознака для музики — «${analysis.labels[lf]}». Вона змінюється мало (±${(g.spread * 50).toFixed(1)} % шкали), ` +
        `тому для руху в музиці зміни підсилено ×${g.gain.toFixed(g.gain < 10 ? 1 : 0)}${g.scale === "log" ? " (лог-шкала)" : ""}. Настрій музики лишається за абсолютним значенням.`,
        `The main feature for the music is «${lfl}». It changes little (±${(g.spread * 50).toFixed(1)}% of the scale), ` +
        `so its changes are amplified ×${g.gain.toFixed(g.gain < 10 ? 1 : 0)}${g.scale === "log" ? " (log scale)" : ""} to give the music movement. The mood still follows the absolute value.`));
    else if (g) lines.push(L(`Головна ознака для музики — «${analysis.labels[lf]}» (розмах ±${(g.spread * 50).toFixed(1)} % шкали, без підсилення).`,
      `The main feature for the music is «${lfl}» (range ±${(g.spread * 50).toFixed(1)}% of the scale, no amplification).`));
    if (analysis?.hotspots?.length) lines.push(L(`Найактивніші зони — «солісти» оркестру: ${analysis.hotspots.map(h => h.label).join("; ")}.`,
      `The most active zones are the orchestra's “soloists”: ${analysis.hotspots.map(h => tr(h.label)).join("; ")}.`));
  }
  if (analysis?.climax) {
    const c = analysis.climax;
    lines.push(L(`Кульмінація на ${fmtTime(c.time)} — ${c.text}.`, `Climax at ${fmtTime(c.time)} — ${tr(c.text)}.`));
  }
  const per = analysis?.period ?? p.period;
  if (per) lines.push(L(`Знайдено повторюваний цикл ~${per.seconds.toFixed(0)} с — він стане мотивом, що повертається.`, `A repeating cycle of ~${per.seconds.toFixed(0)} s was found — it becomes a returning motif.`));
  else if (!p.isStill && p.changeScale !== "none") lines.push(L("Повторюваного циклу не знайдено.", "No repeating cycle was found."));
  if (analysis?.events) {
    const n = analysis.events.filter(e => (e.type === "peak" || e.type === "changePoint") && e.strength >= 0.5).length;
    if (n) lines.push(L(`Помітних подій (сильні піки, зміни режиму): ${n} — вони стануть акцентами в музиці.`, `Notable events (strong peaks, regime changes): ${n} — they become accents in the music.`));
    else if (p.changeScale !== "none") lines.push(L("Різких подій немає — зміни плавні.", "No sharp events — the changes are smooth."));
  }
  // область даних і шкала кольорів (етап 10)
  const rg = p.region;
  if (rg && !rg.full) {
    const what = rg.shape === "disk" ? L("диск (глобус)", "a disc (globe)") : rg.shape === "rect" ? L("прямокутна карта", "a rectangular map") : L("область неправильної форми", "an irregular area");
    lines.push(L(`Область даних: ${what}, ${pct(rg.area)} кадру. Усе навколо (рамки, космос, чорні смуги, підписи) з аналізу виключено.`,
      `Data area: ${what}, ${pct(rg.area)} of the frame. Everything around it (frames, space, black bars, labels) is excluded from the analysis.`));
  }
  if (p.scale?.palette) lines.push(L(`Шкали кольорів у кадрі немає — ${p.palette?.why || "палітру визначено з кольорів кадру"}. Автоматичний режим: значення відносні; напрямок можна змінити перемикачем «Більше значення — це».`,
    `There is no colour scale in the frame — ${tr(p.palette?.why) || "the palette was derived from the frame colours"}. Automatic mode: values are relative; you can change the direction with the “A larger value means” switch.`));
  else if (p.scale?.found) lines.push(L(`Знайдено шкалу кольорів (${p.scale.orientation === "vertical" ? "вертикальну" : "горизонтальну"}) — значення читаються за нею, сама шкала з аналізу вирізана.`,
    `A ${p.scale.orientation === "vertical" ? "vertical" : "horizontal"} colour scale was found — values are read from it, and the scale itself is cut out of the analysis.`));
  else if (p.sceneType === "heatmap") lines.push(L("Шкали кольорів у кадрі немає — значення оцінюємо за відтінком: синій — менше, червоний — більше.", "There is no colour scale in the frame — values are estimated from the hue: blue is less, red is more."));
  const excl = [];
  if (p.shares.land > 0.01) excl.push(L(`суша (${pct(p.shares.land)} кадру)`, `land (${pct(p.shares.land)} of the frame)`));
  if (p.sceneType === "nightlights") lines.push(L(`Темрява займає ${pct(1 - p.sceneStats.litShare)} ${p.region && !p.region.full ? "області даних (космос не рахуємо)" : "кадру"} — у музиці це глибокий дрон із довгою луною.`,
    `Darkness covers ${pct(1 - p.sceneStats.litShare)} of the ${p.region && !p.region.full ? "data area (space is not counted)" : "frame"} — in the music it is a deep drone with a long echo.`));
  else if (p.shares.bg > 0.01) excl.push(L(`статичний фон (${pct(p.shares.bg)})`, `static background (${pct(p.shares.bg)})`));
  if (p.shares.overlay > 0.002) excl.push(L(`підписи, легенда та інші статичні елементи (${pct(p.shares.overlay)})`, `labels, legend and other static elements (${pct(p.shares.overlay)})`));
  if (excl.length) lines.push(L(`Виключено з аналізу динаміки: ${excl.join(", ")}. Суша й фон звучать як пауза в мелодії.`, `Excluded from the dynamics analysis: ${excl.join(", ")}. Land and background sound as rests in the melody.`));
  const cuts = (analysis?.cuts ?? []).filter(c => !c.edge), edge = (analysis?.cuts ?? []).filter(c => c.edge);
  if (cuts.length) lines.push(L(`Склейки або переходи між частинами відео: ${cuts.map(c => fmtTime(c.time)).join(", ")} — у музиці там межі розділів.`, `Cuts or transitions between parts of the video: ${cuts.map(c => fmtTime(c.time)).join(", ")} — section boundaries in the music.`));
  if (edge.length) lines.push(L("Перехідні кадри на початку чи в кінці відео (затемнення, титри) пропускаємо.", "Transition frames at the start or end of the video (fades, titles) are skipped."));
  if (p.serviceTimes.length) lines.push(L(`Службові кадри (чорні/однотонні): ${p.serviceTimes.length} — їх пропускаємо.`, `Service frames (black/solid): ${p.serviceTimes.length} — skipped.`));
  return lines;
}

const capital = s => s[0].toUpperCase() + s.slice(1);
