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

// C. Шкала без легенди (палітра кадру) і перемикач полярності «що означає більше»
FINAL_SUITES.push(async function palette(check) {
  const { openSynthetic } = await import("./media/sources.js");
  const { passA } = await import("./analysis/pass-a.js");
  const { analyzeSource } = await import("./analysis/analyze.js");
  const { scaleValue } = await import("./analysis/frame-context.js");
  const { resolvePolarity, scaleSense } = await import("./analysis/palette.js");
  const { PALETTES } = await import("./media/synthetic-scenes.js");
  const { presetFor, mapAnalysis } = await import("./mapping/mapper.js");
  const { compose } = await import("./composer/composer.js");
  const { describeProfile } = await import("./a11y/describe.js");
  const R = await import("./audio/report.js");
  const T = await import("./topics/topics.js");
  await T.loadTopics();

  // 1) зелена шкала й viridis без легенди → paletteValue монотонний
  const mono = {};
  for (const id of ["green-map", "viridis-map"]) {
    const p = await passA(openSynthetic(id), { autoPalette: true });
    const refs = p.scale?.found ? Float32Array.from(p.scale.refs.flat()) : null, color = PALETTES[id.split("-")[0]];
    // значення, які справді є у відео (0.1…0.82 і плями 0.85 та 1): палітра будується з кольорів кадру
    const vs = [...Array.from({ length: 15 }, (_, k) => 0.12 + k * 0.048), 0.85, 1], out = refs ? vs.map(v => scaleValue(refs, ...color(v))) : [];
    mono[id] = { p, rho: refs ? R.spearman(vs, out) : 0, miss: out.filter(x => x < 0).length, span: out.length ? Math.max(...out) - Math.min(...out) : 0 };
  }
  const g = mono["green-map"], v = mono["viridis-map"];
  check("Зелена шкала без легенди: палітру кадру знайдено, paletteValue монотонний (ρ ≥ 0.98), світліше = більше", g.p.scale?.palette && g.rho >= 0.98 && g.miss === 0 && g.span > 0.7 && g.p.sceneType === "heatmap",
    `${g.p.sceneDetected} → ${g.p.sceneType}; ρ = ${g.rho.toFixed(3)}, розмах ${g.span.toFixed(2)}, пояснена дисперсія ${g.p.palette?.explained?.toFixed(2)} — ${g.p.palette?.why}`);
  check("Viridis без легенди: paletteValue монотонний (ρ ≥ 0.98), фіолетове — менше, жовте — більше", v.p.scale?.palette && v.rho >= 0.98 && v.miss === 0 && v.span > 0.7,
    `${v.p.sceneDetected} → ${v.p.sceneType}; ρ = ${v.rho.toFixed(3)}, розмах ${v.span.toFixed(2)}, пояснена дисперсія ${v.p.palette?.explained?.toFixed(2)}`);
  const br = await passA(openSynthetic("flatmap"), { autoPalette: true }), off = await passA(openSynthetic("green-map"));
  check("Шкала «синій → червоний» читається як раніше (за відтінком); без autoPalette (галерея) палітра не вмикається", !br.scale.found && br.sceneType === "heatmap" && !off.scale.found && !off.palette, `flatmap: ${br.palette?.why}; green-map без autoPalette: шкала ${off.scale.found}`);

  // 2) повний аналіз зеленої карти: провідна ознака значуща, опис чесний
  const a = await analyzeSource(openSynthetic("green-map"), { useCache: false });
  const text = describeProfile(a.profile, null, a).join(" ");
  check("Зелена карта: головна ознака — значення за палітрою (не відтінок); опис каже «значення відносні»", a.profile.scale?.palette && ["warmth", "hotShare"].includes(a.leadFeature) && a.norm[a.leadFeature].significant && /значення відносні/.test(text) && /палітр/.test(a.labels[a.leadFeature] + a.labels.warmth),
    `провідна ознака: ${a.labels[a.leadFeature]}; тип руху: ${a.motion?.type}`);

  // 3) перемикач полярності обертає голос даних
  const topic = T.getTopic("vegetation"), preset = await presetFor(a.profile.sceneType, topic);
  const up = resolvePolarity("lighter", a.profile, topic), down = resolvePolarity("darker", a.profile, topic), auto = resolvePolarity("auto", a.profile, topic);
  const mUp = mapAnalysis(a, preset, { topic, polarity: up.pol }), mDown = mapAnalysis(a, preset, { topic, polarity: down.pol });
  const pitch = m => { const s = compose(m, { seed: "pol" }), by = m.bars.map(() => []); for (const n of s.notes) if (n.part === "dataVoice") by[Math.min(by.length - 1, Math.floor((n.t + 1e-6) / s.barDur))].push(n.midi); return by.map(x => (x.length ? x.reduce((p, q) => p + q, 0) / x.length : null)); };
  const pu = pitch(mUp), pd = pitch(mDown), idx = pu.map((_, i) => i).filter(i => pu[i] !== null && pd[i] !== null);
  const rhoV = R.spearman(mUp.bars.map(b => b.params.value), mDown.bars.map(b => b.params.value)), rhoP = R.spearman(idx.map(i => pu[i]), idx.map(i => pd[i]));
  check("Перемикач полярності («світліше» ↔ «темніше») обертає голос даних: значення й висота нот дзеркальні", up.pol === 1 && down.pol === -1 && auto.pol === 1 && rhoV <= -0.99 && rhoP <= -0.7 && mDown.meta.polarity === -1,
    `світліше: ${up.pol}, темніше: ${down.pol}; ρ значень = ${rhoV.toFixed(2)}, ρ висоти тактів = ${rhoP.toFixed(2)}; «${down.text}»`);
  const hs = scaleSense(br), warm = resolvePolarity("warmer", br, null), light = resolvePolarity("lighter", br, null);
  check("Полярність: для «синій → червоний» тепліше = більше; вибір озвучується зрозумілим реченням", hs.warmer === 1 && warm.pol === 1 && /тепліше/.test(warm.text) && /автоматично/.test(auto.text) && light.pol === 1, `${warm.text} | ${auto.text}`);

  // 4) UI: перемикачі є, підписані й приховані для галереї
  const html = await (await fetch("index.html")).text();
  check("UI: перемикачі «Що рухається у відео» й «Більше значення — це» мають підписи (label for) і підказки (aria-describedby)",
    /<label for="polarity">/.test(html) && /<select id="polarity" aria-describedby="polarity-hint">/.test(html) && /<label for="motionType">/.test(html) && /id="read-opts"[^>]*hidden/.test(html), "index.html");

  // 5) тема «висота лісу» / canopy height → vegetation
  const qs = ["висота лісу", "canopy height", "forest", "ліс"], got = qs.map(q => T.matchTopic(q).topic?.id);
  check("Тема: «висота лісу», «canopy height», «forest», «ліс» → vegetation", got.every(x => x === "vegetation"), qs.map((q, i) => `${q} → ${got[i]}`).join("; "));
});
