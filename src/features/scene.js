// Ознаки, залежні від типу сцени. Рахуються завжди (дешево) — мапінг вирішує, що брати.
import { registerFeature } from "./registry.js";
import { clamp } from "../util/stats.js";

const LOG_K = 60;
export const logLight = v => Math.log1p(LOG_K * v) / Math.log1p(LOG_K);

/* ---------- heatmap ---------- */
function rampShares(ctx, sh) {
  if (sh.ramp) return sh.ramp;
  let hot = 0, cold = 0, c = 0;
  for (let i = 0; i < ctx.n; i++) {
    if (!ctx.isData[i] || ctx.ramp[i] < 0) continue;
    c++; if (ctx.ramp[i] >= 0.7) hot++; else if (ctx.ramp[i] <= 0.3) cold++;
  }
  return (sh.ramp = { hot: c ? hot / c : 0, cold: c ? cold / c : 0 });
}
registerFeature({ id: "hotShare", label: "Частка гарячих зон", group: "heatmap", compute: (c, sh) => rampShares(c, sh).hot });
registerFeature({ id: "coldShare", label: "Частка холодних зон", group: "heatmap", compute: (c, sh) => rampShares(c, sh).cold });

/* ---------- nightlights ---------- */
function lightStats(ctx, sh) {
  if (sh.lights) return sh.lights;
  const { w, h, n, luma } = ctx, st = ctx.masks?.staticMask;
  // поріг світла відносно фону: медіана luma + 0.08
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[Math.min(255, Math.floor(luma[i] * 255))]++;
  let acc = 0, med = 0;
  for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= n / 2) { med = b / 255; break; } }
  const thr = med + 0.08;
  const lit = new Uint8Array(n);
  let litCount = 0, dark = 0, logSum = 0;
  for (let i = 0; i < n; i++) {
    logSum += logLight(luma[i]);
    if (luma[i] < 0.06) dark++;
    if (luma[i] > thr && !(st && st[i] && ctx.sceneType !== "nightlights")) { lit[i] = 1; litCount++; }
  }
  // зв'язні області (4-сусідство), ітеративно
  const seen = new Uint8Array(n), stack = [];
  let clusters = 0, sizeSum = 0;
  for (let i = 0; i < n; i++) {
    if (!lit[i] || seen[i]) continue;
    clusters++; let size = 0;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(); size++;
      const x = j % w, y = (j - x) / w;
      if (x > 0 && lit[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; stack.push(j - 1); }
      if (x < w - 1 && lit[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && lit[j - w] && !seen[j - w]) { seen[j - w] = 1; stack.push(j - w); }
      if (y < h - 1 && lit[j + w] && !seen[j + w]) { seen[j + w] = 1; stack.push(j + w); }
    }
    sizeSum += size;
  }
  return (sh.lights = { logMean: logSum / n, litShare: litCount / n, clusters, meanSize: clusters ? sizeSum / clusters : 0, dark: dark / n });
}
registerFeature({ id: "lightLog", label: "Світло (лог-шкала)", group: "nightlights", compute: (c, sh) => lightStats(c, sh).logMean });
registerFeature({ id: "lightPoints", label: "Світлові точки", group: "nightlights", compute: (c, sh) => clamp(lightStats(c, sh).litShare * 10) });
registerFeature({ id: "lightClusters", label: "Кластери вогнів", group: "nightlights", compute: (c, sh) => clamp(lightStats(c, sh).clusters / 150) });
registerFeature({ id: "agglomeration", label: "Щільність агломерацій", group: "nightlights", compute: (c, sh) => clamp(lightStats(c, sh).meanSize / 40) });
registerFeature({ id: "darkShare", label: "Частка темряви", group: "nightlights", compute: (c, sh) => lightStats(c, sh).dark });

/* ---------- truecolor ---------- */
function trueColorStats(ctx, sh) {
  if (sh.tc) return sh.tc;
  let white = 0, green = 0, water = 0;
  for (let i = 0; i < ctx.n; i++) {
    const v = ctx.val[i], s = ctx.sat[i], hh = ctx.hue[i];
    if (v > 0.75 && s < 0.15) white++;
    else if (s > 0.2 && hh >= 60 && hh <= 160 && v > 0.15) green++;
    else if (hh >= 190 && hh <= 250 && v < 0.5 && s > 0.2) water++;
  }
  return (sh.tc = { white: white / ctx.n, green: green / ctx.n, water: water / ctx.n });
}
registerFeature({ id: "whiteness", label: "Білизна (хмари/лід)", group: "truecolor", compute: (c, sh) => trueColorStats(c, sh).white });
registerFeature({ id: "greenness", label: "Зеленість (рослинність)", group: "truecolor", compute: (c, sh) => trueColorStats(c, sh).green });
registerFeature({ id: "waterBlue", label: "Темно-синя вода", group: "truecolor", compute: (c, sh) => trueColorStats(c, sh).water });
