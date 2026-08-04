// @ts-check
// The VS FRIEND lobby — the part a person actually touches.
//
// There is no server anywhere in this design, so the two players ARE the
// signalling channel: the host generates an invite code, sends it by whatever
// means, and pastes back the answer. These specs cover the screen and the
// profile exchange. They deliberately do NOT try to complete a real WebRTC
// connection — that needs two browsers and a network path, and asserting on
// NAT traversal in CI would produce a test that fails for reasons no one can
// fix. The wire itself is covered by the loopback suites instead.
//
// The claim worth testing hardest is the profile one: what crosses the wire is
// part IDS, never resolved multipliers. Since Phase 0 made upgrades per-car, a
// peer that could declare `{cornering: 9}` would simply be faster.
//
// Anything that reaches a transport calls __apex.lobbyFake(true) first, which
// swaps the lobby's transport factory for loopback endpoints. That is a
// necessity, not a shortcut: measured in this environment an RTCPeerConnection
// constructs fine but ICE gathering NEVER completes — one candidate, still
// "gathering" after six seconds — and a PC left spinning starves the box. A
// test that builds one does not fail, it HANGS, which is far worse.
import { test, expect } from "./fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function menu(page, fakeTransport = true) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  if (fakeTransport) await page.evaluate(() => window.__apex.lobbyFake(true));
}

test.describe("VS FRIEND lobby", () => {
  test.use({ viewport: LANDSCAPE });

  test("the menu has a way in, and it opens the lobby", async ({ page }) => {
    await menu(page);
    await expect(page.locator("#vsfriend")).toBeHidden();
    await page.click("#mb-vs");
    await expect(page.locator("#vsfriend")).toBeVisible();
    // Starts on the host/join choice, not mid-flow.
    await expect(page.locator("#vs-pick")).toBeVisible();
    await expect(page.locator("#vs-hosting")).toBeHidden();
    await expect(page.locator("#vs-joining")).toBeHidden();
  });

  test("closing the lobby tears the half-built connection down", async ({ page }) => {
    // Abandoning the screen must not leave an RTCPeerConnection gathering
    // candidates forever.
    await menu(page);
    await page.click("#mb-vs");
    await page.click("#vs-join");
    await expect(page.locator("#vs-joining")).toBeVisible();
    await page.click("#vs-close");
    await expect(page.locator("#vsfriend")).toBeHidden();
    expect(await page.evaluate(() => window.__apex.lobby().connected)).toBe(false);
  });

  test("hosting moves to the invite step and reports progress", async ({ page }) => {
    // Asserts the SCREEN advances and says something, not that a code appears:
    // producing a real code needs ICE, which this environment cannot finish.
    // The code FORMAT is pinned in tests/net-transport.test.mjs against a
    // synthetic SDP instead — the part we actually wrote.
    await menu(page);
    await page.click("#mb-vs");
    await page.click("#vs-host");
    await expect(page.locator("#vs-hosting")).toBeVisible();
    await expect(page.locator("#vs-pick")).toBeHidden();
    // Something must be said either way — a silent screen is the one outcome
    // that leaves a player with nothing to do.
    await expect(page.locator("#vs-status")).not.toHaveText("");
  });

  test("a junk code is refused with an explanation, not a stack trace", async ({ page }) => {
    await menu(page);
    await page.click("#mb-vs");
    await page.click("#vs-join");
    // The code is validated BEFORE the connection is touched, so this reports
    // the real problem ("that isn't an Apex code") rather than a generic
    // transport error the player could do nothing about.
    await page.fill("#vs-invite-in", "not-a-real-code");
    await page.click("#vs-make-answer");
    await expect(page.locator("#vs-status")).toHaveClass(/vs-error/);
    const msg = await page.textContent("#vs-status");
    expect(msg).toMatch(/apex invite code/i);
  });

  test("an empty box asks for the code rather than failing silently", async ({ page }) => {
    await menu(page);
    await page.click("#mb-vs");
    await page.click("#vs-join");
    await page.click("#vs-make-answer");
    await expect(page.locator("#vs-status")).toHaveClass(/vs-error/);
  });

  test("the profile on the wire is IDS, never resolved multipliers", async ({ page }) => {
    // The security-relevant claim. If multipliers crossed the wire, a peer
    // could declare itself faster; instead it declares which parts it fitted
    // and both sides compute the numbers the same way.
    await menu(page);
    const p = await page.evaluate(() => window.__apex.lobby().profile);

    expect(p.team).toEqual(expect.any(String));
    expect(typeof p.driver).toBe("number");
    // No performance numbers anywhere in the payload.
    const flat = JSON.stringify(p);
    for (const banned of ["cornering", "braking", "accel", "speed"]) {
      expect(flat).not.toContain(banned);
    }
  });

  test("a peer's multipliers are recomputed locally from its ids", async ({ page }) => {
    await menu(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const honest = A.lobby().profile;
      const resolved = A.lobbyMods(honest);
      // A peer that tries to declare its own numbers gets them ignored: only
      // `team` and `parts` are read, and the multipliers come out of the same
      // Parts.getMods() the local car uses.
      const liar = Object.assign({}, honest, {
        cornering: 9, braking: 9, accel: 9, speed: 9,
      });
      return { resolved, lied: A.lobbyMods(liar) };
    });

    expect(out.resolved).toBeTruthy();
    for (const k of ["speed", "accel", "cornering", "braking"]) {
      expect(typeof out.resolved[k]).toBe("number");
      expect(out.resolved[k]).toBeLessThan(5);          // a sane multiplier
      expect(out.lied[k]).toBeCloseTo(out.resolved[k], 6);   // the lie changed nothing
    }
  });

  test("an unknown team in a profile is refused rather than crashing", async ({ page }) => {
    await menu(page);
    const out = await page.evaluate(() => ({
      unknown: window.__apex.lobbyMods({ team: "not-a-team", driver: 0 }),
      empty: window.__apex.lobbyMods(null),
    }));
    expect(out.unknown).toBe(null);
    expect(out.empty).toBe(null);
  });
});
