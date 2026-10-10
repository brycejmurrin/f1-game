// @doc Barrier run-off jump probe: synthetic cliffs + feathered fleet caps (plan 2026-09-30 Slice 2).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const {
  maxAdjDelta,
  maxAdjOver,
  maxWallAtStep,
  summariseTrack,
  syntheticCliff,
  featherBarrierEnds,
} = require(path.join(ROOT, "tools/track/barrier-jumps.cjs"));

test("synthetic one-node cliff of 7.9 is detected as maxAdj / maxWallStep", () => {
  // Open-circuit identity: RUNOFF_DEFAULT 9 − (tyreGap 2.2 − WALL_CLEAR 1.1) = 7.9.
  // Float32Array stores 7.9 imprecisely — compare with a centimetre tolerance.
  const arr = syntheticCliff(20, 5, 16.2, 8.3, 1);
  assert.ok(Math.abs(maxAdjDelta(arr) - 7.9) < 1e-5, `maxAdj=${maxAdjDelta(arr)}`);
  assert.ok(maxWallAtStep(arr) > 7.5, `maxWallStep=${maxWallAtStep(arr)}`);
});

test("a 3-node authored ramp stays under 3 m (helper sanity)", () => {
  // high 16.2, low 8.3, cliff 7.9 — three-step ramp → steps of 7.9/4 = 1.975.
  const arr = syntheticCliff(40, 10, 16.2, 8.3, 3);
  assert.ok(maxAdjDelta(arr) < 3.0, `feathered maxAdj=${maxAdjDelta(arr)}`);
  assert.ok(maxWallAtStep(arr) < 3.0, `feathered maxWallStep=${maxWallAtStep(arr)}`);
});

test("featherBarrierEnds turns a 7.9 cliff into steps under 1.5 m (would fail before)", () => {
  const n = 40;
  const hw = new Float32Array(n);
  for (let i = 0; i < n; i++) hw[i] = 7;
  // One-node cliff: over 9 → 1.1 at index 10 (absolute bar 16 → 8.1).
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = hw[i] + 9;
  arr[10] = hw[10] + 1.1;
  assert.ok(maxAdjOver(arr, hw) > 7.5, "precondition: cliff present");
  featherBarrierEnds(arr, hw, { nodes: 5, cliff: 1.5 });
  assert.ok(maxAdjOver(arr, hw) < 1.5, `after feather maxOver=${maxAdjOver(arr, hw)}`);
  // Tight face must not rise.
  assert.ok(Math.abs((arr[10] - hw[10]) - 1.1) < 1e-5, `tight face raised to ${arr[10] - hw[10]}`);
});

test("maxAdjOver ignores a pure hw step with constant clearance", () => {
  const n = 8;
  const bar = new Float32Array(n);
  const hw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    hw[i] = i < 4 ? 7 : 9;
    bar[i] = hw[i] + 9; // constant over = 9
  }
  assert.equal(maxAdjOver(bar, hw), 0);
  assert.ok(maxAdjDelta(bar) >= 2); // absolute bar still steps with hw
});

test("fleet: open-circuit tyre termini stay under 1.5 m after feather (Slice 2)", () => {
  // Would fail on ship tip before featherBarrierEnds (maxOver ≈ 7.9).
  // Pit.keep edges on the PIT side are protected (openBoundary must stay open) —
  // exclude pairs that touch a keep node on THAT array only (those cliffs are
  // intentional); the opposite side is checked in full (M43, below).
  const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));
  const { Tracks } = buildContext();
  for (const id of ["monza", "spa", "bahrain", "silverstone"]) {
    const track = Tracks.build(Tracks.LIST.find((d) => d.id === id));
    const pit = track.pit;
    const keep = (k) => !!(pit && !pit.painted && pit.keep[k] > 0);
    const pitBar = pit && !pit.painted ? (pit.side > 0 ? track.barR : track.barL) : null;
    let maxOver = 0, maxWall = 0;
    for (let k = 0; k < track.n; k++) {
      const j = (k + 1) % track.n;
      for (const arr of [track.barL, track.barR]) {
        if (arr === pitBar && (keep(k) || keep(j))) continue;
        const d = Math.abs((arr[k] - track.hw[k]) - (arr[j] - track.hw[j]));
        if (d > maxOver) maxOver = d;
        const a = Math.min(arr[k], arr[j]);
        const b = Math.min(arr[j], arr[(j + 1) % track.n]);
        const w = Math.abs(a - b);
        if (w > maxWall) maxWall = w;
      }
    }
    assert.ok(maxOver < 1.5, `${id} maxOver=${maxOver} (want < 1.5, off-pit)`);
    assert.ok(maxWall < 1.5, `${id} maxWallStep=${maxWall} (want < 1.5, off-pit)`);
  }
  // Interior of a known Monza stack face stays near hw+1.1 (feather must not raise it).
  const monza = Tracks.build(Tracks.LIST.find((d) => d.id === "monza"));
  const kTight = Math.round(0.305 * monza.n) % monza.n;
  const over = monza.barR[kTight] - monza.hw[kTight];
  assert.ok(over < 2.0, `mid-stack over should be ~1.1, got ${over} at k=${kTight}`);
});

test("monaco pit keep nodes stay open; non-pit maxOver under 1.5 m", () => {
  const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));
  const { Tracks } = buildContext();
  const track = Tracks.build(Tracks.LIST.find((d) => d.id === "monaco"));
  const p = track.pit;
  assert.ok(p && !p.painted, "monaco has a street pit complex");
  const bar = p.side > 0 ? track.barR : track.barL;
  let checked = 0;
  for (let k = 0; k < track.n; k++) {
    if (!(p.keep[k] > 0)) continue;
    assert.ok(bar[k] > track.hw[k] + 2, `keep node ${k} bar ${bar[k]} not opened`);
    if (++checked >= 5) break;
  }
  assert.ok(checked >= 5, "expected keep nodes to check");
  // Clearance jumps off the pit side (and the whole opposite side) stay under budget.
  let maxOffPit = 0;
  for (let k = 0; k < track.n; k++) {
    const j = (k + 1) % track.n;
    for (const [side, arr] of [["L", track.barL], ["R", track.barR]]) {
      if (side === (p.side > 0 ? "R" : "L") && (p.keep[k] > 0 || p.keep[j] > 0)) continue;
      const d = Math.abs((arr[k] - track.hw[k]) - (arr[j] - track.hw[j]));
      if (d > maxOffPit) maxOffPit = d;
    }
  }
  assert.ok(maxOffPit < 1.5, `off-pit maxOver=${maxOffPit}`);
});

test("fleet: the NON-pit side inside the pit window has no clearance step over 1.5 m (M43)", () => {
  // featherAfterOpen used to hand the pit.keep protect callback to BOTH barL and
  // barR, so the side openBoundary never opened kept its 7.9 m run-off cliffs
  // inside the window (silverstone, miami, abudhabi, nurburgring, magny_cours,
  // brands_hatch; 23 circuits over 1.5 m) and WallClamp turned each into a
  // sideways snap of c.x. Would fail on the base for those circuits.
  const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));
  const { Tracks } = buildContext();
  const bad = [];
  let checked = 0;
  for (const def of Tracks.LIST) {
    const track = Tracks.build(def);
    const pit = track.pit;
    if (!pit || pit.painted) continue;
    const opp = pit.side > 0 ? track.barL : track.barR;
    let worst = 0;
    for (let k = 0; k < track.n; k++) {
      const j = (k + 1) % track.n;
      if (!(pit.keep[k] > 0 || pit.keep[j] > 0)) continue;
      worst = Math.max(worst, Math.abs((opp[k] - track.hw[k]) - (opp[j] - track.hw[j])));
    }
    checked++;
    if (worst >= 1.5) bad.push(`${def.id} ${worst.toFixed(2)}`);
  }
  assert.ok(checked >= 40, `only ${checked} pit complexes checked`);
  assert.deepEqual(bad, [], `non-pit side steps >= 1.5 m inside the pit window: ${bad.join(", ")}`);
});

test("street barrier: the last panel closes on node 0, not past it (10-F2, odd n)", () => {
  // The panel walk stepped k += 2 and wrapped the last span with `% n`: on an odd node
  // count the final panel ran n-1, 0, 1 (two nodes, ~8 m) on top of the first (0, 1, 2).
  // Vegas 1543, Singapore 1227 and Baku 1475 are odd. Would fail on the base (the k = n-1
  // panel measures ~8.07 m there; one node is ~4.06).
  const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));
  const { Tracks } = buildContext();
  let seen = 0;
  for (const id of ["vegas", "singapore", "baku"]) {
    const track = Tracks.build(Tracks.LIST.find((d) => d.id === id));
    const n = track.n, ds = track.total / n;
    assert.equal(n % 2, 1, `${id} is no longer an odd-node circuit`);
    for (const nd of track.graph.nodes) {
      const m = nd.meta;
      if (!m || m.kind !== "streetBarrier" || m.k !== n - 1) continue;
      seen++;
      assert.ok(nd.s[2] < 1.5 * ds, `${id} side ${m.side}: the n-1 panel is ${nd.s[2].toFixed(2)} m long (one node is ${ds.toFixed(2)}): it wraps onto node 1`);
    }
  }
  assert.ok(seen >= 3, `only ${seen} seam panels found`);
});
