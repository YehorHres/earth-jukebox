// Картки NASA Earth Information Center і зіставлення завантаженого файлу з карткою за назвою (PROMPT-v8 §1–2).
let CARDS = null;

export async function loadEic(root = "") {
  if (!CARDS) CARDS = (await (await fetch(root + "src/eic/catalog.json")).json()).cards;
  return CARDS;
}

const norm = s => String(s || "").toLowerCase().replace(/\.[a-z0-9]{2,4}$/, "").replace(/[^a-z0-9а-яіїєґ]+/gi, " ").replace(/\s+/g, " ").trim();

/**
 * Назва файлу → картка. Збіг: SVS id окремим числом у назві (a4950, 4950_…) або ключові слова картки.
 * @returns {{ card, score, why } | null}
 */
export function matchEic(fileName, cards = CARDS) {
  if (!cards || !fileName) return null;
  const name = norm(fileName), tight = name.replace(/ /g, "");
  let best = null;
  for (const card of cards) {
    let score = 0, why = "";
    if (new RegExp(`(^| )a?0*${card.id}( |$)`).test(name)) { score = 1; why = `номер SVS ${card.id} у назві файлу`; }
    for (const k of card.keywords) {
      const kn = norm(k), hit = name.includes(kn) || tight.includes(kn.replace(/ /g, ""));
      const s = hit ? Math.min(0.95, 0.6 + 0.03 * kn.length) : 0;
      if (s > score) { score = s; why = `слова «${k}» у назві файлу`; }
    }
    if (score >= 0.6 && (!best || score > best.score)) best = { card, score, why };
  }
  return best;
}

/** Що картка задає для читання відео: тема, тип руху (якщо це рух камери / глобуса / карта на місці), полярність. */
export function cardSettings(card) {
  return {
    topic: card.topic || null,
    motion: ["temporal", "rotating-globe", "camera-pan-zoom"].includes(card.motionType) ? card.motionType : null,
    polarity: ["lighter", "darker", "warmer"].includes(card.moreMeans) ? card.moreMeans : "auto",
  };
}

/** Рядки картки для опису й скрінрідера. */
export function cardLines(card) {
  const out = [`Що на відео (картка NASA EIC, SVS ${card.id}): ${card.desc}`];
  const facts = [card.variable && `Дані: ${card.variable}`, card.units && `Одиниці: ${card.units}`, card.colors && `Кольори: ${card.colors}`, card.region && `Регіон: ${card.region}`, card.years && `Період: ${card.years}`, card.credit && `Автори: ${card.credit}`].filter(Boolean);
  if (facts.length) out.push(facts.join(". ") + ".");
  if (!card.moreMeans) out.push("Що означає «більше», джерело не пояснює — напрямок голосу даних визначено автоматично; його можна змінити перемикачем.");
  return out;
}
