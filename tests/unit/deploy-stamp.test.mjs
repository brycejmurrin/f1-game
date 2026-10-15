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
  // 2000 + commit count lives in tools/desktop/stage.mjs pagesBuild() (one copy for Pages, desktop and Android);
  // tests/unit/deploy-staging-build.test.mjs pins the formula and the stamped bytes.
  assert.match(pages, /node tools\/desktop\/stage\.mjs --out _site --stamp-only --sha "\$PUBLISH_SHA"/);
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

// Execute the workflow's actual shell, including curl exit handling and retries.
// Stub only the network and ten-second wait; parsing uses the real Node binary.
const livePoll = pages.slice(pages.indexOf("          set -eu\n", pages.indexOf("  verify-live:")), pages.indexOf("      # A BROKEN-BUT-LIVE"))
  .split("\n").map(line => line.startsWith("          ") ? line.slice(10) : line).join("\n");
const expectedSha = "a".repeat(40);
const goodHtml = `<meta name="apex-build" content="4242"><meta name="apex-sha" content="${expectedSha}">`;

function pollFixture(attempts) {
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "live-poll-"));
  try {
    fs.writeFileSync(path.join(dir, "attempts.json"), JSON.stringify(attempts));
    fs.writeFileSync(path.join(dir, "curl"), `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const dir = process.env.FIXTURE_DIR;
const url = process.argv.at(-1);
const countFile = path.join(dir, 'count');
let count = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) : 0;
if (url.includes('/version.json?')) fs.writeFileSync(countFile, String(++count));
const all = JSON.parse(fs.readFileSync(path.join(dir, 'attempts.json'), 'utf8'));
const fixture = all[Math.min(count - 1, all.length - 1)];
const version = url.includes('/version.json?');
fs.writeFileSync(process.argv[process.argv.indexOf('--output') + 1], version ? fixture.version : fixture.html);
process.exit(version ? (fixture.versionExit || 0) : (fixture.htmlExit || 0));
`, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-c", livePoll], {
      cwd: ROOT, encoding: "utf8", timeout: 15000,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FIXTURE_DIR: dir,
        PAGE_URL: "https://fixture.invalid", GITHUB_RUN_ID: "123", BUILD: "4242", GITHUB_SHA: expectedSha },
    });
    assert.ok(fs.existsSync(path.join(dir, "count")), result.stdout + result.stderr);
    return { ...result, attempts: Number(fs.readFileSync(path.join(dir, "count"), "utf8")) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const goodLive = { version: '{"build":4242}', html: goodHtml };
test("live poll accepts the exact deployed SHA and numeric build", () => {
  const result = pollFixture([goodLive]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.attempts, 1);
  assert.match(result.stdout, /live shell carries build 4242 and commit/);
});

for (const [label, fixture] of [
  ["wrong commit at the expected build", { ...goodLive, html: goodHtml.replace(expectedSha, "b".repeat(40)) }],
  ["missing provenance", { ...goodLive, html: '<meta name="apex-build" content="4242">' }],
  ["wrong shell build with correct provenance", { ...goodLive, html: goodHtml.replace('content="4242"', 'content="4241"') }],
  ["trailing malformed JSON", { ...goodLive, version: '{"build":4242}broken' }],
  ["string build instead of numeric build", { ...goodLive, version: '{"build":"4242"}' }],
  ["failed complete HTML download despite matching prefix", { ...goodLive, htmlExit: 23 }],
  ["failed version download despite valid bytes", { ...goodLive, versionExit: 18 }],
  ["duplicate conflicting provenance", { ...goodLive, html: goodHtml + '<meta name="apex-sha" content="bad">' }],
]) {
  test(`live poll rejects ${label} and retains bounded retries`, () => {
    const result = pollFixture([fixture]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.attempts, 24);
    assert.doesNotMatch(result.stdout, /live shell carries/);
  });
}

test("live poll tolerates deployment lag then verifies both responses", () => {
  const result = pollFixture([{ ...goodLive, html: goodHtml.replace(expectedSha, "b".repeat(40)) }, goodLive]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.attempts, 2);
});
