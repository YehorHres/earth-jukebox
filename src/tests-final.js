// Тести PROMPT-final (блоки A–H): золотий тест галереї, типи руху, шкала без легенди, формати, картки EIC.
// Кожен набір — async (check) => {}; tests.js додає їх до SUITES.
export const FINAL_SUITES = [];

// A. Золотий тест: партитури 5 відео галереї не змінюються (tests/golden-scores.json)
FINAL_SUITES.push(async function golden(check) {
  const R = await import("./audio/report.js");
  const gold = (await (await fetch("tests/golden-scores.json")).json()).scores;
  const cat = (await (await fetch("samples/catalog.json")).json()).filter(i => i.kind === "video" && i.analysis);
  const bad = [], seen = [];
  for (const it of cat) {
    const g = gold[it.id];
    if (!g) { bad.push(`${it.id}: немає в golden-scores.json`); continue; }
    const { score } = await R.buildTrack(it), h = R.goldenHash(score);
    seen.push(it.id);
    if (h !== g.hash) bad.push(`${it.id}: ${h} ≠ ${g.hash} (нот ${score.notes.length}/${g.notes}, ${score.bpm}/${g.bpm} BPM, ${score.key}/${g.key})`);
  }
  for (const id in gold) if (!seen.includes(id)) bad.push(`${id}: немає в галереї`);
  check("Золотий тест: партитури 5 відео галереї не змінилися (ноти, час, інструменти, панорама, BPM)", seen.length === 5 && !bad.length, bad.join("; ") || seen.join(", "));
});
