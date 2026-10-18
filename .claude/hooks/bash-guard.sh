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
#    --fast/--plan, the chrome daemon, `npm run test:<browser group>`, and the
#    Chromium capture CLIs (tools/shot, tools/ui audits, gfx-probe), read from
#    the parsed argv (round 2, see "one parse" below).
#  git push / gh — force, mirror, delete, deploy-branch pushes are blocked;
#    `gh pr merge --squash|--rebase` is denied and other merges / ready flips
#    ask (merge_policy.py, shared with github-mcp-guard.sh). A push while
#    `tools/ci/queue-depth.mjs` says hold is refused (AGENTS.md rule 4;
#    APEX_PUSH_HOLD=0 overrides) unless the push starts no CI (#2182), and an Actions run cancel (`gh run cancel`,
#    …/actions/runs/<id>/cancel) is refused (APEX_RUN_CANCEL_OK=1 overrides).
#  A commit whose staged paths are ALL prose (docs/, *.md, .claude/skills,
#    .claude/agents, survey images/reports under artifacts/shots/{tracks,gallery}
#    and artifacts/track-survey; never a generated doc) runs only
#    docs-integrity — no ratchet raise, no test:guards.
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
# settings.json deliberately invokes this one guard for every Bash call. Skip
# SCAN and shellparse work for ordinary commands without relying on Claude
# Code's non-portable per-hook `if` field (Cursor imports the file but does not
# document that field); JSON command extraction still runs first.
# Keep the 14 former `if: Bash(*word*)` filters plus the executable agent runner.
GUARD_TRIGGER='git|gh |kill|pgrep|curl|node|npm|npx|playwright|chrom|python|sh |eval|xargs|agent-run'
if ! printf '%s' "$CMD" | grep -Eq "$GUARD_TRIGGER"; then
  exit 0
fi
# Keep legacy raw-text policies (kill/cancel/red-run checks) effective through
# the trusted shell:false output runner too. The parser emits only executable
# wrapper leaves, quoted with shlex.join: literal ';' arguments stay prose.
# Retain the original command so explicit exception assignments remain visible.
AGENT_LEAVES=$(printf '%s' "$CMD" | python3 "$(dirname "$0")/shellparse.py" agent-run "$PWD"); AGENT_LEAVES_RC=$?
if [ "$AGENT_LEAVES_RC" != 0 ]; then
  echo "bash-guard: BLOCKED — trusted wrapper normalization failed." >&2
  exit 2
fi
[ -z "$AGENT_LEAVES" ] || CMD="$CMD"$'\n'"$AGENT_LEAVES"
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
hd=s
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
sys.stdout.write(hd + "\n__APEX_SCAN_SPLIT__\n" + "".join(res))
')
# SCANQ is the heredoc-stripped text WITH its quoted strings (2026-10-15): the
# run-cancel rule reads a URL out of a quoted curl argument, but a heredoc body
# (a test being written, a note) is never a command.
SCANQ="${SCAN%%$'\n'__APEX_SCAN_SPLIT__$'\n'*}"
SCAN="${SCAN#*$'\n'__APEX_SCAN_SPLIT__$'\n'}"
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

# --- git checkout --theirs/--ours <path> on a multi-hunk conflict (#2429) -----
# Advisory only: taking one whole side keeps it for EVERY hunk, and --theirs
# once dropped a unique fix. tools/ci/sync-pr.mjs is the sanctioned path.
if printf '%s' "$SCAN" | grep -Eq "(^|[;&|(][[:space:]]*)${PRE}git([[:space:]]+-[^[:space:]]+)*[[:space:]]+(checkout|restore)[[:space:]].*--(theirs|ours|conflict=)"; then
  set -f
  for w in $(printf '%s\n' "$SCAN" | grep -E "git([[:space:]]+-[^[:space:]]+)*[[:space:]]+(checkout|restore)[[:space:]]" | head -1 | sed -E 's/.*(checkout|restore)//'); do
    case "$w" in -*|\;|\&*|\|*) continue ;; esac
    [ -f "$w" ] || continue
    N=$(grep -c '^<<<<<<< ' "$w" 2>/dev/null || true)
    if [ "${N:-0}" -ge 2 ]; then
      echo "WARNING: $w has $N conflict hunks; this keeps one side for all of them (tools/ci/sync-pr.mjs resolves per hunk)." >&2
    fi
  done
  set +f
fi

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
#
# 2026-10-15 (#2125): `pkill -f` was blocked only when the text also named
# chrom/playwright/node/test-bg/npm, so `pkill -f "serve -l 3456"` passed and
# killed its own shell (exit 144) twice in census siblings. Every `pkill -f X`
# matches the hook-wrapped shell, whose argv contains X, whatever X is, so it
# now blocks unconditionally. `killall` matches process NAMES, not command
# lines, so it keeps the browser/test-tree scope.
PKILL_F='pkill([[:space:]]+[^[:space:];&|()]+)*[[:space:]]+(-[A-Za-z0-9]*f[A-Za-z0-9]*|--full)'
if printf '%s' "$SCAN" | grep -Eq "(^|[;&|(][[:space:]]*)${PRE}${PKILL_F}([[:space:]]|\$)" \
   || { printf '%s' "$SCAN" | grep -Eq "(^|[;&|(][[:space:]]*)${PRE}killall[[:space:]]" \
        && printf '%s' "$SCAN" | grep -Eiq 'chrom|playwright|node|test-bg|npm'; }; then
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

# --- one parse: push, gh, subagent browser ban, and the commit reading -----------
# ROUND 2 (2026-10-14 red-team, docs/notes/AGENT-GUARDS-2026-10-14.md): every
# rule below reads the command through shellparse.py ONCE (`guard` mode), on the
# PARSED argv — quotes removed; `sh|bash -c [--]`, `-ec`, `-o opt`, eval,
# here-strings, `echo '…' | bash`, env/setsid/flock/timeout/nice/xargs wrappers
# and `cd X &&` resolved; `git -c alias.X=…` expanded — instead of a regex on the
# quote-blanked SCAN, which `node "tools/ci/test-bg.mjs"` and `npx playwright
# 'test'` walked past. One python process instead of five also halves latency.
#
#  git push — no force (any unambiguous `--forc…` prefix), --mirror, --delete,
#    --all/--branches, --prune, glob or `:dst` refspecs, never the deploy branch
#    (`refs/heads/`, `heads/`, a bare/HEAD/@ push while on it), never a config
#    that widens a push (`-c push.default=matching|current`, `-c remote.*.push`,
#    `-c remote.*.mirror`, or that config in git for a bare push). settings.json's
#    deny globs are prefix matches on raw text and miss all of these.
#  gh — `gh pr merge --squash|--rebase` and a gh api merge naming squash/rebase
#    are DENIED; any other `gh pr merge` (incl. --auto), `gh pr ready`, `gh api`
#    …/pulls/<n>/merge or GraphQL merge/auto-merge/ready mutation ASKS, unless
#    APEX_MERGE_DESK=1 (merge_policy.py: the same words as github-mcp-guard.sh).
#    No settings.json `ask` rule for these: it would also prompt Merge Desk.
#  subagent browser ban (§Verification 10) — test-bg (but --status/--tail),
#    test-solo, run-playwright, verify-change without --fast/--plan, `playwright
#    test` however launched (npx [--yes], npm exec, node_modules/.bin, cli.js),
#    `npm test|t|tst`, `npm run|run-script test|test:<browser group>`, the
#    Chromium capture CLIs (tools/shot/*.mjs but frame-report/cam-*, tools/ui
#    audits, gfx-probe, mcp-cli) unless --help/--plan, the chrome daemon, and
#    `apex-tools-mcp.sh call <browser apex_* tool>`. Node-only checks stay open.
# Text the parser cannot tokenise (an unbalanced quote) falls back to the regexes
# on SCAN below: it would not run as written, so a false positive costs nothing.
HOOKDIR="$(cd "$(dirname "$0")" && pwd)"
GUARD_OUT=$(printf '%s' "$INPUT" | python3 "$HOOKDIR/shellparse.py" guard "$ROOT"); GUARD_RC=$?
[ "$GUARD_RC" = 2 ] && exit 2
COMMIT_LINE=$(printf '%s\n' "$GUARD_OUT" | sed -n 1p)
PARSE=$(printf '%s\n' "$GUARD_OUT" | sed -n 2p)
GH_DECISION=$(printf '%s\n' "$GUARD_OUT" | sed -n '3,$p')
if [ "$GUARD_RC" != 0 ] || [ "$PARSE" != "PARSE ok" ]; then
  # Unparseable (or the parser crashed): the regex fallbacks, all fail-closed.
  if printf '%s' "$SCAN" | grep -Eq "(^|[;&|({\`][[:space:]]*)${PRE}([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*(/[^[:space:]]*/)?git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+push([[:space:]]|\$)"; then
    echo "BLOCKED: this command contains a git push the guard cannot parse (an unbalanced quote?). Write the push as one plain command." >&2
    exit 2
  fi
  SUBAGENT=$(printf '%s' "$INPUT" | grep -Eq '"(agent_id|agent_type)"[[:space:]]*:[[:space:]]*"[^"]|/subagents/' && echo 1)
  if [ "$SUBAGENT" = "1" ]; then
    P='(node[[:space:]]+)?([^[:space:];&|()]*/)?'
    BROWSER="${P}(test-bg\.mjs([[:space:]]+(?!--status|--tail)[^[:space:]]+)|test-solo\.mjs|run-playwright\.mjs|verify-change\.mjs(?![^;&|]*--(fast|plan)))|(python3?[[:space:]]+)?([^[:space:];&|()]*/)?probe-mcp\.py[[:space:]]+chrome-start|npx[[:space:]]+playwright[[:space:]]+test|playwright[[:space:]]+test([[:space:]]|$)|npm[[:space:]]+test([[:space:]]|$)"
    # 2026-10-14: the capture CLIs boot Chromium too (harness.mjs launchChromium /
    # playwright): every tools/shot/*.mjs except the node-VM ones (frame-report,
    # cam-corners, cam-motion), tools/ui/{layout-audit,menu-mock,css-play}.mjs and
    # tools/gfx/gfx-probe.mjs. --help / --plan print and exit, so they stay open.
    CAPTURE="${P}(shot/(?!(frame-report|cam-corners|cam-motion)\.mjs)[A-Za-z0-9_-]+\.mjs|ui/(layout-audit|menu-mock|css-play)\.mjs|gfx/gfx-probe\.mjs)(?![^;&|]*[[:space:]]--(help|plan)([[:space:]=]|\$))"
    BROWSER="${BROWSER}|${CAPTURE}"
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
      echo "BLOCKED: a subagent never starts a browser run (AGENTS.md §Verification 10), and this command could not be parsed. Run the node-only checks and report the browser groups as NOT RUN." >&2
      exit 2
    fi
  fi
  if printf '%s' "$SCAN" | grep -Eq "(^|[;&|(][[:space:]]*)${PRE}gh[[:space:]].*(pr[[:space:]]+(merge|ready)|api[[:space:]])"; then
    GH_DECISION='{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": "bash-guard could not parse this gh call; confirm it by hand."}}'
  fi
fi
# ONE JSON object on the way out (stdout is parsed as JSON only when it is a
# single object): the gh ask/deny, and COMMIT_CTX — which path a PASSING commit
# took and how long it ran. stderr is hidden on exit 0, so a successful commit
# used to leave the model unable to tell docs-integrity-only from test:guards.
# Per https://code.claude.com/docs/en/hooks, hookSpecificOutput.additionalContext
# reaches the model (a system reminder next to the tool result) and systemMessage
# is shown to the user; neither changes the allow. Printed only on exit 0, so a
# later exit-2 rule (the commit guards) still wins over a gh ask.
COMMIT_CTX=""
emit_on_exit() {
  rc=$?
  [ "$rc" = 0 ] || return
  [ -n "$GH_DECISION$COMMIT_CTX" ] || return
  GH_DECISION="$GH_DECISION" COMMIT_CTX="$COMMIT_CTX" python3 -c '
import json, os
d = {}
try:
    d = json.loads(os.environ.get("GH_DECISION") or "{}")
except Exception:
    d = {}
ctx = os.environ.get("COMMIT_CTX") or ""
if ctx:
    h = d.setdefault("hookSpecificOutput", {"hookEventName": "PreToolUse"})
    h["additionalContext"] = ctx
    d["systemMessage"] = ctx
print(json.dumps(d))
'
}
trap emit_on_exit EXIT
if [ -n "$GH_DECISION" ] && printf '%s' "$GH_DECISION" | grep -q '"deny"'; then exit 0; fi

# --- cancelling an Actions run ---------------------------------------------------
# NEVER (2026-10-15, docs/notes/CI-CLOG-SURVEY-2026-10-15.md): a queued run holds
# no slot, so a cancel sweep frees nothing — it throws away the run's queue
# position and the branch owner pushes a "retrigger" commit, which buys a new
# run plus a docs-guards run at the back of the queue. 306 of 401 PR runs ended
# cancelled that day. Your own superseded run is replaced by your next push and
# a closed PR's runs are cancelled by the close; nothing else needs a cancel.
# `gh run cancel` on SCAN (command position); the REST path on SCANQ (quoted
# strings kept, heredoc bodies dropped: a quoted URL is blanked out of SCAN,
# and a heredoc body is text being written). github-mcp-guard.sh is the MCP
# door (actions_run_trigger cancel_workflow_run). APEX_RUN_CANCEL_OK=1 when the
# user asked for the cancel.
if [ "${APEX_RUN_CANCEL_OK:-}" != 1 ] && ! printf '%s' "$SCAN" | grep -Eq 'APEX_RUN_CANCEL_OK=1'; then
  if printf '%s' "$SCAN" | grep -Eq "(^|[;&|(][[:space:]]*)${PRE}gh[[:space:]]+run[[:space:]]+cancel([[:space:]]|\$)" \
     || printf '%s' "$SCANQ" | grep -Eq 'actions/runs/[^/[:space:]]+/(force-)?cancel'; then
    echo "BLOCKED: cancelling an Actions run. A queued run holds no slot — a cancel only loses its queue position and buys a retrigger push (2026-10-15: 306 of 401 PR runs). Your own superseded run is replaced by your next push; a closed PR's runs are cancelled by the close. APEX_RUN_CANCEL_OK=1 <command> only when the user asked for this cancel." >&2
    exit 2
  fi
fi

# No queue hold on git push (retired 2026-10-16, the CI/CD review #2333 finding 7).
# The hold held pushes for hours on 2026-10-15 and then released ~30 sessions
# in one minute; a held push runs later and costs the same slot-minutes, and
# the pool ran at 39 of 40 slots all day regardless. queue-depth.mjs stays an
# informational gauge.

# H2 (retro 2026-10-17): memory-sync.sh hides the tracked .claude/memory files with
# assume-unchanged so the Stop hook stops nagging; any git verb that reads or rewrites the
# index sees the real files first, so a memory edit rides the next commit.
GIT_VERB='git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+(add|commit|checkout|switch|merge|pull|stash|reset|restore|rebase|cherry-pick|status|diff)([[:space:]]|$)'
if printf '%s' "$SCAN" | grep -Eq "(^|[;&|({\`][[:space:]]*)${PRE}${GIT_VERB}"; then
  "$HOOKDIR/memory-sync.sh" unmark </dev/null >/dev/null 2>&1 || true
fi

# H4 (retro 2026-10-17): a push over a red local run. `tooling-fast ...; git push` pushed
# despite "= run failed (39 passed, 1 failed)". Two refusals: a `;`/newline chain from a
# tooling-fast / test:tooling-fast run into a push (`&&` is the safe join), and any push while
# the newest tooling-fast log, written after HEAD was committed, ends `= run failed`.
# APEX_PUSH_FAILED_OK=1 overrides (the push is a fix for that very failure, or a docs push).
PUSH_RX="(^|[;&|({\`][[:space:]]*)${PRE}([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*(/[^[:space:]]*/)?git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+push([[:space:]]|\$)"
if [ "${APEX_PUSH_FAILED_OK:-}" != 1 ] && ! printf '%s' "$SCAN" | grep -Eq 'APEX_PUSH_FAILED_OK=1' \
   && printf '%s' "$SCAN" | grep -Eq "$PUSH_RX"; then
  if printf '%s' "$SCAN" | tr '\n' ';' | grep -Eq "tooling-fast[^;&|]*;[[:space:]]*([^&|]*[;&|][[:space:]]*)?git[[:space:]]+push"; then
    echo "BLOCKED: 'tooling-fast ...; git push' pushes even when the run is red (retro 2026-10-17). Join with '&&', or run tooling-fast first and push after you read its '= run' line." >&2
    exit 2
  fi
  TF_LOG=$(ls -t "$ROOT"/artifacts/logs/tooling-fast*.log 2>/dev/null | head -1)
  if [ -n "$TF_LOG" ]; then
    HEAD_CT=$(git -C "$ROOT" log -1 --format=%ct 2>/dev/null || echo 0)
    LOG_MT=$(stat -c %Y "$TF_LOG" 2>/dev/null || echo 0)
    if [ "$LOG_MT" -ge "${HEAD_CT:-0}" ] && [ "$(grep -E '^= run ' "$TF_LOG" | tail -1 | cut -c1-12)" = "= run failed" ]; then
      echo "BLOCKED: the newest tooling-fast log ($TF_LOG) ends '$(grep -E '^= run ' "$TF_LOG" | tail -1)', written after HEAD was committed. Fix it and re-run before pushing; APEX_PUSH_FAILED_OK=1 only when this push is the fix or is not code." >&2
      exit 2
    fi
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
# FOUND is how many `git … commit` the parser read (dry runs included); 0 or NULL
# is where the broad fallback regex decides.
case "$COMMIT_LINE" in "0 "*|NULL|"") C_FOUND=0 ;; *) C_FOUND=1 ;; esac
if [ "$C_FOUND" = 0 ]; then
  if printf '%s' "$SCAN" | grep -Eq "(^|[;&|({\`][[:space:]]*)((if|then|else|elif|while|until|do|time|!)[[:space:]]+)*${PRE}([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*(/[^[:space:]]*/)?git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+commit([[:space:]]|\$)"; then
    COMMIT_LINE="1 1 1 -"
  else
    COMMIT_LINE="0 0 0 -"
  fi
fi
# One line: FOUND RUN ALL GITDIR PATHS… — RUN=1 when any commit is real (not
# --dry-run, not APEX_SKIP_GUARDS=1), ALL=1 when any is -a/--all, PATHS the
# union of pathspecs (shellparse.py guard prints it).
read -r _C_N C_RUN C_ALL C_GITDIR C_PATHS <<EOF
$COMMIT_LINE
EOF
# `git add X && git commit` IN ONE COMMAND (2026-10-15 blocker census: 7 blocks
# in 7 sessions). This hook runs before the whole command, so X is still
# unstaged when the unstaged rule below reads the tree. A `git add` in the same
# command counts as staged: its paths join the unstaged cover and the docs-only
# set (never C_PATHS, the commit's own pathspec, which the ratchet rule reads);
# -A/--all/-u/--update/./:/ stage everything, so they read like `commit -a`.
ADD_PATHS=""; ADD_ALL=0
set -f   # a glob pathspec stays a word, not this cwd's matches
for w in $(printf '%s\n' "$SCAN" | grep -oE "(^|[;&|(][[:space:]]*)git([[:space:]]+-C[[:space:]]+[^[:space:];&|()]+)?[[:space:]]+add([[:space:]]+[^;&|()[:space:]]+)*" \
           | sed -E 's/^[;&|([:space:]]*git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+add//'); do
  case "$w" in
    -A|--all|-u|--update|.|:/) ADD_ALL=1 ;;
    -*) ;;
    *) ADD_PATHS="$ADD_PATHS $w" ;;
  esac
done
set +f
[ "$ADD_ALL" = 1 ] && C_ALL=1
# Another host's adapter (.cursor/hooks/shell-guard.sh, used by Cursor and
# Codex) sets APEX_COMMIT_GATE=githook when core.hooksPath is .githooks: the
# git pre-commit hook runs this same gate there, so it is not run twice.
[ "${APEX_COMMIT_GATE:-}" = githook ] && C_RUN=0
if [ "${C_RUN:-0}" = "1" ] && ! printf '%s' "$SCAN" | grep -Eq -- 'APEX_SKIP_GUARDS=1'; then
  # `git -C <dir> commit` commits in <dir>'s tree, not the hook's cwd.
  if [ -n "$C_GITDIR" ] && [ "$C_GITDIR" != "-" ]; then
    R2="$(git -C "$C_GITDIR" rev-parse --show-toplevel 2>/dev/null || true)"
    [ -n "$R2" ] && ROOT="$R2"
  fi
  # A LINKED WORKTREE BORROWS THE MAIN CHECKOUT'S node_modules (2026-10-15).
  # EnterWorktree, `isolation: worktree` subagents and `git worktree add` make
  # a tree with no node_modules, so every worker commit used to block here
  # (census session_01CgCjzTvy729SeWsHzuv8eh). The dependencies are the same
  # package.json, the link is git-ignored (`node_modules` in .gitignore), and
  # the main checkout's install is what SessionStart already verified.
  if [ ! -e "$ROOT/node_modules" ]; then
    WT_COMMON="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
    WT_MAIN="$([ -n "$WT_COMMON" ] && dirname "$WT_COMMON")"
    if [ -n "$WT_MAIN" ] && [ "$WT_MAIN" != "$ROOT" ] && [ -d "$WT_MAIN/node_modules" ]; then
      ln -s "$WT_MAIN/node_modules" "$ROOT/node_modules" 2>/dev/null || true
    fi
  fi
  if [ -z "${APEX_GUARD_PROBE:-}" ] && [ ! -d "$ROOT/node_modules" ]; then
    echo "BLOCKED: node_modules is missing, so 'npm run test:guards' cannot run before this commit. Run the SessionStart install (bash tools/env/cloud-agent-install.sh) first." >&2
    exit 2
  fi
  mkdir -p "$ROOT/artifacts"
  LOG="$ROOT/artifacts/pre-commit-guards.log"
  # A GUARD RUN THAT OUTLIVES THE HOOK MUST BLOCK, NOT PASS (2026-10-14). The
  # hook's own timeout is 180 s (settings.json); a hook killed there used to let
  # the commit through unguarded on a loaded box. The inner runs are capped
  # below it and rc 124 blocks with a reason; settings.json also sets
  # onFailure "block". APEX_GUARD_TIMEOUT (seconds) exists for the tests.
  GUARD_T="${APEX_GUARD_TIMEOUT:-160}"
  # H5 (retro 2026-10-17): at loadavg >= 3 the 160 s cap blocked a commit that was fine alone
  # (gfx-backend-canary, #2647). A loaded box gets the longer cap; settings.json's hook
  # timeout (360 s) sits above it. An explicit APEX_GUARD_TIMEOUT always wins.
  if [ -z "${APEX_GUARD_TIMEOUT:-}" ] && awk '{exit !($1 >= 3)}' /proc/loadavg 2>/dev/null; then GUARD_T=300; fi
  guard_timed_out() {
    if [ "$1" = 124 ] || [ "$1" = 137 ]; then
      echo "BLOCKED: $2 did not finish within ${GUARD_T} s (the box is loaded: check /proc/loadavg and any live playwright run), so this commit was NOT guarded. Retry when the box is idle; APEX_SKIP_GUARDS=1 only when the guards themselves are the change." >&2
      exit 2
    fi
  }
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
  for p in $C_PATHS $ADD_PATHS; do COMMITTED="$COMMITTED
$p"; done
  GENERATED_DOCS=$(cd "$ROOT" && node tools/gen/targets.mjs 2>/dev/null | tr '\n' ' ')
  [ -n "$GENERATED_DOCS" ] || GENERATED_DOCS="tools/README.md docs/DEBUG-HOOKS.md docs/ARCHITECTURE.md docs/LIGHTING-TUNER-SLIDERS.md docs/notes/PREPUSH-GATE-LADDER.md"
  DOCS_ONLY=0
  # `--all` / -a stage at commit time: the index is not what will be committed.
  if [ -n "$STAGED$C_PATHS$ADD_PATHS" ] && [ "$C_ALL" != "1" ]; then
    DOCS_ONLY=1
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      # The generated-doc list comes from the generators themselves
      # (tools/gen/targets.mjs prints each gen-*.mjs TARGET); the literal
      # list is the fallback for a box where node cannot run.
      case " $GENERATED_DOCS " in
        *" $f "*) DOCS_ONLY=0; break ;;
      esac
      # Survey assets count as prose (2026-10-15): image/report output in the
      # track-survey-assets dirs only (docs/notes/SURVEY-ASSETS-BRANCH.md). That
      # branch dropped ci.yml (#2234), so test:guards is red there by
      # construction and every image commit needed APEX_SKIP_GUARDS=1.
      printf '%s' "$f" | grep -Eq '^(docs/|\.claude/skills/|\.claude/agents/)|\.md$|^artifacts/(shots/(tracks|gallery)|track-survey)/.+\.(png|jpe?g|webp|json|html)$' || { DOCS_ONLY=0; break; }
    done <<EOF
$COMMITTED
EOF
  fi
  if [ -n "${APEX_GUARD_PROBE:-}" ] && [ "$DOCS_ONLY" = 1 ]; then
    echo "bash-guard probe: commit docs-only" >&2; exit 0
  fi
  # A TREE WITH NO tools/ (the track-survey-assets image branches) CANNOT RUN
  # THE GUARDS: skip with a note instead of leaving the model to find
  # APEX_SKIP_GUARDS=1 (#2428). Only when every committed path sits outside
  # js/ css/ tools/ tests/ and the generated shell files; `commit -a` stages at
  # commit time, so it never skips.
  if [ ! -d "$ROOT/tools/ci" ] && [ ! -d "$ROOT/tools/check" ] && [ "$C_ALL" != "1" ] && [ -n "$(printf '%s' "$COMMITTED" | tr -d '[:space:]')" ] \
     && ! printf '%s\n' "$COMMITTED" | grep -Eq '^(js/|css/|tools/|tests/)|^(index\.html|sw\.js|version\.json|package\.json|CHANGELOG\.md)$'; then
    echo "guards skipped: no tools/ in this tree" >&2
    exit 0
  fi
  if [ "$DOCS_ONLY" = 1 ]; then
    T0=$(date +%s)
    (cd "$ROOT" && timeout -k 5 "$GUARD_T" node --test tests/unit/docs-integrity.test.mjs >"$LOG" 2>&1); RC=$?
    guard_timed_out "$RC" "docs-integrity"
    if [ "$RC" != 0 ]; then
      echo "BLOCKED: tests/unit/docs-integrity.test.mjs is red (links, index rows). Last lines of $LOG:" >&2
      grep -E 'not ok|Error|expected|actual|✖' "$LOG" | tail -20 >&2
      exit 2
    fi
    echo "docs-only commit: ran docs-integrity only (no ratchet raise, no test:guards)." >&2
    COMMIT_CTX="bash-guard: docs-only commit — ran tests/unit/docs-integrity.test.mjs only (green, $(( $(date +%s) - T0 )) s); no ratchet raise, no test:guards."
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
      for p in $C_PATHS $ADD_PATHS; do
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
  # to 40 lines in a ratcheted file raises its ceiling and STAGES it — on a
  # topic branch as a delta in tests/data/ratchets.d/<branch>.json (only this
  # branch touches it, so two PRs growing one module never conflict, #2291),
  # else tests/data/ratchets.json — so the raise is in this commit's diff
  # instead of a hand edit plus a second guard run. Bigger growth still blocks.
  # ONE GUARD RUN PER COMMIT, NOT ONE PER MATCHING FILTER (2026-10-17).
  # settings.json registers this hook under 14 `if:` filters, so a commit
  # command that also says node/sh/npm/... starts two or more copies at once:
  # each ran the full suite, doubling the load and sharing $LOG, so one timed
  # out (160/300 s) while its twin went green in 202 s — seven blocked
  # commits in a row. Copies now queue on a lock, and a later copy reuses a
  # GREEN verdict for the same staged tree (git write-tree) from the last
  # 10 minutes. Red and timed-out runs are never reused.
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$ROOT/artifacts/pre-commit-guards.lock"
    flock -w $(( GUARD_T + 60 )) 9 || true
  fi
  RLOG="$ROOT/artifacts/pre-commit-ratchets.log"
  if (cd "$ROOT" && node tools/check/ratchets.mjs --auto-raise >"$RLOG" 2>&1); then
    if grep -q '^RAISED\|^LOWERED' "$RLOG"; then
      (cd "$ROOT" && git add -A -- tests/data/ratchets.json tests/data/ratchets.d) || true
      grep '^RAISED\|^LOWERED' "$RLOG" >&2
      # A pathspec commit (--only, git's default with paths) commits ONLY the
      # named paths, so the staged raise would be left behind.
      if [ -n "$C_PATHS" ] && ! printf ' %s ' "$C_PATHS" | grep -q ' tests/data/ratchets.json \| tests/data/ratchets.d\(/[^ ]*\)\? \| tests/data/ \| tests/ \| \. '; then
        echo "BLOCKED: the ratchet raise above is staged, but this pathspec commit carries only the paths it names. Add tests/data/ratchets.d (and tests/data/ratchets.json) to the command (or commit without a pathspec)." >&2
        exit 2
      fi
    fi
  else
    echo "BLOCKED: a size ratchet is over its ceiling in a way the auto-raise may not absorb (only a per-file line count, by <= 40, is absorbed) ($RLOG):" >&2
    grep '^OVER' "$RLOG" >&2
    exit 2
  fi
  T0=$(date +%s)
  TREE=$(cd "$ROOT" && git write-tree 2>/dev/null)
  OKF="$ROOT/artifacts/pre-commit-guards.ok"
  RAISED=$(grep -c '^RAISED\|^LOWERED' "$RLOG" 2>/dev/null)
  if [ -n "$TREE" ] && [ -f "$OKF" ] && [ "$(cat "$OKF" 2>/dev/null)" = "$TREE" ] \
     && [ -n "$(find "$OKF" -mmin -10 2>/dev/null)" ]; then
    COMMIT_CTX="bash-guard: code commit — ratchets --auto-raise (${RAISED:-0} raised/lowered); test:guards already green for staged tree $TREE (a concurrent copy of this hook ran it; log $LOG)."
    exit 0
  fi
  (cd "$ROOT" && timeout -k 5 "$GUARD_T" npm run --silent test:guards >"$LOG" 2>&1); RC=$?
  guard_timed_out "$RC" "npm run test:guards"
  if [ "$RC" != 0 ]; then
    echo "BLOCKED: npm run test:guards is red — AGENTS.md §Verification 3 forbids committing on a red guard. Last lines of $LOG:" >&2
    grep -E 'not ok|Error|expected|actual|✖' "$LOG" | tail -20 >&2
    echo "Fix the guard (or prefix with APEX_SKIP_GUARDS=1 when the guards themselves are the change under test)." >&2
    exit 2
  fi
  [ -n "$TREE" ] && printf '%s' "$TREE" > "$OKF"
  COMMIT_CTX="bash-guard: code commit — ratchets --auto-raise (${RAISED:-0} raised/lowered) then npm run test:guards (green, $(( $(date +%s) - T0 )) s; log $LOG)."
fi
exit 0
