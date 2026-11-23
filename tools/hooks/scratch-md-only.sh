#!/usr/bin/env bash
# @doc PreToolUse Write|Edit hook for the surface reviewer: the only writable path is scratch/**.md (its report).
# @skill agent-config
#
# scratch-md-only.sh — wired from .claude/agents/surface-reviewer.md `hooks:`.
# The reviewer owns nothing; its report is its one file. Resolved against the
# repo root of the target's directory (symlinks first). Exit 2 refuses; fails
# CLOSED on an unreadable payload. Bash writes are refused by readonly-bash.sh.
set -u
# the script arrives on fd 3 so the hook payload keeps stdin
python3 /dev/fd/3 3<<'PY'
import json, os, re, subprocess, sys
try:
    d = json.load(sys.stdin)
    ti = d.get("tool_input") or {}
    f = ti.get("file_path") or ti.get("notebook_path") or ""
    if not isinstance(f, str):
        raise ValueError
except Exception:
    sys.stderr.write("BLOCKED: scratch-md-only could not read the hook payload (fail closed).\n"); sys.exit(2)
if not f:
    sys.exit(0)
f = os.path.realpath(f)
d_ = os.path.dirname(f)
while d_ and d_ != "/" and not os.path.isdir(d_):
    d_ = os.path.dirname(d_)
try:
    root = subprocess.run(["git", "-C", d_, "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
except Exception:
    root = ""
rel = os.path.relpath(f, root).replace(os.sep, "/") if root else ".."
if rel.startswith("..") or not re.match(r"^scratch/.+\.md$", rel):
    sys.stderr.write("BLOCKED: %s: surface-reviewer writes only its report, scratch/**.md "
                     "(.claude/agents/surface-reviewer.md). Put the finding in the report instead.\n" % (rel if root else f))
    sys.exit(2)
PY
