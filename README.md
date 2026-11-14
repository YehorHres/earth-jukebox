# Earth Jukebox — команда ANDD 🌍🎵
NASA Space Apps Challenge 2026 · челендж "Earth Jukebox"

Вебджукбокс, який перетворює візуалізації NASA Earth Information Center на живу музику,
щоб науку про Землю могли "побачити вухами" незрячі та слабозорі люди.

- `CLAUDE.md` — архітектура, рішення, правила (читати першим)
- `docs/plan-v2.md` — план v2 і стан етапів; `docs/PROMPT-v2-engine.md` — ТЗ двигуна
- `index.html` + `src/` — версія 2 (двигун «спершу зрозуміти все відео, потім писати музику»)
- `test.html` — автотести двигуна (розділ 8 ТЗ)
- `prototype/` — v1, запасне демо
- `samples/` — тестові візуалізації NASA і `catalog.json` галереї
- `docs/` — умова челенджу та банк ідей

## Запуск
```
python tools/serve.py
```
→ http://localhost:8000/ (застосунок), http://localhost:8000/test.html (автотести).

`tools/serve.py` — як `python -m http.server`, але з підтримкою Range (перемотування відео)
і без кешу. Звичайний `python -m http.server` теж працює: відео з галереї завантажується в пам'ять цілком.

## Атрибуція
- Відео: NASA/Goddard Space Flight Center Scientific Visualization Studio — ECCO2 (дані MIT/JPL) та
  «Rotating Earth at Night» (SVS 30082, дані Suomi NPP VIIRS, NASA Earth Observatory).
- Семпли інструментів (фортепіано, скрипка, флейта, арфа, контрабас, валторна, туба, тромбон, труба,
  саксофон, орган, фісгармонія, ксилофон, акустична й електрогітара):
  [nbrosowsky/tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments),
  ліцензія [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/). Деталі — `vendor/samples/README.md`.
- Решта звуків (струнна група, челеста, дзвони, ударні) — власні синтезатори на Web Audio.
