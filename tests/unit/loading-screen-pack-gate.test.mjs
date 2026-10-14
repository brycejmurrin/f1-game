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
