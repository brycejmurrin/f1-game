/* damage — the DISPLAY-ONLY damage readout (js/race/damage.js) and its HUD
 * chip (js/ui/hud-damage.js): impact → part mapping, severity accumulation and
 * clamp, the debounce, barrier strikes, repair on a new race / completed stop,
 * and the contract that NOTHING in physics, AI or race control reads it. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const SRC = read("js/race/damage.js");
const HUD_SRC = read("js/ui/hud-damage.js");

function load() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(SRC + "\n" + HUD_SRC + "; this.Damage = Damage; this.HudDamage = HudDamage;", ctx);
  return ctx;
}
const car = (o) => Object.assign({ prog: 100, s: 100, x: 0, yawVis: 0, speed: 0, wasOnWall: false, pitOutT: 0 }, o);

test("zoneOf: nose / tail / flank against the car's box", () => {
  const { Damage: D } = load();
  assert.equal(D.zoneOf(4, 0.3), D.ZONE_FRONT);
  assert.equal(D.zoneOf(-4, -0.3), D.ZONE_REAR);
  assert.equal(D.zoneOf(1, 2), D.ZONE_SIDE);
  assert.equal(D.zoneOf(0.5, -1.9), D.ZONE_SIDE);
});

test("apply: front-left hits the left wing half, rear hits the rear wing, side the floor", () => {
  const { Damage: D } = load();
  const f = D.apply(D.blank(), 3, -0.5, 0.5);
  assert.ok(f.fwL > f.fwR && f.fwR > 0, "near half takes most of it");
  assert.equal(f.rw, 0);
  assert.equal(f.knock, 0, "0.5 is under the knock threshold");
  const fr = D.apply(D.blank(), 3, 0.5, 0.5);
  assert.ok(fr.fwR > fr.fwL);
  const r = D.apply(D.blank(), -3, 0.2, 0.6);
  assert.ok(r.rw > 0 && r.floor > 0);
  assert.equal(r.fwL + r.fwR, 0);
  assert.equal(r.knock, 0, "a rear hit never knocks the suspension");
  const s = D.apply(D.blank(), 0.5, 2, 0.6);
  assert.ok(s.floor > s.fwR && s.fwR > 0 && s.fwL === 0);
  assert.equal(s.knock, 1, "a hard side hit knocks");
});

test("severity accumulates and clamps at 1; a zero/NaN hit is ignored", () => {
  const { Damage: D } = load();
  const r = D.blank();
  D.apply(r, 3, -0.5, 0.4);
  const one = r.fwL;
  D.apply(r, 3, -0.5, 0.4);
  assert.ok(Math.abs(r.fwL - 2 * one) < 1e-12);
  for (let i = 0; i < 20; i++) D.apply(r, 3, -0.5, 5);
  assert.equal(r.fwL, 1);
  for (const k of ["fwL", "fwR", "rw", "floor"]) assert.ok(r[k] >= 0 && r[k] <= 1, k);
  const h = r.hits;
  D.apply(r, 3, 0, 0); D.apply(r, 3, 0, NaN);
  assert.equal(r.hits, h);
});

test("contact: both cars booked from their own frame, debounced until observe() decays it", () => {
  const { Damage: D } = load();
  const a = car({ prog: 100, x: 0 }), b = car({ prog: 104, x: -0.4 });
  D.contact(a, b, 0.6);
  const sa = D.state(a), sb = D.state(b);
  assert.ok(sa.fwL > 0 && sa.rw === 0, "a ran into b's tail with its nose-left");
  assert.ok(sb.rw > 0 && sb.fwL === 0, "b was hit from behind");
  D.contact(a, b, 0.6);
  assert.equal(D.state(a).hits, 1, "same shunt inside the cooldown: one hit");
  D.observe(a, 0.5, 90); D.observe(b, 0.5, 90);
  D.contact(a, b, 0.6);
  assert.equal(D.state(a).hits, 2);
  // The nose yaw rotates the offset: a car spun 180° hit from 'ahead' is hit on its tail.
  const sp = car({ prog: 100, yawVis: Math.PI }), o = car({ prog: 104 });
  D.contact(sp, o, 0.5);
  assert.ok(D.state(sp).rw > 0 && D.state(sp).fwL + D.state(sp).fwR === 0);
});

test("contact: a leader lapping a backmarker is booked by the road, not the standings", () => {
  const { Damage: D } = load();
  const L = 5000;
  // The leader (a lap up) runs into the lapped car 3 m ahead of it ON THE ROAD.
  const a = car({ prog: 5 * L + 1000, x: 0 }), b = car({ prog: 4 * L + 1003, x: -0.4 });
  D.contact(a, b, 0.6, L);
  const sa = D.state(a), sb = D.state(b);
  assert.ok(sa.fwL > 0 && sa.rw === 0, "the leader hit with its nose");
  assert.ok(sb.rw > 0 && sb.fwL === 0 && sb.knock === 0, "the lapped car was hit from behind");
});

test("wall: the pin's rising edge books one strike on the wall side; a kiss books nothing", () => {
  const { Damage: D } = load();
  const c = car({ x: 5, speed: 60, yawVis: 0.6 });
  D.observe(c, 1 / 60, 90);
  c.wasOnWall = true;
  D.observe(c, 1 / 60, 90);
  const s = D.state(c);
  assert.equal(s.hits, 1);
  assert.ok(s.fwR > s.fwL, "right wall, nose in: right front corner");
  D.observe(c, 1 / 60, 90);
  assert.equal(D.state(c).hits, 1, "still pinned: no new strike");
  const k = car({ x: -5, speed: 4, yawVis: 0 });
  D.observe(k, 1 / 60, 90); k.wasOnWall = true; D.observe(k, 1 / 60, 90);
  assert.equal(D.state(k).hits, 0);
});

test("repair: a completed stop (pitOutT edge) and reset() zero every part", () => {
  const { Damage: D } = load();
  const c = car();
  D.apply(D.get(c), 0, 2, 0.9);
  assert.ok(D.state(c).shown);
  c.pitOutT = 2; D.observe(c, 1 / 60, 90);
  assert.deepEqual([D.state(c).worst, D.state(c).knock, D.state(c).hits], [0, 0, 0]);
  D.apply(D.get(c), 0, 2, 0.9);
  D.observe(c, 1 / 60, 90);
  assert.ok(D.state(c).worst > 0, "the same stop repairs once, on its edge");
  D.reset(c);
  assert.equal(D.state(c).worst, 0);
});

test("HUD chip: hidden under the threshold, tinted levels + text + aria-label above it", () => {
  const { Damage: D, HudDamage: H } = load();
  assert.equal(H.level(0.1), 0); assert.equal(H.level(0.2), 1); assert.equal(H.level(0.5), 2); assert.equal(H.level(0.9), 3);
  const parts = {};
  const mk = (k) => (parts[k] = { attrs: {}, setAttribute(n, v) { this.attrs[n] = v; } });
  const txt = { textContent: "" };
  const el = { hidden: true, attrs: {}, setAttribute(n, v) { this.attrs[n] = v; },
    querySelector(q) { if (q === "[data-dmg-text]") return txt; const m = /data-part="(\w+)"/.exec(q); return m ? parts[m[1]] || mk(m[1]) : null; } };
  const r = D.blank();
  assert.equal(H.paint(el, r, D.worst(r) > D.SHOW), false);
  assert.equal(el.hidden, true);
  D.apply(r, 3, -0.5, 0.5);
  assert.equal(H.paint(el, r, D.worst(r) > D.SHOW), true);
  assert.equal(el.hidden, false);
  assert.equal(parts.fwL.attrs["data-lvl"], "1");
  assert.equal(txt.textContent, "FW L 40%");
  assert.match(el.attrs["aria-label"], /^Car damage: front wing left 40%/);
  assert.match(H.text({ fwL: 0, fwR: 0, rw: 0, floor: 0, knock: 1 }), /^SUSP$/);
});

// ── THE CONTRACT ──────────────────────────────────────────────────────────────
// Damage is a readout. Driving physics, the AI and race control must not read
// it — not even to "just check". A future performance option is an explicit,
// setting-gated read and must change THIS test on purpose.
test("no physics / AI / race-control module reads Damage", () => {
  const files = fs.readdirSync(path.join(ROOT, "js/physics")).filter((f) => f.endsWith(".js")).map((f) => "js/physics/" + f)
    .concat(["js/race/race-control.js", "js/race/sporting-regs.js", "js/race/quali-model.js", "js/race/reliability.js",
      "js/race/pit-lane.js", "js/race/overtake-mode.js", "js/career/career.js"]);
  assert.ok(files.length > 10);
  const readers = files.filter((f) => /\bDamage\b|\bHudDamage\b/.test(read(f)));
  assert.deepEqual(readers, [], "a physics / AI / race-control file names Damage");
});

test("game.js only FEEDS Damage (contact / observe / reset) and its physics paths never read it", () => {
  const g = read("js/game.js");
  const uses = [...g.matchAll(/\bDamage\.(\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(uses, ["contact", "observe", "reset"]);
  // damage.js writes no field on a car: state lives in its own WeakMap.
  assert.doesNotMatch(SRC.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), /\b(c|a|b)\.\w+\s*[+\-*/]?=(?!=)/);
});
