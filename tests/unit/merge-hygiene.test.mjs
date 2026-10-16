// merge-hygiene.test.mjs — ratchets.json + groups.json stay one-entry-per-line
// and stably sorted so two PRs adding different entries auto-merge.
// Run: node --test tests/unit/merge-hygiene.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  check, renderRatchets, renderGroups, normalizeRatchets, normalizeGroups,
  sortToolingFast, RATCHETS, GROUPS,
} from "../../tools/check/merge-hygiene.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("committed ratchets.json and groups.json match the normalizer", () => {
  assert.deepEqual(check(), [],
    "run: node tools/check/merge-hygiene.mjs --fix  (then gen-test-groups if groups moved)");
});

test("normalizeRatchets sorts file and metric keys", () => {
  const raw = {
    _doc: "x",
    files: {
      "fixture/z.js": { lines: 2, codeLines: 1 },
      "fixture/a.js": { lines: 3 },
    },
    tree: { waitForTimeout: 1, bareCatches: { ceiling: 2, slack: 0 } },
  };
  const n = normalizeRatchets(raw);
  assert.deepEqual(Object.keys(n.files), ["fixture/a.js", "fixture/z.js"]);
  assert.deepEqual(Object.keys(n.files["fixture/z.js"]), ["codeLines", "lines"]);
  assert.deepEqual(Object.keys(n.tree), ["bareCatches", "waitForTimeout"]);
  assert.equal(renderRatchets(raw), renderRatchets(n));
});

test("sortToolingFast glues // notes to the next path, then sorts by path", () => {
  const entries = [
    "// note for zebra",
    "fixture/zebra.test.mjs",
    "// note for alpha",
    "// more alpha",
    "fixture/alpha.test.mjs",
    "fixture/mid.test.mjs",
  ];
  assert.deepEqual(sortToolingFast(entries), [
    "// note for alpha",
    "// more alpha",
    "fixture/alpha.test.mjs",
    "fixture/mid.test.mjs",
    "// note for zebra",
    "fixture/zebra.test.mjs",
  ]);
});

test("normalizeGroups sorts group keys, files, flags, and toolingFast", () => {
  const raw = {
    "//": ["doc"],
    toolingFast: [
      "// z",
      "fixture/z.test.mjs",
      "fixture/a.test.mjs",
    ],
    groups: {
      "test:z": { kind: "node", files: ["b.mjs", "a.mjs"] },
      "test:a": { kind: "browser", flags: ["--b", "--a"], files: ["y.spec.js", "x.spec.js"] },
    },
  };
  const n = normalizeGroups(raw);
  assert.deepEqual(Object.keys(n.groups), ["test:a", "test:z"]);
  assert.deepEqual(n.groups["test:a"].files, ["x.spec.js", "y.spec.js"]);
  assert.deepEqual(n.groups["test:a"].flags, ["--a", "--b"]);
  assert.deepEqual(n.groups["test:z"].files, ["a.mjs", "b.mjs"]);
  assert.deepEqual(n.toolingFast, [
    "fixture/a.test.mjs",
    "// z",
    "fixture/z.test.mjs",
  ]);
  assert.equal(renderGroups(raw), renderGroups(n));
});

test("manifest CIRCUITS lists one id per line (section order preserved)", () => {
  // Packed multi-id lines made two classic-circuit PRs edit the same hunk.
  const src = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");
  const block = src.match(/const CIRCUITS = \[([\s\S]*?)\];/);
  assert.ok(block, "CIRCUITS array not found");
  const packed = block[1].split("\n").filter((l) => {
    const ids = l.match(/"[a-z0-9_]+"/g);
    return ids && ids.length > 1;
  });
  assert.deepEqual(packed, [],
    "CIRCUITS must be one id per line — found multi-id lines:\n" + packed.join("\n"));
});

test("on-disk ratchets render is byte-stable under a second normalize", () => {
  const once = renderRatchets(JSON.parse(fs.readFileSync(RATCHETS, "utf8")));
  const twice = renderRatchets(JSON.parse(once));
  assert.equal(once, twice);
  const g1 = renderGroups(JSON.parse(fs.readFileSync(GROUPS, "utf8")));
  const g2 = renderGroups(JSON.parse(g1));
  assert.equal(g1, g2);
});
