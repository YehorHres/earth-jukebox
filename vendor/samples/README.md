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
| `tuba/` | tuba | F1 B♭1 E♭2 B♭2 D3 |
| `trombone/` | trombone | E♭2 A♭2 C3 F3 B♭3 D4 |
| `trumpet/` | trumpet | F3 A3 E♭4 G4 D5 F5 |
| `saxophone/` | saxophone | D3 F♯3 B♭3 D4 F♯4 B♭4 D5 |
| `organ/` | organ | C2 F♯2 C3 F♯3 C4 F♯4 C5 |
| `harmonium/` | harmonium | C3 E3 A♭3 C4 E4 A♭4 C5 |
| `xylophone/` | xylophone | G4 C5 G5 C6 G6 C7 |
| `guitar/` | guitar-acoustic | E2 A♭2 C3 E3 A♭3 C4 E4 A♭4 |
| `eguitar/` | guitar-electric | E2 A2 C3 F♯3 C4 F♯4 A4 |

Віолончель, кларнет, фагот, бас-гітара й нейлонова гітара в джерелі не входять до переліку CC-BY 3.0,
тому їх не використовуємо — замість них синтезатори. Струнна група (педи), челеста, дзвони, хор, ударні
й текстури — власні синтезатори (`src/audio/instruments.js`, `src/audio/synths-topic.js`).
