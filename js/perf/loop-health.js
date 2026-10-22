/* Apex 26 — LoopHealth: the frame-loop fault policy and the one heartbeat that
   outlives the loop. A run of consecutive frame faults is tolerated (a null
   player in the async startRace window heals on the next frame) and any clean
   frame pays it back; at the cap the loop reports and rethrows, so a
   deterministic fault still stops loudly. The glacial-frame watchdog below is
   the complement for the OTHER death: a loop whose frames all COMPLETE, so
   fault() is never called, but each one takes seconds (a weak or software
   GPU) — no fault, no context loss, no telemetry, a frozen game forever.
   The heartbeat exists because every
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

  // ── Glacial-frame watchdog ────────────────────────────────────────────────
  // The gap between two clean() stamps IS the previous frame's duration, and
  // a streak of them is the one stall signal that survives the warning in
  // state() below: a single long gap proves nothing (a compositor-driven
  // headless page, a shader compile, a GC pause — or a hidden tab, where rAF
  // stops and clean() is simply never called), but five frames IN A ROW each
  // taking a second or more is a loop that provably advanced, repeatedly, at
  // a pace no hardware plays at. That is the weak/software-GPU freeze: every
  // frame completes, so the fault caps above never see it.
  // 1000 ms is 4x the slowest healthy frame worth tolerating (100–250 ms on
  // a struggling phone) and 60x a 60 fps frame, so a hitch or two cannot
  // build the streak; 5 in a row is >= ~5 s of wall time spent glacial.
  const GLACIAL_FRAME_MS = 1000;
  const GLACIAL_STREAK_CAP = 5;
  // A single gap this large is not pace evidence at all: 30 s is 3x the
  // worst glacial frame in the field report (2–10 s) and the signature of a
  // SUSPENDED page — hidden tab, OS sleep, a paused debugger — whose return
  // says nothing about rendering. It resets the streak outright instead of
  // counting as one glacial frame, as does a frame that completes while the
  // page is hidden. If the pace really is glacial, the frames that follow
  // rebuild the streak in seconds.
  const SUSPEND_GAP_MS = 30000;
  // Re-arm takes a SUSTAINED recovery, not one fast frame between glacial
  // bursts (a cheap menu frame in a glacial stretch must not re-arm): 30
  // consecutive sub-glacial frames is half a second at 60 fps and 7.5 s even
  // at the top of the healthy-slow band.
  const REARM_HEALTHY_FRAMES = 30;

  let run = 0;
  let total = 0;
  let frames = 0;
  let lastCleanAt = 0;
  let lastFaultAt = 0;
  let lastMsg = "";
  let stopped = false;
  let glacialRun = 0;
  let healthyRun = 0;
  let glacialStalled = false;

  function now() {
    try { return performance.now(); } catch (_) { return Date.now(); }
  }

  function pageHidden() {
    try { return typeof document !== "undefined" && !!document.hidden; } catch (_) { return false; }
  }

  // Escalate ONE glacial episode: log it, and hand the shell's error card the
  // same report the tick catch hands it for a fatal fault. Report only — the
  // watchdog never stops the loop, reloads or sheds quality; acting on the
  // stall (a governor downgrade) is a consumer's job, state() is its signal.
  function escalateGlacial(gapMs) {
    glacialStalled = true;
    const err = new Error(
      `glacial frame stall: ${glacialRun} consecutive frames took >= ${GLACIAL_FRAME_MS} ms each ` +
      `(last ${Math.round(gapMs)} ms) — the loop is alive but not advancing at a playable pace`);
    Log.error("game", err.message, err);
    try {
      if (typeof window !== "undefined" && window && typeof window.__apexReportError === "function") {
        window.__apexReportError("loop-health", err);
      }
    } catch (_) { /* reporting must never fault the loop it watches */ }
  }

  return {
    // A frame finished: pay the run back, stamp the heartbeat, and feed the
    // watchdog the gap since the previous finished frame
    clean() {
      run = 0;
      frames++;
      const t = now();
      const gapMs = lastCleanAt ? t - lastCleanAt : null;
      if (gapMs !== null) {
        if (pageHidden() || gapMs >= SUSPEND_GAP_MS) {
          glacialRun = 0;
          healthyRun = 0;
        } else if (gapMs >= GLACIAL_FRAME_MS) {
          glacialRun++;
          healthyRun = 0;
          if (glacialRun >= GLACIAL_STREAK_CAP && !glacialStalled) escalateGlacial(gapMs);
        } else {
          glacialRun = 0;
          healthyRun++;
          if (glacialStalled && healthyRun >= REARM_HEALTHY_FRAMES) {
            glacialStalled = false;
            healthyRun = 0;
          }
        }
      }
      lastCleanAt = t;
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
        glacialStreak: glacialRun,
        stalled: glacialStalled,
        lastFault: lastMsg,
        // null, NOT 0: no frame has completed, so there is nothing to be stale
        staleMs: lastCleanAt ? Math.round(now() - lastCleanAt) : null,
      };
    },
  };
})();
