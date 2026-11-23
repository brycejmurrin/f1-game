VERDICT: FIX — SKILL.md:47-49 is false (Cursor/Codex commits ARE guarded); deploy.md:80 carries the stale 23/73 numbers.
METRICS: SKILL.md 108 lines / 6426 B (~1.6k tok); references 7 files (deploy 92 lines, triage 99, guards 91 …); description 224 chars.
PATHS: OK (VERIFICATION.md#docs-and-skill-changes, DEFECT-LEDGER.md, agent-output/README.md, agent-run.mjs, doctor.mjs, apex-tools-mcp.sh, session-status.mjs, AGENT-SURFACE.md all exist; `--summary` appears in session-status.mjs). References 5 of 7 not individually re-verified for inner paths: UNREAD.
COMMANDS: OK for verify-change.mjs: validate list (verify-change.mjs:49) = --staged --json --plan --fast --wait --keep-going --help; SKILL.md uses only --plan/--fast/--json/--wait. `--since` is parsed (line 82) but not in the validate list. verify-agent.md:20-26,62 uses --plan --json, --fast --json, --base <ref> (the agent's own wrapper flag, not a verify-change flag) and `<same-paths…>`: arguments match. SKILL.md:51-52 "verify-agent --base <ref>" is an agent arg, fine.
WALKTHROUGH ("did I break anything"): live `!pick-tests` block gives groups; --plan then --fast --json; deploy.mjs --gate-only before push; triage via references. Clear. Only snag: line 56-58 says plan batches may exceed the two-group cap, ordering defers to engine-physics.md — fine. The `!`-expansion is Claude-only (disclosed at 16-17).
STRUCTURE: Short, one-level references. Line 8-10 defers to VERIFICATION.md (good). Lines 62-84 "Output and reading budget" is a long generic paragraph (agent-output contract restated; ~20 lines, several >200 chars) — belongs in docs/agent-output/README.md; trim to a pointer. Line 59-60 and 86-94 duplicate wrap map in AGENT-SURFACE.md.
ENFORCEMENT: Lines 47-49 claim wrong (see below). Two-call commit is already hook-enforced; the skill just points to rule 12 (fine).

F1 CONFIRMED (stale, REFUTED claim) — SKILL.md:47-49:
- .cursor/hooks.json beforeShellExecution -> `bash .cursor/hooks/shell-guard.sh` (failClosed); .codex/hooks.json PreToolUse Bash -> `.codex/hooks/shell-guard.sh`.
- .cursor/hooks/shell-guard.sh:2-12: routes to .claude/hooks/bash-guard.sh; "The commit gate is left to .githooks/pre-commit when core.hooksPath points there" (sets APEX_COMMIT_GATE=githook, line 15; bash-guard.sh:503-505 skips C_RUN then). package.json:75 `prepare` sets core.hooksPath .githooks, and .githooks/pre-commit exists. So commits are guarded either via bash-guard or git pre-commit. Residual true part: a clone where `npm install` never ran (hooksPath unset) AND a host with no hook still skips; the 2026-10-26 incident (two malformed fragments) predates/was a different path — the sentence's causal claim is unevidenced. Replace with: "Cursor/Codex route `git commit` through shell-guard.sh -> bash-guard.sh (or .githooks/pre-commit); run `npm run test:guards` by hand only if core.hooksPath is unset." [pass3: NEW]

TRIGGER: description names WHAT/WHEN with user words ("did I break anything", "pre-push", "timeout triage"). Overlap: "deploy-branch merge/push" collides with ship ("push, ship, push to the deploy branch"; ship/SKILL.md:3) and steward ("deploy branch is red"). Three asks: "did I break anything" -> routes here; "push to the deploy branch" -> ship wins by wording, but this one also matches => ambiguity. Fix: drop "deploy-branch merge/push" from the description (keep it in references/deploy.md load-on-demand) or say "deploy-branch gate/union sweep (landing → ship)". [pass3 S10: STILL OPEN]

STALE NUMBER: references/deploy.md:80 "median 23 min, p90 73" vs AGENTS.md "~20 min median, p90 ~27, 23 trains 2026-10-26" (numbers.md:17-18; the 73 is dated 2026-10-14 in TESTING.md:1138). Fix: replace with a pointer to AGENTS.md §Git branch & deploy / TESTING.md §Release train, no figures. [pass3 D8: STILL OPEN]

GAPS (ranked):
1. SKILL.md:47-49 — rewrite false "Cursor and Codex commits reach CI unguarded" (see F1).
2. references/deploy.md:80 — drop "median 23 min, p90 73"; point to AGENTS.md.
3. SKILL.md:3 — remove "deploy-branch merge/push" overlap with ship/steward.
4. SKILL.md:62-84 — shrink Output-budget block to a link to docs/agent-output/README.md.

OUT OF SCOPE: AGENTS.md:171 — publish figures ("~20 min", "p90 ~27") are the live home; TESTING.md:1138-1143 holds dated sets. Bryce's iPhone/TLX setup: nothing in this skill touches it.
