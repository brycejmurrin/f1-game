// @ts-check
// THE WAITING ROOM — the screen both players share before the lights go out.
//
// Before this existed, connecting started the race instantly: the host's
// settings arrived and the guest was on the grid a moment later, in whatever
// car they happened to have last. The room separates "the host chose a track"
// from "the host pressed start", which is why SETTINGS and GO are now two
// different events rather than one doing both jobs.
//
// The room deliberately reimplements NOTHING. Its buttons open the game's real
// #select / #race-settings / #carsetup screens, so custom teams, liveries and
// the parts budget come along for free instead of as a second, poorer copy.
// What is tested here is the room's own logic: who may change what, what the
// other player is told, and when START is allowed to work.
//
// The far side is played by __apex.lobbyPeerEvent, which sends lobby events as
// the other person over the loopback transport. A real second browser is
// covered by tools/net/rtc-e2e.mjs; this is about the rules.
import { test, expect } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };
const EV = { HELLO: "hello", SETTINGS: "settings", READY: "ready", GO: "go", QUALI: "quali" };

// Reach the room over a loopback transport. It is open the moment it exists but
// has no RTCPeerConnection, so the handshake cannot run over it — lobbyWatch()
// starts the lobby's connect-watcher directly, which is the same path a real
// connection takes into onConnected().
async function enterRoom(page, role = "host") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
  await page.evaluate(() => window.__apex.lobbyFake(true));
  await page.click("#mb-vs");
  await page.click(role === "host" ? "#vs-host" : "#vs-join");
  await page.evaluate(() => window.__apex.lobbyWatch());
  await expect(page.locator("#vs-room")).toBeVisible({ timeout: 10000 });
}

const peerSays = (page, type, data) =>
  page.evaluate(([t, d]) => window.__apex.lobbyPeerEvent(t, d), [type, data]);

test.use({ viewport: LANDSCAPE });

test.describe("the waiting room", () => {
  test("connecting lands in the room, not on the grid", async ({ page }) => {
    // The regression this screen exists for: a connection used to start the
    // race immediately, so neither player ever chose anything.
    await enterRoom(page);
    await expect(page.locator("#vs-room")).toBeVisible();
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.state).not.toBe("race");
  });

  test("only the host may change the race; the guest is told who does", async ({ page }) => {
    await enterRoom(page, "guest");
    await expect(page.locator("#vs-edit-race")).toBeHidden();
    await expect(page.locator("#vs-race-note")).toContainText(/host/i);
    // ...and the guest never gets a START button, because starting is not
    // theirs to do.
    await expect(page.locator("#vs-start")).toBeHidden();
    // The garage is, though: your car is always your own.
    await expect(page.locator("#vs-edit-car")).toBeVisible();
  });

  test("the host sees the race controls and a START", async ({ page }) => {
    await enterRoom(page, "host");
    await expect(page.locator("#vs-edit-race")).toBeVisible();
    await expect(page.locator("#vs-start")).toBeVisible();
    await expect(page.locator("#vs-race-summary")).toContainText(/laps/i);
  });

  test("START is refused until BOTH drivers are ready", async ({ page }) => {
    // A race that begins while the other player is still in the garage puts
    // them on the grid in a car they did not choose.
    await enterRoom(page, "host");
    await expect(page.locator("#vs-start")).toBeDisabled();

    await page.click("#vs-ready");                       // just me
    expect(await page.evaluate(() => window.__apex.lobbyRoom().selfReady)).toBe(true);
    await expect(page.locator("#vs-start")).toBeDisabled();

    await peerSays(page, EV.READY, { ready: true });     // and them
    await expect(page.locator("#vs-start")).toBeEnabled({ timeout: 5000 });
  });

  test("READY is a toggle, and un-readying disables START again", async ({ page }) => {
    await enterRoom(page, "host");
    await peerSays(page, EV.READY, { ready: true });
    await page.click("#vs-ready");
    await expect(page.locator("#vs-start")).toBeEnabled({ timeout: 5000 });
    await page.click("#vs-ready");                       // changed my mind
    expect(await page.evaluate(() => window.__apex.lobbyRoom().selfReady)).toBe(false);
    await expect(page.locator("#vs-start")).toBeDisabled();
  });

  test("the rival's car shows up, and the LATEST choice wins", async ({ page }) => {
    // The profile is re-sent every time someone leaves the garage, so keeping
    // the FIRST hello would race them in whatever they had when the connection
    // opened rather than what they picked.
    await enterRoom(page, "host");
    await peerSays(page, EV.HELLO, { team: "ferrari", driver: 0 });
    await expect(page.locator("#vs-them")).toContainText("FER", { timeout: 5000 });
    await peerSays(page, EV.HELLO, { team: "mclaren", driver: 1 });
    await expect(page.locator("#vs-them")).toContainText("MCL", { timeout: 5000 });
    expect(await page.evaluate(() => window.__apex.lobbyRoom().peer.team)).toBe("mclaren");
  });

  test("the guest's room follows the host's settings live", async ({ page }) => {
    // Slow on purpose. Both guest tests boot the page, open a session and then
    // wait on replicated state; under a loaded box with several software-GL
    // workers that legitimately outruns the default budget, and they timed out
    // in a full test:net run while passing alone. The code is not the slow part.
    test.slow();
    // Settings now change WHILE both players sit here, so they have to
    // replicate on arrival rather than at lights-out.
    await enterRoom(page, "guest");
    await peerSays(page, EV.SETTINGS, { track: 4, laps: 7, weather: "wet", tod: "night" });
    await expect(page.locator("#vs-race-summary")).toContainText("7", { timeout: 5000 });
    await expect(page.locator("#vs-race-summary")).toContainText(/wet/i);
    await expect(page.locator("#vs-race-summary")).toContainText(/night/i);
    // Arriving settings must NOT start the race — that is what GO is for, and
    // conflating the two is exactly what this screen was added to undo.
    await expect(page.locator("#vs-room")).toBeVisible();
    expect(await page.evaluate(() => window.__apex.info().state)).not.toBe("race");
  });

  test("invalid host settings cannot mutate state or inject room markup", async ({ page }) => {
    await enterRoom(page, "guest");
    const before = await page.evaluate(() => {
      window.__settingsXss = 0;
      return {
        summary: document.getElementById("vs-race-summary")?.textContent,
        quali: window.__apex.info().raceQuali,
      };
    });
    await peerSays(page, EV.SETTINGS, {
      track: 4,
      laps: '<img id="settings-xss" src=x onerror="window.__settingsXss=1">',
      weather: "wet", tod: "night", difficulty: "hard", quali: false,
    });

    await expect(page.locator("#vs-status")).toContainText(/invalid race settings/i);
    expect(await page.locator("#settings-xss").count()).toBe(0);
    expect(await page.evaluate(() => window.__settingsXss)).toBe(0);
    expect(await page.evaluate(() => {
      return {
        summary: document.getElementById("vs-race-summary")?.textContent,
        quali: window.__apex.info().raceQuali,
      };
    })).toEqual(before);
  });

  test("GO is what actually starts the guest's race", async ({ page }) => {
    // The slowest test in the group: GO builds an entire circuit, and
    // SwiftShader builds it on the CPU.
    test.slow();
    await enterRoom(page, "guest");
    await peerSays(page, EV.SETTINGS, { track: 0, laps: 3, weather: "dry", tod: "day" });
    await peerSays(page, EV.GO, {});
    // The lobby closes and the game leaves the menu — the track build is slow
    // under software GL, so this is given room.
    await expect(page.locator("#vsfriend")).toBeHidden({ timeout: 60000 });
  });

  test("the garage REPLACES the room rather than opening under it", async ({ page }) => {
    // Reported from a phone: tapping GARAGE left the room sheet on top of the
    // car, so the only way to see what you were choosing was to CLOSE the
    // room — which drops the connection. openSetup() hid #select and #overlay
    // by name and had never heard of #vsfriend.
    await enterRoom(page, "guest");
    await page.click("#vs-edit-car");
    // 8.10 s measured on an idle box (see the note on EDIT RACE above): the
    // garage swap cannot make Playwright's default 5 s expect timeout.
    await expect(page.locator("#carsetup")).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#vsfriend")).toBeHidden();
    // ...and DONE brings the room back, because the session never went away.
    await page.click("#cs-done");
    await expect(page.locator("#vs-room")).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#carsetup")).toBeHidden({ timeout: 30000 });
  });

  test("the host's EDIT RACE is a circuit picker, not a second garage", async ({ page }) => {
    // #select normally answers two questions at once — which car, which
    // circuit. In the room the car half is answered by the room itself (each
    // player owns their own, and the GARAGE button is right there), so leaving
    // the team card and its GARAGE link on this screen offered a second,
    // competing place to choose a team.
    await enterRoom(page, "host");
    await page.click("#vs-edit-race");
    // SCREEN SWAPS OUT OF THE ROOM COST EIGHT SECONDS HERE, so the default 5 s
    // expect timeout fails this on an IDLE box, never mind a loaded one —
    // measured 8.03 s for #vs-edit-race -> #select and 8.10 s for
    // #vs-edit-car -> #carsetup, on a box at rest with nothing else running.
    // That is not the room being slow: playwright.config.js already records
    // View Transitions blocking ~3.2 s per screen swap on SwiftShader, and the
    // select screen builds its circuit previews on top of that. The assertion
    // is unchanged — the screen must still appear — it just gets a budget cut
    // from the measurement rather than from Playwright's default.
    await expect(page.locator("#select")).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#sel-tracks")).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#sel-left")).toHaveCount(0);
    await expect(page.locator("#sel-setup")).toHaveCount(0);   // ...and no way into the garage
    // START does not start anything here — it goes on to laps/weather.
    await expect(page.locator("#sel-go")).toHaveText("NEXT");

    await page.click("#sel-go");
    await expect(page.locator("#race-settings")).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#rs-go")).toHaveText("CONFIRM", { timeout: 30000 });
    await page.click("#rs-go");
    await expect(page.locator("#vs-room")).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(() => window.__apex.info().state)).not.toBe("race");
  });

  test("lights-out clears whatever screen the guest was standing on", async ({ page }) => {
    // The guest does not choose WHEN the race starts — the host does. So GO can
    // land while they are in the garage, and it used to leave #carsetup up over
    // a running race: the turntable still drawing, the HUD and the pedals
    // showing through it. startRace() named the three screens a race could be
    // started FROM, which was true until somebody else could start it.
    test.slow();
    await enterRoom(page, "guest");
    await peerSays(page, EV.SETTINGS, { track: 0, laps: 3, weather: "dry", tod: "day" });
    await page.click("#vs-edit-car");
    // 8.10 s measured on an idle box (see the note on EDIT RACE above): the
    // garage swap cannot make Playwright's default 5 s expect timeout.
    await expect(page.locator("#carsetup")).toBeVisible({ timeout: 30000 });

    await peerSays(page, EV.GO, {});
    await expect(page.locator("#hud")).toBeVisible({ timeout: 60000 });
    // Nothing menu-shaped may survive the green light.
    const open = await page.evaluate(() =>
      [...document.querySelectorAll(".screen"), document.getElementById("overlay")]
        .filter((el) => el && !el.hidden).map((el) => el.id));
    expect(open).toEqual([]);
  });
});

// GRID: QUALIFYING in a friend race. Two humans qualify, so two real laps have
// to reach one classification — and the lobby has to hold the connection across
// a session that happens BEFORE there is a race to hand to NetPlay.
test.describe("qualifying in a friend race", () => {
  test.use({ viewport: LANDSCAPE });

  test("the host's GRID choice reaches the guest and is shown", async ({ page }) => {
    test.slow();
    await enterRoom(page, "guest");
    await peerSays(page, EV.SETTINGS, { track: 0, laps: 3, weather: "dry", tod: "day", quali: true });
    // Wait on the VALUE, not the label. renderRoom() always emits the
    // "Qualifying lap" <dt>, so /qualifying/i matched before the settings
    // packet had been pumped at all — the guard passed instantly and the
    // raceQuali read below raced the delivery, which is exactly what it fails
    // on under a loaded box.
    await expect(page.locator("#vs-race-summary")).toContainText(/Qualifying lap\s*On/i, { timeout: 5000 });
    expect(await page.evaluate(() => window.__apex.info().raceQuali)).toBe(true);
  });

  test("GO opens qualifying instead of the grid, and the lobby keeps the session",
    async ({ page }) => {
      test.slow();
      await enterRoom(page, "guest");
      await peerSays(page, EV.SETTINGS, { track: 0, laps: 3, weather: "dry", tod: "day", quali: true });
      await peerSays(page, EV.GO, {});
      // The sheet, not the lights.
      await expect(page.locator("#quali")).toBeVisible({ timeout: 60000 });
      await expect(page.locator("#vsfriend")).toBeHidden();
      expect(await page.evaluate(() => window.__apex.info().state)).not.toBe("race");
    });

  test("TO THE GRID waits for the rival's lap, then races", async ({ page }) => {
    // Gridding up without their time would place them wherever the model
    // guessed — the one thing a qualifying session exists to prevent.
    test.slow();
    await enterRoom(page, "guest");
    await peerSays(page, EV.SETTINGS, { track: 0, laps: 3, weather: "dry", tod: "day", quali: true });
    await peerSays(page, EV.GO, {});
    await expect(page.locator("#quali")).toBeVisible({ timeout: 60000 });

    // DOM clicks, not Playwright's: this sheet sits under a dimmed overlay and
    // its foot buttons swap visibility as the session progresses, so the
    // actionability check spins on them (career.spec.js keeps a `tap` helper
    // for the same reason). What is under test is the RULE, not whether a
    // synthetic pointer can reach the button.
    const tap = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
    await tap("q-sim");                            // take the modelled time for us
    // ...but they have not driven yet, so the way out says so and is disabled.
    // It used to be an announce() banner instead, which covered the sheet foot
    // — the button it was describing — so the click hung on a hit-target check
    // and the whole thing read as a broken rule rather than a bad instrument.
    await expect(page.locator("#q-go")).toBeDisabled();
    await expect(page.locator("#q-go")).toContainText(/waiting/i);
    expect(await page.evaluate(() => window.__apex.info().state)).not.toBe("race");

    // Their lap lands; now the grid can be built from two real times.
    await peerSays(page, EV.QUALI, { driverId: "peer-driver", t: 62.5 });
    await expect(page.locator("#q-go")).toBeEnabled({ timeout: 10000 });
    await tap("q-go");
    await page.waitForFunction(() => ["count", "race"].includes(window.__apex.info().state), null, { polling: 100, timeout: 60000 });
    await expect(page.locator("#quali")).toBeHidden();
  });
});
