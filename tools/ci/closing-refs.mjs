#!/usr/bin/env node
// closing-refs.mjs — find GitHub closing keywords in a PR body that would close another OPEN pull request on merge.
// @doc Lists closing keywords (fix/close/resolve #N) in a PR body whose target is an open PR; ship-pr refuses on any (#5929).
// @skill ship
//
// GitHub closes the referenced issue OR PULL REQUEST when a PR whose body says `<keyword> #N` merges into the default
// branch. Keywords (docs "Linking a pull request to an issue", read 2026-11-20): close, closes, closed, fix, fixes,
// fixed, resolve, resolves, resolved; "The keywords can be followed by colons or in uppercase" (`Closes: #10`,
// `CLOSES #10`). Targets: `#N`, `owner/repo#N`, or the issue/PR URL. Only the ref right after the keyword closes
// (`Fixes #1, #2` closes #1 only). #5750's "#5599 (fix #5800)" and #5904's "fix #5800 in flight" closed open PR #5800
// twice on 2026-11-19. Safe wording: "fixed by #5800", "see #5800", "#5800 (in flight)".
// This module is NOT in merge-gate's import closure (ready-gate is PROTECTED): ship-pr runs it before ready-gate.
//
//   node tools/ci/closing-refs.mjs --pr <n>        # exit 1 when the body would close an open PR
//   node tools/ci/closing-refs.mjs --open           # scan every open PR's body (read-only report)
//
// Exit: 0 clean, 1 an offending ref, 3 no token / API error.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, REPO } from "./github-api.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const USAGE = "usage: node tools/ci/closing-refs.mjs --pr <n> | --open\n  Lists closing keywords in a PR body that target an OPEN pull request (they would close it on merge).";

// A keyword not glued to a preceding letter/digit/underscore, then a colon and/or whitespace, then the target.
const KEYWORD = String.raw`(?<![A-Za-z0-9_])(close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?:\s*:\s*|\s+)`;
const TARGET = String.raw`(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#(\d+)|https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/(?:issues|pull)\/(\d+))(?![A-Za-z0-9_])`;
const RE = new RegExp(KEYWORD + TARGET, "gi");

/** Every closing-keyword ref in `body` that targets `repo`: [{ lineNo, line, keyword, number, text }]. Pure. */
export function closingRefs(body, repo = REPO) {
  const want = String(repo).toLowerCase(), out = [];
  String(body || "").split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(RE)) {
      const target = (m[2] || m[4] || "").toLowerCase();
      if (target && target !== want) continue;   // another repository's issue: not ours to judge
      out.push({ lineNo: i + 1, line: line.trim(), keyword: m[1], number: Number(m[3] || m[5]), text: m[0] });
    }
  });
  return out;
}

/** The refs that would close an OPEN pull request other than `self`. `lookup(n)` → { pr: bool, open: bool } | { error }. */
export function offendingRefs(body, { self = 0, repo = REPO, lookup }) {
  const seen = new Map(), bad = [];
  for (const r of closingRefs(body, repo)) {
    if (r.number === Number(self)) continue;
    if (!seen.has(r.number)) seen.set(r.number, lookup(r.number));
    const t = seen.get(r.number);
    if (t?.error) return { error: `#${r.number}: ${t.error}` };
    if (t.pr && t.open) bad.push(r);
  }
  return { bad };
}

/** One `issues/<n>` read: the issues endpoint answers for PRs too (a `pull_request` key). */
export const ghLookup = (n) => {
  const r = api(`issues/${n}`);
  if (r.error) return r.error === "HTTP 404" ? { pr: false, open: false } : { error: r.error };
  return { pr: !!r.json?.pull_request, open: r.json?.state === "open" };
};

/** Report lines for one PR's offenders. Pure. */
export const describe = (pr, bad) => bad.map((r) =>
  `#${pr} line ${r.lineNo}: "${r.text.trim()}" would CLOSE open PR #${r.number} on merge — reword (e.g. "fixed by #${r.number}", "see #${r.number}"); a colon does not defuse it\n    > ${r.line}`);

/** ship-pr's check: { ok, lines } or { error }. */
export function checkPr(pr, { getPr = (n) => api(`pulls/${n}`), lookup = ghLookup } = {}) {
  const r = getPr(pr);
  if (r.error) return { error: `pulls/${pr}: ${r.error}` };
  const o = offendingRefs(r.json?.body || "", { self: pr, lookup });
  if (o.error) return o;
  return { ok: o.bad.length === 0, lines: describe(pr, o.bad) };
}

export function main(argv, { log = console.log, getPr, lookup, listOpen = () => api("pulls?state=open&per_page=100") } = {}) {
  exitIfHelp(argv, USAGE);
  if (argv.includes("--open")) {
    const l = listOpen();
    if (l.error) { log(`= closing-refs error: ${l.error}`); return 3; }
    const openPrs = new Set((l.json || []).map((p) => p.number));
    const look = lookup || ((n) => openPrs.has(n) ? { pr: true, open: true } : ghLookup(n));
    let hits = 0;
    for (const p of l.json || []) {
      const o = offendingRefs(p.body || "", { self: p.number, lookup: look });
      if (o.error) { log(`= closing-refs error: ${o.error}`); return 3; }
      hits += o.bad.length;
      describe(p.number, o.bad).forEach((x) => log(x));
    }
    log(`= closing-refs ${hits ? "found" : "clean"}: ${hits} ref(s) across ${(l.json || []).length} open PR(s)`);
    return hits ? 1 : 0;
  }
  const i = argv.indexOf("--pr"), pr = i >= 0 ? argv[i + 1] : "";
  if (!/^\d{1,7}$/.test(pr || "")) { log(USAGE); return 1; }
  const c = checkPr(Number(pr), { ...(getPr && { getPr }), ...(lookup && { lookup }) });
  if (c.error) { log(`= closing-refs error: ${c.error}`); return 3; }
  c.lines.forEach((x) => log(x));
  log(`= closing-refs ${c.ok ? "clean" : "refused"}: #${pr}`);
  return c.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
