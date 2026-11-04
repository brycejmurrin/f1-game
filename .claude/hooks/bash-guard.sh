#!/bin/bash
# PreToolUse guard for Bash: the four refusals no other mechanism carries
# (plan docs/plans/2026-11-03-agent-surface-reset.md §4.7). `grep -P` at command
# position on a SCAN of the command (below); `bash -c '…'`, an absolute program
# path and a verb built from variables walk past it, as they walk past the
# settings.json deny/ask rules. The backstops are the git pre-push hook
# (.githooks/pre-push: force, delete, deploy-branch and foreign pushes), the
# Deploy-reset ruleset and CI. settings.json's deny/ask rules apply inside
# `&&`, `;`, `$()` and loop bodies and strip timeout/nice/nohup wrappers
# (code.claude.com/docs/en/permissions §Compound commands, read 2026-11-03).
#
# The SCAN (B8 #4561): heredoc bodies are data unless a shell reads them; a
# quoted string with whitespace is prose (a commit message that NAMES a rule is
# not that rule) except the `$(…)` / backtick bodies inside double quotes, which
# run; a quoted single token (`'-f'`, a URL) keeps its text. Command position
# takes wrapper options (`env -i`, `sudo -E`, `timeout -s KILL 5`, `nice -n 5`,
# `command`, `time`) and the shell keywords `if then do else ! {`.
#
#  1. kill scan — `pkill -f` / `killall` match the hook-wrapped shell itself
#     (its command line carries the pattern) and orphan every Chromium a run
#     opened; so does `kill $(pgrep -f …)` / `pgrep -f … | xargs kill`. A bare
#     `kill <pid>` whose /proc/<pid>/comm is a Chromium is refused unless the
#     command LEADS with `APEX_KILL_OK=1 ` (you listed the pid first).
#  2. subagent browser ban (AGENTS.md §Verification 10; the hook payload names
#     a subagent by agent_id / agent_type / a subagents/ transcript): no
#     Playwright run, test-bg (except --status/--tail/--stop), npm test / npm run
#     test, a browser group, verify-change without --fast/--plan, the capture
#     CLIs, the chrome daemon; nor a touch of the .claude/allow-* guard hatches.
#  3. the commit gate stays reachable: no `git commit --no-verify|-n`, no
#     core.hooksPath write (.githooks/pre-commit owns test:guards).
#  4. no `gh run cancel` / REST …/cancel, `gh pr merge` / REST or GraphQL merge,
#     `gh pr ready` — ever, with or without `-R <repo>`: land.yml lands,
#     ship-pr.mjs + the MCP flip ready, Bryce cancels in the UI.
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
# merge, ready; the subagent hatch rule: allow-), so a command with none of them passes without a grep. A new rule adds its literal here.
case "${CMD,,}" in
  *kill*|*commit*|*hookspath*|*cancel*|*merge*|*ready*|*test-bg*|*playwright*|*verify-change*|*debug-chrome*|\
  *gfx-probe*|*probe-mcp*|*shot/*|*ui/*|*npm*|*chrome-start*|*allow-*) ;;
  *) exit 0 ;;
esac

refuse() { echo "BLOCKED: $1" >&2; exit 2; }
SCAN=$(printf '%s' "$CMD" | python3 /dev/fd/3 3<<'PY' 2>/dev/null) || refuse "bash-guard could not scan the command (fail closed)."
import re, sys
s = sys.stdin.read()
def heredoc(m):  # keep the opener line; drop the body unless a shell (bash/sh/zsh/dash) reads it
    return m.group(0) if re.search(r"(^|[;&|(]\s*)(ba|z|da)?sh\b", m.group(1)) else m.group(1)
s = re.sub(r"([^\n]*<<-?\s*(['\"]?)(\w+)\2[^\n]*)\n.*?\n[ \t]*\3[ \t]*(?=\n|$)", heredoc, s, flags=re.S)
def quoted(m):
    t = m.group(1) if m.group(1) is not None else m.group(2)
    if not re.search(r"\s", t): return t
    if m.group(2) is None: return ""
    subs = re.findall(r"\$\(((?:[^()]|\([^()]*\))*)\)|`([^`]*)`", t)
    return "; " + " ; ".join(a or b for a, b in subs) + " ;" if subs else ""
sys.stdout.write(re.sub(r"'([^']*)'|\"((?:[^\"\\]|\\.)*)\"", quoted, s))
PY
has() { printf '%s' "$SCAN" | grep -Pq -- "$1"; }
raw() { printf '%s' "$CMD" | grep -Pq -- "$1"; }
# command position: line start, after ; & | ( ` { ! or a shell keyword, past VAR= prefixes, wrappers with their options and a directory
W='(sudo(\s+(-[ugCDhprtT]\s+\S+|-\S+))*|env(\s+(-[uSC]\s+\S+|-\S+|[A-Za-z_]\w*=\S*))*|exec(\s+-\S+)*|nohup|command(\s+-\S+)*|builtin|time(\s+-\S+)*|nice(\s+(-n\s+\S+|-\S+))*|ionice(\s+(-[cnp]\s+\S+|-\S+))*|stdbuf(\s+-\S+)*|setsid(\s+-\S+)*|timeout(\s+(-[sk]\s+\S+|-\S+))*\s+[0-9.]+[smhd]?|xargs(\s+(-[IdEsLnP]\s+\S+|-\S+))*)\s+'
PRE='(^|[;&|(`{!]\s*|\b(then|do|else|elif|if|while|until)\s+)([A-Za-z_][A-Za-z0-9_]*=\S*\s+)*('"$W"')*(/\S*/)?'
GH='gh(\s+(-R|--repo|--hostname)\s+\S+|\s+-\S+)*\s+'
KILL_HOW="Stop a run with 'node tools/ci/test-bg.mjs --stop'; kill an orphan Chrome by PID from a listed set (ps -eo pid,comm | awk '\$2==\"chrome\"{print \$1}'), then 'APEX_KILL_OK=1 kill <pid>'."

# --- 1. kill scan ----------------------------------------------------------------
has "${PRE}pkill(\s+[^\s;&|()]+)*\s+(-[A-Za-z0-9]*f[A-Za-z0-9]*|--full)(\s|$)" \
  && refuse "pkill -f matches your own shell (its command line contains the pattern) and orphans Playwright's browsers. $KILL_HOW"
has "${PRE}killall(\s|$)" && refuse "killall by name takes every Chromium and node on the box, the parent's run included. $KILL_HOW"
has "${PRE}(pgrep(\s+[^\s;&|()]+)*\s+(-[A-Za-z0-9]*f[A-Za-z0-9]*|--full)[^|]*\|\s*(xargs\s+)?(\S+\s+)*kill|kill(\s+-\S+)*\s+\\\$\(\s*pgrep(\s+[^\s;&|()]+)*\s+(-[A-Za-z0-9]*f[A-Za-z0-9]*|--full))" \
  && refuse "pgrep -f piped or substituted into kill orphans Playwright's browsers exactly as pkill -f does. $KILL_HOW"
if has "${PRE}kill(\s+(-[sn]\s+\S+|-\S+))*\s+[0-9]" && ! raw '^\s*APEX_KILL_OK=1\s'; then
  for pid in $(printf '%s' "$SCAN" | grep -Po '(?<=\s)[0-9]+' ); do
    comm=$(cat "/proc/$pid/comm" 2>/dev/null || true)
    case "$comm" in chrome*|chromium*|headless_shell*)
      refuse "pid $pid is a Chromium ($comm). Kill a browser you listed yourself as 'APEX_KILL_OK=1 kill $pid' (a leading env assignment); a browser you did not list belongs to the parent's run. $KILL_HOW" ;;
    esac
  done
fi

# --- 2. a subagent never starts a browser ---------------------------------------
if printf '%s' "$INPUT" | grep -Eq '"(agent_id|agent_type)"\s*:\s*"[^"]|/subagents/'; then
  has '\.claude/allow-(protected|context-cap)\b' \
    && refuse "a subagent cannot lift a guard (.claude/allow-protected / allow-context-cap; AGENTS.md rule 10): report the edit for the parent."
  P='((node|python3?)\s+)?([^\s;&|()]*/)?'
  BG=""   # groups.json only feeds the `npm run … test:<group>` alternative: no "test:" in the command, no python3
  [[ "$CMD" == *test:* ]] && BG=$(python3 -c '
import json, re, sys
try:
    g = json.load(open(sys.argv[1]))["groups"]
    print("|".join(re.escape(k[5:]) for k, v in g.items() if k[5:] and (v.get("kind") == "browser" or "playwright" in (v.get("cmd") or ""))))
except Exception:
    print("")' "$(cd "$(dirname "$0")/../.." && pwd)/tests/groups.json")
  BROWSER="${P}(test-bg\.mjs(?![^;&|]*--(status|tail|stop)\b)|run-playwright\.mjs|verify-change\.mjs(?![^;&|]*--(fast|plan)\b)|debug-chrome\.mjs\s+start|gfx-probe\.mjs|probe-mcp\.py\s+chrome-start|shot/(?!(frame-report|cam-corners|cam-motion)\.mjs)[A-Za-z0-9_-]+\.mjs|ui/[A-Za-z0-9_-]*audit[A-Za-z0-9_-]*\.mjs)|(npx\s+(--yes\s+)?)?playwright\s+test\b|npm\s+(test|t)\b|npm\s+run(-script)?(\s+-[-a-z]+)*\s+test(\s|$)|npm\s+exec\s+playwright|(^|\s)chrome-start\b"
  [ -n "$BG" ] && BROWSER="${BROWSER}|npm\s+run(-script)?(\s+-[-a-z]+)*\s+test:(${BG})\b"
  has "${PRE}(${BROWSER})" \
    && refuse "a subagent never starts a browser run (AGENTS.md §Verification 10): one browser saturates this box and the parent owns it. Run the node-only checks (verify-change.mjs --fast, node --test, verify-track.cjs) and report the browser groups as NOT RUN."
fi

# --- 3. the commit gate stays reachable -----------------------------------------
COMMIT="git(\s+-[^\s]+(\s+[^-\s][^\s]*)?)*\s+commit(\s|$)"
if has "${PRE}${COMMIT}" && has "\s(--no-ver[a-z]*|-[A-Za-z]*n[A-Za-z]*)(\s|=|;|&|\||\)|$)"; then
  refuse "git commit --no-verify / -n skips .githooks/pre-commit, the one commit gate (test:guards, docs-integrity, the ratchet auto-raise; AGENTS.md rule 12). Commit without it; a red guard is work, not a flag."
fi
has '(?i)core\.hookspath' && ! has '(?i)^\s*git\s+config\s+(--(global|local|system)\s+)?--get(-all|-regexp)?\s+core\.hookspath\s*$' \
  && [ -z "${APEX_HOOKSPATH_SETTER:-}" ] \
  && refuse "core.hooksPath is set once by the SessionStart hook / npm run prepare (.githooks); an agent never moves it (a read is 'git config --get core.hooksPath'). Run 'npm run prepare' if commits say no hook would run."

# --- 4. no cancel, merge or ready flip from a shell ------------------------------
has "${PRE}${GH}run\s+cancel(\s|$)" && refuse "cancelling an Actions run: a queued run holds no slot, so a cancel only loses its place and buys a retrigger push (AGENTS.md §Coordination). Your superseded run is replaced by your next push; Bryce cancels in the UI."
has 'actions/runs/[^/\s]+/(force-)?cancel' && refuse "cancelling an Actions run through the API (…/actions/runs/<id>/cancel): never (AGENTS.md §Coordination). Bryce cancels in the UI."
{ has "${PRE}${GH}pr\s+merge(\s|$)" || has "${PRE}${GH}api\b(?=[^;&|\n]*(-X\s*PUT|--method[=\s]+PUT))[^;&|\n]*pulls/[0-9]+/merge\b" \
  || { has "${PRE}${GH}api\s+graphql\b" && raw '\b(mergePullRequest|enablePullRequestAutoMerge)\b'; }; } \
  && refuse "no session merges or arms (AGENTS.md §Coordination): add the 'land' label and land.yml's gate arms auto-merge."
{ has "${PRE}${GH}pr\s+ready(\s|$)" || { has "${PRE}${GH}api\s+graphql\b" && raw '\bmarkPullRequestReadyForReview\b'; }; } \
  && refuse "a draft goes ready through 'node tools/ci/ship-pr.mjs' and the GitHub MCP update_pull_request flip (the Plan gate and CI check it), never 'gh pr ready'."
exit 0
