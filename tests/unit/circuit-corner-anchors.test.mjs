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

test("Monaco bank zones peak on Massenet and Mirabeau, not Ste Devote", () => {
  // As fracs 0.1286 / 0.2961 the _sceneryShift (~0.938) compensation centred
  // the "Massenet" zone on T1 Ste Devote and the "Mirabeau" zone on T4.
  // Turn anchors: T3 = Massenet's first apex (long left, +k), T7 = Mirabeau
  // Haute (right, -k). Reads the BUILT banking profile, not the def.
  const { def, track, corner } = circuit("monaco");
  const { lift } = track.bankP, n = track.n, ds = track.total / n;
  const peak = (f, halfM) => {   // arg-max of lift within ±halfM of fraction f
    const k0 = Math.round(f * n), w = Math.round(halfM / ds);
    let best = -1, off = 0;
    for (let i = -w; i <= w; i++) {
      const k = ((k0 + i) % n + n) % n;
      if (lift[k] > best) { best = lift[k]; off = i; }
    }
    return { lift: best, m: Math.abs(off) * ds };
  };
  const rows = [
    { name: "Massenet", turn: 3, sign: +1, halfM: 30 },
    { name: "Mirabeau", turn: 7, sign: -1, halfM: 80 },
  ];
  for (const r of rows) {
    assert.ok(def.bankZones.some(b => b.turn === r.turn), `${r.name}: a { turn: ${r.turn} } bank zone`);
    const c = corner(r.turn), p = peak(c.fraction, r.halfM);
    assert.equal(Math.sign(c.curvature), r.sign, `${r.name}: T${r.turn} curvature ${c.curvature.toFixed(4)}`);
    assert.ok(p.lift > 0.3 && p.m < 6, `${r.name}: lift ${p.lift.toFixed(2)} m peaks ${p.m.toFixed(1)} m from T${r.turn}`);
  }
  for (const t of [1, 4]) {
    const k = Math.round(def.turns[t - 1] * n) % n;
    assert.equal(lift[k], 0, `T${t} (where the old fracs landed) carries no authored bank`);
  }
});
