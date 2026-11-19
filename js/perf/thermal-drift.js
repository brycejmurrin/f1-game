const ThermalDrift = (() => {
  "use strict";

  const WINDOW_MS = 10000;
  const WARM_WINDOWS = 1;
  const BASE_WINDOWS = 6;
  const EMA_ALPHA = 0.15;
  const OVER = 0.12;
  const MIN_OVER_MS = 1.0;
  const COOL_WINDOWS = 6;
  const MAX_STEPS = 4;
  const MIN_WINDOW_FRAMES = 20;

  function drift() {
    let buf = [], ms = 0, win = 0, base = [], baseline = 0, ema = 0, cool = 0, steps = 0, due = false;
    function p50(a) { a.sort((x, y) => x - y); return a[a.length >> 1]; }
    function closeWindow() {
      const ok = buf.length >= MIN_WINDOW_FRAMES;
      const m = ok ? p50(buf) : 0;
      buf = []; ms = 0; win++;
      if (!ok || win <= WARM_WINDOWS) return;
      if (cool > 0) cool--;
      if (!baseline) {
        base.push(m);
        if (base.length >= BASE_WINDOWS) { baseline = p50(base.slice()); ema = baseline; }
        return;
      }
      ema += (m - ema) * EMA_ALPHA;
      if (cool > 0) return;
      if (steps < MAX_STEPS && ema > baseline * (1 + OVER) && ema - baseline >= MIN_OVER_MS) due = true;
      else due = false;
    }
    return {
      feed(frameMs, elapsedMs = frameMs) {
        if (!(elapsedMs > 0) || !Number.isFinite(elapsedMs)) return due;
        if (frameMs > 0 && Number.isFinite(frameMs)) buf.push(frameMs);
        ms += elapsedMs;
        if (ms >= WINDOW_MS) closeWindow();
        return due;
      },
      stepped() { steps++; due = false; baseline = 0; base = []; ema = 0; cool = COOL_WINDOWS; win = 0; buf = []; ms = 0; },
      reset() { buf = []; ms = 0; win = 0; base = []; baseline = 0; ema = 0; cool = 0; steps = 0; due = false; },
      state() { return { baseline, ema, due, steps, windows: win, cooling: cool > 0 }; },
    };
  }

  return { drift, WINDOW_MS };
})();
