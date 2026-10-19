#!/usr/bin/env node
/**
 * @doc One fleet-watch fast tick: board + sync + ship/Pages CI, diffed against the saved state; prints only what changed.
 * @section runner
 * @skill agent-fleet
 *
 *   node tools/ci/fleet-tick.mjs [--sessions <saved list_sessions page>] [--state artifacts/fleet-watch/state.json] [--dry]
 *
 * Runs `pr-board.mjs --json` (which already runs needs-sync.mjs for every SYNC/FIX row and embeds the verdict as
 * `sync`), `ci-watch.mjs --once` for the deploy tip and `--pages --once`, optionally `fleet-flags` on a saved
 * `list_sessions` page. Compares with the state file, writes the new state (unless --dry) and prints ONLY changed rows
 * as one-line JSON (cap 40) plus a `= tick …` summary line; no change is one line.
 * State: { tick, prs: {<n>: {state,sha,ci,mergeable,suggest,hold,gate,plan,fleet,sync}}, ship: {sha,line},
 * pages: {line}, sessions: {<id>: flags[]} }. Pure parts (`diffState`, `rowOf`) are unit-tested.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assess } from "./fleet-flags.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MAX_ROWS = 40;
const DEPLOY = "claude/f1-game-project-26h3ng";

/** pr-board row -> the compact comparable record kept in state. */
export function rowOf(r) {
  const plan = r.plan && r.plan.state !== "none" ? `${r.plan.items - (r.plan.open || []).length}/${r.plan.items}` : null;
  return {
    state: r.draft ? "draft" : "ready", sha: r.sha || "", ci: r.ci, mergeable: r.mergeableState || null,
    suggest: r.suggest, hold: !!r.hold, gate: r.gate || null, plan,
    fleet: r.fleet ? `${r.fleet.state}${r.fleet.reason ? ": " + r.fleet.reason : ""}` : null,
    sync: r.sync && r.sync.verdict ? r.sync.verdict : null,
  };
}

/** Changed keys between two flat records -> { key: [old, new] }. */
const delta = (a = {}, b = {}) => {
  const d = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) d[k] = [a[k] ?? null, b[k] ?? null];
  return d;
};

/** Diff two states. Pure. Returns { rows: [...], first } where first = no previous state (everything is "new"). */
export function diffState(prev, cur) {
  const rows = [], first = !prev;
  prev = prev || { prs: {}, sessions: {} };
  for (const n of Object.keys(cur.prs)) {
    if (!prev.prs[n]) rows.push({ k: "pr", pr: +n, ev: "new", ...cur.prs[n] });
    else {
      const d = delta(prev.prs[n], cur.prs[n]);
      if (Object.keys(d).length) rows.push({ k: "pr", pr: +n, ev: "changed", ch: d });
    }
  }
  for (const n of Object.keys(prev.prs)) if (!cur.prs[n]) rows.push({ k: "pr", pr: +n, ev: "gone" });
  for (const key of ["ship", "pages"]) {
    const d = delta(prev[key] || {}, cur[key] || {});
    if (Object.keys(d).length) rows.push({ k: key, ch: d });
  }
  for (const [id, flags] of Object.entries(cur.sessions || {})) {
    const old = (prev.sessions || {})[id] || [];
    const added = flags.filter((f) => !old.includes(f));
    if (added.length) rows.push({ k: "session", id, flag: added });
  }
  return { rows, first };
}

/** The printed lines: ≤ MAX_ROWS rows + one summary. */
export function render({ rows, first }, tick) {
  const shown = rows.slice(0, MAX_ROWS).map((r) => JSON.stringify(r));
  const more = rows.length - shown.length;
  const sum = rows.length === 0 ? `= tick ${tick} no change` : `= tick ${tick} ${rows.length} changed${more > 0 ? ` (${more} more not shown)` : ""}${first ? " (first tick: baseline)" : ""}`;
  return [...shown, sum];
}

const run = (args) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
};
const lastLine = (out, re) => (out.split("\n").filter((l) => re.test(l)).pop() || "").trim();

export function collect({ sessionsFile } = {}) {
  const cur = { prs: {}, ship: {}, pages: {}, sessions: {} };
  const b = run(["tools/ci/pr-board.mjs", "--json"]);
  try { for (const r of JSON.parse(b.out).rows) cur.prs[r.number] = rowOf(r); } catch { cur.boardError = lastLine(b.out, /./) || "pr-board produced no JSON"; }
  const tip = spawnSync("git", ["rev-parse", `origin/${DEPLOY}`], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const ci = run(["tools/ci/ci-watch.mjs", "--sha", tip, "--once"]);
  cur.ship = { sha: tip.slice(0, 7), line: lastLine(ci.out, /^= ci /).replace(/\s+sha=\S+.*$/, "") };
  const pg = run(["tools/ci/ci-watch.mjs", "--sha", tip, "--pages", "--once"]);
  cur.pages = { line: lastLine(pg.out, /^= (pages|ci) /).replace(/\s+sha=\S+.*$/, "") };
  if (sessionsFile) {
    const data = JSON.parse(fs.readFileSync(sessionsFile, "utf8"));
    for (const s of Array.isArray(data) ? data : data.data || data.sessions || [data]) {
      const a = assess(s);
      if (a.flags.length) cur.sessions[a.id] = a.flags.map((f) => f.replace(/\d+ min/, "N min"));
    }
  }
  return cur;
}

function main(argv) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const stateFile = path.resolve(ROOT, val("--state") || "artifacts/fleet-watch/state.json");
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { /* first tick */ }
  const cur = collect({ sessionsFile: val("--sessions") });
  if (cur.boardError && prev) { cur.prs = prev.prs; }       // a failed board read is not "every PR gone"
  cur.tick = ((prev && prev.tick) || 0) + 1;
  const err = cur.boardError; delete cur.boardError;
  const d = diffState(prev, cur);
  if (err) d.rows.unshift({ k: "error", msg: err });
  console.log(render(d, cur.tick).join("\n"));
  if (!argv.includes("--dry")) { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(cur, null, 1)); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
