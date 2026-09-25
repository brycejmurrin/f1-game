"use strict";
// AriaState — mirror the visual "selected" class of every option group onto the
// aria-pressed state a screen reader can actually hear.
//
// A DOM audit found 24 buttons whose only "chosen" signal was a CSS class (the
// LAPS / WEATHER / DIFFICULTY chips, car-setup tabs, sound toggles, steering
// presets, data-hub pills, the MY TEAM NONE buttons): sighted players see a
// red ring, everyone else hears "button, NORMAL" either way. The team tiles
// (role=option + aria-selected) were the one group doing it properly; this
// generalises that.
//
// An OBSERVER rather than 15 call sites: those classes are toggled from nine
// files and half the groups are built at runtime, so per-site edits would miss
// the dynamic ones. Whatever paints the ring announces the ring.
//
// Menu overlays only — never #hud: the HUD rewrites classes on a live element
// every frame, and a subtree observer over it would be a per-frame cost for a
// surface with no option groups.
//
// Colour words are READOUTS, not controls: gold/red is enablement (ON/OFF) on
// a button whose whole text is a status ("♪ SOUND ON") and on the closed fold
// summaries. An `.opt-btn` chip is never painted — its ring is the selection.
// Settings rows are inline-flex, so a wrap after ":" uses NBSP or the space
// collapses.
//
// The module owns no game state and self-initialises.
window.AriaState = (function () {
  const ON = ["active", "on"];
  // Roots to watch: everything that is a menu, plus the two DOM-built overlays.
  const ROOTS = "#overlay,#select,#career,#career-offers,#career-history,#career-guide,#teampicker,#carsetup,#howtoplay," +
    "#pmsettings,#pausemenu,#lighting,#camtune,#flyby,#freecam,#results,#quali,#standings,#duel-picker," +
    // #spotifypanel's SHUFFLE/REPEAT are the same `.active`-class opt-row shape as
    // the Spotify mode toggles on the MUSIC page (#audioset, inside #pmsettings).
    // #vsfriend / #season-setup are already in UiLayers; they were the two
    // DOM-built overlays this observer had never heard of.
    "#race-settings,#customize,#datahub,#track-detail,#spotifypanel,#vsfriend,#season-setup";

  const isOn = (el) => ON.some((c) => el.classList.contains(c));
  // Groups whose semantics are already stated explicitly are left alone: a
  // listbox option or a tab must NOT also claim to be a toggle button.
  const claimed = (el) =>
    el.hasAttribute("aria-selected") || el.hasAttribute("aria-checked") ||
    // The observer itself adds aria-pressed after the first selection. Treat
    // those buttons as ours on later class mutations, or their announced state
    // freezes at the first value forever.
    (el.hasAttribute("aria-pressed") && !labelled.has(el)) ||
    el.hasAttribute("data-aria-toggle") ||
    el.hasAttribute("data-aria-action") ||
    el.getAttribute("role") === "option" || el.getAttribute("role") === "tab";

  const labelled = new WeakSet();

  // Label every button in `parent` — but only once one of them has actually
  // been selected. Without that guard a plain stack of actions (RESUME,
  // RESTART, QUIT) would be announced as three unpressed toggles, which is
  // worse than saying nothing: none of them has an on/off state to report.
  function syncGroup(parent) {
    if (!parent) return;
    const btns = [];
    let anyOn = false;
    let known = false;
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

  // The text is ESCAPED before it is wrapped: paintOnOff writes the result back
  // through innerHTML, and a button's text is not always ours — the garage
  // DRIVER chips print a custom team's driver names, which an imported garage
  // file sets, so `ON <img onerror=…>` was stored XSS (2026-09-24).
  const HTML_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function wrapOnOff(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!/\b(ON|OFF)\b/.test(t)) return null;
    return t.replace(/[&<>"']/g, (c) => HTML_ESC[c]).replace(/\b(ON|OFF)\b/g, (w) => `<span data-fold="${w.toLowerCase()}">${w}</span>`)
      .replace(/:\s+<span/g, ":\u00a0<span")
      .replace(/·\s+<span/g, "·\u00a0<span");
  }

  function paintOnOff(root) {
    if (!root) return;
    for (const el of root.querySelectorAll("button, summary")) {
      if (el.closest("#hud, #game-metrics")) continue;
      if (el.classList.contains("opt-btn")) continue;   // a chip's ring is its mark
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

  function syncHashNav(root) {
    const navs = root.querySelectorAll("#htp-contents, #cg-contents, #ch-contents");
    if (!navs.length) return;
    const hash = typeof location !== "undefined" ? location.hash : "";
    navs.forEach((nav) => {
      nav.querySelectorAll("a").forEach((a) => {
        const href = a.getAttribute("href") || "";
        if (href.charAt(0) === "#" && hash === href) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    });
  }

  // A SLIDER SAYS WHAT ITS READOUT SAYS. Every range here paints its value into
  // a sibling `#<id>-v` ("84%", "PULL 3", "OFF"), but the input's own aria-label
  // outranks the wrapping label, so a screen reader heard the raw step ("11")
  // where the screen showed "84%". Mirrored from the readout — the one place the
  // formatting already lives — whenever it differs from the bare number.
  function syncValueText(root) {
    for (const input of root.querySelectorAll('input[type="range"][id]')) {
      const out = document.getElementById(input.id + "-v");
      const text = out ? out.textContent.trim() : "";
      if (text && text !== String(input.value)) {
        if (input.getAttribute("aria-valuetext") !== text) input.setAttribute("aria-valuetext", text);
      } else if (input.hasAttribute("aria-valuetext")) input.removeAttribute("aria-valuetext");
    }
  }

  function syncAll() {
    for (const r of document.querySelectorAll(ROOTS)) {
      syncRoot(r);
      paintOnOff(r);
      syncHashNav(r);
      syncValueText(r);
    }
  }

  // Coalesce: a rebuilt list fires one mutation per row, and the answer for the
  // whole batch is the same single pass.
  //
  // setTimeout, NOT requestAnimationFrame. rAF is dropped when the page is not
  // compositing (the same hazard js/ui/select-screen.js documents for
  // startViewTransition), and because the flag is only cleared inside the
  // callback one dropped frame LATCHED this module off permanently — it synced
  // the data hub and never the car-setup tabs. Nothing here is visual, so there
  // is no reason to wait for a frame.
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
    window.addEventListener("hashchange", syncAll);
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
