#!/usr/bin/env node
// fleet-queue.mjs — the orchestrator's queue as one committed file, so a tick or a successor reads state instead of remembering it.
// @doc Committed fleet queue (PR, head, state, owner, next): list/set/rm/check/reassign for ticks and hand-offs.
// @section runner
// @skill agent-fleet
//
// Why (the Fleet A transcript audit of 2026-10-26, PR #3770, findings 6 and 9): a hand-off lost the queue (OrchA 33 found
// 16 unowned PRs only after Bryce asked), and a timer prompt carried stale state ("merges paused", a superseded head).
// A tick prompt now says "read the queue file and the bus" and carries no state; a hand-off carries the file. The file
// is plain JSON with one row per PR, written by the orchestrator and committed on its state branch (never on the deploy
// branch); a row is a hint to look at the PR, never authority (AGENTS.md §Concurrent PRs).
//
//   node tools/ci/fleet-queue.mjs list [--json] [--file fleet/queue.json]
//   node tools/ci/fleet-queue.mjs set <PR> [--head <sha>] [--state <state>] [--owner <host:id>] [--next "<text>"]   # upsert
//   node tools/ci/fleet-queue.mjs rm <PR>
//   node tools/ci/fleet-queue.mjs check           # the per-tick ownership check: exit 1 when a live row has no owner or a bad state
//   node tools/ci/fleet-queue.mjs reassign <from-owner> <to-owner>   # hand-off: every row of <from> moves to <to>
//
// States: queued, drafting, ci, ready, hold, merged, closed. merged and closed are terminal (check ignores them).
// Exit: 0 ok, 1 check failed or usage, 2 unknown PR.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_FILE = "fleet/queue.json";
export const STATES = ["queued", "drafting", "ci", "ready", "hold", "merged", "closed"];
export const TERMINAL = ["merged", "closed"];

/** File text -> rows (sorted by PR). Missing or empty text is an empty queue; malformed text throws. Pure. */
export function parseQueue(text) {
  if (!String(text || "").trim()) return [];
  const j = JSON.parse(text);
  const rows = Array.isArray(j) ? j : j.rows;
  if (!Array.isArray(rows)) throw new Error('queue file must be {"rows":[…]}');
  return rows.map((r) => ({ pr: Number(r.pr), head: String(r.head || ""), state: String(r.state || "queued"),
    owner: String(r.owner || ""), next: String(r.next || "") })).sort((a, b) => a.pr - b.pr);
}

/** Rows -> file text (stable key order, one trailing newline). Pure. */
export const serializeQueue = (rows) => JSON.stringify({ rows: [...rows].sort((a, b) => a.pr - b.pr) }, null, 2) + "\n";

/** Insert or update the row for `pr` with the defined fields of `patch`. Returns the new rows. Pure. */
export function upsert(rows, pr, patch = {}) {
  if (!Number.isInteger(pr) || pr < 1) throw new Error("PR must be a positive integer");
  if (patch.state !== undefined && !STATES.includes(patch.state)) throw new Error(`state must be one of ${STATES.join(" ")}`);
  const cur = rows.find((r) => r.pr === pr) || { pr, head: "", state: "queued", owner: "", next: "" };
  const merged = { ...cur };
  for (const k of ["head", "state", "owner", "next"]) if (patch[k] !== undefined) merged[k] = String(patch[k]);
  return [...rows.filter((r) => r.pr !== pr), merged].sort((a, b) => a.pr - b.pr);
}

/** Rows whose problem blocks a tick: a live row (not merged/closed) with no owner, an unknown state, or no next step. Pure. */
export function ownershipProblems(rows) {
  const out = [];
  for (const r of rows) {
    if (TERMINAL.includes(r.state)) continue;
    if (!STATES.includes(r.state)) out.push({ pr: r.pr, why: `unknown state "${r.state}"` });
    else if (!r.owner) out.push({ pr: r.pr, why: "no owner" });
    else if (!r.next) out.push({ pr: r.pr, why: "no next step" });
  }
  return out;
}

/** Move every row owned by `from` to `to`; returns { rows, moved }. Pure. */
export function reassign(rows, from, to) {
  if (!from || !to) throw new Error("reassign needs <from-owner> <to-owner>");
  let moved = 0;
  const next = rows.map((r) => (r.owner === from ? (moved++, { ...r, owner: to }) : r));
  return { rows: next, moved };
}

/** One printable line per row. Pure. */
export const rowLine = (r) => `#${r.pr} ${r.state.padEnd(8)} ${(r.head || "-").slice(0, 8).padEnd(8)} ${(r.owner || "(no owner)").padEnd(34)} ${r.next || "-"}`;

const USAGE = "usage: fleet-queue.mjs list [--json] | set <PR> [--head S] [--state S] [--owner O] [--next T] | rm <PR> | check | reassign <from> <to>   [--file PATH]";

export function main(argv, { root = ROOT, log = console.log, read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } },
  write = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); } } = {}) {
  const flags = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") flags.json = true;
    else if (a.startsWith("--")) { flags[a.slice(2)] = argv[++i]; if (flags[a.slice(2)] === undefined) { log(`fleet-queue: ${a} needs a value`); return 1; } }
    else pos.push(a);
  }
  const file = path.resolve(root, flags.file || DEFAULT_FILE);
  const [cmd, a1, a2] = pos;
  try {
    const rows = parseQueue(read(file));
    if (cmd === "list") {
      if (flags.json) log(JSON.stringify(rows));
      else { for (const r of rows) log(rowLine(r)); log(`= queue ${rows.length} row(s) in ${path.relative(root, file)}`); }
      return 0;
    }
    if (cmd === "set") {
      const pr = Number(a1);
      const next = upsert(rows, pr, { head: flags.head, state: flags.state, owner: flags.owner, next: flags.next });
      write(file, serializeQueue(next));
      log(`= queue set ${rowLine(next.find((r) => r.pr === pr))}`);
      return 0;
    }
    if (cmd === "rm") {
      const pr = Number(a1);
      if (!rows.some((r) => r.pr === pr)) { log(`= queue: no row for #${a1}`); return 2; }
      write(file, serializeQueue(rows.filter((r) => r.pr !== pr)));
      log(`= queue removed #${pr}`);
      return 0;
    }
    if (cmd === "check") {
      const bad = ownershipProblems(rows);
      for (const b of bad) log(`#${b.pr}: ${b.why}`);
      log(bad.length ? `= queue check FAILED: ${bad.length} row(s) need an owner or next step` : `= queue check ok (${rows.length} row(s))`);
      return bad.length ? 1 : 0;
    }
    if (cmd === "reassign") {
      const r = reassign(rows, a1, a2);
      write(file, serializeQueue(r.rows));
      log(`= queue reassigned ${r.moved} row(s) from ${a1} to ${a2}`);
      return 0;
    }
    log(`fleet-queue: ${cmd ? "unknown command " + cmd : "no command"}\n${USAGE}`);
    return 1;
  } catch (e) {
    log(`fleet-queue: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
