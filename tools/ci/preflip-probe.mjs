#!/usr/bin/env node
// preflip-probe.mjs — what GitHub's merge ref will say, found locally before the draft→ready flip.
// @doc Pre-flip probe: merge the deploy tip into a PR head in a temp worktree, run ratchets + fixture audit + diff units.
// @section runner
//
// CI runs a PR on the MERGE of its head and the deploy tip, so three kinds of red exist only there: a ratchet whose
// ceiling the tip moved ("10 over its ceiling", #4190), the fixture-consumer FLOOR, and the assertPins ratchet
// (#4108). The pre-push floor runs on the branch alone and cannot see them (orchestration review 2026-10-29,
// Part 1 finding 2 / Part 2 finding 2, https://github.com/brycejmurrin/f1-game/pull/4208).
//
//   node tools/ci/preflip-probe.mjs --pr <n>      # head from the PR, tip from origin
//   node tools/ci/preflip-probe.mjs               # HEAD of this checkout
//   … --skip-units                                 # ratchets + fixture audit only (~seconds)
//   … --keep                                       # leave the worktree (artifacts/preflip/wt-*) for a look
//   … --json                                       # {ok, steps} on stdout
//
// ADVISORY: ready-gate.mjs prints the receipt (artifacts/preflip/<pr>.json) as a line and never blocks on it.
// A merge that conflicts reports `conflict` (sync with node tools/ci/sync-pr.mjs); the probe pushes nothing.
// Exit: 0 every step green, 1 a step red, 2 usage / conflict, 3 could not set up.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOY_BRANCH } from "./pick-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PROBE_DIR = "artifacts/preflip";

/** The checks run on the merge, in order. `units` is the long one and the only one --skip-units drops. */
export function probeSteps({ skipUnits = false } = {}) {
  const steps = [
    { name: "ratchets", cmd: ["node", "tools/check/ratchets.mjs"], timeoutS: 120 },
    { name: "fixture-consumer-audit", cmd: ["node", "tools/ci/fixture-consumer-audit.mjs"], timeoutS: 120 },
    { name: "assert-pin ratchet", cmd: ["node", "--test", "tests/unit/assert-match-ratchet.test.mjs", "tests/unit/ratchets.test.mjs"], timeoutS: 240 },
  ];
  if (!skipUnits) steps.push({ name: "units", cmd: ["node", "tools/ci/tooling-fast.mjs", "--changed", "--no-sync-shortcut", "--jobs=2", "--quiet"], timeoutS: 900 });
  return steps;
}

/** One line a human or ready-gate reads: `= preflip <state> …`. */
export function probeVerdictLine(r) {
  if (r.state === "conflict") return `= preflip conflict - ${DEPLOY_BRANCH} does not merge into ${String(r.head).slice(0, 8)}: ${r.conflicts.join(", ") || "see git merge"}; sync first (node tools/ci/sync-pr.mjs <branch>)`;
  const red = r.steps.filter((s) => !s.ok).map((s) => s.name);
  return red.length
    ? `= preflip failed - ${red.join(", ")} red on the merge with tip ${String(r.tip).slice(0, 8)} (head ${String(r.head).slice(0, 8)})`
    : `= preflip passed - ${r.steps.length} step(s) green on the merge with tip ${String(r.tip).slice(0, 8)} (head ${String(r.head).slice(0, 8)})`;
}

/** The ready-gate advisory for a receipt (or its absence). Never a block. */
export function preflipAdvisory(receipt, head, pr) {
  if (!receipt) return `advisory: no pre-flip probe for this head - run node tools/ci/preflip-probe.mjs --pr ${pr} (merges the deploy tip, runs ratchets + fixture audit)`;
  if (receipt.head && head && receipt.head !== head) return `advisory: the pre-flip probe is for ${String(receipt.head).slice(0, 8)}, not head ${String(head).slice(0, 8)} - re-run node tools/ci/preflip-probe.mjs --pr ${pr}`;
  return `advisory: ${probeVerdictLine(receipt).replace(/^= /, "")}`;
}

export function readProbeReceipt(pr, root = ROOT) {
  try { return JSON.parse(fs.readFileSync(path.join(root, PROBE_DIR, `${pr}.json`), "utf8")); } catch (_) { return null; }
}

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });

/**
 * Run the probe. `exec(cmd, args, opts)` is injectable (tests); returns the receipt object.
 * @returns {{ok:boolean,state:string,head:string,tip:string,steps:object[],conflicts:string[]}}
 */
export function runProbe({ pr = null, head = "", skipUnits = false, keep = false, root = ROOT, exec = sh, log = () => {} } = {}) {
  const git = (...a) => exec("git", a, { cwd: root });
  const out = (r) => String(r.stdout || "").trim();
  if (pr && !head) {
    const f = git("fetch", "-q", "origin", `refs/pull/${pr}/head`);
    if (f.status !== 0) throw new Error(`cannot fetch refs/pull/${pr}/head: ${String(f.stderr).trim()}`);
    head = out(git("rev-parse", "FETCH_HEAD"));
  }
  if (!head) head = out(git("rev-parse", "HEAD"));
  const f = git("fetch", "-q", "origin", DEPLOY_BRANCH);
  if (f.status !== 0) throw new Error(`cannot fetch origin ${DEPLOY_BRANCH}: ${String(f.stderr).trim()}`);
  const tip = out(git("rev-parse", `origin/${DEPLOY_BRANCH}`));
  const wt = path.join(root, PROBE_DIR, `wt-${pr || "head"}-${Date.now()}`);
  fs.mkdirSync(path.dirname(wt), { recursive: true });
  const add = git("worktree", "add", "--detach", wt, head);
  if (add.status !== 0) throw new Error(`git worktree add failed: ${String(add.stderr).trim()}`);
  const base = { pr, head, tip, steps: [], conflicts: [] };
  try {
    const inWt = (...a) => exec("git", a, { cwd: wt });
    inWt("config", "user.email", "preflip@localhost");
    inWt("config", "user.name", "preflip-probe");
    const m = inWt("merge", "--no-edit", "--no-ff", `origin/${DEPLOY_BRANCH}`);
    if (m.status !== 0) {
      const conflicts = out(inWt("diff", "--name-only", "--diff-filter=U")).split("\n").filter(Boolean);
      inWt("merge", "--abort");
      return { ...base, ok: false, state: "conflict", conflicts };
    }
    // The merge needs the checkout's dependencies and the built (gitignored) served files.
    try { fs.symlinkSync(path.join(root, "node_modules"), path.join(wt, "node_modules"), "dir"); } catch (_) { /* present */ }
    exec("node", ["tools/gen/ensure-built.mjs"], { cwd: wt });
    for (const s of probeSteps({ skipUnits })) {
      const t0 = Date.now();
      log(`[preflip] ${s.name} ...`);
      const r = exec(s.cmd[0], s.cmd.slice(1), { cwd: wt, timeout: s.timeoutS * 1000 });
      const ok = r.status === 0;
      base.steps.push({ name: s.name, ok, seconds: Math.round((Date.now() - t0) / 100) / 10,
        tail: ok ? "" : `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n").slice(-25).join("\n") });
    }
    const ok = base.steps.every((s) => s.ok);
    return { ...base, ok, state: ok ? "passed" : "failed" };
  } finally {
    if (!keep) {
      exec("git", ["worktree", "remove", "--force", wt], { cwd: root });
      exec("git", ["worktree", "prune"], { cwd: root });
    }
  }
}

function main(argv) {
  const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : null; };
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("usage: node tools/ci/preflip-probe.mjs [--pr <n>] [--skip-units] [--keep] [--json]");
    return 0;
  }
  const known = new Set(["--pr", "--skip-units", "--keep", "--json", "--help", "-h"]);
  const bad = argv.filter((a, i) => a.startsWith("-") && !known.has(a));
  if (bad.length) { console.error(`unknown option ${bad.join(", ")}`); return 2; }
  const pr = opt("--pr");
  if (pr != null && !/^[1-9]\d*$/.test(pr)) { console.error("--pr expects a positive integer"); return 2; }
  let r;
  try {
    r = runProbe({ pr, skipUnits: argv.includes("--skip-units"), keep: argv.includes("--keep"), log: (m) => console.error(m) });
  } catch (e) {
    console.error(`= preflip unknown - ${e.message}`);
    return 3;
  }
  fs.mkdirSync(path.join(ROOT, PROBE_DIR), { recursive: true });
  fs.writeFileSync(path.join(ROOT, PROBE_DIR, `${pr || "head"}.json`), JSON.stringify(r, null, 2) + "\n");
  if (argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    for (const s of r.steps) {
      console.log(`  ${s.ok ? "ok  " : "RED "} ${s.name} (${s.seconds}s)`);
      if (!s.ok) console.log(s.tail.split("\n").map((l) => `      | ${l}`).join("\n"));
    }
    console.log(probeVerdictLine(r));
  }
  return r.state === "conflict" ? 2 : r.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
