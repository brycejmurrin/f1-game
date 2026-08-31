// @ts-check
// Contract tests for the agent-facing world view (js/game/agentview.js):
//   __apex.world(), __apex.trackInfo(), __apex.terminal()
//
// These assert the CONTRACT an LLM agent depends on — payload shape, typed
// errors, detail levels, delta mode — plus the geometric invariants that make
// the corner table trustworthy. They deliberately do not assert exact radii for
// anything except Monaco's hairpin, which is the one corner whose real-world
// dimension is unambiguous enough to pin.
// sharedTest, not test: all 117 tests here go through boot()/load() below and
// none of them assert first-load behaviour, so they can share ONE booted page
// per worker instead of paying page.goto("/") + 155 script tags + WebGL init
// 117 times over. See the sharedTest block in ./fixtures.js for the contract.
import { sharedTest as test, expect } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function boot(page) {
  // The shared page is booted once per worker by the fixture, so the common
  // case is a no-op. Only navigate if something actually tore the app down.
  const live = await page.evaluate(() => window.__apex != null).catch(() => false);
  if (live) return;
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
}

async function load(page, trackId = "monza", frac = 0.05, speed = 60) {
  await boot(page);
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 15_000 });
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
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 15_000 });
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

// ── field() ──────────────────────────────────────────────────────────────────
// The allocentric standings mirror. The load-bearing property: it is COMPACT —
// team is an id STRING, never the team object that world().rivals used to spread.

test.describe("field()", () => {
  test.use({ viewport: LANDSCAPE });

  test("lists every car by position with second gaps, compactly", async ({ page }) => {
    await load(page);
    const f = await page.evaluate(() => window.__apex.field({ detail: "full" }));
    expect(f.ok).not.toBe(false);
    expect(f.of).toBeGreaterThan(1);
    expect(f.positions.length).toBe(f.of);
    // positions are 1..N in order, leader first
    for (let i = 0; i < f.positions.length; i++) {
      expect(f.positions[i].pos).toBe(i + 1);
    }
    expect(f.positions[0].gapToLeaderS).toBe(0);
    // exactly one player row, and the player summary agrees with it
    const players = f.positions.filter((r) => r.isPlayer);
    expect(players.length).toBe(1);
    expect(f.player.pos).toBe(players[0].pos);
    // COMPACT: team is a string id, not the team object (the dogfood bug)
    for (const r of f.positions) {
      expect(["string", "object"]).toContain(typeof r.team);   // string id or null
      expect(r.team === null || typeof r.team === "string").toBe(true);
      expect(typeof r.code === "string" || r.code === null).toBe(true);
    }
    // gaps grow down the order
    for (let i = 1; i < f.positions.length; i++) {
      expect(f.positions[i].gapToLeaderS).toBeGreaterThanOrEqual(
        f.positions[i - 1].gapToLeaderS - 0.01);
    }
  });

  test("world().rivals stays compact — no team object is spread per rival", async ({ page }) => {
    await load(page);
    const rv = await page.evaluate(() => window.__apex.world({ detail: "full" }).rivals);
    expect(rv.length).toBeGreaterThan(0);
    for (const r of rv) {
      // team must be an id string or null — NOT the {id,name,color,drivers,...} object
      expect(r.team === null || typeof r.team === "string").toBe(true);
      expect(r).not.toHaveProperty("drivers");
    }
  });
});

// ── road shape: banking, gradient, kerbs ─────────────────────────────────────
// Three things the track always knew and never told the agent. Both bugs here
// were found by reading real output, not by a failing assertion: banking has TWO
// sources and the usually-populated one is not the obvious one, and its sign is
// inverted relative to the naive reading.

test.describe("corner road shape", () => {
  test.use({ viewport: LANDSCAPE });

  test("Spa's corners carry gradient and kerbs", async ({ page }) => {
    await load(page, "spa", 0.03, 60);
    const cs = await page.evaluate(() =>
      window.__apex.trackInfo({ what: "corners" }).corners);
    for (const c of cs) {
      expect(typeof c.gradientPct).toBe("number");
      expect(["uphill", "downhill", "level"]).toContain(c.elevation);
      expect(["flat", "banked into the turn", "off-camber"]).toContain(c.camber);
      if (c.kerbs) for (const k of c.kerbs) expect(["left", "right"]).toContain(k);
    }
    // Spa climbs hard through Eau Rouge/Raidillon — at least one steep ascent
    expect(cs.some((c) => c.gradientPct > 5)).toBe(true);
    expect(cs.some((c) => c.gradientPct < -5)).toBe(true);
    // and it is kerbed
    expect(cs.some((c) => c.kerbs && c.kerbs.length)).toBe(true);
  });

  test("authored bank zones read as banked INTO the turn, not off-camber", async ({ page }) => {
    // Abu Dhabi authors bankZones; they raise the OUTER edge, so every one of
    // them must help its corner. This is the test that catches an inverted sign.
    await load(page, "abudhabi", 0.03, 60);
    const banked = await page.evaluate(() =>
      window.__apex.trackInfo({ what: "corners" }).corners
        .filter((c) => Math.abs(c.bankingDeg) > 0.5));
    expect(banked.length).toBeGreaterThan(0);
    for (const c of banked) {
      expect(c.camber, c.turn + " " + c.dir + " @" + c.bankingDeg + "deg")
        .toBe("banked into the turn");
      // and the sign must follow the documented convention
      if (c.dir === "L") expect(c.bankingDeg).toBeGreaterThan(0);
      if (c.dir === "R") expect(c.bankingDeg).toBeLessThan(0);
    }
  });

  test("pacenotes pick up elevation and camber mutators", async ({ page }) => {
    await load(page, "spa", 0.03, 60);
    const pn = await page.evaluate(() =>
      window.__apex.world({ detail: "drive" }).pacenotes);
    // Spa is the elevation circuit — the callout must say so
    expect(pn).toMatch(/uphill|downhill/);
    expect(pn).toMatch(/[LR][1-6] @\d+m/);
  });

  test("the added detail does not blow the world() budget", async ({ page }) => {
    await load(page);
    const n = await page.evaluate(() =>
      JSON.stringify(window.__apex.world({ detail: "drive" })).length);
    // the whole point of drill-down: the per-tick payload stays lean
    expect(n).toBeLessThan(4500);
  });
});

// ── atmosphere() — the light, narrated ───────────────────────────────────────
// lightState() is rich but raw; an agent cannot act on an RGB triple. These pin
// that the narration is CORRECT, which is where the bugs were: at night the
// renderer keeps the sun direction and dims it to moonlight, so anything that
// infers darkness from sun elevation reports a high sun over a floodlit midnight.

test.describe("atmosphere()", () => {
  test.use({ viewport: LANDSCAPE });

  test("narrates a day scene and keeps the raw numbers", async ({ page }) => {
    await load(page);
    const a = await page.evaluate(async () => {
      window.__apex.setTimeOfDay("day");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return window.__apex.atmosphere();
    });
    expect(a.ok).not.toBe(false);
    expect(typeof a.brief).toBe("string");
    expect(a.dark).toBe(false);
    expect(a.sun.body).toBe("sun");
    // raw kept for measurement
    expect(a.raw.sunDir).not.toBeNull();
    // it is a description, not a dump
    expect(JSON.stringify(a).length).toBeLessThan(2000);
  });

  test("night is dark, floodlit, and names the moon — not a high sun", async ({ page }) => {
    await load(page);
    const a = await page.evaluate(async () => {
      window.__apex.setTimeOfDay("night");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return window.__apex.atmosphere();
    });
    expect(a.dark).toBe(true);
    // darkness must come from the session, not from sun elevation
    expect(a.sun.body).toBe("moon");
    expect(a.brief).not.toMatch(/\bsun\b/);
    // the floodlights carrying the scene must be reported
    expect(a.lights.active).toBeGreaterThan(0);
    expect(a.brief).toMatch(/floodlit/);
  });

  test("wet weather is called out and matches the grip model", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      window.__apex.setTimeOfDay("day");
      window.__apex.weather("rain");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { a: window.__apex.atmosphere(),
               grip: window.__apex.world({ detail: "drive" }).ego.grip };
    });
    expect(r.a.wetRoad).toBe(true);
    expect(r.a.brief).toMatch(/wet|rain/);
    // the narration must agree with the physics the agent will feel
    expect(r.grip.gripMult).toBeLessThan(1);
  });

  test("visibility is a distance, not a raw fog density", async ({ page }) => {
    await load(page);
    const v = await page.evaluate(() => window.__apex.atmosphere().visibility);
    expect(typeof v.fogDensity).toBe("number");
    expect(v.approxRangeM).toBeGreaterThan(0);
  });
});

// ── describe() / query() — the drill-down layer ──────────────────────────────
// The detail model: the world stays STORED in full, and the agent PULLS detail
// by id. Flat-serialising a rich scene is both infeasible and less accurate than
// querying it, and Monza registers ~2835 props — so these two verbs are how
// "highly detailed" is delivered without a dump.

test.describe("describe()", () => {
  test.use({ viewport: LANDSCAPE });

  test("expands a scene() row into everything known about that prop", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const sc = window.__apex.scene({ radius: 140, limit: 5 });
      const row = sc.props[0];
      return { row, d: window.__apex.describe(row.id) };
    });
    // scene rows must carry a stable id, or drill-down is unreachable
    expect(r.row.id).toMatch(/^prop:\d+$/);
    expect(r.d.id).toBe(r.row.id);
    expect(r.d.type).toBe("prop");
    expect(r.d.kind).toBe(r.row.kind);
    // the expansion adds what the list row omits
    expect(r.d.world.length).toBe(3);
    expect(r.d.sizeM.length).toBe(3);
    expect(typeof r.d.volumeM3).toBe("number");
    expect(typeof r.d.s).toBe("number");
    // and anchors it to a corner, by id — so ids cross-reference
    expect(r.d.nearestCorner.id).toMatch(/^corner:/);
    // one entity stays cheap
    expect(JSON.stringify(r.d).length).toBeLessThan(1200);
  });

  test("resolves corner, car and span ids", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const turn = window.__apex.trackInfo({ what: "corners" }).corners[2].turn;
      return { c: window.__apex.describe("corner:" + turn),
               car: window.__apex.describe("car:0"),
               turn };
    });
    expect(r.c.type).toBe("corner");
    expect(r.c.corner.turn).toBe(r.turn);
    // a corner knows what stands around it
    expect(typeof r.c.sceneryWithin80m).toBe("object");
    expect(r.car.type).toBe("car");
    expect(r.car.team === null || typeof r.car.team === "string").toBe(true);
    expect(["ahead", "behind", "self"]).toContain(r.car.rel);
  });

  test("unknown ids are typed errors that say how to find a real one", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      missing: window.__apex.describe("prop:999999"),
      badKind: window.__apex.describe("banana:1"),
      empty: window.__apex.describe(),
    }));
    expect(r.missing.ok).toBe(false);
    expect(r.missing.error).toBe("NotFoundError");
    expect(r.missing.fix).toMatch(/indexed|scene\(\)|query\(\)/);
    expect(r.badKind.ok).toBe(false);
    expect(r.badKind.error).toBe("BadArgumentError");
    expect(r.empty.ok).toBe(false);
  });
});

test.describe("query()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns prototype + instances, not N near-identical records", async ({ page }) => {
    await load(page);
    const q = await page.evaluate(() =>
      window.__apex.query({ kind: "pine", near: 250, limit: 8 }));
    expect(q.matched).toBeGreaterThan(0);
    expect(q.instances.length).toBeGreaterThan(0);
    expect(q.instances.length).toBeLessThanOrEqual(8);
    // the prototype carries the shape once...
    expect(q.prototypes.pine.sizeM.length).toBe(3);
    // ...so a typical instance does NOT repeat it
    const plain = q.instances.filter((r) => !r.sizeM);
    expect(plain.length).toBeGreaterThan(0);
    for (const r of q.instances) {
      expect(r.id).toMatch(/^prop:\d+$/);
      expect(r.kind).toBe("pine");
    }
  });

  test("is bounded and reports what it withheld", async ({ page }) => {
    await load(page);
    const q = await page.evaluate(() => window.__apex.query({ limit: 5 }));
    expect(q.returned).toBeLessThanOrEqual(5);
    // never a silent truncation — the caller is told how much it did not get
    expect(q.matched).toBeGreaterThanOrEqual(q.returned);
    expect(q.truncated).toBe(q.matched - q.returned);
    // a bounded pull stays small even on a 2835-prop circuit
    expect(JSON.stringify(q).length).toBeLessThan(4000);
  });

  test("filters compose: kind, arc window, radius", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      win: window.__apex.query({ fromS: 0, toS: 300, limit: 50 }),
      near: window.__apex.query({ near: 60, limit: 50 }),
    }));
    // every row of an arc-window query sits inside the window
    for (const row of r.win.instances) {
      expect(row.s).toBeGreaterThanOrEqual(0);
      expect(row.s).toBeLessThanOrEqual(300);
    }
    // every row of a radius query sits inside the radius
    for (const row of r.near.instances) expect(row.distM).toBeLessThanOrEqual(60);
  });

  test("ids from query resolve through describe", async ({ page }) => {
    await load(page);
    const ok = await page.evaluate(() => {
      const q = window.__apex.query({ near: 200, limit: 3 });
      return q.instances.every((r) => {
        const d = window.__apex.describe(r.id);
        return d.ok !== false && d.id === r.id && d.kind === r.kind;
      });
    });
    expect(ok).toBe(true);
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
      // +sweep/+k is a LEFT-hander (measured by zero-steer drift; game.js's
      // racing line is -sign(k), "k>0 curves toward screen-left")
      if (c.dir === "L") expect(c.sweepDeg).toBeGreaterThan(0);
      if (c.dir === "R") expect(c.sweepDeg).toBeLessThan(0);
      // k must honour "+k = LEFT" — it is the signed mean curvature, so its sign
      // must match dir/sweepDeg. A point sample used to flip sign at noisy apexes
      // (Monaco's hairpin read dir:"R" with a negative k), contradicting the
      // convention every payload advertises.
      if (c.dir === "L") expect(c.k).toBeGreaterThan(0);
      if (c.dir === "R") expect(c.k).toBeLessThan(0);
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

// ── state that used to be invisible ─────────────────────────────────────────
// Mapping every car field against agentview.js AND apex.js found state that no
// hook exposed at all. `penalty`/`cuts` was the worst: an agent could be
// accruing track-limit penalties, be scored on them, and have no way to perceive
// them — it cannot learn to stop doing the thing it is being punished for.

test.describe("world() previously-invisible state", () => {
  test.use({ viewport: LANDSCAPE });

  test("penalties are visible, with the rule that governs them", async ({ page }) => {
    await load(page);
    const p = await page.evaluate(() => window.__apex.world({ detail: "drive" }).ego.penalties);
    expect(p).toBeTruthy();
    expect(typeof p.cuts).toBe("number");
    expect(typeof p.timePenaltyS).toBe("number");
    // the agent must know how many cuts are free, not just the count so far
    expect(p.freeCutsLeft).toBe(3 - p.cuts);
    expect(p.note).toMatch(/\+5/);
  });

  test("ERS reports deployment and the overtake window, not just charge", async ({ page }) => {
    await load(page);
    const e = await page.evaluate(() => window.__apex.world({ detail: "drive" }).ego.ers);
    expect(e).toBeTruthy();
    // charge alone never said whether the energy was going anywhere
    for (const k of ["charge", "deploying", "overtakeArmed", "boostRemainingS", "cooldownS"]) {
      expect(e, k + " missing from ers").toHaveProperty(k);
    }
    expect(e.charge).toBeGreaterThanOrEqual(0);
    expect(e.charge).toBeLessThanOrEqual(1);
  });

  test("rivals carry pace, so one AI is distinguishable from another", async ({ page }) => {
    await load(page);
    const rv = await page.evaluate(() => window.__apex.world({ detail: "full" }).rivals);
    expect(rv.length).toBeGreaterThan(1);
    for (const r of rv) {
      expect(typeof r.pace).toBe("number");
      expect(r.pace).toBeGreaterThan(0.5);
      expect(r.pace).toBeLessThanOrEqual(1.05);
    }
    // the field is only useful if it actually varies across the grid
    expect(new Set(rv.map((r) => r.pace)).size).toBeGreaterThan(1);
  });

  test("full detail exposes engine, recovery and the live tunables", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => {
      window.__apex.jump(0.05, 60, 0);
      return window.__apex.world({ detail: "full" });
    });
    expect(w.physics.rpm).toBeGreaterThan(0);
    for (const k of ["offroad", "stuckS", "wallContactS", "vertLoad"]) {
      expect(w.physics, k + " missing").toHaveProperty(k);
    }
    // setPhysics() can retune the car under the agent; it must be able to see that
    expect(w.tunables).toBeTruthy();
    expect(typeof w.tunables.PACE).toBe("number");
    expect(typeof w.tunables.ROAD_FOLLOW).toBe("number");
  });
});

test.describe("static grounding + session self-description", () => {
  test.use({ viewport: LANDSCAPE });

  test("trackInfo grounds the circuit in the real world", async ({ page }) => {
    await load(page);
    const t = await page.evaluate(() => window.__apex.trackInfo({ what: "corners" }).track);
    expect(t.gp).toBeTruthy();                 // "Italian GP" — which race this is
    expect(t.realLengthKm).toBeGreaterThan(1);
    // built geometry vs the real circuit — an agent can now check its own world
    expect(Math.abs(t.lengthErrorPct)).toBeLessThan(15);
    expect(typeof t.startFrac).toBe("number");
    expect(typeof t.reverse).toBe("boolean");
  });

  test("a full snapshot carries the seed that reproduces it", async ({ page }) => {
    await load(page);
    const s = await page.evaluate(() => {
      window.__apex.go();
      window.__apex.reset(0.05, 60, 0, 4242);
      return window.__apex.world({ detail: "full" }).session;
    });
    // the payload is self-describing: reset(frac, speed, x, seed) replays it
    expect(s.seed).toBe(4242);
    // mode flags silently change the rules, so they belong beside the state
    for (const k of ["seasonMode", "raceLineAssist", "unlimitedBudget"]) {
      expect(s, k + " missing from session").toHaveProperty(k);
    }
  });
});

// ── objective() ─────────────────────────────────────────────────────────────

test.describe("objective()", () => {
  test.use({ viewport: LANDSCAPE });

  test("states the goal, the trade-offs and the constraints, compactly", async ({ page }) => {
    await boot(page);
    const o = await page.evaluate(() => window.__apex.objective());
    expect(o.goal).toMatch(/race|finish/i);
    expect(o.winCondition).toBeTruthy();
    expect(o.tradeoffs.length).toBeGreaterThanOrEqual(3);
    expect(o.constraints.length).toBeGreaterThan(0);
    expect(o.units).toMatch(/metres/);
    // the trade-offs must name the mechanics an agent actually operates
    const t = o.tradeoffs.join(" ");
    expect(t).toMatch(/TRACK LIMITS/);
    expect(t).toMatch(/ERS/);
    // deliberately NOT a dynamics description — that would go stale on a retune
    expect(o.note).toMatch(/rollout|act/);
    // it is a briefing, not a manual
    expect(JSON.stringify(o).length).toBeLessThan(2000);
  });

  test("needs no track loaded — it is static", async ({ page }) => {
    await boot(page);
    const o = await page.evaluate(() => window.__apex.objective());
    expect(o.ok).not.toBe(false);
    expect(o.goal).toBeTruthy();
  });
});

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

  // The road ahead as a rally co-driver's callout — the dense, LLM-familiar
  // serialisation the research (Columbia RAD + rally pacenotes) singles out.
  test("pacenotes render the road ahead as a rally-style callout", async ({ page }) => {
    await load(page);
    const pn = await page.evaluate(() => {
      window.__apex.jump(0.001, 60, 0);
      return window.__apex.world({ detail: "drive" }).pacenotes;
    });
    expect(typeof pn).toBe("string");
    // e.g. "R2 @90m don't-cut, L5 @260m into-str, R4 @1150m" — dir+severity(1-6)
    // at a distance in metres, comma-separated. Assert the shape, not the exact
    // circuit-dependent corners.
    expect(pn).toMatch(/[LR][1-6] @\d+m/);
    // it is dense — a few corners in well under a screenful
    expect(pn.length).toBeLessThan(160);
  });
});

// ── frame() ─────────────────────────────────────────────────────────────────
// The screenshot replacement. Validated against a real render at the same pose:
// road filling the lower half, pines flanking, structures right — see
// docs/AGENT-WORLD-API.md for what that comparison caught.

test.describe("frame() cameras and edges", () => {
  test.use({ viewport: LANDSCAPE });

  test("renders any of the 13 camera modes without a live frame", async ({ page }) => {
    await load(page, "monza", 0.05, 60);
    // A synthetic camera is computed fresh — it does NOT need a rendered frame,
    // which is the whole point vs the live view.
    const r = await page.evaluate(() => {
      const cock = window.__apex.render({ what: "view", cols: 32, camera: "cockpit" });
      const heli = window.__apex.render({ what: "view", cols: 32, camera: "heli" });
      // A chase camera sits behind the car at road level and reliably frames it;
      // an overhead heli can be occluded by tall trackside structures, and the
      // cockpit is inside the car, so neither is a robust "car in shot" probe.
      const chase = window.__apex.render({ what: "view", cols: 64, camera: "chase" });
      return { cockMode: cock.camera.mode, cockSyn: cock.camera.synthetic,
               heliMode: heli.camera.mode, heliSyn: heli.camera.synthetic,
               cockRows: cock.grid.lines.length,
               chaseHasPlayer: (chase.coveragePct.player || 0) > 0,
               cockHasPlayer: (cock.coveragePct.player || 0) > 0 };
    });
    expect(r.cockMode).toBe("cockpit");
    expect(r.cockSyn).toBe(true);
    expect(r.heliMode).toBe("heli");
    expect(r.heliSyn).toBe(true);
    expect(r.cockRows).toBeGreaterThan(4);
    // an external chase camera frames the car; from the cockpit it is not in shot
    expect(r.chaseHasPlayer).toBe(true);
    expect(r.cockHasPlayer).toBe(false);
  });

  test("an unknown camera errors with the valid set", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => window.__apex.render({ what: "view", camera: "bogus" }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("BadArgumentError");
    expect(r.message).toContain("bogus");
  });

  test("orbit frames the car from a bearing", async ({ page }) => {
    await load(page, "monza", 0.05, 60);
    const r = await page.evaluate(() =>
      window.__apex.render({ what: "view", cols: 32, orbit: { az: 180, el: 20, dist: 15 } }));
    expect(r.camera.mode).toBe("orbit");
    expect(r.camera.synthetic).toBe(true);
    expect((r.coveragePct.player || 0)).toBeGreaterThan(0);
  });

  test("edges overlay directional glyphs on silhouettes only", async ({ page }) => {
    await load(page, "monza", 0.05, 60);
    await renderFrames(page);
    const r = await page.evaluate(() => {
      const plain = window.__apex.render({ what: "view", cols: 56, camera: "chase" });
      const edged = window.__apex.render({ what: "view", cols: 56, camera: "chase", edges: true });
      const count = (ls) => ls.join("").split("").filter((c) => "|-/\\".includes(c)).length;
      return { plainEdges: count(plain.grid.lines), edgedEdges: count(edged.grid.lines) };
    });
    // edges:true adds edge glyphs; without it there are essentially none from
    // the semantic fill
    expect(r.edgedEdges).toBeGreaterThan(r.plainEdges);
    expect(r.edgedEdges).toBeGreaterThan(3);
  });
});

test.describe("frame()", () => {
  test.use({ viewport: LANDSCAPE });

  test("rasterises the view into a labelled grid", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const f = await page.evaluate(() => window.__apex.render({ what: "view", cols: 48, rows: 16 }));
    expect(f.grid.cols).toBe(48);
    expect(f.grid.lines.length).toBe(16);
    for (const line of f.grid.lines) expect(line.length).toBe(48);
    // every glyph drawn must be in the legend, or the render is unreadable
    const glyphs = new Set(f.grid.lines.join("").split(""));
    for (const g of glyphs) expect(f.legend[g]).toBeTruthy();
    // coverage must account for the whole frame
    const total = Object.values(f.coveragePct).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 100)).toBeLessThan(1.5);
  });

  test("driving on track, the road dominates the lower frame", async ({ page }) => {
    await load(page, "monza", 0.05, 60);
    await renderFrames(page);
    const f = await page.evaluate(() => window.__apex.render({ what: "view", cols: 48, rows: 16 }));
    // The bug this pins: sampling the road as isolated points instead of
    // scan-filling between its edges reported a road that fills half the render
    // as 6% of the frame, and called the rest "ground".
    expect(f.coveragePct.road).toBeGreaterThan(20);
    const lower = f.grid.lines.slice(-4).join("");
    const roadCells = lower.split("").filter((c) => c === "=" || c === ":").length;
    expect(roadCells / lower.length).toBeGreaterThan(0.7);
  });

  test("the player car is drawn, and no single object owns the frame", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const f = await page.evaluate(() => window.__apex.render({ what: "view", cols: 48, rows: 16 }));
    expect(f.coveragePct.player).toBeGreaterThan(0);
    // A 22 m pine standing 20 m to the SIDE once painted every cell, because a
    // box straddling the near plane was widened to the full screen.
    for (const [kind, pct] of Object.entries(f.coveragePct)) {
      expect(pct, kind + " covers the whole frame").toBeLessThan(85);
    }
  });

  test("sky sits above the horizon row and ground below", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const f = await page.evaluate(() => window.__apex.render({ what: "view", cols: 32, rows: 16 }));
    expect(typeof f.grid.horizonRow).toBe("number");
    const below = f.grid.lines.slice(f.grid.horizonRow + 1).join("");
    expect(below.includes(".")).toBe(false);      // no sky under the horizon
  });

  test("objects are ranked by how much of the frame they hold", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const objs = await page.evaluate(() => window.__apex.render({ what: "view" }).objects);
    expect(objs.length).toBeGreaterThan(0);
    for (let i = 1; i < objs.length; i++) {
      expect(objs[i].cells).toBeLessThanOrEqual(objs[i - 1].cells);
    }
  });

  test("rows are derived so the image is not squashed", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    // A character cell is ~2x taller than wide, so a grid whose ratio equals the
    // viewport renders squashed. The old 48x18 default was an effective 1.33
    // against a 2.16 viewport — a square object came out 1.6x too tall.
    const f = await page.evaluate(() => window.__apex.render({ what: "view", cols: 48 }));
    expect(f.grid.aspect.corrected).toBe(true);
    expect(Math.abs(f.grid.aspect.renderedAspect - f.grid.aspect.viewport))
      .toBeLessThan(0.15);
    expect(f.grid.rows).toBe(f.grid.lines.length);
  });

  test("pinned rows are honoured and flagged as uncorrected", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const f = await page.evaluate(() => window.__apex.render({ what: "view", cols: 48, rows: 24 }));
    expect(f.grid.rows).toBe(24);
    expect(f.grid.aspect.corrected).toBe(false);
    expect(f.grid.aspect.note).toContain("pinned");
  });

  test("the depth channel is a real, monotonic depth buffer", async ({ page }) => {
    await load(page, "monza", 0.05, 60);
    await renderFrames(page);
    const f = await page.evaluate(() => window.__apex.render({ what: "view", cols: 40, depth: true }));
    expect(f.depth.lines.length).toBe(f.grid.rows);
    expect(f.depth.scaleM.length).toBe(10);
    // the scale is logarithmic and increasing, so the near field gets resolution
    for (let i = 1; i < f.depth.scaleM.length; i++) {
      expect(f.depth.scaleM[i]).toBeGreaterThan(f.depth.scaleM[i - 1]);
    }
    // the road runs away from the camera: the bottom row must read nearer than
    // a row up by the horizon
    const digits = (line) => line.split("").filter((c) => c !== " ").map(Number);
    const bottom = digits(f.depth.lines[f.depth.lines.length - 1]);
    const mid = digits(f.depth.lines[Math.max(0, f.grid.horizonRow)]);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);
    expect(avg(bottom)).toBeLessThan(avg(mid));
  });

  test("depth is omitted unless asked for", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const f = await page.evaluate(() => window.__apex.render({ what: "view", cols: 32 }));
    expect(f.depth).toBeUndefined();
  });

  test("never returns null — a render or an actionable error", async ({ page }) => {
    await boot(page);
    const f = await page.evaluate(() => window.__apex.render({ what: "view" }));
    expect(f).toBeTruthy();
    if (f.ok === false) {
      // no track, or no frame drawn yet
      expect(["NoTrackError", "NoFrameError"]).toContain(f.error);
      expect(f.fix).toBeTruthy();
    } else {
      // the menu runs a background flyby, so a real frame is often already
      // drawn — rendering it is a legitimate answer
      expect(f.grid.lines.length).toBeGreaterThan(0);
    }
  });

  test("flags a stale frame under headless", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const f = await page.evaluate(() => {
      window.__apex.headless(true);
      const out = window.__apex.render({ what: "view", cols: 24, rows: 8 });
      window.__apex.headless(false);
      return out;
    });
    expect(f.framePending).toBe(true);
    expect(f.warning).toContain("stale");
  });
});

// ── plan() ──────────────────────────────────────────────────────────────────
// The allocentric top-down map. Its value is the metric index paired with the
// raster: coordinates for precision, the grid for gestalt (GSU + VoT).

test.describe("plan()", () => {
  test.use({ viewport: LANDSCAPE });

  test("draws a car-up top-down map with a metric index", async ({ page }) => {
    await load(page, "monza", 0.28, 60);
    const pl = await page.evaluate(() => window.__apex.render({ what: "map", radiusM: 180, cols: 60 }));
    expect(pl.frame).toContain("car-up");
    expect(pl.grid.lines.length).toBeGreaterThan(10);
    // the player is at the centre of a car-up map
    const cc = Math.round(pl.scale.cols / 2), cr = Math.round(pl.scale.rows / 2);
    expect(pl.grid.lines[cr][cc]).toBe("@");
    // the index carries exact coords, not just glyphs
    expect(pl.ego.headingDeg).toBeDefined();
    expect(typeof pl.scale.metresPerCol).toBe("number");
    for (const c of pl.corners) {
      expect(c.cell.length).toBe(2);
      expect(c.world.length).toBe(2);
      expect(typeof c.bearingDeg).toBe("number");
    }
  });

  test("northUp switches to the world frame", async ({ page }) => {
    await load(page, "monza", 0.28, 60);
    const pl = await page.evaluate(() => window.__apex.render({ what: "map", northUp: true }));
    expect(pl.frame).toContain("north-up");
    expect(pl.scale.note).toContain("east");
  });

  test("a bigger radius covers more track", async ({ page }) => {
    await load(page, "monza", 0.28, 60);
    const r = await page.evaluate(() => ({
      near: window.__apex.render({ what: "map", radiusM: 80 }).corners.length,
      far: window.__apex.render({ what: "map", radiusM: 600 }).corners.length,
    }));
    expect(r.far).toBeGreaterThanOrEqual(r.near);
  });

  test("errors before a track is loaded", async ({ page }) => {
    await boot(page);
    const pl = await page.evaluate(() => window.__apex.render({ what: "map" }));
    expect(pl).toBeTruthy();
    if (pl.ok === false) expect(pl.fix).toContain("race");
    else expect(pl.grid).toBeTruthy();
  });
});

// ── carView() ───────────────────────────────────────────────────────────────

test.describe("carView()", () => {
  test.use({ viewport: LANDSCAPE });

  test("measures the car from a real build", async ({ page }) => {
    await load(page);
    const c = await page.evaluate(() => window.__apex.carView());
    expect(c.geometry.vertices).toBeGreaterThan(500);
    expect(c.geometry.triangles).toBeGreaterThan(200);
    // a modern F1 car: ~5-6 m long, ~2 m wide, under 1.2 m tall
    expect(c.geometry.lengthM).toBeGreaterThan(4.5);
    expect(c.geometry.lengthM).toBeLessThan(6.5);
    expect(c.geometry.widthM).toBeGreaterThan(1.8);
    expect(c.geometry.widthM).toBeLessThan(2.4);
    expect(c.geometry.heightM).toBeLessThan(1.3);
    expect(c.geometry.wheelbaseM).toBeCloseTo(3.3, 1);
  });

  test("reports the full parts spec and its effect", async ({ page }) => {
    await load(page);
    const c = await page.evaluate(() => window.__apex.carView());
    expect(c.parts.chosen.length).toBe(await page.evaluate(() => Parts.CATALOG.length));
    const cats = c.parts.chosen.map((p) => p.category);
    expect(cats).toContain("engine");
    expect(cats).toContain("aero");
    const cap = await page.evaluate(() => Parts.BUDGET);
    expect(c.parts.budget).toBe(cap);
    expect(c.parts.spent + c.parts.remaining).toBe(cap);
    for (const k of ["speed", "accel", "cornering", "braking"]) {
      expect(typeof c.parts.mods[k]).toBe("number");
    }
  });

  test("carries team identity and the chassis silhouette knobs", async ({ page }) => {
    await load(page);
    const c = await page.evaluate(() => window.__apex.carView({ team: "ferrari" }));
    expect(c.team.id).toBe("ferrari");
    expect(c.team.colors.primary.length).toBe(3);
    expect(c.team.drivers.length).toBeGreaterThan(0);
    expect(typeof c.chassis.style.noseSlim).toBe("number");
    expect(typeof c.chassis.bespokeSilhouette).toBe("boolean");
    expect(c.chassis.axles.frontZ).toBeGreaterThan(c.chassis.axles.rearZ);
  });

  test("a different team gives different geometry or identity", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const a = window.__apex.carView({ team: "ferrari" });
      const b = window.__apex.carView({ team: "mercedes" });
      return { aId: a.team.id, bId: b.team.id,
               aStyle: JSON.stringify(a.chassis.style),
               bStyle: JSON.stringify(b.chassis.style),
               aCol: a.team.colors.primary, bCol: b.team.colors.primary };
    });
    expect(r.aId).not.toBe(r.bId);
    expect(JSON.stringify(r.aCol)).not.toBe(JSON.stringify(r.bCol));
  });

  test("detail:render draws edge+shade elevations from the real mesh", async ({ page }) => {
    await load(page);
    const c = await page.evaluate(() => window.__apex.carView({ detail: "render", cols: 60 }));
    expect(c.render).toBeTruthy();
    for (const view of ["side", "top", "front"]) {
      expect(c.render[view].lines.length).toBeGreaterThan(3);
      const body = c.render[view].lines.join("");
      // must contain both edge glyphs and shade-ramp glyphs — not a flat fill
      expect(/[|/\\-]/.test(body)).toBe(true);
      expect(/[.:=+*oO#%@]/.test(body)).toBe(true);
      expect(typeof c.render[view].mPerCol).toBe("number");
    }
    // the front view is symmetric-ish (a car seen head-on) — the wheels appear
    // on both sides, so 'O' or '#' occurs in the left and right thirds
    const front = c.render.front.lines;
    const w = front[0].length;
    const hasHeavy = (s) => /[O#%@]/.test(s);
    const leftHeavy = front.some((l) => hasHeavy(l.slice(0, Math.floor(w / 3))));
    const rightHeavy = front.some((l) => hasHeavy(l.slice(Math.floor(2 * w / 3))));
    expect(leftHeavy && rightHeavy).toBe(true);
  });

  test("render is omitted unless asked for", async ({ page }) => {
    await load(page);
    const c = await page.evaluate(() => window.__apex.carView());
    expect(c.render).toBeUndefined();
  });

  test("an unknown team errors instead of silently answering for another", async ({ page }) => {
    await load(page);
    const c = await page.evaluate(() => window.__apex.carView({ team: "nosuchteam" }));
    expect(c.ok).toBe(false);
    expect(c.error).toBe("NoTeamError");
    expect(c.fix).toContain("teams()");
  });
});

// ── survey() ────────────────────────────────────────────────────────────────
// Replaces the screenshot-driven survey pass. The tests that matter are the
// calibration ones: four classes of false positive had to die before the report
// meant anything, and each would silently come back.

test.describe("survey()", () => {
  test.use({ viewport: LANDSCAPE });

  test("Monza surveys clean", async ({ page }) => {
    await load(page, "monza");
    const s = await page.evaluate(() => window.__apex.survey());
    expect(s.summary.propsChecked).toBeGreaterThan(500);
    // Props are deliberately sunk below grade, so a naive "base above zero"
    // test flags every prop in the game. Floating is measured against TERRAIN.
    expect(s.summary.floating).toBe(0);
    expect(s.summary.buried).toBe(0);
    // The terrain ribbon stops short of the tarmac by design and the road mesh
    // covers the middle — counting those nulls reported one hole per station.
    expect(s.summary.terrainHoles).toBe(0);
    // A cliff is a slope, not a height: 1 m over 10 m of lateral is a hillside.
    expect(s.summary.groundCliffs).toBe(0);
    expect(s.summary.terrainOverRoad).toBe(0);
    expect(s.summary.modelsInvalid).toBe(0);
    expect(s.summary.clean).toBe(true);
  });

  test("no circuit ships a model the guard had to reject", async ({ page }) => {
    // This caught vegas.js passing `mast: true` where tower() wants a height in
    // metres — both landmark towers lost their antenna silently.
    await load(page, "vegas");
    const s = await page.evaluate(() => window.__apex.survey());
    expect(s.summary.modelsInvalid, JSON.stringify(s.modelDiagnostics.invalid)).toBe(0);
  });

  test("props-over-road is labelled a screen, not a verdict", async ({ page }) => {
    await load(page, "monza");
    const s = await page.evaluate(() => window.__apex.survey());
    // Registry boxes are world-axis-aligned, so an elongated object on a curve
    // over-reports. It must not contribute to the clean verdict, and the
    // payload must name the authoritative tool.
    expect(s.summary).toHaveProperty("propsOverRoadCandidates");
    expect(s.authoritative.propsOverRoad).toContain("measure-props-over-road");
    expect(s.summary.clean).toBe(true);
  });

  test("the lateral profile is only returned when asked for", async ({ page }) => {
    await load(page, "monza");
    const r = await page.evaluate(() => ({
      without: window.__apex.survey().profile,
      with: window.__apex.survey({ at: 4, profile: true }).profile,
    }));
    expect(r.without).toBeUndefined();
    expect(r.with.length).toBe(4);
    expect(r.with[0].samples.length).toBeGreaterThan(4);
  });

  test("errors before a track is loaded", async ({ page }) => {
    await boot(page);
    const s = await page.evaluate(() => window.__apex.survey());
    expect(s).toBeTruthy();
    if (s.ok === false) expect(s.fix).toContain("race");
    else expect(s.summary).toBeTruthy();
  });
});

// ── carView parts ───────────────────────────────────────────────────────────

test.describe("carView({detail:\"parts\"})", () => {
  test.use({ viewport: LANDSCAPE });

  test("measures every section of the car", async ({ page }) => {
    await load(page);
    const c = await page.evaluate(() => window.__apex.carView({ detail: "parts" }));
    expect(c.partCount).toBeGreaterThan(12);
    // the parts SPEC must survive alongside the part GEOMETRY — two `parts`
    // keys in one literal silently dropped the spec
    expect(c.parts.chosen.length).toBe(await page.evaluate(() => Parts.CATALOG.length));
    const byName = Object.fromEntries(c.partGeometry.map((p) => [p.name, p]));
    for (const n of ["chassis", "frontWing", "rearAssembly", "wheels", "cockpit"]) {
      expect(byName[n], n + " missing").toBeTruthy();
      expect(byName[n].vertices).toBeGreaterThan(0);
    }
    // anatomy: the front wing is the widest single element and sits ahead of
    // the rear assembly, which is hindmost
    expect(byName.frontWing.boundsZ[0]).toBeGreaterThan(byName.rearAssembly.boundsZ[1]);
    expect(byName.frontWing.sizeM[0]).toBeGreaterThan(1.8);
  });

  test("instrumentation changed no geometry", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const plain = window.__apex.carView();
      const parts = window.__apex.carView({ detail: "parts" });
      const sum = parts.partGeometry.reduce((a, p) => a + p.vertices, 0);
      return { plain: plain.geometry.vertices, parts: parts.geometry.vertices, sum };
    });
    expect(r.plain).toBe(r.parts);
    // sections partition the mesh, so their vertices must add up to the whole
    expect(r.sum).toBe(r.plain);
  });

  test("parts are omitted unless requested", async ({ page }) => {
    await load(page);
    const c = await page.evaluate(() => window.__apex.carView());
    expect(c.partGeometry).toBeUndefined();
    expect(c.parts.chosen.length).toBe(await page.evaluate(() => Parts.CATALOG.length));   // the spec is always present
    expect(c.geometry).toBeTruthy();
  });

  test("per-team silhouette shows up in measured geometry", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ["mclaren", "ferrari", "mercedes"].map((t) => {
      const c = window.__apex.carView({ team: t, detail: "parts" });
      // THE CHASSIS PART, not the whole car's bounds. This read
      // `geometry.boundsM.z[1]` — the frontmost vertex of anything — which was
      // the nose tip only while the nose was the frontmost thing on the car.
      // It no longer is, and that is the fix rather than the bug: the tip sat
      // 460 mm AHEAD of the front wing's main plane (z 2.72), a pencil of nose
      // hanging in clear air that no F1 car has, and it now sits 120 mm behind
      // the wing like a real one. So bounds.z[1] is the WING for every team —
      // identical by construction, because the wing is regulated and shared.
      // The chassis part's own boundsZ is the nose tip, and it still carries
      // the full per-team spread this test exists to catch (measured
      // 2.54/2.60/2.68 for mclaren/ferrari/mercedes = exactly their noseTipZ).
      // `partGeometry`, NOT `parts` — the latter is the catalog spec, and
      // agentview.js carries a comment about a second `parts` key once silently
      // winning and deleting that spec from the payload.
      const chassis = c.partGeometry.find((p) => p.name === "chassis");
      return { team: t, noseZ: chassis.boundsZ[1], verts: c.geometry.vertices,
               fin: c.chassis.style.fin };
    }));
    // noseTipZ styling must be visible in the measured nose tip
    const noses = new Set(r.map((x) => x.noseZ));
    expect(noses.size).toBeGreaterThan(1);
    // a team with a dorsal fin carries more geometry than one without
    const withFin = r.find((x) => x.fin > 0), without = r.find((x) => x.fin === 0);
    if (withFin && without) expect(withFin.verts).toBeGreaterThan(without.verts);
  });
});

// ── worldModel() ────────────────────────────────────────────────────────────
// The whole circuit as one document. The design problem here is size, not
// availability: Suzuka records 3,422 point objects and listing them one by one
// is ~85k tokens of "pine, pine, pine" that describes the place no better than
// the vertex buffer did. These tests pin the aggregation that makes it readable.

test.describe("worldModel()", () => {
  test.use({ viewport: LANDSCAPE });

  test("summary aggregates thousands of objects into a readable document", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.render({ what: "circuit", detail: "summary" }));
    expect(w.track.id).toBe("monza");
    expect(w.totals.objects).toBeGreaterThan(1000);
    expect(w.totals.registryComplete).toBe(true);
    // aggregation must be a big win over the raw object count
    expect(w.features.length).toBeLessThan(w.totals.objects / 5);
    expect(w.features.length).toBeGreaterThan(5);
    expect(w.landmarks.length).toBeGreaterThan(0);
    expect(w.spans.length).toBeGreaterThan(0);
    // summary must stay affordable to read
    expect(JSON.stringify(w).length).toBeLessThan(120000);
  });

  test("no feature spans the whole lap", async ({ page }) => {
    await load(page);
    // The bug this pins: trees spaced under the cluster gap all the way round a
    // park circuit collapsed into ONE feature covering 5,741 m of a 5,777 m lap.
    // True, and a useless description of the place.
    const w = await page.evaluate(() => window.__apex.render({ what: "circuit" }));
    const lap = w.track.lengthM;
    for (const f of w.features) {
      expect(f.runLengthM).toBeLessThan(lap * 0.2);
      expect(f.count).toBeGreaterThanOrEqual(3);
      expect(["left", "right", "across", "off-course"]).toContain(f.side);
    }
  });

  test("landmarks are structures, not repeated dressing", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.render({ what: "circuit" }));
    const kinds = new Set(w.landmarks.map((l) => l.kind));
    // ridge/peak are landform SEGMENTS emitted in their hundreds — if they leak
    // into landmarks they bury the things a driver would actually point at
    expect(kinds.has("ridge")).toBe(false);
    expect(kinds.has("peak")).toBe(false);
    expect(kinds.has("tree")).toBe(false);
    for (const l of w.landmarks) {
      expect(l.sizeM.length).toBe(3);
      expect(l.frac).toBeGreaterThanOrEqual(0);
      expect(l.frac).toBeLessThan(1);
    }
  });

  // Kept in sync with js/track/scenery-structures.js by tests/unit/span-kinds.test.mjs.
  const SPAN_KINDS = ["guardrail", "fence", "tyreWall", "wall",
                      "bleacher", "scaffoldStand", "terrace", "tieredBowl"];

  test("linear furniture is spans, not thousands of segments", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.render({ what: "circuit" }));
    expect(w.spans.length).toBeLessThan(60);
    expect(w.spans.length, "a built Monza reported no linear furniture at all").toBeGreaterThan(0);
    for (const s of w.spans) {
      // SOURCE OF TRUTH: every `ctx.noteSpan(...)` call site in
      // js/track/scenery-structures.js. This list was four kinds long while the
      // emitters had grown to eight — the grandstand family (bleacher,
      // scaffoldStand, terrace, tieredBowl) became spans later and nothing here
      // followed. tests/unit/span-kinds.test.mjs now fails if the two diverge again.
      expect(SPAN_KINDS).toContain(s.kind);
      expect(["left", "right"]).toContain(s.side);
      expect(s.lengthM).toBeGreaterThan(0);
    }
  });

  test("sections walk the lap corner by corner", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.render({ what: "circuit", detail: "sections" }));
    expect(w.sections.length).toBeGreaterThan(3);
    let sum = 0;
    for (const s of w.sections) {
      expect(s.from).toMatch(/^T\d/);
      expect(s.to).toMatch(/^T\d/);
      expect(s.lengthM).toBeGreaterThan(0);
      expect(typeof s.contains).toBe("object");
      sum += s.lengthM;
    }
    // the sections must tile the lap, not overlap or leave gaps
    expect(Math.abs(sum - w.track.lengthM)).toBeLessThan(w.track.lengthM * 0.02);
  });

  test("full paginates the raw object list", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const all = window.__apex.render({ what: "circuit", detail: "full", limit: 5000 });
      const a = window.__apex.render({ what: "circuit", detail: "full", limit: 50 });
      const b = window.__apex.render({ what: "circuit", detail: "full", offset: 50, limit: 50 });
      return { aN: a.objects.length, aPage: a.objectPage, bPage: b.objectPage,
               a: JSON.stringify(a.objects), b: JSON.stringify(b.objects),
               wantA: JSON.stringify(all.objects.slice(0, 50)),
               wantB: JSON.stringify(all.objects.slice(50, 100)),
               total: all.objectPage.total };
    });
    expect(r.aN).toBe(50);
    expect(r.aPage.more).toBe(true);
    expect(r.aPage.total).toBeGreaterThan(50);
    // Each page must BE the corresponding slice of the whole list. The earlier
    // form of this — "page 2's first object differs from page 1's last" — was
    // not a pagination assertion at all: the detail:"full" projection drops
    // `k`, `measured` and rotation, so genuinely distinct props at one point
    // (a double-sided board, say) serialise identically. Monza has 20 such
    // adjacent pairs in 2690 props, and once one of them straddled the
    // 50-boundary the test went red with pagination working perfectly.
    expect(r.a).toBe(r.wantA);
    expect(r.b).toBe(r.wantB);
    expect(r.bPage.offset).toBe(50);
    expect(r.bPage.total).toBe(r.total);
  });

  test("sign boards keep their meaning", async ({ page }) => {
    await load(page, "suzuka");
    const boards = await page.evaluate(() =>
      window.__apex.render({ what: "circuit", detail: "full", limit: 5000 })
        .objects.filter((o) => o.board));
    expect(boards.length).toBeGreaterThan(0);
    // a corner board names its turn; a braking board names its distance
    expect(boards.some((b) => b.board === "corner" && typeof b.value === "number")).toBe(true);
  });

  test("rejects an unknown detail level", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.render({ what: "circuit", detail: "everything" }));
    expect(w.ok).toBe(false);
    expect(w.error).toBe("BadArgumentError");
    expect(w.message).toContain("summary");
  });
});

// ── rollout() ───────────────────────────────────────────────────────────────

test.describe("rollout()", () => {
  test.use({ viewport: LANDSCAPE });

  test("summarises an interval instead of returning frames", async ({ page }) => {
    await load(page, "monza", 0.0, 55);
    const r = await page.evaluate(() => window.__apex.rollout({
      seconds: 4, samples: 5, input: { steer: 0, throttle: true },
    }));
    expect(r.ran.ticks).toBe(240);
    expect(r.ran.policy).toContain("open-loop");
    expect(r.distanceM).toBeGreaterThan(0);
    expect(r.speedKph.max).toBeGreaterThanOrEqual(r.speedKph.min);
    expect(r.samples.length).toBeLessThanOrEqual(6);
    expect(typeof r.minClearanceM).toBe("number");
    expect(r.terminal).toBeTruthy();
    // The whole point: the digest is far cheaper than the frames it replaces.
    expect(JSON.stringify(r).length).toBeLessThan(4000);
  });

  test("full throttle into Monza's first chicane goes off track", async ({ page }) => {
    // Start WITHIN REACH of the chicane. Monza's first bend starts at s≈535 m
    // and a 6 s full-throttle rollout covers ~390 m, so from s=0 the car
    // physically CANNOT arrive — this test only ever passed via a seeded AI
    // contact punt, not the mechanism it names. From frac 0.05 (s≈289, dead
    // straight) at 60 m/s the car reaches the chicane at ~4 s and overshoots
    // it with ~2 s of the rollout left to spend off the road.
    await load(page, "monza", 0.05, 60);
    // Not a physics assertion so much as a sanity check that the digest actually
    // reflects what happened: drive straight at a chicane and you leave the road.
    const r = await page.evaluate(() => window.__apex.rollout({
      seconds: 6, input: { steer: 0, throttle: true },
    }));
    expect(r.offTrack.events).toBeGreaterThan(0);
    expect(r.offTrack.seconds).toBeGreaterThan(1);
    expect(r.speedKph.final).toBeLessThan(r.speedKph.max);
  });

  test("runs a closed-loop policy at policyHz", async ({ page }) => {
    await load(page, "monza", 0.0, 45);
    const r = await page.evaluate(() => {
      let calls = 0;
      const out = window.__apex.rollout({
        seconds: 2, policyHz: 10,
        policy: (w) => { calls++; return { steer: -w.ego.lateralM * 0.05, throttle: true }; },
      });
      return { out, calls };
    });
    expect(r.out.ran.policy).toContain("closed-loop");
    // 2 s at 10 Hz — allow a tick of slop either side
    expect(r.calls).toBeGreaterThanOrEqual(19);
    expect(r.calls).toBeLessThanOrEqual(21);
  });

  test("a throwing policy returns a typed error, not a crash", async ({ page }) => {
    await load(page, "monza", 0.0, 45);
    const r = await page.evaluate(() => window.__apex.rollout({
      seconds: 1, policy: () => { throw new Error("boom"); },
    }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("PolicyError");
    expect(r.message).toContain("boom");
    expect(r.fix).toBeTruthy();
  });

  test("does not disturb the caller's delta chain", async ({ page }) => {
    await load(page);
    // rollout calls world() internally for the policy; if it advanced the shared
    // seq/baseline, the caller's next since= would silently fall back to a full
    // payload and the agent would never know.
    const r = await page.evaluate(() => {
      const a = window.__apex.world({ detail: "brief" });
      window.__apex.rollout({ seconds: 1, policy: () => ({ throttle: true }) });
      const d = window.__apex.world({ detail: "brief", since: a.seq });
      return { base: a.seq, deltaBase: d.deltaBase, note: d.note || null };
    });
    expect(r.deltaBase).toBe(r.base);
    expect(r.note).toBeNull();
  });

  test("records minimum speed through corners actually driven", async ({ page }) => {
    await load(page, "monza", 0.0, 45);
    const cs = await page.evaluate(() => window.__apex.rollout({
      seconds: 10, input: { steer: 0.15, throttle: true },
    }).cornerMinSpeedKph);
    expect(Array.isArray(cs)).toBe(true);
    for (const c of cs) {
      expect(c.turn).toMatch(/^T\d+/);
      expect(c.minSpeedKph).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── agentHelp() ─────────────────────────────────────────────────────────────

test.describe("agentHelp()", () => {
  test.use({ viewport: LANDSCAPE });

  test("describes the surface without needing a track", async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => window.__apex.agentHelp());
    expect(h.apiVersion).toBe(1);
    // EVERY primary agent call must appear, or discovery silently hides it. The
    // surface is the consolidated six + the utilities — the four rasters are
    // demoted behind render({what}), so they are NOT peer entries here.
    const listed = Object.keys(h.perceive)
      .concat(Object.keys(h.know), Object.keys(h.act),
              Object.keys(h.detail || {})).join(" ");
    for (const k of ["world(", "field(", "scene(", "atmosphere(", "render(",
                     "trackInfo(", "carView(", "survey(", "rollout(", "terminal(",
                     "describe(", "query("]) {
      expect(listed, k + " missing from agentHelp()").toContain(k);
    }
    // the drill-down layer must be advertised as its own thing, or an agent
    // will never learn it can pull detail instead of asking for everything
    expect(h.detail, "drill-down section missing").toBeTruthy();
    // scene() must advertise its {visible} mode so the on-screen list is findable
    expect(listed).toContain("visible");
    // agent view is the text-native mirror of the WHOLE __apex toolkit, so the
    // manifest must surface the already-JSON read hooks and the control verbs —
    // otherwise "do everything the debug hooks do" is not discoverable.
    expect(h.read, "read hooks missing").toBeTruthy();
    expect(JSON.stringify(h.read)).toMatch(/physState|lightState|timing/);
    // The field glossary is the highest-value part of the manifest: attaching
    // meaning to the identifiers an agent already reads is the best-measured
    // context intervention there is. Assert it exists AND that every line
    // stays short — the same augmentation done verbosely measurably costs
    // execution steps, and a glossary that rots into prose is bloat.
    expect(h.fields, "field glossary missing").toBeTruthy();
    expect(Object.keys(h.fields).length).toBeGreaterThan(8);
    for (const [k, v] of Object.entries(h.fields)) {
      expect(v.split(" ").length, k + " is too wordy for a glossary line")
        .toBeLessThanOrEqual(16);
    }
    expect(h.control, "control verbs missing").toBeTruthy();
    expect(JSON.stringify(h.control)).toMatch(/act\(|weather|jump/);
    // The one-time deprecated aliases (frame/plan/worldModel/visible) are GONE —
    // callers migrated to render({what})/scene({visible}), and the contract test
    // pins their absence from the surface. The manifest must not resurrect them:
    // no note may advertise them as callable, and the canonical calls must be
    // the ones it teaches.
    const notes = h.notes.join(" ");
    expect(notes).not.toMatch(/frame\(\)|plan\(\)|worldModel\(\)|visible\(\)/);
    expect(notes).toContain("render({what})");
    expect(h.loop).toContain("world()");
    expect(h.cli).toContain("agent.mjs");
    expect(notes).toContain("null");
    // the static/dynamic model note replaces the old whenToUse block
    expect(Object.keys(h.model).length).toBeGreaterThan(2);
    // It is a manifest, not documentation — keep it cheap. It now maps the whole
    // toolkit (read hooks + control verbs), so a little larger, still bounded.
    //
    // 6 KB, not the old 5500: measured 5474, and a ceiling seven bytes above the
    // artefact is not a budget, it is a tripwire that fires on adding a word.
    // What this has to stop is the manifest turning INTO the documentation —
    // another whole section, not another clause — and 6 KB says that where 5500
    // only said "you edited it".
    expect(JSON.stringify(h).length).toBeLessThan(6000);
  });
});

// ── render() — the consolidated composition aid ──────────────────────────────
// The four rasters (frame/plan/worldModel/car) collapse to one call behind a
// `what` switch, flagged approximate. These pin that the dispatch is correct
// and that the demotion is visible in the payload.

// ── render() higher fidelity — a human-facing opt-in ─────────────────────────
// User-requested despite the evidence saying denser rasters don't help agent
// comprehension: kept as an explicit opt-in for looking at, not measuring from.
// Defaults must stay coarse, and an unreasonable request must clamp rather than
// hang the tab.

test.describe("render() higher fidelity", () => {
  test.use({ viewport: LANDSCAPE });

  test("the default view is unchanged; cols raises the resolution on request", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      def: window.__apex.render({ what: "view", camera: "chase" }).grid.cols,
      big: window.__apex.render({ what: "view", cols: 200, camera: "chase" }).grid.cols,
      overCap: window.__apex.render({ what: "view", cols: 5000, camera: "chase" }).grid.cols,
    }));
    expect(r.def).toBe(48);
    expect(r.big).toBe(200);
    // an unreasonable request clamps rather than hanging the tab
    expect(r.overCap).toBeLessThan(5000);
    expect(r.overCap).toBeGreaterThan(200);
  });

  test("ss raises supersampling on the car render and visibly changes it", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const lo = window.__apex.carView({ team: "ferrari", detail: "render", cols: 40, ss: 1 });
      const hi = window.__apex.carView({ team: "ferrari", detail: "render", cols: 40, ss: 6 });
      const huge = window.__apex.carView({ team: "ferrari", detail: "render", cols: 999999, ss: 999 });
      return { lo: lo.render.side.lines.join("\n"), hi: hi.render.side.lines.join("\n"),
               hugeCols: huge.render.side.cols };
    });
    expect(r.lo).not.toBe(r.hi);
    // an unreasonable request clamps rather than hanging the tab
    expect(r.hugeCols).toBeLessThan(999999);
  });

  test("stays flagged approximate and does not become the default surface", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() =>
      window.__apex.render({ what: "view", cols: 200, camera: "chase" }));
    expect(r.aid).toContain("APPROXIMATE");
  });
});

test.describe("render() consolidation", () => {
  test.use({ viewport: LANDSCAPE });

  test("dispatches each what to the matching raster, flagged approximate", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const view = window.__apex.render({ what: "view", cols: 40, camera: "chase" });
      const map = window.__apex.render({ what: "map", cols: 40 });
      const circuit = window.__apex.render({ what: "circuit", detail: "summary" });
      const car = window.__apex.render({ what: "car", cols: 40 });
      return {
        view: { what: view.what, hasGrid: !!(view.grid && view.grid.lines), aid: view.aid },
        map: { what: map.what, hasGrid: !!(map.grid && map.grid.lines), aid: map.aid },
        circuit: { what: circuit.what, hasLayout: !!(circuit.layout || circuit.sections || circuit.summary), aid: circuit.aid },
        car: { what: car.what, hasRender: !!car.render, aid: car.aid },
      };
    });
    expect(r.view.what).toBe("view");
    expect(r.view.hasGrid).toBe(true);
    expect(r.view.aid).toContain("APPROXIMATE");
    expect(r.map.what).toBe("map");
    expect(r.map.hasGrid).toBe(true);
    expect(r.circuit.what).toBe("circuit");
    expect(r.car.what).toBe("car");
    expect(r.car.hasRender).toBe(true);      // render forces detail:"render"
    expect(r.car.aid).toContain("APPROXIMATE");
  });

  test("an unknown what is a typed error with the valid set", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => window.__apex.render({ what: "bogus" }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("BadArgumentError");
    expect(r.message).toMatch(/view.*map.*circuit.*car|view/);
  });
});

// ── scene() ─────────────────────────────────────────────────────────────────
// Before the registry existed, nothing that survived a build carried a label
// except track.lampPosts — buildProps emitted straight into vertex buffers and
// the footprint list died with the call. These tests pin the registry's two
// load-bearing properties: it is COMPLETE (nothing silently dropped) and it is
// EGOCENTRIC and self-describing.

test.describe("scene()", () => {
  test.use({ viewport: LANDSCAPE });

  test("records every semantic placement, dropping none", async ({ page }) => {
    await load(page);
    const s = await page.evaluate(() => window.__apex.scene({ radius: 150 }));
    expect(s.registry.dropped).toBe(0);
    expect(s.registry.complete).toBe(true);
    expect(s.registry.recorded).toBeGreaterThan(100);
    expect(s.registry.recorded).toBeLessThan(s.registry.cap);
    // Monza is a park circuit — trees must dominate, and the named structures
    // must be present or the emitters aren't wired to note().
    expect(s.counts.byKindLapTotal.tree).toBeGreaterThan(100);
    expect(s.counts.byKindLapTotal.grandstand).toBeGreaterThan(0);
    expect(s.counts.byKindLapTotal.building).toBeGreaterThan(0);
  });

  test("props are egocentric, sorted, and inside the radius", async ({ page }) => {
    await load(page);
    const s = await page.evaluate(() => window.__apex.scene({ radius: 120, limit: 20 }));
    expect(s.origin.from).toBe("player");
    expect(s.props.length).toBeGreaterThan(0);
    for (let i = 0; i < s.props.length; i++) {
      const p = s.props[i];
      expect(p.distM).toBeLessThanOrEqual(120);
      expect(Math.abs(p.bearingDeg)).toBeLessThanOrEqual(180);
      // side must agree with the bearing it was derived from
      if (p.side === "right") expect(p.bearingDeg).toBeGreaterThan(0);
      if (p.side === "left") expect(p.bearingDeg).toBeLessThan(0);
      // trackSide is the STABLE centreline side (which side of the road) that
      // worldModel()/describe() also report, so the same prop cross-references
      // between the egocentric and centreline frames instead of flipping.
      expect(["left", "right", "across", "off-course"]).toContain(p.trackSide);
      expect(p.sizeM.length).toBe(3);
      if (i) expect(p.distM).toBeGreaterThanOrEqual(s.props[i - 1].distM);
    }
  });

  test("a bigger radius can only find more, never fewer", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      near: window.__apex.scene({ radius: 50 }).counts.inRadius,
      far: window.__apex.scene({ radius: 400 }).counts.inRadius,
    }));
    expect(r.far).toBeGreaterThan(r.near);
  });

  test("the kinds filter narrows results without changing lap totals", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const all = window.__apex.scene({ radius: 300, limit: 200 });
      const trees = window.__apex.scene({ radius: 300, limit: 200, kinds: ["tree"] });
      return { allN: all.counts.inRadius, treeN: trees.counts.inRadius,
               kinds: [...new Set(trees.props.map((p) => p.kind))],
               lapTotalSame: all.counts.lapTotal === trees.counts.lapTotal };
    });
    expect(r.kinds).toEqual(["tree"]);
    expect(r.treeN).toBeLessThan(r.allN);
    expect(r.lapTotalSame).toBe(true);
  });

  test("truncation is reported rather than hidden", async ({ page }) => {
    await load(page);
    const s = await page.evaluate(() => window.__apex.scene({ radius: 300, limit: 3 }));
    expect(s.props.length).toBe(3);
    expect(s.truncated).toBeGreaterThan(0);
    expect(s.truncated).toBe(s.counts.inRadius - 3);
  });

  test("a street circuit has buildings and no trees", async ({ page }) => {
    await load(page, "monaco");
    const by = await page.evaluate(() =>
      window.__apex.scene({ radius: 200 }).counts.byKindLapTotal);
    expect(by.building).toBeGreaterThan(0);
    expect(by.tree || 0).toBe(0);
  });

  test("floodlight masts come through with their fixture kind", async ({ page }) => {
    await load(page, "monza");
    const lamps = await page.evaluate(() => window.__apex.scene({ radius: 300 }).lamps);
    expect(lamps.length).toBeGreaterThan(0);
    for (const l of lamps) {
      expect(typeof l.kind).toBe("string");
      expect(l.distM).toBeLessThanOrEqual(300);
    }
  });

  test("errors before a track is loaded, never returns null", async ({ page }) => {
    await boot(page);
    const s = await page.evaluate(() => window.__apex.scene());
    expect(s).toBeTruthy();
    if (s.ok === false) expect(s.fix).toBeTruthy();
    else expect(s.registry).toBeTruthy();
  });
});

// ── visible() ───────────────────────────────────────────────────────────────
// visible() reads the LAST RENDERED frame, so every test here has to let frames
// draw first. Skipping that was the first bug found while building it: the
// camera still sat 380 m away at its pre-jump position.

async function renderFrames(page, n = 10) {
  await page.evaluate((count) => new Promise((res) => {
    // load() jump()ed the car; snapCam() is REQUIRED after park()/jump() before
    // a shot (AGENTS.md sharp edges) — without it the chase cam spends these
    // settle frames converging from its pre-jump position through exponential
    // damping, and ~11 rAF frames under SwiftShader are not always enough. Snap
    // first (no-op if no player/track), then let the frames draw from a camera
    // already at its solved vantage.
    window.__apex.snapCam();
    let i = 0;
    const tick = () => (++i > count ? res(0) : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);
}

test.describe("visible()", () => {
  test.use({ viewport: LANDSCAPE });

  test("reports scenery chunks inside the camera frustum", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const v = await page.evaluate(() => window.__apex.scene({ visible: true, limit: 4 }));
    expect(v.scenery.available).toBe(true);
    expect(v.scenery.cellSizeM).toBe(72);
    expect(v.scenery.totalCells).toBeGreaterThan(50);
    // Some scenery must be in view, but never all of it — that would mean the
    // cull test is passing everything and the answer is worthless.
    expect(v.scenery.visibleCells).toBeGreaterThan(0);
    expect(v.scenery.visibleCells).toBeLessThan(v.scenery.totalCells);
    expect(v.scenery.nearest.length).toBeLessThanOrEqual(4);
    for (const c of v.scenery.nearest) {
      expect(c.distM).toBeGreaterThanOrEqual(0);
      expect(c.sizeM.length).toBe(3);
    }
  });

  test("the player car projects near the centre of frame", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const p = await page.evaluate(() =>
      window.__apex.scene({ visible: true }).cars.find((c) => c.isPlayer));
    expect(p.inFrame).toBe(true);
    expect(p.screenPct[0]).toBeGreaterThan(20);
    expect(p.screenPct[0]).toBeLessThan(80);
    expect(p.screenPct[1]).toBeGreaterThan(20);
    expect(p.screenPct[1]).toBeLessThan(80);
    // chase cam sits right behind the car
    expect(p.distM).toBeLessThan(40);
  });

  test("screenPct is null for anything not in frame", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const cars = await page.evaluate(() => window.__apex.scene({ visible: true }).cars);
    const off = cars.filter((c) => !c.inFrame);
    expect(off.length).toBeGreaterThan(0);
    for (const c of off) expect(c.screenPct).toBeNull();
    // and cars are ordered by distance from the camera
    for (let i = 1; i < cars.length; i++) {
      expect(cars[i].distM).toBeGreaterThanOrEqual(cars[i - 1].distM);
    }
  });

  test("a corner behind the camera is kept, flagged, and bears past 90 deg", async ({ page }) => {
    await load(page, "monza", 0.05, 60);
    await renderFrames(page);
    const cs = await page.evaluate(() => window.__apex.scene({ visible: true }).corners);
    const behind = cs.find((c) => c.behindCamera);
    expect(behind).toBeTruthy();
    expect(behind.screenPct).toBeNull();
    expect(behind.inFrame).toBe(false);
    // behindCamera is look-direction (|bearing| > 90), not clip-space w.
    // Monza from frac 0.05 measures ~108° on the first behind corner.
    expect(Math.abs(behind.bearingDeg)).toBeGreaterThan(90);
  });

  test("headless is flagged, because the frame is then stale", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const v = await page.evaluate(() => {
      window.__apex.headless(true);
      const out = window.__apex.scene({ visible: true });
      window.__apex.headless(false);
      return out;
    });
    expect(v.framePending).toBe(true);
    expect(v.warning).toContain("stale");
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
