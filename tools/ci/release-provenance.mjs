#!/usr/bin/env node
/*
 * @doc Proves the deployed revision by combining local git ancestry with live shell SHA/build metadata.
 * release-provenance.mjs — prove which source revision is actually deployed.
 *
 * Read-only.  It combines local git ancestry with the live shell's stamped
 * `apex-sha`/`apex-build` metadata so review and CI never confuse newer source
 * behavior with behavior served by Pages.
 *
 *   node tools/ci/release-provenance.mjs
 *   node tools/ci/release-provenance.mjs --site https://example.test/game --json
 *   node tools/ci/release-provenance.mjs --strict
 */
import { execFileSync } from "node:child_process";

const DEFAULT_DEPLOY_REF = "origin/claude/f1-game-project-26h3ng";
const DEFAULT_SITE = "https://brycejmurrin.github.io/f1-game";

function git(args) {
  try { return execFileSync("git", args, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim(); }
  catch (_) { return null; }
}

export function parseLiveShell(html) {
  const text = String(html || "");
  const meta = (name) => {
    const re = new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']+)["']`, "i");
    return re.exec(text)?.[1] || null;
  };
  const sha = meta("apex-sha");
  return {
    sha: /^[0-9a-f]{40}$/i.test(sha || "") ? sha.toLowerCase() : null,
    build: meta("apex-build"),
    version: meta("apex-version"),
  };
}

export function ancestryVerdict({ sourceSha, deploySha, liveSha, mergeBase }) {
  if (!liveSha) return "live-unknown";
  if (liveSha === sourceSha && liveSha === deploySha) return "live-exact-source-and-deploy";
  if (liveSha === sourceSha) return "live-exact-source";
  if (liveSha === deploySha) return "live-exact-deploy";
  if (liveSha === mergeBase) return "live-at-merge-base";
  if (mergeBase === liveSha) return "source-and-deploy-diverged-from-live";
  return "source-or-deploy-newer-than-live";
}

export function renderMarkdown(p) {
  const row = (label, value) => `| ${label} | ${value ?? "unknown"} |`;
  return [
    "# Release provenance",
    "",
    `Verdict: **${p.verdict}**`,
    "",
    "| Evidence | Value |",
    "|---|---|",
    row("Repository", p.repository),
    row("Branch", p.branch),
    row("Source SHA", p.sourceSha),
    row("Deploy SHA", p.deploySha),
    row("Live SHA", p.liveSha),
    row("Merge base", p.mergeBase),
    row("Live build", p.liveBuild),
    row("Live version", p.liveVersion),
    row("Working tree", p.dirty ? "dirty" : "clean"),
    row("Site", p.site),
    "",
    p.verdict === "live-exact-source-and-deploy"
      ? "Live, deploy, and source point at the same commit."
      : p.verdict === "live-exact-deploy"
        ? "The deploy tip is live; the current source checkout may be newer or different."
        : p.verdict === "live-exact-source"
          ? "The current source checkout is live; deploy-ref ancestry should be checked separately."
          : p.verdict === "live-unknown"
            ? "The live shell did not provide a trustworthy SHA; deployed behavior is unproven."
            : "Live behavior is older or divergent from at least one local source reference.",
    "",
  ].join("\n");
}

async function fetchLive(site) {
  if (!site) return { sha: null, build: null, version: null };
  try {
    const url = `${site.replace(/\/$/, "")}/index.html?_provenance=${Date.now()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: "text/html" } });
    if (!res.ok) return { sha: null, build: null, version: null, error: `HTTP ${res.status}` };
    return parseLiveShell(await res.text());
  } catch (e) {
    return { sha: null, build: null, version: null, error: e?.message || String(e) };
  }
}

export async function collect(opts = {}) {
  const site = opts.site || process.env.APEX_SITE || DEFAULT_SITE;
  const deployRef = opts.deployRef || process.env.APEX_DEPLOY_REF || DEFAULT_DEPLOY_REF;
  const sourceSha = git(["rev-parse", "HEAD"]);
  const deploySha = git(["rev-parse", deployRef]);
  const mergeBase = sourceSha && deploySha ? git(["merge-base", sourceSha, deploySha]) : null;
  const live = await fetchLive(site);
  const dirty = !!git(["status", "--porcelain"]);
  const result = {
    repository: git(["remote", "get-url", "origin"]) || null,
    branch: git(["branch", "--show-current"]) || "(detached)",
    sourceSha, deployRef, deploySha, liveSha: live.sha, mergeBase,
    liveBuild: live.build || null, liveVersion: live.version || null,
    site, dirty, liveError: live.error || null,
  };
  result.verdict = ancestryVerdict(result);
  return result;
}

function args(argv) {
  const out = { json: false, strict: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") out.json = true;
    else if (argv[i] === "--strict") out.strict = true;
    else if (argv[i] === "--site") out.site = argv[++i];
    else if (argv[i] === "--deploy-ref") out.deployRef = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") out.help = true;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opt = args(process.argv.slice(2));
  if (opt.help) {
    console.log("Usage: release-provenance.mjs [--site URL] [--deploy-ref REF] [--json] [--strict]");
    process.exit(0);
  }
  const result = await collect(opt);
  console.log(opt.json ? JSON.stringify(result, null, 2) : renderMarkdown(result));
  if (opt.strict && (result.dirty || !result.liveSha || result.verdict === "source-or-deploy-newer-than-live")) process.exitCode = 1;
}

