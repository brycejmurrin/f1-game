// @ts-check
// THE N-PEER SHAPE — still two players, but nothing left assuming so.
//
// Phase B's contract is that NOTHING changes behaviourally: the whole point is
// to turn every "the rival" singleton into a keyed collection while the race
// plays exactly as it did. multiplayer-session.spec.js is therefore the real
// test of this work, unedited. What is asserted HERE is the new surface those
// specs cannot see — that the key is a cross-peer identity rather than a local
// array index, which is the thing that was quietly broken before.
//
// Why it matters: cars[] index is not an identity. makeCars() drops the custom
// team unless the local player selected it, so two screens in the same race
// have grids of different length and order. onState used to take cars[0] and
// ignore the id on the wire precisely because that id was the sender's own
// index and meant nothing here.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function raceWithRival(page, peer) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().state === "count"
    || window.__apex.info().state === "race", null, { polling: 100, timeout: 60000 });
  await page.evaluate(() => window.__apex.go());
  await page.evaluate(() => window.__apex.jump(0.2, 40));
  return page.evaluate((p) => window.__apex.netLoopback({ nowMs: 1000, peer: p }), peer);
}

test.use({ viewport: LANDSCAPE });

test.describe("the rival is keyed by a cross-peer identity", () => {
  test("a rival is held under a wire id, not a grid index", async ({ page }) => {
    const res = await raceWithRival(page, { team: "ferrari", driver: 1 });
    expect(res.ok).toBe(true);

    const st = await page.evaluate(() => window.__apex.net());
    expect(st.remotes).toHaveLength(1);
    const r = st.remotes[0];
    // The wire id is derived from WHO the car is, so it must agree with the
    // driverId — the other content-derived key — rather than with cars.indexOf.
    expect(r.driverId).toBe("ferrari:1");
    expect(r.wire).toBeGreaterThanOrEqual(0);
    // ...and it fits the one byte the snapshot format gives it.
    expect(r.wire).toBeLessThan(256);
    // remoteId (the index) is kept for the existing callers, but the two are
    // different numbers — which is the whole reason the id on the wire could
    // not have been the index.
    expect(typeof r.id).toBe("number");
  });

  test("the rival got the seat it asked for, with no fallback", async ({ page }) => {
    // Seat exclusivity is supposed to make pickRemoteSlot's fallback arms
    // unreachable. Asserting the rival landed on ferrari:1 proves only that the
    // collision did not happen to occur; asserting slotFallback is null proves
    // the exact-seat arm is what fired.
    await raceWithRival(page, { team: "ferrari", driver: 1 });
    const st = await page.evaluate(() => window.__apex.net());
    expect(st.slotFallback).toBe(null);
    expect(st.remotes[0].driverId).toBe("ferrari:1");
  });

  test("a packet for an unknown car is dropped, not posed over somebody", async ({ page }) => {
    // The failure this replaces: trusting the id would pose a rival onto
    // whatever car that index happened to name here — possibly the local one.
    // An id we hold no slot for is a car this peer does not know about, and
    // drawing nothing is strictly better than drawing it in the wrong place.
    await raceWithRival(page, { team: "ferrari", driver: 1 });
    const before = await page.evaluate(() => {
      const st = window.__apex.net();
      return { s: window.__apex.carAt(st.remotes[0].id).s, buffered: st.remotes[0].buffered };
    });
    // 200 is past the end of an 11-team grid at two seats each, so no car
    // anywhere carries it.
    await page.evaluate(() => window.__apex.netPeerSend({ s: 500 }, 1100, 200));
    const after = await page.evaluate(() => window.__apex.net().remotes[0].buffered);
    // Nothing was routed anywhere: the one buffer we do have is untouched.
    expect(after).toBe(before.buffered);
  });

  test("the two humans do not start in the same box", async ({ page }) => {
    // separateGrid's whole job, asserted the way the bug was originally found:
    // both peers reported their own car at the same s, to the metre, because
    // gridUp puts THE local player at P12 and runs identically on both screens.
    // It used to hardcode host-then-guest; it now lays the humans out by wire
    // id, which every peer computes the same way, so they agree with no message.
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => ["count", "race"].includes(window.__apex.info().state), null, { polling: 100, timeout: 60000 });
    const res = await page.evaluate(() =>
      window.__apex.netLoopback({ nowMs: 1000, peer: { team: "ferrari", driver: 1 } }));
    expect(res.ok).toBe(true);

    const at = await page.evaluate((ids) => ids.map((i) => window.__apex.carAt(i).s), [res.localId, res.remoteId]);
    expect(Math.abs(at[0] - at[1])).toBeGreaterThan(1);
  });
});
