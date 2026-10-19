<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT ui-1 (final)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260329296
- Posted: 2026-10-19T05:25:21Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks
- Normalized (only change to the body): files that do not exist yet (reviewer proposals) are unquoted or written `dir/<new:name>.ext`, so docs-integrity does not read a proposal as a claim: tests/helpers/<new:hud-harness>.mjs

---

REPORT ui-1

Batch ui-1: 56 files, all `tests/unit` (0 specs), 15.8k lines. **Run: 56/56 pass** with `node --test <file>` (0 fail, 0 skipped, single run each, no retries, no flakiness seen; slowest `build-worker` 44 s, `build-steps` 37 s, `deploy-staging-build` 18 s, `hud-survey` 18 s, `a11y-pwa-pass` 17 s under 3-way parallel; the rest < 4 s). SwiftShader box, no browser used. Reads of every test plus its module were split between two read-only Sonnet subagents (28 files each); I ran every file, drove the debugger, and re-checked these claims myself: css-critical-path headroom (measured 233136 B vs 233300 B ceiling), a11y-label-in-name `b.id` filter (read), hud-metrics-layout / css-tokens / hud-control-clearance not executing their code (coverage). The rest, including the `fmtGapSec(9.95)` probe, are reviewer reads.

**Debugger method (said once):** the js-debugger MCP lists Chrome pages only, so it cannot attach to node. I drove the Node inspector over CDP myself (`node --inspect-brk --experimental-test-isolation=none --test`, `Debugger.setBreakpoint` by source-line text because most tests `vm.runInContext` the module with no resolvable URL, condition `console.log('HIT …'), false`). `hit (cdp)` = the logpoint fired N times in the real run. Function-declaration lines in repeatedly re-evaluated vm sources did not fire (e.g. `dock-layout.js:86`, 0 hits although the function runs 31 times), so for those files I fell back to `NODE_V8_COVERAGE` function call counts (`hit (cov)`, matched by function name, so a same-named test-local copy would also count; flagged where that happens). `not-hit` = neither method saw the real code run. Scripts: `artifacts/test-review/ui-1/{cdp.mjs,cov.mjs}` (scratch, not committed).

## Per-file table
| file | purpose (failure means) | run | debugger | quality | mock / wrong-target | verdict |
|---|---|---|---|---|---|---|
| a11y-label-in-name | voice-control: visible text must be in aria-label | pass 3, 0.2s | n.a. (regex over index.html) **finding** | mixed; non-vacuity guard good | `:20` `!/aria-hidden/.test(b.id)` tests the id string, exclusion never applies | keep + fix filter |
| a11y-loading-hint | flyby skip hint ≥4.5:1 contrast | pass 3, 0.3s | n.a. (CSS text) **finding** | mixed | `:24` HINT_OPACITY copied, not read from loading.css; `:47-49` `>= 2` count | strengthen |
| a11y-opts | reduce-motion/focus ring/colourblind settings | pass 8, 0.4s | hit (cdp) a11y-opts.js:52 ×11 | strong behaviour, mixed scans | `:84-88` SettingRow stubbed; holdMode path never reaches Input | keep |
| a11y-pwa-pass | pad pick, landscape lock, install chip, UpdateCheck | pass 35, 17s | hit (cov) pickPad ×18, lockLandscape ×8 | strong in VM parts, weak scans | `:200,:264` indexOf-slice execution; `:166-170` 600-char window regex; `:478-482` real 1.5 s wait + dangling 15 s timer | regroup (3 suites) |
| build-client-drop | build never waits on dead worker | pass 12, 0.3s | hit (cdp) build-client.js:90 ×4 | strong | `:197-207` tests `Tracks.diagnosticBuild`, wrong file; two duplicate harnesses | merge into build-worker |
| build-gallery | gallery tool escapes/refuses/never overwrites | pass 9, 1.8s | hit (cdp) build-gallery.cjs:250 ×5 | strong, real sharp | needs native sharp; spawnSync no timeout | keep |
| build-steps | paced build == sync build, frees on abort | pass 9, 37s | hit (cov) buildSteps ×18, freePartial ×2 | strong (byte-level) | gfx only | keep |
| build-worker | worker world == main-thread world | pass 22, 44s | hit (cdp) build-worker.js:107 ×12 | strong | PitSigns recorder; `:113` heightAt sampler absent compares 0===0 | keep |
| css-comments | broken comment drops next rule | pass 3, 0.3s | n.a. (CSS text) **finding** | mixed | `:56` unterminated comment silently ok; diverges from css-faces copy | merge into css-faces |
| css-critical-path | title paint preload set + byte budget | pass 7, 0.3s | n.a. (manifest data, no function) | mixed | `:259-260` ceiling 233300 vs measured 233136 (164 B headroom) outside ratchets.json | strengthen |
| css-faces | every woff2 has a live @font-face | pass 4, 0.9s | n.a. (CSS text) **finding** | strong (self-test fixture) | none | keep |
| css-has-scope | `:has(> #x)` matches the shell DOM | pass 6, 0.8s | n.a. (HTML/CSS text) **finding** | strong/mixed | `:130` hard-coded allow-list; ad hoc HTML walker | keep |
| css-media-disjoint | landscape/density guards in two sheets | pass 2, 0.3s | n.a. (CSS text) **finding** | mixed | name says "disjoint", nothing checks it | rewrite/rename |
| css-play | css-play CLI contract | pass 11, 0.7s | hit (cdp) css-play.mjs:95 ×2 | mixed | `:132` near-vacuous alternation; `collectDomInfo` never executed | keep, trim greps |
| css-token-adoption | token ratchets + zero-spacing sheets | pass 4, 0.4s | hit (cdp) tree-counts.mjs:241 ×1 | mixed | `KNOWN_ZERO = []` makes it an emptiness check | merge into css-tokens |
| css-tokens | every token has a consumer; pair sheets declare `--pair-at` | pass 3, 0.6s | **not-hit** sheet-shape.js `classifyPair` ×0 (cov) | mixed | `:386-389` text mention stands in for `classifyPair` behaviour; comments count as consumers | strengthen (VM classifyPair) |
| deploy-staging-build | one shell-generation formula, byte parity | pass 6, 18s | hit (cdp) stage.mjs:141 ×3 | strong | `:123-130` pages.yml text pin of another job; GNU `sed -i` | regroup |
| desktop-builder-config | electron-builder config shape | pass 9, 0.2s | n.a. (config object, no function) | strong but change-detector | `:221` exact electron-builder version pin | keep, loosen pin |
| dock-layout | touch dock clamp/zoom/lifecycle | pass 16, 0.4s | hit (cov) apply ×31, clampXY ×138 | strong lifecycle, 1 tautology | `:134-158` copies the subscribe filter into the test; real `create()` subscribe never runs | strengthen |
| font-digits | HUD digits hold still | pass 6, 0.3s | n.a. (ledger JSON + CSS text) **finding** | mixed-strong | `:59` ledger freshness by file name only; `:117,:149` regexes on comment-unstripped CSS | strengthen |
| hud-announce-lane-cache | no getBoundingClientRect per steady tick | pass 4, 0.2s | hit (cdp) hud.js:600 ×298 | strong | `:236` parses V8 `Error().stack` text | keep |
| hud-arrange | ARRANGE HUD editor | pass 25, 0.4s | hit (cov) clashes ×113, setEditing ×53 | strong | `:143-149` fake `layout.set` re-implements prod side effects | keep |
| hud-control-clearance | opt-in readouts clear touch controls | pass 7, 0.2s | **not-hit** hud.js `heightCap` ×0 (extracted via `Function`, real fitHud never runs) | mixed | `:358-386` runs `analyzeOverlap` on hand-made boxes (tool test labelled as game clearance); `:392` re-states the zoom formula | regroup |
| hud-dock-pack | phone dock packing | pass 8, 0.3s | hit (cdp) hud-layout.js:489 ×11 | strong | `:297-308` re-tests `DockLayout.clampXY` (dup of dock-layout) | keep |
| hud-elements | per-element visibility store | pass 10, 0.3s | hit (cdp) hud-elements.js:123 ×43 | strong | `:92` title/assert mismatch | keep |
| hud-feel | in-race HUD feel and fit (54 tests, 1443 L) | pass 55, 1.1s | hit (cdp) hud.js:1876 ×441 | strong VM, brittle CSS pins | `:644-657` `new Function` of a regex-extracted game.js fn; `:1183-1285` 25 asserts in one test; 3rd copy of boot harness | regroup |
| hud-fit-idempotent | fitHud publishes one zoom, no flip | pass 19, 0.5s | hit (cdp) hud.js:1127 ×125 | strong | `:603-643` indexOf-cut slice of hud.js run with a test-side `set()` stub | keep, replace slice test |
| hud-gap-decimals | gap spelling near 1.0 s | pass 5, 0.2s | hit (cdp) hud-readouts.js:40 ×20 | mixed-strong | `:237` fragile fn extraction; 9.95 boundary untested (see F6) | strengthen |
| hud-layout | HudLayout store/sets/fits (1314 L) | pass 52, 0.9s | hit (cdp) hud-layout.js:415 ×32 | mixed-strong | `:18-89` extracts a helper from `tests/specs/hud-layout.spec.js` by regex (tests the spec's harness); `:431` inconsistent rect | strengthen + split |
| hud-metrics-layout | AUTO/forced HUD layout, MAP/GAPS | pass 10, 0.3s | **not-hit** hud.js `resolveMetricsLayout` ×0, `syncHudVisClasses` ×0; only `paintInstruments` ×2 (cov) | weak (≈40 text pins) | `:11-12` raw game.js not `gameSource()`; `:119` "gm" substring guard | rewrite |
| hud-pins | phone-landscape fit pins | pass 3, 0.3s | hit (cdp) hud.js:699 ×34 | strong where live | `:194-218` two `todo` pins for real unfixed bugs; 50-line harness copy | keep + convert todos |
| hud-portrait-cluster | portrait cluster no pile-up | pass 7, 0.2s | n.a. (CSS/JS text + synthetic boxes) **finding** | weak | `:89-103` analyzer on hand-made boxes | delete geometry half |
| hud-radio-slot | BROADCAST radio card = STANDARD slot | pass 2, 0.3s | hit (cdp) hud.js:711 ×6 | strong first test | `:150-154` negative pin of a deleted source line | strengthen |
| hud-readouts | derived HUD readouts | pass 31, 0.6s | hit (cdp) hud-readouts.js:24 ×47 | strong | `AppearanceOpts` fake copies prod rounding; `:172` incomplete write detector | strengthen/keep |
| hud-relative | RELATIVE box selection and fit | pass 16, 0.3s | hit (cdp) hud-relative.js:215 ×49 | strong | `:330-331` `A \|\| B` accepts either remedy | keep, tighten |
| hud-speed-parity | HUD speed == wheel LCD | pass 4, 0.5s | hit (cov) spdDigits ×10413, spdPlate ×5206 (cdp bp unresolved) | mixed | `:38-47` wheel/RETRO consumers only counted by text (`calls.length === 3`); never executed | strengthen |
| hud-status-stack | phone 150% stack no overlap | pass 3, 0.2s | n.a. (CSS/JS text + synthetic boxes) **finding** | weak/vacuous | `:75-109` boxes the author typed | delete/replace |
| hud-strategy | STRATEGY panel rules | pass 8, 0.2s | hit (cdp) hud-strategy.js:71 ×18 | strong | tyre/pit model stubbed (appropriate) | keep |
| hud-survey | HUD survey tool chain (958 L) | pass 49, 18s | hit (cdp) hud-geometry.mjs:122 ×12 | mixed-strong | tools test in UI batch; `:59-62` dead "not on every branch" fallback; 60 s child spawns | regroup |
| i18n-lint | translation lint | pass 13, 0.2s | hit (cdp) i18n-lint.mjs:132 ×10 | strong | `:143` allowlist tripwire; attr coverage (`title/alt/placeholder/innerHTML`) untested | keep |
| i18n | I18n lookup/plural/detect | pass 8, 0.2s | hit (cdp) i18n.js:125 ×12 | strong, narrow | `:44` loads `dom-apply.js`, nothing tests it | strengthen |
| loading-screen-pack-gate | race-entry warm gate | pass 3, 0.3s | hit (cov) packSettled ×10 (cdp bp unresolved) | strong predicate, weak order test | `:58-70` gate ordering pinned by `indexOf` over source, not executed | strengthen |
| meeting-picker-labels | Data Hub GP labels unique | pass 4, 0.2s | **not-hit** js/data/hub.js:688 (never loaded; cov ×1 is the test's own copy) | weak | `:16-32` tests a COPY of `meetingPickerOptions`; `:36-43` fragment regexes only link | rewrite |
| menu-a11y-audit | menu/modal keyboard + AT behaviour | pass 30, 0.5s | hit (cdp) modal.js:209 ×3 | strong | `:84-94` fake UiLayers; `:505-510` export-list pin | keep |
| menu-capture | layout-audit CLI contracts | pass 9, 3s | hit (cdp) audit-diff.mjs:36 ×2 | mixed | `:33-36` only false branch of `cellRecorded`; tool test in UI batch | regroup → tools |
| menu-sentinel-resize | crash sentinel arming, resize coalescing | pass 6, 0.4s | hit (cdp) game.js:1960 ×7 | strong | `:28-37` naive brace counter slices game.js; `:87` dead stub | keep |
| pause-hud-layout | announce banner + pause/HUD CSS grab-bag | pass 10, 0.2s | hit (cov) announce-banner `tick` ×96 | strong banner, weak rest | `:141-150` WebGL context-loss scan unrelated; `:124-138` regex pins on platform-session | regroup |
| pause-key-tools | pause key closes tool layer | pass 9, 0.2s | not-hit as a script: the handler is cut from platform-session.js by text and run in a vm (cov `setPaused` ×3 is the stub) | strong | `:21-26` formatting-dependent anchors; UiLayers.top faked | keep |
| pause-opts | pause menu options + confirm | pass 18, 0.3s | hit (cdp) pause-opts.js:146 ×14 | strong | `:290-312` 15+ CSS rule pins; `:219-231` raw game.js doesNotMatch | keep |
| pause-silence | announcer silent on pause | pass 5, 0.2s | hit (cdp) announcer.js:589 ×5 | strong, 1 vacuous | `:211-217` resume assertion already false; `:158` plain-object garage never notifies; boot copied 3× | keep + fix |
| photo-kit | grids, bookmarks, look session | pass 10, 0.2s | hit (cov) createLookSession ×2, loadAll ×36, marksFor ×6 | strong | `setGrid/mountOverlays/showOverlays` (photo-kit.js:139,154,177) untested | strengthen |
| photo-studio | capture/export/persistence | pass 40, 0.5s | hit (cov) capture ×30, crop ×47 | strong | fake IndexedDB is test-authored | keep |
| quick-validate | quick-validator probe evaluation | pass 5, 0.2s | hit (cdp) quick-validate.mjs:20 ×4; `evaluateLiveProbe` ×4 (cov) | strong | tool test in UI batch | keep → tools |
| screen-looks | per-screen appearance + PEEK | pass 21, 0.6s | hit (cov) core ×126, set ×19 | strong | `:380-389` source-text duplicate of `:283-286`; CSS_ALL concat hides cascade errors | keep |
| select-screen-fixes | re-tap team / unstar circuit bugs | pass 13, 0.3s | hit (cdp) select-screen.js:301 ×4 | strong | TrackMaps/Teams stubbed | keep |
| setting-deps | greys inert settings | pass 9, 1.1s | hit (cov) refresh ×297, val ×2724 | strong data-driven | `:201-208` EXPLAIN id satisfied by any string in js/ incl. comments; `:129` hard-coded exemption | keep |

## Top findings (ranked)
| # | file:line | defect | why it matters | proposed fix | conf |
|---|---|---|---|---|---|
| 1 | meeting-picker-labels.test.mjs:16-32 | tests a pasted COPY of `meetingPickerOptions`; real `js/data/hub.js:688` is never loaded (not-hit) | the function can change and the test stays green; today identical, so it is a drift trap | export a pure helper or slice the real function and test that | high |
| 2 | hud-pins.test.mjs:194-218 | two real unfixed bugs (F-02 radio lane not restored, F-06 collapsed card reopened) marked `todo` | never fail, and a fix would not be flagged (node reports a passing todo as plain pass) | open issues, convert to normal tests when fixed | high |
| 3 | hud-metrics-layout.test.mjs:11-143 | ≈40 text pins on raw `game.js`/`hud.js`; `resolveMetricsLayout` and `syncHudVisClasses` ×0 (not-hit); `:119` "gm" substring guard | AUTO layout resolution that collapses HUD zoom on phones is never executed | VM-test `resolveMetricsLayout` on the hud-pins harness; use `gameSource()` | high |
| 4 | pause-silence.test.mjs:211-217, :158 | "resume must not restart" assertion is already false before the act; garage is a plain object so its observer never fires | pause/garage silence regression would pass | call `play()` after resume and expect true; make garage observable | high |
| 5 | hud-status-stack.test.mjs:75-109, hud-portrait-cluster.test.mjs:89-103, hud-control-clearance.test.mjs:358-386 | `analyzeOverlap` run on rectangles the author typed; no game code runs | named as proof a layout fix holds; it proves the analyzer, not the HUD | delete; assert published vars (`--hud-gaps-b`, `--hud-cluster-y`) from the pins harness | high |
| 6 | hud-gap-decimals.test.mjs:220-228 | width-stability probes 9.99 and 9.94 but not the 9.95 boundary: reviewer probe says `fmtGapSec(9.95,"standard")`→"9.9" (3 chars), 9.949→"9.95", 9.951→"10.0" (hud-readouts.js:40) | 1-char wobble at the boundary the test claims to rule out | add 9.95/9.949/9.951 cases; decide the rounding | medium (reviewer probe, not re-run by me) |
| 7 | dock-layout.test.mjs:134-158 | copies the store.subscribe filter (dock-layout.js:306-318) into the test; `bootCreate` store has no `subscribe` | real create() subscribe path never runs; tautology | give bootCreate a store with `subscribe`, drive it | high |
| 8 | css-critical-path.test.mjs:259-260 | blocking CSS measured 233136 B vs ceiling 233300 B (164 B headroom, verified); ceiling is a hand-bumped constant in the test | next small menus.css edit fails with a message that invites bumping | move to `tests/data/ratchets.json` with slack policy | high |
| 9 | hud-layout.test.mjs:18-89 | extracts a helper from `tests/specs/hud-layout.spec.js` by regex and runs it | tests the spec's own harness; breaks on any spec reformat | move to the spec/helper module or delete | high |
| 10 | hud-fit-idempotent.test.mjs:603-643 | `indexOf`-cut slice of hud.js run with a test-side `set()` stub | renamed marker runs the wrong slice; stub decides the outcome | express through the existing flip harness | high |
| 11 | a11y-label-in-name.test.mjs:20 | `!/aria-hidden/.test(b.id)` tests the id string, not attributes (index.html has 6 buttons with an aria-hidden attribute) | intended exclusion is dead. Separately, 9 files are pure text scans with no debugger target (a11y-label-in-name, a11y-loading-hint, css-comments, css-faces, css-has-scope, css-media-disjoint, font-digits, hud-portrait-cluster, hud-status-stack) | read attrs; label scans as scans | high |
| 12 | hud-speed-parity.test.mjs:38-47 | wheel LCD and RETRO paths only counted as text (`calls.length === 3`) | the +28 skew in its own header would pass the unit test | drive the drawers with a 2D-context spy | high |
| 13 | i18n.test.mjs:44, photo-kit.test.mjs | `dom-apply.js` loaded but untested; `boot("de")`, 404 fallback, RTL untested; `setGrid/mountOverlays/showOverlays` untested | shipped code with no test | add cases | high |
| 14 | css-tokens.test.mjs:386-389 | text mention of `--pair-compact` stands in for `classifyPair` (sheet-shape.js:74, ×0) | pair-sheet behaviour (season setup unscrollable at 844×390) not executed | VM-run `classifyPair` with stubbed getComputedStyle | high |
| 15 | loading-screen-pack-gate.test.mjs:58-70 | warm-gate ordering is `indexOf` over source text | the 11-13 s main-thread stall guard is not behaviour-tested | execute the gate fragment in a vm | medium |

Smaller items worth a ticket: hud-relative.test.mjs:330-331 (`A || B` accepts either remedy), dock-layout/hud-dock-pack duplicate `clampXY` tests (hud-dock-pack.test.mjs:297-308), build-client-drop.test.mjs:197-207 tests `tracks.js`, a11y-pwa-pass.test.mjs:478-482 (real-time wait + 15 s dangling timer), font-digits.test.mjs:59,117,149 (name-only ledger, comment-unaware regex), css-comments/css-faces divergent `stripComments` copies, hud-announce-lane-cache.test.mjs:236 (stack-text parsing), hud-survey.test.mjs:59-62 (dead branch), menu-capture.test.mjs:33-36 (only the false branch).

## Cross-cutting
- The HUD boot harness (mini-dom + stub G, ≈50 lines) is copied in hud-pins, hud-radio-slot, hud-readouts, hud-feel, hud-fit-idempotent, hud-announce-lane-cache: one `tests/helpers/<new:hud-harness>.mjs` would remove 5 copies and make findings 3, 5 and 12 cheap to fix.
- ≈10 of 56 files carry large CSS/JS text-regex blocks that stay green while the cascade or code path is wrong (hud-layout, hud-metrics-layout, hud-portrait-cluster, hud-status-stack, pause-hud-layout, pause-opts, hud-feel).
- Four files test tools, not the game (hud-survey, menu-capture, quick-validate, css-play): regroup into the tooling group.
- Grab-bag files to split: a11y-pwa-pass (input pads / PWA update / install), pause-hud-layout (banner / CSS / context loss), hud-feel (1443 L, 54 tests).

## Gaps (check with `grep -l` before pass 2)
- `hud.js` `resolveMetricsLayout` / `syncHudVisClasses` (AUTO layout) never executed in this batch.
- `sheet-shape.js` `classifyPair`; `js/core/dom-apply.js`; `PhotoKit.setGrid/mountOverlays/showOverlays`; `HudLayout` portrait path in `fitHud`; wheel LCD / RETRO speed drawers.
- `I18n.boot("de")`, 404 fallback, manifest hash mismatch, `dir=rtl`; `guardSource` attrs other than textContent/aria-label/Dom.el.
- `DockLayout.create()` store subscription, `resetCurrent`; `announceLaneLayoutKey` fields other than tyre margin; `packPhoneRects` announce/map/tower branches.
- `build-client` `_last` memo sharing; `build-worker` `adoptTeam` fallback, `startFrac` carry-back; `collectSurveyBranchShots`.
- Gamepad axis path in MenuNav; `Input.setHoldMode` receipt in a11y-opts.

## Not run
- Specs: none in this batch. All 56 unit files run once with `node --test`.
- Debugger: no file used the js-debugger MCP (cannot attach to node); CDP/coverage substitutes above. Pure text scans have no code target (flagged as findings; 9 files, plus css-critical-path and desktop-builder-config which are data-only).
- Not independently re-verified by me (reviewer reads): line-level defects in rows other than those named in my first paragraph.

Pass 1 only: no repo edits, no commits.

---
_Generated by [Claude Code](https://claude.ai/code)_
