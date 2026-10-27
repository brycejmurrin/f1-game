# Performance complete source map

## Goal, source and coverage
All 20 js/perf files / 7,277 lines fully read by GPT-6.1 Sol complete_core at c4dc493d9 in nontruncated contiguous chunks; all globals corroborated through attached LSP. No browser or benchmark run; historical device measurements were not remeasured.

| File | Full range | Contract |
|---|---|---|
| bench-capture.js | 1–344 | Per-leg bounded telemetry, GPU/link/compile hooks and crash breadcrumbs; identity-safe restoration. |
| bench-run.js | 1–592 | Persisted cross-reload benchmark plan, original settings restore, timed scene/DOM legs and result UI. |
| gfx-debug-overlay.js | 1–291 | Optional independent diagnostic interval surviving dead game loop. |
| gfx-escalation.js | 1–114 | Per-tab recovery episode ledger and menu/terminal fallback. |
| governor.js | 1–1244 | Measured scale/tier ladder, causal rollback/probation, mobile crash sentinel and drift/rate integration. |
| gpu-test-run.js | 1–197 | Controlled SoakRun phases, GPU/pixel/mirror observations and cleanup. |
| loop-health.js | 1–225 | Bounded fault policy and independent stall watchdog with suspend/automation guards. |
| menu-quit-tail.js | 1–29 | Injected post-overlay resource and state cleanup. |
| menu-teardown.js | 1–104 | Software-render cover, duration ring and deferred UI work. |
| metrics-overlay.js | 1–1201 | On-demand diagnostics and settings; own display rAF with 250ms paint throttle. |
| phone-recorder.js | 1–524 | Bounded independent device/session telemetry recording, killed-tab adoption and export. |
| quality-preset.js | 1–259 | Quality defaults, user floor and deferred reload boundary. |
| race-entry-profile.js | 1–453 | Generation-scoped entry spans, cover/warm/present marks and SessionEntry outcome ownership. |
| render-rate.js | 1–135 | Phone refresh-aware half/fixed-rate gates and accumulated draw dt. |
| renderer-picker.js | 1–978 | Stored-vs-live backend state, confirmed reload, recovery keys and unavailable screen. |
| soak-run.js | 1–166 | Explicit bounded test-input autopilot through human physics; recording/pause lifecycle. |
| spans.js | 1–129 | Optional named timing rings and feature-detected LoAF/User Timing. |
| thermal-drift.js | 1–64 | Pure warm/baseline/window drift policy and step cooldown. |
| three-inspector.js | 1–121 | Optional dynamic inspector and timestamp-timer conflict ownership. |
| title-warm.js | 1–107 | Quiet/visible/title gated speculative menu preparation and build-scoped warm record. |

## Data flow
Game wires PerfGov, RenderRate, PerfSpans and LoopHealth to its frame loop; RaceEntryProfile joins SessionEntry, startup and presentation. Quality supplies user floor and consumers distinguish measured auto tier from effective floor. ThermalDrift can affect rate and ladder. Metrics lazily requests agent telemetry; debug overlay uses an independent timer. PhoneRecorder is driven by SoakRun/GpuTestRun, with BenchRun coordinating persisted reload legs and BenchCapture per-leg observation. Picker and escalation share recovery state. Inspector manages a separate renderer-timing conflict. TitleWarm reuses game menu preparation.

## LSP evidence
All 20 module globals queried. PerfGov: 185 references / 29 files; RaceEntryProfile: 81 / 8; RendererPicker: 46 / 12. Source reads establish consumer and cleanup contracts, not runtime capability.

## Verified comment discrepancies
- governor sentinel comment near 345 says menu world builds arm active; game 1964–2040 gates arming to count/race and explicitly excludes menu.
- governor near 1138 says tier not touched, though preceding quality-raise branch resets measured tier/shedding. Narrow the condition described.
- bench-capture.js:14 says no URLs beyond path; clean() retains scheme/host/path, dropping query/hash.
- phone-recorder.js:15 claims only counter cost per callback; actual callback observes rate and serializes mode state, with periodic recording/painting.
- metrics-overlay.js:18 calls rAF tick about 4Hz; rAF callback runs at display cadence, paint is throttled to 250ms.
- BenchRun header says final reload only if renderer changed; finishPlan unconditionally reloads for fresh title.

## Candidate requiring runtime evidence
LoopHealth extracts document.getElementById then invokes it unbound for sheet checks, unlike bound calls elsewhere. Native WebIDL may reject it and the caught error may bypass cover relaxation; browser confirmation required before calling this a verified behavior defect.

## Remaining goal
Performance source read complete. All consumer bodies, hardware behavior and recording overhead remain unverified. Parent owns report validation/commit and remaining project backlog.
