// Гармонія всього треку: тональність, лад по фразах, прогресії, модуляції, акорди кожного такту.
import { MODES, modeFor, chordOn, PROGRESSIONS, tensionLevel, noteName } from "./theory.js";

const KEY_ROOT = { heatmap: 57, nightlights: 49, truecolor: 55, default: 50 };   // A, C♯, G, D

/**
 * @returns {{ keyRoot, bars: [{ root, mode, chords: [{ beat, beats, chord }], why }] , modulations }}
 */
export function planHarmony(mapping, rng) {
  const { bars, meta } = mapping;
  const phrase = meta.phrase;
  const keyRoot = KEY_ROOT[meta.preset] ?? KEY_ROOT.default;
  const out = [];
  let modeIdx = null, firstProg = null;
  const modulations = [];

  for (let p0 = 0; p0 < bars.length; p0 += phrase) {
    const ph = bars.slice(p0, p0 + phrase);
    const avg = k => ph.reduce((s, b) => s + b.params[k], 0) / ph.length;
    const bright = avg("brightness"), tension = avg("tension"), motion = avg("motion"), density = avg("density");

    // лад: міняємо лише на межі фрази й з гістерезисом (без «смикання» на межі двох ладів)
    const want = MODES.indexOf(modeFor(bright));
    if (modeIdx === null) modeIdx = want;
    else if (want !== modeIdx) {
      const boundary = 1 - (modeIdx + 0.5 * Math.sign(want - modeIdx)) / (MODES.length - 1);
      if (Math.abs(bright - boundary) > 0.05) modeIdx = want;
    }
    const mode = MODES[modeIdx];

    // модуляція: кульмінація з високою напругою — на тон вище (підйом), розв'язка — назад
    const sec = ph[0].section;
    const lift = sec === "climax" && tension > 0.45 ? 2 : 0;
    const root = keyRoot + lift;
    if (lift && (!out.length || out[out.length - 1].root !== root)) modulations.push({ bar: p0, to: noteName(root), why: "кульмінація з високою напругою — модуляція на тон вище" });

    // прогресія: мотив повертається (returnOfState / цикл) — та сама прогресія, що й у першій темі
    const level = tensionLevel(tension);
    let prog = rng.pick(PROGRESSIONS[level]);
    if (ph[0].motifReturn && firstProg) prog = firstProg;
    if (!firstProg && sec !== "intro") firstProg = prog;
    if (sec === "intro") prog = [0, 0, 3, 4].slice(0, Math.max(2, prog.length));

    // гармонічний ритм: швидкі зміни — акорд щотакту, повільні — раз на 2 такти
    const chordBars = motion > 0.5 || density > 0.6 ? 1 : 2;
    ph.forEach((b, k) => {
      const slot = Math.floor(k / chordBars) % prog.length;
      let degree = prog[slot];
      const last = b.bar === bars.length - 1;
      if (last) degree = 0;                                  // кінець треку — тоніка
      else if (b.transition) degree = 4;                     // перед новим розділом — домінанта (тяжіння)
      const tens = last ? Math.min(0.2, b.params.tension) : b.params.tension;
      const chord = chordOn(mode, degree, tens);
      if (b.transition && !last) chord.sus = true;           // затримка гармонії перед розділом
      out.push({
        root, mode, chords: [{ beat: 0, beats: 4, chord }], level,
        why: `${mode.label} (світлість ${bright.toFixed(2)}), ${level === "calm" ? "спокійна" : level === "medium" ? "помірна" : "напружена"} прогресія (напруга ${tension.toFixed(2)}), акорд: ${chord.ext}`,
      });
    });
  }
  return { keyRoot, keyName: noteName(keyRoot), bars: out, modulations };
}
