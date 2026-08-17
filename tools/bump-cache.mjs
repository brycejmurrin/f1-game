#!/usr/bin/env node
// bump-cache.mjs — the cache-bust bump as a TOOL instead of a ritual.
//
// The convention (AGENTS.md, .claude/skills/bump-cache): after ANY js/css
// change, every `?v=N` in index.html moves to max+1 and version.json carries
// the same N, as the LAST edit before commit. It is the single most-forgotten
// step, and until now the only automation was a pair of sed one-liners in a
// skill and an after-the-fact guard (tests/unit/load-order.test.mjs). This
// makes it deterministic:
//
//   node tools/bump-cache.mjs --check            # exit 0 consistent, 1 not
//   node tools/bump-cache.mjs --check --since <ref>   # also: assets changed
//                                                # since <ref> but N did not
//   node tools/bump-cache.mjs --apply            # bump everything to max+1
//   node tools/bump-cache.mjs --apply --at 1400  # bump to an explicit N
//   node tools/bump-cache.mjs --apply --merge <ref>   # cross-lineage: take
//                                                # max(ours, theirs at <ref>)+1
//   ... --json                                   # machine-readable verdict
//
// --merge exists for the deploy-branch protocol (.claude/skills/deploy-merge):
// two lineages bump independently, so the union must land ABOVE both — taking
// either side's N re-serves the other side's stale files to every PWA client.
//
// NEVER run --apply while a browser test run is in flight: the bump is the
// last edit before commit (version.json changing mid-run breaks the shell
// version guard specs — .claude/skills/pwa-cache-service-worker).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };

// --root is for the unit test, which must exercise --apply against a fixture
// tree rather than the real shell.
const ROOT = opt("--root") || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "index.html");
const VERSION = path.join(ROOT, "version.json");

function readState() {
  const html = fs.readFileSync(INDEX, "utf8");
  const tags = [...html.matchAll(/\?v=(\d+)/g)].map((m) => +m[1]);
  let build = null;
  try { build = JSON.parse(fs.readFileSync(VERSION, "utf8")).build; } catch (_) { /* reported below */ }
  return { html, tags, build };
}

function verdict() {
  const { tags, build } = readState();
  const uniq = [...new Set(tags)];
  const consistent = uniq.length === 1 && build === uniq[0];
  const out = {
    consistent,
    tagCount: tags.length,
    tagVersions: uniq.sort((a, b) => a - b),
    versionJson: build,
  };
  // --since <ref>: shipped assets changed but the version did not — the
  // forgotten-bump case the guard suite only catches after the fact.
  const since = opt("--since");
  if (since) {
    const diff = execFileSync("git", ["diff", "--name-only", since, "--", "js/", "css/", "index.html", "sw.js"],
      { cwd: ROOT, encoding: "utf8" }).trim();
    const versionMoved = execFileSync("git", ["diff", "--name-only", since, "--", "version.json"],
      { cwd: ROOT, encoding: "utf8" }).trim() !== "";
    out.assetsChangedSince = diff ? diff.split("\n") : [];
    out.bumpNeeded = out.assetsChangedSince.length > 0 && !versionMoved;
    if (out.bumpNeeded) out.consistent = false;
  }
  return out;
}

function apply() {
  const { html, tags, build } = readState();
  const candidates = [...tags, build || 0];
  const mergeRef = opt("--merge");
  if (mergeRef) {
    // Their lineage's version.json — max+1 must clear BOTH sides.
    const theirs = JSON.parse(execFileSync("git", ["show", `${mergeRef}:version.json`],
      { cwd: ROOT, encoding: "utf8" })).build;
    candidates.push(theirs);
  }
  const next = opt("--at") ? +opt("--at") : Math.max(...candidates) + 1;
  fs.writeFileSync(INDEX, html.replace(/\?v=\d+/g, `?v=${next}`));
  fs.writeFileSync(VERSION, `{ "build": ${next} }\n`);
  return { applied: next, from: Math.max(...candidates), tagCount: tags.length };
}

const result = flag("--apply") ? apply() : verdict();
if (flag("--json")) console.log(JSON.stringify(result, null, 2));
else if (flag("--apply")) console.log(`bumped ${result.tagCount} tag(s) + version.json to ${result.applied}`);
else console.log(result.consistent
  ? `consistent at ${result.versionJson} (${result.tagCount} tags)`
  : `INCONSISTENT: tags ${JSON.stringify(result.tagVersions)} vs version.json ${result.versionJson}` +
    (result.bumpNeeded ? ` — assets changed since ${opt("--since")} without a bump` : ""));
process.exit(flag("--apply") || result.consistent ? 0 : 1);
