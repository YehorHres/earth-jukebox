// Область даних і службові елементи кадру (етап 10).
//   detectRegion — зовнішній фон (темні або однотонні статичні пікселі, з'єднані з рамкою) → маска області,
//                  bbox, форма disk | rect | other; для диска — центр і радіус (найменші квадрати по межі).
//   detectScale  — шкала кольорів: вузька статична смуга з плавним монотонним градієнтом → опорні кольори.
// Усі координати — у сітці маски (w×h); у профіль кладемо також нормовані 0..1.

/** Зв'язні компоненти (4-сусідство) для маски; повертає мітки й розміри. */
export function components(mask, w, h) {
  const lab = new Int32Array(w * h).fill(-1), sizes = [], stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i] >= 0) continue;
    const id = sizes.length; let size = 0;
    lab[i] = id; stack.push(i);
    while (stack.length) {
      const j = stack.pop(); size++;
      const x = j % w, y = (j - x) / w;
      if (x > 0 && mask[j - 1] && lab[j - 1] < 0) { lab[j - 1] = id; stack.push(j - 1); }
      if (x < w - 1 && mask[j + 1] && lab[j + 1] < 0) { lab[j + 1] = id; stack.push(j + 1); }
      if (y > 0 && mask[j - w] && lab[j - w] < 0) { lab[j - w] = id; stack.push(j - w); }
      if (y < h - 1 && mask[j + w] && lab[j + w] < 0) { lab[j + w] = id; stack.push(j + w); }
    }
    sizes.push(size);
  }
  return { lab, sizes };
}

/** Заливка від рамки по пікселях, де pass(i) = true. */
export function floodFromBorder(pass, w, h) {
  const seen = new Uint8Array(w * h), stack = [];
  const push = i => { if (!seen[i] && pass(i)) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const j = stack.pop(), x = j % w, y = (j - x) / w;
    if (x > 0) push(j - 1); if (x < w - 1) push(j + 1);
    if (y > 0) push(j - w); if (y < h - 1) push(j + w);
  }
  return seen;
}

/** Коло за найменшими квадратами (метод Каси): x² + y² + Dx + Ey + F = 0. */
function fitCircle(pts) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  const n = pts.length;
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  // нормальні рівняння 3×3: [sxx sxy sx; sxy syy sy; sx sy n] · [D E F] = −[sxz syz sz]
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], b = [-sxz, -syz, -sz];
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(A);
  if (Math.abs(d) < 1e-9) return null;
  const sol = [0, 1, 2].map(k => det(A.map((row, r) => row.map((v, c) => (c === k ? b[r] : v)))) / d);
  const [D, E, F] = sol, cx = -D / 2, cy = -E / 2, r = Math.sqrt(Math.max(0, cx * cx + cy * cy - F));
  return { cx, cy, r };
}

/**
 * @param o { w, h, meanRGB: Float32Array(3n, 0..1), mVal, pxStd, still: bool, staticThr }
 * @returns { mask, bbox:{x0,y0,x1,y1}, shape, disk|null, area, norm:{ bbox, disk } }
 */
export function detectRegion({ w, h, meanRGB, mVal, pxStd, still, staticThr }) {
  const n = w * h;
  const isStatic = i => still || pxStd[i] < Math.max(staticThr, 3 / 255);
  // домінантний колір рамки (5 біт на канал); якщо ≥ 40 % рамки однакові — це «фон»
  const q = i => ((meanRGB[3 * i] * 31) | 0) << 10 | ((meanRGB[3 * i + 1] * 31) | 0) << 5 | ((meanRGB[3 * i + 2] * 31) | 0);
  const hist = new Map(); let border = 0;
  const addB = i => { hist.set(q(i), (hist.get(q(i)) || 0) + 1); border++; };
  for (let x = 0; x < w; x++) { addB(x); addB((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { addB(y * w); addB(y * w + w - 1); }
  let bgQ = null, bgN = 0;
  for (const [k, v] of hist) if (v > bgN) { bgN = v; bgQ = k; }
  let bgRGB = null;
  if (bgN / border >= 0.4) {
    bgRGB = [((bgQ >> 10) & 31) / 31, ((bgQ >> 5) & 31) / 31, (bgQ & 31) / 31];
    // однотонний НЕ чорний фон — лише якщо він на всіх чотирьох сторонах (білі полярні смуги — це лід, дані)
    const nearBg = i => (meanRGB[3 * i] - bgRGB[0]) ** 2 + (meanRGB[3 * i + 1] - bgRGB[1]) ** 2 + (meanRGB[3 * i + 2] - bgRGB[2]) ** 2 < 0.004;
    const side = idx => idx.reduce((c, i) => c + (nearBg(i) ? 1 : 0), 0) / idx.length;
    const xs = Array.from({ length: w }, (_, x) => x), ys = Array.from({ length: h }, (_, y) => y);
    const all4 = [xs, xs.map(x => (h - 1) * w + x), ys.map(y => y * w), ys.map(y => y * w + w - 1)].every(s => side(s) >= 0.3);
    if (Math.max(...bgRGB) >= 0.08 && !all4) bgRGB = null;
  }
  const bgLike = i => {
    if (!isStatic(i)) return false;
    if (mVal[i] < 0.07) return true;                       // чорні смуги, космос
    if (!bgRGB) return false;
    const dr = meanRGB[3 * i] - bgRGB[0], dg = meanRGB[3 * i + 1] - bgRGB[1], db = meanRGB[3 * i + 2] - bgRGB[2];
    return dr * dr + dg * dg + db * db < 0.004;            // однотонний фон рамки
  };
  const bg = floodFromBorder(bgLike, w, h);
  // область = найбільша зв'язна компонента «не фону» (зірки, логотипи, підписи на фоні — окремі дрібні компоненти)
  const nonBg = new Uint8Array(n);
  for (let i = 0; i < n; i++) nonBg[i] = bg[i] ? 0 : 1;
  const { lab, sizes } = components(nonBg, w, h);
  let best = -1;
  sizes.forEach((s, k) => { if (best < 0 || s > sizes[best]) best = k; });
  let mask = new Uint8Array(n);
  if (best >= 0) for (let i = 0; i < n; i++) mask[i] = lab[i] === best ? 1 : 0;
  // заповнюємо «дірки» (темний океан між лініями всередині карти — теж область даних)
  const outside = floodFromBorder(i => !mask[i], w, h);
  for (let i = 0; i < n; i++) mask[i] = outside[i] ? 0 : 1;
  let area = mask.reduce((s, v) => s + v, 0);
  if (area < n * 0.02) { mask.fill(1); area = n; }          // нічого не знайшли — увесь кадр

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = area / (bw * bh);
  let shape = "other", disk = null;
  if (fill >= 0.93) shape = "rect";
  else if (fill >= 0.68 && fill <= 0.86 && bw / bh > 0.8 && bw / bh < 1.25) {
    const pts = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (mask[i] && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w])) pts.push([x + 0.5, y + 0.5]);
    }
    const c = fitCircle(pts);
    if (c && c.r > 4) {
      shape = "disk"; disk = c;
      // маска диска — геометричне коло (рівний край, без «зубців»)
      mask = new Uint8Array(n);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + 0.5 - c.cx) ** 2 + (y + 0.5 - c.cy) ** 2 <= c.r * c.r) mask[y * w + x] = 1;
      area = mask.reduce((s, v) => s + v, 0);
      x0 = Math.max(0, Math.floor(c.cx - c.r)); x1 = Math.min(w - 1, Math.ceil(c.cx + c.r) - 1);
      y0 = Math.max(0, Math.floor(c.cy - c.r)); y1 = Math.min(h - 1, Math.ceil(c.cy + c.r) - 1);
    }
  }
  // майже на весь кадр прямокутник — лишаємо весь кадр (зберігаємо геометрію плоскої карти)
  const full = shape === "rect" && bw >= w * 0.9 && bh >= h * 0.9;
  if (full) { mask.fill(1); x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; area = n; }
  return {
    mask, shape, disk, area: area / n, full,
    bbox: { x0, y0, x1, y1 },
    norm: { bbox: { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h }, disk: disk && { cx: disk.cx / w, cy: disk.cy / h, r: disk.r / w } },
  };
}

/**
 * Шкала кольорів: вузька (статична) смуга з плавним монотонним градієнтом.
 * @returns { found, orientation, refs: [[r,g,b]×32] (від «менше» до «більше»), mask, norm } | { found:false }
 */
export function detectScale({ w, h, meanRGB, mSat, mVal, pxStd, still, staticThr }) {
  const n = w * h, cand = new Uint8Array(n);
  for (let i = 0; i < n; i++) cand[i] = (still || pxStd[i] < Math.max(staticThr, 3 / 255)) && mSat[i] >= 0.25 && mVal[i] >= 0.15 ? 1 : 0;
  const { lab, sizes } = components(cand, w, h);
  let best = null;
  sizes.forEach((size, id) => {
    if (size < n * 0.0015) return;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < n; i++) if (lab[i] === id) { const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, vertical = bh > bw;
    const long = Math.max(bw, bh), short = Math.min(bw, bh);
    if (short / long > 0.25 || long < (vertical ? h : w) * 0.2 || size / (bw * bh) < 0.6) return;
    // середній колір уздовж довгої осі
    const seq = [];
    for (let k = 0; k < long; k++) {
      let r = 0, g = 0, b = 0, c = 0;
      for (let s = 0; s < short; s++) {
        const x = vertical ? x0 + s : x0 + k, y = vertical ? y0 + k : y0 + s, i = y * w + x;
        if (lab[i] !== id) continue;
        r += meanRGB[3 * i]; g += meanRGB[3 * i + 1]; b += meanRGB[3 * i + 2]; c++;
      }
      if (c) seq.push([r / c, g / c, b / c]);
    }
    if (seq.length < 8) return;
    // краї смуги змішані з тлом (згладжування при масштабуванні) — відкидаємо по 2 відліки з кожного кінця
    if (seq.length > 12) { seq.splice(0, 2); seq.splice(-2, 2); }
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    let path = 0, maxStep = 0;
    for (let k = 1; k < seq.length; k++) { const d = dist(seq[k], seq[k - 1]); path += d; maxStep = Math.max(maxStep, d); }
    const span = dist(seq[0], seq[seq.length - 1]);
    // плавно (без стрибків), кінці різні, і шкала не «повертається» сама в себе:
    // кольори, далекі по шкалі (≥ ¼ довжини), мають бути далекими й за кольором (райдуга/jet проходить, повтори — ні)
    if (span < 0.35 || maxStep > 0.2 || path / span > 4) return;
    const gap = Math.max(2, Math.floor(seq.length / 4));
    for (let a = 0; a < seq.length; a += 2) for (let b = a + gap; b < seq.length; b += 2) if (dist(seq[a], seq[b]) < 0.2) return;
    if (!best || long > best.long) best = { id, x0, y0, x1, y1, vertical, long, seq };
  });
  if (!best) return { found: false };
  // «менше» — знизу (вертикальна) або зліва (горизонтальна)
  let seq = best.vertical ? best.seq.slice().reverse() : best.seq;
  const refs = Array.from({ length: 32 }, (_, k) => seq[Math.round(k * (seq.length - 1) / 31)]);
  // маска шкали з запасом 2 пікселі (рамка, підписи поділок)
  const mask = new Uint8Array(n);
  for (let y = Math.max(0, best.y0 - 2); y <= Math.min(h - 1, best.y1 + 2); y++)
    for (let x = Math.max(0, best.x0 - 2); x <= Math.min(w - 1, best.x1 + 2); x++) mask[y * w + x] = 1;
  return {
    found: true, orientation: best.vertical ? "vertical" : "horizontal", refs, mask,
    norm: { x0: best.x0 / w, y0: best.y0 / h, x1: (best.x1 + 1) / w, y1: (best.y1 + 1) / h },
  };
}
