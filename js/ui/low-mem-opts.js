"use strict";
/* Apex 26 — LowMemOpts: GRAPHICS › LOW-MEMORY MODE (experimental, default OFF;
   Bryce 2026-10-21). On the three.js renderer it frees the CPU copies of the
   circuit's geometry once they are on the GPU (gpu-census A/B on monza: JS heap
   225 -> 156 MB on three.js/WebGPU, 175 -> 124 MB on three.js/WebGL2), phones
   included — the configuration that once lost a player's road, which is why it
   is a labelled, off-by-default player opt-in and not a default.

   Key: `apex26.tlxLowMem` — raw lane, "1"/"0", unset = OFF. tlx.js reads it ONCE
   when the renderer is created (_lowMemOptIn), so a change applies from the
   next load; GLX and WGX never read it. */
const LowMemOpts = (function () {
  "use strict";

  const KEY = "apex26.tlxLowMem";
  const store = GameStore.store;
  let on = false;
  try { on = store.raw(KEY) === "1"; } catch (_) { /* private mode: off */ }

  function set(want) {
    on = !!want;
    store.rawSet(KEY, on ? "1" : "0");
    return on;
  }
  const enabled = () => on;

  function initUI() {
    if (typeof SettingRow === "undefined" || !document.getElementById("pm-lowmem")) return;
    SettingRow.wire("pm-lowmem", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (on ? "on" : "off"),
      write: (v) => set(v === "on"),
    });
  }

  // DOMContentLoaded, not "now": a deferred tag that may run before js/ui/setting-row.js.
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI, { once: true });
    else initUI();
  }

  return { KEY, set, enabled, initUI };
})();
Object.freeze(LowMemOpts);
