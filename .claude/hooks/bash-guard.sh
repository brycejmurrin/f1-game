#!/bin/bash
# PreToolUse guard for Bash. Two AGENTS.md rules made deterministic:
#
#  §Verification 3 — `git commit` runs `npm run test:guards` first (~5 s since
#    the slider-doc check stopped rebuilding a regex per slider; 16 s before
#    2026-09-16) and a red result blocks the commit. Prefix the command with
#    APEX_SKIP_GUARDS=1 only when the guards themselves are what you are fixing.
#    Before the guards, `ratchets.mjs --auto-raise` absorbs ≤ 40 lines of growth
#    in a ratcheted file into the commit (the raise is staged and printed).
#  §Verification 6/7 — a test-bg run is stopped with `test-bg.mjs --stop`,
#    never by PID; `pkill -f` / `killall` against chrome, node or playwright
#    matches your own shell and orphans browsers. Kill orphan Chrome by a
#    listed PID (`ps -eo pid,comm | awk '$2=="chrome"{print $1}'`) instead.
#
# Exit 2 blocks with the reason on stderr; exit 0 lets the normal permission
# flow decide.

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c '
import json,sys
try:
    print((json.load(sys.stdin).get("tool_input") or {}).get("command") or "")
except Exception:
    print("")
')
[ -z "$CMD" ] && exit 0
# THE TREE THE COMMIT LANDS IN, NOT THE SESSION'S. $CLAUDE_PROJECT_DIR names
# the MAIN checkout, so a commit made from a LINKED WORKTREE read the main
# tree's staged list, gated files the commit does not touch, and `--auto-raise`
# staged tests/data/ratchets.json into the MAIN index — a write into a tree
# nobody was looking at. `git rev-parse --show-toplevel` from the hook's own cwd
# names the worktree actually committing; the old value stays as the fallback
# for a cwd that is not a work tree at all.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$ROOT" ] || ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# --- pkill -f / killall on the browser or test tree ---------------------------
# Command position only (start of line or after ; & | ( ), so a commit message
# or echo that merely MENTIONS the words is not blocked.
#
# The flag walk `([[:space:]]+-[A-Za-z0-9]+)*` before the -f is load-bearing:
# the pattern used to require -f as the FIRST flag, so `pkill -9 -f node` and
# `pkill -TERM -f chrome` — the two forms anyone reaches for when a plain pkill
# "did not work" — walked straight past a guard whose whole point is that they
# match the guard's own shell. `sudo`/`env` are hoisted for the same reason.
if printf '%s' "$CMD" | grep -Eq '(^|[;&|(][[:space:]]*)((sudo|env)[[:space:]]+)*(pkill([[:space:]]+-[A-Za-z0-9]+)*[[:space:]]+(-[a-zA-Z]*f[a-zA-Z]*|--full)|killall)[[:space:]]' \
   && printf '%s' "$CMD" | grep -Eiq 'chrom|playwright|node|test-bg|npm'; then
  echo "BLOCKED: pkill -f / killall matches your own shell (its command line contains the pattern) and orphans Playwright's browsers. Stop a run with 'node tools/ci/test-bg.mjs --stop'; kill orphan Chrome by PID from a listed set: ps -eo pid,comm | awk '\$2==\"chrome\"{print \$1}'" >&2
  exit 2
fi

# --- pgrep -f … reaching kill through a pipe or a substitution -----------------
# A pgrep -f list piped into xargs kill, or substituted into kill, orphans the
# same browsers as a bare pkill -f, and the literal-PID walk below cannot see
# them: the pids are not in the command text. Command position on the leading
# verb, exactly like the pkill rule above — a commit message or a doc that
# QUOTES either form is prose, not an invocation. (This guard blocked its own
# commit before the anchor went in.)
PGREP_F='pgrep([[:space:]]+-[A-Za-z0-9]+)*[[:space:]]+(-[a-zA-Z]*f[a-zA-Z]*|--full)'
if printf '%s' "$CMD" | grep -Eq "(^|[;&|(][[:space:]]*)(${PGREP_F}[^|]*\|[[:space:]]*xargs[^|]*kill|kill([[:space:]]+-[A-Za-z0-9]+)*[[:space:]]+\\\$\([[:space:]]*${PGREP_F})" \
   && printf '%s' "$CMD" | grep -Eiq 'chrom|playwright|node|test-bg|npm'; then
  echo "BLOCKED: pgrep -f piped or substituted into kill orphans Playwright's browsers exactly as pkill -f does. Stop a run with 'node tools/ci/test-bg.mjs --stop'; kill orphan Chrome by PID from a listed set: ps -eo pid,comm | awk '\$2==\"chrome\"{print \$1}'" >&2
  exit 2
fi

# --- kill <pid> of a test-bg supervisor / runner --------------------------------
if printf '%s' "$CMD" | grep -Eq '(^|[;&|(][[:space:]]*)kill([[:space:]]+-[A-Za-z0-9]+)*[[:space:]]+[0-9]'; then
  for pid in $(printf '%s' "$CMD" | grep -Eo '(^|[[:space:]])[0-9]+' | tr -d ' '); do
    [ -r "/proc/$pid/cmdline" ] || continue
    line=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
    case "$line" in
      *test-bg.mjs*|*run-playwright*|*"npm run test:"*|*"playwright test"*)
        echo "BLOCKED: pid $pid is part of a test-bg run ($line). A bare kill orphans its browsers. Use 'node tools/ci/test-bg.mjs --stop' (or '--stop --sweep' when the supervisor is already dead)." >&2
        exit 2 ;;
    esac
  done
fi

# --- guards before git commit ---------------------------------------------------
if printf '%s' "$CMD" | grep -Eq '(^|[;&|(][[:space:]]*)git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit([[:space:]]|$)' \
   && ! printf '%s' "$CMD" | grep -Eq -- '--dry-run|APEX_SKIP_GUARDS=1'; then
  if [ ! -d "$ROOT/node_modules" ]; then
    echo "BLOCKED: node_modules is missing, so 'npm run test:guards' cannot run before this commit. Run the SessionStart install (bash tools/env/cloud-agent-install.sh) first." >&2
    exit 2
  fi
  mkdir -p "$ROOT/artifacts"
  LOG="$ROOT/artifacts/pre-commit-guards.log"
  # DOCS-ONLY COMMITS SKIP TO docs-integrity. The deploy branch takes a lot of
  # note-only commits (one 2026-09-16 session made four), and the guards and
  # the ratchets have nothing to say about prose — worse, --auto-raise can stage
  # tests/data/ratchets.json into a commit that changed no code at all. The path
  # set is deliberately narrow: docs/, any .md, skills and agents. A GENERATED
  # doc is excluded — it is prose whose SOURCE is code, so generated-docs must
  # still run — and so is an empty staged list (`git commit -a`, or a pathspec
  # on the command line, stages at commit time, and nothing staged must never
  # read as "nothing to check").
  STAGED=$(cd "$ROOT" && git diff --cached --name-only 2>/dev/null)
  GENERATED_DOCS=$(cd "$ROOT" && node tools/gen/targets.mjs 2>/dev/null | tr '\n' ' ')
  [ -n "$GENERATED_DOCS" ] || GENERATED_DOCS="tools/README.md docs/DEBUG-HOOKS.md docs/ARCHITECTURE.md docs/LIGHTING-TUNER-SLIDERS.md"
  DOCS_ONLY=0
  if [ -n "$STAGED" ] && ! printf '%s' "$CMD" | grep -Eq -- '(^|[[:space:]])-[a-zA-Z]*a|--all'; then
    DOCS_ONLY=1
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      # The generated-doc list comes from the generators themselves
      # (tools/gen/targets.mjs prints each gen-*.mjs TARGET); the literal
      # list is the fallback for a box where node cannot run.
      case " $GENERATED_DOCS " in
        *" $f "*) DOCS_ONLY=0; break ;;
      esac
      printf '%s' "$f" | grep -Eq '^(docs/|\.claude/skills/|\.claude/agents/)|\.md$' || { DOCS_ONLY=0; break; }
    done <<EOF
$STAGED
EOF
  fi
  if [ "$DOCS_ONLY" = 1 ]; then
    if ! (cd "$ROOT" && node --test tests/unit/docs-integrity.test.mjs >"$LOG" 2>&1); then
      echo "BLOCKED: tests/unit/docs-integrity.test.mjs is red (links, index rows). Last lines of $LOG:" >&2
      grep -E 'not ok|Error|expected|actual|✖' "$LOG" | tail -20 >&2
      exit 2
    fi
    echo "docs-only commit: ran docs-integrity only (no ratchet raise, no test:guards)." >&2
    exit 0
  fi
  # Size ratchets first (tools/check/ratchets.mjs --auto-raise): growth of up
  # to 40 lines in a ratcheted file raises its ceiling and STAGES
  # tests/data/ratchets.json, so the raise is in this commit's diff instead of
  # a hand edit plus a second guard run. Bigger growth still blocks below.
  RLOG="$ROOT/artifacts/pre-commit-ratchets.log"
  if (cd "$ROOT" && node tools/check/ratchets.mjs --auto-raise >"$RLOG" 2>&1); then
    if grep -q '^RAISED\|^LOWERED' "$RLOG"; then
      (cd "$ROOT" && git add tests/data/ratchets.json) || true
      grep '^RAISED\|^LOWERED' "$RLOG" >&2
    fi
  else
    echo "BLOCKED: a size ratchet is over its ceiling by more than the auto-raise allows ($RLOG):" >&2
    grep '^OVER' "$RLOG" >&2
    exit 2
  fi
  if ! (cd "$ROOT" && npm run --silent test:guards >"$LOG" 2>&1); then
    echo "BLOCKED: npm run test:guards is red — AGENTS.md §Verification 3 forbids committing on a red guard. Last lines of $LOG:" >&2
    grep -E 'not ok|Error|expected|actual|✖' "$LOG" | tail -20 >&2
    echo "Fix the guard (or prefix with APEX_SKIP_GUARDS=1 when the guards themselves are the change under test)." >&2
    exit 2
  fi
fi
exit 0
