#!/usr/bin/env node
// verify-change.mjs — ONE command that runs what a change needs, serialized
// @doc ONE command: fast gate (verify-track, graph-parity, tooling-fast, bump-cache --check) + `test-bg` batches → one verdict.
// @section runner
// correctly, and hands back one verdict.
//
// Before this tool the verification ritual was five manual steps spread over
// pick-tests.mjs (what to run), test-bg.mjs (how to run it), verify-track.cjs
// (circuit edits), test-solo.mjs (timeout triage) and bump-cache (the ship
// gate) — with the serialization rules living in AGENTS.md prose. This is the
// composition, not new test infrastructure:
//
//   node tools/verify-change.mjs                  # fast phase + start batch 1
//   node tools/verify-change.mjs --wait           # run EVERY batch to the end
//   node tools/verify-change.mjs --plan           # print the plan, run nothing
//   node tools/verify-change.mjs --fast           # fast phase only, no browser
//   node tools/verify-change.mjs --since <ref>    # diff base for file selection
//   node tools/verify-change.mjs --staged         # staged files only
//   ... --keep-going                              # don't stop the chain on a red batch
//   ... --json                                    # machine-readable verdict
//
// Phases:
//   1 fast (inline, ~30 s): tooling-fast when the change warrants it;
//     verify-track.cjs per changed circuit; graph-parity when js/track/graph.js
//     moved; bump-cache --check. Any red here stops before browsers spin up.
//   2 groups (background via test-bg.mjs): pick-tests selection, ONE group per
//     batch (browser OR node) — sequential by default; AGENTS.md one-browser-
//     per-batch rule, enforced instead of quoted.
//   3 verdict: batch outcomes read from the logs' terminal lines. A timeout
//     outcome comes back labelled with the triage command (test-solo.mjs),
//     because a timeout on a busy box measures the machine, not the code.
//
// The default (no --wait) starts batch 1 and exits 2 ("partial") — the agent
// pattern is to do other work and come back; --wait is for CI or a final gate.
// This tool runs test groups, so run IT in the background too (AGENTS.md
// no-foreground-blocking rule applies to the driver as much as the driven).
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pick, DEPLOY_BRANCH } from "./pick-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const JSON_OUT = flag("--json");
const say = (...a) => { if (!JSON_OUT) console.log(`[verify-change]`, ...a); };
const loadavgLine = () => {
  try {
    const [a, b, c] = os.loadavg().map((n) => n.toFixed(2));
    return `loadavg=${a} ${b} ${c}`;
  } catch (_) {
    return "loadavg=?";
  }
};

const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

// ── changed-file selection (same semantics as pick-tests.mjs's CLI) ─────────
function changedFiles() {
  const sinceIdx = argv.indexOf("--since");
  const explicit = argv.filter((a, n) =>
    !a.startsWith("--") && !(sinceIdx >= 0 && n === sinceIdx + 1));
  if (explicit.length) return explicit;
  if (flag("--staged")) return git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
  if (opt("--since")) return git(["diff", "--name-only", opt("--since")]).split("\n").filter(Boolean);
  let base = "";
  for (const ref of [`origin/${DEPLOY_BRANCH}`, DEPLOY_BRANCH, "HEAD~1"]) {
    try { base = git(["merge-base", "HEAD", ref]); break; } catch (_) { /* next */ }
  }
  const out = new Set(git(["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean));
  if (base) for (const f of git(["diff", "--name-only", base]).split("\n")) if (f) out.add(f);
  for (const f of git(["ls-files", "--others", "--exclude-standard"]).split("\n")) if (f) out.add(f);
  return [...out];
}

// ── plan ─────────────────────────────────────────────────────────────────────
const files = changedFiles();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const groupSel = pick(files);
const groups = [...groupSel.keys()].filter((g) => pkg.scripts[`test:${g}`]).sort();
// THE THREE-WAY CONTRACT THIS FILE USED TO THROW AWAY. pick-tests.mjs:243
// computes exactly this — its `named` is derived identically to `groups` above —
// and its comment is the whole point: "unmatched" means files changed but no
// rule claimed them, so the selection is NOT trustworthy and the caller must
// fall back to a full run. Calling the raw pick() Map API drops it, and then
// `!batches.length` cannot tell "nothing needs testing" from "I do not know
// what to test". docs/PERF-FINDINGS.md 2j.
const selReason = !files.length ? "none" : (groups.length ? "matched" : "unmatched");
const isBrowser = (g) => /run-playwright/.test(pkg.scripts[`test:${g}`]);
const browserGroups = groups.filter(isBrowser);
// tooling-fast is phase 1's inline gate — leaving it in the batch list would
// run the same 78 suites twice.
const nodeGroups = groups.filter((g) => !isBrowser(g) && g !== "tooling-fast");

// ONE group per batch (browser OR node). Pairing node groups with a browser
// batch used to look cheap and still contended for CPU on SwiftShader boxes;
// sequential is the AGENTS.md default test-bg mode too.
const batches = [];
for (const b of browserGroups) batches.push([b]);
for (const n of nodeGroups) batches.push([n]);

const circuits = files
  .map((f) => (f.match(/^js\/circuits\/([a-z0-9_]+)\.js$/) || [])[1])
  .filter(Boolean);
const wantsToolingFast = groups.includes("tooling-fast") ||
  files.some((f) => /^(js|css|tools|tests|docs)\//.test(f) || /^index\.html|^AGENTS\.md/.test(f));
const wantsGraphParity = files.some((f) => f === "js/track/graph.js");
const wantsSweepsHint = files.some((f) => /^js\/(track|circuits)\//.test(f) || /^tools\//.test(f));

const plan = {
  files,
  // Carried into the plan too, not just the verdict: `--plan` printing
  // `"batches": []` with no reason is the same vacuous answer the run path
  // used to give — "nothing to test" and "no rule claimed these files" look
  // identical without it. docs/PERF-FINDINGS.md 2j.
  selection: selReason,
  fast: {
    toolingFast: wantsToolingFast,
    verifyTrack: circuits,
    graphParity: wantsGraphParity,
    cacheCheck: true,
  },
  batches,
  sweepsBeforeDeployPush: wantsSweepsHint,
};

if (flag("--plan")) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

say(`plan: files=${files.length} batches=${batches.length} ` +
  `browser=${browserGroups.length} node=${nodeGroups.length} ` +
  `toolingFast=${wantsToolingFast} verifyTrack=[${circuits.join(",")}] ` +
  `graphParity=${wantsGraphParity} ${loadavgLine()}`);
if (batches.length) {
  say(`batch plan (${batches.length}):`);
  batches.forEach((b, i) => say(`  ${i + 1}/${batches.length}: ${b.join(" ")}`));
}

// ── phase 1: fast, inline ────────────────────────────────────────────────────
const phases = [];
const run = (name, cmd, args) => {
  const t0 = Date.now();
  say(`phase1 START ${name}: ${cmd} ${args.join(" ")} at=${new Date(t0).toISOString()} ${loadavgLine()}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
  const ok = r.status === 0;
  const dur = Date.now() - t0;
  phases.push({ name, ok, exit: r.status, durationMs: dur });
  say(`phase1 ${ok ? "PASS" : "FAIL"} ${name} duration=${(dur / 1000).toFixed(1)}s exit=${r.status} ${loadavgLine()}`);
  if (!ok) say((r.stdout || "").slice(-2000) + (r.stderr || "").slice(-2000));
  return ok;
};

say(`── phase 1: fast gate ${loadavgLine()}`);
let fastOk = true;
for (const id of plan.fast.verifyTrack) {
  fastOk = run(`verify-track ${id}`, "node", ["tools/verify-track.cjs", id]) && fastOk;
}
if (plan.fast.graphParity) {
  fastOk = run("graph-parity", "node", ["tools/graph-parity.cjs", "--all"]) && fastOk;
}
if (plan.fast.toolingFast) {
  fastOk = run("tooling-fast", "npm", ["run", "--silent", "test:tooling-fast"]) && fastOk;
}
{
  // Advisory unless it can prove staleness: a mid-session tree legitimately
  // has edits ahead of the bump (the bump is the LAST edit before commit).
  say(`phase1 START cache-check (advisory)`);
  const r = spawnSync("node", ["tools/bump-cache.mjs", "--check", "--json"], { cwd: ROOT, encoding: "utf8" });
  const cache = (() => { try { return JSON.parse(r.stdout); } catch (_) { return { consistent: false }; } })();
  phases.push({ name: "cache-check", ok: cache.consistent, advisory: true, detail: cache });
  say(`phase1 ${cache.consistent ? "PASS" : "STALE"} cache-check (advisory)`);
}

const finish = (verdict, extra = {}) => {
  const out = { verdict, phases, batches, notRun: extra.notRun || [], ...extra };
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  else {
    say(`verdict: ${verdict} ${loadavgLine()}`);
    if (out.notRun.length) say(`not run: ${out.notRun.join(", ")}`);
    if (plan.sweepsBeforeDeployPush) say("deploy-push reminder: js/track|circuits|tools changed — run test:sweeps on the union first (.claude/skills/check-changes/references/deploy.md)");
  }
  process.exit(verdict === "pass" ? 0 : verdict === "fail" ? 1 : 2);
};

if (!fastOk) finish("fail", { notRun: batches.flat() });
// "unmatched" IS NOT "pass", and the difference is the whole reason pick-tests
// publishes a reason. A .github/, playwright.config.js, package.json, icons/ or
// vendor/ edit names no group, so batches is empty for the same reason an empty
// diff is — and this used to answer both with `pass`, exit 0. That is the
// answer an agent gets from `apex_verify_change_fast` and from verify-agent
// when it asks "did I break anything?", after running one advisory cache-check.
// finish() already exits 2 for anything that is neither pass nor fail, and
// apex-tools-mcp allows exit 2, so this needs no new vocabulary.
if (selReason === "unmatched") {
  finish("unmatched", {
    notRun: batches.flat(),
    unclaimed: files,
    toolingFast: !!plan.fast.toolingFast,
    why: "no rule in pick-tests.mjs claimed these files, so the group selection " +
         "is not trustworthy — fall back to a full run before trusting a green.",
  });
}
if (flag("--fast") || !batches.length) {
  finish(fastOk ? (batches.length ? "partial" : "pass") : "fail",
    { notRun: batches.flat() });
}

// ── phase 2: batches via test-bg ─────────────────────────────────────────────
// The outcome truth is each group's log terminal line; test-bg --wait already
// exits nonzero when any group in the batch did not pass.
const groupOutcome = (g) => {
  try {
    const text = fs.readFileSync(path.join(ROOT, "artifacts/logs", `${g}.log`), "utf8");
    const pw = [...text.matchAll(/= run (\w+)\s+\(([^)]*)\)/g)].pop();
    if (pw) return `${pw[1]} (${pw[2]})`;
    const tap = text.match(/^# pass (\d+)$[\s\S]*?^# fail (\d+)$/m);
    if (tap) return tap[2] === "0" ? `passed (${tap[1]})` : `failed (${tap[2]} of ${+tap[1] + +tap[2]})`;
    // plain-script groups: test-bg's `= bg exit N` trailer is the only line
    const bg = [...text.matchAll(/^= bg exit (\d+)$/gm)].pop();
    if (bg) return bg[1] === "0" ? "passed (exit 0)" : `failed (exit ${bg[1]})`;
  } catch (_) { /* no log yet */ }
  return "unknown";
};

say(`── phase 2: ${batches.length} sequential batch(es) via test-bg ${loadavgLine()}`);

if (!flag("--wait")) {
  // Start batch 1 only; the agent comes back for the rest. Anything more here
  // would be this tool quietly holding a terminal, which is the failure mode
  // the AGENTS.md background rule exists to kill.
  say(`starting batch 1/${batches.length}: ${batches[0].join(" ")}`);
  const r = spawnSync("node", ["tools/test-bg.mjs", ...batches[0]], { cwd: ROOT, encoding: "utf8", stdio: JSON_OUT ? "pipe" : "inherit" });
  finish(r.status === 0 ? "partial" : "fail", {
    started: batches[0],
    notRun: batches.slice(1).flat(),
    next: batches.length > 1
      ? `node tools/test-bg.mjs --wait && node tools/test-bg.mjs ${batches[1].join(" ")}`
      : "node tools/test-bg.mjs --wait",
  });
}

const results = {};
let allOk = true;
for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  say(`batch START ${i + 1}/${batches.length}: ${batch.join(" ")} at=${new Date().toISOString()} ${loadavgLine()}`);
  const t0 = Date.now();
  const started = spawnSync("node", ["tools/test-bg.mjs", ...batch], { cwd: ROOT, encoding: "utf8", stdio: JSON_OUT ? "pipe" : "inherit" });
  if (started.status !== 0) {
    allOk = false;
    for (const g of batch) results[g] = "refused";
    say(`batch FAIL ${i + 1}/${batches.length}: refused to start`);
    continue;
  }
  const waited = spawnSync("node", ["tools/test-bg.mjs", "--wait"], { cwd: ROOT, encoding: "utf8", stdio: JSON_OUT ? "pipe" : "inherit" });
  for (const g of batch) {
    const o = groupOutcome(g);
    results[g] = o;
    if (!/^passed/.test(o)) {
      allOk = false;
      // A timeout outcome gets the triage command attached, not a verdict:
      // re-run the spec ALONE before believing it (tools/test-solo.mjs).
      if (/timedout|timeout/i.test(o)) results[g] += "  → triage: node tools/test-solo.mjs <spec> (a timeout on a busy box measures the machine)";
    }
  }
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  say(`batch END ${i + 1}/${batches.length}: ${batch.join(" ")} duration=${dur}s ` +
    `${batch.map((g) => `${g}=${results[g]}`).join(" ")} ${loadavgLine()}`);
  if (waited.status !== 0 && !flag("--keep-going")) break;
}

finish(allOk ? "pass" : "fail", { groups: results });
