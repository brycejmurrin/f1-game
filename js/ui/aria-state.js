"use strict";
// AriaState — mirror the visual "selected" class of every option group onto the
// aria-pressed state a screen reader can actually hear.
//
// WHY THIS EXISTS. A DOM audit of all 17 menu screens found 24 buttons whose
// only signal of being chosen was a CSS class: the LAPS / WEATHER / TIME OF DAY
// / DIFFICULTY chips, the car-setup category tabs and part options, the MUSIC &
// SOUND toggles, the steering presets, the data-hub season and sort pills, and
// the seven NONE buttons on MY TEAM. Sighted players see a red ring. Everyone
// else hears "button, NORMAL" — identical whether it is the current difficulty
// or not. (The team tiles were the one group already doing this properly, with
// role=option + aria-selected; that is the pattern this generalises.)
//
// WHY AN OBSERVER RATHER THAN 15 CALL SITES. Those classes are toggled from
// nine different files and half the groups are built at runtime (car-setup
// options, data-hub pills, driver chips), so per-site edits would both scatter
// the rule and miss the dynamic ones the moment a new group is added. Watching
// the class attribute keeps the ARIA correct by construction: whatever paints
// the ring announces the ring.
//
// SCOPE IS DELIBERATE. Menu overlays only — never #hud. The HUD rewrites
// classes on a live element every frame, and a subtree observer over it would
// be a per-frame cost for a surface that has no option groups at all.
//
// CHOICE WORDS. The same walk wraps ON/OFF and a trailing LABEL: VALUE
// (STYLE: STANDARD, LAYOUT: AUTO, STEER: TILT, RESOLUTION: HIGH, …) so CSS
// can paint gold / red. One observer, not a call site in every painter.
// Option-group chips (5 LAPS, DRY) and prose labels stay unpainted.
//
// The module owns no game state and self-initialises.
window.AriaState = (function () {
  const ON = ["active", "dh-active"];
  // Roots to watch: everything that is a menu, plus the two DOM-built overlays.
  const ROOTS = "#overlay,#select,#career,#career-offers,#career-history,#career-guide,#teampicker,#carsetup,#howtoplay,#advanced," +
    "#pmsettings,#pausemenu,#lighting,#camtune,#audioset,#results,#quali,#standings," +
    // #spotifypanel's SHUFFLE/REPEAT are the same `.active`-class opt-row shape as
    // the Spotify mode toggles inside #audioset, which ARE synced — one widget
    // family must not announce its state in one panel and go silent in the other.
    // #vsfriend / #season-setup are already in UiLayers; they were the two
    // DOM-built overlays this observer had never heard of.
    "#race-settings,#customize,#datahub,#track-detail,#spotifypanel,#vsfriend,#season-setup";

  const isOn = (el) => ON.some((c) => el.classList.contains(c));
  // Groups whose semantics are already stated explicitly are left alone: a
  // listbox option or a tab must NOT also claim to be a toggle button.
  const claimed = (el) =>
    el.hasAttribute("aria-selected") || el.hasAttribute("aria-checked") ||
    el.hasAttribute("aria-pressed") ||
    el.hasAttribute("data-aria-toggle") ||
    el.hasAttribute("data-aria-action") ||
    el.getAttribute("role") === "option" || el.getAttribute("role") === "tab";

  const labelled = new WeakSet();

  /* Label every button in `parent` — but only once one of them has actually
     been selected. Without that guard a plain stack of actions (RESUME,
     RESTART, QUIT) would be announced as three unpressed toggles, which is
     worse than saying nothing: none of them has an on/off state to report. */
  function syncGroup(parent) {
    if (!parent) return;
    const btns = [];
    let anyOn = false, known = false;
    for (const c of parent.children) {
      if (c.tagName !== "BUTTON" || claimed(c)) continue;
      btns.push(c);
      if (isOn(c)) anyOn = true;
      if (labelled.has(c)) known = true;
    }
    if (!btns.length || (!anyOn && !known)) return;
    for (const b of btns) {
      labelled.add(b);
      b.setAttribute("aria-pressed", isOn(b) ? "true" : "false");
    }
  }

  function syncRoot(root) {
    if (!root) return;
    // One pass per PARENT, not per button: the group is the unit of meaning.
    const seen = new Set();
    for (const b of root.querySelectorAll("button")) {
      const p = b.parentElement;
      if (!p || seen.has(p)) continue;
      seen.add(p);
      syncGroup(p);
    }
  }

  function wrapOnOff(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return null;
    if (/\b(ON|OFF)\b/.test(t)) {
      return t.replace(/\b(ON|OFF)\b/g, (w) =>
        '<span data-fold="' + w.toLowerCase() + '">' + w + "</span>");
    }
    // Current choice after a label: STYLE: STANDARD, STEER: TILT (NO GYRO).
    // All-caps values only — "BUDGET: 12 cr remaining" and sentences stay put.
    const m = /^(.+?: )([A-Z0-9][A-Z0-9 ./%()+\-–—×]*)$/.exec(t);
    return m ? (m[1] + '<span data-fold="val">' + m[2] + "</span>") : null;
  }

  function paintOnOff(root) {
    if (!root) return;
    for (const el of root.querySelectorAll("button, summary")) {
      if (el.closest("#hud, #game-metrics")) continue;
      let foreign = false;
      for (const c of el.children) {
        if (!c.hasAttribute("data-fold")) { foreign = true; break; }
      }
      if (foreign) continue;
      if (el.querySelector("[data-fold]")) continue;
      const html = wrapOnOff(el.textContent);
      if (html) el.innerHTML = html;
    }
  }

  function syncAll() {
    for (const r of document.querySelectorAll(ROOTS)) {
      syncRoot(r);
      paintOnOff(r);
    }
  }

  // Coalesce: a rebuilt list fires one mutation per row, and the answer for the
  // whole batch is the same single pass.
  //
  // setTimeout, NOT requestAnimationFrame. rAF is dropped when the page is not
  // compositing — the same hazard js/ui/select-screen.js documents for
  // startViewTransition — and because the flag is only cleared inside the
  // callback, one dropped frame LATCHED this module off permanently: every
  // later mutation saw `pending` still set and returned. That is exactly how it
  // behaved, syncing the data hub and never the car-setup tabs. Nothing here is
  // visual, so there is no reason to wait for a frame in the first place. */
  let pending = 0;
  const schedule = () => {
    if (pending) return;
    pending = setTimeout(() => { pending = 0; syncAll(); }, 0);
  };

  function init() {
    Log.info("game", "AriaState.init");
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "childList" || r.type === "attributes" || r.type === "characterData") {
          schedule(); return;
        }
      }
    });
    for (const r of document.querySelectorAll(ROOTS)) {
      obs.observe(r, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ["class"],
      });
    }
    syncAll();
  }

  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  return { sync: syncAll, wrapOnOff };
})();
