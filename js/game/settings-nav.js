/* SettingsNav — category tabs for the pause/title Settings sheet.
   The module owns only tab/panel state and keyboard behavior; game.js still
   owns availability and all individual controls. */
const SettingsNav = (function () {
  "use strict";
  const IDS = ["controls", "display", "more"];

  function create(store, onSelect) {
    Log.info("game", "SettingsNav.create");
    let current = store.get("settingsCategory", "controls");
    if (!IDS.includes(current)) current = "controls";

    const tablist = document.getElementById("pm-category-tabs");
    const syncOrientation = () => {
      const style = getComputedStyle(tablist);
      const flexDir = style.flexDirection || "row";
      const flexRow = (style.display === "flex" || style.display === "inline-flex")
        && !flexDir.startsWith("column");
      if (flexRow) {
        tablist.removeAttribute("aria-orientation");
        return;
      }
      const cols = style.gridTemplateColumns.split(/\s+/).filter((t) => t && t !== "none").length;
      if (cols === 1) tablist.setAttribute("aria-orientation", "vertical");
      else tablist.removeAttribute("aria-orientation");
    };
    if (typeof ResizeObserver === "function") new ResizeObserver(syncOrientation).observe(tablist);

    function show(id, focus) {
      if (!IDS.includes(id)) id = "controls";
      current = id;
      IDS.forEach((name) => {
        const tab = document.getElementById("pm-tab-" + name);
        const panel = document.getElementById("pm-panel-" + name);
        const on = name === id;
        tab.classList.toggle("active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
        panel.hidden = !on;
      });
      store.set("settingsCategory", id);
      Log.info("game", "SettingsNav.show " + id);
      if (focus) document.getElementById("pm-tab-" + id).focus();
      const body = document.getElementById("pm-category-tabs").parentElement;
      if (body) body.scrollTop = 0;
      if (window.ScrollFade) ScrollFade.refresh();
    }

    IDS.forEach((id, index) => {
      const tab = document.getElementById("pm-tab-" + id);
      tab.onclick = () => { show(id, false); if (onSelect) onSelect(); };
      tab.onkeydown = (e) => {
        let next = null;
        syncOrientation();
        const vertical = tablist.getAttribute("aria-orientation") === "vertical";
        if ((!vertical && e.key === "ArrowRight") || (vertical && e.key === "ArrowDown")) next = (index + 1) % IDS.length;
        else if ((!vertical && e.key === "ArrowLeft") || (vertical && e.key === "ArrowUp")) next = (index - 1 + IDS.length) % IDS.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = IDS.length - 1;
        if (next == null) {
          // Keep the app-wide MenuNav from treating a perpendicular arrow as
          // permission to leave the tab widget. Do not preventDefault: on a
          // horizontal rail, Up/Down retain their native page-scroll behavior.
          if (e.key.startsWith("Arrow")) {
            e.stopImmediatePropagation();
            tab.focus();
          }
          return;
        }
        e.preventDefault(); e.stopPropagation();
        show(IDS[next], true);
      };
    });
    syncOrientation();
    show(current, false);
    return { showCurrent: () => show(current, false), show };
  }

  return { create };
})();
