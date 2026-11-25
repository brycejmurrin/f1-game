/* scenery-origin-delta-pin.test.mjs — characterization pin for the Gardener carves
 * #6497 (one reader, TrackSpace.sceneryOriginDelta, at the engine's inline
 * `def._sceneryShift || 0` sites: mesh.js bankingProfile, surface.js bridge
 * carve, tracks.js bridges/elevations, build-props.js bridge pillars).
 *
 * The carve is only behaviour-preserving if the reader returns exactly what the
 * inline idiom did for every BUILT def (buildCenterline stashes _sceneryShift).
 * The two forms differ only for a null/undefined def (the reader returns 0, the
 * inline form throws); every carved site dereferences `def` before that read,
 * so the difference is unreachable there. Full-build byte identity (centreline,
 * bank lift, surface ground and every *Geo pos buffer on suzuka, zandvoort,
 * monaco, singapore, spa, imola) was measured before/after in the PR.
 * Run: node --test tests/unit/scenery-origin-delta-pin.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import trackBuild from "../../tools/lib/track-build-vm.cjs";

const env = trackBuild.buildContext({});
const TrackSpace = vm.runInContext("TrackSpace", env.sandbox);

test("sceneryOriginDelta equals the inline `_sceneryShift || 0` on every built circuit", () => {
  let shifted = 0;
  for (const def of env.Tracks.LIST) {
    env.Tracks.buildCenterline(def, { line: false });
    const inline = def._sceneryShift || 0;
    assert.ok(Object.is(TrackSpace.sceneryOriginDelta(def), inline), `${def.id}: ${TrackSpace.sceneryOriginDelta(def)} vs ${inline}`);
    if (inline) shifted++;
  }
  assert.ok(shifted >= 10, `the pin covers shifted circuits (${shifted})`);
});

test("sceneryOriginDelta: 0 for a def without a shift, and for a missing def", () => {
  assert.ok(Object.is(TrackSpace.sceneryOriginDelta({}), 0));
  assert.ok(Object.is(TrackSpace.sceneryOriginDelta({ _sceneryShift: 0 }), 0));
  assert.ok(Object.is(TrackSpace.sceneryOriginDelta({ _sceneryShift: NaN }), 0));
  assert.ok(Object.is(TrackSpace.sceneryOriginDelta(null), 0));
  assert.ok(Object.is(TrackSpace.sceneryOriginDelta(undefined), 0));
});
