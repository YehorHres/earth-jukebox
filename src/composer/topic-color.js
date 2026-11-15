// Етап 17: «колір» теми поверх партитури — лише ЯК звучать ноти (фільтр, тремоло, панорама, легато, регістр),
// а не які ноти грати: ноти й далі від даних. Кожен прийом вмикає soundProfile.fx теми; рішення пишуться в why.
const c01 = x => Math.max(0, Math.min(1, x ?? 0.5));

export const TOPIC_FX = {
  flutter: "Нервові духові: на поривах (подія або висока напруга) — тремоло (flutter) у валторн і тромбонів",
  choke: "«Задуха»: ріст величини закриває фільтр і звужує стерео, спад — розширює",
  felt: "М'яке фортепіано: менше льоду → темніший, «вологий» тембр (low-pass); у розв'язці — поодинокі ноти, що згасають",
  pulse: "Гіпнотичний пульс обертання: одна нота на долю; м'який пульс під вогниками: контраст — фільтром і гучністю; панорама вогника — де він на карті; темрява — тиша",
  coolLP: "Легато; у прохолодних, спокійних епізодах — low-pass і нижчий регістр",
  whistle: "Вітер зі свистом",
  crackle: "Тріск стихії на спалахах (подіях)",
};

/**
 * @param {Array} notes ноти партитури (змінюються на місці; можуть додатися ноти текстури)
 * @param {object} ctx { bars, barDur, fx, barInfo }
 */
export function colorByTopic(notes, { bars, barDur, fx = [], barInfo = [] }) {
  if (!fx.some(f => TOPIC_FX[f])) return [];
  const has = f => fx.includes(f);
  const barOf = n => Math.max(0, Math.min(bars.length - 1, Math.floor(n.t / barDur + 1e-6)));
  const add = [];
  const lastRes = bars.findIndex(b => b.section === "resolution");
  const firstInBar = new Set(), pulseOf = new Map();
  for (const n of notes) {
    const bar = bars[barOf(n)], p = bar.params, part = n.part;
    if (n.fixed && (part === "dataVoice" || part === "reference" || part === "ticks" || part === "earcons")) continue;
    if (has("flutter") && (part === "counter" || part === "pad") && (bar.events.length || (p.tension ?? 0) > 0.7))
      n.flutter = 6 + 6 * c01(p.energy);
    if (has("felt") && (part === "arp" || part === "counter" || part === "soloists")) {
      n.lp = Math.round(900 + 3600 * c01(p.value));
      if (part === "arp" && lastRes >= 0 && bar.bar >= lastRes) {
        // фінал: одна нота на такт, що довго згасає й стає тихішою до кінця
        const k = bar.bar;
        if (firstInBar.has(k)) { n.vel = 0; continue; }
        firstInBar.add(k);
        const left = (bars.length - k) / Math.max(1, bars.length - lastRes);
        n.dur = barDur * 1.6; n.vel = 0.12 + 0.3 * left;
      }
    }
    if (has("pulse")) {
      const quiet = 0.2 + 0.8 * c01(p.energy);                 // темрява — майже тиша
      if (part === "pad" || part === "bass") n.vel *= quiet;
      if (part === "arp") {
        // пульс: лише ноти на долях, усі — одна висота такту; контраст — фільтр і гучність
        const beatPos = ((n.t - bar.t0) / barDur) * 4;
        if (Math.abs(beatPos - Math.round(beatPos)) > 0.05) { n.vel = 0; continue; }
        if (!pulseOf.has(bar.bar)) pulseOf.set(bar.bar, n.midi);
        n.midi = pulseOf.get(bar.bar);
        n.lp = Math.round(500 + 5500 * c01(p.energy)); n.vel = 0.18 + 0.35 * c01(p.energy); n.dur = barDur / 4 * 0.9;
      }
    }
    if (has("coolLP") && part !== "drums" && part !== "texture" && part !== "soloists") {
      if (part === "arp" || part === "counter") { n.dur *= 1.5; n.legato = true; }
      const b = c01(p.brightness);
      if (b < 0.45) {
        n.lp = Math.round(450 + 4000 * b);
        if ((part === "arp" || part === "counter") && n.midi - 12 >= 48) n.midi -= 12;
      }
    }
    if (part === "texture" && has("whistle")) n.whistle = true;
  }
  if (has("crackle")) for (const bar of bars) {
    if (!barInfo[bar.bar]?.active?.includes("texture")) continue;      // лише в тактах, де текстура вже звучить (бюджет партій)
    for (const e of bar.events) add.push({ part: "texture", inst: "crackle", t: e.time, midi: 0, dur: 0.35, vel: 0.7, amount: 0.9, pan: 0, fixed: true, crackle: true });
  }
  // ноти з нульовою гучністю прибираємо (пульс і фінал льоду — менше нот)
  for (let i = notes.length - 1; i >= 0; i--) if (notes[i].vel === 0) notes.splice(i, 1);
  notes.push(...add);
  return fx.filter(f => TOPIC_FX[f]).map(f => TOPIC_FX[f]);
}
