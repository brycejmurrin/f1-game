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
