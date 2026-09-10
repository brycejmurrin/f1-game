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

  // Each page's panel element, looked up by its own literal id (dynamicIdReads
  // ratchet: getElementById must never take a computed argument).
  function panels() {
    return {
      controls: document.getElementById("pm-panel-controls"),
      display: document.getElementById("pm-panel-display"),
      advanced: document.getElementById("advanced"),
      audio: document.getElementById("audioset"),
    };
  }

  function create(_store, onSelect) {
    Log.info("game", "SettingsNav.create");
    let current = "home";

    function show(want, focus) {
      const id = TITLES[want] ? want : "home";
      current = id;
      const index = document.getElementById("pm-settings-index");
      const title = document.getElementById("dlg-settings");
      if (title) title.textContent = TITLES[id];
      if (index) index.hidden = id !== "home";
      const pages = panels();
      let page = null;
      for (const key of Object.keys(pages)) {
        const panel = pages[key];
        if (!panel) continue;
        panel.hidden = id !== key;
        if (id === key) page = panel;
      }
      Log.info("game", `SettingsNav.show ${id}`);
      if (focus) {
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
      if (current === "home") return true;
      show("home", false);
      return false;
    }

    const openControls = document.getElementById("pm-open-controls");
    if (openControls) openControls.onclick = () => {
      show("controls", false); if (onSelect) onSelect("controls");
    };
    const openDisplay = document.getElementById("pm-open-display");
    if (openDisplay) openDisplay.onclick = () => {
      show("display", false); if (onSelect) onSelect("display");
    };
    const openAdvanced = document.getElementById("pm-advanced");
    if (openAdvanced) openAdvanced.onclick = () => {
      show("advanced", false); if (onSelect) onSelect("advanced");
    };
    const openAudio = document.getElementById("pm-audio");
    if (openAudio) openAudio.onclick = () => {
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
Object.freeze(SettingsNav);
