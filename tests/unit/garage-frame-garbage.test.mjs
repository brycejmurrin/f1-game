/* #5462: the garage bay's per-frame garbage while a moment plays.
 *  - THE POSE STREAM: GarageArrival.create().step() fills one pose per sequence
 *    instead of building a ~30-field tree every frame. The stream it plays
 *    (every field of every frame, eye and aim included) is pinned by hash to the
 *    stream the allocating code played, so the animation is bit-identical; every
 *    frame also equals the pure pose(t) at the same t, and a consumer's writes
 *    onto the pooled pose (GarageExterior.fitPose / groundPose, the wheel
 *    distance) never reach the next frame.
 *  - THE SERVICE CREW: the parked SERVICE rig's draw stream (mesh, matrix) is
 *    pinned the same way (the Math.hypot port is V8's own algorithm, bit-exact).
 *  - ALLOCATIONS: the sampling heap profiler at an 8 B interval (the method of
 *    tools/perf/vm-alloc-census.mjs, PR #5465) counts garage-owned samples that
 *    are not a 16 B HeapNumber. The count is pinned at zero: an allocation-free
 *    loop yields no sample at any sampling luck. Boxed doubles are reported, not
 *    gated: JavaScriptCore (Bryce's iPhone) stores doubles inline and has none.
 *
 * A pinned hash changes only when an animation changes on purpose (Bryce's call):
 *   UPDATE_POSE_STREAM=1 node --test tests/unit/garage-frame-garbage.test.mjs   # prints the new hashes
 * Run: node --test tests/unit/garage-frame-garbage.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { Session } from "node:inspector";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const CHILD = !!process.env.GARAGE_ALLOC_CHILD, it = CHILD ? () => {} : test;   // the census child registers no test
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILES = ["js/core/mat4.js", "js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/crew-draw.js",
  "js/garage/crew-motion.js", "js/garage/crew-service.js", "js/garage/crew-choreo.js", "js/garage/scene-crew.js", "js/garage/arrival.js",
  "js/garage/garage-data.js", "js/data/garage-entrance-motion.js", "js/garage/entrance-motion.js"];
function load() {
  const ctx = vm.createContext({ Math, Object, Array, Number, Float32Array, Log: { info() {}, warn() {} } });
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  return { Arrival: vm.runInContext("GarageArrival", ctx), Crew: vm.runInContext("GarageCrew", ctx), Choreo: vm.runInContext("GarageCrewChoreo", ctx) };
}
const el = () => ({ classList: { toggle() {} }, setAttribute() {}, focus() {}, hidden: false, inert: false, textContent: "" });
function harness() { const els = {}; return (id) => els[id] || (els[id] = el()); }
// JSON with -0 kept apart from 0 (JSON.stringify writes both as 0).
const enc = (s) => JSON.stringify(s, (k, v) => (Object.is(v, -0) ? "-0" : v));
const sha = (parts) => { const h = createHash("sha256"); for (const p of parts) h.update(p).update("\n"); return h.digest("hex").slice(0, 16); };

/* One playback of the WORK ON CAR player at 60 fps on a fixed clock. */
function playback(Arrival, saved, startOpts, each) {
  let clock = 1000;
  const arrival = Arrival.create(harness(), () => false, () => saved, () => clock);
  arrival.start(startOpts);
  let n = 0;
  while (arrival.state && arrival.state.active && n < 3000) { clock += 1 / 60; const s = arrival.step(1 / 60); each(s, n++); }
  each(arrival.step(1 / 60), n++);   // the finished, parked state
  return n;
}
// The crews and angles that reach every branch of poseIn: cut / director / a rig, move,
// zoom and sway, slow-mo, the procedural fallback, a choreo crew under a moving rig
// (clearOfCrew), AFTER THE RACE with the held title, and a sprint's caption.
const SCENARIOS = (Choreo) => {
  const clip = Choreo.IDS.in.find((id) => !Choreo.CLIPS[id].result);
  return {
    "in-current": [{ enterCrew: "current" }],
    "in-service": [{ enterCrew: "service" }],
    "in-director-push": [{ enterCrew: "current", angle: "director", move: "push", zoom: 6, sway: 2, height: 0.4 }],
    "in-drift-custom": [{ enterCrew: "welcome", angle: "custom", shots: ["door", "low", "high"], move: "drift" }],
    "in-crane-choreo": [{ enterCrew: clip, angle: "crane", fov: 60 }],
    "in-orbit-slowmo": [{ enterCrew: "guides", angle: "orbit", slowmo: 0.5 }],
    "in-procedural": [{ enterCrew: "current" }, { authored: false }],
    "home-win": [{}, { home: { result: "win", pos: 1, driver: "Norris", grid: 1, fastest: true } }],
    "home-sprint-podium": [{ homeCrew: "auto" }, { home: { result: "podium", pos: 3, driver: "Piastri", grid: 7, sprint: true, wet: true } }],
    "home-dnf": [{}, { home: { result: "dnf", pos: 14 } }],
  };
};
const POSE_STREAM = {
  "in-current": "55cf2f7d246f1cee",
  "in-service": "e345137ded7e49c4",
  "in-director-push": "11851e056417b084",
  "in-drift-custom": "0a683975c72aaf31",
  "in-crane-choreo": "9e79e2a5a1e3568a",
  "in-orbit-slowmo": "4159dc459c28ad85",
  "in-procedural": "4483dcf22b71e166",
  "home-win": "f4a91dfd76e28eb1",
  "home-sprint-podium": "31440dcc28aa9735",
  "home-dnf": "ebcdf6f0989288af",
};
const UPDATE = !!process.env.UPDATE_POSE_STREAM;

it("WORK ON CAR / AFTER THE RACE: the stepped pose stream is the shipped one, bit for bit", () => {
  const { Arrival, Choreo } = load();
  const got = {};
  for (const [name, [saved, opts]] of Object.entries(SCENARIOS(Choreo))) {
    const parts = [];
    const n = playback(Arrival, saved, opts, (s) => parts.push(enc(s)));
    got[name] = sha(parts);
    assert.ok(n > 300, `${name}: a whole playback (${n} frames)`);
  }
  if (UPDATE) { console.log(JSON.stringify(got, null, 2)); return; }
  assert.deepEqual(got, POSE_STREAM);
});

// THE DRIVE-OUT (every RACE!): the pure poseOut stream, 60 fps past its end into the empty-lane hold.
const OUT_SCENARIOS = { "out-cut": {}, "out-service": { leaveCrew: "service" }, "out-director-push": { angle: "director", move: "push", zoom: 6, height: -0.3 },
  "out-crane": { angle: "crane", fov: 50 }, "out-slowmo-drift": { angle: "low", move: "drift", slowmo: 0.25, carSpeed: 1.4, hold: 0.5 } };
const OUT_STREAM = "1e9b44fb04c6f2cb";   // recorded on the deploy tip (79bfd4b) before #5462
it("THE DRIVE-OUT: the pure poseOut stream is the shipped one, bit for bit (eased and calm)", () => {
  const { Arrival } = load();
  const parts = [];
  for (const saved of Object.values(OUT_SCENARIOS)) {
    const cfg = Arrival.settings(saved), end = Arrival.duration(cfg, "out") + 3;
    for (const calm of [false, true]) for (let t = 0; t < end; t += 1 / 60) parts.push(enc(Arrival.poseOut(t, cfg, calm)));
  }
  assert.ok(parts.length > 3000, `${parts.length} poses`);
  if (UPDATE) { console.log("OUT_STREAM", sha(parts)); return; }
  assert.equal(sha(parts), OUT_STREAM);
});

it("a consumer's writes on the playing pose never reach the next frame; each frame equals pose(t) (in, home and the pooled poseOut)", () => {
  const { Arrival } = load();
  const scribble = (s) => {   // what setup-camera.js and GarageExterior write onto a playing pose
    s.distance = 4.2; s.exteriorUnsupported = true; s.groundY = 0.03; s.groundForward = 0.01; s.groundRight = -0.02;
    s.x = -s.x; s.yaw = -s.yaw; s.side = -s.side; s.eye[0] += 1; s.aim[1] += 1; s.eye = [9, 9, 9];
  };
  for (const [saved, opts, poseFn] of [[{ enterCrew: "service", angle: "director", move: "drift" }, undefined, "pose"],
    [{}, { home: { result: "podium", pos: 2, driver: "Leclerc" } }, "poseHome"]]) {
    let held = null, n = 0;
    playback(Arrival, saved, opts, (s) => {
      if (held) assert.equal(s, held, "one pose object for the whole sequence");
      held = s;
      const cfg = Arrival.settings(saved);   // a pure pose of the same settings at the same t (fresh pins: same crew, no MIX)
      if (opts && opts.home) Object.assign(cfg, { result: opts.home.result, pos: opts.home.pos, driver: opts.home.driver, fastest: false, race: "dry", grid: null, sprint: false });
      if (s.active) assert.equal(enc(s), enc(Arrival[poseFn](s.seconds, cfg, false, null)), `frame ${n}`);
      n++; scribble(s);
    });
  }
  const cfg = Arrival.settings({ leaveCrew: "service", angle: "high", move: "push" }), o = {};
  for (let t = 0; t < Arrival.duration(cfg, "out") + 2; t += 1 / 30) {
    const got = Arrival.poseOut(t, cfg, false, o);
    assert.equal(got, o);
    assert.equal(enc(got), enc(Arrival.poseOut(t, cfg)), `poseOut t ${t.toFixed(2)}`);
    scribble(got);
  }
});

/* The SERVICE crew's draws over a whole parked visit and the release (poseOut). */
function serviceDraws(Arrival, Crew) {
  const meshes = [], parts = [];
  const gfx = { createMesh: (d) => { meshes.push(d.pos.length); return meshes.length - 1; }, freeMesh() {}, draw: (mesh, m) => parts.push(mesh + ":" + Array.from(m).join(",")) };
  Crew.init(gfx);
  const liv = { c1: [1, 0.5, 0], c2: [0.1, 0.1, 0.1] };
  const cin = Arrival.settings({ enterCrew: "service" }), T = Arrival.timeline(cin, "in"), end = Arrival.duration(cin, "in");
  const cout = Arrival.settings({ leaveCrew: "service" }), endOut = Arrival.duration(cout, "out");
  const poses = [];
  for (let t = T.park - 0.5; t < end; t += 1 / 60) poses.push(Arrival.pose(t, cin));
  for (let t = 0; t < endOut; t += 1 / 60) poses.push(Arrival.poseOut(t, cout));
  poses.push(Arrival.pose(T.park + 2, cin, true));   // calm (reduced motion)
  return { gfx, liv, poses, parts };
}
/* A Blender crew clip (the default MIX deals these) over its whole arrival. */
function choreoDraws(Arrival, Crew, Choreo) {
  const meshes = [], parts = [];
  const gfx = { createMesh: (d) => { meshes.push(d.pos.length); return meshes.length - 1; }, freeMesh() {}, draw: (mesh, m) => parts.push(mesh + ":" + Array.from(m).join(",")) };
  Crew.init(gfx);
  const clip = Choreo.IDS.in.find((id) => !Choreo.CLIPS[id].result), cfg = Arrival.settings({ enterCrew: clip }), end = Arrival.duration(cfg, "in");
  const poses = [];
  for (let t = 0; t < end; t += 1 / 60) poses.push(Arrival.pose(t, cfg));
  return { gfx, liv: { c1: [0.2, 0.3, 0.9], c2: [0.9, 0.9, 0.9] }, poses, parts };
}
// Recorded on the deploy tip (79bfd4b) before #5462: the crew's lengths moved from Math.hypot to
// Math.sqrt of the squares (within an ulp in double); the Float32 matrices come out identical.
const SERVICE_STREAM = "c8084924247b8774", CHOREO_STREAM = "d42e864c72d95f25";

it("the SERVICE crew's and a Blender crew's draw streams (mesh, matrix) are the shipped ones, bit for bit", () => {
  const got = {};
  for (const [name, make] of [["service", serviceDraws], ["choreo", choreoDraws]]) {
    const { Arrival, Crew, Choreo } = load();
    const { liv, poses, parts } = make(Arrival, Crew, Choreo);
    for (const p of poses) Crew.draw(liv, p.eye, p, null, "ferrari");
    assert.ok(parts.length > 10000, `${name}: ${parts.length} draws`);
    got[name] = sha(parts);
  }
  if (UPDATE) { console.log("STREAMS", JSON.stringify(got)); return; }
  assert.deepEqual(got, { service: SERVICE_STREAM, choreo: CHOREO_STREAM });
});

/* ALLOCATIONS. A sample is this lane's when its nearest JS frame is one of OWNED (a
 * builtin's sample, e.g. Math.hypot's argument array, goes to its caller). scene-crew.js's
 * own build / layout / noseTip garbage is PR #5464's (#5116) and is reported, not gated. */
const OWNED = ["js/garage/arrival.js", "js/garage/entrance-motion.js", "js/garage/crew-draw.js", "js/garage/crew-motion.js",
  "js/garage/crew-service.js", "js/garage/crew-choreo.js"];
function sessionPost() {
  const session = new Session(); session.connect();
  return (m, p) => new Promise((res, rej) => session.post(m, p || {}, (e, v) => (e ? rej(e) : res(v))));
}
async function sampled(post, fn) {
  await post("HeapProfiler.startSampling", { samplingInterval: 8, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  fn();
  return (await post("HeapProfiler.stopSampling")).profile;
}
// The sample size of one HeapNumber: the modal size of a loop that only boxes doubles.
async function boxedSize(post) {
  const slots = new Array(1024).fill(null), h = new Map();
  for (const s of (await sampled(post, () => { for (let i = 0; i < 2e5; i++) slots[i & 1023] = i * 0.1 + 0.3; })).samples) h.set(s.size, (h.get(s.size) || 0) + 1);
  return [...h].sort((a, b) => b[1] - a[1])[0][0];
}
function census(profile, box) {
  const node = new Map(), parent = new Map();
  (function walk(n) { node.set(n.id, n); for (const c of n.children) { parent.set(c.id, n); walk(c); } })(profile.head);
  const out = { owned: 0, ownedBytes: 0, boxed: 0, other: 0, end: 0, sites: new Map() };
  for (const s of profile.samples) {
    if (s.size === box) { out.boxed += s.size; continue; }
    let n = node.get(s.nodeId);
    while (n && !n.callFrame.url) n = parent.get(n.id);
    const url = n ? n.callFrame.url : "";
    if (n && n.callFrame.functionName === "finish" && url.endsWith("js/garage/arrival.js")) out.end += s.size;   // once a playback: the end's focus options
    else if (OWNED.some((f) => url.endsWith(f))) {
      out.owned++; out.ownedBytes += s.size;
      const k = `${n.callFrame.functionName} ${path.relative(ROOT, url.startsWith("file:") ? fileURLToPath(url) : url)}:${n.callFrame.lineNumber + 1} (${s.size} B)`;
      out.sites.set(k, (out.sites.get(k) || 0) + 1);
    } else if (url.includes("/js/")) out.other += s.size;
  }
  return out;
}
const report = (c) => [...c.sites].map(([k, n]) => `${n} x ${k}`).join("; ");

/* The census runs in a child on the interpreter alone (--no-opt --no-maglev --no-sparkplug):
 * no optimiser can escape-analyse a temporary away (JavaScriptCore's baseline tiers would
 * allocate it), and no compile lands its metadata in a window; --no-lazy-feedback-allocation
 * gives every function its feedback vector at its first call, not mid-window. A clean loop
 * samples zero. Measured 2026-11-11 (Node 22): a per-frame 40 B object is caught ~99 % of
 * frames, so a regression shows as hundreds of samples, never as a lucky zero. */
async function childCensus() {
  const post = sessionPost(), box = await boxedSize(post), res = { box, arrival: {}, crew: {} };
  const { Arrival, Choreo } = load();
  for (const [name, [saved, opts]] of Object.entries(SCENARIOS(Choreo))) {
    playback(Arrival, saved, opts, () => {});   // feedback vectors and the pins' WeakMap tables
    let clock = 1000, frames = 0;
    const arrival = Arrival.create(harness(), () => false, () => saved, () => clock);
    arrival.start(opts);
    for (let i = 0; i < 2; i++) { clock += 1 / 60; arrival.step(1 / 60); }   // the playback's first reads: its pins and its one pose
    const c = census(await sampled(post, () => {
      while (arrival.state.active && frames < 3000) { clock += 1 / 60; arrival.step(1 / 60); frames++; }
    }), box);
    res.arrival[name] = { frames, owned: c.owned, ownedBytes: c.ownedBytes, boxedPerFrame: Math.round(c.boxed / frames), endBytes: c.end, sites: report(c) };
  }
  for (const make of [serviceDraws, choreoDraws]) {
    const { Arrival: A, Crew, Choreo: C } = load();
    const { liv } = make(A, Crew, C), poses = make(A, Crew, C).poses.filter((_, i) => i % 20 === 0);   // every 20th frame (~4,000 rig draws): the census stays ~6 s
    for (const p of poses) Crew.draw(liv, p.eye, p, null, "ferrari");
    const c = census(await sampled(post, () => { for (const p of poses) Crew.draw(liv, p.eye, p, null, "ferrari"); }), box);
    res.crew[make.name] = { frames: poses.length, owned: c.owned, ownedBytes: c.ownedBytes, boxedPerFrame: Math.round(c.boxed / poses.length),
      sceneCrewPerFrame: Math.round(c.other / poses.length), sites: report(c) };
  }
  process.stdout.write(JSON.stringify(res) + "\n");
}
if (CHILD) await childCensus();
let censusResult = null;
function runCensus() {
  if (censusResult) return censusResult;
  const r = spawnSync(process.execPath, ["--no-opt", "--no-maglev", "--no-sparkplug", "--no-lazy-feedback-allocation", fileURLToPath(import.meta.url)],
    { env: Object.assign({}, process.env, { GARAGE_ALLOC_CHILD: "1" }), encoding: "utf8", timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  return (censusResult = JSON.parse(r.stdout.trim().split("\n").pop()));
}

it("a playing arrival allocates no object a frame (only V8's boxed doubles, which JSC does not have)", () => {
  const { arrival } = runCensus();
  for (const [name, c] of Object.entries(arrival)) {
    assert.ok(c.frames > 300, `${name}: ${c.frames} frames sampled`);
    assert.equal(c.owned, 0, `${name}: ${c.ownedBytes} B over ${c.frames} frames — ${c.sites}`);
  }
});

it("the parked SERVICE crew and a Blender crew allocate no object a frame in the crew rig", () => {
  const { crew } = runCensus();
  for (const [name, c] of Object.entries(crew)) assert.equal(c.owned, 0, `${name}: ${c.ownedBytes} B over ${c.frames} frames — ${c.sites}`);
});
