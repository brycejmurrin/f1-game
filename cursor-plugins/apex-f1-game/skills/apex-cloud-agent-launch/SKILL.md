---
name: Apex cloud-agent launch
description: >-
  Use when launching a Cursor cloud agent for Apex (f1-game): ship branch,
  the Cursor brief (LSP, numbered gate, handoff fence, no labels), no twin agents.
---
# Apex cloud-agent launch

Use when launching a Cursor cloud agent for the Apex (f1-game) repo. The lane contract is `docs/WORKERS.md` §Per vendor. This skill only says how to launch.

## Defaults
- Repo: `https://github.com/brycejmurrin/f1-game`
- **Cloud environment (required):** repo-linked **Apex 26** — [819b740b-ac05-11f1-b532-320a589b8025](https://cursor.com/dashboard/cloud-agents/environments/e/819b740b-ac05-11f1-b532-320a589b8025). Agents must boot from a **successful environment build** (`environment-info` → `build.resolution: "resolved"`). Do not launch against a blank/default environment (that skips `install` and misses `node_modules`, Chromium, MCP clones).
- **MCP (required for attached tools):** register all six repo servers (**apex-tools**, **playwright-official**, **chrome-devtools**, **js-debugger**, **apex-lsp**, **browserstack**) under [Integrations & MCP](https://cursor.com/agents) using the repo `bash tools/mcp/*` wrappers (see `.mcp.json`). Enable each in the launch MCP dropdown. `mcpServerAllowlist` must list a full launch pattern per name (`*bash tools/mcp/<wrapper>.sh …`) — not bare `bash` or `npx` for playwright. Optional **browser-use** plugin MCP uses `mcpPluginServerAllowlist` (Integrations plugin + launch toggle). If the catalog is empty, use CLI fallbacks (`docs/AGENT-SURFACE.md` §Bootstrap).
- Ship branch / `starting_ref`: `claude/f1-game-project-26h3ng` (builds and config read `.cursor/environment.json` from this ref unless you override the ref in the environment dashboard).
- Topic heads: `cursor/<topic>-<hash>`. No new `claude/<topic>` feature branches.
- Model: `default` for a manual launch. A dispatcher launch uses `hosts.cursor.model` in `tools/ci/dispatch.json`. Do not invent a model id. If the chosen model is blocked, tell the user and stop.
- `hosts.cursor.enabled` is often false. Prefer `node tools/ci/dispatch.mjs` when it is true. Otherwise Bryce must have named this launch in chat.
- Launch caps and quota: `docs/WORKERS.md` §The dispatcher and `tools/ci/dispatch.json`. `queue-depth.mjs` is informational and returns exit 0 for either queue verdict; its output does not block a launch or push.
- At most 6 launches per 10 minutes. One owner per wave for `tools/manifest.cjs`, `tests/groups.json`, and `tests/data/frozen-globals.json`. No twin for an open PR that already touches the same paths.
- One self-contained `ready` issue per agent when one exists (WORKERS §Per vendor). An open-ended hunt still gets OWNED and FORBIDDEN paths.

## Prompt (inline; no file:// paths)
Paste a short brief. It must contain every line below, with the gaps filled.

1. Grant: who named the launch, and the Pacific time.
2. `OWNED:` and `FORBIDDEN:` globs. Done-when is one draft PR or BLOCKED.
3. `Prefer MCPs. Symbols: get_mcp_tools once for apex-lsp, then lsp_outline, lsp_definition (read the body), lsp_callers. Grep only comments, docs, and CSS. lsp_diagnostics once after the edit, before tests. JS debugger only after a unit test fails. Do not spawn task_v2 scouts.`
4. `Gate, in this order, once: edit; npm run gen; the one spec pick-tests names; tooling-fast --changed --jobs=3 --quiet; commit; push. Repeat only when GitHub says CONFLICTING.`
5. `Write the handoff fence yourself (branch, head, verified, not-run, next). Put run-ci and lane:cursor in next:. Do not add labels, claim, comment, or open issues. Do not call subscribe_github_ci, subscribe_github_pr, or subscribe_pr_activity. A CI notification is not a new task. Stop when the draft is pushed and the fence is current. Never merge.`
6. Soft $10. At the cap or about 3 hours or 3 CI rounds: push, refresh the fence, put `needs-owner` in `next:`, end BLOCKED.

Before launch, check: live Cursor count, `hosts.cursor.enabled`, OWNED overlap with open PRs, and that the brief contains the LSP line and the do-not-subscribe line.

## After launch
- Tell the user the agent URL.
- One steer per state change. A steer restates the stop and the numbered gate. A steer that only says "prefer MCP" is not a steer.
- Do not cancel a GitHub Actions run. Do not stay subscribed waiting on the agent.
