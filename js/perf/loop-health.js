/* Apex 26 — FRAME-LOOP FAULT POLICY + the one heartbeat that outlives the loop.
 *
 * The old policy was "one throw kills the render loop": tick() reported through
 * the full-screen overlay and rethrew, on the reasoning that a deterministic
 * fault must not repaint that overlay 60x/s. That is right about a deterministic
 * fault and wrong about a transient one — and round 13 shipped a transient one.
 * `startRace` became async (it awaits ensureScenery), so update() can tick in
 * the window before makeCars runs, dereference a null player, and take the whole
 * game down for a condition that heals on the very next frame.
 *
 * So: bounded tolerance, the shape this codebase already uses for retries —
 * js/perf/governor.js caps crash-sentinel strikes and lets clean races pay them
 * back; js/render/glx/glx.js bounds context-loss reloads at two per tab session.
 * A run of consecutive faults is tolerated and any CLEAN frame pays the run
 * back to zero; at the cap the loop reports and rethrows exactly as before, so
 * a deterministic fault still stops loudly.
 *
 * THE HEARTBEAT IS THE OTHER HALF, and it is why this file exists rather than a
 * counter inside game.js. When the loop does die, every existing surface still
 * reports health: PerfGov.fpsEMA() is written only inside PerfGov.tick, whose
 * sole caller is the dead loop, so it FREEZES at its last healthy value while
 * the METRICS and ?gfxdebug=1 overlays — both on their own setInterval — keep
 * painting a plausible 60 fps over a frozen canvas. Decaying fpsEMA is not the
 * fix: PerfGov.tick is deliberately gated on `!paused && (race || count)`, so a
 * frozen fps is CORRECT in a menu and a decay would report false stalls there.
 *
 * The honest heartbeat is a stamp taken when a frame COMPLETES. Note it is not
 * game.js's `lastFrame`, which looks like the obvious candidate and is not: that
 * is assigned at the top of tickBody, before the body runs, so a loop throwing
 * on every single frame keeps refreshing it and reads perfectly alive. Only
 * clean() below is reached by a frame that finished.
 *
 * staleMs is null until the first clean frame — "I have not measured a frame
 * yet" is a different answer from "0 ms since the last one", and this project
 * has now paid for that distinction five times (docs/PERF-FINDINGS.md 2j).
 *
 * `frames` is the liveness signal and staleMs is only colour. A millisecond
 * threshold cannot tell a dead loop from a slow one: measured 2026-08-31 in
 * this container, a perfectly healthy headless page reported staleMs 6993 with
 * the loop running, because rAF there is driven by a compositor that barely
 * ticks — any "stalled if > 1 s" rule would have called that machine dead and
 * would call a struggling phone dead too. A COUNT that does not advance between
 * two observations is a stall on any hardware, at any frame rate.
 */
"use strict";
const LoopHealth = (() => {
  // Consecutive throws tolerated before the loop stops. The transient shapes
  // this exists for (a null player during the async startRace window) heal in
  // one frame; 8 is generous for those and still an eighth of a second.
  const RUN_CAP = 8;
  // …and an absolute ceiling, because a run counter that any clean frame
  // resets can never stop a fault that alternates clean/throw — that loop
  // would log forever at 30 Hz and never reach RUN_CAP. 240 is four seconds
  // of a half-broken loop, which is long enough to be a transient hiccup and
  // short enough that nobody plays through it.
  const TOTAL_CAP = 240;
  // Log the first few faults, then thin out: the point is a record in the ring
  // buffer __apex.logs() reads, not 60 identical console lines a second.
  const LOG_FIRST = 5, LOG_EVERY = 60;

  let _run = 0, _total = 0, _frames = 0, _lastClean = 0, _lastMsg = "", _stopped = false;

  function now() {
    try { return performance.now(); } catch (_) { return Date.now(); }
  }

  return {
    // A frame finished. Pay the run back and stamp the heartbeat.
    clean() { _run = 0; _frames++; _lastClean = now(); },

    // A frame threw. Returns TRUE if the caller should schedule another frame,
    // FALSE if this fault is at the cap and the loop must report and rethrow.
    fault(e) {
      _total++; _run++;
      _lastMsg = String((e && (e.message || e)) || "?").slice(0, 200);
      const survive = _run < RUN_CAP && _total < TOTAL_CAP;
      if (_total <= LOG_FIRST || _total % LOG_EVERY === 0 || !survive) {
        Log.error("game", "frame fault " + _run + "/" + RUN_CAP +
          " (total " + _total + "/" + TOTAL_CAP + ")" +
          (survive ? "" : " — CAP REACHED, stopping the loop"), e);
      }
      if (!survive) _stopped = true;
      return survive;
    },

    // Read by js/perf/gfx-debug-overlay.js, which runs on setInterval and is therefore
    // the one surface that still paints after the loop is gone.
    state() {
      return {
        frames: _frames,
        faults: _total, run: _run, cap: RUN_CAP, totalCap: TOTAL_CAP,
        stopped: _stopped, lastFault: _lastMsg,
        // null, NOT 0: no frame has completed, so there is nothing to be stale.
        staleMs: _lastClean ? Math.round(now() - _lastClean) : null,
      };
    },
  };
})();
