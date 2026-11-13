// @ts-check
// Elevation + banking ("berm") tracks — the BROWSER half (TK1-16, #3039).
//
// Every assertion this file used to carry runs in the Node VM twin,
// tests/unit/elevation-tracks-vm.test.mjs: the four banking-geometry audits
// (pure Tracks math), and slope gravity / the climb / road-following on the
// grade for EVERY circuit (one per js/circuits/*.js def, pinned to Tracks.LIST),
// with the same recipe (tests/helpers/elevation-probes.cjs), launches and
// thresholds. The twin is on the blocking node gate; this copy runs only in
// the `circuits` browser group, so 44 tests of SwiftShader race builds
// (842.7 s for the 47-test file, tests/data/spec-timings.json, 2026-10-10)
// bought nothing the VM did not already assert.
//
// What stays here is what the VM CANNOT see (tools/ci/twinned-specs.mjs
// header): game-vm never pumps requestAnimationFrame and skips the renderer,
// so a throw that only happens inside render() is invisible to the twin. The
// banked bowls are the only road surfaces with a non-zero roll, and the chase
// camera's roll is the only camera term derived from it — so these three are
// the cases where a NaN in the banked mesh or the rolled view matrix would
// surface as a page error. Each test title is also a twin test title
// (twinned-specs' TWIN_SUBSET check), so a browser red always has a VM twin to
// bisect against.
//
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

// Circuits with `banked: true` (raised outer edge through the fast corners).
const BANKED_TRACKS = ["zandvoort", "madrid"];

async function startRace(page, id) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((t) => window.__apex.race(t, "day", "dry"), id);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  // info().track goes non-null as soon as the track OBJECT exists, which is before
  // its elevation is necessarily in place. Scanning that window reads the flat
  // default tangent, so the "this track really does descend" assertion saw dn = 0
  // exactly — intermittently, and worst on the circuits with the least relief
  // (abudhabi 9.2 m of range, qatar 6.7 m). Run in isolation the same scan finds
  // dn = -0.0226, so this was a race with the build, not a claim about the data.
  // Wait for the profile to actually show relief before anything reads a slope.
  await page.waitForFunction(() => {
    const p = window.__apex.trackProfile(120);
    if (!p || !p.length) return false;
    const ys = p.map((q) => q.y);
    return Math.max(...ys) - Math.min(...ys) > 0.5;   // metres of elevation range
  }, null, { polling: 100, timeout: 20000 });
  await page.evaluate(() => window.__apex.go());
}

test.describe("Apex 26 — elevation & banking tracks", () => {
  // SEQUENTIAL, IN ONE WORKER. `fullyParallel: true` in playwright.config.js
  // spreads the tests in a file across workers, and each test here BUILDS A
  // WHOLE CIRCUIT — mugello alone is 637 712 prop verts, 693 752 total. Two of
  // those under SwiftShader at once is the same memory wall that made
  // test:sweeps and test:tooling pass --test-concurrency=1 deliberately
  // (AGENTS.md: "four at once reached 5.4 GB and was OOM-killed").
  //
  // Measured: in the full 105-test physics run, mugello (test 50) failed with
  // 36 uncaught page errors and sochi (test 51) timed out at 120 s — ADJACENT
  // tests, 37 seconds apart, one resource event rather than two circuit
  // defects. Run alone, each passes in ~24 s. Nothing about either circuit was
  // wrong.
  //
  // `default`, not `serial`: both run in a single worker sequentially, but a
  // failure in one must not skip the rest — a circuit that genuinely breaks
  // should not hide the others.
  test.describe.configure({ mode: "default" });

  test("chase camera follows the road bank instead of showing a sideways wall", async ({ page }) => {
    await startRace(page, "madrid");
    const result = await page.evaluate(() => {
      const def = Tracks.LIST.find((entry) => entry.id === "madrid");
      const track = Tracks.buildCenterline(def);
      const trackRoll = Tracks.banking(track, 0.75 * track.total, 0)?.roll || 0;
      window.__apex.jump(0.75, 30, 0);
      window.__apex.camera("chase");
      window.__apex.snapCam();
      const bankedRoll = window.__apex.camState().roll;
      window.__apex.orbit(0.75, 45, 18, 45);
      const debugRoll = window.__apex.camState().roll;
      window.__apex.camera("chase");
      window.__apex.jump(0.60, 30, 0);
      window.__apex.snapCam();
      const flatRoll = window.__apex.camState().roll;
      return { trackRoll, bankedRoll, debugRoll, flatRoll };
    });

    expect(Math.abs(result.bankedRoll) * 180 / Math.PI).toBeGreaterThan(13);
    expect(Math.abs(result.bankedRoll) * 180 / Math.PI).toBeLessThan(14);
    expect(result.bankedRoll).toBeCloseTo(-result.trackRoll, 4);
    expect(result.debugRoll).toBe(0);
    expect(Math.abs(result.flatRoll) * 180 / Math.PI).toBeLessThan(1);
  });

  for (const id of BANKED_TRACKS) {
    test(`${id}: banked corner is drivable and stays on the road`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
      await startRace(page, id);
      const r = await page.evaluate(() => {
        // The two highest-curvature corners carry the banking (~19 m radius). Drive
        // each at a corner-appropriate speed and let road-following ride the curve.
        // The assist is opt-in (ships at 0), so enable it explicitly — the subject
        // here is the BANKED road, not the default.
        window.__apex.setPhysics({ roadFollow: 0.6 });
        // the car must track the banked road cleanly (stay on the paved surface) and
        // keep moving forward through the apex rather than understeering off.
        const corners = window.__apex.corners();
        const probe = window.__apex.probe.bind(window.__apex);
        const scored = corners.map((f) => {
          window.__apex.jump(f, 30, 0);
          return { f, k: Math.abs(probe().k) };
        }).sort((a, b) => b.k - a.k).slice(0, 2);

        let finite = true, widest = 0, hw = 7, allProgressed = true;
        for (const { f } of scored) {
          window.__apex.jump((f - 0.03 + 1) % 1, 25, 0);
          window.__apex.setInput({ steer: 0, throttle: false });   // road-following rides the bank
          const s0 = window.__apex.physState().prog;
          hw = probe().hw;
          for (let i = 0; i < 100; i++) {
            window.__apex.step(1 / 60, 1);
            const p = probe();
            const ps = window.__apex.physState();
            if (!Number.isFinite(p.x) || !Number.isFinite(ps.head) || !Number.isFinite(ps.speed)) finite = false;
            widest = Math.max(widest, Math.abs(p.x));
          }
          if (window.__apex.physState().prog <= s0 + 20) allProgressed = false;
        }
        window.__apex.clearInput();
        return { finite, widest, hw, progressed: allProgressed };
      });

      expect(errors).toEqual([]);
      expect(r.finite).toBe(true);
      expect(r.progressed).toBe(true);             // the car drove through, didn't beach
      expect(r.widest).toBeLessThan(r.hw);         // stayed ON the banked paved road, not in runoff
    });
  }
});
