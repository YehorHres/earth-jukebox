// Web Worker проходу B: обробка пікселів кожного кадру, щоб UI не зависав.
// Повідомлення: init { w, h, masks, sceneType } → frame { index, time, buffer } → result { index, features, zones }
import { buildContext } from "./frame-context.js";
import { computeFrame } from "../features/index.js";

let cfg = null, prevLuma = null;

self.onmessage = e => {
  const m = e.data;
  if (m.type === "init") {
    cfg = m; prevLuma = null;
    self.postMessage({ type: "ready" });
    return;
  }
  if (m.type === "frame") {
    try {
      const data = new Uint8ClampedArray(m.buffer);
      const ctx = buildContext(data, cfg.w, cfg.h, cfg.masks, m.continuous ? prevLuma : null, cfg.sceneType);
      const { features, zones } = computeFrame(ctx, true);
      prevLuma = ctx.luma;
      self.postMessage({ type: "result", index: m.index, time: m.time, features, zones });
    } catch (err) {
      self.postMessage({ type: "error", index: m.index, message: err.message });
    }
  }
};
