/* Apex 26 — Dom: the DOM/format helpers every DOM-built screen shares
   (el / paintFold / fmtLap / fmtRaceClock / fmtGap / isDesktop). Pure functions over `document` — no game state,
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
  // callers' constants; < > " escaped too: TILT carries a stored value (#5900).
  const foldHtml = new WeakMap();
  const esc = (v) => String(v).replace(/[<>"]/g, (c) => "&#" + c.charCodeAt(0) + ";");
  function paintFold(target, bits) {
    if (!target) return;
    const html = bits.map((p, i) =>
      `${i ? '<span data-fold="sep"> · </span>' : ""}<span data-fold="${esc(p[0])}">${esc(p[1])}</span>`).join("");
    const last = foldHtml.get(target);
    // innerHTML serializes entities, so remember the rendered spelling too.
    // Read it back before skipping: another owner may have changed the fold.
    if (last && last.html === html && target.innerHTML === last.rendered) return;
    target.innerHTML = html;
    foldHtml.set(target, { html, rendered: target.innerHTML });
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

  // A timing-sheet gap: +1.234; a string ("+1 LAP") passes through, <= 0 is the
  // leader ("—"), a non-number null. HUD form: HudReadouts.fmtGap.
  const fmtGap = (v) => typeof v === "string" ? v : typeof v !== "number" || !isFinite(v) ? null : v > 0 ? "+" + v.toFixed(3) : "—";

  // The desktop tier: body.desktop, the one class every HUD and settings branch keys on.
  // `d` defaults to the page document (a module that was handed its own document passes it).
  // Null-guarded: no document, no body or no classList reads as not desktop.
  function isDesktop(d) {
    const doc = d || (typeof document !== "undefined" ? document : null);
    const b = doc && doc.body;
    return !!(b && b.classList && b.classList.contains("desktop"));
  }

  return { el, paintFold, fmtLap, fmtRaceClock, fmtGap, isDesktop };
})();
Object.freeze(Dom);
