---
name: mcp-probe
description: Use when driving the LIVE game or the DEPLOYED site interactively with the Chrome DevTools MCP or the tinyfish MCP — booting the working tree to render a 3D frame or poke __apex live (the interactive alternative to writing a scratch/*.mjs), heap/perf/console inspection during a bug hunt, or a post-deploy liveness check that GitHub Pages is serving the expected build. For UI-layout matrix review use survey-ui-matrix (canvas hidden); for a repeatable batch screenshot in CI use playwright-probe.
---

# Probing the live game with the MCPs

Interactive instruments beside the Playwright suite: **Chrome DevTools MCP**
(working tree, canvas-visible) and **tinyfish** (deployed GitHub Pages / public
web). Unified entry: `tools/probe-mcp.py` (`chrome_*` / `tinyfish_*`).

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
4. SwiftShader WebGPU is a **lifecycle** oracle, not a visual one.
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
