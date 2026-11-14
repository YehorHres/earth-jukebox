// Реєстр ознак-плагінів. Нова ознака = registerFeature({...}) у будь-якому модулі features/.
// Ознака: { id, label, group, range: [lo, hi], describe?(v), compute(ctx, shared) → number }
// shared — проміжні результати, спільні для кількох ознак одного кадру (рахуються один раз).

const FEATURES = [];

export function registerFeature(def) {
  if (FEATURES.some(f => f.id === def.id)) throw new Error(`ознака ${def.id} уже зареєстрована`);
  FEATURES.push({ range: [0, 1], group: "basic", ...def });
}

export const listFeatures = () => FEATURES.slice();
export const getFeature = id => FEATURES.find(f => f.id === id);

/** Скалярні ознаки кадру. */
export function computeFeatures(ctx) {
  const shared = {};
  const out = {};
  for (const f of FEATURES) {
    let v = f.compute(ctx, shared);
    if (!Number.isFinite(v)) v = (f.range[0] + f.range[1]) / 2;
    out[f.id] = v;
  }
  return out;
}
