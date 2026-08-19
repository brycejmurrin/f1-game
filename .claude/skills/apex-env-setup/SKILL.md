---
name: apex-env-setup
description: Bootstrap and verify the Apex 26 (f1-game) agent environment — Node deps, Playwright Chromium, system Chrome, Vulkan/SwiftShader packages, and MCP server clones (playwright, chrome-devtools, tinyfish, apex-tools, probe). Use when starting work on the repo, after a cold boot, when Playwright or MCP fails, or when any probe/test skill reports missing browsers or servers.
---

# Apex 26 environment setup

Idempotent bootstrap for the f1-game (Apex 26) repo so Playwright, Chrome DevTools MCP, and related tools work. Run this first (or when tools fail) before `playwright-probe`, `mcp-probe`, `survey-ui-matrix`, `webapp-testing`, or `check-changes`.

## Locate the repo

```bash
# Prefer an existing clone; otherwise clone the deploy branch
REPO="${APEX_ROOT:-}"
if [[ -z "$REPO" || ! -f "$REPO/package.json" ]]; then
  for candidate in /tmp/f1-game /home/workdir/artifacts/f1-game "$PWD" "$HOME/f1-game"; do
    if [[ -f "$candidate/package.json" && -d "$candidate/tools" ]]; then
      REPO="$candidate"; break
    fi
  done
fi
if [[ -z "$REPO" || ! -f "$REPO/package.json" ]]; then
  git clone --depth 30 --branch claude/f1-game-project-26h3ng \
    https://github.com/brycejmurrin/f1-game.git /tmp/f1-game
  REPO=/tmp/f1-game
fi
export APEX_ROOT="$REPO"
cd "$REPO"
echo "APEX_ROOT=$REPO"
```

## One-shot bootstrap (preferred)

The repo ships the full cloud-agent installer. Prefer it over piecemeal steps:

```bash
cd "$APEX_ROOT"
bash tools/cloud-agent-install.sh
# or, browsers only:
bash tools/install-browsers.sh
```

`cloud-agent-install.sh` is idempotent and best-effort under restricted egress. It:

1. Ensures apt packages (`mesa-vulkan-drivers`, `vulkan-tools`, `xvfb`) when possible
2. Runs `tools/install-browsers.sh` (Playwright Chromium → `/opt/pw-browsers` or cache)
3. Clones/builds chrome-devtools MCP and tinyfish MCP under `scratch/` (gitignored)

## Manual checks (when the one-shot fails or you need diagnosis)

### Node modules

```bash
cd "$APEX_ROOT"
if [[ ! -f node_modules/playwright/package.json || ! -f node_modules/@playwright/test/package.json ]]; then
  export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts
fi
```

### Playwright Chromium

```bash
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
bash tools/install-browsers.sh
# Verify:
node -e "const {chromium}=require('playwright'); chromium.launch({headless:true}).then(b=>{console.log('OK',b.version());return b.close()})"
```

### System Chrome (fallback for MCP)

```bash
# Preferred locations used by tools/chrome-devtools-mcp.sh
ls -la /opt/pw-browsers/chromium*/chrome-linux64/chrome 2>/dev/null \
  || ls -la /opt/google/chrome/chrome 2>/dev/null \
  || which google-chrome chromium chromium-browser 2>/dev/null
```

### MCP servers (from `.mcp.json`)

| Server | How to start / check |
|--------|----------------------|
| **apex-tools** | `bash tools/apex-tools-mcp.sh serve` (or `status`) |
| **playwright** | `bash tools/playwright-mcp.sh run` (or `status`) |
| **playwright-official** | `npx -y @playwright/mcp@0.0.79` |
| **chrome-devtools** | `bash tools/chrome-devtools-mcp.sh run` (or `clone` then `status`) |
| **chrome-devtools-official** | `npx -y chrome-devtools-mcp@1.7.0` |
| **tinyfish** | HTTP `http://127.0.0.1:3711/mcp` — `bash tools/tinyfish-mcp.sh setup` then start |
| **probe** | `python3 tools/probe-mcp.py serve` |

Quick status sweep:

```bash
cd "$APEX_ROOT"
bash tools/apex-tools-mcp.sh status 2>/dev/null || true
bash tools/playwright-mcp.sh status 2>/dev/null || true
bash tools/chrome-devtools-mcp.sh status 2>/dev/null || true
bash tools/tinyfish-mcp.sh status 2>/dev/null || true
```

### Vulkan / headless display (WGX / SwiftShader)

```bash
# Needed for software WebGPU and headless display
dpkg -s mesa-vulkan-drivers vulkan-tools xvfb >/dev/null 2>&1 \
  || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mesa-vulkan-drivers vulkan-tools xvfb
```

## After setup — smoke the probes

```bash
cd "$APEX_ROOT"
# Fast no-browser validation
node tools/verify-change.mjs --fast 2>/dev/null || npm run test:tooling-fast

# One headless Playwright shot (needs browsers)
node tools/apex-eval.mjs monza "a.info()" 2>/dev/null | head -c 200
```

## Hard rules carried into other skills

1. Never run Chrome DevTools MCP rendering while a Playwright batch is active — park to `about:blank`, stop Chrome MCP, check CPU.
2. github.io is typically tinyfish-only from restricted containers.
3. Prefer `tools/*.sh` wrappers over raw `npx` so paths and pins stay consistent with CI.
4. If a probe skill fails with "browser not found" or "MCP not ready", re-run this skill before debugging the game logic.

## Related skills

- `playwright-probe` — batch headless screenshots / evals
- `mcp-probe` — live canvas via Chrome / probe MCP
- `survey-ui-matrix` / `css-play` — interactive Playwright MCP UI work
- `webapp-testing` — Playwright test suite
- `check-changes` — pre-push validation

See also `docs/AGENT-SURFACE.md` and `docs/TESTING.md` inside the repo.
