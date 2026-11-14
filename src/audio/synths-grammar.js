// Синтезатори граматики звуку (v5-A): голос даних, референсний тон, тік шкали часу, ерікон.
// Чистий Web Audio — працюють офлайн і однаково в кожній темі.
export function grammarSynths({ out, mtof }) {
  return {
    /** Голос даних: чіткий «вокальний» лід; колір (хвиля, форманта) — від теми; гліссандо від попередньої ноти. */
    voice(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi), c = n.color || {};
      const end = t + Math.max(0.08, n.dur), peak = 0.42 * n.vel;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.02);
      // fade — остання нота треку: тоніка з повільним загасанням
      g.gain.setTargetAtTime(n.fade ? 0.0001 : peak * 0.85, t + (n.fade ? 0.25 : 0.02), n.fade ? n.dur / 3.5 : 0.08);
      g.gain.setTargetAtTime(0.0001, end, 0.05);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(9000, f * 7); lp.Q.value = 0.5;
      const fm = ctx.createBiquadFilter(); fm.type = "peaking"; fm.frequency.value = c.formant || 1400; fm.Q.value = 1.3; fm.gain.value = 8;
      const from = n.from && n.from !== n.midi ? mtof(n.from) : null;
      for (const [type, amp, det] of [[c.wave || "triangle", 0.55, 0], ["triangle", 0.75, 5]]) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = type; o.detune.value = det; og.gain.value = type === "sine" || type === "triangle" ? amp : amp * 0.45;
        if (from) { o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07); } else o.frequency.setValueAtTime(f, t);
        o.connect(og).connect(lp);
        o.start(t); o.stop(end + 0.4);
      }
      lp.connect(fm).connect(g).connect(out(eng, dest, t, n.pan));
    },
    /** Референсний тон / дрон-орієнтир: чистий синус із тихою октавою. */
    reftone(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi), end = t + n.dur, peak = 0.3 * n.vel, a = Math.min(0.15, n.dur / 4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, Math.max(t + a, end - a));
      g.gain.linearRampToValueAtTime(0.0001, end + 0.05);
      for (const [r, amp] of [[1, 1], [2, 0.18]]) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = "sine"; o.frequency.value = f * r; og.gain.value = amp;
        o.connect(og).connect(g); o.start(t); o.stop(end + 0.1);
      }
      g.connect(out(eng, dest, t, 0));
    },
    /** Тік шкали часу: дуже короткий клік; сильний — нижчий і довший. */
    tick(eng, dest, n, t) {
      const ctx = eng.ctx, o = ctx.createOscillator(), g = ctx.createGain(), len = n.strong ? 0.05 : 0.025;
      o.type = "sine"; o.frequency.value = n.strong ? 1400 : 2100;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16 * n.vel, t + 0.002);
      g.gain.setTargetAtTime(0.0001, t + 0.004, len / 3);
      o.connect(g).connect(out(eng, dest, t, 0));
      o.start(t); o.stop(t + len * 3);
    },
    /** Ерікон: смуга шуму й/або тон із ковзанням (n.ec = { noise: [f0, f1, Q], tone: [f0, f1, wave], dur }). Атака 3 мс. */
    earcon(eng, dest, n, t) {
      const ctx = eng.ctx, ec = n.ec || { tone: [660, 990, "triangle"], dur: 0.2 }, dur = ec.dur || 0.2;
      const g = ctx.createGain(), peak = 0.5 * n.vel;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.003);
      g.gain.setTargetAtTime(0.0001, t + dur * 0.55, dur * 0.18);
      if (ec.noise) {
        const s = ctx.createBufferSource(); s.buffer = eng.noise; s.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = ec.noise[2] || 2;
        bp.frequency.setValueAtTime(ec.noise[0], t); bp.frequency.exponentialRampToValueAtTime(ec.noise[1], t + dur);
        const ng = ctx.createGain(); ng.gain.value = 1.6;
        s.connect(bp).connect(ng).connect(g);
        s.start(t, 0.37); s.stop(t + dur * 2 + 0.1);
      }
      if (ec.tone) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = ec.tone[2] || "sine"; og.gain.value = o.type === "sine" || o.type === "triangle" ? 0.7 : 0.3;
        o.frequency.setValueAtTime(ec.tone[0], t); o.frequency.exponentialRampToValueAtTime(ec.tone[1], t + dur);
        o.connect(og).connect(g);
        o.start(t); o.stop(t + dur * 2 + 0.1);
      }
      g.connect(out(eng, dest, t, n.pan));
    },
  };
}
