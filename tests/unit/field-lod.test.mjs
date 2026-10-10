/* field-lod — the rival-car distance LOD (js/car/field-lod.js) and the three
 * consumers that take its cuts on every backend:
 *   - the TABLE: which parts a rival draws at a camera distance (rotating wheels
 *     only past 50 m, MOVING flaps within 80 m, exhaust flame within 60 m, the
 *     whole-car mesh as one draw past 120 m), the player never reduced, and
 *     apex26.fieldLod = 0 returning every legacy gate;
 *   - the FLAP SET: past 80 m (and at rest anywhere) the REAL game.js
 *     drawAeroFlaps draws the whole moveable set as ONE static CarMesh mesh at
 *     the nearer rest pose — the same surfaces the per-element path draws —
 *     instead of nothing (a far rival's rear wing was its main plane only);
 *   - the SHADOW gate (js/render/shared/shadow-pass.js, driven for real): a
 *     rival pushed with cast=false keeps its blob but is never a sun-map
 *     caster; an omitted flag (the fieldLod=0 path) still casts; and game.js
 *     pushes the caster AFTER the side-frustum test under FieldLod;
 *   - the MIRROR cap (js/render/shared/mirror-pass.js, driven for real): the
 *     nearest 6 rivals, nothing outside the mirror's cone, every car with the
 *     LOD off;
 *   - the WARM: TLX compiles the flame / ERS lit variants during the lights
 *     (their material keys equal the ones game.js draws with), and
 *     warmCarAssets builds the :sh caster, up to mirrorCap() whole-car meshes,
 *     the field wheels and the flame quad (skipped when headless).
 * No browser (~0.1 s). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { fnSource } from "../helpers/fn-source.mjs";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function loadLod(stored) {
  const ctx = vm.createContext({ Math, Object, Infinity });
  vm.runInContext(read("js/car/field-lod.js").replace(/^const\b/gm, "var"), ctx, { filename: "field-lod.js" });
  if (stored !== undefined) ctx.FieldLod.init({ get: (k, d) => (k === "fieldLod" ? stored : d) });
  return ctx;
}
const at = (m) => m * m;

test("the table: a rival's parts by camera distance; the player is never reduced", () => {
  const { FieldLod: L } = loadLod();
  assert.ok(Object.isFrozen(L.T), "one frozen thresholds table");
  assert.deepEqual([L.T.WHEEL_EXTRAS_M, L.T.FLAPS_M, L.T.FLAME_M, L.T.NO_DECAL_M, L.T.SHADOW_CAST_M, L.T.MIRROR_CARS],
    [50, 80, 60, 120, 50, 6]);
  const near = L.parts(at(30), false);
  assert.deepEqual([near.tier, near.body, near.decal, near.fixedWheels, near.compound, near.spinDisc, near.flaps, near.flame, near.castsShadow],
    [0, true, true, true, true, true, true, true, true], "30 m: everything (the near look unchanged)");
  const p55 = L.parts(at(55), false);
  assert.deepEqual([p55.tier, p55.wheels, p55.fixedWheels, p55.compound, p55.spinDisc, p55.flaps, p55.flame, p55.castsShadow],
    [1, true, false, false, false, true, true, false], "55 m: 4 rotating wheels, no extras, no map caster");
  const p70 = L.parts(at(70), false);
  assert.deepEqual([p70.flaps, p70.flame], [true, false], "70 m: flaps yes, flame no");
  const p100 = L.parts(at(100), false);
  assert.deepEqual([p100.tier, p100.body, p100.flaps, p100.flapSet], [1, true, false, true],
    "100 m: body + decal + wheels, the flap set STATIC (never none)");
  const far = L.parts(at(130), false);
  assert.deepEqual([far.tier, far.body, far.decal, far.wheels, far.fixedWheels], [2, true, false, true, false],
    "130 m: the body and its 4 rotating wheels, no decal");
  const me = L.parts(at(400), true);
  assert.deepEqual([me.tier, me.fixedWheels, me.compound, me.flaps, me.flame, me.castsShadow], [0, true, true, true, true, true]);
  assert.equal(L.d2([3, 4, 0], [0, 0, 0], false), 25);
  assert.equal(L.d2([300, 0, 0], [0, 0, 0], true), 0, "the player is always at distance 0");
});

test("apex26.fieldLod = 0 returns every legacy gate; unset or 1 is on", () => {
  for (const off of [0, "0", false]) {
    const { FieldLod: L } = loadLod(off);
    assert.equal(L.on, false, JSON.stringify(off));
    assert.equal(L.tier(at(500)), 0);
    assert.equal(L.wheelsLite(at(500)), false);
    assert.equal(L.flapsM(), 150, "the old 150 m flap gate");
    assert.equal(L.flame(at(500)), true, "the flame was ungated");
    assert.equal(L.castsShadow(at(500)), true);
    assert.equal(L.mirrorCap(), Infinity);
  }
  for (const on of [1, undefined, "1"]) assert.equal(loadLod(on === undefined ? 1 : on).FieldLod.on, true);
  assert.equal(loadLod().FieldLod.on, true, "default on");
});

test("nearest(): keeps the cap smallest, the forced index always", () => {
  const { FieldLod: L } = loadLod();
  const d = [90, 10, 50, 70, 20, 30, 80, 40, 60, 100], keep = [];
  assert.equal(L.nearest(d, d.length, 6, keep, -1), 6);
  assert.deepEqual(d.filter((_, i) => keep[i]).sort((a, b) => a - b), [10, 20, 30, 40, 50, 60]);
  assert.equal(L.nearest(d, d.length, 6, keep, 9), 6);
  assert.equal(keep[9], 1, "the PiP subject is kept even when farthest");
  assert.deepEqual(d.filter((_, i) => keep[i]).sort((a, b) => a - b), [10, 20, 30, 40, 50, 100]);
  assert.equal(L.nearest(d, 3, Infinity, keep, -1), 3, "no cap: everything");
});

// ── shadow gate ─────────────────────────────────────────────────────────────
function shadowRig() {
  const ctx = vm.createContext({ Math, Float32Array, Array, Object, Number, Infinity });
  seedLog(ctx);
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: "mat4.js" });
  vm.runInContext(`var LightTune = { LT: { shadowRange: 80, carShadow: true, moonShadow: 0, lampShadow: false } };
    var PerfGov = { tier: () => 0 };`, ctx);
  vm.runInContext(read("js/render/shared/shadow-pass.js").replace(/^const\b/gm, "var"), ctx, { filename: "shadow-pass.js" });
  const cast = [], blobs = [];
  const noop = () => {};
  const player = { isPlayer: true, speed: 30, team: "P" };
  const G = {
    track: { propTop: 20, meshes: { terrainChunked: null, roadChunked: null, terrain: {}, road: {}, props: {} } },
    gfx: { shadowBegin: noop, shadowEnd: noop, castShadow: (m) => cast.push(m), castShadowChunked: noop,
      carShadowBegin: noop, carShadowEnd: noop, carShadowKeep: noop, drawShadow: (m) => blobs.push(m[12]) },
    camEye: [0, 3, -8], camTgt: [0, 0, 0], player, state: "race",
  };
  const sp = ctx.ShadowPass.create(G, { vStd: (v) => v, teamMesh: (team, car, sil) => team + (sil ? ":sh" : "") });
  const mat = (x) => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; m[12] = x; return m; };
  return { sp, cast, blobs, mat, player, run: () => sp.sunPass({ sunDir: [0.3, 0.9, 0.3], sunColor: [1, 1, 1] }, 0, false) };
}

test("shadow gate: cast=false keeps the blob but is never a sun-map caster; an omitted flag casts", () => {
  const r = shadowRig();
  r.sp.beginFrame();
  r.sp.pushCaster(r.mat(0), "P", r.player, true);
  r.sp.pushCaster(r.mat(10), "near", { team: "near" }, true);
  r.sp.pushCaster(r.mat(70), "far", { team: "far" }, false);   // inside the map's reach, beyond 50 m of the camera
  r.sp.pushCaster(r.mat(20), "legacy", { team: "legacy" });    // apex26.fieldLod=0: no flag
  r.sp.flushBlobs();
  assert.deepEqual(r.blobs, [0, 10, 70, 20], "every pushed car keeps its blob");
  r.sp.beginFrame();   // next frame's casters come from this frame's pool: re-push
  r.sp.pushCaster(r.mat(0), "P", r.player, true);
  r.sp.pushCaster(r.mat(10), "near", { team: "near" }, true);
  r.sp.pushCaster(r.mat(70), "far", { team: "far" }, false);
  r.sp.pushCaster(r.mat(20), "legacy", { team: "legacy" });
  r.run();
  assert.deepEqual(r.cast.filter((m) => typeof m === "string"), ["near:sh", "legacy:sh"], "the far rival is not rasterised into the car map (the player casts from its live matrix)");
});

test("shadow gate: the lamp map skips a non-casting rival in its key AND its cast loop", () => {
  const src = read("js/render/shared/shadow-pass.js");
  assert.equal((src.match(/!_shadowCast\[i\]/g) || []).length, 3, "sun cast loop, lamp key loop, lamp cast loop");
});

test("game.js: under FieldLod the caster is pushed AFTER the side-frustum test, gated at 50 m", () => {
  const g = read("js/game.js");
  const legacy = g.indexOf("if (!FieldLod.on) shadowPass.pushCaster(_groundMat, c.team, c);");
  const cull = g.indexOf("if (_out) continue;", legacy);
  const lod = g.indexOf("if (FieldLod.on) shadowPass.pushCaster(_groundMat, c.team, c, FieldLod.castsShadow(_lodD2));");
  assert.ok(legacy > 0 && cull > legacy && lod > cull, "legacy push before the frustum test, the LOD push after it");
  assert.match(g, /const body = carDraw\.modelBuf \? null/, "every procedural rival keeps its body mesh (no whole-car swap)");
  assert.match(g, /if \(_lod < 2\) queueCarDecals\(c\.team, tmpMat/, "and no decal for a rival past 120 m");
  // Past FieldLod.flapsM() the flaps go STILL (the static set), they are never skipped.
  assert.match(g, /drawAeroFlaps\(c\.team, aSt\.val, c\.aeroX \|\| 0, tmpMat, paint, aSt\.aero, null,\s*!c\.isPlayer && fdx \* fdx \+ fdy \* fdy \+ fdz \* fdz >= FieldLod\.flapsM\(\) \*\* 2\);/,
    "flaps gate from the table: past it `still`, the player never");
  assert.doesNotMatch(g, /\bdrawFlaps\b/, "no flag that skips the flap draw");
  assert.equal(g.split("drawAeroFlaps(c.team, aSt.val").length - 1, 1, "one race call site");
  assert.match(g, /carDraw\.drawExhaustFx\(c, tmpMat, [^\n]*FieldLod\.flame\(_lodD2\)\)/, "flame gate from the table");
  const cd = read("js/car/car-draw.js");
  // BARE (the mirror / PiP, drawMirrorCar) is lite at any distance.
  assert.match(cd, /const lite = bare \|\| \(!c\.isPlayer && \(haveTier \? lodT >= 1 : FieldLod\.wheelsLite\(camD2, G\.lens && G\.lens\.fovY\)\)\)/);
  // lite: the rotating wheel draw, then only the far brake flare (a Particles
  // flare outside the pool, 40-240 m) before the wheel's other layers are skipped.
  assert.match(cd, /if \(lite\) \{[\s\S]{0,600}?Particles\.flare\([\s\S]{0,200}?continue;/, "lite: the rotating wheel, the far flare, then nothing else for that wheel");
});

// ── the lens and the hysteresis (2026-10-04) ───────────────────────────────
// The thresholds are reference-lens (60°) metres. A trackside / TV camera at
// FOV 18° sees a rival 130 m away as big as one 36 m away at 60°; it used to
// strip that car's livery (past 120 m) while it filled the frame.
const DEG = Math.PI / 180;

test("the LOD scales by the lens: a long lens keeps the livery, a wide one cuts sooner", () => {
  const { FieldLod: L } = loadLod();
  assert.equal(L.lensK2(60 * DEG), 1, "the reference lens is the table");
  assert.equal(L.lensK2(undefined), 1, "no fov: the plain table");
  assert.equal(L.tier(at(130)), 2, "130 m with no lens: no decal (unchanged)");
  assert.equal(L.tier(at(130), 18 * DEG), 0, "130 m at 18°: full detail — it projects like ~36 m at 60°");
  assert.equal(L.tier(at(130), 60 * DEG), 2, "130 m at 60°: the table");
  const k = Math.tan(18 * DEG / 2) / Math.tan(30 * DEG);
  assert.equal(L.tier(at(119 / k), 18 * DEG), 1, "just inside 120 reference metres at 18°: the decal stays");
  assert.equal(L.tier(at(121 / k), 18 * DEG), 2, "just past it: gone");
  assert.equal(L.tier(at(100), 90 * DEG), 2, "a 90° lens shrinks a car at 100 m below the decal cut");
  assert.ok(!L.wheelsLite(at(130), 18 * DEG) && L.wheelsLite(at(130)), "the wheel extras take the same lens");
});

test("hysteresis: a car hovering at a threshold does not flicker between tiers", () => {
  const { FieldLod: L } = loadLod();
  const c = {};
  const walk = (ms) => ms.map((m) => L.tier(at(m), undefined, c));
  // First look, then wobble ±5 m around 120 m: ±4 %, inside the ±10 % band.
  assert.deepEqual(walk([118, 122, 117, 123, 119, 121]), [1, 1, 1, 1, 1, 1], "stays with its decal on the way out");
  assert.deepEqual(walk([133, 125, 115, 110]), [2, 2, 2, 2], "out past +10 %, then held until -10 %");
  assert.deepEqual(walk([107, 112]), [1, 1], "back inside -10 %, and it holds there");
  assert.deepEqual(walk([56, 46, 44, 30]), [1, 1, 0, 0], "the 50 m boundary has its own band");
  assert.equal(c._lodTier, 0, "the last tier lives on the car");
  const LO = loadLod(0).FieldLod;
  assert.equal(LO.tier(at(400), 18 * DEG, {}), 0, "apex26.fieldLod = 0 still turns every cut off");
});

// ── the flap set ────────────────────────────────────────────────────────────
// game.js's REAL drawAeroFlaps over the REAL Car3D solve and CarMesh caches, on
// a recording gfx. The car sits yawed and lifted, so a pose error cannot hide.
let _flapM = null;   // one loadParts (the hinge solve is memoised inside it)
function flapRig() {
  const M = _flapM || (_flapM = loadParts());
  const made = [], draws = [], freed = [];
  const gfx = {
    createMesh: (d) => { const m = { id: made.length, d }; made.push(m); return m; },
    freeMesh: (m) => freed.push(m),
    draw: (mesh, mat, opts) => draws.push({ mesh, mat: Array.from(mat), opts }),
  };
  M.CarMesh.init(gfx);
  const st = { col: [0.8, 0.1, 0.1], finish: null };
  const draw = new Function("wingColorOf", "clamp", "resolveLivery", "Car3D", "CarMesh", "gfx", "_flapWorld",
    fnSource(read("js/game.js"), "function drawAeroFlaps(") + "\nreturn drawAeroFlaps;")(
    () => st.col, (v, a, b) => Math.min(b, Math.max(a, v)), () => ({ finish: st.finish }),
    M.Car3D, M.CarMesh, gfx, new Float32Array(16));
  return { M, made, draws, freed, draw, st };
}
const FLAP_TEAM = { id: "t" }, FLAP_PAINT = { paint: 1 }, FLAP_LVL = 2;
const yaw = 0.7, FLAP_MAT = new Float32Array([Math.cos(yaw), 0, -Math.sin(yaw), 0, 0, 1, 0, 0,
  Math.sin(yaw), 0, Math.cos(yaw), 0, 10, 2, -5, 1]);
// Every drawn vertex (and normal) in WORLD space, in draw order.
function world(draws) {
  const P = [], N = [];
  for (const { mesh, mat: m } of draws) {
    const p = mesh.d.pos, n = mesh.d.nrm;
    for (let i = 0; i < p.length; i += 3) {
      P.push(m[0] * p[i] + m[4] * p[i + 1] + m[8] * p[i + 2] + m[12],
             m[1] * p[i] + m[5] * p[i + 1] + m[9] * p[i + 2] + m[13],
             m[2] * p[i] + m[6] * p[i + 1] + m[10] * p[i + 2] + m[14]);
      N.push(m[0] * n[i] + m[4] * n[i + 1] + m[8] * n[i + 2],
             m[1] * n[i] + m[5] * n[i + 1] + m[9] * n[i + 2],
             m[2] * n[i] + m[6] * n[i + 1] + m[10] * n[i + 2]);
    }
  }
  return { P, N };
}
const maxDiff = (a, b) => { assert.equal(a.length, b.length, "vertex count"); let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; };

// The straight-mode TE strip (CarMesh.drawAeroEdge) is a separate overlay on
// existing emissive opts, not a flap element. LOD still merges the flaps.
const flapDraws = (r) => r.draws.filter((d) => d.opts === FLAP_PAINT);
const edgeDraws = (r) => r.draws.filter((d) => d.opts !== FLAP_PAINT);

test("drawAeroFlaps: moving = one draw per element; `still` or at rest = ONE draw of the whole set", () => {
  const r = flapRig(), els = r.M.Car3D.aeroFlaps(FLAP_LVL, null);
  assert.deepEqual(["front", "rear"].map((w) => els.filter((e) => e.wing === w).length >= 2), [true, true],
    "level 2 moves two elements on each wing (the case worth merging)");
  r.draw(FLAP_TEAM, FLAP_LVL, 0.4, FLAP_MAT, FLAP_PAINT, null);
  assert.equal(flapDraws(r).length, els.length, "moving, inside the gate: the animated per-element path");
  assert.equal(edgeDraws(r).length, 0, "TE strip is off unless apex26.aeroEdge");
  for (const [blend, still, why] of [[0.4, true, "a rival past FieldLod.flapsM() / the mirror / the PiP"],
    [0, false, "closed, at rest"], [1, false, "open, at rest"], [0.7, true, "still, mid-travel"]]) {
    r.draws.length = 0;
    r.draw(FLAP_TEAM, FLAP_LVL, blend, FLAP_MAT, FLAP_PAINT, null, null, still);
    const flaps = flapDraws(r);
    assert.equal(flaps.length, 1, why + ": ONE flap-set draw");
    assert.equal(flaps[0].opts, FLAP_PAINT, why + ": the flaps' own draw options (one material on every backend)");
    assert.deepEqual(flaps[0].mat, Array.from(FLAP_MAT), why + ": on the car's own matrix");
    const verts = els.reduce((n, e) => n + r.M.Car3D.buildFlapGeom(e, r.st.col, null).pos.length, 0);
    assert.equal(flaps[0].mesh.d.pos.length, verts, why + ": every element of both wings");
    assert.equal(edgeDraws(r).length, 0, why + ": TE strip stays off by default");
  }
});

test("the static set is the per-element draw, baked: same vertices and normals at each rest pose", () => {
  const r = flapRig();
  for (const [blend, near, pose] of [[0.2, 1e-9, "closed (Z-mode)"], [0.5, 1 - 1e-9, "open (X-mode)"]]) {
    r.draws.length = 0;
    r.draw(FLAP_TEAM, FLAP_LVL, near, FLAP_MAT, FLAP_PAINT, null);   // the animated path, a hair off the pose
    const moving = world(flapDraws(r));
    r.draws.length = 0;
    r.draw(FLAP_TEAM, FLAP_LVL, blend, FLAP_MAT, FLAP_PAINT, null, null, true);   // the nearer rest pose
    const still = world(flapDraws(r));
    assert.ok(maxDiff(moving.P, still.P) < 1e-5, pose + ": positions");
    assert.ok(maxDiff(moving.N, still.N) < 1e-5, pose + ": normals");
    assert.deepEqual(r.draws[0].mesh.d.mat, r.M.Car3D.aeroFlaps(FLAP_LVL, null)
      .flatMap((e) => r.M.Car3D.buildFlapGeom(e, r.st.col, null).mat), pose + ": surfaces");
  }
  // `only` (the cockpit's front wing) bakes that wing alone.
  r.draws.length = 0;
  r.draw(FLAP_TEAM, FLAP_LVL, 0, FLAP_MAT, FLAP_PAINT, null, "front");
  const front = r.M.Car3D.aeroFlaps(FLAP_LVL, null).filter((e) => e.wing === "front");
  assert.equal(r.draws[0].mesh.d.pos.length, front.reduce((n, e) => n + r.M.Car3D.buildFlapGeom(e, r.st.col, null).pos.length, 0));
});

test("the static set is cached per (solve, colour, finish, pose, wing) and FIFO-freed", () => {
  const r = flapRig();
  const set = (blend, only) => { r.draws.length = 0; r.draw(FLAP_TEAM, FLAP_LVL, blend, FLAP_MAT, FLAP_PAINT, null, only, true); return r.draws[0].mesh; };
  r.st.col = [0.31, 0.32, 0.33];
  const closed = set(0.1), n = r.made.length;
  assert.equal(set(0.4), closed, "a hit: no build");
  assert.equal(r.made.length, n);
  assert.notEqual(set(0.6), closed, "the open pose is its own mesh");
  assert.notEqual(set(0.1, "front"), closed, "so is one wing");
  r.st.finish = "satin";
  assert.notEqual(set(0.1), closed, "and a finish (the flap material)");
  r.st.finish = null;
  const before = r.freed.length;
  for (let i = 0; i < 70; i++) { r.st.col = [i / 100, 0.5, 0.5]; set(0); }
  assert.ok(r.freed.length > before, "a colour per edit evicts — and frees — the oldest sets");
});

// ── mirror cap ──────────────────────────────────────────────────────────────
function mirrorRig(lodOn) {
  const ctx = vm.createContext({
    Math, Float32Array, Array, Object, Number, Infinity, innerWidth: 1280,
    setTimeout: () => 1, clearTimeout: () => {},
    document: {
      getElementById: (id) => (id === "hud-mirror" ? { hidden: true, style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" },
        addEventListener() {}, getBoundingClientRect: () => ({ left: 440, top: 70, width: 400, height: 114, right: 840, bottom: 184 }) }
        : id === "game" ? { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) } : null),
      body: { classList: { contains: () => false, toggle() {} }, style: { setProperty() {} } },
    },
    Input: { consumeMirror: () => false, lookingBack: () => false },
    PerfGov: { tier: () => 0 },
    performance: { now: () => 0 },
    CamModes: { CAM_MODES: [{ id: "chase" }, { id: "far" }, { id: "drift" }, { id: "cockpit" }] },
    Tracks: {
      sample: (_t, s, out) => { out.p[0] = 0; out.p[1] = 0; out.p[2] = s; out.t[0] = 0; out.t[1] = 0; out.t[2] = 1;
        out.r[0] = -1; out.r[1] = 0; out.r[2] = 0; return out; },
      banking: () => null,
    },
  });
  seedLog(ctx);
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: "mat4.js" });
  vm.runInContext(read("js/car/field-lod.js").replace(/^const\b/gm, "var"), ctx, { filename: "field-lod.js" });
  ctx.FieldLod.setEnabled(lodOn);
  vm.runInContext(read("js/render/shared/mirror-pass.js").replace(/^const\b/gm, "var"), ctx, { filename: "mirror-pass.js" });
  const draws = [];
  const gfx = { width: 1280, height: 720, softPresent: () => false, mirrorBegin: () => true, mirrorEnd: () => {}, mirrorRect: () => {},
    mirrorState: () => ({ dead: false, ready: true }), draw: (mesh) => draws.push(mesh), drawSky: () => {} };
  const player = { isPlayer: true, s: 100, x: 0, team: "me" };
  const cars = [player];
  for (let i = 1; i <= 10; i++) cars.push({ s: 100 - 5 * i, x: 0, team: "r" + i });   // 5..50 m straight back
  cars.push({ s: 97, x: 40, team: "wide" });   // 3 m back, 40 m to the side: outside a 56° mirror
  const G = { gfx, state: "race", player, cars, track: { total: 5000 }, camMode: 0, dbgCam: null, hideMeshes: {}, frozen: false,
    store: { get: (k, d) => (k === "hudMirror" ? "on" : d), set() {} } };
  const mp = ctx.MirrorPass.create(G, {
    drawWorldMeshes: () => {}, drawCar: (c) => gfx.draw(c.team),
    renderPosOf: (c) => ({ world: true, x: -c.x, z: c.s }), playerAnchor: (c) => ({ cS: c.s, cX: c.x }),
    yawVisInterp: () => 0,
    basisMat: (r, u, f, p, out) => { out.set([r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, f[0], f[1], f[2], 0, p[0], p[1], p[2], 1]); return out; },
    carPaint: () => ({}),
  });
  const frame = { viewProj: new Float32Array(16), proj: null, invProj: null, invViewProj: new Float32Array(16), eye: [0, 5, 90], cullDist: 0, tune: {} };
  mp.render(frame, { invViewProj: frame.invViewProj }, false, false, 0);
  return { draws, mp };
}

test("mirror: the nearest 6 rivals behind, nothing outside its cone; every car with apex26.fieldLod=0", () => {
  const on = mirrorRig(true);
  assert.deepEqual(on.draws, ["r1", "r2", "r3", "r4", "r5", "r6"]);
  assert.equal(on.mp.state().cars, 6);
  const off = mirrorRig(false);
  assert.deepEqual(off.draws, ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "wide"], "legacy: uncapped, no cone");
});

// ── warm-up ─────────────────────────────────────────────────────────────────
function literal(src, re) {
  const m = src.match(re);
  assert.ok(m, "missing " + re);
  return vm.runInNewContext("(" + m[1] + ")");
}
test("warm: TLX compiles the flame / ERS lit keys during the lights", () => {
  const tlx = read("js/render/three/tlx.js"), game = read("js/car/car-draw.js");   // the flame / ERS draw lives in drawExhaustFx
  const fn = tlx.match(/function buildMatKey\(o, chunked, instanced\) \{[\s\S]*?\n {6}\}/);
  assert.ok(fn, "buildMatKey");
  const key = vm.runInNewContext("(" + fn[0] + ")");
  const lateFx = literal(tlx, /const _LATE_FX = (\[[\s\S]*?\]);/);
  const warmed = new Set(lateFx.map((o) => key(o, false, false)));
  const flame = literal(game, /const _flameOpts = (\{[^}]*\});/);
  const ers = literal(game, /const _ersLightOpts = (\{[^}]*\});/);
  // drawExhaustFx draws the flame at alpha (0.30 + 0.55 fl) * pop < 1, the ERS strip at 1 or 0.6.
  for (const [o, alpha] of [[flame, 0.4], [ers, 1], [ers, 0.6]]) {
    const k = key(Object.assign({}, o, { alpha }), false, false);
    assert.ok(warmed.has(k), "not warmed: " + k);
  }
  assert.match(tlx, /if \(_lateFxOn\(\)\) for \(const o of _LATE_FX\) materialFor\(o, false, false\);/, "minted before the MRT stamp");
  assert.match(tlx, /await warmLateLit\(\);/);
});

test("warm: warmCarAssets builds the caster silhouette, the field wheels and the flame (not a whole-car mesh per rival)", () => {
  const cd = read("js/car/car-draw.js");
  const body = cd.slice(cd.indexOf("function warmCarAssets()"), cd.indexOf("async function prepareMenuCarAssets"));
  assert.match(body, /teamMesh\(c\.team, c, true\)/, ":sh silhouette");
  assert.match(body, /if \(!c\.isPlayer\) getFieldWheelMeshes\(c\.team, c\)/, "field wheels");
  // NOT the whole-car teamMesh per rival: ~240 ms of CPU each, it doubled the
  // game-vm track build (4 s -> 9 s) and failed "boot and track build do not hang".
  assert.doesNotMatch(body, /teamMesh\(c\.team, c\);/, "no per-rival whole-car pre-build");
  // Visual-only warm: skipped headless / on an inert gfx (game-vm), where there
  // is no launch hitch to hide.
  assert.match(body, /const lodWarm = FieldLod\.on && !G\.headlessMode/, "headless skips the FieldLod warm");
  assert.match(body, /CarMesh\.getExhaustFlame\(c\.fuelVisual && c\.fuelVisual\.fxFlame\)/, "flame quad (same key the draw uses)");
  assert.match(cd, /FieldLod\.init\(G\.store\)/, "the off-switch is read once at boot");
});

// The wheel extras take the tier game.js keeps on the car (FieldLod's 10 %
// hysteresis); the stateless wheelsLite() flipped the fixed layers every frame
// for a rival jittering +-1.2 m around 50 m.
test("drawPlayerWheels' lite gate follows c._lodTier (hysteresis), wheelsLite only without a tier", () => {
  const cd = read("js/car/car-draw.js");
  const decl = cd.match(/const lodT = c\._lodTier, haveTier = [^\n]*\n\s*(const lite = [^\n]*;)/);
  assert.ok(decl, "the lite gate is present");
  const run = (ctx, c, camD2, bare = false) => vm.runInContext(
    `(function (c, camD2, bare, G) { const lodT = c._lodTier, haveTier = ${cd.match(/haveTier = ([^\n]*);/)[1]}; ${decl[1]} return lite; })`, ctx)
    (c, camD2, bare, { lens: null });
  const flips = (useTier) => {
    const ctx = loadLod(), L = ctx.FieldLod, car = { isPlayer: false };
    let n = 0, prev = null;
    for (let f = 0; f < 200; f++) {
      const d2 = at(f % 2 ? 51.2 : 48.8);
      if (useTier) L.tier(d2, undefined, car);
      const lite = run(ctx, car, d2);
      if (prev !== null && lite !== prev) n++;
      prev = lite;
    }
    return n;
  };
  assert.equal(flips(true), 0, "with the game.js tier: no flicker around 50 m");
  assert.equal(flips(false), 199, "no tier on the car: the plain table (what every test and FieldLod-off path sees)");
  const ctx = loadLod(), L = ctx.FieldLod;
  const car = { isPlayer: false };
  L.tier(at(30), undefined, car);
  assert.equal(run(ctx, car, at(52)), false, "tier 0 holds to +10 %");
  L.tier(at(56), undefined, car);
  assert.equal(run(ctx, car, at(56)), true, "tier 1 past it");
  assert.equal(run(ctx, { isPlayer: true, _lodTier: 2 }, at(900)), false, "the player is never lite");
  assert.equal(run(ctx, { isPlayer: false, _lodTier: 0 }, at(9), true), true, "bare (mirror / PiP) is always lite");
  const off = loadLod(0);
  assert.equal(run(off, { isPlayer: false, _lodTier: 2 }, at(500)), false, "FieldLod off ignores a stale tier");
});
