#!/usr/bin/env node
/**
 * @doc Golden physics traces (VM): raw-double per-step player state + track queries for the apex-26 TypeScript port gate.
 * @skill tune-physics
 *
 * physics-oracle — boots the REAL js/game.js headless (tools/lib/game-vm.cjs)
 * and writes one JSON trace per input recipe, every number exactly the double
 * the game computed. apex-26 (the TypeScript port) replays the same inputs
 * through its own physics and must match these files bit for bit; this tool is
 * read-only on the game and writes only under artifacts/.
 * Why and how the gate uses it: docs/notes/PHYSICS-ORACLE-2026-10-18.md.
 *
 *   node tools/check/physics-oracle.mjs                       # monza, the 4 recipes, 600 steps each
 *   node tools/check/physics-oracle.mjs --track spa --steps 120
 *   node tools/check/physics-oracle.mjs --trace straight-line-accel,off-track-recovery
 *   node tools/check/physics-oracle.mjs --ghost lap.json      # + an InputGhost v3 envelope (--steps 0 = all of it)
 *   node tools/check/physics-oracle.mjs --ghost lap.json --no-recipes --out scratch/oracle
 *
 * RECIPES are read from tests/specs/physics-characterization.spec.js (the
 * SCENARIOS literal, the same parse tests/unit/physics-characterization-vm
 * .test.mjs pins), so there is one copy. Their stages play in order and the
 * LAST stage's input is held until --steps; fewer steps truncate.
 *
 * PINNED WORLD: factory seat (game-vm "pin"), tyre wear / wind / reliability
 * off, every assist off (drivingHelp 1, gripSteer 1, raceLine 0, autoThrottle
 * and throttleLatch false, ROAD_FOLLOW asserted 0), dry with zero wetness, and
 * every AI car retired after each reset (reset() un-retires them).
 *
 * JSON keeps every finite double exactly (shortest round-trip form). The
 * values JSON cannot hold are written as strings: "-0", "Infinity",
 * "-Infinity", "NaN" (`encodeNumber`); a reader maps them back.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as espree from "espree";
import { parseFlags } from "../lib/cli-args.mjs";
const require = createRequire(import.meta.url);
const { createGame, settle, ROOT } = require("../lib/game-vm.cjs");

export const SCHEMA = "apex-physics-oracle/1";
const SPEC = path.join(ROOT, "tests", "specs", "physics-characterization.spec.js");

/** Every assist off and every non-driving-model seam pinned (game-vm adds tyreWear/wind off). */
export const PINNED_STORAGE = Object.freeze({
  tyreWear: "off", wind: "off", reliability: "off", caution: false,
  drivingHelp: 1, gripSteer: 1, raceLine: 0, autoThrottle: false, throttleLatch: false, manual: false,
});

/** JSON.stringify replacer: the four numbers JSON would lose become strings. */
export function encodeNumber(_k, v) {
  if (typeof v !== "number") return v;
  if (Object.is(v, -0)) return "-0";
  if (Number.isNaN(v)) return "NaN";
  if (v === Infinity) return "Infinity";
  if (v === -Infinity) return "-Infinity";
  return v;
}
export const stringify = (o) => JSON.stringify(o, encodeNumber) + "\n";

/** The characterization recipes, read as literal data from the browser spec. */
export function recipes() {
  const ast = espree.parse(fs.readFileSync(SPEC, "utf8"), { ecmaVersion: "latest", sourceType: "module" });
  const literal = (n) => {
    if (n.type === "Literal") return n.value;
    if (n.type === "UnaryExpression" && n.operator === "-") return -literal(n.argument);
    if (n.type === "ArrayExpression") return n.elements.map(literal);
    if (n.type === "ObjectExpression") return Object.fromEntries(n.properties.map((p) => [p.key.name ?? p.key.value, literal(p.value)]));
    throw new Error(`physics-oracle: unsupported recipe node ${n.type} in ${path.relative(ROOT, SPEC)}`);
  };
  const decl = ast.body.filter((n) => n.type === "VariableDeclaration").flatMap((n) => n.declarations)
    .find((d) => d.id.name === "SCENARIOS");
  if (!decl) throw new Error("physics-oracle: SCENARIOS not found in " + path.relative(ROOT, SPEC));
  return literal(decl.init).map((s) => ({ ...s, id: slug(s.name) }));
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// --- InputGhost v3 envelopes ------------------------------------------------
// js/car/input-ghost.js writes packedV3 to disk and exports no unpacker; the
// channel format is small: a constant number, { pieces: [[count, channel]] },
// or base64 of little-endian float64s (uint8s for flags).
function unpackChannel(value, count, flags) {
  if (typeof value === "number") return Array(count).fill(value);
  if (value && typeof value === "object") {
    const out = [];
    for (const [n, v] of value.pieces) out.push(...unpackChannel(v, n, flags));
    if (out.length !== count) throw new Error("physics-oracle: ghost run length differs");
    return out;
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== count * (flags ? 1 : 8)) throw new Error("physics-oracle: ghost channel size differs");
  return Array.from({ length: count }, (_, i) => flags ? bytes[i] : bytes.readDoubleLE(i * 8));
}
export function unpackGhost(g) {
  if (!g || !g.packedV3) return g;
  const p = g.packedV3, n = p.count;
  const out = { ...g, rawSteer: unpackChannel(p.steer, n), rawThrottle: unpackChannel(p.throttle, n),
    rawBrake: unpackChannel(p.brake, n), flags: unpackChannel(p.flags, n, true) };
  delete out.packedV3;
  out.steer = out.rawSteer.map((v) => Math.max(-127, Math.min(127, Math.round(v * 127))));
  out.throttle = out.rawThrottle.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
  out.brake = out.rawBrake.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
  return out;
}
/** A file holding one envelope, or an InputGhost store ({ id: envelope }) with exactly one. */
export function readGhost(file) {
  let g = JSON.parse(fs.readFileSync(file, "utf8"));
  if (g && g.kind !== "input-ghost") {
    const vals = Object.values(g).filter((v) => v && v.kind === "input-ghost");
    if (vals.length !== 1) throw new Error(`physics-oracle: ${file} holds ${vals.length} input-ghost envelopes (want 1)`);
    g = vals[0];
  }
  return unpackGhost(g);
}

// --- header -------------------------------------------------------------------
function gitSha() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); }
  catch (_) { return null; }
}
/** sha256 of every js file the VM evaluated, in load order (first load wins). */
export function fileHashes(record) {
  const out = {};
  for (const { file } of record.scripts) {
    if (out[file]) continue;
    out[file] = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
  }
  return out;
}
export function header(g, track, extra) {
  const PC = g.sandbox.PhysicsConsts;
  return Object.assign({ schema: SCHEMA, REVISION: PC.REVISION, seed: g.G.seed, gitSha: gitSha(), track,
    FIXED_DT: PC.FIXED_DT, seat: g.seat.name, storage: PINNED_STORAGE }, extra, { files: fileHashes(g.record) });
}

/** Boot a pinned game on `track`, scenery resident. Throws on any unpinned seam. */
export async function bootPinned(track) {
  const g = await createGame({ track, wx: "dry", storage: PINNED_STORAGE });
  const S = g.sandbox;
  // game-vm waits only 200 turns for the boot circuit's scenery closure; a bare
  // build is a different physics world (its props collide), so insist on it.
  if (!(await settle(() => !!(S.TrackScenery && S.TrackScenery[track]), 4000)))
    throw new Error(`physics-oracle: TrackScenery[${track}] never loaded — refusing a bare build`);
  if (!g.G.track || g.G.track.def.id !== track) throw new Error(`physics-oracle: built ${g.G.track && g.G.track.def.id}, wanted ${track}`);
  g.apex.weather("dry");
  g.apex.step(0, 1);
  if (g.G.ROAD_FOLLOW !== 0) throw new Error("physics-oracle: ROAD_FOLLOW (driving help) is " + g.G.ROAD_FOLLOW + ", want 0");
  return g;
}

function retireField(g) {
  g.G.cars.forEach((c, i) => { if (c !== g.G.player && !c.retired) g.apex.retire(i, "oracle"); });
}

function assertPinned(g) {
  if (g.G.raceWeather !== "dry" || g.G.trackWetness() !== 0) throw new Error("physics-oracle: weather is not dry");
  const live = g.G.cars.filter((c) => c !== g.G.player && !c.retired).length;
  if (live) throw new Error(`physics-oracle: ${live} AI cars still racing`);
}

const STATE = ["s", "x", "px", "pz", "head", "speed", "vLat", "yawRateCur", "prog", "lap", "gear",
  "steerSm", "steerAngle", "kerbGripSm", "slipFront", "slipRear"];

/** One row: the player's raw state, then the track queries at its (s, x). */
function row(g, smp, input) {
  const P = g.G.player, T = g.sandbox.Tracks, track = g.G.track;
  const r = {};
  for (const k of STATE) r[k] = P[k] === undefined ? null : P[k];
  T.sample(track, P.s, smp);
  const bank = T.banking(track, P.s, P.x);
  r.track = { p: smp.p.slice(), t: smp.t.slice(), r: smp.r.slice(), hw: smp.hw,
    roll: bank ? bank.roll : null, onKerb: T.onKerb(track, P.s, P.x), inPitLane: !!T.inPitLane(track, P.s, P.x) };
  if (input !== undefined) r.input = input;
  return r;
}

/**
 * Run one trace. `start(g)` places the car (after weather pin and reset);
 * `inputAt(i)` returns the input for step i, or null to stop.
 */
function runTrace(g, start, inputAt, steps) {
  const a = g.apex, dt = g.sandbox.PhysicsConsts.FIXED_DT;
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  a.weather("dry");
  a.step(0, 1);
  start(g);
  assertPinned(g);
  const initial = row(g, smp);
  const rows = [];
  for (let i = 0; i < steps; i++) {
    const inp = inputAt(i);
    if (!inp) break;
    a.setInput(inp);
    a.step(dt, 1);
    rows.push(row(g, smp, inp));
  }
  a.clearInput();
  return { initial, steps: rows };
}

/** The recipe trace: seed, reset(frac, speed, x), retire the field, stages in order, last input held. */
export function recipeTrace(g, rec, steps) {
  const flat = [];
  for (const st of rec.steps) for (let i = 0; i < st.n; i++) flat.push(st.in);
  const last = flat[flat.length - 1];
  const start = () => {
    g.apex.seed(rec.seed);
    g.apex.reset(rec.frac, rec.speed, rec.x || 0);
    retireField(g);
  };
  const t = runTrace(g, start, (i) => Object.assign({}, i < flat.length ? flat[i] : last), steps);
  return Object.assign({ trace: rec.id, kind: "recipe", recipe: { name: rec.name, seed: rec.seed, frac: rec.frac,
    speed: rec.speed, x: rec.x || 0, stages: rec.steps } }, t);
}

/** The ghost trace: initialState's seed + RNG stream and (s, x, speed); raw channels per step. */
export function ghostTrace(g, ghost, steps) {
  const IG = g.sandbox.InputGhost;
  if (ghost.v !== 3 || !IG.valid(ghost)) throw new Error("physics-oracle: --ghost wants a valid InputGhost v3 envelope");
  if (ghost.physRev !== IG.currentPhysRev())
    throw new Error(`physics-oracle: ghost physRev ${ghost.physRev} is not this tree's ${IG.currentPhysRev()} — it cannot replay faithfully`);
  if (Math.abs(ghost.dt - IG.currentDt()) > 1e-12) throw new Error(`physics-oracle: ghost dt ${ghost.dt} != FIXED_DT`);
  const st = ghost.initialState, n = ghost.rawSteer.length;
  const start = () => {
    g.apex.reset(st.car.s / g.G.track.total, st.car.speed, st.car.x);
    retireField(g);
    g.G.simSeed(st.seed, st.rngState);
  };
  const inputAt = (i) => {
    if (i >= n) return null;
    const step = IG.decodeStep(ghost.steer[i], ghost.flags[i], ghost.throttle[i], ghost.brake[i]);
    return Object.assign(step, { steer: ghost.rawSteer[i], throttleLevel: ghost.rawThrottle[i], brakeLevel: ghost.rawBrake[i] });
  };
  const t = runTrace(g, start, inputAt, steps > 0 ? steps : n);
  return Object.assign({ trace: "ghost", kind: "ghost", ghost: { track: ghost.track, time: ghost.time, seed: st.seed,
    rngState: st.rngState, physRev: ghost.physRev, steps: n } }, t);
}

const FLAGS = ["--track", "--steps", "--trace", "--ghost", "--no-recipes", "--out", "--help"];
const USAGE = `physics-oracle [--track monza] [--steps 600] [--trace id,…] [--ghost file.json] [--no-recipes] [--out artifacts/oracle]`;

export async function main(argv) {
  const f = parseFlags(argv, FLAGS);
  if (f.has("--help")) { console.log(USAGE); return 0; }
  const track = f.flag("--track", "monza");
  const steps = Number(f.flag("--steps", "600"));
  if (!Number.isInteger(steps) || steps < 0) throw new Error("physics-oracle: --steps wants an integer >= 0 (0 = the whole ghost)");
  const out = path.resolve(ROOT, f.flag("--out", path.join("artifacts", "oracle")));
  const all = recipes();
  const want = f.list("--trace", "");
  const unknown = want.filter((id) => !all.some((r) => r.id === id));
  if (unknown.length) throw new Error(`physics-oracle: unknown --trace ${unknown.join(",")} (have ${all.map((r) => r.id).join(",")})`);
  const picked = f.has("--no-recipes") ? [] : all.filter((r) => !want.length || want.includes(r.id));
  const ghostFile = f.flag("--ghost", null);
  const ghost = ghostFile ? readGhost(path.resolve(ghostFile)) : null;
  if (ghost && ghost.track && ghost.track !== track)
    throw new Error(`physics-oracle: ghost is for ${ghost.track}, --track is ${track}`);
  if (!picked.length && !ghost) throw new Error("physics-oracle: nothing to run (--no-recipes without --ghost)");
  if (steps === 0 && picked.length) throw new Error("physics-oracle: --steps 0 is ghost-only; recipes need a horizon");

  const g = await bootPinned(track);
  try {
    fs.mkdirSync(out, { recursive: true });
    const written = [];
    const emit = (t) => {
      const file = path.join(out, `${track}-${t.trace}.json`);
      fs.writeFileSync(file, stringify(Object.assign({ header: header(g, track, { seed: (t.recipe || t.ghost).seed, trace: t.trace, steps: t.steps.length }) }, t)));
      written.push(path.relative(ROOT, file));
    };
    for (const r of picked) emit(recipeTrace(g, r, steps));
    if (ghost) emit(ghostTrace(g, ghost, steps));
    for (const w of written) console.log(w);
    return 0;
  } finally { g.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e && e.message || e); process.exit(1); });
}
