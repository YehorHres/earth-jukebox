// Джерела кадрів з єдиним інтерфейсом:
//   { kind, name, key, duration, fps, width, height, el, isStatic, seek(t) → Promise<drawable>, frameAt(t) }
// el — елемент, який показуємо користувачу (video / img / canvas).

import { makeRng } from "../util/rng.js";

const STD_FPS = [12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
const snapFps = f => STD_FPS.reduce((a, b) => (Math.abs(b - f) < Math.abs(a - f) ? b : a), 30);

const VIDEO_ERR = { 1: "завантаження перервано", 2: "мережева помилка", 3: "не вдалося декодувати", 4: "формат або джерело не підтримується" };

function loadVideoSrc(video, src) {
  return new Promise((res, rej) => {
    video.onloadeddata = () => { video.onerror = null; res(); };
    video.onerror = () => {
      const e = video.error;
      rej(new Error(e ? `${VIDEO_ERR[e.code] || "код " + e.code}${e.message ? " (" + e.message + ")" : ""}` : "невідома помилка"));
    };
    video.src = src;
    video.load();
  });
}

async function ensureDuration(video) {
  if (isFinite(video.duration) && video.duration > 0) return video.duration;
  // деякі webm не мають тривалості в заголовку — «перемотуємо в кінець», щоб її дізнатися
  await new Promise(res => {
    const h = () => { if (isFinite(video.duration)) { video.removeEventListener("durationchange", h); res(); } };
    video.addEventListener("durationchange", h);
    video.currentTime = 1e101;
  });
  return video.duration;
}

/** Оцінка fps через requestVideoFrameCallback; округлюємо до стандартного (детермінованість). */
async function estimateFps(video) {
  if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) return 30;
  const times = [];
  const done = new Promise(res => {
    const cb = (_, meta) => { times.push(meta.mediaTime); if (times.length < 12) video.requestVideoFrameCallback(cb); else res(); };
    video.requestVideoFrameCallback(cb);
    setTimeout(res, 1200);
  });
  try { video.currentTime = 0; await video.play(); } catch { return 30; }
  await done;
  video.pause();
  const d = [];
  for (let i = 1; i < times.length; i++) if (times[i] > times[i - 1]) d.push(times[i] - times[i - 1]);
  if (d.length < 3) return 30;
  d.sort((a, b) => a - b);
  return snapFps(1 / d[Math.floor(d.length / 2)]);
}

function seekVideo(video, t) {
  return new Promise(res => {
    if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) return res();
    video.addEventListener("seeked", () => res(), { once: true });
    video.currentTime = t;
  });
}

/**
 * Відео з одного з URL (пробуємо по черзі) або з File.
 * opts: { name, fps, size }
 */
export async function openVideo(srcOrFile, opts = {}) {
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto";
  video.setAttribute("aria-hidden", "true");
  video.crossOrigin = "anonymous";
  let name = opts.name, size = opts.size || 0;
  if (srcOrFile instanceof File) {
    name ??= srcOrFile.name; size = srcOrFile.size;
    const url = URL.createObjectURL(srcOrFile);
    try { await loadVideoSrc(video, url); }
    catch (e1) {
      // деякі вбудовані браузери блокують blob: для відео — пробуємо data-URL
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(srcOrFile); });
      try { await loadVideoSrc(video, dataUrl); }
      catch (e2) { throw new Error(`браузер не може відкрити відео: ${e2.message}. Спробуйте Chrome/Edge або конвертуйте в MP4 (H.264) / WebM.`); }
    }
  } else {
    const errors = [];
    let ok = false;
    // Завантажуємо файл повністю в blob: простий сервер (python -m http.server) не підтримує
    // Range-запити, і тоді браузер не дає перемотувати відео — а аналіз кадрів без цього неможливий.
    for (const src of [].concat(srcOrFile)) {
      let url = null;
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        url = URL.createObjectURL(await res.blob());
        await loadVideoSrc(video, url);
        ok = true; break;
      } catch (e) { errors.push(`${src}: ${e.message}`); if (url) URL.revokeObjectURL(url); }
    }
    if (!ok) throw new Error(`не вдалося відкрити жоден варіант відео (${errors.join("; ")})`);
    name ??= String([].concat(srcOrFile)[0]).split("/").pop();
  }
  const duration = await ensureDuration(video);
  const fps = opts.fps || await estimateFps(video);
  await seekVideo(video, 0);
  return {
    kind: "video", name, el: video, duration, fps, isStatic: false,
    width: video.videoWidth, height: video.videoHeight,
    key: `${name}|${size}|${duration.toFixed(2)}`,
    async seek(t) { await seekVideo(video, Math.max(0, Math.min(duration - 0.02, t))); return video; },
  };
}

export async function openImage(srcOrFile, opts = {}) {
  const img = new Image();
  const isFile = srcOrFile instanceof File;
  const src = isFile ? URL.createObjectURL(srcOrFile) : srcOrFile;
  if (!/^(data|blob):/.test(src)) img.crossOrigin = "anonymous";
  // onload, а не img.decode(): decode() може «зависати» у фонових вкладках
  await new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("не вдалося відкрити зображення"));
    img.src = src;
  });
  const name = opts.name || (isFile ? srcOrFile.name : String(srcOrFile).split("/").pop());
  return {
    kind: "image", name, el: img, duration: 0, fps: 1, isStatic: true,
    width: img.naturalWidth, height: img.naturalHeight,
    key: `${name}|${isFile ? srcOrFile.size : 0}|img`,
    async seek() { return img; },
  };
}

/* ---------------------------------------------------------------------------
   Синтетичні відео для тестів (розділ 8 ТЗ) — без ffmpeg, малюємо на canvas.
   Детерміновані: кадр залежить тільки від номера кадру й seed.
   --------------------------------------------------------------------------- */
const SYNTH = {
  /** Темне «нічне» відео: тьмяні вогні, кластер ледь помітно яскравішає; статичний підпис. */
  "dark-lights": { duration: 40, fps: 25, w: 480, h: 240, growth: 1 },
  /** Те саме, але без жодних змін (тільки шум стиснення). */
  "static-dark": { duration: 20, fps: 25, w: 480, h: 240, growth: 0 },
};

export function openSynthetic(id = "dark-lights", opts = {}) {
  const cfg = { ...SYNTH[id], ...opts };
  const canvas = document.createElement("canvas");
  canvas.width = cfg.w; canvas.height = cfg.h;
  canvas.setAttribute("aria-hidden", "true");
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const rnd = makeRng("synthetic:" + id);
  // фонові вогні (статичні)
  const lights = Array.from({ length: 70 }, () => ({ x: rnd() * cfg.w, y: cfg.h * (0.15 + 0.7 * rnd()), b: 0.15 + 0.35 * rnd(), r: 0.7 + 1.3 * rnd() }));
  // «місто, що росте»: кластер у правій частині, яскравість повільно зростає
  const city = Array.from({ length: 26 }, () => ({ x: cfg.w * (0.68 + 0.1 * rnd()), y: cfg.h * (0.35 + 0.15 * rnd()), b: 0.12 + 0.1 * rnd(), r: 0.8 + 1.0 * rnd(), delay: rnd() }));
  let lastFrame = -1;

  function render(t) {
    const fi = Math.round(t * cfg.fps);
    if (fi === lastFrame) return canvas;
    lastFrame = fi;
    const p = cfg.duration ? Math.min(1, t / cfg.duration) : 0;
    g.fillStyle = "rgb(4,5,10)"; g.fillRect(0, 0, cfg.w, cfg.h);
    const dot = (x, y, r, b) => {
      g.fillStyle = `rgb(${Math.round(255 * b)},${Math.round(215 * b)},${Math.round(140 * b)})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    for (const L of lights) dot(L.x, L.y, L.r, L.b);
    for (const c of city) {
      // кожна точка «вмикається» поступово; приріст яскравості ~+0.08 — ледь помітно
      const k = cfg.growth * Math.max(0, Math.min(1, (p - c.delay * 0.6) / 0.4));
      dot(c.x, c.y, c.r, c.b + 0.08 * k);
    }
    g.fillStyle = "rgb(110,110,110)"; g.font = "12px sans-serif";
    g.fillText("SYNTHETIC TEST · NIGHT LIGHTS", 8, cfg.h - 8);
    // шум стиснення: ±2/255, детермінований для кадру
    const img = g.getImageData(0, 0, cfg.w, cfg.h), d = img.data, nr = makeRng(fi * 7919 + 13);
    for (let i = 0; i < d.length; i += 4) {
      const n = Math.round((nr() - 0.5) * 4);
      d[i] = Math.max(0, d[i] + n); d[i + 1] = Math.max(0, d[i + 1] + n); d[i + 2] = Math.max(0, d[i + 2] + n);
    }
    g.putImageData(img, 0, 0);
    return canvas;
  }
  render(0);
  return {
    kind: "synthetic", name: opts.name || id, el: canvas, duration: cfg.duration, fps: cfg.fps, isStatic: false,
    width: cfg.w, height: cfg.h, key: `synthetic:${id}`,
    async seek(t) { return render(t); },
    frameAt: render,
  };
}
