/* wake-lock-vm.test.mjs — tests/specs/wake-lock.spec.js replayed in the Node VM
 * (tools/lib/game-vm.cjs): the screen wake lock held for a race
 * (js/game.js holdRaceWake / dropRaceWake) with the SAME mock, the same
 * sequences and the same expected logs as the browser spec.
 *
 * Ported: all 8 tests. Not portable: none — every assertion reads the mock's
 * `__wakeLog` (a JSON array) and two of them the page-error record.
 *
 * WHY A TWIN, WHY NOW (2026-09-16). The browser copy was CI's dominant flake:
 * "a late release event from an old sentinel cannot clear its replacement"
 * failed 4 of 5 `selected` runs at 18.6 min a shard — and still failed once
 * every post-boot wait had been moved off rAF polling (run 35062467814: the
 * wait for the SECOND sentinel took 30 s where the request is synchronous,
 * and the final release never came). That is a scheduling race between the
 * page's own tasks and Playwright's round trips on a starved runner, which
 * the VM does not have: startRace, the mock's promise, the visibilitychange
 * handler and finishRace run in one process with nothing else on the clock.
 * Every wake-lock test here costs ~1 s; in the browser they cost 65-142 s
 * EACH on a runner. The browser spec stays for the nightly.
 *
 * One boot per file where the browser gives every test a fresh page, so
 * fresh() (a) quits any race still holding a lock — the game keeps `raceWake`
 * across races and a held lock makes the next holdRaceWake() a no-op — and
 * (b) removes the visibilitychange listeners the previous test's sentinels
 * registered on the shared document, which would otherwise release into the
 * next test's log.
 *
 * Run: node --test tests/unit/wake-lock-vm.test.mjs   (~8 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame, settle } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "bahrain" } }); });
after(() => { if (g) g.close(); });

const win = () => g.sandbox;
const doc = () => g.sandbox.document;
const log = () => win().__wakeLog;
const tick = () => new Promise((r) => setImmediate(r));   // one macrotask: every pending .then has run
const waitFor = async (pred, what) => {
  const ok = await settle(pred, 4000);
  assert.ok(ok, `timed out waiting for ${what}; __wakeLog=${JSON.stringify(log())}`);
};
const mark = () => ({ c: g.record.console.length, r: g.record.rejections.length });
const errorsSince = (m) => [
  ...g.record.console.slice(m.c).filter((c) => c[0] === "error").map((c) => c[1]),
  ...g.record.rejections.slice(m.r),
];

// The visibilitychange listeners the mocks add on the shared document.
const visListeners = [];
const onVisibility = (fn) => { visListeners.push(fn); doc().addEventListener("visibilitychange", fn); };

async function fresh() {
  // PAUSE > QUIT: quitToMenu() drops any held lock (its own dropRaceWake).
  doc().getElementById("pm-quit").click();
  await tick();
  for (const fn of visListeners.splice(0)) doc().removeEventListener("visibilitychange", fn);
  doc().hidden = false;
  win().__wakeLog = [];
}

/** The spec's mockWakeLock(): auto-releases on document hidden, like the platform. */
function mockWakeLock() {
  win().navigator.wakeLock = {
    request: (type) => {
      log().push("request:" + type);
      let released = false;
      const listeners = {};
      const sentinel = {
        addEventListener: (ev, cb) => { listeners[ev] = cb; },
        release: () => {
          if (released) return Promise.resolve();
          released = true;
          log().push("release");
          if (listeners.release) listeners.release();
          return Promise.resolve();
        },
      };
      onVisibility(() => { if (doc().hidden) sentinel.release(); });
      return Promise.resolve(sentinel);
    },
  };
}

const race = () => g.race("bahrain", "day", "dry");
const finishRace = () => { g.apex.finishRace(); };
const visibilityChange = () => doc().dispatchEvent({ type: "visibilitychange" });

test("starting a race requests the lock", async () => {
  await fresh(); mockWakeLock();
  g.apex.race("bahrain", "day", "dry");
  g.apex.race("bahrain", "day", "dry");   // a second hold while pending must coalesce
  await waitFor(() => log().includes("request:screen"), "request:screen");
  await waitFor(() => g.apex.info().track === "bahrain", "the track");
  assert.deepEqual(log(), ["request:screen"]);
});

test("finishing the race releases it", async () => {
  await fresh(); mockWakeLock();
  await race();
  await waitFor(() => log().includes("request:screen"), "request:screen");
  finishRace();
  await tick();
  assert.deepEqual(log(), ["request:screen", "release"]);
});

test("quitting mid-race (no results screen) also releases it", async () => {
  // The results-screen path (endRace) is covered above. This is the OTHER
  // exit — PAUSE > QUIT straight out of a live race — which never calls
  // endRace() at all, so it is quitToMenu()'s own dropRaceWake() call being
  // exercised, not endRace()'s.
  await fresh(); mockWakeLock();
  await race();
  await waitFor(() => log().includes("request:screen"), "request:screen");
  doc().getElementById("pausebtn").click();
  doc().getElementById("pm-quit").click();
  await waitFor(() => log().includes("release"), "release");
  assert.deepEqual(log(), ["request:screen", "release"]);
});

test("hiding the page releases it; becoming visible re-acquires it", async () => {
  await fresh(); mockWakeLock();
  await race();
  await waitFor(() => log().includes("request:screen"), "request:screen");

  doc().hidden = true;
  visibilityChange();
  await waitFor(() => log().length >= 2, "the release on hide");

  doc().hidden = false;
  visibilityChange();
  await waitFor(() => log().length >= 3, "the re-acquire on show");

  assert.deepEqual(log(), ["request:screen", "release", "request:screen"]);
});

test("a missing Wake Lock API (older iOS) degrades silently", async () => {
  // The lobby version this was copied from encodes two defensive properties
  // that must survive the copy — this is the first: tolerate the API being
  // absent entirely.
  await fresh();
  win().navigator.wakeLock = undefined;
  const m = mark();
  await race();
  finishRace();
  await tick();
  assert.deepEqual(errorsSince(m), []);
});

test("a rejecting request() (permission denied) degrades silently", async () => {
  // The lobby version's second defensive property: tolerate the request
  // itself REJECTING — it is not guaranteed to succeed even where the API
  // exists. An unhandled rejection here would land in the VM's rejection
  // record, exactly like a Playwright pageerror.
  await fresh();
  win().navigator.wakeLock = { request: () => Promise.reject(new Error("denied")) };
  const m = mark();
  await race();
  finishRace();
  await tick();
  assert.deepEqual(errorsSince(m), []);
});

test("a lock granted after the race ended is released immediately", async () => {
  await fresh();
  win().__grantWake = null;
  win().navigator.wakeLock = {
    request: (type) => {
      log().push("request:" + type);
      return new Promise((resolve) => {
        win().__grantWake = () => {
          const listeners = {};
          resolve({
            addEventListener: (ev, cb) => { listeners[ev] = cb; },
            release: () => {
              log().push("release");
              if (listeners.release) listeners.release();
              return Promise.resolve();
            },
          });
        };
      });
    },
  };
  await race();
  await waitFor(() => log().includes("request:screen"), "request:screen");
  finishRace();
  win().__grantWake();
  await waitFor(() => log().includes("release"), "the late release");
  assert.deepEqual(log(), ["request:screen", "release"]);
});

test("a late release event from an old sentinel cannot clear its replacement", async () => {
  await fresh();
  win().__wakeSentinels = [];
  win().navigator.wakeLock = {
    request: () => {
      const id = win().__wakeSentinels.length + 1;
      const listeners = {};
      const sentinel = {
        addEventListener: (ev, cb) => { listeners[ev] = cb; },
        release: () => {
          log().push("release:" + id);
          if (listeners.release) listeners.release();
          return Promise.resolve();
        },
        fire: () => { log().push("fire:" + id); if (listeners.release) listeners.release(); },
      };
      win().__wakeSentinels.push(sentinel);
      log().push("request:" + id);
      return Promise.resolve(sentinel);
    },
  };
  await race();
  await waitFor(() => win().__wakeSentinels.length === 1, "the first sentinel");
  await win().__wakeSentinels[0].release();
  visibilityChange();
  await waitFor(() => win().__wakeSentinels.length === 2, "the replacement sentinel");
  win().__wakeSentinels[0].fire();
  finishRace();
  await waitFor(() => log().includes("release:2"), "release:2");
  assert.deepEqual(log(), ["request:1", "release:1", "request:2", "fire:1", "release:2"]);
});
