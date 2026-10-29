#!/bin/bash
# PreToolUse guard for Bash: FAST, FAIL-CLOSED refusals only. AGENTS.md rules
# made deterministic (rule 12 and §Verification 6/7 and 10 below):
#
#  Rule 12 — the COMMIT GATE IS NOT HERE (2026-10-28, Bryce: "Yes, split it";
#    docs/plans/2026-10-27-landing-and-agent-ops.md §4). `.githooks/pre-commit`
#    is the one owner of `test:guards`, the docs-only path and the ratchet
#    auto-raise for every host; this hook ran the same 50–110 s suite before
#    `git commit` under a 360 s timeout and now answers in milliseconds
#    (settings.json timeout 30 s). What stays here is what git cannot enforce on
#    itself — keeping that hook reachable: `git commit --no-verify` / `-n` and
#    any core.hooksPath write (`git config`, `-c`, GIT_CONFIG_KEY_n) are refused
#    in every shell shape (shellparse.py guard), and a commit in this project's
#    tree is refused when no executable pre-commit hook would run (fix:
#    `npm run prepare`). Every shape of commit is seen (shellparse.py: `git -c
#    k=v`, `--no-pager`, `bash -c`, `env`/VAR= prefixes, an absolute git path,
#    compound syntax; unparseable text falls back to a broad regex).
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
#    `gh pr merge --squash|--rebase` is denied, `gh pr merge|ready <n>` needs the
#    gate receipt, and other merges / ready flips ASK — for everyone since
#    2026-10-26 (APEX_MERGE_DESK no longer silences them; merge_policy.py, shared
#    with github-mcp-guard.sh); the queue-depth
#    push hold is retired (2026-10-16, see below), and an Actions run cancel (`gh run cancel`,
#    …/actions/runs/<id>/cancel) is refused (APEX_RUN_CANCEL_OK=1 overrides).
#  Shared safety bans (Fleet A + D, Bryce 2026-10-22; Cursor reaches this file
#    through .cursor/hooks/shell-guard.sh): a `ratchets.mjs` run that can RAISE
#    a ceiling (--update / --fragment / --absolute without --lower-only or
#    --preview; .githooks/pre-commit's own --auto-raise is not a tool call and
#    stays; APEX_RATCHET_RAISE_OK=1 when Bryce typed the raise), and a push over
#    a FOREIGN pusher: the branch gained another author's commits on the remote
#    since this checkout last pushed it (foreign_push.py; APEX_FOREIGN_PUSH_OK=1
#    once the branch is confirmed yours). Both in shellparse.py guard().
#  Transcript Auditor batch 9 (2026-10-24), also in guard(): ban 5 refuses
#    turning commit signing off (`-c commit.gpgsign=false`, `--no-gpg-sign`,
#    `git config … gpgsign false|--unset`); ban 6 refuses a git ref written
#    through `gh api` (DELETE/PATCH/PUT/POST …/git/refs). Advisory, never a block (additionalContext):
#    ready-gate/merge-gate piped without `set -o pipefail` (the held-file push advisory over
#    fleet-owner.mjs was retired 2026-10-27). A push to a cursor/* branch whose every PR is merged
#    or closed is refused (one REST call; APEX_CLOSED_PR_PUSH_OK=1 as the
#    push's own prefix when Bryce reopened it; an API error fails open).
#  GitHub API through ANY client (2026-10-26 system audit §10; user grant, Bryce
#    2026-10-26 ~23:00 PT: "Fix hook or guard or perm"). The egress proxy swaps
#    any Authorization header for the admin App token, so `curl -X PUT
#    …/pulls/N/merge` squash-merged with no hook in the way. curl, wget,
#    `node -e` fetch and `python -c` calls to api.github.com (and a web
#    …/pull/N/merge) get the `gh api` policy (shellparse.api_classify): squash/
#    rebase denied, git/refs and contents writes refused, other merges, ready
#    flips, PR/issue closes, update-branch and pages.yml/ci.yml dispatches ask,
#    reads pass.
#  Shell poll loops (2026-10-26): a for/while/until loop that sleeps while
#    watching CI, git, the API or the bus, or a `seq` loop that sleeps, is
#    refused — subscribe and arm ONE Monitor instead (APEX_POLL_OK=1 for a
#    bounded network retry).
#
# FAIL CLOSED ON ITS OWN ERRORS (2026-10-28). Claude Code lets a PreToolUse
# call through when a hook exits with anything but 0 or 2 unless the handler
# sets onFailure "block" (https://code.claude.com/docs/en/hooks §Block the action
# when a hook fails, read 2026-10-28), and Cursor/Codex reach this script through
# adapters with their own rules. So the script maps its own failures to exit 2:
# an unreadable or malformed payload, a crashed helper (python3, shellparse.py),
# any failing command outside a condition (ERR trap) and any other exit status
# (EXIT trap). Not `pipefail`: `printf … | grep -q` would read a SIGPIPE'd
# printf as a non-match and silently skip a rule.
#
# Exit 2 blocks with the reason on stderr; exit 0 lets the normal permission
# flow decide (with any ask/deny JSON on stdout).

set -uE
GH_DECISION=""
COMMIT_CTX=""
# ONE JSON object on the way out (stdout is parsed as JSON only when it is a
# single object): the gh ask/deny, and COMMIT_CTX — an advisory about the commit
# gate. stderr is hidden on exit 0. Per https://code.claude.com/docs/en/hooks,
# hookSpecificOutput.additionalContext reaches the model and systemMessage is
# shown to the user; neither changes the allow. Printed only on exit 0, so an
# exit-2 rule still wins over a gh ask.
finish() {
  rc=$?
  trap - ERR
  if [ "$rc" != 0 ] && [ "$rc" != 2 ]; then
    echo "BLOCKED: bash-guard stopped with exit $rc before its rules finished, so this command is refused (fail closed). Report the hook error; do not work around it." >&2
    exit 2
  fi
  [ "$rc" = 0 ] || exit 2
  [ -n "$GH_DECISION$COMMIT_CTX" ] || exit 0
  if ! GH_DECISION="$GH_DECISION" COMMIT_CTX="$COMMIT_CTX" python3 -c '
import json, os
raw = os.environ.get("GH_DECISION") or ""
d = json.loads(raw) if raw else {}
if raw:
    h = d.get("hookSpecificOutput") if isinstance(d, dict) else None
    if not isinstance(h, dict) or h.get("hookEventName") != "PreToolUse":
        raise ValueError("malformed guard event")
    for key in ("permissionDecisionReason", "additionalContext"):
        if key in h and not isinstance(h[key], str):
            raise ValueError("malformed guard " + key)
    if "permissionDecision" in h:
        if h["permissionDecision"] not in ("allow", "ask", "deny"):
            raise ValueError("malformed guard decision")
    elif not h.get("additionalContext"):
        raise ValueError("guard advisory has no context")
ctx = os.environ.get("COMMIT_CTX") or ""
if ctx:
    h = d.setdefault("hookSpecificOutput", {"hookEventName": "PreToolUse"})
    h["additionalContext"] = "\n".join(x for x in (h.get("additionalContext"), ctx) if x)
    d["systemMessage"] = ctx
print(json.dumps(d))
'; then
    echo "BLOCKED: bash-guard could not write its decision JSON, so this command is refused (fail closed)." >&2
    exit 2
  fi
  exit 0
}
trap finish EXIT
trap 'echo "BLOCKED: bash-guard failed at line $LINENO (exit $?), so this command is refused (fail closed). Report the hook error; do not work around it." >&2; exit 2' ERR

INPUT=$(cat)
# pass-4 red-team R14: without python3 every rule below is skipped. The other gates fail closed
# (settings.json onFailure block); so does this one.
if ! command -v python3 >/dev/null 2>&1; then
  echo "BLOCKED: bash-guard needs python3 to read the command and run the push/commit/kill rules; none ran. Install python3 (tools/env/cloud-agent-install.sh) before continuing." >&2
  exit 2
fi
# A MALFORMED PAYLOAD IS A REFUSAL (2026-10-28; before that it was a loud pass,
# 2026-09-22): not JSON, not an object, a non-object tool_input or a non-string
# command means the rules below cannot read what will run. A missing or empty
# command is an empty command.
CMD_RC=0
CMD=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    ti = d.get("tool_input") if isinstance(d, dict) else None
    ti = {} if ti is None else ti
    c = ti.get("command") if isinstance(ti, dict) else None
    if not isinstance(d, dict) or not isinstance(ti, dict) or not isinstance(c, (str, type(None))):
        raise ValueError("unexpected payload shape")
except Exception:
    sys.exit(3)
sys.stdout.write(c or "")
' 2>/dev/null) || CMD_RC=$?
if [ "$CMD_RC" = 3 ]; then
  echo "BLOCKED: bash-guard could not read the command out of the hook payload (not JSON, or an unexpected shape), so none of its rules ran and the command is refused (fail closed)." >&2
  exit 2
elif [ "$CMD_RC" != 0 ]; then
  echo "BLOCKED: bash-guard's payload reader (python3) failed with exit $CMD_RC, so none of its rules ran and the command is refused (fail closed)." >&2
  exit 2
fi
[ -n "$CMD" ] || exit 0
# settings.json deliberately invokes this one guard for every Bash call. Skip
# SCAN and shellparse work for ordinary commands without relying on Claude
# Code's non-portable per-hook `if` field (Cursor imports the file but does not
# document that field); JSON command extraction still runs first.
# WHOLE WORDS (2026-10-26 system audit §4): the substring union matched
# `.claude/skills` (kill), `digit` (git), `high ` (gh ), `evaluate` (eval), so
# most calls paid the ~200 ms parse. Each verb the rules below read, as a word:
# the former 14 `if: Bash(*word*)` filters, the agent runner, wget/sleep (the
# API and poll-loop rules), `github` (a run-cancel URL in data) and the browser
# launchers run as bare scripts.
GUARD_TRIGGER='\b(git|github|gh|push|merge|commit|config|kill|pkill|killall|pgrep|curl|wget|node|nodejs|npm|npx|pnpm|pnpx|yarn|bun|bunx|deno|tsx|playwright|chrome|chromium|google-chrome|python|python3|perl|ruby|sh|bash|dash|zsh|eval|exec|source|xargs|sleep|agent-run|test-bg|test-solo|run-playwright|verify-change|probe-mcp|apex-tools-mcp|js-debugger-mcp)\b'
if ! printf '%s' "$CMD" | grep -Eq "$GUARD_TRIGGER"; then
  exit 0
fi
# Keep legacy raw-text policies (kill/cancel/red-run checks) effective through
# the trusted shell:false output runner too. The parser emits only executable
# wrapper leaves, quoted with shlex.join: literal ';' arguments stay prose.
# Retain the original command so explicit exception assignments remain visible.
if ! AGENT_LEAVES=$(printf '%s' "$CMD" | python3 "$(dirname "$0")/shellparse.py" agent-run "$PWD"); then
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
# A `git stash` while a merge is in progress drops MERGE_HEAD, and the next commit lands
# with ONE parent (2026-10-26: a sync merge of the deploy tip was committed as a squash and
# caught only by a manual `%p` check; AGENTS.md §Coordination needs two parents). Reading forms
# (list/show) and the ones that restore state (pop/apply/drop) pass.
if [ -n "$ROOT" ] && git -C "$ROOT" rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 \
   && printf '%s' "$SCAN" | grep -qE '(^|[;&|(][[:space:]]*)git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+stash([[:space:]]|$)' \
   && ! printf '%s' "$SCAN" | grep -qE 'git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+stash[[:space:]]+(list|show|pop|apply|drop|branch)'; then
  echo "BLOCKED: \`git stash\` while a merge is in progress drops MERGE_HEAD, and the next commit lands with ONE parent (AGENTS.md §Coordination: merge commits only). Commit the merge or \`git merge --abort\` first; stash afterwards." >&2
  exit 2
fi
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
    line=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)   # the pid may exit meanwhile
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
#    are DENIED; `gh pr merge|ready <n>` needs the gate receipt; a `gh api`
#    …/pulls/<n>/merge, GraphQL merge/auto-merge/ready mutation, close or
#    pages/ci dispatch ASKS (merge_policy.py: the same words as
#    github-mcp-guard.sh). The same api_classify policy covers curl, wget,
#    `node -e` fetch and `python -c`. APEX_MERGE_DESK no longer silences an ask.
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
# pass 4 (H5): an escape hatch that exists is announced on every guarded call, so it cannot stay lifted unnoticed.
for _h in allow-protected allow-context-cap allow-stop; do
  [ -e "$ROOT/.claude/$_h" ] && echo "bash-guard: hatch active: .claude/$_h — remove it when the assigned edit is done."
done
GUARD_RC=0
GUARD_OUT=$(printf '%s' "$INPUT" | python3 "$HOOKDIR/shellparse.py" guard "$ROOT") || GUARD_RC=$?
[ "$GUARD_RC" != 2 ] || exit 2
# 2026-10-28: a parser that CRASHED (any exit but 0 or 2) is a refusal, not a
# fall-through to the regexes below (those are for text it cannot tokenise).
if [ "$GUARD_RC" != 0 ]; then
  echo "BLOCKED: bash-guard's parser (shellparse.py guard) crashed with exit $GUARD_RC, so the push/commit/gh rules did not run and this command is refused (fail closed). Report the hook error; do not work around it." >&2
  exit 2
fi
COMMIT_LINE=$(printf '%s\n' "$GUARD_OUT" | sed -n 1p)
PARSE=$(printf '%s\n' "$GUARD_OUT" | sed -n 2p)
GH_DECISION=$(printf '%s\n' "$GUARD_OUT" | sed -n '3,$p')
# A `git … commit` at command position, reserved words allowed before the verb
# (the broad reading the unparseable-text fallbacks use).
COMMIT_RX="(^|[;&|({\`][[:space:]]*)((if|then|else|elif|while|until|do|time|!)[[:space:]]+)*${PRE}([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*(/[^[:space:]]*/)?git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+commit([[:space:]]|\$)"
if [ "$PARSE" != "PARSE ok" ]; then
  # Unparseable text (an unbalanced quote): the regex fallbacks, all fail-closed.
  if printf '%s' "$SCAN" | grep -Eq "(^|[;&|({\`][[:space:]]*)${PRE}([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*(/[^[:space:]]*/)?git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+push([[:space:]]|\$)"; then
    echo "BLOCKED: this command contains a git push the guard cannot parse (an unbalanced quote?). Write the push as one plain command." >&2
    exit 2
  fi
  # The two ways around .githooks/pre-commit (2026-10-28), read from text the parser could not tokenise.
  if { printf '%s' "$SCAN" | grep -Eq "$COMMIT_RX" \
       && printf '%s' "$SCAN" | grep -Eq -- "[[:space:]](--no-ver[a-z]*|-[A-Za-z]*n[A-Za-z]*)([[:space:]=;&|)]|\$)"; } \
     || printf '%s' "$SCAN" | grep -Eiq 'core\.hookspath'; then
    echo "BLOCKED: this command could not be parsed and looks like it skips the git pre-commit hook (\`git commit --no-verify\`/\`-n\`) or changes core.hooksPath. Write the commit as one plain command, without --no-verify." >&2
    exit 2
  fi
  SUBAGENT=$(printf '%s' "$INPUT" | grep -Eq '"(agent_id|agent_type)"[[:space:]]*:[[:space:]]*"[^"]|/subagents/' && echo 1 || true)
  if [ "$SUBAGENT" = "1" ]; then
    P='(node[[:space:]]+)?([^[:space:];&|()]*/)?'
    BROWSER="${P}(test-bg\.mjs([[:space:]]+(?!--status|--tail)[^[:space:]]+)|test-solo\.mjs|run-playwright\.mjs|verify-change\.mjs(?![^;&|]*--(fast|plan)))|(python3?[[:space:]]+)?([^[:space:];&|()]*/)?probe-mcp\.py[[:space:]]+chrome-start|npx[[:space:]]+playwright[[:space:]]+test|playwright[[:space:]]+test([[:space:]]|$)|npm[[:space:]]+test([[:space:]]|$)"
    # 2026-10-14: the capture CLIs boot Chromium too (harness.mjs launchChromium /
    # playwright): every tools/shot/*.mjs except the node-VM ones (frame-report,
    # cam-corners, cam-motion), tools/ui/{layout-audit,menu-mock,css-play}.mjs and
    # tools/gfx/gfx-probe.mjs. --help / --plan print and exit, so they stay open.
    CAPTURE="${P}(shot/(?!(frame-report|cam-corners|cam-motion)\.mjs)[A-Za-z0-9_-]+\.mjs|ui/(layout-audit|menu-mock|css-play)\.mjs|gfx/gfx-probe\.mjs)(?![^;&|]*[[:space:]](--(help|plan)|-h)([[:space:]=]|\$))"
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
  # 2026-10-26: the same for a GitHub API write through curl/wget/node/python the parser could not read.
  if printf '%s' "$SCANQ" | grep -Eiq 'api\.github\.com|github\.com/[^[:space:]]+/pull/' \
     && printf '%s' "$SCANQ" | grep -Eiq '(-X|--request|--method)[=[:space:]]*["'"'"']?(PUT|POST|PATCH|DELETE)|method[[:space:]]*:[[:space:]]*["'"'"'`](PUT|POST|PATCH|DELETE)|requests\.(put|post|patch|delete)'; then
    GH_DECISION='{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": "bash-guard could not parse this GitHub API write (curl/wget/node/python); confirm it by hand."}}'
  fi
fi
# The decision JSON (GH_DECISION + COMMIT_CTX) is printed by finish() on exit 0.
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

# #1714: advisory only — a push over a live ci.yml run on this branch cancels it and loses its
# failures. live-run-check.mjs does a 3 s API lookup and prints one WARN line or nothing; it never
# blocks, and any failure (offline, no node) is silent. APEX_LIVE_RUN_CHECK points at a stub in tests.
if printf '%s' "$SCAN" | grep -Eq "$PUSH_RX"; then
  LRC="${APEX_LIVE_RUN_CHECK:-$HOOKDIR/../../tools/ci/live-run-check.mjs}"
  if [ -f "$LRC" ] && command -v node >/dev/null 2>&1; then
    LRC_OUT=$(cd "$ROOT" 2>/dev/null && timeout 4 node "$LRC" </dev/null 2>/dev/null | head -2 || true)
    [ -z "$LRC_OUT" ] || echo "$LRC_OUT" >&2
  fi
fi

# --- git commit: keep .githooks/pre-commit reachable ---------------------------
# THE GATE MOVED (2026-10-28, Bryce: "Yes, split it"). Until then this block ran
# `ratchets.mjs --auto-raise` and `npm run test:guards` (50–110 s) inside the
# hook, under its own 160/300 s cap and settings.json's 360 s hook timeout, and
# .githooks/pre-commit stood aside for Claude Code. git's own hook now does all
# of it for every host (docs-only path, unstaged-tree refusal, ratchet raise,
# verdict cache, linked-worktree node_modules); this hook only refuses the ways
# around it: --no-verify / -n and core.hooksPath writes (shellparse.py guard,
# above), and — here — a commit in this project's tree with no executable
# pre-commit hook to run (core.hooksPath unset, or pointing elsewhere).
# WHICH COMMANDS ARE COMMITS: shellparse.py reads every shape (2026-10-04); text
# it cannot tokenise falls back to the broad COMMIT_RX (L12, 2026-10-09).
case "$COMMIT_LINE" in "0 "*|NULL|"") C_FOUND=0 ;; *) C_FOUND=1 ;; esac
if [ "$C_FOUND" = 0 ]; then
  if printf '%s' "$SCAN" | grep -Eq "$COMMIT_RX" && ! printf '%s' "$SCAN" | grep -Eq -- 'APEX_SKIP_GUARDS=1'; then
    COMMIT_LINE="1 1 1 -"
  else
    COMMIT_LINE="0 0 0 -"
  fi
fi
# One line: FOUND RUN ALL GITDIR PATHS… — RUN=1 when any commit is real (not
# --dry-run, not APEX_SKIP_GUARDS=1); GITDIR the tree a `-C`/`cd` names.
read -r _C_N C_RUN _C_ALL C_GITDIR _C_PATHS <<EOF || true
$COMMIT_LINE
EOF
if [ "${C_RUN:-0}" = "1" ]; then
  CTREE="$ROOT"
  if [ -n "${C_GITDIR:-}" ] && [ "$C_GITDIR" != "-" ]; then
    R2="$(git -C "$C_GITDIR" rev-parse --show-toplevel 2>/dev/null || true)"
    [ -z "$R2" ] || CTREE="$R2"
  fi
  # Only this project's tree (it ships .githooks/pre-commit); a scratch repo is not gated here.
  if [ -f "$CTREE/.githooks/pre-commit" ]; then
    # `--git-path hooks` honours core.hooksPath; a relative value is relative to the worktree root.
    HOOKS_DIR="$(cd "$CTREE" && git rev-parse --git-path hooks 2>/dev/null || true)"
    case "$HOOKS_DIR" in /*|"") ;; *) HOOKS_DIR="$CTREE/$HOOKS_DIR" ;; esac
    if [ -z "$HOOKS_DIR" ] || [ ! -x "$HOOKS_DIR/pre-commit" ]; then
      HP="$(git -C "$CTREE" config --get core.hooksPath 2>/dev/null || true)"
      echo "BLOCKED: no pre-commit hook would run for this commit (core.hooksPath=${HP:-unset}; git would look in ${HOOKS_DIR:-?}). .githooks/pre-commit is the one commit gate (test:guards, docs-integrity, the ratchet auto-raise; AGENTS.md rule 12). Run \`npm run prepare\` (it sets core.hooksPath=.githooks, as every npm install does), then commit again." >&2
      exit 2
    fi
    # The hook that WILL run predates the split and still stands aside for Claude Code (a branch that has not merged
    # the split, or an absolute core.hooksPath into an older checkout): refuse a known guardless commit.
    if [ -n "${CLAUDECODE:-}" ] && grep -Fq '[ -n "${CLAUDECODE:-}" ] && exit 0' "$HOOKS_DIR/pre-commit" 2>/dev/null; then
      echo "BLOCKED: the active pre-commit hook ($HOOKS_DIR/pre-commit) skips Claude Code, while this bash-guard no longer runs the suite. This commit would run NO guards. Update the worktree to the reviewed split pre-commit hook and run \`npm run prepare\` so its hook is reachable, then retry. Do not bypass the gate." >&2
      exit 2
    fi
  fi
fi
exit 0
