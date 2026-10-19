<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT tooling-2 (final)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260857784
- Posted: 2026-10-19T06:08:57Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks
- Normalized (only change to the body): files that do not exist yet (reviewer proposals) are unquoted or written `dir/<new:name>.ext`, so docs-integrity does not read a proposal as a claim: js/circuits/<new:x>.js

---

REPORT tooling-2

Batch tooling-2: 67 files, all `tests/unit/*.test.mjs` (0 specs, ~15.9k lines). **Run: 67/67 pass** with `node --test <file>`, 0 fail, 0 skipped, no retries, no flakiness seen (single run each). Slowest: `cover-legibility` 192 s, `coplanar-faces` 173 s (rebuilds every circuit in a child CLI), `classification-vm` 37 s, `dev-tools-vm` 28 s, `deploy-tool` 24 s, `episode-transients` 22 s, `ci-coverage` 18 s; the rest < 12 s. Method: both halves read in full (test plus module under test) by two read-only subagents; I ran every file, drove the debugger, and re-verified the top findings on the tree (cvd-palette:225, deploy-tool:61 + deploy.mjs:133, flaky-quarantine:200-221, fill-gating:95, dev-tools-vm:262 read directly; duel-row confirmed by the debugger).

**Debugger method (said once).** The js-debugger MCP lists Chrome pages only (#2957), so I drove the Node inspector over CDP: `node --inspect-brk=<port> --experimental-test-isolation=none --test <file>`, a ws client sets breakpoints and counts `Debugger.paused.hitBreakpoints`.
- `hit (cdp)` = `setBreakpointByUrl` on a real module URL.
- `hit (cdp,vm)` = code evaluated by `vm.runInContext`: `beforeScriptExecution` instrumentation pause, then `setBreakpoint` on the line matching a function-declaration text. Counts are across all boots.
- `hit (coverage)` = code runs in a child process; `NODE_V8_COVERAGE` shows its functions executed (no line attribution). I did not use `NODE_OPTIONS=--inspect=0` because the harness cannot collect the children's hits.
- Gotcha for other reviewers: a conditional breakpoint whose condition is `console.log(...)` silently reports zero hits for every `vm`-sandboxed file, because `console` does not exist in those contexts. Counting `hitBreakpoints` instead fixes it.
- "hit" means the function ran during the test, not that a specific assertion's branch did.

## Per-file table
Quality: S strong / M mixed / W weak / V vacuous parts. "Mis-batched" = not tooling (belongs in the named batch).

| file | purpose | run | debugger (code under test) | quality | mock / wrong-target | verdict |
|---|---|---|---|---|---|---|
| chunked-index-ranges | GLX chunked mesh uploads correct per-chunk index ranges (torn geometry) | pass 13, 1s | hit (cdp,vm) chunked.js:300 ×12 | S L153-388; W L406-453 | draw-loop guards are regex on source; L465 silent `return` on Uint32; GL stubbed. Mis-batched (render) | strengthen |
| ci-coverage | CI workflow gating wiring (select gate, pages, gpu-census) | pass 69, 18s | hit (cdp) ci-coverage.mjs:164 ×1 only; the other tests run bash/regex (no JS bp possible) | M (shell-in-tmp-repo half S, regex half brittle) | L68-92 title says "floor 3", pins exact 12-spec array, `FIXED_BLOCKING_FLOOR` dead; L131 `split("\n  job:")` TypeErrors instead of asserting | split into ≥4 files; fix L68-92 |
| ci-guard-tools | ci-rerun decide(); cancel-on-close group | pass 4, 0s | hit (cdp) ci-rerun.mjs:42 ×10 | S L14-35; M L37-55 | L46 first `group:` regex hit may not be the top-level group | keep |
| ci-pr-base | PR diff base = merge first parent; reuse-draft-fast fail-safe | pass 4, 2s | hit (coverage) ratchets.mjs copy (58 fns); bash n.a. | S | real bash/git in tmp repos, `gh` stub; fine | keep |
| ci-verdict | required-check aggregator fails hollow PRs | pass 12, 1s | hit (cdp) ci-verdict.mjs:34 ×19 | S | L134 `split(...)[1]` TypeError if job renamed | keep |
| class-usage | every CSS class used has a rule/query | pass 3, 2s | hit (cdp) class-usage.mjs:173 ×3 | M (anti-vacuity >300 good) | "queried" is a text match | keep |
| classification-vm | FIA B2.5 classification, 90% rule, points | pass 11, 37s | hit (cdp,vm) race-control.js:175 ×11, game.js:2854 ×11 | S | state set by mutation, not driven. Mis-batched (race) | keep |
| cli-args | unknown flags rejected | pass 5, 0s | hit (cdp) cli-args.mjs:51 ×8 | S | L53-54 `typeof fn` noise | keep |
| clipboard | copy fallbacks, textarea cleanup | pass 10, 0s | hit (cdp,vm) clipboard.js:62 ×8 | S | L52 no-op `h.ApexClipboard; // seeded` + stale comment; L76-81 text scan duplicates shell guards. Mis-batched (core) | keep, trim |
| coach-clone | jsonClone == JSON round trip | pass 17, 0s | hit (cdp,vm) driving-coach.js jsonClone ×80 | S (oracle is JSON) | function lifted by `indexOf` slice; fails loudly | keep |
| comment-citations | file:line citations in comments in range | pass 2, 5s | n.a. (espree scan, no code under test) | M | CITATION_CEILING=0 makes L187 degenerate and L194-202 permanently `t.skip` | simplify to one zero-citation assert |
| committed-images | no stray/large images in git | pass 4, 0s | n.a. (`git ls-files` policy scan) | S for purpose | missing file passes (`catch s=0`) | keep |
| component-inventory | docs/COMPONENTS.md names every class family | pass 4, 2s | n.a. (text scan) | M | L72 dead-class by substring `includes`; second CSS parser beside class-usage | merge into class-usage / word-boundary |
| conflict-cure | merge cure keeps both sides' hand edits | pass 4, 0s | hit (cdp) conflict-cure.mjs:32 ×5, :76 ×4, :101 ×1 | S | L108-111 re-asserts git's own --theirs behaviour | keep |
| contact-geometry | car-car SAT/sweep/impulse, resolveCollisions | pass 15, 0s | hit (cdp,vm) contact-geometry.js:88 ×122 | S | L150 `a.x<0 \|\| a.prog!==0` disjunction. Mis-batched (physics) | keep, tighten L150 |
| controller-profiles | per-device gamepad profile persistence | pass 9, 0s | hit (cdp,vm) controller-profiles.js:38 ×64 | S | dense one-liners. Mis-batched (input) | keep |
| coplanar-faces | z-fight spot ratchet per circuit | pass 6, 173s | **not checked** (run not completed under the inspector; sweep is a child CLI) | S | OVERHEAD_BASELINE={} L290; ~170 lines of stale header narrative. Belongs in test:sweeps | keep |
| cover-legibility | every cover design legible on every team | pass 1, 192s | **not checked**: bp on crest-sweep.mjs:278 stalled the 192 s run >8 min, killed | S (measured floors) | base colour approximated; only livery [0]. Mis-batched (car) | keep |
| coverage-merge | coverage merger / lcov | pass 6, 0s | hit (cdp) coverage-merge.mjs:55 ×20, :117 ×2 | S | L108-118 mutates env, not restored | keep |
| cross-file-paths | relative imports resolve | pass 9, 11s | hit (cdp) cross-file-paths.mjs:70 ×2904, :116 ×3 | S (anti-vacuity) | none | keep |
| cross-tool-guards | Cursor/Codex hooks reach same guard; pre-push | pass 6, 2s | n.a. for JS (code under test is bash hooks in temp repos) | S behavioural | pre-commit gate only via fixture `bin/npm` stub | keep |
| curvature-channels | every Tracks.curvature reader classified | pass 3, 1s | n.a. (regex scan of js/**) | M (intentional ratchet) | SITES hand-copied; alias regex misses `{curvature: c}`/`["curvature"]` | keep; AST-based |
| cvd-palette | colour-blind palettes distinguishable, inks 4.5:1 | pass 8, 0s | hit (cdp,vm) cvd-palette.js:125 ×268 | M-S | **L225 tautology** (finding 3); L113 `\|\| lin[2]===0`. Mis-batched (UI) | strengthen |
| daily-challenge | daily plan deterministic per UTC day, streak | pass 13, 0s | hit (cdp,vm) daily-challenge.js:90 `record` ×24; `plan` :28 bp reported 0 hits (default-param signature) though plan runs under every assertion | S | L217-218 negative source scan; wall-clock `dayKey()` flake risk at UTC midnight. Mis-batched (race) | keep |
| damage | display-only damage + contract physics never reads it | pass 12, 0s | hit (cdp,vm) damage.js:74 ×41 | S L25-158; M contract | L178 regex catches only `c\|a\|b` params. Mis-batched (race/UI) | keep, AST L178 |
| day-sky-palette-storm-deck | day sky blends palette, storm deck darker | pass 3, 0s | **n.a. — pure regex scan (finding 7)** | W | `/fogSun/` and `>= 0.45)` satisfiable by comments. Mis-batched (lighting) | rewrite as VM test or delete |
| debug-chrome | debug-chrome args, refuses under load | pass 7, 0s | hit (cdp) debug-chrome.mjs:26 ×3 | S | `status` reads real state dir | keep |
| deep-link | `?go=` shortcuts open title doors once | pass 8, 0s | hit (cdp,vm) deep-link.js:7 ×23 | S | reads real manifest. Mis-batched (UI) | keep |
| delta-sign-colour | positive delta = slower colour | pass 3, 0s | **n.a. (regex over css/js)** | W-M | L36 `color:` regex also hits `background-color`; L45-50 pins comment prose; JS sign never executed. Mis-batched | strengthen (run delta in VM) |
| deploy-pr-rest | deploy --pr REST fallback, token off argv | pass 4, 0s | hit (cdp) deploy.mjs:702 ×3 | S L56-120 | L83-89 expected title from real repo refs (finding 10) | keep, fix oracle |
| deploy-staging | everything the browser fetches is staged | pass 7, 1s | hit (cdp) stage-files.mjs:1 (module load only) + bump-cache child | S L135-172; M rest | `referenced()` covers `vendor/` only, not assets/worker URLs | strengthen / merge with deploy-stamp |
| deploy-stamp | pages.yml stamps, bump-cache SRI | pass 8, 1s | hit (coverage) bump-cache.mjs (283 fns, child CLI) | S CLI tests; M regex pins | `poll-live-shell` `/Date\.now\(\)/` matches anything | keep |
| deploy-tool | deploy.mjs protocol logic | pass 33, 24s | hit (cdp) deploy.mjs:267 ×11, :348 ×7, :393 ×15, :143 ×4 (:455 not hit at line level; test runs it in a child tree) | S overall | **L61-65, L137-141 vacuous** (findings 2, 4); regex scans of ci.yml/deploy.mjs L463-570 | split 3 ways; fix vacuity |
| desktop-app-protocol | app:// MIME, byte ranges, safe path | pass 5, 0s | hit (cdp) app-protocol.js:126 ×16, :108 ×10, :79 ×6 | S L30-75; **V L94-97** | L89 pins Electron "44.4.5"; handleScheme never executed. Mis-batched (desktop) | strengthen |
| desktop-native | Electron/web shell security contracts | pass 13, 0s | hit (cdp) permissions.cjs:63 ×1 | M-S | L21-65, L111-146 regex pins; duplicated by followup-platform and desktop-unpacked-bin | strengthen |
| desktop-pack-dry-run | pack:test inputs resolve | pass 3, 10s | hit (cdp) pack-dry-run.mjs:36 ×2 | S (happy path) | no negative case: dry-run returning [] fails only on `checked>=15` | strengthen |
| desktop-stage | staged site complete, stamp, guards source dirs | pass 6, 2s | hit (cdp) stage.mjs:99 ×4, :66 ×9 | S | L47-48 regex for `dereference: true` instead of symlink fixture | strengthen |
| desktop-unpacked-bin | find Electron unpacked binary | pass 5, 0s | hit (cdp) unpacked-bin.mjs:25 ×3 | M (L16-68 S; L70-96 W) | L70-88 duplicates desktop-native L131-146; L90-96 pins prose doc | merge workflow asserts into desktop-native |
| destructure-usage | scripts destructure only exported globals | pass 3, 7s | hit (cdp) destructure-usage.mjs:72 ×8 | S (floor `checked>20`) | none | keep |
| dev-tools-vm | `__apex` JSON surface | pass 54, 28s | hit (cdp,vm) apex.js:1264 ×3 | M | **`typeof x==="number"` accepts NaN** L262/274/281/347/398 (finding 5); `virgin()` L31 picks boot by `fn.toString().includes(".race(")` | strengthen |
| diagnostics-tools | MCP diagnostics facade args/paths | pass 8, 0s | hit (cdp) diagnostics.mjs:23 ×59, :50 ×3, :120 ×2 | S | L21/35/51-57 `assert.throws` without message over 8+ inputs (finding 12) | strengthen |
| director | TV director cuts, ownership, ticks | pass 21, 1s | hit (cdp,vm) director.js:47 ×37, :171 ×247 | S | L158-161 CAM_MODES pin duplicated in extra-rigs; L358-368 game.js text ordering. Mis-batched (camera) | keep |
| dirty-air | wake/dirty-air model vs baselines | pass 5, 0s | hit (cdp,vm) consts.js:305 ×14 | M-S | L25-26 TOW/DF copied (finding 11). Mis-batched (physics) | strengthen |
| docs-integrity | docs name files/counts/tools that exist | pass 39, 3s | n.a. mostly (text scan); hit (cdp) deploy.mjs:1 = import only | M | claim loops without match floor (finding 8); L1047-1073 pins a one-time prose decision (#1637) | strengthen; delete L1047-1073; split |
| droplets-spray | rain-lens droplets / wet-spray gating | pass 11, 1s | hit (cdp,vm) droplets.js:194 ×3725 | S; W L174-179 | L174-179 regex on game.js call text. Mis-batched (fx) | keep |
| duel-row | DUEL row OFF/rival/legends round trip | pass 12, 0s | hit (cdp,vm) race-settings.js:75 `duelValue` ×2; **chooseDuel :434 NOT hit** | M (round trip circular) | **`pick()` L29-34 is a hand copy of chooseDuel** (finding 6). Mis-batched (race UI) | rewrite round trip; merge with duel |
| duel | duel rival harder in racecraft; legend duel ratings | pass 10, 0s | hit (cdp,vm) duel.js:134 ×19 | S | DriverRatings stub (declared); 0.9695/1.030 copied game numbers. Mis-batched | keep; merge duel-row |
| engineer | race engineer radio ladder | pass 46, 0s | hit (cdp,vm) engineer.js:250 ×63, :484 ×1122 | S | L533 `keys.length===37`; L474-477 regex duplicates L411-420. Mis-batched (race) | keep |
| environment-json | Cursor bootstrap/MCP allowlist; SessionStart hook branches | pass 3, 0s | n.a. for JS (code under test is `session-start.sh`, bash, run as child with stub node/npm) | S for hook; data-equality elsewhere | server list pinned twice (L33-39, L114-117); L103 allows `/usr/bin`, `/bin` prefixes | keep |
| episode-transients | per-car fields do not survive `__apex.reset()` | pass 3, 22s | hit (cdp) episode-diff.mjs:64 ×2 | S intent | **no positive control** that episodeLeaks reports a planted leak (finding 9) | strengthen |
| evaluate-scope-lint | lint blocks Node-closure captures in page.evaluate | pass 10, 1s | hit (cdp) evaluate-scope-lint.mjs:72 ×168 | S | L91-109 `t.skip` when commit 58614db2 missing (always in shallow CI) | keep |
| event-journal | per-race event log edges | pass 4, 0s | hit (cdp,vm) event-journal.js:44 ×318 | M | L89-98 kinds/key-presence only, not payloads (finding 13). Mis-batched (race) | strengthen |
| extra-rigs | RIVAL/PITWALL/DRONE rigs | pass 10, 0s | hit (cdp,vm) extra-rigs.js:43 ×14 | M-S | L51-59 CAM_MODES pin duplicates director; tickPitAuto stub indices differ from real; L61-74 stale comment. Mis-batched (camera) | strengthen |
| f1-dev-tools | plugin in-page API (inspect/restore/compare) | pass 4, 9s | hit (cdp,vm) browser.js:116 ×11; (cdp) compare.mjs:23 ×3 | S L15-140; W L160-188 | L173-187 pins nine English phrases + version `0.4.0`; absolute `/workspace` path | strengthen; relax prose pins |
| field-lod | rival LOD tiers, caps, flap baking | pass 18, 1s | hit (cdp,vm) field-lod.js:107 ×15 | S; W L157-180, L384-420 | exact game.js/car-draw.js/tlx.js source regexes; indentation-coupled eval of tlx.js slice. Mis-batched (car) | split source pins out |
| fill-gating | garage greys out colour rows a design can spend | pass 4, 9s | hit (cdp,vm) liverytex.js:1542 ×3681 | S design; **latent vacuity L95, L113** | `if (!fillInert) continue;` with no counter (finding 15). Mis-batched | strengthen |
| fin-design | tail/fin/spine livery designs | pass 38, 12s | hit (cdp,vm) liverytex.js:1635 ×140, car3d.js:127 ×45 | S; W L164-183, L478-488 | **L892 `if (!out.crown) continue;`**; 931 lines, mixed concerns. Mis-batched (car) | strengthen; split |
| fixture-consumer-audit | specs keep importing the shared fixture | pass 5, 0s | hit (cdp) fixture-consumer-audit.mjs:53 ×3 | S | L8-14 regex pin of fixtures.js internals (browser concern) | keep |
| flake-tally | nightly flake tally / issue sync | pass 23, 0s | hit (cdp) flake-tally.mjs:99 ×2, :251 ×5, :303 ×2 (:419 not hit) | S | spawn/fetch faked via hooks (good); workflow yaml pinned | keep |
| flaky-quarantine | flaky policy: retry-pass red unless quarantined | pass 13, 3s | hit (cdp) flaky-policy.mjs:40 ×22 | S policy; **time bomb L200-231** | asserts the LIVE ledger rows (finding 1) | rewrite L200-231 |
| fleet-board | backlog `claimed` label derivation | pass 9, 0s | hit (cdp) fleet-board.mjs:57 ×2, :45 ×3 | S | `main()`/--apply path not run | keep |
| flicker-metric | z-fight flicker gate metric | pass 14, 0s | hit (cdp) flicker-metric.mjs:118 ×9, :151 ×4 | S (percolation argument) | structural sanity thresholds | keep |
| followup-platform | iOS nudge, desktop main.js, sw.js offline | pass 8, 0s | hit (cdp,vm) main.js:34 ×1, sw.js:841 offline ×7 | S | three unrelated subjects; `section()` L10 has no found-assert | split into 3 |
| followup-update-check | update-check hang/recovery | pass 5, 0s | hit (cdp,vm) update-check.js:111 ×18 | S | stop()/checkController uncovered. Mis-batched (UI) | keep |
| forecast | weather forecast timeline/uncertainty | pass 11, 0s | hit (cdp,vm) forecast.js:149 ×7145 | S | L95, L263-268 source regex pins. Mis-batched (race) | keep |
| fov-fit | camera FOV fit portrait floor/landscape identity | pass 8, 0s | hit (cdp,vm) fov-fit.js:47 ×63 | S | `oldCapOnly` legacy oracle (documented); L102-117 text pins. Mis-batched (camera) | keep |
| front-wing-decal | front-endplate decal stays on the plate | pass 3, 6s | hit (cdp) car-body-geom.js:168 ×83; (cdp,vm) car-mesh.js:34 ×41 | S main; **V L105-119** | no vertex count; `try{...}catch{continue}` L74. Mis-batched (car) | strengthen |

## Top findings (ranked)
| # | file:line | defect | why it matters | proposed fix | conf |
|---|---|---|---|---|---|
| 1 | flaky-quarantine.test.mjs:200-231 | asserts the LIVE ledger: `FILE.quarantine[0]` owner/evidence/expires (L201-208) and the menu-baseline row with `expires === "2026-10-23"` (L220) | the ledger tells you to retire rows; doing so (or expiring one) throws a `TypeError` at L218 (`row` undefined) or shifts `[0]`, turning the unit gate red on unrelated PRs | rewrite against temp-dir fixture ledgers like L233-246 already does | high (read) |
| 2 | deploy-tool.test.mjs:61-65 | `touchedCircuits("HEAD~1")` returns `[]` when git diff fails (`changedPaths(...) \|\| []`, deploy.mjs:133); test only does `isArray` + an empty `for` | in a depth-1 clone it asserts nothing; the function that routes which sweeps run has no real assertion | temp repo with a known `js/circuits/<new:x>.js` commit; assert exact ids | high (read both) |
| 3 | cvd-palette.test.mjs:225 | `assert.equal(rows.size, 0)` where `rows = new Map()` (L187) is never written anywhere in the file | cannot fail; reads like a UI-row check but isn't | delete or assert on rows AppearanceOpts really builds | high (grep-confirmed) |
| 4 | deploy-tool.test.mjs:137-141 | `preflight()` only checked to be an array of strings | preflight refusals (dirty tree, wrong branch) are the push safety function and none is asserted | stub git state in a temp repo; assert named refusals | high |
| 5 | dev-tools-vm.test.mjs:262,274,281,347,398-399 | `typeof x === "number"` accepts NaN/Infinity | the `__apex` probe/physState/scan surface agents rely on can go NaN with green tests | `Number.isFinite`; dedupe L123-127; explicit `{race:true}` for `virgin()` | high (L262 read) |
| 6 | duel-row.test.mjs:29-34,56-65 | round trip runs on a hand-copied `pick()`; debugger shows `chooseDuel` (race-settings.js:434) **not hit** in the whole file (only `duelValue` :75) | picking a legend could race the wrong rival with all 12 tests green | drive the real handler via `create(G)` with a fake G; merge with duel.test | high (debugger-confirmed) |
| 7 | day-sky-palette-storm-deck.test.mjs:9-26 | whole file is regex on atmosphere.js and shader text; nothing executed | no sky or storm-deck behaviour verified; `/fogSun/` and `>= 0.45)` satisfied by a comment | VM-load atmosphere.js and assert day/storm outputs, or delete if a lighting spec covers it | high |
| 8 | docs-integrity.test.mjs:345-347,554-557,570,1023-1041; :1047-1073 | claim-scanning loops have no minimum-match floor; L1047-1073 pins a one-time prose decision (#1637) | a doc rewording makes the guard silently check nothing (the file's own L643-658 describes this failure and fixes only matTexMix); L1047 fails on any reword | add `seen >= 1` per loop; delete the decision pin | med-high (subagent read) |
| 9 | episode-transients.test.mjs:34-44 | no positive control that `episodeLeaks` reports a leaked field | if `snapshot()` returned no per-car keys both track tests pass; the determinism guard could be dead | plant `cars[i]._leak = n` once and assert it is reported | med |
| 10 | deploy-pr-rest.test.mjs:83-89 | expected PR title computed from the real repo's git refs; `.find(Boolean)` can be `undefined` in shallow/detached CI | oracle depends on environment | temp repo with a trailing merge commit, `openPrRest` with cwd | med |
| 11 | dirty-air.test.mjs:25-26 | TOW constants and `DF = 0.65` copied into the test | "CLASSIC bit-compatible" can be false in-game while green | read from `PhysicsConsts.DOWNFORCE`, pin game.js TOW_* | med |
| 12 | diagnostics-tools.test.mjs:21,35,51-57 | `assert.throws` without class/message over 8+ invalid inputs | an unrelated `TypeError` from a bug satisfies it | match expected error text | med |
| 13 | event-journal.test.mjs:89-98 | asserts event kinds exist and `"pos" in e`, not values | wrong pos/gain/sev payloads pass | assert field values and ring eviction at CAP 256 | med |
| 14 | desktop-app-protocol.test.mjs:89,94-97 | `existsSync` of an already-`require`d module and an always-true `startsWith("file:")`; pins Electron `"44.4.5"`; `handleScheme` (206/416/traversal) never executed | tautologies plus a copied constant that reds on a routine bump | delete L94-97; add handleScheme test with a fake electron | high |
| 15 | fill-gating.test.mjs:95,113; fin-design.test.mjs:892; front-wing-decal.test.mjs:105-119 | `continue` guards or empty loops with no counter | if `fillInert` always returned false, no team painted a crown, or `isFrontPlate` matched nothing, each passes vacuously | count combos/vertices measured and assert > 0 | med |

Below the cut: ci-coverage.test.mjs:68-92 (title says "floor 3", pins an exact 12-spec array, floor constant dead; any legitimate spec change reddens it), component-inventory:72 substring dead-class check, damage:178 regex only catches params named c/a/b, comment-citations:194 permanently skipped test, chunked-index-ranges:406-453 regex draw-loop guards plus a silent Uint32 `return` at :465, delta-sign-colour:36.

## Source-text-only files (debugger `n.a.`, reported as findings per the rubric)
day-sky-palette-storm-deck, delta-sign-colour (JS sign never executed), comment-citations, component-inventory, curvature-channels, committed-images (repo policy), docs-integrity (text scan; only the ladder/gate imports execute). cross-tool-guards and environment-json are `n.a.` because the code under test is bash hooks. Large source-regex blocks inside otherwise behavioural files: ci-coverage, chunked-index-ranges L406-453, field-lod L157-180/L384-420, desktop-native L21-65/L111-146, droplets-spray L174-179, fov-fit L102-117, director L358-368, forecast L263-268, deploy-tool L463-570.

## Gaps (untested behaviour)
- `desktop/app-protocol.js` `handleScheme`/`registerScheme`: the 206/416/traversal handling is never run (only pure helpers are).
- `tools/ci/deploy.mjs`: `openPr`, `gateOnly`, `main` flow and `preflight` refusals have no behavioural test; `mergeDeployTip` runs in a child so its line is not attributable.
- `packDryRun` negative paths (missing icon → `problems`), `stampStaged` hash determinism, darwin branch of `findUnpackedBinary`.
- `flake-tally` `listAllRuns` (:419) not hit; `fleet-board` `main()/--apply`; `ci-rerun.decide()` with null `pull_requests` / schedule events.
- `daily-challenge` class `!== "open"` selection; `update-check` `stop()`/`checkController`; `controller-profiles` `__proto__` keys.
- `evaluate-scope-lint` false-negative classes (aliases, shadowing); the real-file regression case is skipped in shallow CI.
- No positive control that `episodeLeaks` detects a leak (finding 9) and none that `diagnosticPlan` rejects for the right reason (finding 12).
- Consolidation candidates: class-usage vs component-inventory (two CSS class parsers); desktop.yml asserts in desktop-native vs desktop-unpacked-bin; CAM_MODES order pinned in director and extra-rigs; duel vs duel-row; deploy-staging vs deploy-stamp (same bump-cache fixtures). Oversized: ci-coverage (2144 lines, 6+ concerns), deploy-tool (807), docs-integrity (1073), fin-design (931).
- **Mis-batching:** about half (~32 of 67) are game, render, camera, car, UI or desktop unit tests, not tooling (flagged per row). Move to race/physics/render/ui batches for pass 2.

## Not run / caveats
- All 67 files were run and passed. Debugger not completed for 2 files: `cover-legibility` (breakpoint on crest-sweep.mjs:278 stalled the run >8 min, killed) and `coplanar-faces` (not re-run under the inspector). Also not instrumented: the `coplanar-faces` sweep CLI, and bash in ci-pr-base / cross-tool-guards / environment-json (ratchets.mjs and bump-cache.mjs hits are coverage-based).
- `daily-challenge` `plan` (:28) bp reported 0 hits although `record` (:90) hit 24 times and `plan` runs under every assertion; likely the default-parameter signature position. Treat `plan` as exercised, not line-verified.
- "hit" proves the function ran, not that a given assertion's branch did. No mutation testing.
- Subagent read claims not individually re-verified by me: findings 8-13 and the gap bullets. Findings 1-7, 14 (cvd, deploy-tool, flaky-quarantine, dev-tools-vm L262, fill-gating L95) were checked on the tree or with the debugger; finding 6 by the debugger.

---
_Generated by [Claude Code](https://claude.ai/code)_
