#!/bin/bash
# PostToolUse hook for Write/Edit/MultiEdit: tell the agent AT ONCE when an
# edit has a consequence it would otherwise learn about at the gate.
#
#   tools/manifest.cjs            -> node tools/gen/gen-shell.mjs --check
#   tests/groups.json             -> node tools/gen/gen-test-groups.mjs --check
#   js/lighting/knobs.js          -> node tools/gen/gen-slider-doc.mjs --check
#   tests/unit/*.test.{mjs,cjs},
#   tests/groups.json             -> node tools/gen/gen-ladder-figures.mjs --check
#   js/circuits/<id>.js,
#   js/circuits/scenery/<id>.js   -> node tools/track/verify-track.cjs <id>
#
# ADVISORY, NEVER BLOCKING: the edit has already happened, this exits 0, and
# the check's verdict goes to stdout, where the model reads it as context.
# A failing check is information ("run npm run gen"), not a veto —
# AGENTS.md §Verification 2 says edit everything first, verify once, so a
# hook that argued with each edit would fight the rule it serves.
#
# verify-track is DEBOUNCED: 2 s per circuit edit adds up in a scenery session
# where one file is touched twenty times, so an id checked within the last
# 30 s is skipped (stamp under artifacts/, regenerable, never committed).
INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin); ti=d.get("tool_input") or {}
    print(ti.get("file_path") or ti.get("notebook_path") or "")
except Exception:
    print("")
')
[ -z "$FILE" ] && exit 0
ROOT="$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$ROOT" ] || exit 0
REL="${FILE#"$ROOT"/}"
cd "$ROOT" || exit 0

say() { printf '[post-edit] %s\n' "$*"; }

# Any js/ file: does it still parse? (folded in from post-edit-check.sh,
# 2026-09-22 — the two hooks landed in parallel sessions; this one's advisory
# shape won, the syntax check came along.) Sub-second, so no debounce.
case "$REL" in
  js/*.js)
    if ! OUT=$(node --check "$FILE" 2>&1); then
      say "$REL does not parse:"; printf '%s\n' "$OUT" | head -n 8
    fi ;;
esac

# A NEW TEST FILE IS THREE REGISTRATIONS, not one (2026-09-24 audit): a group in
# tests/groups.json (else nothing runs it — test-coverage-audit /
# prepush-gate-coverage, now in test:guards), a row in the docs/TESTING.md §5
# coverage table, and the regenerated counts. Say which are missing at the edit,
# not three failures at the commit.
case "$REL" in
  tests/specs/*.spec.js|tests/unit/*.test.mjs|tests/unit/*.test.cjs)
    BASE=$(basename "$REL"); MISSING=()
    if ! node tools/ci/test-coverage-audit.mjs >/dev/null 2>&1 \
       && node tools/ci/test-coverage-audit.mjs 2>&1 | grep -qF "$BASE"; then
      MISSING+=("add it to a group in tests/groups.json (a spec: one topical browser group; a unit file: toolingFast or a ci.yml node group), then \`node tools/gen/gen-test-groups.mjs\`")
    fi
    grep -qF "$BASE" docs/TESTING.md 2>/dev/null || MISSING+=("give it a row in the docs/TESTING.md §5 coverage table (what it covers)")
    case "$REL" in tests/specs/*)   # a unit file's count is the ladder branch below
      node tools/gen/gen-ladder-figures.mjs --check >/dev/null 2>&1 || MISSING+=("run \`npm run gen:docs\` (the spec counts are generated)")
      grep -q "setTimeout" "$REL" 2>/dev/null || MISSING+=("if it boots a race, declare \`test.setTimeout\` above 180 s so the selected CI gate excludes it by name (select-specs.mjs)") ;;
    esac
    if [ ${#MISSING[@]} -gt 0 ]; then
      say "$BASE is not fully registered — test:guards fails the commit until it is:"
      for m in "${MISSING[@]}"; do printf '  - %s\n' "$m"; done
    fi ;;
esac

case "$REL" in
  tools/manifest.cjs)
    if node tools/gen/gen-shell.mjs --check >/dev/null 2>&1; then say "manifest.cjs: index.html / js/roster.js / tools/carview.html are in sync"
    else say "manifest.cjs changed: the shell is now STALE — run \`node tools/gen/gen-shell.mjs\` (or npm run gen) before testing"; fi ;;
  tests/groups.json)
    if node tools/gen/gen-test-groups.mjs --check >/dev/null 2>&1; then say "groups.json: package.json scripts and the tooling-fast list are in sync"
    else say "groups.json changed: package.json test:* scripts and tools/ci/tooling-fast.mjs are STALE — run \`node tools/gen/gen-test-groups.mjs\` (a NEW group needs its package.json key added first), then the docs/TESTING.md group row"; fi
    if ! node tools/gen/gen-ladder-figures.mjs --check >/dev/null 2>&1; then say "groups.json changed the gate ladder: the N-of-M figures in AGENTS.md / PREPUSH-GATE-LADDER.md / TESTING.md are STALE — run \`node tools/gen/gen-ladder-figures.mjs\` (npm run gen:docs)"; fi ;;
  tests/unit/*.test.mjs|tests/unit/*.test.cjs)
    if node tools/gen/gen-ladder-figures.mjs --check >/dev/null 2>&1; then say "$REL: the gate-ladder figures (AGENTS.md rule 3, PREPUSH-GATE-LADDER.md, TESTING.md) are in sync"
    else say "$REL changed the unit-file count: the ladder figures are STALE — run \`node tools/gen/gen-ladder-figures.mjs\` (npm run gen:docs)"; fi ;;
  js/lighting/knobs.js)
    if node tools/gen/gen-slider-doc.mjs --check >/dev/null 2>&1; then say "knobs.js: docs/LIGHTING-TUNER-SLIDERS.md is in sync"
    else say "knobs.js changed: docs/LIGHTING-TUNER-SLIDERS.md is STALE — run \`node tools/gen/gen-slider-doc.mjs\` (npm run gen:docs)"; fi ;;
  js/circuits/*.js|js/circuits/scenery/*.js)
    ID=$(basename "$REL" .js)
    STAMP="artifacts/post-edit/verify-track-$ID"
    NOW=$(date +%s)
    if [ -f "$STAMP" ] && [ $((NOW - $(cat "$STAMP" 2>/dev/null || echo 0))) -lt 30 ]; then
      say "verify-track $ID: checked within 30 s, skipped (edit everything, verify once)"; exit 0
    fi
    mkdir -p artifacts/post-edit
    OUT=$(timeout 60 node tools/track/verify-track.cjs "$ID" 2>&1); RC=$?
    echo "$NOW" > "$STAMP"
    if [ $RC -eq 0 ]; then say "verify-track $ID: OK ($(printf '%s' "$OUT" | tail -n 1))"
    else say "verify-track $ID FAILED (exit $RC) — the circuit no longer builds headlessly:"; printf '%s\n' "$OUT" | tail -n 12; fi ;;
esac
exit 0
