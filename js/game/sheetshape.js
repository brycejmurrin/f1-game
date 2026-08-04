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

  function classify(el, w, h) {
    if (!w || !h) return; // display:none — keep the last answer rather than guess
    const ratio = h / w;
    const was = el.dataset.shape;
    const now = was === "tall" ? (ratio <= TALL_OFF ? "wide" : "tall")
      : (ratio >= TALL_ON ? "tall" : "wide");
    if (now !== was) el.dataset.shape = now;
    classifyPair(el, w);
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

  return { scan, observe, shapeOf: (el) => (el && el.dataset.shape) || null };
})();
