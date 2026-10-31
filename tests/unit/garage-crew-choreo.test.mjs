/* THE BLENDER CREW CLIPS (js/garage/crew-choreo.js) and the in-race pit crew
 * (js/garage/pit-crew.js).
 *  - the runtime key tables are the current Blender source's export;
 *  - at least three new ENTER and three new LEAVE crews, chosen per visit by
 *    MIX (the same playback always reads the same crew, the next one moves on);
 *  - no crew member ever stands in the car's swept path, in or out, either way
 *    round the lane;
 *  - the pit clip is a pure function of PitLane.stopAnim's u: its steps sit on
 *    stopAnim's own boundaries, the tyre men's hands ride the wheel slide, and
 *    drawing it touches neither the car nor the stop's clock.
 *
 * Run: node --test tests/unit/garage-crew-choreo.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const FILES = ["js/core/mat4.js", "js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/crew-draw.js",
  "js/garage/crew-motion.js", "js/garage/crew-service.js", "js/garage/garage-data.js", "js/garage/crew-choreo.js", "js/garage/scene-crew.js", "js/garage/pit-crew.js", "js/garage/arrival.js"];
function load(extra = {}, files = FILES) {
  const draws = [], meshes = [];
  const gfx = { createMesh: (d) => { const mesh = { n: d.pos.length }; meshes.push(mesh); return mesh; }, freeMesh() {}, draw: (mesh, m) => draws.push({ mesh, m: Array.from(m) }) };
  const ctx = vm.createContext({ Math, Object, Array, Number, Float32Array, WeakMap, Map, String, Log: { info() {}, warn() {} }, ...extra });
  for (const f of files) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const get = (n) => vm.runInContext(n, ctx, { filename: "garage-crew-choreo:get" });
  get("GarageCrew").init(gfx);
  // CLIPS: the lazy key tables (js/garage/garage-data.js) when loaded, the eager index's entries otherwise.
  const Data = get("typeof GarageData !== 'undefined' ? GarageData : null");
  return { Choreo: get("GarageCrewChoreo"), Data, CLIPS: Data ? Data.CLIPS : {}, Crew: get("GarageCrew"), Arrival: get("GarageArrival"), Pit: get("PitCrewAnim"), gfx, draws, meshes };
}

test("runtime key tables match the current Blender authoring source", () => {
  const digest = createHash("sha256").update(read("tools/gen/blender/crew-choreo.py")).digest("hex");
  assert.ok(read("js/garage/garage-data.js").includes("Source SHA256: " + digest),
    "regenerate: blender -b --python tools/gen/blender/crew-choreo.py -- --output-dir artifacts/crew-choreo --write-runtime");
});

test("three or more new crews each way, a pit clip, and well-formed key tables", () => {
  const { Choreo, CLIPS } = load();
  assert.ok(Choreo.IDS.in.length >= 3, "enter variants: " + Choreo.IDS.in);
  assert.ok(Choreo.IDS.out.length >= 3, "leave variants: " + Choreo.IDS.out);
  assert.deepEqual(Array.from(Choreo.IDS.pit), ["pit"]);
  for (const [id, clip] of Object.entries(CLIPS)) {
    assert.ok(clip.actors.length > 0 && clip.len > 0 && clip.label, id);
    for (const a of clip.actors) for (const [k, keys] of Object.entries(a.ch)) {
      assert.ok(keys.length >= 2 && keys.length % 2 === 0, `${id}.${k}`);
      for (let i = 0; i < keys.length; i++) assert.ok(Number.isFinite(keys[i]), `${id}.${k}[${i}]`);
      for (let i = 2; i < keys.length; i += 2) assert.ok(keys[i] > keys[i - 2], `${id}.${k} keys ascend`);
    }
  }
});

test("value() is Blender's SINE ease-in-out between keys, linear when baked, held outside", () => {
  const { Choreo } = load(), k = [1, 0, 3, 2];
  assert.equal(Choreo.value(k, 0, 0), 0); assert.equal(Choreo.value(k, 9, 0), 2);
  assert.ok(Math.abs(Choreo.value(k, 2, 0) - 1) < 1e-12, "midpoint");
  assert.ok(Math.abs(Choreo.value(k, 1.5, 0) - 2 * (1 - Math.cos(Math.PI * 0.25)) / 2) < 1e-12, "eased quarter");
  assert.ok(Math.abs(Choreo.value(k, 1.5, 1) - 0.5) < 1e-12, "linear quarter");
});

test("MIX rotates every crew each way and never repeats a crew on consecutive visits", () => {
  const { Choreo } = load();
  for (const dir of ["in", "out"]) {
    const list = Choreo.MIX[dir], seen = new Set();
    for (let n = 0; n < list.length * 2; n++) {
      const id = Choreo.pick(dir, n); seen.add(id);
      assert.notEqual(id, Choreo.pick(dir, n + 1), `${dir} visit ${n}`);
    }
    assert.equal(seen.size, list.length, dir);
    for (const id of Choreo.IDS[dir]) assert.equal(new Set(list).has(id), Choreo.CLIPS[id].mix !== false, `${id} in the ${dir} rotation unless mix is false`);
    assert.equal(Choreo.pick(dir, -1), list[list.length - 1], "a negative count wraps");
  }
});

test("MIX keeps the shipped rotation; AFTER THE RACE crews are never dealt", () => {
  const { Choreo } = load();
  assert.deepEqual(Array.from(Choreo.MIX.in), ["current", "marshal", "inspect", "debrief", "service"]);
  assert.deepEqual(Array.from(Choreo.MIX.out), ["current", "sendoff", "pushout", "check", "service"]);
  for (let n = 0; n < 40; n++) assert.ok(!Choreo.CLIPS[Choreo.pick("in", n)]?.result, `visit ${n} deals an ordinary crew`);
});

test("one playback reads one crew; the next playback takes the next one", () => {
  const store = new Map();
  const localStorage = { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) };
  const { Arrival, Choreo } = load({ localStorage });
  const a = Arrival.settings({}), b = Arrival.settings({});
  assert.equal(a.enterCrew, "mix", "MIX is the default");
  const first = Arrival.crewFor(a, "in");
  for (let i = 0; i < 5; i++) assert.equal(Arrival.pose(i, a, true).crew, first, "pose");
  assert.equal(Arrival.duration(a, "in"), Arrival.DURATION + Choreo.extra(first), "duration sees the same crew");
  assert.notEqual(Arrival.crewFor(b, "in"), first, "a fresh playback moves on");
  assert.equal(store.get("apex26.crewVisit"), "2", "the visit count persists");
  // A reload carries on from the saved count.
  const again = load({ localStorage }).Arrival;
  assert.equal(again.crewFor(again.settings({}), "out"), Choreo.pick("out", 2));
});

test("settings accept each direction's own variants only", () => {
  const { Arrival, Choreo } = load();
  // A result clip (CLIPS[id].result) is timed on the AFTER THE RACE drive: never a pit-stop crew.
  for (const id of Choreo.IDS.in) assert.equal(Arrival.settings({ enterCrew: id }).enterCrew, Choreo.CLIPS[id].result ? "mix" : id);
  for (const id of Choreo.IDS.in) assert.equal(Arrival.settings({ homeCrew: id }).homeCrew, id, "AFTER-RACE CREW offers every arrival crew");
  for (const id of Choreo.IDS.out) assert.equal(Arrival.settings({ leaveCrew: id }).leaveCrew, id);
  assert.equal(Arrival.settings({ enterCrew: Choreo.IDS.out[0] }).enterCrew, "mix", "a leave crew cannot meet the car");
  assert.equal(Arrival.settings({ leaveCrew: "pit" }).leaveCrew, "mix");
  for (const id of Choreo.IDS.out) assert.equal(Arrival.duration(Arrival.settings({ leaveCrew: id }), "out"), Arrival.OUT_DURATION + Choreo.extra(id));
});

test("every crew picker option, static or filled from the clips, is a crew the settings accept", () => {
  const { Arrival, Choreo } = load({ document: { createElement: () => ({}) } }), html = read("index.html");
  // A select with the DOM's add(option, before) and its options list.
  const select = (inner) => {
    const options = [...inner.matchAll(/value="([^"]+)"/g)].map((x) => ({ value: x[1] }));
    return { value: "", options, onchange: null,
      add: (o, before) => options.splice(typeof before === "number" ? before : before ? options.indexOf(before) : options.length, 0, o) };
  };
  const els = {};
  for (const id of ["ga-crew-in", "ga-crew-out"]) els[id] = select(html.match(new RegExp(`<select id="${id}">(.*?)</select>`))[1]);
  const $ = (id) => els[id] || (els[id] = { value: "", checked: true, onchange: null, onclick: null, hidden: true });
  Arrival.bindSettings($, { get: () => null, set() {} });
  Arrival.bindSettings($, { get: () => null, set() {} });   // a second bind adds nothing twice
  for (const [id, key, dir] of [["ga-crew-in", "enterCrew", "in"], ["ga-crew-out", "leaveCrew", "out"]]) {
    const v = els[id].options.map((o) => o.value);
    assert.equal(v[0], "mix", `${id} leads with MIX`); assert.equal(v[v.length - 1], "none", `${id} ends with NO CREW`);
    for (const c of Choreo.IDS[dir]) assert.equal(v.filter((x) => x === c).length, Choreo.CLIPS[c].result ? 0 : 1, `${id} offers ${c} once (a result clip never)`);
    for (const x of v) assert.equal(Arrival.settings({ [key]: x })[key], x, `${id} ${x}`);
  }
});

// The car's footprint (centre, yaw; forward = (sin, cos)) against a body of radius r.
function inCar(px, pz, car, r = 0.25) {
  const c = Math.cos(car.yaw), s = Math.sin(car.yaw), dx = px - car.x, dz = pz - car.z;
  const along = dx * s + dz * c, across = dx * c - dz * s;
  return Math.abs(along) < 2.95 + r && Math.abs(across) < 1.0 + r;
}
test("no garage crew member stands in the car's path, either way round the lane", () => {
  const { Arrival, Choreo } = load(), out = Choreo.actors(12);
  for (const dir of ["in", "out"]) for (const id of Choreo.IDS[dir].filter((x) => !Choreo.CLIPS[x].result)) for (const angle of ["left", "right", "cut"]) {
    const cfg = Arrival.settings({ angle, [dir === "in" ? "enterCrew" : "leaveCrew"]: id }), end = Arrival.duration(cfg, dir);
    for (let t = 0; t <= end; t += 0.05) {
      const pose = (dir === "in" ? Arrival.pose : Arrival.poseOut)(t, cfg, true);
      assert.equal(pose.crew, id);
      const n = Choreo.sample(id, t, pose.side, out, t, true);
      for (let i = 0; i < n; i++) {
        const a = out[i];
        assert.ok(!inCar(a.x, a.z, pose), `${id} member ${i} inside the car at t=${t.toFixed(2)} (${angle}): ${a.x.toFixed(2)},${a.z.toFixed(2)} car ${pose.x.toFixed(2)},${pose.z.toFixed(2)}`);
        assert.ok(Math.abs(a.x) < 5.1 && a.z > -6.1 && a.z < 12, `${id} member ${i} inside the bay or apron at t=${t.toFixed(2)}`);
      }
    }
  }
});

// AFTER THE RACE result crews, played on the home sequence of their result.
const RESULT_CREWS = { celebrate: "win", applause: "podium", recover: "dnf", console: "finish" };
// Horizontal metres from an eye to a body standing at (x, z), the body a 0-1.8 m upright segment.
const eyeGap = (e, x, z) => Math.hypot(e[0] - x, e[2] - z, Math.max(0, e[1] - 1.8));
test("AFTER THE RACE crews: in-direction, result-timed, inside the bay, off the car and clear of every eye", () => {
  const { Arrival, Choreo, CLIPS } = load(), out = Choreo.actors(12);
  for (const [id, result] of Object.entries(RESULT_CREWS)) {
    const clip = CLIPS[id];
    assert.ok(clip && clip.dir === "in" && clip.result === result && clip.mix === false && clip.label, id);
    assert.ok(Choreo.IDS.in.includes(id), `${id} reads through the "in" path`);
    for (const angle of ["left", "right", "cut"]) {
      const cfg = Arrival.settings({ angle, homeCrew: id, result }), T = Arrival.timeline(cfg, "home"), end = Arrival.duration(cfg, "home");
      assert.ok(Math.abs(end - (T.base + clip.extra)) < 1e-9 && Math.abs(clip.len - end) < 2e-3, `${id}: the clip spans the home sequence (${clip.len} vs ${end})`);
      for (let t = 0; t <= end; t += 0.05) {
        const pose = Arrival.poseHome(t, cfg, true);
        assert.equal(pose.crew, id);
        const n = Choreo.sample(id, t, pose.side, out, t, true);
        for (let i = 0; i < n; i++) {
          const a = out[i], at = `${id} member ${i} t=${t.toFixed(2)} (${angle}) at ${a.x.toFixed(2)},${a.z.toFixed(2)}`;
          assert.ok(!inCar(a.x, a.z, pose), `${at}: inside the car ${pose.x.toFixed(2)},${pose.z.toFixed(2)}`);
          for (const [cam, e] of Object.entries(Arrival.CAMS)) assert.ok(eyeGap(e, a.x, a.z) >= 0.8, `${at}: ${eyeGap(e, a.x, a.z).toFixed(2)} m from the ${cam} eye`);
          // A pusher rides beside the car up the lane; everyone else, and a pusher once it is parked, stays in the bay.
          if (clip.actors[i].lin && t < T.park) assert.ok(Math.hypot(a.x - pose.x, a.z - pose.z) < 2.2, `${at}: a pusher stays on the car`);
          else assert.ok(Math.abs(a.x) < 5.1 && a.z > -6.1 && a.z < 6.3, `${at}: inside the bay`);
        }
      }
    }
  }
});

test("pit steps sit on PitLane.stopAnim's boundaries", () => {
  const { Pit } = load();
  assert.equal(Pit.phase(null).step, "none"); assert.equal(Pit.phase({ u: -1 }).step, "none");
  const at = (u) => Pit.phase({ u }).step;
  assert.deepEqual([0, 0.14, 0.15, 0.26, 0.27, 0.5, 0.67, 0.68, 0.79, 0.80, 0.87, 0.88, 1].map(at),
    ["jack", "jack", "off", "off", "swap", "swap", "swap", "on", "on", "check", "check", "drop", "drop"]);
  assert.equal(Pit.phase({ u: 0.5 }).t, 1.1); assert.equal(Pit.phase({ u: 2 }).t, 2.2, "clamped to the clip");
  // stopAnim's own boundaries, read from its source, so a retime there fails here.
  const src = read("js/race/pit-lane.js"), anim = src.slice(src.indexOf("function stopAnim"), src.indexOf("function reset(c)"));
  for (const n of ["0.15", "0.80", "0.12"]) assert.ok(anim.includes(n), `stopAnim still keys on ${n}`);
});

// The car-draw slide: wheels out 0.55 m from u .15 to .27, back .68 to .80 (pit-lane.js stopAnim).
const slide = (u) => { const e = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); return 0.55 * (u < 0.5 ? e((u - 0.15) / 0.12) : e((0.80 - u) / 0.12)); };
test("the tyre men's hands ride the wheel slide; gunners hold their guns; jacks pump while the car is up", () => {
  const { Choreo } = load(), out = Choreo.actors(12), len = Choreo.CLIPS.pit.len;
  for (let u = 0; u <= 0.84; u += 0.01) {
    Choreo.sample("pit", u * len, 1, out, u * len, true);
    for (let i = 2; i < 10; i++) {
      const a = out[i];
      if (a.prop === "gun") assert.ok(a.hold > 0.5, `gunner ${i} holds the gun at u=${u.toFixed(2)}`);
      else assert.ok(Math.abs(Math.abs(a.x) - (1.25 + slide(u))) < 0.08, `tyre man ${i} with the wheel at u=${u.toFixed(2)}: ${a.x.toFixed(3)} vs ${(1.25 + slide(u)).toFixed(3)}`);
    }
  }
  Choreo.sample("pit", 0.5 * len, 1, out, 0, true);
  for (const i of [0, 1]) assert.ok(out[i].handY < 0.7 && out[i].prop === "jack", `jack man ${i} holds the handle down`);
});

test("pit crew stays clear of the car and its sliding wheels", () => {
  const { Choreo } = load(), out = Choreo.actors(12), len = Choreo.CLIPS.pit.len;
  for (let u = 0; u <= 1; u += 0.01) {
    const n = Choreo.sample("pit", u * len, 1, out, 0, true);
    for (let i = 0; i < n; i++) {
      const a = out[i];
      if (i < 2) { assert.ok(Math.abs(a.z) > 3.6, `jack man ${i} ahead of / behind the car`); continue; }
      assert.ok(Math.abs(a.x) > 1.0 + slide(u) * 0.2 + 0.2, `member ${i} outside the wheel at u=${u.toFixed(2)}`);
    }
  }
});

function raceCtx(Pit, u, isPlayer = true) {
  const calls = { stopAnim: 0 };
  const c = { isPlayer, pitState: "box", pitT: 1.234, team: { color: [0.8, 0.1, 0.1], color2: [1, 1, 1] } };
  const G = { camEye: [0, 2, 10], pits: { stopAnim: () => { calls.stopAnim++; return { u, lift: u > 0.12 && u < 0.88 ? 0.22 : 0, off: 0 }; } } };
  return { c, G, calls };
}
test("PitCrewAnim draws the player's stop, deterministically, and leaves AI cars to the static mesh", () => {
  const { Pit, gfx, draws, meshes } = load();
  const base = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 4, 1]);
  const { c, G } = raceCtx(Pit, 0.5); G.gfx = gfx;
  const before = JSON.stringify(c);
  assert.equal(Pit.draw(G, c, base, {}), true);
  const first = draws.splice(0), built = meshes.length;
  assert.ok(first.length >= 100 && first.length <= 160, `draw calls for the stop: ${first.length}`);
  assert.equal(Pit.draw(G, c, base, {}), true);
  assert.deepEqual(draws.splice(0), first, "the same u draws the same crew");
  assert.equal(meshes.length, built, "no mesh is built after the first frame");
  assert.equal(JSON.stringify(c), before, "the car is not touched");
  // Placed in the car's basis: every part is translated by base's (3, 0, 4).
  const xs = first.map((d) => d.m[12]), zs = first.map((d) => d.m[14]);
  assert.ok(Math.min(...xs) > 3 - 3 && Math.max(...xs) < 3 + 3 && Math.min(...zs) > 4 - 5 && Math.max(...zs) < 4 + 5);
  assert.equal(Pit.draw(G, { ...c, isPlayer: false }, base, {}), false, "an AI car keeps the static crew");
  assert.equal(Pit.draw(G, { ...c, pitState: "out" }, base, {}), false, "nothing once released");
  assert.equal(Pit.draw({ ...G, camEye: [0, 0, 200] }, c, base, {}), false, "far: static mesh");
  assert.equal(Pit.draw({ ...G, pits: { stopAnim: () => ({ u: -1, lift: 0, off: 0 }) } }, c, base, {}), false);
});

test("PitCrewAnim frees the evicted rigs' meshes when a third team colour arrives (perf hunt 9)", () => {
  const { Pit, gfx } = load();
  let made = 0, freed = 0;
  const create = gfx.createMesh;
  gfx.createMesh = (d) => { made++; return create(d); };
  gfx.freeMesh = () => { freed++; };
  const base = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 4, 1]);
  const { c, G } = raceCtx(Pit, 0.5); G.gfx = gfx;
  const colour = (col) => ({ ...c, team: { color: col, color2: [1, 1, 1] } });
  assert.equal(Pit.draw(G, colour([0.8, 0.1, 0.1]), base, {}), true);
  const perRig = made;
  assert.ok(perRig > 0, "a rig builds meshes");
  Pit.draw(G, colour([0.1, 0.8, 0.1]), base, {});
  assert.equal(freed, 0, "two colours fit the cache");
  Pit.draw(G, colour([0.1, 0.1, 0.8]), base, {});
  assert.equal(made, perRig * 3, "three rigs built");
  assert.equal(freed, perRig * 2, "the third colour frees both evicted rigs' meshes");
});

test("without the garage modules the stop falls back to the static crew", () => {
  const ctx = vm.createContext({ Math, Object, Array, Number, Float32Array, Map });
  vm.runInContext(read("js/garage/pit-crew.js"), ctx, { filename: absSrc("js/garage/pit-crew.js") });
  const Pit = vm.runInContext("PitCrewAnim", ctx), { c, G } = raceCtx(Pit, 0.5);
  G.gfx = { createMesh() { throw new Error("no build"); }, draw() { throw new Error("no draw"); } };
  assert.equal(Pit.draw(G, c, new Float32Array(16), {}), false);
});

test("the garage draws a Blender crew without rebuilding meshes mid-playback", () => {
  const { Crew, Arrival, Choreo, CLIPS, draws, meshes } = load();
  for (const d of ["in", "out"]) for (const id of Choreo.IDS[d]) {
    const r = Choreo.CLIPS[id].result, dir = r ? "home" : d;   // a result clip plays after the race
    const cfg = Arrival.settings(r ? { homeCrew: id, result: r } : { [d === "in" ? "enterCrew" : "leaveCrew"]: id }), end = Arrival.duration(cfg, dir);
    const pose = (t) => Arrival.poseFor(dir)(t, cfg, false);
    draws.length = 0; Crew.draw({ c1: [1, 0, 0], c2: [1, 1, 1] }, [-3, 2, -4], pose(0.5), {});
    assert.ok(draws.length > 12 * CLIPS[id].actors.length, `${id}: every member drawn`);
    const n = meshes.length;
    for (let t = 0; t < end; t += 0.5) Crew.draw({ c1: [1, 0, 0], c2: [1, 1, 1] }, [-3, 2, -4], pose(t), {});
    assert.equal(meshes.length, n, `${id}: no mesh built during playback`);
  }
});

test("pit-lane.js and car-draw.js: the hook is a read-only delegate", () => {
  const draw = read("js/car/car-draw.js"), fn = draw.slice(draw.indexOf("function drawPitCrew"), draw.indexOf("function pitCrewDrawn"));
  assert.ok(/PitCrewAnim\.draw\(G, c, base,/.test(fn), "drawPitCrew asks PitCrewAnim first");
  assert.ok(fn.indexOf("PitCrewAnim") < fn.indexOf("getCrewMesh"), "...before the static mesh");
  const src = read("js/garage/pit-crew.js").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/\bc\.\w+\s*=[^=]|pitT\s*=[^=]|G\.\w+\s*=[^=]/.test(src), "PitCrewAnim writes nothing on the car or G");
});

test("AFTER-RACE CREW BY RESULT deals the Blender result clips; their extra seconds stretch the sequence", () => {
  const { Arrival, Choreo } = load();
  const home = (result) => Arrival.crewFor(Arrival.settings({ result }), "home");
  assert.deepEqual(["win", "podium", "points", "finish", "dnf"].map(home), ["celebrate", "applause", "current", "console", "recover"]);
  for (const id of ["celebrate", "applause", "console", "recover"]) assert.equal(Choreo.CLIPS[id].result !== undefined, true, id + " is a result clip");
  const bare = Arrival.settings({ result: "win", homeCrew: "none" });
  assert.ok(Math.abs(Arrival.duration(Arrival.settings({ result: "win" }), "home") - (Arrival.duration(bare, "home") + Choreo.extra("celebrate"))) < 1e-9);
});

test("Blender camera rigs keep clear of every result crew without snapping (crew-aware eye)", () => {
  const { Arrival, Choreo } = load(), out = Choreo.actors(12);
  for (const rig of Arrival.RIG_IDS) for (const [id, result] of Object.entries(RESULT_CREWS)) {
    const cfg = Arrival.settings({ angle: rig, homeCrew: id, result, sway: 0 }), end = Arrival.duration(cfg, "home");
    let prev = null;
    for (let t = 0; t <= end; t += 0.05) {
      const p = Arrival.poseHome(t, cfg, true), n = Choreo.sample(id, t, p.side, out, t, true);
      for (let i = 0; i < n; i++) assert.ok(eyeGap(p.eye, out[i].x, out[i].z) >= 0.8, `${rig} × ${id} t=${t.toFixed(2)}: ${eyeGap(p.eye, out[i].x, out[i].z).toFixed(2)} m from member ${i}`);
      // No teleport: a CELEBRATION member sprints ~6 m/s through the DOLLY's eye, and the
      // eye rises 1.3 m over them in ~0.4 s (0.43 m per 50 ms, measured); a sideways push
      // and a square-root lift both snapped 1.1-1.5 m in one step before this bound held.
      if (prev) assert.ok(Math.hypot(p.eye[0] - prev[0], p.eye[1] - prev[1], p.eye[2] - prev[2]) < 0.5, `${rig} × ${id} t=${t.toFixed(2)}: no snap`);
      prev = p.eye.slice();
    }
  }
});

// LAZY: the key tables ride js/garage/garage-data.js (LAZY_RACE); the index stays in crew-choreo.js.
test("lazy key tables: the index lists every clip at boot, and until the tables land the shipped crews play", () => {
  const { Choreo, Arrival, Pit } = load({}, FILES.filter((f) => f !== "js/garage/garage-data.js"));
  assert.deepEqual([...Choreo.IDS.in, ...Choreo.IDS.out, ...Choreo.IDS.pit].sort(), Object.keys(Choreo.CLIPS).sort(), "every clip is pickable");
  assert.equal(Choreo.label("marshal"), "MARSHAL CREW");
  assert.equal(Choreo.has("marshal"), false); assert.equal(Choreo.extra("marshal"), 0); assert.equal(Choreo.sample("marshal", 1), 0);
  for (const dir of ["in", "out"]) {
    const key = dir === "out" ? "leaveCrew" : "enterCrew";
    for (const id of Choreo.IDS[dir].filter((x) => !Choreo.CLIPS[x].result)) {   // result crews are AFTER THE RACE's
      const c = Arrival.settings({ [key]: id });
      assert.equal(c[key], id, "a saved Blender crew survives boot");
      assert.equal(Arrival.poseFor(dir)(1, c, false).crew, "current", id + " plays the shipped crew until the tables land");
      assert.equal(Arrival.duration(c, dir), Arrival.duration(Arrival.settings({ [key]: "current" }), dir), id + " keeps the shipped timing");
    }
  }
  assert.notEqual(Arrival.poseFor("home")(1, Arrival.settings({ result: "win" }), false).crew, "celebrate", "a result crew waits for its tables");
  const G = { gfx: {}, pits: { stopAnim: () => ({ u: 0.5 }) } };
  assert.equal(Pit.draw(G, { isPlayer: true, pitState: "box" }, new Float32Array(16)), false, "the in-race stop keeps the static crew mesh");
  const index = JSON.parse(read("js/garage/crew-choreo.js").split("// @blender-choreo-index:start")[1].split("const CLIPS = ")[1].split(";\n")[0]);
  const data = load().Choreo, full = JSON.parse(read("js/garage/garage-data.js").split("// @blender-choreo:start")[1].split("const CLIPS = ")[1].split(";\n")[0]);
  assert.deepEqual(index, Object.fromEntries(Object.entries(full).map(([id, c]) => { const { actors, ...rest } = c; return [id, rest]; })), "rerun crew-choreo.py --write-runtime");
  assert.ok(data.has("marshal"));
});

// The lazy tables can land mid-sequence: a held t on the SAME config keeps its camera family and crew;
// the next playback's fresh config adopts what has landed (PR #4310 review, 2026-10-31).
test("a late GarageData load never swaps a playing sequence's camera or crew; the next playback adopts it", () => {
  // V8 shares compiled code across vm contexts by source text, and code compiled where GarageData was
  // already a script const keeps reading that slot; a browser has one realm. A unique source suffix gives
  // this fixture its own compile, the same as a page where garage-data.js lands after arrival.js.
  const ctx = vm.createContext({ Math, Object, Array, Number, Float32Array, WeakMap, Map, String, Log: { info() {}, warn() {} } });
  for (const f of FILES.filter((x) => x !== "js/garage/garage-data.js"))
    vm.runInContext(read(f) + (f === "js/garage/arrival.js" ? "\n// late-load fixture\n" : ""), ctx, { filename: absSrc(f) });
  const Arrival = vm.runInContext("GarageArrival", ctx, { filename: "garage-crew-choreo:get" });
  const cases = [["in", { angle: "crane", enterCrew: "marshal" }, 6], ["out", { angle: "crane", leaveCrew: "sendoff" }, 4],
    ["home", { angle: "crane", result: "dnf" }, 6]];
  const held = cases.map(([dir, v, t]) => { const c = Arrival.settings(v); return [dir, c, t, Arrival.poseFor(dir)(t, c, true)]; });
  vm.runInContext(read("js/garage/garage-data.js"), ctx, { filename: absSrc("js/garage/garage-data.js") });
  for (const [dir, c, t, before] of held) {
    const after = Arrival.poseFor(dir)(t, c, true);
    assert.deepEqual([after.camera, after.crew, after.eye, after.x, after.yaw], [before.camera, before.crew, before.eye, before.x, before.yaw], dir + ": the held frame is unchanged");
    assert.notEqual(before.camera, "crane", dir + ": before the tables, the shipped cameras");
    const fc = Arrival.settings(cases.find((k) => k[0] === dir)[1]);
    const fresh = Arrival.poseFor(dir)(t, fc, true);
    assert.equal(fresh.camera, "crane", dir + ": the next playback plays the rig");
  }
});

// carryPlayback: a preview refresh (FOV / speed edit) builds a fresh config; it keeps the playback's
// camera family, crew deal, path and timing, while an angle or crew edit may choose again.
test("carryPlayback keeps a refreshed preview's family, MIX deal and timing; angle and crew edits re-choose", () => {
  const { Arrival } = load();
  const a = Arrival.settings({ angle: "crane", leaveCrew: "mix" });
  const crew = Arrival.crewFor(a, "out"), len = Arrival.duration(a, "out"), held = Arrival.poseFor("out")(4, a, true);
  const b = Arrival.carryPlayback(a, Arrival.settings({ angle: "crane", leaveCrew: "mix", fov: 70, speed: 2 }));
  assert.equal(Arrival.crewFor(b, "out"), crew, "the MIX deal is not re-rolled");
  assert.equal(Arrival.duration(b, "out"), len, "nor the timing");
  const now = Arrival.poseFor("out")(4, b, true);
  assert.deepEqual([now.camera, now.crew, now.x, now.z, now.yaw], [held.camera, held.crew, held.x, held.z, held.yaw], "same family, crew and path");
  assert.equal(now.fov !== held.fov, true, "the lens edit itself applies");
  const c = Arrival.carryPlayback(a, Arrival.settings({ angle: "orbit", leaveCrew: "mix" }));
  assert.equal(Arrival.poseFor("out")(4, c, true).camera, "orbit", "an angle edit picks its own family");
  const d = Arrival.carryPlayback(a, Arrival.settings({ angle: "crane", leaveCrew: "pushout" }));
  assert.equal(Arrival.crewFor(d, "out"), "pushout", "an explicit crew edit re-chooses");
  assert.equal(Arrival.carryPlayback(a, null), null);
});
