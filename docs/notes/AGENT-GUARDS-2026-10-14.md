# Agent guards and tooling — 2026-10-14

Prose-only safety rules from the 2026-10-14 agent-config survey, turned into
hooks, settings and tests. Docs read this session:
https://code.claude.com/docs/en/hooks (PreToolUse output, MCP matchers,
`onFailure`, `agent_id`/`agent_type`), https://learn.chatgpt.com/docs/agent-configuration/agents-md
(Codex `project_doc_max_bytes`, 32 KiB default), https://docs.github.com/en/actions/reference/limits
(Pro: 40 concurrent jobs, 5 macOS).

## What the hooks docs say (and what that decided)
- PreToolUse decides through `hookSpecificOutput.permissionDecision`
  (`allow`/`deny`/`ask`/`defer`) plus `permissionDecisionReason`; exit 2 is a deny.
  `"ask"` forces a prompt even in auto mode. Deny/ask RULES still apply whatever
  a hook returns.
- A matcher with characters other than letters, digits, `_ - , |` is an
  unanchored JS regex, so MCP matchers are written `^mcp__github__(a|b)$`.
- `onFailure: "block"` exists (Claude Code >= 2.1.295; this box runs 2.1.299).
  Without it a hook that crashes, exits non-0/2, or times out lets the call
  through. Every PreToolUse guard now sets it.
- Hook input carries `agent_id` and `agent_type` when the call comes from a
  subagent, so the track-surveyor scope (below) is enforceable.

## Changes
1. *(Correction 2026-10-14, later the same day: `.claude/settings.json` does
   NOT deny `merge_pull_request`; it routes it through `github-mcp-guard.sh`,
   which asks — see the matcher on `enable_pr_auto_merge|merge_pull_request|update_pull_request`.)*
   `settings.json`: `deny` merge_pull_request, delete_file, create_repository,
   fork_repository; `ask` push_files, create_or_update_file (an MCP commit skips
   the commit hook). `github-mcp-guard.sh` asks before enable_pr_auto_merge and
   before update_pull_request with `draft: false`, naming ready-gate.mjs and
   ready-full-cap.mjs; other PR edits pass silently. The merge METHOD is not
   checked (PR #1458 owns that policy).
2. `bash-guard.sh`: docs-integrity and test:guards run under
   `timeout $APEX_GUARD_TIMEOUT` (default 160 s, hook timeout 180 s); rc 124/137
   exits 2 with a reason. A ratchet step plus a 160 s run that still outlives the
   hook is now blocked by `onFailure` instead of passing.
3. Subagent browser ban: every `tools/shot/*.mjs` except the node-VM
   frame-report / cam-corners / cam-motion, `tools/ui/{layout-audit,menu-mock,css-play}.mjs`
   and `tools/gfx/gfx-probe.mjs` (each imports a Chromium launcher; checked by
   grep). `--help` / `--plan` stay open.
4. Fail-open paths print a WARNING on stderr (protect-files payload and
   shellparse failures, mcp-browser-guard payload failure) before exit 0.
5. Push guard: `shellparse.py push` reads every `git … push` shape (`-C`,
   `--no-pager`, `-c k=v`, `bash -c`, env prefixes, compound commands) and
   refuses force (`-f`, `--force`, `--force-with-lease`, `+refspec`), `--mirror`,
   `--delete`/`-d`/`:dst`, `--all`, and any push whose destination is
   `claude/f1-game-project-26h3ng` — named, `HEAD:` on it, or a bare push from
   it. Untokenisable text that looks like a push is refused. The settings deny
   globs stay as a second layer.
6. track-surveyor (`agent_type`) writes only `js/circuits/<id>.js`,
   `js/circuits/scenery/<id>.js`, `scratch/`, `artifacts/`; any id, because the
   assigned circuit lives in the parent's brief, which a hook cannot read.
7. Agents: ci-red-triage gets the GitHub MCP read tools its body names (test:
   every `mcp__` name in a body is in `tools:`, except a paragraph of "calls for
   the PARENT"); bloat-auditor loses WebFetch/WebSearch and moves to sonnet.
8. Budgets in agent-config.test.mjs. MEASURED TODAY: AGENTS.md is 30,114 B and
   root + js/track is 32,552 B (with joiners), so the planned 30,000 / 32,256 caps
   would be red. Caps sit at 30,200 and 32,768 (Codex's own cap); lower them
   when the AGENTS.md trim lands. Skill descriptions: 11,986 chars, cap 12,000,
   each <= 1,024. Five new routing-query files (5 should-fire + 3 near-miss).
9. pick-tests routes css/{carsetup,tokens,select}.css to `baseline`;
   cloudflared downloads to scratch/browser-http/; capacity comments say 40/5.

## Every host (2026-10-14, later)

The guards above were Claude Code hooks only, so Cursor, Codex and Grok Build
sessions committed and pushed unguarded (the multi-tool audit's top gap).
Now:

- `.cursor/hooks.json` (`beforeShellExecution`, which Cursor cloud agents also
  run from the repo — cursor.com/docs/agent/hooks) and `.codex/hooks.json`
  (`PreToolUse` on `Bash`; Codex loads project hooks only once the project
  and hook are trusted — third-party docs, not yet verified on Codex itself)
  run `.cursor/hooks/shell-guard.sh`, which feeds `bash-guard.sh` Claude's
  payload shape. Exit 2 blocks in all three hosts.
- `.githooks/pre-commit` (the commit gate: docs-only → docs-integrity, else
  ratchet auto-raise + `test:guards`) and `.githooks/pre-push` (no deploy
  branch, no delete, no rewrite) bind any host that runs git — Grok Build
  included. pre-commit stands aside under `CLAUDECODE=1`; the adapter sets
  `APEX_COMMIT_GATE=githook` so bash-guard leaves commits to it.
- ACTIVE via package.json `prepare` (`git config core.hooksPath .githooks`),
  which every host's `npm install` / `npm ci` runs — approved by Bryce in
  session 2026-10-14. A clone with no install: run that one command.
  `tests/unit/cross-tool-guards.test.mjs` pins all of the above.

## Not done
- Hook tests for stop-guard / post-edit / session-start (survey A10).
- No Cursor/Codex hook adapter: these guards are Claude Code only.

## Red-team round 2 (2026-10-14)
Input: the red-team table at `scratch/retest/hooks-redteam.md` (189 payloads piped into the hooks, plus
two direct `shellparse.py push` probes; nothing pushed, merged or launched). The same harness, re-pointed at
this tree: **71 bypasses before, 13 after, 0 false positives both times**; the 13 left are the by-design gaps
below. Cases live in `tests/unit/bash-guard-hardening.test.mjs` ("round 2" tests), must-pass shapes included.

1. **`gh` in Bash** (`shellparse.gh_issues`): `gh pr merge --squash|-s|--rebase|-r`, and a `gh api` REST
   merge or GraphQL `mergePullRequest`/`enablePullRequestAutoMerge` naming SQUASH/REBASE → `deny`. Any other
   `gh pr merge` (incl. `--auto`), `gh pr ready` (not `--undo`), `gh api` PUT/POST `…/pulls/<n>/merge`,
   a pull PATCH with `draft=false`, GraphQL `markPullRequestReadyForReview`, `POST …/merges` or a write to
   `…/git/refs` → `ask`, skipped with `APEX_MERGE_DESK=1` (squash/rebase still denied). The reason texts
   live in `.claude/hooks/merge_policy.py`, imported by both bash-guard and github-mcp-guard, so the two
   doors say the same words. **No settings.json `ask` rule** was added for `gh`: a permission rule would
   also prompt Merge Desk, which the hook deliberately lets through; the hook's `ask` is the gate.
2. **Subagent browser ban on the parsed argv** (`shellparse.browser_starts`): quotes removed, `sh|bash -c
   [--]`, `-ec`, `-o opt`, `eval`, here-strings and `echo|printf '…' | bash` unwrapped, `env [-S]`,
   `setsid`, `flock [-c]`, `timeout`, `nice`, `ionice`, `xargs` peeled, `cd`/`pushd` tracked so a relative
   script resolves. New spellings: `npm t|tst`, `npm run-script`, `npm --silent test`, `npm run test`,
   `npm exec [--] playwright test`, `npx [--yes|-y|-c] playwright test`, `node_modules/.bin/playwright`,
   `@playwright/test/cli.js`, `tools/mcp/mcp-cli.mjs`, and `apex-tools-mcp.sh|.mjs call <browser apex_*>`.
   The regex on SCAN survives only as the fallback for text the parser cannot tokenise.
3. **Push**: `@`→HEAD, `heads/` and `refs/heads/` stripped from source and destination, any `*` refspec,
   `--prune`, git's unambiguous long-option prefixes (an option is read as every option it could abbreviate:
   `--forc`, `--force-w`, `--mirr`, `--dele`, `--al`, `--bran(ches)`), `-c push.default=matching|current`,
   `-c remote.*.push`, `-c remote.*.mirror`, the same config in git for a bare push, and aliases: a verb that
   is not a git builtin is looked up in the inline `-c alias.X=` (then `git config alias.X`) and the
   expansion — `!shell` aliases included — is read as what it runs (`shellparse.git_commands`).
4. **Commit detection** gets the same unwrapping and alias expansion (`git -c alias.ci=commit ci`,
   `bash <<<`, `| sh`, `bash -o pipefail -c`). bash-guard now makes ONE `shellparse.py guard` call for
   push, gh, the browser ban and the commit reading (it was five python processes): median of 20 typical
   payloads, loadavg ≈ 29, **bash-guard 720 → 405 ms**, protect-files unchanged (~95 ms).
5. **mcp-browser-guard**: `agent_type` marks a subagent like `agent_id`; `apex_hud_mock` joins the hook list
   and the settings matcher (a test now derives the list from `tools/mcp/apex-tools-mcp.mjs`'s CATALOG:
   `kind: "browser"` or `week: 2`, plus `apex_job_start`). An unreadable payload now BLOCKS (exit 2): the
   hooks docs promise nothing about a garbled payload, it cannot say whether a subagent sent it, and a false
   positive costs one retried MCP call while a false negative is a second Chromium under the parent's run.
6. **protect-files** resolves `realpath` before every rule and takes the repo root from it, so a link outside
   the repo onto `version.json` is the generated file. Cheap write channels added: `rm`/`unlink`/`shred`
   operands, `awk -i inplace`, `npm pkg set|delete|fix` (package.json), `pushd` as `cd`.
7. **track-surveyor via Bash**: `rm`/`unlink`/`rmdir`/`shred` operands and `mv` sources are checked against
   the circuit-pair scope; `git stash` (but list/show), `reset --hard|--merge|--keep`, `clean` (but `-n`),
   `switch`, `checkout <branch>|-b`, `merge`, `rebase`, `pull`, `cherry-pick`, `revert`, `am`, `apply`
   block outright (they rewrite the whole tree).
8. **github-mcp-guard**: any falsy `draft` (`false`, `0`, `"0"`, `"no"`, `"off"`, any case) asks; a
   squash/rebase method in any spelling (`"Squash-merge"`, `["squash"]`) is denied; under Merge Desk,
   `enable_pr_auto_merge` must name `MERGE` (an omitted method is the repo default) or it asks.

### Out of scope by design (a PreToolUse hook cannot see them)
Interpreter one-liners (`python3 -c "os.system('git push -f')"`, `node -e fs.writeFileSync`), values from
variables or command substitution (`G=git; $G push`, `F=-f; git push $F`, `cd "$(…)"`), stdin-fed
arguments (`echo +HEAD:deploy | xargs git push origin`), `cat script | bash` with a non-literal source,
raw HTTP (`curl -X PUT …/pulls/12/merge`), `git send-pack`, and `git apply`/`patch`. The backstop is
GitHub branch protection on the deploy branch (`enforcement_level: non_admins`, so an admin token still
bypasses it) and the PR review that every deploy needs.
9. **A passing commit says which path it took.** bash-guard's stderr is hidden on exit 0, so after a green
   commit the model could not tell docs-integrity-only from the full `test:guards` run. It now prints ONE
   PreToolUse JSON object on exit 0 with `hookSpecificOutput.additionalContext` (reaches the model as a
   system reminder next to the tool result) and `systemMessage` (shown to the user), naming the path and
   its duration; no `permissionDecision`, so the allow is unchanged. A `gh` ask/deny on the same command
   merges into the same object (stdout is parsed only when it is a single JSON object).
   Docs: https://code.claude.com/docs/en/hooks ("Add context for Claude", universal `systemMessage`).
