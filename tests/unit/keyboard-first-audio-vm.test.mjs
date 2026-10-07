/* keyboard-first-audio-vm.test.mjs — first key on the title pulls LAZY_AUDIO, not only pointerdown.
 * Run: node --test tests/unit/keyboard-first-audio-vm.test.mjs
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

test("keyboard-first Enter on the title loads real GameAudio and title music", async () => {
  let fa = null;
  const g = await createGame({ carMeshes: false, onSandbox: (sb) => { fa = install(sb); } });
  try {
    const sb = g.sandbox;
    assert.equal(sb.GameAudio._stub, true, "precondition: title boots on LAZY_AUDIO stub");
    const kd = { type: "keydown", key: "Enter", target: sb.document.body };
    sb.dispatchEvent(kd);
    sb.document.dispatchEvent(kd);
    await settle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
    await turns(50);
    assert.equal(fa.made.length, 1, "keyboard-first must create an AudioContext");
    assert.ok(!sb.GameAudio._stub, "real GameAudio must be bound");
    assert.equal(sb.GameAudio.debug().contextState, "running");
    assert.ok(sb.GameAudio.trackName && sb.GameAudio.trackName(), "title music track must be set");
    assert.equal(g.G.state, "menu");
  } finally { g.close(); }
});

test("Escape alone does not pull LAZY_AUDIO (not an activation gesture)", async () => {
  let fa = null;
  const g = await createGame({ carMeshes: false, onSandbox: (sb) => { fa = install(sb); } });
  try {
    const sb = g.sandbox;
    const kd = { type: "keydown", key: "Escape", target: sb.document.body };
    sb.dispatchEvent(kd);
    sb.document.dispatchEvent(kd);
    await turns(100);
    assert.equal(sb.GameAudio._stub, true, "Escape must not load the audio bundle");
    assert.equal(fa.made.length, 0);
  } finally { g.close(); }
});
