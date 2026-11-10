/* tyre-squeal-race-vm.test.mjs — #2975: race skidIntensity must squeal at 0.10 rad onset.
 *
 * game.js gates slip at 0.10 rad and normalises to 0..1, then passes the scalar
 * to GameAudio.setSkid. A second SQUEAL_THRESH on that scalar silenced onset
 * near 0.12 rad. This VM boots the real race audio path and pins the
 * race-normalised intensity on the player (physics would clear a hand-forced
 * vLat before skidIntensity lands near 0.10); skidLevel()/skidPitch() are the
 * asserts.
 *
 * Run: node --test tests/unit/tyre-squeal-race-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gameSource } from "../helpers/game-source.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame, settle } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
const { install } = require("./fake-audio-vm.cjs");

const turns = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

function pin(obj, key, value) {
  Object.defineProperty(obj, key, {
    get() { return value; },
    set() { /* race write */ },
    configurable: true,
    enumerable: true,
  });
}

async function bootRaceAudio() {
  const g = await createGame({ carMeshes: false, onSandbox: (sb) => install(sb) });
  const sb = g.sandbox;
  const pd = { type: "pointerdown", pointerType: "mouse", target: sb.document.body };
  sb.dispatchEvent(pd);
  sb.document.dispatchEvent(pd);
  await settle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
  await turns(50);
  await g.race("monza", "day", "dry");
  assert.equal(sb.GameAudio.debug().engineOn, true, "precondition: race started the engine");
  return { g, sb };
}

test("race-normalised intensity 0.10 (onset at 0.10 rad) makes skidLevel audible", async () => {
  const { g, sb } = await bootRaceAudio();
  try {
    const player = g.G.player;
    // (slipAng 0.12 − 0.10) / 0.20 = 0.10 — the double-gate bug silenced this.
    pin(player, "skidIntensity", 0.10);
    pin(player, "wheelLock", 0);
    g.step(3);
    assert.equal(player.skidIntensity, 0.10);
    const level = sb.GameAudio.skidLevel();
    assert.ok(level > 0,
      `skidLevel=${level} at race intensity 0.10: second SQUEAL_THRESH still silencing onset`);
    assert.ok(Math.abs(level - 0.10 * 0.16) < 1e-9, `expected dry gain 0.016, got ${level}`);
  } finally { g.close(); }
});

// The REAL squeal gate: updateCar's human-only `slipAng` / `c.skidIntensity`
// statements, lifted from the shipped source and compiled, so the onset below
// is the one game.js runs (a hand-forced vLat does not survive a physics step,
// which is why the boot test above pins the intensity instead).
const SQUEAL_SRC = (() => {
  const src = gameSource();
  const a = src.indexOf("    const slipAng = Math.abs(Math.atan2(c.vLat || 0, Math.max(4, Math.abs(c.speed))));");
  const b = src.indexOf("c.skidIntensity = c.offroad ? 0.5", a);
  const e = src.indexOf(";", b);
  if (a < 0 || b < 0 || e < 0) throw new Error("updateCar's slipAng → skidIntensity statements not found");
  return src.slice(a, e + 1);
})();
const squealIntensity = (slipRad, speed = 40) => {
  const c = { vLat: speed * Math.tan(slipRad), speed, offroad: false, wheelLock: 0 };
  Function("c", "clamp", SQUEAL_SRC)(c, (v, lo, hi) => Math.min(hi, Math.max(lo, v)));
  return c.skidIntensity;
};

test("squeal onset is 0.10 rad body slip: below it the tyres are silent, above it they talk", async () => {
  // Pure: the shipped gate on either side of the onset, and its full-slide end.
  for (const s of [0, 0.05, 0.09, 0.099]) assert.equal(squealIntensity(s), 0, `slip ${s} rad is under the onset`);
  for (const s of [0.101, 0.11, 0.12]) assert.ok(squealIntensity(s) > 0, `slip ${s} rad is past the onset`);
  assert.ok(Math.abs(squealIntensity(0.12) - 0.10) < 1e-9, "(0.12 − 0.10) / 0.20 = 0.10");
  assert.equal(squealIntensity(0.35), 1, "past 0.30 rad is a full slide (clamped)");
  // ...and through the real race audio: what the gate yields is what the player hears.
  const { g, sb } = await bootRaceAudio();
  try {
    const player = g.G.player;
    pin(player, "wheelLock", 0);
    pin(player, "skidIntensity", squealIntensity(0.09));
    g.step(3);
    assert.equal(sb.GameAudio.skidLevel(), 0, "0.09 rad slip must be silent");
    pin(player, "skidIntensity", squealIntensity(0.11));
    g.step(3);
    assert.ok(sb.GameAudio.skidLevel() > 0, "0.11 rad slip must squeal");
  } finally { g.close(); }
});

test("lock-up raises skid pitch via CarSfx.lock without game.js {lat,long}", async () => {
  const { g, sb } = await bootRaceAudio();
  try {
    const player = g.G.player;
    pin(player, "skidIntensity", 0.5);
    pin(player, "wheelLock", 0);
    pin(player, "speed", 40);
    g.step(2);
    const basePitch = sb.GameAudio.skidPitch();
    pin(player, "wheelLock", 1);
    // setSkid runs before setCarSfx in the same tick; the next step picks up lock.
    g.step(3);
    assert.ok(sb.GameAudio.carSfx().lock > 0.5, `CarSfx.lock=${sb.GameAudio.carSfx().lock}`);
    assert.ok(sb.GameAudio.skidPitch() > basePitch + 40,
      `lock-up pitch ${sb.GameAudio.skidPitch()} should sit above slide ${basePitch}`);
  } finally { g.close(); }
});
