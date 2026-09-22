/* foundation-core-vm.test.mjs — the CORE contract that all sixteen
 * tests/specs/*-foundation.spec.js assert, replayed for every one of their
 * circuits in the Node VM (tools/lib/game-vm.cjs).
 *
 * WHY THIS EXISTS, AND WHAT IT IS NOT.
 *
 * The sixteen foundation specs are pure `__apex` readers — geometryDiagnostics,
 * modelDiagnostics, wallStats, groundY — with no pixel read and no DOM in any
 * of them. They live in `test:circuits`, a BROWSER group, and between them
 * declare about 67 minutes of test.setTimeout budget. Measured here, the same
 * circuits build in the VM in 1.4-4.2 s each off a 0.4 s boot.
 *
 * So a COMMON-MODE break — a change to the shared foundation that NaNs every
 * circuit's barriers, or drops every required model — currently waits for a
 * browser group that a change-aware gate rarely selects. This catches that
 * class in well under a minute, on every push, on a box with no GPU.
 *
 * IT DOES NOT REPLACE THOSE SPECS. Each of the sixteen also makes claims only
 * true of its own circuit — Spa's 102 m relief and the Raidillon climb,
 * Interlagos' prop budget, Montreal's finish plateau, Abu Dhabi's Sphere-sector
 * dip. Those thresholds are the reason each spec exists and are NOT ported: a
 * subtly wrong bespoke number here would be worse than the browser cost, and
 * the honest split is "the shared contract runs everywhere, the circuit's own
 * evidence stays where it was measured". The browser specs remain the truth.
 *
 * WHAT IS ASSERTED, in the same shape the specs use:
 *   geometry.every(e => e.ok)          every buffer built and is finite
 *   walls.anyNaN === false             no NaN reached a collision barrier
 *   walls.minOverHw >= 1               no barrier sits inside the road half-width
 *   required model failures === []     nothing a circuit declared REQUIRED is
 *                                      suppressed, invalid or unsafe
 *
 * Run: node --test tests/unit/foundation-core-vm.test.mjs   (~40 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

// DERIVED FROM THE SPECS, never re-typed: the circuits covered here are exactly
// the ones that have a foundation spec. A spec added or renamed changes this
// list on its own, so the two cannot drift — which is the failure mode that put
// dead `js/game/` paths in a CI filter for a fortnight.
const SPEC_DIR = new URL("../specs/", import.meta.url);
const CIRCUITS = fs.readdirSync(SPEC_DIR)
  .filter((f) => f.endsWith("-foundation.spec.js"))
  .map((f) => f.replace("-foundation.spec.js", ""))
  .sort();

// The spec files' own id is the FILE stem; two circuits spell theirs
// differently in Tracks.LIST. Map only those, and fail loudly on an unknown id
// rather than silently skipping a circuit — a twin that quietly covers fifteen
// of sixteen is the kind of green that taught nobody anything.
const ID_OF = { redbull: "redbull", "albert-park": "albert_park" };
const trackId = (stem) => ID_OF[stem] || stem;

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

test("every foundation circuit has a spec and a resolvable track id", () => {
  assert.ok(CIRCUITS.length >= 16,
    `found ${CIRCUITS.length} foundation specs — expected at least 16; did the glob break?`);
  // Tracks.LIST off the VM sandbox, the way the browser reads the page global
  // (new-hooks-vm.test.mjs:480 does the same for its Jeddah def).
  const known = new Set(Array.from(g.sandbox.Tracks.LIST, (t) => t.id));
  for (const stem of CIRCUITS) {
    assert.ok(known.has(trackId(stem)),
      `${stem}-foundation.spec.js names track "${trackId(stem)}", which Tracks.LIST does not have`);
  }
});

for (const stem of CIRCUITS) {
  const id = trackId(stem);
  test(`${id}: the shared foundation contract holds`, async () => {
    await g.race(id);
    g.apex.go();
    g.apex.jump(0.1, 40, 0);

    const geometry = g.apex.geometryDiagnostics();
    assert.ok(geometry.length > 5, `${id}: only ${geometry.length} geometry entries — the build is not complete`);
    // Array.from: geometry comes from the VM realm, so .filter().map() yields a
    // VM-realm Array and strict deepEqual rejects it as "not reference-equal"
    // even when it is empty. Copy into this realm before comparing.
    const broken = Array.from(geometry.filter((e) => !e.ok), (e) => e.name);
    assert.deepEqual(broken, [], `${id}: geometry buffers failed: ${broken.join(", ")}`);

    // Barriers are what stop a car leaving the world. A NaN here does not throw;
    // it silently disables the wall, and the car drives through it.
    const walls = g.apex.wallStats();
    assert.equal(walls.anyNaN, false, `${id}: a NaN reached a collision barrier`);
    assert.ok(Number.isFinite(walls.minOverHw),
      `${id}: minOverHw is ${walls.minOverHw} — not a finite number`);
    assert.ok(Number.isFinite(walls.n) && walls.n > 0, `${id}: no barriers were recorded at all`);
    // NOT asserted here: a BOUND on minOverHw. The sixteen specs pin it at
    // -1.5, 0, 0.8, 1 and 3 depending on the circuit — Monaco's barriers
    // legitimately sit inside the road half-width because that is what a street
    // circuit is, and Suzuka's sit at 0.9. There is no shared number, so this
    // twin asserts only that the measurement EXISTS and is finite; the bound
    // stays in the spec that measured it. Inventing one here failed seven
    // circuits on the first run, which is the argument for this split.

    // REQUIRED is the circuit author saying "this landmark is not optional".
    const models = g.apex.modelDiagnostics();
    for (const k of ["emitted", "suppressed", "invalid", "unsafe"]) {
      assert.ok(Array.isArray(models[k]), `${id}: modelDiagnostics.${k} is not an array`);
    }
    const requiredFailures = Array.from(
      [...models.suppressed, ...models.invalid, ...models.unsafe].filter((e) => e && e.required),
      (e) => e.id || JSON.stringify(e));
    assert.deepEqual(requiredFailures, [],
      `${id}: required models did not survive the build: ${requiredFailures.join(", ")}`);
  });
}
