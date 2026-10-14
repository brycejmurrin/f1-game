/* loading-screen-pack-gate.test.mjs — race-entry packSettled / warmPresentReady gate.
 *
 * Garage #1477 gated SETUP presents on packSettled; race entry uses the same
 * predicate on LoadingScreen so cold Start Race cannot arm gfx.warm() while
 * createTextureArray still owns the main thread.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(path.join(ROOT, "js/ui/loading-screen.js"), "utf8");

function load() {
  const sandbox = { console, performance: { now: () => 0 } };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(SRC.replace(/^const\b/m, "var"), sandbox, { filename: "loading-screen.js" });
  return sandbox.LoadingScreen;
}

test("packSettled: uploaded / error / unsupported / off settle; in-flight does not", () => {
  const LS = load();
  assert.equal(LS.packSettled(null), true);
  assert.equal(LS.packSettled({ supported: false }), true);
  assert.equal(LS.packSettled({ supported: true, uploaded: true }), true);
  assert.equal(LS.packSettled({ supported: true, uploaded: false, error: "no-pack" }), true);
  assert.equal(LS.packSettled({ supported: true, uploaded: false, tier: "off" }), true);
  assert.equal(LS.packSettled({ supported: true, uploaded: false, error: null, tier: null }), false);
  assert.equal(LS.warmPresentReady({ supported: true, uploaded: false, error: null, tier: null }), false);
  assert.equal(LS.warmPresentReady({ supported: true, uploaded: true }), true);
});

test("instance exposes the same packSettled gate", () => {
  const LS = load();
  const screen = LS.create({
    $: () => null,
    Tracks: { LIST: [] },
    TrackMaps: {},
    Flags: {},
    store: { get: () => 0, set() {} },
    announcer: () => null,
    radio: () => null,
  });
  assert.equal(typeof screen.packSettled, "function");
  assert.equal(screen.packSettled({ supported: true, uploaded: false, error: null, tier: null }), false);
  assert.equal(screen.warmPresentReady({ supported: true, uploaded: true }), true);
});

test("startRaceBody settles the pack before setState(count) — FlyingStart must not burn the run-up", () => {
  // Quali FLYING lap (CI #1493 tip-red): awaitPackSettled after count let
  // FlyingStart.arm → goRolling drive ~300 m of run-up while createTextureArray
  // ran; prog landed ≈ −24 instead of < −100.
  const game = readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const body = game.slice(
    game.indexOf("async function startRaceBody()"),
    game.indexOf("const sessionEntry = SessionEntry.create();"));
  const settle = body.indexOf("await awaitPackSettled");
  const count = body.indexOf('setState("count", "race-start")');
  assert.ok(settle > 0, "startRaceBody awaits pack settle");
  assert.ok(count > 0, "startRaceBody arms countdown");
  assert.ok(settle < count, "pack settle must finish before count (FlyingStart arms on enter)");
});
