// Таблиця мапінгу для журі й скрінрідера: які ознаки й з якими внесками керують музикою зараз.
import { PARAM_LABEL, PARAMS, sourceLabel } from "../mapping/mapper.js";
import { CURVE_LABEL } from "../mapping/curves.js";
import { t, tr, hasKey, getLang } from "../i18n/index.js";

// у цьому файлі змінна tr — рядок таблиці, тому переклад — tr_
const tr_ = tr;
const fmt = v => (v >= 0 ? "" : "−") + Math.abs(v).toFixed(2);

export function createMappingTable(root) {
  let mapping = null, preset = null, analysis = null, lastBar = -1;

  function renderStatic() {
    const m = mapping.meta;
    root.replaceChildren();
    const intro = document.createElement("p");
    intro.className = "keys";
    intro.textContent = t("map.preset", { title: tr(m.presetTitle), note: tr(m.scaleNote) });
    root.appendChild(intro);
    // рішення всього треку з поясненнями (тембр = тема, ноти = дані)
    if (m.why) {
      const ul = document.createElement("ul");
      ul.className = "keys";
      for (const k of ["sound", "motion", "key", "tempo", "meter", "form"]) if (m.why[k]) ul.appendChild(Object.assign(document.createElement("li"), { textContent: tr(m.why[k]) }));
      // v10: точкові дані / пожежа (два голоси) і «де більше» — тексти з i18n (uk + en)
      const li = text => ul.appendChild(Object.assign(document.createElement("li"), { textContent: text }));
      if (m.why.points && m.pointStyle && hasKey(`why.points.${m.pointStyle}`, getLang())) li(t(`why.points.${m.pointStyle}`));
      if (m.motif) li(t("why.motif", { n: m.motif.notes.length }));
      if (m.texture) li(t(`why.texture.${m.texture}`));
      if (m.where) li(t("why.where", { where: m.where[getLang()] || m.where.uk }));
      root.appendChild(ul);
    }
    const tbl = document.createElement("table");
    tbl.className = "mapping";
    tbl.innerHTML = `<caption class="sr-only"></caption><thead><tr><th scope="col"></th><th scope="col"></th><th scope="col"></th></tr></thead><tbody></tbody>`;
    tbl.caption.textContent = t("map.caption");
    [t("map.colParam"), t("map.colNow"), t("map.colSrc")].forEach((x, i) => (tbl.tHead.rows[0].cells[i].textContent = x));
    const tb = tbl.tBodies[0];
    for (const name of [...PARAMS, "orchestration", "accent", "contour"]) {
      const def = preset.params[name];
      const tr = document.createElement("tr");
      tr.dataset.param = name;
      const why = tr_(def?.why || (name === "contour" ? preset.contour.why : name === "accent" ? preset.accent.why : null)) || t("map.formWhy");
      const sources = def ? def.sources.map(s => `${tr_(sourceLabel(analysis, s))} ×${s.weight}${s.curve !== "linear" ? `, ${tr_(CURVE_LABEL[s.curve])}` : ""}${s.invert ? t("map.invert") : ""}`).join("; ") : "";
      tr.innerHTML = `<th scope="row"></th><td class="num"></td><td></td>`;
      tr.cells[0].textContent = tr_(PARAM_LABEL[name] || name);
      tr.cells[0].title = why;
      tr.cells[2].title = sources;
      const whyEl = document.createElement("div");
      whyEl.className = "keys";
      whyEl.textContent = why;
      tr.cells[2].append(document.createElement("span"), whyEl);
      tb.appendChild(tr);
    }
    root.appendChild(tbl);
  }

  function update(barIndex) {
    if (!mapping || barIndex === lastBar) return;
    lastBar = barIndex;
    const bar = mapping.bars[Math.max(0, Math.min(mapping.bars.length - 1, barIndex))];
    for (const tr of root.querySelectorAll("tr[data-param]")) {
      const name = tr.dataset.param, v = bar.params[name];
      if (name === "contour") {
        const notes = v.filter(x => x !== null).length;
        tr.cells[1].textContent = t("map.notes", { n: notes });
        tr.cells[2].firstChild.textContent = t("map.columns");
        continue;
      }
      const span = name === "pan" ? (v + 1) / 2 : v;
      tr.cells[1].innerHTML = `<span class="bar" style="width:${Math.round(span * 40)}px"></span> ${fmt(v)}`;
      const parts = (bar.explain[name] || []).slice(0, 3)
        .map(q => q.missing ? t("map.missing", { s: tr_(q.source) }) : `${tr_(q.source)} ${q.contrib >= 0 ? "+" : "−"}${Math.abs(q.contrib).toFixed(2)}`);
      tr.cells[2].firstChild.textContent = (parts.join(" · ") || "—") + " ";
    }
  }

  return {
    set(m, p, a) { mapping = m; preset = p; analysis = a; lastBar = -1; renderStatic(); update(0); },
    update,
    /** Текст для скрінрідера: що зараз керує музикою. */
    describe(barIndex) {
      const bar = mapping.bars[barIndex];
      const top = n => (bar.explain[n] || []).filter(q => q.source !== "база" && !q.missing)[0];
      const say = n => { const q = top(n); return q ? t("map.mostFrom", { p: tr_(PARAM_LABEL[n]).split(" (")[0], v: bar.params[n].toFixed(1), s: tr_(q.source) }) : null; };
      return ["energy", "tension", "brightness"].map(say).filter(Boolean).join("; ");
    },
  };
}
