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
# SCAN is the command as the kill rules below see it (2026-09-22). Two holes
# and one false positive were reproduced in the raw text: `sh -c "pkill -f
# chrome"` and `/usr/bin/pkill -f chrome` walked past a regex that matched only
# the bare word at command position, and `echo '… && pkill -f chrome …'` was
# BLOCKED because `&& pkill` inside a quoted string still reads as command
# position. So: heredoc bodies are dropped, every quoted string is blanked —
# except the body of a shell `-c`, which is unwrapped so its contents ARE
# scanned at command position. The commit rule keeps the raw text.
SCAN=$(printf '%s' "$CMD" | python3 -c '
import re,sys
s=sys.stdin.read()
out=[];term=None
for ln in s.split("\n"):
    if term is not None:
        if ln.strip()==term: term=None
        continue
    m=re.search(r"<<-?\s*[\x27\"]?([A-Za-z_][A-Za-z0-9_]*)[\x27\"]?",ln)
    if m: term=m.group(1)
    out.append(ln)
s="\n".join(out)
res=[];i=0;n=len(s)
while i<n:
    c=s[i]
    if c in "\x27\"":
        j=i+1
        while j<n and s[j]!=c:
            if c=="\"" and s[j]=="\\": j+=1
            j+=1
        body=s[i+1:j]
        if re.search(r"(^|\s)-l?c\s*$", s[:i]): res.append(" "+body+" ")
        else: res.append(" ")
        i=j+1
    else:
        res.append(c); i+=1
sys.stdout.write("".join(res))
')
# A subagent never starts a browser run (AGENTS.md §Verification 10). Hook input
# names the agent when the call comes from one (agent_id / agent_type, or a
# transcript under subagents/); the main session carries none of those.
SUBAGENT=$(printf '%s' "$INPUT" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
    print("1" if (d.get("agent_id") or d.get("agent_type") or "/subagents/" in str(d.get("transcript_path") or "")) else "")
except Exception:
    print("")
')
# Prefixes that carry the verb: wrappers, a shell -c, an absolute path.
PRE='((sudo|env|exec|nice|nohup|command)[[:space:]]+)*((sh|bash|dash|zsh)[[:space:]]+-l?c[[:space:]]+)?((sudo|env|exec)[[:space:]]+)*(/[^[:space:]]*/)?'
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
# match the guard's own shell. `sudo`/`env` are hoisted for the same reason,
# and since 2026-09-22 so are a shell `-c` and an absolute path ($PRE).
if printf '%s' "$SCAN" | grep -Eq "(^|[;&|(][[:space:]]*)${PRE}(pkill([[:space:]]+-[A-Za-z0-9]+)*[[:space:]]+(-[a-zA-Z]*f[a-zA-Z]*|--full)|killall)[[:space:]]" \
   && printf '%s' "$SCAN" | grep -Eiq 'chrom|playwright|node|test-bg|npm'; then
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
if printf '%s' "$SCAN" | grep -Eq "(^|[;&|(][[:space:]]*)${PRE}(${PGREP_F}[^|]*\|[[:space:]]*xargs[^|]*kill|kill([[:space:]]+-[A-Za-z0-9]+)*[[:space:]]+\\\$\([[:space:]]*${PGREP_F})" \
   && printf '%s' "$SCAN" | grep -Eiq 'chrom|playwright|node|test-bg|npm'; then
  echo "BLOCKED: pgrep -f piped or substituted into kill orphans Playwright's browsers exactly as pkill -f does. Stop a run with 'node tools/ci/test-bg.mjs --stop'; kill orphan Chrome by PID from a listed set: ps -eo pid,comm | awk '\$2==\"chrome\"{print \$1}'" >&2
  exit 2
fi

# --- kill <pid> of a test-bg supervisor / runner --------------------------------
if printf '%s' "$SCAN" | grep -Eq "(^|[;&|(][[:space:]]*)${PRE}kill([[:space:]]+-[A-Za-z0-9]+)*[[:space:]]+[0-9]"; then
  for pid in $(printf '%s' "$SCAN" | grep -Eo '(^|[[:space:]])[0-9]+' | tr -d ' '); do
    [ -r "/proc/$pid/cmdline" ] || continue
    line=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
    case "$line" in
      *test-bg.mjs*|*run-playwright*|*"npm run test:"*|*"playwright test"*)
        echo "BLOCKED: pid $pid is part of a test-bg run ($line). A bare kill orphans its browsers. Use 'node tools/ci/test-bg.mjs --stop' (or '--stop --sweep' when the supervisor is already dead)." >&2
        exit 2 ;;
    esac
  done
fi

# --- a subagent never starts a browser run --------------------------------------
# AGENTS.md §Verification 10 was prose and a body lint; every agent carries
# Bash, so nothing stopped a `test-bg.mjs` inside one until 2026-09-22. The
# browser starters, at command position: test-bg (anything but --status),
# test-solo, run-playwright, `playwright test`, `npm test`, verify-change
# --wait, the chrome daemon. Node-only groups (`npm run test:tooling-fast`,
# `node --test`) stay open — that is what verify-agent runs.
if [ "$SUBAGENT" = "1" ]; then
  BROWSER='(node[[:space:]]+)?(tools/ci/)?(test-bg\.mjs([[:space:]]+(?!--status)[^[:space:]]+)|test-solo\.mjs|run-playwright\.mjs|verify-change\.mjs[^;&|]*--wait)|(python3?[[:space:]]+)?(tools/mcp/)?probe-mcp\.py[[:space:]]+chrome-start|npx[[:space:]]+playwright[[:space:]]+test|playwright[[:space:]]+test([[:space:]]|$)|npm[[:space:]]+test([[:space:]]|$)'
  if printf '%s' "$SCAN" | grep -Pq "(^|[;&|(][[:space:]]*)${PRE}(${BROWSER})"; then
    echo "BLOCKED: a subagent never starts a browser run (AGENTS.md §Verification 10) — one group saturates this box and the parent owns the only Playwright process. Run the node-only checks (verify-change.mjs --fast, node --test, verify-track.cjs) and report the browser groups as NOT RUN; the parent starts them." >&2
    exit 2
  fi
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
  DOCS_ONLY=0
  if [ -n "$STAGED" ] && ! printf '%s' "$CMD" | grep -Eq -- '(^|[[:space:]])-[a-zA-Z]*a|--all'; then
    DOCS_ONLY=1
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      case "$f" in
        tools/README.md|docs/DEBUG-HOOKS.md|docs/ARCHITECTURE.md|docs/LIGHTING-TUNER-SLIDERS.md) DOCS_ONLY=0; break ;;
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
