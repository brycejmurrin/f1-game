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

// ── frame() ─────────────────────────────────────────────────────────────────
// The screenshot replacement. Validated against a real render at the same pose:
// road filling the lower half, pines flanking, structures right — see
// docs/AGENT-WORLD-API.md for what that comparison caught.

test.describe("frame()", () => {
  test.use({ viewport: LANDSCAPE });

  test("rasterises the view into a labelled grid", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const f = await page.evaluate(() => window.__apex.frame({ cols: 48, rows: 16 }));
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
    const f = await page.evaluate(() => window.__apex.frame({ cols: 48, rows: 16 }));
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
    const f = await page.evaluate(() => window.__apex.frame({ cols: 48, rows: 16 }));
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
    const f = await page.evaluate(() => window.__apex.frame({ cols: 32, rows: 16 }));
    expect(typeof f.grid.horizonRow).toBe("number");
    const below = f.grid.lines.slice(f.grid.horizonRow + 1).join("");
    expect(below.includes(".")).toBe(false);      // no sky under the horizon
  });

  test("objects are ranked by how much of the frame they hold", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const objs = await page.evaluate(() => window.__apex.frame().objects);
    expect(objs.length).toBeGreaterThan(0);
    for (let i = 1; i < objs.length; i++) {
      expect(objs[i].cells).toBeLessThanOrEqual(objs[i - 1].cells);
    }
  });

  test("never returns null — a render or an actionable error", async ({ page }) => {
    await boot(page);
    const f = await page.evaluate(() => window.__apex.frame());
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
      const out = window.__apex.frame({ cols: 24, rows: 8 });
      window.__apex.headless(false);
      return out;
    });
    expect(f.framePending).toBe(true);
    expect(f.warning).toContain("stale");
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
    expect(c.parts.chosen.length).toBe(8);
    const cats = c.parts.chosen.map((p) => p.category);
    expect(cats).toContain("engine");
    expect(cats).toContain("aero");
    expect(c.parts.budget).toBe(600);
    expect(c.parts.spent + c.parts.remaining).toBe(600);
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

  test("an unknown team errors instead of silently answering for another", async ({ page }) => {
    await load(page);
    const c = await page.evaluate(() => window.__apex.carView({ team: "nosuchteam" }));
    expect(c.ok).toBe(false);
    expect(c.error).toBe("NoTeamError");
    expect(c.fix).toContain("teams()");
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
    const w = await page.evaluate(() => window.__apex.worldModel({ detail: "summary" }));
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
    const w = await page.evaluate(() => window.__apex.worldModel());
    const lap = w.track.lengthM;
    for (const f of w.features) {
      expect(f.runLengthM).toBeLessThan(lap * 0.2);
      expect(f.count).toBeGreaterThanOrEqual(3);
      expect(["left", "right", "across", "off-course"]).toContain(f.side);
    }
  });

  test("landmarks are structures, not repeated dressing", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.worldModel());
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

  test("linear furniture is spans, not thousands of segments", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.worldModel());
    expect(w.spans.length).toBeLessThan(60);
    for (const s of w.spans) {
      expect(["guardrail", "fence", "tyreWall", "wall"]).toContain(s.kind);
      expect(["left", "right"]).toContain(s.side);
      expect(s.lengthM).toBeGreaterThan(0);
    }
  });

  test("sections walk the lap corner by corner", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.worldModel({ detail: "sections" }));
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
      const a = window.__apex.worldModel({ detail: "full", limit: 50 });
      const b = window.__apex.worldModel({ detail: "full", offset: 50, limit: 50 });
      return { aN: a.objects.length, aPage: a.objectPage,
               bFirst: b.objects[0], aFifty: a.objects[49] };
    });
    expect(r.aN).toBe(50);
    expect(r.aPage.more).toBe(true);
    expect(r.aPage.total).toBeGreaterThan(50);
    // page 2 must start where page 1 ended, not repeat it
    expect(JSON.stringify(r.bFirst)).not.toBe(JSON.stringify(r.aFifty));
  });

  test("sign boards keep their meaning", async ({ page }) => {
    await load(page, "suzuka");
    const boards = await page.evaluate(() =>
      window.__apex.worldModel({ detail: "full", limit: 5000 })
        .objects.filter((o) => o.board));
    expect(boards.length).toBeGreaterThan(0);
    // a corner board names its turn; a braking board names its distance
    expect(boards.some((b) => b.board === "corner" && typeof b.value === "number")).toBe(true);
  });

  test("rejects an unknown detail level", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.worldModel({ detail: "everything" }));
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
    await load(page, "monza", 0.0, 55);
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
    // EVERY agent hook must appear, or discovery silently hides it — frame()
    // and carView() were missing from this manifest for a whole revision, which
    // made the screenshot and car-viewer replacements undiscoverable.
    const listed = Object.keys(h.perceive)
      .concat(Object.keys(h.know), Object.keys(h.act)).join(" ");
    for (const k of ["world(", "frame(", "scene(", "visible(", "trackInfo(",
                     "worldModel(", "carView(", "rollout(", "terminal("]) {
      expect(listed, k + " missing from agentHelp()").toContain(k);
    }
    expect(h.loop).toContain("world()");
    expect(h.cli).toContain("agent.mjs");
    expect(h.notes.join(" ")).toContain("null");
    expect(Object.keys(h.whenToUse).length).toBeGreaterThan(2);
    // it is a manifest, not documentation — keep it cheap
    expect(JSON.stringify(h).length).toBeLessThan(4000);
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
    const v = await page.evaluate(() => window.__apex.visible({ limit: 4 }));
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
      window.__apex.visible().cars.find((c) => c.isPlayer));
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
    const cars = await page.evaluate(() => window.__apex.visible().cars);
    const off = cars.filter((c) => !c.inFrame);
    expect(off.length).toBeGreaterThan(0);
    for (const c of off) expect(c.screenPct).toBeNull();
    // and cars are ordered by distance from the camera
    for (let i = 1; i < cars.length; i++) {
      expect(cars[i].distM).toBeGreaterThanOrEqual(cars[i - 1].distM);
    }
  });

  test("a corner behind the camera is kept, flagged, and bears ~180 deg", async ({ page }) => {
    await load(page, "monza", 0.05, 60);
    await renderFrames(page);
    const cs = await page.evaluate(() => window.__apex.visible().corners);
    const behind = cs.find((c) => c.behindCamera);
    expect(behind).toBeTruthy();
    expect(behind.screenPct).toBeNull();
    expect(behind.inFrame).toBe(false);
    expect(Math.abs(behind.bearingDeg)).toBeGreaterThan(120);
  });

  test("headless is flagged, because the frame is then stale", async ({ page }) => {
    await load(page);
    await renderFrames(page);
    const v = await page.evaluate(() => {
      window.__apex.headless(true);
      const out = window.__apex.visible();
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
