/* FRAMING MATH — tools/lib/frame-math.mjs
 *
 * tools/shot/frame-report.mjs judges a camera shot with no renderer: it
 * projects the world's scenery boxes, ray-casts a coarse frame and reports
 * what fills it. An agent acts on those numbers without ever seeing a
 * picture, so a sign error here (left/right, up/down, a box that is never
 * hit) would send it confidently the wrong way. These worlds are built by
 * hand so every answer is known exactly. Pure, no game VM, ~50 ms.
 */
import { test } from "node:test";
import assert from "node:assert";
import * as FM from "../../tools/lib/frame-math.mjs";

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b} (±${eps})`);

// A flat, road-less world at y = 0.
const flat = (boxes = [], range = 500) => ({
  boxes, range, maxGroundY: 0, groundAt: () => ({ y: 0, road: false, s: null }),
});
const box = (x, y, z, w, h, d, extra) => ({ x, y, z, w, h, d, kind: "building", id: 1, op: 1, ...extra });

test("projection: centre is centre, +right is screen right, behind is null", () => {
  // Looking down +Z from the origin, a right-handed Y-up camera's right is -X
  // (the same as M4.lookAt; frame-report was cross-checked against it to 1e-7).
  const cam = FM.makeCamera({ eye: [0, 0, 0], tgt: [0, 0, 10], fovDeg: 90, aspect: 1, near: 0.1 });
  const c = FM.project(cam, [0, 0, 10]);
  near(c.x, 0, 1e-9, "x"); near(c.y, 0, 1e-9, "y"); near(c.depth, 10, 1e-9, "depth");
  near(FM.project(cam, [-10, 0, 10]).x, 1, 1e-9, "a point 45 deg right sits on the right edge");
  near(FM.project(cam, [0, 10, 10]).y, 1, 1e-9, "a point 45 deg up sits on the top edge");
  assert.equal(FM.project(cam, [0, 0, -5]), null, "a point behind the lens has no screen position");
  // Aspect widens x only.
  const wide = FM.makeCamera({ eye: [0, 0, 0], tgt: [0, 0, 10], fovDeg: 90, aspect: 2, near: 0.1 });
  near(FM.project(wide, [-10, 0, 10]).x, 0.5, 1e-9, "twice the aspect halves the NDC of the same point");
  // rayDir is project's inverse.
  const d = FM.rayDir(cam, 0.3, -0.6), p = [d[0] * 50, d[1] * 50, d[2] * 50], q = FM.project(cam, p);
  near(q.x, 0.3, 1e-9, "rayDir→project x"); near(q.y, -0.6, 1e-9, "rayDir→project y");
});

test("ray vs box: entry distance, miss, inside, and a box laid along a rotated road", () => {
  const b = box(0, 0, 10, 2, 2, 2);
  near(FM.rayBox([0, 0, 0], [0, 0, 1], b), 9, 1e-9, "enters the near face");
  assert.equal(FM.rayBox([0, 0, 0], [0, 1, 0], b), Infinity, "a ray pointing away misses");
  assert.equal(FM.rayBox([0, 0, 0], [0, 0, -1], b), Infinity, "a box behind the ray is not hit");
  assert.equal(FM.rayBox([0, 0, 10], [1, 0, 0], b), 0, "from inside, the hit is immediate");
  // A 10 m x 0.5 m slab whose local X runs along world (1,1)/√2: a ray down
  // world +X from the origin meets it at the rotated face, not the AABB face.
  const r = Math.SQRT1_2;
  const slab = box(20, 0, 20, 0.5, 2, 10, { rot: [r, r] });
  const hit = FM.rayBox([0, 0, 20], [1, 0, 0], slab);
  near(hit, 20 - 0.25 * Math.SQRT2, 1e-6, "an oriented slab is hit at its own face");
  assert.ok(FM.insideBox([20, 0, 20], slab) && !FM.insideBox([23, 0, 20], slab), "insideBox honours rot");
});

test("a level camera splits sky and ground at the middle row, and the horizon says so", () => {
  const cam = FM.makeCamera({ eye: [0, 2, 0], tgt: [0, 2, 100], fovDeg: 40, aspect: 16 / 9 });
  near(FM.geomHorizon(cam), 0.5, 1e-9, "elevation 0 is mid-frame for a level camera");
  const fr = FM.castFrame(cam, flat([], 3000), null, 32, 16);
  const st = FM.frameStats(fr);
  // The eye is 2 m up, so the ground horizon dips a hair below mid-frame.
  near(st.skyPct, 50, 7, "half the frame is sky");
  near(st.groundPct, 50, 7, "half is ground");
  const h = FM.fitHorizon(st.skyline, 32, 16, 16 / 9);
  near(h.row, 0.5, 0.07, "the skyline sits mid-frame");
  near(h.tiltDeg, 0, 0.5, "and is level");
  // Pitched down 30 deg with a 40 deg lens: the horizon is above the frame.
  const down = FM.makeCamera({ eye: [0, 20, 0], tgt: [0, 20 - Math.tan(Math.PI / 6) * 100, 100], fovDeg: 40 });
  assert.ok(FM.geomHorizon(down) < 0, "looking 30 deg down through 40 deg, no horizon in frame");
});

test("a wall beside the lens fills the left third and is named as the nearest obstruction", () => {
  const cam = FM.makeCamera({ eye: [0, 3, 0], tgt: [0, 3, 100], fovDeg: 40, aspect: 16 / 9 });
  // Screen-left is world +X here (right = -X when looking down +Z).
  const wall = box(4, 5, 12, 1, 10, 6, { kind: "tree", id: 77 });
  const st = FM.frameStats(FM.castFrame(cam, flat([wall]), null, 48, 18));
  assert.ok(st.nearThirdsPct[0] > 50, `left third mostly the near wall (${st.nearThirdsPct[0]})`);
  assert.equal(st.nearThirdsPct[2], 0, "the right third is clear");
  assert.equal(st.nearest.kind, "tree");
  assert.equal(st.nearest.third, 0, "…and it is on the left");
  // Its nearest point is the inner edge of its front face, (3.5, _, 9).
  near(st.nearest.t, Math.hypot(3.5, 9), 0.6, "at the distance of its front face");
});

test("occlusion: opaque blocks, partial transmits, terrain crests block, the subject's own box does not", () => {
  const eye = [0, 2, 0], p = [0, 2, 50];
  const solid = box(0, 2, 20, 4, 4, 1);
  const half = box(0, 2, 30, 4, 4, 1, { op: 0.5, kind: "structure" });
  const own = box(0, 2, 50, 6, 6, 6, { subj: true });
  const scene = flat();
  assert.equal(FM.transmittance(eye, p, scene, [solid]).T, 0, "an opaque box hides it");
  near(FM.transmittance(eye, p, scene, [half]).T, 0.5, 1e-9, "a 50 % hull halves it");
  near(FM.transmittance(eye, p, scene, [own], (b) => b.subj).T, 1, 1e-9, "a subject is not hidden by itself");
  const by = FM.transmittance(eye, p, scene, [half, solid]).by.map((o) => o.b.kind);
  assert.deepEqual(by.sort(), ["building", "structure"], "every occluder on the line is named");
  const hill = { ...flat(), groundAt: (x, z) => ({ y: z > 20 && z < 30 ? 5 : 0, road: false }) };
  assert.equal(FM.transmittance(eye, p, hill, []).T, 0, "a crest between eye and subject hides it");
});

test("subject geometry: centred, on a power point, clipped at an edge", () => {
  const cam = FM.makeCamera({ eye: [0, 0, 0], tgt: [0, 0, 10], fovDeg: 90, aspect: 1, near: 0.1 });
  const centred = FM.subjectGeometry(cam, [[1, 1, 10], [-1, -1, 10], [1, -1, 10], [-1, 1, 10]]);
  near(centred.centreDist, 0, 1e-9, "centred subject");
  assert.deepEqual(centred.clipped, [], "fully in frame");
  near(centred.bboxPct, 1, 1e-9, "a 2 x 2 m subject 10 m away through 90 deg covers 1 % of the frame");
  near(FM.thirdsDistance(-1 / 3, 1 / 3), 0, 1e-12, "the upper-left power point");
  near(FM.thirdsDistance(0, 0), Math.hypot(1 / 6, 1 / 6), 1e-12, "dead centre is 1/6 diagonal off every power point");
  const off = FM.subjectGeometry(cam, [[-5, 0, 10], [-15, 0, 10]]);
  assert.deepEqual(off.clipped, ["right"], "a subject running off the right edge says so");
  near(off.inFramePct, 50, 1e-9, "half its points are in frame");
});

test("motion: pan rate, parallax, and zoom from two poses", () => {
  const a = FM.makeCamera({ eye: [0, 0, 0], tgt: [0, 0, 10], fovDeg: 40 });
  const b = FM.makeCamera({ eye: [0, 0, 0], tgt: [10, 0, 0], fovDeg: 44 });
  const m = FM.motion(a, b, 2);
  near(m.panDps, 45, 1e-9, "90 deg in 2 s");
  near(m.zoomDps, 2, 1e-9, "4 deg of FOV in 2 s");
  const c = FM.makeCamera({ eye: [1, 0, 0], tgt: [1, 0, 10], fovDeg: 40 });
  near(FM.motion(a, c, 1).parallaxDps, (1 / Math.hypot(0, 0, 10)) * FM.DEG, 1e-9, "1 m/s at 10 m is 5.7 deg/s of parallax");
});

test("judge: the flags an agent acts on fire on their defects and stay quiet on a clean frame", () => {
  const clean = {
    eye: { insideProp: null, belowGround: false, pitchDeg: -5, tgtDistM: 60 },
    subject: { kind: "corner", coverPct: 20, inFramePct: 90, visiblePct: 95, occluders: [], thirdsDist: 0.05, centreDist: 0.2 },
    nearThirdsPct: [0, 0, 5], skyPct: 20, groundPct: 30, horizon: { geomRowFrac: 0.35 },
    motion: { panDps: 5, parallaxDps: 4, cut: false },
  };
  const ok = FM.judge(clean);
  assert.deepEqual(ok.flags, []);
  assert.ok(ok.score >= 90, `a clean frame scores high (${ok.score})`);
  const bad = FM.judge({
    ...clean, eye: { insideProp: "stonePine/canopy", belowGround: false, pitchDeg: -40, tgtDistM: 9 },
    subject: { ...clean.subject, coverPct: 1, visiblePct: 20, occluders: [{ kind: "grandstand" }] },
    nearThirdsPct: [80, 0, 0], horizon: { geomRowFrac: -0.4 }, motion: { panDps: 120, parallaxDps: 90, cut: false },
  });
  for (const f of ["EYE_INSIDE:stonePine/canopy", "SUBJECT_SMALL", "SUBJECT_OCCLUDED", "NEAR_OBSTRUCTION_LEFT",
                   "STEEP_DOWN", "AIM_TOO_CLOSE", "FAST_PAN", "FAST_MOVE"]) {
    assert.ok(bad.flags.some((x) => x.startsWith(f)), `${f} fires: ${bad.flags.join(" ")}`);
  }
  assert.ok(bad.score < 20, `and the score collapses (${bad.score})`);
  assert.ok(!FM.judge({ ...clean, motion: { panDps: 300, parallaxDps: 300, cut: true } }).flags.length,
    "the first frame of a shot is a cut, not a whip pan");
});

test("thumbnail: dimensions, subject priority, and uppercase for the near field", () => {
  const cam = FM.makeCamera({ eye: [0, 3, 0], tgt: [0, 3, 100], fovDeg: 40, aspect: 2 });
  const subjBox = box(0, 3, 60, 8, 6, 2, { subj: true });
  const nearTree = box(5, 5, 12, 1.5, 10, 6, { kind: "tree", id: 9 });
  const fr = FM.castFrame(cam, flat([subjBox, nearTree]), null, 48, 24);
  const lines = FM.asciiThumb(fr, 24, 8);
  assert.equal(lines.length, 8);
  assert.ok(lines.every((l) => l.length === 24));
  const all = lines.join("\n");
  assert.ok(all.includes("@"), "the subject shows as @\n" + all);
  assert.ok(all.includes("T"), "a tree inside 30 m is uppercase\n" + all);
  assert.ok(lines.every((l) => l.lastIndexOf("T") < 8), "…and it is in the left third (screen-left is +X here)\n" + all);
});
