// Таймлайн під відео: криві ключових ознак (abs — суцільна, rel — пунктир), рівень шуму,
// мітки подій і розділів, курсор відтворення. v10 §8: шкала часу (або роки з картки), повзунок перетягується
// мишею/пальцем, підказки над мітками, role="slider" з aria-valuetext; Home/End/PageUp/PageDown.
import { getFeature } from "../features/index.js";
import { t, tr, getLang } from "../i18n/index.js";

const fmt = s => { const m = Math.floor(s / 60), ss = Math.floor(s - m * 60); return `${m}:${String(ss).padStart(2, "0")}`; };
/** Мітки шкали: роки з картки [y0, y1] або час (крок 5…120 с, ≤ 8 міток). */
export function scaleTicks(dur, years = null) {
  if (years && years[1] > years[0]) {
    const span = years[1] - years[0], step = [1, 2, 5, 10, 20, 50].find(s => span / s <= 8) || 100, out = [];
    for (let y = Math.ceil(years[0] / step) * step; y <= years[1]; y += step) out.push({ t: dur * (y - years[0]) / span, label: String(y) });
    return out;
  }
  const step = [5, 10, 15, 30, 60, 120, 300].find(s => dur / s <= 8) || 600, out = [];
  for (let s = 0; s <= dur + 1e-6; s += step) out.push({ t: s, label: fmt(s) });
  return out;
}

const COLORS = ["#f2994a", "#56ccf2", "#bb6bd9", "#6fcf97", "#f2c94c"];
const EVENT_COLORS = { peak: "#f85149", trough: "#56ccf2", thresholdCross: "#f2c94c", changePoint: "#bb6bd9", globalMax: "#ffffff", globalMin: "#8b949e", returnOfState: "#6fcf97" };

export function createTimeline(canvas, legendEl, { onSeek, tipEl } = {}) {
  let a = null, sections = null, cursor = 0, years = null, marks = [];
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
    const dpr = fit(), W = canvas.width, H0 = canvas.height, pad = 6 * dpr, top = 14 * dpr, axis = 14 * dpr, H = H0 - axis;
    g.clearRect(0, 0, W, H0);
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
    // шкала часу / років
    g.fillStyle = "#9aa4af"; g.font = `${10 * dpr}px system-ui`; g.textAlign = "center";
    for (const tk of scaleTicks(dur, years)) {
      g.fillRect(X(tk.t) - 0.5 * dpr, H, dpr, 3 * dpr);
      g.fillText(tk.label, Math.min(W - 12 * dpr, Math.max(12 * dpr, X(tk.t))), H0 - 2 * dpr);
    }
    g.textAlign = "start";
    // курсор і ручка повзунка
    g.fillStyle = "#e6edf3";
    g.fillRect(X(cursor) - dpr, 0, 2 * dpr, H);
    g.beginPath(); g.arc(X(cursor), H, 5 * dpr, 0, Math.PI * 2); g.fill();
    marks = [
      ...(sections || []).map(s => ({ t: s.t0, text: s.label })),
      ...a.events.map(e => ({ t: e.time, text: `${fmt(e.time)} — ${tr(e.text || e.type)}` })),
      ...(a.climax ? [{ t: a.climax.time, text: `★ ${fmt(a.climax.time)} — ${tr(a.climax.text)}` }] : []),
    ].map(m => ({ ...m, x: X(m.t) / dpr }));
  }

  const dur = () => a?.profile.durationSec || 0;
  const timeAt = clientX => { const r = canvas.getBoundingClientRect(), p = 6; return Math.max(0, Math.min(1, (clientX - r.left - p) / Math.max(1, r.width - 2 * p))) * dur(); };
  // перетягування: курсор рухається одразу, перехід — не частіше ніж раз на 120 мс і в кінці
  let drag = false, lastSeek = 0;
  const seek = (time, final) => {
    cursor = time; draw(); aria();
    const now = performance.now();
    if (onSeek && (final || now - lastSeek > 120)) { lastSeek = now; onSeek(time); }
  };
  canvas.addEventListener("pointerdown", e => {
    if (!a) return;
    drag = true; try { canvas.setPointerCapture(e.pointerId); } catch { /* синтетична подія — без захоплення */ } canvas.focus({ preventScroll: true });
    seek(timeAt(e.clientX), false); e.preventDefault();
  });
  canvas.addEventListener("pointermove", e => {
    if (!a) return;
    if (drag) { seek(timeAt(e.clientX), false); return; }
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left;
    const m = marks.reduce((b, q) => (Math.abs(q.x - x) < Math.abs((b?.x ?? 1e9) - x) ? q : b), null);
    showTip(m && Math.abs(m.x - x) <= 6 ? m : null, x);
  });
  const end = e => { if (!drag) return; drag = false; seek(timeAt(e.clientX), true); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", () => (drag = false));
  canvas.addEventListener("pointerleave", () => showTip(null));
  canvas.addEventListener("keydown", e => {
    if (!a) return;
    const k = { Home: 0, End: Math.max(0, dur() - 0.05), PageUp: cursor + 30, PageDown: cursor - 30 }[e.key];
    if (k === undefined) return;
    e.preventDefault(); e.stopPropagation();
    seek(Math.max(0, Math.min(dur(), k)), true);
  });
  function showTip(m, x) {
    if (!tipEl) return;
    tipEl.hidden = !m;
    if (!m) return;
    tipEl.textContent = m.text;
    tipEl.style.left = `${Math.max(0, x)}px`;
  }
  const sectionAt = time => (sections || []).find(s => time >= s.t0 && time < s.t1) || sections?.[sections.length - 1];
  function aria() {
    if (!a) return;
    const d = dur(), s = sectionAt(cursor);
    canvas.setAttribute("aria-valuemax", String(Math.round(d)));
    canvas.setAttribute("aria-valuenow", String(Math.round(cursor)));
    canvas.setAttribute("aria-valuetext", t("tl.valueText", { t: fmt(cursor), d: fmt(d), s: s ? s.label : "" }).replace(/,\s*$/, ""));
  }
  window.addEventListener("resize", draw);

  return {
    set(analysis) {
      a = analysis;
      legendEl.replaceChildren(...shown().map((f, k) => {
        const s = document.createElement("span");
        s.style.setProperty("--c", COLORS[k]);
        s.textContent = tr(a.labels?.[f] || getFeature(f)?.label || f) + (a.norm[f].significant ? "" : t("tl.noSig"));
        return s;
      }), Object.assign(document.createElement("span"), { textContent: t("tl.legendNote") }));
      draw();
    },
    setSections(s) { sections = s; draw(); aria(); },
    setCursor(time) { if (drag) return; cursor = time; draw(); aria(); },
    /** Роки з картки [початок, кінець] — шкала підписується роками. */
    setYears(y) { years = y; draw(); },
    get dragging() { return drag; },
    draw,
  };
}
