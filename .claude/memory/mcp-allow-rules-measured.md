---
name: mcp-allow-rules-measured
description: "Measured 2026-10-15 — which .claude/settings.json allow entries actually match in cloud sessions, how to measure it, and what cannot be pre-approved from the repo"
metadata:
  node_type: memory
  type: project
  originSessionId: 1a3325fb-8665-5c57-a3a8-40281e9219f1
  modified: 2026-10-15T09:55:31.762Z
---

Measured 2026-10-15 on deploy tip abb1acd (session_01QTnGarENnxSWFxr7iFjub6):

- Measure, never infer: `list_events` on a session; each tool result's
  `tool_result_meta[].permission_decision` says `rule`+`config` (an allow rule
  matched), `classifier` (auto mode, no rule matched) or `user_temporary` with
  no reason (a human prompt). Sibling sessions always launch in AUTO mode, so
  "no prompt seen" in a sibling proves nothing.
- Bare `mcp__<server>` entries match github, claude-code-remote, TinyFish,
  Context7, Claude_Docs but NOT the `.mcp.json` stdio servers (apex-tools,
  chrome-devtools, playwright-official); `mcp__<server>__*` does match them.
- MDN and BrowserStack connectors prompt in default mode whatever the rule
  (bare, tool, wildcard, connector UUID, 10 spellings tried): fix is the
  per-connector tool permission at https://claude.ai/customize/connectors, not
  the repo. Connector UUID prefixes exist only ~2 min after session start.

**Why:** the orchestrator (PR #2124) nearly shipped UUID allow lines on an
auto-mode "proof"; four probe rounds settled it.
**How to apply:** before another settings.json permissions PR, read the
decision metadata on the current tip first; point connector prompts at the
claude.ai connector page. Related: [[pr-auto-merge]].
