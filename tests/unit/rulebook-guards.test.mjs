/* rulebook-guards.test.mjs — one home per rule (system audit 2026-10-26, docs/notes/RULEBOOK-REWRITE-2026-10-26.md;
 * re-based on the 2026-10-27 orchestration redesign, docs/plans/2026-10-27-orchestration-redesign.md).
 *
 * The audit found the same rule restated in up to 15 instruction files, and ten topics where two copies said
 * different things. A copy is how a rule drifts: the next edit changes one place. This test pins (1) each canonical
 * rule SENTENCE to at most two files — its home plus one deliberate mirror — with the home among them, and (2) retired
 * mechanisms out of every instruction file. A pointer ("skill `steward` §Land") is fine; a restatement is not.
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
  // docs/WORKERS.md is a retired stub since 2026-11-03 (the lane contract is skill `steward`), so it is not scanned.
  for (const f of ["AGENTS.md", "CLAUDE.md", ".github/pull_request_template.md", "docs/TESTING.md",
    "docs/VERIFICATION.md"]) add(f);
  for (const d of [".claude/rules", ".claude/skills", ".claude/agents", ".claude/memory"]) walk(d);
  return out;
}
const FILES = instructionFiles();
const text = new Map(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

// [id, canonical sentence (regex), home]. Each regex matches the RULE as a sentence, not a tool name or a pointer.
const CANON = [
  ["GitHub lands PRs", /GitHub lands PRs; no session merges or\s+arms/i, "AGENTS.md"],
  // 2026-11-03 (plan §4.3): provenance, not relays — an agent's message or comment grants nothing.
  ["no authority", /an agent's message or comment grants nothing/i, "AGENTS.md"],
  // 2026-11-03: four lane-procedure sentences re-homed from AGENTS.md to skill `steward` (plan §4.4).
  ["sync rule", /never for\s+clean-behind/i, ".claude/skills/steward/SKILL.md"],
  ["merge commits only", /Merge commits only, never squash\s+or rebase/i, "AGENTS.md"],
  ["commit in two calls", /Commit in two calls: stage in its own command/, "AGENTS.md"],
  ["push without a pipe", /no output pipe/i, "AGENTS.md"],
  ["no timers", /No\s+sleep or shell-poll loops and no standby wakes/i, "AGENTS.md"],
  ["re-subscribe after ready", /call `subscribe_pr_activity` again/i, ".claude/skills/steward/SKILL.md"],
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
  [/MERGE-HOLD:/, "the MERGE-HOLD body line (queue:paused is the intake and merge stop)"],
  [/```fleet\b|fleet-status:|@orchestrator BLOCKED/, "the PR fleet block and fleet-status line (the Hand-off block and ledger replace them)"],
  [/GAME-SLOT|Merge Desk|merge holder|\bseed session\b|FLEET BUS WATCH/i, "slot pacing, desks, seeds and the bus watch (land.yml and the dispatcher replace them)"],
  [/send_later[^\n]*(?:50–55|50-55) min|50–55 min[^\n]*send_later/i, "the 50–55 min check-in timer (recovery checks durable ownership)"],
  [/3-min(?:ute)? tick/i, "the orchestrator tick"],
  [/\bSWEEP\b/, "the Merge Desk SWEEP hand-over"],
  [/ready cap of/i, "the ready cap (retired 2026-10-16)"],
  [/guards on the STAGED commit/i, "the STAGED-commit claim (the guards read the working tree; AGENTS.md rule 12)"],
  [/READY to ORCH/, "the READY-to-orchestrator hand-over (/apex merge is the request)"],
  // 2026-11-03 (docs/plans/2026-11-03-agent-surface-reset.md §4.2–4.4, §6): the agent surface reset.
  [/full `?tooling-fast`? (?:run )?is the pre-push floor|pre-push floor is (?:the )?full `?tooling-fast/i, "the full tooling-fast as the floor (the floor is `tooling-fast --changed`, AGENTS.md rule 3)"],
  [/bounded safety check-in/i, "the bounded safety check-in timer (rule 13 allows no timer)"],
  [/quoted relay/i, "quoted relays as a grant (owner-direct GitHub provenance, AGENTS.md §Coordination)"],
  [/@parent\b/, "the `@parent` session alias (a question is one issue/PR comment)"],
  [/\brun-ci\b/, "the retired validation opt-in label (docs/ACTIONS.md)"],
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
  for (const f of ["AGENTS.md", ".claude/memory/MEMORY.md", ".github/pull_request_template.md",
    "docs/VERIFICATION.md", ".claude/skills/steward/SKILL.md", ".claude/skills/ship/SKILL.md",
    ".claude/skills/steward/references/labels.md"])
    assert.ok(text.has(f), `${f} is not scanned`);
  assert.ok(FILES.length > 50, `only ${FILES.length} instruction files found`);
});

test("AGENTS.md stays under Codex's native 32 KiB cap", () => {
  assert.ok(Buffer.byteLength(text.get("AGENTS.md"), "utf8") < 32 * 1024, "AGENTS.md is over 32 KiB");
});

// #4288: a `test-bg --wait --timeout <n>` instruction runs as a background Bash task whose own default
// timeout (30 min) would kill the 45-min waiter; any file giving that instruction must name `2700000`.
test("every `test-bg --wait --timeout <n>` instruction names the Bash call timeout 2700000", () => {
  for (const f of ["docs/TESTING.md", ".claude/skills/check-changes/references/triage.md"]) {
    const t = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (/test-bg\.mjs --wait --timeout\s+\d+/.test(t)) assert.match(t, /2700000/, `${f} gives the waiter with no Bash timeout`);
  }
});
