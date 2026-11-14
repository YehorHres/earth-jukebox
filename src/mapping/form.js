// Форма треку (розділ 5 ТЗ): Вступ → Наростання → Кульмінація → (Розвиток) → Розв'язка.
// Довжини розділів кратні фразі (4 такти). Кульмінація — на такті кульмінації даних.

export const SECTION_LABEL = {
  intro: "Вступ", build: "Наростання", climax: "Кульмінація", development: "Розвиток", resolution: "Розв'язка", theme: "Тема",
};

/**
 * @param {number} nBars
 * @param {object} o { climaxBar|null, energy: number[], noChange: bool }
 * @returns {{ sections: [{id,label,b0,b1}], formCurve: number[] }}
 */
export function computeForm(nBars, { climaxBar = null, energy = [], noChange = false }) {
  const phrase = nBars >= 12 ? 4 : 2;
  const snap = b => Math.round(b / phrase) * phrase;
  const introLen = Math.min(nBars >= 40 ? 2 * phrase : phrase, Math.max(1, Math.floor(nBars / 4)));
  const resLen = Math.min(nBars >= 40 ? 2 * phrase : phrase, Math.max(1, Math.floor(nBars / 4)));
  const sections = [];

  if (noChange || nBars < 6) {
    // без змін немає кульмінації — спокійна форма: вступ, тема, розв'язка
    const a = Math.min(introLen, nBars), c = Math.max(a, nBars - resLen);
    if (a > 0) sections.push({ id: "intro", b0: 0, b1: a });
    if (c > a) sections.push({ id: "theme", b0: a, b1: c });
    if (nBars > c) sections.push({ id: "resolution", b0: c, b1: nBars });
  } else {
    let cb = climaxBar;
    if (cb === null || cb === undefined) {
      cb = 0;
      energy.forEach((e, i) => { if (e > energy[cb]) cb = i; });
    }
    const climaxLen = nBars >= 32 ? 2 * phrase : phrase;
    let c0 = snap(cb - climaxLen / 2);
    c0 = Math.max(introLen, Math.min(c0, nBars - resLen - climaxLen));
    c0 = Math.max(introLen, c0);
    const c1 = Math.min(nBars - resLen, c0 + climaxLen);
    sections.push({ id: "intro", b0: 0, b1: introLen });
    if (c0 > introLen) sections.push({ id: "build", b0: introLen, b1: c0 });
    if (c1 > c0) sections.push({ id: "climax", b0: c0, b1: c1 });
    const r0 = nBars - resLen;
    if (r0 > c1) sections.push({ id: "development", b0: c1, b1: r0 });
    sections.push({ id: "resolution", b0: Math.max(c1, r0), b1: nBars });
  }
  for (const s of sections) s.label = SECTION_LABEL[s.id];

  // крива форми: «скільки оркестру» задає сама форма (змішується з energy даних)
  const formCurve = new Array(nBars).fill(0.5);
  for (const s of sections) {
    const len = s.b1 - s.b0;
    for (let b = s.b0; b < s.b1; b++) {
      const p = len > 1 ? (b - s.b0) / (len - 1) : 1;
      formCurve[b] = {
        intro: 0.2 + 0.15 * p, build: 0.4 + 0.45 * p, climax: 1, development: 0.75 - 0.15 * p,
        resolution: 0.5 - 0.35 * p, theme: 0.4,
      }[s.id];
    }
  }
  if (noChange) for (let b = 0; b < nBars; b++) formCurve[b] *= 0.7;
  return { sections, formCurve, phrase };
}
