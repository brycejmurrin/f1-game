// cross-file-paths — every relative reference resolves to a file that exists.
//
// The tests/ split (AUDIT-SYNTHESIS §R2) is one commit that rewrites every path
// in the repo's test tree. Its risk is not a WRONG rewrite — it is a MISSED
// one, and R2's own lockstep marks five misses ⚠ "no guard turns red". This is
// that guard, landed BEFORE the move rather than after it, because a check that
// arrives after the commit it was meant to protect has protected nothing.
//
// The silent class, concretely: `tools/fit-audit.mjs` and `tools/menu-fit.mjs`
// import `../tests/helpers/f1-api-mock.js` inside `try { … } catch { /* degrades */ }`.
// That catch is right at runtime and fatal to a move — afterwards the import
// fails forever, both tools quietly audit an empty data hub, and nothing goes
// red anywhere.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { referencesIn, audit } from "../../tools/check/cross-file-paths.mjs";

test("a static import is found", () => {
  const { refs } = referencesIn(`import { x } from "./helpers/fixtures.js";`, "a.js");
  assert.deepEqual(refs.map((r) => [r.kind, r.spec]), [["import", "./helpers/fixtures.js"]]);
});

test("a SWALLOWED dynamic import is found — the ⚠ case this exists for", () => {
  const src = `let m = null;
    try { ({ m } = await import("../tests/helpers/f1-api-mock.js")); } catch { /* degrades */ }`;
  const { refs } = referencesIn(src, "tools/fit-audit.mjs");
  assert.deepEqual(refs.map((r) => r.spec), ["../tests/helpers/f1-api-mock.js"]);
});

test("new URL(rel, import.meta.url) is found — the data-file shape a grep misses", () => {
  const src = `const geo = new URL("./data/f1-circuit-reference.geojson", import.meta.url);`;
  const { refs } = referencesIn(src, "tests/specs/f1-track-accuracy.spec.js");
  assert.deepEqual(refs.map((r) => [r.kind, r.spec]), [["new URL", "./data/f1-circuit-reference.geojson"]]);
});

test("require() in a .cjs file is found", () => {
  // No label: docs-integrity scans source text for path-shaped tokens, and a
  // made-up filename here is a dangling reference to it — correctly.
  const { refs } = referencesIn(`const m = require("../tools/manifest.cjs");`);
  assert.deepEqual(refs.map((r) => r.spec), ["../tools/manifest.cjs"]);
});

test("bare and node: specifiers are NOT relative references", () => {
  const src = `import fs from "node:fs";\nimport { test } from "@playwright/test";`;
  assert.deepEqual(referencesIn(src, "a.js").refs, []);
});

test("an import inside a STRING is not a reference", () => {
  // Not hypothetical: tests/unit/assert-audit.test.mjs and tests/unit/test-observed.test.mjs
  // both build fixtures out of source text containing import statements. A regex
  // reports those as real, and a guard with false positives gets switched off.
  const src = 'const fixture = `import { test } from "./nowhere-at-all.js";`;';
  assert.deepEqual(referencesIn(src, "a.js").refs, []);
});

test("it actually FAILS on a broken reference — anti-vacuity on the resolver", () => {
  // The whole guard is a resolver plus an existence check. If either silently
  // stopped working, the tree below would read clean forever. So: build the
  // exact shape R2 produces — a file that moved one directory deeper while its
  // "../" reference did not follow — and require a complaint.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xfp-"));
  try {
    fs.mkdirSync(path.join(dir, "tests", "specs"), { recursive: true });
    fs.mkdirSync(path.join(dir, "tools"), { recursive: true });
    fs.writeFileSync(path.join(dir, "tests", "helpers-that-moved.js"), "export const x = 1;\n");
    // moved into tests/specs/ but still says "./helpers-that-moved.js"
    fs.writeFileSync(path.join(dir, "tests", "specs", "a.spec.js"),
      `import { x } from "./helpers-that-moved.js";\n`);
    const rows = audit(dir);
    const broken = rows.flatMap((r) => (r.broken || []).map((b) => `${r.file}:${b.line} ${b.spec}`));
    assert.equal(broken.length, 1, `expected exactly one broken ref, got ${JSON.stringify(broken)}`);
    assert.match(broken[0], /helpers-that-moved\.js/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the real tree has no broken relative references", () => {
  const rows = audit();
  const broken = rows.flatMap((r) =>
    (r.broken || []).map((b) => `${r.file}:${b.line} ${b.kind} "${b.spec}"`));
  assert.deepEqual(broken, []);
});

test("every scanned file parses, and the scan is not empty", () => {
  // A parse failure drops a file's references silently, and an empty scan
  // reports a perfectly clean tree — both read as success.
  const rows = audit();
  assert.deepEqual(rows.filter((r) => r.parseError).map((r) => `${r.file}: ${r.parseError}`), []);
  const checked = rows.reduce((a, r) => a + (r.checked || 0), 0);
  assert.ok(checked > 100, `expected 100+ relative references in tests/ and tools/, got ${checked}`);
});
