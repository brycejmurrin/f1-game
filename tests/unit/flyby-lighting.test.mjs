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
import vm from "node:vm";

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
  // startRace() itself is now a thin re-entrancy-latch wrapper (see
  // start-race-latch.test.mjs) around startRaceBody(), which carries this flow.
  const body = bodyOf("async function startRaceBody(");
  const load = body.indexOf("loadTrack(trackIdx)");
  const apply = body.indexOf("applyRaceSettings()");
  assert.ok(load > 0 && apply > 0, "startRace must still loadTrack and applyRaceSettings");
  assert.ok(apply > load,
    "startRace must apply the race settings AFTER loadTrack rebuilds the world, or the rebuild ships unlit");
});

/* ── THE LENS, NOT THE LIGHT ──────────────────────────────────────────────────
 *
 * Reported 2026-09-18, with a screenshot of each: "why does the loading flyby
 * look way more foggy than what's shown in the editor". It was not the lighting
 * — it was that the same shot was RENDERED two different ways.
 *
 * __apex.flybyCam() parks the editor's preview through `dbgCam`, and js/game.js
 * gives a dbgCam frame photo mode's treatment: far plane 6000 m, fog × 0.15, no
 * fog-wall cull on the scenery. The live screen sets eye/target/fov directly, so
 * it got gameplay's numbers instead: 900 m and 100 % fog. From a crane 190 m up
 * looking down a 5.8 km circuit that is the difference between a vista and a
 * wall of haze.
 *
 * FlybySeq.FAR and FlybySeq.FOG are now the one pair both ends read. These
 * guards pin that neither end goes back to a literal.
 */

test("the cinematic's render numbers live in one place, as numbers", () => {
  // Evaluated, not grepped: an unexported FAR leaves dbgCam.far undefined, which
  // makes the projection matrix NaN and the preview a black frame — a regex on
  // the export list would not have caught that.
  const sb = { Math, JSON, Object, Array, Number, String, isFinite, console };
  sb.window = sb;
  vm.runInNewContext(
    fs.readFileSync(new URL("../../js/camera/flyby-seq.js", import.meta.url), "utf8")
      .replace(/^const\b/gm, "var"), sb, { filename: "js/camera/flyby-seq.js" });
  const FS = sb.FlybySeq;
  assert.ok(FS, "js/camera/flyby-seq.js assigns the FlybySeq global");
  assert.equal(typeof FS.FAR, "number", "FlybySeq.FAR is the flyby's far plane, and it must be exported");
  assert.ok(FS.FAR > 2000, "a cinematic far plane has to reach across a circuit, not a corner");
  assert.equal(typeof FS.FOG, "number", "FlybySeq.FOG is its fog scale, and it must be exported");
  assert.ok(FS.FOG > 0 && FS.FOG < 1, "the fog is THINNED for the flyby — 0 would flatten it, 1 is the defect");
});

test("one flag decides the whole lens, and the preview carries it", () => {
  // `cine` is what makes the two paths one path. Every lens term below reads it;
  // if any of them went back to asking `dbgCam` instead, the editor would be
  // rendering a debug free camera again and the screen would be rendering
  // gameplay — which is what the two screenshots in the report showed.
  const body = bodyOf("function render(");
  assert.match(body, /if \(dbgCam && dbgCam\.cine\) cine = true;/,
    "the editor's preview must be recognised as the cinematic it is previewing");
  assert.match(body, /if \(dbgCam \|\| cine\) \{\s*\n\s*camRoll = 0;/,
    "the live flyby would otherwise inherit the roll the last race left behind, and decay it over the " +
    "first half-second of a shot the editor showed level");
  assert.match(body, /const _near = cine \? FlybySeq\.NEAR/,
    "an inherited near plane is whichever camera MODE the player last raced in — 0.3 for cockpit, 0.9 " +
    "otherwise — so the same shot would render with two different depth budgets");
  assert.match(body, /const _fogMul = cine \? FlybySeq\.FOG/,
    "cine must be asked BEFORE dbgCam: a plain debug free camera keeps its own fog default, and photo " +
    "mode passes 1.0 explicitly");
  assert.match(body, /frame\.cullDist = \(dbgCam \|\| cine\)/,
    "thinning the fog while culling scenery at the unthinned fog wall trades haze for a hard edge of " +
    "missing world");

  const apex = fs.readFileSync(new URL("../../js/agent/apex.js", import.meta.url), "utf8");
  assert.match(apex, /fog: FlybySeq\.FOG, cine: true,/, "flybyCam must stamp the marker on its dbgCam");
});

test("both the live screen and the editor's preview read them", () => {
  const body = bodyOf("function render(");
  assert.match(body, /farPlane = FlybySeq\.FAR/,
    "the live flyby renders at gameplay's 900 m far plane, so a shot the editor framed across a whole " +
    "circuit arrives as a wall of fog");
  assert.match(body, /const _fogMul = cine \? FlybySeq\.FOG/,
    "the live flyby renders at the session's full fog density while the editor previews it thinned");
  // The wide-screen FOV cap keeps the CAR a readable size. A crane shot has no
  // car in it, the editor previews the authored angle, and an 80 deg shot on a
  // 2:1 screen would arrive squeezed to 50 — MEASURED live before this landed.
  assert.match(body, /if \(!cine\) \{[\s\S]{0,200}fovYCap/,
    "the cinematic must fly the angle it was framed at, not the gameplay cap");

  const apex = fs.readFileSync(new URL("../../js/agent/apex.js", import.meta.url), "utf8");
  const at = apex.indexOf("flybyCam(u, shots)");
  assert.ok(at > 0, "__apex.flybyCam is gone — this guard is reading the wrong file");
  const cam = apex.slice(at, apex.indexOf("\n  },", at));
  assert.match(cam, /far: FlybySeq\.FAR/, "the preview must not pin its own far plane");
  assert.match(cam, /fog: FlybySeq\.FOG/, "the preview must not fall through to photo mode's fog default");
});
