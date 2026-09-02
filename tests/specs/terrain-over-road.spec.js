// @ts-check
// Regression audit: no terrain or road-mesh triangle should render ABOVE the
// racing surface. This catches the "green wedge / elevation-mound over the road"
// class of bug (e.g. Miami T6, where the s≈0.42 Hard Rock rise bulged terrain
// over a flat part of the track that passes near it). Method: capture each
// circuit's meshes, then point-in-triangle test every face against asphalt
// sample points across the whole lap — purely geometric, no rendering.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";
import { auditTracks } from "../helpers/track-helpers.js";

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
  await page.waitForTimeout(1500);

  const gaps = await page.evaluate(() =>
    [-6, -3, 0, 3, 6].map((lat) => window.__apex.groundY(0.163, lat).gap)
  );

  for (const gap of gaps) {
    // No covering terrain is also safe; any terrain that does cover the sample
    // must remain below the asphalt within interpolation tolerance.
    expect(gap === null || gap <= TOL).toBe(true);
  }
});

test("Red Bull Ring terrain stays below both nearby road sections", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("redbull", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.waitForTimeout(1200);

  const probes = await page.evaluate(() =>
    [0.98, 0.335].flatMap((frac) =>
      [-6, -3, 0, 3, 6].map((lat) => ({ frac, lat, gap: window.__apex.groundY(frac, lat).gap }))
    )
  );
  for (const probe of probes) {
    expect(probe.gap === null || probe.gap <= TOL,
      `terrain at ${(probe.frac * 100).toFixed(1)}% lat ${probe.lat}m: ${probe.gap}`).toBe(true);
  }
});

test("Mexico migration keeps Foro Sol grounded, bounded, and intentionally overhead", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("mexico", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track === "mexico", null, { polling: 100, timeout: BOOT_MS });
  await page.waitForTimeout(1200);

  const audit = await page.evaluate(() => {
    const profile = window.__apex.trackProfile(240);
    const models = window.__apex.modelDiagnostics();
    const geometry = window.__apex.geometryDiagnostics();
    const def = window.TrackDefs.find((track) => track.id === "mexico");
    const grounds = [0.735, 0.78, 0.84, 0.855].flatMap((frac) =>
      [-18, -10, 0, 10, 18].map((lat) => ({ frac, lat, gap: window.__apex.groundY(frac, lat).gap }))
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
    expect.objectContaining({ kind: "city", s0: 0.02, s1: 0.14 }),
    expect.objectContaining({ kind: "city", s0: 0.60, s1: 0.94 }),
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
    expect(probe.gap === null || probe.gap <= TOL,
      `Mexico terrain at ${(probe.frac * 100).toFixed(1)}% lat ${probe.lat}m: ${probe.gap}`).toBe(true);
  }
});

test("Madrid terrain drops away from the road instead of forming a raised floor", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  const terrain = await page.evaluate(() => {
    const def = Tracks.LIST.find((entry) => entry.id === "madrid");
    const track = Tracks.buildCenterline(def);
    const surface = TrackSurface.profile(def, track);
    const k = Math.round(0.75 * track.n) % track.n;
    return {
      flatTerrain: def.flatTerrain,
      drop20: track.py[k] - surface.heightAt(k, 20),
      drop40: track.py[k] - surface.heightAt(k, 40),
    };
  });

  expect(terrain.flatTerrain).toBe(false);
  expect(terrain.drop20).toBeGreaterThan(2);
  expect(terrain.drop40).toBeGreaterThan(5);
});

test("no terrain/road faces over the racing line (all circuits)", async ({ page }) => {
  test.setTimeout(1500000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });

  const offenders = [];
  for (const trk of TRACKS) {
    await page.evaluate((t) => __apex.race(t, "day", "dry"), trk);
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.waitForTimeout(1500);
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
      const pit = (X, Z, ax, az, bx, bz, cx, cz) => { const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = X - ax, v2z = Z - az; const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z; const dn = d00 * d11 - d01 * d01; if (Math.abs(dn) < 1e-9) return null; const u = (d11 * d20 - d01 * d21) / dn, vv = (d00 * d21 - d01 * d20) / dn; return (u >= -0.02 && vv >= -0.02 && u + vv <= 1.02) ? { u, vv } : null; };
      const scan = (name) => {
        const cap = caps[name];
        if (!cap.pos || !cap.idx) return { max: 0, fr: [], worst: null };
        const pos = cap.pos, idx = cap.idx, byF = {};
        let mx = 0, worst = null;
        for (let t = 0; t < idx.length; t += 3) {
          const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
          const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
          const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
          const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
          if (Math.max(ay, by, cy) < -0.5) continue;
          const centerX = (ax + bx + cx) / 3;
          const centerZ = (az + bz + cz) / 3;
          const sourceFrac = near(centerX, centerZ) / M;
          const firstVertex = Math.min(idx[t], idx[t + 1], idx[t + 2]);
          const meshSourceFrac = name === "road" && firstVertex < trackNodeCount * 14
            ? Math.floor(firstVertex / 14) / trackNodeCount
            : sourceFrac;
          const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx);
          const mnz = Math.min(az, bz, cz), mxz = Math.max(az, bz, cz);
          for (const tp of tps) {
            if (tp.x < mnx - 0.5 || tp.x > mxx + 0.5 ||
                tp.z < mnz - 0.5 || tp.z > mxz + 0.5) continue;
            const bc = pit(tp.x, tp.z, ax, az, bx, bz, cx, cz);
            if (!bc) continue;
            const yf = ay + bc.u * (cy - ay) + bc.vv * (by - ay);
            const ov0 = yf - tp.y;
            if (ov0 > 0.1) {
              // A TRIANGLE IS OVER THE LINE, NOT OVER ONE ALIASED POINT. On a
              // climbing tight corner the inside edge arc-compresses: at
              // nurburgring's Schumacher-S, 9.7 m of arc is 1.74 m of XZ on the
              // inside while the road climbs 0.358 m (measured, 2026-08-07).
              // So a sample generated ~10 m EARLIER on the climb lands inside a
              // triangle's XZ footprint, and the triangle's surface sits ~0.36 m
              // above that sample's modelled height — a smooth helix read as a
              // step. That exact shape produced this test's only road offender
              // ("nurburgring ROAD 0.37m over"), on the test's FIRST completed
              // run. The guard: the overshoot must hold against the local RUN
              // of the reference line (same ladder rung, i±3 = ±12 m), not one
              // sample. A genuinely floating slab is over all of them; an
              // arc-aliased neighbor is cleared by the sample at its own frac.
              let ov = ov0;
              for (let d = -3; d <= 3 && ov > 0.1; d++) {
                if (!d) continue;
                const nb = tps[((tp.i + d + M) % M) * LADDER.length + tp.si];
                if (nb) ov = Math.min(ov, yf - nb.y);
              }
              if (ov <= 0.1) continue;
              const fracDistance = Math.abs(meshSourceFrac - tp.frac);
              if (knownCrossover && name === "road" &&
                  Math.min(fracDistance, 1 - fracDistance) > 0.08) continue;
              const f = Math.round(tp.frac * 200) / 2;
              byF[f] = Math.max(byF[f] || 0, ov);
              if (ov > mx) {
                mx = ov;
                worst = {
                  f, ov: +ov.toFixed(2),
                  sourceFrac: +sourceFrac.toFixed(4),
                  meshSourceFrac: +meshSourceFrac.toFixed(4),
                  center: [
                    +centerX.toFixed(2),
                    +((ay + by + cy) / 3).toFixed(2),
                    +centerZ.toFixed(2),
                  ],
                  sample: [+tp.x.toFixed(2), +tp.y.toFixed(2), +tp.z.toFixed(2)],
                  vertices: [
                    [+ax.toFixed(2), +ay.toFixed(2), +az.toFixed(2)],
                    [+bx.toFixed(2), +by.toFixed(2), +bz.toFixed(2)],
                    [+cx.toFixed(2), +cy.toFixed(2), +cz.toFixed(2)],
                  ],
                };
              }
            }
          }
        }
        return {
          max: +mx.toFixed(2),
          fr: Object.entries(byF).map(([f, o]) => ({ f: +f, o: +o.toFixed(2) }))
            .sort((a, b) => b.o - a.o).slice(0, 5),
          worst,
        };
      };
      return { road: scan("road"), terr: scan("terrain") };
    }, CROSSOVER_TRACKS.has(trk));
    console.log(`over-road ${trk}: road=${r.road?.max ?? "?"} terr=${r.terr?.max ?? "?"}${r.err ? " ERR:" + r.err : ""}`);
    if (r.err) { offenders.push(`${trk}: ${r.err}`); continue; }
    // Terrain over the racing line is always a bug (the green-wedge / mound class).
    if (r.terr.max > TOL) offenders.push(
      `${trk} TERRAIN ${r.terr.max}m over road @${JSON.stringify(r.terr.fr)} worst=${JSON.stringify(r.terr.worst)}`
    );
    // Road mesh: small overs are the verge-shoulder chord bug everywhere.
    // Overs >=1.5 m are exempt ONLY on the known crossover tracks (Suzuka
    // figure-8, Madrid, Zandvoort — the same CROSSOVER_TRACKS set the in-page
    // frac-distance filter uses), where the road legitimately bridges over a
    // lower section; on any other track a big face over the line is simply a
    // bigger defect, not a crossover.
    if (r.road.max > TOL && (r.road.max < 1.5 || !CROSSOVER_TRACKS.has(trk))) offenders.push(
      `${trk} ROAD ${r.road.max}m over road @${JSON.stringify(r.road.fr)} worst=${JSON.stringify(r.road.worst)}`
    );
  }
  expect(offenders, `circuits with geometry over the racing line:\n${offenders.join("\n")}`).toEqual([]);
});
