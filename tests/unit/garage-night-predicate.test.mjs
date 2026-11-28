/* GARAGE NIGHT PREDICATE (Gardener plan #6885 item 1, PR A): the two BROAD
 * "is this garage session night?" spellings — setup-camera.js exteriorPick and
 * exterior.js snapshot's fallback — count night, dusk and dawn, plus the default
 * hour on a night-authored circuit. This pins that truth table so the carve onto
 * one helper changes no answer. The three NARROW spellings (night only) are a
 * recorded disagreement for Bryce's call, not pinned here. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { withM4 } from "../helpers/mat4-vm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const TODS = ["night", "dusk", "dawn", "day", "default"];
const DEFS = [null, { id: "a" }, { id: "a", night: false }, { id: "a", night: true }];
const expected = (tod, def) => tod === "night" || tod === "dusk" || tod === "dawn" || (tod === "default" && !!(def && def.night));

function context() {
  const ctx = vm.createContext({ Math, Object, Array, Number, String, JSON, Promise, setTimeout, Date, performance: { now: () => 0 } });
  withM4(ctx);
  for (const f of ["js/garage/experience.js", "js/garage/exterior.js"]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  return ctx;
}

test("setup-camera exteriorPick: night counts night, dusk, dawn and a night circuit's default hour", () => {
  const src = read("js/garage/setup-camera.js");
  const body = src.slice(src.indexOf("function exteriorPick("), src.indexOf("function prepareExterior("));
  const line = body.match(/const night = ([^\n]+);\n/);
  assert.ok(line, "exteriorPick derives `night` in one statement");
  const ctx = context();
  const fn = vm.runInContext(`(tod, t) => ${line[1]}`, ctx, { filename: absSrc("js/garage/setup-camera.js") });
  for (const tod of TODS) for (const def of DEFS)
    assert.equal(fn(tod, def), expected(tod, def), `exteriorPick night for tod=${tod} def=${JSON.stringify(def)}`);
});

test("exterior snapshot: a selection without `night` takes the broad answer; an explicit one wins", async () => {
  const ctx = context();
  const mesh = () => ({ pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [], col: [], idx: [0, 1, 2] });
  ctx.GarageExteriorGeometry = { *buildSteps(def) { yield; return { ground: mesh(), road: mesh(), props: mesh(), stats: { trackId: def.id }, anchor: { s: 0 } }; } };
  const API = vm.runInContext("GarageExterior", ctx);
  const gfx = { createMesh: () => ({}), freeMesh() {}, draw() {} };
  for (const tod of TODS) for (const night of [true, false]) {
    const ext = API.create({ gfx, load: async (s) => ({ id: s.trackId, night }), yieldTask: () => Promise.resolve() });
    const def = { id: "a", night };
    assert.equal(await ext.request({ trackId: "a", teamId: "t", weather: "dry", tod, def }), true);
    const want = expected(tod, def);
    assert.equal(ext.ready({ trackId: "a", teamId: "t", weather: "dry", tod, night: want }), true, `tod=${tod} night circuit=${night} → ${want}`);
    assert.equal(ext.ready({ trackId: "a", teamId: "t", weather: "dry", tod, night: !want }), false, `tod=${tod} night circuit=${night} ≠ ${!want}`);
    ext.cancel();
  }
});

// #7443 / #6885 1B (Bryce's pick, 2026-11-28 ~03:12Z): the way-home note and the bay's
// own hour were NARROW (night only); they now take the broad answer exteriorPick takes,
// so dusk and dawn light the bay as night. A deliberate change: red on the base by design.
test("setup-camera noteResult and the bay hour count dusk and dawn as night, like exteriorPick", () => {
  const src = read("js/garage/setup-camera.js");
  const sites = [
    ["noteResult", src.slice(src.indexOf("function noteResult("), src.indexOf("function startHome(")), /night = (GarageExperience\.isNight\(G\.raceTimeOfDay, t\));/],
    ["bay hour", src, /ctx\.night = h \? home\.mode === "night"\n\s*: (GarageExperience\.isNight\(G\.raceTimeOfDay, t\));/],
  ];
  const ctx = context();
  for (const [name, body, re] of sites) {
    const m = body.match(re);
    assert.ok(m, `${name} derives night through GarageExperience.isNight`);
    const fn = vm.runInContext(`(G, t) => ${m[1]}`, ctx, { filename: absSrc("js/garage/setup-camera.js") });
    for (const tod of TODS) for (const def of DEFS)
      assert.equal(fn({ raceTimeOfDay: tod }, def), expected(tod, def), `${name} night for tod=${tod} def=${JSON.stringify(def)}`);
  }
});

test("no hand-rolled night spelling is left in js/garage/", () => {
  const dir = path.join(ROOT, "js/garage");
  let n = 0;
  for (const f of fs.readdirSync(dir, { recursive: true })) if (String(f).endsWith(".js"))
    n += (fs.readFileSync(path.join(dir, String(f)), "utf8").match(/raceTimeOfDay === "night"/g) || []).length;
  assert.equal(n, 0, 'raceTimeOfDay === "night" occurs 0 times in js/garage/ (use GarageExperience.isNight or M4.isNight)');
});
