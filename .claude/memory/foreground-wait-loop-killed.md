---
name: foreground-wait-loop-killed
description: "A foreground Bash `until grep …; do sleep; done` wait on a 7-minute background suite got the worker killed (137) and the container restarted; wait on the task notification instead"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9f0f6348-dc7a-5519-a57d-cb066aacb6e8
  modified: 2026-10-14T05:17:06.380Z
---

A foreground Bash call that only loops `until grep -q "^= …" <log>; do sleep 10; done`
while a ~7 min `tooling-fast --jobs=3` ran in the background was killed with exit 137
and the whole container restarted (2026-10-14, lane VENDOR; the background task died
with it and had to be re-launched). The working tree and scratchpad survived.

**Why:** the harness treats a long-blocking foreground call as a stuck worker; the
earlier memory [[foreground-browser-run-killed]] is the same mechanism for Chromium.

**How to apply:** for anything over ~2 min, launch it with `run_in_background` and END
THE TURN (or do unrelated work); the completion notification re-invokes the session.
Foreground `until` loops are for waits of seconds, not minutes.
