// deploy-stamp — the shell generation is stamped by pages.yml at deploy time
// (2000 + commit count, `bump-cache --apply --at N --root _site`) and the
// committed version.json/meta are a consistent placeholder. This pins the
// mechanism: the workflow carries the stamp step, a full-depth checkout (a
// depth-1 clone counts 1), the verify-live job, and bump-cache honours --at /
// --root on a staged copy without touching the repo's own shell.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
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
  // #2923: cache-bust + "never reached build" live in tools/ci/poll-live-shell.mjs;
  // pages.yml only invokes it (and skips verify-live.mjs when superseded).
  assert.match(pages, /node tools\/ci\/poll-live-shell\.mjs --url "\$PAGE_URL" --build "\$BUILD" --sha "\$GITHUB_SHA"/);
  const pollSrc = fs.readFileSync(path.join(ROOT, "tools/ci/poll-live-shell.mjs"), "utf8");
  assert.match(pollSrc, /never reached build \$\{?build\}?/, "poll script still fails closed with the live build/sha");
  assert.match(pollSrc, /Date\.now\(\)/, "cache-bust query on each live fetch");
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

test("staged lazy scripts carry full SHA-256 integrity, including track-build and phone bundles", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "lazy-integrity-"));
  const manifest = createRequire(import.meta.url)("../../tools/manifest.cjs");
  const files = [...new Set([...manifest.LAZY_TRACK_BUILD, ...manifest.LAZY_AUDIO, ...manifest.LAZY_NET])];
  const run = (...args) => spawnSync(process.execPath, ["tools/ci/bump-cache.mjs", ...args, "--root", dir, "--json"], { cwd: ROOT, encoding: "utf8" });
  try {
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), `// fixture ${file}\n`);
    }
    // Use an actual fixture path for the tagged asset too.
    const tag = files[0];
    fs.writeFileSync(path.join(dir, "index.html"), `<head><meta name="apex-build" content="1695"><script src="${tag}?v=dev"></script></head>`);
    fs.writeFileSync(path.join(dir, "version.json"), '{"build":1695}');
    const apply = run("--apply");
    assert.equal(apply.status, 0, apply.stdout + apply.stderr);
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const map = JSON.parse(html.match(/id="apex-lazy-integrity">([^<]+)</)[1]);
    assert.ok(map["js/input/phone-pad.js"]);
    for (const file of files) assert.equal(map[file], "sha256-" + createHash("sha256").update(fs.readFileSync(path.join(dir, file))).digest("base64"));
    assert.equal(run("--check").status, 0);
    // SRI must catch changes beyond the old twelve-hex URL metadata too.
    fs.writeFileSync(path.join(dir, tag), "// replaced deploy bytes");
    const check = run("--check");
    assert.equal(check.status, 1);
    assert.ok(JSON.parse(check.stdout).assetMismatches.some(m => m.page === "apex-lazy-integrity" && m.rel === tag));
    assert.equal(run("--apply").status, 0);
    const restamped = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    assert.equal((restamped.match(/id="apex-lazy-integrity"/g) || []).length, 1);
    assert.equal(run("--check").status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// #2312: the ?v= key is 12 hex chars and Pages serves current bytes for an older key, so initial
// script/stylesheet tags (index.html and the secondary pages) carry the file's full SRI once staged.
test("staged initial script and stylesheet tags carry full SHA-256 integrity", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "initial-integrity-"));
  const sri = (file) => "sha256-" + createHash("sha256").update(fs.readFileSync(path.join(dir, file))).digest("base64");
  const run = (...args) => spawnSync(process.execPath, ["tools/ci/bump-cache.mjs", ...args, "--root", dir, "--json"], { cwd: ROOT, encoding: "utf8" });
  try {
    fs.mkdirSync(path.join(dir, "fx"));
    fs.writeFileSync(path.join(dir, "fx/a.js"), "console.log('a');\n");
    fs.writeFileSync(path.join(dir, "fx/a.css"), "body{margin:0}\n");
    fs.writeFileSync(path.join(dir, "index.html"),
      `<head><meta name="apex-build" content="1695">\n<link rel="stylesheet" href="fx/a.css?v=dev">\n` +
      `<script defer crossorigin="anonymous" src="fx/a.js?v=dev"></script></head>`);
    fs.writeFileSync(path.join(dir, "version.json"), '{"build":1695}');
    assert.equal(run("--apply").status, 0);
    const html = () => fs.readFileSync(path.join(dir, "index.html"), "utf8");
    assert.match(html(), new RegExp(`src="fx/a\\.js\\?v=[0-9a-f]{12}" integrity="${sri("fx/a.js").replace(/[+/=]/g, "\\$&")}"`));
    assert.match(html(), new RegExp(`href="fx/a\\.css\\?v=[0-9a-f]{12}" integrity="${sri("fx/a.css").replace(/[+/=]/g, "\\$&")}"`));
    assert.equal(run("--check").status, 0);
    // Restamping replaces the integrity rather than stacking a second attribute.
    assert.equal(run("--apply").status, 0);
    assert.equal((html().match(/integrity=/g) || []).length, 2);
    // Bytes that no longer match the stamped tag: the integrity attribute is reported stale beside the ?v= key.
    fs.writeFileSync(path.join(dir, "fx/a.js"), "console.log('newer deploy');\n");
    const check = run("--check");
    assert.equal(check.status, 1);
    const found = JSON.parse(check.stdout).assetMismatches;
    assert.ok(found.some((m) => m.rel === "fx/a.js" && m.expected === sri("fx/a.js") && /^sha256-/.test(m.actual || "")), "the script tag's integrity is reported stale");
    assert.equal(run("--apply").status, 0);
    assert.equal(run("--check").status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the repo shell keeps integrity-free initial tags (dev behaviour is unchanged)", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc="[^"]*\?v=dev"[^>]*\bintegrity=/);
  assert.doesNotMatch(html, /<link\b[^>]*rel="stylesheet"[^>]*\bintegrity=/);
});
