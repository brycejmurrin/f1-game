# Hooks, guards and permissions — security pass (2026-10-26)

Lane S5 of the 2026-10-26 system-audit implementation (PR #3785). Grant: Bryce, typed
2026-10-26 ~23:00 PT — "Fix hook or guard or perm", "Implement all ideas and improvements
now". Source findings: the audit artifact §4 (hooks table) and §10 (authority and security),
top-ten items 7 and 9.

## What changed

| area | before | after |
|---|---|---|
| curl / wget / `node -e` fetch / `python -c` to api.github.com | not parsed: a squash merge, a `git/refs` DELETE, a PR close all passed | `shellparse.http_issues` → `api_classify`, the `gh api` policy |
| `api_classify` (all doors) | merge, ready, refs, merges | + `merge-async`, `state=closed` on pulls/issues (ask), `update-branch` (ask), `contents/` writes (refused), pages/ci dispatches (ask), GraphQL `closePullRequest` (ask) and ref mutations (refused), JSON bodies (`"merge_method":"squash"`) |
| `APEX_MERGE_DESK=1` | in the shared `settings.json` env: every session's gh-api merge-by-id and ready flip passed silently | removed from the shared env (the orchestrator's environment sets it); it now skips only the MCP re-run prompt |
| MCP file writes | `push_files`, `create_or_update_file`, `create_branch` allowed and unhooked | denied in `settings.json`, and denied by `github-mcp-guard.sh` (the Cursor/Codex door) |
| MCP close / dispatch | `update_pull_request state=closed`, `actions_run_trigger run_workflow pages.yml` passed | ask |
| gate receipts | trusted any `ok` receipt (O23, 2026-10-20: an uncommitted `--pacing-override` in merge-gate.mjs wrote one) | the receipt records sha256 of merge-gate.mjs, ready-gate.mjs, gate-receipt.mjs; the hook refuses a mismatch or a gate file that differs from HEAD |
| merge-gate `mergeable_state: unknown` | refused the row on first read | re-read 3× (2, 4, 8 s) |
| shell poll loops | allowed | refused: a for, while or until loop that sleeps while running ci-watch, gh run, git log and the like, `seq … sleep`; `APEX_POLL_OK=1` for a bounded network retry |
| GUARD_TRIGGER | substring union (`kill` matched `.claude/skills`): ~250 ms on such calls | whole words: ~40 ms |
| subagent browser ban | blocked `--help` of `tools/shot/agent.mjs`, `verify-change.mjs` | `--help`/`-h` pass for a script that honours it (test-bg.mjs does not, and stays refused) |
| mcp-browser-guard | missed `apex_debug_chrome` start and the browser-use plugin | matched |
| lsp-hint | fired on SCREAMING_CASE env names | only a CapitalisedSymbol or `Head.member` |
| hook timeouts | protect-files (Write/Edit) had none (default 600 s) | every hook explicit |
| fleet-owner push lookup | 12–37 s measured (two sequential calls per open PR), timed out at the 20 s budget on every push | 1.7–2.7 s: page 1 of every uncached PR in one parallel curl, head+base-sha cache, no `pulls/<n>` call; stale claims ignored |

## Limits (what a hook cannot do)

- A receipt is a file: anything that can Write can forge one. The gate-file hash stops an
  edited gate, not a forger. Likewise any client the parser does not know (a script file
  run with `node x.mjs`, a variable URL) reaches the API unchecked.
- The egress proxy swaps any Authorization header for a GitHub App credential with repo
  admin. The real backstop is server-side, and only Bryce can set it: branch protection
  with `enforce_admins` (or a ruleset with a pull_request rule and no bypass) on
  `claude/f1-game-project-26h3ng`, and "Allow rebase merging" off at repo level.
- A hook timeout fails open unless `onFailure: "block"` (set on every guard here).

## Sources (read 2026-10-26)

- Claude Code hooks reference — default timeout 600 s for command hooks, `onFailure`,
  matcher regex rules, PreToolUse precedence `deny > defer > ask > allow`:
  https://code.claude.com/docs/en/hooks
- REST pulls (merge `PUT …/pulls/{n}/merge`, `merge-async`, `merge_method` merge|squash|rebase;
  update `PATCH …/pulls/{n}` with `state` open|closed):
  https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28
- REST git refs (`POST …/git/refs`, `PATCH|DELETE …/git/refs/{ref}`):
  https://docs.github.com/en/rest/git/refs?apiVersion=2022-11-28
- REST workflow dispatch (`POST …/actions/workflows/{id}/dispatches`):
  https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28#create-a-workflow-dispatch-event
