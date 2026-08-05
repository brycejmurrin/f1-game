// @ts-check
// The STEER_SCHEMA store migration in js/game/steer-tuning.js.
//
// migrateSteerStore() is the only code in the game that OVERWRITES a setting the
// player chose. It exists because `store.get(k, d)` returns the stored value
// whenever the key exists, so changing the DRIVING HELP default from 6 to 1
// reached fresh installs only — everyone who had ever opened the settings kept
// the old always-on assist. The slider's meaning changed with it (it used to
// bottom out at 0.25 and now bottoms out at a true 0), so a stored number could
// not be rescaled and a one-time reset was the honest migration.
//
// A reset that runs ONCE is a migration. The same reset running a second time is
// data loss, and the current guard is a single "have I run ANY migration?"
// check rather than a per-version ladder (contrast CAREER_MIGRATIONS in
// js/game/store.js, which is a ladder). This file pins both halves: the reset
// happens for a store below the current schema, and NOTHING happens for a store
// already at it.
//
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console alongside the assertion (see the note at
// the top of tests/gamepad.spec.js).
import { test, expect } from "./fixtures.js";

// The store (js/game/store.js) prefixes every key with "apex26." and JSON-encodes
// the value, so these two helpers are the store's own on-disk format and nothing
// more. Seeding has to happen in an init script: the migration runs while
// js/game.js evaluates (SteerTuning.create(G) -> applySteerTuning()), which is
// long before the first `await page.evaluate` could write anything.
function seedStore(page, entries) {
  return page.addInitScript((e) => {
    for (const [k, v] of Object.entries(e)) localStorage.setItem("apex26." + k, JSON.stringify(v));
  }, entries);
}
function readStore(page, keys) {
  return page.evaluate((ks) => {
    const out = {};
    for (const k of ks) {
      const raw = localStorage.getItem("apex26." + k);
      out[k] = raw === null ? null : JSON.parse(raw);
    }
    return out;
  }, keys);
}

// The current STEER_SCHEMA, read out of the shipped source rather than hardcoded,
// so this file keeps testing "the CURRENT version is not re-migrated" after the
// next bump instead of silently pinning a stale 2. There is deliberately no
// __apex hook for it — this is a tests-only change, and the served source is
// ground truth anyway.
async function currentSchema(page) {
  const src = await (await page.request.get("/js/game/steer-tuning.js")).text();
  const m = src.match(/const\s+STEER_SCHEMA\s*=\s*(\d+)/);
  expect(m, "STEER_SCHEMA not found in js/game/steer-tuning.js").not.toBeNull();
  return Number(m[1]);
}

// The live physics the sliders resolve to. tuning() reads G.ROAD_FOLLOW and
// G.raceLineAssist straight off the game closure and needs no car, so it works
// on a bare boot with no track loaded.
function tuning(page) {
  return page.evaluate(() => window.__apex.tuning());
}

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.tuning, { timeout: 10000 });
}

test.describe("steering-store schema migration", () => {
  test("a fresh install lands on the assists-off defaults, in the store AND in the car", async ({ page }) => {
    const schema = await currentSchema(page);
    // No steerSchema key at all — the state of a browser that has never run the
    // game, and of every player who last played before the migration shipped.
    await boot(page);

    expect(await readStore(page, ["drivingHelp", "raceLine", "steerSchema"]))
      .toEqual({ drivingHelp: 1, raceLine: 0, steerSchema: schema });

    // The store is only half the claim. ROAD_FOLLOW is what actually steers the
    // car for you, so assert the migration reached the physics and not just the
    // JSON: helpFromSlider(1) is a true zero and raceLineAssist = 0/5.
    const t = await tuning(page);
    expect(t.roadFollow).toBe(0);
    expect(t.raceLineAssist).toBe(0);
  });

  test("a v1 store's deliberately non-default assist values are reset", async ({ page }) => {
    const schema = await currentSchema(page);
    // drivingHelp 8 / raceLine 4 on the v1 scale: heavy corner assist plus a
    // strong line pull — the exact combination the rescale was meant to clear,
    // and one a player could easily have arrived at (RELAX writes raceLine: 2).
    await seedStore(page, { drivingHelp: 8, raceLine: 4 });
    await boot(page);

    expect(await readStore(page, ["drivingHelp", "raceLine", "steerSchema"]))
      .toEqual({ drivingHelp: 1, raceLine: 0, steerSchema: schema });
    const t = await tuning(page);
    expect(t.roadFollow).toBe(0);
    expect(t.raceLineAssist).toBe(0);
  });

  test("an explicit steerSchema: 1 is migrated exactly like a missing one", async ({ page }) => {
    const schema = await currentSchema(page);
    // store.get("steerSchema", 1) defaults to 1, so "absent" and "1" must be the
    // same store as far as the guard is concerned. Worth its own case: the two
    // are the same only because the default happens to match, which is the kind
    // of coincidence a refactor breaks.
    test.skip(schema <= 1, "nothing below the current schema to migrate from");
    await seedStore(page, { steerSchema: 1, drivingHelp: 8, raceLine: 4 });
    await boot(page);

    expect(await readStore(page, ["drivingHelp", "raceLine", "steerSchema"]))
      .toEqual({ drivingHelp: 1, raceLine: 0, steerSchema: schema });
  });

  test("a store already at the current schema is left completely alone", async ({ page }) => {
    const schema = await currentSchema(page);
    // Values a player can only have set AFTER the migration ran: the store is
    // already stamped with the current schema, so these are deliberate choices
    // made on the current scale, not stale v1 numbers.
    await seedStore(page, { steerSchema: schema, drivingHelp: 8, raceLine: 4 });
    await boot(page);

    // THE INVARIANT: a migration must run ONCE PER VERSION, not once ever.
    // The guard in js/game/steer-tuning.js is a single `>= STEER_SCHEMA` gate
    // rather than a per-version ladder, so when STEER_SCHEMA becomes 3 a store
    // sitting at 2 falls straight through it and gets V2'S RESET APPLIED A
    // SECOND TIME — silently discarding a driving-help or racing-line value the
    // player chose on purpose after v2 already ran. That is data loss, not a
    // migration. If this assertion goes red, the fix is a ladder (one step
    // function per version, like CAREER_MIGRATIONS in js/game/store.js), not a
    // new expected value here.
    expect(await readStore(page, ["drivingHelp", "raceLine", "steerSchema"]))
      .toEqual({ drivingHelp: 8, raceLine: 4, steerSchema: schema });

    // …and the untouched choices are what the car is actually driving with.
    // Only the SIGN matters here, not the magnitude: a future schema is allowed
    // to recalibrate helpFromSlider, but it is never allowed to turn a player's
    // assist off behind their back.
    const t = await tuning(page);
    expect(t.roadFollow).toBeGreaterThan(0);
    expect(t.raceLineAssist).toBeGreaterThan(0);
  });

  test("the migration touches only its own two keys", async ({ page }) => {
    const schema = await currentSchema(page);
    // A migration with too wide a blast radius is the same bug in a different
    // place. Three unrelated sliders, all set away from their defaults, all of
    // which mean exactly what they meant before the rescale: RESPONSE
    // (steerRate), STEER SMOOTHING (steerSmooth) and OVERALL SPEED (pace).
    await seedStore(page, { drivingHelp: 8, raceLine: 4, steerRate: 9, steerSmooth: 2, pace: 3 });
    await boot(page);

    const after = await readStore(page, ["steerRate", "steerSmooth", "pace", "steerSchema"]);
    expect(after).toEqual({ steerRate: 9, steerSmooth: 2, pace: 3, steerSchema: schema });

    // And they resolved into the sim, so "untouched" means untouched end to end
    // rather than merely still-on-disk. Each is asserted against the value the
    // DEFAULT slider position produces, so the check survives a retune of the
    // mapping itself: rate 9 must be shorter-wheelbase than rate 5, smoothing 2
    // must be a higher (snappier) One-Euro cutoff than 6, pace 3 slower than 5.
    const t = await tuning(page);
    const DEFAULT = { wheelbase: 3.2333, tiltCutoff: 1.2, pace: 1.0 };  // sliders 5 / 6 / 5
    expect(t.wheelbase).toBeLessThan(DEFAULT.wheelbase);
    expect(t.tiltCutoff).toBeGreaterThan(DEFAULT.tiltCutoff);
    expect(t.pace).toBeLessThan(DEFAULT.pace);
  });
});
