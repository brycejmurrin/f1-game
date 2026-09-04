/* SettingsNav — page stack for the pause/title Settings sheet.
   Home is a door index; CONTROLS, DISPLAY, STEERING and MUSIC are pages.
   Lighting / camera tuners stay as their own docks. BACK pops.
   Decisions: docs/research/PAUSE-SETTINGS-IA.md.
   game.js still owns availability and all individual controls. */
const SettingsNav = (function () {
  "use strict";
  const PAGES = {
    home: { title: "SETTINGS" },
    controls: { title: "CONTROLS", panel: "pm-panel-controls", door: "pm-open-controls" },
    display: { title: "DISPLAY", panel: "pm-panel-display", door: "pm-open-display" },
    advanced: { title: "STEERING", panel: "advanced", door: "pm-advanced" },
    audio: { title: "MUSIC & SOUND", panel: "audioset", door: "pm-audio" },
  };

  let live = null;

  function panelEl(id) {
    const def = PAGES[id];
    return def && def.panel ? document.getElementById(def.panel) : null;
  }

  function create(_store, onSelect) {
    Log.info("game", "SettingsNav.create");
    let current = "home";

    function show(id, focus) {
      if (!PAGES[id]) id = "home";
      current = id;
      const index = document.getElementById("pm-settings-index");
      const title = document.getElementById("dlg-settings");
      if (title) title.textContent = PAGES[id].title;
      if (index) index.hidden = id !== "home";
      Object.keys(PAGES).forEach((name) => {
        const el = panelEl(name);
        if (el) el.hidden = name !== id;
      });
      Log.info("game", "SettingsNav.show " + id);
      if (focus) {
        const target = id === "home"
          ? document.getElementById("pm-open-controls")
          : (panelEl(id) && panelEl(id).querySelector("button, input, select"));
        if (target) target.focus();
      }
      const body = document.getElementById("pm-settings-body");
      if (body) body.scrollTop = 0;
      if (window.ScrollFade) ScrollFade.refresh();
    }

    function back() {
      if (current !== "home") {
        show("home", false);
        return false;
      }
      return true;
    }

    Object.keys(PAGES).forEach((id) => {
      const door = PAGES[id].door;
      if (!door) return;
      const el = document.getElementById(door);
      if (!el) return;
      el.onclick = () => {
        show(id, false);
        if (onSelect) onSelect(id);
      };
    });
    show("home", false);
    live = { showCurrent: () => show("home", false), show, back };
    return live;
  }

  return {
    create,
    show: (id, focus) => { if (live) live.show(id, focus); },
  };
})();
