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
};
