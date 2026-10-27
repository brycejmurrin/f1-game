# tests/unit group 58 — complete source map

Scope: all 19 assigned files, 4,925 lines. Read-only source analysis; no tests, browsers, runtime edits, or commits. SHA-256 hashes below bind this report to the bytes read. Full files were read in individually returned slices of at most 80 lines and 10,000 characters; portions hidden by an initial combined-response truncation were re-read in bounded responses.

The case titles state the intended invariant; the assertion ledger records each whitespace-normalized assertion expression and its full source span, including messages and loop-dependent expectations. Spans are one-based and inclusive. Looped assertions represent all listed fixture alternatives, rather than one claim per invocation. Assertions in shared helpers are listed separately. A declared value or source-pattern match proves that contract only; it does not prove painted size, final cascade, browser accessibility, network behavior, GPU rendering, or a complete player journey.

## Production navigation evidence

Read `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`. Used `bash tools/mcp/lsp-mcp.sh` for definitions and production references. `SheetShape` resolves to `js/ui/sheet-shape.js:36`; its file-only references report `js/ui/screen-looks.js` (3) and its own file (1). `CamModes` resolves to `js/camera/mode-switch.js:7`; 56 references across 21 files include `js/game.js` (2), `js/race/real-replay.js` (2), `js/camera/tuner-panel.js` (1), `js/ui/hud.js` (4), and `js/ui/watch-transport.js` (4). `SettingsNav` resolves to `js/ui/settings-tabs.js:6`; 42 references across 12 files include `js/game.js` (4), `js/ui/settings-search.js` (6), `js/audio/spotify.js` (6), `js/ui/settings-export.js` (3). `MenuNav` has 11 references across `js/input/pad-menu.js` (7), `js/ui/modal.js` (3), and its own file (1). `AriaState` resolves at `js/ui/aria-state.js:27`, with only its own global-assignment reference returned. `ScrollFade` resolves at `js/ui/scroll-fade.js:18`.

LSP explicitly labels the window-assigned SheetShape/CamModes/MenuNav/AriaState results as text-match fallback because those globals are untyped. These counts are navigation evidence, not proof of unused exports. Tool-module exports outside `js/` were located by bounded textual export search; their concrete entry points appear in each case.

## Fixtures, semantics, and cleanup

- CSS fit files read real stylesheets at module scope. Parsed-rule cases use `tests/helpers/css-rules.mjs` (`cssRules`, `decl`) and inspect declarations/context, while regex cases pin raw syntax/comment boundaries; neither computes a browser cascade. Camera, flyby, lighting and Photo Studio files target their named selector families; negative matches only establish absence inside the extracted carve. Settings cases also read `tools/ui/menu-screens.mjs` and pin routes to the full Settings sheet.
- `ui-explorer.test.mjs`: plain Playwright-like page/context/locator mocks, serialized `inspectUI` callbacks in isolated `node:vm` contexts, synthetic rectangles, styles, labels, hit-test results, storage and preferences. Route-chain fixtures assert handler composition, own-handler removal, and slow pending-request draining. Responsive fixtures assert viewport restoration on success/failure and validation before mutation. CDP ambiguity fixture asserts detach. Invalid settings fixtures use a unique `scratch` directory and remove it in `finally`; the parent directory remains. Reload fixture controls the unresolved boot promise explicitly. Device cases import Playwright descriptor data without launching a browser.
- `ui-fixer-uncommitted.test.mjs`: `tests/helpers/git-fixture-env.mjs` clears inherited Git hook environment first; `rig` creates a unique Git repository in `artifacts`, sets author/committer dates, writes a stylesheet and a memory file, then invokes `.claude/hooks/ui-fixer-uncommitted.sh` with `{}` stdin and an isolated `CLAUDE_PROJECT_DIR`. Every repository is removed in `finally`. Shell/Git subprocess return codes during fixture setup are not individually asserted; the reminder case asserts status and stdout, the silence cases assert stdout only. Debounce is tested by an immediate second invocation, not a real 30-minute wait.
- `ui-improve-pass.test.mjs`: helpers `read`, comment-stripping `code`, composed `gameSource` through `gameCode`, cached `readCssSource`/`cssRules`, and simple brace-counting `fnBody` support source assertions. `uiSandbox` uses `tests/helpers/mini-dom.mjs`, inert logging/animation APIs and captured timers. `bootMenus` supplies a JSON Map store with synchronous subscriptions, three synthetic circuits, stub teams/maps/calendar and a G facade. `bootSheetShape` supplies viewport/host/content geometry and custom-property maps, with initialization deliberately held at loading. `bootMenuNav` supplies explicit button rectangles and active-layer stubs. `bootCamModes` supplies race state, captured timers and storage, with a stub real-race replay for AUTO. `bootInput` loads the real input module chain against simulated gamepad/time/storage/layer APIs and asserts pad discovery inside the helper. `bootSettingsNav` supplies visible/hidden controls, callback counts, observer/fade stubs. `bootCopyValues` uses a local-override map and `tests/helpers/seed-clipboard.mjs`, captures synchronous execCommand and async clipboard attempts. The delta bake case writes a fixed artifact export, executes the real bake script, and removes the artifact in `finally`; fixed naming can collide with concurrent execution. VM fixtures cannot prove actual focus, transient activation, rendering, or browser permission policies.
- `ui-inspector-audit.test.mjs`: deterministic complete audit provenance fixture includes viewport/visual viewport/DPR, pointer, UI/HUD/text scales, safe/layout insets, appearance, adjustments, SHA/dirty/content fingerprint. Native fit/layout/menu-fit report envelopes test matching and nonmatching provenance and unique selector mapping. Browser callbacks run serialized in a VM; no live audit files or browser.
- `ui-inspector-css.test.mjs`: mock CDP session records all commands/listeners, stylesheet-added source URL, matched/computed/ancestor/container geometry and injected command failures. Assertions cover releaseObjectGroup/detach, missing capabilities, flat-tree ambiguity and bounded serialized output. This preserves candidate evidence; it deliberately does not establish winning cascade declarations, inheritance or evaluated container-query truth.
- `ui-inspector-transitions.test.mjs`: serialized `settleLayout` uses synthetic nodes, mutable datasets/rectangles, explicitly advanced rAF/timeouts and animation arrays. `record` constructs forward/reverse inspection evidence. Tests distinguish observed hysteresis from bugs, cap history, preserve unknowns, cancel pending callbacks/deadlines and clean exceptions. No wall-time/browser settling evidence.
- Career journey cases mostly pin CSS/HTML/JS source. Two execute extracted real callbacks in a VM: full numeric career input plus draft gate, and save retry with durable true/false. Extraction anchors are source-shape sensitive. Race journey cases use comment-stripped shallow CSS-rule scanning, zoom extraction and raw patterns; session journey cases pin inherited fit floors, local scroll contracts and garage host fading.

Cleanup findings: no production edits proposed by this mapping. Strong cleanup assertions cover routes, slow requests, responsive viewports, CDP sessions/object groups, sampler timers/rAF, detached ScrollFade observer targets and queued hidden track-detail redraw source guards. Potential maintenance debt: fixed delta artifact filename; syntax/comment-dependent CSS carve boundaries and JS source extraction; giant multi-feature case in `ui-improve-pass.test.mjs` (1691–2243) weakens failure locality; broad regex scans can match unrelated later declarations. Several `css()` results are arrays but a few checks use string-oriented `.includes`/regex coercion, so those negative glow-token checks may not inspect declarations as intended. These are source-review findings, not observed test failures.

## Complete file and case ledger

### `tests/unit/ui-explorer.test.mjs`

Full read: 1–596; SHA-256: `90d6f9bf75b9889540b2090e6e0ad4d7c8944bcf1ab503c4610e5fd313010eb6`.

Direct local dependencies: `tools/ui/explorer.mjs`, `tools/ui/explorer/catalog.mjs`, `tools/ui/explorer/core.mjs`, `tools/ui/explorer/browser.mjs`.

File-wide production/source inputs: imported production tool modules listed above.

#### `explorer CLI rejects unbounded probes, typo modes and credential URLs before browser acquisition` (9–16)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `parseOptions → tools/ui/explorer.mjs:46`, `MODE_TITLES → tools/ui/explorer/catalog.mjs`.

Case-local fixture/setup bindings (including action results): `args` 10–10.

Fixture iteration domains: `for (const args of [["all", "--max-shots", "26"], ["all", "--max-shots", "NaN"], ["all", "--max-attempts", "0"], ["all", "--frac", "1.1"], ["all", "--out"], ["all", "--modes", "typo"], ["all", "--url", "https://secret:password@example.com/"], ["all", "--unknown"], ["all", "extra"]])`.

- Assertion 10–10: `assert.throws(() => parseOptions(args))`.
- Assertion 11–11: `assert.equal(parseOptions(["responsive", "--max-shots=0"]).maxShots, 0)`.
- Assertion 12–12: `assert.throws(() => parseOptions(["all", "--max-shots", "-1"]))`.
- Assertion 13–13: `assert.throws(() => parseOptions(["all", "--frac", "-0.1"]))`.
- Assertion 14–14: `assert.deepEqual(parseOptions(["scene", "--scene-views", "-45"]).sceneViews, [-45])`.
- Assertion 15–15: `assert.deepEqual(parseOptions(["all"]).modes.sort(), Object.keys(MODE_TITLES).sort())`.

#### `shipped missions are validated data with a real goal oracle` (18–25)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `MISSIONS → tools/ui/explorer/catalog.mjs`, `validateScenario → tools/ui/explorer/core.mjs:141`, `missionBrief → tools/ui/explorer/catalog.mjs`.

Case-local fixture/setup bindings (including action results): `m` 19–19; `v` 19–19; `b` 20–20.

Fixture iteration domains: `for (const m of MISSIONS)`.

- Assertion 19–19: `assert(v.actions.length > 3)`.
- Assertion 19–19: `assert(v.oracle)`.
- Assertion 21–21: `assert(b.task.includes(MISSIONS[0].goal))`.
- Assertion 22–22: `assert(b.task.includes("visible controls only"))`.
- Assertion 23–23: `assert(!b.task.includes("#mb-race"), "blind brief must not leak the scripted solution")`.
- Assertion 24–24: `assert.throws(() => missionBrief(MISSIONS[0], "javascript:alert(1)"))`.

#### `replay uses actionable Playwright controls instead of direct DOM click` (27–34)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `performAction → tools/ui/explorer/browser.mjs:53`.

Case-local fixture/setup bindings (including action results): `seen` 28–28; `session` 29–29.

- Assertion 33–33: `assert.deepEqual(seen, ["#menu", "livery", "Escape"])`.

#### `minimizer oracle matches the same console finding rather than any error` (36–40)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `matchesOracle → tools/ui/explorer/browser.mjs:90`.

Case-local fixture/setup bindings (including action results): `session` 37–37.

- Assertion 38–38: `assert.equal(await matchesOracle(session, { type: "console", kind: "pageerror", pattern: "Expected marker" }), false)`.
- Assertion 39–39: `assert.equal(await matchesOracle(session, { type: "console", kind: "console", pattern: "Expected marker" }), true)`.

#### `race mission verifies actual track and weather instead of just a visible HUD` (42–48)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `validateScenario → tools/ui/explorer/core.mjs:141`, `MISSIONS → tools/ui/explorer/catalog.mjs`, `matchesOracle → tools/ui/explorer/browser.mjs:90`.

Case-local fixture/setup bindings (including action results): `oracle` 43–43.

- Assertion 44–44: `assert.equal(oracle.type, "game")`.
- Assertion 45–45: `assert.equal(await matchesOracle({ page: { evaluate: async () => ({ track: "monza", weather: "wet" }) } }, oracle), false)`.
- Assertion 46–46: `assert.equal(await matchesOracle({ page: { evaluate: async () => ({ track: "monaco", weather: "dry" }) } }, oracle), false)`.
- Assertion 47–47: `assert.equal(await matchesOracle({ page: { evaluate: async () => ({ track: "monaco", weather: "wet" }) } }, oracle), true)`.

#### `fault profiles leave ordinary scripts alone, intercept assets and restore routing` (50–58)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `installFault → tools/ui/explorer/browser.mjs:214`.

Case-local fixture/setup bindings (including action results): `handler` 51–51; `restored` 51–51; `aborted` 51–51; `continued` 51–51; `context` 52–52; `f` 53–53; `route` 54–54.

- Assertion 55–55: `assert(continued)`.
- Assertion 55–55: `assert(!aborted)`.
- Assertion 56–56: `assert(aborted)`.
- Assertion 56–56: `assert.equal(f.events.length, 1)`.
- Assertion 57–57: `assert(restored)`.

#### `asset faults compose with earlier fixtures and restore only their own handler` (60–83)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `installFault → tools/ui/explorer/browser.mjs:214`.

Case-local fixture/setup bindings (including action results): `handlers` 61–61; `calls` 61–61; `context` 62–65; `fixture` 66–66; `request` 68–75; `chain` 69–69; `dispatch` 70–73; `fault` 76–76.

- Assertion 64–64: `assert.equal(pattern, "**/*")`.
- Assertion 77–77: `assert.equal(await request("https://example.test/api/schedule"), "fixture")`.
- Assertion 78–78: `assert.equal(await request("https://example.test/assets/model.glb"), "aborted")`.
- Assertion 80–80: `assert.deepEqual(handlers, [fixture])`.
- Assertion 81–81: `assert.equal(await request("https://example.test/assets/model.glb"), "fixture")`.
- Assertion 82–82: `assert.equal(calls.length, 2)`.

#### `restoring a slow asset fault drains its pending request through the remaining fixture` (85–97)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `installFault → tools/ui/explorer/browser.mjs:214`.

Case-local fixture/setup bindings (including action results): `handler` 86–86; `removed` 86–86; `fallbackFinished` 86–86; `context` 87–90; `fault` 91–91; `request` 92–93.

- Assertion 89–89: `assert.equal(fn, handler)`.
- Assertion 93–93: `assert(removed)`.
- Assertion 94–94: `assert.equal(fault.events.length, 1)`.
- Assertion 94–94: `assert(!fallbackFinished)`.
- Assertion 96–96: `assert(fallbackFinished)`.

#### `DOM screening ignores controls inside closed folds but preserves real offscreen findings` (99–115)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectUI → tools/ui/explorer/inspector.mjs:9`, `toString → function toString() { [native code] }`.

Case-local fixture/setup bindings (including action results): `rect` 100–100; `summary` 101–101; `fold` 102–102; `control` 103–104; `root` 105–105; `document` 106–107; `ctx` 108–109; `inspect` 110–110.

- Assertion 111–111: `assert.deepEqual(inspect().controls, [])`.
- Assertion 113–113: `assert(inspect().issues.some((i) => i.kind === "offscreen" && i.selector === "#test-control"))`.
- Assertion 114–114: `assert(inspect().roots.includes("overlay"))`.

#### `scene diagnostics read the presented state and pause before any DOM/ARIA work, including on failure` (117–126)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `captureSceneDiagnostics → tools/ui/explorer/browser.mjs:123`, `toString → function toString() { [native code] }`.

Case-local fixture/setup bindings (including action results): `calls` 118–118; `a` 119–119; `ctx` 120–120.

- Assertion 122–122: `assert.deepEqual(calls, ["scene", "camera", "pause"])`.
- Assertion 124–124: `assert.throws(() => vm.runInContext(ˋ(${captureSceneDiagnostics.toString()})()ˋ, ctx))`.
- Assertion 125–125: `assert.deepEqual(calls, ["pause"])`.

#### `inspector resolves multi-ID labels, native roles and pressed state` (128–147)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectUI → tools/ui/explorer/inspector.mjs:9`, `toString → function toString() { [native code] }`.

Case-local fixture/setup bindings (including action results): `attrs` 129–129; `rect` 130–130; `control` 131–132; `document` 133–135; `ctx` 136–137; `inspect` 138–138.

- Assertion 139–139: `assert.equal(inspect().controls[0].name, "Audio layers")`.
- Assertion 141–141: `assert.deepEqual(inspect().adaptive.preferences, document.documentElement.dataset)`.
- Assertion 142–142: `assert.equal(inspect().controls[0].pressed, "false")`.
- Assertion 144–144: `assert.equal(inspect().controls[0].pressed, "true")`.
- Assertion 146–146: `assert.equal(inspect().controls[0].role, "slider")`.

#### `inspector ignores boxless contents ancestors but preserves an outer real clip` (149–167)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectUI → tools/ui/explorer/inspector.mjs:9`, `toString → function toString() { [native code] }`.

Case-local fixture/setup bindings (including action results): `rect` 150–150; `zero` 151–151; `outer` 152–152; `contents` 153–153; `control` 154–155; `document` 156–157; `outerClips` 158–158; `ctx` 159–161; `inspect` 162–162.

- Assertion 163–163: `assert.deepEqual(inspect().controls[0].reachability.clippedBy, [])`.
- Assertion 164–164: `assert.equal(inspect().controls[0].reachability.hit, "hits")`.
- Assertion 166–166: `assert.deepEqual(inspect().controls[0].reachability.clippedBy, [{ selector: "#outer", axis: "x" }])`.

#### `semantic state keys distinguish constant-label toggle changes` (169–174)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `stateKey → tools/ui/explorer/core.mjs:179`.

Case-local fixture/setup bindings (including action results): `{ stateKey }` 170–170; `a` 171–171; `b` 172–172.

- Assertion 173–173: `assert.notEqual(stateKey(a), stateKey(b))`.

#### `inspect CLI validates routes and selector budgets before browser acquisition` (176–183)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `parseOptions → tools/ui/explorer.mjs:46`.

Case-local fixture/setup bindings (including action results): `opts` 177–177; `args` 179–179; `size` 181–181.

Fixture iteration domains: `for (const args of [["inspect", "--screen", "missing"], ["inspect", "--styles", " "] , ["inspect", "--selector", "x".repeat(513)], ["missions", "--styles", "button"]])`; `for (const size of ["", "390x", "239x844", "390x2161", "Infinityx844", "390.5x844", Array(9).fill("390x844").join(",")])`.

- Assertion 178–178: `assert.equal(opts.command, "inspect")`.
- Assertion 178–178: `assert.equal(opts.styles, "#pm-uiscale")`.
- Assertion 179–179: `assert.throws(() => parseOptions(args))`.
- Assertion 180–180: `assert.deepEqual(parseOptions(["inspect", "--viewports", "390x844,844x390"]).viewports, [{ width: 390, height: 844 }, { width: 844, height: 390 }])`.
- Assertion 181–181: `assert.throws(() => parseOptions(["inspect", "--viewports=" + size]))`.
- Assertion 182–182: `assert.throws(() => parseOptions(["responsive", "--viewports", "390x844"]))`.

#### `inspect CLI bounds round-trip and audit inputs before browser acquisition` (185–189)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `parseOptions → tools/ui/explorer.mjs:46`.

Case-local fixture/setup bindings (including action results): `options` 186–186; `args` 188–188.

Fixture iteration domains: `for (const args of [["inspect", "--roundtrip"], ["inspect", "--viewports", "390x844", "--roundtrip=false"], ["inspect", "--audit="], ["missions", "--audit", "x.json"], ["inspect", "--audit"]])`.

- Assertion 187–187: `assert.equal(options.roundTrip, true)`.
- Assertion 187–187: `assert.equal(options.audit, "artifacts/audit.json")`.
- Assertion 188–188: `assert.throws(() => parseOptions(args))`.

#### `inspector diffs separate semantic changes from movement and include runtime bindings` (191–206)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `diffInspections → tools/ui/explorer/inspector.mjs:270`.

Case-local fixture/setup bindings (including action results): `{ diffInspections }` 192–192; `control` 193–193; `before` 194–194; `after` 195–195; `adapted` 200–201.

- Assertion 196–196: `assert.deepEqual(diffInspections(before, after).changed, [])`.
- Assertion 197–197: `assert.deepEqual(diffInspections(before, after).layout, ["#size"])`.
- Assertion 199–199: `assert.equal(diffInspections(before, after).changed.length, 1)`.
- Assertion 202–202: `assert.deepEqual(diffInspections(before, adapted).changed, [])`.
- Assertion 203–203: `assert.deepEqual(diffInspections(before, adapted).layout, ["#size"])`.
- Assertion 204–204: `assert.deepEqual(diffInspections(before, adapted).layoutContexts, ["#sheet"])`.
- Assertion 205–205: `assert.equal(diffInspections(before, adapted).environmentChanged, true)`.

#### `responsive inspection validates before mutation and restores viewport even on failure` (208–235)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectResponsive → tools/ui/explorer/inspector.mjs:289`.

Case-local fixture/setup bindings (including action results): `{ inspectResponsive }` 209–209; `changes` 210–210; `original` 210–210; `current` 210–210; `fail` 210–210; `page` 211–216; `viewports` 219–219; `report` 220–220; `roundTrip` 224–224.

- Assertion 217–217: `assert.rejects(() => inspectResponsive(page, { viewports: [{ width: 200, height: 800 }] }), /viewports/)`.
- Assertion 218–218: `assert.deepEqual(changes, [])`.
- Assertion 221–221: `assert.deepEqual(changes, [...viewports, original])`.
- Assertion 222–222: `assert.equal(report.records[1].diff.viewportChanged, true)`.
- Assertion 223–223: `assert.equal(report.records[0].diff, null)`.
- Assertion 225–225: `assert.deepEqual(roundTrip.records.map(r => r.phase), ["forward", "forward", "reverse"])`.
- Assertion 226–226: `assert.deepEqual(roundTrip.records.map(r => r.sourceIndex), [0, 1, 0])`.
- Assertion 227–227: `assert.deepEqual(changes.slice(-4), [...viewports, viewports[0], original])`.
- Assertion 228–228: `assert.ok(roundTrip.paths)`.
- Assertion 231–231: `assert.rejects(() => inspectResponsive(page, { viewports }), /Root disappeared/)`.
- Assertion 232–232: `assert.deepEqual(current, original)`.
- Assertion 233–233: `assert.deepEqual(changes.slice(-2), [viewports[0], original])`.
- Assertion 234–234: `assert.rejects(() => inspectResponsive({ viewportSize: () => null }, { viewports }), /restorable/)`.

#### `CSS inspection detaches its CDP session when the selector is ambiguous` (237–244)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectPage → tools/ui/explorer/inspector.mjs:244`.

Case-local fixture/setup bindings (including action results): `{ inspectPage }` 238–238; `detached` 239–239; `cdp` 240–240; `page` 241–241.

- Assertion 242–242: `assert.rejects(() => inspectPage(page, { styles: "button" }), /exactly one/)`.
- Assertion 243–243: `assert.equal(detached, true)`.

#### `inspect CLI bounds touch, boot, safe-area and summary flags before browser acquisition` (246–256)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `parseOptions → tools/ui/explorer.mjs:46`.

Case-local fixture/setup bindings (including action results): `o` 247–247; `plain` 251–251; `args` 253–253.

Fixture iteration domains: `for (const args of [["inspect", "--safe", "1,2,3"], ["inspect", "--safe", "0,59,21,-1"], ["inspect", "--safe", "0,59,21,201"], ["inspect", "--safe", "a,b,c,d"], ["inspect", "--boot", "932"], ["inspect", "--boot", "100x100"], ["inspect", "--touch=yes"], ["inspect", "--summary=1"], ["missions", "--touch"], ["responsive", "--safe", "0,0,0,0"], ["all", "--boot", "932x430"]])`.

- Assertion 248–248: `assert.equal(o.touch, true)`.
- Assertion 248–248: `assert.equal(o.summary, true)`.
- Assertion 249–249: `assert.deepEqual(o.boot, { width: 932, height: 430 })`.
- Assertion 250–250: `assert.deepEqual(o.safe, { top: 0, right: 59, bottom: 21, left: 59 })`.
- Assertion 252–252: `assert.equal(plain.touch, false)`.
- Assertion 252–252: `assert.equal(plain.boot, null)`.
- Assertion 252–252: `assert.equal(plain.safe, null)`.
- Assertion 255–255: `assert.throws(() => parseOptions(args), String(args))`.

#### `busy box and held lock defer with exit 75, distinct from a failed probe` (258–264)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `loadDeferral → tools/ui/explorer.mjs:126`, `deferral → tools/ui/explorer.mjs:125`.

Case-local fixture/setup bindings (including action results): `{ loadDeferral, deferral }` 259–259.

- Assertion 260–260: `assert.equal(loadDeferral(2.9), null)`.
- Assertion 261–261: `assert.equal(loadDeferral(3).exitCode, 75)`.
- Assertion 262–262: `assert.match(loadDeferral(4.2).message, /deferred/)`.
- Assertion 263–263: `assert.equal(deferral("Browser occupied").exitCode, 75)`.

#### `inspect summary prints one line per issue and marks provisional records` (266–279)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `summarizeInspection → tools/ui/explorer.mjs:131`.

Case-local fixture/setup bindings (including action results): `{ summarizeInspection }` 267–267; `report` 268–270; `summary` 271–271; `single` 275–275.

- Assertion 272–272: `assert(summary.includes("select\t932x430\tblocked (provisional)\t#a\tA covered"))`.
- Assertion 273–273: `assert(summary.includes("select\t844x390\tno-findings\tcoverage"))`.
- Assertion 274–274: `assert(summary.includes("bindings=unknown"))`.
- Assertion 276–276: `assert(single.includes("settlement=stable; truncated=settlement"))`.
- Assertion 277–277: `assert(single.includes("behavior=not-tested; persistence=not-tested"))`.
- Assertion 278–278: `assert(!single.includes("clean"))`.

#### `binding assertions require live agreement and the exact saved value, never an unmapped pass` (281–293)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `checkBinding → tools/ui/explorer/browser.mjs:110`, `performAction → tools/ui/explorer/browser.mjs:53`.

Case-local fixture/setup bindings (including action results): `{ checkBinding }` 282–282; `binding` 283–283; `session` 284–284; `oracle` 285–285; `change` 287–287.

Fixture iteration domains: `for (const change of [{ status: "unmapped" }, { status: "unavailable" }, { status: "mismatch" }, { saved: { status: "unavailable", value: "light" } }, { saved: { status: "read", value: null } }, { runtime: "dark" }])`.

- Assertion 286–286: `assert.equal((await checkBinding(session, oracle)).matches, true)`.
- Assertion 290–290: `assert.equal((await checkBinding(session, oracle)).matches, false)`.
- Assertion 291–291: `assert.rejects(() => performAction(session, { type: "assert", oracle }), /Replay assertion failed:.*actual/)`.

#### `inspector scopes include the control itself, reject ambiguity and expose bounded coverage` (295–323)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectUI → tools/ui/explorer/inspector.mjs:9`, `toString → function toString() { [native code] }`.

Case-local fixture/setup bindings (including action results): `rect` 296–296; `runtime` 297–297; `ambiguous` 297–297; `group` 298–298; `buttons` 299–301; `document` 303–304; `context` 306–308; `inspect` 309–309; `single` 310–310; `limited` 316–316.

- Assertion 311–311: `assert.equal(single.controls.length, 1)`.
- Assertion 312–312: `assert.equal(single.controls[0].binding.status, "matches")`.
- Assertion 313–313: `assert.equal(single.coverage.bindings.matches, 1)`.
- Assertion 315–315: `assert.equal(inspect({ root: "#theme-0" }).controls[0].binding.status, "mismatch")`.
- Assertion 317–317: `assert.deepEqual(limited.coverage.controls, { total: 3, inspected: 1, omitted: 2 })`.
- Assertion 318–318: `assert.equal(limited.truncated, true)`.
- Assertion 319–319: `assert.equal(limited.coverage.persistence, "not-tested")`.
- Assertion 321–321: `assert.throws(() => inspect({ root: "#scope" }), /exactly one.*matched 2/)`.
- Assertion 322–322: `assert.throws(() => inspect({ root: "#missing" }), /exactly one.*matched 0/)`.

#### `inspector counts a native label as the tap target and the bare root as not hit-testable` (325–350)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectUI → tools/ui/explorer/inspector.mjs:9`, `toString → function toString() { [native code] }`.

Case-local fixture/setup bindings (including action results): `rect` 326–326; `row` 327–327; `box` 328–329; `html` 330–330; `hit` 331–331; `document` 332–333; `ctx` 335–336; `inspect` 337–337; `labelled` 338–338; `bare` 344–344.

- Assertion 339–339: `assert.equal(labelled.controls[0].reachability.hit, "hits")`.
- Assertion 340–340: `assert.equal(labelled.issues.some(i => i.kind === "tiny-target"), false, "the 400x56 label row is the target, not the 14px box")`.
- Assertion 342–342: `assert.match(inspect().issues.find(i => i.kind === "tiny-target").message, /14\.0 × 14\.0/)`.
- Assertion 345–345: `assert.equal(bare.controls[0].reachability.hit, "not-hit-testable")`.
- Assertion 346–346: `assert.deepEqual(bare.issues.filter(i => i.kind === "blocked"), [])`.
- Assertion 347–347: `assert(bare.issues.some(i => i.kind === "not-hit-testable"))`.
- Assertion 349–349: `assert(inspect().issues.some(i => i.kind === "blocked" && /#cover/.test(i.message)))`.

#### `responsive inspection resamples an unsettled record once, then marks its issues provisional` (352–369)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectResponsive → tools/ui/explorer/inspector.mjs:289`.

Case-local fixture/setup bindings (including action results): `{ inspectResponsive }` 353–353; `settles` 354–354; `settleScript` 354–354; `current` 355–355; `page` 356–361; `report` 362–362.

- Assertion 363–363: `assert.equal(settles, 3, "first record settles twice, second once")`.
- Assertion 364–364: `assert.equal(report.records[0].settlement.retried, true)`.
- Assertion 365–365: `assert.equal(report.records[0].inspection.provisional, true)`.
- Assertion 366–366: `assert.equal(report.records[0].inspection.issues[0].provisional, true)`.
- Assertion 367–367: `assert.equal(report.records[1].inspection.provisional, undefined)`.
- Assertion 368–368: `assert.equal(report.records[1].inspection.issues[0].provisional, undefined)`.

#### `single-size inspect settles before reading and keeps the settlement record` (371–385)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectSettled → tools/ui/explorer/inspector.mjs:255`.

Case-local fixture/setup bindings (including action results): `{ inspectSettled }` 372–372; `calls` 373–373; `page` 374–379; `{ settlement, inspection }` 380–380.

- Assertion 381–381: `assert.equal(calls[0], "settleLayout", "settles before the DOM read")`.
- Assertion 382–382: `assert.equal(settlement.retried, true)`.
- Assertion 382–382: `assert.equal(settlement.stable, true)`.
- Assertion 383–383: `assert.equal(inspection.provisional, undefined)`.
- Assertion 384–384: `assert.equal(inspection.issues[0].provisional, undefined)`.

#### `an unsettled record with no animation frames is not retried (more time cannot help)` (387–398)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectSettled → tools/ui/explorer/inspector.mjs:255`.

Case-local fixture/setup bindings (including action results): `{ inspectSettled }` 388–388; `settles` 389–389; `page` 390–394; `{ settlement, inspection }` 395–395.

- Assertion 396–396: `assert.equal(settles, 1)`.
- Assertion 396–396: `assert.equal(settlement.retried, undefined)`.
- Assertion 397–397: `assert.equal(inspection.provisional, true)`.
- Assertion 397–397: `assert.equal(inspection.issues[0].provisional, true)`.

#### `inspector: a control whose centre is under a sibling past a scroller edge reads needs-scroll, not blocked (T11)` (400–416)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectUI → tools/ui/explorer/inspector.mjs:9`, `toString → function toString() { [native code] }`.

Case-local fixture/setup bindings (including action results): `rect` 401–401; `scroller` 402–402; `input` 403–404; `overlay` 405–405; `document` 406–407; `ctx` 408–409; `inspect` 410–410; `sliver` 411–411.

- Assertion 412–412: `assert.equal(sliver.controls[0].reachability.hit, "needs-scroll")`.
- Assertion 413–413: `assert.deepEqual(sliver.issues.filter(i => i.kind === "blocked"), [])`.
- Assertion 415–415: `assert.equal(inspect().controls[0].reachability.hit, "blocked")`.

#### `binding assertions tolerate finite numeric serialization without coercing other types` (419–435)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `checkBinding → tools/ui/explorer/browser.mjs:110`.

Case-local fixture/setup bindings (including action results): `{ checkBinding }` 420–420; `runtime` 421–421; `saved` 421–421; `session` 422–424; `oracle` 425–425; `wrong` 427–427.

Fixture iteration domains: `for (const wrong of [109.001, '109', true, NaN, Infinity])`.

- Assertion 426–426: `assert.equal((await checkBinding(session, oracle)).matches, true)`.
- Assertion 429–429: `assert.equal((await checkBinding(session, oracle)).matches, false)`.
- Assertion 432–432: `assert.equal((await checkBinding(session, oracle)).matches, false)`.
- Assertion 434–434: `assert.equal((await checkBinding(session, { ...oracle, runtime: 'light', saved: 'light' })).matches, true)`.

#### `inspector includes pointer-only controls, named canvases and bounded select options in boxless regions` (437–479)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `inspectUI → tools/ui/explorer/inspector.mjs:9`, `toString → function toString() { [native code] }`.

Case-local fixture/setup bindings (including action results): `rect` 438–438; `element` 439–441; `pointer` 442–442; `canvas` 444–444; `decorative` 445–445; `select` 446–446; `region` 450–450; `unfocusable` 453–453; `hidden` 454–454; `activeView` 455–455; `controls` 456–456; `document` 457–458; `context` 459–461; `report` 462–462; `exportView` 466–466; `choices` 473–473.

- Assertion 463–463: `assert.deepEqual(report.roots, ['sheet'])`.
- Assertion 464–464: `assert.deepEqual(report.views, ['#editor'])`.
- Assertion 467–467: `assert.deepEqual(exportView.views, ['#dh-panel[aria-labelledby=\"dh-tab-export\"]'])`.
- Assertion 468–468: `assert.deepEqual(report.controls.map(c => c.selector), ['#next', '#editor', '#theme'])`.
- Assertion 469–469: `assert.equal(report.controls[0].interactionKind, 'pointer-only')`.
- Assertion 470–470: `assert.equal(report.controls[0].ariaHidden, true)`.
- Assertion 471–471: `assert.equal(report.controls[1].interactionKind, 'custom-surface')`.
- Assertion 472–472: `assert(!report.issues.some(i => i.kind === 'unnamed' && i.selector === '#next'))`.
- Assertion 474–474: `assert.equal(choices.options.length, 64)`.
- Assertion 475–475: `assert.equal(choices.options[0].name.length, 160)`.
- Assertion 476–476: `assert.equal(choices.options[0].truncated, true)`.
- Assertion 477–477: `assert.equal(choices.options[1].disabled, true)`.
- Assertion 478–478: `assert.deepEqual(choices.optionCoverage, { total: 70, inspected: 64, omitted: 6, truncated: true })`.

#### `garage routes stop when deferred content never becomes ready` (481–489)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `openGarageTab → tools/ui/menu-screens.mjs:78`.

Case-local fixture/setup bindings (including action results): `{ openGarageTab }` 482–482; `clicks` 483–483; `page` 484–486.

- Assertion 487–487: `assert.rejects(() => openGarageTab(page, 'team'), /remained busy/)`.
- Assertion 488–488: `assert.deepEqual(clicks, ['#mb-garage'], 'never silently skip a missing tab or click stale content')`.

#### `theme persistence recipe exercises the current native control on both sides of reload` (491–498)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `MISSIONS → tools/ui/explorer/catalog.mjs`.

Case-local fixture/setup bindings (including action results): `mission` 492–492; `reload` 493–493; `actions` 495–495.

Fixture iteration domains: `for (const actions of [mission.actions.slice(0, reload), mission.actions.slice(reload + 1)])`.

- Assertion 494–494: `assert(mission.actions.some(a => a.type === 'select' && a.selector === '#pm-uitheme-sel' && a.value === 'light'))`.
- Assertion 496–496: `assert(actions.some(a => a.type === 'assert' && a.oracle.selector === '#pm-uitheme-sel' && a.oracle.saved === 'light'))`.

#### `reload blocks subsequent replay actions until the game boot boundary` (500–512)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `performAction → tools/ui/explorer/browser.mjs:53`.

Case-local fixture/setup bindings (including action results): `seen` 501–501; `releaseBoot` 501–501; `page` 502–504; `finished` 505–505; `work` 506–506.

- Assertion 508–508: `assert.equal(finished, false, 'DOMContentLoaded alone cannot authorize a replay click')`.
- Assertion 509–509: `assert.deepEqual(seen, ['document', 'boot-pending'])`.
- Assertion 511–511: `assert.deepEqual(seen, ['document', 'boot-pending', 'pause-menu-rendering'])`.

#### `UI profiles preserve descriptor browser chrome, DPR and touch while labeling custom sizes` (515–546)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `resolveUIProfile → tools/lib/ui-device-profile.mjs:7`, `uiTestOptions → tools/lib/ui-device-profile.mjs:34`, `parseOptions → tools/ui/explorer.mjs:46`.

Case-local fixture/setup bindings (including action results): `{ resolveUIProfile, uiTestOptions }` 516–516; `{ devices }` 517–517; `phone` 518–518; `tablet` 526–526; `desktop` 530–530; `stress` 534–534; `opts` 543–543.

- Assertion 519–519: `assert.equal(phone.contextOptions.userAgent, devices['iPhone 13'].userAgent)`.
- Assertion 520–520: `assert.equal(phone.contextOptions.deviceScaleFactor, 3)`.
- Assertion 521–521: `assert.equal(phone.contextOptions.isMobile, true)`.
- Assertion 522–522: `assert.equal(phone.contextOptions.hasTouch, true)`.
- Assertion 523–523: `assert.deepEqual(phone.contextOptions.viewport, devices['iPhone 13'].viewport)`.
- Assertion 524–524: `assert.deepEqual(phone.contextOptions.screen, devices['iPhone 13'].screen)`.
- Assertion 525–525: `assert.equal(phone.profile.kind, 'device-emulation')`.
- Assertion 527–527: `assert.deepEqual(tablet.contextOptions.screen, { width: 768, height: 1024 })`.
- Assertion 528–528: `assert(!Object.hasOwn(tablet, 'screen'), 'screen must use the Playwright Test contextOptions channel')`.
- Assertion 529–529: `assert.equal(tablet.isMobile, true)`.
- Assertion 531–531: `assert.deepEqual(desktop.contextOptions.screen, devices['Desktop Chrome'].screen)`.
- Assertion 532–532: `assert.notDeepEqual(desktop.contextOptions.screen, desktop.viewport, 'desktop monitor and browser window are independent')`.
- Assertion 533–533: `assert(!Object.hasOwn(phone.contextOptions, 'defaultBrowserType'))`.
- Assertion 535–535: `assert.equal(stress.profile.kind, 'custom-css-viewport')`.
- Assertion 536–536: `assert.equal(stress.profile.raster, 'geometry-override')`.
- Assertion 537–537: `assert.deepEqual(stress.contextOptions.screen, { width: 844, height: 390 })`.
- Assertion 538–538: `assert.equal(stress.contextOptions.isMobile, true)`.
- Assertion 539–539: `assert.equal(resolveUIProfile({ viewport: { width: 390, height: 844 } }).contextOptions.hasTouch, false)`.
- Assertion 540–540: `assert.throws(() => resolveUIProfile({ device: 'made-up phone' }))`.
- Assertion 541–541: `assert.throws(() => resolveUIProfile({ viewport: { width: NaN, height: 390 } }))`.
- Assertion 542–542: `assert.throws(() => resolveUIProfile({ deviceScaleFactor: 0 }))`.
- Assertion 544–544: `assert.equal(opts.device, 'iPhone 13')`.
- Assertion 544–544: `assert.equal(opts.settingsFile, 'appearance.json')`.
- Assertion 545–545: `assert.throws(() => parseOptions(['inspect', '--device', 'made-up phone']))`.

#### `full-screen catalog cells stay full-screen when Playwright's browser-chrome descriptors change` (548–556)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `VIEWPORTS → tools/ui/menu-screens.mjs:25`.

Case-local fixture/setup bindings (including action results): `{ VIEWPORTS }` 549–549; `[id, width, height]` 550–550; `[, options]` 551–551.

Fixture iteration domains: `for (const [id, width, height] of [['ios-iphone-portrait',393,852],['ios-iphone-landscape',852,393],['ios-iphone-landscape-844',844,390]])`.

- Assertion 552–552: `assert.deepEqual(options.viewport, { width, height })`.
- Assertion 553–553: `assert.deepEqual(options.screen, { width, height })`.
- Assertion 554–554: `assert(options.isMobile && options.hasTouch)`.

#### `replay emits native taps for mobile profiles and clicks for desktop` (558–564)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `performAction → tools/ui/explorer/browser.mjs:53`.

Case-local fixture/setup bindings (including action results): `calls` 559–559; `page` 560–560.

- Assertion 563–563: `assert.deepEqual(calls, ['tap', 'click'])`.

#### `invalid supplied settings never silently become shipped defaults or acquire a browser` (566–576)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `main → tools/ui/explorer.mjs:152`.

Case-local fixture/setup bindings (including action results): `fs` 567–567; `dir` 569–569; `value` 571–571; `file` 572–572.

Fixture iteration domains: `for (const value of [null, false, 0, [], {}, { format: 'other' }])`.

- Assertion 573–573: `assert.rejects(main(['inspect', '--settings', file]), /requires an Apex settings export/)`.

#### `MCP UI summary retains bounded console and request evidence without claiming a pass` (579–596)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `summarizeUIInspection → tools/mcp/ui-tools.mjs:58`.

Case-local fixture/setup bindings (including action results): `{ summarizeUIInspection }` 580–580; `empty` 581–581; `errors` 583–583; `result` 585–585.

- Assertion 582–582: `assert.equal(empty.diagnostics.consoleErrors, null, "missing logs remain unknown")`.
- Assertion 586–586: `assert.equal(result.diagnostics.pageErrors, 1)`.
- Assertion 587–587: `assert.equal(result.diagnostics.consoleErrors, 1)`.
- Assertion 588–588: `assert.equal(result.diagnostics.consoleWarnings, 11)`.
- Assertion 589–589: `assert.equal(result.diagnostics.failedRequests, 1)`.
- Assertion 590–590: `assert.equal(result.diagnostics.errorSamples.length, 10)`.
- Assertion 591–591: `assert.ok(result.diagnostics.errorSamples[0].message.length < 600)`.
- Assertion 592–592: `assert.equal(result.diagnostics.requestSamples[0].error, "net::ERR_FAILED")`.
- Assertion 593–593: `assert.equal(result.diagnostics.truncated, true)`.
- Assertion 594–594: `assert.match(result.limitation, /not a UI pass/)`.
- Assertion 595–595: `assert.equal(summarizeUIInspection({ controls: [], errors: [], requests: [] }).diagnostics.consoleErrors, 0)`.

### `tests/unit/ui-fit-camtune-portrait-r7.test.mjs`

Full read: 1–52; SHA-256: `552b6eea5142db0a8f97103717357b6cf50c9c9e04965fc10535db6c51bcb3c8`.

Direct local dependencies: `tests/helpers/css-rules.mjs`.

File-wide production/source inputs: `css/tuner.css`.

#### `compact rail-off camera sheet is one minmax column (no AUTO preview column)` (20–22)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 21–21: `assert.equal(decl(rules, COL, "grid-template-columns"), "minmax(0, 1fr)")`.

#### `rail-off #ct-previews sit in explicit grid row 3 and can shrink` (24–29)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 25–25: `assert.equal(decl(rules, PREV, "grid-row"), "3")`.
- Assertion 26–26: `assert.equal(decl(rules, PREV, "grid-column"), "1 / -1")`.
- Assertion 27–27: `assert.equal(decl(rules, PREV, "min-width"), "0")`.
- Assertion 28–28: `assert.equal(decl(rules, PREV, "flex-wrap"), "nowrap")`.

#### `rail-off preview chips and #ct-close keep the --tap-paint floor` (31–38)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 32–32: `assert.equal(decl(rules, PREV_BTN, "min-height"), "var(--tap-paint)")`.
- Assertion 33–33: `assert.equal(decl(rules, PREV_BTN, "min-width"), "0")`.
- Assertion 34–34: `assert.equal(decl(rules, FOOT_BTN, "min-height"), "var(--tap-paint)")`.
- Assertion 35–35: `assert.equal(decl(rules, CLOSE, "min-height"), "var(--tap-paint)")`.
- Assertion 36–36: `assert.equal(decl(rules, CLOSE, "width"), "auto")`.
- Assertion 37–37: `assert.equal(decl(rules, CLOSE, "min-width"), "0")`.

#### `camera preset chips and copy-all keep the --tap-paint floor` (40–43)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 41–41: `assert.equal(decl(rules, "#camtune-inner [id^=\"ct-preset-\"]", "min-width"), "var(--tap-paint)")`.
- Assertion 42–42: `assert.equal(decl(rules, "#camtune-inner #ct-copy-all-btn", "min-height"), "var(--tap-paint)")`.

#### `r7 overrides stay camera-only (no lighting-inner retarget in the block)` (45–52)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `m` 46–46.

- Assertion 47–47: `assert.ok(m, "r7 block present before @layer components close")`.
- Assertion 48–48: `assert.doesNotMatch(m[0], /#lighting-inner/, "must not retarget lighting in the r7 carve")`.
- Assertion 49–49: `assert.doesNotMatch(m[0], /#lt-/, "must not retarget #lt-* lighting selectors")`.
- Assertion 50–50: `assert.match(m[0], /#ct-previews/)`.
- Assertion 51–51: `assert.match(m[0], /#ct-close/)`.

### `tests/unit/ui-fit-camtune-tap-r5.test.mjs`

Full read: 1–71; SHA-256: `0a0f61fb5ca7d9d0d28630d37a8e0019ba2aab210cf96c008ffe40cd5849919f`.

File-wide production/source inputs: `css/tuner.css`.

#### `camera tuner compact foot buttons floor at --tap-paint (rail off and on)` (12–23)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 13–17: `assert.match( css, /#camtune-inner\[data-density="compact"\]\[data-rail="off"\]\s*>\s*\.sheet-foot\s+button,\s*\n\s*#camtune-inner\[data-density="compact"\]\[data-rail="on"\]\s*>\s*\.sheet-foot\s+button\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s, "compact foot DONE/RESET/COPY must paint at --tap-paint, not --tap-min", )`.
- Assertion 18–22: `assert.match( css, /#camtune-inner\[data-density="compact"\]\[data-rail="off"\]\s*>\s*\.sheet-foot\s+button,[\s\S]*?padding:\s*calc\(var\(--gap\)\s*\/\s*2\)\s+calc\(var\(--gap\)\s*\*\s*2\s*\/\s*3\)/s, "foot padding restored via --gap tokens so tap-paint height is reachable", )`.

#### `compact rail-on tuner actions use a readable two-column foot` (25–36)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 26–30: `assert.match( css, /\[data-density="compact"\]\[data-rail="on"\]\s*>\s*\.sheet-foot\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s, "short landscape rails must not crush RESET/COPY/DONE labels into one row", )`.
- Assertion 31–35: `assert.match( css, /\[data-density="compact"\]\[data-rail="on"\][^}]*\.sheet-foot\s+button\s*\{[^}]*white-space:\s*normal;[^}]*line-height:\s*1\.1/s, "rail actions may wrap inside their readable grid cells", )`.

#### `short phone landscape tuner rails keep action labels readable at normal scale` (38–44)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 39–43: `assert.match( css, /@media \(max-width: 900px\) and \(max-height: 500px\)[\s\S]*?:is\(#lighting-inner, #camtune-inner\)\s*>\s*\.sheet-foot\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s, "short landscape tuner feet need two action columns regardless of rail state or UI scale", )`.

#### `camera tuner compact preview chips and copy-from select floor at --tap-paint` (46–57)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 47–51: `assert.match( css, /#camtune-inner\[data-density="compact"\]\s+#ct-previews\s*>\s*button\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s, "MONZA/SPA/MONACO preview chips use --tap-paint", )`.
- Assertion 52–56: `assert.match( css, /#camtune-inner\s+#ct-copyrow\s+select,\s*\n\s*#camtune-inner\s+#ct-copy-from\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s, "copy-from select meets --tap-paint", )`.

#### `camera mode chips keep a --tap-paint min-width (short labels like TV)` (59–65)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 60–64: `assert.match( css, /#camtune-inner\s+#ct-modes\s+\.lt-tab\s*\{[^}]*min-width:\s*var\(--tap-paint\)/s, "TV and other short mode chips are at least --tap-paint wide", )`.

#### `r5 overrides stay camera-only (no lighting-inner retarget in the block)` (67–71)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `m` 68–68.

- Assertion 69–69: `assert.ok(m, "r5 block present before @layer components close")`.
- Assertion 70–70: `assert.doesNotMatch(m[0], /#lighting-inner/, "must not retarget lighting in the r5 carve")`.

### `tests/unit/ui-fit-flyby-tap-r6.test.mjs`

Full read: 1–56; SHA-256: `66136e784dee5a57e00acc11879f9ffd6c967d7ee0d57b1e6e5b114c6385cc0b`.

File-wide production/source inputs: `css/tuner.css`.

#### `flyby editor compact foot buttons floor at --tap-paint (rail off and on)` (12–23)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 13–17: `assert.match( css, /#flyby-inner\[data-density="compact"\]\s*>\s*\.sheet-foot\s+button,\s*\n\s*#flyby-inner\[data-density="compact"\]\[data-rail="on"\]\s*>\s*\.sheet-foot\s+button\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s, "compact foot RESET/COPY/DONE must paint at --tap-paint, not --tap-min", )`.
- Assertion 18–22: `assert.match( css, /#flyby-inner\[data-density="compact"\]\s*>\s*\.sheet-foot\s+button,[\s\S]*?padding:\s*calc\(var\(--gap\)\s*\/\s*2\)\s+calc\(var\(--gap\)\s*\*\s*2\s*\/\s*3\)/s, "foot padding restored via --gap tokens so tap-paint height is reachable", )`.

#### `flyby compact operations use three readable columns` (25–31)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 26–30: `assert.match( css, /#flyby-inner\[data-density="compact"\]\s+#fb-ops\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s, "compact Flyby operation labels need room for DOWN and NORM", )`.

#### `flyby foot stays on --tap-paint outside compact (portrait 51px vs house 52)` (33–39)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 34–38: `assert.match( css, /#flyby-inner\s*>\s*\.sheet-foot\s+button\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s, "non-compact RESET/COPY also floor at --tap-paint", )`.

#### `flyby pose selects floor at --tap-paint (#fb-in-ease / #fb-in-eye*-at)` (41–47)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 42–46: `assert.match( css, /#flyby-inner\s+#fb-rows\s+select,\s*\n\s*#flyby-inner\s+:is\(#fb-in-ease, \[id\^="fb-in-eye"\]\[id\$="-at"\], \[id\^="fb-in-look"\]\[id\$="-at"\]\)\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s, "EASE and pose ANCHOR selects must paint at --tap-paint, not --tap-min", )`.

#### `r6 overrides stay flyby-only (no camtune / lighting retarget in the block)` (49–56)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `m` 50–50.

- Assertion 51–51: `assert.ok(m, "r6 flyby block present before garage-angle and shared workspace styles")`.
- Assertion 52–52: `assert.doesNotMatch(m[0], /#camtune-inner/, "must not retarget camera in the r6 carve")`.
- Assertion 53–53: `assert.doesNotMatch(m[0], /#lighting-inner/, "must not retarget lighting in the r6 carve")`.
- Assertion 54–54: `assert.doesNotMatch(m[0], /#ct-/, "must not retarget #ct-* camera selectors")`.
- Assertion 55–55: `assert.doesNotMatch(m[0], /#lt-/, "must not retarget #lt-* lighting selectors")`.

### `tests/unit/ui-fit-garage-livery-r6.test.mjs`

Full read: 1–56; SHA-256: `ba80d00a86c807d3e81371f5bfd1d935db2368638655c78801c405b1402cd05d`.

Direct local dependencies: `tests/helpers/css-rules.mjs`.

File-wide production/source inputs: `css/carsetup.css`.

#### `LIVERY grid columns floor at 2× --tap (room for both chips + CHROME)` (18–23)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 19–22: `assert.equal( decl(rules, GRID, "grid-template-columns"), "repeat(auto-fill, minmax(min(max(72px, calc(var(--tap) * 2)), 100%), 1fr))", )`.

#### `LIVERY grid edit/delete chips lift the hit box to --tap / --tap-paint` (25–35)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 26–26: `assert.equal(decl(rules, CHIP, "box-sizing"), "content-box")`.
- Assertion 27–27: `assert.equal(decl(rules, CHIP, "width"), "var(--tap-min)")`.
- Assertion 28–28: `assert.equal(decl(rules, CHIP, "height"), "var(--tap-min)")`.
- Assertion 29–33: `assert.equal( decl(rules, CHIP, "padding"), "calc((max(var(--tap), var(--tap-paint)) - var(--tap-min)) / 2)", "padding is the hit slop: content stays --tap-min, border-box meets --tap", )`.
- Assertion 34–34: `assert.equal(decl(rules, CHIP, "background-clip"), "content-box")`.

#### `LIVERY grid finish tags do not ellipsis SATIN/CHROME` (37–48)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 38–38: `assert.equal(decl(rules, TAG, "text-overflow"), "clip")`.
- Assertion 39–39: `assert.equal(decl(rules, TAG, "overflow"), "visible")`.
- Assertion 40–40: `assert.equal(decl(rules, TAG, "max-width"), "none")`.
- Assertion 41–41: `assert.equal(decl(rules, TAG, "white-space"), "nowrap")`.
- Assertion 42–42: `assert.equal(decl(rules, SWATCH, "width"), "100%")`.
- Assertion 43–47: `assert.equal( decl(rules, "#cs-options.cs-liv-grid .cs-liv-swatch", "width"), null, "CREATE row swatch must not inherit width:100%", )`.

#### `r6 carve stays Garage LIVERY grid (no foreign selectors)` (50–56)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `m` 51–51.

- Assertion 52–52: `assert.ok(m, "r6 LIVERY block present through the chip position rule")`.
- Assertion 53–54: `assert.doesNotMatch(m[0], /#hud\|#lighting\|#camtune\|#ps-\|tokens\.css\|touch-controls\|tuner\.css\|menus\.css/, "must not retarget HUD / tuner / Photo Studio / other sheets")`.
- Assertion 55–55: `assert.match(m[0], /#cs-options\.cs-liv-grid/)`.

### `tests/unit/ui-fit-lighting-flyby-stack.test.mjs`

Full read: 1–58; SHA-256: `87717c6c3a436eda9107b73ed21409510a6302b4db42c60f22e30097d41a5178`.

Direct local dependencies: `tests/helpers/css-rules.mjs`.

File-wide production/source inputs: `css/tuner.css`.

#### `wide stacked lighting+flyby shrinks the dock so two sheets can sit side by side` (20–24)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `rule` 21–21.

- Assertion 22–22: `assert.ok(rule, "--dock-w shrink lives inside min-width: 800px (portrait stays full dock)")`.
- Assertion 23–23: `assert.equal(rule.decls.get("--dock-w"), "min(calc(40 * var(--vwz)), 360px)")`.

#### `stacked compact #lt-rows floors at three slider rows and hides COPY ALL` (26–29)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 27–27: `assert.equal(decl(rules, LT_ROWS, "min-height"), "max(132px, calc(3 * 44px))")`.
- Assertion 28–28: `assert.equal(decl(rules, LT_SPREAD, "display"), "none")`.

#### `wide stacked flyby docks on the left (lighting keeps the right)` (31–36)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `rule` 32–32.

- Assertion 33–33: `assert.ok(rule, "flyby left-dock rule lives inside min-width: 800px")`.
- Assertion 34–34: `assert.equal(rule.decls.get("left"), "calc((var(--sal) + 8px) / var(--sheet-eff-scale, var(--ui-scale)))")`.
- Assertion 35–35: `assert.equal(rule.decls.get("right"), "auto")`.

#### `stacked carve does not retarget camera or lower flyby tap floors` (38–45)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `m` 39–39.

- Assertion 40–40: `assert.ok(m, "stacked block sits immediately before the flyby tap-floor carve")`.
- Assertion 41–41: `assert.doesNotMatch(m[0], /#camtune-inner/, "must not retarget camera")`.
- Assertion 42–42: `assert.doesNotMatch(m[0], /#ct-/, "must not retarget #ct-*")`.
- Assertion 43–43: `assert.doesNotMatch(m[0], /min-height:\s*var\(--tap-min\)/, "must not lower tap floors to --tap-min")`.
- Assertion 44–44: `assert.doesNotMatch(m[0], /#fb-[a-z]/, "must not retarget #fb-* tap-floor selectors")`.

#### `flyby tap-paint floors from #1774 still stand` (47–58)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 48–52: `assert.match( css, /#flyby-inner\[data-density="compact"\]\s*>\s*\.sheet-foot\s+button,[\s\S]*?min-height:\s*var\(--tap-paint\)/, "#1774 compact foot --tap-paint floor must remain", )`.
- Assertion 53–57: `assert.match( css, /#flyby-inner\s+#fb-rows\s+select,[\s\S]*?min-height:\s*var\(--tap-paint\)/, "#1774 pose-select --tap-paint floor must remain", )`.

### `tests/unit/ui-fit-lighttune-tap-r6.test.mjs`

Full read: 1–38; SHA-256: `81c7c00f2e888f2b4cd34ae6f841f35e44c16381528fdf6e69d30161ce921b2b`.

File-wide production/source inputs: `css/tuner.css`.

#### `lighting tuner compact foot buttons floor at --tap-paint (rail off and on)` (12–23)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 13–17: `assert.match( css, /#lighting-inner\[data-density="compact"\]\[data-rail="off"\]\s*>\s*\.sheet-foot\s+button,\s*\n\s*#lighting-inner\[data-density="compact"\]\[data-rail="on"\]\s*>\s*\.sheet-foot\s+button\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s, "compact foot RESET/COPY/DONE must paint at --tap-paint, not --tap-min", )`.
- Assertion 18–22: `assert.match( css, /#lighting-inner\[data-density="compact"\]\[data-rail="off"\]\s*>\s*\.sheet-foot\s+button,[\s\S]*?padding:\s*calc\(var\(--gap\)\s*\/\s*2\)\s+calc\(var\(--gap\)\s*\*\s*2\s*\/\s*3\)/s, "foot padding restored via --gap tokens so tap-paint height is reachable", )`.

#### `lighting category chips keep a --tap-paint min-width (short labels like FX)` (25–31)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 26–30: `assert.match( css, /#lighting-inner\s+#lt-tabs\s+\.lt-tab\s*\{[^}]*min-width:\s*var\(--tap-paint\)/s, "FX and other short category chips are at least --tap-paint wide", )`.

#### `r6 overrides stay lighting-only (no camtune-inner retarget in the block)` (33–38)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `m` 34–34.

- Assertion 35–35: `assert.ok(m, "r6 block present before the #pc-toggle hud carve")`.
- Assertion 36–36: `assert.doesNotMatch(m[0], /#camtune-inner/, "must not retarget camera in the r6 carve")`.
- Assertion 37–37: `assert.doesNotMatch(m[0], /#ct-/, "must not retarget #ct-* camera selectors")`.

### `tests/unit/ui-fit-photostudio-tap-r6.test.mjs`

Full read: 1–36; SHA-256: `5661e1b50bc817d877218efcaf86afa172da4602686cfda48316a91b1eadd2e5`.

Direct local dependencies: `tests/helpers/css-rules.mjs`.

File-wide production/source inputs: `css/photo-studio.css`.

#### `Photo Studio setting-row selects floor at max(--tap, --tap-paint)` (15–22)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 16–20: `assert.match( css, /#ps-panel :is\(#ps-subject, #ps-aspect, #ps-grid-select, #ps-postcard, #ps-tod, #ps-weather, #ps-look-room, #ps-look-crew, #ps-look-mood\)\s*\{[^}]*min-height:\s*max\(var\(--tap\), var\(--tap-paint\)\)/s, "#ps-subject / #ps-aspect / #ps-grid-select / #ps-postcard / #ps-tod / #ps-weather / #ps-look-* must paint at max(--tap, --tap-paint) (#3337), not --chip-h", )`.
- Assertion 21–21: `assert.equal(decl(rules, SELECTS, "min-height"), "max(var(--tap), var(--tap-paint))")`.

#### `r6 select floor is min-height only (no height lock that would shrink landscape)` (24–29)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 25–26: `assert.equal(decl(rules, SELECTS, "height"), null, "do not set height — landscape already met --tap; a height lock can shrink it")`.
- Assertion 27–28: `assert.equal(decl(rules, SELECTS, "max-height"), null, "do not cap height on the r6 select carve")`.

#### `r6 carve stays Photo Studio #ps-* (no foreign selectors)` (31–36)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `m` 32–32.

- Assertion 33–33: `assert.ok(m, "r6 block present before #ps-panel .tune-row")`.
- Assertion 34–35: `assert.doesNotMatch(m[0], /#lighting\|#camtune\|#ct-\|#lt-\|title\|#hud/, "must not retarget tuner / title / HUD selectors")`.

### `tests/unit/ui-fit-settings-a11y-r6.test.mjs`

Full read: 1–66; SHA-256: `a685328bf843af3614f656b8811698ea22252e4d8478703a2ab54efa1759f1aa`.

Direct local dependencies: `tests/helpers/css-rules.mjs`.

File-wide production/source inputs: `css/settings.css`, `tools/ui/menu-screens.mjs`, `css/settings-controls.css`.

#### `ACCESSIBILITY panel pads so the last help can scroll above BACK` (20–28)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 21–22: `assert.equal(decl(rules, PANEL, "padding-bottom"), PAD, "#pm-panel-a11y must pad by --tap + --pad so #pm-cbcues-help clears .sheet-foot")`.
- Assertion 23–23: `assert.equal(decl(rules, PANEL, "scroll-padding-bottom"), PAD)`.
- Assertion 24–25: `assert.equal(decl(rules, PANEL, "overflow"), null, "do not give the region its own scroller — #pm-settings-body already scrolls")`.
- Assertion 26–27: `assert.equal(decl(rules, PANEL, "min-height"), null, "do not lock panel height — portrait already clears BACK")`.

#### `open ACCESSIBILITY page keeps body scroll-pad and foot tap floor` (30–34)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 31–31: `assert.equal(decl(rules, BODY, "scroll-padding-bottom"), PAD)`.
- Assertion 32–33: `assert.equal(decl(rules, FOOT, "min-height"), "var(--tap)", "BACK foot stays at the --tap floor while the a11y page is open")`.

#### `layout-audit SCREENS opens #pm-panel-a11y` (36–48)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 37–37: `assert.match(screens, /id:\s*"settingsa11y"/, "settingsa11y catalog id")`.
- Assertion 38–42: `assert.match( screens, /id:\s*"settingsa11y"[\s\S]*?#pm-open-a11y[\s\S]*?pm-panel-a11y/, "settingsa11y must click the ACCESSIBILITY door and wait for #pm-panel-a11y", )`.
- Assertion 43–47: `assert.match( screens, /id:\s*"settingsa11y"[\s\S]*?root:\s*"#pmsettings"/, "measure the whole sheet (BACK lives in .sheet-foot, not the region)", )`.

#### `wide sheets let cycle rows shrink at UI 200%` (50–56)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/settings-controls.css`.

Case-local fixture/setup bindings (including action results): `controls` 51–51; `rules` 52–52; `SEL` 53–53.

- Assertion 54–54: `assert.equal(decl(rules, SEL, "max-width"), "100%")`.
- Assertion 55–55: `assert.equal(decl(rules, SEL, "min-width"), "3.25rem")`.

#### `r6 carve stays Settings ACCESSIBILITY (no foreign selectors)` (58–66)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `m` 59–59.

- Assertion 60–60: `assert.ok(m, "r6 a11y block present with panel / body / foot selectors")`.
- Assertion 61–62: `assert.doesNotMatch(m[0], /#hud\|#lighting\|#camtune\|#ps-\|title\|#cs-\|touch-controls\|appearance-studio/, "must not retarget HUD / tuner / Photo Studio / garage / title selectors")`.
- Assertion 63–63: `assert.match(m[0], /#pm-panel-a11y/)`.
- Assertion 64–64: `assert.match(m[0], /#pm-settings-body/)`.
- Assertion 65–65: `assert.match(m[0], /\.sheet-foot/)`.

### `tests/unit/ui-fit-settings-appearance-r6.test.mjs`

Full read: 1–133; SHA-256: `a32ee06950ad16da4c916325277ce5175d58945064317709317cb0f0e6c4a685`.

Direct local dependencies: `tests/helpers/css-rules.mjs`.

File-wide production/source inputs: `css/appearance-studio.css`, `tools/ui/menu-screens.mjs`, `css/settings.css`.

#### `APPEARANCE panel pads so the last studio tile can scroll above BACK` (29–35)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 30–31: `assert.equal(decl(rules, PANEL, "padding-bottom"), PAD, "#pm-panel-appearance must pad by --tap + --pad so presets clear .sheet-foot")`.
- Assertion 32–32: `assert.equal(decl(rules, PANEL, "scroll-padding-bottom"), PAD)`.
- Assertion 33–34: `assert.equal(decl(rules, PANEL, "overflow"), null, "do not give the region its own scroller — #pm-settings-body already scrolls")`.

#### `open APPEARANCE page keeps body scroll-pad and foot tap floor` (37–41)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 38–38: `assert.equal(decl(rules, BODY, "scroll-padding-bottom"), PAD)`.
- Assertion 39–40: `assert.equal(decl(rules, FOOT, "min-height"), "var(--tap)", "BACK foot stays at the --tap floor while the appearance page is open")`.

#### `tall studio puts presets first and uses a 2-col tile track` (43–53)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 44–44: `assert.equal(decl(rules, TALL, "grid-template-columns"), "minmax(0, 1fr)")`.
- Assertion 45–46: `assert.equal(decl(rules, TALL_CTRL, "order"), "-1", "controls (PREVIEW PRESET) sit above the preview so tiles are not under BACK")`.
- Assertion 47–47: `assert.equal(decl(rules, TALL_PREV, "order"), "0")`.
- Assertion 48–48: `assert.equal(decl(rules, TALL_PREV, "position"), "static")`.
- Assertion 49–50: `assert.equal(decl(rules, TALL_LIST, "grid-template-columns"), "repeat(2, minmax(0, 1fr))", "two equal columns — not auto-fit leftovers that crush at scale 200")`.
- Assertion 51–51: `assert.equal(decl(rules, TALL_TILE, "min-height"), "max(var(--tap-paint), calc(var(--tap) * 2.1))")`.
- Assertion 52–52: `assert.equal(decl(rules, TALL_TILE, "min-width"), "var(--tap-paint)")`.

#### `wide studio keeps two columns (scale 200 landscape still uses data-shape)` (55–57)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 56–56: `assert.equal(decl(rules, WIDE, "grid-template-columns"), "minmax(0, 1.15fr) minmax(0, 0.95fr)")`.

#### `wide compact studio keeps a 5-tile desktop row at --tap-paint` (59–64)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 60–61: `assert.equal(decl(rules, WIDE_COMPACT_LIST, "grid-template-columns"), "repeat(5, minmax(0, 1fr))", "short landscape: one row of five, not a 3-row stack under BACK")`.
- Assertion 62–62: `assert.equal(decl(rules, WIDE_COMPACT_TILE, "min-height"), "var(--tap-paint)")`.
- Assertion 63–63: `assert.equal(decl(rules, WIDE_COMPACT_TILE, "min-width"), "var(--tap-paint)")`.

#### `short wide compact studio widens preset tiles at high-scale phone landscape` (66–74)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 67–73: `assert.equal( decl(rules, WIDE_COMPACT_SHORT_LIST, "grid-template-columns", { context: /@media \(max-width: 960px\) and \(max-height: 500px\)/, }), "repeat(3, minmax(0, 1fr))", "short phone landscapes need readable preset names at 130–200% UI scale", )`.

#### `short wide compact studio keeps preset words intact` (76–81)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `context` 77–77.

- Assertion 78–78: `assert.equal(decl(rules, WIDE_COMPACT_SHORT_LIST + " strong", "overflow-wrap", { context }), "normal")`.
- Assertion 79–79: `assert.equal(decl(rules, WIDE_COMPACT_SHORT_LIST + " strong", "word-break", { context }), "normal")`.
- Assertion 80–80: `assert.equal(decl(rules, WIDE_COMPACT_SHORT_LIST + " strong", "hyphens", { context }), "none")`.

#### `studio buttons keep the --tap / --tap-paint floors` (83–91)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 84–84: `assert.equal(decl(rules, "#appearance-studio button", "min-height"), "var(--tap)")`.
- Assertion 85–87: `assert.equal(decl(rules, "#appearance-studio [data-as=\"preset-list\"] button", "min-height"), "max(var(--tap-paint), calc(var(--tap) * 2.35))", "preset tiles keep the taller art box and never drop below --tap-paint")`.
- Assertion 88–88: `assert.equal(decl(rules, "#appearance-studio input, #appearance-studio select", "min-height"), "var(--tap-paint)")`.
- Assertion 89–90: `assert.equal(decl(rules, "#appearance-studio [data-as=\"segment\"] > button", "min-width"), "var(--tap-paint)", "HOME / HUD / device chips never shrink below --tap-paint")`.

#### `layout-audit SCREENS opens #pm-panel-appearance` (93–105)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

- Assertion 94–94: `assert.match(screens, /id:\s*"settingsappearance"/, "settingsappearance catalog id")`.
- Assertion 95–99: `assert.match( screens, /id:\s*"settingsappearance"[\s\S]*?#pm-open-appearance[\s\S]*?pm-panel-appearance/, "settingsappearance must click the APPEARANCE door and wait for #pm-panel-appearance", )`.
- Assertion 100–104: `assert.match( screens, /id:\s*"settingsappearance"[\s\S]*?root:\s*"#pmsettings"/, "measure the whole sheet (BACK lives in .sheet-foot, not the region)", )`.

#### `menu accent chips keep preset names readable at UI 200%` (107–115)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/settings.css`.

Case-local fixture/setup bindings (including action results): `settings` 108–108; `rules` 109–109; `CHIP` 110–110.

- Assertion 111–111: `assert.equal(decl(rules, CHIP, "white-space"), "normal")`.
- Assertion 112–112: `assert.equal(decl(rules, CHIP, "text-overflow"), "clip")`.
- Assertion 113–113: `assert.equal(decl(rules, CHIP, "overflow"), "visible")`.
- Assertion 114–114: `assert.equal(decl(rules, CHIP, "height"), "auto")`.

#### `settings sheet head wraps at high UI scale` (117–122)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/settings.css`.

Case-local fixture/setup bindings (including action results): `settings` 118–118; `rules` 119–119.

- Assertion 120–120: `assert.equal(decl(rules, "#pmsettings-inner > .sheet-head h2", "min-width"), "0")`.
- Assertion 121–121: `assert.equal(decl(rules, "#pmsettings-inner > .sheet-head h2", "max-width"), "100%")`.

#### `r6 carve stays Settings APPEARANCE (no foreign selectors)` (124–133)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `m` 125–125.

- Assertion 126–126: `assert.ok(m, "r6 appearance block present with studio / pad / shape selectors")`.
- Assertion 127–128: `assert.doesNotMatch(m[0], /#hud\|#lighting\|#camtune\|#ps-\|title\|#cs-\|touch-controls\|#pm-panel-a11y/, "must not retarget HUD / tuner / Photo Studio / garage / title / a11y selectors")`.
- Assertion 129–129: `assert.match(m[0], /#pm-panel-appearance/)`.
- Assertion 130–130: `assert.match(m[0], /#appearance-studio/)`.
- Assertion 131–131: `assert.match(m[0], /data-shape="tall"/)`.
- Assertion 132–132: `assert.match(m[0], /preset-list/)`.

### `tests/unit/ui-fit-tap-scroll-round3.test.mjs`

Full read: 1–179; SHA-256: `695c1421d81c2457e15b7f9089b77fd133e3d356f3992995c314b6950000e14f`.

Direct local dependencies: `tests/helpers/abs-src.mjs`.

File-wide production/source inputs: `js/ui/scroll-fade.js`, `css/settings-controls.css`, `css/photo-studio.css`, `css/overlays.css`, `css/menus.css`.

#### `ScrollFade SEL includes career body and track-designer rail` (14–18)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/ui/scroll-fade.js`.

Case-local fixture/setup bindings (including action results): `fade` 15–15.

- Assertion 16–16: `assert.match(fade, /"#cr-body"/, "career hub scroll body")`.
- Assertion 17–17: `assert.match(fade, /"\.td-rail"/, "track designer tool rail")`.

#### `ScrollFade repaints when a <details> fold toggles (and only for <details>)` (23–49)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/ui/scroll-fade.js`.

Case-local fixture/setup bindings (including action results): `docL` 24–24; `timers` 25–25; `context` 26–36; `drain` 40–40; `toggle` 42–42.

- Assertion 43–43: `assert.ok(toggle, "a document-level toggle listener exists")`.
- Assertion 44–44: `assert.equal(toggle.opts === true \|\| (toggle.opts && toggle.opts.capture === true), true, "capture: toggle does not bubble")`.
- Assertion 46–46: `assert.equal(timers.length, 0, "a popover/dialog toggle is not a fold")`.
- Assertion 48–48: `assert.equal(timers.length, 1, "a fold schedules one repaint")`.

#### `ScrollFade prunes detached panes in the coalesced paint pass and re-observes reattached ones` (54–106)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/ui/scroll-fade.js`.

Tool entry points: `constructor → function Object() { [native code] }`.

Case-local fixture/setup bindings (including action results): `timers` 55–55; `observed` 56–56; `roCallback` 57–57; `moCallback` 57–57; `moTargets` 59–59; `pane` 65–68; `live` 69–69; `context` 70–82; `drain` 86–86; `keep` 88–88; `row1` 88–88; `row2` 95–95.

- Assertion 91–91: `assert.ok(observed.has(row1) && observed.has(keep))`.
- Assertion 98–98: `assert.equal(observed.has(row1), false, "the detached row is unobserved without a resize or refresh")`.
- Assertion 99–99: `assert.equal(moTargets.has(row1), false, "the content observer no longer holds the detached row")`.
- Assertion 100–100: `assert.ok(observed.has(row2) && moTargets.has(row2) && moTargets.has(keep), "survivors and the new row stay observed")`.
- Assertion 105–105: `assert.ok(observed.has(row1) && moTargets.has(row1), "a reattached pane is observed again")`.

#### `settings HUD checklist floors labels and checkboxes in settings-controls.css` (108–130)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/settings-controls.css`.

Case-local fixture/setup bindings (including action results): `css` 109–109.

- Assertion 110–114: `assert.match( css, /#pm-hud-details #pm-hud-elements-list label\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s, "checklist rows paint at --tap-paint", )`.
- Assertion 115–119: `assert.match( css, /#pm-hud-details #pm-hud-elements-list input\[type="checkbox"\]\s*\{[^}]*min-width:\s*20px/s, "checkbox width floor ≥20px", )`.
- Assertion 120–124: `assert.match( css, /#pm-hud-details #pm-hud-elements-list input\[type="checkbox"\]\s*\{[^}]*min-height:\s*20px/s, "checkbox height floor ≥20px", )`.
- Assertion 125–129: `assert.match( css, /#pm-hud-details #pm-hidehud:has\(select:disabled\)/s, "race-only HUD row has a clearer disabled plate", )`.

#### `photo studio compact / coarse controls use --tap-paint` (132–144)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/photo-studio.css`.

Case-local fixture/setup bindings (including action results): `css` 133–133.

- Assertion 134–138: `assert.match( css, /@media \(pointer: coarse\)[\s\S]*#ps-panel button:not\(\.bigbtn\):not\(\[data-step\]\)[\s\S]*min-height:\s*var\(--tap-paint\)/, "coarse pointer buttons floor at --tap-paint", )`.
- Assertion 139–143: `assert.match( css, /body\[data-density="compact"\] #ps-panel button:not\(\.bigbtn\):not\(\[data-step\]\),[\s\S]*min-height:\s*var\(--tap-paint\)/, "compact density buttons floor at --tap-paint", )`.

#### `How to Play compact section chips floor at --tap-paint` (146–158)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/overlays.css`.

Case-local fixture/setup bindings (including action results): `css` 147–147.

- Assertion 148–152: `assert.match( css, /#howtoplay-inner\[data-density="compact"\] #htp-contents a\s*\{[^}]*min-height:\s*max\(var\(--tap-paint\),\s*1lh\)/s, "compact htp section links use --tap-paint not a hard 44px", )`.
- Assertion 153–157: `assert.doesNotMatch( css, /#howtoplay-inner\[data-density="compact"\] #htp-contents a\s*\{[^}]*44px/s, "no hard-coded 44px floor on compact htp chips", )`.

#### `compact short-viewport sheets re-derive --tap-paint against the paint zoom` (160–179)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/menus.css`.

Case-local fixture/setup bindings (including action results): `css` 163–163.

- Assertion 164–168: `assert.match( css, /:where\(body\[data-density="compact"\]\) \.sheet\s*\{[^}]*--_sheet-z:\s*min\(var\(--sheet-scale,\s*var\(--ui-scale\)\),\s*var\(--ui-compact-scale\)\)/s, "compact .sheet names the capped paint scale (--_sheet-z)", )`.
- Assertion 169–173: `assert.match( css, /:where\(body\[data-density="compact"\]\) \.sheet\s*\{[^}]*zoom:\s*var\(--_sheet-z\)/s, "compact .sheet zooms by --_sheet-z", )`.
- Assertion 174–178: `assert.match( css, /:where\(body\[data-density="compact"\]\) \.sheet\s*\{[^}]*--tap-paint:\s*max\(24px,\s*calc\(var\(--tap-paint-at\)\s*\/\s*var\(--_sheet-z\)\)\)/s, "compact .sheet divides --tap-paint by the paint scale, not bare --ui-scale", )`.

### `tests/unit/ui-fixer-uncommitted.test.mjs`

Full read: 1–43; SHA-256: `d71cd9db42fc2bfc5aa198d6b7951767294b07355b2ca0c5f2da29b554262def`.

Direct local dependencies: `tests/helpers/git-fixture-env.mjs`.

File-level helpers/fixtures: `rig` 13–24.

File-wide production/source inputs: `.claude/hooks/ui-fixer-uncommitted.sh`, `.claude/memory`.

#### `dirty cursor/* tree with an hour-old commit gets one reminder, then silence for 30 min` (26–34)

Fixtures: `rig`. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `r` 27–27; `a` 30–30.

- Assertion 31–31: `assert.equal(a.status, 0)`.
- Assertion 31–31: `assert.match(a.stdout, /commit WIP to the topic branch/)`.
- Assertion 32–32: `assert.equal(r.run().stdout, "", "debounced")`.

#### `silent: clean tree, fresh commit, other branch, or only synced memory dirty` (36–43)

Fixtures: `rig`. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `r` 37–37.

- Assertion 38–38: `assert.equal(r.run().stdout, "", "clean")`.
- Assertion 38–38: `assert.equal(r.run().stdout, "", "memory only")`.
- Assertion 40–40: `assert.equal(r.run().stdout, "", "fresh commit")`.
- Assertion 42–42: `assert.equal(r.run().stdout, "", "not a cursor branch")`.

### `tests/unit/ui-improve-pass.test.mjs`

Full read: 1–2572; SHA-256: `e21baaa3dcd8e6ac3e57cf59f4d289368d2072747b07c9687ffcebebb253ed4a`.

Direct local dependencies: `tests/helpers/css-source.mjs`, `tests/helpers/css-rules.mjs`, `tests/helpers/mini-dom.mjs`, `tests/helpers/seed-clipboard.mjs`, `tests/helpers/game-source.mjs`, `tests/helpers/abs-src.mjs`.

File-level helpers/fixtures: `fnBody` 48–59; `uiSandbox` 63–76; `bootMenus` 131–190; `fakeDaily` 204–214; `bootSheetShape` 451–470; `bootMenuNav` 696–711; `bootCamModes` 957–967; `bootInput` 1205–1246; `bootSettingsNav` 1614–1643; `bootCopyValues` 2321–2350.

File-wide production/source inputs: `tools/manifest.cjs`, `js/ui/css-zoom.js`, `css/data.css`, `js/data/hub.js`, `js/garage/setup-sheet.js`, `css/carsetup.css`, `css/menus.css`, `js/ui/select-screen.js`, `css/select.css`, `css/experience.css`, `js/ui/sheet-shape.js`, `js/ui/scroll-fade.js`, `js/ui/menu-nav.js`, `tools/ui/layout-audit.mjs`, `css/components.css`, `js/lighting/tuner-panel.js`, `js/camera/tuner-panel.js`, `css/overlays.css`, `css/track-detail.css`, `js/ui/track-maps.js`, `css/tuner.css`, `css/career.css`, `js/camera/mode-switch.js`, `js/race/race-settings.js`, `js/core/log.js`, `js/core/mat4.js`, `js/input/bindings.js`, `js/input/pad-menu.js`, `js/input/haptics.js`, `js/input/hold-buttons.js`, `js/input/input.js`, `js/ui/layers.js`, `js/ui/aria-state.js`, `js/audio/spotify.js`, `js/ui/settings-tabs.js`, `css/race-setup.css`, `js/perf/renderer-picker.js`, `css/settings-controls.css`, `css/career-experience.css`, `css/settings.css`, `js/input/steer-tuning.js`, `js/audio/panel.js`, `js/camera/cockpit-opts.js`, `js/perf/metrics-overlay.js`, `css/tokens.css`, `css/`, `css/dialogs.css`, `js/garage/setup-experiments.js`, `css/hud.css`, `js/ui/results-sheet.js`, `js/ui/experience.js`, `js/ui/title-flow.js`, `.claude/skills/lighting-tuner/scripts/merge-proposals.mjs`, `.claude/skills/lighting-tuner/scripts/bake.mjs`.

#### `UI audit scale axis includes the product's 40% minimum` (78–82)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `parseScales → tools/ui/ui-scale-axis.mjs`.

Case-local fixture/setup bindings (including action results): `{ parseScales }` 79–79.

- Assertion 80–80: `assert.deepEqual(parseScales(["--scale=40,200"]), [40, 200])`.
- Assertion 81–81: `assert.throws(() => parseScales(["--scale=39.75"]), /between 40 and 200/)`.

#### `CssZoom helper ships before sheetshape and menunav` (84–92)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `tools/manifest.cjs`.

Case-local fixture/setup bindings (including action results): `man` 85–85; `iZoom` 86–86; `iSheet` 87–87; `iNav` 88–88.

- Assertion 89–89: `assert.ok(iZoom > 0, "css-zoom.js must be in the manifest")`.
- Assertion 90–90: `assert.ok(iZoom < iSheet, "css-zoom before sheetshape")`.
- Assertion 91–91: `assert.ok(iSheet < iNav, "sheetshape before menunav")`.

#### `CssZoom exports its API surface` (94–102)

Fixtures: `uiSandbox`. Exercised targets: `js/ui/css-zoom.js`.

Case-local fixture/setup bindings (including action results): `sb` 95–95; `Z` 97–97; `name` 99–99.

Fixture iteration domains: `for (const name of ["of", "viewportRect", "localRect", "localBox", "toLocalDelta", "rectsAreVisual"])`.

- Assertion 98–98: `assert.ok(Z, "window.CssZoom is assigned")`.
- Assertion 100–100: `assert.equal(typeof Z[name], "function", ˋCssZoom.${name}ˋ)`.

#### `data hub card carries UI SIZE zoom (fit-capped like a sheet)` (104–110)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/data.css`, `js/data/hub.js`.

- Assertion 108–108: `assert.equal(decl(css("css/data.css"), ".dh-card", "zoom"), "var(--sheet-scale, var(--ui-scale))")`.
- Assertion 109–109: `assert.match(code("js/data/hub.js"), /\bdh-card\b[^"'ˋ\n]*\bfit-managed\b/, "the card must join the classifyFit scan (class list carries fit-managed)")`.

#### `garage livery grid class is wired` (112–120)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/garage/setup-sheet.js`, `css/carsetup.css`.

Case-local fixture/setup bindings (including action results): `js` 113–113; `clear` 116–116; `team` 117–117.

- Assertion 114–114: `assert.match(js, /\bcs-liv-grid\b/)`.
- Assertion 115–115: `assert.ok(ruleFor(css("css/carsetup.css"), /^#cs-options\.cs-liv-grid\b/), "carsetup.css styles #cs-options.cs-liv-grid")`.
- Assertion 118–119: `assert.ok(clear > 0 && clear < team, "cs-liv-grid must be cleared before the TEAM branch, or the team card inherits the swatch grid")`.

#### `select track filter persists via store` (122–128)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/menus.css`.

- Assertion 125–125: `assert.ok(ruleFor(css("css/menus.css"), /^#sel-tracks \.track-row\[data-fav\]::after$/), "the ♥ badge is a pseudo-element on [data-fav]")`.
- Assertion 126–127: `assert.equal(decl(css("css/menus.css"), "#sel-tracks .track-row[data-fav]", "position"), "relative", "only a favourited tile is positioned — the shipped strip paints unchanged")`.

#### `select titles and CTAs name Practice, Time Trial, and Race` (192–202)

Fixtures: `bootMenus`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `race` 193–193; `tt` 196–196; `practice` 199–199.

- Assertion 194–194: `assert.equal(race.G.els.selTitle.textContent, "GRAND PRIX")`.
- Assertion 195–195: `assert.equal(race.G.els.selGo.textContent, "RACE SETUP")`.
- Assertion 197–197: `assert.equal(tt.G.els.selTitle.textContent, "TIME TRIAL")`.
- Assertion 198–198: `assert.equal(tt.G.els.selGo.textContent, "SESSION SETUP")`.
- Assertion 200–200: `assert.equal(practice.G.els.selTitle.textContent, "PRACTICE")`.
- Assertion 201–201: `assert.equal(practice.G.els.selGo.textContent, "PRACTICE SETUP")`.

#### `Practice pick hides Time Trial Daily chrome` (216–224)

Fixtures: `bootMenus`, `fakeDaily`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `tt` 217–217; `practice` 220–220.

- Assertion 218–218: `assert.ok(tt.dom.has("sel-daily"), "Time Trial keeps Today's Challenge")`.
- Assertion 219–219: `assert.ok(tt.chips().includes("daily-open"))`.
- Assertion 221–221: `assert.ok(!practice.dom.has("sel-daily"), "Practice does not wear the Daily chip")`.
- Assertion 222–222: `assert.ok(!practice.chips().includes("daily-open"))`.
- Assertion 223–223: `assert.equal(practice.G.els.selTitle.textContent, "PRACTICE")`.

#### `leaving the Practice pick rebuilds Time Trial chrome` (226–244)

Fixtures: `bootMenus`, `fakeDaily`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `pick` 227–227; `h` 228–235.

- Assertion 236–236: `assert.equal(h.G.els.selTitle.textContent, "PRACTICE")`.
- Assertion 237–237: `assert.ok(!h.dom.has("sel-daily"))`.
- Assertion 240–240: `assert.equal(h.G.els.selTitle.textContent, "TIME TRIAL")`.
- Assertion 241–241: `assert.equal(h.G.els.selGo.textContent, "SESSION SETUP")`.
- Assertion 242–242: `assert.ok(h.dom.has("sel-daily"))`.
- Assertion 243–243: `assert.match(code("js/ui/select-screen.js"), /leavePracticePick\(\)/)`.

#### `CLASSICS filter snaps the preview off a season circuit that is not in the list` (246–253)

Fixtures: `bootMenus`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `h` 247–247.

- Assertion 248–248: `assert.equal(h.G.trackIdx, 1, "starts on Spa")`.
- Assertion 250–250: `assert.equal(h.G.trackIdx, 2, "Imola is the only classic in the stub list")`.
- Assertion 251–251: `assert.deepEqual(h.tiles().map((r) => r.dataset.trackIdx), ["2"])`.
- Assertion 252–252: `assert.equal(JSON.parse(h.data.get("trackId")), "imola")`.

#### `select preview uses a dark token scrollbar and a readable GP subtitle` (255–267)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/select.css`.

Case-local fixture/setup bindings (including action results): `rules` 256–256.

- Assertion 257–257: `assert.equal(decl(rules, "#sel-preview-gp", "color"), "var(--text)")`.
- Assertion 258–258: `assert.equal(decl(rules, "#select", "color-scheme"), "dark")`.
- Assertion 259–262: `assert.equal( decl(rules, '#sel-inner:not([data-shape="tall"]) #sel-preview-info', "scrollbar-color"), "var(--plate-line) transparent", )`.
- Assertion 263–266: `assert.equal( decl(rules, '#sel-inner:not([data-shape="tall"]) #sel-preview-info', "color-scheme"), "dark", )`.

#### `Practice Goal native select follows Apex dark chrome` (269–275)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/experience.css`.

Case-local fixture/setup bindings (including action results): `rules` 270–270.

- Assertion 271–271: `assert.equal(decl(rules, "#practice-brief", "color-scheme"), "dark")`.
- Assertion 272–272: `assert.equal(decl(rules, "#practice-brief select", "background"), "var(--plate)")`.
- Assertion 273–273: `assert.equal(decl(rules, "#practice-brief select", "color"), "var(--text)")`.
- Assertion 274–274: `assert.equal(decl(rules, "#practice-brief option", "background"), "var(--plate)")`.

#### `FAVOURITE CIRCUITS: hidden until used — no chip, no badge, nothing written` (277–283)

Fixtures: `bootMenus`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `h` 278–278.

- Assertion 279–279: `assert.deepEqual(h.chips(), ["all", "season", "classic"], "the shipped filter bar, no FAVOURITES chip")`.
- Assertion 280–280: `assert.equal(h.tiles().length, 3)`.
- Assertion 281–281: `assert.ok(h.tiles().every((r) => !("fav" in r.dataset)), "no tile carries data-fav")`.
- Assertion 282–282: `assert.equal(h.data.has("favTracks"), false)`.

#### `FAVOURITE CIRCUITS: the CIRCUIT DETAIL toggle → store → data-fav → the chip, and back` (285–316)

Fixtures: `bootMenus`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `h` 286–286; `noticed` 287–287; `btn` 290–290; `beforeClear` 307–307.

- Assertion 291–291: `assert.equal(btn.tagName, "BUTTON")`.
- Assertion 292–292: `assert.equal(btn.textContent, "☆ FAVOURITE")`.
- Assertion 293–293: `assert.equal(btn.getAttribute("aria-pressed"), "false")`.
- Assertion 295–295: `assert.deepEqual(h.favs(), ["spa"])`.
- Assertion 296–296: `assert.equal(btn.textContent, "★ FAVOURITE")`.
- Assertion 297–297: `assert.equal(btn.getAttribute("aria-pressed"), "true")`.
- Assertion 298–298: `assert.equal(h.tile("spa").dataset.fav, "1", "the strip was rebuilt with the badge")`.
- Assertion 299–299: `assert.ok(!("fav" in h.tile("monza").dataset))`.
- Assertion 300–300: `assert.deepEqual(h.chips(), ["all", "season", "classic", "fav"], "the chip appears with the first favourite")`.
- Assertion 301–301: `assert.ok(noticed.includes("favTracks"), "starring notifies subscribers")`.
- Assertion 304–304: `assert.equal(JSON.parse(h.data.get("trackFilter")), "fav")`.
- Assertion 305–305: `assert.deepEqual(h.tiles().map((r) => r.dataset.trackIdx), ["1"])`.
- Assertion 309–309: `assert.equal(h.data.has("favTracks"), false, "an empty list is the shipped state — nothing stored")`.
- Assertion 310–311: `assert.equal(noticed.filter((k) => k === "favTracks").length, beforeClear + 1, "clearing the last favourite notifies (write/set, not silent rawDel)")`.
- Assertion 312–312: `assert.equal(btn.textContent, "☆ FAVOURITE")`.
- Assertion 313–313: `assert.equal(JSON.parse(h.data.get("trackFilter")), "all")`.
- Assertion 314–314: `assert.deepEqual(h.chips(), ["all", "season", "classic"])`.
- Assertion 315–315: `assert.equal(h.tiles().length, 3)`.

#### `FAVOURITE CIRCUITS: F on a focused tile toggles it and keeps focus; modifiers and the season calendar do not` (318–338)

Fixtures: `bootMenus`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `h` 319–319; `press` 320–320; `season` 332–332; `cal` 333–333; `row` 335–335.

- Assertion 322–322: `assert.equal(h.data.has("favTracks"), false, "Ctrl+F is the browser's")`.
- Assertion 324–324: `assert.deepEqual(h.favs(), ["monza"])`.
- Assertion 325–325: `assert.equal(h.tile("monza").dataset.fav, "1")`.
- Assertion 326–326: `assert.equal(h.dom.document.activeElement, h.tile("monza"), "focus returns to the rebuilt tile")`.
- Assertion 327–327: `assert.match(h.announced.at(-1), /MONZA/)`.
- Assertion 329–329: `assert.deepEqual(h.favs(), ["monza", "imola"])`.
- Assertion 331–331: `assert.deepEqual(h.favs(), ["imola"])`.
- Assertion 337–337: `assert.equal(season.data.has("favTracks"), false, "the calendar strip is read-only")`.

#### `FAVOURITE CIRCUITS: a HELD F stars once — its auto-repeat neither flips nor re-announces` (340–350)

Fixtures: `bootMenus`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `h` 341–341; `press` 342–342; `said` 345–345.

- Assertion 344–344: `assert.deepEqual(h.favs(), ["monza"])`.
- Assertion 348–348: `assert.deepEqual(h.favs(), ["monza"], "the repeats did not unstar / restar it")`.
- Assertion 349–349: `assert.equal(h.announced.length, said, "…nor announce again")`.

#### `Escape in the circuit search clears the query first; an empty field lets Escape close the picker` (352–376)

Fixtures: `bootMenus`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `h` 353–353; `esc` 354–354; `search` 356–356; `ev` 359–360; `e1` 361–361; `e2` 366–366; `e3` 370–370; `e4` 373–373.

- Assertion 355–355: `assert.ok(esc, "a window-CAPTURE keydown listener — TopModal's document-capture Escape runs before any target listener")`.
- Assertion 358–358: `assert.deepEqual(h.tiles().filter((r) => !r.hidden).map((r) => LIST_ID(h, r)), ["spa"])`.
- Assertion 363–363: `assert.equal(search.value, "", "the field is cleared")`.
- Assertion 364–364: `assert.equal(h.tiles().filter((r) => r.hidden).length, 0, "every circuit is back")`.
- Assertion 365–365: `assert.equal(e1.defaultPrevented && e1.stopped, true, "…and the key never reaches TopModal's BACK door")`.
- Assertion 368–368: `assert.equal(e2.defaultPrevented \|\| e2.stopped, false, "empty field: Escape goes on to close the picker")`.
- Assertion 372–372: `assert.equal(search.value, "mon", "an IME composition keeps its Escape")`.
- Assertion 375–375: `assert.equal(e4.defaultPrevented, false, "Escape elsewhere is not this field's")`.

#### `TEAM PICKER: opens on the current team, and a pick returns focus to the rebuilt garage card` (379–404)

Fixtures: `bootMenus`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `card` 380–380; `h` 381–390; `opener` 392–392; `tiles` 396–396.

- Assertion 397–397: `assert.equal(tiles.length, 2)`.
- Assertion 398–398: `assert.equal(h.dom.document.activeElement, tiles[1], "focus lands on the ACTIVE team, not CLOSE")`.
- Assertion 400–400: `assert.equal(h.dom.byId("teampicker").hidden, true)`.
- Assertion 402–402: `assert.notEqual(card, opener, "the opener was rebuilt")`.
- Assertion 403–403: `assert.equal(h.dom.document.activeElement, card, "focus is on the NEW #cs-team-card, not <body>")`.

#### `circuit filter chip click/Enter keeps focus on the active chip` (406–424)

Fixtures: `bootMenus`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `h` 410–410; `chip` 411–411; `season` 412–412; `rebuilt` 418–418.

- Assertion 413–413: `assert.ok(season, "season filter chip exists")`.
- Assertion 415–415: `assert.equal(h.dom.document.activeElement, season)`.
- Assertion 417–417: `assert.equal(JSON.parse(h.data.get("trackFilter")), "season")`.
- Assertion 419–419: `assert.ok(rebuilt, "season chip still exists")`.
- Assertion 420–420: `assert.equal(rebuilt, season, "the bar is updated in place: the pressed chip node is kept")`.
- Assertion 421–421: `assert.equal(h.dom.document.activeElement, rebuilt, "focus stays on the season chip")`.
- Assertion 422–422: `assert.equal(rebuilt.getAttribute("aria-pressed"), "true")`.
- Assertion 423–423: `assert.equal(rebuilt.tabIndex, 0)`.

#### `CLASSICS filter snaps the hero off a season circuit onto the first classic` (426–436)

Fixtures: `bootMenus`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `h` 427–427.

- Assertion 428–428: `assert.equal(h.G.trackIdx, 1, "fixture opens on Spa")`.
- Assertion 431–431: `assert.equal(JSON.parse(h.data.get("trackFilter")), "classic")`.
- Assertion 432–432: `assert.equal(h.G.trackIdx, 2, "Bahrain/Spa is not in CLASSICS — Imola is the first classic")`.
- Assertion 433–433: `assert.deepEqual(h.tiles().map((r) => r.dataset.trackIdx), ["2"])`.
- Assertion 434–434: `assert.ok(h.tiles()[0].className.includes("active"), "the snapped classic is highlighted")`.
- Assertion 435–435: `assert.equal(JSON.parse(h.data.get("trackId")), "imola")`.

#### `FAVOURITE CIRCUITS: a stored FAVOURITES filter with no (known) favourites opens on ALL` (438–448)

Fixtures: `bootMenus`. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `favTracks` 439–439; `disk` 440–440; `h` 442–442; `h` 446–446.

Fixture iteration domains: `for (const favTracks of [undefined, [], ["no-such-circuit"], "spa"])`.

- Assertion 443–443: `assert.deepEqual(h.chips(), ["all", "season", "classic"], JSON.stringify(favTracks))`.
- Assertion 444–444: `assert.equal(h.tiles().length, 3, JSON.stringify(favTracks) + ": every circuit shown")`.
- Assertion 447–447: `assert.deepEqual(h.tiles().map((r) => r.dataset.trackIdx), ["2"], "a real favourite keeps the filter")`.

#### `circuit select is a flag strip over a hero, not two panes` (472–510)

Fixtures: `bootSheetShape`. Exercised targets: `css/menus.css`, `js/ui/sheet-shape.js`, `js/ui/scroll-fade.js`, `js/ui/menu-nav.js`, `tools/ui/layout-audit.mjs`.

Case-local fixture/setup bindings (including action results): `menus` 473–473; `html` 487–487; `h` 493–493; `wide` 494–494; `tall` 498–498; `off` 502–502.

- Assertion 474–475: `assert.ok(!menus.some((r) => [...r.decls.values()].some((v) => /40\s*\*\s*var\(--svhz\)/.test(v))), "the 300px / 40svhz list cap was the nested-scroller hotfix")`.
- Assertion 476–477: `assert.equal(decl(menus, "#sel-body", "overflow"), "hidden", "the body is a flex column, not a vertical scroller")`.
- Assertion 478–478: `assert.equal(decl(menus, "#sel-body", "flex-direction"), "column")`.
- Assertion 479–480: `assert.equal(decl(menus, "#sel-tracks", "overflow-x"), "auto", "the flag strip is the one sideways scroller")`.
- Assertion 481–481: `assert.equal(decl(menus, "#sel-tracks", "overflow-y"), "hidden")`.
- Assertion 482–482: `assert.equal(decl(menus, "#sel-tracks", "touch-action"), "pan-x")`.
- Assertion 483–484: `assert.equal(decl(menus, "#sel-track-section", "flex"), "1 1 0", "the hero section is the flex remainder under the shelf")`.
- Assertion 485–486: `assert.ok(!declares(menus, "#sel-inner", "--pair-at"), "#sel-inner is no longer a .pane-pair sheet — no pair threshold to declare")`.
- Assertion 488–489: `assert.match(html, /<div id="sel-tracks" role="group"[^>]*data-orientation="horizontal"/, "the strip declares its axis for the keyboard walker and the wheel redirect")`.
- Assertion 490–490: `assert.doesNotMatch(html, /<div id="sel-inner" class="[^"]*pane-pair/)`.
- Assertion 496–496: `assert.equal(wide.el.dataset.density, "compact")`.
- Assertion 497–497: `assert.equal(wide.el.dataset.pair, "on", "compact + wide shape + ˋwideˋ mode keeps the pair")`.
- Assertion 500–500: `assert.equal(tall.el.dataset.shape, "tall")`.
- Assertion 501–501: `assert.equal(tall.el.dataset.pair, "off", "compact + tall shape stacks even above --pair-at")`.
- Assertion 504–504: `assert.equal(off.el.dataset.pair, "off", "ˋoffˋ stacks a compact sheet regardless of width")`.
- Assertion 505–505: `assert.doesNotMatch(code("js/ui/scroll-fade.js"), /"\.pane",\s*"#sel-body"/)`.
- Assertion 506–506: `assert.doesNotMatch(code("js/ui/menu-nav.js"), /\.pane,#sel-body/)`.
- Assertion 507–507: `assert.doesNotMatch(read("tools/ui/layout-audit.mjs"), /\.pane,#sel-body/)`.
- Assertion 508–509: `assert.match(code("js/ui/scroll-fade.js"), /\boverflowY\b/, "fade thumbs require overflow-y auto/scroll, not hidden content height")`.

#### `density is judged by the sheet's ROOM, not its content height` (512–542)

Fixtures: `bootSheetShape`. Exercised targets: `js/ui/sheet-shape.js`.

Case-local fixture/setup bindings (including action results): `h` 517–517; `roomy` 518–518; `pinned` 527–527; `nohost` 530–530; `b` 537–537.

- Assertion 520–520: `assert.equal(roomy.el.dataset.density, "normal", "358 px of content in 776 px of room is NOT short")`.
- Assertion 522–522: `assert.equal(roomy.el.dataset.density, "compact", "the same sheet on a 390-tall landscape phone is")`.
- Assertion 524–524: `assert.equal(roomy.el.dataset.density, "compact", "790 is inside the 40 px release hysteresis (760 + 40)")`.
- Assertion 526–526: `assert.equal(roomy.el.dataset.density, "normal", "…and releases once the room clears it")`.
- Assertion 529–529: `assert.equal(pinned.el.dataset.density, "normal", "a sheet taller than its host is judged by its own height (max of the two)")`.
- Assertion 532–532: `assert.equal(nohost.el.dataset.density, "compact", "host 0 (hidden, or this harness) falls back to the sheet's own height")`.
- Assertion 533–533: `assert.match(code("js/ui/sheet-shape.js"), /function roomOwn\(el, hOwn\)/, "the room floor lives in [synthetic JavaScript fixture path]")`.
- Assertion 541–541: `assert.equal(b.body.dataset.density, "compact", "852x393 at 200% is 196 own px of body — compact, whatever documentElement's client box says")`.

#### `garage stacked categories are a horizontal strip` (544–558)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/carsetup.css`, `js/garage/setup-sheet.js`.

Case-local fixture/setup bindings (including action results): `carsetup` 545–545.

- Assertion 546–547: `assert.ok(!declares(carsetup, "#cs-tabs", "max-height", "48%"), "stacked tabs must not keep the wrapping 48% vertical catalogue")`.
- Assertion 548–549: `assert.ok(ruleFor(carsetup, /^#cs-tabs \.cs-tab-row\b/), "the two named category tiers own their horizontal strips")`.
- Assertion 550–550: `assert.equal(decl(carsetup, "#cs-tabs .cs-tab-row", "overflow-x"), "auto", "each stacked tier pans sideways")`.
- Assertion 551–551: `assert.equal(decl(carsetup, "#cs-tabs .cs-tab-row", "overflow-y"), "hidden", "…and never becomes a nested vertical pane")`.
- Assertion 552–553: `assert.equal(decl(carsetup, '#cs-inner[data-pair="on"] #cs-tabs', "overflow-y"), "auto", "pair-on rail may still scroll vertically")`.
- Assertion 554–555: `assert.equal(decl(carsetup, '#cs-inner[data-pair="on"] #cs-tabs .cs-tab-row', "display"), "contents", "pair-on flattens both tiers into one vertical rail")`.
- Assertion 556–556: `assert.match(code("js/garage/setup-sheet.js"), /scrollIntoView\(\s*\{[^}]*\bblock:\s*"nearest"[^}]*\}\s*\)/, "the active tab is scrolled into view (nearest)")`.
- Assertion 557–557: `assert.match(code("js/garage/setup-sheet.js"), /scrollIntoView\(\s*\{[^}]*\binline:\s*"center"[^}]*\}\s*\)/, "…and centred sideways along the strip")`.

#### `circuit catalogue has a searchable filter toolbar` (560–571)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/ui/select-screen.js`, `css/menus.css`.

Case-local fixture/setup bindings (including action results): `js` 561–561.

- Assertion 562–562: `assert.match(js, /\.type\s*=\s*"search"/)`.
- Assertion 563–563: `assert.match(js, /setAttribute\(\s*"aria-label"\s*,\s*"Search circuits"\s*\)/)`.
- Assertion 564–564: `assert.match(js, /\.dataset\.search\s*=/)`.
- Assertion 565–565: `assert.match(js, /function\s+applyTrackSearch\s*\(/)`.
- Assertion 566–567: `assert.match(js, /setAttribute\(\s*"role"\s*,\s*"group"\s*\)/, "filters plus search are controls for one list, not a tablist")`.
- Assertion 568–569: `assert.match(js, /\.tabIndex\s*=\s*visibleTrackFilter\(\)\s*===\s*id\s*\?\s*0\s*:\s*-1/, "filter chips keep a roving tab stop; search is its own")`.
- Assertion 570–570: `assert.equal(decl(css("css/menus.css"), "#sel-track-search", "min-height"), "var(--chip-h)")`.

#### `circuit search: a divider survives only while ITS run of tiles does` (573–609)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `src` 580–580; `fn` 581–581; `mk` 583–587; `classes` 584–584; `list` 588–593; `heads` 595–595; `rows` 596–596; `els` 597–597; `empty` 598–598; `run` 599–600.

- Assertion 582–582: `assert.ok(fn, "applyTrackSearch is in select-screen.js")`.
- Assertion 602–603: `assert.deepEqual(heads.map((h) => h.hidden), [false, true, true, true], "only the divider over the matching run shows; the three empty runs lose theirs")`.
- Assertion 605–605: `assert.deepEqual(heads.map((h) => h.hidden), [false, false, false, false], "no query: every divider is back")`.
- Assertion 607–607: `assert.deepEqual(heads.map((h) => h.hidden), [true, true, true, true], "no match: no dividers at all")`.
- Assertion 608–608: `assert.equal(empty.hidden, false, "…and the NO CIRCUITS MATCH line shows")`.

#### `compact catalogue keeps a pannable toolbar and shrinks the strip to flags` (611–634)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/menus.css`, `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `menus` 612–612; `w` 618–618; `compact` 621–621; `menusJs` 629–629.

Fixture iteration domains: `for (const w of [360, 420, 440])`.

- Assertion 613–614: `assert.equal(decl(menus, "#sel-track-filter", "overflow-x"), "auto", "the filter/search toolbar pans at every width instead of wrapping into the hero")`.
- Assertion 615–615: `assert.equal(decl(menus, "#sel-track-filter", "flex-wrap"), "nowrap")`.
- Assertion 616–617: `assert.equal(decl(menus, "#sel-track-search", "min-width"), "12rem", "search keeps a readable floor so the row actually overflows at 200%")`.
- Assertion 619–619: `assert.ok(!menus.some((r) => r.selector.includes("#sel-") && r.context.some((c) => c === ˋ@container sheet (max-width: ${w}px)ˋ)), ˋno @container sheet (max-width: ${w}px) blockˋ)`.
- Assertion 622–623: `assert.equal(decl(menus, ˋ${compact} #sel-tracks .track-row-nameˋ, "display"), "none", "compact strip is flags only — the name moves to the hero caption")`.
- Assertion 624–625: `assert.equal(decl(menus, ˋ${compact} #sel-preview-elevˋ, "display"), "none", "compact hero drops the elevation strip, never the still")`.
- Assertion 626–626: `assert.ok(!declares(menus, ˋ${compact} #sel-heroˋ, "display", "none"))`.
- Assertion 627–627: `assert.ok(!declares(menus, ˋ${compact} #sel-preview-mapˋ, "display", "none"))`.
- Assertion 628–628: `assert.ok(!declares(menus, '#sel-inner[data-fit="on"] #sel-preview-map', "display", "none"))`.
- Assertion 630–630: `assert.match(menusJs, /assets\/stills\/" \+ t\.id \+ "\.webp"/, "the hero reads the committed still per circuit")`.
- Assertion 631–631: `assert.match(menusJs, /Flags\.svg\(t\.country\)/, "tiles and caption draw the flag from js/ui/flags.js")`.
- Assertion 632–633: `assert.match(menusJs, /corners: false, sectors: false, drs: false/, "the hero outline is the plain lap line — sectors and turns belong to CIRCUIT DETAIL")`.

#### `garage categories implement one roving tab system` (637–647)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/garage/setup-sheet.js`.

Case-local fixture/setup bindings (including action results): `js` 638–638; `key` 645–645.

Fixture iteration domains: `for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"])`.

- Assertion 639–639: `assert.match(js, /setAttribute\(\s*"role"\s*,\s*"tablist"\s*\)/)`.
- Assertion 640–640: `assert.match(js, /setAttribute\(\s*"role"\s*,\s*"tab"\s*\)/)`.
- Assertion 641–641: `assert.match(js, /setAttribute\(\s*"aria-controls"\s*,\s*"cs-options"\s*\)/)`.
- Assertion 642–642: `assert.match(js, /\.tabIndex\s*=\s*csActiveCat\s*===\s*id\s*\?\s*0\s*:\s*-1/)`.
- Assertion 643–643: `assert.match(js, /setAttribute\(\s*"role"\s*,\s*"tabpanel"\s*\)/)`.
- Assertion 644–644: `assert.match(js, /setAttribute\(\s*"aria-labelledby"\s*,\s*csTabId\(\s*csActiveCat\s*\)\s*\)/)`.
- Assertion 646–646: `assert.match(js, new RegExp(ˋ\\.key\\s*===\\s*"${key}"ˋ))`.

#### `high-scale settings and Last Race retain useful local width` (649–674)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/components.css`, `css/data.css`.

Case-local fixture/setup bindings (including action results): `components` 650–650; `data` 651–651; `desk` 666–666.

- Assertion 652–652: `assert.ok(ruleFor(components, /^\.balanced-row\s*>\s*:not\(\[hidden\]\)$/))`.
- Assertion 653–653: `assert.ok(!components.some((r) => r.context.includes("@container sheet (min-width: 380px) and (max-width: 519px)")))`.
- Assertion 654–654: `assert.equal(decl(data, ".dh-table", "max-width"), "100%")`.
- Assertion 655–655: `assert.equal(decl(data, ".dh-table", "table-layout"), "fixed")`.
- Assertion 656–657: `assert.ok(!declares(data, ".dh-td-driver", "display", "flex"), "a table cell must not opt out of the fixed table layout")`.
- Assertion 658–659: `assert.equal(decl(data, ".dh-td-driver", "overflow-wrap"), "normal", "driver names wrap at spaces, not mid-word")`.
- Assertion 660–660: `assert.equal(decl(data, ".dh-td-driver .dh-name", "overflow-wrap"), "normal")`.
- Assertion 661–662: `assert.equal(decl(data, ".dh-td-driver .dh-name", "display"), "block", "the surname sits under the chip so VERSTAPPEN keeps a full cell")`.
- Assertion 663–663: `assert.ok(!declares(data, ".dh-td-driver", "overflow-wrap", "anywhere"))`.
- Assertion 664–665: `assert.equal(decl(data, ".dh-cons-main .dh-name", "flex"), "0 1 auto", "live/constructor names do not grow and park the team on the far right")`.
- Assertion 667–667: `assert.ok(desk, "desktop hub card has a pinned height")`.
- Assertion 668–668: `assert.equal(desk.decls.get("min-height"), "var(--dh-desk-h)")`.
- Assertion 669–669: `assert.equal(desk.decls.get("max-height"), "var(--dh-desk-h)")`.
- Assertion 670–671: `assert.equal(decl(data, ".dh-export-status", "font-family"), "inherit", "export status is the hub face, not a monospace dump")`.
- Assertion 672–673: `assert.equal(decl(data, ".dh-tabs", "flex-wrap"), "wrap", "EXPORT must wrap, not clip, on the 760px card")`.

#### `compact title column scrolls instead of clipping at high UI SIZE` (676–693)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/menus.css`.

Case-local fixture/setup bindings (including action results): `menus` 677–677; `compactBtns` 679–679; `has` 681–681.

- Assertion 680–680: `assert.ok(compactBtns.length, "a compact-density #menu-buttons rule exists")`.
- Assertion 682–682: `assert.ok(has("max-height", /calc\(100\s*\*\s*var\(--svhz\)/), "the column is capped in local svhz")`.
- Assertion 683–683: `assert.ok(has("align-content", /safe center/))`.
- Assertion 684–684: `assert.ok(has("padding-inline", /var\(--gap\)/))`.
- Assertion 688–688: `assert.ok(!menus.some((r) => r.context.some((c) => /orientation:\s*portrait/.test(c))), "no @media (orientation: portrait) rule in menus.css")`.
- Assertion 689–690: `assert.ok(rulesFor(menus, /body\[data-shape="tall"\]\)\s*#overlay/).some((r) => [...r.decls.values()].some((v) => /minmax\(0,\s*1fr\)/.test(v))), "the tall shape hands leftover rows to a minmax(0, 1fr) column")`.
- Assertion 692–692: `assert.match(read("index.html"), /id="mb-help"[^>]*>[\s\S]*?btn-ico[\s\S]*?HOW TO PLAY/)`.

#### `title keyboard navigation has an explicit default before stateful controls` (713–730)

Fixtures: `bootMenuNav`. Exercised targets: `js/ui/menu-nav.js`.

Case-local fixture/setup bindings (including action results): `h` 718–718; `g` 725–725.

- Assertion 714–714: `assert.match(read("index.html"), /id="mb-career"[^>]*\bdata-menu-default\b/)`.
- Assertion 723–723: `assert.equal(h.focused(), "mb-career", "first press lands on the declared default, not the earlier aria-pressed Sound")`.
- Assertion 729–729: `assert.equal(g.focused(), "s-sound", "no data-menu-default → the aria-pressed control is the landing spot")`.

#### `tuner tabs scroll the selected chip into view` (732–737)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/lighting/tuner-panel.js`, `js/camera/tuner-panel.js`.

Case-local fixture/setup bindings (including action results): `file` 733–733; `s` 734–734.

Fixture iteration domains: `for (const file of ["js/lighting/tuner-panel.js", "js/camera/tuner-panel.js"])`.

- Assertion 735–735: `assert.match(s, /scrollIntoView\(\s*\{[^}]*\bblock:\s*"nearest"[^}]*\binline:\s*"center"[^}]*\}\s*\)\|scrollIntoView\(\s*\{[^}]*\binline:\s*"center"[^}]*\bblock:\s*"nearest"[^}]*\}\s*\)/, ˋ${file} centres the selected chipˋ)`.

#### `camera reset actions state their scope` (739–743)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `html` 740–740.

- Assertion 741–741: `assert.match(html, /id="ct-reset"[^>]*title=/)`.
- Assertion 742–742: `assert.match(html, /id="ct-reset-all"[^>]*title=/)`.

#### `lighting tuner preview uses G facade, not __apex (Pages has no agent surface)` (745–750)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/lighting/tuner-panel.js`.

Case-local fixture/setup bindings (including action results): `lighting` 746–746.

- Assertion 747–747: `assert.doesNotMatch(lighting, /__apex/)`.
- Assertion 748–748: `assert.match(lighting, /\bsetTimeOfDay\b/)`.
- Assertion 749–749: `assert.match(lighting, /\bweather\b/)`.

#### `generated lighting and camera tabs carry the complete tab contract` (752–774)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/lighting/tuner-panel.js`, `js/camera/tuner-panel.js`.

Case-local fixture/setup bindings (including action results): `html` 753–753; `lighting` 754–754; `camera` 755–755; `s` 761–761; `key` 766–766.

Fixture iteration domains: `for (const s of [lighting, camera])`; `for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"])`.

- Assertion 757–757: `assert.match(html, /id="lt-tabs"[^>]*role="tablist"[^>]*aria-label="Lighting categories"/)`.
- Assertion 758–758: `assert.match(html, /id="ct-modes"[^>]*role="tablist"[^>]*aria-label="Camera modes"/)`.
- Assertion 759–759: `assert.match(html, /id="ct-rows"[^>]*role="tabpanel"/)`.
- Assertion 762–762: `assert.match(s, /setAttribute\(\s*"role"\s*,\s*"tab"\s*\)/)`.
- Assertion 763–763: `assert.match(s, /setAttribute\(\s*"aria-controls"/)`.
- Assertion 764–764: `assert.match(s, /setAttribute\(\s*"aria-selected"/)`.
- Assertion 765–765: `assert.match(s, /\.tabIndex\s*=\s*on\s*\?\s*0\s*:\s*-1/)`.
- Assertion 767–767: `assert.match(s, new RegExp(ˋ\\.key\\s*===\\s*"${key}"ˋ))`.
- Assertion 770–770: `assert.match(lighting, /setAttribute\(\s*"role"\s*,\s*"tabpanel"\s*\)/)`.
- Assertion 771–771: `assert.match(lighting, /setAttribute\(\s*"aria-labelledby"/)`.
- Assertion 772–772: `assert.match(lighting, /\.hidden\s*=\s*!on\b/)`.
- Assertion 773–773: `assert.match(camera, /\$\(\s*"ct-rows"\s*\)\.setAttribute\(\s*"aria-labelledby"\s*,\s*b\.id\s*\)/)`.

#### `VS Friend text uses the menu type scale instead of sub-floor rem literals` (776–790)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/overlays.css`.

Case-local fixture/setup bindings (including action results): `raw` 777–777; `start` 778–778; `section` 780–780; `offenders` 781–781; `r` 782–782; `fs` 783–783; `size` 785–785.

Fixture iteration domains: `for (const r of section)`; `for (const size of fs.matchAll(/([0-9.]+)rem/g))`.

- Assertion 779–779: `assert.notEqual(start, -1, "VS Friend CSS section missing")`.
- Assertion 787–787: `assert.deepEqual(offenders, [])`.
- Assertion 788–788: `assert.equal(decl(section, /\.vs-roster-remove$/, "font-size"), "var(--fs-micro)")`.
- Assertion 789–789: `assert.equal(decl(section, /\.vs-summary dd$/, "font-size"), "var(--fs-2)")`.

#### `track select + circuit detail: readable selected title, sheet chrome, wrapping DRS` (792–867)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/select.css`, `css/track-detail.css`, `js/ui/select-screen.js`, `js/ui/track-maps.js`, `js/ui/menu-nav.js`.

Case-local fixture/setup bindings (including action results): `html` 793–793; `sel` 796–796; `td` 805–805; `menus` 809–809; `maps` 820–820; `nav` 822–822; `lowerThirdDd` 851–851.

- Assertion 794–794: `assert.match(html, /id="td-inner" class="sheet"/, "Circuit Detail is a sheet like standings, not a full-bleed overlay")`.
- Assertion 795–795: `assert.doesNotMatch(html, /id="track-detail-legend"/, "legend is built once in JS so the shell ratchet stays flat")`.
- Assertion 797–798: `assert.equal(decl(sel, "#sel-preview-gp", "color"), "var(--text)", "GP title is ink, not brand red (~2.6:1 on the still)")`.
- Assertion 799–800: `assert.equal(decl(sel, "#sel-preview-gp", "background"), "var(--plate-opaque)", "GP subtitle sits on a plate so Imola sunset / Bahrain sand stay ≥4.5:1")`.
- Assertion 801–801: `assert.equal(decl(sel, "#sel-preview-gp", "text-shadow"), "var(--hud-halo)")`.
- Assertion 802–802: `assert.equal(decl(sel, "#sel-tracks .track-row.active", "background"), "transparent")`.
- Assertion 803–803: `assert.equal(decl(sel, "#sel-tracks .track-row.active .track-row-name", "color"), "var(--text)")`.
- Assertion 804–804: `assert.equal(decl(sel, /#sel-tracks/, "scrollbar-color"), "var(--scroll-thumb) var(--scroll-track)")`.
- Assertion 806–806: `assert.ok(ruleFor(td, /^#td-inner$/), "the sheet inner is #td-inner")`.
- Assertion 807–807: `assert.equal(decl(td, "#track-detail-legend", "font-size"), "var(--fs-2)")`.
- Assertion 808–808: `assert.equal(decl(td, /#track-detail-legend \[data-leg="sector"\]/, "color"), "var(--silver)")`.
- Assertion 810–810: `assert.match(menus, /function drsZoneRangeHtml/, "DRS wrap labels are one helper for detail + tests")`.
- Assertion 811–811: `assert.match(menus, /crossing start\/finish/, "a zone past the line names S/F on the wrap")`.
- Assertion 812–813: `assert.match(menus, /z\.wrap \\|\\| z\.b > 1 \\|\\| z\.b < z\.a/, "wrap is the AeroZones flag, end past 1 lap, or a folded b < a")`.
- Assertion 814–815: `assert.match(menus, /snapTrackToFilter\(id\);\s*\n\s*updateTrackPreview\(\)/, "filter snap refreshes the hero before the deferred chip rebuild")`.
- Assertion 816–817: `assert.ok(!/className = "track-group-head"/.test(menus), "filter chips name the view; no vertical CLASSICS/SEASON divider")`.
- Assertion 818–818: `assert.match(menus, /setAttribute\("data-leg", "sector"\)/, "grey S2 sector is named")`.
- Assertion 819–819: `assert.match(menus, /legend:\s*false/, "the modal uses the DOM legend, not the 9px canvas key")`.
- Assertion 821–821: `assert.match(maps, /wrap:\s*z\.end > total/, "activationZones marks a run past S/F")`.
- Assertion 823–823: `assert.match(nav, /if \(overStrip\) \{/, "wheel over #sel-tracks pans the strip before the ancestor walk")`.
- Assertion 824–825: `assert.match(menus, /opts && opts\.readOnly\) row\.dataset\.tip/, "season calendar tiles use data-tip, not native title over the neighbour")`.
- Assertion 826–826: `assert.equal(decl(sel, '#sel-tracks[data-mode="season"]', "padding-inline"), "var(--pad)")`.
- Assertion 827–828: `assert.equal(decl(sel, '#sel-tracks[data-mode="season"]', "scrollbar-color"), "var(--scroll-thumb) var(--scroll-track)")`.
- Assertion 829–830: `assert.equal(decl(sel, '#sel-tracks[data-mode="season"]', "scroll-snap-type"), "x mandatory", "season end-of-pan settles on a tile start, so R14 is not mid-cut")`.
- Assertion 831–831: `assert.equal(decl(sel, '#sel-tracks[data-mode="season"] .track-row', "scroll-snap-align"), "start")`.
- Assertion 832–833: `assert.equal(decl(sel, "#sel-tracks .track-row", "scroll-snap-align"), "start", "snap-start so the last flag is not centre-clipped at the strip end")`.
- Assertion 834–835: `assert.equal(decl(sel, "#sel-tracks .track-row:last-child", "scroll-snap-align"), "end", "last flag snaps to the end slack instead of hanging off the clip")`.
- Assertion 836–839: `assert.equal( decl(sel, '#sel-inner[data-density="compact"] #sel-tracks .track-row', "min-height"), "var(--tap-paint)", "compact flag tiles floor at --tap-paint on phone landscape (not padding-only ~45px)")`.
- Assertion 840–841: `assert.equal(decl(sel, "#sel-tracks", "padding-inline-end"), "calc(var(--pad) + var(--chip-h))", "strip end pad is one chip plus --pad so the last flag clears the edge")`.
- Assertion 842–843: `assert.equal(decl(sel, "#sel-car small", "white-space"), "normal", "CHANGE CAR team name wraps at ~500 instead of SCUDERIA FERR…")`.
- Assertion 844–845: `assert.equal(decl(sel, "#sel-tracks .track-group-head", "max-height"), "none", "CLASSICS vertical label is not chip-capped")`.
- Assertion 846–847: `assert.equal(decl(sel, '#sel-inner[data-density="compact"] #sel-tracks .track-group-head', "display"), "none", "compact strip: the chip already names CLASSICS, so the squeezed divider goes")`.
- Assertion 848–850: `assert.ok(rulesFor(sel, /#sel-tracks \.track-group-head/).some((r) => r.context.includes("@container sheet (max-width: 520px)") && r.decls.get("display") === "none"), "~500 width hides the vertical CLASSICS divider even when density is still normal")`.
- Assertion 852–852: `assert.ok(lowerThirdDd, "lower-third stats keep a wrap rule")`.
- Assertion 853–853: `assert.equal(lowerThirdDd.decls.get("white-space"), "normal")`.
- Assertion 854–856: `assert.ok(rulesFor(sel, /#sel-inner > \.sheet-foot/).some((r) => r.context.includes("@container sheet (max-width: 520px)")), "foot wraps team names from ~500, not only a tall 480 phone")`.
- Assertion 857–859: `assert.ok(rulesFor(sel, /data-tip\]:hover::before/).every((r) => r.context.some((c) => /hover\s*:\s*hover/.test(c))), "season data-tip :hover is gated; :active is the touch twin")`.
- Assertion 860–860: `assert.match(menus, /function snapTrackToFilter/, "CLASSICS (and the other chips) snap the hero onto a visible tile")`.
- Assertion 861–861: `assert.match(menus, /function trackInFilter/, "filter membership is one helper for the strip and the snap")`.
- Assertion 862–862: `assert.match(menus, /fmtElev/, "sparkline labels keep the minus on a trough")`.
- Assertion 863–864: `assert.match(menus, /clientWidth <= 520/, "narrow (~500) CIRCUIT LENGTH drops the mile half so TURNS is not 1..")`.
- Assertion 865–865: `assert.equal(decl(td, "#track-detail-header", "padding-inline"), "var(--pad)")`.
- Assertion 866–866: `assert.equal(decl(td, "#track-detail-panel", "padding-inline"), "var(--pad)")`.

#### `closing track detail disconnects its observer and blocks queued hidden redraws` (869–880)

Fixtures: `fnBody`, `gameCode`. Exercised targets: `js/ui/select-screen.js`, `js/game.js`.

Case-local fixture/setup bindings (including action results): `menus` 870–870; `drawAt` 871–871; `close` 874–874; `ret` 877–877.

- Assertion 872–872: `assert.ok(drawAt >= 0, "drawDetail is the redraw closure")`.
- Assertion 873–873: `assert.match(menus.slice(drawAt, drawAt + 400), /if\s*\(\s*modal\.hidden\s*\)\s*return\s*;/, "a queued redraw of a hidden modal is dropped")`.
- Assertion 875–875: `assert.match(close, /detailRO\.disconnect\(\s*\)/, "closing disconnects the ResizeObserver")`.
- Assertion 876–876: `assert.match(close, /detailRO\s*=\s*null/, "…and forgets it")`.
- Assertion 878–878: `assert.ok(ret && /\bcloseTrackDetail\b/.test(ret[1]), "closeTrackDetail is exported beside openTrackDetail (game.js wires the close button to it)")`.
- Assertion 879–879: `assert.match(gameCode(), /\$\(\s*"track-detail-close"\s*\)\.onclick\s*=\s*closeTrackDetail\b/)`.

#### `extreme-scale journeys use local-width and compact-chrome contracts` (882–945)

Fixtures: `bootSheetShape`. Exercised targets: `js/ui/sheet-shape.js`, `css/tuner.css`, `css/career.css`, `css/data.css`, `css/menus.css`.

Case-local fixture/setup bindings (including action results): `h` 886–886; `rail` 893–893; `row` 894–894; `plain` 901–901; `tuner` 905–905; `career` 906–906; `data` 907–907; `ltJson` 922–922; `r` 924–924; `tallTabs` 939–939.

Fixture iteration domains: `for (const r of ltJson)`.

- Assertion 888–888: `assert.equal(h.body.dataset.width, "wide", "1300 px at UI SIZE 200% is 650 own px — past the 620 px --wide-at")`.
- Assertion 890–890: `assert.equal(h.body.dataset.width, "wide", "16 px of hysteresis holds the flag just under the threshold")`.
- Assertion 892–892: `assert.equal(h.body.dataset.width, "narrow")`.
- Assertion 896–896: `assert.equal(rail.el.dataset.density, "compact")`.
- Assertion 897–897: `assert.equal(rail.el.dataset.rail, "on", "600 own px ≥ 500 --rail-at and 300/42 ≈ 7 rows → rail")`.
- Assertion 900–900: `assert.equal(rail.el.dataset.rail, "off", "wide enough, but only ~2.4 slider rows fit → the horizontal chip strip")`.
- Assertion 903–903: `assert.equal(plain.el.dataset.rail, "on", "the rows rule is the tuners' alone; another sheet rails on width")`.
- Assertion 908–908: `assert.equal(decl(css("css/menus.css"), "body", "--wide-at"), "620px", "the body-level threshold SheetShape reads")`.
- Assertion 909–910: `assert.ok(tuner.some((r) => r.decls.get("--rail-at") === "640px"), "compact-wide stays rail-off: 640 sits above the 560px rail dock so sliders keep full width")`.
- Assertion 911–912: `assert.ok(rulesFor(tuner, /#ct-modes \.lt-tab/).some((r) => r.decls.get("white-space") === "nowrap"), "compact camera-mode chips stay a nowrap strip")`.
- Assertion 913–913: `assert.ok(rulesFor(tuner, /\[data-density="compact"\]\[data-rail="on"\]/).length, "compact + rail-on has its own rules")`.
- Assertion 914–914: `assert.ok(!tuner.some((r) => r.context.some((c) => /@media \(min-width:\s*720px\)/.test(c))))`.
- Assertion 915–915: `assert.ok(!tuner.some((r) => r.context.some((c) => /@media \(max-height: 430px\)/.test(c))))`.
- Assertion 916–916: `assert.equal(decl(tuner, /\[data-density="compact"\]\[data-rail="off"\] #lt-head/, "display"), "block")`.
- Assertion 917–917: `assert.ok(rulesFor(tuner, /\[data-density="compact"\]$/).some((r) => r.decls.get("overflow") === "hidden"))`.
- Assertion 918–918: `assert.equal(decl(tuner, /\[data-density="compact"\] \.adv-help$/, "display"), "none")`.
- Assertion 923–923: `assert.ok(ltJson.length, "COPY VALUES box declares a max-height")`.
- Assertion 925–925: `assert.match(r.decls.get("max-height"), /min\(calc\(\d+\s*\*\s*var\(--svhz\)/, "COPY VALUES box uses local --svhz, not 40svh")`.
- Assertion 926–926: `assert.doesNotMatch(r.decls.get("max-height"), /\d+svh\b/, "and never a raw viewport svh")`.
- Assertion 928–928: `assert.ok(ruleFor(tuner, /#lt-head h2, #ct-head/), "tuner heads share one rule")`.
- Assertion 929–929: `assert.ok(decl(career, /^#cr-inner\[data-density="compact"\] #cr-foot\b/, "grid-template-columns"))`.
- Assertion 930–930: `assert.equal(decl(data, /^body\[data-density="compact"\] \.dh-tab\b/, "min-height"), "var(--tap-paint)")`.
- Assertion 931–931: `assert.ok(ruleFor(data, /^body\[data-density="compact"\] \.dh-overlay\b/))`.
- Assertion 932–933: `assert.ok(!data.some((r) => r.context.some((c) => /orientation:\s*landscape\) and \(max-height:/.test(c))), "data hub short-height chrome must use body[data-density], not viewport max-height")`.
- Assertion 934–935: `assert.ok(ruleFor(data, /^body\[data-shape="tall"\]\[data-width="narrow"\] \.dh-tabs\b/), "portrait 2×3 destinations use the zoom-aware shape+width flags (not @media orientation)")`.
- Assertion 940–941: `assert.match(tallTabs.decls.get("grid-template-columns") \|\| "", /repeat\(3,\s*minmax\(0,\s*1fr\)\)/, "tall+narrow hub tabs are a 3-column grid so schedule content stays visible")`.
- Assertion 942–943: `assert.equal(decl(data, /^body\[data-shape="tall"\]\[data-width="narrow"\] \.dh-tab\b/, "white-space"), "normal", "WATCH & DRIVE wraps inside the chip instead of overflowing the plate")`.
- Assertion 944–944: `assert.equal(decl(css("css/menus.css"), /^#ss-inner\[data-density="compact"\] #ss-cal \.season-upcoming-row/, "flex-wrap"), "wrap")`.

#### `an active career locks team and seat selection in the garage` (947–954)

Fixtures: `gameCode`. Exercised targets: `js/garage/setup-sheet.js`, `js/game.js`.

Case-local fixture/setup bindings (including action results): `setup` 948–948.

- Assertion 949–949: `assert.match(setup, /careerLocked\s*=\s*typeof\s+Career\s*!==\s*"undefined"\s*&&\s*Career\.inCareer\s*&&\s*Career\.inCareer\(\s*\)/)`.
- Assertion 950–950: `assert.match(setup, /identityLocked\s*=\s*\(\)\s*=>\s*pitLocked\(\)\s*\\|\\|\s*careerLocked\b/)`.
- Assertion 951–951: `assert.match(setup, /card\.disabled\s*=\s*!!identityLocked\(\)/)`.
- Assertion 952–952: `assert.match(setup, /\.disabled\s*=\s*taken\s*\\|\\|\s*!!identityLocked\(\)/)`.
- Assertion 953–953: `assert.doesNotMatch(gameCode(), /careerActive:/)`.

#### `camera picker is a keyboard radio menu and cannot outlive the race layer` (969–1002)

Fixtures: `bootCamModes`, `gameCode`, `fnBody`. Exercised targets: `js/camera/mode-switch.js`, `js/game.js`.

Case-local fixture/setup bindings (including action results): `h` 970–970; `picker` 974–974; `game` 999–999.

- Assertion 971–971: `assert.deepEqual(Object.keys(h.api).sort(), ["cycleCam", "hideCamPicker", "refreshCamBtn", "setCamMode"], "CamModes.create surface")`.
- Assertion 972–972: `assert.equal(h.trigger.getAttribute("aria-haspopup"), "menu")`.
- Assertion 973–973: `assert.equal(h.trigger.getAttribute("aria-expanded"), "false")`.
- Assertion 975–975: `assert.ok(picker, "hold / right-click builds the picker")`.
- Assertion 976–976: `assert.equal(picker.getAttribute("role"), "menu")`.
- Assertion 977–977: `assert.equal(picker.className, "balanced-row", "the picker balances from local space like every other cluster")`.
- Assertion 978–978: `assert.equal(picker.hidden, false)`.
- Assertion 979–979: `assert.equal(h.trigger.getAttribute("aria-expanded"), "true")`.
- Assertion 980–980: `assert.ok(picker.children.length >= 10 && picker.children.every((b) => b.getAttribute("role") === "menuitemradio"))`.
- Assertion 981–981: `assert.deepEqual(picker.children.map((b) => b.getAttribute("aria-checked") === "true"), picker.children.map((_, i) => i === 2), "only the live mode is aria-checked")`.
- Assertion 982–982: `assert.equal(h.active(), picker.children[2], "opening focuses the checked item")`.
- Assertion 983–983: `assert.equal(h.active(), picker.children[3])`.
- Assertion 984–984: `assert.equal(h.active(), picker.children[4])`.
- Assertion 985–985: `assert.equal(h.active(), picker.children[3])`.
- Assertion 986–986: `assert.equal(h.active(), picker.children[2])`.
- Assertion 987–987: `assert.equal(h.active(), picker.children[picker.children.length - 1])`.
- Assertion 988–988: `assert.equal(h.active(), picker.children[0], "wraps")`.
- Assertion 989–989: `assert.equal(h.active(), picker.children[0])`.
- Assertion 991–991: `assert.equal(picker.hidden, true, "Escape closes the picker")`.
- Assertion 992–992: `assert.equal(h.trigger.getAttribute("aria-expanded"), "false")`.
- Assertion 995–995: `assert.equal(picker.hidden, true, "hideCamPicker is the exported closer game.js calls on pause / quit")`.
- Assertion 996–996: `assert.equal(h.api.cycleCam(), "cockpit")`.
- Assertion 997–997: `assert.equal(h.store.camMode, 3, "the pick persists")`.
- Assertion 1000–1000: `assert.match(fnBody(game, "quitToMenu", "game entry"), /hideCamPicker\(\s*\)/)`.
- Assertion 1001–1001: `assert.match(fnBody(game, "setPaused", "game entry"), /hideCamPicker\(\s*\)/)`.

#### `camera picker refuses hidden, paused and inactive race layers, including queued holds` (1004–1026)

Fixtures: `bootCamModes`. Exercised targets: `js/camera/mode-switch.js`.

Case-local fixture/setup bindings (including action results): `blocked` 1005–1012; `[label, block]` 1013–1013; `h` 1014–1014; `h` 1021–1021.

Fixture iteration domains: `for (const [label, block] of blocked)`.

- Assertion 1018–1018: `assert.equal(h.open(), null, ˋ${label}: neither queued hold nor context menu builds the pickerˋ)`.
- Assertion 1019–1019: `assert.equal(h.trigger.getAttribute("aria-expanded"), "false", label)`.
- Assertion 1025–1025: `assert.equal(h.dom.document.querySelector("#campicker").hidden, false, "countdown permits the hold picker")`.

#### `in a REAL RACE WATCH the picker and the C cycle carry AUTO (the TV director); outside one they do not` (1028–1063)

Fixtures: `bootCamModes`. Exercised targets: `js/camera/mode-switch.js`.

Case-local fixture/setup bindings (including action results): `calls` 1030–1030; `r` 1031–1032; `h` 1033–1033; `plain` 1034–1034; `picker` 1038–1038.

- Assertion 1035–1035: `assert.ok(!h.open().children.some((b) => b.dataset.idx === "auto"), "no AUTO outside a WATCH")`.
- Assertion 1039–1039: `assert.equal(picker.children.length, plain + 1)`.
- Assertion 1040–1040: `assert.equal(picker.children[0].dataset.idx, "auto", "AUTO heads the list")`.
- Assertion 1041–1041: `assert.equal(picker.children[0].getAttribute("aria-checked"), "true", "the director has the picture: AUTO is the checked item")`.
- Assertion 1042–1042: `assert.equal(picker.children.filter((b) => b.getAttribute("aria-checked") === "true").length, 1)`.
- Assertion 1044–1044: `assert.deepEqual(calls, ["take"])`.
- Assertion 1045–1045: `assert.equal(h.G.camMode, 3)`.
- Assertion 1046–1046: `assert.equal(h.trigger.textContent.startsWith("AUTO"), false)`.
- Assertion 1048–1048: `assert.equal(picker.children[0].getAttribute("aria-checked"), "false")`.
- Assertion 1049–1049: `assert.equal(picker.children[4].getAttribute("aria-checked"), "true")`.
- Assertion 1051–1051: `assert.deepEqual(calls, ["take", "auto"])`.
- Assertion 1052–1052: `assert.match(h.trigger.textContent, /^AUTO · /, "the CAM button says who has the picture")`.
- Assertion 1055–1055: `assert.equal(r.auto, false)`.
- Assertion 1058–1058: `assert.equal(h.api.cycleCam(), "auto")`.
- Assertion 1059–1059: `assert.equal(r.auto, true)`.
- Assertion 1062–1062: `assert.equal(h.open().children.length, plain)`.

#### `How to Play names every input and drops the retired screen-half lie` (1065–1098)

Fixtures: `gameCode`, `bootMenuNav`. Exercised targets: `js/game.js`, `js/ui/menu-nav.js`.

Case-local fixture/setup bindings (including action results): `html` 1066–1066; `start` 1067–1067; `end` 1068–1068; `htp` 1070–1070; `mode` 1073–1073; `phrase` 1077–1077; `game` 1082–1082; `h` 1092–1092; `first` 1093–1093; `mid` 1093–1093; `last` 1093–1093.

Fixture iteration domains: `for (const mode of ["keyboard", "controller", "touch"])`; `for (const phrase of ["SETTINGS › CONTROLS › STEERING INPUT", "ADAPTIVE BUTTONS", "BRAKING CUES", "DRIVING AIDS", "drag from where your finger lands"])`.

- Assertion 1069–1069: `assert.ok(start > 0 && end > start, "howtoplay sheet is in the shell")`.
- Assertion 1071–1072: `assert.match(htp, /<section id="htp-controls"[^>]*aria-labelledby="htp-start"[\s\S]*<h3 id="htp-start"[^>]*>QUICK START<\/h3>/, "Help opens with a short actionable quick start")`.
- Assertion 1074–1074: `assert.match(htp, new RegExp(ˋ<details[^>]+data-input="${mode}"ˋ), ˋHelp has a ${mode} disclosureˋ)`.
- Assertion 1075–1075: `assert.match(htp, /data-help-keys="(?:aero\|camera\|pause)"/)`.
- Assertion 1076–1076: `assert.match(htp, /data-help-pad="(?:aero\|camera\|pause)"/)`.
- Assertion 1078–1078: `assert.ok(htp.includes(phrase), ˋHow to Play must say: ${phrase}ˋ)`.
- Assertion 1080–1080: `assert.doesNotMatch(htp, /SETTINGS[^<]{0,80}>\s*STEER\b/, "Help must not name the retired STEER door")`.
- Assertion 1081–1081: `assert.doesNotMatch(htp, /HALVES\|TRACKSIDE\|screen halves\|tap left\/right/)`.
- Assertion 1083–1084: `assert.match(game, /autoThrottle\(\s*\)\s*\?\s*1\s*:\s*Math\.max\(\s*0\s*,\s*Input\.throttleLevel\(\s*\)\s*\)/, "TOUCH auto-throttle must apply full pedal travel, not a 0 analog reading")`.
- Assertion 1085–1086: `assert.match(game, /steerMode\s*===\s*"tilt"\s*\\|\\|\s*!Input\.touchControlsNeeded\(\s*\)/, "phone MANUAL gears stay tilt-only — BUTTONS already owns both thumbs")`.
- Assertion 1087–1088: `assert.match(game, /L\.push\(\s*shifts\s*,\s*taps\s*\)\s*;\s*R\.push\(\s*pedals\s*\)/, "tilt+manual puts the shifter left and the pedals right")`.
- Assertion 1094–1094: `assert.equal(h.MenuNav.step(last, 0, 1, [first, mid, last]), first, "Down from the last item wraps to the first")`.
- Assertion 1095–1095: `assert.equal(h.MenuNav.step(first, 0, -1, [first, mid, last]), last, "Up from the first item wraps to the last")`.
- Assertion 1096–1096: `assert.equal(h.MenuNav.step(last, 1, 0, [first, mid, last]), first, "Right off the end wraps in DOM order")`.
- Assertion 1097–1097: `assert.equal(h.MenuNav.step(first, -1, 0, [first, mid, last]), last, "Left off the start wraps in DOM order")`.

#### `How to Play exposes pinned semantic jump landmarks` (1100–1128)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/overlays.css`, `css/components.css`.

Case-local fixture/setup bindings (including action results): `html` 1101–1101; `overlays` 1102–1102; `id` 1104–1104; `components` 1110–1110.

Fixture iteration domains: `for (const id of ["controls", "racing", "setup", "modes", "friends"])`.

- Assertion 1103–1103: `assert.match(html, /id="htp-contents"[^>]*aria-label="How to play sections"/)`.
- Assertion 1105–1105: `assert.match(html, new RegExp(ˋhref="#htp-${id}"ˋ))`.
- Assertion 1106–1108: `assert.match(html, id === "controls" ? /<section id="htp-controls"/ : new RegExp(ˋ<dt id="htp-${id}">ˋ))`.
- Assertion 1111–1111: `assert.equal(decl(components, /^#htp-contents, #cg-contents, #ch-contents$/, "overflow-x"), "auto")`.
- Assertion 1112–1112: `assert.equal(decl(components, /^#htp-contents a, #cg-contents a, #ch-contents a$/, "min-height"), "var(--chip-h)")`.
- Assertion 1113–1113: `assert.ok(ruleFor(overlays, /^#howtoplay-inner\[data-shape="wide"\] > #htp-contents/))`.
- Assertion 1114–1114: `assert.ok(ruleFor(overlays, /^#howtoplay-inner\[data-density="compact"\] > #htp-contents/))`.
- Assertion 1115–1115: `assert.match(html, /id="vsfriend-inner"/)`.
- Assertion 1116–1116: `assert.ok(rulesFor(overlays, /(?:^\|, )#howtoplay:has\(#htp-friends:target\)/).some((r) => r.decls.get("background") === "var(--plate-on)"))`.
- Assertion 1117–1117: `assert.ok(rulesFor(overlays, /(?:^\|, )#howtoplay:has\(#htp-pits:target\)/).some((r) => r.decls.get("background") === "var(--plate-on)"))`.
- Assertion 1118–1118: `assert.ok(rulesFor(overlays, /(?:^\|, )#howtoplay:has\(#htp-driving:target\)/).some((r) => r.decls.get("background") === "var(--plate-on)"))`.
- Assertion 1119–1119: `assert.ok(decl(overlays, "#howtoplay dt[id]", "scroll-margin-block-start"))`.
- Assertion 1120–1122: `assert.ok(decl(overlays, "#howtoplay .sheet-body::after", "height") \|\| rulesFor(overlays, /#howtoplay \.sheet-body::after/).some((r) => r.decls.get("height")), "HTP body keeps a trailing reading gap")`.
- Assertion 1123–1124: `assert.ok(decl(overlays, "#howtoplay .sheet-body", "scroll-padding-block-start") \|\| rulesFor(overlays, /^#howtoplay \.sheet-body$/).some((r) => r.decls.has("scroll-padding-block-start")))`.
- Assertion 1125–1126: `assert.ok(!rulesFor(overlays, "#howtoplay dl").some((r) => /max-content minmax\(0, 1fr\) max-content/.test(r.decls.get("grid-template-columns") \|\| "")), "help rows must not synchronize two unrelated answers")`.
- Assertion 1127–1127: `assert.equal(decl(css("css/components.css"), "#howtoplay", "--sheet-w"), "1000px")`.

#### `compact Career keeps its mode context instead of ellipsizing it` (1130–1134)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/career.css`.

Case-local fixture/setup bindings (including action results): `career` 1131–1131.

- Assertion 1132–1132: `assert.equal(decl(career, '#cr-inner[data-density="compact"] #cr-sub', "white-space"), "normal")`.
- Assertion 1133–1133: `assert.equal(decl(career, '#cr-inner[data-density="compact"] #cr-sub', "text-overflow"), "clip")`.

#### `variable control clusters use one content-driven balanced-row primitive` (1136–1195)

Fixtures: `bootCamModes`. Exercised targets: `css/components.css`, `js/race/race-settings.js`, `js/camera/mode-switch.js`, `css/menus.css`, `css/tuner.css`.

Case-local fixture/setup bindings (including action results): `html` 1137–1137; `components` 1138–1138; `id` 1142–1142; `id` 1147–1147; `[fold, rows]` 1160–1160; `body` 1164–1164; `r` 1169–1169; `flat` 1172–1172; `at` 1173–1173; `firstFold` 1174–1174; `all` 1192–1192.

Fixture iteration domains: `for (const id of ["menu-secondary", "lt-tabs", "ct-modes"])`; `for (const id of ["rs-laps", "rs-weather", "rs-mixed", "rs-time", "rs-diff", "rs-quali", "rs-caution", "rs-line", "rs-reliab"])`; `for (const [fold, rows] of [ ["rs-fold-field", ["rs-diff", "rs-quali", "rs-duel", "rs-caution", "rs-reliab"]], ["rs-fold-assists", ["rs-line", "rs-tyres", "rs-plan"]], ])`; `for (const r of rows)`; `for (const flat of ["rs-laps", "rs-weather", "rs-mixed", "rs-time"])`.

- Assertion 1139–1139: `assert.equal(decl(components, ".balanced-row", "display"), "flex")`.
- Assertion 1140–1140: `assert.equal(decl(components, ".balanced-row", "flex-wrap"), "wrap")`.
- Assertion 1141–1141: `assert.match(decl(components, /^\.balanced-row > :not\(\[hidden\]\)$/, "flex") \|\| "", /^1 1 var\(--balance-basis/)`.
- Assertion 1143–1143: `assert.match(html, new RegExp(ˋid="${id}"[^>]*class="[^"]*balanced-rowˋ), ˋ${id} must balance from local spaceˋ)`.
- Assertion 1148–1148: `assert.match(html, new RegExp(ˋid="${id}" class="set-row" role="group" aria-labelledby="${id}-label"ˋ), ˋ${id} is a setting rowˋ)`.
- Assertion 1150–1150: `assert.doesNotMatch(html, /id="rs-[a-z]+" class="chip-row/, "no race-settings chip row survives")`.
- Assertion 1165–1165: `assert.ok(body, ˋ${fold} existsˋ)`.
- Assertion 1166–1167: `assert.match(body, new RegExp(ˋ<summary class="adv-more-btn" id="${fold}-sum"ˋ), ˋ${fold} uses the shell's summary component, not a new oneˋ)`.
- Assertion 1168–1168: `assert.doesNotMatch(body, /\sopen[\s>]/, ˋ${fold} starts closedˋ)`.
- Assertion 1169–1169: `assert.ok(body.includes(ˋid="${r}"ˋ), ˋ${r} is inside ${fold}ˋ)`.
- Assertion 1175–1175: `assert.ok(at > 0 && at < firstFold, ˋ${flat} stays flat, above the foldsˋ)`.
- Assertion 1180–1181: `assert.match(read("js/race/race-settings.js"), /fold\.hidden = rows\.length === 0;/, "an empty fold hides rather than opening onto nothing")`.
- Assertion 1182–1182: `assert.equal(bootCamModes().open().className, "balanced-row", "the camera picker is a balanced-row too")`.
- Assertion 1183–1183: `assert.match(html, /class="preset-row balanced-row"/, "STEERING & ASSISTS presets wrap from local space")`.
- Assertion 1186–1186: `assert.match(html, /id="pm-feel" class="set-row" role="group"/)`.
- Assertion 1187–1187: `assert.match(html, /id="pm-helplevel" class="set-row" role="group"/)`.
- Assertion 1188–1188: `assert.match(html, /id="pm-linemode" class="set-row" role="group"/)`.
- Assertion 1189–1191: `assert.ok(rulesFor(components, /#pmsettings-inner\[data-shape="wide"\] #advanced-inner \.adv-sec/).some((r) => r.decls.get("grid-column") === "1 / -1"), "advanced section headings still span the wide body grid")`.
- Assertion 1193–1193: `assert.doesNotMatch(all, /no-orphan-[235]/, "column-count-specific orphan patches must not return")`.
- Assertion 1194–1194: `assert.ok(!rulesFor(css("css/menus.css"), /#rs-(?:laps\|weather\|diff\|time)\b/).some((r) => /^repeat\([235]/.test(r.decls.get("grid-template-columns") \|\| "")))`.

#### `overflowing Help navigation keeps its first landmark reachable` (1197–1202)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/overlays.css`.

Case-local fixture/setup bindings (including action results): `overlays` 1198–1198; `components` 1199–1199.

- Assertion 1200–1200: `assert.equal(decl(components, /^#htp-contents, #cg-contents, #ch-contents$/, "justify-content"), "flex-start")`.
- Assertion 1201–1201: `assert.equal(decl(components, /^#htp-contents > :first-child, #cg-contents > :first-child, #ch-contents > :first-child$/, "margin-inline-start"), "auto")`.

#### `the d-pad ramps to lock like every other digital source` (1252–1267)

Fixtures: `bootInput`. Exercised targets: `js/core/log.js`, `js/core/mat4.js`, `js/input/bindings.js`, `js/input/pad-menu.js`, `js/input/haptics.js`, `js/input/hold-buttons.js`, `js/input/input.js`.

Case-local fixture/setup bindings (including action results): `h` 1253–1253; `DPAD_RIGHT` 1254–1254; `first` 1257–1257; `i` 1261–1261; `releasing` 1265–1265.

Fixture iteration domains: `for (let i = 0; i < 200; i++)`.

- Assertion 1258–1258: `assert.ok(first > 0, "it steers")`.
- Assertion 1259–1259: `assert.ok(first < 0.5, "but nowhere near full lock after one frame")`.
- Assertion 1262–1262: `assert.ok(h.Input.steer(1 / 60) > 0.95, "a held d-pad still reaches full lock")`.
- Assertion 1266–1266: `assert.ok(releasing > 0 && releasing < 1, "release unwinds, it does not snap")`.

#### `stick dead zone and saturation are adjustable, and saturation reaches full lock early` (1269–1282)

Fixtures: `bootInput`. Exercised targets: `js/core/log.js`, `js/core/mat4.js`, `js/input/bindings.js`, `js/input/pad-menu.js`, `js/input/haptics.js`, `js/input/hold-buttons.js`, `js/input/input.js`.

Case-local fixture/setup bindings (including action results): `h` 1270–1270.

- Assertion 1273–1273: `assert.equal(h.Input.steer(), 0, "a raised dead zone swallows a deflection that used to count")`.
- Assertion 1278–1278: `assert.ok(Math.abs(h.Input.steer() - 1) < 1e-9, "0.80 of travel is full lock at 20% saturation")`.
- Assertion 1281–1281: `assert.ok(h.Input.steer() < 0.85, "…and is not, without it")`.

#### `the analog curve trim is per device and defaults to the identity` (1287–1300)

Fixtures: `bootInput`. Exercised targets: `js/core/log.js`, `js/core/mat4.js`, `js/input/bindings.js`, `js/input/pad-menu.js`, `js/input/haptics.js`, `js/input/hold-buttons.js`, `js/input/input.js`.

Case-local fixture/setup bindings (including action results): `h` 1288–1288; `plain` 1290–1290.

- Assertion 1293–1293: `assert.equal(h.Input.steer(), plain, "trimming tilt does not touch the stick")`.
- Assertion 1296–1296: `assert.ok(h.Input.steer() < plain, "trimming the pad softens it near centre")`.
- Assertion 1299–1299: `assert.ok(Math.abs(h.Input.steer() - plain) < 1e-12, "1 is exactly the identity")`.

#### `speed-sensitive analog steering is off by default and floors at 40%` (1302–1316)

Fixtures: `bootInput`. Exercised targets: `js/core/log.js`, `js/core/mat4.js`, `js/input/bindings.js`, `js/input/pad-menu.js`, `js/input/haptics.js`, `js/input/hold-buttons.js`, `js/input/input.js`.

Case-local fixture/setup bindings (including action results): `h` 1303–1303; `off` 1306–1306; `on` 1309–1309.

- Assertion 1310–1310: `assert.ok(on < off, "at speed it softens the stick")`.
- Assertion 1311–1311: `assert.ok(on / off > 0.40, "but never below the 40% floor — no on-centre dead zone at speed")`.
- Assertion 1314–1314: `assert.ok(Math.abs(h.Input.steer() - off) < 1e-12, "and does nothing at all at a standstill")`.

#### `gamepad menu nav seeds focus on open and uses a larger stick deadzone than driving` (1318–1462)

Fixtures: `bootInput`, `uiSandbox`. Exercised targets: `js/core/log.js`, `js/core/mat4.js`, `js/input/bindings.js`, `js/input/pad-menu.js`, `js/input/haptics.js`, `js/input/hold-buttons.js`, `js/input/input.js`, `js/ui/layers.js`, `js/ui/menu-nav.js`, `js/ui/aria-state.js`, `js/ui/scroll-fade.js`.

Case-local fixture/setup bindings (including action results): `h` 1319–1319; `clicked` 1359–1359; `layer` 1360–1360; `sbU` 1380–1380; `wrapSb` 1394–1394; `wrap` 1396–1396; `loc` 1425–1425; `hashDom` 1426–1426; `nav` 1427–1427; `a1` 1429–1429; `a2` 1431–1431; `hashSb` 1436–1436; `toggleDom` 1445–1445; `group` 1446–1446; `one` 1447–1447; `two` 1447–1447; `toggleSb` 1449–1449.

- Assertion 1325–1325: `assert.equal(h.Input.steer(), 0, "0.04 is inside the driving deadzone")`.
- Assertion 1327–1327: `assert.ok(h.Input.steer() > 0 && h.Input.steer() < 0.02, "0.06 just clears it and is rescaled from the edge, not stepped")`.
- Assertion 1329–1329: `assert.ok(Math.abs(h.Input.steer() - (0.5 - 0.05) / (1 - 0.05)) < 1e-9, "rescale is (\|ax\| - dz) / (1 - dz - sat)")`.
- Assertion 1336–1336: `assert.deepEqual(h.keys(), ["ArrowDown"], "opening a menu seeds MenuNav's first-arrow path")`.
- Assertion 1338–1338: `assert.deepEqual(h.keys(), [], "the seed fires once, not every frame")`.
- Assertion 1341–1341: `assert.deepEqual(h.keys(), [], "a resting stick at 0.18 must not creep through the menu")`.
- Assertion 1342–1342: `assert.equal(h.Input.steer(), 0, "…and a stick under a menu steers nothing (a friend race keeps simulating under the pause menu)")`.
- Assertion 1344–1344: `assert.deepEqual(h.keys(), ["ArrowRight"], "a deliberate push navigates")`.
- Assertion 1346–1346: `assert.deepEqual(h.keys(), [], "no repeat before the initial delay")`.
- Assertion 1347–1347: `assert.deepEqual(h.keys(), ["ArrowRight"], "first repeat after ~450 ms")`.
- Assertion 1348–1348: `assert.deepEqual(h.keys(), [], "repeat cadence is slower than every frame")`.
- Assertion 1349–1349: `assert.deepEqual(h.keys(), ["ArrowRight"], "…about every 130 ms")`.
- Assertion 1350–1350: `assert.deepEqual(h.keys(), [], "release stops the repeat immediately")`.
- Assertion 1353–1353: `assert.deepEqual(h.keys(), ["ArrowRight"], "right stick navigates when the left stick is centred")`.
- Assertion 1357–1357: `assert.deepEqual(h.keys(), ["ArrowDown"], "a new UiLayers.top() re-seeds (title→select, Start→pause)")`.
- Assertion 1364–1364: `assert.equal(clicked, 0, "A on a focused range does not click it")`.
- Assertion 1365–1365: `assert.deepEqual(h.keys(), [], "…and does not seed either")`.
- Assertion 1369–1369: `assert.equal(clicked, 1, "A on a focused button activates it")`.
- Assertion 1374–1374: `assert.deepEqual(h.keys(), [], "a layer that still has a focused control is not re-seeded")`.
- Assertion 1377–1377: `assert.deepEqual(h.keys(), ["ArrowDown"], "reopening the same layer with nothing focused seeds again")`.
- Assertion 1382–1382: `assert.equal(typeof sbU.UiLayers.navOpen, "function", "title #overlay is pad-navigable through UiLayers.navOpen()")`.
- Assertion 1383–1383: `assert.equal(sbU.UiLayers.navOpen(), false, "nothing open on a bare DOM")`.
- Assertion 1386–1387: `assert.match(code("js/ui/menu-nav.js"), /return !!CARET_KEYS\[key\]/, "inputs own only the caret keys (Left/Right/Home/End) so Up/Down leave the row")`.
- Assertion 1388–1389: `assert.match(code("js/ui/aria-state.js"), /#vsfriend,\s*#season-setup/, "AriaState watches the two DOM-built overlays UiLayers already lists")`.
- Assertion 1390–1391: `assert.match(code("js/ui/aria-state.js"), /const ON = \["active", "on"\]/, "menu .active and leftover .on both announce as pressed")`.
- Assertion 1392–1393: `assert.match(code("js/ui/aria-state.js"), /hashchange/, "term-rail aria-current follows location.hash")`.
- Assertion 1397–1397: `assert.equal(wrap("HUD: ON"), "HUD:\u00a0<span data-fold=\"on\">ON</span>")`.
- Assertion 1398–1398: `assert.equal(wrap("HALO: OFF"), "HALO:\u00a0<span data-fold=\"off\">OFF</span>")`.
- Assertion 1399–1399: `assert.equal(wrap("♪ SOUND OFF"), "♪ SOUND <span data-fold=\"off\">OFF</span>")`.
- Assertion 1400–1400: `assert.equal(wrap("ON"), '<span data-fold="on">ON</span>')`.
- Assertion 1403–1405: `assert.equal(wrap('#7 ON <img src=x onerror="alert(1)">'), '#7 <span data-fold="on">ON</span> &lt;img src=x onerror=&quot;alert(1)&quot;&gt;', "button text is escaped before the ON/OFF spans are added")`.
- Assertion 1406–1406: `assert.equal(wrap("R&D: ON"), 'R&amp;D:\u00a0<span data-fold="on">ON</span>', "a literal & survives the round trip")`.
- Assertion 1407–1407: `assert.equal(wrap("STYLE: STANDARD"), null, "named styles stay unpainted")`.
- Assertion 1408–1408: `assert.equal(wrap("LAYOUT: AUTO"), null, "AUTO on a named cycle is not agency")`.
- Assertion 1409–1409: `assert.equal(wrap("RESOLUTION: AUTO"), null)`.
- Assertion 1412–1412: `assert.equal(wrap("GEARS: AUTO"), null, "no AUTO/MANUAL agency colour any more")`.
- Assertion 1413–1413: `assert.equal(wrap("ACTIVE AERO: MANUAL"), null)`.
- Assertion 1414–1415: `assert.match(code("js/ui/aria-state.js"), /classList\.contains\("opt-btn"\)\) continue/, "paintOnOff skips .opt-btn chips — colour words are readouts, not controls")`.
- Assertion 1416–1416: `assert.equal(wrap("STEER: TILT"), null)`.
- Assertion 1417–1417: `assert.equal(wrap("♪ SOUND ON"), "♪ SOUND <span data-fold=\"on\">ON</span>")`.
- Assertion 1418–1418: `assert.equal(wrap("REPEAT: OFF"), "REPEAT:\u00a0<span data-fold=\"off\">OFF</span>")`.
- Assertion 1419–1419: `assert.equal(wrap("UNLIMITED · ON"), "UNLIMITED ·\u00a0<span data-fold=\"on\">ON</span>")`.
- Assertion 1420–1420: `assert.equal(wrap("UNLIMITED · OFF"), "UNLIMITED ·\u00a0<span data-fold=\"off\">OFF</span>")`.
- Assertion 1421–1421: `assert.equal(wrap("∞ FREE BUILD: ON"), "∞ FREE BUILD:\u00a0<span data-fold=\"on\">ON</span>")`.
- Assertion 1422–1422: `assert.equal(wrap("QUALIFYING LAP · ON"), "QUALIFYING LAP ·\u00a0<span data-fold=\"on\">ON</span>")`.
- Assertion 1423–1423: `assert.equal(wrap("5 LAPS"), null, "option-group chips that are not ON/OFF stay unpainted")`.
- Assertion 1439–1439: `assert.equal(a2.getAttribute("aria-current"), "true", "matching term-rail hash is current")`.
- Assertion 1440–1440: `assert.equal(a1.getAttribute("aria-current"), null, "other term-rail links are not current")`.
- Assertion 1443–1443: `assert.equal(a1.getAttribute("aria-current"), "true")`.
- Assertion 1444–1444: `assert.equal(a2.getAttribute("aria-current"), null)`.
- Assertion 1452–1452: `assert.equal(one.getAttribute("aria-pressed"), "true")`.
- Assertion 1453–1453: `assert.equal(two.getAttribute("aria-pressed"), "false")`.
- Assertion 1456–1456: `assert.equal(one.getAttribute("aria-pressed"), "false", "managed toggle updates after first paint")`.
- Assertion 1457–1457: `assert.equal(two.getAttribute("aria-pressed"), "true", "new selection is announced")`.
- Assertion 1458–1459: `assert.match(code("js/ui/scroll-fade.js"), /"#menu-buttons"/, "title chrome fade watches the zoomed #menu-buttons scroller")`.
- Assertion 1460–1461: `assert.match(code("js/ui/scroll-fade.js"), /\boverflowX\b/, "sideways strips get .sf-l / .sf-r, not only overflow-y thumbs")`.

#### `AriaState re-syncs only the root a mutation landed in` (1467–1492)

Fixtures: `uiSandbox`. Exercised targets: `js/ui/aria-state.js`.

Tool entry points: `constructor → function Object() { [native code] }`.

Case-local fixture/setup bindings (including action results): `dom` 1468–1468; `mk` 1469–1474; `g` 1470–1470; `a` 1471–1471; `b` 1471–1471; `[o1, o2]` 1475–1475; `[c1, c2]` 1475–1475; `observers` 1476–1476; `sb` 1477–1477; `flush` 1478–1478; `over` 1484–1484.

- Assertion 1480–1480: `assert.ok(observers.length >= 2, "one observer per observed root")`.
- Assertion 1481–1481: `assert.equal(c1.getAttribute("aria-pressed"), "true")`.
- Assertion 1487–1487: `assert.equal(o2.getAttribute("aria-pressed"), "true", "the root that changed is re-synced")`.
- Assertion 1488–1488: `assert.equal(c2.getAttribute("aria-pressed"), "false", "a root with no records is left alone until its own change")`.
- Assertion 1491–1491: `assert.equal(c2.getAttribute("aria-pressed"), "true")`.

#### `AriaState scopes slider and option changes while discovering rebuilt groups` (1494–1535)

Fixtures: `uiSandbox`. Exercised targets: `js/ui/aria-state.js`.

Tool entry points: `constructor → function Object() { [native code] }`.

Case-local fixture/setup bindings (including action results): `dom` 1495–1495; `root` 1495–1495; `label` 1496–1496; `slider` 1496–1496; `out` 1496–1496; `group` 1499–1499; `a` 1499–1499; `b` 1499–1499; `observers` 1501–1501; `sb` 1502–1502; `observer` 1504–1504; `flush` 1505–1505; `rootQueries` 1506–1506; `labelQueries` 1506–1506; `ariaWrites` 1506–1506; `queryRoot` 1507–1507; `queryLabel` 1507–1507; `set` 1507–1507; `before` 1522–1522; `added` 1530–1530; `c` 1530–1530; `d` 1530–1530.

- Assertion 1514–1514: `assert.equal(slider.getAttribute("aria-valuetext"), "90%")`.
- Assertion 1515–1515: `assert.equal(rootQueries, 0, "a slider readout does not scan its whole settings root")`.
- Assertion 1516–1516: `assert.equal(b.getAttribute("aria-pressed"), "false", "unrelated option groups wait for their own records")`.
- Assertion 1518–1518: `assert.equal(a.getAttribute("aria-pressed"), "false")`.
- Assertion 1518–1518: `assert.equal(b.getAttribute("aria-pressed"), "true")`.
- Assertion 1521–1521: `assert.equal(ariaWrites, 0, "an unchanged selection makes no redundant ARIA writes")`.
- Assertion 1528–1528: `assert.equal(slider.getAttribute("aria-valuetext"), "100%")`.
- Assertion 1528–1528: `assert.equal(a.getAttribute("aria-pressed"), "true")`.
- Assertion 1529–1529: `assert.equal(labelQueries - before, 4, "one coalesced semantic pass handles both readout records")`.
- Assertion 1533–1533: `assert.equal(c.getAttribute("aria-pressed"), "true")`.
- Assertion 1533–1533: `assert.equal(d.getAttribute("aria-pressed"), "false")`.
- Assertion 1534–1534: `assert.equal(rootQueries, 4, "unknown structural changes retain one full discovery pass")`.

#### `dense sheets preserve a functional content height at extreme UI size` (1537–1570)

Fixtures: `bootSheetShape`. Exercised targets: `js/ui/sheet-shape.js`, `css/components.css`, `css/carsetup.css`, `css/menus.css`, `css/career.css`, `css/overlays.css`.

Case-local fixture/setup bindings (including action results): `h` 1541–1541; `s` 1542–1542; `nofit` 1551–1551; `components` 1555–1555; `garage` 1556–1556; `menus` 1557–1557; `fitAt` 1560–1560; `vsTwo` 1566–1566.

- Assertion 1544–1544: `assert.equal(s.el.dataset.fit, "on", "400 px of host cannot hold 300 px × 200%")`.
- Assertion 1545–1545: `assert.equal(s.el.style.getPropertyValue("--sheet-scale"), "1.333", "capped to available / --fit-at")`.
- Assertion 1546–1546: `assert.equal(s.host.style.getPropertyValue("--sheet-eff-scale"), "1.333", "the host mirrors the effective scale for siblings")`.
- Assertion 1548–1548: `assert.equal(s.el.dataset.fit, "off", "a tall enough host lifts the cap")`.
- Assertion 1549–1549: `assert.equal(s.el.style.getPropertyValue("--sheet-scale"), "", "…and removes the inline override")`.
- Assertion 1550–1550: `assert.equal(s.host.style.getPropertyValue("--sheet-eff-scale"), "")`.
- Assertion 1553–1553: `assert.equal(nofit.el.dataset.fit, undefined, "a sheet without --fit-at is never fit-managed")`.
- Assertion 1558–1558: `assert.ok(components.some((r) => r.decls.get("zoom") === "var(--sheet-scale, var(--ui-scale))"), "sheets zoom by the capped scale")`.
- Assertion 1559–1559: `assert.equal(decl(components, ".sheet > :where(.sheet-head, .sheet-body, .sheet-foot)", "min-width"), "0")`.
- Assertion 1561–1561: `assert.ok(fitAt(garage, /^#cs-inner/).includes("340px") && fitAt(garage, /^#cs-inner/).includes("240px"), "garage declares tall/wide --fit-at")`.
- Assertion 1562–1562: `assert.ok(fitAt(components, /^#pmsettings-inner/).includes("300px") && fitAt(components, /^#pmsettings-inner/).includes("220px"))`.
- Assertion 1563–1563: `assert.ok(fitAt(components, /^#vsfriend-inner/).includes("280px"))`.
- Assertion 1564–1564: `assert.ok(fitAt(css("css/career.css"), /^#cr-inner/).includes("300px") && fitAt(css("css/career.css"), /^#cr-inner/).includes("220px"))`.
- Assertion 1565–1565: `assert.ok(fitAt(menus, /^#ss-inner/).includes("300px") && fitAt(menus, /^#ss-inner/).includes("220px"), "#ss-inner wide-shape fit-at 220px")`.
- Assertion 1567–1567: `assert.ok(vsTwo.length, "VS Friend columns key on the sheet's wide shape, not a 620px container guess")`.
- Assertion 1568–1569: `assert.ok(!declares(menus, '#sel-inner[data-fit="on"] #sel-preview-map', "display", "none"), "zoomed / data-fit SELECT keeps the map; caps bind instead of hiding it")`.

#### `garage preview chips hug the sheet and season quali is a label` (1572–1611)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/carsetup.css`, `js/race/race-settings.js`, `js/audio/spotify.js`, `css/menus.css`.

Case-local fixture/setup bindings (including action results): `garage` 1573–1573; `raceSettings` 1574–1574; `spotify` 1575–1575; `stackBase` 1581–1581; `portraitStack` 1583–1583; `menus` 1598–1598.

- Assertion 1576–1576: `assert.equal(decl(garage, "#cs-stack", "left"), "auto")`.
- Assertion 1577–1577: `assert.equal(decl(garage, "#cs-stack", "width"), "max-content")`.
- Assertion 1582–1582: `assert.ok(stackBase.length && !stackBase.some((r) => /calc\(var\(--safe-l\)/.test(r.decls.get("left") \|\| "")))`.
- Assertion 1584–1585: `assert.ok(portraitStack.some((r) => r.decls.get("grid-row") === "2" && r.decls.get("position") === "static" && r.decls.get("width") === "100%"), "portrait reserves a full-width camera row outside the sheet footer")`.
- Assertion 1586–1587: `assert.ok(rulesFor(garage, "#carsetup", { context: /orientation: portrait/ }).some((r) => r.decls.get("grid-template-rows") === "minmax(0, 1fr) auto"), "portrait leaves the camera row intrinsic height and lets the sheet yield")`.
- Assertion 1592–1592: `assert.match(raceSettings, /SettingRow\.disable\("rs-quali", !!qForced\)/)`.
- Assertion 1593–1593: `assert.match(raceSettings, /qForced \? \[\["quali", "QUALIFYING"\]\]/)`.
- Assertion 1594–1594: `assert.match(raceSettings, /PRACTICE SETTINGS/, "Practice setup is not titled RACE SETTINGS")`.
- Assertion 1595–1595: `assert.match(raceSettings, /START TIME TRIAL/, "Time Trial GO is not START RACE")`.
- Assertion 1596–1596: `assert.match(raceSettings, /wrap:\s*false/, "LAPS chevrons stop at the ends")`.
- Assertion 1597–1597: `assert.match(raceSettings, /\[\["tier", "PACE ORDER"\], \["quali", "QUALIFYING"\]/)`.
- Assertion 1601–1601: `assert.equal(decl(menus, /#rs-body$/, "display"), "grid")`.
- Assertion 1602–1602: `assert.equal(decl(menus, /#rs-body$/, "overflow-y"), "auto", "roomy race settings scroll within the body")`.
- Assertion 1603–1604: `assert.ok(rulesFor(menus, /^#rs-body$/, { context: /@container sheet \(min-width: 640px\)/ }).some((r) => /1fr\) minmax\(0, 1fr\)$/.test(r.decls.get("grid-template-columns") \|\| "")), "two columns once the sheet is wide")`.
- Assertion 1605–1605: `assert.equal(rulesFor(menus, /#rs-/).filter((r) => r.decls.has("grid-row")).length, 0, "no per-section grid-row placement")`.
- Assertion 1606–1606: `assert.equal(decl(menus, '#race-settings > .sheet:is([data-density="compact"], [data-shape="tall"])', "overflow-y"), "auto")`.
- Assertion 1607–1607: `assert.equal(decl(menus, '#race-settings > .sheet:is([data-density="compact"], [data-shape="tall"]) > #rs-body', "overflow"), "visible")`.
- Assertion 1608–1608: `assert.equal(decl(menus, "#race-settings > .sheet", "--compact-at"), "260px")`.
- Assertion 1609–1609: `assert.match(spotify, /settings\.hidden\s*=\s*true\b/)`.
- Assertion 1610–1610: `assert.match(spotify, /settings\.hidden\s*=\s*false\b/)`.

#### `backup settings use the same page, focus and BACK behavior as other settings` (1645–1659)

Fixtures: `bootSettingsNav`. Exercised targets: `js/ui/settings-tabs.js`.

Case-local fixture/setup bindings (including action results): `h` 1646–1646.

- Assertion 1648–1648: `assert.equal(h.title().textContent, "SETTINGS › SAVES & DATA")`.
- Assertion 1649–1649: `assert.equal(h.panel("files").hidden, false)`.
- Assertion 1650–1650: `assert.equal(h.panel("display").hidden, true)`.
- Assertion 1651–1651: `assert.equal(h.dom.document.activeElement, h.filesFirst)`.
- Assertion 1652–1652: `assert.equal(h.selected(), 1)`.
- Assertion 1653–1653: `assert.equal(h.nav.back(), false)`.
- Assertion 1654–1654: `assert.equal(h.panel("files").hidden, true)`.
- Assertion 1655–1655: `assert.equal(h.dom.document.activeElement, h.door("files"))`.
- Assertion 1658–1658: `assert.equal(h.panel("files").hidden, true, "reopening settings starts at home")`.

#### `Settings index Driving aids keeps its own subtitle without progress badges` (1661–1689)

Fixtures: `uiSandbox`. Exercised targets: `js/ui/settings-tabs.js`.

Case-local fixture/setup bindings (including action results): `dom` 1665–1665; `sb` 1666–1670; `index` 1672–1672; `id` 1673–1673; `drv` 1675–1675; `small` 1676–1676; `coach` 1680–1680; `nav` 1683–1683; `once` 1684–1684.

Fixture iteration domains: `for (const id of ["pm-open-controls", "pm-open-driving", "pm-open-display", "pm-open-appearance", "pm-open-a11y", "pm-audio", "pm-open-files", "pm-open-graphics", "pm-open-visual", "pm-open-progress"])`.

- Assertion 1685–1685: `assert.equal(once, "Presets, assistance, gears & coaching")`.
- Assertion 1688–1688: `assert.equal(small.textContent, once, "progress badges stay outside Driving aids")`.

#### `title settings, pause standings, and career modes stay reachable` (1691–2243)

Fixtures: `bootSettingsNav`, `gameCode`, `readGameEntry`. Exercised targets: `js/ui/settings-tabs.js`, `js/game.js`, `js/race/race-settings.js`, `css/career.css`, `css/race-setup.css`, `css/components.css`, `css/menus.css`, `js/perf/renderer-picker.js`, `css/tuner.css`, `css/settings-controls.css`, `css/career-experience.css`, `css/settings.css`, `js/input/steer-tuning.js`, `js/audio/panel.js`, `js/camera/cockpit-opts.js`, `js/perf/metrics-overlay.js`, `css/tokens.css`, `css/`, `css/overlays.css`, `css/carsetup.css`, `css/dialogs.css`, `js/garage/setup-experiments.js`, `css/hud.css`, `js/ui/select-screen.js`, `js/ui/results-sheet.js`, `js/ui/experience.js`, `js/ui/title-flow.js`.

Case-local fixture/setup bindings (including action results): `h` 1694–1694; `game` 1734–1734; `raceSettings` 1743–1743; `wideSel` 1767–1767; `dispAreas` 1773–1773; `componentsSrc` 1782–1782; `html` 1803–1803; `at` 1803–1803; `fold` 1804–1804; `sel` 1845–1845; `settingsHtml` 1874–1874; `adv` 1875–1875; `musicAt` 1876–1876; `music` 1877–1877; `controls` 1880–1880; `driving` 1881–1881; `musicSum` 1891–1891; `presetGrid` 1934–1935; `fullRow` 1940–1941; `hubGrid` 1974–1975; `comp` 2029–2029; `id` 2040–2040; `f` 2047–2047; `vsDlg` 2118–2118; `selectJs` 2185–2185; `resultsJs` 2199–2199; `shell` 2205–2205; `titleFlow` 2219–2219; `settingsIndex` 2231–2231; `pause` 2235–2235.

Fixture iteration domains: `for (const sel of [/:is\(#pmsettings-inner \.pm-group[^)]*\) details > summary,/, /#rs-body details > summary/])`; `for (const id of ["pm-steer", "pm-gears", "pm-aero", "pm-res", "pm-feel", "pm-helplevel", "pm-linemode", "sp-shuffle", "sp-repeat"])`; `for (const f of ["components", "menus", "tuner", "data", "carsetup", "overlays", "career"])`.

- Assertion 1695–1695: `assert.deepEqual(Object.keys(h.nav).sort(), ["back", "current", "invalidate", "returnToSearch", "show", "showCurrent", "showDirect"])`.
- Assertion 1696–1696: `assert.equal(h.nav.returnToSearch(), false, "without an active search, returning is a harmless home navigation")`.
- Assertion 1697–1697: `assert.equal(h.index().hidden, false, "create() shows the door index")`.
- Assertion 1698–1698: `assert.equal(h.panel("controls").hidden, true)`.
- Assertion 1699–1699: `assert.equal(h.panel("display").hidden, true)`.
- Assertion 1700–1700: `assert.equal(h.title().textContent, "SETTINGS")`.
- Assertion 1701–1701: `assert.equal(h.dom.document.activeElement, null, "create() does not steal focus")`.
- Assertion 1703–1703: `assert.equal(h.panel("controls").hidden, false)`.
- Assertion 1704–1704: `assert.equal(h.index().hidden, true)`.
- Assertion 1705–1705: `assert.equal(h.title().textContent, "SETTINGS › CONTROLS")`.
- Assertion 1706–1706: `assert.equal(h.dom.document.activeElement, h.firstControl, "show(id, true) focuses the first visible page control")`.
- Assertion 1709–1709: `assert.equal(h.index().hidden, false, "showCurrent() always returns home")`.
- Assertion 1710–1710: `assert.equal(h.panel("controls").hidden, true)`.
- Assertion 1711–1711: `assert.equal(h.dom.document.activeElement, null, "showCurrent() never focuses")`.
- Assertion 1714–1714: `assert.equal(h.dom.document.activeElement, h.firstControl, "a door focuses the visible page after its callback")`.
- Assertion 1715–1715: `assert.equal(h.nav.back(), false, "BACK on a page pops to home")`.
- Assertion 1716–1716: `assert.equal(h.dom.document.activeElement, h.door("controls"), "BACK restores the originating door")`.
- Assertion 1718–1718: `assert.equal(h.panel("advanced").hidden, false)`.
- Assertion 1719–1719: `assert.equal(h.title().textContent, "SETTINGS › CONTROLS › ADVANCED INPUT & HANDLING")`.
- Assertion 1721–1721: `assert.equal(h.panel("audio").hidden, false)`.
- Assertion 1722–1722: `assert.equal(h.title().textContent, "SETTINGS › MUSIC & SOUND")`.
- Assertion 1723–1723: `assert.equal(h.dom.document.activeElement, h.audioFirst, "audio can land on its visible disclosure door")`.
- Assertion 1726–1726: `assert.equal(h.panel("driving").hidden, false)`.
- Assertion 1727–1727: `assert.equal(h.title().textContent, "SETTINGS › DRIVING AIDS")`.
- Assertion 1728–1728: `assert.equal(h.panel("audio").hidden, true)`.
- Assertion 1729–1729: `assert.equal(h.dom.document.activeElement, h.drivingFirst, "driving focuses its first visible control")`.
- Assertion 1731–1731: `assert.equal(h.nav.back(), false, "BACK on a page pops to home")`.
- Assertion 1732–1732: `assert.equal(h.index().hidden, false)`.
- Assertion 1733–1733: `assert.equal(h.nav.back(), true, "BACK on home tells the caller to close")`.
- Assertion 1735–1736: `assert.match(game, /\$\(\s*"mb-settings"\s*\)\.onclick\s*=\s*\(\)\s*=>\s*\{\s*(?:ensureAudio\(\)\s*\.then\(\(\)\s*=>\s*\{\s*)?if\s*\(\s*soundOn\s*\)\s*GameAudio\.init\(\s*\)\s*;\s*(?:\}\s*\)\s*;\s*)?openSettings\(\s*\)/, "title Settings opens the same stack via openSettings → showCurrent")`.
- Assertion 1737–1738: `assert.match(game, /function\s+openSettings\(\s*\)\s*\{[\s\S]*?ensureAudio\(\s*\)/, "openSettings warms LAZY_AUDIO so pm-settings / MusicLib work without pointerdown")`.
- Assertion 1739–1740: `assert.doesNotMatch(game, /mb-settings"\)\.onclick[\s\S]{0,120}settingsNav\.show\(\s*"more"/, "title Settings must not force MORE")`.
- Assertion 1741–1742: `assert.match(game, /\$\(\s*"pm-settings-close"\s*\)\.onclick\s*=\s*\(\)\s*=>\s*\{\s*if\s*\(\s*settingsNav\.back\(\s*\)\s*\)\s*closeSettings\(\s*\)/, "settings BACK pops the stack before closing")`.
- Assertion 1744–1745: `assert.match(raceSettings, /els\.selGo\.onclick[\s\S]{0,400}openRaceSettings\(\s*"select"\s*\)/, "SELECT NEXT opens race settings, not the garage")`.
- Assertion 1746–1747: `assert.match(raceSettings, /\$\(\s*"sel-car"\s*\)\.onclick\s*=\s*\(\)\s*=>\s*openGarage\(\s*"select"\s*\)/, "SELECT YOUR CAR is the garage door")`.
- Assertion 1748–1749: `assert.match(game, /pmStandings\.hidden\s*=\s*!\(\s*isChampionship\(\s*\)\s*&&\s*SeasonCal\.hasProgress\(\s*season\s*\)\s*&&\s*season\.round\s*<\s*SeasonCal\.rounds\(\s*\)\s*\)/, "pause STANDINGS matches the title: hide once the season is finished")`.
- Assertion 1750–1751: `assert.match(game, /\$\(\s*"pm-restart"\s*\)\.disabled\s*=\s*!!\s*\(\s*netPlay\.active\(\s*\)\s*\\|\\|\s*qualiNet\.hasArmed\(\s*\)\s*\)/, "RESTART looks dead in net / quali-net, same gate as its click handler")`.
- Assertion 1752–1753: `assert.equal(decl(css("css/career.css"), '#cr-inner:not([data-pair="on"]):not([data-shape="tall"]):has(#cr-left .cr-slot):has(#cr-right .cr-slot) > #cr-body', "grid-template-columns"), "minmax(0, 1fr) minmax(0, 1fr)", "wide stacked modes picker is two-up; tall stacks")`.
- Assertion 1754–1755: `assert.doesNotMatch(readCssSource("css/career.css"), /-webkit-line-clamp:\s*2/, "mode intros wrap in full (no ellipsis at UI SIZE 150/200, Bryce 2026-10-17)")`.
- Assertion 1756–1757: `assert.equal(decl(css("css/race-setup.css"), "#race-settings", "--sheet-w"), "760px", "race settings spends the same safe width as settings / customize")`.
- Assertion 1758–1758: `assert.equal(decl(css("css/components.css"), "#standings", "--sheet-w"), "760px")`.
- Assertion 1759–1759: `assert.equal(decl(css("css/components.css"), "#results", "--sheet-w"), "760px")`.
- Assertion 1760–1760: `assert.equal(decl(css("css/components.css"), "#spotifypanel", "--sheet-w"), "760px")`.
- Assertion 1761–1761: `assert.equal(decl(css("css/career.css"), "#career-offers", "--sheet-w"), "760px")`.
- Assertion 1762–1762: `assert.equal(decl(css("css/career.css"), "#career-history", "--sheet-w"), "760px")`.
- Assertion 1763–1763: `assert.equal(decl(css("css/career.css"), "#quali", "--sheet-w"), "760px")`.
- Assertion 1764–1764: `assert.equal(decl(css("css/career.css"), "#career-guide", "--sheet-w"), "760px")`.
- Assertion 1768–1768: `assert.ok(wideSel, "wide SELECT arranges the hero grid in a container query")`.
- Assertion 1769–1769: `assert.equal(wideSel.decls.get("grid-template-columns"), "minmax(0, 3fr) minmax(0, 2fr)")`.
- Assertion 1770–1771: `assert.equal(decl(css("css/menus.css"), "#sel-track-preview", "grid-template-columns"), "minmax(0, 1fr)", "narrow SELECT stacks the still over the numbers")`.
- Assertion 1772–1772: `assert.equal(decl(css("css/menus.css"), "#sel-still", "object-fit"), "cover")`.
- Assertion 1774–1775: `assert.match(dispAreas, /^"hudopts hudopts"[\s\S]*"metrics metrics"/, "DISPLAY opens on HUD, then METRICS and RENDERER (UI SIZE moved to APPEARANCE › READABILITY)")`.
- Assertion 1776–1776: `assert.doesNotMatch(dispAreas, /uih\|uis/, "no hole left for UI SIZE")`.
- Assertion 1777–1778: `assert.equal(decl(css("css/components.css"), '#pmsettings-inner[data-shape="wide"] #pm-panel-display #pm-hud-details', "grid-area"), "hudopts", "HUD fold is its own row, not under a reprint HUD heading")`.
- Assertion 1779–1779: `assert.doesNotMatch(dispAreas, /renopts\|visual/, "Graphics and Visual Studio no longer reserve empty HUD grid rows")`.
- Assertion 1780–1781: `assert.match(read("index.html"), /id="pm-visual-tuners" class="pm-renderer-sub"/, "ADVANCED VISUALS joins the same compact Display fold family as RENDERER")`.
- Assertion 1783–1785: `assert.match(componentsSrc, /:is\(#pmsettings-inner \.pm-group\) details > summary[\s\S]*?background-color:\s*transparent;[\s\S]*?border:\s*none;/, "ADVANCED VISUALS shares the borderless transparent summary rule")`.
- Assertion 1786–1787: `assert.match(componentsSrc, /:is\(#pmsettings-inner \.pm-group\) details > summary::after,\s*\n#rs-body details > summary::after \{ content: none; \}/)`.
- Assertion 1788–1790: `assert.match(componentsSrc, /:is\(#pmsettings-inner \.pm-group\) details > summary::before,\s*\n#rs-body details > summary::before \{ content: "\\25BE";/, "all four Display folds put the chevron before the label")`.
- Assertion 1791–1791: `assert.doesNotMatch(read("index.html"), /id="pm-hud-h"/)`.
- Assertion 1792–1792: `assert.doesNotMatch(read("index.html"), /id="pm-renderer-h"/)`.
- Assertion 1793–1793: `assert.match(read("index.html"), /id="pm-hud-details"[\s\S]*id="pm-hudscale"/)`.
- Assertion 1794–1794: `assert.match(read("index.html"), /id="pm-display-adv-body"[\s\S]*id="pm-res"/)`.
- Assertion 1795–1796: `assert.equal(decl(css("css/components.css"), '#pmsettings-inner[data-shape="wide"] #pm-panel-display #pm-metrics-details', "grid-area"), "metrics", "METRICS sits on its own DISPLAY row, not beside HUD")`.
- Assertion 1797–1799: `assert.match(decl(css("css/components.css"), "#pm-hud-sample::before", "content") \|\| "", /SIZE PREVIEW/, "SPEED 312 keeps its preview caption — compact used to hide it and the box read as a live readout")`.
- Assertion 1805–1806: `assert.ok(at >= 0 && fold.includes('id="pm-hud-sample"'), "HUD SIZE preview lives in the HUD fold, not on the DISPLAY sheet")`.
- Assertion 1810–1811: `assert.equal(decl(css("css/components.css"), /:is\(#pmsettings-inner \.pm-group[^)]*\) details > summary,/, "min-height"), "var(--chip-h)", "every Display summary is a compact row, slightly shorter than a full --tap door")`.
- Assertion 1816–1818: `assert.match(decl(css("css/components.css"), "#pm-hud-sample::after", "--pad") \|\| "", /var\(--hud-btn-scale\) \/ var\(--hud-scale\)/, "the button pad previews BUTTON SIZE relative to HUD SIZE")`.
- Assertion 1819–1820: `assert.match(read("index.html"), /id="pm-hudscale"[\s\S]*id="pm-btnscale"/, "BUTTON SIZE follows HUD SIZE in the HUD fold")`.
- Assertion 1821–1822: `assert.equal(decl(css("css/components.css"), /#pm-metrics-details > \[role="group"\]/, "display"), "flex", "METRICS body is a quiet column — not a 2-up plate grid")`.
- Assertion 1823–1824: `assert.equal(decl(css("css/components.css"), /#pmsettings-inner #pm-metrics-details > \[role="group"\] > button/, "background"), "transparent", "METRICS inner rows drop plate chrome")`.
- Assertion 1825–1826: `assert.equal(decl(css("css/components.css"), "#pm-panel-display .tune-label b", "color"), "var(--text)", "DISPLAY slider values are text, not tuner red")`.
- Assertion 1827–1828: `assert.equal(decl(css("css/components.css"), "#pm-panel-display .tune-row input[type=\"range\"]", "accent-color"), null, "DISPLAY sliders inherit the shared red accent — no steel override")`.
- Assertion 1829–1830: `assert.match(code("js/perf/renderer-picker.js"), /pm-display-adv/, "DISPLAY recovery / screenshot / diag land in the RENDERER fold")`.
- Assertion 1831–1832: `assert.match(read("index.html"), /id="pm-display-adv"/, "the RENDERER fold is the shell host; RESET / shots still inject into its body")`.
- Assertion 1833–1834: `assert.equal(decl(css("css/components.css"), '#pmsettings-inner[data-shape="wide"] #pm-panel-display > details', "grid-column"), "1 / -1", "every present and future Display disclosure spans the wide grid")`.
- Assertion 1835–1836: `assert.equal(decl(css("css/components.css"), '#pmsettings-inner[data-shape="wide"] #pm-panel-display', "grid-auto-flow"), "dense", "GRAPHICS packs beside RESOLUTION after the spanning renderer row")`.
- Assertion 1843–1844: `assert.equal(decl(css("css/components.css"), /:is\(#pmsettings-inner \.pm-group[^)]*\) details > summary,/, "min-height"), "var(--chip-h)", "every fold summary matches the HUD / METRICS chip row")`.
- Assertion 1846–1846: `assert.equal(decl(css("css/components.css"), sel, "height"), "auto", "fold summaries wrap instead of clipping their readout at 150%")`.
- Assertion 1847–1847: `assert.equal(decl(css("css/components.css"), sel, "flex-wrap"), "wrap")`.
- Assertion 1849–1850: `assert.equal(decl(css("css/components.css"), '#pmsettings-inner details > summary [data-fold]', "white-space"), "nowrap", "a summary breaks between readout words, never inside TILT 6")`.
- Assertion 1853–1854: `assert.equal(decl(css("css/components.css"), "#pm-display-adv-body, #pm-visual-tuners-body", "display"), "flex", "Display disclosure bodies default to columns; wide/compact override to grids")`.
- Assertion 1855–1856: `assert.equal(decl(css("css/components.css"), /#pmsettings-inner\[data-density="compact"\] :is\(#pm-display-adv-body, #pm-visual-tuners-body\)/, "display"), "grid", "compact ADVANCED packs 2-up via SheetShape density, not a height media")`.
- Assertion 1857–1858: `assert.equal(decl(css("css/components.css"), "#pmsettings-inner #pm-display-adv-body > :is(#pm-screenshots, #pm-save-shot, #pm-copy-diag)", "background"), "transparent", "SCREENSHOTS / SAVE / COPY DIAG are secondary rows, not peer plates of RESET")`.
- Assertion 1859–1860: `assert.equal(decl(css("css/components.css"), "#pmsettings-inner #pm-display-adv-body > :is(#pm-screenshots, #pm-save-shot, #pm-copy-diag, #pm-gfx-status, .set-row, .adv-help)", "grid-column"), "1 / -1", "capture rows always span so SAVE cannot sit in the empty THREE PATH cell")`.
- Assertion 1861–1862: `assert.doesNotMatch(read("index.html"), /<h3 class="pm-group-h">(?:DRIVING CONTROLS\|DISPLAY\|APPEARANCE\|ADVANCED INPUT &amp; HANDLING\|MUSIC &amp; SOUND)<\/h3>/, "page titles are not duplicated by hidden headings")`.
- Assertion 1863–1864: `assert.equal(decl(css("css/components.css"), /:is\(#pmsettings-inner \.pm-group[^)]*\) details > summary,/, "color"), "var(--text)", "HUD / METRICS / RENDERER names are disclosure headings, not button plates")`.
- Assertion 1865–1866: `assert.equal(decl(css("css/components.css"), /:is\(#pmsettings-inner \.pm-group\) details > summary/, "opacity"), "1", ".adv-more-btn ships at 0.85 — pin full opacity so the folds stay readable")`.
- Assertion 1867–1868: `assert.equal(decl(css("css/components.css"), /:is\(#pmsettings-inner \.pm-group\) details > summary/, "background-color"), "transparent", "fold summaries drop the plate so they do not copy HALO / TURN CHASING")`.
- Assertion 1869–1870: `assert.equal(decl(css("css/components.css"), /:is\(#pmsettings-inner \.pm-group\) details > summary::after/, "content"), "none", "right-side chevron is the dropdown mark — disclosures do not use it")`.
- Assertion 1871–1873: `assert.match(decl(css("css/components.css"), /:is\(#pmsettings-inner \.pm-group\) details > summary::before/, "content") \|\| "", /25BE/, "disclosure chevron sits on the left, like a tree, not a select")`.
- Assertion 1878–1878: `assert.doesNotMatch(adv, /class="adv-intro"/, "STEERING drops the tutorial wall — How to Play covers it")`.
- Assertion 1879–1879: `assert.match(adv, /id="pm-pace-h"/, "OVERALL SPEED is a UI SIZE heading, not a buried slider")`.
- Assertion 1882–1882: `assert.match(controls, /id="adv-feel-details"/)`.
- Assertion 1883–1883: `assert.match(driving, /id="adv-aids-details"/)`.
- Assertion 1884–1884: `assert.match(controls, /id="adv-feel-details"[\s\S]*id="pm-tiltsimple"/)`.
- Assertion 1885–1885: `assert.match(driving, /id="adv-aids-details"[\s\S]*id="pm-helplevel" class="set-row"/)`.
- Assertion 1886–1886: `assert.doesNotMatch(adv, /<details[^>]+open/, "STEERING folds start closed")`.
- Assertion 1887–1887: `assert.match(music, /id="as-music-sum"/)`.
- Assertion 1888–1888: `assert.match(music, /id="as-sound-sum"/)`.
- Assertion 1889–1889: `assert.doesNotMatch(music, /id="as-music-details"[^>]*\sopen/, "MUSIC starts closed like DISPLAY")`.
- Assertion 1890–1890: `assert.doesNotMatch(music, /id="as-sound-details"[^>]*\sopen/, "SOUND starts closed like DISPLAY")`.
- Assertion 1892–1892: `assert.ok(musicSum && !/as-music-sel/.test(musicSum[0]), "MUSIC ON/OFF lives in the fold body")`.
- Assertion 1893–1893: `assert.match(music, /id="as-music" class="set-row"/, "MUSIC is a setting row (js/ui/setting-row.js)")`.
- Assertion 1894–1894: `assert.match(music, /id="as-sound" class="set-row"/)`.
- Assertion 1895–1895: `assert.match(music, /id="as-src" class="set-row"/, "the music SOURCE is a setting row, not four chips")`.
- Assertion 1896–1896: `assert.match(music, /id="as-p" class="set-row"/, "the engine PROFILE is a setting row")`.
- Assertion 1897–1897: `assert.doesNotMatch(music, /class="as-head"/, "music summaries reuse adv-more-btn, not a second head family")`.
- Assertion 1898–1899: `assert.equal(decl(css("css/components.css"), /:is\(#pmsettings-inner \.pm-group, #rs-body\) details > summary/, "color"), "var(--text)", "STEERING folds use the same disclosure chrome as DISPLAY")`.
- Assertion 1900–1900: `assert.equal(decl(css("css/components.css"), /:is\(#pmsettings-inner \.pm-group\) details > summary::after/, "content"), "none")`.
- Assertion 1901–1903: `assert.match(decl(css("css/tuner.css"), /#pmsettings-inner #audioset \.as-sec > summary::before/, "content") \|\| "", /25BE/, "MUSIC fold chevron sits on the left")`.
- Assertion 1904–1905: `assert.equal(decl(css("css/tuner.css"), /#pmsettings-inner #audioset \.as-sec > summary,/, "color"), "var(--text)", "MUSIC fold names use --text, not steel italic")`.
- Assertion 1906–1907: `assert.equal(decl(css("css/tuner.css"), /#pmsettings-inner #audioset \.as-sec$/, "border-bottom"), "1px solid var(--card-line)", "MUSIC & SOUND rules sit on the fold at full width, not a fading --grad-rule")`.
- Assertion 1908–1909: `assert.equal(decl(css("css/tuner.css"), /#pmsettings-inner #audioset-inner,/, "width"), "100%", "MUSIC & SOUND folds stretch to the sheet, not shrink to the summary text")`.
- Assertion 1910–1911: `assert.match(read("index.html"), /id="pm-calib"[^>]*>[\s\S]*?id="pm-calib-help"/, "TILT recalibrate help sits on the button, not under RESET DOCK LAYOUT")`.
- Assertion 1912–1913: `assert.match(read("css/settings-controls.css"), /body\.desktop #pm-calib-help/, "desktop hides the TILT help with RECALIBRATE TILT")`.
- Assertion 1916–1917: `assert.ok(!decl(css("css/settings-controls.css"), "#pm-calib:disabled + #pm-calib-help", "visibility"), "disabled TILT help stays visible: it is the reason RECALIBRATE is grey")`.
- Assertion 1918–1919: `assert.equal(decl(css("css/settings-controls.css"), "#pm-calib:disabled + #pm-calib-help", "color"), "var(--dim)", "disabled TILT help dims with its button and keeps its slot")`.
- Assertion 1920–1921: `assert.equal(decl(css("css/settings-controls.css"), "#pm-calib[hidden] + #pm-calib-help", "display"), "none", "hidden RECALIBRATE also drops its described-by copy")`.
- Assertion 1922–1923: `assert.equal(decl(css("css/settings-controls.css"), "#pm-panel-controls", "padding-bottom"), "var(--tap)", "CONTROLS keeps RESET KEYS above the sheet foot at max scroll")`.
- Assertion 1924–1925: `assert.equal(decl(css("css/settings-controls.css"), "#pm-settings-body", "padding-bottom"), "calc(var(--tap) + var(--pad))", "sheet-body end padding clears BACK on Controls and Steering & Assists")`.
- Assertion 1926–1927: `assert.equal(decl(css("css/settings-controls.css"), "#pmsettings", "overflow"), "hidden", "the settings dialog is not a second page scroller")`.
- Assertion 1928–1929: `assert.equal(decl(css("css/settings-controls.css"), /#pmsettings-inner \.pm-groups,/, "overflow"), "visible", "nested settings groups defer scrolling to the sheet body")`.
- Assertion 1930–1931: `assert.equal(decl(css("css/settings-controls.css"), /#pmsettings-inner \.pm-groups > \[role="region"\] > button/, "height"), "auto", "full-row action labels size to their wrapping copy, not a --tap clip")`.
- Assertion 1932–1933: `assert.equal(decl(css("css/settings-controls.css"), "#pmsettings-inner .preset-row.balanced-row", "align-items"), "stretch", "STEERING preset cards on one line share height")`.
- Assertion 1936–1936: `assert.ok(presetGrid, "narrow settings packs preset cards 2-up")`.
- Assertion 1937–1937: `assert.equal(presetGrid.decls.get("grid-template-columns"), "repeat(2, minmax(0, 1fr))")`.
- Assertion 1938–1938: `assert.equal(presetGrid.decls.get("grid-auto-rows"), "1fr")`.
- Assertion 1939–1939: `assert.equal(presetGrid.decls.get("align-items"), "stretch")`.
- Assertion 1942–1943: `assert.equal(fullRow && fullRow.decls.get("grid-column"), "1 / -1", "narrow wide-shape action buttons take the full row")`.
- Assertion 1944–1945: `assert.equal(decl(css("css/career.css"), /#cr-inner\[data-pair="on"\] #cr-left,/, "scrollbar-width"), "none", "NEW CAREER columns keep the themed .sf-scroll thumb only")`.
- Assertion 1946–1947: `assert.equal(decl(css("css/career.css"), "#cr-career-file", "flex-direction"), "column", "LOAD CAREER FILE confirm stays stacked — no wrap jump off the pointer")`.
- Assertion 1948–1949: `assert.equal(decl(css("css/career.css"), "#cr-career-load", "min-height"), "calc(var(--tap-paint) * 2)", "armed OVERWRITE copy fits the reserved LOAD height")`.
- Assertion 1950–1951: `assert.equal(decl(css("css/career.css"), ".cr-slot-main", "grid-column"), "1 / -1", "SLOT 1 copy keeps the full card; EXPORT / IMPORT / DELETE sit underneath")`.
- Assertion 1952–1953: `assert.equal(decl(css("css/career.css"), /#cr-inner:not\(\[data-pair="on"\]\) #cr-left,/, "max-width"), "100%", "stacked #cr-left cannot grow past the sheet (phone overflow ~370px)")`.
- Assertion 1954–1955: `assert.equal(decl(css("css/career.css"), /#cr-nextrace img,/, "max-width"), "100%", "next-race still is capped; align-items:flex-start used to take the 800px intrinsic width")`.
- Assertion 1956–1957: `assert.equal(decl(css("css/career.css"), /^\.cr-nextrace$/, "align-items"), "stretch", "nextrace card stretches so the still fills the column width")`.
- Assertion 1958–1959: `assert.equal(decl(css("css/career.css"), /#cr-inner\[data-pair="on"\] #cr-left$/, "overflow-x"), "hidden", "paired career panes do not grow a second horizontal gutter")`.
- Assertion 1960–1961: `assert.equal(decl(css("css/career.css"), /#cr-inner\[data-pair="on"\]:has\(#cr-left \.cr-slot\):has\(#cr-right \.cr-slot\) > \.sheet-foot$/, "grid-column"), "1 / -1", "CAREER MODES BACK spans both columns")`.
- Assertion 1962–1963: `assert.equal(decl(css("css/career.css"), "#cr-career-file > button", "text-transform"), "uppercase", "SAVE / LOAD / PROTECT share one uppercase plate")`.
- Assertion 1964–1965: `assert.equal(decl(css("css/career-experience.css"), /\[data-career-part="nav"\]$/, "flex-wrap"), "nowrap", "hub chips pan instead of wrapping under the title")`.
- Assertion 1966–1968: `assert.match(decl(css("css/career-experience.css"), /\[data-career-part="calendar"\]$/, "grid-template-columns") \|\| "", /auto-fill/, "season story tiles wrap in the pane instead of a clipped H strip")`.
- Assertion 1969–1971: `assert.match(decl(css("css/settings.css"), "#pmsettings", "--sheet-w") \|\| "", /1020px/, "SETTINGS matches the career hub width, not a 760 postcard")`.
- Assertion 1972–1973: `assert.equal(decl(css("css/settings.css"), "#pm-settings-body", "scrollbar-width"), "none", "DISPLAY uses the themed .sf-scroll thumb, not a white native gutter")`.
- Assertion 1976–1976: `assert.ok(hubGrid, "SETTINGS doors become a 2-col grid once two --balance-basis tiles fit")`.
- Assertion 1977–1977: `assert.equal(hubGrid.decls.get("grid-template-columns"), "repeat(2, minmax(0, 1fr))")`.
- Assertion 1978–1979: `assert.equal(hubGrid.decls.get("align-items"), "stretch", "APPEARANCE wrap stretches the pair so DISPLAY is not a short neighbour")`.
- Assertion 1980–1981: `assert.equal(decl(css("css/career.css"), /#career-guide \.sheet\[data-shape="wide"\] > #cg-contents a,/, "white-space"), "nowrap", "How My Team Works topic chips stay one line")`.
- Assertion 1982–1983: `assert.equal(decl(css("css/career.css"), "#career-guide .sheet-body, #career-guide .sheet[data-shape=\"wide\"] > #cg-contents", "scrollbar-width"), "none", "How My Team Works keeps the themed .sf-scroll thumb only")`.
- Assertion 1984–1986: `assert.equal(decl(css("css/settings-controls.css"), /#pmsettings-inner \.pm-group, #rs-body\) details$/, "border-bottom"), "1px solid var(--card-line)", "DISPLAY fold rules span the sheet, not a fading --grad-rule")`.
- Assertion 1987–1988: `assert.match(code("js/input/steer-tuning.js"), /\["k", "FEEL"\]/, "closed FEEL summary carries the live steer step")`.
- Assertion 1989–1990: `assert.match(code("js/audio/panel.js"), /\["k", "MUSIC"\]/, "closed MUSIC summary carries ON and source")`.
- Assertion 1991–1992: `assert.equal(decl(css("css/components.css"), "#pmsettings-inner #pm-uiscale-h", "margin-top"), "calc(var(--gap) * 0.5)", "UI SIZE heading is a section break under READABILITY")`.
- Assertion 1993–1994: `assert.match(code("js/camera/cockpit-opts.js"), /fold\.id = "pm-cockpit"[\s\S]*?getElementById\("pm-visual-tuners"\)[\s\S]*?insertBefore\(fold, tools\)/, "COCKPIT is its own fold, just above ADVANCED VISUALS — never inside the RENDERER backend list")`.
- Assertion 1995–1996: `assert.equal(decl(css("css/components.css"), '#pmsettings-inner[data-shape="wide"] #pm-panel-display #pm-cockpit', "grid-area"), "cockpit", "and on a wide sheet it has its own named row above the tools")`.
- Assertion 1997–1998: `assert.ok(!code("js/perf/metrics-overlay.js").includes("@media (max-height:"), "METRICS submenu no longer keys packing on viewport height")`.
- Assertion 1999–2000: `assert.ok(!code("js/perf/metrics-overlay.js").includes("margin: 6px"), "unlayered inject must not offset METRICS off the HIDE HUD row")`.
- Assertion 2001–2002: `assert.match(code("js/perf/metrics-overlay.js"), /page\(\) === "log"/, "LOG NS / LOG SHOW stay hidden unless the overlay page is LOG")`.
- Assertion 2003–2004: `assert.match(code("js/perf/metrics-overlay.js"), /data-fold="k">METRICS/, "closed METRICS summary carries ON/page state")`.
- Assertion 2005–2006: `assert.match(code("js/perf/renderer-picker.js"), /data-fold="val">WEBGL2/, "WEBGL2 fallback is a value chip, not OFF — red would lie")`.
- Assertion 2007–2008: `assert.match(read("index.html"), /id="pm-uiscale-h"/, "UI SIZE is a real COCKPIT-style heading, not a tuner caption")`.
- Assertion 2009–2010: `assert.equal(decl(css("css/components.css"), "#pm-uiscale-h", "display"), "flex", "UI SIZE heading shares the row with the live %")`.
- Assertion 2011–2012: `assert.equal(decl(css("css/components.css"), '#pmsettings-inner details > summary [data-fold="k"]', "color"), "var(--text)", "fold names stay readable --text, not steel italic")`.
- Assertion 2013–2014: `assert.equal(decl(css("css/components.css"), '#pmsettings-inner details > summary [data-fold="on"]', "color"), "var(--gold)", "fold ON chips pick up the live gold the inner ON buttons name")`.
- Assertion 2015–2016: `assert.equal(decl(css("css/components.css"), '#pmsettings-inner details > summary [data-fold="off"]', "color"), "var(--red)", "fold OFF is the same red as a live warning, not dim")`.
- Assertion 2017–2018: `assert.equal(decl(css("css/components.css"), '#pmsettings-inner details > summary [data-fold="off"]', "opacity"), null, "OFF must stay fully opaque — faded red reads as dim again")`.
- Assertion 2019–2020: `assert.equal(decl(css("css/components.css"), 'button [data-fold="on"], summary [data-fold="on"]', "color"), "var(--gold)", "any menu ON word is gold — enabled, not merely selected")`.
- Assertion 2021–2022: `assert.equal(decl(css("css/components.css"), 'button [data-fold="off"], summary [data-fold="off"]', "color"), "var(--red)", "any menu OFF word is red")`.
- Assertion 2026–2026: `assert.doesNotMatch(read("index.html"), /as-toggle/, "the word-only MUSIC / SOUND pair is gone")`.
- Assertion 2030–2030: `assert.equal(decl(comp, ".set-row", "display"), "flex")`.
- Assertion 2031–2031: `assert.equal(decl(comp, ".set-row", "flex-wrap"), "wrap", "the ‹ select › cluster drops to its own line, never squeezes")`.
- Assertion 2032–2033: `assert.equal(decl(css("css/settings.css"), /#pm-panel-driving \.set-row > div/, "flex-wrap"), "wrap", "Driving ‹ select › cluster wraps at small-phone 200% instead of overflowing the pane")`.
- Assertion 2034–2034: `assert.equal(decl(comp, ".set-row > div > select", "appearance"), "none", "the chevrons are the arrows")`.
- Assertion 2035–2035: `assert.equal(decl(comp, ".set-row > div > button", "width"), "var(--chip-h)", "each chevron is a full tap square")`.
- Assertion 2036–2037: `assert.equal(decl(comp, "#pmsettings-inner .pm-groups .set-row > div > button", "width"), "var(--chip-h)", "row chevrons are restated above the broad settings-button rules, not guarded with :not() (that outranked the preset cards)")`.
- Assertion 2038–2038: `assert.equal(decl(comp, ".pm-group button", "width"), "100%")`.
- Assertion 2039–2039: `assert.doesNotMatch(read("index.html"), /class="opt-row balanced-row" role="group" aria-labelledby="pm-/, "no Settings chip rows remain — presets and engine layers are the chips")`.
- Assertion 2041–2041: `assert.match(read("index.html"), new RegExp(ˋid="${id}" class="set-row"ˋ), id + " is a setting row")`.
- Assertion 2043–2043: `assert.equal(decl(css("css/tuner.css"), /#pmsettings-inner \.as-toggle \.opt-btn\.active/, "background"), null)`.
- Assertion 2044–2044: `assert.equal(decl(css("css/tuner.css"), /#pmsettings-inner :is\(\.opt-btn, \.preset-btn\)\.active/, "box-shadow"), null)`.
- Assertion 2045–2045: `assert.equal(decl(css("css/components.css"), /#pmsettings-inner \.opt-btn:not\(\.active\) \[data-fold="on"\]/, "color"), null)`.
- Assertion 2046–2046: `assert.ok(!/--plate-on-glow:/.test(css("css/tokens.css")), "the glow token is retired")`.
- Assertion 2048–2048: `assert.ok(!css("css/" + f + ".css").includes("var(--plate-on-glow)"), f + ".css still lights a chip with the glow")`.
- Assertion 2050–2050: `assert.equal(decl(css("css/tuner.css"), ".opt-btn.active", "background"), "var(--plate-on)")`.
- Assertion 2051–2051: `assert.equal(decl(css("css/tuner.css"), ".opt-btn.active", "border-color"), "var(--red)")`.
- Assertion 2052–2052: `assert.equal(decl(css("css/tuner.css"), ".opt-btn.active", "box-shadow"), null)`.
- Assertion 2053–2054: `assert.equal(decl(css("css/overlays.css"), "#campicker button.active", "background"), "var(--plate-on)", "the cam picker lights like every other chip, not a 75% red fill")`.
- Assertion 2055–2056: `assert.equal(decl(css("css/carsetup.css"), ".cs-view-btn.active", "border-color"), "var(--red)", "garage SPIN is a chosen chip, not a green one-off")`.
- Assertion 2057–2058: `assert.equal(decl(css("css/components.css"), '#pmsettings-inner details > summary [data-fold="val"]', "color"), "var(--text)", "named modes stay text so gold still means enabled")`.
- Assertion 2059–2060: `assert.equal(decl(css("css/components.css"), 'button [data-fold="auto"], summary [data-fold="auto"]', "color"), null, "no control paints an AUTO/MANUAL agency word any more — GEARS / ACTIVE AERO are setting rows")`.
- Assertion 2061–2062: `assert.equal(decl(css("css/components.css"), "#pmsettings-inner .pm-group button, #pmsettings-inner .pm-doors button", "gap"), "0.35em", "flex gap keeps a space after LABEL: when the value is a painted span")`.
- Assertion 2063–2064: `assert.equal(decl(css("css/components.css"), "button:has(> [data-fold])", "column-gap"), "0.35em", "every menu button, not only Settings, keeps a space before a painted value")`.
- Assertion 2065–2066: `assert.ok(!code("js/perf/metrics-overlay.js").includes("det.open = true"), "METRICS does not auto-open and blow the HIDE HUD pair")`.
- Assertion 2067–2068: `assert.equal(decl(css("css/menus.css"), "#ss-inner", "--pair-compact"), "wide", "compact wide season setup keeps the calendar + pool pair")`.
- Assertion 2069–2070: `assert.equal(decl(css("css/menus.css"), "#ss-inner", "--compact-at"), "480px", "season setup shares #sel-inner's 480 compact floor, not the 380 default")`.
- Assertion 2071–2072: `assert.equal(decl(css("css/career.css"), "#cr-inner", "--pair-compact"), "off", "career compact always stacks — pair-on starves the hub left column")`.
- Assertion 2073–2074: `assert.equal(decl(css("css/career.css"), "#cr-inner", "--compact-at"), "480px", "career hub shares the 480 phone-landscape compact floor")`.
- Assertion 2075–2075: `assert.equal(decl(css("css/components.css"), "#pmsettings-inner", "--compact-at"), "480px")`.
- Assertion 2076–2076: `assert.equal(decl(css("css/overlays.css"), "#howtoplay-inner", "--compact-at"), "480px")`.
- Assertion 2077–2078: `assert.equal(decl(css("css/tuner.css"), "#audioset-inner, #spotifypanel-inner", "--compact-at"), "520px", "audio / Spotify pack earlier than the 380 default — two stacked sections plus notes")`.
- Assertion 2079–2079: `assert.equal(decl(css("css/components.css"), "#vsfriend-inner", "--compact-at"), "480px")`.
- Assertion 2083–2088: `assert.equal( decl(css("css/overlays.css"), '#vsfriend #vsfriend-inner[data-density="compact"]:not([data-shape="tall"]) #vs-close', "min-height"), "var(--tap-paint)", "compact VS Friend CLOSE floors at --tap-paint")`.
- Assertion 2089–2090: `assert.equal(decl(css("css/overlays.css"), '#vsfriend #vsfriend-inner[data-density="compact"]:not([data-shape="tall"]) #vs-close', "height"), "var(--tap-paint)", "compact CLOSE height locked to --tap-paint (closeInHead settle)")`.
- Assertion 2091–2092: `assert.equal(decl(css("css/overlays.css"), '#vsfriend-inner[data-density="compact"] #vs-pick > .bigbtn', "min-height"), "var(--tap-paint)", "compact HOST / JOIN floor at --tap-paint")`.
- Assertion 2094–2095: `assert.equal(decl(css("css/overlays.css"), '#vsfriend-inner[data-density="compact"] > #vs-head', "min-height"), "var(--tap-paint)", "compact VS Friend head clears --tap-paint CLOSE")`.
- Assertion 2096–2097: `assert.equal(decl(css("css/overlays.css"), '#vsfriend-inner[data-density="compact"] > #vs-head', "height"), "var(--tap-paint)", "compact head height locked with CLOSE")`.
- Assertion 2098–2103: `assert.equal( decl(css("css/overlays.css"), '#vsfriend #vsfriend-inner[data-density="compact"]:not([data-shape="tall"]) > .sheet-foot', "top"), "0", "compact CLOSE foot sits at head top (no pad inset past the band)")`.
- Assertion 2104–2105: `assert.equal(decl(css("css/overlays.css"), '#vsfriend #vsfriend-inner[data-density="compact"]:not([data-shape="tall"]) > .sheet-foot', "height"), "var(--tap-paint)", "compact CLOSE foot height locked to --tap-paint")`.
- Assertion 2106–2111: `assert.equal( decl(css("css/overlays.css"), '#vsfriend #vsfriend-inner[data-density="compact"]:not([data-shape="tall"]) > .sheet-foot', "padding-top"), "0", "compact head-parked foot zeros padding-top (selected-3 closeInHead 2026-10-11)")`.
- Assertion 2112–2112: `assert.equal(decl(css("css/components.css"), "#results .sheet, #standings .sheet, #customize .sheet", "--compact-at"), "480px")`.
- Assertion 2119–2120: `assert.equal(decl(vsDlg, /#vsfriend :is\(#vs-code-host/, "background"), "var(--plate-opaque)", "NEW CODE is a plate secondary — HOST keeps the sole red on the hub")`.
- Assertion 2121–2122: `assert.equal(decl(vsDlg, /#vsfriend :is\(#vs-share-invite/, "background"), "var(--plate-opaque)", "SHARE LINK is secondary until the room owns START")`.
- Assertion 2123–2124: `assert.equal(decl(vsDlg, /#vsfriend :is\(#vs-code-in.*\)::placeholder/, "word-break"), "normal", "code placeholder never wraps mid-word")`.
- Assertion 2125–2126: `assert.equal(decl(vsDlg, /#vsfriend :is\(#vs-code-in, #vs-invite/, "color-scheme"), "dark", "code boxes use dark form tokens (no nested white scroll chrome)")`.
- Assertion 2127–2128: `assert.equal(decl(vsDlg, "#vsfriend #vs-code-go", "width"), "min(100%, 22rem)", "Enter Code JOIN matches the field column width")`.
- Assertion 2129–2130: `assert.equal(decl(vsDlg, "#vsfriend #vs-body:has(#vs-code-input:not([hidden])) #vs-status", "text-align"), "center", "short-code error is centred under the field")`.
- Assertion 2131–2134: `assert.equal( decl(vsDlg, /#vsfriend:has\(#vs-code-input:not\(\[hidden\]\)\):has\(#vs-status\[class~="vs-error"\]\) #vs-code-in/, "border-color"), "var(--red)", "short-code error flags the field")`.
- Assertion 2135–2136: `assert.equal(decl(vsDlg, "#vsfriend #vs-code > h3 > span:first-child", "display"), "none", "a lone step number chip is hidden")`.
- Assertion 2137–2138: `assert.equal(decl(vsDlg, "#vsfriend #vs-joining section > p", "text-align"), "start", "join-friend hints align with their column")`.
- Assertion 2139–2142: `assert.equal( decl(vsDlg, /#vsfriend-inner\[data-density="compact"\]\[data-shape="tall"\] > \.sheet-foot(?!::)/, "position"), "relative", "narrow/tall CLOSE stays in the footer, not absolute in the head")`.
- Assertion 2143–2148: `assert.equal( decl(vsDlg, '#vsfriend #vsfriend-inner[data-density="compact"]:not([data-shape="tall"]) > .sheet-foot', "padding-top"), "0", "dialogs restates wide-compact zero foot pad after tall rules (closeInHead)")`.
- Assertion 2150–2150: `assert.equal(decl(css("css/career.css"), "#career-offers .sheet, #career-history .sheet, #career-guide .sheet, #quali .sheet", "--compact-at"), "480px")`.
- Assertion 2151–2152: `assert.equal(decl(css("css/carsetup.css"), "#cs-inner", "--pair-compact"), "off", "garage compact always stacks — pair-on starves #cs-options")`.
- Assertion 2153–2154: `assert.equal(decl(css("css/carsetup.css"), '#cs-inner[data-density="compact"] .cs-opt-desc', "display"), "none", "compact garage hides part blurbs so more option rows fit")`.
- Assertion 2155–2156: `assert.equal(decl(css("css/carsetup.css"), /#cs-options \.cs-tune-editor > \.adv-help:not\(#cs-rake-readout\)/, "display"), "none", "compact SETUP hides the long tune note and keeps the rake readout")`.
- Assertion 2157–2158: `assert.match(code("js/garage/setup-experiments.js"), /wrap\.className\s*=\s*"cs-tune-editor"/, "SETUP must not reuse cs-liv-editor (that class translucents the paint sheet)")`.
- Assertion 2159–2160: `assert.equal(decl(css("css/carsetup.css"), /#cs-options \.cs-liv-editor > \.adv-help:not\(#cs-rake-readout\)/, "display"), "none", "compact paint editor still hides its long help notes")`.
- Assertion 2161–2162: `assert.equal(decl(css("css/menus.css"), "#sel-daily", "flex"), "0 0 auto", "TODAY is a chip on the pan-x toolbar, first in the row")`.
- Assertion 2163–2164: `assert.equal(decl(css("css/menus.css"), '#sel-inner[data-density="compact"] #sel-daily > span', "display"), "none", "compact TODAY drops its weather/tod/best span so the filters stay on screen")`.
- Assertion 2167–2168: `assert.equal(decl(css("css/hud.css"), 'body[data-density="compact"] #announce', "top"), "max(calc(8px + var(--sat) / var(--hud-z) + var(--hud-top-h, 54px) + 6px), calc(var(--mir-bot, 0px) + 8px))", "compact radio cards sit right under the timing row, like every other density")`.
- Assertion 2169–2170: `assert.equal(decl(css("css/hud.css"), 'body[data-density="compact"]:not(.hud-mirror-on.hud-mirror-side):not(.hud-radio-top):not([data-radio-corner]):not([data-radio-placed]):has(> :where(#hud) > #hud-flag:not([hidden])) #announce', "top"), "calc(max(var(--flag-slot-top), calc(var(--mir-bot, 0px) + 8px)) + 34px)", "…and step below the flag chip while a caution shows, never on top of it")`.
- Assertion 2171–2172: `assert.equal(decl(css("css/hud.css"), ":root[data-gap-drop] #announce", "--flag-slot-top"), "max(calc(8px + var(--sat) / var(--hud-z) + var(--hud-top-h, 54px) + 44px), calc(var(--hud-gaps-b, 0px) + 8px))", "gap-drop raises --flag-slot-top so announce steps from the dropped flag edge (and clears --hud-gaps-b)")`.
- Assertion 2176–2178: `assert.equal(decl(css("css/hud.css"), "body:not(.desktop) #hud-inputs:not([data-hl-user])", "top"), "calc((8px + var(--tap-hud) + 4px + var(--sat)) / var(--hud-z) + var(--hud-sec-h, 4.8em) * var(--hud-z-top, var(--hud-scale)) / var(--hud-z) + 12px + var(--inputs-below-limits, 0px))", "phone INPUTS park under the sector plate, and below the #hud-limits chip only while it shows")`.
- Assertion 2179–2180: `assert.equal(decl(css("css/hud.css"), 'body:not([data-hud-hide~="limits"]):has(> :where(#hud) > #hud-limits:not([hidden])) #hud-inputs', "--inputs-below-limits"), "calc(2.6em + 3px)", "the limits step is the chip's own rule")`.
- Assertion 2181–2182: `assert.equal(decl(css("css/hud.css"), 'body[data-density="compact"] #hud-flag', "top"), "max(calc(72px + var(--sat) / var(--hud-z)), calc(var(--mir-bot, 0px) + 8px), calc(var(--hud-gaps-b, 0px) + 8px))", "compact flag clears --hud-gaps-b (72px alone sat inside the gaps strip at phoneL 150%)")`.
- Assertion 2183–2183: `assert.equal(decl(css("css/career.css"), '#quali .sheet[data-density="compact"] #q-foot', "display"), "grid")`.
- Assertion 2184–2184: `assert.equal(decl(css("css/career.css"), '#quali.q-done .sheet[data-density="compact"] #q-foot #q-go', "grid-column"), "1 / -1")`.
- Assertion 2186–2186: `assert.match(selectJs, /b\.id\s*=\s*"sel-daily"/)`.
- Assertion 2187–2188: `assert.match(selectJs, /selected\s*\?\s*"DAILY STANDARD"\s*:\s*"TODAY'S CHALLENGE"/, "daily chip distinguishes the selected standard from the idle challenge action")`.
- Assertion 2189–2190: `assert.match(selectJs, /firstChild\.nodeValue\s*=\s*"TODAY'S CHALLENGE · "/, "choosing another circuit clears the selected Daily Standard chrome in place")`.
- Assertion 2191–2192: `assert.match(selectJs, /bar\.insertBefore\(\s*b\s*,\s*bar\.firstChild\s*\)/, "TODAY leads the filter bar so a wrapping sheet paints it as the banner")`.
- Assertion 2193–2194: `assert.match(selectJs, /trackFilters[\s\S]*\["daily-open",\s*"DAILY OPEN"\]/, "DAILY OPEN participates in the same filter semantics as ALL / SEASON / CLASSICS")`.
- Assertion 2195–2195: `assert.match(selectJs, /G\.daily\.select\(/, "daily controls stage a plan on the picker")`.
- Assertion 2196–2197: `assert.doesNotMatch(selectJs, /onclick\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*G\.daily\.open\(/, "a picker chip must never bypass NEXT, Race Settings and RACE!")`.
- Assertion 2198–2198: `assert.match(code("js/garage/setup-experiments.js"), /rakeOut\.id\s*=\s*"cs-rake-readout"/)`.
- Assertion 2200–2200: `assert.match(resultsJs, /btn\.id\s*=\s*"res-daily-share"/)`.
- Assertion 2201–2201: `assert.match(resultsJs, /clrBtn\.id\s*=\s*"res-ghost-clear"/)`.
- Assertion 2202–2202: `assert.match(resultsJs, /lbHead\.className\s*=\s*"sel-label"/)`.
- Assertion 2203–2203: `assert.doesNotMatch(resultsJs, /#e10600/, "results/standings heads use .sel-label, not leftover red ink")`.
- Assertion 2204–2204: `assert.doesNotMatch(resultsJs, /font-size:11px/, "TT share/clear chips use .sel-chip, not inline type")`.
- Assertion 2206–2207: `assert.doesNotMatch(shell, /id="sel-inner"[^>]*pane-pair/, "SELECT is one column (strip over hero); its foot spans the sheet by default")`.
- Assertion 2208–2209: `assert.match(shell, /id="ss-inner"[^>]*pair-foot-full/, "season-setup foot spans both pair columns like SELECT")`.
- Assertion 2210–2210: `assert.match(shell, /id="sel-car"[^>]*class="bigbtn alt"/, "YOUR CAR sits on the alt plate beside NEXT")`.
- Assertion 2211–2211: `assert.match(shell, /id="sel-car"[^>]*><span>CHANGE CAR<\/span>/)`.
- Assertion 2212–2212: `assert.match(shell, /id="sel-go"[^>]*>RACE SETUP</)`.
- Assertion 2213–2213: `assert.match(shell, /id="practice-goal"/)`.
- Assertion 2214–2215: `assert.match(code("js/ui/experience.js"), /SettingRow\.build\("practice-goal-row", "GOAL"\)/, "Practice Goal becomes a setting row at runtime so the shell node count does not grow")`.
- Assertion 2216–2217: `assert.match(shell, /id="htp-close"[^>]*type="button"[^>]*class="bigbtn alt"\|id="htp-close"[^>]*class="bigbtn alt"[^>]*type="button"/, "How to Play dismiss is CLOSE on the alt plate (explicit type=button)")`.
- Assertion 2218–2218: `assert.match(shell, /id="htp-close"[^>]*>CLOSE</, "How to Play overlay dismiss is CLOSE")`.
- Assertion 2220–2221: `assert.match(titleFlow, /htpClose\.addEventListener\("click"/, "HTP CLOSE drops a stale #htp-* hash from title-flow, not the game entry")`.
- Assertion 2222–2222: `assert.match(titleFlow, /\^#htp-/)`.
- Assertion 2223–2223: `assert.doesNotMatch(readGameEntry(), /\^#htp-/)`.
- Assertion 2224–2224: `assert.match(shell, /id="pm-settings-close"[^>]*type="button"/, "Settings BACK is an explicit button (Esc presses it)")`.
- Assertion 2225–2225: `assert.doesNotMatch(shell, /id="pm-settings-close"[^>]*autofocus/, "Settings BACK must not steal initial focus from the door index")`.
- Assertion 2226–2226: `assert.match(shell, /id="pmsettings"[^>]*data-esc-close="pm-settings-close"/, "Settings root Esc dismisses via BACK")`.
- Assertion 2227–2227: `assert.match(shell, /id="standings-close"[^>]*class="bigbtn alt"/, "Standings CLOSE is dismiss, not a red commit")`.
- Assertion 2228–2228: `assert.match(shell, /id="sp-close"[^>]*class="bigbtn alt"/, "sp-close dismiss is the alt plate")`.
- Assertion 2229–2229: `assert.match(shell, /id="sp-close"[^>]*>CLOSE</, "sp-close overlay dismiss is CLOSE")`.
- Assertion 2230–2230: `assert.match(shell, /id="pm-advanced">ADVANCED INPUT &amp; HANDLING/, "settings door is STEERING & ASSISTS")`.
- Assertion 2232–2234: `assert.deepEqual([...settingsIndex.matchAll(/<button id="(pm-(?:open-controls\|open-driving\|open-display\|open-appearance\|open-a11y\|audio\|open-files\|open-graphics\|open-visual\|open-progress))"/g)].map((m) => m[1]), ["pm-open-controls", "pm-open-driving", "pm-open-display", "pm-open-appearance", "pm-open-a11y", "pm-audio", "pm-open-files", "pm-open-graphics", "pm-open-visual", "pm-open-progress"], "Settings home has the ten primary doors in order")`.
- Assertion 2236–2236: `assert.doesNotMatch(pause, /<button id="pm-driving"/, "DRIVING is a Settings page, not a pause shortcut")`.
- Assertion 2237–2237: `assert.match(shell, /id="pm-panel-driving"/, "DRIVING has a dedicated Settings page")`.
- Assertion 2238–2238: `assert.match(shell, /id="cz-cancel"[^>]*>BACK</, "customize cancel is BACK beside SAVE")`.
- Assertion 2239–2239: `assert.match(shell, /id="lt-close"[^>]*class="bigbtn"/, "lighting tuner DONE stays a live-commit primary")`.
- Assertion 2240–2240: `assert.doesNotMatch(shell, /id="lt-close"[^>]*class="bigbtn alt"/)`.
- Assertion 2241–2241: `assert.match(shell, /id="ct-close"[^>]*class="bigbtn"/)`.
- Assertion 2242–2242: `assert.doesNotMatch(shell, /id="ct-close"[^>]*class="bigbtn alt"/)`.

#### `neutral buttons share the settings tab-header plate` (2245–2306)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/tokens.css`, `css/components.css`, `css/menus.css`, `css/carsetup.css`, `css/data.css`, `css/overlays.css`, `css/tuner.css`, `css/hud.css`.

Case-local fixture/setup bindings (including action results): `tokens` 2246–2246; `components` 2247–2247; `menus` 2248–2248; `carsetup` 2249–2249; `data` 2250–2250; `tuner` 2278–2278; `narrowTabs` 2296–2297.

- Assertion 2251–2251: `assert.equal(decl(tokens, /:root/, "--plate"), "color-mix(in oklab, var(--carbon) 62%, transparent)")`.
- Assertion 2252–2252: `assert.equal(decl(tokens, /:root/, "--plate-line"), "rgba(255, 255, 255, 0.16)")`.
- Assertion 2253–2253: `assert.match(decl(tokens, /:root/, "--plate-on") \|\| "", /^color-mix\(in oklab, var\(--red\) 18%/)`.
- Assertion 2254–2254: `assert.equal(decl(components, ".bigbtn.alt", "background"), "var(--plate-opaque)")`.
- Assertion 2255–2255: `assert.equal(decl(menus, ".sel-chip", "background"), "var(--plate)")`.
- Assertion 2256–2256: `assert.equal(decl(menus, ".sel-chip.active", "background"), "var(--plate-on)")`.
- Assertion 2257–2258: `assert.equal(decl(menus, "#race-settings .sel-chip.active", "background"), null, "race settings inherit the one .sel-chip.active look — no per-screen restatement")`.
- Assertion 2259–2259: `assert.equal(decl(carsetup, ".cs-tab", "background"), "var(--plate)")`.
- Assertion 2262–2262: `assert.equal(decl(carsetup, ".cs-tab", "min-width"), "var(--tap-min)", "the garage tabs keep the 24px width floor")`.
- Assertion 2263–2263: `assert.equal(decl(carsetup, ".cs-tab.active", "background"), "var(--plate-on)")`.
- Assertion 2264–2264: `assert.equal(decl(data, ".dh-pill.active", "background"), "var(--plate-on)")`.
- Assertion 2265–2265: `assert.equal(decl(data, ".dh-livebtn.active", "background"), "var(--plate-on)")`.
- Assertion 2266–2266: `assert.equal(decl(data, ".dh-tab", "color"), "var(--text)", "idle hub tabs are ink, not dim-as-disabled")`.
- Assertion 2267–2267: `assert.equal(decl(data, ".dh-sortbtn", "color"), "var(--text)")`.
- Assertion 2268–2268: `assert.equal(decl(css("css/overlays.css"), ".sel-label", "color"), "var(--steel)", "section chrome, not leftover dim")`.
- Assertion 2269–2269: `assert.equal(decl(carsetup, ".cs-tab-lbl", "color"), "var(--text)")`.
- Assertion 2270–2270: `assert.equal(decl(css("css/overlays.css"), "#htp-contents a", "color"), "var(--text)")`.
- Assertion 2271–2272: `assert.equal(decl(css("css/overlays.css"), /#htp-contents a\[aria-current/, "background"), "var(--plate-on)", "term-rail selected uses the one chip look (plate-on + red ring, no glow)")`.
- Assertion 2273–2273: `assert.equal(decl(css("css/overlays.css"), /#htp-contents a\[aria-current/, "box-shadow"), null)`.
- Assertion 2274–2274: `assert.equal(decl(css("css/overlays.css"), /#results-table > \.sel-label/, "margin-top"), "calc(var(--gap) * 1.2)")`.
- Assertion 2275–2275: `assert.equal(decl(css("css/tuner.css"), "#lt-tabs .lt-tab, #ct-modes .lt-tab, #fb-shots .lt-tab", "color"), "var(--text)")`.
- Assertion 2279–2279: `assert.equal(decl(tuner, '#flyby-inner[data-density="compact"]', "overflow"), "hidden")`.
- Assertion 2280–2281: `assert.equal(decl(tuner, '#flyby-inner[data-density="compact"] #fb-rail', "max-height"), "52%", "compact flyby caps furniture so the foot stays in the dock")`.
- Assertion 2282–2283: `assert.equal(decl(tuner, '#flyby-inner[data-density="compact"] > .sheet-foot', "position"), "static", "compact flyby foot must not stick over the shot strip")`.
- Assertion 2284–2284: `assert.equal(decl(tuner, '#flyby-inner[data-density="compact"] #fb-shots.lt-tabs', "overflow-x"), "auto")`.
- Assertion 2285–2285: `assert.equal(decl(tuner, '#flyby-inner[data-density="compact"] #fb-shots.lt-tabs', "touch-action"), "pan-x")`.
- Assertion 2286–2286: `assert.equal(decl(tuner, '#flyby-inner[data-density="compact"] #fb-shots.lt-tabs', "overscroll-behavior-x"), "contain")`.
- Assertion 2287–2287: `assert.equal(decl(tuner, '#flyby-inner[data-density="compact"] #fb-shots .lt-tab', "min-height"), "var(--tap-paint)")`.
- Assertion 2288–2289: `assert.equal(decl(tuner, "#lt-tabs .lt-tab, #ct-modes .lt-tab, #fb-shots .lt-tab", "min-height"), "var(--tap-paint)", "lighting/camera/flyby category chips floor at painted --tap on touch")`.
- Assertion 2290–2291: `assert.equal(decl(tuner, '#flyby-inner[data-density="compact"] #fb-ops button', "min-height"), "var(--tap-paint)", "compact flyby row ops floor at --tap-paint")`.
- Assertion 2292–2293: `assert.equal(decl(css("css/hud.css"), '#flyby-inner[data-density="compact"] #fb-freecam', "min-height"), "var(--tap-paint)", "freecam floor lives in @layer hud (beats components)")`.
- Assertion 2294–2294: `assert.equal(decl(tuner, '#flyby-inner[data-density="compact"][data-rail="on"] #fb-rail', "display"), "flex")`.
- Assertion 2295–2295: `assert.equal(decl(tuner, '#flyby-inner[data-density="compact"][data-rail="on"] #fb-rows', "grid-column"), "2")`.
- Assertion 2298–2298: `assert.ok(narrowTabs, "narrow lighting tabs become a pan strip without waiting for compact")`.
- Assertion 2299–2299: `assert.equal(narrowTabs.decls.get("flex-wrap"), "nowrap")`.
- Assertion 2300–2300: `assert.equal(narrowTabs.decls.get("overflow-x"), "auto")`.
- Assertion 2301–2301: `assert.equal(narrowTabs.decls.get("overscroll-behavior-x"), "contain")`.
- Assertion 2302–2302: `assert.equal(narrowTabs.decls.get("touch-action"), "pan-x")`.
- Assertion 2303–2303: `assert.equal(decl(css("css/tuner.css"), ".adv-sec", "color"), "var(--steel)", "section chrome, not a leftover red headline")`.
- Assertion 2304–2304: `assert.equal(decl(menus, ".track-row.active .track-row-name", "color"), "var(--text)")`.
- Assertion 2305–2305: `assert.equal(decl(components, "#pmsettings-inner .pm-doors button", "background"), "var(--plate-opaque)")`.

#### `tool doors and lone foot actions do not stretch into banners` (2308–2316)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/components.css`, `css/overlays.css`, `css/career.css`.

Case-local fixture/setup bindings (including action results): `components` 2309–2309.

- Assertion 2310–2310: `assert.equal(decl(components, ".pm-doors", "--balance-basis"), "12rem")`.
- Assertion 2311–2311: `assert.equal(decl(components, ".sheet-foot .bigbtn:only-child", "flex"), "0 1 auto")`.
- Assertion 2312–2312: `assert.equal(decl(components, ".pm-group .tune-row .tune-label", "position"), "static")`.
- Assertion 2313–2313: `assert.equal(decl(components, '#pmsettings-inner .pm-groups > [role="region"] button', "white-space"), "normal")`.
- Assertion 2314–2314: `assert.ok(rulesFor(css("css/overlays.css"), "#howtoplay dl").some((r) => r.context.includes("@container sheet (max-width: 600px)")))`.
- Assertion 2315–2315: `assert.equal(decl(css("css/career.css"), ".cr-cheats .sel-chip", "min-width"), "0")`.

#### `COPY VALUES exports the player's edits under a name bake.mjs will refuse` (2372–2393)

Fixtures: `bootCopyValues`. Exercised targets: `js/lighting/tuner-panel.js`.

Case-local fixture/setup bindings (including action results): `h` 2373–2373; `w` 2378–2378; `none` 2391–2391.

- Assertion 2374–2376: `assert.match(h.json, /^window\.LightEdits\s*=\s*\{/, "the export must be a LightEdits DELTA — the name is the interlock that stops " + "bake.mjs (a FULL REPLACE) from writing it and deleting every profile it omits")`.
- Assertion 2377–2377: `assert.doesNotMatch(h.json, /LightPresets/, "and it must never wear the snapshot's name")`.
- Assertion 2380–2380: `assert.deepEqual(Object.keys(w), ["LightEdits"], "the paste evaluates to exactly one assignment")`.
- Assertion 2381–2382: `assert.deepEqual(Object.keys(w.LightEdits), ["monza\|dusk\|dry", "spa\|night\|wet"], "built from the local overrides only — the condition just tuned FIRST, empty layers dropped")`.
- Assertion 2383–2383: `assert.deepEqual({ ...w.LightEdits["spa\|night\|wet"] }, { fogDensityMul: 0.5, bloom: 0.3 })`.
- Assertion 2385–2386: `assert.ok(h.json.indexOf("THIS CONDITION") > -1 && h.json.indexOf("EVERYTHING ELSE") > -1, "both blocks are labelled for whoever reads the paste")`.
- Assertion 2387–2388: `assert.ok(h.json.indexOf("THIS CONDITION") < h.json.indexOf("EVERYTHING ELSE"), "the condition just tuned is emitted first")`.
- Assertion 2389–2389: `assert.ok(h.json.length < 2000, "a delta, not the 182,569-character merge")`.
- Assertion 2390–2390: `assert.equal(h.dom.byId("lt-json").hidden, false, "the textarea is revealed with the text selected")`.
- Assertion 2392–2392: `assert.equal(none.btn.textContent, "NOTHING TUNED", "no overrides → the button says so instead of exporting an empty object")`.

#### `menu range sliders share a painted-size token that cancels UI SIZE zoom` (2395–2420)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/tokens.css`, `css/components.css`, `css/tuner.css`, `css/hud.css`, `css/menus.css`.

Case-local fixture/setup bindings (including action results): `file` 2410–2410; `r` 2411–2411; `prop` 2413–2413; `v` 2414–2414.

Fixture iteration domains: `for (const file of ["css/tokens.css", "css/components.css", "css/tuner.css", "css/hud.css", "css/menus.css"])`; `for (const r of css(file))`; `for (const prop of ["height", "min-height"])`.

- Assertion 2396–2397: `assert.equal(decl(css("css/tokens.css"), ":root", "--slider"), "calc(32px / var(--ui-scale))", "--slider is 32 painted px: divide by --ui-scale so sheet zoom does not grow the track")`.
- Assertion 2398–2398: `assert.equal(decl(css("css/components.css"), "input[type=\"range\"]", "height"), "var(--slider)")`.
- Assertion 2399–2399: `assert.equal(decl(css("css/components.css"), "input[type=\"range\"]", "min-height"), "var(--slider)")`.
- Assertion 2400–2401: `assert.equal(decl(css("css/components.css"), "input[type=\"range\"]", "accent-color"), "var(--red)", "every menu range is red, including DISPLAY")`.
- Assertion 2402–2403: `assert.equal(decl(css("css/tuner.css"), /#audioset .tune-row input\[type="range"\]:disabled/, "accent-color"), "#6a6a75", "MUSIC volume is grey only while its switch is off")`.
- Assertion 2404–2405: `assert.equal(decl(css("css/components.css"), "input[type=\"range\"]", "appearance"), null, "leave the UA slider chrome — appearance:none was the red-dot-on-grey look")`.
- Assertion 2406–2406: `assert.equal(decl(css("css/components.css"), "input[type=\"range\"]::-webkit-slider-thumb", "width"), null)`.
- Assertion 2407–2407: `assert.equal(decl(css("css/tuner.css"), ".tune-row input[type=\"range\"]", "height"), "var(--slider)")`.
- Assertion 2408–2408: `assert.equal(decl(css("css/components.css"), ".pm-group .tune-row input[type=\"range\"]", "height"), "var(--slider)")`.
- Assertion 2409–2409: `assert.equal(decl(css("css/hud.css"), ".pc-fovlab input[type=\"range\"]", "height"), "var(--slider)")`.
- Assertion 2416–2416: `assert.match(v, /--slider\|--tap-paint/, ˋ${r.selector} ${prop} in ${file} must use --slider (or the touch --tap-paint), not ${v}ˋ)`.

#### `short+compact .sheet re-derives --tap-paint against the capped zoom (#1346 follow-up)` (2422–2435)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/menus.css`.

Case-local fixture/setup bindings (including action results): `sel` 2427–2427.

- Assertion 2428–2430: `assert.match(decl(css("css/menus.css"), sel, "--_sheet-z") \|\| "", /min\(var\(--sheet-scale,\s*var\(--ui-scale\)\),\s*var\(--ui-compact-scale\)\)/, "effective zoom is min(sheet-scale, ui-compact-scale)")`.
- Assertion 2431–2431: `assert.equal(decl(css("css/menus.css"), sel, "zoom"), "var(--_sheet-z)")`.
- Assertion 2432–2434: `assert.match(decl(css("css/menus.css"), sel, "--tap-paint") \|\| "", /var\(--tap-paint-at\)\s*\/\s*var\(--_sheet-z\)/, "--tap-paint divides by the capped zoom, not the uncapped slider")`.

#### `COPY VALUES tries the synchronous copy while the click still has activation` (2437–2447)

Fixtures: `bootCopyValues`. Exercised targets: `js/lighting/tuner-panel.js`.

Case-local fixture/setup bindings (including action results): `h` 2438–2438; `bare` 2445–2445.

- Assertion 2439–2443: `assert.equal(h.order[0], "execCommand:copy", "execCommand(\"copy\") must run BEFORE the clipboard promise. From inside its " + "rejection handler it runs a microtask later — which Chromium still allows (~5 s of " + "transient activation, measured) and WebKit is documented not to. Ordering it first " + "is what stops the answer depending on the engine.")`.
- Assertion 2444–2444: `assert.ok(h.order.indexOf("clipboard") > 0, "the async clipboard API is still tried afterwards (the only path that survives a browser without execCommand)")`.
- Assertion 2446–2446: `assert.deepEqual(bare.order, ["execCommand:copy", "clipboard"], "both paths are attempted even when the first fails")`.

#### `a lighting DELTA merges and an agent PROPOSAL replaces` (2449–2473)

Fixtures: `bootCopyValues`. Exercised targets: `.claude/skills/lighting-tuner/scripts/merge-proposals.mjs`, `js/lighting/tuner-panel.js`, `.claude/skills/lighting-tuner/scripts/bake.mjs`.

Case-local fixture/setup bindings (including action results): `mp` 2454–2454; `delta` 2463–2463; `tmp` 2464–2464; `r` 2468–2468.

- Assertion 2455–2456: `assert.match(mp, /merged\[\s*key\s*\]\s*=\s*delta\s*\?\s*Object\.assign\(\s*\{\s*\}\s*,\s*merged\[\s*key\s*\]\s*,\s*clean\s*\)\s*:\s*clean\b/, "delta merges into the shipped map, proposal replaces it")`.
- Assertion 2457–2458: `assert.match(mp, /if\s*\(\s*!delta\s*\)\s*delete\s+merged\[\s*key\s*\]/, "only a proposal may empty a condition — a paste must never wipe a profile it never mentioned")`.
- Assertion 2459–2460: `assert.match(mp, /\.LightPresets\s*&&\s*!\w+\.LightEdits/, "a snapshot fed to the merge tool is named as such, not merged as a delta")`.
- Assertion 2469–2469: `assert.notEqual(r.status, 0, "bake.mjs must exit non-zero on a LightEdits delta")`.
- Assertion 2470–2470: `assert.match(r.stderr, /LightEdits/, "…and say why by name")`.
- Assertion 2471–2471: `assert.match(r.stderr, /merge-proposals\.mjs/, "…and point at the tool that does take one")`.

#### `root view-transition fades the old snapshot out before the new fades in` (2475–2504)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/tokens.css`.

Case-local fixture/setup bindings (including action results): `tokens` 2478–2478; `parseMs` 2479–2484; `s` 2480–2480; `n` 2481–2481; `oldDur` 2485–2485; `newDelay` 2486–2486; `newDur` 2487–2487.

- Assertion 2488–2488: `assert.ok(oldDur > 0 && oldDur <= 120, ˋold fade must be short, got ${oldDur}msˋ)`.
- Assertion 2489–2489: `assert.ok(newDelay >= oldDur, ˋnew must wait until old is gone (${newDelay}ms delay vs ${oldDur}ms old)ˋ)`.
- Assertion 2490–2490: `assert.ok(newDur > 0, "new still fades in after the delay")`.
- Assertion 2491–2491: `assert.equal(decl(tokens, "::view-transition-old(root)", "mix-blend-mode"), "normal")`.
- Assertion 2492–2492: `assert.equal(decl(tokens, "::view-transition-new(root)", "mix-blend-mode"), "normal")`.
- Assertion 2493–2493: `assert.equal(decl(tokens, "::view-transition-new(root)", "animation-fill-mode"), "both")`.
- Assertion 2494–2494: `assert.equal(decl(tokens, "::view-transition", "background-color"), "var(--bg)")`.
- Assertion 2495–2495: `assert.match(decl(tokens, "::view-transition-old(root)", "animation-name") \|\| "", /apex-vt-fade-out/)`.
- Assertion 2496–2496: `assert.match(decl(tokens, "::view-transition-new(root)", "animation-name") \|\| "", /apex-vt-fade-in/)`.
- Assertion 2498–2499: `assert.ok(declares(tokens, /::view-transition-old\(\*\)/, "animation", /none/, { context: /prefers-reduced-motion/ }))`.
- Assertion 2500–2501: `assert.ok(declares(tokens, /::view-transition-new\(\*\)/, "animation", /none/, { context: /prefers-reduced-motion/ }))`.
- Assertion 2502–2502: `assert.ok(declares(tokens, /:root\[data-motion="reduce"\]::view-transition-old\(\*\)/, "animation", /none/))`.
- Assertion 2503–2503: `assert.ok(declares(tokens, /:root\[data-motion="reduce"\]::view-transition-new\(\*\)/, "animation", /none/))`.

#### `a locked part plays ONE blip, not one for the unlock and one for the fit` (2506–2522)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/garage/setup-sheet.js`.

Case-local fixture/setup bindings (including action results): `ss` 2513–2513; `click` 2514–2514; `body` 2515–2515.

- Assertion 2516–2517: `assert.ok(/let\s+_blipped\s*=\s*false/.test(body), "the parts row tracks whether it has already sounded")`.
- Assertion 2518–2519: `assert.ok(/GameAudio\.uiSelect\(\)\s*;\s*_blipped\s*=\s*true/.test(body), "the unlock blip records itself")`.
- Assertion 2520–2521: `assert.ok(/G\.soundOn\s*&&\s*!_blipped\s*\)\s*GameAudio\.uiSelect\(\)/.test(body), "the fit blip is suppressed when the unlock already sounded")`.

#### `the camera preset a part fit triggers is silent — click() must not replay uiTick` (2524–2541)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/garage/setup-sheet.js`.

Case-local fixture/setup bindings (including action results): `ss` 2533–2533; `fn` 2534–2534; `body` 2535–2535.

- Assertion 2536–2536: `assert.ok(/b\.click\(\)/.test(body), "framePreset still drives the real button")`.
- Assertion 2537–2538: `assert.ok(/G\.soundOn\s*=\s*false\s*;[^]*b\.click\(\)/.test(body), "…with sound muted across the synthetic click")`.
- Assertion 2539–2540: `assert.ok(/finally\s*\{\s*G\.soundOn\s*=/.test(body), "…and restored in a finally, so a throwing handler cannot leave the game mute")`.

#### `AriaState sync writes aria-pressed / aria-current only when the value changes` (2543–2572)

Fixtures: `uiSandbox`. Exercised targets: `js/ui/aria-state.js`.

Case-local fixture/setup bindings (including action results): `dom` 2546–2546; `group` 2547–2547; `one` 2548–2548; `two` 2548–2548; `nav` 2550–2550; `link` 2552–2552; `sb` 2556–2556; `writes` 2562–2562; `el` 2563–2563; `set` 2564–2564.

Fixture iteration domains: `for (const el of [one, two, link])`.

- Assertion 2559–2559: `assert.equal(one.getAttribute("aria-pressed"), "true")`.
- Assertion 2560–2560: `assert.equal(two.getAttribute("aria-pressed"), "false")`.
- Assertion 2561–2561: `assert.equal(link.getAttribute("aria-current"), "true")`.
- Assertion 2568–2568: `assert.deepEqual(writes, [], "an unchanged second pass writes nothing")`.
- Assertion 2571–2571: `assert.deepEqual(writes, ["aria-pressed"], "only the button whose state changed is written")`.

Shared helper assertions (part of the fixture contract):

- 50–50: `assert.ok(m, ˋ${name}() must exist in ${file}ˋ)`.
- 1244–1244: `assert.ok(Input.padConnected, "the harness pad is seen by the re-probe")`.

### `tests/unit/ui-inspector-audit.test.mjs`

Full read: 1–126; SHA-256: `1f6c6b281980dfa6bda399de4858630e855980ee449ce13a1c6f2f1a53c072c1`.

Direct local dependencies: `tools/ui/explorer/audit-evidence.mjs`.

File-level helpers/fixtures: `environment` 6–14.

File-wide production/source inputs: imported production tool modules listed above.

#### `native fit report joins original findings, measurements, thresholds and unique selector` (20–25)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `joinAuditFindings → tools/ui/explorer/audit-evidence.mjs:131`.

Case-local fixture/setup bindings (including action results): `report` 21–21.

- Assertion 22–22: `assert.equal(report.status, 'joined')`.
- Assertion 22–22: `assert.equal(report.cells[0].status, 'comparable')`.
- Assertion 23–24: `assert.deepEqual(report.findings[0], { cell: 0, producer: 'fit-audit', kind: 'tap', classification: 'finding', selector: '#go.action', mapping: { status: 'mapped', selector: '#go', targets: ['control'] }, measurements: { el: '#go.action', w: 20, h: 23, sev: 'under-floor' }, thresholds: { floor: 24, comfy: 44 }, units: 'CSS px' })`.

#### `native layout rows preserve context, informational standing and boolean document finding` (27–34)

Fixtures: `environment`. Exercised targets: `joinAuditFindings → tools/ui/explorer/audit-evidence.mjs:131`.

Case-local fixture/setup bindings (including action results): `row` 28–28; `result` 29–29.

- Assertion 30–30: `assert.equal(result.cells[0].producer, 'layout-audit')`.
- Assertion 31–31: `assert.deepEqual(result.findings.map(f => [f.kind, f.classification]), [['clipped', 'finding'], ['smallTaps', 'information'], ['deepScroll', 'information'], ['docOverflowX', 'finding']])`.
- Assertion 32–32: `assert.deepEqual(result.findings[0].mapping.targets, ['layout-context'])`.
- Assertion 33–33: `assert.equal('thresholds' in result.findings[0], false)`.

#### `native menu-fit and explicit native envelopes join without guessing missing thresholds` (36–43)

Fixtures: `environment`. Exercised targets: `joinAuditFindings → tools/ui/explorer/audit-evidence.mjs:131`.

Case-local fixture/setup bindings (including action results): `native` 37–37; `artifact` 38–38; `result` 39–39.

Fixture iteration domains: `for (const artifact of [native, { producer: 'menu-fit', report: native }])`.

- Assertion 40–40: `assert.equal(result.findings[0].kind, 'clipped')`.
- Assertion 40–40: `assert.equal(result.findings[0].mapping.selector, '#go')`.
- Assertion 41–41: `assert.equal(result.findings[0].measurements.by, -3)`.
- Assertion 41–41: `assert.equal('thresholds' in result.findings[0], false)`.

#### `ˋmismatched ${label} stays incomparable and cannot attach findingsˋ` (51–55)

Generated cases: mismatched root, viewport, DPR, pointer, UI scale, HUD scale, text scale, insets, appearance, adjustments, sha, dirty state stays incomparable and cannot attach findings. Fixture alternatives and mutations: lines 45–50; all share case 51–55/assertions 54.

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `joinAuditFindings → tools/ui/explorer/audit-evidence.mjs:131`.

Case-local fixture/setup bindings (including action results): `audit` 52–52; `result` 53–53.

- Assertion 54–54: `assert.equal(result.cells[0].status, 'incomparable')`.
- Assertion 54–54: `assert.equal(result.findings.length, 0)`.
- Assertion 54–54: `assert.ok(result.cells[0].reasons.length)`.

#### `dirty sha equality requires matching complete content fingerprints` (57–65)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `joinAuditFindings → tools/ui/explorer/audit-evidence.mjs:131`.

Case-local fixture/setup bindings (including action results): `inspect` 58–58; `audit` 58–58.

- Assertion 60–60: `assert.equal(joinAuditFindings(inspect, audit).cells[0].status, 'comparable')`.
- Assertion 62–62: `assert.equal(joinAuditFindings(inspect, audit).cells[0].status, 'incomparable')`.
- Assertion 64–64: `assert.equal(joinAuditFindings(inspect, audit).cells[0].status, 'incomparable')`.

#### `legacy and equal incomplete metadata are explicitly incomparable` (67–74)

Fixtures: `environment`. Exercised targets: `joinAuditFindings → tools/ui/explorer/audit-evidence.mjs:131`.

Case-local fixture/setup bindings (including action results): `e` 68–68; `inspect` 69–69; `audit` 69–69; `result` 70–70; `legacy` 72–72.

Fixture iteration domains: `for (const e of [undefined, {}, { version: 1 }, { ...environment(), scales: {} }, { ...environment(), appearance: { ...environment().appearance, root: {} } }])`.

- Assertion 70–70: `assert.equal(result.cells[0].status, 'incomparable')`.
- Assertion 70–70: `assert.equal(result.findings.length, 0)`.
- Assertion 73–73: `assert.equal(joinAuditFindings(inspection(), legacy).cells[0].status, 'incomparable')`.

#### `skipped, error and absent-root cells remain skipped even with missing provenance` (76–81)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `joinAuditFindings → tools/ui/explorer/audit-evidence.mjs:131`.

Case-local fixture/setup bindings (including action results): `row` 77–77; `result` 78–78.

Fixture iteration domains: `for (const row of [{ skipped: 'boot failed' }, { error: 'root missing/hidden' }, { rootPresent: false, clipped: [] }])`.

- Assertion 79–79: `assert.equal(result.cells[0].status, 'skipped')`.
- Assertion 79–79: `assert.equal(result.findings.length, 0)`.

#### `ambiguous producer selectors, duplicate controls and absent contexts never fan out` (83–90)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `joinAuditFindings → tools/ui/explorer/audit-evidence.mjs:131`.

Case-local fixture/setup bindings (including action results): `index` 84–84; `audit` 85–85; `inspect` 88–88.

Fixture iteration domains: `for (const index of [{ count: 2, selector: null }, { count: null, selector: null }, undefined])`.

- Assertion 86–86: `assert.equal(joinAuditFindings(inspection(), audit).findings[0].mapping.status, 'unmapped')`.
- Assertion 89–89: `assert.equal(joinAuditFindings(inspect, fit()).findings[0].mapping.status, 'unmapped')`.

#### `unknown artifacts and empty measurements cannot become comparable passes` (92–95)

Fixtures: `environment`. Exercised targets: `joinAuditFindings → tools/ui/explorer/audit-evidence.mjs:131`.

- Assertion 93–93: `assert.equal(joinAuditFindings(inspection(), {}).cells[0].status, 'incomparable')`.
- Assertion 94–94: `assert.equal(joinAuditFindings(inspection(), { producer: 'fit-audit', rows: [{ environment: environment() }] }).cells[0].status, 'incomparable')`.

#### `input, nested cells and unsupported artifacts respect advertised bounds` (97–105)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `joinAuditFindings → tools/ui/explorer/audit-evidence.mjs:131`.

Case-local fixture/setup bindings (including action results): `artifacts` 99–99; `result` 100–100; `audit` 102–102; `findings` 103–103.

- Assertion 98–98: `assert.throws(() => joinAuditFindings(inspection(), { data: 'x'.repeat(AUDIT_LIMITS.inputBytes) }), /5 MiB/)`.
- Assertion 101–101: `assert.equal(result.cells.length, 500)`.
- Assertion 101–101: `assert.equal(result.limits.cellsTruncated, true)`.
- Assertion 104–104: `assert.equal(findings.findings.length, 2000)`.
- Assertion 104–104: `assert.equal(findings.limits.findingsTruncated, true)`.

#### `browser environment callback reads actual hardware tokens and defaults root to body` (107–118)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `captureAuditEnvironment → tools/ui/explorer/audit-evidence.mjs:6`, `toString → function toString() { [native code] }`.

Case-local fixture/setup bindings (including action results): `style` 108–108; `body` 109–109; `html` 109–109; `context` 110–112; `output` 113–113.

- Assertion 114–114: `assert.equal(output.root, 'body')`.
- Assertion 114–114: `assert.equal(output.insets.right, 59)`.
- Assertion 114–114: `assert.equal(output.scales.ui, 1.3)`.
- Assertion 115–115: `assert.equal(output.insets.layoutTokens['--safe-r'], 'calc(0px + 12px)')`.
- Assertion 117–117: `assert.equal(vm.runInNewContext(ˋ(${captureAuditEnvironment.toString()})()ˋ, context).insets.right, null)`.

#### `producer selector callback records cardinality and canonical ids` (120–126)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `captureAuditSelectors → tools/ui/explorer/audit-evidence.mjs:30`, `toString → function toString() { [native code] }`, `auditFindingSelectors → tools/ui/explorer/audit-evidence.mjs:75`.

Case-local fixture/setup bindings (including action results): `base` 121–121; `one` 121–121; `two` 121–121; `context` 122–122; `out` 123–123.

- Assertion 124–124: `assert.equal(out['#go.action'].selector, '#go')`.
- Assertion 124–124: `assert.equal(out['.chip'].count, 2)`.
- Assertion 124–124: `assert.equal(out['.chip'].selector, null)`.
- Assertion 125–125: `assert.deepEqual(auditFindingSelectors({ clipped: [{ el: '#go', by: '#list' }], thresholds: {} }), ['#go', '#list'])`.

### `tests/unit/ui-inspector-css.test.mjs`

Full read: 1–170; SHA-256: `dfab07a168dec3d2349e63a656a32e78e240cf8c0befc9cb1c17e697db7ed36e`.

Direct local dependencies: `tools/ui/explorer/css-evidence.mjs`.

File-level helpers/fixtures: `mock` 11–39.

File-wide production/source inputs: imported production tool modules listed above.

#### `preserves source/important/media evidence and resolves named containers for actual rule owners` (41–78)

Fixtures: `mock`. Exercised targets: `collectCssEvidence → tools/ui/explorer/css-evidence.mjs:15`.

Case-local fixture/setup bindings (including action results): `fixture` 42–46; `report` 47–47; `candidate` 50–50; `cq` 55–55; `resolutions` 73–73.

- Assertion 48–48: `assert.equal(report.selector, '#control')`.
- Assertion 49–49: `assert.deepEqual(report.computed.map(p => p.name), ['color', '--accent'])`.
- Assertion 51–51: `assert.equal(candidate.source, 'https://example.test/app.css')`.
- Assertion 52–52: `assert.equal(candidate.line, 10)`.
- Assertion 53–53: `assert.deepEqual(candidate.declarations[0], { name: 'color', value: 'red', important: true, line: 11 })`.
- Assertion 54–54: `assert.deepEqual(candidate.media, [{ text: '(width > 300px)', active: true }])`.
- Assertion 56–56: `assert.equal(cq.conditionText, 'card (width > 300px)')`.
- Assertion 57–57: `assert.equal(cq.line, 8)`.
- Assertion 58–58: `assert.equal(cq.condition.status, 'unavailable')`.
- Assertion 59–59: `assert.equal(cq.active, undefined)`.
- Assertion 60–60: `assert.equal(cq.container.node.id, 'actual-container')`.
- Assertion 61–61: `assert.equal(cq.container.geometry.width, 480)`.
- Assertion 62–62: `assert.equal(cq.container.computed.properties[0].value, 'card')`.
- Assertion 63–63: `assert.equal(report.inherited[0].distance, 1)`.
- Assertion 64–64: `assert.equal(report.inherited[0].ancestor.id, 'parent')`.
- Assertion 65–65: `assert.equal(report.inherited[0].ancestor.nodeId, 6)`.
- Assertion 66–66: `assert.equal(report.inherited[0].inline[0].name, '--accent')`.
- Assertion 67–67: `assert.equal(report.inherited[0].inline[0].line, 21)`.
- Assertion 68–68: `assert.equal(report.inherited[0].rules[0].source, 'https://example.test/app.css')`.
- Assertion 69–69: `assert.equal(report.inherited[0].rules[0].line, 31)`.
- Assertion 70–70: `assert.equal(report.inherited[0].rules[0].declarations.length, 1)`.
- Assertion 71–71: `assert.match(report.limitation, /candidates/)`.
- Assertion 72–72: `assert.match(report.limitation, /do not prove a property inherits/)`.
- Assertion 74–74: `assert.deepEqual(resolutions.map(c => c.params.nodeId), [7, 6])`.
- Assertion 75–75: `assert.deepEqual(resolutions[0].params, { nodeId: 7, physicalAxes: 'Horizontal', logicalAxes: 'None', queriesScrollState: false, queriesAnchored: false, containerName: 'card' })`.
- Assertion 76–76: `assert.equal(fixture.calls.at(-1).method, 'Runtime.releaseObjectGroup')`.
- Assertion 77–77: `assert.equal(fixture.detached(), 1)`.

#### `unsupported optional CDP capabilities remain unavailable without losing candidates` (80–90)

Fixtures: `mock`. Exercised targets: `collectCssEvidence → tools/ui/explorer/css-evidence.mjs:15`.

Case-local fixture/setup bindings (including action results): `fixture` 81–82; `report` 83–83.

- Assertion 84–84: `assert.equal(report.rules[0].containerQueries[0].container.status, 'unavailable')`.
- Assertion 85–85: `assert.match(report.rules[0].containerQueries[0].container.reason, /DOM.getContainerForNode/)`.
- Assertion 86–86: `assert.equal(report.inherited[0].ancestor.status, 'unavailable')`.
- Assertion 87–87: `assert.equal(report.inherited[0].rules[0].declarations[0].name, 'color')`.
- Assertion 88–88: `assert.match(report.inherited[0].rules[0].containerQueries[0].container.reason, /not inferred/)`.
- Assertion 89–89: `assert.equal(fixture.detached(), 1)`.

#### `flat-tree boundaries retain inherited sources without guessing ancestor identity` (92–109)

Fixtures: `mock`. Exercised targets: `collectCssEvidence → tools/ui/explorer/css-evidence.mjs:15`.

Case-local fixture/setup bindings (including action results): `boundary` 93–93; `fixture` 94–100; `report` 101–101.

Fixture iteration domains: `for (const boundary of ['slot', 'closed-shadow-host', 'description-unavailable'])`.

- Assertion 102–102: `assert.equal(report.inherited[0].ancestor.status, 'unavailable', boundary)`.
- Assertion 103–103: `assert.equal(report.inherited[0].rules[0].source, 'https://example.test/app.css')`.
- Assertion 104–104: `assert.equal(report.inherited[0].rules[0].containerQueries[0].container.status, 'unavailable')`.
- Assertion 105–105: `assert.equal(fixture.calls.some(c => c.method === 'DOM.getContainerForNode'), false)`.
- Assertion 106–106: `assert.equal(fixture.calls.at(-1).method, 'Runtime.releaseObjectGroup')`.
- Assertion 107–107: `assert.equal(fixture.detached(), 1)`.

#### `unreported container metadata, query type and inherited metadata are explicit unavailable results` (111–120)

Fixtures: `mock`. Exercised targets: `collectCssEvidence → tools/ui/explorer/css-evidence.mjs:15`.

Case-local fixture/setup bindings (including action results): `fixture` 112–112; `report` 113–113.

- Assertion 114–114: `assert.equal(report.rules[0].containerQueryMetadata.status, 'unavailable')`.
- Assertion 115–115: `assert.equal(report.inheritedMetadata.status, 'unavailable')`.
- Assertion 116–116: `assert.equal(report.rules[1].containerQueries[0].container.status, 'unavailable')`.
- Assertion 117–117: `assert.match(report.rules[1].containerQueries[0].container.reason, /axes or query type/)`.
- Assertion 118–118: `assert.equal(fixture.calls.some(c => c.method === 'DOM.getContainerForNode'), false)`.
- Assertion 119–119: `assert.equal(fixture.detached(), 1)`.

#### `geometry failure and absent container do not imply successful condition evaluation` (122–133)

Fixtures: `mock`. Exercised targets: `collectCssEvidence → tools/ui/explorer/css-evidence.mjs:15`.

Case-local fixture/setup bindings (including action results): `fixture` 123–123; `report` 124–124; `cq` 125–125; `missing` 129–129; `absent` 130–130.

- Assertion 126–126: `assert.equal(cq.container.status, 'available')`.
- Assertion 127–127: `assert.equal(cq.container.geometry.status, 'unavailable')`.
- Assertion 128–128: `assert.equal(cq.condition.status, 'unavailable')`.
- Assertion 131–131: `assert.equal(absent.rules[0].containerQueries[0].container.status, 'unavailable')`.
- Assertion 132–132: `assert.match(absent.rules[0].containerQueries[0].container.reason, /no matching/)`.

#### `bounds ancestor, rule, declaration, query, string and serialized output sizes` (135–153)

Fixtures: `mock`. Exercised targets: `collectCssEvidence → tools/ui/explorer/css-evidence.mjs:15`.

Case-local fixture/setup bindings (including action results): `huge` 136–136; `largeMatch` 137–138; `fixture` 139–141; `report` 142–142.

- Assertion 143–143: `assert.equal(report.truncated, true)`.
- Assertion 144–144: `assert.ok(report.inherited.length <= 12)`.
- Assertion 145–145: `assert.ok(report.rules.length + report.inherited.reduce((n, a) => n + a.rules.length, 0) <= 80)`.
- Assertion 146–146: `assert.ok(report.inline.length <= 64)`.
- Assertion 147–147: `assert.ok(report.rules.every(r => r.declarations.length <= 64 && r.containerQueries.length <= 8))`.
- Assertion 148–148: `assert.ok(report.computed.length <= 128)`.
- Assertion 149–149: `assert.ok(report.computed.every(p => p.value.length <= 2048))`.
- Assertion 150–150: `assert.ok(fixture.calls.filter(c => c.method === 'DOM.getContainerForNode').length <= 24)`.
- Assertion 151–151: `assert.ok(Buffer.byteLength(JSON.stringify(report), 'utf8') <= 262144)`.
- Assertion 152–152: `assert.equal(fixture.detached(), 1)`.

#### `ambiguity keeps the existing error and always detaches` (155–162)

Fixtures: `mock`. Exercised targets: `collectCssEvidence → tools/ui/explorer/css-evidence.mjs:15`.

Case-local fixture/setup bindings (including action results): `nodes` 156–156; `fixture` 157–157.

Fixture iteration domains: `for (const nodes of [[], [7, 8]])`.

- Assertion 158–158: `assert.rejects(collectCssEvidence(fixture.page, { selector: '.many' }), { message: '--styles must identify exactly one element' })`.
- Assertion 159–159: `assert.equal(fixture.detached(), 1)`.
- Assertion 160–160: `assert.equal(fixture.calls.some(c => c.method === 'CSS.getMatchedStylesForNode'), false)`.

#### `required CDP failures and cleanup failures still detach` (164–170)

Fixtures: `mock`. Exercised targets: `collectCssEvidence → tools/ui/explorer/css-evidence.mjs:15`.

Case-local fixture/setup bindings (including action results): `method` 165–165; `fixture` 166–166.

Fixture iteration domains: `for (const method of ['DOM.enable', 'CSS.getMatchedStylesForNode', 'CSS.getComputedStyleForNode', 'Runtime.releaseObjectGroup'])`.

- Assertion 167–167: `assert.rejects(collectCssEvidence(fixture.page, { selector: '#control' }), /test failure/)`.
- Assertion 168–168: `assert.equal(fixture.detached(), 1, method)`.

### `tests/unit/ui-inspector-transitions.test.mjs`

Full read: 1–254; SHA-256: `d91ca33907c4d5cdfc98bd663c7f6dd0b3e5e520fac7eb3981530941d53b550b`.

Direct local dependencies: `tools/ui/explorer/transitions.mjs`.

File-level helpers/fixtures: `fixture` 7–35; `runningPush` 254–254.

File-wide production/source inputs: imported production tool modules listed above.

#### `serialized sampler retains frame-zero and changed classifications with unique selectors` (37–57)

Fixtures: `fixture`. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `dom` 38–38; `promise` 39–39; `n` 41–41; `result` 42–42; `[first, second]` 42–42.

Fixture iteration domains: `for (let n = 0; n < 7; n++)`.

- Assertion 43–43: `assert.equal(result.stable, true)`.
- Assertion 44–44: `assert.equal(result.frames, 8)`.
- Assertion 45–45: `assert.equal(result.elapsedMs, 160)`.
- Assertion 46–46: `assert.equal(result.truncated, false)`.
- Assertion 47–47: `assert.equal(first.selector, '#scope > button:nth-of-type(1)')`.
- Assertion 48–48: `assert.equal(second.selector, '#scope > button:nth-of-type(2)')`.
- Assertion 49–49: `assert.deepEqual(first.states.map(s => [s.frame, s.elapsedMs, s.adaptation.pair]), [[0, 0, 'off'], [1, 20, 'on']])`.
- Assertion 50–50: `assert.equal(first.states[0].adaptation.shape, 'wide')`.
- Assertion 51–51: `assert.equal(first.states[0].adaptation.density, 'roomy')`.
- Assertion 52–52: `assert.equal(first.states[0].adaptation.rail, 'off')`.
- Assertion 53–53: `assert.equal(first.states[0].adaptation.fit, 'yes')`.
- Assertion 54–54: `assert.equal(first.changes, 1)`.
- Assertion 55–55: `assert.equal(second.states.length, 1)`.
- Assertion 56–56: `assert.equal(dom.pending.size + dom.timers.size, 0)`.

#### `quiet layout needs three equal sampled frames as well as the 150ms minimum` (59–67)

Fixtures: `fixture`. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `dom` 60–60; `promise` 60–60.

- Assertion 62–62: `assert.equal(dom.pending.size, 1, 'one slow frame is insufficient')`.
- Assertion 64–64: `assert.equal(dom.pending.size, 1, 'three samples contain only two equal intervals')`.
- Assertion 66–66: `assert.equal((await promise).frames, 4)`.

#### `stalled rAF has an independent deadline and cancels its pending callback` (69–82)

Fixtures: `fixture`. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `dom` 70–70; `promise` 70–70; `[frameId, callback]` 71–71; `result` 73–73.

- Assertion 74–74: `assert.equal(result.stable, false)`.
- Assertion 75–75: `assert.equal(result.frames, 0)`.
- Assertion 76–76: `assert.equal(result.elapsedMs, 2000)`.
- Assertion 77–77: `assert.match(result.reason, /sampling budget/)`.
- Assertion 78–78: `assert.equal(result.history.contexts[0].states[0].frame, 0)`.
- Assertion 79–79: `assert.deepEqual(dom.cancelled, [frameId])`.
- Assertion 81–81: `assert.equal(dom.pending.size + dom.timers.size, 0, 'late callbacks cannot restart sampling')`.

#### `fixed geometry with alternating classifier values never claims settlement or a game defect` (84–100)

Fixtures: `fixture`. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `dom` 85–85; `promise` 85–85; `n` 86–86; `result` 87–87; `context` 87–87.

Fixture iteration domains: `for (let n = 1; n <= 120; n++)`.

- Assertion 88–88: `assert.equal(result.stable, false)`.
- Assertion 89–89: `assert.equal(result.frames, 120)`.
- Assertion 90–90: `assert.equal(context.changes, 120)`.
- Assertion 91–91: `assert.equal(context.revisited, 119)`.
- Assertion 92–92: `assert.equal(context.alternating, 119)`.
- Assertion 93–93: `assert.equal(context.states.length, result.history.limits.statesPerContext)`.
- Assertion 94–94: `assert.equal(context.evidence.length, result.history.limits.evidencePerContext)`.
- Assertion 95–95: `assert.equal(context.evidence[0].frame, 2)`.
- Assertion 96–96: `assert.equal(context.truncated, true)`.
- Assertion 97–97: `assert.equal(result.truncated, true)`.
- Assertion 98–98: `assert.match(result.history.limitation, /not confirmed bugs/)`.
- Assertion 99–99: `assert.equal(dom.pending.size + dom.timers.size, 0)`.

#### `sampling caps contexts, values and elements explicitly` (102–111)

Fixtures: `fixture`. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `dom` 103–103; `promise` 103–103; `n` 104–104; `result` 105–105.

Fixture iteration domains: `for (let n = 0; n < 8; n++)`.

- Assertion 106–106: `assert.equal(result.stable, true)`.
- Assertion 107–107: `assert.equal(result.truncated, true)`.
- Assertion 108–108: `assert.equal(result.history.contexts.length, result.history.limits.contexts)`.
- Assertion 109–109: `assert.equal(result.history.contexts[0].states[0].adaptation.pair.length, result.history.limits.valueLength)`.
- Assertion 110–110: `assert.equal(result.history.unknowns.length, 2)`.

#### `sampler preserves attribute removal and cleans up exceptions` (113–123)

Fixtures: `fixture`. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `dom` 114–114; `promise` 114–114; `n` 116–116; `failed` 118–118; `failure` 118–118.

Fixture iteration domains: `for (let n = 0; n < 7; n++)`.

- Assertion 117–117: `assert.deepEqual(plain((await promise).history.contexts[0].states.map(s => s.adaptation)), [{ pair: 'off' }, {}])`.
- Assertion 120–120: `assert.rejects(failure, /fixture geometry unavailable/)`.
- Assertion 121–121: `assert.equal(failed.pending.size + failed.timers.size, 0)`.
- Assertion 122–122: `assert.throws(() => fixture().start({ root: '#missing' }), /Inspector root missing/)`.

#### `sampled selector replacement and positional reordering remain explicitly ambiguous` (125–142)

Fixtures: `fixture`. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `dom` 126–126; `promise` 126–126; `n` 128–128; `result` 129–129; `replaced` 132–132; `replacementPromise` 132–132; `replacement` 134–134; `n` 137–137; `replacement` 138–138.

Fixture iteration domains: `for (let n = 0; n < 7; n++)`; `for (let n = 0; n < 7; n++)`.

- Assertion 130–130: `assert.equal(result.history.truncated, true)`.
- Assertion 131–131: `assert(result.history.contexts.every(c => c.selectorStable === false))`.
- Assertion 139–139: `assert.equal(replacement.history.contexts[0].present, false)`.
- Assertion 140–140: `assert.equal(replacement.history.truncated, true)`.
- Assertion 141–141: `assert.equal(replacement.history.contexts[0].revisited, 0)`.

#### `same-size path comparison reports deliberate hysteresis as observed differences` (148–158)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `compareSweepPaths → tools/ui/explorer/transitions.mjs:119`.

Case-local fixture/setup bindings (including action results): `records` 149–150; `before` 151–151; `result` 151–151.

- Assertion 152–152: `assert.equal(result.comparisons.length, 2)`.
- Assertion 153–153: `assert.equal(result.differencesTotal, 1)`.
- Assertion 154–154: `assert.deepEqual(result.comparisons[1].differences, [{ selector: '#sheet', forward: { pair: 'off' }, reverse: { pair: 'on' } }])`.
- Assertion 155–155: `assert.deepEqual(result.comparisons[1].requestedViewport, { width: 615, height: 800 })`.
- Assertion 156–156: `assert.match(result.limitation, /intentional hysteresis/)`.
- Assertion 157–157: `assert.deepEqual(records, before)`.

#### `path comparison canonicalizes adaptation order and ignores unrelated computed geometry` (160–168)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `compareSweepPaths → tools/ui/explorer/transitions.mjs:119`.

Case-local fixture/setup bindings (including action results): `records` 161–161; `result` 164–164.

- Assertion 165–165: `assert.equal(result.differencesTotal, 0)`.
- Assertion 166–166: `assert.equal(result.comparisons[0].comparedContexts, 1)`.
- Assertion 167–167: `assert.equal(result.truncated, false)`.

#### `text-only sampled contexts supplement control ancestry using final states after history caps` (170–187)

Fixtures: `fixture`. Exercised targets: `compareSweepPaths → tools/ui/explorer/transitions.mjs:119`.

Case-local fixture/setup bindings (including action results): `records` 171–171; `phase` 172–172; `dom` 173–173; `promise` 174–174; `n` 175–175; `n` 177–177; `result` 180–180; `empty` 184–184.

Fixture iteration domains: `for (const phase of ['forward', 'reverse'])`; `for (let n = 1; n <= 20; n++)`; `for (let n = 0; n < 8; n++)`.

- Assertion 181–181: `assert.equal(result.differencesTotal, 1)`.
- Assertion 182–182: `assert.deepEqual(result.comparisons[0].differences, [{ selector: '#scope', forward: { pair: '20' }, reverse: { pair: 'latched' } }])`.
- Assertion 183–183: `assert.equal(records[1].settlement.history.contexts[0].states.length, 16)`.
- Assertion 185–185: `assert.equal(empty.comparisons[0].comparedContexts, 0)`.
- Assertion 186–186: `assert.match(empty.unknowns.join(' '), /no comparable classified contexts/)`.

#### `missing, duplicated, invalid and truncated context evidence is explicitly unknown` (189–207)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `compareSweepPaths → tools/ui/explorer/transitions.mjs:119`.

Case-local fixture/setup bindings (including action results): `forward` 190–190; `reverse` 191–191; `result` 193–193; `missing` 200–200; `capped` 202–202; `incomplete` 204–204.

- Assertion 194–194: `assert.equal(result.comparisons[0].comparedContexts, 0)`.
- Assertion 195–195: `assert.equal(result.comparisons[0].unknownContexts, 2)`.
- Assertion 196–196: `assert.equal(result.truncated, true)`.
- Assertion 197–197: `assert.match(result.unknowns.join(' '), /truncated.*duplicate.*phase.*cannot be compared/)`.
- Assertion 198–198: `assert.match(compareSweepPaths(null).unknowns[0], /unavailable/)`.
- Assertion 199–199: `assert.match(compareSweepPaths([record('forward', 615, {})]).unknowns.join(' '), /no reverse/)`.
- Assertion 201–201: `assert.match(compareSweepPaths([forward, missing]).unknowns.join(' '), /layout contexts unavailable/)`.
- Assertion 205–205: `assert.equal(incomplete.truncated, true)`.
- Assertion 206–206: `assert.match(incomplete.unknowns.join(' '), /sampled history coverage truncated or incomplete/)`.

#### `path analysis bounds records, contexts, comparisons and retained differences` (209–223)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `compareSweepPaths → tools/ui/explorer/transitions.mjs:119`.

Case-local fixture/setup bindings (including action results): `manyContexts` 210–210; `forward` 211–211; `reverse` 211–211; `result` 214–214; `large` 219–219.

- Assertion 215–215: `assert.equal(result.comparisons[0].comparedContexts, result.limits.contextsPerRecord)`.
- Assertion 216–216: `assert.equal(result.comparisons[0].differences.length, result.limits.differences)`.
- Assertion 217–217: `assert.equal(result.differencesTotal, result.limits.contextsPerRecord)`.
- Assertion 218–218: `assert.equal(result.truncated, true)`.
- Assertion 220–220: `assert.equal(large.comparisons.length, large.limits.comparisons)`.
- Assertion 221–221: `assert(large.unknowns.length <= large.limits.unknowns)`.
- Assertion 222–222: `assert.match(large.unknowns.join(' '), /Record cap.*Comparison cap/)`.

#### `a finite CSS animation on the root keeps the layout unsettled until it ends; infinite ones are ignored` (225–241)

Fixtures: `fixture`. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `animations` 226–226; `dom` 227–227; `fade` 228–228; `pulse` 229–229; `promise` 232–232; `n` 233–233; `n` 236–236; `result` 237–237.

Fixture iteration domains: `for (let n = 0; n < 12; n++)`; `for (let n = 0; n < 4; n++)`.

- Assertion 234–234: `assert.equal(dom.pending.size, 1, 'still sampling: the fade is running')`.
- Assertion 238–238: `assert.equal(result.stable, true)`.
- Assertion 239–239: `assert.equal(result.animating, 0)`.
- Assertion 240–240: `assert(result.frames > 12, 'it waited past the quiet geometry')`.

#### `an animation still running at the budget is named as the reason` (243–253)

Fixtures: `fixture`, `runningPush`. Exercised targets: file-wide stylesheet/source inputs listed above.

Case-local fixture/setup bindings (including action results): `dom` 244–244; `promise` 245–245; `running` 246–246; `n` 248–248; `result` 250–250.

Fixture iteration domains: `for (let n = 0; n < 4; n++)`.

- Assertion 251–251: `assert.equal(result.stable, false)`.
- Assertion 251–251: `assert.equal(result.animating, 1)`.
- Assertion 252–252: `assert.match(result.reason, /animations/)`.

### `tests/unit/ui-journey-career.test.mjs`

Full read: 1–161; SHA-256: `fa1fe7c7e326e99e6ef0ad699a8d23a9c20f2ab663d3d419d43e115875cbf6c3`.

File-wide production/source inputs: `css/career.css`, `js/career/career-ui.js`, `js/ui/title-flow.js`, `js/ui/select-screen.js`.

#### `career overlay dialogs declare --fit-at for the anonymous .sheet` (22–34)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/career.css`.

Case-local fixture/setup bindings (including action results): `css` 23–23; `id` 24–24.

Fixture iteration domains: `for (const id of OVERLAYS)`.

- Assertion 25–26: `assert.match(css, new RegExp(id + "[^{]*\\{[^}]*--fit-at:\\s*300px"), ˋ${id} must declare --fit-at: 300px so classifyFit can read it on .sheetˋ)`.
- Assertion 27–28: `assert.match(css, new RegExp(id + "[^{]*\\{[^}]*--fit-at:\\s*220px"), ˋ${id} must drop to 220px in landscape, matching Settingsˋ)`.
- Assertion 30–31: `assert.match(css, /#cr-inner[^{]*\{[^}]*--fit-at:\s*220px/, "hub landscape --fit-at uses data-shape (not @media orientation)")`.
- Assertion 32–33: `assert.match(css, /#cr-inner \{[^}]*--fit-at:\s*300px/, "hub --fit-at must stay on #cr-inner")`.

#### `career.css does not reintroduce short-viewport height layout queries` (36–41)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/career.css`.

Case-local fixture/setup bindings (including action results): `css` 37–37.

- Assertion 38–38: `assert.doesNotMatch(css, /max-height:\s*55svh/)`.
- Assertion 39–39: `assert.doesNotMatch(css, /orientation:\s*landscape\)\s*and\s*\(max-height/)`.
- Assertion 40–40: `assert.doesNotMatch(css, /orientation:\s*portrait\)\s*and\s*\(max-height/)`.

#### `guide and history contents rail keys on wide sheet shape, strip when compact` (43–68)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/career.css`, `js/career/career-ui.js`.

Case-local fixture/setup bindings (including action results): `css` 44–44; `js` 45–45; `html` 46–46.

- Assertion 47–47: `assert.match(js, /mountContentsNav\("cg-body", "cg-contents", "Career guide sections"\)/)`.
- Assertion 48–48: `assert.match(js, /mountContentsNav\("ch-body", "ch-contents", "Career history sections"\)/)`.
- Assertion 49–49: `assert.match(js, /setAttribute\("aria-label", label\)/)`.
- Assertion 50–50: `assert.match(js, /"cg-" \+ slug\(title\)/)`.
- Assertion 51–51: `assert.match(js, /head\("CAREER TOTALS", "ch-totals"\)/)`.
- Assertion 52–52: `assert.match(js, /head\("SEASON BY SEASON", "ch-seasons"\)/)`.
- Assertion 54–54: `assert.match(js, /SETTINGS › BACKUP & RESTORE and GARAGE › TEAM/)`.
- Assertion 55–55: `assert.doesNotMatch(js, /SETTINGS › FILES/)`.
- Assertion 56–56: `assert.match(css, /#career-guide \.sheet\[data-shape="wide"\]:not\(\[data-density="compact"\]\):has\(> #cg-contents\)/)`.
- Assertion 57–57: `assert.match(css, /#career-history \.sheet\[data-shape="wide"\]:not\(\[data-density="compact"\]\):has\(> #ch-contents\)/)`.
- Assertion 58–58: `assert.match(css, /#career-guide \.sheet\[data-shape="wide"\] > #cg-contents/)`.
- Assertion 59–59: `assert.match(css, /#career-history \.sheet\[data-shape="wide"\] > #ch-contents/)`.
- Assertion 60–60: `assert.match(css, /#career-guide \.sheet\[data-shape="wide"\] > #cg-contents,[\s\S]*?min-height:\s*0/)`.
- Assertion 61–61: `assert.match(css, /#career-guide \.sheet\[data-shape="wide"\] > \.sheet-body,[\s\S]*?min-height:\s*0/)`.
- Assertion 62–62: `assert.match(css, /#career-guide \.sheet\[data-density="compact"\] > #cg-contents/)`.
- Assertion 63–63: `assert.match(css, /#career-history \.sheet\[data-density="compact"\] > #ch-contents/)`.
- Assertion 64–64: `assert.match(html, /class="sheet-body pane" id="cg-body"/)`.
- Assertion 65–65: `assert.match(html, /class="sheet-body pane" id="ch-body"/)`.
- Assertion 66–66: `assert.match(html, /class="sheet-body pane" id="co-body"/)`.
- Assertion 67–67: `assert.match(html, /class="sheet-body pane" id="q-body"/)`.

#### `compact overlay rows wrap names instead of ellipsizing titles and points` (70–85)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/career.css`.

Case-local fixture/setup bindings (including action results): `css` 71–71.

- Assertion 72–74: `assert.match(css, /#career-offers \.sheet\[data-density="compact"\] \.co-offer\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s, "career offer choices must keep the painted touch floor in compact mode")`.
- Assertion 75–76: `assert.match(css, /#career-offers \.sheet\[data-density="compact"\] \.co-offer-team\s*\{[\s\S]*?white-space:\s*normal/)`.
- Assertion 77–78: `assert.match(css, /#career-history \.sheet\[data-density="compact"\] \.res-name\s*,[\s\S]*?white-space:\s*normal/)`.
- Assertion 79–80: `assert.match(css, /#quali \.sheet\[data-density="compact"\] \.res-name\s*,[\s\S]*?white-space:\s*normal/)`.
- Assertion 81–82: `assert.match(css, /#career-history \.sheet\[data-density="compact"\] \.res-pts[\s\S]*?white-space:\s*normal/)`.
- Assertion 83–84: `assert.match(css, /#quali \.sheet\[data-density="compact"\] \.res-pts[\s\S]*?white-space:\s*normal/)`.

#### `compact qualifying foot keeps BACK except the existing .q-done rules` (87–97)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/career.css`.

Case-local fixture/setup bindings (including action results): `css` 88–88; `compactFoot` 93–94.

- Assertion 89–89: `assert.match(css, /#quali\.q-done #q-drive, #quali\.q-done #q-sim, #quali\.q-done #q-back \{ display: none; \}/)`.
- Assertion 90–90: `assert.match(css, /#quali:not\(\.q-done\) #q-go \{ display: none; \}/)`.
- Assertion 91–91: `assert.match(css, /#quali \.sheet\[data-density="compact"\] #q-foot #q-drive/)`.
- Assertion 92–92: `assert.match(css, /#quali \.sheet\[data-density="compact"\] #q-foot #q-go/)`.
- Assertion 95–96: `assert.doesNotMatch(compactFoot, /#q-back[^{]{0,80}\{\s*display:\s*none/, "compact CSS must not hide BACK; only .q-done does")`.

#### `career hub objective picks floor at --tap-paint` (101–106)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/career.css`.

Case-local fixture/setup bindings (including action results): `css` 102–102.

- Assertion 103–105: `assert.match(css, /\.cr-obj-pick\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s, "objective brief buttons must hit the painted tap floor on touch")`.

#### `CAREER MODES records slotsOrigin; title Esc never climbs to the hub` (109–117)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/career/career-ui.js`, `js/ui/title-flow.js`.

Case-local fixture/setup bindings (including action results): `js` 110–110; `title` 111–111.

- Assertion 112–112: `assert.match(js, /let slotsOrigin = "title"/)`.
- Assertion 113–113: `assert.match(js, /slotsOrigin = origin === "hub" \? "hub" : "title"/)`.
- Assertion 114–114: `assert.match(js, /picking && slotsOrigin === "hub" && Career\.active\(\)/)`.
- Assertion 115–115: `assert.match(js, /openSlots\("hub"\)/)`.
- Assertion 116–116: `assert.match(title, /careerUi\.openSlots\("title"\)/)`.

#### `NEW CAREER START is gated on name / 3-letter code / number 1–99` (119–127)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/career/career-ui.js`.

Case-local fixture/setup bindings (including action results): `js` 120–120.

- Assertion 121–121: `assert.match(js, /function draftErrors\(d\)/)`.
- Assertion 122–122: `assert.match(js, /Enter a name/)`.
- Assertion 123–123: `assert.match(js, /Code must be 3 letters/)`.
- Assertion 124–124: `assert.match(js, /Number must be 1–99/)`.
- Assertion 125–125: `assert.match(js, /\/\^\[A-Z\]\{3\}\$\//)`.
- Assertion 126–126: `assert.match(js, /draftFieldErr = errs/)`.

#### `NEW CAREER NUMBER validates the complete input value before starting` (129–146)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/career/career-ui.js`.

Case-local fixture/setup bindings (including action results): `source` 130–130; `field` 132–132; `gate` 133–133; `ctx` 134–135; `value` 137–137; `[value, expected]` 141–141.

Fixture iteration domains: `for (const value of ["1e2", "1.5", "100", "0", "-1", "", " ", "1e309", "not a number"])`; `for (const [value, expected] of [["1", 1], ["42", 42], ["99", 99], ["1e1", 10]])`.

- Assertion 139–139: `assert.equal(ctx.errors(ctx.draft).num, "Number must be 1–99", ˋreject ${JSON.stringify(value)}ˋ)`.
- Assertion 143–143: `assert.equal(ctx.draft.num, expected, ˋpreserve complete numeric value ${value}ˋ)`.
- Assertion 144–144: `assert.deepEqual(Object.keys(ctx.errors(ctx.draft)), [], ˋaccept ${value}ˋ)`.

#### `save retry explicitly persists the career before reading its status` (148–161)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `js/ui/select-screen.js`.

Case-local fixture/setup bindings (including action results): `source` 149–149; `retry` 150–150; `durable` 151–151; `calls` 152–152; `ctx` 153–157.

Fixture iteration domains: `for (const durable of [true, false])`.

- Assertion 159–159: `assert.deepEqual(calls, ["save", "status", durable ? "restored" : "failed"])`.

### `tests/unit/ui-journey-race.test.mjs`

Full read: 1–168; SHA-256: `75d6f9b1fea4ce3424c95133367870f87c144c1bfcc3aaa531c814db7810f248`.

Direct local dependencies: `tests/helpers/css-source.mjs`.

File-level helpers/fixtures: `stripComments` 19–31; `rulesMentioning` 34–50; `zoomsFor` 52–58.

File-wide production/source inputs: `css/hud.css`, `css/overlays.css`, `css/responsive.css`.

#### `HUD clusters zoom with --hud-z, never --ui-scale on #lights / .hud-bottom` (60–71)

Fixtures: `zoomsFor`. Exercised targets: `css/hud.css`.

Case-local fixture/setup bindings (including action results): `hud` 61–61; `sel` 66–66; `zooms` 67–67.

Fixture iteration domains: `for (const sel of ["#lights", ".hud-bottom"])`.

- Assertion 64–64: `assert.match(hud, /#hud-limits, #hud-damage, #hud-mirror[\s\S]*?\{ --hud-z: var\(--hud-z-top, var\(--hud-scale\)\); zoom: var\(--hud-z\); \}/)`.
- Assertion 65–65: `assert.match(hud, /\.hud-bottom \{ --hud-z: var\(--hud-z-bot, var\(--hud-scale\)\); zoom: var\(--hud-z\); \}/)`.
- Assertion 68–68: `assert.ok(zooms.includes("var(--hud-z)"), ˋ${sel} must declare zoom: var(--hud-z)ˋ)`.
- Assertion 69–69: `assert.ok(!zooms.includes("var(--ui-scale)"), ˋ${sel} must not use zoom: var(--ui-scale)ˋ)`.

#### `free-cam pads match the steering-arrow diameter` (73–81)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/hud.css`, `css/overlays.css`.

Case-local fixture/setup bindings (including action results): `hud` 74–74; `overlays` 75–75.

- Assertion 76–76: `assert.match(overlays, /--steer:\s*84px/)`.
- Assertion 77–77: `assert.match(hud, /\.pc-btn\s*\{[^}]*width:\s*var\(--steer\)/)`.
- Assertion 78–78: `assert.match(hud, /\.pc-stick\s*\{[^}]*width:\s*118px/)`.
- Assertion 79–79: `assert.doesNotMatch(hud, /body\.lt-open:not\(\.pc-nopanel\) \.pc-stick \{ width: 84px/)`.
- Assertion 80–80: `assert.doesNotMatch(hud, /body\.lt-open:not\(\.pc-nopanel\) \.pc-btn \{ width: 46px/)`.

#### `photo-mode restore eye is #pc-restore when controls are hidden` (83–88)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/hud.css`.

Case-local fixture/setup bindings (including action results): `hud` 84–84.

- Assertion 85–85: `assert.match(hud, /#pc-restore\s*\{/)`.
- Assertion 86–86: `assert.match(hud, /body\.pc-uihidden #photo-controls > :not\(#pc-restore\)/)`.
- Assertion 87–87: `assert.match(hud, /body\.pc-uihidden #pc-restore \{\s*display:\s*block/)`.

#### `compact race HUD uses body density, not orientation + max-height queries` (90–104)

Fixtures: `stripComments`. Exercised targets: `css/hud.css`, `css/overlays.css`, `css/responsive.css`.

Case-local fixture/setup bindings (including action results): `hud` 91–91; `overlays` 92–92; `responsive` 93–93; `added` 94–94.

- Assertion 95–96: `assert.doesNotMatch(added, /orientation:\s*landscape\)\s*and\s*\(max-height:/, "race-layer hunks must not add orientation + max-height layout queries")`.
- Assertion 97–99: `assert.doesNotMatch(stripComments(responsive), /orientation:\s*landscape\)\s*and\s*\(max-height:\s*560px\)/, "short-landscape HUD shrink moved to body[data-density] in hud.css")`.
- Assertion 100–100: `assert.match(hud, /body\[data-density="compact"\] #minimap/)`.
- Assertion 101–101: `assert.match(hud, /body\[data-density="compact"\] \.hud-gaps \{[^}]*var\(--sal\) \/ var\(--hud-z\)/)`.
- Assertion 102–102: `assert.match(hud, /body\[data-density="compact"\] #hud-sectors/)`.
- Assertion 103–103: `assert.match(overlays, /body\[data-density="compact"\] #campicker/)`.

#### `pause owns paused navigation: #campicker stands down with the dim sheet` (106–109)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/hud.css`.

Case-local fixture/setup bindings (including action results): `hud` 107–107.

- Assertion 108–108: `assert.match(hud, /body:has\(> \.screen\.dim:not\(\[hidden\]\)\) #campicker \{\s*display:\s*none/)`.

#### `sector box still clears #pausebtn via --tap-hud / --hud-z` (111–116)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/hud.css`.

Case-local fixture/setup bindings (including action results): `hud` 112–112.

- Assertion 114–115: `assert.match(hud, /#hud-sectors \{[\s\S]*?top:\s*calc\(\(8px \+ var\(--tap-hud\) \+ 4px \+ var\(--sat\)\) \/ var\(--hud-z\)\)/)`.

#### `no layout-mode rule restates a pedal fill over its pressed colour` (128–139)

Fixtures: `stripComments`. Exercised targets: `css/overlays.css`.

Case-local fixture/setup bindings (including action results): `css` 129–129; `id` 130–130; `m` 133–133.

Fixture iteration domains: `for (const id of ["btn-throttle", "btn-brake"])`; `for (const m of css.matchAll(new RegExp(ˋbody\\.[a-z-]+ #${id}\\s*\\{([^}]*)\\}ˋ, "g")))`.

- Assertion 131–132: `assert.match(css, new RegExp(ˋ#${id}:active \\{[^}]*background:ˋ), ˋ#${id} must have a pressed fill at allˋ)`.
- Assertion 134–136: `assert.doesNotMatch(m[1], /background/, ˋa body-class rule for #${id} sets a background; it outranks #${id}:active ˋ + "(1,1,1 vs 1,1,0) and silently deletes the pressed state. Position only here.")`.

#### `the five action buttons share one transparency and the arrows keep theirs` (141–168)

Fixtures: `stripComments`. Exercised targets: `css/overlays.css`.

Case-local fixture/setup bindings (including action results): `css` 142–142; `shared` 144–144; `ids` 147–147; `sel` 156–156; `rule` 162–162.

Fixture iteration domains: `for (const sel of ["#btn-boost.on", "#btn-ot.armed", "#btn-ot.on", "#btn-aero.armed", "#btn-aero.on", "#btn-throttle:active", "#btn-brake:active", // THROTTLE = LATCH added a rung that no finger is explaining: ˋ.onˋ is the // pedal held down by the setting rather than by a thumb, so it is the one // live state a player can leave the screen and come back to. "#btn-throttle.on"])`.

- Assertion 143–143: `assert.match(css, /--btn-a:\s*0?\.\d+/, "the shared idle transparency is one named number")`.
- Assertion 145–146: `assert.ok(shared, "one :where() rule carries the shared idle opacity — :where() so " + "every state rule below outranks it without restating an id")`.
- Assertion 148–151: `assert.deepEqual(ids, ["#btn-aero", "#btn-boost", "#btn-brake", "#btn-ot", "#btn-throttle"], "exactly the five action buttons — the steering arrows are held for a whole " + "lap over the road, not glanced at over the cockpit, and stay as they are")`.
- Assertion 152–153: `assert.doesNotMatch(css, /\.steerbtn[^{]*\{[^}]*opacity/, ".steerbtn must not join the ladder")`.
- Assertion 163–164: `assert.ok(rule && /opacity:\s*1\b/.test(rule[1]), ˋ${sel} is a live state and must restore full opacity over --btn-aˋ)`.
- Assertion 166–167: `assert.match(css, /\.touchbtn\.dead \{\s*opacity:\s*0\.3/, "dead stays the bottom rung, below idle")`.

### `tests/unit/ui-journey-session.test.mjs`

Full read: 1–90; SHA-256: `0e601084ec798ee0db63183ece8cc1341d8b49ca70578a3bddd121a2d77da261`.

Direct local dependencies: `tests/helpers/css-source.mjs`.

File-level helpers/fixtures: `fitAtBlocks` 22–27.

File-wide production/source inputs: `css/components.css`, `css/race-setup.css`, `css/track-detail.css`.

#### `session dialogs declare --fit-at next to --sheet-w so classifyFit can shrink them` (29–42)

Fixtures: `fitAtBlocks`. Exercised targets: `css/components.css`.

Case-local fixture/setup bindings (including action results): `css` 30–30; `id` 31–31; `blocks` 32–32.

Fixture iteration domains: `for (const id of SESSION)`.

- Assertion 33–33: `assert.ok(blocks.length >= 1, ˋ#${id} must declare --fit-at (inherits onto .sheet)ˋ)`.
- Assertion 34–35: `assert.match(css, new RegExp(ˋ#${id}\\s*\\{[^}]*--sheet-w\\s*:ˋ), ˋ#${id} keeps --sheet-w on the dialog idˋ)`.
- Assertion 37–37: `assert.match(css, /#results\s*\{[^}]*--fit-at:\s*300px/)`.
- Assertion 38–38: `assert.match(css, /#standings\s*\{[^}]*--fit-at:\s*300px/)`.
- Assertion 39–39: `assert.match(css, /#customize\s*\{[^}]*--fit-at:\s*300px/)`.
- Assertion 40–41: `assert.match(css, /#pausemenu\s*\{[^}]*--fit-at:\s*260px/, "pause is a short button stack — slightly smaller floor than Settings")`.

#### `landscape --fit-at uses zoom-correct data-shape selector (not @media orientation)` (44–55)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/components.css`.

Case-local fixture/setup bindings (including action results): `css` 45–45; `id` 47–47.

Fixture iteration domains: `for (const id of ["results", "standings", "customize"])`.

- Assertion 48–49: `assert.match(css, new RegExp(ˋ#${id} \\.sheet:not\\(\\[data-shape="tall"\\]\\)[^{]*\\{[^}]*--fit-at:\\s*220pxˋ), ˋ${id} --fit-at must use data-shape selectorˋ)`.
- Assertion 51–52: `assert.match(css, /#pausemenu \.sheet:not\(\[data-shape="tall"\]\)[^{]*\{[^}]*--fit-at:\s*180px/, "pausemenu --fit-at must use data-shape selector")`.
- Assertion 53–54: `assert.doesNotMatch(css, /@media\s*\(orientation:\s*landscape\)\s*\{[\s\S]*?#pausemenu/, "pausemenu must not use @media orientation for --fit-at (zoom-blind)")`.

#### `Race Setup preserves requested size and scrolls the focused task` (57–62)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/race-setup.css`.

Case-local fixture/setup bindings (including action results): `css` 58–58.

- Assertion 59–59: `assert.match(css, /#race-settings > \.sheet\s*\{[^}]*--fit-at:\s*0px/)`.
- Assertion 60–60: `assert.match(css, /#race-settings > \.sheet:is\(\[data-density="compact"\], \[data-shape="tall"\]\)\s*\{[^}]*overflow-y:\s*auto/)`.
- Assertion 61–61: `assert.match(css, /#race-settings > \.sheet:is\(\[data-density="compact"\], \[data-shape="tall"\]\) > #rs-body\s*\{[^}]*overflow:\s*visible/)`.

#### `standings body uses local leftover height, not a viewport svh cap` (64–77)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/track-detail.css`.

Case-local fixture/setup bindings (including action results): `css` 65–65; `body` 67–67; `decl` 69–69; `noCap` 73–73; `canShrink` 74–74.

- Assertion 66–66: `assert.doesNotMatch(css, /55svh/, "the 55svh cap was zoom-blind")`.
- Assertion 68–68: `assert.ok(body, "#standings-body still has a local-space rule")`.
- Assertion 70–70: `assert.match(decl, /overflow-y:\s*auto/)`.
- Assertion 71–71: `assert.match(decl, /overscroll-behavior-y:\s*contain/)`.
- Assertion 72–72: `assert.match(decl, /font-size:\s*var\(--fs-micro\)/)`.
- Assertion 75–76: `assert.ok(noCap && canShrink, "#standings-body must yield leftover sheet-grid height (min-height:0, no svh cap)")`.

#### `the garage stands down under its own dialogs: customize/teampicker fade #carsetup` (79–90)

Fixtures: inline values/mocks and file-level inputs described above. Exercised targets: `css/components.css`.

Case-local fixture/setup bindings (including action results): `css` 86–86.

- Assertion 87–89: `assert.match(css, /body:has\(> #customize:not\(\[hidden\]\)\) #carsetup,\s*\nbody:has\(> #teampicker:not\(\[hidden\]\)\) #carsetup \{\s*\n\s*opacity:\s*0;\s*\n\s*pointer-events:\s*none;/, "#carsetup must fade under #customize and #teampicker like every other dialog host")`.

Inventory: 19 files; 223 syntactic test registrations (234 named cases after the 12-way audit provenance expansion); 1570 case-local assertion expressions, plus explicitly listed helper assertions. No tests were executed.
