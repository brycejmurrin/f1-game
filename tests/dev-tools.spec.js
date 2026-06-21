// @ts-check
// Tests for the window.__apex dev/test API — verifies every method returns the
// correct shape, handles edge-cases, and actually mutates game state as described.
// These double as living documentation: if a method's contract changes this file breaks.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function load(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
}

async function loadParked(page, frac = 0.1, trackId = "monza") {
  await load(page, trackId);
  await page.evaluate((f) => window.__apex.park(f), frac);
  await page.waitForTimeout(200);
}

// ── Catalog / meta ─────────────────────────────────────────────────────────

test.describe("__apex.tracks()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns array with at least 20 circuits", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const list = await page.evaluate(() => window.__apex.tracks());
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(20);
  });

  test("each entry has id, name, and sequential index", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const list = await page.evaluate(() => window.__apex.tracks());
    for (let i = 0; i < list.length; i++) {
      expect(typeof list[i].id).toBe("string");
      expect(typeof list[i].name).toBe("string");
      expect(list[i].i).toBe(i);
    }
  });

  test("bahrain is in the list", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const list = await page.evaluate(() => window.__apex.tracks());
    expect(list.some((t) => t.id === "bahrain")).toBe(true);
  });
});

test.describe("__apex.teams()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns at least 10 teams with engine field", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const list = await page.evaluate(() => window.__apex.teams());
    expect(list.length).toBeGreaterThanOrEqual(10);
    for (const t of list) {
      expect(typeof t.id).toBe("string");
      expect(typeof t.engine).toBe("string");
    }
  });

  test("Mercedes team has engine 'Mercedes'", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const teams = await page.evaluate(() => window.__apex.teams());
    const merc = teams.find((t) => t.id === "mercedes");
    expect(merc).toBeTruthy();
    expect(merc.engine).toBe("Mercedes");
  });
});

// ── Race lifecycle ─────────────────────────────────────────────────────────

test.describe("__apex.race()", () => {
  test.use({ viewport: LANDSCAPE });

  test("loads a track by id and returns metadata", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const r = await page.evaluate(() => window.__apex.race("spa"));
    expect(r.track).toBe("spa");
    expect(r.weather).toBe("dry");
  });

  test("returns false for unknown track id", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const r = await page.evaluate(() => window.__apex.race("notatrack"));
    expect(r).toBe(false);
  });

  test("race() with wet sets weather", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const r = await page.evaluate(() => window.__apex.race("bahrain", "day", "wet"));
    expect(r.weather).toBe("wet");
    expect(await page.evaluate(() => window.__apex.weather())).toBe("wet");
  });
});

test.describe("__apex.finishRace()", () => {
  test.use({ viewport: LANDSCAPE });

  test("transitions state to results and shows results panel", async ({ page }) => {
    await loadParked(page);
    const r = await page.evaluate(() => window.__apex.finishRace());
    expect(r).not.toBe(false);
    await page.locator("#results").waitFor({ state: "visible" });
    const infoState = await page.evaluate(() => window.__apex.info().state);
    expect(infoState).toBe("results");
    await page.screenshot({ path: "tests/ui-screenshots/dev-tools-finish-race.png" });
  });

  test("returns false when no race is loaded", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const r = await page.evaluate(() => window.__apex.finishRace());
    expect(r).toBe(false);
  });

  test("results table is populated after finishRace()", async ({ page }) => {
    await loadParked(page);
    await page.evaluate(() => window.__apex.finishRace());
    await page.locator("#results").waitFor({ state: "visible" });
    const rows = await page.locator(".res-row").count();
    expect(rows).toBeGreaterThan(0);
  });
});

test.describe("__apex.info()", () => {
  test.use({ viewport: LANDSCAPE });

  test("track is null before race loads", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.track).toBeNull();
  });

  test("returns track id and total after race starts", async ({ page }) => {
    await load(page);
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.track).toBe("monza");
    expect(info.total).toBeGreaterThan(0);
    expect(info.n).toBeGreaterThan(0);
  });

  test("state changes after finishRace()", async ({ page }) => {
    await loadParked(page);
    await page.evaluate(() => window.__apex.finishRace());
    await page.locator("#results").waitFor({ state: "visible" });
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.state).toBe("results");
  });

  test("timeTrial and seasonMode are false in normal race", async ({ page }) => {
    await load(page);
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.timeTrial).toBe(false);
    expect(info.seasonMode).toBe(false);
  });
});

// ── Camera tools ───────────────────────────────────────────────────────────

test.describe("__apex.camera()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns current mode and available modes list", async ({ page }) => {
    await load(page);
    const cam = await page.evaluate(() => window.__apex.camera());
    expect(typeof cam.mode).toBe("string");
    expect(Array.isArray(cam.modes)).toBe(true);
    expect(cam.modes).toContain("chase");
    expect(cam.modes).toContain("cockpit");
  });

  test("can switch to cockpit mode", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => window.__apex.camera("cockpit"));
    expect(r.mode).toBe("cockpit");
  });

  test("can switch back to chase mode", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.camera("cockpit"));
    const r = await page.evaluate(() => window.__apex.camera("chase"));
    expect(r.mode).toBe("chase");
  });

  test("returns false for unknown mode", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => window.__apex.camera("unknown_mode"));
    expect(r).toBe(false);
  });
});

test.describe("__apex.camState()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns eye, tgt arrays and fov number", async ({ page }) => {
    await loadParked(page);
    const s = await page.evaluate(() => window.__apex.camState());
    expect(Array.isArray(s.eye)).toBe(true);
    expect(s.eye).toHaveLength(3);
    expect(Array.isArray(s.tgt)).toBe(true);
    expect(typeof s.fov).toBe("number");
    expect(s.fov).toBeGreaterThan(0);
  });
});

test.describe("__apex.viewState()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns camMode, frozen, weather, state", async ({ page }) => {
    await loadParked(page);
    const v = await page.evaluate(() => window.__apex.viewState());
    expect(typeof v.camMode).toBe("string");
    expect(typeof v.frozen).toBe("boolean");
    expect(typeof v.weather).toBe("string");
    expect(typeof v.state).toBe("string");
    expect(typeof v.dbgCamActive).toBe("boolean");
  });

  test("frozen is true after park()", async ({ page }) => {
    await loadParked(page);
    const v = await page.evaluate(() => window.__apex.viewState());
    expect(v.frozen).toBe(true);
  });

  test("dbgCamActive is true after view({})", async ({ page }) => {
    await loadParked(page);
    await page.evaluate(() => window.__apex.view({}));
    const v = await page.evaluate(() => window.__apex.viewState());
    expect(v.dbgCamActive).toBe(true);
  });

  test("dbgCamActive is false after view('chase')", async ({ page }) => {
    await loadParked(page);
    await page.evaluate(() => window.__apex.view({}));
    await page.evaluate(() => window.__apex.view("chase"));
    const v = await page.evaluate(() => window.__apex.viewState());
    expect(v.dbgCamActive).toBe(false);
  });
});

// ── Freeze / HUD ───────────────────────────────────────────────────────────

test.describe("__apex.freeze()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns current frozen state when called with no args", async ({ page }) => {
    await loadParked(page);
    const f = await page.evaluate(() => window.__apex.freeze());
    expect(typeof f).toBe("boolean");
  });

  test("freeze(false) unfreezes; freeze(true) refreezes", async ({ page }) => {
    await loadParked(page);
    expect(await page.evaluate(() => window.__apex.freeze())).toBe(true);
    await page.evaluate(() => window.__apex.freeze(false));
    expect(await page.evaluate(() => window.__apex.freeze())).toBe(false);
    await page.evaluate(() => window.__apex.freeze(true));
    expect(await page.evaluate(() => window.__apex.freeze())).toBe(true);
  });
});

test.describe("__apex.hud()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns true when HUD is visible during a race", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.go());
    await page.waitForTimeout(300);
    const visible = await page.evaluate(() => window.__apex.hud());
    expect(visible).toBe(true);
  });

  test("hud(false) hides the HUD element", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.go());
    await page.evaluate(() => window.__apex.hud(false));
    await expect(page.locator("#hud")).toBeHidden();
    await page.screenshot({ path: "tests/ui-screenshots/dev-tools-hud-hidden.png" });
  });

  test("hud(true) restores the HUD element", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.go());
    await page.evaluate(() => window.__apex.hud(false));
    await page.evaluate(() => window.__apex.hud(true));
    await expect(page.locator("#hud")).toBeVisible();
  });
});

// ── Weather ────────────────────────────────────────────────────────────────

test.describe("__apex.weather()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns current weather string with no arg", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.weather());
    expect(["dry", "wet"]).toContain(w);
  });

  test("setting 'wet' returns 'wet'", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.weather("wet"));
    expect(w).toBe("wet");
    expect(await page.evaluate(() => window.__apex.weather())).toBe("wet");
  });

  test("toggling back to dry works", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.weather("wet"));
    const w = await page.evaluate(() => window.__apex.weather("dry"));
    expect(w).toBe("dry");
  });
});

// ── Telemetry ──────────────────────────────────────────────────────────────

test.describe("__apex.probe()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns x, angle, k, hw, speed, s after park()", async ({ page }) => {
    await loadParked(page);
    const p = await page.evaluate(() => window.__apex.probe());
    expect(p).not.toBeNull();
    expect(typeof p.x).toBe("number");
    expect(typeof p.angle).toBe("number");
    expect(typeof p.k).toBe("number");
    expect(typeof p.hw).toBe("number");
    expect(typeof p.speed).toBe("number");
    expect(typeof p.s).toBe("number");
  });

  test("player is near centreline after park(0.1, 0)", async ({ page }) => {
    await loadParked(page, 0.1);
    const p = await page.evaluate(() => window.__apex.probe());
    expect(Math.abs(p.x)).toBeLessThan(1.0);
  });
});

test.describe("__apex.physState()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns required fields including lap and wrongWay", async ({ page }) => {
    await loadParked(page);
    const ps = await page.evaluate(() => window.__apex.physState());
    expect(ps).not.toBeNull();
    expect(typeof ps.s).toBe("number");
    expect(typeof ps.x).toBe("number");
    expect(typeof ps.speed).toBe("number");
    expect(typeof ps.lap).toBe("number");
    expect(typeof ps.wrongWay).toBe("boolean");
    expect(typeof ps.rescueT).toBe("number");
  });

  test("exposes combined-slip traction circle fields", async ({ page }) => {
    await loadParked(page);
    const ps = await page.evaluate(() => window.__apex.physState());
    expect(typeof ps.axEstSm).toBe("number");
    expect(typeof ps.axFrac).toBe("number");
    expect(typeof ps.slipFactor).toBe("number");
    // at rest: no longitudinal load, so full lateral grip available
    expect(ps.axFrac).toBeCloseTo(0, 1);
    expect(ps.slipFactor).toBeCloseTo(1, 1);
  });

  test("slipFactor drops when braking hard", async ({ page }) => {
    await loadParked(page, 0.2, "bahrain");
    // Teleport to mid-lap at high speed then brake hard
    await page.evaluate(() => window.__apex.jump(0.2, 70, 0));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__apex.setInput({ throttle: false, brake: true }));
    await page.evaluate(() => {
      for (let i = 0; i < 30; i++) window.__apex.step(1 / 60);
    });
    const ps = await page.evaluate(() => window.__apex.physState());
    // axFrac should be > 0 (car was braking), slipFactor should be < 1
    expect(ps.axFrac).toBeGreaterThan(0);
    expect(ps.slipFactor).toBeLessThan(1);
    await page.evaluate(() => window.__apex.clearInput());
  });
});

test.describe("__apex.carAt()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns player car data when called with no index", async ({ page }) => {
    await loadParked(page);
    const c = await page.evaluate(() => window.__apex.carAt());
    expect(c).not.toBeNull();
    expect(c.isPlayer).toBe(true);
    expect(typeof c.x).toBe("number");
    expect(typeof c.speed).toBe("number");
    expect(typeof c.wrongWay).toBe("boolean");
  });

  test("carAt(0) returns first car in cars list", async ({ page }) => {
    await loadParked(page);
    const c = await page.evaluate(() => window.__apex.carAt(0));
    expect(c).not.toBeNull();
    expect(c.id).toBe(0);
  });

  test("carAt(999) returns null for out-of-range index", async ({ page }) => {
    await loadParked(page);
    const c = await page.evaluate(() => window.__apex.carAt(999));
    expect(c).toBeNull();
  });

  test("finished field is false during a live race", async ({ page }) => {
    await loadParked(page);
    const c = await page.evaluate(() => window.__apex.carAt());
    expect(c.finished).toBe(false);
  });
});

test.describe("__apex.cars()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns array with at least 2 entries", async ({ page }) => {
    await loadParked(page);
    const c = await page.evaluate(() => window.__apex.cars());
    expect(Array.isArray(c)).toBe(true);
    expect(c.length).toBeGreaterThanOrEqual(2);
  });

  test("exactly one car has p: true (the player)", async ({ page }) => {
    await loadParked(page);
    const c = await page.evaluate(() => window.__apex.cars());
    expect(c.filter((x) => x.p).length).toBe(1);
  });
});

// ── Track tools ────────────────────────────────────────────────────────────

test.describe("__apex.corners()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns array of fractions for Monza", async ({ page }) => {
    await loadParked(page);
    const c = await page.evaluate(() => window.__apex.corners());
    expect(Array.isArray(c)).toBe(true);
    expect(c.length).toBeGreaterThan(0);
    for (const f of c) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(1); }
  });
});

test.describe("__apex.nodeAt()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns world coords and tangent for fraction 0.5", async ({ page }) => {
    await loadParked(page);
    const n = await page.evaluate(() => window.__apex.nodeAt(0.5));
    expect(typeof n.x).toBe("number");
    expect(typeof n.y).toBe("number");
    expect(typeof n.z).toBe("number");
    expect(typeof n.tx).toBe("number");
    expect(typeof n.frac).toBe("number");
  });
});

test.describe("__apex.wallStats()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns barrier stats without NaN for Monza", async ({ page }) => {
    await loadParked(page);
    const s = await page.evaluate(() => window.__apex.wallStats());
    expect(s).not.toBeNull();
    expect(s.anyNaN).toBe(false);
    expect(s.minB).toBeGreaterThan(0);
    expect(s.n).toBeGreaterThan(0);
  });
});

// ── Scene control ──────────────────────────────────────────────────────────

test.describe("__apex.resetPlayer()", () => {
  test.use({ viewport: LANDSCAPE });

  test("repositions player car and returns physState", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.go());
    await page.evaluate(() => window.__apex.jump(0.2, 60, 8)); // push to edge
    await page.waitForTimeout(100);
    const result = await page.evaluate(() => window.__apex.resetPlayer());
    expect(result).not.toBe(false);
    expect(typeof result.x).toBe("number");
    // After rescue, car should be closer to centreline
    expect(Math.abs(result.x)).toBeLessThan(6);
  });
});

test.describe("__apex.clearMeshes()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns empty object after clearing", async ({ page }) => {
    await loadParked(page);
    await page.evaluate(() => window.__apex.meshToggle({ props: true }));
    const cleared = await page.evaluate(() => window.__apex.clearMeshes());
    expect(Object.keys(cleared)).toHaveLength(0);
  });
});

// ── Positioning helpers ────────────────────────────────────────────────────

test.describe("__apex.jump()", () => {
  test.use({ viewport: LANDSCAPE });

  test("teleports player to the given lap fraction", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.go());
    await page.evaluate(() => window.__apex.jump(0.75, 40, 0));
    const ps = await page.evaluate(() => window.__apex.physState());
    const total = await page.evaluate(() => window.__apex.info().total);
    expect(ps.s).toBeGreaterThan(total * 0.7);
    expect(ps.s).toBeLessThan(total * 0.8);
  });
});

test.describe("__apex.aim()", () => {
  test.use({ viewport: LANDSCAPE });

  test("180° aim sets the car pointing backwards", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.go());
    await page.evaluate(() => window.__apex.jump(0.2, 0, 0));
    const before = await page.evaluate(() => window.__apex.physState());
    await page.evaluate(() => window.__apex.aim(180));
    const after = await page.evaluate(() => window.__apex.physState());
    // heading changed by ~π radians
    const diff = Math.abs(after.head - before.head);
    expect(diff).toBeGreaterThan(2.5);
  });
});

test.describe("__apex.scan()", () => {
  test.use({ viewport: LANDSCAPE });

  test("single distance returns one reading", async ({ page }) => {
    await loadParked(page);
    const s = await page.evaluate(() => window.__apex.scan(50));
    expect(typeof s.k).toBe("number");
    expect(typeof s.hw).toBe("number");
  });

  test("array of distances returns one reading per entry", async ({ page }) => {
    await loadParked(page);
    const r = await page.evaluate(() => window.__apex.scan([10, 30, 60, 100]));
    expect(Array.isArray(r)).toBe(true);
    expect(r).toHaveLength(4);
  });
});

// ── Physics override ───────────────────────────────────────────────────────

test.describe("__apex.setPhysics() / tuning()", () => {
  test.use({ viewport: LANDSCAPE });

  test("setPhysics changes a param visible in tuning()", async ({ page }) => {
    await loadParked(page);
    const before = await page.evaluate(() => window.__apex.tuning());
    await page.evaluate(() => window.__apex.setPhysics({ pace: 0.5 }));
    const after = await page.evaluate(() => window.__apex.tuning());
    expect(after.pace).toBeCloseTo(0.5, 2);
    expect(after.wheelbase).toBeCloseTo(before.wheelbase, 2); // unchanged
  });

  test("setInput and clearInput work together", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.go());
    await page.evaluate(() => window.__apex.setInput({ steer: 0.5, throttle: true, brake: false }));
    await page.evaluate(() => window.__apex.step(1 / 60, 10));
    await page.evaluate(() => window.__apex.clearInput());
    // No assertion on physics result — just ensure no crash
    const ps = await page.evaluate(() => window.__apex.physState());
    expect(ps).not.toBeNull();
    expect(Number.isFinite(ps.x)).toBe(true);
  });
});
