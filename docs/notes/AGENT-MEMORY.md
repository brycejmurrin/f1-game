# Agent memory — what persists between sessions (2026-09-24)

Supersedes the "auto memory structurally cannot persist here" finding in
`SELF-IMPROVING-SURFACE-2026-09-22.md`: it can, with two settings and a hook.

## The three stores

| store | where | loaded | written by |
|---|---|---|---|
| Instructions | `AGENTS.md` (via `CLAUDE.md`), `.claude/rules/` | every session | people, reviewed |
| Subagent memory | `.claude/agent-memory/<agent>/` (`memory: project`) | that subagent | the subagent; schema + expiry pinned by `agent-config.test.mjs` |
| Auto memory | live: `~/.claude/projects/<repo>/memory/`; tracked copy: `.claude/memory/` | main session: first 200 lines / 25 KB of `MEMORY.md` | Claude, automatically (types `user`, `feedback`, `project`, `reference`) |

## Why auto memory needed wiring (measured on this box, CLI 2.1.281)

1. **Off in cloud sessions by default.** The CLI returns "off" when
   `CLAUDE_CODE_REMOTE` is set unless `CLAUDE_CODE_DISABLE_AUTO_MEMORY` is
   falsy. A nested `claude -p` here reported no memory section by default and a
   memory dir once `.claude/settings.json` carried
   `"env": {"CLAUDE_CODE_DISABLE_AUTO_MEMORY": "0"}`.
2. **The location cannot be moved from the repo.** `autoMemoryDirectory` must be
   absolute and is ignored in checked-in project settings; written into
   `settings.local.json` by a SessionStart hook it is read too late for the
   first prompt (measured). A symlinked memory dir made the model refuse to
   write through it.
3. **So a hook copies.** `memory-sync.sh restore` (from `session-start.sh`)
   copies `.claude/memory/*.md` into the live dir before the first prompt —
   measured: the restored entry was recalled on turn one. `memory-sync.sh save`
   (PostToolUse on Write/Edit, and Stop) copies the live dir back, so memories
   ride the session's next commit. Cloud only (`CLAUDE_CODE_REMOTE=true`) unless
   `APEX_MEMORY_SYNC=1`: a laptop's memory dir already persists and is personal.
4. **Both directions are a three-way sync (2026-10-02).** The first `save`
   copied every differing live file over the repo and deleted repo files the
   session lacked, so a resumed session whose live dir predated a branch
   checkout reverted other sessions' memories (twice in one day). Now each sync
   compares against a baseline in `artifacts/.memory-base/`: only the side that
   changed a file moves it, `MEMORY.md` is line-merged when both added lines,
   and a topic file changed on both sides keeps the repo copy and prints
   `CONFLICT`. `tests/unit/memory-sync.test.mjs` drives the real hook.

## Rules

- Memories are committed, so they are reviewed like code; `agent-config.test.mjs`
  keeps the index under 200 lines, requires a typed frontmatter per topic file,
  and rejects secret-shaped strings.
- Never auto-write `AGENTS.md`; promote a repeated lesson to a hook or test.
- Opt out on one machine: `"env": {"CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"}` in
  `.claude/settings.local.json`.

Sources: [memory docs](https://code.claude.com/docs/en/memory),
[tools reference](https://code.claude.com/docs/en/tools-reference).

## Citing the evidence (2026-10-14)

A memory may carry `source: <path>[, <path>…]` in its frontmatter (top level
or under `metadata:`): the file the fact rests on. `agent-config.test.mjs`
fails when a cited path is gone, so a memory whose evidence moved is rewritten
or deleted instead of recalled — the static half of GitHub Copilot Memory's
citation check. Non-path entries (`user`, `#1519`) are allowed and unchecked.
The same test file rejects zero-width and bidi characters in every memory and
instruction file (the "Rules File Backdoor" vector). Why:
[SECOND-BRAIN-2026-10-14.md](SECOND-BRAIN-2026-10-14.md).
