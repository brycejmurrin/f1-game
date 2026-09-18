/* flyby-lighting — the loading-screen flyby is lit by what the MENU chose.
 *
 * THE DEFECT, reported 2026-09-18: "I did a race with dawn and the loading
 * screen rendered in day."
 *
 * THE ORDERING THAT CAUSED IT. js/race/race-settings.js calls
 * raceIntro(startRace); raceIntro hands startRace to loadingScreen.run(), whose
 * own header says it runs that callback "once the card is up". startRace then
 * spends its first ~1.1 s inside loadTrack() — measured 1296 ms of a 1327 ms
 * startRace on macos-latest — and only reaches applyRaceSettings() after
 * makeCars() and the format branches. The flyby plays across that whole window,
 * so the cinematic covered a rebuild nothing had lit for this session's time of
 * day yet. race-settings.js says as much in its own comment: the loading screen
 * exists because this route "pays ~1.1 s of synchronous track build, which the
 * screen covers".
 *
 * THE FIX is one idempotent call before the screen goes up, not a reordering of
 * startRace: applyRaceSettings() re-runs on every lighting-slider tick by
 * design, so calling it twice costs a pass and removes the window entirely.
 *
 * WHY A SOURCE GUARD AND NOT A RENDER TEST. This container has no GPU and the
 * menu chrome covers #game, so a screenshot here photographs the UI rather than
 * the sky — that was established the hard way while hunting this, along with
 * the fact that lightState() reports INTENT and stays correct even when the
 * picture would not be. What is checkable without a real GPU is the ordering,
 * and the ordering is the defect.
 *
 * Run: node --test tests/unit/flyby-lighting.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");

/** The body of `name` with its comments stripped, sliced to its real closing
 *  brace. BOTH halves matter: an earlier draft of this guard matched the prose
 *  in raceIntro's own comment — which names loadingScreen.run() before it names
 *  applyRaceSettings() — and so failed against correct code. A guard that reads
 *  comments is measuring the explanation, not the behaviour. */
function bodyOf(name) {
  const at = SRC.indexOf(name);
  assert.ok(at >= 0, name + " is gone from js/game.js — this guard is reading the wrong file");
  let depth = 0, started = false, end = SRC.length;
  for (let i = SRC.indexOf("{", at); i < SRC.length; i++) {
    const c = SRC[i];
    if (c === "{") { depth++; started = true; }
    else if (c === "}") { depth--; if (started && depth === 0) { end = i; break; } }
  }
  return SRC.slice(at, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments
    .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1"); // line comments
}

test("raceIntro lights the scene before the loading screen runs", () => {
  const body = bodyOf("function raceIntro(");
  const apply = body.indexOf("applyRaceSettings()");
  const run = body.indexOf("loadingScreen.run(");
  assert.ok(apply > 0,
    "raceIntro no longer calls applyRaceSettings() — the flyby is back to rendering whatever lighting " +
    "happened to be current, which shows a dawn race as a day loading screen");
  assert.ok(run > 0, "raceIntro no longer runs the loading screen — this guard is reading the wrong function");
  assert.ok(apply < run,
    "raceIntro applies the race settings AFTER starting the loading screen, so the first frames of the " +
    "flyby are still unlit for this session — it has to come first");
});

test("startRace still re-applies after its rebuild", () => {
  // The call in raceIntro removes the WINDOW; it does not replace this one.
  // loadTrack() rebuilds the world, and the rebuilt world has to be lit too.
  const body = bodyOf("async function startRace(");
  const load = body.indexOf("loadTrack(trackIdx)");
  const apply = body.indexOf("applyRaceSettings()");
  assert.ok(load > 0 && apply > 0, "startRace must still loadTrack and applyRaceSettings");
  assert.ok(apply > load,
    "startRace must apply the race settings AFTER loadTrack rebuilds the world, or the rebuild ships unlit");
});
