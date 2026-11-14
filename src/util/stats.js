// Статистичні допоміжні функції. Чисті, без DOM — працюють і у Worker.

export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;

export function mean(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return arr.length ? s / arr.length : 0;
}

export function std(arr, m = mean(arr)) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += (arr[i] - m) ** 2;
  return arr.length > 1 ? Math.sqrt(s / arr.length) : 0;
}

/** Перцентиль p (0..100) з лінійною інтерполяцією. */
export function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = Float64Array.from(arr).sort();
  const pos = (s.length - 1) * p / 100, i = Math.floor(pos), f = pos - i;
  return i + 1 < s.length ? s[i] * (1 - f) + s[i + 1] * f : s[i];
}

export function median(arr) { return percentile(arr, 50); }

export function skewness(arr) {
  const m = mean(arr), sd = std(arr, m);
  if (sd < 1e-12) return 0;
  let s = 0;
  for (const x of arr) s += ((x - m) / sd) ** 3;
  return s / arr.length;
}

/** Повний опис розподілу — для «діапазонів ознак» у профілі відео. */
export function describeRange(arr) {
  const finite = arr.filter(Number.isFinite);
  if (!finite.length) return { p2: 0, p5: 0, p50: 0, p95: 0, p98: 0, mean: 0, std: 0, skew: 0 };
  const s = Float64Array.from(finite).sort();
  const q = p => { const pos = (s.length - 1) * p / 100, i = Math.floor(pos), f = pos - i; return i + 1 < s.length ? s[i] * (1 - f) + s[i + 1] * f : s[i]; };
  const m = mean(finite);
  return { p2: q(2), p5: q(5), p50: q(50), p95: q(95), p98: q(98), mean: m, std: std(finite, m), skew: skewness(finite) };
}

/** Нормована автокореляція ряду для лагу lag. */
export function autocorr(arr, lag) {
  const n = arr.length;
  if (lag >= n - 2) return 0;
  const m = mean(arr);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) den += (arr[i] - m) ** 2;
  for (let i = 0; i + lag < n; i++) num += (arr[i] - m) * (arr[i + lag] - m);
  return den > 1e-12 ? (num / (n - lag)) / (den / n) : 0;
}

/** Нахил лінійної регресії ряду на [from..to]. */
export function slope(arr, from, to) {
  const n = to - from + 1;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = from; i <= to; i++) { const x = i - from; sx += x; sy += arr[i]; sxy += x * arr[i]; sxx += x * x; }
  const den = n * sxx - sx * sx;
  return den ? (n * sxy - sx * sy) / den : 0;
}

/** Ковзне середнє з вікном 2r+1. */
export function smooth(arr, r = 2) {
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(arr.length - 1, i + r); j++) { s += arr[j]; n++; }
    out[i] = s / n;
  }
  return out;
}
