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
  //   SHED_RUN   — drop to the lowest quality rung for this session and latch
  //                the same lighter-renderer keys a context loss writes;
  //   RELOAD_RUN — still glacial after the shed: reload once per tab session
  //                (apex26.stallReloads, the ctxLostReloads shape), which hands
  //                the player back a working menu with the "Graphics reset"
  //                notice. With the budget spent it only records and logs.
  // Off under automation (navigator.webdriver): software-GL CI presents
  // multi-second frames on purpose and a reload there would kill the spec.
  // ?stallwatch=1 or apex26.stallWatch=1 forces it on (the reproduction).
  const SLOW_MS = 1000;
  const SUSPEND_MS = 60000;
  const SHED_RUN = 4;
  const RELOAD_RUN = 10;
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

  function now() {
    try { return performance.now(); } catch (_) { return Date.now(); }
  }
  function visible() {
    try { return typeof document === "undefined" || document.visibilityState !== "hidden"; } catch (_) { return true; }
  }
  function watching() {
    if (watchOn !== null) return watchOn;
    let forced = false, auto = true;
    try { forced = /[?&]stallwatch=1\b/.test(location.search) || localStorage.getItem("apex26.stallWatch") === "1"; } catch (_) { /* no location/storage */ }
    try { auto = !(typeof navigator !== "undefined" && navigator.webdriver); } catch (_) { /* no navigator */ }
    return (watchOn = forced || auto);
  }
  try {
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => { prevCleanAt = 0; slowRun = 0; });
    }
  } catch (_) { /* no document in a harness */ }

  function shed() {
    sheds++; stallAct = "shed";
    Log.warn("game", `stall watchdog: ${slowRun} frames over ${SLOW_MS} ms (worst ${Math.round(worstMs)} ms) — shedding to the lowest quality rung`);
    try { if (typeof PerfGov !== "undefined" && PerfGov.setUserTier) PerfGov.setUserTier(4); } catch (_) { /* no governor in a harness */ }
    try { localStorage.setItem("apex26.envProbeOff", "1"); localStorage.setItem("apex26.perChunkOff", "1"); } catch (_) { /* blocked storage: the session shed stands */ }
  }
  function reload() {
    let spent = 0;
    try { spent = parseInt(sessionStorage.getItem(RELOAD_KEY), 10) || 0; } catch (_) { spent = RELOAD_BUDGET; }
    if (spent >= RELOAD_BUDGET) {
      stallAct = "budget";
      Log.warn("game", `stall watchdog: still ${slowRun} frames over ${SLOW_MS} ms after the shed; reload budget spent`);
      return;
    }
    stallReloads++; stallAct = "reload";
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
      if (slowRun === SHED_RUN) shed();
      else if (slowRun === RELOAD_RUN) reload();
    } else slowRun = 0;
  }

  return {
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
        // the last response ("shed" | "reload" | "budget" | "")
        stall: { watching: watching(), slowRun, slowFrames, worstMs: Math.round(worstMs), sheds, reloads: stallReloads, act: stallAct, slowMs: SLOW_MS, shedRun: SHED_RUN, reloadRun: RELOAD_RUN },
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
