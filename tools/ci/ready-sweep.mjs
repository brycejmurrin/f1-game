#!/usr/bin/env node
// ready-sweep.mjs — the stale-`ready` sweep: which open `ready` issues still cite code that exists, and whether the
// backlog is larger than what a week lands. READ-ONLY: GETs only, no label, comment or close.
// @doc Stale-`ready` sweep (reads only): each ready issue's `file:line` cites against the tree, and the "ready over cap" row.
// @section runner
// @skill dispatcher
//
// Why (issue #5212, row D16 of docs/notes/ORCHESTRATION-REVIEW-2026-11-09.md): 115 of 150 open issues carried `ready`
// with a median age of 5.1 days, and only 24 were real unclaimed work. A `ready` issue is a claim about the tree on the
// day it was filed; this tool re-reads that claim so a person or agent `finding-verifier` judges a short list, not 122.
//
// What it can and cannot tell. A cite is a repository path, with an optional `:line` or `:line-line`, whose first segment
// exists at the repository root (so a URL or `and/or.x` is not one). Only a cite WITH a line number is a claim about
// existing code; a bare path that is absent is usually a file the issue proposes to add, so it is listed and never judged.
//   stale    every line-cite points at a missing file or past its end: nothing the issue cites is where it said
//   drifted  some do: hand the issue's rows to agent `finding-verifier` (`--issue <n>` prints them in its input format)
//   ok       every line-cite still lands inside its file (the text there may still have changed: that is the verifier's)
//   none     no line-cite to check
// A verdict here is evidence for a decision, never the decision: this tool closes nothing. Closing a `stale` issue is
// the caller's write, with the row quoted in the closing comment.
//
// The cap row is one line, the same on every surface: launchable `ready` units against PRs merged into the repository in
// the last `--days` (7). A unit is what one worker launch would take, by dispatch.mjs rule 1: `ready` without `claimed`,
// `blocked`, `needs-decision` or `epic`, not a batch member, and with no open PR that closes it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api as githubApi, REPO } from "./github-api.mjs";
import { getAll, labelsOf, batchMembers, closingIssues } from "./dispatch.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CITE_RE = /(?<![\w/.@-])((?:\.?[A-Za-z_][\w.-]*\/)+[\w.-]+\.[A-Za-z][A-Za-z0-9]{0,4}|[A-Za-z_][\w-]*\.(?:html|js|mjs|cjs|json|md|css))(?::(\d{1,6})(?:[-–](\d{1,6}))?)?(?![\w/])/g;
const has = (x, name) => labelsOf(x).includes(name);

/** The tree a cite is checked against: `exists(rel)` and `lines(rel)` (line count, or -1 when unreadable). */
export const diskTree = (root = ROOT) => ({
  exists: (rel) => fs.existsSync(path.join(root, rel)),
  lines: (rel) => { try { return fs.readFileSync(path.join(root, rel), "utf8").split("\n").length; } catch { return -1; } },
});

/** Every distinct `path[:line[-line]]` cite in an issue body whose first segment exists at the root. URLs are dropped
 *  first (a github.com link is not a cite). Order of first appearance. Pure given `tree`. */
export function citesOf(body, tree) {
  const text = String(body || "").replace(/<!--[\s\S]*?-->/g, "").replace(/https?:\/\/\S+/g, " ");
  const seen = new Map();
  for (const m of text.matchAll(CITE_RE)) {
    const file = m[1].replace(/^\.\//, "");
    if (!tree.exists(file.split("/")[0])) continue;
    const line = m[2] ? Number(m[2]) : null;
    const key = `${file}:${line ?? ""}`;
    if (!seen.has(key)) seen.set(key, { file, line });
  }
  return [...seen.values()];
}

/** One cite's state on the tree: `gone` (no such file), `past-end` (the line is beyond the file), `ok`, or `absent`
 *  (a bare path that is not there: listed, never judged). Pure given `tree`. */
export function citeState(cite, tree) {
  if (!tree.exists(cite.file)) return cite.line == null ? "absent" : "gone";
  if (cite.line == null) return "ok";
  const n = tree.lines(cite.file);
  return n >= 0 && cite.line > n ? "past-end" : "ok";
}

/** An issue's verdict (header of this file): { number, title, verdict, cites: [{ file, line, state }], bad, judged }. Pure. */
export function sweepIssue(issue, tree) {
  const cites = citesOf(issue.body, tree).map((c) => ({ ...c, state: citeState(c, tree) }));
  const judged = cites.filter((c) => c.line != null);
  const bad = judged.filter((c) => c.state !== "ok");
  const verdict = !judged.length ? "none" : bad.length === judged.length ? "stale" : bad.length ? "drifted" : "ok";
  return { number: issue.number, title: issue.title, verdict, cites, bad: bad.length, judged: judged.length };
}

/** The `ready` issues one worker launch each would take (dispatch.mjs rule 1, without its per-run caps). `issues` and
 *  `prs` are the OPEN ones. Pure. */
export function launchableReady(issues, prs, repo = REPO) {
  const member = new Set();
  for (const b of issues) if (has(b, "batch")) for (const n of batchMembers(b.body)) member.add(n);
  const closed = new Set(prs.flatMap((p) => closingIssues(p.body, repo)));
  const taken = (i) => closed.has(Number(i.number)) || (has(i, "batch") && batchMembers(i.body).some((n) => closed.has(n)));
  return issues.filter((i) => !i.pull_request && has(i, "ready") && !["claimed", "blocked", "needs-decision", "epic", "batched"].some((l) => has(i, l))
    && !member.has(Number(i.number)) && !taken(i));
}

/** The one cap line. `landed` is the count of PRs merged in the last `days`. Pure. */
export function readyCapRow({ ready, launchable, landed, days = 7 }) {
  return `ready ${launchable > landed ? "over" : "within"} cap: ${launchable} launchable of ${ready} ready vs ${landed} PRs landed in ${days} d`;
}

/** The rows agent `finding-verifier` takes (`file:line — claim`), for one swept issue: its line-cites, bad ones first. Pure. */
export function verifierRows(swept) {
  const rank = { gone: 0, "past-end": 1, ok: 2 };
  return swept.cites.filter((c) => c.line != null).sort((a, b) => rank[a.state] - rank[b.state])
    .map((c) => `${c.file}:${c.line} — issue #${swept.number} cites this line (${c.state === "ok" ? "still inside the file" : c.state}): ${String(swept.title).slice(0, 90)}`);
}

/** The whole sweep over open issues and PRs. Pure given `tree`. */
export function sweep({ issues, prs, landed, days = 7 }, tree) {
  const ready = issues.filter((i) => !i.pull_request && has(i, "ready"));
  const rows = ready.map((i) => sweepIssue(i, tree));
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  const launchable = launchableReady(issues, prs).length;
  return { rows, counts: { ready: ready.length, stale: count("stale"), drifted: count("drifted"), ok: count("ok"), none: count("none"), launchable, landed },
    cap: readyCapRow({ ready: ready.length, launchable, landed, days }) };
}

export function render(result) {
  const out = [];
  const badOf = (r) => r.cites.filter((c) => c.line != null && c.state !== "ok").map((c) => `${c.file}:${c.line} ${c.state}`);
  for (const v of ["stale", "drifted"]) for (const r of result.rows.filter((x) => x.verdict === v))
    out.push(`${v.toUpperCase()} #${r.number} ${r.bad}/${r.judged} line-cites: ${badOf(r).slice(0, 4).join("; ")}${r.bad > 4 ? "; …" : ""}  — ${String(r.title).slice(0, 70)}`);
  const c = result.counts;
  out.push(result.cap);
  out.push(`= ready-sweep: ${c.ready} ready, ${c.stale} stale, ${c.drifted} drifted, ${c.ok} ok, ${c.none} with no line-cite`);
  return out;
}

// ---- I/O (GETs only) -------------------------------------------------------------------------------------------
const slim = (x) => ({ number: x.number, title: x.title, body: x.body || "", labels: labelsOf(x), pull_request: x.pull_request || null });
export function readSweepState({ api = githubApi, now = Date.now(), days = 7, repo = REPO } = {}) {
  const issues = getAll(api, "issues?state=open").filter((i) => !i.pull_request).map(slim);
  const prs = getAll(api, "pulls?state=open").map(slim);
  const since = new Date(now - days * 864e5).toISOString().slice(0, 10);
  const r = api(`https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${repo} is:pr is:merged merged:>=${since}`)}&per_page=1`);
  if (r.error) throw new Error(`search merged PRs: ${r.error}`);
  return { issues, prs, landed: Number(r.json?.total_count) || 0, days };
}

const USAGE = `usage: node tools/ci/ready-sweep.mjs [--json] [--days <n>] [--now <iso>]
       node tools/ci/ready-sweep.mjs --issue <n>
  (no flag)    reads GitHub (GETs only) and the checked-out tree; prints one STALE / DRIFTED line per issue whose
               file:line cites no longer land, the "ready over|within cap" row, and a "= ready-sweep:" verdict line
  --issue <n>  prints that issue's line-cites as agent finding-verifier input rows (file:line — claim), bad ones first
  --days <n>   the landing window for the cap row (default 7)
  Writes nothing: no label, comment or close. Run it on the deploy tip; a stale checkout judges the wrong tree.
  exit 0 = swept; 1 = usage; 3 = GitHub could not be read.`;

export function main(argv, { api = githubApi, log = console.log, now = Date.now, tree = diskTree() } = {}) {
  exitIfHelp(argv, USAGE);
  const val = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const days = val("--days") === undefined ? 7 : Number(val("--days"));
  const when = val("--now") ? Date.parse(val("--now")) : now();
  const one = argv.includes("--issue") ? Number(val("--issue")) : null;
  if (!(days > 0) || !Number.isFinite(when) || (one !== null && !(one > 0))) { log(USAGE); return 1; }
  if (one !== null) {
    const r = api(`issues/${one}`);
    if (r.error) { log(`ready-sweep: issues/${one}: ${r.error}`); return 3; }
    const swept = sweepIssue(slim(r.json), tree);
    for (const line of verifierRows(swept)) log(line);
    log(`= ready-sweep: #${one} ${swept.verdict}, ${swept.bad}/${swept.judged} line-cites do not land`);
    return 0;
  }
  let state;
  try { state = readSweepState({ api, now: when, days }); } catch (e) { log(`ready-sweep: ${e.message}`); return 3; }
  const result = sweep(state, tree);
  if (argv.includes("--json")) log(JSON.stringify(result, null, 2));
  else for (const line of render(result)) log(line);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
