# Data and career complete source map

## Source and coverage
GPT-6.1 Sol complete_data_career fully read all 38 files / 16,118 lines at c4dc493d9. Truncated output gaps were reread in bounded chunks. Attached LSP references/callers covered 49 key surfaces. Parent saves report because old agent write call blocked. No runtime edits/browser/API network tests.

| File | Full range | Coverage |
|---|---|---|
| js/data/api-transport.js | 1–484 | Full |
| js/data/api.js | 1–548 | Full |
| js/data/circuit-lore.js | 1–276 | Full |
| js/data/driver-ratings.js | 1–154 | Full |
| js/data/export.js | 1–330 | Full |
| js/data/flyby-overrides.js | 1–144 | Full |
| js/data/garage-defaults.js | 1–115 | Full |
| js/data/hub.js | 1–825 | Full |
| js/data/legends.js | 1–498 | Full |
| js/data/live.js | 1–437 | Full |
| js/data/real-race-tab.js | 1–1186 | Full |
| js/data/results.js | 1–388 | Full |
| js/data/schedule.js | 1–279 | Full |
| js/data/settings-defaults.js | 1–95 | Full |
| js/data/standings.js | 1–141 | Full |
| js/data/tab-utils.js | 1–27 | Full |
| js/data/teams.js | 1–395 | Full |
| js/data/telemetry-model.js | 1–351 | Full |
| js/data/telemetry-player.js | 1–313 | Full |
| js/data/telemetry-render.js | 1–377 | Full |
| js/data/telemetry-view.js | 1–443 | Full |
| js/data/telemetry.js | 1–436 | Full |
| js/career/ai-dev.js | 1–194 | Full |
| js/career/badges.js | 1–141 | Full |
| js/career/career-backup.js | 1–997 | Full |
| js/career/career-planning-ui.js | 1–91 | Full |
| js/career/career-planning.js | 1–140 | Full |
| js/career/career-ui-boot.js | 1–119 | Full |
| js/career/career-ui.js | 1–1770 | Full |
| js/career/career.js | 1–2028 | Full |
| js/career/custom-team.js | 1–434 | Full |
| js/career/experience.js | 1–191 | Full |
| js/career/regulations.js | 1–119 | Full |
| js/career/restore-points.js | 1–181 | Full |
| js/career/save-migrate.js | 1–418 | Full |
| js/career/season-cal.js | 1–717 | Full |
| js/career/season-ui.js | 1–304 | Full |
| js/career/team-identity.js | 1–32 | Full |

## Architecture and contracts
F1Transport separates provider lanes with 400ms start pacing, two active response bodies per lane, 28 OpenF1 attempts/minute, 15s body-inclusive deadline, bounded retries and generation cancellation preserving quota history. Small responses use localStorage, larger ones four-entry memory LRU; stale fallback preserves original timestamp and cannot mask auth failure. F1API owns current-year mapping and endpoint/age-aware TTLs, nullable results and sorted/deduplicated telemetry/GPS.

DataHub owns seven factory tabs, shared pinned sessions, cached nodes and distinct async generations. Close cancels transport/live refresh and tears down telemetry. Telemetry splits controller fetch/tray, timing/distance/GPS model, static/dynamic canvas renderer, view geometry/DOM and player clock/scrub; teardown releases observers/animation/arrays. DataRealRace builds v6 timing scripts from eleven endpoints plus optional meeting lookup, caches only complete scripts (eight), and separately stores v2 traces in IndexedDB (eight). Partial feeds stay retryable and are distinct from retirement. Export gathers season GPS with coverage/retry gates and JSON/PNG ZIP. Authored Teams/Legends/Ratings/Lore and generated settings/garage defaults serve runtime/UI.

Career active save differs from engaged inCareer; engagement gates regulation effects outside career. Six independent slots use writer/revision/calendar guards. MY TEAM identity is separate from global GP. Season calendars stamp circuit IDs; unsupported stamps preserve raw saves until durable adoption. SeasonCal manages standalone frozen config, scoring/countback/sprint/quali stages. Career.scoreRound stages detached season state, rechecks revisions, settles economy and restores in-place state on rejected save. Settlement is round-idempotent; snapshot history follows durable success.

Research ownership differs from fitted budget. Rotating eras affect legal fitted resolution but preserve ownership. Winter updates drivers/teams, seats/development, contracts/offers, year/rules and archives; cumulative tally survives limited archive. AI fitted/owned/shelved bags live in CareerAiDev. Backup validates/migrates/rechecks but writes sequentially, not atomically across keys; reports applied/written/issues/durable and preserves null destinations. Restore points retain bounded local history and use revision tokens.

## LSP evidence
Career.scoreRound resolves game.js:3006 and agent simulation; aiSetup game:1506/car-draw:25; driverOverride game/car/garage; Career/SeasonCal.engage game setFlow. CareerUI, SeasonUI, CustomTeam wired game:3578/3581/3555. Backup.apply career UI/settings-export; DataHub.init LazyBundles:305; API and ratings/lore/default/team consumers traced.

FlybyOverrides untyped member query was inconclusive; global text references found flyby-seq. Telemetry cumDist used module fallback, so exact caller/export coverage remains unverified through LSP; complete bodies show destructured use. Injected shadowing Teams in CustomTeam limits global sanitizer references. These are not dead-code findings.

## Proven comment discrepancies
- legends.js:279 says team ID remains custom; body returns legends at 291.
- regulations.js:14 says AI always factory; Career.aiSetup returns developed fitted bag.
- real-race-tab.js:734 says nine requests; fetchRaw launches eleven plus optional meeting.
- career.js:1810 says era strips illegal AI fitted parts; scrub preserves ownership and selectively shelves/replaces, runtime resolves banned fitted IDs.
- career.js:982/career-ui.js:1087 say factory never runs out; FACILITY_MAX is 8 and upgrade refuses at cap. Related guide strings also stale.
- telemetry-model.js:240 calls lanes 3/4 speed-marker-only; renderer draws full speed polylines and deltas.
- results.js:5 says duration shape picks layout; metadata kindOf selects columns, shape only extracts values.
- hub header omits registered WATCH & DRIVE tab.

## Limits and next goal
All scoped source lines read. External endpoints, save failure/runtime behavior and all consumer bodies not executed or universally audited. No editor files were read in this lane; assign editor separately. Parent owns docs checks/commit and outstanding project backlog.
