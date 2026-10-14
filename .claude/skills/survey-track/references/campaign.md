# Multi-circuit realism campaign

Folded from the retired `track-realism` skill (2026-10-14) into **survey-track**.
Run this workflow in the parent session. It deliberately has no fork: browser
captures, integration and shared-file decisions belong to the parent.

Use `/survey-track spa monza silverstone` with an explicit target year/layout
when known, or ask for a reusable track research and detail campaign. Start
with one pilot, then batches of two or three circuits once the approach works.

Arguments: `$ARGUMENTS` — the circuit ids (and an optional target year) typed
after `/survey-track`; every id must be in `Tracks.LIST`. Empty ids → ask before
step 1. No year → take the era from the `docs/tracks/<id>.md` header, else ask once.

1. Read repository and nested circuit guidance, current briefs and source.
   Pin the starting SHA; select circuit ids, target era and 3–5 observable
   improvements per circuit. Read [the campaign procedure](campaign-workflow.md).
2. Create a per-circuit evidence packet from
   [the template](evidence-template.json), under
   `scratch/survey-track/<id>/`. Research official maps, dated photographs,
   onboard footage and surveyed elevation where available (WebSearch/WebFetch; cite
   URLs). Inspect actual
   images; label unknowns and estimates. Parent captures current game views.
3. Delegate each circuit's audit to its OWN **track-surveyor** subagent
   (one per circuit, [SKILL.md](../SKILL.md) loop). Assign each author exclusive
   ownership of the circuit definition and its scenery file, using the
   [delegation prompt](delegation.md). AGENTS.md rule 10 applies.
4. Route geometry through [new-track](../../new-track/SKILL.md), placement and
   structural detail through [scenery-dress](../../scenery-dress/SKILL.md), and
   imports/materials through [asset-pack](../../asset-pack/SKILL.md). One named
   owner handles each shared engine or asset change before dependent edits.
5. Integrate edits and record measured geometry/asset costs. Finish all source
   edits before parent-owned matched after captures and targeted verification.
   Captures: playwright-probe. AGENTS.md rules 4-5 apply.
   Parallel agents can research or use genuinely separate worktrees meanwhile.
6. Follow [check-changes](../../check-changes/SKILL.md) for the required gates,
   verified commit, push, draft PR and CI watch. Report demonstrated changes,
   remaining accuracy gaps and unverified browser/device coverage explicitly.

The offline contract (`node --test --test-name-pattern "sceneryApi surface" tests/unit/scenery-api-contract.test.mjs`)
checks only the scenery API surface. It does
not certify real-world accuracy, successful campaign execution or performance.
