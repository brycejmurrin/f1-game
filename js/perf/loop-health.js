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
  // this exists for heal in one frame, and 8 is still an eighth of a second
  const RUN_CAP = 8;
  // Absolute ceiling: a run counter that any clean frame resets can never stop
  // a fault that alternates clean/throw. 240 is four seconds of a half-broken loop
  const TOTAL_CAP = 240;
  // Log the first few faults, then thin out: the record is for the ring buffer
  // __apex.logs() reads, not 60 identical console lines a second
  const LOG_FIRST = 5;
  const LOG_EVERY = 60;
  // TOTAL_CAP was once a per-TAB lifetime count that was never paid back, so a
  // long PWA session whose transients each healed could have its loop killed
  // hours later by a harmless fault. A quiet stretch this long forgets the tally
  const QUIET_RESET_MS = 4000;

  let run = 0;
  let total = 0;
  let frames = 0;
  let lastCleanAt = 0;
  let lastFaultAt = 0;
  let lastMsg = "";
  let stopped = false;

  function now() {
    try { return performance.now(); } catch (_) { return Date.now(); }
  }

  return {
    // A frame finished: pay the run back and stamp the heartbeat
    clean() {
      run = 0;
      frames++;
      lastCleanAt = now();
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
      };
    },
  };
})();
