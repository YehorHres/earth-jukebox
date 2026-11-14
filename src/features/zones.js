// Просторові масштаби: сітка 16×8, колонки (кроки мелодії), широтні пояси, півкулі.
// Значення в зоні — «головна величина» пікселя для типу сцени.
import { logLight } from "./scene.js";

export const COLS = 16, ROWS = 8;
// широтні пояси для рівнокутної карти: 90–60 / 60–30 / 30N–30S / 30–60 / 60–90
export const BANDS = [
  { id: "polarN", label: "полярний північ", y0: 0, y1: 1 / 6 },
  { id: "temperateN", label: "помірний північ", y0: 1 / 6, y1: 1 / 3 },
  { id: "tropics", label: "тропіки", y0: 1 / 3, y1: 2 / 3 },
  { id: "temperateS", label: "помірний південь", y0: 2 / 3, y1: 5 / 6 },
  { id: "polarS", label: "полярний південь", y0: 5 / 6, y1: 1 },
];

/** Головна величина пікселя: 0..1 або -1 (немає даних). */
export function pixelValue(ctx, i) {
  if (!ctx.isData[i]) return -1;
  if (ctx.sceneType === "heatmap" || (ctx.sceneType === "mixed" && ctx.ramp[i] >= 0)) return ctx.ramp[i];
  if (ctx.sceneType === "nightlights") return logLight(ctx.luma[i]);
  return ctx.luma[i];
}

export function computeZones(ctx) {
  const { w, h } = ctx;
  const gSum = new Float32Array(COLS * ROWS), gCnt = new Uint32Array(COLS * ROWS), gAct = new Float32Array(COLS * ROWS);
  const bSum = new Float32Array(BANDS.length), bCnt = new Uint32Array(BANDS.length);
  const bandOfRow = new Uint8Array(h);
  for (let y = 0; y < h; y++) { const fy = (y + 0.5) / h; bandOfRow[y] = BANDS.findIndex(b => fy >= b.y0 && fy < b.y1); }
  let wS = 0, wC = 0, eS = 0, eC = 0;
  for (let y = 0; y < h; y++) {
    const gy = Math.min(ROWS - 1, Math.floor(y * ROWS / h)), band = bandOfRow[y];
    for (let x = 0; x < w; x++) {
      const i = y * w + x, gx = Math.min(COLS - 1, Math.floor(x * COLS / w)), c = gy * COLS + gx;
      if (ctx.prevLuma) gAct[c] += Math.abs(ctx.luma[i] - ctx.prevLuma[i]);
      const v = pixelValue(ctx, i);
      if (v < 0) continue;
      gSum[c] += v; gCnt[c]++;
      bSum[band] += v; bCnt[band]++;
      if (x < w / 2) { wS += v; wC++; } else { eS += v; eC++; }
    }
  }
  const cellArea = (w / COLS) * (h / ROWS);
  const grid = Array.from(gSum, (s, c) => (gCnt[c] ? s / gCnt[c] : null));
  const gridCover = Array.from(gCnt, c => c / cellArea);
  const activity = Array.from(gAct, a => a / cellArea);
  const cols = [], colsCover = [];
  for (let x = 0; x < COLS; x++) {
    let s = 0, n = 0;
    for (let y = 0; y < ROWS; y++) { const c = y * COLS + x; s += gSum[c]; n += gCnt[c]; }
    const cover = n / (cellArea * ROWS);
    colsCover.push(cover);
    cols.push(n ? s / n : null);   // паузи (суша/фон) вирішує мапер за colsCover відносно всього відео
  }
  const bands = {};
  BANDS.forEach((b, k) => (bands[b.id] = bCnt[k] ? bSum[k] / bCnt[k] : null));
  return {
    cols, colsCover, grid, gridCover, activity, bands,
    hemi: { west: wC ? wS / wC : null, east: eC ? eS / eC : null },
  };
}
