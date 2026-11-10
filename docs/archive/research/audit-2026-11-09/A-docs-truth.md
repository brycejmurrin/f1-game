# Docs truth and drift (sibling A)

Verbatim report as received on 2026-11-10 UTC (audit of commit e8082307). Rows that describe unpatched security or gate-bypass detail are withheld from this public repo at the owner's request.

AUDIT docs-truth part 1/5

# AUDIT docs-truth — Apex 26 @ e80823076a2413edfe4edfd68ce58b5d793b6904

Slice: docs truth, drift and contradictions across the whole tree. Method: the repo's `total-audit` workflow, plus
23 of my own full-read subagents (one or two per doc), plus 17 independent re-check passes that were given only
`file:line — claim`. A row is VERIFIED only when that second reader (or I, by command) confirmed it. Nothing in the
repo was changed outside `scratch/`. Per-doc reader reports with every row (about 280 KB, including the ~330 single-reader P3 rows summarised in
DT-77) and the verdict log are in this session's container under `scratch/audit/docs-truth/`; they are not
attached because of size. Ask this session (it stays resumable) if any per-doc report is wanted.

Model note: the coordinator relayed "all subagents on Opus" at 01:41Z. The first 18 readers had already run on
Sonnet (all finished or within a minute of it) and were kept; every agent launched after that, and every remaining
workflow agent, ran on Opus. Seven workflow finders that had already completed on their original tier were kept
from cache.

## 1. Summary

- The docs are a large, mostly agent-written reference (1,053 files under `docs/`, 196 more under `.claude/`). The
  **generated** parts are sound: TESTING-COVERAGE, the ARCHITECTURE module index, NOTES-INDEX, tools/README,
  the slider table and the Cursor rule twins all pass their `--check`. The **hand-written** prose around them has
  drifted badly: across ~3,900 claims checked, roughly 520 were false, and second readers confirmed 236 of the 244
  they re-checked (8 refuted or corrected, listed at the end of section 2).
- Numbers and constants in the domain docs (PHYSICS, CAREER, MULTIPLAYER, LIGHTING knob tables, TRACK-DESIGNER)
  are overwhelmingly right. What is wrong is location (functions "in game.js" that moved out), counts (40 circuits
  vs 52, three.js r186 vs 0.187.0), status ("pending" work that shipped), and process text.
- The most harmful class: **docs and skills that instruct an agent to do what AGENTS.md forbids** — run browser
  tests locally (VERIFICATION.md's own "floor", TESTING.md, ~25 skill sites, 8 plans), arm auto-merge (6 plans),
  push straight to the deploy branch (1 plan). A newcomer agent following the nearest doc would break rule 5.
- Several **guards pass when they should fail**: the docs-integrity path check is blind to `.claude/`/`.github/`
  paths (46 dead ones pass), the curvature-channel test cannot see racing-line reads, the hook-index generator
  emits bogus rows and its `--check` passes, `bash-guard` lets a subagent start Playwright via `test-solo.mjs`
  and wrongly refuses multi-line commit messages that mention `-n`.
- One real game defect surfaced from doc checking: **Montreal's hairpin grandstands, keep-out and lighting
  exclusion sit ~296 m before the actual hairpin** (headless build measurement, confirmed twice).
- The `total-audit` workflow itself is stale: 15 of 52 circuits and 46 js files (14,887 lines) fall in no slice,
  `docs/notes` (375 files), `docs/plans` and `docs/tracks` are out of scope, and its finders self-reported reading
  4 of 104, 6 of 98, 7 of 370 and 0 of 38 files in four slices while its report still calls those slices covered.
- The docs tree: no dead markdown links and no duplicate files, but 426 files are linked from no index, 110 notes
  in subdirectories are never indexed or aged out, at least 12 "live" plans have shipped or been superseded, and
  the defect ledger's header says it holds only open items while about 85% of it is fixed narratives.

## 2. Findings (most severe first)

Format: ID | P | kind | file:line | claim | evidence | suggested fix | VERIFIED/UNVERIFIED | NEW/KNOWN

### P1 — wrong behaviour on a real path, or a guard/test/tool that passes when it should fail

DT-01 | P1 | bug | js/circuits/scenery/montreal.js:876,898-904 (also :519, :922-924; js/circuits/montreal.js:27) | Hairpin grandstands (`montreal-hairpin-grandstands`), the hairpin keep-out, tyre walls/marshal post and the def's "hairpin foldback" lighting exclusion are keyed to s 0.52–0.59; the hairpin is at 0.618. | Headless build: tightest corner racing 0.6182, R=16.2 m; def agrees (`turns` 0.6178, `bankZones` frac 0.6197 "the hairpin", :37). montreal.js:8 `reverse:false`, :21 `sceneryCoordinates:"racing"`, no shift, so `K(0.55)` is racing 0.55 (build-props.js:1930,1996). Stands land on a near-straight (R≈770 m) 296 m of arc before the apex. The old frame (:30, +0.8598) would give 0.758, so no frame explains it. | Re-key the five sites to ~0.60–0.64; add a per-circuit check that a landmark named for a corner sits within N m of that corner. | VERIFIED (two headless measurements; not seen in a browser) | NEW

DT-02 | P1 | tool-gap | tools/gen/gen-hooks-table.mjs:124-125 → docs/DEBUG-HOOKS.md:41,171-172 | Generated hook index says "216 hooks"; `--check` passes. | `peeledHooks()` takes the first object `return` inside ApexCam `hooks()`, which is the nested helper's `return { T, tries }` (js/agent/apex-cam.js:23), not the real return at :32. Index has bogus rows `T` and `tries` and omits 17 camera hooks (camState, camTune, freeCam, orbit, view, snapCam, …); `visorScene` (attached at js/game.js:79) is missing too. `Object.keys(__apex)` in the node VM = 232. | Take the top-level return of `hooks()`; derive the set from the live key list. | VERIFIED | NEW

DT-03 | P1 | test-gap | tests/unit/hooks-documented.test.mjs:42-49 | "hand sections required for every hook" | The test reads only the text after `const api = {` in js/agent/apex.js; hooks spread in from apex-cam/track/lobby/net.js are never checked. | Use the real key set (VM) or parse every hooks module. | VERIFIED | NEW

DT-04 | P1 | test-gap | tests/unit/curvature-channels.test.mjs:34-66,103-112 (claimed at docs/PHYSICS.md:6-9,1190-1192) | The test makes every new curvature consumer "classified before it lands … ZERO violations". | It counts textual `.curvature(` call sites per file against a ledger (game.js pinned at 10). It never reads the channel column, so a false "AI-only" passes, and a read moved from the AI arm to the human arm keeps the count. Racing-line reads (`TrackLine.at/pathK/attackAt`, `track.curv`, `frenetH`, `kCur`) are invisible to it. No other test or lint was found that fails on a human-path racing-line read (search not exhaustive). The contract does hold today by hand trace (`ROAD_FOLLOW` default 0, `raceLineAssist` default 0). | Add a behavioural test: poison curvature/line data, assists off, assert identical player trajectory. | VERIFIED | NEW

DT-05 | P1 | test-gap | tests/unit/docs-integrity.test.mjs:144 ("live docs reference only files that exist") | Dead paths in live docs fail the test. | `PATH_RE` knows 8 prefixes (js, tools, tests, css, assets, spike, vendor, docs) and 7 extensions. 46 backticked `.claude/`, `.github/`, `desktop/`, `mobile/`, `types/` paths that do not exist pass, e.g. docs/TESTING.md → `.github/workflows/docs-guards.yml`; five notes → `.claude/rules/fleet-core.md`; two → `.claude/hooks/merge_policy.py`. | Widen prefixes/extensions with a dated-history exemption. | VERIFIED | NEW

DT-06 | P1 | test-gap | tests/unit/docs-integrity.test.mjs:108 | Exempts archive/research/tracks/superpowers directories. | The regex is unanchored on the directory name, so it also skips `docs/notes/agent-ops-research-2026-10-27/` and `docs/plans/research-2026-09-16/`. | Anchor it. | VERIFIED | NEW



DT-09 | P1 | test-gap | tests/unit/webgpu-menu-warm.test.mjs:103-145 | "WebGPU menu warm enables warmPlus + idle-chunks…" | The `warmPlusOn` and `_resolveWarmWhere` tests assert against functions defined in the test file ("Mirror tlx.js helper"); editing js/render/three/tlx.js cannot fail them. Only :72-101 touches shipped text, by `indexOf`. | Export the gate as a pure function and test that. | VERIFIED | NEW

DT-10 | P1 | test-gap | tests/unit/knowledge-retention.test.mjs:89-99 (claimed at docs/DECISIONS.md:4-8) | A rule/hook/test resting on a decision "cites (D-NNN)"; the cited-by column is checked. | The test checks only that each cited-by path is a tracked file. D-003, D-007, D-012 appear in none of tests/, tools/, .claude/hooks, .githooks; 23 of 30 rows list files that never mention their id (reader count). | Assert the id appears in each cited-by file, or rename the column "related files". | VERIFIED | NEW

DT-11 | P1 | drift | README.md:251-255 | "Music: free demo tracks from Beatscribe's Homebrew VGM assets … CC0 1.0" | assets/music/CREDITS.txt: all six shipped tracks are "provided by the project owner"; the Beatscribe CC0 loops "were removed". The public README states a licence for music it does not ship and none for the music it does. | Rewrite Credits from the two CREDITS.txt files. | VERIFIED | NEW

DT-12 | P1 | tool-gap | tools/gen (generator of docs/TESTING-COVERAGE.md) ← tests/groups.json:829-833 | docs/TESTING-COVERAGE.md:942 row for ready-gate.test.mjs: "…and the REAL RACE: the OpenF1 timing of the 2026 Azerbaijan GP" | The generator attaches a group note to the file directly below it; ready-gate.test.mjs tests a PR pre-flip gate. 15 rows begin "...and the …" (continuation fragments), 30 rows are only "@ts-check", 134 more carry it as a prefix (headerSentence in tools/gen/gen-arch-table.mjs:58-79). | Fix note attachment; skip a leading `@ts-check`. | VERIFIED (942 row) / UNVERIFIED (counts 15/30/134, reader only) | NEW

DT-13 | P1 | tool-gap | docs/ARCHITECTURE.md:2094,2143 | "`wgx-validate.mjs --static` (real Dawn WGSL validation)"; "WGSL validation without a browser: `node tools/gfx/wgx-validate.mjs`" | Swapped. tools/gfx/wgx-validate.mjs:27-28: "--static is the default no-browser gate. Bare / --lite / --no-rg11b10 launch Chromium". The command the doc calls browser-free launches Chromium. | Swap the two descriptions. | VERIFIED | NEW

DT-14 | P1 | bug | tools/shot/agent.mjs:208-214 | `car` is "the car as JSON" (agent.mjs:59; .claude/skills/agent-view/references/surface.md:73) and only rasters are refused under `--vm`. | `RASTERS = new Set(["render","frame","plan","car","visible"])`; `car --vm` exits 2 although `car` returns `carView()` JSON (:330). Read from code, not run. | Remove `car` from RASTERS. | VERIFIED (by reading) | NEW

### P2 — process text that makes an agent break a rule

DT-15 | P2 | contradiction | docs/VERIFICATION.md:61-62 | The pre-push floor is tooling-fast "plus the ONE spec … `node tools/ci/test-bg.mjs --spec …`". | AGENTS.md:30 rule 3 (floor = tooling-fast only), :34 rule 5 (no local browser runs), tools/ci/test-bg.mjs:6 ("Agents do not run browser tests locally … Bryce-attended single spec"), and the same doc's By-change table. Same wording at docs/plans/2026-10-27-review-fix-plan.md:216-218. | Delete the clause; keep the grant wording from check-changes/SKILL.md:45-46. | VERIFIED | NEW

DT-16 | P2 | contradiction | .claude/skills (24+ sites) | A browser spec run is a routine verify step. | No "Bryce's grant" condition at: agent-view/SKILL.md:47-50 and asset-pack/references/workflow.md:83-85 (`npm test -- tests/specs/…`; package.json:11 is run-playwright); css-play/SKILL.md:68-75 (also `npm run test:baseline -- --update-snapshots`, a browser group); ai-racecraft/references/checks.md:16-17; audio-debug/SKILL.md:37-38; game-feel/SKILL.md:37-39; input-controls/SKILL.md:41; garage-parts-livery/SKILL.md:71; lighting-tuner/SKILL.md:51; career-mode/SKILL.md:69. Second half: race-weekend/SKILL.md:68, ui-menu-a11y/SKILL.md:47,49, race-incidents-control/SKILL.md:91, season-mode/SKILL.md:50, tune-physics/SKILL.md:65, multiplayer-debug/SKILL.md:91, new-track/references/editor.md:59 and workflow.md:134, scenery-dress/references/instancing.md:31, survey-track/references/loop.md:98,102, mcp-probe/references/chrome.md:188 and traps-chrome.md:19-37 (`test-bg.mjs gfx`, removed group mode). | One sentence, one home (check-changes), every site links to it. | VERIFIED | NEW

DT-17 | P2 | contradiction | docs/TESTING.md:64,75,172,178,297 | "AGENTS.md's verification policy is two browser groups per change"; `npm test -- tests/specs/<file>` as the single-spec route; a worker's floor "([WORKERS.md] §3)". | AGENTS.md has no two-group policy; `npm test` is a local Playwright run; docs/WORKERS.md is a 5-line retired stub with no §3. | Rewrite against AGENTS.md's loop. | VERIFIED | NEW

DT-18 | P2 | contradiction | docs/plans (6 files) | "arm auto-merge on at most two PRs" (feature-roadmap.md:114-115, perf-memory.md:9-10 citing a nonexistent "AGENTS.md §Concurrent PRs"; highlight-reel-clip-export.md:10-11; same dead citation at strategy-career-depth.md:200, carve-headroom.md:103, localisation.md:7); "merge on green CI" (flyby-improvements.md:62-63); the ruleset should not require a PR because "several sessions push directly through `deploy.mjs`" (process-speedup-next.md:213-215). | AGENTS.md:94-95 "no session merges or arms"; :88-89 "work lands only through a PR". | Archive or banner these plans. | VERIFIED | NEW

DT-19 | P2 | contradiction | docs/CAREER.md:1008,1018; docs/SCENERY-API.md:1027 | Run `node tools/ci/test-bg.mjs modes` / `car` / `clip`. | tools/ci/test-bg.mjs:219,256: "group mode is gone (2026-11-03)"; only `--spec`. | Point at `remote-group.mjs <group>`. | VERIFIED | NEW

DT-20 | P2 | contradiction | .claude/rules/ci-tools.md:17; .claude/rules/render-tlx.md:21; docs/VERIFICATION.md:25 | A manual ci.yml dispatch is a hook "ask"; agents are told to dispatch ci.yml. | .claude/hooks/github-mcp-guard.sh:68-69 DENIES `run_workflow` of ci.yml/pages.yml and any numeric id. | State deny-via-MCP; reword the two instructions. | VERIFIED | NEW

DT-21 | P2 | contradiction | docs/DECISIONS.md:26 (D-002) vs AGENTS.md:89, docs/VERIFICATION.md:176, .claude/skills/check-changes/references/deploy.md:39-40 | Which check the deploy branch requires. | D-002: "branch protection requires `CI` and nothing else". AGENTS.md: "one required check, `gate`". deploy.md: "requires the checks `CI` and `gate`". tools/ci/merge-gate.mjs:50 `REQUIRED_CHECK = "CI"` is what `gate` reads. Three sources, three answers; the live ruleset was out of reach. | Read the ruleset once, fix all four. | VERIFIED (texts) / UNVERIFIED (which is true) | NEW

DT-22 | P2 | drift | .claude/agents/README.md:84; .cursor/rules/apex-shared.mdc:28; cursor-plugins/apex-f1-game/skills/apex-cloud-agent-launch/SKILL.md:22-26; .claude/skills/steward/references/vendors.md:11 | The worker model and Cursor launch gate come from `hosts.cursor.model` / `hosts.cursor.enabled` in tools/ci/dispatch.json; "at most 6 launches per 10 minutes". | dispatch.json has no `hosts` or `model` key; caps are maxLaunchesPerRun 4, maxLaunchesPerDay 24, maxLiveWorkers 8; dispatch.mjs and dispatch.yml set no model. | Delete the `hosts.*` text; cite the real caps. | VERIFIED | NEW

DT-23 | P2 | dead | docs/AGENT-SURFACE.md:225-226; .claude/skills/slim-bloat/SKILL.md:11,37,50; .cursor/rules/apex-shared.mdc:19-20; tests/unit/skill-progressive.test.mjs:579 | Route to agents `bloat-auditor` and `agent-surface-reviewer`. | Neither card exists (folded into `code-hunter` focus dead-code and `surface-reviewer`). The test asserts the skill text matches `/bloat-auditor/`, so the suite pins the dead name. | Rename in all four; flip the assertion. | VERIFIED | NEW



DT-26 | P2 | drift | .claude/settings.json:99,175 | Deny list and browser matcher. | Denies `mcp__apex-tools__apex_codex_control`, which the server no longer provides; the matcher still lists removed `diagnostics` (tools/mcp/apex-tools-mcp.mjs:37). | Trim both. | VERIFIED | NEW

DT-27 | P2 | drift | .githooks/pre-commit:20 | "ratchet growth <= 40 lines is auto-raised" | Real absorb is 20 (tools/check/ratchets.mjs:967; .claude/rules/game-code.md:23). | Say 20. | VERIFIED | NEW


DT-27b | P2 | drift | .claude/skills/steward/references/land.md:18; references/ci-verdicts.md:23; references/issues.md:6; .claude/skills/phone-bridge/SKILL.md:16 | A `ratchet-raise` gate row; a `= ci hollow` verdict; the "ready" issue search; "Ask Bryce (AskUserQuestion in an attended session…)". | merge-gate.mjs:67 ROWS has no such row and .github/labels.json no such label; ci-watch.mjs:45-47 says the hollow exit went 2026-11-03; dispatch.mjs:325 also excludes `needs-decision`, which the skill search omits; AGENTS.md:98-99 and steward/SKILL.md:32-33 say no question to the user, no AskUserQuestion. | Fix each. | VERIFIED | NEW


AUDIT docs-truth part 2/5

### P2 — docs that would make code written from them wrong

DT-28 | P2 | drift | docs/SCENERY-API.md:791-811 | `seat.prism(out,{on,at,size,basis,col})`, `foundation(out,{footprint,at,top,basis,col})` | build-props.js:635 `prism(o, foot, sz, col, b)` is positional; :646-650 `foundation(o, spec)` reads `spec.center/size/top`. Called with the doc's keys both emit nothing, silently. | Replace both snippets. | VERIFIED | NEW

DT-29 | P2 | drift | docs/SCENERY-API.md:23 (also js/track/scenery/data.js:79) | A circuit reads its kit "through `api.kitOf`". | `kitOf` is on the internal ctx (build-props.js:1306), not among the 114 api members (build-props.js:1950-1980; the contract test list). | Say engine-side. | VERIFIED | NEW

DT-30 | P2 | drift | docs/SCENERY-AND-TRACK-BUILD.md:18,35,53 | Each `js/circuits/<id>.js` has a `<script>` tag and pushes into TrackDefs at boot; "`Tracks.build` is **synchronous**". | index.html has 0 references to js/circuits/; defs are `LAZY_CIRCUIT`, hydrated by `ensureCircuit`. The build normally runs in a Worker (js/track/build-client.js, build-worker.js) with `Tracks.buildSteps`/`buildPaced` as fallback; none of the three scenery/track docs mention the worker files. | Rewrite §1–§2. | VERIFIED | NEW

DT-31 | P2 | drift | docs/SCENERY-API.md:150, :583, :290, :670, :995 | Lamp cap 96; "no models ship by default" (example id `grandstand_tifosi`); link to SCENERY-GROUNDING.md; closure "in `js/circuits/<id>.js`"; "the old --clip mode is gone". | `CUSTOM_LAMP_CAP = 160` (build-props.js:1819); assets/pack/models holds 28 .bin files, none of that name, while code comments say "77 models" (js/render/shared/assets.js:1030, js/core/lazy-bundles.js:170); no SCENERY-GROUNDING.md; closures are in js/circuits/scenery/; `--clip` still exists in tools/track/float-audit.cjs:713. | Fix each. | VERIFIED | NEW

DT-32 | P2 | test-gap | tests/unit/scenery-api-contract.test.mjs:10-11 | Header: "additions are safe". | :84,:99 `assert.deepEqual(keys, CONTRACT)` fails on an added member (which is the intended rule per js/track/AGENTS.md). The 114 count is true. The test pins names only: a changed argument order or sign convention passes. | Fix the header; consider arity pins. | VERIFIED | NEW

DT-33 | P2 | drift | docs/DEBUG-HOOKS.md:300-301,321-336 | Quick start `__apex.race("suzuka"); __apex.park(0.15);`; `race → {…} | false`. | js/agent/apex.js:32-41,1040: `race()` returns a thenable that resolves when startRace finishes and rejects on cancel/no-grid; js/game.js:2465 starts with `await yieldMain()`; `park` (apex.js:277) returns false with no player. The un-awaited example fails on a fresh page. | Document `await` and rejection; fix three examples. | VERIFIED | NEW

DT-34 | P2 | drift | docs/DEBUG-HOOKS.md:1146-1155 | `groundY` returns `{x,z,roadY,terrainY,gap}`; use `gap` to find floating props. | js/agent/apex-track.js:104-118 also returns `bankDy`, `roadSurfaceY`, `overRoad`; its comment: "`overRoad` is the number you want; `gap` is the trap". The hand section teaches the trap (the ledger still lists ~13 specs reading `.gap`). | Document `overRoad`. | VERIFIED | KNOWN (the `.gap` specs) / NEW (the doc)

DT-35 | P2 | contradiction | docs/DEBUG-HOOKS.md:528 vs :443-457 | carOrbit: "call `snapCam()` or take the frame to see it". | js/agent/apex-cam.js:49: snapCam sets `G.dbgCam = null`, cancelling the shot; the doc's own earlier section says never snapCam after a free-cam hook. | Drop "call snapCam() or". | VERIFIED | NEW

DT-36 | P2 | drift | docs/DEBUG-HOOKS.md:1475; :5448-5452,5493; :5458; :355-356; :1324; :952-954; :1901; :812,1774; :2766-2800; :1186 | Flags read from the URL hash; "The game ships GLX … Three is the opt-in"; boot-step cap "default 8 s"; `info().track` null means no circuit loaded; `audio().venue`; `assets().supported` false on WGX; `aim` is an absolute bearing; "take a turn from `info().turns`"; pit pitch 14 m, state `approach`, `COMMIT_FRAC`; engine rate 0.25/0.45. | js/core/dev-flags.js:2-4 hash never read; js/render/gfx.js:5-6 and renderer-boot.js:54 TLX default; renderer-boot.js:118-122 default 15000; apex.js:384 track non-null only in race/count; apex.js:2250-2254 no venue; wgx.js:4895,4990 implement both functions; apex.js:910 tangent-relative; apex.js:394 turns is a count; pit.js:34 PITCH 11.0, no "approach" state, pit-geom.js:236 `COMMIT_IN`; engine.js:984 0.17/0.5115. | Fix each line. | VERIFIED | NEW

DT-37 | P2 | drift | docs/DEBUG-HOOKS.md:2897-2898 | Damage readout: "Nothing in physics, AI or race control reads it". | js/race/damage-handling.js:1-20: the setting-gated DAMAGE→HANDLING read reaches PlayerForces for the local car (default off). | Add the exception. | VERIFIED | NEW

DT-38 | P2 | drift | docs/PHYSICS.md:1214; :429-432; :377-379; :13-27; :1218; :331-333 | Brake cue "ships defaulted ON (notch 6)"; a KNOWN GAP in gripMult; steer schema "currently at 4"; vTop/vStd/PACE "in game.js"; "sole caller of `start()`"; `aero-zones.spec.js` "pins both halves" of LOW GRIP. | steer-tuning.js:644 default 1 = OFF (brake-cue.js:17,23); game.js:605 already uses `TyreModel.treadFor`; steer-tuning.js:416 `STEER_SCHEMA = 5`; pace-math.js:42-48 and drive-tune.js; SoakRun.start also called from bench-run.js:222,253,268 and gpu-test-run.js:210; the spec has no wet/rain/tread test. | Fix each. | VERIFIED | NEW

DT-39 | P2 | drift | docs/CAREER.md:872-874; :653; :1008-1014 | Qualifying is "two laps"; off-season drift halves "craft and consistency"; reliability/wage-bill covered by career.spec.js and quali.spec.js. | js/game.js:2540-2543 `lapsTarget = 1` and tests/specs/quali.spec.js:280; js/career/career.js:1435-1447 never touches consistency; neither spec mentions reliability. The behaviour IS tested, in tests/specs/career-season.spec.js:705 (the finder's "no test anywhere" was refuted). | Fix; re-point the Tests section. | VERIFIED | NEW

DT-40 | P2 | drift | docs/MULTIPLAYER.md:259; :376-377; :93 | ICE restart "re-offers at most twice"; `ci-coverage.test.mjs` pins controller.html staging; "six shipped relays". | js/net/transport.js:467 `ctx.attempt < 3` from 0 = three offers; the test has no "controller"; js/net/nostr.js:109-117 lists 7. | Fix. | VERIFIED | NEW

DT-41 | P2 | drift | docs/LIGHTING.md:110,133; :90-95; :470-476; :636; :694,695,711; :511; :370; docs/LIGHTING-TUNER-SLIDERS.md:26,39,65,267-268,371 | `uLightA..D` arrays; "padding" components; `*` baseline holds only carGloss; "five shared stamps"; catalunya/estoril/korea theme "modern"; "111 of 191 knobs listed"; night bloom 0.93; "183 knobs / 73 uniforms"; perChunkLights "off by default". | glsl-lit.js:260 one `uLight[MAX_LIGHTS*4]` (a test asserts A..D absent); wgsl-post.js:503-512 uses them; `*` has 17 keys; 16 `*|tod|wx` stamps (1061 keys); all three are "green"; 91 listed; game.js:8305 0.97; knobs.js 191/76; presets.js:23-32 ship 0.3 on all four `*|tod`. The 91 knob bullets themselves match live min/max/default exactly. | Fix prose; the generated block is current. | VERIFIED | NEW

DT-42 | P2 | contradiction | js/lighting/profiles.js:114,139-141; js/lighting/tuner-panel.js:34; docs/ARCHITECTURE.md:1993 | "three.js cannot bind per-chunk sets"; `hasPerChunkLights` "GLX + WGX; absent TLX". | js/render/three/tlx.js:5160 `hasPerChunkLights: true`. The tuner-panel branch ("not supported by the three.js renderer") is dead on every backend. | Delete comments and branch; fix the doc. | VERIFIED | NEW

DT-43 | P2 | drift | docs/ARCHITECTURE.md:946-947; :909,783; :1121; :1123-1124; :1115; :1130; :786-787; :1744; :2224; :1530,1522; :1646-1652; :1971; :1996 | Probe-armed boot "resets apex26.gfxBackend to webgl2"; shader order via HARD_EDGES; graph.js a "HARD_EDGES pair"; space.js = Frenet projection, surface.js = tarmac tints; core/scenery "all loaded before tracks.js"; guards "pending a later peel"; extract-module.mjs "updates manifest + tags"; `backendPreference()` in game.js; `_nearM` snippet for cockpit/hood only; `GameResults`/`CareerUI` globals; staged file list; `_TAA_ENABLED`; `updateInstances` line numbers. | renderer-boot.js:251-275 two-strike ledger; manifest.cjs:1495-1503 DEFERRED_EDGES; graph.js in no edge list; space.js exports toRacingFrac/scenerySpace, surface.js `{profile, heightAt}`; 18 files in LAZY_TRACK_BUILD (manifest.cjs:1342-1361); guards.js exists; the tool writes only `--out`/`--g-out`; renderer-boot.js:62; game.js:7569 also visor/helmet; `GameResultsSheet`/`CareerScreen`; stage-files.mjs:15-34 adds bench/controller/cockpit-view/overlay.html + locales; `_TAA_ENABLED` exists nowhere; glx 2341 / wgx 5218 / tlx 2303. | Cite symbols, not lines; fix each. The generated module index (gen-arch-table `--check`) is current. | VERIFIED | NEW

DT-44 | P2 | drift | docs/UI-MAP.md:74-81; :103-114; :392; :54-65; :358 | Settings has 6 doors titled DRIVING/DISPLAY; renderer and tuners under Display; 30 layer roots; 10 title actions; `VISOR_CAM` in game.js. | index.html:920-930 has 10 doors, titles DRIVING AIDS / HUD & CAMERA (settings-tabs.js:16,18); `#pm-display-adv` is in `#pm-panel-graphics` (index.html:1029), tuners in `#pm-panel-visual` (1016-1024); layers.js:14-70 has 35; 19 `mb-*` buttons; platform-session.js:231. | Regenerate from settings-tabs.js and index.html. | VERIFIED | NEW

DT-45 | P2 | drift | README.md:124-130; :152; :51,109 | Settings pages "CONTROLS, DRIVING, DRIVING AIDS, DISPLAY, APPEARANCE, MUSIC & SOUND, BACKUP & RESTORE"; "Toggle UNLIMITED BUDGET"; GEARS/ACTIVE AERO under SETTINGS > CONTROLS. | Real pages: CONTROLS, DRIVING AIDS, HUD & CAMERA, APPEARANCE, ACCESSIBILITY, MUSIC & SOUND, SAVES & DATA, GRAPHICS, VISUAL STUDIO, PROGRESS; the button is "FREE BUILD" (index.html:3198) and defaults ON (game.js:241); both rows are in `#pm-panel-driving` (index.html:1260-1343). In-game help also contradicts itself (index.html:3261 says CONTROLS, :3268 DRIVING AIDS; reader only). | Fix README and help line 3261. | VERIFIED | NEW

DT-46 | P2 | drift | docs/COMPONENTS.md:21; :13,347; :28-38; :229; :847-871 | "The family table is asserted by component-inventory.test.mjs"; "576 class tokens in 60 families"; "Three logical stylesheets"; token `--tap-btn`; 17 menu-fit tokens "Declared on :root in css/tokens.css". | The test checks names only (component-inventory.test.mjs:50-97); the test's own `collect()` gives 628/72; css-source.mjs:7-16 has five families; `--tap-btn` exists nowhere; only 5 `--menu-fit-*` are declared (3 in tokens.css:298, 2 in menu-destinations.css:279-280). | Assert the numbers or drop them. | VERIFIED | NEW

DT-47 | P2 | drift | docs/ARCHITECTURE-MAP.md:243,304,346,490 (also docs/plans/2026-10-27-cooldown-podium.md:3,53; docs/NOTES-INDEX.md:390) | RaceCeremony "when shipped" / "PLAN — build is blocked" / "plan-only". | tools/manifest.cjs:1131; js/game.js:98,4703; js/race/ceremony.js:8 PHASES; tests/specs/results-flow.spec.js:210. | Mark shipped. | VERIFIED | NEW

DT-48 | P2 | drift | docs/TESTING.md:172; :451 vs docs/VERIFICATION.md:112-113; :441,849-852; :790; :94; :465-466; :586,841; :246; :340,670 | Two tooling-fast shards; ~5 min serial vs ~47 min serial; jobs `xr-filter`/`renderer-filter`, renderer-macos at APEX_WORKERS=2; node-suites has no fetch-depth 0; MAX_SPILL_SHARDS 4; 297 parts options; anchors "§A boot is 45 s now" and "§Field notes 2026-09-03"; 49 waitForFunction sites; "24 browser groups, 170 specs". | ci.yml:418,697 four shards; ci.yml:2026 filters folded into `select`; ci.yml:1866 `APEX_WORKERS: 1`; ci.yml:883 fetch-depth 0; select-specs.mjs:292 = 7; parts-visual-distinctness.test.mjs:59 = 357; no such headings; ratchet 41; 27 browser groups, 179 specs. | Fix each; the session banner's "45 ⊂ 740 ⊂ 1071 of 1096; 179 specs" is correct. | VERIFIED | NEW

DT-49 | P2 | contradiction | AGENTS.md:71 | "`index.html` owns ALL static DOM". | `#trackdesigner` is an empty `<dialog>` (index.html:3667); js/editor/designer.js:1561 builds the whole screen. Also `#ga-transport`, `#ga-angle-map`, the `#pm-titlelayout` fold (reader only). No test enforces "ALL". | Reword to "every screen root and static chrome". | VERIFIED (designer) | NEW

DT-50 | P2 | drift | docs/CODE-STANDARDS.md:44,56; :154-155; :181-185 | "never `var`"; "omit the binding when unused: `catch {`"; remove section banners and dated journal comments. | 40 files declare their global with `var` (deliberate for lazy/stub reinjection, js/race/session-stub.js:62,68); `catch (` 2160 vs `catch {` 22; 425 `// ──` banners, 609 ISO dates in js/. Nothing lints any of the three. | Mark advisory, or add lints. | VERIFIED | NEW

DT-51 | P2 | drift | docs/PLATFORM.md:82; desktop/package.json:4 | Rendering is "WebGL2 with procedural geometry". | gfx.js:280-283: TLX (three.js, WebGPU first) is the default; WebGL2 is the fallback. | Name TLX. | VERIFIED | NEW

DT-52 | P2 | contradiction | CHANGELOG.md:3,14 | Sections are keyed by "exact `build` number from `version.json` (for example 1695)"; "Do not list internal refactors, agent workflows, CI, or tooling". | Newest heading is `## 24324`; docs/changelog.d/README.md:23-24: "the tip's STAMPED build … never version.json's placeholder 1695". CI/tooling entries at :143, :161, :163, :200, :201. | Reword the header; lint the category. | VERIFIED | NEW

DT-53 | P2 | drift | docs/DESIGN-TOOLS.md:195-196; .claude/skills/career-mode/SKILL.md:76-78 | `free-design-tools.test.mjs` and seven career/season VM tests are "in tooling-fast". | groups.json:1345-1349 (agent-contract only); the seven are only in `test:state-unit` (groups.json:2184+). tooling-fast.mjs:47-52 says that is deliberate; `--changed` can still select them. | Name the real groups. | VERIFIED | NEW

DT-54 | P2 | drift | .claude/skills/career-mode/SKILL.md:56 and references/workflow.md:62,103; .claude/skills/garage-parts-livery/references/workflow.md:51 | `Career.isOwned()` | No `isOwned` anywhere in js/; real accessor `Career.owned(teamId)` (career.js:806) via `G.careerOwned()` (game.js:3303). | Rename. | VERIFIED | NEW

DT-55 | P2 | drift | docs/tracks/*.md (36 rows; see tracks-pages.md) | Circuit pages. | Verified samples: kyalami.md:4 "anticlockwise" (build is clockwise, −360°, T1 right; the def comment is right) and :3 "16 turns" (def has 13); albert_park.md:6 "anticlockwise" (clockwise); suzuka.md:14,30 "Spoon low" (build min −18.2 m @0.149, max +21.9 m @0.65 = Spoon); zandvoort.md:76-77 banking corners/angles (def: Hugenholtz 18°, Luyendyk 18°, Tarzan 4°); silverstone.md:41 (the def's own comment :57 says "the old 0.12/0.55 note was wrong"); theme ids `urban_day`, `island_park_day`, `desert_marina_night` exist nowhere; START-LINES.md:217 calls jeddah 0.9625 "still known-wrong" while :17,:204 and jeddah.js:10 say 0.9160; :149-150 "every one ships startFrac 0.0000" (six have moved); :4 "22 of 40". All 52 pages exist and every explicit startFrac/shift number on them matches the defs. | Re-key corner tables to racing fractions; date the 40-circuit text. | VERIFIED (12 sampled) / UNVERIFIED (remaining rows) | KNOWN (silverstone page, per ledger) / NEW (rest)

DT-56 | P2 | contradiction | docs/tracks/portimao.md:6,20 vs js/track/circuit-elevations.js:25 | "the pit straight plunges downhill into Turn 1". | The baked profile starts at 0, is +1.3 m at T1, rises to +22.4 m @0.685, minimum −1.8 m @0.885: no drop into T1. Doc and bake disagree; the real circuit matches the doc's description as far as I know, so the bake (SRTM over the trace, or its start alignment) is the suspect. | Compare the bake against a survey. | VERIFIED (disagreement) / UNVERIFIED (which side is wrong) | NEW

### P2 — the docs tree itself

DT-57 | P2 | contradiction | docs/notes/DEFECT-LEDGER.md:5-12 vs docs/BUGS.md:3-5 | Ledger: "the register of what is still open … Everything fixed has moved to the archived journal". BUGS.md: open defects are GitHub issues; "Fixed-defect classes stay in notes/DEFECT-LEDGER.md". | Opposite roles. The ledger is 3,928 lines; of 55 dated heads 16 say FIXED/DONE/LANDED and 1 says OPEN. It has no entry ids and almost no file:line. | Pick one role; split. | VERIFIED | NEW

DT-58 | P2 | drift | docs/notes/DEFECT-LEDGER.md:1356,3901; :1539; :47-48; :514; :17; open item "sw.js activate deletes every other cache generation" | Entries that no longer match the code. | `_startBias` is `[-2,-4]` (game.js:6823), pinned by gfx-backend-canary.test.mjs:6712-6725, not `[-12,-24]` pinned by grid-boxes.test.mjs (stale comment also at webgpu-lifecycle.test.mjs:1384); "No CSP" but index.html:6 has one; AI rescue now arms via `digEsc` (game.js:6504-6508); `KNOWN_UNHANDLED = {}` (circuit-vocab.test.mjs:81); `classifyOrder` is `classify` (race-control.js:190); sw.js:265-280,880-896 keeps one prior settled generation while a window client remains. ~60 sampled FIXED entries were all really fixed (reader); no "marked fixed but not fixed" was found. | Close the stale-open rows. | VERIFIED | KNOWN (stale)

DT-59 | P2 | dead | docs/BUGS.md:10-11; js/career/season-cal.js:487; docs/SCENERY-AND-TRACK-BUILD.md:189,303; docs/ARCHITECTURE-MAP.md:150 | "S3 … documented in SCENERY-API.md"; "B4 (BUGS.md)"; "BUGS.md S1 / §Scenery shortlist"; "BUGS.md — verified open/fixed defects (incl. scenery S1–S10)". | SCENERY-API.md has 0 hits for `_sceneryShift` or "frame debt"; BUGS.md is 12 lines with no B or S rows besides S3. | Repoint. | VERIFIED | NEW

DT-60 | P2 | drift | docs/README.md:63; docs/plans/ | "plans/ live plans (shipped and superseded ones are under archive/plans/)". | orchestration-redesign.md:5 says SHIPPED and fleet-redesign.md:3 says SUPERSEDED, both still in docs/plans. Shipped but headed otherwise: wetness-lighting.md:3 (misreads its own slice A1), pwa-shortcuts-calendar.md:3 ("no .ics export" vs js/data/ics.js), colourblind-captions.md:3 (vs js/ui/cvd-palette.js), cooldown-podium, agent-surface-reset.md:3 ("IN PROGRESS on branch"), MOSPORT-PLAN-2026-09-14.md:3 ("Nothing implemented"). docs/NOTES-INDEX.md's hand-kept plan bullets cover 15 of 29 plans. Stale facts inside plans: texture-memory-plan.md:62-63 livery SIZE 1024/1280 (liverytex.js:10,16 = 2048/2560); feature-roadmap.md:57 tyreSeverity on ~7 of 52 (52 of 52); models-life.md:20 "every shipped model is synthetic" (22 Kenney models, assets/pack/CREDITS.md). | Archive shipped plans; generate the plans index. | VERIFIED | NEW

DT-61 | P2 | tool-gap | tools/docs/knowledge-gc.mjs:27,146; docs/NOTES-INDEX.md | Retention and the notes index cover the notes tree. | Only top-level `docs/notes/*.md` (265) are indexed and aged. 110 .md in three subdirectories (review-2026-10-27 alone: 97) are never indexed and never expire. 257 of 265 index rows say `Kind: unknown`; 76 uncited notes are grandfathered in tests/data/notes-uncited-allow.json; 7 notes carry `Re-measure-by`. Retention does run (.github/workflows/knowledge-gc.yml:25, weekly, opens a bot PR) but plans count as citers, so shipped plans keep their notes alive. | Index or archive the subdirectories; archive plans first. | VERIFIED | NEW

DT-62 | P2 | drift | docs/ (reachability) | Every doc is reachable from an index. | 426 of 1,053 files have no per-file link from AGENTS.md, README, docs/README, NOTES-INDEX, agent-index.json, the skills README or MEMORY.md (133 if a directory row counts as reaching its files); 340 are named by no other file. Three live plans are in no index (load-download-weight, test-ci-health, landing-and-agent-ops). tests/unit/docs-integrity.test.mjs:801 ("indexes every directory") is a substring check on the README text. Positives: 0 dead markdown links, 0 duplicate or near-duplicate files, docs/tracks is exactly one page per circuit. | Per-file index for live trees. | VERIFIED (the three plans, the test) / UNVERIFIED (426/340 counts, reader script) | NEW

DT-63 | P2 | drift | notes read in full (25) | A newcomer would be taught something false by: PARALLEL-WORK.md:57,107 (three-0.185.1, 40 circuits, advises local browser groups); AGENT-MEMORY.md:15,22 (docs/WORKERS.md as a live store); TRACK-ROSTER-RESEARCH-2026-09-14.md (40 defs, wrong `classic` flags); MERGE-HYGIENE-2026-09-29.md:31 and PREPUSH-GATE-LADDER.md:8 and TESTING-FIELD-NOTES.md:5 (cite AGENTS.md text that is not there); AGENT-INBOX.md:105-132 (documents deleted `apex_inbox_*` tools under a retirement banner); BASE-CONTEXT-2026-10-26.md (deleted agent-fleet skill). 16 of the 25 held up against the code. | Banner or archive. | VERIFIED (4 sampled) / UNVERIFIED (rest) | NEW

### P2 — the `total-audit` workflow (.claude/workflows/total-audit.js)

DT-64 | P2 | tool-gap | total-audit.js:85-86 | circuits-1 = "the FIRST 20 files of ls js/circuits | sort", circuits-2 = "the LAST 20". | `ls js/circuits` has 55 entries (52 defs, AGENTS.md, CLAUDE.md, scenery/). Entries 21–35 are in neither slice: interlagos, istanbul, jacarepagua, jeddah, jerez, korea, kyalami, madrid, magny_cours, mexico, miami, monaco, mont_tremblant, montreal, monza. (Montreal, DT-01, is one of them.) The script's own text says "the then-40". | Slice by thirds computed at run time. | VERIFIED | NEW

DT-65 | P2 | tool-gap | total-audit.js:78-98 | "audit of ALL code and ALL docs". | In no slice: js/editor (21 files), js/xr (8), js/overlay (4), js/share (4), js/workers (2), js/assets, js/roster.js, js/render/renderer-boot.js, js/track/build-client.js and build-worker.js: 46 files, 14,887 lines. Also controller.html, overlay.html, mobile/, desktop/, examples/, plugins/, cursor-plugins/, types/, locales/, .claude/hooks, rules, agents, memory, .githooks, .cursor, .codex; and docs/notes (375 .md), docs/plans (35), docs/tracks (54), changelog.d. js/data and js/car are each in two slices. `docs-ref` gives one agent all 30 top-level docs (24,000 lines) to verify claim by claim. | Derive slices from `git ls-files` and fail on an unassigned path. | VERIFIED (my own count against the script) | NEW

DT-66 | P2 | tool-gap | total-audit.js:47-49,197,238-246 | Coverage is reported. | `filesRead` is required by the schema and never used. A finder that returns null still counts. The synthesizer is never given the coverage list; its "## Coverage" section is written from the findings JSON alone. In this run the finders self-reported: game-core 2 files, game-mod-abc 4 of 104, game-mod-dm 6 of 98, game-mod-nz 41 of 164, render-glx 8 of 27, render-alt 6 of 19, car 7 of 27, shell 0 of 38, tools-1 7 of 370, tools-2 26 of 245; track-scenery returned 0 findings after reading 3 of 19 files (re-run on Opus: 15 files, 11 findings). Two round-1 finders returned no result at all (`find:net`, twice, and `find:docs-idx`, the agent-surface lens over AGENTS.md, README, every SKILL.md and docs/research), as did 8 of the 16 gap finders in rounds 2 and 3; the returned `coverage` still lists all of them. | Compare filesRead with the slice's file list; report shortfalls and failed finders. | VERIFIED | NEW

DT-67 | P2 | bug | total-audit.js:246 | Findings reach the synthesizer intact. | `.replace('${JSON.stringify(confirmed)}', JSON.stringify(confirmed))` uses a string replacement, so `$'`, `$&`, `` $` `` and `$$` inside any finding's evidence are expanded. Demo: `sed "s/a/$'/" and $&` came back with `$'` deleted and `$&` replaced by the placeholder. It happened in this run: the synthesizer reported that "the task text was spliced into the surveyor-scope.mjs evidence string, right after the hook regex". | Use a function replacer. | VERIFIED | NEW

DT-68 | P2 | drift | total-audit.js:88,132,28; .claude/workflows/README.md | "vendor/three-0.185.1"; the surface-reviewer hint "AGENTS.md's loop (pick-tests → tooling-fast → test-bg → deploy.mjs --gate-only)"; "docs/ splits into reference / research / archive"; README: "Slice facts (game.js lines, the spec count) are computed at run time". | vendor/three-0.187.0 (and js/render/three has no vendor/); AGENTS.md's loop has neither test-bg nor deploy.mjs; docs/ also has notes, plans, tracks; only the game.js line count is computed. Also: if both skeptics fail, `verifyBatch` returns `[]` and the findings vanish (:168); "unsure ⇒ refuted" plus one-vote kill for low severity biases toward dropping; the `file:kind:line/20` bucket (:101) silently drops a second finding of the same kind within 20 lines; prior art is cut to 30 rows (:112). | Fix. | VERIFIED (first three) / by reading (rest) | NEW


AUDIT docs-truth part 3/5

### P3 — cleanup (each confirmed unless marked)

DT-69 | P3 | bug | js/career/career.js:1561 via js/agent/apex.js:1105-1109 | `__apex.careerHire()` returns an object or null. | With no career loaded `career` is null (career.js:77) and `career.roster` throws; sibling career hooks return null. Dev hook only. | Guard. | VERIFIED | NEW
DT-70 | P3 | drift | tests/data/flaky-quarantine.json | 10 retry-exempt rows. | 8 expired before 2026-11-10 (image-grade-visual 11-04; hud-layout ×2, garage-out-before-card, parts-livery-zones ×2, parts-livery-designs, garage-pick-cost 11-09). Expired rows are inert (tests/helpers/flaky-policy.mjs:24-25); nothing warns or removes them. | Fail CI on an expired row. | VERIFIED | KNOWN (image-grade flake) / NEW (expiry)
DT-71 | P3 | drift | docs (many) | "40 circuits" (LIGHTING.md:172,188,644; SCENERY-API.md:681,882; TESTING.md:453-454; START-LINES.md:4), "all 42 circuits" (tests/unit/pit-lane.test.mjs:5), "three.js r186" (ARCHITECTURE.md:8,928,988,1881), "39-circuit" (DEBUG-HOOKS.md:910-930). | 52 circuits; vendor/three-0.187.0. | Date or drop counts. | VERIFIED | NEW
DT-72 | P3 | dead | docs/AGENT-SURFACE.md:53-54, 462-463 | — | Two spliced sentence fragments ("work (for example `deploy-research`), never ready/arm/merge authority."; " token / API down) is a tool error."). | Restore or delete. | VERIFIED | NEW
DT-73 | P3 | dead | docs/DECISIONS.md D-020; tools/ci/ci-watch.mjs:7,80,302; .claude/skills/check/SKILL.md:39; docs/DEBUG-HOOKS.md:1451; docs/UI-MAP.md:8; ARCHITECTURE-MAP.md:167,323,503 | Citations of AGENTS.md "rule 13" (for the no-question rule), "§Watching CI and Pages", "steward §7", "**Logging** in AGENTS.md", USAGE-PATHS.md/FLOW.md. | None exists as cited. | Repoint. | VERIFIED | NEW
DT-74 | P3 | drift | .claude/rules/claude-config.md:23; .githooks/pre-push:23-24; AGENTS.md:44; js/circuits/AGENTS.md:8-10; js/track/AGENTS.md:9; js/lighting/knobs.js:4; js/agent/apex.js:756 | session-start.sh "restores memory"; AUTO-SYNC exemption; BUILT_PATHS "list: game-code.md"; saved `apex26.track` is a positional index; tracks.js exports `resolve`; `light-store.js`; spin "+CW viewed from above". | settings.json:145 runs memory-sync separately; land.yml:95 retired AUTO-SYNC; the list is tools/lib/generated-paths.mjs:37-39; game.js:152-155 stores a stable trackId; tracks.js:867 has no `resolve`; the module is profiles.js; +heading is CCW/left (player-forces.js:424). | Fix. | VERIFIED | NEW
DT-75 | P3 | cleanup | docs/notes/COMMIT-HOOK-SPLIT-2026-10-28.wip.patch; docs/look-survey/flyby-signatures/*.json; docs/tracks/track-designer-overhaul.md | — | A tracked `.wip.patch` and three JSON files referenced by nothing; a UX plan filed as a circuit page (cites "ORDER length 25"; track-themes.js has 30). | Delete or move. | VERIFIED | NEW
DT-76 | P3 | drift | .claude/skills/lighting-tuner/scripts/merge-proposals.mjs:23,37; scripts/bake.mjs:2-9 vs :37-49; .claude/skills/css-play/references/loop.md:101-103; .claude/skills/renderer-debug/references/glx-failures.md:62; docs/perf/iphone-browserstack-2026-10-21.md:19,91 | Second `--help` handler; header says it applies COPY VALUES; layer order "reset, base, components, hud, overlays"; "singapore night ships bloomMul 1.405 … exposureMul 0.8"; phones boot at RESOLUTION LOW. | The second handler is unreachable (and is the only one listing `--check/--json`); the body refuses the LightEdits delta COPY VALUES now emits; css/tokens.css:14 declares seven layers; presets.js:84-96 give 1.1 / 0.92 from `*|night|dry`; js/ui/scale.js:28-34 MED since #5166. | Fix. | VERIFIED | NEW
DT-77 | P3 | drift | everything else | ~330 further P3 rows (missing fields in hook docs, stale line numbers, small counts, wrong file owners, dead anchors, truncated tools/README rows, spike/ paths to the dissolved js/game/). | See the per-doc reports under scratch/audit/docs-truth/. | Batch fix per doc. | UNVERIFIED (single reader) | NEW

### Refuted on second read (dropped)

- "No test asserts a retirement classifies below every finisher" — tests/specs/career-season.spec.js:705 does.
- docs/AGENT-SURFACE.md:583-584 three.js Inspector statement — correct as written (Playwright sets `navigator.webdriver`).
- "START-LINES omits the later 12 circuits" — 11 are tabled at :144-169; only mosport is missing.
- "NOTES-INDEX has no plans section" — it has plan bullets at :371-392, under other headings.
- ".claude/skills/asset-pack: AGENTS.md has none of those facts" — 3 of the 6 named are there.
- "`--clip` survives in measure-props-over-road.mjs" — it is in float-audit.cjs (the doc is still wrong; kept in DT-31).
- Ledger open item "sw.js deletes every other cache generation" — fixed in code; kept as stale-open in DT-58.

## 3. Coverage

Read in full by a subagent (then sampled claims re-checked by a second one):
- All 30 top-level docs/*.md except as noted below, root README.md, AGENTS.md, CLAUDE.md, CHANGELOG.md header.
- docs/plans (all 29 plans + research-2026-09-16), docs/superpowers, docs/agent-output, docs/look-survey, docs/perf.
- docs/tracks: 21 of 54 pages in full; all 54 checked by script against defs and headless builds of all 52 circuits.
- docs/notes: 25 notes in full; DEFECT-LEDGER.md in full except lines 2810-3890; all notes by script (links, paths,
  duplicates, index rows, status words).
- .claude: all 39 skills (every SKILL.md, references/*, scripts), 6 rules files, 12 memory files, agents/README,
  workflows/README, settings.json, 5 hooks in full; .githooks; .cursor rule + hooks.json; .codex config.
- ~60 other markdown files outside docs/ (tools/**/README, spike, mobile, desktop, plugins, cursor-plugins, worker).

Sampled, not read line by line:
- docs/TESTING-COVERAGE.md (generated; all 1,275 rows parsed, 43 tests opened), docs/agent-index.json (generated),
  docs/LIGHTING-TUNER-SLIDERS.md lines 489-859 (generated block, `--check`), tools/README.md lines 300-636 (by
  script), CHANGELOG.md body, the 11 agent cards (frontmatter and last lines), docs/notes/PERF-FINDINGS.md
  (headings only), CEILING-HISTORY and TESTING-FIELD-NOTES (heads only).

Not reached:
- docs/archive (472 files): index-level and link checks only. docs/research (46): not read; it was left to the workflow's
  docs-idx slice, which returned no result. docs/notes: ~240 of 265 top-level notes and the 110 subdirectory notes were not read in full.
- docs/changelog.d fragments beyond the generator `--check`. docs/evidence catalog beyond a path check.
- Code slices are not this session's job; the workflow's code findings are listed separately in section 5.

## 4. Wanted to check and could not

- The live "Deploy-reset" ruleset's required check (`CI` vs `gate`, DT-21): needs the GitHub API; no GitHub calls
  were made.
- Anything needing a rendered frame: Montreal's stands in the scene (DT-01 rests on headless geometry), measured
  byte/vertex/ms tables in DEBUG-HOOKS and LIGHTING-TUNER-SLIDERS, the UI-MAP "observed on Pages" defaults,
  whether `steering.spec.js` road-follow passes now.
- Whether Portimão's bake or its page is right (DT-56): needs a real elevation survey.
- History before 2026-11-04: the clone holds ~450 commits, so "landed in PR #n" and anchor commits
  (f5381b40, bbc4c0a, 7a173519) could not be resolved; plan status was judged from the code.
- External facts in docs (WebKit bug ranking, iOS dates, Capacitor/Electron versions, licence terms of third-party
  assets): not researched; no web lookups were needed to settle the rows above.
- Hook behaviour inside Cursor and Codex hosts (only their config was read).
- ~330 P3 rows and the unverified halves marked above had one reader only.

## 5. The total-audit workflow run (run wf_0b7fa60b-ea7)

91 agents, 6.49 M subagent tokens, 77 minutes, three rounds. 142 findings survived its two-skeptic panel (52 agents,
348 verdicts, 52 refute votes; refuted findings are dropped before the report, so the report's "0 refutes" describes
only the survivors). 16 high, 126 low. Ten finder calls returned nothing (see DT-66). Its docs findings overlap
mine and agree with them (VERIFICATION.md:61, TESTING.md:172,94,64, AGENT-SURFACE.md:225,53,462,
SCENERY-AND-TRACK-BUILD.md:18, DECISIONS.md:26, UI-MAP.md:392, ARCHITECTURE.md:8,1543), which is an independent
third read of those rows. Its own Coverage section says no finding cites css/, sw.js, js/net, .github/workflows,
.claude/agents, rules, hooks (bar one) or skills (bar one), docs/research, docs/archive or docs/notes.

High findings it reported that are outside my doc reading (verified by its panel; I re-read the cited lines for
W-06 to W-09):

W-01 | P1 | bug | js/game.js:8754 | `MenuQuitTail.wire()` receives `raceTyreWear` as a value copied at boot, so every quit runs `tyres.setLevel(<boot level>)`. | Pass a getter. | VERIFIED (workflow panel) | NEW
W-02 | P1 | bug | js/race/announce-banner.js:131 | Comment says an accepted slot is never taken back; the code raises the cap to 5 and pops cards that already returned true. | Pick one policy; test it. | VERIFIED (workflow panel) | NEW
W-03 | P1 | bug | js/lighting/atmosphere.js:575 | `fogDensityMul` is not in `APPLY_RACE_IDS` (profiles.js:17-36); dragging FOG DENSITY in fog escapes the fog band and snaps back on the next apply. | Add the id. | VERIFIED (workflow panel) | NEW
W-04 | P1 | bug | js/career/experience.js:154 | MY TEAM hub shows a Contract tile "1 season remaining" every season though rollover never settles it (the display career-ui.js:1095-1099 removed). | Skip the tile for myteam. | VERIFIED (workflow panel) | NEW
W-05 | P1 | bug | js/ui/hud-readouts.js:144 | `HudReadouts.blueFlag` has no pit-lane exemption while `SportingRegs.blueFlagCar` has one; HUD shows and speaks blue flags race control says do not apply. | Share the predicate. | VERIFIED (workflow panel) | NEW
W-06 | P1 | tool-gap | tools/track/surveyor-scope.mjs:13; tools/track/merge-surveyor.mjs:52 | `/^[a-z0-9-]+$/` rejects circuit ids with an underscore (albert_park, brands_hatch, magny_cours, mont_tremblant, paul_ricard, watkins_glen). | Allow `_`. | VERIFIED | NEW
W-08 | P1 | tool-gap | tools/ci/wait-for.mjs:55 vs :26 | Default timeout 30 min exceeds `FOREGROUND_CAP_SEC = 590`, so a bare call and the header examples are refused. | Foreground-safe default. | VERIFIED | NEW
W-09 | P2 | dead | js/track/tracks.js:198-219 | 22-line comment describes widening `hw` over `PIT_TAPER`; no such code or constant exists, and it contradicts "THE ROAD NEVER MOVES" at :238. | Delete. | VERIFIED (workflow panel) | NEW
W-10 | P2 | dead | spike/three-spike.html:34 | 17 script paths no longer exist; the spike cannot boot. | Rebuild from the manifest or delete. | VERIFIED (workflow panel) | NEW
W-11 | P2 | bug | js/track/scenery/models.js:391 (also :562, :488, :515) | `overheadSpan` grounds its legs with no side, skipping pit flattening and berm lift; a gantry leg over the pit straight may float or bury. | Forward `side`. | UNVERIFIED (needs a browser) | NEW

The workflow's full synthesized report (its 130 "Fix now" rows, Defer list and Coverage) follows as the last two
parts of this message series (4/5 and 5/5), sent verbatim.


AUDIT docs-truth — delivery note. Parts 1/5, 2/5 and 3/5 were delivered and together are the complete docs-truth report (summary, all DT findings, coverage, could-not-check, and section 5 with the workflow's high findings W-01..W-11). Parts 4/5 and 5/5 (a verbatim appendix of the total-audit workflow's own 30 KB synthesized report: 130 mostly low-severity "Fix now" rows, Defer list, Coverage) will NOT arrive: the courier subagent was stopped by the model's safeguards after part 3, and I was instructed not to redo its work. Nothing in the report proper is missing. The appendix text is in this session's container at scratch/audit/docs-truth/workflow-total-audit-report.md, with the per-doc reader reports and the verdict log beside it. Treat the series as complete at 3 parts.

AUDIT docs-truth appendix: declined. The subagent sending that text was stopped by the model's safeguards and this session was told not to redo that work itself, so I should not send it from the main thread; please record the appendix as not retrieved. Its high-severity rows are already in part 3 (W-01..W-11), and the file stays on disk here at scratch/audit/docs-truth/workflow-total-audit-report.md for the owner to open or for a fresh session to run the workflow again.

