"use strict";
/* Apex 26 — APEX_SURVEY_HUD survey fixture.
 *
 * Wave-3 UI Survey needs cockpit HUD / touch docks / pause screenshots without
 * surviving a full race start (this box often freezes or hits Graphics
 * unavailable). Enable with ANY of:
 *   ?APEX_SURVEY_HUD=1
 *   #APEX_SURVEY_HUD=1   (also #…&APEX_SURVEY_HUD=1)
 *   localStorage.APEX_SURVEY_HUD === "1"
 *
 * apply() shows #hud + docks + pausebtn, hides menus / #nogl, and never calls
 * startRace / ensureScenery / track warm. Pause is a cheap #pausemenu unhide
 * (TopModal mirrors hidden → showModal). Prefer LoadingScreen.busy when the
 * #1012 plate exists; otherwise stop() any leftover card and show HUD.
 *
 * ctxLost / Graphics unavailable (#1033): treat backendState().ctxLost as dead —
 * do not wait for an in-race HUD. holdChrome() re-asserts survey chrome after
 * showUnavailable (which would otherwise hide #hud and cover with #nogl).
 * After holdChrome chrome is up, call GameHud.invalidateFit when present so
 * survey screenshots get the capped layout (fitHud never ran — no race start).
 */
const SurveyHud = (function () {
  const KEY = "APEX_SURVEY_HUD";

  /** True when query, hash, or localStorage says =1. Pure; hostile input is off. */
  function enabled(loc, storage) {
    try {
      if (loc) {
        const q = typeof URLSearchParams === "function"
          ? new URLSearchParams(loc.search || "").get(KEY) : null;
        if (q === "1") return true;
        const h = String(loc.hash || "");
        if (/(?:^|[?#&])APEX_SURVEY_HUD=1(?:&|$)/.test(h)) return true;
      }
      if (storage && typeof storage.getItem === "function" && storage.getItem(KEY) === "1")
        return true;
    } catch (_) { /* blocked storage / odd location → off */ }
    return false;
  }

  /** Live enabled() against the page's location + localStorage (showUnavailable). */
  function armed() {
    return enabled(
      typeof location !== "undefined" ? location : null,
      typeof localStorage !== "undefined" ? localStorage : null);
  }

  /** Place touch groups into the docks so layout is measurable without Input. */
  function fillDocks($) {
    const left = $("dock-left"), right = $("dock-right");
    if (!left || !right) return;
    const pedals = $("grp-pedals"), taps = $("grp-taps");
    const steer = $("grp-steer"), shifts = $("grp-shifts");
    // Auto-tilt order (same as game.js layoutDocks when !steerBtns && !manual):
    // pedals left, taps right. Steer arrows (◀ ▶) must stay out of the docks —
    // they sit on BRAKE / ERS and read as a replay play glyph (#1034 fixture).
    if (pedals) left.appendChild(pedals);
    if (taps) right.appendChild(taps);
    if (steer) steer.hidden = true;
    if (shifts) shifts.hidden = true;
  }

  /** Keep on-screen steer arrows and WATCH play chrome off the survey HUD. */
  function hidePlayGlyphs($, doc) {
    const sl = ($ && $("btn-steer-left"))
      || (doc && doc.getElementById && doc.getElementById("btn-steer-left"));
    const sr = ($ && $("btn-steer-right"))
      || (doc && doc.getElementById && doc.getElementById("btn-steer-right"));
    const steer = ($ && $("grp-steer"))
      || (doc && doc.getElementById && doc.getElementById("grp-steer"));
    const up = ($ && $("shift-up"))
      || (doc && doc.getElementById && doc.getElementById("shift-up"));
    const dn = ($ && $("shift-down"))
      || (doc && doc.getElementById && doc.getElementById("shift-down"));
    const shifts = ($ && $("grp-shifts"))
      || (doc && doc.getElementById && doc.getElementById("grp-shifts"));
    if (sl) sl.hidden = true;
    if (sr) sr.hidden = true;
    if (steer) steer.hidden = true;
    if (up) up.hidden = true;
    if (dn) dn.hidden = true;
    if (shifts) shifts.hidden = true;
    const wt = doc && doc.querySelector && doc.querySelector(".watch-transport");
    if (wt) wt.hidden = true;
    if (doc && doc.body && doc.body.classList) {
      doc.body.classList.remove("manual", "steer-buttons", "watch-controls-on");
    }
  }

  /** Unhide the touch stack so docks are layoutable on desktop too. */
  function showTouchStub($, body, doc) {
    // Literals only — shell-ids.mjs ratchets non-literal $() as dynamicIdReads.
    const brake = $("btn-brake"), thr = $("btn-throttle"), boost = $("btn-boost");
    const ot = $("btn-ot"), aero = $("btn-aero");
    if (brake) brake.hidden = false;
    if (thr) thr.hidden = false;
    if (boost) boost.hidden = false;
    if (ot) ot.hidden = false;
    if (aero) aero.hidden = false;
    fillDocks($);
    hidePlayGlyphs($, doc);
    if (body && body.classList) body.classList.add("steer-touch");
  }

  /**
   * Re-assert survey chrome after Graphics unavailable / ctxLost.
   * Safe to call repeatedly; does not touch loading / race warm.
   * Only string-literal DOM lookups (shell-ids dynamicIdReads ratchet).
   */
  function holdChrome(hooks) {
    hooks = hooks || {};
    const doc = hooks.document || (typeof document !== "undefined" ? document : null);
    if (!doc) return false;
    const $ = typeof hooks.$ === "function" ? hooks.$ : null;

    // Each call site must pass a string literal into $ / getElementById.
    const overlay = (hooks.els && hooks.els.overlay)
      || ($ && $("overlay")) || (doc.getElementById && doc.getElementById("overlay")) || null;
    if (overlay) { overlay.hidden = true; if ("inert" in overlay) overlay.inert = false; }
    // #nogl is z-99 and covers the viewport — keep it down for survey shots.
    const nogl = (hooks.els && hooks.els.nogl)
      || ($ && $("nogl")) || (doc.getElementById && doc.getElementById("nogl")) || null;
    if (nogl) nogl.hidden = true;

    const hud = (hooks.els && hooks.els.hud)
      || ($ && $("hud")) || (doc.getElementById && doc.getElementById("hud")) || null;
    if (hud) { hud.hidden = false; if ("inert" in hud) hud.inert = false; }
    const pausebtn = (hooks.els && hooks.els.pausebtn)
      || ($ && $("pausebtn")) || (doc.getElementById && doc.getElementById("pausebtn")) || null;
    if (pausebtn) pausebtn.hidden = false;
    const btnCam = (hooks.els && hooks.els.btnCam)
      || ($ && $("btn-cam")) || (doc.getElementById && doc.getElementById("btn-cam")) || null;
    if (btnCam) btnCam.hidden = false;

    if (doc.body) {
      doc.body.classList.add("in-race");
      if (doc.body.dataset) doc.body.dataset.surveyHud = "1";
    }
    hidePlayGlyphs($, doc);
    // Survey shots never start a race, so fitHud's create-time path never runs.
    // Re-fit now (no-op until GameHud.create) so capped layout paints for captures.
    if (typeof GameHud !== "undefined" && GameHud && typeof GameHud.invalidateFit === "function") {
      try { GameHud.invalidateFit(); } catch (_) { /* pre-create / headless stub */ }
    }
    return !!hud && !hud.hidden;
  }

  /**
   * Boot into a layoutable cockpit HUD without race / scenery warm.
   * hooks: { document, $, els?, loadingScreen? }
   */
  function apply(hooks) {
    hooks = hooks || {};
    const doc = hooks.document || (typeof document !== "undefined" ? document : null);
    const $ = hooks.$;
    if (!doc || typeof $ !== "function") return false;

    const ls = hooks.loadingScreen;
    // Prefer #1012 busy plate when present; else disarm any leftover card.
    if (ls && typeof ls.busy === "function") {
      try { ls.busy("Survey HUD"); } catch (_) { /* plate refused */ }
    } else if (ls && typeof ls.stop === "function") {
      try { ls.stop(); } catch (_) { /* already down */ }
    }

    for (const node of doc.querySelectorAll(".screen")) {
      if (node.id === "pausemenu") continue;
      node.hidden = true;
    }
    const ok = holdChrome(hooks);
    showTouchStub($, doc.body, doc);

    if (ls && typeof ls.stop === "function") {
      try { ls.stop(); } catch (_) { /* card already down */ }
    }
    return ok;
  }

  /** Open #pausemenu over the survey HUD (no race state). TopModal mirrors hidden. */
  function openPause(hooks) {
    hooks = hooks || {};
    const doc = hooks.document || (typeof document !== "undefined" ? document : null);
    const $ = hooks.$;
    if (!doc || typeof $ !== "function") return false;
    const pm = (hooks.els && hooks.els.pausemenu) || $("pausemenu");
    if (!pm) return false;
    for (const node of doc.querySelectorAll(".screen")) {
      if (node !== pm) node.hidden = true;
    }
    pm.hidden = false;
    return true;
  }

  function active(doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    return !!(doc && doc.body && doc.body.dataset && doc.body.dataset.surveyHud === "1");
  }

  /**
   * game.js boot entry — keeps the call site to one codeLine (ratchet).
   * When armed: apply chrome, wire pausebtn, re-hold on webglcontextlost (#1033).
   * hooks: { $, els, document, loadingScreen?, canvas?, location?, localStorage? }
   */
  function boot(hooks) {
    hooks = hooks || {};
    const loc = hooks.location || (typeof location !== "undefined" ? location : null);
    const store = ("localStorage" in hooks)
      ? hooks.localStorage
      : (typeof localStorage !== "undefined" ? localStorage : null);
    if (!enabled(loc, store)) return false;
    const surveyHooks = {
      $: hooks.$, els: hooks.els, document: hooks.document,
      loadingScreen: hooks.loadingScreen,
    };
    const ok = apply(surveyHooks);
    if (hooks.els && hooks.els.pausebtn) {
      hooks.els.pausebtn.onclick = () => openPause(surveyHooks);
    }
    const canvas = hooks.canvas;
    if (canvas && typeof canvas.addEventListener === "function") {
      const rehold = () => { try { holdChrome(surveyHooks); } catch (_) { /* hold best-effort */ } };
      try { canvas.addEventListener("webglcontextlost", rehold, false); } catch (_) { /* no canvas */ }
    }
    return ok;
  }

  return { KEY, enabled, armed, apply, holdChrome, openPause, active, boot };
})();
Object.freeze(SurveyHud);
