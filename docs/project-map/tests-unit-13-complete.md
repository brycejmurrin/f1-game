# Unit batch 13 — complete source map

Static inspection of all 19 assigned files, 4,677 source lines. No tests, browser, deploy or source mutations were run. Read complete test bodies and inspected fixture contracts; exact AST ranges below cover assertions, including assertions inside nested callbacks. Names with parameters are templates, expanded explicitly below. All hashes are full SHA-256 of working-tree bytes. Test names describe intended contracts; the Meaning column records the asserted evidence and the file-level limits qualify every row.

Navigation: project `.claude/skills/code-nav/SKILL.md` read; attached apex-lsp outlines resolved DebrisWorld, DebrisDraw, DebrisOpts, DeepLink, DesignerCanvas, DesignerProfile, TrackDesignerProps, Parts and deploy/geometry/stage/debug/matrix/protocol exports. Sources below are repository files; invented temp filenames, fake PR URLs and protocol requests remain fixture data, never live links.

## tests/unit/debris-hazard-hint.test.mjs

Read range: 1–266; SHA-256 `82216d66301f48e2ddc938a0769c842aa4fea41eae92a5eeb4d26764722cad73`.

Production: `js/physics/debris-world.js` — projectHazard; hazards.

Fixture and semantics: Real extracted projection + track-build-vm.cjs real circuits (Monza, Monaco, Spa, Miami; Suzuka separately), 16 stale offsets and four lateral fractions, 47.1 m sampling. Verdict oracle mirrors road-height/half-width acceptance. Requires >2000 samples, zero verdict flips, arc drift < lap/30. Suzuka own-leg hint fixes XZ ambiguity; cross-leg fallback within 1e-9 m, explicit broken-height and no-fallback controls (>5% flips).

Limits: Sampled geometry and extracted helper, not full physics hazard scheduling; oracle shares acceptance logic.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| hinting the hazard projection changes no verdict, at any staleness | 141–154 | 144–144, 145–147, 151–152 | `js/physics/debris-world.js:1076–1092` projectHazard | Pins expected values 0. |
| suzuka crosses itself, and the height test is what keeps the legs apart | 158–255 | 175–176, 177–178, 182–182, 199–201, 203–205, 213–214, 239–242, 244–244, 250–253, 254–254 | `js/physics/debris-world.js:1076–1092` projectHazard | expected suzuka's legs to cross within 3 m in XZ — the premise of this test; the two legs should be far apart in arc |
| ANTI-VACUITY: without the fallback, the sweep is full of wrong verdicts | 257–266 | 262–264 | `js/physics/debris-world.js` module contract (fixture/CLI/source inspection) | ANTI-VACUITY: without the fallback, the sweep is full of wrong verdicts (asserted contract). |

Fixture/helper assertion spans outside registered callbacks: 40–40, 84–84. These establish extraction/lookup/handler preconditions; they are not independent tests.
## tests/unit/debris-opts.test.mjs

Read range: 1–158; SHA-256 `87471d14ed6e87d63079459aad96480034b2bbd3d56b724ddc18c0a7f4e4d079`.

Production: `js/ui/debris-opts.js` — on; set; initUI.

Fixture and semantics: VM loads actual settings defaults, recording SettingRow/GameStore/DebrisWorld and DOM-ready handler. OFF default; only raw 1 enables; OFF/ON persists 0/1 and calls live world; missing world keeps persistence; settings export raw lane. Last case runs actual DebrisWorld with import replaced and Rapier collider throwing.

Limits: DOM/store/world stubs for switch; trap case stubs Rapier, no rendered settings or real WASM trap.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| it claims pm-debris, and the shell declares that row with its select | 56–62 | 58–58, 59–59, 60–60, 61–61 | `js/ui/debris-opts.js` module contract (fixture/CLI/source inspection) | pm-debris must exist in index.html; pm-debris-sel must exist — SettingRow needs the select |
| an unset key reads OFF from the shipped SettingsDefaults value | 64–69 | 65–65, 67–67, 68–68 | `js/ui/debris-opts.js:24–26` on | the shipped default is OFF |
| the key is read the way debris-world.js create() reads it | 71–81 | 75–76, 79–79 | `js/ui/debris-opts.js:24–26` on | the key is read the way debris-world.js create() reads it (asserted contract). |
| a write persists the key AND applies live, in both directions | 83–94 | 86–86, 87–87, 88–88, 91–91, 92–92, 93–93 | `js/ui/debris-opts.js` module contract (fixture/CLI/source inspection) | the next boot must see the choice; and this boot must free the world now |
| the stored half still lands when DebrisWorld is absent | 96–103 | 102–102 | `js/ui/debris-opts.js` module contract (fixture/CLI/source inspection) | Pins expected values "0". |
| it wires on DOMContentLoaded when the document is still loading | 105–110 | 107–107, 109–109 | `js/ui/debris-opts.js` module contract (fixture/CLI/source inspection) | precondition: nothing claimed yet; the row is claimed once the shell exists |
| the key is registered for settings export/import | 112–118 | 116–117 | `js/ui/settings-export.js` SPEC raw debris | the key is registered for settings export/import (asserted contract). |
| it reaches nothing from game.js — the reason it is its own file | 120–127 | 126–126 | `js/ui/debris-opts.js:24–26` on | it reaches nothing from game.js — the reason it is its own file (asserted contract). |
| a Rapier build that throws degrades debris off instead of rejecting race entry (bug-hunt 7.2) | 129–158 | 152–152, 153–153, 154–154, 155–155, 156–156, 157–157 | `js/physics/debris-world.js:196–203` ready; `js/physics/debris-world.js:378–385` prime; `js/physics/debris-world.js:891–972` step | the wasm itself loaded; prime() reports no world |
## tests/unit/debris-step-skip.test.mjs

Read range: 1–420; SHA-256 `cf3087211ea665d1550175e6bffe4f6c973a293ae123cadd0eee843a86b72d8c`.

Production: `js/physics/debris-world.js` — ready; prime; step; marbleGrip; _ageAndCullPool; _carNearFurn.

Fixture and semantics: lateRapier manually settles/rejects import and fires cap timers, replaces only buildWorld with solve counters and exposes marbles. Settled distant marble skips solve; nearby car/awake body resumes. Readiness shares import, caps <=5 s, retries failed race/toggle on fresh URL. One case uses vendored Rapier, actual IncidentSim/contact/AI modules and straight stub track, verifies human vs AI pose and one dynamic step. Extracted marbleGrip tests deck/bank proximity and floors .93/.99; cull tests kill plane; 3000 seeded furniture comparisons match brute-force oracle. Drawing cases load DebrisDraw against recording backend. Final source guard uses gameSource union.

Limits: Mixed VM/extracted/source tests: no live GPU; drawing counters cannot establish raster output; readiness harness replaces world construction except actual Rapier incident case; source arc guard counts callers, not dataflow proof.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| a fresh create() imports no Rapier: the boot burst stays clear until ready()/prime() asks | 32–41 | 37–37, 38–38, 40–40 | `js/physics/debris-world.js:196–203` ready | create() must not start the Rapier load synchronously; a race arriving first starts it at once |
| two-tier idle: a settled marble far from every car skips the solve; a car inside the wake radius brings it back | 78–98 | 83–83, 88–88, 89–89, 92–92, 93–93, 97–97 | `js/physics/debris-world.js:196–203` ready; `js/physics/debris-world.js:378–385` prime; `js/physics/debris-world.js:891–972` step | asleep and no car near: JS bookkeeping only; world.step is not called |
| race readiness waits for a late import: setup builds once and the first green step does not build | 100–117 | 102–102, 105–105, 109–109, 111–111, 112–112, 113–113, 114–114, 116–116 | `js/physics/debris-world.js:196–203` ready; `js/physics/debris-world.js:378–385` prime; `js/physics/debris-world.js:891–972` step | the old setup path can beat the import; race entry shares the idle/prime load |
| race readiness leaves debris disabled and degrades a failed import without rejecting | 119–130 | 121–121, 122–122, 126–126, 127–127, 128–128, 129–129 | `js/physics/debris-world.js:196–203` ready; `js/physics/debris-world.js:378–385` prime | the default-off setting loads no WASM; optional debris never prevents racing |
| race readiness is capped, and a failed import is retried by the next race or toggle (3-F3) | 136–169 | 142–142, 143–143, 146–146, 149–149, 154–154, 155–155, 158–158, 159–159, 161–161, 164–164, 166–166, 167–167, 168–168 | `js/physics/debris-world.js:196–203` ready | ready() arms a cap while the import is in flight; past the cap the race starts without debris |
| idle Rapier mirrors start incidents at the current human and AI pose | 171–225 | 199–199, 200–200, 210–210, 212–212, 214–214, 215–215, 216–216, 217–217, 219–219, 220–220, 221–221, 222–222 | `js/physics/debris-world.js:196–203` ready; `js/physics/debris-world.js:378–385` prime; `js/physics/debris-world.js:891–972` step | idle must still skip the WASM solve; promotion must discard the stale mirror position |
| settled marble grip applies only on the car's road deck | 227–271 | 247–247, 249–249, 251–251, 253–253, 256–256, 258–258, 264–264, 266–266, 268–268, 270–270 | `js/physics/debris-world.js` module contract (fixture/CLI/source inspection) | same-deck cluster keeps the existing grip floor; marbles below the bridge cannot reduce grip upstairs |
| _ageAndCullPool retires a body that fell below the floor, keeps one resting on it | 277–294 | 286–286, 287–287, 288–288, 292–292, 293–293 | `js/physics/debris-world.js` module contract (fixture/CLI/source inspection) | a piece on the road survives; a piece below the floor is retired |
| the cone wake gate's sorted lookup answers exactly as the cones × cars scan (#3109) | 296–324 | 320–320, 323–323 | `js/physics/debris-world.js:796–809` _carNearFurn; `js/physics/debris-world.js:791–795` _nearArc; `js/physics/debris-world.js:783–790` _furnArcs | the cone wake gate's sorted lookup answers exactly as the cones × cars scan (#3109) (asserted contract). |
| debris draw: unchanged sleeping cones retain poses and upload once while drawing every frame | 350–359 | 353–353, 354–354, 357–357 | `js/physics/debris-draw.js:105–130` drawPool | Pins expected values 17, 1, 60. |
| debris draw: wake, reseat generation, body replacement and scale each invalidate a sleeping pose | 361–379 | 365–365, 368–368, 370–370, 372–372, 374–374, 378–378 | `js/physics/debris-draw.js:105–130` drawPool | wake updates even before a generation changes; a solve/reseat can wake, move and sleep between renders |
| debris draw: removals, reordering, pooled-slot reuse and capacity rebuilds update batch membership | 381–396 | 385–385, 387–387, 389–389, 391–391, 393–393, 395–395 | `js/physics/debris-draw.js:105–130` drawPool | empty pools submit no upload; new-world slots cannot inherit prior matrices |
| debris draw: a backend without instancing retains the per-body fallback | 398–402 | 401–401 | `js/physics/debris-draw.js:105–130` drawPool | Pins expected values 2, 3. |
| AI marble drops read the AI car's own state, never curvature (arc rule) | 407–420 | 410–410, 412–412, 415–415, 419–419 | `js/game.js` AI tyreMarble hook; gameSource union | the AI marble hook in game.js was renamed or moved; vlOwn (the AI's own lateral step) feeds the hook |

Fixture/helper assertion spans outside registered callbacks: 23–23. These establish extraction/lookup/handler preconditions; they are not independent tests.
## tests/unit/debug-chrome.test.mjs

Read range: 1–83; SHA-256 `1ac94257306cbae7c85fcdeff27ea9c68e3243f5c4f11642c87be5382fe021ac`.

Production: `tools/mcp/debug-chrome.mjs` — discoveryFile; chromeArgs; refusal; stop; headlessGamePlan; discoveryText; removeDiscovery; runningEndpoint; main.

Fixture and semantics: Pure helpers, mocked PID command lines/kill/wait and temporary discovery file; CLI help/status/invalid device paths. Loopback SwiftShader flags, UA/device mapping, load>=3 refusal, PID-reuse skip, exact discovery ownership.

Limits: No browser launched; stop verifies intended signals with mocks, not OS termination.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| discovery honors an absolute XDG config root without redirecting home | 7–12 | 8–8, 10–10 | `tools/mcp/debug-chrome.mjs:49–54` discoveryFile | Pins expected values "/workspace/runtime-config/chromium/DevToolsActivePort", "/readonly/home/.config/chromium/DevToolsActivePort". |
| chromeArgs carries the proven flags, the loopback-only address and optional WebGPU | 14–22 | 17–17, 18–18, 19–19, 21–21 | `tools/mcp/debug-chrome.mjs:30–35` chromeArgs | Pins expected values "http://127.0.0.1:3456/", "http://127.0.0.1:3456/x". |
| start is refused while a test run is live or loadavg >= 3 | 23–27 | 24–24, 25–25, 26–26 | `tools/mcp/debug-chrome.mjs:37–41` refusal | start is refused while a test run is live or loadavg >= 3 (asserted contract). |
| stop kills exactly its recorded PIDs and skips a reused PID | 28–36 | 33–33, 34–34, 35–35 | `tools/mcp/debug-chrome.mjs:75–89` stop | Pins expected values 1, 222, []. |
| CLI help and unknown command do not touch processes | 37–42 | 38–38, 39–39, 41–41 | `tools/mcp/debug-chrome.mjs` module contract (fixture/CLI/source inspection) | Pins expected values 0, 1. |
| --device picks the window and the emulated viewport (phone-landscape 844x390 + touch, desktop 1280x720) | 43–49 | 44–44, 45–45, 46–46, 48–48 | `tools/mcp/debug-chrome.mjs:30–35` chromeArgs | Pins expected values [844, 390, true, true], [1280, 720, false], 1. |
| --headless-game plan: about:blank, then the game, wait for __apex, then headless(true) | 50–54 | 52–52, 53–53 | `tools/mcp/debug-chrome.mjs:109–110` headlessGamePlan | Pins expected values ["navigate", "navigate", "waitFor", "evaluate"], "about:blank", "http://127.0.0.1:3456/", "__apex.headless(true)". |
| `start --help` prints usage and exits 0 without launching Chromium | 56–63 | 60–60, 61–61, 62–62 | `tools/mcp/debug-chrome.mjs:146–202` main | no browser was started |
| phone-landscape sends the iPhone UA (the mobile render tier is UA-driven); desktop sends none | 65–69 | 67–67, 68–68 | `tools/mcp/debug-chrome.mjs:30–35` chromeArgs | phone-landscape sends the iPhone UA (the mobile render tier is UA-driven); desktop sends none (asserted contract). |
| browser-use discovery file: Chrome's port + path format, removed only while it names our port | 70–83 | 74–74, 77–77, 78–78, 80–80, 81–81, 82–82 | `tools/mcp/debug-chrome.mjs:56–56` discoveryText; `tools/mcp/debug-chrome.mjs:62–65` removeDiscovery; `tools/mcp/debug-chrome.mjs:71–74` runningEndpoint | another browser's file stays |
## tests/unit/deep-link.test.mjs

Read range: 1–118; SHA-256 `2a88ddf5a78783ecff9e64e7b493c332c297007c99a4c8d7ff06db8089e4eea9`.

Production: `js/ui/deep-link.js` — parse; create.

Fixture and semantics: VM with manually driven timer queue, stub buttons/UI layer/history/location; four allow-listed doors and manifest/icons read from disk. Dispatch once after wiring/title availability; preserve other params/hash; NEXT GP waits for schedule tab.

Limits: No actual title lazy-bundle loading or browser URL event integration; manifest icon existence only.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| the four doors map to title buttons; unknown, inherited and empty values parse to nothing | 38–47 | 41–41, 42–42, 45–45 | `js/ui/deep-link.js:7–11` parse | the four doors map to title buttons; unknown, inherited and empty values parse to nothing (asserted contract). |
| on a live title the door button is clicked once and the param is stripped (other params and the hash survive) | 49–56 | 51–51, 53–53, 54–54, 55–55 | `js/ui/deep-link.js` module contract (fixture/CLI/source inspection) | boot wiring gets to finish first |
| a link with no go param does nothing and leaves the URL alone | 58–63 | 60–60, 61–61, 62–62 | `js/ui/deep-link.js` module contract (fixture/CLI/source inspection) | Pins expected values [], 0. |
| shortcuts wait for handlers bound later in the same boot stack | 65–77 | 68–68, 69–69, 70–70, 74–74, 75–75 | `js/ui/deep-link.js` module contract (fixture/CLI/source inspection) | the initial door has no handler yet; first dispatch waits for synchronous wiring |
| mid-race, or with a layer over the title, the door waits instead of firing | 79–86 | 83–83, 84–84 | `js/ui/deep-link.js` module contract (fixture/CLI/source inspection) | one retry is queued after dispatch checks the title |
| a missing door button is dropped with a log line, never a throw | 88–93 | 91–91, 92–92 | `js/ui/deep-link.js` module contract (fixture/CLI/source inspection) | Pins expected values []. |
| NEXT GP opens the hub, then selects the schedule tab once it exists | 95–103 | 98–98, 99–99, 102–102 | `js/ui/deep-link.js` module contract (fixture/CLI/source inspection) | waiting for the hub bundle |
| every manifest shortcut is in scope, has an icon on disk, and ?go= urls are exactly the consumer's allow-list | 105–118 | 107–107, 110–110, 116–116, 117–117 | `js/ui/deep-link.js` module contract (fixture/CLI/source inspection) | phone controller stays in the four Android shows |
## tests/unit/delta-sign-colour.test.mjs

Read range: 1–62; SHA-256 `a0261f3030736d9c8c74c73a5be7602e954e5f00f5bb523b274248cd78400cae`.

Production: `css/data.css` — dh-gdelta; dh-laneboard-dl.

Fixture and semantics: Reads telemetry source sign comments and CSS declarations. Both positive delta classes must use --slower and negative classes --faster.

Limits: Text/regex invariant; no computed style, theme token value or telemetry execution.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| the source really does use one sign convention for both deltas | 45–50 | 48–49 | `css/data.css` module contract (fixture/CLI/source inspection) | the source really does use one sign convention for both deltas (asserted contract). |
| a positive delta is the SLOWER colour on every widget that uses it | 52–56 | 54–55 | `css/data.css` module contract (fixture/CLI/source inspection) | Pins expected values "--slower". |
| a negative delta is the FASTER colour on every widget that uses it | 58–62 | 60–61 | `css/data.css` module contract (fixture/CLI/source inspection) | Pins expected values "--faster". |

Fixture/helper assertion spans outside registered callbacks: 38–38. These establish extraction/lookup/handler preconditions; they are not independent tests.
## tests/unit/deploy-pr-rest.test.mjs

Read range: 1–141; SHA-256 `2e853fdff2b67da9086380e2221849efe5072b3d0487d9506c3a6ba52a86890a`.

Production: `tools/ci/deploy.mjs` — openPrRest; openPr.

Fixture and semantics: Fake curl executable records argv/stdin and emits body plus HTTP code; real local git determines last non-merge subject. Create=list+create only; reuse=list only; lookup 401 throws; token stays stdin. Source checks forbid all auto-merge paths.

Limits: No GitHub traffic or gh-path execution; fixture token/PR URLs are synthetic strings, not evidence links.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| no open PR: create one, never arm auto-merge, and keep the token off the argv | 56–95 | 62–62, 63–63, 64–64, 66–66, 68–68, 69–69, 70–70, 72–72, 74–74, 75–75, 76–76, 89–89, 90–90, 92–92, 93–93 | `tools/ci/deploy.mjs:774–800` openPrRest | list + create only — no arm, no readback; token on the argv |
| an open PR for the head is reused, nothing is created, and auto-merge is not armed | 97–112 | 103–103, 104–104, 105–105, 106–106, 108–108, 109–109, 110–110 | `tools/ci/deploy.mjs:774–800` openPrRest | nothing may be created when a PR is already open |
| a non-2xx PR lookup is an ERROR, not an empty list | 114–123 | 121–121 | `tools/ci/deploy.mjs:774–800` openPrRest | a non-2xx PR lookup is an ERROR, not an empty list (asserted contract). |
| deploy never arms auto-merge: no CCR route, no gh --auto --merge | 125–141 | 130–130, 131–131, 138–138, 139–139, 140–140 | `tools/ci/deploy.mjs:802–817` openPr | deploy never arms auto-merge: no CCR route, no gh --auto --merge (asserted contract). |
## tests/unit/deploy-staging-build.test.mjs

Read range: 1–130; SHA-256 `16300f41fe6fab55eaa4a4c0b107b902bf104ca6672ee587bc7f35701dfa6c7b`.

Production: `tools/desktop/stage.mjs` — pagesBuild; headSha; stageSite; stampStaged; main.

Fixture and semantics: Fake git supplies full/shallow state/count/SHA; real local staging and bump-cache compare against former bash stamp byte-for-byte. Default build 2000+count, HEAD SHA; CLI stamp-only refuses empty tree. Workflow source pins shared stamper and poll-live output gating.

Limits: Local filesystem and fake git; workflow pins do not run Actions or verify live site.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| pagesBuild is 2000 + the commit count and refuses a shallow clone | 44–49 | 45–45, 46–47, 48–48 | `tools/desktop/stage.mjs:159–168` pagesBuild; `tools/desktop/stage.mjs:171–176` headSha | a shallow clone counts its depth (this box: 399), not the history |
| stampStaged with no `at` stamps the Pages build and HEAD's apex-sha, never the committed placeholder | 51–60 | 55–55, 56–56, 57–57, 58–59 | `tools/desktop/stage.mjs:104–131` stageSite; `tools/desktop/stage.mjs:184–219` stampStaged | Pins expected values 6321. |
| stampStaged writes the bytes pages.yml's former inline bash stamp wrote | 62–91 | 78–78, 79–79, 83–83, 87–87, 90–90 | `tools/desktop/stage.mjs:104–131` stageSite; `tools/desktop/stage.mjs:184–219` stampStaged | Pins expected values 0. |
| pages.yml stamps through stage.mjs and carries no second copy of the formula | 93–100 | 96–96, 97–97, 99–99 | `tools/desktop/stage.mjs` module contract (fixture/CLI/source inspection) | pages.yml stamps through stage.mjs and carries no second copy of the formula (asserted contract). |
| stage.mjs --stamp-only stamps the tree already at --out and prints the build | 102–116 | 107–107, 109–109, 110–110, 111–111, 115–115 | `tools/desktop/stage.mjs:104–131` stageSite | --stamp-only on an empty destination has nothing to stamp |
| pages.yml polls live via poll-live-shell.mjs and skips byte verify when superseded | 123–130 | 125–125, 126–126, 127–127, 128–128, 129–129 | `tools/desktop/stage.mjs` module contract (fixture/CLI/source inspection) | pages.yml polls live via poll-live-shell.mjs and skips byte verify when superseded (asserted contract). |
## tests/unit/deploy-staging.test.mjs

Read range: 1–254; SHA-256 `58c7f3542bc0c81e7b69da7838226d719b655bdfed6926b9e5b37ab00429ae0b`.

Production: `tools/desktop/stage.mjs` — stageSite.

Fixture and semantics: Actual stage-files exports and source-scanned runtime URLs/importmap/SW/locales; stageSite fixture trees test locale byte preservation and excluded atlas vs retained pack sibling. bump-cache fixture lazy map validates per-file 12-hex SHA keys, stale detection, only changed file changes key; repo has no map.

Limits: URL scan is literal/top-level, not exhaustive dynamic URL analysis; tiny synthetic staged trees for exclusions/locales; no deployed requests.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| pages.yml stages via the shared tools/desktop/stage.mjs (no forked cp list) | 93–104 | 95–95, 100–101, 102–103 | `tools/desktop/stage.mjs` module contract (fixture/CLI/source inspection) | Stage site step missing |
| the Pages workflow stages every directory the shipped code can fetch | 106–114 | 112–113 | `tools/desktop/stage.mjs` module contract (fixture/CLI/source inspection) | these will 404 on the deployed site and work perfectly in every local run |
| vendor/ is staged, because every dynamic import lives there | 116–121 | 120–120 | `tools/desktop/stage.mjs` module contract (fixture/CLI/source inspection) | vendor/ must be copied into _site |
| everything the stage allow-list names actually exists in the repo | 123–127 | 125–125 | `tools/desktop/stage.mjs` module contract (fixture/CLI/source inspection) | everything the stage allow-list names actually exists in the repo (asserted contract). |
| importmap targets are real files | 129–137 | 135–135 | `tools/desktop/stage.mjs` module contract (fixture/CLI/source inspection) | importmap targets are real files (asserted contract). |
| the stamp maps every staged lazy file to its content hash; one changed file changes one key | 143–180 | 153–153, 164–164, 166–166, 168–168, 170–170, 173–173, 174–174, 176–177, 178–178 | `tools/desktop/stage.mjs` module contract (fixture/CLI/source inspection) | exactly one map block; every lazy file the root holds, nothing else |
| the repo shell carries no lazy map (it is stamped at deploy only) | 182–184 | 183–183 | `tools/desktop/stage.mjs` module contract (fixture/CLI/source inspection) | the repo shell carries no lazy map (it is stamped at deploy only) (asserted contract). |
| real stageSite preserves manifest-declared locale catalogs and SW locale bytes | 187–211 | 207–207, 209–209 | `tools/desktop/stage.mjs:104–131` stageSite | real stageSite preserves manifest-declared locale catalogs and SW locale bytes (asserted contract). |
| no shipped file references a STAGE_EXCLUDE path | 217–231 | 218–218, 230–230 | `tools/desktop/stage.mjs` module contract (fixture/CLI/source inspection) | a shipped file names an excluded path: stage it again or drop the reference |
| stageSite skips STAGE_EXCLUDE paths and keeps their siblings | 233–254 | 234–234, 235–235, 236–236, 237–237, 251–251, 252–252 | `tools/desktop/stage.mjs:104–131` stageSite | Pins expected values true, false. |
## tests/unit/deploy-stamp.test.mjs

Read range: 1–181; SHA-256 `ab6ef79ba7c23813bb2de8815e3112d74033229444e7d0b0dfde0be5e68708ee`.

Production: `tools/ci/bump-cache.mjs` — CLI apply/check.

Fixture and semantics: Workflow source full-depth checkout/stamp/verify-live pins; actual bump-cache CLI on relative and absolute synthetic trees; generation changes only staged root. Lazy bundles, initial JS/CSS and preload stamps use full SHA-256 SRI; byte mutation must fail check and restamp restores consistency; initial repo tags stay integrity-free.

Limits: CLI bytes and workflow text only, not browser SRI enforcement, CDN or live release.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| pages.yml stamps the generation from the commit count on a full-depth checkout | 21–30 | 22–22, 25–25, 26–26, 28–28, 29–29 | `tools/ci/bump-cache.mjs` module contract (fixture/CLI/source inspection) | pages.yml stamps the generation from the commit count on a full-depth checkout (asserted contract). |
| pages.yml verifies the live site serves the stamped build | 32–41 | 33–33, 34–34, 37–37, 39–39 | `tools/ci/bump-cache.mjs` module contract (fixture/CLI/source inspection) | pages.yml verifies the live site serves the stamped build (asserted contract). |
| ci.yml no longer demands a committed generation newer than live | 43–45 | 44–44 | `tools/ci/bump-cache.mjs` module contract (fixture/CLI/source inspection) | ci.yml no longer demands a committed generation newer than live (asserted contract). |
| a RELATIVE --root (pages.yml passes `_site`) stamps too | 47–67 | 61–61, 62–62, 63–63, 65–65 | `tools/ci/bump-cache.mjs` module contract (fixture/CLI/source inspection) | Pins expected values 0, 2315. |
| bump-cache --apply --at N --root <dir> stamps a staged copy and leaves the repo alone | 69–86 | 78–78, 79–79, 80–80, 81–81, 82–82, 84–84 | `tools/ci/bump-cache.mjs` module contract (fixture/CLI/source inspection) | the repo's own placeholder is untouched; the staged copy is consistent after the stamp |
| staged lazy scripts carry full SHA-256 integrity, including track-build and phone bundles | 88–119 | 103–103, 106–106, 107–107, 108–108, 112–112, 113–113, 114–114, 116–116, 117–117 | `tools/ci/bump-cache.mjs` module contract (fixture/CLI/source inspection) | Pins expected values 0, 1. |
| staged initial script and stylesheet tags carry full SHA-256 integrity | 123–152 | 135–135, 137–137, 138–138, 139–139, 141–141, 142–142, 146–146, 148–148, 149–149, 150–150 | `tools/ci/bump-cache.mjs` module contract (fixture/CLI/source inspection) | the script tag's integrity is reported stale |
| the repo shell keeps integrity-free initial tags (dev behaviour is unchanged) | 154–159 | 156–156, 157–157, 158–158 | `tools/ci/bump-cache.mjs` module contract (fixture/CLI/source inspection) | the repo shell keeps integrity-free initial tags (dev behaviour is unchanged) (asserted contract). |
| staged title CSS preloads carry the same SHA-256 integrity as their stylesheets | 161–181 | 174–174, 177–177, 178–178, 179–179 | `tools/ci/bump-cache.mjs` module contract (fixture/CLI/source inspection) | Pins expected values 0. |
## tests/unit/deploy-tool.test.mjs

Read range: 1–996; SHA-256 `b346d807a01ce7ac4e08bee9b7f0ebcceb29507a6a233b691f281d4cd9fe1e13`.

Production: `tools/ci/deploy.mjs` — preflight; changedPaths; touchedCircuits; mergeTreeConflicts; assertMergeable; ratchetMetrics; ratchetOverruns; cureableConflicts; mergeDeployTip; touchesGeometry; targetedFor; notCovered; anyGeometry; proseOnly; advisoryGet; run.

Fixture and semantics: Real temporary git histories exercise divergent diff, shallow/unrelated merge, staged/unstaged/untracked/ignored files; copied text checkout and generators exercise clean union refresh (coverage-only followup). Pure objects exercise numeric ratchet sum budget, generated conflict/source boundaries. Geometry rules use actual manifest and suite load strings; CLI and YAML pins validate fleet/targeted/parts fail-safes. Offline fake PATH verifies --train avoids git planning. Large child output (>1 MB) retained byte-exact 0600 with live stderr and clean JSON. Real finite process fixtures test timeout, TERM-success failure, resistant detached descendants and interruption cleanup.

Limits: No real deploy, push race or GitHub health query; reverify/nightly/filter paths have source-shape assertions. Process timing depends on host; fixture cleanup is not evidence of all platform behavior.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| deploy.mjs and pick-tests name the same deploy branch | 53–55 | 54–54 | `tools/ci/deploy.mjs:92–92` DEPLOY_BRANCH | deploy.mjs and pick-tests name the same deploy branch (asserted contract). |
| --help prints the usage block and exits 0 | 57–65 | 59–59, 60–60, 61–61, 64–64 | `tools/ci/deploy.mjs:85–90` usage; `tools/ci/deploy.mjs:969–1044` main | Pins expected values 0, []. |
| a typo'd flag exits 2 with the usage BEFORE any fetch or log stamp (audit3 T7) | 67–74 | 69–69, 71–71, 72–72, 73–73 | `tools/ci/deploy.mjs:969–1044` main | no start stamp for a refused run |
| touchedCircuits reads circuit and scenery ids out of a diff — exactly | 76–100 | 93–94, 96–96 | `tools/ci/deploy.mjs:174–178` touchedCircuits | only circuit and scenery files that match the id shape, each once |
| touchedCircuits reports OUR side only on a diverged history | 109–132 | 126–126, 127–128 | `tools/ci/deploy.mjs:174–178` touchedCircuits | our own circuit edit must be listed; a circuit only the OTHER side touched must NOT be reported as ours — that is the two-dot bug |
| merge-tree: clean, real conflicts, and an ERROR with no CONFLICT line (unrelated histories); a shallow clone is named up front | 134–170 | 154–154, 155–155, 156–157, 158–158, 160–160, 161–161, 164–165, 166–166 | `tools/ci/deploy.mjs:197–202` mergeTreeConflicts; `tools/ci/deploy.mjs:185–192` assertMergeable | a clean merge has no conflicts; a real conflict is listed |
| preflight returns a list of refusals, never throws | 172–176 | 174–174, 175–175 | `tools/ci/deploy.mjs:129–137` preflight | Pins expected values "string". |
| preflight(cwd) judges the fixture repo's tree, not the checkout's | 178–191 | 187–187, 189–189 | `tools/ci/deploy.mjs:129–137` preflight | clean fixture repo is not dirty; an untracked file in the fixture is dirty |
| ratchetMetrics flattens both scopes and ignores non-numbers | 200–208 | 207–207 | `tools/ci/deploy.mjs:366–378` ratchetMetrics | ratchetMetrics flattens both scopes and ignores non-numbers (asserted contract). |
| the ratchet budget passes a real two-sided raise and refuses a duplicated merge | 210–233 | 216–217, 218–219, 222–222, 223–223, 226–226, 227–227, 228–228, 232–232 | `tools/ci/deploy.mjs:398–407` ratchetOverruns | the sum of two deliberate raises is exactly the budget, and is allowed; under budget is fine too — a merge may drop lines |
| only GENERATED files cure themselves, and only when their source merged clean | 235–281 | 241–241, 242–242, 243–243, 248–249, 250–250, 253–253, 254–255, 256–256, 259–259, 260–260, 261–261, 264–264, 265–265, 266–266, 272–272, 273–273, 274–274, 275–275, 276–276, 278–278, 279–279, 280–280 | `tools/ci/deploy.mjs:443–474` cureableConflicts | generated from tests/groups.json; two derived files together |
| prose docs are never cured: no doc carries generated ladder digits any more | 283–291 | 289–289, 290–290 | `tools/ci/deploy.mjs:443–474` cureableConflicts | one prose doc stops the merge |
| two sides that each add a unit file merge clean and refresh only the coverage page | 306–352 | 327–327, 341–341, 342–342, 343–343, 344–344, 345–345, 347–347, 348–348 | `tools/ci/deploy.mjs` module contract (fixture/CLI/source inspection) | the coverage page is the derived follow-up; the commit under the follow-up is the merge |
| a circuit edit routes the sweeps; a docs-only union does not | 376–386 | 380–381, 383–384 | `tools/ci/deploy.mjs:309–313` touchesGeometry | a docs-only union must NOT pay the 10 minutes — the cost is why this is conditional; the exact 2026-09-18 shape: a circuit edit MUST run the sweeps |
| editing a sweep suite's OWN file routes the sweeps | 392–402 | 394–395, 399–400 | `tools/ci/deploy.mjs:309–313` touchesGeometry | premise: the suite list is really derived from package.json's test:sweeps |
| the working tree is part of the union: unstaged, staged and untracked edits route the gate | 410–438 | 416–416, 419–419, 422–422, 423–423, 426–426, 430–430, 434–434, 435–436 | `tools/ci/deploy.mjs:159–171` changedPaths; `tools/ci/deploy.mjs:174–178` touchedCircuits; `tools/ci/deploy.mjs:309–313` touchesGeometry; `tools/ci/deploy.mjs:325–329` targetedFor | premise: a clean tree at base moves nothing; an ignored file is not a change |
| an unresolvable diff runs the sweeps rather than skipping them | 442–448 | 445–446 | `tools/ci/deploy.mjs:309–313` touchesGeometry | an unreachable base must FAIL SAFE into running them |
| the verdict names what it did NOT measure | 453–462 | 456–457, 458–459, 460–461 | `tools/ci/deploy.mjs:342–347` notCovered | the browser groups never run here, so they must be named even on the fullest gate; sweeps that RAN must not be reported as uncovered |
| anyGeometry answers for a file LIST, so the retry asks what the union asked | 470–485 | 472–474, 476–477, 483–484 | `tools/ci/deploy.mjs:303–307` anyGeometry | circuit scenery re-merged by a retry must route the sweeps; a retry that brings no geometry must not pay the 10 minutes |
| every path the geometry pattern names EXISTS (the debrisworld guard) | 498–516 | 500–502, 503–503, 506–508, 509–509, 512–513, 514–514 | `tools/ci/geometry-paths.mjs:208–221` namedPaths | the pattern names no paths at all |
| ci.yml READS the geometry pattern instead of keeping a second copy | 518–530 | 520–521, 527–529 | `.github/workflows/ci.yml` geometry filter | Pins expected values []. |
| the parts census derives its trigger, and every fail-safe branch RUNS it | 532–563 | 540–541, 542–542, 547–547, 551–552, 555–556, 559–560, 561–562 | `.github/workflows/ci.yml` sweeps-parts job | the parts filter must DERIVE its pattern from parts-sweep.mjs's load list, not retype it; the census must stay a job that runs and skips a step, not a job that skips |
| the parts pattern covers every module the sweep actually loads | 565–580 | 572–572, 573–573, 576–576, 579–579 | `tools/ci/geometry-paths.mjs:103–112` partsFiles | the parts pattern covers every module the sweep actually loads (asserted contract). |
| the sweeps filter diffs a pull request against its own base | 593–616 | 596–596, 599–600, 601–602, 611–611, 614–615 | `.github/workflows/ci.yml` sweeps filter | ci.yml still has the sweeps geometry filter step; …and must accept the pull_request event, or the env above is dead code |
| the push retry's full-gate leg runs the SAME gate main() runs | 624–639 | 633–634, 635–636, 637–638 | `tools/ci/deploy.mjs:690–726` reverifyUnion | the re-verify leg must run the Pages gate's node suites — tooling-fast does not; the re-verify leg must verify the circuits the re-merge brought |
| the printed pattern is the pattern deploy.mjs matches with | 641–652 | 644–644, 645–646, 651–651 | `tools/ci/geometry-paths.mjs:85–86` GEOMETRY_ERE; `tools/ci/geometry-paths.mjs:88–88` GEOMETRY_PATHS | --ere must print the module's own pattern, unmodified; what ci.yml greps with and what deploy.mjs tests with must be one pattern |
| proseOnly is true for prose and false for anything that can interact | 662–678 | 663–663, 664–664, 670–671, 672–672, 673–673, 674–674, 677–677 | `tools/ci/deploy.mjs:686–688` proseOnly | a test we added can be broken by code they landed; tooling runs against their tree |
| a game.js-only union routes NO sweep: not the fleet, and no targeted suite reads it | 689–698 | 693–694, 695–696 | `tools/ci/geometry-paths.mjs:185–193` targetedSuites | no fleet suite executes js/game.js — its edit must not rebuild 52 circuits ten times; and no sweep suite reads game.js either (grid-boxes measures the TRACK build's paint) |
| the fleet trigger is the fleet build's own module list (the garage/scene gap) | 700–722 | 703–703, 705–706, 710–710, 714–715, 717–717, 720–720 | `tools/ci/geometry-paths.mjs:73–78` fleetFiles | premise: TRACK_VM is the real load list; js/garage/scene.js is a TRACK_VM module outside js/track/ |
| a targeted edit routes ONLY the suite that reads it, in test:sweeps order | 724–742 | 725–725, 726–726, 727–727, 728–730, 734–734, 735–735, 739–739, 740–740 | `tools/ci/geometry-paths.mjs:185–193` targetedSuites | deduplicated and in package.json's test:sweeps order, so the runner's output reads like the group's; a car edit cannot move a circuit |
| worker-only manifest dependencies route the worker sweep without rebuilding the fleet | 744–757 | 746–746, 748–748, 749–750, 751–751, 753–753, 754–754, 755–755, 756–756 | `tools/ci/geometry-paths.mjs:185–193` targetedSuites; `tools/ci/geometry-paths.mjs:135–141` workerExtraPattern | premise: chunk dependencies are worker extras; worker paths are exact files |
| every source a sweep suite reads is covered by a tier that runs that suite | 765–788 | 782–784, 787–787 | `tools/ci/geometry-paths.mjs:143–179` TARGETED; `tools/ci/geometry-paths.mjs:88–88` GEOMETRY_PATHS | every source a sweep suite reads is covered by a tier that runs that suite (asserted contract). |
| --targeted prints the suites for a change list, and nothing for a game.js-only one | 790–809 | 796–796, 798–799, 802–803, 804–805, 806–807, 808–808 | `tools/ci/geometry-paths.mjs:185–193` targetedSuites | an empty print is ci.yml's 'no targeted sweep reads this diff' |
| --train reports the nightly rota, and reads its jobs rather than the rollup | 828–842 | 831–831, 835–836, 838–839, 840–841 | `tools/ci/deploy.mjs:948–967` nightlyHealth | deploy.mjs has no nightlyHealth() |
| --train answers without Git planning or preflight, and names both signals offline | 844–865 | 856–856, 860–860, 862–862, 863–863 | `tools/ci/deploy.mjs:969–1044` main; `tools/ci/deploy.mjs:910–924` trainHealth; `tools/ci/deploy.mjs:948–967` nightlyHealth | advisory health must not invoke Git planning |
| advisoryGet: token on stdin when present, unauthenticated without, null on any failure | 872–891 | 876–876, 877–877, 878–878, 879–879, 880–880, 881–881, 883–883, 885–885, 887–887, 890–890 | `tools/ci/deploy.mjs:899–908` advisoryGet; `tools/ci/deploy.mjs:123–127` run | the token never reaches argv; a list response must not hit spawnSync's 1 MB default (#1733) |
| deploy JSON child retains complete large stdout and late failure while stderr stays live | 893–919 | 904–904, 906–906, 908–908, 911–911, 912–912, 913–913, 914–914, 915–915, 916–916, 917–917 | `tools/ci/deploy.mjs` module contract (fixture/CLI/source inspection) | exceeds spawnSync default maxBuffer; identity is announced before action |
| deploy child keeps default native streams and JSON launch errors identify retained evidence | 921–933 | 927–927, 930–930, 931–931 | `tools/ci/deploy.mjs` module contract (fixture/CLI/source inspection) | Pins expected values 0, "native stdout". |
| a hung gate child stops at its ceiling and run() names the timeout instead of hanging | 935–951 | 939–940, 942–943, 948–948, 949–949, 950–950 | `tools/ci/deploy.mjs:123–127` run | the configured ceiling is honored; the default ceiling sits inside the 30-minute task limit |
| deploy timeout fails even when a SIGTERM handler exits successfully | 953–958 | 954–955, 957–957 | `tools/ci/deploy.mjs:123–127` run | deploy timeout fails even when a SIGTERM handler exits successfully (asserted contract). |
| deploy escalates resistant children and reaps finite descendants before returning | 960–981 | 971–971, 972–972, 973–973, 974–974, 975–975 | `tools/ci/deploy-child.mjs:21–82` superviseDeployChild | escalation returns before the resistant fixtures naturally finish; both the resistant leader and detached descendant are stopped at return |
| deploy interruption waits for owned child cleanup and remains a failure | 983–992 | 990–990, 991–991 | `tools/ci/deploy-child.mjs:21–82` superviseDeployChild | Pins expected values 0. |
| every path tools/lib/generated-paths.mjs calls generated is one deploy.mjs's conflict cure regenerates (fleet-owner relies on it) | 994–996 | 995–995 | `tools/ci/deploy.mjs:443–474` cureableConflicts | Pins expected values true. |
## tests/unit/design-matrix.test.mjs

Read range: 1–215; SHA-256 `62dc4d0491f3d557c41ea46a4d34587b2a49ca6015020aaa58308a2a4aec0304`.

Production: `tools/shot/lib/design-matrix.mjs` — expandMatrix; frameForPart; cameraFor; labelDiff; batchSlice; pendingGroups; parseArgs; parseVariant; parseBatch; checkLimits; sheetHtml.

Fixture and semantics: Small two-part/two-angle/two-colour/two-light baseline+variant Cartesian product; geometry framing math and 0.5% label boundary. Manifest/path helpers use temp files/symlinks; EventEmitter streams simulate garage JSON IDs, overlap and timeout poison. Sharp makes 8x8 real PNGs for gallery hash/HTML escaping and CLI asset export. Missing Chromium CLI plan stays read-only. Temporary git tests source fingerprint; CI request and parsed workflow enforce bounds/read-only noncancelling opt-in capture.

Limits: No screenshot capture or camera quality proven; receipt fixture readiness is only metadata (galleryIndex does not itself re-read bytes); mocked garage transport; plan intentionally lacks browser.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| expansion: product of axes, baseline first in every group | 22–31 | 24–24, 26–26, 27–27, 28–28, 30–30 | `tools/shot/lib/design-matrix.mjs:94–119` expandMatrix | Pins expected values true, 2. |
| design: base livery, , variant, light knob | 33–37 | 35–35, 36–36 | `tools/shot/lib/design-matrix.mjs:94–119` expandMatrix | Pins expected values "splitshot". |
| unknown ids throw with the list | 39–44 | 40–40, 41–41, 42–42, 43–43 | `tools/shot/lib/design-matrix.mjs:94–119` expandMatrix; `tools/shot/lib/design-matrix.mjs:77–86` parseVariant | unknown ids throw with the list (asserted contract). |
| framing: farther for bigger parts, closer for higher fill, scales with fov | 46–53 | 48–48, 49–49, 50–50, 52–52 | `tools/shot/lib/design-matrix.mjs:56–61` frameForPart | framing: farther for bigger parts, closer for higher fill, scales with fov (asserted contract). |
| camera: angles differ; haloBehind uses the catalog station | 55–60 | 57–57, 58–58, 59–59 | `tools/shot/lib/design-matrix.mjs:64–74` cameraFor | Pins expected values "rear". |
| diff labelling at the 0.5 % line | 62–69 | 63–63, 64–64, 65–65, 66–66, 67–67, 68–68 | `tools/shot/lib/design-matrix.mjs:128–133` labelDiff | Pins expected values 0.5, true, false, "12.3%", "baseline". |
| batches partition whole groups | 71–79 | 74–74, 75–75, 76–76, 77–77, 78–78 | `tools/shot/lib/design-matrix.mjs:94–119` expandMatrix; `tools/shot/lib/design-matrix.mjs:122–125` batchSlice; `tools/shot/lib/design-matrix.mjs:141–146` parseBatch | Pins expected values [2, 5]. |
| manifest resume skips finished groups, redoes missing files | 81–89 | 85–85, 86–86, 88–88 | `tools/shot/lib/design-matrix.mjs:94–119` expandMatrix; `tools/shot/lib/design-matrix.mjs:136–139` pendingGroups | Pins expected values 1, 2. |
| limits: dpr, viewport, loadavg | 91–98 | 93–93, 94–94, 95–95, 96–96, 97–97 | `tools/shot/lib/design-matrix.mjs:149–157` checkLimits | limits: dpr, viewport, loadavg (asserted contract). |
| args and sheet | 100–111 | 102–102, 103–103, 108–108, 109–109, 110–110 | `tools/shot/lib/design-matrix.mjs:94–119` expandMatrix; `tools/shot/lib/design-matrix.mjs:159–186` parseArgs; `tools/shot/lib/design-matrix.mjs:191–220` sheetHtml | Pins expected values ["halo", "fin"], [844, 390]. |
| mixed recipes validate fields, CLI values, bounds and filename collisions | 113–119 | 114–114, 115–115, 116–116, 117–117, 118–118 | `tools/shot/lib/design-matrix.mjs:94–119` expandMatrix; `tools/shot/lib/design-matrix.mjs:159–186` parseArgs; `tools/shot/lib/design-matrix.mjs:77–86` parseVariant | Pins expected values 2. |
| resume rejects changed sources, plans and tampered provenance | 121–128 | 123–123, 124–124, 125–125, 126–126, 127–127 | `tools/shot/lib/design-matrix-run.mjs:27–30` resumeManifest | resume rejects changed sources, plans and tampered provenance (asserted contract). |
| run files reject traversal, symlink escapes and dangling symlinks | 134–142 | 136–136, 137–137, 139–139, 140–140, 141–141 | `tools/shot/lib/design-matrix-run.mjs:9–15` matrixOutputDir; `tools/shot/lib/design-matrix-run.mjs:38–43` evidenceFile; `tools/shot/lib/design-matrix-run.mjs:44–47` metadataFile; `tools/shot/lib/design-matrix-run.mjs:35–37` validateRunDirectory | Pins expected values false. |
| verified cells require matching bytes and native receipt; coverage excludes stale records | 144–151 | 148–148, 149–149, 150–150 | `tools/shot/lib/design-matrix-run.mjs:48–51` verifiedCell; `tools/shot/lib/design-matrix-run.mjs:52–62` galleryIndex | Pins expected values false, 1. |
| garage exit before ready rejects immediately | 154–156 | 155–155 | `tools/shot/lib/design-matrix-run.mjs:64–107` garageChannel | garage exit before ready rejects immediately (asserted contract). |
| garage commands match IDs, reject overlap and poison the channel after timeout | 157–162 | 159–159, 160–160, 161–161 | `tools/shot/lib/design-matrix-run.mjs:64–107` garageChannel | Pins expected values 1. |
| gallery export verifies real image bytes, preserves source/status, escapes HTML and separates geometry | 164–175 | 169–169, 171–171, 172–172, 173–173, 174–174 | `tools/shot/capture-gallery.mjs:14–39` prepareGallery; `tools/shot/capture-gallery.mjs:40–42` galleryHtml | an item title must add no <script> element |
| real CLI plan is read-only and missing browser fails before output creation | 177–182 | 180–180, 181–181 | `tools/shot/design-matrix.mjs:21–87` main | Pins expected values 0, false, 1, "design-matrix: native screenshots unavailable: no executable Chromium discovered". |
| source fingerprints detect tracked and untracked changes | 184–192 | 185–185, 188–188, 189–189, 190–190, 191–191 | `tools/shot/lib/design-matrix-run.mjs:16–23` captureSource | Pins expected values 0, false. |
| real CLI gallery export packages image assets and rejects output reuse | 194–201 | 199–199, 200–200 | `tools/shot/capture-gallery.mjs:14–39` prepareGallery; `tools/shot/capture-gallery.mjs:40–42` galleryHtml | Pins expected values 0, "geometry-preview", "capture-gallery: export output must be new or empty". |
| CI requests bound work, reject output/command injection and retain mixed recipes as one argument | 203–208 | 205–205, 206–206, 207–207 | `tools/shot/run-capture-request.mjs:11–22` captureRequest | Pins expected values 4, "--out=artifacts/design-matrix/ci-capture". |
| capture workflow is opt-in, read-only and pins the captured source without cancelling active jobs | 210–215 | 212–212, 213–213, 214–214 | `.github/workflows/capture-gallery.yml` capture job | Pins expected values false, "macos-latest", 15, [".github/capture-gallery-request.json"], "${{ github.sha }}". |
## tests/unit/design-preview-wheels.test.mjs

Read range: 1–49; SHA-256 `faba266d645f49c1e69ca49d2b9926d9d99bf4f41d787dcca4c9172a0dfea573`.

Production: `js/car/parts.js` — VISUAL_FIELD_REGISTRY; getFactorySetup; getVisualTiers.

Fixture and semantics: Real loadParts/buildCar/compare meshes. Registry has five opt-in fields; all factory visuals and noncandidates keep them off. Five candidates compare McLaren default setup to equivalent option, Hausdorff >= WEAK_MM and moved area >= MOVED_AREA_M2.

Limits: CPU mesh distinctness for one team/default assembly, not perceptual appearance, every configuration or GPU rendering.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| the preview fields are registered and only the candidates set them | 21–37 | 25–25, 31–31, 35–35 | `js/car/parts.js:752–797` VISUAL_FIELD_REGISTRY; `js/car/parts.js:947–949` getFactorySetup; `js/car/parts.js:1026–1032` getVisualTiers | Pins expected values []. |
| `${cat}/${id} reads against its equivalent` | 40–48 | 46–46, 47–47 | `tools/car/parts-sweep.mjs:244–262` buildCar; `tools/car/parts-sweep.mjs:504–629` compare | ${cat}/${id} reads against its equivalent (asserted contract). |

Generated cases at 40–48 expand to wheels/style_wheels_ysplit, wheels/style_wheels_blownaxle, brakes/style_brakes_drum, cockpit/style_cockpit_halomirror and cockpit/style_cockpit_mirrorframe (five distinct registrations).
## tests/unit/designer-canvas.test.mjs

Read range: 1–525; SHA-256 `ed4315c8ca3e744e3a9e19ed8d112f462f6b859faf1cd0d74524edad71865fe6`.

Production: `js/editor/canvas.js` — create; thumb.

Fixture and semantics: Real editor VM + mini-dom, recording 2D context, manual timers and 24-point ellipse. Pointer/key gestures test range/shift anchors, 500ms hold cancellation, ghost cache, Menger/span measurement, touch 44 vs mouse 28 hit radii, plasma speed buckets and elevation palette. Tests span translation/nudge, pickOnly, thumb fit, deterministic theme scenery, water angle zero, event teardown and >=6px whole-lap elevation ribbon.

Limits: Synthetic events and recorder; mini-dom has no layout engine, true pointer capture or raster. pickOnly title mentions Delete but body exercises gestures and restored drag, not Delete key. Keyboard title/expected behavior must be read from actual assertions.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| range drag on the map selects a continuous section without moving the road | 72–81 | 78–78, 79–79, 80–80 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | range release does not collapse back to one point |
| armed end selection does not replace the map anchor on pointerdown | 83–93 | 89–89, 91–91, 92–92 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | Pins expected values 0. |
| long-press: a handle held 500 ms fires onContext once, keeps it selected and never becomes a drag | 95–122 | 99–99, 100–100, 101–101, 103–103, 104–104, 105–105, 106–106, 109–109, 110–110, 111–111, 112–112, 113–113, 119–119, 120–120, 121–121 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | one hold timer armed on a handle press; nothing re-armed |
| long-press is cancelled by 10 px of movement, a second pointer, pointercancel and lostpointercapture | 124–161 | 130–130, 132–132, 133–133, 137–137, 139–139, 147–147, 153–153, 154–154, 158–158, 160–160 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | movement past 6 px clears the hold timer; it stayed a drag |
| ghost: a previewFn's points draw as a dashed COL.ghost polyline only while a handle is hovered or selected | 163–214 | 170–170, 174–174, 175–175, 178–178, 179–179, 183–183, 184–184, 185–185, 188–188, 190–190, 192–192, 194–194, 196–196, 199–199, 203–203, 207–207, 210–210, 213–213 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | no previewFn: no ghost; no anchor: no ghost |
| measurement chip: R <n> m while dragging a handle on a curve, STRAIGHT on a collinear triple, <n> m over a span | 216–247 | 218–218, 223–223, 225–225, 229–229, 230–230, 235–235, 237–237, 239–239, 245–245 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | nothing dragged or spanned: no chip; the Menger radius through the dragged point and its neighbours |
| touch targets: a press 32 px from a handle picks it with pointerType touch, not with a mouse | 249–267 | 250–250, 252–252, 257–257, 258–258, 261–261, 264–264, 266–266 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | mouse pick radius (larger than the drawn dot); a mouse at 32 px misses |
| SPEED: setHeat fills one COL.spd* polygon per run of a speed bucket (the wrap merged); null, stale and one-bucket rings | 269–300 | 276–276, 285–285, 289–289, 290–290, 293–293, 296–296, 299–299 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | the plasma ramp, slow → fast; one polygon per speed block, painted slow → fast |
| elevation heat uses ordered height colours, numeric extrema and a flat legend; invalid data clears it | 302–322 | 309–309, 310–310, 312–312, 315–315, 316–316, 319–319, 320–320 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | low-to-high runs follow node height |
| pickOnly: tap selects; drag / insert / long-press / Delete do not edit geometry | 324–363 | 333–333, 334–334, 335–335, 340–340, 341–341, 349–349, 350–350, 353–353, 355–355, 361–361, 362–362 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | tap does not move; pickOnly blocks drag |
| TrackShape.spanIndices / inSpan: forward walk inclusive; one point when ends match | 365–375 | 368–368, 369–369, 370–370, 371–371, 372–372, 373–373, 374–374 | `js/editor/shape.js:337–344` spanIndices; `js/editor/shape.js:346–351` inSpan | wraps past the start |
| span group move: drag a member translates every point on the selected span by the same delta | 377–406 | 386–386, 387–387, 390–390, 392–392, 393–393, 395–395, 396–396, 402–402, 404–404, 405–405 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | the dragged handle moved; outside the span stays put |
| shift-click a second handle keeps the anchor and reports the pick with shiftKey | 408–418 | 414–414, 416–416, 417–417 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | canvas leaves span to the screen's onPick |
| thumb(): one fitted outline in the asked colour and the start tick; nothing for a missing road | 420–438 | 431–431, 432–432, 433–433, 434–434, 437–437 | `js/editor/canvas.js:794–818` thumb | the outline, then the start tick; fitted inside the card |
| live scenery supports every theme with finite, bounded, deterministic footprints | 441–465 | 449–449, 450–450, 452–452, 453–453, 454–454, 457–457, 458–458, 462–462, 463–463, 464–464 | `js/editor/scenery-preview.js:11–105` plan | no swallowed recipe failures; same design keeps scenery stable |
| live scenery keeps map range picking and outline switching non-destructive | 467–479 | 471–471, 474–474, 476–476, 477–477, 478–478 | `js/editor/scenery-preview.js:11–105` plan | Pins expected values "scenery", "outline", 0. |
| controls(): a selected span draws exactly its members as selected handles (bug-hunt 2 P10) | 481–488 | 485–485, 487–487 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | cleared selection draws no selected handle |
| destroy removes every input subscription and is idempotent | 490–500 | 496–496, 499–499 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | destroy removes every input subscription and is idempotent (asserted contract). |
| water preview footprints retain native world-axis alignment | 503–509 | 507–507, 508–508 | `js/editor/scenery-preview.js:11–105` plan | theme emits water for the orientation check; waterSurface renders world-axis boxes, independently of the road normal |
| HEIGHT heat stays visible at whole-lap zoom: a 6 px colour ribbon and handles that never bury the road | 511–525 | 522–522, 524–524 | `js/editor/canvas.js` module contract (fixture/CLI/source inspection) | thin road gets a ≥6 px ribbon in the height colours; idle handle dots are no wider than the point spacing |
## tests/unit/designer-code-cli.test.mjs

Read range: 1–149; SHA-256 `55f4c9faea98870c066bbead6040ee3cbf973c266fccef5bdf5d7c6043fc396c`.

Production: `tools/track/designer-code.mjs` — parseArgs; analyzeCode; formatReport; run.

Fixture and semantics: Real editor/codec encodes green lattice ellipse, corrupt checksum byte, crossing figure-eight; API and spawned CLI/file input verify JSON/exit 0 or 1, decode reason check vs validate red crossing/clearance. Help and empty stdin tested.

Limits: Headless analysis, not ability to drive a custom track or editor UI; finite geometry fixtures.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| parseArgs accepts code / --file / --json and rejects unknown flags | 43–50 | 44–44, 45–45, 46–46, 47–47, 48–48, 49–49 | `tools/track/designer-code.mjs:30–49` parseArgs | Pins expected values true, "APXT1.p.AAA", "x.txt". |
| valid round-trip share code: exit 0 and JSON shape (length, corners, issues) | 52–84 | 55–55, 58–58, 59–59, 60–60, 61–61, 62–62, 63–63, 64–64, 65–65, 66–66, 69–69, 71–71, 72–72, 73–73, 74–74, 75–75, 76–76, 79–79, 81–81, 82–82, 83–83 | `tools/track/designer-code.mjs:99–175` analyzeCode; `tools/track/designer-code.mjs:178–199` formatReport; `tools/track/designer-code.mjs:201–226` run | Pins expected values true, 0, "validate". |
| corrupted share code: exit 1 with decode reason | 86–108 | 93–93, 94–94, 95–95, 96–96, 99–99, 101–101, 102–102, 103–103, 106–106, 107–107 | `tools/track/designer-code.mjs:99–175` analyzeCode; `tools/track/designer-code.mjs:201–226` run | Pins expected values false, 1, "decode", "check". |
| invalid-geometry track (figure-8): exit 1 and lists a RED issue | 110–139 | 114–114, 115–115, 116–116, 117–117, 118–121, 122–122, 123–123, 132–132, 134–134, 135–135 | `tools/track/designer-code.mjs:99–175` analyzeCode; `tools/track/designer-code.mjs:178–199` formatReport | Pins expected values false, 1, "validate". |
| --help exits 0; missing input exits 1 | 141–149 | 143–143, 144–144, 147–147, 148–148 | `tools/track/designer-code.mjs:201–226` run | Pins expected values 0, 1. |
## tests/unit/designer-profile.test.mjs

Read range: 1–324; SHA-256 `a78825c40744f8f51b201f75c0f6943b6b800e13608caa700668bb220f639c67`.

Production: `js/editor/profile.js` — create.

Fixture and semantics: Real editor VM + mini-dom and recorded grips, 640x72 strip. Zoomed touch column selection, range view-only pan/fit, one release commit/live preview, 6/10px thresholds, Up/Down +1/shift5, Delete flatten/Escape clear, aria labels and flat legend. Generated boundary cases for +60/-60 preserve span offsets in keyboard+drag; live grip +/-8px applied once; 300-point idle grip spacing.

Limits: No browser focus/layout or pixel output; keyboard test title mentions brackets but assertions do not dispatch bracket keys. Heights lattice/clamp broader guarantees require other tests.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| profile picks the entire column and maps zoomed touch coordinates correctly | 72–83 | 81–81, 82–82 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | selection follows horizontal position even away from the grip |
| range dragging selects points without editing heights; zoom and pan stay view-only | 85–100 | 91–91, 92–92, 94–94, 96–96, 98–98, 99–99 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | a range gesture never becomes a height drag |
| armed range end preserves the profile's existing anchor | 102–110 | 108–108, 109–109 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | Pins expected values 0. |
| one grip per control point; touch hit radius is ≥44 px | 112–119 | 114–114, 115–115, 116–116, 117–117, 118–118 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | a grip arc per control point |
| dragging a grip up sets the node height and commits ONCE on release | 121–139 | 125–125, 129–129, 131–131, 133–133, 134–134, 136–136, 137–137, 138–138 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | press selects a node; live changes while dragging |
| select-without-move: tap keeps height; below-threshold jitter keeps height; drag on selected moves | 141–170 | 146–146, 151–151, 153–153, 154–154, 159–159, 160–160, 163–163, 166–166, 167–167, 168–168, 169–169 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | tap does not commit a height change; tap keeps the node's height |
| keyboard: [ ] pick, Up/Down height, Delete flattens, Escape clears | 172–189 | 176–176, 178–178, 180–180, 184–184, 187–187, 188–188 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | Pins expected values "own", 5, 0, "pass". |
| accessible name names the selected point height | 191–199 | 195–195, 198–198 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | accessible name names the selected point height (asserted contract). |
| flat elevation: one height label when max and min round equal (no colliding dual 0 m) | 201–207 | 205–205, 206–206 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | Pins expected values 1, "0 m". |
| span elev: selection API + Up/Down offset every grip in the group by the same delta | 209–230 | 215–215, 216–216, 219–219, 221–221, 222–222, 223–223, 224–224, 229–229 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | commit carries the full heights[]; outside the span stays put |
| "span keyboard offsets preserve relative hills at " + bound + " m" | 234–251 | 240–240, 241–241, 242–242, 244–244, 245–245, 247–247, 250–250 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | the whole group stops at its first boundary; outside the span stays put |
| "span drag preview and release preserve relative hills at " + bound + " m" | 253–280 | 260–260, 264–264, 265–265, 267–267, 268–268, 271–271, 272–272, 273–273, 278–278, 279–279 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | selected anchor grip drawn; preview does not commit |
| destroy removes every input subscription and is idempotent | 283–293 | 289–289, 292–292 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | destroy removes every input subscription and is idempotent (asserted contract). |
| "held elevation grip applies live delta once: " + dy | 296–310 | 303–303, 306–306, 307–307, 309–309 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | Pins expected values 0. |
| dense polygon: idle grips shrink to the point spacing instead of a solid band of circles | 313–324 | 322–322, 323–323 | `js/editor/profile.js` module contract (fixture/CLI/source inspection) | every control point is still drawn; no idle grip is wider than ~half its spacing (was 7 px: overlapping band) |

Generated registrations: lines 234–251 and 253–280 each expand at bound +60 and -60 m; lines 296–310 expand at dy -8 and +8. The count is six runtime cases across these three templates.
## tests/unit/designer-props.test.mjs

Read range: 1–356; SHA-256 `c6a8d82b4f49c76c6cd4a97d7b4377cc30b78df39f1bae798514c3211e3f211f`.

Production: `js/editor/props.js` — sanitize; place; placeBatch; pointFrac; updateAt; removeLast; effectiveGap; dress.

Fixture and semantics: Real editor engine/codec/store. Append-only prop indexes, total16 and per-kind caps, immutable atomic placement and wrapped paired range; minimum gap applied at placement/render while import keeps authored zero. Recording native APIs test metre spacing/flood side/water palette/expanded landscapes; codec APXT1 empty vs APXT2 props and ID roundtrips. Synthetic crossing segments exercise full-footprint water/terrain guards; final test builds actual engine meshes and overhead previews for every added landscape.

Limits: Most scenery calls recorded, not rendered; final real engine meshes only nonempty, not visual correctness. Selected footprint shapes/locations; no exhaustive intersections.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| KINDS / CAPS / sanitize: known kinds only, per-kind and total caps | 11–33 | 13–13, 14–14, 15–15, 16–16, 17–17, 18–18, 19–19, 20–20, 22–22, 23–23, 27–27, 31–31, 32–32 | `js/editor/props.js:102–117` sanitize | kind indices fit the share-code byte; legacy water retains its codec index |
| place / removeLast / canPlace respect caps and UNDO-shaped lists | 35–54 | 38–38, 40–40, 42–42, 43–43, 46–46, 47–47, 50–50, 51–51, 53–53 | `js/editor/props.js:142–153` place; `js/editor/props.js:195–203` removeLast | Pins expected values true, 1, 2. |
| place floors gap at MIN_GAP like placeBatch (COPY must not store a sub-min clearance) | 56–64 | 59–59, 61–61, 63–63 | `js/editor/props.js:142–153` place; `js/editor/props.js:156–174` placeBatch | gantry stays on the road centreline |
| pointFrac walks the control polygon arc | 66–72 | 69–69, 71–71 | `js/editor/props.js:127–139` pointFrac | Pins expected values 0. |
| batch placement distributes a wrapped range, pairs sides and refuses caps atomically | 74–91 | 77–77, 79–79, 81–81, 82–82, 85–85, 86–86, 87–87, 88–88, 89–89, 90–90 | `js/editor/props.js:156–174` placeBatch | Pins expected values 6, 2. |
| palms and hedges render through existing APIs and survive the share codec | 93–111 | 97–97, 98–98, 99–99, 100–100, 103–103, 104–104, 106–106, 107–107, 108–108, 109–109, 110–110 | `js/editor/props.js:102–117` sanitize; `js/editor/props.js:176–184` updateAt; `js/editor/props.js:206–220` dress | editing does not mutate the original |
| new nature and venue objects keep codec indices and dress at metre spacing | 113–127 | 118–118, 119–119, 120–120, 121–121, 122–122, 123–123, 125–125, 126–126 | `js/editor/props.js:102–117` sanitize; `js/editor/props.js:206–220` dress | missing APIs degrade safely |
| CustomTracks: props round-trip in sanitize / id / toRaw scenery | 129–144 | 137–137, 138–138, 139–139, 140–140, 142–142, 143–143 | `js/editor/props.js:102–117` sanitize | props move the content id |
| codec: empty props stay APXT1; placed props ride APXT2 and round-trip | 146–177 | 150–150, 152–152, 153–153, 164–164, 166–166, 167–167, 168–168, 169–169, 173–173, 174–174, 176–176 | `js/editor/props.js:102–117` sanitize | Pins expected values true, 3, "stand,flood,billboard", false. |
| flood prop dress: one floodMast on the authored side (+1) | 190–199 | 193–193, 194–194, 195–195, 196–196, 197–197, 198–198 | `js/editor/props.js` module contract (fixture/CLI/source inspection) | Pins expected values 1, 20, 24, true. |
| flood prop dress: one floodMast on the authored side (-1) | 201–206 | 204–204, 205–205 | `js/editor/props.js` module contract (fixture/CLI/source inspection) | Pins expected values 1. |
| flood prop dress: default side +1 when omitted (codec stores 0/1 only) | 208–219 | 216–216, 217–217, 218–218 | `js/editor/props.js:206–220` dress | Pins expected values 1, 28. |
| effective clearance preserves imported stored gaps and uses every kind floor | 222–232 | 226–226, 227–227, 228–228, 230–230, 231–231 | `js/editor/props.js:102–117` sanitize; `js/editor/props.js:89–89` effectiveGap | Pins expected values 0, 14. |
| mixed recipes give exact immutable proposals and refuse kind/total limits atomically | 234–250 | 239–239, 240–240, 241–241, 244–244, 247–247, 248–248, 249–249 | `js/editor/props.js` module contract (fixture/CLI/source inspection) | Pins expected values true, ["marshal", "camera"], 3, false. |
| water palette: four distinct bodies dress through waterSurface and preserve old water | 252–276 | 256–256, 257–257, 258–258, 260–260, 261–261, 262–262, 263–263, 265–265, 266–266, 267–267, 269–269, 271–271, 273–273, 274–274, 275–275 | `js/editor/props.js:102–117` sanitize; `js/editor/props.js:142–153` place; `js/editor/props.js:156–174` placeBatch; `js/editor/props.js:206–220` dress | distinct water colours; safe clearance at rendering time |
| new water bodies reject full-footprint road crossings including river tips | 279–298 | 285–285, 286–286, 287–287, 289–289, 291–291, 292–292, 294–294, 296–296, 297–297 | `js/editor/props.js:206–220` dress | road intersects the far end of the 360 m river; reject before native emission |
| expanded objects share, reload, and dress through native scenery APIs | 301–324 | 306–306, 308–308, 309–309, 310–310, 311–311, 312–312, 313–313, 314–314, 315–315, 316–316, 319–319, 320–320, 321–321, 323–323 | `js/editor/props.js:102–117` sanitize; `js/editor/props.js:206–220` dress | append-only codec indexes; mountain base is seated at the floor |
| landscape footprints reject another road section before native or preview emission | 326–339 | 334–334, 336–336, 338–338 | `js/editor/props.js:206–220` dress | Pins expected values 0, 1. |
| landscapes reach the real engine and overhead preview without failed dressers | 341–356 | 349–349, 353–353, 354–354 | `js/editor/props.js:102–117` sanitize; `js/editor/props.js:206–220` dress | Pins expected values 1. |

Fixture/helper assertion spans outside registered callbacks: 186–186. These establish extraction/lookup/handler preconditions; they are not independent tests.
## tests/unit/desktop-app-protocol.test.mjs

Read range: 1–148; SHA-256 `fbb5bd7e05877645a0f2c9abbb943d430ca348ce834af5e2aa8014971c40f135`.

Production: `desktop/app-protocol.js` — MIME; mimeFor; parseByteRange; resolveSafePath; registerScheme; handleScheme.

Fixture and semantics: Pure helpers + temp files; lazy Electron require replaced with fake protocol.handle to obtain real async handler. MIME extension defaults; ranges exact inclusive/suffix, unsatisfiable; traversal rejection; responses 200/206/416/404/403/400 with headers and streamed bodies. Package pin/fuses/source shipment checked.

Limits: No Electron process or privileged registration invoked; registerScheme checked as exported function only; no OS installer run.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| MIME map covers game asset extensions (js/mjs/wasm/ktx2/glb/mp3/…) | 30–41 | 36–36, 37–37, 39–39, 40–40 | `desktop/app-protocol.js:28–51` MIME; `desktop/app-protocol.js:126–128` mimeFor | Pins expected values "application/octet-stream". |
| parseByteRange handles closed, open-end, suffix, and unsatisfiable | 43–56 | 44–44, 45–45, 46–46, 48–48, 49–49, 50–50, 52–52, 53–53, 54–54, 55–55 | `desktop/app-protocol.js:108–124` parseByteRange | parseByteRange handles closed, open-end, suffix, and unsatisfiable (asserted contract). |
| resolveSafePath maps / to index.html and rejects traversal | 58–75 | 65–65, 66–66, 67–67, 69–69, 70–70, 71–71 | `desktop/app-protocol.js:79–100` resolveSafePath | resolveSafePath maps / to index.html and rejects traversal (asserted contract). |
| app-protocol exports registerScheme / handleScheme for main.js | 77–82 | 78–78, 79–79, 80–80, 81–81 | `desktop/app-protocol.js:54–71` registerScheme; `desktop/app-protocol.js:134–187` handleScheme | Pins expected values "function", "app", "apex". |
| desktop package.json ships app-protocol.js, pins Electron to one exact version, locks the fuses | 84–95 | 90–90, 91–91, 92–92, 93–93, 94–94 | `desktop/app-protocol.js` module contract (fixture/CLI/source inspection) | Pins expected values false. |
| handleScheme: 200 full body, 206 range, suffix range, 416, 404, 403 traversal, 400 bad host | 122–148 | 125–125, 126–126, 127–127, 130–130, 131–131, 132–132, 133–133, 136–136, 137–137, 138–138, 141–141, 142–142, 144–144, 145–145, 146–146 | `desktop/app-protocol.js` module contract (fixture/CLI/source inspection) | traversal must be refused |

Fixture/helper assertion spans outside registered callbacks: 104–104, 113–113. These establish extraction/lookup/handler preconditions; they are not independent tests.
## tests/unit/desktop-builder-config.test.mjs

Read range: 1–102; SHA-256 `be97eda13b6f9b163a614646a0a1ca004400dbd3dc19c7fc70b17c5256712d49`.

Production: `desktop/electron-builder.config.cjs` — config.

Fixture and semantics: Actual builder config/identity/package/plist/workflow/files. Frozen app identity, asar/site resources, NSIS preserves data, platform target/architectures and artifact extensions, hardened mac camera/JIT entitlements, no publish provider, release fuses/pack:test override, exact builder 26.15.3 pin, placeholder icons exist.

Limits: Config/source/existence only, not installer creation, signature, image dimensions or actual app-data retention.

| Test name | sourceRange | Assertion spans | Target | Meaning / evidence |
|---|---|---|---|---|
| appId and productName match frozen identity (do not change — saves) | 17–22 | 18–18, 19–19, 20–20, 21–21 | `desktop/electron-builder.config.cjs` module contract (fixture/CLI/source inspection) | Pins expected values "io.github.brycejmurrin.apex26", "Apex 26". |
| asar packs app code; staged site is extraResources to site | 24–33 | 25–25, 27–27, 28–28, 29–29, 30–30, 32–32 | `desktop/electron-builder.config.cjs` module contract (fixture/CLI/source inspection) | extraResources must include { to: 'site' }; site extraResources needs a from |
| NSIS does not delete app data on uninstall | 35–39 | 36–36, 37–37, 38–38 | `desktop/electron-builder.config.cjs` module contract (fixture/CLI/source inspection) | Pins expected values false, true. |
| Windows target is NSIS x64; mac dmg+zip arm64+x64; linux AppImage+deb | 41–49 | 42–42, 44–44, 46–46, 48–48 | `desktop/electron-builder.config.cjs` module contract (fixture/CLI/source inspection) | Pins expected values ["dmg", "zip"], ["arm64", "x64"], ["AppImage", "deb"]. |
| release artifact uploads retain every configured installer format | 51–63 | 58–58, 59–60 | `desktop/electron-builder.config.cjs` module contract (fixture/CLI/source inspection) | release artifact uploads retain every configured installer format (asserted contract). |
| mac entitlements exist and NSCameraUsageDescription is set | 65–75 | 67–67, 68–68, 70–70, 71–71, 72–72, 73–73, 74–74 | `desktop/electron-builder.config.cjs` module contract (fixture/CLI/source inspection) | Pins expected values true. |
| no publish provider yet (unsigned spike / later auto-update task) | 77–81 | 78–78, 80–80 | `desktop/electron-builder.config.cjs` module contract (fixture/CLI/source inspection) | no publish provider yet (unsigned spike / later auto-update task) (asserted contract). |
| builder files include the protocol handler and lib/; pack:test still flips inspect fuse | 83–96 | 84–84, 85–85, 86–86, 87–87, 89–89, 90–90, 91–91, 92–92, 93–93, 95–95 | `desktop/electron-builder.config.cjs` module contract (fixture/CLI/source inspection) | Pins expected values false, "26.15.3". |
| committed placeholder icons exist (512 png set; 1024 labelled placeholder) | 98–102 | 99–99, 100–100, 101–101 | `desktop/electron-builder.config.cjs` module contract (fixture/CLI/source inspection) | committed placeholder icons exist (512 png set; 1024 labelled placeholder) (asserted contract). |

## Production and fixture byte inventory

Ranges are complete file extents for provenance, not claims that every production line executes in these tests. The per-file target names above are resolved through the test loading/imports and LSP outlines; workflow assertions remain source checks.

| Existing source/fixture | Range | SHA-256 |
|---|---|---|
| `.github/workflows/capture-gallery.yml` | 1–45 | `d3357b63292c9737f2ac03dccf90e2a48068518d71804bab7f5ec6ee027d8374` |
| `.github/workflows/ci.yml` | 1–3143 | `d615b39496e01177025a6dde9dbdd6edd5d8314942a9adaca3cb8ead2bf0f1d6` |
| `.github/workflows/desktop.yml` | 1–251 | `8458ecbc83fba37bd05e68e8abf8b2ccd54fa25e724204037c38d0641c31b1b0` |
| `.github/workflows/pages.yml` | 1–452 | `8bae4c19f2ef963163988f30e950e17cdb0713832c05c9a2dc88c2f2074ebdf9` |
| `css/data.css` | 1–1332 | `c55866cf3e0428d1e9b7dba66b5694ca531e56f5ddced7eaac862c2377ea42ef` |
| `desktop/app-protocol.js` | 1–198 | `ddc947150cb1f82cafe70056f67501ad54dfeaed0e3b2bba6044708cde935c40` |
| `desktop/build/entitlements.mac.plist` | 1–12 | `21aac038230984928f04326059ddbe5870b474ebf2c2104f867c4c2d4e4edebb` |
| `desktop/electron-builder.config.cjs` | 1–106 | `63e4c5323120e9ba87d3cfce423a48fd33e9e4ee4521b9a1fea8b52f4acd7623` |
| `desktop/lib/identity.cjs` | 1–18 | `24a7a18d9f872f890ff487f69a2a2922497d2849b98616e15ba78882a9d2ead0` |
| `desktop/package.json` | 1–38 | `798ae2bf5e5723b2a56071db521aeaa7c852852dc2dc2d3c2c873d4e69d374b9` |
| `index.html` | 1–3970 | `198787c00ff4055628ee7c524dff5453c5bc90ee6724948304d4f41d32499348` |
| `js/car/parts.js` | 1–1043 | `7b4c53b388b06b294b59faf46f44f5d01b7fccece83e8732b3c083194558fe4f` |
| `js/data/settings-defaults.js` | 1–95 | `341c37276f582021a20da7b8bc1d70d31c4f56dc6c191fc2ecc1d1d1fb25009b` |
| `js/data/telemetry-player.js` | 1–313 | `1e5c1a9864ecc4485a94d7c28163e1a109535e4416375f879d3be455e8f1e178` |
| `js/editor/canvas.js` | 1–822 | `1f2f75fe7db76d34808af5b0def1fee7e7a8e7522943aa85e76f1f85543fd56b` |
| `js/editor/codec.js` | 1–368 | `bc7c87c5e76045489ce0ac4707cc35de399637aa57215ba6b7a885b70c5a0cf6` |
| `js/editor/custom-tracks.js` | 1–632 | `060b22134e9f11d71158ef90887683f1a99133c998c7b13b549bcadc45bed9f6` |
| `js/editor/followup-tools.js` | 1–95 | `e8cd0a9a055fb8627b5894dcfc802f5f4d71e223c5cfa3956bd4af0a773e44d6` |
| `js/editor/profile.js` | 1–402 | `e9e6c26e3ff70cb864d7ada186b120a526f4cbbd5792e43bc79e0cb23f6fe34e` |
| `js/editor/props.js` | 1–348 | `f9dfb2e270f7c4b47fef61e1a694ecc506b9adf5b90779ebbb35df4dbee76926` |
| `js/editor/scenery-preview.js` | 1–150 | `7d6baaac1595b3215c68ec7e331277b1a8af7f1338363f15bd1bc29a88f68097` |
| `js/editor/shape.js` | 1–356 | `a5a512d177406b15101728cffcc32ccb060f0969726caf8d6b1ad513db8c7b46` |
| `js/game.js` | 1–9554 | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| `js/physics/debris-draw.js` | 1–134 | `629f88230a6134d1c84b7bca717b46b257bd0597f94a34ae58ac54f3b9dafbff` |
| `js/physics/debris-world.js` | 1–1336 | `3fae113a3bd8707b5fa78d7e751f611090b24ae67a913b93b56976b01bfdab1b` |
| `js/physics/incident-sim.js` | 1–543 | `bff96767345deb8d8596bc58443aafbe8583d46a95ec6cd465ce2d794508c649` |
| `js/ui/debris-opts.js` | 1–63 | `428c6d3b452b0b1ec3ea7aee28bd314adbd7a5ae5e53e4c39d784ef51dfac125` |
| `js/ui/deep-link.js` | 1–50 | `b09a08c0c00b5614ce55fa6c69bfb7fd5edaee77bb88f65601370888f220b391` |
| `js/ui/settings-export.js` | 1–1348 | `f88dcf1dfe421bd91f8777328723045a6c7336a375e81cb372a2137bccf8ebf3` |
| `manifest.json` | 1–127 | `0b28d9325192787412a077fa8a0aec609b33eaff011e0711711298a31d9aa2bc` |
| `sw.js` | 1–1177 | `c0a67ac4c85a33b9bf764670f196421f4fddbe20760ac18e8e54b84b54b4f164` |
| `tests/helpers/abs-src.mjs` | 1–8 | `f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47` |
| `tests/helpers/editor-vm.mjs` | 1–48 | `ebbdbb10a8e175aa4b957975fb659e60c782cd62a17aa849d77997db602106df` |
| `tests/helpers/game-source.mjs` | 1–84 | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
| `tests/helpers/git-fixture-env.mjs` | 1–64 | `4c1552f60e11920ca758fd7f913db6604ac90adcbd59437a694576f2e7f9cf82` |
| `tests/helpers/mini-dom.mjs` | 1–186 | `3406f017e765ad4cfef78493aafa8da95846a0e1cb9d28b28a53abd2b296e5c1` |
| `tools/car/parts-sweep.mjs` | 1–1011 | `60df9d4b5ad7080a9c7a4444d892078d271c89030bbedf429efe1f7d01602949` |
| `tools/ci/bump-cache.mjs` | 1–258 | `20b1d8e2fe5dea1fb23041709ae5a6de836a93668ad80f6bef4cf55de0a96808` |
| `tools/ci/deploy-child.mjs` | 1–82 | `7b1a42a76543667558b84631b393b51ec47af9f6cc799951b5d9f4dbd7b12f35` |
| `tools/ci/deploy.mjs` | 1–1067 | `9f382db2243c5c3c667c8b90c91287269234d1ed7ce6a91a23ed9861f107c3de` |
| `tools/ci/geometry-paths.mjs` | 1–262 | `f5ed0099ffdb374e684d92556b145f64ea34e5d8f59137945681d5521785fba6` |
| `tools/desktop/stage-files.mjs` | 1–57 | `dabeb7c1bdf954617aae14bca69af51b1adb9da459dec5c816df81f7ea9362f5` |
| `tools/desktop/stage.mjs` | 1–282 | `879b549b31f6b246a483c18d152da5035ca500ca7985894137314d3ea0b446dc` |
| `tools/lib/track-build-vm.cjs` | 1–270 | `09e00ae387a0e46bf25c9d7cbe4eb71ab32c891b7aba36e645c5d6614f6f311b` |
| `tools/manifest.cjs` | 1–1691 | `bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb` |
| `tools/mcp/debug-chrome.mjs` | 1–205 | `4f82da767814ac91ac4ab2cea87d77515c344a052a8a63df9ffeef7390772eb6` |
| `tools/shot/capture-gallery.mjs` | 1–63 | `6158f4678a370ae5000a24e9a9439a221af8641ac93836706e03c807a2a321b2` |
| `tools/shot/design-matrix.mjs` | 1–88 | `76f6e95757b6b2f287dd13b8ac0d3be753d5e875a1ba4d25307b21eafc3ef8e7` |
| `tools/shot/lib/design-matrix-run.mjs` | 1–107 | `972bec41bfd753d90e045b726d2652879ad03c18d3b5d2c8480720d9a5049903` |
| `tools/shot/lib/design-matrix.mjs` | 1–220 | `4127a6c5650c4db491b7f4ba504850f5032f3c04cca0a8219f96d16f9ecfd81c` |
| `tools/shot/run-capture-request.mjs` | 1–40 | `15bdbdd40563f36078a009cb4299e0e33e5b1ff3ab63a0525ebe193f9e61d9bd` |
| `tools/track/designer-code.mjs` | 1–247 | `9285c6aef4e6c78d3b8c0ad8e597c62fa715e82bebdf16a39ec4f8fc8bbadd41` |

## Coverage accounting

217 lexical test registrations. The wheels template contributes five runtime cases in place of one; the profile boundary and live-delta templates each contribute two in place of one, yielding 224 runtime cases if the suite registers normally. Loops inside a test are data cases, not additional registrations. Assertions inside helper functions (extractFn, build, tokenFor, fake Electron registration, floodDress, temporary git helper) are fixture preconditions in addition to the spans shown in test callbacks. Full source was inspected; this map records what the suite asserts, not passing results.
