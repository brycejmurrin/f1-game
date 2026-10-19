/* parts-factory-key.test.mjs — Parts.factoryKey against literals.
 *
 * tests/specs/parts-factory-presets.spec.js looks every team's captured mesh up BY
 * factoryKey(team), so a factoryKey that mapped teams to the wrong (or the same)
 * key would still agree with itself there. The keys below are written out, so a
 * wrong key fails here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const { Parts, Teams } = loadParts();
const team = (id) => Teams.LIST.find((t) => t.id === id);

const CATEGORIES = "engine|aero|suspension|brakes|tyres|ers|gearbox|fuel|exhaust|floor|cockpit|wheels";

test("the key is the factory option id of every catalog category, in catalog order", () => {
  assert.equal(Parts.CATALOG.map((c) => c.id).join("|"), CATEGORIES, "catalog order is the key order");
  assert.equal(Parts.factoryKey(team("mclaren")),
    "sig_mclaren_pu|sig_mclaren_flex|sig_mclaren_active|sig_mclaren_brakes|sig_mclaren_tyre|sig_mclaren_ers|sig_mclaren_gbox|sig_mclaren_fuel|sig_mclaren_exh|sig_mclaren_floor|sig_mclaren_cpit|sig_mclaren_rim");
  assert.equal(Parts.factoryKey(team("ferrari")),
    "manu_ferrari|sig_ferrari_wing|sig_ferrari_susp|sig_ferrari_brembo|sig_ferrari_tyre|sig_ferrari_ers|sig_ferrari_seamless|sig_ferrari_fuel|sig_ferrari_exh|sig_ferrari_floor|sig_ferrari_cpit|sig_ferrari_rim");
});

test("a manufacturer-engine team keys its engine slot by the manufacturer, not its own name", () => {
  assert.ok(Parts.factoryKey(team("redbull")).startsWith("manu_ford|"));
  assert.ok(Parts.factoryKey(team("astonmartin")).startsWith("manu_honda|"));
});

test("every real team has its own key", () => {
  const real = Teams.LIST.filter((t) => !t.custom && !t.legends);
  const keys = real.map((t) => Parts.factoryKey(t));
  assert.equal(new Set(keys).size, real.length, "two teams share a factory key");
  for (const k of keys) assert.equal(k.split("|").length, Parts.CATALOG.length);
});
