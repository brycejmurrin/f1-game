/* event-journal.test.mjs — per-race event log (js/race/event-journal.js).
 * Run: node --test tests/unit/event-journal.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LAP = 5000;

function car(code, prog, speed, extra = {}) {
  return { code, name: code, prog, speed, lap: 1, lastLap: 0, best: Infinity, retired: false, finished: false,
    pitState: "none", pitStops: 0, errCount: 0, penalty: 0, wheelLock: 0, hitSev: 0, offroad: false, ...extra };
}

function loadRaceStack() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, Map, Set, String, RegExp,
    Float64Array, Int32Array, isFinite });
  seedLog(ctx);
  ctx.window = ctx;
  ctx.CamModes = { CAM_MODES: [{ id: "chase" }] };
  for (const f of ["js/audio/radio-voice.js", "js/race/radio-lines.js", "js/race/race-facts.js",
    "js/race/event-journal.js", "js/race/race-radio.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  const get = (n) => vm.runInContext(n, ctx);
  return { G: null, RF: get("RaceFacts"), RR: get("RaceRadio"), EJ: get("EventJournal") };
}

function raceHarness(cars, player) {
  const { RF, RR, EJ } = loadRaceStack();
  const G = {
    state: "race", raceT: 0, cars, player, lapsTarget: 3, timeTrial: false, practice: false,
    track: { total: LAP }, cautionLevel: () => G._caution || 0, cautionInfo: () => ({ level: G._caution || 0 }),
    announce() { return true; }, announceBusy: false, paused: false, hudProfile: "race",
    store: null, player,
  };
  const journal = EJ.create(G);
  const radio = RR.create(G, { onEvents: (ev, f) => journal.onFacts(ev, f) });
  const step = (dt) => {
    G.raceT += dt;
    for (const c of G.cars) c.prog += (c.speed || 0) * dt;
    radio.update(dt);
    journal.update(dt);
  };
  return { G, journal, step };
}

test("capacity is 256 events", () => {
  const { EJ } = loadRaceStack();
  const G = { state: "race", raceT: 0, cars: [car("A", 0, 0), car("B", 10, 0)], track: { total: LAP },
    cautionLevel: () => 0, timeTrial: false, practice: false };
  const j = EJ.create(G);
  assert.equal(j.CAP, 256);
  assert.equal(EJ.CAP, 256);
  for (let i = 0; i < 300; i++) j.onFacts([{ type: "caution", level: 1, prev: 0 }], { t: i * 0.1, pos: 1 });
  assert.equal(j.count(), 256);
  const ts = j.events().map((e) => e.t);
  assert.equal(ts[0], 44 * 0.1, "the 44 oldest rows were evicted first");
  assert.equal(ts.at(-1), 299 * 0.1, "the newest row is kept");
});

test("short race records pass, retire, fastest and caution", () => {
  const { RF, EJ } = loadRaceStack();
  const a = car("AAA", 1090, 0), b = car("BBB", 1088, 0), p = car("PLY", 500, 0, { isPlayer: true });
  const G = { state: "race", raceT: 5, cars: [a, b, p], player: p, track: { total: LAP }, lapsTarget: 3,
    cautionLevel: () => G._caution || 0, cautionInfo: () => ({ level: G._caution || 0 }),
    timeTrial: false, practice: false };
  const facts = RF.create();
  const journal = EJ.create(G);
  const tick = (dt) => {
    G.raceT += dt;
    const { f, ev } = facts.observe(G, dt);
    journal.onFacts(ev, f);
    journal.update(dt);
  };
  for (let i = 0; i < 4; i++) tick(0.25);
  G._caution = 3;
  tick(0.25);
  b.prog = 1092;
  for (let i = 0; i < 3; i++) tick(0.25);
  tick(0.25);
  b.lastLap = 92.1;
  tick(0.05);
  a.retired = true;
  a.dnf = "mechanical";
  for (let i = 0; i < 6; i++) tick(0.25);
  const kinds = new Set(journal.events().map((e) => e.kind));
  assert.ok(kinds.has("pass"), "expected a held pass");
  assert.ok(kinds.has("retire"), "expected retirement edge");
  assert.ok(kinds.has("fastest"), "expected fastest-lap edge");
  assert.ok(kinds.has("caution"), "expected caution edge");
  const by = (k) => journal.events().find((e) => e.kind === k);
  const pass = by("pass");
  assert.equal(pass.car.code, "BBB", "the passer");
  assert.equal(pass.meta.b.code, "AAA", "the car passed");
  assert.equal(pass.pos, 1);
  assert.equal(pass.gain, 1);
  assert.equal(pass.sev, 0);
  const caution = by("caution");
  assert.equal(caution.car, null);
  assert.equal(caution.sev, 3, "the caution row carries its level");
  assert.equal(caution.meta.prev, 0);
  const fastest = by("fastest");
  assert.equal(fastest.car.code, "BBB");
  assert.equal(fastest.meta.time, 92.1);
  const retire = by("retire");
  assert.equal(retire.car.code, "AAA");
  assert.equal(retire.meta.why, "mechanical");
  const ev = journal.events();
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, "events are in time order");
});

test("edge detectors log penalty, wheelLock, contact and pile-up without writing cars", () => {
  const a = car("AAA", 100, 50);
  const b = car("BBB", 90, 50);
  const { journal, step } = raceHarness([a, b], a);
  b.penalty = 5;
  b.wheelLock = 0.9;
  b.hitSev = 0.7;
  a._incidentOwned = true;
  b._incidentOwned = true;
  step(0.1);
  assert.equal(b.penalty, 5);
  assert.equal(b.wheelLock, 0.9);
  assert.equal(b.hitSev, 0.7);
  const kinds = journal.events().map((e) => e.kind);
  assert.ok(kinds.includes("penalty"));
  assert.ok(kinds.includes("wheelLock"));
  assert.ok(kinds.includes("contact"));
  assert.ok(kinds.includes("pileUp"));
});

test("race-radio forwards RaceFacts batches through onEvents", () => {
  const { RF, RR, EJ } = loadRaceStack();
  const seen = [];
  const G = { state: "race", raceT: 1, cars: [car("A", 0, 0), car("B", 1, 0)], player: null, track: { total: LAP },
    cautionLevel: () => 0, announce() { return true; }, announceBusy: false, paused: false, timeTrial: false, practice: false };
  const journal = EJ.create(G);
  const radio = RR.create(G, { onEvents: (ev, f) => { seen.push(ev.length); journal.onFacts(ev, f); } });
  const facts = RF.create();
  G.cars = [car("A", 0, 0), car("B", 1, 0)];
  G.player = G.cars[0];
  G.raceT = 5;
  for (let i = 0; i < 5; i++) {
    G.raceT += 0.2;
    facts.observe(G, 0.2);
    radio.update(0.2);
  }
  assert.ok(seen.some((n) => n > 0), "onEvents should receive non-empty batches");
});
