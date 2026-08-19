#!/usr/bin/env bash
# Apply the select-specs HEAD~1 wire-up to .github/workflows/ci.yml
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CI="$ROOT/.github/workflows/ci.yml"
python3 - <<'PY'
from pathlib import Path
import os
root = Path(os.environ.get("ROOT", "."))
ci = root / ".github/workflows/ci.yml"
text = ci.read_text()
start = text.find("        run: |", text.find("Select specs for this change"))
if start < 0:
    if "run: bash tools/ci-select-specs-step.sh" in text:
        print("already wired")
        raise SystemExit(0)
    raise SystemExit("select-specs run block not found")
next_step = text.find("\n      - name:", start)
if next_step < 0:
    raise SystemExit("next step not found")
new = text[:start] + "        run: bash tools/ci-select-specs-step.sh" + text[next_step:]
assert "run: bash tools/ci-select-specs-step.sh" in new
assert "no valid comparison base for $EVENT" not in new
ci.write_text(new)
print("wired ok, len", len(new))
PY
