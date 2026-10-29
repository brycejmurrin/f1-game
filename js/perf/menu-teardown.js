/* Apex 26 — MenuTeardown: software-GL readback cover, sync-task probes, and
   UI-yield helpers for quit-to-menu and garage-close teardown. */
const MenuTeardown = (function () {
  "use strict";

  const QUIT = 1;
  const GARAGE = 2;
  const MAX_MS = 180000;
  const SYNC_WARN_MS = 50;
  let mask = 0;
  let timer = 0;
  let lastSync = null;
  const syncLog = [];

  function software() {
    try { return typeof PerfGov !== "undefined" && PerfGov.softwareRaster && PerfGov.softwareRaster(); }
    catch (_) { return false; }
  }
  function now() {
    try { return performance.now(); } catch (_) { return Date.now(); }
  }
  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = 0; }
  }
  function arm(bit) {
    if (!software()) return;
    mask |= bit;
    clearTimer();
    timer = setTimeout(() => { mask &= ~bit; if (!mask) clearTimer(); }, MAX_MS);
  }
  function release(bit) {
    mask &= ~bit;
    if (!mask) clearTimer();
  }
  function noteSync(label, ms) {
    if (ms < SYNC_WARN_MS) return;
    const row = { label, ms: Math.round(ms), t: Math.round(now()) };
    lastSync = row;
    syncLog.push(row);
    if (syncLog.length > 24) syncLog.shift();
    try { Log.warn("game", "menu teardown sync " + label + " " + row.ms + " ms"); } catch (_) { /* harness */ }
    try { if (typeof LoopHealth !== "undefined" && LoopHealth.noteSync) LoopHealth.noteSync(ms, label); } catch (_) { /* harness */ }
  }
  function runSync(label, fn) {
    const t0 = now();
    try { return fn(); }
    finally { noteSync(label, now() - t0); }
  }
  function pauseSheetUp() {
    if (!software()) return false;
    try {
      const pm = typeof document !== "undefined" && document.getElementById && document.getElementById("pausemenu");
      return !!(pm && !pm.hidden);
    } catch (_) { return false; }
  }
  function cover() {
    if (!software()) return false;
    if (mask !== 0) return true;
    return pauseSheetUp();
  }
  function garageBusyPlate() {
    return !software();
  }
  function deferUi(fn) {
    if (!software()) { fn(); return; }
    const run = () => { try { fn(); } catch (e) { try { Log.error("game", "menu teardown defer failed", e); } catch (_) { throw e; } } };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(run, 0));
    else setTimeout(run, 0);
  }
  function beginQuit() {
    try { if (typeof PauseOpts !== "undefined" && PauseOpts.disarm) PauseOpts.disarm(); } catch (_) { /* harness */ }
    arm(QUIT);
  }
  function endQuit() {
    if (!software()) { release(QUIT); return; }
    clearTimer();
    const finish = () => release(QUIT);
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(finish));
    else setTimeout(finish, 32);
  }
  function beginGarageClose() { arm(GARAGE); }
  function endGarageClose() { release(GARAGE); }
  function deferQuitTail(fn) {
    if (!software()) return false;
    deferUi(() => { try { fn(); } finally { endQuit(); } });
    return true;
  }
  function report() {
    return {
      cover: cover(),
      mask,
      pauseSheet: pauseSheetUp(),
      lastSync,
      syncLog: syncLog.slice(-12),
    };
  }

  // pauseSheetUp stays module-local (cover/report call it); report remains the probe seam.
  return {
    cover, garageBusyPlate, runSync, deferUi, deferQuitTail, report,
    beginQuit, endQuit, beginGarageClose, endGarageClose,
  };
})();
Object.freeze(MenuTeardown);
