/* Apex 26 — the three DOM/format helpers every DOM-built screen used to carry
   its own copy of. `el` was pasted into js/data/hub.js, js/career/career-ui.js
   and js/career/season-ui.js; `paintFold` into js/audio/panel.js and
   js/input/steer-tuning.js; `fmtLap` into js/data/results.js and
   js/data/telemetry.js with two different "no time" answers (null / "—").
   Pure functions over `document` — no game state, no G. Must load before the
   first consumer (js/audio/panel.js in tools/manifest.cjs). */
const Dom = (function () {
  "use strict";

  // el(tag, cls, text) — createElement with an optional class and text node.
  // `text` is set through textContent (never innerHTML), so any value is safe;
  // null/undefined leave the element empty.
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }

  // paintFold(el, bits) — a closed fold's summary line: `bits` is
  // [[key, label], …]; each pair becomes <span data-fold="key">label</span>,
  // separated by " · ". The labels are the callers' own constants (never user
  // text), which is why this is the one place innerHTML is acceptable.
  function paintFold(target, bits) {
    if (!target) return;
    target.innerHTML = bits.map((p, i) => (i ? '<span data-fold="sep"> · </span>' : "") +
      '<span data-fold="' + p[0] + '">' + p[1] + "</span>").join("");
  }

  // fmtLap(t, empty) — a lap time in seconds as 1:21.163 (58.402 under the
  // minute). Anything that is not a positive finite number — null, a DNF, a
  // string, 0 — returns `empty`, which the caller chooses (results.js wants
  // null so a missing cell stays blank; telemetry.js wants "—").
  function fmtLap(t, empty) {
    if (typeof t !== "number" || !isFinite(t) || t <= 0) return empty === undefined ? null : empty;
    const m = Math.floor(t / 60);
    const r = t - m * 60;
    return m ? m + ":" + (r < 10 ? "0" : "") + r.toFixed(3) : r.toFixed(3);
  }

  return { el, paintFold, fmtLap };
})();
Object.freeze(Dom);
