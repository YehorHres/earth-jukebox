# FINAL-REPORT — PROMPT-final (блоки A → H)

## Блок A — золотий тест (тег `safe-10a`)
- `tests/golden-scores.json` + `goldenHash` (`src/audio/report.js`): BPM, тональність, розмір, усі ноти з інструментами, панорамою й шарами; перерахунок — `tools/golden.html`.
- Нові тести живуть у `src/tests-final.js`; `test.html?only=golden,…` — швидкий прогін вибраних наборів.
- test.html: 126/126 зелені. Клавіатурний тест тепер чекає на aria-live до 3 с (у фоновій вкладці таймери сповільнені) — умова перевірки та сама.
