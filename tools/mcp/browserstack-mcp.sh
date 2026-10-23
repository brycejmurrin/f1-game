#!/usr/bin/env bash
# @doc Official @browserstack/mcp-server wrapper (help/status/run): `browserstack` stdio server, env credentials only.
# @skill mcp-probe
# browserstack-mcp.sh — shell wrapper for the official BrowserStack MCP server.
# MCP-ATTACHED since 2026-10-21: .mcp.json / .cursor/mcp.json /
# .codex/config.toml launch `browserstack` through `run`, lockstepped by
# tests/unit/agent-config.test.mjs like the other five servers.
#
# Official setup (BrowserStack docs, "Set up the local BrowserStack MCP
# server"): command `npx`, args `["-y", "@browserstack/mcp-server@latest"]`,
# env `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY`. This wrapper pins
# the audited release instead of @latest (same policy as playwright-mcp.sh /
# chrome-devtools-mcp.sh: a fresh machine must not silently run a different
# MCP release than CI/tests saw). BrowserStack also offers a hosted remote
# server (https://mcp.browserstack.com/mcp, OAuth, no local credentials);
# that endpoint is what the claude.ai connector named `mcp.browserstack.com`
# (permissions `mcp__mcp_browserstack_com__*` in .claude/settings.json) used —
# it is a different attachment from this repo-configured local server.
#
# CREDENTIALS: read from the process environment ONLY. Nothing is tracked,
# defaulted or persisted by this script (the tinyfish-mcp.sh rule). No
# credentials in the shell env = a clear "not set" message and exit 1.
# Where to get them: BrowserStack account settings (username + access key).
# Put them in the host's secret store (Cursor Secrets / the shell env the
# MCP client is launched from), never in .mcp.json `env`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Pinned release: npm @browserstack/mcp-server dist-tag `latest` at audit
# time (2026-10-21). Load Testing tools need >= 2.2.0.
MCP_NPM_PACKAGE="@browserstack/mcp-server@2.2.4"

cmd_help() {
  cat <<EOF
browserstack-mcp.sh — official BrowserStack MCP (${MCP_NPM_PACKAGE})

Commands:
  help
  status              # package pin + whether the credential env vars are set (never their values)
  run                 # stdio MCP server (.mcp.json → bash tools/mcp/browserstack-mcp.sh run)

Credentials come from the environment only:
  BROWSERSTACK_USERNAME    BrowserStack username (account settings)
  BROWSERSTACK_ACCESS_KEY  BrowserStack access key (account settings)
Nothing is stored in this repo. \`run\` refuses to start without both and
says so. Hosted alternative (OAuth, no local key): the remote MCP server at
https://mcp.browserstack.com/mcp — not what this wrapper launches.
EOF
}

cmd_status() {
  echo "Package: ${MCP_NPM_PACKAGE}"
  if [[ -n "${BROWSERSTACK_USERNAME:-}" ]]; then
    echo "BROWSERSTACK_USERNAME: set"
  else
    echo "BROWSERSTACK_USERNAME: NOT set"
  fi
  if [[ -n "${BROWSERSTACK_ACCESS_KEY:-}" ]]; then
    echo "BROWSERSTACK_ACCESS_KEY: set"
  else
    echo "BROWSERSTACK_ACCESS_KEY: NOT set"
  fi
  echo "Bin:     npx ${MCP_NPM_PACKAGE}"
}

need_credentials() {
  local missing=0
  if [[ -z "${BROWSERSTACK_USERNAME:-}" ]]; then
    echo "browserstack-mcp: BROWSERSTACK_USERNAME is not set." >&2
    missing=1
  fi
  if [[ -z "${BROWSERSTACK_ACCESS_KEY:-}" ]]; then
    echo "browserstack-mcp: BROWSERSTACK_ACCESS_KEY is not set." >&2
    missing=1
  fi
  if [[ "$missing" -ne 0 ]]; then
    echo "  This wrapper ships NO fallback credentials and reads none from any file." >&2
    echo "  Find both values in your BrowserStack account settings, then export them" >&2
    echo "  in the environment your MCP client launches from (or your host's secret" >&2
    echo "  store, e.g. Cursor Secrets) and restart the client." >&2
    exit 1
  fi
}

cmd_run() {
  # Credentials first: without them there is nothing to start, so fail in
  # one second with the clear message instead of after the preflight wait.
  need_credentials
  # Bounded wait for the SessionStart npm install + npx cache note (stderr only).
  . "$ROOT/tools/mcp/mcp-preflight.sh"
  mcp_preflight "${MCP_NPM_PACKAGE%@*}"
  exec npx --yes "$MCP_NPM_PACKAGE" "$@"
}

cmd="${1:-help}"
shift || true
case "$cmd" in
  help|--help|-h) cmd_help ;;
  status) cmd_status ;;
  run) cmd_run "$@" ;;
  *)
    echo "unknown command: $cmd" >&2
    cmd_help
    exit 2
    ;;
esac
