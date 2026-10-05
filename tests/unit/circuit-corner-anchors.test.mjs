// FIA event maps number physical bends, not every detected curvature peak.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Tracks = require("../../tools/track/verify-track.cjs").buildContext();

function circuit(id) {
  const def = Tracks.LIST.find(d => d.id === id);
  const track = Tracks.buildCenterline(def, { line: false });
  const corner = number => {
    const fraction = def.turns[number - 1], k = Math.round(fraction * track.n) % track.n;
    return { fraction, x: track.px[k], z: track.pz[k], curvature: track.curv[k] };
  };
  return { def, track, corner };
}

test("Imola timing anchors occupy physical Tosa and first Variante Alta bends", () => {
  // FIA 2025 Doc4/mapv3 (15 May): T7=Tosa, T14=first Alta right.
  // Spatial gates encompass the independently identified map shapes and
  // permit ordinary spline refinement; old T14 .5999 lies on the approach.
  const { def, track, corner } = circuit("imola");
  const tosa = corner(7), alta = corner(14), following = corner(15);
  assert.equal(def.turns.length, 19);
  assert.ok(Math.hypot(tosa.x - 835, tosa.z + 464) < 45 && tosa.curvature > .01);
  assert.ok(Math.hypot(alta.x + 355, alta.z + 18) < 25 && alta.curvature < -.01);
  assert.ok(following.curvature > .01 && following.fraction > alta.fraction);
  assert.ok(Math.abs((tosa.fraction - def.sectors[0]) * track.total - 115) < .01);
  assert.ok(Math.abs((alta.fraction - def.sectors[1]) * track.total - 190) < .01);
  assert.ok(corner(8).fraction > .42 && corner(8).curvature < 0,
    "T8 is the uphill right, not another peak within Tosa");
});

test("Hungaroring names its chicane and physical T5 exit consistently", () => {
  // FIA 2025 Hungarian event map: T4 left, T5 right, T6/T7 right/left,
  // T10 left. The old list doubled T2 and T14, omitting T7 and T10.
  const { def, corner } = circuit("hungaroring");
  assert.equal(def.turns.length, 14);
  assert.ok(corner(4).curvature > .01);
  assert.ok(corner(5).fraction > .40 && corner(5).fraction < .46 && corner(5).curvature < -.01);
  assert.ok(corner(6).curvature < -.01 && corner(7).curvature > .01);
  assert.ok(corner(10).fraction > .60 && corner(10).fraction < .63 && corner(10).curvature > .01);
  for (let i = 1; i < def.turns.length; i++) assert.ok(def.turns[i] > def.turns[i - 1]);
});
