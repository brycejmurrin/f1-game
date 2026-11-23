VERDICT: FIX — one stale anchor, one overclaim ("career always races Tracks.SEASON"), one description collision; otherwise sound, paths all exist.
METRICS: SKILL.md 81 lines / 5265 B (~1.3k tok); workflow.md 136 / 8553 B; persistence.md 21 lines; description 331 chars; 2 references files.

PATHS: OK. Verified present: all 9 cited unit tests, tools/car/career-economy.mjs, quali.spec.js, career.spec.js, save-migrate.js, career-backup.js, quali-model.js, reliability.js, css/career.css, check-changes/references/bump.md; docs/CAREER.md anchors "In career" (:620), "Regulation eras" (:683), "durable mirror" (:95), AMBITION (:753); DEBUG-HOOKS.md "Career & qualifying" (:4022). Test names quoted in workflow step 9 and the sponsor trace all exist (season-cal.test.mjs:329/353/684, career-settle.test.mjs:224/247/434).
COMMANDS: OK. career-economy.mjs has --years (header :24, parser :38) and its own --help gate (:33). `test-bg.mjs modes` and gen-shell --check not run (hook-class tools); not re-verified here.

ANCHORS (Extra ask):
- STALE (NEW/pass3 S7 confirmed): workflow.md:113 `career-hub.spec.js ~505` -> test is at :558 (`a window pays at most once across a whole season`). Fix: cite the test title only, drop `~505`.
- workflow.md:113 `docs/CAREER.md ~839`: section "Sponsors" starts :835, `paidSponsors` at :848. Roughly right, drifts; cite the heading `## Sponsors — MY TEAM's second income`.
- Other `~` marker: SKILL.md:69 "~VM" is meaningless filler (career-settle is 1512 lines; not a ~1 s test). Delete.

DESCRIPTION COLLISION (quote both):
- career-mode (SKILL.md:3): "Use when DRIVER CAREER, MY TEAM, career saves or slots, contracts, sponsors, R&D economy, career qualifying, reliability/DNFs, career hooks/tests change — including season, sprint and quali behaviour INSIDE a career save (career always races Tracks.SEASON). The standalone Season screen with no career save open is season-mode."
- season-mode (SKILL.md:3): "Use when the standalone Season screen changes — calendar, weekend format, sprint, quali-on/off, lap count, points table, fastest-lap point (flPoint), Season SETUP (#season-setup), season-cal.js, season-ui.js. A season, sprint or quali bug inside a DRIVER CAREER / MY TEAM save is career-mode (career always races Tracks.SEASON)."
Both already carry a cross-pointer (so the pass-3 S2 collision is partly fixed). Residual: season-mode's lead noun list (calendar, sprint, quali, points table, season-cal.js) comes first and matches a career prompt such as "sprint appears in my career"; the career redirect is the LAST sentence. One-clause fix in season-mode: front-load it, e.g. start "Use when the standalone Season screen (no career save open) changes — ..." and keep the tail. Career side is fine.

"career always races Tracks.SEASON" — FALSE as stated, and it is repeated in both descriptions (SKILL.md:3) and season-mode:
- Nothing in SKILL.md/workflow.md says where it lives. SKILL.md:48 says "keep the defaults and Tracks.SEASON" with no file anchor.
- Truth: the career calendar is STAMPED. js/career/career.js:1844-1860 `calendarOf(c)` returns `Tracks.SEASON` only when the save has no `season.calIds`; otherwise the stamped ids (start()/rollover() stamp them via `stampCalendar`, :1853). Consumers use `Career.calendar()` (title-menu.js:145, career-ui.js:987/1273, setup-camera.js:595, season-cal.js:153) with `Tracks.SEASON` as fallback. A build that adds/reorders circuits makes a live career NOT equal Tracks.SEASON.
- Where the "career has no custom calendar" half lives: season-cal.js `calCustom()` (`flow !== "career"`), pinned by season-cal.test.mjs:329. Neither is named with a path:line in the skill except via workflow step 9 (no calendarOf mention).
- Fix wording: "a career races its stamped calendar (`Career.calendar()`, js/career/career.js `calendarOf`; Tracks.SEASON when unstamped); SeasonCal never customises it (`calCustom()`)".

WALKTHROUGH ("sprint appears in my career"): SKILL.md:48 -> step 9 -> fmtActive/calCustom gates, setFlow() game.js:861 calls SeasonCal.engage(flow) (verified). Clear, and the "don't give career a format" stop is good. Stuck point: an agent told "career always races Tracks.SEASON" would assert a calendar equals Tracks.SEASON on a stamped save and chase a false bug. "Lost upgrades" -> persistence.md hook repro works; note step 4 uses `page.reload()` (Playwright) = parent-only, not stated there.
STRUCTURE: 81-line SKILL.md is fine. Quick Reference table has rows up to ~600 chars (SKILL.md:44, :45, :48 >400); row :48 duplicates workflow step 9 in full — shorten to a pointer. "Node-VM unit tests" list (:72-74) restates what test-bg/tooling-fast covers. Sponsors row (:45) duplicates docs/CAREER.md:837 text ("a driver is paid a salary, an owner is paid by sponsors"). Both references are linked from SKILL.md; none orphaned. workflow.md:67 bump.md link correct (`?v=dev`, no bump) matches game-code.md.
ENFORCEMENT: career-determinism.test.mjs already fails on simRnd/Math.random (cited at workflow:52) — the prose in step 6 + SKILL.md:49 can shrink to the pointer. SKILL.md:64 "parent session only, never a subagent" is hook-enforced (bash-guard) — shorten. The `Career.inCareer()` gate rule has no lint; only prose (candidate, low value).
Bryce setup: nothing unsafe; no 844x390/touch guidance for career hub UI repros (workflow step 7 says "assert UI flow through career.spec.js" only). Add one line: reproduce hub/HUD at 844x390 touch (fleet-core.md).

GAPS (ranked):
1. workflow.md:113 — `career-hub.spec.js ~505` -> title only (real line 558); `docs/CAREER.md ~839` -> heading. Docs-only, tiny.
2. SKILL.md:3 and :48 (and season-mode SKILL.md:3) — replace "career always races Tracks.SEASON" with the stamped-calendar truth, anchor `js/career/career.js` `calendarOf`/`stampCalendar` (:1853-1860) + `calCustom()`; front-load "(no career save open)" in season-mode's lead clause.
3. SKILL.md:48 — cut table row to a pointer to workflow step 9 (dup, ~600 chars); drop "~VM" at :69; compress :64 and determinism prose to pointers.
4. workflow.md step 7 / persistence.md:19 — one line each: browser/reload steps are parent-only; UI repro at 844x390 touch.

OUT OF SCOPE: /home/user/f1-game/.claude/skills/season-mode/SKILL.md:3 — description repeats the same overclaim "(career always races Tracks.SEASON)".
