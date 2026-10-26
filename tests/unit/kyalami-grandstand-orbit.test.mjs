/* kyalami-grandstand-orbit.test.mjs — #3316 start orbit/trackside must not
 * look into/under the main grandstand bowl.
 *
 * dual_lite survey: az 45 / el 20 / dist 42 → eye ~28 m lateral at frac 0.
 * Main GS gap 16 and terrace-main gap 13 put roof/crowd mass on that eye, so
 * day-dry orbit-00 / trackside-00 showed slatted lean-to + crowd cubes instead
 * of the Highveld pit straight. Gap ≥ 32 clears the corridor; required
 * landmarks stay emitted.
 *
 * Run: node --test tests/unit/kyalami-grandstand-orbit.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ROOT, "js/circuits/scenery/kyalami.js");

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

/** Stand-height verts in an XZ bubble around the eye (bowl/roof burial). */
function standVertsNear(pos, eye, roadY, radius, yLo = 8, yHi = 22) {
  let n = 0;
  const r2 = radius * radius;
  for (let i = 0; i < pos.length; i += 3) {
    const dx = pos[i] - eye[0], dz = pos[i + 2] - eye[2];
    if (dx * dx + dz * dz > r2) continue;
    const yRel = pos[i + 1] - roadY;
    if (yRel >= yLo && yRel <= yHi) n++;
  }
  return n;
}

test("kyalami main grandstand + S/F terrace gaps clear dual_lite orbit (~28 m)", () => {
  const src = fs.readFileSync(SRC, "utf8");
  const gs = src.match(/Main grandstand[\s\S]*?const side = -1, dist = (\d+)/);
  assert.ok(gs, "main grandstand dist authored");
  assert.ok(Number(gs[1]) >= 32,
    `main grandstand dist ${gs[1]} must be ≥ 32 to clear dual_lite orbit (~28 m); was 16 in #3316`);
  const terrace = src.match(/ironTerrace\("kyalami-terrace-main",\s*K\(0\.005\),\s*-1,\s*(\d+)/);
  assert.ok(terrace, "terrace-main call present");
  assert.ok(Number(terrace[1]) >= 32,
    `terrace-main dist ${terrace[1]} must be ≥ 32; was 13 in #3316`);
});

test("kyalami day S/F orbit eye is clear of main-stand mass; heroes emit", () => {
  const Tracks = buildContext();
  const def = Tracks.LIST.find((d) => d.id === "kyalami");
  assert.ok(def, "kyalami registered");
  const track = Tracks.build(def, { night: false });
  const emitted = (track.modelDiagnostics && track.modelDiagnostics.emitted) || [];
  const idSet = new Set(emitted.map((e) => e.id));
  for (const id of ["kyalami-main-grandstand", "kyalami-terrace-main", "kyalami-pit-block"]) {
    assert.ok(idSet.has(id), `${id} must emit (S/F hero)`);
  }

  const { eye, lat, roadY } = dualLiteOrbitEye(Tracks, track);
  assert.ok(Math.abs(lat) > 24 && Math.abs(lat) < 32,
    `dual_lite eye |lat| ${Math.abs(lat).toFixed(2)} (expected ~28)`);

  const pos = track.propsGeo && track.propsGeo.pos;
  assert.ok(pos && pos.length, "propsGeo.pos present");
  const nearStand = standVertsNear(pos, eye, roadY, 6);
  assert.equal(nearStand, 0,
    `dual_lite S/F orbit eye still has ${nearStand} stand-height verts within 6 m (lat ${lat.toFixed(1)})`);
});
