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
import { scanFile } from "../../tools/check/dup-keys.mjs";

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

test("no object literal in js/ declares the same key twice", () => {
  // The GENERAL case of the test above. The hazard is not about liveries: it is
  // that git merges two additions to one object literal without a conflict and
  // JavaScript keeps the last key, so whichever session wrote first loses its
  // work silently. It has happened twice — Ferrari and Mercedes, then Williams,
  // hours apart — so the whole tree is scanned rather than the one file that
  // caught it first.
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir)) {
      if (e === "three") continue;   // the vendored island is not ours to police
      const p = path.join(dir, e);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".js")) hits.push(...scanFile(fs.readFileSync(p, "utf8"), path.relative(ROOT, p)));
    }
  };
  walk(path.join(ROOT, "js"));
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line} \`${h.key}\` (first at ${h.first})`), []);
});

test("every livery field a team names is one the renderer knows", () => {
  // A DELIBERATE SECOND COPY of the list Liveries.forTeam copies, so adding a
  // key there does not silently make a team's field live — it has to be
  // acknowledged here too, with the reason.
  //   spineTint (2026-09-09): the SPINE TOP band's own colour. Aston Martin's
  //   launch car is a dark band on a body-green cover, and the band's old
  //   colour was stripe||accent — that team's accent is lime, and `stripe`
  //   would have darkened the nose as well.
  const KNOWN = new Set(["cover", "finStyle", "finBadge", "finShape", "finArt", "fin",
    "spineHeight", "spineLogo", "spineSide", "spineTint", "tcam", "coverVents", "stripe",
    "noseStripe", "accent", "nose", "pod", "wing", "halo", "logo", "logo2", "logo3",
    "finish", "numFont", "sponsors"]);
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

test("the editor's draft table and forTeam name the same fields", () => {
  // TWO independent spellings are left. The save and the live preview used to
  // be the third and fourth; both now derive from these tables through
  // livDraftTo (guarded below), so the only list that can still drift on its
  // own is Liveries.forTeam's — the one that copies a team's `livery:` block
  // onto its default scheme.
  const colors = listFrom(SHEET, /const LIV_DRAFT_COLORS = \[([\s\S]*?)\];/);
  const pills = new Set((SHEET.match(/const LIV_DRAFT_PILLS = \{([\s\S]*?)\};/)[1]
    .match(/([A-Za-z0-9]+):/g) || []).map((k) => k.replace(":", "")));
  const draft = new Set([...colors, ...pills]);
  const copied = listFrom(LIVERIES_SRC, /if \(ex\) for \(const k of \[([\s\S]*?)\]\)/);
  const diff = (a, b) => [...a].filter((k) => !b.has(k)).sort();
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

/* ── The reverse conversion, and the sheet that has to explain itself ────────
 *
 * livDraftTo() replaced the last two hand-written copies of the field list —
 * the save's `if (d.x && d.x !== <default>)` chain and livePreviewDraft's
 * object literal. Those two mattered more than the three above them: one built
 * the car you LOOK at while dragging a colour and the other built the livery
 * you GET when you press SAVE & FIT, so a drift between them is a garage that
 * lies to you rather than one that merely forgets a field.
 */
test("the save and the live preview both convert through livDraftTo", () => {
  assert.equal((SHEET.match(/livDraftTo\(d, false\)/g) || []).length, 1, "the save must convert through livDraftTo");
  assert.equal((SHEET.match(/livDraftTo\(d, true\)/g) || []).length, 1, "the live preview must convert through livDraftTo");
  // The shapes those two used to be spelled as. Either coming back means the
  // list has been forked again.
  assert.equal(/if \(d\.[A-Za-z0-9]+\) liv\.[A-Za-z0-9]+ = hexToArr/.test(SHEET), false,
    "a hand-written save chain is back — extend livDraftTo instead");
  assert.equal(/liv: \{ c1: hexToArr\(d\.c1\)/.test(SHEET), false,
    "a hand-written preview literal is back — extend livDraftTo instead");
});

test("every row in the paint editor says what it paints", () => {
  // The sheet's labels name colours, not surfaces, and two of them invert the
  // field names they carry (ACCENT is `c2`, DETAIL is `accent`). The hint is
  // the only thing in the UI that answers "what does this change?", so a row
  // added without one is a row nobody can use.
  const hinted = new Set((SHEET.match(/const LIV_ROW_HINT = \{([\s\S]*?)\n\};/)[1]
    .match(/^\s{2}([A-Za-z0-9]+):/gm) || []).map((k) => k.trim().replace(":", "")));
  const rows = new Set([...SHEET.matchAll(/(?:color|pill)Row\("[^"]*",\s*"([A-Za-z0-9]+)"/g)].map((m) => m[1]));
  // The mark rows are named by LiveryTex.markSlots, not literally here.
  for (const k of ["logo", "logo2", "logo3"]) rows.add(k);
  const missing = [...rows].filter((k) => !hinted.has(k)).sort();
  assert.deepEqual(missing, [], "editor rows with no LIV_ROW_HINT entry");
});
