// Стилі (етап 11): перекривають лише інструменти партій і набір ударних; мапінг і дані не змінюються.
export const STYLE_IDS = ["orchestral", "ambient", "piano", "electronic", "choir"];
const cache = new Map();
export async function loadStyle(id) {
  if (!id) return null;
  if (!cache.has(id)) cache.set(id, fetch(new URL(`./${id}.json`, import.meta.url)).then(r => r.json()));
  return cache.get(id);
}
export const loadStyles = () => Promise.all(STYLE_IDS.map(loadStyle));
