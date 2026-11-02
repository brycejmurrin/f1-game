/* THE BLENDER LIGHT CUES (GarageScene.CUES / cueSample, js/garage/scene.js) and
 * the lighting moods they ride on (GarageScene.MOODS):
 *  - the runtime key tables are the current Blender source's export;
 *  - every cue sample is finite and bounded, deterministic, and loops cleanly;
 *  - PHOTO FLASHES pops are brief and irregular, the AMBER BEACON turns,
 *    LIGHTS UP switches the banks on in order and ends at the identity;
 *  - SPOTLIGHT sweeps a white follow-spot record that exists only while lit;
 *  - GarageScene.live() with no ctx.cue is the rig it was before cues existed,
 *    bit for bit, and a cue never leaks into the cached rig;
 *  - the podium / rain / neon moods are real MOODS entries.
 *
 * Run: node --test tests/unit/garage-light-cues.test.mjs   (npm run test:tooling-fast)
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
const SCENE = ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
  "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js"];
function load() {
  const ctx = vm.createContext({ console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array,
    Uint32Array, isFinite, parseFloat, parseInt, Date, Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false } });
  for (const f of SCENE) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Scene = vm.runInContext("GarageScene", ctx, { filename: "garage-light-cues:get" });
  Scene.init({ createMesh: () => ({}), createTexMesh: () => ({}), freeMesh() {}, freeTexture() {},
    createTexture: () => ({}), draw() {}, drawDecal() {}, drawGlow() {} });
  // The cue API under short names for the tests below.
  const Cues = { IDS: Scene.CUES, label: Scene.cueLabel, len: Scene.cueLen, sample: Scene.cueSample, gains: () => Scene.cueSample("", 0) };
  return { Scene, Cues };
}
const LOOPS = ["flashes", "beacon", "pulse"];
const LIV = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06], accent: [0.1, 0.7, 0.9] };

test("runtime key tables match the current Blender authoring source", () => {
  const digest = createHash("sha256").update(read("tools/gen/blender/garage-light-cues.py")).digest("hex");
  assert.equal(load().Scene.CUE_SHA256, digest,
    "regenerate: <python with bpy> tools/gen/blender/garage-light-cues.py -- --output-dir artifacts/light-cues --write-runtime");
});

test("six labelled cues, finite bounded samples everywhere", () => {
  const { Cues } = load();
  assert.deepEqual(Array.from(Cues.IDS), ["lightsup", "flashes", "beacon", "pulse", "lightsout", "spotsweep"]);
  const g = Cues.gains();
  for (const id of Cues.IDS) {
    assert.ok(Cues.label(id) && Cues.len(id) > 0, id);
    for (let t = -1; t <= Cues.len(id) + 2; t += 1 / 120) {
      Cues.sample(id, t, g);
      for (const k of ["key", "fill", "wash", "up", "gantry"]) assert.ok(Number.isFinite(g[k]) && g[k] >= 0 && g[k] <= 4, `${id}.${k} @${t}`);
      assert.ok(g.flash >= 0 && g.flash <= 1, `${id}.flash @${t}`);
      if (g.tint) for (const v of g.tint) assert.ok(v >= 0 && v <= 2, `${id}.tint @${t}`);
      if (g.beacon) assert.ok(Number.isFinite(g.beacon.angle) && g.beacon.gain > 0 && g.beacon.gain <= 1, `${id}.beacon @${t}`);
      assert.ok(g.spot >= 0 && g.spot <= 1 && Number.isFinite(g.spotx), `${id}.spot @${t}`);
      if (id !== "spotsweep") assert.ok(g.spot === 0 && g.spotx === 0, `${id} has no spot @${t}`);
    }
  }
  const id0 = Cues.sample("no-such-cue", 1, g);
  assert.deepEqual([id0.key, id0.fill, id0.wash, id0.up, id0.gantry, id0.tint, id0.flash, id0.beacon, id0.spot, id0.spotx], [1, 1, 1, 1, 1, null, 0, null, 0, 0]);
});

test("deterministic: the same (id, t) always samples the same lights; loops wrap by len", () => {
  const { Cues } = load();
  const snap = (id, t) => JSON.stringify(Cues.sample(id, t, Cues.gains()), (k, v) => (typeof v === "number" ? +v.toFixed(9) : v));
  for (const id of Cues.IDS) for (const t of [0, 0.37, 1.234, 2.9]) {
    assert.equal(snap(id, t), snap(id, t), `${id} @${t}`);
    if (LOOPS.includes(id)) assert.equal(snap(id, t + Cues.len(id)), snap(id, t), `${id} loops`);
  }
});

test("PHOTO FLASHES: brief irregular pops, dark between", () => {
  const { Cues } = load(), g = Cues.gains(), dt = 1 / 240, len = Cues.len("flashes");
  const pops = []; let on = -1;
  for (let t = 0; t < len; t += dt) {
    const lit = Cues.sample("flashes", t, g).flash > 0.05;
    if (lit && on < 0) on = t;
    if (!lit && on >= 0) { pops.push([on, t - on]); on = -1; }
  }
  assert.ok(pops.length >= 8, `pops: ${pops.length}`);
  for (const [, w] of pops) assert.ok(w < 0.15, `a pop lasts ${w.toFixed(3)} s`);
  const gaps = pops.slice(1).map((p, i) => +(p[0] - pops[i][0]).toFixed(2));
  assert.ok(new Set(gaps).size >= 4, "irregular spacing: " + gaps);
  assert.ok(pops.reduce((a, [, w]) => a + w, 0) / len < 0.3, "mostly dark");
});

test("AMBER BEACON: one full turn per loop at a constant rate, always lit", () => {
  const { Cues } = load(), g = Cues.gains(), len = Cues.len("beacon");
  let prev = Cues.sample("beacon", 0, g).beacon.angle;
  for (let t = 0.05; t < len - 1e-6; t += 0.05) {
    const b = Cues.sample("beacon", t, g).beacon;
    assert.ok(b && b.gain > 0.5, "lit");
    assert.ok(Math.abs(b.angle - prev - 2 * Math.PI * 0.05 / len) < 1e-3, `constant rate @${t}`);
    prev = b.angle;
  }
  assert.ok(Math.abs(Cues.sample("beacon", len - 1e-6, g).beacon.angle - 2 * Math.PI) < 1e-3, "a full turn");
});

test("LIGHTS UP: wash, then fill, then key switch on; ends at the identity", () => {
  const { Cues } = load(), g = Cues.gains();
  const on = (k) => { for (let t = 0; t < 3; t += 1 / 240) if (Cues.sample("lightsup", t, g)[k] > 0.9) return t; return 99; };
  assert.ok(on("wash") < on("fill") && on("fill") < on("key"), `${on("wash")} ${on("fill")} ${on("key")}`);
  assert.ok(Cues.sample("lightsup", 0.1, g).key < 0.1, "dark before the shutter");
  const end = Cues.sample("lightsup", 10, g);
  assert.deepEqual([end.key, end.fill, end.wash, end.up, end.tint, end.flash, end.beacon], [1, 1, 1, 1, null, 0, null]);
  const lo = Cues.sample("lightsout", 10, g);
  assert.deepEqual([lo.key, lo.fill, lo.wash, lo.up, lo.tint], [1, 1, 1, 1, null], "LIGHTS OUT also ends at the identity");
});

test("live() with no ctx.cue is the cue-free rig, bit for bit, and a cue never leaks into it", () => {
  const withCues = load(), without = load();
  const ctxs = [{ night: false, ambient: false }, { night: true, ambient: false, door: 0.4, swell: 1 }, { night: false, ambient: true }];
  for (const S of [withCues.Scene, without.Scene]) S.mood("shipped");
  const base = ctxs.map((c) => Array.from(without.Scene.live(LIV, 1234, { ...c })));
  ctxs.forEach((c, i) => assert.deepEqual(Array.from(withCues.Scene.live(LIV, 1234, { ...c })), base[i], `ctx ${i}: no cue`));
  ctxs.forEach((c, i) => assert.deepEqual(Array.from(withCues.Scene.live(LIV, 1234, { ...c, cue: null })), base[i], `ctx ${i}: cue null`));
  ctxs.forEach((c, i) => assert.deepEqual(Array.from(withCues.Scene.live(LIV, 1234, { ...c, cue: { id: "nope", t: 1 } })), base[i], `ctx ${i}: unknown cue`));
  // Run every cue, then drop it: the next frame is the base again.
  for (const id of withCues.Cues.IDS) for (const t of [0.2, 1.3, 5.1]) withCues.Scene.live(LIV, 1234, { ...ctxs[1], cue: { id, t } });
  ctxs.forEach((c, i) => assert.deepEqual(Array.from(withCues.Scene.live(LIV, 1234, { ...c })), base[i], `ctx ${i}: after cues`));
});

test("cues change the emitted rig: a strobe pop adds a white record, the beacon an amber one, lights-up starts dark", () => {
  const { Scene } = load();
  Scene.mood("shipped");
  const ctx = (cue) => ({ night: false, ambient: false, cue });
  const energy = (rig) => { let e = 0; for (let i = 0; i + 14 < rig.length; i += 15) e += rig[i + 3] + rig[i + 4] + rig[i + 5]; return e; };
  const base = Array.from(Scene.live(LIV, 0, ctx(null)));
  const pop = Array.from(Scene.live(LIV, 0, ctx({ id: "flashes", t: 0.2 })));
  assert.equal(pop.length, base.length + 15, "one strobe record");
  const s = pop.slice(-15);
  assert.ok(s[3] > 1 && Math.abs(s[3] - s[4]) < 1e-9, "white strobe");
  const dark = Array.from(Scene.live(LIV, 0, ctx({ id: "flashes", t: 0.4 })));
  assert.equal(dark.length, base.length, "no strobe between pops");
  const bea = Array.from(Scene.live(LIV, 0, ctx({ id: "beacon", t: 0.3 }))), b = bea.slice(-15);
  assert.equal(bea.length, base.length + 15, "one beacon record");
  assert.ok(b[3] > b[4] && b[4] > b[5] * 4, "amber");
  const b2 = Array.from(Scene.live(LIV, 0, ctx({ id: "beacon", t: 0.6 }))).slice(-15);
  assert.ok(Math.hypot(b2[7] - b[7], b2[9] - b[9]) > 0.5, "the beam turns");
  for (const [k, v] of b.entries()) assert.ok(Number.isFinite(v), `beacon field ${k}`);
  assert.ok(energy(Array.from(Scene.live(LIV, 0, ctx({ id: "lightsup", t: 0.1 })))) < 0.4 * energy(base), "lights-up starts dark");
  assert.ok(Math.abs(energy(Array.from(Scene.live(LIV, 0, ctx({ id: "lightsup", t: 9 })))) - energy(base)) < 1e-9, "and ends at the mood");
});

test("podium, rain and neon are MOODS entries over MOOD_DEF keys, each its own look", () => {
  const { Scene } = load();
  const def = Scene.moodDef();
  for (const id of ["podium", "rain", "neon"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(Scene.MOODS, id), id);
    for (const k of Object.keys(Scene.MOODS[id])) assert.ok(k in def, `${id}.${k} is a MOOD_DEF key`);
    assert.equal(Scene.mood(id), id);
  }
  Scene.mood("shipped");
});

test("SPOTLIGHT: one-shot; the spot is dark at t=0, bright mid-cue, sweeps, then settles straight down on the car", () => {
  const { Cues } = load(), g = Cues.gains(), len = Cues.len("spotsweep");
  assert.equal(Cues.label("spotsweep"), "SPOTLIGHT");
  assert.ok(len >= 3.5 && len <= 4.5, `len ${len}`);
  assert.equal(Cues.sample("spotsweep", 0, g).spot, 0, "dark at t=0");
  assert.ok(Cues.sample("spotsweep", len / 2, g).spot > 0.5, "lit mid-cue");
  assert.ok(Cues.sample("spotsweep", len / 2, g).key <= 0.3, "the room dims under the sweep");
  const xs = []; for (let t = 0; t <= len; t += 0.05) xs.push(Cues.sample("spotsweep", t, g).spotx);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 3, "the spot sweeps across the bay");
  const end = Cues.sample("spotsweep", len + 5, g);   // one-shot: holds the reveal, not looped
  assert.ok(end.spot > 0.5 && end.spotx === 0 && end._beacon.angle === 0 && end.beacon === null, "settled on the car");
  assert.ok(end.key >= 0.5 && end.key <= 0.7, `room back to ~0.6: ${end.key}`);
  assert.notEqual(JSON.stringify(Cues.sample("spotsweep", 0.3, Cues.gains())), JSON.stringify(Cues.sample("spotsweep", 0.3 + len, Cues.gains())), "one-shot, no loop");
});

test("SPOTLIGHT adds one white record only while the spot is lit; no other cue ever adds it", () => {
  const { Scene, Cues } = load();
  Scene.mood("shipped");
  const ctx = (cue) => ({ night: false, ambient: false, cue });
  const base = Array.from(Scene.live(LIV, 0, ctx(null)));
  assert.equal(Scene.live(LIV, 0, ctx({ id: "spotsweep", t: 0 })).length, base.length, "no spot record at t=0");
  const mid = Array.from(Scene.live(LIV, 0, ctx({ id: "spotsweep", t: 1.0 })));
  assert.equal(mid.length, base.length + 15, "one spot record");
  const s = mid.slice(-15);
  for (const [k, v] of s.entries()) assert.ok(Number.isFinite(v), `spot field ${k}`);
  assert.ok(s[1] > 4 && Math.abs(s[3] - s[4]) < 1e-9 && s[5] < s[3] && s[5] > 0.9 * s[3], "a neutral-white beam from the ceiling");
  assert.ok(s[3] < 34 * 0.55, "dimmer than the press strobe");
  assert.ok(s[10] > s[11] && s[11] >= 0.85, "a narrow cone");
  const end = Array.from(Scene.live(LIV, 0, ctx({ id: "spotsweep", t: 9 }))).slice(-15);
  assert.ok(Math.abs(end[0]) < 1e-9 && Math.abs(end[2]) < 1e-9 && end[8] < -0.999, "aimed straight down at the car");
  const g = Cues.gains();
  for (const id of Cues.IDS) if (id !== "spotsweep") for (let t = 0; t < Cues.len(id); t += 0.05) {
    const rig = Array.from(Scene.live(LIV, 0, ctx({ id, t })));
    const extra = (Cues.sample(id, t, g).flash > 0 ? 1 : 0) + (Cues.sample(id, t, g).beacon ? 1 : 0);
    assert.equal(rig.length, base.length + 15 * extra, `${id} @${t}: no spot record`);
  }
});
