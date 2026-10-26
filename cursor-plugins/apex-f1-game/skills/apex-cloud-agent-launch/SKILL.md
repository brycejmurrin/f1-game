---
name: Apex cloud-agent launch
description: >-
  Use when launching a Cursor Auto cloud agent for Apex (f1-game): ship branch,
  prompt template, attachments, no twin agents.
---
# Apex cloud-agent launch

Use when launching a Cursor cloud agent for the Apex (f1-game) repo.

## Defaults
- Repo: `https://github.com/brycejmurrin/f1-game`
- **Cloud environment (required):** repo-linked **Apex 26** — [819b740b-ac05-11f1-b532-320a589b8025](https://cursor.com/dashboard/cloud-agents/environments/e/819b740b-ac05-11f1-b532-320a589b8025). Agents must boot from a **successful environment build** (`environment-info` → `build.resolution: "resolved"`). Do not launch against a blank/default environment (that skips `install` and misses `node_modules`, Chromium, MCP clones).
- **MCP (required for attached tools):** register all six repo servers (**apex-tools**, **playwright-official**, **chrome-devtools**, **js-debugger**, **apex-lsp**, **browserstack**) under [Integrations & MCP](https://cursor.com/agents) using the repo `bash tools/mcp/*` wrappers (see `.mcp.json`). Enable each in the launch MCP dropdown. `mcpServerAllowlist` must list a full launch pattern per name (`*bash tools/mcp/<wrapper>.sh …`) — not bare `bash` or `npx` for playwright. Optional **browser-use** plugin MCP uses `mcpPluginServerAllowlist` (Integrations plugin + launch toggle). If the catalog is empty, use CLI fallbacks (`docs/AGENT-SURFACE.md` §Bootstrap).
- Ship branch / `starting_ref`: `claude/f1-game-project-26h3ng` (builds and config read `.cursor/environment.json` from this ref unless you override the ref in the environment dashboard).
- Topic heads: `cursor/<topic>-<hash>` (Cursor often supplies the suffix). No new `claude/<topic>` feature branches; legacy `claude/<topic>` PRs stay mid-flight.
- Model: `default` (Auto) **only**. Never invent other model ids. Do **not** fall back to an alternate model if Auto is blocked — tell the user and stop.
- Never clone the repo onto the box; cloud agent does coding.
- Launch caps, quota checks, and role permissions: use the current `.claude/skills/agent-fleet/references/launch-policy.md`. `queue-depth.mjs` is informational and returns exit 0 for either queue verdict; its output does not block a launch or push.
- Ship-checkpoint freeze: no sync **pushes** or **merges** while freeze is on.

## Prompt template (fill gaps)
1. **Goal** — outcome, not line edits.
2. **Context** — symptoms, PR number/URL, attached files/images.
3. **Constraints** — include `OWNED:` / `FORBIDDEN:` globs, done-when, shot/test caps, and the exact line `Do not enable auto-merge or merge.` Draft PR unless asked. Stay in lane (UI/cars/tracks/perf/audio/net). Sync = merge `origin/claude/f1-game-project-26h3ng`; never rebase or force-push. Pre-push = `npm run test:tooling-fast` plus pick-tests Structural guards. Push once per green local cycle. No CI poll loops (`ci-watch.mjs` / CI Watch, not `sleep` / `gh run view`).
4. **Success** — PR link or clear “no PR”; tests run / named not-run. Mark ready only after the tip is green and `node tools/ci/ready-gate.mjs --pr <n>` exits 0. Close-out must pass the stall/handoff gate in `docs/notes/AGENT-STALL-HANDOFF-SYNC-2026-10-05.md`.
5. Invite the agent to verify its own diagnosis.

## Attachments
- Screenshots → `images: [{url: file:///…}]`
- Exports/JSON/logs → `files: [{url: file:///…}]`

## After launch
- Tell the user with agent URL + cursor-agent card.
- FYI the owning specialty bot (priority false) with bc id + title.
- Do not launch a twin for the same PR/task; `reply` to the existing agent instead.
- Stall abort: 0 tools after 5–10 min, or <15 tools and no OWNED-path push past 10 min → cancel, alert owning lane + orchestrator.
