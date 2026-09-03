#!/usr/bin/env bash
# @doc Wrapper for the local `scratch/chrome-devtools-mcp` clone: `clone`/`build`/`run`/`verify`/`status`/`help`.
# @skill mcp-probe
# Chrome DevTools MCP — local clone at scratch/chrome-devtools-mcp (gitignored).
# Cursor: .mcp.json invokes this script with "run" (stdio MCP).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="$ROOT/scratch/chrome-devtools-mcp"
BIN="$REPO/build/src/bin/chrome-devtools-mcp.js"
PATH_FILE="$ROOT/scratch/chrome-devtools-path.env"
REPO_URL="https://github.com/ChromeDevTools/chrome-devtools-mcp.git"
# Audited live in this repository on 2026-08-17. Pin the network fallback so a
# fresh machine cannot silently run a different MCP release than CI/tests saw.
MCP_NPM_PACKAGE="chrome-devtools-mcp@1.7.0"

# Probe for a Chromium binary. Prints the path and returns 0, or returns 1
# with no stdout. status/help MUST call this rather than detect_chrome — the
# latter exits 1, which made `status` unusable on a Mac without /opt/pw-browsers.
find_chrome() {
  if [[ -n "${CHROMIUM_PATH:-}" && -x "$CHROMIUM_PATH" ]]; then
    echo "$CHROMIUM_PATH"; return 0
  fi
  if [[ -f "$PATH_FILE" ]]; then
    # shellcheck disable=SC1090
    local saved
    saved="$(source "$PATH_FILE" 2>/dev/null && echo "${CHROMIUM_PATH:-}")"
    if [[ -n "$saved" && -x "$saved" ]]; then echo "$saved"; return 0; fi
  fi
  local mac="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if [[ -x "$mac" ]]; then echo "$mac"; return 0; fi
  local candidates=(
    /opt/pw-browsers/chromium
    /opt/pw-browsers/chromium-*/chrome-linux64/chrome
    "$HOME/.cache/ms-playwright/chromium-*/chrome-linux64/chrome"
    "$HOME/.cache/puppeteer/chrome/*/chrome-linux64/chrome"
    /opt/google/chrome/chrome
    /usr/local/bin/google-chrome
  )
  local c glob
  for c in "${candidates[@]}"; do
    for glob in $c; do
      if [[ -x "$glob" ]]; then
        mkdir -p "$(dirname "$PATH_FILE")"
        printf 'CHROMIUM_PATH=%q\n' "$glob" >"$PATH_FILE"
        echo "$glob"; return 0
      fi
    done
  done
  return 1
}

detect_chrome() {
  local found
  found="$(find_chrome)" && { echo "$found"; return 0; }
  echo "No Chromium found. Run: npx playwright install chromium" >&2
  exit 1
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
  MCP_ARGS=(
    --headless
    --isolated
    --executablePath "$chrome"
    --memoryDebugging
    --viewport "844x390"
  )
  # WebGPU flags MUST match tools/lib/webgpu-chrome-args.cjs (harness / wgx-shot).
  # --use-angle=swiftshader alone leaves requestAdapter() null in headless Chrome;
  # the Vulkan/SwiftShader pins are what make navigator.gpu return an adapter.
  while IFS= read -r _wgpu_flag; do
    MCP_ARGS+=("--chromeArg=${_wgpu_flag}")
  done < <(node "$ROOT/tools/lib/webgpu-chrome-args.cjs" mcp)
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

run_mcp() {
  local chrome
  chrome="$(detect_chrome)"
  build_mcp_args "$chrome"
  if local_ok; then
    exec node "$BIN" "${MCP_ARGS[@]}" "$@"
  fi
  echo "Local clone missing or broken — run: $0 clone && $0 build" >&2
  echo "Falling back to npx $MCP_NPM_PACKAGE" >&2
  exec npx -y "$MCP_NPM_PACKAGE" "${MCP_ARGS[@]}" "$@"
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
    echo "Already cloned: $REPO"
    cd "$REPO" && git pull --ff-only 2>/dev/null || true
  else
    mkdir -p "$(dirname "$REPO")"
    git clone "$REPO_URL" "$REPO"
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
  if local_ok; then echo "Bin:   OK (local clone)"; else echo "Bin:   missing — run: $0 clone"; fi
  local chrome
  chrome="$(find_chrome || true)"
  echo "Chrome: ${chrome:-"(not found)"}"
  echo "MCP config: $ROOT/.mcp.json → $0 run"
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
  out="$( (echo "$init"; sleep 3; echo "$tools") | timeout 45 bash -c 'exec "$0" run' "$0" 2>/dev/null | tail -1 )"
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

For the deployed site use tools/mcp/tinyfish-mcp.sh (ensure / deploy-check / deploy-js),
not this browser — github.io is blocked from this container's Chromium.

Falls back to pinned npx $MCP_NPM_PACKAGE when the local clone is missing.
EOF
    ;;
  *)
    echo "Unknown: ${1:-}" >&2
    "$0" help >&2
    exit 1
    ;;
esac
