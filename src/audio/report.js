// Аудіозвіт галереї (v4-14): рендерить кожен трек так само, як застосунок (тема → мапінг → композитор →
// семпли → калібрування мастера), і міряє пік, гучність, смуги, баланс. Критерії — CRITERIA.
import { deserializeAnalysis } from "../analysis/serialize.js";
import { presetFor, mapAnalysis } from "../mapping/mapper.js";
import { loadTopics, getTopic } from "../topics/topics.js";
import { compose } from "../composer/composer.js";
import { loadFor } from "./library/index.js";
import { renderOffline } from "./render.js";
import { calibrate, leadOverAccomp } from "./master.js";
import { measure, BANDS, loudnessProfile, centroid } from "./measure.js";
import { TARGET_LUFS } from "./engine.js";

export { leadOverAccomp };
import { hashString } from "../util/rng.js";

/** Відбиток партитури: звіт актуальний, лише якщо композитор дає ті самі ноти. */
export function scoreHash(score) {
  return hashString(score.notes.map(n => `${n.part}:${n.inst}:${n.t.toFixed(3)}:${n.midi}:${n.dur.toFixed(3)}:${n.vel.toFixed(3)}`).join("|")).toString(36);
}

// v6: голос даних на +3…+4 дБ над супроводом (не більше); контраст усередині треку; треки різні між собою
export const CRITERIA = { leadDb: [2, 5], peakDb: -1, lufsSpread: 1, lufsTol: 0.5, sub60: 0.25, sub60StormClimax: 0.40, balanceDb: 0.5,
  rho: 0.7, lra: 8, climaxOverIntroDb: 6, climaxPartsOverIntro: 3, starsRho: 0.8, bpmGap: 5, centroidGap: 0.03, densityGap: 0.03 };

const rank = arr => { const idx = arr.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(arr.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const pearson = (x, y) => { const n = x.length, mx = x.reduce((p, q) => p + q, 0) / n, my = y.reduce((p, q) => p + q, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy || 1); };
/** Рангова кореляція (ρ Спірмена). */
export const spearman = (x, y) => (x.length > 2 ? pearson(rank(x), rank(y)) : 0);

/** Ноти-вогники за такт і частка вогнів (lights) — для перевірки «більше вогнів → густіший дощ нот». */
export function starsPerBar(score, mapping) {
  const counts = mapping.bars.map(() => 0);
  for (const n of score.notes) if (n.part === "stars" && !n.chord && !n.spark) counts[Math.min(counts.length - 1, Math.floor((n.t + 0.03) / score.barDur))]++;
  return { counts, lights: mapping.bars.map(b => b.params.lights ?? 0) };
}

/** Структура треку без рендеру: розділи (кількість партій), густота нот, голос, мотив, темп. */
export function trackShape(score, mapping) {
  const secMean = id => { const v = score.bars.filter((_, b) => mapping.bars[b].section === id).map(b => b.sustained); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };
  return { voice: score.voice?.instrument || null, motif: score.voice?.motif || null, bpm: score.bpm, meter: score.meter.id, key: score.key,
    noteDensity: score.notes.length / score.duration, partsIntro: secMean("intro"), partsClimax: secMean("climax") };
}

/** Трек галереї з готового аналізу: { item, analysis, mapping, score }. root — шлях до кореня сайту. */
export async function buildTrack(item, root = "") {
  await loadTopics();
  const analysis = deserializeAnalysis(await (await fetch(root + item.analysis)).json());
  const topic = getTopic(item.topic || "generic");
  const mapping = mapAnalysis(analysis, await presetFor(analysis.profile.sceneType, topic), { topic });
  const score = compose(mapping, { seed: `${item.id}|${mapping.meta.topic}` });
  return { item, analysis, mapping, score };
}

/**
 * @param {object} o { root, onProgress(text), keepBuffers }
 * @returns {{ rows: [...], ok, problems: [...], target }}
 */
export async function galleryReport({ root = "", onProgress = () => {}, keepBuffers = false, only = null, fast = false } = {}) {
  // fast — для ітерацій: один прохід калібрування на 22 кГц (смуга > 6 кГц тоді не показова)
  const sampleRate = fast ? 22050 : 44100, passes = fast ? 1 : 3;
  const cat = (await (await fetch(root + "samples/catalog.json")).json()).filter(i => i.kind === "video" && i.analysis && (!only || only.includes(i.id)));
  const rows = [];
  for (const item of cat) {
    onProgress(`${item.title}: композиція й семпли…`);
    const tr = await buildTrack(item, root);
    await loadFor(new OfflineAudioContext(1, 1, 44100), tr.score.instruments);
    onProgress(`${item.title}: калібрування мастера…`);
    const cal = await calibrate(tr.score, tr.mapping, { passes, sampleRate });
    onProgress(`${item.title}: фінальний рендер…`);
    const r = await renderOffline(tr.score, tr.mapping, { master: cal, sampleRate });
    const m = measure(r.buffer);
    const cl = tr.mapping.meta.sections.find(s => s.id === "climax");
    const climaxBands = cl ? measure(r.buffer, { t0: cl.b0 * tr.mapping.meta.barDur, t1: cl.b1 * tr.mapping.meta.barDur }).bands : null;
    const leadDb = await leadOverAccomp(tr.score, tr.mapping, { from: tr.mapping.meta.duration * 0.4, seconds: 10, master: cal, sampleRate });
    // v6: контраст усередині треку — енергія даних ↔ короткочасна гучність (3 с), діапазон гучності, розділи
    const lp = loudnessProfile(r.buffer), bd = tr.mapping.meta.barDur, dur = m.seconds;
    const stBar = tr.mapping.bars.map(b => { const c = Math.min(dur - 1.5, Math.max(1.5, b.t0 + bd / 2)); return lp.at(c - 1.5, c + 1.5); });
    // вступ не враховуємо: за формою він завжди тихий (мало партій), незалежно від даних
    const body = tr.mapping.bars.map((b, i) => i).filter(i => tr.mapping.bars[i].section !== "intro" && i < tr.mapping.bars.length - 1);
    const rho = spearman(body.map(i => tr.mapping.bars[i].params.energy), body.map(i => stBar[i]));
    const secLoud = id => { const s = tr.mapping.meta.sections.find(x => x.id === id); return s ? lp.at(s.b0 * bd, Math.min(dur, s.b1 * bd)) : null; };
    const st = starsPerBar(tr.score, tr.mapping), starsRho = tr.score.parts.some(p => p.id === "stars") ? spearman(st.counts, st.lights) : null;
    rows.push({ rho, lra: lp.lra, introLufs: secLoud("intro"), climaxLufs: secLoud("climax"), starsRho, centroid: centroid(r.buffer), voiceDb: cal.voiceDb || 0, ...trackShape(tr.score, tr.mapping),
      leadDb, id: item.id, title: item.title, topic: tr.mapping.meta.topic, seconds: m.seconds, peakDb: m.peakDb, lufs: m.lufs,
      balanceDb: m.balanceDb, bands: m.bands, hash: scoreHash(tr.score), climaxSub60: climaxBands ? climaxBands[0] : null, gainDb: cal.gainDb, calBalanceDb: cal.balanceDb,
      ...(keepBuffers && { buffer: r.buffer }) });
  }
  const problems = [];
  const lu = rows.map(r => r.lufs), spread = Math.max(...lu) - Math.min(...lu);
  if (spread > CRITERIA.lufsSpread) problems.push(`різниця гучності між треками ${spread.toFixed(2)} LU > ${CRITERIA.lufsSpread}`);
  for (const r of rows) {
    if (r.leadDb === null || r.leadDb < CRITERIA.leadDb[0] || r.leadDb > CRITERIA.leadDb[1]) problems.push(`${r.id}: голос даних на ${r.leadDb?.toFixed(1)} дБ над супроводом (треба ${CRITERIA.leadDb[0]}…${CRITERIA.leadDb[1]})`);
    if (Math.abs(r.lufs - TARGET_LUFS) > CRITERIA.lufsTol) problems.push(`${r.id}: гучність ${r.lufs.toFixed(2)} LUFS (треба ${TARGET_LUFS} ± ${CRITERIA.lufsTol})`);
    if (r.rho < CRITERIA.rho) problems.push(`${r.id}: кореляція енергії даних із гучністю ρ = ${r.rho.toFixed(2)} < ${CRITERIA.rho}`);
    if (r.lra < CRITERIA.lra) problems.push(`${r.id}: діапазон гучності ${r.lra.toFixed(1)} LU < ${CRITERIA.lra}`);
    if (r.introLufs !== null && r.climaxLufs !== null && r.climaxLufs - r.introLufs < CRITERIA.climaxOverIntroDb) problems.push(`${r.id}: кульмінація гучніша за вступ лише на ${(r.climaxLufs - r.introLufs).toFixed(1)} дБ (< ${CRITERIA.climaxOverIntroDb})`);
    if (r.partsIntro !== null && r.partsClimax !== null && r.partsClimax - r.partsIntro < CRITERIA.climaxPartsOverIntro) problems.push(`${r.id}: партій у кульмінації ${r.partsClimax.toFixed(1)}, у вступі ${r.partsIntro.toFixed(1)} (різниця < ${CRITERIA.climaxPartsOverIntro})`);
    if (r.starsRho !== null && r.starsRho < CRITERIA.starsRho) problems.push(`${r.id}: кореляція нот-вогників із кількістю вогнів ρ = ${r.starsRho.toFixed(2)} < ${CRITERIA.starsRho}`);
    if (r.peakDb > CRITERIA.peakDb) problems.push(`${r.id}: пік ${r.peakDb.toFixed(2)} dBFS > ${CRITERIA.peakDb}`);
    if (Math.abs(r.balanceDb) > CRITERIA.balanceDb) problems.push(`${r.id}: |L−R| ${Math.abs(r.balanceDb).toFixed(2)} дБ > ${CRITERIA.balanceDb}`);
    if (r.bands[0] > CRITERIA.sub60) problems.push(`${r.id}: енергія < 60 Гц ${(r.bands[0] * 100).toFixed(0)} % > 25 %`);
    if (r.topic === "storms" && r.climaxSub60 !== null && r.climaxSub60 > CRITERIA.sub60StormClimax) problems.push(`${r.id}: < 60 Гц у кульмінації ${(r.climaxSub60 * 100).toFixed(0)} % > 40 %`);
  }
  // треки різні між собою: (інструмент голосу + мотив + темп ±5 BPM) не збігаються; спектральний центр і густота нот — різні
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const p = rows[i], q = rows[j], rel = (u, v) => Math.abs(u - v) / Math.max(u, v, 1e-9);
    if (p.voice === q.voice && p.motif === q.motif && Math.abs(p.bpm - q.bpm) <= CRITERIA.bpmGap) problems.push(`${p.id} і ${q.id}: однакові голос, мотив і темп`);
    if (rel(p.centroid, q.centroid) < CRITERIA.centroidGap) problems.push(`${p.id} і ${q.id}: спектральний центр майже однаковий (${p.centroid.toFixed(0)} і ${q.centroid.toFixed(0)} Гц)`);
    if (rel(p.noteDensity, q.noteDensity) < CRITERIA.densityGap) problems.push(`${p.id} і ${q.id}: густота нот майже однакова (${p.noteDensity.toFixed(2)} і ${q.noteDensity.toFixed(2)} нот/с)`);
  }
  return { rows, ok: !problems.length, problems, spread, target: TARGET_LUFS, bands: BANDS.map(b => b[0]) };
}
