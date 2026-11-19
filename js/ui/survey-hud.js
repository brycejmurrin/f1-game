"use strict";
const SurveyHud = (function () {
  const KEY = "APEX_SURVEY_HUD";

  function devOrigin(loc) {
    const lb = typeof LazyBundles !== "undefined" && LazyBundles.live ? LazyBundles.live() : null;
    if (lb) {
      try { return !!lb.wantAgentSurface(); } catch (_) { return false; }
    }
    const h = loc && loc.hostname;
    if (typeof h !== "string") return true;
    return h === "127.0.0.1" || h === "localhost" || h === "[::1]";
  }

  function enabled(loc, storage) {
    try {
      if (!devOrigin(loc)) return false;
      if (loc) {
        const q = typeof URLSearchParams === "function"
          ? new URLSearchParams(loc.search || "").get(KEY) : null;
        if (q === "1") return true;
        const h = String(loc.hash || "");
        if (/(?:^|[?#&])APEX_SURVEY_HUD=1(?:&|$)/.test(h)) return true;
      }
      if (storage && typeof storage.getItem === "function" && storage.getItem(KEY) === "1")
        return true;
    } catch (_) {  }
    return false;
  }

  function pageStorage() {
    try { return typeof localStorage !== "undefined" ? localStorage : null; }
    catch (_) { return null; }
  }

  function armed() {
    return enabled(
      typeof location !== "undefined" ? location : null,
      pageStorage());
  }

  function fillDocks($) {
    const left = $("dock-left"), right = $("dock-right");
    if (!left || !right) return;
    const pedals = $("grp-pedals"), taps = $("grp-taps");
    const steer = $("grp-steer"), shifts = $("grp-shifts");
    if (pedals) left.appendChild(pedals);
    if (taps) right.appendChild(taps);
    if (steer) steer.hidden = true;
    if (shifts) shifts.hidden = true;
  }

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

  function showTouchStub($, body, doc) {
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

  function holdChrome(hooks) {
    hooks = hooks || {};
    const doc = hooks.document || (typeof document !== "undefined" ? document : null);
    if (!doc) return false;
    const $ = typeof hooks.$ === "function" ? hooks.$ : null;

    const overlay = (hooks.els && hooks.els.overlay)
      || ($ && $("overlay")) || (doc.getElementById && doc.getElementById("overlay")) || null;
    if (overlay) { overlay.hidden = true; if ("inert" in overlay) overlay.inert = false; }
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
    if (typeof GameHud !== "undefined" && GameHud && typeof GameHud.invalidateFit === "function") {
      try { GameHud.invalidateFit(); } catch (_) {  }
    }
    return !!hud && !hud.hidden;
  }

  function apply(hooks) {
    hooks = hooks || {};
    const doc = hooks.document || (typeof document !== "undefined" ? document : null);
    const $ = hooks.$;
    if (!doc || typeof $ !== "function") return false;

    const ls = hooks.loadingScreen;
    if (ls && typeof ls.busy === "function") {
      try { ls.busy("Survey HUD"); } catch (_) {  }
    } else if (ls && typeof ls.stop === "function") {
      try { ls.stop(); } catch (_) {  }
    }

    for (const node of doc.querySelectorAll(".screen")) {
      if (node.id === "pausemenu") continue;
      node.hidden = true;
    }
    const ok = holdChrome(hooks);
    showTouchStub($, doc.body, doc);

    if (ls && typeof ls.stop === "function") {
      try { ls.stop(); } catch (_) {  }
    }
    return ok;
  }

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

  function boot(hooks) {
    hooks = hooks || {};
    const loc = hooks.location || (typeof location !== "undefined" ? location : null);
    const store = ("localStorage" in hooks)
      ? hooks.localStorage
      : pageStorage();
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
      const rehold = () => { try { holdChrome(surveyHooks); } catch (_) {  } };
      try { canvas.addEventListener("webglcontextlost", rehold, false); } catch (_) {  }
    }
    return ok;
  }

  return { KEY, enabled, armed, apply, holdChrome, openPause, active, boot };
})();
Object.freeze(SurveyHud);
