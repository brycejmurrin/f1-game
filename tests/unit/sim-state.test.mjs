/* sim-state.test.mjs — the SimState registry's own contract (js/core/sim-state.js,
 * #6860): ordering, replacement, and what restore does with a part a snapshot
 * lacks. The game-level proof (a restored race replays byte-identically) is
 * tests/unit/sim-state-vm.test.mjs. Pure VM, no game boot. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const SRC = fs.readFileSync(new URL("../../js/core/sim-state.js", import.meta.url), "utf8");
const CF_SRC = fs.readFileSync(new URL("../../js/race/car-fields.js", import.meta.url), "utf8");
function load() {
  const ctx = vm.createContext({});
  vm.runInContext(CF_SRC, ctx, { filename: absSrc("js/race/car-fields.js") });   // FULL before LAZY: SimState reads CarFields.SNAPSHOT at eval
  vm.runInContext(SRC, ctx, { filename: absSrc("js/core/sim-state.js") });   // `var SimState` lands on the context
  return ctx.SimState;
}

test("parts run by ascending order, then registration order", () => {
  const SS = load();
  const seen = [];
  SS.register("late", { order: 5, capture: () => 1, restore: () => seen.push("late") });
  SS.register("early", { order: -20, capture: () => 1, restore: () => seen.push("early") });
  SS.register("mid", { capture: () => 1, restore: () => seen.push("mid") });
  const names = SS.names();
  assert.ok(names.indexOf("early") < names.indexOf("incidents"), "order -20 runs before the order -10 side worlds");
  assert.ok(names.indexOf("late") > names.indexOf("cars"));
  SS.restore({ v: SS.VERSION, parts: { late: 1, early: 1, mid: 1 } }, {});
  assert.deepEqual(seen, ["early", "mid", "late"]);
});

test("re-registering a name replaces it in place (a re-evaluated lazy bundle)", () => {
  const SS = load();
  let which = "";
  SS.register("x", { capture: () => 1, restore: () => { which = "first"; } });
  const n = SS.names().length;
  SS.register("x", { capture: () => 2, restore: () => { which = "second"; } });
  assert.equal(SS.names().length, n);
  SS.restore({ v: SS.VERSION, parts: { x: 0 } }, {});
  assert.equal(which, "second");
});

test("a part the snapshot does not hold is left alone; a foreign snapshot is refused", () => {
  const SS = load();
  let restored = false;
  SS.register("lazy", { capture: () => 1, restore: () => { restored = true; } });
  assert.equal(SS.restore({ v: SS.VERSION, parts: {} }, {}), true);
  assert.equal(restored, false, "a snapshot taken before a module registered must not touch it");
  assert.equal(SS.restore({ v: SS.VERSION + 1, parts: { lazy: 1 } }, {}), false);
  assert.equal(SS.restore(null, {}), false);
  assert.equal(restored, false);
});

test("register refuses a part without capture and restore", () => {
  const SS = load();
  assert.throws(() => SS.register("bad", { capture: () => 1 }), /capture and restore/);
  assert.throws(() => SS.register("", { capture: () => 1, restore: () => {} }), /name/);
});

test("the car part: _incidentOwned is runtime ownership, never captured nor deleted (#6862 P1)", () => {
  const SS = load();
  const car = { s: 10, x: 1, _incidentOwned: true, isPlayer: true, penalty: 0 };
  const snap = SS.captureCar(car, [car]);
  assert.equal(Object.hasOwn(snap.fields, "_incidentOwned"), false);
  car._incidentOwned = false; car.s = 99; car.extra = 3; car.penalty = 5;
  SS.applyCar(car, snap, true, [car]);
  assert.equal(car._incidentOwned, false, "restore must leave the owner's flag alone");
  assert.equal(car.s, 10);
  assert.equal(Object.hasOwn(car, "extra"), false, "a primitive the snapshot lacks is deleted");
  assert.equal(car.penalty, 5, "the player's penalty is kept forward");
});

test("the car part: another car by identity, controller state cloned with typed arrays", () => {
  const SS = load();
  const track = { big: true };
  const a = { s: 0 }, b = { s: 1 };
  a.passOf = b;
  a._lk = { node: 3, track, v: new Float64Array([1, 2]) };
  a.passPlan = { of: b, left: { gap: 1 } };
  const snap = SS.captureCar(a, [a, b]);
  a.passOf = null; a._lk.v[0] = 9; a._lk.node = 7; a.passPlan.left.gap = 5;
  SS.applyCar(a, snap, false, [a, b]);
  assert.equal(a.passOf, b, "a car reference comes back as the same car");
  assert.equal(a._lk.node, 3);
  assert.equal(a._lk.v[0], 1);
  assert.ok(a._lk.v instanceof Float64Array || ArrayBuffer.isView(a._lk.v), "the typed array stays typed");
  assert.equal(a._lk.track, track, "the circuit is kept by identity, never cloned");
  assert.equal(a.passPlan.of, b);
  assert.equal(a.passPlan.left.gap, 1);
  a._lk.v[1] = 8;
  assert.equal(snap.state._lk.v[1], 2, "a restore must not alias the snapshot");
});
