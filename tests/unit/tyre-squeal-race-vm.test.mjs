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
