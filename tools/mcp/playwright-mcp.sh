#!/usr/bin/env bash
# @doc Official `@playwright/mcp@0.0.79` wrapper (help/status/run): the `playwright-official` stdio server.
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

Loopback only for the game (http://127.0.0.1). github.io is the deploy-research subagent's.
Park about:blank before any Playwright test group.
EOF
}

# Real Chromium for --executable-path. Cloud images often put a shell wrapper
# at PATH's google-chrome that forces --remote-debugging-port / a shared
# user-data-dir and can hang a bare headless launch (measured 2026-11-18:
# /usr/local/bin/google-chrome timed out; /opt/google/chrome/chrome returned).
# Prefer env overrides, then the real binary, then chromium-path — but skip a
# shebang wrapper so status and run agree.
resolve_run_chrome() {
  local candidate
  for candidate in "${CHROMIUM_PATH:-}" "${CHROME:-}" "${PW_CHROMIUM:-}"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      echo "$candidate"; return 0
    fi
  done
  if [[ -x /opt/google/chrome/chrome ]]; then
    echo /opt/google/chrome/chrome; return 0
  fi
  if [[ -x /usr/bin/google-chrome-stable ]]; then
    echo /usr/bin/google-chrome-stable; return 0
  fi
  candidate="$(node "$ROOT/tools/lib/chromium-path.mjs" --path 2>/dev/null || true)"
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    if head -c 2 "$candidate" 2>/dev/null | grep -q '#!'; then
      echo "playwright-mcp: skipping PATH chrome wrapper $candidate (shebang); need a real binary" >&2
      return 1
    fi
    echo "$candidate"; return 0
  fi
  return 1
}

pin_in_npx_cache() {
  local base="${MCP_NPM_PACKAGE%@*}"
  local cache="${npm_config_cache:-$HOME/.npm}/_npx"
  compgen -G "$cache/*/node_modules/$base" >/dev/null 2>&1
}

run_npx_pin() {
  # Cold npx downloads at session start are what make Cursor's tools/list time
  # out (host stderr 2026-11-18: "not in the npx cache"). Bound the download so
  # we fail with a clear exit instead of hanging until the client kills us.
  local timeout_s="${APEX_MCP_NPX_TIMEOUT_S:-45}"
  if pin_in_npx_cache || [[ "$timeout_s" == "0" ]]; then
    exec npx --yes --prefer-offline "$MCP_NPM_PACKAGE" "$@"
  fi
  echo "playwright-mcp: $MCP_NPM_PACKAGE not in npx cache; download bounded to ${timeout_s}s (APEX_MCP_NPX_TIMEOUT_S)" >&2
  if command -v timeout >/dev/null 2>&1; then
    exec timeout "$timeout_s" npx --yes --prefer-offline "$MCP_NPM_PACKAGE" "$@"
  fi
  exec npx --yes --prefer-offline "$MCP_NPM_PACKAGE" "$@"
}

cmd_status() {
  echo "Package: ${MCP_NPM_PACKAGE}"
  echo "Profile: ${PROFILE}"
  echo "Out:     ${OUTDIR}"
  local found=""
  found="$(resolve_run_chrome 2>/dev/null || true)"
  echo "Chrome:  ${found:-"(playwright default)"}"
  echo "Bin:     npx ${MCP_NPM_PACKAGE}"
}

cmd_run() {
  mkdir -p "$OUTDIR"
  # Bounded wait for the SessionStart npm install + npx cache note (stderr only).
  . "$ROOT/tools/mcp/mcp-preflight.sh"
  mcp_preflight "${MCP_NPM_PACKAGE%@*}"
  # Isolated (in-memory profile, so two agents never share a locked
  # user-data-dir; --user-data-dir must NOT be combined with it).
  # --no-sandbox: this Cloud image is already a container.
  # --executable-path: the Chromium the repo discovered, because the package's
  # bundled Playwright pins a different build than the one installed here.
  local exe=""
  exe="$(resolve_run_chrome || true)"
  [[ -z "$exe" ]] && echo "playwright-mcp: no repo-discovered Chromium; the package's pinned build may be absent" >&2
  # Opt-ins, read once at server start (measured 2026-10-19,
  # docs/notes/BROWSER-MCP-DEEP-DIVE-2026-10-19.md):
  #   APEX_PW_CDP=http://127.0.0.1:9222  attach to tools/mcp/debug-chrome.mjs's
  #     browser instead of launching one. Its phone-landscape preset supplies the owner’s
  #     iPhone 15 full-screen CSS viewport, native DPR and safe-area insets.
  #   APEX_PW_DEVICE="iPhone 15"  a Playwright device descriptor: hasTouch, UA
  #     and DPR on the context. Without it browser_resize is viewport-only,
  #     page.touchscreen throws ("hasTouch must be enabled") and GLX.isMobile
  #     stays false (the mobile tier is UA-driven).
  # --codegen none: drop the "Ran Playwright code" block every result carries (a TypeScript echo of the
  # call just made; nothing reads it). README of the pinned 0.0.79, "--codegen <lang>"; MCP-REFINE-2026-10-30.
  local extra=(--codegen "${APEX_PW_CODEGEN:-none}")
  [[ -n "${APEX_PW_DEVICE:-}" ]] && extra+=(--device "$APEX_PW_DEVICE")
  if [[ -n "${APEX_PW_CDP:-}" ]]; then
    run_npx_pin \
      --cdp-endpoint "$APEX_PW_CDP" \
      --output-dir "$OUTDIR" \
      "${extra[@]}" "$@"
  fi
  # Reuse the exact cached pin without registry freshness checks. Unlike
  # --offline, --prefer-offline still downloads missing packages on cold starts.
  # https://docs.npmjs.com/cli/v11/using-npm/config#prefer-offline
  run_npx_pin \
    --isolated \
    --headless \
    --browser chromium \
    ${exe:+--executable-path "$exe"} \
    --no-sandbox \
    --output-dir "$OUTDIR" \
    "${extra[@]}" "$@"
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
