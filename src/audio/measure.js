// Вимірювання звуку (v4-14): пік, гучність (ITU-R BS.1770 / LUFS з K-зважуванням і гейтингом),
// частки енергії по смугах, баланс L/R. Працює на AudioBuffer офлайн-рендеру.

export const BANDS = [["<60", 0, 60], ["60–250", 60, 250], ["250–500", 250, 500], ["500–2k", 500, 2000], ["2–6k", 2000, 6000], [">6k", 6000, 1e9]];
const db = x => 10 * Math.log10(Math.max(x, 1e-12));

/** Біквад (прямий вигляд I). */
function biquad(x, [b0, b1, b2, a1, a2]) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** Коефіцієнти K-зважування для частоти дискретизації fs (поличка +4 дБ на 1.68 кГц і HPF 38 Гц). */
function kWeighting(fs) {
  let f0 = 1681.974450955533, Q = 0.7071752369554196;
  const G = 3.999843853973347;
  let K = Math.tan(Math.PI * f0 / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / fs);
  a0 = 1 + K / Q + K * K;
  const hp = [1 / a0, -2 / a0, 1 / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  return [shelf, hp];
}

/** Інтегрована гучність, LUFS (блоки 400 мс з кроком 100 мс, абсолютний гейт −70, відносний −10). */
export function lufs(L, R, fs) {
  const [shelf, hp] = kWeighting(fs);
  const l = biquad(biquad(L, shelf), hp), r = biquad(biquad(R, shelf), hp);
  const block = Math.round(0.4 * fs), hop = Math.round(0.1 * fs), z = [];
  const cs = new Float64Array(l.length + 1);          // префіксні суми квадратів
  for (let i = 0; i < l.length; i++) cs[i + 1] = cs[i] + l[i] * l[i] + r[i] * r[i];
  for (let i = 0; i + block <= l.length; i += hop) z.push((cs[i + block] - cs[i]) / block);
  if (!z.length) return -70;
  const lk = v => -0.691 + db(v);
  let kept = z.filter(v => lk(v) > -70);
  if (!kept.length) return -70;
  const rel = lk(kept.reduce((a, b) => a + b, 0) / kept.length) - 10;
  kept = kept.filter(v => lk(v) > rel);
  return kept.length ? lk(kept.reduce((a, b) => a + b, 0) / kept.length) : -70;
}

/** FFT (radix-2, на місці). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Частки енергії по смугах (моно-сума, вікно Ханна 8192, крок 4096) на відрізку [t0, t1] секунд. */
export function bandShares(L, R, fs, t0 = 0, t1 = Infinity) {
  const N = 8192, hop = 4096, win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const acc = new Float64Array(BANDS.length), re = new Float64Array(N), im = new Float64Array(N);
  const i0 = Math.max(0, Math.floor(t0 * fs)), i1 = Math.min(L.length, Math.floor(t1 * fs));
  for (let s = i0; s + N <= i1; s += hop) {
    for (let i = 0; i < N; i++) { re[i] = (L[s + i] + R[s + i]) * 0.5 * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = k * fs / N, p = re[k] * re[k] + im[k] * im[k];
      for (let b = 0; b < BANDS.length; b++) if (f >= BANDS[b][1] && f < BANDS[b][2]) { acc[b] += p; break; }
    }
  }
  const tot = acc.reduce((a, b) => a + b, 0) || 1;
  return Array.from(acc, v => v / tot);
}

/** Повний звіт буфера: { peakDb, lufs, balanceDb (L−R), rmsDb, bands: [частки], seconds }. */
export function measure(buf, { t0 = 0, t1 = Infinity } = {}) {
  const fs = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  let peak = 0, sl = 0, sr = 0;
  for (let i = 0; i < L.length; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > peak) peak = a; if (b > peak) peak = b; sl += L[i] * L[i]; sr += R[i] * R[i]; }
  return {
    peakDb: 20 * Math.log10(Math.max(peak, 1e-9)), lufs: lufs(L, R, fs), balanceDb: db(sl) - db(sr),
    rmsDb: db((sl + sr) / (2 * L.length)), bands: bandShares(L, R, fs, t0, t1), seconds: L.length / fs,
  };
}
