// v10 §4 — унікальність завантаженого відео: власний мотив голосу даних («відбиток» карти) і власна фактура супроводу.
// Галерея цього не отримує (її партитури незмінні — золотий тест).
import { hashString } from "../util/rng.js";

/**
 * «Відбиток» карти: профіль головного значення вздовж карти (16 колонок, захід → схід) у перших тактах → 5–8 нот.
 * Висота ноти = значення в її колонці відносно першої (колонки обходяться з початку й кроком від seed); ритм (кроки такту) і кількість нот — від seed файлу.
 * Стрибки між сусідніми нотами ≤ 3 щаблів (сольфеджіо), перша нота — опора (щабель 0).
 */
export function fingerprintMotif(bars, meter, seed) {
  const h = hashString(String(seed)), steps = meter.steps, prof = new Array(16).fill(0), cnt = new Array(16).fill(0);
  for (const bar of bars.slice(0, 4)) (bar.params.contour || []).forEach((v, c) => { if (v !== null && v !== undefined) { prof[c] += v; cnt[c]++; } });
  const p = prof.map((v, c) => (cnt[c] ? v / cnt[c] : null)), known = p.filter(v => v !== null);
  const lo = known.length ? Math.min(...known) : 0, span = Math.max(known.length ? Math.max(...known) - lo : 0, 1e-6);
  const N = Math.min(steps / 2, 5 + (h % 4));
  // ритм: «раз» + N−1 парних кроків, вибраних за seed
  const pool = []; for (let s = 2; s < steps; s += 2) pool.push(s);
  let x = h; const next = () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0);
  for (let i = pool.length - 1; i > 0; i--) { const j = next() % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const pos = [0, ...pool.slice(0, N - 1)].sort((a, b) => a - b);
  // які колонки карти читає мотив — теж від seed: початок і крок обходу (3, 5 або 7 колонок)
  const start = Math.floor(h / 4) % 16, stride = [3, 5, 7][Math.floor(h / 64) % 3];
  const at = k => { const c = (start + k * stride) % 16; for (let d = 0; d < 16; d++) for (const q of [c - d, c + d]) if (p[q] !== null && p[q] !== undefined) return (p[q] - lo) / span; return null; };
  const v0 = at(0), flat = v0 === null || span < 0.05;
  const notes = []; let prev = 0;
  pos.forEach((s, k) => {
    let deg = k === 0 ? 0 : flat ? prev + (next() % 3) - 1 : Math.round((at(k) - v0) * 5);
    deg = Math.max(prev - 3, Math.min(prev + 3, Math.max(-2, Math.min(3, deg))));
    if (k > 0 && deg === prev && k % 2 === 1) deg += (next() & 1) && deg < 3 ? 1 : deg > -2 ? -1 : 1;      // без «стояння» на одній ноті — мотив має рисунок
    notes.push([s, deg]); prev = deg;
  });
  return { id: `відбиток карти (${N} нот)`, steps, notes, fingerprint: true };
}

/** Фактури супроводу: які партії додаються до партій теми і які мовчать. */
export const TEXTURES = {
  pulse: { add: ["bass", "drums"], drop: ["arp", "counter"] },             // пульс: бас і ударні, без арпеджіо
  ostinato: { add: ["arp", "bass", "drums"], drop: ["pad", "counter"] },   // сухе остинато без педа
  chorale: { add: ["pad", "bass", "counter"], drop: ["arp", "drums", "texture"] },    // хоральні акорди: щільно, без ударних
  arpeggio: { add: ["arp", "pad"], drop: ["drums", "counter"] },           // хвилі арпеджіо, легато, без ударних
  nature: { add: ["texture", "pad", "counter"], drop: ["arp", "drums", "bass"] },  // текстури природи, простір і повітря
};
const BY_TOPIC = { fires: "pulse", storms: "ostinato", co2: "chorale", aerosols: "chorale", "ocean-currents": "arpeggio", "sea-level": "arpeggio", vegetation: "nature", clouds: "nature" };
/** Фактура відео: за темою (відчуття явища); інші теми — за seed файлу; нічні вогні — як є. */
export function textureFor(topicId, seed) {
  if (topicId === "nightlights") return null;
  const ids = Object.keys(TEXTURES);
  return BY_TOPIC[topicId] || ids[hashString(String(seed)) % ids.length];
}
