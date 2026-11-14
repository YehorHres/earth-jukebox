// Зчитування кадру (або його частини — області даних) в ImageData потрібної роздільності.

const cache = new Map();
function getCtx(w, h) {
  const k = `${w}x${h}`;
  if (!cache.has(k)) {
    const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    cache.set(k, c.getContext("2d", { willReadFrequently: true }));
  }
  return cache.get(k);
}

/**
 * Розмір сітки аналізу з тією ж пропорцією, що й кадр (або crop), і сталою к-стю пікселів
 * (targetW × targetW/2) — вертикальні й вузькі кадри не роздувають обчислення.
 */
export function analysisSize(source, targetW, crop = null) {
  const sw = crop ? crop.sw : source.width, sh = crop ? crop.sh : source.height;
  const aspect = sw && sh ? sw / sh : 2;
  const area = targetW * targetW / 2;
  const w = Math.max(8, Math.round(Math.sqrt(area * aspect)));
  return { w, h: Math.max(8, Math.round(area / w)) };
}

/** crop = { sx, sy, sw, sh } у пікселях джерела (необов'язково). */
export function grab(drawable, w, h, crop = null) {
  const g = getCtx(w, h);
  if (crop) { g.clearRect(0, 0, w, h); g.drawImage(drawable, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h); }
  else g.drawImage(drawable, 0, 0, w, h);
  try { return g.getImageData(0, 0, w, h); }
  catch (e) {
    if (e.name === "SecurityError")
      throw new Error("браузер не дає читати пікселі файлу, відкритого як file://. Запустіть локальний сервер " +
        "(«python tools/serve.py» або «npx serve») і відкрийте http://localhost:…");
    throw e;
  }
}
