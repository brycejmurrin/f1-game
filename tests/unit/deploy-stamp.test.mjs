// deploy-stamp — the shell generation is stamped by pages.yml at deploy time
// (2000 + commit count, `bump-cache --apply --at N --root _site`) and the
// committed version.json/meta are a consistent placeholder. This pins the
// mechanism: the workflow carries the stamp step, a full-depth checkout (a
// depth-1 clone counts 1), the verify-live job, and bump-cache honours --at /
// --root on a staged copy without touching the repo's own shell.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pages = fs.readFileSync(path.join(ROOT, ".github/workflows/pages.yml"), "utf8");
const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");

test("pages.yml stamps the generation from the commit count on a full-depth checkout", () => {
  assert.match(pages, /name: Stamp the shell generation/);
  assert.match(pages, /BUILD=\$\(\( 2000 \+ \$\(git rev-list --count HEAD\) \)\)/, "2000 + commit count — the offset keeps stamped builds above the last committed 1689");
  assert.match(pages, /bump-cache\.mjs --apply --at "\$BUILD" --root _site/);
  assert.match(pages, /apex-sha/, "provenance meta, because the deployed shell no longer equals the committed bytes");
  const deployJob = pages.slice(pages.indexOf("\n  deploy:"), pages.indexOf("\n  verify-live:"));
  assert.match(deployJob, /fetch-depth: 0/, "the deploy job must check out full history or rev-list counts 1");
  assert.match(deployJob, /build: \$\{\{ steps\.stamp\.outputs\.build \}\}/, "the stamped build is an output for verify-live");
});

test("pages.yml verifies the live site serves the stamped build", () => {
  assert.match(pages, /\n  verify-live:\n/);
  assert.match(pages, /needs: deploy/);
  assert.match(pages, /version\.json\?_=\$\{GITHUB_RUN_ID\}/, "cache-busted poll of the live version.json");
  assert.match(pages, /never reached build \$BUILD/);
});

test("ci.yml no longer demands a committed generation newer than live", () => {
  assert.doesNotMatch(ci, /bump-cache\.mjs --check --since/, "that check contradicts a deploy-stamped generation and would fail every push");
});

test("a RELATIVE --root (pages.yml passes `_site`) stamps too", () => {
  // Run 1873 (2026-09-01) failed its very first stamp with "Invalid versioned
  // asset path: css/tokens.css": ROOT kept the relative string, the asset guard
  // compared an absolute resolved path against a relative prefix, and rejected
  // every tag. The absolute-tempdir test above could not see it.
  const rel = path.join("scratch", `stamp-${process.pid}-${Date.now()}`);
  const dir = path.join(ROOT, rel);
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, "css", "tokens.css"), ":root{--x:1}\n");
    fs.writeFileSync(path.join(dir, "index.html"),
      `<meta name="apex-build" content="1689">\n<link rel="stylesheet" href="css/tokens.css?v=bad">\n`);
    fs.writeFileSync(path.join(dir, "version.json"), `{ "build": 1689 }\n`);
    const r = spawnSync("node", ["tools/ci/bump-cache.mjs", "--apply", "--at", "2315", "--json", "--root", rel], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 0, `relative --root must stamp: ${r.stderr}`);
    assert.equal(JSON.parse(r.stdout).applied, 2315);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, "index.html"), "utf8"), /\?v=bad/);
    const check = spawnSync("node", ["tools/ci/bump-cache.mjs", "--check", "--root", rel], { cwd: ROOT, encoding: "utf8" });
    assert.equal(check.status, 0, check.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("bump-cache --apply --at N --root <dir> stamps a staged copy and leaves the repo alone", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-stamp-"));
  try {
    fs.writeFileSync(path.join(dir, "a.js"), "console.log(1);\n");
    fs.writeFileSync(path.join(dir, "index.html"),
      `<meta name="apex-build" content="1689">\n<script src="a.js?v=bad"></script>\n`);
    fs.writeFileSync(path.join(dir, "version.json"), `{ "build": 1689 }\n`);
    const before = fs.readFileSync(path.join(ROOT, "version.json"), "utf8");
    const r = spawnSync("node", ["tools/ci/bump-cache.mjs", "--apply", "--at", "4242", "--json", "--root", dir], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).applied, 4242);
    assert.match(fs.readFileSync(path.join(dir, "index.html"), "utf8"), /content="4242"/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8")).build, 4242);
    assert.equal(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"), before, "the repo's own placeholder is untouched");
    const check = spawnSync("node", ["tools/ci/bump-cache.mjs", "--check", "--root", dir], { cwd: ROOT, encoding: "utf8" });
    assert.equal(check.status, 0, "the staged copy is consistent after the stamp");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
