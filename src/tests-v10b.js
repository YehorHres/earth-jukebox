// Тести PROMPT-v10, блоки 2, 3, 5, 10: точкові дані, пожежа (два голоси), «де більше», менше хаосу.
import { V10_SUITES, FIELD, fieldTrack, perBar, bodyBars } from "./tests-v10.js";

const f2 = v => (Number.isFinite(v) ? v.toFixed(2) : "—");
const barOf = (tr, n) => Math.min(tr.mapping.bars.length - 1, Math.floor((n.t + 0.03) / tr.score.barDur));
const countBy = (tr, pred) => { const c = tr.mapping.bars.map(() => 0); for (const n of tr.score.notes) if (pred(n)) c[barOf(tr, n)]++; return c; };

// 2. Точкові дані — принцип нічних вогнів, але свій характер
V10_SUITES.push(async function v10points(check) {
  const R = await import("./audio/report.js");
  const iss = await fieldTrack("iss"), co2 = await fieldTrack("co2");
  const rho = tr => { const c = countBy(tr, n => n.part === "points" && n.point), p = perBar(tr, tr.analysis.abs.pointShare), b = bodyBars(tr); return { r: R.spearman(b.map(i => c[i]), b.map(i => p[i])), total: c.reduce((x, y) => x + y, 0) }; };
  const a = rho(iss), b = rho(co2);
  check("v10 §2: звуків-точок за такт стільки, скільки точок на видимій поверхні (ρ ≥ 0.8) — блискавки ISS і хмара точок CO₂",
    a.r >= 0.8 && b.r >= 0.8 && a.total > 50 && b.total > 10, `ISS: ρ = ${f2(a.r)}, звуків ${a.total}; CO₂: ρ = ${f2(b.r)}, звуків ${b.total}`);
  const pts = iss.score.notes.filter(n => n.part === "points" && n.point), cr = pts.filter(n => n.ec), th = iss.score.notes.filter(n => n.thunder);
  const lag = th.length ? Math.min(...th.map(t => Math.min(...cr.filter(c => c.t <= t.t + 1e-6).map(c => t.t - c.t)))) : 0;
  const panRho = R.spearman(pts.map(n => n.pan), pts.map(n => n.col));
  check("v10 §2 блискавки: різкий тріск на місці точки (панорама = положення) + із затримкою далекий низький грім",
    iss.mapping.meta.pointStyle === "lightning" && cr.length === pts.length && th.length > 5 && panRho > 0.99 && th.every(t => t.ec.noise[0] < 300),
    `тріск: ${cr.length}, грім: ${th.length} (найближчий тріск перед громом — за ${f2(lag)} с, смуга ${th[0]?.ec.noise.slice(0, 2).join("→")} Гц); ρ(панорама, колонка) = ${f2(panRho)}`);
  const ev = iss.mapping.bars.flatMap(x => x.events).filter(e => e.flash), ec = iss.score.notes.filter(n => n.part === "earcons");
  check("v10 §2 блискавки: окремі спалахи — події зі звуком-знаком «блискавка» (було 0 подій)", ev.length >= 5 && ec.some(n => n.earcon === "lightning"),
    `подій-спалахів: ${ev.length}; знаків: ${ec.length} (${[...new Set(ec.map(n => n.earcon))].join(", ")})`);
  const cs = co2.score.notes.filter(n => n.part === "points" && n.point);
  check("v10 §2 CO₂: свій характер — м'які «хмари» (скло, подихи шуму), не тріск", co2.mapping.meta.pointStyle === "cloud" && cs.length > 0 && cs.every(n => n.inst === "glass") && co2.score.notes.some(n => n.part === "points" && n.ec && n.ec.noise[0] < 1000),
    `стиль: ${co2.mapping.meta.pointStyle}; інструменти точок: ${[...new Set(co2.score.notes.filter(n => n.part === "points").map(n => n.inst))].join(", ")}`);
});

// 3. Пожежа — два голоси: «горить зараз» і «вже згоріло»
V10_SUITES.push(async function v10fire(check) {
  const R = await import("./audio/report.js");
  const d = await fieldTrack("dixie"), m = d.mapping, b = bodyBars(d);
  const dr = d.score.notes.filter(n => n.part === "burned" && n.inst === "drone"), gray = perBar(d, d.analysis.abs.burnedShare);
  const byBar = m.bars.map(() => null); for (const n of dr) byBar[barOf(d, n)] = n;
  const idx = byBar.map((n, i) => (n ? i : -1)).filter(i => i >= 0);
  const mono = idx.every((i, k) => !k || (byBar[i].midi >= byBar[idx[k - 1]].midi && byBar[i].burned >= byBar[idx[k - 1]].burned - 1e-9));
  const bi = idx.filter(i => b.includes(i)), rG = R.spearman(bi.map(i => byBar[i].burned), bi.map(i => gray[i]));      // без вступу й останнього такту — як в інших тестах v10
  check("v10 §3 пожежа: дрон «уже згоріло» монотонно неспадний (висота й гучність) і йде за часткою сірого (ρ ≥ 0.9, без вступу й останнього такту)",
    idx.length >= m.bars.length - 1 && mono && rG >= 0.9, `тактів із дроном ${idx.length} з ${m.bars.length}; неспадний: ${mono}; ρ = ${f2(rG)}; висота ${byBar[idx[0]]?.midi} → ${byBar[idx[idx.length - 1]]?.midi}`);
  const fire = perBar(d, d.analysis.abs.fireShare), drums = m.bars.map(() => 0);
  for (const n of d.score.notes) if (n.part === "drums" && !n.fixed) drums[barOf(d, n)] += n.vel;      // без литавр на межах розділів (форма, не дані)
  const rD = R.spearman(b.map(i => drums[i]), b.map(i => fire[i]));
  const cr = countBy(d, n => n.part === "points" && n.point), rC = R.spearman(b.map(i => cr[i]), b.map(i => fire[i]));
  check("v10 §3 пожежа: ударні й тріск ідуть за активним вогнем (ρ ≥ 0.7), а не за згорілою площею", m.meta.quantity?.kind === "fire" && rD >= 0.7 && rC >= 0.7,
    `ρ(ударні, активний вогонь) = ${f2(rD)}; ρ(тріск, активний вогонь) = ${f2(rC)}; ρ(ударні, згоріле) = ${f2(R.spearman(b.map(i => drums[i]), b.map(i => gray[i])))}`);
  const ev = m.bars.flatMap(x => x.events).filter(e => e.flash), txt = m.meta.why.points || "";
  check("v10 §3 пожежа: опис «звучать два голоси…», звук-знак на нових осередках", m.meta.twoVoices && /Звучать два голоси: вогонь, що горить/.test(txt) && /площа, що вже згоріла/.test(txt) && ev.length > 0,
    `${txt.slice(0, 80)}…; нових осередків (подій): ${ev.length}`);
});

// 5. «Де більше» — для незрячих; 10. Менше хаосу
V10_SUITES.push(async function v10where(check) {
  const R = await import("./audio/report.js"), { EVENT_MIN_GAP } = await import("./mapping/mapper.js");
  const all = await Promise.all(Object.keys(FIELD).map(id => fieldTrack(id))), det = [], bad = [];
  for (const tr of all) {
    const solo = tr.score.notes.filter(n => n.part === "hotZone"), bars = tr.mapping.bars;
    // позиція максимуму — незалежно від мапера: колонка з найбільшою часткою точок / вогню (або найвищим значенням контуру) у такті
    const key = tr.mapping.meta.twoVoices ? "qf" : tr.mapping.meta.pointStyle ? "qp" : null;
    const truth = bars.map(bar => { const d = new Array(16).fill(0); if (key) for (const i of bar.frames) tr.analysis.zones[i][key].forEach((v, c) => (d[c] += v)); else bar.params.contour.forEach((v, c) => (d[c] = v === null ? 0 : tr.mapping.meta.polarity < 0 ? 1 - v : v)); return d.indexOf(Math.max(...d)); });
    const r = solo.length > 4 ? R.spearman(solo.map(n => n.pan), solo.map(n => truth[barOf(tr, n)])) : 0, same = new Set(solo.map(n => n.pan.toFixed(2))).size === 1;
    det.push(`${tr.id}: ρ = ${same ? "— (одна зона)" : f2(r)}, нот ${solo.length}`);
    if (!(solo.length > 4 && (same || r >= 0.8) && solo.every(n => Math.abs(n.pan - (-0.9 + 1.8 * bars[barOf(tr, n)].params.hot.col / 15)) < 1e-6))) bad.push(tr.id);
    if (!tr.mapping.meta.where?.uk || !tr.mapping.meta.where?.en) bad.push(`${tr.id}: немає тексту «де більше»`);
  }
  check("v10 §5: соліст «де більше» — панорама = горизонтальна позиція максимуму (ρ ≥ 0.8) на всіх 7 польових відео; є текст «де більше» (uk + en)", !bad.length, det.join("; ") + (bad.length ? ` — не пройшли: ${bad.join(", ")}` : ""));
  const dx = all.find(t => t.id === "dixie");
  check("v10 §5: словами — «найбільше — на заході / у центрі / на сході» для карти; для обертового глобуса — момент, коли максимум перед слухачем", /найбільше — (на заході|у центрі|на сході)/.test(dx.mapping.meta.where.uk) && all.filter(t => t.analysis.motion.type === "rotating-globe").every(t => /проходить перед слухачем/.test(t.mapping.meta.where.uk)),
    all.map(t => `${t.id}: ${t.mapping.meta.where.uk}`).join(" | "));
  const ev = all.map(tr => { const e = tr.mapping.bars.flatMap(x => x.allEvents).sort((p, q) => p.time - q.time); let gap = Infinity; for (let i = 1; i < e.length; i++) gap = Math.min(gap, e[i].time - e[i - 1].time); return { id: tr.id, n: e.length, gap, dur: tr.mapping.meta.duration }; });
  check(`v10 §10 менше хаосу: не більше однієї події на ${EVENT_MIN_GAP} с (AirQuality мав 90 подій за 60 с)`, ev.every(e => e.gap >= EVENT_MIN_GAP - 1e-6 && e.n <= e.dur / EVENT_MIN_GAP + 1),
    ev.map(e => `${e.id}: ${e.n} подій за ${Math.round(e.dur)} с`).join("; "));
});
