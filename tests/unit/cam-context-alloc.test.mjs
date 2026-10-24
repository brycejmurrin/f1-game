/* cam-context-alloc.test.mjs — the camera tuner reads the stored track/team once per Store revision (CPU-HUNT-2026-10-24 C6).
 *
 * js/camera/offsets.js scopeKey() resolves the track/car override scope on every knob read, and the rig reads a
 * dozen knobs a rendered frame (vantage headOffset, fovBias, buzzAmp, rollTarget, comfortGet ...). Each call ran
 * refreshStoredContext(): two Store.get, each building an "apex26." + key string, ~0.8 KB of strings a frame in the
 * game-vm heap profile. It now re-reads only when store.rev (bumped by every set / clear / import / foreign-tab
 * write) or Teams.LIST moved. Pinned here, on the real offsets.js in a VM with a counting store:
 *   1. 200 knob reads with storage unchanged cost at most one trackId/team read pair (fails before: hundreds);
 *   2. a Store write (team) is seen by the very next read;
 *   3. setContext() is still overridden by stored values on the next read, as before the memo;
 *   4. a Teams.LIST swap with no Store write re-reads (a roster change can re-map the team index);
 *   5. a store mock with no numeric rev keeps the read-every-call behaviour.
 *
 * Run: node --test tests/unit/cam-context-alloc.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(root, "js/camera/offsets.js"), "utf8");

function load(disk, { withRev = true } = {}) {
  const reads = { trackId: 0, team: 0 };
  const store = {
    get(k, d) { if (k in reads) reads[k]++; return disk.has(k) ? disk.get(k) : d; },
    set(k, v) { disk.set(k, v); if (withRev) this.rev++; return true; },
  };
  if (withRev) store.rev = 0;
  const ctx = {
    GameStore: { store },
    Teams: { LIST: [{ id: "mclaren" }, { id: "ferrari" }, { id: "williams" }] },
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) },
    Log: { info() {}, debug() {}, enabled() { return false; } },
  };
  vm.runInNewContext(SRC + "\nthis.exported = CamTune;", ctx, { filename: path.join(root, "js/camera/offsets.js") });
  const C = ctx.exported;
  C.importPack({ v: 2, global: { dist: 1 },
    cars: { mclaren: { modes: { chase: { dist: 2 } } }, ferrari: { modes: { chase: { dist: 4 } } }, williams: { modes: { chase: { dist: 6 } } } },
    tracks: { monza: { modes: { chase: { dist: 3 } } } } });
  return { C, ctx, store, reads };
}

test("knob reads with storage unchanged re-read the stored context at most once", () => {
  const disk = new Map([["team", 0]]);
  const { C, reads } = load(disk);
  C.get("chase", "dist");   // first read after the import's writes
  reads.trackId = reads.team = 0;
  for (let i = 0; i < 200; i++) { C.get("chase", "dist"); C.comfortGet("bob"); C.values("chase"); }
  assert.ok(reads.trackId <= 1 && reads.team <= 1, `200 rounds of knob reads read trackId ${reads.trackId}x, team ${reads.team}x`);
  assert.equal(C.get("chase", "dist"), 2, "mclaren's override");
});

test("a Store write is seen by the next read", () => {
  const disk = new Map([["team", 0]]);
  const { C, store } = load(disk);
  assert.equal(C.get("chase", "dist"), 2);
  store.set("team", 1);
  assert.equal(C.get("chase", "dist"), 4, "ferrari after the team write");
  store.set("trackId", "monza");
  assert.equal(C.get("chase", "dist"), 3, "the monza track override after the trackId write");
});

test("setContext is still overridden by stored values on the next read", () => {
  const disk = new Map([["team", 0], ["trackId", "spa"]]);
  const { C } = load(disk);
  assert.equal(C.get("chase", "dist"), 2);
  C.setContext("monza", "ferrari");
  // Stored trackId "spa" and team 0 win over the explicit context, exactly as before the memo.
  assert.equal(C.get("chase", "dist"), 2);
  assert.deepEqual({ ...C.context() }, { track: "spa", car: "mclaren" });
});

test("a Teams.LIST swap with no Store write re-reads the team", () => {
  const disk = new Map([["team", 0]]);
  const { C, ctx } = load(disk);
  assert.equal(C.get("chase", "dist"), 2);
  ctx.Teams.LIST = [{ id: "williams" }];
  assert.equal(C.get("chase", "dist"), 6, "index 0 is williams in the new roster");
});

test("a store without a numeric rev keeps reading every call", () => {
  const disk = new Map([["team", 0]]);
  const { C, reads } = load(disk, { withRev: false });
  C.get("chase", "dist");
  reads.team = 0;
  for (let i = 0; i < 10; i++) C.get("chase", "dist");
  assert.ok(reads.team >= 10, `no rev: ${reads.team} team reads over 10 knob reads`);
  disk.set("team", 1);
  assert.equal(C.get("chase", "dist"), 4);
});
