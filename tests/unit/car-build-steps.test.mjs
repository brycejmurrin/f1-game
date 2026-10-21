// Car3D.buildSteps (B·H8 2026-10-21): the car build as a generator that pauses at each
// section boundary, so the garage's title prebuild can spread one ~0.7 s build (4x CPU)
// over many tasks and stop on input. build() drains it; the output must not move a byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const { Car3D, Teams } = loadParts({ shade: true });

test("buildSteps pauses between sections and drains to exactly build()'s output", () => {
  for (const team of [Teams.LIST[0], Teams.LIST[2]]) {
    const opts = { teamId: team.id, num: 4 };
    const whole = Car3D.build(team.color, team.color2, opts);
    const steps = Car3D.buildSteps(team.color, team.color2, opts);
    let r, pauses = 0;
    while (!(r = steps.next()).done) pauses++;
    assert.ok(pauses >= 15, `${team.id}: ${pauses} pauses — one per section boundary`);
    assert.deepEqual(r.value, whole, `${team.id}: the stepped build is the same car`);
  }
});
