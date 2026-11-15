// Шкала кольорів без легенди (PROMPT-v7 §2) і полярність «що означає більше» (§3).
// Палітра кадру: кольори даних упорядковуємо вздовж головної осі в просторі Lab (PCA) → 32 опорні кольори
// «менше → більше» — такі самі, як дає знайдена в кадрі шкала (colorbar), тож решта двигуна читає їх через scaleValue.

const lab = (r, g, b) => {
  const f = u => { u /= 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  const q = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = q((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505), y = q(0.2126 * R + 0.7152 * G + 0.0722 * B), z = q((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

/** Головний власний вектор симетричної матриці 3×3 (степеневий метод) і частка поясненої дисперсії. */
function principalAxis(C) {
  let v = [1, 0.5, 0.25], l = 0;
  for (let it = 0; it < 60; it++) {
    const w = [0, 1, 2].map(i => C[i][0] * v[0] + C[i][1] * v[1] + C[i][2] * v[2]);
    l = Math.hypot(...w);
    if (l < 1e-12) break;
    v = w.map(x => x / l);
  }
  const tr = C[0][0] + C[1][1] + C[2][2];
  return { axis: v, explained: tr > 1e-9 ? l / tr : 0 };
}

/**
 * @param {Array<Uint8ClampedArray>} frames кадри огляду (RGBA, сітка w×h)
 * @param {object} masks { regionMask, landMask, overlayMask, bgMask }
 * @returns {{ found, refs, explained, kind, why }} refs — 32 кольори [r,g,b] 0..1 від «менше» до «більше»
 */
export function detectPalette(frames, n, masks = {}) {
  const pts = [], rgb = [];
  let sat = 0, red = 0, purple = 0, blue = 0, total = 0;
  const step = Math.max(1, Math.floor(frames.length * n / 24000));
  for (const d of frames) for (let i = (step >> 1); i < n; i += step) {
    if ((masks.regionMask && !masks.regionMask[i]) || masks.landMask?.[i] || masks.overlayMask?.[i] || masks.bgMask?.[i]) continue;
    const p = i * 4, r = d[p], g = d[p + 1], b = d[p + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 31) continue;                                    // майже чорне — фон, не дані
    total++;
    const dd = max - min;
    if (dd / max >= 0.35 && max >= 46) {
      let hh = max === r ? ((g - b) / dd) % 6 : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      hh *= 60; if (hh < 0) hh += 360;
      sat++;
      if (hh <= 40 || hh >= 330) red++; else if (hh > 260) purple++; else if (hh >= 170) blue++;
    }
    pts.push(lab(r, g, b)); rgb.push([r / 255, g / 255, b / 255]);
  }
  const N = pts.length;
  if (N < 200) return { found: false, why: "замало пікселів даних" };
  // класична шкала «синій → червоний»: обидва кінці є, фіолетового немає — відтінок читається як раніше
  if (sat / total > 0.3 && red / sat > 0.05 && blue / sat > 0.05 && purple / sat < 0.05) return { found: false, kind: "blue-red", why: "шкала «синій → червоний» — значення за відтінком" };
  const m = [0, 0, 0];
  for (const q of pts) for (let k = 0; k < 3; k++) m[k] += q[k] / N;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const q of pts) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (q[i] - m[i]) * (q[j] - m[j]) / N;
  const { axis, explained } = principalAxis(C);
  let proj = pts.map(q => (q[0] - m[0]) * axis[0] + (q[1] - m[1]) * axis[1] + (q[2] - m[2]) * axis[2]);
  const corr = f => { let sxy = 0, sxx = 0, syy = 0, my = 0; for (const q of pts) my += f(q) / N; pts.forEach((q, i) => { const y = f(q) - my; sxy += proj[i] * y; sxx += proj[i] ** 2; syy += y * y; }); return sxy / Math.sqrt(sxx * syy || 1); };
  // головна вісь — переважно світлота чи відтінок?
  let lightCorr = corr(q => q[0]);
  const kind = Math.abs(lightCorr) >= 0.5 ? "lightness" : "hue";
  // орієнтація за замовчуванням: світліше = більше; для осі відтінку — тепліше (червоніше/жовтіше) = більше
  if (kind === "lightness" ? lightCorr < 0 : corr(q => q[1] + 0.5 * q[2]) < 0) { proj = proj.map(v => -v); lightCorr = -lightCorr; }
  const sorted = Float64Array.from(proj).sort(), lo = sorted[Math.floor(N * 0.02)], hi = sorted[Math.floor(N * 0.98)];
  if (explained < 0.55 || hi - lo < 12) return { found: false, explained, kind, why: explained < 0.55 ? "кольори даних не лягають на одну шкалу" : "кольори даних майже однакові" };
  const K = 32, sum = Array.from({ length: K }, () => [0, 0, 0, 0]);
  proj.forEach((v, i) => { const k = Math.max(0, Math.min(K - 1, Math.floor((v - lo) / (hi - lo) * K))); const s = sum[k]; s[0] += rgb[i][0]; s[1] += rgb[i][1]; s[2] += rgb[i][2]; s[3]++; });
  const refs = sum.map(s => (s[3] >= 3 ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : null));
  // порожні відрізки шкали — лінійно між сусідами
  const known = refs.map((r, k) => (r ? k : -1)).filter(k => k >= 0);
  if (known.length < 6) return { found: false, explained, kind, why: "палітра надто бідна" };
  for (let k = 0; k < K; k++) if (!refs[k]) {
    const a = known.filter(q => q < k).pop(), b = known.find(q => q > k);
    if (a === undefined) refs[k] = refs[b].slice(); else if (b === undefined) refs[k] = refs[a].slice();
    else { const t = (k - a) / (b - a); refs[k] = refs[a].map((x, c) => x + (refs[b][c] - x) * t); }
  }
  return { found: true, refs, explained, kind, lightCorr,
    why: kind === "lightness" ? "палітру впорядковано за світлотою: світліше = більше" : "палітру впорядковано за відтінком: тепліше = більше" };
}

/** Куди «дивиться» шкала: +1 — більше значення світліше / тепліше, −1 — навпаки, 0 — невідомо. */
export function scaleSense(profile) {
  const refs = profile?.scale?.found ? profile.scale.refs : null;
  if (!refs) {
    // без шкали: теплова карта — за відтінком (червоне = більше); інші сцени — за яскравістю (світліше = більше)
    return profile?.sceneType === "heatmap" ? { lighter: 0, warmer: 1 } : { lighter: 1, warmer: 0 };
  }
  const L = refs.map(c => lab(c[0] * 255, c[1] * 255, c[2] * 255)), n = L.length;
  const trend = f => { let s = 0; for (let k = 0; k < n; k++) s += (k - (n - 1) / 2) * f(L[k]); return s; };
  const lt = trend(q => q[0]), wt = trend(q => q[1] + 0.5 * q[2]), span = f => Math.max(...L.map(f)) - Math.min(...L.map(f));
  return { lighter: span(q => q[0]) > 8 ? Math.sign(lt) : 0, warmer: span(q => q[1] + 0.5 * q[2]) > 8 ? Math.sign(wt) : 0 };
}

export const POLARITY_CHOICES = ["auto", "lighter", "darker", "warmer"];
export const POLARITY_LABEL = { auto: "автоматично", lighter: "світліше", darker: "темніше", warmer: "тепліше (червоніше)" };

/**
 * Вибір користувача → полярність голосу даних (+1 / −1) і пояснення.
 * auto — як вирішує тема (moreMeans) і шкала: світліше = більше; для «синій → червоний» — червоне = більше.
 */
export function resolvePolarity(choice, profile, topic = null) {
  const base = topic?.moreMeans === "down" ? -1 : 1, sense = scaleSense(profile);
  if (!choice || choice === "auto") {
    const how = profile?.scale?.palette ? (profile.palette?.kind === "hue" ? "тепліше = більше" : "світліше = більше")
      : profile?.sceneType === "heatmap" ? "червоне = більше" : profile?.scale?.found ? "за шкалою в кадрі" : "світліше = більше";
    return { pol: base, choice: "auto", text: `Більше значення — автоматично: ${how}${base < 0 ? " (тема обертає напрямок)" : ""}.` };
  }
  const s = choice === "warmer" ? sense.warmer : sense.lighter;
  const pol = (s || 1) * (choice === "darker" ? -1 : 1);
  return { pol, choice, text: `Більше значення — це ${POLARITY_LABEL[choice]}: ${pol > 0 ? "вищий голос даних — " : "голос даних обернено: вищий звук — "}${POLARITY_LABEL[choice]}.${s ? "" : " (Шкала не розрізняє цього напрямку — узято напрямок за замовчуванням.)"}` };
}
