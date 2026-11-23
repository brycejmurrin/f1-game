#!/bin/bash
# PreToolUse guard for Write / Edit / MultiEdit / NotebookEdit (the rules are in
# protect-files.py: a generated file is never hand-edited; a linked worktree
# never edits a shared-contract file; `touch .claude/allow-protected` lifts
# both for an assigned edit). Cursor reaches it through
# .cursor/hooks/edit-guard.sh. FAIL CLOSED: a missing python3, a crash or any
# exit but 0/2 is a refusal, whatever the host's hook runner does with a failed
# hook (Claude Code passes such a call unless onFailure is "block").
if ! command -v python3 >/dev/null 2>&1; then
  echo "BLOCKED: protect-files needs python3 to read the call; none of its rules ran, so it is refused (fail closed)." >&2
  exit 2
fi
python3 "$(dirname "$0")/protect-files.py"
rc=$?
case "$rc" in
  0|2) exit "$rc" ;;
  *) echo "BLOCKED: protect-files.py failed with exit $rc, so its rules did not finish and this call is refused (fail closed). Report the hook error; do not work around it." >&2
     exit 2 ;;
esac
