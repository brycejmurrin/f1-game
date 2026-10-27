#!/usr/bin/env bash
# @doc Install tools: canonical F1 environment and plugin support.
set -euo pipefail
cd /workspace/f1-game
source /workspace/f1-game/tools/environment/activate.sh
mkdir -p /workspace/f1-toolchain/{bin,packages,root,apt/lists/partial,apt/archives/partial}
cat > /workspace/f1-toolchain/apt/sources.list <<'EOF'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
EOF
cat > /workspace/f1-toolchain/apt/apt.conf <<'EOF'
Dir::Etc::parts "-";
Dir::Etc::main "-";
Dir::Etc::sourcelist "/workspace/f1-toolchain/apt/sources.list";
Dir::Etc::sourceparts "-";
Dir::State::lists "/workspace/f1-toolchain/apt/lists";
Dir::Cache::archives "/workspace/f1-toolchain/apt/archives";
APT::Get::List-Cleanup "0";
Acquire::Retries "0";
EOF
if [[ ! -x /workspace/f1-toolchain/root/usr/bin/tmux || ! -x /workspace/f1-toolchain/root/usr/bin/shellcheck || ! -x /workspace/f1-toolchain/root/usr/bin/glslangValidator ]]; then
  APT_CONFIG=/workspace/f1-toolchain/apt/apt.conf /usr/bin/apt-get update
  (
    cd /workspace/f1-toolchain/packages
    APT_CONFIG=/workspace/f1-toolchain/apt/apt.conf /usr/bin/apt-get download tmux libutempter0 shellcheck glslang-tools spirv-tools
    for deb in ./*.deb; do dpkg-deb -x "$deb" /workspace/f1-toolchain/root; done
  )
fi
for bin in tmux shellcheck glslangValidator; do
  ln -sfn "/workspace/f1-toolchain/root/usr/bin/$bin" "/workspace/f1-toolchain/bin/$bin"
done
if [[ ! -x /workspace/f1-toolchain/bin/actionlint ]]; then
  (
    cd /workspace/f1-toolchain/packages
    curl -fsSL https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz -o actionlint_1.7.12_linux_amd64.tar.gz
    curl -fsSL https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_checksums.txt -o actionlint-checksums.txt
    rg '  actionlint_1.7.12_linux_amd64.tar.gz$' actionlint-checksums.txt > selected-checksum.txt
    sha256sum --check selected-checksum.txt
    tar -xzf actionlint_1.7.12_linux_amd64.tar.gz -C /workspace/f1-toolchain/bin actionlint
  )
fi
bash tools/env/install-lint-bins.sh zizmor
