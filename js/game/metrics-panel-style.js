/* Apex 26 — metrics panel layout (safe-area). Loaded before metrics.js.
   Fixed (not under zoom) — raw env insets, same as #pausebtn.
   House height unit is svh, not dvh (toolbar jitter). Bottom = dock + --sab. */
(function () {
  "use strict";
  var HUD_TOP_OFFSET = "min(120px, calc(80px * var(--hud-scale, 1)))";
  window.__METRICS_PANEL_STYLE =
    "position:fixed;" +
    "right:calc(8px + var(--sar, 0px));" +
    "top:calc(12px + var(--tap, 44px) + var(--sat, 0px) + " + HUD_TOP_OFFSET + ");" +
    "z-index:11;margin:0;padding:10px 12px;" +
    "font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
    "color:#d8ffe0;background:rgba(4,8,6,.82);border:1px solid rgba(90,200,120,.4);" +
    "border-radius:8px;pointer-events:none;white-space:pre;text-align:left;" +
    "max-width:min(52ch,calc(100vw - 16px - var(--sal, 0px) - var(--sar, 0px)));" +
    "max-height:calc(100svh - 12px - var(--tap, 44px) - var(--sat, 0px) - " +
      HUD_TOP_OFFSET + " - max(80px, calc(72px + var(--sab, 0px))));" +
    "overflow-y:auto;pointer-events:auto;text-shadow:0 1px 2px rgba(0,0,0,.9);" +
    "letter-spacing:.01em";
})();
