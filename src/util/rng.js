// Детермінований генератор випадковості: однаковий файл → однакова музика.

/** 53-бітний хеш рядка (cyrb53). */
export function hashString(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32: повертає функцію () → [0, 1). */
export function makeRng(seed) {
  let a = (typeof seed === "string" ? hashString(seed) : seed) >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.range = (lo, hi) => lo + (hi - lo) * rnd();
  rnd.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rnd());
  rnd.pick = arr => arr[Math.floor(rnd() * arr.length)];
  rnd.chance = p => rnd() < p;
  /** Нормальний розподіл (Box–Muller). */
  rnd.gauss = (m = 0, s = 1) => m + s * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  return rnd;
}
