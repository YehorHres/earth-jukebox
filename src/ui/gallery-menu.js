// Спливаючий список галереї: кнопка «Вибрати візуалізацію» відкриває панель із пунктами каталогу (#gallery).
// Пункти створює main.js (loadCatalog); тут — лише відкриття/закриття, клавіатура й підпис вибраного.
// Клавіатура: ↓ на кнопці — відкрити й перейти до списку; ↑/↓, Home/End — між пунктами; Esc — закрити й повернутися до кнопки.
const $ = id => document.getElementById(id);

export function setupGalleryMenu() {
  const toggle = $("galleryToggle"), panel = $("gallery-panel"), list = $("gallery");
  const label = toggle.querySelector(".picker-label"), EMPTY = label.textContent;
  const items = () => [...list.querySelectorAll("button")];
  const isOpen = () => !panel.hidden;

  function open(focusItem) {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    const cur = list.querySelector('[aria-current="true"]') || items()[0];
    if (focusItem && cur) cur.focus();
    cur?.scrollIntoView({ block: "nearest" });
  }
  function close(returnFocus) {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    if (returnFocus) toggle.focus();
  }
  function markCurrent(btn) {
    items().forEach(b => b.removeAttribute("aria-current"));
    if (btn) { btn.setAttribute("aria-current", "true"); label.textContent = btn.textContent; }
    else label.textContent = EMPTY;
  }

  toggle.addEventListener("click", () => (isOpen() ? close(false) : open(false)));
  toggle.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); open(true); }
    else if (e.key === "Escape" && isOpen()) { e.preventDefault(); e.stopPropagation(); close(true); }
  });

  // вибір пункту: обробник завантаження висить на самій кнопці (main.js), тут — підпис і закриття
  list.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    markCurrent(b);
    close(false);
  });

  panel.addEventListener("keydown", e => {
    const it = items(), i = it.indexOf(document.activeElement);
    let next = null;
    if (e.key === "ArrowDown") next = it[(i + 1) % it.length];
    else if (e.key === "ArrowUp") next = it[(i - 1 + it.length) % it.length];
    else if (e.key === "Home") next = it[0];
    else if (e.key === "End") next = it[it.length - 1];
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); return; }
    else return;
    e.preventDefault(); e.stopPropagation();   // стрілки тут не перемотують трек і не рухають зонд
    next?.focus();
  });

  // клік або фокус поза списком — закрити
  document.addEventListener("click", e => { if (isOpen() && !e.target.closest(".picker")) close(false); });
  document.addEventListener("focusin", e => { if (isOpen() && !e.target.closest(".picker")) close(false); });

  // власний файл замість каталогу — скинути підпис
  $("file").addEventListener("change", () => markCurrent(null));
  $("drop").addEventListener("drop", () => markCurrent(null));
}
