/* bump-window-pin.test.mjs — characterization pin for Gardener carve #6498.
 * TrackSpace.bumpWindow replaced three hand-copied cosine windows (tracks.js
 * bridges and elevations, sign +1; TrackSurface.profile's bridge carve, sign -1).
 * The helper must write bit-for-bit what the old inline loops wrote, on the
 * Float32Arrays the build uses, including the wrap-around distance and a frac
 * outside [0, 1). The old loop is reproduced verbatim below as the reference.
 * Whole-build byte identity (all 52 circuits: centreline, bank, surface ground,
 * every *Geo pos buffer) was measured before/after in the PR.
 * Run: node --test tests/unit/bump-window-pin.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import trackBuild from "../../tools/lib/track-build-vm.cjs";

const env = trackBuild.buildContext({});
const TrackSpace = vm.runInContext("TrackSpace", env.sandbox);

// The pre-carve loop (tracks.js bridges/elevations; surface.js used `-=`).
function reference(arr, s, halfM, rise, ds, total, sign) {
  const cs = TrackSpace.wrap01(s) * total;
  for (let k = 0; k < arr.length; k++) {
    let d = Math.abs(k * ds - cs);
    d = Math.min(d, total - d);
    if (d < halfM) {
      if (sign > 0) arr[k] += rise * 0.5 * (1 + Math.cos(Math.PI * d / halfM));
      else arr[k] -= rise * 0.5 * (1 + Math.cos(Math.PI * d / halfM));
    }
  }
}

let seed = 6498;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);

test("bumpWindow writes bit-identical Float32 output to the old inline loop, both signs", () => {
  for (let trial = 0; trial < 400; trial++) {
    const total = 2000 + rnd() * 6000;
    const n = Math.max(200, Math.round(total / 4));
    const ds = total / n;
    const base = new Float32Array(n).map(() => (rnd() - 0.5) * 40);
    const s = trial % 7 === 0 ? (rnd() < 0.5 ? -rnd() : 1 + rnd()) : (trial % 5 === 0 ? 0.999 + rnd() * 0.001 : rnd());
    const halfM = 5 + rnd() * 400, rise = (rnd() - 0.3) * 15;
    for (const sign of [1, -1]) {
      const a = new Float32Array(base), b = new Float32Array(base);
      reference(a, s, halfM, rise, ds, total, sign);
      TrackSpace.bumpWindow(b, s, halfM, rise, ds, total, sign);
      assert.deepEqual(Buffer.from(b.buffer), Buffer.from(a.buffer), `trial ${trial} sign ${sign}`);
    }
  }
});
