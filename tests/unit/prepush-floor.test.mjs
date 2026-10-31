// prepush-floor.test.mjs — the faster, truer pre-push floor (orchestration review 2026-10-29, Part 1 findings 2-3, Part 2 findings 2 and 5).
// @doc tooling-fast generated-file mapping + sync-merge, pick-tests standalone/shared-UI specs + new-module checklist, preflip-probe, ready-gate advisory.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  GENERATED_FILES, GENERATED_SEED_TESTS, generatedOnlyPaths, isGenShellOnlyChange, selectSyncMerge, selectToolingFastChanged,
  stripGenShellBlocks, syncMergePaths, runToolingFast,
} from "../../tools/ci/tooling-fast.mjs";
import {
  NEW_MODULE_CHECKLIST, addedGlobals, extraSpecs, newModuleTriggers, sharedUiSpecs, standaloneSpecs,
} from "../../tools/ci/pick-tests.mjs";
import { preflipAdvisory, probeSteps, probeVerdictLine, runProbe } from "../../tools/ci/preflip-probe.mjs";

// Fixture paths built at runtime: docs-integrity scans string literals for files that must exist.
const fake = (...p) => p.join("/");
const matches = (text, re, msg) => assert.equal(re.test(String(text)), true, msg ?? `${re} did not match: ${String(text).slice(0, 200)}`);
const PROBE_REL = fake("js", "__probe_new_module.js");
const ALL = ["tests/unit/generated-docs.test.mjs", "tests/unit/docs-integrity.test.mjs", "tests/unit/load-order.test.mjs", fake("tests", "unit", "other.test.mjs")];
const sel = (changed, extra = {}) => selectToolingFastChanged(changed, { allFiles: ALL, scripts: {}, pinIndex: new Map(), ...extra });

test("stripGenShellBlocks drops @gen-shell regions, markers included, and keeps the rest", () => {
  const a = "x\n<!-- @gen-shell:scripts -->\n<script src=a.js></script>\n<!-- /@gen-shell:scripts -->\ny";
  const b = "x\n<!-- @gen-shell:scripts -->\n<script src=b.js></script>\n<script src=c.js></script>\n<!-- /@gen-shell:scripts -->\ny";
  assert.equal(stripGenShellBlocks(a), "x\ny");
  assert.ok(isGenShellOnlyChange(a, b));
  assert.ok(!isGenShellOnlyChange(a, b.replace("\ny", "\nz")), "an authored line outside the blocks is not generator output");
  const sw = "a\n// @gen-shell:sw-lazy-agent\n'x',\n// /@gen-shell:sw-lazy-agent\nb";
  assert.equal(stripGenShellBlocks(sw), "a\nb");
});

test("generatedOnlyPaths: always-generated files are dropped; index.html only when the diff is inside @gen-shell", () => {
  const pairs = {
    "index.html": { before: "a\n<!-- @gen-shell:css -->\nold\n<!-- /@gen-shell:css -->", after: "a\n<!-- @gen-shell:css -->\nnew\n<!-- /@gen-shell:css -->" },
    "sw.js": { before: "a\n", after: "a\nauthored();\n" },
  };
  const got = generatedOnlyPaths(["index.html", "sw.js", "js/roster.js", "tests/data/impact-map.json", fake("js", "other.js")], { filePairs: pairs });
  assert.deepEqual(got.sort(), ["index.html", "js/roster.js", "tests/data/impact-map.json"]);
  for (const k of Object.keys(GENERATED_FILES)) assert.ok(GENERATED_FILES[k].source, `${k} names its source`);
});

test("a generated-only diff selects gen:check + the docs tests, not the whole floor", () => {
  const r = sel(["tests/data/impact-map.json", "docs/agent-index.json", "js/roster.js"]);
  assert.equal(r.reason, "generated-only");
  assert.equal(r.genCheck, true);
  assert.deepEqual(r.files, GENERATED_SEED_TESTS.filter((f) => ALL.includes(f)));
  assert.ok(r.files.length < ALL.length);
});

test("index.html with only gen-shell changes does not widen; with an authored line it still does", () => {
  const blocks = (x) => `h\n<!-- @gen-shell:scripts -->\n${x}\n<!-- /@gen-shell:scripts -->`;
  const ok = sel(["index.html"], { filePairs: { "index.html": { before: blocks("a"), after: blocks("b") } } });
  assert.equal(ok.reason, "generated-only");
  const authored = sel(["index.html"], {
    filePairs: { "index.html": { before: blocks("a"), after: blocks("a") + "\n<div id=new></div>" } },
    fileDiffs: { "index.html": "+<div id=new></div>\n" },
  });
  assert.equal(authored.reason, "tracked", "an authored shell edit stays fail-safe");
});

test("a generated file beside an authored source keeps the authored selection and adds gen:check", () => {
  const r = sel(["tests/data/impact-map.json", "tools/manifest.cjs"]);
  assert.equal(r.reason, "tracked", "manifest.cjs is authored and widens on its own merits");
  assert.equal(r.genCheck, true);
});

test("syncMergePaths: a pure tip merge is a sync; a hand-resolved merge and a plain commit are not", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-merge-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-q", "-b", "tip"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
    fs.writeFileSync(path.join(dir, "a.txt"), "1\n"); git("add", "."); git("commit", "-qm", "base");
    git("checkout", "-qb", "work");
    fs.writeFileSync(path.join(dir, "mine.txt"), "m\n"); git("add", "."); git("commit", "-qm", "mine");
    assert.equal(syncMergePaths(dir, { tipRef: "tip" }), null, "a plain commit is not a sync");
    git("checkout", "-q", "tip");
    fs.writeFileSync(path.join(dir, "a.txt"), "2\n"); fs.writeFileSync(path.join(dir, "b.txt"), "b\n"); git("add", "."); git("commit", "-qm", "tip moves");
    git("checkout", "-q", "work"); git("merge", "-q", "--no-edit", "tip");
    assert.deepEqual(syncMergePaths(dir, { tipRef: "tip" }).sort(), ["a.txt", "b.txt"]);
    assert.equal(syncMergePaths(dir, { tipRef: "work" }), null, "a HEAD already on the deploy branch (the tip is itself a merge) is not a sync");
    fs.writeFileSync(path.join(dir, "dirty.txt"), "x\n");
    assert.equal(syncMergePaths(dir, { tipRef: "tip" }), null, "an untracked edit is authored work");
    fs.rmSync(path.join(dir, "dirty.txt"));
    // a merge commit that also edits a file the tip did not give it is authored work
    fs.writeFileSync(path.join(dir, "a.txt"), "hand\n"); git("add", "."); git("commit", "-q", "--amend", "--no-edit");
    assert.equal(syncMergePaths(dir), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("selectSyncMerge: gen:check + docs-integrity only", () => {
  const r = selectSyncMerge(["a", "b", "c"], { allFiles: ALL });
  assert.equal(r.reason, "sync-merge");
  assert.equal(r.genCheck, true);
  assert.equal(r.changed, 3);
  assert.deepEqual([...r.files].sort(), [...GENERATED_SEED_TESTS].sort());
});

test("--quiet ends a red run with the failing file names and the log path", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quiet-red-"));
  const bad = path.join(dir, "bad.test.mjs");
  fs.writeFileSync(bad, 'import t from "node:test"; import a from "node:assert"; t("x", () => a.equal(1, 2));\n');
  const logPath = path.join(dir, "run.log");
  const seen = [];
  const orig = console.log;
  console.log = (m) => seen.push(String(m));
  try { await runToolingFast([bad], { quiet: true, logPath, localTimingsPath: null, timings: {} }); } finally { console.log = orig; fs.rmSync(dir, { recursive: true, force: true }); }
  const text = seen.join("\n");
  matches(text, /failing files: .*bad\.test\.mjs/);
  matches(text, /log: .*run\.log/);
  const named = text.search(/failing files:/), verdict = text.search(/= run failed/);
  assert.equal(named >= 0 && named < verdict, true, "named before the verdict line");
});

test("standaloneSpecs names a spec that addScriptTag-loads a changed module (#4188)", () => {
  const specs = { "photo-studio.spec.js": 'await tab.addScriptTag({ url: "/js/ui/photo-studio.js" });', "other.spec.js": "// js/ui/photo-studio.js mentioned in a comment only" };
  const r = standaloneSpecs(["js/ui/photo-studio.js"], { specsDir: "x", read: (n) => specs[n], });
  assert.deepEqual(r, []);   // readdir of the fake dir fails closed
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "specs-"));
  try {
    for (const [n, t] of Object.entries(specs)) fs.writeFileSync(path.join(dir, n), t);
    const got = standaloneSpecs(["js/ui/photo-studio.js", fake("js", "other.js")], { specsDir: dir });
    assert.deepEqual(got, [{ spec: "tests/specs/photo-studio.spec.js", module: "js/ui/photo-studio.js" }]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the real tree: photo-studio.js reaches photo-studio.spec.js; the shared UI layer reaches the menu specs (#4194)", () => {
  assert.ok(extraSpecs(["js/ui/photo-studio.js"]).some((r) => r.spec === "tests/specs/photo-studio.spec.js"));
  const ui = sharedUiSpecs(["js/ui/modal.js"]).map((r) => r.spec);
  assert.deepEqual(["tests/specs/menu-keyboard.spec.js", "tests/specs/ui-scale.spec.js"].filter((x) => ui.includes(x)).length, 2);
  assert.deepEqual(sharedUiSpecs(["js/car/parts.js"]), []);
  for (const r of extraSpecs(["js/ui/modal.js"])) assert.ok(fs.existsSync(path.join(process.cwd(), r.spec)), `${r.spec} exists`);
});

test("new-module checklist: triggers on an added js module, a tools/perf script or an added global", () => {
  assert.deepEqual(newModuleTriggers([fake("js", "ui", "new.js"), fake("docs", "x.md"), fake("tools", "perf", "p.mjs")]).modules, [fake("js", "ui", "new.js"), fake("tools", "perf", "p.mjs")]);
  assert.deepEqual(newModuleTriggers([fake("docs", "x.md")]), { modules: [], globals: [] });
  assert.deepEqual(addedGlobals("+const Foo = (() => {\n+  const inner = (x) => 1;\n+window.Bar = Foo;\n-const Old = (function"), ["Foo", "Bar"]);
  const text = NEW_MODULE_CHECKLIST.join("\n");
  for (const k of ["boot-load-budget", "LAZY", "race-session-lazy", "results-cam", "ui-sheets-audit", "game-ctx.d.ts", "agent-index", "agentHelp", "policies.json"]) matches(text, new RegExp(k));
  const rule = fs.readFileSync(path.join(process.cwd(), ".claude/rules/game-code.md"), "utf8");
  for (const k of ["boot-load-budget", "race-session-lazy", "results-cam", "ui-sheets-audit", "game-ctx.d.ts", "agent-index", "policies.json"]) matches(rule, new RegExp(k), `game-code.md carries ${k}`);
});

test("pick-tests prints the checklist for a new js module on the command line", () => {
  const artifacts = path.join(process.cwd(), "artifacts"); fs.mkdirSync(artifacts, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(artifacts, "pick-tests-cli-"));
  try {
    for (const dir of ["tools/ci", "tools/lib", "js"]) fs.mkdirSync(path.join(fixture, dir), { recursive: true });
    for (const rel of ["tools/ci/pick-tests.mjs", "tools/lib/changed-files.mjs"])
      fs.copyFileSync(path.join(process.cwd(), rel), path.join(fixture, rel));
    fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ scripts: {} }));
    fs.writeFileSync(path.join(fixture, PROBE_REL), '\"use strict\";\nconst ProbeNew = (() => ({}))();\n');
    const out = execFileSync("node", ["tools/ci/pick-tests.mjs", PROBE_REL], { cwd: fixture, encoding: "utf8" });
    matches(out, /NEW MODULE \/ GLOBAL/);
    matches(out, /boot-load-budget/);
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

test("probeSteps: ratchets, fixture audit, assert-pin ratchet, then units (dropped by --skip-units)", () => {
  assert.deepEqual(probeSteps().map((s) => s.name), ["ratchets", "fixture-consumer-audit", "assert-pin ratchet", "units"]);
  assert.deepEqual(probeSteps({ skipUnits: true }).map((s) => s.name), ["ratchets", "fixture-consumer-audit", "assert-pin ratchet"]);
  const units = probeSteps().at(-1).cmd.join(" ");
  matches(units, /--changed/);
  matches(units, /--no-sync-shortcut/, "the probe's merge HEAD must not select the sync shortcut");
});

test("runProbe: merges the tip, runs every step, reports red steps and a conflict, and removes the worktree", () => {
  const calls = [];
  const mk = (merge, failName) => (cmd, args, opts = {}) => {
    calls.push([cmd, ...args].join(" "));
    if (cmd === "git" && args[0] === "rev-parse") return { status: 0, stdout: `${args[1].includes("origin") ? "t" : "h"}1234567890\n`, stderr: "" };
    if (cmd === "git" && args[0] === "merge" && args[1] !== "--abort") return { status: merge, stdout: "", stderr: "" };
    if (cmd === "git" && args[0] === "diff") return { status: 0, stdout: fake("js", "other.js") + "\n", stderr: "" };
    if (cmd === "node" && args.some((a) => a.includes("ratchets.mjs")) && failName) return { status: 1, stdout: "10 over its ceiling", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  const green = runProbe({ head: "hhh", skipUnits: true, exec: mk(0, false), root: fs.mkdtempSync(path.join(os.tmpdir(), "probe-")) });
  assert.equal(green.state, "passed");
  assert.equal(green.steps.length, 3);
  assert.ok(calls.some((c) => c.startsWith("git worktree remove")), "worktree removed");
  const red = runProbe({ head: "hhh", skipUnits: true, exec: mk(0, true), root: fs.mkdtempSync(path.join(os.tmpdir(), "probe-")) });
  assert.equal(red.state, "failed");
  matches(red.steps[0].tail, /over its ceiling/);
  matches(probeVerdictLine(red), /^= preflip failed - ratchets red on the merge/);
  const conflict = runProbe({ head: "hhh", skipUnits: true, exec: mk(1, false), root: fs.mkdtempSync(path.join(os.tmpdir(), "probe-")) });
  assert.equal(conflict.state, "conflict");
  assert.deepEqual(conflict.conflicts, [fake("js", "other.js")]);
  matches(probeVerdictLine(conflict), /^= preflip conflict/);
});

test("preflipAdvisory: absent, stale and current receipts are one advisory line each, never an error", () => {
  matches(preflipAdvisory(null, "abc", 7), /^advisory: no pre-flip probe .*--pr 7/);
  matches(preflipAdvisory({ head: "aaaaaaaa11", state: "passed", steps: [], tip: "t" }, "bbbbbbbb22", 7), /not head bbbbbbbb/);
  const cur = preflipAdvisory({ head: "abc", tip: "def", state: "failed", steps: [{ name: "ratchets", ok: false }] }, "abc", 7);
  matches(cur, /^advisory: preflip failed - ratchets red/);
});
