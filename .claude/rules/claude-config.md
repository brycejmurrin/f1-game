---
paths:
  - ".claude/**"
---

# .claude/ config — loads with .claude/

- Hooks (`.claude/hooks/**`) and `.claude/settings*.json`: a PR that edits them needs the `config-ok` label, which
  Bryce applies himself (merge-gate's `config` row reads the label event's actor, not a message).
- The deny and ask lists live in `.claude/settings.json` (`permissions.deny`, `permissions.ask`); a denied tool is
  refused outright, an asked one waits for Bryce in an attended session and is unavailable in a worker.
- Memory: `.claude/memory/` is restored one way at SessionStart (`memory-sync.sh restore`; the repo copy wins); edits
  to it belong in a memory-focused PR unless Bryce grants a combined one (`ready-gate` flags them on other PRs).
- Skills and agents live under `.claude/skills` / `.claude/agents`; keep the Codex mirror with
  `bash tools/env/mirror-skills.sh`. Never fork under `.cursor/skills/` or `.cursor/agents/`.
- One home per rule: a rule sentence lives in one file and others link to it
  (`tests/unit/rulebook-guards.test.mjs`; map in `docs/notes/RULEBOOK-REWRITE-2026-10-26.md`).

## Hooks (wired by `.claude/settings.json`)

A refusal's message says what to do instead; that message is the rule.

- `session-start.sh` installs deps, builds `BUILT_PATHS`, restores memory and prints the orientation line.
- `protect-files.sh` (Write/Edit/MultiEdit/NotebookEdit) refuses a hand edit of a generated file (AGENTS.md rule
  11). The one hatch: an untracked `.claude/allow-protected` a MAIN session creates for the assigned edit and
  removes after (a subagent cannot create one; every guarded call announces an active hatch).
- `bash-guard.sh` (Bash) refuses `pkill -f` / `killall` and PID kills of unlisted processes, a browser run inside a
  subagent, `git commit --no-verify` / `-n`, a `core.hooksPath` change, and `gh run cancel` / `gh pr merge` /
  `gh pr ready`; `mcp-browser-guard.sh` refuses the MCP browser tools inside a subagent and a second browser beside
  a live one; `github-mcp-guard.sh` refuses a session merge or arm and a draft→ready flip without a fresh
  ready-gate receipt. `.githooks/pre-commit` owns `test:guards` for every host (AGENTS.md rule 12);
  `.githooks/pre-push` refuses force pushes, branch deletes and deploy-branch pushes.
- `context-cap.py` (Agent) advises on live context against the brief's `STOP AT` and refuses spawns over the hard
  cap; `subagent-contract.py` flags a reporter agent's malformed report.
- Advisory: `post-edit.sh` (a `js/` edit that does not parse or staled a generated file), `lsp-hint.py` (the
  apex-lsp call after a bare-symbol grep), `memory-sync.sh` (SessionStart restore only).
