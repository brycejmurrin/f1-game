#!/usr/bin/env bash
# File-edit guard for Codex → the repo's edit guard (.claude/hooks/protect-files.sh). Codex's PreToolUse fires for
# file edits through `apply_patch` with tool_input.command holding the patch (https://learn.chatgpt.com/docs/hooks,
# read 2026-11-10). Every `*** Add File:` / `*** Update File:` / `*** Delete File:` / `*** Move to:` path is judged
# by the path rules (a generated file, a linked worktree's shared-contract file); a block-level rule needs the
# file's new text, which a patch does not carry whole, so a generated-block file (index.html, a doc with a
# GENERATED block) is refused outright here and edited from Claude Code or by its generator.
# Codex sends no subagent id in PreToolUse, so the subagent rules cannot run in this host. Exit 2 refuses; an
# unreadable payload is a refusal. Codex runs a project hook only after `/hooks` trusts it.
set -u
DIR=$(cd "$(dirname "$0")/../.." && pwd)
PATHS=$(python3 -c '
import json, re, sys
d = json.load(sys.stdin)
ti = d.get("tool_input") or {}
if isinstance(ti, str):
    ti = json.loads(ti)
patch = ti.get("command") or ti.get("patch") or ti.get("input") or ""
if isinstance(patch, list):
    patch = "\n".join(map(str, patch))
paths = re.findall(r"^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$", str(patch), re.M)
if not paths and ti.get("file_path"):
    paths = [ti["file_path"]]
print("\n".join(paths))') || { echo "BLOCKED: codex edit-guard could not read the apply_patch payload (fail closed)." >&2; exit 2; }
CWD=$(pwd)
while IFS= read -r p; do
  [ -z "$p" ] && continue
  case "$p" in /*) abs="$p" ;; *) abs="$CWD/$p" ;; esac
  ERR=$(python3 -c 'import json,sys; print(json.dumps({"tool_name":"Edit","tool_input":{"file_path":sys.argv[1],"old_string":"","new_string":""}}))' "$abs" \
        | CLAUDE_PROJECT_DIR="$DIR" bash "$DIR/.claude/hooks/protect-files.sh" 2>&1 >/dev/null); RC=$?
  if [ "$RC" != 0 ]; then echo "${ERR:-BLOCKED: the edit guard failed (exit $RC) for $p}" >&2; exit 2; fi
  # a block-generated file: refuse in this host (no whole new text to compare blocks)
  rel=$(python3 -c 'import os,sys; print(os.path.relpath(os.path.realpath(sys.argv[1]), sys.argv[2]))' "$abs" "$DIR")
  if [ -f "$abs" ] && grep -Eq '^[[:space:]]*(<!--|//)[[:space:]]*/?(@gen-[A-Za-z-]+|GENERATED)' "$abs"; then
    echo "BLOCKED: $rel carries generated blocks (@gen-… / GENERATED markers); a patch cannot be checked against them here. Edit the generator's source and run npm run gen, or make the hand edit from Claude Code." >&2
    exit 2
  fi
done <<<"$PATHS"
exit 0
