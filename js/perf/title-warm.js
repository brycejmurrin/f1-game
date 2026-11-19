const TitleWarm = (function () {
  "use strict";

  const POLL_MS = 1000;

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
        const sel = d.$("select"), rs = d.$("race-settings");
        const menus = titleShowing() || !!(sel && !sel.hidden) || !!(rs && !rs.hidden);
        if (G.state !== "menu" || !menus) { wanted = false; noisy(); }
        else if (d.prepReady()) {
          const e = env();
          wanted = false;
          if (e.build && doneBuild !== e.build) { doneBuild = e.build; const s = store(); if (s) s.rawSet("titleWarm", e.build); }
          last = { ...last, done: Math.round(now()) };
          try { Log.info("gfx", "title warm done " + e.build); } catch (_) {  }
          stop();
        }
        return;
      }
      if (doneBuild) { stop(); return; }
      const e = env(), why = blockers(e);
      last = { at: Math.round(now()), why };
      if (why.indexOf("done-this-build") >= 0) {
        doneBuild = e.build || "done";
        stop();
        return;
      }
      if (why.some((w) => w !== "input-recent")) noisy();
      if (why.length) return;
      wanted = true;
      try { Log.info("gfx", "title warm start (build " + e.build + (e.phone ? ", phone" : "") + ")"); } catch (_) {  }
      d.schedule();
    }
    function stop() { if (timer) clearInterval(timer); timer = 0; }
    return {
      start() { if (!timer && typeof setInterval === "function") timer = setInterval(poll, POLL_MS); },
      stop,
      poll,
      wants: () => wanted && titleShowing(),
      state: () => ({ wanted, doneBuild, last, polling: !!timer }),
    };
  }

  return { create };
})();
Object.freeze(TitleWarm);
