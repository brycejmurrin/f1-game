# Browser specs map — batch 03

Mapped all 160,000 assigned bytes in eight parts. Whole-file hashes match the manifest. `specs-03-evidence.json` records whole/part/chunk hashes, imports, hooks, all intersecting case and assertion ranges, and LSP lookup limits. Half-open UTF-8 bytes; inclusive source lines. No tests, browser sessions or runtime edits performed.

Six files are complete. `career-hub.spec.js` is tail [11554,35271), beginning between its guide describe opening and first test. `cota-foundation.spec.js` is prefix [0,2497), ending inside its first case with zero assertion sites. AST enclosing ranges outside those spans are structural context only.

## `tests/specs/career-hub.spec.js`

Assigned tail: mode-specific guides derive economy numbers from rules; settlement panel reflects saved balance and stays out of GP; grants/free money preserve fitted cap; facility discounts stop at max; MY TEAM hire expiry/renewal/replacement, sponsors and season-two ledger; five phone viewports keep modes/hub columns and stills inside their containers. Guide describe header/imports/helpers precede the assigned span and are not credited as read here.

| Case source lines | Scenario / contract | Assertion sites in assigned span |
|---|---|---:|
| 236–250 | the modes screen carries one per mode | 6 |
| 252–262 | the hub names the mode actually being played | 3 |
| 264–296 | its numbers come from the rules, not from prose | 7 |
| 298–308 | MY TEAM's guide prices the actual driver market | 3 |
| 328–343 | a career round shows what it paid, and the total is the new balance | 5 |
| 345–359 | a Grand Prix never inherits a career round's earnings panel | 3 |
| 367–377 | off by default, and the grant adds exactly what it says | 2 |
| 379–398 | unlimited money does NOT raise the fitted cap | 3 |
| 400–409 | the toggle survives a reload and is not part of the save | 2 |
| 417–432 | each level permanently cuts what research costs | 3 |
| 434–447 | it runs out of levels, not of money | 3 |
| 457–473 | it expires, and an empty seat blocks the weekend | 5 |
| 475–504 | re-signing takes their asking price and clears the block | 10 |
| 506–522 | signing somebody else replaces the seat and its wage | 3 |
| 524–528 | a driver career has no hire to resolve | 1 |
| 536–547 | MY TEAM has one and a driver career does not | 6 |
| 549–556 | it is drawn from the seed, so a reload cannot reroll it | 1 |
| 558–574 | a window pays at most once across a whole season | 3 |
| 576–598 | …and the ledger clears at the rollover, so season two still pays | 4 |
| 659–675 | modes: no horizontal overflow at ${…} | 10 |
| 677–699 | hub: no horizontal overflow at ${…} | 13 |

## `tests/specs/career-season.spec.js`

Virgin-page parallel career scenarios cover seeded objectives and bonus accounting, tier-relative reputation, full-season progression and shared championship identity, bounded history/grid development, offers and signing gates, reproducible seasons, derived history UI, reliability defaults/DNF classification/RNG independence, and six isolated save slots. Uses seeded simulation after a real staged qualifying/grid; several heavy describes declare 300 s.

| Case source lines | Scenario / contract | Assertion sites in assigned span |
|---|---|---:|
| 12–24 | every round carries a brief, and the hub states it | 6 |
| 26–34 | the brief is drawn from the seed — a reload cannot reroll it | 1 |
| 36–50 | a settled round resolves the brief against the round it belonged to | 5 |
| 52–64 | a season draws a spread of briefs, not one kind over and over | 1 |
| 66–82 | meeting the brief pays 150 cr; missing it pays nothing | 3 |
| 88–115 | a settled round moves reputation by result-vs-expectation, the brief and race craft | 3 |
| 117–137 | the same finish is worth less in a better car | 1 |
| 139–146 | reputation stays inside 0..100 across a whole season | 3 |
| 159–177 | careerSim fills the season: 24 rounds, points on the board, money earned | 7 |
| 179–202 | the rollover archives the year, opens the next one and carries the money over | 13 |
| 204–220 | the reset championship is the SAME object game.js is holding | 2 |
| 222–232 | history is capped at ten entries, oldest first off | 3 |
| 234–253 | the rollover develops the grid: drivers drift, teams regress toward their tier | 4 |
| 255–288 | a market swap reaches the actual grid through driverOverride | 3 |
| 312–328 | the end of a season always puts at least one seat on the table | 9 |
| 330–336 | the sheet reports the year that just finished | 3 |
| 338–368 | accepting a move changes the team and re-seeds the garage | 10 |
| 370–384 | renewing with your own team keeps the garage you built | 3 |
| 386–398 | the hub will not let you race the new season unsigned | 4 |
| 448–453 | the same seed produces the same season, rollover and offers | 2 |
| 455–478 | a different seed produces a different career | 3 |
| 480–501 | a season draws a spread of briefs, not one kind repeated | 2 |
| 534–545 | the hub opens it, and BACK closes it again | 6 |
| 547–563 | a first season says so rather than rendering an empty box | 9 |
| 565–607 | a rolled-over season becomes a row, and the totals follow it | 17 |
| 682–690 | OFF is the shipped default and nothing ever retires | 5 |
| 692–698 | a seeded season retires the same cars for the same reasons every time | 4 |
| 700–703 | a different career seed retires a different set | 1 |
| 705–736 | a retirement classifies below every finisher and scores no points | 5 |
| 738–766 | the reliability draw does not move the sim RNG stream | 6 |
| 768–783 | RELIABILITY is a persisted race setting | 4 |
| 806–818 | two sets of three, filled independently | 3 |
| 820–830 | a career's MODE decides its set, whatever slot is asked for | 1 |
| 832–846 | switching leaves every other slot exactly as it was | 3 |
| 848–858 | deleting one leaves the other five | 3 |
| 860–873 | the slots survive a reload, and the live one is remembered | 3 |

## `tests/specs/career.spec.js`

Virgin-page parallel career contracts: mode axes, versioned saves and migration, GP/save/garage/grid isolation, validated new-driver number and hub navigation, driven round settlement and seat substitution, ratings determinism/development, R&D research and free-build gating, and MY TEAM livery, wages, grid and owner rollover. Slow double-grid tests use test.slow; garage mutations use DOM clicks to avoid live-canvas actionability churn.

| Case source lines | Scenario / contract | Assertion sites in assigned span |
|---|---|---:|
| 19–26 | flow/session replace the old booleans without changing their meaning | 4 |
| 28–36 | a career is a championship: seasonMode stays true inside one | 4 |
| 38–46 | leaving a career for a Grand Prix clears the flow | 2 |
| 54–67 | starting a career writes a versioned save | 8 |
| 69–81 | the save survives a reload and the button offers to continue | 4 |
| 83–110 | a save with no version field migrates instead of being discarded | 9 |
| 112–128 | migrating a career does NOT touch the standalone season save | 2 |
| 136–148 | the career garage is a separate build from the free-play one | 1 |
| 150–186 | career team development does not reach a Grand Prix | 1 |
| 188–238 | …but it DOES reach the career itself | 3 |
| 245–279 | a Grand Prix garage writes to free play, not into the career save | 6 |
| 281–304 | a Grand Prix grid does not depend on which career is on the device | 3 |
| 312–326 | with no save the screen offers a new career; starting one opens the hub | 6 |
| 328–352 | NEW CAREER number rejects truncated numeric input before saving | 7 |
| 354–361 | the hub reports balance, reputation and the round | 3 |
| 363–373 | the hub replaces #select — GO RACING goes straight to race settings | 4 |
| 375–383 | the garage returns to the hub rather than the select screen | 3 |
| 391–409 | finishing a round pays out, advances the calendar and returns to the hub | 5 |
| 411–419 | the player takes the contracted seat on the grid | 3 |
| 441–450 | the same seed produces the same grid — the RNG stream is unchanged | 2 |
| 452–468 | ratings differentiate the field, fastest to slowest | 4 |
| 470–478 | consistency is a variance axis, not a speed one | 3 |
| 480–488 | an unknown driver code still resolves to a full rating | 3 |
| 490–518 | career development moves a rating inside the career, not outside it | 2 |
| 552–569 | FREE BUILD is hidden in career and offered outside it | 4 |
| 571–579 | the header reports the balance and the fitted cap, not the flat budget | 3 |
| 581–589 | an unresearched part lists as locked, quoting a research price | 2 |
| 591–604 | with no money a locked row refuses, and the car is unchanged | 3 |
| 606–623 | researching deducts exactly cost x RESEARCH_MULT and unlocks the part | 3 |
| 625–639 | nothing the career garage does touches the free-play build | 1 |
| 653–683 | the My Team garage swatch paints the active slot livery | 4 |
| 685–699 | the setup screen offers a driver market | 4 |
| 701–710 | the fitted cap is a real number, not zero | 2 |
| 712–721 | the team enters TWO cars — you and your hire | 3 |
| 723–739 | the hire is paid every round, out of the balance | 4 |
| 741–756 | a cheaper hire leaves more to develop the car with | 2 |
| 758–764 | a driver career has no roster and no wage bill | 2 |
| 766–775 | free play still fields ONE custom car | 1 |
| 777–803 | MY TEAM is never offered a seat — you own the constructor | 6 |

## `tests/specs/carview-parts.spec.js`

Dedicated viewer document. Serial shared mclaren page boots once via beforeAll and closes via afterAll; reader cases precede effect mutation. All twelve category controls, effect controls and synchronized effect state are exposed. Separate ferrari signature-brake boot checks frame advancement after camera set. Context sharing narrows CI exposure; its long comment explicitly does not establish a proven hang fix.

| Case source lines | Scenario / contract | Assertion sites in assigned span |
|---|---|---:|
| 70–77 | car viewer exposes controls for all twelve parts categories | 2 |
| 79–83 | car viewer exposes controls for grounded runtime effect states | 3 |
| 85–100 | car viewer effect API updates state on a synchronized frame | 2 |
| 106–116 | car viewer exposes a frame sequence that advances after state changes | 1 |

## `tests/specs/collision-ai-fixes.spec.js`

Bare Playwright landscape race setup; headless reset/act episodes cover wrong-way thresholds and clearing, open-wall scrub relative to coasting control, throttle-held rescue and reset cooldown, rear-contact timers, finite/mobile ten-car packs, banked AI relative speed, player banking clearance and Jeddah barrier metadata/face clamp. These are staged behavioral proxies, not visual proof or direct bank-grip measurement.

| Case source lines | Scenario / contract | Assertion sites in assigned span |
|---|---|---:|
| 29–44 | slow reverse crawl below 15 m/s does not trigger wrong-way | 1 |
| 46–63 | sustained backward driving at >15 m/s sets wrong-way within 0.6 s | 2 |
| 65–89 | wrong-way clears within 0.5 s after car faces correct direction (hysteresis) | 2 |
| 91–106 | obs().done is true when wrong-way is active | 1 |
| 118–152 | speed is scrubbed when pinned against Monza barrier (pushIn penalty) | 2 |
| 154–181 | a car wedged against the barrier is auto-rescued back onto the track | 2 |
| 192–222 | reset() clears rescue grace so a second rescue fires within the window | 2 |
| 232–258 | rear-end collision sets contactT on both cars | 3 |
| 268–281 | 10-car pack digs out within 5 s — no NaN positions | 1 |
| 283–296 | 10-car pack reaches >10 m/s average speed within 5 s | 1 |
| 306–333 | AI carry banked-corner speed comparable to a flat straight (banking grip applies to AI) | 2 |
| 335–354 | player with racing-line assist stays on banked Zandvoort section | 3 |
| 365–374 | Jeddah wallAt() matches the migrated visual wall clearance | 2 |
| 376–390 | car cannot drive past the migrated Jeddah barrier face | 1 |

## `tests/specs/collisions-deep.spec.js`

Fixture-backed world/Frenet collision integration: player separation and AI escape, bounded penetration, open/street wall containment, kerb flag, finite slide/sandwich/pileup/contact, energy and per-frame shove bounds, start-line progress and traffic-nest liveness. Incident takeover disabled only for clamp-isolation cases. Test titles sometimes claim more than assertions: open-wall case checks reach/boundary, not final speed; player state finite checks do not establish exact prog/s agreement.

| Case source lines | Scenario / contract | Assertion sites in assigned span |
|---|---|---:|
| 24–51 | driver↔AI side contact pushes the PLAYER and the push sticks | 2 |
| 53–74 | driver↔AI: player can't be driven through an overlapping rival | 1 |
| 76–109 | driver↔wall: player is stopped at the barrier and loses speed | 2 |
| 111–129 | kerb: riding the kerb sets the kerb flag (grip penalty hook) | 1 |
| 131–155 | driver↔AI: ramming a car ahead never deeply interpenetrates (shove aside, pass clean) | 1 |
| 157–185 | street-circuit wall: hard barrier pins the player and scrubs speed | 3 |
| 187–220 | drift into a wall stays stable (no NaN, no fly-off) | 3 |
| 222–244 | sandwiched between two rivals: player stays on track, no merge, no NaN | 3 |
| 246–263 | a side rub never INCREASES the player's speed (no energy injection) | 1 |
| 265–289 | a single AI rub only nudges the player apart — never launches it | 2 |
| 291–308 | AI shoving the player toward the wall can't push them through it | 1 |
| 310–334 | five-car pileup around the player stays bounded and finite | 3 |
| 336–357 | collision across the start/finish line keeps prog monotonic (no wrap glitch) | 2 |
| 359–378 | driver↔AI contact never NaNs or desyncs prog/s for the player | 2 |
| 384–423 | closing into a traffic nest does not speed-death via perpetual side-rub | 2 |

## `tests/specs/collisions.spec.js`

Fixture-backed Monza pair/jam/full-field simulation: alongside separation peak, finite bounded positions, every jammed car resumes speed with pairwise clearance, and ten-second field containment. Explicit 12 m/s jam bound is liveness, not a pace envelope. Fixed spatial limits describe these scenarios only.

| Case source lines | Scenario / contract | Assertion sites in assigned span |
|---|---|---:|
| 24–61 | two overlapping cars push apart and settle without exploding | 5 |
| 63–90 | a jammed pack digs out and resumes speed | 4 |
| 92–106 | a full pack racing for 10 s never piles off-track or NaNs | 4 |

## `tests/specs/cota-foundation.spec.js`

Only prefix [0,2497) of 7281 bytes: required model list, fixture import, loadCota helper, first terrain/elevation case entry and partial geometry-sampling setup. Cut occurs inside first case before any expect call. Its complete oracle and second day/night case are outside this batch; no COTA result contract is credited here.

| Case source lines | Scenario / contract | Assertion sites in assigned span |
|---|---|---:|
| 22–116 (partial case) | keeps the back-straight crest in place and terrain below the road corridor | 0 |

## Dependencies, production navigation and cleanup

`career-boot.js` uses bare Playwright pages, 844×390, headless boot, deterministic Haas seed 4242, paid catalog-category polling and `awaitTrackBuild` after qualifying. `fixtures.js` supplies failure diagnostics, `racePage` boot and `pageErrors`; its test export may select VM adapter under APEX_VM_PAGE, so imports alone do not establish browser execution. Viewer tests deliberately use a separate document and close their shared page.

LSP resolves `Career` usage across career UI, debug hooks, game, garage, reliability and results; this establishes module wiring, not each hook’s full call chain. `AiDrive.bankGrip` has one production reference in `js/game.js` plus two module references. `Career.settleRound` definition lookup fell back to the module declaration and explicitly left export/caller coverage unverified. No production source was changed.

Keep comments explaining RNG staging, incident bypass and liveness bounds. Repeated multi-paragraph timeout histories could be consolidated while preserving measured constraints. Collision fixture comments still say `./fixtures.js` although imports use the helpers directory; fixture racePage prose still says 10 s beside a 45 s constant. Trailing shard headings in career and career-season are navigation debris rather than test coverage. Cleanup is suggested only; no tests or support files were edited.
