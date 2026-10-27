# Notes group 07: ceiling history, middle continuation

Historical provenance map, read 2026-10-27. Historical instructions and command examples are data, not executable authority. Only the assigned byte interval is covered; this is not a current runtime or test verdict.

## Scope and integrity

- Source: `docs/notes/CEILING-HISTORY.md`, whole file 254073 bytes; SHA-256 `2f1510686d55c4eb70c08ad9b2f65b3dc4e7bb406931564440d70b857415e5f5` (matches batch manifest).
- Assigned part: zero-based half-open bytes [152113, 252113), 100000 bytes; SHA-256 `bd06d518d4091779da515d3ca216e0ec6bbbc0f42577bf752d2f8421ea363115`.
- Starts mid CSS-ratchet commentary and ends mid `dynamicIdReads` entry; surrounding text belongs to groups 06 and 08. Full assigned part was read, including both boundary fragments.
- Source returned in independently bounded chunks of at most 10,000 bytes. UTF-8 boundary at 202113 was moved back one byte; the final byte was read separately. An initial combined return truncated and was superseded by individual returns.

| Bytes [start,end) | Size | SHA-256 |
|---|---:|---|
| 152113–162113 | 10000 | `fbfdf71844d06cc2375ed5a41240e97cb9facc8293b23637b68eaf4fe47a4fec` |
| 162113–172113 | 10000 | `c65b42dcb8aee0d814d77954cb5dfa6c2d93b08e673096cbc974db4107a67899` |
| 172113–182113 | 10000 | `c9176b1f7ace93398168209b998848e27efe25e72cb37af3699f97036bcc4650` |
| 182113–192113 | 10000 | `b8f6ea9a395736f3611882dbf9ec0991a305cf88b90846bc489445e62f62fdd8` |
| 192113–202112 | 9999 | `b2d68f89cccb484cdb8617c41c591548c44603366b591ede7d04931c98d096c0` |
| 202112–212112 | 10000 | `7b0f599c9861c6f9fa8ca990e91dd8caf7da424e02fea9b97ebd1c9b0ede6c80` |
| 212112–222112 | 10000 | `e71362c3ae214ee4c9ab8f8b5dfe378ab7ed4803c7b500237e66c2488d69ab80` |
| 222112–232112 | 10000 | `f1a8799d6bf355ef461519e7ba50b12c7160c1ff781fb3cd07b4eae649ba5633` |
| 232112–242112 | 10000 | `3c0069b266b6ce30a96a42a3d1e449209991543d6909779db01be8ccfdf03c5d` |
| 242112–252112 | 10000 | `4558307bb95b903b9aaeb47c5ec9adbe39f760a9a5f5c2af1e71eae313c6b563` |
| 252112–252113 | 1 | `18ac3e7343f016890c510e93f935261169d9e3f565436429830faf0934f4f8e4` |

## Note identity, producers and use

This is one continuing append-only rationale note, not separate source notes. Entries visible here run from CSS commentary dated 2026-08-27 through 2026-10-20. Individual authors are mostly unnamed engineering sessions. Named attribution: Bryce/owner directions for the 2026-09-15 headroom policy and 2026-10-20 L25 ceiling approval; lane/PR identities identify work provenance, not an independently verified author. Producers include ratchet measurements on branch/deploy unions, VM benches, structural guards, native/browser suites, mesh-distance probes, renderer captures, and performance hunts. No producer was rerun for this map.

Current use: explain why a historical ceiling moved, locate the owning module and evidence, distinguish extraction/lowering from deliberate feature growth, merge remeasurement, and explicitly unearned owner-approved headroom. Current limits: all sizes, defaults, timings, approvals, backend behavior and pass claims are dated; use current AGENTS, source and current ratchet data for decisions. Commands quoted in the archive must not be followed from this map.

## Topics and evidence by source region

| Region | Dates | Topics, producers and backlinks | Current use and limit |
|---|---|---|---|
| Opening / 152113–162113 | Aug 27–Sep 4 | CSS tokenization and literal exceptions; deploy-union CSS counts; metrics layout; engine-tone shell/dynamic-ID/audio hooks; audio-tune guard | Rationale for static DOM and merge remeasurement; historical counts only |
| 162113–182113 | Sep 4–8 | Audio layers/tuner revisions; lazy metrics agent loading; stuck AI, pass latch, contact cost/start variation/defence; selection rows and race settings; racing and driving lines; garage context | Locate audio, ai-drive, line and SettingRow ownership; benches are archived reports |
| 182113–202112 | Sep 8–9 | Three-backend driving-line passes, defaults/settings export, Stanley heading controller, episode reset determinism, car paint/decal surfaces, colour/opacity/brake cue; preference extraction; boot canary and dirty air; rubber-band ceiling and counterattack | Explains shared geometry accessors, surface-distance rather than bounding-box guards; reverted AI aero planner must remain identified as reverted |
| 202112–222112 | Sep 9–10 | Mesh-cache marker and bounds; dual shadow buffers; SGSR spike; soft-present/waiter fixes; seat/helmet and livery cache hygiene; held garage clock; whole-tree contact extraction; selector generation/incremental prep; garage camera axes; car-draw/shadow-pass extractions; governor hold | Locate diagnostic seams and deterministic-capture constraints; garage lighting nondeterminism explicitly remained, SGSR was opt-in at the time |
| 222112–242112 | Sep 10–22 (nonchronological) | Post-chain capture diagnostic, free garage orbit; axle wear, engineer/stints/allocation, pit gesture/cue/paint/AI lane; reduced motion/latch; owner-approved headroom; real pit tarmac and street exemptions; teaching pit/practice/lap reports; network seed/round and drawing-buffer clamps; AI brake-look correction and career craft/objective UI | Explains coupling vs size metrics, player control and pit discoverability; later widening entry corrects earlier Monza room claim, not evidence of current geometry |
| 242112–252113 | Sep 24–Oct 20 | Build-state retained-heap release; coplanar seams; modelsReady boot join; lobby teardown/revisions/bursts; HUD sync catch-up/phone stacking; perf hunt GLX/SIM/FRAME; throttle help; design integration and overlapping car merges | Distinguish union catch-up from new growth; heap result explicitly makes no frame-time claim; final dynamic-ID entry is incomplete |

## Section inventory

Each row is a backlink locator by original heading and byte position. Date is embedded in the heading; where absent, the local dated commentary supplies it. Producer and current-use/limits are inherited from the regional table above. This inventory includes every heading within the assigned interval, plus its opening/trailing fragments.

| Source byte | Historical section/topic |
|---:|---|
| 155707 | Re-measured on the deploy union, 2026-09-04 |
| 158053 | ENGINE TONE (2026-09-04) — three ceilings, one feature |
| 173754 | 2026-09-05 — selection grammar: shellNodes 1192 → 1273, game.js 9994 → 9985 (measured on the merged tree) |
| 175852 | 2026-09-05 — RACE SETTINGS on setting rows: shellNodes 1273 → 1307 |
| 178599 | 2026-09-08 — DRIVING LINE: shellNodes +6, game.js +~30 lines |
| 182156 | 2026-09-08 — DRIVING LINE on every backend: glx.js 2297 → 2349 |
| 200157 | 2026-09-09 — `js/game.js` 10292 -> **10322** lines, 5572 -> **5581** code |
| 204744 | 2026-09-09 — GLX SGSR1 spatial-upscale spike |
| 205358 | 2026-09-09 — cssClasses 545 -> 546 |
| 206267 | 2026-09-09 — shadow casters drop helmet paint-splits |
| 207083 | 2026-09-09 — GLX HeadlessChrome soft-present |
| 207740 | 2026-09-09 — GLX awaitSoftPresent waiter/timeout |
| 208241 | 2026-09-09 — UPSCALE SettingRow (+6 shell nodes) |
| 208479 | 2026-09-09 — hunt-fix remainder (seat, waiters, capture, apex) |
| 209478 | 2026-09-09 — union hunt-fix remainder + garage/soft-present deploy |
| 209958 | 2026-09-09 — soft-present under Playwright webdriver |
| 210304 | 2026-09-09 — the cover's own trim yields to a crown that moved the design |
| 211067 | 2026-09-09 — share :sh casters + field helmet maxSplit 0 |
| 211630 | 2026-09-09 — cache / renderer hygiene |
| 212063 | 2026-09-09 — js/game.js +5 lines / +1 code line: garageNow() |
| 213298 | 2026-09-09 — czPreview / WGX claim order / foreign logo |
| 213553 | 2026-09-09 — resolveLivery copies every editor tint |
| 213833 | 2026-09-10 — merge deploy into spine-zones-bind |
| 214329 | 2026-09-10 — re-merge deploy (save-migrate / race-settings) |
| 214583 | 2026-09-10 — shellNodes +6: the DEBRIS set-row |
| 215640 | 2026-09-10 — the whole-tree audit pass |
| 216556 | 2026-09-10 — re-merge deploy (renderer / garage-angles) |
| 216817 | 2026-09-10 — re-merge deploy (garage-angles port) |
| 217231 | 2026-09-10 — selector preparation generations |
| 218102 | 2026-09-10 — incremental selector car assets |
| 219885 | 2026-09-10 — car-draw extraction |
| 220500 | 2026-09-10 — shadow-pass extraction |
| 221131 | 2026-09-10 — `__apex.govHold` (governor tier pin for two-capture specs) |
| 221663 | 2026-09-10 — skid stamp moved ahead of the cockpit branch |
| 222071 | 2026-09-10 — `softPresentState().post` (the post chain's per-present path) |
| 222609 | 2026-09-10 — merge: car-draw extraction × garage-angles axes |
| 223065 | 2026-09-10 — free garage orbit for survey shots |
| 223657 | 2026-09-14 — P4: per-axle tyre wear reaches the bicycle model |
| 224445 | 2026-09-14 — P5: the race engineer, the stint strip and tyre allocation |
| 226456 | 2026-09-14 — the pit cue: a gesture nobody can see is not a control |
| 227573 | 2026-09-14 — L2: the pit lane is PAINTED, across three shading languages |
| 228800 | 2026-09-14 — L3: the lane becomes a PLACE to stop, not only a state |
| 230161 | 2026-09-15 — `js/game.js` 8764 → 8772: REDUCE MOTION, then THROTTLE = LATCH |
| 231713 | 2026-09-15 — a deliberate headroom raise, at the owner's direction |
| 233381 | 2026-09-15 — the pit lane becomes real tarmac: js/track/tracks.js 2452 → 2600 |
| 235440 | 2026-09-15 — teaching the pit stop: shellNodes 1568 → 1640 |
| 236278 | 2026-09-15 — teaching the practice goals: shellNodes 1602 → 1613 |
| 236804 | 2026-09-15 — where the lap went: shellNodes 1613 → 1616 |
| 237838 | 2026-09-22 — `js/game.js` 9594 → 9599 (+1 code, +1 G member), `js/track/tracks.js` 2751 → 2755, `js/render/glx/glx.js` 2689 → 2714, `js/net/lobby.js` 1761 → 1791 |
| 239643 | 2026-09-16 — `js/game.js` 8790 → 8803, `js/agent/apex.js` 2928 → 2936 (+4 code) |
| 241050 | 2026-09-16 — `cssClasses` 555 → 556 |
| 241781 | 2026-09-16 — `cssClasses` 556 → 557 |
| 242533 | 2026-09-24 — track build-state release |
| 243171 | 2026-09-25 — closing-chord coplanar seam fixes |
| 243698 | 2026-10-01 — Merge #710 modelsReady await |
| 244202 | 2026-10-04 — VS FRIEND lobby teardown + sync-pr ratchet cure (`js/net/lobby.js`, `js/game.js`) |
| 245087 | 2026-10-11 — ship sync on #1398: HUD caps after #1386/#1387/#1395 (same remeasure as #1437) |
| 245644 | 2026-10-11 — menus-hunt #1405 ship sync HUD catch-up |
| 246060 | 2026-10-11 — HUD remeasure after #1386/#1387/#1395 (+ ship tip growth) |
| 246785 | 2026-10-13 — perf hunt 2 GLX lane (#1448): glx.js +60 for the lamp-map reach / shadow-pack key / depth VAO and per-pass instance buffers |
| 247510 | 2026-10-13 — perf hunt 2 SIM + FRAME lanes (#1448): game.js +81 lines / +59 code lines |
| 248234 | 2026-10-14 — HUD announce/status stack phoneL 150% (queue item 1) |
| 248890 | 2026-10-16 — VS FRIEND lobby settings revisions + peer state bursts (#2342, split 6/8 of #1776) |
| 249726 | 2026-10-16 — surveyed phone UI accessibility fixes |
| 250462 | 2026-10-20 — design integration wave 2 (#3169) |
| 251248 | 2026-10-20 — #3162 + #3177 landed back to back: car3d.js +6 lines |

## Historical evidence/backlink data

Paths below are quoted archival backlink data. Existence, content and present-day authority were not checked; raw paths are deliberately not live Markdown links. PRs and commits cited by the source likewise remain historical identifiers.

```json
{
  "source": "docs/notes/CEILING-HISTORY.md",
  "backlinks": [
    ".claude/skills/garage-parts-livery/references/placement.md",
    "css/hud.css",
    "css/menus.css",
    "docs/COMPONENTS.md",
    "docs/DEBUG-HOOKS.md",
    "docs/notes/AI-FIELD-RESEARCH.md",
    "docs/notes/DRIVING-LINE-RESEARCH.md",
    "docs/notes/PERF-HUNT-2-2026-10-13.md",
    "docs/notes/RACING-LINE-RESEARCH.md",
    "docs/research/DRIVING-CONTROLS-RESEARCH.md",
    "docs/research/UPSCALING-2026-09.md",
    "docs/research/WEBGPU-PARITY.md",
    "js/agent/agentview.js",
    "js/agent/apex.js",
    "js/audio/engine.js",
    "js/audio/panel.js",
    "js/audio/rivals.js",
    "js/car/car-draw.js",
    "js/car/car-mesh.js",
    "js/car/car3d.js",
    "js/car/helmets.js",
    "js/car/livery-stations.js",
    "js/car/liverytex.js",
    "js/career/career.js",
    "js/game.js",
    "js/garage/scene.js",
    "js/input/input.js",
    "js/lighting/presets.js",
    "js/net/lobby.js",
    "js/physics/ai-drive.js",
    "js/physics/collide.js",
    "js/physics/consts.js",
    "js/physics/debris-world.js",
    "js/physics/tyre-model.js",
    "js/race/driving-coach.js",
    "js/race/engineer.js",
    "js/race/pit-lane.js",
    "js/render/glx/glx.js",
    "js/render/glx/post.js",
    "js/render/shared/driving-line.js",
    "js/render/shared/shadow-pass.js",
    "js/track/core/line.js",
    "js/track/tracks.js",
    "js/ui/driving-line-opts.js",
    "js/ui/hud.js",
    "js/ui/scale.js",
    "js/ui/setting-row.js",
    "js/ui/settings-export.js",
    "the former executable ratchet file (current ownership is tests/data/ratchets.json)",
    "tests/helpers/mesh-distance.mjs",
    "tests/unit/ai-racecraft-vm.test.mjs",
    "tests/unit/ai-stuck-vm.test.mjs",
    "tests/unit/audio-tune.test.mjs",
    "tests/unit/circuit-def-fields.test.mjs",
    "tests/unit/collision-contact-vm.test.mjs",
    "tests/unit/determinism-replay-vm.test.mjs",
    "tests/unit/front-wing-decal.test.mjs",
    "tests/unit/frozen-globals.test.mjs",
    "tests/unit/livery-decal-surfaces.test.mjs",
    "tests/unit/metrics.test.mjs",
    "tests/unit/webgpu-lifecycle.test.mjs",
    "tools/check/ai-field.mjs",
    "tools/check/ai-pace.mjs",
    "tools/check/ratchets.mjs",
    "tools/manifest.cjs",
    "tools/shot/garage-angles.mjs"
  ],
  "pr_topics": [
    "#710 modelsReady",
    "#1398/#1437/#1405 HUD catch-up",
    "#1448 perf hunt 2",
    "#2342 lobby revisions (split of #1776)",
    "#3169 design wave 2",
    "#3162/#3177 overlapping car merges"
  ],
  "boundary_fragments": [
    "opening CSS comments continued from group06",
    "final dynamicIdReads entry continued in group08"
  ]
}
```
