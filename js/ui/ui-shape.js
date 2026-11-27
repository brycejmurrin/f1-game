"use strict";
/* UI SHAPE — the one home of the phone / screen-shape answers (#7259, decision 7234-P3 B).
   Each member returns exactly what its caller computed inline before: no behaviour change. A new layout reads
   UiShape rather than writing its own touch / <=500 px / orientation check. Option A (one unified rule) can
   fold these rows together later, one at a time. Loads before scale.js, sheet-shape.js, hud-layout.js and
   screen-placement.js (tools/manifest.cjs). */
window.UiShape = (function () {
  function media(query) {
    try { return window.matchMedia?.(query); } catch (_) { return null; }
  }
  // The viewport's short side, read ONCE and held until the window resizes (#6487): innerWidth/innerHeight
  // after a DOM write force a whole-document style recalc. Capture listeners run before every other resize handler.
  let short = null, cached = false;
  try {
    const drop = () => { short = null; };
    const on = (t, n) => t?.addEventListener?.(n, drop, { capture: true, passive: true });
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      on(window, "resize"); on(window, "orientationchange"); on(window.visualViewport, "resize");
      cached = true;
    }
  } catch (_) { /* no events: read fresh every time */ }
  function shortSide() {
    if (short !== null) return short;
    const s = Math.min(window.innerWidth, window.innerHeight);
    if (cached) short = s;
    return s;
  }
  const coarse = media("(pointer: coarse)");
  /** Touch AND a short side <= 500: the one phone test (UiScale.phone, phoneUi, HudElements, ScreenLooks, TitleLayout). */
  function phone() {
    try { return !!media("(pointer: coarse)")?.matches && shortSide() <= 500; } catch (_) { return false; }
  }
  /** Touch pointer alone (UiScale's coarseUi). */
  const coarsePointer = () => !!coarse?.matches;
  /** Touch AND short side <= 500, read through the one matchMedia list captured at load (UiScale's phoneUi). */
  const phoneUi = () => coarsePointer() && shortSide() <= 500;
  /** A portrait phone: taller than wide and <= 500 px wide (HudLayout; css/hud.css's portrait + max-width: 500px). */
  const portraitNarrow = () => typeof window !== "undefined" && window.innerHeight > window.innerWidth && window.innerWidth <= 500;
  const orientationMedia = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(orientation: portrait)") : null;
  /** "portrait" | "landscape" from the media query (ScreenPlacement). */
  const orientation = () => orientationMedia && orientationMedia.matches ? "portrait" : "landscape";
  /** body[data-shape] with hysteresis: was = current value; ratio = own height / own width; on/off = latch ratios (SheetShape). */
  const sheetShape = (was, ratio, on, off) => was === "tall" ? (ratio <= off ? "wide" : "tall") : (ratio >= on ? "tall" : "wide");
  return { shortSide, phone, phoneUi, coarsePointer, portraitNarrow, orientation, orientationMedia, sheetShape };
})();
