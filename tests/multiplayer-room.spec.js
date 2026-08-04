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
// covered by tools/rtc-e2e.mjs; this is about the rules.
import { test, expect } from "./fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };
const EV = { HELLO: "hello", SETTINGS: "settings", READY: "ready", GO: "go" };

// Reach the room over a loopback transport. It is open the moment it exists but
// has no RTCPeerConnection, so the handshake cannot run over it — lobbyWatch()
// starts the lobby's connect-watcher directly, which is the same path a real
// connection takes into onConnected().
async function enterRoom(page, role = "host") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
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

  test("GO is what actually starts the guest's race", async ({ page }) => {
    await enterRoom(page, "guest");
    await peerSays(page, EV.SETTINGS, { track: 0, laps: 3, weather: "dry", tod: "day" });
    await peerSays(page, EV.GO, {});
    // The lobby closes and the game leaves the menu — the track build is slow
    // under software GL, so this is given room.
    await expect(page.locator("#vsfriend")).toBeHidden({ timeout: 60000 });
  });
});
