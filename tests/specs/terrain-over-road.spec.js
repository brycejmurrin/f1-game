// @ts-check
// Regression audit: no terrain or road-mesh triangle should render ABOVE the
// racing surface. This catches the "green wedge / elevation-mound over the road"
// class of bug (e.g. Miami T6, where the s≈0.42 Hard Rock rise bulged terrain
// over a flat part of the track that passes near it). Method: capture each
// circuit's meshes, then point-in-triangle test every face against asphalt
// sample points across the whole lap — purely geometric, no rendering.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { auditTracks } from "../helpers/track-helpers.js";
import { createRequire } from "node:module";

const { scanOverRoad, roadFails } = createRequire(import.meta.url)("../../tools/lib/over-road-scan.cjs");

// Every circuit (derived from tools/manifest.cjs), or TRACK=<id> for one.
const TRACKS = auditTracks();
const CROSSOVER_TRACKS = new Set(["madrid", "suzuka", "zandvoort"]);

// A face poking this far above the asphalt counts as a defect. Small tolerance
// absorbs banking/elevation interpolation noise and z-fight-scale slivers.
const TOL = 0.18;

test("Hungaroring terrain stays below the racing surface through the T2 basin", async ({ page }) => {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("hungaroring", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  // Sample only once the terrain mesh exists: a null gap before that is "not built
  // yet". (terrainY at lat 0
  // is legitimately null under a carved road, so it cannot be the readiness signal.)
  await page.waitForFunction(() => !!window.__apex.trackGeometry(), null, { polling: 100, timeout: BOOT_MS });

  // |lat| under ~8 m is the carved road: terrainY is null there by construction
  // and accepting that null let this test pass with no terrain at all. These
  // laterals sit just outside the carve (hw is 7 m) where the basin mesh exists.
  // Measured in the track-build VM: each is a number and below the asphalt.
  const gaps = await page.evaluate(() =>
    [-14, -10, 10, 14].map((lat) => window.__apex.groundY(0.163, lat).gap)
  );

  for (const gap of gaps) {
    expect(typeof gap).toBe("number");
    expect(gap).toBeLessThanOrEqual(TOL);
  }
});

test("Red Bull Ring terrain stays below both nearby road sections", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("redbull", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  // Sample only once the terrain mesh exists: a null gap before that is "not built
  // yet". (terrainY at lat 0
  // is legitimately null under a carved road, so it cannot be the readiness signal.)
  await page.waitForFunction(() => !!window.__apex.trackGeometry(), null, { polling: 100, timeout: BOOT_MS });

  // Same carve as Hungaroring: ±6 m is null under the road. ±10/±14 are on the
  // mesh (track-build VM) and must be numbers at or under the asphalt.
  const probes = await page.evaluate(() =>
    [0.98, 0.335].flatMap((frac) =>
      [-14, -10, 10, 14].map((lat) => ({ frac, lat, gap: window.__apex.groundY(frac, lat).gap }))
    )
  );
  for (const probe of probes) {
    expect(typeof probe.gap, `terrain at ${(probe.frac * 100).toFixed(1)}% lat ${probe.lat}m`).toBe("number");
    expect(probe.gap, `terrain at ${(probe.frac * 100).toFixed(1)}% lat ${probe.lat}m: ${probe.gap}`).toBeLessThanOrEqual(TOL);
  }
});

test("Mexico migration keeps Foro Sol grounded, bounded, and intentionally overhead", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("mexico", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track === "mexico", null, { polling: 100, timeout: BOOT_MS });
  // Sample only once the terrain mesh exists: a null gap before that is "not built
  // yet". (terrainY at lat 0
  // is legitimately null under a carved road, so it cannot be the readiness signal.)
  await page.waitForFunction(() => !!window.__apex.trackGeometry(), null, { polling: 100, timeout: BOOT_MS });

  const audit = await page.evaluate(() => {
    const profile = window.__apex.trackProfile(240);
    const models = window.__apex.modelDiagnostics();
    const geometry = window.__apex.geometryDiagnostics();
    const def = window.TrackDefs.find((track) => track.id === "mexico");
    // overRoad, not gap: 0.735 sits inside the 5-degree T11-T12 bankZone, where
    // the tarmac is the banked plane and `gap` (terrain vs the raw centreline)
    // is the trap js/agent/apex.js groundY() documents — terrain correctly under
    // the raised outer edge reads as proud of it. Since the run-off shelf
    // (b3acbb088, 2026-09-24) the probe at lat 18 m reads gap 0.429 but
    // overRoad -0.192: below the road surface, which is what this asserts.
    // Off a bankZone the two are identical.
    // ±18 m is outside the carve at every one of these fracs (track-build VM).
    // The old ±10/0 ladder included nulls, and `null || gap <= TOL` passed them.
    const grounds = [0.735, 0.78, 0.84, 0.855].flatMap((frac) =>
      [-18, 18].map((lat) => ({ frac, lat, gap: window.__apex.groundY(frac, lat).overRoad }))
    );
    return {
      elevationRange: Math.max(...profile.map((point) => point.y)) -
        Math.min(...profile.map((point) => point.y)),
      maxSlope: Math.max(...profile.map((point) => Math.abs(point.slope))),
      models,
      geometry,
      walls: window.__apex.wallStats(),
      grounds,
      sceneryCoordinates: def?.sceneryCoordinates,
      terrainOuter: def?.terrainOuter,
      dressingExclusions: def?.dressingExclusions,
    };
  });

  expect(audit.sceneryCoordinates).toBe("racing");
  expect(audit.terrainOuter).toBe(120);
  expect(audit.dressingExclusions).toEqual(expect.arrayContaining([
    // 0.02-0.30: the Magdalena Mixiuhca park band (T1 -> Esses), where the
    // generic city pass stood 20-50 m towers 25-30 m off both edges.
    expect.objectContaining({ kind: "city", s0: 0.02, s1: 0.30 }),
    // 0.48 not 0.60: the same park's sports-facility side.
    expect.objectContaining({ kind: "city", s0: 0.48, s1: 0.94 }),
    expect.objectContaining({ kinds: ["foliage", "lighting"], s0: 0.70, s1: 0.89 }),
  ]));
  // mexico.js authors a deliberate gentle profile. The old "essentially flat"
  // <= 1.0 pin predated that authoring and sat red, unrun, until 2026-08. Pin
  // the authored contract from both sides instead: the profile must exist AND
  // must not grow back into the invented 12 m hill the comment retired.
  //
  // BOTH NUMBERS BELOW ARE MEASURED. `f9bbf479` repaired this test by lifting
  // "~7 m end to end, under 2 % anywhere" out of mexico.js's prose comment and
  // pinning it — replacing one unverified number with another, and landing
  // without a run. The range half happened to be right (6.642 m). The slope
  // half was not: the authored elevations peak at 2.83 %, on the flank of the
  // s = 0.245 rise (3.0 m over halfM 380), with 6 of 240 profile samples over
  // 2 %. That is neither a regression nor a product defect — it reads 0.0283
  // identically at HEAD, at `fdd4082f` and at `89ce4f2f~1`; the range is what
  // the author intended; and 2.83 % is gentle by any standard (Eau Rouge is
  // ~18 %). The claim in mexico.js was simply never computed, and is corrected
  // there too.
  //
  // 3.5 % is the measured 2.83 % plus headroom for spline resampling — still
  // tight enough that regrowing the retired hill trips it.
  expect(audit.elevationRange, "Mexico keeps its authored gentle profile (~7 m)").toBeGreaterThan(4.0);
  expect(audit.elevationRange, "and does not regrow the invented 12 m hill").toBeLessThanOrEqual(8.0);
  expect(audit.maxSlope, "stays a gentle grade (measured 2.83 % max)").toBeLessThan(0.035);
  expect(audit.models.suppressed).toEqual([]);
  expect(audit.models.invalid).toEqual([]);
  expect(audit.models.unsafe).toEqual([]);
  expect(audit.models.emitted.filter((model) => model.required).map((model) => model.id))
    .toEqual(expect.arrayContaining([
      "mexico-palacio-deportes", "foro-scoreboard",
    ]));
  const overhead = audit.models.emitted.filter((model) => model.overhead);
  expect(overhead.length, "the legitimate start gantry remains").toBeGreaterThan(0);
  expect(overhead.every((model) => model.clearance >= 4.8)).toBe(true);
  expect(audit.geometry.every((entry) => entry.ok), JSON.stringify(audit.geometry)).toBe(true);
  expect(audit.walls.anyNaN).toBe(false);
  expect(audit.walls.minOverHw).toBeGreaterThan(0);
  expect(audit.walls.tightFrac, "Foro Sol concrete walls register collision").toBeGreaterThan(0.3);
  for (const probe of audit.grounds) {
    expect(typeof probe.gap, `Mexico terrain at ${(probe.frac * 100).toFixed(1)}% lat ${probe.lat}m`).toBe("number");
    expect(probe.gap, `Mexico terrain at ${(probe.frac * 100).toFixed(1)}% lat ${probe.lat}m: ${probe.gap}`).toBeLessThanOrEqual(TOL);
  }
});

// RC2-21: tests/unit/terrain-falloff.test.mjs now carries a node twin of this Madrid check.
// The browser copy stays until select-budget.test.mjs (not in this lane's globs) drops its 4 + roster pin to 3.
test("Madrid terrain drops away from the road instead of forming a raised floor", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  const terrain = await page.evaluate(async () => {
    // LAZY_CIRCUIT meta stub has no path — hydrate before buildCenterline.
    const idx = Tracks.LIST.findIndex((entry) => entry.id === "madrid");
    const ensure = window.__apex && window.__apex.ensureCircuit;
    if (!ensure) throw new Error("ensureCircuit not on __apex");
    await ensure(idx);
    const def = Tracks.LIST[idx];
    const track = Tracks.buildCenterline(def);
    const surface = TrackSurface.profile(def, track);
    const k = Math.round(0.75 * track.n) % track.n;
    const drop = (lat) => track.py[k] - surface.heightAt(k, lat);
    return { flatTerrain: def.flatTerrain, drop8: drop(8), drop12: drop(12), drop20: drop(20), drop30: drop(30), drop40: drop(40) };
  });

  // THE RUN-OFF SHELF MOVED WHERE THE FALL-OFF STARTS, not whether it happens.
  // b3acbb088 (2026-09-24) made the ground meet the verge just under its edge,
  // hold flat to 12 m, and smoothstep back into the old fall-off by 30 m, so a
  // car off the tarmac is not left hanging over the gravel. That put the old
  // 20 m probe mid-blend: 2.828 -> 1.267 m (nightly 36702685304 went red on
  // `> 2`). Measured before/after in the track-build VM: 30 m 4.856 = 4.856 and
  // 40 m 6.692 = 6.692, unchanged. So the contract is pinned where it holds:
  // never a raised floor anywhere (every drop positive), a near-flat shelf, and
  // the full fall-off back by 30 m.
  expect(terrain.flatTerrain).toBe(false);
  for (const k of ["drop8", "drop12", "drop20", "drop30", "drop40"]) {
    expect(terrain[k], `${k}: terrain below the road, not a raised floor`).toBeGreaterThan(0);
  }
  expect(terrain.drop12, "the run-off shelf stays near-flat").toBeLessThan(0.5);
  expect(terrain.drop30, "the old fall-off is back by 30 m (measured 4.856)").toBeGreaterThan(4);
  expect(terrain.drop40).toBeGreaterThan(5);
});

for (const trk of TRACKS) {
  test(`${trk}: no terrain/road faces over the racing line`, async ({ page }) => {
    test.setTimeout(180_000);
    // The CSP forbids eval, so the shared scan is injected as a script (CDP, not subject to it).
    await page.addInitScript(`window.__overRoadScan = ${scanOverRoad.toString()};`);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });

    const offenders = [];
    await page.evaluate((t) => __apex.race(t, "day", "dry"), trk);
    // ONE readiness wait (was two back-to-back BOOT_MS budgets inside a 180 s test): the
    // meshes exist only once the track is loaded, so the second implies the first.
    await page.waitForFunction(() => window.__apex.info().track != null && !!window.__apex.trackGeometry(), null, { polling: 100, timeout: BOOT_MS });
    const r = await page.evaluate((knownCrossover) => {
      const caps = window.__apex.trackGeometry();
      if (!caps) return { err: "no meshes" };
      const trackNodeCount = window.__apex.info().n;
      const M = 1200;
      const px = new Float64Array(M), pz = new Float64Array(M), py = new Float64Array(M), rx = new Float64Array(M), rz = new Float64Array(M), hw = new Float64Array(M);
      for (let i = 0; i < M; i++) { const n = __apex.nodeAt(i / M); px[i] = n.x; pz[i] = n.z; py[i] = n.y; rx[i] = n.rx; rz[i] = n.rz; }
      const near = (x, z) => { let bd = 1e9, bk = 0; for (let k = 0; k < M; k++) { const dx = x - px[k], dz = z - pz[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; bk = k; } } return bk; };
      const sized = ["road", "terrain"].map((i) => ({ i, len: caps[i]?.pos?.length / 3 || 0 })).filter((c) => c.len > 1000);
      if (!sized.length) return { err: "no meshes" };
      for (const c of sized) { const p = caps[c.i].pos; let mx = 0; const st = 3 * Math.max(1, Math.floor(p.length / 3 / 2500)); for (let v = 0; v < p.length; v += st) { const k = near(p[v], p[v + 2]); const lat = Math.abs((p[v] - px[k]) * rx[k] + (p[v + 2] - pz[k]) * rz[k]); if (lat < 25) mx = Math.max(mx, lat); } c.maxLat = mx; }
      const road = sized.find((c) => c.i === "road");
      if (!road) return { err: "no road mesh" };
      const rp = caps.road.pos; for (let v = 0; v < rp.length; v += 3) { const k = near(rp[v], rp[v + 2]); const lat = Math.abs((rp[v] - px[k]) * rx[k] + (rp[v + 2] - pz[k]) * rz[k]); if (lat < 13 && lat > hw[k]) hw[k] = lat; } for (let k = 0; k < M; k++) if (hw[k] < 3) hw[k] = 6;
      const def = Tracks.LIST.find((entry) => entry.id === __apex.info().track);
      const bankTrack = Tracks.buildCenterline(def);
      const tps = [];
      const LADDER = [-0.6, -0.3, 0, 0.3, 0.6];
      for (let i = 0; i < M; i++) {
        for (let si = 0; si < LADDER.length; si++) {
          const lat = LADDER[si] * hw[i];
          const bank = Tracks.banking(bankTrack, i / M * bankTrack.total, lat);
          tps.push({
            x: px[i] + rx[i] * lat,
            z: pz[i] + rz[i] * lat,
            y: py[i] + (bank?.dy || 0),
            frac: i / M,
            i, si,                     // for the neighbor guard in scan()
          });
        }
      }
      // The scan itself is tools/lib/over-road-scan.cjs (injected below); unit-tested in node.
      const scan = (name) => window.__overRoadScan(caps[name],
        { name, tps, px, pz, M, ladder: LADDER.length, trackNodeCount, knownCrossover });
      // NEGATIVE CONTROL: a face 1 m over the line at lap node M/3 must be reported by the very
      // same in-page scan (same tps, same injected function). If the page wiring broke (wrong
      // road set, wrong units, scan not injected) every circuit would otherwise pass vacuously.
      const mid = Math.floor(M / 3) * LADDER.length + 2, tp0 = tps[mid];
      const planted = { pos: [tp0.x - 2, tp0.y + 1, tp0.z - 2, tp0.x + 2, tp0.y + 1, tp0.z - 2, tp0.x, tp0.y + 1, tp0.z + 3], idx: [0, 1, 2] };
      const control = window.__overRoadScan(planted, { name: "terrain", tps, px, pz, M, ladder: LADDER.length, trackNodeCount, knownCrossover: false });
      return { road: scan("road"), terr: scan("terrain"), control: control.max };
    }, CROSSOVER_TRACKS.has(trk));
    console.log(`over-road ${trk}: road=${r.road?.max ?? "?"} terr=${r.terr?.max ?? "?"}${r.err ? " ERR:" + r.err : ""}`);
    if (r.err) offenders.push(`${trk}: ${r.err}`);
    else {
      expect(r.control, `${trk}: the scan must see a planted face 1 m over the line (wiring check)`).toBeGreaterThan(0.9);
      if (r.terr.max > TOL) offenders.push(
        `${trk} TERRAIN ${r.terr.max}m over road @${JSON.stringify(r.terr.fr)} worst=${JSON.stringify(r.terr.worst)}`
      );
      if (roadFails(r.road.max, TOL)) offenders.push(
        `${trk} ROAD ${r.road.max}m over road @${JSON.stringify(r.road.fr)} worst=${JSON.stringify(r.road.worst)}`
      );
    }
    expect(offenders, `circuits with geometry over the racing line:\n${offenders.join("\n")}`).toEqual([]);
  });
}
