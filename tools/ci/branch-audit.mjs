#!/usr/bin/env node
// branch-audit.mjs — is a branch's code already in the deploy branch? One verdict per remote branch, with the evidence.
// @doc Verdicts for branches with no PR and no commit in 48 h: ancestry, merge-tree, line presence, CI (--all: every branch).
// Full description: Classifies every remote branch against the deploy branch: ancestry, a merge-tree dry merge (absorbed = merging changes nothing), the share of its added lines already present in deploy (same file and anywhere, for code that moved), the PR that carried it and the last CI run on its head. prune-branches.mjs consumes the verdicts; --report writes the markdown table.
// @skill check-changes
//
// WHY. prune-branches.mjs deleted the 220 branches that were provably merged
// (2026-10-01). The ~290 left needed a person to answer "is this work in the
// game or not?", and ancestry alone cannot: squash merges, re-applied commits
// and later refactors put the same code into deploy under new commits and new
// files, so a branch can be "not an ancestor" yet have nothing left to give.
//
// RUN IT ON FULL HISTORY. Agent containers clone shallow (~50 commits), and a
// shallow clone's cut-off commits look like roots: on 2026-10-01 that read as
// "the deploy branch was restarted on 2026-09-29, 116 branches share no history
// with it". It was not — on the workflow's fetch-depth 0 checkout every branch
// but one shares history with deploy. A "no-history" verdict or a size figure
// from a shallow clone is an artefact (`git rev-parse --is-shallow-repository`).
//
// THE EVIDENCE, cheapest and most certain first:
//   ancestor   the tip is in the deploy history — merged, nothing to lose.
//   pr-head    the tip IS the head sha of a merged PR (a squash merge).
//   absorbed   `git merge-tree --write-tree <deploy> <branch>` succeeds and the
//              result is deploy's own tree: merging it would change NOTHING.
//              Zero-loss by construction, so prune-branches deletes these too.
//   presence   for the branch's own diff (from its merge base with deploy),
//              the share of ADDED lines (trimmed, >= MIN_LINE chars) that exist in
//              deploy — in the same file, and anywhere (code moves in splits).
//              Evidence for a person, never a deletion rule on its own.
//   PR         the newest PR whose head is this branch: open / merged / closed
//              unmerged, its number and title.
//   CI         the newest workflow run on the branch's head sha.
// Verdicts (VERDICTS below) are what the report sorts by and what
// prune-branches --also opts into.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

// THE SURVEY SET (2026-10-02, the user's rule): only branches that have NEVER
// had a pull request (open, closed or merged) and whose newest commit is at
// least SURVEY_QUIET_HOURS old — which also makes the whole branch at least
// that old. A branch with a PR is the PR's business (its merge state decides,
// and merged heads are auto-deleted since 2026-10-02); a branch with a commit
// in the last two days may be someone's work in progress. claude/claims/*
// markers are prune-branches.mjs's age rule, never surveyed. --all widens it.
// WIDENED 2026-10-03: a branch whose newest PR was CLOSED UNMERGED at least
// SURVEY_QUIET_HOURS ago is surveyed too — nobody reopened it, so nothing else
// would ever decide it (its verdict is usually pr-closed). The claims board
// (who-is-on-it.mjs) is coordination state, never surveyed.
export const SURVEY_QUIET_HOURS = 48;
export const NEVER_SURVEYED = /^claude\/claims(\/|-board$)/;
export function inSurvey(b, { prs = new Map(), now = Math.floor(Date.now() / 1000), quietHours = SURVEY_QUIET_HOURS } = {}) {
  if (NEVER_SURVEYED.test(b.name)) return false;
  const pr = prs.get(b.name);
  if (pr) {
    const closedAt = Date.parse(pr.at) / 1000;
    if (pr.state !== "closed" || !Number.isFinite(closedAt) || now - closedAt < quietHours * 3600) return false;
  }
  return Number.isFinite(b.time) && now - b.time >= quietHours * 3600;
}

export const MIN_LINE = 6;              // shorter trimmed lines ("});", "}") match anything
export const SUPERSEDED_PCT = 95;       // >= this share of added lines present anywhere in deploy
export const VERDICTS = {
  active: "open PR, or too recent to judge — keep",
  merged: "in the deploy history, or exactly a merged PR's head — safe to delete",
  absorbed: "merging it would change nothing — safe to delete",
  superseded: `>= ${SUPERSEDED_PCT}% of its added lines are already in deploy — review, likely safe`,
  "post-merge": "its PR merged, then more commits were pushed — review what came after",
  "pr-closed": "its PR was closed without merging — review, likely abandoned",
  unmerged: "work that is not in deploy — keep",
  "no-history": "shares no history with deploy (on a full clone) — review by hand",
};

/** Share (0-100) of `added` lines found in `sameFile` / `anyFile` sets. Empty diff = 100. */
export function presence(added, sameFileOf, anyFile) {
  let tot = 0, same = 0, any = 0;
  for (const { file, text } of added) {
    tot++;
    const s = sameFileOf(file);
    if (s && s.has(text)) same++;
    if (anyFile.has(text)) any++;
  }
  const pct = (n) => (tot ? Math.round((100 * n) / tot) : 100);
  return { lines: tot, samePct: pct(same), anyPct: pct(any) };
}

/** `git diff --unified=0` text -> [{file, text}] for added lines worth matching. */
export function addedLines(diff, minLen = MIN_LINE) {
  const out = [];
  let file = null;
  for (const l of String(diff).split("\n")) {
    if (l.startsWith("+++ ")) { file = l === "+++ /dev/null" ? null : l.replace(/^\+\+\+ b\//, ""); continue; }
    if (!file || !l.startsWith("+")) continue;
    const text = l.slice(1).trim();
    if (text.length >= minLen) out.push({ file, text });
  }
  return out;
}

/** gh pr list JSON -> Map(branch -> newest PR {number, state, headSha, title, at}). */
export function indexPrs(list) {
  const m = new Map();
  for (const p of list || []) {
    const name = p.headRefName;
    if (!name) continue;
    const state = p.state === "OPEN" ? "open" : p.mergedAt ? "merged" : "closed";
    const row = { number: p.number, state, headSha: p.headRefOid || null, title: p.title || "", at: p.mergedAt || p.closedAt || p.createdAt || "" };
    const prev = m.get(name);
    // An open PR always wins; otherwise the highest number is the newest.
    if (!prev || (row.state === "open" && prev.state !== "open") || (prev.state !== "open" && row.number > prev.number)) m.set(name, row);
  }
  return m;
}

/** gh run list JSON -> Map(headSha -> newest run {workflow, conclusion, at}). */
export function indexRuns(list) {
  const m = new Map();
  for (const r of list || []) {
    if (!r.headSha) continue;
    const row = { workflow: r.workflowName || "", conclusion: r.conclusion || r.status || "", at: r.createdAt || "" };
    const prev = m.get(r.headSha);
    if (!prev || row.at > prev.at) m.set(r.headSha, row);
  }
  return m;
}

/** The verdict for one audited branch. Pure; order = precedence. */
export function verdictFor(b, { minAgeDays = 1 } = {}) {
  const pr = b.pr;
  if (pr && pr.state === "open") return "active";
  if (b.ancestor || (pr && pr.state === "merged" && pr.headSha === b.sha)) return "merged";
  if (!(b.ageDays >= minAgeDays)) return "active";
  if (b.absorbed) return "absorbed";
  if (b.noHistory) return "no-history";
  if (b.anyPct >= SUPERSEDED_PCT && b.lines > 0) return "superseded";
  if (pr && pr.state === "merged") return "post-merge";
  if (pr && pr.state === "closed") return "pr-closed";
  return "unmerged";
}

const git = (args, opts = {}) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 512 << 20, stdio: ["pipe", "pipe", "ignore"], ...opts });
const tryGit = (args) => { try { return git(args).trim(); } catch (_) { return null; } };

/** Every text line (trimmed, >= MIN_LINE) of a tree, per file and in one set — one cat-file process. */
export function treeLines(ref) {
  const files = git(["ls-tree", "-r", ref]).split("\n").map((l) => {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(l);
    return m && /\.(m?js|cjs|ts|css|html|md|json|ya?ml|sh|py|txt)$/.test(m[2]) ? { sha: m[1], path: m[2] } : null;
  }).filter(Boolean);
  const res = spawnSync("git", ["cat-file", "--batch"], { input: files.map((f) => f.sha).join("\n") + "\n", maxBuffer: 1 << 30 });
  const buf = res.stdout, perFile = new Map(), all = new Set();
  let off = 0;
  for (const f of files) {
    const nl = buf.indexOf(10, off);
    const size = Number(buf.toString("utf8", off, nl).split(" ")[2]) || 0;
    const body = buf.toString("utf8", nl + 1, nl + 1 + size);
    off = nl + 1 + size + 1;
    const set = new Set();
    for (const l of body.split("\n")) { const t = l.trim(); if (t.length >= MIN_LINE) { set.add(t); all.add(t); } }
    perFile.set(f.path, set);
  }
  return { perFile, all };
}

/** Audit `branches` [{name, sha, time}] against `base`. Git-heavy; the verdict itself is verdictFor. */
export function audit(branches, { base, prs = new Map(), runs = new Map(), now = Math.floor(Date.now() / 1000), minAgeDays = 1, skip = () => false,
  survey = null }) {
  const baseRef = "refs/remotes/origin/" + base;
  const baseTree = git(["rev-parse", baseRef + "^{tree}"]).trim();
  let lines = null;   // built on first need: reading the whole tree is the slow part
  const rows = [];
  for (const b of branches) {
    if (b.name === base || skip(b.name)) continue;
    if (survey && !survey(b)) continue;
    const ref = "refs/remotes/origin/" + b.name;
    const row = { name: b.name, sha: b.sha, ageDays: Number.isFinite(b.time) ? +((now - b.time) / 86400).toFixed(1) : NaN,
      pr: prs.get(b.name) || null, ci: runs.get(b.sha) || null, ancestor: false, absorbed: false, noHistory: false,
      from: null, ahead: 0, lines: 0, samePct: null, anyPct: null };
    row.ancestor = tryGit(["merge-base", "--is-ancestor", b.sha, baseRef]) !== null;
    if (!row.ancestor) {
      const mt = spawnSync("git", ["merge-tree", "--write-tree", baseRef, ref], { encoding: "utf8" });
      row.absorbed = mt.status === 0 && mt.stdout.split("\n")[0].trim() === baseTree;
      const mb = tryGit(["merge-base", baseRef, ref]);
      if (mb) {
        row.from = base;
        row.ahead = Number(tryGit(["rev-list", "--count", `${mb}..${ref}`])) || 0;
        if (!row.absorbed) {
          lines = lines || treeLines(baseRef);
          const p = presence(addedLines(git(["diff", "--unified=0", "--no-renames", mb, ref])), (f) => lines.perFile.get(f), lines.all);
          Object.assign(row, { lines: p.lines, samePct: p.samePct, anyPct: p.anyPct });
        }
      }
      row.noHistory = !row.from;
    }
    row.verdict = verdictFor(row, { minAgeDays });
    rows.push(row);
  }
  return rows;
}

const ORDER = Object.keys(VERDICTS);
/** Markdown report: a tally, then one table per verdict. */
export function renderMarkdown(rows, base, { scope = "" } = {}) {
  const by = new Map(ORDER.map((v) => [v, []]));
  for (const r of rows) by.get(r.verdict).push(r);
  const out = [`### Branch audit vs \`${base}\``, "", ...(scope ? [scope, ""] : []), "| verdict | branches | meaning |", "|---|---|---|"];
  for (const v of ORDER) if (by.get(v).length) out.push(`| **${v}** | ${by.get(v).length} | ${VERDICTS[v]} |`);
  for (const v of ORDER) {
    const list = by.get(v);
    if (!list.length) continue;
    list.sort((a, b) => (b.anyPct ?? 101) - (a.anyPct ?? 101) || a.name.localeCompare(b.name));
    out.push("", `#### ${v} (${list.length})`, "", "| branch | age d | ahead | in deploy (same file / anywhere) | PR | last CI |", "|---|---|---|---|---|---|");
    for (const r of list) {
      const pres = r.ancestor ? "ancestor" : r.absorbed ? "absorbed" : r.anyPct == null ? "—" : `${r.samePct}% / ${r.anyPct}% of ${r.lines}`;
      const pr = r.pr ? `#${r.pr.number} ${r.pr.state}` : "—";
      const ci = r.ci ? `${r.ci.workflow}: ${r.ci.conclusion}` : "—";
      out.push(`| \`${r.name}\` | ${Number.isFinite(r.ageDays) ? r.ageDays : "?"} | ${r.ahead} | ${pres} | ${pr} | ${ci} |`);
    }
  }
  return out.join("\n") + "\n";
}

/** `git for-each-ref` lines (refname\tsha\tunix time) of refs/remotes/origin -> branches; drops origin/HEAD. */
export function parseRefs(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const [ref, sha, time] = line.split("\t");
    if (!ref || !sha) continue;
    const name = ref.replace(/^refs\/remotes\/origin\//, "");
    if (name === "HEAD" || name === ref) continue;
    out.push({ name, sha, time: Number(time) });
  }
  return out;
}

export const surveyScope = (h) => `Surveyed: branches that never had a pull request, or whose last one closed unmerged ${h}+ hours ago, and have had no commit for ${h}+ hours.`;

export function readJson(file) { return file ? JSON.parse(fs.readFileSync(file, "utf8")) : []; }

export function main(argv = process.argv.slice(2)) {
  const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
  const base = arg("--base", "claude/f1-game-project-26h3ng");
  const branches = parseRefs(git(["for-each-ref", "--format=%(refname)\t%(objectname)\t%(committerdate:unix)", "refs/remotes/origin"]));
  const prs = indexPrs(readJson(arg("--prs", null)));
  const all = argv.includes("--all");
  if (!all && !arg("--prs", null)) { console.error("branch-audit: the survey needs --prs (an unknown PR set would survey every branch) — or pass --all"); return 2; }
  const quietHours = Number(arg("--quiet-hours", String(SURVEY_QUIET_HOURS)));
  const rows = audit(branches, { base, prs, runs: indexRuns(readJson(arg("--runs", null))),
    minAgeDays: Number(arg("--min-age-days", "1")), skip: (n) => NEVER_SURVEYED.test(n),
    survey: all ? null : (b) => inSurvey(b, { prs, quietHours }) });
  const md = renderMarkdown(rows, base, { scope: all ? "" : surveyScope(quietHours) });
  if (arg("--report", null)) fs.writeFileSync(arg("--report"), md);
  if (arg("--json", null)) fs.writeFileSync(arg("--json"), JSON.stringify(rows, null, 1));
  if (!arg("--report", null)) process.stdout.write(md);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("branch-audit.mjs")) process.exitCode = main();
