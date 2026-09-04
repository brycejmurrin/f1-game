/* SettingsNav — page stack for the pause/title Settings sheet.
   Home is a door index; CONTROLS, DISPLAY, STEERING and MUSIC are pages.
   Lighting / camera tuners stay as their own docks. BACK pops.
   Decisions: docs/research/PAUSE-SETTINGS-IA.md.
   game.js still owns availability and all individual controls. */
const SettingsNav = (function () {
  "use strict";
  const TITLES = {
    home: "SETTINGS",
    controls: "CONTROLS",
    display: "DISPLAY",
    advanced: "STEERING",
    audio: "MUSIC & SOUND",
  };

  let live = null;

  function create(_store, onSelect) {
    Log.info("game", "SettingsNav.create");
    let current = "home";

    function show(id, focus) {
      if (!TITLES[id]) id = "home";
      current = id;
      const index = document.getElementById("pm-settings-index");
      const title = document.getElementById("dlg-settings");
      if (title) title.textContent = TITLES[id];
      if (index) index.hidden = id !== "home";
      const controls = document.getElementById("pm-panel-controls");
      const display = document.getElementById("pm-panel-display");
      const advanced = document.getElementById("advanced");
      const audio = document.getElementById("audioset");
      if (controls) controls.hidden = id !== "controls";
      if (display) display.hidden = id !== "display";
      if (advanced) advanced.hidden = id !== "advanced";
      if (audio) audio.hidden = id !== "audio";
      Log.info("game", "SettingsNav.show " + id);
      if (focus) {
        const page = id === "controls" ? controls
          : id === "display" ? display
          : id === "advanced" ? advanced
          : id === "audio" ? audio
          : null;
        const target = id === "home"
          ? document.getElementById("pm-open-controls")
          : (page && page.querySelector("button, input, select"));
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

    document.getElementById("pm-open-controls").onclick = () => {
      show("controls", false); if (onSelect) onSelect("controls");
    };
    document.getElementById("pm-open-display").onclick = () => {
      show("display", false); if (onSelect) onSelect("display");
    };
    document.getElementById("pm-advanced").onclick = () => {
      show("advanced", false); if (onSelect) onSelect("advanced");
    };
    document.getElementById("pm-audio").onclick = () => {
      show("audio", false); if (onSelect) onSelect("audio");
    };
    show("home", false);
    live = { showCurrent: () => show("home", false), show, back };
    return live;
  }

  return {
    create,
    show: (id, focus) => { if (live) live.show(id, focus); },
  };
})();
