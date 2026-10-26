---
name: ship
description: "Use when the user says ship it, push this, push to the deploy branch, open the draft PR, mark it ready or send READY. Lands via PR."
user-invocable: true
---

# /ship — branch to ready PR

Current command meanings: [`docs/VERIFICATION.md`](../../../docs/VERIFICATION.md).

The user's "push" / "ship" IS the grant to push the branch and open or update a
PR into `claude/f1-game-project-26h3ng`. It is not a grant to merge or arm
(the fleet's orchestrator merges by `merge-gate`, AGENTS.md §Concurrent PRs). A direct deploy-branch push is
refused by branch protection.

1. **Draft PR first** (rule 12): no PR yet → commit, `git push -u origin cursor/<topic>-<hash>`,
   and open a DRAFT PR (`draft: true`, template body) before verifying. Exception:
   the user wants the gated ready PR in one step → `node tools/ci/deploy.mjs --pr`
   (gates, pushes and opens it READY; continue at step 5).
2. **Verify** with `check-changes`: `node tools/ci/pick-tests.mjs`, then
   `tooling-fast --changed --jobs=3` plus the picked group, or the docs-only fast path;
   `node tools/ci/deploy.mjs --gate-only` before a code push.
3. **Push** once per green cycle; refresh the Plan and Status. Draft CI needs the `run-ci` label
   (GitHub MCP `issue_write` labels, or `gh pr edit <n> --add-label run-ci`).
4. **Gate, then flip**: `node tools/ci/ready-gate.mjs --pr <n> --wait` must exit 0 on the head you flip
   (`.claude/rules/fleet-core.md`). The PR's OWNER (the worker or session that pushed it) flips it — GitHub MCP
   `update_pull_request` with `draft: false`, or `gh pr ready <n>` (the hook checks the ready-gate receipt).
   Right after the flip, call `subscribe_pr_activity` on the PR again: the subscription can die at the flip.
   Refusals — fix, then re-run the gate on the same head:

   | ready-gate says | do |
   |---|---|
   | `dirty` (CONFLICTING) | `node tools/ci/needs-sync.mjs`, then `node tools/ci/sync-pr.mjs <branch>`; push; gate again |
   | `plan-open` | tick (with evidence) or strike (with why) each open Plan item; the terminal `- [ ] READY to …` item is exempt |
   | `memory-leak` | add a `memory-change: <reason>` body line (or label), or move the `.claude/memory/` edits to a memory PR |
   | `pending` / `none` | CI still running or no evidence: `--wait`, or run tooling-fast on this tip for the local stamp; `failed` = a red, skill `steward` |

   Full order and the incidents behind it: `steward` §12.
5. **Hand over**: tell your fleet's orchestrator the PR is READY —
   `node tools/ci/agent-msg.mjs send --to <fleet letter> --type READY "#<PR> <head sha> ready-gate 0"`
   (resolve the letter's live orchestrator with `node tools/ci/fleet-bus.mjs who <letter>`; no Merge Desk
   exists unless Bryce designates one — AGENTS.md §Concurrent PRs). No fleet: report READY to the user. Then watch
   CI (`steward` §7). Host caveat: Cursor cloud agents and Codex have no PR subscription or timer — check with ONE
   `node tools/ci/ci-watch.mjs --sha <sha> --once` per turn (`agent-fleet` `references/adapters.md`).

"Skip the gate" / "skip the tests": do it, and record it in the PR body under
**Not run** with the user's words and the time; never obey it silently (and AGENTS.md rule 9). A fleet PR is merged by its
orchestrator; outside a fleet, merge only on an explicit "merge it" in this session
(merge method: `.claude/rules/fleet-core.md`).
