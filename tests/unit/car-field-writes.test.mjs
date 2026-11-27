/* car-field-writes.test.mjs — #6920 U1.4: a `c.<name> =` write to an undeclared car field fails here.
 *
 * Declared = a makeCars spawn key (read off a booted game-vm car, so spreads count), a CarFields KEYS / WARM / MUTABLE
 * entry, a RESETS row, or a shrink-only baseline entry. Fix a failure by declaring the field in js/race/car-fields.js.
 * Limit: only the receiver `c` is seen (see tools/check/car-field-writes.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { scan, readTree, report } from "../../tools/check/car-field-writes.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const SRC = readFileSync(new URL("../../js/race/car-fields.js", import.meta.url), "utf8");
const CF = new Function(SRC.replace(/^const CarFields\b/m, "var CarFields") + "\nreturn CarFields;")();
const META = JSON.parse(readFileSync(new URL("../data/car-field-writes-baseline.json", import.meta.url), "utf8"));
const BASE = Object.keys(META.baseline);

let declaredP = null;
function declared() {
  declaredP ||= (async () => {
    const g = await createGame({ storage: {} });
    try {
      await g.race("monza");
      const spawn = Object.keys(g.G.cars[0]);
      return new Set([...spawn, ...CF.KEYS, ...CF.WARM, ...CF.MUTABLE, ...CF.RESETS.map((r) => r.key)]);
    } finally { g.close(); }
  })();
  return declaredP;
}

test("no undeclared c.<field> write beyond the baseline", async () => {
  const { undeclared } = scan(readTree(), { declared: await declared(), skip: META.skip });
  const msg = report(undeclared, BASE);
  assert.equal(msg, "", msg);
});

test("a declared or unwritten baseline entry is stale", async () => {
  const decl = await declared();
  const { undeclared } = scan(readTree(), { declared: decl, skip: META.skip });
  const written = new Set(undeclared.map((w) => w.name));
  for (const name of BASE) {
    assert.ok(!decl.has(name), `baseline "${name}" is now declared: delete it from tests/data/car-field-writes-baseline.json (shrink-only)`);
    assert.ok(written.has(name), `baseline "${name}" is no longer written under js/game.js, js/physics, js/race: delete it from the baseline`);
  }
  for (const [file, fns] of Object.entries(META.skip)) for (const fn of fns) {
    const hit = scan(readTree().filter((f) => f.file === file), { declared: [] }).writes.some((w) => w.fn === fn);
    assert.ok(hit, `skip entry ${file} :: ${fn} no longer writes c.<name>: delete it`);
  }
});

test("a planted c.__plantedField write is named", async () => {
  const files = readTree().map((f) => f.file === "js/physics/vehicle.js"
    ? { ...f, src: f.src + "\nfunction __planted(c) { c.__plantedField = 1; }\n" } : f);
  const { undeclared } = scan(files, { declared: await declared(), skip: META.skip });
  const msg = report(undeclared, BASE);
  assert.match(msg, /__plantedField/);
  assert.match(msg, /js\/race\/car-fields\.js/);
  assert.match(msg, /js\/physics\/vehicle\.js/);
});
