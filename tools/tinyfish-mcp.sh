#!/usr/bin/env bash
# TinyFish local MCP proxy — start/stop and curl helpers for http://127.0.0.1:3711/mcp
# Clone lives at scratch/tinyfish-mcp-server (gitignored). Needs TINYFISH_API_KEY.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$ROOT/scratch/tinyfish-mcp-server"
SESSION="tinyfish-mcp"
PORT="${PORT:-3711}"
BASE="http://127.0.0.1:${PORT}"
MCP="${BASE}/mcp"
PROTO="2025-06-18"
STATE="$REPO/.mcp-session"
ENV_FILE="$REPO/.env"

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
  fi
}

need_key() {
  load_env
  if [[ -z "${TINYFISH_API_KEY:-}" ]]; then
    echo "TINYFISH_API_KEY is not set." >&2
    echo "  1. Get a key: https://agent.tinyfish.ai/api-keys" >&2
    echo "  2. echo 'TINYFISH_API_KEY=tf_...' > $ENV_FILE" >&2
    echo "  3. $0 start" >&2
    exit 1
  fi
}

need_repo() {
  if [[ ! -f "$REPO/dist/index.js" ]]; then
    echo "Missing build at $REPO — run:" >&2
    echo "  git clone https://github.com/tinyfish-io/tinyfish-mcp-server.git $REPO" >&2
    echo "  cd $REPO && npm ci && npm run build" >&2
    exit 1
  fi
}

tmux_cmd() {
  tmux -f /exec-daemon/tmux.portal.conf "$@"
}

is_up() {
  curl -sf "${BASE}/healthz" >/dev/null 2>&1
}

cmd_start() {
  need_key
  need_repo
  if is_up; then
    echo "Already listening on ${BASE} (healthz ok)"
    return 0
  fi
  tmux_cmd has-session -t "=$SESSION" 2>/dev/null && tmux_cmd kill-session -t "$SESSION" || true
  tmux_cmd new-session -d -s "$SESSION" -c "$REPO" -- "${SHELL:-bash}" -l
  tmux_cmd send-keys -t "${SESSION}:0.0" "set -a; source '$ENV_FILE' 2>/dev/null || true; set +a; node dist/index.js" C-m
  for _ in $(seq 1 20); do
    sleep 0.25
    if is_up; then
      echo "tinyfish-mcp listening on ${MCP}"
      return 0
    fi
  done
  echo "Server did not come up — tmux log:" >&2
  tmux_cmd capture-pane -t "${SESSION}:0.0" -p >&2 || true
  exit 1
}

cmd_stop() {
  tmux_cmd has-session -t "=$SESSION" 2>/dev/null && tmux_cmd kill-session -t "$SESSION" || true
  echo "Stopped (if it was running)."
}

cmd_status() {
  if is_up; then
    echo "UP  ${BASE}/healthz -> $(curl -sf "${BASE}/healthz")"
    echo "MCP ${MCP}"
  else
    echo "DOWN (run: $0 start)"
    exit 1
  fi
}

mcp_post() {
  local body="$1"
  local hdr_file
  hdr_file="$(mktemp)"
  local out
  out="$(curl -sS -D "$hdr_file" -X POST "$MCP" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "MCP-Protocol-Version: ${PROTO}" \
    ${SESSION_ID:+ -H "Mcp-Session-Id: ${SESSION_ID}"} \
    -d "$body")"
  if grep -qi '^mcp-session-id:' "$hdr_file"; then
    grep -i '^mcp-session-id:' "$hdr_file" | tail -1 | cut -d: -f2- | tr -d ' \r' >"$STATE"
  fi
  rm -f "$hdr_file"
  printf '%s' "$out"
}

load_session() {
  SESSION_ID=""
  [[ -f "$STATE" ]] && SESSION_ID="$(cat "$STATE")"
}

cmd_init() {
  cmd_status >/dev/null
  load_session
  local resp
  resp="$(mcp_post '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"'"${PROTO}"'","capabilities":{},"clientInfo":{"name":"tinyfish-mcp.sh","version":"1.0.0"}}}')"
  echo "$resp" | head -c 4000
  echo
  load_session
  mcp_post '{"jsonrpc":"2.0","method":"notifications/initialized"}' >/dev/null || true
  echo "Session: ${SESSION_ID:-<none>}"
}

cmd_tools() {
  load_session
  [[ -n "${SESSION_ID:-}" ]] || { echo "No session — run: $0 init" >&2; exit 1; }
  mcp_post '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | head -c 8000
  echo
}

cmd_fetch() {
  local url="${1:?usage: $0 fetch <url> [url2 ...]}"
  shift
  load_session
  [[ -n "${SESSION_ID:-}" ]] || { echo "No session — run: $0 init" >&2; exit 1; }
  local urls_json
  urls_json="$(printf '"%s",' "$url" "$@" | sed 's/,$//')"
  mcp_post '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"fetch_content","arguments":{"urls":['"${urls_json}"']}}}' \
    | head -c 12000
  echo
}

cmd_search() {
  local q="${1:?usage: $0 search <query>}"
  load_session
  [[ -n "${SESSION_ID:-}" ]] || { echo "No session — run: $0 init" >&2; exit 1; }
  local q_esc
  q_esc="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$q")"
  mcp_post '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search","arguments":{"query":'"${q_esc}"'}}}' \
    | head -c 12000
  echo
}

cmd_deploy_check() {
  cmd_fetch "https://brycejmurrin.github.io/f1-game/version.json"
}

usage() {
  cat <<EOF
TinyFish local MCP helper (proxy -> https://agent.tinyfish.ai/mcp)

  $0 start              Start proxy in tmux (port ${PORT})
  $0 stop               Stop tmux session
  $0 status             healthz probe
  $0 init               MCP initialize + save session id
  $0 tools              tools/list
  $0 fetch <url> [...]  fetch_content (free)
  $0 search <query>     web search (free)
  $0 deploy-check       fetch live version.json (Apex deploy smoke)

Env: TINYFISH_API_KEY in $ENV_FILE or shell.
Repo: $REPO
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    start) cmd_start ;;
    stop) cmd_stop ;;
    status) cmd_status ;;
    init) cmd_init ;;
    tools) cmd_tools ;;
    fetch) cmd_fetch "$@" ;;
    search) cmd_search "$@" ;;
    deploy-check) cmd_deploy_check ;;
    -h|--help|help|"") usage ;;
    *) echo "Unknown: $cmd" >&2; usage >&2; exit 1 ;;
  esac
}

main "$@"
