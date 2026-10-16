---
name: background-task-kill-no-marker
description: A background Bash task killed at its 2 h limit leaves NO marker in its output file and its child gate dies with it; chain gates so the next chain never waits on the dead one's file
metadata:
  type: feedback
  originSessionId: 68324bb7-ccf2-5110-9138-07c5c330db6c
  modified: 2026-10-02T07:08:38.458Z
---

A `run_in_background` Bash task has a hard 2 h ceiling. When the harness kills
it: (a) the task-notification says "killed" but the `tasks/<id>.output` file
gets no `[killed]` line (that text is only the Read tool's rendering), and (b)
the `deploy.mjs --gate-only` child in flight dies too, so its log ends without
`= gate exit` and a 30-minute gate is lost (kitplace, 2026-10-02 06:41, 2128
tests in).

**Why:** a follow-up chain that waited for a `[killed]` marker in the dead
chain's output sat idle for 30 min with the box at loadavg 0.

**How to apply:** never gate a follow-up chain on another task's output file.
Start a chain with only the `ps -eo args | grep '[d]eploy.mjs --gate-only'`
liveness wait, skip logs that already contain `^= gate exit`, and size each
chain to ≤ 3 gates (~35 min each) so it ends before the ceiling; relaunch on the
kill notification. Related: [[pr-push-no-run-dispatch-ci]].
