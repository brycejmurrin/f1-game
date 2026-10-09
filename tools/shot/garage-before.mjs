#!/usr/bin/env node
// @doc Recipe for garage-before.yml: 11-team shards, 7 views, MANIFEST, change-gate; fetch script shares it.
// @skill garage-parts-livery
// @skill playwright-probe
//
// ONE durable garage BEFORE pack per ship SHA. Car/garage agents download it
// (`tools/garage-angles-fetch.mjs`) instead of spending 12–28 min recapturing
// the grid on llvmpipe. This file is the recipe the workflow, the fetch
// script and the unit tests share — views, shards, artifact name, watched
// paths, MANIFEST shape. It does not launch Chromium.
//
//   node tools/shot/garage-before.mjs --help
//   node tools/shot/garage-before.mjs --plan          # EVENT_NAME / PLAN_REF / PLAN_SHA / PAGES_CONCLUSION
//   node tools/shot/garage-before.mjs --args          # TEAMS=… OUT=… → garage-angles argv
//   node tools/shot/garage-before.mjs --manifest --out=dir --sha=<sha>
//
// Capture is `tools/shot/garage-angles.mjs` (the garage room, not carview).
// Car shot / render-car.mjs is a different studio and cannot produce this pack.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { githubToken, NO_TOKEN_HINT } from "../ci/github-token.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const SHIP_BRANCH = "claude/f1-game-project-26h3ng";
export const REPO = "brycejmurrin/f1-game";
export const WORKFLOW_FILE = "garage-before.yml";
export const WORKFLOW_NAME = "Garage before";
export const ARTIFACT_PREFIX = "garage-before-";
export const RETENTION_DAYS = 30;

/** hero is the garage 3/4. Names match garage-angles.mjs ALL views. */
export const VIEWS = Object.freeze(["hero", "front", "side", "rear", "top", "wingFront", "wingRear"]);
export const PRESET_FOR_VIEW = Object.freeze({
  hero: "3q",
  front: "front",
  side: "side",
  rear: "rear",
  top: "top",
  wingFront: "front-wing",
  wingRear: "rear-wing",
});

/** 11 factory teams (not custom), ~4 macos jobs. Order matches Teams.LIST. */
export const TEAM_SHARDS = Object.freeze([
  Object.freeze(["mercedes", "ferrari", "mclaren"]),
  Object.freeze(["redbull", "alpine", "racingbulls"]),
  Object.freeze(["haas", "williams", "audi"]),
  Object.freeze(["astonmartin", "cadillac"]),
]);
export const TEAMS = Object.freeze(TEAM_SHARDS.flat());

/** Recapture when any of these moved since the last pack (workflow_run gate). */
export const WATCH_PATHS = Object.freeze([
  "js/car/",
  "js/garage/",
  "js/render/",
  "js/data/teams.js",
  "tools/shot/garage-angles.mjs",
  "tools/shot/garage-before.mjs",
  ".github/workflows/garage-before.yml",
]);

export const USAGE = `usage: node tools/shot/garage-before.mjs --plan|--args|--manifest|--help
       --plan      decide capture + print shards (EVENT_NAME / PLAN_REF / PLAN_SHA)
       --args      print garage-angles argv (TEAMS / OUT / VIEWS env)
       --manifest  write MANIFEST.json into --out for --sha
       --help`;

export function artifactName(sha) {
  const id = String(sha || "").replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (id.length < 7) throw new Error(`artifactName: need a git sha, got ${JSON.stringify(sha)}`);
  return ARTIFACT_PREFIX + id;
}

export function parseArtifactSha(name) {
  const n = String(name || "");
  if (!n.startsWith(ARTIFACT_PREFIX)) return null;
  const sha = n.slice(ARTIFACT_PREFIX.length);
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
}

export function pathWatched(file) {
  const f = String(file || "").replace(/^\.\//, "");
  return WATCH_PATHS.some((p) => (p.endsWith("/") ? f === p.slice(0, -1) || f.startsWith(p) : f === p));
}

export function watchedFiles(files) {
  return (files || []).map((x) => (typeof x === "string" ? x : x.filename)).filter(pathWatched);
}

export function shardMatrix() {
  return TEAM_SHARDS.map((teams, i) => ({ shard: String(i), teams: teams.join(",") }));
}

export function captureArgs({ teams, out, views } = {}) {
  const t = Array.isArray(teams) ? teams : String(teams || process.env.TEAMS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const v = views || (process.env.VIEWS ? process.env.VIEWS.split(",") : VIEWS);
  const dest = out || process.env.OUT || "scratch/garage-before";
  if (!t.length) throw new Error("captureArgs: no teams (set TEAMS= or pass teams)");
  return [
    `--team=${t.join(",")}`,
    "--full-views",
    `--views=${v.join(",")}`,
    "--label=0",
    "--sheet=0",
    "--name={team}-{cam}",
    `--out=${dest}`,
  ];
}

/** Dispatch always captures. A Pages-triggered run captures only when watched paths moved. */
export function decideCapture({ event, conclusion, exactPack, lastPack, watched }) {
  if (event === "workflow_run" && conclusion && conclusion !== "success") {
    return { capture: false, reason: "pages-not-success" };
  }
  if (event === "workflow_dispatch") return { capture: true, reason: "dispatch" };
  if (exactPack) return { capture: false, reason: "pack-exists" };
  if (!lastPack) return { capture: true, reason: "no-pack-yet" };
  if ((watched || []).length) return { capture: true, reason: "watched-paths-changed" };
  return { capture: false, reason: "unchanged-since-pack" };
}

/** Among packs, pick an exact SHA match, else the newest ancestor (compare: ahead, behind_by 0). */
export function pickNearestPack(wantSha, packs, compares) {
  const want = String(wantSha || "").toLowerCase();
  const list = packs || [];
  const exact = list.find((p) => want.startsWith(p.sha) || p.sha.startsWith(want));
  if (exact) return { pack: exact, exact: true, ahead_by: 0 };
  const sorted = [...list].sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
  for (const pack of sorted) {
    const c = compares[pack.sha] || compares[pack.sha.slice(0, 7)];
    if (!c) continue;
    if (c.status === "identical") return { pack, exact: true, ahead_by: 0, compare: c };
    if (c.status === "ahead" && c.behind_by != null && c.behind_by === 0) {
      return { pack, exact: false, ahead_by: Number(c.ahead_by || 0), compare: c };
    }
  }
  return null;
}

export function parseShotName(file) {
  const base = path.basename(String(file || ""));
  const m = /^([a-z0-9]+)-([A-Za-z0-9]+)\.png$/.exec(base);
  if (!m) return null;
  const [, team, cam] = m;
  const preset = PRESET_FOR_VIEW[cam];
  if (!TEAMS.includes(team) || !preset) return null;
  return { team, cam, preset, file: base };
}

export function buildManifest({ sha, timestamp, files }) {
  const ts = timestamp || new Date().toISOString();
  const shots = [];
  for (const f of files || []) {
    const parsed = parseShotName(f);
    if (parsed) shots.push({ team: parsed.team, preset: parsed.preset, file: parsed.file, sha, timestamp: ts });
  }
  shots.sort((a, b) => (a.team + a.preset).localeCompare(b.team + b.preset));
  return { sha, timestamp: ts, workflow: WORKFLOW_NAME, views: [...VIEWS], shots };
}

export function writeManifest(dir, { sha, timestamp } = {}) {
  const root = path.resolve(dir);
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.name.endsWith(".png")) files.push(path.relative(root, abs));
    }
  };
  if (fs.existsSync(root)) walk(root);
  const manifest = buildManifest({ sha, timestamp, files });
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

/** Bounded retries for GitHub REST hiccups (5xx / 429 / network). Injectable under test. */
export const GITHUB_API_MAX_ATTEMPTS = 4;
export const GITHUB_API_BASE_DELAY_MS = 1000;

let _githubFetch = (...args) => globalThis.fetch(...args);
let _githubDelay = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
let _githubRandom = Math.random;

/**
 * Test hooks: zero delay, mock fetch, deterministic jitter.
 * Pass `delay: 0` or `delay: async () => {}` for instant retries; omit / null to restore defaults.
 */
export function setGithubApiTestHooks({ fetch, delay, random } = {}) {
  _githubFetch = fetch == null ? (...args) => globalThis.fetch(...args) : fetch;
  if (delay == null) {
    _githubDelay = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  } else if (typeof delay === "function") {
    _githubDelay = delay;
  } else {
    const fixed = Number(delay) || 0;
    _githubDelay = () => (fixed > 0 ? new Promise((r) => setTimeout(r, fixed)) : Promise.resolve());
  }
  _githubRandom = random == null ? Math.random : random;
}

function isRetryableStatus(code) {
  return code === 429 || (code >= 500 && code <= 599);
}

function isRetryableNetworkError(err) {
  if (!err) return false;
  const code = err.code || err.cause?.code;
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return true;
  }
  const msg = String(err.message || err);
  return /fetch failed|network|ECONNRESET|ETIMEDOUT|socket/i.test(msg);
}

function retryDelayMs(attempt, retryAfter) {
  if (retryAfter != null && retryAfter !== "") {
    const asNum = Number(retryAfter);
    if (Number.isFinite(asNum) && asNum >= 0) return Math.min(asNum * 1000, 30_000);
    const when = Date.parse(retryAfter);
    if (Number.isFinite(when)) return Math.min(Math.max(0, when - Date.now()), 30_000);
  }
  const base = Math.min(GITHUB_API_BASE_DELAY_MS * (2 ** (attempt - 1)), 8_000);
  return base + Math.floor(_githubRandom() * base * 0.25);
}

export async function githubApi(method, pathQs, { token, raw = false } = {}) {
  const auth = token || githubToken();
  if (!auth) return { error: NO_TOKEN_HINT };
  const url = `https://api.github.com/repos/${REPO}/${pathQs}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${auth}`,
  };
  let lastErr = null;
  for (let attempt = 1; attempt <= GITHUB_API_MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await _githubFetch(url, { method, headers, signal: AbortSignal.timeout(60_000) });
    } catch (err) {
      lastErr = err;
      if (!isRetryableNetworkError(err) || attempt === GITHUB_API_MAX_ATTEMPTS) {
        return { error: String(err.message || err).trim() || "fetch failed" };
      }
      const wait = retryDelayMs(attempt, null);
      console.error(`garage-before githubApi: retry ${attempt}/${GITHUB_API_MAX_ATTEMPTS} after network ${err.code || err.message} in ${wait}ms`);
      await _githubDelay(wait);
      continue;
    }
    const code = res.status;
    const text = await res.text();
    if (code >= 200 && code <= 299) {
      if (raw || !text.trim()) return { code, text };
      try { return { code, json: JSON.parse(text) }; } catch { return { code, text }; }
    }
    if (isRetryableStatus(code) && attempt < GITHUB_API_MAX_ATTEMPTS) {
      const wait = retryDelayMs(attempt, res.headers.get("retry-after"));
      console.error(`garage-before githubApi: retry ${attempt}/${GITHUB_API_MAX_ATTEMPTS} after HTTP ${code} in ${wait}ms`);
      await _githubDelay(wait);
      lastErr = { code, text };
      continue;
    }
    return { error: `HTTP ${code} ${text.slice(0, 240)}`, code };
  }
  if (lastErr?.code) return { error: `HTTP ${lastErr.code} ${(lastErr.text || "").slice(0, 240)}`, code: lastErr.code };
  return { error: String(lastErr?.message || lastErr || "githubApi failed").trim() };
}

/**
 * List garage-before-* pack artifacts.
 * When `name` is set, uses the API's exact `?name=` filter (pack names are
 * `garage-before-<sha>`, exact). Otherwise pages (≤10×100) for nearest-ancestor.
 */
export async function listPackArtifacts({ token, artifacts, name } = {}) {
  if (artifacts) {
    return (artifacts || []).map(normalizePack).filter(Boolean);
  }
  if (name) {
    const qs = `actions/artifacts?per_page=100&name=${encodeURIComponent(name)}`;
    const r = await githubApi("GET", qs, { token });
    if (r.error) return { error: r.error, code: r.code };
    return (r.json?.artifacts || []).map(normalizePack).filter(Boolean);
  }
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const r = await githubApi("GET", `actions/artifacts?per_page=100&page=${page}`, { token });
    if (r.error) return { error: r.error, code: r.code };
    const raw = r.json?.artifacts || [];
    out.push(...raw.map(normalizePack).filter(Boolean));
    if (raw.length < 100) break;
  }
  return out;
}

function normalizePack(a) {
  if (!a || a.expired) return null;
  const sha = parseArtifactSha(a.name);
  if (!sha) return null;
  return { id: a.id, name: a.name, sha, created_at: a.created_at, size_in_bytes: a.size_in_bytes, expired: false };
}

export async function resolveCommitSha(ref, { token } = {}) {
  const r = await githubApi("GET", `commits/${encodeURIComponent(ref)}`, { token });
  if (r.error) return { error: r.error, code: r.code };
  const sha = r.json?.sha;
  return sha ? { sha } : { error: `no sha for ref ${ref}` };
}

export async function compareCommits(base, head, { token } = {}) {
  const r = await githubApi("GET", `compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`, { token });
  if (r.error) return { error: r.error, code: r.code };
  const files = (r.json?.files || []).map((f) => f.filename);
  return {
    status: r.json.status,
    ahead_by: r.json.ahead_by,
    behind_by: r.json.behind_by,
    total_commits: r.json.total_commits,
    files,
    watched: watchedFiles(files),
  };
}

function writeGithubOutput(plan) {
  const dest = process.env.GITHUB_OUTPUT;
  if (!dest) return;
  const lines = [
    `capture=${plan.capture}`,
    `sha=${plan.sha}`,
    `reason=${plan.reason}`,
    `matrix=${JSON.stringify(plan.matrix)}`,
    `views=${VIEWS.join(",")}`,
  ];
  fs.appendFileSync(dest, lines.join("\n") + "\n");
}

function loadArtifactsFlag(argv) {
  const eq = argv.find((a) => a.startsWith("--artifacts="));
  const raw = eq ? eq.slice("--artifacts=".length) : null;
  if (!raw) return null;
  if (raw.startsWith("@")) return JSON.parse(fs.readFileSync(raw.slice(1), "utf8"));
  return JSON.parse(raw);
}

function flag(argv, name, dflt) {
  const eq = argv.find((a) => a.startsWith(name + "="));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1];
  return dflt;
}

async function planMain(argv) {
  const event = process.env.EVENT_NAME || "workflow_dispatch";
  const inputRef = process.env.PLAN_REF || SHIP_BRANCH;
  const headSha = process.env.PLAN_SHA || "";
  const conclusion = process.env.PAGES_CONCLUSION || "";
  const token = githubToken();
  let sha = headSha;
  if (event !== "workflow_run" || !sha) {
    if (token) {
      const r = await resolveCommitSha(inputRef, { token });
      if (r.error) { console.error("garage-before --plan: " + r.error); return 3; }
      sha = r.sha;
    } else {
      const g = spawnSync("git", ["rev-parse", inputRef], { cwd: ROOT, encoding: "utf8" });
      sha = (g.stdout || "").trim();
      if (g.status !== 0 || !sha) { console.error("garage-before --plan: cannot resolve " + inputRef); return 3; }
    }
  }
  const override = loadArtifactsFlag(argv);
  let packs;
  if (override) {
    packs = await listPackArtifacts({ artifacts: override });
  } else {
    // Pack names are exact (`garage-before-<sha>`); prefer ?name= over paging all artifacts.
    let exactName = null;
    try { exactName = artifactName(sha); } catch { /* short/odd sha — fall through to paging */ }
    if (exactName) {
      const named = await listPackArtifacts({ token, name: exactName });
      if (named.error) { console.error("garage-before --plan: " + named.error); return 3; }
      if (named.length) packs = named;
    }
    if (!packs) {
      packs = await listPackArtifacts({ token });
      if (packs.error) { console.error("garage-before --plan: " + packs.error); return 3; }
    }
  }
  const exact = packs.find((p) => sha.startsWith(p.sha) || p.sha.startsWith(sha));
  let last = null;
  let watched = [];
  if (!exact && packs.length && token) {
    const compares = {};
    for (const p of packs) {
      const c = await compareCommits(p.sha, sha, { token });
      if (!c.error) compares[p.sha] = c;
    }
    const picked = pickNearestPack(sha, packs, compares);
    last = picked?.pack || null;
    if (last && compares[last.sha]) watched = compares[last.sha].watched;
  } else if (!exact && last === null && packs.length) {
    last = packs[0];
  }
  const decision = decideCapture({ event, conclusion, exactPack: exact, lastPack: last, watched });
  const plan = {
    capture: decision.capture,
    reason: decision.reason,
    sha,
    lastPack: last?.sha || null,
    watched,
    matrix: shardMatrix(),
    views: [...VIEWS],
    teams: [...TEAMS],
  };
  writeGithubOutput(plan);
  console.log(JSON.stringify(plan, null, 2));
  return 0;
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log(USAGE);
    return argv.includes("--help") || argv.includes("-h") ? 0 : 2;
  }
  if (argv.includes("--args")) {
    console.log(captureArgs().join(" "));
    return 0;
  }
  if (argv.includes("--manifest")) {
    const out = flag(argv, "--out", "scratch/garage-before");
    const sha = flag(argv, "--sha", "");
    if (!sha) { console.error("garage-before --manifest needs --sha"); return 2; }
    const m = writeManifest(out, { sha });
    console.log(`MANIFEST.json ${m.shots.length} shots sha=${m.sha}`);
    return 0;
  }
  if (argv.includes("--plan")) return planMain(argv);
  console.error(USAGE);
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Promise.resolve(main()).then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(3);
  });
}
