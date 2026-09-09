/* body-split.test.mjs — liv.bodySplit "lr" paints left c1 / right c2. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const team = M.Teams.LIST.find((t) => t.id === "cadillac");
assert.ok(team, "cadillac team exists");
const parts = M.Parts.getVisualTiers(M.Parts.defaults ? M.Parts.defaults() : {}, team);

function sampleSide(mesh, sign) {
  const paint = M.Car3D.SURFACES.paint;
  for (let i = 0; i < mesh.pos.length / 3; i++) {
    if (mesh.mat[i] !== paint) continue;
    const x = mesh.pos[i * 3], y = mesh.pos[i * 3 + 1];
    if (sign < 0 ? x >= -0.08 : x <= 0.08) continue;
    if (y < 0.25 || y > 0.85) continue;
    return [mesh.col[i * 3], mesh.col[i * 3 + 1], mesh.col[i * 3 + 2]];
  }
  return null;
}

function near(a, b, eps = 0.05) {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;
}

test("cadillac ships bodySplit lr", () => {
  assert.equal(team.livery.bodySplit, "lr");
});

test("bodySplit lr recolours left body to c1 and right body to c2", () => {
  const liv = Object.assign({}, team.livery);
  assert.equal(liv.bodySplit, "lr");
  const mesh = M.Car3D.build(team.color, team.color2, {
    livery: liv, teamId: team.id, num: 11, parts, noWheels: true,
  });
  const left = sampleSide(mesh, -1);
  const right = sampleSide(mesh, 1);
  assert.ok(left, "found a left-side paint vert");
  assert.ok(right, "found a right-side paint vert");
  assert.ok(near(left, team.color), `left ${left} ≈ c1 ${team.color}`);
  assert.ok(near(right, team.color2), `right ${right} ≈ c2 ${team.color2}`);
});

test("absent bodySplit keeps a single body colour", () => {
  const liv = Object.assign({}, team.livery);
  delete liv.bodySplit;
  const mesh = M.Car3D.build(team.color, team.color2, {
    livery: liv, teamId: team.id, num: 11, parts, noWheels: true,
  });
  const left = sampleSide(mesh, -1);
  const right = sampleSide(mesh, 1);
  assert.ok(left && right);
  assert.ok(near(left, right, 0.02), "both sides match without bodySplit");
});
