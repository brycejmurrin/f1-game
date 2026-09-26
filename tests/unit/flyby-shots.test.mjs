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
import { test, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
import { fleetFindings, variedAudit } from "../helpers/flyby-audit-rules.mjs";
const require = createRequire(import.meta.url);
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

// The circuits worth paying for here: an open park circuit, a street circuit
// (where the buildings press right up to the barriers), and a desert night
// circuit whose grandstands are the tallest things in the game.
const CIRCUITS = ["monza", "monaco", "bahrain"];
const SAMPLES = 120;          // across the whole sequence — ~40 per shot

// ONE BUILD PER CIRCUIT, shared by every test that only READS it. Each
// withTrack() used to boot a fresh VM and race (~3.5 s), and monza alone was
// built fourteen times. What a test here does to a build is read-only on the
// track's geometry and props: FlybySeq only adds MEMO caches to the track
// (`_fbCorners`, `_fbFilmable`, `_fbSolidGrid`, `_fbPlan`, `_fbBind`, …), each a
// pure function of the build and its key, so a warm cache returns exactly what
// a cold one computes. The module-scope state a test CAN change — the player's
// grid slot and the cut tracker — is put back to its boot values before every
// borrow (setPlayerSlot(11, 22) is the initial `_playerSlot` / `_slotKnown` /
// `_gridSize`; apex.race() never sets it, only raceIntro's menuGridCars does).
// A test that measures a COLD cache (warm()) or pumps the VM's timers asks for
// `{ fresh: true }` and gets its own boot, as before.
const VMS = new Map();                 // circuit id -> Promise<game handle>, raced once
let roam = null;                       // one VM re-raced over the circuits nobody pins
let roamId = null;
// Every circuit more than one test reads (~100 MB of VM each); the rest roam.
const PINNED = new Set(["monza", "monaco", "bahrain", "mont_tremblant", "jeddah", "buenos_aires"]);
after(async () => {
  for (const p of VMS.values()) (await p).close();
  if (roam) (await roam).close();
});

function borrowed(g) {
  const F = g.sandbox.FlybySeq;
  F.setPlayerSlot(11, 22);
  F.reset();
  return g;
}

async function vmFor(id) {
  // createGame({ track }) has already raced it — race(id, "day", "dry") is the
  // harness default — so a pinned VM is one boot and one build.
  if (PINNED.has(id)) {
    if (!VMS.has(id)) VMS.set(id, createGame({ track: id }));
    return borrowed(await VMS.get(id));
  }
  if (!roam) { roam = createGame({ track: id }); roamId = id; }
  const g = await roam;
  if (roamId !== id) { roamId = null; await g.race(id, "day", "dry"); roamId = id; }
  return borrowed(g);
}

async function withTrack(id, fn, opts) {
  if (opts && opts.fresh) {
    const g = await createGame({ track: id });
    try {
      await g.race(id, "day", "dry");
      return await fn(g.G.track, g);
    } finally { g.close(); }
  }
  const g = await vmFor(id);
  return await fn(g.G.track, g);
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

test("the flyby editor keeps the world rendering while it is open", () => {
  // Physics pauses on the pause menu, and so does the render loop — the last
  // race frame simply stays on screen. The lighting and camera tuners carve an
  // exception for themselves so their live preview has something to preview;
  // the flyby editor shipped without one, so parking dbgCam through
  // __apex.flybyCam() changed a camera that nothing was redrawing and the
  // player kept looking at the race they paused out of. Source-level: the gate
  // is inside tickBody's paused branch, module-scope in the game.js IIFE.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const i = game.indexOf("if (paused && !netPlay.active())");
  assert.ok(i > 0, "tickBody still parks on a paused frame");
  const branch = game.slice(i, i + 2400);
  const gate = branch.match(/if \(\(state === "race" \|\| state === "count"\) &&[\s\S]{0,200}?\) \{/);
  assert.ok(gate, "the paused branch still gates its preview render");
  for (const panel of ["lighting", "camtune", "flyby"]) {
    assert.match(gate[0], new RegExp("!els\\." + panel + "\\.hidden"),
      "#" + panel + " keeps rendering while it is open");
  }
  assert.ok(branch.indexOf("render(") > 0, "…and that gate still calls render()");
});

test("resuming releases the flyby editor's parked camera", () => {
  // closeFlyby() hands the camera back with __apex.view("chase"). Resume and
  // quit have to call it, or a player who resumed with the panel open drives
  // the race from a parked flyby vantage.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  for (const fn of ["function setPaused(p)", "function quitToMenu()"]) {
    const i = game.indexOf(fn);
    assert.ok(i > 0, fn + " still exists");
    const body = game.slice(i, game.indexOf("\nfunction ", i + 10));
    assert.match(body, /flybyPanel\.closeFlyby\(false\)/, fn + " closes the flyby editor");
  }
  const panel = fs.readFileSync(path.join(ROOT, "js/camera/flyby-panel.js"), "utf8");
  const j = panel.indexOf("function closeFlyby(");
  const body = panel.slice(j, panel.indexOf("\n}", j));
  assert.match(body, /if \(!isOpen\(\)\) return;/,
    "…and a blind close on a shut panel touches no camera");
});

test("a corner's +x is its OUTSIDE, whichever way it turns", async () => {
  // One shot list is written for every circuit, so "+x" at a corner cannot mean
  // "right": that put two of the three corner shots on the INSIDE somewhere,
  // peering through trunks and lamp posts. Checked against the curvature sign
  // (+k = LEFT turn, measured) on every corner tight enough to have a side.
  for (const id of ["monza", "monaco"]) {
    const wrong = await withTrack(id, (track, g) => {
      const FlybySeq = g.sandbox.FlybySeq, Tracks = g.sandbox.Tracks;
      const bad = [];
      const n = track._fbCorners ? track._fbCorners.length : (FlybySeq.cornerS(track, 1), track._fbCorners.length);
      for (let i = 1; i <= n; i++) {
        const s = FlybySeq.cornerS(track, i);
        const k = Tracks.curvature(track, s);
        if (!(Math.abs(k) > 0.004)) continue;      // a kink, not a corner with an outside
        const want = k > 0 ? 1 : -1;                // left turn → outside is +right
        if (FlybySeq.cornerSide(track, i) !== want) bad.push(`T${i} k=${k.toFixed(4)}`);
      }
      return bad;
    });
    assert.deepEqual(wrong, [], `${id}: corner side disagrees with the turn direction`);
  }
});

test("a landmark bearing of 0 is the TRACK side of it", async () => {
  // Shot from that side, the circuit is IN FRONT of the landmark: either the
  // sightline to it crosses the track, or the eye stands between the two. A
  // world bearing named a different picture at every circuit.
  for (const id of CIRCUITS) {
    const bad = await withTrack(id, (track, g) => {
      const FlybySeq = g.sandbox.FlybySeq, Tracks = g.sandbox.Tracks;
      const pts = FlybySeq.bounds(track).pts, out = [];
      const nearest = (x, z) => Math.min(...pts.map((p) => Math.hypot(p[0] - x, p[2] - z)));
      FlybySeq.landmarks(track).forEach((r, rank) => {
        const eye = FlybySeq.posePoint(track, { at: "landmark", rank, bear: 0, distK: 1.5, yK: 0 }, [0, 0, 0]);
        let crosses = false;
        for (let i = 0; i <= 40 && !crosses; i++) {
          const x = eye[0] + (r.x - eye[0]) * i / 40, z = eye[2] + (r.z - eye[2]) * i / 40;
          const pr = Tracks.project(track, x, z);
          if (pr && Math.abs(pr.lat) < 15) crosses = true;
        }
        if (!crosses && !(nearest(eye[0], eye[2]) < nearest(r.x, r.z))) out.push(`rank ${rank} (${r.kind})`);
      });
      return out;
    });
    assert.deepEqual(bad, [], `${id}: a bearing-0 landmark shot does not have the track in front of it`);
  }
});

test("on a street circuit a corner camera stands at the fence, not in a building", async () => {
  await withTrack("monaco", (track, g) => {
    const FlybySeq = g.sandbox.FlybySeq, Tracks = g.sandbox.Tracks;
    for (const shot of FlybySeq.DEFAULT) {
      for (const pose of shot.eye) {
        if (pose.at !== "corner") continue;
        const s = FlybySeq.anchorS(track, pose);
        const eye = FlybySeq.posePoint(track, pose, [0, 0, 0]);
        const pr = Tracks.project(track, eye[0], eye[2], s, eye[1]);
        const wall = Tracks.wallAt(track, s, pr.lat > 0 ? 1 : -1);
        assert.ok(Math.abs(pr.lat) <= wall + FlybySeq.FENCE + 0.5,
          `${shot.id}: eye ${pr.lat.toFixed(1)} m off the centreline, barrier at ${wall.toFixed(1)} m`);
      }
    }
    return null;
  });
});

test("the clearance lift is PLANNED: no pop inside a shot, and corners step in before they lift", async () => {
  // clearEye() on its own ran per frame, so the eye jumped straight up the
  // frame it touched a box: 17 m on Monza's turn-late, 54 m on Shanghai's
  // turn-mid (fleet audit, 400 samples — 120 hid it). Shanghai and Mexico are
  // OPEN circuits whose corner eyes grazed trackside structures; they must now
  // step towards the road instead of craning over a roof.
  const N = 400;
  for (const id of ["monza", "monaco", "shanghai", "mexico"]) {
    const bad = await withTrack(id, (track, g) => {
      const FlybySeq = g.sandbox.FlybySeq, out = [];
      FlybySeq.reset();
      let prevY = null, prevIdx = -1;
      for (let i = 0; i <= N; i++) {
        const v = FlybySeq.solve(track, i / N);
        if (v.index === prevIdx && Math.abs(v.eye[1] - prevY) > 4) {
          out.push(`${v.id} jumps ${Math.abs(v.eye[1] - prevY).toFixed(1)} m in one step at u=${(i / N).toFixed(3)}`);
        }
        if (/^turn-/.test(v.id) && v.lift > 15) out.push(`${v.id} lifted ${v.lift.toFixed(1)} m`);
        prevY = v.eye[1]; prevIdx = v.index;
      }
      return [...new Set(out)].slice(0, 6);
    });
    assert.deepEqual(bad, [], `${id}: ` + bad.join("; "));
  }
});

// ---- the fleet audit (tools/lib/flyby-audit.cjs) ---------------------------
//
// The two FLEET-WIDE sweeps — twelve circuits at 400 samples, and seeds 0-5 of
// vary() on three — live in tests/unit/flyby-fleet.test.mjs (test:node-slow):
// they build a dozen circuits. Here, in the edit loop, both run on monza with
// the SAME rule functions (tests/helpers/flyby-audit-rules.mjs), so an edit to
// the sequencer meets every rule at once and the fleet file adds only circuits.
const { auditTrack } = require(path.join(ROOT, "tools/lib/flyby-audit.cjs"));

// Same builds as withTrack(): a pinned circuit's shared VM, the rest re-raced
// on the one roaming VM (~1 s each) — what this helper always did.
async function withFleet(ids, fn) {
  const out = [];
  for (const id of ids) {
    const g = await vmFor(id);
    out.push(...(await fn(id, g.G.track, g)));
  }
  return out;
}

test("fleet rules on monza: no pop, no crane, no eye underground, grid sightline on the road, no whip pan", async () => {
  const bad = await withFleet(["monza"], (id, track, g) => fleetFindings(id, auditTrack(g.sandbox, track, { samples: 400 })));
  assert.deepEqual(bad, [], "flyby fleet audit:\n  " + bad.join("\n  "));
});

test("the pan budget's clock is the loading screen's", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/ui/loading-screen.js"), "utf8");
  const m = /const FLY_MS = (\d+);/.exec(src);
  assert.ok(m, "FLY_MS not found in js/ui/loading-screen.js");
  const seq = fs.readFileSync(path.join(ROOT, "js/camera/flyby-seq.js"), "utf8");
  const r = /REF_S = (\d+(?:\.\d+)?)/.exec(seq);
  assert.ok(r, "REF_S not found in js/camera/flyby-seq.js");
  assert.equal(+r[1] * 1000, +m[1], "FlybySeq.REF_S must equal FLY_MS / 1000, or the pan budget is in the wrong seconds");
});

test("a centre pose of distR 0 / yR 0 is the centroid, not the clamp", async () => {
  await withTrack("monza", (track, g) => {
    const F = g.sandbox.FlybySeq, b = F.bounds(track);
    const p = F.posePoint(track, { at: "centre", distR: 0, yR: 0 }, [0, 0, 0]);
    assert.ok(Math.hypot(p[0] - b.x, p[2] - b.z) < 1e-6, "distR 0 must be the centroid in plan");
    assert.ok(Math.abs(p[1] - b.y) < 1e-6, "yR 0 must be the centroid's height");
    // ... while a camera's pose still lives inside the helicopter clamps.
    const e = F.posePoint(track, { at: "centre", distR: 0.01, yR: 0.01 }, [0, 0, 0]);
    assert.ok(Math.abs(Math.hypot(e[0] - b.x, e[2] - b.z) - 200) < 1e-6, "a tiny distR clamps to 200 m out");
    assert.ok(Math.abs(e[1] - b.y - 55) < 1e-6, "a tiny yR clamps to 55 m up");
    return null;
  });
});

test("landmarks: no gantries, nothing on the road, heights above ground; missing ranks become centre shots", async () => {
  const bad = await withFleet(["buenos_aires", "hockenheim", "kyalami", "monza"], (id, track, g) => {
    const F = g.sandbox.FlybySeq, Tracks = g.sandbox.Tracks, out = [];
    const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
    const lm = F.landmarks(track);
    for (const r of lm) {
      if (r.kind === "gantry") out.push(`${id}: a gantry is a landmark`);
      const pr = Tracks.project(track, r.x, r.z);
      Tracks.sample(track, pr.s, smp);
      if (Math.abs(pr.lat) - smp.hw < 5) out.push(`${id}: ${r.kind} ${(Math.abs(pr.lat) - smp.hw).toFixed(1)} m from the road edge`);
      const base = F.lmBase(track, r);
      if (base < r.y - r.h / 2 - 1e-6 || base > r.y + r.h / 2) out.push(`${id}: ${r.kind} base ${base} outside its hull`);
    }
    // A landmark shot whose rank this circuit lacks is a whole-circuit shot,
    // never the previous landmark again (Kyalami has one).
    for (const shot of F.DEFAULT) {
      const ranks = shot.eye.concat(shot.look).filter((p) => p.at === "landmark").map((p) => p.rank || 0);
      if (!ranks.length) continue;
      const fb = F.landmarkFallback(track, shot);
      const need = Math.max(...ranks) >= lm.length;
      if (need !== (fb !== shot)) out.push(`${id}: ${shot.id} fallback ${fb !== shot} with ${lm.length} landmarks`);
      if (need && !(fb.eye[0].at === "centre" && fb.look[0].at === "centre")) out.push(`${id}: ${shot.id} fell back to ${fb.eye[0].at}`);
    }
    // One pose, no landmarks at all: an eye stays an eye and a look a look —
    // the old start+20 m look sat 8 m straight over its own eye.
    const bare = Object.create(track);
    bare._fbLandmarks = [];
    const eye = F.posePoint(bare, { at: "landmark", rank: 0, distK: 1.7, yK: 0, y: 12 }, [0, 0, 0]);
    const look = F.posePoint(bare, { at: "landmark", rank: 0, distK: 0, yK: 0.2 }, [0, 0, 0]);
    const flat = Math.hypot(look[0] - eye[0], look[2] - eye[2]);
    if (!(flat > Math.abs(look[1] - eye[1]))) out.push(`${id}: no-landmark fallback looks ${flat.toFixed(1)} m across, ${(look[1] - eye[1]).toFixed(1)} m up`);
    return out;
  });
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("a corner ROLE lands on a real corner, not a kink or a chicane flick", async () => {
  // The five the fleet audit found, each measured on its old role corner:
  // mont_tremblant first 0 deg, sochi first 20, jeddah late 17, buenos_aires
  // mid 21, montreal late 42 of 75 swept (a chicane).
  const cases = { mont_tremblant: "first", sochi: "first", jeddah: "late", buenos_aires: "mid", montreal: "late" };
  const bad = await withFleet(Object.keys(cases), (id, track, g) => {
    const F = g.sandbox.FlybySeq, out = [];
    for (const role of ["first", "mid", "late"]) {
      const t = F.cornerTurn(track, F.cornerS(track, role));
      const deg = (a) => (a * 180 / Math.PI).toFixed(0);
      if (t.net < 35 * Math.PI / 180) out.push(`${id} ${role}: turns ${deg(t.net)} deg net`);
      else if (t.swept > 1.5 * t.net && t.net < 45 * Math.PI / 180) out.push(`${id} ${role}: a chicane, ${deg(t.net)} of ${deg(t.swept)} deg`);
    }
    return out;
  });
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("a planned eye is not inside a tree canopy (Monza turn-first, the frame report's find)", async () => {
  await withTrack("monza", (track, g) => {
    const rows = auditTrack(g.sandbox, track, { samples: 400 });
    const trees = rows.filter((r) => r.tree > 0).map((r) => `${r.id} on ${r.tree} samples from u=${r.treeU.toFixed(3)}`);
    assert.deepEqual(trees, [], "eye inside a tree: " + trees.join("; "));
    return null;
  });
});

test("the player's slot anchor is gridSlot()'s own slot: same arc, same stagger", async () => {
  // grid-mine ends the loading flyby on YOUR car; an anchor a slot off films
  // someone else's. Held to the mesh's gridSlot(), not to restated numbers.
  await withTrack("bahrain", (track, g) => {
    const F = g.sandbox.FlybySeq, M = g.sandbox.TrackMesh, T = g.sandbox.Tracks;
    for (const k of [0, 1, 11, 19]) {
      F.setPlayerSlot(k);
      assert.equal(F.slotIndex({ at: "slot", n: "player" }), k);
      const want = M.gridSlot(track, k);
      assert.ok(Math.abs(F.anchorS(track, { at: "slot", n: "player" }) - want.s) < 1e-6, `slot ${k}: arc`);
      const p = F.posePoint(track, { at: "slot", n: "player", off: 0, x: 0, y: 0 }, [0, 0, 0]);
      const pr = T.project(track, p[0], p[2], null, p[1]);
      assert.ok(Math.abs(pr.lat - want.x) < 0.1, `slot ${k}: lateral ${pr.lat.toFixed(2)} vs gridSlot ${want.x.toFixed(2)}`);
    }
    F.setPlayerSlot(-1);
    assert.equal(F.slotIndex({ at: "slot", n: "player" }), 11, "an unknown seat falls back to the pace-order P12");
    return null;
  });
});

test("corners by character: slowest / fastest / lore resolve to filmable corners", async () => {
  const bad = await withFleet(["monaco", "monza", "bahrain", "spa"], (id, track, g) => {
    const F = g.sandbox.FlybySeq, out = [];
    F.cornerS(track, 1);
    const cs = track._fbCorners, s = (n) => F.cornerS(track, n);
    const at = (n) => cs.findIndex((c) => Math.abs(F.cornerS(track, cs.indexOf(c) + 1) - s(n)) < 1e-6);
    const slow = at("slowest"), fast = at("fastest"), lore = at("lore");
    if (slow < 0 || fast < 0 || lore < 0) out.push(`${id}: a role missed every corner (${slow} ${fast} ${lore})`);
    else {
      if (!track._fbFilmable[slow] || !track._fbFilmable[fast] || !track._fbFilmable[lore]) out.push(`${id}: a role landed on an unfilmable corner`);
      if (!(cs[slow].r <= cs[fast].r)) out.push(`${id}: slowest (r ${cs[slow].r}) is wider than fastest (r ${cs[fast].r})`);
    }
    return out;
  });
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("vary: one seed, one sequence; every variant is a valid list that keeps the grid close", async () => {
  const { shotErrors } = await import("../../tools/gen/bake-flyby.mjs");
  await withTrack("monza", (track, g) => {
    const F = g.sandbox.FlybySeq, D = JSON.parse(JSON.stringify(F.DEFAULT));
    assert.deepEqual(JSON.parse(JSON.stringify(F.vary(F.DEFAULT, 7))), JSON.parse(JSON.stringify(F.vary(F.DEFAULT, 7))), "deterministic per seed");
    let differs = 0;
    for (let seed = 0; seed < 16; seed++) {
      const v = JSON.parse(JSON.stringify(F.vary(F.DEFAULT, seed)));
      assert.deepEqual(shotErrors(v), [], `seed ${seed}: ${shotErrors(v).join("; ")}`);
      assert.deepEqual(v.map((s) => s.id), D.map((s) => s.id), "same shots, same order");
      assert.deepEqual(v.filter((s) => /^grid/.test(s.id)), D.filter((s) => /^grid/.test(s.id)), "the grid close is untouched");
      const roles = v.filter((s) => s.eye[0].at === "corner").map((s) => s.eye[0].n);
      assert.equal(new Set(roles).size, roles.length, `seed ${seed}: a corner role repeats: ${roles}`);
      if (JSON.stringify(v) !== JSON.stringify(D)) differs++;
    }
    assert.ok(differs >= 12, `vary changed only ${differs} of 16 loads`);
    assert.deepEqual(JSON.parse(JSON.stringify(F.DEFAULT)), D, "vary never mutates DEFAULT");
    return null;
  });
});

test("varied flybys hold the fleet audit too (seeds 0-5 on monza)", async () => {
  const bad = await withFleet(["monza"], (id, track, g) => variedAudit(auditTrack, g.sandbox, id, track));
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("a corner eye in canopy falls back to the road edge (Mont-Tremblant turn-late)", async () => {
  await withTrack("mont_tremblant", (track, g) => {
    const rows = auditTrack(g.sandbox, track, { samples: 400 });
    const trees = rows.filter((r) => r.tree > 0).map((r) => `${r.id} on ${r.tree} samples from u=${r.treeU.toFixed(3)}`);
    assert.deepEqual(trees, [], "eye inside a tree: " + trees.join("; "));
    return null;
  });
});

test("no racing line in a flyby frame", () => {
  // The green driving-line chevrons are a driving aid, not scenery: every
  // cinematic frame (editor preview, __apex.flybyCam, free-cam's flyby lens)
  // skips them. The live loading flyby runs in state "menu", which already does.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const call = game.split("\n").find((l) => /DrivingLine\.draw\(/.test(l));
  assert.ok(call, "game.js still draws the driving line");
  assert.match(call, /!cine\b/, "the driving line is gated off in cinematic frames: " + call.trim());
  assert.match(call, /state !== "menu"/, "and off under the loading-screen flyby");
});

test("one corner, one shot: no flyby films the same corner twice", async () => {
  // Roles resolve independently, and did collide: Monza's first and fastest
  // were both T1, and 14 of 52 circuits filmed one corner twice (a third of
  // varied loads). bindCorners() moves a clash to that role's next choice.
  const bad = await withFleet(["monza", "bahrain", "mont_tremblant", "qatar", "jeddah", "nurburgring"], (id, track, g) => {
    const F = g.sandbox.FlybySeq, out = [];
    for (let seed = -1; seed < 12; seed++) {
      const list = F.bindCorners(track, seed < 0 ? F.DEFAULT : F.vary(F.DEFAULT, seed));
      const s = list.filter((sh) => sh.eye[0].at === "corner").map((sh) => F.cornerS(track, sh.eye[0].n));
      for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
        const d = Math.abs(s[i] - s[j]), gap = Math.min(d, track.total - d);
        if (gap < 120) out.push(`${id} ${seed < 0 ? "DEFAULT" : "seed " + seed}: corner shots ${i} and ${j} are ${gap.toFixed(0)} m apart`);
      }
    }
    return out;
  });
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("a NUMBERED corner is the author's: bindCorners never moves it, roles steer around it", async () => {
  await withTrack("monza", (track, g) => {
    const F = g.sandbox.FlybySeq;
    const c = (n) => ({ at: "corner", n, off: -30, x: 15, y: 8 });
    const sh = (id, n) => ({ id, dur: 0.25, ease: "inOut", eye: [c(n), c(n)], look: [c(n), c(n)], fov: [40, 40] });
    // Monza's T1 and T2 share s = 592 (the Rettifilo's two halves), and a list may name one corner twice.
    const list = [sh("a", 3), sh("b", 3), sh("c", 1), sh("d", 2), sh("e", "first")];
    const b = F.bindCorners(track, list);
    assert.deepEqual(b.slice(0, 4).map((s) => s.eye[0].n), [3, 3, 1, 2], "numbered corners play as authored");
    const sFirst = F.cornerS(track, b[4].eye[0].n), s1 = F.cornerS(track, 1), s3 = F.cornerS(track, 3);
    assert.ok(Math.abs(sFirst - s1) >= 120 && Math.abs(sFirst - s3) >= 120, "the role moved off the corners the author claimed");
    return null;
  });
});

test("the clearance grid index finds exactly what a full scan finds", async () => {
  // insideProp/clearTrees query a grid instead of scanning every box (Monza's
  // turn-first took 1.35 s to plan). Same answer, same first hit, everywhere.
  await withTrack("monza", (track, g) => {
    const F = g.sandbox.FlybySeq, b = F.blockers(track), B = F.bounds(track);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const scan = (p, m) => { for (const r of b) if (Math.abs(p[0] - r.x) < r.w / 2 + m && Math.abs(p[2] - r.z) < r.d / 2 + m && p[1] > r.y - r.h / 2 - m && p[1] < r.y + r.h / 2 + m) return r; return null; };
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      const pick = b[(rnd() * b.length) | 0];
      const p = i % 2 ? [pick.x + (rnd() - 0.5) * pick.w * 1.4, pick.y + (rnd() - 0.5) * pick.h, pick.z + (rnd() - 0.5) * pick.d * 1.4]
                      : [B.x + (rnd() - 0.5) * B.rad * 2, rnd() * 40, B.z + (rnd() - 0.5) * B.rad * 2];
      const m = [0, 2.5, 7][i % 3];
      const want = scan(p, m), got = F.insideProp(track, p, m);
      assert.equal(got, want, `point ${p.map((v) => v.toFixed(1))} margin ${m}`);
      if (want) hits++;
    }
    assert.ok(hits > 500, `the probe points hit boxes (${hits})`);
    return null;
  });
});

test("the flyby's plans are made before it plays, not at each cut", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const warm = game.indexOf("FlybySeq.warm(track, flybyShots)"), run = game.indexOf("loadingScreen.run(loadingInfo(), go)");
  assert.ok(warm > 0 && run > warm, "raceIntro warms the flyby's plans before the loading screen runs it");
});

test("the menu grid seats YOUR car where the race will start it, in every mode", async () => {
  // grid-mine frames the player's slot. menuGridCars used to seat P12 always, so
  // a time trial (you, alone, slot 0), a duel (P2 behind the rival), a
  // qualifying/sprint/rev10 grid all filmed somebody else's car. flybyGridOrder
  // is game.js module scope: evaluate the REAL function (with the real gridRule
  // and gridOrderFor) against stubbed modes.
  const vm = await import("node:vm");
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const fn = (name) => { const i = game.indexOf("function " + name + "("); assert.ok(i > 0, name); return game.slice(i, game.indexOf("\n}\n", i) + 3); };
  const src = fn("gridRule") + fn("gridOrderFor") + fn("flybyGridOrder") + "flybyGridOrder();";
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: i, driverId: "d" + i, skill: i, isPlayer: i === 3 }));
  const run = (o) => {
    const cars = mk(o.n || 22), player = cars[3];
    let draws = 0;
    const ctx = {
      cars, player, season: {}, raceGrid: o.rule || "tier", duelOn: () => !!o.duel,
      isQuali: () => !!o.quali, isTimeTrial: () => !!o.tt, isChampionship: () => !!o.champ, gridFromQuali: () => !!o.qorder,
      quali: { order: () => (o.qorder ? cars.slice().reverse() : null) }, SeasonCal: { grid: () => null, quali: () => false, rank: (a, b) => (a < b ? -1 : 1) },
      Duel: { pick: (cs) => cs.filter((c) => !c.isPlayer).sort((a, b) => b.skill - a.skill)[0],
              asLegend: (c, lg) => { c.code = lg.code; } },
      duelLegend: o.legend || "", DriverRatings: {},
      Legends: { byId: (id) => ({ id, name: "Legend", code: "LEG" }), ratings: () => ({}), raceTeam: () => null },
      netPlay: { active: () => false }, simRnd: () => { draws++; return 0.5; },
    };
    if (o.tiers) for (const c of cars) c.tier = o.tiers(c);
    const order = vm.runInNewContext(src, ctx);
    return { order, slot: order ? order.indexOf(player) : null, n: order ? order.length : 0 };
  };
  assert.deepEqual([run({}).slot, run({}).n], [11, 22], "a Grand Prix on pace order: P12");
  assert.deepEqual([run({ tt: true }).slot, run({ tt: true }).n], [0, 1], "time trial: you, alone, on slot 0");
  assert.deepEqual([run({ quali: true }).slot, run({ quali: true }).n], [0, 1], "qualifying lap: you alone");
  const d = run({ duel: true });
  assert.deepEqual([d.slot, d.n, d.order[0].id], [1, 2, 21], "duel: the rival on pole, you P2 — as gridUp lays [player, rival]");
  assert.equal(run({ qorder: true }).slot, 18, "a qualifying order seats you where you qualified (reversed stub: 22-1-3)");
  assert.equal(run({ qorder: true, rule: "rev10" }).slot, 18, "rev10 flips only the top ten");
  assert.equal(run({ rule: "random" }).order, null, "a random grid is the race's draw: not knowable, so no grid-mine");
  assert.equal(run({ duel: true, legend: "senna" }).order[0].code, "LEG", "a legend duel shows the legend the race grids, not the real driver it replaces");
  const t = run({ tiers: (c) => (c.id >= 18 ? 1 : 3) });   // gridUp sorts by tier: the fast cars go to the front
  assert.deepEqual([t.slot, t.order.slice(0, 4).map((c) => c.id)], [11, [18, 19, 20, 21]], "pace order is gridUp's tier order, you at P12");
});

test("a random grid's flyby leaves out the shot of your car", async () => {
  await withTrack("monza", (track, g) => {
    const F = g.sandbox.FlybySeq;
    const has = (l) => l.some((s) => [s.eye[0], s.eye[1], s.look[0], s.look[1]].some((p) => p.at === "slot"));
    const mine = (l) => l.some((s) => s.id === "grid-mine");
    F.setPlayerSlot(11, 22);
    assert.ok(mine(F.vary(F.DEFAULT, 5)), "known slot: grid-mine plays");
    F.setPlayerSlot(null, 22); assert.equal(F.slotKnown(), false);
    const v = F.vary(F.DEFAULT, 5);
    assert.ok(!mine(v) && v.length === F.DEFAULT.length - 1, "unknown slot: grid-mine is dropped, the rest stays");
    assert.ok(has(v), "the numbered-slot grid walk still plays on a full random grid");
    F.setPlayerSlot(11, 22); assert.equal(F.slotKnown(), true);
    return null;
  });
});

test("a duel never leaks into a championship round, a time trial or a quali lap", () => {
  // duelMode is a sticky SETTING; startRaceBody checked it before isTimeTrial()
  // with no championship guard, so after one duel a time trial ran with an AI
  // rival and a season round scored a 2-car race. Every consumer goes through duelOn().
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /const duelOn = \(\) => duelMode && !isChampionship\(\) && !isTimeTrial\(\) && !isQuali\(\);/);
  const uses = game.split("\n").filter((l) => /\bduelMode\b/.test(l) && !/^\s*\/\//.test(l));
  const bad = uses.filter((l) => !/let duelMode|const duelOn|const duelSetting|set duel\(v\)|get duel\(\)/.test(l));
  assert.deepEqual(bad, [], "duelMode is read only through duelOn(): " + bad.join(" | "));
  const lobby = fs.readFileSync(path.join(ROOT, "js/net/lobby.js"), "utf8");
  assert.match(lobby, /G\.duel = false;/, "a friend race clears duel: the room's grid is every peer's");
});

test("the loading screen flies only the world built for THIS selection", () => {
  // A fast tap to RACE! before the menu's idle build ran left the previous
  // circuit in `track`: the flyby filmed it under the new circuit's card, and a
  // dark session baked its lamps twice. menuWorld() also checks the build's key.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /const menuWorld = \(\) => !!track && _menuGate\.track === track && _menuGate\.ready === menuKey\(trackIdx\);/);
  assert.match(game, /hasWorld: menuWorld\(\),/);
  const i = game.indexOf("function raceIntro(go)"), body = game.slice(i, game.indexOf("\n}\n", i));
  for (const call of ["menuGridCars()", "applyRaceSettings()", "FlybySeq.warm(track, flybyShots)"])
    assert.match(body, new RegExp("if \\(world\\) " + call.replace(/[()]/g, "\\$&")), call + " waits for the right world");
});

test("warm() plans the opening shots at once and the rest in slices, never through solve()", async () => {
  await withTrack("monza", async (track, g) => {
    const F = g.sandbox.FlybySeq, list = F.vary(F.DEFAULT, 11);
    F.reset(); F.solve(track, 0.5, list); const idxBefore = F.solve(track, 0.5, list).index;
    F.warm(track, list);
    // No solve() side effect: the cut tracker still sees the same shot.
    assert.equal(F.solve(track, 0.5, list).cut, false, "warm() did not disturb solve()'s cut tracking");
    assert.equal(F.solve(track, 0.5, list).index, idxBefore);
    for (let k = 0; k < 20; k++) g.flushTimers();   // the VM queues timers; fire the slices by hand
    // Everything is planned: a solve at each shot's middle is a cache hit (fast).
    let total = 0; for (const s of list) total += s.dur;
    let acc = 0, worst = 0;
    for (const s of list) { const t0 = process.hrtime.bigint(); F.solve(track, (acc + s.dur / 2) / total, list); worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6); acc += s.dur; }
    assert.ok(worst < 20, `every shot was pre-planned (worst solve ${worst.toFixed(1)} ms)`);
    return null;
  }, { fresh: true });   // a COLD plan cache, and its own timer queue to flush
});

test("a grid too small to fill a numbered slot leaves that shot out (time trial, duel)", async () => {
  await withTrack("monza", (track, g) => {
    const F = g.sandbox.FlybySeq, ids = (l) => l.map((s) => s.id);
    F.setPlayerSlot(11, 22); assert.ok(ids(F.vary(F.DEFAULT, 3)).includes("grid-walk"), "a full grid walks");
    F.setPlayerSlot(0, 1);
    const tt = ids(F.vary(F.DEFAULT, 3));
    assert.ok(!tt.includes("grid-walk") && tt.includes("grid-mine"), "a time trial: no walk past empty boxes, your car still closes");
    F.setPlayerSlot(1, 2); assert.ok(!ids(F.withoutSlot(F.DEFAULT)).includes("grid-walk"), "a duel: saved lists are fitted too");
    F.setPlayerSlot(11, 22);
    return null;
  });
});

test("the menu plans the flyby; the loading screen reuses every plan (no planning mid-flyby)", async () => {
  // Corner plans on a built-up circuit cost 150-380 ms each on a desktop (Singapore);
  // made in timer slices DURING the flyby they were visible hitches, ~1-2 s on a
  // phone. menuFinish plans the load's list with planSteps; the flyby then only
  // reads plans — which needs the SAME bound shot objects (bindCorners' memo) and
  // the SAME list when nothing is filtered (withoutSlot).
  await withTrack("singapore", (track, g) => {
    const F = g.sandbox.FlybySeq;
    F.setPlayerSlot(11, 22);
    const list = F.vary(F.DEFAULT, 9, false), step = F.planSteps(track, list);
    let n = 0; while (!step()) n++;
    assert.ok(n >= list.length - 2, "planSteps plans one shot per call");
    assert.equal(F.withoutSlot(list), list, "nothing filtered: the same array, so the bound shots and plans are reused");
    const b1 = F.bindCorners(track, list), b2 = F.bindCorners(track, list.slice());
    assert.ok(b1.every((s, i) => s === b2[i]), "a re-made list binds to the SAME shot objects");
    let total = 0; for (const s of list) total += s.dur;
    let acc = 0, worst = 0; F.reset();
    for (const s of list) { const t0 = process.hrtime.bigint(); F.solve(track, (acc + s.dur / 2) / total, list); worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6); acc += s.dur; }
    assert.ok(worst < 25, `every shot was planned in the menu (worst solve ${worst.toFixed(1)} ms)`);
    return null;
  });
});

test("the menu build warms its shaders BEFORE the slow extras (lamp pre-bake, flyby plans)", () => {
  // The lamp pre-bake (seconds of slices) ran before the warm frames: a RACE! tap
  // mid-bake met cold shaders and the loading screen's flyby froze on its first frames.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const i = game.indexOf("async function menuFinish(current, key)"), body = game.slice(i, game.indexOf("\n}\n", i));
  assert.ok(i > 0, "menuFinish exists");
  const warm = body.indexOf("_menuGate.warm = 2"), lamp = body.indexOf("menuLampBake(current)"), plan = body.indexOf("FlybySeq.planSteps(");
  assert.ok(warm > 0 && warm < lamp && lamp < plan, "car assets -> warm -> lamp bake -> flyby plans");
  assert.match(body, /if \(lit && await menuIdle\(current\)\) \{ FlybySeq\.reset\(\); _menuGate\.warm = 2; \}/, "and warm again once a baked (dark) world is in — only then");
  assert.match(game, /const planned = world && _menuFly && _menuFly\.track === track && _menuFly\.key === _menuGate\.ready/);
});

test("RACE! before the menu's build: build under the card, then fly (never the bare card)", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const i = game.indexOf("function raceIntro(go)"), body = game.slice(i, game.indexOf("\n}\n", i));
  assert.match(body, /if \(!built && !menuWorld\(\) && introBuild\(go\)\) return;/, "no world: raceIntro diverts to the build");
  const j = game.indexOf("function introBuild(go)"), ib = game.slice(j, game.indexOf("\n}\n", j));
  const b = ib.indexOf("loadingScreen.building("), l = ib.indexOf("loadTrack(idx)"), p = ib.indexOf("FlybySeq.planSteps"), r = ib.indexOf("raceIntro(go)");
  assert.ok(b > 0 && l > b && p > l && r > p, "card up, then build, then plan, then the flyby");
  assert.match(ib, /_menuGate\.ready = key; _menuGate\.track = track;/, "the build is keyed like the menu's, so menuWorld() sees it");
  assert.match(ib, /_introKey = key; raceIntro\(go\)/, "the hand-over marks itself, so a failed build falls back to the card instead of looping");
  assert.match(ib, /prefers-reduced-motion/, "reduced motion has no flyby to build for");
  const pa = ib.indexOf("prepareMenuCarAssets("), wa = ib.indexOf("_menuGate.warm = 2");
  assert.ok(pa > l && wa > pa && p > wa, "under the card, like menuFinish: car assets, then hidden warm frames, then plans — the flyby's first frame compiles nothing");
  assert.match(ib, /try \{ _introKey = key; raceIntro\(go\); \} catch \(e\) \{[^}]*loadingScreen\.stop\(\); go\(\); \}/, "a throw in raceIntro never strands the timer-less build card");
  assert.match(ib, /gfx\.warming\(\)\) await menuSlice\(\)/, "never frees a scene a compile still owns");
});

test("every flyby run opens on a CUT: FlybySeq.reset() before the run and before hidden warm frames", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const i = game.indexOf("function raceIntro(go)"), body = game.slice(i, game.indexOf("\n}\n", i));
  assert.ok(body.indexOf("FlybySeq.reset();") > 0 && body.indexOf("FlybySeq.reset();") < body.indexOf("loadingScreen.run("), "raceIntro resets the sequencer before run()");
  const f = game.indexOf("async function menuFinish(current, key)"), fin = game.slice(f, game.indexOf("\n}\n", f));
  assert.equal((fin.match(/FlybySeq\.reset\(\); _menuGate\.warm = 2;/g) || []).length, 2, "both of menuFinish's warm passes");
});

test("the world key includes the grid size, and a failed build does not keep the old id", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /const menuKey = \(idx\) => \[idx, raceTimeOfDay, raceWeather, fieldSize\(\)\]\.join\("\|"\);/);
  assert.equal((game.match(/\[(trackIdx|want|idx), (raceTimeOfDay|tod), (raceWeather|weather)\]\.join\("\|"\)/g) || []).length, 0, "every menu key goes through menuKey()");
  assert.match(game, /track = null; builtTrackId = null;/, "a build that throws must force the next loadTrack to rebuild");
  assert.match(game, /const menuBlank = state === "menu" && !setupPreviewOn && \(!track \|\| !loadingScreen\.active\(\) \|\| !menuWorld\(\)\);/, "the no-world card shows no stale circuit");
});

test("plans are reused when they still hold, and re-planned when they do not", async () => {
  await withTrack("monaco", (track, g) => {
    const F = g.sandbox.FlybySeq;
    F.setDuration(24000); F.setPlayerSlot(11, 22);
    const list = F.bindCorners(track, F.DEFAULT), total = list.reduce((a, s) => a + s.dur, 0);
    const plain = list.find((s) => !JSON.stringify(s).includes('"slot"') && !JSON.stringify(s).includes('"grid"'));
    const slotShot = list.find((s) => JSON.stringify(s).includes('"slot"'));
    const a = F.planShot(track, plain, plain.dur / total);
    F.setPlayerSlot(3, 22);
    assert.equal(F.planShot(track, plain, plain.dur / total), a, "a shot aimed at no slot keeps its plan when the player's slot moves");
    assert.equal(F.planShot(track, plain, plain.dur / (total * 0.9)), a, "more screen time (a dropped shot) keeps a plan squeezed for less");
    F.setDuration(12000);
    assert.notEqual(F.planShot(track, plain, plain.dur / total), a, "the 12 s cut re-plans: half the seconds, the pans are held to PAN_MAX again");
    F.setDuration(24000);
    if (slotShot) {
      const b = F.planShot(track, slotShot, slotShot.dur / total);
      F.setPlayerSlot(7, 22);
      assert.notEqual(F.planShot(track, slotShot, slotShot.dur / total), b, "a slot shot follows the player's slot");
    }
    F.setPlayerSlot(11, 22);
  });
});

test("the grid's back is the grid that is there: a time trial is not filmed from 19 empty rows", async () => {
  await withTrack("monza", (track, g) => {
    const F = g.sandbox.FlybySeq;
    const pose = { at: "grid" };
    F.setPlayerSlot(0, 22); const full = F.anchorS ? F.anchorS(track, pose) : null;
    F.setPlayerSlot(0, 1); const solo = F.anchorS ? F.anchorS(track, pose) : null;
    F.setPlayerSlot(11, 22);
    if (full === null) {
      const src = fs.readFileSync(path.join(ROOT, "js/camera/flyby-seq.js"), "utf8");
      assert.match(src, /case "grid": return wrapS\(track, total - POLE_BACK - \(Math\.min\(GRID_ROWS, _gridSize\) - 1\) \* GRID_SPACING \+ off\);/);
      return;
    }
    const d = ((full - solo) % track.total + track.total) % track.total;
    assert.ok(d > track.total / 2, `a one-car grid's back sits ahead of a 22-car one (Δs ${d.toFixed(0)} of ${track.total.toFixed(0)})`);
  });
});

test("warm() can be retired, and the race start retires it", () => {
  const seq = fs.readFileSync(path.join(ROOT, "js/camera/flyby-seq.js"), "utf8");
  assert.match(seq, /function cancelWarm\(\) \{ _warmGen\+\+; \}/);
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /function clearMenuScreens\(\) \{[\s\S]{0,300}FlybySeq\.cancelWarm\(\);/, "clearMenuScreens stops the leftover plans before the countdown");
  const i = game.indexOf("function raceIntro(go)"), body = game.slice(i, game.indexOf("\n}\n", i));
  assert.ok(body.indexOf("FlybySeq.setDuration(loadingScreen.nextFlyMs())") < body.indexOf("FlybySeq.warm("), "the run's real length is set before its shots are planned");
});
