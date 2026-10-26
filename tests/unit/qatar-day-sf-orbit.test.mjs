// qatar-day-sf-orbit.test.mjs — #3365: day S/F dual_lite orbit must not sit
// inside the main grandstand bowl, and the pit / Lusail Hill heroes must emit.
//
// dual_lite survey: az 45 / el 20 / dist 42 → eye ~28 m on +1 at frac 0.
// A main-stand gap of 15 put the roof/crowd mass on that eye (dark slit onto
// sand). Gap ≥ 32 clears the corridor; pit slab + Lusail Hill stay required.
//
// Run: node --test tests/unit/qatar-day-sf-orbit.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ROOT, "js/circuits/scenery/qatar.js");

/** dual_lite orbit eye at racing frac 0 (matches tools/lib/track-shot-survey.mjs). */
function dualLiteOrbitEye(Tracks, track) {
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
  Tracks.sample(track, 0, smp);
  const az = 45 * Math.PI / 180, el = 20 * Math.PI / 180, dist = 42, h = 1.5;
  const cx = smp.p[0], cy = smp.p[1] + h, cz = smp.p[2];
  const fwd = [smp.t[0], 0, smp.t[2]], rt = [smp.r[0], 0, smp.r[2]];
  const dir = [
    Math.cos(az) * fwd[0] + Math.sin(az) * rt[0], 0,
    Math.cos(az) * fwd[2] + Math.sin(az) * rt[2],
  ];
  const eye = [
    cx + dir[0] * Math.cos(el) * dist,
    cy + Math.sin(el) * dist,
    cz + dir[2] * Math.cos(el) * dist,
  ];
  const lat = (eye[0] - smp.p[0]) * smp.r[0] + (eye[2] - smp.p[2]) * smp.r[2];
  return { eye, lat, roadY: smp.p[1], smp };
}

test("qatar main grandstand gap clears the dual_lite S/F orbit eye (~28 m)", () => {
  const src = fs.readFileSync(SRC, "utf8");
  const block = src.match(/function mainGrandstand\(\)[\s\S]*?\n\s*\}\)\(\);/);
  assert.ok(block, "mainGrandstand IIFE present");
  const gap = block[0].match(/MAIN_GAP\s*=\s*(\d+)/) || block[0].match(/qatarStand\([^)]+,\s*1,\s*(\d+)/);
  assert.ok(gap, "main stand gap authored");
  assert.ok(Number(gap[1]) >= 32,
    `main stand gap ${gap[1]} must be ≥ 32 to clear dual_lite orbit lateral (~28 m); was 15 in #3365`);
});

test("qatar day S/F orbit eye is clear of main-stand mass; pit + Lusail Hill emit", () => {
  const Tracks = buildContext();
  const def = Tracks.LIST.find((d) => d.id === "qatar");
  assert.ok(def, "qatar registered");
  const track = Tracks.build(def, { night: false });
  const emitted = (track.modelDiagnostics && track.modelDiagnostics.emitted) || [];
  const idSet = new Set(emitted.map((e) => e.id));
  for (const id of ["qatar-pit-slab", "qatar-lusail-hill", "qatar-main-stand-0"]) {
    assert.ok(idSet.has(id), `${id} must emit (day hero)`);
  }

  const { eye, lat, roadY, smp } = dualLiteOrbitEye(Tracks, track);
  assert.ok(lat > 24 && lat < 32, `dual_lite eye lat ${lat.toFixed(2)} (expected ~28)`);

  // Stand-height scenery in a 6 m XZ bubble around the eye = camera buried in
  // the bowl/roof (the #3365 day-orbit failure mode).
  const pos = track.propsGeo && track.propsGeo.pos;
  assert.ok(pos && pos.length, "propsGeo.pos present");
  let nearStand = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const dx = pos[i] - eye[0], dz = pos[i + 2] - eye[2];
    if (dx * dx + dz * dz > 6 * 6) continue;
    const yRel = pos[i + 1] - roadY;
    if (yRel >= 8 && yRel <= 22) nearStand++;
  }
  assert.equal(nearStand, 0,
    `dual_lite S/F orbit eye still has ${nearStand} stand-height verts within 6 m (lat ${lat.toFixed(1)})`);

  // Lusail Hill keeps a day-readable crest (mesh above ~9 m relative near T1).
  Tracks.sample(track, 0.068 * track.total, smp);
  const hx = smp.p[0] + smp.r[0] * 56, hz = smp.p[2] + smp.r[2] * 56;
  let hillTop = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const dx = pos[i] - hx, dz = pos[i + 2] - hz;
    if (dx * dx + dz * dz > 35 * 35) continue;
    hillTop = Math.max(hillTop, pos[i + 1] - smp.p[1]);
  }
  assert.ok(hillTop >= 9.5, `Lusail Hill day crest too low (${hillTop.toFixed(2)} m rel)`);
});
