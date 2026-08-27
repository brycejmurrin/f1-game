---
name: mcp-probe
description: Use when driving the LIVE working-tree canvas or the DEPLOYED site interactively with Chrome DevTools MCP or tinyfish — poke __apex live, heap/perf/console during an interactive repro. Routine post-deploy version.json STALE check → deploy-research. Batch screenshots → playwright-probe. Scripted hooks → agent-view. UI-layout matrix → survey-ui-matrix (canvas hidden).
---

# Probing the live game with the MCPs

Two upstream MCP servers sit alongside the Playwright suite: **Chrome DevTools MCP**
(working tree, canvas-visible) and **tinyfish** (deployed GitHub Pages / public
web). The test suite is 115 Playwright specs + 135 `node --test` unit suites. Unified entry: `tools/probe-mcp.py` (`chrome_*` / `tinyfish_*`).

## Entry

```sh
python3 tools/probe-mcp.py list-tools
python3 tools/probe-mcp.py chrome-start          # REQUIRED for multi-call chrome
python3 tools/probe-mcp.py call chrome_...
python3 tools/probe-mcp.py chrome-stop           # ALWAYS before test-bg.mjs
./tools/tinyfish-mcp.sh deploy-check --tip        # live vs deploy-branch tip
node tools/mcp-cli.mjs probe --backend webgpu --wait 12000 --eval '...'
```

A bare `call` without `chrome-start` spawns a **fresh** Chromium each time —
navigate → evaluate → screenshot across separate calls is broken. Prefer host
MCP `chrome_*` / `tinyfish_*` when the session catalog has them; use shell
wrappers for `deploy-check` / `deploy-js --marker` / `mcp-cli probe` batching.

Keep **`apex-tools` in root `.mcp.json`** so Cloud/Claude/this agent can load
it. Cursor CLI also has `.cursor/mcp.json` (lockstep). If this session's host
catalog is empty, use `./tools/apex-tools-mcp.sh call`, the wrappers above, or
subagent `deploy-research` for `version.json` / public web. Do not attach
this skill for a version.json STALE check.

Wrap map: `docs/AGENT-SURFACE.md` (apex-tools vs this skill vs TinyFish vs host playwright).

| Need | Use |
|---|---|
| Local CLI wrap (`verify-track`, `--fast`, shot/eval) | `apex-tools` / `./tools/apex-tools-mcp.sh` — not `chrome_*` |
| Live canvas / `__apex` / screenshot | Chrome via probe (`http://127.0.0.1`, not github.io) |
| Deployed artifact / public web | tinyfish / `deploy-research` subagent |
| Interactive host Chromium | repo MCP **playwright** (`browser_*` via `tools/playwright-mcp.sh`) — never with this Chrome |
| UI matrix (canvas hidden) | `survey-ui-matrix` — `browser_resize` / `browser_snapshot` / `browser_evaluate` |
| Batch CI screenshots | `playwright-probe` |
| Deep MCP playbook | `docs/research/CHROME-DEVTOOLS-MCP.md` |

## Hard rules (always)

1. **Never render Chrome MCP while Playwright runs** — park to `about:blank`,
   then `chrome-stop`, then check CPU; see `references/traps.md` §1.
2. **github.io is tinyfish-only** from this container (egress proxy).
3. **`snapCam()` after `jump()`/`park()` only** — never after `orbit()`/`view()`.
4. SwiftShader WebGPU **executes** — visible WGX pixels come from the soft-present
   2D blit on `#game` (`gfx-probe.mjs` / `GLX.awaitSoftPresent()`), not from the
   hidden swapchain canvas. Readback oracle: `node tools/wgx-capture.mjs <track>`
   → `frame.png` (optional; never call `getCurrentTexture()` on software
   adapters — it breaks `mapAsync` device-wide). Lavapipe A/B:
   `wgx-lavapipe-probe.mjs` (needs `mesa-vulkan-drivers`). TLX:
   `gfx-probe.mjs --backend three` (WebGL2 pin). Cloud env packages:
   `AGENTS.md` §Cursor Cloud; `docs/research/CI-RENDERING-PERFORMANCE.md`
   §Cursor Cloud.
5. Long fetch/search → `deploy-research` subagent, not the parent context.

## Load on demand

- Shot / lighting / camera comparison failures → read
  [`references/traps.md`](references/traps.md) (numbered war stories).
- Chrome setup, A/B ports, heap/perf, tinyfish recipes → read
  [`references/recipes.md`](references/recipes.md).
- Renderer probe flags (`--backend`, secure context, `gfxBound`) →
  `references/recipes.md` § Renderer.

## One-line summary

Playwright asserts the tree in batch; Chrome looks at the working tree live;
tinyfish looks at the deploy; never let Chrome render while Playwright runs.
