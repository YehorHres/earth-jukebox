// Криві мапінгу: x ∈ [0,1] (або [-1,1] для знакових) → y. Знак зберігається.
export const CURVES = {
  linear: x => x,
  smooth: x => x * x * (3 - 2 * x),            // smoothstep — м'які краї
  exp: x => x * x,                             // реагує на великі значення
  log: x => Math.sqrt(x),                      // реагує на малі значення
  step: x => (x >= 0.5 ? 1 : 0),               // поріг
};

export const CURVE_LABEL = { linear: "лінійна", smooth: "м'яка (S)", exp: "експонента", log: "корінь", step: "поріг" };

export function applyCurve(name, x, invert = false) {
  const f = CURVES[name] || CURVES.linear;
  const s = x < 0 ? -1 : 1;
  let y = f(Math.min(1, Math.abs(x)));
  if (invert) y = 1 - y;
  return s * y;
}
