# Unit tests 01: complete read ledger

Scope: sorted `git ls-files tests/unit`, positions **1–35 inclusive** of 1056 tracked entries. All 35 files are assigned; no sampling. Production/test execution is outside this read-only mapping task.

Baseline HEAD: `8a222466bc83de7cdbe6a42989f19f7824ce4c06`. Read 2026-10-27. Read AGENTS.md and `.claude/skills/code-nav/SKILL.md` first; LSP CLI fallback used for symbol locations.

Total assigned scope: **35 files, 10,797 lines** (line counts include comments and blanks).

All assigned file bodies, including comments/setup/cleanup, were read. Two oversized initial output batches truncated; affected files were re-read in bounded chunks before this completion record. No test suite, browser, source edit or commit was performed by this lane. Parent owns verification.

## File and full-read ledger

| Position | File | Lines | SHA-256 | Read range |
|---|---|---:|---|---|
| 1 | `tests/unit/a11y-label-in-name.test.mjs` | 36 | `6b9e60e6a0f0df6b65ed2811a3fcf4c484f73392b3b79910559cef4d29d79830` | 1–36 |
| 2 | `tests/unit/a11y-loading-hint.test.mjs` | 60 | `a19390055b174a1678cda2c4530318bfad0a6d145294af9c0aceeb4d609b35b9` | 1–60 |
| 3 | `tests/unit/a11y-opts.test.mjs` | 228 | `b284db6c0bbfa99777b553624ec812b76db45013c2d72a9037d7f0673c88741d` | 1–228 |
| 4 | `tests/unit/a11y-pwa-pass.test.mjs` | 663 | `203ce290d0a3418af2ac10f77662da228f7ef808eab3588331a6a9135b020d88` | 1–340; 341–663 |
| 5 | `tests/unit/active-aero-vm.test.mjs` | 258 | `da291a6fe06f6fa2bbefa10401727902fc7ceb97177dbc886c9921ca5b2183eb` | 1–35; 36–258 |
| 6 | `tests/unit/adapted-specs.test.mjs` | 64 | `e0d4f793f7578fe7b88bee105db2f75bc9ea821e60ef807ad67c149366d46457` | 1–64 |
| 7 | `tests/unit/aero-defaults-2026.test.mjs` | 108 | `c7f94098f2ff9efbd595ca36d9c18b726f15d105904ce0088a465d743d1e5156` | 1–108 |
| 8 | `tests/unit/aero-flap-travel.test.mjs` | 132 | `8c1336ef437091a352dd1169fccedbeb5622760ec4f9e3c2675a4e93220d88d9` | 1–132 |
| 9 | `tests/unit/aero-preview-fields.test.mjs` | 165 | `3b07618b6ab959154f3b7c4eb5e322e2ea9ce7ed8870a37e74a1fc6735724cf5` | 1–165 |
| 10 | `tests/unit/aero-shapes-d3c.test.mjs` | 111 | `a1aa62545b5dd14fdc45cd16c11e118d80a944f3adcf76373b6930d6d0e134e9` | 1–111 |
| 11 | `tests/unit/aero-zone-tables.test.mjs` | 178 | `37bdc0174da9eb9b1f85fddc761e6d55c290e2870307e30de60f9107e88288ae` | 1–178 |
| 12 | `tests/unit/aero-zones-turns.test.mjs` | 114 | `4e1c4afdc8f71aa46f01bc0275c818a0a8e2e19bbc197ed8e810ce394247233e` | 1–114 |
| 13 | `tests/unit/aero-zones-vm.test.mjs` | 288 | `ff11763bed296a56eff782104f758e8f805c30215f338a023e1903bea6d2edba` | 1–288 |
| 14 | `tests/unit/agent-anchors-vm.test.mjs` | 94 | `e1cef32b4d0fd33e99723bb8c201a4db77d3ea345e574b72d741a07320f0b343` | 1–94 |
| 15 | `tests/unit/agent-config.test.mjs` | 1042 | `062e16c6eb2067e896414ae8f17d15dba7a52d8e30b4c97c481f57421d954856` | 1–520; 521–1042 |
| 16 | `tests/unit/agent-determinism-vm.test.mjs` | 82 | `f14365d66227305a9ad5e941e1f3a04735ac77e72dfc2175dbcb6028fc1e3923` | 1–82 |
| 17 | `tests/unit/agent-experiment.test.mjs` | 148 | `fbba95004017bc98e90c3b77ec76d60970af3da2eee8c8941d06adb1f1f355b5` | 1–148 |
| 18 | `tests/unit/agent-hooks-vm.test.mjs` | 374 | `d16e1e007e103410926c3187c10b1322b44e5fa592389a9026fa8904899cad94` | 1–374 |
| 19 | `tests/unit/agent-indexes.test.mjs` | 115 | `4d35e5240da5f889666545921bb9b7f183d8f381f2618d89b076b3e2b41b599a` | 1–115 |
| 20 | `tests/unit/agent-output-config.test.mjs` | 62 | `409a7feab1873b84d7f6e6e5a180847e493c7b9a5c1f95a4713f20166d507daf` | 1–62 |
| 21 | `tests/unit/agent-output.test.mjs` | 473 | `584e78367623ee43d5744194d274440d46370cf2d8079fedd7c3dda3d95397bf` | 1–269; 270–309; 310–473 |
| 22 | `tests/unit/agent-surface.test.mjs` | 357 | `a12296dffe3dfa0ba7c7cdc669d0a30a399abbac3b6f8fa4aff8d009ed0b9568` | 1–357 |
| 23 | `tests/unit/agent-view-vm.test.mjs` | 1516 | `b8704f079140e7f8fc97e511deb474752fa96a0c423d2225ba6a9048597154e6` | 1–300; 301–650; 651–1050; 1051–1516 |
| 24 | `tests/unit/agentview-api-contract.test.mjs` | 250 | `4f92a0b17a5016bd7e46850fe02c8a90c2ab547e2c2ed4bff68f1229c565deff` | 1–250 |
| 25 | `tests/unit/ai-band.test.mjs` | 110 | `1a552bb65fa53246e01f6783e8289c29f20d7e0aa525b3ffd527c15a6e1625ef` | 1–110 |
| 26 | `tests/unit/ai-corridor.test.mjs` | 156 | `6df806251683691cb0860e71fe9e581720b83a5607b361f98873a03c488f2388` | 1–156 |
| 27 | `tests/unit/ai-drive.test.mjs` | 1849 | `a19dc1ab19b46471a49bb3e8430c12cfa1609707dacd6bdb435c0f27b2e65e5c` | 1–400; 401–800; 801–1200; 1201–1600; 1601–1849 |
| 28 | `tests/unit/ai-pack-stuck-vm.test.mjs` | 143 | `df5d3209bc2c83745cae13ab7a961570563e7148e1d1a105de7140ffedf98693` | 1–143 |
| 29 | `tests/unit/ai-pass-complete.test.mjs` | 240 | `b8adc4d221fb8f23be19f66392902609dc6ebf99f7f7ec2c7e2b2b508db07d40` | 1–240 |
| 30 | `tests/unit/ai-pass-defend-vm.test.mjs` | 57 | `850172f18e44a47a5f880d403c78dcc746a4f25f9d2772338d75890dd72848d5` | 1–57 |
| 31 | `tests/unit/ai-queue-reach-vm.test.mjs` | 72 | `c8fc8615df5520f532c89dacc82270db722a3081ec2731e64ee165c27ed69616` | 1–72 |
| 32 | `tests/unit/ai-racecraft-vm.test.mjs` | 460 | `df545ea01db88bae64af09f1d26b5f2c617e327e41a01cce68c443edc5079780` | 1–260; 261–460 |
| 33 | `tests/unit/ai-ratings-math.test.mjs` | 115 | `7773949e4a302e3e086fd091735d5f262d0439e996bd2d15c3e5958d04c2a061` | 1–115 |
| 34 | `tests/unit/ai-strategy.test.mjs` | 545 | `6804df0cfe2ab1fb3692367200712c4c787291c44e5925900202774c3c44f583` | 1–280; 281–545 |
| 35 | `tests/unit/ai-stuck-vm.test.mjs` | 132 | `d35993c84edeedcc04070927e2c7f8d7cf1e95064506674e180cb99395e14a84` | 1–132 |

## Production target, assertion and fixture contracts

Each numbered entry corresponds exactly to the ledger position. The declaration list supplies source-line entrypoints for individual cases, including parameterized declaration templates; it is not a claim about executed runtime test counts.

### 1. a11y-label-in-name.test.mjs

Target: index.html (button attributes).

Fixture: Static shell regex; normalizes entities, strips SVG/tags and punctuation; >20 buttons and four known IDs prevent empty scans.

Assertions and limits: Accessible names contain normalized visible text; pit steppers say tyre choice. Only committed labelled button text is scanned, not runtime controls or computed accessibility trees.

Case declaration entrypoints:

- [22](../../tests/unit/a11y-label-in-name.test.mjs#L22): `test("the scan finds the shell's labelled text buttons", () => {`
- [27](../../tests/unit/a11y-label-in-name.test.mjs#L27): `test("every button's accessible name contains its visible text (Label in Name)", () => {`
- [32](../../tests/unit/a11y-label-in-name.test.mjs#L32): `test("the pit tyre-choice steppers read as tyre choices, not 'next next tyres'", () => {`

### 2. a11y-loading-hint.test.mjs

Target: css/a11y-loading.css; tools/manifest.cjs; css/overlays.css.

Fixture: readCssSource expands source sheets; synthetic bright SKY RGB with fixed opacity0.85 and backing alpha0.72.

Assertions and limits: Accessibility sheet follows loading and is deferred; two selector rules; dark plate/text-shadow; calculated contrast≥4.5 and old ink-only fails. Constants model the selected sky, not browser-computed compositing.

Case declaration entrypoints:

- [35](../../tests/unit/a11y-loading-hint.test.mjs#L35): `test("a11y-loading.css is in the manifest after loading.css", () => {`
- [42](../../tests/unit/a11y-loading-hint.test.mjs#L42): `test("skip hint uses a dark backing plate, not ink alone", () => {`
- [52](../../tests/unit/a11y-loading-hint.test.mjs#L52): `test("hint text meets 4.5:1 over a bright sky at full fade-in opacity", () => {`

### 3. a11y-opts.test.mjs

Target: A11yOpts; TitleFx; Input hold bindings; settings-export; HUD motion helpers.

Fixture: Custom element/attribute/children DOM, SettingRow write callbacks, store, matchMedia and timer maps; optional real bindings; fnSource extracts three motion helpers.

Assertions and limits: Shell/export wiring, high focus default, colourblind flag/compound letters, OS vs explicit motion choices and legacy migration, five mounted rows, immediate Input hold update plus fresh-load persistence/junk fallback, CSS focus selector.

Case declaration entrypoints:

- [117](../../tests/unit/a11y-opts.test.mjs#L117): `test("shell declares ACCESSIBILITY door + empty panel; MOTION left Appearance", () => {`
- [125](../../tests/unit/a11y-opts.test.mjs#L125): `test("export SPEC lists motion/focusRing/cbCues/holdMode under a11y", () => {`
- [132](../../tests/unit/a11y-opts.test.mjs#L132): `test("high focus is the default and stamps data-focus", () => {`
- [140](../../tests/unit/a11y-opts.test.mjs#L140): `test("colourblind help mentions race HUD cues", () => {`
- [149](../../tests/unit/a11y-opts.test.mjs#L149): `test("colourblind cues off by default; on stamps data-cb-cues", () => {`
- [162](../../tests/unit/a11y-opts.test.mjs#L162): `test("REDUCE MOTION AUTO follows OS; ON always; OFF overrides OS", () => {`
- [170](../../tests/unit/a11y-opts.test.mjs#L170): `test("game-world, minimap and input-trace motion follow the resolved accessibility choice live", () => {`
- [194](../../tests/unit/a11y-opts.test.mjs#L194): `test("panel mounts five rows and wires them", () => {`
- [215](../../tests/unit/a11y-opts.test.mjs#L215): `test("a HOLD/TOGGLE choice reaches Input and survives a reload (B·H11 settings audit)", () => {`
- [226](../../tests/unit/a11y-opts.test.mjs#L226): `test("HIGH focus CSS keys off data-focus", () => {`

### 4. a11y-pwa-pass.test.mjs

Target: Input.pickPad; input poll/orientation; CamModes; UpdateCheck; ScriptLoader; platform-session; manifest.json.

Fixture: Custom pad DOM/listener fixture; explicit pad activity and per-device buttons; standard and prefixed fullscreen APIs; install event/store; fake monotonic update clock; MessageChannel ports, replaceable worker, manual timers and serial script-injection spies.

Assertions and limits: Activity wins pad selection, wheel preference only breaks idle tie, timestamps/disconnect/null/jitter/button edges; landscape ownership, pending quit and rejection; fullscreen paints and releases locks; manifest identity/files/96px PNG; install prompts tap once; CAM label; update throttle/backoff/persist-race cancellation, lazy freshness and generation authorization, replacement/timeout/channel failure, serial-chain fallback invalidation, race-deferred announcements and modal CSS.

Case declaration entrypoints:

- [70](../../tests/unit/a11y-pwa-pass.test.mjs#L70): `test("pickPad: the pad being USED drives, even over an idle standard pad in an earlier slot", () => {`
- [80](../../tests/unit/a11y-pwa-pass.test.mjs#L80): `test("pickPad: once a wheel is set up (or its wizard captures), the wheel outranks an idle pad", () => {`
- [92](../../tests/unit/a11y-pwa-pass.test.mjs#L92): `test("pickPad: among idle pads the newest timestamp wins, slot order breaks ties", () => {`
- [117](../../tests/unit/a11y-pwa-pass.test.mjs#L117): `test("poll(): turning a wheel takes the car from an idle standard pad; jitter does not; edges stay per device", () => {`
- [133](../../tests/unit/a11y-pwa-pass.test.mjs#L133): `test("lockLandscape locks only on a touch device, and unlock releases only its own lock", async () => {`
- [151](../../tests/unit/a11y-pwa-pass.test.mjs#L151): `test("an unlock (quit) that lands while the lock is still pending still releases it (B·H11 hunt)", async () => {`
- [168](../../tests/unit/a11y-pwa-pass.test.mjs#L168): `test("lockLandscape swallows a rejection (not fullscreen, iPhone, unsupported) and never unlocks", async () => {`
- [182](../../tests/unit/a11y-pwa-pass.test.mjs#L182): `test("game.js locks landscape after race fullscreen succeeds and unlocks on exit and quit", () => {`
- [191](../../tests/unit/a11y-pwa-pass.test.mjs#L191): `for (const prefixed of [false, true]) test(ˋfullscreen tracks entry, exit and external exit (${prefixed ? "WebKit" : "standard"})ˋ, async () => {`
- [237](../../tests/unit/a11y-pwa-pass.test.mjs#L237): `test("manifest.json asks for fullscreen, then standalone", () => {`
- [248](../../tests/unit/a11y-pwa-pass.test.mjs#L248): `test("manifest.json: id keeps the installed identity, screenshots and shortcuts point at shipped files", () => {`
- [266](../../tests/unit/a11y-pwa-pass.test.mjs#L266): `test("manifest.json: lang is set and every shortcut icon is a shipped 96x96 PNG", () => {`
- [280](../../tests/unit/a11y-pwa-pass.test.mjs#L280): `test("INSTALL APP: beforeinstallprompt is stashed, prompt() only from the tap, once; appinstalled hides it", async () => {`
- [321](../../tests/unit/a11y-pwa-pass.test.mjs#L321): `test("the CAM button's accessible name starts with the word it shows", () => {`
- [376](../../tests/unit/a11y-pwa-pass.test.mjs#L376): `test("update check: throttled to one version.json read per 10 min, starting from boot", async () => {`
- [388](../../tests/unit/a11y-pwa-pass.test.mjs#L388): `test("update check: a newer build shows the chip outside races only, and the tap persists then reloads", async () => {`
- [403](../../tests/unit/a11y-pwa-pass.test.mjs#L403): `test("update check: a race starting during persistence cancels navigation and keeps the update available", async () => {`
- [420](../../tests/unit/a11y-pwa-pass.test.mjs#L420): `test("update check: an older or unreadable version.json never shows the chip", async () => {`
- [426](../../tests/unit/a11y-pwa-pass.test.mjs#L426): `test("a newer CONTROLLING worker blocks lazy loads once the session is wired, and raises the chip", () => {`
- [438](../../tests/unit/a11y-pwa-pass.test.mjs#L438): `test("update check: a failed version.json read is retried after the short backoff, not the full throttle", async () => {`
- [459](../../tests/unit/a11y-pwa-pass.test.mjs#L459): `test("a refused lazy load explains itself once: chip text and a spoken line, then quiet", async () => {`
- [477](../../tests/unit/a11y-pwa-pass.test.mjs#L477): `test("with no controlling worker, a lazy load re-reads a stale version.json and refuses a newer build (3-F5)", async () => {`
- [503](../../tests/unit/a11y-pwa-pass.test.mjs#L503): `test("a refusal during a race is spoken at the next menu, not over the race", () => {`
- [513](../../tests/unit/a11y-pwa-pass.test.mjs#L513): `test("a sound load with no newer build is never explained as an update", () => {`
- [520](../../tests/unit/a11y-pwa-pass.test.mjs#L520): `test("UpdateCheck is wired: #update-chip in the shell, the visibility hook, the loader guard", () => {`
- [532](../../tests/unit/a11y-pwa-pass.test.mjs#L532): `test("UPDATE READY and the save warning stand down under a modal dialog", () => {`
- [563](../../tests/unit/a11y-pwa-pass.test.mjs#L563): `test("generation handshakes coalesce and recheck the same controller for the next lazy batch", async () => {`
- [577](../../tests/unit/a11y-pwa-pass.test.mjs#L577): `test("a replaced controller's late answer cannot authorize a lazy injection", async () => {`
- [588](../../tests/unit/a11y-pwa-pass.test.mjs#L588): `test("old worker handshake timeout permits ordinary boot but refuses a known newer build", async () => {`
- [612](../../tests/unit/a11y-pwa-pass.test.mjs#L612): `test("a serial lazy chain pays the legacy-worker timeout once per load invocation", async () => {`
- [628](../../tests/unit/a11y-pwa-pass.test.mjs#L628): `test("a serial chain rechecks a replacement controller after its legacy fallback", async () => {`
- [641](../../tests/unit/a11y-pwa-pass.test.mjs#L641): `test("a known newer build still blocks a serial chain using legacy fallback", async () => {`
- [652](../../tests/unit/a11y-pwa-pass.test.mjs#L652): `for (const broken of ["constructor", "postMessage", "close"]) test(ˋgeneration channel ${broken} errors settle the loaderˋ, async () => {`

### 5. active-aero-vm.test.mjs

Target: game aero hooks → AeroZones; physics active-aero; AgentView.

Fixture: Shared createGame Monza boot, virgin-boot test first; saved physics/headless reset per race; fracWhere derives straight and uncovered-corner samples from real zone list.

Assertions and limits: 13 declared cases cover null-before-player, typed state on three hooks, Z start, straight arm/corner reject/request clear, monotone opening and quicker brake closure, speed/grip trade, AI flap use and world affordance. VM JSON/simulation evidence, no rendered-wing visibility assertion.

Case declaration entrypoints:

- [74](../../tests/unit/active-aero-vm.test.mjs#L74): `test("aero() returns null with no player on track", () => {`
- [80](../../tests/unit/active-aero-vm.test.mjs#L80): `test("aero() reports mode, flap travel, request and arming", async () => {`
- [89](../../tests/unit/active-aero-vm.test.mjs#L89): `test("the car starts in Z-mode with the flaps shut", async () => {`
- [97](../../tests/unit/active-aero-vm.test.mjs#L97): `test("obs(), physState() and carAt() all expose the flap travel", async () => {`
- [108](../../tests/unit/active-aero-vm.test.mjs#L108): `test("arms on a straight and the flap opens", async () => {`
- [123](../../tests/unit/active-aero-vm.test.mjs#L123): `test("does NOT arm in the tightest corner, and asking for X-mode there does nothing", async () => {`
- [137](../../tests/unit/active-aero-vm.test.mjs#L137): `test("un-arming drops the request, so the flap does not spring back open", async () => {`
- [158](../../tests/unit/active-aero-vm.test.mjs#L158): `test("the flap takes time to open — it is not a step change", async () => {`
- [176](../../tests/unit/active-aero-vm.test.mjs#L176): `test("braking slams it shut, and faster than it opened", async () => {`
- [197](../../tests/unit/active-aero-vm.test.mjs#L197): `test("X-mode reaches a higher top speed down the same straight", async () => {`
- [213](../../tests/unit/active-aero-vm.test.mjs#L213): `test("X-mode costs aero grip: the same input turns the car less", async () => {`
- [240](../../tests/unit/active-aero-vm.test.mjs#L240): `test("AI cars run X-mode too", async () => {`
- [250](../../tests/unit/active-aero-vm.test.mjs#L250): `test("the agent world view reports the aero block and the affordance", async () => {`

### 6. adapted-specs.test.mjs

Target: tools/ci/twinned-specs.mjs ADAPTED; tests/helpers/vm-page.js.

Fixture: One spawned Node process per sorted spec, APEX_VM_PAGE=1, NODE_TEST_CONTEXT removed; optional named group and bounded concurrency.

Assertions and limits: Nonempty map; every child must provide TAP counts, zero failures, positive pass count and exit0. Child hangs/errors fail; this is a meta-runner contract, not one fixed set of gameplay assertions.

Case declaration entrypoints:

- [42](../../tests/unit/adapted-specs.test.mjs#L42): `test("the ADAPTED map is not empty (an empty gate is not a gate)", () => {`
- [46](../../tests/unit/adapted-specs.test.mjs#L46): `test(spec, { timeout: 900_000 }, () => {`

### 7. aero-defaults-2026.test.mjs

Target: Car3D.aeroStyleOf; Parts catalogue/factory recipes; Car3D.build.

Fixture: VM loads M4, teams, parts, helmets and real geometry modules; explicit eleven-team flag table.

Assertions and limits: 2026 no-beam/flaps/board defaults and tier2; all catalogue aero except fantasy beam_wing; factory stamps preserved; every factory body builds >1000 triangles and resolves same flags.

Case declaration entrypoints:

- [51](../../tests/unit/aero-defaults-2026.test.mjs#L51): `test("buildAeroParts defaults are 2026 regulation (no beam, flaps, bargeboard)", () => {`
- [62](../../tests/unit/aero-defaults-2026.test.mjs#L62): `test("every non-beam_wing catalog aero resolves to 2026 regulation flags", () => {`
- [81](../../tests/unit/aero-defaults-2026.test.mjs#L81): `test("all 11 factory SIGNATURE aero recipes stay on their #1198 stamps", () => {`
- [95](../../tests/unit/aero-defaults-2026.test.mjs#L95): `test("factory body mesh uses the stamped 2026 flags (defaults do not override)", () => {`

### 8. aero-flap-travel.test.mjs

Target: Car3D.aeroFlaps/build/buildComplete; CarMesh flap cache/drawAeroEdge.

Fixture: loadParts real geometry VM; explicit rotation about emitted hinge; noWeld vertex census; fake mesh uploader for cache/material capture.

Assertions and limits: Front TE>20mm and one>80mm, hinge≤0.65; rear LE>80mm and exceeds TE; endplate intake vertex/band floors; rain-light peak≤1.90 and two colours; opt-in edge latch; carbon surface independent cache and all appended flap materials. Geometry proxies do not prove garage pixels.

Case declaration entrypoints:

- [34](../../tests/unit/aero-flap-travel.test.mjs#L34): `test("default garage flaps travel on BOTH wings (TE front, LE rear)", () => {`
- [54](../../tests/unit/aero-flap-travel.test.mjs#L54): `test("hinges are not TE-parked on the front (plan #5)", () => {`
- [63](../../tests/unit/aero-flap-travel.test.mjs#L63): `test("rear endplates carry window cut-outs and a louvre stack", () => {`
- [79](../../tests/unit/aero-flap-travel.test.mjs#L79): `test("baked rain-light emissive is bloom-capped (channel ≤ 1.90)", () => {`
- [97](../../tests/unit/aero-flap-travel.test.mjs#L97): `test("CarMesh.drawAeroEdge is opt-in debug, not the shipped wing look", () => {`
- [105](../../tests/unit/aero-flap-travel.test.mjs#L105): `test("moving and rest flap meshes honor carbon surface independently of hidden paint and finish", () => {`
- [124](../../tests/unit/aero-flap-travel.test.mjs#L124): `test("complete carbon car build threads bare surface onto its appended flaps", () => {`

### 9. aero-preview-fields.test.mjs

Target: Parts visual registry; Car3D appearanceParts/PART_STYLE_FIELDS; CarDraw teamDecalState/wheels; CarMesh decals.

Fixture: loadParts with McLaren; quantized FNV hash of positions/colours/materials; carDrawVm; mesh/texture-upload spies.

Assertions and limits: Period STYLE rows clone cost/stats, change meshes, explicit zero preserves hash; every livery shape reproduces catalogue without cost/mod/setup mutation; same-revision shape/undo cache invalidation while paint reuses recipes; moving wheel inputs; concept decal cache follows geometry. Hash ignores index/normal arrays and is quantized, so “bit-for-bit” in comments overstates asserted equality.

Case declaration entrypoints:

- [36](../../tests/unit/aero-preview-fields.test.mjs#L36): `test("each period field is registered and its STYLE row clones its base row's cost and stats", () => {`
- [46](../../tests/unit/aero-preview-fields.test.mjs#L46): `test("each STYLE row builds a car distinct from the row it clones", () => {`
- [52](../../tests/unit/aero-preview-fields.test.mjs#L52): `test("an explicit 0 builds the shipped car bit-for-bit (default off)", () => {`
- [63](../../tests/unit/aero-preview-fields.test.mjs#L63): `test("all livery part styles reproduce catalog meshes without mutating fitted parts or performance", () => {`
- [93](../../tests/unit/aero-preview-fields.test.mjs#L93): `test("runtime flap/decal recipes follow shape edits, undo and cancel without a store revision", () => {`
- [113](../../tests/unit/aero-preview-fields.test.mjs#L113): `test("runtime part recipes follow every style without invalidating for paint edits", () => {`
- [134](../../tests/unit/aero-preview-fields.test.mjs#L134): `test("moving player wheels use livery tyre, brake and rim recipes and restore FITTED", () => {`
- [156](../../tests/unit/aero-preview-fields.test.mjs#L156): `test("concept wing decals cannot reuse fitted wing geometry at the same aero level", () => {`

### 10. aero-shapes-d3c.test.mjs

Target: Parts aero/floor visual registry; Car3D.buildComplete/aeroFlaps.

Fixture: loadParts McLaren; ROWS four concepts, nine fields; quantized mesh hash; both garage-first/track-first cache warmup orders.

Assertions and limits: Registry/stats cloning; distinct concepts; explicit-zero baseline; flown tip lift/gap matches baked fields, Keel ears absent both cache orders; four diffuser rows reach mesh. Hash equality has same quantization limitation as preview-fields.

Case declaration entrypoints:

- [37](../../tests/unit/aero-shapes-d3c.test.mjs#L37): `test("every shape field is registered and each row clones its base row's cost and stats", () => {`
- [48](../../tests/unit/aero-shapes-d3c.test.mjs#L48): `test("each row builds a car distinct from the row it clones", () => {`
- [52](../../tests/unit/aero-shapes-d3c.test.mjs#L52): `test("explicit 0 on every shape field builds the shipped car bit-for-bit", () => {`
- [61](../../tests/unit/aero-shapes-d3c.test.mjs#L61): `test("flown flaps carry the same tip lift as the baked wing", () => {`
- [73](../../tests/unit/aero-shapes-d3c.test.mjs#L73): `test("Flatline fwGap stands each flown front flap g x its cascade index higher", () => {`
- [86](../../tests/unit/aero-shapes-d3c.test.mjs#L86): `test("Keel flown flaps have no ears in either cache warm-up order (track style vs garage style)", () => {`
- [100](../../tests/unit/aero-shapes-d3c.test.mjs#L100): `test("each concept diffuser row reaches the mesh and an explicit 0 is the shipped floor", () => {`

### 11. aero-zone-tables.test.mjs

Target: AeroZones.zonesFor/AERO_ZONE_TURNS/ZONE_COUNT; track-maps/select-screen; season-cal.

Fixture: verify-track.buildContext real centreline; Log.warn capture with deliberate invalid Monza table mutation restored in finally; full-build parity control.

Assertions and limits: Every authored table resolves without warning and returns pair count; warning observable; Imola window stays Alta, Monaco zero; map delegates with no local DRS scan, picker says AERO; calendar/SEASON circuits all have counts. Comments describing an independent rebuilt scan are stale after warning-based fix.

Case declaration entrypoints:

- [53](../../tests/unit/aero-zone-tables.test.mjs#L53): `test("the centreline gives zonesFor() the same zones a full build does", () => {`
- [58](../../tests/unit/aero-zone-tables.test.mjs#L58): `test("every circuit's authored turn table resolves — an unread table is a silent fallback", () => {`
- [81](../../tests/unit/aero-zone-tables.test.mjs#L81): `test("the discard warning is observable here (mutation: one pair that bounds nothing)", () => {`
- [94](../../tests/unit/aero-zone-tables.test.mjs#L94): `test("Imola corner renumbering retains its authored Alta approach aero window", () => {`
- [107](../../tests/unit/aero-zone-tables.test.mjs#L107): `test("a resolved table is the one zonesFor() actually returns", () => {`
- [119](../../tests/unit/aero-zone-tables.test.mjs#L119): `test("Monaco has no activation zones, and no curvature scan can know that", () => {`
- [127](../../tests/unit/aero-zone-tables.test.mjs#L127): `test("the MAP asks AeroZones where the zones are — it does not scan curvature itself", () => {`
- [157](../../tests/unit/aero-zone-tables.test.mjs#L157): `test("the circuit picker names the zones the way the HUD does (AERO, never DRS)", () => {`
- [165](../../tests/unit/aero-zone-tables.test.mjs#L165): `test("every current-calendar circuit has an authored ZONE_COUNT — none races the raw scan (#3557)", () => {`

### 12. aero-zones-turns.test.mjs

Target: AeroZones.create/build and published count/turn tables.

Fixture: Real verify-track centreline with independently implemented 8m curvature scan at0.0014; no table consultation in reference.

Assertions and limits: Bahrain/Jeddah lack unsupported turn keys; all turn-keyed endpoints equal length-only within1e-6; all known published counts resolve. Independent reference intentionally duplicates algorithm constants, so changes require revisiting equivalence intent.

Case declaration entrypoints:

- [63](../../tests/unit/aero-zones-turns.test.mjs#L63): `test("AERO_ZONE_TURNS never names bahrain or jeddah", () => {`
- [70](../../tests/unit/aero-zones-turns.test.mjs#L70): `test("every AERO_ZONE_TURNS entry reproduces the length-only selection exactly", () => {`
- [101](../../tests/unit/aero-zones-turns.test.mjs#L101): `test("every ZONE_COUNT circuit still resolves to exactly its published count", () => {`

### 13. aero-zones-vm.test.mjs

Target: AeroZones + game active aero/overtake and RaceControl.

Fixture: Shared game VM; physics reset; day/night toggles force rebuild with Log build-count proof; separate part-seeded VMs for wing comparison; AI placed away to remove tow.

Assertions and limits: Published zone counts/minimums, Monaco never arms, pace rebuild invariance, both sides of seam inZone and 1.5m zoneAhead tolerance, overtake exactly leader L1→L2 while aero available L1; X-mode vmax/downforce ratios and stronger-wing monotonic trade. Header “all10” is stale relative to parameterized/added declarations.

Case declaration entrypoints:

- [52](../../tests/unit/aero-zones-vm.test.mjs#L52): `test("a fast circuit has zones, and every one clears the three-second minimum", async () => {`
- [60](../../tests/unit/aero-zones-vm.test.mjs#L60): `test("MONACO has no zone at all — 2026 switches active aero off there", async () => {`
- [66](../../tests/unit/aero-zones-vm.test.mjs#L66): `test(ˋ${id} gets the real number of zones, not a derived guessˋ, async () => {`
- [74](../../tests/unit/aero-zones-vm.test.mjs#L74): `test("with no zone, the mode can never arm however hard it is asked for", async () => {`
- [94](../../tests/unit/aero-zones-vm.test.mjs#L94): `test("zones are a property of the CIRCUIT — the pace slider cannot add or remove one", async () => {`
- [119](../../tests/unit/aero-zones-vm.test.mjs#L119): `test("inZone and zoneAhead agree with the zone list, wrap included", async () => {`
- [139](../../tests/unit/aero-zones-vm.test.mjs#L139): `test("outside a zone, zoneAhead is the distance to the next zone start", async () => {`
- [167](../../tests/unit/aero-zones-vm.test.mjs#L167): `test("overtake stays disabled for the whole opening lap, then arms when the LEADER starts lap 2", async () => {`
- [210](../../tests/unit/aero-zones-vm.test.mjs#L210): `test("active aero is NOT gated by the opening lap — it arms inside a zone on lap 1", async () => {`
- [226](../../tests/unit/aero-zones-vm.test.mjs#L226): `test("X-mode buys X_VMAX_GAIN of vmax and gives up X_DF_LOSS of the aero load", async () => {`
- [257](../../tests/unit/aero-zones-vm.test.mjs#L257): `test("a bigger wing trades HARDER — both halves scale with the aero part", async () => {`

### 14. agent-anchors-vm.test.mjs

Target: agent apex act/rollout/aiPlace and render anchors.

Fixture: Shared game VM; direct G cars snapshot six fields after an initial step; one-tick rollout setup; manually lit countdown.

Assertions and limits: act and rollout anchor every car at pre-step pose, aiPlace anchors new pose, both countdown promotions clear lightsLit. reset/jump named in introductory contract are not separately asserted in this file.

Case declaration entrypoints:

- [51](../../tests/unit/agent-anchors-vm.test.mjs#L51): `test("act() anchors every car at its pre-step pose", async () => {`
- [58](../../tests/unit/agent-anchors-vm.test.mjs#L58): `test("rollout() anchors every car at its pre-tick pose", async () => {`
- [67](../../tests/unit/agent-anchors-vm.test.mjs#L67): `test("aiPlace() anchors the car it moves", async () => {`
- [77](../../tests/unit/agent-anchors-vm.test.mjs#L77): `test("act() from the countdown puts the lit-lights counter out too", async () => {`
- [87](../../tests/unit/agent-anchors-vm.test.mjs#L87): `test("rollout() from the countdown puts the lit-lights counter out too", async () => {`

### 15. agent-config.test.mjs

Target: Agent host catalogues/rules/hooks/memory/skills/workflows.

Fixture: git-fixture-env scrub; YAML parser; configured budget JSON; real shell/python hook subprocesses; throwaway committed repos under artifacts, fake owned sleeping supervisor/playwright processes and guaranteed cleanup.

Assertions and limits: Host MCP launch lockstep/allowlists/secrets, CLI-only TinyFish, generated Cursor mirrors, hook registration and executable bits; actual Bash kill/commit/write/subagent enforcement with allow controls, MCP guard, memory type/link/source/secrets/expiry/invisible characters, protected generated writes/worktree distinction; skill mirror/help side effects, line/word/byte/char/routing/reference budgets, GitHub permissions, no squash prose, delegation ownership, routing recipes and stop-junk behavior. Static content budgets prove shape not prose truth; selected hook tests execute enforcement.

Case declaration entrypoints:

- [80](../../tests/unit/agent-config.test.mjs#L80): `test("memory type schema only accepts top-level or metadata type in the first frontmatter", () => {`
- [96](../../tests/unit/agent-config.test.mjs#L96): `test("memory link guard catches missing Markdown/wiki targets and orphan topics", () => {`
- [116](../../tests/unit/agent-config.test.mjs#L116): `test("AGENTS.md stays under 200 lines and emphasises at most one line", () => {`
- [132](../../tests/unit/agent-config.test.mjs#L132): `test("the three MCP catalogs name the same servers with the same launch lines", () => {`
- [164](../../tests/unit/agent-config.test.mjs#L164): `test("tinyfish stays CLI-only: the lockstep guard owns its deliberate non-attachment", () => {`
- [203](../../tests/unit/agent-config.test.mjs#L203): `test("Claude rules generate Cursor .mdc twins (gen-cursor-rules owns the mirror)", () => {`
- [227](../../tests/unit/agent-config.test.mjs#L227): `test("settings.json registers the hooks that enforce the rules, and each hook exists", () => {`
- [255](../../tests/unit/agent-config.test.mjs#L255): `test("the Bash guard blocks every shape of the kill that orphans browsers", () => {`
- [301](../../tests/unit/agent-config.test.mjs#L301): `test("the Bash guard refuses a browser run from inside a subagent, and only there", () => {`
- [348](../../tests/unit/agent-config.test.mjs#L348): `test("the Bash guard blocks a bare kill of the supervisor pid test-bg records", () => {`
- [385](../../tests/unit/agent-config.test.mjs#L385): `test("the commit guard recognises every shape of git commit, and judges what is COMMITTED", () => {`
- [440](../../tests/unit/agent-config.test.mjs#L440): `test("the edit guard sees Bash writes: sed -i, heredocs, tee, cp into js/ or a generated file", () => {`
- [488](../../tests/unit/agent-config.test.mjs#L488): `test("a subagent cannot reach a browser through MCP tools either", () => {`
- [517](../../tests/unit/agent-config.test.mjs#L517): `test("auto memory is on, synced, and its tracked copy stays small, typed and secret-free", () => {`
- [547](../../tests/unit/agent-config.test.mjs#L547): `test("shared memory has no orphan topics or missing relative Markdown/wiki links", () => {`
- [561](../../tests/unit/agent-config.test.mjs#L561): `test("a memory's source: paths still exist", () => {`
- [581](../../tests/unit/agent-config.test.mjs#L581): `test("MEMORY.md index has no duplicate topic links, no coordination restatements, no Stale-check topics", () => {`
- [609](../../tests/unit/agent-config.test.mjs#L609): `test("no instruction or memory file carries invisible or bidi-control characters", () => {`
- [626](../../tests/unit/agent-config.test.mjs#L626): `test("the edit guard treats tests/data/ratchets.json as tool-written", () => {`
- [642](../../tests/unit/agent-config.test.mjs#L642): `test("the edit guard refuses a generated package.json block through Write as well as Edit", () => {`
- [679](../../tests/unit/agent-config.test.mjs#L679): `test("the Codex skill mirror is tracked symlinks and the repair script exists", () => {`
- [691](../../tests/unit/agent-config.test.mjs#L691): `test("env install scripts and live-run.py answer --help without side effects", () => {`
- [722](../../tests/unit/agent-config.test.mjs#L722): `test("the always-on instruction surface stays inside its budget", () => {`
- [769](../../tests/unit/agent-config.test.mjs#L769): `test("AGENTS.md and every root-to-nested AGENTS.md chain fit Codex's project-doc byte cap", () => {`
- [787](../../tests/unit/agent-config.test.mjs#L787): `test("nested AGENTS.md files are symlinks to their sibling CLAUDE.md (one copy per directory)", () => {`
- [796](../../tests/unit/agent-config.test.mjs#L796): `test("skill descriptions: a char budget, every arrow resolves, every skill has routing queries", () => {`
- [822](../../tests/unit/agent-config.test.mjs#L822): `test("settings.json denies GitHub-MCP repo surgery; nothing asks (the owner, 2026-10-15)", () => {`
- [837](../../tests/unit/agent-config.test.mjs#L837): `test(".cursor/environment.json allowlists exactly the .mcp.json servers, with their launch lines", () => {`
- [869](../../tests/unit/agent-config.test.mjs#L869): `test("every agent-memory store declares its schema and how an entry expires", () => {`
- [902](../../tests/unit/agent-config.test.mjs#L902): `test("every skill reference is linked from its SKILL.md and, past 100 lines, opens with a Contents block", () => {`
- [941](../../tests/unit/agent-config.test.mjs#L941): `test("no agent-facing file tells an agent to arm or merge with SQUASH", () => {`
- [953](../../tests/unit/agent-config.test.mjs#L953): `test("bash-guard's in-script trigger filter covers every policed command shape (#1711)", () => {`
- [978](../../tests/unit/agent-config.test.mjs#L978): `test("the survey-track delegation template owns exactly what the track-surveyor hook lets it write (#1984)", () => {`
- [995](../../tests/unit/agent-config.test.mjs#L995): `test("no SKILL.md quotes a suite size ('~100 tests'): a count drifts, the command does not (#1693)", () => {`
- [1007](../../tests/unit/agent-config.test.mjs#L1007): `test("check-changes routes the add-a-VM-twin recipe and the scoped DEFECT-LEDGER grep (#1688 #1687)", () => {`
- [1020](../../tests/unit/agent-config.test.mjs#L1020): `test("mcp-probe carries the tool-naming table; renderer-debug carries all_dark and the webgpu smoke (#1700)", () => {`
- [1032](../../tests/unit/agent-config.test.mjs#L1032): `test("stop-guard.sh lets a stop through when Claude is already continuing, and on junk input", () => {`

### 16. agent-determinism-vm.test.mjs

Target: apex seed/reset/rollout/field/carState.

Fixture: Shared game VM Monza; reset same fraction/speed/seed; episode4s; compares JSON digests and all scalar car fields.

Assertions and limits: Same seed repeats exact outcome/grid; different seed differs grid; seed roundtrip/reset order; every car-state key resets identically. rAF determinism explicitly belongs to separate browser frame spec.

Case declaration entrypoints:

- [36](../../tests/unit/agent-determinism-vm.test.mjs#L36): `test("the same seed replays an episode exactly", () => {`
- [43](../../tests/unit/agent-determinism-vm.test.mjs#L43): `test("a different seed deals a different grid", () => {`
- [48](../../tests/unit/agent-determinism-vm.test.mjs#L48): `test("seed() round-trips and reset({seed}) applies before the grid is built", () => {`
- [57](../../tests/unit/agent-determinism-vm.test.mjs#L57): `test("reset() leaves no episode state on the cars", () => {`

### 17. agent-experiment.test.mjs

Target: tests/helpers/agent-experiment.py; tools/agent-run.mjs.

Fixture: Temporary Git repositories, exact child bytes/argv, permission checks, timeout descendants including TERM-ignoring fork; read records.jsonl and CLI receipts.

Assertions and limits: Refuse wrong cwd/HEAD/path/symlink before child; exact bytes and nonzero exit, mode mismatch, private perms, launch/budget/timeout evidence, owned descendants cleaned, route inferred only from runner options; missing launch has null child exit; saved-read inference. Uses OS tmpdir despite repository guidance preferring artifacts for regenerable evidence (test fixture not task artifact).

Case declaration entrypoints:

- [22](../../tests/unit/agent-experiment.test.mjs#L22): `test('wrong cwd, HEAD, traversal and symlink escape refuse before child execution', t => {`
- [35](../../tests/unit/agent-experiment.test.mjs#L35): `test('raw bytes, exact argv/cwd/head, exit 7 and visible mismatch survive capture', t => {`
- [59](../../tests/unit/agent-experiment.test.mjs#L59): `test('limits and between-command caps refuse launch and report admitted overshoot', t => {`
- [75](../../tests/unit/agent-experiment.test.mjs#L75): `test('timeout records original terminating signal and bounded cleanup', t => {`
- [85](../../tests/unit/agent-experiment.test.mjs#L85): `test('timeout kills a TERM-ignoring owned descendant after its pipes close', async t => {`
- [117](../../tests/unit/agent-experiment.test.mjs#L117): `test('agent-run route is inferred from its options and ignores child options', t => {`
- [126](../../tests/unit/agent-experiment.test.mjs#L126): `test('launch errors retain an error and do not fabricate a child exit', t => {`
- [135](../../tests/unit/agent-experiment.test.mjs#L135): `test('omitted declaration infers saved-read route without fabricating a mismatch', t => {`

### 18. agent-hooks-vm.test.mjs

Target: AgentView world/rollout; apex hooks; game loop/teleport; slipBudget/corners.

Fixture: Shared game VM plus own boot for stepped browser-like null-world race switch; direct car/lap/mod mutation, stub sampling exception and restored track definitions.

Assertions and limits: Race-finish early stop/errors, invalid policyHz/horizon/node arguments, road-vs-standings gaps across seam, retired classification agreement, scale input validation, stationary corner null time, weather stars logic; flying-start ownership; delta tolerance/sequence and restoration on exception; axFrac/slip parity incl brake mods; short teleport no phantom lap vs real crossing; stepped null-world switch keeps frame count/fault health; smoothed-corner fallback differs raw peaks.

Case declaration entrypoints:

- [39](../../tests/unit/agent-hooks-vm.test.mjs#L39): `test("rollout stops at the flag instead of averaging frozen frames", async () => {`
- [52](../../tests/unit/agent-hooks-vm.test.mjs#L52): `test("rollout refuses a policyHz that is not positive", async () => {`
- [60](../../tests/unit/agent-hooks-vm.test.mjs#L60): `test("a lapped rival a few metres ahead on the road is ahead, not a lap away", async () => {`
- [74](../../tests/unit/agent-hooks-vm.test.mjs#L74): `test("same-lap rivals do not invent lapsAhead from nearest-prog wrap", async () => {`
- [91](../../tests/unit/agent-hooks-vm.test.mjs#L91): `test("a retired car is classified behind the running field in every order hook", async () => {`
- [105](../../tests/unit/agent-hooks-vm.test.mjs#L105): `test("scale hooks refuse a fraction instead of saving the floor", async () => {`
- [116](../../tests/unit/agent-hooks-vm.test.mjs#L116): `test("nextCorner has no time-to-corner while stationary", async () => {`
- [121](../../tests/unit/agent-hooks-vm.test.mjs#L121): `test("a rainy night does not claim a starry sky the cloud deck hides", async () => {`
- [140](../../tests/unit/agent-hooks-vm.test.mjs#L140): `test("act() in a time trial ends the flying-start run-up: the wheel is the agent's", async () => {`
- [157](../../tests/unit/agent-hooks-vm.test.mjs#L157): `test("reset() ends an armed flying-start run-up", async () => {`
- [170](../../tests/unit/agent-hooks-vm.test.mjs#L170): `test("world().ego.pos for a retired player is the same running-then-retired rank as timing()", async () => {`
- [180](../../tests/unit/agent-hooks-vm.test.mjs#L180): `test("world({since}) reports a small move of a unit-range field (frac within 0.005), not a quarter-range deadband", async () => {`
- [199](../../tests/unit/agent-hooks-vm.test.mjs#L199): `test("obs().axFrac and physState().axFrac agree, both preferring the stored value", async () => {`
- [207](../../tests/unit/agent-hooks-vm.test.mjs#L207): `test("nodeAt(NaN) and other non-numbers answer {ok:false} instead of throwing", async () => {`
- [225](../../tests/unit/agent-hooks-vm.test.mjs#L225): `test("a stepped race switch under go() keeps the loop alive and step() safe while the world is null", async () => {`
- [267](../../tests/unit/agent-hooks-vm.test.mjs#L267): `test("a short jump() across the line is not banked twice and counts no lap", async () => {`
- [284](../../tests/unit/agent-hooks-vm.test.mjs#L284): `test("world rejects invalid horizons before changing its delta sequence", async () => {`
- [291](../../tests/unit/agent-hooks-vm.test.mjs#L291): `test("rivals across the line keep nearby road gaps with differing standings", async () => {`
- [303](../../tests/unit/agent-hooks-vm.test.mjs#L303): `test("aiPlace short line teleport does not count a lap; physical crossing does", async () => {`
- [313](../../tests/unit/agent-hooks-vm.test.mjs#L313): `test("rollout restores input and world delta cache on sampling exceptions", async () => {`
- [329](../../tests/unit/agent-hooks-vm.test.mjs#L329): `test("world(), obs() and physState() report the same slip budget under hard braking with mods.braking > 1", async () => {`
- [355](../../tests/unit/agent-hooks-vm.test.mjs#L355): `test("a def without turns gets the smoothed-peak corner table, not __apex.corners()' raw peaks", async () => {`

### 19. agent-indexes.test.mjs

Target: tools/docs/gen-agent-index.mjs; gen-coverage-table.mjs; tools/shot/agent.mjs.

Fixture: Fresh renderer outputs vs committed generated files; deliberate string drift; CLI check/unknown flag; live createGame agentHelp census.

Assertions and limits: Generated docs/index/impact exact equality and drift detection; check mode no unknown-flag writes; one-hook help/no boot envelope; source/live/index bijection; narrow GLX livery witnesses, static-reference impact shape and no volatile counts.

Case declaration entrypoints:

- [27](../../tests/unit/agent-indexes.test.mjs#L27): `test("coverage page and agent index match a fresh render", () => {`
- [35](../../tests/unit/agent-indexes.test.mjs#L35): `test("a drifted generated page fails the staleness comparison", () => {`
- [43](../../tests/unit/agent-indexes.test.mjs#L43): `test("generator --check is clean, and an unknown flag does not write", () => {`
- [55](../../tests/unit/agent-indexes.test.mjs#L55): `test("help physState prints that hook and no other", () => {`
- [69](../../tests/unit/agent-indexes.test.mjs#L69): `test("index hook rows are a bijection with agentHelp()", async () => {`
- [85](../../tests/unit/agent-indexes.test.mjs#L85): `test("impact map carries garage livery narrow pins for GLX readback witnesses (#3601)", () => {`
- [97](../../tests/unit/agent-indexes.test.mjs#L97): `test("impact map is a narrow file to function to specs table", () => {`
- [111](../../tests/unit/agent-indexes.test.mjs#L111): `test("agent index carries no volatile test counts (#2808)", () => {`

### 20. agent-output-config.test.mjs

Target: MCP output gateway catalogue across Claude/Cursor/Codex.

Fixture: nativeMcpConfig helper unwraps pinned gateway args; JSON/TOML inspection and glob matching.

Assertions and limits: Six exact pinned bash routes including timeout, host lockstep, allowlist admits gateway/native wrappers one each; malformed server identity or non-bash substitution rejects.

Case declaration entrypoints:

- [12](../../tests/unit/agent-output-config.test.mjs#L12): `test("every configured MCP server uses the common output gateway and retains its native pinned launcher", () => {`
- [57](../../tests/unit/agent-output-config.test.mjs#L57): `test("native pin inspection rejects a malformed or substituted gateway route", () => {`

### 21. agent-output.test.mjs

Target: tools/agent/output.mjs; process.mjs; tools/agent-run.mjs.

Fixture: Scratch fixture dirs; huge JSON/logs, binary/UTF8 streams, fake MCP text+images; spawned CLI child trees with ignored signals and live atomic-status observer.

Assertions and limits: Levels strict; bounded summaries retain issues/counts/precision and report omissions/pointers; full preserves native exact result/streams; private artifacts, traversal/symlink rejection and presentation fallback; CLI exit/timeout/spawn/help/argv semantics; diagnostic priority and no passing-name false positives; final-JSON reports; native-small vs useful-summary sizing; exact collection pagination and original retrieval; progress atomicity/cursors; timeout/cancel tree cleanup versus intentional normal detached handoff.

Case declaration entrypoints:

- [20](../../tests/unit/agent-output.test.mjs#L20): `test('levels reject mistakes rather than silently falling back', () => {`
- [26](../../tests/unit/agent-output.test.mjs#L26): `test('huge JSON retains failure, counts and bounded excerpts with omissions', () => {`
- [38](../../tests/unit/agent-output.test.mjs#L38): `test('wide numeric trees and huge property names remain bounded', () => {`
- [51](../../tests/unit/agent-output.test.mjs#L51): `test('full MCP preserves exact result identity while compact mirrors artifact envelope in text', (t) => {`
- [65](../../tests/unit/agent-output.test.mjs#L65): `test('byte retrieval is paged, level independent and traversal/symlink safe', (t) => {`
- [79](../../tests/unit/agent-output.test.mjs#L79): `test('artifact directory symlinks are rejected and presentation failure preserves original error', (t) => {`
- [94](../../tests/unit/agent-output.test.mjs#L94): `test('CLI defaults compact, preserves failing exit and exact separately retained streams', (t) => {`
- [113](../../tests/unit/agent-output.test.mjs#L113): `test('CLI full replays exact streams and never interprets argv as shell', (t) => {`
- [121](../../tests/unit/agent-output.test.mjs#L121): `test('CLI help and invalid options execute nothing; missing executables and explicit timeouts remain failures', (t) => {`
- [142](../../tests/unit/agent-output.test.mjs#L142): `test('diagnostic finds middle failure lines in long logs', (t) => {`
- [150](../../tests/unit/agent-output.test.mjs#L150): `test('compact retains actionable middle failures and reported test counts', t => {`
- [162](../../tests/unit/agent-output.test.mjs#L162): `test('passing error-related test names and generic chatter cannot crowd out real failures or warnings', t => {`
- [190](../../tests/unit/agent-output.test.mjs#L190): `test('tagged producer markers preserve real failures and zero-valued assertion expectations', t => {`
- [211](../../tests/unit/agent-output.test.mjs#L211): `test('spec failure markers are actionable even when their names contain no error keywords', t => {`
- [220](../../tests/unit/agent-output.test.mjs#L220): `test('capture and performance phase logs retain semantic final reports and validity evidence', t => {`
- [237](../../tests/unit/agent-output.test.mjs#L237): `test('small MCP answers retain native schema and avoid duplicate summary payloads', t => {`
- [249](../../tests/unit/agent-output.test.mjs#L249): `test('a mid-size answer the summary cannot shrink stays native; one it can shrink is summarized', t => {`
- [270](../../tests/unit/agent-output.test.mjs#L270): `test('exact collection pages recover all omitted rows without advancing upstream cursors', t => {`
- [290](../../tests/unit/agent-output.test.mjs#L290): `test('opt-in progress exposes running status before completion without stdout preambles', async t => {`
- [323](../../tests/unit/agent-output.test.mjs#L323): `test('diagnostic collections surface late failures and warnings while ordinary arrays keep their order', () => {`
- [334](../../tests/unit/agent-output.test.mjs#L334): `test('status-bearing collections prioritize late issues independently of their names', () => {`
- [349](../../tests/unit/agent-output.test.mjs#L349): `test('successful rows with structured warnings retain warning priority and source status counts', () => {`
- [366](../../tests/unit/agent-output.test.mjs#L366): `test('warning-only rows are actionable while empty warning fields and passing names are not', () => {`
- [376](../../tests/unit/agent-output.test.mjs#L376): `test('status-less rows that list problems (car_audit dead parts) outrank clean rows; empty lists do not', () => {`
- [395](../../tests/unit/agent-output.test.mjs#L395): `test('MCP summaries deduplicate identical transport text and structured data', () => {`
- [401](../../tests/unit/agent-output.test.mjs#L401): `test('original MCP retrieval restores content and split UTF8 pages retain exact bytes', (t) => {`
- [428](../../tests/unit/agent-output.test.mjs#L428): `test('explicit timeout escalates ignored signals and removes detached descendants', async (t) => {`
- [438](../../tests/unit/agent-output.test.mjs#L438): `test('natural nonzero root exit cleans detached descendants and retains exit code', async (t) => {`
- [447](../../tests/unit/agent-output.test.mjs#L447): `test('CLI cancellation forwards original signal and finishes descendant cleanup first', async (t) => {`
- [465](../../tests/unit/agent-output.test.mjs#L465): `test('normal CLI exit preserves intentional detached background handoff', async (t) => {`

### 22. agent-surface.test.mjs

Target: docs/AGENT-SURFACE.md; apex MCP registry/catalogue; host configurations/skills/workflows.

Fixture: Static Markdown table parser, JSON/TOML, symlink inspection, public list-tools subprocess, AsyncFunction parse of saved workflows.

Assertions and limits: Wrap catalogue bijection, real CLI/skill and tree/browser lock descriptions, removed servers/docs pointers/never-wrap, bootstrap host lockstep and mirrors; documented frontmatter key allowlist with typo controls; fork-agent handshake/set, no skill paths, workflow parses/phases/existing and required agentTypes. Comments still say “four that left” although loop checks three removals.

Case declaration entrypoints:

- [40](../../tests/unit/agent-surface.test.mjs#L40): `test("wrap map names match tools/mcp/apex-tools-mcp.json", () => {`
- [49](../../tests/unit/agent-surface.test.mjs#L49): `test("every wrap row has a real CLI (or built-in) and a real skill", () => {`
- [70](../../tests/unit/agent-surface.test.mjs#L70): `test("server table names the attached servers and the four that left", () => {`
- [96](../../tests/unit/agent-surface.test.mjs#L96): `test("never-wrap table names the load-bearing refuses", () => {`
- [114](../../tests/unit/agent-surface.test.mjs#L114): `test("mcp-smoke is a CLI, not an apex_* wrap", () => {`
- [123](../../tests/unit/agent-surface.test.mjs#L123): `test("indexes point at AGENT-SURFACE.md", () => {`
- [139](../../tests/unit/agent-surface.test.mjs#L139): `test("bootstrap contract is documented for Cloud + desktop", () => {`
- [168](../../tests/unit/agent-surface.test.mjs#L168): `test("Codex skill mirror locksteps .claude/skills via symlinks", () => {`
- [197](../../tests/unit/agent-surface.test.mjs#L197): `test("Codex .codex/config.toml MCP servers lockstep .mcp.json", () => {`
- [218](../../tests/unit/agent-surface.test.mjs#L218): `test("MCP descriptions state tree vs browser", () => {`
- [268](../../tests/unit/agent-surface.test.mjs#L268): `test("every agent and skill frontmatter key is one a host documents", () => {`
- [297](../../tests/unit/agent-surface.test.mjs#L297): `test("every skill with agent: names an existing subagent or a builtin, and forks", () => {`
- [312](../../tests/unit/agent-surface.test.mjs#L312): `test("no skill declares paths: — it replaces description triggering instead of adding to it", () => {`
- [338](../../tests/unit/agent-surface.test.mjs#L338): `test("every saved workflow parses and names only existing agentTypes", () => {`

### 23. agent-view-vm.test.mjs

Target: AgentView and AgentRaster public hooks + geometry raster/scene/survey.

Fixture: Shared virgin-boot game VM; per-load input/headless/log/freeze/chase reset, synthetic monotonic50ms frame pump and snapCam; host copies for cross-realm equality; explicit no-track getter override.

Assertions and limits: Full assertion catalogue below covers typed errors/detail/size, speed horizon, rivals/field, road/camber/elevation, atmosphere, describe/query, deltas incl shrink escape, corners/track metadata/seed, ERS/penalties/physics, nextCorner, camera/orbit/edges/depth/stale raster, map, measured car meshes/parts/identity, survey, circuit aggregation/pagination, rollout/control/policy/errors/delta preservation, scene/filter/project/terminal. Frustum chunk case deliberately stays browser-only; GLX buffers/pixels and real frame scheduling are not evidenced.

Case declaration entrypoints:

- [109](../../tests/unit/agent-view-vm.test.mjs#L109): `test("before a race is started, the error names the hook that fixes it", () => {`
- [121](../../tests/unit/agent-view-vm.test.mjs#L121): `test("trackInfo never returns null — payload or typed error", () => {`
- [134](../../tests/unit/agent-view-vm.test.mjs#L134): `test("never returns null — a render or an actionable error", () => {`
- [163](../../tests/unit/agent-view-vm.test.mjs#L163): `test("map never returns null — a grid, or NoTrackError with no track", () => {`
- [169](../../tests/unit/agent-view-vm.test.mjs#L169): `test("survey never returns null — a summary, or NoTrackError with no track", () => {`
- [175](../../tests/unit/agent-view-vm.test.mjs#L175): `test("scene never returns null — a registry, or NoTrackError with no track", () => {`
- [181](../../tests/unit/agent-view-vm.test.mjs#L181): `test("states the goal, the trade-offs and the constraints, compactly", () => {`
- [196](../../tests/unit/agent-view-vm.test.mjs#L196): `test("needs no track loaded — it is static", () => {`
- [203](../../tests/unit/agent-view-vm.test.mjs#L203): `test("describes the surface without needing a track", () => {`
- [237](../../tests/unit/agent-view-vm.test.mjs#L237): `test("player not placed names the hook that fixes it", async () => {`
- [258](../../tests/unit/agent-view-vm.test.mjs#L258): `test("a bad detail level is rejected with the valid set", async () => {`
- [268](../../tests/unit/agent-view-vm.test.mjs#L268): `test("brief carries the envelope, ego and a one-line summary", async () => {`
- [288](../../tests/unit/agent-view-vm.test.mjs#L288): `test("drive adds lookahead, rivals and affordances", async () => {`
- [299](../../tests/unit/agent-view-vm.test.mjs#L299): `test("full adds session, terminal and raw physics", async () => {`
- [312](../../tests/unit/agent-view-vm.test.mjs#L312): `test("brief is materially smaller than full", async () => {`
- [323](../../tests/unit/agent-view-vm.test.mjs#L323): `test("horizon distance grows with speed at fixed horizonS", async () => {`
- [332](../../tests/unit/agent-view-vm.test.mjs#L332): `test("every look-ahead point carries a direction and a width", async () => {`
- [344](../../tests/unit/agent-view-vm.test.mjs#L344): `test("rivals are sorted by gap and framed relative to the player", async () => {`
- [357](../../tests/unit/agent-view-vm.test.mjs#L357): `test("lateralM is relative to the player, not the centreline", async () => {`
- [372](../../tests/unit/agent-view-vm.test.mjs#L372): `test("lists every car by position with second gaps, compactly", async () => {`
- [393](../../tests/unit/agent-view-vm.test.mjs#L393): `test("world().rivals stays compact — no team object is spread per rival", async () => {`
- [405](../../tests/unit/agent-view-vm.test.mjs#L405): `test("Spa's corners carry gradient and kerbs", async () => {`
- [419](../../tests/unit/agent-view-vm.test.mjs#L419): `test("authored bank zones read as banked INTO the turn, not off-camber", async () => {`
- [431](../../tests/unit/agent-view-vm.test.mjs#L431): `test("pacenotes pick up elevation and camber mutators", async () => {`
- [438](../../tests/unit/agent-view-vm.test.mjs#L438): `test("the added detail does not blow the world() budget", async () => {`
- [447](../../tests/unit/agent-view-vm.test.mjs#L447): `test("narrates a day scene and keeps the raw numbers", async () => {`
- [460](../../tests/unit/agent-view-vm.test.mjs#L460): `test("night is dark, floodlit, and names the moon — not a high sun", async () => {`
- [472](../../tests/unit/agent-view-vm.test.mjs#L472): `test("wet weather is called out and matches the grip model", async () => {`
- [483](../../tests/unit/agent-view-vm.test.mjs#L483): `test("visibility is a distance, not a raw fog density", async () => {`
- [492](../../tests/unit/agent-view-vm.test.mjs#L492): `test("expands a scene() row into everything known about that prop", async () => {`
- [509](../../tests/unit/agent-view-vm.test.mjs#L509): `test("resolves corner, car and span ids", async () => {`
- [522](../../tests/unit/agent-view-vm.test.mjs#L522): `test("unknown ids are typed errors that say how to find a real one", async () => {`
- [539](../../tests/unit/agent-view-vm.test.mjs#L539): `test("returns prototype + instances, not N near-identical records", async () => {`
- [554](../../tests/unit/agent-view-vm.test.mjs#L554): `test("is bounded and reports what it withheld", async () => {`
- [563](../../tests/unit/agent-view-vm.test.mjs#L563): `test("filters compose: kind, arc window, radius", async () => {`
- [576](../../tests/unit/agent-view-vm.test.mjs#L576): `test("ids from query resolve through describe", async () => {`
- [588](../../tests/unit/agent-view-vm.test.mjs#L588): `test("seq increments and a delta is smaller than the full payload", async () => {`
- [599](../../tests/unit/agent-view-vm.test.mjs#L599): `test("an unknown since returns the full payload with a note, not an error", async () => {`
- [615](../../tests/unit/agent-view-vm.test.mjs#L615): `test("dropping to a smaller detail level across a since chain returns the full payload", async () => {`
- [626](../../tests/unit/agent-view-vm.test.mjs#L626): `test("a same-detail chain is still a delta, not a full payload", async () => {`
- [636](../../tests/unit/agent-view-vm.test.mjs#L636): `test("Monaco's hairpin is resolved as a hairpin", async () => {`
- [644](../../tests/unit/agent-view-vm.test.mjs#L644): `test("corners are well-formed and non-overlapping", async () => {`
- [663](../../tests/unit/agent-view-vm.test.mjs#L663): `test("the lap closes: integrated heading is a full turn", async () => {`
- [682](../../tests/unit/agent-view-vm.test.mjs#L682): `test("sectors and profile are available and static", async () => {`
- [694](../../tests/unit/agent-view-vm.test.mjs#L694): `test("an unknown ˋwhatˋ is rejected with the valid set", async () => {`
- [704](../../tests/unit/agent-view-vm.test.mjs#L704): `test("penalties are visible, with the rule that governs them", async () => {`
- [714](../../tests/unit/agent-view-vm.test.mjs#L714): `test("ERS reports deployment and the overtake window, not just charge", async () => {`
- [725](../../tests/unit/agent-view-vm.test.mjs#L725): `test("rivals carry pace, so one AI is distinguishable from another", async () => {`
- [737](../../tests/unit/agent-view-vm.test.mjs#L737): `test("full detail exposes engine, recovery and the live tunables", async () => {`
- [750](../../tests/unit/agent-view-vm.test.mjs#L750): `test("trackInfo grounds the circuit in the real world", async () => {`
- [760](../../tests/unit/agent-view-vm.test.mjs#L760): `test("a full snapshot carries the seed that reproduces it", async () => {`
- [771](../../tests/unit/agent-view-vm.test.mjs#L771): `test("names a corner ahead with a braking hint", async () => {`
- [782](../../tests/unit/agent-view-vm.test.mjs#L782): `test("the braking hint grows with speed", async () => {`
- [792](../../tests/unit/agent-view-vm.test.mjs#L792): `test("pacenotes render the road ahead as a rally-style callout", async () => {`
- [803](../../tests/unit/agent-view-vm.test.mjs#L803): `test("renders any of the 15 camera modes without a live frame", async () => {`
- [817](../../tests/unit/agent-view-vm.test.mjs#L817): `test("an unknown camera errors with the valid set", async () => {`
- [825](../../tests/unit/agent-view-vm.test.mjs#L825): `test("orbit frames the car from a bearing", async () => {`
- [833](../../tests/unit/agent-view-vm.test.mjs#L833): `test("edges overlay directional glyphs on silhouettes only", async () => {`
- [846](../../tests/unit/agent-view-vm.test.mjs#L846): `test("rasterises the view into a labelled grid", async () => {`
- [859](../../tests/unit/agent-view-vm.test.mjs#L859): `test("driving on track, the road dominates the lower frame", async () => {`
- [869](../../tests/unit/agent-view-vm.test.mjs#L869): `test("the player car is drawn, and no single object owns the frame", async () => {`
- [879](../../tests/unit/agent-view-vm.test.mjs#L879): `test("sky sits above the horizon row and ground below", async () => {`
- [888](../../tests/unit/agent-view-vm.test.mjs#L888): `test("objects are ranked by how much of the frame they hold", async () => {`
- [896](../../tests/unit/agent-view-vm.test.mjs#L896): `test("rows are derived so the image is not squashed", async () => {`
- [905](../../tests/unit/agent-view-vm.test.mjs#L905): `test("pinned rows are honoured and flagged as uncorrected", async () => {`
- [914](../../tests/unit/agent-view-vm.test.mjs#L914): `test("the depth channel is a real, monotonic depth buffer", async () => {`
- [928](../../tests/unit/agent-view-vm.test.mjs#L928): `test("depth is omitted unless asked for", async () => {`
- [935](../../tests/unit/agent-view-vm.test.mjs#L935): `test("flags a stale frame under headless", async () => {`
- [947](../../tests/unit/agent-view-vm.test.mjs#L947): `test("draws a car-up top-down map with a metric index", async () => {`
- [963](../../tests/unit/agent-view-vm.test.mjs#L963): `test("northUp switches to the world frame", async () => {`
- [970](../../tests/unit/agent-view-vm.test.mjs#L970): `test("a bigger radius covers more track", async () => {`
- [981](../../tests/unit/agent-view-vm.test.mjs#L981): `test("measures the car from a real build", async () => {`
- [994](../../tests/unit/agent-view-vm.test.mjs#L994): `test("reports the full parts spec and its effect", async () => {`
- [1007](../../tests/unit/agent-view-vm.test.mjs#L1007): `test("carries team identity and the chassis silhouette knobs", async () => {`
- [1018](../../tests/unit/agent-view-vm.test.mjs#L1018): `test("a different team gives different geometry or identity", async () => {`
- [1027](../../tests/unit/agent-view-vm.test.mjs#L1027): `test("detail:render draws edge+shade elevations from the real mesh", async () => {`
- [1046](../../tests/unit/agent-view-vm.test.mjs#L1046): `test("render is omitted unless asked for", async () => {`
- [1052](../../tests/unit/agent-view-vm.test.mjs#L1052): `test("an unknown team errors instead of silently answering for another", async () => {`
- [1062](../../tests/unit/agent-view-vm.test.mjs#L1062): `test("Monza surveys clean", async () => {`
- [1075](../../tests/unit/agent-view-vm.test.mjs#L1075): `test("terrain carved under the road is not a cliff", async () => {`
- [1083](../../tests/unit/agent-view-vm.test.mjs#L1083): `test("no circuit ships a model the guard had to reject", async () => {`
- [1089](../../tests/unit/agent-view-vm.test.mjs#L1089): `test("props-over-road is labelled a screen, not a verdict", async () => {`
- [1097](../../tests/unit/agent-view-vm.test.mjs#L1097): `test("the lateral profile is only returned when asked for", async () => {`
- [1110](../../tests/unit/agent-view-vm.test.mjs#L1110): `test("measures every section of the car", async () => {`
- [1124](../../tests/unit/agent-view-vm.test.mjs#L1124): `test("instrumentation changed no geometry", async () => {`
- [1133](../../tests/unit/agent-view-vm.test.mjs#L1133): `test("parts are omitted unless requested", async () => {`
- [1141](../../tests/unit/agent-view-vm.test.mjs#L1141): `test("per-team silhouette shows up in measured geometry", async () => {`
- [1156](../../tests/unit/agent-view-vm.test.mjs#L1156): `test("summary aggregates thousands of objects into a readable document", async () => {`
- [1169](../../tests/unit/agent-view-vm.test.mjs#L1169): `test("no feature spans the whole lap", async () => {`
- [1180](../../tests/unit/agent-view-vm.test.mjs#L1180): `test("landmarks are structures, not repeated dressing", async () => {`
- [1198](../../tests/unit/agent-view-vm.test.mjs#L1198): `test("linear furniture is spans, not thousands of segments", async () => {`
- [1210](../../tests/unit/agent-view-vm.test.mjs#L1210): `test("sections walk the lap corner by corner", async () => {`
- [1225](../../tests/unit/agent-view-vm.test.mjs#L1225): `test("full paginates the raw object list", async () => {`
- [1239](../../tests/unit/agent-view-vm.test.mjs#L1239): `test("sign boards keep their meaning", async () => {`
- [1247](../../tests/unit/agent-view-vm.test.mjs#L1247): `test("rejects an unknown detail level", async () => {`
- [1257](../../tests/unit/agent-view-vm.test.mjs#L1257): `test("summarises an interval instead of returning frames", async () => {`
- [1270](../../tests/unit/agent-view-vm.test.mjs#L1270): `test("full throttle into Monza's first chicane goes off track", async () => {`
- [1278](../../tests/unit/agent-view-vm.test.mjs#L1278): `test("runs a closed-loop policy at policyHz", async () => {`
- [1290](../../tests/unit/agent-view-vm.test.mjs#L1290): `test("a throwing policy returns a typed error, not a crash", async () => {`
- [1299](../../tests/unit/agent-view-vm.test.mjs#L1299): `test("does not disturb the caller's delta chain", async () => {`
- [1309](../../tests/unit/agent-view-vm.test.mjs#L1309): `test("records minimum speed through corners actually driven", async () => {`
- [1321](../../tests/unit/agent-view-vm.test.mjs#L1321): `test("the default view is unchanged; cols raises the resolution on request", async () => {`
- [1334](../../tests/unit/agent-view-vm.test.mjs#L1334): `test("ss raises supersampling on the car render and visibly changes it", async () => {`
- [1343](../../tests/unit/agent-view-vm.test.mjs#L1343): `test("stays flagged approximate and does not become the default surface", async () => {`
- [1351](../../tests/unit/agent-view-vm.test.mjs#L1351): `test("dispatches each what to the matching raster, flagged approximate", async () => {`
- [1368](../../tests/unit/agent-view-vm.test.mjs#L1368): `test("an unknown what is a typed error with the valid set", async () => {`
- [1378](../../tests/unit/agent-view-vm.test.mjs#L1378): `test("records every semantic placement, dropping none", async () => {`
- [1390](../../tests/unit/agent-view-vm.test.mjs#L1390): `test("props are egocentric, sorted, and inside the radius", async () => {`
- [1407](../../tests/unit/agent-view-vm.test.mjs#L1407): `test("a bigger radius can only find more, never fewer", async () => {`
- [1416](../../tests/unit/agent-view-vm.test.mjs#L1416): `test("the kinds filter narrows results without changing lap totals", async () => {`
- [1428](../../tests/unit/agent-view-vm.test.mjs#L1428): `test("truncation is reported rather than hidden", async () => {`
- [1436](../../tests/unit/agent-view-vm.test.mjs#L1436): `test("a street circuit has buildings and no trees", async () => {`
- [1443](../../tests/unit/agent-view-vm.test.mjs#L1443): `test("floodlight masts come through with their fixture kind", async () => {`
- [1457](../../tests/unit/agent-view-vm.test.mjs#L1457): `test("the player car projects near the centre of frame", async () => {`
- [1469](../../tests/unit/agent-view-vm.test.mjs#L1469): `test("screenPct is null for anything not in frame", async () => {`
- [1479](../../tests/unit/agent-view-vm.test.mjs#L1479): `test("a corner behind the camera is kept, flagged, and bears past 90 deg", async () => {`
- [1490](../../tests/unit/agent-view-vm.test.mjs#L1490): `test("headless is flagged, because the frame is then stale", async () => {`
- [1502](../../tests/unit/agent-view-vm.test.mjs#L1502): `test("splits done into a reason", async () => {`
- [1510](../../tests/unit/agent-view-vm.test.mjs#L1510): `test("reports finished after the race ends", async () => {`

### 24. agentview-api-contract.test.mjs

Target: AgentView.create/beginEpisode; AgentRaster.create/frame/plan/carRender.

Fixture: Minimal lexical-global VM loaders plus M4; straight fake road, bank/elevation-translated camera VP matrices; synthetic wrapped/full-lap spans.

Assertions and limits: Public current methods/constants remain and removed aliases stay absent; internal three-raster handshake/no recoupling; translated road/camera projections and onboard eye exclusion; span lengths480/1200/4000 agree describe/circuit; exactly two source eye guards; episode delta chain invalidates and rollout metadata increments. Current-list guard permits extra methods (beginEpisode is exercised separately).

Case declaration entrypoints:

- [60](../../tests/unit/agentview-api-contract.test.mjs#L60): `test("car visibility and raster follow elevated and banked road surfaces", () => {`
- [97](../../tests/unit/agentview-api-contract.test.mjs#L97): `test("agentview-raster.js exposes create() and the three rasters", () => {`
- [113](../../tests/unit/agentview-api-contract.test.mjs#L113): `test("AgentView.create() still returns the whole documented surface", () => {`
- [149](../../tests/unit/agentview-api-contract.test.mjs#L149): `test("span lengthM: wrap, plain and full-lap spans match along()'s walk", () => {`
- [196](../../tests/unit/agentview-api-contract.test.mjs#L196): `test("the raster band reaches agentview through ctx, not a global grab", () => {`
- [207](../../tests/unit/agentview-api-contract.test.mjs#L207): `test("neither raster loop paints an object the camera is INSIDE", () => {`
- [230](../../tests/unit/agentview-api-contract.test.mjs#L230): `test("episode metadata makes prior-episode delta requests return full worlds", () => {`

### 25. ai-band.test.mjs

Target: AiBand factor/applyVmax/normalize; race-settings injected AI PACE.

Fixture: Pure VM module and literal pace/gap/time scenarios; source HTML and race-settings checks.

Assertions and limits: Known modes/default scripted; no scripted band; catchup bounded/proportional/saturated only behind human within half lap after launch; never slows leader; vmax pace ceiling; injected row absent static shell.

Case declaration entrypoints:

- [26](../../tests/unit/ai-band.test.mjs#L26): `test("normalize keeps known modes and defaults unknowns to scripted", () => {`
- [34](../../tests/unit/ai-band.test.mjs#L34): `test("scripted mode never bands even when the human is hundreds of metres ahead", () => {`
- [47](../../tests/unit/ai-band.test.mjs#L47): `test("catchup bands when the human is ahead inside half a lap", () => {`
- [62](../../tests/unit/ai-band.test.mjs#L62): `test("catchup stays quiet off the start line", () => {`
- [69](../../tests/unit/ai-band.test.mjs#L69): `test("catchup stays quiet once lapped", () => {`
- [76](../../tests/unit/ai-band.test.mjs#L76): `test("catchup never slows an AI ahead of the human (forward band is off)", () => {`
- [83](../../tests/unit/ai-band.test.mjs#L83): `test("catchup saturates at bandAuth past GAP_REF_M", () => {`
- [90](../../tests/unit/ai-band.test.mjs#L90): `test("applyVmax is a no-op at factor 0", () => {`
- [96](../../tests/unit/ai-band.test.mjs#L96): `test("applyVmax caps a banded easy car at BAND_CEIL", () => {`
- [103](../../tests/unit/ai-band.test.mjs#L103): `test("AI PACE row is injected — no static shell id in index.html", () => {`

### 26. ai-corridor.test.mjs

Target: AiCorridor.choose/candidate.

Fixture: M4+AiDrive+AiCorridor pure VM; scenario snapshot proves no car mutation; reusable output/left subrecord; seam and accelerated relative-motion traffic.

Assertions and limits: Inside/open lane choice, rear arrival and slower ahead close lane, narrow/both-blocked follow; acceleration bounded/NaN/deceleration; braking subject; corner-inside incentive/street exceptions; tick snapshots enforce order independence with live fallback; acceleration read reuse/refreshed decisions; far-field equivalence and indexed-walk source shape.

Case declaration entrypoints:

- [17](../../tests/unit/ai-corridor.test.mjs#L17): `test('open inside lane wins, but occupied inside selects outside', () => {`
- [22](../../tests/unit/ai-corridor.test.mjs#L22): `test('fast traffic arriving from behind blocks a lane before end-point overlap', () => {`
- [26](../../tests/unit/ai-corridor.test.mjs#L26): `test('both occupied sides or insufficient road width force following', () => {`
- [30](../../tests/unit/ai-corridor.test.mjs#L30): `test('lane reaching is checked across the lap seam and result storage is reusable', () => {`
- [38](../../tests/unit/ai-corridor.test.mjs#L38): `test('observed accelerating rival blocks a lane reached within the horizon', () => {`
- [45](../../tests/unit/ai-corridor.test.mjs#L45): `test('bounded acceleration ignores corrupt estimates and does not close distant lanes', () => {`
- [50](../../tests/unit/ai-corridor.test.mjs#L50): `test('accelerating approach is detected across the lap seam', () => {`
- [57](../../tests/unit/ai-corridor.test.mjs#L57): `test('our braking does not hide a steady rival closing from behind', () => {`
- [70](../../tests/unit/ai-corridor.test.mjs#L70): `test('a slower car ahead in the passing lane closes it; a far or quicker one does not', () => {`
- [79](../../tests/unit/ai-corridor.test.mjs#L79): `test('the inside of the next corner wins the pass side', () => {`
- [87](../../tests/unit/ai-corridor.test.mjs#L87): `test('on a street the look-ahead and the next-corner bonus are off', () => {`
- [97](../../tests/unit/ai-corridor.test.mjs#L97): `test('the passing side does not depend on cars[] order (snapshots, not live fields)', () => {`
- [118](../../tests/unit/ai-corridor.test.mjs#L118): `test('a car without snapshots falls back to its live fields', () => {`
- [125](../../tests/unit/ai-corridor.test.mjs#L125): `test('subject acceleration is reused within each lane, refreshed between decisions', () => {`
- [142](../../tests/unit/ai-corridor.test.mjs#L142): `test('a field of far rivals keeps the same side as a sparse field', () => {`
- [151](../../tests/unit/ai-corridor.test.mjs#L151): `test('corridor candidate walk is indexed (no for-of over cars)', () => {`

### 27. ai-drive.test.mjs

Target: AiDrive decision helpers; game updateCar; Collide.scanOtAhead; RaceControl.holdCap.

Fixture: Pure M4/AiDrive VM and seeded pseudo-random equivalence trials; hand-built traits/traffic; production lateral block extracted into Function with counted grip dependencies; real collision VM buckets; source contracts for pooled bags/pace/laps.

Assertions and limits: Full declaration index below covers traits/pools/indexed look, brake reference/corner/pace/FF closed loop, following/tow/boost/active-aero, aggression/optimism/house/seat/orders, launch/phase/mistake/tyre behavior, queue/pass/defend/reach/human-yield/rescue, snapshots/trail yield, collision symmetry; random equivalence pins exact answers and anti-vacuity counts; holdCap rank fast path/fallback. Source-shape and reference-math checks coexist with selected dynamic controller execution; not all helpers prove integration.

Case declaration entrypoints:

- [31](../../tests/unit/ai-drive.test.mjs#L31): `test("traits defaults match the mid-grid fallback", () => {`
- [39](../../tests/unit/ai-drive.test.mjs#L39): `test("traits writes a reused scratch (read before the next call)", () => {`
- [48](../../tests/unit/ai-drive.test.mjs#L48): `test("look sample pool reuses rows across beginLook", () => {`
- [66](../../tests/unit/ai-drive.test.mjs#L66): `test("indexed look windows preserve every brake decision and repeated-addition distance", () => {`
- [88](../../tests/unit/ai-drive.test.mjs#L88): `test("brakeTarget: a cached bank grip and the distance-term skip change no result (PERF-HUNT-4 B-F4)", () => {`
- [118](../../tests/unit/ai-drive.test.mjs#L118): `test("awareness shortens the stuck dig-out threshold", () => {`
- [123](../../tests/unit/ai-drive.test.mjs#L123): `test("the follow gap is a time headway: s0 + v·T, awareness widens T", () => {`
- [146](../../tests/unit/ai-drive.test.mjs#L146): `test("aware drivers yield more on contact", () => {`
- [153](../../tests/unit/ai-drive.test.mjs#L153): `test("experience smooths steer and softens panic unstuck", () => {`
- [160](../../tests/unit/ai-drive.test.mjs#L160): `test("OT fire rate rises with craft and a clean window", () => {`
- [179](../../tests/unit/ai-drive.test.mjs#L179): `test("otShouldFire respects the roll and dt (deterministic)", () => {`
- [192](../../tests/unit/ai-drive.test.mjs#L192): `test("wantBoost catches and defends; banks when aware and rich-not-needed", () => {`
- [220](../../tests/unit/ai-drive.test.mjs#L220): `test("wantBoost and the attack late-brake read the same at every PACE (closing rates ride vTop)", () => {`
- [248](../../tests/unit/ai-drive.test.mjs#L248): `test("brakeDecision: no pedal under the envelope, the planner's 0.85 budget on it, full pedal far over it", () => {`
- [269](../../tests/unit/ai-drive.test.mjs#L269): `test("brakeDecision's P trim compares the overspeed on the standard (pace) scale", () => {`
- [284](../../tests/unit/ai-drive.test.mjs#L284): `test("closed loop: braking into one corner arrives within 1 m/s of the planned corner speed", () => {`
- [305](../../tests/unit/ai-drive.test.mjs#L305): `test("craft late-brake raises the limit when attacking with room", () => {`
- [318](../../tests/unit/ai-drive.test.mjs#L318): `test("aggression closes the follow gap and yields less on contact (spacing half)", () => {`
- [338](../../tests/unit/ai-drive.test.mjs#L338): `test("aggression raises otFireRate and shortens queue patience (fire half)", () => {`
- [351](../../tests/unit/ai-drive.test.mjs#L351): `test("optimism raises brakeTarget entry speed (late markers)", () => {`
- [360](../../tests/unit/ai-drive.test.mjs#L360): `test("traits defaults style axes to neutral", () => {`
- [366](../../tests/unit/ai-drive.test.mjs#L366): `test("compound-corner brake limits exactly match the tightest individual sample", () => {`
- [385](../../tests/unit/ai-drive.test.mjs#L385): `test("brake planner carries the public corner envelope across consecutive pace settings", () => {`
- [396](../../tests/unit/ai-drive.test.mjs#L396): `test("adaptLane nudges toward the freer side under density", () => {`
- [426](../../tests/unit/ai-drive.test.mjs#L426): `test("isBoxed: a street follow-train is not a wedge", () => {`
- [443](../../tests/unit/ai-drive.test.mjs#L443): `test("isBoxed: contact needs the room to be gone too", () => {`
- [458](../../tests/unit/ai-drive.test.mjs#L458): `test("aiRescueDelay: contact is patience, never a veto", () => {`
- [468](../../tests/unit/ai-drive.test.mjs#L468): `test("dig-out has a budget — past it, rescue must be allowed to arm", () => {`
- [486](../../tests/unit/ai-drive.test.mjs#L486): `test("dig-out escalation holds until dig-out ends — a partial yank cannot re-veto rescue", () => {`
- [498](../../tests/unit/ai-drive.test.mjs#L498): `test("otSide: a tie does not send the whole queue one way", () => {`
- [513](../../tests/unit/ai-drive.test.mjs#L513): `test("otPull: a queue-limited car pulls out even though it is slower", () => {`
- [532](../../tests/unit/ai-drive.test.mjs#L532): `test("letPass: awareness commits earlier, yield fits a permanent lane", () => {`
- [549](../../tests/unit/ai-drive.test.mjs#L549): `test("minLatGap and lineFollow keep street home seats", () => {`
- [558](../../tests/unit/ai-drive.test.mjs#L558): `test("street OT scale still uses a clean gap after the seating fix", () => {`
- [563](../../tests/unit/ai-drive.test.mjs#L563): `test("street tow is half-size and queue brake eases in", () => {`
- [584](../../tests/unit/ai-drive.test.mjs#L584): `test("otWant compares PACE with pace, scaled to the top speed", () => {`
- [597](../../tests/unit/ai-drive.test.mjs#L597): `test("otWant treats a crawling car as an obstacle whatever its pace", () => {`
- [610](../../tests/unit/ai-drive.test.mjs#L610): `test("passTarget is a position beside the passed car, inside the road", () => {`
- [629](../../tests/unit/ai-drive.test.mjs#L629): `test("pass patience and cooldown are per-car and bounded", () => {`
- [637](../../tests/unit/ai-drive.test.mjs#L637): `test("sideYieldsA: the car less than half alongside yields; level, the outer car does", () => {`
- [655](../../tests/unit/ai-drive.test.mjs#L655): `test("street sep/mass/wall keep the player from bouncing into Armco", () => {`
- [665](../../tests/unit/ai-drive.test.mjs#L665): `test("otPull and defendPull: streets use an open gap, not an Armco dive", () => {`
- [686](../../tests/unit/ai-drive.test.mjs#L686): `test("houseStyle: Mercedes attacks more than Cadillac; missing stats are neutral", () => {`
- [714](../../tests/unit/ai-drive.test.mjs#L714): `test("seat 0 attacks more than seat 1; omitted seat stays the factory card", () => {`
- [725](../../tests/unit/ai-drive.test.mjs#L725): `test("career tdev stats shift houseStyle without a new team card", () => {`
- [734](../../tests/unit/ai-drive.test.mjs#L734): `test("team orders: #2 holds vs #1; #1 may pass #2", () => {`
- [763](../../tests/unit/ai-drive.test.mjs#L763): `test("consistency widens the brake band without moving the mid default", () => {`
- [784](../../tests/unit/ai-drive.test.mjs#L784): `test("factory wing and hold change the AI corner limit; midpoint stays put", () => {`
- [795](../../tests/unit/ai-drive.test.mjs#L795): `test("ERS map and wantX: harvest banks, attack opens X", () => {`
- [812](../../tests/unit/ai-drive.test.mjs#L812): `test("hold cars follow less racing line; omitted hold keeps the street/permanent defaults", () => {`
- [819](../../tests/unit/ai-drive.test.mjs#L819): `test("adaptLane on streets will not crawl toward a tight wall", () => {`
- [830](../../tests/unit/ai-drive.test.mjs#L830): `test("updateCar does not allocate AiDrive ctx literals", () => {`
- [855](../../tests/unit/ai-drive.test.mjs#L855): `test("launchPlan: awareness reads the lights, hands manage the getaway, the roll is the day", () => {`
- [877](../../tests/unit/ai-drive.test.mjs#L877): `test("launchMul: nothing before the reaction, the getaway at it, ordinary after three seconds", () => {`
- [892](../../tests/unit/ai-drive.test.mjs#L892): `test("pacePhase is a zero-mean drift whose amplitude falls with consistency", () => {`
- [909](../../tests/unit/ai-drive.test.mjs#L909): `test("trailPush: a quicker car held behind the same slower car pushes past the pace phase (#2356)", () => {`
- [931](../../tests/unit/ai-drive.test.mjs#L931): `test("trailYield: past its patience the slower car lifts and lets the trailing car by (#2356)", () => {`
- [950](../../tests/unit/ai-drive.test.mjs#L950): `test("trailYieldStep: the yield scales with how close the trailer is, and is gone past 1.2 s (#2356)", () => {`
- [969](../../tests/unit/ai-drive.test.mjs#L969): `test("trailStep: a closed gate or a pitting car ahead ends the trail at once, no bleed (#2356)", () => {`
- [985](../../tests/unit/ai-drive.test.mjs#L985): `test("trail steps read the tick-start snapshot, not a neighbour already moved this tick (audit4 F3)", () => {`
- [999](../../tests/unit/ai-drive.test.mjs#L999): `test("pooled hunger / side-by-side bags give the literal-ctx answers and allocate nothing per call (audit4 F2)", () => {`
- [1015](../../tests/unit/ai-drive.test.mjs#L1015): `test("otWant: a blocker that is slow but PULLING AWAY is a launching car, not an obstacle", () => {`
- [1027](../../tests/unit/ai-drive.test.mjs#L1027): `test("rubDecel is a small absolute deceleration, a touch firmer on streets", () => {`
- [1035](../../tests/unit/ai-drive.test.mjs#L1035): `test("bumpRestitution: resting below 1 m/s, a tenth from 3 m/s, a ramp between", () => {`
- [1045](../../tests/unit/ai-drive.test.mjs#L1045): `test("squeezeEase drops a pinned yielder under the other car's speed, more so on a street", () => {`
- [1053](../../tests/unit/ai-drive.test.mjs#L1053): `test("queueBrake: the time-to-collision gate catches a slow creep the closing-rate gate misses", () => {`
- [1070](../../tests/unit/ai-drive.test.mjs#L1070): `test("holdLineGap is a second behind, floored at eight metres", () => {`
- [1076](../../tests/unit/ai-drive.test.mjs#L1076): `test("defendOnce: the first pull fixes the side, the other way is refused, no pull keeps the side", () => {`
- [1090](../../tests/unit/ai-drive.test.mjs#L1090): `test("attackOK: a straight is always a place to pass; a corner entry only at its zone's quality", () => {`
- [1111](../../tests/unit/ai-drive.test.mjs#L1111): `test("startCalm: full while launching, fades out by calmUntil, never for a car that did not launch", () => {`
- [1130](../../tests/unit/ai-drive.test.mjs#L1130): `test("mistakeChance: rarer with consistency, commoner under pressure, in the F1-not-F1-22 band", () => {`
- [1146](../../tests/unit/ai-drive.test.mjs#L1146): `test("mistakeChance: errMul is the difficulty-ladder rate scale, default 1", () => {`
- [1158](../../tests/unit/ai-drive.test.mjs#L1158): `test("mistakeChance: optimism raises rate under pressure only (Slice 4)", () => {`
- [1167](../../tests/unit/ai-drive.test.mjs#L1167): `test("PhysicsConsts.DIFF.err is a monotonic ladder: easy >= normal >= hard = 1", () => {`
- [1177](../../tests/unit/ai-drive.test.mjs#L1177): `test("tyres: sprints start on softs, long races mix; a soft is up and fades, a hard is down and lasts", () => {`
- [1192](../../tests/unit/ai-drive.test.mjs#L1192): `test("game.js feeds tyrePace laps done (c.lap - 1), not the crossing count", () => {`
- [1217](../../tests/unit/ai-drive.test.mjs#L1217): `test("on a straight the AI covers the side the attacker is lining up on", () => {`
- [1228](../../tests/unit/ai-drive.test.mjs#L1228): `test("defendPull reads the chaser's tick snapshot, not its live x", () => {`
- [1234](../../tests/unit/ai-drive.test.mjs#L1234): `test("dead behind is not a move to cover — hold the line", () => {`
- [1242](../../tests/unit/ai-drive.test.mjs#L1242): `test("a straight cover is a lane move, not a corner chop", () => {`
- [1252](../../tests/unit/ai-drive.test.mjs#L1252): `test("the straight branch respects the gates the corner branch already had", () => {`
- [1264](../../tests/unit/ai-drive.test.mjs#L1264): `test("mid-train: a car defends when the attack behind is nearer than the car ahead", () => {`
- [1270](../../tests/unit/ai-drive.test.mjs#L1270): `test("dead behind, the cover goes to the inside of the next corner it will attack into", () => {`
- [1277](../../tests/unit/ai-drive.test.mjs#L1277): `test("the cover leaves a car's width at the road edge", () => {`
- [1302](../../tests/unit/ai-drive.test.mjs#L1302): `test("the human-yield grace is a real reaction window, not zero and not a lap", () => {`
- [1313](../../tests/unit/ai-drive.test.mjs#L1313): `test("the grace does not disturb who the rule elects between two AI cars", () => {`
- [1324](../../tests/unit/ai-drive.test.mjs#L1324): `test("the grace arms only when it is OUR aim intruding, and only inside the band", () => {`
- [1349](../../tests/unit/ai-drive.test.mjs#L1349): `test("the intrusion band leaves a settled pair settled", () => {`
- [1364](../../tests/unit/ai-drive.test.mjs#L1364): `test("a held line inside the band arms the human-yield timer at a quarter rate", () => {`
- [1381](../../tests/unit/ai-drive.test.mjs#L1381): `test("paceSample: the field teaches the profile, a human is judged against it", () => {`
- [1401](../../tests/unit/ai-drive.test.mjs#L1401): `test("repassLock: twice the cooldown for an equal car, shorter with a pace edge, never under 30 %", () => {`
- [1409](../../tests/unit/ai-drive.test.mjs#L1409): `test("attemptRoll: deterministic, uniform-ish, and a fresh roll per zone and lap", () => {`
- [1422](../../tests/unit/ai-drive.test.mjs#L1422): `test("get a run: hang back through the corner onto a passing straight, pull out late", () => {`
- [1441](../../tests/unit/ai-drive.test.mjs#L1441): `test("sideYieldsA: level, the car on the OUTSIDE of the next corner concedes (kTurn)", () => {`
- [1453](../../tests/unit/ai-drive.test.mjs#L1453): `test("commit or yield is a couple of seconds and a small lift", () => {`
- [1458](../../tests/unit/ai-drive.test.mjs#L1458): `test("otSide breaks a tie toward the inside of the corner the pass is for", () => {`
- [1470](../../tests/unit/ai-drive.test.mjs#L1470): `test("a lower difficulty corner factor lowers the brake target, and 1 is the default", () => {`
- [1483](../../tests/unit/ai-drive.test.mjs#L1483): `test("queueBrake: a small closing rate INSIDE the follow distance gets a light brake", () => {`
- [1501](../../tests/unit/ai-drive.test.mjs#L1501): `test("aimIntrudes: an aim into the other car's gap, on their side of us, intrudes", () => {`
- [1517](../../tests/unit/ai-drive.test.mjs#L1517): `test("queue pressure: time held behind one car lowers the pass bar, craft spends patience faster", () => {`
- [1545](../../tests/unit/ai-drive.test.mjs#L1545): `test("the AI's lateral envelope carries the car's downforce, and the yaw budget does not", () => {`
- [1559](../../tests/unit/ai-drive.test.mjs#L1559): `test("passSideClosed: the lane closes only when the car can no longer REACH it", () => {`
- [1571](../../tests/unit/ai-drive.test.mjs#L1571): `test("passReach: no move that cannot be half alongside by the turn-in", () => {`
- [1592](../../tests/unit/ai-drive.test.mjs#L1592): `test("the overtake car-ahead pre-reject is result-identical to the full wrap scan", () => {`
- [1653](../../tests/unit/ai-drive.test.mjs#L1653): `test("mirrorReach is a time behind scaled by awareness, floored at the old 13 m and capped", () => {`
- [1663](../../tests/unit/ai-drive.test.mjs#L1663): `test("the cover starts a time behind, grows as the attacker closes, and awareness widens it", () => {`
- [1677](../../tests/unit/ai-drive.test.mjs#L1677): `test("letPassCase: a lapping car closing on the gearbox is waved through; a same-lap rival never is", () => {`
- [1697](../../tests/unit/ai-drive.test.mjs#L1697): `test("AI heading reuses current grip without changing normal or recovery steering", () => {`
- [1785](../../tests/unit/ai-drive.test.mjs#L1785): `test(ˋwantBoost: catching/defending tolerances ride the pace scale (pace ${p})ˋ, () => {`
- [1798](../../tests/unit/ai-drive.test.mjs#L1798): `test(ˋdefendPull: the not-closing gate rides the pace scale (pace ${p})ˋ, () => {`
- [1803](../../tests/unit/ai-drive.test.mjs#L1803): `test(ˋbrakeTarget: the attacking late-brake gate rides the pace scale (pace ${p})ˋ, () => {`
- [1812](../../tests/unit/ai-drive.test.mjs#L1812): `test("game.js hands wantBoost and defendPull the pace envelope (vTop)", () => {`
- [1821](../../tests/unit/ai-drive.test.mjs#L1821): `test("RaceControl.holdCap finds the car by its rank slot, with a scan fallback (audit4 P6)", () => {`
- [1841](../../tests/unit/ai-drive.test.mjs#L1841): `test("a level AI-AI side rub takes ONE k for the pair, so bucket order cannot pick the yielder (audit4 F10)", () => {`

### 28. ai-pack-stuck-vm.test.mjs

Target: game AI dig-out/escalated rescue/pack progression.

Fixture: Fresh Monaco createGame for each case; fixed60Hz; stalled human pole stress sampled10Hz; independent AI-only standing-start sample.

Assertions and limits: Worst consecutive low-speed stuck crawl≤5s with stress witnessed; every running car advances>80m in30s and ≥3-car crawl pack <25% samples. Stress disjunction permits either stuck time or rescue witness; it does not independently demand rescue when all dig-outs clear.

Case declaration entrypoints:

- [33](../../tests/unit/ai-pack-stuck-vm.test.mjs#L33): `test("dig-out that fails escalates to rescue — no forever-crawl on monaco", async () => {`
- [103](../../tests/unit/ai-pack-stuck-vm.test.mjs#L103): `test("the monaco field keeps progressing — no multi-car pack freeze", async () => {`

### 29. ai-pass-complete.test.mjs

Target: AiDrive passHunger/coverConcede/otWant/otPull/attackOK/passReach/tow/boost/SBS.

Fixture: Pure M4/AiDrive VM; mid/ace/dull traits; explicit1.2% and0.5% pace edges, unitless scripted pace and PACE-scaled reach.

Assertions and limits: Real edge+queue hunger bounded; noise/equal/street unaffected; faster AI attacker concede but human preserves contest; fire rate unchanged; soft attack-zone pull only within reach/runway; hunger stretches run/tow but not latch; SBS concede; catch-edge ERS. One test name calls hunger “fire hunger” despite explicit fire-rate no-op elsewhere, a terminology issue.

Case declaration entrypoints:

- [41](../../tests/unit/ai-pass-complete.test.mjs#L41): `test("passHunger: streets always 1; equal pace always 1", () => {`
- [57](../../tests/unit/ai-pass-complete.test.mjs#L57): `test("passHunger: sub-0.7 % edge stays 1; soft edge does not tow", () => {`
- [74](../../tests/unit/ai-pass-complete.test.mjs#L74): `test("passHunger: ≥0.7 % edge + queue time raises fire hunger (bounded)", () => {`
- [84](../../tests/unit/ai-pass-complete.test.mjs#L84): `test("coverConcede: streets 0; faster chaser concedes; awareness/experience raise it", () => {`
- [104](../../tests/unit/ai-pass-complete.test.mjs#L104): `test("defendPull: cover concede zeros the pull against a clearly faster attacker", () => {`
- [124](../../tests/unit/ai-pass-complete.test.mjs#L124): `test("otFireRate: hunger does NOT raise λ (tactics.md); streets unchanged too", () => {`
- [141](../../tests/unit/ai-pass-complete.test.mjs#L141): `test("otWant: permanent pace edge lowers the margin so a ~1 % car wants the move", () => {`
- [152](../../tests/unit/ai-pass-complete.test.mjs#L152): `test("attack-zone pull (#2356): soft edge wants and pulls from the dirty-air band", () => {`
- [192](../../tests/unit/ai-pass-complete.test.mjs#L192): `test("latchLate + runExtra: hunger does not latch but stretches the run; streets untouched", () => {`
- [209](../../tests/unit/ai-pass-complete.test.mjs#L209): `test("towGain: hunger lifts permanent tow; street and no-arg stay base", () => {`
- [217](../../tests/unit/ai-pass-complete.test.mjs#L217): `test("sbsCommitT / sbsEase: conceding defender tucks sooner; streets and no-arg stay", () => {`
- [228](../../tests/unit/ai-pass-complete.test.mjs#L228): `test("wantBoost: pace edge on the tow car arms catch when live speeds are level", () => {`

### 30. ai-pass-defend-vm.test.mjs

Target: game pass latch vs defendPull.

Fixture: Shared Monza VM; three fixed rivals, forced repeated pass latch, reset sticky defendSide each tick; matched no-latch control.

Assertions and limits: Latched samples exist and zero latched-cover overlaps; same chaser without latch produces cover. Mechanism-focused direct-state stress does not prove naturally acquired latch rate.

Case declaration entrypoints:

- [48](../../tests/unit/ai-pass-defend-vm.test.mjs#L48): `test("a latched pass is not covered against", async () => {`
- [54](../../tests/unit/ai-pass-defend-vm.test.mjs#L54): `test("control: with no latch the same chaser IS covered against (the probe can see a cover)", async () => {`

### 31. ai-queue-reach-vm.test.mjs

Target: AiDrive.queueReach and game queue/brake block.

Fixture: Pure helper plus shared Monza VM; parked player, rival300m behind;14s fixed act loop; onset/top speed/first-touch capture.

Assertions and limits: Base unchanged when no catch/no brake; reach grows from stopping distance and pace floor; live AI reaches>30m/s, brakes by full-brake stopping distance, any touch<5m/s. Test title says “no contact” but assertion explicitly permits soft contact.

Case declaration entrypoints:

- [23](../../tests/unit/ai-queue-reach-vm.test.mjs#L23): `test("queueReach equals the base window when nothing is being caught (traffic unchanged)", () => {`
- [33](../../tests/unit/ai-queue-reach-vm.test.mjs#L33): `test("queueReach grows with closing speed and never drops below the base", () => {`
- [40](../../tests/unit/ai-queue-reach-vm.test.mjs#L40): `test("the closing-rate floor rides the pace scale", () => {`
- [50](../../tests/unit/ai-queue-reach-vm.test.mjs#L50): `test("an AI closing on a parked player brakes from its stopping distance, with no contact", async () => {`

### 32. ai-racecraft-vm.test.mjs

Target: game racecraft → AiDrive/AiBand/RaceControl and Collide.

Fixture: Shared Monza VM, pristine tier/skill restoration, slow AI player; deterministic rivals; lap traces/jitter analysis; owned independent boots for pass-lock and unstamped net-like human.

Assertions and limits: Faster AI passes moving slower blocker≤20s and stays ahead; alongside pair clears≤10s without stall/recontact; launch spread/order changes; full-lap outside approach/apex/jitter; scripted/catchup guards; VSC/SC no latch/cover/queue/order gain with green witnesses; human-yield grace gap; pass no15s swapback; unstamped human still positive pace. Shared RNG can couple tests, explicitly isolated for one chaotic pass case.

Case declaration entrypoints:

- [90](../../tests/unit/ai-racecraft-vm.test.mjs#L90): `test("an AI with more pace gets past a slower moving car instead of following it", async () => {`
- [122](../../tests/unit/ai-racecraft-vm.test.mjs#L122): `test("two AI cars dropped side by side sort themselves out — one yields, neither stalls", async () => {`
- [165](../../tests/unit/ai-racecraft-vm.test.mjs#L165): `test("a standing start is a launch, not a procession — the grid pitch breaks in the first seconds", async () => {`
- [194](../../tests/unit/ai-racecraft-vm.test.mjs#L194): `test("the AI drives a racing line: outside on the approach, inside at the apex, on monza's big corners", async () => {`
- [261](../../tests/unit/ai-racecraft-vm.test.mjs#L261): `test("scripted AI pace never rubber-bands; catch-up keeps start and lapping guards", async () => {`
- [313](../../tests/unit/ai-racecraft-vm.test.mjs#L313): `test("under VSC and safety car no pass latch engages, no queue pressure builds and nobody covers (#2175)", async () => {`
- [374](../../tests/unit/ai-racecraft-vm.test.mjs#L374): `test("an AI alongside a player who will not yield opens the gap itself", async () => {`
- [415](../../tests/unit/ai-racecraft-vm.test.mjs#L415): `test("a faster AI completes a pass and the pair does not swap back", async () => {`
- [448](../../tests/unit/ai-racecraft-vm.test.mjs#L448): `test("a human whose pace is never stamped (a net-owned rival) still has a pace: paceVmax > 0", async () => {`

### 33. ai-ratings-math.test.mjs

Target: tools/lib/ai-ratings-math.mjs; tools/check/ai-ratings/ai-race/ai-band/defend-duel.

Fixture: Pure numeric tables plus subprocess JSON/help;22-driver shipped census.

Assertions and limits: Pearson ±1/null and near correlation, matrix/cluster max, zero-mean styles and column means; actual drivers craft cluster|r|<0.5, style sum0, means within1.5 and recognizable ranking; dispatcher JSON/help; help must avoid VM duel. Header “currently >>0.5 on BASE” is historical failing-first text, not current verdict.

Case declaration entrypoints:

- [23](../../tests/unit/ai-ratings-math.test.mjs#L23): `test("pearson: perfect, anti, and independent", () => {`
- [31](../../tests/unit/ai-ratings-math.test.mjs#L31): `test("correlationMatrix + maxCraftClusterR on a one-dial table", () => {`
- [43](../../tests/unit/ai-ratings-math.test.mjs#L43): `test("styleZeroMean: absent vs present", () => {`
- [51](../../tests/unit/ai-ratings-math.test.mjs#L51): `test("columnStats mean matches mean()", () => {`
- [60](../../tests/unit/ai-ratings-math.test.mjs#L60): `test("ai-ratings.mjs --json: craft/awareness/consistency are decorrelated", () => {`
- [83](../../tests/unit/ai-ratings-math.test.mjs#L83): `test("ai-race.mjs ratings dispatches (help and json)", () => {`
- [96](../../tests/unit/ai-ratings-math.test.mjs#L96): `test("ai-band.mjs --help exits 0 and names the Melder checklist", () => {`
- [105](../../tests/unit/ai-ratings-math.test.mjs#L105): `test("defend-duel.mjs --help exits 0 before the VM boot and names the real path", () => {`

### 34. ai-strategy.test.mjs

Target: AiDrive stintPlan/pitNow/splitStints/degCost/compoundFor; TyreModel.

Fixture: Real teams/parts/consts/tyre/AI VM;20/21 evenly spread rolls, distance ladder and real scaled life functions, explicit pit-loss fraction.

Assertions and limits: Distance stop monotonicity/coverage/stops bounds/diversity/purity/mixed compounds; fuel/cliff cost parity and rounding/minimums/stagger; scripted plan exception ordering, worn-payback and weather priorities, caution/rival undercut/cover/temper, wet tread classes/unplanned tyre fit; player pins count/start/firstLife, lane spacing; fuel-aware split/two dry compounds and used-compound recut. Comment “three laps left” accompanies compoundFor(1): stale example only.

Case declaration entrypoints:

- [58](../../tests/unit/ai-strategy.test.mjs#L58): `test("a short race takes no stop and a long one does", () => {`
- [70](../../tests/unit/ai-strategy.test.mjs#L70): `test("stop count is monotone in distance across the lap ladder", () => {`
- [81](../../tests/unit/ai-strategy.test.mjs#L81): `test("the plan's stint lengths cover the distance exactly", () => {`
- [93](../../tests/unit/ai-strategy.test.mjs#L93): `test("stop laps are strictly increasing and inside the race", () => {`
- [106](../../tests/unit/ai-strategy.test.mjs#L106): `test("a 20-car field does not converge on one plan", () => {`
- [116](../../tests/unit/ai-strategy.test.mjs#L116): `test("the taste runs the right way: a low roll shops harder, a high roll softer", () => {`
- [124](../../tests/unit/ai-strategy.test.mjs#L124): `test("the plan is a pure function of its inputs", () => {`
- [135](../../tests/unit/ai-strategy.test.mjs#L135): `test("a full tank costs tyre life, so the field does not run one compound all race", () => {`
- [143](../../tests/unit/ai-strategy.test.mjs#L143): `test("degCost rises across a stint, and a lap past life costs more than one before it", () => {`
- [159](../../tests/unit/ai-strategy.test.mjs#L159): `test("degCost charges every lap past life the baseline drop as well as the cliff", () => {`
- [169](../../tests/unit/ai-strategy.test.mjs#L169): `test("the field's plans spread: several strategies at 25 laps, two-stops at a full distance", () => {`
- [195](../../tests/unit/ai-strategy.test.mjs#L195): `test("splitStints shares the distance in proportion to life", () => {`
- [203](../../tests/unit/ai-strategy.test.mjs#L203): `test("splitStints covers the distance when rounding under-allocates and the last stints are 1 lap", () => {`
- [216](../../tests/unit/ai-strategy.test.mjs#L216): `test("a SCRIPTED plan (a real race replayed) stops on its real laps and nowhere else", () => {`
- [228](../../tests/unit/ai-strategy.test.mjs#L228): `test("a car with no stops left still ignores the plan for a tyre that cannot do its job", () => {`
- [239](../../tests/unit/ai-strategy.test.mjs#L239): `test("the stop stagger never shifts a stop LATER past the set's life", () => {`
- [272](../../tests/unit/ai-strategy.test.mjs#L272): `test("no stint is shorter than MIN_STINT, and a 5-lap race is run on one set", () => {`
- [287](../../tests/unit/ai-strategy.test.mjs#L287): `test("the planner's cliff IS the sim's cliff", () => {`
- [294](../../tests/unit/ai-strategy.test.mjs#L294): `test("a worn stop needs laps left to pay for itself", () => {`
- [318](../../tests/unit/ai-strategy.test.mjs#L318): `test("the rival rules: an alert wall covers the undercut, an aggressive one makes it", () => {`
- [340](../../tests/unit/ai-strategy.test.mjs#L340): `test("strategic temper comes from the ratings: veterans react, rookies gamble", () => {`
- [353](../../tests/unit/ai-strategy.test.mjs#L353): `test("the free stop under a caution pulls a planned stop forward", () => {`
- [371](../../tests/unit/ai-strategy.test.mjs#L371): `test("the wrong tyre for the weather outranks everything", () => {`
- [378](../../tests/unit/ai-strategy.test.mjs#L378): `test("the weather call knows which tyre the conditions want, in BOTH directions", () => {`
- [395](../../tests/unit/ai-strategy.test.mjs#L395): `test("an unplanned stop fits rubber that can finish the race", () => {`
- [410](../../tests/unit/ai-strategy.test.mjs#L410): `test("the planner never picks a wet compound for a dry race", () => {`
- [419](../../tests/unit/ai-strategy.test.mjs#L419): `test("a spent set boxes even when the plan says stay out", () => {`
- [424](../../tests/unit/ai-strategy.test.mjs#L424): `test("the plan alone fires when its lap arrives, and not before", () => {`
- [432](../../tests/unit/ai-strategy.test.mjs#L432): `test("a pinned stop count returns that many stops, with the stop laps inside the race", () => {`
- [445](../../tests/unit/ai-strategy.test.mjs#L445): `test("a pin the race is too short to hold is capped: no zero-length stint, no stop on lap 0", () => {`
- [456](../../tests/unit/ai-strategy.test.mjs#L456): `test("a pinned start is the first compound, and a compound the planner does not enumerate falls back to the classes", () => {`
- [465](../../tests/unit/ai-strategy.test.mjs#L465): `test("firstLife shortens the FIRST stint only: a re-plan runs the set that is on the car, not a fresh one", () => {`
- [479](../../tests/unit/ai-strategy.test.mjs#L479): `test("the lane's follow distance is a car length plus air, and wider than the racing one", () => {`
- [502](../../tests/unit/ai-strategy.test.mjs#L502): `test("a fuel-aware split gives the early stints less of the race", () => {`
- [518](../../tests/unit/ai-strategy.test.mjs#L518): `test("twoCompound: every plan runs at least two different dry compounds", () => {`
- [529](../../tests/unit/ai-strategy.test.mjs#L529): `test("twoCompound: a re-cut counts the compounds already run, and a pinned NO STOP rises to the one stop the rule needs", () => {`

### 35. ai-stuck-vm.test.mjs

Target: game stopped-player queue/lateral recovery and Collide contact flags.

Fixture: Shared Monza VM; parked braked player and AI3m behind,15s fixed act with0.5s trace; source slice _colResolvePair.

Assertions and limits: AI>20m ahead and>15m/s by end; moving and lateral escape>1m by5s; actual contact witnessed then both flags0; correction epsilon real<1cm, ownership gates and exactly selected yielder scrub/flag source contracts. Numerical-dust behavior itself is structural, not dynamically driven by stalemate scenario.

Case declaration entrypoints:

- [64](../../tests/unit/ai-stuck-vm.test.mjs#L64): `test("an AI that catches a stopped player gets past it", async () => {`
- [74](../../tests/unit/ai-stuck-vm.test.mjs#L74): `test("the AI is moving, and moving sideways, well before it is clear", async () => {`
- [91](../../tests/unit/ai-stuck-vm.test.mjs#L91): `test("contactT is armed while welded and clears once the cars are apart", async () => {`
- [100](../../tests/unit/ai-stuck-vm.test.mjs#L100): `test("a correction of numerical dust does not count as contact", async () => {`

## LSP/source navigation evidence

Queries ran with `bash tools/mcp/lsp-mcp.sh def <symbol> --max-lines=3` (read-only). Definitions below are the returned declarations; aliases/exports are called out rather than mistaken for implementation bodies. Links are relative to this map. No LSP lookup returned a runtime verification verdict.

| Target | Production definition / source | Integration reference returned by LSP |
|---|---|---|
| A11yOpts | [a11y-opts.js:17](../../js/ui/a11y-opts.js#L17) | mountPanel definition112 found via module-file fallback; direct export/caller coverage unverified by LSP |
| Input.pickPad | [input.js:1476](../../js/input/input.js#L1476) | key-binds.js:425; export input.js:2605 |
| CamModes | [mode-switch.js:7](../../js/camera/mode-switch.js#L7) | window assignment tagged use |
| UpdateCheck | [update-check.js:2](../../js/ui/update-check.js#L2) | Custom clock/MessageChannel fixture in a11y-pwa-pass |
| Car3D.aeroStyleOf | [car3d.js:210](../../js/car/car3d.js#L210) | Alias at210, export2898; car-draw.js:845; implementation not claimed from alias |
| Car3D.aeroFlaps | [car-body-geom.js:666](../../js/car/car-body-geom.js#L666) | aeroFlapsGeom alias in car3d.js:2894; car-draw.js:978 |
| Car3D.appearanceParts | [car3d.js:223](../../js/car/car3d.js#L223) | car-draw.js:101 |
| CarMesh.getAeroFlap | [car-mesh.js:751](../../js/car/car-mesh.js#L751) | car-draw.js:990 |
| CarMesh.getAeroFlapSet | [car-mesh.js:772](../../js/car/car-mesh.js#L772) | car-draw.js:979 |
| CarDraw | [car-draw.js:14](../../js/car/car-draw.js#L14) | teamDecalState/wheel wiring exercised via carDrawVm |
| AeroZones.zonesFor | [aero-zones.js:161](../../js/physics/aero-zones.js#L161) | track-maps.js:378; export255 |
| AgentView.create | [agentview.js:104](../../js/agent/agentview.js#L104) | apex.js:126 |
| AgentView.slipBudget | [agentview.js:89](../../js/agent/agentview.js#L89) | apex.js:588 |
| AgentRaster.create | [agentview-raster.js:5](../../js/agent/agentview-raster.js#L5) | agentview.js:745 |
| AiBand | [ai-band.js:19](../../js/physics/ai-band.js#L19) | Literal pure-helper cases and integrated racecraft VM |
| AiCorridor.choose | [ai-corridor.js:86](../../js/physics/ai-corridor.js#L86) | game.js:5843 |
| AiDrive | [ai-drive.js:2](../../js/physics/ai-drive.js#L2) | Main pure helper suite, integration via game VM |
| AiDrive.brakeDecision | [ai-drive.js:625](../../js/physics/ai-drive.js#L625) | game.js:5409 |
| AiDrive.followGap | [ai-drive.js:140](../../js/physics/ai-drive.js#L140) | game.js:5445 |
| AiDrive.otWant | [ai-drive.js:732](../../js/physics/ai-drive.js#L732) | game.js:5837 |
| AiDrive.defendPull | [ai-drive.js:1732](../../js/physics/ai-drive.js#L1732) | game.js:5875 |
| AiDrive.queueReach | [ai-drive.js:307](../../js/physics/ai-drive.js#L307) | game.js:5446 |
| AiDrive.stintPlan | [ai-drive.js:1342](../../js/physics/ai-drive.js#L1342) | pit-lane.js:1514 |
| AiDrive.pitNow | [ai-drive.js:1541](../../js/physics/ai-drive.js#L1541) | pit-lane.js:1911 |
| RaceControl.holdCap | [race-control.js:729](../../js/race/race-control.js#L729) | game.js:4947 |
| Collide.scanOtAhead | [collide.js:250](../../js/physics/collide.js#L250) | game.js:5089 |

## Coverage and comment findings

These are read-based limitations and documentation findings, not new runtime failures. The per-file contracts above distinguish static source guards, pure VM helpers, real game VM simulation and meta-runner subprocesses.

1. [aero-preview-fields:51](../../tests/unit/aero-preview-fields.test.mjs#L51) and [aero-shapes-d3c:52](../../tests/unit/aero-shapes-d3c.test.mjs#L52) call the baseline “bit-for-bit”, but hash positions/colours/materials only after rounding at4096 and omit normals/indices. Reword the claim or use exact mesh-array equality if exact identity is intended.
2. [aero-zone-tables:108](../../tests/unit/aero-zone-tables.test.mjs#L108) says “check above rebuilds the runs itself”; current test instead calls zonesFor and captures its warning. Its earlier header accurately explains this change. The stale paragraph should refer to warning observability/table-use count.
3. [aero-zones-vm:6](../../tests/unit/aero-zones-vm.test.mjs#L6) pins “all10 tests”, while current file has a parameterized four-circuit loop and additional assertions. Treat the declaration list as inventory; reconcile with twinned-specs tooling rather than trusting historical count prose.
4. [agentview-api-contract:209](../../tests/unit/agentview-api-contract.test.mjs#L209) names13 camera modes while agent-view VM's case title says15. The behavioral contract is onboard camera exclusion; mode-count prose needs one current source.
5. [agent-surface:70](../../tests/unit/agent-surface.test.mjs#L70) says four removed servers but loops three. This is title drift, not evidence that a fourth server must be added.
6. [ai-queue-reach-vm:50](../../tests/unit/ai-queue-reach-vm.test.mjs#L50) promises no contact; its final assertion permits first touch below5m/s. The actual contract is no hard contact.
7. [ai-strategy:399](../../tests/unit/ai-strategy.test.mjs#L399) says three laps left but calls compoundFor(1). The test checks the shortest-horizon soft recommendation; update wording to one lap.
8. [agent-anchors-vm:11](../../tests/unit/agent-anchors-vm.test.mjs#L11) describes act/rollout/reset/jump/aiPlace anchors. This file directly asserts act/rollout/aiPlace plus countdown, leaving reset/jump responsibility to other suites; do not infer those cases from this header.
9. [a11y-pwa-pass:1](../../tests/unit/a11y-pwa-pass.test.mjs#L1) claims each assertion executes shipped source rather than grepping; the file also has manifest/static shell/CSS and source-wiring regex tests. The overall suite is mixed behavioral/static coverage.
10. [a11y-loading-hint:24](../../tests/unit/a11y-loading-hint.test.mjs#L24) calculates contrast from fixture constants with regex wiring rather than reading computed browser styles; this bounds what the accessibility result establishes.
11. [agent-view-vm:32](../../tests/unit/agent-view-vm.test.mjs#L32) explicitly omits renderer chunk/frustum coverage and models frames50ms with a1280×720 stub. Its internal raster payload assertions are useful but do not establish hardware/backend boot,844×390 touch layout or actual pixels.
12. Agent config/output process fixtures contain owned cleanup and negative controls, but their static budgets/regex and source-shape gates prove neither instruction semantic correctness nor all shell-parser forms. The explicit body-read inventory makes those boundaries visible.

## Completion / verification hand-off

All35 assigned files fully read and mapped. No source/test/browser mutation and no commit. Node/browser verification was deliberately not run by this delegated mapping lane; the parent owns the docs-only integrity checks. SHA-256 values pin file content at read time and should be rechecked if another lane edits tests before integration. Case entrypoints are source declarations (including loop templates), not execution counts or pass results.
