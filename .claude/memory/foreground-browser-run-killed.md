---
name: foreground-browser-run-killed
description: A FOREGROUND Bash that launches Chromium (a Playwright repro, a long node --test) in this cloud container dies with exit 137 and restarts the worker; run every browser pass and heavy node suite in the background
metadata:
  type: feedback
  originSessionId: 68324bb7-ccf2-5110-9138-07c5c330db6c
  modified: 2026-10-02T22:21:26.129Z
---

Twice on 2026-10-02 a foreground Bash call that launched headless Chromium
(a scratchpad Playwright leak repro, then a `node --test` with no file list that
ran the whole suite) ended with exit 137 and "the container was restarted":
background tasks, the DevTools MCP page and the MCP connections were all lost.
The same repro launched with `run_in_background: true` finished every time.

**Why:** the foreground path has a memory/time budget the background path does
not; a SwiftShader Chrome plus CDP heap work goes past it.

**How to apply:** launch anything that opens a browser, or any node suite longer
than ~2 min, as a background Bash task writing to a log, and poll the log with a
short foreground loop (`for i in …; grep -q "= done" $f && break; sleep 10`).
Never pipe a long run through `| tail` in the foreground. Related:
[[background-task-kill-no-marker]].
