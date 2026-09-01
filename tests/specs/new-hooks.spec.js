// @ts-check
// Contract tests for the 8 new __apex hooks added in the tracks-refactor-elevation session:
//   timing(), sectorState(), lapHistory(), fieldState(), aiPlace(),
//   setEnergy(), setLap(), trackProfile(), and obs().gear
import { sharedTest as test, expect } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function load(page, trackId = "monza") {
  // Shared page: booted once per worker by the fixture, so this is a no-op
  // in the common case. Tests that need a VIRGIN page (asserting
  // pre-track state) keep their own explicit page.goto("/") below —
  // that reloads the shared page and gives them exactly that.
  const live = await page.evaluate(() => window.__apex != null).catch(() => false);
  if (!live) {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
  }
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 10_000 });
  // go() advances past countdown; jump() initialises player.px so obs()/physState() work
  await page.evaluate(() => {
    window.__apex.go();
    window.__apex.jump(0.1, 40, 0);
  });
}

// ── timing() ────────────────────────────────────────────────────────────────

test.describe("__apex.timing()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns null before a track is loaded", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    const result = await page.evaluate(() => window.__apex.timing());
    expect(result).toBeNull();
  });

  test("returns an object with all expected fields", async ({ page }) => {
    await load(page);
    const t = await page.evaluate(() => window.__apex.timing());
    expect(typeof t.raceT).toBe("number");
    expect(typeof t.lapTime).toBe("number");
    expect(typeof t.lap).toBe("number");
    expect(typeof t.pos).toBe("number");
    expect(typeof t.total).toBe("number");
    expect(typeof t.energy).toBe("number");
    expect(typeof t.gear).toBe("number");
    expect(typeof t.sector).toBe("number");
    expect(typeof t.sectorElapsed).toBe("number");
    // best/lastLap are null until a lap completes
    expect(t.best === null || typeof t.best === "number").toBe(true);
    expect(t.lastLap === null || typeof t.lastLap === "number").toBe(true);
    // gapAhead/Behind are null or numbers
    expect(t.gapAhead === null || typeof t.gapAhead === "number").toBe(true);
    expect(t.gapBehind === null || typeof t.gapBehind === "number").toBe(true);
  });

  test("pos is between 1 and total", async ({ page }) => {
    await load(page);
    const t = await page.evaluate(() => window.__apex.timing());
    expect(t.pos).toBeGreaterThanOrEqual(1);
    expect(t.pos).toBeLessThanOrEqual(t.total);
    expect(t.total).toBeGreaterThan(1);
  });

  test("sector is 1, 2, or 3", async ({ page }) => {
    await load(page);
    const t = await page.evaluate(() => window.__apex.timing());
    expect([1, 2, 3]).toContain(t.sector);
  });

  test("gear is between 1 and 8", async ({ page }) => {
    await load(page);
    const t = await page.evaluate(() => window.__apex.timing());
    expect(t.gear).toBeGreaterThanOrEqual(1);
    expect(t.gear).toBeLessThanOrEqual(8);
  });

  test("energy is between 0 and 1", async ({ page }) => {
    await load(page);
    const t = await page.evaluate(() => window.__apex.timing());
    expect(t.energy).toBeGreaterThanOrEqual(0);
    expect(t.energy).toBeLessThanOrEqual(1);
  });

  test("raceT advances after stepping physics", async ({ page }) => {
    await load(page);
    const before = await page.evaluate(() => window.__apex.timing().raceT);
    await page.evaluate(() => window.__apex.step(1 / 60, 30));
    const after = await page.evaluate(() => window.__apex.timing().raceT);
    expect(after).toBeGreaterThan(before);
  });
});

// ── sectorState() ───────────────────────────────────────────────────────────

test.describe("__apex.sectorState()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns null before a track is loaded", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    const result = await page.evaluate(() => window.__apex.sectorState());
    expect(result).toBeNull();
  });

  test("returns idx, elapsed, bests, last", async ({ page }) => {
    await load(page);
    const s = await page.evaluate(() => window.__apex.sectorState());
    expect([0, 1, 2]).toContain(s.idx);
    expect(s.elapsed).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(s.bests)).toBe(true);
    expect(s.bests.length).toBe(3);
    expect(Array.isArray(s.last)).toBe(true);
    expect(s.last.length).toBe(3);
  });

  test("bests are null before first lap completes", async ({ page }) => {
    await load(page);
    // jump to start, lap=0, no completed laps yet
    await page.evaluate(() => { window.__apex.jump(0.01, 0, 0); });
    const s = await page.evaluate(() => window.__apex.sectorState());
    // Before any lap complete, bests may be null
    for (const b of s.bests) {
      expect(b === null || typeof b === "number").toBe(true);
    }
  });

  test("sector index is 0 in S1 and 1 in S2", async ({ page }) => {
    await load(page);
    // Place relative to this track's curated sector splits (not equal thirds).
    const bounds = await page.evaluate(() => {
      const sec = window.__apex.info().sectors || [1 / 3, 2 / 3];
      return { s1: sec[0], s2: sec[1] };
    });
    await page.evaluate((midS1) => {
      window.__apex.jump(midS1, 40, 0);
      window.__apex.step(1 / 60, 3);
    }, bounds.s1 * 0.5);
    const inS1 = await page.evaluate(() => window.__apex.sectorState().idx);
    expect(inS1).toBe(0);
    await page.evaluate(({ s1, s2 }) => {
      window.__apex.jump((s1 + s2) * 0.5, 40, 0);
      window.__apex.step(1 / 60, 3);
    }, bounds);
    const inS2 = await page.evaluate(() => window.__apex.sectorState().idx);
    expect(inS2).toBe(1);
  });
});

// ── lapHistory() ────────────────────────────────────────────────────────────

test.describe("__apex.lapHistory()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns null before a track is loaded", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    const result = await page.evaluate(() => window.__apex.lapHistory());
    expect(result).toBeNull();
  });

  test("returns mode, laps, best, lastLap in race mode", async ({ page }) => {
    await load(page);
    const h = await page.evaluate(() => window.__apex.lapHistory());
    expect(h.mode).toBe("race");
    expect(Array.isArray(h.laps)).toBe(true);
    expect(h.best === null || typeof h.best === "number").toBe(true);
    expect(h.lastLap === null || typeof h.lastLap === "number").toBe(true);
  });

  test("TT mode has mode:'tt'", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    await page.evaluate(() => window.__apex.tt("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 10_000 });
    await page.evaluate(() => window.__apex.go());
    const h = await page.evaluate(() => window.__apex.lapHistory());
    expect(h.mode).toBe("tt");
    expect(Array.isArray(h.laps)).toBe(true);
  });
});

// ── fieldState() ─────────────────────────────────────────────────────────────

test.describe("__apex.fieldState()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns null before a track is loaded", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    const result = await page.evaluate(() => window.__apex.fieldState());
    expect(result).toBeNull();
  });

  test("returns an array with one entry per car", async ({ page }) => {
    await load(page);
    const field = await page.evaluate(() => window.__apex.fieldState());
    expect(Array.isArray(field)).toBe(true);
    expect(field.length).toBeGreaterThan(1);
  });

  test("each entry has required fields", async ({ page }) => {
    await load(page);
    const field = await page.evaluate(() => window.__apex.fieldState());
    for (const c of field) {
      expect(typeof c.pos).toBe("number");
      expect(typeof c.id).toBe("number");
      expect(typeof c.name).toBe("string");
      expect(typeof c.code).toBe("string");
      expect(typeof c.isPlayer).toBe("boolean");
      expect(typeof c.lap).toBe("number");
      expect(typeof c.frac).toBe("number");
      expect(typeof c.speed).toBe("number");
      expect(typeof c.gap).toBe("number");
      expect(typeof c.finished).toBe("boolean");
    }
  });

  test("exactly one entry is the player", async ({ page }) => {
    await load(page);
    const field = await page.evaluate(() => window.__apex.fieldState());
    const players = field.filter((c) => c.isPlayer);
    expect(players.length).toBe(1);
  });

  test("pos is sequential 1..n and leader has gap 0", async ({ page }) => {
    await load(page);
    const field = await page.evaluate(() => window.__apex.fieldState());
    expect(field[0].pos).toBe(1);
    expect(field[0].gap).toBe(0);
    for (let i = 0; i < field.length; i++) expect(field[i].pos).toBe(i + 1);
  });

  test("frac values are in [0, 1)", async ({ page }) => {
    await load(page);
    const field = await page.evaluate(() => window.__apex.fieldState());
    for (const c of field) {
      expect(c.frac).toBeGreaterThanOrEqual(0);
      expect(c.frac).toBeLessThan(1);
    }
  });
});

// ── aiPlace() ───────────────────────────────────────────────────────────────

test.describe("__apex.aiPlace()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns false before a track is loaded", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    const result = await page.evaluate(() => window.__apex.aiPlace(0, 0.5));
    expect(result).toBe(false);
  });

  test("returns false when called on the player car", async ({ page }) => {
    await load(page);
    // Find the player car index
    const result = await page.evaluate(() => {
      const cars = window.__apex.cars();
      const pi = cars.findIndex((c) => c.p);
      return window.__apex.aiPlace(pi, 0.5);
    });
    expect(result).toBe(false);
  });

  test("returns false for out-of-range index", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => window.__apex.aiPlace(999, 0.5));
    expect(result).toBe(false);
  });

  test("places an AI car at the specified fraction", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const cars = window.__apex.cars();
      const ai = cars.find((c) => !c.p);
      return window.__apex.aiPlace(cars.indexOf(ai), 0.6, 40, 0);
    });
    expect(result).not.toBe(false);
    expect(result.frac).toBeCloseTo(0.6, 1);
    expect(result.speed).toBeCloseTo(40, 0);
    expect(result.x).toBeCloseTo(0, 1);
  });

  test("aiPlace result is reflected in fieldState", async ({ page }) => {
    await load(page);
    await page.evaluate(() => {
      const cars = window.__apex.cars();
      const ai = cars.find((c) => !c.p);
      window.__apex.aiPlace(cars.indexOf(ai), 0.8, 50, 0);
    });
    const field = await page.evaluate(() => window.__apex.fieldState());
    const fracs = field.map((c) => c.frac);
    // at least one car should be near 0.8
    expect(fracs.some((f) => Math.abs(f - 0.8) < 0.05)).toBe(true);
  });
});

// ── setEnergy() ─────────────────────────────────────────────────────────────

test.describe("__apex.setEnergy()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns false before a track is loaded", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    expect(await page.evaluate(() => window.__apex.setEnergy(0.5))).toBe(false);
  });

  test("sets energy to the given value", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => window.__apex.setEnergy(0.42));
    expect(r.energy).toBeCloseTo(0.42, 2);
    const obs = await page.evaluate(() => window.__apex.obs());
    expect(obs.energy).toBeCloseTo(0.42, 2);
  });

  test("clamps to 0", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => window.__apex.setEnergy(-5));
    expect(r.energy).toBe(0);
  });

  test("clamps to 1", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => window.__apex.setEnergy(99));
    expect(r.energy).toBe(1);
  });

  test("energy is visible in timing() after setEnergy()", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.setEnergy(0.25));
    const t = await page.evaluate(() => window.__apex.timing());
    expect(t.energy).toBeCloseTo(0.25, 2);
  });
});

// ── setLap() ────────────────────────────────────────────────────────────────

test.describe("__apex.setLap()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns false before a track is loaded", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    expect(await page.evaluate(() => window.__apex.setLap(3))).toBe(false);
  });

  test("sets the player lap counter", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => window.__apex.setLap(4));
    expect(r.lap).toBe(4);
    const info = await page.evaluate(() => window.__apex.physState().lap);
    expect(info).toBe(4);
  });

  test("clamps negative to 0", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => window.__apex.setLap(-1));
    expect(r.lap).toBe(0);
  });

  test("floors fractional input", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => window.__apex.setLap(2.9));
    expect(r.lap).toBe(2);
  });

  test("lap change is visible in timing()", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.setLap(5));
    const t = await page.evaluate(() => window.__apex.timing());
    expect(t.lap).toBe(5);
  });
});

// ── trackProfile() ──────────────────────────────────────────────────────────

test.describe("__apex.trackProfile()", () => {
  test.use({ viewport: LANDSCAPE });

  test("works on the default track loaded at startup (no race() call)", async ({ page }) => {
    // The game pre-loads a track on startup; trackProfile() should work immediately.
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    const pts = await page.evaluate(() => window.__apex.trackProfile(10));
    expect(Array.isArray(pts)).toBe(true);
    expect(pts.length).toBe(10);
  });

  test("default returns 100 entries", async ({ page }) => {
    await load(page);
    const pts = await page.evaluate(() => window.__apex.trackProfile());
    expect(pts.length).toBe(100);
  });

  test("respects custom n", async ({ page }) => {
    await load(page);
    const pts = await page.evaluate(() => window.__apex.trackProfile(36));
    expect(pts.length).toBe(36);
  });

  test("clamps n to max 1000", async ({ page }) => {
    await load(page);
    const pts = await page.evaluate(() => window.__apex.trackProfile(9999));
    expect(pts.length).toBe(1000);
  });

  test("each entry has frac, y, k, hw, slope", async ({ page }) => {
    await load(page);
    const pts = await page.evaluate(() => window.__apex.trackProfile(10));
    for (const p of pts) {
      expect(typeof p.frac).toBe("number");
      expect(typeof p.y).toBe("number");
      expect(typeof p.k).toBe("number");
      expect(typeof p.hw).toBe("number");
      expect(typeof p.slope).toBe("number");
    }
  });

  test("fracs run from 0 up to just below 1", async ({ page }) => {
    await load(page);
    const pts = await page.evaluate(() => window.__apex.trackProfile(50));
    expect(pts[0].frac).toBeCloseTo(0, 3);
    expect(pts[pts.length - 1].frac).toBeLessThan(1);
  });

  test("all y values are finite numbers", async ({ page }) => {
    await load(page);
    const pts = await page.evaluate(() => window.__apex.trackProfile(100));
    for (const p of pts) expect(isFinite(p.y)).toBe(true);
  });

  test("hw (half-width) is positive everywhere", async ({ page }) => {
    await load(page);
    const pts = await page.evaluate(() => window.__apex.trackProfile(100));
    for (const p of pts) expect(p.hw).toBeGreaterThan(0);
  });

  test("Spa has measurable elevation change (>10 m)", async ({ page }) => {
    await load(page, "spa");
    const pts = await page.evaluate(() => window.__apex.trackProfile(360));
    const maxY = Math.max(...pts.map((p) => p.y));
    const minY = Math.min(...pts.map((p) => p.y));
    expect(maxY - minY).toBeGreaterThan(10);
  });

  test("Shanghai stays flat-by-F1-standards, with a real back-straight crest", async ({ page }) => {
    // Was "stays nearly flat" with range <= 2. That bound was written against
    // docs/tracks/shanghai.md's old "near-flat, two subtle bumps" description,
    // not against the circuit's own data: js/circuits/shanghai.js's `elevations`
    // comment has always described the site as "engineered with ~6 m of
    // long-wavelength relief" and defends a deliberate 6.5 m back-straight crest
    // against a prop-interpenetration bug. Measured range is 6.735 m — the bound
    // was stale from the moment it was written, not the data. Widened to match
    // reality (with headroom) rather than the data quietly re-narrowed to fit an
    // assertion nobody re-checked against its own circuit file.
    await load(page, "shanghai");
    const result = await page.evaluate(() => {
      const pts = window.__apex.trackProfile(400);
      const at = (frac) => pts.reduce((best, point) =>
        Math.abs(point.frac - frac) < Math.abs(best.frac - frac) ? point : best);
      const minY = Math.min(...pts.map((point) => point.y));
      const maxY = Math.max(...pts.map((point) => point.y));
      return {
        range: maxY - minY,
        // RACING FRACTIONS, and they moved. These sampled 0.06/0.30 until
        // 7a17351 corrected 22 circuits' start lines: that commit holds the
        // physical world still (sceneryStartFrac/_sceneryShift) and moves the
        // LINE, which necessarily re-numbers every feature's racing fraction —
        // here by shanghai's _sceneryShift of 0.0895. The two authored bumps
        // (js/circuits/shanghai.js `elevations`) now sit at 0.1495 and 0.3895.
        // If these ever read ~0.35 again, re-measure the bumps; do NOT "fix"
        // the elevation transform in js/track/tracks.js — its two-step
        // fmap+_sceneryShift composition is the documented contract (see the
        // note at its fmap site and js/circuits/suzuka.js:39-41).
        firstBumpRise: at(0.1495).y - minY,
        backStraightCrestRise: at(0.3895).y - minY,
      };
    });
    expect(result.range).toBeGreaterThanOrEqual(5.5);
    expect(result.range).toBeLessThanOrEqual(7.5);
    expect(result.firstBumpRise).toBeGreaterThan(0.35);
    expect(result.backStraightCrestRise).toBeGreaterThan(0.35);
  });
});

// ── obs().gear ──────────────────────────────────────────────────────────────

test.describe("obs().gear", () => {
  test.use({ viewport: LANDSCAPE });

  test("gear field is present and in 1-8 range", async ({ page }) => {
    await load(page);
    const obs = await page.evaluate(() => window.__apex.obs());
    expect(obs).not.toBeNull();
    expect(typeof obs.gear).toBe("number");
    expect(obs.gear).toBeGreaterThanOrEqual(1);
    expect(obs.gear).toBeLessThanOrEqual(8);
  });

  test("gear matches timing().gear", async ({ page }) => {
    await load(page);
    const [obs, t] = await page.evaluate(() => [window.__apex.obs(), window.__apex.timing()]);
    expect(obs.gear).toBe(t.gear);
  });

  test("gear increases at high speed after stepping physics", async ({ page }) => {
    await load(page);
    await page.evaluate(() => {
      window.__apex.jump(0.05, 80, 0);
      window.__apex.setInput({ steer: 0, throttle: true, brake: false });
      window.__apex.step(1 / 60, 120);  // ~2 s
      window.__apex.clearInput();
    });
    const obs = await page.evaluate(() => window.__apex.obs());
    // At 80+ m/s the car should be in a high gear
    expect(obs.gear).toBeGreaterThanOrEqual(4);
  });
});

// ── shared track foundation diagnostics ─────────────────────────────────────

test.describe("shared track foundation diagnostics", () => {
  test.use({ viewport: LANDSCAPE });

  test("Silverstone uses grounded required landmarks and airfield-scale terrain", async ({ page }) => {
    await load(page, "silverstone");
    const result = await page.evaluate(() => {
      const profile = window.__apex.trackProfile(400);
      const peak = profile.reduce((a, b) => b.y > a.y ? b : a);
      const trough = profile.reduce((a, b) => b.y < a.y ? b : a);
      const ground = [0.04, 0.12, 0.45, 0.55, 0.85].flatMap((frac) =>
        [-30, 0, 30].map((lat) => ({
          lat, sample: window.__apex.groundY(frac, lat),
        }))
      );
      return {
        elevationRange: peak.y - trough.y,
        peakFrac: peak.frac,
        troughFrac: trough.frac,
        ground,
        walls: window.__apex.wallStats(),
        models: window.__apex.modelDiagnostics(),
        geometry: window.__apex.geometryDiagnostics(),
      };
    });

    expect(result.elevationRange).toBeGreaterThanOrEqual(10);
    expect(result.elevationRange).toBeLessThanOrEqual(20);
    // Peak/trough RACING fractions, rotated by silverstone's _sceneryShift
    // (0.1502) when 7a17351 moved the start line — the hill itself did not
    // move. Were 0.12/0.55 against the pre-move line. See the shanghai note
    // above before touching the elevation transform.
    expect(Math.abs(result.peakFrac - 0.265)).toBeLessThan(0.03);
    expect(Math.abs(result.troughFrac - 0.6975)).toBeLessThan(0.03);
    expect(result.ground.every(({ lat, sample }) =>
      (lat === 0 || sample.terrainY != null) &&
      (sample.gap == null || sample.gap <= 0.18)
    )).toBe(true);
    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.tightFrac).toBeGreaterThan(0.15);
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);

    const requiredIds = result.models.emitted
      .filter((entry) => entry.required)
      .map((entry) => entry.id);
    expect(requiredIds).toEqual(expect.arrayContaining([
      "silverstone-control-tower",
      "silverstone-start-gantry",
    ]));
    const wingSegments = result.models.emitted
      .filter((entry) => entry.id.startsWith("silverstone-wing-facade-"));
    expect(wingSegments.map((entry) => entry.id)).toEqual([
      "silverstone-wing-facade-1",
      "silverstone-wing-facade-2",
      "silverstone-wing-facade-3",
      "silverstone-wing-facade-4",
    ]);
    expect(wingSegments.every((entry) =>
      entry.required && entry.vertices >= 96
    )).toBe(true);
    const hard = [
      ...result.models.invalid,
      ...result.models.suppressed,
      ...result.models.unsafe,
    ].filter((entry) => entry.required);
    expect(hard).toEqual([]);
    for (const span of result.models.emitted.filter((entry) => entry.overhead))
      expect(span.clearance).toBeGreaterThanOrEqual(4.8);
  });

  test("reports finite geometry and structured model outcomes", async ({ page }) => {
    await load(page, "cota");
    const result = await page.evaluate(() => ({
      geometry: window.__apex.geometryDiagnostics(),
      models: window.__apex.modelDiagnostics(),
    }));
    expect(result.geometry.length).toBeGreaterThan(5);
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);
    expect(Array.isArray(result.models.emitted)).toBe(true);
    expect(Array.isArray(result.models.suppressed)).toBe(true);
    expect(Array.isArray(result.models.invalid)).toBe(true);
    expect(Array.isArray(result.models.unsafe)).toBe(true);
    const hard = [...result.models.invalid, ...result.models.suppressed, ...result.models.unsafe]
      .filter((entry) => entry.required);
    expect(hard).toEqual([]);
    for (const span of result.models.emitted.filter((entry) => entry.overhead))
      expect(span.clearance).toBeGreaterThanOrEqual(4.8);
  });

  test("Miami emits validated water, grouped heroes, and safe overpasses", async ({ page }) => {
    test.slow();
    await load(page, "miami");
    const result = await page.evaluate(() => ({
      geometry: window.__apex.geometryDiagnostics(),
      models: window.__apex.modelDiagnostics(),
      profile: window.__apex.trackProfile(240),
      walls: window.__apex.wallStats(),
      groundGaps: [0.20, 0.42, 0.66].flatMap((frac) =>
        [-6, 0, 6].map((lat) => window.__apex.groundY(frac, lat).gap)),
    }));
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);
    const hard = [...result.models.invalid, ...result.models.suppressed, ...result.models.unsafe]
      .filter((entry) => entry.required);
    expect(hard).toEqual([]);
    const ids = new Set(result.models.emitted.map((entry) => entry.id));
    for (const id of [
      "beach-club-sand", "beach-club-pool", "beach-club-cabana",
      "mia-marina-water-0", "mia-marina-water-1", "mia-marina-water-2",
      "msc-yacht-club",
    ]) expect(ids.has(id), id).toBe(true);
    const spans = result.models.emitted.filter((entry) => entry.id.startsWith("turnpike-overpass-"));
    expect(spans).toHaveLength(2);
    expect(spans.every((entry) => entry.overhead && entry.clearance >= 4.8)).toBe(true);
    const peak = result.profile.reduce((best, point) => point.y > best.y ? point : best);
    // Racing fraction, rotated by miami's _sceneryShift (0.2008) when 7a17351
    // moved the start line. Was 0.66 against the pre-move line; the crest is
    // physically unmoved. See the shanghai note before touching the transform.
    expect(Math.abs(peak.frac - 0.8583)).toBeLessThan(0.04);
    expect(peak.y).toBeGreaterThan(3);
    expect(result.walls.tightFrac).toBeGreaterThan(0.35);
    expect(result.groundGaps.every((gap) => gap === null || gap <= 0.18)).toBe(true);
  });

  test("Jeddah declares its migrated waterfront foundation contracts", async ({ page }) => {
    await load(page, "jeddah");
    const result = await page.evaluate(() => {
      const def = Tracks.LIST.find((entry) => entry.id === "jeddah");
      const profile = window.__apex.trackProfile(360);
      const terrainGaps = [];
      for (let i = 0; i < 72; i++) {
        for (const lat of [-6, -3, 0, 3, 6]) {
          const gap = window.__apex.groundY(i / 72, lat).gap;
          if (gap != null) terrainGaps.push(gap);
        }
      }
      return {
        def: {
          sceneryCoordinates: def.sceneryCoordinates,
          terrainOuter: def.terrainOuter,
          dressingExclusions: def.dressingExclusions,
        },
        elevationRange: Math.max(...profile.map((entry) => entry.y)) -
          Math.min(...profile.map((entry) => entry.y)),
        maxTerrainGap: Math.max(...terrainGaps),
        walls: window.__apex.wallStats(),
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
      };
    });

    expect(result.def.sceneryCoordinates).toBe("racing");
    expect(result.def.terrainOuter).toBe(28);
    expect(result.def.dressingExclusions).toEqual(expect.arrayContaining([
      { kind: "city", s0: 0.05, s1: 0.66, side: 1 },
      { kind: "lamps", s0: 0, s1: 1 },
      { kind: "foliage", s0: 0.05, s1: 0.66, side: 1 },
    ]));
    expect(result.elevationRange).toBeLessThanOrEqual(3);
    expect(result.maxTerrainGap).toBeLessThanOrEqual(0.18);
    expect(result.walls.tightFrac).toBeGreaterThan(0.99);
    expect(result.walls.minOverHw).toBeGreaterThanOrEqual(0);
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);
    expect(result.geometry.find((entry) => entry.name === "water")?.vertices).toBeGreaterThan(0);
    const required = result.models.emitted.filter((entry) => entry.required).map((entry) => entry.id);
    expect(required).toEqual(expect.arrayContaining([
      "jeddah-fountain", "jeddah-floating-mosque", "jeddah-flagpole",
    ]));
    const hard = [...result.models.invalid, ...result.models.suppressed, ...result.models.unsafe]
      .filter((entry) => entry.required);
    expect(hard).toEqual([]);
    const overhead = result.models.emitted.filter((entry) => entry.overhead);
    expect(overhead).toHaveLength(2);
    for (const span of overhead)
      expect(span.clearance).toBeGreaterThanOrEqual(4.8);
  });

  test("night rebuilds expose a distinct validated props manifest", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    const counts = await page.evaluate(async () => {
      await window.__apex.race("singapore", "day", "dry");
      const day = window.__apex.geometryDiagnostics().find((entry) => entry.name === "props").vertices;
      await window.__apex.race("singapore", "night", "dry");
      const night = window.__apex.geometryDiagnostics().find((entry) => entry.name === "props").vertices;
      return { day, night };
    });
    expect(counts.day).toBeGreaterThan(0);
    expect(counts.night).toBeGreaterThan(0);
    expect(counts.night).not.toBe(counts.day);
  });

  test("Singapore migration keeps models, walls, terrain, and elevation intentional", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    const result = await page.evaluate(async () => {
      await window.__apex.race("singapore", "day", "dry");
      const day = {
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
      };
      await window.__apex.race("singapore", "night", "dry");
      const geometry = window.__apex.geometryDiagnostics();
      const models = window.__apex.modelDiagnostics();
      const profile = window.__apex.trackProfile(720);
      const low = profile.reduce((a, b) => b.y < a.y ? b : a);
      const high = profile.reduce((a, b) => b.y > a.y ? b : a);
      const terrainGaps = [];
      for (let i = 0; i < 120; i++) {
        for (const lat of [-6, 0, 6])
          terrainGaps.push(window.__apex.groundY(i / 120, lat).gap);
      }
      return {
        day, geometry,
        models,
        walls: window.__apex.wallStats(),
        props: geometry.find((entry) => entry.name === "props")?.vertices,
        elevation: { range: high.y - low.y, lowFrac: low.frac, highFrac: high.frac },
        terrainGaps,
      };
    });

    expect(result.day.geometry.every((entry) => entry.ok)).toBe(true);
    expect(result.day.models.invalid).toEqual([]);
    expect(result.day.models.suppressed).toEqual([]);
    expect(result.day.models.unsafe).toEqual([]);
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);
    expect(result.props).toBeGreaterThan(0);
    // Was <= 700_000, measured 1,271,799 — the bound predated a real defect
    // (js/circuits/singapore.js's own cityFront() facades and the generic
    // street-night city generator in js/track/tracks.js were BOTH placing a
    // full building row over most of side -1's frontage — same class of
    // redundant layer as the Qatar precedent, fc40591b) and a real excess
    // (cityFront()'s along() step was dense enough to hit neonFacade's
    // row/col LOD caps on every unit, past the point of visible return).
    // Fixed both — dressingExclusions now cover exactly side -1's bespoke
    // range instead of none of it, and the four cityFront() calls stepped
    // out from 44/62/44/48 to 70/95/70/75 — then re-measured at 954,223
    // rather than the bound quietly renarrowed to fit. The CBD skyline this
    // side still fully covers (no bare frontage; the generic pass still
    // fills the ~35% of side -1 with no bespoke facade), just with fewer,
    // still height/hash-varied units per street-canyon run.
    expect(result.props).toBeLessThan(1_050_000);
    expect(result.models.invalid).toEqual([]);
    expect(result.models.suppressed).toEqual([]);
    expect(result.models.unsafe).toEqual([]);
    const emitted = new Set(result.models.emitted.map((entry) => entry.id));
    for (const id of [
      "marina-bay-sands", "marina-water-30", "marina-water-84",
      "sheares-deck-0", "finish-underpass-deck-2", "start-light-cluster",
    ]) expect(emitted.has(id), id).toBe(true);
    for (const span of result.models.emitted.filter((entry) => entry.overhead))
      expect(span.clearance).toBeGreaterThanOrEqual(4.8);
    expect(result.walls.tightFrac).toBe(1);
    expect(result.walls.minOverHw).toBeGreaterThanOrEqual(0);
    expect(result.terrainGaps.every((gap) => gap === null || gap <= 0.18)).toBe(true);
    expect(result.elevation.range).toBeGreaterThan(4);
    expect(result.elevation.range).toBeLessThan(6);
    expect(result.elevation.lowFrac).toBeCloseTo(0.10, 1);
    expect(result.elevation.highFrac).toBeCloseTo(0.62, 1);
  });
});

test.describe("Madrid track foundation migration", () => {
  test.use({ viewport: LANDSCAPE });

  test("owns safe grounded scenery with the intended urban elevation profile", async ({ page }) => {
    test.setTimeout(300000);
    await load(page, "madrid");
    const result = await page.evaluate(() => {
      const def = Tracks.LIST.find((track) => track.id === "madrid");
      const profile = window.__apex.trackProfile(240);
      const min = profile.reduce((a, b) => a.y < b.y ? a : b);
      const max = profile.reduce((a, b) => a.y > b.y ? a : b);
      return {
        sceneryCoordinates: def.sceneryCoordinates,
        terrainOuter: def.terrainOuter,
        dressingExclusions: def.dressingExclusions,
        elevation: { range: max.y - min.y, maxFrac: max.frac },
        walls: window.__apex.wallStats(),
        day: {
          geometry: window.__apex.geometryDiagnostics(),
          models: window.__apex.modelDiagnostics(),
        },
      };
    });

    expect(result.sceneryCoordinates).toBe("racing");
    expect(result.terrainOuter).toBeGreaterThanOrEqual(48);
    expect(result.dressingExclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kinds: ["city", "foliage"], s0: 0.95, s1: 0.06 }),
      expect.objectContaining({ kinds: ["city", "foliage", "lighting"], s0: 0.68, s1: 0.83 }),
    ]));
    expect(result.elevation.range).toBeGreaterThanOrEqual(20);
    expect(result.elevation.range).toBeLessThanOrEqual(32);
    expect(result.elevation.maxFrac).toBeGreaterThan(0.30);
    expect(result.elevation.maxFrac).toBeLessThan(0.50);
    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.tightFrac).toBeGreaterThan(0.90);

    const assertSession = (session) => {
      expect(session.geometry.every((entry) => entry.ok)).toBe(true);
      // Was <= 250_000, measured day 621,075 / night 968,561 — unreachable from
      // the start, not just untuned: even with EVERY generic-city building
      // excluded lap-wide (kinds:["city"], s0:0, s1:1 — zero buildings, day and
      // night identical) Madrid still measures ~435,000. That floor is the
      // required bespoke content alone (ifemaHall/monumentalStand/urbanBlock/
      // motorway overpass — the landmarks `assertSession` itself requires
      // below), all raw addBox() and so invisible to js/track/graph.js's
      // instancing stats the same way js/track/tracks.js's generic city was
      // invisible on Singapore (CI-3). No bound above ~435,000 was ever
      // achievable here. Real cut applied on top of that floor: two more
      // dressingExclusions (s 0.15-0.55 and 0.83-0.95) drop the generic city's
      // lap coverage from ~74% to ~22%, kept only near the two landmark
      // precincts (IFEMA pit straight, La Monumental bowl) it was already
      // theme-matched to — down to day 470,281 / night 578,619, in the same
      // range as Interlagos (620,000) and Montreal (580,000).
      expect(session.geometry.find((entry) => entry.name === "props").vertices).toBeLessThan(650000);
      const hard = [...session.models.invalid, ...session.models.suppressed, ...session.models.unsafe]
        .filter((entry) => entry.required);
      expect(hard).toEqual([]);
      const ids = session.models.emitted.map((entry) => entry.id);
      expect(ids).toEqual(expect.arrayContaining([
        "madrid-ifema-hall",
        "madrid-monumental",
        "madrid-motorway-overpass",
      ]));
      for (const span of session.models.emitted.filter((entry) => entry.overhead))
        expect(span.clearance).toBeGreaterThanOrEqual(4.8);
    };
    assertSession(result.day);

    const night = await page.evaluate(async () => {
      await window.__apex.race("madrid", "night", "dry");
      return {
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
      };
    });
    assertSession(night);
  });

  test("Shanghai declares safe required heroes and reflective water", async ({ page }) => {
    await load(page, "shanghai");
    const sessions = await page.evaluate(async () => {
      const inspect = () => ({
        models: window.__apex.modelDiagnostics(),
        geometry: window.__apex.geometryDiagnostics(),
        walls: window.__apex.wallStats(),
        ground: [0, 0.06, 0.30, 0.62, 0.90].flatMap((frac) =>
          [-6, 0, 6].map((lat) => window.__apex.groundY(frac, lat).gap)),
      });
      const day = inspect();
      await window.__apex.race("shanghai", "night", "dry");
      return { day, night: inspect() };
    });
    for (const [time, state] of Object.entries(sessions)) {
      const diagnostics = state.models;
      const emitted = new Map(diagnostics.emitted.map((entry) => [entry.id, entry]));
      for (const id of ["shanghai-wing-east", "shanghai-wing-west", "shanghai-pudong"])
        expect(emitted.get(id)?.required, `${time}: ${id}`).toBe(true);
      expect([...emitted.values()].filter((entry) =>
        entry.overhead && entry.id.startsWith("shanghai-wing-"))).toHaveLength(2);
      for (const id of ["shanghai-yu-lake-south", "shanghai-yu-lake-north", "shanghai-marsh-pool"])
        expect(emitted.get(id)?.water, `${time}: ${id}`).toBe(true);
      expect([...diagnostics.invalid, ...diagnostics.suppressed, ...diagnostics.unsafe]
        .filter((entry) => entry.required)).toEqual([]);
      expect(state.geometry.every((entry) => entry.ok)).toBe(true);
      expect(state.walls.anyNaN).toBe(false);
      expect(state.walls.minB).toBeGreaterThan(1);
      expect(state.walls.maxB).toBeLessThan(60);
      expect(state.walls.minOverHw).toBeGreaterThan(-1.5);
      expect(state.ground.every((gap) => gap == null || gap <= 0.18)).toBe(true);
    }
  });
});
