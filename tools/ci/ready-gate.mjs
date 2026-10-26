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
// A `cursor/` head branch must also carry the ```fleet block's fleet letter and
// `orchestrator:` (`fleet-block`; fleet redesign plan §4B item 7).
//
// Exit: 0 green, 1 red / pending / no evidence / Plan open, 3 no token / API
// error (unless --local). Prints one `= ready-gate <state>` line.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, REPO } from "./github-api.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { commitTreeId } from "../lib/work-tree-id.mjs";
import { writeReceipt } from "../lib/gate-receipt.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export { REPO };
/** Sidecar written by a full green tooling-fast suite (see tooling-fast.mjs). */
const LOCAL_STAMP = path.join(ROOT, "artifacts/logs/tooling-fast-ready.sha");
const LOCAL_LOG = path.join(ROOT, "artifacts/logs/tooling-fast-suite.log");
/** Aggregator job name in ci.yml; its shards are tooling A–D (four since 2026-10-24, three before, two before that). */
export const GUARDS_JOB = "Structural guards";
export const GUARDS_A = "Structural guards (tooling A)";
export const GUARDS_B = "Structural guards (tooling B)";
export const GUARDS_C = "Structural guards (tooling C)";
export const GUARDS_D = "Structural guards (tooling D)";

const say = (...a) => console.log("[ready-gate]", ...a);

/* The GitHub client is github-api.mjs's (2026-10-26): ready-gate's private copy
   had no 5xx/429 retry, so one GitHub 502 refused a gate whose receipt the
   hooks require. Re-exported for fleet-owner.mjs and merge-gate.mjs. */
export { api };

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
  const a = by.get(GUARDS_A), b = by.get(GUARDS_B), c = by.get(GUARDS_C), d = by.get(GUARDS_D);
  if (a && b) {
    const halves = [a, b, c, d].filter(Boolean);
    const pending = halves.some((j) => j.status && j.status !== "completed");
    if (pending) return { state: "pending", evidence: `${halves.map((j) => j.name).join("/")} still running`, code: 1 };
    if (halves.every((j) => j.conclusion === "success")) {
      return { state: "passed", evidence: `${halves.map((j) => j.name).join(" + ")} success`, code: 0 };
    }
    const bad = halves.filter((j) => j.conclusion === "failure" || j.conclusion === "timed_out");
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

/**
 * A ready flip on a PR GitHub already considers conflicting starts NO run (2026-10-26 08:36Z: #3785 was
 * flipped seconds after #3737 landed; ci-watch said `= ci blocked` five minutes later). `dirty` refuses;
 * `unknown` means GitHub has not computed it yet: re-read (the caller retries), then refuse. Pure.
 * @returns {null | { state: "dirty"|"unknown", evidence: string }}
 */
export function mergeableProblem(state) {
  if (state === "dirty") return { state: "dirty", evidence: "GitHub reports mergeable_state dirty: sync first (node tools/ci/sync-pr.mjs <branch>); a ready flip on a conflicting PR starts no CI" };
  if (state === "unknown") return { state: "unknown", evidence: "GitHub has not computed mergeability yet (mergeable_state unknown): re-read before flipping" };
  return null;
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
    // File list for the memory-leak gate (paginate; a big PR can exceed 100).
    // A failed fetch must NOT look like an empty diff (#2901 review): fail closed.
    const files = [];
    let fileRows = 0;
    let filesError = null;
    let page = 1;
    for (;;) {
      const batch = request(`pulls/${n}/files?per_page=100${page > 1 ? `&page=${page}` : ""}`);
      if (batch.error) { filesError = batch.error; break; }
      const rows = Array.isArray(batch.json) ? batch.json : (batch.json?.length != null ? batch.json : null);
      if (!Array.isArray(rows)) { filesError = "bad files payload"; break; }
      fileRows += rows.length;
      for (const row of rows) {
        if (row?.filename) files.push(row.filename);
        // A rename out of the store still removes memory; inspect both paths.
        if (row?.previous_filename) files.push(row.previous_filename);
      }
      if (rows.length < 100) break;
      page++;
    }
    // GitHub caps this endpoint at 3000 files; an incomplete diff cannot clear
    // the memory gate. Count rows, not paths (a rename contributes two paths).
    const expectedFiles = one.json?.changed_files;
    if (!filesError && Number.isInteger(expectedFiles) && fileRows !== expectedFiles) {
      filesError = `incomplete files list: received ${fileRows} of ${expectedFiles} changed files`;
    }
    const labels = (one.json?.labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
    return {
      sha: head, error: null, pr: n,
      mergeableState: one.json?.mergeable_state ?? null,
      branch: one.json?.head?.ref || "",
      body: one.json?.body || "",
      title: one.json?.title || "",
      labels,
      files: filesError ? null : files,
      filesError,
    };
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
 *  it is neither ticked (`[x]`), struck (`~~dropped~~ — why`) nor deferred
 *  (`[~]`, or text starting `Deferred:`), or the hand-off item `READY to <orchestrator>`
 *  (it can only be ticked after the gate it waits on passes); an empty
 *  `- [ ]` (the template's placeholder) is open. HTML comments — where the
 *  template keeps its example items — are not part of the list.
 *  @returns {{ state: "none"|"open"|"done", items: number, open: string[] }} */
/** The `= ready-gate …` line; sha is the FULL 40 chars because a session pastes it into a merge call (#2430). */
export function verdictLine(v) {
  return `= ready-gate ${v.state} — ${v.evidence} sha=${v.sha || ""} source=${v.source || "—"}`;
}

/**
 * Plan checklist text for ready-gate. Cursor Cloud's ManagePullRequest writes
 * only inside `<!-- CURSOR_AGENT_PR_BODY_* -->`; stripping every HTML comment
 * left owners unable to close Plan items on a human-opened PR (outer Plan stayed
 * open; agent ticks lived in the stripped slice). Prefer the agent slice's Plan
 * when it has checklist items; otherwise use the body with comments removed.
 */
export function planBodySource(body) {
  const raw = String(body || "");
  const agent = /<!--\s*CURSOR_AGENT_PR_BODY_BEGIN\s*-->([\s\S]*?)<!--\s*CURSOR_AGENT_PR_BODY_END\s*-->/i.exec(raw);
  if (agent) {
    const slice = agent[1];
    if (/^##[ \t]+Plan\b/m.test(slice) && /^[ \t]*[-*][ \t]+\[[ xX~]\]/m.test(slice)) return slice;
  }
  return raw.replace(/<!--[\s\S]*?-->/g, "");
}

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
    .filter(([, mark, t]) => mark === " " && !/^~~/.test(t.trim()) && !/^(\*\*)?Deferred:/i.test(t.trim()) && !/^(\*\*)?READY to\b/.test(t.trim()))
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
    const shown = p.open.slice(0, 3).map((t) => `"${t}"`).join(", ");
    return { ...v, state: "plan-open", code: 1, plan: p,
      evidence: `${p.open.length} of ${p.items} Plan item(s) open: ${shown}${p.open.length > 3 ? ", ..." : ""} — tick each with its evidence or strike it with why (AGENTS.md rule 12)` };
  }
  if (p.state === "none") return { ...v, plan: p, planWarning: "PR body has no ## Plan checklist (AGENTS.md rule 12)" };
  return { ...v, plan: p };
}

/**
 * `.claude/memory/` edits need an explicit intent marker on the PR — a body
 * line `memory-change: <reason>` or the `memory-change` label (docs/notes/
 * AGENT-MEMORY.md §memory-change). A bare "memory" word or a path mention
 * does NOT unlock the gate (#2901 review).
 * @returns {{ state: "ok"|"memory-leak"|"none", files: string[], evidence: string, code: number }}
 */
export function memoryVerdict(files, { title = "", body = "", labels = [] } = {}) {
  const list = (files || []).map((f) => String(f || "").replace(/^\.\//, ""));
  const mem = list.filter((f) => f === ".claude/memory" || f.startsWith(".claude/memory/"));
  if (!mem.length) return { state: "ok", files: [], evidence: "no .claude/memory/ edits", code: 0 };
  const marker = /^memory-change:[\t ]*\S+/mi.test(String(body || ""));
  const labelled = (labels || []).some((l) => String(l).toLowerCase() === "memory-change");
  if (marker || labelled) {
    return { state: "ok", files: mem, evidence: marker ? "memory-change: body marker" : "memory-change label", code: 0 };
  }
  const shown = mem.slice(0, 4).join(", ") + (mem.length > 4 ? ", ..." : "");
  return {
    state: "memory-leak",
    files: mem,
    code: 1,
    evidence: `.claude/memory/ edited without memory-change: marker or label (${shown}) — add \`memory-change: <reason>\` to the PR body (docs/notes/AGENT-MEMORY.md) or drop the paths`,
  };
}

/** Fold memoryVerdict onto a green tip the same way withPlan does.
 *  `meta.filesError` fails closed: a missing file list must not look like
 *  "no memory edits". Pass `files` as null/undefined with filesError set. */
export function withMemory(v, files, meta = {}) {
  if (!v || v.code !== 0) return v;
  if (meta.filesError) {
    return {
      ...v, state: "memory-unknown", code: 1,
      evidence: `cannot list PR files for the memory gate (${meta.filesError}) — re-run ready-gate when the API is up`,
      memory: { state: "unknown", filesError: meta.filesError, code: 1 },
    };
  }
  if (files == null) return v;
  const m = memoryVerdict(files, meta);
  if (m.state === "memory-leak") {
    return { ...v, state: "memory-leak", code: 1, memory: m, evidence: m.evidence };
  }
  return { ...v, memory: m };
}

/**
 * The PR body's ```fleet block as key/values (agent-fleet SKILL.md §The fleet block): `#` comments and `<placeholder>`
 * values dropped, first value of a key wins. Outside HTML comments, else inside Cursor's agent slice. {} when absent. Pure.
 */
export function fleetBlock(body) {
  const raw = String(body || "");
  const agent = /<!--\s*CURSOR_AGENT_PR_BODY_BEGIN\s*-->([\s\S]*?)<!--\s*CURSOR_AGENT_PR_BODY_END\s*-->/i.exec(raw);
  const find = (t) => /```fleet[ \t]*\r?\n([\s\S]*?)```/.exec(t);
  const m = find(raw.replace(/<!--[\s\S]*?-->/g, "")) || (agent && find(agent[1]));
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^\s*([a-z][a-z-]*)\s*:\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (kv && kv[2] && !kv[2].startsWith("<") && out[kv[1]] == null) out[kv[1]] = kv[2];
  }
  return out;
}

/** A fleet letter from a value: `A`, `A·W3` -> "A"; anything else (a `<host>:<id>`) -> "". Pure. */
const letterOf = (v) => (/^([A-Z])(?:·\S*)?$/.exec(String(v || "").trim()) || [])[1] || "";

/**
 * Who a PR body says it belongs to: { block, letter, orchestrator, slot }. `letter` comes from `fleet:`, else a letter
 * `orchestrator:`, else a `slot:`; `slot` from `slot:`, else a `<letter>·<slot>` token in the block's `title:`/`session:`. Pure.
 */
export function fleetIdentity(body) {
  const b = fleetBlock(body);
  const tok = /\b([A-Z]·[A-Z]+\d+(?:·[A-Za-z0-9]+)*)/;
  const slot = b.slot || (tok.exec(b.title || "") || tok.exec(b.session || "") || [])[1] || "";
  return {
    block: Object.keys(b).length > 0,
    letter: letterOf(b.fleet) || letterOf(b.orchestrator) || letterOf(slot),
    orchestrator: b.orchestrator || "",
    slot,
  };
}

/**
 * A `cursor/` branch's PR must say which fleet it belongs to (fleet redesign §4B item 7): a ```fleet block with
 * `fleet:` (or a letter `orchestrator:`) and `orchestrator:`. Folds onto a green verdict like withPlan; a red one,
 * a non-`cursor/` branch and a run without a PR (`branch` null) pass through. Pure.
 */
export function withFleet(v, branch, body) {
  if (!v || v.code !== 0 || branch == null || !/^cursor\//.test(String(branch))) return v;
  const f = fleetIdentity(body);
  const missing = !f.block ? ["```fleet block"] : [...(f.letter ? [] : ["fleet:"]), ...(f.orchestrator ? [] : ["orchestrator:"])];
  if (!missing.length) return { ...v, fleet: f };
  return { ...v, state: "fleet-block", code: 1, fleet: f,
    evidence: `${branch} PR body is missing ${missing.join(" and ")} — add the agent-fleet fleet block (\`fleet: <letter>\`, \`orchestrator: <letter>\`; skill agent-fleet §The fleet block)` };
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

const USAGE = `usage: node tools/ci/ready-gate.mjs [--sha <sha|ref>] [--pr <n>] [--local] [--json] [--wait [--timeout <min>]]
  --wait: while Structural guards is still running, poll every 30 s (default 30 min; a new head aborts the wait).
  With --pr, a conflicting PR (mergeable_state dirty) refuses first: sync, then re-run (a ready flip on a dirty
  PR starts no CI). The Plan's terminal item may start \`READY to \` (the orchestrator's step): it never blocks.
  Exit 0 only when tooling-fast / Structural guards is green on the tip (AGENTS.md §Concurrent PRs)
  and, with --pr, every item of the PR body's ## Plan checklist is ticked or struck (rule 12),
  and .claude/memory/ edits carry an explicit intent marker: a body line
  \`memory-change: <reason>\` or the \`memory-change\` label (docs/notes/AGENT-MEMORY.md).
  A failed PR-files fetch fails closed (never "no memory edits"). Evidence: #1111.
  A cursor/ head branch also needs the body's \`\`\`fleet block with \`fleet:\` (or a letter
  \`orchestrator:\`) and \`orchestrator:\` (state fleet-block; skill agent-fleet §The fleet block).
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
  const waitMin = argv.includes("--wait") ? Number(opt("--timeout") || 30) : 0;
  const sleepS = (s) => spawnSync("sleep", [String(s)]);
  let resolved = resolveSha({ sha: opt("--sha"), pr: opt("--pr") });
  if (resolved.error) {
    say(`= ready-gate unknown — ${resolved.error}`);
    process.exit(3);
  }
  // mergeability first: `unknown` is re-read up to 3 times (2, 4, 8 s), `dirty` refuses with its own row.
  if (resolved.pr) {
    for (let i = 0; i < 3 && resolved.mergeableState === "unknown"; i++) {
      sleepS(2 ** (i + 1));
      resolved = resolveSha({ pr: opt("--pr") });
      if (resolved.error) { say(`= ready-gate unknown — ${resolved.error}`); process.exit(3); }
    }
    const mp = mergeableProblem(resolved.mergeableState);
    if (mp) {
      say(`= ready-gate conflicting — ${mp.evidence} sha=${resolved.sha}`);
      try { writeReceipt(ROOT, "ready", { pr: resolved.pr, head: resolved.sha, ok: false, evidence: `conflicting: ${mp.evidence}` }); }
      catch (e) { say(`warning: could not write the ready-gate receipt: ${e.message}`); }
      process.exit(1);
    }
  }
  // --wait: while Structural guards is pending, poll every 30 s up to --timeout minutes (default 30),
  // one "waiting" line per 5 minutes; the head is re-read so a new push is noticed, not misjudged.
  let judged = evaluate({ sha: resolved.sha, localOnly });
  if (waitMin > 0) {
    const deadline = Date.now() + waitMin * 60_000;
    let lastSaid = 0;
    while (judged.state === "pending" && Date.now() < deadline) {
      if (Date.now() - lastSaid > 5 * 60_000) { say(`= ready-gate waiting — ${judged.evidence} sha=${resolved.sha}`); lastSaid = Date.now(); }
      sleepS(30);
      if (resolved.pr) {
        const again = resolveSha({ pr: opt("--pr") });
        if (!again.error && again.sha !== resolved.sha) { say(`= ready-gate moved — head is now ${again.sha} (was ${resolved.sha}); re-run on the new head`); process.exit(1); }
      }
      judged = evaluate({ sha: resolved.sha, localOnly });
    }
  }
  const planned = withFleet(withPlan(judged, resolved.body),
    resolved.pr ? resolved.branch || "" : null, resolved.body);
  const v = withMemory(planned, resolved.files, {
    title: resolved.title || "",
    body: resolved.body || "",
    labels: resolved.labels || [],
    filesError: resolved.filesError || null,
  });
  const line = verdictLine(v);
  // The receipt github-mcp-guard.sh requires before a draft→ready flip (tools/lib/gate-receipt.mjs):
  // written for a --pr run only, pass or refuse, so the hook can say WHY the last gate run refused.
  if (resolved.pr) {
    try { writeReceipt(ROOT, "ready", { pr: resolved.pr, head: v.sha, ok: v.code === 0, evidence: v.code === 0 ? "" : `${v.state}: ${v.evidence}` }); }
    catch (e) { say(`warning: could not write the ready-gate receipt: ${e.message}`); }
  }
  if (asJson) console.log(JSON.stringify({ ...v, pr: resolved.pr || null }, null, 2));
  else {
    if (v.planWarning) say(`warning: ${v.planWarning}`);
    say(line);
  }
  process.exit(v.code);
}
