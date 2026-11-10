# Agent memory — what persists between sessions (2026-09-24, rewritten 2026-11-03)

Kind: how-to · Re-measure-by: 2027-01-15

Supersedes the "auto memory structurally cannot persist here" finding in
`SELF-IMPROVING-SURFACE-2026-09-22.md`: it can, with two settings and a hook.
Rewritten 2026-11-03 (docs/plans/2026-11-03-agent-surface-reset.md §4.9, D-001):
one reviewed store, restored one way; the three-way sync, its baseline dir and
the `assume-unchanged` mark are retired.

## The stores

| store | where | loaded | written by |
|---|---|---|---|
| Instructions | `AGENTS.md` (via `CLAUDE.md`), `docs/WORKERS.md`, `.claude/rules/` (by `paths:`) | every session | people, reviewed |
| Decisions | `docs/DECISIONS.md` (`D-NNN` rows) | when a rule or test cites one | a PR, one row per decision |
| Measured facts | the doc that uses them; a note with `Kind:` + `Re-measure-by:` | when cited | a PR; `tools/docs/knowledge-gc.mjs` flags an overdue re-measure |
| Preferences (auto memory) | tracked: `.claude/memory/`; Claude live: `~/.claude/projects/<repo>/memory/` | every host reads the tracked copy; Claude also loads the first 200 lines / 25 KB of `MEMORY.md` | people and Claude, through a PR |

Coordination behaviour (merge commits, the `hold` label, `land`, subscribe, PT,
phone-first) lives in AGENTS.md §Coordination and `docs/WORKERS.md` — never in
the memory index (`agent-config.test.mjs` refuses the keywords there).

## One-way restore (the design since 2026-11-03)

- **The tracked `.claude/memory/` is the only store.** `session-start.sh` runs
  `memory-sync.sh restore`: copy `.claude/memory/*.md` into the live auto-memory
  dir before the first prompt, overwriting what is there (the repo wins). That
  is the whole hook: no `save` on PostToolUse or Stop, no baseline directory
  under `artifacts/`, no three-way merge, no `git update-index --assume-unchanged`
  mark and therefore no `bash-guard` unmark before git verbs.
- **A preference Bryce states in chat is committed like any doc edit.** The
  session writes the topic file and its `MEMORY.md` line in the repo (`npm run
  memory:*` or a plain edit), on a PR carrying the `memory-change: <reason>`
  body line or label that `ready-gate` reads. A decision gets a `docs/DECISIONS.md`
  row instead; a dated platform fact becomes a note with `Re-measure-by:`.
- **Why.** The two-writer design (live dir and branch) needed a baseline, a
  line-merge and two incident fixes (#2128, #2873) to stop a resumed session
  reverting another branch's memories. With one writer none of that exists;
  Cursor and Codex already read the tracked copy only.
- **Cap.** `MEMORY.md` stays ≤ 25 lines (Claude loads ≤ 200 lines / 25 KB; a
  short index is read in full). Topics: preferences and corrections about how
  Bryce works, typed `user` / `feedback` / `project` / `reference`, each with
  `source:` when it rests on a file (`agent-config.test.mjs` fails when the
  cited path is gone).

## Cross-host commands (Claude / Cursor / Codex)

One store: `.claude/memory/`. Do not fork a second copy under `.agents/` or
`.cursor/`. Everywhere the files show in `git status` like any other tracked path.

```sh
npm run memory:list                 # index lines + orphan topic files
npm run memory:show -- <file.md>    # print one topic
npm run memory:retire -- <file.md>  # drop topic + its MEMORY.md index line
# same as: node tools/env/apex-memory.mjs <list|show|retire> …
```

## `memory-change:` — ready-gate intent marker

`node tools/ci/ready-gate.mjs --pr <n>` refuses `.claude/memory/` edits unless
the PR has either a body line `memory-change: <reason>` (non-empty reason) or
the GitHub label `memory-change`. A bare word "memory" or a path mention of
`.claude/memory/MEMORY.md` does **not** unlock the gate. A failed PR-files API
fetch fails closed.

## Why auto memory needed wiring (measured on this box, CLI 2.1.281)

1. **Off in cloud sessions by default.** The CLI returns "off" when
   `CLAUDE_CODE_REMOTE` is set unless `CLAUDE_CODE_DISABLE_AUTO_MEMORY` is
   falsy; `.claude/settings.json` carries `"env": {"CLAUDE_CODE_DISABLE_AUTO_MEMORY": "0"}`.
2. **The location cannot be moved from the repo.** `autoMemoryDirectory` must be
   absolute and is ignored in checked-in project settings; written into
   `settings.local.json` by a SessionStart hook it is read too late for the
   first prompt (measured). A symlinked memory dir made the model refuse to
   write through it.
3. **So a hook copies (Claude only).** The restore above; measured: the restored
   entry was recalled on turn one. Cloud only (`CLAUDE_CODE_REMOTE=true`) unless
   `APEX_MEMORY_SYNC=1`: a laptop's memory dir already persists and is personal.

Claude worktrees share the main checkout's live store; the restore reads the
checkout the session booted in.

## Rules

- Memories are committed, so they are reviewed like code; `agent-config.test.mjs`
  keeps the index under 200 lines, requires a typed frontmatter per topic file,
  rejects secret-shaped strings, forbids duplicate index→file links, AGENTS.md
  §Coordination keyword restatements in the index, and `type: project` topics with a
  "Stale check" note.
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
