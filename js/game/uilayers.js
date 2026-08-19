"use strict";
/* UI LAYERS — the one answer to "which screen is on top, and are we racing?"
 *
 * WHY. Three modules used to ask that question and none of them agreed:
 *
 *   js/game/input.js   menuOverlayOpen()  — should a key drive the car?
 *   js/game/menunav.js LAYER_IDS          — which pane do the arrows move?
 *   js/game/topmodal.js `dialog.screen`   — which screens does Escape close?
 *
 * Each carried its own hand-maintained list, menunav.js's header asserted that
 * input.js "asks the same question", and by the time this was written the two
 * lists differed by five screens: #career and its three sub-sheets and #quali
 * were absent from the input gate, so arrow keys inside the career hub fell
 * through and latched the car's steering, and neither list had heard of
 * #lighting, #camtune, #vsfriend or #spotifypanel at all. A list that must be
 * edited in three files whenever a screen is added is a list that will drift
 * again; this is that list, once.
 *
 * THE TOP LAYER IS NOT ORDERABLE BY z-index, which is the other bug this fixes.
 * Every `.screen.dim` is a real <dialog> opened with showModal() (see
 * js/game/topmodal.js), and a top-layer dialog computes `z-index: auto` — so
 * ranking candidates by parseInt(zIndex) scored the modal as 0 and handed the
 * arrow keys and the wheel to whatever visible screen sat behind it. Measured:
 * with #standings open over the pause menu, the old activeLayer() returned
 * #overlay. `:modal` outranks every z-index here, because the platform says so.
 */
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
    { id: "quali" },
    { id: "standings" },
    { id: "results" },
    { id: "customize" },
    { id: "carsetup" },
    { id: "howtoplay" },
    { id: "advanced" },
    { id: "audioset" },
    { id: "spotifypanel" },
    { id: "track-detail" },
    { id: "lighting" },
    { id: "camtune" },
    // The free camera is a SUB-LAYER of the two tuner panels (z 44 over their
    // 42), so Escape steps out of the fly-cam before it closes the panel —
    // which is what a back key should do, one step at a time.
    { id: "photo-controls" },
    { id: "datahub" },
  ];

  const LAYER_IDS = DEFS.map((d) => d.id);

  /* `:not([hidden])` belongs IN the selector rather than in a filter after it.
     Every one of these is opened and closed with the hidden attribute, so
     mid-race the query matches nothing and no element is ever measured. That is
     the hot path: a held arrow key repeats keydown ~30x a second, and the
     version that measured them all first forced a style recalc on every
     repeat. */
  const sel = (defs) => defs.map((d) => "#" + d.id + ":not([hidden])").join(",");
  const ALL_SEL = sel(DEFS);

  // A zero box is the real test, not the hidden attribute: it also catches an
  // element inside a display:none ancestor, a control in a collapsed section,
  // and the several buttons index.html ships hidden and reveals per game mode.
  // This is the strict form, used for CONTROLS (js/game/menunav.js filters its
  // focus targets and scroll panes with it).
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

  /* The topmost open layer. Layers stack (the team picker over the select
     screen, the pause settings over the pause menu) and z-index is how the CSS
     expresses that order — but a showModal() dialog is in the TOP LAYER, above
     every z-index there is, so it wins outright. DOM order breaks the ties. */
  function top() {
    let best = null, bestRank = -Infinity;
    for (const el of document.querySelectorAll(ALL_SEL)) {
      if (!shownLayer(el)) continue;
      const z = parseInt(getComputedStyle(el).zIndex, 10);
      const rank = isModal(el) ? Infinity : (isFinite(z) ? z : 0);
      // >= so DOM order breaks a tie in favour of the LATER element, which is
      // the one painted on top.
      if (rank >= bestRank) { bestRank = rank; best = el; }
    }
    return best;
  }

  // "A menu is open" for the purpose of not driving the car. Ignores the
  // `gate: false` layers (see DEFS). Same zero-size-wrapper allowance as top(),
  // or the LIGHTING TUNER would go on handing arrow keys to the car.
  /* Resolved by ID rather than by document query, because THIS one is called
     from the frame loop. Input.poll() -> pollGamepad() runs every frame (before
     the paused gate, so on menus too) and asks anyOpen() on every one — and
     the 24-selector comma list it used to pass to querySelectorAll misses
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
      if (el.hidden) continue;          // the cheap test the selector used to do
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
    const t = top();
    return !!(t && t.id === "overlay");
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
    try { Log.info("ui", "UiLayers.raceGetter " + (raceGetter ? "on" : "off")); } catch (_) { /* Log absent in isolated VM */ }
  }
  function inRace() { return !!(raceGetter && raceGetter()); }

  return { LAYER_IDS, top, anyOpen, navOpen, shown, inRace, setRaceGetter };
})();
