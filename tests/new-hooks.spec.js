// @ts-check
// Contract tests for the 8 new __apex hooks added in the tracks-refactor-elevation session:
//   timing(), sectorState(), lapHistory(), fieldState(), aiPlace(),
//   setEnergy(), setLap(), trackProfile(), and obs().gear
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function load(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    await page.evaluate(() => window.__apex.tt("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
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

  test("Shanghai stays nearly flat with two subtle rises", async ({ page }) => {
    await load(page, "shanghai");
    const result = await page.evaluate(() => {
      const pts = window.__apex.trackProfile(400);
      const at = (frac) => pts.reduce((best, point) =>
        Math.abs(point.frac - frac) < Math.abs(best.frac - frac) ? point : best);
      const minY = Math.min(...pts.map((point) => point.y));
      const maxY = Math.max(...pts.map((point) => point.y));
      return {
        range: maxY - minY,
        maxGradePct: Math.max(...pts.map((point) => Math.abs(point.slope || 0))) * 100,
        turnOneRise: at(0.06).y - minY,
        turnSixRise: at(0.30).y - minY,
      };
    });
    // ~6.7 m of long-wavelength relief, and that IS flat by F1 standards —
    // Monza measures 5.96 m over its lap, Spa 102 m. The circuit authors this
    // shape on purpose: a 6.5 m crest at s=0.4525, pinned there because raising
    // the s=0.2125 bump instead trips the prop-interpenetration ratchet
    // (js/circuits/shanghai.js). The bound used to read <= 2 m, measured
    // against an earlier and flatter trace, and had been failing from the
    // moment the elevations were authored — the data moved and the test did
    // not follow.
    expect(result.range).toBeGreaterThanOrEqual(5.5);
    expect(result.range).toBeLessThanOrEqual(8);
    // What "nearly flat" actually means, and the half a range cannot express:
    // no gradient a driver would feel anywhere on the lap. Spa peaks at 22 %,
    // Madrid at 7.5 %, Monza at 2.8 %. A circuit could satisfy the range bound
    // above with a cliff in it; this is what rules that out.
    expect(result.maxGradePct).toBeLessThan(4);
    expect(result.turnOneRise).toBeGreaterThan(0.35);
    expect(result.turnSixRise).toBeGreaterThan(0.35);
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
    expect(Math.abs(result.peakFrac - 0.12)).toBeLessThan(0.03);
    expect(Math.abs(result.troughFrac - 0.55)).toBeLessThan(0.03);
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
    expect(Math.abs(peak.frac - 0.66)).toBeLessThan(0.04);
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
    // ~9.6 m across the lap, which is exactly what the def sets out to build:
    // "the real corniche rolls ~9 m across the lap" (js/circuits/jeddah.js).
    // The <= 3 m this used to assert belonged to the trace that shipped before
    // it — the one that same comment describes as "essentially level (2.2 m)"
    // and that the elevation rework replaced. The test kept the old contract.
    expect(result.elevationRange).toBeGreaterThanOrEqual(8);
    expect(result.elevationRange).toBeLessThanOrEqual(11);
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const counts = await page.evaluate(() => {
      window.__apex.race("singapore", "day", "dry");
      const day = window.__apex.geometryDiagnostics().find((entry) => entry.name === "props").vertices;
      window.__apex.race("singapore", "night", "dry");
      const night = window.__apex.geometryDiagnostics().find((entry) => entry.name === "props").vertices;
      return { day, night };
    });
    expect(counts.day).toBeGreaterThan(0);
    expect(counts.night).toBeGreaterThan(0);
    expect(counts.night).not.toBe(counts.day);
  });

  test("Singapore migration keeps models, walls, terrain, and elevation intentional", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const result = await page.evaluate(() => {
      window.__apex.race("singapore", "day", "dry");
      const day = {
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
      };
      window.__apex.race("singapore", "night", "dry");
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
    // A MEASURED ceiling with headroom, not a design target — it exists to
    // catch a runaway, not to hold dressing still.
    //
    // The old 700k was set against a sparser scenery engine, and a census of
    // all 40 circuits puts the fleet MEDIAN peak at ~680k: it was asking one of
    // the five densest street circuits on the calendar to sit at the median.
    // Singapore measures ~800k by day and ~1.27M at night (the night build is
    // the denser one, which is why this reads the night geometry); Vegas, the
    // densest, runs ~1.83M. Nothing is wrong — geometryDiagnostics reports ok
    // on every circuit — the budget simply stopped tracking the engine.
    expect(result.props).toBeLessThan(1_500_000);
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
      expect.objectContaining({ kinds: ["city", "foliage", "lamps", "floodlights"], s0: 0.68, s1: 0.83 }),
    ]));
    expect(result.elevation.range).toBeGreaterThanOrEqual(20);
    expect(result.elevation.range).toBeLessThanOrEqual(32);
    expect(result.elevation.maxFrac).toBeGreaterThan(0.30);
    expect(result.elevation.maxFrac).toBeLessThan(0.50);
    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.tightFrac).toBeGreaterThan(0.90);

    const assertSession = (session) => {
      expect(session.geometry.every((entry) => entry.ok)).toBe(true);
      // Measured ceiling with headroom — same reasoning as the Singapore note
      // above, and this one is asserted against BOTH sessions below, so it has
      // to cover the denser night build. Madrid runs ~621k by day and ~969k at
      // night. The old 250k sat below the fleet median peak of ~680k, so it had
      // stopped being a budget and started being a permanent failure.
      expect(session.geometry.find((entry) => entry.name === "props").vertices).toBeLessThan(1_150_000);
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

    const night = await page.evaluate(() => {
      window.__apex.race("madrid", "night", "dry");
      return {
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
      };
    });
    assertSession(night);
  });

  test("Shanghai declares safe required heroes and reflective water", async ({ page }) => {
    await load(page, "shanghai");
    const sessions = await page.evaluate(() => {
      const inspect = () => ({
        models: window.__apex.modelDiagnostics(),
        geometry: window.__apex.geometryDiagnostics(),
        walls: window.__apex.wallStats(),
        ground: [0, 0.06, 0.30, 0.62, 0.90].flatMap((frac) =>
          [-6, 0, 6].map((lat) => window.__apex.groundY(frac, lat).gap)),
      });
      const day = inspect();
      window.__apex.race("shanghai", "night", "dry");
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
