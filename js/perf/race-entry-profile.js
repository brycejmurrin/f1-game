/* Apex 26 — RaceEntryProfile: the race-entry stopwatch OUTSIDE the track build.
 *
 * PERF-OPTIONS-2026-09-16.md measured ~2193 ms contiguous / ~4856 ms total
 * main-thread block at race entry on GLX, of which the track build is only
 * ~23 %. `__apex.raceProfile()` used to cover only startRaceBody's sequential
 * legs (almost all loadTrack). This module keeps those legs AND adds:
 *   - named marks around handoff / warm / first present / car assets / debris
 *   - an optional PerformanceObserver longtask ring for the same window
 * so a real-device probe can attribute the other three quarters instead of
 * guessing. Soft-blit CI numbers are not this freeze — label them separately.
 *
 * Global: RaceEntryProfile. No game.js façade required for the full snapshot;
 * G.raceProfile stays the legs-only compatibility view. */
const RaceEntryProfile = (() => {
  "use strict";

  const MAX_TASKS = 64;
  const MAX_MARKS = 64;

  let legs = [];
  let marks = [];
  let longTasks = [];
  let lapT0 = 0;
  let winT0 = 0;
  let observer = null;
  let supported = false;
  let armed = false;
  let sawWarming = false;
  let sawReady = false;
  let endAfterReady = 0;
  let generation = 0, presentationEnabled = true;

  function now() {
    try { return performance.now(); } catch (_) { return Date.now(); }
  }

  function pushMark(n) {
    if (marks.length >= MAX_MARKS) return;
    marks.push({ n, t: +(now() - winT0).toFixed(2) });
  }

  function onLongTask(list) {
    if (!armed) return;
    for (const e of list.getEntries()) {
      if (longTasks.length >= MAX_TASKS) break;
      const start = +e.startTime;
      // Only tasks that overlap this window (observer may be buffered).
      if (start + e.duration < winT0) continue;
      longTasks.push({
        start: +start.toFixed(2),
        ms: +e.duration.toFixed(2),
        name: e.name || "unknown",
      });
    }
  }

  function armObserver() {
    supported = false;
    if (typeof PerformanceObserver !== "function") return;
    try {
      const types = PerformanceObserver.supportedEntryTypes;
      if (types && types.indexOf && types.indexOf("longtask") < 0) return;
      const mine = generation;
      observer = new PerformanceObserver((list) => { if (mine === generation) onLongTask(list); });
      observer.observe({ type: "longtask", buffered: true });
      supported = true;
    } catch (_) {
      observer = null;
      supported = false;
    }
  }

  function disarmObserver() {
    if (!observer) return;
    try { observer.disconnect(); } catch (_) { /* already gone */ }
    observer = null;
  }

  function begin(tag) {
    disarmObserver();
    generation++; presentationEnabled = true;
    legs = [];
    marks = [];
    longTasks = [];
    sawWarming = false;
    sawReady = false;
    endAfterReady = 0;
    winT0 = now();
    lapT0 = winT0;
    armed = true;
    armObserver();
    if (tag) pushMark("begin:" + tag);
  }

  function end() {
    if (!armed) return;
    pushMark("end");
    armed = false;
    disarmObserver();
  }

  function lap(n) {
    const t = now();
    legs.push({ n, ms: +(t - lapT0).toFixed(2) });
    lapT0 = t;
  }

  function mark(n) {
    if (!armed) return;
    pushMark(n);
  }

  /** First warming present and first ready present only — not every frame. */
  function notePresent(warming) {
    if (!armed) return;
    if (warming) {
      if (!sawWarming) { sawWarming = true; pushMark("present:warming"); }
      return;
    }
    if (!sawReady) {
      sawReady = true;
      pushMark("present:ready");
      endAfterReady = 2;   // keep the observer for a couple of frames past ready
    }
  }

  /** Call once per rendered frame while a race-entry window is armed. */
  function tickFrame() {
    if (!armed || !sawReady) return;
    if (endAfterReady > 0 && --endAfterReady === 0) end();
  }

  /** TLX warm request (or skipped/noop) — one call site in startRaceBody. */
  function requestWarm(gfx, alreadyWarmed) {
    if (gfx && gfx.warm && !alreadyWarmed) { mark("warm:request"); gfx.warm(); }
    else mark(alreadyWarmed ? "warm:skipped-menu" : "warm:noop");
  }

  function raiseHandoff(screen) {
    presentationEnabled = true;
    mark("handoff:raise");
    screen.handoff();
  }

  function span(name, fn) {
    mark(name + ":start");
    try { return fn(); }
    finally { mark(name + ":end"); }
  }

  async function spanAsync(name, fn) {
    mark(name + ":start");
    try { return await fn(); }
    finally { mark(name + ":end"); }
  }

  /** Lower the handoff card on the first painted present; tick the window. */
  function afterPresent(screen, gfx) {
    const handoff = screen.phase() === "handoff", watching = armed && presentationEnabled;
    if (handoff || watching) {
      const warming = !!(gfx.warming && gfx.warming());
      if (watching) notePresent(warming);
      if (handoff && !warming) { mark("handoff:lower"); screen.stop(); }
    }
    tickFrame();
  }

  /** Latch identity and profiler ownership survive duplicate/superseded starts. */
  function runSession(sessionEntry, key, scenery, body, stillWanted, onFail) {
    let owner = 0;
    const owns = () => owner !== 0 && owner === generation;
    const request = sessionEntry.begin("race", key, async () => {
      begin("startRace"); owner = generation; presentationEnabled = false;
      mark("ensureScenery:start");
      try { return await scenery(); }
      finally { if (owns()) mark("ensureScenery:end"); }
    }, body, stillWanted, (e) => {
      if (owns()) end();
      onFail(e);
    });
    request.then((result) => {
      if (!owns()) return;
      if (result === false || (result && result.kind === "canceled")) end();
      else { mark("session:committed"); presentationEnabled = true; }
    }, () => { if (owns()) end(); });
    return request;
  }

  function blockMs() {
    let s = 0;
    for (const t of longTasks) s += t.ms;
    return +s.toFixed(2);
  }

  function maxBlockMs() {
    let m = 0;
    for (const t of longTasks) if (t.ms > m) m = t.ms;
    return +m.toFixed(2);
  }

  function snapshot() {
    return {
      legs: legs.slice(),
      marks: marks.slice(),
      longTasks: longTasks.slice(),
      blockMs: blockMs(),
      maxBlockMs: maxBlockMs(),
      supported,
      armed,
      windowMs: armed || marks.length ? +(now() - winT0).toFixed(2) : 0,
    };
  }

  return {
    begin, end, lap, mark, notePresent, tickFrame,
    requestWarm, raiseHandoff, span, spanAsync, afterPresent, runSession,
    snapshot,
    legs: () => legs.slice(),
    armed: () => armed,
    supported: () => supported,
    // Test / probe seam: inject synthetic longtasks without a real observer.
    _injectTask(ms, start, name) {
      if (longTasks.length >= MAX_TASKS) return;
      longTasks.push({
        start: +(start != null ? start : now()).toFixed(2),
        ms: +(+ms).toFixed(2),
        name: name || "synthetic",
      });
    },
  };
})();
Object.freeze(RaceEntryProfile);
