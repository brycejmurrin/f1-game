---
name: mcp-probe
description: "Use when poking the live game in Chrome through the DevTools MCP (__apex, console, network, heap, performance), or recovering the private chat MCP tunnel or gateway. Not for: breakpoints → js-debugger; the deployed site → deploy-research; batch screenshots → playwright-probe; scripted hooks → agent-view."
---

# Probing the live game with the Chrome MCP

One MCP server sits alongside the Playwright suite for live poking:
**chrome-devtools** (working tree, canvas-visible, WebGPU flags
from `tools/lib/webgpu-chrome-args.cjs`). Tool names differ by client: Claude
Code attaches them as `mcp__chrome-devtools__<tool>` (e.g.
`mcp__chrome-devtools__evaluate_script`); the probe-mcp.py CLI and the apex
docs call the same tools `chrome_<tool>`. `tools/mcp/probe-mcp.py` is a CLI (not
MCP-attached since 2026-09) whose `chrome-start` daemon keeps ONE Chromium alive across `call`s.
The deployed site, `version.json` and the public web are **deploy-research** (table below).

**Pick one client:** use the attached `mcp__chrome-devtools__*` tools when the session lists them;
otherwise use one persistent CLI daemon, then `call`. `chrome-start` requires
`tmux`; on a host without it, use the owned foreground-daemon procedure in
[offline preflight](references/offline.md). A bare `call` without a daemon
spawns a fresh Chromium each time, so navigate → evaluate → screenshot breaks.

## Entry

No browser — run these FIRST (safe beside a Playwright run):

```sh
python3 tools/mcp/probe-mcp.py status                # local bin/Chrome path + daemon UP/DOWN
bash tools/mcp/apex-tools-mcp.sh call apex_status '{}' # follow next.action/reason; prerequisites can pass while occupancy says wait
# "Bin: missing" alone is not a blocker: the wrapper uses its pinned npm fallback.
# Checkout dependencies and Chromium are required; an uncached npm fallback needs egress.
# Clone/build is optional server-development work, not routine probe setup.
```

Browser — each launches Chromium (only `mcp-cli.mjs --dry-run` does not); never beside a live Playwright run:

```sh
python3 tools/mcp/probe-mcp.py list-tools
python3 tools/mcp/probe-mcp.py chrome-start          # tmux path; refused while a Playwright run is live
python3 tools/mcp/probe-mcp.py call chrome_...
python3 tools/mcp/probe-mcp.py chrome-stop           # stop a daemon started with chrome-start; foreground mode: see offline.md
node tools/mcp/mcp-cli.mjs probe --backend webgpu --wait 12000 --eval '...'
```

HUD/menu glitch repro: serve `python3 -m http.server 3456`, `chrome-start`, navigate
`http://127.0.0.1:3456/`, `await __apex.race(id); __apex.go()` (`id` from `__apex.tracks()`) ([references/chrome.md](references/chrome.md)
§Setup: `race()` is a promise, and `go()` before it settles finds no grid), then
`take_snapshot` (DOM/a11y text, cheap) before any screenshot; the HUD is DOM, so
`awaitPresent()` matters only if the 3D behind it must be current. Done = the
glitch reproduced as a snapshot/`evaluate_script` value (element text/rect), then
`navigate_page about:blank` + `chrome-stop`. Flags: `node tools/lib/webgpu-chrome-args.cjs [mcp|json]`.
Heap leak across races, console errors → [chrome.md](references/chrome.md)
§Heap leak across N races (`take_heapsnapshot` needs `filePath` under the repo's `artifacts/`,
never `/tmp`; `list_console_messages`). `obs()`/`physState()` return `null` until the player
exists: awaited `race()` + `go()`, then `jump()` (+ `snapCam()`) or `step()`. `null` = not
initialised, not broken.
Heap/CPU while a **js-debugger** session is attached to that page → its `debugger_profile` (one owner per page).

**Census tools** (measured before/after for phone memory, heap growth, CPU-side
copies and GPU budgets):
`node tools/perf/runtime-memory.mjs`, `tools/perf/vm-leak-census.mjs`,
`tools/gfx/mem-census.mjs` (scripted track-switch heap-snapshot compare),
`tools/perf/mesh-census.mjs` and `tools/perf/garage-census.mjs` (flags in
each file's header); `tools/perf/profile.mjs` / `query.mjs` for game-loop CPU. Record
track and backend (`__apex.diag().env.backend`) with every number, cite MB
deltas in the PR, and dispatch `gpu-census.yml` on `macos-latest` for a real
GPU — SwiftShader here is not player evidence.

If this session's host catalog is empty, use `./tools/mcp/apex-tools-mcp.sh call` or the
daemon above (MCP config files: `docs/AGENT-SURFACE.md`).

Wrap map (apex-tools vs this skill vs deploy-research vs playwright-official):
`docs/AGENT-SURFACE.md`. Never run **playwright-official** (`browser_*`) beside this Chrome;
github.io is unreachable from any container browser ([web-egress.md](references/web-egress.md)).
Deep playbook: `docs/research/CHROME-DEVTOOLS-MCP.md`.

## Hard rules (always)

1. **Never render Chrome MCP while Playwright runs** — park to `about:blank`,
   then `chrome-stop`, then check CPU (`test-bg.mjs` and `chrome-start` refuse each
   other; attached `chrome_*` tools are not detected, so close their page yourself); see [`references/traps.md`](references/traps.md) (chrome / camera / scene slices).
2. **`snapCam()` after `jump()`/`park()` only** — never after `orbit()`/`view()`.
3. SwiftShader WebGPU **executes**; pixels come from the soft-present blit, never the
   hidden swapchain: `await __apex.awaitPresent()` in a live session, or
   `node tools/gfx/gfx-probe.mjs --backend webgpu <track>` (TLX: `--backend three`).
   Never call `getCurrentTexture()` on software adapters. Commands and traps:
   [`references/renderer.md`](references/renderer.md).
4. **Image budget** — [playwright-probe recipes §Galleries and image budget](../playwright-probe/references/recipes.md#galleries-and-image-budget) (one copy).

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
- Boot evidence (a backend unit test is not proof it runs) → `docs/ARCHITECTURE.md` §Boot evidence.
- Renderer probe flags (`--backend`, secure context, `gfxBound`) →
  [`references/renderer.md`](references/renderer.md).

Chrome DevTools naming: `chrome_click` (CLI) and `mcp__chrome-devtools__click` (attached) are the same underlying `click` action.

## Private chat attachment

For existing-tunnel startup/recovery, namespaced gateway contracts and environment
checks, follow [free design tooling](../../../docs/DESIGN-TOOLS.md). Local readiness
and live native chat verification are separate. Keep existing app identities,
credential references, and the configured upstream catalog.
