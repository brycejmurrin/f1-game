const SettingsNav = (function () {
  "use strict";
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
  function breadcrumb(id) {
    if (!Object.hasOwn(routes, id)) id = "home";
    const names = [];
    for (let route = id; route; route = routes[route].parent || (route === "home" ? null : "home")) names.unshift(routes[route].title);
    return names.join(" › ");
  }
  let live = null, enterLive = null, jumpWired = false;
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
  enterFns.push(flushLazy);

  let presetsLoad = null;
  const presetsLoaded = new Set();
  function presets() {
    const R =  (globalThis).ApexRoster || null;
    if (typeof LayoutPresets !== "undefined") return Promise.resolve(true);
    if (presetsLoad) return presetsLoad;
    if (!R || !R.LAZY_UI_PRESETS || typeof ScriptLoader === "undefined") return Promise.resolve(false);
    const fail = (e) => { presetsLoad = null; Log.warn("ui", "the layout preset row did not load" + (e ? ": " + (e.message || e) : "")); return false; };
    presetsLoad = ScriptLoader.create().load(R.LAZY_UI_PRESETS, R.LAZY_UI_PRESETS_EDGES || [], { strict: true, loaded: presetsLoaded })
      .then((ok) => (!ok || typeof LayoutPresets === "undefined" ? fail() : true), fail);
    return presetsLoad;
  }
  enterFns.push((id) => { if (id === "appearance") presets(); });

  function panels() {
    return Object.fromEntries(Object.keys(routes).filter((id) => id !== "home").map((id) => [id, panel(id)]));
  }

  function create(_store, onSelect) {
    Log.info("game", "SettingsNav.create");
    let current = "home", generation = 0, search = null;
    let originDoor = null, direct = false;
    const stack = [];

    const visible = (el) => {
      if (!el || el.disabled) return false;
      for (let p = el; p; p = p.parentElement || p.parentNode) {
        if (p.hidden || (p.getAttribute && p.getAttribute("aria-hidden") === "true")) return false;
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
        const observer = new ResizeObserver(() => {
          if (request !== generation || document.activeElement !== el || !visible(el)) { stopRestore(); return; }
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

    function mark(name) {
      try {
        if (typeof performance !== "undefined" && performance.mark) performance.mark(name);
      } catch (_) {  }
    }
    let scrollFadeTimer = 0;
    function scheduleScrollFade() {
      const sheet = typeof document !== "undefined" && document.querySelector
        ? document.querySelector("#pmsettings") : null;
      if (!sheet || sheet.hidden) return;
      if (typeof window === "undefined" || !window.ScrollFade) return;
      if (scrollFadeTimer) clearTimeout(scrollFadeTimer);
      scrollFadeTimer = setTimeout(() => {
        scrollFadeTimer = 0;
        try { window.ScrollFade.refresh(); } catch (_) {  }
      }, 48);
    }
    function show(want, focus, after, audioTried) {
      stopRestore();
      flushLazy();
      const request = ++generation;
      const id = Object.hasOwn(routes, want) ? want : "home";
      mark("apex:settings:show");
      if (id === "audio" && !audioTried && typeof AudioPanel !== "undefined" && typeof AudioPanel._ensure === "function"
          && (typeof GameAudio === "undefined" || GameAudio._stub)) {
        let asked;
        try { asked = Promise.resolve(AudioPanel._ensure()); } catch (_) { asked = Promise.resolve(false); }
        asked.then((ok) => ok, () => false).then((ok) => {
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
      if (id === "files" && typeof SettingsExport !== "undefined" && SettingsExport.ensureMounted) {
        SettingsExport.ensureMounted();
      }
      Log.info("game", `SettingsNav.show ${id}`);
      if (id === "audio") audioNote(pages.audio, audioTried === "failed");
      if (id === "progress" && typeof Badges !== "undefined") Badges.render();
      fireEnter(id);
      const body = document.getElementById("pm-settings-body");
      if (body) body.scrollTop = 0;
      const placed = typeof after === "function" && after() === true;
      if (focus && !placed) focusPage(id);
      scheduleScrollFade();
      mark("apex:settings:shown");
    }

    function audioNote(panel, failed) {
      let n = document.getElementById("audioset-offline");
      if (!failed && !n) return;
      if (!n) {
        if (!panel || typeof document.createElement !== "function") return;
        n = document.createElement("p");
        n.id = "audioset-offline"; n.className = "adv-help"; n.setAttribute("role", "status");
        panel.insertBefore(n, panel.firstChild);
      }
      const say = failed && (n.hidden || !n.textContent) && typeof LiveRegion !== "undefined";
      n.textContent = "AUDIO ENGINE DID NOT LOAD — CHECK YOUR CONNECTION OR RELOAD";
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
      show(id, true, () => { if (onSelect) onSelect(id); return typeof after === "function" && after(); });
    }
    const doors = Object.fromEntries(Object.entries(routes).filter(([, route]) => route.door).map(([id, route]) => [id, route.door()]));
    for (const [id, door] of Object.entries(doors)) if (door) door.onclick = () => {
      if (search) search.cancel();
      enter(id, door);
    };
    originDoor = null;
    show("home", false);
    if (typeof SettingsSearch !== "undefined") search = SettingsSearch.create({
      host: document.getElementById("pm-settings-index"), show, onSelect,
      onLeave: (fn) => leaveFns.push(fn),
    });
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
    show: (id, focus) => { if (live) live.show(id, focus); },
    current: () => live ? live.current() : "home",
    showDirect: (id, focus) => { if (live) live.showDirect(id, focus); },
    invalidate: () => { if (live) live.invalidate(); },
    onLeave: (fn) => { if (typeof fn === "function") leaveFns.push(fn); },
    onEnter: (fn) => { if (typeof fn === "function") enterFns.push(fn); },
    lazy, flushLazy, presets,
  };
})();
Object.freeze(SettingsNav);
