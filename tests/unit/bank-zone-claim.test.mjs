/* bank-zone-claim.test.mjs — TrackMesh.bankingProfile re-seat claims (audit4 hunt-core-b B2).
 * A frac bankZone already ON a corner claims its nearest apex, so a loose zone (on a
 * straight > BANK_RESEAT_M from every apex) is re-seated onto a DIFFERENT corner rather
 * than merged onto the banked one by strongest-wins paint(). Synthetic path, no browser.
 * Run: node --test tests/unit/bank-zone-claim.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const N = 1000, TOTAL = 10000;            // ds = 10 m
const CORNERS = [0.25, 0.75];             // two left-handers, ±150 m of constant curvature

function loadMesh() {
  const curv = (s) => {
    const f = ((s / TOTAL) % 1 + 1) % 1;
    return CORNERS.some((c) => Math.abs(f - c) * TOTAL < 150) ? 0.02 : 0;
  };
  const ctx = vm.createContext({
    TrackGeom: { cross: () => [0, 1, 0], MAT: { SAND: 1, SNOW: 2, CONCRETE: 3, GRASS: 0 } },
    TrackSpline: { curvature: (_t, s) => curv(s), cr: () => 0 },
    TrackSpace: { wrap01: (v) => ((v % 1) + 1) % 1 },
    M4: { lerp: (a, b, t) => a + (b - a) * t },
  });
  const src = absSrc("js/track/core/mesh.js");
  vm.runInContext(fs.readFileSync(src, "utf8") + "\nglobalThis.TrackMesh = TrackMesh;", ctx, { filename: absSrc("js/track/core/mesh.js") });
  return ctx.TrackMesh;
}

const track = (bankZones) => ({
  n: N, total: TOTAL, hw: new Float32Array(N).fill(6),
  def: { bankZones, turns: CORNERS.slice() },
});
const near = (lift, f) => { let m = 0; for (let k = -3; k <= 3; k++) m = Math.max(m, lift[(Math.round(f * N) + k + N) % N]); return m; };

test("an on-corner frac zone claims its apex: the loose zone re-seats onto the other corner", () => {
  const TM = loadMesh();
  const prof = TM.bankingProfile(track([
    { frac: 0.25, angleDeg: 10, widthM: 60 },   // on corner 1
    { frac: 0.33, angleDeg: 20, widthM: 60 },   // on the straight, 800 m from corner 1, 4200 m from corner 2
  ]));
  assert.ok(prof, "a profile is built");
  assert.ok(near(prof.lift, 0.75) > 1, "the loose zone banks corner 2 (it no longer merges onto corner 1)");
  assert.ok(near(prof.lift, 0.25) < 2 * 6 * Math.tan(15 * Math.PI / 180), "corner 1 keeps its own 10° zone, not the 20° one");
  assert.equal(near(prof.lift, 0.33), 0, "nothing is left on the straight");
});

test("a lone loose zone still re-seats onto its nearest apex", () => {
  const TM = loadMesh();
  const prof = TM.bankingProfile(track([{ frac: 0.33, angleDeg: 20, widthM: 60 }]));
  assert.ok(near(prof.lift, 0.25) > 1);
  assert.equal(near(prof.lift, 0.75), 0);
});

test("a near-straight loose zone (≤ BANK_RESEAT_M) does not claim its apex", () => {
  // Corners only ±30 m of curvature so a zone 50 m off the apex is LOOSE, yet
  // closer than BANK_RESEAT_M (60 m) so it stays put. Claiming that apex would
  // push a farther loose zone onto the wrong corner (hunt 2026-10-27).
  const HALF = 30;
  const curv = (s) => {
    const f = ((s / TOTAL) % 1 + 1) % 1;
    return CORNERS.some((c) => Math.abs(f - c) * TOTAL < HALF) ? 0.02 : 0;
  };
  const ctx = vm.createContext({
    TrackGeom: { cross: () => [0, 1, 0], MAT: { SAND: 1, SNOW: 2, CONCRETE: 3, GRASS: 0 } },
    TrackSpline: { curvature: (_t, s) => curv(s), cr: () => 0 },
    TrackSpace: { wrap01: (v) => ((v % 1) + 1) % 1 },
    M4: { lerp: (a, b, t) => a + (b - a) * t },
  });
  const src = absSrc("js/track/core/mesh.js");
  vm.runInContext(fs.readFileSync(src, "utf8") + "\nglobalThis.TrackMesh = TrackMesh;", ctx, {
    filename: absSrc("js/track/core/mesh.js"),
  });
  const TM = ctx.TrackMesh;
  const liftAt = (lift, f) => lift[Math.round(f * N) % N];
  const both = TM.bankingProfile(track([
    { frac: 0.255, angleDeg: 12, widthM: 40 }, // 50 m past corner 1 — stay, do not claim
    { frac: 0.40, angleDeg: 25, widthM: 60 },  // nearest apex is still corner 1
  ]));
  const solo = TM.bankingProfile(track([{ frac: 0.40, angleDeg: 25, widthM: 60 }]));
  assert.ok(liftAt(both.lift, 0.25) > 1, "corner 1 is banked (far zone may re-seat there)");
  assert.ok(
    liftAt(both.lift, 0.25) >= liftAt(solo.lift, 0.25) * 0.9,
    "corner 1 keeps the far zone's bank (not forced onto corner 2 by a near claim)",
  );
  assert.equal(liftAt(both.lift, 0.75), 0, "corner 2 stays flat — far zone was not displaced");
});
