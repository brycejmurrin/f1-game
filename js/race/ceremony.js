"use strict";
var RaceCeremony = (function () {
  const PHASES = Object.freeze(["classified", "cooldown", "parcFerme", "podium", "results"]);
  const SEEKABLE = Object.freeze(["cooldown", "parcFerme", "podium", "results"]);
  const DUR = Object.freeze({ cooldown: 45, parcFerme: 8, podium: 6 });

  let _api = null;
  let _want = false;

  function eligible(G, meta) {
    if (!G || G.session !== "race") return false;
    if (G.practice) return false;
    const m = meta || {};
    if (m.duel) return false;
    if (m.watch) return false;
    if (G.netPlay && typeof G.netPlay.active === "function" && G.netPlay.active()) return false;
    return true;
  }

  function podiumCount(order, meta) {
    if (typeof ResultsStory !== "undefined" && ResultsStory.summary) {
      return ResultsStory.summary(order || [], meta || {}).podium.length;
    }
    return (order || []).filter((c) => c && !c.retired && !c.dsq && c.classified !== false).slice(0, 3).length;
  }

  function get() { return _api; }
  function want(v) {
    if (v === undefined) return _want;
    _want = !!v;
    return _want;
  }
  function resetLive() { _want = false; if (_api) _api.reset(); }
  function apexCall(arg) {
    if (!_api) return arg === undefined ? { phase: "idle", age: 0, eligible: false, skipped: false } : false;
    if (arg === undefined) return _api.status();
    if (arg === "skip" || arg === "next") return _api.skip() ? _api.status() : false;
    return _api.seek(arg) ? _api.status() : false;
  }
  function finishThrough(G, endRace, raceOrder, opts) {
    const ran = Number.isFinite(G.raceT) ? G.raceT : 0;
    const clock = ran > 0.5 ? ran : 0;
    G.cars.forEach((c) => { if (!c.finished && !c.retired) { c.finished = true; c.finishT = clock; } });
    want(!!(opts && typeof opts === "object" && opts.ceremony));
    endRace(raceOrder(G.cars));
    return { state: G.state };
  }

  function afterClassify(G, order, meta) {
    const go = _want && _api && _api.start(order, meta || {});
    _want = false;
    if (go) return true;
    resetLive();
    if (G && G.els && G.els.results) G.els.results.hidden = false;
    return false;
  }

  function create(G, deps) {
    const duelOn = (deps && deps.duelOn) || (() => false);
    const isWatch = (deps && deps.isWatch) || (() => false);
    const cool = typeof CooldownLap !== "undefined" ? CooldownLap.create(G) : null;
    const parc = typeof ParcFerme !== "undefined" ? ParcFerme.create(G) : null;
    const podium = typeof RacePodium !== "undefined" ? RacePodium.create(G, {
      resultsCam: { startOrbit: () => { const r = deps && deps.resultsCam && deps.resultsCam(); return !!(r && r.startOrbit && r.startOrbit()); } },
    }) : null;
    let phase = "idle";
    let age = 0;
    let skipped = false;
    let order = null;
    let meta = null;
    let sessionEligible = false;

    function liveMeta() {
      return meta || { duel: !!duelOn(), watch: !!isWatch() };
    }
    function host() {
      if (typeof document === "undefined") return null;
      return document.getElementById("results");
    }
    function publish() {
      const el = host();
      if (!el || !el.dataset) return;
      if (phase === "idle") delete el.dataset.ceremonyPhase;
      else el.dataset.ceremonyPhase = phase;
    }
    function showSheet() {
      if (G.els && G.els.results) G.els.results.hidden = false;
    }
    function status() {
      const elig = phase === "idle" ? eligible(G, liveMeta()) : sessionEligible;
      const cooling = phase === "cooldown";
      return {
        phase, age, eligible: elig, skipped, live: phase !== "idle" && phase !== "results",
        inputOwner: cooling && cool && cool.driveAllowed() ? "player" : "none",
        cameraOwner: cooling ? "chase" : (phase === "parcFerme" || phase === "podium" ? "ceremony" : "none"),
      };
    }
    function cooldownHost() {
      if (typeof document === "undefined") return null;
      let h = document.getElementById("ceremony-cooldown");
      if (h) return h;
      h = document.createElement("div");
      h.id = "ceremony-cooldown";
      h.hidden = true;
      h.style.cssText = "position:fixed;inset:auto 0 0 0;z-index:40;display:flex;justify-content:center;padding:calc(var(--gap, 8px) * 1.5);padding-bottom:max(calc(var(--gap, 8px) * 1.5), env(safe-area-inset-bottom, 0px));pointer-events:none";
      (document.body || document.documentElement).appendChild(h);
      return h;
    }
    function endBeats() {
      if (cool) cool.reset();
      const h = typeof document !== "undefined" ? document.getElementById("ceremony-cooldown") : null;
      if (h) h.hidden = true;
      if (parc) parc.reset();
      if (podium) podium.reset();
    }
    function enter(next) {
      let p = next;
      if (p === "podium" && podiumCount(order, meta) < 3) p = "results";
      endBeats();
      phase = p;
      age = 0;
      publish();
      if (p === "cooldown" && cool) {
        const h = cooldownHost();
        if (cool.start({ force: true }) && h) {
          h.hidden = false;
          const b = cool.mountSkip(h, () => skip());
          if (b) b.style.pointerEvents = "auto";
        }
      } else if (p === "parcFerme" && parc) parc.start({ onSkip: () => skip() });
      else if (p === "podium" && podium) podium.start(order, meta, () => { if (phase === "podium") enter("results"); });
      if (p === "results") showSheet();
      return p;
    }
    function nextAfter(p) {
      if (p === "classified") return "cooldown";
      if (p === "cooldown") return "parcFerme";
      if (p === "parcFerme") return podiumCount(order, meta) >= 3 ? "podium" : "results";
      return "results";
    }
    function start(ord, opts) {
      order = ord || G.cars || [];
      meta = Object.assign({ duel: !!duelOn(), watch: !!isWatch() }, opts || {});
      sessionEligible = eligible(G, meta);
      skipped = false;
      age = 0;
      if (!sessionEligible) {
        phase = "idle";
        publish();
        return false;
      }
      phase = "classified";
      publish();
      const pl = G.player;
      const skipCool = !!(pl && (pl.retired || pl.dsq));
      if (skipCool) skipped = true;
      enter(skipCool ? "parcFerme" : "cooldown");
      return true;
    }
    function seek(target) {
      if (phase === "idle" || !sessionEligible) return false;
      if (SEEKABLE.indexOf(target) < 0) return false;
      skipped = true;
      enter(target);
      return true;
    }
    function skip() {
      if (phase === "idle" || phase === "results") return false;
      skipped = true;
      enter(nextAfter(phase));
      return true;
    }
    function tick(dt) {
      if (phase === "idle" || phase === "results" || phase === "classified") return;
      age += dt > 0 ? dt : 0;
      if (phase === "cooldown" && cool && cool.live() && cool.tick(dt)) { skip(); return; }
      if (phase === "parcFerme" && parc) parc.tick(dt);
      if (phase === "podium" && podium) podium.tick(dt);
      if (phase === "idle" || phase === "results") return;
      const lim = DUR[phase];
      if (lim > 0 && age >= lim) skip();
    }
    function reset() {
      endBeats();
      phase = "idle";
      age = 0;
      skipped = false;
      order = null;
      meta = null;
      sessionEligible = false;
      publish();
    }
    function live() { return status().live; }

    _api = { start, status, seek, skip, tick, reset, live, eligible: () => eligible(G, liveMeta()) };
    return _api;
  }

  return { create, get, want, afterClassify, resetLive, apexCall, finishThrough, eligible, PHASES, SEEKABLE, DUR, podiumCount };
})();
Object.freeze(RaceCeremony);
