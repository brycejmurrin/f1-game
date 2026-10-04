/* car-presentation-canary.test.mjs — field cars share the player's pose path.
 *
 * Two leftover presentation bugs made the pack feel delayed and "a different
 * car": (1) an xVis low-pass (16/s AI, 30/s player) plus a shadow pass that
 * damped again at 30/s, so meshes lagged the road frame on corner entry;
 * (2) AI drew the factory FULL mesh (baked wheels) on the chassis attitude
 * matrix, so tyres leaned with the body while the player's wheels stayed
 * planted on _groundMat.
 *
 * Authority is unchanged: the player integrates world px/pz; AI stays on
 * (s, x) and mirrors world metres after the step. TEAM_STYLE / garage-vs-
 * factory parts stay. This file only locks the presentation contract —
 * including the second camera's (the HUD mirror / PiP share the field's
 * body + wheel meshes) and what the bounded team caches must hold.
 *
 * Run: node --test tests/unit/car-presentation-canary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fnSource } from "../helpers/fn-source.mjs";
import vm from "node:vm";
import { carDrawVm, WORKS } from "../helpers/car-draw-vm.mjs";

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
  const adv = fn[0].indexOf("if (!c.human) c.s = wrapS(c.s + c.speed * dt);");
  const mirror = fn[0].lastIndexOf("if (!c.human) {\n    const w = worldFromTrack(c.s, c.x, smp);");
  assert.ok(adv >= 0, "AI advances s in Frenet");
  assert.ok(mirror > adv, "px/pz mirror must follow the s advance (and rescue)");
  const coast = game.match(/function coast\([\s\S]*?\nfunction /);
  assert.ok(coast, "coast present");
  assert.match(coast[0], /worldFromTrack\(c\.s, c\.x, smp\)/);
  assert.doesNotMatch(coast[0], /c\.human && c\.px/);
});

test("visible procedural cars draw a body-only mesh and planted wheels", () => {
  const game = read("js/game.js");
  // The mesh caches, wheel meshes and the GLB loader live in the car-draw seam
  // (js/car/car-draw.js); game.js keeps the draw loop that consumes them.
  const cd = read("js/car/car-draw.js");
  assert.match(cd, /function teamBodyMesh\(team, car\)/);
  // One hoisted factory builds all three team caches (no closure per car per pass);
  // teamBodyMesh hands it the seat number and kind 2 = { noWheels: true, num }.
  assert.match(cd, /_pbKind === 2 \? \{ noWheels: true, num, setup \}/);
  // THE CAR, NOT JUST THE TEAM. The helmet js/car/helmets.js paints into the
  // body is the design for opts.num; keyed on the team alone, both of a team's
  // cars got drivers[0] and 22 cars on track showed 11 helmets, each pair
  // identical. The number belongs in the key as well as the build, or the
  // second driver draws whichever mesh the first one cached.
  const teamMeshSrc = cd.slice(cd.indexOf("function buildPendingTeamMesh()"), cd.indexOf("function teamBodyMesh(team, car)"));
  const teamBodySrc = cd.slice(cd.indexOf("function teamBodyMesh(team, car)"), cd.indexOf("function teamBodyMesh(team, car)") + 400);
  // Painted path: driver number in the key (two seats → two helmets).
  assert.match(teamMeshSrc, /carDecalNum\(team, car\)/, "teamMesh must resolve the driver number");
  assert.match(teamMeshSrc, /teamMeshKeyFor\(team, sil \? shadow : painted\)/, "painted teamMesh must key on the driver number");
  assert.match(teamMeshSrc, /\|\| num/, "a factory car still keys the painted mesh on the seat number");
  assert.match(cd, /k = c\.val \+ ":" \+ suffix/, "teamMeshKeyFor(team, s) is teamMeshKey(team) + \":\" + s");
  // Shadow path: ONE ":sh" per team(+parts). Depth cannot see helmet paint, and
  // seat-keyed casters were bit-identical copies that doubled VRAM (22 → 11).
  // A custom setup stamps its own ":sh" so two shelves do not share a caster.
  assert.match(teamMeshSrc, /silhouette: true/);
  assert.match(teamMeshSrc, /\|\| "sh"/);
  assert.match(teamMeshSrc, /silhouette === true \|\| \(car == null && silhouette !== false\)/);
  assert.doesNotMatch(teamMeshSrc, /num \+ \(sil \? ":sh"/,
    "silhouette key must not include the seat number");
  const cap = cd.match(/TEAM_MESH_CACHE_MAX\s*=\s*(\d+)/);
  assert.ok(cap, "TEAM_MESH_CACHE_MAX is a named ceiling (what it must hold: the cache-occupancy test below)");
  assert.match(teamBodySrc, /carDecalNum\(team, car\)/, "teamBodyMesh must resolve the driver number");
  assert.match(teamBodySrc, /_pbNum = num/, "teamBodyMesh must resolve the driver number");
  assert.match(teamBodySrc, /teamMeshKeyFor\(team, suffix\)/, "teamBodyMesh must key on the driver number");
  assert.match(teamBodySrc, /_pbKind = 2/, "teamBodyMesh must build body-only with the driver number");
  assert.match(cd, /function playerBodyMesh\(team, car, visualKey = playerVisualKey\)/);
  assert.match(cd, /visualKey \+ ":" \+ carDecalNum\(team, car\)/, "the player's own body is keyed on the seat too");
  assert.match(cd, /function getFieldWheelMeshes\(team, car\)/);
  // Field wheels resolve from the car's visual setup when it has one, else the
  // FACTORY setup via teamDecalState(team, false).
  assert.match(cd, /const st = setup \? teamDecalState\(team, false, setup, car\.visStamp\) : teamDecalState\(team, false\);\s*\n\s*const vt = st\.parts;/);
  assert.match(cd, /const parts = Parts\.getVisualTiers\(setup, team\);/);
  assert.match(cd, /const wm = c\.isPlayer \? getPlayerWheelMeshes\(\) : getFieldWheelMeshes\(c\.team, c\);/);
  assert.match(cd, /putBoundedMesh\(fieldWheelCache, fieldWheelOrder/,
    "field wheels must promote hits like every other mesh LRU");
  assert.match(cd, /for \(const k in fieldWheelCache\)[\s\S]{0,400}?fieldWheelOrder\.length = 0/,
    "loadCarModel must clear fieldWheelOrder with the cache (putBoundedMesh desync frees a live mesh)");
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
  assert.match(cd, /function cockpitBodyMesh\(team, car, visualKey = playerVisualKey\)/);
  assert.match(read("js/garage/setup-camera.js"), /function garageSeat\(\)/);
  const draw = game.match(
    /const body = carDraw\.modelBuf \? null : \(c\.isPlayer \? playerBodyMesh\(c\.team, c\) : teamBodyMesh\(c\.team, c\)\);[\s\S]{0,400}drawPlayerWheels\(c, _groundMat/
  );
  assert.ok(draw, "body + wheels on _groundMat for every procedural car");
  // The caster passes live in js/render/shared/shadow-pass.js (teamMesh through deps, the player through G).
  const sp = read("js/render/shared/shadow-pass.js");
  assert.match(sp, /if \(_hasLivePlayerShadow\) G\.gfx\.castShadow\(deps\.teamMesh\(G\.player\.team, G\.player, true\)/);
  assert.match(sp, /G\.gfx\.castShadow\(deps\.teamMesh\(_shadowTeams\[i\], _shadowCars\[i\], true\), _shadowMats\[i\]\)/);
  assert.match(game, /gfx\.draw\(teamMesh\(player\.team, player\), tmpMat, _ghostOpts\)/);
  assert.match(game, /1\.5 \* Math\.max\(PACE, 0\.05\)/,
    "beached gate additive floor must scale with PACE like the grass speed floor");
});

test("orbit / agent-view read the mirrored world pose for the field", () => {
  const apex = read("js/agent/apex.js");
  const view = read("js/agent/agentview.js");
  assert.match(apex, /const cx = \(c\.px != null\) \? c\.px/);
  assert.match(apex, /const cz = \(c\.pz != null\) \? c\.pz/);
  assert.doesNotMatch(apex, /c\.human && c\.px != null/);
  assert.match(apex, /error: "no_wire"/);
  assert.match(apex, /error: "invalid_repro"/);
  assert.match(apex, /ok: true, cleared: true/);
  assert.match(apex, /return \{ ok: true, bytes: blob\.size \}/);
  assert.match(view, /if \(c\.px != null\) return \[c\.px, c\.pz\];/);
  assert.doesNotMatch(view, /c\.human && c\.px != null/);
});

test("race warm-up builds the shadow casters the first countdown frame would", () => {
  // The car and lamp shadow passes fetch teamMesh(team, car, true) for every car
  // in range on their first frame. warmCarAssets builds the same keys behind the
  // loading cover, under the passes' own gates, so lights-out builds none.
  const cd = read("js/car/car-draw.js");
  const sp = read("js/render/shared/shadow-pass.js");
  const warm = cd.slice(cd.indexOf("function warmCarAssets()"), cd.indexOf("async function prepareMenuCarAssets("));
  assert.match(warm, /const casters = shadowCastersWanted\(\);/);
  assert.match(warm, /if \(casters\) teamMesh\(c\.team, c, true\);/, "the caster key is the pass's own call");
  assert.match(sp, /deps\.teamMesh\(_shadowTeams\[i\], _shadowCars\[i\], true\)/, "the pass still fetches casters by (team, car, true)");
  // The gate mirrors the passes: car shadow below tier 3, lamp shadow below tier 2.
  assert.match(sp, /G\.gfx\.carShadowBegin && LT\.carShadow && PerfGov\.tier\(\) < 3/);
  assert.match(sp, /G\.gfx\.lampShadowBegin && LT\.lampShadow && PerfGov\.tier\(\) < 2/);
  assert.match(warm, /gfx\.carShadowBegin && LT\.carShadow && tier < 3\) \|\| \(gfx\.lampShadowBegin && LT\.lampShadow && tier < 2\)/);
  // An agent's headless race never renders a shadow: no caster builds there.
  assert.match(warm, /if \(G\.headlessMode \|\| !LT\) return false;/);
});

// THE COCKPIT LENS (car-draw.js drawMirrorLens, 2026-10-03): the HUD mirror's
// LIVE image while that pass draws (gfx.drawMirrorGlass), else the sky-tint
// fallback — exactly one of the two on every frame. Neither left the housings
// as flat black slabs (2026-10-02); both would lay the fallback over the live
// view. The real function runs against stubs of the six names it reads.
test("the cockpit lens draws the live mirror glass XOR the sky-tint fallback", () => {
  const src = read("js/car/car-draw.js");
  const fn = fnSource(src, "function drawMirrorLens(");
  const QUADS = [[[-0.5, 0.75, 0.9], [-0.7, 0.75, 0.9], [-0.7, 0.8, 0.9], [-0.5, 0.8, 0.9]]];
  const GLASS = { glass: true }, FB = { fallback: true };
  const run = ({ mp = "drawing", member = true, accepts = true, texMesh = true, nite = false }) => {
    const calls = [];
    const gfx = { draw: (m, b, o) => calls.push(["fallback", m, o.emissive]) };
    if (member) gfx.drawMirrorGlass = (m, b) => { calls.push(["glass", m, b]); return accepts; };
    const MirrorPass = { instance: () => (mp === null ? null : { drawing: () => mp === "drawing" }) };
    const make = new Function("G", "MirrorPass", "Car3D", "teamDecalState", "getMirrorGlass", "getMirrorFallback",
      `const _mirrorFbOpts = { doubleSided: true, emissive: 0.55 }, _glassBase = new Float32Array(16);
       let _glassQuads = null, _glassLive = 0, _glassFb = 0;
       ${fn}
       return { draw: drawMirrorLens, counts: () => [_glassLive, _glassFb], quads: () => _glassQuads };`);
    const lens = make({ gfx }, MirrorPass, { cockpitMirrorGlass: () => QUADS },
      () => ({ parts: { _visual: { cockpit: { mirror: 1 } } } }),
      (q) => (q === QUADS && texMesh ? GLASS : null), (q) => (q === QUADS ? FB : null));
    const base = new Float32Array(16).fill(2);
    const live = lens.draw({ team: {} }, base, nite);
    return { calls, live, base, counts: lens.counts(), quads: lens.quads() };
  };
  // Live: one glass draw, on the cached glass mesh and the body's own matrix.
  let r = run({});
  assert.equal(r.live, true);
  assert.deepEqual(r.calls.map((c) => c[0]), ["glass"]);
  assert.equal(r.calls[0][1], GLASS);
  assert.equal(r.calls[0][2], r.base, "the lens rides the cockpit body's matrix");
  assert.deepEqual(r.counts, [1, 0]);
  assert.equal(r.quads, QUADS, "glassState() projects the lens it drew");
  // The backend refuses (no image yet, dead, the PiP, an open pass): the fallback, once.
  r = run({ accepts: false });
  assert.equal(r.live, false);
  assert.deepEqual(r.calls.map((c) => c[0]), ["glass", "fallback"], "a refused glass drew nothing — the fallback covers it");
  assert.deepEqual(r.counts, [0, 1]);
  // The pass not drawing, no pass at all, a backend without the member, no
  // textured mesh: the fallback only, and the backend is never asked.
  for (const o of [{ mp: "off" }, { mp: null }, { member: false }, { texMesh: false }]) {
    r = run(o);
    assert.deepEqual(r.calls.map((c) => c[0]), ["fallback"], JSON.stringify(o));
    assert.equal(r.calls[0][1], FB);
    assert.deepEqual(r.counts, [0, 1], JSON.stringify(o));
  }
  // The fallback's look is unchanged: the day / night emissive.
  assert.equal(run({ mp: "off" }).calls[0][2], 0.55);
  assert.equal(run({ mp: "off", nite: true }).calls[0][2], 0.08);
  // drawCockpitRig reaches it for every procedural cockpit, and it is the ONLY fallback draw.
  assert.match(fnSource(src, "function drawCockpitRig("), /if \(!carModelBuf\) drawMirrorLens\(c, base, nite\);/);
  assert.equal(src.split("getMirrorFallback(").length - 1, 1, "getMirrorFallback is drawn from drawMirrorLens only");
});

// THE HUD MIRROR AND THE BROADCAST PiP draw a rival the way the main pass does:
// the body-only mesh and the planted FIELD wheels, from the same caches. They
// drew teamMesh(team, car) — the WHOLE car, a cache nothing else filled — so
// each rival new to the mirror cost a 140-250 ms Car3D.build mid-race.
test("the mirror and the PiP draw rivals via teamBodyMesh + the field wheels, never teamMesh", () => {
  const cd = read("js/car/car-draw.js"), game = read("js/game.js");
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const mp = code(read("js/render/shared/mirror-pass.js"));
  assert.doesNotMatch(mp, /teamMesh/, "mirror-pass.js reaches no whole-car mesh");
  assert.match(mp, /const \{ drawWorldMeshes, drawCar, /);
  assert.match(mp, /drawCar\(c, _mat, paint, night\);/, "the uncapped loop (apex26.fieldLod=0)");
  assert.match(mp, /if \(_cKeep\[i\]\) \{ drawCar\(_cCars\[i\], _cMats\[i\], paint, night\); _cars\+\+; \}/, "the FieldLod nearest-6 loop");
  assert.match(game, /MirrorPass\.create\(G, \{ drawWorldMeshes, drawCar: carDraw\.drawMirrorCar,/);
  const fn = cd.match(/function drawMirrorCar\(c, mat, paint, night\) \{[\s\S]*?\n {4}\}/);
  assert.ok(fn, "CarDraw.drawMirrorCar");
  // The main pass's own selection (game.js: body + drawPlayerWheels on _groundMat).
  assert.match(fn[0], /const body = carModelBuf \? null : \(c\.isPlayer \? playerBodyMesh\(c\.team, c\) : teamBodyMesh\(c\.team, c\)\);/);
  assert.match(fn[0], /if \(!body\) \{ G\.gfx\.draw\(teamMesh\(c\.team, c\), mat, paint\); return; \}/, "a GLB is one piece, as in the main pass");
  assert.equal(fn[0].split("teamMesh(").length - 1, 1, "teamMesh only on the GLB branch");
  assert.match(fn[0], /drawPlayerWheels\(c, mat, 0, _mirWheelOpts, false, 0, 1, true\);/, "BARE wheels, dt 0 (the main pass spins them)");
  assert.match(cd, /return \{[\s\S]*?drawMirrorCar,[\s\S]*?\};/, "exported");
  // BARE: rotating wheels only and no Particles flare, at any distance.
  assert.match(cd, /function drawPlayerWheels\(c, base, dt, opt, frontsOnly, fwdOffset, wScale, bare\)/);
  assert.match(cd, /const lite = bare \|\| \(!c\.isPlayer && FieldLod\.wheelsLite\(camD2\)\);/);
  assert.match(cd, /const flareA = !bare && /);
  // The wheels' material is the main pass's: TLX keys materials by VALUE, so
  // equal opts are the one material (and pipeline) the race already compiled.
  const lit = (src, re) => Object.assign({}, vm.runInNewContext("(" + src.match(re)[1] + ")"));
  assert.deepEqual(lit(cd, /const _mirWheelOpts = (\{[^}]*\});/), lit(game, /const _wheelOpts = (\{[^}]*\});/));
  assert.match(fn[0], /_mirWheelOpts\.emissive = night \? 0\.12 : 0;/, "and its night term (game.js: _wheelOpts.emissive = night ? 0.12 : 0)");
  assert.match(game, /_wheelOpts\.emissive = night \? 0\.12 : 0;/);
});

// THE MENU PREP BUILDS THE CASTERS (PR #803 built them in warmCarAssets, ~32 ms
// each, ~11 a race, behind the loading card): same gate, same key, in the sliced
// loop, so race entry's warm is all hits. warmCarAssets keeps its call.
test("the menu prep builds the shadow casters under shadowCastersWanted(), keyed as the race keys them", () => {
  const cd = read("js/car/car-draw.js"), game = read("js/game.js");
  const prep = cd.slice(cd.indexOf("async function prepareMenuCarAssets("), cd.indexOf("function drawCarDecals("));
  assert.match(prep, /const casters = shadowCastersWanted\(\);/, "warmCarAssets' own gate");
  assert.match(prep, /const steps = casters \? field\.flatMap\(c => \[c, \{ caster: c \}\]\) : field;/, "a step of its own after its car");
  assert.match(prep, /for \(const step of steps\) \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*if \(performance\.now\(\) - sliceAt >= 8\) \{/, "the same slice discipline");
  assert.match(prep, /if \(step\.caster\) teamMesh\(c\.team, c, true\);/, "the shadow passes' (team, car, true)");
  const warm = cd.slice(cd.indexOf("function warmCarAssets()"), cd.indexOf("async function prepareMenuCarAssets("));
  assert.match(warm, /if \(casters\) teamMesh\(c\.team, c, true\);/, "warmCarAssets keeps the call: the safety net, hits after the menu");
  // ONE stamp helper (CarDraw.carVisual) keys every car in BOTH places: makeCars
  // (the player and MY TEAM's hire on getTeamParts, a career rival on its shelf)
  // and the menu prep's field, with the same `own` rule.
  assert.match(game, /\.\.\.CarDraw\.carVisual\(team, d\.num, isP \|\| mate, getTeamParts\),/, "makeCars stamps through the shared helper");
  assert.match(prep, /carVisual\(team, d\.num, ti === teamPick && \(isPlayer \|\| !!team\.custom\), G\.getTeamParts\)/, "…and so does the menu prep");
  assert.match(game, /const mate = !isP && ti === teamIdx && !!team\.custom;/, "the prep's own rule is makeCars' mate rule");
  const stampExpr = 'Parts.CATALOG.map((cat) => setup[cat.id] || "").join(",")';
  assert.equal(cd.split(stampExpr).length - 1, 1, "car-draw builds a stamp in ONE place");
  assert.equal((fnSource(game, "function makeCars(") + prep).split("Parts.CATALOG.map(").length - 1, 0, "neither makeCars nor the prep builds its own");
  const helper = fnSource(cd, "function carVisual(");
  assert.match(helper, /const setup = own \? getTeamParts\(team\.id\) : \(Career\.inCareer\(\) && Career\.aiSetup \? Career\.aiSetup\(team\) : null\);/);
  assert.match(helper, /visPaint: stamp \? stamp \+ ":" \+ num : "", visSh: stamp \? stamp \+ ":sh" : ""/);
});

// carVisual on the real CarDraw: a build that RESOLVES to the factory parts is
// the factory car (no stamp, no setup — the factory key), whatever object holds it.
test("carVisual: a career shelf equal to the works build keys the factory; an upgrade keys its own build", () => {
  const up = Object.assign({}, WORKS, { aero: "outwash_max" });
  const v = carDrawVm({ career: {} });
  const team = v.teams[0], other = v.teams[1];
  v.careerOn({ [team.id]: Object.assign({}, WORKS), [other.id]: up });
  const cv = (t, own) => ({ ...v.ctx.CarDraw.carVisual(t, 7, own, v.G.getTeamParts) });
  assert.deepEqual(cv(team, false), { visualSetup: null, visStamp: "", visPaint: "", visSh: "" }, "R&D seeded with the works shelf: the factory car");
  const stamp = Object.values(up).join(",");
  assert.deepEqual(cv(other, false), { visualSetup: up, visStamp: stamp, visPaint: stamp + ":7", visSh: stamp + ":sh" }, "a real upgrade: its own key");
  assert.deepEqual(cv(v.teams[2], false), { visualSetup: null, visStamp: "", visPaint: "", visSh: "" }, "no bag yet: factory");
  assert.equal(cv(team, true).visStamp, ["hi-df", "", "", "", "", "", "", "soft", "", "", "", ""].join(","), "own: the saved build, stamped as before");
  v.careerOn(null);
  assert.equal(cv(other, false).visStamp, "", "outside career every rival is the factory car");
});

// THE CAREER RACE ENTRY. Once a career's R&D has started, CareerAiDev.ensureSeed
// gives a team a fitted shelf — a copy of the works build until a step lands —
// and makeCars stamped every such rival with its own key, while the menu prep
// keyed the factory: ~21 bodies and ~11 casters (~32 ms each) rebuilt behind the
// race-entry card, and the prep's 21 + the race's 21 bodies past the 40-entry LRU.
// MY TEAM's hire races the saved build and was prepped as a factory car too.
test("a career field and MY TEAM's hire: after the menu prep, race entry builds no body and no caster", async () => {
  const cap = Number(read("js/car/car-draw.js").match(/TEAM_MESH_CACHE_MAX\s*=\s*(\d+)/)[1]);
  const shelf = (v, upgraded) => Object.fromEntries(v.teams.filter((t) => v.ctx.Teams.isReal(t)).map((t, i) =>
    [t.id, upgraded.includes(i) ? Object.assign({}, WORKS, { aero: "up" + i }) : Object.assign({}, WORKS)]));
  const count = (v, k, from = 0) => v.rec.builds.slice(from).filter((b) => b.kind === k).length;
  const raceEntry = (v, menu, label) => {
    v.field((c, i) => 3000 - 9 * i);
    v.carDraw.warmCarAssets();
    assert.deepEqual(v.rec.builds.slice(menu), [], label + ": every body and caster a cache hit at race entry");
    const mp = v.mirror();
    v.draw(mp);
    v.classes.add("bc-on");
    for (const c of v.G.cars) { mp.setSubject(c, "tcam"); v.draw(mp); }
    assert.deepEqual(v.rec.builds.slice(menu), [], label + ": the mirror and the PiP over every car: no build");
    assert.equal(v.rec.freed, 0, label + ": no live mesh evicted");
  };
  // (1) R&D under way: every rival seeded, two teams upgraded — prepped with the career known.
  {
    const v = carDrawVm({ casters: true, career: {} });
    v.careerOn(shelf(v, [1, 6]));
    v.G.teamIdx = 3; v.G.driverIdx = 0;
    await v.carDraw.prepareMenuCarAssets(() => true);
    const bodies = count(v, "body") - 1, casters = count(v, "sh");
    assert.deepEqual([count(v, "whole"), bodies, casters], [0, 21, 12],
      "21 rival bodies (2 upgraded teams on their own keys); a :sh per team (an upgrade's own) + the player's build");
    assert.ok(bodies <= cap && casters <= cap);
    raceEntry(v, v.rec.builds.length, "career");
  }
  // (2) The prep ran BEFORE the career's shelves existed (factory keys), and the
  // race runs on works-copy shelves: still the factory car, still all hits.
  {
    const v = carDrawVm({ casters: true });
    v.G.teamIdx = 3; v.G.driverIdx = 0;
    await v.carDraw.prepareMenuCarAssets(() => true);
    const menu = v.rec.builds.length;
    v.careerOn(shelf(v, []));
    raceEntry(v, menu, "works-copy shelves");
  }
  // (3) MY TEAM: you and the hire, both on the saved build.
  {
    const v = carDrawVm({ casters: true, career: {} });
    const T = v.ctx.Teams;
    v.teams.push(Object.assign({}, T.DEFAULT_CUSTOM, { drivers: [{ name: "You", code: "YOU", num: 99 }, { name: "Hire", code: "HIR", num: 98 }] }));
    v.careerOn(shelf(v, [2]));
    v.G.teamIdx = v.teams.length - 1; v.G.driverIdx = 0;
    await v.carDraw.prepareMenuCarAssets(() => true);
    const hire = v.rec.builds.filter((b) => b.kind === "body" && b.num === 98);
    assert.equal(hire.length, 1, "the hire's body is prepped once, on the saved build's key");
    raceEntry(v, v.rec.builds.length, "MY TEAM");
    assert.ok(v.G.cars.find((c) => c.num === 98).visStamp, "the hire races the saved build (its own stamp)");
  }
});

// TEAM_MESH_CACHE_MAX bounds teamMeshes AND teamBodies (two LRUs of 40). What
// the menu prep now holds, measured on the REAL CarDraw: the real 11-team grid,
// the casters on, the race warm and the mirror/PiP over every car afterwards —
// nothing built after the menu (race entry is all hits) and nothing evicted.
test("the bounded team caches hold the menu prep, the race warm and the mirror with nothing evicted", async () => {
  const cap = Number(read("js/car/car-draw.js").match(/TEAM_MESH_CACHE_MAX\s*=\s*(\d+)/)[1]);
  for (const pick of ["real", "legends"]) {
    const v = carDrawVm({ casters: true, legends: pick === "legends" });
    v.G.teamIdx = pick === "legends" ? v.teams.length - 1 : 3;
    v.G.driverIdx = 1;
    await v.carDraw.prepareMenuCarAssets(() => true);
    {
      const count = (k) => v.rec.builds.filter(b => b.kind === k).length;
      // Bodies: playerBodyMesh (its own cache) + teamBodyMesh per rival seat the
      // menu lists: 21 real; LEGENDS lists its other 11 legends as well, keyed by
      // number, and most carry 1 (js/data/legends.js): 22 + 2 keys.
      const teamBodies = count("body") - 1, casters = count("sh");
      assert.deepEqual([pick, count("whole"), teamBodies, casters],
        pick === "legends" ? [pick, 0, 24, 13] : [pick, 0, 21, 12],
        "menu: no whole car; the rivals' bodies; a :sh per team (+ the picked team's) + the player's own build");
      assert.ok(teamBodies <= cap && casters <= cap, `teamBodies ${teamBodies} / teamMeshes ${casters} within ${cap}`);
      const menu = v.rec.builds.length;
      v.field((c, i) => 3000 - 9 * i);
      v.carDraw.warmCarAssets();
      assert.deepEqual(v.rec.builds.slice(menu), [], "race entry's warm span: every body and caster a cache hit");
      const mp = v.mirror();
      v.draw(mp);
      v.classes.add("bc-on");
      for (const c of v.G.cars) { mp.setSubject(c, "tcam"); v.draw(mp); }
      assert.deepEqual(v.rec.builds.slice(menu), [], "the mirror and the PiP over every car: no build");
      assert.equal(v.rec.freed, 0, "no live mesh evicted, menu -> race -> mirror");
    }
  }
});
