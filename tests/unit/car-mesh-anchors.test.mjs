// Car bodywork graphics stay ON the surfaces they are painted on.
//
// This is the NODE gate for assertions that tests/specs/parts-physics.spec.js
// also makes in a browser. It exists because the browser group is not in the
// deploy gate: pages.yml -> ci.yml runs `test:smoke` (smoke.spec.js only) plus
// the unit suites, so a red parts assertion ships silently. It did. The
// front-wing flap check sat red on the deploy tip through five consecutive green
// Pages runs, because `0.92` was the previous front-wing span constant and was
// left behind when the wing was narrowed to FW_SPAN 0.715 — and nothing in CI
// ever ran the assertion that would have said so.
//
// Adding the 166-test browser group to CI would cost every deploy ~20 minutes of
// serialized SwiftShader. It is not needed: these assertions read MESH ARRAYS,
// and loadParts() already runs js/car/car3d.js in a node vm with no browser at
// all. Measured while porting — the node context reproduces the browser numbers
// exactly, not approximately: 144 accent flank vertices in node against 144
// measured in Chromium, and the same decal gaps to four decimal places.
//
// The browser spec stays as the broader sweep (it covers catalog structure,
// material streams, triangle budgets and the render-mode matrix). This file is
// only the part that must never regress unnoticed.
import test from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
// The ROUNDED car, as the game builds it by default (CarShade on): its anchors
// carry the coke-bottle cover and the downwash ramp (bodyAnchors(.., true)).
const S = loadParts({ shade: true });
const ACCENT = [0.123, 0.456, 0.789];   // sentinel livery accent, as in the spec
const DRL = [2.4, 2.4, 2.7];            // drlC in js/car/car3d.js — nose running lights

function verticesFor(mesh, color) {
  const points = [];
  for (let i = 0; i < mesh.pos.length; i += 3) {
    if (mesh.col[i] === color[0] && mesh.col[i + 1] === color[1] && mesh.col[i + 2] === color[2]) {
      points.push([mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]]);
    }
  }
  return points;
}

// The two extreme engine recipes the spec uses: every bodywork knob pushed to
// one end of its range and then the other, so a graphic that only tracks its
// anchor near the default is caught.
const BASE = { in: 1, inlet: 1, outlet: 1, podWidth: 1, shoulderHeight: 1,
               undercut: 1, coke: 1, tailWidth: 1, coverHeight: 1 };
const ENGINES = [
  { ...BASE, podWidth: 0.72, shoulderHeight: 0.76, undercut: 1.38,
    coke: 1.38, tailWidth: 0.70, coverHeight: 0.78 },
  { ...BASE, podWidth: 1.28, shoulderHeight: 1.28, undercut: 0.72,
    coke: 0.72, tailWidth: 1.30, coverHeight: 1.28 },
];

// `round`: which anchors to score against. The flat car against its own; the
// rounded car against ITS own (true) and against the FLAT ones (false) — the
// latter is exactly what tests/specs/parts-physics.spec.js does in a browser
// (Car3D.bodyAnchors(parts) beside a default, rounded, build), and it holds only
// because the downwash ramp starts at z -0.38, aft of every graphic it scores.
const VARIANTS = [["flat car", M, false], ["rounded car", S, true], ["rounded car vs flat anchors (the browser spec)", S, false]];
for (const [label, X, round] of VARIANTS) test(`sidepod and nose graphics stay attached across extreme engine recipes — ${label}`, () => {
  for (const engine of ENGINES) {
    const parts = { engine: 1, ers: 2, _visual: {
      engine, ers: { id: "probe", tier: 2, led: [0.31, 1.71, 2.31], pack: 1.2 },
    } };
    const mesh = X.Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1],
      { noWheels: true, livery: { accent: ACCENT }, parts });
    const anchors = X.Car3D.bodyAnchors(parts, undefined, undefined, round);
    const decals = X.CarMesh.carDecalData(2, parts);

    const podDecals = [], noseDecals = [];
    for (let i = 0; i < decals.pos.length; i += 3) {
      const p = [decals.pos[i], decals.pos[i + 1], decals.pos[i + 2]];
      if (Math.abs(p[0]) > 0.35 && p[2] > -0.40 && p[2] < 0.50) podDecals.push(p);
      if (Math.abs(p[0]) < 0.30 && p[2] > 1.10 && p[2] < 2.20) noseDecals.push(p);
    }
    // The |x| > 0.35 guard is REQUIRED, not decorative: the T-camera pod is
    // accent-coloured and sits on the centreline (|x| 0.041-0.059) inside this
    // same z band, and without it those vertices are scored against a sidepod
    // anchor 0.8 m away.
    const accentPod = verticesFor(mesh, ACCENT)
      .filter((p) => p[2] < 0.5 && p[2] > -0.5 && Math.abs(p[0]) > 0.35);
    const drls = verticesFor(mesh, DRL);

    const podGap = (p) => Math.abs(Math.abs(p[0]) - anchors.podAt(p[2]).x);
    const noseGap = (p) => Math.abs(p[1] - anchors.noseAt(p[2]).top);

    // Counts first. Math.max() of an empty array is -Infinity, which slides
    // under every upper bound below — that is exactly how the DRL assertion in
    // the browser spec passed for months while nothing emitted its colour.
    assert.ok(podDecals.length > 0, "no sidepod decals found");
    assert.ok(noseDecals.length > 0, "no nose decals found");
    assert.ok(accentPod.length > 0, "no accent vertices on the pod flank");
    assert.ok(drls.length > 0, "no nose running-light vertices found");

    const max = (xs) => Math.max(...xs);
    assert.ok(podDecals.every((p) => {
      const a = anchors.podAt(p[2]);
      return p[1] >= a.bottom - 0.02 && p[1] <= a.top + 0.02;
    }), "a sidepod decal sits outside the pod's vertical bounds");
    assert.ok(max(podDecals.map(podGap)) < 0.035,
      `pod decal gap ${max(podDecals.map(podGap))}`);
    assert.ok(max(noseDecals.map(noseGap)) < 0.025,
      `nose decal gap ${max(noseDecals.map(noseGap))}`);
    assert.ok(max(accentPod.map(podGap)) < 0.04,
      `accent pod gap ${max(accentPod.map(podGap))}`);
    assert.ok(max(drls.map((p) => Math.min(
      Math.abs(p[1] - anchors.noseAt(p[2]).top),
      Math.abs(Math.abs(p[0]) - anchors.noseAt(p[2]).side)))) < 0.04,
      "a nose running light has drifted off the nose surface");
  }
});

test("every front-wing top flap reaches its endplates after taper and tip rise", () => {
  // Mirrors frontCascade() minus the mainplane.
  const elements = [
    [2.50, 0.092, 2.24, 0.146, 0.98, 0.020],
    [2.34, 0.148, 2.10, 0.212, 0.95, 0.018],
    [2.20, 0.200, 1.98, 0.272, 0.92, 0.016],
    [2.08, 0.256, 1.88, 0.328, 0.88, 0.014],
  ];
  // frontHalf() in js/car/car3d.js is FW_SPAN * the fraction below. Restated
  // here on purpose, as car-front-wing-width.test.mjs restates the tyre face: if
  // someone re-spans the wing, this should fail until they re-read the flap tips
  // against it. The previous constant, 0.92, is what went stale when the wing was
  // narrowed for standing 95 mm proud of a 1.90 m car.
  const FW_SPAN = 0.715;
  const aero = M.Parts.CATALOG.find((category) => category.id === "aero");
  assert.ok(aero && aero.options.length >= 20,
    "expected the full aero catalog, got " + (aero ? aero.options.length : 0));

  const detached = [];
  for (const option of aero.options) {
    const style = option.visual, level = style.lvl;
    const topIndex = level >= 4 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;
    const element = elements[topIndex], planformIndex = topIndex + 1;
    const span = level <= 0 ? 0.74 : level === 1 ? 0.88 : 1;
    const endplateX = FW_SPAN * span + 0.03;
    const expectedY = element[3] + style.frontRise * (0.65 + planformIndex * 0.12);
    const expectedZ = element[2] - style.frontSweep * (0.75 + planformIndex * 0.10);
    // buildComplete, not build: the top elements are ACTIVE AERO and are drawn
    // separately so they can rotate. buildComplete merges them at their CLOSED
    // pose, which is vertex-for-vertex the wing this assertion was written for.
    const mesh = M.Car3D.buildComplete([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
      noWheels: true, parts: { aero: 1, _visual: { aero: style } },
    });
    let maxX = 0, hits = 0;
    for (let i = 0; i < mesh.pos.length; i += 3) {
      if (Math.abs(mesh.pos[i + 1] - expectedY) > 1e-5
        || Math.abs(mesh.pos[i + 2] - expectedZ) > 1e-5) continue;
      maxX = Math.max(maxX, Math.abs(mesh.pos[i]));
      hits++;
    }
    if (!hits) detached.push(`${option.id}:no-tip-vertices`);
    else if (maxX < endplateX - 0.005) detached.push(`${option.id}:${maxX.toFixed(3)}`);
  }
  assert.deepEqual(detached, []);
});

test("T-camera bar and LED ride the same snorkel-aware pod datum", () => {
  // The housing lives in part("engineCover") at podY/podZ. The horizontal T bar
  // and green LED used to be literals at y 0.955 / 0.988 in part("helmet"), so
  // every snorkel engine (most of the 2026 factory grid) left a second camera
  // wing ~15 cm under the real pod. Bodywork, not driver: the bar must track
  // the pod whether or not a helmet is in the mesh.
  const ACC = [0.123, 0.456, 0.789];
  const LED = [0.12, 0.75, 0.28];
  const DARK = [0.05, 0.05, 0.05];
  const engines = [
    { id: "snorkel", visual: { in: 1.3, snork: 1, twin: 1, inlet: 2, outlet: 2,
      podWidth: 1, shoulderHeight: 1.08, undercut: 1.08, coke: 1.06,
      tailWidth: 0.96, coverHeight: 1 } },
    { id: "chimney", visual: { in: 1.22, snork: 0, twin: 0, inlet: 2, outlet: 2,
      podWidth: 1.03, shoulderHeight: 1.05, undercut: 0.97, coke: 1.05,
      tailWidth: 1.01, coverHeight: 1.06, chimney: 3 } },
  ];
  const midY = (pts) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }
    return (lo + hi) / 2;
  };
  for (const engine of engines) {
    for (const noDriver of [false, true]) {
      const mesh = S.Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
        noWheels: true, noDriver,
        livery: { accent: ACC, tcam: "accent" },
        parts: { engine: 1, _visual: { engine: engine.visual } },
      });
      const pod = verticesFor(mesh, ACC)
        .filter((p) => Math.abs(p[0]) < 0.08 && p[2] > -0.50 && p[2] < -0.10);
      const led = verticesFor(mesh, LED)
        .filter((p) => Math.abs(p[0]) < 0.05 && p[2] > -0.50 && p[2] < -0.10);
      const bar = verticesFor(mesh, DARK)
        .filter((p) => Math.abs(p[0]) > 0.10 && Math.abs(p[0]) < 0.16
          && p[2] > -0.45 && p[2] < -0.15 && p[1] > 0.85 && p[1] < 1.25);
      assert.ok(pod.length > 0, `${engine.id}: no T-cam pod housing`);
      assert.ok(led.length > 0, `${engine.id} noDriver=${noDriver}: no T-cam LED`);
      assert.ok(bar.length > 0, `${engine.id} noDriver=${noDriver}: no T-cam bar`);
      const podY = midY(pod), ledY = midY(led), barY = midY(bar);
      assert.ok(Math.abs(barY - podY) < 0.04,
        `${engine.id}: T-bar y ${barY.toFixed(3)} vs pod y ${podY.toFixed(3)}`);
      assert.ok(Math.abs(ledY - podY) < 0.05,
        `${engine.id}: T-cam LED y ${ledY.toFixed(3)} vs pod y ${podY.toFixed(3)}`);
    }
  }
});

test("fuel filler rides the engine-cover skin across coverHeight", () => {
  // Collar/cap used to be literals at y 0.828/0.85. The tank breather next to
  // them already uses coverSurfaceY; the filler did not, so a short cover left
  // the cap floating (~13 cm on coverHeight 0.78) and a tall cover buried it.
  const CAP = [0.91, 0.22, 0.88];
  const midY = (pts) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }
    return (lo + hi) / 2;
  };
  for (const coverHeight of [0.78, 1.0, 1.28]) {
    const parts = {
      engine: 1, fuel: 1,
      _visual: {
        engine: { ...BASE, coverHeight },
        fuel: { cap: CAP, filler: 1, hatch: 0, vent: 0, breather: 0, line: 0 },
      },
    };
    const mesh = S.Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
      noWheels: true, parts,
    });
    const anchors = S.Car3D.bodyAnchors(parts, undefined, undefined, true);
    const coverY = S.Car3D.coverSurfaceY(anchors.coverAt(-0.50), 0.12);
    const cap = verticesFor(mesh, CAP)
      .filter((p) => Math.abs(p[0] - 0.12) < 0.06 && Math.abs(p[2] + 0.50) < 0.10);
    assert.ok(cap.length > 0, `coverHeight ${coverHeight}: no fuel-filler cap`);
    const capY = midY(cap);
    // Proud of the skin by a collar/cap stack, not floating or buried.
    assert.ok(Math.abs(capY - coverY) < 0.08,
      `coverHeight ${coverHeight}: fuel cap y ${capY.toFixed(3)} vs cover y ${coverY.toFixed(3)}`);
  }
});

test("functionalEmissive stays reserved for the FIA rain light", () => {
  // The nose running lights are SURFACES.glass for this reason: id 25 is both
  // `emissive` and `functionalEmissive`, and the rain light owns it. A decorative
  // lamp that grabbed it would read to the renderer as the regulation light.
  const brakes = M.Parts.CATALOG.find((category) => category.id === "brakes");
  const offenders = [];
  for (const option of brakes.options) {
    const mesh = M.Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
      noWheels: true, parts: { brakes: 1, _visual: { brakes: option.visual } },
    });
    for (let i = 0; i < mesh.mat.length; i++) {
      if (mesh.mat[i] !== M.Car3D.SURFACES.functionalEmissive) continue;
      const x = mesh.pos[i * 3], y = mesh.pos[i * 3 + 1], z = mesh.pos[i * 3 + 2];
      if (!(Math.abs(x) <= 0.07 && y >= 0.39 && y <= 0.61 && z <= -2.50)) {
        offenders.push([option.id, x, y, z]);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
