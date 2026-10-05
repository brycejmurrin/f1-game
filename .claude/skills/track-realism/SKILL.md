---
name: track-realism
argument-hint: "<circuit ids…> [target year]"
description: "Use when a reusable or parallel realism campaign spans several circuits, or the user wants a repeatable track research workflow to set up (/track-realism spa monza silverstone): dated evidence, geometry, scenery, exclusive circuit ownership. One circuit's accuracy pass → survey-track."
---

# Track realism campaign

Run this workflow in the parent session. It deliberately has no fork: browser
captures, integration and shared-file decisions belong to the parent.

Use `/track-realism spa monza silverstone` with an explicit target year/layout
when known, or ask for a reusable track research and detail campaign. Start
with one pilot, then batches of two or three circuits once the approach works.

Arguments: `$ARGUMENTS` — the circuit ids (and an optional target year) typed
after `/track-realism`; every id must be in `Tracks.LIST`. Empty → ask for the
ids and era before step 1 rather than guessing a calendar.

1. Read repository and nested circuit guidance, current briefs and source.
   Pin the starting SHA; select circuit ids, target era and 3–5 observable
   improvements per circuit. Read [the campaign procedure](references/workflow.md).
2. Create a per-circuit evidence packet from
   [the template](references/evidence-template.json), under
   `scratch/track-realism/<id>/`. Research official maps, dated photographs,
   onboard footage and surveyed elevation where available. Inspect actual
   images; label unknowns and estimates. Parent captures current game views.
3. Delegate independent circuit audits to **track-surveyor** through
   [survey-track](../survey-track/SKILL.md). Assign each author exclusive
   ownership of the circuit definition and its scenery file. Children never
   launch browsers, Playwright, `test-bg` or browser waits.
4. Route geometry through [new-track](../new-track/SKILL.md), placement and
   structural detail through [scenery-dress](../scenery-dress/SKILL.md), and
   imports/materials through [asset-pack](../asset-pack/SKILL.md). One named
   owner handles each shared engine or asset change before dependent edits.
5. Integrate edits and record measured geometry/asset costs. Finish all source
   edits before parent-owned matched after captures and targeted verification.
   One local browser process/group at a time; no heavy Node audits beside it.
   Parallel agents can research or use genuinely separate worktrees meanwhile.
6. Follow [check-changes](../check-changes/SKILL.md) for the required gates,
   verified commit, push, draft PR and CI watch. Report demonstrated changes,
   remaining accuracy gaps and unverified browser/device coverage explicitly.

An offline smoke recipe checks only a relevant scenery API contract. It does
not certify real-world accuracy, successful campaign execution or performance.
