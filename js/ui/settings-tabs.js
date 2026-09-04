/* SettingsNav — page stack for the pause/title Settings sheet.
   Home is a door index; CONTROLS and DISPLAY are pages. BACK pops.
   Decisions: docs/research/PAUSE-SETTINGS-IA.md.
   game.js still owns availability and all individual controls. */
const SettingsNav = (function () {
  "use strict";
  const PAGES = ["home", "controls", "display"];
  const TITLES = { home: "SETTINGS", controls: "CONTROLS", display: "DISPLAY" };

  function create(_store, onSelect) {
    Log.info("game", "SettingsNav.create");
    let current = "home";

    function show(id, focus) {
      if (!PAGES.includes(id)) id = "home";
      current = id;
      const index = document.getElementById("pm-settings-index");
      const title = document.getElementById("dlg-settings");
      if (title) title.textContent = TITLES[id];
      index.hidden = id !== "home";
      PAGES.forEach((name) => {
        if (name === "home") return;
        document.getElementById("pm-panel-" + name).hidden = name !== id;
      });
      Log.info("game", "SettingsNav.show " + id);
      if (focus) {
        const target = id === "home"
          ? document.getElementById("pm-open-controls")
          : document.getElementById("pm-panel-" + id).querySelector("button, input, select");
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

    ["controls", "display"].forEach((id) => {
      document.getElementById("pm-open-" + id).onclick = () => {
        show(id, false);
        if (onSelect) onSelect();
      };
    });
    show("home", false);
    return { showCurrent: () => show("home", false), show, back };
  }

  return { create };
})();
