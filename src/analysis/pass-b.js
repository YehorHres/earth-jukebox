// Прохід B — «детальний»: кожен кадр (адаптивна частота), пікселі обробляють Web Worker-и.
// Швидкість: відео ділимо на K відрізків; кожен має власну копію відео (власний декодер) і власний
// Worker. Результат детермінований: кадри беруться перемоткою на точні моменти, а перший кадр
// кожного відрізка «підготовлює» попередній кадр для frameDiff — як при послідовному проході.
// Нормалізацію, часові ознаки й події робить analyze.js.
import { grab, analysisSize } from "../media/frames.js";
import { buildContext } from "./frame-context.js";

/** Вирізати bbox маски (сітка mw×mh) і розтягнути до w×h (найближчий сусід). */
function cropResample(mask, mw, mh, bb, w, h) {
  const bw = bb.x1 - bb.x0 + 1, bh = bb.y1 - bb.y0 + 1, out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const my = (bb.y0 + Math.min(bh - 1, Math.floor(y * bh / h))) * mw;
    for (let x = 0; x < w; x++) out[y * w + x] = mask[my + bb.x0 + Math.min(bw - 1, Math.floor(x * bw / w))];
  }
  return out;
}
import { computeFrame } from "../features/index.js";

const ANALYSIS_W = 270;

/**
 * Скільки кадрів аналізувати: 300–800, щонайменше 4 кадри/с, не більше за fps відео.
 * Ціль — 400: перемотка відео коштує ~50–100 мс на кадр (декодер стартує з ключового кадру),
 * а для музики 6+ кадрів/с більш ніж досить (такт ≈ 2–3 с).
 */
export function planSampling(source) {
  if (source.isStatic || !source.duration) return { rate: 1, count: 1 };
  const dur = source.duration, fps = source.fps || 30;
  const all = Math.floor(dur * fps);
  if (all <= 400) return { rate: fps, count: Math.max(1, all) };       // коротке відео — кожен кадр
  // ≥ 4 кадри/с, але не більше 800 кадрів: довге відео (10 хв) проріджуємо
  const rate = Math.min(fps, Math.max(Math.min(4, 800 / dur), 400 / dur));
  return { rate, count: Math.max(1, Math.floor(dur * rate)) };
}

/** Обробник кадрів: Worker, а якщо він недоступний — у основному потоці. */
function makeProcessor(init) {
  let worker = null;
  try { worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" }); }
  catch { worker = null; }
  if (worker) {
    const pending = new Map();
    let readyRes, failed = null;
    const ready = new Promise(r => (readyRes = r));
    worker.onmessage = e => {
      const m = e.data;
      if (m.type === "ready") return readyRes(true);
      const p = pending.get(m.index);
      if (!p) return;
      pending.delete(m.index);
      m.type === "error" ? p.rej(new Error(m.message)) : p.res(m);
    };
    worker.onerror = e => {
      failed = new Error(e.message || "помилка Worker");
      readyRes(false);
      for (const p of pending.values()) p.rej(failed);
      pending.clear();
    };
    worker.postMessage({ type: "init", ...init });
    return {
      kind: "worker",
      ready,
      process(index, time, imageData, continuous) {
        if (failed) return Promise.reject(failed);
        return new Promise((res, rej) => {
          pending.set(index, { res, rej });
          const buffer = imageData.data.buffer;
          worker.postMessage({ type: "frame", index, time, buffer, continuous }, [buffer]);
        });
      },
      close() { worker.terminate(); },
    };
  }
  return inlineProcessor(init);
}

function inlineProcessor(init) {
  let prevLuma = null;
  return {
    kind: "inline",
    ready: Promise.resolve(true),
    async process(index, time, imageData, continuous) {
      const ctx = buildContext(imageData.data, init.w, init.h, init.masks, continuous ? prevLuma : null, init.sceneType);
      const r = computeFrame(ctx, true);
      prevLuma = ctx.luma;
      return { index, time, ...r };
    },
    close() {},
  };
}

export async function passB(source, profile, { onProgress = () => {}, signal, parallel } = {}) {
  // аналізуємо лише область даних (bbox): рамки, космос, шкала й чорні смуги не потрапляють у кадр аналізу
  const reg = profile.region, mw = profile.maskW, mh = profile.maskH;
  const bb = reg && !reg.full ? reg.bbox : { x0: 0, y0: 0, x1: mw - 1, y1: mh - 1 };
  const sx = source.width / mw, sy = source.height / mh;
  const crop = reg && !reg.full ? { sx: bb.x0 * sx, sy: bb.y0 * sy, sw: (bb.x1 - bb.x0 + 1) * sx, sh: (bb.y1 - bb.y0 + 1) * sy } : null;
  const { w, h } = analysisSize(source, ANALYSIS_W, crop);
  const masks = {};
  for (const k of ["staticMask", "landMask", "bgMask", "overlayMask", "regionMask"])
    if (profile[k]) masks[k] = cropResample(profile[k], mw, mh, bb, w, h);
  masks.scaleRefs = profile.scale?.found ? Float32Array.from(profile.scale.refs.flat()) : null;
  if (reg?.disk) {
    const kx = w / (bb.x1 - bb.x0 + 1), ky = h / (bb.y1 - bb.y0 + 1);
    masks.disk = { cx: (reg.disk.cx - bb.x0) * kx, cy: (reg.disk.cy - bb.y0) * ky, r: reg.disk.r * kx };
  }
  const { rate, count } = planSampling(source);
  const init = { w, h, masks, sceneType: profile.sceneType };
  const timeOf = i => (source.isStatic ? 0 : Math.min(source.duration - 0.02, i / rate));

  // скільки паралельних відрізків
  const cores = navigator.hardwareConcurrency || 4;
  const K = source.fork && count >= 64 ? Math.max(1, Math.min(parallel ?? 4, Math.floor(cores / 2) || 1, Math.floor(count / 32))) : 1;
  const frames = new Array(count);
  let done = 0;
  const t0 = performance.now();
  let kind = "worker";

  async function runSegment(k) {
    const s0 = Math.floor(k * count / K), s1 = Math.floor((k + 1) * count / K);
    const reader = k === 0 ? { seek: t => source.seek(t), close() {} } : await source.fork();
    let proc = makeProcessor(init);
    if (!(await proc.ready)) { proc.close(); proc = inlineProcessor(init); }
    if (proc.kind === "inline") kind = "inline";
    const inflight = [];
    try {
      // попередній кадр відрізка лише «підготовлює» prevLuma
      if (s0 > 0) await proc.process(-1, timeOf(s0 - 1), grab(await reader.seek(timeOf(s0 - 1)), w, h, crop), true);
      for (let i = s0; i < s1; i++) {
        if (signal?.aborted) throw new DOMException("скасовано", "AbortError");
        const img = grab(await reader.seek(timeOf(i)), w, h, crop);
        // поки Worker рахує цей кадр, відрізок уже перемотує на наступний
        inflight.push(proc.process(i, timeOf(i), img, true).then(r => {
          frames[r.index] = { time: r.time, features: r.features, zones: r.zones };
          done++;
          if (done % 8 === 0 || done === count) onProgress(done / count, done, count);
        }));
        if (inflight.length >= 3) await inflight.shift();
      }
      await Promise.all(inflight);
    } finally {
      proc.close(); reader.close();
    }
  }

  await Promise.all(Array.from({ length: K }, (_, k) => runSegment(k)));
  return { frames, rate, count, w, h, crop, processor: `${kind}×${K}`, seconds: (performance.now() - t0) / 1000 };
}
