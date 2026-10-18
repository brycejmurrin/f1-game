#!/usr/bin/env bash
# @doc Pinned, checksummed install of actionlint, shellcheck, zizmor, glslang and naga into artifacts/bin.
# Installs what tools/check/workflow-lint.mjs and tools/check/shader-validate.mjs
# run. Both checks SKIP LOUDLY when a binary is absent, so this is the one step
# that makes them real; CI caches artifacts/bin on a hash of this file.
#
# Why these channels (GitHub release assets are not reachable from every
# sandbox, so each tool uses a registry that carries its own integrity check):
#   zizmor      PyPI wheel, `pip --require-hashes` (hashes below, PyPI 2026-10-18). MIT.
#               https://docs.zizmor.sh/installation/
#   actionlint  `go install …@v1.7.12`; go.sum + sum.golang.org verify the module. MIT.
#               https://github.com/rhysd/actionlint/blob/main/docs/install.md
#   shellcheck  apt `shellcheck` (Ubuntu archive signature; GPL-3, run as a separate process).
#               actionlint shells out to it for every `run:` block; without it those
#               findings vanish, so workflow-lint reports its absence as a SKIP row.
#   glslang     apt `glslang-tools` (Ubuntu archive signature; BSD-3 + Khronos). apt cannot
#               pin an archive revision that security updates retire, so the version is
#               printed on every run instead (shader-validate prints it in its receipt).
#               https://github.com/KhronosGroup/glslang
#   naga        `cargo install naga-cli --locked --version 30.0.1` (crates.io
#               checksums via the registry index). Apache-2.0 / MIT. ADVISORY use only.
#               https://github.com/gfx-rs/wgpu/tree/trunk/naga-cli
#
# usage: bash tools/env/install-lint-bins.sh [--plan] [tool…]   (default: all five)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$ROOT/artifacts/bin"
ACTIONLINT_VERSION=v1.7.12
NAGA_VERSION=30.0.1
# zizmor 1.31.1 wheels (one per Linux arch), sha256 from https://pypi.org/pypi/zizmor/1.31.1/json. MIT.
# Bump: new version + the new hashes from the same URL; pip refuses anything else (--require-hashes).
ZIZMOR_REQUIREMENTS='zizmor==1.31.1 \
    --hash=sha256:58e878eb2dbd2c6183c105e1ac28c14f7dd1eca44a783f1fe2a69647d012c410 \
    --hash=sha256:d9b36840c560a8abe39d9ef3d077239aabf6d572c5c2b629c970592a617dbf6f \
    --hash=sha256:d8a5f86fbf93e65e9d42de9eb4c1855d195c5e9cdeef4f228093ad6711bd8ee4'

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then sed -n '2,3p' "$0"; exit 0; fi
PLAN=0; [[ "${1:-}" == "--plan" ]] && { PLAN=1; shift; }
TOOLS=("$@"); [[ ${#TOOLS[@]} -eq 0 ]] && TOOLS=(actionlint shellcheck zizmor glslang naga)
mkdir -p "$BIN"
rc=0
have() { [[ -x "$1" ]]; }
for t in "${TOOLS[@]}"; do
  case "$t" in
    actionlint)
      have "$BIN/actionlint" && { echo "ok   actionlint ($("$BIN/actionlint" -version | head -1))"; continue; }
      echo "plan actionlint $ACTIONLINT_VERSION via go install"; [[ $PLAN == 1 ]] && continue
      GOBIN="$BIN" GOFLAGS=-mod=mod go install "github.com/rhysd/actionlint/cmd/actionlint@$ACTIONLINT_VERSION" || { echo "FAIL actionlint" >&2; rc=1; } ;;
    zizmor)
      have "$BIN/venv/bin/zizmor" && { echo "ok   zizmor ($("$BIN/venv/bin/zizmor" --version))"; continue; }
      echo "plan zizmor via pip --require-hashes"; [[ $PLAN == 1 ]] && continue
      { python3 -m venv "$BIN/venv" && printf '%s\n' "$ZIZMOR_REQUIREMENTS" > "$BIN/zizmor.requirements.txt" && "$BIN/venv/bin/pip" install -q --require-hashes -r "$BIN/zizmor.requirements.txt"; } || { echo "FAIL zizmor" >&2; rc=1; } ;;
    shellcheck|glslang)
      BINNAME=shellcheck; PKG=shellcheck
      [[ $t == glslang ]] && { BINNAME=glslangValidator; PKG=glslang-tools; }
      if command -v "$BINNAME" >/dev/null 2>&1; then echo "ok   $BINNAME ($(command -v "$BINNAME"))"; continue; fi
      echo "plan $PKG via apt"; [[ $PLAN == 1 ]] && continue
      SUDO=""; [[ $(id -u) -ne 0 ]] && SUDO="sudo"
      { $SUDO apt-get install -y -q "$PKG" || { $SUDO apt-get update -q && $SUDO apt-get install -y -q "$PKG"; }; } >/dev/null || { echo "FAIL $t" >&2; rc=1; } ;;
    naga)
      have "$BIN/cargo/bin/naga" && { echo "ok   naga ($("$BIN/cargo/bin/naga" --version 2>&1 | head -1))"; continue; }
      echo "plan naga-cli $NAGA_VERSION via cargo --locked"; [[ $PLAN == 1 ]] && continue
      cargo install naga-cli --locked --version "$NAGA_VERSION" --root "$BIN/cargo" || { echo "FAIL naga" >&2; rc=1; } ;;
    *) echo "unknown tool: $t" >&2; rc=2 ;;
  esac
done
exit $rc
