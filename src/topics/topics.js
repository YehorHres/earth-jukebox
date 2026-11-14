// Теми візуалізацій: «тембр = тема, ноти = дані».
// Тема визначає звучання (soundProfile) і пресет мапінгу; sceneType лишається лише для зчитування пікселів.
let TOPICS = null;

export async function loadTopics() {
  if (!TOPICS) TOPICS = await (await fetch(new URL("./topics.json", import.meta.url))).json();
  return TOPICS;
}
export const getTopic = id => TOPICS?.find(t => t.id === id) || TOPICS?.find(t => t.id === "generic");
export const topicName = (t, lang = "uk") => t?.name?.[lang] || t?.name?.uk || "";

/* ---------------- зіставлення тексту / голосу з темою ---------------- */

/** Нормалізація: регістр, розділові знаки, CO₂ / СО2 (кирилицею) / «це о два» → co2. */
export function normalize(s) {
  let t = String(s || "").toLowerCase().normalize("NFC");
  t = t.replace(/[₀-₉]/g, d => String("₀₁₂₃₄₅₆₇₈₉".indexOf(d)));
  t = t.replace(/[’'`ʼ]/g, "");
  t = t.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  // латинські двійники кириличних літер у «со2»
  // (\b не працює з кирилицею — межі слова через lookaround з Unicode-класами)
  const B = "(?<![\\p{L}\\p{N}])", E = "(?![\\p{L}\\p{N}])";
  t = t.replace(new RegExp(`${B}[сc][оo]\\s?2${E}`, "gu"), "co2");
  // вимова вголос: «це о два», «се о два», «сі о ту», «c o two»
  t = t.replace(new RegExp(`${B}(це|се|сі|си|ці|c|see|si)\\s+(о|o|оу|ou|oh)\\s+(два|2|ту|two|to)${E}`, "gu"), "co2");
  return t.replace(/\s+/g, " ");
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** Схожість двох слів 0..1: точний збіг, спільний корінь (відмінки), відстань Левенштейна. */
function wordSim(a, b) {
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3) {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    const minLen = Math.min(a.length, b.length);
    if (p >= 4 || (p >= 3 && p === minLen)) return 0.88;            // «ураган» ~ «урагани», «викиди» ~ «викидів»
  }
  const d = levenshtein(a, b), L = Math.max(a.length, b.length);
  const s = 1 - d / L;
  return L >= 4 && s >= 0.7 ? s * 0.85 : 0;
}

/** Схожість запиту з фразою-синонімом. */
function phraseSim(q, syn) {
  if (q === syn) return 1;
  if ((" " + q + " ").includes(" " + syn + " ")) return 0.95;     // синонім міститься в запиті
  const qw = q.split(" "), sw = syn.split(" ");
  // кожне слово синоніма шукаємо в запиті
  let sum = 0;
  for (const w of sw) sum += Math.max(0, ...qw.map(x => wordSim(x, w)));
  const cover = sum / sw.length;
  // штраф за «зайві» слова запиту не даємо: «карта викидів co2 у світі» має знайти co2
  return cover >= 0.7 ? cover * 0.92 : 0;
}

/**
 * @returns {{ topic, score, alternatives: [{topic, score}] }} найкращий збіг (score 0..1) або topic=null
 */
export function matchTopic(query, topics = TOPICS) {
  const q = normalize(query);
  if (!q) return { topic: null, score: 0, alternatives: [] };
  const scored = topics.map(t => {
    let best = 0;
    for (const name of [t.id, t.name.uk, t.name.en, ...t.synonyms.uk, ...t.synonyms.en]) best = Math.max(best, phraseSim(q, normalize(name)));
    return { topic: t, score: best };
  }).sort((a, b) => b.score - a.score);
  const top = scored[0];
  return { topic: top.score >= 0.6 ? top.topic : null, score: top.score, alternatives: scored.filter(s => s.score > 0.3).slice(0, 4) };
}
