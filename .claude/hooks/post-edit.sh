#!/bin/bash
# PostToolUse hook for Write/Edit/MultiEdit: tell the agent AT ONCE when an
# edit has a consequence it would otherwise learn about at the gate.
#
#   js/**/*.js                    -> node --check (does it still parse?)
#   tests/specs/*.spec.js,
#   tests/unit/*.test.{mjs,cjs}   -> is the new file registered (groups.json,
#                                    docs/TESTING.md §5 row, spec counts)?
#   tools/manifest.cjs            -> node tools/gen/gen-shell.mjs --check
#   tests/groups.json             -> node tools/gen/gen-test-groups.mjs --check
#   js/lighting/knobs.js          -> node tools/gen/gen-slider-doc.mjs --check
#   js/circuits/<id>.js,
#   js/circuits/scenery/<id>.js   -> advise a final verify-track check (draft PR #3784, folded in 2026-10-26)
#
# ADVISORY, NEVER BLOCKING: the edit has already happened, this exits 0, and
# the check's verdict reaches the model as hookSpecificOutput.additionalContext.
# Plain PostToolUse stdout goes to the debug log only ("For most events, Claude
# Code writes stdout to the debug log", https://code.claude.com/docs/en/hooks),
# so until 2026-10-15 none of this advice was ever read (#2228 research).
# A failing check is information ("run npm run gen"), not a veto —
# AGENTS.md §Verification 2 says edit everything first, verify once, so a
# hook that argued with each edit would fight the rule it serves.
#
# Circuit definitions and scenery are often edited together. Do not verify an
# intermediate pair or mistake a timestamp-throttled result for final evidence.
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

checks() {

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
    # A file git already tracks passed test:guards at its own commit; only a NEW
    # test file can be unregistered (2026-10-26: 1,154 of 1,187 tracked test files
    # have no basename in TESTING.md, so the old check warned on every test edit).
    if ! git ls-files --error-unmatch -- "$REL" >/dev/null 2>&1; then
      AUDIT_RC=0; AUDIT_OUT=$(node tools/ci/test-coverage-audit.mjs 2>&1) || AUDIT_RC=$?
      if [ "$AUDIT_RC" -ne 0 ] && printf '%s' "$AUDIT_OUT" | grep -qF "$BASE"; then
        MISSING+=("add it to a group in tests/groups.json (a spec: one topical browser group; a unit file: toolingFast or a ci.yml node group), then \`node tools/gen/gen-test-groups.mjs\`")
      fi
      grep -qF "$BASE" docs/TESTING.md 2>/dev/null || MISSING+=("give it a row in the docs/TESTING.md §5 coverage table (what it covers)")
    fi
    # (No "declare > 180 s" advice: that used to tell authors how to opt a
    # spec OUT of the change-aware gate. Since 2026-10-04 a declared-slow
    # routed spec runs in select-specs' over-budget pool instead.)
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
    if node tools/gen/gen-test-groups.mjs --check >/dev/null 2>&1; then say "groups.json: package.json test:* scripts are in sync (tooling-fast reads groups.json at runtime)"
    else say "groups.json changed: package.json test:* scripts are STALE — finish the source group in tests/groups.json, run \`node tools/gen/gen-test-groups.mjs\`, then update the docs/TESTING.md group row"; fi ;;
  js/lighting/knobs.js)
    if node tools/gen/gen-slider-doc.mjs --check >/dev/null 2>&1; then say "knobs.js: docs/LIGHTING-TUNER-SLIDERS.md is in sync"
    else say "knobs.js changed: docs/LIGHTING-TUNER-SLIDERS.md is STALE — run \`node tools/gen/gen-slider-doc.mjs\` (npm run gen:docs)"; fi ;;
  js/circuits/*.js|js/circuits/scenery/*.js)
    ID=$(basename "$REL" .js)
    say "$REL changed: after all circuit and scenery edits, run \`node tools/track/verify-track.cjs $ID\` once; no intermediate build was checked" ;;
esac
}

# One JSON object on stdout, or nothing (a plain line would be read as text).
ADVICE=$(checks)
[ -n "$ADVICE" ] && ADVICE="$ADVICE" python3 -c '
import json, os
print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse",
                  "additionalContext": os.environ["ADVICE"][:9500]}}))
'
exit 0
