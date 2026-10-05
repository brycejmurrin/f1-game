---
name: mcp-probe
description: "Use when driving the LIVE working-tree canvas interactively with the Chrome DevTools MCP (chrome_*) or the probe-mcp.py chrome daemon — poke __apex live, heap/perf/console during an interactive repro. Anything on the DEPLOYED site / public web (version.json STALE check, shipped-marker grep) → deploy-research. Batch screenshots or a scripted game-loop CPU profile → playwright-probe. Scripted hooks → agent-view. UI-layout matrix → survey-ui-matrix (canvas hidden)."
---

# Probing the live game with the Chrome MCP

One MCP server sits alongside the Playwright suite for live poking:
**chrome-devtools** (`chrome_*`, working tree, canvas-visible, WebGPU flags
from `tools/lib/webgpu-chrome-args.cjs`). The deployed site / public web is **not**
reachable from a container browser — that is the **deploy-research** subagent
(host fetch / WebFetch). `tools/mcp/probe-mcp.py` is a CLI (not MCP-attached since
2026-09) whose `chrome-start` daemon keeps ONE Chromium alive across `call`s.

## Entry

```sh
python3 tools/mcp/probe-mcp.py status                # no browser: clone/bin/Chrome path + daemon UP/DOWN. Run FIRST
#   "Bin: missing" -> tools/mcp/chrome-devtools-mcp.sh clone  (needs egress; else use the attached chrome_* tools)
# Everything below launches Chromium (browser-only) except `help` (a subcommand: `--help`/`-h` exit 2), status, mcp-cli --dry-run:
python3 tools/mcp/probe-mcp.py list-tools
python3 tools/mcp/probe-mcp.py chrome-start          # REQUIRED for multi-call chrome
python3 tools/mcp/probe-mcp.py call chrome_...
python3 tools/mcp/probe-mcp.py chrome-stop           # ALWAYS before test-bg.mjs
node tools/mcp/mcp-cli.mjs probe --backend webgpu --wait 12000 --eval '...'
```

HUD/menu glitch repro: serve `python3 -m http.server 3456`, `chrome-start`, navigate
`http://127.0.0.1:3456/`, `__apex.race(id); go()` (recipes.md § Setup; `step(1/60, 120)` past the start lights before reading a gap — the
HUD gaps are `#hud-gap-ahead` / `#hud-gap-behind`, cross-check `__apex.field()`), then
`take_snapshot` (DOM/a11y text, cheap) before any screenshot; the HUD is DOM, so
`awaitPresent()` matters only if the 3D behind it must be current. Done = the
glitch reproduced as a snapshot/`evaluate_script` value (element text/rect), then
`navigate_page about:blank` + `chrome-stop`. Flags: `node tools/lib/webgpu-chrome-args.cjs [mcp|json]`.

A bare `call` without `chrome-start` spawns a **fresh** Chromium each time —
navigate → evaluate → screenshot across separate calls is broken. Prefer the
attached `chrome_*` tools when the session catalog has them; use the shell
daemon or `mcp-cli probe` batching otherwise.

Keep **`apex-tools` in root `.mcp.json`** so Cloud/Claude/this agent can load
it. Cursor CLI also has `.cursor/mcp.json` (lockstep). If this session's host
catalog is empty, use `./tools/mcp/apex-tools-mcp.sh call` or the daemon above.
`version.json` / public web is subagent `deploy-research`. Do not attach this
skill for a version.json STALE check.

Wrap map: `docs/AGENT-SURFACE.md` (apex-tools vs this skill vs deploy-research
vs playwright-official).

| Need | Use |
|---|---|
| Local CLI wrap (`--fast`, shot/eval, pick-tests) | `apex-tools` / `./tools/mcp/apex-tools-mcp.sh` — not `chrome_*` |
| Live canvas / `__apex` / screenshot | `chrome_*` / `probe-mcp.py chrome-start` (`http://127.0.0.1`, not github.io) |
| Deployed artifact / public web | `deploy-research` subagent (host fetch / WebFetch) — never a container browser |
| Interactive host Chromium | repo MCP **playwright-official** (`browser_*`) — never with this Chrome |
| UI matrix (canvas hidden) | `survey-ui-matrix` — `browser_resize` / `browser_snapshot` / `browser_evaluate` |
| Batch CI screenshots | `playwright-probe` |
| Deep MCP playbook | `docs/research/CHROME-DEVTOOLS-MCP.md` |

## Hard rules (always)

1. **Never render Chrome MCP while Playwright runs** — park to `about:blank`,
   then `chrome-stop`, then check CPU; see [`references/traps.md`](references/traps.md) (chrome / camera / scene slices).
2. **github.io is unreachable from any container BROWSER** — `chrome-devtools`
   fails every external HTTPS with `net::ERR_CERT_AUTHORITY_INVALID` (Chrome does
   not trust the agent proxy's CA; measured 2026-09-15). That error means "wrong
   tool for this URL", not a flag bug: route it to `deploy-research`, which owns
   the curl-vs-fetch rule (curl for exact bytes such as `<meta name="apex-sha">`,
   the fetch tool for `version.json` and prose; measured 2026-09-18).
3. **`snapCam()` after `jump()`/`park()` only** — never after `orbit()`/`view()`.
4. SwiftShader WebGPU **executes** — visible WGX pixels come from the soft-present
   2D blit on `#game` (`gfx-probe.mjs` / `GLX.awaitSoftPresent()`, or from a live
   `chrome_*` session `await __apex.awaitPresent()` — same wait, no need to know
   `GLX` is a bare global), not from the hidden swapchain canvas. HeadlessChrome
   GLX (and TLX-WebGPU) hide `#game` and blit onto `#game-soft` —
   `awaitSoftPresent()`/`awaitPresent()` then capture that overlay, never
   `locator("#game").screenshot()`. Primary probe:
   `node tools/gfx/gfx-probe.mjs --backend webgpu <track>` (aliases
   `wgx-capture.mjs` / `wgx-lavapipe-probe.mjs` forward here — prefer the parent).
   Never call `getCurrentTexture()` on software adapters. TLX:
   `gfx-probe.mjs --backend three` (WebGL2 pin). Cloud env packages:
   `AGENTS.md` §Cursor Cloud; `../../../docs/notes/CI-RENDERING-PERFORMANCE.md`
   §Cursor Cloud.
5. Long fetch/search → `deploy-research` subagent, not the parent context.

**Chrome-client pick one:** attached `chrome_*` / `probe-mcp.py chrome-start` for
live canvas; `mcp-cli.mjs probe --backend …` for batched renderer recipes;
`cdmcp-cli.py` for lighting/shot recipes. Do not start a second Chrome client
beside an active Playwright run. UI matrix → `layout-audit.mjs` (not the archived
`ui-readable-survey-mcp.py`).

## Load on demand

- Shot / lighting / camera comparison failures → open the slice directly:
  [`references/traps-chrome.md`](references/traps-chrome.md) (Playwright vs Chrome
  MCP, park to `about:blank`, CPU starve), [`references/traps-camera.md`](references/traps-camera.md)
  (`snapCam` / free-cam / chase / rAF), [`references/traps-scene.md`](references/traps-scene.md)
  (soft-present, lights, `scene()`, occlusion); [`references/traps.md`](references/traps.md)
  is only the 13-line index of those three.
- Chrome setup, A/B ports, heap/perf, post-deploy recipes → read
  [`references/recipes.md`](references/recipes.md).
- Renderer probe flags (`--backend`, secure context, `gfxBound`) →
  `references/recipes.md` § Renderer.

## One-line summary

Playwright asserts the tree in batch; Chrome looks at the working tree live;
deploy-research looks at the deploy; never let Chrome render while Playwright runs.
