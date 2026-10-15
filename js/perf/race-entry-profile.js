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
  const MAX_MARKS = 128;

  let legs = [];
  let marks = [];
  let longTasks = [];
  let lapT0 = 0;
  let winT0 = 0, winT1 = 0;
  let observer = null;
  let supported = false;
  let armed = false;
  let sawWarming = false;
  let sawReady = false;
  let endAfterReady = 0;
  let generation = 0, presentationEnabled = true;
  // True after beginUi until continueWindow/begin consumes it — keeps cover marks
  // for one tap→startRace handoff without suppressing a superseding startRace begin().
  let uiPending = false;
  let entryKind = "";
  let introBudgetT0 = 0;
  let introBudgetMs = 0;
  let introBudgetArmed = false;
  let progressSink = null;
  /** True from beginUi until startRace commits — keeps the window armed through flyby/handoff. */
  let menuEntrySession = false;
  const INTRO_BUDGET_SOFT_MS = 45000;
  const INTRO_BUDGET_HW_MS = 120000;
  const STAGE_LABELS = {
    awaitIntroWarm: "Shaders",
    ensureScenery: "Scenery",
    loadTrackStepped: "Track",
    prepareMenuCarAssets: "Cars",
    introPlan: "Flyby plan",
    introWarmPrograms: "Programs",
    lampBake: "Lighting",
    introPrepare: "Prepare",
    introBuild: "Build",
    introWarm: "Warm intro",
    introGarage: "Garage intro",
    flyby: "Flyby",
    studioDone: "Garage",
    studioOpen: "Garage open",
    warmCarAssets: "Car warm",
    debrisPrime: "Debris",
    mirrorPrepare: "Mirror",
    gridCountdown: "Grid",
  };

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

  function softwareRaster() {
    try {
      return typeof PerfGov !== "undefined" && !!(PerfGov.softwareRaster && PerfGov.softwareRaster());
    } catch (_) { return false; }
  }

  function armIntroBudget(tag) {
    if (tag) entryKind = String(tag);
    introBudgetArmed = true;
    introBudgetT0 = now();
    introBudgetMs = softwareRaster() ? INTRO_BUDGET_SOFT_MS : INTRO_BUDGET_HW_MS;
  }

  function introBudgetLeft() {
    if (!introBudgetArmed) return INTRO_BUDGET_HW_MS;
    return Math.max(0, introBudgetMs - (now() - introBudgetT0));
  }

  function introBudgetExpired() {
    return introBudgetArmed && introBudgetLeft() <= 0;
  }

  function setProgressSink(fn) {
    progressSink = typeof fn === "function" ? fn : null;
  }

  function stagesFromSnapshot(snap) {
    const rows = [];
    for (const leg of snap.legs || []) {
      if (!leg || !(leg.ms >= 0)) continue;
      rows.push({ n: leg.n, ms: +leg.ms, kind: "leg" });
    }
    const marks = snap.marks || [];
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      if (!m || !/:start$/.test(m.n)) continue;
      const base = m.n.slice(0, -6);
      const e = marks.slice(i + 1).find((x) => x && x.n === base + ":end");
      rows.push({
        n: base,
        ms: e ? +((e.t - m.t)).toFixed(2) : null,
        kind: "span",
        open: !e,
      });
    }
    return rows;
  }

  function stageTable(snap) {
    const s = snap || snapshot();
    const stages = stagesFromSnapshot(s);
    const totalMs = s.windowMs || 0;
    return {
      entry: entryKind,
      software: softwareRaster(),
      budgetMs: introBudgetMs,
      budgetLeftMs: introBudgetT0 ? +introBudgetLeft().toFixed(2) : null,
      windowMs: totalMs,
      stages,
      blockMs: s.blockMs,
      maxBlockMs: s.maxBlockMs,
    };
  }

  function diffStages(raceSnap, practiceSnap) {
    const a = stagesFromSnapshot(raceSnap || snapshot());
    const b = stagesFromSnapshot(practiceSnap || { legs: [], marks: [] });
    const names = new Set([...a.map((r) => r.n), ...b.map((r) => r.n)]);
    const rows = [];
    for (const n of names) {
      const ra = a.find((r) => r.n === n);
      const pb = b.find((r) => r.n === n);
      const raceMs = ra && ra.ms != null ? ra.ms : null;
      const practiceMs = pb && pb.ms != null ? pb.ms : null;
      rows.push({
        n,
        raceMs,
        practiceMs,
        deltaMs: raceMs != null && practiceMs != null ? +(raceMs - practiceMs).toFixed(2) : null,
      });
    }
    rows.sort((x, y) => Math.abs(y.deltaMs || 0) - Math.abs(x.deltaMs || 0));
    return { entryRace: raceSnap && raceSnap.entry, entryPractice: practiceSnap && practiceSnap.entry, rows };
  }

  function begin(tag) {
    disarmObserver();
    generation++; presentationEnabled = true;
    uiPending = false;
    legs = [];
    marks = [];
    longTasks = [];
    sawWarming = false;
    sawReady = false;
    endAfterReady = 0;
    winT0 = now(); winT1 = winT0;
    lapT0 = winT0;
    armed = true;
    armIntroBudget(tag);
    armObserver();
    if (tag) pushMark("begin:" + tag);
  }

  /** Arm on the UI Start Race tap so cover→paint marks survive until startRace.
   *  startRace's runSession uses continueWindow once; a later startRace still
   *  calls begin() so generation bumps and old observers are dropped. */
  function beginUi(tag) {
    if (armed) { mark("ui:tap"); return; }
    menuEntrySession = true;
    begin(tag || "uiStart");
    uiPending = true;
    mark("entry:" + (entryKind || tag || "ui"));
  }

  function continueWindow(tag) {
    const resumeMenu = marks.some((m) => /^entry:/.test(m.n));
    if ((armed && uiPending) || resumeMenu) {
      if (!armed) {
        armed = true;
        disarmObserver();
        generation++;
        armObserver();
      }
      uiPending = false;
      if (tag) pushMark("begin:" + tag);
      presentationEnabled = false;
      return;
    }
    begin(tag);
  }

  function clearMenuEntrySession() {
    menuEntrySession = false;
  }

  /** Yield so #loading can paint before ensure* / intro sync work.
   *  https://developer.chrome.com/blog/use-scheduler-yield — Safari: rAF+timeout. */
  function afterPaint() {
    mark("ui:cover");
    const done = () => { mark("ui:painted"); };
    if (typeof scheduler !== "undefined" && scheduler.yield) {
      return scheduler.yield().then(done, done);
    }
    if (typeof requestAnimationFrame === "function") {
      return new Promise((r) => {
        requestAnimationFrame(() => { setTimeout(r, 0); });
      }).then(done, done);
    }
    return Promise.resolve().then(done);
  }

  function end() {
    if (!armed) return;
    winT1 = now();
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
    if (progressSink && /:end$/.test(n)) {
      const base = n.slice(0, -4);
      try { progressSink(STAGE_LABELS[base] || base); } catch (_) { /* UI only */ }
    }
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
    if (menuEntrySession || !armed || !sawReady) return;
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
    const mine = generation;
    mark(name + ":start");
    try { return await fn(); }
    finally { if (mine === generation) mark(name + ":end"); }
  }

  /** Lower the handoff card on the first painted present; tick the window.
   *  Context-loss fail-fast: a lost device never presents, so treat ctxLost as
   *  !warming and drop the handoff — otherwise HUD surveys wait forever. */
  function afterPresent(screen, gfx, preparing = false) {
    const handoff = screen.phase() === "handoff", watching = armed && presentationEnabled;
    if (handoff || watching) {
      let lost = false;
      try { const s = gfx && gfx.backendState && gfx.backendState(); lost = !!(s && s.ctxLost); } catch (_) { lost = false; }
      const warming = !lost && (preparing || !!(gfx.warming && gfx.warming()));
      if (watching) notePresent(warming);
      if (handoff && !warming) { mark(lost ? "handoff:lower-lost" : "handoff:lower"); screen.stop(); }
    }
    tickFrame();
  }

  /** Latch identity and profiler ownership survive duplicate/superseded starts. */
  function runSession(sessionEntry, key, scenery, body, stillWanted, onFail) {
    let owner = 0;
    const owns = () => owner !== 0 && owner === generation;
    const request = sessionEntry.begin("race", key, async () => {
      // Keep ui:cover / ui:painted from the Start Race tap when present.
      continueWindow("startRace"); owner = generation; presentationEnabled = false;
      mark("ensureScenery:start");
      try { return await scenery(); }
      finally { if (owns()) mark("ensureScenery:end"); }
    }, body, stillWanted, (e) => {
      if (owns()) end();
      onFail(e);
    });
    request.outcome.then((result) => {
      if (!owns()) return;
      if (result.kind !== "committed" || !sessionEntry.owns(result)) { clearMenuEntrySession(); end(); }
      else { mark("session:committed"); clearMenuEntrySession(); presentationEnabled = true; }
    }, () => { if (owns()) { clearMenuEntrySession(); end(); } });
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
      entry: entryKind,
      winT0,
      legs: legs.slice(),
      marks: marks.slice(),
      longTasks: longTasks.slice(),
      blockMs: blockMs(),
      maxBlockMs: maxBlockMs(),
      supported,
      armed,
      windowMs: armed || marks.length ? +((armed ? now() : winT1) - winT0).toFixed(2) : 0,
      budgetMs: introBudgetMs,
      budgetLeftMs: introBudgetT0 ? +introBudgetLeft().toFixed(2) : null,
    };
  }

  return {
    begin, beginUi, continueWindow, afterPaint, end, lap, mark, notePresent, tickFrame,
    requestWarm, raiseHandoff, span, spanAsync, afterPresent, runSession, clearMenuEntrySession,
    snapshot, stageTable, diffStages, stagesFromSnapshot,
    introBudgetLeft, introBudgetExpired, setProgressSink, softwareRaster,
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
