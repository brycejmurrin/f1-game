#!/usr/bin/env node
// merge-gate.mjs — the one gate before a PR merge: proves the PR's state and writes the receipt the hook requires.
// @doc Gate before a PR merge: ready-gate, CI on the head, no hold, gen:check on a local merge, bus pacing; writes the receipt.
// @section runner
// @skill agent-fleet
//
// Why (docs/plans/2026-10-19-fleet-redesign.md §1-2): merges were gated by a
// human word per orchestrator SESSION ("Level 3", re-asked at every rotation,
// 11 rotations on 2026-10-19) while github-mcp-guard.sh checked only the merge
// method. Now the word is a standing rule in AGENTS.md §Concurrent PRs and the
// proof is this gate: it reads GitHub and the bus, merges the head onto the
// CURRENT deploy tip in a throw-away worktree and runs `npm run gen:check`
// there (role-merge-holder.md: a peer may have merged a minute ago), then
// writes a receipt that `.claude/hooks/github-mcp-guard.sh` demands on
// `merge_pull_request` / `enable_pr_auto_merge` (fresh, ok, same PR, pinned
// `expectedHeadSha` = the gated head). No receipt, no merge, whoever asks.
//
//   node tools/ci/merge-gate.mjs --pr <n>                  # gate the PR's head; exit 0 = merge now with expectedHeadSha=<head>
//   node tools/ci/merge-gate.mjs --pr <n> --sha <head>     # refuse unless the PR head is still <head>
//   node tools/ci/merge-gate.mjs --pr <n> --skip-local-merge   # no worktree merge / gen:check (the receipt says so)
//   node tools/ci/merge-gate.mjs --pr <n> --json
//
// Rows (every one must pass): open (not draft, mergeable_state not dirty /
// unknown / blocked), hold (no `MERGE-HOLD:` body line outside HTML comments),
// ready (ready-gate: Structural guards green, Plan closed, memory marker),
// ci (the required `CI` check-run success on the head), gen (local merge onto
// the fetched deploy tip + gen:check), pacing (game PRs only — js/ css/ assets/
// index.html sw.js: no open INCIDENT freeze on the bus, the newest GAME-SLOT
// line names this PR and comes from this session, and the last game DONE's
// merge sha has a green pages.yml run). Identity: `--as`, APEX_FLEET_AS or the
// session env, as fleet-bus.mjs resolves it.
//
// Exit: 0 passed (receipt ok:true), 1 refused (receipt ok:false), 3 API or git
// error (no receipt written). Prints one `= merge-gate <passed|refused|unknown> …` line.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, evaluate, resolveSha, withPlan, withMemory } from "./ready-gate.mjs";
import { hasMergeHold } from "./pr-board.mjs";
import { readBus, whoAmI } from "./fleet-bus.mjs";
import { DEPLOY_BRANCH } from "./deploy.mjs";
import { writeReceipt } from "../lib/gate-receipt.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** The deploy branch's one required check (ci.yml `ci-verdict`, Bryce 2026-10-15). */
export const REQUIRED_CHECK = "CI";
/** Paths whose merge is PACED: one per green Pages run (AGENTS.md §Git branch & deploy, role-merge-holder.md). */
export const GAME_PATH = /^(js\/|css\/|assets\/|index\.html$|sw\.js$)/;
export const isGamePath = (p) => GAME_PATH.test(String(p || "").replace(/^\.\//, ""));
export const gameFiles = (files) => (files || []).filter(isGamePath);
/** A GAME-SLOT with no DONE after this long has lapsed (role-merge-holder.md §Parallel orchestrators). */
export const SLOT_LAPSE_MIN = 30;

const row = (ok, evidence) => ({ ok: !!ok, evidence });

/** The PR itself: open, not a draft, GitHub does not call it dirty/unknown/blocked. Pure. */
export function openVerdict(pull) {
  if (!pull) return row(false, "no pull request");
  if (pull.state !== "open") return row(false, `PR is ${pull.state}${pull.merged ? " (merged)" : ""}`);
  if (pull.draft) return row(false, "still a draft: mark it ready first (ready-gate.mjs --pr)");
  const ms = String(pull.mergeable_state || "unknown");
  if (["dirty", "unknown", "blocked", "draft"].includes(ms)) {
    return row(false, ms === "dirty" ? "CONFLICTING: sync-pr.mjs first" : ms === "blocked" ? "blocked: a required check or review is missing" : `mergeable_state ${ms} (GitHub still computing: retry)`);
  }
  return row(true, `open, mergeable_state ${ms}`);
}

/** The required `CI` check-run on the head, newest attempt. Pure. */
export function ciVerdict(checkRuns, name = REQUIRED_CHECK) {
  let best = null;
  for (const c of checkRuns || []) {
    if (!c || c.name !== name) continue;
    if (!best || (c.id || 0) > (best.id || 0)) best = c;
  }
  if (!best) return row(false, `no ${name} check-run on the head yet (a draft runs the fast tier only; the full tier starts at ready)`);
  if (best.status !== "completed") return row(false, `${name} ${best.status}`);
  return best.conclusion === "success" ? row(true, `${name} success (check-run ${best.id})`) : row(false, `${name} ${best.conclusion}`);
}

/** Entries that are GAME-SLOT claims: the GAME-SLOT type, or the HANDOFF text form orchestrators wrote before it existed. Pure. */
export const slotOf = (e) => {
  if (!e) return null;
  const text = e.type === "GAME-SLOT" ? e.text : e.type === "HANDOFF" && /^GAME-SLOT\b/.test(e.text || "") ? e.text.replace(/^GAME-SLOT\s*/, "") : null;
  if (text == null) return null;
  const m = /#(\d+)/.exec(text);
  return { pr: m ? Number(m[1]) : null, from: e.from, at: e.at, text };
};

/**
 * Game pacing from the bus entries (oldest first). Pure except `pagesGreen(sha)` → true | false | null (pending).
 * now in unix seconds.
 */
export function pacingVerdict(entries, { pr, me, pagesGreen = () => null, now = Math.floor(Date.now() / 1000) } = {}) {
  let frozen = null, slot = null, lastGame = null, lastDoneAt = 0;
  for (const e of entries || []) {
    if (e.type === "INCIDENT") frozen = /\blifted\b/i.test(e.text) ? null : e;
    const s = slotOf(e);
    if (s) slot = s;
    if (e.type === "DONE") {
      lastDoneAt = e.at;
      if (/\bgame\b/i.test(e.text) && !/\bnon-game\b/i.test(e.text)) lastGame = e;
    }
  }
  if (frozen) return row(false, `merges frozen by INCIDENT from ${frozen.from}: ${frozen.text.slice(0, 80)} — wait for its \`INCIDENT … lifted\` line`);
  if (!slot) return row(false, `no GAME-SLOT on the bus: \`node tools/ci/fleet-bus.mjs send GAME-SLOT --to '*' "#${pr} <head sha>"\`, re-read, then gate again`);
  const slotLive = slot.at > lastDoneAt && now - slot.at <= SLOT_LAPSE_MIN * 60;
  if (slot.pr !== Number(pr)) {
    if (slotLive) return row(false, `GAME-SLOT held by ${slot.from} for #${slot.pr} (${Math.round((now - slot.at) / 60)} min ago): wait for its DONE`);
    return row(false, `the newest GAME-SLOT (#${slot.pr} by ${slot.from}) is closed or lapsed: take the slot for #${pr} first`);
  }
  if (me && slot.from !== me) return row(false, `GAME-SLOT for #${pr} was taken by ${slot.from}, not this session (${me})`);
  if (lastGame) {
    const m = /\bmerged\s+([0-9a-f]{7,40})\b/i.exec(lastGame.text) || /\b([0-9a-f]{7,40})\b/.exec(lastGame.text);
    const sha = m ? m[1] : "";
    const g = sha ? pagesGreen(sha) : null;
    if (g !== true) return row(false, `last game merge ${sha ? sha.slice(0, 8) : "(sha unknown)"} (${lastGame.from}) has no green pages.yml run yet${g === null ? " (pending or unknown)" : " (red: stop, INCIDENT)"}`);
    return row(true, `slot #${pr} by ${slot.from}; Pages green on ${sha.slice(0, 8)}`);
  }
  return row(true, `slot #${pr} by ${slot.from}; no earlier game DONE on the bus`);
}

// ---- GitHub and git ---------------------------------------------------------------

function checkRunsFor(sha, request) {
  const list = [];
  let page = 1;
  for (;;) {
    const r = request(`commits/${encodeURIComponent(sha)}/check-runs?per_page=100${page > 1 ? `&page=${page}` : ""}`);
    if (r.error) return { error: r.error };
    const batch = r.json?.check_runs || [];
    list.push(...batch);
    if (!batch.length || (r.json?.total_count != null ? list.length >= r.json.total_count : batch.length < 100)) break;
    page++;
  }
  return { list };
}

/** true | false | null for the newest pages.yml run on `sha`. */
export function pagesGreenFor(sha, request = api) {
  const r = request(`actions/workflows/pages.yml/runs?head_sha=${sha}&per_page=5`);
  if (r.error || !Array.isArray(r.json?.workflow_runs)) return null;
  const runs = r.json.workflow_runs;
  if (!runs.length) return null;
  if (runs.some((x) => x.conclusion === "success")) return true;
  if (runs.some((x) => x.status !== "completed")) return null;
  return false;
}

const git = (args, cwd = ROOT, extra = {}) => spawnSync("git", args, { cwd, encoding: "utf8", timeout: 120_000, ...extra });

/**
 * Merge `head` (fetched from `headRef`) onto the fetched deploy tip in a throw-away worktree and run gen:check there.
 * Returns { ok, evidence, tip }.
 */
export function localMergeGenCheck({ pr, head, headRef, cwd = ROOT, deploy = DEPLOY_BRANCH, run = spawnSync } = {}) {
  const wt = path.join(cwd, "artifacts", "merge-gate", `wt-${pr}`);
  const cleanup = () => { git(["worktree", "remove", "--force", wt], cwd); git(["worktree", "prune"], cwd); fs.rmSync(wt, { recursive: true, force: true }); };
  const fail = (why) => { cleanup(); return { ok: false, evidence: why, tip: "" }; };
  const f1 = git(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${deploy}:refs/remotes/origin/${deploy}`], cwd);
  if (f1.status !== 0) return { ok: false, evidence: `fetch ${deploy} failed: ${(f1.stderr || "").trim().split("\n")[0]}`, tip: "", error: true };
  if (headRef) git(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${headRef}:refs/remotes/origin/${headRef}`], cwd);
  if (git(["cat-file", "-e", `${head}^{commit}`], cwd).status !== 0) {
    return { ok: false, evidence: `head ${head.slice(0, 8)} is not in this clone (fetch its branch${headRef ? " " + headRef : ""})`, tip: "", error: true };
  }
  const tip = git(["rev-parse", `refs/remotes/origin/${deploy}`], cwd).stdout.trim();
  cleanup();
  const add = git(["worktree", "add", "--detach", wt, tip], cwd);
  if (add.status !== 0) return { ok: false, evidence: `worktree add failed: ${(add.stderr || "").trim().split("\n")[0]}`, tip, error: true };
  const m = git(["merge", "--no-commit", "--no-ff", "--quiet", head], wt, { timeout: 300_000 });
  if (m.status !== 0) {
    const conflicted = git(["diff", "--name-only", "--diff-filter=U"], wt).stdout.split("\n").filter(Boolean);
    return fail(conflicted.length ? `conflicts with the current tip ${tip.slice(0, 8)}: ${conflicted.slice(0, 6).join(", ")}${conflicted.length > 6 ? ", …" : ""} — sync-pr.mjs first` : `merge onto ${tip.slice(0, 8)} failed: ${(m.stderr || m.stdout || "").trim().split("\n")[0]}`);
  }
  try { fs.symlinkSync(path.join(cwd, "node_modules"), path.join(wt, "node_modules")); } catch { /* exists */ }
  const gen = run("npm", ["run", "-s", "gen:check"], { cwd: wt, encoding: "utf8", timeout: 600_000, maxBuffer: 16 << 20 });
  if (gen.status !== 0) {
    const first = `${gen.stdout || ""}\n${gen.stderr || ""}`.split("\n").map((l) => l.trim()).filter((l) => l && !/^>|^npm /.test(l)).slice(-3).join(" | ");
    return fail(`gen:check fails on the merge onto ${tip.slice(0, 8)}: ${first || "see output"} — sync-pr.mjs (it runs npm run gen) and push`);
  }
  cleanup();
  return { ok: true, evidence: `merges clean onto ${tip.slice(0, 8)}; gen:check 0`, tip };
}

// ---- CLI -------------------------------------------------------------------

export function verdictLine(v) {
  const rows = Object.entries(v.rows || {}).map(([k, r]) => `${k}=${r.ok ? "ok" : "FAIL"}`).join(" ");
  const bad = Object.entries(v.rows || {}).filter(([, r]) => !r.ok).map(([k, r]) => `${k}: ${r.evidence}`).join("; ");
  return `= merge-gate ${v.state} — ${rows}${bad ? " | " + bad : ""} sha=${v.head || ""} tip=${v.tip || ""}`;
}

const USAGE = `usage: node tools/ci/merge-gate.mjs --pr <n> [--sha <head>] [--skip-local-merge] [--as <host>:<id>] [--json]
  Exit 0 only when the PR is open and ready, ready-gate exits 0, the required CI check is green on the head,
  the body carries no MERGE-HOLD: line, the head merges clean onto the CURRENT deploy tip with gen:check 0,
  and (game PRs) the bus shows no INCIDENT freeze, this session's GAME-SLOT for the PR, and a green Pages run on
  the last game merge. Writes artifacts/merge-gate/<n>.json, which github-mcp-guard.sh requires on merge_pull_request
  with expectedHeadSha pinned to the gated head (docs/plans/2026-10-19-fleet-redesign.md).`;

export function main(argv, { request = api, root = ROOT, env = process.env, now = () => Date.now(), bus = readBus, localMerge = localMergeGenCheck, pages = pagesGreenFor, log = console.log } = {}) {
  exitIfHelp(argv, USAGE);
  const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : null; };
  const pr = Number(opt("--pr"));
  if (!Number.isInteger(pr) || pr < 1) { log("[merge-gate] = merge-gate unknown — --pr <n> is required"); return 3; }
  const asJson = argv.includes("--json");
  const skipLocal = argv.includes("--skip-local-merge");
  const me = whoAmI(env, opt("--as") || "");

  const one = request(`pulls/${pr}`);
  if (one.error) { log(`[merge-gate] = merge-gate unknown — PR #${pr}: ${one.error}`); return 3; }
  const pull = one.json || {};
  const head = String(pull.head?.sha || "").toLowerCase();
  const want = String(opt("--sha") || "").toLowerCase();
  const rows = {};
  rows.open = openVerdict(pull);
  if (want && !(head.startsWith(want) || want.startsWith(head))) rows.open = row(false, `PR head is ${head.slice(0, 8)}, not the --sha ${want.slice(0, 8)} you gated`);
  rows.hold = hasMergeHold(pull.body) ? row(false, "the body carries a MERGE-HOLD: line (the one veto)") : row(true, "no MERGE-HOLD:");

  const resolved = resolveSha({ pr, request });
  if (resolved.error) { log(`[merge-gate] = merge-gate unknown — ${resolved.error}`); return 3; }
  const ready = withMemory(withPlan(evaluate({ sha: head, request }), resolved.body), resolved.files,
    { title: resolved.title || "", body: resolved.body || "", labels: resolved.labels || [], filesError: resolved.filesError || null });
  if (ready.code === 3) { log(`[merge-gate] = merge-gate unknown — ready-gate: ${ready.evidence}`); return 3; }
  rows.ready = row(ready.code === 0, `ready-gate ${ready.state}: ${ready.evidence}`);

  const checks = checkRunsFor(head, request);
  if (checks.error) { log(`[merge-gate] = merge-gate unknown — check-runs: ${checks.error}`); return 3; }
  rows.ci = ciVerdict(checks.list);

  let tip = "";
  if (skipLocal) rows.gen = row(true, "skipped (--skip-local-merge): gen:check on the merge result is NOT proven");
  else {
    const g = localMerge({ pr, head, headRef: pull.head?.ref || "", cwd: root });
    if (g.error) { log(`[merge-gate] = merge-gate unknown — ${g.evidence}`); return 3; }
    rows.gen = row(g.ok, g.evidence);
    tip = g.tip;
  }

  const game = gameFiles(resolved.files || []);
  if (game.length) {
    const b = bus({ cwd: root, last: 200 });
    rows.pacing = pacingVerdict(b.entries, { pr, me, pagesGreen: (sha) => pages(sha, request), now: Math.floor(now() / 1000) });
  } else rows.pacing = row(true, "non-game paths: no slot needed");

  const ok = Object.values(rows).every((r) => r.ok);
  const v = { state: ok ? "passed" : "refused", pr, head, tip, game: game.length, rows, by: me || "" };
  const evidence = Object.entries(rows).filter(([, r]) => !r.ok).map(([k, r]) => `${k}: ${r.evidence}`).join("; ");
  writeReceipt(root, "merge", { pr, head, tip, ok, by: me || "", game: game.length, evidence, rows, at: new Date(now()).toISOString() });
  if (asJson) log(JSON.stringify(v, null, 2));
  else {
    log(`[merge-gate] ${verdictLine(v)}`);
    if (ok) log(`[merge-gate] merge now: merge_pull_request pullNumber=${pr} merge_method=merge expectedHeadSha=${head}; then \`git log -1 --format=%p <merge sha>\` shows two parents and \`fleet-bus.mjs send DONE\`.`);
  }
  return ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
