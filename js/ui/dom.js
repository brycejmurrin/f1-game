/* Apex 26 — Dom: the three DOM/format helpers every DOM-built screen shares
   (el / paintFold / fmtLap). Pure functions over `document` — no game state,
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
    const m = Math.floor(t / 60);
    const r = t - m * 60;
    const secs = `${r < 10 ? "0" : ""}${r.toFixed(3)}`;
    return m ? `${m}:${secs}` : r.toFixed(3);
  }

  return { el, paintFold, fmtLap };
})();
Object.freeze(Dom);
