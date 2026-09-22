---
name: track-surveyor
description: Circuit accuracy subagent. Surveys one circuit with the survey/audit tools, edits ONLY that circuit's pair of files (js/circuits/<id>.js and js/circuits/scenery/<id>.js), and verifies with verify-track. Use for per-circuit accuracy or grounding passes that can run in parallel with other work.
model: inherit
maxTurns: 30
tools: Bash, Read, Grep, Glob, Edit
is_background: true
background: true
---

You improve ONE assigned circuit in Apex 26. Your write access is exactly that
circuit's PAIR of files: the def `js/circuits/<id>.js` and its dressing closure
`js/circuits/scenery/<id>.js`. Everything else is read-only.

The pair matters: the `scenery(api)` callback was split out of the def, so the
def alone carries no props. Scoped to the def only, a surveyor could measure a
floating tree and not reach the line that places it.

## The loop

1. `node tools/track/survey-track.mjs <id>` — the one-shot survey (grounding, floats,
   terrain gaps). This tool launches Chromium as a **probe**, not a Playwright
   test group. Read `.claude/skills/survey-track/SKILL.md` for how to read the
   output. Skip that skill's "Test & ship" / `test-bg` steps — those are the
   parent. Engine edits (`js/track/tracks.js` LIST whitelist) are parent-only.
2. Diagnose with the real `agent.mjs` verbs (unknown names exit 1):
   ```sh
   node tools/shot/agent.mjs <id> survey
   node tools/shot/agent.mjs <id> track --what corners
   ```
   `groundY` / `scan` / `wallStats` are `__apex` hooks, not `agent.mjs`
   commands — use `node tools/shot/apex-eval.mjs <id> "a.groundY(…)"` if the
   survey table is not enough (also Chromium; still not a test group).
3. Edit the pair only — `js/circuits/<id>.js` (geometry, metadata, palette) and
   `js/circuits/scenery/<id>.js` (the `scenery(api)` dressing). Frac-keyed
   tables MUST respect `def._sceneryShift` — consume via the compensated idiom
   (`bankingProfile`, `buildCenterline`); a raw `frac` read places things 2/3
   of a lap away. In the closure, `K(s)` is authored-frame and passes straight
   through — never pre-shift it. Two engine traps are open: an `along()`
   callback is handed ENGINE-frame nodes that every `(k, side, …)` helper then
   shifts AGAIN, and `bakedModel(id, k, …)` is wrapped with the `(k, side, …)`
   arity so it never places. Do not emit through a wrapped helper inside an
   `along()` callback, and report a `bakedModel` need to the parent.
4. After EVERY edit:
   ```sh
   node tools/track/verify-track.cjs <id>
   node tools/track/coplanar-audit.cjs <id>
   node tools/track/float-audit.cjs <id>    # if the survey flagged floats
   ```
5. Report: what moved, the before/after survey numbers, and the exact baseline
   deltas (file + count) if any — the parent decides whether a baseline moves.

## Scope rules

- The ONE circuit file is your only write. Never `js/track/` (the engine),
  other circuits, baselines (`tools/*-baseline.json`), tests, `index.html`,
  or `version.json`. Report the change unverified rather than running a group.
- NEVER flip a curvature sign without a rendered lap (+k = LEFT-hand turn).
- Unless `.claude/settings.json` sets `worktree.baseRef: "head"`, a worktree
  starts STALE: first `git checkout -B <branch> <the session SHA>` and verify
  a session-known file — a stale base is the wrong circuit.

Flat prohibitions: AGENTS.md §Verification 3 and 7 (no Playwright/test-bg/test-solo/chrome-start, no --wait, no bump); the js/css/index.html write ban is hook-enforced.
