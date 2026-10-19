/* FLYBY AUDIT RULES — negative control (test review #2952 R1-11).
 *
 * The fleet audit (tools/lib/flyby-audit.cjs measures, tests/helpers/
 * flyby-audit-rules.mjs judges) is asserted clean on every circuit, but it had
 * never been shown to FAIL: a measurement that silently returned zeros would
 * pass forever. These feed auditTrack a stub sequencer that commits each
 * defect the rules name, then hold that fleetFindings reports one finding per
 * rule, and none for a smooth, grounded, on-road shot. No VM, no browser.
 */
import { test } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { fleetFindings, variedFindings } from "../helpers/flyby-audit-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { auditTrack } = createRequire(import.meta.url)(path.join(ROOT, "tools/lib/flyby-audit.cjs"));

// A flat world at y = 0 with a 10 m half-width road along +x; the sequencer is
// `solve(track, u)` returning whatever the case scripts.
function stubSandbox(solve, shots) {
  return {
    FlybySeq: {
      DEFAULT: shots || [{ eye: [{}, {}], tgt: [{}, {}] }],
      reset() {},
      solve: (track, u) => solve(u),
      onRoadPose: () => false,
      insideProp: (track, eye) => eye[1] === INSIDE_Y,
    },
    Tracks: {
      terrainY: () => 0,
      project: (track, x, z) => ({ s: 0, lat: z }),
      sample: (track, s, smp) => { smp.p = [0, 0, 0]; smp.hw = 10; },
    },
  };
}
const INSIDE_Y = 77;           // the stub's marker: an eye at this height is inside a prop
const audit = (solve, id = "x", shots) =>
  fleetFindings("stub", auditTrack(stubSandbox(solve, shots), {}, { samples: 400 }));
const rule = (f, re) => f.filter((s) => re.test(s));

// Eye 50 m up, looking along +x: the clean baseline every case perturbs.
const calm = (u, over) => Object.assign({ id: "calm", index: 0, cut: false, lift: 0,
  eye: [u * 100, 50, 0], tgt: [u * 100 + 100, 50, 0] }, over);

test("a smooth, grounded shot yields no findings (the control's control)", () => {
  assert.deepEqual(audit((u) => calm(u)), []);
});

test("a vertical pop between two samples is reported as a jump", () => {
  const f = audit((u) => calm(u, { eye: [u * 100, u < 0.5 ? 50 : 60, 0], tgt: [u * 100 + 100, 50, 0] }));
  assert.equal(rule(f, /eye jumps/).length, 1, f.join("\n"));
});

test("a crane-high planned lift is reported", () => {
  const f = audit((u) => calm(u, { lift: 30 }));
  assert.equal(rule(f, /lifted 30\.0 m/).length, 1, f.join("\n"));
});

test("an eye below the ground is reported as underground", () => {
  const f = audit((u) => calm(u, { eye: [u * 100, -3, 0] }));
  assert.equal(rule(f, /m underground/).length, 1, f.join("\n"));
});

test("a grid shot looking across the infield is reported as a sightline off the road", () => {
  const f = audit((u) => calm(u, { id: "grid-walk", eye: [0, 50, 0], tgt: [0, 50, 100] }));
  assert.equal(rule(f, /sightline/).length, 1, f.join("\n"));
});

test("a whip pan faster than 45 deg/s is reported; a 25 deg/s pan (the planner's PAN_MAX) is not", () => {
  // dt between samples = FLY_MS / 1000 / 400 = 0.06 s, so deg/s = deg per step / 0.06.
  const yaw = (deg) => [Math.cos(deg * Math.PI / 180) * 100, 50, Math.sin(deg * Math.PI / 180) * 100];
  const sweep = (degPerStep) => (u) => calm(u, { eye: [0, 50, 0], tgt: yaw(Math.round(u * 400) * degPerStep) });
  assert.equal(rule(audit(sweep(4)), /pans/).length, 1, "4 deg per 60 ms is 67 deg/s: a yank");
  assert.deepEqual(rule(audit(sweep(1.5)), /pans/), [], "1.5 deg per 60 ms is 25 deg/s: inside the rule");
});

test("an eye inside a solid prop is reported", () => {
  const f = audit((u) => calm(u, { eye: [u * 100, INSIDE_Y, 0] }));
  assert.equal(rule(f, /inside a solid prop/).length, 1, f.join("\n"));
});

test("the varied-load rules report the same defects, with the seed in the message", () => {
  const rows = auditTrack(stubSandbox((u) => calm(u, { lift: 30, eye: [u * 100, -3, 0] })), {}, { samples: 200 });
  const f = variedFindings("stub", 3, rows);
  assert.ok(f.some((s) => /stub#3 calm: underground/.test(s)) && f.some((s) => /lifted 30\.0 m/.test(s)), f.join("\n"));
});
