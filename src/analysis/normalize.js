// Адаптивна нормалізація (розділ 2 ТЗ): два канали для кожної ознаки.
//   abs — фізична шкала (як є);
//   rel — у межах цього відео: робастно p5..p95, лог-шкала для «довгого хвоста»,
//         м'яке коліно нижче рівня шуму (шум не перетворюється на драму).
import { percentile, skewness, clamp } from "../util/stats.js";

const KNEE_NOISE_MULT = 4;   // якщо розмах < 4× шуму — не розтягуємо його на всю шкалу

/**
 * @param {Float32Array} abs ряд значень
 * @param {object} o { noise, range: [lo, hi], valid: Uint8Array (1 = кадр враховується) }
 */
export function normalizeSeries(abs, { noise = 0, range = [0, 1], valid = null }) {
  const n = abs.length;
  const vals = [];
  for (let i = 0; i < n; i++) if (!valid || valid[i]) vals.push(abs[i]);
  if (!vals.length) for (let i = 0; i < n; i++) vals.push(abs[i]);
  const span = range[1] - range[0];
  const a5 = percentile(vals, 5), a50 = percentile(vals, 50), a95 = percentile(vals, 95);

  // лог-шкала для асиметричних невід'ємних розподілів (яскравість вогнів, кількість точок)
  const skew = skewness(vals);
  const useLog = range[0] >= 0 && skew > 1.5 && a95 > 0;
  const s = useLog ? Math.max(a50, a95 / 50, 1e-6) : 1;
  const T = useLog ? x => Math.log1p(Math.max(0, x) / s) : x => x;
  const noiseY = useLog ? noise / (s + Math.max(a50, 0)) : noise;

  const y5 = T(a5), y95 = T(a95);
  const spreadY = y95 - y5;
  const spreadEff = Math.max(spreadY, KNEE_NOISE_MULT * noiseY, 1e-9);
  const mid = (y5 + y95) / 2;

  const rel = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = T(abs[i]) - mid;
    const ad = Math.abs(d);
    const dk = noiseY > 0 ? d * ad / (ad + noiseY) : d;   // м'яке коліно: менше за шум — приглушуємо
    rel[i] = clamp(0.5 + dk / spreadEff);
  }
  const absSpread = a95 - a5;
  const gain = span / Math.max(absSpread, KNEE_NOISE_MULT * noise, span * 1e-4);
  return {
    rel,
    info: {
      scale: useLog ? "log" : "lin",
      p5: a5, p50: a50, p95: a95,
      spread: absSpread / span,            // частка шкали
      gain: Math.min(gain, 1000),
      noise,
      significant: absSpread >= KNEE_NOISE_MULT * noise && absSpread > span * 1e-4,
      relNoise: noiseY / spreadEff,         // шум у одиницях rel
    },
  };
}

/** Ранг значення серед усього відео (0..1): наскільки воно екстремальне. */
export function globalRank(abs, valid = null) {
  const idx = [];
  for (let i = 0; i < abs.length; i++) if (!valid || valid[i]) idx.push(i);
  const sorted = idx.map(i => abs[i]).sort((a, b) => a - b);
  const out = new Float32Array(abs.length);
  for (let i = 0; i < abs.length; i++) {
    // бінарний пошук позиції
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < abs[i]) lo = m + 1; else hi = m; }
    out[i] = sorted.length > 1 ? lo / (sorted.length - 1) : 0.5;
  }
  return out;
}
