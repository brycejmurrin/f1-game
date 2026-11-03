/* knowledge-retention.test.mjs — docs/notes keeps only what something reads.
 *
 * The rule (docs/plans/2026-11-03-agent-surface-reset.md §4.9, Bryce's grant
 * D-001): a note earns its place by being cited. tools/docs/knowledge-gc.mjs
 * is the one scanner; this file holds its verdict as a guard, on the REAL
 * clock on purpose — a note nobody cites turns red 21 days after its date with
 * no code change, and the cure is to cite it, archive it (`knowledge-gc.mjs
 * --apply`, or the weekly .github/workflows/knowledge-gc.yml PR) or, for the
 * grandfathered backlog, to leave it in tests/data/notes-uncited-allow.json,
 * which only shrinks. Same for the 40 KB cap and tests/data/notes-size-allow.json.
 *
 * Run: node --test tests/unit/knowledge-retention.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ROOT, DAYS, SIZE_CAP, SIZE_ALLOW, UNCITED_ALLOW, INDEX, REFUSED_PREFIX, KIND_REQUIRED_FROM,
  scan, header, renderIndex, demoteArchiveLinks, liveDocNoArchive, tracked,
} from "../../tools/docs/knowledge-gc.mjs";

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const files = tracked();
const r = scan({ files });
const name = (n) => `${n.file} (${n.date}, ${n.age} d)`;

test("the scan sees the notes tree and both allow-lists", () => {
  assert.ok(r.notes.length > 100, `only ${r.notes.length} notes scanned`);
  // Literal paths: tooling-fast's pin index reads string literals, so an allow-list edit selects this file, not the whole suite.
  assert.equal(SIZE_ALLOW, "tests/data/notes-size-allow.json");
  assert.equal(UNCITED_ALLOW, "tests/data/notes-uncited-allow.json");
  for (const f of [SIZE_ALLOW, UNCITED_ALLOW]) assert.ok(Array.isArray(JSON.parse(read(f))), `${f} must be a JSON array of docs/notes paths`);
  assert.equal(r.days, DAYS);
});

test(`no stale note: every docs/notes file is cited by a live file, younger than ${DAYS} days, or in ${UNCITED_ALLOW}`, () => {
  assert.deepEqual(r.stale.map(name), [],
    `uncited past the window — cite it from the doc, skill, tool or test that uses it, or archive it: node tools/docs/knowledge-gc.mjs --apply`);
});

test("hunt, survey, design-pass and audit notes are refused at any age unless cited", () => {
  assert.deepEqual(r.refused.map(name), [],
    `${REFUSED_PREFIX} names are narratives: their ranked table belongs in an issue or the PR body (archive with knowledge-gc.mjs --apply)`);
});

test(`a note is at most ${SIZE_CAP / 1024} KB unless ${SIZE_ALLOW} names it`, () => {
  assert.deepEqual(r.oversize.map((n) => `${n.file} (${(n.bytes / 1024).toFixed(0)} KB)`), [],
    "split the ledger by year or move the raw data under artifacts/; the allow-list is for the grandfathered set only");
});

test("a Re-measure-by date in the past fails: re-measure, or archive the note", () => {
  assert.deepEqual(r.overdue.map((n) => `${n.file} (Re-measure-by: ${n.remeasure})`), [],
    "the measured fact is older than its own expiry — re-measure and move the date, or archive");
});

test(`a note dated from ${KIND_REQUIRED_FROM} carries a Kind: line (measurement|incident|design|how-to|decision)`, () => {
  assert.deepEqual(r.missingKind.map((n) => n.file), [],
    "add a header line `Kind: <kind> · Re-measure-by: YYYY-MM-DD` under the title");
});

test("the allow-lists only shrink: an entry that is cited, pinned, under the cap or gone must be removed", () => {
  assert.deepEqual(r.allowStale.uncited, [], `${UNCITED_ALLOW}: these entries are cited now (or no longer exist) — drop them`);
  assert.deepEqual(r.allowStale.size, [], `${SIZE_ALLOW}: these entries are under ${SIZE_CAP / 1024} KB now (or no longer exist) — drop them`);
  const dup = (xs) => xs.filter((x, i) => xs.indexOf(x) !== i);
  assert.deepEqual(dup(JSON.parse(read(UNCITED_ALLOW))), []);
  assert.deepEqual(dup(JSON.parse(read(SIZE_ALLOW))), []);
});

test(`${INDEX} is what knowledge-gc.mjs --index generates (the notes block is not hand-edited)`, () => {
  const cur = read(INDEX);
  assert.equal(renderIndex(cur, r.notes), cur, `run: node tools/docs/knowledge-gc.mjs --index`);
});

test(`${INDEX}'s notes block is merge-stable: rows sorted by name, no volatile count line (#4608)`, () => {
  const block = read(INDEX).split("<!-- gen:notes -->")[1].split("<!-- /gen:notes -->")[0];
  const names = [...block.matchAll(/^\| \[([^\]]+)\]\(notes\//gm)].map((m) => m[1]);
  assert.ok(names.length > 10);
  assert.deepEqual(names, [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), "rows are name-sorted so two PRs adding notes rarely touch adjacent lines");
  assert.doesNotMatch(block, /\d+ live notes/, "a note count changes in every PR and conflicts them all");
});

// ---------------------------------------------------------------------------
// docs/DECISIONS.md — the D-NNN ledger

test("every D-NNN cited anywhere exists in docs/DECISIONS.md, ids are unique and sequential, and each row's cited-by paths exist", () => {
  const ledger = read("docs/DECISIONS.md");
  const rows = ledger.split("\n").filter((l) => /^\| D-\d{3} \|/.test(l));
  const ids = rows.map((l) => /^\| (D-\d{3}) \|/.exec(l)[1]);
  assert.ok(ids.length >= 1, "the ledger holds no rows");
  assert.deepEqual(ids, ids.map((_, i) => `D-${String(i + 1).padStart(3, "0")}`), "ids are D-001… in order with no gap or duplicate; never renumber, append");
  const have = new Set(ids);
  const tracks = new Set(files);
  for (const l of rows) {
    const cells = l.split("|").slice(1, -1).map((c) => c.trim());
    assert.equal(cells.length, 7, `${cells[0]}: seven columns (id | date | words | scope | via | cited by | superseded by)`);
    for (const tok of cells[5].split(",").map((s) => s.trim()).filter((s) => /^[\w.-]+\/[\w./-]+$/.test(s)))
      assert.ok(tracks.has(tok), `${cells[0]} cites ${tok}, which is not a tracked file`);
    for (const m of cells[6].matchAll(/D-\d{3}/g)) assert.ok(have.has(m[0]), `${cells[0]} is superseded by ${m[0]}, which has no row`);
  }
  const missing = [];
  for (const f of files) {
    if (f === "docs/DECISIONS.md" || !/\.(?:md|mdc|mjs|cjs|js|sh|py|json|ya?ml|html|css)$/.test(f) || /^node_modules\//.test(f)) continue;
    let text; try { text = read(f); } catch { continue; }
    for (const m of text.matchAll(/(?<![A-Za-z0-9_-])D-(\d{3})(?![A-Za-z0-9])/g)) if (!have.has(`D-${m[1]}`)) missing.push(`${f}: D-${m[1]}`);
  }
  assert.deepEqual([...new Set(missing)], [], "a D-NNN is cited that the ledger does not hold");
});

// ---------------------------------------------------------------------------
// The pure core, on fixtures with a pinned clock

test("header() reads Kind:, Re-measure-by: and the Supersedes pin from the first lines", () => {
  assert.deepEqual(header("# T\n\nKind: measurement · Re-measure-by: 2026-12-01\n"), { kind: "measurement", remeasure: "2026-12-01", pinned: false });
  assert.deepEqual(header("# T\n**Kind:** how-to\n\nSupersedes: [x](X.md)\n"), { kind: "how-to", remeasure: null, pinned: true });
  assert.deepEqual(header("# T\nno header\n"), { kind: null, remeasure: null, pinned: false });
});

test("scan() with a pinned clock: uncited past the window is stale, a citation or the allow-list clears it, a refused prefix ignores age", () => {
  const note = r.notes.find((n) => !REFUSED_PREFIX.test(n.base) && /\d{4}-\d{2}-\d{2}/.test(n.base));
  assert.ok(note, "a dated note to test with");
  const far = "2099-01-01";
  const alone = scan({ today: far, files: [note.file], corpus: "", sizeAllow: [], uncitedAllow: [] });
  assert.deepEqual(alone.stale.map((n) => n.file), [note.file]);
  assert.deepEqual(scan({ today: far, files: [note.file], corpus: `see ${note.base}`, sizeAllow: [], uncitedAllow: [] }).stale, []);
  assert.deepEqual(scan({ today: far, files: [note.file], corpus: "", sizeAllow: [], uncitedAllow: [note.file] }).stale, []);
  assert.deepEqual(scan({ today: note.date, files: [note.file], corpus: "", sizeAllow: [], uncitedAllow: [] }).stale, [], "inside the window is not stale");
  const hunt = r.notes.find((n) => REFUSED_PREFIX.test(n.base));
  if (hunt) {
    assert.deepEqual(scan({ today: hunt.date, files: [hunt.file], corpus: "", sizeAllow: [], uncitedAllow: [] }).refused.map((n) => n.file), [hunt.file]);
    assert.deepEqual(scan({ today: hunt.date, files: [hunt.file], corpus: hunt.base, sizeAllow: [], uncitedAllow: [] }).refused, []);
  }
  assert.deepEqual(scan({ today: far, files: [note.file], corpus: note.base, sizeAllow: [], uncitedAllow: [note.file] }).allowStale.uncited, [note.file], "a cited allow-list entry is reported for removal");
});

test("demoteArchiveLinks() turns a live doc's link into archive into plain text and leaves other links alone", () => {
  // Fixture paths are concatenated so docs-integrity's path scan does not read them as real files.
  const D = "docs/", bare = `${D}archive/notes/N.md`;
  const out = demoteArchiveLinks(`see [the plan](../archive/plans/P.md) and [live](../TESTING.md) and \`${bare}\``, `${D}plans`);
  assert.equal(out, "see the plan (`P.md`, archived) and [live](../TESTING.md) and `N.md (archived)`");
  assert.equal(demoteArchiveLinks("[`P.md`](../archive/plans/P.md)", `${D}plans`), "`P.md` (archived)");
  assert.ok(liveDocNoArchive(`${D}plans/x.md`) && liveDocNoArchive(`${D}TESTING.md`));
  assert.ok(!liveDocNoArchive(`${D}notes/x.md`) && !liveDocNoArchive(`${D}README.md`) && !liveDocNoArchive(`${D}NOTES-INDEX.md`) && !liveDocNoArchive("AGENTS.md"));
});
