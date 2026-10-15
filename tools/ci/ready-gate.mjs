#!/usr/bin/env node
// ready-gate.mjs — refuse draft→ready unless tooling-fast is green on the tip.
// @doc Gate for marking a PR ready: require green tooling-fast / Structural guards on the tip SHA.
// Full description: Before draft→ready (agents or CI Watch), require evidence that tooling-fast is green on the tip — GitHub check-run "Structural guards" success, or a local full-suite stamp after `tooling-fast` passed. Evidence: #1111 Structural guards failed on designer-canvas.test.mjs that local tooling-fast would have caught.
// @skill steward
//
// AGENTS.md §Concurrent PRs: mark ready only when the draft tip is green AND
// this gate exits 0. Tip-green without tooling-fast is how #1111 burned a
// Structural guards red that a local suite would have caught first.
//
//   node tools/ci/ready-gate.mjs                 # HEAD
//   node tools/ci/ready-gate.mjs --sha <sha>
//   node tools/ci/ready-gate.mjs --pr <n>        # that PR's head sha AND its Plan checklist
//   node tools/ci/ready-gate.mjs --json
//   node tools/ci/ready-gate.mjs --local         # local stamp only (no API)
//
// With --pr the PR body's `## Plan` checklist (AGENTS.md rule 12, the
// template's live checklist) must be closed too: an item neither ticked nor
// struck is work the PR says is not done, so a green tip still reads
// `plan-open`. A body with no Plan section (opened before #1451) only warns.
//
// Exit: 0 green, 1 red / pending / no evidence / Plan open, 3 no token / API
// error (unless --local). Prints one `= ready-gate <state>` line.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { commitTreeId } from "../lib/work-tree-id.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPO = "brycejmurrin/f1-game";
/** Sidecar written by a full green tooling-fast suite (see tooling-fast.mjs). */
export const LOCAL_STAMP = path.join(ROOT, "artifacts/logs/tooling-fast-ready.sha");
export const LOCAL_LOG = path.join(ROOT, "artifacts/logs/tooling-fast-suite.log");
/** Aggregator job name in ci.yml — halves are tooling A/B. */
export const GUARDS_JOB = "Structural guards";
export const GUARDS_A = "Structural guards (tooling A)";
export const GUARDS_B = "Structural guards (tooling B)";

const say = (...a) => console.log("[ready-gate]", ...a);

export function api(pathQs, { run = spawnSync, env = process.env, gh } = {}) {
  const token = githubToken(gh !== undefined ? { env, gh } : { env });
  if (!token) return { error: NO_TOKEN_HINT };
  const r = run("curl", ["-sS", "--max-time", "30", "-K", "-", "-w", "\n%{http_code}",
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28",
    "-H", "Cache-Control: no-cache",
    `https://api.github.com/repos/${REPO}/${pathQs}`],
  // maxBuffer: 100 check-runs with their output text can pass spawnSync's 1 MB
  // default (ENOBUFS → "curl failed"; ready-full-cap's #1733).
  { encoding: "utf8", maxBuffer: 64 << 20, input: `header = "Authorization: Bearer ${token}"\n` });
  if (r.status !== 0) return { error: (r.stderr || r.error?.code || "curl failed").trim() };
  const out = (r.stdout || "").split("\n");
  const code = Number(out.pop());
  try { return code === 200 ? { json: JSON.parse(out.join("\n")) } : { error: `HTTP ${code}` }; }
  catch { return { error: "bad JSON" }; }
}

/** Newest check-run per name (by attempt id, with started_at as the fallback). */
export function newestByName(checkRuns) {
  const by = new Map();
  for (const c of checkRuns || []) {
    if (!c || !c.name) continue;
    const cur = by.get(c.name);
    const t = Date.parse(c.started_at || "") || 0;
    const ct = cur ? (Date.parse(cur.started_at || "") || 0) : -Infinity;
    const hasIds = c.id > 0 && cur?.id > 0;
    if (!cur || (hasIds ? c.id > cur.id : t > ct)) by.set(c.name, c);
  }
  return by;
}

/**
 * Pure verdict from check-runs for one tip SHA.
 * @returns {{ state: "passed"|"failed"|"pending"|"none", evidence: string, code: number }}
 */
export function guardsVerdict(checkRuns) {
  const by = newestByName(checkRuns);
  const agg = by.get(GUARDS_JOB);
  if (agg) {
    if (agg.status && agg.status !== "completed") {
      return { state: "pending", evidence: `${GUARDS_JOB} ${agg.status}`, code: 1 };
    }
    if (agg.conclusion === "success") {
      return { state: "passed", evidence: `${GUARDS_JOB} success`, code: 0 };
    }
    if (agg.conclusion === "failure" || agg.conclusion === "timed_out") {
      return { state: "failed", evidence: `${GUARDS_JOB} ${agg.conclusion}`, code: 1 };
    }
    // cancelled / skipped / neutral — fall through to halves (reuse-draft path)
  }
  const a = by.get(GUARDS_A), b = by.get(GUARDS_B);
  if (a && b) {
    const pending = [a, b].some((j) => j.status && j.status !== "completed");
    if (pending) return { state: "pending", evidence: `${GUARDS_A}/${GUARDS_B} still running`, code: 1 };
    if (a.conclusion === "success" && b.conclusion === "success") {
      return { state: "passed", evidence: `${GUARDS_A} + ${GUARDS_B} success`, code: 0 };
    }
    const bad = [a, b].filter((j) => j.conclusion === "failure" || j.conclusion === "timed_out");
    if (bad.length) {
      return { state: "failed", evidence: bad.map((j) => `${j.name} ${j.conclusion}`).join("; "), code: 1 };
    }
  }
  if (!agg && !a && !b) return { state: "none", evidence: "no Structural guards check-run on tip", code: 1 };
  return { state: "pending", evidence: `Structural guards inconclusive (agg=${agg?.conclusion || "—"} a=${a?.conclusion || "—"} b=${b?.conclusion || "—"})`, code: 1 };
}

/** Tip and stamp match when either is a prefix of the other (min 7 hex). */
export function shaPrefixMatch(tip, stamped) {
  const a = String(tip || "").toLowerCase();
  const b = String(stamped || "").toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(a) || !/^[0-9a-f]{7,40}$/.test(b)) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** Local evidence: suite log terminal passed AND the stamp matches the tip.
 *  A stamp written since 2026-10-09 carries `tree=<hash>`: the tree the suite
 *  MEASURED (possibly a dirty working tree). It matches when that hash is the
 *  tip commit's tree, i.e. exactly what was verified is what was committed;
 *  HEAD at start or end says nothing about it (ledger M36). A legacy stamp
 *  (a bare sha) still matches by sha. */
export function localVerdict(tipSha, { stampPath = LOCAL_STAMP, logPath = LOCAL_LOG, read = fs.readFileSync, exists = fs.existsSync, treeOf = commitTreeId } = {}) {
  if (!tipSha || !/^[0-9a-f]{7,40}$/i.test(tipSha)) {
    return { state: "none", evidence: "invalid tip sha for local stamp", code: 1 };
  }
  if (!exists(stampPath)) {
    return { state: "none", evidence: `no local stamp (${path.relative(ROOT, stampPath)}); run tooling-fast full suite`, code: 1 };
  }
  let stamped = "", stampTree = "";
  try {
    const text = String(read(stampPath, "utf8")).trim();
    stamped = text.split(/\s+/)[0] || "";
    stampTree = (text.match(/\btree=([0-9a-f]{40,64})\b/) || [])[1] || "";
  } catch { return { state: "none", evidence: "unreadable local stamp", code: 1 }; }
  if (stampTree) {
    const tipTree = treeOf(tipSha);
    if (!tipTree) return { state: "none", evidence: `cannot resolve the tree of ${tipSha.slice(0, 7)} in this clone`, code: 1 };
    if (tipTree !== stampTree) {
      return { state: "failed", evidence: `the suite measured tree ${stampTree.slice(0, 7)}, tip ${tipSha.slice(0, 7)} is tree ${tipTree.slice(0, 7)} — HEAD moved or the verified edits are not what was committed; re-run tooling-fast on this tip`, code: 1 };
    }
  } else if (!shaPrefixMatch(tipSha, stamped)) {
    return { state: "failed", evidence: `local stamp ${stamped.slice(0, 7)} ≠ tip ${tipSha.slice(0, 7)} — re-run tooling-fast on this tip`, code: 1 };
  }
  if (!exists(logPath)) {
    return { state: "none", evidence: "stamp present but tooling-fast-suite.log missing", code: 1 };
  }
  let log = "";
  try { log = String(read(logPath, "utf8")); }
  catch { return { state: "none", evidence: "unreadable tooling-fast-suite.log", code: 1 }; }
  let last = null, logTree = "";
  for (const line of log.split("\n")) {
    const m = line.match(/=\s*run (passed|failed)\b/);
    if (m) last = m[1];
    const t = line.match(/=\s*tree ([0-9a-f]{40,64})\b/);
    if (t) logTree = t[1];
  }
  // Every subset run overwrites the suite log; the stamp and the log must be the same run.
  if (stampTree && logTree !== stampTree) {
    return { state: "none", evidence: "tooling-fast-suite.log is from a different run than the stamp (tree differs or missing) — re-run the full suite", code: 1 };
  }
  if (last === "passed") {
    return { state: "passed", evidence: `local tooling-fast passed on ${stamped.slice(0, 7)}`, code: 0 };
  }
  if (last === "failed") {
    return { state: "failed", evidence: "local tooling-fast-suite.log = run failed", code: 1 };
  }
  return { state: "none", evidence: "local suite log has no = run verdict", code: 1 };
}

export function resolveSha({ sha, pr, git = spawnSync, request = api } = {}) {
  if (sha) {
    const r = git("git", ["rev-parse", "--verify", sha], { cwd: ROOT, encoding: "utf8" });
    if (r.status === 0) return { sha: r.stdout.trim(), error: null };
    // Allow a bare hex tip that is not in this clone (CI head).
    if (/^[0-9a-f]{7,40}$/i.test(sha)) return { sha: sha.toLowerCase(), error: null };
    return { sha: null, error: `cannot resolve --sha ${sha}` };
  }
  if (pr != null && pr !== "") {
    const n = Number(pr);
    if (!Number.isInteger(n) || n < 1) return { sha: null, error: `--pr expects a positive integer, got ${pr}` };
    const one = request(`pulls/${n}`);
    if (one.error) return { sha: null, error: `PR #${n}: ${one.error}` };
    const head = one.json?.head?.sha;
    if (!head || !/^[0-9a-f]{40}$/i.test(head)) return { sha: null, error: `PR #${n}: no head sha` };
    return { sha: head, error: null, pr: n, body: one.json?.body || "" };
  }
  const r = git("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return { sha: null, error: "git rev-parse HEAD failed" };
  return { sha: r.stdout.trim(), error: null };
}

/**
 * Decide ready-gate for a tip.
 * @returns {{ state, evidence, code, sha, source }}
 */
export function evaluate({ sha, localOnly = false, request = api, localOpts } = {}) {
  if (!sha) return { state: "none", evidence: "no tip sha", code: 1, sha: null, source: null };
  const local = localVerdict(sha, localOpts);
  if (localOnly) return { ...local, sha, source: "local" };

  const list = [];
  let checks, page = 1;
  do {
    checks = request(`commits/${encodeURIComponent(sha)}/check-runs?per_page=100${page > 1 ? `&page=${page}` : ""}`);
    if (checks.error) break;
    const batch = checks.json?.check_runs || [];
    list.push(...batch);
    if (!batch.length || (checks.json?.total_count != null
      ? list.length >= checks.json.total_count : batch.length < 100)) break;
    page++;
  } while (true);
  if (checks.error) {
    // Fall back to local stamp when the API is unavailable — still better than silent flip.
    if (local.state === "passed") {
      return { ...local, sha, source: "local-fallback", apiError: checks.error };
    }
    return { state: "unknown", evidence: checks.error, code: 3, sha, source: "api" };
  }
  const remote = guardsVerdict(list);
  if (remote.state === "passed") return { ...remote, sha, source: "ci" };
  if (remote.state === "failed") return { ...remote, sha, source: "ci" };
  // pending/none: local green stamp can unblock agents who ran tooling-fast before CI finished
  if (local.state === "passed") return { ...local, sha, source: "local" };
  return { ...remote, sha, source: "ci" };
}

/** The PR body's `## Plan` checklist (AGENTS.md rule 12). An item is OPEN when
 *  it is neither ticked (`[x]`) nor struck (`~~dropped~~ — why`); an empty
 *  `- [ ]` (the template's placeholder) is open. HTML comments — where the
 *  template keeps its example items — are not part of the list.
 *  @returns {{ state: "none"|"open"|"done", items: number, open: string[] }} */
export function planVerdict(body) {
  const text = String(body || "").replace(/<!--[\s\S]*?-->/g, "");
  const head = /^##[ \t]+Plan\b.*$/m.exec(text);
  if (!head) return { state: "none", items: 0, open: [] };
  const rest = text.slice(head.index + head[0].length);
  const next = /^##[ \t]/m.exec(rest);
  const section = next ? rest.slice(0, next.index) : rest;
  const items = [...section.matchAll(/^[ \t]*[-*][ \t]+\[([ xX])\][ \t]*(.*)$/gm)];
  if (!items.length) return { state: "none", items: 0, open: [] };
  const open = items
    .filter(([, mark, t]) => mark === " " && !/^~~/.test(t.trim()))
    .map(([, , t]) => t.trim() || "(empty item)");
  return { state: open.length ? "open" : "done", items: items.length, open };
}

/** Fold the Plan into a green verdict: open items refuse (exit 1); no Plan
 *  section passes with a `planWarning`. A red / pending verdict is returned
 *  as is — it already refuses, and says why. */
export function withPlan(v, body) {
  if (!v || v.code !== 0 || body == null) return v;
  const p = planVerdict(body);
  if (p.state === "open") {
    const shown = p.open.slice(0, 3).map((t) => `"${t.length > 60 ? t.slice(0, 57) + "..." : t}"`).join(", ");
    return { ...v, state: "plan-open", code: 1, plan: p,
      evidence: `${p.open.length} of ${p.items} Plan item(s) open: ${shown}${p.open.length > 3 ? ", ..." : ""} — tick each with its evidence or strike it with why (AGENTS.md rule 12)` };
  }
  if (p.state === "none") return { ...v, plan: p, planWarning: "PR body has no ## Plan checklist (AGENTS.md rule 12)" };
  return { ...v, plan: p };
}

/** Write LOCAL_STAMP after a green full suite (called from tooling-fast): the
 *  head the run STARTED on, plus `tree` — the hash of the tree it measured. */
export function stampReadySha(sha, { tree = "", stampPath = LOCAL_STAMP, write = fs.writeFileSync, mkdir = fs.mkdirSync } = {}) {
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return false;
  if (tree && !/^[0-9a-f]{40,64}$/i.test(tree)) return false;
  mkdir(path.dirname(stampPath), { recursive: true });
  write(stampPath, sha.trim() + (tree ? ` tree=${tree}` : "") + "\n");
  return true;
}

const USAGE = `usage: node tools/ci/ready-gate.mjs [--sha <sha|ref>] [--pr <n>] [--local] [--json]
  Exit 0 only when tooling-fast / Structural guards is green on the tip (AGENTS.md §Concurrent PRs)
  and, with --pr, every item of the PR body's ## Plan checklist is ticked or struck (rule 12).
  Evidence: #1111 designer-canvas Structural guards red that local tooling-fast would have caught.
  --local uses artifacts/logs/tooling-fast-ready.sha + tooling-fast-suite.log only (no GitHub API).`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, USAGE);
  const opt = (k) => {
    const i = argv.indexOf(k);
    if (i < 0) return null;
    return argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : null;
  };
  const localOnly = argv.includes("--local");
  const asJson = argv.includes("--json");
  const resolved = resolveSha({ sha: opt("--sha"), pr: opt("--pr") });
  if (resolved.error) {
    say(`= ready-gate unknown — ${resolved.error}`);
    process.exit(3);
  }
  const v = withPlan(evaluate({ sha: resolved.sha, localOnly }), resolved.body);
  const line = `= ready-gate ${v.state} — ${v.evidence} sha=${(v.sha || "").slice(0, 7)} source=${v.source || "—"}`;
  if (asJson) console.log(JSON.stringify({ ...v, pr: resolved.pr || null }, null, 2));
  else {
    if (v.planWarning) say(`warning: ${v.planWarning}`);
    say(line);
  }
  process.exit(v.code);
}
