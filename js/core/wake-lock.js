/* Apex 26 — RaceWakeLock: asynchronous screen wake-lock ownership.
   A late grant must release after quit/hide; old release events cannot erase replacements. */
const RaceWakeLock = (function () {
"use strict";
function create() {
// SCREEN WAKE LOCK for a race; browsers release it whenever the page hides.
let raceWake = null;
let raceWakePending = null;
let raceWakeWanted = false;
function hold() {
  raceWakeWanted = true;
  try {
    if (!navigator.wakeLock || raceWake || raceWakePending) return;
    const pending = navigator.wakeLock.request("screen");
    raceWakePending = pending;
    pending.then((lock) => {
      if (raceWakePending === pending) raceWakePending = null;
      if (!raceWakeWanted || document.hidden) {
        try { lock.release(); } catch (e) { Log.info("game", "late wake-lock release failed"); }
        return;
      }
      raceWake = lock;
      // An old sentinel may release after a replacement exists: compare identity.
      lock.addEventListener("release", () => { if (raceWake === lock) raceWake = null; });
    }).catch(() => { if (raceWakePending === pending) raceWakePending = null; });
  } catch (e) { /* unsupported or refused: the screen just sleeps as normal */ }
}
function drop() {
  raceWakeWanted = false;
  const held = raceWake;
  raceWake = null;
  try { if (held) held.release(); } catch (e) { Log.info("game", "wake lock was already released"); }
}

return { hold, drop, wanted: () => raceWakeWanted };
}
  return { create };
})();
Object.freeze(RaceWakeLock);
