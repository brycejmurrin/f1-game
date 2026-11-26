/* audio-scope-once-vm.test.mjs — #6952 (U2.3 of #6920): the five stub-then-recreate
 * audio instances (RadioVoice, Announcer, RivalAudio, CarSfx, AudioPanel) keep ONE
 * identity across the LAZY_AUDIO load: the real module's members are adopted onto
 * the object game.js already holds, each real module is constructed once, and a
 * retry after a thrown part constructs nothing that already returned.
 * Run: node --test tests/unit/audio-scope-once-vm.test.mjs
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

const drain = async () => { for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r)); };

async function boot(opts = {}) {
  let watch = null;
  const g = await createGame({ carMeshes: false, storage: { sound: true, music: true }, onSandbox: (sb) => {
    install(sb);
    watch = watchAudioCreates(sb, opts);
  } });
  return { g, sb: g.sandbox, watch };
}

async function load(sb) {
  sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });
  await settle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
  await drain();
}

test("each audio handle keeps its identity and adopts the real members (#6952)", async () => {
  const { g, sb, watch } = await boot();
  try {
    const radio0 = g.G.radio, ann0 = g.G.announcer;
    const held = watch.held();   // the instance game.js got at boot, per module
    for (const m of ["RivalAudio", "CarSfx", "AudioPanel"]) assert.ok(held[m], m + " boot instance captured");
    await load(sb);
    assert.equal(g.G.radio, radio0, "G.radio is the same object after the lazy load");
    assert.equal(g.G.announcer, ann0, "G.announcer is the same object after the lazy load");
    const real = watch.real();
    for (const m of MODULES) assert.equal(real[m].length, 1, m + ": exactly one real construction");
    const handles = { RadioVoice: radio0, Announcer: ann0, RivalAudio: held.RivalAudio, CarSfx: held.CarSfx, AudioPanel: held.AudioPanel };
    for (const m of MODULES) {
      const r = real[m][0];
      assert.deepEqual(Object.keys(handles[m]).sort(), Object.keys(r).sort(), m + ": the handle carries the real keys");
      for (const k of Object.keys(r)) {
        const d = Object.getOwnPropertyDescriptor(r, k);
        if (typeof d.value === "function") assert.equal(handles[m][k], d.value, m + "." + k + " is the real member");
      }
    }
    assert.equal(held.AudioPanel._stub, undefined, "the adopted panel sheds the stub flag");
    // A second ensureAudio (another gesture) constructs nothing.
    sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });
    await drain();
    for (const m of MODULES) assert.equal(watch.real()[m].length, 1, m + ": still one after a second ensureAudio");
  } finally { g.close(); }
});

test("a retry after a thrown part re-creates only that part (#6952)", async () => {
  const { g, sb, watch } = await boot({ throwOnce: "CarSfx" });
  try {
    const held = watch.held();
    sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });
    await settle(() => !sb.GameAudio._stub && watch.thrown(), 4000);
    await drain();
    assert.ok(watch.thrown(), "the first real CarSfx.create threw");
    sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });   // the retry
    await settle(() => watch.real().CarSfx.length === 1 && watch.real().AudioPanel.length === 1, 4000);
    await drain();
    const real = watch.real();
    for (const m of MODULES) assert.equal(real[m].length, 1, m + ": one construction across the retry");
    assert.equal(held.CarSfx.update, real.CarSfx[0].update, "the retried CarSfx landed on the boot handle");
  } finally { g.close(); }
});
