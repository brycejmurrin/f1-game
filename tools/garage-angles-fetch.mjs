#!/usr/bin/env node
// @doc Download garage-before-<sha> for a SHA (default merge-base with ship); nearest ancestor + compare staleness.
// @skill garage-parts-livery
// @skill playwright-probe
//
// Car/garage agents MUST fetch this pack instead of capturing their own
// BEFORE grid. The capture lives on macos in .github/workflows/garage-before.yml
// (`Garage before`). This script is read-only: GH_TOKEN / GITHUB_TOKEN or
// `gh auth token`, then the Actions artifacts API.
//
//   node tools/garage-angles-fetch.mjs
//   node tools/garage-angles-fetch.mjs --sha HEAD
//   node tools/garage-angles-fetch.mjs --sha <merge-base> --out artifacts/garage-before
//   node tools/garage-angles-fetch.mjs --dry-run
//   node tools/garage-angles-fetch.mjs --help
//
// Default SHA is `git merge-base HEAD <ship>`. If that exact SHA has no pack,
// the newest ancestor pack is used and a compare call prints how stale it is
// (commits ahead + watched files under js/car|garage|render, teams.js, tools).
// No pack at all → exit 2. API / usage errors → exit 3.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { githubToken, NO_TOKEN_HINT } from "./ci/github-token.mjs";
import {
  SHIP_BRANCH, ARTIFACT_PREFIX,
  artifactName, listPackArtifacts, pickNearestPack, compareCommits,
  resolveCommitSha,
} from "./shot/garage-before.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const USAGE = `usage: node tools/garage-angles-fetch.mjs [--sha <rev>] [--out <dir>] [--ship <branch>] [--dry-run] [--json]
       node tools/garage-angles-fetch.mjs --help

Download the Garage before pack (artifact ${ARTIFACT_PREFIX}<sha>) for a SHA.
Default --sha is git merge-base HEAD <ship> (ship=${SHIP_BRANCH}).
If that SHA has no pack, the nearest ancestor pack is used and a compare call
prints commits / watched files (js/car|garage|render, teams.js, capture tools)
since then. Exit 2 when no pack exists.`;

function flag(argv, name, dflt) {
  const eq = argv.find((a) => a.startsWith(name + "="));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1];
  return dflt;
}

function git(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim() : "";
}

export function defaultSha({ ship = SHIP_BRANCH } = {}) {
  return git(["merge-base", "HEAD", `origin/${ship}`])
    || git(["merge-base", "HEAD", ship])
    || "";
}

export function loadArtifactsOverride(argv) {
  const raw = flag(argv, "--artifacts", "");
  if (!raw) return null;
  const text = raw.startsWith("@") ? fs.readFileSync(raw.slice(1), "utf8") : raw;
  return JSON.parse(text);
}

function downloadZip(artifactId, destZip, token) {
  const args = ["-sS", "-L", "--max-time", "120", "-K", "-", "-o", destZip, "-w", "%{http_code}",
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28",
    `https://api.github.com/repos/${REPO}/actions/artifacts/${artifactId}/zip`];
  const r = spawnSync("curl", args, {
    encoding: "utf8",
    input: `header = "Authorization: Bearer ${token}"\n`,
    maxBuffer: 8 << 20,
  });
  if (r.status !== 0) return { error: (r.stderr || "curl failed").trim() };
  const code = Number((r.stdout || "").trim());
  if (code !== 200) return { error: `HTTP ${code} downloading artifact ${artifactId}` };
  return { ok: true };
}

function unzipInto(zip, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const r = spawnSync("unzip", ["-o", "-q", zip, "-d", outDir], { encoding: "utf8" });
  if (r.status !== 0) return { error: (r.stderr || r.stdout || "unzip failed").trim() };
  return { ok: true };
}

function summarize(result) {
  const lines = [];
  lines.push(`pack sha=${result.packSha} requested=${result.wantSha} exact=${result.exact}`);
  if (result.exact) {
    lines.push("stale: 0 commits (exact SHA pack)");
  } else if (result.compare) {
    const files = result.compare.watched || [];
    lines.push(`stale: ${result.compare.ahead_by || 0} commits ahead of pack; ${files.length} watched files:`);
    for (const f of files.slice(0, 40)) lines.push(`  ${f}`);
    if (!files.length) lines.push("  (no js/car|garage|render / teams.js / capture-tool files in the compare)");
  }
  if (result.out) lines.push(`out: ${result.out}`);
  return lines.join("\n");
}

export async function fetchPack(opts = {}) {
  const wantIn = opts.sha || defaultSha({ ship: opts.ship || SHIP_BRANCH });
  if (!wantIn) return { error: `cannot resolve SHA (pass --sha or fetch origin/${SHIP_BRANCH})`, code: 3 };
  const token = opts.token !== undefined ? opts.token : githubToken();
  let wantSha = wantIn;
  if (/^[0-9a-f]{40}$/i.test(wantIn)) {
    wantSha = wantIn.toLowerCase();
  } else if (opts.resolve !== false && token) {
    const r = await resolveCommitSha(wantIn, { token });
    if (r.error) return { error: r.error, code: 3 };
    wantSha = r.sha;
  } else {
    const full = git(["rev-parse", wantIn]);
    if (full) wantSha = full;
  }

  // Exact pack name first (?name=); page only when nearest-ancestor is needed.
  let listed;
  if (opts.artifacts) {
    listed = await listPackArtifacts({ artifacts: opts.artifacts });
  } else {
    let exactName = null;
    try { exactName = artifactName(wantSha); } catch { /* fall through */ }
    if (exactName) {
      const named = await listPackArtifacts({ token, name: exactName });
      if (named.error) return { error: named.error, code: 3 };
      if (named.length) listed = named;
    }
    if (!listed) listed = await listPackArtifacts({ token });
  }
  if (listed.error) return { error: listed.error, code: 3 };
  const packs = listed;
  if (!packs.length) {
    return { error: `no ${ARTIFACT_PREFIX}<sha> pack for ${wantSha} or any ancestor`, code: 2, wantSha, packs: [] };
  }

  const compares = opts.compares || {};
  const needCompare = !packs.some((p) => wantSha.startsWith(p.sha) || p.sha.startsWith(wantSha));
  if (needCompare && token && !opts.compares) {
    for (const p of packs) {
      const c = await compareCommits(p.sha, wantSha, { token });
      if (!c.error) compares[p.sha] = c;
    }
  }
  const picked = pickNearestPack(wantSha, packs, compares);
  if (!picked) {
    return { error: `no ${ARTIFACT_PREFIX}<sha> pack for ${wantSha} or any ancestor`, code: 2, wantSha, packs };
  }

  let compare = picked.compare;
  if (!picked.exact && !compare && token) {
    const c = await compareCommits(picked.pack.sha, wantSha, { token });
    if (!c.error) compare = c;
  }

  const result = {
    wantSha,
    packSha: picked.pack.sha,
    packName: picked.pack.name || artifactName(picked.pack.sha),
    packId: picked.pack.id,
    exact: !!picked.exact,
    compare: compare || { ahead_by: picked.ahead_by || 0, watched: [], status: picked.exact ? "identical" : "ahead" },
    out: opts.out || null,
  };

  if (opts.dryRun) return result;

  if (!picked.pack.id) return { error: `pack ${result.packName} has no artifact id (dry catalog?)`, code: 3, ...result };
  if (!token) return { error: NO_TOKEN_HINT, code: 3, ...result };

  const outDir = path.resolve(opts.out || path.join(ROOT, "artifacts", "garage-before"));
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = path.join(os.tmpdir(), `garage-before-${process.pid}.zip`);
  const dl = downloadZip(picked.pack.id, tmp, token);
  if (dl.error) return { error: dl.error, code: 3, ...result };
  const uz = unzipInto(tmp, outDir);
  fs.rmSync(tmp, { force: true });
  if (uz.error) return { error: uz.error, code: 3, ...result };
  result.out = outDir;
  return result;
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  const sha = flag(argv, "--sha", "");
  const out = flag(argv, "--out", path.join(ROOT, "artifacts", "garage-before"));
  const ship = flag(argv, "--ship", SHIP_BRANCH);
  const dryRun = argv.includes("--dry-run");
  const asJson = argv.includes("--json");
  const artifacts = loadArtifactsOverride(argv);

  return fetchPack({
    sha: sha || undefined,
    out,
    ship,
    dryRun,
    artifacts,
    token: artifacts ? null : undefined,
    resolve: !artifacts,
  }).then((result) => {
    if (result.error && result.code === 2) {
      if (asJson) console.log(JSON.stringify(result, null, 2));
      else console.error(result.error);
      return 2;
    }
    if (result.error) {
      console.error(result.error);
      return result.code || 3;
    }
    if (asJson) console.log(JSON.stringify(result, null, 2));
    else console.log(summarize(result));
    return 0;
  });
}

export { summarize };

if (import.meta.url === `file://${process.argv[1]}`) {
  Promise.resolve(main()).then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(3);
  });
}
