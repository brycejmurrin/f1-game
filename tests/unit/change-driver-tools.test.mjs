"use strict";
// change-driver-tools — contracts for the verification drivers
// (tools/ci/verify-change.mjs, tools/ci/bump-cache.mjs, tools/ci/test-honesty.mjs).
//
// These three exist to make AGENTS.md rules executable (one browser group per
// batch, bump-is-last-edit, no silent skips). A driver that drifts from the
// rules it encodes is worse than no driver — an agent will trust it INSTEAD
// of the prose. So the rules are asserted here, against the real CLIs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const run = (args, opts = {}) => {
  try {
    return { out: execFileSync("node", args, { cwd: ROOT, encoding: "utf8", ...opts }), status: 0 };
  } catch (e) {
    return { out: (e.stdout || "") + (e.stderr || ""), status: e.status };
  }
};

// ── verify-change --plan ─────────────────────────────────────────────────────

test("verify-change routes a circuit edit to verify-track and graph.js to graph-parity", () => {
  const plan = JSON.parse(run(["tools/ci/verify-change.mjs", "--plan",
    "js/circuits/monza.js", "js/track/scenery/graph.js"]).out);
  assert.deepEqual(plan.fast.verifyTrack, ["monza"]);
  assert.equal(plan.fast.graphParity, true);
  assert.equal(plan.fast.cacheCheck, true);
  assert.equal(plan.sweepsBeforeDeployPush, true, "track+circuit changes must carry the union-sweeps reminder");
});

test("verify-change batches carry AT MOST ONE browser group each (the 120s-timeout rule)", () => {
  // game.js fans out to the widest selection this repo has; if the rule holds
  // there it holds everywhere.
  const plan = JSON.parse(run(["tools/ci/verify-change.mjs", "--plan", "js/game.js", "index.html", "css/hud.css"]).out);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const isBrowser = (g) => /run-playwright/.test(pkg.scripts[`test:${g}`]);
  assert.ok(plan.batches.length >= 1, "a game.js change must select browser groups");
  for (const batch of plan.batches) {
    const browsers = batch.filter(isBrowser);
    assert.ok(browsers.length <= 1, `batch ${JSON.stringify(batch)} pairs browser groups: ${browsers.join(",")}`);
    assert.ok(!batch.includes("tooling-fast"), "tooling-fast is phase 1's inline gate — batching it runs it twice");
  }
});

test("verify-change batches are size 1 (sequential groups, browser or node)", () => {
  const plan = JSON.parse(run(["tools/ci/verify-change.mjs", "--plan", "js/game.js", "tools/ci/test-bg.mjs"]).out);
  assert.ok(plan.batches.length >= 1);
  for (const batch of plan.batches) {
    assert.equal(batch.length, 1,
      `batch ${JSON.stringify(batch)} bunches groups — sequential default is one group per batch`);
  }
});

test("tooling-fast npm script uses the sequential runner", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.match(pkg.scripts["test:tooling-fast"], /tools\/ci\/tooling-fast\.mjs/,
    "test:tooling-fast must invoke tools/ci/tooling-fast.mjs (concurrency=1 + per-file logging)");
  assert.ok(fs.existsSync(path.join(ROOT, "tools/ci/tooling-fast.mjs")));
});

test("test-bg defaults to sequential (one concurrent group) unless --parallel", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/test-bg.mjs"), "utf8");
  assert.match(src, /--parallel/, "test-bg must expose --parallel for the old concurrent start");
  assert.match(src, /sequential|maxConcurrent|parallel \? PARALLEL_MAX : 1/,
    "test-bg must default concurrent cap to 1");
});

test("verify-change --plan on a docs-only change selects no browser batches", () => {
  const plan = JSON.parse(run(["tools/ci/verify-change.mjs", "--plan", "docs/TESTING.md"]).out);
  assert.equal(plan.fast.toolingFast, true, "docs integrity is a real test");
  assert.deepEqual(plan.batches, [], "no browser minutes for a prose change");
});

test("verify-change reports UNMATCHED, not pass, for a diff no rule claimed", () => {
  // The asymmetry above was the bug: that test pins "an empty batch list is
  // correct for prose" and never asserts the VERDICT, so an empty batch list
  // from the opposite cause — no rule claimed the files at all — reported the
  // same `pass`, exit 0. pick-tests.mjs:243 publishes a three-way `reason`
  // precisely so a caller can tell those apart, and this tool called the raw
  // pick() Map API and dropped it. What made it matter: .claude/skills/check-changes
  // calls --fast the default for verify-agent, and apex-tools-mcp runs it as
  // apex_verify_change_fast — so an agent asking "did I break anything?" after
  // a .github/, package.json, playwright.config.js, icons/ or vendor/ edit was
  // told no, on the strength of one advisory cache-check. PERF-FINDINGS 2j.
  const r = run(["tools/ci/verify-change.mjs", "--fast", "--json", ".github/workflows/ci.yml"]);
  const out = JSON.parse(r.out);
  assert.equal(out.verdict, "unmatched",
    "a diff no rule claimed must not report pass — the selection is not trustworthy");
  assert.equal(r.status, 2, "finish() maps anything but pass/fail to exit 2, which apex-tools-mcp allows");
  assert.deepEqual(out.unclaimed, [".github/workflows/ci.yml"],
    "the verdict must NAME what went unclaimed, or it is just a different silent answer");

  // The counter-test, and it is the one that matters: a fix that makes every
  // no-op run loud is worse than the bug. A change a rule DOES claim must still
  // select normally and must never report unmatched.
  const ok = JSON.parse(run(["tools/ci/verify-change.mjs", "--plan", "js/render/glx/glx.js"]).out);
  assert.ok(ok.batches.length > 0, "a js/ change must still select batches");
  assert.equal(ok.fast.toolingFast, true);
});

test("verify-change derives its reason the same way pick-tests publishes it", () => {
  // Two copies of one rule drift. pick-tests.mjs:243 is the definition; this
  // asserts verify-change computes the identical expression over the identical
  // inputs (its `groups` is pick-tests' `named`, same filter, same sort), so a
  // change to the contract cannot silently apply to only one of them.
  const vc = fs.readFileSync(path.join(ROOT, "tools/ci/verify-change.mjs"), "utf8");
  const pt = fs.readFileSync(path.join(ROOT, "tools/ci/pick-tests.mjs"), "utf8");
  const shape = /!files\.length \? "none" : \((?:groups|named)\.length \? "matched" : "unmatched"\)/;
  assert.match(vc, shape, "verify-change must compute the three-way reason");
  assert.match(pt, shape, "pick-tests must still be the definition this mirrors");
  // ORDER matters, not just presence: the unmatched check has to run BEFORE the
  // pass path, or it is dead code sitting under the bug it exists to prevent.
  // An index comparison says that plainly; a regex spanning both would not.
  assert.ok(vc.indexOf('selReason === "unmatched"') < vc.indexOf('? "partial" : "pass"'),
    "the unmatched check must come before the pass path, or it can never fire");
});

// ── bump-cache against a fixture shell (never the real one) ─────────────────

test("bump-cache: --check catches drift, --apply hashes assets and keeps the generation; --advance moves it", () => {
  // artifacts/ is GITIGNORED, so it does not exist in a fresh checkout — mkdtemp
  // straight into it is ENOENT on any clone that has not run a test yet, which
  // is every CI run. It passed locally only because an earlier run had created
  // the directory, and read as flaky in a fresh one because whichever suite got
  // there first created it for the rest. Same fix, same idiom, as
  // tests/unit/lighting-campaign.test.mjs: own the mkdir, and use artifacts/tmp.
  const tmpRoot = path.join(ROOT, "artifacts", "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, "bumpfix-"));
  try {
    fs.writeFileSync(path.join(dir, "a.js"), "alpha\n");
    fs.writeFileSync(path.join(dir, "b.css"), "beta\n");
    fs.writeFileSync(path.join(dir, "c.js"), "gamma\n");
    fs.writeFileSync(path.join(dir, "index.html"),
      `<meta name="apex-build" content="7">\n<script src="a.js?v=bad"></script>\n<link href="b.css?v=bad">\n<script src="c.js?v=bad"></script>\n`);
    fs.writeFileSync(path.join(dir, "version.json"), `{ "build": 7 }\n`);

    const drift = run(["tools/ci/bump-cache.mjs", "--check", "--json", "--root", dir]);
    assert.equal(drift.status, 1, "stale content hashes must exit 1");
    assert.equal(JSON.parse(drift.out).consistent, false);

    // Plain --apply rehashes and KEEPS the committed generation: the deploy
    // stamps the real one from the commit count (pages.yml, 2026-09-01).
    const kept = JSON.parse(run(["tools/ci/bump-cache.mjs", "--apply", "--json", "--root", dir]).out);
    assert.equal(kept.applied, 7, "--apply must not advance the placeholder generation");
    const applied = JSON.parse(run(["tools/ci/bump-cache.mjs", "--apply", "--advance", "--json", "--root", dir]).out);
    assert.equal(applied.applied, 8, "--advance is the old max+1 behaviour");
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    for (const rel of ["a.js", "b.css", "c.js"]) {
      const hash = createHash("sha256").update(fs.readFileSync(path.join(dir, rel))).digest("hex").slice(0, 12);
      assert.match(html, new RegExp(`${rel.replace(".", "\\.")}\\?v=${hash}`));
    }
    assert.match(html, /name="apex-build" content="8"/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8")).build, 8);

    const ok = run(["tools/ci/bump-cache.mjs", "--check", "--root", dir]);
    assert.equal(ok.status, 0, "post-apply the shell must be consistent");

    const before = Object.fromEntries([...html.matchAll(/(?:src|href)="([^"?]+)\?v=([a-f0-9]{12})"/g)]
      .map((m) => [m[1], m[2]]));
    fs.writeFileSync(path.join(dir, "a.js"), "alpha changed\n");
    JSON.parse(run(["tools/ci/bump-cache.mjs", "--apply", "--json", "--root", dir]).out);
    const changedHtml = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const after = Object.fromEntries([...changedHtml.matchAll(/(?:src|href)="([^"?]+)\?v=([a-f0-9]{12})"/g)]
      .map((m) => [m[1], m[2]]));
    assert.notEqual(after["a.js"], before["a.js"], "changed asset gets a new URL");
    assert.equal(after["b.css"], before["b.css"], "unchanged CSS keeps its warm-cache URL");
    assert.equal(after["c.js"], before["c.js"], "unchanged JS keeps its warm-code-cache URL");

    JSON.parse(run(["tools/ci/bump-cache.mjs", "--apply", "--at", "42", "--json", "--root", dir]).out);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8")).build, 42);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bump-cache refuses --apply on the repo shell (hashes are stamped at deploy)", () => {
  // The committed shell reads ?v=dev on every tag; a habitual repo-side
  // --apply would put 151 hashes back and reopen the churn gen-shell closed.
  const r = run(["tools/ci/bump-cache.mjs", "--apply", "--json"]);
  assert.equal(r.status, 2, "plain --apply must refuse with exit 2");
  assert.match(JSON.parse(r.out).error, /refusing --apply on the repo shell/);
  assert.match(JSON.parse(r.out).error, /gen-shell/, "the refusal must point at the generator");
});

test("bump-cache --check on the REAL shell agrees with the load-order guard", () => {
  // Ordinarily green; goes red exactly when someone edits assets and forgets
  // the bump, which is the tool's whole reason to exist.
  const real = run(["tools/ci/bump-cache.mjs", "--check", "--json"]);
  const v = JSON.parse(real.out);
  assert.equal(real.status, 0, `shell inconsistent: ${JSON.stringify(v.assetMismatches)}; shell ${v.shellBuild} vs version.json ${v.versionJson}`);
  assert.equal(v.mode, "repo");
  assert.ok(v.tagCount > 100, "the shell has ~150 versioned tags; a collapse means the regex or index.html broke");
});

// ── test-honesty: the suite stays honest ────────────────────────────────────

test("test-honesty finds no unexplained skips (the silent-skip ratchet)", () => {
  const r = run(["tools/ci/test-honesty.mjs", "--json"]);
  const v = JSON.parse(r.out);
  assert.ok(v.scanned > 150, "scanner must actually walk tests/");
  // New skips need a `// SKIP-OK: <reason>` comment or a reason argument —
  // a skipped suite that reports green is how test:visual shipped 40/40
  // while testing nothing (docs/PERF-FINDINGS.md).
  assert.deepEqual(v.detail, [], "unexplained skip/fixme/empty-body sites — annotate or fix them");
});
