# Apex 26 custom subagents

Markdown agents with YAML frontmatter under `.claude/agents/`. Claude Code and
Cursor both load this path (Cursor also accepts `.cursor/agents/`; we keep the
single Claude tree to avoid drift).

| Agent | Use when |
|---|---|
| **deploy-research** | Post-deploy liveness, shipped-JS marker checks, public-web / track reference research via tinyfish. Read-only; no Chrome or Playwright. |
| **verify-agent** | Run `tools/verify-change.mjs --fast` against the current tree and report the JSON verdict. WGX edits also get `wgx-validate.mjs --static`. Read-only; never starts Playwright / `--wait` / `test-solo`; names leftover `batches` as notRun. |
| **track-surveyor** | Survey + improve ONE circuit: writes only that `js/circuits/<id>.js`, verifies with `verify-track.cjs`, reports baseline deltas instead of moving them. No browser runs. |
| **doc-drift-auditor** | Read-only docs-vs-code audit of ONE assigned doc. Returns `DOC-DRIFT` rows; no edits. |
| **physics-contract-auditor** | Read-only `vstd-lint` + `Tracks.curvature` column classification (AI-only / assist-gated / broadcast / surface). No Playwright. |
| **worktree-regression-check** | Read-only “is this failure pre-existing?” — `verify-change --fast` on an ephemeral worktree vs the session SHA / deploy tip. Never `--wait`. |

**Token routing:** prefer these over attaching fat skills. Deploy/version →
`deploy-research` (not full `mcp-probe`). Pre-push verify → `verify-agent`.
One circuit → `track-surveyor`. One stale doc → `doc-drift-auditor`.
Curvature / PACE semantics → `physics-contract-auditor`. Same-red on tip →
`worktree-regression-check`. Parent keeps edits, cache bump, and deploy FF.

Skills (workflows) live in `.claude/skills/`. Canonical rules live in
`AGENTS.md`. Which CLIs are wrapped as `apex_*`: `docs/AGENT-SURFACE.md`.
New agents must be listed here and remain trackable
(`.gitignore` allowlists `!.claude/agents/`).

Frontmatter (Cursor `https://cursor.com/docs/subagents`): `name` (matches the
filename), `description` (what + when), `model: inherit` unless a specific
model is justified. `readonly: true` for research/verify agents;
`is_background: true` when the job is a long verify/fetch that must not hold
the parent. `tests/unit/skill-progressive.test.mjs` asserts name/description/model.
