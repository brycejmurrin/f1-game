"use strict";
// WakeLock — hold the screen awake for the duration of a race.
//
// WHY. Without it the system idle timer runs during a Grand Prix exactly as it
// would on any other page, so the display dims and then locks mid-race. How bad
// that is depends on how you steer, and the worst case is the mode this game is
// proudest of:
//
//   tilt           NO input events reach the OS at all — orientation is a
//                  sensor read, not user input — so the idle timer never
//                  resets and the screen always eventually dims
//   touch/buttons  a touchstart and then a long HOLD; a hold is one event, not
//                  continuous activity
//   keyboard/pad   desktop, where the idle timer is not the same problem
//
// Tilt is the mode with no input events by construction, so it is the one that
// will always time out. See docs/research/PLATFORM-INPUT-NOTES.md §9b.
//
// THE SHAPE IS COPIED, NOT INVENTED: js/net/lobby.js already holds one of these
// for the VS FRIEND waiting room (a phone that hosts falls asleep while it
// waits), and it encodes two properties that matter more than the happy path —
// tolerate the API being ABSENT (older iOS), and tolerate the request
// REJECTING, which is not guaranteed even where the API exists. Both degrade
// to "the screen may dim", never to an error.
//
// IT OWNS ITS OWN visibilitychange LISTENER, deliberately. The platform
// releases a wake lock on EVERY hide and does not give it back, so re-acquiring
// on return is not an optional extra — it is half the feature. Keeping that
// listener here rather than in game.js's handler is what lets this module hold
// no game state at all: game.js calls hold() when a race starts and drop() when
// one ends, and never thinks about it again.
window.WakeLock = (function () {

  let sentinel = null;    // the live WakeLockSentinel, or null
  let wanted = false;     // does a race currently want the screen awake?

  function hold() {
    wanted = true;
    try {
      if (!navigator.wakeLock || sentinel) return;
      navigator.wakeLock.request("screen").then((l) => {
        sentinel = l;
        // The platform can release it without us asking (hide, low battery on
        // some UAs). Clearing the handle is what lets the re-acquire below get
        // past the `|| sentinel` guard on the way back.
        l.addEventListener("release", () => { sentinel = null; });
      }).catch(() => {});
    } catch (e) {
      // Deliberately silent: a wake lock is a NICE-TO-HAVE, and every failure
      // mode here (API absent on older iOS, request rejected, a UA that throws
      // synchronously) degrades to exactly the old behaviour — the screen may
      // dim. Reporting it would put a warning in front of a player who cannot
      // act on it, for a feature they never asked for.
    }
  }

  function drop() {
    wanted = false;
    try { if (sentinel) sentinel.release(); } catch (e) {
      // Also silent, and safe: release() throwing leaves the lock held, which
      // the platform drops on navigation/hide anyway. `sentinel` is cleared
      // below regardless, so a throw here cannot wedge hold()'s `|| sentinel`
      // guard and block a later re-acquire.
    }
    sentinel = null;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wanted) hold();
  });

  return { hold, drop, held: () => !!sentinel, wanted: () => wanted };
})();
