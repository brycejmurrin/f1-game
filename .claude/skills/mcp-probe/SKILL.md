---
name: mcp-probe
description: Use when driving the LIVE working-tree canvas or the DEPLOYED site interactively with Chrome DevTools MCP or tinyfish — poke __apex live, heap/perf/console during an interactive repro. Routine post-deploy version.json STALE check → deploy-research. Batch screenshots → playwright-probe. Scripted hooks → agent-view. UI-layout matrix → survey-ui-matrix (canvas hidden).
---

# Probing the live game with the MCPs

Two upstream MCP servers sit alongside the Playwright suite: **Chrome DevTools MCP**
(working tree, canvas-visible) and **tinyfish** (deployed GitHub Pages / public
web). The test suite is 112 Playwright specs + 100 `node --test` unit suites. Unified entry: `tools/probe-mcp.py` (`chrome_*` / `tinyfish_*`).

## Entry

```sh
python3 tools/probe-mcp.py list-tools
python3 tools/probe-mcp.py chrome-start          # REQUIRED for multi-call chrome
python3 tools/probe-mcp.py call chrome_...
python3 tools/probe-mcp.py chrome-stop           # ALWAYS before test-bg.mjs
./tools/tinyfish-mcp.sh deploy-check             # live vs local version.json
node tools/mcp-cli.mjs probe --backend webgpu --wait 12000 --eval '...'
```

A bare `call` without `chrome-start` spawns a **fresh** Chromium each time —
navigate → evaluate → screenshot across separate calls is broken. Prefer host
MCP `chrome_*` / `tinyfish_*` when the session catalog has them; use shell
wrappers for `deploy-check` / `deploy-js --marker` / `mcp-cli probe` batching.

| Need | Use |
|---|---|
| Live canvas / `__apex` / screenshot | Chrome via probe (`http://127.0.0.1`, not github.io) |
| Deployed artifact / public web | tinyfish / `deploy-research` subagent |
| UI matrix (canvas hidden) | `survey-ui-matrix` |
| Batch CI screenshots | `playwright-probe` |
| Deep MCP playbook | `docs/research/CHROME-DEVTOOLS-MCP.md` |

## Hard rules (always)

1. **Never render Chrome MCP while Playwright runs** — park to `about:blank`,
   then `chrome-stop`, then check CPU; see `references/traps.md` §1.
2. **github.io is tinyfish-only** from this container (egress proxy).
3. **`snapCam()` after `jump()`/`park()` only** — never after `orbit()`/`view()`.
4. SwiftShader WebGPU **executes** — real WGX pixels come from
   `node tools/wgx-capture.mjs <track>` (offscreen mode), never from
   screenshots of the WGX canvas (headless present is blank, and the first
   `getCurrentTexture()` kills `mapAsync` device-wide).
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
