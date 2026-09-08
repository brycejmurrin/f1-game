/* team-livery.test.mjs — one `livery:` per team, and every field it names is real.
 *
 * WHY THIS EXISTS. Two sessions each added a `livery:` block to the SAME team
 * records — one for the cover colour, one for the spine design. Git merged both
 * additions without a conflict, because they were separate lines in the same
 * object literal, and JavaScript resolves a duplicate key by keeping the LAST
 * one. Ferrari's and Mercedes' whole engine-cover design vanished silently:
 * no error, no warning, and the atlas simply painted the plain cover. It was
 * only caught by printing team.livery and not believing the earlier screenshot.
 *
 * That is a merge hazard, not a typo — it will happen again the next time two
 * sessions dress the same car — so the guard is on the SHAPE of the file rather
 * than on any particular team's design.
 *
 * Run: node --test tests/unit/team-livery.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/data/teams.js"), "utf8");
const M = loadParts();

test("no team record declares `livery:` twice", () => {
  // Split on the id line so each chunk is one team's literal, then count.
  const chunks = SRC.split(/^ *id: "/m).slice(1);
  assert.ok(chunks.length >= 11, "team records not found — did the file shape change?");
  for (const chunk of chunks) {
    const id = chunk.slice(0, chunk.indexOf('"'));
    const n = (chunk.match(/^ *livery: \{/gm) || []).length;
    assert.ok(n <= 1, `team "${id}" declares livery: ${n} times — the LAST one wins and the others are silently dead`);
  }
});

test("every livery field a team names is one the renderer knows", () => {
  const KNOWN = new Set(["cover", "finStyle", "finBadge", "finShape", "finArt", "fin",
    "spineHeight", "spineLogo", "spineSide", "tcam", "coverVents", "stripe", "noseStripe",
    "accent", "nose", "pod", "wing", "halo", "logo", "logo2", "logo3", "finish", "numFont", "sponsors"]);
  for (const t of M.Teams.LIST) {
    if (!t.livery) continue;
    for (const k of Object.keys(t.livery)) {
      // Liveries.forTeam copies a fixed key list onto the default; a field
      // outside it is dead weight that reads as if it were doing something.
      assert.ok(KNOWN.has(k), `team "${t.id}" livery names "${k}", which forTeam does not copy`);
    }
    if (t.livery.spineHeight) {
      assert.ok(M.Car3D.SPINE_HEIGHT_IDS.includes(t.livery.spineHeight),
                `team "${t.id}" spineHeight "${t.livery.spineHeight}" is not a Car3D id`);
    }
    if (t.livery.finShape) {
      assert.ok(M.Car3D.FIN_SHAPE_IDS.includes(t.livery.finShape),
                `team "${t.id}" finShape "${t.livery.finShape}" is not a Car3D id`);
    }
  }
});
