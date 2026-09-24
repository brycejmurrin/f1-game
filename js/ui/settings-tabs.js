/* SettingsNav — page stack for the pause/title Settings sheet.
   Home opens CONTROLS, DRIVING, DISPLAY, STEERING & ASSISTS and MUSIC pages.
   Lighting / camera tuners stay as their own docks. BACK pops.
   Decisions: docs/research/PAUSE-SETTINGS-IA.md.
   game.js still owns availability and all individual controls. */
const SettingsNav = (function () {
  "use strict";
  const TITLES = {
    home: "SETTINGS",
    controls: "CONTROLS",
    driving: "DRIVING",
    display: "DISPLAY",
    advanced: "STEERING & ASSISTS",
    audio: "MUSIC & SOUND",
  };
  let live = null;

  // Each page's panel element, looked up by its own literal id (dynamicIdReads
  // ratchet: getElementById must never take a computed argument).
  function panels() {
    return {
      controls: document.getElementById("pm-panel-controls"),
      driving: document.getElementById("pm-panel-driving"),
      display: document.getElementById("pm-panel-display"),
      advanced: document.getElementById("advanced"),
      audio: document.getElementById("audioset"),
    };
  }

  function create(_store, onSelect) {
    Log.info("game", "SettingsNav.create");
    let current = "home";
    // The index door that opened a page. A dialog does not know about focus
    // changes inside its own sheet, so keep this explicitly and restore it on
    // the same page-stack BACK path that Escape presses.
    let originDoor = null;

    const visible = (el) => {
      if (!el || el.disabled) return false;
      for (let p = el; p; p = p.parentElement || p.parentNode) {
        if (p.hidden || (p.getAttribute && p.getAttribute("aria-hidden") === "true")) return false;
        // A closed disclosure's SUMMARY is its visible, focusable door; its
        // descendants are not. This matters when a page opens on an audio or
        // display fold rather than a plain setting row.
        if (p.tagName === "DETAILS" && !p.open && !(el.tagName === "SUMMARY" && (el.parentElement || el.parentNode) === p)) return false;
      }
      if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return false;
      if (el.getClientRects && el.getClientRects().length === 0) return false;
      return true;
    };
    const quietFocus = (el) => {
      if (!visible(el) || typeof el.focus !== "function") return false;
      try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (_) { return false; } }
      return true;
    };
    function firstIn(page) {
      if (!page) return null;
      const candidates = page.querySelectorAll
        ? page.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex]:not([tabindex='-1'])")
        : [];
      for (const target of candidates) if (visible(target)) return target;
      return null;
    }
    function focusPage(id) {
      if (id === "home") return quietFocus(originDoor) || quietFocus(firstIn(document.getElementById("pm-settings-index")));
      const pages = panels();
      return quietFocus(firstIn(pages[id]));
    }

    function show(want, focus, after) {
      const id = TITLES[want] ? want : "home";
      const index = document.getElementById("pm-settings-index");
      if (id === "home") {
        for (const [doorId, selectId, prefix] of [
          ["pm-open-controls", "pm-steer-sel", "Steering"],
          ["pm-open-driving", "pm-coach-sel", "Coach"],
          ["pm-open-display", "pm-hudprofile-sel", "HUD"],
        ]) {
          const door = document.getElementById(doorId), sel = document.getElementById(selectId);
          const small = door && door.querySelector("small");
          const current = sel && sel.selectedOptions && sel.selectedOptions[0];
          if (small && current) small.textContent = prefix + ": " + current.textContent.trim();
        }
      }
      // Capture the door before it is hidden. This also makes a programmatic
      // SettingsNav.show("audio") behave like a click when called from home.
      if (id !== "home" && current === "home" && index && !originDoor) {
        const active = document.activeElement;
        originDoor = active && index.contains && index.contains(active) ? active : null;
      }
      current = id;
      const title = document.getElementById("dlg-settings");
      if (title) title.textContent = TITLES[id];
      if (index) index.hidden = id !== "home";
      const pages = panels();
      for (const key of Object.keys(pages)) {
        const panel = pages[key];
        if (!panel) continue;
        panel.hidden = id !== key;
      }
      Log.info("game", `SettingsNav.show ${id}`);
      // A callback may disable/reflow controls (KeyBinds and audio do this),
      // so run it before resolving the page's focus target.
      if (typeof after === "function") after();
      if (focus) focusPage(id);
      const body = document.getElementById("pm-settings-body");
      if (body) body.scrollTop = 0;
      if (window.ScrollFade) ScrollFade.refresh();
    }

    function back() {
      if (current === "home") return true;
      show("home", false);
      const door = originDoor;
      originDoor = null;
      quietFocus(door) || focusPage("home");
      return false;
    }

    const openControls = document.getElementById("pm-open-controls");
    if (openControls) openControls.onclick = () => {
      originDoor = openControls;
      show("controls", true, () => { if (onSelect) onSelect("controls"); });
    };
    const openDriving = document.getElementById("pm-open-driving");
    if (openDriving) openDriving.onclick = () => {
      originDoor = openDriving;
      show("driving", true, () => { if (onSelect) onSelect("driving"); });
    };
    const openDisplay = document.getElementById("pm-open-display");
    if (openDisplay) openDisplay.onclick = () => {
      originDoor = openDisplay;
      show("display", true, () => { if (onSelect) onSelect("display"); });
    };
    const openAdvanced = document.getElementById("pm-advanced");
    if (openAdvanced) openAdvanced.onclick = () => {
      originDoor = openAdvanced;
      show("advanced", true, () => { if (onSelect) onSelect("advanced"); });
    };
    const openAudio = document.getElementById("pm-audio");
    if (openAudio) openAudio.onclick = () => {
      originDoor = openAudio;
      show("audio", true, () => { if (onSelect) onSelect("audio"); });
    };
    // Every open starts at the door index. Do not steal focus here: the dialog
    // seam owns focus when it opens, and its opener should remain authoritative.
    originDoor = null;
    show("home", false);
    live = {
      // The caller uses this on every open, including after an interrupted
      // page transition. Clear the previous door so a later BACK cannot return
      // to a stale element from an earlier dialog instance.
      showCurrent: () => { originDoor = null; show("home", false); },
      show, back,
    };
    return live;
  }

  return {
    create,
    show: (id, focus) => { if (live) live.show(id, focus); },
  };
})();
Object.freeze(SettingsNav);
