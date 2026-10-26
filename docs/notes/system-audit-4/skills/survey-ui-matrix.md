# survey-ui-matrix — card reviewer hand-back (saved by main)

VERDICT FIX — matrix tools, flags and paths are accurate, but the skill never covers publishing evidence or the survey-plus-reviewers shape | report: none written (no report path given, Write limited to scratch/**.md; this message is the report)
GAP1 /home/user/f1-game/.claude/skills/survey-ui-matrix/SKILL.md:105 — no "hand-off / evidence" section. Add the publish-evidence.mjs --dir artifacts/layout-audit --label <slug> --publish command, a pointer to docs/EVIDENCE-STORAGE.md, and the parent-owned background job plus at most 2 read-only reviewers shape (AGENTS.md rules 4 and 10).
GAP2 /home/user/f1-game/.claude/skills/survey-ui-matrix/SKILL.md:8-12 vs :32 — "--list/--report parent-only" contradicts "no browser, exits before launch". Check what bash-guard.sh really refuses and state one rule.

Extra findings (all verified read-only):
- PATHS OK. Every cited tool, doc, npm script (ui:survey, ui:gallery, ui:audit, test:baseline) and MCP tool (apex_ui_mission_plan, apex_ui_fit, apex_hud_survey, apex_hud_shot, apex_hud_mock, apex_shot_survey) exists.
- COMMANDS OK. `--help` ran for layout-audit, fit-audit and menu-mock, and every cited flag is present. The hud-survey.mjs flags appear in its source.
- ios-iphone-landscape-844 exists at tools/ui/menu-screens.mjs:47 but is NOT first. ios-iphone-portrait (:31) and ios-iphone-landscape 852x393 (:33) come before it. layout-audit's `--viewport` default is the 852x393 one, so `--survey` and the bare default run miss Bryce's 844x390 shape unless `--viewports=` is passed. menu-mock defaults to "the play-shape phone". The 844 row also lacks deviceScaleFactor 2, and the skill doesn't say so.
- The skill does not describe the memory's "background survey job + at most 2 read-only reviewers" shape. SKILL.md:9-12 says only "delegate artifact analysis". It does not mention backgrounding or logging under artifacts/logs. The loadavg gate (< 3, SKILL.md:35) has no fallback; load is 6.3 now.
- publish-evidence.mjs and EVIDENCE-STORAGE.md are absent from the whole skill, including references. The browser-belongs-to-parent rule is present (SKILL.md:8-12, rule 10).
- The description (about 330 chars) lacks user-typed triggers such as "phone landscape", "844", "tap target" and "survey all screens". apex_shot_survey is not named in the skill. Sibling-description collisions were not checked (UNREAD).
- SKILL.md:15 cites an "AGENTS.md UI review baseline", but AGENTS.md has only a one-liner at §Seeing the game 4, so the pointer dangles. The browser-in-subagent ban at :8-12 is already hook-enforced and could shrink to a pointer.
- References setup.md, probes.md and hud-mock.md were not read (UNREAD).
