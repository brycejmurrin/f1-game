// @ts-check
// Track boundary consistency: every track must keep the car inside a sane,
// finite driving boundary (derived from where solid barriers/grandstands sit),
// so you can't clip into models or drive off forever — and you can always
// recover. Street circuits should be tight; open circuits keep some runoff.
/* ONE TEST PER CIRCUIT, NOT ONE SWEEP OVER FORTY.
   The boundary check used to build all ~40 circuits inside a single test. That
   test never once completed here: it timed out at 151 s and 155 s against the
   default 120 s budget, then — with test.slow() tripling it — at 372.8 s
   against 360 s. Raising the budget again was the obvious move and the wrong
   one, for four reasons the split fixes at a stroke:
     - each circuit is ~9 s, comfortably inside the DEFAULT budget, so no
       test.slow() is needed at all;
     - a failure NAMES THE CIRCUIT instead of saying "the sweep timed out";
     - the work parallelises across workers instead of serialising in one test;
     - a timeout kills the loop midway, so every circuit after the one that ran
       long is simply never checked. The sweep reported one failure; the split
       reports forty results.
   The pattern is not new here — tests/specs/elevation-tracks.spec.js does the
   identical workload as one test per track and passes comfortably, in the very
   run where this sweep timed out.

   sharedTest, not test: this file never drives a menu screen, it calls
   __apex.race() directly, which is the axis that decides shared-page safety.
   tests/helpers/fixtures.js's own rationale cites THIS FILE as the proof that race(id)
   is re-entrant against a live page — "tracks-walls.spec.js has always raced
   its way through many circuits in ONE page without reloading". Splitting into
   40 tests on the default fixture would have paid 40 page boots to undo exactly
   that; on the shared page the split costs a build per circuit and nothing
   more. */
import { sharedTest as test, test as freshTest, expect, BOOT_MS } from "../helpers/fixtures.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// DERIVED, NOT WRITTEN DOWN. Playwright decides the test list at module load,
// before any page exists, so the ids cannot come from Tracks.LIST in the page —
// they come from the definition files that Tracks.LIST is built from. Same
// reasoning as tests/manual/circuits.js: a hardcoded list means adding a
// circuit silently leaves it unswept, and nothing would ever say so.
const ALL = fs.readdirSync(path.join(ROOT, "js/circuits"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => f.replace(/\.js$/, ""))
  .sort();

const ONLY_TRACK = process.env.TRACK;
const IDS = ONLY_TRACK ? ALL.filter((id) => id === ONLY_TRACK) : ALL;
const STREET = ["monaco", "singapore", "vegas", "baku", "jeddah"]
  .filter((id) => !ONLY_TRACK || id === ONLY_TRACK);

test.describe("Apex 26 — track boundaries", () => {
  test("the swept circuit list matches what the game actually loads", async ({ page }) => {
    // Replaces the old sweep's `expect(ids.length).toBeGreaterThan(10)`, and is
    // strictly stronger: that only said "the list is not empty". This says the
    // list read off disk IS the list the game builds — so a circuit whose
    // definition file exists but never reaches Tracks.LIST (or the reverse)
    // fails here, by name, instead of quietly going untested for months.
    const live = await page.evaluate(() => Tracks.LIST.map((t) => t.id).sort());
    expect(live.length).toBeGreaterThan(30);
    if (!ONLY_TRACK) expect(ALL).toEqual(live);
    else expect(live).toContain(ONLY_TRACK);
  });

  for (const id of IDS) {
    test(`${id}: finite, sane driving boundary on both sides`, async ({ page }) => {
      const s = await page.evaluate((tid) => {
        window.__apex.race(tid, "day", "dry");
        return window.__apex.wallStats();
      }, id);
      expect(s, `${id} built`).not.toBeNull();
      expect(s.anyNaN, `${id} no NaN boundary`).toBe(false);
      expect(s.minB, `${id} keeps some track`).toBeGreaterThan(1);     // never collapses
      expect(s.maxB, `${id} bounded`).toBeLessThan(60);               // never runs away
      // a barrier never sits absurdly far inside the tarmac edge
      expect(s.minOverHw, `${id} boundary not deep inside edge`).toBeGreaterThan(-1.5);
    });
  }

  for (const id of STREET) {
    // Street circuits: the WIDEST boundary still hugs the edge (no big runoff).
    test(`${id}: walled tight, as a street circuit`, async ({ page }) => {
      const r = await page.evaluate((tid) => {
        const ok = window.__apex.race(tid, "day", "dry");
        if (!ok) return { failed: `race("${tid}") returned ${String(ok)}` };
        return { stats: window.__apex.wallStats() };
      }, id);
      expect(r.failed, `${id} must build for the street-wall check`).toBeUndefined();
      expect(r.stats, `${id} wallStats`).not.toBeNull();
      expect(r.stats.street, `${id} flagged street`).toBe(true);
      expect(r.stats.minOverHw, `${id} barrier near edge`).toBeLessThan(3);
    });
  }

  test("full-lap visual barriers register collision boundaries across the wrap", async ({ page }) => {
    // Read-only: race() then wallStats(). Safe on the shared page.
    const stats = await page.evaluate(() => {
      window.__apex.race("montreal", "day", "dry");
      return window.__apex.wallStats();
    });
    expect(stats.tightFrac, "Montreal full-lap walls tighten nearly every boundary node").toBeGreaterThan(0.95);
  });

  /* THE ONE TEST HERE THAT MUST NOT SHARE A PAGE.
     It calls __apex.go() and setPhysics({ drift: 0.3 }), and the shared
     fixture's reset is deliberately shallow — held input, headless mode, the
     frozen flag, dialogs, log level. It does NOT rewind setPhysics, so that
     drift would leak into every later test on the same worker and quietly
     change what "bounded" means for them. A virgin page costs one boot and
     removes the whole question. */
  freshTest("driving hard into either edge stops bounded and recovers (sampled tracks)", async ({ page }) => {
    await page.goto("/");
    // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    for (const id of ["monaco", "monza", "baku", "spa"]) {
      const r = await page.evaluate((tid) => {
        const ok = window.__apex.race(tid, "day", "dry");
        if (!ok) return { skip: true, reason: `race("${tid}") returned ${String(ok)}` };
        window.__apex.go();
        window.__apex.setPhysics({ drift: 0.3 });
        let finite = true, maxAbsX = 0;
        // ram both edges at a few points around the lap
        for (const frac of [0.1, 0.35, 0.6, 0.85]) {
          for (const dir of [1, -1]) {
            window.__apex.jump(frac, 45, 0);
            for (let i = 0; i < 50; i++) {
              window.__apex.setInput({ steer: dir, throttle: true });
              window.__apex.step(1 / 60, 1);
              const p = window.__apex.probe();
              if (!Number.isFinite(p.x) || !Number.isFinite(p.s)) finite = false;
              maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
            }
          }
        }
        window.__apex.clearInput();
        return { finite, maxAbsX };
      }, id);
      // A track whose race() failed must not silently vanish from the sweep.
      expect(r.skip, `${id}: ${r.reason || "race() failed"} — the edge-ram sweep never ran`)
        .toBeFalsy();
      expect(r.finite, `${id} finite`).toBe(true);
      expect(r.maxAbsX, `${id} bounded`).toBeLessThan(60);
    }
  });
});
