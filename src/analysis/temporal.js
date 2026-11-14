// Часові ознаки (розділ 3 ТЗ) для кожної скалярної ознаки, рахуються з каналу rel:
//   .d1 — зміна за кадр, .speed10 — швидкість (вікно 10), .accel20 — прискорення (вікно 20),
//   .trend40 — тренд (регресія за 40 кадрів). Значення нормовані робастно в межах відео,
//   з порогом від шуму — шум не дає «швидкості» чи «тренду».
import { percentile, slope, smooth, clamp } from "../util/stats.js";

export const TEMPORAL_KEYS = ["d1", "speed10", "accel20", "trend40"];

export function temporalFeatures(rel, relNoise = 0) {
  const n = rel.length;
  const r = smooth(Array.from(rel), 1);
  const d1 = new Float32Array(n), speed = new Float32Array(n), accel = new Float32Array(n), trend = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    d1[i] = i ? r[i] - r[i - 1] : 0;
    const a = Math.max(0, i - 10);
    speed[i] = i > a ? Math.abs(r[i] - r[a]) / (i - a) : 0;
    const b = Math.max(0, i - 10), c = Math.max(0, i - 20);
    const s1 = i > b ? (r[i] - r[b]) / (i - b) : 0, s2 = b > c ? (r[b] - r[c]) / (b - c) : 0;
    accel[i] = s1 - s2;
    trend[i] = slope(r, Math.max(0, i - 39), i);
  }
  // пороги шуму для кожного вікна (оцінка розкиду похідних білого шуму)
  const floors = { d1: 3 * relNoise, speed10: 3 * relNoise / 7, accel20: 3 * relNoise / 7, trend40: 3 * relNoise * 0.014 };
  const norm = (arr, floor, signed) => {
    const mags = Array.from(arr, Math.abs);
    const sc = Math.max(percentile(mags, 95), floor, 1e-9);
    for (let i = 0; i < n; i++) arr[i] = signed ? clamp(arr[i] / sc, -1, 1) : clamp(arr[i] / sc);
    return arr;
  };
  return {
    d1: norm(d1, floors.d1, true),
    speed10: norm(speed, floors.speed10, false),
    accel20: norm(accel, floors.accel20, true),
    trend40: norm(trend, floors.trend40, true),
  };
}
