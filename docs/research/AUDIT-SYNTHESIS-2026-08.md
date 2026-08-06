# Audit-workflow synthesis — dated record (2026-08)

Dated record: the synthesized output of a 21-agent audit workflow (six finders
over the cleanup session's 13-commit diff, the 11-report survey corpus, the
rewritten docs, the guard suite, and a restructure move map; adversarial
skeptics per finding; feasibility checks per move cluster; one synthesizer).
This is an EXECUTION PLAN, not a description of current behaviour — items are
worked off against it and it archives when spent. Raw per-agent outputs live in
the session scratchpad (audit-workflow-raw.json).

---

## FIX-NOW

Ordered by severity. Items 2, 3, 5, 7, 8 touch `js/` — batch them into at most two commits with ONE `?v=N` + `version.json` bump as the last edit (`.claude/skills/bump-cache`); items 1, 4, 6 need no bump.

1. **Red test the session created: `tests/agent-view.spec.js:1535-1536`** — asserts `expect(notes).toContain("DEPRECATED"); expect(notes).toMatch(/frame\(\).*plan\(\).*worldModel\(\)|worldModel/);` but commit a6fb6ce2 deleted the only matching note; the current `agentHelp()` notes array (js/game/agentview.js:2447-2453, verified) has 3 entries containing neither string. The `agent` test group fails right now. **Fix:** replace lines 1533-1536 with a pin that the aliases are *absent* (mirror the REMOVED pin in `tests/agentview-api-contract.test.mjs`). Land first, before any agent-group run.

2. **pick-tests routing gap for both session extractions: `tools/pick-tests.mjs:72-73`** (confirmed by execution — both files route to only tiny+tooling-fast). `:72` routes only `/^js\/game\.js/` to `["behaviour","api","circuit","physics"]`; `:73` is `(cameras|cam-tune|cam-tuner)` with no `cam-modes`. Every immutable driving-model number now escapes physics routing — the exact failure mode the RULES comment at :65-71 documents. **Fix:** add `[/^js\/game\/physics-consts\.js/, ["behaviour","api","circuit","physics"], ...]`; extend `:73` to `(cameras|cam-tune|cam-tuner|cam-modes)` and add `cam-modes` to the ui rule at `:76` (it's a DOM picker). Verify with `test:tooling-fast`.

3. **Wrong curvature sign shipped to agents: `js/game/agentview.js:2309-2310`** — `units: "... +k is a right-hand turn."` and header `:16` say right; `CONVENTIONS` at `:31` says `+k = LEFT-hand turn` and the measured note at :294-297 proves LEFT (all verified). Same wrong `+=right` at `js/game/apex.js:316, 318, 340`. **Fix:** flip all five sites to `+k = LEFT-hand turn` / `+=left`.

4. **Guard-hardening trio** (one commit, no bump): (a) `tests/ui-button-touch.spec.js:459-463` — `if (await throttleBtn.count() > 0) { await expect(throttleBtn).toBeVisible(); }` passes on a screenshot if `#btn-throttle` is removed; delete the `if`, assert unconditionally. (b) `tests/coplanar-faces.test.mjs:58` — `assert.ok(results.length >= 24, ...)` is the pre-roster floor its sibling was already fixed for; copy `tests/prop-clipping.test.mjs:64-67` verbatim (`results.length === MANIFEST.CIRCUITS.length`). Latent (the :68-77 baseline loop catches drops today) but two lines. (c) `tools/fixture-consumer-audit.mjs:26` — `export const FLOOR = 31;` vs 54 real importers (verified by grep); raise to 54 and add a ~5-line slack assertion mirroring `tests/module-size.test.mjs:60-71`.

5. **Session-created constant drift: `js/game/bodyattitude.js:55`** — `const LAT_MAX = 22; // m/s² cornering grip (mirrors game.js)` but a6fb6ce2 moved it to `js/game/physics-consts.js:18` (`LAT_MAX: 22,` — verified); a retune now silently desyncs the visual roll model. **Fix:** `const LAT_MAX = PhysicsConsts.LAT_MAX;` (physics-consts loads earlier per manifest).

6. **Architecture docs contradict the session's own commits** (one commit, no bump): `docs/ARCHITECTURE-REVIEW.md:340` still lists "cam modes ~168" as an open extraction (verified) — mark taken (7c67f9a0 → `js/game/cam-modes.js`); `:208-210` A19 residue still lists `--btn-col`/`--ped`/`--act` as open — 938aed50 deleted them, keep only the 467px-widths sentence. `docs/ARCHITECTURE.md:630` — add a `cam-modes.js | CamModes` table row (plus a pointer for the 11 other undocumented js/game modules); `:658` delete the `state !== "select"` sentence (all four removed); `:59` "back over 8,000 / no guard bounds the file" — now 7,956 lines with a 7,970 ceiling in `tests/module-size.test.mjs:40`; `:82-86` "Four modules are out" — add physics-consts + cam-modes, re-point candidates at REVIEW §8.

7. **Renderer-seam headers describe a retired era:** `js/render/gfx.js:2` ("WebGPU migration, Phase 0"), `:12-13` (claims `wgsl-chunks.js -> wgx.js -> gfx.js` script tags that don't exist — backends are injected by game.js), `:95` ("Resolves to a ready WebGPU backend") never mention TLX, which `:115-119` handles. Same at `js/game.js:39-41` ("WebGPU is OPT-IN ... anything else uses GLX") contradicted by `:104` `pref === "three"`, and the `:1-3` header (drop "HUD", add TLX). **Fix:** rewrite both headers to the three-backend reality (GLX default; TLX via `gfxBackend="three"`; WGX frozen), keep gfx.js's interface-contract section.

8. **The remaining triaged JS-BATCH sweep** — comment-only + behavior-preserving dead-code one-liners, one commit, one bump; every OLD→NEW is already written in the survey files. Enumerated: `index.html:980` HOW-TO-PLAY "cycle CHASE → FAR → COCKPIT → HOOD" (verified; 13 modes exist) + `apex.js:160` twin; stale z-index comments `css/overlays.css:640-644`, `css/menus.css:391-392`, `css/career.css:198, :350`; `js/game/setup-ui.js:3` "8 parts categories" → 12 (verified); the 13-item render drift (`tsl-lit.js` 57 shifted `lit.js:N` cites, `shaders/fx.js:63` uDecalGlow→uGlow, `wgx.js:1391`, `shaders/chunks.js:108`, `glx.js:1-5` header, per code-survey-render D1-D13); `apex.js:136-138` sky() geometry (+3.5 m eye / +34 m target / fov 78) + `agentview.js:919` cite → game.js ~3652 + `:2445` cli add `objective|model`; `js/net/rendezvous.js:174` "NOT WIRED UP" → scope to topicFor/httpPut only (header :44 already says wired); `debrisworld.js:869` "game.js caution" → racecontrol.js; `quali.js:70` nonexistent calibrate path; `telemetry.js:1284` write-only `view._delta`; `tests/scenery-api-contract.test.mjs:3, :11` "24 consumer files in js/tracks/" → 40 in js/circuits/ (verified); circuit elevation comments `hungaroring.js:35`, `monaco.js:46-47`, `portimao.js:44-45`; `spike/three-spike.html` add `../js/log.js` (first) and `../js/track/graph.js` (after models.js — page currently throws ReferenceError, zero hits verified; no bump needed for spike/); `store.js:12`, `rendezvous.js:120-122`, `audio.js:606-607`; dead code `game.js:821` (`!A && !A`), `:4290` write-only `wheelAngle`, `:4375` unreachable undo, `:5767` "Bumper" comment.

## RESTRUCTURE

Execute in this order, after FIX-NOW lands (item 1 especially — never reorganize on top of a red suite).

### R1. Extract MUSIC & SOUND panel → `js/game/audio-panel.js` — **GO** (lowest risk, proves the ratchet works, fully specified)

`js/game.js:6534-6720` (include `:6534` `els.soundbtn.hidden = false;` — the stated 6535 start is off by one) + the boot restore `:7928-7937`. Lockstep, gaps folded in:
1. Shape: `AudioPanel.create(G)` wires DOM at eval and **returns an `init()`** that game.js calls at the old `:7928` position (netLobby.wire() pattern) — do NOT run setSound/setMusic at create time (~line 2800, before CamModes/DataHub/loadTrack).
2. game.js: add the one new `G` pair `get/set musicEnabled` (soundOn's pair exists at G:2669); convert the ~15 bare `soundOn` reads in handlers (:6680-6718) to `G.soundOn`.
3. Do NOT expose `syncAudioPanel` as a global — `js/game/spotify.js:268` calls it if defined; today that branch is dead and must stay dead (or be fixed as a separate deliberate decision).
4. `tools/manifest.cjs`: FULL entry after `js/game/spotify.js` + HARD_EDGES pair `['js/game/audio-panel.js','js/game.js']` (aerozones pattern, :299).
5. `index.html`: `<script>` tag at the manifest position (load-order.test.mjs:41/:63 enforce).
6. `sw.js`: no edit (precache parses tags).
7. `tests/module-size.test.mjs:40`: lower 7970 → ~7790 (convention, not forced — post-move slack ~204 is under the 400 trip).
8. CLAUDE.md file layout: add the row (docs-integrity:309 is a hard guard).
9. `tools/pick-tests.mjs`: add `audio-panel` to BOTH the audio rule (:78) and the ui rule (:76) — menu-survey/ui-scale/ui-button-touch/menu-keyboard specs all click this panel.
10. Bump `?v` + version.json LAST; run `test:tiny` → `test:tooling-fast` → `node tools/test-bg.mjs audio` (+ ui if handlers changed).

### R2. tests/ split — `tests/specs/` (111) + `tests/unit/` (49) + `tests/helpers/` (7); `tests/data/`, `tests/manual/` stay — **GO** (highest value; land as ONE commit via `git mv`, never with a background run in flight; no ?v bump)

Lockstep, feasibility gaps folded in (silent-failure items marked ⚠ — no guard turns red):
1. `package.json`: every `tests/<name>` in the ~28 `test:*` scripts → `tests/specs/`/`tests/unit/`.
2. `playwright.config.js:81` globalSetup and `:137` reporter → `tests/helpers/...`; testDir/RENDER_SPECS globs/testIgnore need no change (verified).
3. Imports: 66 specs `./fixtures.js` → `../helpers/fixtures.js` (+ track-helpers/qr-camera/f1-api-mock/output-paths); ~40 unit suites' ROOT `".."` → `"../.."`; `tests/track-helpers.js:45` manifest require → `../../tools/`.
4. ⚠ `tests/output-paths.js:7` REPO_ROOT `".."` → `"../.."` AND `tests/output-paths.spec.js:12` expectation together (they drift symmetrically green otherwise, writing galleries into tests/); same in `tests/qr-camera.js:30`.
5. ⚠ `tools/fit-audit.mjs:27` + `tools/menu-fit.mjs:32` — try/catch dynamic import of `../tests/f1-api-mock.js` swallows the break; PATH_RE can't see it. Edit explicitly.
6. ⚠ `tests/f1-track-accuracy.spec.js:18` `./data/...` → `../data/...` (browser-only failure; a `../helpers` grep won't find it).
7. ⚠ `tests/manual/` imports of output-paths (`inspect.spec.js:20`, three gallery specs) + `manual/README.md:8-9` prose.
8. Vacuous-pass traps — widen regexes to admit `/`: `tests/test-groups.test.mjs:154` and `tests/docs-integrity.test.mjs:343`; plus their flat readdirs (test-groups :83, :92-93, :125; docs-integrity :236-237, :347) → walk specs/+unit/.
9. `tools/test-coverage-audit.mjs:39` AND its duplicate scan in `tests/test-coverage-audit.test.mjs:60-63`; `tools/fixture-consumer-audit.mjs:37` IMPORTS_FIXTURES + `:52` readSpecs dir (else FLOOR reads 0) AND the synthetic fixtures in `tests/fixture-consumer-audit.test.mjs:15` encoding the old import shape.
10. ⚠ `.github/workflows/ci.yml` sweeps filter `tests/(prop-clipping|...)` → `tests/unit/(...)` (fail-open otherwise).
11. Hardcoded cross-file reads: `tests/span-kinds.test.mjs:46`, `tests/docs-integrity.test.mjs:217`, prop-clipping/coplanar ROOT-tools paths.
12. Docs: TESTING.md's 24 path lines; keep count phrases that the updated regexes in test-groups:96-97 and docs-integrity:236-249 still match, in TESTING.md, CLAUDE.md AND README.md simultaneously ("root" wording must go); skills' 20 tests/ paths (guard-enforced); tools/ prose refs (guard-enforced).
13. Verify: `node --check` moved helpers, `test:tooling-fast` + `test:audit`, then targeted greps for `\.\./tests/`, `\./data/`, `\./fixtures`, `\./output-paths`, `\./f1-api-mock` — the ⚠ items are NOT proven by the suites.

### R3. tools/ subdirectories, **reduced form only** — `tools/net/`, `tools/car/`, `tools/capture/`, `tools/lighting/` — **CONDITIONAL GO, last; drop `tools/track/` and `tools/test-infra/`**

The cut line is the verdict: track/ carries five unlisted consumers plus internal `path.join(ROOT,"tools",...)` literals that survive a ROOT fix and exit 0 (coplanar-audit.cjs:360 class), and test-infra/ breaks ~40 unguarded package.json lines for zero navigability gain. The four kept families are self-contained (one-level ROOT confirmed: apex-capture.mjs:37, carshot.mjs:20, ab-lighting.mjs:27). One family per commit:
1. Per moved file: ROOT `'..'` → `'../..'` + sibling requires — code audit, not grep (relative imports are invisible to PATH_RE's lookbehind).
2. lighting/ commit MUST include `tests/lighting-ab.spec.js:15` (`import ... from "../tools/ab-lighting.mjs"`) — outside tooling-fast and CI, breaks silently otherwise.
3. `tools/README.md` re-index (rows survive by basename; prose paths don't) + each new subdir name listed; CLAUDE.md Key commands + skills' tool paths (guard-enforced, heaviest: car-viewer 12× render-car.mjs).
4. Deepen `tests/docs-integrity.test.mjs:395-402` to walk subdirs in the same commit, or every moved tool permanently exits the index guard.
5. Keep flat: manifest.cjs, carview.html (load-order:149-152 hardcodes it), harness.mjs, output-paths.mjs, run-playwright, pick-tests, test-bg, verify-track, all baselines/audits.
6. Validate per family: `test:tooling-fast` PLUS a no-op invocation of each moved tool — tooling-fast alone is insufficient.

## DEFER

- **js/game/ squashed→hyphenated rename — NO-GO, final**: explicitly forbidden by CLAUDE.md ("grandfathered — do not churn"), 175+ refs, zero functional payoff, and feasibility found five more unlisted edges (race-control.test.mjs:41 VM loader, CARVIEW manifest, three SKILL.mds, silent CSS/spike pointers). Cheap alternative if wanted: a unit guard allow-listing the 14 names and requiring hyphens for new files.
- `playwright.config.js:54` false "coverage-audit asserts every spec lands in exactly one project" comment — fix when next touching the config; consider the screenshot-heuristic guard then.
- `tlx.js:1-117` contradictory M1-M8 milestone header — collapse to one current-state paragraph next time tlx.js is edited; history belongs in spike/ADOPTION-PLAN.md.
- Five duplicated phone-UA sniffs (glx.js:26, game.js:100, wgx.js:91, liverytex.js:18 vs input.js pointer-coarse) — needs a new shared file + manifest entry; not worth it standalone.
- Tombstone-comment house rule + sweep ("used to sit here" genus, incl. game.js:2711 added this session) — adopt the rule in CLAUDE.md at the next doc pass; sweep opportunistically.
- Module-idiom split (`window.X` vs `const X` vs arrow-IIFE) — document one canonical shape in CLAUDE.md's new-file checklist; do not churn existing files.
- Never-fail asserts in `tests/camera-driving-hooks.spec.js:188-207` and `tests/headless-api.spec.js:290-303` — each needs a per-test design decision, not a mechanical fix.
- `tests/test-groups.test.mjs:6-7` "98 specs sit flat" header — R2 rewrites that header anyway; don't touch twice.
- Triage sections for the four never-triaged survey reports (game-ui, track, tests, tools) — bookkeeping only once FIX-NOW #8 lands their concrete items; or fold the remainder into ARCHITECTURE-REVIEW's backlog so the triage file stays honest.

---

## Appendix — all 35 verified findings (compact)

Full evidence + fixes in the scratchpad raw record; the synthesis above is the
deduplicated execution order. Zero findings were refuted by the skeptics.

| Sev | Kind | Where | Claim | Finder |
|---|---|---|---|---|
| HIGH | UNAPPLIED | `tests/agent-view.spec.js:1535` | The agentHelp() spec still asserts the deprecated-aliases note that commit a6fb6ce2 deleted from agentview.js, so the agent test group now fails on... | session-diff |
| HIGH | BUG | `tools/pick-tests.mjs:72` | The session's two extractions were never added to the pick-tests RULES, so an edit to js/game/physics-consts.js — every immutable driving-model num... | session-diff |
| HIGH | UNAPPLIED | `js/game/agentview.js:2310` | objective().units ships the WRONG curvature sign to agents — '+k is a right-hand turn' — contradicting the file's own CONVENTIONS string ('+k = LEF... | session-diff |
| LOW | INCOHERENCE | `js/net/rendezvous.js:174` | The session rewrote the file header to say seal()/open() ARE wired, but left the inner comment 60 lines below still declaring the opposite — the sa... | session-diff |
| LOW | UNAPPLIED | `tests/scenery-api-contract.test.mjs:3` | A cluster of the session's own triaged JS-BATCH fixes never landed: the 938aed50 comment batch covered roughly half the list, leaving false stateme... | session-diff |
| LOW | DOC-DRIFT | `spike/three-spike.html:33` | The spike page claims its script list mirrors manifest TRACK_VM but omits js/log.js and js/track/graph.js, which TRACK_VM includes — the page canno... | session-diff |
| HIGH | UNAPPLIED | `js/render/three/tsl-lit.js:258` | The entire 13-item render DRIFT cluster triaged JS-BATCH (triage line 73-74) was never applied — no js/render/* file appears in `git diff --name-on... | triage-completeness |
| HIGH | UNAPPLIED | `js/game/setup-ui.js:3` | Four survey reports (code-survey-game-ui.md, -track.md, -tests.md, -tools.md) never got triage sections — triage line 55 still says 'Pending report... | triage-completeness |
| HIGH | UNAPPLIED | `spike/three-spike.html:34` | The triaged 'spike fix' (triage line 86) for three-spike.html's drifted TRACK_VM mirror was not applied: the page still lacks js/log.js and js/trac... | triage-completeness |
| HIGH | UNAPPLIED | `js/game/apex.js:137` | Three agent-surface JS-BATCH items (triage lines 36-38) were skipped even though both target files WERE edited by the batch: the sky() doc block de... | triage-completeness |
| HIGH | UNAPPLIED | `index.html:980` | The user-facing HOW TO PLAY camera line still teaches 4 modes (and even the wrong prefix order — DRIFT sits between FAR and COCKPIT), and the three... | triage-completeness |
| LOW | UNAPPLIED | `tests/scenery-api-contract.test.mjs:3` | The circuits-survey JS-BATCH items (triage lines 80-81) were all skipped: the contract test header cites a nonexistent directory and wrong count, a... | triage-completeness |
| LOW | UNAPPLIED | `js/game/debrisworld.js:869` | The one partially/wrongly-landed JS-BATCH item: the debrisworld 'caution lives in game.js' fix was triaged as x2 (triage line 47) but the batch fix... | triage-completeness |
| LOW | UNAPPLIED | `js/game/bodyattitude.js:55` | The residual small JS-BATCH/borderline singles were not landed, and the LAT_MAX mirror comment was actually made MORE wrong by this session's own p... | triage-completeness |
| HIGH | DOC-DRIFT | `docs/ARCHITECTURE-REVIEW.md:340` | The §8 backlog still lists "cam modes ~168" as an open game.js extraction candidate, but commit 7c67f9a0 (this session, after the register was writ... | docs-vs-code |
| HIGH | DOC-DRIFT | `docs/ARCHITECTURE.md:630` | The module-contract doc has zero mention of js/game/cam-modes.js — the newest shipped module (extracted 7c67f9a0, which updated CLAUDE.md only). It... | docs-vs-code |
| HIGH | DOC-DRIFT | `docs/ARCHITECTURE-REVIEW.md:208` | The §7 open-defect register's "A19 residue" entry lists dead CSS tokens --btn-col and --ped/--act as open, but commit 938aed50 (this session, after... | docs-vs-code |
| LOW | DOC-DRIFT | `docs/ARCHITECTURE.md:658` | The states paragraph says vacuously-true `state !== "select"` guards survive in game.js, but commit 938aed50 removed all four; none remain. | docs-vs-code |
| LOW | DOC-DRIFT | `docs/ARCHITECTURE.md:59` | The Reorg section says game.js "is back over 8,000" lines "because no guard bounds the file" — both halves are now false: the file is 7,956 lines a... | docs-vs-code |
| LOW | DOC-DRIFT | `docs/ARCHITECTURE.md:82` | The "game.js pass 2" follow-up bullet's present-tense inventory "Four modules are out" is stale: this session also moved physics-consts.js (a6fb6ce... | docs-vs-code |
| HIGH | INCOHERENCE | `tools/pick-tests.mjs:73` | The session extracted js/game/cam-modes.js (commit 7c67f9a0) but never added it to the pick-tests routing table, so an edit to the CAM picker UI is... | guard-health |
| HIGH | BUG | `tests/ui-button-touch.spec.js:460` | The test "throttle button visible in button mode" cannot fail for the reason its name states: the only expect is inside an existence guard, so remo... | guard-health |
| HIGH | BUG | `tests/coplanar-faces.test.mjs:58` | The coplanar sweep's roster floor is still the pre-fix `>= 24`, so the sweep can silently drop up to 16 of the 40 circuits — the exact defect its s... | guard-health |
| HIGH | MESS | `tools/fixture-consumer-audit.mjs:26` | The fixtures-adoption ratchet sits at FLOOR = 31 while real adoption is 54 (measured with the tool's own IMPORTS_FIXTURES regex), and unlike every ... | guard-health |
| HIGH | MESS | `tests/test-groups.test.mjs:83` | A tests/ directory split (specs/unit/helpers/data) requires coordinated edits to nine guard sites; worse, three guards go silently VACUOUS rather t... | guard-health |
| LOW | MESS | `tests/docs-integrity.test.mjs:399` | A tools/ subdirectory reorganization degrades the tools-index guards silently and breaks five guard suites' hardcoded tool paths loudly; the exact ... | guard-health |
| LOW | DOC-DRIFT | `tests/scenery-api-contract.test.mjs:3` | Guard files' own headers drifted and nothing can catch them: scenery-api-contract still says the contract serves "24 consumer files in js/tracks/" ... | guard-health |
| LOW | DOC-DRIFT | `playwright.config.js:54` | The RENDER_SPECS comment claims "a coverage-audit npm script asserts every spec lands in exactly one project" — no such assertion exists; the real ... | guard-health |
| HIGH | DOC-DRIFT | `js/render/gfx.js:12` | The 86-line gfx.js header still describes the retired WebGPU-Phase-0 era: it claims a script-tag load order that no longer exists, frames the seam ... | mess-hunter |
| LOW | INCOHERENCE | `js/game.js:39` | The first prose a cold reader meets after game.js's DOM map — the renderer-selection comment — describes a two-backend world (WebGPU else WebGL2) t... | mess-hunter |
| LOW | MESS | `js/render/three/tlx.js:33` | tlx.js opens with a 117-line milestone changelog (M1, M3-M8 STATUS paragraphs) whose earliest entry states the opposite of the later ones — the hea... | mess-hunter |
| LOW | MESS | `js/game/cam-modes.js:9` | js/game/ now has a three-way module-creation idiom split (`const X = (function(){`, `const X = (() => {`, `window.X = (function(){`) plus two heade... | mess-hunter |
| LOW | MESS | `js/render/glx.js:26` | The 'is this a phone' expression is copy-pasted byte-for-byte in four files, and a fifth module defines mobile a different way — five definitions o... | mess-hunter |
| LOW | MESS | `js/game.js:2712` | The codebase accretes 'tombstone' comments that narrate removed code or previous comments rather than describing anything present — and this cleanu... | mess-hunter |
| LOW | UNAPPLIED | `js/game/bodyattitude.js:55` | This session moved LAT_MAX out of game.js into the new PhysicsConsts global but left bodyattitude.js's hand-mirrored copy pointing at the old home ... | mess-hunter |
