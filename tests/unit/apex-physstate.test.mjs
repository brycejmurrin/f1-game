/* apex-physstate.test.mjs — __apex.physState() with no track (audit4 hunt-core-b B3).
 * A stepped rebuild or the menu flyby drop nulls G.track while the last race's player
 * keeps px; physState() used to hand null to Tracks.sample and throw in a spec's poll.
 * Run: node --test tests/unit/apex-physstate.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedStore } from "../helpers/seed-store.mjs";

function loadApex(G, extra) {
  const context = vm.createContext(Object.assign({
    CamModes: { CAM_MODES: [{ id: "chase" }] }, LightTune: { TUNE_DEFS: [], LT: {} },
    AgentView: { create: () => ({}) },
  }, extra));
  const load = (f) => vm.runInContext(fs.readFileSync(absSrc("js/agent/" + f), "utf8"), context, { filename: absSrc("js/agent/" + f) });
  for (const f of ["apex-net.js", "apex-cam.js", "apex-track.js", "apex-lobby.js", "apex.js"]) load(f);
  return vm.runInContext("ApexApi", context).create(G);
}

// building: true = the stepped rebuild window, so the hook wrapper does not auto-load a track.
test("physState() reports no track instead of sampling a null track", () => {
  let sampled = 0;
  const api = loadApex({ player: { px: 3, pz: 4, s: 10, speed: 20 }, track: null, cars: [] },
    { Tracks: { building: () => true, sample: (t) => { sampled++; if (!t) throw new TypeError("null track"); } } });
  assert.equal(JSON.stringify(api.physState()), JSON.stringify({ error: "no track" }));   // cross-realm object: compare by value
  assert.equal(sampled, 0);
});

test("physState() is still null before the player is placed", () => {
  const api = loadApex({ player: { px: null }, track: null, cars: [] }, { Tracks: { building: () => true, sample: () => {} } });
  assert.equal(api.physState(), null);
});

// Perf hunt 9: the METRICS overlay (js/perf/metrics-overlay.js) polls __apex at 4 Hz. perf() ran
// PerfGov.frameStats() (a copy + sort of the 2048-frame ring) for a panel that reads none of it, and
// physState() asked DamageHandling.axles() twice and coach.status() once per call.
function fullG(counts) {
  const player = { px: 1, pz: 2, s: 10, x: 0, speed: 30, prog: 0, head: 0, lap: 1 };
  const n = () => 1;
  return {
    player, track: {}, cars: [player], smp: { t: [0, 0, 1] }, LONG_GRIP: 1, gripMult: n,
    gfx: { getRenderScale: () => 1 },
    coach: { status() { counts.coach++; return "ok"; } },
    aeroDfMult: n, xVmaxGain: n, xDfLoss: n, drainFor: n, regenFor: n, otTimeFor: n,
    tyres: { spent: () => 0, gripMul: n },
  };
}
function fullExtra(counts) {
  const PerfGov = { frameStats() { counts.frameStats++; return { p50: 16 }; } };
  for (const k of ["fpsEMA", "floorMs"]) PerfGov[k] = () => 16.7;
  for (const k of ["autoRes", "tier", "autoTier", "autoShed", "openWindow", "userTier", "tierFloor", "strikes", "scaleFutile", "tierFutile", "tierHold"]) PerfGov[k] = () => 0;
  return {
    PerfGov,
    Tracks: { building: () => false, sample: (t, s, out) => { out.t = [0, 0, 1]; } },
    AgentView: { create: () => ({}), slipBudget: () => ({ axFrac: 0.5, slipFactor: 0.9 }) },
    DamageHandling: { axles() { counts.axles++; return { f: 1, r: 0.95 }; }, isEnabled: () => true },
    OvertakeMode: { mj: () => 0.5 },
  };
}
function loadOverlay(apex) {
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number, Map, isNaN, isFinite,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { search: "" }, __apex: apex });
  seedLog(ctx);
  seedStore(ctx);
  vm.runInContext(fs.readFileSync(absSrc("js/perf/metrics-overlay.js"), "utf8"), ctx, { filename: absSrc("js/perf/metrics-overlay.js") });
  return vm.runInContext("GameMetrics", ctx);
}

test("the METRICS overlay's 4 Hz reads skip frameStats and coach.status; physState asks axles once", () => {
  const counts = { frameStats: 0, axles: 0, coach: 0 };
  const api = loadApex(fullG(counts), fullExtra(counts));
  const full = api.physState();
  assert.deepEqual([counts.axles, counts.coach], [1, 1], "one physState() = one axles() and one coach.status()");
  assert.deepEqual([full.damageAxF, full.damageAxR, full.driving], [1, 0.95, "ok"]);
  assert.equal(api.perf().frameTimes.p50, 16, "no-arg perf() still carries frameTimes");
  assert.equal(api.renderScale().frameTimes.p50, 16);
  const lite = api.perf({ lite: true });
  assert.deepEqual([lite.frameTimes, lite.scale, lite.floorMs], [undefined, 1, 16.7]);
  assert.equal(api.physState({ lite: true }).driving, undefined);
  const M = loadOverlay(api);
  Object.assign(counts, { frameStats: 0, axles: 0, coach: 0 });
  for (let i = 0; i < 8; i++) M.snapshot();          // GOV page
  assert.equal(counts.frameStats, 0, "8 GOV snapshots sorted the frame ring");
  M.setPage("phys");
  for (let i = 0; i < 8; i++) M.snapshot();
  assert.deepEqual([counts.frameStats, counts.coach, counts.axles], [0, 0, 8], "PHYS snapshots: no frameStats, no coach.status, one axles each");
  assert.equal(M.snapshot().slipFactor, 0.9, "the panel still gets its fields");
});
