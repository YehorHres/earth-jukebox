// Голос пояснює (PROMPT-v10 §7): короткий вступ (≤ 20 с), «Що зараз?» (клавіша W) і підсумок після треку.
// Чисті функції від { analysis, mapping, card, topic, title } — їх перевіряють тести без звуку.
import { getLang, tr } from "../i18n/index.js";
import { fmtTime } from "./describe.js";
import { speechSeconds } from "./speech.js";

const L = (uk, en) => (getLang() === "en" ? en : uk);
const P = (o, k) => (o ? (getLang() === "en" ? (o[k + "_en"] ?? tr(o[k])) : o[k]) : null);
export const INTRO_MAX_SEC = 20;

/** Як слухати точкові дані: що звучить кожна точка. */
const POINTS = {
  storms: ["кожна точка — блискавка, звучить тріском", "every point is a lightning flash, heard as a crackle"],
  fires: ["кожна точка — вогонь, звучить потріскуванням", "every point is a fire, heard as a crackle"],
  nightlights: ["кожна точка — вогник міста, звучить дзвіночком", "every point is a city light, heard as a small bell"],
  co2: ["густіший шлейф — вищий і гучніший голос", "a denser plume — a higher, louder voice"],
};

/** Роки з картки: [початок, кінець] або null («2017–2023», «2012», «2017 to 2023»). */
export function cardYears(card) {
  const ys = String(card?.years ?? "").match(/\b(1[89]\d\d|20\d\d)\b/g)?.map(Number);
  return ys?.length ? [ys[0], ys[ys.length - 1]] : null;
}

/** Кадр аналізу, найближчий до часу t. */
export function frameAt(a, t) {
  const ts = a.times; let lo = 0, hi = a.count - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < t) lo = m + 1; else hi = m; }
  return lo > 0 && Math.abs(ts[lo - 1] - t) < Math.abs(ts[lo] - t) ? lo - 1 : lo;
}

const lead = a => a.leadFeature || a.keyFeatures?.[0] || Object.keys(a.rel)[0];
/** Провідна величина 0..1 (відносна шкала відео) у кадрі i. */
const val = (a, i) => a.rel[lead(a)][i];

/** Де більше: захід / центр / схід — за балансом ознаки ліво/право (ліве вухо — захід). */
export function whereAt(a, i) {
  const b = a.abs?.balanceLR?.[i];
  if (b == null || !Number.isFinite(b)) return a.hotspots?.[0] ? tr(a.hotspots[0].label) : null;
  if (b < -0.12) return L("більше на заході (ліве вухо)", "more in the west (left ear)");
  if (b > 0.12) return L("більше на сході (праве вухо)", "more in the east (right ear)");
  return L("розподілено рівно (по центру)", "spread evenly (centre)");
}

/** Дата для часу t, якщо в картці є роки. */
export function dateAt(card, dur, t) {
  const y = cardYears(card);
  if (!y) return null;
  if (y[0] === y[1]) return String(y[0]);
  return L(`≈ ${Math.round(y[0] + (y[1] - y[0]) * Math.min(1, t / (dur || 1)))} рік`, `≈ ${Math.round(y[0] + (y[1] - y[0]) * Math.min(1, t / (dur || 1)))}`);
}

const unitsOf = card => { const u = P(card, "units"); return u && u.length < 24 ? u : null; };
const pctText = v => L(`${Math.round(v * 100)} % шкали`, `${Math.round(v * 100)}% of the scale`);

/** Клавіша W: час/дата, де найбільше, росте чи падає, наскільки. */
export function whatNow({ analysis: a, card }, t) {
  const dur = a.profile.durationSec || a.times[a.count - 1] || 1, i = frameAt(a, t);
  const k = Math.max(1, Math.round((a.rate || 1) * 3)), j = Math.max(0, i - k);
  const d = val(a, i) - val(a, j), noise = Math.max(0.03, a.norm?.[lead(a)]?.relNoise || 0);
  const dir = d > noise ? L("росте", "rising") : d < -noise ? L("падає", "falling") : L("майже не змінюється", "almost steady");
  const date = dateAt(card, dur, t), where = whereAt(a, i), u = unitsOf(card);
  return [
    L(`${fmtTime(t)} з ${fmtTime(dur)}`, `${fmtTime(t)} of ${fmtTime(dur)}`) + (date ? `, ${date}` : "") + ".",
    where ? `${where[0].toUpperCase()}${where.slice(1)}.` : "",
    L(`Величина ${dir}`, `The value is ${dir}`) + (Math.abs(d) > noise ? L(` на ${pctText(Math.abs(d))} за 3 с`, ` by ${pctText(Math.abs(d))} over 3 s`) : "") +
      L(`; зараз ${pctText(val(a, i))} від мінімуму до максимуму відео`, `; now ${pctText(val(a, i))} between the video's minimum and maximum`) + (u ? ` (${u})` : "") + ".",
  ].filter(Boolean).join(" ");
}

/** Підсумок після треку: тренд, максимум (коли й де), кількість подій. */
export function trackSummary({ analysis: a, mapping, card }) {
  const n = a.count, q = Math.max(1, Math.floor(n / 4)), mean = (s, e) => { let x = 0; for (let i = s; i < e; i++) x += val(a, i); return x / (e - s); };
  const d = mean(n - q, n) - mean(0, q);
  const trend = d > 0.08 ? L("загалом величина зросла", "overall the value rose") : d < -0.08 ? L("загалом величина зменшилася", "overall the value fell") : L("явного тренду немає", "there is no clear trend");
  let im = 0; for (let i = 1; i < n; i++) if (val(a, i) > val(a, im)) im = i;
  const dur = a.profile.durationSec || a.times[n - 1], date = dateAt(card, dur, a.times[im]), where = whereAt(a, im);
  const events = mapping ? mapping.bars.reduce((s, b) => s + b.events.length, 0) : a.events.length;
  return L(`Підсумок: ${trend} (${d >= 0 ? "+" : "−"}${pctText(Math.abs(d))} від початку до кінця). Максимум на ${fmtTime(a.times[im])}${date ? ` (${date})` : ""}${where ? `, ${where}` : ""}. Подій: ${events}.`,
    `Summary: ${trend} (${d >= 0 ? "+" : "−"}${pctText(Math.abs(d))} from start to end). Maximum at ${fmtTime(a.times[im])}${date ? ` (${date})` : ""}${where ? `, ${where}` : ""}. Events: ${events}.`);
}

/** Вступ ≤ 20 с: що це, звідки дані, роки, як слухати; далі звучить 1 с тон-орієнтир. */
export function introText({ title, card, topic, colorMore }) {
  const tid = topic?.id, years = P(card, "years"), what = P(card, "variable");
  const src = (P(card, "authors") || "").split(/[;,]/).map(s => s.trim()).find(s => /NASA|NOAA|JPL|ESA/.test(s)) || (card ? "NASA" : null);
  const more = (colorMore && tr(colorMore)) || P(topic, "more") || (topic?.more && (getLang() === "en" ? topic.more.en : topic.more.uk)) || L("більше", "more");
  const pts = POINTS[tid]?.[getLang() === "en" ? 1 : 0];
  const parts = [
    `${title}${years && cardYears(card) ? `, ${years}` : ""}.`,
    what ? L(`Що: ${what}.`, `What: ${what}.`) : "",
    src ? L(`Дані: ${src}.`, `Data: ${src}.`) : "",
    pts ? `${pts[0].toUpperCase()}${pts.slice(1)}.` : "",
    L(`Вище звук — ${more}. Ліве вухо — захід, праве — схід.`, `Higher sound — ${more}. Left ear — west, right ear — east.`),
    L("Тон-орієнтир — середнє значення.", "The reference tone is the average value."),
  ].filter(Boolean);
  // ≤ 20 с при 1×: якщо задовго — прибираємо менш важливе (джерело, потім «що»)
  for (const drop of [2, 1]) if (speechSeconds(parts.join(" "), 1) > INTRO_MAX_SEC - 1.5 && parts.length > 4) parts.splice(drop, 1);
  let s = parts.join(" ");
  while (speechSeconds(s, 1) > INTRO_MAX_SEC - 1.5) s = s.replace(/\s*[^.]*\.\s*$/, "").trim() || s.slice(0, 250);
  return s;
}
