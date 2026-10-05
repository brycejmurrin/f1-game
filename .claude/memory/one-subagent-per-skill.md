---
name: one-subagent-per-skill
description: "For skill reviews the user wants one Sonnet subagent per skill, not skills grouped by domain; the brief + report shape that worked on 2026-10-05"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 2123b268-a868-5e07-a534-c8d79e348a20
  modified: 2026-10-05T04:21:20.186Z
---

When asked to review, test or exercise the project's skills with subagents, spawn ONE subagent per skill (30 on 2026-10-05), each owning only its own skill directory. The user interrupted a grouped fan-out (4–5 skills per agent) on 2026-09-30 and said "One subagent per skill".

**Why:** each skill gets a full test-drive and its own report; grouped agents skim. Disjoint ownership also lets every agent edit its skill without conflicts.

**How to apply:** write one shared brief to the scratchpad (trigger check, path audit, `--help`/`--plan` dry-runs, a task walk-through, structure check; a fixed 8-line report shape with VERDICT / PATHS / COMMANDS / WALKTHROUGH / STRUCTURE / EDITED / OUT OF SCOPE) and launch with `model: sonnet`, `run_in_background: true`, one skill name and one realistic task hint per agent. Collect every OUT OF SCOPE line in a scratchpad findings log and fix those yourself afterwards (tool `--help` gates, stale doc anchors, catalog drift). Measured 2026-10-05: 20 concurrent agents push loadavg to 10–13, so a "node --test only below loadavg 3" rule makes most agents skip their unit runs — cap at ~12 concurrent, or tell them a per-file `node --test` is fine at any load. Subagents cannot run browser tests here (hook), but `apex-eval.mjs --help` booted Chromium in four of them until it got a help gate. See [[small-steps-for-api-analysis]] for the user's general preference for small increments.
