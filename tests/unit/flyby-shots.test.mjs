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
      const FlybySeq = g.sandbox.FlybySeq;
      const hits = [];
      FlybySeq.reset();
      for (let i = 0; i <= SAMPLES; i++) {
        const u = i / SAMPLES;
        const v = FlybySeq.solve(track, u);
        // A margin of 0: clearEye() already lifted with its own margin, so any
        // containment at all here means the lift failed to find a way out.
        const hit = FlybySeq.insideProp(track, v.eye, 0);
        if (hit) hits.push(`u=${u.toFixed(2)} shot=${v.id} inside ${hit.kind} ` +
          `(${hit.w}x${hit.h}x${hit.d} at ${hit.x},${hit.y},${hit.z})`);
      }
      return hits;
    });
    assert.deepEqual(bad, [], `${id}: the flyby camera is inside solid scenery:\n  ` + bad.join("\n  "));
  }
});

test("the shipped flyby stays above the road and below the sky", async () => {
  for (const id of CIRCUITS) {
    const out = await withTrack(id, (track, g) => {
      const FlybySeq = g.sandbox.FlybySeq;
      let minY = Infinity, maxY = -Infinity;
      FlybySeq.reset();
      for (let i = 0; i <= SAMPLES; i++) {
        const v = FlybySeq.solve(track, i / SAMPLES);
        if (v.eye[1] < minY) minY = v.eye[1];
        if (v.eye[1] > maxY) maxY = v.eye[1];
      }
      return { minY, maxY };
    });
    // Not absolute heights — the circuits sit at different elevations — but the
    // sequence must never duck under its own lowest authored pose, and a lift
    // that has run away is a framing failure even when nothing is clipped.
    assert.ok(out.maxY - out.minY < 120,
      `${id}: the eye swings ${Math.round(out.maxY - out.minY)} m vertically; ` +
      "a clearance lift has run away rather than a shot being authored high");
  }
});

test("each shot is continuous, and only a shot BOUNDARY is a cut", async () => {
  await withTrack("monza", (track, g) => {
    const FlybySeq = g.sandbox.FlybySeq;
    FlybySeq.reset();
    let prev = null, prevIdx = -1;
    const jumps = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const v = FlybySeq.solve(track, i / SAMPLES);
      const eye = [v.eye[0], v.eye[1], v.eye[2]];
      if (prev && v.index === prevIdx) {
        const d = Math.hypot(eye[0] - prev[0], eye[1] - prev[1], eye[2] - prev[2]);
        // Within one shot the eye interpolates, so consecutive samples are a
        // fraction of the move apart. A big step means a pose resolved somewhere
        // unrelated — the failure mode when an anchor is wrong.
        if (d > 25) jumps.push(`shot ${v.id} step ${d.toFixed(1)} m at u=${(i / SAMPLES).toFixed(2)}`);
        assert.equal(v.cut, false, `no cut inside shot ${v.id}`);
      }
      prev = eye; prevIdx = v.index;
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
