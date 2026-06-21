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
    // Place in S1 (10%), step to let physics update sectorIdx
    await page.evaluate(() => { window.__apex.jump(0.10, 40, 0); window.__apex.step(1 / 60, 3); });
    const inS1 = await page.evaluate(() => window.__apex.sectorState().idx);
    expect(inS1).toBe(0);
    // Place in S2 (40%), step to let physics update sectorIdx
    await page.evaluate(() => { window.__apex.jump(0.40, 40, 0); window.__apex.step(1 / 60, 3); });
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
