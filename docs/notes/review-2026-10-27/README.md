# Whole-surface review, 2026-10-27

Bryce asked, on 2026-10-27, to "re review our new design and use subagents to review all skills docs and other parts
of the code extremely thoroughly", then to "re launch subagent reviews and hunts running opus", and finally to "fully
re launch all of our subagents for skills and opus ones from scratch". The fix plan built from this evidence is
[plans/2026-10-27-review-fix-plan.md](../../plans/2026-10-27-review-fix-plan.md).

Every reviewer was read-only. None could drive a browser (AGENTS.md rule 10), so a claim marked CODE-TRACED or
PLAUSIBLE was traced from source, not reproduced in the game.

| Folder / file | What it holds |
|---|---|
| [r2/](r2/) | The second, from-scratch Opus pass (the plan's main source). `skill-*.md`: 36 skill reviews, each told not to read the first pass; all 36 returned FIX. `hunt-*.md`: 9 code-hunter slices (hunt reports are the parent's transcription of the hand-back rows: code-hunter cannot write files). `workflows.md`, `relay-fleet.md`, `agents-hooks.md`, `docs.md`, `dead-tools.md`, `landing-design.md`: the six domain reviews (`relay-fleet.md` and `dead-tools.md` moved to [docs/archive/notes/review-2026-10-27/r2/](../../archive/notes/review-2026-10-27/r2/) once #3935 deleted what they list). |
| [skills/](skills/) | The first Opus pass, one per skill. Kept as corroboration: a row both passes found is marked 2× in the plan. |
| [hunts/](hunts/) | The first 8 Opus `code-hunter` passes. Each lists what it did NOT read: the slices were larger than one pass, so a clean row is not proof of no defect. |
| [rulebook.md](rulebook.md) | The rulebook coherence review (AGENTS.md, CLAUDE.md, WORKERS.md, rule files) against the deploy tip before #3914. |

One R2 claim was checked by hand and found wrong: agents-hooks.md says a PR cannot weaken its own gate. `land.yml`
triggers on plain `pull_request` (deploy tip, line 54), so GitHub runs the PR's own copy; plan WP-L1 stands.
