const UpdateCheck = (function () {
  "use strict";

  const THROTTLE_MS = 10 * 60 * 1000;
  const PERSIST_WAIT_MS = 1500;
  const RELOAD_KEY = "apex26.shellReloadedTo";
  const FOLLOW_MS = 2000;
  const FAIL_BACKOFF_MS = 30 * 1000;
  const CHECK_WAIT_MS = 15000;
  const REFUSED_CHIP = "UPDATE READY · RELOAD TO CONTINUE";
  const REFUSED_SAY = "UPDATE READY — RELOAD TO CONTINUE";
  const FRESH_MS = 60 * 1000;
  const FRESH_WAIT_MS = 1500;

  function bootedBuild() {
    try {
      const m = document.querySelector('meta[name="apex-build"]');
      const n = m ? parseInt(m.content, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch (e) { return 0; }
  }

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
    const gameState = o.state || null;
    const cover = o.cover || (() => null);
    function busy() {
      if (inRace()) return true;
      if (gameState && gameState() !== "menu") return true;
      const c = cover();
      return !!(c && !c.hidden);
    }
    let generationRequest = null, generationController = null, generation = 0;
    const guardOk = o.guardOk || (() => typeof window !== "undefined" && !!window.__apexGuardOk);
    const bootAt = now();
    let lastCheck = bootAt - THROTTLE_MS + FAIL_BACKOFF_MS;
    let bootSeed = true;
    let ready = 0;
    let inflight = null;
    let follow = 0;
    let refusedFor = 0;
    let refusedSaid = 0;

    function render() {
      const el = chip();
      if (!el) return;
      el.hidden = !(ready > 0 && !busy());
      if (!el.hidden) el.setAttribute("aria-label", "Update ready: build " + ready + ". Reload to update.");
      if (!el.hidden && refusedFor === ready && refusedSaid !== ready) {
        refusedSaid = ready;
        try { if (typeof LiveRegion !== "undefined") LiveRegion.say(REFUSED_SAY, "save"); } catch (e) {  }
      }
    }

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
        try { if (typeof Log !== "undefined") Log.info("game", "update ready: build " + build + " (running " + booted + ")"); } catch (e) {  }
      }
      render();
      return true;
    }

    function since() {
      if (bootSeed && guardOk()) { bootSeed = false; lastCheck = bootAt; }
      return lastCheck;
    }

    function check(force) {
      if (!booted) return Promise.resolve(false);
      const t = now();
      if (inflight) return inflight;
      if (!force && t - since() < THROTTLE_MS) return Promise.resolve(false);
      lastCheck = t; bootSeed = false;
      const abort = typeof AbortController === "function" ? new AbortController() : null;
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("version.json timed out"));
          try { if (abort) abort.abort(); } catch (_) {  }
        }, CHECK_WAIT_MS);
      });
      const read = Promise.resolve()
        .then(() => doFetch("version.json?_=" + t, { cache: "no-store", ...(abort ? { signal: abort.signal } : {}) }))
        .then((r) => { if (!(r && r.ok)) throw new Error("version.json " + (r && r.status)); return r.json(); });
      inflight = Promise.race([read, deadline])
        .then((v) => markReady(v && v.build))
        .catch(() => { lastCheck = now() - THROTTLE_MS + FAIL_BACKOFF_MS; return false; })
        .finally(() => { clearTimeout(timer); inflight = null; });
      return inflight;
    }

    function knownActive() {
      const c = (o.controllerBuild || controllerBuild)();
      const reported = generationController === controller() ? generation : 0;
      return Math.max(c, reported);
    }

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
            try { if (port) port.close(); } catch (_) {  }
          }
          const current = allowed && controller() === c;
          if (current && Number.isSafeInteger(build) && build > 0) {
            generationController = c; generation = build;
            markReady(build);
          }
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
      return ready > booted;
    }

    async function apply() {
      if (!ready || busy()) return false;
      if (o.persist) {
        try {
          await Promise.race([Promise.resolve().then(o.persist),
            new Promise((r) => setTimeout(r, PERSIST_WAIT_MS))]);
        } catch (e) {  }
      }
      if (busy()) { render(); return false; }
      const loc = o.location || location;
      try { sessionStorage.setItem(RELOAD_KEY, String(ready)); } catch (e) {  }
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

    function freshen() {
      const read = now() - since() > FRESH_MS ? check(true) : inflight;
      if (!read) return Promise.resolve(false);
      let timer = null;
      const late = new Promise((resolve) => { timer = setTimeout(() => resolve(false), FRESH_WAIT_MS); });
      return Promise.race([read, late]).then((r) => { clearTimeout(timer); return r; });
    }

    try {
      const c = cover();
      if (c && typeof MutationObserver === "function") new MutationObserver(render).observe(c, { attributes: true, attributeFilter: ["hidden"] });
    } catch (e) {  }

    const api = {
      check, markReady, newerActive, apply, render, onVisible, blocked, checkController, noteRefused, freshen,
      state: () => ({ booted, ready, lastCheck: since(), checking: !!inflight }),
      stop: () => { clearInterval(follow); follow = 0; },
    };
    _active = api;
    return api;
  }

  function blocksLazyLoad() {
    const b = !!(_active && _active.blocked());
    if (b) _active.noteRefused();
    return b;
  }

  async function prepareLazyLoad(scope) {
    if (!_active) return true;
    const c = controller();
    if (scope && c && scope.legacyController === c) return allowed();
    if (!c) {
      if (!scope) await _active.freshen();
      else await (scope.fresh || (scope.fresh = _active.freshen()));
      return allowed();
    }
    const result = await _active.checkController();
    if (!result.current || controller() !== c) return false;
    if (scope && result.unsupported) scope.legacyController = c;
    return allowed();
  }
  function allowed() {
    const b = _active.blocked();
    if (b) _active.noteRefused();
    return !b;
  }

  return { create, blocksLazyLoad, prepareLazyLoad, bootedBuild, controllerBuild, THROTTLE_MS };
})();
Object.freeze(UpdateCheck);
