#!/bin/bash
# PreToolUse guard for Bash. AGENTS.md rules made deterministic (§Verification
# 3, 6/7 and 10 below):
#
#  §Verification 3 — `git commit` runs `npm run test:guards` first (~5 s since
#    the slider-doc check stopped rebuilding a regex per slider; 16 s before
#    2026-09-16) and a red result blocks the commit. Prefix the command with
#    APEX_SKIP_GUARDS=1 only when the guards themselves are what you are fixing.
#    Before the guards, `ratchets.mjs --auto-raise` absorbs ≤ 40 lines of growth
#    in a ratcheted file into the commit (the raise is staged and printed).
#    Every shape of commit is seen (shellparse.py: `git -c k=v`, `--no-pager`,
#    `bash -c`, `env`/VAR= prefixes, an absolute git path), a pathspec counts as
#    committed content, and a commit whose tracked files differ between the
#    index and the working tree is refused — the guards read the working tree,
#    so they must agree with what is committed. APEX_GUARD_PROBE=1 (hook env,
#    tests only) stops after the classification.
#  §Verification 6/7 — a test-bg run is stopped with `test-bg.mjs --stop`,
#    never by PID; `pkill -f` / `killall` against chrome, node or playwright
#    matches your own shell and orphans browsers. Kill orphan Chrome by a
#    listed PID (`ps -eo pid,comm | awk '$2=="chrome"{print $1}'`) instead.
#    Also blocked: `pgrep -f … | xargs kill` / `kill $(pgrep -f …)`, and a bare
#    `kill <pid>` whose pid is a test-bg supervisor or runner.
#  §Verification 10 — a SUBAGENT (hook input carries agent_id / agent_type) never
#    starts a browser run: test-bg (except --status/--tail), test-solo,
#    run-playwright, `playwright test`, `npm test`, verify-change without
#    --fast/--plan, the chrome daemon, `npm run test:<browser group>`.
#  A commit whose staged paths are ALL prose (docs/, *.md, .claude/skills,
#    .claude/agents; never a generated doc) runs only docs-integrity — no
#    ratchet raise, no test:guards.
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
' 2>/dev/null)
# EXTRACTION FAILURE IS NOT AN EMPTY COMMAND (2026-09-22). Every rule in this
# file sits below this line, so a missing python3, a renamed hook-input key or
# an undecodable payload used to exit 0 SILENTLY: a git commit landed with no
# guards run and a subagent could start a browser group, with nothing anywhere
# saying the guard had not run. A hook that fails open must at least fail
# LOUDLY, and where the raw payload still shows a rule's signature we block on
# that rather than shrug.
if [ -z "$CMD" ]; then
  # A genuinely empty command is normal; a payload that plainly carries one is not.
  if printf '%s' "$INPUT" | grep -q '"command"[[:space:]]*:[[:space:]]*"..'; then
    echo "bash-guard: COULD NOT READ the command out of the hook payload (python3 missing, or the input shape changed)." >&2
    echo "bash-guard: the kill/commit/subagent rules did NOT run. Fix the hook before trusting this session's guards." >&2
    # Last-resort scan of the raw payload for the two rules that protect other
    # processes; a false positive here is cheaper than an orphaned browser fleet.
    if printf '%s' "$INPUT" | grep -qE '(pkill|killall)[[:space:]]+(-[A-Za-z]+[[:space:]]+)*(chrome|chromium|node|playwright)'; then
      echo "bash-guard: BLOCKED — the raw payload matches the pkill/killall rule (AGENTS.md §Verification 7)." >&2
      exit 2
    fi
  fi
  exit 0
fi
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
out=[];term=None;keep=False;L=s.split("\n")
for n,ln in enumerate(L):
    if term is not None:
        if ln.strip()==term: term=None
        elif keep: out.append(ln)
        continue
    m=re.search(r"(?<!<)<<(?!<)-?\s*[\x27\"]?([A-Za-z_][A-Za-z0-9_]*)[\x27\"]?",ln)
    # a heredoc needs its closing line and is not a `$(( 1 << n ))` shift (2026-10-09)
    if m and ln[:m.start()].count("((")<=ln[:m.start()].count("))") and any(x.strip()==m.group(1) for x in L[n+1:]):
        term=m.group(1)
        # a body a SHELL runs (bash <<EOF, cat <<EOF | bash) is commands, so it
        # stays in SCAN: the commit fallback and the kill rules must see it (15-F6)
        keep=bool(re.search(r"(^|[;&|(\s])(\S*/)?(sh|bash|dash|zsh|source|eval)(\s|$)",ln[:m.start()]) or re.search(r"\|\s*(\S*/)?(sh|bash|dash|zsh)(\s|$)",ln[m.end():]))
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
# 15-F7: `timeout 5 pkill -f chrome` and `xargs pkill -f` are the same kill (timeout,
# xargs and their flags/duration are wrappers; setsid/doas/stdbuf likewise).
PRE='((sudo|env|exec|nice|nohup|command|setsid|doas|stdbuf([[:space:]]+-[^[:space:]]+)*|timeout([[:space:]]+-[^[:space:]]+([[:space:]]+[0-9.]+[smhd]?)?)*[[:space:]]+[0-9.]+[smhd]?|xargs([[:space:]]+-[^[:space:]]+([[:space:]]+[0-9]+)?)*)[[:space:]]+)*((sh|bash|dash|zsh)[[:space:]]+-l?c[[:space:]]+)?((sudo|env|exec)[[:space:]]+)*(/[^[:space:]]*/)?'
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
#
# 2026-10-09 (M36): the walk was `-[A-Za-z0-9]+` flags only, so `pkill -9f
# node` (a digit before the f), `pkill -u root -f chrome` (a flag with an
# argument) and `pkill --signal 9 -f chrome` (a long flag) walked past. Now ANY
# non-separator words may precede the -f cluster: PKILL_F.
PKILL_F='pkill([[:space:]]+[^[:space:];&|()]+)*[[:space:]]+(-[A-Za-z0-9]*f[A-Za-z0-9]*|--full)'
if printf '%s' "$SCAN" | grep -Eq "(^|[;&|(][[:space:]]*)${PRE}(${PKILL_F}([[:space:]]|\$)|killall[[:space:]])" \
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
PGREP_F='pgrep([[:space:]]+[^[:space:];&|()]+)*[[:space:]]+(-[A-Za-z0-9]*f[A-Za-z0-9]*|--full)'
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
      # The supervisor test-bg records is `sh -c "…; npm run --silent test:<g> …;
      # echo '[test-bg] END …'"` — `npm run test:` alone never matched it (the
      # --silent sits between), so `kill <pid from --status>` walked through.
      *test-bg.mjs*|*run-playwright*|*"npm run"*" test:"*|*"npm run test:"*|*"[test-bg] END"*|*"playwright test"*)
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
  # Any path prefix (./tools/ci/, an absolute path) — `(tools/ci/)?` alone let
  # `node ./tools/ci/test-bg.mjs smoke` through. test-bg is open only for the
  # read-only verbs (--status, --tail). verify-change is open only for --fast /
  # --plan: its bare form starts batch 1 through test-bg. `npm run test:<g>` is
  # blocked for the groups that drive a browser, read from tests/groups.json.
  P='(node[[:space:]]+)?([^[:space:];&|()]*/)?'
  BROWSER="${P}(test-bg\.mjs([[:space:]]+(?!--status|--tail)[^[:space:]]+)|test-solo\.mjs|run-playwright\.mjs|verify-change\.mjs(?![^;&|]*--(fast|plan)))|(python3?[[:space:]]+)?([^[:space:];&|()]*/)?probe-mcp\.py[[:space:]]+chrome-start|npx[[:space:]]+playwright[[:space:]]+test|playwright[[:space:]]+test([[:space:]]|$)|npm[[:space:]]+test([[:space:]]|$)"
  BGROUPS=$(python3 -c '
import json,re,sys
try:
    g=json.load(open(sys.argv[1]))["groups"]
    print("|".join(re.escape(k[5:]) for k,v in g.items() if k[5:]
          if v.get("kind")=="browser" or "playwright" in (v.get("cmd") or "")))
except Exception:
    print("")
' "$ROOT/tests/groups.json")
  [ -n "$BGROUPS" ] && BROWSER="${BROWSER}|npm[[:space:]]+run([[:space:]]+-[-a-z]+)*[[:space:]]+test:(${BGROUPS})([[:space:]]|\$)"
  if printf '%s' "$SCAN" | grep -Pq "(^|[;&|(][[:space:]]*)${PRE}(${BROWSER})"; then
    echo "BLOCKED: a subagent never starts a browser run (AGENTS.md §Verification 10) — one group saturates this box and the parent owns the only Playwright process. Run the node-only checks (verify-change.mjs --fast, node --test, verify-track.cjs) and report the browser groups as NOT RUN; the parent starts them." >&2
    exit 2
  fi
fi

# --- guards before git commit ---------------------------------------------------
# WHICH COMMANDS ARE COMMITS (2026-10-04). The regex this replaced matched
# `git( -C dir)? commit` on the raw text, so `git -c k=v commit`, `git
# --no-pager commit`, `bash -c "git commit"`, `env X=1 git commit`,
# `GIT_AUTHOR_NAME=x git commit` and `/usr/bin/git commit` all committed with
# no guard run. shellparse.py tokenises the command as the shell will
# (quotes, heredoc bodies, wrappers, `sh -c` bodies, VAR=value prefixes) and
# returns every `git … commit` with its -a / pathspec / --dry-run reading.
# FAIL CLOSED (2026-10-09, L12): shellparse walks compound commands (if/then/
# else/fi, while/for/do/done, { … }, subshells, lists) and prints `null` on text
# it cannot tokenise; this block ran the regex fallback only for an empty or
# `null` answer, but the parser answered `[]` for `if …; then git commit; fi`,
# `{ git commit; }`, a line holding `$((1 << n))` and an unbalanced quote — all
# real commits. Now the fallback also runs for `[]`: a broad regex on SCAN
# (reserved words allowed before the verb) that, if it sees a commit the parser
# did not, treats it as a real `-a` commit. A guard run on a false positive is
# only 25 s; a commit that skips the guards is the failure being closed.
HOOKDIR="$(cd "$(dirname "$0")" && pwd)"
COMMIT_JSON=$(printf '%s' "$CMD" | python3 "$HOOKDIR/shellparse.py" commit 2>/dev/null)
if [ -z "$COMMIT_JSON" ] || [ "$COMMIT_JSON" = "null" ] || [ "$COMMIT_JSON" = "[]" ]; then
  if printf '%s' "$SCAN" | grep -Eq "(^|[;&|({\`][[:space:]]*)((if|then|else|elif|while|until|do|time|!)[[:space:]]+)*${PRE}([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*(/[^[:space:]]*/)?git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+commit([[:space:]]|\$)"; then
    COMMIT_JSON='[{"all":true,"paths":[],"include":false,"dry":false,"skip":false,"gitdir":null}]'
  else
    COMMIT_JSON='[]'
  fi
fi
# One line: RUN ALL GITDIR PATHS… — RUN=1 when any commit is real (not
# --dry-run), ALL=1 when any is -a/--all, PATHS the union of pathspecs.
read -r C_RUN C_ALL C_GITDIR C_PATHS <<EOF
$(printf '%s' "$COMMIT_JSON" | python3 -c '
import json,sys
c=[x for x in json.load(sys.stdin) if not x.get("dry") and not x.get("skip")]
paths=sorted({p for x in c for p in x.get("paths") or []})
gd=next((x["gitdir"] for x in c if x.get("gitdir")), "") or "-"
print("1" if c else "0", "1" if any(x.get("all") for x in c) else "0", gd, " ".join(paths))
' 2>/dev/null)
EOF
if [ "${C_RUN:-0}" = "1" ] && ! printf '%s' "$SCAN" | grep -Eq -- 'APEX_SKIP_GUARDS=1'; then
  # `git -C <dir> commit` commits in <dir>'s tree, not the hook's cwd.
  if [ -n "$C_GITDIR" ] && [ "$C_GITDIR" != "-" ]; then
    R2="$(git -C "$C_GITDIR" rev-parse --show-toplevel 2>/dev/null || true)"
    [ -n "$R2" ] && ROOT="$R2"
  fi
  if [ -z "${APEX_GUARD_PROBE:-}" ] && [ ! -d "$ROOT/node_modules" ]; then
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
  STAGED=$(cd "$ROOT" && git diff --cached --name-only --no-renames 2>/dev/null)   # --no-renames: a moved-out source file must show (M36)
  # A PATHSPEC COMMITS WHAT IT NAMES (2026-10-04): `git commit docs/a.md
  # js/game.js` with only docs/a.md staged used to take the docs-only path
  # and commit js/game.js unguarded. The named paths join the set judged.
  COMMITTED="$STAGED"
  for p in $C_PATHS; do COMMITTED="$COMMITTED
$p"; done
  GENERATED_DOCS=$(cd "$ROOT" && node tools/gen/targets.mjs 2>/dev/null | tr '\n' ' ')
  [ -n "$GENERATED_DOCS" ] || GENERATED_DOCS="tools/README.md docs/DEBUG-HOOKS.md docs/ARCHITECTURE.md docs/LIGHTING-TUNER-SLIDERS.md docs/notes/PREPUSH-GATE-LADDER.md"
  DOCS_ONLY=0
  # `--all` / -a stage at commit time: the index is not what will be committed.
  if [ -n "$STAGED$C_PATHS" ] && [ "$C_ALL" != "1" ]; then
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
$COMMITTED
EOF
  fi
  if [ -n "${APEX_GUARD_PROBE:-}" ] && [ "$DOCS_ONLY" = 1 ]; then
    echo "bash-guard probe: commit docs-only" >&2; exit 0
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
  # THE GUARDS MEASURE THE WORKING TREE; THE COMMIT IS THE INDEX (2026-10-04).
  # A tracked file whose working copy differs from what is staged makes the
  # verdict about content this commit does not carry — green on an unstaged
  # fix while the staged half is red, or the reverse. Stash-free: the
  # `git diff` (worktree vs index) names are compared with what is committed,
  # and the commit is refused until they agree. `-a` stages everything, and a
  # pathspec commits its paths from the working tree, so neither counts; the
  # synced auto-memory under .claude/memory/ never reaches a guard.
  if [ "$C_ALL" != "1" ]; then
    UNSTAGED=$(cd "$ROOT" && git diff --name-only 2>/dev/null | while IFS= read -r f; do
      [ -z "$f" ] && continue
      case "$f" in .claude/memory/*) continue ;; esac
      covered=0
      for p in $C_PATHS; do
        p="${p%/}"; case "$f" in "$p"|"$p"/*) covered=1 ;; esac
        [ "$p" = "." ] && covered=1
      done
      [ "$covered" = 1 ] || printf '%s\n' "$f"
    done)
    if [ -n "$UNSTAGED" ]; then
      N=$(printf '%s\n' "$UNSTAGED" | grep -c .)
      echo "BLOCKED: the guards measure the working tree, but $N tracked file(s) differ from what this commit holds (unstaged changes):" >&2
      printf '%s\n' "$UNSTAGED" | head -10 | sed 's/^/  /' >&2
      echo "Stage them (git add), commit with -a, or set them aside (git stash push -- <paths>), then commit again — so the guard verdict is about this commit. APEX_SKIP_GUARDS=1 bypasses when that is deliberate." >&2
      exit 2
    fi
  fi
  if [ -n "${APEX_GUARD_PROBE:-}" ]; then
    echo "bash-guard probe: commit code paths=${C_PATHS:-}" >&2; exit 0
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
      # A pathspec commit (--only, git's default with paths) commits ONLY the
      # named paths, so the staged raise would be left behind.
      if [ -n "$C_PATHS" ] && ! printf ' %s ' "$C_PATHS" | grep -q ' tests/data/ratchets.json \| tests/data/ \| tests/ \| \. '; then
        echo "BLOCKED: the ratchet raise above is staged, but this pathspec commit carries only the paths it names. Add tests/data/ratchets.json to the command (or commit without a pathspec)." >&2
        exit 2
      fi
    fi
  else
    echo "BLOCKED: a size ratchet is over its ceiling in a way the auto-raise may not absorb (only a per-file line count, by <= 40, is absorbed) ($RLOG):" >&2
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
