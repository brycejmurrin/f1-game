VERDICT: FIX — routing, paths and flags are sound, but step one (`apex_ui_mission_plan` "plans the matrix") is false, and Bryce's 844 cell as written takes no screenshots
METRICS: SKILL.md 129 lines (~7.5 KB, ~1.9k tokens) / description ~330 chars / 4 references (setup 97, probes 275, hud-survey 27, hud-mock 16 lines)
PATHS: OK. All 26 cited files exist (ui-device-profile, MOBILE-UI-EMULATION, ui-mock-core, ui-scale-axis, fit-audit, menu-fit, menu-mock, explorer, hud-survey, hud-mock, publish-evidence, playwright-mcp.sh, layers.js, sheet-shape.js, i18n-pseudo.js, UI-SCALE-AND-ZOOM, traps.md, bump.md, restructure.md, hud-survey-matrix, hud-survey.yml, EVIDENCE-STORAGE, ui-audit/menu-baseline specs). npm `ui:survey`/`ui:gallery`/`ui:audit`/`test:baseline`/`test:ui` exist. MCP `apex_ui_mission_plan`, `apex_hud_shot|survey|mock` exist.
COMMANDS: OK on flags. layout-audit's header has --shots --dom --scale --circuits --gallery --screen --viewport --report --diff --lang --jobs. menu-mock has --format/--list, and its default viewport really is ios-iphone-landscape-844. fit-audit has --sizes/--scale and explorer has --device/--settings. bash-guard.sh:334 matches layout-audit/menu-mock unless the call has --help/--plan, which matches SKILL.md:8-10. Not checked: the menu-fit "18 screens" / fit-audit "12" counts (SKILL.md:68).

## Findings — severity | file:line | problem | fix
1. HIGH | SKILL.md:25 | "`apex_ui_mission_plan` plans the matrix — screens × viewports × pointer". FALSE: ui-tools.mjs:96 takes a named `mission` (first-race / customize-car / return-settings, apex-tools-mcp.mjs:505) and writes an explorer replay scenario. It never enumerates screens or viewports. | Replace it with `layout-audit.mjs --list` (parent) as the planning step. Mention mission_plan only for guided player-flow replays.
2. HIGH | SKILL.md:32-33 | Bryce's-cell command `--viewports=ios-iphone-landscape-844 --screens='*'` has no `--shots --dom`, yet :19-21 requires full-size images plus DOM evidence. An agent gets numbers and no pictures. | Add `--shots --dom` and say it runs as ONE `run_in_background` task logging to artifacts/logs/ (rule 4). :104 says so, but too late.
3. MED | SKILL.md:41 vs :32 | `--survey` / `npm run ui:survey` is labelled "title-path + shots", which reads like the "review every screen" button. It covers only 6 screens at ios-iphone-landscape 852x393 (layout-audit.mjs:63-64), not 844x390 and not every screen. | Annotate it: "6 screens @852x393, NOT Bryce's cell, NOT every screen".
4. MED | SKILL.md:19-21 | Requires real scrolling both ways, the final action, focus visibility and rotation/state-retention checkpoints, but names no tool that does them (layout-audit is static geometry). | Point to `apex_ui_inspect --touch --roundtrip` / `explorer.mjs` (ui-menu-a11y), or Playwright MCP after the batch run ends.
5. MED | setup.md:11,19 | The setup ritual resizes or emulates to 852x393, not Bryce's 844x390. That contradicts "Bryce's profile first" (SKILL.md:16). | Use 844x390 (and `844x390x3,mobile,touch,landscape`).
6. MED | setup.md:23 vs :78 | Says start the server on 3456, then says to serve on 3457 so a survey cannot hit a run in flight. | Pick 3457 in the ritual itself.
7. MED | probes.md:137-140 | The `OV` reset list is marked "= OVERLAY_IDS" but is stale: it lacks `bench`, `photo-studio`, `loading` (menu-screens.mjs:588-595). photo-studio left open is the documented poison of every later cell. | Drop the inline copy and import or print OVERLAY_IDS.
8. LOW | probes.md:76-80 | TRAP 3 arithmetic is still built on the 1.15 coarse scale. The note says it is 1.09 now (tokens.css:894, which matches), but the example (60px → 52) is stale. | Redo the example at 1.09 (57px paint ≈ 52 CSS).
9. LOW | SKILL.md:90, hud-survey.md:13-17, hud-mock.md:5 | Undated timings (57 s / 1 s, 5.4 min, ~10 min, ≈45 min / 4 h, 143 s). | Date them or move them to docs/notes.
10. LOW | hud-survey.md:3, hud-mock.md:6 | Orphan cross-refs ("The menus above", "hud-survey (below)") left over from when these were inline in SKILL.md. hud-mock.md never names MCP `apex_hud_mock`. | Reword. Add the MCP pointer.
11. LOW | probes.md:11-12 | Section numbering starts at 3 (§1-2 moved to setup.md), yet SKILL.md:74 cites "probes.md §6". | Renumber and fix the citation.
12. LOW | SKILL.md:100 | "Interactive poking: Playwright MCP or Chrome DevTools MCP" does not repeat the one-browser rule against a live layout-audit/menu-mock run (setup.md:47 covers Playwright test runs only). | Add "after the batch job exits; browser_close first".

## FIRST-WRONG-STEP
SKILL.md:25. Following "Prerequisites", the agent's first action is `apex_ui_mission_plan` to plan screens × viewports × pointer. The tool rejects a call without a named mission (`Unknown named mission`). With a mission, it writes a 3-flow explorer replay scenario, not a matrix. The agent either stalls or treats a replay plan as the survey plan. Second wrong step: SKILL.md:33 runs Bryce's cell without `--shots`, then cannot satisfy :19-21.

## Contradictions with AGENTS.md / siblings
- Rule 4: the 844 run is shown as a bare foreground command (:33, :41-44). Only :104 says background. No duration is given for `--screens='*'`.
- Rule 5 / one browser: SKILL.md:39-40 loadavg < 3 is consistent with AGENTS.md. setup.md's MCP ritual has no "not while layout-audit runs" guard (#12).
- Rule 10: consistent (subagents analyse artifacts only).
- Routing: description, ui-menu-a11y and css-play cross-route cleanly ("full matrix → survey-ui-matrix", "One cramped screen → ui-menu-a11y"). "review every screen at 844x390, touch first" routes here. The descriptions are imperative ("Use when"), not third person, the same as their siblings.

## ENFORCEMENT
- OUT OF SCOPE: bash-guard.sh:334 CAPTURE covers ui/{layout-audit,menu-mock,css-play}. It misses ui/fit-audit.mjs, ui/menu-fit.mjs and ui/explorer.mjs, all of which launch Chromium (fit-audit.mjs:51 "Browser-only"), so a subagent can run them. That is a hook gap, not skill prose.
- SKILL.md:8-12 parent-only prose is hook-enforced for layout-audit/menu-mock and could shrink to a pointer.

## GAPS (ranked, each PR-sized)
1. SKILL.md:25 — replace the false mission_plan step with `layout-audit --list`.
2. SKILL.md:33 — add `--shots --dom` plus the background-job framing to Bryce's cell. Annotate `--survey` (:41) as 852x393 / 6 screens.
3. setup.md:11,19,23 — 844x390 and port 3457 in the ritual.
4. probes.md:137-140 — stale OV list. Replace it with OVERLAY_IDS.
5. SKILL.md:19-21 — name the tool for scroll/focus/rotation checkpoints (apex_ui_inspect roundtrip).

COVERED: SKILL.md and all 4 references. Paths, npm scripts, MCP names, layout-audit/menu-mock/fit-audit/explorer flags, bash-guard match, VIEWPORTS/SCREENS/OVERLAY_IDS, tokens 1.09, sibling descriptions.
NOT COVERED: geometry-mode default `--viewport` claim (SKILL.md:32), menu-fit/fit-audit screen counts (:68), `__apex.finishRace`/`careerRollover` routes (probes.md:186-189), hud-survey/hud-mock individual flags beyond presence, publish-evidence flags.
