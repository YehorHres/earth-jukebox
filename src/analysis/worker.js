// Web Worker проходу B: обробка пікселів кожного кадру, щоб UI не зависав.
// Повідомлення: init { w, h, masks, sceneType } → frame { index, time, buffer } → result { index, features, zones }
import { buildContext } from "./frame-context.js";
import { computeFrame } from "../features/index.js";
import { smallLuma, estimateCamera } from "./region-dynamic.js";

let cfg = null, prevLuma = null, prevSmall = null;

self.onmessage = e => {
  const m = e.data;
  if (m.type === "init") {
    cfg = m; prevLuma = null; prevSmall = null;
    self.postMessage({ type: "ready" });
    return;
  }
  if (m.type === "frame") {
    try {
      const data = new Uint8ClampedArray(m.buffer);
      const ctx = buildContext(data, cfg.w, cfg.h, cfg.masks, m.continuous ? prevLuma : null, cfg.sceneType);
      const { features, zones } = computeFrame(ctx, true);
      // рух камери: глобальний масштаб/зсув відносно попереднього кадру
      const small = smallLuma(ctx.luma, cfg.w, cfg.h);
      const cam = prevSmall && m.continuous ? estimateCamera(prevSmall, small) : { scale: 1, dx: 0, dy: 0, gain: 0, motion: 0 };
      prevSmall = small;
      prevLuma = ctx.luma;
      self.postMessage({ type: "result", index: m.index, time: m.time, features, zones, cam, inside: ctx.insideCount / ctx.n });
    } catch (err) {
      self.postMessage({ type: "error", index: m.index, message: err.message });
    }
  }
};
