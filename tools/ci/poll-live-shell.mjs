#!/usr/bin/env node
// @doc Poll github.io until the live shell matches this deploy, a newer train
//      superseded it, or the bounded window expires — then fail with the last
//      live build/sha so lag and supersession are distinguishable.
//
//   node tools/ci/poll-live-shell.mjs \
//     --url https://…/f1-game/ --build 18530 --sha <40-hex>
//
// Exit 0 on exact match or superseded; exit 1 when the live shell never reaches
// this build (or a descendant) with a coherent apex-sha. Writes
// `outcome=match|superseded` to $GITHUB_OUTPUT when set so a follow-up byte
// check can skip a train that already moved on.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const META_RE = /<meta\s+name="(apex-build|apex-sha)"\s+content="([^"]*)"\s*\/?\s*>/gi;

/** @param {string} html */
export function parseShellMetas(html) {
  const builds = [];
  const shas = [];
  for (const match of String(html || "").matchAll(META_RE)) {
    if (match[1] === "apex-build") builds.push(match[2]);
    else if (match[1] === "apex-sha") shas.push(match[2]);
  }
  return {
    build: builds.length === 1 && /^\d+$/.test(builds[0]) ? Number(builds[0]) : null,
    sha: shas.length === 1 && /^[0-9a-f]{40}$/i.test(shas[0]) ? shas[0].toLowerCase() : null,
    builds,
    shas,
  };
}

/** @param {string} text */
export function parseVersionJson(text) {
  try {
    const version = JSON.parse(text);
    // Strict: JSON numbers only. A string "4242" used to pass Number() but fail
    // the old poll's `version.build !== build` (number vs string) check.
    const build = version?.build;
    const sha = typeof version?.sha === "string" ? version.sha.toLowerCase() : null;
    return {
      build: typeof build === "number" && Number.isInteger(build) && build >= 1 ? build : null,
      sha: sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null,
      raw: version,
    };
  } catch {
    return { build: null, sha: null, raw: null };
  }
}

/**
 * Decide whether one live snapshot is a pass, a wait, or a hard mismatch.
 * Superseded = live build is at least this deploy's build AND this sha is an
 * ancestor of the live apex-sha (AGENTS.md: "Live?" = ancestor of live apex-sha).
 *
 * @param {{
 *   expectedBuild: number,
 *   expectedSha: string,
 *   version: {build:number|null, sha:string|null},
 *   metas: {build:number|null, sha:string|null, builds:string[], shas:string[]},
 *   isAncestor?: (ancestor:string, descendant:string) => boolean,
 * }} args
 */
export function evaluateLiveSnapshot({ expectedBuild, expectedSha, version, metas, isAncestor }) {
  const liveBuild = version.build ?? metas.build;
  const liveSha = (metas.sha || version.sha || "").toLowerCase() || null;
  const live = { build: liveBuild, sha: liveSha, version, metas };

  if (!Number.isInteger(expectedBuild) || expectedBuild < 1 || !/^[0-9a-f]{40}$/.test(expectedSha || "")) {
    return { ok: false, status: "invalid-expected", live, detail: "expected build/sha are invalid" };
  }
  if (liveBuild == null || !liveSha) {
    return { ok: false, status: "waiting", live, detail: "live version.json / apex metas unreadable" };
  }
  // Incoherent shell (version and metas disagree) — keep polling; a mid-propagate
  // CDN can serve a new version.json next to a stale index for a short window.
  if (version.build != null && metas.build != null && version.build !== metas.build) {
    return { ok: false, status: "waiting", live, detail: `version.build ${version.build} ≠ meta apex-build ${metas.build}` };
  }
  if (version.sha && metas.sha && version.sha !== metas.sha) {
    return { ok: false, status: "waiting", live, detail: `version.sha ${version.sha} ≠ meta apex-sha ${metas.sha}` };
  }
  if (metas.builds.length !== 1 || metas.shas.length !== 1) {
    return { ok: false, status: "waiting", live, detail: `expected one apex-build and one apex-sha meta (got ${metas.builds.length}/${metas.shas.length})` };
  }

  if (liveBuild === expectedBuild && liveSha === expectedSha) {
    return { ok: true, status: "match", live, detail: `live shell carries build ${expectedBuild} and commit ${expectedSha}` };
  }

  if (liveBuild >= expectedBuild && typeof isAncestor === "function" && isAncestor(expectedSha, liveSha)) {
    return {
      ok: true,
      status: "superseded",
      live,
      detail: `live build ${liveBuild} sha ${liveSha} superseded this deploy (build ${expectedBuild} sha ${expectedSha} is an ancestor)`,
    };
  }

  if (liveBuild < expectedBuild) {
    return { ok: false, status: "waiting", live, detail: `live build ${liveBuild} still behind expected ${expectedBuild}` };
  }

  // Live is newer (or same build) but ancestry does not confirm supersession —
  // could be lag (old sha still) or a divergent history. Keep waiting until the
  // window ends; the final error names the last live values.
  if (liveSha !== expectedSha) {
    return {
      ok: false,
      status: "waiting",
      live,
      detail: `live sha ${liveSha} (build ${liveBuild}) is not this deploy and not a confirmed descendant`,
    };
  }

  return { ok: false, status: "waiting", live, detail: `live build ${liveBuild} does not yet equal ${expectedBuild}` };
}

/** Backoff delays (ms): ~8 min for 36 attempts under a 10-minute job budget. */
export function backoffMs(attemptIndex, { baseMs = 5_000, capMs = 20_000 } = {}) {
  const ms = Math.round(baseMs * Math.pow(1.12, Math.max(0, attemptIndex)));
  return Math.min(capMs, ms);
}

function defaultIsAncestor(ancestor, descendant) {
  if (!ancestor || !descendant) return false;
  if (ancestor === descendant) return true;
  try {
    execFileSync("git", ["cat-file", "-e", `${descendant}^{commit}`], { stdio: "ignore" });
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function defaultFetchText(url) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return text;
}

function sleep(ms, wait = (n) => new Promise((r) => setTimeout(r, n))) {
  return wait(ms);
}

function writeGithubOutput(outcome) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  fs.appendFileSync(out, `outcome=${outcome}\n`);
}

/**
 * @param {{
 *   pageUrl: string,
 *   build: number,
 *   sha: string,
 *   attempts?: number,
 *   runId?: string,
 *   fetchText?: (url:string) => Promise<string>,
 *   isAncestor?: (a:string,b:string) => boolean,
 *   wait?: (ms:number) => Promise<void>,
 *   log?: (...args:any[]) => void,
 * }} opts
 */
export async function pollLiveShell(opts) {
  const {
    pageUrl,
    build,
    sha,
    attempts = 36,
    runId = String(Date.now()),
    fetchText = defaultFetchText,
    isAncestor = defaultIsAncestor,
    wait,
    log = console.log,
  } = opts;
  const base = pageUrl.replace(/\/$/, "");
  const expectedSha = String(sha || "").toLowerCase();
  let last = null;

  for (let i = 1; i <= attempts; i++) {
    const bust = `_=${runId}-${i}-${Date.now()}`;
    let versionText = "";
    let htmlText = "";
    try {
      versionText = await fetchText(`${base}/version.json?${bust}`);
      htmlText = await fetchText(`${base}/index.html?${bust}`);
    } catch (error) {
      last = evaluateLiveSnapshot({
        expectedBuild: build,
        expectedSha,
        version: { build: null, sha: null },
        metas: { build: null, sha: null, builds: [], shas: [] },
        isAncestor,
      });
      last.detail = `fetch failed: ${error?.message || error}`;
      log(`attempt ${i}/${attempts}: ${last.detail}`);
      if (i < attempts) await sleep(backoffMs(i - 1), wait);
      continue;
    }

    const version = parseVersionJson(versionText);
    const metas = parseShellMetas(htmlText);
    last = evaluateLiveSnapshot({ expectedBuild: build, expectedSha, version, metas, isAncestor });
    log(
      `attempt ${i}/${attempts}: live build=${last.live.build ?? "?"} sha=${last.live.sha ?? "?"} — ${last.detail}`,
    );
    if (last.ok) {
      writeGithubOutput(last.status);
      log(last.detail);
      return last;
    }
    if (i < attempts) await sleep(backoffMs(i - 1), wait);
  }

  const liveSummary = last?.live
    ? `last live build=${last.live.build ?? "?"} sha=${last.live.sha ?? "?"}`
    : "last live build=? sha=?";
  const message =
    `live version.json never reached build ${build} with matching shell commit ${expectedSha} ` +
    `within the poll window (${attempts} attempts, backoff); ${liveSummary}` +
    (last?.detail ? ` (${last.detail})` : "");
  const failure = { ok: false, status: "timeout", live: last?.live || null, detail: message };
  log(`::error::${message}`);
  writeGithubOutput("timeout");
  return failure;
}

function parseArgs(argv) {
  const out = { attempts: 36 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") out.pageUrl = argv[++i];
    else if (a === "--build") out.build = Number(argv[++i]);
    else if (a === "--sha") out.sha = argv[++i];
    else if (a === "--attempts") out.attempts = Number(argv[++i]);
    else if (a === "--run-id") out.runId = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.pageUrl || !Number.isInteger(args.build) || !args.sha) {
    console.error("usage: node tools/ci/poll-live-shell.mjs --url <page-url> --build <n> --sha <40-hex> [--attempts N]");
    process.exit(2);
  }
  const result = await pollLiveShell({
    pageUrl: args.pageUrl,
    build: args.build,
    sha: args.sha,
    attempts: args.attempts,
    runId: args.runId || process.env.GITHUB_RUN_ID || String(Date.now()),
  });
  process.exit(result.ok ? 0 : 1);
}
