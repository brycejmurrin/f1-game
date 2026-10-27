---
name: Apex cloud-agent launch
description: >-
  Use when launching a Cursor Auto cloud agent for Apex (f1-game): ship branch,
  issue claim, prompt template with the handoff block, attachments, no twin agents.
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
- Launch caps, quota checks, and role permissions: use `docs/WORKERS.md` §The dispatcher and `tools/ci/dispatch.json` (the hourly dispatcher launches; caps, quota and whether the Cursor host is enabled live there). `queue-depth.mjs` is informational and returns exit 0 for either queue verdict; its output does not block a launch or push.
- One self-contained `ready` issue per agent (WORKERS §Per vendor: Cursor takes self-contained issues only).

## Prompt template (fill gaps)
1. **Issue** — `#<n>` and its outcome, not line edits. First step: the claim comment `claims #<n> — cursor:<agent id>` (an older claim wins: stand down).
2. **Context** — symptoms, attached files/images.
3. **Constraints** — `OWNED:` / `FORBIDDEN:` globs, done-when, shot/test caps, and the exact line `Do not enable auto-merge or merge.` Sync = merge `origin/claude/f1-game-project-26h3ng` only when AGENTS.md §Git branch & deploy says so; never rebase or force-push. Local verification = the floor in `docs/WORKERS.md` §3. Push once per green local cycle. No timers or CI poll loops.
4. **Hand-off** — a DRAFT PR at the first commit (template body, `Closes #<n>`, `lane: cursor`) whose ```handoff block is kept current (`docs/WORKERS.md` §The Hand-off block); the dispatcher sets `run-ci` and `land` from it. The run ends at ready, after `node tools/ci/ready-gate.mjs --pr <n>` exits 0 on the draft head.
5. Invite the agent to verify its own diagnosis.

## Attachments
- Screenshots → `images: [{url: file:///…}]`
- Exports/JSON/logs → `files: [{url: file:///…}]`

## After launch
- Tell the user with agent URL + cursor-agent card.
- Do not launch a twin for a claimed issue or an owned PR; comment on that issue or PR instead.
- Stall abort: 0 tools after 5–10 min, or <15 tools and no OWNED-path push past 10 min → cancel, and add `needs-owner` to its PR so the dispatcher launches one takeover (docs/WORKERS.md).
