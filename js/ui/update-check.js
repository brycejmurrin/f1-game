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
  // A version.json read that FAILED (offline, a deploy window, a bad body) is
  // asked again after this, not after the full throttle: the throttle exists to
  // spare a successful check, and counting a failed one against it hid an
  // update for ten minutes on exactly the flaky link that dropped the request.
  const FAIL_BACKOFF_MS = 30 * 1000;
  // What the player reads when a lazy load was refused to avoid mixing builds.
  const REFUSED_CHIP = "UPDATE READY · RELOAD TO CONTINUE";
  const REFUSED_SAY = "UPDATE READY — RELOAD TO CONTINUE";
  // FIRST VISIT (no service worker controls the tab): no controller probe and no
  // controllerchange can learn of a deploy that lands while the tab stays
  // visible, and Pages answers a lazy `?v=<booted>` request with the NEW file.
  // So a lazy load re-reads version.json first when the last read is older than
  // this — once per loader call, and never waiting longer than FRESH_WAIT_MS.
  const FRESH_MS = 60 * 1000;
  const FRESH_WAIT_MS = 1500;

  function bootedBuild() {
    try {
      const m = document.querySelector('meta[name="apex-build"]');
      const n = m ? parseInt(m.content, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch (e) { return 0; }
  }

  // Registration URL fallback for old workers without the generation protocol.
  // It is NOT proof of the executing worker's cache: update() can replace the
  // bytes at the same URL. Lazy loads query that exact controller first.
  function controller() {
    try { return navigator.serviceWorker && navigator.serviceWorker.controller; }
    catch (_) { return null; }
  }
  function controllerBuild() {
    try {
      const c = controller();
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
    let generationRequest = null, generationController = null, generation = 0;
    let lastCheck = now();
    let ready = 0;
    let inflight = null;
    let follow = 0;   // once ready: re-render on a slow timer, so the chip follows race start / finish
    let refusedFor = 0;   // the build a refused lazy load was last explained for (once per build)
    let refusedSaid = 0;  // …and the build whose screen-reader line has been spoken

    function render() {
      const el = chip();
      if (!el) return;
      // OUTSIDE RACES ONLY: a reload mid-race throws the race away, and a
      // chip over the track is a distraction. It reappears at the next menu.
      el.hidden = !(ready > 0 && !inRace());
      if (!el.hidden) el.setAttribute("aria-label", "Update ready: build " + ready + ". Reload to update.");
      // The spoken line waits for a menu: a radio-priority interruption mid-race is noise.
      if (!el.hidden && refusedFor === ready && refusedSaid !== ready) {
        refusedSaid = ready;
        try { if (typeof LiveRegion !== "undefined") LiveRegion.say(REFUSED_SAY, "save"); } catch (e) { /* announcing never blocks the chip */ }
      }
    }

    // A lazy load was REFUSED because it would mix builds (blocked()). The refusal
    // itself stays — a file asked for as the old build would be answered with the
    // new one — but it used to be silent: DATA, VS FRIEND, sound and an unvisited
    // circuit were dead buttons with only a small chip to explain them. Say so,
    // once per pending build, on the chip the player is already being offered.
    function noteRefused() {
      if (!(ready > booted) || refusedFor === ready) return;
      refusedFor = ready;
      const el = chip();
      if (el) el.textContent = REFUSED_CHIP;
      render();
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
        .then((r) => { if (!(r && r.ok)) throw new Error("version.json " + (r && r.status)); return r.json(); })
        .then((v) => markReady(v && v.build))
        .catch(() => { lastCheck = t - THROTTLE_MS + FAIL_BACKOFF_MS; return false; })   // offline / deploy window: ask again soon
        .finally(() => { inflight = null; });
      return inflight;
    }

    function knownActive() {
      const c = (o.controllerBuild || controllerBuild)();
      const reported = generationController === controller() ? generation : 0;
      return Math.max(c, reported);
    }

    // Coalesce parallel lazy loads, but ask again for the next batch: a worker
    // can restart at the same scriptURL and re-read a newer version.json.
    function checkController() {
      const c = controller();
      if (!c || typeof c.postMessage !== "function" || typeof MessageChannel === "undefined") return Promise.resolve({ current: true, unsupported: false });
      if (generationRequest && generationRequest.controller === c) return generationRequest.promise;
      const request = { controller: c, promise: null };
      request.promise = new Promise((resolve) => {
        let channel, timer, ended = false;
        const finish = (build, unsupported = false, allowed = true) => {
          if (ended) return;
          ended = true;
          clearTimeout(timer);
          if (channel) for (const port of [channel.port1, channel.port2]) {
            try { if (port) port.close(); } catch (_) { /* detached or already closed */ }
          }
          const current = allowed && controller() === c;
          if (current && Number.isSafeInteger(build) && build > 0) {
            generationController = c; generation = build;
            markReady(build);
          }
          // A late former controller may not authorize injection into the new
          // one's namespace. This load can be retried against the new worker.
          resolve({ current, unsupported });
        };
        try {
          channel = new MessageChannel();
          channel.port1.onmessage = (e) => {
            const d = e.data;
            if (d && d.type === "apex-cache-generation") finish(d.build);
          };
          timer = setTimeout(() => finish(0, true), 1500);
          c.postMessage({ type: "apex-cache-generation" }, [channel.port2]);
        } catch (_) { finish(0, false, false); }
      }).finally(() => { if (generationRequest === request) generationRequest = null; });
      generationRequest = request;
      return request.promise;
    }

    function newerActive() {
      checkController();
      const c = knownActive();
      return c > booted ? markReady(c) : false;
    }

    function blocked() {
      const c = knownActive();
      if (c > booted) markReady(c);
      // An old/unresponsive worker cannot prove a known newer deploy is safe.
      return ready > booted;
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
      if (inRace()) { render(); return false; } // a race may have started while persistence was pending
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

    // A lazy load with no controller: a forced read when the last one is stale.
    function freshen() {
      const read = now() - lastCheck > FRESH_MS ? check(true) : inflight;
      if (!read) return Promise.resolve(false);
      let timer = null;
      const late = new Promise((resolve) => { timer = setTimeout(() => resolve(false), FRESH_WAIT_MS); });
      return Promise.race([read, late]).then((r) => { clearTimeout(timer); return r; });
    }

    const api = {
      check, markReady, newerActive, apply, render, onVisible, blocked, checkController, noteRefused, freshen,
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
    const b = !!(_active && _active.blocked());
    if (b) _active.noteRefused();
    return b;
  }

  async function prepareLazyLoad(scope) {
    if (!_active) return true;
    const c = controller();
    // Only an unresponsive legacy controller gets one timeout per load(), not
    // per dependency wave. Never retain that fallback across loader calls, or
    // apply it to a replacement controller with the same registration URL.
    if (scope && c && scope.legacyController === c) return allowed();
    if (!c) {
      // One read per loader call, shared by every file of it (parallel ones too).
      if (!scope) await _active.freshen();
      else await (scope.fresh || (scope.fresh = _active.freshen()));
      return allowed();
    }
    const result = await _active.checkController();
    if (!result.current || controller() !== c) return false;
    if (scope && result.unsupported) scope.legacyController = c;
    return allowed();
  }
  // True when the load may go ahead; a refusal is explained to the player once.
  function allowed() {
    const b = _active.blocked();
    if (b) _active.noteRefused();
    return !b;
  }

  return { create, blocksLazyLoad, prepareLazyLoad, bootedBuild, controllerBuild, THROTTLE_MS };
})();
Object.freeze(UpdateCheck);
