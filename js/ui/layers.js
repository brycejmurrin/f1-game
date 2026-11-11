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
    // Built on demand; owns focus and driving-key gating while pieces stay draggable.
    { id: "hud-arrange-bar" },
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
    { id: "bench" },
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

  /* Open layers by id (0.01 ms) — a 36-id comma querySelectorAll walks the whole
     tree (3.6 ms at 5.3k nodes, uihunt4 #6) — in DOCUMENT order, which breaks
     z-index ties (the later element paints on top) and DEFS order does not promise. */
  function byIds(ids) {
    const out = [];
    for (const id of ids) { const el = document.getElementById(id); if (el) out.push(el); }
    return out;
  }
  function layerEls() {
    return byIds(LAYER_IDS).filter((el) => !el.hidden).sort((a, b) => (a.compareDocumentPosition ? (a.compareDocumentPosition(b) & 4 ? -1 : 1) : 0));
  }

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
  /* Layers that still need a geometry read for ranking (`top`) and for the
     rare CSS-only hide:
     - #rotate-device — shown/hidden by CSS media queries, never `hidden`
     - #lighting / #camtune — zero-size wrappers (children hold the box)
     An open <dialog> is platform-visible (`el.open`). Measuring a dialog
     (or every ordinary :not([hidden]) layer) after TopModal's showModal()/
     inert writes forces a sync reflow — DevTools ForcedReflow on
     Title→Settings, survey #3248. `shownLayer` still measures non-dialogs
     so navOpen/anyOpen memo pins keep their layout-count assertions;
     `top()` uses `layerOpen` so ranking itself does not flush layout. */
  const NEEDS_BOX = { "rotate-device": 1, lighting: 1, camtune: 1 };

  function shownLayer(el) {
    if (!el || el.hidden) return false;
    if (el.open) return true;
    if (getComputedStyle(el).visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    if (r.width >= 1 && r.height >= 1) return true;
    for (const c of el.children) {
      if (shown(c)) return true;
    }
    return false;
  }

  /* Ranking open-test: trust `hidden` / `open` for ordinary layers so a
     focusin→top() during Settings open does not force layout on #overlay.
     #rotate-device is CSS-gated on body.in-race — without that class it cannot
     be visible, so skip the geometry flush on the title/Settings path. */
  function layerOpen(el) {
    if (!el || el.hidden) return false;
    if (el.open) return true;
    if (el.id === "rotate-device") {
      const root = document.body || document.documentElement;
      if (!root || !root.classList || !root.classList.contains("in-race")) return false;
      return shownLayer(el);
    }
    if (NEEDS_BOX[el.id]) return shownLayer(el);
    return true;
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
  /* MEMOISED like navOpen() (audit4 UB2): pad-menu's padNavPoll asks top() EVERY
     FRAME while a pad is in a menu, and each live call is layerEls()
     plus a :modal query plus a getComputedStyle per open layer. The same
     observer drops the memo (navDirty), a second one sees any `open` attribute in
     the document (showModal on a dynamic dialog), and a detached answer is never
     returned. Drain BEFORE computing, and return the local: draining after it
     (navDirty drops topMemo) handed callers `undefined` whenever records were
     pending, so experience.js's photo swap saw the layer "change" and gave up. */
  let topMemo, topMemoAt = 0;
  function top() {
    if (!navObs) return topNow();
    const now = clock();
    if (!navDirty() && topMemo !== undefined && now - topMemoAt < NAV_MEMO_MS
      && (!topMemo || topMemo.isConnected !== false)) return topMemo;
    const best = topNow();
    topMemo = best;
    topMemoAt = now;
    return best;
  }
  function topNow() {
    let best = null;
    let bestRank = -Infinity;
    let bestModal = false;
    // Dynamic nested dialogs (telemetry) own focus, arrows and paging too.
    // Keep the native selector separate for engines without :modal support.
    let layers = layerEls();
    try { layers = layers.concat(Array.from(document.querySelectorAll(":modal"))); } catch (_) { /* older engine */ }
    const uniq = Array.from(new Set(layers));
    // A live :modal always wins ranking. Skip non-modals entirely then so
    // focusin→top() during Settings open does not getComputedStyle /
    // getBoundingClientRect the title sheet behind it (#3248 ForcedReflow).
    let anyModal = false;
    for (let i = 0; i < uniq.length; i++) {
      if (isModal(uniq[i])) { anyModal = true; break; }
    }
    for (const el of uniq) {
      const modal = isModal(el);
      if (anyModal && !modal) continue;
      // :modal is the platform top layer even when Chromium has dropped the
      // element's box (css-layers: hidden→showModal re-attach). Size is the
      // wrong closed-test for that case — skip it and still rank the dialog.
      // Ordinary non-modals use layerOpen (no geometry) when no modal is up.
      if (!modal && !layerOpen(el)) continue;
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
     layer that has not been created yet is picked up as soon as it exists. top() walks the same ids (layerEls). */
  let _gateEls = null;
  function gateEls() {
    if (_gateEls) {
      for (let i = 0; i < _gateEls.length; i++) if (!_gateEls[i].isConnected) { _gateEls = null; break; }
    }
    if (!_gateEls) {
      const ids = DEFS.filter((d) => d.gate !== false).map((d) => d.id);
      const els = byIds(ids);
      // Only cache once every gated layer exists; before that, re-resolve each
      // call so a late-built layer is never permanently missed.
      if (els.length === ids.length) _gateEls = els;
      return els;
    }
    return _gateEls;
  }

  /* anyOpen() walks every gated layer and may call shownLayer() (layout).
     Input latches it once per poll(), but opening SETTINGS still asked it in a
     burst while showModal() reflowed the sheet (gpu-census / survey #3248).
     Share navOpen's observer + NAV_MEMO_MS window: drop the memo when a layer
     attribute changes, otherwise reuse the last answer. */
  const NAV_MEMO_MS = 250;
  let gateMemo = null;
  let gateMemoAt = 0;
  let navMemo = null;
  let navMemoAt = 0;
  let navObs = null;
  let openObs = null;
  let navStale = false;
  const navWatched = new WeakSet();
  const NAV_ATTRS = ["hidden", "class", "style", "open", "inert"];
  const clock = () => (typeof performance !== "undefined" && performance.now ? performance.now() : 0);

  function anyOpenLive() {
    const els = gateEls();
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.hidden) continue;          // the cheap test, first
      if (shownLayer(el)) return true;
    }
    return false;
  }

  function anyOpen() {
    if (!navObs) return anyOpenLive();
    const now = clock();
    if (gateMemo !== null && now - gateMemoAt < NAV_MEMO_MS && !navDirty()) return gateMemo;
    gateMemo = anyOpenLive();
    gateMemoAt = now;
    return gateMemo;
  }

  /* Pad/keyboard chrome on the TITLE screen. anyOpen() stays false there
     (`gate: false` on #overlay — tests/specs/gamepad.spec.js asserts that)
     so driving keys are not swallowed on a freshly-loaded page. The pad
     still needs to move the title doors; overlay is hidden in-race. */
  function navOpen() {
    const now = clock();
    if (navMemo !== null && now - navMemoAt < NAV_MEMO_MS && !navDirty()) return navMemo;
    const open = navOpenNow();
    if (navObs) { navDirty(); navStale = false; } // watch before trusting; a write after the read above is caught by the next call
    navMemo = open;   // AFTER the drain: navDirty() nulls navMemo, and a null return reads as "closed"
    navMemoAt = now;
    return open;
  }

  function navOpenNow() {
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

  /* navOpen() IS ASKED SEVERAL TIMES A TICK (remoteDrivingBlocked() from
     lookingBack, the remote pedals, the steer path, the pad poll), and #rotate-device is
     hidden by CSS (`display: none`), never by the hidden attribute, so the
     `el.hidden` shortcut cannot skip it: every call paid getComputedStyle plus
     getBoundingClientRect, which flush style and layout that the HUD's own
     writes dirty every frame. gpu-census run 38985693871: shownLayer was
     3.3-5.7 % of all sampled CPU on every backend.
     So the answer is memoised for NAV_MEMO_MS and dropped the
     moment something that could change it is written: a MutationObserver on
     the layers (and body/html, whose classes drive `body.in-race ...
     #rotate-device`) is drained with takeRecords(), which is synchronous and
     forces no layout, so a layer opened and asked about in the same task is
     still seen. Resize/orientation (media queries) drop it too. The time
     bound is the net for anything the observer cannot see (a stylesheet
     arriving). No MutationObserver (isolated VM) means no memo. */

  function navWatch(el, subtree) {
    if (!navObs || !el || navWatched.has(el)) return;
    navWatched.add(el);
    navObs.observe(el, { attributes: true, attributeFilter: NAV_ATTRS, subtree });
  }

  function navDirty() {
    if (!navObs) return true;
    if (navObs.takeRecords().length) navStale = true;
    if (openObs && openObs.takeRecords().length) navStale = true;
    // Layers created since the last look join the watch before the memo is trusted.
    for (const el of gateEls()) navWatch(el, true);
    navWatch(document.getElementById("overlay"), true);
    navWatch(document.getElementById("rotate-device"), true);
    const stale = navStale;
    navStale = false;
    if (stale) { gateMemo = null; navMemo = null; topMemo = undefined; } // one dirty flag, three memos: whoever reads it must drop all
    return stale;
  }

  if (typeof MutationObserver === "function" && typeof window !== "undefined" && window.addEventListener) {
    navObs = new MutationObserver(() => { navStale = true; });
    const root = document.documentElement;
    navWatch(root, false);
    // top()'s memo: any dialog's `open` anywhere (a separate observer, since a second
    // observe() of root on navObs would replace its options).
    openObs = new MutationObserver(() => { navStale = true; });
    openObs.observe(root, { attributes: true, attributeFilter: ["open"], subtree: true });
    if (document.body) navWatch(document.body, false);
    else document.addEventListener("DOMContentLoaded", () => { navWatch(document.body, false); navStale = true; }, { once: true });
    const drop = () => { navStale = true; };
    window.addEventListener("resize", drop);
    window.addEventListener("orientationchange", drop);
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
