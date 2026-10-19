/* cam-motion.test.mjs — each camera's live motion has its own signature. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCamMotion } from "../../tools/shot/cam-motion.mjs";
import { loadRig, makeTrack, BEND } from "../helpers/camera-rig.mjs";

// checkCamMotion() solves every mode on a STRAIGHT road with the corner knobs
// zeroed: it owns speed-open, braking and slide signatures, not corners.
test("on a straight, each camera moves differently through speed, a brake, and a slide", () => {
  const r = checkCamMotion();
  assert.equal(r.ok, true, r.failures.join("\n"));
  assert.equal(r.rows.length, 18);
});

// The corner half: the same chase rig on a curved road (shared fixture) with
// the shipped corner lead. The aim must swing into the bend, to the side the
// bend turns, and sit centred on the straights.
function chaseAimLat(rig, track, s, lead) {
  const sm = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  rig.ctx.Tracks.sample(track, s, sm);
  rig.ctx.CamTune.cornerLead = () => lead;   // null = the rig's shipped default
  rig.feel.resetFollow();
  const v = rig.cams.vantage(track, "chase", s, 0, 60, 0, { snap: true, att: {}, carPos: [sm.p[0], sm.p[2]], carHead: Math.atan2(sm.t[0], sm.t[2]) });
  return (v.tgt[0] - sm.p[0]) * sm.r[0] + (v.tgt[2] - sm.p[2]) * sm.r[2];
}

test("chase corner lead swings the aim into a bend, left bend one way, right the other, none on a straight", () => {
  const rig = loadRig(), track = makeTrack(BEND);
  const K = (s) => rig.ctx.Tracks.curvature(track, s);
  const left = 480, right = 1000, straight = 700;
  assert.ok(K(left) > 0.01 && K(right) < -0.01 && Math.abs(K(straight)) < 1e-9, "fixture: left bend, right bend, straight");
  const swing = (s) => chaseAimLat(rig, track, s, null) - chaseAimLat(rig, track, s, 0);
  assert.ok(swing(left) < -0.1, `left bend aims left, got ${swing(left).toFixed(3)} m`);
  assert.ok(swing(right) > 0.1, `right bend aims right, got ${swing(right).toFixed(3)} m`);
  assert.ok(Math.abs(swing(straight)) < 0.02, `straight stays centred, got ${swing(straight).toFixed(3)} m`);
});
