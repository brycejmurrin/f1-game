/* end-race-music-vm.test.mjs — race music stops on the results sheet; one finish fanfare per race end.
 * Run: node --test tests/unit/end-race-music-vm.test.mjs
 *      npm run test:audio-unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame, settle } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
const { install } = require("./fake-audio-vm.cjs");

function audioCallLog(sb) {
  const log = [];
  for (const name of ["startMusic", "stopMusic", "finish"]) {
    const orig = sb.GameAudio[name].bind(sb.GameAudio);
    sb.GameAudio[name] = (...args) => {
      log.push({ fn: name, args });
      return orig(...args);
    };
  }
  return log;
}

async function bootRaceAudio() {
  let fa = null;
  const g = await createGame({ carMeshes: false, onSandbox: (sb) => { fa = install(sb); } });
  const sb = g.sandbox;
  sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });
  await settle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  sb.GameAudio.init();
  const log = audioCallLog(sb);
  await g.race("monza", "day", "dry", { laps: 1 });
  g.G.soundOn = true;
  return { g, sb, log };
}

test("endRace stops race music and plays the finish fanfare once", async () => {
  const { g, log } = await bootRaceAudio();
  try {
    const before = log.length;
    g.G.endRace();
    assert.equal(g.G.state, "results");
    const tail = log.slice(before);
    assert.ok(tail.some((e) => e.fn === "stopMusic"), "endRace must stop the race soundtrack");
    assert.equal(tail.filter((e) => e.fn === "finish").length, 1, "exactly one finish fanfare per race end");
    const stopIdx = tail.findIndex((e) => e.fn === "stopMusic");
    const finIdx = tail.findIndex((e) => e.fn === "finish");
    assert.ok(stopIdx >= 0 && finIdx >= 0 && stopIdx < finIdx, "stop music before the fanfare");
  } finally { g.close(); }
});

test("season finale champion sheet does not trigger a second finish fanfare", async () => {
  const { g, sb, log } = await bootRaceAudio();
  try {
    g.G.endRace();
    const afterEnd = log.filter((e) => e.fn === "finish").length;
    assert.equal(afterEnd, 1);
    g.G.season = { round: sb.SeasonCal.rounds(), pts: {}, driverCodes: {} };
    sb.GameResults.create(g.G).buildChampion();
    assert.equal(log.filter((e) => e.fn === "finish").length, afterEnd,
      "buildChampion must not call finish again");
  } finally { g.close(); }
});

test("quitToMenu from results restarts menu music", async () => {
  const { g, log } = await bootRaceAudio();
  try {
    g.G.endRace();
    const before = log.length;
    g.G.quitToMenu();
    assert.equal(g.G.state, "menu");
    const menu = log.slice(before).find((e) => e.fn === "startMusic" && e.args[0] === -1);
    assert.ok(menu, "returning to MAIN MENU must start menu music (startMusic(-1))");
  } finally { g.close(); }
});

test("source: endRace stops music; buildChampion does not re-finish", () => {
  const game = readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const sheet = readFileSync(path.join(ROOT, "js/ui/results-sheet.js"), "utf8");
  assert.match(game, /GameAudio\.stopEngine\(\); GameAudio\.setSkid\(0\); GameAudio\.stopRain\(\);\s*GameAudio\.stopMusic\(\)/,
    "endRace stops the race loop with the other race SFX");
  assert.match(game, /Particles\.rainShow\(false\);\s*if \(soundOn\) GameAudio\.finish\(\);/,
    "endRace still owns the single finish fanfare");
  assert.doesNotMatch(sheet, /function buildChampion\(\)[\s\S]*GameAudio\.finish\(\)/,
    "champion sheet must not stack a second fanfare");
});
