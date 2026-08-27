// @ts-check
// SCREEN WAKE LOCK — held for the duration of a race (js/game.js holdRaceWake/
// dropRaceWake). Same shape as js/net/lobby.js's holdWake/dropWake for the VS
// FRIEND waiting room: without it the system idle timer runs during a Grand
// Prix same as any other page, and tilt steering sends NO input events by
// construction (orientation is a sensor read, not user input), so a phone
// driving by tilt has its screen dim and lock mid-race. See
// docs/research/PLATFORM-INPUT-NOTES.md §9b.
//
// No headless Chromium under Playwright/SwiftShader actually grants a wake
// lock, so navigator.wakeLock is mocked. The mock also auto-releases on
// document hidden, mirroring the platform's own behaviour ("the lock is
// released whenever the page is hidden, and not given back"), so the
// re-acquire-on-visible path is exercised for real rather than assumed.
import { test, expect } from "../helpers/fixtures.js";

async function mockWakeLock(page) {
  await page.addInitScript(() => {
    window.__wakeLog = [];
    // defineProperty, not assignment: navigator.wakeLock is a getter-only
    // accessor in real Chromium (Object.getOwnPropertyDescriptor confirms
    // hasGet:true, hasSet:false) and `=` on it fails SILENTLY — the real Wake
    // Lock API then answers holdRaceWake()'s request instead of this mock,
    // __wakeLog stays empty forever, and every waitForFunction() below hangs
    // to its full timeout. Same trap as navigator.clipboard/share elsewhere
    // in this suite (see tests/specs/multiplayer-lobby.spec.js).
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: (type) => {
          window.__wakeLog.push("request:" + type);
          let released = false;
          const listeners = {};
          const sentinel = {
            addEventListener: (ev, cb) => { listeners[ev] = cb; },
            release: () => {
              if (released) return Promise.resolve();
              released = true;
              window.__wakeLog.push("release");
              if (listeners.release) listeners.release();
              return Promise.resolve();
            },
          };
          const onVis = () => { if (document.hidden) sentinel.release(); };
          document.addEventListener("visibilitychange", onVis);
          return Promise.resolve(sentinel);
        },
      },
    });
  });
}

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
}

test.describe("Screen wake lock — held for the duration of a race", () => {
  test("starting a race requests the lock", async ({ page }) => {
    await mockWakeLock(page);
    await boot(page);
    await page.evaluate(() => {
      window.__apex.race("bahrain");
      window.__apex.race("bahrain"); // a second hold while pending must coalesce
    });
    await page.waitForFunction(() => window.__wakeLog.includes("request:screen"));
    expect(await page.evaluate(() => window.__wakeLog)).toEqual(["request:screen"]);
  });

  test("finishing the race releases it", async ({ page }) => {
    await mockWakeLock(page);
    await boot(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__wakeLog.includes("request:screen"));
    await page.evaluate(() => window.__apex.finishRace());
    expect(await page.evaluate(() => window.__wakeLog)).toEqual(["request:screen", "release"]);
  });

  test("quitting mid-race (no results screen) also releases it", async ({ page }) => {
    // The results-screen path (endRace) is covered above. This is the OTHER
    // exit — PAUSE > QUIT straight out of a live race — which never calls
    // endRace() at all, so it is quitToMenu()'s own dropRaceWake() call being
    // exercised, not endRace()'s.
    await mockWakeLock(page);
    await boot(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__wakeLog.includes("request:screen"));
    await page.locator("#pausebtn").click();
    await page.locator("#pm-quit").click();
    await page.waitForFunction(() => window.__wakeLog.includes("release"));
    expect(await page.evaluate(() => window.__wakeLog)).toEqual(["request:screen", "release"]);
  });

  test("hiding the page releases it; becoming visible re-acquires it", async ({ page }) => {
    await mockWakeLock(page);
    await boot(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__wakeLog.includes("request:screen"));

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => window.__wakeLog.length >= 2);

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => window.__wakeLog.length >= 3);

    expect(await page.evaluate(() => window.__wakeLog)).toEqual(["request:screen", "release", "request:screen"]);
  });

  test("a missing Wake Lock API (older iOS) degrades silently", async ({ page }) => {
    // The lobby version this was copied from encodes two defensive properties
    // that must survive the copy — this is the first: tolerate the API being
    // absent entirely. defineProperty, not delete: navigator.wakeLock is a
    // read-only accessor in real Chromium and `delete` on it fails silently,
    // which would make this test pass by testing nothing.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "wakeLock", { configurable: true, value: undefined });
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await boot(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__apex.info().track != null);
    await page.evaluate(() => window.__apex.finishRace());
    expect(errors).toEqual([]);
  });

  test("a rejecting request() (permission denied) degrades silently", async ({ page }) => {
    // The lobby version's second defensive property: tolerate the request
    // itself REJECTING — it is not guaranteed to succeed even where the API
    // exists. An unhandled rejection here would surface as a Playwright
    // pageerror, exactly like the missing-API case above. defineProperty, not
    // assignment — see mockWakeLock() above for why plain `=` silently fails
    // to override this getter-only accessor.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: { request: () => Promise.reject(new Error("denied")) },
      });
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await boot(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__apex.info().track != null);
    await page.evaluate(() => window.__apex.finishRace());
    expect(errors).toEqual([]);
  });

  test("a lock granted after the race ended is released immediately", async ({ page }) => {
    await page.addInitScript(() => {
      window.__wakeLog = [];
      window.__grantWake = null;
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
          request: (type) => {
            window.__wakeLog.push("request:" + type);
            return new Promise((resolve) => {
              window.__grantWake = () => {
                const listeners = {};
                resolve({
                  addEventListener: (ev, cb) => { listeners[ev] = cb; },
                  release: () => {
                    window.__wakeLog.push("release");
                    if (listeners.release) listeners.release();
                    return Promise.resolve();
                  },
                });
              };
            });
          },
        },
      });
    });
    await boot(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__wakeLog.includes("request:screen"));
    await page.evaluate(() => window.__apex.finishRace());
    await page.evaluate(() => window.__grantWake());
    await page.waitForFunction(() => window.__wakeLog.includes("release"));
    expect(await page.evaluate(() => window.__wakeLog)).toEqual(["request:screen", "release"]);
  });

  test("a late release event from an old sentinel cannot clear its replacement", async ({ page }) => {
    await page.addInitScript(() => {
      window.__wakeLog = [];
      window.__wakeSentinels = [];
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
          request: () => {
            const id = window.__wakeSentinels.length + 1;
            const listeners = {};
            const sentinel = {
              addEventListener: (ev, cb) => { listeners[ev] = cb; },
              release: () => {
                window.__wakeLog.push("release:" + id);
                if (listeners.release) listeners.release();
                return Promise.resolve();
              },
              fire: () => { window.__wakeLog.push("fire:" + id); if (listeners.release) listeners.release(); },
            };
            window.__wakeSentinels.push(sentinel);
            window.__wakeLog.push("request:" + id);
            return Promise.resolve(sentinel);
          },
        },
      });
    });
    await boot(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__wakeSentinels.length === 1);
    await page.evaluate(async () => {
      await window.__wakeSentinels[0].release();
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => window.__wakeSentinels.length === 2);
    await page.evaluate(() => {
      window.__wakeSentinels[0].fire();
      window.__apex.finishRace();
    });
    await page.waitForFunction(() => window.__wakeLog.includes("release:2"));
    expect(await page.evaluate(() => window.__wakeLog)).toEqual([
      "request:1", "release:1", "request:2", "fire:1", "release:2",
    ]);
  });
});
