/* SettingsNav — page stack for the pause/title Settings sheet.
   Home opens controls, driving, display, appearance, assists, sound and backups.
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
    appearance: "APPEARANCE",
    advanced: "STEERING & ASSISTS",
    audio: "MUSIC & SOUND",
    files: "BACKUP & RESTORE",
  };
  let live = null;

  // Each page's panel element, looked up by its own literal id (dynamicIdReads
  // ratchet: getElementById must never take a computed argument).
  function panels() {
    return {
      controls: document.getElementById("pm-panel-controls"),
      driving: document.getElementById("pm-panel-driving"),
      display: document.getElementById("pm-panel-display"),
      appearance: document.getElementById("pm-panel-appearance"),
      advanced: document.getElementById("advanced"),
      audio: document.getElementById("audioset"),
      files: document.getElementById("pm-panel-files"),
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

    // audioTried: undefined = not yet, "ok" / "failed" = the lazy bundle already
    // answered once for this open. Never gate twice: a failed ensureAudio leaves
    // the stub resident, so re-gating would retry forever.
    function show(want, focus, after, audioTried) {
      const id = TITLES[want] ? want : "home";
      // LAZY_AUDIO: same gate as the audio door — SettingRow must wire before
      // #audioset is revealed (programmatic show("audio") included). The door
      // click goes through here too, so it asks the bundle exactly once.
      if (id === "audio" && !audioTried && typeof AudioPanel !== "undefined" && typeof AudioPanel._ensure === "function"
          && (typeof GameAudio === "undefined" || GameAudio._stub)) {
        let asked;
        try { asked = Promise.resolve(AudioPanel._ensure()); } catch (_) { asked = Promise.resolve(false); }
        asked.then((ok) => ok, () => false).then((ok) => show(want, focus, after, ok === false ? "failed" : "ok"));
        return;
      }
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
        // DRIVING also holds LICENCE BADGES. Rebuild the subtitle in one write:
        // when #pm-coach-sel has no selected option the coach line is skipped
        // and a bare `+=` stacked " · Badges n/m" on every show("home").
        const drv = document.getElementById("pm-open-driving"), drvSmall = drv && drv.querySelector("small");
        if (drvSmall && typeof Badges !== "undefined") {
          const coachSel = document.getElementById("pm-coach-sel");
          const coachOpt = coachSel && coachSel.selectedOptions && coachSel.selectedOptions[0];
          const coachBit = coachOpt ? ("Coach: " + coachOpt.textContent.trim()) : "Coach, practice, strategy & badges";
          const b = Badges.summary();
          drvSmall.textContent = coachBit + ` · Badges ${b.held}/${b.total}`;
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
      // BACKUP & RESTORE is built by SettingsExport.mount into an empty
      // <section>; if boot missed the mount, refill when the page opens.
      if (id === "files" && typeof SettingsExport !== "undefined" && SettingsExport.ensureMounted) {
        SettingsExport.ensureMounted();
      }
      Log.info("game", `SettingsNav.show ${id}`);
      if (id === "audio") audioNote(pages.audio, audioTried === "failed");
      // A callback may disable/reflow controls (KeyBinds and audio do this),
      // so run it before resolving the page's focus target.
      if (typeof after === "function") after();
      if (focus) focusPage(id);
      const body = document.getElementById("pm-settings-body");
      if (body) body.scrollTop = 0;
      if (window.ScrollFade) ScrollFade.refresh();
    }

    // The audio bundle could not load (offline / UPDATE READY): the page still
    // reveals with the stub engine, so say why the sliders are silent.
    function audioNote(panel, failed) {
      let n = document.getElementById("audioset-offline");
      if (!failed && !n) return;
      if (!n) {
        if (!panel || typeof document.createElement !== "function") return;
        n = document.createElement("p");
        n.id = "audioset-offline"; n.className = "adv-help"; n.setAttribute("role", "status");
        panel.insertBefore(n, panel.firstChild);
      }
      n.textContent = "AUDIO ENGINE DID NOT LOAD — CHECK YOUR CONNECTION OR RELOAD";
      n.hidden = !failed;
    }

    function back() {
      if (current === "home") return true;
      show("home", false);
      const door = originDoor;
      originDoor = null;
      quietFocus(door) || focusPage("home");
      return false;
    }

    const doors = {
      controls: document.getElementById("pm-open-controls"),
      driving: document.getElementById("pm-open-driving"),
      display: document.getElementById("pm-open-display"),
      appearance: document.getElementById("pm-open-appearance"),
      advanced: document.getElementById("pm-advanced"),
      audio: document.getElementById("pm-audio"),
      files: document.getElementById("pm-open-files"),
    };
    for (const [id, door] of Object.entries(doors)) if (door) door.onclick = () => {
      originDoor = door;
      // LAZY_AUDIO: MUSIC & SOUND's SettingRows demote the static ‹ › chevrons.
      // show() reveals audio only after ensureAudio so MenuNav.items matches a
      // wired panel (otherwise arrow-walk marks ~12 chevrons missed — menu-traversal).
      show(id, true, () => { if (onSelect) onSelect(id); });
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
