// @ts-check
// Rapier debris side-world (js/physics/debris-world.js — adoption phases R0+R1).
// Render-only, opt-in, deterministic. These are physics/hook assertions
// (headless project — NOT a render spec): the side-world must be inert when
// disabled (no rapier fetch, zero steps), spawn debris from a real wall hit,
// respect the pool cap, and replay a seeded episode bit-for-bit.
import { test, expect } from "@playwright/test";
import { BOOT_MS, RAPIER_MS } from "../helpers/fixtures.js";

async function boot(page) {
  // RAISE THE RESOURCE-TIMING BUFFER BEFORE THE FIRST BYTE. Chrome keeps 250
  // `resource` entries by default and then DROPS every later one silently (a
  // `resourcetimingbufferfull` event nobody here listens for). This page loads
  // the whole script roster plus the baked asset pack — MEASURED at exactly 250
  // entries, the cap, by the time the lazy rapier import lands ~42 s in — so
  // `getEntriesByType("resource")` never contained rapier.mjs and the
  // `rapierFetches > 0` assertion below was reading the BUFFER, not the fetch.
  // It failed here 3 runs out of 3 with stepped=30 and live=36, i.e. with the
  // side-world working perfectly; and the sibling test's `rapierFetches === 0`
  // ("no rapier fetch when disabled") passed for the same wrong reason, which
  // made the one assertion that test exists for unfalsifiable. MEASURED with the
  // buffer raised: 260 entries total, rapier.mjs among them — the page overflows
  // the 250 cap by TEN, which is why this was historically flaky (3/5 solo)
  // rather than always red: whether it tipped over depended on which optional
  // assets loaded. 1000 is ~4x that, so both directions mean what they say again.
  await page.addInitScript(() => {
    try { performance.setResourceTimingBufferSize(1000); } catch (_) { /* harness */ }
  });
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

async function startRace(page, id) {
  await page.evaluate((t) => window.__apex.race(t, "day", "dry"), id);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.go());
}

async function startTT(page, id) {
  await page.evaluate((t) => window.__apex.tt(t, "day"), id);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.go());
}

// Enable the side-world and wait for the lazy rapier import + WASM init.
// Fails fast (with the module's own error string) if the import rejects.
async function enableDebris(page) {
  await page.evaluate(() => window.__apex.debris(true));
  await page.waitForFunction(() => {
    const st = window.__apex.debris();
    return st.ready || st.loadState === -1;
  }, null, { polling: 100, timeout: RAPIER_MS });
  const st = await page.evaluate(() => window.__apex.debris());
  if (!st.ready) throw new Error("rapier load failed: " + st.error);
}

// NOT the config's 120 s default. One test here pays for a boot (BOOT_MS), a
// track build, the rapier load (RAPIER_MS, measured at ~29 s idle) and a physics
// pump, and the failing run measured 104.3 s while dying EARLY at the old 30 s
// rapier budget — so simply letting that wait run to its measured length pushes
// the test past 120 s and moves the failure rather than fixing it. 240 s is the
// backstop for the sum, in the same spirit as the per-file caps on
// image-grade-visual (480 s) and lighting-ab (420 s); a genuine hang still fails.
test.describe.configure({ timeout: 240_000 });

test.describe("Apex 26 — Rapier debris side-world (R0+R1)", () => {

  test("enabled by default: rapier loads and the side-world runs", async ({ page }) => {
    await boot(page);
    await startRace(page, "monza");
    // Default-on: create() enables at boot; the lazy rapier import resolves
    // shortly after. Wait for it (or a load failure) rather than a fixed sleep.
    await page.waitForFunction(() => {
      const st = window.__apex.debris();
      return st.ready || st.loadState === -1;
    }, null, { polling: 100, timeout: RAPIER_MS });
    const r = await page.evaluate(() => {
      window.__apex.jump(0.1, 40, 0);
      // The world runs the WASM solve only when something dynamic is in play
      // (idle fast-path skips it — that's the mobile-smoothness optimisation).
      // Spawn a seeded burst so the side-world actually steps this check.
      window.__apex.debris({ burst: 4, sev: 8 });
      window.__apex.step(1 / 60, 30);   // pump real physics ticks
      const st = window.__apex.debris();
      return {
        active: DebrisWorld.active(),
        enabled: st.enabled,
        ready: st.ready,
        error: st.error,
        stepped: st.stepped,
        live: st.live,
        rapierFetches: performance.getEntriesByType("resource")
          .filter((e) => e.name.includes("rapier")).length,
      };
    });
    if (!r.ready) throw new Error("rapier load failed: " + r.error);
    expect(r.active).toBe(true);        // the one boolean game.js reads — on by default
    expect(r.enabled).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.stepped).toBeGreaterThan(0);   // the burst made the side-world step
    expect(r.live).toBeGreaterThan(0);      // and spawn debris
    expect(r.rapierFetches).toBeGreaterThan(0);
  });

  test("can be disabled via apex26.debris='0': inert, no rapier fetch", async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem("apex26.debris", "0"); } catch (e) {}
    });
    await boot(page);
    await startRace(page, "monza");
    const r = await page.evaluate(() => {
      window.__apex.jump(0.1, 40, 0);
      window.__apex.step(1 / 60, 30);   // pump real physics ticks
      const st = window.__apex.debris();
      return {
        active: DebrisWorld.active(),
        enabled: st.enabled,
        ready: st.ready,
        stepped: st.stepped,
        live: st.live,
        rapierFetches: performance.getEntriesByType("resource")
          .filter((e) => e.name.includes("rapier")).length,
      };
    });
    expect(r.active).toBe(false);       // the one boolean game.js reads
    expect(r.enabled).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.stepped).toBe(0);          // step() never ran — zero cost when off
    expect(r.live).toBe(0);
    expect(r.rapierFetches).toBe(0);    // opted-out users fetch nothing
  });

  test("enable + wall hit spawns debris (lastImpact fires, live > 0)", async ({ page }) => {
    await boot(page);
    await startRace(page, "singapore");   // street circuit: barriers at the road edge
    await enableDebris(page);
    const r = await page.evaluate(() => {
      window.__apex.jump(0.10, 45, 0);
      // steer hard right into the barrier at speed; act() pumps the same
      // update() the fixed-step loop uses, so the side-world steps in lockstep.
      let st = null;
      for (let i = 0; i < 12 && !(st && st.lastImpact); i++) {
        window.__apex.act({ steer: 1, throttle: true }, 1 / 60, 20);
        st = window.__apex.debris();
      }
      window.__apex.clearInput();
      return st;
    });
    expect(r.active).toBe(true);
    expect(r.stepped).toBeGreaterThan(0);
    expect(r.lastImpact).toBeTruthy();
    expect(r.spawned).toBeGreaterThan(0);
    expect(r.live).toBeGreaterThan(0);
    expect(r.live).toBeLessThanOrEqual(r.cap);
  });

  test("determinism: seeded episodes replay with identical counts + positions", async ({ page }) => {
    await boot(page);
    await startTT(page, "singapore");   // TT = player only, no AI in the field
    await enableDebris(page);
    const episode = () => page.evaluate(() => {
      window.__apex.debris({ reset: true });          // fresh world, counters zeroed
      window.__apex.reset(0.10, 0, 0);                // parked player, known pose
      window.__apex.debris({ burst: 6, sev: 9 });     // seeded synthetic impacts
      window.__apex.step(1 / 60, 240);                // 4 s of side-world settling
      return window.__apex.debris({ positions: true });
    });
    const a = await episode();
    const b = await episode();
    expect(a.spawned).toBeGreaterThan(0);
    expect(b.spawned).toBe(a.spawned);
    expect(b.live).toBe(a.live);
    expect(b.positions.length).toBe(a.positions.length);
    let maxD = 0;
    for (let i = 0; i < a.positions.length; i++) {
      maxD = Math.max(maxD, Math.abs(a.positions[i] - b.positions[i]));
    }
    expect(maxD).toBeLessThan(1e-9);   // Rapier is bitwise deterministic per platform
  });

  test("pool cap respected (mobile-tier value via apex26.debrisCap)", async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem("apex26.debrisCap", "16"); } catch (e) {}
    });
    await boot(page);
    await startTT(page, "monza");
    await enableDebris(page);
    const r = await page.evaluate(() => {
      window.__apex.reset(0.10, 0, 0);
      window.__apex.debris({ burst: 40, sev: 12 });   // way past the cap
      window.__apex.step(1 / 60, 5);
      return window.__apex.debris();
    });
    expect(r.cap).toBe(16);
    expect(r.live).toBeLessThanOrEqual(16);
    expect(r.live).toBe(16);            // recycle-oldest keeps the pool full, never over
    expect(r.spawned).toBeGreaterThan(16);   // recycling happened
  });
});
