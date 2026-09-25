/* FLYBY FLEET AUDIT — the two fleet-wide sweeps of the loading-screen flyby
 * (js/camera/flyby-seq.js through tools/lib/flyby-audit.cjs), split out of
 * tests/unit/flyby-shots.test.mjs on 2026-09-25 because they build twelve
 * circuits between them (~1 min here) and that file runs in the edit loop.
 * Nothing was dropped: flyby-shots keeps BOTH audits on monza, with the same
 * rule functions (tests/helpers/flyby-audit-rules.mjs), so an edit to the
 * sequencer still meets them at once; this file holds every circuit, in
 * test:node-slow (CI guards always, locally when pick-tests names it).
 *
 * One game VM, re-raced per circuit (~1 s each on an idle box), as before.
 */
import { test } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { fleetFindings, variedAudit, FLEET, VARIED } from "../helpers/flyby-audit-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
const { auditTrack } = require(path.join(ROOT, "tools/lib/flyby-audit.cjs"));

async function withFleet(ids, fn) {
  const g = await createGame({ track: ids[0] });
  try {
    const out = [];
    for (const id of ids) {
      if (id !== ids[0]) await g.race(id, "day", "dry");   // createGame raced the first already
      out.push(...(await fn(id, g.G.track, g)));
    }
    return out;
  } finally { g.close(); }
}

test("fleet: no pop, no crane, no eye underground, grid sightline on the road, no whip pan", async () => {
  const bad = await withFleet(FLEET, (id, track, g) => fleetFindings(id, auditTrack(g.sandbox, track, { samples: 400 })));
  assert.deepEqual(bad, [], "flyby fleet audit:\n  " + bad.join("\n  "));
});

test("varied flybys hold the fleet audit too (seeds 0-5 on three circuits)", async () => {
  const bad = await withFleet(VARIED, (id, track, g) => variedAudit(auditTrack, g.sandbox, id, track));
  assert.deepEqual(bad, [], bad.join("\n"));
});
