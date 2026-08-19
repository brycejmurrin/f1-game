---
name: mcp-probe
description: Use when driving the LIVE working-tree canvas or the DEPLOYED site interactively with Chrome DevTools MCP or tinyfish — poke __apex live, heap/perf/console during an interactive repro. Routine post-deploy version.json STALE check → deploy-research. Batch screenshots → playwright-probe. Scripted hooks → agent-view. UI-layout matrix → survey-ui-matrix (canvas hidden).
---

# Probing the live game with the MCPs

## Prerequisites (always)

Chrome DevTools MCP, Playwright Chromium, and optional tinyfish must be present:

```bash
bash .claude/skills/apex-env-setup/scripts/ensure-apex-env.sh
# or: bash tools/cloud-agent-install.sh
bash tools/chrome-devtools-mcp.sh status 2>/dev/null || true
bash tools/playwright-mcp.sh status 2>/dev/null || true
```

See **apex-env-setup** if status fails or browsers/MCP clones are missing.

Two upstream MCP servers sit alongside the Playwright suite: **Chrome DevTools MCP**
(working tree, canvas-visible) and **tinyfish** (deployed GitHub Pages / public
web). Unified entry: `tools/probe-mcp.py` (`chrome_*` / `tinyfish_*`).

## Entry

```sh
python3 tools/probe-mcp.py list-tools
python3 tools/probe-mcp.py chrome-start          # REQUIRED for multi-call chrome
python3 tools/probe-mcp.py call chrome_...
python3 tools/probe-mcp.py chrome-stop           # ALWAYS before test-bg.mjs
./tools/tinyfish-mcp.sh deploy-check --tip
node tools/mcp-cli.mjs probe --backend webgpu --wait 12000 --eval '...'
```

Hard rules: never render Chrome MCP while Playwright runs; park to about:blank,
then chrome-stop. github.io is tinyfish-only from restricted containers.

See docs/AGENT-SURFACE.md for the full wrap map.
