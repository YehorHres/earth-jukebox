// Зчитування кадру в ImageData потрібної роздільності.

const cache = new Map();
function getCtx(w, h) {
  const k = `${w}x${h}`;
  if (!cache.has(k)) {
    const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    cache.set(k, c.getContext("2d", { willReadFrequently: true }));
  }
  return cache.get(k);
}

/** Розмір сітки аналізу з тією ж пропорцією, що й відео. */
export function analysisSize(source, targetW) {
  const aspect = source.width && source.height ? source.height / source.width : 0.5;
  return { w: targetW, h: Math.max(8, Math.round(targetW * aspect)) };
}

export function grab(drawable, w, h) {
  const g = getCtx(w, h);
  g.drawImage(drawable, 0, 0, w, h);
  try { return g.getImageData(0, 0, w, h); }
  catch (e) {
    if (e.name === "SecurityError")
      throw new Error("браузер не дає читати пікселі файлу, відкритого як file://. Запустіть локальний сервер " +
        "(«python -m http.server» або «npx serve») і відкрийте http://localhost:…");
    throw e;
  }
}
