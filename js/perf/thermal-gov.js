/* Apex 26 — ThermalGov: two pure, clock-free helpers for a phone that throttles
   over a long session (#2652). Neither touches physics, the renderer or storage.

   drift(): a slow-drift detector. The governor reacts to frame MISSES; a phone
   that is slowly heating gets there minutes later than its cost curve says.
   Frames are cut into WINDOW_MS windows by their own durations, each window
   reduces to its p50, the first BASE_WINDOWS (after WARM_WINDOWS of settling)
   fix the baseline, and an EMA of later window p50s above baseline*(1+OVER)
   (and at least MIN_OVER_MS above it) says "due". It only SAYS due: the
   governor decides whether a rung may move and acks with stepped(), which
   re-baselines on the cheaper state and starts a cooldown. Vsync-bound p50 is
   flat at the refresh interval until the work no longer fits it, so this reads
   drift earlier than a miss streak but not before the frame budget is tight.

   renderGate(): the opt-in 45 / 30 fps render-rate tier. Physics stays on its
   fixed 1/60 s steps in game.js; the gate only decides, per rAF frame, whether
   this one draws. It earns RATE/1 credits per second and draws when a whole
   credit is banked, so 45 is 3 of every 4 frames and 30 every 2nd on a 60 Hz
   display, and a 120 Hz one still lands on the chosen rate. A drawn frame gets
   the wall time since the last draw, so camera and visual damping run on the
   same clock as at 60. */
const ThermalGov = (() => {
  "use strict";

  const WINDOW_MS = 10000;
  const WARM_WINDOWS = 1;        // the first window is shader warm-up and the intro: not the baseline
  const BASE_WINDOWS = 6;        // the first minute after it
  const EMA_ALPHA = 0.15;        // ~6 windows: a minute, not a hitch
  const OVER = 0.12;             // 12 % slower than the baseline p50 ...
  const MIN_OVER_MS = 1.0;       // ... and by at least a millisecond (a 60 fps floor jitters by less)
  const COOL_WINDOWS = 6;        // after a step, one minute before it may fire again
  const MAX_STEPS = 4;           // the ladder is finite; a session never needs more
  const MIN_WINDOW_FRAMES = 20;  // a window of a few frames (a menu stall) is no evidence

  function drift() {
    let buf = [], ms = 0, win = 0, base = [], baseline = 0, ema = 0, cool = 0, steps = 0, due = false;
    function p50(a) { a.sort((x, y) => x - y); return a[a.length >> 1]; }
    function closeWindow() {
      const ok = buf.length >= MIN_WINDOW_FRAMES;
      const m = ok ? p50(buf) : 0;
      buf = []; ms = 0; win++;
      if (!ok || win <= WARM_WINDOWS) return;
      if (!baseline) {
        base.push(m);
        if (base.length >= BASE_WINDOWS) { baseline = p50(base.slice()); ema = baseline; }
        return;
      }
      ema += (m - ema) * EMA_ALPHA;
      if (cool > 0) { cool--; return; }
      if (steps < MAX_STEPS && ema > baseline * (1 + OVER) && ema - baseline >= MIN_OVER_MS) due = true;
      else due = false;
    }
    return {
      /** One frame interval in ms. Returns true while a step is due and not yet acked. */
      feed(frameMs) {
        if (!(frameMs > 0)) return due;
        buf.push(frameMs); ms += frameMs;
        if (ms >= WINDOW_MS) closeWindow();
        return due;
      },
      /** The governor moved a rung: measure the cheaper state afresh and wait a minute. */
      stepped() { steps++; due = false; baseline = 0; base = []; ema = 0; cool = COOL_WINDOWS; win = 0; buf = []; ms = 0; },
      /** The session restarted (new race): forget everything. */
      reset() { buf = []; ms = 0; win = 0; base = []; baseline = 0; ema = 0; cool = 0; steps = 0; due = false; },
      state() { return { baseline, ema, due, steps, windows: win, cooling: cool > 0 }; },
    };
  }

  const RATES = [60, 45, 30];
  const WARM_FRAMES = 90;        // the race-entry handoff and first presents always draw
  const MAX_GAP_S = 1 / 20;      // render()'s own dt clamp; one drawn frame never carries more

  function renderGate(initialRate) {
    let rate = RATES.indexOf(initialRate) >= 0 ? initialRate : 60;
    let credit = 0, since = 0, live = 0, drawn = 0, skipped = 0;
    return {
      rate: () => rate,
      setRate(r) { if (RATES.indexOf(r) < 0) return false; rate = r; credit = 0; return true; },
      /** dt = this rAF frame's seconds; active = a live race frame. Returns the dt to render with, or 0 to skip drawing. */
      next(dt, active) {
        if (!active || rate >= 60) { credit = 0; since = 0; if (!active) live = 0; drawn++; return dt; }
        since += dt;
        if (live < WARM_FRAMES) { live++; credit = 0; const d = since; since = 0; drawn++; return d; }
        credit = Math.min(2, credit + dt * rate);
        if (credit >= 1 - 1e-6) {
          credit -= 1; const d = Math.min(since, MAX_GAP_S); since = 0; drawn++; return d > 0 ? d : dt;
        }
        skipped++;
        return 0;
      },
      reset() { credit = 0; since = 0; live = 0; },
      stats: () => ({ rate, drawn, skipped }),
    };
  }

  // The one live gate (game.js ticks it, __apex.renderRate() sets it).
  return { drift, renderGate, gate: renderGate(60), RATES, WINDOW_MS };
})();
