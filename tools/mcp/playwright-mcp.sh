#!/usr/bin/env bash
# @doc Official `@playwright/mcp@0.0.79` wrapper (`help`/`status`/`run`); the stdio server behind `playwright-official`, on the repo-discovered Chromium.
# @skill survey-ui-matrix / css-play / mcp-probe
# playwright-mcp.sh — shell wrapper for official @playwright/mcp.
# MCP-ATTACHED AGAIN since 2026-10-05: .mcp.json / .cursor/mcp.json /
# .codex/config.toml launch `playwright-official` through `run`. The bare
# package failed in the cloud container two ways (measured 2026-10-05): its
# default `chrome` channel wants /opt/google/chrome, and `--browser chromium`
# wants the build its own bundled Playwright pins (chromium-1237), not the one
# installed here (chromium-1194). `run` resolves the installed executable with
# tools/lib/chromium-path.mjs and passes --executable-path, which works. The
# 2026-09 "failed to connect" was --isolated combined with --user-data-dir.
#
# Interactive UI survey (resize / a11y snapshot / evaluate CSS+DOM).
# Not a CI gate. Never run while chrome-devtools MCP or a Playwright *test*
# group is live (AGENTS.md). Park to about:blank before test-bg.
#
# Pin is the network fallback so a fresh machine cannot silently run a
# different MCP release than CI/tests saw (same class as chrome-devtools-mcp.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Audited live in this repository on 2026-08-18.
MCP_NPM_PACKAGE="@playwright/mcp@0.0.79"
PROFILE="$ROOT/scratch/playwright-mcp"
OUTDIR="$ROOT/artifacts/playwright-mcp"

cmd_help() {
  cat <<EOF
playwright-mcp.sh — official @playwright/mcp (${MCP_NPM_PACKAGE})

Commands:
  help
  status
  run                 # stdio MCP server (.mcp.json → bash tools/mcp/playwright-mcp.sh run)
  play [flags]        # host + open a screen + screenshot (tools/ui/css-play.mjs)
  dom  [flags]        # same, --no-shot: structured DOM JSON only

Pinned: isolated in-memory profile, headless, the repo-discovered Chromium
(tools/lib/chromium-path.mjs --path), shots under artifacts/playwright-mcp. Stdio only — never --port / 0.0.0.0.

MCP tools that matter for UI survey: browser_navigate, browser_resize,
browser_snapshot (DOM/a11y tree), browser_evaluate (CSS / getComputedStyle /
getBoundingClientRect), browser_take_screenshot.

CLI extras for CSS play (not the MCP stdio server): play / dom wrap
tools/ui/css-play.mjs — localhost host, catalog --screen, stylesheet hot-swap
(--css css/menus.css), structured DOM dump (boxes + computed + tokens).
See: node tools/ui/css-play.mjs --help

Loopback only for the game (http://127.0.0.1). github.io stays TinyFish.
Park about:blank before any Playwright test group.
EOF
}

cmd_status() {
  echo "Package: ${MCP_NPM_PACKAGE}"
  echo "Profile: ${PROFILE}"
  echo "Out:     ${OUTDIR}"
  if [[ -x /opt/google/chrome/chrome ]]; then
    echo "Chrome:  /opt/google/chrome/chrome"
  elif compgen -G "/opt/pw-browsers/chromium-*/chrome-linux64/chrome" >/dev/null; then
    echo "Chrome:  $(compgen -G "/opt/pw-browsers/chromium-*/chrome-linux64/chrome" | head -1)"
  else
    echo "Chrome:  (playwright default)"
  fi
  echo "Bin:     npx ${MCP_NPM_PACKAGE}"
}

cmd_run() {
  mkdir -p "$OUTDIR"
  # Isolated (in-memory profile, so two agents never share a locked
  # user-data-dir; --user-data-dir must NOT be combined with it).
  # --no-sandbox: this Cloud image is already a container.
  # --executable-path: the Chromium the repo discovered, because the package's
  # bundled Playwright pins a different build than the one installed here.
  local exe=""
  exe="$(node "$ROOT/tools/lib/chromium-path.mjs" --path 2>/dev/null || true)"
  exec npx --yes "$MCP_NPM_PACKAGE" \
    --isolated \
    --headless \
    --browser chromium \
    ${exe:+--executable-path "$exe"} \
    --no-sandbox \
    --output-dir "$OUTDIR" \
    "$@"
}

cmd_play() {
  exec node "$ROOT/tools/ui/css-play.mjs" "$@"
}

cmd_dom() {
  exec node "$ROOT/tools/ui/css-play.mjs" --no-shot "$@"
}

cmd="${1:-help}"
shift || true
case "$cmd" in
  help|--help|-h) cmd_help ;;
  status) cmd_status ;;
  run) cmd_run "$@" ;;
  play) cmd_play "$@" ;;
  dom) cmd_dom "$@" ;;
  *)
    echo "unknown command: $cmd" >&2
    cmd_help
    exit 2
    ;;
esac
