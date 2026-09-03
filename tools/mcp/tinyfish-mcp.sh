#!/usr/bin/env bash
# @doc Local TinyFish MCP proxy helper: `setup`/`start`/`stop`/`status`/`fetch`/`search`/`deploy-check`/`deploy-js` on :3711.
# @skill mcp-probe
# TinyFish local MCP proxy — start/stop and curl helpers for http://127.0.0.1:3711/mcp
#
# CLI ONLY — NOT MCP-ATTACHED. Removed from .mcp.json / .cursor/mcp.json
# (2026-09): the container egress blocks agent.tinyfish.ai, so this proxy
# cannot reach upstream from an agent session. Live Pages / public-web checks
# go through the host fetch tool (WebFetch) or the hosted TinyFish connector —
# see .claude/agents/deploy-research.md. Kept for a developer box with egress.
#
# Clone lives at scratch/tinyfish-mcp-server (gitignored). A fresh checkout must
# run `setup` once. Key resolution: shell TINYFISH_API_KEY, else the gitignored
# proxy .env — NOTHING is tracked. No key = a clear "not set" message and
# exit 1. Custom keys: https://agent.tinyfish.ai/home. The tmux pane sources
# ONLY the .env file, so start/setup persist the resolved key there.
#
# Agent-facing defaults (measured 2026-08-17):
# - after one-time setup, fetch/search/deploy-check auto-ensure (start + init)
# - responses are unwrapped via tools/mcp/tinyfish-rpc.py (raw RPC with --json)
# - deploy-check compares live build to local version.json (exit 1 if STALE);
#   --tip compares live to origin/<deploy-branch>:version.json instead
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="${TINYFISH_MCP_REPO:-$ROOT/scratch/tinyfish-mcp-server}"
SESSION="tinyfish-mcp"
PORT="${PORT:-3711}"
BASE="http://127.0.0.1:${PORT}"
MCP="${BASE}/mcp"
PROTO="2025-06-18"
STATE="$REPO/.mcp-session"
ENV_FILE="$REPO/.env"
RPC="$ROOT/tools/mcp/tinyfish-rpc.py"
VERSION_JSON="$ROOT/version.json"

# Optional flags parsed by fetch / search / tools / deploy-check
FLAG_JSON=0
FLAG_TIP=0
FETCH_FORMAT="markdown"
FETCH_TTL=""
FETCH_PURPOSE=""
DEPLOY_MARKER=""
DEPLOY_BRANCH="${DEPLOY_BRANCH:-claude/f1-game-project-26h3ng}"

# No tracked key. A credential lived here once (removed 2026-09); the unit
# test now asserts that no TinyFish credential literal exists under tools/ or
# .claude/. The key comes from the shell or the gitignored .env only.
load_env() {
  local from_shell="${TINYFISH_API_KEY:-}"
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
  fi
  # Shell wins over the gitignored proxy env file. Nothing else is consulted.
  TINYFISH_API_KEY="${from_shell:-${TINYFISH_API_KEY:-}}"
}

TINYFISH_KEY_URL="https://agent.tinyfish.ai/home"

need_key() {
  load_env
  if [[ -z "${TINYFISH_API_KEY:-}" ]]; then
    echo "TINYFISH_API_KEY is not set (no key in the shell env or in $ENV_FILE)." >&2
    echo "  This helper ships NO fallback key." >&2
    echo "  Get a key: ${TINYFISH_KEY_URL}" >&2
    echo "  Then: echo 'TINYFISH_API_KEY=...' > $ENV_FILE && $0 start" >&2
    exit 1
  fi
}

# The tmux pane sources ONLY $ENV_FILE. Persist the resolved key (shell or
# already-there file) so start cannot 401 after need_key.
persist_env() {
  if [[ -z "${TINYFISH_API_KEY:-}" ]]; then
    return 1
  fi
  mkdir -p "$(dirname "$ENV_FILE")"
  if [[ -f "$ENV_FILE" ]] && grep -qE '^TINYFISH_API_KEY=[^[:space:]]+' "$ENV_FILE" 2>/dev/null; then
    return 0
  fi
  umask 077
  printf 'TINYFISH_API_KEY=%s\n' "$TINYFISH_API_KEY" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE (the tmux server reads only the file)" >&2
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
  load_env
  if persist_env; then
    echo "Env: $ENV_FILE present"
  else
    echo "Create $ENV_FILE with: TINYFISH_API_KEY=…" >&2
    echo "  Get a key: ${TINYFISH_KEY_URL}" >&2
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
  persist_env
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
    # --json must still FAIL on a JSON-RPC error object; printing the error and
    # exiting 0 is how a broken call reads as a successful one in a pipeline.
    printf '%s' "$raw" | python3 -c '
import json, sys
try:
    rpc = json.loads(sys.stdin.read() or "{}")
except json.JSONDecodeError:
    sys.exit(0)
sys.exit(1 if isinstance(rpc, dict) and "error" in rpc else 0)
'
  else
    printf '%s' "$raw" | python3 "$RPC" "$@"
  fi
}

parse_common_flags() {
  FLAG_JSON=0
  FLAG_TIP=0
  FETCH_FORMAT="markdown"
  FETCH_TTL=""
  FETCH_PURPOSE=""
  FETCH_TIMEOUT_MS="60000"
  DEPLOY_MARKER=""
  local -a rest=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json) FLAG_JSON=1; shift ;;
      --tip) FLAG_TIP=1; shift ;;
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
      --marker)
        DEPLOY_MARKER="${2:?--marker needs an ERE pattern}"
        shift 2
        ;;
      --timeout-ms)
        FETCH_TIMEOUT_MS="${2:?--timeout-ms needs milliseconds (max 110000)}"
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
  # bash + set -u: empty rest[@] is unbound (deploy-check --tip with no extra args).
  PARSE_REST=()
  if ((${#rest[@]})); then PARSE_REST=("${rest[@]}"); fi
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
timeout_ms = sys.argv[5]
args = {"urls": urls, "format": fmt}
if ttl != "":
    args["ttl"] = int(ttl)
if purpose:
    args["purpose"] = purpose
# fetch_content takes a per-URL wall-clock budget (max 110000) and defaults to
# something short enough that github.io timed out twice in one session. Ask for
# the budget instead of retrying around the default.
if timeout_ms != "":
    args["per_url_timeout_ms"] = int(timeout_ms)
print(json.dumps(args))
' "$urls_json" "$FETCH_FORMAT" "$FETCH_TTL" "$FETCH_PURPOSE" "$FETCH_TIMEOUT_MS")"
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
  # The WHOLE request is built by python, not string-pasted: a stray quote in the
  # hand-assembled body made every search a -32700 Parse error while init and
  # fetch stayed green, so the helper looked healthy.
  local body raw
  body="$(python3 -c 'import json,sys; print(json.dumps({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search","arguments":{"query":sys.argv[1]}}}))' "$q")"
  raw="$(mcp_post "$body")"
  emit_rpc "$raw" unwrap
}

# TinyFish's own fetch times out intermittently — MEASURED 2026-08-17: two
# consecutive version.json fetches, one "timeout" and one clean, nothing changed
# in between. It arrives as a SUCCESSFUL JSON-RPC result carrying an errors[]
# payload, so an unretried caller reports a broken deploy for a blip. The RPC
# helper exits 3 for exactly that case; anything else is a real answer.
fetch_live_build() {
  local args_json raw rc attempt
  args_json="$(python3 -c 'import json; print(json.dumps({"urls":["'"$DEPLOY_BASE"'/version.json"],"format":"markdown","ttl":0,"per_url_timeout_ms":60000}))')"
  for attempt in 1 2 3; do
    raw="$(mcp_post '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"fetch_content","arguments":'"$args_json"'}}')"
    LIVE_BUILD_RAW="$raw"
    LIVE_BUILD="$(printf '%s' "$raw" | python3 "$RPC" live-build 2>/dev/null)"
    rc=$?
    [[ "$rc" -ne 3 ]] && return "$rc"
    [[ "$attempt" -lt 3 ]] && { echo "# TinyFish fetch timed out — retry $attempt/2" >&2; sleep 2; }
  done
  return 3
}

cmd_deploy_check() {
  parse_common_flags "$@"
  cmd_ensure >/dev/null
  load_session
  local raw
  fetch_live_build || true
  raw="$LIVE_BUILD_RAW"
  if [[ "$FLAG_JSON" -eq 1 ]]; then
    printf '%s\n' "$raw"
    return 0
  fi
  local -a extra=()
  if [[ "$FLAG_TIP" -eq 1 ]]; then
    local tip_src tip_build
    if tip_src="$(git -C "$ROOT" show "origin/${DEPLOY_BRANCH}:version.json" 2>/dev/null)"; then
      :
    elif tip_src="$(git -C "$ROOT" show "${DEPLOY_BRANCH}:version.json" 2>/dev/null)"; then
      :
    else
      echo "deploy-check: could not read ${DEPLOY_BRANCH}:version.json (git fetch origin ${DEPLOY_BRANCH}?)" >&2
      return 2
    fi
    tip_build="$(printf '%s' "$tip_src" | python3 -c 'import json,sys; print(json.load(sys.stdin)["build"])')"
    extra+=(--tip-build "$tip_build")
  fi
  if [[ -f "$VERSION_JSON" ]]; then
    printf '%s' "$raw" | python3 "$RPC" deploy-summary --local-file "$VERSION_JSON" "${extra[@]}"
  else
    printf '%s' "$raw" | python3 "$RPC" deploy-summary "${extra[@]}"
  fi
}

# Fetch a shipped JS/CSS asset at the live ?v= build (script tags are stripped
# from index.html extracts, so this is the marker-grep path).
cmd_deploy_js() {
  parse_common_flags "$@"
  set -- "${PARSE_REST[@]}"
  local rel="${1:?usage: $0 deploy-js [--json] <path-under-site>   e.g. js/core/log.js}"
  # Accept "js/foo.js", "/js/foo.js", or "foo.js" (→ js/foo.js).
  rel="${rel#/}"
  if [[ "$rel" != js/* && "$rel" != css/* && "$rel" != *.* ]]; then
    rel="js/$rel"
  elif [[ "$rel" != */* ]]; then
    rel="js/$rel"
  fi
  cmd_ensure >/dev/null
  load_session
  local live url
  if ! fetch_live_build; then
    echo "deploy-js: could not resolve the live build (see above)" >&2
    return 3
  fi
  live="$LIVE_BUILD"
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
  if [[ -z "$DEPLOY_MARKER" ]]; then
    cmd_fetch "${fetch_args[@]}" "$url"
    return
  fi
  # --marker turns this into a TEST: one grep, one verdict, one exit code.
  # Needed because the body is TRUNCATED for anything large — MEASURED
  # 2026-08-17: 6.1 KB came back from a 200 KB wgx.js (both --format markdown
  # and html), 9.6 KB from an 11 KB log.js. So the reach is a few thousand bytes,
  # not a documented constant, and eyeballing the output invites the worst
  # possible conclusion — "the marker is absent, the fix did not ship" — when the
  # marker was simply past where the body stopped. A miss says so explicitly.
  local body bytes
  body="$(cmd_fetch "${fetch_args[@]}" "$url")"
  bytes="${#body}"
  if printf '%s' "$body" | grep -qE -- "$DEPLOY_MARKER"; then
    echo "MARKER PRESENT  /${DEPLOY_MARKER}/  in ${rel}@${live} (${bytes} B fetched)"
    return 0
  fi
  echo "MARKER ABSENT   /${DEPLOY_MARKER}/  in ${rel}@${live} (${bytes} B fetched)" >&2
  if [[ "$bytes" -lt 12000 ]]; then
    echo "  NOT a verdict on the deployed file: TinyFish truncates, and only" >&2
    echo "  the first ~${bytes} B of ${rel} came back. A marker deeper in the file" >&2
    echo "  cannot be seen from here — verify content by git provenance (is the" >&2
    echo "  commit in the deploy branch?) and use deploy-check for the build id." >&2
  fi
  return 1
}

usage() {
  cat <<EOF
TinyFish local MCP helper (proxy -> https://agent.tinyfish.ai/mcp)
CLI only — NOT attached in .mcp.json (container egress blocks agent.tinyfish.ai).
Live Pages checks: deploy-research subagent (host fetch / WebFetch).

  $0 setup                 Clone/build scratch/tinyfish-mcp-server
  $0 start                 Start proxy in tmux (port ${PORT})
  $0 stop                  Stop tmux session (+ clear saved session id)
  $0 status                healthz probe
  $0 init                  MCP initialize + save session id
  $0 ensure                start (if built) + init; run setup once first
  $0 tools [--json]        tools/list (names by default)
  $0 fetch [flags] <url>…  fetch_content (free); unwraps body text
  $0 search [--json] <q>   web search (free); unwraps body text
  $0 deploy-check [--json] [--tip]  live version.json vs local (or deploy tip)
  $0 deploy-js [--marker RE] <path>   fetch shipped asset at live ?v=; with
                           --marker, grep it and exit 0/1 instead of printing

Fetch flags:
  --format markdown|html|json   (default markdown; html keeps more markup)
  --ttl N                       freshness seconds (0 = prefer live)
  --purpose "..."               optional intent hint for TinyFish
  --timeout-ms N                per-URL wall-clock budget (default 60000, max
                                110000) — the default upstream budget is short
                                enough that github.io times out intermittently
  --json                        print raw JSON-RPC (no unwrap)

deploy-check exits 1 when live build != the compared build (local version.json
by default). --tip uses origin/${DEPLOY_BRANCH}:version.json so a behind
working tree is not reported as a Pages miss.
deploy-js is the marker-grep path — index.html extracts strip <script> tags.
The BODY IS TRUNCATED for large files — measured 2026-08-17: 6.1 KB back from a
200 KB wgx.js (markdown and html alike), 9.6 KB from an 11 KB log.js. It can only
see the TOP of a big file, so a deep marker is unverifiable from here.
--marker says so on a miss rather than letting "absent" read as "did not
ship"; for deeper content use git provenance plus deploy-check's build id.

Env: TINYFISH_API_KEY in the shell or in $ENV_FILE (gitignored). No tracked
     fallback exists — without a key every network command exits 1 with a
     "not set" message. Get a key: $TINYFISH_KEY_URL
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
