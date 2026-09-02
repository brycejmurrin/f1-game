---
name: mcp-probe
description: Use when driving the LIVE working-tree canvas interactively with the Chrome DevTools MCP (chrome_*) or the probe-mcp.py chrome daemon — poke __apex live, heap/perf/console during an interactive repro. Anything on the DEPLOYED site / public web (version.json STALE check, shipped-marker grep) → deploy-research. Batch screenshots → playwright-probe. Scripted hooks → agent-view. UI-layout matrix → survey-ui-matrix (canvas hidden).
---

# Probing the live game with the Chrome MCP

One MCP server sits alongside the Playwright suite for live poking:
**chrome-devtools** (`chrome_*`, working tree, canvas-visible, WebGPU flags
from `webgpu-chrome-args.cjs`). The deployed site / public web is **not**
reachable from a container browser — that is the **deploy-research** subagent
(host fetch / WebFetch). `tools/probe-mcp.py` is a CLI (not MCP-attached since
2026-09) whose `chrome-start` daemon keeps ONE Chromium alive across `call`s.

## Entry

```sh
python3 tools/probe-mcp.py list-tools
python3 tools/probe-mcp.py chrome-start          # REQUIRED for multi-call chrome
python3 tools/probe-mcp.py call chrome_...
python3 tools/probe-mcp.py chrome-stop           # ALWAYS before test-bg.mjs
node tools/mcp-cli.mjs probe --backend webgpu --wait 12000 --eval '...'
```

A bare `call` without `chrome-start` spawns a **fresh** Chromium each time —
navigate → evaluate → screenshot across separate calls is broken. Prefer the
attached `chrome_*` tools when the session catalog has them; use the shell
daemon or `mcp-cli probe` batching otherwise.

Keep **`apex-tools` in root `.mcp.json`** so Cloud/Claude/this agent can load
it. Cursor CLI also has `.cursor/mcp.json` (lockstep). If this session's host
catalog is empty, use `./tools/apex-tools-mcp.sh call` or the daemon above.
`version.json` / public web is subagent `deploy-research`. Do not attach this
skill for a version.json STALE check.

Wrap map: `docs/AGENT-SURFACE.md` (apex-tools vs this skill vs deploy-research
vs playwright-official).

| Need | Use |
|---|---|
| Local CLI wrap (`--fast`, shot/eval, pick-tests) | `apex-tools` / `./tools/apex-tools-mcp.sh` — not `chrome_*` |
| Live canvas / `__apex` / screenshot | `chrome_*` / `probe-mcp.py chrome-start` (`http://127.0.0.1`, not github.io) |
| Deployed artifact / public web | `deploy-research` subagent (host fetch / WebFetch) — never a container browser |
| Interactive host Chromium | repo MCP **playwright-official** (`browser_*`) — never with this Chrome |
| UI matrix (canvas hidden) | `survey-ui-matrix` — `browser_resize` / `browser_snapshot` / `browser_evaluate` |
| Batch CI screenshots | `playwright-probe` |
| Deep MCP playbook | `docs/research/CHROME-DEVTOOLS-MCP.md` |

## Hard rules (always)

1. **Never render Chrome MCP while Playwright runs** — park to `about:blank`,
   then `chrome-stop`, then check CPU; see `references/traps.md` §1.
2. **github.io is unreachable from any container browser or curl** (egress
   proxy) — `deploy-research` with the host fetch tool is the only path.
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
- Chrome setup, A/B ports, heap/perf, post-deploy recipes → read
  [`references/recipes.md`](references/recipes.md).
- Renderer probe flags (`--backend`, secure context, `gfxBound`) →
  `references/recipes.md` § Renderer.

## One-line summary

Playwright asserts the tree in batch; Chrome looks at the working tree live;
deploy-research looks at the deploy; never let Chrome render while Playwright runs.
