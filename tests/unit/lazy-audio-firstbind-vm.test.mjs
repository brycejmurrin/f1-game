/* lazy-audio-firstbind-vm.test.mjs — boot-time GameAudio calls on the LAZY_AUDIO stub must replay when the real engine binds.
 * Full game VM (tools/lib/game-vm.cjs) + fake AudioContext (tests/unit/fake-audio-vm.cjs).
 * Run: node --test tests/unit/lazy-audio-firstbind-vm.test.mjs
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

async function bootAndGesture(storage) {
  let fa = null;
  const g = await createGame({ carMeshes: false, storage, onSandbox: (sb) => { fa = install(sb); } });
  const sb = g.sandbox;
  assert.equal(sb.GameAudio._stub, true, "precondition: the title boots the LAZY_AUDIO stub");
  const pd = { type: "pointerdown", pointerType: "mouse", target: sb.document.body };
  sb.dispatchEvent(pd);            // game.js window pointerdown (once) -> ensureAudio()
  sb.document.dispatchEvent(pd);   // platform-session onFirstGesture -> firstGesture() (init + startMusic(-1))
  await settle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
  await turns(50);
  return { g, sb, fa };
}

test("first gesture + RACE with default settings has an AudioContext and a running engine", async () => {
  const { g, sb, fa } = await bootAndGesture();
  try {
    assert.equal(fa.made.length, 1, "title: the first gesture created no AudioContext (title loop silent)");
    await g.race("monza", "day", "dry");
    g.apex.setInput({ throttle: true, steer: 0 });
    g.step(300);
    assert.equal(sb.GameAudio.debug().contextState, "running", "race: no AudioContext");
    assert.equal(sb.GameAudio.debug().engineOn, true, "race: startEngine() returned on a null ctx — silent car");
  } finally { g.close(); }
});

test("the saved camera's audio mix survives the LAZY_AUDIO reinjection", async () => {
  const { g, sb } = await bootAndGesture();
  try {
    sb.GameAudio.init();   // isolate from the test above: a SOUND click's context
    await g.race("monza", "day", "dry");
    assert.equal(g.G.camMode, 19, "precondition: default camera is helmet (game.js:833)");
    assert.equal(sb.GameAudio.cameraMix().kind, "onboard", "helmet camera but the engine plays the chase mix");
  } finally { g.close(); }
});

test("desktop shell binds LAZY_AUDIO at boot without a title gesture", async () => {
  let fa = null;
  const g = await createGame({
    carMeshes: false,
    onSandbox: (sb) => {
      sb.window.__APEX_NATIVE__ = Object.freeze({ desktop: true });
      fa = install(sb);
    },
  });
  const sb = g.sandbox;
  try {
    assert.equal(sb.GameAudio._stub, true, "precondition: title still starts on the stub");
    await settle(() => !sb.GameAudio._stub, 4000);
    await turns(50);
    assert.equal(fa.made.length, 1, "desktop: AudioContext exists without a title tap");
    assert.equal(sb.GameAudio.debug().contextState, "running");
  } finally { g.close(); }
});

test("web boot still waits for the first gesture before creating an AudioContext", async () => {
  let fa = null;
  const g = await createGame({ carMeshes: false, onSandbox: (sb) => { fa = install(sb); } });
  try {
    await turns(80);
    assert.equal(g.sandbox.GameAudio._stub, true);
    assert.equal(fa.made.length, 0, "web: no AudioContext until the player gestures");
  } finally { g.close(); }
});

test("the saved AUDIO DRIVING CUES level survives the LAZY_AUDIO reinjection", async () => {
  const { g, sb } = await bootAndGesture({ audioCues: 7 });
  try {
    sb.GameAudio.init();
    await g.race("monza", "day", "dry");
    g.apex.setInput({ throttle: true, steer: 0 });
    for (let i = 0; i < 60 * 40; i++) { g.step(1); sb.DrivingCues.tick(); if (i % 6 === 0) await new Promise((r) => setTimeout(r, 1)); }
    const d = sb.DrivingCues.debug();
    assert.equal(d.level, 7, "slider restored to CUES 7 but the real module starts at level " + d.level);
    assert.ok(d.brakeFired + d.callFired > 0, "40 s at Monza with CUES 7: no brake tone or corner call");
  } finally { g.close(); }
});
