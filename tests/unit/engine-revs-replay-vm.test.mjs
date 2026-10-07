/* engine-revs-replay-vm.test.mjs — REAL REPLAY WATCH cars derive rpm from speed, not IDLE_RPM.
 * Run: node --test tests/unit/engine-revs-replay-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame, settle } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
const { install } = require("./fake-audio-vm.cjs");

const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/openf1-baku-2026-race.json"), "utf8"));

function line(p0, v, x, t0, t1) {
  const t = [], prog = [], xs = [];
  for (let tt = t0; tt <= t1 + 1e-9; tt += 0.5) {
    t.push(tt);
    prog.push(tt < 0 ? p0 : p0 + v * tt);
    xs.push(x);
  }
  return { t, prog, x: xs };
}

test("WATCH followed car and rivals rev with speed, not idle rpm", async () => {
  let fa = null;
  const g = await createGame({ track: "baku", carMeshes: false, onSandbox: (sb) => { fa = install(sb); } });
  try {
    const sb = g.sandbox;
    const G = g.G;
    sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });
    await settle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
    sb.GameAudio.init();
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/real-race-tab.js"), "utf8"), g.ctx);
    const D = vm.runInContext("DataRealRace", g.ctx);
    const Teams = vm.runInContext("Teams", g.ctx);
    const Tracks = vm.runInContext("Tracks", g.ctx);
    const script = D.build(FIXTURE, (n) => Teams.LIST.find((t) => t.name === n) || null, Tracks.LIST);
    const RR = vm.runInContext("RealRace", g.ctx);
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0, -5, 200), 16: line(-24, 50, 2, -5, 200) } };
    const prev = G.cars;
    RR.launch(script, { seat: "RUS", watch: true, camera: "heli", traces, startLap: 1 });
    await settle(() => G.cars !== prev && G.track && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);
    g.apex.go();
    g.step(60 * 6);
    const PC = sb.PhysicsConsts;
    const p = G.player;
    const lec = G.cars.find((c) => c.code === "LEC");
    assert.equal(RR.replay().owns(p), true);
    assert.ok(p.speed > 40, "followed car must be at race speed");
    assert.notEqual(p.rpm, PC.IDLE_RPM, "followed car rpm must track speed");
    assert.notEqual(lec.rpm, PC.IDLE_RPM, "rival replay puppet rpm must track speed");
    const voices = sb.GameAudio.rivalState().filter((v) => v.gain > 0.001);
    assert.ok(voices.some((v) => v.hz > 200), "rival voice must be race pitch, not idle hz");
  } finally { g.close(); }
});
