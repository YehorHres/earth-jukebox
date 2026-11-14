// Компактна серіалізація аналізу в JSON (samples/<id>.analysis.json) — для миттєвого демо.
// Типізовані масиви → округлені числа; маски → base64; із зон лишаємо те, що читає мапер
// (cols, colsCover, bands, hemi) — сітку вже «згорнуто» в гарячі точки й склейки.

const r5 = v => (Number.isFinite(v) ? Math.round(v * 1e5) / 1e5 : 0);
const arr = a => Array.from(a, r5);
const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const mapObj = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));

export function serializeAnalysis(a) {
  const { staticMask, landMask, bgMask, overlayMask, regionMask, ...profile } = a.profile;
  return {
    format: "earth-jukebox-analysis", version: a.version,
    profile: { ...profile, masks: { staticMask: b64(staticMask), landMask: b64(landMask), bgMask: b64(bgMask), overlayMask: b64(overlayMask), ...(regionMask && { regionMask: b64(regionMask) }) } },
    rate: a.rate, count: a.count, times: arr(a.times), valid: Array.from(a.valid),
    abs: mapObj(a.abs, arr), rel: mapObj(a.rel, arr), temporal: mapObj(a.temporal, arr), rank: mapObj(a.rank, arr),
    zones: a.zones.map(z => ({ cols: z.cols.map(v => (v === null ? null : r5(v))), colsCover: z.colsCover.map(r5), bands: mapObj(z.bands, v => (v === null ? null : r5(v))), hemi: z.hemi })),
    norm: a.norm, labels: a.labels, events: a.events, cuts: a.cuts, period: a.period, climax: a.climax,
    hotspots: a.hotspots.map(({ series, ...h }) => h),
    keyFeatures: a.keyFeatures, mainFeature: a.mainFeature, leadFeature: a.leadFeature,
    seconds: a.seconds, processor: a.processor, createdAt: new Date().toISOString(),
  };
}

export function deserializeAnalysis(j) {
  if (j.format !== "earth-jukebox-analysis") throw new Error("невідомий формат аналізу");
  const { masks, ...profile } = j.profile;
  const f32 = o => mapObj(o, v => Float32Array.from(v));
  return {
    ...j,
    profile: { ...profile, ...mapObj(masks, unb64) },
    times: Float32Array.from(j.times), valid: Uint8Array.from(j.valid),
    abs: f32(j.abs), rel: f32(j.rel), temporal: f32(j.temporal), rank: f32(j.rank),
  };
}
