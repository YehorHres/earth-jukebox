// Англійський переклад текстів, які формують модулі звуку й аналізу (src/audio, src/composer, src/mapping,
// src/analysis, src/features). Самі модулі не змінюємо: UI перекладає їхні рядки на виході.
// Порядок: точний збіг → шаблон (регулярний вираз) → по реченнях → глосарій фраз усередині тексту.

const EXACT = {
  // --- інструменти (INSTRUMENT_LABEL)
  "голос даних (колір — від теми)": "data voice (colour from the topic)", "референсний тон": "reference tone", "клік шкали часу": "time-scale click",
  "звук-знак події": "event earcon", "струнні (легато)": "strings (legato)", "контрабас pizz.": "double bass pizz.", "віолончель": "cello",
  "глибокий дрон": "deep drone", "фортепіано": "piano", "арфа": "harp", "челеста": "celesta", "глокеншпіль": "glockenspiel", "дзвони": "bells",
  "скрипка": "violin", "флейта": "flute", "саб-бас": "sub-bass", "грім": "thunder", "туба": "tuba", "орган": "organ", "хор": "choir",
  "теплий пед": "warm pad", "холодний (скляний) пед": "cold (glass) pad", "тремоло струнних": "string tremolo", "піцикато струнних": "string pizzicato",
  "маримба": "marimba", "калімба": "kalimba", "скло": "glass", "флажолети": "harmonics", "FM-дзвони": "FM bells", "м'яке фортепіано (felt)": "felt piano",
  "кларнет": "clarinet", "фагот": "bassoon", "малий барабан": "snare drum", "вітер": "wind", "дощ": "rain", "хвилі": "waves", "тріск вогню": "fire crackle",
  "повітря": "air", "гранулярна текстура": "granular texture", "тромбон": "trombone", "труба": "trumpet", "саксофон": "saxophone", "фісгармонія": "harmonium",
  "ксилофон": "xylophone", "акустична гітара": "acoustic guitar", "електрогітара": "electric guitar", "ханпан": "handpan", "синт-лід": "synth lead",
  "синт-щипок": "synth pluck", "тарілка": "cymbal", "електронний бас-барабан": "electronic kick", "плеск": "clap", "хай-хет": "hi-hat", "том": "tom",
  "дерев'яна коробочка": "woodblock", "камінь": "stone", "крапля води": "water drop", "дерев'яний барабан": "log drum", "м'який удар": "soft kick",
  "щітка": "brush", "валторна": "French horn", "брас-стаб": "brass stab", "свел (як тарілка)": "swell (cymbal-like)", "перкусія (шейкер, литаври)": "percussion (shaker, timpani)",
  "шейкер": "shaker", "м'який барабан": "soft drum", "литаври": "timpani",
  // --- набори ударних
  "оркестровий (литаври, тарілки)": "orchestral (timpani, cymbals)", "ембієнт (м'які удари, щітки)": "ambient (soft hits, brushes)",
  "електронний (808, плеск, хай-хет)": "electronic (808, clap, hi-hat)", "«земний» (дерево, камінь, вода)": "“earthy” (wood, stone, water)", "оркестровий": "orchestral",
  // --- партії
  "Акценти подій": "Event accents", "Піки й рекорди — дзвони, перетин рекордного рівня — брас, зміна режиму — литаври, свел перед розділом": "Peaks and records — bells; crossing a record level — brass; regime change — timpani; a swell before each section",
  "Арпеджіо": "Arpeggio", "Дрібність (чверті → восьмі → шістнадцяті) = швидкість змін; рух даних — «хвиля» вгору-вниз": "Subdivision (quarters → eighths → sixteenths) = speed of change; data movement is a “wave” up and down",
  "Бас": "Bass", "Загальний рівень даних: тоніка/квінта на сильних долях, рух — за трендом": "Overall data level: tonic/fifth on strong beats, movement follows the trend",
  "Контрмелодія": "Countermelody", "Відповідає мелодії в парних тактах фрази; ведучі тони гармонії; лише в наростанні й кульмінації": "Answers the melody in even bars of a phrase; guide tones of the harmony; only in the build-up and climax",
  "Ударні": "Drums", "Перкусія за даними: спокій — тиша або щітки; ріст — половинний → звичайний → подвійний розмір; на піках — литаври, тарілки, брас-удари; на події — пауза": "Data-driven percussion: calm — silence or brushes; growth — half → normal → double time; peaks — timpani, cymbals, brass hits; on an event — a pause",
  "Голос даних": "Data voice", "Мелодія: мотив теми справжнім інструментом; більше → мотив вище, швидші зміни → дрібніший ритм; у кульмінації — подвоєння. Панорама — де на карті зосереджені дані": "Melody: the topic motif on a real instrument; more → the motif goes higher, faster change → finer rhythm; doubled at the climax. Panning shows where on the map the data is",
  "Солісти зон": "Zone soloists", "До двох зон карти, що найбільше відрізняються від решти: вище — більше; панорама — де зона (захід ліворуч, схід праворуч)": "Up to two map zones that differ most from the rest: higher = more; panning = where the zone is (west left, east right)",
  "Точка відліку": "Reference point", "Референсний тон: так звучить середнє значення за все відео — 1–2 с на початку треку (дрон-орієнтир — лише як опція)": "Reference tone: how the average value of the whole video sounds — 1–2 s at the start of the track (the drone guide is optional)",
  "Тіки шкали часу": "Time-scale ticks", "Опція (вимкнено за замовчуванням): дуже тихий клік на кожну одиницю часу (або кожні 10 с), сильніший — на кожен 4-й чи 12-й": "Option (off by default): a very quiet click for each time unit (or every 10 s), a stronger one on every 4th or 12th",
  "Ерікони подій": "Event earcons", "Фіксований короткий звук-знак теми на кожну подію (одна подія — один знак), точно в момент події": "A fixed short topic earcon for each event (one event — one sign), exactly at the moment of the event",
  "Мелодія": "Melody", "Сканує кадр зліва направо: вище нота — більше значення (тепліше / світліше) в цій смузі; суша — пауза": "Scans the frame left to right: a higher note means a larger value (warmer / brighter) in that strip; land is a rest",
  "Струнні (педи)": "Strings (pads)", "Гармонічна підкладка; гучність — енергія та кількість даних на кадрі": "Harmonic bed; loudness follows the energy and amount of data in the frame",
  "Вогники": "Lights", "Нічні вогні: кількість коротких дзвінких нот за такт = кількість світлових точок; стерео — де саме світло; кластер міст — акорд-дзвін": "Night lights: the number of short bell-like notes per bar = the number of light points; stereo shows where the light is; a city cluster rings a chord",
  "Текстура теми": "Topic texture", "Шум-текстура теми (дощ, вітер, хвилі, тріск…): інтенсивність — густота даних": "The topic's noise texture (rain, wind, waves, crackle…): intensity follows data density",
  // --- тембр теми (topic-color)
  "Нервові духові: на поривах (подія або висока напруга) — тремоло (flutter) у валторн і тромбонів": "Nervous winds: on gusts (an event or high tension) horns and trombones flutter",
  "«Задуха»: ріст величини закриває фільтр і звужує стерео, спад — розширює": "“Stifling”: a rising value closes the filter and narrows the stereo; a fall widens it",
  "М'яке фортепіано: менше льоду → темніший, «вологий» тембр (low-pass); у розв'язці — поодинокі ноти, що згасають": "Felt piano: less ice → a darker, “wetter” tone (low-pass); in the resolution, single fading notes",
  "Гіпнотичний пульс обертання: одна нота на долю; м'який пульс під вогниками: контраст — фільтром і гучністю; панорама вогника — де він на карті; темрява — тиша": "A hypnotic rotation pulse: one note per beat; a soft pulse under the lights: contrast through filter and loudness; each light is panned to where it is on the map; darkness is silence",
  "Легато; у прохолодних, спокійних епізодах — low-pass і нижчий регістр": "Legato; in cool, calm passages — low-pass and a lower register",
  "Вітер зі свистом": "Whistling wind", "Тріск стихії на спалахах (подіях)": "Crackling elements on flashes (events)",
  // --- лади, акорди, розміри, форма
  "лідійський": "Lydian", "мажор": "major", "міксолідійський": "Mixolydian", "дорійський": "Dorian", "мінор": "minor", "фригійський": "Phrygian",
  "тризвук": "triad", "септакорд": "seventh chord", "з ноною": "with a ninth", "кластер з малою секундою й тритоном": "cluster with a minor second and tritone",
  "затримка": "suspension",
  "4/4 (рівний)": "4/4 (even)", "3/4 (вальс)": "3/4 (waltz)", "6/8 (колисковий, пасторальний)": "6/8 (lullaby, pastoral)", "5/4 (неспокійний, 3+2)": "5/4 (restless, 3+2)",
  "Вступ": "Intro", "Наростання": "Build-up", "Кульмінація": "Climax", "Розвиток": "Development", "Розв'язка": "Resolution", "Тема": "Theme",
  "кульмінація з високою напругою — модуляція на тон вище": "high-tension climax — modulation up a whole tone",
  // --- ознаки, зони
  "Тепловий індекс": "Heat index", "холодно": "cold", "прохолодно": "cool", "тепло": "warm", "дуже тепло": "very warm", "Насиченість": "Saturation",
  "Яскравість": "Brightness", "Контраст": "Contrast", "Активна маса (частка даних)": "Active mass (data share)", "Частка суші": "Land share",
  "Вертикальний центр мас": "Vertical centre of mass", "Баланс захід/схід": "West/east balance", "захід": "west", "схід": "east", "рівно": "even",
  "Викиди > 3σ": "Outliers > 3σ", "Зміна між кадрами": "Frame-to-frame change", "Щільність контурів (Собель)": "Edge density (Sobel)", "Ентропія": "Entropy",
  "Кольорові кластери (K-Means)": "Colour clusters (K-Means)", "Частка гарячих зон": "Share of hot zones", "Частка холодних зон": "Share of cold zones",
  "Світло (лог-шкала)": "Light (log scale)", "Світлові точки": "Light points", "Кластери вогнів": "Light clusters", "Щільність агломерацій": "Urban density",
  "Частка темряви": "Darkness share", "Білизна (хмари/лід)": "Whiteness (clouds/ice)", "Зеленість (рослинність)": "Greenness (vegetation)", "Темно-синя вода": "Dark-blue water",
  "полярний північ": "polar north", "помірний північ": "temperate north", "тропіки": "tropics", "помірний південь": "temperate south", "полярний південь": "polar south",
  // --- параметри мапінгу й криві
  "Наповненість кадру (abs; гучність треку нормована до −16 LUFS)": "Frame fullness (abs; track loudness normalised to −16 LUFS)",
  "Енергія (гучність, к-сть інструментів)": "Energy (loudness, number of instruments)", "Густота ритму": "Rhythmic density", "Напруга (гармонія, дисонанс)": "Tension (harmony, dissonance)",
  "Світлість ладу": "Mode brightness", "Регістр мелодії": "Melody register", "Панорама (захід ↔ схід)": "Panning (west ↔ east)", "Рухливість": "Motion",
  "Артикуляція (легато ↔ стакато)": "Articulation (legato ↔ staccato)", "Простір (реверберація)": "Space (reverb)", "Акценти подій ": "Event accents ",
  "Крещендо / димінуендо (тренд за 20 кадрів)": "Crescendo / diminuendo (20-frame trend)", "Тутті ↔ соло (частка зон, що змінюються)": "Tutti ↔ solo (share of changing zones)",
  "Стакато (подія коротша за 5 кадрів)": "Staccato (event shorter than 5 frames)", "Оркестровка": "Orchestration", "Відносна енергія (гучність ≈ 12 дБ, кількість партій, ударні)": "Relative energy (≈ 12 dB loudness, number of parts, drums)",
  "Вогники (кількість нот за такт)": "Lights (notes per bar)", "Контур мелодії": "Melody contour", "Значення головної величини (висота голосу даних)": "Main value (pitch of the data voice)",
  "лінійна": "linear", "м'яка (S)": "smooth (S)", "експонента": "exponential", "корінь": "square root", "поріг": "threshold", "база": "base",
  "частка зон кадру, що змінюються": "share of changing frame zones", "подія коротша за 5 кадрів": "event shorter than 5 frames",
  "енергія даних, розтягнута в межах відео": "data energy, stretched within the video", "енергія даних": "data energy", "одиниця часу": "time unit",
  "Значущих змін немає: відносні значення не підсилюються, музика спокійна.": "No significant changes: relative values are not amplified, the music stays calm.",
  "Змін немає — спокійна форма без кульмінації": "No changes — a calm form without a climax", "Форма — за піками даних": "Form follows the data peaks",
  "Тему не вказано — нейтральний оркестр": "No topic given — neutral orchestra",
  // --- рух у відео
  "дані змінюються в часі (карта на місці)": "data changes over time (the map stays still)", "глобус обертається": "the globe rotates",
  "камера рухається над картою": "the camera moves over the map", "нерухоме зображення (сканування)": "still image (scanning)", "графік": "chart", "кілька панелей": "multiple panels",
  "Карта на місці: звучать зміни даних у часі.": "The map stays still: you hear how the data changes over time.",
  "Камера рухається над картою: звучить те, що зараз у кадрі. Рух камери не дає подій і не керує гучністю.": "The camera moves over the map: you hear what is in the frame right now. Camera movement creates no events and does not control loudness.",
  "один кадр або замало кадрів": "a single frame or too few frames", "короткий спалах у кадрі": "a short flash in the frame",
  "Значення в центрі диска (меридіан перед слухачем)": "Value at the centre of the disc (the meridian facing the listener)", "найвище значення в центрі диска": "highest value at the centre of the disc",
  // --- аналіз
  "найбільша площа теплої води": "largest area of warm water", "найбільше світла": "most light", "найбільше хмар і льоду": "most clouds and ice",
  "найвище значення": "highest value", "найяскравіший момент": "brightest moment", "Аналіз узято з кешу": "Analysis loaded from cache",
  "Готовий аналіз завантажено": "Precomputed analysis loaded", "Оцінка рівня шуму…": "Estimating the noise level…", "Огляд завершено": "Overview finished", "задано вручну": "set manually", "нульовий меридіан": "prime meridian",
  // --- палітра без легенди, полярність, формат відео (v7)
  "Значення за палітрою кадру": "Value from the frame palette", "Частка високих значень": "Share of high values", "Частка низьких значень": "Share of low values",
  "найбільша площа високих значень": "largest area of high values", "замало пікселів даних": "too few data pixels",
  "шкала «синій → червоний» — значення за відтінком": "a “blue → red” scale — values read from the hue",
  "кольори даних не лягають на одну шкалу": "the data colours do not fit a single scale", "кольори даних майже однакові": "the data colours are almost the same",
  "палітра надто бідна": "the palette is too poor", "палітру впорядковано за світлотою: світліше = більше": "the palette is ordered by lightness: lighter = more",
  "палітру впорядковано за відтінком: тепліше = більше": "the palette is ordered by hue: warmer = more", "палітру визначено з кольорів кадру": "the palette was derived from the frame colours",
  "автоматично": "automatic", "світліше": "lighter", "темніше": "darker", "тепліше (червоніше)": "warmer (redder)",
  "тепліше = більше": "warmer = more", "світліше = більше": "lighter = more", "червоне = більше": "red = more", "за шкалою в кадрі": "from the scale in the frame",
  "Браузер не може відтворити цей формат (ймовірно H.265/HEVC або дуже висока роздільність). Завантажте MP4 H.264 1080p зі сторінки NASA SVS або сконвертуйте файл.":
    "The browser cannot play this format (probably H.265/HEVC or a very high resolution). Download an MP4 H.264 1080p from the NASA SVS page or convert the file.",
  // --- типи відео: статичне, графік, кілька панелей (v8)
  "Дані у відео майже не змінюються, камера стоїть: кадр звучить як зображення — лінія сканування йде із заходу на схід.": "The data in the video barely changes and the camera is still: the frame sounds like an image — the scan line moves from west to east.",
  "Графік: час треку — це вісь x (зліва направо), висота голосу даних — висота лінії.": "Chart: track time is the x axis (left to right), the pitch of the data voice is the height of the line.",
  "У кадрі кілька панелей: звучить найбільша.": "There are several panels in the frame: the largest one is heard.",
  "Друга лінія — другий голос (нижче, праворуч); перетин ліній позначає короткий звук-знак.": "The second line is a second voice (lower, on the right); a crossing of the lines is marked by a short sound sign.",
  "зміни у відео менші за шум": "changes in the video are smaller than noise", "Висота лінії графіка": "Chart line height", "Висота другої лінії графіка": "Second chart line height",
  "перетин ліній графіка": "chart lines cross", "найвища точка лінії графіка": "highest point of the chart line",
  "знайдено одну лінію графіка": "one chart line found", "знайдено дві лінії графіка": "two chart lines found",
  "Другий голос (друга лінія графіка)": "Second voice (second chart line)",
  "Друга лінія графіка: вища лінія — вища нота; інший тембр, октавою нижче, у правому вусі": "Second chart line: a higher line is a higher note; a different timbre, an octave lower, in the right ear",
  "Дані": "Data", "Одиниці": "Units", "Кольори": "Colours", "Регіон": "Region", "Період": "Period", "Автори": "Authors",
  "Що означає «більше», джерело не пояснює — напрямок голосу даних визначено автоматично; його можна змінити перемикачем.": "The source does not explain what “more” means — the direction of the data voice was detected automatically; you can change it with the switch.",
  // --- пресети мапінгу: назви й пояснення
  "Універсальний (графіки й змішані візуалізації)": "Universal (charts and mixed visualizations)", "Теплова карта (температура, кольорова шкала)": "Heat map (temperature, colour scale)",
  "Нічна карта вогнів": "Night-lights map", "Супутниковий знімок у справжніх кольорах": "True-colour satellite image",
  "Концентрація росте й досягає рекордів — дисонанс і кластери": "Concentration rises to record levels — dissonance and clusters",
  "Регістр повільно піднімається знизу вгору разом із концентрацією": "The register slowly rises from low to high with the concentration",
  "Більше CO₂ — щільніша фактура": "More CO₂ — denser texture", "Що більше руху на кадрі, то швидший темп": "The more motion in the frame, the faster the tempo",
  "Загальна гучність — за абсолютною кількістю даних і яскравістю": "Overall loudness follows the absolute amount of data and brightness",
  "Більше даних на кадрі — гучніше й більше інструментів": "More data in the frame — louder, with more instruments", "Складність і рух — дрібніший ритм": "Complexity and motion — finer rhythm",
  "Зростання, викиди й хаос — напруга": "Growth, outliers and chaos — tension", "Холодні й світлі кольори — світлий лад; теплі й темні — темний": "Cool, light colours — a bright mode; warm, dark ones — a dark mode",
  "Активність угорі кадру — вищий регістр": "Activity at the top of the frame — higher register", "Ліва частина кадру — лівий канал, права — правий": "Left part of the frame — left channel, right part — right channel",
  "Рух — рухливість партій": "Motion — livelier parts", "Різкі зміни — стакато": "Sharp changes — staccato", "Темніше — більше простору": "Darker — more space",
  "Мелодія сканує кадр зліва направо: вище нота — більше значення в цій колонці": "The melody scans the frame left to right: a higher note means a larger value in that column",
  "Події — акценти": "Events — accents", "Площа вогню й кількість яскравих спалахів — густота ударів": "Fire area and the number of bright flashes — density of hits",
  "Більше спалахів і ріст площі пожеж — напруга": "More flashes and growing fire area — tension",
  "Що швидше рухаються течії на кадрі, то швидший темп усього треку": "The faster the currents move in the frame, the faster the whole track",
  "Загальна гучність за абсолютною кількістю даних і насиченістю кадру (abs): яскрава насичена карта звучить повніше": "Overall loudness follows the absolute amount of data and frame saturation (abs): a bright, saturated map sounds fuller",
  "Більше теплої води й швидші зміни — гучніше й більше інструментів": "More warm water and faster changes — louder, with more instruments",
  "Швидкість змін температури й «турбулентність» — дрібніший ритм (чверті → восьмі → шістнадцяті)": "Speed of temperature change and “turbulence” — finer rhythm (quarters → eighths → sixteenths)",
  "Вода теплішає (тренд) і тепла стає рекордно багато — гармонія напруженіша, з'являються дисонанси": "Water warms (trend) and warm water reaches record levels — tenser harmony, dissonances appear",
  "Абсолютне тепло задає лад: холодна вода — світлі лади (лідійський, мажор), гаряча — темні (мінор, фригійський)": "Absolute warmth sets the mode: cold water — bright modes (Lydian, major), hot water — dark ones (minor, Phrygian)",
  "Тепло зміщується на північ — мелодія вище": "Warmth shifts north — the melody goes higher", "Захід — ліворуч, схід — праворуч": "West on the left, east on the right",
  "Швидкість змін — рухливість арпеджіо й мелодії": "Speed of change — livelier arpeggio and melody", "Плавні зміни — легато, різкі (прискорення) — стакато": "Smooth changes — legato, sharp ones (acceleration) — staccato",
  "Холодна й темна вода — більше «повітря» (реверберація)": "Cold, dark water — more “air” (reverb)",
  "Мелодія сканує кадр зліва направо (16 кроків): вище нота — тепліша вода в цій смузі довготи; суша — пауза": "The melody scans the frame left to right (16 steps): a higher note means warmer water in that longitude strip; land is a rest",
  "Піки, перетини рекордних рівнів і зміни режиму — акценти (дзвони, литаври, брас)": "Peaks, record-level crossings and regime changes — accents (bells, timpani, brass)",
  "Більше льоду (білого) — більше нот; танення — тиша": "More ice (white) — more notes; melting — silence", "Площа льоду — густота нот": "Ice area — note density",
  "Більше вогнів на карті — трохи швидший темп; темні карти звучать повільно": "More lights on the map — a slightly faster tempo; dark maps sound slow",
  "Темна карта звучить тихо (abs: мало світла), але рух усередині чути (rel)": "A dark map sounds quiet (abs: little light), but you can hear the movement inside it (rel)",
  "Що більше світла (у лог-шкалі), то гучніше й тим більше інструментів": "The more light (on a log scale), the louder and the more instruments",
  "Кількість світлових точок і кластерів — густота «зоряного дощу» коротких нот": "Number of light points and clusters — density of the “star rain” of short notes",
  "Місто, що росте (тренд світла), і щільні агломерації — більше напруги в гармонії": "A growing city (light trend) and dense urban areas — more tension in the harmony",
  "Темний кадр — темний лад; більше світла — світліший": "A dark frame — a dark mode; more light — a brighter one", "Вогні на півночі — вищий регістр": "Lights in the north — higher register",
  "Швидкість змін світла — рухливість партій": "Speed of light change — livelier parts", "Вогні — короткі дзвінкі ноти (стакато), більше вогнів — коротші": "Lights — short ringing notes (staccato), more lights — shorter notes",
  "Темрява — глибокий дрон із довгою луною": "Darkness — a deep drone with a long echo",
  "Мелодія сканує кадр зліва направо: вище нота — більше світла в цій смузі; темрява — пауза": "The melody scans the frame left to right: a higher note means more light in that strip; darkness is a rest",
  "Спалахи й зміни — челеста та дзвіночки": "Flashes and changes — celesta and chimes",
  "Кульмінація — у вікні з найбільшою часткою теплої води": "Climax — in the window with the largest share of warm water",
  "Більше теплої води (частка теплої площі, середня теплота) і більша площа даних — гучніше й більше інструментів; швидкість змін іде лише в густоту ритму, тож охолодження не гучнішає": "More warm water (warm-area share, mean warmth) and a larger data area — louder, with more instruments; speed of change only affects rhythmic density, so cooling does not get louder",
  "Більше теплої води — світліший лад (мажор), вищі й яскравіші інструменти; холодна — мінор, низькі струнні, приглушений тембр": "More warm water — a brighter mode (major), higher and brighter instruments; cold water — minor, low strings, a muted tone",
  "Інтенсивність і площа дощу — густота крапель і нот": "Rain intensity and area — density of drops and notes", "Рівень моря — регістр мелодії": "Sea level — melody register",
  "Вищий рівень — повніший низ («затоплення» басом)": "A higher level — a fuller low end (“flooding” with bass)", "Щільність хмар і рух — тремоло й вітер": "Cloud density and motion — tremolo and wind",
  "Яскраві спалахи (викиди > 3σ) і контраст — напруга й удари грому": "Bright flashes (outliers > 3σ) and contrast — tension and thunder strikes",
  "Обертання й рух хмар — швидкість кружляння звуку": "Rotation and cloud motion — how fast the sound circles",
  "Кульмінація — у вікні з найбільшою часткою тепла": "Climax — in the window with the largest share of warmth",
  "Більше тепла (частка теплої площі, середня теплота) і більша площа даних — гучніше й більше інструментів; швидкість змін іде лише в густоту ритму, тож охолодження не гучнішає": "More warmth (warm-area share, mean warmth) and a larger data area — louder, with more instruments; speed of change only affects rhythmic density, so cooling does not get louder",
  "Швидкість руху хмар задає темп": "Cloud speed sets the tempo", "Загальна гучність — за абсолютною яскравістю кадру": "Overall loudness follows the absolute brightness of the frame",
  "Більше хмар і руху — гучніше": "More clouds and motion — louder", "Рух і складність хмар — дрібніший ритм": "Cloud motion and complexity — finer rhythm",
  "Рослинність зменшується або хмар стає більше — напруга": "Vegetation shrinks or clouds increase — tension", "Зелень і світло — світлий лад": "Green and light — a bright mode",
  "Активність на півночі — вищий регістр": "Activity in the north — higher register", "Рух хмар — рухливість партій": "Cloud motion — livelier parts",
  "Більше океану — більше простору": "More ocean — more space", "Мелодія сканує кадр зліва направо: вище нота — яскравіше": "The melody scans the frame left to right: a higher note means brighter",
  "Більше зелені — мажорніший лад": "More green — a more major mode",
};

const CH = { "абс.": "abs.", "відн.": "rel.", "ранг": "rank", "зміна за кадр": "change per frame", "швидкість": "speed", "прискорення": "acceleration", "тренд": "trend" };
const EXTRA = new Map();
/** Пари з даних (теми, каталог, стилі) — додаються під час роботи. */
export function registerExact(uk, en) { if (uk && en && uk !== en) EXTRA.set(uk, en); }

const CYR = /[Ѐ-ӿ]/;
const lc = s => s && s[0].toLowerCase() + s.slice(1);
const uc = s => s && s[0].toUpperCase() + s.slice(1);
function exact(s) {
  let r = EXTRA.get(s) ?? EXACT[s];
  if (r !== undefined) return r;
  // однаковий текст з малої / великої літери (напр. «… — ${tp.why.toLowerCase()}»)
  const up = uc(s), low = lc(s);
  r = EXTRA.get(up) ?? EXACT[up];
  if (r !== undefined) return s[0] === low[0] ? lc(r) : r;
  r = EXTRA.get(low) ?? EXACT[low];
  if (r !== undefined) return uc(r);
  for (const [k, v] of EXTRA) if (k.toLowerCase() === s.toLowerCase()) return v;
  return undefined;
}

const T = s => translate(s);
const PLACE_V = { "угорі": "top", "унизу": "bottom", "посередині": "middle" }, PLACE_H = { "ліворуч": "left", "праворуч": "right", "в центрі": "centre" };
const RULES = [
  [/^Аналізую кадр (\d+) з (\d+)$/, (m, a, b) => `Analyzing frame ${a} of ${b}`],
  [/^Огляд відео: кадр (\d+) з (\d+)$/, (m, a, b) => `Video overview: frame ${a} of ${b}`],
  [/^(.+) \((абс\.|відн\.|ранг|зміна за кадр|швидкість|прискорення|тренд)\)$/, (m, n, c) => `${T(n)} (${CH[c]})`],
  [/^(найбільше світла|найвище значення) у зоні «(.+)»$/, (m, a, z) => `${T(a)} in the zone «${T(z)}»`],
  [/^найвище значення «(.+)» у кадрі$/, (m, f) => `highest «${T(f)}» in the frame`],
  [/^найвище значення «(.+)»$/, (m, f) => `highest «${T(f)}»`],
  [/^≈(\d+)° (зх\.|сх\.) д\.$/, (m, d, w) => `≈${d}° ${w === "зх." ? "W" : "E"}`],
  [/^(північ|південь|центр) диска(?:, (захід|схід) \((ліворуч|праворуч)\))?$/, (m, v, h) => `${{ "північ": "north", "південь": "south", "центр": "centre" }[v]} of the disc${h ? `, ${h === "захід" ? "west (left)" : "east (right)"}` : ""}`],
  [/^(угорі|унизу|посередині) (ліворуч|праворуч|в центрі) кадру(?: \((лівіше|правіше)(?:, (вище|нижче))?\))?$/, (m, v, h, x, y) =>
    `${PLACE_V[v]} ${PLACE_H[h]} of the frame${x ? ` (${x === "лівіше" ? "further left" : "further right"}${y ? `, ${y === "вище" ? "higher" : "lower"}` : ""})` : ""}`],
  // події
  [/^(пік|спад): (.+)$/, (m, k, l) => `${k === "пік" ? "peak" : "dip"}: ${T(l)}`],
  [/^(.+): перетнула верхній рівень \(10 % найвищих значень\)$/, (m, l) => `${T(l)}: crossed the upper level (top 10% of values)`],
  [/^(.+): опустилася до нижнього рівня \(10 % найнижчих\)$/, (m, l) => `${T(l)}: dropped to the lower level (bottom 10%)`],
  [/^зміна режиму: (.+) (зростає|спадає)$/, (m, l, d) => `regime change: ${T(l)} ${d === "зростає" ? "rising" : "falling"}`],
  [/^найвище значення за все відео: (.+)$/, (m, l) => `highest value of the whole video: ${T(l)}`],
  [/^найнижче значення за все відео: (.+)$/, (m, l) => `lowest value of the whole video: ${T(l)}`],
  [/^повернення до стану, як на (\d+) с$/, (m, s) => `return to the state at ${s} s`],
  // рух
  [/^Глобус обертається: (.+)$/, () => "The globe rotates: you hear what is at the centre of the disc right now — the meridian facing the listener; the west of the disc is on the left, the east on the right. Rotation is a survey of space, not a change in the data, so it creates no events and does not control loudness."],
  [/^глобального зсуву кадру немає \((\d+) % кадрів\) — змінюються самі дані$/, (m, p) => `no global frame shift (${p}% of frames) — the data itself changes`],
  [/^текстура (всередині диска|в центрі кадру) стало зсувається горизонтально \((\d+) % кадрів, в один бік — (\d+) %\)$/, (m, w, a, b) => `texture ${w === "в центрі кадру" ? "at the centre of the frame" : "inside the disc"} shifts steadily sideways (${a}% of frames, ${b}% in one direction)`],
  [/^Графік: час треку — це вісь x \(зліва направо\), висота голосу даних — висота лінії\.(.*)$/, (m, rest) => `Chart: track time is the x axis (left to right), the pitch of the data voice is the height of the line.${rest ? " " + T(rest.trim()) : ""}`],
  [/^У кадрі кілька панелей: звучить найбільша\. Панелей: (\d+); найбільша займає (\d+) % кадру\.$/, (m, n, p) => `There are several panels in the frame: the largest one is heard. Panels: ${n}; the largest takes ${p}% of the frame.`],
  [/^знайдено (\d+) панелі, розділені суцільними смугами$/, (m, n) => `${n} panels found, separated by solid bars`],
  [/^Що на відео \(картка NASA EIC, SVS (\d+)\): (.+)$/s, (m, id, d) => `What the video shows (NASA EIC card, SVS ${id}): ${T(d)}`],
  [/^номер SVS (\d+) у назві файлу$/, (m, id) => `SVS number ${id} in the file name`],
  [/^слова «(.+)» у назві файлу$/, (m, k) => `the words “${k}” in the file name`],
  [/^Більше значення — автоматично: (.+?)( \(тема обертає напрямок\))?\.$/, (m, how, inv) => `A larger value — automatic: ${T(how)}${inv ? " (the topic reverses the direction)" : ""}.`],
  [/^Більше значення — це (.+?): (вищий голос даних|голос даних обернено: вищий звук) — (.+?)\.( \(Шкала не розрізняє цього напрямку — узято напрямок за замовчуванням\.\))?$/, (m, c, how, c2, nos) =>
    `A larger value means ${T(c)}: ${how === "вищий голос даних" ? "a higher data voice" : "the data voice is inverted: a higher sound"} — ${T(c2)}.${nos ? " (The scale cannot tell this direction apart — the default direction is used.)" : ""}`],
  [/^увесь кадр зсувається або масштабується разом \(зсув — (\d+) % кадрів, наближення — (\d+) %\)$/, (m, a, b) => `the whole frame pans or zooms together (pan — ${a}% of frames, zoom — ${b}%)`],
  // гармонія
  [/^(.+) \(світлість ([\d.]+)\), (спокійна|помірна|напружена) прогресія \(напруга ([\d.]+)\), акорд: (.+)$/, (m, mode, b, lv, tn, ch) =>
    `${T(mode)} (brightness ${b}), ${{ "спокійна": "calm", "помірна": "moderate", "напружена": "tense" }[lv]} progression (tension ${tn}), chord: ${T(ch)}`],
  // мапінг
  [/^(.+) \((абс\.|відн\.|ранг|зміна за кадр|швидкість|прискорення|тренд)\)$/, (m, n, c) => `${T(n)} (${CH[c]})`],
  [/^(.+) \+ тема «(.+)»$/, (m, p, tp) => `${T(p)} + topic «${T(tp)}»`],
  [/^тема (.+)$/, (m, id) => `topic ${id}`],
  [/^Тональність (.+) — фіксована для теми$/, (m, k) => `Key ${k} — fixed for the topic`],
  [/^Тональність (.+): медіана «(.+)» = ([\d.]+) шкали → (\d+)-та позиція квінтового кола$/, (m, k, f, x, i) => `Key ${k}: median «${T(f)}» = ${x} of the scale → position ${i} on the circle of fifths`],
  [/^(\d+) BPM: діапазон теми (\d+)–(\d+), позиція (\d+) % — (.+)$/, (m, b, lo, hi, p, w) => `${b} BPM: topic range ${lo}–${hi}, position ${p}% — ${lc(T(w))}`],
  [/^Розмір (.+?) — характер теми(?: «(.+)»)?$/, (m, me, tp) => `Metre ${T(me)} — the character of the topic${tp ? ` «${T(tp)}»` : ""}`],
  [/^(.+) \(відн\.\) — замість руху в кадрі \((.+)\)$/, (m, v, mo) => `${T(v)} (rel.) — instead of motion in the frame (${T(mo)})`],
  [/^(.+) \(відн\.\) — обернено: для теми «більше» = менше значення ознаки$/, (m, v) => `${T(v)} (rel.) — inverted: for this topic “more” = a lower feature value`],
  [/^(.+): тренд за 20 кадрів$/, (m, v) => `${T(v)}: 20-frame trend`],
  [/^Кульмінація — у вікні з максимумом «(.+)»$/, (m, f) => `Climax — in the window with the maximum of «${T(f)}»`],
  [/^форма треку: (.+)$/, (m, s) => `track form: ${T(s)}`],
  [/^Відносні значення \(відн\.\) розтягнуто в межах цього відео: «(.+)» змінюється на ±([\d.]+) % шкали, підсилення ×([\d.]+)(, лог-шкала)?\.$/, (m, f, sp, g, log) =>
    `Relative values (rel.) are stretched within this video: «${T(f)}» varies by ±${sp}% of the scale, gain ×${g}${log ? ", log scale" : ""}.`],
  [/^«(.+)» загалом зростає — трек наростає до кульмінації ближче до кінця$/, (m, f) => `«${T(f)}» rises overall — the track builds to a climax near the end`],
  [/^«(.+)» загалом спадає — кульмінація раніше, далі довга розв'язка$/, (m, f) => `«${T(f)}» falls overall — an earlier climax, then a long resolution`],
  [/^«(.+)» коливається без загального тренду — форма йде за піками даних$/, (m, f) => `«${T(f)}» fluctuates without an overall trend — the form follows the data peaks`],
  [/^Референсний тон — медіана «(.+)» за все відео: вище за нього — більше, нижче — менше$/, (m, f) => `Reference tone — the median «${T(f)}» of the whole video: above it means more, below means less`],
  [/^Голос даних: «(.+)» \((.+) → вище\)$/, (m, f, more) => `Data voice: «${T(f)}» (${more === "більше" ? "more" : T(more)} → higher)`],
  [/^Тип руху: (.+)$/, (m, l) => `Motion type: ${T(l)}`],
  [/^Гаряча точка (\d+) \((.+)\)$/, (m, k, l) => `Hotspot ${k} (${T(l)})`],
  [/^(.+), ≈(\d+)° (зх\.|сх\.) д\.$/, (m, z, d, w) => `${T(z)}, ≈${d}° ${w === "зх." ? "W" : "E"}`],
  [/^([^:]{2,60}): (.+)$/, (m, a, b) => (exact(a) !== undefined || EXTRA.has(a) ? `${T(a)}: ${T(b)}` : null)],
];

// глосарій: короткі фрази, що трапляються всередині довших текстів
let GLOSS = null;
function gloss() {
  if (GLOSS && GLOSS.size === EXTRA.size) return GLOSS.list;
  const pairs = [...Object.entries(EXACT), ...EXTRA].filter(([k]) => k.length <= 48 && k.length >= 3);
  pairs.push(["абс.", "abs."], ["відн.", "rel."], [" с ", " s "], ["кадрів", "frames"], ["подій", "events"], ["шкали", "of the scale"]);
  pairs.sort((a, b) => b[0].length - a[0].length);
  GLOSS = { size: EXTRA.size, list: pairs };
  return pairs;
}

export function translate(s) {
  if (typeof s !== "string" || !CYR.test(s)) return s;
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], core = s.trim();
  if (!core) return s;
  let r = exact(core);
  if (r === undefined && /[.!]$/.test(core)) { const x = exact(core.slice(0, -1)); if (x !== undefined) r = x + core.slice(-1); }
  if (r === undefined) for (const [re, fn] of RULES) {
    const m = core.match(re);
    if (m) { const out = fn(...m); if (out != null) { r = out; break; } }
  }
  if (r === undefined) {
    // по реченнях / пунктах
    const parts = core.split(/(\.\s+|;\s+|\s·\s)/);
    if (parts.length > 1) r = parts.map((p, i) => (i % 2 ? p : translate(p))).join("");
  }
  if (r === undefined) {
    r = core;
    for (const [uk, en] of gloss()) if (r.includes(uk)) r = r.split(uk).join(en);
  }
  return lead + r + trail;
}
