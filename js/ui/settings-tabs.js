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
    credits: Object.freeze({ title: "ABOUT & CREDITS", parent: "home", scope: "info",
      panel: () => document.getElementById("pm-panel-credits"), door: () => document.getElementById("pm-open-credits") }),
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
  let live = null, enterLive = null, jumpWired = false;
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

  /* #4798 settings-lazy gate. Row-wiring initialisers (SettingRow.wire and the
     like: no eval-time state, nothing a player sees before Settings) queue here
     instead of running in the DOMContentLoaded task. The queue flushes, in
     registration order, on the first Settings page enter, the first pointerdown
     or keydown anywhere (capture, so it precedes the click / key it serves), or
     idle (4 s cap). A complete document (tests, late loads) runs fn at once.
     Callers queue from a DCL listener: deferred scripts evaluate at "interactive". */
  let lazyQ = null;
  function flushLazy() {
    const q = lazyQ;
    if (!q) return;
    lazyQ = null;
    if (typeof document !== "undefined") for (const t of ["pointerdown", "keydown"]) document.removeEventListener(t, flushLazy, true);
    for (const fn of q) { try { fn(); } catch (e) { Log.warn("game", "SettingsNav.lazy init failed: " + (e && e.message)); } }
  }
  function lazy(fn) {
    if (typeof fn !== "function") return;
    if (typeof document === "undefined" || document.readyState === "complete") {
      if (lazyQ) { lazyQ.push(fn); flushLazy(); } else fn();
      return;
    }
    if (lazyQ) { lazyQ.push(fn); return; }
    lazyQ = [fn];
    for (const t of ["pointerdown", "keydown"]) document.addEventListener(t, flushLazy, true);
    if (typeof requestIdleCallback === "function") requestIdleCallback(flushLazy, { timeout: 4000 });
    else setTimeout(flushLazy, 1500);
  }
  // First in enterFns: a page's rows are wired before any other enter handler reads them.
  enterFns.push(flushLazy);

  // LAZY_UI_PRESETS: APPEARANCE's LAYOUT PRESET row (js/ui/layout-presets.js)
  // loads on the first APPEARANCE enter, or on a SEPARATE orientation swap (AppearanceStudio, #4529);
  // a failed load logs and the next call retries. presets() resolves true once LayoutPresets exists.
  let presetsLoad = null;
  const presetsLoaded = new Set();
  function presets() {
    const R = /** @type {any} */ (globalThis).ApexRoster || null;   // js/roster.js: self.ApexRoster
    if (presetsLoad) return presetsLoad;
    if (typeof LayoutPresets !== "undefined" && window.AppearanceArrangementPicker) return Promise.resolve(true);
    if (!R || !R.LAZY_UI_PRESETS || typeof ScriptLoader === "undefined") return Promise.resolve(false);
    const fail = (e) => { presetsLoad = null; Log.warn("ui", "the layout preset row did not load" + (e ? ": " + (e.message || e) : "")); return false; };
    const files = R.LAZY_UI_PRESETS.filter(file => !["js/ui/screen-arranger.js", "js/ui/hud-arrange.js", "js/ui/hud-layout-editor.js", "js/ui/desktop-graphics.js"].includes(file));
    presetsLoad = ScriptLoader.create().load(files, R.LAZY_UI_PRESETS_EDGES || [], { strict: true, loaded: presetsLoaded })
      .then((ok) => (!ok || typeof LayoutPresets === "undefined" ? fail() : true), fail);
    return presetsLoad;
  }
  async function graphicsDetails() {
    const host = panel("graphics");
    if (!host || typeof GLX === "undefined") return false;
    let retry = host.querySelector("[data-graphics-retry]");
    const mount = () => {
      DesktopGraphics.mount();
      const focused = retry && document.activeElement === retry;
      retry?.remove();
      if (focused && !host.hidden) host.querySelector("[data-desktop-graphics] summary")?.focus({ preventScroll: true });
      return true;
    };
    if (typeof DesktopGraphics !== "undefined") return mount();
    if (!retry) {
      retry = document.createElement("button");
      retry.type = "button"; retry.setAttribute("data-graphics-retry", ""); retry.className = "adv-more-btn";
      retry.onclick = graphicsDetails;
      host.appendChild(retry);
    }
    if (retry.disabled) return false;
    retry.disabled = true;
    retry.textContent = "Loading graphics details…";
    try {
      if (typeof ScriptLoader !== "undefined") await ScriptLoader.create().load(["js/ui/desktop-graphics.js"], [], { strict: true, loaded: presetsLoaded });
      if (typeof DesktopGraphics !== "undefined") return mount();
    } catch (e) { Log.warn("ui", "Graphics details unavailable: " + e); }
    retry.disabled = false;
    retry.textContent = "Graphics details unavailable · Retry";
    return false;
  }
  enterFns.push((id) => {
    if (id === "appearance") {
      presets();
      if (typeof AppearanceStudio !== "undefined" && AppearanceStudio.loaded()) AppearanceStudio.initUI();
    }
    if (id === "graphics") graphicsDetails();
  });
  if (typeof document !== "undefined" && document.addEventListener) {
    const owners = ["js/ui/screen-regions.js", "js/ui/screen-placement.js"];
    const loadPlacement = (files) => ScriptLoader.create().load(files, [[owners[0], owners[1]]], { strict: true, loaded: presetsLoaded });
    if (typeof GameStore !== "undefined" && typeof ScriptLoader !== "undefined") {
      const restoreSavedLayout = () => {
        if (typeof ScreenPlacement !== "undefined" || !GameStore.store.get("screenPlacement", null)) return;
        loadPlacement(owners).catch(error => Log.warn("ui", "Saved layout could not load: " + error.message));
      };
      restoreSavedLayout();
      GameStore.store.subscribe?.(change => {
        if (change.key === "screenPlacement" || change.key === null) restoreSavedLayout();
      });
    }
    document.addEventListener("apex:spotify-arrange-return", async () => {
      try {
        if (!await loadPlacement([...owners, "js/ui/screen-arranger.js"])) return;
        const player = document.getElementById("spotifypanel");
        if (!player || player.hidden) return;
        const navigation = window.ScreenRegions[Symbol.for("apex.arrangementRoute")];
        navigation.prepare = false;
        navigation.pending = "spotifypanel";
        navigation.reveal("spotifypanel");
      } catch (error) { Log.warn("ui", "Player arrangement could not load: " + error.message); }
    });
  }

  function panels() {
    return Object.fromEntries(Object.keys(routes).filter((id) => id !== "home").map((id) => [id, panel(id)]));
  }

  function create(_store, onSelect) {
    Log.info("game", "SettingsNav.create");
    let current = "home", generation = 0, /** @type {ReturnType<typeof SettingsSearch.create> | null} */ search = null;
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
    let stopRestore = () => {};
    const restoreFocus = (el, scroll) => {
      stopRestore();
      const placed = (typeof SettingsSearch !== "undefined" && SettingsSearch.reveal(el)) || quietFocus(el);
      if (placed && typeof ResizeObserver === "function") {
        const request = generation;
        // SheetShape and rotation can reflow this page after focus returns.
        // Follow those size changes only until the player's next interaction.
        const observer = new ResizeObserver(() => {
          if (request !== generation || document.activeElement !== el || !visible(el)) { stopRestore(); return; }
          // The sheet can change WIDTH between pages (a phone at 70 %): the saved offset only fits the settled one (#5358).
          // Null-guard: a missing body must not throw — that would skip stop() and leave the window capture listeners.
          if (scroll != null) {
            const body = document.getElementById("pm-settings-body");
            if (body) body.scrollTop = scroll;
          }
          el.scrollIntoView({ block: "nearest" });
        });
        const events = ["pointerdown", "keydown", "wheel", "touchstart"];
        const stop = () => {
          observer.disconnect();
          for (const type of events) window.removeEventListener(type, stop, true);
          if (stopRestore === stop) stopRestore = () => {};
        };
        stopRestore = stop;
        for (const type of events) window.addEventListener(type, stop, { capture: true, passive: true });
        observer.observe(panel(current) || document.getElementById("pm-settings-index"));
        const body = document.getElementById("pm-settings-body");
        if (body) observer.observe(body);
      }
      return placed;
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

    // User Timing for phone hitch budgets (D·IP2). Safe no-op when performance
    // is missing (mini-DOM unit tests).
    function mark(name) {
      try {
        if (typeof performance !== "undefined" && performance.mark) performance.mark(name);
      } catch (_) { /* optional */ }
    }
    let scrollFadeTimer = 0;
    function scheduleScrollFade() {
      // screenMo settles when #pmsettings's hidden flips. ScrollFade.refresh()
      // is settle(true): an immediate paintAll over every menu region, then
      // again at 120ms and 400ms. openSettings calls showCurrent() while the
      // sheet is still hidden, and SettingsNav.create does the same at boot.
      // Arming refresh there stacks a second full measure on the flip, or
      // paints every region during boot. In-sheet page changes do not flip
      // hidden, so they still arm the timer. querySelector, not getElementById:
      // the unit DOM creates missing ids.
      const sheet = typeof document !== "undefined" && document.querySelector
        ? document.querySelector("#pmsettings") : null;
      if (!sheet || sheet.hidden) return;
      if (typeof window === "undefined" || !window.ScrollFade) return;
      if (scrollFadeTimer) clearTimeout(scrollFadeTimer);
      scrollFadeTimer = setTimeout(() => {
        scrollFadeTimer = 0;
        try { window.ScrollFade.refresh(); } catch (_) { /* detached */ }
      }, 48);
    }
    // bundleTried: undefined = not yet, "ok" / "failed" = the lazy bundle already
    // answered once for this open. Never gate twice: a failed ensureAudio leaves
    // the stub resident, so re-gating would retry forever. (Ship #1320 used a
    // boolean `ensured` flag; keep the richer "failed" → offline note path.)
    function show(want, focus, after, bundleTried) {
      stopRestore();
      flushLazy();
      const request = ++generation;
      const id = Object.hasOwn(routes, want) ? want : "home";
      mark("apex:settings:show");
      // LAZY_AUDIO: same gate as the audio door — SettingRow must wire before
      // #audioset is revealed (programmatic show("audio") included). The door
      // click goes through here too, so it asks the bundle exactly once.
      const loadAudio = id === "audio" && typeof AudioPanel !== "undefined" && typeof AudioPanel._ensure === "function"
        && (typeof GameAudio === "undefined" || GameAudio._stub);
      const loadTouch = id === "controls" && typeof Input !== "undefined" && Input.setPedalSlide
        && typeof TouchButtonSettings === "undefined" && typeof ScriptLoader !== "undefined";
      const loadFiles = id === "files" && typeof SettingsExport !== "undefined" && SettingsExport.loaded && !SettingsExport.loaded();
      const loadAppearance = id === "appearance" && typeof AppearanceStudio !== "undefined" && !AppearanceStudio.loaded();
      if (!bundleTried && (loadAudio || loadTouch || loadFiles || loadAppearance)) {
        let asked;
        try { asked = Promise.resolve(loadAppearance ? AppearanceStudio.ensureLoaded() : loadFiles ? SettingsExport.ready() : loadAudio ? AudioPanel._ensure()
          : ScriptLoader.create().load(["js/ui/touch-button-settings.js"], [], { strict: true })); }
        catch (_) { asked = Promise.resolve(false); }
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
      if (id === "audio" || id === "controls" || id === "appearance") bundleNote(pages[id], id, bundleTried === "failed");
      if (id === "controls" && typeof TouchButtonSettings !== "undefined") TouchButtonSettings.mountControls(_store, onSelect);
      // Lifecycle hooks also cover programmatic/search navigation, after lazy
      // loading, and before focus resolves newly mounted page controls.
      if (id === "progress" && typeof Badges !== "undefined") Badges.render();
      mountReset(id, pages[id]);
      fireEnter(id);
      const body = document.getElementById("pm-settings-body");
      if (body) body.scrollTop = 0;
      // A callback may disable/reflow controls (KeyBinds and audio do this),
      // so run it before resolving the page's focus target.
      const placed = typeof after === "function" && after() === true;
      if (focus && !placed) focusPage(id);
      scheduleScrollFade();
      mark("apex:settings:shown");
    }

    function mountReset(id, panel) {
      if (!panel || typeof SettingsExport === "undefined" || !["controls", "advanced", "driving", "display", "appearance", "a11y", "audio", "graphics", "files"].includes(id)) return;
      if (panel.querySelector("[data-reset-settings]")) return;
      const button = document.createElement("button"); button.type = "button";
      button.setAttribute("data-reset-settings", id);
      button.textContent = id === "files" ? "RESET ALL PREFERENCES…" : "RESET " + routes[id].title + "…";
      button.onclick = async () => {
        const request = generation;
        button.disabled = true;
        try {
          if (await SettingsExport.ready()) {
            if (request === generation && !panel.hidden && !document.getElementById("pmsettings")?.hidden) SettingsExport.resetRow(id, button);
          } else button.textContent = "RESET UNAVAILABLE — TAP TO RETRY";
        } catch (_) { button.textContent = "RESET UNAVAILABLE — TAP TO RETRY"; }
        finally { button.disabled = false; }
      };
      panel.appendChild(button);
    }

    // The audio bundle could not load (offline / UPDATE READY): the page still
    // reveals with the stub engine, so say why the sliders are silent.
    function bundleNote(panel, page, failed) {
      const noteId = page === "audio" ? "audioset-offline" : page === "appearance" ? "pm-appearance-offline" : "pm-touch-offline";
      let n = panel?.querySelector("#" + noteId);
      if (!failed && !n) return;
      if (!n) {
        if (!panel || typeof document.createElement !== "function") return;
        n = document.createElement("p"); n.id = noteId;
        n.className = "adv-help"; n.setAttribute("role", "status");
        panel.insertBefore(n, panel.firstChild);
      }
      // A role=status filled as it is inserted is not announced: say it once (uihunt4 #2).
      const say = failed && (n.hidden || !n.textContent) && typeof LiveRegion !== "undefined";
      n.textContent = page === "audio" ? "AUDIO ENGINE DID NOT LOAD — CHECK YOUR CONNECTION OR RELOAD" :
        page === "appearance" ? "Appearance editor could not load. Reopen Appearance to retry." : "Touch button settings could not load. Reopen Controls to retry.";
      n.hidden = !failed;
      if (say) LiveRegion.say(n.textContent, "hud");
    }

    function back() {
      stopRestore();
      if (current === "home" || direct) { generation++; if (current !== "home") fireLeave(current); direct = false; current = "home"; return true; }
      if (stack.length) {
        const parent = stack.pop();
        show(parent.page, false);
        originDoor = parent.origin;
        const body = document.getElementById("pm-settings-body");
        if (body) body.scrollTop = parent.scroll;
        // A rotation or scale change can move the launcher beyond its saved
        // offset. Keep the returning control visible in the current layout.
        restoreFocus(parent.door, parent.scroll) || focusPage(parent.page);
        return false;
      }
      show("home", false);
      const door = originDoor;
      originDoor = null;
      if (!(search && search.restore())) restoreFocus(door) || focusPage("home");
      return false;
    }

    function enter(id, door, after) {
      if (current !== "home") stack.push({ page: current, door, origin: originDoor, scroll: document.getElementById("pm-settings-body")?.scrollTop || 0 });
      originDoor = door;
      // LAZY_AUDIO: MUSIC & SOUND's SettingRows demote the static ‹ › chevrons.
      // show() reveals audio only after ensureAudio so MenuNav.items matches a
      // wired panel (otherwise arrow-walk marks ~12 chevrons missed — menu-traversal).
      show(id, true, () => { if (onSelect) onSelect(id); return typeof after === "function" && after(); });
    }
    const doors = Object.fromEntries(Object.entries(routes).filter(([, route]) => route.door).map(([id, route]) => [id, route.door()]));
    for (const [id, door] of Object.entries(doors)) if (door) door.onclick = () => {
      if (search) search.cancel();
      enter(id, door);
    };
    const index = document.getElementById("pm-settings-index");
    if (index && !index.querySelector("h3")) {
      for (const first of index.querySelectorAll("[data-settings-category]")) {
        const heading = document.createElement("h3");
        heading.className = "pm-group-h";
        heading.textContent = first.dataset.settingsCategory;
        index.insertBefore(heading, first);
      }
    }
    // Every open starts at the door index. Do not steal focus here: the dialog
    // seam owns focus when it opens, and its opener should remain authoritative.
    originDoor = null;
    show("home", false);
    if (typeof SettingsSearch !== "undefined") search = SettingsSearch.create({
      host: document.getElementById("pm-settings-index"), show, onSelect,
      onLeave: (fn) => leaveFns.push(fn),
    });
    // One setting, one home (UI audit 2026-10-18): a second mention elsewhere is
    // a JUMP, data-settings-jump="<page>" data-jump-target="<control id>", that
    // opens the home page on the stack (BACK returns) and focuses the control
    // the way a search result does.
    if (!jumpWired && typeof document !== "undefined") {
      jumpWired = true;
      document.addEventListener("click", (e) => {
        const b = e.target && e.target.closest ? e.target.closest("[data-settings-jump]") : null;
        if (!b || !live) return;
        const target = b.getAttribute("data-jump-target");
        enterLive(b.getAttribute("data-settings-jump"), b,
          () => typeof SettingsSearch !== "undefined" && SettingsSearch.reveal(document.querySelector("#" + target)));
      });
    }
    enterLive = enter;
    live = {
      // The caller uses this on every open, including after an interrupted
      // page transition. Clear the previous door so a later BACK cannot return
      // to a stale element from an earlier dialog instance, and empty the
      // search (a close is not signalled here: invalidate() also runs when a
      // result steps into Race Settings, which returnToSearch() comes back from).
      showCurrent: () => { originDoor = null; direct = false; stack.length = 0; if (search) search.reset(); show("home", false); },
      returnToSearch: () => { direct = false; stack.length = 0; show("home", false); return !!search && search.restore(); },
      showDirect: (id, focus) => { direct = true; stack.length = 0; show(id, focus); },
      current: () => current,
      show, back, invalidate: () => { stopRestore(); generation++; if (current !== "home") fireLeave(current); current = "home"; direct = false; stack.length = 0; },
    };
    return live;
  }

  return {
    create, routes, panel, breadcrumb,
    show: (id, focus, after) => { if (live) live.show(id, focus, after); },
    current: () => live ? live.current() : "home",
    showDirect: (id, focus) => { if (live) live.showDirect(id, focus); },
    invalidate: () => { if (live) live.invalidate(); },
    onLeave: (fn) => { if (typeof fn === "function") leaveFns.push(fn); },
    onEnter: (fn) => { if (typeof fn === "function") enterFns.push(fn); },
    lazy, flushLazy, presets, graphicsDetails,
  };
})();
Object.freeze(SettingsNav);
