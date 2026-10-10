"use strict";
/* UI LAYERS — which screen is on top, and are we racing?
 * Canonical layer list (LAYER_IDS) for input.js, menu-nav.js, modal.js.
 * showModal() dialogs outrank z-index (`:modal` beats parseInt(zIndex)). */
window.UiLayers = (function () {

  /* Every screen-sized layer in the app, in no particular order — the ranking
     below decides which one is on top, not this list's order.
     `gate: false` marks a layer that is open but must NOT stop keys reaching
     the car. #overlay (the main menu) is the only one: nothing is driving while
     it is up, so a latched key is harmless, and several input specs dispatch
     keys straight at a freshly-loaded page — gating those on the title screen
     being closed would make the guard the thing under test. */
  const DEFS = [
    { id: "overlay", gate: false },
    /* The rotate blocker: an opaque z-9000 fixed div shown MID-RACE (unique
       among these layers), self-gated by CSS media queries rather than the
       hidden attribute. gate: false is load-bearing three ways — Escape must
       still pause the race (anyOpen() stays false), arrows must not be
       swallowed as menu nav gating, and gateEls() must not pay a per-frame
       measure for an element that never carries `hidden`. Being in DEFS at
       all is what lets TopModal's focus containment see it as top(): before
       this entry, Tab walked out of the blocker into #pausebtn and the
       touch controls behind the opaque backdrop. No data-esc-close on the
       element — onEscape returns without consuming, deliberately. */
    { id: "rotate-device", gate: false },
    /* Pre-race plate (js/ui/loading-screen.js). Default gate so anyOpen() is
       true while it is up: Escape must not pause under the card (input.js
       only pauses when !anyOpen()), and driving keys stay off the car. The
       shell marks data-esc="none"; KeyP / pad Start are refused in
       platform-session.js because those paths do not consult anyOpen(). */
    { id: "loading" },
    { id: "pausemenu" },
    { id: "pmsettings" },
    { id: "select" },
    { id: "season-setup" },
    { id: "career" },
    { id: "career-offers" },
    { id: "career-history" },
    { id: "career-guide" },
    { id: "teampicker" },
    { id: "vsfriend" },
    { id: "race-settings" },
    { id: "duel-picker" },
    { id: "quali" },
    { id: "standings" },
    { id: "results" },
    { id: "customize" },
    { id: "carsetup" },
    { id: "howtoplay" },
    { id: "spotifypanel" },
    { id: "track-detail" },
    { id: "lighting" },
    { id: "camtune" },
    { id: "flyby" },
    { id: "freecam" },
    { id: "garrival" },
    /* The TITLE LAYOUT editor's docked toolbar (js/ui/title-layout.js): over
       #overlay while the title screen is being dragged about. */
    { id: "tl-editor" },
    { id: "photo-controls" },
    { id: "photo-studio" },
    { id: "datahub" },
    /* The TRACK DESIGNER (js/editor/designer.js): a <dialog> like #datahub,
       built on first open behind #mb-designer. */
    { id: "trackdesigner" },
  ];

  const LAYER_IDS = DEFS.map((d) => d.id);

  /* `:not([hidden])` belongs IN the selector rather than in a filter after it.
     Every one of these is opened and closed with the hidden attribute, so
     mid-race the query matches nothing and no element is ever measured. That is
     the hot path: a held arrow key repeats keydown ~30x a second, and the
     version that measured them all first forced a style recalc on every
     repeat. */
  const sel = (defs) => defs.map((d) => `#${d.id}:not([hidden])`).join(",");
  const ALL_SEL = sel(DEFS);

  function shown(el) {
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return getComputedStyle(el).visibility !== "hidden";
  }

  /* A LAYER MAY BE A ZERO-SIZE WRAPPER, so the strict test above is the wrong
     question to ask of one. #lighting and #camtune are
     `position: fixed; top/right/bottom: 0` with no `left` and no width, and
     everything you can see in them is a `position: fixed` child that does not
     size its parent: measured, an open LIGHTING TUNER is 0x820 with a 437px
     panel inside it. Judged on its own box the whole tuner was invisible to the
     layer stack — Escape did nothing there and the arrow keys still reached the
     car. Ask the children before calling a layer closed. */
  function shownLayer(el) {
    if (!el || el.hidden) return false;
    if (getComputedStyle(el).visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    if (r.width >= 1 && r.height >= 1) return true;
    for (const c of el.children) {
      if (shown(c)) return true;
    }
    return false;
  }

  function isModal(el) {
    // :modal is Chrome 105 / Safari 15.6 / Firefox 103. Older engines simply
    // fall back to the z-index ranking, which is what this code always did.
    try { return !!(el.matches && el.matches(":modal")); } catch (_) { return false; }
  }

  // Selector results have DOM order, including :modal. Record actual openings
  // at the native seam, including dynamically-created telemetry dialogs.
  const modalOrder = new WeakMap();
  let modalSerial = 0;
  const tracked = new WeakSet();
  function trackDialog(target) {
    if (!target || tracked.has(target) || typeof target.showModal !== "function") return;
    const show = target.showModal;
    target.showModal = function (...args) {
      if (isModal(this)) return show.apply(this, args);
      const previous = modalOrder.get(this);
      modalOrder.set(this, ++modalSerial); // native focusing runs synchronously
      try { return show.apply(this, args); }
      catch (error) {
        if (previous == null) modalOrder.delete(this); else modalOrder.set(this, previous);
        throw error;
      }
    };
    tracked.add(target);
  }
  if (typeof HTMLDialogElement !== "undefined") trackDialog(HTMLDialogElement.prototype);

  /* A dialog can sit in the top layer without a stamp in modalOrder: native
     showModal before the prototype wrap, a wrap skip when isModal was already
     true, or a thrown native call that TopModal swallowed. Rank 0 then loses
     to an earlier tracked dialog, so MenuNav.activeLayer() names the sheet
     BEHIND the one the player can see (packed-3: #pausemenu over #standings
     while CLOSE on standings held focus). Stamp the first time top() sees a
     live :modal, so it always outranks openings we already recorded. */
  function modalRank(el) {
    const existing = modalOrder.get(el);
    if (existing) return existing;
    if (!isModal(el)) return 0;
    const n = ++modalSerial;
    modalOrder.set(el, n);
    return n;
  }

  /* The topmost open layer. Layers stack (the team picker over the select
     screen, the pause settings over the pause menu) and z-index is how the CSS
     expresses that order — but a showModal() dialog is in the TOP LAYER, above
     every z-index there is, so it wins outright. Opening order ranks dialogs;
     DOM order breaks z-index ties between non-modal layers.
     Rank a :modal layer even at 0×0: Chromium can drop its box after the
     hidden→showModal seam, and shownLayer would then pick the screen behind. */
  function top() {
    let best = null;
    let bestRank = -Infinity;
    let bestModal = false;
    for (const el of document.querySelectorAll(ALL_SEL)) {
      const modal = isModal(el);
      // :modal is the platform top layer even when Chromium has dropped the
      // element's box (css-layers: hidden→showModal re-attach). Size is the
      // wrong closed-test for that case — skip it and still rank the dialog.
      if (!modal && !shownLayer(el)) continue;
      const rank = modal ? modalRank(el) : (parseInt(getComputedStyle(el).zIndex, 10) || 0);
      // A modal always outranks a non-modal; between two modals (or two
      // non-modals) the higher rank wins, ties going to the later element.
      if (modal !== bestModal ? modal : rank >= bestRank) {
        bestRank = rank; best = el; bestModal = modal;
      }
    }
    return best;
  }

  /* Resolved by ID rather than by document query, because THIS one is called
     from the frame loop. Input.poll() -> pollGamepad() runs every frame (before
     the paused gate, so on menus too) and asks anyOpen() on every one — and
     a 24-selector comma list passed to querySelectorAll misses
     Blink's single-selector fast paths and walks the element tree
     instead. `#id:not([hidden])` is exactly `getElementById(id)` plus an
     `el.hidden` test, so 24 map lookups give the identical answer without the
     walk. Cached lazily and re-resolved whenever an entry is missing, so a
     layer that has not been created yet is picked up as soon as it exists.

     top() deliberately keeps its querySelectorAll: it ranks by z-index and
     relies on DOCUMENT ORDER to break ties ("the LATER element, which is the
     one painted on top"), which DEFS order does not promise. It also runs on
     key events, not per frame. */
  let _gateEls = null;
  function gateEls() {
    if (_gateEls) {
      for (let i = 0; i < _gateEls.length; i++) if (!_gateEls[i].isConnected) { _gateEls = null; break; }
    }
    if (!_gateEls) {
      const ids = DEFS.filter((d) => d.gate !== false).map((d) => d.id);
      const els = [];
      for (const id of ids) { const el = document.getElementById(id); if (el) els.push(el); }
      // Only cache once every gated layer exists; before that, re-resolve each
      // call so a late-built layer is never permanently missed.
      if (els.length === ids.length) _gateEls = els;
      return els;
    }
    return _gateEls;
  }

  function anyOpen() {
    const els = gateEls();
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.hidden) continue;          // the cheap test, first
      if (shownLayer(el)) return true;
    }
    return false;
  }

  /* Pad/keyboard chrome on the TITLE screen. anyOpen() stays false there
     (`gate: false` on #overlay — tests/specs/gamepad.spec.js asserts that)
     so driving keys are not swallowed on a freshly-loaded page. The pad
     still needs to move the title doors; overlay is hidden in-race. */
  function navOpen() {
    if (anyOpen()) return true;
    // Only these two layers are gate:false, so once anyOpen() is false the old
    // top() lookup could name nothing else. It is a 33-selector querySelectorAll
    // and Input.pollGamepad() reaches here every frame of a race for a pad
    // player, so ask the two elements directly instead.
    // rotate-device joins overlay here: both are gate:false layers whose
    // buttons the pad must still reach. Without it, a pad-only player in
    // portrait mid-race had d-pad/A spent on boost/shift behind the opaque
    // blocker and NO reachable way to press OPEN CONTROLS or EXIT RACE.
    return shownLayer(document.getElementById("overlay")) || shownLayer(document.getElementById("rotate-device"));
  }

  /* IN A RACE means the game loop is simulating — `state === "race" || "count"`,
     the same pair setPaused() gates on. `state` is closure-local to js/game.js,
     so game.js hands us a getter at boot rather than anyone re-deriving it from
     the DOM. Before that call (and in the VM-based unit tests, which never boot
     game.js) this reads false, which is the safe answer: Escape falls through
     to the layer handler instead of pausing something that is not running. */
  let raceGetter = null;
  function setRaceGetter(fn) {
    raceGetter = typeof fn === "function" ? fn : null;
    try { Log.info("ui", `UiLayers.raceGetter ${raceGetter ? "on" : "off"}`); } catch (_) { /* Log absent in isolated VM */ }
  }
  function inRace() { return !!(raceGetter && raceGetter()); }

  return { LAYER_IDS, top, anyOpen, navOpen, shown, inRace, setRaceGetter, trackDialog };
})();
