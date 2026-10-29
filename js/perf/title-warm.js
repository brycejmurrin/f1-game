/* Apex 26 — TitleWarm: the race world's prep and program warm on an idle TITLE (A·W50, 2026-10-25).
   The menu prep (game.js scheduleFlybyTrack -> menuFinish -> warmPrograms) ran only on the track picker, RACE
   SETTINGS or a circuit Home. So a title -> START compiled every race pipeline at the lights: iPhone 14 Pro WebGPU
   cold Monza mirrorPrepare 32-35 s, and 45 s of title idle advanced nothing (Device Farm S5, 2026-10-24;
   docs/notes/MIRROR-WARM-2026-10-24.md). This poll lets that same prep start once the title has been idle.
   ONCE PER UPDATE on a phone (Bryce, 2026-10-25): Safari keeps its compiled pipelines across sessions (a second
   session's warm measured 0.24 s), so a phone pays the speculative world once, in the first title session after
   a deploy. apex26.titleWarm holds the build (<meta name="apex-build">) whose title warm completed; a phone with
   that build skips it. Desktop: every session. Never under Save-Data / prefers-reduced-data, behind a hidden tab,
   under a menu sheet, during the title intro, headless, or where the title draws a 3D Home (garage / night /
   studio own the frames the warm would need; a circuit Home already preps its world). Cancellable for free: it
   only widens the prep's current() test, so leaving the title stops the prep at its next step, and an open
   sheet pauses it (MenuSheetGate). */
const TitleWarm = (function () {
  "use strict";

  const POLL_MS = 1000;

  // Why the title warm may not start now; [] means go. `e` is a plain snapshot (see create's env()).
  function blockers(e) {
    const out = [];
    if (e.state !== "menu") out.push("state");
    if (!e.title) out.push("surface");
    if (e.homeDraws) out.push("home-3d");
    if (!e.warmable) out.push("no-warm");
    if (e.intro) out.push("title-intro");
    if (e.sheetOpen) out.push("menu-sheet");
    if (e.tabHidden) out.push("tab-hidden");
    if (e.headless) out.push("headless");
    if (e.saveData) out.push("save-data");
    if (e.phone && e.build && e.stored === e.build) out.push("done-this-build");
    if (e.quietMs < e.idleMs) out.push("input-recent");
    return out;
  }

  function buildId(doc) {
    try { const m = doc && doc.querySelector('meta[name="apex-build"]'); return (m && m.content) || ""; } catch (_) { return ""; }
  }

  // d: { gate, $, ui, schedule, prepReady, idleMs, warmable, store }. schedule() is game.js's scheduleFlybyTrack(true);
  // prepReady() is true once the prep's world is built, menuFinish has run and no compile is in flight.
  function create(G, d) {
    const now = () => performance.now();
    let wanted = false, timer = 0, last = null, quietSince = null, doneBuild = null;
    const noisy = () => { quietSince = now(); };
    if (typeof addEventListener === "function") {
      for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "visibilitychange"]) addEventListener(ev, noisy, { capture: true, passive: true });
    }
    const store = () => d.store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    function titleShowing() {
      const ov = d.$("overlay"), sel = d.$("select"), rs = d.$("race-settings");
      return !!(ov && !ov.hidden && !ov.inert && (!sel || sel.hidden) && (!rs || rs.hidden));
    }
    function env() {
      const ov = d.$("overlay"), nav = typeof navigator !== "undefined" ? navigator : null;
      const st = d.ui && d.ui() && d.ui().state ? d.ui().state() : null;
      const gfx = G.gfx, hint = gfx && (gfx.isMobile || gfx.mobileTier) ? gfx : (typeof GLX !== "undefined" ? GLX : gfx);
      const s = store();
      if (quietSince === null) quietSince = now();
      return {
        state: G.state, title: titleShowing() && !G.setupPreviewOn,
        homeDraws: !!(st && st.home), warmable: !!d.warmable(), intro: !!(ov && ov.hasAttribute("data-intro")),
        sheetOpen: GaragePrebuild.sheetOpenNow(), tabHidden: typeof document !== "undefined" && !!document.hidden,
        headless: !!G.headlessMode, saveData: GaragePrebuild.saveData(nav, typeof matchMedia === "function" ? matchMedia : null),
        phone: GaragePrebuild.phoneHold(nav, hint), build: buildId(typeof document !== "undefined" ? document : null),
        stored: s ? s.raw("titleWarm") : null, quietMs: now() - quietSince, idleMs: d.idleMs,
      };
    }
    function poll() {
      if (wanted) {
        // The prep runs while the title stays up, and on through the picker / RACE SETTINGS if the player taps RACE
        // (their own current() keeps it). Anywhere else (a race, the garage, career) it was abandoned: re-arm.
        const sel = d.$("select"), rs = d.$("race-settings");
        const menus = titleShowing() || !!(sel && !sel.hidden) || !!(rs && !rs.hidden);
        if (G.state !== "menu" || !menus) { wanted = false; noisy(); }
        else if (d.prepReady()) {
          const e = env();
          wanted = false;
          if (e.build && doneBuild !== e.build) { doneBuild = e.build; const s = store(); if (s) s.rawSet("titleWarm", e.build); }
          last = { ...last, done: Math.round(now()) };
          try { Log.info("gfx", "title warm done " + e.build); } catch (_) { /* logging is optional */ }
        }
        return;
      }
      if (doneBuild) return;   // one per session
      const e = env(), why = blockers(e);
      last = { at: Math.round(now()), why };
      // Idle counts from the title actually showing: any blocker but the quiet clock itself restarts it.
      if (why.some((w) => w !== "input-recent")) noisy();
      if (why.length) return;
      wanted = true;
      try { Log.info("gfx", "title warm start (build " + e.build + (e.phone ? ", phone" : "") + ")"); } catch (_) { /* optional */ }
      d.schedule();
    }
    return {
      start() { if (!timer && typeof setInterval === "function") timer = setInterval(poll, POLL_MS); },
      stop() { if (timer) clearInterval(timer); timer = 0; },
      poll,
      // scheduleFlybyTrack's current(): a title warm in progress keeps the prep alive on the title.
      wants: () => wanted && titleShowing(),
      state: () => ({ wanted, doneBuild, last }),
    };
  }

  // blockers / buildId / POLL_MS stay module-local — create() is the only external seam.
  return { create };
})();
Object.freeze(TitleWarm);
