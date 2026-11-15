// Синтетичні тестові відео для стійкості (етап 10): у кожного відома «справжня» область даних (truth),
// очікувана форма й наявність шкали. Малюються на canvas, детерміновано (кадр → номер кадру).

const heat = v => `hsl(${Math.round(240 * (1 - Math.max(0, Math.min(1, v))))}, 90%, 50%)`;

/** Плоска «теплова карта» в прямокутнику: смуги тепла за широтою + рухомі теплі плями + сірі «континенти». */
function drawHeatMap(g, x, y, w, h, t, { dark = false, pale = false } = {}) {
  for (let k = 0; k < h; k += 2) {
    const lat = 1 - Math.abs((k + 1) / h - 0.5) * 2;
    let v = 0.15 + 0.7 * lat + 0.1 * Math.sin(t * 0.7 + k * 0.05);
    g.fillStyle = pale ? `hsl(${Math.round(240 * (1 - v))}, 35%, 85%)` : dark ? `hsl(${Math.round(240 * (1 - v))}, 70%, 22%)` : heat(v);
    g.fillRect(x, y + k, w, 2);
  }
  // тепла пляма, що рухається на схід і пульсує
  const bx = x + ((0.2 + 0.05 * t) % 1) * w, by = y + h * 0.45, br = h * (0.08 + 0.03 * Math.sin(t));
  g.fillStyle = pale ? "hsl(10, 40%, 80%)" : heat(1); g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
  // «континенти» (статичні, сірі)
  g.fillStyle = pale ? "rgb(200,200,200)" : "rgb(95,95,95)";
  g.fillRect(x + w * 0.15, y + h * 0.2, w * 0.12, h * 0.45);
  g.fillRect(x + w * 0.55, y + h * 0.15, w * 0.2, h * 0.3);
}

function drawScale(g, x, y, w, h) {
  for (let k = 0; k < h; k++) { g.fillStyle = heat(1 - k / (h - 1)); g.fillRect(x, y + k, w, 1); }   // знизу синій, згори червоний
}

export const SCENES = {
  globe: {
    w: 480, h: 270, duration: 12, fps: 10, shape: "disk",
    disk: () => ({ cx: 240, cy: 135, r: Math.sqrt(480 * 270 / 3 / Math.PI) }),
    draw(g, t, W, H) {
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#ccc"; for (let k = 0; k < 30; k++) g.fillRect((k * 97) % W, (k * 53) % H, 1, 1);   // статичні зорі
      const { cx, cy, r } = this.disk();
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
      drawHeatMap(g, cx - r, cy - r, 2 * r, 2 * r, t);
      g.restore();
    },
    truth(x, y) { const { cx, cy, r } = this.disk(); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; },
  },
  "globe-night": {
    w: 480, h: 270, duration: 12, fps: 10, shape: "disk", scene: "nightlights",
    disk: () => ({ cx: 240, cy: 135, r: Math.sqrt(480 * 270 / 3 / Math.PI) }),
    draw(g, t, W, H) {
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      const { cx, cy, r } = this.disk();
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
      g.fillStyle = "rgb(14,20,40)"; g.fillRect(cx - r, cy - r, 2 * r, 2 * r);                    // нічна сторона: темно-синя
      for (let k = 0; k < 120; k++) {
        const a = (k * 2.399) % (Math.PI * 2), d = Math.sqrt((k * 0.61803) % 1) * r * 0.95;
        const b = 0.35 + 0.4 * ((k * 0.37) % 1) + (k % 7 === 0 ? 0.25 * Math.sin(t) : 0);
        g.fillStyle = `rgb(${Math.round(255 * b)},${Math.round(210 * b)},${Math.round(130 * b)})`;
        g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 2);
      }
      g.restore();
    },
    truth(x, y) { const { cx, cy, r } = this.disk(); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; },
  },
  flatmap: {
    w: 480, h: 240, duration: 12, fps: 10, shape: "full",
    draw(g, t, W, H) { drawHeatMap(g, 0, 0, W, H, t); },
    truth: () => true,
  },
  "map-scale": {
    w: 640, h: 360, duration: 12, fps: 10, shape: "rect", scale: true,
    rect: [60, 60, 480, 240],
    draw(g, t, W, H) {
      g.fillStyle = "rgb(24,24,28)"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#fff"; g.font = "bold 22px sans-serif"; g.fillText("Sea Surface Temperature 2005", 60, 38);
      g.fillStyle = "rgb(30,90,200)"; g.fillRect(16, 316, 34, 34); g.fillStyle = "#fff"; g.font = "10px sans-serif"; g.fillText("NASA", 20, 337);
      const [x, y, w, h] = this.rect;
      drawHeatMap(g, x, y, w, h, t);
      drawScale(g, 580, 70, 14, 220);
      g.fillStyle = "#ddd"; g.font = "11px sans-serif"; g.fillText("30°C", 598, 78); g.fillText("0°C", 598, 290);
    },
    truth(x, y) { const [rx, ry, w, h] = this.rect; return x >= rx && x < rx + w && y >= ry && y < ry + h; },
  },
  bars: {
    w: 640, h: 360, duration: 12, fps: 10, shape: "rect",
    draw(g, t, W, H) { g.fillStyle = "#000"; g.fillRect(0, 0, W, H); drawHeatMap(g, 0, 20, 640, 320, t); },
    truth: (x, y) => y >= 20 && y < 340,
  },
  dark: {
    w: 480, h: 240, duration: 12, fps: 10, shape: "full", scene: "nightlights",
    draw(g, t, W, H) {
      g.fillStyle = "rgb(3,4,8)"; g.fillRect(0, 0, W, H);
      for (let k = 0; k < 150; k++) {
        const b = 0.2 + 0.4 * ((k * 0.37) % 1) + (k < 20 ? 0.1 * t / 12 : 0);
        g.fillStyle = `rgb(${Math.round(255 * b)},${Math.round(215 * b)},${Math.round(140 * b)})`;
        g.fillRect((k * 131) % W, 20 + (k * 71) % (H - 40), 2, 2);
      }
    },
    truth: () => true,
  },
  bright: {
    w: 480, h: 240, duration: 12, fps: 10, shape: "full",
    draw(g, t, W, H) { drawHeatMap(g, 0, 0, W, H, t, { pale: true }); },
    truth: () => true,
  },
  short: {
    w: 480, h: 240, duration: 3, fps: 25, shape: "full",
    draw(g, t, W, H) { drawHeatMap(g, 0, 0, W, H, t * 4); },
    truth: () => true,
  },
  long: {
    w: 320, h: 160, duration: 600, fps: 25, shape: "full",
    draw(g, t, W, H) { drawHeatMap(g, 0, 0, W, H, t / 20); },
    truth: () => true,
  },
  vertical: {
    w: 270, h: 480, duration: 12, fps: 10, shape: "rect",
    rect: [35, 60, 200, 360],
    draw(g, t, W, H) {
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#fff"; g.font = "16px sans-serif"; g.fillText("Arctic", 100, 36);
      const [x, y, w, h] = this.rect; drawHeatMap(g, x, y, w, h, t);
    },
    truth(x, y) { const [rx, ry, w, h] = this.rect; return x >= rx && x < rx + w && y >= ry && y < ry + h; },
  },
  chart: {
    w: 480, h: 270, duration: 12, fps: 10, shape: "any",
    draw(g, t, W, H) {
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
      g.strokeStyle = "#222"; g.lineWidth = 2; g.beginPath(); g.moveTo(40, 20); g.lineTo(40, 240); g.lineTo(460, 240); g.stroke();
      g.strokeStyle = "rgb(220,40,40)"; g.lineWidth = 3; g.beginPath();
      const n = Math.max(2, Math.round(2 + 40 * t / 12));
      for (let k = 0; k < n; k++) { const x = 40 + k * 10, y = 230 - k * 4 - 20 * Math.sin(k * 0.6); k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      g.fillStyle = "#000"; g.font = "13px sans-serif"; g.fillText("CO₂, ppm", 50, 16);
    },
    truth: () => true,
  },
  // ---- v4-15: «справжні» відео учасників ----
  // глобальна карта з чорними смугами згори/знизу, горизонтальною шкалою в нижній смузі й датою, що міняється
  "letterbox-date": {
    w: 640, h: 360, duration: 12, fps: 10, shape: "rect", date: [8, 46, 150, 70],
    draw(g, t, W, H) {
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      drawHeatMap(g, 0, 40, 640, 280, t);
      for (let k = 0; k < 200; k++) { g.fillStyle = heat(k / 199); g.fillRect(220 + k, 332, 1, 12); }
      const f = Math.round(t * this.fps), day = 1 + (f % 28), mon = 1 + Math.floor(f / 28) % 12;
      g.fillStyle = "#fff"; g.font = "bold 18px sans-serif";
      g.fillText(`2005-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`, 12, 64);
    },
    truth(x, y) { const [x0, y0, x1, y1] = this.date; return y >= 40 && y < 320 && !(x >= x0 && x < x1 && y >= y0 && y < y1); },
  },
  // карта «країни» на чорному; з 4-ї по 6-ту секунду камера наближається (×1.04 за кадр)
  "country-zoom": {
    w: 480, h: 270, duration: 12, fps: 10, shape: "any", zoom: [4, 6],
    scaleAt(t) { const [a, b] = this.zoom, k = Math.round((Math.min(b, Math.max(a, t)) - a) * this.fps); return 1.04 ** k; },
    draw(g, t, W, H) {
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      const s = this.scaleAt(t);
      g.save(); g.translate(W / 2, H / 2); g.scale(s, s); g.translate(-W / 2, -H / 2);
      g.beginPath(); g.ellipse(W / 2, H / 2, 110, 60, 0, 0, 7); g.clip();
      drawHeatMap(g, W / 2 - 110, H / 2 - 60, 220, 120, t);
      g.restore();
    },
    // область — уся «країна» при найбільшому наближенні (об'єднання по кадрах)
    truth(x, y) { const s = this.scaleAt(99); return ((x - this.w / 2) / (110 * s)) ** 2 + ((y - this.h / 2) / (60 * s)) ** 2 <= 1; },
  },
  // білі полярні смуги — це лід (дані), а не рамка; межа льоду рухається
  "polar-white": {
    w: 640, h: 360, duration: 12, fps: 10, shape: "full",
    draw(g, t, W, H) {
      drawHeatMap(g, 0, 0, W, H, t);
      g.fillStyle = "rgb(240,244,248)";
      for (let x = 0; x < W; x += 4) {
        const top = 36 + 10 * Math.sin(x * 0.03 + t * 0.6), bot = 30 + 8 * Math.cos(x * 0.025 - t * 0.5);
        g.fillRect(x, 0, 4, top); g.fillRect(x, H - bot, 4, bot);
      }
    },
    truth: () => true,
  },
};

/* ---------- v7: типи руху (обертовий глобус, панорама над статичною картою) ---------- */
const hsl2rgb = (hDeg, sat, li) => {
  const a = sat * Math.min(li, 1 - li), f = n => { const k = (n + hDeg / 30) % 12; return li - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
};
/** «Дані» глобуса: значення 0..1 за довготою й широтою (радіани) — велика хвиля за довготою + дрібна текстура. */
export const globeValue = (lon, lat) => Math.max(0, Math.min(1, 0.5 + 0.35 * Math.sin(lon) + 0.1 * Math.sin(5 * lon + 3 * lat) + 0.07 * Math.cos(9 * lat - 4 * lon)));

Object.assign(SCENES, {
  // глобус обертається (один оберт за відео), дані на ньому НЕ змінюються
  "rotating-globe": {
    w: 480, h: 270, duration: 24, fps: 10, shape: "disk", turns: 1,
    disk: () => ({ cx: 240, cy: 135, r: 110 }),
    /** довгота меридіана в центрі диска в момент t */
    lon0(t) { return -2 * Math.PI * this.turns * t / this.duration; },
    draw(g, t, W, H) {
      const { cx, cy, r } = this.disk();
      if (!this._geo) {
        const px = [];
        for (let y = Math.ceil(cy - r); y <= cy + r; y++) for (let x = Math.ceil(cx - r); x <= cx + r; x++) {
          const u = (x - cx) / r, v = (cy - y) / r, q = 1 - u * u - v * v;
          if (q >= 0) px.push([y * W + x, Math.atan2(u, Math.sqrt(q)), Math.asin(v)]);
        }
        this._geo = px;
      }
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#ccc"; for (let k = 0; k < 30; k++) g.fillRect((k * 97) % W, (k * 53) % H, 1, 1);
      const img = g.getImageData(0, 0, W, H), d = img.data, l0 = this.lon0(t);
      for (const [i, dl, lat] of this._geo) {
        const [R, G, B] = hsl2rgb(240 * (1 - globeValue(l0 + dl, lat)), 0.9, 0.5);
        d[4 * i] = R; d[4 * i + 1] = G; d[4 * i + 2] = B; d[4 * i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    },
    truth(x, y) { const { cx, cy, r } = this.disk(); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; },
  },
  // камера їде над статичною картою (3 px за кадр на схід, 0.5 px на південь); дані НЕ змінюються
  "pan-map": {
    w: 480, h: 240, duration: 12, fps: 10, shape: "full",
    draw(g, t, W, H) {
      if (!this._map) {
        const m = document.createElement("canvas"); m.width = 1200; m.height = 480;
        const q = m.getContext("2d");
        for (let k = 0; k < 480; k += 2) { q.fillStyle = heat(0.2 + 0.6 * (1 - Math.abs((k + 1) / 480 - 0.5) * 2)); q.fillRect(0, k, 1200, 2); }
        for (let k = 0; k < 90; k++) {
          q.fillStyle = heat(((k * 0.61803) % 1));
          q.beginPath(); q.arc((k * 173) % 1200, (k * 97) % 480, 14 + (k * 7) % 30, 0, 7); q.fill();
        }
        q.fillStyle = "rgb(95,95,95)"; q.fillRect(260, 120, 150, 190); q.fillRect(760, 60, 220, 150);
        this._map = m;
      }
      const f = Math.round(t * this.fps);
      g.drawImage(this._map, 3 * f, Math.round(0.5 * f), W, H, 0, 0, W, H);
    },
    truth: () => true,
  },
});

/* ---------- v7 §2: шкали без легенди (зелена, viridis) — карта на місці, дані змінюються ---------- */
const lerp3 = (a, b, t) => a.map((x, k) => Math.round(x + (b[k] - x) * t));
const VIRIDIS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
/** Палітри тестових сцен: значення 0..1 → [r, g, b]. */
export const PALETTES = {
  green: v => lerp3([8, 48, 20], [196, 255, 176], Math.max(0, Math.min(1, v))),
  viridis: v => { const x = Math.max(0, Math.min(0.9999, v)) * 4, k = Math.floor(x); return lerp3(VIRIDIS[k], VIRIDIS[k + 1], x - k); },
};
function drawValueMap(g, W, H, t, color) {
  const css = v => { const [r, gg, b] = color(v); return `rgb(${r},${gg},${b})`; };
  for (let k = 0; k < H; k += 2) {
    const lat = 1 - Math.abs((k + 1) / H - 0.5) * 2;
    for (let x = 0; x < W; x += 8) { g.fillStyle = css(0.1 + 0.6 * lat + 0.12 * Math.sin(t * 0.7 + k * 0.05 + x * 0.02)); g.fillRect(x, k, 8, 2); }
  }
  // пляма високих значень: рухається на схід і росте до середини відео
  const grow = 0.06 + 0.1 * Math.sin(Math.PI * Math.min(1, t / 12));
  g.fillStyle = css(1); g.beginPath(); g.arc(((0.15 + 0.06 * t) % 1) * W, H * 0.5, H * grow, 0, 7); g.fill();
  g.fillStyle = css(0.85); g.beginPath(); g.arc(W * 0.7, H * 0.3, H * (0.05 + 0.6 * grow), 0, 7); g.fill();
}
Object.assign(SCENES, {
  "green-map": { w: 480, h: 240, duration: 12, fps: 10, shape: "full", palette: "green", draw(g, t, W, H) { drawValueMap(g, W, H, t, PALETTES.green); }, truth: () => true },
  "viridis-map": { w: 480, h: 240, duration: 12, fps: 10, shape: "full", palette: "viridis", draw(g, t, W, H) { drawValueMap(g, W, H, t, PALETTES.viridis); }, truth: () => true },
});
