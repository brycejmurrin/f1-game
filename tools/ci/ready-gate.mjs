#!/usr/bin/env node
// ready-gate.mjs — the worker's local pre-flip check: refuse draft→ready unless the draft tip is proven green.
// @doc Pre-flip gate: open draft, Plan closed, Structural guards or the local tooling-fast stamp green on the tip, memory ok.
// @skill steward
//
// Tip-green without tooling-fast is how #1111 burned a Structural guards red that a local suite would have caught
// first. docs/plans/2026-10-27-orchestration-redesign.md §4.2: the worker runs it, flips ready, adds `land`; the
// landing gate is merge-gate.mjs, run by CI as the `gate` check. A `--pr` run still writes the ready receipt
// (artifacts/ready-gate/<pr>.json, tools/lib/gate-receipt.mjs): the hooks (.claude/hooks/merge_policy.py via
// github-mcp-guard.sh and bash-guard.sh) require a fresh ok one before a draft→ready flip.
//
//   node tools/ci/ready-gate.mjs                 # HEAD
//   node tools/ci/ready-gate.mjs --sha <sha>
//   node tools/ci/ready-gate.mjs --pr <n>        # that PR: open draft, Plan closed, head green, memory marker
//   node tools/ci/ready-gate.mjs --json
//   node tools/ci/ready-gate.mjs --local         # local stamp only (no API)
//
// With --pr the body's `## Plan` checklist (AGENTS.md rule 12) must be closed: an item neither ticked nor struck is
// work the PR says is not done, so a green tip still reads `plan-open`. An item starting `land:` (or the older
// `READY to`) is the landing step itself and never blocks. A body with no Plan section only warns.
//
// Exit: 0 green, 1 red / pending / no evidence / Plan open / not a draft, 3 no token / API error (unless --local).
// Prints one `= ready-gate <state>` line.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "./github-api.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { commitTreeId } from "../lib/work-tree-id.mjs";
import { writeReceipt } from "../lib/gate-receipt.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Sidecar written by a full green tooling-fast suite (see tooling-fast.mjs). */
const LOCAL_STAMP = path.join(ROOT, "artifacts/logs/tooling-fast-ready.sha");
const LOCAL_LOG = path.join(ROOT, "artifacts/logs/tooling-fast-suite.log");
/** Aggregator job name in ci.yml; its shards are tooling A–D (four since 2026-10-24). */
export const GUARDS_JOB = "Structural guards";
export const GUARDS_A = "Structural guards (tooling A)";
export const GUARDS_B = "Structural guards (tooling B)";
export const GUARDS_C = "Structural guards (tooling C)";
export const GUARDS_D = "Structural guards (tooling D)";

/** Newest check-run per name (by attempt id, with started_at as the fallback). */
export function newestByName(checkRuns) {
  const by = new Map();
  for (const c of checkRuns || []) {
    if (!c || !c.name) continue;
    const cur = by.get(c.name);
    const t = Date.parse(c.started_at || "") || 0;
    const ct = cur ? (Date.parse(cur.started_at || "") || 0) : -Infinity;
    const hasIds = c.id > 0 && cur?.id > 0;
    // A skipped run (a `CI ignored:` edit/label event on the same head) is never evidence over a real one.
    const skipped = (r) => r.conclusion === "skipped";
    if (cur && skipped(c) !== skipped(cur)) { if (skipped(cur)) by.set(c.name, c); continue; }
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
    if (agg.status && agg.status !== "completed") return { state: "pending", evidence: `${GUARDS_JOB} ${agg.status}`, code: 1 };
    if (agg.conclusion === "success") return { state: "passed", evidence: `${GUARDS_JOB} success`, code: 0 };
    if (agg.conclusion === "failure" || agg.conclusion === "timed_out") return { state: "failed", evidence: `${GUARDS_JOB} ${agg.conclusion}`, code: 1 };
    // cancelled / skipped / neutral — fall through to the shards (reuse-draft path)
  }
  // Every shard must report (review 2026-10-27 WP-L8): A+B green with C/D missing or never started is NOT green.
  const names = [GUARDS_A, GUARDS_B, GUARDS_C, GUARDS_D];
  const shards = names.map((n) => by.get(n)).filter(Boolean);
  if (shards.length) {
    const bad = shards.filter((j) => j.status === "completed" && (j.conclusion === "failure" || j.conclusion === "timed_out"));
    if (bad.length) return { state: "failed", evidence: bad.map((j) => `${j.name} ${j.conclusion}`).join("; "), code: 1 };
    const running = shards.filter((j) => j.status && j.status !== "completed");
    if (running.length) return { state: "pending", evidence: `${running.map((j) => j.name).join("/")} still running`, code: 1 };
    const missing = names.filter((n) => !by.get(n));
    if (missing.length) return { state: "pending", evidence: `${missing.join(", ")} missing (all four tooling shards must report)`, code: 1 };
    if (shards.every((j) => j.conclusion === "success")) return { state: "passed", evidence: `${shards.map((j) => j.name).join(" + ")} success`, code: 0 };
  }
  if (!agg && !shards.length) return { state: "none", evidence: "no Structural guards check-run on tip", code: 1 };
  return { state: "pending", evidence: `Structural guards inconclusive (agg=${agg?.conclusion || "—"}; ${names.map((n) => `${n.slice(-2, -1)}=${by.get(n)?.conclusion || "—"}`).join(" ")})`, code: 1 };
}

/** Tip and stamp match when either is a prefix of the other (min 7 hex). */
export function shaPrefixMatch(tip, stamped) {
  const a = String(tip || "").toLowerCase();
  const b = String(stamped || "").toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(a) || !/^[0-9a-f]{7,40}$/.test(b)) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** Local evidence: suite log terminal passed AND the stamp matches the tip. A stamp written since 2026-10-09
 *  carries `tree=<hash>`: the tree the suite MEASURED (possibly dirty). It matches when that hash is the tip
 *  commit's tree, i.e. exactly what was verified is what was committed (ledger M36). A legacy bare-sha stamp
 *  still matches by sha. */
export function localVerdict(tipSha, { stampPath = LOCAL_STAMP, logPath = LOCAL_LOG, read = fs.readFileSync, exists = fs.existsSync, treeOf = commitTreeId } = {}) {
  if (!tipSha || !/^[0-9a-f]{7,40}$/i.test(tipSha)) return { state: "none", evidence: "invalid tip sha for local stamp", code: 1 };
  if (!exists(stampPath)) return { state: "none", evidence: `no local stamp (${path.relative(ROOT, stampPath)}); run tooling-fast full suite`, code: 1 };
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
  if (!exists(logPath)) return { state: "none", evidence: "stamp present but tooling-fast-suite.log missing", code: 1 };
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
  if (stampTree && logTree !== stampTree) return { state: "none", evidence: "tooling-fast-suite.log is from a different run than the stamp (tree differs or missing) — re-run the full suite", code: 1 };
  if (last === "passed") return { state: "passed", evidence: `local tooling-fast passed on ${stamped.slice(0, 7)}`, code: 0 };
  if (last === "failed") return { state: "failed", evidence: "local tooling-fast-suite.log = run failed", code: 1 };
  return { state: "none", evidence: "local suite log has no = run verdict", code: 1 };
}

/**
 * A ready flip on a PR GitHub already considers conflicting starts NO run (2026-10-26: #3785 flipped seconds after
 * #3737 landed; `= ci blocked`). `dirty` refuses; `unknown` means not computed yet: re-read, then refuse. Pure.
 * @returns {null | { state: "dirty"|"unknown", evidence: string }}
 */
export function mergeableProblem(state) {
  if (state === "dirty") return { state: "dirty", evidence: "GitHub reports mergeable_state dirty: sync first (node tools/ci/sync-pr.mjs <branch>); a ready flip on a conflicting PR starts no CI" };
  if (state === "unknown") return { state: "unknown", evidence: "GitHub has not computed mergeability yet (mergeable_state unknown): re-read before flipping" };
  return null;
}

/** The pre-flip PR shape: open and still a draft. Pure. @returns {null | { state: "not-draft"|"closed", evidence }} */
export function draftProblem(pull) {
  if (!pull) return null;
  if (pull.state && pull.state !== "open") return { state: "closed", evidence: `PR is ${pull.state}${pull.merged ? " (merged)" : ""}: nothing to flip` };
  if (pull.draft === false) return { state: "not-draft", evidence: "PR is already ready for review: add the `land` label and let the gate check run" };
  return null;
}

export function resolveSha({ sha, pr, git = spawnSync, request = api } = {}) {
  if (sha) {
    const r = git("git", ["rev-parse", "--verify", sha], { cwd: ROOT, encoding: "utf8" });
    if (r.status === 0) return { sha: r.stdout.trim(), error: null };
    if (/^[0-9a-f]{7,40}$/i.test(sha)) return { sha: sha.toLowerCase(), error: null };   // a CI head not in this clone
    return { sha: null, error: `cannot resolve --sha ${sha}` };
  }
  if (pr != null && pr !== "") {
    const n = Number(pr);
    if (!Number.isInteger(n) || n < 1) return { sha: null, error: `--pr expects a positive integer, got ${pr}` };
    const one = request(`pulls/${n}`);
    if (one.error) return { sha: null, error: `PR #${n}: ${one.error}` };
    const head = one.json?.head?.sha;
    if (!head || !/^[0-9a-f]{40}$/i.test(head)) return { sha: null, error: `PR #${n}: no head sha` };
    // File list for the memory gate (paginate; a big PR can exceed 100). A failed fetch must NOT look like an
    // empty diff (#2901 review): fail closed.
    const files = [];
    let fileRows = 0, filesError = null, page = 1;
    for (;;) {
      const batch = request(`pulls/${n}/files?per_page=100${page > 1 ? `&page=${page}` : ""}`);
      if (batch.error) { filesError = batch.error; break; }
      const rows = Array.isArray(batch.json) ? batch.json : null;
      if (!rows) { filesError = "bad files payload"; break; }
      fileRows += rows.length;
      for (const row of rows) {
        if (row?.filename) files.push(row.filename);
        if (row?.previous_filename) files.push(row.previous_filename);   // a rename out of the store still removes memory
      }
      if (rows.length < 100) break;
      page++;
    }
    // GitHub caps this endpoint at 3000 files; an incomplete diff cannot clear the memory gate.
    const expectedFiles = one.json?.changed_files;
    if (!filesError && Number.isInteger(expectedFiles) && fileRows !== expectedFiles) filesError = `incomplete files list: received ${fileRows} of ${expectedFiles} changed files`;
    const labels = (one.json?.labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
    return {
      sha: head, error: null, pr: n,
      state: one.json?.state || "open", draft: one.json?.draft !== false, merged: !!one.json?.merged,
      mergeableState: one.json?.mergeable_state ?? null,
      branch: one.json?.head?.ref || "", body: one.json?.body || "", title: one.json?.title || "",
      labels, files: filesError ? null : files, filesError,
    };
  }
  const r = git("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return { sha: null, error: "git rev-parse HEAD failed" };
  return { sha: r.stdout.trim(), error: null };
}

/** Decide the tip: Structural guards on the head, else the local stamp. @returns {{ state, evidence, code, sha, source }} */
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
    if (!batch.length || (checks.json?.total_count != null ? list.length >= checks.json.total_count : batch.length < 100)) break;
    page++;
  } while (true);
  if (checks.error) {
    if (local.state === "passed") return { ...local, sha, source: "local-fallback", apiError: checks.error };
    return { state: "unknown", evidence: checks.error, code: 3, sha, source: "api" };
  }
  const remote = guardsVerdict(list);
  if (remote.state === "passed" || remote.state === "failed") return { ...remote, sha, source: "ci" };
  // pending/none: a local green stamp unblocks a worker who ran tooling-fast before CI finished
  if (local.state === "passed") return { ...local, sha, source: "local" };
  return { ...remote, sha, source: "ci" };
}

/** The `= ready-gate …` line; sha is the FULL 40 chars (#2430). */
export function verdictLine(v) {
  return `= ready-gate ${v.state} — ${v.evidence} sha=${v.sha || ""} source=${v.source || "—"}`;
}

/** Plan checklist text. Cursor Cloud's ManagePullRequest writes only inside `<!-- CURSOR_AGENT_PR_BODY_* -->`:
 *  prefer that slice's Plan when it has checklist items; otherwise the body with HTML comments removed. */
export function planBodySource(body) {
  const raw = String(body || "");
  const agent = /<!--\s*CURSOR_AGENT_PR_BODY_BEGIN\s*-->([\s\S]*?)<!--\s*CURSOR_AGENT_PR_BODY_END\s*-->/i.exec(raw);
  if (agent) {
    const slice = agent[1];
    if (/^##[ \t]+Plan\b/m.test(slice) && /^[ \t]*[-*][ \t]+\[[ xX~]\]/m.test(slice)) return slice;
  }
  return raw.replace(/<!--[\s\S]*?-->/g, "");
}

/** An item starting `land:` is the landing step (ready → `land` label → the gate check): it never blocks.
 *  `READY to` is the pre-2026-10-27 template's terminal item, still accepted on older bodies. */
export const LAND_ITEM = /^(\*\*)?(land:|READY to\b)/i;

/** The PR body's `## Plan` checklist (AGENTS.md rule 12). An item is OPEN when it is neither ticked (`[x]`), struck
 *  (`~~dropped~~ — why`), deferred (`[~]`, or text starting `Deferred:`) nor a landing item; an empty `- [ ]` (the
 *  template's placeholder) is open. @returns {{ state: "none"|"open"|"done", items: number, open: string[] }} */
export function planVerdict(body) {
  const text = planBodySource(body);
  const head = /^##[ \t]+Plan\b.*$/m.exec(text);
  if (!head) return { state: "none", items: 0, open: [] };
  const rest = text.slice(head.index + head[0].length);
  const next = /^##[ \t]/m.exec(rest);
  const section = next ? rest.slice(0, next.index) : rest;
  const items = [...section.matchAll(/^[ \t]*[-*][ \t]+\[([ xX~])\][ \t]*(.*)$/gm)];
  if (!items.length) return { state: "none", items: 0, open: [] };
  const open = items
    .filter(([, mark, t]) => mark === " " && !/^~~/.test(t.trim()) && !/^(\*\*)?Deferred:/i.test(t.trim()) && !LAND_ITEM.test(t.trim()))
    .map(([, , t]) => t.trim() || "(empty item)");
  return { state: open.length ? "open" : "done", items: items.length, open };
}

/** Fold the Plan into a green verdict: open items refuse (exit 1); no Plan passes with a `planWarning`. */
export function withPlan(v, body) {
  if (!v || v.code !== 0 || body == null) return v;
  const p = planVerdict(body);
  if (p.state === "open") {
    const shown = p.open.slice(0, 3).map((t) => `"${t}"`).join(", ");
    return { ...v, state: "plan-open", code: 1, plan: p,
      evidence: `${p.open.length} of ${p.items} Plan item(s) open: ${shown}${p.open.length > 3 ? ", ..." : ""} — tick each with its evidence or strike it with why (AGENTS.md rule 12)` };
  }
  if (p.state === "none") return { ...v, plan: p, planWarning: "PR body has no ## Plan checklist (AGENTS.md rule 12)" };
  return { ...v, plan: p };
}

/** `.claude/memory/` edits need an explicit intent marker: a body line `memory-change: <reason>` or the
 *  `memory-change` label (docs/notes/AGENT-MEMORY.md). A bare "memory" word never unlocks it (#2901 review).
 *  @returns {{ state: "ok"|"memory-leak", files: string[], evidence: string, code: number }} */
export function memoryVerdict(files, { body = "", labels = [] } = {}) {
  const list = (files || []).map((f) => String(f || "").replace(/^\.\//, ""));
  const mem = list.filter((f) => f === ".claude/memory" || f.startsWith(".claude/memory/"));
  if (!mem.length) return { state: "ok", files: [], evidence: "no .claude/memory/ edits", code: 0 };
  const marker = /^memory-change:[\t ]*\S+/mi.test(String(body || ""));
  const labelled = (labels || []).some((l) => String(l).toLowerCase() === "memory-change");
  if (marker || labelled) return { state: "ok", files: mem, evidence: marker ? "memory-change: body marker" : "memory-change label", code: 0 };
  const shown = mem.slice(0, 4).join(", ") + (mem.length > 4 ? ", ..." : "");
  return { state: "memory-leak", files: mem, code: 1,
    evidence: `.claude/memory/ edited without memory-change: marker or label (${shown}) — add \`memory-change: <reason>\` to the PR body (docs/notes/AGENT-MEMORY.md) or drop the paths` };
}

/** Fold memoryVerdict onto a green tip like withPlan. `meta.filesError` fails closed: a missing file list must not
 *  look like "no memory edits". */
export function withMemory(v, files, meta = {}) {
  if (!v || v.code !== 0) return v;
  if (meta.filesError) {
    return { ...v, state: "memory-unknown", code: 1, memory: { state: "unknown", filesError: meta.filesError, code: 1 },
      evidence: `cannot list PR files for the memory gate (${meta.filesError}) — re-run ready-gate when the API is up` };
  }
  if (files == null) return v;
  const m = memoryVerdict(files, meta);
  if (m.state === "memory-leak") return { ...v, state: "memory-leak", code: 1, memory: m, evidence: m.evidence };
  return { ...v, memory: m };
}

/** Write LOCAL_STAMP after a green full suite (called from tooling-fast): the head the run STARTED on, plus `tree`. */
export function stampReadySha(sha, { tree = "", stampPath = LOCAL_STAMP, write = fs.writeFileSync, mkdir = fs.mkdirSync } = {}) {
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return false;
  if (tree && !/^[0-9a-f]{40,64}$/i.test(tree)) return false;
  mkdir(path.dirname(stampPath), { recursive: true });
  write(stampPath, sha.trim() + (tree ? ` tree=${tree}` : "") + "\n");
  return true;
}

const USAGE = `usage: node tools/ci/ready-gate.mjs [--sha <sha|ref>] [--pr <n>] [--local] [--json] [--wait [--timeout <min>]]
  The worker's pre-flip check. Exit 0 only when tooling-fast / Structural guards is green on the
  tip and, with --pr: the PR is an open draft, not CONFLICTING (mergeable_state dirty: sync first), every item of
  the body's ## Plan checklist is ticked or struck (an item starting \`land:\` is the landing step and never blocks),
  and .claude/memory/ edits carry \`memory-change: <reason>\` in the body or the \`memory-change\` label.
  A failed PR-files fetch fails closed. --wait polls a pending Structural guards every 30 s (default 30 min; a new
  head aborts). --local uses artifacts/logs/tooling-fast-ready.sha + tooling-fast-suite.log only (no GitHub API).
  A --pr run writes artifacts/ready-gate/<n>.json (pass or refuse), which the hooks require before the flip.
  Exit 1 refused, 3 no token / API error.`;

/** The CLI, with every side effect injectable: request (GitHub), resolve (git/PR), judge (the tip), receipt, sleep, now, log. */
export function main(argv, { request = api, resolve = resolveSha, judge = evaluate, receipt = (d) => writeReceipt(ROOT, "ready", d), sleep = (s) => spawnSync("sleep", [String(s)]), now = Date.now, log = console.log } = {}) {
  exitIfHelp(argv, USAGE);
  const say = (...a) => log("[ready-gate]", ...a);
  // The receipt github-mcp-guard.sh / bash-guard.sh require before a draft→ready flip: written for a --pr run only,
  // pass or refuse, so the hook can say WHY the last gate run refused.
  const record = (pr, head, ok, evidence) => { try { receipt({ pr, head, ok, evidence }); } catch (e) { say(`warning: could not write the ready-gate receipt: ${e.message}`); } };
  const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : null; };
  const localOnly = argv.includes("--local");
  const asJson = argv.includes("--json");
  const waitMin = argv.includes("--wait") ? Number(opt("--timeout") || 30) : 0;
  let resolved = resolve({ sha: opt("--sha"), pr: opt("--pr"), request });
  if (resolved.error) { say(`= ready-gate unknown — ${resolved.error}`); return 3; }
  if (resolved.pr) {
    const dp = draftProblem({ state: resolved.state, draft: resolved.draft, merged: resolved.merged });
    if (dp) { say(`= ready-gate ${dp.state} — ${dp.evidence} sha=${resolved.sha}`); record(resolved.pr, resolved.sha, false, `${dp.state}: ${dp.evidence}`); return 1; }
    // mergeability: `unknown` is re-read up to 3 times (2, 4, 8 s), `dirty` refuses with its own row.
    for (let i = 0; i < 3 && resolved.mergeableState === "unknown"; i++) {
      sleep(2 ** (i + 1));
      resolved = resolve({ pr: opt("--pr"), request });
      if (resolved.error) { say(`= ready-gate unknown — ${resolved.error}`); return 3; }
    }
    const mp = mergeableProblem(resolved.mergeableState);
    if (mp) { say(`= ready-gate conflicting — ${mp.evidence} sha=${resolved.sha}`); record(resolved.pr, resolved.sha, false, `conflicting: ${mp.evidence}`); return 1; }
  }
  let judged = judge({ sha: resolved.sha, localOnly, request });
  if (waitMin > 0) {
    const deadline = now() + waitMin * 60_000;
    let lastSaid = 0;
    while (judged.state === "pending" && now() < deadline) {
      if (now() - lastSaid > 5 * 60_000) { say(`= ready-gate waiting — ${judged.evidence} sha=${resolved.sha}`); lastSaid = now(); }
      sleep(30);
      if (resolved.pr) {
        const again = resolve({ pr: opt("--pr"), request });
        if (!again.error && again.sha !== resolved.sha) { say(`= ready-gate moved — head is now ${again.sha} (was ${resolved.sha}); re-run on the new head`); return 1; }
      }
      judged = judge({ sha: resolved.sha, localOnly, request });
    }
  }
  const v = withMemory(withPlan(judged, resolved.body), resolved.files,
    { body: resolved.body || "", labels: resolved.labels || [], filesError: resolved.filesError || null });
  if (resolved.pr) record(resolved.pr, v.sha, v.code === 0, v.code === 0 ? "" : `${v.state}: ${v.evidence}`);
  if (asJson) log(JSON.stringify({ ...v, pr: resolved.pr || null }, null, 2));
  else {
    if (v.planWarning) say(`warning: ${v.planWarning}`);
    if (resolved.pr && v.code === 0) say("note: this receipt is good for 10 min; flip (update_pull_request draft:false), then add `land`; if it ages out, re-run ready-gate");
    say(verdictLine(v));
  }
  return v.code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
