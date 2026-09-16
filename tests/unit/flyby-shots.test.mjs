/* FLYBY SHOT SEQUENCER — js/camera/flyby-seq.js
 *
 * The bug this file exists to stop coming back: the menu camera flew THROUGH a
 * building. The old rig clamped its lateral offset only on street circuits
 * (`corr` is Infinity elsewhere, js/camera/vantage.js) and had no idea what was
 * standing beside the track, so nobody could have caught it except by looking.
 *
 * Every circuit carries its scenery as world-space boxes, so "is the camera
 * inside a building" is answerable without a browser. These tests walk the
 * shipped sequence across real circuits and assert it stays outside them, plus
 * the framing invariants a shot list has to hold to read as one move.
 */
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

// The circuits worth paying for here: an open park circuit, a street circuit
// (where the buildings press right up to the barriers), and a desert night
// circuit whose grandstands are the tallest things in the game.
const CIRCUITS = ["monza", "monaco", "bahrain"];
const SAMPLES = 120;          // across the whole sequence — ~40 per shot

async function withTrack(id, fn) {
  const g = await createGame({ track: id });
  try {
    await g.race(id, "day", "dry");
    return await fn(g.G.track, g);
  } finally { g.close(); }
}

test("the shipped flyby never puts the eye inside a building", async () => {
  for (const id of CIRCUITS) {
    const bad = await withTrack(id, (track, g) => {
      const FlybySeq = g.sandbox.FlybySeq, Tracks = g.sandbox.Tracks;
      const hits = [];
      const shots = FlybySeq.DEFAULT;
      FlybySeq.reset();
      for (let i = 0; i <= SAMPLES; i++) {
        const u = i / SAMPLES;
        const v = FlybySeq.solve(track, u);
        const shot = shots[v.index];
        // A SHOT THAT RUNS DOWN THE ROAD IS EXEMPT FROM CONTAINMENT, and has to
        // earn it: props are stored as AXIS-ALIGNED boxes, so a long structure at
        // an angle (Bahrain's 143 m grandstand) gets a box that reaches across
        // the start straight, and the closing low shot was "inside" it. The
        // claim being made is that the camera is over the ROAD, so test THAT —
        // the track's own half-width — instead of exempting it silently.
        if (FlybySeq.onRoadPose(shot.eye[0]) && FlybySeq.onRoadPose(shot.eye[1])) {
          const pr = Tracks.project(track, v.eye[0], v.eye[2], null, v.eye[1]);
          if (!pr || Math.abs(pr.lat) > 12) {
            hits.push(`u=${u.toFixed(2)} shot=${v.id} claims to be on the road but sits ` +
              `${pr ? pr.lat.toFixed(1) : "?"} m off the centreline`);
          }
          continue;
        }
        // Everywhere else, a margin of 0: clearEye() already lifted with its own
        // margin, so any containment here means the lift found no way out.
        const hit = FlybySeq.insideProp(track, v.eye, 0);
        if (hit) hits.push(`u=${u.toFixed(2)} shot=${v.id} inside ${hit.kind} ` +
          `(${hit.w}x${hit.h}x${hit.d} at ${hit.x},${hit.y},${hit.z})`);
      }
      return hits;
    });
    assert.deepEqual(bad, [], `${id}: the flyby camera is inside solid scenery:\n  ` + bad.join("\n  "));
  }
});

test("clearance lifts a shot, it does not relocate one", async () => {
  for (const id of CIRCUITS) {
    const worst = await withTrack(id, (track, g) => {
      const FlybySeq = g.sandbox.FlybySeq;
      let max = 0, where = "";
      FlybySeq.reset();
      for (let i = 0; i <= SAMPLES; i++) {
        const v = FlybySeq.solve(track, i / SAMPLES);
        if (v.lift > max) { max = v.lift; where = v.id; }
      }
      return { max, where };
    });
    // The authored height is not the test — an establishing shot is 300 m up on
    // purpose. What must not happen is the clearance doing the authoring: a shot
    // placed INSIDE a grandstand still passes the containment test above,
    // because the lift rescued it, while framing something nobody chose.
    assert.ok(worst.max < 25,
      `${id}: clearance lifted shot "${worst.where}" by ${worst.max.toFixed(1)} m — ` +
      "that shot is authored inside scenery and is being rescued, not framed");
  }
});

test("each shot is continuous, and only a shot BOUNDARY is a cut", async () => {
  await withTrack("monza", (track, g) => {
    const FlybySeq = g.sandbox.FlybySeq;
    FlybySeq.reset();
    let prev = null, prevIdx = -1;
    const jumps = [];
    // Per shot, because a fixed metre budget is the wrong test once the sequence
    // has establishing shots: "wide" crosses a whole circuit radius while
    // "turn-first" moves 90 m, and both are correct. What is never correct is
    // one step inside a shot dwarfing that shot's own others — the signature of
    // an anchor resolving somewhere unrelated.
    const steps = {};
    for (let i = 0; i <= SAMPLES; i++) {
      const v = FlybySeq.solve(track, i / SAMPLES);
      const eye = [v.eye[0], v.eye[1], v.eye[2]];
      if (prev && v.index === prevIdx) {
        const d = Math.hypot(eye[0] - prev[0], eye[1] - prev[1], eye[2] - prev[2]);
        (steps[v.id] || (steps[v.id] = [])).push(d);
        assert.equal(v.cut, false, `no cut inside shot ${v.id}`);
      }
      prev = eye; prevIdx = v.index;
    }
    for (const id of Object.keys(steps)) {
      const d = steps[id];
      const avg = d.reduce((a, b) => a + b, 0) / d.length;
      const max = Math.max.apply(null, d);
      if (avg > 0 && max > avg * 4) jumps.push(`shot ${id}: one step ${max.toFixed(1)} m against a ${avg.toFixed(1)} m average`);
    }
    assert.deepEqual(jumps, [], "the eye teleports inside a shot:\n  " + jumps.join("\n  "));
    return null;
  });
});

test("the grid anchor matches the grid the race actually forms on", () => {
  // gridSlot() in js/track/core/mesh.js is the ONE definition of where the grid
  // is; flyby-seq.js restates its numbers so the sequencer can resolve anchors
  // without loading the mesh builder. Restated numbers drift, so pin them.
  const mesh = fs.readFileSync(path.join(ROOT, "js/track/core/mesh.js"), "utf8");
  const seq = fs.readFileSync(path.join(ROOT, "js/camera/flyby-seq.js"), "utf8");
  const slot = /function gridSlot\(track, i\) \{\s*let s = track\.total - (\d+) - i \* (\d+);/.exec(mesh);
  assert.ok(slot, "gridSlot still lays the grid out as `total - <back> - i * <spacing>`");
  const back = +slot[1], spacing = +slot[2];
  const seqBack = /POLE_BACK = (\d+)/.exec(seq), seqSpace = /GRID_SPACING = (\d+)/.exec(seq);
  assert.ok(seqBack && seqSpace, "flyby-seq.js names POLE_BACK and GRID_SPACING");
  assert.equal(+seqBack[1], back, "POLE_BACK matches gridSlot's offset from the line");
  assert.equal(+seqSpace[1], spacing, "GRID_SPACING matches gridSlot's row spacing");
});

test("sparse scenery hulls are not treated as solid", async () => {
  // The props registry rolls loose primitives into `structure` records whose
  // `fill` says how much of the hull is actually matter. A 56 x 1.3 m hull at
  // 5 % fill is a run of kerbing; counting it solid would lift every shot into
  // the sky and the flyby would show nothing but rooftops.
  await withTrack("monza", (track, g) => {
    const FlybySeq = g.sandbox.FlybySeq;
    assert.equal(FlybySeq.isSolid({ kind: "structure", fill: 0.05, h: 1.3 }), false);
    assert.equal(FlybySeq.isSolid({ kind: "structure", fill: 0.6, h: 12 }), true);
    assert.equal(FlybySeq.isSolid({ kind: "building", h: 14 }), true);
    assert.equal(FlybySeq.isSolid({ kind: "bush", h: 1.2 }), false);
    const solid = FlybySeq.blockers(track);
    assert.ok(solid.length > 0, "monza has some solid scenery to avoid");
    assert.ok(solid.length < track.props.list.length,
      "not every prop counts as solid, or the lift has nothing to aim for");
    return null;
  });
});

test("seating the menu grid costs the sim stream nothing", () => {
  // menuGridCars() puts the field on the grid for the flyby's closing shot, and
  // it calls makeCars(), which spends one simRnd() per car. The seeded stream's
  // DRAW COUNT is a contract the whole race reproduces from — gridUp and
  // armReliability both go out of their way to keep it — so a menu flourish that
  // quietly advanced it would change every race that followed a flyby, with
  // nothing to show which change did it. Source-level, because the function is
  // module-scope inside the game.js IIFE and has no seam to call.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const i = game.indexOf("function menuGridCars()");
  assert.ok(i > 0, "menuGridCars still exists — the flyby's last shot needs a field");
  const body = game.slice(i, game.indexOf("\nfunction ", i + 10));
  assert.match(body, /const rng = _simRngState;/, "it snapshots the RNG state");
  assert.match(body, /_simRngState = rng;/, "…and restores it");
  assert.ok(body.indexOf("const rng = _simRngState;") < body.indexOf("makeCars()"),
    "the snapshot is taken BEFORE makeCars spends its draws");
  assert.ok(body.lastIndexOf("_simRngState = rng;") > body.indexOf("makeCars()"),
    "and the restore comes after");
  assert.doesNotMatch(body, /gridUp\(/,
    "it seats cars on TrackMesh slots directly: gridUp draws a simRnd() per car for grid jitter");
});
