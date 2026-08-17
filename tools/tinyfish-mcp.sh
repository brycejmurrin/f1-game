#!/usr/bin/env bash
# TinyFish local MCP proxy — start/stop and curl helpers for http://127.0.0.1:3711/mcp
# Clone lives at scratch/tinyfish-mcp-server (gitignored). Needs TINYFISH_API_KEY.
#
# Agent-facing defaults (measured 2026-08-17):
# - fetch/search/deploy-check auto-ensure (start + init) so a cold box works
# - responses are unwrapped via tools/tinyfish-rpc.py (raw RPC with --json)
# - deploy-check compares live build to local version.json (exit 1 if STALE)
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
RPC="$ROOT/tools/tinyfish-rpc.py"
VERSION_JSON="$ROOT/version.json"

# Optional flags parsed by fetch / search / tools / deploy-check
FLAG_JSON=0
FETCH_FORMAT="markdown"
FETCH_TTL=""
FETCH_PURPOSE=""

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

REPO_URL="https://github.com/tinyfish-io/tinyfish-mcp-server.git"
DEPLOY_BASE="https://brycejmurrin.github.io/f1-game"

need_repo() {
  if [[ ! -f "$REPO/dist/index.js" ]]; then
    echo "Missing build at $REPO — run: $0 setup" >&2
    exit 1
  fi
}

cmd_setup() {
  mkdir -p "$(dirname "$REPO")"
  if [[ -d "$REPO/.git" ]]; then
    echo "Already cloned: $REPO"
    git -C "$REPO" pull --ff-only 2>/dev/null || true
  else
    git clone "$REPO_URL" "$REPO"
  fi
  (
    cd "$REPO"
    npm ci
    npm run build
  )
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Create $ENV_FILE with: TINYFISH_API_KEY=…" >&2
    echo "  Get a key: https://agent.tinyfish.ai/api-keys" >&2
  else
    echo "Env: $ENV_FILE present"
  fi
  if local_ok_bin; then
    echo "Build OK: $REPO/dist/index.js"
  fi
  echo "Next: $0 ensure"
}

local_ok_bin() {
  [[ -f "$REPO/dist/index.js" ]]
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
  for _ in $(seq 1 40); do
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
  rm -f "$STATE"
  echo "Stopped (if it was running)."
}

cmd_status() {
  if is_up; then
    echo "UP  ${BASE}/healthz -> $(curl -sf "${BASE}/healthz")"
    echo "MCP ${MCP}"
  else
    echo "DOWN (run: $0 start | $0 ensure)"
    exit 1
  fi
}

mcp_post() {
  local body="$1"
  local allow_empty="${2:-0}"
  local hdr_file
  hdr_file="$(mktemp)"
  local out="" http_code=""
  # Retry a few times — healthz can beat the MCP route briefly after start.
  local attempt
  for attempt in 1 2 3; do
    http_code="$(curl -sS --max-time 90 -o "$hdr_file.BODY" -w '%{http_code}' -D "$hdr_file" -X POST "$MCP" \
      -H 'Content-Type: application/json' \
      -H 'Accept: application/json, text/event-stream' \
      -H "MCP-Protocol-Version: ${PROTO}" \
      ${SESSION_ID:+ -H "Mcp-Session-Id: ${SESSION_ID}"} \
      -d "$body" 2>/dev/null || echo "000")"
    out="$(cat "$hdr_file.BODY" 2>/dev/null || true)"
    rm -f "$hdr_file.BODY"
    if [[ -n "$out" ]] || [[ "$allow_empty" == "1" && "$http_code" =~ ^2 ]]; then
      break
    fi
    sleep 0.4
    out=""
  done
  if grep -qi '^mcp-session-id:' "$hdr_file" 2>/dev/null; then
    grep -i '^mcp-session-id:' "$hdr_file" | tail -1 | cut -d: -f2- | tr -d ' \r' >"$STATE"
  fi
  rm -f "$hdr_file"
  if [[ -z "$out" && "$allow_empty" != "1" ]]; then
    echo "tinyfish-mcp: empty response from ${MCP} (http=${http_code:-?})" >&2
    exit 1
  fi
  printf '%s' "$out"
}

load_session() {
  SESSION_ID=""
  [[ -f "$STATE" ]] && SESSION_ID="$(cat "$STATE")"
}

cmd_init() {
  if ! is_up; then
    echo "DOWN — start the proxy first ($0 start | $0 ensure)" >&2
    exit 1
  fi
  # initialize must NOT carry a prior Mcp-Session-Id — a stale id (proxy
  # restart, or ensure after another client's session) made the upstream
  # return an empty body (measured 2026-08-17).
  SESSION_ID=""
  rm -f "$STATE"
  local resp
  resp="$(mcp_post '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"'"${PROTO}"'","capabilities":{},"clientInfo":{"name":"tinyfish-mcp.sh","version":"1.1.0"}}}')"
  load_session
  if [[ -z "${SESSION_ID:-}" ]]; then
    echo "tinyfish-mcp: init did not return Mcp-Session-Id" >&2
    echo "$resp" | head -c 500 >&2
    exit 1
  fi
  mcp_post '{"jsonrpc":"2.0","method":"notifications/initialized"}' 1 >/dev/null || true
  echo "Session: ${SESSION_ID}"
}

# Start proxy if needed + (re)init session. Idempotent.
cmd_ensure() {
  cmd_start
  # healthz can flip before /mcp accepts initialize (measured empty body on
  # the first post-start attempt). Retry init in a subshell so mcp_post's
  # `exit 1` does not kill the whole helper.
  local i
  for i in 1 2 3 4 5; do
    if ( cmd_init ); then
      return 0
    fi
    sleep 0.5
  done
  echo "tinyfish-mcp: ensure failed to initialize session" >&2
  exit 1
}

emit_rpc() {
  local raw="$1"
  shift || true
  if [[ "$FLAG_JSON" -eq 1 ]]; then
    printf '%s\n' "$raw"
  else
    printf '%s' "$raw" | python3 "$RPC" "$@"
  fi
}

parse_common_flags() {
  FLAG_JSON=0
  FETCH_FORMAT="markdown"
  FETCH_TTL=""
  FETCH_PURPOSE=""
  local -a rest=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json) FLAG_JSON=1; shift ;;
      --format)
        FETCH_FORMAT="${2:?--format needs markdown|html|json}"
        shift 2
        ;;
      --ttl)
        FETCH_TTL="${2:?--ttl needs seconds}"
        shift 2
        ;;
      --purpose)
        FETCH_PURPOSE="${2:?--purpose needs a string}"
        shift 2
        ;;
      --) shift; rest+=("$@"); break ;;
      -*)
        echo "Unknown flag: $1" >&2
        exit 1
        ;;
      *) rest+=("$1"); shift ;;
    esac
  done
  PARSE_REST=("${rest[@]}")
}

cmd_tools() {
  parse_common_flags "$@"
  cmd_ensure >/dev/null
  load_session
  local raw
  raw="$(mcp_post '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')"
  if [[ "$FLAG_JSON" -eq 1 ]]; then
    printf '%s\n' "$raw"
  else
    printf '%s' "$raw" | python3 "$RPC" tool-names
  fi
}

cmd_fetch() {
  parse_common_flags "$@"
  set -- "${PARSE_REST[@]}"
  local url="${1:?usage: $0 fetch [--format markdown|html|json] [--ttl N] [--json] <url> [url2 ...]}"
  shift
  cmd_ensure >/dev/null
  load_session
  local urls_json args_json
  urls_json="$(printf '"%s",' "$url" "$@" | sed 's/,$//')"
  args_json="$(python3 -c '
import json, sys
urls = json.loads("[" + sys.argv[1] + "]")
fmt = sys.argv[2]
ttl = sys.argv[3]
purpose = sys.argv[4]
args = {"urls": urls, "format": fmt}
if ttl != "":
    args["ttl"] = int(ttl)
if purpose:
    args["purpose"] = purpose
print(json.dumps(args))
' "$urls_json" "$FETCH_FORMAT" "$FETCH_TTL" "$FETCH_PURPOSE")"
  local raw
  raw="$(mcp_post '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"fetch_content","arguments":'"$args_json"'}}')"
  emit_rpc "$raw" unwrap
}

cmd_search() {
  parse_common_flags "$@"
  set -- "${PARSE_REST[@]}"
  local q="${1:?usage: $0 search [--json] <query>}"
  cmd_ensure >/dev/null
  load_session
  local q_esc raw
  q_esc="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$q")"
  raw="$(mcp_post '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search","arguments":{"query":'"${q_esc}"'}}}"')"
  emit_rpc "$raw" unwrap
}

cmd_deploy_check() {
  parse_common_flags "$@"
  cmd_ensure >/dev/null
  load_session
  local args_json raw
  args_json="$(python3 -c 'import json; print(json.dumps({"urls":["'"$DEPLOY_BASE"'/version.json"],"format":"markdown","ttl":0}))')"
  raw="$(mcp_post '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"fetch_content","arguments":'"$args_json"'}}')"
  if [[ "$FLAG_JSON" -eq 1 ]]; then
    printf '%s\n' "$raw"
    return 0
  fi
  if [[ -f "$VERSION_JSON" ]]; then
    printf '%s' "$raw" | python3 "$RPC" deploy-summary --local-file "$VERSION_JSON"
  else
    printf '%s' "$raw" | python3 "$RPC" deploy-summary
  fi
}

# Fetch a shipped JS/CSS asset at the live ?v= build (script tags are stripped
# from index.html extracts, so this is the marker-grep path).
cmd_deploy_js() {
  parse_common_flags "$@"
  set -- "${PARSE_REST[@]}"
  local rel="${1:?usage: $0 deploy-js [--json] <path-under-site>   e.g. js/log.js}"
  # Accept "js/foo.js", "/js/foo.js", or "foo.js" (→ js/foo.js).
  rel="${rel#/}"
  if [[ "$rel" != js/* && "$rel" != css/* && "$rel" != *.* ]]; then
    rel="js/$rel"
  elif [[ "$rel" != */* ]]; then
    rel="js/$rel"
  fi
  cmd_ensure >/dev/null
  load_session
  local ver_args raw live url
  ver_args="$(python3 -c 'import json; print(json.dumps({"urls":["'"$DEPLOY_BASE"'/version.json"],"format":"markdown","ttl":0}))')"
  raw="$(mcp_post '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"fetch_content","arguments":'"$ver_args"'}}')"
  live="$(printf '%s' "$raw" | python3 "$RPC" live-build)"
  url="${DEPLOY_BASE}/${rel}?v=${live}"
  echo "# live=${live}  $url" >&2
  # Re-enter fetch with the resolved URL (preserve --json / --format).
  local -a fetch_args=()
  [[ "$FLAG_JSON" -eq 1 ]] && fetch_args+=(--json)
  [[ -n "$FETCH_FORMAT" ]] && fetch_args+=(--format "$FETCH_FORMAT")
  [[ -n "$FETCH_TTL" ]] && fetch_args+=(--ttl "$FETCH_TTL")
  [[ -n "$FETCH_PURPOSE" ]] && fetch_args+=(--purpose "$FETCH_PURPOSE")
  # Prefer live origin for the asset itself.
  if [[ -z "$FETCH_TTL" ]]; then
    fetch_args+=(--ttl 0)
  fi
  cmd_fetch "${fetch_args[@]}" "$url"
}

usage() {
  cat <<EOF
TinyFish local MCP helper (proxy -> https://agent.tinyfish.ai/mcp)

  $0 setup                 Clone/build scratch/tinyfish-mcp-server
  $0 start                 Start proxy in tmux (port ${PORT})
  $0 stop                  Stop tmux session (+ clear saved session id)
  $0 status                healthz probe
  $0 init                  MCP initialize + save session id
  $0 ensure                start (if needed) + init  — preferred entrypoint
  $0 tools [--json]        tools/list (names by default)
  $0 fetch [flags] <url>…  fetch_content (free); unwraps body text
  $0 search [--json] <q>   web search (free); unwraps body text
  $0 deploy-check [--json] live version.json vs local version.json
  $0 deploy-js <path>      fetch shipped asset at live ?v= (e.g. js/log.js)

Fetch flags:
  --format markdown|html|json   (default markdown; html keeps more markup)
  --ttl N                       freshness seconds (0 = prefer live)
  --purpose "..."               optional intent hint for TinyFish
  --json                        print raw JSON-RPC (no unwrap)

deploy-check exits 1 when live build != local version.json (STALE Pages).
deploy-js is the marker-grep path — index.html extracts strip <script> tags.

Env: TINYFISH_API_KEY in $ENV_FILE or shell.
Repo: $REPO
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    setup) cmd_setup ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    status) cmd_status ;;
    init) cmd_init ;;
    ensure) cmd_ensure ;;
    tools) cmd_tools "$@" ;;
    fetch) cmd_fetch "$@" ;;
    search) cmd_search "$@" ;;
    deploy-check) cmd_deploy_check "$@" ;;
    deploy-js) cmd_deploy_js "$@" ;;
    -h|--help|help|"") usage ;;
    *) echo "Unknown: $cmd" >&2; usage >&2; exit 1 ;;
  esac
}

main "$@"
