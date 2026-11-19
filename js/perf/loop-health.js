const LoopHealth = (() => {
  "use strict";

  const RUN_CAP = 8;
  const TOTAL_CAP = 240;
  const LOG_FIRST = 5;
  const LOG_EVERY = 60;
  const QUIET_RESET_MS = 4000;

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
  let recoveries = 0;
  let slowRun = 0;
  let slowFrames = 0;
  let worstMs = 0;
  let sheds = 0;
  let stallReloads = 0;
  let stallAct = "";
  let prevCleanAt = 0;
  let watchOn = null;
  let shedRun = false;
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
    try { forced = /[?&]stallwatch=1\b/.test(location.search) || localStorage.getItem("apex26.stallWatch") === "1"; } catch (_) {  }
    try { off = /[?&]stallwatch=0\b/.test(location.search) || localStorage.getItem("apex26.stallWatch") === "0"; } catch (_) {  }
    try { auto = !(typeof navigator !== "undefined" && (navigator.webdriver || /apex-game-vm/.test(navigator.userAgent || ""))); } catch (_) {  }
    return (watchOn = forced || (!off && auto));
  }
  try {
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => { prevCleanAt = 0; slowRun = 0; shedRun = reloadRun = false; });
    }
  } catch (_) {  }

  function loading() {
    try { const el = typeof document !== "undefined" && document.getElementById && document.getElementById("loading"); return !!(el && !el.hidden); } catch (_) { return false; }
  }
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
  function raceEntryHandoffCover() {
    try {
      if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.stallHandoffCover) return RaceEntryProfile.stallHandoffCover();
    } catch (_) {  }
    return false;
  }
  function slowPathCover() {
    if (loading()) return true;
    if (raceEntryHandoffCover()) return true;
    try {
      if (typeof MenuTeardown !== "undefined" && MenuTeardown.cover()) return true;
    } catch (_) {  }
    try {
      if (typeof document === "undefined" || !document.getElementById) return false;
      const cs = document.getElementById("carsetup");
      if (cs && !cs.hidden) return true;
      const rs = document.getElementById("race-settings");
      return !!(rs && !rs.hidden);
    } catch (_) { return false; }
  }
  function shed() {
    sheds++; stallAct = "shed"; shedRun = true;
    Log.warn("game", `stall watchdog: ${slowRun} frames over ${SLOW_MS} ms (worst ${Math.round(worstMs)} ms) — shedding to the lowest quality rung`);
    try { if (typeof PerfGov !== "undefined" && PerfGov.setUserTier) PerfGov.setUserTier(4); } catch (_) {  }
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
    try { localStorage.setItem("apex26.envProbeOff", "1"); localStorage.setItem("apex26.perChunkOff", "1"); } catch (_) {  }
    Log.warn("game", `stall watchdog: still glacial after the shed (worst ${Math.round(worstMs)} ms) — reloading to the menu`);
    try { sessionStorage.setItem(RELOAD_KEY, String(spent + 1)); sessionStorage.setItem(NOTICE_KEY, "1"); } catch (_) {  }
    try { location.reload(); } catch (_) {  }
  }
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
    clean() {
      run = 0;
      frames++;
      lastCleanAt = now();
      watch(lastCleanAt);
      if (total && !stopped && lastCleanAt - lastFaultAt > QUIET_RESET_MS) total = 0;
    },

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

    recover() {
      if (!stopped) return false;
      let armed = false;
      try { armed = typeof XrBoot !== "undefined" && XrBoot.chainWindowRaf() === true; } catch (_) {  }
      if (!armed) return false;
      run = 0; total = 0; stopped = false; recoveries++;
      prevCleanAt = 0; slowRun = 0; shedRun = reloadRun = false;
      Log.warn("game", `loop re-armed after the fault cap (recovery ${recoveries})`);
      return true;
    },

    state() {
      return {
        frames,
        faults: total,
        run,
        cap: RUN_CAP,
        totalCap: TOTAL_CAP,
        stopped,
        recoveries,
        lastFault: lastMsg,
        staleMs: lastCleanAt ? Math.round(now() - lastCleanAt) : null,
        stall: { watching: watching(), slowRun, slowFrames, worstMs: Math.round(worstMs), sheds, reloads: stallReloads, act: stallAct, slowMs: SLOW_MS, shedRun: SHED_RUN, reloadRun: RELOAD_RUN,
          syncWorstMs: Math.round(syncWorstMs), syncEvents, syncLastLabel },
      };
    },
    stallWatch(on) {
      if (on !== undefined) {
        try {
          localStorage.setItem("apex26.stallWatch", on ? "1" : "0");
          watchOn = null;
        } catch (_) {  }
      }
      return watching();
    },
  };
})();
