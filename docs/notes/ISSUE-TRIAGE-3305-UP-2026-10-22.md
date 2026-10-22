# Issue triage, #3305 and up (A·T3, 2026-10-22)

Deploy tip `72408e99` (#3478 merge). 68 open issues in range. Counts: STALE 2, VALID 55, PARTLY-VALID 4, FIXED 5, IN-FLIGHT 1, NEEDS-INFO 1.

**Evidence level, stated honestly:** no screenshots were taken; a live pass (06:30-06:50Z) re-ran `tools/ui/layout-audit.mjs` and `menu-fit.mjs` for #3305-#3307, #3330, #3334-#3336 and #3338, with the results in their rows. Doc/skill issues were re-checked by grep on the tip. Scenery issues were re-measured with `tools/track/{ground,clip,coplanar,float}-audit.cjs` where the claim was a count, and otherwise confirmed by "the circuit files have not changed since the surveyed tip `17a7d1be0`". UI/garage and car visual claims are VALID by that same unchanged-code argument and were not re-shot. Merged/open PRs checked: every merge since 10-19 (93) and the 16 open PRs.

## Close candidates
- #3416 [D·car] body-shapes: Playwright garage capture gallery aborted (no shots/ tree)
- #3414 [D·car] wheels: STYLE Arc Script and Raised Letters sidewalls barely visible in garage
- #3308 [D·scenery] test-permission-check (delete me)
- #3305 [D·survey] Title mode grid clips when UI scale is 200% on phone landscape
- #3477 closes itself (flake-tally bot) once #3473 is in its window.

## Wait for an open PR, then close
- #3361 -> PR #3458 · #3414 -> PR #3462 (#3318-#3320 already closed by #3471)

## Rewrite / merge needed
- #3360 [D·scenery] shanghai: Pudong skyline floats (70–148 m gaps) and sits ~300 m from the road: keep (retitle: buried=11 + skyline 300 m from road)
- #3353 [D·review] skills-b pages-red-triage: use tools/ci/pages-live-sha.sh path: merge with #3321
- #3352 [D·review] skills-b data-hub: minor line-anchor nits (standings.js, showTab): merge into a single skills-nits issue
- #3333: decide the touch-target floor (40 vs 44 px) before anyone "fixes" it.

## Worth knowing
- Two big claim sets were **released with no work**: B·W15 (#3330-#3339 garage UI) and B·W16 (#3412/#3413 car aero). Those 12 issues are genuinely unowned.
- The 11 skill/doc nits (#3321-#3329, #3351-#3355) could be one PR.
- Nothing in range was fixed by the 10-21/22 game merges: the closest were #3478/#3479 (perf) and #3429 (rotation input), none address #3311.

## Table
| # | Title | Labels | Verdict | Evidence | Recommended action |
|---|---|---|---|---|---|
| #3477 | Base red suspects (auto) | base-red | FIXED | Auto 'Base red suspects' tally. Its only row is garage-out-before-card DAILY; #3473 'fix(intro): await picker build abort before introBuild' merged 04:30Z, ten minutes before the tally was read (04:40Z). The workflow rewrites/closes it itself. | leave to the bot (flake-tally.yml) |
| #3418 | [D·car] body-shapes: style_engine_zeropod garage silhouette overshoot (dHaus ~228 mm) | - | VALID | Accuracy/stylisation tweak, no commit on the zero-pod engine mesh since. Not re-measured. | keep (low) |
| #3417 | [D·car] body-shapes: pod-sculpt quartet adds ~+9–10% player body tris vs McLaren factory | - | VALID | Mesh-budget request on the pod-sculpt quartet; needs a re-count against tests/unit/body-styles.test.mjs budgets. #3242 (mesh budget) merged 10-21 and may have moved the numbers. | keep, re-measure with tri-census first |
| #3416 | [D·car] body-shapes: Playwright garage capture gallery aborted (no shots/ tree) | - | NEEDS-INFO | One aborted survey run, no verifiable ask. Closed not_planned by the orchestrator 2026-10-22. | closed |
| #3414 | [D·car] wheels: STYLE Arc Script and Raised Letters sidewalls barely visible in garage | ready, claimed | FIXED | PR #3462 merged as 14c22efe (~06:37Z); issue closed completed. | closed |
| #3413 | [D·car] aero: outwash_max rear wing horizontal z-fight on wing preset | ready | VALID | B·W16 claimed ('car-aero-3413-b16w') then released; no branch/PR exists. Not re-rendered. | keep |
| #3412 | [D·car] aero: garage TLX shows oversized orange emissive block at tail (minimal wingRear) | ready | VALID | B·W16 claimed ('car-aero-3413-b16w') then released; no branch/PR exists. Not re-rendered. | keep |
| #3411 | [D·car] aero: S-Duct option has no nose duct geometry (floor vanes only) | ready | VALID | S-Duct recipe still floor vanes only per issue; no nose-duct commit since. | keep |
| #3405 | [D·car] aero: Haas signature kit barely distinct from Low DF at garage camera | ready | VALID | Catalog/sweep claim; js/car/parts.js unchanged for sig_haas_wing since. Not re-run. | keep |
| #3404 | [D·car] aero: 2026 packages lack active front-wing mode silhouette | ready | VALID | Premise matches the 2026 regs (active front+rear wing, Straight/Corner mode; FIA/F1 links in the issue, not re-fetched). Catalog recipes still carry drs:1 rear only. Feature request, not a bug. | keep (label enhancement) |
| #3375 | [D·scenery] mugello: weak cypress/Arrabbiata identity; mid-lap orbit into canopy | - | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3374 | [D·scenery] monza: coplanar 5 + clip severe 7 saturate baselines (z-fight / intrusion) | - | VALID | Re-measured today: `clip-audit monza` severe=7; `coplanar-audit monza` 6 pairs / 5 spots. | keep |
| #3373 | [D·scenery] nurburgring: bare sand-pyramid horizon; Burg Nürburg / Eifel spruce weak | - | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3372 | [D·scenery] portimao: verges read green/tan — missing Algarve red cut-bank identity | - | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3371 | [D·scenery] miami: docs brief says clockwise but FIA and geometry are anti-clockwise | - | VALID | docs/tracks/miami.md:3 still says 'clockwise'. One-word docs fix. | keep (trivial doc fix) |
| #3369 | [D·scenery] miami: day S/F orbit/trackside cameras sit inside Hard Rock / pit mass | - | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3368 | [D·scenery] monaco: mid-lap orbit camera buried in Fairmont cliff (day+night) | - | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3366 | [D·scenery] suzuka: Ferris wheel landmark not readable in full-lap day orbit survey | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3365 | [D·scenery] qatar: day S/F orbit buried in sand; pit / Lusail Hill identity weak in daylight | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3364 | [D·scenery] redbull: orbit survey camera clips inside props at multiple lap fracs | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3363 | [D·scenery] vegas: day Strip reads as desert blocks + balloon; Sphere/Bellagio weak until night | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3361 | [D·scenery] singapore: city modelGroups float 150–218 m; backdrop coplanar fights to 591 m² | ready, claimed | IN-FLIGHT | Open PR #3458 'W13j Singapore ground/backdrop fix (#3361)'. float-audit singapore: 0 clusters today. | keep until #3458 merges |
| #3360 | [D·scenery] shanghai: Pudong skyline floats (70–148 m gaps) and sits ~300 m from the road | ready | VALID | Re-measured: `ground-audit shanghai` buried=11 (as filed; unsupported now 0, the 70-148 m footprints are advisory-only). float-audit shows 0 clusters. Skyline offset claim not re-shot. | keep (retitle: buried=11 + skyline 300 m from road) |
| #3355 | [D·review] skills-b data-hub: test-solo.mjs missing tools/ci/ prefix | ready | VALID | data-hub/SKILL.md:64 still bare `test-solo.mjs`. | keep |
| #3354 | [D·review] skills-b multiplayer-debug: nostr-probe needs ws install not documented in skill | ready | VALID | multiplayer-debug/SKILL.md line 91 points at phone-nat.md only; no `npm i --no-save ws` note in the skill. | keep |
| #3353 | [D·review] skills-b pages-red-triage: use tools/ci/pages-live-sha.sh path | ready | VALID | pages-red-triage/SKILL.md:19 still bare `pages-live-sha.sh`. | merge with #3321 |
| #3352 | [D·review] skills-b data-hub: minor line-anchor nits (standings.js, showTab) | ready | VALID | Low-severity anchor nit: data-hub/SKILL.md:32 still '~123-130' (function at standings.js:124); showTab anchor unchanged. Bundle with the other skill nits. | merge into a single skills-nits issue |
| #3351 | [D·review] skills-b gen-regen: npm run gen --silent runs full gen despite skill text | ready | VALID | gen-regen/SKILL.md:31 still says `npm run gen --silent` is not a thing. | keep |
| #3350 | [D·scenery] buenos_aires: mass-concrete terrace density too thin for Gálvez classic | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3349 | [D·scenery] albert_park: cityFront voided — CBD skyline is abstract tower stubs | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3348 | [D·scenery] dijon: four severe clips and five flatCoplanar ground advisories | ready | VALID | Re-measured today: clip severe=4, ground flatCoplanar=5 buried=1 (coplanar-audit: 1 spot). | keep |
| #3347 | [D·scenery] bahrain: main tribuna reads dark grey by day (not cream Gulf stand) | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3346 | [D·scenery] abudhabi: Yas hotel gridshell reads as rainbow skeleton vs LED envelope | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3345 | [D·scenery] estoril: scenery too sparse (1 grandstandEx, lightest props tris) | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3344 | [D·scenery] catalunya: five severe clip spots on pit/stand corridor | ready | VALID | Re-measured today: `clip-audit catalunya` severe=5. | keep |
| #3343 | [D·scenery] catalunya: Stadium-section grandstands missing (only Main + Tribuna J) | ready | VALID | catalunya.js unchanged since survey; stadium stands still absent. | keep |
| #3342 | [D·scenery] bahrain: ground-audit buried 19 props and 1 unsupported (batch-high) | ready | VALID | Re-measured today: `ground-audit bahrain` buried=19 unsupported=1, as filed. | keep |
| #3340 | [D·scenery] baku: night orbit at frac 0.83 captures black-scene-with-edge-content | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3339 | [D·survey] Garage livery grid extreme scroll depth on phone | ready | VALID | Garage/Photo-Studio layout finding. B·W15 claimed it ('phone-garage-ui-3331-b15a') then released; no such branch or PR exists, and css/carsetup.css has no commit since 10-20. Not re-shot. | keep |
| #3338 | [D·survey] Photo Studio #ps-body minor clip on iPad portrait | ready | PARTLY-VALID | Live: `layout-audit photostudio ios-ipad-portrait@100` clipped 0. The 10 px clip came from menu-mock (not re-run), so it is unconfirmed. | keep, re-check with menu-mock |
| #3337 | [D·survey] Photo Studio settings steppers under touch target on desktop | ready | VALID | Garage/Photo-Studio layout finding. B·W15 claimed it ('phone-garage-ui-3331-b15a') then released; no such branch or PR exists, and css/carsetup.css has no commit since 10-20. Not re-shot. | keep |
| #3336 | [D·survey] MY TEAM sheet (#customize) bottom clip on phone portrait | ready | PARTLY-VALID | Live: `layout-audit customize ios-iphone-portrait@100` clipped 0 (tapSoft 2). The 10 px clip came from menu-mock, which I did not re-run, so the clip is unconfirmed. | keep, re-check with menu-mock |
| #3335 | [D·survey] Garage tab subtitles ellipsize long fitted part names on desktop | ready | VALID | Live: `layout-audit garagelivery desktop-1440x900@100` clipped 3, truncated 10 (matches #3335's '10 truncated tab subtitles'). B·W15 claim was released with no branch/PR. | keep |
| #3334 | [D·survey] Garage TEAM driver chips and FREE BUILD under touch target at 75% UI | ready | VALID | Live: `layout-audit garageteam ios-iphone-portrait@75` tapSoft 28. B·W15 claim released with no branch/PR. | keep |
| #3333 | [D·survey] Garage Active Aero and Camera footer controls under touch target height | ready | PARTLY-VALID | css/carsetup.css:1264 comments that #cs-aero/#cs-cam were raised from 31px to a deliberate 40px chip floor after an earlier survey; the issue asks for 44px. Left is a policy call (40 vs 44), not a defect. | keep, decide the tap floor or close as by-design |
| #3332 | [D·survey] Garage #cs-options horizontal overflow at 75% UI scale | ready | VALID | Garage/Photo-Studio layout finding. B·W15 claimed it ('phone-garage-ui-3331-b15a') then released; no such branch or PR exists, and css/carsetup.css has no commit since 10-20. Not re-shot. | keep |
| #3331 | [D·survey] Garage #cs-body clips sheet on 320×568 and 360×640 at 100% UI | ready | VALID | Garage/Photo-Studio layout finding. B·W15 claimed it ('phone-garage-ui-3331-b15a') then released; no such branch or PR exists, and css/carsetup.css has no commit since 10-20. Not re-shot. | keep |
| #3330 | [D·survey] Livery finish tags clip outside swatch cards (CHAMELEON/GOLDPLATE) | ready | VALID | Live: `layout-audit garagelivery desktop-1440x900@100` clipped 3, truncated 10 (matches #3335's '10 truncated tab subtitles'). B·W15 claim was released with no branch/PR. | keep |
| #3329 | [D·review] skills-a: stand-down push window 10 min (ci-watch) vs 15 min (agent-fleet) | ready | VALID | ci-watch/SKILL.md:71 ~10 min vs agent-fleet/SKILL.md:112 and orchestrator.md:25 ~15 min. | keep |
| #3328 | [D·review] ci-watch SKILL tells users merge desk will merge; role says never merge | ready | VALID | ci-watch/SKILL.md:29 still 'ready for the merge desk to merge'. | keep |
| #3326 | [D·review] audio-debug SKILL.md stale line anchors for GameAudio.shift | ready | VALID | audio-debug/SKILL.md:46 still cites ~2261 / ~5066-5067 / ~5479. | keep |
| #3325 | [D·review] playwright-probe: flicker-gate.mjs missing tools/shot/ path | ready | VALID | playwright-probe SKILL.md:75,93 and recipes.md:187 still bare `flicker-gate.mjs`. | keep |
| #3323 | [D·review] pwa-cache-service-worker sw.js line anchors stale in SKILL.md | ready | VALID | SKILL.md:34-38 still gives ~L680/~L757/~L926 anchors. | keep |
| #3322 | [D·review] skills-c low: ui-menu-a11y path label + phone-browser viewport wording | ready | VALID | ui-menu-a11y/SKILL.md:52 still '(repo root)'; phone-browser/SKILL.md:15 still 852x393. | keep |
| #3321 | [D·review] pwa-cache-service-worker SKILL omits pages-live-sha.sh URL argument | ready | VALID | pwa-cache-service-worker/SKILL.md:29 still `tools/ci/pages-live-sha.sh` with no <url>. | keep |
| #3320 | [D·review] AGENT-SURFACE.md says forty apex_* tools; tools/list has 41 | ready, claimed | FIXED | PR #3471 merged as 05206735 and the three issues were closed by it (no longer in the open list at 06:30Z). | already closed |
| #3319 | [D·review] AGENTS.md hooks paragraph stale vs settings.json and protect-files.py | ready, claimed | FIXED | PR #3471 merged as 05206735 and the three issues were closed by it (no longer in the open list at 06:30Z). | already closed |
| #3318 | [D·review] AGENTS.md sync cites missing origin/ship; sync-pr merges deploy branch | ready, claimed | FIXED | PR #3471 merged as 05206735 and the three issues were closed by it (no longer in the open list at 06:30Z). | already closed |
| #3317 | [D·scenery] hungaroring: pit-straight firs fight dusty amphitheatre; 2025 pit mass reads dark | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3316 | [D·scenery] kyalami: start orbit/trackside look into/under main grandstand | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3315 | [D·scenery] jeddah: night start orbit occluded by near-field building canyon | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3314 | [D·scenery] fuji: Mount Fuji snow cap unreadable from pit-straight day orbit | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3313 | [D·scenery] batch2: start/finish trackside cam buried in pit/stand walls (7 circuits) | ready | VALID | Survey finding at tip 17a7d1be0; the circuit's js/circuits/<id>.js and scenery/<id>.js have no commit since (git log --since=2026-10-20 lists only donington, spa, silverstone, magny_cours, singapore). Visual claim not re-shot here. | keep |
| #3311 | [D·survey] Phone rotation rebuilds post targets and sheds the quality tier | ready | VALID | js/render/three/tlx-post.js:537 `resize` still early-outs only when BOTH axes match; js/render/glx/post.js createTargets has the same check, so an equal-pixel transpose rebuilds. #3429 (rotation drag) and #3478/#3479 do not touch it. | keep |
| #3308 | [D·scenery] test-permission-check (delete me) | - | STALE | Permission probe ('delete me'). Closed not_planned by the orchestrator 2026-10-22. | closed |
| #3307 | [D·survey] Settings Appearance steppers undersized at UI scale 75% | - | PARTLY-VALID | Live: `menu-fit 844x390 --scale=75 --only=settingsappearance` = ok (no tiny rows now), but `layout-audit settingsappearance ios-iphone-landscape@75` still lists 80 soft taps at 39 px high against the 52 px floor (artifacts/agent-output/apex-tools-apex_ui_fit-1792650671381-*.json). | keep, restate as soft-tap (39 px < 52 px floor) rather than tiny |
| #3306 | [D·survey] VS Friend sheet header clips at UI scale 200% (desktop) | - | VALID | Live: `layout-audit vsfriend desktop-1440x900@200` clipped 1. | keep |
| #3305 | [D·survey] Title mode grid clips when UI scale is 200% on phone landscape | - | STALE | Live 2026-10-22 on tip afd7ebd8: `layout-audit title ios-iphone-landscape@200` clipped 0 offscreen 0 (only 7 soft taps); `menu-fit 844x390 852x344 --scale=200` prints no vLost rows. The cited vLost on #mb-career/#mb-data does not reproduce. Comment posted; close left to the orchestrator. | close not_planned (orchestrator) |

## Unowned lanes (B·W15 #3330-#3339, B·W16 #3412/#3413): still valid? size
S = one CSS rule or one mesh tweak; M = several rules/files or a re-render loop; L = needs a design decision.

| # | still valid | size | note |
|---|---|---|---|
| #3330 | yes (garagelivery desktop@100: clipped 3) | S | .cs-opt-tag vs .cs-liv-swatch overflow, css/carsetup.css:783-801 |
| #3331 | unconfirmed (320x568 / 360x640 are not in the layout-audit viewport catalog) | M | needs a custom-viewport run first |
| #3332 | unconfirmed | S | pair-main width at --ui-scale<1 |
| #3333 | partly (40 px is deliberate, css/carsetup.css:1264) | S | decide 40 vs 44 first |
| #3334 | yes (garageteam iphone-portrait@75: tapSoft 28) | S | .sel-chip + #cs-unlimited height |
| #3335 | yes (trunc 10) | M | ellipsis is the shared rule at css/carsetup.css:560; needs a title/tooltip or wider rail |
| #3336 | partly (layout-audit clipped 0) | S | re-check with menu-mock first |
| #3337 | unconfirmed (not run; photostudio desktop@100 not audited) | S | stepper rows in photo-studio |
| #3338 | partly (layout-audit clipped 0) | S | re-check with menu-mock first |
| #3339 | yes (design) | L | search/recents/collapse is a product choice |
| #3412 | yes (not re-rendered) | M | rain-light emissive scale in js/car/car3d.js |
| #3413 | yes (not re-rendered) | M | rearAssembly flap offsets when casc/lvl high |

## Ready-to-paste rewrites (not applied; my launch prompt forbids editing issues)
Start each body with: "Rewritten 2026-10-22 by A·T3 (triage), original intent kept".

**#3307 Settings Appearance steppers soft-tap at UI scale 75%.** menu-fit no longer flags tiny rows. Remaining: `node tools/ui/layout-audit.mjs --screens=settingsappearance --viewports=ios-iphone-landscape --scale=75` lists 80 soft taps, steppers/buttons 39 px high against the 52 px floor. Acceptance: that command's tapSoft for the prev/next steppers drops to 0 (or the floor is documented as 40 for 75%), no new clipped rows.

**#3336 MY TEAM (#customize) phone-portrait scroll clip.** layout-audit `customize ios-iphone-portrait@100` reports clipped 0, tapSoft 2. The original 10 px #cz-body clip was a menu-mock reading. Acceptance: re-run `node tools/ui/menu-mock.mjs` for customize/ios-iphone-portrait; if the clip is gone close, else fix css/race-setup.css #cz-body vs footer and keep tapSoft 0.

**#3338 Photo Studio #ps-body iPad portrait.** layout-audit `photostudio ios-ipad-portrait@100` reports clipped 0. Original 10 px clip was a menu-mock reading. Acceptance as #3336, for photostudio/ios-ipad-portrait.
