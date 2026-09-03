// pick-tests — the selector's contract (--json shape, --since ref handling).
// test-groups.test.mjs covers the output vocabulary; this file guards upstream.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DEPLOY_BRANCH, RULES } from "../../tools/pick-tests.mjs";

const require = createRequire(import.meta.url);
const MANIFEST = require("../../tools/manifest.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Every file the manifest loads, across all rosters — the selector's input space.
const manifestFiles = () => [
  ...MANIFEST.FULL, ...Object.values(MANIFEST.DEFERRED).flat(), ...MANIFEST.LAZY_AGENT,
  ...MANIFEST.LAZY_RACE, ...MANIFEST.LAZY_SCENERY, ...MANIFEST.LAZY_DATA, ...MANIFEST.LAZY_NET,
];
const run = (...args) =>
  execFileSync("node", ["tools/pick-tests.mjs", "--json", ...args],
               { cwd: ROOT, encoding: "utf8" });
const json = (...args) => JSON.parse(run(...args));

test("--json reports a reason CI can branch on, not prose", () => {
  const r = json("js/game/hud.js");
  assert.equal(r.reason, "matched");
  assert.ok(Array.isArray(r.files) && Array.isArray(r.groups));
  for (const g of r.groups) {
    assert.equal(typeof g.group, "string");
    assert.equal(g.script, `test:${g.group}`);
    assert.equal(typeof g.because, "string");
  }
});

test("a file no rule claims reports 'unmatched', not an empty success", () => {
  // The distinction CI depends on: "nothing changed, run nothing" and "things
  // changed but I cannot route them, run EVERYTHING" are opposite instructions
  // and the prose output renders both as a sentence.
  const r = json("spike/README.md");
  assert.equal(r.reason, "unmatched");
  assert.deepEqual(r.groups, []);
});

test("--since takes a REF, and does not read it as a path", () => {
  // The regression this pins. Before the fix `files` was ["HEAD"] — the ref
  // itself — and `reason` was "unmatched", i.e. "nothing to run" for a diff
  // that certainly had files in it.
  //
  // HEAD, not HEAD~1: CI's guards job checks out SHALLOW (`actions/checkout@v4`
  // with no fetch-depth), where HEAD~1 does not exist and git fails with
  // "ambiguous argument". HEAD resolves in every clone and pins the same
  // property — the ref must not end up in the FILE list.
  const r = json("--since", "HEAD");
  assert.ok(!r.files.includes("HEAD"), "the ref leaked into the file list");
  const real = execFileSync("git", ["diff", "--name-only", "HEAD"],
                            { cwd: ROOT, encoding: "utf8" }).trim();
  const expected = real ? real.split("\n").filter(Boolean) : [];
  assert.deepEqual(r.files.slice().sort(), expected.slice().sort());
});

test("explicit paths still win over every other mode", () => {
  const r = json("js/car/parts.js");
  assert.deepEqual(r.files, ["js/car/parts.js"]);
});

test("a path in FIRST argv position survives the --since filter", () => {
  // `argv.indexOf("--since")` is -1 when the flag is absent, so the original
  // `n !== since + 1` excluded index 0 UNCONDITIONALLY: the documented
  // `pick-tests.mjs <paths>` form lost its first path, and a single path lost
  // all of them and fell through to the git-diff default — a different
  // question, answered confidently. Every other case in this file hides it,
  // because run() puts --json at index 0; here the path IS argv[0].
  const r = JSON.parse(execFileSync(
    "node", ["tools/pick-tests.mjs", "js/car/parts.js", "js/game/hud.js", "--json"],
    { cwd: ROOT, encoding: "utf8" }));
  assert.deepEqual(r.files, ["js/car/parts.js", "js/game/hud.js"]);
});

test("the default diff base is the DEPLOY branch, which pages.yml names", () => {
  // main is a stale diverged fork here, so merge-basing against it returns an
  // ancient commit and the changed-file set balloons to most of the repo —
  // the tool giving up silently, dressed as an answer. Asserting the constant
  // against pages.yml is what keeps the two from drifting apart.
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/pages.yml"), "utf8");
  const m = yml.match(/branches:\s*\[\s*([^\]\s]+)\s*\]/);
  assert.ok(m, "pages.yml no longer declares a deploy branch in the expected form");
  assert.equal(DEPLOY_BRANCH, m[1],
    "tools/pick-tests.mjs DEPLOY_BRANCH disagrees with .github/workflows/pages.yml");
});

test("parked tracks-visual lives under tests/manual and is never a gate", () => {
  // No golden baselines: the suite self-skips every circuit and used to report
  // vacuous green via a dedicated npm group. It now lives under tests/manual/
  // (playwright testIgnore) so pick-tests and package.json cannot recommend it.
  const manualVisual = path.join(ROOT, "tests", "manual", "tracks-visual.spec.js");
  assert.ok(fs.existsSync(manualVisual),
    "tracks-visual.spec.js must live under tests/manual/");
  assert.equal(RULES.some(([, groups]) => groups.includes("visual")), false,
    "tools/pick-tests.mjs must not recommend a visual group");
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok(!pkg.scripts["test:visual"],
    "package.json must not expose test:visual while baselines are absent");
});

test("every manifest file matches at least one pick-tests rule", () => {
  // The rules are path REGEXES and the tree is about to move
  // (docs/research/TREE-RESTRUCTURE-2026-09.md §Phase 2). A file that moves out
  // from under every rule is a change nobody is told to test — the failure mode
  // this pins. Checked against the MANIFEST rather than a directory walk, so the
  // input space is the load order itself and not whatever happens to be on disk.
  const files = manifestFiles();
  assert.ok(files.length > 150, `manifest lists only ${files.length} files — the roster read broke`);
  const orphans = files.filter((f) => !RULES.some(([re]) => re.test(f)));
  assert.deepEqual(orphans, [],
    "a manifest file matches no pick-tests rule — add or widen a RULE so a change there is routed somewhere");
});

// Files that ONLY the two blanket rules (tiny / tooling-fast) reach: no rule
// names them or their directory, so an edit there is told "boot the page" and
// nothing topical. Frozen as a baseline in the ratchet idiom — the list may
// shrink (a file gains a rule: delete its row here in the same commit) and
// must not grow (a new or MOVED file that falls off every specific rule is
// exactly the regression the tree move can cause). The Phase 2 window
// rewrites RULES to directory rules, which should empty this list.
const BLANKET_ONLY = [
  "js/core/mat4.js",
  "js/roster.js",
  "js/render/lamp-chunks.js",
  "js/render/gltf.js",
  "js/car/driver-ratings.js",
  "js/track/models.js",
  "js/track/themes.js",
  "js/track/landmark-kit.js",
  "js/track/circuit-kit.js",
  "js/game/light-store.js",
  "js/physics/ai-drive.js",
  "js/game/css-zoom.js",
  "js/game/settings-nav.js",
  "js/game/skidmarks.js",
  "js/game/loop-health.js",
  "js/game/gfx-debug.js",
];

test("files reached only by the blanket rules are the frozen baseline — no new ones", () => {
  const specific = RULES.slice(2);          // the two "always" rules are excluded on purpose
  const blanketOnly = manifestFiles().filter((f) => !specific.some(([re]) => re.test(f)));
  const grew = blanketOnly.filter((f) => !BLANKET_ONLY.includes(f));
  assert.deepEqual(grew, [],
    "a manifest file is routed ONLY by the blanket tiny/tooling-fast rules — give it a specific RULE " +
    "(a moved file that fell off its old rule shows up here first)");
  const gone = BLANKET_ONLY.filter((f) => !blanketOnly.includes(f));
  assert.deepEqual(gone, [],
    "a baselined file now has a specific rule (or left the manifest) — delete its row from BLANKET_ONLY");
});
