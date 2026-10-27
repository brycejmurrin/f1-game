# Whole-surface review, 2026-10-27

Bryce asked, on 2026-10-27, to "re review our new design and use subagents to review all skills docs and other parts
of the code extremely thoroughly", then to "re launch subagent reviews and hunts running opus". The fix plan built
from this evidence is [plans/2026-10-27-review-fix-plan.md](../../plans/2026-10-27-review-fix-plan.md).

Every reviewer was read-only. None could drive a browser (AGENTS.md rule 10), so a claim marked CODE-TRACED or
PLAUSIBLE was traced from source, not reproduced in the game.

| Folder / file | What it holds |
|---|---|
| [skills/](skills/) | 36 Opus deep passes, one per skill in `.claude/skills/`. Each confirms or refutes the earlier Sonnet pass, verifies every cited symbol, line and flag, walks one realistic ask end to end and names the first step an agent gets wrong. All 36 returned FIX. |
| [hunts/](hunts/) | 8 Opus `code-hunter` passes, one per slice of `js/`, plus `tools/ci` + workflows + hooks. Each lists what it did NOT read: the slices were larger than one pass, so a clean row is not proof of no defect. |
| [rulebook.md](rulebook.md) | The rulebook coherence review (AGENTS.md, CLAUDE.md, WORKERS.md, rule files) against the deploy tip before #3914. #3914 already fixed its required-checks and dispatcher-description rows. |

Domain reviews (workflow usage, relay and fleet leftovers, agents and hooks, docs accuracy, dead tools, the landing
design) were relaunched on Opus after the first run was stopped; their reports join this folder when they land.
