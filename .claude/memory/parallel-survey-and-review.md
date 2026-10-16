---
name: parallel-survey-and-review
description: "For UI/HUD reports: run the browser survey as a background apex-tools job from the main thread while read-only subagents review the code for organization and adaptability; write the resulting plan as a docs/notes file"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 004a81f0-80ec-5313-8267-7e049bcded05
  modified: 2026-10-10T05:09:03.898Z
---

On 2026-10-10 (phone-landscape HUD "floating elements" report) Bryce asked to
"use background tools to use apex tools mcp to survey screenshot live hud
options to check our status while other subagents look for better ways to
improve organization and adaptability", then "Write plan".

**Why:** he wants the measured status (survey shots, overlap findings) and the
design review to proceed in parallel, not serially, and the outcome as a
phased plan he can read in the repo, not only in chat.

**How to apply:** after the first fix lands, start `apex_hud_survey` (or
`apex_hud_shot` cells) as background jobs from the main thread — subagents are
hook-blocked from browser runs and only one browser run may be live, so never
start one on top of a CPU-heavy node suite (the gate refuses at loadavg ≥ 3).
In parallel spawn ≤2 read-only `Explore` agents with file:line briefs (one on
the slot/placement logic, one on survey coverage and anchors). Write the plan
to `docs/notes/<TOPIC>-PLAN-<date>.md` (phases, pins, verify commands, open
decisions), commit it on the PR branch, and point the PR body at it. Pattern
of [[survey-then-fix]]; phone cells per [[user-plays-on-phone]].
