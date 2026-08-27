#!/usr/bin/env node
// bump-cache.mjs — deterministic per-file cache busting plus shell generation.
//
// Every local JS/CSS URL in index.html carries a short SHA-256 of that file's
// contents. Unchanged assets therefore keep stable URLs (and browser/V8 caches)
// across releases. version.json and <meta name="apex-build"> still advance as a
// monotonic shell/service-worker generation.
//
//   node tools/bump-cache.mjs                  # check (the default mode)
//   node tools/bump-cache.mjs --since <ref>    # check incl. "assets changed since ref"
//   node tools/bump-cache.mjs --apply [--at N] [--merge <ref>]
//   ... --json
// (--check is accepted for readability but not parsed — checking IS the
// no-flag default; only --apply changes anything.)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const ROOT = opt("--root") || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "index.html");
const VERSION = path.join(ROOT, "version.json");
const TAG_RE = /\b(src|href)="([^"?#]+)\?v=([A-Za-z0-9._-]+)"/g;
const META_RE = /(<meta\s+name="apex-build"\s+content=")([1-9][0-9]*)("\s*\/?>)/;
// These paths are served cache-first at stable paths, or contain code loaded
// with ?v=<shell build> rather than a per-file digest. Any byte change here
// therefore requires a strictly newer service-worker/shell generation.
const GENERATION_PATHS = Object.freeze([
  "js/", "css/", "index.html", "sw.js", "manifest.json",
  "icons/", "assets/", "vendor/",
]);

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
    let expected = null;
    try { expected = digest(tag.rel); }
    catch (error) { mismatches.push({ ...tag, error: error.message }); continue; }
    if (tag.actual !== expected) mismatches.push({ ...tag, expected });
  }
  const consistent = tags.length > 0 && mismatches.length === 0 &&
    Number.isInteger(build) && build > 0 && shellBuild === build;
  const out = {
    consistent,
    tagCount: tags.length,
    assetMismatches: mismatches,
    shellBuild,
    versionJson: build,
  };
  const since = opt("--since");
  if (since) {
    const diff = execFileSync("git", ["diff", "--name-only", since, "--", ...GENERATION_PATHS],
      { cwd: ROOT, encoding: "utf8" }).trim();
    const versionMoved = execFileSync("git", ["diff", "--name-only", since, "--", "version.json"],
      { cwd: ROOT, encoding: "utf8" }).trim() !== "";
    const baseBuild = JSON.parse(execFileSync("git", ["show", `${since}:version.json`],
      { cwd: ROOT, encoding: "utf8" })).build;
    if (!Number.isInteger(baseBuild) || baseBuild <= 0) {
      throw new Error(`${since}:version.json has an invalid build`);
    }
    out.assetsChangedSince = diff ? diff.split("\n") : [];
    out.versionMoved = versionMoved;
    out.baseBuild = baseBuild;
    out.generationAdvanced = Number.isInteger(build) && build > baseBuild;
    out.bumpNeeded = out.assetsChangedSince.length > 0 && !out.generationAdvanced;
    out.generationRegressed = Number.isInteger(build) && build < baseBuild;
    if (out.bumpNeeded || out.generationRegressed) out.consistent = false;
  }
  return out;
}

function apply() {
  const { html, build, shellBuild } = readState();
  const candidates = [Number(build) || 0, Number(shellBuild) || 0];
  const mergeRef = opt("--merge");
  if (mergeRef) {
    const theirs = JSON.parse(execFileSync("git", ["show", `${mergeRef}:version.json`],
      { cwd: ROOT, encoding: "utf8" })).build;
    candidates.push(Number(theirs) || 0);
  }
  const next = opt("--at") ? Number(opt("--at")) : Math.max(...candidates) + 1;
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
  process.exit(1);
}
if (flag("--json")) console.log(JSON.stringify(result, null, 2));
else if (flag("--apply")) console.log(`hashed ${result.tagCount} tag(s); shell build ${result.applied}`);
else console.log(result.consistent
  ? `consistent at shell build ${result.versionJson} (${result.tagCount} content-hashed tags)`
  : `INCONSISTENT: ${result.assetMismatches.length} asset hash mismatch(es), shell ${result.shellBuild}, version.json ${result.versionJson}` +
    (result.bumpNeeded ? ` — cache-sensitive assets changed since ${opt("--since")} without a newer shell generation` : "") +
    (result.generationRegressed ? ` — shell generation regressed below ${result.baseBuild}` : ""));
process.exit(flag("--apply") || result.consistent ? 0 : 1);
