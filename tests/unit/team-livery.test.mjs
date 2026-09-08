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
import vm from "node:vm";
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

/* ── The paint editor's field list, in the three places it is spelled ──────────
 *
 * WHY. "Customize a copy" (⧉ on a stock scheme) built its draft from a
 * hand-written key list, and that list had drifted from the edit-in-place one
 * by eight fields: finStyle, finBadge, spineLogo, finShape, tcam, coverVents,
 * spineHeight, spineSide. Nothing failed loudly. `pillRow` falls back to its
 * own `dflt` when a key is missing, so the editor cheerfully showed STANDARD
 * and NONE, and the save writes a field only when it differs from that default
 * — so the copy was saved WITHOUT them. Every team sets finShape "none" and
 * spineHeight "dorsal", so copying a team's own paint job handed back a car
 * with a shark fin and a flat spine, with the editor agreeing it was right.
 *
 * The same key list is spelled three times — the editor's draft tables, the
 * save's `if (d.x ...)` chain, and Liveries.forTeam's copy list — so the guard
 * is that the three agree, and that the editor has exactly ONE draft builder.
 */
const SHEET = fs.readFileSync(path.join(ROOT, "js/garage/setup-sheet.js"), "utf8");
const LIVERIES_SRC = fs.readFileSync(path.join(ROOT, "js/car/liveries.js"), "utf8");

const listFrom = (src, re) => {
  const m = src.match(re);
  assert.ok(m, "field list not found — did the file shape change? " + re);
  return new Set(m[1].match(/"([A-Za-z0-9]+)"/g).map((q) => q.slice(1, -1)));
};

test("the paint editor builds every draft through one constructor", () => {
  // Three doors — new, edit, copy — and none of them may hand-roll a literal.
  const literals = SHEET.match(/csLivDraft = \{/g) || [];
  assert.equal(literals.length, 0,
    "a csLivDraft object literal is back; build it with livDraftFrom() so the " +
    "three doors cannot drift apart again");
  assert.equal((SHEET.match(/csLivDraft = livDraftFrom\(/g) || []).length, 3,
    "expected exactly three livDraftFrom() calls (new, edit, copy)");
});

test("the editor's draft, the save chain and forTeam name the same fields", () => {
  const colors = listFrom(SHEET, /const LIV_DRAFT_COLORS = \[([\s\S]*?)\];/);
  const pills = new Set((SHEET.match(/const LIV_DRAFT_PILLS = \{([\s\S]*?)\};/)[1]
    .match(/([A-Za-z0-9]+):/g) || []).map((k) => k.replace(":", "")));
  const draft = new Set([...colors, ...pills]);

  // The save writes `liv.<key> = ...` for each field it persists.
  const saved = new Set((SHEET.match(/\bliv\.([A-Za-z0-9]+)\s*=\s/g) || [])
    .map((m) => m.trim().slice(4).replace(/\s*=$/, "")).filter((k) => k !== "id" && k !== "name"));
  saved.delete("c1"); saved.delete("c2");

  const copied = listFrom(LIVERIES_SRC, /if \(ex\) for \(const k of \[([\s\S]*?)\]\)/);

  const diff = (a, b) => [...a].filter((k) => !b.has(k)).sort();
  assert.deepEqual(diff(draft, saved), [], "the editor drafts fields the save never persists");
  assert.deepEqual(diff(saved, draft), [], "the save persists fields no draft door sets");
  assert.deepEqual(diff(copied, draft), [], "forTeam copies fields the editor cannot show");
  assert.deepEqual(diff(draft, copied), [], "the editor drafts fields forTeam drops from a team default");
});

/* ── A dangling livery id must land on the team's car, not a bare pair of colours ── */

test("forTeam's default entry carries the team's whole livery block", () => {
  // resolveLivery() now falls back to list[0] when a stored id no longer
  // resolves (a garage file naming a custom livery whose array did not come
  // with it). That is only correct while list[0] IS the team's own scheme.
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(LIVERIES_SRC + "\n;globalThis.__L = Liveries;", ctx);
  const L = ctx.__L;
  for (const t of M.Teams.LIST) {
    if (!t.livery) continue;
    const first = L.forTeam(t)[0];
    assert.equal(first.id, "default", `team "${t.id}": list[0] is not the team default`);
    for (const k of Object.keys(t.livery)) {
      assert.deepEqual(first[k], t.livery[k],
        `team "${t.id}": forTeam's default drops "${k}", so a dangling id would repaint the car`);
    }
  }
});

test("resolveLivery falls back through the team's own list", () => {
  const GAME = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(GAME, /const list = getLiveries\(team\);\s*\n\s*const liv = list\.find\(\(l\) => l\.id === getLiveryId\(team\.id\)\) \|\| list\[0\];/,
    "resolveLivery must fall back to the team's default entry — a bare " +
    "{ c1, c2 } literal drops finShape/spineHeight/spineSide and regrows the fin");
});
