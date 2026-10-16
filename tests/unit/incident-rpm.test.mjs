/* incident-rpm.test.mjs — incident/debris takeover must not freeze engine pitch.
 *
 * updateCar skipped c.rpm while incidentSim.owns(c); GameAudio / RivalAudio kept
 * reading the stale value for the whole takeover window.
 *
 * Run: node --test tests/unit/incident-rpm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame } = require(join(ROOT, "tools/lib/game-vm.cjs"));

const gameSrc = readFileSync(join(ROOT, "js/game.js"), "utf8");

test("updateCar incident early-out refreshes rpm like net-owned rivals", () => {
  const idx = gameSrc.indexOf("if (incidentSim.owns(c))");
  assert.ok(idx > 0, "incident takeover early-out present");
  const line = gameSrc.slice(idx, idx + 160);
  assert.match(line, /c\.rpm = rpmFor\(c\.gear \|\| 1, Math\.max\(0, c\.speed \|\| 0\)\)/,
    "incident path must set rpm before return (same contract as netPlay.owns)");
});

test("incident-owned car: rpm tracks speed each tick, not a stale crossing note", async () => {
  const g = await createGame({ carMeshes: false });
  try {
    await g.race("monza", "day", "dry");
    const c = g.G.cars.find((x) => x !== g.G.player && !x.retired);
    assert.ok(c, "need an AI rival");
    c._incidentOwned = true;
    c.speed = 50;
    c.gear = 6;
    c.rpm = 15000;
    g.step(1);
    const rpmFast = c.rpm;
    c.speed = 12;
    c.rpm = 15000;
    g.step(1);
    assert.ok(c.rpm < rpmFast - 800,
      `rpm must track the slowdown, not hold the crossing note (fast=${rpmFast} slow=${c.rpm})`);
  } finally {
    g.close();
  }
});
