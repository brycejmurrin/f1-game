/* finish-coast-rev-vm.test.mjs — finished cars wind rpm down with coast speed, not crossing revs.
 * Run: node --test tests/unit/finish-coast-rev-vm.test.mjs
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

async function bootOneLapRace() {
  let fa = null;
  const g = await createGame({ carMeshes: false, onSandbox: (sb) => { fa = install(sb); } });
  const sb = g.sandbox;
  sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });
  await settle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  sb.GameAudio.init();
  await g.race("monza", "day", "dry", { laps: 1 });
  return { g, sb, fa };
}

async function crossFinishLine(g) {
  const G = g.G;
  const p = G.player;
  g.apex.setInput({ throttle: true, steer: 0 });
  g.step(60 * 6);
  for (let k = 0; k < 2 && !p.finished; k++) {
    g.apex.jump(0.985, 75, 0);
    for (let i = 0; i < 300 && !(k === 1 ? p.finished : p.lap >= 1); i++) g.step(1);
  }
  assert.equal(p.finished, true, "player must finish");
  g.apex.setInput({ throttle: false, steer: 0 });
  return p;
}

test("solo finisher: rpm falls with coast speed, not pinned on the limiter", async () => {
  const { g, sb } = await bootOneLapRace();
  try {
    const p = await crossFinishLine(g);
    const PC = sb.PhysicsConsts;
    const rpmCross = p.rpm;
    for (let i = 0; i < 120; i++) g.step(1);
    assert.ok(p.speed < 25, "car must have slowed after finish");
    assert.ok(p.rpm < rpmCross - 1000, "rpm must drop after the line, not hold crossing revs");
    assert.ok(p.rpm <= PC.IDLE_RPM + 500 || p.rpm < rpmCross * 0.7, "rpm tracks the crawl toward idle");
  } finally { g.close(); }
});

test("VS FRIEND wait: finisher rpm reaches idle while the other human is still running", async () => {
  const { g, sb } = await bootOneLapRace();
  try {
    const G = g.G;
    const p = G.player;
    const i = G.cars.findIndex((c) => c !== p);
    g.apex.carRole(i, { human: true, local: false });
    await crossFinishLine(g);
    const PC = sb.PhysicsConsts;
    for (let i = 0; i < 600 && G.state === "race"; i++) g.step(1);
    assert.equal(G.state, "race", "results must still wait for the friend");
    assert.ok(p.speed < 15, "finisher crawls while waiting");
    assert.equal(p.rpm, PC.IDLE_RPM, "finisher engine idles while waiting for friend");
  } finally { g.close(); }
});

// game.js's finished-car branch (updateCar: `c.finished && !netPlay.owns(c)`) runs for
// AI finishers too; only the player was ever checked. The friend keeps the race live
// while one AI car crosses (finished set as the line would set it), then coasts.
test("AI finisher: the same coast branch winds its rpm to the crawl, not the crossing revs", async () => {
  const { g, sb } = await bootOneLapRace();
  try {
    const G = g.G, PC = sb.PhysicsConsts;
    const friend = G.cars.findIndex((c) => c !== G.player);
    g.apex.carRole(friend, { human: true, local: false });
    g.apex.setInput({ throttle: true, steer: 0 });
    g.step(60 * 8);
    const ai = G.cars.find((c, i) => i !== friend && c !== G.player && !c.retired && c.speed > 20);
    assert.ok(ai, "a rival at racing speed");
    const rpmCross = ai.rpm;
    assert.ok(rpmCross > PC.IDLE_RPM + 3000, "crossing revs: " + rpmCross);
    ai.finished = true;
    const samples = [];
    for (let i = 0; i < 900 && G.state === "race"; i++) { g.step(1); if (i % 30 === 29) samples.push({ rpm: ai.rpm, v: ai.speed, gear: ai.gear }); }
    assert.equal(G.state, "race", "the humans are still running");
    assert.ok(ai.speed < 15, "the AI finisher coasts to a crawl: " + ai.speed);
    // rpm = rpmFor(gear, coast speed): above the idle floor, rpm / speed is the
    // gear's constant on every sample (5 %: later steps of the frame move speed
    // after the rpm write) — it rises and falls WITH the car.
    const live = samples.filter((x) => x.rpm > PC.IDLE_RPM + 1 && x.gear === samples[0].gear && x.v > 1);
    assert.ok(live.length >= 3, "the coast has samples above idle: " + JSON.stringify(samples.slice(0, 4)));
    const k = live[0].rpm / live[0].v;
    for (const x of live) assert.ok(Math.abs(x.rpm / x.v - k) < 0.05 * k, `rpm ${x.rpm} at ${x.v} m/s left the gear line ${k}`);
    assert.ok(ai.rpm < 0.5 * rpmCross, `AI finisher rpm ${ai.rpm} must track its crawl, not hold its crossing ${rpmCross}`);
  } finally { g.close(); }
});
