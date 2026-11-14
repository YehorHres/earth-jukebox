# Семпли інструментів

Джерело: [nbrosowsky/tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) (Nicholaus P. Brosowsky).
Семпли поширюються за ліцензією **[CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/)**
(перелік інструментів під CC-BY 3.0 — у README репозиторію: contrabass, flute, french-horn, harp, piano, violin…).

Ми взяли по 5–8 нот на інструмент (решту висот відтворюємо зміною швидкості найближчого семпла):

| Папка | Інструмент у джерелі | Ноти |
|---|---|---|
| `piano/` | piano | C3 F♯3 C4 F♯4 C5 F♯5 C6 |
| `violin/` | violin | G3 C4 E4 A4 C5 E5 A5 C6 |
| `flute/` | flute | C4 E4 A4 C5 E5 A5 C6 |
| `harp/` | harp | C3 G3 D4 A4 E5 B5 F6 |
| `contrabass/` | contrabass | G1 C2 E2 A2 C♯3 E3 |
| `horn/` | french-horn | C2 G2 D3 F3 C4 |

Віолончель, струнна група (педи), челеста, дзвони й ударні — синтезатори в `src/audio/instruments.js`
(семплів віолончелі в джерелі немає в переліку CC-BY, тому їх не використовуємо).
