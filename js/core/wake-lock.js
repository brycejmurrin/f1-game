const RaceWakeLock = (function () {
"use strict";
function releaseLock(lock, message) {
  try {
    Promise.resolve(lock.release()).catch(() => { Log.info("game", message); });
  } catch (e) { Log.info("game", message); }
}
function create() {
let raceWake = null;
let raceWakePending = null;
let raceWakeWanted = false;
let raceWakeOnRelease = null;
function clearReleaseListener(lock) {
  if (lock && raceWakeOnRelease) {
    try { lock.removeEventListener("release", raceWakeOnRelease); } catch (_) {  }
    raceWakeOnRelease = null;
  }
}
function hold() {
  raceWakeWanted = true;
  try {
    if (!navigator.wakeLock || raceWake || raceWakePending) return;
    const pending = navigator.wakeLock.request("screen");
    raceWakePending = pending;
    pending.then((lock) => {
      if (raceWakePending === pending) raceWakePending = null;
      if (!raceWakeWanted || document.hidden) {
        releaseLock(lock, "late wake-lock release failed");
        return;
      }
      clearReleaseListener(lock);
      raceWake = lock;
      raceWakeOnRelease = () => {
        if (raceWake !== lock) return;
        clearReleaseListener(lock);
        raceWake = null;
        if (!raceWakeWanted || (typeof document !== "undefined" && document.hidden)) return;
        setTimeout(() => {
          if (!raceWakeWanted || raceWake || raceWakePending) return;
          if (typeof document !== "undefined" && document.hidden) return;
          hold();
        }, 0);
      };
      lock.addEventListener("release", raceWakeOnRelease);
    }).catch(() => { if (raceWakePending === pending) raceWakePending = null; });
  } catch (e) {  }
}
function drop() {
  raceWakeWanted = false;
  const held = raceWake;
  raceWake = null;
  if (held) {
    clearReleaseListener(held);
    releaseLock(held, "wake lock was already released");
  }
}

return { hold, drop, wanted: () => raceWakeWanted };
}
  return { create };
})();
Object.freeze(RaceWakeLock);
