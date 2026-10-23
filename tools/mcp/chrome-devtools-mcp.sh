#!/usr/bin/env bash
# @doc Wrapper for the local `scratch/chrome-devtools-mcp` clone: `clone`/`build`/`run`/`verify`/`status`/`help`.
# @skill mcp-probe
# Chrome DevTools MCP — local clone at scratch/chrome-devtools-mcp (gitignored).
# Cursor: .mcp.json invokes this script with "run" (stdio MCP).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="$ROOT/scratch/chrome-devtools-mcp"
BIN="$REPO/build/src/bin/chrome-devtools-mcp.js"
REPO_URL="https://github.com/ChromeDevTools/chrome-devtools-mcp.git"
# Audited live in this repository on 2026-08-17 (1.7.0) and re-audited
# 2026-10-21 (1.11.0). Pin the network fallback so a fresh machine cannot
# silently run a different MCP release than CI/tests saw. The 1.7.0 pin needed
# the apex-dialog-close-v1 runtime patch; both of its fixes are upstream in
# 1.11.0 (dialog-blocked input actions since 1.10.0, close_page snapshot
# refresh), so this pin runs unpatched and the runtime gate in
# chrome-devtools-runtime.mjs fails closed on any unaudited version.
MCP_NPM_PACKAGE="chrome-devtools-mcp@1.11.0"
MCP_PIN_VERSION="${MCP_NPM_PACKAGE#*@}"
MCP_PIN_TAG="v${MCP_PIN_VERSION}"
PATCHER="$ROOT/tools/mcp/chrome-devtools-runtime.mjs"
PATCH_CACHE_ROOT="${APEX_CHROME_MCP_CACHE_ROOT:-$ROOT/scratch/chrome-devtools-runtime}"

# Probe for a Chromium binary. Prints the path and returns 0, or returns 1
# with no stdout. status/help MUST call this rather than detect_chrome — the
# latter exits 1, which made `status` unusable on a Mac without /opt/pw-browsers.
find_chrome() {
  if [[ -n "${CHROMIUM_PATH:-}" && -x "$CHROMIUM_PATH" ]]; then
    echo "$CHROMIUM_PATH"; return 0
  fi
  # Shared discovery is read-only: status/help must never write a saved path.
  node "$ROOT/tools/lib/chromium-path.mjs" --path
}

detect_chrome() {
  local found
  found="$(find_chrome)" && { echo "$found"; return 0; }
  echo "No Chromium found. Run: npx playwright install chromium" >&2
  exit 1
}

# run only: a session's MCP servers start while SessionStart may still be
# installing Chromium, and detect_chrome's `exit 1` killed the server for the
# whole session. Retry briefly, then print nothing (run starts without
# --executablePath and the browser tools report the gap), like playwright-mcp.sh.
wait_chrome() {
  local found i wait_s="${APEX_CHROME_WAIT_S:-10}"
  for ((i = 0; i <= wait_s; i++)); do
    found="$(find_chrome 2>/dev/null)" && [[ -n "$found" ]] && { echo "$found"; return 0; }
    if ((i < wait_s)); then sleep 1; fi
  done
  echo "No Chromium found after ${wait_s}s; starting without --executablePath. Run: npx playwright install chromium" >&2
  return 0
}

# WebGPU + software-WebGL flags, both MEASURED on Chrome 148 in this container:
#
#   --enable-unsafe-webgpu       WGX could not boot at all without it: headless
#       Chrome does not expose navigator.gpu by default, so TLX/WGX logged "No
#       available adapters" and every WebGPU probe was a dead end. With it, the
#       adapter is google/swiftshader and requestDevice() succeeds — enough to
#       exercise WGX's validation, lifecycle and bind groups. NOT a visual
#       oracle (CLAUDE.md): pixels still come from SwiftShader.
#   --enable-unsafe-swiftshader  silences "Automatic fallback to software WebGL
#       has been deprecated", which is a warning today and a refusal later.
#
# navigator.gpu needs a SECURE CONTEXT: it is undefined on about:blank no matter
# which flags are set, so a WebGPU probe must navigate to http://127.0.0.1 (or
# https) FIRST. That cost an afternoon; it is not a flag problem.
build_mcp_args() {
  local chrome="$1"
  # Opt-in: attach to tools/mcp/debug-chrome.sh's browser (one browser shared
  # with js-debugger / browser-use) instead of launching an isolated one. The
  # attached browser already carries the WebGPU/SwiftShader flags.
  if [[ -n "${APEX_CDT_BROWSER_URL:-}" ]]; then
    MCP_ARGS=(--browserUrl "$APEX_CDT_BROWSER_URL" --memoryDebugging)
    return 0
  fi
  MCP_ARGS=(
    --headless
    --isolated
    ${chrome:+--executablePath "$chrome"}
    --memoryDebugging
    --viewport "844x390"
  )
  # WebGPU flags MUST match tools/lib/webgpu-chrome-args.cjs (harness / wgx-shot).
  # --use-angle=swiftshader alone leaves requestAdapter() null in headless Chrome;
  # the Vulkan/SwiftShader pins are what make navigator.gpu return an adapter.
  # A file, not a process substitution. This container has no /dev/fd, and
  # bash reports that as "line 48: /dev/fd/63: No such file" before the server
  # can start.
  local _wgpu_file
  _wgpu_file="$(mktemp)"
  node "$ROOT/tools/lib/webgpu-chrome-args.cjs" mcp > "$_wgpu_file"
  while IFS= read -r _wgpu_flag; do
    [[ -n "$_wgpu_flag" ]] && MCP_ARGS+=("--chromeArg=${_wgpu_flag}")
  done < "$_wgpu_file"
  rm -f "$_wgpu_file"
  # Extra per-run flags without editing this file: APEX_CHROME_ARGS="--foo --bar".
  # Lavapipe WebGPU (three.js e2e): APEX_CHROME_ARGS="--enable-unsafe-webgpu
  #   --enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE --use-angle=vulkan
  #   --use-vulkan=native --disable-vulkan-surface" VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json
  #   xvfb-run -a python3 tools/mcp/probe-mcp.py call chrome_navigate_page ...
  if [[ -n "${APEX_CHROME_ARGS:-}" ]]; then
    for _arg in ${APEX_CHROME_ARGS}; do MCP_ARGS+=("--chromeArg=${_arg}"); done
  fi
}

local_ok() {
  [[ -f "$BIN" ]] && node "$BIN" --help >/dev/null 2>&1
}

clone_version() {
  if [[ ! -f "$REPO/package.json" ]]; then
    return 1
  fi
  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version || '')" \
    "$REPO/package.json" 2>/dev/null
}

# The runtime gate is audited per version: the archived 1.7.0 pin is patched
# (apex-dialog-close-v1, SHA256-guarded), MCP_PIN_VERSION passes through
# unpatched, and any other version fails closed — so local_ok alone is never
# enough; the clone must match the pin exactly.
local_pinned_ok() {
  local_ok || return 1
  [[ "$(clone_version)" == "$MCP_PIN_VERSION" ]]
}

run_mcp() {
  local chrome
  chrome="$(wait_chrome)"
  # Bounded wait for the SessionStart npm install (stderr only; stdout is JSON-RPC).
  . "$ROOT/tools/mcp/mcp-preflight.sh"
  if local_pinned_ok; then mcp_preflight; else mcp_preflight "${MCP_NPM_PACKAGE%@*}"; fi
  build_mcp_args "$chrome"
  local source_root runtime_bin npx_bin
  if local_pinned_ok; then
    source_root="$REPO"
  elif local_ok; then
    echo "chrome-devtools-mcp: scratch clone is $(clone_version) (need $MCP_PIN_VERSION) — using $MCP_NPM_PACKAGE" >&2
  fi
  if ! local_pinned_ok; then
  # The npm package is the normal path on a fresh container (the clone is an
  # opt-in for hacking on the server itself), so say so only when asked:
  # two stderr lines on every session start is noise, not a warning.
  [[ -n "${APEX_MCP_VERBOSE:-}" ]] && echo "No local clone ($0 clone && $0 build) — running npx $MCP_NPM_PACKAGE" >&2
    # `npm exec --package` resolves the exact audited release. We launch the
    # materialized copy directly so signals/exit status flow through this exec.
    npx_bin="$(npm exec --yes --package="$MCP_NPM_PACKAGE" -- bash -c 'command -v chrome-devtools-mcp')"
    [[ -n "$npx_bin" ]] || { echo "Could not resolve pinned $MCP_NPM_PACKAGE" >&2; exit 1; }
    npx_bin="$(node -e 'process.stdout.write(require("fs").realpathSync(process.argv[1]))' "$npx_bin")"
    source_root="$(cd "$(dirname "$npx_bin")/../../.." && pwd)"
  fi
  # Both the optional clone and pinned npm fallback take the same gated path;
  # an incompatible clone fails closed instead of silently bypassing the gate.
  runtime_bin="$(node "$PATCHER" --source-root "$source_root" --cache-root "$PATCH_CACHE_ROOT")"
  exec node "$runtime_bin" "${MCP_ARGS[@]}" "$@"
}

cmd_build() {
  if [[ ! -d "$REPO/.git" ]]; then
    echo "Clone first: $0 clone" >&2; exit 1
  fi
  cd "$REPO"
  echo "Installing npm deps (ignore prepare hook — run manually)…"
  npm ci --ignore-scripts
  # Shallow, NON-recursive: prepare.ts only needs devtools-frontend/mcp/mcp.ts.
  # --recursive pulls Chromium nested deps (llvm-project etc.) and can hang for
  # hours on googlesource — never what we want for the MCP binary.
  echo "Syncing devtools-frontend submodule (shallow, no nested deps)…"
  git submodule update --init --depth 1
  echo "Running prepare…"
  npx --yes tsx scripts/prepare.ts
  echo "Compiling…"
  npx --yes tsc
  npx --yes tsx scripts/post-build.ts
  chmod +x build/src/bin/chrome-devtools-mcp.js 2>/dev/null || true
  if local_ok; then
    echo "Built OK: $BIN"
    node "$BIN" --help >/dev/null && echo "Bin help OK"
    node "$BIN" --version 2>/dev/null || true
  else
    echo "Build finished but bin not runnable" >&2; exit 1
  fi
}

cmd_clone() {
  if [[ -d "$REPO/.git" ]]; then
    echo "Already cloned: $REPO (pin $MCP_PIN_TAG)"
    cd "$REPO"
    git fetch --depth 1 origin "refs/tags/${MCP_PIN_TAG}:refs/tags/${MCP_PIN_TAG}" 2>/dev/null \
      || git fetch --depth 1 origin "$MCP_PIN_TAG" 2>/dev/null || true
    git checkout -f "$MCP_PIN_TAG" 2>/dev/null || git checkout -f "tags/$MCP_PIN_TAG" 2>/dev/null || {
      echo "WARN: could not checkout $MCP_PIN_TAG — re-cloning" >&2
      cd "$ROOT"
      rm -rf "$REPO"
    }
  fi
  if [[ ! -d "$REPO/.git" ]]; then
    mkdir -p "$(dirname "$REPO")"
    rm -rf "$REPO"
    # Tags are not branches on chrome-devtools-mcp; shallow --branch often 404s.
    git clone --depth 1 "$REPO_URL" "$REPO"
    (
      cd "$REPO"
      git fetch --depth 1 origin "refs/tags/${MCP_PIN_TAG}:refs/tags/${MCP_PIN_TAG}" \
        || git fetch --depth 1 origin "$MCP_PIN_TAG"
      git checkout -f "$MCP_PIN_TAG" 2>/dev/null || git checkout -f "tags/$MCP_PIN_TAG"
    )
  fi
  cmd_build
}

cmd_status() {
  echo "Repo:  $REPO"
  if [[ -d "$REPO/.git" ]]; then
    echo "Commit: $(git -C "$REPO" log -1 --oneline 2>/dev/null || echo '?')"
  else
    echo "Commit: (not cloned — run: $0 clone)"
  fi
  echo "Bin:   $BIN"
  if local_pinned_ok; then echo "Bin:   OK (local clone $MCP_PIN_VERSION)"; elif local_ok; then
    echo "Bin:   present but $(clone_version) (need $MCP_PIN_VERSION — run: $0 clone or rm -rf scratch/chrome-devtools-mcp)"
  else
    echo "Bin:   missing — run: $0 clone"
  fi
  local chrome
  chrome="$(find_chrome || true)"
  echo "Chrome: ${chrome:-"(not found)"}"
  echo "Runtime gate: $MCP_NPM_PACKAGE audited unpatched (archived 1.7.0 keeps apex-dialog-close-v1; unaudited versions fail closed)"
  echo "MCP config: $ROOT/.mcp.json → $0 run"
}

# with_timeout <secs> <cmd...> — GNU `timeout`, brew `gtimeout`, else a pure-bash
# watchdog (background the command, sleep, kill it if still alive; exit 124
# like coreutils does).
with_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then timeout "$secs" "$@"; return $?; fi
  if command -v gtimeout >/dev/null 2>&1; then gtimeout "$secs" "$@"; return $?; fi
  "$@" & local pid=$!
  ( sleep "$secs"; kill -0 "$pid" 2>/dev/null && kill -TERM "$pid" 2>/dev/null ) & local wd=$!
  wait "$pid"; local rc=$?
  kill "$wd" 2>/dev/null; wait "$wd" 2>/dev/null
  if [[ $rc -eq 143 ]]; then return 124; fi
  return $rc
}

cmd_verify() {
  local chrome
  chrome="$(detect_chrome)"
  build_mcp_args "$chrome"
  cmd_status
  echo "---"
  "$chrome" --version 2>&1 | head -1
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify","version":"1"}}}'
  local tools='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  local out backend="npx"
  if local_ok; then backend="local"; fi
  # `timeout` is GNU coreutils — absent on a stock Mac (brew's is `gtimeout`).
  # Prefer whichever exists; otherwise a bash watchdog kills the probe's process
  # group after the same 45 s so a hung MCP cannot hang `verify`.
  out="$( (echo "$init"; sleep 3; echo "$tools") | with_timeout 45 bash -c 'exec "$0" run' "$0" 2>/dev/null | tail -1 )"
  local count
  count="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(len(d.get('result',{}).get('tools',[])))" "$out" 2>/dev/null || echo 0)"
  echo "Backend: $backend"
  echo "MCP tools: $count"
  [[ "$count" -gt 0 ]] && echo "OK" || { echo "FAIL"; exit 1; }
}

case "${1:-run}" in
  run) shift || true; run_mcp "$@" ;;
  verify) cmd_verify ;;
  status) cmd_status ;;
  chrome-path) detect_chrome ;;
  clone) cmd_clone ;;
  build) cmd_build ;;
  -h|--help|help)
    cat <<EOF
Chrome DevTools MCP — local clone helper (working-tree browser probe)

  $0 clone     Clone $REPO_URL → scratch/chrome-devtools-mcp and build
  $0 build     Rebuild existing clone
  $0 run       Start MCP server on stdio (used by .mcp.json)
  $0 verify    Check Chromium + list tools
  $0 status    Show paths and clone state
  $0 chrome-path

For the deployed site use the deploy-research subagent (host fetch / WebFetch),
not this browser — github.io is blocked from this container's Chromium.

Falls back to pinned npx $MCP_NPM_PACKAGE when the local clone is missing.
Both backends run through the version gate in tools/mcp/chrome-devtools-runtime.mjs:
the archived 1.7.0 pin is copied into scratch/chrome-devtools-runtime and receives
the version/SHA256-guarded #2902 dialog-click and #2903 selected-close fixes;
1.11.0 carries both fixes upstream and runs unpatched; any other version fails closed.
EOF
    ;;
  *)
    echo "Unknown: ${1:-}" >&2
    "$0" help >&2
    exit 1
    ;;
esac
