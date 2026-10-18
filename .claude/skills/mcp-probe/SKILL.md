---
name: mcp-probe
description: "Use when driving the LIVE working-tree canvas interactively with the Chrome DevTools MCP (chrome_*) or the probe-mcp.py chrome daemon — poke __apex live, heap/perf/console during an interactive repro. Deployed site / version.json → deploy-research. Batch screenshots / scripted profiles → playwright-probe. Scripted hooks → agent-view. UI-layout matrix → survey-ui-matrix."
---

# Probing the live game with the Chrome MCP

One MCP server sits alongside the Playwright suite for live poking:
**chrome-devtools** (`chrome_*`, working tree, canvas-visible, WebGPU flags
from `tools/lib/webgpu-chrome-args.cjs`). `tools/mcp/probe-mcp.py` is a CLI (not
MCP-attached since 2026-09) whose `chrome-start` daemon keeps ONE Chromium alive across `call`s.
The deployed site, `version.json` and the public web are **deploy-research** (table below).

**Pick one client:** the session lists attached `chrome_*` tools → use them and start
no daemon; it does not → `probe-mcp.py chrome-start` then `call` (a bare `call` without
it spawns a fresh Chromium each time, so navigate → evaluate → screenshot breaks).

## Entry

```sh
python3 tools/mcp/probe-mcp.py status                # no browser: clone/bin/Chrome path + daemon UP/DOWN. Run FIRST
#   "Bin: missing" -> tools/mcp/chrome-devtools-mcp.sh clone  (needs egress; no egress = use the attached chrome_* tools, no daemon)
# Everything below launches Chromium (browser-only) except help/status/mcp-cli --dry-run:
python3 tools/mcp/probe-mcp.py list-tools
python3 tools/mcp/probe-mcp.py chrome-start          # REQUIRED for multi-call chrome
python3 tools/mcp/probe-mcp.py call chrome_...
python3 tools/mcp/probe-mcp.py chrome-stop           # ALWAYS before test-bg.mjs
node tools/mcp/mcp-cli.mjs probe --backend webgpu --wait 12000 --eval '...'
```

HUD/menu glitch repro: serve `python3 -m http.server 3456`, `chrome-start`, navigate
`http://127.0.0.1:3456/`, `__apex.race(id); go()` ([references/chrome.md](references/chrome.md)), then
`take_snapshot` (DOM/a11y text, cheap) before any screenshot; the HUD is DOM, so
`awaitPresent()` matters only if the 3D behind it must be current. Done = the
glitch reproduced as a snapshot/`evaluate_script` value (element text/rect), then
`navigate_page about:blank` + `chrome-stop`. Flags: `node tools/lib/webgpu-chrome-args.cjs [mcp|json]`.
Heap leak across races, console errors → [chrome.md](references/chrome.md)
§Heap leak across N races (`take_heapsnapshot` needs `filePath`; `list_console_messages`).

Keep **`apex-tools` in root `.mcp.json`** so Cloud/Claude/this agent can load
it. Cursor CLI also has `.cursor/mcp.json` (lockstep). If this session's host
catalog is empty, use `./tools/mcp/apex-tools-mcp.sh call` or the daemon above.

Wrap map: `docs/AGENT-SURFACE.md` (apex-tools vs this skill vs deploy-research
vs playwright-official).

| Need | Use |
|---|---|
| Local CLI wrap (`--fast`, shot/eval, pick-tests) | `apex-tools` / `./tools/mcp/apex-tools-mcp.sh` — not `chrome_*` |
| Live canvas / `__apex` / screenshot | `chrome_*` / `probe-mcp.py chrome-start` (`http://127.0.0.1`, not github.io) |
| Deployed site / `version.json` / long web research | `deploy-research` subagent (host fetch / WebFetch) — github.io is unreachable from any container BROWSER (egress proxy; Chrome rejects its CA); `curl` works for shell bytes ([web-egress.md](references/web-egress.md)) |
| Interactive host Chromium | repo MCP **playwright-official** (`browser_*`) — never with this Chrome |
| UI matrix (canvas hidden) | `survey-ui-matrix` — `browser_resize` / `browser_snapshot` / `browser_evaluate` |
| Batch CI screenshots | `playwright-probe` |
| Deep MCP playbook | `docs/research/CHROME-DEVTOOLS-MCP.md` |

## Hard rules (always)

1. **Never render Chrome MCP while Playwright runs** — park to `about:blank`,
   then `chrome-stop`, then check CPU; see [`references/traps.md`](references/traps.md) (chrome / camera / scene slices).
2. **`snapCam()` after `jump()`/`park()` only** — never after `orbit()`/`view()`.
3. SwiftShader WebGPU **executes**; pixels come from the soft-present blit, never the
   hidden swapchain: `await __apex.awaitPresent()` in a live session, or
   `node tools/gfx/gfx-probe.mjs --backend webgpu <track>` (TLX: `--backend three`).
   Never call `getCurrentTexture()` on software adapters. Commands and traps:
   [`references/renderer.md`](references/renderer.md).
4. **Image budget** (plan WS4; #2399): `Read` at most 8 images, then compact; never re-`Read` an old shot; JPEG ≤ 800 px wide for anything a model will look at; for more than 3 shots use `apex_shot_survey` / `apex_track op survey`. A request over 32 MB kills the session and `/compact` with it.

Other clients: `mcp-cli.mjs probe --backend …` for batched renderer recipes;
`tools/mcp/cdmcp-cli.py` for lighting/shot recipes. Do not start a second Chrome client
beside an active Playwright run. UI matrix → `tools/ui/layout-audit.mjs` (not the archived
`ui-readable-survey-mcp.py`).

## Load on demand

- Shot / lighting / camera comparison failures → read
  [`references/traps.md`](references/traps.md), or its slice directly:
  [traps-chrome.md](references/traps-chrome.md) (Playwright vs Chrome MCP),
  [traps-camera.md](references/traps-camera.md) (`snapCam` / free-cam),
  [traps-scene.md](references/traps-scene.md) (soft-present / lights / `scene()`).
- HUD/DOM stops updating (pit stop, lap change) → [`references/hud-freeze.md`](references/hud-freeze.md).
- Chrome setup, A/B ports, heap/perf → [`references/chrome.md`](references/chrome.md).
- Public-web research → [`references/research.md`](references/research.md).
- Real-device reports → [`references/device-report.md`](references/device-report.md).
- Offline capability checks → [`references/offline.md`](references/offline.md).
- The complete recipe index → [`references/recipes.md`](references/recipes.md).
- Renderer probe flags (`--backend`, secure context, `gfxBound`) →
  [`references/renderer.md`](references/renderer.md).

Chrome DevTools naming: use `chrome_click` for the underlying `click` action.

## One-line summary

Playwright asserts the tree in batch; Chrome looks at the working tree live;
deploy-research looks at the deploy; never let Chrome render while Playwright runs.
