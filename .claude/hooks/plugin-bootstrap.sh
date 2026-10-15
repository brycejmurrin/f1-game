#!/bin/bash
# SessionStart hook (cloud sessions only): a fresh cloud container ignores
# plugins installed elsewhere (a sibling session measured PLUGINS_PERSISTED=no,
# 2026-10-15), so install the chosen plugins here. Idempotent, quiet, never
# fails the session, runs async. Plugins the CLI installs load on the NEXT
# session start or /reload-plugins, not mid-session.
#
# Skips: not a cloud session (CLAUDE_CODE_REMOTE != true),
# APEX_SKIP_PLUGIN_BOOTSTRAP=1, or no `claude` CLI on PATH.
# Docs: https://code.claude.com/docs/en/discover-plugins ("Install from your shell")

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
[ "${APEX_SKIP_PLUGIN_BOOTSTRAP:-}" = "1" ] && exit 0
command -v claude >/dev/null 2>&1 || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
LOG="$ROOT/artifacts/plugin-bootstrap.log"
mkdir -p "$ROOT/artifacts"
# Keep the previous run's log: a failed run's diagnostics should outlive the next start.
[ -f "$LOG" ] && mv -f "$LOG" "$LOG.prev"
: >"$LOG"

# A hung install is never cancelled by the harness on an async hook (the hooks
# docs: timeout is not enforced with async: true), so bound every network call.
t() { timeout "$1" "${@:2}"; }

# name@marketplace. anthropic-plugin-directory is built in; the official one is added below.
PLUGINS=(
  design@anthropic-plugin-directory
  responsive-check-mobile-layout-tester@anthropic-plugin-directory
  ci-optimizer-faster-github-actions-and-gitlab-ci@anthropic-plugin-directory
  parallax-threejs@anthropic-plugin-directory
  audiorective@anthropic-plugin-directory
  pr-review-toolkit@anthropic-plugin-directory
  typescript-lsp@claude-plugins-official
  modern-web-guidance@claude-plugins-official
)

t 60 claude plugin marketplace add anthropics/claude-plugins-official >>"$LOG" 2>&1 || true
have=$(t 60 claude plugin list 2>/dev/null)
ok=0; fail=0
for p in "${PLUGINS[@]}"; do
  # Anchored on the whole name@marketplace token, not a substring of the list.
  if printf '%s\n' "$have" | grep -Eq "(^|[[:space:]>])$p([[:space:]]|\$)"; then ok=$((ok + 1)); continue; fi
  if t 120 claude plugin install "$p" --scope user >>"$LOG" 2>&1; then ok=$((ok + 1)); else fail=$((fail + 1)); fi
done

# Drop bundled MCP servers that cannot work here (OAuth-only connectors, empty urls,
# servers that exit on start). Plugins re-extract on install, so patch after it.
# Takes effect on the next session start or /reload-plugins.
python3 - <<'PY' >>"$LOG" 2>&1 || true
import glob, json
DROP = {
    "design": ["slack", "figma", "linear", "asana", "atlassian", "notion", "intercom", "google calendar", "gmail"],
    "parallax-threejs": ["spector"],
}
base = glob.glob("/root/.claude/plugins/cache/*/")
for plugin, names in DROP.items():
    for f in [f for b in base for f in glob.glob(b + plugin + "/*/.mcp.json")]:
        d = json.load(open(f))
        srv = d.get("mcpServers", {})
        gone = [n for n in names if srv.pop(n, None) is not None]
        if gone:
            json.dump(d, open(f, "w"), indent=2)
            print("pruned", f, gone)
PY

# typescript-lsp is a thin wrapper; it needs the server binary on PATH.
# Pinned (5.3.0 is the version measured working here) so a new release cannot run unreviewed.
lsp=present
if ! command -v typescript-language-server >/dev/null 2>&1; then
  if t 120 npm install -g typescript-language-server@5.3.0 >>"$LOG" 2>&1; then lsp=installed; else lsp=MISSING; fi
fi

echo "apex26 plugin-bootstrap: $ok ok, $fail failed, ts-language-server $lsp (artifacts/plugin-bootstrap.log)"
exit 0
