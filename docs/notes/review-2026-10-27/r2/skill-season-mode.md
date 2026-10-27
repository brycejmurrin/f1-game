VERDICT: FIX — every path, symbol and test name checks out, but the sprint/quali on/off chains skip APPLY and the frozen `activeCfg`, so the most likely "toggle ignored" ask gets sent to the wrong place.
METRICS: SKILL.md 111 lines / ~6.9 KB (~1.7k tokens); description ~330 chars; 1 references file (sprint-scoring.md, 19 lines), one level deep.
PATHS: OK. All exist: season-cal.js, season-ui.js, results-sheet.js (buildResults:212, midWeekend:773), pit-lane.js, announcer.js, race/race-settings.js, quali-sheet.js, season-cal.test.mjs, season.spec.js, season-format.spec.js, badges/real-race-script tests, remote-group/test-bg/pick-tests; group `modes` (groups.json:1940) holds both season specs. All 13 cited test titles are at season-cal.test.mjs:113-781.
COMMANDS: OK (no flags beyond `--spec`-free npm test; see row 4).
SYMBOLS: OK. CFG_KEY:7, SPRINT_POINTS:10, CLASSIC_POINTS:11, DROP_OPTS:14, LAP_OPTS:24, normalize:63, rulesConfig:130, fmtActive:148, gpName:169, applyConfig:203, sprintOn:394, stage:403, quali:412, payTable:454, award:463, REAL_2026:650 (23 rows), PRESETS:661, preset:678; ss-sprint/ss-quali/ss-presets/buildPool in season-ui.js:102-140.

## Rows (severity | file:line | problem | fix)
1. HIGH | SKILL.md:47 | The sprint chain goes `draft.sprint -> normalize() -> sprintOn(season)` and leaves out the two links that decide the outcome. First, APPLY (`#ss-apply` -> `SeasonCal.applyConfig(draft)`, season-ui.js:262-296). Second, `sprintOn` reads `rulesConfig()`, which is the live season's FROZEN `activeCfg` and not the preferences (season-cal.js:130, 396). | Rewrite the chain as `chip -> draft -> APPLY (applyConfig; changed rules arm a 2-tap "RESTART? — SEASON IS LOST", season-ui.js:293-295; BACK discards the draft) -> setConfig + activeCfg=snap (season-cal.js:226-227) -> rulesConfig() -> sprintOn(season)`.
2. HIGH | SKILL.md:47-48,53 | Missing: the SETUP draft opens from `SeasonCal.config()` (preferences, season-ui.js:225), not from `G.season.config`. A resumed save freezes its own config (season-cal.js:265), and a foreign `seasonCfg` write resets the preferences (:95). Either way the chip can read ON while the live season still races OFF. | Add a line to check: `G.season.config.sprint` / `sprintIds` against `SeasonCal.config()` before you suspect the chip or a consumer. Do the same for the quali chain (:53).
3. MED | SKILL.md:101-110 | The lifecycle section has the right facts (frozen `season.config`, applyConfig), but neither on/off chain links to it, and it sits last. | Point to it from :47 and :53, or move it above the chains.
4. MED | SKILL.md:32 | A foreground `npm test -- tests/specs/season.spec.js` plus the words "background it" contradicts itself. AGENTS.md §Verification names `node tools/ci/test-bg.mjs --spec <file>` as the background form. | Use `node tools/ci/test-bg.mjs --spec tests/specs/season.spec.js`.
5. MED | SKILL.md:47 | "per-round toggles via `sprintIds`" sits next to buildPool, but the per-round toggles are in `buildCalendar`/`toggleSprint` (season-ui.js:41-54, 89). | Name `buildCalendar` / `toggleSprint`.
6. LOW | SKILL.md:48 | A weekend with no sprint session has a quiet cause: `sprint:"rounds"` with no round marked makes `sprintOn` false (season-cal.js:398). The UI note counts the marked rounds (season-ui.js:165). | Name the empty-`sprintIds` case.
7. LOW | SKILL.md:84-86 | Literal `LAP_OPTS` `[3,5,10,25,57]` and `DROP_OPTS` `[0,2,3]` copy the code and will drift. | Keep only the symbol names and the "add an option, don't loosen the check" rule.
8. LOW | SKILL.md:65 | "the frozen 23-round table" is true today. But the code comment (season-cal.js:640-642) says Qatar and Abu Dhabi were still undecided ("decision expected mid-October"), so the count can change. | Drop the "23".
9. LOW | SKILL.md:31,36 | "<1 s" and "(30–45 min locally)" are hard-coded timings. The second copies AGENTS.md §Verification. | Replace with a pointer to AGENTS.md.
10. LOW | SKILL.md (missing) | The sprint DISTANCE path is not covered: `lapsFor()` / `SPRINT_FRAC` / `SPRINT_MIN` (season-cal.js:425-428, game.js:2584). Neither is `roundLaps()` for NEXT ROUND. A "sprint runs the full distance" ask has nowhere to go. | Add one line under Sprint on/off.
11. LOW | SKILL.md:3 | The description starts "Use when…" and lists nouns. It does not say what the skill teaches (two gates, the config chain), and it has no player-language trigger such as "sprint toggle ignored" or "championship setup". | Add one third-person WHAT clause and two trigger phrases. Keep the career-mode exclusion.

## FIRST-WRONG-STEP
The ask: "the Season setup sprint toggle is ignored when the weekend starts". Routing works: "Season setup" and "sprint" match this skill, career-mode excludes the standalone screen, and race-weekend sends calendar asks here. The agent follows SKILL.md:47. It checks the chip, then `normalize()`, which is correct. Then it checks `sprintOn(season)` with flow "season" (:48), which also passes. With the chain clean, it moves on to the consumers at :49 (game.js, pit-lane, announcer) and goes the wrong way.

This is the FIRST wrong step: SKILL.md:47 jumps from `normalize()` straight to `sprintOn`. `sprintOn` never reads the normalized draft or the saved preferences. It reads `rulesConfig()`, which is the frozen `activeCfg` of the live season. That snapshot only changes when APPLY succeeds through `applyConfig` (season-cal.js:217-227).

The real suspects:
- (a) APPLY with changed rules only ARMS a confirm. A single tap, or BACK, drops the draft (season-ui.js:233-235, 293-295).
- (b) The chip shows the saved preferences (`config()`), not the live season's `season.config`. A resumed or other-tab season races its own frozen setting.
- (c) A foreign-save conflict refuses APPLY (`ok:false`), and the UI reloads the other season (season-ui.js:266-280).
- (d) "SPRINT ROUNDS" is on but no round is marked.

The skill mentions (a)–(c) only in the lifecycle section (:101-110), and the chain never sends the agent there.

## Contradictions
- Row 4 conflicts with AGENTS.md §Verification (background form `test-bg.mjs --spec`).
- No conflict with career-mode or race-weekend routing.
- The "no `test:career` group" note (:28) is consistent: groups.json uses `modes`.

COVERED: trigger and sibling routing; every path, symbol and test title; the walkthrough; the sprint-scoring reference; the two gates against code (calCustom/fmtActive :147-148); APPLY/draft/resume code.
NOT COVERED: consumer internals in pit-lane.js / announcer.js / race-settings.js (existence only); season.spec.js contents (does it exercise APPLY then sprint?); the Codex mirror under `.agents/skills/`; `--help` on test-bg/remote-group (not run, browser-tool rule).
