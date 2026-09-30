---
name: one-subagent-per-skill
description: "For skill reviews the user wants one Sonnet subagent per skill, not skills grouped by domain"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 2123b268-a868-5e07-a534-c8d79e348a20
  modified: 2026-09-30T01:07:02.279Z
---

When asked to review, test or exercise the project's skills with subagents, spawn ONE subagent per skill (27 today), each owning only its own skill directory. The user interrupted a grouped fan-out (4–5 skills per agent) on 2026-09-30 and said "One subagent per skill".

**Why:** each skill gets a full test-drive and its own report; grouped agents skim. Disjoint ownership also lets every agent edit its skill without conflicts.

**How to apply:** write one shared brief to the scratchpad, launch with `model: sonnet` and `run_in_background: true`, one skill name and one realistic task hint per agent. The harness caps concurrent subagents at 20, so queue the rest as completions arrive. Subagents cannot run browser tests here (hook), so brief them to exercise the non-browser steps and mark browser-only ones. See [[small-steps-for-api-analysis]] for the user's general preference for small increments.
