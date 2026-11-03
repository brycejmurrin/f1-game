#!/usr/bin/env bash
# @doc PreToolUse Bash hook for read-only subagents: refuses write-shaped commands; `READONLY_BASH_ALLOW` is the one exception.
# @skill agent-config
#
# readonly-bash.sh — wired from the `hooks:` frontmatter of every reporter
# agent (.claude/agents/README.md §Enforcement). `tools:` keeps Write/Edit away;
# this closes the Bash side with a text scan of the command for the shapes a
# report never needs: redirections into a file, tee, in-place edits, mv/cp/rm,
# index/ref-moving git verbs, interpreter file writes and the generators. ONE
# exception per agent, as a regex in READONLY_BASH_ALLOW (env) or as $1: a
# command matching it in full passes every rule (verify-agent's
# `git worktree add --detach|remove scratch/verify-base-*`).
#
# Limitation, accepted (plan §4.6): a deliberately obfuscated write (`bash -c`
# with the verb built from variables, an absolute interpreter path writing a
# file, curl -o) passes. The parent's diff review is the backstop.
# Exit 2 refuses with the reason on stderr; exit 0 lets the normal permission
# flow decide. Fails CLOSED on a payload it cannot read.
set -u
INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    c = (d.get("tool_input") or {}).get("command") if isinstance(d, dict) else None
    if not isinstance(c, (str, type(None))): raise ValueError
except Exception:
    sys.exit(3)
sys.stdout.write(c or "")' 2>/dev/null) || { echo "BLOCKED: readonly-bash could not read the command out of the hook payload (fail closed)." >&2; exit 2; }
[ -n "$CMD" ] || exit 0
ALLOW="${READONLY_BASH_ALLOW:-${1:-}}"
if [ -n "$ALLOW" ] && printf '%s' "$CMD" | grep -Pqx -- "$ALLOW"; then exit 0; fi

refuse() { echo "BLOCKED: $1 — this agent is a read-only reporter (.claude/agents/README.md §Enforcement): it writes nothing outside its report. Put the change in the report for the parent instead." >&2; exit 2; }
has() { printf '%s' "$CMD" | grep -Pq -- "$1"; }

# `>`/`>>` into a file: not `2>&1`, `>&2`, `>/dev/null`, `->`, `=>`
has '(^|[^0-9&<>=-])>{1,2}(?!&)\s*(?!/dev/null)[^&\s]' && refuse "the command redirects output into a file"
has '(^|[;&|(]\s*|\|\s*)tee(\s|$)' && refuse "\`tee\` writes a file"
has '(^|[;&|(]\s*)(sed|perl)\s+(-[A-Za-z]*i|--in-place)' && refuse "an in-place edit (sed/perl -i)"
has '(^|[;&|(]\s*)(sudo\s+)?(mv|cp|rm|rmdir|unlink|shred|rsync|truncate)(\s|$)' && refuse "the command moves, copies or removes files"
has 'git(\s+-\S+(\s+[^-\s]\S*)?)*\s+(add|commit|push|checkout|switch|merge|rebase|reset|restore|worktree\s+(add|remove|move|prune|lock|unlock|repair)|stash|cherry-pick|am|apply|rm|mv|clean|tag|update-ref|config|branch\s+-[dDmM])(\s|$)' && refuse "a git verb that rewrites the index, HEAD, a ref or the tree"
has 'writeFileSync|appendFileSync|createWriteStream|copyFileSync|renameSync|unlinkSync|rmSync|mkdirSync|open\([^)]*[\x27"][wax]' && refuse "an interpreter file write (node fs / python open for writing)"
has 'npm\s+(run\s+gen|install|ci|i(\s|$)|uninstall|update)|tools/gen/|npx\s+playwright\s+install' && refuse "a generator or package install"
exit 0
