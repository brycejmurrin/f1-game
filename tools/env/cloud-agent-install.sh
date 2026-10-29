#!/usr/bin/env bash
# @doc Cursor Cloud dashboard `install`: best-effort mesa/vulkan/xvfb, then `install-browsers.sh`, then the MCP clones.
# @skill check-changes
# Dashboard / environment-build install for Apex 26 Cloud Agents.
# Idempotent. Exit 0 when the snapshot already has usable deps even if apt
# or the npm registry is unreachable (restricted egress).
#
# Not `set -e`: apt-get update 404s on archive.ubuntu.com and npm can crash
# with "Exit handler never called!" after registry ECONNRESET
# (measured 2026-08-17, bld-20260817-e70b375f).
set -uo pipefail

# Optional private runtime; no credentials or tunnel IDs are tracked here.
start_configured_chat_mcp() {
  if [[ -n "${APEX_CHAT_MCP_PROFILE:-}" ]]; then
    node "${ROOT}/tools/env/chat-mcp-service.mjs" start || echo "WARN: private chat MCP did not start; run chat-mcp-service.mjs doctor" >&2
  fi
}

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Cure npm prefix=/ when Cursor's /exec-daemon/node shadows nvm on PATH.
# Root cause (measured 2026-10-22, D·W14a): `which node` → /exec-daemon/node
# while `which npm` → ~/.nvm/.../bin/npm. npm's shebang is `#!/usr/bin/env node`,
# so process.execPath=/exec-daemon/node and npm's default prefix =
# dirname(dirname(execPath)) = "/". `npm run` then injects npm_config_prefix=/
# (and global_prefix=/) into children — tooling-fast falls to concurrency 1 and
# some unit tests fail under `npm run` while plain `node --test` passes. No
# repo .npmrc sets this. Durable cure: put nvm's node ahead of /exec-daemon via
# the world-writable /usr/local/cargo/bin slot (already first on Cloud PATH),
# strip any stray prefix=/ from npmrcs, and refuse to continue if prefix is
# still /. Do NOT write prefix= into ~/.npmrc — nvm rejects that.
ensure_npm_prefix() {
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$nvm_dir/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$nvm_dir/nvm.sh"
    # Prefer the default / current node before any npm invocation.
    nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
  fi

  # Drop env overrides that force the broken prefix into child processes.
  if [[ "${npm_config_prefix:-}" == "/" ]]; then
    unset npm_config_prefix
  fi
  if [[ "${npm_config_global_prefix:-}" == "/" ]]; then
    unset npm_config_global_prefix
  fi

  # Idempotently strip stray prefix=/ (and a bogus /etc/npmrc globalconfig)
  # from writable user/global npmrcs. Never invent a prefix= line — nvm owns it.
  local npmrc
  for npmrc in "$HOME/.npmrc" /etc/npmrc /usr/local/etc/npmrc; do
    if [[ -f "$npmrc" && -w "$npmrc" ]] \
        && grep -qE '^[[:space:]]*(prefix[[:space:]]*=[[:space:]]*/[[:space:]]*|globalconfig[[:space:]]*=[[:space:]]*/etc/npmrc[[:space:]]*)$' "$npmrc"; then
      local tmp
      tmp="$(mktemp)"
      grep -vE '^[[:space:]]*prefix[[:space:]]*=[[:space:]]*/[[:space:]]*$' "$npmrc" \
        | grep -vE '^[[:space:]]*globalconfig[[:space:]]*=[[:space:]]*/etc/npmrc[[:space:]]*$' >"$tmp" || true
      mv "$tmp" "$npmrc"
      echo "stripped stray npm prefix=/ or globalconfig=/etc/npmrc from $npmrc"
    fi
  done

  # Resolve nvm's node binary (NVM_BIN after `nvm use`, else newest installed).
  local nvm_node=""
  if [[ -n "${NVM_BIN:-}" && -x "${NVM_BIN}/node" ]]; then
    nvm_node="${NVM_BIN}/node"
  elif [[ -d "$nvm_dir/versions/node" ]]; then
    local ver
    ver="$(ls -1 "$nvm_dir/versions/node" 2>/dev/null | tail -1 || true)"
    if [[ -n "$ver" && -x "$nvm_dir/versions/node/$ver/bin/node" ]]; then
      nvm_node="$nvm_dir/versions/node/$ver/bin/node"
      export NVM_BIN="$nvm_dir/versions/node/$ver/bin"
    fi
  fi

  # Persist across sessions: /usr/local/cargo/bin is first on Cloud PATH and
  # world-writable; symlink nvm's node there so `env node` beats /exec-daemon.
  local cargo_bin="/usr/local/cargo/bin"
  if [[ -n "$nvm_node" && -d "$cargo_bin" && -w "$cargo_bin" ]]; then
    ln -sfn "$nvm_node" "$cargo_bin/node"
    echo "linked $cargo_bin/node -> $nvm_node (ahead of /exec-daemon)"
  fi

  # This install process: prefer cargo bin + nvm bin over /exec-daemon.
  if [[ -d "$cargo_bin" ]]; then
    export PATH="$cargo_bin:${PATH:-}"
  fi
  if [[ -n "${NVM_BIN:-}" && -d "$NVM_BIN" ]]; then
    export PATH="$NVM_BIN:$PATH"
  fi
  hash -r 2>/dev/null || true

  local prefix
  prefix="$(npm config get prefix 2>/dev/null || true)"
  if [[ "$prefix" == "/" || -z "$prefix" ]]; then
    echo "ERROR: npm prefix is '${prefix:-<empty>}' (node=$(command -v node 2>/dev/null || echo missing)). Want nvm's prefix, not /. Refusing to continue." >&2
    exit 1
  fi
  echo "npm prefix ok: $prefix (node=$(command -v node))"
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
usage: bash tools/env/cloud-agent-install.sh [--help|--check-npm-prefix]

Cursor Cloud dashboard install: best-effort mesa/vulkan/xvfb, then
install-browsers.sh, then the chrome-devtools / tinyfish MCP clones.
Idempotent. Exit 0 when the snapshot already has usable deps.

  --check-npm-prefix  only run the npm prefix=/ cure (nvm PATH + cargo
                      bin node link + npmrc strip) and exit.
EOF
  exit 0
fi

if [[ "${1:-}" == "--check-npm-prefix" ]]; then
  ensure_npm_prefix
  exit 0
fi

# Always cure before any npm use (install-browsers.sh, MCP clones).
ensure_npm_prefix

# Arm the commit gate (2026-10-28 split: .githooks/pre-commit is the one owner of
# test:guards for every host). install-browsers.sh installs with --ignore-scripts,
# so package.json "prepare" never ran on a Cloud VM and core.hooksPath stayed
# unset (docs/notes/AGENT-GUARDS-2026-10-14.md). Relative, so each worktree runs
# its own copy; bash-guard.sh refuses a commit while no pre-commit hook would run.
if [[ -f "$ROOT/.githooks/pre-commit" && "$(git -C "$ROOT" config --get core.hooksPath 2>/dev/null || true)" != ".githooks" ]]; then
  git -C "$ROOT" config core.hooksPath .githooks && echo "core.hooksPath set to .githooks (the commit gate)" \
    || echo "WARN: could not set core.hooksPath=.githooks — commits will be refused until npm run prepare" >&2
fi

need_pkg() {
  dpkg -s "$1" >/dev/null 2>&1
}

ensure_apt_pkgs() {
  local missing=()
  local p
  for p in mesa-vulkan-drivers vulkan-tools xvfb tmux; do
    if need_pkg "$p"; then
      continue
    fi
    missing+=("$p")
  done
  if [[ ${#missing[@]} -eq 0 ]]; then
    echo "apt packages already present: mesa-vulkan-drivers vulkan-tools xvfb tmux"
    return 0
  fi
  echo "apt missing: ${missing[*]} — attempting install"
  if ! sudo DEBIAN_FRONTEND=noninteractive apt-get update -y; then
    echo "WARN: apt-get update failed (Ubuntu mirrors often blocked on restricted egress)" >&2
  fi
  if sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"; then
    return 0
  fi
  echo "WARN: apt-get install failed for ${missing[*]}" >&2
  return 1
}

ensure_apt_pkgs || true

# MCP clones live under gitignored scratch/. A live clone dies on cold boot
# unless the environment snapshot is Saved. Do this BEFORE any early exit
# so deferred Playwright browsers do not skip chrome-devtools / TinyFish.
ensure_mcp_clones() {
  if [[ "${APEX_SKIP_CHROME_MCP_CLONE:-}" != "1" ]]; then
    if [[ -f "$ROOT/scratch/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js" ]]; then
      echo "chrome-devtools MCP clone already built"
    else
      echo "Cloning chrome-devtools MCP (best-effort; npx pin remains if this fails)…"
      if ! bash "$ROOT/tools/mcp/chrome-devtools-mcp.sh" clone; then
        echo "WARN: chrome-devtools clone failed; verify uses npx chrome-devtools-mcp@1.11.0" >&2
      fi
    fi
  fi

  if [[ "${APEX_SKIP_TINYFISH_SETUP:-}" != "1" ]]; then
    if [[ -f "$ROOT/scratch/tinyfish-mcp-server/dist/index.js" ]]; then
      echo "tinyfish MCP clone already built"
    else
      echo "Cloning tinyfish MCP (best-effort; deploy-check needs setup)…"
      if ! bash "$ROOT/tools/mcp/tinyfish-mcp.sh" setup; then
        echo "WARN: tinyfish setup failed — run tools/mcp/tinyfish-mcp.sh setup" >&2
      fi
    fi
  fi

  # Dashboard secret / .env override the tracked fallback in tinyfish-mcp.sh.
  # This script never embeds a key. Custom key: https://agent.tinyfish.ai/home
  if [[ -z "${TINYFISH_API_KEY:-}" && ! -f "$ROOT/scratch/tinyfish-mcp-server/.env" ]]; then
    echo "NOTE: TINYFISH_API_KEY unset — tinyfish-mcp.sh uses its tracked fallback. Custom key: https://agent.tinyfish.ai/home"
  fi
}

# The served generated files are gitignored (AGENTS.md rule 11, 2026-10-28): build
# them before anything serves the checkout. Node builtins only; idempotent.
node "$ROOT/tools/gen/ensure-built.mjs" || echo "WARN: ensure-built failed — run node tools/gen/ensure-built.mjs" >&2

if ! bash "$ROOT/tools/env/install-browsers.sh"; then
  system_browser="$(node "$ROOT/tools/lib/chromium-path.mjs" --path || true)"
  if [[ -n "$system_browser" && -x "$system_browser" ]]; then
    echo "WARN: Playwright browser install failed; installed Chrome is present at $system_browser"
    # A browser alone cannot recover incomplete or incompatible test tooling.
    # Match install-browsers.sh's offline direct-dependency validation, including
    # dev packages even when the host defaults to production installs.
    if [[ -f node_modules/playwright/package.json && -f node_modules/sharp/package.json ]] \
        && npm ls --depth=0 --include=dev --offline >/dev/null 2>&1; then
      ensure_mcp_clones
      start_configured_chat_mcp
      echo "OK: cloud-agent install complete (npm ready, browsers deferred)"
      exit 0
    fi
  fi
  echo "ERROR: cloud-agent install failed" >&2
  exit 1
fi

ensure_mcp_clones

# Verify repo MCP wrappers (symlink Playwright chrome channel + mcp-smoke).
# Non-strict: a partial snapshot still passes install; session-start / agents
# use `./tools/mcp/apex-tools-mcp.sh call` when the host catalog is empty.
bash "$ROOT/tools/env/ensure-mcp-ready.sh" || true

start_configured_chat_mcp
echo "OK: cloud-agent install complete"
