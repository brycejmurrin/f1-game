/* car-draw-vm.mjs — the REAL car-drawing seam (js/car/car-draw.js) and the REAL
 * second camera (js/render/shared/mirror-pass.js) in one Node VM, over a
 * recording renderer and a counting Car3D, so a test can ask what a draw BUILDS
 * rather than what it was handed. The bounded mesh caches, their keys, the warm
 * paths (warmCarAssets / prepareMenuCarAssets) and drawMirrorCar are the
 * product's own code; Car3D, Parts, the DOM and the track are small stubs.
 *
 *   const vm = carDrawVm({ casters: true });
 *   vm.G.cars = vm.field(...);  vm.carDraw.warmCarAssets();
 *   const mp = vm.mirror();     mp.render(...);   vm.rec.builds -> []
 *
 * rec.builds: one { kind: "whole" | "body" | "sh", team, num } per Car3D.build;
 * rec.wheels: Car3D.buildWheelLayers calls; rec.freed: meshes an LRU let go.
 * Real teams come from js/data/teams.js (11 x 2 seats); `legends: true` appends
 * js/data/legends.js's twelve-seat LEGENDS entry, the menu's widest pick.
 * `career`: null (no career) or { teamId: fitted setup } — Career.aiSetup's
 * R&D shelves; v.careerOn(map) engages one later. Every team's factory build is
 * WORKS (each category "w:<id>"), and resolveSetup lays a setup over it. */
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "./seed-log.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const run = (ctx, rel) => vm.runInContext(read(rel).replace(/^const\b/gm, "var"), ctx, { filename: rel });

// Parts' twelve visual categories, by id: the stamp makeCars keys a car's own build on.
const CATALOG = ["aero", "floor", "engine", "ers", "gearbox", "suspension", "brakes", "tyres", "wheels", "cooling", "fuel", "livery"]
  .map((id) => ({ id }));

export const WORKS = Object.freeze(Object.fromEntries(CATALOG.map((c) => [c.id, "w:" + c.id])));

export function carDrawVm({ casters = false, cam = "chase", legends = false, playerParts = { aero: "hi-df", tyres: "soft" }, career = null } = {}) {
  const rec = { builds: [], wheels: 0, freed: 0, draws: [] };
  const stored = { hudMirror: "on" };
  const classes = new Set();
  const rect = (l, t, w, h) => () => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
  const frameEl = { hidden: true, style: { getPropertyValue: () => "", getPropertyPriority: () => "", setProperty() {}, removeProperty() {} },
    getBoundingClientRect: rect(440, 70, 400, 114), addEventListener() {} };
  const els = { "hud-mirror": frameEl, "hud-mirror-chip": { hidden: true, addEventListener() {} },
    "bc-pip": { hidden: true, getBoundingClientRect: rect(900, 60, 360, 202) }, game: { getBoundingClientRect: rect(0, 0, 1280, 720) } };
  let st = { dead: false, ready: true, renders: 0 };
  const gfx = {
    width: 1280, height: 720, mobileTier: false,
    softPresent: () => false,
    createMesh: (buf) => buf,
    freeMesh: () => { rec.freed++; },
    draw: (mesh) => { rec.draws.push(mesh); },
    drawSky() {},
    mirrorBegin: () => true, mirrorEnd: () => { st = { dead: false, ready: true, renders: st.renders + 1 }; },
    mirrorRect() {}, mirrorState: () => st,
    warming: () => false,
  };
  // The shadow passes' backend half: what shadowCastersWanted() reads for "this device casts".
  if (casters) { gfx.carShadowBegin = () => true; gfx.lampShadowBegin = () => true; }
  const ctx = vm.createContext({
    Math, Float32Array, Array, Object, Number, String, JSON, Map, WeakMap, Set, Promise, Infinity, innerWidth: 1280,
    setTimeout: (fn) => { Promise.resolve().then(fn); return 0; }, clearTimeout() {},
    performance: { now: () => 0 },
    document: {
      getElementById: (id) => els[id] || null,
      body: { classList: { contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) }, style: { setProperty() {} } },
    },
    Input: { consumeMirror: () => false, lookingBack: () => false },
    PerfGov: { tier: () => 0 },
    LightTune: { LT: { carShadow: 1, lampShadow: 1 } },
    CamModes: { CAM_MODES: [{ id: "chase" }, { id: "cockpit" }] },
    CockpitOpts: { haloSize: () => 2, body: () => "standard" },
    PhysicsConsts: { WHEEL_R: 0.33, WHEEL_STEER_VIS: 0.35, VMAX: 95 },
    // A straight road along +Z; the track's +x-right is world −X (AGENTS.md).
    Tracks: {
      sample: (_t, s, out) => { out.p[0] = 0; out.p[1] = 0; out.p[2] = s; out.t[0] = 0; out.t[1] = 0; out.t[2] = 1;
        out.r[0] = -1; out.r[1] = 0; out.r[2] = 0; return out; },
      banking: () => null,
    },
    GameCams: { vantage: (_t, _m, s) => ({ eye: [0, 4, s - 12], tgt: [0, 1, s + 20], fov: 40 }) },
    CarMesh: new Proxy({}, { get: (_o, k) => () => ({ carMesh: String(k) }) }),
    Car3D: {
      build: (_c1, _c2, o) => {
        const kind = o.silhouette ? "sh" : o.noWheels ? "body" : "whole";
        rec.builds.push({ kind, team: o.teamId, num: o.num });
        return { kind, team: o.teamId, num: o.num };
      },
      buildWheelLayers: () => { rec.wheels++; return { rotating: { kind: "wheel" }, fixed: { kind: "wheelFixed" } }; },
      TYRE_BAND: [null, [1, 1, 0]], BRAKE_CALIPER: [null, [1, 0, 0]],
      aeroLevelOf: () => 2, aeroStyleOf: () => null,
    },
    Parts: {
      CATALOG,
      legalityKey: () => "2026",
      factoryKey: (team) => "F-" + team.id,
      getFactorySetup: () => Object.assign({}, WORKS),
      resolveSetup: (setup) => ({ ids: Object.assign({}, WORKS, setup) }),
      getVisualTiers: () => ({ tyres: 1, brakes: 1, _ids: { tyres: "medium", brakes: "standard", wheels: "standard" }, _visual: {} }),
    },
    Career: { gridDrivers: (t) => t.drivers, driverOverride: () => null,
      inCareer: () => !!career, aiSetup: (team) => (career && career[team.id]) || null },
  });
  seedLog(ctx);
  run(ctx, "js/core/mat4.js");
  run(ctx, "js/data/teams.js");
  if (legends) {
    run(ctx, "js/data/legends.js");
    ctx.Teams.LIST.push(ctx.Legends.team(ctx.Legends.LIST[0].id));
  }
  run(ctx, "js/car/field-lod.js");
  run(ctx, "js/car/car-draw.js");
  run(ctx, "js/render/shared/mirror-pass.js");

  const teams = ctx.Teams.LIST;
  const G = {
    gfx, cars: [], camMode: cam === "cockpit" ? 1 : 0, camEye: [0, 1, 0], raceT: 0, headlessMode: false,
    teamIdx: 0, driverIdx: 0, state: "race", player: null, track: { total: 5000 }, dbgCam: null, hideMeshes: {}, frozen: false,
    STEER_SPEED_REF: 0, vTop: () => 95, pits: null,
    store: { rev: 1, get: (k, d) => (k in stored ? stored[k] : d), set: (k, v) => { stored[k] = v; } },
    getLiveryId: () => "default",
    getTeamParts: () => playerParts,
  };
  const carDraw = ctx.CarDraw.create(G, {
    resolveLivery: () => ({ c1: [1, 0, 0], c2: [0, 0, 1] }), partsVisualKey: () => "111111111111",
    drawAeroFlaps() {}, damp: (a) => a, isTimeTrial: () => false, isQuali: () => false,
  });

  // makeCars' field for the menu's pick (G.teamIdx / G.driverIdx): every real
  // seat, the picked team's too, each car stamped by makeCars' own call —
  // CarDraw.carVisual(team, num, isP || mate, getTeamParts), the real helper.
  // `s(i)`: each car's arc position.
  function field(s) {
    const cars = [];
    teams.forEach((team, ti) => {
      if (!ctx.Teams.isReal(team) && ti !== G.teamIdx) return;
      (team.legends ? [team.drivers[G.driverIdx]] : team.drivers).forEach((d, di) => {
        const isP = ti === G.teamIdx && (team.legends || di === G.driverIdx);
        const c = { team, num: d.num, code: d.code, isPlayer: isP, human: isP, speed: 60, steerVis: 0, kCur: 0, x: 0 };
        const mate = !isP && ti === G.teamIdx && !!team.custom;   // MY TEAM's hire
        cars.push(Object.assign(c, ctx.CarDraw.carVisual(team, d.num, isP || mate, G.getTeamParts)));
      });
    });
    cars.forEach((c, i) => { c.s = s(c, i); });
    G.cars = cars;
    G.player = cars.find((c) => c.isPlayer) || null;
    return cars;
  }

  // The real MirrorPass on CarDraw's real drawMirrorCar (game.js wires the same).
  function mirror(over) {
    return ctx.MirrorPass.create(G, Object.assign({
      drawWorldMeshes() {}, drawCar: carDraw.drawMirrorCar,
      renderPosOf: (c) => ({ world: true, x: -(c.x || 0), z: c.s }),
      playerAnchor: (c) => ({ cS: c.s, cX: c.x || 0 }),
      yawVisInterp: () => 0,
      basisMat: (r, u, f, p, out) => { out.set([r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, f[0], f[1], f[2], 0, p[0], p[1], p[2], 1]); return out; },
      carPaint: () => ({ carPaint: 1 }),
    }, over || {}));
  }
  const frame = { viewProj: new Float32Array(16), proj: null, invProj: null, invViewProj: new Float32Array(16), eye: [0, 5, 0], cullDist: 0, tune: {} };
  const draw = (mp, night) => mp.render(frame, { invViewProj: frame.invViewProj }, !!night, false, 0);
  const careerOn = (map) => { career = map; };
  return { ctx, G, carDraw, rec, field, mirror, draw, classes, teams, careerOn };
}
