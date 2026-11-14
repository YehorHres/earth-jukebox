# План Earth Jukebox v2

Деталі двигуна — у `docs/PROMPT-v2-engine.md` (ТЗ). Цей файл — короткий робочий план:
структура, формати між шарами, порядок етапів і їхній стан.

## Ключові рішення
1. **Без збірки.** Нативні ES-модулі, працює з `python -m http.server` і на GitHub Pages.
   Tone.js — з CDN (запасний варіант — власні Web Audio синтезатори, музика ніколи не мовчить).
2. **Спершу зрозуміти все відео, потім писати музику.** Два проходи аналізу:
   A — огляд 32 кадрів (профіль відео), B — кожен кадр у Web Worker.
3. **Темп сталий на трек**, такт = фіксований відрізок відео. «Прискорення» — дрібністю ритму.
   Відео підлаштовується під музику (дрейф > 80 мс → перемотка).
4. **Детермінованість:** seeded RNG, ключ — ім'я+розмір+тривалість файлу.
5. **Чесність:** два канали ознак — `abs` (фізична шкала) і `rel` (у межах відео, p5..p95,
   м'яке коліно нижче рівня шуму). Коефіцієнт підсилення показуємо в UI та explain.
6. **Пояснюваність:** кожен параметр такту несе `explain` — внески ознак.
7. **Джерела кадрів — один інтерфейс** (`media/sources.js`): відео, фото, синтетичне відео
   (для тестів «темне відео з малими змінами» та «статичне відео» без ffmpeg).

## Структура
```
index.html  test.html          ← застосунок і автотести (розділ 8 ТЗ)
samples/catalog.json           ← галерея: src[webm,mp4], опис, sceneType/legend (необов'язково)
samples/<id>.analysis.json     ← готовий аналіз для миттєвого демо
src/
  main.js  style.css
  util/      rng.js stats.js
  media/     sources.js (video / image / synthetic)  frames.js (зчитування в ImageData)
  analysis/  pass-a.js (профіль відео)  pass-b.js (кожен кадр, керує worker)
             worker.js  frame-context.js  normalize.js (abs/rel)  temporal.js  events.js  cache.js
  features/  registry.js  basic.js  scene.js (heatmap / nightlights / truecolor)  zones.js
  mapping/   presets/{default,heatmap,nightlights,truecolor}.json  curves.js  mapper.js
  composer/  theory.js form.js harmony.js humanize.js composer.js
             parts/{bass,pad,arp,drums,melody,counter,accents,stars}.js
  audio/     instruments.js engine.js player.js
  a11y/      announcer.js describe.js legend.js
  ui/        timeline.js mapping-table.js readout.js
```

## Формати між шарами
- **Профіль відео (прохід A):** `{ sceneType, confidence, staticMask, landMask, bgMask, ranges,
  noiseFloor, changeScale, changeRatio, cuts, period, durationSec, maskW, maskH }`
- **Шар 1 (прохід B), кадр:** `{ time, features: { name: abs }, zones: { cols, rows, bands, hemi } }`
  + після нормалізації `rel: { name: rel }`, часові `name.d1/.speed10/.accel20/.trend40/.pos/.globalRank`,
  та `events: [{ type, frame, time, feature, strength }]`, `norm: { name: { p5, p95, gain, scale } }`.
- **Шар 2, такт:** `{ bar, t0, dur, params: { energy, density, tension, brightness, register, pan,
  motion, accent, contour[16], orchestration, articulation, space, section }, explain: { param: [[source, contrib]] } }`
- **Шар 3:** `score = { bpm, key, sections, notes: [{ part, t, midi, dur, vel, pan }] , fx: [...] }`

## Етапи (розділ 9 ТЗ) і стан
| # | Етап | Стан |
|---|------|------|
| 1 | Прохід A + videoProfile + картка «що зрозумів» | ✅ test.html: 11/11 |
| 2 | Прохід B у Worker + abs/rel + temporal + події + кеш | ✅ test.html: 20/20; ECCO2 ≈ 37 с (400 кадрів) |
| 3 | Мапінг-пресети + mapper з explain | ✅ test.html: 27/27 |
| 4 | Композитор: форма + гармонія + бас/педи/арпеджіо/ударні → звучить | ✅ test.html: 35/35, звук перевірено офлайн-рендером і в реальному часі |
| 5 | Мелодія фразами + контрмелодія + акценти подій | ✅ test.html: 42/42 (мелодія ρ=0.52 з даними колонки) |
| 6 | Семпли (Sampler) із запасом на синтезатори | ✅ test.html: 45/45; 6 інструментів CC-BY 3.0 у vendor/samples (~9 МБ) |
| 7 | UI: таймлайн, таблиця мапінгу, mute/solo, a11y | ✅ test.html: 47/47; сценарій лише з клавіатури пройдено; мобільна ширина без горизонтального скролу |
| 8 | `samples/*.analysis.json`, друге відео в галерею | ✅ ECCO2 + «Земля вночі» (SVS 30082), старт ≈ 1.3 с; test.html 47/47 |
| 9 | Тема (topic) + голос/текст, звукові профілі тем | ✅ test.html 55/55 |
| 10 | Область даних, шкала кольорів, стійкість, сканування фото | ✅ test.html 73/73 (IoU 0.98–1.0 на 11 синтетичних сценах) |
| 11 | Бібліотека звуків (15 семплів CC-BY, 46 синтезаторів), набори ударних, стилі | ✅ test.html 77/77 |
| 12 | Режим дослідження «дотик до карти» (клавіатура, миша, дотик, вібрація) | ✅ test.html 82/82, сценарій лише з клавіатури |
| 13 | Демо: 5 відео NASA з картками й готовими аналізами, голосовий вступ, README | ✅ test.html 85/85; деплой — чекає репозиторію GitHub |
| 15 | Область даних для відео учасників: фон у кожному кадрі, дата/текст, рух камери (події в русі не народжуються), 3 синтетичні сцени | ✅ test.html 97/97 |
| v4-14 | Мікс і мастеринг: EQ партій, −16 LUFS, стеля −1 dBFS, баланс L/R, audio-report | ✅ test.html 93/93; звіт 5 треків у межах критеріїв |

## Рішення, ухвалені під час роботи
- **Формат шару 1 — колонковий** (`analysis.abs[f][i]`, `rel`, `temporal`), бо так у 10× компактніше
  й швидше для мапера. Формат кадру з CLAUDE.md дає `getFrame(analysis, i)`.
- **Масштаб змін рахуємо по зонах 16×8**, не по середньому кадру: середнє «топить» локальні зміни.
  Ряди 3 найактивніших зон стають ознаками `hotspot1..3` (солісти). Провідна ознака (`leadFeature`) —
  перша значуща з: «історія» сцени → головна → hotspot1 → ключові.
- **Незначуща ознака** (розмах < 4× шуму) не має подій і часових ознак (= 0).
- **Швидкість аналізу:** перемотка відео ~50–100 мс/кадр (декодер стартує з ключового кадру), тому
  ціль — 400 кадрів, відео ділиться на 4 відрізки з власними копіями й Worker-ами. ECCO2 ≈ 37 с
  у середовищі розробки; для галереї — готовий `samples/*.analysis.json` (миттєво), плюс кеш IndexedDB.
- Стрибки кожні 4 с у ECCO2 — ключові кадри стиснення, не події; пороги склейок їх не чіпляють.

## Спрощення, якщо не встигаємо
- K-Means кольорових кластерів — на сітці 32×16, k ≤ 6, 6 ітерацій.
- `chart` — лише базові ознаки (як у ТЗ).
- Друге реальне відео NASA — якщо немає часу знайти й конвертувати, у галереї лишається
  синтетичне «нічне» відео як демонстрація адаптації масштабу.
