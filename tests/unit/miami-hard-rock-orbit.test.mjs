/* miami-hard-rock-orbit.test.mjs — #3369 day S/F orbit/trackside must not
 * sit inside the Hard Rock bowl / roof mass.
 *
 * dual_lite survey: az 45 / el 20 / dist 42 → eye ~28 m lateral (orbit) and
 * trackside side +1 / dist 42 at frac 0. HARD_ROCK_GAP 128 with RB 100 put the
 * near rim on the orbit eye; roof frusta r≈118 put the canopy over both eyes
 * (interior grey slabs). Gap ≥ 150 and roof radii ≤ RB clear the corridor;
 * miami-hard-rock-neon stays required.
 *
 * Run: node --test tests/unit/miami-hard-rock-orbit.test.mjs
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
const SRC = path.join(ROOT, "js/circuits/scenery/miami.js");

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

/** dual_lite trackside eye (side +1 / dist 42) at frac 0. */
function dualLiteTracksideEye(Tracks, track) {
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
  Tracks.sample(track, 0, smp);
  const dist = 42, h = Math.max(3, 20 * 0.35);
  const eye = [
    smp.p[0] + smp.r[0] * dist,
    smp.p[1] + h,
    smp.p[2] + smp.r[2] * dist,
  ];
  return { eye, lat: dist, roadY: smp.p[1], smp };
}

/** Bowl/roof verts in an XZ bubble around the eye (Hard Rock burial). */
function massVertsNear(pos, eye, roadY, radius, yLo = 4, yHi = 80) {
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

test("miami Hard Rock gap + roof radii clear dual_lite S/F corridor", () => {
  const src = fs.readFileSync(SRC, "utf8");
  const gap = src.match(/HARD_ROCK_GAP\s*=\s*(\d+)/);
  assert.ok(gap, "HARD_ROCK_GAP authored");
  assert.ok(Number(gap[1]) >= 150,
    `HARD_ROCK_GAP ${gap[1]} must be ≥ 150 to clear dual_lite trackside (42 m) past RB 100; was 128 in #3369`);
  const neon = src.match(/Hard Rock neon landmark[\s\S]*?anchor\(K\(0\.008\),\s*1,\s*(\d+)/);
  assert.ok(neon, "neon landmark gap authored");
  assert.ok(Number(neon[1]) >= 140,
    `neon gap ${neon[1]} must ride with HARD_ROCK_GAP (≥ 140); was 118 in #3369`);
  // Roof frusta must fit inside RB so they do not overshoot toward the track.
  const roofs = [...src.matchAll(/addFrustum\(out,\s*vadd\(stadiumBase[\s\S]*?,\s*(\d+),\s*(\d+),\s*[\d.]+,/g)];
  assert.ok(roofs.length >= 2, "Hard Rock roof frusta present");
  for (const m of roofs) {
    const bot = Number(m[1]), top = Number(m[2]);
    assert.ok(bot <= 105,
      `Hard Rock roof bottom radius ${bot} must be ≤ 105 (RB≈100); was 118–122 in #3369`);
    assert.ok(top <= 80, `Hard Rock roof top radius ${top} must stay inside the bowl`);
  }
});

test("miami day S/F orbit + trackside eyes clear Hard Rock mass; neon emits", () => {
  const Tracks = buildContext();
  const def = Tracks.LIST.find((d) => d.id === "miami");
  assert.ok(def, "miami registered");
  const track = Tracks.build(def, { night: false });
  const emitted = (track.modelDiagnostics && track.modelDiagnostics.emitted) || [];
  const idSet = new Set(emitted.map((e) => e.id));
  assert.ok(idSet.has("miami-hard-rock-neon"), "miami-hard-rock-neon must emit (S/F hero)");

  const pos = track.propsGeo && track.propsGeo.pos;
  assert.ok(pos && pos.length, "propsGeo.pos present");

  const orbit = dualLiteOrbitEye(Tracks, track);
  assert.ok(orbit.lat > 24 && orbit.lat < 32,
    `dual_lite orbit lat ${orbit.lat.toFixed(2)} (expected ~28)`);
  const nearOrbit = massVertsNear(pos, orbit.eye, orbit.roadY, 6);
  assert.equal(nearOrbit, 0,
    `dual_lite S/F orbit eye still has ${nearOrbit} Hard Rock verts within 6 m (lat ${orbit.lat.toFixed(1)})`);

  const ts = dualLiteTracksideEye(Tracks, track);
  const nearTs = massVertsNear(pos, ts.eye, ts.roadY, 6);
  assert.equal(nearTs, 0,
    `dual_lite S/F trackside eye still has ${nearTs} Hard Rock verts within 6 m (lat ${ts.lat})`);
});
