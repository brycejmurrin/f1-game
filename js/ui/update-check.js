/* Apex 26 — UpdateCheck: an in-session "a newer build is live" check and its UPDATE READY chip. index.html's shell version guard runs ONCE, at boot; an installed PWA or a long-lived tab then never learned a deploy happened until multiplayer refused a mismatched friend. Contract: docs/ARCHITECTURE.md. */
const UpdateCheck = (function () {
  "use strict";

  // Re-read version.json when the tab comes back, at most this often. The
  // boot guard has just read it, so the clock starts at boot.
  const THROTTLE_MS = 10 * 60 * 1000;
  // Bounded wait for the store's mirror flush before reloading: an update must
  // never hang on a stuck IndexedDB, and pagehide flushes again anyway.
  const PERSIST_WAIT_MS = 1500;
  // index.html's guard key: our reload IS that guard's reload, so the boot
  // after it must not reload a second time for the same build.
  const RELOAD_KEY = "apex26.shellReloadedTo";
  const FOLLOW_MS = 2000;

  function bootedBuild() {
    try {
      const m = document.querySelector('meta[name="apex-build"]');
      const n = m ? parseInt(m.content, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch (e) { return 0; }
  }

  // The build of the worker CONTROLLING this page. index.html registers
  // `sw.js?v=<its own build>`, so a controller whose ?v= is newer than the
  // booted shell means a newer deploy's worker activated under this tab — and
  // its activate swept the older generation, so every lazy `?v=<booted>`
  // request now misses the cache and reaches Pages, which ignores the query
  // and serves the NEW file into the OLD code.
  function controllerBuild() {
    try {
      const c = navigator.serviceWorker && navigator.serviceWorker.controller;
      const m = c && /[?&]v=(\d+)/.exec(String(c.scriptURL || ""));
      return m ? parseInt(m[1], 10) : 0;
    } catch (e) { return 0; }
  }

  let _active = null;

  function create(o) {
    o = o || {};
    const booted = o.booted != null ? o.booted : bootedBuild();
    const now = o.now || (() => Date.now());
    const doFetch = o.fetch || ((u, init) => fetch(u, init));
    const inRace = o.inRace || (() => false);
    const chip = o.chip || (() => null);
    let lastCheck = now();
    let ready = 0;
    let inflight = null;
    let follow = 0;   // once ready: re-render on a slow timer, so the chip follows race start / finish

    function render() {
      const el = chip();
      if (!el) return;
      // OUTSIDE RACES ONLY: a reload mid-race throws the race away, and a
      // chip over the track is a distraction. It reappears at the next menu.
      el.hidden = !(ready > 0 && !inRace());
      if (!el.hidden) el.setAttribute("aria-label", "Update ready: build " + ready + ". Reload to update.");
    }

    function markReady(build) {
      build = Number(build);
      if (!booted || !(build > booted)) return false;
      if (build > ready) {
        ready = build;
        if (!follow && typeof setInterval === "function") follow = setInterval(render, FOLLOW_MS);
        try { if (typeof Log !== "undefined") Log.info("game", "update ready: build " + build + " (running " + booted + ")"); } catch (e) { /* logging never blocks the chip */ }
      }
      render();
      return true;
    }

    function check(force) {
      if (!booted) return Promise.resolve(false);   // an unstamped shell has nothing to compare
      const t = now();
      if (inflight) return inflight;
      if (!force && t - lastCheck < THROTTLE_MS) return Promise.resolve(false);
      lastCheck = t;
      inflight = Promise.resolve()
        .then(() => doFetch("version.json?_=" + t, { cache: "no-store" }))
        .then((r) => (r && r.ok ? r.json() : null))
        .then((v) => markReady(v && v.build))
        .catch(() => false)   // offline / deploy window: ask again next time
        .finally(() => { inflight = null; });
      return inflight;
    }

    function newerActive() {
      const c = (o.controllerBuild || controllerBuild)();
      return c > booted ? markReady(c) : false;
    }

    // "Depending on your web app, you may want to auto-save or persist
    // transient state before triggering the reload."
    // https://developer.chrome.com/docs/workbox/handling-service-worker-updates
    async function apply() {
      if (!ready || inRace()) return false;
      if (o.persist) {
        try {
          await Promise.race([Promise.resolve().then(o.persist),
            new Promise((r) => setTimeout(r, PERSIST_WAIT_MS))]);
        } catch (e) { /* a failed flush is retried by pagehide on the way out */ }
      }
      const loc = o.location || location;
      try { sessionStorage.setItem(RELOAD_KEY, String(ready)); } catch (e) { /* private mode: the guard may reload once more, harmlessly */ }
      // Same URL shape as the boot guard: ?b= busts the cached shell, the rest
      // of the query and the hash (a #vs= invite) survive.
      const q = new URLSearchParams(loc.search || "");
      q.set("b", String(ready));
      loc.replace(loc.pathname + "?" + q.toString() + (loc.hash || ""));
      return true;
    }

    function onVisible() {
      if (typeof document !== "undefined" && document.hidden) return;
      newerActive();
      check(false);
      render();
    }

    const api = {
      check, markReady, newerActive, apply, render, onVisible,
      state: () => ({ booted, ready, lastCheck, checking: !!inflight }),
      stop: () => { clearInterval(follow); follow = 0; },
    };
    _active = api;
    return api;
  }

  // For js/core/script-loader.js: true when a lazy load would mix builds. Only
  // once the session is wired (create() ran) — at boot the shell guard owns a
  // stale shell, and refusing a backend there would cost the renderer.
  function blocksLazyLoad() {
    return !!(_active && _active.newerActive());
  }

  return { create, blocksLazyLoad, bootedBuild, controllerBuild, THROTTLE_MS };
})();
Object.freeze(UpdateCheck);
