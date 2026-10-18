---
paths:
  - "tests/specs/**"
---

# Browser specs — loads with tests/specs/

- One Playwright process, one browser group per batch, via
  `node tools/ci/test-bg.mjs` (never a foreground Chromium or long node suite —
  exit 137 kills the worker). Prefer a single spec over its whole group.
- Never hand a subagent a browser run; never a second concurrent group while
  one is live. Stop with `test-bg.mjs --stop`, never a PID kill.
- Anchor on `grep -E '^= (run (passed|failed|timedout|interrupted)|bg exit)'`
  in the group log — never the process table.
