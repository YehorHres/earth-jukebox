// Гармонія всього треку: тональність, лад по фразах, прогресії, модуляції, акорди кожного такту.
import { MODES, chordOn, PROGRESSIONS, tensionLevel, noteName } from "./theory.js";

/**
 * Тональність — з мапінгу (тема: фіксована нота або квінтове коло за даними);
 * лади — лише ті, що дозволяє тема (від світлого до темного), вибір — за світлістю даних.
 * @returns {{ keyRoot, bars: [{ root, mode, chords: [{ beat, beats, chord }], why }] , modulations }}
 */
const DARK = new Set(["aeolian", "phrygian"]);

export function planHarmony(mapping, rng) {
  const { bars, meta } = mapping;
  const phrase = meta.phrase;
  const keyRoot = 48 + (meta.key?.pc ?? 2);                 // C3..B3
  const allowed = (meta.soundProfile?.modes || MODES.map(m => m.id)).map(id => MODES.find(m => m.id === id)).filter(Boolean);
  const modes = allowed.length ? allowed : MODES;
  const beats = meta.meter?.quarters || 4;
  const out = [];
  let modeIdx = null, firstProg = null;
  const modulations = [];

  for (let p0 = 0; p0 < bars.length; p0 += phrase) {
    const ph = bars.slice(p0, p0 + phrase);
    const avg = k => ph.reduce((s, b) => s + b.params[k], 0) / ph.length;
    const bright = avg("brightness"), tension = avg("tension"), motion = avg("motion"), density = avg("density");

    // лад: міняємо лише на межі фрази й з гістерезисом (без «смикання» на межі двох ладів)
    const n = modes.length;
    const want = Math.round((1 - Math.max(0, Math.min(1, bright))) * (n - 1));
    if (modeIdx === null) modeIdx = want;
    else if (want !== modeIdx && n > 1) {
      const boundary = 1 - (modeIdx + 0.5 * Math.sign(want - modeIdx)) / (n - 1);
      if (Math.abs(bright - boundary) > 0.05) modeIdx = want;
    }
    let mode = modes[modeIdx];
    // настрій — від даних, а не від теми: спокійні й помірні дані → врівноважений лад (не темніший за дорійський);
    // темні лади (мінор, фригійський) — лише на аномаліях (висока напруга)
    const level = tensionLevel(tension);
    if (level !== "tense" && DARK.has(mode.id)) mode = [...modes].reverse().find(m => !DARK.has(m.id)) || mode;

    // модуляція: кульмінація з високою напругою — на тон вище (підйом), розв'язка — назад
    const sec = ph[0].section;
    const lift = sec === "climax" && tension > 0.45 ? 2 : 0;
    const root = keyRoot + lift;
    if (lift && (!out.length || out[out.length - 1].root !== root)) modulations.push({ bar: p0, to: noteName(root), why: "кульмінація з високою напругою — модуляція на тон вище" });

    // прогресія: мотив повертається (returnOfState / цикл) — та сама прогресія, що й у першій темі
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
      // період 4+4: перша фраза закінчується напівкаденцією (V), друга — повною (V → I)
      const second = Math.floor(p0 / phrase) % 2 === 1, kEnd = ph.length - 1;
      if (sec !== "intro" && ph.length > 1) {
        if (!second && k === kEnd) degree = 4;
        if (second) degree = k === kEnd ? 0 : k === kEnd - 1 ? 4 : degree;
      }
      if (last) degree = 0;                                 // кінець треку — тоніка
      else if (b.transition) degree = 4;                     // перед новим розділом — домінанта (тяжіння)
      const tens = last ? Math.min(0.2, b.params.tension) : b.params.tension;
      const chord = chordOn(mode, degree, tens);
      if (b.transition && !last) chord.sus = true;           // затримка гармонії перед розділом
      out.push({
        root, mode, chords: [{ beat: 0, beats, chord }], level,
        cadence: last ? "final" : k === kEnd ? (degree === 0 ? "full" : degree === 4 ? "half" : null) : null,
        why: `${mode.label} (світлість ${bright.toFixed(2)}), ${level === "calm" ? "спокійна" : level === "medium" ? "помірна" : "напружена"} прогресія (напруга ${tension.toFixed(2)}), акорд: ${chord.ext}`,
      });
    });
  }
  return { keyRoot, keyName: noteName(keyRoot), bars: out, modulations };
}
