> Continuation completed: the remaining ranges recorded in this initial checkpoint were subsequently fully read and mapped in tests-unit-02a-complete.md, tests-unit-02b-complete.md and tests-unit-02c-complete.md. The original ledger below is retained as provenance.

# Unit tests 02: positions 36–70 (continuation required)

Scope: sorted `git ls-files tests/unit`, positions 36–70 inclusive. Static review; no tests or browsers run.

## Exact file list

36. `tests/unit/ai-trail-yield-vm.test.mjs`
37. `tests/unit/albert-park-foundation.test.mjs`
38. `tests/unit/all-lights-fill.test.mjs`
39. `tests/unit/always-lamp-floor.test.mjs`
40. `tests/unit/ambient-env-override.test.mjs`
41. `tests/unit/announcer.test.mjs`
42. `tests/unit/apca-timing.test.mjs`
43. `tests/unit/apex-arg-guards.test.mjs`
44. `tests/unit/apex-cam-fallback.test.mjs`
45. `tests/unit/apex-career-delete.test.mjs`
46. `tests/unit/apex-diag-canvas.test.mjs`
47. `tests/unit/apex-memory.test.mjs`
48. `tests/unit/apex-physstate.test.mjs`
49. `tests/unit/apex-server-fixes.test.mjs`
50. `tests/unit/apex-tools-mcp.test.mjs`
51. `tests/unit/appearance-opts.test.mjs`
52. `tests/unit/appearance-steppers-tap.test.mjs`
53. `tests/unit/appearance-studio.test.mjs`
54. `tests/unit/appearance-sunlight-chrome.test.mjs`
55. `tests/unit/archive-sessions.test.mjs`
56. `tests/unit/assert-audit.test.mjs`
57. `tests/unit/assert-match-ratchet.test.mjs`
58. `tests/unit/assets-pack.test.mjs`
59. `tests/unit/assets-verify-material-md5.test.mjs`
60. `tests/unit/async-lifecycle.test.mjs`
61. `tests/unit/audio-mix-improvements.test.mjs`
62. `tests/unit/audio-panel-boot.test.mjs`
63. `tests/unit/audio-panel-settings-ui.test.mjs`
64. `tests/unit/audio-recovery.test.mjs`
65. `tests/unit/audio-sample-upgrade.test.mjs`
66. `tests/unit/audio-tune.test.mjs`
67. `tests/unit/audit-circuit.test.mjs`
68. `tests/unit/audit-summary.test.mjs`
69. `tests/unit/backend-surface-parity.test.mjs`
70. `tests/unit/badges.test.mjs`

## Hash and range ledger

| Position | File | SHA-256 | Lines | Planned bounded ranges (not a completion claim) |
|---|---|---|---:|---|
| 36 | `tests/unit/ai-trail-yield-vm.test.mjs` | `be9d25e9cd1f7562ead74ca9fdf7570401f4bab8c68fc4d74556e12064d5445d` | 52 | 1–52 |
| 37 | `tests/unit/albert-park-foundation.test.mjs` | `5d04add2b47980d438ebb31305f9d3cf8cf4f37f9d658405c371a4ec6bfce086` | 69 | 1–69 |
| 38 | `tests/unit/all-lights-fill.test.mjs` | `2b979a80da5f38662476e75e82a66a47a0caaccccd81750ac34b221a150c8235` | 311 | 1–180, 181–311 |
| 39 | `tests/unit/always-lamp-floor.test.mjs` | `7ea6b41987ee9ece6b4d0cd19920d9a026f124893adc81d02ef69215da239f24` | 60 | 1–60 |
| 40 | `tests/unit/ambient-env-override.test.mjs` | `08fec3c0f13333fa1cc7056c802bdc88f24e5c4f83a1200fc1529bc294e0a2d9` | 119 | 1–119 |
| 41 | `tests/unit/announcer.test.mjs` | `1facd23167650ecdaf7a6bb5c47c9f657cc13a91ace8e958c681eee43a02a836` | 1325 | 1–180, 181–360, 361–540, 541–720, 721–900, 901–1080, 1081–1260, 1261–1325 |
| 42 | `tests/unit/apca-timing.test.mjs` | `06e366e9397210d4a4bc97634b6b2bf5e4c4295ae09526ba81a7bd3e473b81cd` | 156 | 1–156 |
| 43 | `tests/unit/apex-arg-guards.test.mjs` | `80c2f77da3a76b0ddb5cbd7fc4960488a36b500fd3a8d5364331abd088d7c00d` | 93 | 1–93 |
| 44 | `tests/unit/apex-cam-fallback.test.mjs` | `8a05d02cf4188464268b8a0b76913abe4d02ccc39cd81cf7c84b5f0170d9a0d2` | 84 | 1–84 |
| 45 | `tests/unit/apex-career-delete.test.mjs` | `708057d3f835c58533fbc45fcb9523e566cfc916797605748653e2bc809cf9ed` | 93 | 1–93 |
| 46 | `tests/unit/apex-diag-canvas.test.mjs` | `818d75751f1a072378a298d39972c671b5d280f63bfc92cefd60a22624c093a4` | 57 | 1–57 |
| 47 | `tests/unit/apex-memory.test.mjs` | `b116db5760ca2713f0cc27b3f75845066cc830a174fbb723bd78cf80297971c2` | 84 | 1–84 |
| 48 | `tests/unit/apex-physstate.test.mjs` | `d61038bf6b6f4e21c21a2ba69e03230c2c9569d7a75c88ccb5ef6bb334dc48b1` | 34 | 1–34 |
| 49 | `tests/unit/apex-server-fixes.test.mjs` | `aaf17ba2128d677d5d084f011c3bdfc95d9fce9940706f46cf2e318380e3c997` | 375 | 1–180, 181–360, 361–375 |
| 50 | `tests/unit/apex-tools-mcp.test.mjs` | `a53fa8f5f0b909a27b7ca506eb126c130d5702fcfed61c05fb8427d2c54e1808` | 3165 | 1–180, 181–360, 361–540, 541–720, 721–900, 901–1080, 1081–1260, 1261–1440, 1441–1620, 1621–1800, 1801–1980, 1981–2160, 2161–2340, 2341–2520, 2521–2700, 2701–2880, 2881–3060, 3061–3165 |
| 51 | `tests/unit/appearance-opts.test.mjs` | `3ce674c03a043e8d3f409119a416eaa1c5b04f4af353b3c07f405b8517377061` | 605 | 1–180, 181–360, 361–540, 541–605 |
| 52 | `tests/unit/appearance-steppers-tap.test.mjs` | `3ad5034c687c0bd4117dbef073c07832531f0a6171962601918f01e7a4ca6e7b` | 45 | 1–45 |
| 53 | `tests/unit/appearance-studio.test.mjs` | `915d1b29eba189e07f612cf4d3f309d3f2cc54d9da65325744d7f59926765904` | 570 | 1–180, 181–360, 361–540, 541–570 |
| 54 | `tests/unit/appearance-sunlight-chrome.test.mjs` | `9525dd28f048f7e95182e96936db63ba83791c89f46b11c232cdeba282f831b8` | 83 | 1–83 |
| 55 | `tests/unit/archive-sessions.test.mjs` | `139b66b5df8eeeca2b11923cedd4a72cd9c589af8ff078877e4cda374c351159` | 139 | 1–139 |
| 56 | `tests/unit/assert-audit.test.mjs` | `468ea14caffa10aef6e4aa11551722dd5916e155db9d7fd12ffe3e5da6a35657` | 180 | 1–180 |
| 57 | `tests/unit/assert-match-ratchet.test.mjs` | `6ceb0b6476581d9feee9fa575babd8d0115fb801ada8c3e9df59392117e20887` | 44 | 1–44 |
| 58 | `tests/unit/assets-pack.test.mjs` | `a0ff5fe0011ac40aed4fbfea39b0dee59541f18bfc1cf008fb6dbab85fdd67aa` | 2360 | 1–180, 181–360, 361–540, 541–720, 721–900, 901–1080, 1081–1260, 1261–1440, 1441–1620, 1621–1800, 1801–1980, 1981–2160, 2161–2340, 2341–2360 |
| 59 | `tests/unit/assets-verify-material-md5.test.mjs` | `069d36f3b8ed87c3942c484e46ecba1cc682805cbf2ab4ab9b36ae238c36331f` | 95 | 1–95 |
| 60 | `tests/unit/async-lifecycle.test.mjs` | `b14925fa3145094cd4b7f2ceaa3d760f74a73c8688d9d73018fbfc1f238e910d` | 686 | 1–180, 181–360, 361–540, 541–686 |
| 61 | `tests/unit/audio-mix-improvements.test.mjs` | `6cf3b5a39623204b53050a05078987a18972c615fd329eb1f0707ef21bed3077` | 77 | 1–77 |
| 62 | `tests/unit/audio-panel-boot.test.mjs` | `b36f213e155f3310d45bff2d368be85b684b5f7b07f6deb9956484e8ac8da742` | 236 | 1–180, 181–236 |
| 63 | `tests/unit/audio-panel-settings-ui.test.mjs` | `f273c76dcd2c6a75c4f83834c3a56344b29bdd6ebbd8434bf9914d49a3fd28e2` | 208 | 1–180, 181–208 |
| 64 | `tests/unit/audio-recovery.test.mjs` | `b5b2cb4d2bde4e70aff28a456adfad49e4484361c23b8cfd7eebd9bc13ffffe8` | 827 | 1–180, 181–360, 361–540, 541–720, 721–827 |
| 65 | `tests/unit/audio-sample-upgrade.test.mjs` | `f57e9e410f668dc3bb30b44bb0b9d2f0733feebcf47ad1d705017f8c61849b75` | 290 | 1–180, 181–290 |
| 66 | `tests/unit/audio-tune.test.mjs` | `ef2179fb49c5b3630771094dae2c9bb864be21d608a3042de5d2f89f71e54570` | 2548 | 1–180, 181–360, 361–540, 541–720, 721–900, 901–1080, 1081–1260, 1261–1440, 1441–1620, 1621–1800, 1801–1980, 1981–2160, 2161–2340, 2341–2520, 2521–2548 |
| 67 | `tests/unit/audit-circuit.test.mjs` | `dd05716bcb28d314831e3b3a81f7a4a63cf0bf9803d0385e2708f5fafad25103` | 127 | 1–127 |
| 68 | `tests/unit/audit-summary.test.mjs` | `9d907f81c64ca92424639f7e34d6e887bde4a59d40a01b33a07454d77499c3bb` | 165 | 1–165 |
| 69 | `tests/unit/backend-surface-parity.test.mjs` | `01e8f89d0017336e04e7bcd161de951d82b8f33ae37190436a2fad4a704a436f` | 108 | 1–108 |
| 70 | `tests/unit/badges.test.mjs` | `c957675a76115bc401e51c69a963a85f2b4e484f29b09287c9c47da98adf7207` | 174 | 1–174 |

## Actual read status and exact continuation backlog

This lane fully read 25 of 35 test files. The filename is the requested output name; it does **not** assert completion. Initial oversized reads were truncated and are not credited beyond the explicit ranges below. Production lookups are bounded navigation evidence, not claims of whole-production-file review. No tests or browsers ran.

| File | Credited full-source read | Remaining full-source read |
|---|---|---|
| `tests/unit/ai-trail-yield-vm.test.mjs` | 1–52 | none |
| `tests/unit/albert-park-foundation.test.mjs` | 1–69 | none |
| `tests/unit/all-lights-fill.test.mjs` | 1–311 | none |
| `tests/unit/always-lamp-floor.test.mjs` | 1–60 | none |
| `tests/unit/ambient-env-override.test.mjs` | 1–119 | none |
| `tests/unit/announcer.test.mjs` | none | 1–1325 |
| `tests/unit/apca-timing.test.mjs` | 1–156 | none |
| `tests/unit/apex-arg-guards.test.mjs` | 1–93 | none |
| `tests/unit/apex-cam-fallback.test.mjs` | 1–84 | none |
| `tests/unit/apex-career-delete.test.mjs` | 1–93 | none |
| `tests/unit/apex-diag-canvas.test.mjs` | 1–57 | none |
| `tests/unit/apex-memory.test.mjs` | 1–84 | none |
| `tests/unit/apex-physstate.test.mjs` | 1–34 | none |
| `tests/unit/apex-server-fixes.test.mjs` | none | 1–375 |
| `tests/unit/apex-tools-mcp.test.mjs` | none | 1–3165 |
| `tests/unit/appearance-opts.test.mjs` | 1–180 | 181–605 |
| `tests/unit/appearance-steppers-tap.test.mjs` | 1–45 | none |
| `tests/unit/appearance-studio.test.mjs` | 1–180 | 181–570 |
| `tests/unit/appearance-sunlight-chrome.test.mjs` | 1–83 | none |
| `tests/unit/archive-sessions.test.mjs` | 1–139 | none |
| `tests/unit/assert-audit.test.mjs` | 1–180 | none |
| `tests/unit/assert-match-ratchet.test.mjs` | 1–44 | none |
| `tests/unit/assets-pack.test.mjs` | none | 1–2360 |
| `tests/unit/assets-verify-material-md5.test.mjs` | 1–95 | none |
| `tests/unit/async-lifecycle.test.mjs` | none | 1–686 |
| `tests/unit/audio-mix-improvements.test.mjs` | 1–77 | none |
| `tests/unit/audio-panel-boot.test.mjs` | 1–236 | none |
| `tests/unit/audio-panel-settings-ui.test.mjs` | 1–208 | none |
| `tests/unit/audio-recovery.test.mjs` | 1–160 | 161–827 |
| `tests/unit/audio-sample-upgrade.test.mjs` | none | 1–290 |
| `tests/unit/audio-tune.test.mjs` | none | 1–2548 |
| `tests/unit/audit-circuit.test.mjs` | 1–127 | none |
| `tests/unit/audit-summary.test.mjs` | 1–165 | none |
| `tests/unit/backend-surface-parity.test.mjs` | 1–108 | none |
| `tests/unit/badges.test.mjs` | 1–174 | none |

The following sections cover only fully read files. An AST-derived per-test locator list below is an aid to navigation after the full-source read, not a replacement for it. Unread files intentionally have no completed semantic map.

## Fully read file maps

LSP navigation used attached apex-lsp definition tools for AiDrive.trailYieldStep, FrameLights, Atmosphere, ApexApi, ApexCam, AppearanceOpts/Studio, Announcer, GameAudio, RaceMixAudition, GameAudioSoundtrack, MusicLib, DailyChallenge, GLX/WGX/TLX and Badges. `FrameLights.*`/`Badges.forRace` results explicitly reported module-file fallback with export/caller coverage unverified. GameAudio/Announcer/Soundtrack have intentional lazy stubs; paths below identify full owners. Non-JS tool and CSS anchors came from direct source reads/text navigation under code-nav.

Each test locator identifies the exact body span and direct assertion spans. The target and fixture paragraph applies to all tests in that file; behavior-specific assertions remain at those linked source ranges. Helpers can hold additional assertions, so direct count is not a total runtime assertion count. Loop-generated titles remain templates; this preserves cases instead of inventing runtime test totals.

### tests/unit/ai-trail-yield-vm.test.mjs

Production targets: js/physics/ai-drive.js:900 (AiDrive.trailYieldStep), js/game.js:5020 caller; tools/lib/game-vm.cjs fixture.

Fixtures and boundaries: Real createGame VM, monza, seed 1, 20 laps, AI-only; selects pair near 0.6% pace difference, retires others, puts faster car 30 m behind at raceT 30.

Assertions and implications: 60 seconds at 60 Hz: faster car must pass by >5 m, slower car must set _trYT, and no frame may overlap within longitudinal 4.8 m and lateral 2 m. Covers integrated yield, not just an exported formula. One seed, one permanent circuit, and narrow pace band do not establish global passing quality.

- [L22–52](../../tests/unit/ai-trail-yield-vm.test.mjs#L22) a quicker AI held behind a slower one completes the pass within a minute (#2356). Direct assertions: ok@34, ok@49, equal@50, equal@51.

### tests/unit/albert-park-foundation.test.mjs

Production targets: tools/manifest.cjs circuitPath/sceneryPath; js/circuits/albert_park.js; js/circuits/scenery/albert_park.js.

Fixtures and boundaries: VM loads the real circuit definition into window.TrackDefs; concatenates actual track/scenery sources for helper presence.

Assertions and implications: Pins racing coordinates, flat terrain, terrainOuter≥90, bounded elevation rises/spread, full-lap foliage exclusion and absence of blanket lighting exclusion. Source checks require waterSurface/groundPatch and a non-voided lakeside cityFront call. Those checks prove authoring shape, not grounded geometry or a visible skyline.

- [L28–37](../../tests/unit/albert-park-foundation.test.mjs#L28) Albert Park uses an explicit essentially-flat racing-space terrain contract. Direct assertions: equal@30, equal@31, ok@32, ok@33, ok@34, ok@36.
- [L39–50](../../tests/unit/albert-park-foundation.test.mjs#L39) Albert Park excludes shared foliage for bespoke park densification. Direct assertions: ok@46, ok@48–49.
- [L52–56](../../tests/unit/albert-park-foundation.test.mjs#L52) Albert Park uses typed foundation helpers for water and grounded runoff. Direct assertions: match@54, match@55.
- [L61–69](../../tests/unit/albert-park-foundation.test.mjs#L61) Albert Park CBD skyline uses cityFront beyond the lake (#3349). Direct assertions: equal@66, equal@67–68.

### tests/unit/all-lights-fill.test.mjs

Production targets: js/lighting/frame-lights.js:28 appendCarTailLights; :659 setFrameLights; js/render/shared/light-budget.js; js/lighting/knobs.js.

Fixtures and boundaries: Whole FrameLights IIFE in VM, some export-list replacements guarded by anchors; distinct stride-15 arrays, deterministic flicker/clock, real budget defaults in selected cases, stub Tracks.sample.

Assertions and implications: Eight tests cover pooled nearest-tail selection under sorting/shrink/regrowth, emit-off halos preserving lamp slots, full rewrite parity across source swaps and RGB changes, generation bumps even when only static lanes move, pooled buffer identity, 50 ms tint hold and immediate source/scale/function/backwards-clock invalidation, lampSetGen isolation, and 24/16 slot traffic limits. Does not execute GPU upload or shaders.

- [L26–61](../../tests/unit/all-lights-fill.test.mjs#L26) tail-light selection reuses capacity through sorting, shrink and regrowth. Direct assertions: ok@29, equal@46, equal@47, deepEqual@49, ok@55, equal@56, ok@60.
- [L63–91](../../tests/unit/all-lights-fill.test.mjs#L63) TAIL-LIGHT EMIT 0: tail-lights take no light slot but keep their halo. Direct assertions: equal@79, deepEqual@80, equal@81, equal@82, deepEqual@83, equal@88, equal@89, equal@90.
- [L138–160](../../tests/unit/all-lights-fill.test.mjs#L138) every lane matches a full rewrite, across a flicker sequence and a source swap. Direct assertions: equal@155, equal@157–158.
- [L162–197](../../tests/unit/all-lights-fill.test.mjs#L162) the generation counter still moves exactly when consumers need it to. Direct assertions: equal@172, notEqual@174, notEqual@176, notEqual@189–190, equal@196.
- [L201–228](../../tests/unit/all-lights-fill.test.mjs#L201) the flicker-only re-tint is held for 50 ms of wall clock; a scale or source change lands at once. Direct assertions: equal@207, equal@212, equal@215, notEqual@217.
- [L230–257](../../tests/unit/all-lights-fill.test.mjs#L230) frame.lampSetGen moves with the lamp set and its scale, never with the flicker. Direct assertions: equal@249, ok@252, notEqual@254, notEqual@256.
- [L263–295](../../tests/unit/all-lights-fill.test.mjs#L263) phone 24-slot budget: real setFrameLights cull + emit tails stay inside the shader cap. Direct assertions: equal@287, equal@288, ok@292, equal@294.
- [L297–311](../../tests/unit/all-lights-fill.test.mjs#L297) lampCap with traffic never budgets above LightBudget.slots(), phone tier included. Direct assertions: ok@300, equal@309, equal@310.

### tests/unit/always-lamp-floor.test.mjs

Production targets: js/lighting/frame-lights.js:659–687 setFrameLights; js/render/shared/light-budget.js.

Fixtures and boundaries: Whole VM module, real LightBudget, knobs stub with disabled warm-up/flicker, one stride-15 lamp.

Assertions and implications: Three cases assert always-on srcSet applies 0.13 RGB floor when scale 0, main set stays off at scale 0, and scale 0.26 stays above floor. The game.js choice to pass srcSet is described but not executed.

- [L35–43](../../tests/unit/always-lamp-floor.test.mjs#L35) always-on srcSet uses alwaysLampFloor when lampLevel is 0. Direct assertions: equal@41, equal@42.
- [L45–51](../../tests/unit/always-lamp-floor.test.mjs#L45) main lamp set ignores alwaysLampFloor at day lampLevel 0. Direct assertions: equal@50.
- [L53–60](../../tests/unit/always-lamp-floor.test.mjs#L53) night always-on keeps lampLevel when above floor. Direct assertions: equal@59.

### tests/unit/ambient-env-override.test.mjs

Production targets: js/lighting/atmosphere.js:10 Atmosphere; js/render/shared/assets.js real environment resolver; js/lighting/knobs.js.

Fixtures and boundaries: Whole Assets/Atmosphere modules plus real log/mat4/default knobs. Only network/lighting build/globals are stubbed; manifest supplies exact and wildcard environment rows; deterministic Math.random.

Assertions and implications: Six tests distinguish authored palette vs missing ambient; exact-track keys override authored ambient and sky, wildcard keys fill absent fields or explicit TOD formula base, while both explicit/default night ignore pack environments. Anti-vacuity comparisons confirm the chosen fixtures actually differ. This tests CPU frame data, not final illumination.

- [L69–78](../../tests/unit/ambient-env-override.test.mjs#L69) a wildcard environment leaves an authored palette ambient alone on the default time of day. Direct assertions: deepEqual@72, deepEqual@73, deepEqual@74, deepEqual@75, notDeepEqual@77.
- [L80–87](../../tests/unit/ambient-env-override.test.mjs#L80) a wildcard environment fills in what the palette did not author. Direct assertions: notDeepEqual@84, notDeepEqual@85, deepEqual@86.
- [L89–94](../../tests/unit/ambient-env-override.test.mjs#L89) an exact <track>|<tod> key still overrides the authored palette (it is that circuit's measurement). Direct assertions: notDeepEqual@92, notDeepEqual@93.
- [L96–100](../../tests/unit/ambient-env-override.test.mjs#L96) on an explicit time of day the wildcard still replaces the formula base (nothing was authored there). Direct assertions: notDeepEqual@99.
- [L102–108](../../tests/unit/ambient-env-override.test.mjs#L102) an exact key's zenith/horizon also override an authored palette sky. Direct assertions: deepEqual@105, deepEqual@106, notDeepEqual@107.
- [L110–119](../../tests/unit/ambient-env-override.test.mjs#L110) a night session ignores the pack environment entirely (night ambient is near-black on purpose). Direct assertions: deepEqual@115, deepEqual@116, deepEqual@117.

### tests/unit/apca-timing.test.mjs

Production targets: css/tokens.css:644 timing palette; :1081/:1091 CVD overrides.

Fixtures and boundaries: Reads actual token source; local APCA 0.1.9 implementation calibrated against published black/white anchors; WCAG ratio against a dark plate composited over grey128.

Assertions and implications: Five tests pin APCA anchors ±0.05, timing-family spread≤20Lc, purple channel order and Lc≥60, brand-red exclusion, and CVD inks≥4.5:1 with palette-count floors and old-ink anti-vacuity. Header correctly distinguishes relative readability from measured live rendering; the tests do not prove translucent text over every scene or all font sizes.

- [L82–89](../../tests/unit/apca-timing.test.mjs#L82) the APCA implementation reproduces both published anchors. Direct assertions: ok@85–86, ok@87–88.
- [L91–102](../../tests/unit/apca-timing.test.mjs#L91) no timing state is dramatically harder to read than its siblings. Direct assertions: ok@97–101.
- [L104–119](../../tests/unit/apca-timing.test.mjs#L104) session best stays purple, and stays the lighter purple. Direct assertions: ok@112–114, ok@116–118.
- [L121–132](../../tests/unit/apca-timing.test.mjs#L121) the brand red stays out of the timing palette. Direct assertions: ok@126–128, notEqual@130.
- [L134–156](../../tests/unit/apca-timing.test.mjs#L134) colour-vision palettes clear 4.5:1 on the dark HUD plate. Direct assertions: ok@143, ok@145, ok@152, ok@155.

### tests/unit/apex-arg-guards.test.mjs

Production targets: js/agent/apex.js:2 ApexApi; js/agent/apex-cam.js:3 ApexCam; apex-net/track/lobby loaded companions.

Fixtures and boundaries: Real API modules with minimal façade/state and spies for camera, update, Career, Tracks, Teams.

Assertions and implications: Eight tests cover invalid jump/camera/speed/spin/nudge/aim/lap/reset/seed/garage-part arguments without mutation; careerGrant nonfinite default; step fallback to 1/60 and finite requested counts; go refuses unbuilt race but starts built countdown at raceT .5. Stubs isolate argument contracts; actual race construction and physics are outside scope.

- [L19–25](../../tests/unit/apex-arg-guards.test.mjs#L19) jump() refuses non-finite arguments before touching the player. Direct assertions: equal@23, deepEqual@24.
- [L27–34](../../tests/unit/apex-arg-guards.test.mjs#L27) camera() rejects NaN and fractional indices without calling setCamMode. Direct assertions: equal@30, deepEqual@31, deepEqual@33.
- [L36–42](../../tests/unit/apex-arg-guards.test.mjs#L36) careerGrant() maps a non-finite amount to the default grant. Direct assertions: deepEqual@41.
- [L44–55](../../tests/unit/apex-arg-guards.test.mjs#L44) setSpeed / spin / nudge / aim / setLap refuse non-finite input and leave the player alone. Direct assertions: equal@48, equal@48, equal@49, equal@49, equal@50, equal@50, equal@51, equal@52, deepEqual@53, equal@54.
- [L57–63](../../tests/unit/apex-arg-guards.test.mjs#L57) act()/step() fall back to one 1/60 s step on non-finite dt/n instead of update(NaN) or looping forever. Direct assertions: deepEqual@62.
- [L65–78](../../tests/unit/apex-arg-guards.test.mjs#L65) reset() / seed() / garageParts() refuse non-finite or non-string input before mutating. Direct assertions: equal@72, equal@73, equal@73, equal@74, equal@75, deepEqual@77.
- [L80–86](../../tests/unit/apex-arg-guards.test.mjs#L80) go() refuses when no race() built a player and grid (#2532). Direct assertions: equal@83, equal@84, equal@85.
- [L88–93](../../tests/unit/apex-arg-guards.test.mjs#L88) go() still starts a built race. Direct assertions: equal@91, equal@92.

### tests/unit/apex-cam-fallback.test.mjs

Production targets: js/agent/apex-cam.js:6 ApexCam.hooks.

Fixtures and boundaries: Real camera module, deterministic straight Frenet sampler; player has world position, AI only s/x; swapped player index variant.

Assertions and implications: Four carOrbit cases assert AI target/carIdx1, out-of-range fallback to player with fallback:true, normal player orbit without false fallback, and player lookup when player is cars[1]. Coordinates use 1e-9 tolerance. Does not assess real track banking, clearance, or rendered composition.

- [L42–52](../../tests/unit/apex-cam-fallback.test.mjs#L42) carOrbit(1) frames the AI and echoes carIdx 1 (no fallback). Direct assertions: ok@46, equal@47, equal@48, ok@50, ok@51.
- [L54–63](../../tests/unit/apex-cam-fallback.test.mjs#L54) carOrbit(99) falls back to the player and sets fallback: true. Direct assertions: ok@58, equal@59, equal@60, ok@61, ok@62.
- [L65–72](../../tests/unit/apex-cam-fallback.test.mjs#L65) carOrbit(0) means the player; carIdx is the player's index without a false fallback. Direct assertions: ok@69, equal@70, equal@71.
- [L74–84](../../tests/unit/apex-cam-fallback.test.mjs#L74) carOrbit(0) when the player is not cars[0] still reports the player index, no fallback. Direct assertions: ok@80, equal@81, equal@82, ok@83.

### tests/unit/apex-career-delete.test.mjs

Production targets: js/agent/apex.js:2 ApexApi; Career.deleteSlot/scoreRound collaborators through stubs.

Fixtures and boundaries: Real API modules, stub Career slot/durability responses and simulated cars/season; getter/setter log for raceWeather.

Assertions and implications: Three tests preserve conflict object identity and suppress reload, return session-only durability/slots, reload accepted saves; careerSim delegates settlement/calendar ownership to scoreRound and emits no result on rejected settlement; race/tt end previous weather session before set/start. Does not exercise real durable storage or full career settlement.

- [L6–29](../../tests/unit/apex-career-delete.test.mjs#L6) careerSlotDelete preserves conflict and session-only durability metadata. Direct assertions: equal@20, equal@21, equal@21, equal@24, equal@24, equal@24, equal@25, equal@27, equal@28, equal@28.
- [L45–77](../../tests/unit/apex-career-delete.test.mjs#L45) careerSim settles through Career.scoreRound and never advances the calendar itself. Direct assertions: equal@64, equal@65, deepEqual@66, equal@67, equal@68, equal@72, equal@73, equal@74, equal@75, equal@76.
- [L79–93](../../tests/unit/apex-career-delete.test.mjs#L79) race() and tt() end the previous weather session before choosing the new weather. Direct assertions: deepEqual@89, deepEqual@92.

### tests/unit/apex-diag-canvas.test.mjs

Production targets: js/agent/apex.js:2 ApexApi.diag.

Fixtures and boundaries: Real API modules; fake named game/scratch canvases log getContext and loseContext; backendState stub selects WebGPU/WebGL2.

Assertions and implications: Two cases require WebGPU diagnostics avoid binding #game and use/release scratch WebGL2; WebGL2 diagnostics reuse game context without scratch. This guards context ownership by calls, not real device creation or lazy configure.

- [L45–51](../../tests/unit/apex-diag-canvas.test.mjs#L45) diag() never binds a context on #game while the bound backend is WebGPU. Direct assertions: ok@47, ok@48, ok@49, ok@50.
- [L53–57](../../tests/unit/apex-diag-canvas.test.mjs#L53) diag() reads the live WebGL2 context in place on a WebGL2 bind. Direct assertions: deepEqual@55, ok@56.

### tests/unit/apex-memory.test.mjs

Production targets: tools/env/apex-memory.mjs CLI.

Fixtures and boundaries: Copies production CLI into temporary root with two memories/index; git-fixture-env; spawns actual Node CLI, fixture cleanup in t.after.

Assertions and implications: Two broad tests cover help/list/show/retire, index-only intended edits, untouched second memory, missing-file status, orphan/dangling retirement, MEMORY.md protection and basename confinement against ../../outside.md. Real subprocess/file behavior, no shared memory mutation.

- [L34–56](../../tests/unit/apex-memory.test.mjs#L34) apex-memory list/show/retire mutates only a copied throwaway store. Direct assertions: equal@37, match@38, equal@40, match@41, equal@44, equal@45, equal@47, match@48, equal@49, equal@50, equal@51, match@52, equal@54, match@55.
- [L58–84](../../tests/unit/apex-memory.test.mjs#L58) apex-memory retires orphan and dangling index entries; missing/protected requests preserve the store. Direct assertions: match@61, equal@62, equal@63, match@64, equal@66, doesNotMatch@67, equal@74, match@75, deepEqual@76, equal@81, equal@82, deepEqual@83.

### tests/unit/apex-physstate.test.mjs

Production targets: js/agent/apex.js:2 ApexApi.physState.

Fixtures and boundaries: Real API modules, Tracks.building true to suppress automatic track load, stub sampler throws if called on null.

Assertions and implications: Two tests require {error:'no track'} and zero sampling for placed player/null track, and null before px initialization. Rebuild timing and browser polling are motivations, not executed concurrency.

- [L23–29](../../tests/unit/apex-physstate.test.mjs#L23) physState() reports no track instead of sampling a null track. Direct assertions: equal@27, equal@28.
- [L31–34](../../tests/unit/apex-physstate.test.mjs#L31) physState() is still null before the player is placed. Direct assertions: equal@33.

### tests/unit/appearance-steppers-tap.test.mjs

Production targets: css/appearance-studio.css:290–297; css/tokens.css:790 --tap-paint.

Fixtures and boundaries: Actual CSS parsed by tests/helpers/css-rules.mjs (cssRules/decl/ruleFor).

Assertions and implications: Three tests require coarse-pointer min-height/min-width and compact-density dimensions use var(--tap-paint), plus scoped selector excludes unrelated tuners/HUD/garage/photo. Header correctly describes CSS contracts; no actual painted tap-box dimensions or cascade/browser evidence.

- [L17–28](../../tests/unit/appearance-steppers-tap.test.mjs#L17) Appearance SettingRow steppers floor at --tap-paint on coarse pointer. Direct assertions: equal@18–22, equal@23–27.
- [L30–33](../../tests/unit/appearance-steppers-tap.test.mjs#L30) compact density keeps the same --tap-paint stepper floor. Direct assertions: equal@31, equal@32.
- [L35–45](../../tests/unit/appearance-steppers-tap.test.mjs#L35) stepper carve stays Appearance panel set-row data-step (no foreign selectors). Direct assertions: ok@37, equal@38, ok@39–42, ok@44.

### tests/unit/appearance-sunlight-chrome.test.mjs

Production targets: css/tokens.css:593, :990; css/appearance-studio.css:122, :128; css/settings.css:397.

Fixtures and boundaries: Actual tokens/studio/settings CSS parsed by css-rules helpers.

Assertions and implications: Five tests pin readable light/system gold and bright race override; themed sheet-foot surface ladder; intact preset word wrapping/em sizing/overflow and red 2px selected border; theme-stable sunlight art and menu-accent broadcast art; profile fields 11rem minimum and plate background. Header explicitly leaves runtime paint to browser; 4.5:1 gold comment is not calculated by this file.

- [L24–32](../../tests/unit/appearance-sunlight-chrome.test.mjs#L24) LIGHT remaps --gold to a dark amber and race chrome restates bright gold. Direct assertions: equal@25–26, equal@27–28, ok@30–31.
- [L34–43](../../tests/unit/appearance-sunlight-chrome.test.mjs#L34) LIGHT themes the shared sheet-foot away from the hard-coded dark gradient. Direct assertions: ok@39–40, ok@41–42.
- [L45–59](../../tests/unit/appearance-sunlight-chrome.test.mjs#L45) preset tiles keep names intact and keep a visible selected ring. Direct assertions: equal@46–47, equal@48, equal@49, equal@50, match@51–52, equal@53, equal@55, equal@56–58.
- [L61–72](../../tests/unit/appearance-sunlight-chrome.test.mjs#L61) sunlight / broadcast preset art is theme-stable (not --text/--dim). Direct assertions: ok@63–64, match@65, equal@66, equal@67, equal@68–69, ok@71.
- [L74–83](../../tests/unit/appearance-sunlight-chrome.test.mjs#L74) profile name row keeps a readable min width on light plates. Direct assertions: ok@77–78, equal@79–82.

### tests/unit/archive-sessions.test.mjs

Production targets: tools/ci/archive-sessions.mjs:55 workState, :91 extractSessions, :102 prsOf, :116 decide, :164 eventsFor, :173 main.

Fixtures and boundaries: Pure/injected saved MCP session/event envelopes; fixed 2026-10-19 clock and relative timestamps; injected prState/read/list/log. No live archive or GitHub calls.

Assertions and implications: Nine tests cover envelope extraction, roles/agent origins and multi-PR parsing; conjunctive archive eligibility; any open/unknown PR keeps; lookup caching/offline; no-archive and in-flight summaries; successful-push/dirty/mid-tool event detection; recent-push and unpushed safeguards; event-page lookup/help/unknown args. Dated fixed clock is intentional fixture, not current state evidence.

- [L18–23](../../tests/unit/archive-sessions.test.mjs#L18) extractSessions reads the MCP envelope text and raw JSON alike. Direct assertions: deepEqual@20, deepEqual@21, throws@22.
- [L25–34](../../tests/unit/archive-sessions.test.mjs#L25) prsOf, roleOf and agentCreated read the tags, with every PR from the tags and the title. Direct assertions: deepEqual@26, deepEqual@27, deepEqual@28, deepEqual@29, equal@30, equal@31, equal@32, equal@33.
- [L36–54](../../tests/unit/archive-sessions.test.mjs#L36) the rule: ARCHIVE only when role, agent-created, idle and PR done all hold. Direct assertions: equal@39, match@39, equal@40, match@41, match@42, match@43, match@44, match@46, match@47, match@48, equal@49, equal@50, match@51, match@52, ok@53.
- [L56–66](../../tests/unit/archive-sessions.test.mjs#L56) a multi-PR session is ARCHIVE only when every PR it names is merged or closed. Direct assertions: equal@61, equal@61, equal@63, ok@63, equal@65, ok@65.
- [L68–82](../../tests/unit/archive-sessions.test.mjs#L68) main prints one row per session, caches PR lookups, and --offline never calls out. Direct assertions: equal@74, deepEqual@75, match@76, match@77, match@78, equal@81.
- [L84–95](../../tests/unit/archive-sessions.test.mjs#L84) Q5: a no-archive tag or an in-flight post_turn_summary keeps an otherwise archivable session. Direct assertions: equal@86, equal@88, ok@88, equal@91, ok@91, equal@93, equal@94.
- [L102–112](../../tests/unit/archive-sessions.test.mjs#L102) workState: last ok git push, a dirty git status with no commit after it, and an unanswered call (X7). Direct assertions: equal@106, deepEqual@107, equal@109, equal@110, equal@111.
- [L114–123](../../tests/unit/archive-sessions.test.mjs#L114) decide with events: a push under 15 min, a dirty tree or a mid-tool call keeps it; an unpushed summary keeps it (X7). Direct assertions: equal@118, equal@119, equal@120, equal@121, equal@122.
- [L125–139](../../tests/unit/archive-sessions.test.mjs#L125) main --events reads each session's saved pages by id; --help exits 0; unknown flags exit 2. Direct assertions: equal@131, equal@132, equal@133, equal@134, equal@136, equal@137, equal@138.

### tests/unit/assert-audit.test.mjs

Production targets: tools/ci/assert-audit.mjs:159 scanSource, :195 audit, :211 capture harness list.

Fixtures and boundaries: Inline source snippets and reads of the repository's real spec/unit suites; AST scanner and transitive helper resolution are actual production code.

Assertions and implications: Fifteen tests distinguish vacuous, direct/helper/transitive-cycle assertions, implicit waits, swallowed rejection and skipped/suite/import-alias forms; assert every spec parses and extraction floors; pin hud-audit helper case; enforce capture exception validity and no unasserting/swallowing unit tests. Historical 1,376 test count in comment is dated, not a current asserted count; this scanner does not prove an assertion is semantically meaningful.

- [L26–32](../../tests/unit/assert-audit.test.mjs#L26) a bare body with no assertion is vacuous. Direct assertions: equal@31.
- [L34–41](../../tests/unit/assert-audit.test.mjs#L34) an assertion reached ONLY through a helper still counts. Direct assertions: equal@39, equal@40.
- [L43–49](../../tests/unit/assert-audit.test.mjs#L43) helper following is transitive, and terminates on a cycle. Direct assertions: equal@48.
- [L51–60](../../tests/unit/assert-audit.test.mjs#L51) a wait-only body is IMPLICIT — weak, but not nothing. Direct assertions: equal@58, equal@59.
- [L62–68](../../tests/unit/assert-audit.test.mjs#L62) an empty .catch(() => {}) is reported — a rejection becomes a pass. Direct assertions: equal@67.
- [L70–73](../../tests/unit/assert-audit.test.mjs#L70) a skipped test is flagged, not counted among the live ones. Direct assertions: equal@72.
- [L75–79](../../tests/unit/assert-audit.test.mjs#L75) test.describe is a suite, not a test. Direct assertions: deepEqual@78.
- [L81–86](../../tests/unit/assert-audit.test.mjs#L81) every spec parses. Direct assertions: deepEqual@85.
- [L88–98](../../tests/unit/assert-audit.test.mjs#L88) the audit sees the whole suite — anti-vacuity on itself. Direct assertions: ok@94, ok@95–96, ok@97.
- [L100–109](../../tests/unit/assert-audit.test.mjs#L100) hud-audit's steer-mode tests assert through assertHud — the false positive, pinned. Direct assertions: ok@102, ok@104, equal@106, equal@107.
- [L111–122](../../tests/unit/assert-audit.test.mjs#L111) NO test in the default suite is vacuous outside a declared capture harness. Direct assertions: deepEqual@121.
- [L124–135](../../tests/unit/assert-audit.test.mjs#L124) the declared capture harnesses are still capture harnesses. Direct assertions: ok@131, equal@132–133.
- [L137–150](../../tests/unit/assert-audit.test.mjs#L137) an aliased test import is still a test — `import { test as freshTest }`. Direct assertions: deepEqual@148–149.
- [L152–156](../../tests/unit/assert-audit.test.mjs#L152) an alias of something that is NOT a test function is not a test. Direct assertions: deepEqual@155.
- [L163–180](../../tests/unit/assert-audit.test.mjs#L163) every tests/unit suite is scanned and none is vacuous or swallowing. Direct assertions: ok@171–172, deepEqual@175–176, deepEqual@179.

### tests/unit/assert-match-ratchet.test.mjs

Production targets: tools/check/ratchets.mjs:224 pinSites, :285 pinVerdict; tests/data/ratchets.json and ratchets.d fragments.

Fixtures and boundaries: Synthetic source strings calibrate pinPatterns.ASSERT_PIN; real tree ratchet evaluated under environment/base-dependent production mode.

Assertions and implications: Two tests pin assert.match/includes positive shapes and excluded ordinary/doesNotMatch forms, then enforce verdict and looseOk ceiling grip with biggest-file diagnostics. Header documents diff-relative vs absolute mode. It counts recognized shapes, not equivalence under arbitrary test rewrites.

- [L26–32](../../tests/unit/assert-match-ratchet.test.mjs#L26) the pin pattern counts assert.match and assert.ok(x.includes(, not other asserts. Direct assertions: equal@27, equal@28, equal@29, equal@30, equal@31.
- [L34–44](../../tests/unit/assert-match-ratchet.test.mjs#L34) pin-shaped asserts under tests/unit never grow (convert source pins to behaviour). Direct assertions: ok@37–39, ok@41–43.

### tests/unit/assets-verify-material-md5.test.mjs

Production targets: tools/gen/assets.mjs:170 encodePNG, :1582 verify.

Fixtures and boundaries: Temporary APEX_PACK_DIR pack, 17-layer two-pixel PNGs generated by actual encoder, minimal valid CC0 material manifest, spawned verify CLI; finally cleanup.

Assertions and implications: Three cases require missing hashes fail, same-dimension rewrite with stale albedo hash fails, both matching hashes pass with verify:OK. One mismatch is albedo; normal hash presence/success covered, normal-only corruption not separately isolated. Hash integrity is distinct from visual/material correctness.

- [L50–60](../../tests/unit/assets-verify-material-md5.test.mjs#L50) verify refuses material strips with no albedoMd5/normalMd5 (#3296). Direct assertions: equal@55, ok@56.
- [L62–84](../../tests/unit/assets-verify-material-md5.test.mjs#L62) verify refuses a same-size material PNG rewrite when the recorded md5 differs (#3296). Direct assertions: equal@79, ok@80.
- [L86–95](../../tests/unit/assets-verify-material-md5.test.mjs#L86) verify accepts material strips whose albedoMd5/normalMd5 match the files. Direct assertions: equal@90, ok@91.

### tests/unit/audio-mix-improvements.test.mjs

Production targets: js/audio/spotify.js search input slice; js/audio/race-mix-audition.js:2; js/audio/soundtrack.js:4; js/audio/music-lib.js:30.

Fixtures and boundaries: VMs with queued Spotify promises/debounce timers, fake WebAudio/media and IndexedDB; actual soundtrack+audition integration with ownership generations.

Assertions and implications: Seven tests cover synchronous stale-search invalidation including clear; disabled audition buses/Stop/mute; failed uploads advance/report current health and playing clears; focused retry preserves other rows; later manual same-id playback survives audition Stop; automatic advancement retains audition ownership while skips/source changes transfer it; 6s deadline cleans owned timers/playback. Spotify test slices source via exact anchors without explicit anchor assertions, so refactor robustness depends on slice producing executable/checkable behavior.

- [L10–18](../../tests/unit/audio-mix-improvements.test.mjs#L10) Spotify actual input invalidates pending searches synchronously, including clear. Direct assertions: equal@16, equal@17, equal@17.
- [L19–27](../../tests/unit/audio-mix-improvements.test.mjs#L19) race mix audition respects disabled buses and cancels all owned work at Stop or mute. Direct assertions: equal@25, deepEqual@25, equal@25, equal@26, deepEqual@26, equal@26, ok@26, equal@26.
- [L28–38](../../tests/unit/audio-mix-improvements.test.mjs#L28) uploaded-track playback failures skip normally and report only the current track; success clears health. Direct assertions: deepEqual@36, equal@36, deepEqual@37.
- [L39–47](../../tests/unit/audio-mix-improvements.test.mjs#L39) music library health is scoped to an existing upload and focused Retry does not affect another row. Direct assertions: equal@43, equal@45, deepEqual@45, equal@45, equal@45, equal@46.
- [L60–65](../../tests/unit/audio-mix-improvements.test.mjs#L60) audition Stop leaves a later manual track action playing, even when selecting the same track id. Direct assertions: equal@62, equal@62, equal@63, equal@63.
- [L66–71](../../tests/unit/audio-mix-improvements.test.mjs#L66) audition ownership spans automatic playlist advancement but not a later manual skip or source choice. Direct assertions: equal@67, equal@67, equal@67, equal@69.
- [L72–77](../../tests/unit/audio-mix-improvements.test.mjs#L72) audition deadline cancels its own playback and pending timers while preserving later user playback. Direct assertions: equal@75, equal@75.

### tests/unit/audio-panel-boot.test.mjs

Production targets: js/audio/panel.js AudioPanel; js/audio/music-lib.js:30; js/audio/spotify.js; js/audio/radio-voice.js.

Fixtures and boundaries: Real panel in mini-DOM with proxy GameAudio and captured SettingRow writes; stored switch/state variants, lazy _stub radio/audio variants; actual music-lib/Spotify for readyState loop.

Assertions and implications: Ten declarations (readyState declaration expands to three tests) cover music-before-sound ordering, rain from falling amount, enabled menu music, lazy radio writes vs real ownership, sample teardown for page/dialog/mute/off paths, announcer suppression, focus persistence across hydration, one-time lazy controls under loading/interactive/complete with zero Spotify requests, and voice/venue before mid-race engine start. Some tests intentionally use call-order stubs, not real decode/network/audio.

- [L56–61](../../tests/unit/audio-panel-boot.test.mjs#L56) init sets the music switch before setSound can start the menu track. Direct assertions: ok@59, ok@60.
- [L63–73](../../tests/unit/audio-panel-boot.test.mjs#L63) enabling SOUND follows falling rain rather than standing water. Direct assertions: equal@71.
- [L75–78](../../tests/unit/audio-panel-boot.test.mjs#L75) init with music on still starts the menu track (after the switch). Direct assertions: ok@77.
- [L83–95](../../tests/unit/audio-panel-boot.test.mjs#L83) rows changed while RaceRadio is still the stub land in the store. Direct assertions: equal@90, equal@91, equal@92, equal@93, equal@94.
- [L97–105](../../tests/unit/audio-panel-boot.test.mjs#L97) with the real RaceRadio the module owns the write. Direct assertions: deepEqual@103, equal@104.
- [L108–130](../../tests/unit/audio-panel-boot.test.mjs#L108) battle samples stop when leaving audio, hiding its panel or closing the settings dialog. Direct assertions: equal@117, equal@120, equal@127, equal@129.
- [L131–140](../../tests/unit/audio-panel-boot.test.mjs#L131) default-off and system-announcer speech suppress battle sample playback. Direct assertions: equal@136, equal@136, equal@138, equal@139.
- [L143–158](../../tests/unit/audio-panel-boot.test.mjs#L143) radio focus native choice persists through lazy stub replacement and reload without lifting master mute. Direct assertions: equal@147, equal@147, equal@148, equal@148, equal@153, equal@153, equal@154, equal@156, equal@157.
- [L161–218](../../tests/unit/audio-panel-boot.test.mjs#L161) `lazy music controls initialize once with document ${readyState}`. Direct assertions: equal@196, equal@197, equal@202, equal@203, equal@204, equal@207, equal@213, equal@214, equal@215, equal@216, equal@217.
- [L221–236](../../tests/unit/audio-panel-boot.test.mjs#L221) SOUND turned on mid-race sets the team voice and circuit venue before the engine starts (M31). Direct assertions: ok@233, ok@234, ok@235.

### tests/unit/audio-panel-settings-ui.test.mjs

Production targets: js/audio/panel.js; js/ui/setting-row.js; js/audio/radio-voice.js; js/audio/tone-model.js; index.html.

Fixtures and boundaries: Mini-DOM details/fold and ScrollFade spy; real SettingRow replaces stub; separate recorded VoicePack with deferred loads, real RadioVoice, page-leave hooks and MutationObserver stubs.

Assertions and implications: Five tests cover nearest fold scroll/fade refresh; tone row count floor, shipped-value grid round trips/full slider reach; factory-profile help copy; pending TEST cancellation across all leave/hide/close/cancel paths; independent newer preview or unowned live race radio survives page cleanup. ScrollIntoView options are asserted; browser scroll geometry and real audio are outside scope.

- [L90–99](../../tests/unit/audio-panel-settings-ui.test.mjs#L90) opening a fold inside #audioset-inner scrolls its body into view and refreshes ScrollFade. Direct assertions: equal@92, equal@95, equal@96, equal@97, deepEqual@98.
- [L101–123](../../tests/unit/audio-panel-settings-ui.test.mjs#L101) every ENGINE TONE slider's grid lands on the shipped TUNE_DEF value and spans its range (H23). Direct assertions: ok@111, ok@114–115, ok@116, ok@118, ok@121.
- [L125–136](../../tests/unit/audio-panel-settings-ui.test.mjs#L125) ENGINE TONE PITCH CURVE help describes team factory readouts, not 100 on every slider. Direct assertions: ok@128, doesNotMatch@131–132, match@133–134, match@135.
- [L157–180](../../tests/unit/audio-panel-settings-ui.test.mjs#L157) leaving audio retires its pending recorded TEST while settings remains open. Direct assertions: equal@160, equal@162, equal@172, equal@173, equal@175, equal@176, equal@178.
- [L182–208](../../tests/unit/audio-panel-settings-ui.test.mjs#L182) audio page leave preserves a later independent voice and does not stop unowned race radio. Direct assertions: equal@186, notEqual@188, equal@190, equal@191, equal@194, equal@199, equal@204, equal@205, equal@206.

### tests/unit/audit-circuit.test.mjs

Production targets: tools/track/audit-circuit.cjs:59 floatOk, :63 CHECKS, :124 main; tools/track/ground-audit.cjs; tools/shot/shot-jobs.mjs.

Fixtures and boundaries: Direct CLI helpers, mocked CHECKS.verify/console for syntax; real circuit baselines/geometry (Mexico/Hungaroring/Monaco); temporary baseline read patch restored in finally; artifact shot JSON cleanup.

Assertions and implications: Nine tests reject invalid/missing/prototype check names, accept pre-circuit equals syntax, float count≤cap despite exit1 but reject genuine errors/no count, run real float count, make absent ground baseline zero, retain bounded footprint advisories outside gate counts, and parse real JSON/shots with source attribution. Real geometry calls execute when tests run; no browser in this review or in these assertions.

- [L24–33](../../tests/unit/audit-circuit.test.mjs#L24) audit CLI rejects empty, inherited, missing and unknown check selections before execution. Direct assertions: equal@32.
- [L35–44](../../tests/unit/audit-circuit.test.mjs#L35) audit CLI runs the selected check with options before the circuit and equals syntax. Direct assertions: equal@39, deepEqual@40, equal@42, deepEqual@43.
- [L46–50](../../tests/unit/audit-circuit.test.mjs#L46) float verdict: floaters equal to the cap pass despite float-audit exiting 1. Direct assertions: equal@47, equal@48, equal@49.
- [L52–55](../../tests/unit/audit-circuit.test.mjs#L52) float verdict: over the cap, or no cap, still fails. Direct assertions: equal@53, equal@54.
- [L57–61](../../tests/unit/audit-circuit.test.mjs#L57) float verdict: a real tool error fails whatever the count says. Direct assertions: equal@58, equal@59, equal@60.
- [L63–71](../../tests/unit/audit-circuit.test.mjs#L63) CHECKS.float on a real circuit: ok is exactly count <= cap. Direct assertions: ok@67, notEqual@69, equal@70.
- [L73–92](../../tests/unit/audit-circuit.test.mjs#L73) CHECKS.ground: a missing baseline row is cap 0, matching ground-audit --gate. Direct assertions: ok@80, equal@90, ok@91.
- [L94–107](../../tests/unit/audit-circuit.test.mjs#L94) CHECKS.ground: retain footprint advisories without treating them as baseline failures. Direct assertions: equal@96, ok@97, equal@98, equal@99, equal@100, ok@101–102, match@103, ok@104, match@105, ok@106.
- [L109–127](../../tests/unit/audit-circuit.test.mjs#L109) footprint CLI: JSON remains parseable with source attribution, gates and review shot jobs. Direct assertions: equal@119, deepEqual@120, ok@121, ok@122, equal@124, ok@125.

### tests/unit/audit-summary.test.mjs

Production targets: tools/ui/audit-summary.mjs:36 isBad, :41 severity, :52 findingHead, :69 summarize, :127 readAudit, :140 main.

Fixtures and boundaries: Seven-cell inline GRID of hard/soft/skipped findings; synthetic 600-cell/duplicate-head grids; temporary audit files and actual CLI subprocesses.

Assertions and implications: Twelve tests cover hard-vs-soft/skip classifications, severity ranking, counts/build, bounded worst-first heads and rollup, filters/empty, CLEAN suppression with skips, cell detail cap and duplicates, output length, normalized finding heads, malformed/missing audit errors, default cwd/JSON/cell/usage status2 with no stack. Temporary directories in readAudit/CLI tests have no cleanup; this is a concrete fixture-hygiene gap, not a production correctness defect.

- [L36–43](../../tests/unit/audit-summary.test.mjs#L36) isBad follows layout-audit: hard findings and x-overflow are red; soft ones and skips are not. Direct assertions: equal@37, equal@38, equal@39, equal@40, equal@41, equal@42.
- [L45–50](../../tests/unit/audit-summary.test.mjs#L45) severity orders hard findings above soft ones and gives a skipped cell nothing. Direct assertions: equal@46, equal@47, ok@48, ok@49.
- [L52–60](../../tests/unit/audit-summary.test.mjs#L52) summarize counts cells, red cells, skips and deepScroll apart, with totals and the build. Direct assertions: equal@54, deepEqual@55, ok@57, ok@58, ok@59.
- [L62–73](../../tests/unit/audit-summary.test.mjs#L62) worst cells come first, each with at most two finding heads, and the rollup counts red cells per screen. Direct assertions: equal@65, equal@66, ok@67, equal@69, ok@70, ok@71, equal@72.
- [L75–81](../../tests/unit/audit-summary.test.mjs#L75) filters narrow the cells and say how many were left out; an empty match says so. Direct assertions: equal@77, equal@78, ok@80.
- [L83–88](../../tests/unit/audit-summary.test.mjs#L83) a clean grid says CLEAN; a grid with skips never does. Direct assertions: ok@85, ok@87.
- [L90–99](../../tests/unit/audit-summary.test.mjs#L90) --cell expands one cell with each category capped at eight kinds of finding. Direct assertions: equal@93, ok@94, equal@95, ok@96, ok@97, ok@98.
- [L101–107](../../tests/unit/audit-summary.test.mjs#L101) --cell collapses identical finding heads into a count (a real clipped list repeated one line five times). Direct assertions: deepEqual@104, ok@106.
- [L109–115](../../tests/unit/audit-summary.test.mjs#L109) the output is bounded: a 600-cell grid prints about top*3 plus a dozen lines, not 600. Direct assertions: ok@112, ok@113, equal@114.
- [L117–124](../../tests/unit/audit-summary.test.mjs#L117) findingHead reads strings, el/by/text entries and unknown objects, cut with an ellipsis. Direct assertions: equal@118, equal@119, equal@120, equal@121, equal@122, equal@123.
- [L126–136](../../tests/unit/audit-summary.test.mjs#L126) readAudit takes a directory or a file and refuses anything that is not an audit. Direct assertions: equal@129, equal@130, throws@131, throws@133, throws@135.
- [L138–165](../../tests/unit/audit-summary.test.mjs#L138) the CLI prints the summary, defaults to layout-audit's folder, --json prints one object, and a bad argument exits 2 without a stack. Direct assertions: equal@143, ok@144, equal@146, ok@147, equal@148, equal@154, ok@155, equal@157, ok@158, equal@161, ok@162, equal@163.

### tests/unit/backend-surface-parity.test.mjs

Production targets: js/render/glx/glx.js; js/render/webgpu/wgx.js:11; js/render/three/tlx.js:4; live GLX façade is js/render/shared/glx-facade.js:5.

Fixtures and boundaries: Source scanner anchors makeFrustumPlanes and scans same-indentation object keys/shorthand bounded by enclosing indentation.

Assertions and implications: Two tests assert loose nonempty surface floors then every GLX key appears in WGX/TLX, including intentionally undefined features. Header explains descriptor-copy hazard accurately. These are declaration-level guards; formatting can break scanner and keys do not prove feature execution. Dated actual surface counts in comments are historical, while asserted floors are intentionally loose.

- [L82–91](../../tests/unit/backend-surface-parity.test.mjs#L82) the scanner actually finds a surface in each backend. Direct assertions: ok@86, ok@89.
- [L93–108](../../tests/unit/backend-surface-parity.test.mjs#L93) every GLX member is declared by every other backend. Direct assertions: deepEqual@98–106.

### tests/unit/badges.test.mjs

Production targets: js/career/badges.js:2 Badges, :84 forRace; js/race/daily-challenge.js:2; real GameStore via seed-store helper.

Fixtures and boundaries: Whole module VM, fake/throwing localStorage with write counts, real seedLog/seedStore/seedHash32; three-venue stub calendar, notification spy and small DOM.

Assertions and implications: Seven tests cover result-derived badge rules including DSQ/retired/unfinished/penalty exclusions, unique persistent timestamps/toasts, world-tour completion, corrupt/throwing storage with session dedupe, notifier failure preserving unlock, panel replacement and aria state, and seven-day integration through real DailyChallenge.record. WORLD TOUR checks fixture's three venues, not all actual 2026 circuit definitions.

- [L59–75](../../tests/unit/badges.test.mjs#L59) the unlock rules read the player's classified result and nothing else. Direct assertions: deepEqual@61, deepEqual@62, deepEqual@63, deepEqual@64, deepEqual@65–66, deepEqual@67, deepEqual@68–69, deepEqual@70–71, deepEqual@72, deepEqual@73, deepEqual@74.
- [L77–92](../../tests/unit/badges.test.mjs#L77) unlocks persist under apex26.badges and never repeat — no second write, no second toast. Direct assertions: deepEqual@79, deepEqual@81, equal@82, deepEqual@83, deepEqual@85, equal@86, equal@87, equal@88, deepEqual@89, deepEqual@90, deepEqual@91.
- [L94–105](../../tests/unit/badges.test.mjs#L94) winning at every 2026 venue unlocks the WORLD TOUR once. Direct assertions: equal@98, deepEqual@99, deepEqual@100, equal@102, equal@103, ok@104.
- [L107–121](../../tests/unit/badges.test.mjs#L107) missing, corrupt or wrong-shape storage reads as no badges and never throws. Direct assertions: deepEqual@111, deepEqual@112, equal@113, deepEqual@114, deepEqual@118, deepEqual@119, deepEqual@120.
- [L123–128](../../tests/unit/badges.test.mjs#L123) a throwing notifier cannot lose the unlock. Direct assertions: deepEqual@126, equal@127.
- [L130–153](../../tests/unit/badges.test.mjs#L130) the panel lists every badge with its state. Direct assertions: match@146, equal@148, equal@149, equal@150, equal@152.
- [L155–174](../../tests/unit/badges.test.mjs#L155) seven consecutive daily-challenge days unlock DAILY DEVOTION through DailyChallenge.record. Direct assertions: equal@171, deepEqual@173.

## Review findings and limits

- Full-source read remains incomplete for ten files; the exact continuation ledger above is authoritative. No coverage conclusions are claimed for those files.
- Source/CSS shape guards (Albert Park skyline/helpers, tap rules, sunlight chrome, renderer surface parity, portions of audio settings) cannot establish runtime paint, real GPU behavior, or final scene quality. Their comments mostly make that boundary explicit.
- VM tests meaningfully exercise actual module owners, but stubbed browser/audio/storage collaborators narrow conclusions. The AI-yield case is an integrated real game VM scenario; ambient environment resolution deliberately loads actual Assets; badges deliberately loads actual GameStore and DailyChallenge.
- Strong anti-vacuity checks include distinct lamp lanes/static-only source swaps, APCA published anchors/old failing CVD ink, surface-key floors, assertion-scanner suite floors, tone table row floors, and real positive baseline fixtures.
- `audit-summary.test.mjs:126` and `:138` allocate temporary directories without teardown. Its helper and CLI checks remain meaningful; repeated test runs leave fixture directories.
- `audio-mix-improvements.test.mjs:13` slices Spotify source by exact strings without separately asserting anchor presence. The rest of the tests execute whole modules. This is a refactor fragility finding, not proof of current vacuity.
- Historical test-count and backend-surface comments are dated snapshots. Asserted floors and actual scanned data govern behavior; the historical figures should not be copied as current totals.
- No source, test, browser, commit or deployment action performed. Parent owns docs verification.
