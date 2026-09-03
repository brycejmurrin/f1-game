#!/usr/bin/env node
// bump-cache.mjs — the DEPLOY-side content hasher; a consistency check in the repo.
// @doc Deploy-time content hashing of a STAGED shell (`--apply --at N --root _site`); in the repo, `--check` confirms every tag reads `?v=dev`.
// @skill check-changes
//
// THERE IS NO CACHE BUMP IN DEVELOPMENT (2026-09-03). Every tagged JS/CSS URL
// in the committed index.html reads `?v=dev`; tools/gen-shell.mjs writes the
// tag blocks from tools/manifest.cjs and never hashes. pages.yml stages the
// site and runs `--apply --at <2000 + commit count> --root _site`, which
// rewrites every tag to that file's 12-hex SHA-256 and stamps the generation,
// so the deployed shell is content-addressed and the committed one is
// stable. Before this, 151 hashes were committed and index.html sat in 77 of
// 199 commits for hash churn alone.
//
//   node tools/bump-cache.mjs                        # repo check: every tag is ?v=dev, meta == version.json
//   node tools/bump-cache.mjs --check --root <dir>   # staged check: every tag carries its content hash
//   node tools/bump-cache.mjs --apply --at N --root <dir>   # what pages.yml runs while staging
//   node tools/bump-cache.mjs --apply --root <dir>   # hash a staged copy, keep its generation
//   ... --json
//
// `--apply` without `--root` REFUSES (exit 2): a habitual repo-side run would
// put 151 hashes back into the shell. `--advance` / `--merge <ref>` move the
// generation inside a staged copy only.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
// --root is RESOLVED: pages.yml passes the relative `_site`, and the asset-path
// guard below compares against an absolute prefix — a relative ROOT rejected
// every tag ("Invalid versioned asset path: css/tokens.css") and failed the
// first stamped deploy (run 1873, 2026-09-01).
const STAGED = !!opt("--root");
const ROOT = STAGED ? path.resolve(opt("--root")) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "index.html");
const VERSION = path.join(ROOT, "version.json");
export const DEV_TOKEN = "dev";
const TAG_RE = /\b(src|href)="([^"?#]+)\?v=([A-Za-z0-9._-]+)"/g;
const META_RE = /(<meta\s+name="apex-build"\s+content=")([1-9][0-9]*)("\s*\/?>)/;

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
  let build = null;
  try { build = JSON.parse(fs.readFileSync(VERSION, "utf8")).build; } catch (_) { /* verdict reports it */ }
  const meta = html.match(META_RE);
  const shellBuild = meta ? Number(meta[2]) : null;
  return { html, tags, build, shellBuild };
}

function verdict() {
  const { tags, build, shellBuild } = readState();
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
  const consistent = tags.length > 0 && mismatches.length === 0 &&
    Number.isInteger(build) && build > 0 && shellBuild === build;
  return {
    consistent,
    mode: STAGED ? "staged" : "repo",
    tagCount: tags.length,
    assetMismatches: mismatches,
    shellBuild,
    versionJson: build,
  };
}

function apply() {
  if (!STAGED) {
    throw Object.assign(new Error(
      "refusing --apply on the repo shell: tags read ?v=dev and hashes are stamped by the deploy " +
      "(pages.yml: --apply --at N --root _site). After a manifest change run `node tools/gen-shell.mjs`."),
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
  let output = html.replace(TAG_RE, (_all, attr, rel) => {
    tagCount++;
    return `${attr}="${rel}?v=${digest(rel)}"`;
  });
  if (!META_RE.test(output)) throw new Error('index.html is missing <meta name="apex-build" content="N">');
  output = output.replace(META_RE, `$1${next}$3`);
  fs.writeFileSync(INDEX, output);
  fs.writeFileSync(VERSION, `{ "build": ${next} }\n`);
  return { applied: next, from: Math.max(...candidates), tagCount };
}

let result;
try { result = flag("--apply") ? apply() : verdict(); }
catch (error) {
  if (flag("--json")) console.log(JSON.stringify({ consistent: false, error: error.message }, null, 2));
  else console.error(error.message);
  process.exit(error.exitCode || 1);
}
if (flag("--json")) console.log(JSON.stringify(result, null, 2));
else if (flag("--apply")) console.log(`hashed ${result.tagCount} tag(s); shell build ${result.applied}`);
else console.log(result.consistent
  ? (STAGED
    ? `consistent at shell build ${result.versionJson} (${result.tagCount} content-hashed tags)`
    : `consistent at shell build ${result.versionJson} (${result.tagCount} tags read ?v=dev; hashes are stamped at deploy)`)
  : `INCONSISTENT: ${result.assetMismatches.length} tag mismatch(es), shell ${result.shellBuild}, version.json ${result.versionJson}`);
process.exit(flag("--apply") || result.consistent ? 0 : 1);
