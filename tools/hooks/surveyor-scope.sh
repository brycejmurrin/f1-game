#!/usr/bin/env bash
# @doc PreToolUse Write|Edit hook for track-surveyor: writes land only in the circuit pair, scratch/** or artifacts/**.
# @skill survey-track
#
# surveyor-scope.sh — wired from .claude/agents/track-surveyor.md `hooks:`.
# The surveyor's one write is its circuit PAIR (the def and its scenery
# closure) plus scratch/ and artifacts/. Which circuit is the parent's brief —
# a hook cannot read it — so any id passes here and
# `node tools/track/merge-surveyor.mjs <id> <base> <branch>` (surveyor-scope.mjs)
# binds the id at hand-back. Paths are resolved against the repo root of the
# file's own directory, symlinks first, so a link into js/track/ is judged as
# its target. Exit 2 refuses; fails CLOSED on an unreadable payload.
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
    sys.stderr.write("BLOCKED: surveyor-scope could not read the hook payload (fail closed).\n"); sys.exit(2)
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
OK = re.compile(r"^(js/circuits/(scenery/)?[a-z0-9_-]+\.js|scratch/.+|artifacts/.+)$")
if rel.startswith("..") or not OK.match(rel):
    sys.stderr.write("BLOCKED: %s: track-surveyor writes only js/circuits/<id>.js, js/circuits/scenery/<id>.js, scratch/ and "
                     "artifacts/ (.claude/agents/track-surveyor.md). Report the change for the parent instead.\n" % (rel if root else f))
    sys.exit(2)
PY
