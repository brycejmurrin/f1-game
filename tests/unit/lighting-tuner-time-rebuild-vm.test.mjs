/* lighting-tuner-time-rebuild-vm.test.mjs — #6896 (hunt #6881 R4): the LIGHTING TUNER's TIME chips cross day
 * and dark mid-race. Each crossing was a synchronous Tracks.build on the main thread (open: the chip; close: the
 * restore), a multi-frame freeze per tap. Now a crossing schedules ONE stepped build (Tracks.buildPaced) on the
 * next task, coalesced, with the sim held while it runs; a tap back before it starts builds nothing.
 *
 * Run: node --test tests/unit/lighting-tuner-time-rebuild-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

async function raceWithTuner() {
  const g = await createGame({ carMeshes: false });
  await g.race("monza", "day", "dry");
  g.step(30);
  const S = g.sandbox, G = g.G, doc = S.document, $ = (id) => doc.getElementById(id);
  const n = { sync: 0, paced: 0 };
  const build = S.Tracks.build;
  S.Tracks.build = function () { n.sync++; return build.apply(this, arguments); };
  // The VM never pumps rAF, so the paced build is answered whole (its count is what the test reads).
  S.Tracks.buildPaced = async function (def, opts) { n.paced++; return build.call(S.Tracks, def, opts); };
  if (S.TrackBuildClient) S.TrackBuildClient.build = async () => null;   // no worker in the VM: the stepped path
  $("pausebtn").onclick();
  $("pm-settings").onclick();
  $("pm-open-visual").onclick();
  await $("pm-lighting").onclick();
  // The chips are built by tuner-panel.js under #lt-preview; the stub DOM indexes only static ids.
  const find = (el, id) => { if (!el) return null; if (el.id === id) return el; for (const c of el.children || el.childNodes || []) { const f = find(c, id); if (f) return f; } return null; };
  const chip = (id) => { const el = find($("lt-preview"), id) || $(id); assert.equal(typeof el.onclick, "function", "chip " + id); return el; };
  return { g, G, $, n, chip };
}
const drain = async (g) => {   // the deferred build: a setTimeout(0), then awaited steps
  for (let i = 0; i < 20; i++) { g.flushTimers(); await new Promise((r) => setImmediate(r)); }
};

test("tuner NIGHT chip then DONE on a day race: no synchronous Tracks.build, one deferred stepped build each way", async () => {
  const { g, G, $, n, chip } = await raceWithTuner();
  try {
    assert.equal(G.state, "race");
    chip("lt-tod-night").onclick();
    assert.equal(G.raceTimeOfDay, "night", "the chip moves the session's time at once");
    assert.equal(n.sync, 0, "the chip ran no synchronous Tracks.build on the tap's frame");
    assert.equal(n.paced, 0, "the rebuild is deferred to a later task, not this frame");
    await drain(g);
    assert.equal(n.paced, 1, "one stepped build for the crossing");
    assert.ok(G.track && G.track.def.id === "monza", "the night world landed");
    $("lt-close").onclick();
    assert.equal(G.raceTimeOfDay, "day", "DONE restores the race's time");
    assert.equal(n.sync, 0, "DONE ran no synchronous Tracks.build");
    await drain(g);
    assert.equal(n.sync, 0);
    assert.equal(n.paced, 2, "the restore is one stepped build too");
    assert.ok(G.track, "the day world landed");
  } finally { g.close(); }
});

test("NIGHT then DAY (or DONE) before the deferred build runs: no build at all", async () => {
  const { g, G, $, n, chip } = await raceWithTuner();
  try {
    chip("lt-tod-night").onclick();
    chip("lt-tod-dusk").onclick();   // still dark: the same pending build
    $("lt-close").onclick();      // back to day before the task ran
    await drain(g);
    assert.equal(n.sync, 0, "no synchronous build");
    assert.equal(n.paced, 0, "the day world still fits: nothing rebuilt");
    assert.equal(G.raceTimeOfDay, "day");
    assert.ok(G.track);
  } finally { g.close(); }
});

test("a crossing while the race runs: no sync build, frames pump clean, one stepped build, then the race runs on", async () => {
  const g = await createGame({ carMeshes: false });
  try {
    await g.race("monza", "day", "dry");
    const S = g.sandbox, G = g.G, n = { sync: 0, paced: 0 }, build = S.Tracks.build;
    S.Tracks.build = function () { n.sync++; return build.apply(this, arguments); };
    S.Tracks.buildPaced = async function (def, opts) { n.paced++; return build.call(S.Tracks, def, opts); };
    if (S.TrackBuildClient) S.TrackBuildClient.build = async () => null;
    let now = 1e6;
    const pump = (k) => { for (let i = 0; i < k; i++) g.pumpFrame(now += 16); };
    pump(40);
    assert.equal(G.state, "race");
    G.setTimeOfDay("night", { defer: true });
    pump(5);   // the frames before the deferred task: the old world still drives
    assert.equal(n.sync, 0, "no synchronous Tracks.build");
    await drain(g);
    assert.equal(n.paced, 1, "one stepped build");
    assert.equal(n.sync, 0);
    const t1 = G.raceT;
    pump(10);
    assert.ok(G.track && G.raceT > t1, "the race runs on the night world");
  } finally { g.close(); }
});

test("a flip back while the stepped build is in flight: the stale build is dropped, the right world lands, no sync build", async () => {
  const g = await createGame({ carMeshes: false });
  try {
    await g.race("monza", "day", "dry");
    const S = g.sandbox, G = g.G, n = { sync: 0, paced: 0 }, build = S.Tracks.build, gates = [];
    S.Tracks.build = function () { n.sync++; return build.apply(this, arguments); };
    S.Tracks.buildPaced = function (def, opts) {
      n.paced++;
      return new Promise((res) => gates.push(() => res(build.call(S.Tracks, def, opts))));
    };
    if (S.TrackBuildClient) S.TrackBuildClient.build = async () => null;
    G.setTimeOfDay("night", { defer: true });
    for (let i = 0; i < 10 && !gates.length; i++) { g.flushTimers(); await new Promise((r) => setImmediate(r)); }
    assert.equal(gates.length, 1, "the night build is in flight");
    G.setTimeOfDay("day", { defer: true });   // coalesced into the running loop
    gates.shift()();   // the night build finishes, superseded
    for (let i = 0; i < 20; i++) { if (gates.length) gates.shift()(); g.flushTimers(); await new Promise((r) => setImmediate(r)); }
    assert.equal(n.sync, 0, "no synchronous Tracks.build");
    assert.equal(n.paced, 2, "night (dropped) then day");
    assert.ok(G.track, "a world landed");
    assert.equal(G.raceTimeOfDay, "day");
  } finally { g.close(); }
});
