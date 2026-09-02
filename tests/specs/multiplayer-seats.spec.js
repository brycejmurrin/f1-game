// @ts-check
// SEAT EXCLUSIVITY — two players cannot drive the same car.
//
// The wire has always carried {team, driver} and the game has always ignored a
// collision: pickRemoteSlot() fell back exact seat -> same team -> any free
// car, so two people both choosing Verstappen meant one of them silently raced
// somebody else. Nobody was told. That silence is the bug.
//
// There are two halves and they are tested separately here because they fail
// differently. The GARAGE half is prevention — a seat somebody already holds
// is disabled, so you cannot walk into it. The ROOM half is resolution — the
// garage can only grey out a seat it has already been told about, so two
// people picking in the same instant still gets through, and then a rank
// decides who moves. Host is rank 0 today; the rule is "yield to anyone ranked
// below you" so that join-order-wins at four players is the same line of code.
//
// The far side is played by __apex.lobbyPeerEvent, exactly as in
// multiplayer-room.spec.js. A real second browser is tools/net/rtc-e2e.mjs.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };
const EV = { HELLO: "hello", READY: "ready" };

// Teams.LIST index of Red Bull, whose two seats every test here fights over.
const RBR = 3;

// Seed the saved entry BEFORE the app boots — teamIdx/driverIdx are read out of
// localStorage at load (js/game.js team/driver defaults), so setting them afterwards would be
// read by nothing.
async function seatedAs(page, teamIdx, driverIdx) {
  await page.addInitScript(([t, d]) => {
    localStorage.setItem("apex26.team", JSON.stringify(t));
    localStorage.setItem("apex26.driver", JSON.stringify(d));
  }, [teamIdx, driverIdx]);
}

async function enterRoom(page, role = "host") {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.lobbyFake(true));
  await page.click("#mb-vs");
  await page.click(role === "host" ? "#vs-host" : "#vs-join");
  await page.evaluate(() => window.__apex.lobbyWatch());
  await expect(page.locator("#vs-room")).toBeVisible({ timeout: 10000 });
}

const peerSays = (page, type, data) =>
  page.evaluate(([t, d]) => window.__apex.lobbyPeerEvent(t, d), [type, data]);

// A loopback endpoint only delivers on pump(), so a hello sent by the fake peer
// lands a beat later. Anything that reads the OTHER player's seat — the greyed
// chips, the picker's TAKEN marks — has to wait for it to arrive or it races
// the delivery and passes for the wrong reason.
const awaitPeer = (page, teamId) =>
  expect
    .poll(() => page.evaluate(() => {
      const r = window.__apex.lobbyRoom();
      return r && r.peer ? r.peer.team : null;
    }), { timeout: 5000 })
    .toBe(teamId);

const mySeat = (page) =>
  page.evaluate(() => {
    const p = window.__apex.lobby().profile;
    return { team: p.team, driver: p.driver };
  });

test.use({ viewport: LANDSCAPE });

test.describe("seat exclusivity — resolving a clash", () => {
  test("the guest yields the seat, and is TOLD it moved", async ({ page }) => {
    // The headline case. Both players are on Verstappen; the guest ends up on
    // the team-mate seat rather than in a car it did not choose, and the room
    // says whose seat it is now.
    await seatedAs(page, RBR, 0);
    await enterRoom(page, "guest");
    expect(await mySeat(page)).toEqual({ team: "redbull", driver: 0 });

    await peerSays(page, EV.HELLO, { team: "redbull", driver: 0 });

    await expect
      .poll(async () => (await mySeat(page)).driver, { timeout: 5000 })
      .toBe(1);
    // Same TEAM — exclusivity is per seat, so team-mates stay legal and the
    // yield should not throw you across the grid.
    expect((await mySeat(page)).team).toBe("redbull");
    // Named, both the seat lost and the seat gained: "you were moved" without
    // saying where is barely better than the silence it replaces.
    await expect(page.locator("#vs-status")).toContainText("Verstappen");
    await expect(page.locator("#vs-status")).toContainText("Hadjar");
    // ...and it is a notice, not a failure. Nothing went wrong; somebody was
    // quicker.
    await expect(page.locator("#vs-status")).not.toHaveClass(/vs-error/);
  });

  test("the host keeps its seat", async ({ page }) => {
    // The other half of "host wins". Same collision, opposite rank: nothing
    // moves and nothing is announced.
    await seatedAs(page, RBR, 0);
    await enterRoom(page, "host");
    await peerSays(page, EV.HELLO, { team: "redbull", driver: 0 });
    // Give the (absent) move a chance to happen before declaring it didn't.
    await expect(page.locator("#vs-them")).toContainText("RBR", { timeout: 5000 });
    expect(await mySeat(page)).toEqual({ team: "redbull", driver: 0 });
  });

  test("yielding drops READY", async ({ page }) => {
    // READY meant "I am happy with this car". Being moved out of it makes that
    // answer stale, exactly as changing your own mind does (roomChanged).
    await seatedAs(page, RBR, 0);
    await enterRoom(page, "guest");
    await page.click("#vs-ready");
    expect(await page.evaluate(() => window.__apex.lobbyRoom().selfReady)).toBe(true);

    await peerSays(page, EV.HELLO, { team: "redbull", driver: 0 });
    await expect
      .poll(async () => page.evaluate(() => window.__apex.lobbyRoom().selfReady), { timeout: 5000 })
      .toBe(false);
  });

  test("team-mates are left alone", async ({ page }) => {
    // The reason exclusivity is per DRIVER and not per team: two friends who
    // want to be team-mates still can, and nothing here should fire.
    await seatedAs(page, RBR, 1);
    await enterRoom(page, "guest");
    await peerSays(page, EV.HELLO, { team: "redbull", driver: 0 });
    await expect(page.locator("#vs-them")).toContainText("RBR", { timeout: 5000 });
    expect(await mySeat(page)).toEqual({ team: "redbull", driver: 1 });
    await expect(page.locator("#vs-status")).not.toContainText("taken");
  });
});

test.describe("seat exclusivity — the garage cannot hand out a taken seat", () => {
  // Reaching the TEAM tab from the ROOM rather than the title screen, because
  // the peer's seat is only known inside a session.
  async function garageFromRoom(page) {
    await page.click("#vs-edit-car");
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.locator('#cs-tabs [data-cs-cat="team"]').click();
  }

  test("a held seat's chip is disabled and says TAKEN", async ({ page }) => {
    // Disabled rather than hidden: hiding reflows the row so the next tap lands
    // on the wrong chip, the same reason #pm-calib and #pm-gears are disabled
    // and not removed.
    await seatedAs(page, RBR, 1);
    await enterRoom(page, "host");
    await peerSays(page, EV.HELLO, { team: "redbull", driver: 0 });
    await awaitPeer(page, "redbull");
    await garageFromRoom(page);

    const seat0 = page.locator('#cs-driver .sel-chip[data-cs-driver="0"]');
    await expect(seat0).toBeDisabled();
    await expect(seat0).toContainText("TAKEN");
    // Our own seat is untouched.
    await expect(page.locator('#cs-driver .sel-chip[data-cs-driver="1"]')).toBeEnabled();
  });

  test("switching team lands on a free seat, not blindly on seat 0", async ({ page }) => {
    // The hole this closes: the team picker reset the driver to 0 flat, so
    // choosing the team the other player is in dropped you straight into their
    // seat with a disabled chip underneath you.
    await seatedAs(page, 1, 0);                    // Ferrari, out of the way
    await enterRoom(page, "host");
    await peerSays(page, EV.HELLO, { team: "redbull", driver: 0 });
    await awaitPeer(page, "redbull");
    await garageFromRoom(page);

    await page.locator("#cs-team-card").click();
    await page.evaluate((i) => {
      const tiles = [...document.querySelectorAll("#sel-teams .team-tile")];
      tiles[i].click();
    }, RBR);
    await expect(page.locator("#teampicker")).toBeHidden();

    expect(await page.evaluate(() => localStorage.getItem("apex26.driver"))).toBe("1");
    expect(await mySeat(page)).toEqual({ team: "redbull", driver: 1 });
  });

  test("the picker marks the taken seat before you tap it", async ({ page }) => {
    await seatedAs(page, 1, 0);
    await enterRoom(page, "host");
    await peerSays(page, EV.HELLO, { team: "redbull", driver: 0 });
    await awaitPeer(page, "redbull");
    await garageFromRoom(page);
    await page.locator("#cs-team-card").click();

    const sub = await page.evaluate((i) =>
      document.querySelectorAll("#sel-teams .team-tile")[i].querySelector(".tm-sub").textContent, RBR);
    expect(sub).toMatch(/Verstappen \(TAKEN\)/);
    expect(sub).not.toMatch(/Hadjar \(TAKEN\)/);
  });
});

test.describe("seat exclusivity — solo is untouched", () => {
  // The property that matters most: none of this may reach a game with no
  // session. peerSeats() returns empty off-line and every branch above is
  // gated on it being non-empty.
  test("no session means no held seats and no disabled chips", async ({ page }) => {
    await seatedAs(page, RBR, 0);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.locator("#mb-garage").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.locator('#cs-tabs [data-cs-cat="team"]').click();

    const chips = page.locator("#cs-driver .sel-chip");
    await expect(chips.first()).toBeEnabled();
    expect(await page.locator("#cs-driver").textContent()).not.toContain("TAKEN");
  });

  test("solo, switching team still lands on seat 0", async ({ page }) => {
    // The behaviour parts-setup-ids.spec.js pins. The free-seat walk must not
    // change it when nobody holds anything.
    await seatedAs(page, 1, 1);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.locator("#mb-garage").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.locator('#cs-tabs [data-cs-cat="team"]').click();
    await page.locator("#cs-team-card").click();
    await page.evaluate((i) => {
      const tiles = [...document.querySelectorAll("#sel-teams .team-tile")];
      tiles[i].click();
    }, RBR);
    await expect(page.locator("#teampicker")).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("apex26.driver"))).toBe("0");
  });
});
