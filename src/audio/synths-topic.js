// Синтезатори для звукових профілів тем (етап 9): саб-бас, грім, вітер, дощ, тріск, хвилі, повітря,
// гранулярна текстура, орган, туба, хор, скло, FM-дзвони, маримба, калімба, кларнет, фагот,
// піцикато, тремоло струнних, флажолети, теплий/холодний пед, малий барабан.
// Отримує допоміжні функції від instruments.js (без циклічних імпортів).

export function topicSynths({ out, env, osc, vibrato, mtof, bell }) {
  const noiseSrc = (eng, t, stop, loop = true) => {
    const s = eng.ctx.createBufferSource(); s.buffer = eng.noise; s.loop = loop;
    s.start(t, (t * 1.37) % 1.5); s.stop(stop);
    return s;
  };
  const panner = (eng, dest, t, n) => {
    const p = out(eng, dest, t, n.pan);
    if (n.panTo !== undefined && n.panTo !== n.pan) p.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, n.panTo)), t + n.dur);
    return p;
  };
  // безперервна текстура: огинаюча з плавним входом/виходом на весь такт
  const texEnv = (ctx, t, n, level, fade = 0.4) => {
    const g = ctx.createGain(), end = t + n.dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level * n.vel, t + Math.min(fade, n.dur / 3));
    g.gain.setValueAtTime(level * n.vel, Math.max(t + fade, end - fade));
    g.gain.linearRampToValueAtTime(0.0001, end + 0.05);
    return { g, stop: end + 0.1 };
  };

  return {
    /* ---------- тембри (ноти) ---------- */
    subbass(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi);
      const { g, stop } = env(ctx, t, { a: 0.08, d: 0.5, s: 0.9, r: 0.8, dur: n.dur, peak: 0.55 * n.vel });
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 160;
      lp.connect(g).connect(out(eng, dest, t, 0));
      osc(ctx, "sine", f, t, stop).connect(lp);
      const o2 = osc(ctx, "triangle", f * 2, t, stop), g2 = ctx.createGain(); g2.gain.value = 0.2; o2.connect(g2).connect(lp);
    },
    tuba(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi);
      const { g, stop } = env(ctx, t, { a: 0.06, d: 0.3, s: 0.85, r: 0.3, dur: n.dur, peak: 0.3 * n.vel });
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1;
      lp.frequency.setValueAtTime(250, t); lp.frequency.linearRampToValueAtTime(450 + 400 * n.vel, t + 0.1);
      lp.connect(g).connect(out(eng, dest, t, n.pan));
      osc(ctx, "sawtooth", f, t, stop).connect(lp);
      const s = osc(ctx, "sine", f, t, stop), sg = ctx.createGain(); sg.gain.value = 0.5; s.connect(sg).connect(lp);
    },
    organ(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi);
      const { g, stop } = env(ctx, t, { a: 0.08, d: 0.2, s: 0.95, r: 0.35, dur: n.dur, peak: 0.07 * n.vel });
      g.connect(out(eng, dest, t, n.pan));
      // регістри органу: 8', 4', 2 2/3'
      for (const [r, a] of [[1, 1], [2, 0.5], [3, 0.25], [0.5, 0.45]]) { const o = osc(ctx, "sine", f * r, t, stop), og = ctx.createGain(); og.gain.value = a; o.connect(og).connect(g); }
    },
    choir(eng, dest, n, t) {
      // формантний «а»: пилка через три смугові фільтри
      const ctx = eng.ctx, f = mtof(n.midi);
      const { g, stop } = env(ctx, t, { a: 0.4, d: 0.5, s: 0.9, r: 0.9, dur: n.dur, peak: 0.16 * n.vel });
      g.connect(out(eng, dest, t, n.pan));
      const mix = ctx.createGain();
      for (const [ff, q, a] of [[700, 6, 1], [1150, 8, 0.6], [2600, 10, 0.3]]) { const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = ff; bp.Q.value = q; const bg = ctx.createGain(); bg.gain.value = a; mix.connect(bp).connect(bg).connect(g); }
      for (const det of [-9, 0, 8]) { const o = osc(ctx, "sawtooth", f, t, stop, det); vibrato(ctx, o, t, stop, 5 + det * 0.03, 8, 0.3); o.connect(mix); }
    },
    warmpad(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi);
      const { g, stop } = env(ctx, t, { a: 0.8, d: 0.6, s: 0.9, r: 1.4, dur: n.dur, peak: 0.08 * n.vel });
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
      lp.connect(g).connect(out(eng, dest, t, n.pan));
      for (const det of [-12, 0, 11]) osc(ctx, "triangle", f, t, stop, det).connect(lp);
    },
    glasspad(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi);
      const { g, stop } = env(ctx, t, { a: 0.6, d: 0.6, s: 0.8, r: 1.6, dur: n.dur, peak: 0.07 * n.vel });
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 500;
      hp.connect(g).connect(out(eng, dest, t, n.pan));
      osc(ctx, "sine", f * 2, t, stop, 5).connect(hp);
      const o2 = osc(ctx, "sine", f * 3, t, stop, -4), g2 = ctx.createGain(); g2.gain.value = 0.4; o2.connect(g2).connect(hp);
      osc(ctx, "triangle", f, t, stop).connect(hp);
    },
    tremolo(eng, dest, n, t) {
      // тремоло струнних: пилка з амплітудною модуляцією ~9 Гц
      const ctx = eng.ctx, f = mtof(n.midi);
      const { g, stop } = env(ctx, t, { a: 0.2, d: 0.4, s: 0.85, r: 0.6, dur: n.dur, peak: 0.1 * n.vel });
      const am = ctx.createGain(); am.gain.value = 0.6;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 9 + n.vel * 4; lg.gain.value = 0.4;
      lfo.connect(lg).connect(am.gain); lfo.start(t); lfo.stop(stop);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
      lp.connect(am).connect(g).connect(out(eng, dest, t, n.pan));
      for (const det of [-7, 6]) osc(ctx, "sawtooth", f, t, stop, det).connect(lp);
    },
    pizz(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi);
      const g = ctx.createGain(), stop = t + 0.9;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28 * n.vel, t + 0.003); g.gain.setTargetAtTime(0.0001, t + 0.004, 0.12);
      const bp = ctx.createBiquadFilter(); bp.type = "lowpass"; bp.frequency.setValueAtTime(2500, t); bp.frequency.exponentialRampToValueAtTime(600, t + 0.2);
      bp.connect(g).connect(out(eng, dest, t, n.pan));
      osc(ctx, "triangle", f, t, stop).connect(bp);
      const o2 = osc(ctx, "sawtooth", f, t, stop), g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2).connect(bp);
    },
    marimba(eng, dest, n, t) { bell(eng, dest, n, t, [[1, 1], [4.0, 0.12], [10, 0.03]], 0.45, 0.32); },
    kalimba(eng, dest, n, t) { bell(eng, dest, n, t, [[1, 1], [5.4, 0.15], [13.3, 0.05]], 0.7, 0.26); },
    glass(eng, dest, n, t) { bell(eng, dest, { ...n, midi: n.midi + 12 }, t, [[1, 1], [2.32, 0.4], [4.25, 0.2], [6.63, 0.08]], 2.2, 0.12); },
    harmonics(eng, dest, n, t) {
      // флажолети: чистий високий тон з м'якою атакою
      const ctx = eng.ctx, f = mtof(n.midi + 12);
      const { g, stop } = env(ctx, t, { a: 0.05, d: 0.3, s: 0.7, r: 0.6, dur: n.dur, peak: 0.12 * n.vel });
      g.connect(out(eng, dest, t, n.pan));
      const o = osc(ctx, "sine", f, t, stop); vibrato(ctx, o, t, stop, 5.5, 4, 0.3); o.connect(g);
    },
    fmbell(eng, dest, n, t) {
      // FM-дзвін: модулятор із неціле співвідношення частот, індекс спадає
      const ctx = eng.ctx, f = mtof(n.midi), stop = t + 4;
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      car.frequency.value = f; mod.frequency.value = f * 3.5;
      mg.gain.setValueAtTime(f * 4, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 2.5);
      mod.connect(mg).connect(car.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14 * n.vel, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.01, 0.9);
      car.connect(g).connect(out(eng, dest, t, n.pan));
      car.start(t); mod.start(t); car.stop(stop); mod.stop(stop);
    },
    clarinet(eng, dest, n, t) {
      // кларнет: непарні гармоніки — квадратна хвиля через м'який фільтр
      const ctx = eng.ctx, f = mtof(n.midi);
      const { g, stop } = env(ctx, t, { a: 0.05, d: 0.2, s: 0.85, r: 0.2, dur: n.dur, peak: 0.1 * n.vel });
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1800; lp.Q.value = 0.7;
      lp.connect(g).connect(out(eng, dest, t, n.pan));
      const o = osc(ctx, "square", f, t, stop); vibrato(ctx, o, t, stop, 4.8, 3, 0.4); o.connect(lp);
    },
    bassoon(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi);
      const { g, stop } = env(ctx, t, { a: 0.05, d: 0.2, s: 0.8, r: 0.2, dur: n.dur, peak: 0.16 * n.vel });
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 1.2;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400;
      bp.connect(lp).connect(g).connect(out(eng, dest, t, n.pan));
      osc(ctx, "sawtooth", f, t, stop).connect(bp);
      const s = osc(ctx, "triangle", f, t, stop); s.connect(lp);
    },
    snare(eng, dest, n, t) {
      const ctx = eng.ctx, s = noiseSrc(eng, t, t + 0.2, false);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25 * n.vel, t + 0.003); g.gain.setTargetAtTime(0.0001, t + 0.01, 0.05);
      s.connect(bp).connect(g).connect(out(eng, dest, t, 0.1));
    },
    thunder(eng, dest, n, t) {
      // грім: низький шум, що «котиться» (кілька спадів), + саб-удар
      const ctx = eng.ctx, dur = Math.max(1.5, n.dur), stop = t + dur + 0.5;
      const s = noiseSrc(eng, t, stop);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(90, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.9 * n.vel, t + 0.02); g.gain.setTargetAtTime(0.35 * n.vel, t + 0.05, 0.15);
      g.gain.linearRampToValueAtTime(0.6 * n.vel, t + dur * 0.35); g.gain.setTargetAtTime(0.0001, t + dur * 0.4, dur / 4);
      const dst = out(eng, dest, t, n.pan);
      s.connect(lp).connect(g).connect(dst);
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.6 * n.vel, t + 0.01); og.gain.setTargetAtTime(0.0001, t + 0.05, 0.25);
      o.connect(og).connect(dst); o.start(t); o.stop(t + 1.5);
    },

    /* ---------- етап 11: ще тембри ---------- */
    handpan(eng, dest, n, t) { bell(eng, dest, n, t, [[1, 1], [2, 0.35], [2.98, 0.12], [4.1, 0.05]], 2.4, 0.2); },
    lead(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi);
      const { g, stop } = env(ctx, t, { a: 0.02, d: 0.2, s: 0.7, r: 0.25, dur: n.dur, peak: 0.08 * n.vel });
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 4;
      lp.frequency.setValueAtTime(2500, t); lp.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
      lp.connect(g).connect(out(eng, dest, t, n.pan));
      const o = osc(ctx, "square", f, t, stop, 4); vibrato(ctx, o, t, stop, 5.5, 10, 0.3); o.connect(lp);
      osc(ctx, "sawtooth", f, t, stop, -5).connect(lp);
    },
    pluck(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi), stop = t + 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * n.vel, t + 0.003); g.gain.setTargetAtTime(0.0001, t + 0.004, 0.15);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 6; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
      lp.connect(g).connect(out(eng, dest, t, n.pan));
      osc(ctx, "sawtooth", f, t, stop).connect(lp);
    },
    /* ---------- ударні для наборів ---------- */
    cymbal(eng, dest, n, t) {
      const ctx = eng.ctx, s = noiseSrc(eng, t, t + 2.5, false);
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 5000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12 * n.vel, t + 0.005); g.gain.setTargetAtTime(0.0001, t + 0.01, 0.6);
      s.connect(hp).connect(g).connect(out(eng, dest, t, 0.3));
    },
    kick808(eng, dest, n, t) {
      const ctx = eng.ctx, o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.08);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.55 * n.vel, t + 0.003); g.gain.setTargetAtTime(0.0001, t + 0.02, 0.2);
      o.connect(g).connect(out(eng, dest, t, 0)); o.start(t); o.stop(t + 1);
    },
    clap(eng, dest, n, t) {
      const ctx = eng.ctx, s = noiseSrc(eng, t, t + 0.4, false);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 1.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      for (const d of [0, 0.012, 0.024]) { g.gain.setValueAtTime(0.22 * n.vel, t + d); g.gain.setTargetAtTime(0.02, t + d + 0.002, 0.004); }
      g.gain.setValueAtTime(0.18 * n.vel, t + 0.036); g.gain.setTargetAtTime(0.0001, t + 0.04, 0.06);
      s.connect(bp).connect(g).connect(out(eng, dest, t, -0.1));
    },
    hihat(eng, dest, n, t) {
      const ctx = eng.ctx, s = noiseSrc(eng, t, t + 0.1, false);
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 8000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1 * n.vel, t + 0.002); g.gain.setTargetAtTime(0.0001, t + 0.004, 0.015);
      s.connect(hp).connect(g).connect(out(eng, dest, t, 0.25));
    },
    tom(eng, dest, n, t) {
      const ctx = eng.ctx, f = mtof(n.midi || 45), o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4 * n.vel, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.02, 0.15);
      o.connect(g).connect(out(eng, dest, t, -0.15)); o.start(t); o.stop(t + 1);
    },
    woodblock(eng, dest, n, t) { bell(eng, dest, { ...n, midi: 79 }, t, [[1, 1], [2.7, 0.3]], 0.12, 0.3); },
    stone(eng, dest, n, t) {
      const ctx = eng.ctx, s = noiseSrc(eng, t, t + 0.2, false);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 350; bp.Q.value = 3;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * n.vel, t + 0.002); g.gain.setTargetAtTime(0.0001, t + 0.004, 0.03);
      s.connect(bp).connect(g).connect(out(eng, dest, t, 0));
    },
    waterdrop(eng, dest, n, t) {
      const ctx = eng.ctx, o = ctx.createOscillator(); o.type = "sine";
      const f = 900 + ((t * 977) % 700);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.05);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12 * n.vel, t + 0.003); g.gain.setTargetAtTime(0.0001, t + 0.01, 0.025);
      o.connect(g).connect(out(eng, dest, t, 0.2)); o.start(t); o.stop(t + 0.2);
    },
    logdrum(eng, dest, n, t) { bell(eng, dest, { ...n, midi: n.midi || 50 }, t, [[1, 1], [1.5, 0.4], [2.2, 0.15]], 0.5, 0.35); },
    softkick(eng, dest, n, t) {
      const ctx = eng.ctx, o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3 * n.vel, t + 0.02); g.gain.setTargetAtTime(0.0001, t + 0.04, 0.12);
      o.connect(g).connect(out(eng, dest, t, 0)); o.start(t); o.stop(t + 0.8);
    },
    brush(eng, dest, n, t) {
      const ctx = eng.ctx, s = noiseSrc(eng, t, t + 0.3, false);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3000; bp.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08 * n.vel, t + 0.03); g.gain.setTargetAtTime(0.0001, t + 0.05, 0.06);
      s.connect(bp).connect(g).connect(out(eng, dest, t, 0.15));
    },

    /* ---------- текстури (одна «нота» на такт; n.amount = інтенсивність) ---------- */
    wind(eng, dest, n, t) {
      const ctx = eng.ctx, a = n.amount ?? 0.5, { g, stop } = texEnv(ctx, t, n, 0.08 + 0.12 * a, 0.6);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2.5;
      bp.frequency.setValueAtTime(300 + 900 * a, t);
      bp.frequency.linearRampToValueAtTime(500 + 1500 * a, t + n.dur / 2);
      bp.frequency.linearRampToValueAtTime(300 + 900 * a, t + n.dur);
      noiseSrc(eng, t, stop).connect(bp).connect(g).connect(panner(eng, dest, t, n));
    },
    rain(eng, dest, n, t) {
      // шум дощу + краплі (короткі клацання), к-сть крапель = інтенсивність
      const ctx = eng.ctx, a = n.amount ?? 0.5, { g, stop } = texEnv(ctx, t, n, 0.05 + 0.08 * a);
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3000;
      const dst = panner(eng, dest, t, n);
      noiseSrc(eng, t, stop).connect(hp).connect(g).connect(dst);
      const drops = Math.round(4 + a * 40);
      let seed = Math.floor(t * 1000) + 7;
      for (let k = 0; k < drops; k++) {
        seed = (seed * 16807) % 2147483647;
        const dt = (seed / 2147483647) * n.dur, f = 2000 + ((seed >> 5) % 3000);
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f, t + dt); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dt + 0.03);
        const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t + dt); og.gain.linearRampToValueAtTime(0.05 * n.vel, t + dt + 0.002); og.gain.setTargetAtTime(0.0001, t + dt + 0.004, 0.01);
        const p = ctx.createStereoPanner(); p.pan.value = ((seed >> 3) % 200) / 100 - 1;
        o.connect(og).connect(p).connect(dest); o.start(t + dt); o.stop(t + dt + 0.06);
      }
    },
    waves(eng, dest, n, t) {
      // хвилі: шум, що повільно «набігає» й відкочується (2 хвилі на такт)
      const ctx = eng.ctx, a = n.amount ?? 0.5, end = t + n.dur, stop = end + 0.2;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      const k = 2;
      for (let i = 0; i < k; i++) {
        const t0 = t + (i / k) * n.dur, t1 = t0 + n.dur / k;
        g.gain.linearRampToValueAtTime((0.06 + 0.1 * a) * n.vel, t0 + (t1 - t0) * 0.45);
        g.gain.linearRampToValueAtTime(0.01, t1);
        lp.frequency.setValueAtTime(400, t0); lp.frequency.linearRampToValueAtTime(1200 + 1500 * a, t0 + (t1 - t0) * 0.45); lp.frequency.linearRampToValueAtTime(400, t1);
      }
      noiseSrc(eng, t, stop).connect(lp).connect(g).connect(panner(eng, dest, t, n));
    },
    crackle(eng, dest, n, t) {
      // тріск вогню: випадкові короткі клацання, к-сть = інтенсивність, + тихий шум полум'я
      const ctx = eng.ctx, a = n.amount ?? 0.5, { g, stop } = texEnv(ctx, t, n, 0.03 + 0.05 * a);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 800; bp.Q.value = 0.5;
      const dst = panner(eng, dest, t, n);
      noiseSrc(eng, t, stop).connect(bp).connect(g).connect(dst);
      const pops = Math.round(6 + a * 50);
      let seed = Math.floor(t * 997) + 3;
      for (let k = 0; k < pops; k++) {
        seed = (seed * 48271) % 2147483647;
        const dt = (seed / 2147483647) * n.dur;
        const s = ctx.createBufferSource(); s.buffer = eng.noise;
        const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1500 + (seed % 4000);
        const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t + dt); og.gain.linearRampToValueAtTime(0.18 * n.vel * (0.3 + (seed % 70) / 100), t + dt + 0.001); og.gain.setTargetAtTime(0.0001, t + dt + 0.002, 0.004);
        s.connect(hp).connect(og).connect(dst); s.start(t + dt, (seed % 1000) / 1000); s.stop(t + dt + 0.03);
      }
    },
    air(eng, dest, n, t) {
      const ctx = eng.ctx, a = n.amount ?? 0.5, { g, stop } = texEnv(ctx, t, n, 0.03 + 0.05 * a, 0.8);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2500 + 2500 * a; bp.Q.value = 0.6;
      noiseSrc(eng, t, stop).connect(bp).connect(g).connect(panner(eng, dest, t, n));
    },
    granular(eng, dest, n, t) {
      // гранулярна «каламуть»: багато коротких зерен шуму; густота зерен = концентрація
      const ctx = eng.ctx, a = n.amount ?? 0.5, dst = panner(eng, dest, t, n);
      const grains = Math.round(20 + a * 120);
      let seed = Math.floor(t * 761) + 11;
      for (let k = 0; k < grains; k++) {
        seed = (seed * 16807) % 2147483647;
        const dt = (seed / 2147483647) * n.dur, len = 0.02 + (seed % 60) / 1000;
        const s = ctx.createBufferSource(); s.buffer = eng.noise;
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 300 + (seed % 3000) * (1 - 0.5 * a); bp.Q.value = 4;
        const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t + dt); og.gain.linearRampToValueAtTime(0.12 * n.vel, t + dt + len / 2); og.gain.linearRampToValueAtTime(0.0001, t + dt + len);
        s.connect(bp).connect(og).connect(dst); s.start(t + dt, (seed % 1500) / 1000); s.stop(t + dt + len + 0.01);
      }
    },
  };
}
