// Текстура теми: вітер, дощ, хвилі, тріск вогню, повітря, гранулярне «зерно», дрон.
// Одна безперервна «нота» на такт; інтенсивність (amount) = густота даних, гучність = енергія.
// Шторм (fx circlePan): звук рухається по колу, швидкість обертання = рухливість даних.

export default {
  id: "texture",
  label: "Текстура теми",
  role: "Шум-текстура теми (дощ, вітер, хвилі, тріск…): інтенсивність — густота даних",
  active: o => o > 0.12,
  render(ctx, out) {
    const { bar, profile, state, b } = ctx;
    const p = bar.params;
    let pan = p.pan * 0.5;
    if (profile.fx.includes("circlePan")) {
      // кут накопичується: швидше рухаються хмари — швидше кружляє звук
      state.angle = (state.angle ?? 0) + (0.15 + 0.6 * p.motion) * Math.PI;
      pan = Math.sin(state.angle) * 0.85;
    }
    out.push({
      t: bar.t0, midi: 0, dur: bar.dur * 1.04, vel: 0.25 + 0.6 * p.energy, pan,
      amount: Math.max(0.05, p.density), panTo: profile.fx.includes("circlePan") ? Math.sin((state.angle ?? 0) + (0.15 + 0.6 * p.motion) * Math.PI) * 0.85 : pan,
      legato: true, fixed: true, bar: b,
    });
  },
};
