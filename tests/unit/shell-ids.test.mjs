// shell-ids — the shell<->JS id contract, which nothing checked until now.
//
// `js/game.js` defines `const $ = (id) => document.getElementById(id)` and
// hands it out on the G facade, so most modules reach the DOM through
// `$("some-id")`. `$` returns null for an id that is not there, and the
// overwhelming majority of call sites dereference immediately —
// `$("mb-race").onclick = ...` — so a renamed shell id is a TypeError inside an
// IIFE, not a no-op. Tags are `defer`, so the DOM is always parsed by then:
// this fires on a rename, never on a race.
//
// The project had already found this and guarded ONE call —
// js/game.js: "Optional markup must not turn one missing screen into a
// whole-app boot failure" — while the primary menu buttons beside it went
// unguarded. This finishes it.
//
// It has to be STATIC. tools/lib/game-vm.cjs manufactures an element for any
// id on demand (it must, or game.js could not boot headlessly), so the 248 VM
// tests are blind to this class by construction.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scan, RUNTIME_IDS } from "../../tools/check/shell-ids.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("every id the source looks up by name exists", () => {
  const { missing } = scan();
  assert.deepEqual(missing, [],
    "a lookup returns null and the call site almost certainly dereferences it — " +
    "restore the id, or add it to RUNTIME_IDS in tools/check/shell-ids.mjs with the reason");
});

test("the check actually resolves the shell, not an empty set", () => {
  // Anti-vacuity: an empty declared/read set would make the test above pass
  // while checking nothing, which is exactly how a guard rots.
  const { counts } = scan();
  assert.ok(counts.read > 300, `expected 300+ ids looked up, got ${counts.read}`);
  assert.ok(counts.declared > 500, `expected 500+ ids declared, got ${counts.declared}`);
});

test("a renamed shell id is caught", () => {
  // The failure this exists for, exercised on a scratch copy of the real tree
  // rather than trusted. Uses the mover's own idiom: prove the guard bites.
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "apex-shell-ids-"));
  try {
    fs.mkdirSync(path.join(tmp, "js"));
    fs.writeFileSync(path.join(tmp, "index.html"), '<div id="kept"></div>\n');
    fs.writeFileSync(path.join(tmp, "js", "a.js"), 'const $ = (id) => document.getElementById(id);\n$("kept").onclick = 1;\n$("gone").onclick = 1;\n');
    const { missing } = scan(tmp);
    assert.deepEqual(missing.map((m) => m.id), ["gone"],
      "an id read but never declared must be reported, and one that exists must not");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("every RUNTIME_IDS entry is still read, and carries a reason", () => {
  // A stale exemption is worse than none: it hides the next real break behind
  // an id nobody looks up any more.
  const { read } = scan();
  const unused = Object.keys(RUNTIME_IDS).filter((id) => !read.has(id));
  assert.deepEqual(unused, [], "RUNTIME_IDS exempts an id no source reads — drop the entry");
  for (const [id, why] of Object.entries(RUNTIME_IDS)) {
    assert.ok(typeof why === "string" && why.length > 12, `${id} needs a real reason, not a placeholder`);
  }
});

test("the ratcheted dynamic-read count matches the tree", () => {
  // Lookups whose id is built from a variable cannot be checked, only counted.
  // Same report-don't-guess contract tools/gen/move-tree.mjs uses for paths
  // assembled from separate segments.
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/ratchets.json"), "utf8"));
  const entry = data.tree.dynamicIdReads;
  assert.ok(entry, "dynamicIdReads must be a tree ratchet in tests/data/ratchets.json");
  const { counts } = scan();
  assert.ok(counts.dynamic <= (entry.ceiling ?? entry),
    `${counts.dynamic} dynamic id reads against a ceiling of ${entry.ceiling ?? entry} — ` +
    "each one is a lookup no static check can verify; convert it to a literal or raise the ceiling deliberately");
});
