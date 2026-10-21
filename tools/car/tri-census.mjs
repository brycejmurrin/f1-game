#!/usr/bin/env node
// Triangle / vertex census of every car body the game can draw. Offline, no browser.
// @doc Car mesh census: tris/verts per body style × aero × draw tier (player, field, caster, far); --root = another checkout.
// @skill garage-parts-livery
//
// Bryce, 2026-10-20: "with all of our new body shapes … they are rising way more
// vertices and are affecting perf". Car3D.build runs in node:vm the way
// parts-sweep.mjs loads it, once per draw tier js/car/car-draw.js asks for:
//
//   player   playerBodyMesh: noWheels, dense cover (rounded = CarShade default "*")
//   field    teamBodyMesh: noWheels + field:true, a rival inside FieldLod NO_DECAL_M
//   caster   teamMesh(…, true): silhouette:true, the sun/lamp shadow caster
//   flaps    buildComplete − build: the active-aero flap set (drawn separately)
//   far      sharedRivalBodyMesh: one grey body for every rival past NO_DECAL_M
//
//   node tools/car/tri-census.mjs                    every body on ferrari's factory parts
//   node tools/car/tri-census.mjs --aero             + every aero STYLE shape on each body (player tier)
//   node tools/car/tri-census.mjs --flat             flat-shaded builds (apex26.carSmooth=0) as well
//   node tools/car/tri-census.mjs --root=<dir>       measure another checkout (git worktree) for a before/after
//   node tools/car/tri-census.mjs --json             machine output
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] == null ? true : m[2]] : [a, true];
}));
const ROOT = path.resolve(args.root || path.join(HERE, "../.."));

const FILES = ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js",
  "js/car/livery-design.js", "js/car/livery-graphics.js", "js/car/crest-draw.js", "js/car/liverytex.js", "js/car/helmets.js",
  "js/car/car-geometry.js", "js/car/car-wheels.js", "js/car/car-material-shade.js", "js/car/car-materials.js",
  "js/car/car-shade.js", "js/car/car-body-geom.js", "js/car/car3d.js"];

export function loadCar(root = ROOT, smooth = true) {
  const ctx = { console: { log() {}, info() {}, warn() {}, error() {} }, Math, Object, Array, Float32Array, Uint16Array,
    Uint32Array, JSON, Number, String, Boolean, isFinite, isNaN, Map, Set, WeakMap, Symbol, Error };
  ctx.globalThis = ctx;
  ctx.localStorage = { getItem: (k) => (k === "apex26.carSmooth" ? (smooth ? "1" : "0") : null), setItem() {}, removeItem() {} };
  vm.createContext(ctx);
  for (const f of FILES) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f });
  }
  const grab = (n) => { try { return vm.runInContext(n, ctx); } catch (_) { return null; } };
  return { Car3D: grab("Car3D"), Parts: grab("Parts"), Teams: grab("Teams"), CarGeometry: grab("CarGeometry") };
}

const count = (m) => ({ tris: (m.idx.length / 3) | 0, verts: (m.pos.length / 3) | 0 });

// One body's census on one team's factory parts. Returns the five tiers.
export function censusBody(M, teamId, bodyStyle, extraLivery = {}) {
  const { Car3D, Parts, Teams } = M;
  const team = Teams.LIST.find((t) => t.id === teamId);
  const parts = Parts.getVisualTiers(Parts.getFactorySetup(team), team);
  const livery = Object.assign({ c1: team.color, c2: team.color2 }, bodyStyle ? { bodyStyle } : {}, extraLivery);
  const base = { livery, teamId: team.id, num: 16, parts };
  const player = count(Car3D.build(team.color, team.color2, Object.assign({}, base, { noWheels: true })));
  const field = count(Car3D.build(team.color, team.color2, Object.assign({}, base, { noWheels: true, field: true })));
  const caster = count(Car3D.build(team.color, team.color2, Object.assign({}, base, { silhouette: true })));
  const plain = Car3D.build(team.color, team.color2, Object.assign({}, base, { noWheels: true }));
  const full = Car3D.buildComplete ? Car3D.buildComplete(team.color, team.color2, Object.assign({}, base, { noWheels: true })) : plain;
  const flaps = { tris: count(full).tris - count(plain).tris, verts: count(full).verts - count(plain).verts };
  return { player, field, caster, flaps };
}

export function farBody(M) {
  const { Car3D, Parts, Teams } = M;
  const team = Teams.LIST[0];
  return count(Car3D.build([0.72, 0.72, 0.72], [0.72, 0.72, 0.72], { field: true, silhouette: true, noDriver: true,
    noWheels: true, livery: {}, smooth: false, parts: Parts.getVisualTiers(Parts.getFactorySetup(team), team) }));
}

function main() {
  const teamId = args.team || "ferrari";
  const variants = [["rounded", true], ...(args.flat ? [["flat", false]] : [])];
  const rows = [];
  for (const [shade, smooth] of variants) {
    const M = loadCar(ROOT, smooth);
    const ids = [null, ...(M.Car3D.BODY_STYLE_IDS || Object.keys(M.Car3D.BODY_STYLES || {}))];
    const aeroIds = args.aero ? (M.Parts.CATALOG.find((c) => c.id === "aero").options
      .filter((o) => o.tag === "STYLE").map((o) => o.id)) : [];
    for (const id of ids) {
      const r = censusBody(M, teamId, id);
      rows.push({ shade, body: id || teamId, aero: "fitted", ...r });
      for (const a of aeroIds) {
        const ra = censusBody(M, teamId, id, { aeroShape: a });
        rows.push({ shade, body: id || teamId, aero: a, ...ra });
      }
    }
    rows.push({ shade, body: "(far shared)", aero: "-", player: farBody(M), field: null, caster: null, flaps: null });
  }
  if (args.json) { process.stdout.write(JSON.stringify({ root: ROOT, team: teamId, rows }, null, 1) + "\n"); return; }
  const pad = (s, n) => String(s).padEnd(n), num = (v) => String(v == null ? "-" : v).padStart(7);
  console.log(`# car mesh census — root ${ROOT}, team ${teamId}`);
  console.log(pad("shade", 8) + pad("body", 13) + pad("aero", 22) + "  player.t player.v  field.t  field.v caster.t  flaps.t");
  for (const r of rows) console.log(pad(r.shade, 8) + pad(r.body, 13) + pad(r.aero, 22) +
    [r.player && r.player.tris, r.player && r.player.verts, r.field && r.field.tris, r.field && r.field.verts,
     r.caster && r.caster.tris, r.flaps && r.flaps.tris].map(num).join("  "));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
