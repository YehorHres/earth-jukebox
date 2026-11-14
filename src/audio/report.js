// Аудіозвіт галереї (v4-14): рендерить кожен трек так само, як застосунок (тема → мапінг → композитор →
// семпли → калібрування мастера), і міряє пік, гучність, смуги, баланс. Критерії — CRITERIA.
import { deserializeAnalysis } from "../analysis/serialize.js";
import { presetFor, mapAnalysis } from "../mapping/mapper.js";
import { loadTopics, getTopic } from "../topics/topics.js";
import { compose } from "../composer/composer.js";
import { loadFor } from "./library/index.js";
import { renderOffline } from "./render.js";
import { calibrate } from "./master.js";
import { measure, BANDS } from "./measure.js";
import { TARGET_LUFS } from "./engine.js";
import { LEAD_PARTS } from "../grammar.js";

/** На скільки дБ голос даних гучніший за супровід (уривок seconds с від from). */
export async function leadOverAccomp(score, mapping, { from = 0, seconds = 8, master = null, sampleRate = 44100 } = {}) {
  const v = measure((await renderOffline(score, mapping, { from, seconds, master, sampleRate, solo: ["dataVoice"] })).buffer).lufs;
  const a = measure((await renderOffline(score, mapping, { from, seconds, master, sampleRate, muted: LEAD_PARTS })).buffer).lufs;
  return v - a;
}
import { hashString } from "../util/rng.js";

/** Відбиток партитури: звіт актуальний, лише якщо композитор дає ті самі ноти. */
export function scoreHash(score) {
  return hashString(score.notes.map(n => `${n.part}:${n.inst}:${n.t.toFixed(3)}:${n.midi}:${n.dur.toFixed(3)}:${n.vel.toFixed(3)}`).join("|")).toString(36);
}

export const CRITERIA = { leadDb: 6, peakDb: -1, lufsSpread: 1, sub60: 0.25, sub60StormClimax: 0.40, balanceDb: 0.5 };

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
  const sampleRate = fast ? 22050 : 44100, passes = fast ? 1 : 2;
  const cat = (await (await fetch(root + "samples/catalog.json")).json()).filter(i => i.kind === "video" && i.analysis && (!only || only.includes(i.id)));
  const rows = [];
  for (const item of cat) {
    onProgress(`${item.title}: композиція й семпли…`);
    const tr = await buildTrack(item, root);
    await loadFor(new OfflineAudioContext(1, 1, 44100), [...new Set(tr.score.notes.map(n => n.inst))]);
    onProgress(`${item.title}: калібрування мастера…`);
    const cal = await calibrate(tr.score, tr.mapping, { passes, sampleRate });
    onProgress(`${item.title}: фінальний рендер…`);
    const r = await renderOffline(tr.score, tr.mapping, { master: cal, sampleRate });
    const m = measure(r.buffer);
    const cl = tr.mapping.meta.sections.find(s => s.id === "climax");
    const climaxBands = cl ? measure(r.buffer, { t0: cl.b0 * tr.mapping.meta.barDur, t1: cl.b1 * tr.mapping.meta.barDur }).bands : null;
    const leadDb = await leadOverAccomp(tr.score, tr.mapping, { from: tr.mapping.meta.duration * 0.4, seconds: 10, master: cal, sampleRate });
    rows.push({ leadDb, id: item.id, title: item.title, topic: tr.mapping.meta.topic, seconds: m.seconds, peakDb: m.peakDb, lufs: m.lufs,
      balanceDb: m.balanceDb, bands: m.bands, hash: scoreHash(tr.score), climaxSub60: climaxBands ? climaxBands[0] : null, gainDb: cal.gainDb, calBalanceDb: cal.balanceDb,
      ...(keepBuffers && { buffer: r.buffer }) });
  }
  const problems = [];
  const lu = rows.map(r => r.lufs), spread = Math.max(...lu) - Math.min(...lu);
  if (spread > CRITERIA.lufsSpread) problems.push(`різниця гучності між треками ${spread.toFixed(2)} LU > ${CRITERIA.lufsSpread}`);
  for (const r of rows) {
    if (r.leadDb < CRITERIA.leadDb) problems.push(`${r.id}: голос даних лише на ${r.leadDb.toFixed(1)} дБ гучніший за супровід (< ${CRITERIA.leadDb})`);
    if (r.peakDb > CRITERIA.peakDb) problems.push(`${r.id}: пік ${r.peakDb.toFixed(2)} dBFS > ${CRITERIA.peakDb}`);
    if (Math.abs(r.balanceDb) > CRITERIA.balanceDb) problems.push(`${r.id}: |L−R| ${Math.abs(r.balanceDb).toFixed(2)} дБ > ${CRITERIA.balanceDb}`);
    if (r.bands[0] > CRITERIA.sub60) problems.push(`${r.id}: енергія < 60 Гц ${(r.bands[0] * 100).toFixed(0)} % > 25 %`);
    if (r.topic === "storms" && r.climaxSub60 !== null && r.climaxSub60 > CRITERIA.sub60StormClimax) problems.push(`${r.id}: < 60 Гц у кульмінації ${(r.climaxSub60 * 100).toFixed(0)} % > 40 %`);
  }
  return { rows, ok: !problems.length, problems, spread, target: TARGET_LUFS, bands: BANDS.map(b => b[0]) };
}
