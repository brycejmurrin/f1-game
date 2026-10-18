# Stop hook H1 — Bryce applies in `~/.claude` (#2662)

Repo side for memory-sync is already shipped (H2, `memory-sync.sh` + `tests/unit/memory-sync.test.mjs`). The harness Stop hook (`~/.claude/stop-hook-git-check.sh`, wired from `launcher-settings.json`) still nags when:

1. `.claude/memory/*` is dirty after `memory-sync.sh` save (files the agent must not commit).
2. The agent holds a push while CI is live on the pushed tip (AGENTS.md rule 4).

This note is the **user-home** half. Do not commit changes under `~/.claude` from the repo; paste the diff below into your local script.

## Marker: `.claude/push-hold`

While CI on the **already-pushed** tip is still running, touch an empty marker in the repo (not committed):

```sh
touch .claude/push-hold
```

Remove it before the next push:

```sh
rm -f .claude/push-hold
```

Add to the repo `.gitignore` (one line) so the marker never dirties `git status`:

```
.claude/push-hold
```

## Ready-to-apply diff (`~/.claude/stop-hook-git-check.sh`)

```diff
-git status --porcelain
+git status --porcelain -- . ':(exclude).claude/memory' ':(exclude).claude/push-hold'
@@ before the "unpushed commits" check
+# push held for live CI on the pushed tip (AGENTS.md rule 4)
+[ -f "$ROOT/.claude/push-hold" ] && exit 0
```

(`$ROOT` must already be set to `CLAUDE_PROJECT_DIR` in your script — same as the retro note.)

## Repo reference + test

- Reference implementation: `tests/fixtures/stop-hook-git-check.sample.sh` (not wired by the harness).
- Unit test: `tests/unit/bash-guard-hardening.test.mjs` subtest **H1** (memory exclude + `push-hold`).

Fixes #2662 (docs + test; Bryce applies H1 locally).
