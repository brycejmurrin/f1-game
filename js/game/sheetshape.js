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
  const PAIR_HYST = 8;

  function classifyPair(el, w) {
    const raw = getComputedStyle(el).getPropertyValue("--pair-at");
    const at = parseFloat(raw);
    if (!at) { if (el.dataset.pair) delete el.dataset.pair; return; }
    const was = el.dataset.pair === "on";
    const now = was ? w >= at - PAIR_HYST : w >= at;
    const next = now ? "on" : "off";
    if (el.dataset.pair !== next) el.dataset.pair = next;
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

  function classifyDensity(el, hOwn) {
    const raw = getComputedStyle(el).getPropertyValue("--compact-at");
    const at = parseFloat(raw) || SHORT_DEFAULT;
    const was = el.dataset.density === "compact";
    const now = was ? hOwn < at + SHORT_HYST : hOwn < at;
    const next = now ? "compact" : "normal";
    if (el.dataset.density !== next) el.dataset.density = next;
  }

  function classify(el, w, h) {
    if (!w || !h) return; // display:none — keep the last answer rather than guess
    const ratio = h / w;
    const was = el.dataset.shape;
    const now = was === "tall" ? (ratio <= TALL_OFF ? "wide" : "tall")
      : (ratio >= TALL_ON ? "tall" : "wide");
    if (now !== was) el.dataset.shape = now;
    /* BOTH THRESHOLDS ARE IN THE SHEET'S OWN UNITS, because that is the space
       they are declared in and the space every `@container sheet` breakpoint
       beside them evaluates in. `getBoundingClientRect` is in VISUAL px, so
       dividing by the element's own zoom is what makes `--pair-at: 620px` mean
       the same 620 as `@container sheet (max-width: 619px)` two rules below it.
       Comparing the raw rect against `--pair-at` — which is what this did until
       2026-08-12 — puts the two answers a whole zoom factor apart, and they
       drift in OPPOSITE directions as UI SIZE moves: css/components.css already
       states the intent ("at 130% you need 30% more REAL width to afford two
       columns, which is the honest answer") and the container queries have
       always delivered it, while this comparison did not.
       MEASURED, #select on a landscape iPhone at UI SIZE 80%: the sheet is 600
       visual px and 750 of its own, so the container query dropped the circuit
       list's height cap (750 > 619) while `data-pair` kept the STACKED layout
       (600 < 620) — a list with no cap in a layout that assumes one, 1717px of
       rows in a 226px body. Neither branch is wrong on its own; they were
       answering the same question in two different units.
       The ratio above needs no such division: it is h/w, and the zoom cancels. */
    const zoom = el.currentCSSZoom || 1;
    classifyPair(el, w / zoom);
    classifyDensity(el, h / zoom);
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
  function scan(root) {
    (root || document).querySelectorAll(".sheet").forEach(observe);
  }

  /* A SCREEN BECOMING VISIBLE MUST BE MEASURED IN THE SAME TICK.
     A ResizeObserver fires on the NEXT frame, so between a screen being shown
     and that callback the sheet carries no `data-shape`/`data-pair` and the CSS
     falls back to the stacked layout. Visually that is a valid layout — it was
     made valid on purpose — but it is not the SAME layout, and the difference is
     observable: in the fallback `#sel-body` is the scroll region, in the pair
     `#sel-tracks` is. js/game/menunav.js redirects a trackpad gesture to the
     nearest pane, so for that one frame the wheel scrolled the wrong element,
     and three menu-keyboard specs caught it.
     Screens are toggled by their `hidden` attribute, so watching that and
     classifying immediately closes the gap with no polling and no new contract
     for the code that opens a screen. */
  function watchVisibility() {
    if (typeof MutationObserver !== "function") return;
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.attributeName !== "hidden" || m.target.hidden) continue;
        m.target.querySelectorAll(".sheet").forEach((el) => {
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
    classifyDensity(b, window.innerHeight / scale);
  }

  function reclassify() {
    seen.forEach((el) => {
      const r = el.getBoundingClientRect();
      classify(el, r.width, r.height);
    });
    classifyBody();
  }

  function watchScale() {
    if (typeof MutationObserver !== "function") return;
    new MutationObserver(reclassify).observe(document.documentElement,
      { attributes: true, attributeFilter: ["style"] });
  }

  function init() {
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
    // body's own box does not change when the viewport does (it is the
    // viewport), so the ResizeObserver above never fires for it — a plain
    // resize listener is the honest way to hear about it.
    addEventListener("resize", classifyBody, { passive: true });
    addEventListener("orientationchange", classifyBody, { passive: true });
    watchVisibility();
    watchScale();
    // A screen that builds its sheet later (the data hub) still gets measured.
    if (typeof MutationObserver === "function") {
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList && n.classList.contains("sheet")) observe(n);
          if (n.querySelectorAll) scan(n);
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { scan, observe, reclassify, shapeOf: (el) => (el && el.dataset.shape) || null };
})();
