"use strict";
/* SHEET SHAPE — one place decides whether a panel is TALL or WIDE.
 *
 * WHY THIS EXISTS. Several screens want "columns when the sheet is wide, bands
 * when it is tall", and CSS cannot ask that question. `container-type:
 * inline-size` answers width only; asking about height, aspect-ratio or
 * orientation needs `container-type: size`, which applies size containment in
 * BOTH axes — and a size container may not take its size from its contents,
 * which every one of these sheets does.
 *
 * So the stylesheets used `@media (orientation: portrait)` as a stand-in, and it
 * is not the same question. A portrait VIEWPORT does not give you a portrait
 * SHEET: on a rotated 1080x1920 monitor css/responsive.css caps #sel-inner at
 * 720px tall, so a landscape-shaped sheet sat inside a portrait window, took the
 * band layout meant for an upright tablet, and left the circuit list TWO PIXELS
 * of height. That bug is not a tuning mistake, it is the proxy being wrong.
 *
 * This measures the sheet itself and writes the answer where CSS can read it:
 *
 *     .sheet[data-shape="tall"]   height clearly exceeds width  -> bands
 *     .sheet[data-shape="wide"]   otherwise                     -> columns
 *
 * Two further things it buys, both of which have cost this project time:
 *   - An attribute selector carries specificity, so a `[data-shape]` rule beats
 *     a plain `#id` rule by weight rather than by source order. Container
 *     queries add NO specificity, which is why the map's width had to be routed
 *     through a `--sel-map-w` custom property to win a tie.
 *   - It can style the container it is on. `#sel-inner` IS the `sheet`
 *     container, so a `@container sheet` rule targeting it silently never
 *     applies; an attribute on the same element has no such rule.
 *
 * HYSTERESIS is deliberate. A sheet dragged through square would otherwise flip
 * layout every frame; tall latches at 1.05 and releases at 0.95, so the
 * changeover happens once and stays put.
 */
window.SheetShape = (function () {
  const TALL_ON = 1.05, TALL_OFF = 0.95;

  /* THE SECOND ANSWER: is the LIST/DETAIL pair on?
   * `.pane-pair` (css/components.css) is the shared list-detail layout, and the
   * only thing the three screens using it disagree about is the width at which
   * it turns on — 400px for the garage, 620px for select and career. A container
   * query cannot take a custom property in its condition, so expressing that in
   * CSS alone means duplicating the whole block per threshold, which is the
   * duplication the primitive exists to remove. The sheet declares `--pair-at`
   * and this reads it.
   * Hysteresis again, and for a sharper reason than the shape: a sheet sitting
   * exactly on its threshold would otherwise toggle between one and two columns
   * on every observer callback. */
  const PAIR_HYST = 8, RAIL_HYST = 12, WIDE_HYST = 16;

  function classifyFlag(el, w, cssVar, attr, hyst, onVal, offVal) {
    onVal = onVal || "on";
    offVal = offVal || "off";
    const raw = getComputedStyle(el).getPropertyValue(cssVar);
    const at = parseFloat(raw);
    if (!at) { if (el.dataset[attr]) delete el.dataset[attr]; return; }
    const was = el.dataset[attr] === onVal;
    const now = was ? w >= at - hyst : w >= at;
    const next = now ? onVal : offVal;
    if (el.dataset[attr] !== next) el.dataset[attr] = next;
  }

  function classifyPair(el, w) {
    /* Compact list/detail sheets stack even when clientWidth is still above
       --pair-at (a landscape phone at a raised UI SIZE). `--pair-compact: off`
       on `.pane-pair` is that answer; empty/on keeps reading --pair-at.
       `wide` is SELECT's answer: a short HORIZONTAL sheet still has a right
       column to give the catalogue — stacking it wasted that half. A tall
       compact sheet still stacks. */
    const mode = getComputedStyle(el).getPropertyValue("--pair-compact").trim();
    if (el.dataset.density === "compact" && mode === "off") {
      if (el.dataset.pair !== "off") el.dataset.pair = "off";
      return;
    }
    if (el.dataset.density === "compact" && mode === "wide") {
      const next = el.dataset.shape === "tall" ? "off" : "on";
      if (el.dataset.pair !== next) el.dataset.pair = next;
      return;
    }
    classifyFlag(el, w, "--pair-at", "pair", PAIR_HYST);
  }
  /* Tuners: viewport media cannot see zoom. 734 physical px at UI SIZE 200%
   * is ~257 local px — too narrow for a 210px rail plus slider values.
   * Compact rail also needs three visible slider rows (redesign contract);
   * otherwise keep the horizontal chip strip. */
  function classifyRail(el, w, h) {
    const raw = getComputedStyle(el).getPropertyValue("--rail-at");
    const at = parseFloat(raw);
    if (!at) { if (el.dataset.rail) delete el.dataset.rail; return; }
    const was = el.dataset.rail === "on";
    let now = was ? w >= at - RAIL_HYST : w >= at;
    if ((el.id === "lighting-inner" || el.id === "camtune-inner")
        && el.dataset.density === "compact") {
      const row = el.querySelector(".adv-item");
      const rowH = (row && row.offsetHeight) || 42;
      const foot = el.querySelector(":scope > .sheet-foot");
      const footH = foot ? foot.offsetHeight : 0;
      const rowsAvail = (h - footH) / Math.max(24, rowH);
      now = now && (was ? rowsAvail >= 2.5 : rowsAvail >= 3);
    }
    const next = now ? "on" : "off";
    if (el.dataset.rail !== next) el.dataset.rail = next;
  }

  /* THE THIRD ANSWER: is the sheet SHORT — and short in the units its own CSS
   * is written in, which is not the same question as "is the viewport short".
   * `.sheet` carries `zoom: var(--ui-scale)`, so at UI SIZE 150% a 462px-tall
   * viewport gives the layout a 297px sheet while a media query still reads 462.
   * The same physical squeeze needs a different `max-height` at every scale,
   * which is why no @media can express it — and `container: sheet / inline-size`
   * cannot either, since an inline-size container is blind to height.
   *
   * MEASURED, garage at 1000x462, the head+foot share of the sheet: 46% at UI
   * SIZE 100%, 59% at 130%, 68% at 150% — the extra size went to padding and
   * chrome, so raising UI SIZE to read better left ONE option row on screen.
   * Dividing the measured height by the element's own zoom is what makes this
   * answerable at all; getBoundingClientRect is in visual px, the CSS is not.
   *
   * The threshold is per-sheet, declared as `--compact-at` exactly like
   * `--pair-at` above and for the same reason: screens disagree only about the
   * NUMBER. A generic sheet is short under 380px of its own height; the lighting
   * tuner is short under 620, because its head carries twelve tab chips and a
   * preview row before a single slider appears. MEASURED on a 393x659 phone at
   * UI SIZE 115%: the tuner's own height is 557px, its `@media (max-height:
   * 620px)` compact head read 659 and never fired, and the RESET/COPY/DONE bar
   * sat at y=842 — below a 659px viewport, reachable only by scrolling the whole
   * panel past 178 sliders, which is the exact failure that file's header says
   * the fixed footer fixed. */
  const SHORT_DEFAULT = 380, SHORT_HYST = 40;   // hysteresis, same reason as the others

  /* THE FOURTH ANSWER: can this sheet afford the requested UI zoom and still
   * have a functional content row? Most sheets can simply scroll, but dense
   * list/detail panels have fixed head + foot chrome around that scroller. On a
   * 343px landscape viewport, 200% left the Garage with a 9px option pane and
   * How-to-Play with 30px of reading pane: bigger type had made both LESS
   * accessible.
   *
   * Opt-in with --fit-at, the minimum height the component needs in its own CSS
   * units. The cap is derived from the host screen's SAFE content box, so it
   * reacts to orientation, browser chrome and injected notch insets without a
   * device name or scale-specific media query. It never enlarges a preference;
   * it only writes --sheet-scale when the requested scale cannot fit. */
  function classifyFit(el) {
    const cs = getComputedStyle(el);
    const at = parseFloat(cs.getPropertyValue("--fit-at"));
    if (!at) {
      if (el.style.getPropertyValue("--sheet-scale")) el.style.removeProperty("--sheet-scale");
      if (el.parentElement && el.parentElement.style.getPropertyValue("--sheet-eff-scale")) {
        el.parentElement.style.removeProperty("--sheet-eff-scale");
      }
      if (el.dataset.fit) delete el.dataset.fit;
      return;
    }
    const host = el.parentElement;
    if (!host) return;
    const hs = getComputedStyle(host);
    const available = host.clientHeight
      - (parseFloat(hs.paddingTop) || 0) - (parseFloat(hs.paddingBottom) || 0);
    if (!available) return;
    const desired = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue("--ui-scale")) || 1;
    const fitted = Math.max(0.4, Math.min(desired, available / at));
    const capped = fitted < desired - 0.001;
    const next = capped ? String(Math.round(fitted * 1000) / 1000) : "";
    if (el.style.getPropertyValue("--sheet-scale") !== next) {
      if (next) el.style.setProperty("--sheet-scale", next);
      else el.style.removeProperty("--sheet-scale");
      /* Mirror the EFFECTIVE scale onto the host. --sheet-scale lands inline
         on the sheet, so a sibling OUTSIDE it (the garage's #cs-stack camera
         bar) cannot read it — yet that sibling reserves space using the
         sheet's painted width. Reserving with --ui-scale while the sheet
         paints capped reserved 460x2=920px of an 852px viewport and parked
         CAMERA/ACTIVE AERO off the left edge (2026-08-21 sweep, garage
         @150/@200 landscape). Consumers read
         var(--sheet-eff-scale, var(--ui-scale)) — absent means uncapped. */
      if (next) host.style.setProperty("--sheet-eff-scale", next);
      else host.style.removeProperty("--sheet-eff-scale");
    }
    const state = capped ? "on" : "off";
    if (el.dataset.fit !== state) el.dataset.fit = state;
  }

  function classifyDensity(el, hOwn) {
    const raw = getComputedStyle(el).getPropertyValue("--compact-at");
    const at = parseFloat(raw) || SHORT_DEFAULT;
    const was = el.dataset.density === "compact";
    const now = was ? hOwn < at + SHORT_HYST : hOwn < at;
    const next = now ? "compact" : "normal";
    if (el.dataset.density !== next) el.dataset.density = next;
    if (next === "compact" && el.classList.contains("lt-show-help")) {
      el.classList.remove("lt-show-help");
      const help = el.querySelector("#lt-help-on, #ct-help-on");
      if (help) help.checked = false;
    }
  }

  function classify(el, w, h) {
    if (!w || !h) return; // display:none — keep the last answer rather than guess
    classifyFit(el);
    const ratio = h / w;
    const was = el.dataset.shape;
    const now = was === "tall" ? (ratio <= TALL_OFF ? "wide" : "tall")
      : (ratio >= TALL_ON ? "tall" : "wide");
    if (now !== was) el.dataset.shape = now;
    /* BOTH THRESHOLDS ARE IN THE SHEET'S OWN UNITS. Prefer clientWidth/Height
       (always local) over gBCR÷zoom — on pre-26.4 WebKit gBCR was already local,
       so dividing by currentCSSZoom understated the box and delayed data-pair.
       CssZoom.localBox is the shared answer; fall back to the passed rect when
       the element is display:none (client box is 0). */
    const box = (window.CssZoom && CssZoom.localBox(el)) || { w: 0, h: 0 };
    const wOwn = box.w || w;
    const hOwn = box.h || h;
    /* DENSITY BEFORE PAIR. `--pair-compact: off` (and the old per-sheet
       `--pair-at: 2000px` raise) is a function of `data-density`, so the pair
       answer must be read AFTER density is written — otherwise the first paint
       of a short sheet keeps the wide threshold, stays `pair=on`, and clips
       the stacked content the compact rule was meant to make scrollable.
       MEASURED 852×393 @115%: career guides sat ~39px past the sheet until
       this order flipped. */
    classifyDensity(el, hOwn);
    classifyRail(el, wOwn, hOwn);
    classifyPair(el, wOwn);
  }

  let ro = null;
  const seen = new Set();

  function observe(el) {
    if (!el || seen.has(el)) return;
    seen.add(el);
    const r = el.getBoundingClientRect();
    classify(el, r.width, r.height);
    if (ro) ro.observe(el);
  }

  /* Sheets are static markup, but they live inside screens that are hidden at
     boot — a hidden element measures 0x0, so the first useful measurement is the
     ResizeObserver callback when its screen is shown, not this scan. */
  /* .fit-managed: a card that wants classifyFit without being a .sheet — the
     data hub's .dh-card has its own grid and its zoom lives in @layer overlays
     where the .sheet zoom rule can never reach it, so joining the class would
     break its layout while joining the SCAN costs nothing. Such a card must
     read var(--sheet-scale, --ui-scale) in its own zoom rule and declare
     --fit-at, exactly like a sheet. */
  const MANAGED = ".sheet, .fit-managed";
  function scan(root) {
    (root || document).querySelectorAll(MANAGED).forEach(observe);
  }

  /* A SCREEN BECOMING VISIBLE MUST BE MEASURED IN THE SAME TICK.
     A ResizeObserver fires on the NEXT frame, so between a screen being shown
     and that callback the sheet carries no `data-shape`/`data-pair` and the CSS
     falls back to the stacked layout. Visually that is a valid layout — it was
     made valid on purpose — but it is not the SAME layout, and the difference is
     observable: stacked vs pair is columns vs a preview band, but `#sel-tracks`
     is the list scroller in both. js/game/menunav.js redirects a trackpad
     gesture to the nearest pane, so for that one frame the wheel scrolled the
     wrong element, and three menu-keyboard specs caught it.
     Screens are toggled by their `hidden` attribute, so watching that and
     classifying immediately closes the gap with no polling and no new contract
     for the code that opens a screen. */
  function watchVisibility() {
    if (typeof MutationObserver !== "function") return;
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.attributeName !== "hidden" || m.target.hidden) continue;
        m.target.querySelectorAll(MANAGED).forEach((el) => {
          const r = el.getBoundingClientRect();
          classify(el, r.width, r.height);
        });
      }
    }).observe(document.documentElement,
      { attributes: true, attributeFilter: ["hidden"], subtree: true });
  }

  /* UI SIZE MUST RE-MEASURE, AND THE ResizeObserver WILL NOT DO IT.
     `--ui-scale` is an inline style on documentElement (game.js applyScale) that
     lands as `zoom` on every .sheet. That changes the units the sheet's CSS is
     written in without moving its visual box, and the observer above did not
     fire for it — measured: at 1000x462 the garage sat on data-density="normal"
     at UI SIZE 150% while its own height was 297px, well inside the compact
     tier. Watch where the property is written instead. Cheap: documentElement's
     own style attribute changes about as often as a settings slider moves.

     STATUS, measured 2026-08-08 by stubbing this observer out: the garage no
     longer needs it. `--cs-sheet-w` is now derived from `--ui-scale`, so a scale
     change really does resize the sheet and the ResizeObserver above fires by
     itself — tests/specs/ui-resize.spec.js stays green without this. Kept
     because it is the GENERAL answer and that derivation is a property of one
     stylesheet: any sheet whose box does not happen to depend on the scale would
     go stale again, silently, exactly as the garage did. Belt-and-braces, and
     labelled as such rather than left looking load-bearing. */
  /* THE SAME ANSWER FOR THE SCREENS THAT ARE NOT SHEETS.
   * `#overlay` is one of two screens outside `.sheet`, and the zoom sits on its
   * CHILDREN (`#overlay > *`, css/menus.css) rather than on itself — so it has
   * no `currentCSSZoom` of its own to divide by, and the per-element route above
   * cannot answer for it. The question is still the same one though: how much
   * height is there, measured in the units its contents are laid out in.
   *
   * That is a document-level fact — every zoomed child shares one --ui-scale —
   * so it resolves once onto body, and CSS reads it as
   * `body[data-density="compact"]`. It is NOT the same number as any one sheet's
   * answer and must not be confused with it: a sheet asks about its own box,
   * this asks about the viewport.
   *
   * Why it matters for #overlay specifically: those rules choose between one and
   * two grid columns. At UI SIZE 150% the children are half again as large while
   * the box they sit in is not, so the height at which two columns stop fitting
   * moves — and `@media (max-height: 599px)` cannot see that it moved. */
  function classifyBody() {
    const b = document.body;
    if (!b) return;
    const scale = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
    const wOwn = window.innerWidth / scale;
    const hOwn = window.innerHeight / scale;
    classifyDensity(b, hOwn);
    classifyFlag(b, wOwn, "--wide-at", "width", WIDE_HYST, "wide", "narrow");
    /* ZOOM-CORRECT BODY ORIENTATION. `@media (orientation: portrait)` reads the
       viewport in CSS px, which is the same coordinate space as innerWidth/Height
       before dividing by --ui-scale. At non-100% zoom the scaled dimensions
       disagree with the raw ones: a 393×852 phone at 150% UI SIZE gives the
       layout 262×568 own units, still portrait-shaped, but a 568×320 landscape
       screen at 200% gives 284×160 — still landscape-shaped. The ratio alone is
       what decides portrait vs landscape, so zoom never distorts the ANSWER, only
       the numbers that produce it. This attribute therefore agrees with the media
       query in practice, but is written on body as data-shape so CSS can combine
       it with data-density in a single selector without a media query. */
    const ratio = hOwn / wOwn;
    const wasShape = b.dataset.shape;
    const nowShape = wasShape === "tall" ? (ratio <= TALL_OFF ? "wide" : "tall")
      : (ratio >= TALL_ON ? "tall" : "wide");
    if (nowShape !== wasShape) b.dataset.shape = nowShape;
  }

  function reclassify() {
    seen.forEach((el) => {
      const r = el.getBoundingClientRect();
      classify(el, r.width, r.height);
    });
    classifyBody();
  }

  /* THE OBSERVER WATCHES ONE ATTRIBUTE THAT FOUR THINGS WRITE. Its trigger is
     --ui-scale, but --hud-scale and the HUD's own --hud-z-top/--hud-z-bot zoom
     caps land on the SAME inline style attribute on documentElement
     (js/game/hud.js's fitHud), and a MutationObserver cannot tell one custom
     property from another. So every HUD zoom-cap adjustment ran a full
     reclassify() — a getBoundingClientRect on all 21 .sheet elements, each
     followed by CssZoom.localBox and two getComputedStyle calls, plus
     classifyBody()'s own — for menus that are all hidden, MID-RACE. fitHud is
     throttled (updateHud ~10 Hz, then _fitWait = 5) so it is bounded at ~2 Hz,
     but capTop tracks the gap-readout width and changes continuously on a
     constrained viewport or a high HUD SIZE, which is exactly when the frame
     budget is tightest.
     Comparing the INLINE value is the right test and is free: the attributeFilter
     means only an inline write can fire this, so if the inline --ui-scale is
     unchanged the computed one is too. No layout is read to decide. Outcome is
     unchanged for a real --ui-scale change, and the ResizeObserver below still
     covers any box that genuinely moved. */
  function watchScale() {
    if (typeof MutationObserver !== "function") return;
    let lastScale = document.documentElement.style.getPropertyValue("--ui-scale");
    new MutationObserver(() => {
      const s = document.documentElement.style.getPropertyValue("--ui-scale");
      if (s === lastScale) return;
      lastScale = s;
      reclassify();
    }).observe(document.documentElement,
      { attributes: true, attributeFilter: ["style"] });
  }

  /* THE FIFTH ANSWER: how much of the viewport bottom does the software
     keyboard cover? No CSS unit can see it — svh/lvh/dvh all track browser
     chrome, not the keyboard, and on both iOS Safari and Chromium-Android the
     keyboard shrinks only the VISUAL viewport while the layout viewport (and
     .screen's inset: 0) stays put — so a centred sheet's input rows and foot
     sit under the keys. visualViewport is the one API that reports it.

     Writes --kb (occluded band, LAYOUT px) inline on documentElement;
     css/components.css consumes it as .screen padding-bottom. .screen is
     unzoomed (zoom rides .sheet), so no scale division — the same coordinate
     honesty rule as everything else here. Nothing stored => no inline
     property, matching ui-scale.js.

     The guards are load-bearing, do not simplify them out:
       - vv.scale > 1.01: pinch zoom also shrinks vv.height; that is not a
         keyboard and padding the screen for it would be wrong.
       - kb < 15% of innerHeight: URL-bar show/hide and Safari's tab-bar
         collapse arrive as small vv.height deltas; svh already owns those.
         Every real keyboard is far taller than 15% of any phone viewport.
       - "scroll" listener: iOS often PANS the visual viewport (offsetTop
         moves) instead of resizing it when focusing an input near the bottom,
         so resize alone misses the occlusion changing.
       - rAF coalescing: iOS fires resize storms during the keyboard
         animation; one write per frame is plenty. */
  function watchKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    let last = -1, raf = 0;
    const apply = () => {
      raf = 0;
      let kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (vv.scale > 1.01 || kb < window.innerHeight * 0.15) kb = 0;
      kb = Math.round(kb);
      if (kb === last) return;
      last = kb;
      const st = document.documentElement.style;
      if (kb) st.setProperty("--kb", kb + "px");
      else st.removeProperty("--kb");
      // Fit caps read the host's padding, so --fit-at sheets re-derive their
      // --sheet-scale under the keyboard; watchScale() ignores this write
      // (it compares --ui-scale only), hence the direct call.
      reclassify();
      /* Then bring the field back. iOS pans the visual viewport to reveal
         the focused input BEFORE --kb lands; the padding above then shrinks
         and re-centres the sheet UNDER that pan, so the browser's own remedy
         goes stale and the field can end up behind the foot. block:"nearest"
         is a no-op when it is already visible, so the common case is free.
         (scroll-padding on the pane would double-count: the pane is already
         shortened by --kb, and scroll-padding is inert without a
         scroll-into-view anyway — this call IS the missing half.) */
      const ae = document.activeElement;
      if (kb && ae && ae.matches && ae.matches("input,textarea,[contenteditable]")) {
        ae.scrollIntoView({ block: "nearest" });
      }
    };
    const onvv = () => { if (!raf) raf = requestAnimationFrame(apply); };
    vv.addEventListener("resize", onvv, { passive: true });
    vv.addEventListener("scroll", onvv, { passive: true });
  }

  function init() {
    Log.info("ui", "SheetShape.init");
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const r = e.target.getBoundingClientRect();
          classify(e.target, r.width, r.height);
        }
      });
    }
    scan();
    classifyBody();
    /* `reclassify()`, NOT `classifyBody()` alone. body's own box does not
       change when the viewport does (it is the viewport), so the
       ResizeObserver above never fires for it; that half of this listener was
       always right. But it left every INDIVIDUAL SHEET's
       data-shape/data-pair/data-density resting on the ResizeObserver alone,
       with no second path if that observer's delivery is ever delayed.

       Belt-and-braces, not a proven fix for a specific incident — said plainly
       so nobody cites this as more than it is. Chasing a slow reclassification
       in tests/specs/ui-resize.spec.js (data-shape lagging the resized box by
       seconds) traced to the render loop's own per-frame cost under SwiftShader
       starving the main thread generally — timers and DOM events alike, not
       ResizeObserver specifically — so switching this ONE listener to
       `reclassify` did not close that gap; the real fix was stopping the render
       loop during the test (see that file). What stays true regardless: a plain
       `resize` event is a second, independent delivery path for the same
       question, costs nothing on an event that fires rarely, and is the same
       argument watchScale() already makes two functions up for the same class
       of gap. Kept for that reason, not for the incident that prompted it. */
    addEventListener("resize", reclassify, { passive: true });
    addEventListener("orientationchange", reclassify, { passive: true });
    watchVisibility();
    watchScale();
    watchKeyboard();
    // A screen that builds its sheet later (the data hub) still gets measured.
    if (typeof MutationObserver === "function") {
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList && (n.classList.contains("sheet") || n.classList.contains("fit-managed"))) observe(n);
          if (n.querySelectorAll) scan(n);
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  /* BODY DENSITY IS RESOLVED AT EVAL TIME, NOT ON DOMContentLoaded.
     `body[data-density]` chooses between the title screen's ONE-column and
     TWO-column grids (css/menus.css, css/responsive.css). Waiting for
     DOMContentLoaded means waiting for all ~146 synchronous scripts, so the
     menu's first paint was laid out in the wrong shape and relaid out later.
     Nothing here needs that wait: every script tag sits AFTER the whole body
     markup, so document.body and the stylesheets are already present when this
     file evaluates. classifyBody() guards a missing body itself, so this stays
     correct if the tag ever moves into <head>, and init() calling it again is
     idempotent (the hysteresis reads the value it just wrote).

     THIS IS THE SECOND ANSWER, NOT THE FIRST ONE. The first paint's density is
     set by a tiny inline script in index.html, because ANY external script —
     including this file at position #4 of the wall — races the browser's first
     paint and does not reliably win it. Measured on a quiet box, same build,
     two consecutive cold loads: frame 1 already `compact` (CLS 0.0824) versus
     frames 1-2 painted at one 828px column before this file ran at t=227ms
     (CLS 0.5929). The inline script cannot lose that race; this call is what
     keeps the answer correct if the shell's copy is ever removed, and it costs
     one getComputedStyle. Both are idempotent, so running twice is free.

     Do not "simplify" by deleting either one: the inline script alone would
     drift from this file's thresholds, and this file alone reintroduces the
     race. Baseline for the numbers above was CLS 0.5241; after the inline
     script, two runs scored 0.0602 and 0.0824 ("good" is under 0.1).

     A non-default UI SIZE is still corrected later by watchScale(), because
     --ui-scale is not applied until game.js restores it. */
  classifyBody();
  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { scan, observe, reclassify, shapeOf: (el) => (el && el.dataset.shape) || null };
})();
