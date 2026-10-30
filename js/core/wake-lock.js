/* Apex 26 — RaceWakeLock: asynchronous screen wake-lock ownership.
   A late grant must release after quit/hide; old release events cannot erase replacements. */
const RaceWakeLock = (function () {
"use strict";
function releaseLock(lock, message) {
  try {
    // release() returns a promise: synchronous try/catch alone leaves a
    // rejected release unhandled, including grants arriving after quit.
    Promise.resolve(lock.release()).catch(() => { Log.info("game", message); });
  } catch (e) { Log.info("game", message); }
}
function create() {
// SCREEN WAKE LOCK for a race; browsers release it whenever the page hides.
let raceWake = null;
let raceWakePending = null;
let raceWakeWanted = false;
let raceWakeOnRelease = null;
function clearReleaseListener(lock) {
  if (lock && raceWakeOnRelease) {
    try { lock.removeEventListener("release", raceWakeOnRelease); } catch (_) { /* sentinel may be dead */ }
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
      // An old sentinel may release after a replacement exists: compare identity.
      // UA may release a visible document (battery / power saver) with no
      // visibilitychange. Re-arm next turn so a hide in this turn is seen.
      // drop() will not re-arm: it nulls raceWake and clears wanted first.
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
  } catch (e) { /* unsupported or refused: the screen just sleeps as normal */ }
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
