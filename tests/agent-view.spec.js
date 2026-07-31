// @ts-check
// Contract tests for the agent-facing world view (js/game/agentview.js):
//   __apex.world(), __apex.trackInfo(), __apex.terminal()
//
// These assert the CONTRACT an LLM agent depends on — payload shape, typed
// errors, detail levels, delta mode — plus the geometric invariants that make
// the corner table trustworthy. They deliberately do not assert exact radii for
// anything except Monaco's hairpin, which is the one corner whose real-world
// dimension is unambiguous enough to pin.
import { test, expect } from "./fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
}

async function load(page, trackId = "monza", frac = 0.05, speed = 60) {
  await boot(page);
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15_000 });
  await page.evaluate(([f, v]) => {
    window.__apex.go();
    window.__apex.jump(f, v, 0);
  }, [frac, speed]);
}

// ── typed errors ────────────────────────────────────────────────────────────
// The whole point of this layer: a failure tells the agent what to call next.
// __apex.obs() returns null in exactly these cases, which teaches an agent
// nothing.

test.describe("world() typed errors", () => {
  test.use({ viewport: LANDSCAPE });

  test("before a race is started, the error names the hook that fixes it", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => window.__apex.world());
    expect(r).not.toBeNull();
    expect(r.ok).toBe(false);
    // The menu runs a background flyby, so a track is usually already built and
    // it's the grid that's missing. Which of the three guards fires is a timing
    // detail; that every one of them is actionable is the contract.
    expect(["NoTrackError", "NoPlayerError", "PlayerNotPlacedError"]).toContain(r.error);
    expect(r.fix).toMatch(/__apex\.|race|go|jump|step/);
    expect(r.state.raceState).toBeTruthy();
  });

  test("player not placed names the hook that fixes it", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15_000 });
    const r = await page.evaluate(() => window.__apex.world());
    if (r.ok === false) {
      expect(r.error).toBe("PlayerNotPlacedError");
      expect(r.fix).toMatch(/jump|step/);
    } else {
      // Grid-up already initialised px — the guard is still the contract we care
      // about, so assert the happy path instead of failing on a timing detail.
      expect(r.ego).toBeTruthy();
    }
  });

  test("a bad detail level is rejected with the valid set", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => window.__apex.world({ detail: "everything" }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("BadArgumentError");
    expect(r.message).toContain("brief");
  });
});

// ── detail levels ───────────────────────────────────────────────────────────

test.describe("world() detail levels", () => {
  test.use({ viewport: LANDSCAPE });

  test("brief carries the envelope, ego and a one-line summary", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.world({ detail: "brief" }));
    expect(w.apiVersion).toBe(1);
    expect(typeof w.physicsVersion).toBe("number");
    expect(typeof w.seq).toBe("number");
    expect(w.conventions).toContain("+x");
    expect(w.detail).toBe("brief");
    expect(w.ego).toBeTruthy();
    expect(typeof w.ego.speedKph).toBe("number");
    expect(typeof w.ego.lateralM).toBe("number");
    expect(typeof w.ego.onTrack).toBe("boolean");
    expect(w.ego.grip.state).toMatch(/grip/);
    expect(typeof w.brief).toBe("string");
    expect(w.brief.length).toBeGreaterThan(20);
    // brief must NOT carry the expensive sections
    expect(w.rivals).toBeUndefined();
    expect(w.ahead).toBeUndefined();
  });

  test("drive adds lookahead, rivals and affordances", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.world({ detail: "drive" }));
    expect(Array.isArray(w.ahead.pts)).toBe(true);
    expect(w.ahead.pts.length).toBeGreaterThan(1);
    expect(Array.isArray(w.rivals)).toBe(true);
    expect(Array.isArray(w.affordances)).toBe(true);
    expect(Array.isArray(w.unavailable)).toBe(true);
    // rivals are capped at drive detail so the payload stays bounded
    expect(w.rivals.length).toBeLessThanOrEqual(4);
  });

  test("full adds session, terminal and raw physics", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.world({ detail: "full" }));
    expect(w.session).toBeTruthy();
    expect(w.session.weather).toBeTruthy();
    expect(w.terminal).toBeTruthy();
    expect(typeof w.terminal.done).toBe("boolean");
    expect(w.physics).toBeTruthy();
    expect(typeof w.physics.kRaw).toBe("number");
    expect(typeof w.physics.kSmoothed).toBe("number");
    // full lifts the rival cap
    expect(w.rivals.length).toBe(21);
  });

  test("brief is materially smaller than full", async ({ page }) => {
    await load(page);
    const sizes = await page.evaluate(() => ({
      brief: JSON.stringify(window.__apex.world({ detail: "brief" })).length,
      full: JSON.stringify(window.__apex.world({ detail: "full" })).length,
    }));
    expect(sizes.brief).toBeLessThan(sizes.full / 2);
  });
});

// ── look-ahead scales with speed ────────────────────────────────────────────
// The bug this pins: obs().scan is fixed at [10,30,60] m, which is 1.2 s of
// warning at 50 m/s and 6 s at 10 m/s. The horizon must follow velocity.

test.describe("world() look-ahead", () => {
  test.use({ viewport: LANDSCAPE });

  test("horizon distance grows with speed at fixed horizonS", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      window.__apex.jump(0.05, 20, 0);
      const slow = window.__apex.world({ horizonS: 4 }).ahead.horizonM;
      window.__apex.jump(0.05, 80, 0);
      const fast = window.__apex.world({ horizonS: 4 }).ahead.horizonM;
      return { slow, fast };
    });
    expect(r.fast).toBeGreaterThan(r.slow * 2);
  });

  test("every look-ahead point carries a direction and a width", async ({ page }) => {
    await load(page);
    const pts = await page.evaluate(() => window.__apex.world().ahead.pts);
    for (const p of pts) {
      expect(["L", "R", "straight"]).toContain(p.dir);
      expect(p.widthM).toBeGreaterThan(0);
      expect(p.t).toBeGreaterThan(0);
    }
  });
});

// ── rivals ──────────────────────────────────────────────────────────────────

test.describe("world() rivals", () => {
  test.use({ viewport: LANDSCAPE });

  test("rivals are sorted by gap and framed relative to the player", async ({ page }) => {
    await load(page);
    const rv = await page.evaluate(() => window.__apex.world({ detail: "full" }).rivals);
    expect(rv.length).toBeGreaterThan(0);
    for (let i = 1; i < rv.length; i++) {
      expect(rv[i].gapM).toBeGreaterThanOrEqual(rv[i - 1].gapM);
    }
    for (const r of rv) {
      expect(["ahead", "behind"]).toContain(r.rel);
      expect(["left", "right", "same line"]).toContain(r.side);
      expect(typeof r.closingMps).toBe("number");
      expect(r.gapS).toBeGreaterThanOrEqual(0);
    }
  });

  test("lateralM is relative to the player, not the centreline", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      window.__apex.jump(0.05, 60, 4);          // player 4 m right of centre
      const w = window.__apex.world({ detail: "full" });
      const cars = window.__apex.cars();
      const me = cars.find((c) => c.p);
      const other = cars.find((c) => !c.p);
      const row = w.rivals.find((x) => x.id === other.id);
      return { expected: other.x - me.x, got: row ? row.lateralM : null };
    });
    expect(r.got).not.toBeNull();
    expect(Math.abs(r.got - r.expected)).toBeLessThan(0.15);
  });
});

// ── delta mode ──────────────────────────────────────────────────────────────

test.describe("world() delta mode", () => {
  test.use({ viewport: LANDSCAPE });

  test("seq increments and a delta is smaller than the full payload", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const a = window.__apex.world({ detail: "drive" });
      window.__apex.step(1 / 60, 2);
      const d = window.__apex.world({ detail: "drive", since: a.seq });
      const full = window.__apex.world({ detail: "drive" });
      return { seqA: a.seq, seqD: d.seq, deltaBase: d.deltaBase,
               dLen: JSON.stringify(d).length, fLen: JSON.stringify(full).length };
    });
    expect(r.seqD).toBeGreaterThan(r.seqA);
    expect(r.deltaBase).toBe(r.seqA);
    expect(r.dLen).toBeLessThan(r.fLen);
  });

  test("an unknown since returns the full payload with a note, not an error", async ({ page }) => {
    await load(page);
    const d = await page.evaluate(() => window.__apex.world({ since: 99999 }));
    expect(d.ok).not.toBe(false);
    expect(d.ego).toBeTruthy();
    expect(d.note).toContain("full payload");
  });
});

// ── corner table ────────────────────────────────────────────────────────────

test.describe("trackInfo() corner table", () => {
  test.use({ viewport: LANDSCAPE });

  test("Monaco's hairpin is resolved as a hairpin", async ({ page }) => {
    await load(page, "monaco");
    const cs = await page.evaluate(() => window.__apex.trackInfo({ what: "corners" }).corners);
    const tightest = cs.reduce((a, b) => (a.radiusM < b.radiusM ? a : b));
    // Grand Hotel hairpin is ~10 m in reality; anything under 20 m means the
    // smoothed-curvature pipeline resolved it rather than averaging it away.
    expect(tightest.radiusM).toBeLessThan(20);
    expect(tightest.severity).toBe("hairpin");
  });

  test("corners are well-formed and non-overlapping", async ({ page }) => {
    await load(page, "monza");
    const info = await page.evaluate(() => window.__apex.trackInfo({ what: "corners" }));
    expect(info.corners.length).toBeGreaterThan(3);
    expect(info.source).toContain("CircuitMarkings");
    for (const c of info.corners) {
      expect(c.turn).toMatch(/^T\d+(-T\d+)?$/);
      expect(["L", "R", "straight"]).toContain(c.dir);
      expect(c.radiusM).toBeGreaterThan(0);
      expect(c.lengthM).toBeGreaterThan(0);
      expect(c.frac).toBeGreaterThanOrEqual(0);
      expect(c.frac).toBeLessThan(1);
      // direction must agree with the swept angle — the merge pass is the
      // likeliest place for those to drift apart
      if (c.dir === "R") expect(c.sweepDeg).toBeGreaterThan(0);
      if (c.dir === "L") expect(c.sweepDeg).toBeLessThan(0);
    }
  });

  test("the lap closes: integrated heading is a full turn", async ({ page }) => {
    await load(page, "monza");
    // Guards the sweep() integration the corner radii are derived from. If this
    // drifts, every radius in the table is wrong.
    const deg = await page.evaluate(() => {
      const N = 1440;
      let psi = 0, prev = null;
      const ad = (x) => {
        while (x > Math.PI) x -= 2 * Math.PI;
        while (x < -Math.PI) x += 2 * Math.PI;
        return x;
      };
      for (let i = 0; i <= N; i++) {
        const n = window.__apex.nodeAt((i % N) / N);
        const h = Math.atan2(n.tx, n.tz);
        if (prev !== null) psi += ad(h - prev);
        prev = h;
      }
      return psi * 180 / Math.PI;
    });
    expect(Math.abs(Math.abs(deg) - 360)).toBeLessThan(1);
  });

  test("sectors and profile are available and static", async ({ page }) => {
    await load(page, "monza");
    const r = await page.evaluate(() => ({
      sectors: window.__apex.trackInfo({ what: "sectors" }).sectors,
      profile: window.__apex.trackInfo({ what: "profile" }).profile,
    }));
    expect(r.sectors.length).toBe(3);
    expect(r.sectors[0].fromFrac).toBe(0);
    expect(r.profile.length).toBeGreaterThan(10);
    expect(typeof r.profile[0].y).toBe("number");
  });

  test("trackInfo never returns null — payload or typed error", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => window.__apex.trackInfo());
    expect(r).toBeTruthy();
    if (r.ok === false) {
      expect(r.error).toBe("NoTrackError");
      expect(r.fix).toContain("race");
    } else {
      // The menu flyby track is already built — a legitimate answer.
      expect(Array.isArray(r.corners)).toBe(true);
    }
  });

  test("an unknown `what` is rejected with the valid set", async ({ page }) => {
    await load(page, "monza");
    const r = await page.evaluate(() => window.__apex.trackInfo({ what: "everything" }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("BadArgumentError");
    expect(r.message).toContain("corners");
  });
});

// ── nextCorner ──────────────────────────────────────────────────────────────

test.describe("world() nextCorner", () => {
  test.use({ viewport: LANDSCAPE });

  test("names a corner ahead with a braking hint", async ({ page }) => {
    await load(page);
    const nc = await page.evaluate(() => window.__apex.world().nextCorner);
    expect(nc.turn).toMatch(/^T\d+/);
    expect(nc.distM).toBeGreaterThanOrEqual(0);
    expect(nc.timeS).toBeGreaterThanOrEqual(0);
    expect(nc.suggestBrakeM).toBeGreaterThanOrEqual(0);
    expect(typeof nc.status).toBe("string");
    expect(nc.note).toContain("hint");
  });

  test("the braking hint grows with speed", async ({ page }) => {
    await load(page);
    // frac 0.001 puts the Rettifilo chicane (a genuine hairpin) next. Picking a
    // fast corner here would make both speeds need zero braking and the test
    // would pass on a broken implementation.
    const r = await page.evaluate(() => {
      window.__apex.jump(0.001, 30, 0);
      const slow = window.__apex.world().nextCorner;
      window.__apex.jump(0.001, 90, 0);
      const fast = window.__apex.world().nextCorner;
      return { slow: slow.suggestBrakeM, fast: fast.suggestBrakeM, turn: slow.turn };
    });
    expect(r.slow).toBeGreaterThan(0);
    expect(r.fast).toBeGreaterThan(r.slow);
  });
});

// ── terminal() ──────────────────────────────────────────────────────────────

test.describe("terminal()", () => {
  test.use({ viewport: LANDSCAPE });

  test("splits done into a reason", async ({ page }) => {
    await load(page);
    const t = await page.evaluate(() => window.__apex.terminal());
    expect(typeof t.done).toBe("boolean");
    expect(t.done).toBe(false);
    expect(t.reason).toBeNull();
  });

  test("reports finished after the race ends", async ({ page }) => {
    await load(page);
    const t = await page.evaluate(() => {
      window.__apex.finishRace();
      return window.__apex.terminal();
    });
    expect(t.reason).toBe("finished");
    expect(t.done).toBe(true);
  });
});
