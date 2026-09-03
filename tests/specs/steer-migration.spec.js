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
// data loss, which is why the guard is a per-version LADDER (STEER_MIGRATIONS,
// one step per version, the shape of CAREER_MIGRATIONS in js/core/store.js) and
// not a single "have I run ANY migration?" check. This file pins every half of
// that: each step runs for a store below its version, no step runs for a store
// already at or past it, and a step reaches only the keys it owns.
//
// Two schema versions exist so far:
//   v2  drivingHelp / raceLine reset to off (the assist rescale).
//   v3  the RACE PACE regrid — 1..10 on a piecewise-linear 0.50..1.30 grid
//       became 1..19 on an even 6 %/notch geometric one, so a stored notch
//       stopped denoting the pace it was written against.
//
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console alongside the assertion (see the note at
// the top of tests/specs/gamepad.spec.js).
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

// The store (js/core/store.js) prefixes every key with "apex26." and JSON-encodes
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
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.tuning, null, { polling: 100, timeout: BOOT_MS });
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
    // The guard in js/game/steer-tuning.js used to be a single `>= STEER_SCHEMA`
    // gate, so the moment STEER_SCHEMA became 3 a store sitting at 2 fell
    // straight through it and got V2'S RESET APPLIED A SECOND TIME — silently
    // discarding a driving-help or racing-line value the player chose on purpose
    // after v2 already ran. That is data loss, not a migration. It is a ladder
    // now (STEER_MIGRATIONS, one step per version). If this assertion goes red,
    // the fix is in the ladder, not a new expected value here.
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

  test("the migration touches only the keys it owns", async ({ page }) => {
    const schema = await currentSchema(page);
    // A migration with too wide a blast radius is the same bug in a different
    // place. Two unrelated sliders, both set away from their defaults, both of
    // which mean exactly what they meant before either migration ran: RESPONSE
    // (steerRate) and STEER SMOOTHING (steerSmooth).
    //
    // `pace` used to be the third one here, and it is deliberately gone: v3's
    // whole job is to remap it, because the notch numbers stopped denoting the
    // paces they were written against. The regrid has its own test below. The
    // invariant this test exists for is unchanged — it just now names the keys
    // that genuinely have no migration, and steerSmooth is the interesting one:
    // SMOOTHING's mapping moved from Hz-linear to lag-linear in the same change,
    // and it still must not be rewritten, because a number denoting the same
    // POSITION on the same 1..10 slider needs no migration.
    await seedStore(page, { drivingHelp: 8, raceLine: 4, steerRate: 9, steerSmooth: 2 });
    await boot(page);

    const after = await readStore(page, ["steerRate", "steerSmooth", "steerSchema"]);
    expect(after).toEqual({ steerRate: 9, steerSmooth: 2, steerSchema: schema });

    // And they resolved into the sim, so "untouched" means untouched end to end
    // rather than merely still-on-disk. Each is asserted against the value the
    // DEFAULT slider position produces, so the check survives a retune of the
    // mapping itself: rate 9 must be shorter-wheelbase than rate 5, and
    // smoothing 2 a higher (snappier) One-Euro cutoff than 6.
    const t = await tuning(page);
    const DEFAULT = { wheelbase: 3.2333, tiltCutoff: 1.1987 };   // sliders 5 / 6
    expect(t.wheelbase).toBeLessThan(DEFAULT.wheelbase);
    expect(t.tiltCutoff).toBeGreaterThan(DEFAULT.tiltCutoff);
  });

  // ---- v3: the RACE PACE regrid ----

  test("v3 regrids every stored RACE PACE notch from the 1..10 grid onto 1..19", async ({ page }) => {
    const schema = await currentSchema(page);
    test.skip(schema < 3, "the pace regrid ships with schema 3");
    // Ten boots, one per old notch — the whole table at once, because a regrid
    // that is right at the anchor and wrong in the middle is the failure mode.
    // Each boot is a bare page load with no track, but ten of them is still
    // several times what any other test in this file costs.
    test.slow();
    // Each old notch to the new notch nearest it IN LOG SPACE — the ratio is the
    // unit, because pace is a multiplicative scale and that is why the new grid
    // is geometric at all. Worst error is +2.94 % (old 10), under half a new
    // notch whose steps are 6 %.
    //
    // The pair to watch is 9 and 10. Under absolute-distance nearest they BOTH
    // land on 18 and the two fastest settings a player could previously pick
    // become the same setting; log-nearest sends 10 to 19 and the map is
    // injective. If this table ever regains a duplicate on the right-hand side,
    // that is a regression and not a rounding choice.
    const TABLE = [[1, 2], [2, 6], [3, 9], [4, 12], [5, 14], [6, 15], [7, 16], [8, 17], [9, 18], [10, 19]];
    expect(new Set(TABLE.map(([, to]) => to)).size).toBe(TABLE.length);
    await boot(page);
    const got = [];
    for (const [from] of TABLE) {
      // Rewind the store to v2 with that notch in it and boot again. Cheaper
      // than a fresh context per case and exercises the same code path: the
      // ladder reads steerSchema off disk, so a rewound stamp is a v2 store.
      await page.evaluate((f) => {
        localStorage.setItem("apex26.steerSchema", "2");
        localStorage.setItem("apex26.pace", String(f));
      }, from);
      await page.reload();
      await page.waitForFunction(() => window.__apex && window.__apex.tuning, null, { polling: 100, timeout: BOOT_MS });
      got.push((await readStore(page, ["pace"])).pace);
    }
    expect(got).toEqual(TABLE.map(([, to]) => to));

    // …and the last one resolved into the sim. Read the target out of TABLE
    // rather than restating it: this line used to say `Math.pow(1.06, 18 - 14)`
    // under a comment claiming it was not a literal, and 18 was the last row's
    // target under the superseded absolute-distance regrid. It survived a change
    // to TABLE precisely because it never mentioned TABLE.
    const [, lastNotch] = TABLE[TABLE.length - 1];
    const t = await tuning(page);
    expect(t.pace).toBeCloseTo(Math.pow(1.06, lastNotch - 14), 6);
  });

  test("v3 leaves a store with no RACE PACE key alone, so the new default applies", async ({ page }) => {
    const schema = await currentSchema(page);
    test.skip(schema < 3, "the pace regrid ships with schema 3");
    // Lowering a DEFAULT and migrating a stored VALUE are different acts. A
    // player who never touched the slider has no key, so store.get() hands them
    // the new default (notch 11 = 0.840) — and writing 11 to disk here would be
    // indistinguishable from a deliberate choice and would pin them to today's
    // default forever.
    await seedStore(page, { steerSchema: 2 });
    await boot(page);

    expect((await readStore(page, ["pace"])).pace).toBeNull();
    const t = await tuning(page);
    expect(t.pace).toBeCloseTo(Math.pow(1.06, 11 - 14), 6);
  });

  test("a store already at v3 keeps its RACE PACE notch — the regrid cannot run twice", async ({ page }) => {
    const schema = await currentSchema(page);
    test.skip(schema < 3, "the pace regrid ships with schema 3");
    // The concrete cost of a re-applied step, which is why the ladder exists.
    // Notch 10 on the v3 grid is a deliberate 0.792; run v3's regrid over it a
    // second time and it becomes 18 (1.262), a 59 % speed increase nobody asked
    // for. The same number, read on the wrong grid.
    await seedStore(page, { steerSchema: schema, pace: 10 });
    await boot(page);

    expect((await readStore(page, ["pace", "steerSchema"])))
      .toEqual({ pace: 10, steerSchema: schema });
    const t = await tuning(page);
    expect(t.pace).toBeCloseTo(Math.pow(1.06, 10 - 14), 6);
  });
});
