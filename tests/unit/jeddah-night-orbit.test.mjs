/* jeddah-night-orbit.test.mjs — #3315 OWNED scenery gaps for night start orbit.
 *
 * night_pass cell at frac 0 (az 45, el 18, dist 40) → eye ~27 m lateral.
 * Authored SF grandstandEx / cityFront / closedMass must sit past that ring
 * (gap ≥ 48). Theme-dress neonTowers on +1 need circuit-def dressingExclusions
 * (out of OWNED — D·W36e BLOCKED for that lend).
 *
 * Run: node --test tests/unit/jeddah-night-orbit.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const { buildContext } = require("../../tools/track/verify-track.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCENERY = path.join(ROOT, "js/circuits/scenery/jeddah.js");

test("jeddah SF authored gaps clear night_pass orbit (~27 m lateral)", () => {
  const src = fs.readFileSync(SCENERY, "utf8");
  const gs = src.match(/grandstandEx\(0\.0,\s*1,\s*(\d+)/);
  assert.ok(gs, "S/F grandstandEx gap authored");
  assert.ok(Number(gs[1]) >= 40,
    `S/F grandstandEx gap ${gs[1]} must be ≥ 40 to clear night orbit (~27 m); was 15 in #3315`);
  const cf = src.match(/cityFront\(0\.88,\s*0\.98,\s*1,\s*(\d+)/);
  assert.ok(cf, "SF cityFront gap authored");
  assert.ok(Number(cf[1]) >= 48,
    `SF cityFront gap ${cf[1]} must be ≥ 48 (past GS@48); was 28 in #3315`);
});

test("jeddah Corniche heroes still emit after SF gap push", () => {
  const Tracks = buildContext();
  const def = Tracks.LIST.find((d) => d.id === "jeddah");
  assert.ok(def, "jeddah registered");
  const track = Tracks.build(def, { night: true });
  const emitted = (track.modelDiagnostics && track.modelDiagnostics.emitted) || [];
  const idSet = new Set(emitted.map((e) => e.id));
  for (const id of ["jeddah-fountain", "jeddah-floating-mosque", "jeddah-blue-sail"]) {
    assert.ok(idSet.has(id), `${id} must emit (Corniche hero)`);
  }
});

let game;
before(async () => { game = await createGame({ track: "jeddah" }); });
after(() => { if (game) game.close(); });

test("Jeddah S/F night orbit returns a clear transmit ray (#3315 scenery)", () => {
  const G = game.G, a = game.apex, sb = game.sandbox;
  const r = a.orbit(0, 45, 18, 40, 1.5);
  assert.ok(r && r.eye && r.target, "orbit returned a pose");
  const inside = sb.FlybySeq.insideProp(G.track, r.eye, 1);
  assert.equal(inside, null, `eye must not sit inside a solid (${inside && inside.kind})`);
  const { T } = sb.FlybySight.transmit(G.track, r.eye, r.target);
  assert.ok(T >= 0.5, `transmit T=${T} (want ≥ 0.5)`);
});
