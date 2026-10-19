/* car-presentation-canary.test.mjs — source invariants: the car-presentation wiring a
 * VM cannot reach: ORDER and ONE-SITE facts in game.js's draw loop and step,
 * and the few cross-file parities (the mirror's wheel material is the main
 * pass's). Everything a draw BUILDS or KEYS is asked of the real CarDraw in
 * car-presentation-vm.test.mjs; a pin here earns its place by naming a site
 * the VM does not load (game.js, apex-cam.js, agentview.js, custom-team.js).
 *
 * Behaviour moved to car-presentation-vm.test.mjs (test review 2026-10-19, C1-02);
 * this file kept the canary path because js/car/car-draw.js cites it.
 *
 * Run: node --test tests/unit/car-presentation-canary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { fnSource } from "../helpers/fn-source.mjs";
import { gameSource, symbolSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const gameAndCustom = () => read("js/game.js") + read("js/career/custom-team.js");

test("render interpolates world px/pz for every car, not only humans", () => {
  const game = read("js/game.js");
  const pos = game.match(/function renderPosOf\([\s\S]*?\n\}/);
  const anc = game.match(/function playerAnchor\([\s\S]*?\n\}/);
  assert.ok(pos, "renderPosOf present");
  assert.ok(anc, "playerAnchor present");
  assert.match(pos[0], /if \(c\.px != null && c\.rPrevPx !== undefined\)/);
  assert.match(pos[0], /else if \(c\.px != null\)/);
  assert.doesNotMatch(pos[0], /c\.human && c\.px/);
  assert.match(anc[0], /if \(c\.px != null\)/);
  assert.doesNotMatch(anc[0], /c\.human && c\.px/);
});

// The player's skid stamp must run BEFORE the cockpit rig's `continue`. It sat
// after the body draw, so in cockpit view — CAM_MODES[3], the shipped default
// camera — the player never laid a mark (tlx-probes M6 read cam:"cockpit" with
// every stamp-gate term true and an empty batch). World state, not a draw.
test("the player's skid stamp precedes the cockpit-rig continue", () => {
  const game = read("js/game.js");
  const stamp = game.indexOf("skids.stamp(tmpMat,");
  // The branch also carries the VISOR eye (no rig, no body) since 2026-09-28.
  const cockpit = game.indexOf("if (c.isPlayer && (cockpitRigOnly || visorEye)) {");
  assert.ok(stamp > 0 && cockpit > 0, "both sites present");
  assert.ok(stamp < cockpit, `skids.stamp at ${stamp} must come before the cockpit branch at ${cockpit}`);
  assert.equal(game.split("skids.stamp(").length - 1, 1, "one stamp site");
});

test("xVis is a dump field — render and shadows do not damp it", () => {
  const game = read("js/game.js");
  assert.doesNotMatch(game, /damp\(\s*c\.xVis/);
  assert.doesNotMatch(game, /damp\([^;]*16,\s*dt\)/);
  const ground = game.match(/function currentCarGroundMat\([\s\S]*?function /);
  assert.ok(ground, "currentCarGroundMat present");
  assert.match(ground[0], /const renderX = cX;/);
  assert.doesNotMatch(ground[0], /damp\(/);
  const body = game.match(/c\.xVis = cX;[^\n]*\n\s*const renderX = cX;/);
  assert.ok(body, "body pass assigns xVis = cX and draws from cX");
});

test("AI world pose is mirrored after this step's (s, x) writes", () => {
  const game = read("js/game.js");
  const fn = game.match(/function updateCar\([\s\S]*?\nfunction rescuePlayer/);
  assert.ok(fn, "updateCar body present");
  // The advance pays the Frenet stretch since 2026-10-04 (verify-physics #2): ground ÷ h.
  const adv = fn[0].indexOf("if (!c.human) c.s = wrapS(c.s + c.speed * dt / hAi);");
  assert.match(fn[0], /const hAi = c\.human \? 1 : frenetH\(c\.s, c\.x\);/);
  const mirror = fn[0].lastIndexOf("if (!c.human) {\n    const w = worldFromTrack(c.s, c.x, smp);");
  assert.ok(adv >= 0, "AI advances s in Frenet");
  assert.ok(mirror > adv, "px/pz mirror must follow the s advance (and rescue)");
  const coast = game.match(/function coast\([\s\S]*?\nfunction /);
  assert.ok(coast, "coast present");
  assert.match(coast[0], /worldFromTrack\(c\.s, c\.x, smp\)/);
  assert.doesNotMatch(coast[0], /c\.human && c\.px/);
});

// game.js's draw loop: every procedural car draws a body-only mesh with its
// wheels planted on _groundMat (AI drew the factory FULL mesh on the chassis
// attitude matrix, so tyres leaned with the body). What those meshes are and
// how they key: car-presentation-vm.test.mjs.
test("the draw loop draws body + planted wheels for every procedural car", () => {
  const game = gameSource();
  const draw = game.match(
    /const body = carDraw\.modelBuf \? null :[\s\S]{0,520}drawPlayerWheels\(c, _groundMat/
  );
  assert.ok(draw, "body + wheels on _groundMat for every procedural car");
  assert.match(game, /FieldLod\.on && !c\.isPlayer && _lod >= 2 \? carDraw\.sharedRivalBodyMesh\(\) : teamBodyMesh\(c\.team, c\)/,
    "rivals past tier 2 share one distant body mesh");
  assert.match(game, /gfx\.draw\(teamMesh\(player\.team, player\), tmpMat, _ghostOpts\)/);
  // The player's pair takes the team so livery wheel tints (rimTint / caliperTint) join its cache key.
  const cd = read("js/car/car-draw.js");
  assert.match(cd, /const wm = c\.isPlayer \? getPlayerWheelMeshes\(c\.team\) : getFieldWheelMeshes\(c\.team, c\);/);
  assert.match(cd, /putBoundedMesh\(fieldWheelCache, fieldWheelOrder/,
    "field wheels must promote hits like every other mesh LRU");
  assert.match(cd, /for \(const k in fieldWheelCache\)[\s\S]{0,400}?fieldWheelOrder\.length = 0/,
    "loadCarModel must clear fieldWheelOrder with the cache (putBoundedMesh desync frees a live mesh)");
});

// MISFILED, kept until their owners' lanes give them a home: MY TEAM's live
// re-inject (custom-team.js) and agent error strings (js/agent/). They sat in
// the car-presentation canary with no car-presentation claim; nothing else
// pins them yet (grep, 2026-10-19).
test("MY TEAM foreign-tab sync and the customize preview keep the structural livery (misfiled pins)", () => {
  const custom = gameAndCustom();
  assert.match(custom, /change\.key === "customTeam"\)[\s\S]{0,80}?syncCustomTeam\(\)/,
    "foreign-tab customTeam writes must re-inject MY TEAM via syncCustomTeam");
  assert.match(custom, /change\.key === "customLogo"/,
    "foreign-tab customLogo writes must re-apply the emblem");
  assert.match(custom, /Object\.assign\(\{\}, DEFAULT_CUSTOM\.livery/,
    "cz-save must keep structural DEFAULT_CUSTOM.livery (finShape/spine*) under colour edits");
  assert.match(custom, /function czLivFromDialog\(\)/,
    "cz-save and czPreview share one structural+colour livery builder");
  assert.match(custom, /setLivDraftOverride\(\{ teamId: "custom", liv \}\)/,
    "czPreview must push the full structural draft, not bare {c1,c2}");
  assert.doesNotMatch(custom, /setLivDraftOverride\(\{ teamId: "custom", liv: \{ c1:/,
    "bare {c1,c2} override regrows the shark fin while customize is open");
});

test("agent error strings (misfiled pins)", () => {
  assert.match(read("js/agent/apex-net.js"), /error: "no_wire"/);
  assert.match(read("js/agent/apex.js"), /error: "invalid_repro"/);
  assert.match(read("js/agent/apex-lobby.js"), /ok: true, cleared: true/);
  assert.match(read("js/agent/apex.js"), /return \{ ok: true, bytes: blob\.size \}/);
});

test("orbit / agent-view read the mirrored world pose for the field", () => {
  const cam = read("js/agent/apex-cam.js");
  const view = read("js/agent/agentview.js");
  assert.match(cam, /const cx = \(c\.px != null\) \? c\.px/);
  assert.match(cam, /const cz = \(c\.pz != null\) \? c\.pz/);
  assert.doesNotMatch(cam, /c\.human && c\.px != null/);
  assert.match(view, /if \(c\.px != null\) return \[c\.px, c\.pz\];/);
  assert.doesNotMatch(view, /c\.human && c\.px != null/);
});

// The race warm builds the casters the shadow passes' first frame fetches, under
// the passes' own gate (car shadow below tier 3, lamp shadow below tier 2). The
// warm's half runs in car-presentation-vm.test.mjs; this pins that the pass and
// the warm still state the same gate and the same (team, car, true) key.
test("the shadow passes and the race warm share one caster gate and key", () => {
  const cd = read("js/car/car-draw.js");
  const sp = read("js/render/shared/shadow-pass.js");
  assert.match(sp, /deps\.teamMesh\(_shadowTeams\[i\], _shadowCars\[i\], true\)/, "the pass fetches casters by (team, car, true)");
  assert.match(sp, /G\.gfx\.carShadowBegin && LT\.carShadow && PerfGov\.tier\(\) < 3/);
  assert.match(sp, /G\.gfx\.lampShadowBegin && LT\.lampShadow && PerfGov\.tier\(\) < 2/);
  assert.match(cd, /gfx\.carShadowBegin && LT\.carShadow && tier < 3\) \|\| \(gfx\.lampShadowBegin && LT\.lampShadow && tier < 2\)/);
});

// The mirror's wheels share the main pass's material: TLX keys materials by
// VALUE, so equal opts are the one material (and pipeline) the race already
// compiled. What the mirror draws is asked of the real MirrorPass in
// car-presentation-vm.test.mjs; game.js is not in that VM.
test("the mirror's wheel material is the main pass's, night term included", () => {
  const cd = read("js/car/car-draw.js"), game = read("js/game.js");
  assert.match(game, /MirrorPass\.create\(G, \{ drawWorldMeshes, drawCar: carDraw\.drawMirrorCar,/);
  const lit = (src, re) => Object.assign({}, vm.runInNewContext("(" + src.match(re)[1] + ")"));
  assert.deepEqual(lit(cd, /const _mirWheelOpts = (\{[^}]*\});/), lit(game, /const _wheelOpts = (\{[^}]*\});/));
  assert.match(fnSource(cd, "function drawMirrorCar("), /_mirWheelOpts\.emissive = night \? 0\.12 : 0;/);
  assert.match(game, /_wheelOpts\.emissive = night \? 0\.12 : 0;/);
});

// ONE stamp helper (CarDraw.carVisual) keys every car in BOTH places: makeCars
// (the player and MY TEAM's hire on getTeamParts, a career rival on its shelf)
// and the menu prep's field, with the same `own` rule. The helper's behaviour
// is in car-presentation-vm.test.mjs; makeCars lives in game.js.
test("makeCars and the menu prep stamp cars through the one carVisual helper", () => {
  const cd = read("js/car/car-draw.js"), game = read("js/game.js");
  const prep = cd.slice(cd.indexOf("async function prepareMenuCarAssets("), cd.indexOf("function drawCarDecals("));
  assert.match(game, /\.\.\.CarDraw\.carVisual\(team, d\.num, isP \|\| mate, getTeamParts\),/, "makeCars stamps through the shared helper");
  assert.match(prep, /carVisual\(team, d\.num, ti === teamPick && \(isPlayer \|\| !!team\.custom\), G\.getTeamParts\)/, "…and so does the menu prep");
  assert.match(game, /const mate = !isP && ti === teamIdx && !!team\.custom;/, "the prep's own rule is makeCars' mate rule");
  const stampExpr = 'Parts.CATALOG.map((cat) => setup[cat.id] || "").join(",")';
  assert.equal(cd.split(stampExpr).length - 1, 1, "car-draw builds a stamp in ONE place");
  assert.equal((symbolSource("function makeCars(") + prep).split("Parts.CATALOG.map(").length - 1, 0, "neither makeCars nor the prep builds its own");
});

// game.js resolves the first-person caster right after the grounded transform,
// from the sample the car loop restores for the player and the same
// interpolated yaw; the car-draw half (cockpitCaster, the real ShadowPass) runs
// in car-presentation-vm.test.mjs.
test("the first-person caster is pinned to the car loop's cockpit branch", () => {
  const game = read("js/game.js");
  assert.match(game, /if \(_hasLivePlayerShadow\) \{ currentCarGroundMat\(player, shadowPass\.livePlayerMat\); shadowPass\.resolvePlayer\(_smpPlayer, yawVisInterp\(player\)\); \}/);
  assert.match(game, /ShadowPass\.create\(G, \{ teamMesh, vStd, cockpitCaster: carDraw\.cockpitCaster \}\)/);
  assert.match(game, /if \(c\.isPlayer && _plBodyOk\) \{\s*\/\/[^\n]*\n\s*const S = _smpPlayer, p = smp2\.p, t = smp2\.t, r = smp2\.r;/,
    "the car loop restores the player's smp2 from _smpPlayer");
  assert.match(game, /const yv = yawVisInterp\(c\);/);
  // The mode test and the axes call the twin in car-draw.js mirrors.
  assert.match(game, /const cockpitRigOnly = !dbgCam && \(state === "race" \|\| state === "count"\) && \(CAM_MODES\[camMode\]\.id === "cockpit" \|\| CAM_MODES\[camMode\]\.id === "helmet"\);/);
  assert.match(game, /const visorEye = !dbgCam && \(state === "race" \|\| state === "count"\) && CAM_MODES\[camMode\]\.id === "visor";/);
  assert.match(game, /GameCams\.cockpitViewmodelAxes\(smp2\.r, smp2\.t, yv, camEye, tmpR, _cockU, tmpF, _cockP,\s*GameCams\.seatFwd\(visorEye \? "visor" : "cockpit"\), GameCams\.seatUp\(visorEye \? "visor" : "cockpit"\)\);\s*basisMat\(tmpR, _cockU, tmpF, _cockP, _cockMat\);\s*drawCockpitRig\(c, _cockMat,/);
});
