/* Apex 26 — LoopHealth: the frame-loop fault policy and the one heartbeat that
   outlives the loop. A run of consecutive frame faults is tolerated (a null
   player in the async startRace window heals on the next frame) and any clean
   frame pays it back; at the cap the loop reports and rethrows, so a
   deterministic fault still stops loudly. The heartbeat exists because every
   other health surface freezes when the loop dies: PerfGov.fpsEMA() is written
   only inside PerfGov.tick, so the METRICS and ?gfxdebug=1 overlays (both on
   setInterval) keep painting a plausible 60 fps over a frozen canvas. game.js's
   `lastFrame` is not the heartbeat either — it is stamped at the top of
   tickBody, so a loop throwing every frame keeps it fresh. Only clean() below
   is reached by a frame that finished. */
const LoopHealth = (() => {
  "use strict";

  // Consecutive throws tolerated before the loop stops: the transient shapes
  // this exists for heal in one frame, and 8 is still a fraction of a second.
  // These count FAULTS, not time — the same cap on any refresh rate by design.
  const RUN_CAP = 8;
  // Absolute ceiling: a run counter that any clean frame resets can never stop
  // a fault that alternates clean/throw. 240 is ~four seconds of a half-broken
  // loop at 60 fps, less on a faster display; a count, not a clock.
  const TOTAL_CAP = 240;
  // Log the first few faults, then thin out: the record is for the ring buffer
  // __apex.logs() reads, not 60 identical console lines a second
  const LOG_FIRST = 5;
  const LOG_EVERY = 60;
  // TOTAL_CAP was once a per-TAB lifetime count that was never paid back, so a
  // long PWA session whose transients each healed could have its loop killed
  // hours later by a harmless fault. A quiet stretch this long forgets the tally
  const QUIET_RESET_MS = 4000;

  // THE STALL WATCHDOG (#3510). Slow frames do not throw, so the fault policy
  // above never saw a GPU too weak for the frame cost: Time Trial on software
  // GL presented a frame every few seconds, forever, with nothing acting on it.
  // A clean-to-clean gap is only evidence while the page stays visible — a
  // hidden tab gets no frames and resets the run, and a gap past SUSPEND_MS is
  // a sleep or a debugger pause, not a frame. A run of SLOW_MS frames, counted
  // in FRAMES so a single build/shader-compile hitch never trips it:
  //   SHED_RUN   — drop to the lowest quality rung for this session;
  //   RELOAD_RUN — still glacial after the shed: latch the same lighter-
  //                renderer keys a context loss writes (read at boot) and
  //                reload once per tab session (apex26.stallReloads, the
  //                ctxLostReloads shape), which hands the player back a working
  //                menu with the "Graphics reset" notice. With the budget spent
  //                it only records and logs. On software raster (SwiftShader /
  //                llvmpipe via PerfGov.softwareRaster), reload lands on the
  //                same path and cost — act "budget-sw" skips location.reload().
  // A race entry on a weak phone is a few multi-second tasks between frames, so
  // while the loading cover (#loading) is up the shed waits and the reload needs
  // LOAD_RELOAD_RUN frames: a cover stuck over a glacial build still recovers.
  // Off under automation (navigator.webdriver) and in the node game VM
  // (tools/lib/game-vm.cjs, which reports webdriver false): software-GL CI
  // presents multi-second frames on purpose and a shed or reload there would
  // change the spec. ?stallwatch=1 or apex26.stallWatch=1 forces it on.
  const SLOW_MS = 1000;
  const SUSPEND_MS = 60000;
  const SHED_RUN = 4;
  const RELOAD_RUN = 10;
  const LOAD_RELOAD_RUN = 30;
  const RELOAD_KEY = "apex26.stallReloads";
  const RELOAD_BUDGET = 1;
  const NOTICE_KEY = "apex26.ctxLostNotice";

  let run = 0;
  let total = 0;
  let frames = 0;
  let lastCleanAt = 0;
  let lastFaultAt = 0;
  let lastMsg = "";
  let stopped = false;
  let slowRun = 0;
  let slowFrames = 0;
  let worstMs = 0;
  let sheds = 0;
  let stallReloads = 0;
  let stallAct = "";
  let prevCleanAt = 0;
  let watchOn = null;
  let shedRun = false;     // this run already shed / reloaded: once each per run
  let reloadRun = false;
  let syncWorstMs = 0;
  let syncEvents = 0;
  let syncLastLabel = "";

  function now() {
    try { return performance.now(); } catch (_) { return Date.now(); }
  }
  function visible() {
    try { return typeof document === "undefined" || document.visibilityState !== "hidden"; } catch (_) { return true; }
  }
  function watching() {
    if (watchOn !== null) return watchOn;
    let forced = false, off = false, auto = true;
    try { forced = /[?&]stallwatch=1\b/.test(location.search) || localStorage.getItem("apex26.stallWatch") === "1"; } catch (_) { /* no location/storage */ }
    // The OFF switch: a probe browser that is not flagged as automation (the
    // Playwright MCP host browser) on software GL reloaded mid-race and read as
    // a crash (UI hunt 2026-10-29 row 16). An explicit 0 beats the auto default.
    try { off = /[?&]stallwatch=0\b/.test(location.search) || localStorage.getItem("apex26.stallWatch") === "0"; } catch (_) { /* no location/storage */ }
    try { auto = !(typeof navigator !== "undefined" && (navigator.webdriver || /apex-game-vm/.test(navigator.userAgent || ""))); } catch (_) { /* no navigator */ }
    return (watchOn = forced || (!off && auto));
  }
  try {
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => { prevCleanAt = 0; slowRun = 0; shedRun = reloadRun = false; });
    }
  } catch (_) { /* no document in a harness */ }

  function loading() {
    try { const el = typeof document !== "undefined" && document.getElementById && document.getElementById("loading"); return !!(el && !el.hidden); } catch (_) { return false; }
  }
  // Race entry uses #loading; garage / race-settings sheets and MenuTeardown quit
  // cover share the relaxed reload budget (#3510 / live garage-close repro).
  function skipReloadOnSoftwareRaster() {
    try {
      return typeof PerfGov !== "undefined" && !!(PerfGov.softwareRaster && PerfGov.softwareRaster());
    } catch (_) { return false; }
  }
  function reloadAlreadyLatched() {
    try {
      return localStorage.getItem("apex26.envProbeOff") === "1" && localStorage.getItem("apex26.perChunkOff") === "1";
    } catch (_) { return false; }
  }
  // Countdown, pit intro and the first race presents after the loading cover drops.
  function raceEntryHandoffCover() {
    try {
      if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.stallHandoffCover) return RaceEntryProfile.stallHandoffCover();
    } catch (_) { /* harness */ }
    return false;
  }
  function slowPathCover() {
    if (loading()) return true;
    if (raceEntryHandoffCover()) return true;
    try {
      if (typeof MenuTeardown !== "undefined" && MenuTeardown.cover()) return true;
    } catch (_) { /* harness */ }
    try {
      const g = typeof document !== "undefined" && document.getElementById;
      if (!g) return false;
      const cs = g("carsetup");
      if (cs && !cs.hidden) return true;
      const rs = g("race-settings");
      return !!(rs && !rs.hidden);
    } catch (_) { return false; }
  }
  function shed() {
    sheds++; stallAct = "shed"; shedRun = true;
    Log.warn("game", `stall watchdog: ${slowRun} frames over ${SLOW_MS} ms (worst ${Math.round(worstMs)} ms) — shedding to the lowest quality rung`);
    try { if (typeof PerfGov !== "undefined" && PerfGov.setUserTier) PerfGov.setUserTier(4); } catch (_) { /* no governor in a harness */ }
  }
  function reload() {
    let spent = 0;
    try { spent = parseInt(sessionStorage.getItem(RELOAD_KEY), 10) || 0; } catch (_) { spent = RELOAD_BUDGET; }
    reloadRun = true;
    if (spent >= RELOAD_BUDGET) {
      stallAct = "budget";
      Log.warn("game", `stall watchdog: still ${slowRun} frames over ${SLOW_MS} ms after the shed; reload budget spent`);
      return;
    }
    if (skipReloadOnSoftwareRaster()) {
      stallAct = "budget-sw";
      Log.warn("game", `stall watchdog: still glacial after the shed (worst ${Math.round(worstMs)} ms) — reload skipped on software raster`);
      return;
    }
    if (reloadAlreadyLatched()) {
      stallAct = "budget";
      Log.warn("game", `stall watchdog: still glacial after the shed (worst ${Math.round(worstMs)} ms); lighter renderer already latched`);
      return;
    }
    stallReloads++; stallAct = "reload";
    try { localStorage.setItem("apex26.envProbeOff", "1"); localStorage.setItem("apex26.perChunkOff", "1"); } catch (_) { /* blocked storage: the reload still lands on the menu */ }
    Log.warn("game", `stall watchdog: still glacial after the shed (worst ${Math.round(worstMs)} ms) — reloading to the menu`);
    try { sessionStorage.setItem(RELOAD_KEY, String(spent + 1)); sessionStorage.setItem(NOTICE_KEY, "1"); } catch (_) { /* see the budget read */ }
    try { location.reload(); } catch (_) { /* file:// / test host */ }
  }
  // The gap since the previous completed frame, judged once per frame
  function watch(t) {
    const gap = prevCleanAt ? t - prevCleanAt : 0;
    prevCleanAt = t;
    if (!watching()) return;
    if (gap > SLOW_MS && gap < SUSPEND_MS && visible()) {
      slowRun++; slowFrames++;
      if (gap > worstMs) worstMs = gap;
      const cover = slowPathCover();
      if (!cover && !shedRun && slowRun >= SHED_RUN) shed();
      else if (!reloadRun && slowRun >= (cover ? LOAD_RELOAD_RUN : RELOAD_RUN)) reload();
    } else { slowRun = 0; shedRun = reloadRun = false; }
  }

  function noteSync(ms, label) {
    if (!watching() || !(ms > SLOW_MS)) return;
    syncEvents++;
    if (ms > syncWorstMs) syncWorstMs = ms;
    syncLastLabel = String(label || "").slice(0, 80);
    Log.warn("game", `stall watchdog: sync gap ${Math.round(ms)} ms in ${syncLastLabel} (no frame completed)`);
  }

  return {
    noteSync,
    // A frame finished: pay the run back and stamp the heartbeat
    clean() {
      run = 0;
      frames++;
      lastCleanAt = now();
      watch(lastCleanAt);
      if (total && !stopped && lastCleanAt - lastFaultAt > QUIET_RESET_MS) total = 0;
    },

    // A frame threw. TRUE: schedule another frame. FALSE: at the cap, so the
    // caller must report and rethrow
    fault(e) {
      total++;
      run++;
      lastFaultAt = now();
      lastMsg = String((e && (e.message || e)) || "?").slice(0, 200);
      const survive = run < RUN_CAP && total < TOTAL_CAP;
      if (total <= LOG_FIRST || total % LOG_EVERY === 0 || !survive) {
        Log.error("game", `frame fault ${run}/${RUN_CAP} (total ${total}/${TOTAL_CAP})` +
          (survive ? "" : " — CAP REACHED, stopping the loop"), e);
      }
      if (!survive) stopped = true;
      return survive;
    },

    // Read by js/perf/gfx-debug-overlay.js on setInterval — the one surface that
    // still paints after the loop is gone. `frames` is the liveness signal and
    // staleMs only colour: a healthy headless page measured staleMs 6993 with
    // the loop running (compositor-driven rAF), so a millisecond threshold
    // cannot tell a dead loop from a slow one, while a count that does not
    // advance between two observations is a stall on any hardware
    state() {
      return {
        frames,
        faults: total,
        run,
        cap: RUN_CAP,
        totalCap: TOTAL_CAP,
        stopped,
        lastFault: lastMsg,
        // null, NOT 0: no frame has completed, so there is nothing to be stale
        staleMs: lastCleanAt ? Math.round(now() - lastCleanAt) : null,
        // The stall watchdog: slowRun is the live run of SLOW_MS frames, act
        // the last response ("shed" | "reload" | "budget" | "budget-sw" | "")
        stall: { watching: watching(), slowRun, slowFrames, worstMs: Math.round(worstMs), sheds, reloads: stallReloads, act: stallAct, slowMs: SLOW_MS, shedRun: SHED_RUN, reloadRun: RELOAD_RUN,
          syncWorstMs: Math.round(syncWorstMs), syncEvents, syncLastLabel },
      };
    },
    // The only writer for apex26.stallWatch (automation override); invalidates the watch cache.
    stallWatch(on) {
      if (on !== undefined) {
        try {
          if (on) localStorage.setItem("apex26.stallWatch", "1");
          else localStorage.removeItem("apex26.stallWatch");
          watchOn = null;
        } catch (_) { /* blocked storage */ }
      }
      return watching();
    },
  };
})();
