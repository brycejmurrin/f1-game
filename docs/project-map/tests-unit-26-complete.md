# Unit group 26 — complete assertion map

Read-only mapping of all 20 assigned test files (4,476 lines) on the local checkout, 2026-10-27. No tests, browser, debugger targets, or Node inspector fixtures were executed; no runtime source was changed. “Complete” describes source reading and case mapping, not a passing verdict.

Every test source was read in individually returned slices of at most 80 lines and under 10,000 characters. Case ranges include test registration/callback. Assertion spans are source line spans of assert calls (adjacent spans compacted), including nested callbacks/loops; they are evidence addresses rather than predicate copies. A loop row states its parameter expansion. Shared helper assertions are listed separately. Paths/URLs embedded in protocol fixtures (including `/repo`, `/etc`, fixture.js/new.js/app.js and remote example domains) are descriptive payloads, not claimed live repository references.

## Production and fixture navigation

The local code-nav skill was read; local `bash tools/mcp/lsp-mcp.sh def … --body` resolved Input, KeyBinds, TrackSurface, SportingRegs, Tracks.build, FlybySight.transmit, FlybySeq.insideProp, LampBake.bake/forTrack, TrackMesh.buildKerbs/buildRoad, Input.beginAxisCapture, InputPadMenu.create and InputHoldButtons.create. LSP labelled LampBake.bake and mesh methods module-file fallbacks (caller/export coverage unverified); Input.setKeyBinding resolves destructured alias/export, so ownership was followed to InputBindings.create in source. Tool modules outside js/ were followed through imports and source declarations. Bounded LSP bodies were navigation evidence, not a claim of full production-file reading.

| Target key | Production ownership and ranges | Boundary |
|---|---|---|
| CSS | controller.html:113–115 private-room inline rule; css/editor.css:140–151 .td-input; css/race-setup.css:579–587 and css/tuner.css:1227–1233 input declarations; css/tokens.css:438 --fs-2; tests/helpers/css-rules.mjs | Parsed source declarations |
| SCENE-J | js/circuits/scenery/jeddah.js:386–402; js/track/tracks.js:471–478; js/agent/apex-cam.js orbit; js/camera/flyby-seq.js:172–182; js/camera/flyby-sight.js:237–277 | Authored gap + geometry/occlusion diagnostics |
| SCENE-K | js/circuits/scenery/kyalami.js main terrace/grandstand around213–240; Tracks.build/sample in js/track/tracks.js | Authored geometry and model emissions |
| DBG | tools/mcp/js-debugger-session.mjs:22–65 URL/preview/artifact;83–144 pause/script/state/health;145–180 incident;192–289 attach/events;292–347 detach;350–420 scripts/source/breakpoints;421–479 control/eval/objects/stale pause;481–533 run lifecycle; tools/mcp/js-debugger-mcp.mjs:94–169 validation/dispatch | Per-row methods below refine this key |
| TRACE | tools/mcp/js-debugger-trace.mjs:12–46 exception message/record;48–117 logpoints, exception control, listeners/instances;119–275 CPU/hitch/heap summaries and artifacts;283–394 profiling; tools/mcp/js-debugger-session.mjs:223–243 pause routing | RemoteObject representation + bounded dictionaries |
| NODE | tools/mcp/js-debugger-node.mjs:22–52 repoFile/probeCondition;73–179 instrumentation;183–275 child lifecycle;278–291 parallel nodeTest; tools/mcp/js-debugger-workflow.mjs:27–42 frameLocals,46–52 pathSuffixRegex,55–166 wait/break/collect; DBG URL/attach/control | Node integration fixture scope |
| HTTP | tools/mcp/js-debugger-cdp.mjs:4–101 loopback/discovery/CDP; tools/mcp/js-debugger-mcp.mjs:171–219 RPC/stdio; tools/mcp/js-debugger-http.mjs:7–116 port/refusal/server/request; tools/mcp/js-debugger-cli.mjs; tools/mcp/js-debugger-mcp.sh; .mcp.json/.cursor/mcp.json/tools/mcp/js-debugger-mcp.json | Transport integration without browser |
| INPUT | js/input/input.js Input;605–681 binding delegation/activity/capture; js/input/bindings.js:20–319 map/default/conflict/labels; js/input/controller-profiles.js; js/input/pad-menu.js; js/input/hold-buttons.js; js/ui/settings-export.js malformed import; js/ui/onboard.js refresher | Real scripts over VM devices |
| PADMENU | js/input/pad-menu.js:5–282 create/pad navigation and value controls; js/input/input.js menu gate, calibration/axis capture and keyboard listeners | VM focus/event stubs |
| KEYUI | js/ui/key-binds.js:15–46 cancellation/visibility;52–76 help state;83 onward sections/capture/render;440–465 delayed centre;468 onward owner-pinned wheel wizard; Input capture/profile APIs | VM DOM/store/timers |
| JUMP | js/race/jump-start-penalty.js:9–66 standing race/at-green/reaction/fine; js/race/sporting-regs.js:219–237 constants/predicates; game launch integration via createGame | Game VM simulation |
| MESH | js/track/core/mesh.js:336–501 buildKerbs,676–902 buildRoad; js/track/core/surface.js profile; js/track/tracks.js:471–478 build; designer CustomTracks/TrackDef codec path | CPU geometry |
| AUDIO | js/core/lazy-bundles.js:555–595 restore/gesture unlock; title keyboard kick in js/game.js; real GameAudio/AudioPanel bundle | Fake WebAudio host |
| KNOB | tools/gfx/knob-ab.mjs:41–89 diffRaw/verdict/parseSet/parseArgs | Pure functions; main/browser flow not called |
| LAMP | js/lighting/lamp-bake.js:55–77 budget/toHalf;103–188 splat/mask/grid/copies;217–222 bake;225–384 bakeSteps;395–428 road/installation/reset;430–482 forTrack;495–512 prebake;521–555 shadow/live/gen. Shader source: js/render/glx/shaders/glsl-lit.js, js/render/three/tsl-lit.js, js/render/webgpu/wgsl-chunks.js | CPU bake + shader-source oracle |

Shared fixtures read: tests/helpers/key-binds-rig.mjs:1–210 (boot14–65 loads actual input dependencies; fakePad70–75; bootUi85–162 builds minimal DOM/store/timers; menuRig177–188; delayedCalibration192–204 keeps cancelled callbacks runnable; withProfileStore206–210); tests/helpers/js-debugger-rig.mjs:1–25 (FakeCdp6–15, frame16–19, attached20–25); tests/helpers/editor-vm.mjs:1–48; tests/unit/fake-audio-vm.cjs:1–36. Game VM entry is tools/lib/game-vm.cjs createGame/settle, geometry VM entry tools/track/verify-track.cjs buildContext; neither is a real browser.


## tests/unit/ios-input-zoom.test.mjs

SHA-256: `99c9929d4e2f2437a8d3357f0bb55c2d5a6bac4d5e409cf50ff2d1bc5a4d6c94`. Full read: 1–140.

Helpers 21–96: cssRules/decl; tokenPx recursively resolves px/var; floorPx handles literal/clamp/min/max; inline style required. 3 cases pin explicit 16px and scan owned input rules; --fs-2 remains 15px.

Limit: Static declarations only; no Safari, cascade/computed style, font scaling or focus zoom execution. index/settings accent text explicitly excluded.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 98–104 | 101–103 | CSS | #code private-room mode keeps a 16px floor (was clamp(12px,…)) | Same per-file limit above. |
| 106–115 | 109–111, 114 | CSS | .td-input uses 16px, not var(--fs-2) (15px at default scale) | Same per-file limit above. |
| 117–140 | 138–139 | CSS | OWNED sheets: every text-input font-size rule floors at ≥ 16px | Same per-file limit above. |

Helper assertion spans outside cases: 82 (inline style block must exist). These enforce fixture/oracle preconditions and count as part of the mapped source.

## tests/unit/jeddah-night-orbit.test.mjs

SHA-256: `de4efcfbc138294fa61c5bb282b40bcbe18eea808735afa080443c650bf6575e`. Full read: 1–60.

buildContext + createGame(jeddah), before/after 48–50; source regex gap pins, real built diagnostics, orbit(0,45,18,40,1.5). GS >=40, city >=48; three Corniche heroes; insideProp null and transmit >=0.5.

Limit: One night start pose plus diagnostic model IDs; no rendered pixels or whole-lap camera survey.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 24–34 | 27–29, 31–33 | SCENE-J | jeddah SF authored gaps clear night_pass orbit (~27 m lateral) | Same per-file limit above. |
| 36–46 | 39, 44 | SCENE-J | jeddah Corniche heroes still emit after SF gap push | Same per-file limit above. |
| 52–60 | 55, 57, 59 | SCENE-J: orbit | Jeddah S/F night orbit returns a clear transmit ray (#3315 scenery) | Same per-file limit above. |

## tests/unit/js-debugger-lifecycle-fixes.test.mjs

SHA-256: `56580636786fd33319c887d8bcccd59d636fb46c405fb1f1db45193818f19ce7`. Full read: 1–193.

Fixtures 9–33 deferred discovery/open/cleanup; 97–117 PageCdp VM and one injected cleanup failure. 25 ring cycles; foreign ring preserved. Last case persists large Unicode/exception original mode 0600, reads bounded artifact, retains it after ten-operation eviction, and requires single execution/release.

Limit: Injected CDP/event schedules; VM executes generated ring source. No Chrome socket or real garbage-collection measurement.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 35–44 | 39, 41–43 | DBG: attach, detach, state | detach invalidates an attach pending in discovery | Same per-file limit above. |
| 46–58 | 53–56 | DBG: attach, detach, state | a late open is closed and cannot replace a newer attachment | Same per-file limit above. |
| 60–80 | 73–78 | DBG: attach, detach | a delayed disconnect from the old client cannot clear newer session state | Same per-file limit above. |
| 82–95 | 91–93 | DBG: attach, detach, state | old detach finalization cannot clear a replacement attached during delayed cleanup | Same per-file limit above. |
| 119–131 | 123, 125–127, 130 | DBG: setLogpoint, removeBreakpoint, detach | removing hit logpoints deletes each page ring and bounds repeated set/remove ownership | Same per-file limit above. |
| 133–146 | 139–141, 143–145 | DBG: setLogpoint, removeBreakpoint, detach | detach retries an owned ring whose per-logpoint cleanup failed | Same per-file limit above. |
| 148–156 | 152, 154–155 | DBG: attach, state, detach | detach drops the previous target's operations (B10) | Same per-file limit above. |
| 158–193 | 173–174, 176–177, 179–181, 183, 185–188 | DBG: run, state, detach | large operation values and exceptions remain retrievable after newer runs and bounded state eviction | Same per-file limit above. |

## tests/unit/js-debugger-mcp.test.mjs

SHA-256: `a6a5cd50e3dde12c215994421ace6870def5b1af19ffd2b6c41868f46cb837ea`. Full read: 1–535.

Shared rig + CPU profile 16–27 (one 80ms delta), source/argument guards, incident files, pause generations, ownership/cleanup, one-based breakpoints, eval/property safety, mutation serialization, ring/log/profile summaries. CPU/heap profile methods are stubbed protocol responses.

Limit: Mostly injected CDP replies/events; generated logpoint condition executes in Function. Small CLI/network failures are real; no browser or player performance evidence.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 29–32 | 30–31 | DBG | loopback validation refuses remote/rebinding/credentials and wrong protocols | Same per-file limit above. |
| 33–40 | 34, 38 | DBG | tools expose actual debugger operations; malformed arguments fail before attachment | Same per-file limit above. |
| 41–61 | 49–54, 58–59 | DBG: exceptionLogControl, detach | incident bundles the latest exception, local page state and bounded screenshot | Same per-file limit above. |
| 62–71 | 67–69 | DBG: detach | incident refuses a page that navigated away from loopback after attachment | Same per-file limit above. |
| 72–79 | 74–78 | DBG: evaluate, properties | pause generation invalidates frames and objects after resume and re-pause | Same per-file limit above. |
| 81–100 | 86–87, 89, 91–92, 96–99 | DBG | exception pauses expose bounded thrown values and own their object handles until resume | Same per-file limit above. |
| 102–121 | 114, 116, 118–120 | DBG | completed failed runs release remote Error graphs before bounded history eviction | Same per-file limit above. |
| 123–163 | 133–134, 136–138, 140–141, 143–146, 148–149, 158–159, 161–162 | DBG: run, state, detach | unknown execution and failed group release retain cleanup ownership until detach | Same per-file limit above. |
| 165–178 | 173–174, 176–177 | DBG: run, state | a final operation status waits for its remote group cleanup attempt | Same per-file limit above. |
| 179–183 | 181–182 | DBG: control | step acknowledgment alone never returns previous paused frame | Same per-file limit above. |
| 184–188 | 187 | DBG: control | new pause arriving before step response remains authoritative | Same per-file limit above. |
| 189–198 | 193, 196–197 | DBG: setBreakpoint, source | URL breakpoint survives context clearing while scripts/frame handles expire | Same per-file limit above. |
| 199–209 | 204, 206–208 | DBG: setBreakpoint, state | resolved breakpoint coordinates use the same one-based units as source and paused frames | Same per-file limit above. |
| 210–228 | 217, 219, 221, 224, 226–227 | DBG: setBreakpoint | URL breakpoint resolutions follow scriptParsed, legacy events and reload | Same per-file limit above. |
| 229–243 | 235, 237, 239, 242 | DBG: setBreakpoint, removeBreakpoint | breakpoint resolutions are bounded, owned and pruned with individual script contexts | Same per-file limit above. |
| 244–250 | 248–249 | DBG: evaluate | evaluation rejects side effects by default and reports JavaScript exceptions | Same per-file limit above. |
| 251–257 | 255–256 | DBG: evaluate | evaluate returns a one-line summary of an object result from V8's preview | Same per-file limit above. |
| 258–264 | 262–263 | DBG: properties | property reads return getter descriptors without invoking them; rejects foreign objects | Same per-file limit above. |
| 265–276 | 272–273, 275 | DBG: state | pending Runtime evaluation cannot block an independent pause inspection and resume | Same per-file limit above. |
| 277–284 | 281–282 | DBG | concurrent mutations are refused while state remains readable | Same per-file limit above. |
| 285–291 | 287–290 | DBG: setBreakpoint, detach, state | detach resumes, removes owned breakpoints and never closes the browser | Same per-file limit above. |
| 292–298 | 296–297 | DBG: run | large execution result is bounded so later pause/state remains inspectable | Same per-file limit above. |
| 299–308 | 304–307 | DBG: evaluate, control | individual context destruction invalidates pause and script cache | Same per-file limit above. |
| 309–315 | 313–314 | DBG: run, state | async expression can await its promise without blocking MCP control | Same per-file limit above. |
| 316–323 | 320–322 | DBG: run, state | tool responses carry only the latest operation result, not the last ten | Same per-file limit above. |
| 324–335 | 331–334 | DBG: run, state | a run paused on a breakpoint reports paused, then pending after resume, never unknown | Same per-file limit above. |
| 336–342 | 340–341 | DBG | a slow Debugger.disable on detach is a warning, not a failed cleanup | Same per-file limit above. |
| 343–347 | 346 | DBG: setBreakpoint | a failed breakpoint removal on detach stays an error | Same per-file limit above. |
| 348–354 | 350, 352–353 | DBG | dead endpoint and missing tool name give actionable messages | Same per-file limit above. |
| 355–365 | 358, 360–362, 364 | DBG: run, state | T5: a timed-out (unknown) or pending run no longer blocks; it is marked abandoned and its late result dropped | Same per-file limit above. |
| 366–372 | 368–369, 371 | DBG | T6: debugger_run is documented as always mutating and refuses allowSideEffects with a pointer to debugger_evaluate | Same per-file limit above. |
| 373–387 | 378, 380, 382–384, 386 | DBG: scriptsList | T1: scripts hide anonymous rows by default, list named URLs first, report total/truncated, and eviction keeps game.js | Same per-file limit above. |
| 388–395 | 392, 394 | DBG: setBreakpoint | T1: an unresolved breakpoint warns loudly and suggests the exact parsed URL | Same per-file limit above. |
| 396–408 | 399, 402–404, 406–407 | DBG: setBreakpoint | T4: setting a breakpoint at an owned location removes the old CDP breakpoint by id first, even when unresolved | Same per-file limit above. |
| 409–424 | 412–413, 416, 418–420, 422–423 | DBG | A1: logpoint condition never pauses, records into a page ring, and read/clear go through Runtime.evaluate | Same per-file limit above. |
| 425–440 | 427, 429, 432, 434–439 | DBG: exceptionLogControl | A2: exception log records message/location/top-5 stack and auto-resumes without surfacing a pause | Same per-file limit above. |
| 441–454 | 450–453 | DBG | A3: listeners counts by type via DOMDebugger.getEventListeners and releases the object group | Same per-file limit above. |
| 455–468 | 459–460, 464–465, 467 | DBG | A4: instances queries the prototype, reads the array length and releases the group | Same per-file limit above. |
| 470–485 | 472, 474–476, 478–479, 484 | DBG | W25a: summarizeCpuProfile ranks self time and hitch windows | Same per-file limit above. |
| 487–502 | 490–491, 493–495, 497–500 | DBG: detach | W25a: debugger_profile start/stop cpu returns bounded summary | Same per-file limit above. |
| 504–521 | 508–509, 518–519 | DBG: detach | W25a: debugger_profile refuses while paused; hitch uses evaluate | Same per-file limit above. |
| 523–535 | 529, 531–533 | DBG: detach | W25a: debugger_profile heap start/stop summarises sampling tree | Same per-file limit above. |

## tests/unit/js-debugger-node.test.mjs

SHA-256: `8f6a5c9672c9a36915d8b6b7c3b8dcda48bbb59eb2714940ec45e2c604b465e7`. Full read: 1–215.

Inspector spawner 13–20; fixtures under tests/fixtures/js-debugger. Intentional sample failure yields TAP 3/2/1, 1501 probe hits, bounded 20 values/2 captures; parallel files own ports; child autoattach and runner:test; named/unnamed VM copies. vmTopLevel:false and pause cap allow 4–6 best-effort hits. Timeout fixture requires SIGKILL at 2500ms. Live mul break captures 6,7,42; collect 10,20,30.

Limit: Live Node inspector integration for relevant rows; URL/condition/fake-session rows are pure fixtures. No Chrome behavior.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 22–31 | 26–29 | NODE | #2957: a Node inspector lists as type node; the default and node/all filters include it | Same per-file limit above. |
| 33–40 | 34–39 | NODE | attachable URLs: node file scripts and url-less workers attach; remote pages and url-less pages do not | Same per-file limit above. |
| 42–52 | 44–47, 50–51 | NODE | query-less and bare-path breakpoint URLs match any ?v= query; Node targets take repo paths | Same per-file limit above. |
| 54–74 | 60–63, 65–71, 73 | NODE | debugger_node_test: exact hit counts, values, locals captures, TAP failures, probes in another file | Same per-file limit above. |
| 76–83 | 79–82 | NODE | debugger_node_test runs files in parallel, each on its own inspector port | Same per-file limit above. |
| 85–91 | 87–88, 90 | NODE | children:true auto-attaches a spawned Node process; runner:test debugs the real node --test child | Same per-file limit above. |
| 93–113 | 98–100, 106–107, 110, 112 | NODE | R4: a probe hits vm-loaded copies under relative, absolute and no filename; vmTopLevel adds top-level lines | Same per-file limit above. |
| 115–118 | 117 | NODE | a hanging test is killed at timeoutMs and reported, not left running | Same per-file limit above. |
| 120–130 | 121–122, 127, 129 | NODE | node_test refuses files outside the repository and malformed probes before spawning | Same per-file limit above. |
| 132–160 | 138–139, 142, 145–147, 149, 154–155 | NODE: listTargets, attach, waitForPause, control, removeBreakpoint, detach | attach a live Node target: Break on start, debugger_break returns locals, debugger_collect counts, detach lets it exit | Same per-file limit above. |
| 162–176 | 170–171, 173 | NODE | probe and logpoint conditions never shadow frame locals (a `var G` once blanked the game's G) | Same per-file limit above. |
| 188–201 | 194, 196, 199–200 | NODE: attach, setBreakpoint, control | pause cause says when a pause is not ours; a step waits for and returns the new token | Same per-file limit above. |
| 203–214 | 209–210, 212 | NODE: attach, detach | attach warns only when ANOTHER live js-debugger session registered on the target, and detach unregisters | Same per-file limit above. |

## tests/unit/js-debugger-trace.test.mjs

SHA-256: `653f42e7039eea435f91a5b431438c1c6ca60b89a316b5f0ee3269f9e599e89c`. Full read: 1–99.

Local FakeCdp/attached/tool 10–38; inherited property names constructor/toString/__proto__; start/clear/restart preserve safe counters; primitive and unserializable throw fixtures; max:1 ring retains 300-char message; listener object group release.

Limit: Fake CDP RemoteObject/event dictionaries; tests JSON roundtrip and JS primitive types, not real browser exceptions/listener attachment.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 41–53 | 48–50, 52 | TRACE | exception counts accept inherited object names before and after clear/restart | Same per-file limit above. |
| 55–78 | 72, 76–77 | TRACE | exception log preserves primitive throws and CDP unserializable values | Same per-file limit above. |
| 80–90 | 86–89 | TRACE | exception log keeps bounded first-line descriptions and per-message counts | Same per-file limit above. |
| 92–99 | 96–98 | TRACE | listener counts include custom event types named after inherited object properties | Same per-file limit above. |

Helper assertion spans outside cases: 36. These enforce fixture/oracle preconditions and count as part of the mapped source.

## tests/unit/js-debugger-tracks.test.mjs

SHA-256: `e6699d72d5aeb1a486b9c9f134e74f78b532a32c9a3d8476bd3d09dffd3f9075`. Full read: 1–216.

Shared rig; break wait and execution budget separation; worker/service_worker/blob fixtures; reload/disconnect aborts; late responses settle only after cleanup; health/cancel, endpoint aliases, cleanup deadline and stale pause recovery. Execution minimum 1000ms, default trigger budget 600000ms.

Limit: Injected CDP lifecycle/order; a real loopback discovery HTTP server and EventTarget exercise transport pieces. No browser.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 11–24 | 19–22 | DBG: breakAndInspect, state, detach | break-and-inspect auto-resume retains a newer pause delivered before the resume acknowledgment | Same per-file limit above. |
| 26–58 | 45–48, 51–53, 57 | DBG: state, detach | break workflow keeps trigger execution independent of the breakpoint wait budget | Same per-file limit above. |
| 60–81 | 70–73, 76–77, 79 | DBG: attach, state, detach | T7: targets lists worker/service_worker rows on request, attach accepts them (including blob: workers) | Same per-file limit above. |
| 82–90 | 86–89 | DBG: run, state | T8: a run pending across a reload/navigation (or a lost target) fails as aborted instead of staying pending | Same per-file limit above. |
| 91–110 | 100–102, 104–105, 107–109 | DBG: state | T9: a timed-out run stays tracked as timedOut; its late result is recorded; timeoutMs is per call | Same per-file limit above. |
| 111–118 | 114–115, 117 | DBG | T9: Cdp keeps a timed-out call's id so the late response reaches the handler | Same per-file limit above. |
| 119–136 | 129, 131–132, 135 | DBG: run | T10: state reports pageUnresponsive when a long run blocks Runtime.evaluate; cancel terminates the script | Same per-file limit above. |
| 137–143 | 139–140, 142 | DBG: state | T11: a lost target reads detached: target gone; a deliberate detach does not | Same per-file limit above. |
| 144–150 | 147–149 | DBG: run, state | T2: debugger_state carries only the latest operation's result, however many ran (fixed in #2535) | Same per-file limit above. |
| 151–173 | 154, 158, 162, 164–167, 171–172 | DBG: detach, listTargets | T12: attach remembers the last endpoint; common parameter aliases are accepted and every rejection names the right key | Same per-file limit above. |
| 174–183 | 179–180, 182 | DBG: setBreakpoint, state, attach | T13: detach always drops the local session, even when every CDP call hangs, and the daemon can attach again | Same per-file limit above. |
| 184–194 | 187, 189, 191, 193 | DBG | T14a: a pause whose resumed event never arrived does not block debugger_run; a live pause still does | Same per-file limit above. |
| 195–202 | 199, 201 | DBG | T14b: a refused paused evaluate (e.g. localStorage read) says to retry with allowSideEffects:true | Same per-file limit above. |
| 203–211 | 207–210 | DBG: scriptsList | boot lane: a non-matching or invalid filter returns nothing / a clear error, never everything | Same per-file limit above. |
| 212–216 | 215 | DBG: attach | boot lane: attaching a non-local page is refused with a message that says why | Same per-file limit above. |

## tests/unit/js-debugger-transport.test.mjs

SHA-256: `4791d5072015e5e61d4dad088bb272ab3c56de6d5810a2c7b942f0e4b0237b81`. Full read: 1–175.

Shared rig; nativeMcpConfig strips wrapper config; stdio malformed JSON recovery; shell shares daemon state; escaped ASCII/Unicode output; 128KB tool response and 64000-character request limits; host/origin/content/version rejection; notification/SSE status; incomplete upload shutdown resumes fake target.

Limit: Real loopback HTTP and stdio/shell subprocesses over fake sessions; Cdp EventTarget socket. No browser.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 16–21 | 19–20 | HTTP | CDP timeout and close reject pending calls without claiming cancellation | Same per-file limit above. |
| 22–30 | 25–29 | HTTP | JSON-RPC protocol responds to initialize/list/ping, not notifications | Same per-file limit above. |
| 31–40 | 35, 37, 39 | HTTP | tools/call allows omitted arguments but rejects explicit null and other non-objects before dispatch | Same per-file limit above. |
| 41–49 | 45–48 | HTTP | real stdio subprocess discovery and malformed JSON recovery, no browser launch | Same per-file limit above. |
| 50–64 | 53, 55, 59, 61–63 | HTTP | project catalogs launch the separate debugger wrapper and discover its tools | Same per-file limit above. |
| 73–89 | 78–79, 82, 84–87 | HTTP | wrapper shell calls share attachment, breakpoint and pause state across subprocesses | Same per-file limit above. |
| 90–107 | 101–104 | HTTP | HTTP transports bounded source results with escaped ASCII and Unicode | Same per-file limit above. |
| 108–120 | 117–118 | HTTP | HTTP reports oversized Unicode tool bodies as explicit tool errors | Same per-file limit above. |
| 121–140 | 133, 135–138 | HTTP | HTTP rejects browser origins, rebound hosts, non-JSON, bad versions and oversized requests before dispatch | Same per-file limit above. |
| 141–154 | 144, 148, 150–152 | HTTP | HTTP notifications return202, unsupported SSE gets405, errors do not poison the daemon | Same per-file limit above. |
| 155–163 | 156–158, 161–162 | HTTP | wrapper validates port and missing-daemon calls fail without creating a session | Same per-file limit above. |
| 164–175 | 172–173 | HTTP | daemon shutdown drops incomplete uploads before cleaning up a paused target | Same per-file limit above. |

## tests/unit/jump-start-vm.test.mjs

SHA-256: `a008bc3ab29a1461a04ebc03da61bdb037e68984ecf4d68163141f49f3ea7655`. Full read: 1–143.

Monza createGame + settle; onGrid 21–32 races without go(); stepToRace <=600 fixed 1/60 steps. Manual early throttle >=5s; delayed throttle zero; manual fast build crosses 0.2s speed gate and is fined; stock/fast auto-throttle both zero fines, full 22-car field, real tyre wear, legal parts and no contact shove.

Limit: Real game modules in Node VM; no physical controls/browser rendering or all circuits/setup combinations.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 45–53 | 51–52 | JUMP: setInput, clearInput, info | throttle held at lights-out adds +5 s | Same per-file limit above. |
| 55–66 | 64–65 | JUMP: setInput, step, clearInput, info | waiting for green before throttle accrues no false-start penalty | Same per-file limit above. |
| 68–96 | 82–84, 93–94 | JUMP: race, setInput, step, clearInput | a manual launch inside the reaction window is a false start, and only when the car really moved | Same per-file limit above. |
| 98–143 | 109–110, 112–113, 121–123, 125–128, 132–134, 138–140 | JUMP: race, clearInput, throttle, throttleLevel | auto-throttle is exempt through the reaction window, including a fast legal build | Same per-file limit above. |

## tests/unit/kerb-berm-surface.test.mjs

SHA-256: `d5f2cad350e515f1b1365f5edf5c778f12ffe855d39081d6620bae65f5ab27c7`. Full read: 1–120.

buildShip 20–27 + palette ring statistics 29–59 (>100 rings). Monza flat/sausage/rumble mean/rail/along deltas; designer ellipse 48 points, 18deg bank, berm flag survives codec; bank outside >off+0.3m and inside+0.2m; default absent flags retain flat vertex count.

Limit: CPU geometry/height model and synthetic bank loop; no raster or wheel-contact force validation.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 61–73 | 68, 70, 72 | MESH | kerbStyle sausage rises higher than flat; rumble varies along the ribbon | Same per-file limit above. |
| 75–108 | 92–93, 95, 98, 100, 106–107 | MESH | berms:true lifts outer terrain on a banked node; berms:false does not | Same per-file limit above. |
| 110–120 | 112–113, 117, 119 | MESH | shipped circuit without kerbStyle/berms still builds (defaults) | Same per-file limit above. |

Helper assertion spans outside cases: 24, 57. These enforce fixture/oracle preconditions and count as part of the mapped source.

## tests/unit/kerb-stripes.test.mjs

SHA-256: `635cd6cfa2573d87b72f49818f0b1d5fdad874f02d84efff6855165adf4de7b8`. Full read: 1–89.

build helper 24–30; >1000 kerb triangles, zero mixed/degenerate, two colours on Monza/Silverstone. Rubber samples every fifth off-centre (>2m) Monza node with V=14; >30 samples, nearer edge darker >95%; does not prove exact wear width or centre brightness.

Limit: Palette-matched triangles and sampled mesh columns, two circuits for stripes and Monza rubber only; no visual GPU check.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 34–64 | 56–58, 62 | MESH | every kerb triangle is one colour — stripes have hard edges, not ramps | Same per-file limit above. |
| 66–89 | 69, 86–88 | MESH | the asphalt's rubber band sits on the racing line's side, not the road centre | Same per-file limit above. |

Helper assertion spans outside cases: 28. These enforce fixture/oracle preconditions and count as part of the mapped source.

## tests/unit/key-binds-calibration.test.mjs

SHA-256: `29897a12f19f646b8fb3f1d951aee373c9263f8dbb1cd37cef8cd33b0ba351f7`. Full read: 1–200.

key-binds-rig delayedCalibration deliberately retains cancelled callbacks. Parameterized first test expands reset/back/close/blur/disconnect/connect/binding/wheel (8 cases), checks old callback inert and fresh calibration saves. Other loops hidden/id/index and reconnect/render/back; device switching, check-controls capture cancel, profile reentry focus, wheel first-owner pin/cancel.

Limit: Real input/UI scripts in fake DOM, storage, pads and controlled timers; no hardware or browser focus/screenreader validation.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 8–39 | 12, 21, 26–28, 37–38 | KEYUI: padRestStore, padRest | pending stick calibration is cancelled by ${reason}, and a fresh attempt works | Same per-file limit above. |
| 42–53 | 48, 52 | KEYUI: padRest | new calibration supersedes an earlier click; another settings page leaving does not cancel it | Same per-file limit above. |
| 55–67 | 64–65 | KEYUI: padRestStore | calibration refuses a hidden page or a different active controller without connection events | Same per-file limit above. |
| 69–96 | 76, 84–85, 87–88, 92–94 | KEYUI: getPadMap, poll | controller reconnect and generic render cancel an armed slot instead of leaving invisible capture | Same per-file limit above. |
| 99–122 | 115, 117–118, 121 | KEYUI: poll, pickPad, padRestStore | calibration cannot move to a second already-connected pad when its activity wins selection | Same per-file limit above. |
| 125–143 | 134, 136–137, 140–141 | KEYUI: getKeyMap, getPadMap, poll | CHECK CONTROLS cancels keyboard and pad binding capture without changing mappings | Same per-file limit above. |
| 146–166 | 160–162, 164 | KEYUI | profile-change reentry preserves replacement-slot focus after pad bind and clear | Same per-file limit above. |
| 168–200 | 180, 182, 185, 187–191, 193, 198–199 | KEYUI: poll, getPadAxisMap, controllerProfile, getControllerProfiles | wheel wizard pins the first device, ignores other axes and cancels only owner disconnect | Same per-file limit above. |

## tests/unit/key-binds-hunt.test.mjs

SHA-256: `de7771ebfaa52e0a12fca66e90266fa440e292fd46da3464cca1fc64b1fe1336`. Full read: 1–501.

boot/menuRig/bootUi, hold module VM, Onboard VM. Wheel/nonstandard mapping, elapsed missing-pad recovery (~100ms then ~1s), signed rest/inversion, per-device legacy offsets, linear wheel/explicit deadzone, calibrated pedal travel, wheel wizard, disconnect edges, Nintendo menu labels, multi-pointer analog max/survivor release, deferred calibration, status/focus, phone gating and coaching refresher.

Limit: Real modules in VM with synthetic events/pads/timers; hold-button DOM and geometry are minimal stubs. No actual controller or touchscreen.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 12–33 | 24, 32 | INPUT | a held D-pad direction re-arms immediately when a child menu layer opens | Same per-file limit above. |
| 35–49 | 42, 45, 48 | INPUT | I-01: a mapping-"" pad (wheel) resting at -1 on axes 1-3 does not walk the menu | Same per-file limit above. |
| 51–66 | 59, 65 | INPUT: poll, steer, debugState | I-01: a mapping-"" pad's buttons 14/15 do not steer; a standard pad's still do | Same per-file limit above. |
| 68–98 | 75, 79, 85, 91, 94, 97 | INPUT: poll, debugState | missing gamepad snapshot recovers on elapsed time, not display-frame count | Same per-file limit above. |
| 100–118 | 109, 112, 115 | INPUT: setPadAxisMap, setPadRest | wheel menu directions honor steering inversion and the signed calibrated centre | Same per-file limit above. |
| 120–129 | 128 | INPUT: getPadMap | I-01: a wheel's bound paddles navigate up/down in a menu | Same per-file limit above. |
| 131–151 | 138, 140–141, 145–146, 149–150 | INPUT: poll, calibratePad, debugState, padRestStore, padRest | I-02: CALIBRATE STICK is kept per pad; another centred pad steers 0 | Same per-file limit above. |
| 153–175 | 156, 161, 164, 169–170, 173–174 | INPUT: setPadRest, padRestStore, poll, padRest, debugState | I-02: a stored per-pad map loads; the old scalar goes to the first pad that drives | Same per-file limit above. |
| 177–198 | 186, 188, 191, 197 | INPUT: setSteerExpo, setPadAxisMap, poll, steer, setPadDeadzone | I-05: a set-up wheel is linear with no dead zone by default; the DEAD ZONE row still overrides | Same per-file limit above. |
| 200–219 | 208, 210, 212, 214, 216–218 | INPUT: setPadAxisMap, poll, throttleLevel, getPadAxisMap | I-06: a pedal with a measured rest/far reads (raw - rest)/(far - rest); a brake on the throttle's axis is refused | Same per-file limit above. |
| 221–244 | 234–235, 237–243 | INPUT: poll | I-06: the wheel wizard persists each pedal's rest and far; a brake press on the throttle's axis is refused with a message | Same per-file limit above. |
| 246–267 | 255, 257, 262, 266 | INPUT: poll, consumeBoostToggle, padPresent | I-08: a spare pad unplugging does not turn the driving pad's held buttons into fresh presses | Same per-file limit above. |
| 269–288 | 279–280, 283–284, 287 | INPUT: setPadLabelMode | nintendo label mode confirms on the physical A (standard index 1) and backs on B (index 0) | Same per-file limit above. |
| 290–314 | 302, 305, 307, 309, 311, 313 | INPUT | I-09: a right/middle mouse button neither presses a hold button nor fires a tap; touch and left mouse do | Same per-file limit above. |
| 316–343 | 332, 336–337, 340 | INPUT | hold teardown detects hidden ancestors while visible capture steals keep their hold | Same per-file limit above. |
| 345–395 | 361, 364, 366, 375–376, 378, 380–381, 386–387, 389, 391, 393 | INPUT | analog hold buttons preserve the strongest remaining touch across release paths | Same per-file limit above. |
| 397–425 | 410, 412, 414, 416, 421, 424 | INPUT: poll, disarmAll | deferred stick calibration belongs to the visible Controls request | Same per-file limit above. |
| 427–442 | 430–433, 437–441 | INPUT: poll | calibration status announces wizard progress without moving focus | Same per-file limit above. |
| 444–501 | 453, 455–456, 458–462, 464–465, 474–476, 480–482, 489–492, 495, 497, 500 | INPUT: remoteSample, activeInputSource, throttleLevel, steer, remoteEvent, consumeOvertake | phone ownership, parked diagnostics and controls refresher preserve driving state | Same per-file limit above. |

## tests/unit/key-binds-pad-menu.test.mjs

SHA-256: `7667bb5feb810c126f8ac60e1ac2ac504399c855e165c55905769aa0142dc6e0`. Full read: 1–274.

boot + fakePad + bootUi. Focus dispatch with document fallback; select skip-disabled/wrap control; range visible span/40 steps and custom padStep; held keyboard survives menu while fresh keydowns/touch gate; full signed stick lock/pedal-free-look exclusion; wheel capture excluded axes; calibrated menu centre; printable select typeahead vs Escape; Cmd/Ctrl latch prevention.

Limit: Synthetic focused select/range/button and pad events; does not exercise browser default events/layout or actual hardware. Includes textual source pins for touch gate.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 9–31 | 21–24, 29–30 | PADMENU: poll | a D-pad direction is dispatched at the FOCUSED control, so an element's own key handler runs | Same per-file limit above. |
| 33–54 | 43–44, 46, 48–49, 51–53 | PADMENU: poll | D-pad Left/Right on a focused <select> wraps past disabled options and fires change; Up/Down move rows | Same per-file limit above. |
| 56–76 | 66–67, 70, 72, 75 | PADMENU: poll | D-pad Left/Right on a wrap:false <select> (LAPS) stops at its ends like the row chevrons | Same per-file limit above. |
| 78–94 | 85–86, 89, 93 | PADMENU: poll | D-pad on UI SIZE (40–200, step 0.25) moves a visible amount per press, on the step grid | Same per-file limit above. |
| 96–116 | 104, 106–107, 109–110, 113–115 | PADMENU: poll | D-pad Left/Right on a focused slider steps within min/max; a button gets the plain arrow | Same per-file limit above. |
| 118–149 | 124–125, 127, 135–136, 139, 142–148 | PADMENU: throttle, throttleLevel, braking | an open menu still takes a key that was already down, and the on-screen pedals are gated | Same per-file limit above. |
| 151–166 | 156–158, 162, 165 | PADMENU: setPadRest, poll, debugState, lookStick, setPadAxisMap | a calibrated stick still reaches full lock on BOTH sides, and a pedal on axis 2 is not free-look | Same per-file limit above. |
| 168–192 | 178, 183, 185, 191 | PADMENU: poll, beginAxisCapture | axis capture skips axes already chosen: releasing the wheel cannot become the throttle | Same per-file limit above. |
| 194–214 | 207, 210–213 | PADMENU: poll, getPadAxisMap | the wheel wizard passes the axes it already mapped, so steering and throttle release never leak forward | Same per-file limit above. |
| 216–240 | 231, 234, 239 | PADMENU: poll, setPadRest | menu navigation subtracts the CALIBRATE STICK rest offset from the steer axis | Same per-file limit above. |
| 242–255 | 248, 251, 254 | PADMENU | a printable PAUSE key typed into a focused <select> is type-ahead, not pause; Escape still pauses | Same per-file limit above. |
| 257–274 | 266–267, 269, 271, 273 | PADMENU | a Cmd/Ctrl chord never latches a driving key (macOS sends no key-up for it); a plain press and Escape still work | Same per-file limit above. |

## tests/unit/key-binds-ui.test.mjs

SHA-256: `6092c29a3e65c549c74bb47a14214c350552db1d42e2f4b24e80ada174c1b9d3`. Full read: 1–392.

bootUi/slotOf. Touch tables reveal after activity; hidden/closed captures disarm; wheel abort; keyboard/pad unbind; capture persists across fresh VM boot; rest persists/junk rejected; axis move clears rest; page leave; reset clears map/axes/rest; preserve chosen help details; live help labels; reconnect/render disarm; all deferred calibration cancellation paths; successful capture one rebuild/focus restore/status.

Limit: Fake DOM/store/gamepads and controlled timers, with an index.html source assertion. No real computed visibility, accessibility announcement or reload navigation.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 7–18 | 9–11, 13–15, 17 | KEYUI | a phone hides both tables behind one hint until a key or a pad is seen | Same per-file limit above. |
| 20–41 | 33–34, 39–40 | KEYUI: keyBindings, disarmAll | an armed slot left behind (BACK / CLOSE / RESUME) never captures the next key in the race | Same per-file limit above. |
| 43–57 | 49, 52, 54, 56 | KEYUI: poll, debugState, disarmAll | disarmAll aborts the wheel wizard so the pad drives again | Same per-file limit above. |
| 60–82 | 67, 69–72, 74, 78, 81 | KEYUI: getKeyMap, consumeBoostToggle | Backspace on an armed KEY slot unbinds it, and the chip says so | Same per-file limit above. |
| 84–96 | 90–92, 94–95 | KEYUI: getPadMap, poll, debugState | Backspace from the keyboard unbinds an armed CONTROLLER slot and disarms the capture | Same per-file limit above. |
| 98–115 | 106, 108, 110, 113 | KEYUI: $, press, keyBindings | a key captured on the CONTROLS page is stored and drives the car after a reload (B·H11 settings audit) | Same per-file limit above. |
| 117–138 | 125, 128, 130, 134, 136 | KEYUI: $ | CALIBRATE STICK is stored and applied on the next boot; a garbage value is ignored | Same per-file limit above. |
| 140–152 | 149–151 | KEYUI: poll, padRest | the wheel wizard drops a stored rest offset when the steering axis moves | Same per-file limit above. |
| 154–170 | 159, 162, 164, 166, 169 | KEYUI: poll, debugState | leaving the CONTROLS page aborts the wheel wizard via SettingsNav.onLeave (hunt3 1b-F1) | Same per-file limit above. |
| 172–175 | 173–174 | KEYUI | without SettingsNav.onLeave KeyBinds.create still boots | Same per-file limit above. |
| 177–209 | 189–191, 196–197, 200, 202–208 | KEYUI: poll, padAxesAreDefault, padsAreDefault, setPadBinding, padRest | CONTROLLER RESET clears wheel axes and stick rest, not only the button map | Same per-file limit above. |
| 211–241 | 237–240 | KEYUI: render | How to Play input disclosures stay on the article the player opened | Same per-file limit above. |
| 243–248 | 245–247 | KEYUI | a desktop shows both tables and never the hint | Same per-file limit above. |
| 250–268 | 264–267 | KEYUI: render | How to Play binding slots are painted from the live key and pad tables | Same per-file limit above. |
| 270–282 | 276, 278, 281 | KEYUI: poll, getPadMap | #1903: a pad re-render (gamepadconnected) disarms capture so A does not rebind | Same per-file limit above. |
| 284–292 | 291 | KEYUI: render, poll, getPadMap | #1903: KeyBinds.render disarms an armed pad slot | Same per-file limit above. |
| 294–305 | 300–301, 304 | KEYUI | #1902: CALIBRATE STICK defers save until the timer; cancel on RESET | Same per-file limit above. |
| 307–319 | 318 | KEYUI | #1902: CALIBRATE STICK cancelled when leaving CONTROLS before save | Same per-file limit above. |
| 321–330 | 329 | KEYUI: disarmAll | #1902: CALIBRATE STICK cancelled on disarmAll (settings close) | Same per-file limit above. |
| 332–341 | 340 | KEYUI | #1902: CALIBRATE STICK cancelled on gamepad disconnect before save | Same per-file limit above. |
| 343–356 | 350, 353, 355 | KEYUI | #1902: a second CALIBRATE press cancels the first timer | Same per-file limit above. |
| 358–369 | 368 | KEYUI | #1902: CALIBRATE STICK does not save when CONTROLS is hidden before the timer | Same per-file limit above. |
| 371–392 | 380, 385–391 | KEYUI | a successful key capture rebuilds once, restores the changed slot's focus, and reports through a status | Same per-file limit above. |

## tests/unit/key-binds.test.mjs

SHA-256: `38fdf45092ec843df7920024dcb2ed90ed3b31e51064beb751a7796b56917225`. Full read: 1–347.

boot, fakePad, bootUi, SettingsExport VM. Default maps, move/conflict/reset/reserved/malformed normalization, Shift equivalence, saved maps/new action ownership, held latch release, edge semantics, labels, capture suppression; keyboardSeen typing exclusion and active source from actual activity. Recover UI is source regex plus requestRecover edge, not clicked DOM.

Limit: VM listeners and fake pad snapshots, settings import/source-text assertions where noted; no browser/device interaction.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 13–41 | 32–34, 37–39 | INPUT: setKeyMap, setPadMap | malformed imported binding slots cannot stop Controls initialization | Same per-file limit above. |
| 43–70 | 48–52, 57–62, 65–69 | INPUT: debugState, throttle | inputState gate distinguishes title navigation, menus, typing and HUD focus without modifying held keys | Same per-file limit above. |
| 72–89 | 75–88 | INPUT: keyBindings, keysAreDefault | the defaults are the keys the game always had | Same per-file limit above. |
| 91–110 | 95–96, 98–99, 102, 106, 108–109 | INPUT: consumeRecover, requestRecover, clearEdges | the pause card's RECOVER CAR raises the same edge R raises (hunt3 7-F3) | Same per-file limit above. |
| 112–129 | 114, 121, 123–126, 128 | INPUT: consumeBoostToggle, keyBindings, setKeyBinding, keysAreDefault, resetKeys | a rebind moves the action to the new key and the old key stops answering | Same per-file limit above. |
| 131–140 | 134, 136, 138–139 | INPUT: setKeyBinding, keyBindings, consumeOvertake, consumeBoostToggle | a key another action held is taken from it, and the caller is told | Same per-file limit above. |
| 142–157 | 145, 150, 152–153, 155–156 | INPUT: setKeyBinding, resetKeys, consumeShiftDown, keyLabel | reserved and malformed keys are refused; either Shift is one key | Same per-file limit above. |
| 159–175 | 166–167, 171–174 | INPUT: setKeyBinding, getKeyMap | a saved map round-trips; garbage in it falls back per action | Same per-file limit above. |
| 177–183 | 180, 182 | INPUT: throttle, setKeyBinding | a held pedal is released when its key changes meaning | Same per-file limit above. |
| 185–194 | 187–193 | INPUT: keyLabel | key names read like key caps | Same per-file limit above. |
| 198–207 | 200–206 | INPUT: getPadMap, padsAreDefault, padBindings | controller defaults are the standard layout the game always had | Same per-file limit above. |
| 209–230 | 213–214, 216, 218, 220, 223, 225, 227, 229 | INPUT: poll, debugState, throttleLevel, setPadBinding, consumeBoostToggle | a rebound button drives and the old one stops answering | Same per-file limit above. |
| 232–242 | 235, 237–239, 241 | INPUT: setPadBinding, getPadMap, padsAreDefault, resetPad | a button another action held is taken from it, and the caller is told | Same per-file limit above. |
| 244–254 | 248–249, 251–253 | INPUT: setPadBinding, resetPad, getPadMap | D-pad 14/15 and malformed buttons are refused; button 9 is accepted and transfers PAUSE ownership (the historical test title still says pause is refused) | Same per-file limit above. |
| 256–271 | 262–264, 266, 270 | INPUT: padCapture, poll, consumeOvertake, debugState | an armed capture takes the first press and the frame does nothing else | Same per-file limit above. |
| 273–289 | 279, 284–288 | INPUT: setPadBinding, getPadMap | a saved controller map round-trips; garbage in it falls back per action | Same per-file limit above. |
| 291–302 | 295–297, 299–301 | INPUT | an action the save predates keeps its default only where the player has not used that key | Same per-file limit above. |
| 304–315 | 306–310, 312–314 | INPUT: padLabel | button names follow the connected pad's family | Same per-file limit above. |
| 323–332 | 325, 328, 331 | INPUT: keyboardSeen | Input.keyboardSeen latches on a key outside a field, never on typing | Same per-file limit above. |
| 334–347 | 336, 338, 341, 343, 346 | INPUT: activeInputSource, poll | Input.activeInputSource follows real activity, not connected-device presence | Same per-file limit above. |

## tests/unit/keyboard-first-audio-vm.test.mjs

SHA-256: `97b5209654d97f683ac9d19ce5d32310e4db4244c8498a29d1f7f61e53ac63cb`. Full read: 1–48.

createGame(carMeshes:false,onSandbox:install) + fake-audio-vm; synthetic Enter sent to window and document; settle real GameAudio/AudioPanel, 50 event-loop turns, one context/title track/menu. Escape after 100 turns leaves stub and zero contexts.

Limit: Real lazy audio modules with fake AudioContext that is already running; cannot prove WebKit activation unlock or audible playback.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 17–34 | 22, 28–32 | AUDIO | keyboard-first Enter on the title loads real GameAudio and title music | Same per-file limit above. |
| 36–48 | 45–46 | AUDIO | Escape alone does not pull LAZY_AUDIO (not an activation gesture) | Same per-file limit above. |

## tests/unit/knob-ab.test.mjs

SHA-256: `95f6133fad629265c39261751e6f9438ddc788a256fb549498fece59e604c5b4`. Full read: 1–40.

2 RGBA pixels show strict RGB delta threshold 12; dimension mismatch throws. Verdict examples require max(3x noise,noise+2pp); args validate knob/backend and wetness/set conversion. Mean is returned by production but this test only asserts pct, despite title.

Limit: Pure raw-byte/math/argument tests only; does not run browser screenshots or establish any current knob is visibly effective.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 11–19 | 14, 16–18 | KNOB | knob-ab: strict RGB delta >12 changes a pixel; pct is asserted at 0/50%, dimensions throw; mean is not asserted | Same per-file limit above. |
| 21–30 | 22–29 | KNOB | knob-ab: verdict needs max(3×noise, noise+2pp) — calibrated on the measured puddle A/Bs | Same per-file limit above. |
| 32–40 | 33–34, 36–39 | KNOB | knob-ab: args — --knob required, numbers checked, --wet feeds wetness, --set parses | Same per-file limit above. |

## tests/unit/kyalami-grandstand-orbit.test.mjs

SHA-256: `5a11a51693337b869ad397d0077b5dd6c705ca2b415f637c954ae2bbd2f757bb`. Full read: 1–89.

dualLiteOrbitEye 24–42 reconstructs 45/20/42 at h1.5; standVertsNear 44–55 tests radius6, relative heights8..22. Both gaps >=32, three S/F heroes, |lat|24..32 and zero stand-height vertices.

Limit: Source gap pins plus CPU vertex bubble, no occlusion ray or rendered trackside/orbit image. One day start pose.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 57–67 | 60–62, 64–66 | SCENE-K | kyalami main grandstand + S/F terrace gaps clear dual_lite orbit (~28 m) | Same per-file limit above. |
| 69–89 | 72, 77, 81–82, 85, 87–88 | SCENE-K | kyalami day S/F orbit eye is clear of main-stand mass; heroes emit | Same per-file limit above. |

## tests/unit/lamp-bake.test.mjs

SHA-256: `20f623350a3fb1a76eeb39ef8941d6ab5cfbb63801be6319a0155458812e09f3`. Full read: 1–600.

load 25–29, half decoder31–36, shader-term reader38–66 (helper assertions62–63), shaderPool80–97 independent diffuse oracle, texelIdx102–111, bilinear sampleAtlas115–126, interiorSum128–135; two stride15 lamps138–139. Covers sparse atlas, seams, two layers, height/road, cache/slices/prebake ownership, budgets, live-only and half encoding.

Limit: CPU VM bake and independent atlas/oracle math, plus shader/TLX source structure; no GLX/TLX/WGX shader execution, texture upload or player frame timing.

| Case range | Assertion spans | Production target | Meaning / expected behavior | Limits |
|---|---|---|---|---|
| 68–78 | 70–71, 73–77 | LAMP | the three lit shaders agree on the window power, the softener and the near clamp wiring | Same per-file limit above. |
| 141–162 | 145–146, 154, 156, 160–161 | LAMP: bake | the bake reproduces the shader's diffuse pool at texel centres (sampled through the atlas) | Same per-file limit above. |
| 164–187 | 180, 184, 186 | LAMP: bake | LAMP NEAR CLAMP changes the bake exactly where the lamp is closer than the clamp | Same per-file limit above. |
| 189–213 | 198, 210–212 | LAMP: bake | a surface ABOVE the lamp (N.L <= 0) gets no diffuse light, but the bounce still reaches it | Same per-file limit above. |
| 215–242 | 228–230, 232–233, 237–241 | LAMP: bake | tiles no lamp reaches are empty in the indirection and not stored | Same per-file limit above. |
| 244–282 | 259, 268, 275, 280 | LAMP: bake | slot gutters hold the neighbouring texels, so bilinear never bleeds across tiles | Same per-file limit above. |
| 284–295 | 290–294 | LAMP: bake | ground height feeds the bake; no known ground bakes nothing | Same per-file limit above. |
| 297–313 | 306–307, 309, 312 | LAMP: bake | the road surface wins over the terrain under it | Same per-file limit above. |
| 315–324 | 319, 321–323 | LAMP: forTrack | forTrack caches by light-set identity and near clamp | Same per-file limit above. |
| 326–341 | 332–333, 335, 338–340 | LAMP: forTrack, bake | a rebake on the same track waits for the input to settle, then runs in slices | Same per-file limit above. |
| 343–364 | 362–363 | LAMP: forTrack | a sliced rebake yields at least once per tile, so one frame never queries more than a tile of terrain | Same per-file limit above. |
| 366–378 | 373–374, 377 | LAMP: bake | the atlas stays near-square: no side over WebGL2's guaranteed 2048, slot origins exact in half | Same per-file limit above. |
| 380–392 | 384, 387–389, 391 | LAMP: forTrack, bake, reset | sync=false never blocks: a first bake mid-race is sliced and returns null until it lands | Same per-file limit above. |
| 394–432 | 405–406, 408–411, 418–420, 426–427, 429–431 | LAMP: prebake, gen, forTrack | menu prebake: sliced first bake, then the sync forTrack on the tap is a cache hit with the same texels | Same per-file limit above. |
| 434–443 | 439, 441–442 | LAMP: forTrack, reset, liveOnlyAt | reset drops the cached bake and track, so the next forTrack bakes afresh | Same per-file limit above. |
| 445–461 | 460 | LAMP: bake | the road splat leaves no hole on the outside of a tight turn | Same per-file limit above. |
| 463–471 | 470 | LAMP: bake | the road splat covers both edges out to the verge | Same per-file limit above. |
| 473–482 | 480–481 | LAMP: forTrack, shadowCol | shadowCol returns the shadow lamp's steady baked colour, not its live one | Same per-file limit above. |
| 484–499 | 490–494, 496–498 | LAMP: bake | the atlas stays under its texel budget on a circuit-sized extent | Same per-file limit above. |
| 501–512 | 506, 508–511 | LAMP: forTrack | forTrack keys its cache on the texel budget | Same per-file limit above. |
| 514–529 | 525–528 | LAMP: bake | the second layer bakes the bounce fill (no cone, soft N.L floor) | Same per-file limit above. |
| 531–538 | 535, 537 | LAMP: toHalf | toHalf round-trips irradiance-range values | Same per-file limit above. |
| 540–548 | 543–547 | LAMP | TLX setLampBake frees its light map on the off path (GLX _bakeOffN parity) | Same per-file limit above. |
| 550–574 | 557, 559, 561, 567–568, 572–573 | LAMP: bake, forTrack, liveOnlyAt, gen | live-only lamps (lens < 3 m over its surface, or cosOuter > 0.9) stay out of the bake | Same per-file limit above. |
| 576–583 | 578–582 | LAMP: budget | budget: phones keep the half-memory atlas, desktop spends it on resolution | Same per-file limit above. |
| 585–600 | 596, 598–599 | LAMP: prebake, forTrack, gen | a sliced forTrack bake retires a pending menu prebake, so older lights never land over it | Same per-file limit above. |

Helper assertion spans outside cases: 62–63 (shader term must be found and repeated loop constants must agree). These enforce fixture/oracle preconditions and count as part of the mapped source.

## Coverage ledger

224 source test registrations (231 runtime case registrations after the calibration reason loop expands eight reasons instead of one); 1182 direct assert-call sites inside registrations. All assertion spans above include source assertions, promise rejection/throw checks and nested fixture replies. Parameter loops are not evidence that their cases passed. Suites with VM/software geometry do not establish live renderer, physical input, Safari, audio or GPU behavior. No tests were run by this mapping lane.

## Fixture detail and reproducibility hashes

Node fixture sources were fully read: tests/fixtures/js-debugger/sample.fixture.mjs:1–11 deliberately has three tests (adds loops1500, scales, fails on purpose); lib.fixture.cjs:1–6 scales by2 at line4; live.fixture.cjs:1–7 exposes mul and exits after20s; spawner.fixture.mjs:1–7 starts a child which calls scale(5); vm.fixture.mjs:1–17 loads three rewritten copies of vmlib.fixture.js:1–6 (triple(1) at load, triple(2) later); hang.fixture.mjs:1–3 never completes. These were read, not launched.

Hashes identify the exact source snapshot mapped; line count covers each file, not a claim that every production file was fully read. Tests and the explicitly noted shared/Node fixtures were fully read; production was navigated with LSP and bounded source reads.

| Source/fixture | Lines | SHA-256 |
|---|---|---|
| `tests/helpers/key-binds-rig.mjs` | 210 | `502049f0d846fdc0b0da9256779a6a54fb7a058344a3ca536f6fff9242697db7` |
| `tests/helpers/js-debugger-rig.mjs` | 25 | `ca525493ad1a5e00d044d14d2688ffb1d5028dd575c49ccd95c8e3ec0f0aedc3` |
| `tests/helpers/editor-vm.mjs` | 48 | `ebbdbb10a8e175aa4b957975fb659e60c782cd62a17aa849d77997db602106df` |
| `tests/helpers/css-rules.mjs` | 113 | `31386fa434392a93826b1f8197b310378bf00eead431d10fd38a5130b9866a28` |
| `tests/unit/fake-audio-vm.cjs` | 36 | `bf3d952dddc793d791b722d55c1349d62e5a9e5b7987340086987356f94f7ec7` |
| `tools/lib/game-vm.cjs` | 880 | `2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0` |
| `tools/track/verify-track.cjs` | 458 | `6eb4174e4ce20105e81c76fcfde2c6b2199818aeb2e22ba4612b909127be0b8b` |
| `tools/mcp/js-debugger-session.mjs` | 533 | `79694d24df1f70ea46e7cffe6916be8ba03aece73d6c2f4284f2334a3e203720` |
| `tools/mcp/js-debugger-trace.mjs` | 394 | `a50ef40ef63495ff7629df0c63e5fa9285e70e40e0fdc7f9babbfb08e41a477c` |
| `tools/mcp/js-debugger-workflow.mjs` | 166 | `ba12ef14c1e5e3720f9c292fcf86ad6a7ed03a192756ffe40933dba9960badec` |
| `tools/mcp/js-debugger-node.mjs` | 291 | `5bb491b061fa842e4f1edc61943f8a9dd3cbceb6ae689badc638c6f349d8bb7f` |
| `tools/mcp/js-debugger-cdp.mjs` | 101 | `4d498967cd1fe43943a8fbc3c852d2e754406859bc0682d1e96f3a086ff12b29` |
| `tools/mcp/js-debugger-mcp.mjs` | 219 | `81edb302fa15e0950577458a9c0713eb8264c59a0fe792947ad97ab2fb35afec` |
| `tools/mcp/js-debugger-http.mjs` | 116 | `68f95d9d39e7a2ddb77ac401e42cdc843bd07e2a508404072af713934770dfed` |
| `tools/mcp/js-debugger-cli.mjs` | 94 | `c868fba6ebf0801ba79da27bf8f65f5e13998ba1c55db86c69a01c53115a7990` |
| `tools/mcp/js-debugger-mcp.sh` | 5 | `2e3d415324b6d2ad16c8f7b52f868f9e2666bb634b5f42afd27b722e8dc2dd10` |
| `tools/agent/output.mjs` | 214 | `bca1237120e9c2b01ce9ace56b000df5c385d639f3f5a726ece9f43b3650c050` |
| `tools/gfx/knob-ab.mjs` | 157 | `457bbfe4b8c987fd2b3653ded84801e0bf24863516ed4b198a97b05ad27d1a2e` |
| `js/input/input.js` | 2624 | `cb7c8f371e27b0b5862fafc0327f896f80f778948e7a7778ea8380707c356de2` |
| `js/input/bindings.js` | 319 | `c6ab198929edc778cc7d23b6b573f2d7c6feb608283f2b160d4ee8a819ea03e4` |
| `js/input/pad-menu.js` | 286 | `d2b3a3b58c89b25b15742bd6fd39eefb9a39a71e833a48a59f7b14bce1a56abe` |
| `js/input/hold-buttons.js` | 211 | `9727946b9132cd9e5694b85ff624953e5573a7aa52560a9e85d59c9c762d3ff7` |
| `js/input/controller-profiles.js` | 65 | `1f77c255a0b139dff2ccad6562de4c6ead8119eea6f12387e1ad7cc3708effc0` |
| `js/ui/key-binds.js` | 692 | `f4463ed116b5ddfe9ae84a150308da236869af2fb262c8ebe6c13b524d0c416f` |
| `js/ui/onboard.js` | 192 | `424fba3955a06669239dfda95ffee717e3abf4849df873c73b739d2bdf3f2e27` |
| `js/ui/settings-export.js` | 1348 | `f88dcf1dfe421bd91f8777328723045a6c7336a375e81cb372a2137bccf8ebf3` |
| `js/lighting/lamp-bake.js` | 559 | `45d2bc33ba3557469a6aa7e77d98a03b81c559163a500a2444e5f9143bebdeeb` |
| `js/race/jump-start-penalty.js` | 71 | `6a7ff63942aaa42f405d4497d3ced408709bdb848de5f1a360b169e15604d0f1` |
| `js/race/sporting-regs.js` | 306 | `16b56fc69ebb783d47fa19c2658d6d368c56fc0a0c656899615f6203dcb06652` |
| `js/core/lazy-bundles.js` | 842 | `1a25b67bbb1041ef6d4d50cf1c988d101b9ec9026993cb930ff1accec9660e52` |
| `js/camera/flyby-sight.js` | 606 | `10da211ec693f246c1c58be3de47e5e8b2fc17b0c1d5bb4f2901c038ccb0614a` |
| `js/camera/flyby-seq.js` | 2145 | `8341ed7ed0f871ae5f90bab851dc3f1a9628122972ee54e32c7b8480591b9d97` |
| `js/agent/apex-cam.js` | 368 | `5314cdd69c30468bb05f88a0f8795210af2add8e0d71bd83b1552915ce649a5f` |
| `js/track/core/mesh.js` | 1575 | `8e73c2816f2fa9bf1c711813533e7c87c89a551be7556b90469364b308f8585c` |
| `js/track/core/surface.js` | 182 | `a727c04aef70838131ea2bcca9751f4ffdb3dc8ffd7e8f5b93591d439aa21653` |
| `js/track/tracks.js` | 860 | `62abbda18aae41e6e016b4fdc1a6dbd346810f72c92058521405fd0b7149f9bb` |
| `js/circuits/scenery/jeddah.js` | 840 | `684b20348eabad3f3ef72d43d2049a90b2ec81fb4aa6b5ad1b1948c91084e32b` |
| `js/circuits/scenery/kyalami.js` | 593 | `23759f0442beb731f97ed9b0bc11f5c74bf119f22074f190670ab816b07b128c` |
| `js/render/glx/shaders/glsl-lit.js` | 2295 | `8b1364935ccf293ecd336c76c67203cb633eed77fc5bdc421fe1bb1e90f8d352` |
| `js/render/three/tsl-lit.js` | 2957 | `61b7e28fd524054b51f502570a47dea49e86c5313a3836a4680289130fced886` |
| `js/render/webgpu/wgsl-chunks.js` | 2636 | `b292f62c1e082cc021ac6c566f9ac03a10c1e9b39dae2be6217fc8c645b060ee` |
| `controller.html` | 516 | `9e5d6e92b826d28db4595e2e117e08d314c54682afee618f4e7ee80211618d46` |
| `index.html` | 3970 | `198787c00ff4055628ee7c524dff5453c5bc90ee6724948304d4f41d32499348` |
| `css/editor.css` | 805 | `84bc725fdf958e1c72a06e43a0146b44424e62e8392b83373aba8a23f1a43df4` |
| `css/tokens.css` | 1361 | `baba959f43def9a6140099f4554f763dcf5566df1182bb9a8afd12dbceba007a` |
| `css/race-setup.css` | 706 | `57666de08cc805e268a7df72e2086c242b19a127db6cd9e5efc4ecf3a70ab061` |
| `css/tuner.css` | 1509 | `50f6c5c0d39e3acb7a7bd95ac02b72dbfc729de7904cd3c1025f29fb668e82ac` |
| `.mcp.json` | 83 | `62da68560e1725e09f58e55c8b37d5bca279f22382e809cb08504de1c04c1114` |
| `.cursor/mcp.json` | 83 | `62da68560e1725e09f58e55c8b37d5bca279f22382e809cb08504de1c04c1114` |
| `tools/mcp/js-debugger-mcp.json` | 9 | `bca08c1e112a187263a10b0ed6c035780e1c08d73899b6084cc4d70b00f5e0d1` |
| `tests/fixtures/js-debugger/hang.fixture.mjs` | 3 | `145e245e89d209eb98e79d7f776357edfd3aae2f171d0d947e2e6da5c376e60a` |
| `tests/fixtures/js-debugger/lib.fixture.cjs` | 6 | `5d56ad3a2795a593f519e04e17673ef6cdaf2a3d538418d54982ad4917b149da` |
| `tests/fixtures/js-debugger/live.fixture.cjs` | 7 | `e7e59955ef4371b8f422925d3b2e473d63e215143a0ca723760257bfc117e382` |
| `tests/fixtures/js-debugger/sample.fixture.mjs` | 11 | `14cad0f6896974d6747382ead9e460e5d54eac37e7f55bd01ad3a630612a1ad8` |
| `tests/fixtures/js-debugger/spawner.fixture.mjs` | 7 | `fe0c2f74cbf79b9792b577b3eda265f6cc62f9f8c490eab65f4674becc03d74b` |
| `tests/fixtures/js-debugger/vm.fixture.mjs` | 17 | `45e4e4de027b56ae702a0b15c05a5822db9543a84a8ec96bd56906717ae2919f` |
| `tests/fixtures/js-debugger/vmlib.fixture.js` | 6 | `e130b83c928dc6e8126d67ac166044620ef8a3140a0429246512cbaa3354164d` |
