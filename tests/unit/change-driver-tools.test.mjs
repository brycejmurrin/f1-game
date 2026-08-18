"use strict";
// change-driver-tools — contracts for the verification drivers
// (tools/verify-change.mjs, tools/bump-cache.mjs, tools/test-honesty.mjs).
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
  const plan = JSON.parse(run(["tools/verify-change.mjs", "--plan",
    "js/circuits/monza.js", "js/track/graph.js"]).out);
  assert.deepEqual(plan.fast.verifyTrack, ["monza"]);
  assert.equal(plan.fast.graphParity, true);
  assert.equal(plan.fast.cacheCheck, true);
  assert.equal(plan.sweepsBeforeDeployPush, true, "track+circuit changes must carry the union-sweeps reminder");
});

test("verify-change batches carry AT MOST ONE browser group each (the 120s-timeout rule)", () => {
  // game.js fans out to the widest selection this repo has; if the rule holds
  // there it holds everywhere.
  const plan = JSON.parse(run(["tools/verify-change.mjs", "--plan", "js/game.js", "index.html", "css/hud.css"]).out);
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
  const plan = JSON.parse(run(["tools/verify-change.mjs", "--plan", "js/game.js", "tools/test-bg.mjs"]).out);
  assert.ok(plan.batches.length >= 1);
  for (const batch of plan.batches) {
    assert.equal(batch.length, 1,
      `batch ${JSON.stringify(batch)} bunches groups — sequential default is one group per batch`);
  }
});

test("tooling-fast npm script uses the sequential runner", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.match(pkg.scripts["test:tooling-fast"], /tools\/tooling-fast\.mjs/,
    "test:tooling-fast must invoke tools/tooling-fast.mjs (concurrency=1 + per-file logging)");
  assert.ok(fs.existsSync(path.join(ROOT, "tools/tooling-fast.mjs")));
});

test("test-bg defaults to sequential (one concurrent group) unless --parallel", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/test-bg.mjs"), "utf8");
  assert.match(src, /--parallel/, "test-bg must expose --parallel for the old concurrent start");
  assert.match(src, /sequential|maxConcurrent|parallel \? PARALLEL_MAX : 1/,
    "test-bg must default concurrent cap to 1");
});

test("verify-change --plan on a docs-only change selects no browser batches", () => {
  const plan = JSON.parse(run(["tools/verify-change.mjs", "--plan", "docs/TESTING.md"]).out);
  assert.equal(plan.fast.toolingFast, true, "docs integrity is a real test");
  assert.deepEqual(plan.batches, [], "no browser minutes for a prose change");
});

// ── bump-cache against a fixture shell (never the real one) ─────────────────

test("bump-cache: --check catches drift, --apply hashes assets and advances shell generation", () => {
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

    const drift = run(["tools/bump-cache.mjs", "--check", "--json", "--root", dir]);
    assert.equal(drift.status, 1, "stale content hashes must exit 1");
    assert.equal(JSON.parse(drift.out).consistent, false);

    const applied = JSON.parse(run(["tools/bump-cache.mjs", "--apply", "--json", "--root", dir]).out);
    assert.equal(applied.applied, 8, "shell generation advances independently of asset hashes");
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    for (const rel of ["a.js", "b.css", "c.js"]) {
      const hash = createHash("sha256").update(fs.readFileSync(path.join(dir, rel))).digest("hex").slice(0, 12);
      assert.match(html, new RegExp(`${rel.replace(".", "\\.")}\\?v=${hash}`));
    }
    assert.match(html, /name="apex-build" content="8"/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8")).build, 8);

    const ok = run(["tools/bump-cache.mjs", "--check", "--root", dir]);
    assert.equal(ok.status, 0, "post-apply the shell must be consistent");

    const before = Object.fromEntries([...html.matchAll(/(?:src|href)="([^"?]+)\?v=([a-f0-9]{12})"/g)]
      .map((m) => [m[1], m[2]]));
    fs.writeFileSync(path.join(dir, "a.js"), "alpha changed\n");
    JSON.parse(run(["tools/bump-cache.mjs", "--apply", "--json", "--root", dir]).out);
    const changedHtml = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const after = Object.fromEntries([...changedHtml.matchAll(/(?:src|href)="([^"?]+)\?v=([a-f0-9]{12})"/g)]
      .map((m) => [m[1], m[2]]));
    assert.notEqual(after["a.js"], before["a.js"], "changed asset gets a new URL");
    assert.equal(after["b.css"], before["b.css"], "unchanged CSS keeps its warm-cache URL");
    assert.equal(after["c.js"], before["c.js"], "unchanged JS keeps its warm-code-cache URL");

    JSON.parse(run(["tools/bump-cache.mjs", "--apply", "--at", "42", "--json", "--root", dir]).out);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8")).build, 42);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bump-cache --check on the REAL shell agrees with the load-order guard", () => {
  // Ordinarily green; goes red exactly when someone edits assets and forgets
  // the bump, which is the tool's whole reason to exist.
  const real = run(["tools/bump-cache.mjs", "--check", "--json"]);
  const v = JSON.parse(real.out);
  assert.equal(real.status, 0, `shell inconsistent: ${JSON.stringify(v.assetMismatches)}; shell ${v.shellBuild} vs version.json ${v.versionJson}`);
  assert.ok(v.tagCount > 100, "the shell has ~160 versioned tags; a collapse means the regex or index.html broke");
});

// ── test-honesty: the suite stays honest ────────────────────────────────────

test("test-honesty finds no unexplained skips (the silent-skip ratchet)", () => {
  const r = run(["tools/test-honesty.mjs", "--json"]);
  const v = JSON.parse(r.out);
  assert.ok(v.scanned > 150, "scanner must actually walk tests/");
  // New skips need a `// SKIP-OK: <reason>` comment or a reason argument —
  // a skipped suite that reports green is how test:visual shipped 40/40
  // while testing nothing (docs/PERF-FINDINGS.md).
  assert.deepEqual(v.detail, [], "unexplained skip/fixme/empty-body sites — annotate or fix them");
});
