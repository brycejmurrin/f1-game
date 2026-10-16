// The flyby FLEET AUDIT's rules over tools/lib/flyby-audit.cjs rows — one
// definition for the two files that apply them: tests/unit/flyby-shots.test.mjs
// (one circuit, in the edit loop) and tests/unit/flyby-fleet.test.mjs (every
// circuit the 2026-09-24 audit named, in test:node-slow). Same thresholds in
// both, because it is the same function.

/** The DEFAULT sequence at 400 samples: every rule the fleet audit holds. */
export function fleetFindings(id, rows) {
  const out = [];
  for (const r of rows) {
    // 4 m between two of 400 samples (60 ms) is a visible pop.
    if (r.jump > 4) out.push(`${id} ${r.id}: eye jumps ${r.jump.toFixed(1)} m in one step at u=${r.jumpU.toFixed(3)}`);
    // A planned lift is a raised camera; 25 m is a crane over a roof.
    if (r.lift >= 25) out.push(`${id} ${r.id}: lifted ${r.lift.toFixed(1)} m at u=${r.liftU.toFixed(3)}`);
    if (r.under > 0) out.push(`${id} ${r.id}: eye ${r.under.toFixed(1)} m underground at u=${r.underU.toFixed(3)}`);
    // The grid shots' sightline: within 2 m of the road edge (a verge, not the infield).
    if (r.gridOff > 2) out.push(`${id} ${r.id}: sightline ${r.gridOff.toFixed(1)} m past the road edge at u=${r.gridU.toFixed(3)}`);
    // 45 deg/s at FLY_MS 24 s: faster reads as the camera being yanked.
    if (r.pan > 45) out.push(`${id} ${r.id}: pans ${r.pan.toFixed(0)} deg/s at u=${r.panU.toFixed(3)}`);
    if (r.inside) out.push(`${id} ${r.id}: eye inside a solid prop on ${r.inside} samples`);
  }
  return out;
}

/** A vary()'d sequence at 200 samples: the rules a varied load must hold too. */
export function variedFindings(id, seed, rows) {
  const out = [];
  for (const r of rows) {
    if (r.under > 0) out.push(`${id}#${seed} ${r.id}: underground`);
    if (r.inside) out.push(`${id}#${seed} ${r.id}: inside a solid prop on ${r.inside} samples`);
    if (r.lift >= 25) out.push(`${id}#${seed} ${r.id}: lifted ${r.lift.toFixed(1)} m`);
    if (r.pan > 45) out.push(`${id}#${seed} ${r.id}: pans ${r.pan.toFixed(0)} deg/s`);
  }
  return out;
}

/** Seeds 0-5 of vary() on one built track, through the rules above. */
export function variedAudit(auditTrack, sandbox, id, track) {
  const F = sandbox.FlybySeq, out = [];
  for (let seed = 0; seed < 6; seed++) {
    out.push(...variedFindings(id, seed, auditTrack(sandbox, track, { samples: 200, shots: F.vary(F.DEFAULT, seed) })));
  }
  return out;
}

/** The circuits the fleet audit covers: an open, a street and a night circuit,
 *  then every one that failed a rule before it was fixed — Sochi's crane and
 *  kink, Las Vegas's and Madrid's landmark overshoot, Jeddah's and
 *  Magny-Cours's bent grids, Red Bull Ring's valley tower, Mont-Tremblant's
 *  pine wood and kink, Kyalami's single landmark, Buenos Aires's gantry. */
export const FLEET = ["monza", "monaco", "bahrain", "sochi", "vegas", "madrid", "jeddah",
  "redbull", "mont_tremblant", "magny_cours", "kyalami", "buenos_aires"];
/** The circuits the varied-load audit covers. */
export const VARIED = ["monza", "monaco", "mont_tremblant"];
