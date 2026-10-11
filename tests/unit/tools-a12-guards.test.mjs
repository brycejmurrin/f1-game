// tools-a12-guards.test.mjs — round-2 tooling findings DK1, S1, WP1, G1, PA1, PG1 (2026-10-10).
// Each case fails on the code it replaced. Negative fixtures live under scratch/ and are removed afterwards.
//
// Run: node --test tests/unit/tools-a12-guards.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function fixture(prefix) {
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", prefix));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  return { dir, put, rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// ---- DK1: dup-keys scanned nothing under any directory named `three` ------------------
test("DK1 dup-keys scans js/render/three/ (skip by path, not by basename) and reports unparseable files", async () => {
  const { scanTree } = await import("../../tools/check/dup-keys.mjs");
  // Fixture paths borrow REAL repo paths as labels (contents are synthetic): the
  // comment-citation guard requires every path-shaped token in a test to exist.
  const fx = fixture("a12-dupkeys-");
  try {
    fx.put("js/render/three/tlx.js", "var o = { a: 1, b: 2, a: 3 };\n");
    fx.put("js/core/log.js", "var o = { a: 1 };\n");
    fx.put("tools/check/vstd-lint.mjs", "var = = ;\n");
    fx.put("node_modules/x/y.js", "var o = { a: 1, a: 2 };\n");
    fx.put("tests/helpers/fixtures.js", "");
    const hits = scanTree(fx.dir);
    const three = hits.filter((h) => h.file === "js/render/three/tlx.js");
    assert.equal(three.length, 1, `js/render/three/ must be scanned: ${JSON.stringify(hits)}`);
    assert.equal(three[0].key, "a");
    assert.ok(hits.some((h) => h.file === "tools/check/vstd-lint.mjs" && h.parseError), "a file neither mode parses is a finding, not silence");
    assert.ok(!hits.some((h) => h.file.startsWith("node_modules")), "node_modules stays exempt");
  } finally { fx.rm(); }
  // importing the module no longer runs (and exits on) a whole-tree scan
  const r = spawnSync(process.execPath, ["-e", 'import("./tools/check/dup-keys.mjs").then(()=>console.log("imported"))'], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.stdout.trim(), "imported", r.stderr);
});

// ---- S1: recursive delete of an unvalidated --out -------------------------------------
test("S1 stageSite refuses the checkout, its parent, a foreign non-empty directory; keeps its files", async () => {
  const { stageSite, assertStageDest } = await import("../../tools/desktop/stage.mjs");
  const fx = fixture("a12-stage-");
  try {
    const root = path.join(fx.dir, "repo");
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    fs.writeFileSync(path.join(root, "version.json"), "{}");
    fs.mkdirSync(path.join(root, "js"));
    fx.put("precious/notes.txt", "keep me");
    for (const bad of [root, fx.dir, path.dirname(fx.dir), path.join(root, ".git"), path.join(root, "js"), path.join(root, "js", "sub"), path.join(fx.dir, "precious"), "/"]) {
      assert.throws(() => assertStageDest(bad, root), /refusing/, bad);
    }
    assert.throws(() => stageSite(path.join(fx.dir, "precious"), { root }), /refusing/);
    assert.equal(fs.readFileSync(path.join(fx.dir, "precious/notes.txt"), "utf8"), "keep me", "the refused directory is untouched");
    assert.ok(fs.existsSync(path.join(root, "version.json")), "the checkout is untouched");
    // allowed: missing, empty, an earlier stage
    assertStageDest(path.join(fx.dir, "new-site"), root);
    fs.mkdirSync(path.join(fx.dir, "empty"));
    assertStageDest(path.join(fx.dir, "empty"), root);
    fx.put("prior/index.html", "x"); fx.put("prior/version.json", "{}"); fx.put("prior/js/a.js", "x");
    assertStageDest(path.join(fx.dir, "prior"), root);
  } finally { fx.rm(); }
});

test("S1 stage.mjs treats a flag as a missing --out value (usage, exit 2) and creates nothing", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/desktop/stage.mjs"), "--out", "--stamp"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 2, r.stderr + r.stdout);
  assert.match(r.stdout, /usage/);
  assert.ok(!fs.existsSync(path.join(ROOT, "--stamp")));
});

test("S1 assertOutputDir keeps --reset / --out inside artifacts/ or scratch/; garage-angles-fetch refuses before unzipping", async () => {
  const { assertOutputDir } = await import("../../tools/lib/output-paths.mjs");
  const root = path.join(ROOT, "scratch", "nonexistent-root");
  for (const bad of [root, path.join(root, "artifacts"), path.join(root, "scratch"), path.join(root, "js"), path.join(root, "artifacts", ".."), path.dirname(root), "/", "", "--stamp"])
    assert.throws(() => assertOutputDir(bad, root), /not inside|needs a directory/, JSON.stringify(bad));
  assert.equal(assertOutputDir(path.join(root, "artifacts", "garage-angles"), root), path.join(root, "artifacts", "garage-angles"));
  assert.equal(assertOutputDir(path.join(root, "scratch", "x", "y"), root), path.join(root, "scratch", "x", "y"));

  const { fetchPack } = await import("../../tools/garage-angles-fetch.mjs");
  const { artifactName } = await import("../../tools/shot/garage-before.mjs");
  const sha = "a".repeat(40);
  const artifacts = [{ id: 7, name: artifactName(sha), created_at: "2026-10-01T00:00:00Z", size_in_bytes: 1 }];
  for (const out of [ROOT, path.dirname(ROOT), "/"]) {
    const r = await fetchPack({ sha, out, artifacts, token: "t", resolve: false });
    assert.equal(r.code, 3, `${out}: ${JSON.stringify(r)}`);
    assert.match(r.error, /not inside artifacts\/ or scratch\//);
  }
});

test("S1 garage-angles --reset checks its --out before the recursive rmSync", () => {
  const src = read("tools/shot/garage-angles.mjs");
  const at = src.indexOf('argvHas("--reset") && existsSync(outDir)');
  assert.ok(at > 0);
  const block = src.slice(at, src.indexOf("mkdirSync(outDir", at));
  assert.ok(block.indexOf("assertOutputDir(") > 0 && block.indexOf("assertOutputDir(") < block.indexOf("rmSync("),
    "assertOutputDir must run before rmSync");
});

// ---- WP1: the polling ratchet ignored files it could not parse ------------------------
test("WP1 wait-polling-lint counts a sloppy-mode .cjs and a parse failure is an error, not a zero", async () => {
  const { lintSource, count } = await import("../../tools/check/wait-polling-lint.mjs");
  const sloppy = "var await = 1; var o = {a:1}; with (o) { a; }\nasync function f(page){ await page.waitForFunction(() => window.x, null, { timeout: 5000 }); }\n";
  const row = lintSource(sloppy, "legacy.cjs");
  assert.equal(row.parseError, undefined, "retried as a script");
  assert.equal(row.sites.length, 1, "the site is counted");
  const fx = fixture("a12-wp-");
  try {
    fx.put("tests/specs/smoke.spec.js", "const = = ;\nwaitForFunction(() => 1, null, { timeout: 5 });\n");
    assert.throws(() => count(fx.dir), /cannot be parsed[\s\S]*tests\/specs\/smoke\.spec\.js/);
  } finally { fx.rm(); }
});

// ---- G1: an unknown flag fell through to WRITE mode -----------------------------------
test("G1 every generator refuses an unknown flag with exit 2 and writes nothing", () => {
  const gens = ["gen-tools-readme", "gen-slider-doc", "gen-hooks-table", "gen-arch-table", "gen-circuit-meta", "gen-test-groups", "title-art", "gen-shell"];
  const targets = ["tools/README.md", "docs/LIGHTING-TUNER-SLIDERS.md", "docs/DEBUG-HOOKS.md", "docs/ARCHITECTURE.md", "js/track/circuit-meta.js", "package.json", "index.html"];
  const sig = () => targets.map((t) => crypto.createHash("sha1").update(fs.existsSync(path.join(ROOT, t)) ? read(t) : "").digest("hex")).join();
  const before = sig();
  for (const g of gens) for (const flag of ["--chek", "-c", "--dry"]) {
    const r = spawnSync(process.execPath, [path.join(ROOT, "tools/gen", `${g}.mjs`), flag], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 2, `${g} ${flag}: status ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /unknown argument/, `${g} ${flag}`);
  }
  assert.equal(sig(), before, "no generated file was touched");
});

test("G1 --help prints usage and exits 0 without writing (gen-lib generators)", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/gen/gen-hooks-table.mjs"), "--help"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /usage: node tools\/gen\/gen-hooks-table\.mjs/);
});

// ---- PA1 / PG1: workflow text ---------------------------------------------------
test("PA1 the Chromium cache key carries the runner image", () => {
  const action = read(".github/actions/playwright-chromium/action.yml");
  assert.match(action, /id: img[\s\S]*ImageOS[\s\S]*ImageVersion/);
  const key = action.match(/key: (pw-.*)/)[1];
  assert.match(key, /steps\.img\.outputs\.id/, key);
  assert.ok(action.indexOf("id: img") < action.indexOf("id: pwcache"), "the image id is computed before the cache step reads it");
});

test("PG1 pages.yml fast_tier_run drops the run when ship_only, instead of always yielding fast_run", () => {
  const wf = read(".github/workflows/pages.yml");
  const line = wf.match(/fast_tier_run: \$\{\{ (.*) \}\}/)[1];
  assert.equal(line, "needs.verdict.outputs.ship_only != 'true' && needs.verdict.outputs.fast_run || ''");
  // evaluate the GitHub idiom (a && b || c with '' falsy) for both inputs
  const ev = (shipOnly, fast) => ((shipOnly !== "true" && fast) || "");
  assert.equal(ev("true", "7"), "", "ship_only wins");
  assert.equal(ev("false", "7"), "7");
  // the idiom it replaced returned fast_run even when ship_only was true
  const old = (shipOnly, fast) => ((shipOnly === "true" && "") || fast);
  assert.equal(old("true", "7"), "7", "documents the defect");
});
