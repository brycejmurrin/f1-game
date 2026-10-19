---
name: Apex cloud-agent launch
description: >-
  Use when launching a Cursor Auto cloud agent for Apex (f1-game): ship branch,
  prompt template, attachments, no twin agents.
---
# Apex cloud-agent launch

Use when launching a Cursor cloud agent for the Apex (f1-game) repo.

## Canonical checkout policy

Resolve [AGENTS.md](../../../../AGENTS.md),
[fleet-core](../../../../.claude/rules/fleet-core.md),
[launch policy](../../../../.claude/skills/agent-fleet/references/launch-policy.md),
and [merge authority](../../../../.claude/skills/agent-fleet/references/role-merge-holder.md)
from the target checkout root. Read those owners at the checkout revision for
ownership, launch constraints, readiness and merge/queue policy. Keep this
host's Auto model selector and environment mechanics below.

For a launch without a local checkout, resolve the requested `starting_ref`
to a commit SHA through GitHub MCP and read the same canonical paths there;
no local clone is needed. Cite that revision. Until fetched, checkout policy
is **unverified**. The installed plugin is a versioned adapter, not a policy
fallback or authorization to launch, push, mark ready or merge.

## Defaults
- Repo: `https://github.com/brycejmurrin/f1-game`
- **Cloud environment (required):** repo-linked **Apex 26** — [819b740b-ac05-11f1-b532-320a589b8025](https://cursor.com/dashboard/cloud-agents/environments/e/819b740b-ac05-11f1-b532-320a589b8025). Agents must boot from a **successful environment build** (`environment-info` → `build.resolution: "resolved"`). Do not launch against a blank/default environment (that skips `install` and misses `node_modules`, Chromium, MCP clones).
- **MCP (required for attached tools):** register **apex-tools**, **playwright-official**, **chrome-devtools** under [Integrations & MCP](https://cursor.com/agents) using the repo `bash tools/mcp/*` wrappers (see `.mcp.json`). Toggle **chrome-devtools** on in the launch MCP dropdown. `mcpServerAllowlist` must list a full launch pattern per name (`*bash tools/mcp/<wrapper>.sh …`) — not bare `bash` or `npx` for playwright. If the catalog is empty, use CLI fallbacks (`docs/AGENT-SURFACE.md` §Bootstrap).
- Ship branch / `starting_ref`: `claude/f1-game-project-26h3ng` (builds and config read `.cursor/environment.json` from this ref unless you override the ref in the environment dashboard).
- Topic heads: `cursor/<topic>-<hash>` (Cursor often supplies the suffix). No new `claude/<topic>` feature branches; legacy `claude/<topic>` PRs stay mid-flight.
- Model: `default` (Auto) **only**. Never invent other model ids. Do **not** fall back to an alternate model if Auto is blocked — tell the user and stop.
- Never clone the repo onto the box; cloud agent does coding.
- Host launch limit: max **6 launches / 10 min**.
- `node tools/ci/queue-depth.mjs` reports queue information; use checkout AGENTS.md and launch policy to interpret it. This adapter maintains no separate queue hold.

## Prompt template (fill gaps)
1. **Goal** — outcome, not line edits.
2. **Context** — symptoms, PR number/URL, attached files/images.
3. **Constraints** — include `OWNED:` / `FORBIDDEN:` globs, done-when, shot/test caps, and the exact line `Do not enable auto-merge or merge.` Read the canonical checkout owners above for draft/ready, sync, verification, push and watch requirements; include the task-specific lane and user grant.
4. **Success** — PR link or clear “no PR”; tests run / named not-run. Use the canonical checkout ready gate. Close-out must pass the stall/handoff gate in `docs/notes/AGENT-STALL-HANDOFF-SYNC-2026-10-05.md`.
5. Invite the agent to verify its own diagnosis.

## Attachments
- Screenshots → `images: [{url: file:///…}]`
- Exports/JSON/logs → `files: [{url: file:///…}]`

## After launch
- Tell the user with agent URL + cursor-agent card.
- FYI the owning specialty bot (priority false) with bc id + title.
- Do not launch a twin for the same PR/task; `reply` to the existing agent instead.
- Stall abort: 0 tools after 5–10 min, or <15 tools and no OWNED-path push past 10 min → cancel, alert owning lane + orchestrator.
