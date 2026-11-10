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
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { STAGE_ROOT_FILES } from "../../tools/desktop/stage-files.mjs";

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
  // cache-bust behaviour: tests/unit/poll-live-shell.test.mjs ("cache-busts every fetch …"), not a text pin.
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
  assert.doesNotMatch(html, /<link\b[^>]*rel="preload"[^>]*\bintegrity=/);
});

test("staged title CSS preloads carry the same SHA-256 integrity as their stylesheets", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "preload-integrity-"));
  const rel = "fx/a.css";
  const sri = (file) => "sha256-" + createHash("sha256").update(fs.readFileSync(path.join(dir, file))).digest("base64");
  const run = (...args) => spawnSync(process.execPath, ["tools/ci/bump-cache.mjs", ...args, "--root", dir, "--json"], { cwd: ROOT, encoding: "utf8" });
  try {
    fs.mkdirSync(path.join(dir, "fx"));
    fs.writeFileSync(path.join(dir, rel), "body{margin:0}\n");
    fs.writeFileSync(path.join(dir, "index.html"),
      `<head><meta name="apex-build" content="1695">\n` +
      `<link rel="preload" href="${rel}?v=dev" as="style">\n` +
      `<link rel="stylesheet" href="${rel}?v=dev"></head>`);
    fs.writeFileSync(path.join(dir, "version.json"), '{"build":1695}');
    assert.equal(run("--apply").status, 0);
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const want = sri(rel);
    assert.ok(/rel="preload" href="fx\/a\.css\?v=[0-9a-f]{12}" as="style"/.test(html) && html.includes(`integrity="${want}"`));
    assert.ok(/rel="stylesheet" href="fx\/a\.css\?v=[0-9a-f]{12}"/.test(html) && html.includes(`integrity="${want}"`));
    assert.equal(run("--check").status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- Coverage (2026-11-09 audit, W1): the stamp must cover EVERY root page that carries `?v=` tags: overlay.html
// deployed `?v=dev` keys with no SRI while --check passed. (Every lazy roster: tests/unit/deploy-staging.test.mjs, #4992.)
const runAt = (dir, ...args) => spawnSync(process.execPath, ["tools/ci/bump-cache.mjs", ...args, "--root", dir, "--json"], { cwd: ROOT, encoding: "utf8" });
const stageDir = (tag) => { fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true }); return fs.mkdtempSync(path.join(ROOT, "scratch", tag)); };
const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const shell = (dir) => {
  put(dir, "fx/shell.js", "// shell\n");
  put(dir, "index.html", `<head><meta name="apex-build" content="1695"><script src="fx/shell.js?v=dev"></script></head>`);
  put(dir, "version.json", '{"build":1695}');
};

test("every staged root .html page is stamped (overlay.html included) and --check fails on a staged ?v=dev", () => {
  const dir = stageDir("pages-cover-");
  try {
    shell(dir);
    put(dir, "fx/a.js", "console.log('a');\n");
    const pages = STAGE_ROOT_FILES.filter((f) => f.endsWith(".html") && f !== "index.html");
    assert.deepEqual(["overlay.html"].filter((p) => !pages.includes(p)), [], "the allow-list ships overlay.html");
    for (const p of pages) put(dir, p, `<script src="fx/a.js?v=dev"></script>\n`);
    assert.equal(runAt(dir, "--apply").status, 0);
    // Each page's one tag, parsed: a real ?v= key and the SRI of fx/a.js's actual bytes.
    const sri = "sha256-" + createHash("sha256").update(fs.readFileSync(path.join(dir, "fx/a.js"))).digest("base64");
    const stamped = pages.map((p) => {
      const tag = /<script src="fx\/a\.js\?v=([^"]+)"([^>]*)>/.exec(fs.readFileSync(path.join(dir, p), "utf8"));
      return [p, tag ? tag[1] !== "dev" : "no tag", tag ? (/integrity="([^"]+)"/.exec(tag[2]) || [])[1] : null];
    });
    assert.deepEqual(stamped, pages.map((p) => [p, true, sri]), "every staged page is keyed and carries the file's SRI");
    assert.equal(runAt(dir, "--check").status, 0);
    // A root page outside the allow-list, staged with a dev key: --check names it.
    put(dir, "stray.html", `<script src="fx/a.js?v=dev"></script>\n`);
    const check = runAt(dir, "--check");
    assert.equal(check.status, 1);
    assert.ok(JSON.parse(check.stdout).assetMismatches.some((m) => m.page === "stray.html" && m.actual === "dev"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the repo check still reads overlay.html (its tags stay ?v=dev in the tree)", () => {
  const r = spawnSync(process.execPath, ["tools/ci/bump-cache.mjs", "--json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const overlayTags = (fs.readFileSync(path.join(ROOT, "overlay.html"), "utf8").match(/\?v=dev"/g) || []).length;
  assert.ok(overlayTags > 0);
  const indexTags = (fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/\b(?:src|href)="[^"?#]+\?v=[A-Za-z0-9._-]+"/g) || []).length;
  assert.ok(JSON.parse(r.stdout).tagCount >= indexTags + overlayTags, "overlay.html's tags are counted");
});

test("ScriptLoader logs a warning when the stamped shell has no integrity key for a lazy file", async () => {
  const loader = fs.readFileSync(path.join(ROOT, "js/core/script-loader.js"), "utf8");
  const warnings = [], appended = [];
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] }, window: { __APEX_BUILD: 1 }, setTimeout, clearTimeout,
    Log: { warn: (_cat, msg) => warnings.push(msg) },
    document: {
      getElementById: (id) => id === "apex-lazy-integrity" ? { tagName: "SCRIPT", type: "application/json", textContent: "{}" } : null,
      createElement: () => ({ dataset: {}, remove() {} }),
      head: { appendChild: (el) => appended.push(el) },
    },
  });
  vm.runInContext(loader + "\nthis.ScriptLoader = ScriptLoader;", ctx, { filename: path.join(ROOT, "js/core/script-loader.js") });
  const ok = await ctx.ScriptLoader.create().load(["js/garage/exterior.js"], [], { strict: true });
  assert.equal(ok, false);
  assert.equal(appended.length, 0, "a refused file is never injected");
  assert.ok(warnings.some((w) => /no integrity key/.test(w) && w.includes("js/garage/exterior.js")), JSON.stringify(warnings));
});
