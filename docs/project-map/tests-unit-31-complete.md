# Unit batch 31 — complete source map

Read-only mapping of all 22 files / 4,910 physical lines listed by group 31 in `docs/project-map/unit-batches.json`. Tests and browser flows were not run. No runtime/test source was changed. SHA-256 values below pin the exact bytes read; ranges are inclusive, one-based. Case rows identify assertion call spans, including multiline calls, without reproducing predicates. Shared fixture assertions are described separately. Parameterized registration sites list all variants in their meaning column.

Navigation: read `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`; used local `bash tools/mcp/lsp-mcp.sh` outlines for CarDraw, MenuNav, MirrorPass, GameMetrics, NativeDownload, Native, FrameLights, CarMesh, Assets, FlybySight and FlybySeq (plus definition lookups). Production coordinates below come from those outlines and bounded source inspection. LSP identifies declarations, not execution coverage.

Reading ledger: every test file was returned completely in separate source chunks of at most 100 lines and 10,000 characters; most reads used 50–75 lines. A truncated aggregate output was repaired with fresh 50-line reads for merge-gate lines 101–300. Comments/imports/setup/teardown and tail lines were included. Read helpers: car-draw-vm 1–171, mirror-pass-rig 1–101, ax26 1–57, game-source 1–84. Other fixture behavior is visible in the test closures and the named shared-helper imports.

All scratch histories, placeholder paths, `fixture/` entries, temporary model files, sample URLs, fake root `/nowhere`, arbitrary SHA strings and imagined PRs in cases are test inputs, not current production references. Named production files and helpers are repository references. Real Git, Python, filesystem or CLI activity described below is what the tests would execute; none was launched for this map.

## File ledger

| Source | Fully read range | SHA-256 | Registration sites |
|---|---|---|---|
| `tests/unit/menu-car-prep-yield.test.mjs` | 1–91 | `7d250fbeb400f2c44f0e1dbbc2e748b0145fbadad238845e287bb0c2e52b4a1c` | 4 |
| `tests/unit/menu-nav-spatial.test.mjs` | 1–331 | `4acd587ee1e1d7a87ba0a2f22457f07b6577a01172e21785e5d1f28eb0580d0c` | 14 |
| `tests/unit/menu-sentinel-resize.test.mjs` | 1–135 | `e9f7766adea3a1932365265e1b9847f2128f6923eefa93c0507de15050c9d259` | 6 |
| `tests/unit/merge-gate.test.mjs` | 1–367 | `331872d990577ff45d8990f75a7f0da661e9dade9deb191e15ade44076dde516` | 19 |
| `tests/unit/merge-hygiene.test.mjs` | 1–102 | `7f2ad6cc365cc785871b2c79ccef057d8de25ddef3d03bc1077378ea63d34ea4` | 6 |
| `tests/unit/mesh-census.test.mjs` | 1–160 | `f5b2ddc2739c1abb49f346d17b524d0a23bde5376beb0389dfcebc8f62fd3f7d` | 12 |
| `tests/unit/metrics.test.mjs` | 1–578 | `519928a3c95c9b303042e4d267339d6d72ca37e3892c8e885f2d29aa681e090b` | 30 |
| `tests/unit/miami-hard-rock-orbit.test.mjs` | 1–114 | `d6cca7b651d31808e6c84859c05bc361d5fc457ddb557560b1096a226d4cd9d8` | 2 |
| `tests/unit/mirror-glass-night.test.mjs` | 1–74 | `e075c2c6f08f448092c1c2be96222cfa4302ab21a913d5d5d63e1b0e9fcff71a` | 2 |
| `tests/unit/mirror-lights.test.mjs` | 1–160 | `b4d32df55e7e26cb3556783e6feec40a01710f0d3dd7601541c6a314dee37eab` | 5 |
| `tests/unit/mirror-pass-carbuild.test.mjs` | 1–433 | `97df19c412e4a7d7e4b9e682bd579b1fae4bc768b3d1f796743c66fc942967cd` | 17 |
| `tests/unit/mirror-pass-prepare.test.mjs` | 1–191 | `ed4666f8dd9392c8d58d0899ca061edbbc7f0b15ea67037a2d9b1e5455e8df64` | 10 |
| `tests/unit/mirror-pass-watch.test.mjs` | 1–142 | `15da845be58238bdf4b49fabd5f09b0a5dfa602a8854131ab06e8c0531cd28c5` | 6 |
| `tests/unit/mirror-pass.test.mjs` | 1–368 | `fd111816116ccca8cd857d45b5b743559d78ec0434ed024cfb74286245e5113c` | 17 |
| `tests/unit/mix-duck-radio.test.mjs` | 1–401 | `27de3915c8f71aea1b23cb72017af65a65c50efab9601a4bff2d56785052ac7b` | 16 |
| `tests/unit/mobile-config.test.mjs` | 1–105 | `ef1363bb2838d204791c3ca8e3f7f61c6da0f304a44d23bbde8b616f7582395d` | 9 |
| `tests/unit/mobile-native-download.test.mjs` | 1–545 | `365dfc14be3f08776831154fc689ae6a14bd2197f4c5f72b9128862eff4b6f98` | 25 |
| `tests/unit/mobile-sync-web.test.mjs` | 1–199 | `745d25ed7f13d5c75a2827b9683435ce1563a1110ef0f45f8d835da32888531f` | 12 |
| `tests/unit/model-pack-format.test.mjs` | 1–219 | `06b10125a7e2d0283c6fe6fb22d4e8fa4997835c2cae805199fc809cee8f6049` | 8 |
| `tests/unit/model-sway-parity.test.mjs` | 1–94 | `3793f346a580ba7aa30aedcd840c4e9797aa25f2b13c8d259ec37892dbf8ef8f` | 3 |
| `tests/unit/monaco-fairmont-orbit.test.mjs` | 1–38 | `88f3b85224c2a10e6a2348f34bcf27d9a0fa01d0ccf457548a2c7cec324a365d` | 1 |
| `tests/unit/monza-coplanar-clip.test.mjs` | 1–63 | `1cd71228b725396dd708b16a22b803d9547870355ee57c7332481422e44eff9c` | 1 |

## Fixture boundaries

`tests/helpers/car-draw-vm.mjs` runs real CarDraw, FieldLod, MirrorPass, matrix math and real teams; its Car3D/Parts/Career/rendering/road/DOM are reduced stand-ins. `tests/helpers/mirror-pass-rig.mjs` executes real MirrorPass and matrix math with recorded render calls, one straight road, four fixture cars, pooled vantage pose, manually controlled timers/clock and fake class/style/layout. `tests/helpers/ax26.mjs` fetches local bytes through real Assets.model, so format tests use the shipped reader, not a duplicate parser. `tests/helpers/game-source.mjs` discovers instantiated carved modules from manifest/global creation calls and joins them with game.js; symbolSource requires exactly one matching declaration.

## Case map

### tests/unit/menu-car-prep-yield.test.mjs

Fixture: rig 22–33; carDrawVm real CarDraw/MirrorPass with counting Car3D, real teams and fake renderer; +5 ms clock and manually drained queues.

Production target (applies to each case below): js/car/car-draw.js:1158–1233 (prepareMenuCarAssets); menuStepYield in same module.

Limits: Scheduling/cache behavior in a VM; no real frame pacing or GPU latency measurement.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| with frames arriving, the prep finishes without any 32 ms timer firing | 35–50 | 46, 47, 48, 49 | prepareMenuCarAssets / menuStepYield | Draining only animation callbacks and zero-delay work completes multiple slices; queued 32 ms fallbacks need never fire. |
| with no animation frame (hidden tab), the 32 ms fallback still drives it | 52–63 | 59, 61, 62 | prepareMenuCarAssets / menuStepYield | Without rAF, repeated 32 ms callbacks finish preparation and prove work still yields. |
| a frame and its fallback both firing resume the prep once | 65–78 | 74, 76-77 | prepareMenuCarAssets / menuStepYield | Firing both queues completes with unique body keys, detecting double continuation. |
| LEGENDS preps the ONE picked legend, not its twelve picker seats | 80–91 | 90 | prepareMenuCarAssets legend filter | Real-team seat count plus one selected legend is the completed record, rather than all twelve legend picker seats. |

### tests/unit/menu-nav-spatial.test.mjs

Fixture: extractFn 27–36; loadMenuNav 38–52; box elements 54–63; mini-dom and explicit focus/scroll model.

Production target (applies to each case below): js/ui/menu-nav.js:102 nearestPane, :134 onWheel, :207 items, :249 pickSideways, :276 step, :452 ownsArrows, :542 onKeyDown.

Limits: Real navigation functions with fabricated boxes/DOM; no browser layout, CSS zoom implementation or actual trusted-event dispatch is established.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| MenuNav leaves spatial-editor arrows to the control while retaining paging navigation | 65–80 | 69, 70, 72, 73, 76, 77, 79 | MenuNav.ownsArrows | Trusted editor arrows stay owned while synthetic pad arrows can exit; paging remains navigable and selects retain horizontal stepping. |
| MenuNav leaves owned listbox option keys to the widget without exempting unrelated buttons or grids | 82–97 | 87, 89, 90, 92, 93, 95 | MenuNav.ownsArrows | Only an option inside an owned listbox gets the listbox exemption; pad vertical movement can leave, unrelated roles/containers cannot capture navigation. |
| spatial entry uses the selected listbox stop; synthetic vertical keys leave and keyboard keys stay | 99–136 | 117, 123, 124, 125, 126, 127, 128, 133, 135 | MenuNav.items/onKeyDown | Spatial entry and Home/End use the selected option; keyboard vertical input stays with widget while pad input exits and re-enters. |
| \`page keys carry focus through a ${horizontal ? "horizontal strip" : "vertical pane"} at ${zoom} scale\` | 139–200 | 182, 186, 187, 189, 190, 195, 196, 198, 199 | MenuNav.onKeyDown paging / CssZoom seam | Six variants (horizontal/vertical × zoom 0.4/1/2) page 90% in local units, transfer focus visibly, and continue the next arrow without a stale-focus snapback. |
| pickSideways: mid-list ArrowLeft lands in the adjacent column at similar height | 203–214 | 212-213 | MenuNav.pickSideways | Left-side candidates are ranked by vertical closeness, ignoring a right-hand DOM successor. |
| pickSideways: nothing to that side returns null (DOM wrap is step()'s job) | 216–222 | 220, 221 | MenuNav.pickSideways | A side without candidates returns null; a rightward candidate is selected for rightward input. |
| step(): in-band neighbour still beats an out-of-band header | 224–230 | 229 | MenuNav.step | An overlapping in-band left neighbor outranks the distant header. |
| step(): ArrowLeft from mid-list reaches a non-overlapping left column | 232–243 | 241-242 | MenuNav.step | After an in-band miss, left navigation reaches the adjacent column at similar height. |
| step(): ArrowDown stays in-band and does not jump to a sideways header | 245–252 | 251 | MenuNav.step | Down selects the same-column successor rather than an off-band control. |
| step(): vertical wrap still uses the in-band edge, not an out-of-band item | 254–261 | 260 | MenuNav.step | Down from the final row wraps to the in-band top. |
| step(): chip-row Left/Right stay in-group until an end, then fall through | 263–276 | 272, 273, 274-275 | MenuNav.step chip row | Chip rows retain internal horizontal movement until an edge, then permit spatial escape. |
| \`telemetry modal pages its ${className} region and contains wheel gestures at the edge\` | 279–303 | 293, 294, 296, 301, 302 | MenuNav.nearestPane/onKeyDown/onWheel | Three modal-region variants page/end locally; wheel at bottom does not redirect vertically into another pane (only horizontal-strip lookup occurs). |
| step(): ArrowDown off the last control of a scroll pane lands on the foot below it, not the wrap to the top | 311–319 | 318 | MenuNav.step pane footer | Down from the final pane control reaches the outside footer before wrapping. |
| step(): the pane's foot never beats an in-band successor, and Down from the foot does not enter the pane | 321–331 | 329, 330 | MenuNav.step pane footer | An in-band successor beats the footer; Down from a footer with no pane retains the ordinary wrap. |

### tests/unit/menu-sentinel-resize.test.mjs

Fixture: gameSource union 12; fnBody extraction 14–25; loadTrackAt 31–42; stepped closure 65–88; PATH_STUB 29.

Production target (applies to each case below): js/game.js:1964–2002 loadTrackStepped; :2014–2034 loadTrack; :2161 menuKey; :2252–2312 scheduleFlybyTrack; :2471 startRaceBody; :9493 scheduleGfxResize.

Limits: Extracted closures stub build/adoption and dependencies; source-only rows do not prove a live resize/render or race entry.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| menu and flyby loadTrack do not arm the race-start sentinel | 44–53 | 47, 48, 49, 50, 51 | game.js loadTrack :2014 | Menu/results/qualifying builds once, disarms old sentinel state, and clears all stale menu-gate fields. |
| a rebuild already in race or count still arms across loadTrack | 55–62 | 58, 59, 60 | loadTrack :2014 | Race/count rebuilds arm before build and never disarm the live sentinel. |
| loadTrackStepped matches loadTrack: menu skip, race/count arm | 64–97 | 90, 91, 92, 94, 95, 96 | loadTrackStepped :1964 | Extracted paced loader adopts a fake built world and applies the same menu/count sentinel distinction. |
| startRaceBody still arms the sentinel after the world exists | 99–104 | 101, 102-103 | startRaceBody :2471 | Source contract requires unconditional race-start arming rather than inheriting the menu gate. |
| a resize burst schedules one gfx.resize per animation frame | 106–123 | 115, 116, 118, 120, 122 | scheduleGfxResize :9493 | Three resize calls queue one rAF; only draining it resizes, and a later burst can queue another. |
| menuKey has no pane rect, so a resize cannot rebuild through the flyby gate | 125–135 | 127, 128, 130, 131, 132, 134 | menuKey :2161 / scheduleFlybyTrack :2252 | Identity is circuit/time/weather/grid only and flyby prep compares that key; source requires coalesced listener wiring. |

### tests/unit/merge-gate.test.mjs

Fixture: git-fixture-env first; scratch 23; HISTORY 66–67; real disposable Git histories 90–115/135–163; fakes 166–178; Python bridge 233.

Production target (applies to each case below): tools/ci/merge-gate.mjs:40–50 constants, :58–158 verdicts/history, :164–239 env/ratchets/local merge, :260–337 evaluator/CLI; tools/lib/gate-receipt.mjs:35–218; .claude/hooks/merge_policy.py.

Limits: Real Git/Python activity is defined by the tests but was not run in this mapping. Fixture paths under temporary repos and /nowhere are fictional; fake GitHub never proves hosted protection or land workflow execution. Ratchet integration stubs npm and unrelated suites.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| openVerdict: only an open, non-draft PR passes | 27–32 | 28, 29, 30, 31 | merge-gate openVerdict :58 | Open and non-draft is the only accepted readiness shape, including null refusal. |
| holdVerdict: the \`hold\` label vetoes, in either API shape, case-insensitively | 34–40 | 35, 36, 37, 38, 39 | holdVerdict :66 | Hold is case-insensitive and works for string and API-object labels. |
| planRow: open items refuse, a \`land:\` item is exempt, no Plan passes | 42–48 | 43, 45, 46, 47 | planRow :72 | Unfinished Plan work refuses; land and legacy READY items are exempt; absence of Plan passes. |
| ciVerdict: the required check-run on the head, newest attempt, success only | 50–57 | 51, 52, 53, 54, 55, 56 | ciVerdict :82 | Only exact CI check name counts, with completed success from the latest attempt. |
| game paths: js/ css/ assets/ index.html sw.js | 59–63 | 60, 61, 62 | isGamePath/gameFiles :44–46 | Game-path classification recognizes only the designated prefixes/exact shell names and normalizes leading dot-slash. |
| gameMergesBehind counts game merges between the tip and the merge-base; non-game merges and plain commits do not count | 69–75 | 70, 71, 72, 73, 74 | gameMergesBehind :99 | First-parent fixture walk counts only game-touching merge commits, stopping at merge-base or reporting off-line reach failure. |
| distanceVerdict: at most N game merges behind (default 2); an off-line merge-base counts everything walked | 77–88 | 78, 79, 80, 82, 83, 84, 85, 86, 87 | distanceVerdict :111 | Default two-merge distance boundary, custom limits and off-line history evidence are enforced. |
| baseHistory / distanceFor over a real repo: first-parent merges with their first-parent diff, down to the merge-base | 90–115 | 92, 104, 105, 106, 107, 109, 110, 111, 112, 113 | baseHistory :126 / distanceFor :144 | Real local Git first-parent diffs ignore direct commits/non-game merges; distance finds fork, applies bound and reports bad head as error. |
| ratchetsOnMerge: every count check runs on the merge result against the tip; an overage names its sites; a check that cannot run fails | 122–133 | 126, 127, 128, 131, 132 | ratchetsOnMerge :172 | Injected runners prove every ratchet suite executes with base HEAD and cleaned test environment; multiple overages and spawn failure are reported. |
| two PRs each at the assert-match ceiling alone are over it on the merge result (#3236 + #3237, 2026-10-20) | 135–163 | 137, 156, 159, 160, 161 | localMergeGenCheck :207 / assert-match ratchet | Two local PR branches each fit a three-pin ceiling alone; landing one makes the second ratchet fail on merged bytes while merge/gen still succeed. |
| evaluate: all rows in order; each failing row refuses on its own; the local rows wait for an open PR; API errors are errors, not rows | 180–206 | 183, 184, 185, 186, 188, 190, 192, 194, 196, 199, 200, 202, 203, 204, 205 | evaluate :260 | Injected API/merge/distance prove ordered independent rows, PR-base targeting, no local work for draft/stale head, prefix acceptance and API error separation. |
| main: one \`= gate <row>:\` line per row and a summary; exit 0 all ok, 2 a row failed, 1 usage/API error; --json writes the summary | 208–228 | 213, 214, 215, 217, 218, 219, 221, 221, 221, 222, 223, 224, 225, 226, 227 | main :310 / rowLines :295 | CLI seams distinguish pass/refusal/usage-or-API exit codes, ordered row/summary output and JSON report content. |
| receiptVerdict (JS) and merge_policy.receipt_check (Python) agree: same PR and kind, ok, fresh; a merge pins its head | 235–263 | 243, 244, 247, 248, 250, 251, 252, 253, 255, 257, 259, 260, 261 | gate-receipt receiptVerdict :129 / Python receipt_check | JS/Python receipt verdicts agree for absent/wrong kind, age over ten minutes, refusal and head pin requirements. |
| a receipt written from a linked worktree also lands in the main checkout the hooks read | 265–277 | 268, 272, 273, 275 | mainCheckout :35 / writeReceipt :99 | A real linked Git worktree writes a receipt into the main checkout consumed by hooks. |
| a receipt records the gate files' sha256; gateFilesVerdict (JS) and gate_files_check (Python) refuse an edited or uncommitted gate | 279–299 | 288, 289, 290, 294, 295, 297 | gateFilesVerdict :165 / Python gate_files_check | JS/Python reject gate bytes differing from receipt or HEAD, including self-rehashed uncommitted edits and absent hashes. |
| untrustedEnv: the merge result's scripts get no token and no runner file-command path (land.yml gate) | 301–308 | 307 | merge-gate untrustedEnv :164 | Allow-listed environment strips token/secret and GitHub file-command variables while keeping execution identity basics. |
| audit 4: the hashed gate set is the static import closure, recorded in the receipt | 312–330 | 313-314, 316, 317, 322, 323, 327-328 | gate-receipt staticImports :63 / gateClosure :72 / hashes :90 | Static import closure includes seed dependencies; receipts record every closure hash and refuse an older seed-only set. |
| audit 4: a future-dated receipt is refused; a ready receipt is pinned to the PR's current head | 332–346 | 335, 336, 338, 339, 341, 342, 343, 344, 345 | receiptVerdict :129 / headPinProblem :151 | Sixty-second future skew is accepted but far-future receipts refuse; ready head prefixes must be valid and match. |
| audit 4: a READY claim checks the PR number, the live head and the gate files | 348–367 | 353, 354, 355, 356, 357, 358, 364-365 | readyClaimVerdict :199 | READY checks textual PR identity, live-head lookup/errors and gate files; tampered hashes refuse by default. |

### tests/unit/merge-hygiene.test.mjs

Fixture: inline unordered dictionaries/comment bundles 22–76; actual on-disk manifests.

Production target (applies to each case below): tools/check/merge-hygiene.mjs:52 normalizeRatchets, :78 sortToolingFast, :98 normalizeGroups, :125–147 render/check; tools/manifest.cjs CIRCUITS.

Limits: Formatting/merge friendliness only; no actual merge conflict experiment. fixture/ names are synthetic dictionary entries.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| committed ratchets.json and groups.json match the normalizer | 16–19 | 17-18 | merge-hygiene check :135 | Committed ratchet/group bytes match canonical rendering. |
| normalizeRatchets sorts file and metric keys | 21–35 | 31, 32, 33, 34 | normalizeRatchets :52 | File, metric and tree keys normalize in deterministic order; rendering normalized versus raw agrees. |
| sortToolingFast glues // notes to the next path, then sorts by path | 37–54 | 46-53 | sortToolingFast :78 | Comment bundles travel with the next path during tooling-fast sorting. |
| normalizeGroups sorts group keys, files, flags, and toolingFast | 56–80 | 70, 71, 72, 73, 74-78, 79 | normalizeGroups :98 | Group keys, flags, files and tooling-fast paths normalize while associated comments remain attached. |
| manifest CIRCUITS lists one id per line (section order preserved) | 82–93 | 86, 91-92 | tools/manifest.cjs CIRCUITS | CIRCUITS source requires at most one quoted id on each line; it does not compare circuit order. |
| on-disk ratchets render is byte-stable under a second normalize | 95–102 | 98, 101 | renderRatchets :125 / renderGroups :129 | Parsing and rendering the current files twice is byte-idempotent. |

### tests/unit/mesh-census.test.mjs

Fixture: inline synthetic pass/source/band rows and recommendation scenarios.

Production target (applies to each case below): tools/perf/mesh-census-lib.mjs:6–53 classifiers; :63–132 aggregation/tables; :137–195 recommend; :198–280 target/group totals and summary parsing.

Limits: Pure parser/heuristic fixtures; recommendations establish no actual GPU benefit or measured scene telemetry.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| distanceBand: 150 m cut | 12–18 | 13, 14, 15, 16, 17 | distanceBand :6 | 150 m starts far; finite lower distances are near and NaN is unknown. |
| classifySource: ribbon vs props vs other | 20–27 | 21, 22, 23, 24, 25, 26 | classifySource :15 | Source labels classify ribbon/props and leave empty/unrecognized labels other. |
| classifyPass: never treat shadow as main (#2631) | 29–41 | 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40 | classifyPass :32 | Target names/dimensions separate main, mirror, square shadow and auxiliary bloom. |
| aggregateRows: bands and sources; drops shadow/aux | 43–56 | 51, 52, 53, 54, 55 | aggregateRows :63 | Aggregation retains main/mirror bands while dropping explicit and inferred shadow rows by default. |
| tableRows + formatBandTable are stable | 58–70 | 64, 65, 67, 68, 69 | perFrame :90 / tableRows :103 / formatBandTable :121 | Two-frame normalization and markdown rows retain the named main/mirror bands and title. |
| recommend: mirror-first when mirror ribbon is huge | 72–83 | 79, 80, 81, 82 | recommend :137 | Large mirror ribbon predicts LOD value, prioritizes mirror, and suggests a chunking experiment. |
| recommend: no clear pay when far share and mirror are small | 85–95 | 92, 93, 94 | recommend :137 | Small far/mirror contribution produces no clear-pay recommendation. |
| recommend: unbanded GLX ribbon leaves the far share unmeasured | 97–105 | 102, 103, 104 | recommend :137 | Unbanded ribbon prevents claiming a measured far share or LOD value. |
| parseSummaryLine reads = mesh-census JSON | 107–111 | 109, 110 | parseSummaryLine :271 | Only the machine summary marker produces parsed JSON; missing marker returns null. |
| aggregateRows shadow:true keeps the shadow bucket apart; aux never | 113–125 | 120, 122, 123, 124 | aggregateRows :63 / tableRows :103 | Shadow opt-in admits its separate bucket and chosen table pass, while aux remains excluded. |
| passKeyTotals: one row per render target, per-frame means, heaviest first | 127–143 | 135, 136, 137, 138, 140, 141, 142 | passKeyTotals :198 / passTotalsFromKeys :259 | Target totals normalize render/call/triangle counts over frames, order by heaviness, and fold distinct keys into pass totals. |
| groupTotals: distance histogram per mesh group, top-N per pass | 145–160 | 155, 156, 157, 158, 159 | groupTotals :221 / formatGroups :249 | Per-group distance bins retain unknown distances, select top N independently per pass and format the histogram. |

### tests/unit/metrics.test.mjs

Fixture: load 23–52 evaluates real overlay with seeded Log/store and fake storage/window/document/telemetry; observer class 58–64.

Production target (applies to each case below): js/perf/metrics-overlay.js:25 GameMetrics; :127–316 settings/snapshot; :528–543 fitsWide; :549–689 paintOverlay; :802–921 loader/settings; :1138–1183 frame bench; css/hud.css; css/overlays.css; js/core/lazy-bundles.js.

Limits: VM/syntax/CSS contracts, not visual sign-off. Loader tests count requests, not network completion. The claimed plain-object case only checks typeof/log array; typography and PHYS line budgets are not rendered measurements.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| frametime reset counts only long tasks starting in its current window | 54–77 | 68, 71, 73, 75, 76 | GameMetrics.frametimeBenchReset :1138 / Snapshot :1165 | Reset counts only long tasks at/after its window, disconnects old observer and ignores late deliveries; resets governor counters twice. |
| METRICS defaults off and persists on toggle | 79–88 | 81, 82, 83, 84, 85, 86, 87 | GameMetrics.set/toggle :816–834 | Default OFF and stable key persist explicit toggles as one/zero. |
| ?metrics=1 overrides storage for the session | 90–94 | 92, 93 | GameMetrics boot/url state | URL ON overrides stored OFF without changing storage. |
| snapshot() is a plain object and never throws without __apex | 96–102 | 99, 100, 101 | GameMetrics.snapshot :192 | Absent telemetry returns an object with off-state and log array without throwing; it does not inspect the object's prototype. |
| turning metrics on raises the log buffer so the overlay tail fills | 104–112 | 106, 108, 109, 111 | GameMetrics.set :816 / Log level | Enabling raises only buffer verbosity to debug and disabling restores previous info while console stays warn. |
| boot-ON (?metrics=1) raises the buffer without set() | 114–119 | 116, 117, 118 | GameMetrics boot/log level | URL-enabled boot raises buffer without an explicit setter. |
| metrics ON keeps per-namespace buffer overrides | 121–130 | 125, 126, 128, 129 | GameMetrics.set / Log namespace level | Namespace trace override survives both global buffer changes. |
| snapshot keeps frame EMA off the governor budget | 132–141 | 137, 138, 139, 140 | GameMetrics.snapshot :192 | Snapshot distinguishes measured EMA from governor budget and computes rounded FPS/tier. |
| snapshot uses probe(), never obs() | 143–175 | 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174 | GameMetrics.snapshot CAR :192 | CAR consumes lightweight probe/timing/camera/caution/info, converts 20 m/s to 72 km/h and never calls obs or fieldState. |
| overlay sits below the zoomed sector stack, not on the minimap | 177–217 | 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 200, 206, 211, 212, 213, 215, 216 | css/hud.css #game-metrics | CSS source pins placement/tap/z-index/resizability, ordered ch-based widths, S/L text capacity floors and bounded viewport height/width. |
| without a HUD digit, snapshot speed is ground km/h from probe() | 219–228 | 225, 226, 227 | GameMetrics.snapshot speed :192 | No HUD digit means both displayed and ground speed derive from probe, marked non-dash. |
| overlay SIDE persists and AUTO docks left on a short viewport | 230–252 | 232, 233, 234, 235, 236, 237, 239, 241, 243, 244, 246, 251 | GameMetrics.setPos :853 / resolvePos :151 | Side choices persist, URL pins remain session-only, and AUTO resolves short viewport left versus tall viewport right. |
| overlay SIZE persists, defaults to S, and URL is session-only | 254–267 | 256, 257, 258, 259, 260, 261, 262, 264, 266 | GameMetrics.setSize :869 / nextSize :880 | Size defaults S, cycles M/L/S, persists, and URL-pinned edits do not rewrite stored size. |
| pages persist and URL metricsPage is session-only | 269–280 | 271, 272, 273, 274, 275, 277, 279 | GameMetrics.setPage :836 / nextPage :847 | Page defaults GOV, persists and cycles; URL page overrides remain session-only. |
| a painted HUD 0 does not wipe probe ground speed | 282–293 | 289, 290, 291, 292 | GameMetrics.snapshot dash/ground :192 | HUD zero remains the displayed dashboard speed while separate ground speed retains 216 km/h. |
| snapshot reads physState() and still skips obs()/fieldState() | 295–316 | 310, 311, 312, 313, 314, 315 | GameMetrics.snapshot PHYS :192 | PHYS consumes physState once and carries slip/lateral/wrong-way data without obs or fieldState. |
| log page filters the tail by namespace and level | 318–336 | 327, 328, 329, 330, 334, 335 | GameMetrics.snapshot log / log filters | Log tail filters by severity then namespace, excluding nonmatching rows. |
| page and log filters persist while metrics are off | 338–351 | 340, 341, 342, 343, 344, 345, 346, 348, 349, 350 | GameMetrics.setPage/setLogNs/setLogLvl | Page/namespace/level settings persist even while panel is off and remain selected after enabling. |
| GOV snapshot skips probe() and physState() | 353–365 | 361, 363, 364 | GameMetrics.snapshot GOV :192 | GOV snapshot avoids expensive car and physics telemetry functions. |
| ?metrics=1 set() does not write storage | 367–375 | 369, 371, 372, 374 | GameMetrics.set :816 | An initially URL-pinned panel can toggle in memory without ever writing its stored enable value. |
| initUI injects separate metrics, page, and log settings buttons | 377–420 | 403, 404, 405, 406, 407, 408, 410, 413, 416, 419 | GameMetrics initUI/settings controls | Fake DOM receives six controls and their labels track page/side/size updates. |
| HIDE HUD CSS leaves #game-metrics visible | 422–429 | 424, 425, 426, 427, 428 | css/overlays.css hud-hidden | Ordinary hide-HUD CSS names standard HUD surfaces but excludes the metrics panel. |
| photo-mode HIDE HUD CSS hides #game-metrics | 431–434 | 433 | css/hud.css pc-uihidden | Photo-mode hide-HUD CSS explicitly includes metrics. |
| turning METRICS on asks game.js for the telemetry surface | 448–457 | 452, 454, 456 | setTelemetryLoader :802 / ensureTelemetry :806 | Installing a loader while OFF is inert; first enable invokes it exactly once across repeated toggles. |
| a resident __apex is never re-fetched, and a booted-ON panel still asks | 459–472 | 464, 471 | setTelemetryLoader :802 / ensureTelemetry :806 | Resident telemetry suppresses fetch; a stored-ON cold panel requests it when loader is installed. |
| game.js hands the overlay the memoised loader, not a widened boot gate | 474–490 | 480, 482-483, 485, 486, 487, 489 | js/core/lazy-bundles.js loadAgentSurface / game.js wiring | Source wiring keeps metrics out of the lazy boot gate, memoizes the shared agent loader, and registers it with overlay. |
| the wide/narrow choice reads the granted width, never the painted one | 502–519 | 508, 510, 511, 512-513, 515, 516, 518 | GameMetrics fitsWide :528 | Layout source reads granted computed CSS width minus padding/border, rejects painted body width and retains unknown-box ratio fallback. |
| the PHYS page renders every physState field it fetches | 531–544 | 536-537, 543 | snapshot :192 / paintOverlay :549 | Eight physState fields must be copied into snapshot and referenced by painting source; presence alone does not prove pixels or both branches render correctly. |
| new PHYS rows stay inside the measured line budgets | 550–566 | 560, 563, 565 | paintOverlay/WIDE_CH line budget | Specimen strings fit narrow/wide character budgets and source retains WIDE_CH 53; generated worst-case output is not measured. |
| GOV reports explicit stopped loop and frame progress without inferring paused failure | 568–578 | 572, 573, 575, 576, 577 | GameMetrics.snapshot / LoopHealth.state | GOV exposes explicit LoopHealth stopped/frame counts and null when absent, rather than inferring a stop from FPS. |

### tests/unit/miami-hard-rock-orbit.test.mjs

Fixture: dualLiteOrbitEye 25–42; trackside 45–55; massVertsNear 58–68; real buildContext.

Production target (applies to each case below): js/circuits/scenery/miami.js Hard Rock scenery; tools/track/verify-track.cjs buildContext; Tracks.sample/build.

Limits: Source radii and sampled vertex bubbles do not prove continuous triangle clearance, all camera poses or actual rendered visibility.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| miami Hard Rock gap + roof radii clear dual_lite S/F corridor | 70–89 | 73, 74-75, 77, 78-79, 82, 85-86, 87 | Miami Hard Rock/neon authored offsets and roof frusta | Authored gap and neon offset clear minimum corridor distances; at least two roof frusta stay within radius limits. |
| miami day S/F orbit + trackside eyes clear Hard Rock mass; neon emits | 91–114 | 94, 98, 101, 104-105, 107-108, 112-113 | Tracks.build/sample / Miami propsGeo and modelDiagnostics | Built day Miami must emit Hard Rock neon and contain props; orbit lateral offset is about 28 m and neither orbit nor trackside has elevated prop vertices within six metres. |

### tests/unit/mirror-glass-night.test.mjs

Fixture: loadMesh 23–37 evaluates mat4/consts/CarMesh with recording mesh factory; QUADS 40; color reducers 42–51; fnSource.

Production target (applies to each case below): js/car/car-mesh.js:1657 getMirrorFallback; js/car/car-draw.js:1435–1452 drawMirrorLens.

Limits: Mesh colors and material source only; no rendered reflection or lighting luminance is measured.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| night fallback mesh is dim vs day (tracks night env, not a day sky card) | 53–62 | 57, 58, 59, 60-61 | CarMesh.getMirrorFallback :1657 | Day/night caches differ and night vertex channels/luminance are much dimmer while day retains a pale sky. |
| drawMirrorLens uses matte opts and the night mesh at night | 64–74 | 67, 68, 69, 70, 72, 73 | CarDraw drawMirrorLens :1435 | Lens source uses matte roughness/specular, the night fallback selector and intended opacity; old glossy values are forbidden. |

### tests/unit/mirror-lights.test.mjs

Fixture: load 26–37 with controllable clock/knobs; forced-live source variant; street 70–74; drive 79–99; smooth-window metric 77.

Production target (applies to each case below): js/lighting/frame-lights.js:646 viewLights, :659 setFrameLights; js/render/shared/light-budget.js; js/render/shared/mirror-pass.js.

Limits: No pixels; flash metric integrates a synthetic rear window of lamp records at 60 m/s and 60 Hz. Forced-live replacement is a specific source-shape oracle.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| settled flicker is exact through warm-up, knob edits, mirrors and full-set refreshes | 39–68 | 63, 65 | FrameLights.setFrameLights :659 / viewLights :646 | Optimized settled flicker matches retained live formula exactly across dense/sparse lights, warm transitions, extreme knob edits and mirror views. |
| \`mirror light is steady: ${spacing} m lamps, ${mobile ? "phone (24 slots)" : "desktop"}\` | 102–108 | 105, 106, 107 | FrameLights.setFrameLights :659 / viewLights :646 | Three variants (25 m phone; 12 m desktop; 12 m phone) reproduce >20 jumps using forward lamps; own-ranked mirror has no >10% jumps and retains more synthetic light. |
| a mirror viewLights pass does not disturb the forward set (bit-for-bit) | 111–137 | 135 | FrameLights.setFrameLights :659 / viewLights :646 | Interleaving mirror views leaves forward light arrays bit-identical over moving/yawing cameras and tier transition. |
| tail-light records ride along, and an uncut set needs no re-rank | 139–153 | 147, 148, 149, 152 | FrameLights.viewLights :646 | Tail records survive own-view re-ranking within the same lamp budget; a sparse uncut set returns null to reuse forward data. |
| the mirror pass swaps in its own lamps and puts the forward set back | 155–160 | 157, 158-159 | MirrorPass frame light borrow/restore | Source wiring calls viewLights with mirror eye/aim and restores forward lights/tail metadata. |

### tests/unit/mirror-pass-carbuild.test.mjs

Fixture: carDrawVm; mirror-pass-rig; wheel oracle 74–110; real tri-census geometry 272–277; mirrorLodRig/context/body 278–298.

Production target (applies to each case below): js/car/car-draw.js:882–908 warm, :1762–1952 wheel phases/draw, :1970–2024 projected context/body selection; js/render/shared/mirror-pass.js; js/game.js instanced prop-batch block.

Limits: Recording renderer/counting Car3D, except explicit real geometry source for partner reduction. Matrix/counter evidence is not GPU performance, visual equivalence or backend rendering proof; projected LOD is opt-in.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| a mirror draw on a warmed field builds nothing: body-only mesh + the field wheels, never a whole car | 8–38 | 15-16, 21, 22, 23, 24, 26, 27, 28, 32, 33, 36, 37 | CarDraw warmCarAssets :882 / drawMirrorCar :2012 | Warm caches supply nearest six rival body-only meshes plus 24 bare field wheels; reshuffle/night draws add no builds or evictions. |
| the broadcast PiP draws through the same meshes: its subject, its neighbours, the player's own body | 40–57 | 52, 53, 54, 55 | CarDraw.drawMirrorCar / MirrorPass PiP | PiP subjects including player use the same warmed bodies without whole-car builds. |
| the shipped-before path, for contrast: teamMesh per mirror rival builds a whole car each | 59–71 | 69, 70 | CarDraw.teamMesh old-path sensitivity | Deliberately restored old teamMesh draw path builds six whole cars, proving the recording counter can detect this regression. |
| wheel phases advance once before any view, and mirror/main/cockpit draws never touch traction state | 112–138 | 120, 121, 130, 131, 137 | CarDraw advanceWheelPhases :1762 / drawPlayerWheels :1780 / cockpit | Independent matrix oracle proves one pre-view phase advance shared by mirror/main/cockpit; guarded traction properties are never read or written. |
| wheel phases keep moving in mirror-only and offscreen frames, including lock-up, reverse and dt zero | 140–177 | 160, 168, 169, 175, 176 | advanceWheelPhases :1762 / drawMirrorCar :2012 | Phase integration survives mirror-only/offscreen gaps, front lock, reverse and zero dt while traction fields stay intact. |
| steering uses one sine/cosine pair per car while preserving all four wheel matrices | 179–197 | 193 | drawPlayerWheels :1780 | Human/AI steering matrices match geometry oracle with exactly six trig calls per four-wheel draw. |
| the mirror re-measures on a 500 ms clock and leaves <body> alone when the side layout has not moved | 203–231 | 211, 212, 215, 217, 219, 220, 224, 225, 229, 230 | MirrorPass measure/side layout | Layout measures first frame and at 500 ms, avoids unchanged class/style writes, writes moved geometry and immediately remeasures re-show. |
| a frozen mirror frame replays the MIRROR pass's pack, never the main camera's (L4) | 238–270 | 242, 262, 263, 265, 269 | game.js propBatches mirror pack block | Extracted game block records only mirror matrices/colors, replays those after main camera culls, and skips main-only mirror-copy allocation. |
| warm-only partners keep source colors, bounds and index validity; render never builds | 299–311 | 301, 301, 303, 304, 305, 306, 307, 307, 308, 309, 310 | CarDraw warm body partner / drawMirrorCar :2012 | Warm-built partner simplifies >20%, keeps original palette/indexed bounds and valid indices, then draws without allocation; player, PiP and disabled LOD use detailed body. |
| screen sensitivity has hysteresis, handles near plane and absent partner safely | 312–325 | 314, 315, 319, 321, 322, 323, 324 | mirrorBodyLow :1997 / drawMirrorCar :2012 | Projected-size selection has stateful enter/exit thresholds; near-plane and cold missing-partner paths use detailed body without lazy creation. |
| custom invalidation, factory invalidation and bounded eviction free every pair once | 326–336 | 328, 329, 333, 333, 334 | CarDraw cache invalidation/eviction/loadCarModel | Custom/factory/model invalidation and bounded eviction free full/partner once each, with no duplicate frees. |
| mirror OFF, initial AUTO and broadcast warm no partner | 338–350 | 348 | CarDraw mirrorWarmPolicy/warmCarAssets | OFF/software/chase/broadcast/phone initial AUTO warm paths create no experimental partners. |
| real rear-view passes projected context, while PiP always passes detailed context | 352–362 | 357, 360, 361 | mirrorBodyContext :1970 / MirrorPass render | Actual rear pass supplies projected selection and draws prepared low meshes; PiP subject/neighbors stay detailed. |
| an extremum cannot become unreferenced when its other triangle corners share one cluster | 364–376 | 374, 375 | CarDraw partner simplification indexed extrema | Adversarial clustered triangles still keep indexed extrema after actual simplification. |
| default hardware phone AUTO has no extra meshes or geometry work | 378–386 | 382, 383, 385, 385 | CarDraw mirrorWarmPolicy/warmCarAssets | Default phone AUTO reads opt-in flag once at warm time and performs no partner creation or live flag reads. |
| car-only context uses display rect/DPR and reads state/layout once per actual render | 387–400 | 393, 395, 396, 398, 398, 399 | mirrorBodyContext :1970 | Projection context reads mirror state once and canvas at most once additionally; DPR 3 forces details relative to DPR 1 despite target supersample cap. |
| failed mirror partner uploads retain the detailed body; missing full bodies never allocate partners | 403–433 | 421, 423, 425, 426, 427, 430, 431 | CarDraw partner upload/cache disposal | Null/throwing partner uploads preserve detailed bodies; absent full body prevents partner attempts; invalidation frees only created handles once. |

### tests/unit/mirror-pass-prepare.test.mjs

Fixture: boot from mirror-pass-rig; fake warm ownership, targets, timers and profile clock.

Production target (applies to each case below): js/render/shared/mirror-pass.js:112–824 create/render/preparation; QUALITY :83.

Limits: Hidden preparation state machine over fake renderer; no shader compile, GPU target readiness or real timing claim.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| an immersive XR session stands the mirror and the PiP down; EXIT VR brings the mirror back | 7–24 | 11, 12, 13, 14, 17, 18, 22, 23 | MirrorPass XR eligibility | Immersive XR suppresses rear/PiP passes and composites; exiting restores rear view. |
| race preparation lets the main warm run first, then draws the actual hidden rear view at its real size | 26–64 | 31, 32, 38, 39, 41, 43, 44, 46, 47, 48, 48, 49, 50, 51, 52, 52, 53, 55, 56, 57, 58, 58, 59, 62, 63 | MirrorPass prepareRace/preparation render | Preparation shares pending promise, waits one main warm slot and compile ownership, balances programWarm span, renders hidden real-size rear target, restores style/camera and forces first live refresh. |
| preparation follows real eligibility, quality and current layout | 66–80 | 70, 71, 71, 76, 77, 79 | MirrorPass prepareRace eligibility/QUALITY | Eligibility skips OFF/ineligible AUTO/broadcast/already-race; forced ON honors latest measured layout and min quality. |
| preparation retries a temporarily unavailable target and has a bounded deadline | 82–95 | 88, 88, 89, 90, 92, 93, 93, 94 | MirrorPass retry/deadline | Unavailable target can retry; 30-second timer bounds promise and clears preparation/timers. |
| cancel, standDown, stale subjects and in-place backend replacement settle without drawing | 97–108 | 101, 101, 102, 102, 105, 106, 107 | MirrorPass preparation owner/cancel/standDown | Cancel/standDown/state/player/track/renderer/backend-method/mode changes settle false; stale timer cannot cancel a newer owner. |
| preparation failure restores both hidden layout and swapped frame fields | 110–121 | 115, 116, 116, 116, 117, 117, 118, 118, 119, 119, 119 | MirrorPass preparation restoration | Measurement/world/end failures settle false without throw and restore visibility/camera/projection fields. |
| a visible mirrorEnd failure still restores the main frame before propagating | 123–128 | 125, 126, 126, 127, 127, 127 | MirrorPass visible render finally | Visible end failure propagates only after restoring main camera fields. |
| a restart hides the old mirror and a skipped entry clears old preparation success | 130–139 | 132, 132, 134, 134, 135, 136, 137, 137, 138, 138 | MirrorPass prepareRace state reset | Restart clears old visibility/composite and skipped subsequent entry clears old prepared success. |
| caught backend failures and stale ready targets do not claim preparation success | 141–155 | 150, 150, 151, 151, 154 | MirrorPass backend readiness validation | Dead/not-ready or unchanged render counter cannot claim success; mirrorState throw also skips nonthrowingly. |
| race preparation reports frames, gaps, refusals and pass time after the warm (__apex.mirror().prep) | 166–191 | 178, 180, 182, 183, 184, 185, 186, 187, 188, 189, 190 | MirrorPass preparation stats/profile spans | Controlled clock verifies warm release, four frames/two after warm, longest 2460 ms gap, begin refusal, pass timings and final ready elapsed time. |

### tests/unit/mirror-pass-watch.test.mjs

Fixture: boot from mirror-pass-rig; pooled vantage result and source-table Proxy.

Production target (applies to each case below): js/render/shared/mirror-pass.js:112–824 render/PiP/tune/standDown; QUALITY :83.

Limits: Recording VM proves handoff/state only; ninety calls model nominal dwell and do not measure wall-clock frame stability.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| a WATCH: the mirror stands down; the PiP draws its subject on the TV shot, unflipped, into #bc-pip, with ITS neighbours | 7–29 | 14, 15, 16, 16, 16, 18, 19, 20, 20, 20, 22, 23, 24, 25, 28 | MirrorPass broadcast PiP render | Broadcast suppresses rear mirror; PiP uses subject TV pose and local neighbors, unflipped normalized rect, copies pooled eye and restores main frame. |
| the PiP: AUTO skips a software renderer and ON draws it; no subject, no PiP; after the WATCH the mirror is back, flipped | 31–50 | 35, 36, 39, 42, 42, 43, 47, 49 | MirrorPass mirror/PiP eligibility and composite flip | PiP AUTO suppresses software and missing subject; forced ON allows software; ending WATCH restores flipped rear mirror. |
| a phone's governor cannot make the mirror flash: the target ignores render scale, a rung holds ~1.5 s | 52–74 | 56, 60, 64, 67, 71, 73 | MirrorPass QUALITY sizing/dwell | Target sizing follows CSS frame rather than dynamic render-buffer scale; tier changes dwell ninety frames before switching rung. |
| the sun's view-dependent terms stay out of the mirror, and the main frame keeps its own tune | 76–92 | 84, 85, 86, 87, 91 | MirrorPass mirror tune view | Mirror lighting zeros four view-dependent sun/shadow terms, preserves other live knobs, restores and never mutates main tune. |
| the mirror's tune is a view built once per source table, never a per-frame copy of every knob (5-F1) | 96–123 | 107, 108, 109, 110, 111, 112, 115, 120, 121, 122 | MirrorPass mirror tune view cache | Prototype tune view avoids source own-key enumeration, reuses object per source identity, reads live edits and rebuilds only for replacement table. |
| standDown (the GARAGE preview frame) hides the mirror and clears the composite rect; the race brings it back | 125–138 | 128, 131, 132, 133, 134, 136, 137 | MirrorPass standDown | standDown clears DOM/class/composite; following race render restores mirror. |

### tests/unit/mirror-pass.test.mjs

Fixture: boot recording rig; bootGlx in 258–298 adds real backend cull/pack under recording GL.

Production target (applies to each case below): js/render/shared/mirror-pass.js:30 module, :83 QUALITY, :112–824 create/render/standDown; GLX cullInstances/drawInstanced.

Limits: Recording GL exercises pack bytes, not pixels. Fake road/DOM/camera framing is bounded; backend rendering/composition needs live browser evidence outside this report.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| AUTO shows the mirror in an onboard view on a hardware renderer, and not in chase | 26–40 | 29, 30, 31, 34, 37, 38, 39 | MirrorPass AUTO eligibility | AUTO eligibility includes cockpit/helmet hardware and excludes chase without draw/composite. |
| AUTO sheds a software renderer; ON keeps it; OFF and the countdown never draw | 42–66 | 45, 48, 51, 54, 60, 64, 65 | MirrorPass mode/state/device eligibility | Software AUTO is skipped, ON overrides it and low tiers, OFF/countdown skip; hardware phone AUTO chooses lite. |
| the MIRROR key turns off what shows, and on what does not, and persists it | 68–80 | 71, 73, 74, 75, 76, 78, 79 | MirrorPass consumeMirror/mode persistence | MIRROR action toggles visible mirror off then on and persists mode/class updates. |
| the pass order, the rect, and the frame handed back untouched | 82–105 | 86-87, 89, 91, 91, 92, 93, 94, 95, 97, 98, 99, 100, 101, 102, 103, 104 | MirrorPass render camera/frame borrow/restore | Pass sequence/normalized rectangle/target size/rear camera/cull are handed backend, then every swapped frame/sky field returns. |
| it looks BACK: the rival behind is drawn, the one ahead is not, the player never | 107–119 | 111, 112, 117, 118 | MirrorPass rear camera / drawCars | Rear projection puts behind point in front, ahead behind; only behind rivals draw at their own transforms and player is excluded. |
| a draw that throws still ends the pass and hands the main camera back | 121–128 | 123, 124, 125, 126, 127 | MirrorPass render finally | Throwing world draw still ends pass and restores main/sky camera. |
| a phone gets the LITE pass: no prop batches, a short radius, fewer rivals, a smaller target, every frame | 130–154 | 134, 135, 139, 139, 140, 141, 142, 143, 145, 146, 149, 152, 153 | MirrorPass QUALITY lite path | Phone lite flags/radius/target exclude distant rival and render each frame; desktop full remains separate and tier one is lite. |
| the first frame after the mirror comes back draws, whatever the cadence | 158–173 | 162, 164, 167, 168, 170, 172 | MirrorPass re-show cadence | Re-show forces a fresh draw even on nominal skip frame, then resumes cadence. |
| only governor tier 2 halves the cadence | 175–180 | 179 | MirrorPass low cadence | Four tier-two renders produce first-frame plus alternate-frame passes (three total); the name alone overstates exclusivity of tier two. |
| the quality ladder: full, lite, low (tier 2-3, half rate), min (tier 4+, a third) | 182–196 | 189, 190, 195 | MirrorPass QUALITY ladder | Full/lite/low/min target dimensions and min first/third/sixth drawn cadence are pinned. |
| a phone picks its rung from the measured tier, not the GRAPHICS preset floor | 201–208 | 203, 204, 205, 206, 207 | MirrorPass phone measured governor rung | Phone measured tier overrides default preset floor, still respects explicit LOW and floors ULTRA phone at lite; desktop follows preset. |
| full quality freezes instanced packs every other drawn frame (audit #8) | 210–226 | 212, 215, 217, 218, 220, 221, 225 | MirrorPass full instance freeze cadence | Full alternates instanced refresh/freeze while cars draw each frame, restores flag and increments counters; lite never freezes. |
| the first full pass after a hidden or lite interval always refreshes the instance pack (07-F3) | 230–256 | 235, 239, 241, 247, 250, 253, 255 | MirrorPass freeze-run reset | Hidden or lite interval resets full-run parity so the first return refreshes then alternates. |
| \`standDown refreshes the first full instance pack after ${preparation ? "same-world preparation" : "re-entry"}\` | 258–298 | 268-269, 279, 280, 289, 291, 292, 295, 296 | MirrorPass standDown/prepareRace / GLX cull/pack | Two variants (re-entry/same-world preparation) drive actual GLX pack culling after standDown: new location replaces old bytes before ordinary reuse resumes. |
| a tap collapses the mirror to a chip for the session; a tap on the chip brings it back | 300–327 | 303, 306, 307, 308, 309, 310, 313, 316, 317, 321, 322, 326 | MirrorPass collapse/chip handlers | Touch collapse is session-only, stops passes, exposes chip, restores on chip/key and never displays chip for OFF. |
| the radio card goes BESIDE the mirror when the row has room, and stacks under it when not | 329–349 | 334, 335, 336, 340, 344, 347, 348 | MirrorPass side slot layout | Available side slot respects pause/sector/broadcast-camera bounds, writes coordinates and stacks when too narrow; hiding clears class. |
| the side slot stops at a touch dock group in the card's rows (cockpit BOOST at 844x390), and drops when one covers its start | 351–368 | 358, 359, 363, 367 | MirrorPass side slot / touch docks | Touch dock groups intersecting card rows constrain or disable side slot; lower pedal groups do not block it. |

### tests/unit/mix-duck-radio.test.mjs

Fixture: boot 66–122 evaluates five audio modules plus mat4 over recording AudioParams/nodes/context; held fetches; sampleBuf 60–64; media Audio stub.

Production target (applies to each case below): js/audio/engine.js:375–470 duck/focus curves/ownership; js/audio/soundtrack.js:562–571 duck subscriber; js/audio/radio-fx.js voice/media lifecycle.

Limits: Fake AudioParams record schedule targets immediately; no waveform, audible output, browser Web Audio behavior or physical device route recovery is established. Node-allocation case counts GainNodes specifically.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| setRadioDuck engages the SFX bus at −8 dB via setTargetAtTime (~80 ms) | 135–153 | 146, 147, 150, 151, 152 | GameAudio setRadioDuck :466 / applySfxDuck :455 | First radio hold schedules -8 dB bus target with 80 ms attack, cancellation of prior schedules and no step assignment. |
| setRadioDuck(false) releases the SFX bus via setTargetAtTime (~400 ms) | 155–166 | 161, 162, 165 | setRadioDuck :466 / writeSfx :405 | Last hold removal schedules unity through 400 ms release, with no step assignment. |
| overlapping lines hold the duck without a second attack (no pump) | 168–187 | 176, 177, 180, 182, 186 | setRadioDuck holds / applyMusicDuck :461 | Second owner adds no attack and removing one adds no release; last owner releases once. |
| a volume slider mid-line stays ducked (composed sfxVol × lin) | 189–198 | none directly (shared helper oracle) | GameAudio SFX volume / sfxBusTarget :401 | SFX slider composes with duck and releasing lands on new level. |
| SFX OFF mid-line silences the bus; SFX ON mid-line returns ducked | 200–209 | none directly (shared helper oracle) | GameAudio SFX enabled / sfxBusTarget :401 | SFX disabled is silence; enabling during voice restores ducked level. |
| an interrupted session releases the SFX duck; running re-latches if the line is still on air | 211–227 | 222, 226 | GameAudio context state recovery / duck latch | Interrupted context releases duck and running state re-latches remaining live hold. |
| a context rebuild drops ghost holds and boots the new SFX bus unducked | 229–244 | 237, 240, 241, 243 | GameAudio devicechange/context rebuild | Devicechange rebuild creates new graph, clears holds/latch and starts SFX unity. |
| setRadioDuck and a steady setEngine allocate zero GainNodes | 246–257 | 256 | GameAudio setRadioDuck/setEngine node reuse | Ducking and steady engine updates add zero GainNodes after initialization. |
| the engine stays audible while the SFX bus is ducked | 259–272 | 266, 269, 270, 271 | GameAudio engineLevel / duck bus | Engine level remains positive/unchanged upstream while SFX bus is attenuated about -8 dB. |
| music still ducks through the existing soundtrack subscriber | 274–285 | 280 | soundtrack.js setRadioDuck :562 | Existing soundtrack subscriber still ducks default music gain by 0.35 and restores it. |
| selective focus routes engine/rivals/reverb separately from critical tyre and brake cues | 288–314 | 294, 294, 295, 297, 298, 299-300, 302-303 | GameAudio focusBus topology / setRadioFocusDb :447 | Graph topology isolates engine/rivals/reverb on focus bus from critical tyre/brake/corner cues; focus amount and SFX controls compose during live hold. |
| audio-clock spans preserve future union across mode changes, cancellation and suspended wall time | 316–331 | 321, 325-326 | GameAudio setVoiceFocusSpan :437 / curveValue :385 | Future speech spans remain silent until audio time, cancellation preserves other owner's boundaries and 4 dB attack follows exponential at one tau. |
| analytic cancel-and-hold fallback keeps interrupted release and overlapping owners continuous | 333–349 | 347 | GameAudio writeCurve :394 / refreshFocus :409 | Without cancelAndHoldAtTime, analytic anchoring preserves exact current attack/release across overlapping owner and reattack transitions. |
| WATCH media focuses only on audible playing, not pending fetch, stall or muted buffers | 351–375 | 360, 361, 362, 363, 364, 365, 366, 369, 370, 372, 374 | GameAudioRadioFx.playWatchMedia/radioVoice | WATCH focus starts at audible playing, keeps stalled buffered playback, releases on waiting/mute/stop, ignores stale callbacks and refuses zero-volume/disabled audio. |
| repeating STANDARD restore is inert during an active legacy attack | 378–386 | 383 | GameAudio.setRadioFocusDb :447 | Repeated STANDARD preference restore during attack is inert and critical/focus envelopes retain matching tau. |
| context rebuild retains focus preference and user level while dropping old voice ownership | 388–401 | 392, 395, 395, 396, 396, 399 | GameAudio context rebuild / voice owner teardown | Rebuild preserves focus preference/user volume but drops old voice ownership; old-source stop cannot release a new owner. |

### tests/unit/mobile-config.test.mjs

Fixture: read current identity/config/package/manifest/Gradle/gitignore/shell at 12–21; instrumented and activity Java sources.

Production target (applies to each case below): mobile/lib/identity.json; mobile/capacitor.config.json; mobile/package.json; mobile/android/app/src/main/AndroidManifest.xml; mobile/android/app/build.gradle; mobile/android/variables.gradle; index.html; MainActivity.java.

Limits: Static configuration/text only; no Android build, device permission flow, backup restore or system-bar behavior tested.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| frozen identity is the single appId / scheme source | 23–35 | 24, 25, 26, 27, 28, 29, 33-34 | identity.json / capacitor config / instrumented Java | Frozen app id/name/HTTPS scheme agree between identity, Capacitor and instrumented-test expected installed package. |
| capacitor.config.json is a sideload-safe Capacitor 8 shape | 37–46 | 38, 39, 40, 41, 42, 43, 44, 45 | mobile/capacitor.config.json | Config uses local www, modern WebView, no mixed content/debugging/server URL and CSS system-bar inset handling. |
| mobile/ is not a root npm workspace and pins Capacitor 8.x | 48–55 | 49, 50, 51, 52, 53, 54 | root and mobile package manifests/lock | Root has no npm workspaces; Capacitor dependencies pin matching 8.x and mobile lockfile exists. |
| AndroidManifest: INTERNET, optional CAMERA, no cleartext, fullSensor | 57–65 | 58, 59, 60, 61, 62, 63, 64 | AndroidManifest.xml permissions/orientation | Manifest requires Internet but optional camera, omits three unrelated permissions, forbids cleartext and supports fullSensor/density changes. |
| AndroidManifest: auto-backup is off (WebView storage holds the Spotify refresh token and career saves) | 67–70 | 68, 69 | AndroidManifest.xml allowBackup | Application disables Android backup for stored secrets/saves. |
| Gradle wires APEX_VERSION_* env and optional APEX_KEYSTORE_* signing | 72–81 | 73, 74, 75, 76, 77, 78, 79, 80 | Gradle app build and variables | Gradle source wires version/signing environment and development version/minification plus SDK 36/36/24 constants. |
| gitignore covers www, Gradle build, local.properties, public assets | 83–89 | 84, 85, 86, 87, 88 | mobile/android ignore files | Ignore files cover generated web, Gradle, local properties, public assets and Cordova plugin outputs. |
| index.html skips SW registration on Capacitor as well as Electron | 91–95 | 92, 93, 94 | index.html service worker registration gate | Shell service-worker gate explicitly excludes both Capacitor and native desktop. |
| MainActivity keeps the screen on and hides system bars transiently | 97–105 | 102, 103, 104 | Android MainActivity.java | Activity source names keep-screen-on and transient swipe bars via WindowInsetsControllerCompat. |

### tests/unit/mobile-native-download.test.mjs

Fixture: loadNative 17–62 real native modules with fake Filesystem/Share; bytesBlob 115–117; held I/O promises; extracted consumer handlers; in-memory retention disk 480–529.

Production target (applies to each case below): js/core/native.js:33–76 platform/origin; js/core/native-download.js:16–53 cleanup, :78–130 helper, :140–170 anchor interception; consumer sources named below.

Limits: Plugins, consumer UI and retention filesystem are mocked; no physical share sheet, iOS attachment behavior or receiving-app delay proven. Consumer handlers are source slices, not full UI boot. Cache grace is provisional and not a total byte/count cap.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| Native.platform is web without a shell | 64–69 | 66, 67, 68 | Native.platform/isNative/canonicalOrigin | No shell identifies web and preserves document origin. |
| Native.platform is desktop under __APEX_NATIVE__.desktop | 71–76 | 73, 74, 75 | Native.platform/isNative/canonicalOrigin | Desktop marker identifies native desktop and app origin. |
| Native.platform is android under Capacitor.isNativePlatform | 78–83 | 80, 81, 82 | Native.platform/isNative/canonicalOrigin | Capacitor identifies Android native platform and HTTPS localhost origin. |
| NativeDownload.viable is true only with Filesystem+Share on mobile | 85–92 | 87, 89, 91 | NativeDownload.viable :78 | Viability excludes web/desktop and accepts a mobile plugin pair. |
| NativeDownload.saveBlob writes CACHE then Share.share | 94–113 | 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112 | NativeDownload.saveBlob :103 | Blob save base64-writes one recursive CACHE leaf, shares its returned URI once with titles and returns basename/URI. |
| same-name exports preserve bytes for delayed consumers, even after Share resolves | 119–150 | 136, 137, 146, 147-148, 149 | NativeDownload.saveBlob unique path/retention | Concurrent same-basename exports have unique URIs even with fixed clock/random, and all bytes remain available after out-of-order share completion. |
| iOS receives one attachment, matching SharePlugin's url + files accumulation | 152–162 | 161 | NativeDownload.saveBlob share arguments | Simulated iOS URL/files accumulation receives exactly one attachment. |
| writeFile's actual URI is used without optional getUri | 164–172 | 170, 171 | NativeDownload.saveBlob write URI | Filesystem write-returned URI works without getUri and is shared unchanged. |
| getUri is only a fallback for writeFile implementations without a URI | 174–185 | 181, 182, 183, 184 | NativeDownload.saveBlob fallback URI | Missing write URI invokes getUri for the same CACHE path and shares its resolved URI. |
| a returned writeFile URI takes precedence over getUri | 187–191 | 190 | NativeDownload.saveBlob URI precedence | A write-returned URI bypasses even a throwing getUri. |
| missing file URI rejects instead of sharing a bare filename | 193–202 | 199, 200 | NativeDownload.saveBlob URI refusal | No URI rejects before any share; a bare basename is never used. |
| conversion, write, URI lookup and share failures remain rejected promises | 204–220 | 217, 218 | NativeDownload.saveBlob error propagation | Conversion/write/lookup/share errors preserve rejection identity and do not produce successful recorded share. |
| native Share cancellation is distinct from storage and other share failures | 222–230 | 225, 228 | NativeDownload.isCancelled :82 | Only cancellation spellings/AbortError classify cancelled; disk/concurrent-sharing errors/null do not. |
| career export awaits native I/O and never retries a failed or cancelled share through an anchor | 232–257 | 237, 246, 249, 250, 254, 255 | js/career/career-backup.js download | CareerBackup.download remains pending until native write/share and rejects cancellation/failure once without anchor fallback (career-backup.js). |
| career export button never announces success for a cancelled or failed native backup | 259–281 | 273, 274, 275, 278, 279 | js/career/career-ui.js export onclick | Extracted career-ui export handler suppresses duplicate taps, waits, reenables button and announces exact success/failure/cancel outcome. |
| recovery export waits for native saving, guards duplicate taps, and reports failure or cancellation | 283–309 | 291, 300, 301, 303, 306, 307 | js/ui/select-screen.js exportRecovery | Extracted select-screen recovery path awaits native operation, suppresses repeat export and distinguishes success/failure/cancel notice. |
| ghost download reflects the awaited native result and re-enables its button after cancellation or failure | 311–337 | 320, 328, 329, 331, 334, 335 | js/ui/results-sheet.js ghost download onclick | Extracted results-sheet ghost action shows SAVING, guards duplicates and reenables with DOWNLOADED/CANCELLED/FAILED after completion. |
| SettingsExport.download awaits the real native helper and surfaces write/share failures | 339–360 | 353, 356 | js/ui/settings-export.js download | Extracted SettingsExport.download waits for real helper and propagates write/share failure (settings-export.js). |
| generated cache directories preserve screenshot basenames and base64 bytes intact | 362–373 | 367, 368, 369, 370, 372 | NativeDownload.saveBlob/base64/cache names | Empty and binary screenshot bytes round-trip as base64, preserve basename, share URI and allocate different directories with fixed UUID. |
| renderer screenshots await native saving and report its failure | 375–398 | 390, 391, 392, 393, 396 | js/perf/renderer-picker.js saveScreenshot | Extracted renderer-picker saveScreenshot decodes PNG bytes, waits for native save, then labels success/failure; no anchor path. |
| blob:<a download> click refuses a non-ok fetch instead of saving the body | 400–444 | 434, 442, 443 | NativeDownload anchor onClick :140 | Native blob-anchor interception refuses HTTP 404 before blob conversion or write and logs native-download failure. |
| renderer screenshot refuses a non-ok fetch instead of saving the body | 446–470 | 468, 469 | js/perf/renderer-picker.js saveScreenshot | Renderer-picker screenshot refuses HTTP 503 without save/anchor and labels FAILED. |
| safeName strips path separators | 472–477 | 474, 475, 476 | NativeDownload.safeName :86 | Filename path separators are sanitized and dot/dot-dot become safe default name. |
| retention prunes exact owned old leaves and empty folders, preserving basenames | 480–529 | 493, 497, 499, 499, 500, 507, 519, 520, 524, 525, 526, 527, 528 | NativeDownload.pruneExports :16 | Seven-day cleanup protects current-session files; next session removes only owned old leaves, then empty folders, preserving unknown children/legacy/malformed folders. |
| missing or failing retention operations cannot block sharing | 531–545 | 542, 543 | NativeDownload.pruneExports/scheduleCleanup :16–53 | Missing/malformed/throwing cleanup operations remain best effort and cannot block one successful share. |

### tests/unit/mobile-sync-web.test.mjs

Fixture: fixture 27–35 isolated source/destination; fakeRoot 113–119; stagedTree 107–112; CLI child runner 19–25; injected stage/stamp/copy failure.

Production target (applies to each case below): mobile/scripts/sync-web.mjs:31–122 staging/copy/resolve; :144–176 CLI; desktop/lib/site.cjs:7–52 stagedSha/isCurrentStage/resolveSiteDir; tools/desktop/stage.mjs.

Limits: Disposable filesystem and child Node CLI only; no APK, Electron packaging or Capacitor sync run. Placeholder hashes and source/destination files exist only within test fixtures; freshness is provenance logic, not byte identity for explicit sources.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| sync-web refuses a ?v=dev index.html without --dev | 37–45 | 40-43, 44 | sync-web prepareSrc/main | CLI refuses unstamped dev-tag shell before destination creation. |
| sync-web --dev copies an unstamped tree into an isolated destination without cap sync | 47–58 | 52, 53, 54, 55, 56, 57 | sync-web main/copyIsolated | Explicit --dev isolated copy preserves content and reports unstamped/unsynced without invoking Capacitor sync. |
| sync-web copies a stamped (no ?v=dev) tree | 60–69 | 64, 65, 66, 68 | sync-web main/copyIsolated | Stamped explicit tree copies successfully without dev tags. |
| sync-web refuses a custom destination before staging unless sync is skipped | 71–76 | 74, 75 | sync-web main output validation | Custom output without skip-sync refuses before staging or destination creation. |
| custom destinations cannot erase existing data or overlap the source | 78–93 | 88, 89, 90, 91 | sync-web copyIsolated :56 | Existing/custom same/ancestor/descendant/symlink output paths refuse while source/sentinel survive. |
| sync-web.mjs imports the shared desktop stager, not a second allow-list | 95–99 | 97, 98 | sync-web shared stage import | Source contract imports shared desktop staging rather than another copy allow-list. |
| sync-web restages instead of reusing a stale artifacts/site or _site | 121–136 | 126, 133, 134, 135 | sync-web resolveSrc :76 / prepareSrc :103 | Stale SHA and missing provenance cannot be reused; injected stage then stamp targets canonical artifacts site with current SHA. |
| sync-web reuses a stage stamped from HEAD without restaging | 138–145 | 143, 144 | sync-web resolveSrc :76 / prepareSrc :103 | Clean current-SHA stage can be reused without stage/stamp; absent HEAD cannot prove currency. |
| desktop resolveSiteDir ignores a stale artifacts/site fallback | 147–161 | 157, 158-159, 160 | desktop/lib/site.cjs resolveSiteDir :36 | Desktop fallback accepts only matching SHA and otherwise resolves packaged dist-site. |
| default destination overlap is rejected before deleting source or existing data | 164–175 | 172, 173 | sync-web copyTree :35 | Default destination overlap, including aliases, is rejected before deletion. |
| dirty same-HEAD trees are freshly staged, including --dev | 177–187 | 184, 185 | sync-web resolveSrc :76 / prepareSrc :103 | Dirty same-SHA input always restages in both production and dev modes. |
| failed default copy preserves the previous usable web tree | 189–199 | 196, 198 | sync-web copyTree :35 | Injected cp failure leaves the previous destination's usable build intact. |

### tests/unit/model-pack-format.test.mjs

Fixture: manifest/modelIds 37–42; tidyMesh 46–56; roundTrip 58–67 invokes real writer and game reader helper; installed-pack-dependent cases explicitly skip absent manifest.

Production target (applies to each case below): tools/gen/assets.mjs writeAX26; tools/lib/pack-assets.cjs:71–111 writeAX26v3; js/render/shared/assets.js:799–837 _parseModel; tests/helpers/ax26.mjs:24–57.

Limits: Binary decoding/size integrity only; shipped case title exceeds its actual exactness assertions. No network latency, visible normal/color equivalence, malformed-file corpus or all fallback boundaries proven.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| every shipped model is written in the packed v2 layout | 69–80 | 71, 79 | installed AX26 header / writer output | Installed manifest must list models and each header must be v2; absent pack skips. |
| the packed pack is materially smaller than the layout it replaced | 82–93 | 91-92 | installed pack byte size / v1 layout formula | Installed aggregate file bytes must be under 60% of computed v1 layout bytes; absent pack skips. |
| positions, indices and material ids survive the pack bit-exactly | 95–113 | 101, 103, 104, 106-107, 110 | Assets._parseModel :799 / installed files | Installed reader accepts every model with header-consistent positions/index lengths, integer materials and in-range indices. Despite the title, this case does not compare original positions/indices/material ids bit-for-bit. |
| quantised channels stay inside the bounds the format claims | 115–149 | 127, 129, 147, 148 | writeAX26 / Assets._parseModel | 64-vertex spherical normal/color fixture preserves float32 positions, keeps color error within half an 8-bit step and normalized normal angle below 0.01 degree. |
| a mesh the packed layout cannot hold falls back to v1 instead of wrapping | 151–169 | 155, 156, 161, 162, 167, 168 | writeAX26 v1 fallback / Assets._parseModel | Overbright color, fractional material and id above 255 force v1, preserving those unsupported values. |
| the reader still reads a v1 file, so an older pack is not bricked | 171–180 | 175, 176, 177, 178, 179 | writeAX26 / Assets._parseModel v1 | A forced-v1 fixture remains readable with exact positions/materials/indices. |
| the manifest's md5 matches the bytes on disk | 182–194 | 192 | assets/pack/manifest.json model md5 | Each installed model with an md5 entry matches file bytes; records without md5 are skipped, absent pack skips whole case. |
| the reader admits AX26 v3 (v2 body + u8 sway) and v2 files stay unchanged | 196–219 | 206, 208, 209, 210, 211, 215 | writeAX26v3 :71 / Assets._parseModel :799 | v3 writer/game reader accepts fractional foliage sway and nonzero tip fraction while tidy integer-material writer remains v2. |

### tests/unit/model-sway-parity.test.mjs

Fixture: crownMesh 20–35 four vertical foliage vertices/weights; handmade minimal v2 binary 78–90; readAX26 game VM.

Production target (applies to each case below): js/track/core/geom.js SWAY_FRAC; tools/lib/pack-assets.cjs:23, :30–111; js/render/shared/assets.js:799–837.

Limits: Serialization and shared constant parity; no actual procedural crown generation/wind animation or renderer deformation tested. v2 row exercises Node reader only.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| TrackGeom SWAY_FRAC matches the pack-assets / reader constant | 37–43 | 41, 42 | TrackGeom SWAY_FRAC / pack-assets SWAY_FRAC | Procedural SWAY_FRAC literal equals pack library constant. |
| v3 round-trip restores procedural crown sway weights | 45–74 | 53, 54, 57, 59, 65-66, 67-68, 69 | writeAX26v3 / game and Node parseModel | v3 four-weight crown is accepted by game and Node readers; decoded material fractions remain within half-byte weight tolerance and preserve base foliage id. |
| v2 files still decode without a sway stream | 76–94 | 91, 92, 93 | pack-assets.parseModel v2 | Handcrafted v2 with no trailing sway decodes integer material and three indices through Node parser. |

### tests/unit/monaco-fairmont-orbit.test.mjs

Fixture: before/after 17–19 create/close real game VM; MID_LAP 22–26 three survey poses.

Production target (applies to each case below): tools/lib/game-vm.cjs createGame; js/circuits/scenery/monaco.js; FlybySeq.insideProp js/camera/flyby-seq.js:172; FlybySight.transmit js/camera/flyby-sight.js:237–277.

Limits: Geometry/sightline heuristic in game VM, not pixels; only fraction 0.5 and the three listed orbit settings are sampled.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| Monaco mid-lap orbit sightline clears the Fairmont-cliff plane crowns (#3368) | 28–38 | 32, 34, 36 | FlybySeq.insideProp :172 / FlybySight.transmit :237 | Three midpoint survey orbit poses return eye/target, place eye outside solid props and transmit at least 0.5 to target. |

### tests/unit/monza-coplanar-clip.test.mjs

Fixture: live baseline JSON 17–22; auditMonza 24–37 executes audit-circuit clip/coplanar JSON; old caps 42–43.

Production target (applies to each case below): tools/track/audit-circuit.cjs; tools/track/clip-baseline.json monza; tools/track/coplanar-baseline.json monza; js/circuits/scenery/monza.js.

Limits: Defines a VM audit subprocess rather than visual evidence; counts are detector/baseline relative, not proof of zero clipping or coplanarity.

| Case name | Case range | Assertion spans | Target (owner coordinates above) | Meaning / case-specific limit |
|---|---|---|---|---|
| monza coplanar spots and clip severe stay strictly below saturating caps (#3374) | 45–63 | 46, 47-50, 52, 55-58, 59-62 | audit-circuit clip/coplanar / Monza baseline rows | Live baselines must remain below old saturated 7 severe/5 spots; actual audit must succeed and measured clip/coplanar counts stay within live baselines and strictly below those old caps. |

## Source-evidence anchors

Focused source reads confirmed preparation slicing/legend filtering (`js/car/car-draw.js:1158–1233`), projected mirror context/fallback (`js/car/car-draw.js:1970–2024`), export ownership/retention and awaited URI sharing (`js/core/native-download.js:1–140`), AX26 layouts (`js/render/shared/assets.js:799–837`, `tools/lib/pack-assets.cjs:30–118`), atomic/overlap-safe staging and provenance (`mobile/scripts/sync-web.mjs:31–122`), analytic voice focus ownership and duck composition (`js/audio/engine.js:375–470`), independent mirror lamp selection (`js/lighting/frame-lights.js:646–672`), ordered landing evaluator (`tools/ci/merge-gate.mjs:260–294`) and receipt freshness/head/file checks (`tools/lib/gate-receipt.mjs:129–187`). These are source-level associations; there is no new passing-test claim.

Shared assertion oracles outside individual registration bodies: menu navigation extraction checks lines 29/35; sentinel extractor line 16; car wheel matrix helper lines 104–109; audio bus/near helpers lines 126–132; mobile held plugin callbacks can assert during the save; Monza subprocess parse is part of auditMonza. The per-case assertion-span column lists the calls lexically within each registration, while these helper preconditions/oracles remain part of the case behavior.

## Inventory and helper hashes

| File | SHA-256 |
|---|---|
| `docs/project-map/unit-batches.json` | `b929b6bcb5a728059b86127b752fdcb3116cfc3fd5e2b269f377a9d7e55b467a` |
| `tests/helpers/car-draw-vm.mjs` | `35d84c40cd00dbd2db961ab089a5a23fbb2b8b0da12de18e48380da7182e2a32` |
| `tests/helpers/mirror-pass-rig.mjs` | `5c08c6af820ad9715ce501e2d4ed3aba2b57b4c84062655a09ef22c3ecf8ced8` |
| `tests/helpers/ax26.mjs` | `1cffd04947eca8e729b550ac284d5b9fcf998fab904bf45337cafb8c8120d14f` |
| `tests/helpers/game-source.mjs` | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
