/* audio-stub-parity.test.mjs — #6952: the title stub (js/audio/stub.js) offers the
 * same members as the real LAZY_AUDIO module, so the handle game.js holds never
 * changes shape when the real one is adopted onto it. Keys are read in a game VM:
 * the stub's at boot, the real module's after the lazy load.
 * Run: node --test tests/unit/audio-stub-parity.test.mjs
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
const { watchAudioCreates, MODULES } = require("./audio-create-watch.cjs");

// Stub-only on purpose: AudioPanel's `_stub` is the "real panel not here yet" flag.
// RivalAudio's MODULE lacks attach/setMix so engine.js parks the pass-by dest in
// `_pendingAttach` until rivals.js evaluates (rival-attach-init.test.mjs).
const EXEMPT = { AudioPanel: ["_stub"], "RivalAudio module": ["attach", "setMix", "_pendingAttach"] };
const keys = (o, exempt = []) => Object.keys(o || {}).filter((k) => !exempt.includes(k)).sort();

test("stub keys equal the real module's keys for the five audio handles (#6952)", async () => {
  let watch = null;
  const g = await createGame({ carMeshes: false, storage: { sound: true, music: true }, onSandbox: (sb) => {
    install(sb); watch = watchAudioCreates(sb);
  } });
  const sb = g.sandbox;
  try {
    const stub = {
      RadioVoice: keys(sb.RadioVoice.inert()), Announcer: keys(sb.Announcer.inert()),
      "RivalAudio module": keys(sb.RivalAudio, EXEMPT["RivalAudio module"]),
    };
    const held = watch.held();
    for (const m of ["RivalAudio", "CarSfx", "AudioPanel"]) stub[m] = keys(held[m], EXEMPT[m]);
    sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });
    await settle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
    const real = watch.real();
    for (const m of MODULES) {
      assert.equal(real[m].length, 1, m + " constructed");
      assert.deepEqual(stub[m], keys(real[m][0], EXEMPT[m]), m + ": stub keys equal the real instance's");
    }
    assert.deepEqual(stub["RivalAudio module"], keys(sb.RivalAudio, EXEMPT["RivalAudio module"]), "RivalAudio module keys");
  } finally { g.close(); }
});
