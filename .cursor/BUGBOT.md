# Apex 26 — Bugbot review rules

Short, concrete gates for PR review. Prefer **blocking** only when the change
violates a hard repo contract; use **non-blocking** for missing evidence that
can still ship with an explicit "not run" note.

## Repo rules live elsewhere

Review against the canonical rules, not a copy here: merge authority, the `hold` label, ready and sync
rules are in `AGENTS.md` §Coordination and `docs/WORKERS.md`; coding conventions,
the generated-file list (AGENTS.md rule 11), the zero-dependency IIFE module layout and the size
ratchets are in `.claude/rules/game-code.md` and `AGENTS.md`. Do not restate or invent merge
strategies, branch names, deploy steps or model ids that those files do not contain.
## Hot-path evidence (blocking when absent)

Flag WebGL / physics / hot-path edits under `js/physics/`, `js/game.js`, or
`js/render/` when the PR body lacks **measured numbers** or a **named verify
command** (e.g. `npm test -- tests/specs/…`, `verify-track`, `test:tooling-fast`,
`deploy.mjs --gate-only`). Non-blocking if the body names the check as not-run
with a reason.

## Keep short

Stay under 30k characters. Prefer one clear finding over a checklist dump.
