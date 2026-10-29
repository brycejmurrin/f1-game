/* damage — the DISPLAY-ONLY damage readout (js/race/damage.js) and its HUD
 * chip (js/ui/hud-damage.js): impact → part mapping, severity accumulation and
 * clamp, the debounce, barrier strikes, repair on a new race / completed stop,
 * and the contract that NOTHING in physics, AI or race control reads it. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { withI18n } from "../helpers/i18n-ctx.mjs";
import { fileURLToPath } from "node:url";
import { gameSource } from "../helpers/game-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const SRC = read("js/race/damage.js");
const HUD_SRC = read("js/ui/hud-damage.js");

function load() {
  const ctx = {};
  vm.createContext(ctx); withI18n(ctx);
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

test("contact: a car lapping a backmarker is booked by on-road gap, not race distance", () => {
  const { Damage: D } = load();
  const L = 5000;
  // a is a lap up and runs into b, 2 m ahead of its nose on the road.
  const a = car({ prog: 5 * L + 10, x: 0 }), b = car({ prog: 4 * L + 12, x: 0 });
  D.contact(a, b, 0.6, L);
  const sa = D.state(a), sb = D.state(b);
  assert.ok(sa.fwL + sa.fwR > 0 && sa.rw === 0, "the lapping car's nose took it");
  assert.ok(sb.rw > 0 && sb.fwL + sb.fwR === 0, "the backmarker was hit from behind");
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

test("wall: severity uses this frame's speed — accel-into-wall books, decel-to-kiss does not", () => {
  const { Damage: D } = load();
  // Prior frame was parked; this frame hits the wall at race speed.
  const a = car({ x: 5, speed: 0, yawVis: 0.6 });
  D.observe(a, 1 / 60, 90);
  a.speed = 70; a.wasOnWall = true;
  D.observe(a, 1 / 60, 90);
  assert.equal(D.state(a).hits, 1, "impact speed is the rising-edge frame");
  // Prior frame was fast; this frame is a slow brush.
  const b = car({ x: 5, speed: 80, yawVis: 0.8 });
  D.observe(b, 1 / 60, 90);
  b.speed = 3; b.wasOnWall = true;
  D.observe(b, 1 / 60, 90);
  assert.equal(D.state(b).hits, 0, "a kiss after braking is not damage");
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
// it — not even to "just check". The ONE exception is the explicit, setting-
// gated DAMAGE → HANDLING option (#1578): js/race/damage-handling.js reads it,
// game.js hands PlayerForces its factors as ctx.damage, and with the option OFF
// that is null (pinned below).
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

// css/hud.css: #hud-damage's top/right divide by --hud-z. It must ride the
// top-band zoom group with #hud-limits — otherwise --hud-z is empty, the calcs
// are invalid, and the fixed chip falls to static top-left over the minimap
// (player cockpit shots, 2026-10-05).
test("#hud-damage joins the top-band --hud-z zoom group with #hud-limits", () => {
  const css = read("css/hud.css");
  assert.match(css, /#hud-limits, #hud-damage, #hud-mirror[\s\S]*?\{ --hud-z: var\(--hud-z-top, var\(--hud-scale\)\); zoom: var\(--hud-z\); \}/);
  const rule = css.match(/#hud-damage \{([\s\S]*?)\n\}/);
  assert.ok(rule, "#hud-damage rule present");
  assert.match(rule[1], /top: calc\([\s\S]*\/ var\(--hud-z\)/);
  assert.match(rule[1], /right: calc\([\s\S]*\/ var\(--hud-z\)/);
});

// ── DAMAGE → HANDLING (#1578): opt-in, default OFF ─────────────────────────────
const DH_SRC = read("js/race/damage-handling.js");
function loadDH() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.Damage = Damage;", ctx, { filename: absSrc("js/race/damage.js") });
  vm.runInContext(DH_SRC + "; this.DamageHandling = DamageHandling;", ctx, { filename: absSrc("js/race/damage-handling.js") });
  return ctx;
}

test("DamageHandling ships OFF: forCar is null, even for a wrecked local car, until the setting is on", () => {
  const { Damage: D, DamageHandling: H } = loadDH();
  const c = car({ local: true });
  D.apply(D.get(c), 4.8, 0, 1);
  assert.equal(H.isEnabled(), false);
  assert.equal(H.forCar(c), null);
  assert.equal(H.fromStore({ get: (k, d) => d }), false, "an unset key is OFF");
  assert.equal(H.fromStore({ get: (k, d) => (k === H.KEY ? true : d) }), true);
  assert.ok(H.forCar(c), "ON: the local car gets factors");
  assert.equal(H.forCar(car({ local: false })), null, "ON: an AI / remote car keeps the readout-only contract");
});

test("DamageHandling factors: front wing → front aero, rear wing → rear aero, floor → both, knock → grip", () => {
  const { DamageHandling: H } = loadDH();
  const clean = H.factors({ fwL: 0, fwR: 0, rw: 0, floor: 0, knock: 0 });
  assert.deepEqual({ ...clean }, { aeroF: 1, aeroR: 1, grip: 1 }, "no damage, no effect");
  const fw = H.factors({ fwL: 1, fwR: 1, rw: 0, floor: 0, knock: 0 });
  assert.ok(fw.aeroF < 1 && fw.aeroR === 1 && fw.grip === 1, "a broken front wing costs the front only");
  const half = H.factors({ fwL: 1, fwR: 0, rw: 0, floor: 0, knock: 0 });
  assert.ok(half.aeroF > fw.aeroF && half.aeroF < 1, "half a wing costs half as much");
  const rw = H.factors({ fwL: 0, fwR: 0, rw: 1, floor: 0, knock: 0 });
  assert.ok(rw.aeroR < 1 && rw.aeroF === 1);
  const floor = H.factors({ fwL: 0, fwR: 0, rw: 0, floor: 1, knock: 0 });
  assert.ok(floor.aeroF < 1 && floor.aeroR < 1 && floor.aeroF === floor.aeroR);
  assert.ok(H.factors({ fwL: 0, fwR: 0, rw: 0, floor: 0, knock: 1 }).grip < 1);
  const worst = H.factors({ fwL: 9, fwR: 9, rw: 9, floor: 9, knock: 1 });
  assert.ok(worst.aeroF >= 0 && worst.aeroR >= 0, "out-of-range parts clamp; aero never goes negative");
});

test("a completed pit stop repairs the handling: the factors return to 1 on the pit-out edge", () => {
  const { Damage: D, DamageHandling: H } = loadDH();
  H.setEnabled(true);
  const c = car({ local: true });
  D.apply(D.get(c), 4.8, 0.5, 1);
  assert.ok(H.forCar(c).aeroF < 1);
  c.pitOutT = 1.5; D.observe(c, 1 / 60, 72);
  const f = H.forCar(c);
  assert.deepEqual([f.aeroF, f.aeroR, f.grip], [1, 1, 1]);
});

test("the physics reads damage ONLY through the gated ctx.damage seam", () => {
  const pf = read("js/physics/player-forces.js"), g = gameSource();
  assert.match(pf, /const dmg = ctx\.damage;/);
  assert.match(pf, /let dmgF = 1, dmgR = 1;\s*\n\s*if \(dmg\) \{/, "OFF leaves both axle ratios at exactly 1");
  const fills = [...g.matchAll(/pf\.damage = ([^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(fills, ['typeof DamageHandling !== "undefined" ? DamageHandling.forCar(c) : null'], "game.js fills it from DamageHandling once");
  for (const f of fs.readdirSync(path.join(ROOT, "js/physics")).filter((x) => x.endsWith(".js")))
    assert.doesNotMatch(read("js/physics/" + f), /\bDamageHandling\b/, f + " must not reach for the module itself");
});

test("VM: ON, a broken front wing lowers front grip in physState at speed; repair restores it; OFF is byte-identical", async () => {
  const { createRequire } = await import("node:module");
  const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
  const g = await createGame({ track: "monza" });
  await g.race("monza", "day", "dry");
  const S = g.sandbox, P = g.G.player, A = g.apex;
  const drive = () => { A.setInput({ throttle: true }); g.step(240); return A.physState(); };
  const base = drive();
  assert.equal(base.damageAxF, 1); assert.equal(base.damageHandling, false);
  // OFF: a wrecked wing changes nothing the physics reports.
  const rec = S.Damage.get(P); rec.fwL = rec.fwR = 1;   // the front wing only (a real nose hit also books floor + knock)
  const off = drive();
  assert.equal(off.damageAxF, 1); assert.equal(off.damageAxR, 1);
  S.DamageHandling.setEnabled(true);
  try {
    const on = drive();
    assert.ok(on.damageAxF < 1, "front axle loses grip with the wing gone: " + on.damageAxF);
    assert.equal(on.damageAxR, 1, "the rear wing and floor are intact");
    // Repair: the pit-out edge resets the record.
    P.pitOutT = 2; S.Damage.observe(P, 1 / 60, g.G.vTop());
    const fixed = drive();
    assert.equal(fixed.damageAxF, 1);
  } finally { S.DamageHandling.setEnabled(false); }
});

test("DamageHandling lives in the lazy race session: the stub holds the stored choice and the real module adopts it", () => {
  const ctx = vm.createContext({});
  vm.runInContext(read("js/race/session-stub.js"), ctx, { filename: absSrc("js/race/session-stub.js") });
  const stub = vm.runInContext("DamageHandling", ctx);
  assert.equal(stub._stub, true);
  assert.equal(stub.forCar({ local: true }), null, "no handling effect from the stub");
  assert.equal(stub.fromStore({ get: (_k, d) => (_k === "damageHandling" ? true : d) }), true);
  vm.runInContext(DH_SRC, ctx, { filename: absSrc("js/race/damage-handling.js") });
  assert.equal(vm.runInContext("DamageHandling._stub", ctx), undefined);
  assert.equal(vm.runInContext("DamageHandling.isEnabled()", ctx), true, "the pre-hydration choice survives the swap");
});
