#!/usr/bin/env node
// bump-cache.mjs — the DEPLOY-side content hasher; a consistency check in the repo.
// @doc Deploy-time content hashing of a STAGED shell (`--apply --at N --root _site`); `--check` in the repo asserts `?v=dev`.
// @skill check-changes
//
// THERE IS NO CACHE BUMP IN DEVELOPMENT (2026-09-03). Every tagged JS/CSS URL
// in the committed index.html reads `?v=dev`; tools/gen/gen-shell.mjs writes the
// tag blocks from tools/manifest.cjs and never hashes. pages.yml stages the
// site and runs `--apply --at <2000 + commit count> --root _site`, which
// rewrites every tag to that file's 12-hex SHA-256 and stamps the generation,
// so the deployed shell is content-addressed and the committed one is
// stable. Before this, 151 hashes were committed and index.html sat in 77 of
// 199 commits for hash churn alone.
//
//   node tools/ci/bump-cache.mjs                        # repo check: every tag is ?v=dev, meta == version.json
//   node tools/ci/bump-cache.mjs --check --root <dir>   # staged check: every tag carries its content hash
//   node tools/ci/bump-cache.mjs --apply --at N --root <dir>   # what pages.yml runs while staging
//   node tools/ci/bump-cache.mjs --apply --root <dir>   # hash a staged copy, keep its generation
//   ... --json
//
// `--apply` without `--root` REFUSES (exit 2): a habitual repo-side run would
// put 151 hashes back into the shell. `--advance` / `--merge <ref>` move the
// generation inside a staged copy only.
//
// THE LAZY FILES HAVE NO TAG (R3-PHONE-8). DEFERRED backends, the 52 circuits
// and their scenery closures, and the LAZY_* bundles are injected by
// js/core/script-loader.js (and the build worker) as `<path>?v=<build>`, so
// every deploy was a new URL for ~200 files whatever changed: a returning phone
// re-downloaded ~1.9 MB gzip per build. `--apply` therefore also writes a
// `path → content hash` map into the staged shell as a JSON data block
// (`<script type="application/json" id="apex-lazy-v">`, never executed, so the
// CSP's script hashes are untouched); ScriptLoader.url() and sw.js's install
// stamp key on it and fall back to the build when it is absent (dev server,
// committed shell). `--check --root` verifies it like the tags.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
exitIfHelp(argv, `usage: node tools/ci/bump-cache.mjs [--check] [--json]            # in the repo: assert every tag reads ?v=dev
       node tools/ci/bump-cache.mjs --apply --at <N> --root <dir>   # deploy-side (pages.yml): hash a STAGED shell
  There is no cache bump in development; --apply refuses without --root.`);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
// --root is RESOLVED: pages.yml passes the relative `_site`, and the asset-path
// guard below compares against an absolute prefix — a relative ROOT rejected
// every tag ("Invalid versioned asset path: css/tokens.css") and failed the
// first stamped deploy (run 1873, 2026-09-01).
const STAGED = !!opt("--root");
const ROOT = STAGED ? path.resolve(opt("--root")) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INDEX = path.join(ROOT, "index.html");
const VERSION = path.join(ROOT, "version.json");
// Every other ROOT page whose tags carry `?v=` — hashed like the shell, no
// generation meta of its own. Optional: a staged copy that lacks one is a
// pages.yml `cp` omission tests/unit/ci-coverage.test.mjs reports, not this
// tool's failure.
const EXTRA_PAGES = ["controller.html", "cockpit-view.html"].map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f));
export const DEV_TOKEN = "dev";
const TAG_RE = /\b(src|href)="([^"?#]+)\?v=([A-Za-z0-9._-]+)"/g;
const META_RE = /(<meta\s+name="apex-build"\s+content=")([1-9][0-9]*)("\s*\/?>)/;
export const LAZY_V_ID = "apex-lazy-v";
const LAZY_V_RE = new RegExp(`\\n?<script type="application/json" id="${LAZY_V_ID}">([\\s\\S]*?)</script>`);

// Every file the page injects WITHOUT a tag, from the roster's own source.
// js/workers/bitmap-decode-worker.js stays build-keyed: its client
// (js/workers/bitmap-decode-client.js) still builds `?v=<build>` itself, and the
// SW must precache it under the key that client asks for.
function lazyFiles() {
  const M = createRequire(import.meta.url)("../manifest.cjs");
  const lists = [...Object.values(M.DEFERRED || {}), M.LAZY_AGENT, M.LAZY_RACE, M.LAZY_RACE_SESSION, M.LAZY_AUDIO,
    M.LAZY_DATA, M.LAZY_NET, M.LAZY_EDITOR, M.LAZY_XR, M.LAZY_CAM_EDITOR, M.LAZY_CAREER_UI, M.LAZY_CIRCUIT, M.LAZY_SCENERY,
    (M.LAZY_WORKER || []).filter((f) => f !== "js/workers/bitmap-decode-worker.js")];
  return [...new Set(lists.flat().filter((f) => typeof f === "string"))].sort();
}
// The map for the files this root actually holds (a fixture shell holds none).
function lazyMap() {
  const out = {};
  for (const rel of lazyFiles()) if (fs.existsSync(path.join(ROOT, rel))) out[rel] = digest(rel);
  return out;
}
function readLazyMap(html) {
  const m = html.match(LAZY_V_RE);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (_) { return {}; }
}
function writeLazyMap(html, map) {
  const bare = html.replace(LAZY_V_RE, "");
  if (!Object.keys(map).length) return bare;
  const block = `<script type="application/json" id="${LAZY_V_ID}">${JSON.stringify(map)}</script>`;
  if (/<\/head>/i.test(bare)) return bare.replace(/<\/head>/i, `${block}\n</head>`);
  return bare.replace(META_RE, (meta) => `${meta}\n${block}`);
}

function digest(rel) {
  const target = path.resolve(ROOT, rel);
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (!target.startsWith(rootPrefix) || !fs.statSync(target).isFile()) {
    throw new Error(`Invalid versioned asset path: ${rel}`);
  }
  return createHash("sha256").update(fs.readFileSync(target)).digest("hex").slice(0, 12);
}

function readState() {
  const html = fs.readFileSync(INDEX, "utf8");
  const tags = [...html.matchAll(TAG_RE)].map((m) => ({ rel: m[2], actual: m[3] }));
  for (const page of EXTRA_PAGES) {
    for (const m of fs.readFileSync(page, "utf8").matchAll(TAG_RE)) tags.push({ rel: m[2], actual: m[3], page: path.basename(page) });
  }
  let build = null;
  try { build = JSON.parse(fs.readFileSync(VERSION, "utf8")).build; } catch (_) { /* verdict reports it */ }
  const meta = html.match(META_RE);
  const shellBuild = meta ? Number(meta[2]) : null;
  return { html, tags, build, shellBuild };
}

function verdict() {
  const { html, tags, build, shellBuild } = readState();
  const mismatches = [];
  for (const tag of tags) {
    if (!STAGED) {
      // The repo shell is content-addressed at DEPLOY, never in the tree.
      if (tag.actual !== DEV_TOKEN) mismatches.push({ ...tag, expected: DEV_TOKEN });
      continue;
    }
    let expected = null;
    try { expected = digest(tag.rel); }
    catch (error) { mismatches.push({ ...tag, error: error.message }); continue; }
    if (tag.actual !== expected) mismatches.push({ ...tag, expected });
  }
  // The lazy map: every lazy file the staged root holds, at its content hash.
  // The repo shell carries none (its loads fall back to ?v=<build>).
  const lazy = readLazyMap(html);
  if (!STAGED && lazy) mismatches.push({ rel: LAZY_V_ID, actual: "present", expected: "absent from the repo shell" });
  if (STAGED) {
    const want = lazyMap();
    for (const [rel, expected] of Object.entries(want)) {
      const actual = lazy && lazy[rel];
      if (actual !== expected) mismatches.push({ rel, actual: actual || null, expected, page: LAZY_V_ID });
    }
    for (const rel of Object.keys(lazy || {})) if (!(rel in want)) mismatches.push({ rel, actual: lazy[rel], expected: null, page: LAZY_V_ID });
  }
  const consistent = tags.length > 0 && mismatches.length === 0 &&
    Number.isInteger(build) && build > 0 && shellBuild === build;
  return {
    consistent,
    mode: STAGED ? "staged" : "repo",
    tagCount: tags.length,
    lazyCount: lazy ? Object.keys(lazy).length : 0,
    assetMismatches: mismatches,
    shellBuild,
    versionJson: build,
  };
}

function apply() {
  if (!STAGED) {
    throw Object.assign(new Error(
      "refusing --apply on the repo shell: tags read ?v=dev and hashes are stamped by the deploy " +
      "(pages.yml: --apply --at N --root _site). After a manifest change run `node tools/gen/gen-shell.mjs`."),
      { exitCode: 2 });
  }
  const { html, build, shellBuild } = readState();
  const candidates = [Number(build) || 0, Number(shellBuild) || 0];
  const mergeRef = opt("--merge");
  if (mergeRef) {
    const theirs = JSON.parse(execFileSync("git", ["show", `${mergeRef}:version.json`],
      { cwd: ROOT, encoding: "utf8" })).build;
    candidates.push(Number(theirs) || 0);
  }
  const current = Number.isInteger(build) && build > 0 ? build : Math.max(...candidates);
  const next = opt("--at") ? Number(opt("--at"))
    : flag("--advance") ? Math.max(...candidates) + 1
    : current;
  if (!Number.isInteger(next) || next < 1) throw new Error("--at must be a positive integer");
  let tagCount = 0;
  const hashTags = (text) => text.replace(TAG_RE, (_all, attr, rel) => {
    tagCount++;
    return `${attr}="${rel}?v=${digest(rel)}"`;
  });
  // An extra page carries the same apex-build meta when it has one (controller.html
  // since 2026-10-10: the SW compares it to the shell's), so stamp it in step.
  for (const page of EXTRA_PAGES) fs.writeFileSync(page, hashTags(fs.readFileSync(page, "utf8")).replace(META_RE, `$1${next}$3`));
  let output = hashTags(html);
  if (!META_RE.test(output)) throw new Error('index.html is missing <meta name="apex-build" content="N">');
  output = output.replace(META_RE, `$1${next}$3`);
  const lazy = lazyMap();
  output = writeLazyMap(output, lazy);
  fs.writeFileSync(INDEX, output);
  fs.writeFileSync(VERSION, `{ "build": ${next} }\n`);
  return { applied: next, from: Math.max(...candidates), tagCount, lazyCount: Object.keys(lazy).length };
}

let result;
try { result = flag("--apply") ? apply() : verdict(); }
catch (error) {
  if (flag("--json")) console.log(JSON.stringify({ consistent: false, error: error.message }, null, 2));
  else console.error(error.message);
  process.exit(error.exitCode || 1);
}
if (flag("--json")) console.log(JSON.stringify(result, null, 2));
else if (flag("--apply")) console.log(`hashed ${result.tagCount} tag(s) and ${result.lazyCount} lazy file(s); shell build ${result.applied}`);
else console.log(result.consistent
  ? (STAGED
    ? `consistent at shell build ${result.versionJson} (${result.tagCount} content-hashed tags)`
    : `consistent at shell build ${result.versionJson} (${result.tagCount} tags read ?v=dev; hashes are stamped at deploy)`)
  : `INCONSISTENT: ${result.assetMismatches.length} tag mismatch(es), shell ${result.shellBuild}, version.json ${result.versionJson}`);
process.exit(flag("--apply") || result.consistent ? 0 : 1);
