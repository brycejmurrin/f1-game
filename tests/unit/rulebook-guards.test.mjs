/* rulebook-guards.test.mjs — one home per rule (system audit 2026-10-26, docs/notes/RULEBOOK-REWRITE-2026-10-26.md;
 * re-based on the 2026-10-27 orchestration redesign, docs/plans/2026-10-27-orchestration-redesign.md).
 *
 * The audit found the same rule restated in up to 15 instruction files, and ten topics where two copies said
 * different things. A copy is how a rule drifts: the next edit changes one place. This test pins (1) each canonical
 * rule SENTENCE to at most two files — its home plus one deliberate mirror — with the home among them, and (2) retired
 * mechanisms out of every instruction file. A pointer ("see docs/WORKERS.md") is fine; a restatement is not.
 *
 * Run: node --test tests/unit/rulebook-guards.test.mjs   (< 1 s)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every file a session loads as instructions or memory. Symlinks (Codex mirrors) and generated twins are skipped. */
function instructionFiles() {
  const out = [];
  const add = (rel) => { const abs = path.join(ROOT, rel); if (fs.existsSync(abs) && !fs.lstatSync(abs).isSymbolicLink()) out.push(rel); };
  const walk = (dir) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".md")) out.push(rel);
    }
  };
  for (const f of ["AGENTS.md", "CLAUDE.md", "docs/WORKERS.md", ".github/pull_request_template.md", "docs/TESTING.md",
    "docs/VERIFICATION.md"]) add(f);
  for (const d of [".claude/rules", ".claude/skills", ".claude/agents", ".claude/memory"]) walk(d);
  return out;
}
const FILES = instructionFiles();
const text = new Map(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

// [id, canonical sentence (regex), home]. Each regex matches the RULE as a sentence, not a tool name or a pointer.
const CANON = [
  ["hold label veto", /only veto is the `hold` label/i, "AGENTS.md"],
  ["GitHub lands PRs", /GitHub lands PRs; no session merges or arms/i, "AGENTS.md"],
  ["no authority", /messages? carr(?:y|ies) no authority/i, "AGENTS.md"],
  ["sync rule", /never for\s+clean-behind/i, "AGENTS.md"],
  ["merge commits only", /Merge commits only, never squash\s+or rebase/i, "AGENTS.md"],
  ["never cancel", /NEVER CANCEL AN ACTIONS RUN/, "AGENTS.md"],
  ["commit in two calls", /Commit in two calls: stage in its own command/, "AGENTS.md"],
  ["push without a pipe", /no output pipe/i, "AGENTS.md"],
  ["no timers", /No sleep or shell-poll loops and no standby wakes/i, "AGENTS.md"],
  ["dirty ready flip", /ready flip on a (?:dirty PR|CONFLICTING\/DIRTY head) starts no CI/i, "AGENTS.md"],
  ["re-subscribe after ready", /call `subscribe_pr_activity` again/i, "AGENTS.md"],
  ["first claimant fixes", /the first claimant fixes, the rest wait/i, "AGENTS.md"],
  ["memory-change line", /`memory-change: <reason>`/, ".github/pull_request_template.md"],
  // Rule 11's build-at-deploy half (Bryce 2026-10-28, "Build at deploy"; docs/notes/DEPLOY-TIME-GEN-2026-10-28.md).
  ["built, never committed", /are built, never committed: gitignored/i, "AGENTS.md"],
];

test("each canonical rule sentence lives in its home and at most one other file", () => {
  const bad = [];
  for (const [id, re, home] of CANON) {
    const hits = FILES.filter((f) => re.test(text.get(f)));
    if (!hits.includes(home)) bad.push(`${id}: its home ${home} no longer states it (moved? re-point the regex)`);
    if (hits.length > 2) bad.push(`${id}: stated in ${hits.length} files (${hits.join(", ")}); keep the home, link to it elsewhere`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

// Retired mechanisms an instruction file must not teach again. A line that also says it is retired/superseded is history.
const RETIRED = [
  [/bash-guard(?:\.sh)? runs (?:the guards|`test:guards`)/i, "the in-PreToolUse commit suite (git pre-commit owns it)"],
  [/fleet-bus\.mjs|agent-msg\.mjs|who-is-on-it\.mjs|fleet-owner\.mjs|fleet-brief\.mjs|launch-lane\.mjs/, "the bus, claims board and launch-lane tools (retired 2026-10-27: GitHub is the only bus; docs/WORKERS.md)"],
  [/MERGE-HOLD:/, "the MERGE-HOLD body line (the `hold` label is the veto)"],
  [/```fleet\b|fleet-status:|@orchestrator BLOCKED/, "the PR fleet block and fleet-status line (the Hand-off block and labels replace them)"],
  [/GAME-SLOT|Merge Desk|merge holder|\bseed session\b|FLEET BUS WATCH/i, "slot pacing, desks, seeds and the bus watch (land.yml and the dispatcher replace them)"],
  [/send_later[^\n]*(?:50–55|50-55) min|50–55 min[^\n]*send_later/i, "the 50–55 min check-in timer (a lane ends at `land`; the dispatcher re-owns silence)"],
  [/3-min(?:ute)? tick/i, "the orchestrator tick"],
  [/\bSWEEP\b/, "the Merge Desk SWEEP hand-over"],
  [/ready cap of/i, "the ready cap (retired 2026-10-16)"],
  [/guards on the STAGED commit/i, "the STAGED-commit claim (the guards read the working tree; AGENTS.md rule 12)"],
  [/READY to ORCH/, "the READY-to-orchestrator hand-over (the `land` label is the request)"],
];
const HISTORY = /retired|superseded|history|deleted|replaces? the|replace them|no longer|slated for removal|era\b|was \d+ ?min/i;

test("no instruction file teaches a retired mechanism", () => {
  const bad = [];
  for (const f of FILES) {
    text.get(f).split("\n").forEach((line, i) => {
      for (const [re, why] of RETIRED) {
        if (!re.test(line) || HISTORY.test(line)) continue;
        bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)} — ${why}`);
      }
    });
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("the scan covers the surfaces it claims (a moved tree must not turn this into a no-op)", () => {
  for (const f of ["AGENTS.md", "docs/WORKERS.md", ".claude/memory/MEMORY.md", ".github/pull_request_template.md",
    "docs/VERIFICATION.md", ".claude/skills/steward/SKILL.md", ".claude/skills/ship/SKILL.md"])
    assert.ok(text.has(f), `${f} is not scanned`);
  assert.ok(FILES.length > 50, `only ${FILES.length} instruction files found`);
});

test("AGENTS.md stays under Codex's native 32 KiB cap", () => {
  assert.ok(Buffer.byteLength(text.get("AGENTS.md"), "utf8") < 32 * 1024, "AGENTS.md is over 32 KiB");
});
