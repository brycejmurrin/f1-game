# R2 review — .claude/agents (11 + README), .claude/hooks, settings.json, .mcp.json, .codex/hooks.json

Read-only. 2026-10-27. Evidence: crafted stdin payloads fed to protect-files.sh, bash-guard.sh,
github-mcp-guard.sh and launch-gate.py (scratch receipts only), plus 13 hook/guard/policy unit files:
`node --test` 237/237 pass (agent-config, agent-hooks-vm, bash-guard-hardening, context-cap-hook,
cross-tool-guards, hooks-documented, launch-gate, new-hooks-vm, poll-live-shell, safety-bans-hook,
subagent-contract-hook, gate-receipt-merge-kind, merge-hygiene). The tests are green, but they do not
cover the gaps marked HIGH below.

## Probe results (exit / decision)
- protect-files: Write `artifacts/merge-gate/9999.json`, `artifacts/ready-gate/9999.json` and
  `artifacts/launch-gate/receipt.json` → all 0 (allowed). The Bash form `echo > artifacts/ready-gate/…` → 0.
  Edits to `.github/workflows/land.yml`, `.claude/hooks/merge_policy.py` and `.claude/settings.json` → 0.
  Control: version.json → 2.
- launch-gate.py: a hand-typed receipt `{ok,kind:"launch",at:now,page:{sha256:"a"*64}}` → allowed, and
  a second create_session on the same receipt → allowed (it can be reused for 120 s).
- bash-guard: `gh pr edit 12 --remove-label hold`, `gh issue edit … --remove-label hold`,
  `gh api -X DELETE …/labels/hold`, `gh label delete hold` and `gh workflow run land.yml` → all 0, with no ask.
  `gh pr merge 12 --merge` → deny; `gh pr ready 12` → deny (no receipt). Both are correct.
- Poll rule: `for i in $(seq 1 5); do test -f x && break; sleep 2; done` (local, bounded) → BLOCKED.
  `for i in 1 2 3; do gh pr checks 12 && break; sleep 20; done` → allowed, as is
  `while ! curl localhost…; do sleep 1; done`. The rule blocks a harmless local wait and lets some CI
  polls through.
- An advisory false positive fired during this review: `ls tools/ci/ready-gate.mjs … 2>&1 | sed` produced
  "ready-gate.mjs is piped". The command only names the file; it does not run it.

## Findings
SEVERITY | path:line | problem | fix
---|---|---|---
HIGH | .claude/hooks/github-mcp-guard.sh:83-95 | MCP `merge_pull_request`/`enable_pr_auto_merge` are refused only when `receipt_check` fails. merge-gate.mjs "writes no receipt", so the door is shut only until someone hand-writes `artifacts/merge-gate/<pr>.json`. That file is unprotected (probe), and `gateFiles` hashes are just sha256 of tracked files, so they can be forged. bash-guard denies `gh pr merge` outright, so the two doors disagree. | Deny both tools unconditionally (policy: no session merges or arms) and drop the receipt branch. Keep the squash/rebase deny text.
HIGH | .claude/hooks/github-mcp-guard.sh:89 | `enable_pr_auto_merge` without an explicit MERGE method gets **ask**, not deny. A user click can therefore arm a merge, which contradicts "no session arms". | Change it to deny (this follows from the row above).
HIGH | .claude/hooks/protect-files.py (no rule) | The receipt paths `artifacts/{merge,ready,launch}-gate/**` are writable through Write/Edit/Bash. The ready flip, the merge door and the launch gate all trust a file the agent can type itself. | Add a protected-path rule for those three dirs (Write/Edit/Bash redirect, sed, tee, cp, mv); only the gate CLIs write them (they run as node, not a tool write). Add a test for each.
HIGH | .claude/hooks/launch-gate.py:59 | The receipt check only tests `page.sha256` against the hex regex. It never compares the hash to `artifacts/launch/self.json` `content_sha256` (written by launch-page.py), so a forged receipt passes (probe). | Require `page.sha256 == self.json.content_sha256` and `self.json.written_by == "launch-page.py"`, and `self.json.at` ≤ 120 s old.
MED | .claude/hooks/launch-gate.py:23 | Receipt reuse: one quota check authorises unlimited create_session calls for 120 s (probe: 2/2 allowed). | Consume the receipt on allow (rename it to `receipt.used.json`), or record `launches` and cap it at 1. For a fan-out, have launch-gate.mjs take `--count N`.
MED | settings.json:282 + bash-guard | Removing the `hold` label is unenforced on every route: `gh pr/issue edit --remove-label`, `gh api DELETE …/labels/hold` and MCP `issue_write` (not in any matcher) all pass. AGENTS.md says "whoever set it removes it". | Make hold removal an ask in shellparse.gh_issues/api_classify, and add `issue_write|add_issue_comment?` to the github matcher with a labels-diff check (ask when `hold` disappears).
MED | settings.json:282 | No guard covers `gh workflow run land.yml` or editing `.github/workflows/**`, `.claude/hooks/**`, `.claude/settings.json` or `tools/ci/{merge,ready,launch}-gate.mjs` (probes allowed). land.yml checks out the deploy branch (land.yml:196-198), so a PR cannot weaken its own gate, but nothing makes the change visible. | Add an ask in protect-files for these gate/infra paths, and an ask for land.yml dispatch in gated_workflow.
MED | .claude/hooks/shellparse.py:1162-1183 | Poll rule: any `seq` loop with `sleep` is blocked even when it watches nothing networked (tonight's bounded `for…sleep` false positive). Meanwhile `for i in 1 2 3; do gh pr checks…&&break; sleep 20; done` and `while ! curl …; sleep` pass. | Block only when POLL_WATCH matches. Treat seq/brace loops of N ≤ 10 with `break` as bounded. In the message, name `node tools/ci/wait-for.mjs` for local files first.
MED | AGENTS.md:147 vs .codex/hooks.json | AGENTS.md says "Codex runs none of these hooks (only the git pre-commit guard)", but `.codex/hooks.json` wires shell-guard.sh + mcp-guard.sh. The adapter's own header says host invocation is unproven. | State the fact: Codex hooks are configured and their host invocation is unverified. Cite the Codex hooks docs URL.
MED | .claude/hooks/shellparse.py:1141 | POLL_WATCH matches `fleet-bus read` and `who-is-on-it`; neither tool exists (tools/ci/ has no such file). This is a dead branch for a retired fleet. | Drop both alternatives.
MED | .claude/agents/agent-surface-reviewer.md:5 | maxTurns 30 against a 6-item checklist plus walkthrough. On a hook unit (bash-guard 724 lines + shellparse 2075) it hits the limit, and per its own line 92 a limit hit mid-call returns NOTHING. Seen tonight. | Raise it to 45 (the sonnet tier allows that), add "write the report by turn 25" to Limits, and exempt hook units from the walkthrough item.
MED | .claude/agents/README.md:44 | "A reporter's Bash can still write; no hook scopes that yet" is stale: protect-files blocks a bloat-auditor Bash redirect and agent-surface-reviewer sed/redirect (probes → 2). | Rewrite it: REPORTER scope covers Bash writes outside scratch/ and artifacts/.
LOW | .claude/hooks/merge_policy.py:54,64 | Ask texts name "your orchestrator" / "its orchestrator", a retired role. | Replace with "the PR's owner or Bryce" (the dispatcher re-owns the PR).
LOW | .claude/hooks/github-mcp-guard.sh:34-46,70 | `APEX_MERGE_DESK` / "orchestrator's environment" are retired concepts. The flag still silences the re-run ask. | Remove `desk` and use one rerun ask for everyone, or rename it to `APEX_RERUN_OK`.
LOW | .claude/hooks/launch-gate.py:4-18; launch-page.py:4; context-cap.py:4,12; foreign_push.py:122 | The comments narrate the retired orchestrator/fleet. foreign_push still exempts `orch*-queue` branches. | Trim the history to one dated line and drop the orchestrator queue-branch exemption if no such branch is live.
LOW | .claude/hooks/ui-fixer-uncommitted.sh | Its name and stamp reference the retired "UI fixer" role. The rule itself (dirty tree, last commit > 1 h old) is general and current. | Rename it to `uncommitted-nudge.sh` (settings.json + hooks-documented test).
LOW | shellparse.py:~401-456 (pipe advisory) | The `ready-gate.mjs is piped` advisory fires when the name merely appears as an argument (`ls …ready-gate.mjs | sed`). | Match only when argv[0] is node and argv[1] is the gate script.
LOW | .claude/agents/worker.md:143 | "a `hold` label on the PR stops a push" is unenforced, and it is wrong: hold is a land veto, not a push block. | Rewrite as "a `hold` label stops land.yml; never remove one you did not set".
LOW | .claude/agents/worker.md:18 | "Reuse the parent's matching capability receipt … supplied automatic recorder … host-visible bytes" is undefined jargon that no file explains. | Delete it or link the doc that defines it.
LOW | .claude/agents/README.md:15 + deploy-research.md:21 | Both mention "hosted TinyFish", but deploy-research's `tools:` has no `mcp__TinyFish`, so it is unreachable. | Add `mcp__TinyFish` to tools, or drop the mention.
LOW | .claude/agents/README.md:33 | "Parent keeps … deploy FF". There is no fast-forward deploy; GitHub lands PRs via land.yml. | Change it to "Parent keeps cache bump and the ready flip + `land` label".
LOW | .claude/agents/worker.md:7 | `tools:` lists playwright-official/chrome-devtools/js-debugger, which mcp-browser-guard always refuses in a subagent. Listing them costs schema tokens and gains nothing. | Drop the three local browser servers from the list.
LOW | settings.json:408 | The SubagentStop contract covers 7 agents. verify-agent, deploy-research and worker have fixed report shapes (worker: `WORKER <name>:`) but no check. | Add rows for worker and verify-agent to subagent-contract.py's table.
INFO | settings.json:249… | The `onFailure: "block"` field is load-bearing for 6 hooks (python-missing case). It was not re-verified against the current hooks docs this session. | Cite the docs URL in claude-config.md and keep the hooks-documented test pinning it.

Agents: every cited path exists. The suspects (`js/game/`, a top-level DEFECT-LEDGER) are deliberate negatives,
and `references/triage.md` resolves under skills/check-changes. Models and tiers match the README. No agent
routes to a retired agent (ci-watcher and merge-desk are gone; subagent-contract notes the removal).
ci-red-triage's tool list is right-sized; track-surveyor (Edit only, scoped) is right.

## Top 10 fixes
1. github-mcp-guard: make MCP merge and arm unconditional deny; drop the receipt branch and the arm "ask".
2. protect-files: deny Write/Edit/Bash writes to `artifacts/{merge,ready,launch}-gate/**`.
3. launch-gate.py: bind the receipt to launch-page.py's `self.json` content_sha256.
4. launch-gate: make the receipt single-use (or `--count N`).
5. Guard `hold` removal on gh, gh api and MCP issue_write (ask), so AGENTS.md's claim is true.
6. Poll rule: block only network-watching loops; allow bounded seq/brace loops with `break`.
7. agent-surface-reviewer: maxTurns 45 and a report-by-turn-25 rule.
8. Add an ask for edits to `.github/workflows/**`, `.claude/hooks/**`, settings.json and the gate CLIs, and for `gh workflow run land.yml`.
9. Fix the AGENTS.md:147 Codex-hooks claim and the README.md:44 stale Bash-scope line.
10. Retired-role sweep: APEX_MERGE_DESK, "orchestrator" texts, the fleet-bus/who-is-on-it regex, the ui-fixer name, worker.md:18 and :143, README "deploy FF".

COVERED: .claude/agents/*.md (11 + README; frontmatter, tools, paths, retired refs); hooks: bash-guard.sh,
github-mcp-guard.sh, merge_policy.py, protect-files.sh/.py (by probe), launch-gate.py, launch-page.py,
context-cap.py (header), stop-guard.sh, subagent-contract.py, ui-fixer-uncommitted.sh, mcp-browser-guard.sh
(header), shellparse.py (poll and pipe sections only); settings.json hooks/permissions/env; .mcp.json server
list; .codex/hooks.json + .codex/hooks/shell-guard.sh header. NOT read in depth: memory-sync.sh, post-edit.sh,
session-start.sh, skill-hint.py, lsp-hint.py, live-run.py, foreign_push.py body, the rest of shellparse.py
(~1900 lines), .codex/hooks/mcp-guard.sh body.
