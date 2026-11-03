#!/bin/bash
# PreToolUse guard for Bash: the four refusals no other mechanism carries
# (plan docs/plans/2026-11-03-agent-surface-reset.md §4.7). Plain `grep` on
# the command text, at command position; `bash -c '…'`, an absolute program
# path and a verb built from variables walk past it, as they walk past the
# settings.json deny/ask rules. The backstops are the git pre-push hook
# (.githooks/pre-push: force, delete, deploy-branch and foreign pushes), the
# Deploy-reset ruleset and CI. settings.json's deny/ask rules apply inside
# `&&`, `;`, `$()` and loop bodies and strip timeout/nice/nohup wrappers
# (code.claude.com/docs/en/permissions §Compound commands, read 2026-11-03).
#
#  1. kill scan — `pkill -f` / `killall` match the hook-wrapped shell itself
#     (its command line carries the pattern) and orphan every Chromium a run
#     opened; so does `kill $(pgrep -f …)` / `pgrep -f … | xargs kill`. A bare
#     `kill <pid>` whose /proc/<pid>/comm is a Chromium is refused unless the
#     command LEADS with `APEX_KILL_OK=1 ` (you listed the pid first).
#  2. subagent browser ban (AGENTS.md §Verification 10; the hook payload names
#     a subagent by agent_id / agent_type / a subagents/ transcript): no
#     Playwright run, test-bg (except --status/--tail), npm test, a browser
#     group, verify-change without --fast/--plan, the capture CLIs, the chrome
#     daemon.
#  3. the commit gate stays reachable: no `git commit --no-verify|-n`, no
#     core.hooksPath write (.githooks/pre-commit owns test:guards).
#  4. no `gh run cancel` / REST …/cancel, `gh pr merge`, `gh pr ready` — ever:
#     land.yml lands, ship-pr.mjs + the MCP flip ready, Bryce cancels in the UI.
#
# Exit 2 refuses with the reason on stderr; exit 0 lets the normal permission
# flow decide. A payload the guard cannot read is a refusal (fail closed; the
# settings.json handler sets onFailure "block" for any other exit).
set -u
INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    ti = d.get("tool_input") if isinstance(d, dict) else None
    if not isinstance(d, dict) or not isinstance(ti, (dict, type(None))): raise ValueError
    c = (ti or {}).get("command")
    if not isinstance(c, (str, type(None))): raise ValueError
except Exception:
    sys.exit(3)
sys.stdout.write(c or "")' 2>/dev/null) || {
  echo "BLOCKED: bash-guard could not read the command out of the hook payload (not JSON, or an unexpected shape), so none of its rules ran and the command is refused (fail closed)." >&2; exit 2; }
[ -n "$CMD" ] || exit 0
# Fast path (perf P8 row 11): every rule below needs one of these literals in the command text (kill: pkill/killall/
# pgrep…kill/kill; 2: the BROWSER tokens; 3: commit, hookspath (the (?i) rule, hence the lowercase); 4: cancel,
# merge, ready), so a command with none of them passes without a grep. A new rule adds its literal here.
case "${CMD,,}" in
  *kill*|*commit*|*hookspath*|*cancel*|*merge*|*ready*|*test-bg*|*playwright*|*verify-change*|*debug-chrome*|\
  *gfx-probe*|*probe-mcp*|*shot/*|*ui/*|*npm*|*chrome-start*) ;;
  *) exit 0 ;;
esac

has() { printf '%s' "$CMD" | grep -Pq -- "$1"; }
# The kill scan reads the command with quoted strings blanked: `echo "pkill -f x"` or a commit message that
# MENTIONS the words is prose, not a kill (the unanchored rule once blocked the commit that added it). A kill
# hidden inside `bash -c "…"` is the documented miss named in the header.
UNQUOTED_CMD=$(printf '%s' "$CMD" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")
hasq() { printf '%s' "$UNQUOTED_CMD" | grep -Pq -- "$1"; }
refuse() { echo "BLOCKED: $1" >&2; exit 2; }
# command position: line start or after ; & | ( `, past VAR= prefixes, sudo/env/exec/nohup/timeout/xargs and a directory
PRE='(^|[;&|(`]\s*)([A-Za-z_][A-Za-z0-9_]*=\S*\s+)*((sudo|env|exec|nohup|timeout\s+[0-9.]+[smhd]?|xargs)\s+)*(/\S*/)?'
KILL_HOW="Stop a run with 'node tools/ci/test-bg.mjs --stop'; kill an orphan Chrome by PID from a listed set (ps -eo pid,comm | awk '\$2==\"chrome\"{print \$1}'), then 'APEX_KILL_OK=1 kill <pid>'."

# --- 1. kill scan ----------------------------------------------------------------
hasq "${PRE}pkill(\s+[^\s;&|()]+)*\s+(-[A-Za-z0-9]*f[A-Za-z0-9]*|--full)(\s|$)" \
  && refuse "pkill -f matches your own shell (its command line contains the pattern) and orphans Playwright's browsers. $KILL_HOW"
hasq "${PRE}killall(\s|$)" && refuse "killall by name takes every Chromium and node on the box, the parent's run included. $KILL_HOW"
hasq "${PRE}(pgrep(\s+[^\s;&|()]+)*\s+(-[A-Za-z0-9]*f[A-Za-z0-9]*|--full)[^|]*\|\s*(xargs\s+)?(\S+\s+)*kill|kill(\s+-\S+)*\s+\\\$\(\s*pgrep(\s+[^\s;&|()]+)*\s+(-[A-Za-z0-9]*f[A-Za-z0-9]*|--full))" \
  && refuse "pgrep -f piped or substituted into kill orphans Playwright's browsers exactly as pkill -f does. $KILL_HOW"
if hasq "${PRE}kill(\s+-\S+)*\s+[0-9]" && ! printf '%s' "$CMD" | grep -Pq '^\s*APEX_KILL_OK=1\s'; then
  for pid in $(printf '%s' "$UNQUOTED_CMD" | grep -Po '(?<=\s)[0-9]+' ); do
    comm=$(cat "/proc/$pid/comm" 2>/dev/null || true)
    case "$comm" in chrome*|chromium*|headless_shell*)
      refuse "pid $pid is a Chromium ($comm). Kill a browser you listed yourself as 'APEX_KILL_OK=1 kill $pid' (a leading env assignment); a browser you did not list belongs to the parent's run. $KILL_HOW" ;;
    esac
  done
fi

# --- 2. a subagent never starts a browser ---------------------------------------
if printf '%s' "$INPUT" | grep -Eq '"(agent_id|agent_type)"\s*:\s*"[^"]|/subagents/'; then
  P='((node|python3?)\s+)?([^\s;&|()]*/)?'
  BG=""   # groups.json only feeds the `npm run … test:<group>` alternative: no "test:" in the command, no python3
  [[ "$CMD" == *test:* ]] && BG=$(python3 -c '
import json, re, sys
try:
    g = json.load(open(sys.argv[1]))["groups"]
    print("|".join(re.escape(k[5:]) for k, v in g.items() if k[5:] and (v.get("kind") == "browser" or "playwright" in (v.get("cmd") or ""))))
except Exception:
    print("")' "$(cd "$(dirname "$0")/../.." && pwd)/tests/groups.json")
  BROWSER="${P}(test-bg\.mjs(?![^;&|]*--(status|tail)\b)|run-playwright\.mjs|verify-change\.mjs(?![^;&|]*--(fast|plan)\b)|debug-chrome\.mjs\s+start|gfx-probe\.mjs|probe-mcp\.py\s+chrome-start|shot/(?!(frame-report|cam-corners|cam-motion)\.mjs)[A-Za-z0-9_-]+\.mjs|ui/[A-Za-z0-9_-]*audit[A-Za-z0-9_-]*\.mjs)|(npx\s+(--yes\s+)?)?playwright\s+test\b|npm\s+(test|t)\b|npm\s+exec\s+playwright|(^|\s)chrome-start\b"
  [ -n "$BG" ] && BROWSER="${BROWSER}|npm\s+run(\s+-[-a-z]+)*\s+test:(${BG})\b"
  has "${PRE}(${BROWSER})" \
    && refuse "a subagent never starts a browser run (AGENTS.md §Verification 10): one browser saturates this box and the parent owns it. Run the node-only checks (verify-change.mjs --fast, node --test, verify-track.cjs) and report the browser groups as NOT RUN."
fi

# --- 3. the commit gate stays reachable -----------------------------------------
COMMIT="git(\s+-[^\s]+(\s+[^-\s][^\s]*)?)*\s+commit(\s|$)"
# UNQUOTED_CMD (the kill scan's blanked text): a -n inside a commit message is prose
if has "${PRE}${COMMIT}" && printf '%s' "$UNQUOTED_CMD" | grep -Pq -- "\s(--no-ver[a-z]*|-[A-Za-z]*n[A-Za-z]*)(\s|=|;|&|\||\)|$)"; then
  refuse "git commit --no-verify / -n skips .githooks/pre-commit, the one commit gate (test:guards, docs-integrity, the ratchet auto-raise; AGENTS.md rule 12). Commit without it; a red guard is work, not a flag."
fi
has '(?i)core\.hookspath' && [ -z "${APEX_HOOKSPATH_SETTER:-}" ] \
  && refuse "core.hooksPath is set once by the SessionStart hook / npm run prepare (.githooks); an agent never moves it. Run 'npm run prepare' if commits say no hook would run."

# --- 4. no cancel, merge or ready flip from a shell ------------------------------
has "${PRE}gh\s+run\s+cancel(\s|$)" && refuse "cancelling an Actions run: a queued run holds no slot, so a cancel only loses its place and buys a retrigger push (AGENTS.md §Coordination). Your superseded run is replaced by your next push; Bryce cancels in the UI."
has 'actions/runs/[^/\s]+/(force-)?cancel' && refuse "cancelling an Actions run through the API (…/actions/runs/<id>/cancel): never (AGENTS.md §Coordination). Bryce cancels in the UI."
has "${PRE}gh\s+pr\s+merge(\s|$)" && refuse "no session merges or arms (AGENTS.md §Coordination): add the 'land' label and land.yml's gate arms auto-merge."
has "${PRE}gh\s+pr\s+ready(\s|$)" && refuse "a draft goes ready through 'node tools/ci/ship-pr.mjs' and the GitHub MCP update_pull_request flip (the Plan gate and CI check it), never 'gh pr ready'."
exit 0
