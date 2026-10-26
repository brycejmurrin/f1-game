#!/usr/bin/env node
// fleet-owner.mjs — who owns this path? Computed from open PR diffs and the claims board, never typed by hand.
// @doc Owner of each path: HELD by an open PR's diff, CLAIMED on the claims board, or FREE; prints RELEASE? answers.
// Full description: Fleet redesign §8 rule 2 (docs/plans/2026-10-19-fleet-redesign.md): a path in an OPEN PR's current diff into the deploy branch is HELD until that PR merges or closes; a live claim on claude/claims-board covers only paths outside every open diff; anything else is FREE. `--release-answer <id> <paths>` prints the one bus line that answers a `RELEASE? <id>` (it never sends). Evidence: a hand-typed ownership answer missed tools/gfx/gpu-mem-census.mjs on 2026-10-19 (corrected in 9fb540c).
// @skill agent-fleet
//
//   node tools/ci/fleet-owner.mjs js/game.js tools/gfx/gpu-mem-census.mjs
//   git diff --name-only | node tools/ci/fleet-owner.mjs          # paths on stdin, one per line
//   node tools/ci/fleet-owner.mjs --pr 3101                         # that PR's files; owners OTHER than #3101
//   node tools/ci/fleet-owner.mjs --json <paths>
//   node tools/ci/fleet-owner.mjs --release-answer R7 --as claude:session_01ABC js/a.js js/b.js
//   node tools/ci/fleet-owner.mjs --requested-at 2026-10-19T20:00:00Z <paths>   # apply the 60-min lapse rule
//
// Rows, one per path:  `<path>  HELD #<pr> <sha7> <owner>` | `CLAIMED <age> <who> <session|unaddressable>` | `FREE`,
// then `= fleet-owner <n> held, <n> claimed, <n> free`.
//
// HELD: every open PR into the deploy branch whose current diff contains the path (git three-dot diff when both
// shas are local, else a cached files list keyed by head+base sha under artifacts/fleet-owner/, else the PR files
// API — page 1 of every uncached PR in ONE parallel curl, further pages after; a list at GitHub's 3000-file cap
// fails closed). `--pr <n>` still checks its own list against changed_files.
// SPEED (2026-10-26 system audit §4; user grant, Bryce 2026-10-26 ~23:00 PT: "Fix hook or guard or perm"): the
// bash-guard push lookup made two sequential calls per open PR (`pulls/<n>` only for changed_files, then the
// files) and needed 38.9 s against its 20 s budget, so it timed out on every push. Stale claims (who-is-on-it's
// STALE_MIN) no longer hold a path.
// CLAIMED: a board claim whose text names the path, a glob over it (`*`, `**`, `?`, `{a,b}`) or a directory
// prefix. A claim is messageable when its text carries a bus-addressable host/session id or a `#<PR>`; the board's
// 24-hex session hash is not. LAPSE: with `--requested-at <ISO>` at least 60 min old, a claim older than 60 min
// on a path outside every open diff prints `CLAIMED (lapsed-after-release-request)` and releases; an open-diff
// path is never lapsed (it is HELD first).
//
// --release-answer <id>: `HELD <id> until #<pr>: <paths>` per holding PR; `RELEASED <id> <paths>` for the paths
// that are FREE, lapsed, or CLAIMED only by the caller (`--as <host:id>`, else APEX_FLEET_AS); a path another
// live claim holds prints `NOT-OWNER <id> <paths>: claimed by <who> <session>` (it is not the caller's to release).
//
// Exit: 0 printed, 2 bad args, 3 no token / API error / claims board unreadable (no guessed rows).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "./ready-gate.mjs";
import { urlFor } from "./github-api.mjs";
import { githubToken } from "./github-token.mjs";
import { parseFleetStatus } from "./pr-board.mjs";
import { parseBoard, readBoard, CLAIMS_BOARD } from "./who-is-on-it.mjs";
import { addressProblem } from "./fleet-bus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEPLOY = "claude/f1-game-project-26h3ng";
export const LAPSE_MIN = 60;

const USAGE = `usage: node tools/ci/fleet-owner.mjs [--pr <n>] [--json] [--no-fetch] [--requested-at <ISO>]
         [--release-answer <id> [--as <host:id>]] [path ...]   (paths also read from stdin)
  Owner of each path: HELD by an open PR's diff into ${DEPLOY}, CLAIMED on ${CLAIMS_BOARD}, else FREE.
  --release-answer prints the bus line answering RELEASE? <id>; it never sends (fleet-bus.mjs does).
  Exit 0 printed, 2 bad args, 3 API error or unreadable claims board (no guessed rows).`;

const norm = (p) => String(p || "").trim().replace(/^\.\//, "");

/** A shell-style glob -> an anchored RegExp: `**` any depth, `*`/`?` within a segment, `{a,b}` alternation. */
export function globToRegex(glob) {
  let re = "";
  const g = norm(glob);
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        i++;
        if (g[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = g.indexOf("}", i);
      if (end < 0) { re += "\\{"; continue; }
      re += "(?:" + g.slice(i + 1, end).split(",").map((s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("|") + ")";
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** Does one claim token cover `file`? Exact file, a glob over it, or a directory prefix (`dir/` or `dir`). */
export function tokenCovers(token, file) {
  const t = norm(token), f = norm(file);
  if (!t || !f) return false;
  if (/[*?{]/.test(t)) return globToRegex(t).test(f);
  if (t === f) return true;
  const dir = t.endsWith("/") ? t : t + "/";
  return f.startsWith(dir);
}

/** The claim's own words, without the `  [branch; session <hash>]` tag who-is-on-it appends. */
const claimBody = (text) => String(text || "").replace(/\s\s\[[^\]]*\]\s*$/, "");

/** Path-shaped tokens in a claim text: anything with a `/`, a glob character or a file extension. */
export function claimPaths(text) {
  const out = [];
  for (const raw of claimBody(text).split(/[\s,;`'"()]+/)) {
    const t = raw.replace(/[.:;)]+$/, "").replace(/^[(]+/, "");
    if (!t || t.includes("://") || t.startsWith("#") || t.startsWith("-")) continue;
    if (/[/*]/.test(t) || /^[\w.-]+\.[A-Za-z0-9]{1,6}$/.test(t)) out.push(t);
  }
  return out;
}

/** Who to message about a claim: a bus-addressable session id or `#<PR>`, else null. */
export function claimSession(text) {
  const body = claimBody(text);
  const s = /\b((?:[a-z]+:)?(?:session|cse)_[A-Za-z0-9]+)\b/.exec(body);
  if (s) return s[1];
  for (const m of body.matchAll(/(?:^|[\s(])((?:codex|cursor|grok):[A-Za-z0-9_-]+)(?=$|[\s),;.])/g)) {
    if (!addressProblem(m[1])) return m[1];
  }
  const pr = /(?:^|[\s(])(#\d+)\b/.exec(body);
  return pr ? pr[1] : null;
}

/** Is this claim the caller's own (`--as`)? Its messageable id, slug or text names the caller. */
export function claimIsBy(claim, as) {
  if (!as) return false;
  const bare = String(as).replace(/^[a-z]+:/, "");
  const sess = claim.session ? String(claim.session).replace(/^[a-z]+:/, "") : "";
  return sess === bare || String(claim.slug || "").endsWith(bare) || String(claim.text || "").includes(bare);
}

/** The ```fleet block's `worker:`/`orchestrator:`/`fleet:` keys (first value of each), outside HTML comments. */
export function parseFleetBlock(body) {
  const text = String(body || "").replace(/<!--[\s\S]*?-->/g, "");
  const m = /```fleet[^\n]*\n([\s\S]*?)```/.exec(text);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^\s*(worker|orchestrator|fleet)\s*:\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (kv && kv[2] && !kv[2].startsWith("<") && out[kv[1]] == null) out[kv[1]] = kv[2];
  }
  return out;
}

/** One holder record from a pulls list item. */
export function holderOf(pr) {
  const block = parseFleetBlock(pr.body);
  const status = parseFleetStatus(pr.body);
  return {
    pr: pr.number, sha: pr.head?.sha || "", title: pr.title || "",
    owner: block.worker || block.orchestrator || (pr.user?.login ? `gh:${pr.user.login}` : "?"),
    worker: block.worker || null, orchestrator: block.orchestrator || null, fleet: block.fleet || null,
    fleetStatus: status ? [status.state, status.reason, status.at].filter(Boolean).join(" | ") : null,
  };
}

/** Every open PR into the deploy branch (paginated). */
export function listOpenPrs(request = api) {
  const prs = [];
  for (let page = 1; ; page++) {
    const r = request(`pulls?state=open&base=${encodeURIComponent(DEPLOY)}&per_page=100&page=${page}`);
    if (r.error) return { error: `open PRs: ${r.error}` };
    if (!Array.isArray(r.json)) return { error: "open PRs: bad payload" };
    prs.push(...r.json);
    if (r.json.length < 100) return { prs };
  }
}

/** The PR's changed paths from git when both shas are local (three-dot = the files API's merge-base diff). */
function gitFiles(pr, git) {
  const head = pr.head?.sha, base = pr.base?.sha;
  if (!git || !head || !base) return null;
  const have = (s) => git(["cat-file", "-e", `${s}^{commit}`]).status === 0;
  if (!have(head) || !have(base)) return null;
  const r = git(["diff", "--name-only", "--no-renames", `${base}...${head}`]);
  return r.status === 0 ? r.stdout.split("\n").map(norm).filter(Boolean) : null;
}

/** The PR's changed paths via the files API, failing closed on an incomplete list (ready-gate resolveSha's rule). */
export function apiFiles(n, request = api) {
  const one = request(`pulls/${n}`);
  if (one.error) return { error: `PR #${n}: ${one.error}` };
  const expected = one.json?.changed_files;
  const files = [];
  let rows = 0;
  for (let page = 1; ; page++) {
    const b = request(`pulls/${n}/files?per_page=100${page > 1 ? `&page=${page}` : ""}`);
    if (b.error) return { error: `PR #${n} files: ${b.error}` };
    if (!Array.isArray(b.json)) return { error: `PR #${n} files: bad payload` };
    rows += b.json.length;
    for (const row of b.json) {
      if (row?.filename) files.push(norm(row.filename));
      if (row?.previous_filename) files.push(norm(row.previous_filename));
    }
    if (b.json.length < 100) break;
  }
  if (!Number.isInteger(expected)) return { error: `PR #${n}: no changed_files count to check the list against` };
  if (rows !== expected) return { error: `PR #${n}: incomplete files list: received ${rows} of ${expected} changed files` };
  return { files, head: one.json?.head?.sha };
}

/** GitHub's files endpoint lists at most this many files; a list that reaches it may be truncated. */
export const FILES_CAP = 3000;
const filesOf = (rows) => rows.flatMap((row) => [row?.filename, row?.previous_filename].filter(Boolean).map(norm));
const filesPage = (n, page) => `pulls/${n}/files?per_page=100${page > 1 ? `&page=${page}` : ""}`;

/** The rest of a PR's files after page 1 (sequential: only PRs over 100 files get here). */
function restOfFiles(n, first, request) {
  const rows = [...first];
  let last = first;
  for (let page = 2; last.length >= 100; page++) {
    const b = request(filesPage(n, page));
    if (b.error) return { error: `PR #${n} files: ${b.error}` };
    if (!Array.isArray(b.json)) return { error: `PR #${n} files: bad payload` };
    rows.push(...b.json);
    last = b.json;
  }
  if (rows.length >= FILES_CAP) return { error: `PR #${n}: files list at GitHub's ${FILES_CAP}-file cap (may be incomplete)` };
  return { files: filesOf(rows) };
}

/**
 * GET many API paths in ONE curl (`--parallel`), the token on stdin like github-api.mjs. Returns
 * Map(path -> { json } | { error }), or null when it cannot run (no token / curl failed); callers then fall back to
 * `request` one by one. A non-200 answer is retried through `request` (its 5xx/429 backoff).
 */
export function curlBatch(paths, { request = api, env = process.env, run = spawnSync, dir = path.join(ROOT, "artifacts", "fleet-owner", "tmp") } = {}) {
  if (!paths.length) return new Map();
  const token = githubToken({ env });
  if (!token) return null;
  fs.mkdirSync(dir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(dir, "b-"));
  try {
    const outFor = (i) => path.join(tmp, `${i}.json`);
    const cfg = [`header = "Authorization: Bearer ${token}"`, `header = "Accept: application/vnd.github+json"`,
      `header = "X-GitHub-Api-Version: 2022-11-28"`];
    paths.forEach((p, i) => cfg.push(`url = ${JSON.stringify(urlFor(p))}`, `output = ${JSON.stringify(outFor(i))}`));
    const r = run("curl", ["-sS", "--parallel", "--parallel-max", "16", "--max-time", "30", "-w", "%{http_code} %{filename_effective}\n", "-K", "-"],
      { input: cfg.join("\n") + "\n", encoding: "utf8", maxBuffer: 16 << 20 });
    if (r.error) return null;
    const status = new Map();
    for (const line of String(r.stdout || "").split("\n")) {
      const m = /^(\d{3}) (.+)$/.exec(line.trim());
      if (m) status.set(path.resolve(m[2]), Number(m[1]));
    }
    const out = new Map();
    paths.forEach((p, i) => {
      if (status.get(path.resolve(outFor(i))) === 200) {
        try { out.set(p, { json: JSON.parse(fs.readFileSync(outFor(i), "utf8")) }); return; } catch { /* fall through */ }
      }
      out.set(p, request(p));
    });
    return out;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

const cacheFile = (dir, pr) => path.join(dir, `${pr.head?.sha}-${pr.base?.sha}.json`);
function readCache(dir, pr) {
  if (!dir || !pr.head?.sha || !pr.base?.sha) return null;
  try { const c = JSON.parse(fs.readFileSync(cacheFile(dir, pr), "utf8")); return Array.isArray(c.files) ? c.files : null; } catch { return null; }
}
function writeCache(dir, pr, files) {
  if (!dir || !pr.head?.sha || !pr.base?.sha) return;
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(cacheFile(dir, pr), JSON.stringify({ pr: pr.number, files })); } catch { /* a cache is optional */ }
}

/**
 * Open PRs with their diffs: [{ holder, files }], or { error }. Per PR: local git, else the head+base cache, else
 * the API — page 1 for every remaining PR in one `batch` (parallel curl in production; `request` one by one when
 * batch is null or cannot run), no `pulls/<n>` call.
 */
export function openDiffs({ request = api, git = null, batch = null, cacheDir = null } = {}) {
  const list = listOpenPrs(request);
  if (list.error) return list;
  const files = new Map();
  const need = [];
  for (const pr of list.prs) {
    const f = gitFiles(pr, git) || readCache(cacheDir, pr);
    if (f) files.set(pr.number, f);
    else need.push(pr);
  }
  const firsts = (batch && batch(need.map((pr) => filesPage(pr.number, 1)), { request })) || null;
  for (const pr of need) {
    const b = firsts ? firsts.get(filesPage(pr.number, 1)) : request(filesPage(pr.number, 1));
    if (!b || b.error) return { error: `PR #${pr.number} files: ${b ? b.error : "no answer"}` };
    if (!Array.isArray(b.json)) return { error: `PR #${pr.number} files: bad payload` };
    const r = restOfFiles(pr.number, b.json, request);
    if (r.error) return { error: r.error };
    writeCache(cacheDir, pr, r.files);
    files.set(pr.number, r.files);
  }
  const out = list.prs.map((pr) => ({ holder: holderOf(pr), files: new Set(files.get(pr.number)) }));
  return { diffs: out.sort((a, b) => a.holder.pr - b.holder.pr) };
}

const ageLabel = (min) => (min < 120 ? `${min}m` : min < 48 * 60 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`);

/**
 * Pure ownership verdict.
 * @param {string[]} paths
 * @param {{ diffs: {holder, files:Set<string>}[], claims: object[], now?: number, requestedAt?: string|null, excludePr?: number|null }} ctx
 */
export function decide(paths, { diffs = [], claims = [], now = Date.now(), requestedAt = null, excludePr = null } = {}) {
  const reqAt = requestedAt ? Date.parse(requestedAt) : NaN;
  const lapseArmed = Number.isFinite(reqAt) && now - reqAt >= LAPSE_MIN * 60_000;
  const live = claims.filter((c) => !c.released && !c.stale).map((c) => ({ ...c, session: claimSession(c.text), paths: claimPaths(c.text) }));
  const rows = [];
  for (const p of [...new Set(paths.map(norm).filter(Boolean))]) {
    const holders = diffs.filter((d) => d.holder.pr !== excludePr && d.files.has(p)).map((d) => d.holder);
    if (holders.length) { rows.push({ path: p, state: "held", holders, claims: [] }); continue; }
    const cl = live.filter((c) => c.paths.some((t) => tokenCovers(t, p)))
      .map(({ paths: _p, ...c }) => ({ ...c, lapsed: lapseArmed && c.ageMin > LAPSE_MIN }));
    if (cl.length) rows.push({ path: p, state: "claimed", lapsed: cl.every((c) => c.lapsed), holders: [], claims: cl });
    else rows.push({ path: p, state: "free", holders: [], claims: [] });
  }
  const count = (s) => rows.filter((r) => r.state === s).length;
  return { rows, counts: { held: count("held"), claimed: count("claimed"), free: count("free") } };
}

/** The bus line(s) answering `RELEASE? <id> <paths>`. Pure. */
export function releaseAnswer(id, result, as = null) {
  const lines = [];
  const byPr = new Map();
  const released = [];
  const foreign = new Map();
  for (const r of result.rows) {
    if (r.state === "held") {
      const pr = r.holders[0].pr;
      if (!byPr.has(pr)) byPr.set(pr, []);
      byPr.get(pr).push(r.path);
    } else if (r.state === "free" || r.lapsed) released.push(r.path);
    else {
      const other = r.claims.find((c) => !c.lapsed && !claimIsBy(c, as));
      if (!other) released.push(r.path);
      else {
        const k = `${other.who} ${other.session || "unaddressable"}`;
        if (!foreign.has(k)) foreign.set(k, []);
        foreign.get(k).push(r.path);
      }
    }
  }
  for (const [pr, ps] of [...byPr].sort((a, b) => a[0] - b[0])) lines.push(`HELD ${id} until #${pr}: ${ps.join(" ")}`);
  for (const [who, ps] of foreign) lines.push(`NOT-OWNER ${id} ${ps.join(" ")}: claimed by ${who}`);
  if (released.length) lines.push(`RELEASED ${id} ${released.join(" ")}`);
  return lines;
}

/** Human rows + the `= fleet-owner …` line. */
export function render(result) {
  const out = [];
  const w = Math.min(60, Math.max(4, ...result.rows.map((r) => r.path.length)));
  for (const r of result.rows) {
    let cell;
    if (r.state === "held") {
      const h = r.holders[0];
      cell = `HELD #${h.pr} ${h.sha.slice(0, 7)} ${h.owner}`;
      if (h.fleetStatus) cell += `  [fleet-status: ${h.fleetStatus}]`;
      if (r.holders.length > 1) cell += `  (also ${r.holders.slice(1).map((x) => "#" + x.pr).join(" ")})`;
    } else if (r.state === "claimed") {
      const c = r.claims[0];
      cell = `CLAIMED${r.lapsed ? " (lapsed-after-release-request)" : ""} ${ageLabel(c.ageMin)} ${c.who || "?"} ${c.session || "unaddressable"}`;
      if (r.claims.length > 1) cell += `  (+${r.claims.length - 1} more claim${r.claims.length > 2 ? "s" : ""})`;
    } else cell = "FREE";
    out.push(`${r.path.padEnd(w)}  ${cell}`);
  }
  const k = result.counts;
  out.push(`= fleet-owner ${k.held} held, ${k.claimed} claimed, ${k.free} free`);
  return out;
}

function parseArgs(argv) {
  const o = { paths: [], pr: null, json: false, noFetch: false, requestedAt: null, releaseId: null, as: null };
  const val = (i, k) => {
    const v = argv[i + 1];
    if (v == null || v.startsWith("--")) throw new Error(`${k} requires a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--no-fetch") o.noFetch = true;
    else if (a === "--pr") { o.pr = Number(val(i, a)); i++; if (!Number.isInteger(o.pr) || o.pr < 1) throw new Error("--pr expects a positive integer"); }
    else if (a === "--requested-at") { o.requestedAt = val(i, a); i++; if (!Number.isFinite(Date.parse(o.requestedAt))) throw new Error("--requested-at expects an ISO time"); }
    else if (a === "--release-answer") { o.releaseId = val(i, a); i++; }
    else if (a === "--as") { o.as = val(i, a); i++; }
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else o.paths.push(a);
  }
  return o;
}

const defaultGit = (args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });

/** Claims from the board: fetch it (unless noFetch), then read it. null when the fetch fails. */
function defaultBoard({ noFetch, git = defaultGit, now }) {
  if (!noFetch) {
    const r = git(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${CLAIMS_BOARD}:refs/remotes/origin/${CLAIMS_BOARD}`]);
    if (r.status !== 0) return null;
  }
  return parseBoard(readBoard(`refs/remotes/origin/${CLAIMS_BOARD}`, ROOT), Math.floor(now / 1000));
}

/** CLI body; every side effect injectable for tests. Returns the exit code. */
export function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log || ((s) => console.log(s));
  const err = deps.err || ((s) => console.error(s));
  const request = deps.request || api;
  const git = deps.git === undefined ? defaultGit : deps.git;
  const now = deps.now ?? Date.now();
  if (argv.includes("--help") || argv.includes("-h")) { log(USAGE); return 0; }
  let o;
  try { o = parseArgs(argv); } catch (e) { err(`fleet-owner: ${e.message}\n${USAGE}`); return 2; }
  const as = o.as || (deps.env || process.env).APEX_FLEET_AS || null;

  let paths = o.paths;
  if (o.pr) {
    const r = apiFiles(o.pr, request);
    if (r.error) { err(`= fleet-owner unknown — ${r.error}`); return 3; }
    paths = [...paths, ...r.files];
  }
  if (!paths.length && !o.pr) {
    const stdin = deps.stdin !== undefined ? deps.stdin : (process.stdin.isTTY ? "" : (() => { try { return fs.readFileSync(0, "utf8"); } catch { return ""; } })());
    paths = String(stdin || "").split(/\r?\n/).map(norm).filter(Boolean);
  }
  if (!paths.length) { err(`fleet-owner: no paths (args, stdin or --pr)\n${USAGE}`); return 2; }

  // Production (no injected request): one parallel curl + the head-sha cache; tests inject request and stay serial.
  const batch = deps.batch !== undefined ? deps.batch : (deps.request ? null : curlBatch);
  const cacheDir = deps.cacheDir !== undefined ? deps.cacheDir : (deps.request ? null : path.join(ROOT, "artifacts", "fleet-owner"));
  const od = openDiffs({ request, git, batch, cacheDir });
  if (od.error) { err(`= fleet-owner unknown — ${od.error}`); return 3; }
  const claims = deps.claims !== undefined ? deps.claims : defaultBoard({ noFetch: o.noFetch, git: git || defaultGit, now });
  if (!claims) { err(`= fleet-owner unknown — cannot fetch ${CLAIMS_BOARD} (--no-fetch reads the local ref)`); return 3; }

  const result = decide(paths, { diffs: od.diffs, claims, now, requestedAt: o.requestedAt, excludePr: o.pr });
  const answer = o.releaseId ? releaseAnswer(o.releaseId, result, as) : null;
  if (o.json) {
    log(JSON.stringify({ ...result, pr: o.pr, releaseAnswer: answer }, null, 2));
    return 0;
  }
  for (const l of render(result)) log(l);
  if (answer) {
    log("# bus line(s) to send — fleet-owner never sends; run fleet-bus.mjs send <TYPE> --to <asker> \"<rest>\":");
    for (const l of answer) log(l);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
