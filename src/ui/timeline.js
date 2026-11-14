// Таймлайн під відео: криві ключових ознак (abs — суцільна, rel — пунктир), рівень шуму,
// мітки подій і розділів, курсор відтворення. Клік — перехід у цей момент.
import { getFeature } from "../features/index.js";

const COLORS = ["#f2994a", "#56ccf2", "#bb6bd9", "#6fcf97", "#f2c94c"];
const EVENT_COLORS = { peak: "#f85149", trough: "#56ccf2", thresholdCross: "#f2c94c", changePoint: "#bb6bd9", globalMax: "#ffffff", globalMin: "#8b949e", returnOfState: "#6fcf97" };

export function createTimeline(canvas, legendEl, { onSeek } = {}) {
  let a = null, sections = null, cursor = 0;
  const g = canvas.getContext("2d");
  // провідна ознака першою, далі ключові (до 4 кривих)
  const shown = () => [...new Set([a.leadFeature, ...a.keyFeatures].filter(Boolean))].slice(0, 4);

  function fit() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const W = Math.max(10, Math.round(r.width * dpr)), H = Math.max(10, Math.round(r.height * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    return dpr;
  }

  function draw() {
    if (!a) return;
    const dpr = fit(), W = canvas.width, H = canvas.height, pad = 6 * dpr, top = 14 * dpr;
    g.clearRect(0, 0, W, H);
    const n = a.count, dur = a.profile.durationSec || 1;
    const X = t => pad + (W - 2 * pad) * (t / dur);
    const Y = v => H - pad - v * (H - pad - top);
    // розділи
    if (sections) {
      sections.forEach((s, k) => {
        g.fillStyle = k % 2 ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.0)";
        g.fillRect(X(s.t0), 0, X(s.t1) - X(s.t0), H);
        g.fillStyle = "#9aa4af"; g.font = `${10 * dpr}px system-ui`;
        g.fillText(s.label, X(s.t0) + 3 * dpr, 10 * dpr);
      });
    }
    // криві
    shown().forEach((f, k) => {
      const info = a.norm[f];
      const draw1 = (arr, dashed, map) => {
        g.strokeStyle = COLORS[k]; g.lineWidth = (dashed ? 1.2 : 2) * dpr;
        g.setLineDash(dashed ? [4 * dpr, 3 * dpr] : []);
        g.globalAlpha = info.significant ? 1 : 0.35;
        g.beginPath();
        for (let i = 0; i < n; i++) { const x = X(a.times[i]), y = Y(map(arr[i])); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      };
      const range = getFeature(f)?.range || [0, 1], lo = range[0], span = range[1] - range[0];
      draw1(a.abs[f], false, v => (v - lo) / span);
      draw1(a.rel[f], true, v => v);
      g.globalAlpha = 1; g.setLineDash([]);
    });
    // смуга шуму провідної ознаки (у rel-одиницях навколо 0.5)
    const mn = a.norm[shown()[0]];
    const nb = Math.min(0.5, mn.relNoise || 0);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(pad, Y(0.5 + nb), W - 2 * pad, Y(0.5 - nb) - Y(0.5 + nb));
    // події
    for (const e of a.events) {
      g.fillStyle = EVENT_COLORS[e.type] || "#fff";
      const x = X(e.time);
      if (e.type === "globalMax" || e.type === "globalMin") { g.fillRect(x - dpr, top, 2 * dpr, H - top - pad); continue; }
      g.beginPath(); g.arc(x, top + 4 * dpr, 3.5 * dpr, 0, Math.PI * 2); g.fill();
    }
    if (a.climax) {
      g.fillStyle = "#f2c94c"; g.font = `${11 * dpr}px system-ui`;
      g.fillText("★", X(a.climax.time) - 4 * dpr, top + 18 * dpr);
    }
    // курсор
    g.fillStyle = "#e6edf3";
    g.fillRect(X(cursor) - dpr, 0, 2 * dpr, H);
  }

  canvas.addEventListener("click", e => {
    if (!a || !onSeek) return;
    const r = canvas.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (a.profile.durationSec || 0));
  });
  window.addEventListener("resize", draw);

  return {
    set(analysis) {
      a = analysis;
      legendEl.replaceChildren(...shown().map((f, k) => {
        const s = document.createElement("span");
        s.style.setProperty("--c", COLORS[k]);
        s.textContent = (a.labels?.[f] || getFeature(f)?.label || f) + (a.norm[f].significant ? "" : " (без значущих змін)");
        return s;
      }), Object.assign(document.createElement("span"), { textContent: "суцільна — abs, пунктир — rel; ● події; ★ кульмінація; сіра смуга — шум" }));
      draw();
    },
    setSections(s) { sections = s; draw(); },
    setCursor(t) { cursor = t; draw(); },
    draw,
  };
}
