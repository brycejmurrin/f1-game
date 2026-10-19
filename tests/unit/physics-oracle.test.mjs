/* physics-oracle.test.mjs — the apex-26 port gate's oracle is deterministic.
 *
 * tools/check/physics-oracle.mjs and tools/check/track-oracle.mjs write the
 * golden traces the TypeScript port must match bit for bit
 * (docs/notes/PHYSICS-ORACLE-2026-10-18.md). A golden file that differs
 * between two runs of the same tree is no gate at all, so this runs each CLI
 * twice on a short horizon (30 steps, 50 samples) in fresh processes and
 * asserts the outputs are byte-identical. The physics run includes a
 * synthetic packed InputGhost v3 envelope, so the ghost decoder is covered.
 *
 * Run: node --test tests/unit/physics-oracle.test.mjs   (~10 s: four VM boots, two at a time)
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeNumber, recipes, unpackGhost } from "../../tools/check/physics-oracle.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
const TMP = fs.mkdtempSync(path.join(ROOT, "scratch", "oracle-test-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const PHYS = path.join(ROOT, "tools/check/physics-oracle.mjs");
const TRACK = path.join(ROOT, "tools/check/track-oracle.mjs");
const REVISION = /REVISION:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "js/physics/consts.js"), "utf8"))[1];

// 40 steps of a packed v3 lap: steer is a dense float64 channel, throttle a
// constant, brake run-length pieces, flags uint8 (bit 1 = throttle).
const N = 40;
const f64 = (vals) => { const b = Buffer.alloc(vals.length * 8); vals.forEach((v, i) => b.writeDoubleLE(v, i * 8)); return b.toString("base64"); };
const GHOST = {
  v: 3, kind: "input-ghost", track: "monza", time: 1, seed: 5, physRev: REVISION, build: 0, dt: 1 / 60, context: "oracle-test",
  initialState: { seed: 5, rngState: 5, raceT: 0, car: { s: 300, x: 0.5, speed: 30 } },
  packedV3: { count: N, steer: f64(Array.from({ length: N }, (_, i) => Math.sin(i / 7) * 0.3)), throttle: 1,
    brake: { pieces: [[30, 0], [10, 0.25]] }, flags: Buffer.alloc(N, 1).toString("base64") },
};
const ghostFile = path.join(TMP, "ghost.json");
fs.writeFileSync(ghostFile, JSON.stringify(GHOST));

const dir = (name) => path.join(TMP, name);
const physArgs = (out) => [PHYS, "--steps", "30", "--ghost", ghostFile, "--out", out];
const trackArgs = (out) => [TRACK, "--samples", "50", "--out", out];
const read = (d) => Object.fromEntries(fs.readdirSync(d).sort().map((f) => [f, fs.readFileSync(path.join(d, f))]));

function assertSame(a, b) {
  assert.deepEqual(Object.keys(a), Object.keys(b), "the two runs wrote different file sets");
  for (const f of Object.keys(a)) assert.ok(a[f].equals(b[f]), `${f} differs between two runs of the same tree`);
}

test("encodeNumber keeps what JSON drops", () => {
  const s = JSON.stringify([-0, 0, NaN, Infinity, -Infinity, 0.1 + 0.2], encodeNumber);
  assert.equal(s, '["-0",0,"NaN","Infinity","-Infinity",0.30000000000000004]');
});

test("unpackGhost decodes every packedV3 channel form", () => {
  const g = unpackGhost(GHOST);
  assert.equal(g.rawSteer.length, N);
  assert.equal(g.rawSteer[7], Math.sin(1) * 0.3);
  assert.deepEqual(g.rawThrottle, Array(N).fill(1));
  assert.equal(g.rawBrake[29], 0); assert.equal(g.rawBrake[30], 0.25);
  assert.deepEqual(g.flags, Array(N).fill(1));
});

test("physics-oracle: two runs, byte-identical traces", async () => {
  await Promise.all([run(process.execPath, physArgs(dir("p1")), { cwd: ROOT }), run(process.execPath, physArgs(dir("p2")), { cwd: ROOT })]);
  const a = read(dir("p1")), b = read(dir("p2"));
  // One trace per SCENARIOS recipe plus the ghost; derived so a widened SCENARIOS (#3036) cannot stale it.
  const want = ["monza-ghost.json", ...recipes().map((r) => `monza-${r.id}.json`)].sort();
  assert.ok(want.length >= 5 && want.includes("monza-steady-corner-load.json"), want.join());
  assert.deepEqual(Object.keys(a).sort(), want);
  assertSame(a, b);
  const t = JSON.parse(a["monza-steady-corner-load.json"]);
  assert.equal(t.header.REVISION, REVISION);
  assert.equal(t.header.FIXED_DT, 1 / 60);
  assert.equal(t.header.seed, 7);
  assert.equal(t.steps.length, 30);
  assert.ok(Object.keys(t.header.files).includes("js/game.js") && /^[0-9a-f]{64}$/.test(t.header.files["js/game.js"]));
  const r = t.steps[29];
  for (const k of ["s", "x", "px", "pz", "head", "speed", "vLat", "yawRateCur", "prog", "slipFront", "slipRear"])
    assert.ok(Number.isFinite(r[k]), `${k} is a number (${r[k]})`);
  assert.ok(r.speed > 40 && r.track.hw > 0 && r.input.steer === 0.6, JSON.stringify(r));
  const gh = JSON.parse(a["monza-ghost.json"]);
  assert.equal(gh.steps.length, 30);
  assert.equal(gh.steps[0].input.steer, Math.sin(0) * 0.3);
  assert.ok(Math.abs(gh.initial.s - 300) < 1e-9 && gh.initial.speed === 30, JSON.stringify(gh.initial));
});

test("track-oracle: two runs, byte-identical grids", async () => {
  await Promise.all([run(process.execPath, trackArgs(dir("t1")), { cwd: ROOT }), run(process.execPath, trackArgs(dir("t2")), { cwd: ROOT })]);
  const a = read(dir("t1")), b = read(dir("t2"));
  assert.deepEqual(Object.keys(a), ["track-monza.json"]);
  assertSame(a, b);
  const t = JSON.parse(a["track-monza.json"]);
  assert.equal(t.rows.length, 50);
  assert.equal(t.rows[0].s, 0);
  assert.equal(t.rows[1].s, t.header.total / 50);
  assert.deepEqual(t.rows[3].lat.map((l) => l.f), [-1, -0.5, 0, 0.5, 1]);
  assert.ok(t.rows.every((r) => r.hw > 0 && r.wallR != null && r.wallL != null));
});
