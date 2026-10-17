/* SettingsNav — page stack for the pause/title Settings sheet.
   Home opens controls, driving, driving aids, display, appearance, sound and backups.
   Lighting / camera tuners stay as their own docks. BACK pops.
   Decisions: docs/research/PAUSE-SETTINGS-IA.md.
   game.js still owns availability and all individual controls. */
const SettingsNav = (function () {
  "use strict";
  // Navigation metadata has one owner. Lookup callbacks keep DOM reads lazy
  // (shell/lazy panels need not exist at evaluation) and literal for the ratchet.
  // parent is the default hierarchy; the live stack preserves contextual entry.
  const routes = Object.freeze({
    home: Object.freeze({ title: "SETTINGS", parent: null, scope: "navigation",
      panel: () => document.getElementById("pm-settings-index"), door: null }),
    controls: Object.freeze({ title: "CONTROLS", parent: "home", scope: "preferences",
      panel: () => document.getElementById("pm-panel-controls"), door: () => document.getElementById("pm-open-controls") }),
    driving: Object.freeze({ title: "DRIVING AIDS", parent: "home", scope: "preferences",
      panel: () => document.getElementById("pm-panel-driving"), door: () => document.getElementById("pm-open-driving") }),
    display: Object.freeze({ title: "HUD & CAMERA", parent: "home", scope: "preferences",
      panel: () => document.getElementById("pm-panel-display"), door: () => document.getElementById("pm-open-display") }),
    appearance: Object.freeze({ title: "APPEARANCE", parent: "home", scope: "preferences",
      panel: () => document.getElementById("pm-panel-appearance"), door: () => document.getElementById("pm-open-appearance") }),
    a11y: Object.freeze({ title: "ACCESSIBILITY", parent: "home", scope: "preferences",
      panel: () => document.getElementById("pm-panel-a11y"), door: () => document.getElementById("pm-open-a11y") }),
    advanced: Object.freeze({ title: "ADVANCED INPUT & HANDLING", parent: "controls", scope: "preferences",
      panel: () => document.getElementById("advanced"), door: () => document.getElementById("pm-advanced") }),
    audio: Object.freeze({ title: "MUSIC & SOUND", parent: "home", scope: "preferences",
      panel: () => document.getElementById("audioset"), door: () => document.getElementById("pm-audio") }),
    files: Object.freeze({ title: "SAVES & DATA", parent: "home", scope: "data",
      panel: () => document.getElementById("pm-panel-files"), door: () => document.getElementById("pm-open-files") }),
    graphics: Object.freeze({ title: "GRAPHICS", parent: "home", scope: "preferences",
      panel: () => document.getElementById("pm-panel-graphics"), door: () => document.getElementById("pm-open-graphics") }),
    visual: Object.freeze({ title: "VISUAL STUDIO", parent: "home", scope: "editor",
      panel: () => document.getElementById("pm-panel-visual"), door: () => document.getElementById("pm-open-visual") }),
    progress: Object.freeze({ title: "PROGRESS", parent: "home", scope: "progress",
      panel: () => document.getElementById("pm-panel-progress"), door: () => document.getElementById("pm-open-progress") }),
    practice: Object.freeze({ title: "PRACTICE", parent: null, scope: "session",
      panel: () => document.getElementById("pm-panel-practice"), door: null }),
    strategy: Object.freeze({ title: "PIT STRATEGY", parent: null, scope: "session",
      panel: () => document.getElementById("pm-panel-strategy"), door: null }),
    review: Object.freeze({ title: "SESSION REVIEW", parent: null, scope: "session",
      panel: () => document.getElementById("pm-panel-review"), door: null }),
  });
  function panel(id) { return Object.hasOwn(routes, id) ? routes[id].panel() : null; }
  // Preserve the upstream breadcrumb heading using the registry hierarchy.
  function breadcrumb(id) {
    if (!Object.hasOwn(routes, id)) id = "home";
    const names = [];
    for (let route = id; route; route = routes[route].parent || (route === "home" ? null : "home")) names.unshift(routes[route].title);
    return names.join(" › ");
  }
  let live = null;
  // Subscribers told when a page is hidden by show()/back() (the CONTROLS wheel
  // wizard disarms itself here). Module-level so a subscriber needs no instance.
  const leaveFns = [], enterFns = [];
  function fireEnter(id) {
    for (const fn of enterFns) {
      try { fn(id); } catch (e) { Log.warn("game", "SettingsNav.onEnter handler failed: " + (e && e.message)); }
    }
  }
  function fireLeave(id) {
    for (const fn of leaveFns) {
      try { fn(id); } catch (e) { Log.warn("game", "SettingsNav.onLeave handler failed: " + (e && e.message)); }
    }
  }

  function panels() {
    return Object.fromEntries(Object.keys(routes).filter((id) => id !== "home").map((id) => [id, panel(id)]));
  }

  function create(_store, onSelect) {
    Log.info("game", "SettingsNav.create");
    let current = "home", generation = 0, search = null;
    // The index door that opened a page. A dialog does not know about focus
    // changes inside its own sheet, so keep this explicitly and restore it on
    // the same page-stack BACK path that Escape presses.
    let originDoor = null, direct = false;
    const stack = [];

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
    // the stub resident, so re-gating would retry forever. (Ship #1320 used a
    // boolean `ensured` flag; keep the richer "failed" → offline note path.)
    function show(want, focus, after, audioTried) {
      const request = ++generation;
      const id = Object.hasOwn(routes, want) ? want : "home";
      // LAZY_AUDIO: same gate as the audio door — SettingRow must wire before
      // #audioset is revealed (programmatic show("audio") included). The door
      // click goes through here too, so it asks the bundle exactly once.
      if (id === "audio" && !audioTried && typeof AudioPanel !== "undefined" && typeof AudioPanel._ensure === "function"
          && (typeof GameAudio === "undefined" || GameAudio._stub)) {
        let asked;
        try { asked = Promise.resolve(AudioPanel._ensure()); } catch (_) { asked = Promise.resolve(false); }
        asked.then((ok) => ok, () => false).then((ok) => {
          // Closing hides this sheet; reopening calls showCurrent and owns a
          // new generation, even if the old audio request is still loading.
          const settings = document.getElementById("pmsettings");
          if (request === generation && !(settings && settings.hidden)) show(want, focus, after, ok === false ? "failed" : "ok");
        });
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

      }
      // Capture the door before it is hidden. This also makes a programmatic
      // SettingsNav.show("audio") behave like a click when called from home.
      if (id !== "home" && current === "home" && index && !originDoor) {
        const active = document.activeElement;
        originDoor = active && index.contains && index.contains(active) ? active : null;
      }
      if (current !== "home" && current !== id) fireLeave(current);
      current = id;
      const title = document.getElementById("dlg-settings");
      if (title) title.textContent = breadcrumb(id);
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
      // Lifecycle hooks also cover programmatic/search navigation, after lazy
      // loading, and before focus resolves newly mounted page controls.
      if (id === "progress" && typeof Badges !== "undefined") Badges.render();
      fireEnter(id);
      const body = document.getElementById("pm-settings-body");
      if (body) body.scrollTop = 0;
      // A callback may disable/reflow controls (KeyBinds and audio do this),
      // so run it before resolving the page's focus target.
      const placed = typeof after === "function" && after() === true;
      if (focus && !placed) focusPage(id);
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
      if (current === "home" || direct) { generation++; if (current !== "home") fireLeave(current); direct = false; current = "home"; return true; }
      if (stack.length) {
        const parent = stack.pop();
        show(parent.page, false);
        originDoor = parent.origin;
        const body = document.getElementById("pm-settings-body");
        if (body) body.scrollTop = parent.scroll;
        quietFocus(parent.door) || focusPage(parent.page);
        return false;
      }
      show("home", false);
      const door = originDoor;
      originDoor = null;
      if (!(search && search.restore())) quietFocus(door) || focusPage("home");
      return false;
    }

    const doors = Object.fromEntries(Object.entries(routes).filter(([, route]) => route.door).map(([id, route]) => [id, route.door()]));
    for (const [id, door] of Object.entries(doors)) if (door) door.onclick = () => {
      if (search) search.cancel();
      if (current !== "home") stack.push({ page: current, door, origin: originDoor, scroll: document.getElementById("pm-settings-body")?.scrollTop || 0 });
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
    if (typeof SettingsSearch !== "undefined") search = SettingsSearch.create({
      host: document.getElementById("pm-settings-index"), show, onSelect,
      onLeave: (fn) => leaveFns.push(fn),
    });
    live = {
      // The caller uses this on every open, including after an interrupted
      // page transition. Clear the previous door so a later BACK cannot return
      // to a stale element from an earlier dialog instance.
      showCurrent: () => { originDoor = null; direct = false; stack.length = 0; if (search) search.cancel(); show("home", false); },
      returnToSearch: () => { direct = false; stack.length = 0; show("home", false); return !!search && search.restore(); },
      showDirect: (id, focus) => { direct = true; stack.length = 0; show(id, focus); },
      current: () => current,
      show, back, invalidate: () => { generation++; if (current !== "home") fireLeave(current); current = "home"; direct = false; stack.length = 0; },
    };
    return live;
  }

  return {
    create, routes, panel, breadcrumb,
    show: (id, focus) => { if (live) live.show(id, focus); },
    current: () => live ? live.current() : "home",
    showDirect: (id, focus) => { if (live) live.showDirect(id, focus); },
    invalidate: () => { if (live) live.invalidate(); },
    onLeave: (fn) => { if (typeof fn === "function") leaveFns.push(fn); },
    onEnter: (fn) => { if (typeof fn === "function") enterFns.push(fn); },
  };
})();
Object.freeze(SettingsNav);
