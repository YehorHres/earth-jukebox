// Тести PROMPT-v10: кожна скарга людей після прослуховування має числову перевірку.
// Оригінали польових відео не комітимо — тести читають їхні готові аналізи tests/field/<id>.analysis.json
// (створює tools/field-capture.html; ознаки «кількості» рахує src/features/quantity.js).
export const V10_SUITES = [];

export const FIELD = {
  gedi: { svs: 4950, topic: "vegetation", file: "GEDI_global_w_colorbar_1080p60.mp4" },
  dixie: { svs: 4993, topic: "fires", file: "Dixie_fire_2021_1080p60.mp4" },
  iss: { svs: 5011, topic: "storms", file: "iss_lightning_sphere_07312023.mp4" },
  co2: { svs: 5196, topic: "co2", file: "dyamondPointCloud_12-1-2023b_dyamond_co2_anim_globe_orbit_1080p30_h265 (1).mp4" },
  nightlights: { svs: 5313, topic: "nightlights", file: "nightlights_flat_series_and_change_wZooms_13_EIC_2160p30_h265.mp4" },
  airquality: { svs: 5533, topic: "aerosols", file: "AirQuality_SphereWithLabels_5760x3240.mp4" },
  ocean: { svs: 5425, topic: "ocean-currents", file: "perpetual_ocean2_beauty_hw5x3_810p30_5.mp4" },
};

const tracks = {};
/** Трек польового відео з фікстури: { analysis, mapping, score, topic }. root — шлях до кореня сайту. */
export function fieldTrack(id, root = "") {
  return (tracks[root + id] ||= (async () => {
    const [{ deserializeAnalysis }, { presetFor, mapAnalysis }, { compose }, T, { resolvePolarity }] = await Promise.all([
      import("./analysis/serialize.js"), import("./mapping/mapper.js"), import("./composer/composer.js"), import("./topics/topics.js"), import("./analysis/palette.js")]);
    await T.loadTopics();
    const res = await fetch(`${root}tests/field/${id}.analysis.json`);
    if (!res.ok) throw new Error(`немає фікстури tests/field/${id}.analysis.json`);
    const analysis = deserializeAnalysis(await res.json()), f = FIELD[id], topic = T.getTopic(f.topic);
    const pol = resolvePolarity("auto", analysis.profile, topic);
    const mapping = mapAnalysis(analysis, await presetFor(analysis.profile.sceneType, topic), { topic, polarity: pol.pol, name: f.file });
    const score = compose(mapping, { seed: `${f.file}|${mapping.meta.topic}` });
    return { id, analysis, mapping, score, topic };
  })());
}

/** Середнє ряду кадрів за такт. */
export const perBar = (tr, series) => tr.mapping.bars.map(b => b.frames.reduce((s, i) => s + series[i], 0) / b.frames.length);
/** Такти без вступу й останнього такту (у них гучність і склад обмежує форма, а не дані). */
export const bodyBars = tr => tr.mapping.bars.map((_, i) => i).filter(i => tr.mapping.bars[i].section !== "intro" && i < tr.mapping.bars.length - 1);
const mean = a => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0);
const f2 = v => (Number.isFinite(v) ? v.toFixed(2) : "—");

// 1. Гучність = кількість даних на видимій поверхні, а не площа на екрані
V10_SUITES.push(async function v10quantity(check) {
  const R = await import("./audio/report.js"), { levelDb } = await import("./audio/engine.js");
  const loud = tr => tr.mapping.bars.map((_, b) => levelDb(tr.mapping, b));
  const voicePitch = tr => { const by = tr.mapping.bars.map(() => []); for (const n of tr.score.notes) if (n.part === "dataVoice") by[Math.min(by.length - 1, Math.floor((n.t + 1e-6) / tr.score.barDur))].push(n.midi); return by.map(x => (x.length ? mean(x) : null)); };

  // ISS 5011 (блискавки): скарга — «3 точки на початку дуже голосно, планета вся в точках — тихіше»
  const iss = await fieldTrack("iss"), bi = bodyBars(iss), li = loud(iss), pi = perBar(iss, iss.analysis.abs.pointShare);
  const rIss = R.spearman(bi.map(i => li[i]), bi.map(i => pi[i]));
  const order = bi.slice().sort((x, y) => pi[x] - pi[y]), k = Math.max(2, Math.round(order.length * 0.15));
  const few = mean(order.slice(0, k).map(i => li[i])), many = mean(order.slice(-k).map(i => li[i]));
  check("v10 §1 ISS (блискавки): гучність іде за часткою точок на видимому диску (ρ ≥ 0.7); фаза «кілька точок» тихіша за «планета вся в точках»",
    iss.mapping.meta.quantity?.kind === "points" && rIss >= 0.7 && many - few >= 4,
    `ρ = ${f2(rIss)}; «кілька точок» ${f2(few)} дБ, «вся в точках» ${f2(many)} дБ (різниця ${f2(many - few)} дБ); тип «кількості»: ${iss.mapping.meta.quantity?.kind}`);
  const si = perBar(iss, iss.analysis.abs.surface), rSurf = R.spearman(bi.map(i => li[i]), bi.map(i => si[i]));
  const early = bi.filter(i => i < iss.mapping.bars.length * 0.12);
  check("v10 §1 ISS: наближення планети на початку (диск росте, точок мало) не робить трек гучним — початок тихіший за середину треку",
    early.length > 0 && mean(early.map(i => li[i])) < mean(bi.map(i => li[i])),
    `початок ${f2(mean(early.map(i => li[i])))} дБ, увесь трек ${f2(mean(bi.map(i => li[i])))} дБ; ρ(гучність, площа диска) = ${f2(rSurf)}`);

  // CO₂ 5196: скарга — «Африка (менше CO₂) голосніша за Південну Америку (більше)»
  const co2 = await fieldTrack("co2"), bc = bodyBars(co2), lc = loud(co2), cv = perBar(co2, co2.analysis.abs.centerValue), vp = voicePitch(co2);
  const rL = R.spearman(bc.map(i => lc[i]), bc.map(i => cv[i])), bp = bc.filter(i => vp[i] !== null), rP = R.spearman(bp.map(i => vp[i]), bp.map(i => cv[i]));
  const rPos = R.spearman(bc.map(i => lc[i]), bc.map(i => i)), rData = R.spearman(bc.map(i => cv[i]), bc.map(i => i));
  check("v10 §1 CO₂: гучність і висота голосу даних ідуть за значенням у центрі диска (ρ ≥ 0.7); позиція в треку нічого не додає (|ρ| < 0.3 або не більше, ніж у самих даних)",
    rL >= 0.7 && rP >= 0.7 && (Math.abs(rPos) < 0.3 || Math.abs(rPos) <= Math.abs(rData) + 0.1), `ρ(гучність, centerValue) = ${f2(rL)}; ρ(висота, centerValue) = ${f2(rP)}; ρ(гучність, позиція в треку) = ${f2(rPos)}; у самих даних ρ(centerValue, позиція) = ${f2(rData)}`);

  // Perpetual Ocean 5425: скарга — «наближення до білої затоки на весь екран — голосно, вся планета — тихо»
  const oc = await fieldTrack("ocean"), bo = bodyBars(oc), lo = loud(oc), so = perBar(oc, oc.analysis.abs.surface);
  const rO = R.spearman(bo.map(i => lo[i]), bo.map(i => so[i]));
  check("v10 §1 Океан: гучність не залежить від площі диска на екрані (|ρ| < 0.3)", Math.abs(rO) < 0.3,
    `ρ(гучність, площа видимої поверхні) = ${f2(rO)}; площа ${f2(Math.min(...so))}…${f2(Math.max(...so))} кадру`);

  // форма — лише з «кількості»: вступ ≤ 2 такти; кульмінація — там, де даних найбільше; більше → узгоджено все
  const all = await Promise.all(Object.keys(FIELD).map(id => fieldTrack(id).catch(() => null))), ok = all.filter(Boolean), bad = [];
  for (const tr of ok) {
    const m = tr.mapping, q = m.bars.map(b => b.params.quantity), intro = m.meta.sections.find(s => s.id === "intro"), cl = m.meta.sections.find(s => s.id === "climax");
    if (!m.meta.quantity) { bad.push(`${tr.id}: немає «кількості»`); continue; }
    if (intro.b1 - intro.b0 > 2) bad.push(`${tr.id}: вступ ${intro.b1 - intro.b0} такти`);
    if (cl) { const w = mean(q.slice(cl.b0, cl.b1)), res = m.meta.sections.find(s => s.id === "resolution"), top = Math.max(...q.map((_, i) => (i >= intro.b1 && i + cl.b1 - cl.b0 <= res.b0 ? mean(q.slice(i, i + cl.b1 - cl.b0)) : 0))); if (w < top - 0.02) bad.push(`${tr.id}: кульмінація не в максимумі (${f2(w)} < ${f2(top)})`); }
    const b = bodyBars(tr);
    for (const p of ["energy", "tension", "register", "bright"]) { const r = R.spearman(b.map(i => q[i]), b.map(i => m.bars[i].params[p])); if (r < 0.9) bad.push(`${tr.id}: ${p} ρ = ${f2(r)}`); }
  }
  check("v10 §1: форма треку — лише з «кількості» (вступ ≤ 2 такти, кульмінація там, де даних найбільше); більше даних → узгоджено енергія, напруга, регістр і яскравість тембру",
    ok.length === Object.keys(FIELD).length && !bad.length, bad.join("; ") || ok.map(t => `${t.id}: ${t.mapping.meta.quantity.kind}`).join(", "));
});
