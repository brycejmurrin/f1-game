/* Apex 26 — Dom: the three DOM/format helpers every DOM-built screen shares
   (el / paintFold / fmtLap / fmtRaceClock). Pure functions over `document` — no game state,
   no G. Loads before its first consumer (js/audio/panel.js in tools/manifest.cjs);
   career-ui and season-ui destructure it at eval. */
const Dom = (function () {
  "use strict";

  // createElement with an optional class and text node. `text` goes through
  // textContent (never innerHTML), so any value is safe; null/undefined leave
  // the element empty.
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }

  // A closed fold's summary line: `bits` is [[key, label], …]; each pair becomes
  // <span data-fold="key">label</span>, separated by " · ". The labels are the
  // callers' own constants (never user text), which is why innerHTML is
  // acceptable here.
  function paintFold(target, bits) {
    if (!target) return;
    target.innerHTML = bits.map((p, i) =>
      `${i ? '<span data-fold="sep"> · </span>' : ""}<span data-fold="${p[0]}">${p[1]}</span>`).join("");
  }

  // A lap time in seconds as 1:21.163 (58.402 under the minute). Anything that
  // is not a positive finite number — null, a DNF, a string, 0 — returns
  // `empty`, which the caller chooses (results.js wants null so a missing cell
  // stays blank; telemetry.js wants "—").
  function fmtLap(t, empty = null) {
    if (typeof t !== "number" || !isFinite(t) || t <= 0) return empty;
    const ms = Math.round(t * 1000), m = Math.floor(ms / 60000);   // round first: never "1:60.000"
    const r = (ms - m * 60000) / 1000;
    const secs = `${r < 10 ? "0" : ""}${r.toFixed(3)}`;
    return m ? `${m}:${secs}` : r.toFixed(3);
  }

  // A RACE-LENGTH clock: 1:32:14.530 past the hour, 59:59.999 under it (no
  // hours field), 0:59.999 under the minute. `digits` decimals (3: timing
  // sheet; 0: a whole-second playhead, which FLOORS — the seek bar must not
  // read the next second early). ROUND FIRST, then split: 3599.9996 split
  // first read "59:60.000". Not a finite number >= 0 → null.
  function fmtRaceClock(t, digits = 3) {
    if (typeof t !== "number" || !isFinite(t) || t < 0) return null;
    const k = Math.pow(10, digits);
    const u = digits ? Math.round(t * k) : Math.floor(t);
    const h = Math.floor(u / (3600 * k)), m = Math.floor((u - h * 3600 * k) / (60 * k));
    const r = (u - h * 3600 * k - m * 60 * k) / k;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (r < 10 ? "0" : "") + r.toFixed(digits);
  }

  return { el, paintFold, fmtLap, fmtRaceClock };
})();
Object.freeze(Dom);
