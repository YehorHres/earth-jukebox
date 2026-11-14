// Таблиця мапінгу для журі й скрінрідера: які ознаки й з якими внесками керують музикою зараз.
import { PARAM_LABEL, PARAMS, sourceLabel } from "../mapping/mapper.js";
import { CURVE_LABEL } from "../mapping/curves.js";

const fmt = v => (v >= 0 ? "" : "−") + Math.abs(v).toFixed(2);

export function createMappingTable(root) {
  let mapping = null, preset = null, analysis = null, lastBar = -1;

  function renderStatic() {
    const m = mapping.meta;
    root.replaceChildren();
    const intro = document.createElement("p");
    intro.className = "keys";
    intro.textContent = `Пресет: ${m.presetTitle}. Темп ${m.bpm} BPM — ${m.tempoWhy.toLowerCase()}. ${m.scaleNote}`;
    root.appendChild(intro);
    const t = document.createElement("table");
    t.className = "mapping";
    t.innerHTML = `<caption class="sr-only">Як дані керують музикою: параметр, поточне значення, внески ознак</caption>
      <thead><tr><th scope="col">Музичний параметр</th><th scope="col">Зараз</th><th scope="col">Звідки (внесок)</th></tr></thead><tbody></tbody>`;
    const tb = t.tBodies[0];
    for (const name of [...PARAMS, "orchestration", "accent", "contour"]) {
      const def = preset.params[name];
      const tr = document.createElement("tr");
      tr.dataset.param = name;
      const why = def?.why || (name === "contour" ? preset.contour.why : name === "accent" ? preset.accent.why : "Форма треку (вступ → наростання → кульмінація → розв'язка) разом з енергією даних");
      const sources = def ? def.sources.map(s => `${sourceLabel(analysis, s)} ×${s.weight}${s.curve !== "linear" ? `, ${CURVE_LABEL[s.curve]}` : ""}${s.invert ? ", інверсія" : ""}`).join("; ") : "";
      tr.innerHTML = `<th scope="row"></th><td class="num"></td><td></td>`;
      tr.cells[0].textContent = PARAM_LABEL[name] || name;
      tr.cells[0].title = why;
      tr.cells[2].title = sources;
      const whyEl = document.createElement("div");
      whyEl.className = "keys";
      whyEl.textContent = why;
      tr.cells[2].append(document.createElement("span"), whyEl);
      tb.appendChild(tr);
    }
    root.appendChild(t);
  }

  function update(barIndex) {
    if (!mapping || barIndex === lastBar) return;
    lastBar = barIndex;
    const bar = mapping.bars[Math.max(0, Math.min(mapping.bars.length - 1, barIndex))];
    for (const tr of root.querySelectorAll("tr[data-param]")) {
      const name = tr.dataset.param, v = bar.params[name];
      if (name === "contour") {
        const notes = v.filter(x => x !== null).length;
        tr.cells[1].textContent = `${notes}/16 нот`;
        tr.cells[2].firstChild.textContent = "колонки кадру зліва направо; ";
        continue;
      }
      const span = name === "pan" ? (v + 1) / 2 : v;
      tr.cells[1].innerHTML = `<span class="bar" style="width:${Math.round(span * 40)}px"></span> ${fmt(v)}`;
      const parts = (bar.explain[name] || []).slice(0, 3)
        .map(q => q.missing ? `${q.source}: немає` : `${q.source} ${q.contrib >= 0 ? "+" : "−"}${Math.abs(q.contrib).toFixed(2)}`);
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
      const say = n => { const q = top(n); return q ? `${PARAM_LABEL[n].split(" (")[0]} ${bar.params[n].toFixed(1)} — найбільше від «${q.source}»` : null; };
      return ["energy", "tension", "brightness"].map(say).filter(Boolean).join("; ");
    },
  };
}
