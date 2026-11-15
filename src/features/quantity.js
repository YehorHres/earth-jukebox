// v10 — «кількість даних на ВИДИМІЙ поверхні» (скарги: блискавки, CO₂, океан, пожежа).
// Знаменник — не кадр, а видима поверхня: у кожному рядку — відрізок між першим і останнім не-темним пікселем
// (диск глобуса — опуклий, тому це його площа навіть коли всередині темно; карта на весь кадр — увесь кадр).
// Наближення камери змінює площу диска, але не ЧАСТКУ даних на ньому.
//   surface     — частка кадру, зайнята видимою поверхнею (лише для перевірок: гучність від неї НЕ залежить);
//   pointShare  — «точкові» дані: дрібні яскраві плями, помітно світліші за своє оточення (блискавки, хмара точок, вогні);
//   fireShare   — горить зараз: насичені жовтий / помаранчевий / червоний;
//   burnedShare — уже згоріло: сіре, ненасичене;
//   gainShare / lossShare — карта змін із розбіжною шкалою: фіолетове (більше) / помаранчеве (менше).
import { registerFeature } from "./registry.js";
import { clamp } from "../util/stats.js";

export const QCOLS = 16;
const DARK = 0.07, D = 2;

export function quantityOf(ctx) {
  if (ctx._q) return ctx._q;
  const { w, h, val, sat, hue, inside } = ctx;
  const colSurf = new Float32Array(QCOLS), colPts = new Float32Array(QCOLS), colFire = new Float32Array(QCOLS), colGain = new Float32Array(QCOLS), colLoss = new Float32Array(QCOLS);
  let surf = 0, pts = 0, fire = 0, burned = 0, gain = 0, loss = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let x0 = -1, x1 = -1;
    for (let x = 0; x < w; x++) if (val[row + x] >= DARK && (!inside || inside[row + x])) { if (x0 < 0) x0 = x; x1 = x; }
    if (x0 < 0) continue;
    const yu = Math.max(0, y - D) * w, yd = Math.min(h - 1, y + D) * w;
    for (let x = x0; x <= x1; x++) {
      const i = row + x;
      if (inside && !inside[i]) continue;
      const c = Math.min(QCOLS - 1, Math.floor(x * QCOLS / w));
      surf++; colSurf[c]++;
      const v = val[i], s = sat[i], hh = hue[i];
      if (v >= 0.2) {
        // локальний контраст: яскравіше за чотирьох сусідів на відстані D
        const bg = (val[row + Math.max(0, x - D)] + val[row + Math.min(w - 1, x + D)] + val[yu + x] + val[yd + x]) / 4, d = v - bg;
        if (d > 0.08) { const m = Math.min(1, d / 0.3); pts += m; colPts[c] += m; }
      }
      if (s >= 0.5 && v >= 0.5 && (hh <= 65 || hh >= 345)) { fire++; colFire[c]++; }
      else if (s < 0.14 && v >= 0.28 && v <= 0.8) burned++;
      if (s >= 0.3 && v >= 0.25 && hh >= 250 && hh <= 320) { gain++; colGain[c]++; }
      else if (s >= 0.5 && v >= 0.4 && hh >= 15 && hh <= 50) { loss++; colLoss[c]++; }
    }
  }
  const N = Math.max(1, surf), col = a => Array.from(a, (v, c) => (colSurf[c] > 0 ? Math.round(1e4 * v / colSurf[c]) / 1e4 : 0));
  return (ctx._q = { surface: surf / ctx.n, points: pts / N, fire: fire / N, burned: burned / N, gain: gain / N, loss: loss / N,
    cols: { qp: col(colPts), qf: col(colFire), qg: col(colGain), ql: col(colLoss) } });
}

registerFeature({ id: "surface", label: "Видима поверхня (частка кадру)", group: "quantity", compute: c => quantityOf(c).surface });
registerFeature({ id: "pointShare", label: "Частка точок на видимій поверхні", group: "quantity", compute: c => clamp(quantityOf(c).points * 4) });
registerFeature({ id: "fireShare", label: "Активний вогонь (частка видимої поверхні)", group: "quantity", compute: c => clamp(quantityOf(c).fire * 4) });
registerFeature({ id: "burnedShare", label: "Згоріла площа (сіре, частка видимої поверхні)", group: "quantity", compute: c => quantityOf(c).burned });
registerFeature({ id: "gainShare", label: "Зростання (фіолетове, частка поверхні)", group: "quantity", compute: c => clamp(quantityOf(c).gain * 2) });
registerFeature({ id: "lossShare", label: "Зменшення (помаранчеве, частка поверхні)", group: "quantity", compute: c => clamp(quantityOf(c).loss * 2) });
