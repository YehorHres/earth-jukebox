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

// B. Типи руху: обертовий глобус і рух камери — рух не є зміною даних
FINAL_SUITES.push(async function motion(check) {
  const { openSynthetic } = await import("./media/sources.js");
  const { analyzeSource } = await import("./analysis/analyze.js");
  const { applyMotion, estimateFlow } = await import("./analysis/motion.js");
  const { SCENES, globeValue } = await import("./media/synthetic-scenes.js");
  const { presetFor, mapAnalysis } = await import("./mapping/mapper.js");
  const { compose } = await import("./composer/composer.js");
  const { describeProfile } = await import("./a11y/describe.js");
  const R = await import("./audio/report.js");
  const T = await import("./topics/topics.js");
  await T.loadTopics();
  const topic = T.getTopic("temperature");
  const build = async a => { const m = mapAnalysis(a, await presetFor(a.profile.sceneType, topic), { topic }); return { m, s: compose(m, { seed: a.key }) }; };
  // джерела руху (frameDiff, швидкість, тренд…) у поясненнях параметрів: їх не має лишитись
  const motionSrc = m => m.bars.flatMap(b => Object.values(b.explain).flat()).filter(q => /різниц|швидкість|прискорення|тренд40|зміна за кадр/i.test(q.source) && !/замість руху/.test(q.source) && Math.abs(q.contrib) > 1e-4).length;

  // зсув: оцінювач бачить відомий зсув текстури (3 px праворуч)
  { const w = 120, h = 60, p = new Float32Array(w * h), c = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const f = u => 0.5 + 0.3 * Math.sin(u * 0.37 + y * 0.21) + 0.2 * Math.cos(u * 0.11 - y * 0.4); p[y * w + x] = f(x); c[y * w + x] = f(x - 3); }
    const fl = estimateFlow(p, c, w, h);
    check("Рух: оцінювач зсуву знаходить відомий зсув текстури (3 px праворуч)", Math.abs(fl.dx * w - 3) < 0.3 && fl.dy === 0 && fl.gain > 0.8, `dx = ${(fl.dx * w).toFixed(2)} px, dy = ${fl.dy * w}, виграш ${fl.gain.toFixed(2)}`); }

  // 1) обертовий текстурований диск
  const rot = await analyzeSource(openSynthetic("rotating-globe"), { useCache: false });
  const sc = SCENES["rotating-globe"], mo = rot.motion;
  check("Обертовий глобус: тип руху = rotating-globe (авто)", mo?.type === "rotating-globe" && mo.auto, `${mo?.type}, впевненість ${mo?.confidence?.toFixed(2)} — ${mo?.why}`);
  const truth = Array.from(rot.times, t => { let s = 0; for (let k = -2; k <= 2; k++) s += globeValue(sc.lon0(t) + k * 0.12, 0); return s / 5; });
  const rho = rot.abs.centerValue ? R.spearman(Array.from(rot.abs.centerValue), truth) : 0;
  check("Обертовий глобус: голос даних читає центральну смугу диска (ρ зі значенням на центральному меридіані ≥ 0.9)", rot.leadFeature === "centerValue" && rho >= 0.9, `провідна ознака: ${rot.leadFeature}, ρ = ${rho.toFixed(2)}`);
  check("Обертовий глобус: обертання не дає подій, «гарячих точок» і циклу", rot.events.length === 0 && rot.hotspots.length === 0 && !rot.period, `подій ${rot.events.length} (без урахування типу руху було б ${rot.temporalBase.events.length}), гарячих точок ${rot.hotspots.length}`);
  const br = await build(rot);
  const vBars = br.m.bars.map(b => b.params.value), tBars = br.m.bars.map(b => b.frames.reduce((s, i) => s + truth[i], 0) / b.frames.length);
  check("Обертовий глобус: рух не керує гучністю й темпом (джерел руху в мапінгу немає); висота голосу даних іде за центром диска", motionSrc(br.m) === 0 && R.spearman(vBars, tBars) >= 0.9 && br.s.notes.some(n => n.part === "dataVoice") && /замість руху/.test(JSON.stringify(br.m.bars[3].explain)),
    `джерел руху: ${motionSrc(br.m)}, ρ(висота, центр) = ${R.spearman(vBars, tBars).toFixed(2)}, ${br.m.meta.bpm} BPM, нот ${br.s.notes.length}`);
  const text = describeProfile(rot.profile, null, rot).join(" ");
  check("Обертовий глобус: аудіоопис пояснює «звучить те, що зараз у центрі»", /Глобус обертається: звучить те, що зараз у центрі/.test(text) && /Глобус обертається/.test(br.m.meta.why.motion || ""), (text.match(/Тип руху[^.]*\.[^.]*\./) || [""])[0]);

  // 2) панорама над статичною картою
  const pan = await analyzeSource(openSynthetic("pan-map"), { useCache: false });
  const bp = await build(pan);
  check("Панорама над статичною картою: тип руху = camera-pan-zoom; подій від руху камери немає", pan.motion?.type === "camera-pan-zoom" && pan.events.length === 0 && pan.hotspots.length === 0,
    `${pan.motion?.type} — ${pan.motion?.why}; подій ${pan.events.length} (було б ${pan.temporalBase.events.length})`);
  check("Панорама: рух камери не керує гучністю й темпом; музика є", motionSrc(bp.m) === 0 && bp.s.notes.length > 20, `джерел руху: ${motionSrc(bp.m)}, нот ${bp.s.notes.length}, провідна ознака: ${pan.leadFeature}`);

  // 3) карта на місці лишається temporal; ручний вибір повертає «часове» читання
  const types = {};
  for (const id of ["globe", "flatmap", "dark-lights"]) types[id] = (await analyzeSource(openSynthetic(id), { useCache: false })).motion?.type;
  check("Нерухомі карти й глобус зі змінними даними лишаються temporal", Object.values(types).every(t => t === "temporal"), Object.entries(types).map(([k, v]) => `${k}: ${v}`).join(", "));
  const back = applyMotion(rot, "temporal"), again = applyMotion(back, "rotating-globe");
  check("Тип руху можна змінити вручну: temporal повертає події й провідну ознаку, rotating-globe — знову центр диска",
    back.motion.type === "temporal" && !back.motion.auto && back.events.length === rot.temporalBase.events.length && back.leadFeature === rot.temporalBase.leadFeature && again.leadFeature === "centerValue" && again.events.length === 0,
    `temporal: ${back.leadFeature}, подій ${back.events.length}; rotating-globe: ${again.leadFeature}`);
  const forced = await analyzeSource(openSynthetic("rotating-globe"), { useCache: false, motion: "temporal" });
  check("Галерея (motion: temporal): аналіз без поля motion — поведінка як раніше", forced.motion === undefined && forced.temporalBase === undefined && forced.events.length === rot.temporalBase.events.length, `подій ${forced.events.length}, провідна ознака ${forced.leadFeature}`);
});
