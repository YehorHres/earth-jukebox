// «Людське» виконання: тайминг ±10–20 мс, сила удару ±10 %, легкий свінг (seeded).
export function humanize(notes, rng, { timing = 0.012, vel = 0.1, swing = 0 } = {}) {
  for (const n of notes) {
    if (n.fixed) continue;
    let dt = rng.gauss(0, timing * 0.6);
    dt = Math.max(-timing * 1.6, Math.min(timing * 1.6, dt));
    if (swing && n.offbeat) dt += swing;
    n.t = Math.max(0, n.t + dt);
    n.vel = Math.max(0.02, Math.min(1, n.vel * (1 + rng.gauss(0, vel * 0.5))));
  }
  return notes;
}
