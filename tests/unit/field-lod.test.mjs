/* field-lod — the rival-car distance LOD (js/car/field-lod.js) and the three
 * consumers that take its cuts on every backend:
 *   - the TABLE: which parts a rival draws at a camera distance (rotating wheels
 *     only past 50 m, flaps within 80 m, exhaust flame within 60 m, the whole-car
 *     mesh as one draw past 120 m), the player never reduced, and
 *     apex26.fieldLod = 0 returning every legacy gate;
 *   - the SHADOW gate (js/render/shared/shadow-pass.js, driven for real): a
 *     rival pushed with cast=false keeps its blob but is never a sun-map
 *     caster; an omitted flag (the fieldLod=0 path) still casts; and game.js
 *     pushes the caster AFTER the side-frustum test under FieldLod;
 *   - the MIRROR cap (js/render/shared/mirror-pass.js, driven for real): the
 *     nearest 6 rivals, nothing outside the mirror's cone, every car with the
 *     LOD off;
 *   - the WARM: TLX compiles the flame / ERS lit variants during the lights
 *     (their material keys equal the ones game.js draws with), and
 *     warmCarAssets builds the :sh caster, the mirror mesh, the field wheels
 *     and the flame quad.
 * No browser (~0.1 s). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

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
  assert.deepEqual([p100.tier, p100.body, p100.flaps], [1, true, false], "100 m: body + decal + wheels, no flaps");
  const far = L.parts(at(130), false);
  assert.deepEqual([far.tier, far.body, far.decal, far.wheels, far.fixedWheels], [2, true, false, true, false],
    "130 m: the whole-car teamMesh, ONE draw, no decal");
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
  assert.match(g, /< FieldLod\.flapsM\(\) \*\* 2/, "flaps gate from the table");
  assert.match(g, /carDraw\.drawExhaustFx\(c, tmpMat, [^\n]*FieldLod\.flame\(_lodD2\)\)/, "flame gate from the table");
  const cd = read("js/car/car-draw.js");
  assert.match(cd, /const lite = !c\.isPlayer && FieldLod\.wheelsLite\(camD2\)/);
  // lite: the rotating wheel draw, then only the far brake flare (a Particles
  // flare outside the pool, 40-240 m) before the wheel's other layers are skipped.
  assert.match(cd, /if \(lite\) \{[\s\S]{0,600}?Particles\.flare\([\s\S]{0,200}?continue;/, "lite: the rotating wheel, the far flare, then nothing else for that wheel");
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
    drawWorldMeshes: () => {}, teamMesh: (team) => team,
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
  assert.match(body, /CarMesh\.getExhaustFlame\(c\.fuelVisual && c\.fuelVisual\.fxFlame\)/, "flame quad (same key the draw uses)");
  assert.match(cd, /FieldLod\.init\(G\.store\)/, "the off-switch is read once at boot");
});
