# Environment and private plugin source map — complete

Read-only source audit on 2026-10-27, checkout `/workspace/f1-game`, HEAD `7fb8b2d56ad8c39b8fd71efca7aca4140d89d11b`. Scope is every tracked path under `tools/env/` and `tools/environment/`, including hidden manifests, skill references, helpers, fixtures and tests. All 67 paths are UTF-8 text; no tracked binaries or symlinks occur in this scope. The ledger records whole-file reads, SHA-256 and bytes. Files were read as numbered text in bounded windows; two oversized outputs were recovered in smaller windows before claiming coverage. No install, activation, service launch, health/network call, package build, test, browser, commit or source modification was performed. Only this report and an ignored reading artifact were written. Parent owns verification.

## Entry points, ownership and execution edges

These are source/import/call-site edges, not claims that an executable or hosted service currently works. The project code-nav skill was read; its explicit exception allows text/source searches for files outside `js/`. This scope uses shell/Python entrypoints and Node ESM imports rather than script-global game symbol lookup. No LSP query was needed or used as a substitute for execution.

| Surface | Producer → consumer and contract |
|---|---|
| Cursor VM bootstrap | `.cursor/environment.json:3` invokes `tools/env/cloud-agent-install.sh`; `.claude/hooks/session-start.sh:43` invokes `install-browsers.sh`. These are separate from prepared-environment resume. |
| Prepared activation | `activate.sh:4-17` defaults browser/cache variables without replacing existing nonempty overrides; prefixes toolchain and canonical CLI paths only once; defaults optional Chrome clone skipping to 1. This changes the sourcing shell only. |
| Command dispatcher | `bin/f1-env:5-26` accepts zero/one argument. install→installer; resume→resume wrapper→boot; start→boot; doctor→preflight; verify→verification; shaders→shader validator; plugins→builder; plugin-install→local registration. Unknown/extra arguments exit 2. `bin/f1-build-plugins:4` forwards builder arguments. `setup.sh:5` is installer compatibility. |
| Canonical bindings | `bind-canonical.sh:8-30` backs up retained destinations under timestamp/PID source-backups and links canonical source entries, entire plugin-sources directory and four runtime compatibility names. Existing exact links are reused. Retained private data is separate from tracked source. |
| Installer | `install-environment.sh:6-27` accepts no arguments, sources activation, takes nonblocking install flock, checks required sources, binds compatibility paths, installs dependencies/tools, builds packages and verifies. It does not invoke boot. |
| Dependencies | `environment/install-dependencies.sh:6-13` requires Node ≥22, disables browser postinstall download, checks all direct dev dependencies offline and uses `npm ci` on failure; then calls shared browser installer and resolves Chromium. |
| Developer tools | `environment/install-tools.sh:6-41` maintains private Debian apt state with archive keyring signature checks, downloads/extracts tmux/libutempter/shellcheck/glslang/spirv packages when sentinels are absent, links three binaries, checks actionlint 1.7.12 release checksum and invokes shared zizmor installer. Debian package revisions are not pinned. |
| Resume/start | `environment/resume.sh:7` invokes boot and propagates failure. `boot-chat-mcp.sh:5-29` activates, defaults existing tunnel profile/executable locations, preflights, waits at most 180 s on startup flock, closes fd 9 in lifecycle launcher, waits for supervisor status, then checks native tunnel health and local stdio contract. No dependency install is on this path. |
| Service ownership | `tools/env/chat-mcp-service.mjs:27-75` checks Linux `/proc` start identity; start reuses a live record, doctor checks dependencies/browser/optional tools/credential presence, status reports identity validity, restart signals only a matching owner and waits ≤10 s. Detached supervisor owns an atomic directory lock, records restart state, sends SIGTERM then bounded SIGKILL to its child on shutdown, retries tunnel exits at most five times with exponential delays capped at 30 s. State/log/health locator are under `artifacts/run/chat-mcp`. |
| Tunnel protocol | Service launch at `chat-mcp-service.mjs:72` uses existing binary/profile, command override to canonical `tools/mcp/chat-gateway.mjs`, channel main and `--mcp.stdio-send-initialized-notification`. Profile identity/credentials are not recreated. Supervisor running is an earlier milestone than native health or hosted initialization. |
| Native health | `check-chat-mcp-health.py:10-64` discovers non-zombie processes by exact command path and parent PID, rejects duplicate tunnel runtimes, validates owner start identity, validates an HTTP 127.0.0.1 native locator, invokes tunnel health with required control-plane poll, and retries to a 90 s deadline. Success prints bounded PID/readiness/poll fields. |
| Local wrapper launcher | `launch-mcp.sh:6-20` sets retained XDG/cache locations, maps six named servers to repository wrappers (three serve, three run), and execs `output-level-mcp.sh`; unknown server exits 2. It is an explicit local launch route, not hosted account attachment. |
| Profile derivation | `configure-chat-mcp.mjs:10-28` requires existing tunnel ID, rejects literal API key values, clones profile, replaces commands with gateway command/cache option, removes server URLs, sets warn logging and exclusively creates mode-0600 output. `tests/unit/free-design-tools.test.mjs:11-12` imports this helper and service readService directly. |
| Browser helper consumer | `tools/mcp/check-chat-browser.mjs:31` reads packaged `skills/f1-dev-tools/scripts/browser.js`; package workflows instruct evaluating that same helper on the owned game page. |
| Shared memory | package scripts `package.json:78-80` invoke apex-memory list/show/retire. The tool reads `.claude/memory/MEMORY.md`, reports orphans, normalizes requested filenames to basename and retires topic plus index row, refusing MEMORY.md itself. |
| Shared skill mirrors | `.codex/config.toml:8`, Cursor rules and `AGENTS.md` direct mirror repair. `mirror-skills.sh:30-91` checks canonical skill directories, target set and exact symlink or equivalent-copy contents; repair removes stale entries and replaces invalid entries; `--copy` materializes copies. |
| Shared lint provisioning | `.github/workflows/ci.yml:763-765` caches by installer hash and runs install-lint-bins. Shared installer supports tool selection and plan; uses go module integrity, hashed zizmor wheel requirements, Debian signatures and locked naga 30.0.1 cargo install. Existing executable sentinels skip installation. |

## Shared bootstrap behavior

`cloud-agent-install.sh:34-125` repairs npm prefix `/`: loads nvm, removes broken prefix environment overrides, strips writable npmrc entries, links the selected nvm Node ahead of exec-daemon when possible, and fails if prefix remains empty or `/`. Its apt installation is best effort. It calls shared browser installation before optional Chrome/Tinyfish clone setup. On browser-install failure, a discovered browser plus validated complete offline dev dependency tree can recover; otherwise it fails. After success it runs MCP readiness non-strictly and optionally starts the configured private service when a profile environment binding exists (`:190-217`). Thus this generic cloud install can start an optional configured service, while the canonical prepared installer does not boot.

`install-browsers.sh:25-148` obtains a writable cache and existing executable through chromium-path. `--plan` stops before installs. It validates direct dev dependencies with offline npm ls, attempts npm install with scripts disabled (three prefer-offline rounds plus final ordinary round), tolerates npm failure only if the installed tree validates, reuses a discovered browser, or installs the local Playwright CLI Chromium and creates convenience links. `ensure-mcp-ready.sh:35-131` can clone optional DevTools, export cache path, create Chrome-channel symlink, call tools list plus mock status and run mcp-smoke; default failures warn, strict exits 1. It is not a pure offline health read.

## Package and account boundary

`build-plugins.py:14-68` reads two canonical source trees. Cloud manifest identity is `dev-6ade996f81448191a51fc4e7a33152a8`, version 1.0.6; Dev Tools identity is `f1-dev-tools`, version 0.3.0. Their aliases differ but both bind the same existing app ID. Validation rejects source symlinks, invalid JSON, root local mcp auto-discovery, absent declared skill roots, identity/version/app drift, path escape and legacy/version disagreement. Root manifests intentionally omit mcpServers; the Dev Tools executor JSONs retain three local stdio bridge definitions only for hosts explicitly supporting them. Marketplace maps both local packages under `f1-workspace`.

Builder normal mode runs each package's `tests/*.test.mjs` with a 45 s timeout before packaging and checks source contents again. ZIPs use sorted entries, fixed 1980 timestamps, fixed file mode and compression. Output is staged outside sources and replaced per file; receipt contains hashes/member counts, preserved binding and `published:false`. `--check` validates existing archives against all source bytes without rebuilding or running package tests. This is archive equality, not account publication. `environment/plugin-install.sh:5-10` checks Codex existence and archives, adds the local marketplace and two plugins. It modifies configured local Codex installation and does not update account packages or prove hosted tools.

## Packaged helper contracts

| Helper | Inputs, outputs and limits |
|---|---|
| readiness.mjs | Explicit exact checkout with game/wrapper sentinels; optional fresh ≤2 MiB JSON tool-name array/object; names restricted to 1–200 word/dot/colon/dash chars and deduplicated. Git identity/status plus serial existing Apex status/catalog/doctor subprocesses, 20 s and 2 MiB per subprocess. Validates nested doctor failure and status/catalog shapes. Local PASS exits 0 while overall remains PARTIAL and host execution/render coverage stays SKIP. Optional report is exclusive-create. |
| agent-readiness.mjs | Imports toolNames; recognizes qualified native collaboration names, GitHub callback names and candidate provider session tools. Returns UNKNOWN / EXPOSED_UNVERIFIED / NOT_EXPOSED and AVAILABLE_NEEDS_LIVE_TEST / INCOMPLETE. Does not launch or certify any service; catalog ≤2 MiB, output exclusive-create. |
| apex-tools-bridge.mjs | Three allowed server IDs; explicit F1_GAME_CHECKOUT/APEX_GAME_CHECKOUT must be exact valid root. Otherwise cwd/INIT_CWD/CODEX_CWD ancestors and named direct f1-game children locate checkout. Uses output-level gateway when present, direct wrapper fallback otherwise, inherited stdio/env and signal forwarding. |
| github-fleet.cjs | Dependency-free injected fetch/createCommit/updateRef callbacks; validates actual session/recipient and six message types, one line ≤4000 chars. Reads ≤100 commits with INITIAL_WINDOW/BOUNDARY_FOUND/GAP continuity. Writes unchanged tree commits on historical `claude/fleet-bus`, expected head and force false, validates readback or ancestry, retries at most three actual races; receipt never claims acknowledgement. Current AGENTS.md coordination is authoritative over this historical bus route. |
| browser.js | Defines frozen F1Dev with diagnose, inspect, capture, restore, trace, replayCheck, previewPreset, checkAssets and storageReport. Uses existing __apex / RealRace / CamTune. Scene v1 validation precedes mutation; team/halo mismatch rejects. Restores car/world without native camera branch, applies temporary static view. Trace requires 2–240 distinct rendered frames and timeout 100–120000 ms. Replay batch ≤12 validates operations, full replay, driver availability and projected duration before mutating; restores T/follow/speed/pause in finally. Preset validates knobs, saves raw pack, synchronously previews and restores raw overrides without persisting. Assets ≤64 URLs uses fetch no-store/Web Crypto with per-URL timeout; storage omits values. |
| compare.mjs | Validates trace schema, finite 3-vectors/FOV/clocks and strictly advancing frame/time. Compares track/viewport/camera/renderer/reduced-motion/view/replay/label/count identity and reports deltas without smoothness verdict. CLI exactly five args; writes only physical descendants of cwd artifacts/scratch, rejects symlink output and input alias overwrite. compare exits 2 if metadata differs; gallery accepts PNG signature and ≤20 MiB, embeds originals in escaped HTML. |

## Skills, regressions and verification responsibilities

Cloud connection skill separates actual hosted exposure/status from local catalog, tunnel readiness, package import and environment publication; it preserves identities and bounded hostToolNames evidence (≤2000). Dev Tools main skill routes UI inspection/diffs, CPU/heap/graphics, garage and parts, scene/motion, replay, presets and diagnostics. Its references fully cover prepared recovery/initialized-notification shim, source-bound readiness receipts, one-parent browser ownership, bounded UI and garage plans, same-scenario profiling and physics/render/GPU evidence distinctions. Coordination skill/reference pair distinguishes native children, independent providers, job observation, scoped authorization and durable handoff; the historical transport helper uses injected GitHub callbacks and cannot wake a session.

`environment/verify.sh:6-17` sequences shellcheck; Python activation/failure/install-lock tests; health discovery tests; free-design-tools unit suite; isolated stdio lifecycle test; preflight; lifecycle doctor; mirror check; required workflow/shader validators; plugin-build tests and archive check. It does not run full browser rendering acceptance. Shader environment validator separately imports shader extraction/GLSL validation, lint resolver and harness; rejects GLSL/WGSL negative controls, compiles extracted WGSL through real Dawn on a blank loopback page, writes hashed rows/validator receipt, shuts down in finally and fails if missing adapter or any failed shader.

Tests read in full: activation idempotence/override and fail-before-start/install separation/lock order/concurrent installer rejection; fake-proc tunnel discovery and zombie filtering; lifecycle fixture requires initialize then one notification and rejects duplicate; isolated tunnel proxy exercises shim on/off and pre-init rejection; builder tests reconstruct twice from copied sources, check hidden manifests/determinism/hash receipts, identity/auto-discovery/version rejection and truncated ZIP detection. Package tests verify hosted-only roots, bridge exact-root/output gateway/backward fallback, readiness unknown-vs-empty/shape/doctor/error/occupancy semantics, and fleet validation/readback/race/denied/lost-response/bounded continuity. These are inspected assertions, not tests executed by this audit.

## Proven stale comments and text

1. `plugin-sources/f1-cloud-mcp/README.md:1` says 1.0.4; canonical `.codex-plugin/plugin.json:17` is 1.0.6 and PLUGIN-BUILD.md:6 agrees with manifest.
2. `plugin-sources/f1-dev-tools/README.md:1` says 0.2.5; both Dev manifests are 0.3.0 (`.codex-plugin/plugin.json:13`, `plugin.json:23`).
3. `plugin-sources/f1-dev-tools/skills/f1-dev-tools/scripts/browser.js:2` says “No network”; its exported checkAssets at :70-97 explicitly fetches URLs at :84. No-storage-write claim is consistent with the inspected helper, but no-network is overbroad.
4. `tools/env/install-browsers.sh:3-4` claims installation into /opt/pw-browsers. Actual :26-33 delegates writable-cache selection to chromium-path and preserves override; prepared activation defaults to /workspace/pw-browsers. Header names a historical preferred location rather than universal current behavior.
5. Packaged coordination transport docs instruct fleet-branch messaging (`references/transports.md:29-39`); current root AGENTS.md Coordination says comments are the only inter-agent message and GitHub issues/PRs form the bus. This is a proven policy-text conflict, not evidence that the historical helper was removed or fails. Readers must follow current checkout policy.

No runtime availability, health, account publication, restored-image reproducibility, browser correctness or performance result is inferred from these source checks.

## Complete whole-file read ledger

All paths below are relative to `/workspace/f1-game`. Range `1–N` includes every line, including comments, declarations, tests and prose. SHA-256 covers raw bytes. “text” records successful UTF-8 decoding and absence of NUL bytes; all tracked modes here are regular files.

| Path | Read range | Bytes | SHA-256 | Kind |
|---|---:|---:|---|---|
| `tools/env/apex-memory.mjs` | 1–83 | 3547 | `0a1368b2ade6b33669a165871122d231bac410eed69a188627a548da45d7b413` | text |
| `tools/env/chat-mcp-service.mjs` | 1–77 | 7220 | `9a5e51b0f776e32692448949d97ca2ac799ce5f44cca5bd878b5546213f6bb90` | text |
| `tools/env/cloud-agent-install.sh` | 1–217 | 8946 | `a0902d73b9d7d4b0df72669f4cffad6a425ad1c298f6eb2237ab83d106c75c79` | text |
| `tools/env/configure-chat-mcp.mjs` | 1–30 | 2237 | `2aa8b23acb02b450b4411fe52f0ba3eb35a096511fc60a9bc4270da722bd5891` | text |
| `tools/env/ensure-mcp-ready.sh` | 1–131 | 4417 | `792b8b498b277ccbfbe275f2db95947fa9379805d951200b51ccd24e3618c9ae` | text |
| `tools/env/install-browsers.sh` | 1–148 | 5661 | `b5c0db150b2fb7d22a4ffada54f754f09e5fa2d022e5d8b03c6fd850595f04bb` | text |
| `tools/env/install-lint-bins.sh` | 1–67 | 4450 | `bd1ffeaa5b04caef59605c6e1df1aaf5e6989fa0a3d7c57b4bf30b48649c3bf0` | text |
| `tools/env/mirror-skills.sh` | 1–91 | 3660 | `baf08e2645d402f00e41253382789fdc5e8029c1636cb2790131affdde6179c1` | text |
| `tools/environment/.gitignore` | 1–3 | 32 | `0f6a5244cde1ecb5f65283fc86159d00bd41056020961ffe9e87c6041c79e33a` | text |
| `tools/environment/ENVIRONMENT.md` | 1–80 | 4435 | `b2af1f46725d5ba979f1ed147ae01fd89e0669caeadd51e793692342dea6a66c` | text |
| `tools/environment/MCP-STARTUP-SKILL.md` | 1–36 | 2318 | `c4c52d40670f7d19f64bb4bcd06514f96c7f39140a241505f7a00d9f4a5bf39f` | text |
| `tools/environment/PLUGIN-BUILD.md` | 1–15 | 895 | `9ee66f5be315f56720a1aca19879c7d7a12c908ec86841a0b9ea6776346427f6` | text |
| `tools/environment/activate.sh` | 1–17 | 729 | `c52e7d402725ddc7098fb2d0de033afc70b3704f6d3d59f2e13cc7f0d8384513` | text |
| `tools/environment/bin/f1-build-plugins` | 1–4 | 180 | `b4ceade485cf57220dea204d0c21acffe00f485be3a0c9c76b3a2ed487d178ac` | text |
| `tools/environment/bin/f1-env` | 1–26 | 1499 | `4104d29255633d2239ea63b846626e74d024bd99b0d86ec82ac16bd6a2859e24` | text |
| `tools/environment/bind-canonical.sh` | 1–30 | 1820 | `a7a13ad98149a46958435d11a708f94fbf7b3ada0025bbfb6a7683d6e07313d8` | text |
| `tools/environment/boot-chat-mcp.sh` | 1–29 | 1424 | `3f9615ebba92f8c93ec251dcaafc733c9e02768342d256df325f2810ad0da5d3` | text |
| `tools/environment/build-plugins.py` | 1–134 | 6674 | `92c74ed6a43a6925551cc9e80f7d7f2acc436b2227bd14e23d8c71acb5e289e3` | text |
| `tools/environment/check-chat-mcp-health.py` | 1–67 | 3252 | `a60065b6fcc5712605e539039760db11a90981491fab421eeb4651e79b0526b4` | text |
| `tools/environment/environment/install-dependencies.sh` | 1–13 | 695 | `dba33a46fff749e3727b3d7b9b12fddcaee10723e896164d7aa1c84c449125a2` | text |
| `tools/environment/environment/install-local-plugins.sh` | 1–4 | 195 | `a9574c80a2f3ed07200d11e0adb70723703386ccbdaec301ed009072e7e01031` | text |
| `tools/environment/environment/install-tools.sh` | 1–41 | 2132 | `543426171a2364e712723b09c05e2b3be2d56300bccc0773ea90de56e2fd8148` | text |
| `tools/environment/environment/plugin-install.sh` | 1–10 | 596 | `0cc4f44e6a77bcd559f0827442528ef67d3473efde25f62e7a94ed7993b43e1f` | text |
| `tools/environment/environment/preflight.sh` | 1–26 | 1600 | `ba477e78c9eb913a02177c1b64649a1efc196a1a6f8c0d7f76370e45ed63bc01` | text |
| `tools/environment/environment/resume.sh` | 1–8 | 355 | `076122b7a3792d5bff05273eab77b7e7f955283aa84ccf31f77d5aef7e5c9703` | text |
| `tools/environment/environment/test-environment.py` | 1–69 | 3732 | `2187180d4f9f795a1f5f9b8ca0ed1a291940d9cc09bf52de216bd431ee2d5c22` | text |
| `tools/environment/environment/test-health.py` | 1–25 | 1213 | `3e81452ba1c18f0731cac6d5fc3f68a1a955d4416b62c59fe02b7570a928dd2f` | text |
| `tools/environment/environment/validate-shaders.mjs` | 1–58 | 3871 | `abe765e7ef3d701e8893193fefb7ad6e53e5597709b4b506c1e2c98b9fc4bc83` | text |
| `tools/environment/environment/verify.sh` | 1–17 | 1144 | `834945ddf80d24a3104590e41bd83cd4b50a59d3c67bd560f9ea21998cebaf90` | text |
| `tools/environment/fixtures/lifecycle-echo.mjs` | 1–16 | 1116 | `769df66cb98844459e7d2652b6444d1f225f76ec587e659d222375391fa81c18` | text |
| `tools/environment/install-environment.sh` | 1–27 | 2005 | `1d677c8d22cec33bd9854efc9c9fa67fec406b17401e9fb7a5d0470078bf88f5` | text |
| `tools/environment/launch-mcp.sh` | 1–20 | 925 | `e3d51e7eeba582fce4222535c0ac47b6e98ebabceb3284344b5b7a2cca98baed` | text |
| `tools/environment/plugin-sources/.agents/plugins/marketplace.json` | 1–19 | 330 | `d7d9e8368eb4b53c04d29c47959fee8bf8ba8214998925b5e629bb8b819aeeea` | text |
| `tools/environment/plugin-sources/f1-cloud-mcp/.app.json` | 1–7 | 128 | `77efdcf1a5a909546c0455fdc9190a4715cf94a9a60aed02b221a82a9d1b5420` | text |
| `tools/environment/plugin-sources/f1-cloud-mcp/.codex-plugin/plugin.json` | 1–19 | 889 | `9e785c1a69323bb60d221b8f27a3564d177f208c9ad70a010ed1ca6eea3018ef` | text |
| `tools/environment/plugin-sources/f1-cloud-mcp/README.md` | 1–12 | 821 | `5afa03e054bb15d2d1a7c977798795f0143ab5d224e125c9c4eedfa71a9245df` | text |
| `tools/environment/plugin-sources/f1-cloud-mcp/skills/f1-cloud-mcp/SKILL.md` | 1–55 | 3180 | `96f5c5b56009a4f2fc72a64ce08074081b2eb833c6a894de6030b78b9c5eb799` | text |
| `tools/environment/plugin-sources/f1-cloud-mcp/tests/packaging.test.mjs` | 1–17 | 994 | `9f3dc055d5dfd64b2882cd400c3222821e718ab5b6c789e3746b58a6351d18be` | text |
| `tools/environment/plugin-sources/f1-dev-tools/.app.json` | 1–7 | 104 | `02b196e062f62829f9af62730ffc4f2328945bf5839e9391628d7a51ce86952d` | text |
| `tools/environment/plugin-sources/f1-dev-tools/.codex-plugin/plugin.json` | 1–21 | 1012 | `bc1fca4315f38b09d1481921176deeef712a3c50e2c0abb979379bd25e1a812e` | text |
| `tools/environment/plugin-sources/f1-dev-tools/README.md` | 1–19 | 1276 | `64b391d1735139c08e68d7a3e370c9dabb2f6c0ff6b7ed25d8fc229ff761cc13` | text |
| `tools/environment/plugin-sources/f1-dev-tools/executor/.mcp.json` | 1–30 | 580 | `cf4ec1532783edfd8d0732f4ae92d4cb4c7444c98390f9efad6f837b1c41a321` | text |
| `tools/environment/plugin-sources/f1-dev-tools/executor/mcp.json` | 1–28 | 601 | `d38e0771b8e5b09801162871f3dc99a3c032c5fcf12a4cdde2c9fc147fead976` | text |
| `tools/environment/plugin-sources/f1-dev-tools/plugin.json` | 1–25 | 1157 | `b5e0aebeb792dea74c12f2d19ffc70938e1eea55ea3e57f841371675c88ffcf8` | text |
| `tools/environment/plugin-sources/f1-dev-tools/scripts/agent-readiness.mjs` | 1–71 | 3572 | `4c4dfa780a46a8b0e19d532f620e0dc9c804d37d40dd15209155c472a697b841` | text |
| `tools/environment/plugin-sources/f1-dev-tools/scripts/apex-tools-bridge.mjs` | 1–66 | 2967 | `dd8a5ce1bc7d328610102ac1fa0625123c5b755af3d4e73081f19f032caf593d` | text |
| `tools/environment/plugin-sources/f1-dev-tools/scripts/github-fleet.cjs` | 1–106 | 6344 | `9957d6054063f8b8a35cebd8dffebfa137faaeb1930de87980bfc260b73c0f6f` | text |
| `tools/environment/plugin-sources/f1-dev-tools/scripts/readiness.mjs` | 1–128 | 7915 | `d6c1c45336e9cc91f3b7ef7df05386d4691b535a898f0976a67c4533e512245d` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-agent-coordination/SKILL.md` | 1–57 | 9552 | `6b2100e88829e8136612a3316c21a61cf15e9f9452603e541554aef46741b102` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-agent-coordination/references/codex-workflows.md` | 1–71 | 7458 | `aaaa5bafaa63e1925f863bdfb2274fef810b9bde34206e0094d7ca39913e69c3` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-agent-coordination/references/transports.md` | 1–47 | 4453 | `2da348e6d8244368fbae56e686372b3aeb633883f2cba709b0f0b2ef53df7f63` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-dev-tools/SKILL.md` | 1–76 | 11894 | `d5d433077f6208c626438ecf189605d5f1187ba84d3dcc7089d59bf2fca6e76d` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-dev-tools/references/environment.md` | 1–83 | 5150 | `cf6caf00f7e7aa2b792fb45e50cebf29f1d06397f0e18690f2fb5b619e9863a9` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-dev-tools/references/garage-parts.md` | 1–40 | 4345 | `dae06b804c0b92861f11fba6f91f0ed3b7dfbbaf74b5d616f90033e9965b5a4a` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-dev-tools/references/profiling.md` | 1–67 | 10189 | `6a67220b3fac09f81dd49e65946173c96451b6ac13abd2910b4a6fa73031d8ad` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-dev-tools/references/readiness.md` | 1–179 | 10709 | `87dd7d33c42f109435ef514096325d188c0d59bb4330c2e8df27c4a4295fd3cc` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-dev-tools/references/ui-inspection.md` | 1–26 | 3157 | `7439ee084f641af3804825e95adbfb70c3a52d1361f20a1223c347de36c417eb` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-dev-tools/references/workflows.md` | 1–72 | 9601 | `cd5af797c51fbdc38a6a45fae9cee40f1de634f462b985befd32ca1b0f069e75` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-dev-tools/scripts/browser.js` | 1–268 | 15317 | `a8bade3dd5a20404e8d5c203f365840193ed994fac06ba820de754ecc9f29c12` | text |
| `tools/environment/plugin-sources/f1-dev-tools/skills/f1-dev-tools/scripts/compare.mjs` | 1–99 | 6878 | `72c5b4e53d414fd0715dc6afcb56a2b3a145d036cee0ce4ea2cc0e9a39851983` | text |
| `tools/environment/plugin-sources/f1-dev-tools/tests/agent-setup.test.mjs` | 1–84 | 4968 | `d7e9f36c64d4d1dcd8f0a734b88464eb2c1800e6f815cfe08def636be9759419` | text |
| `tools/environment/plugin-sources/f1-dev-tools/tests/bridge.test.mjs` | 1–42 | 1951 | `f78e7072efa88e1c49eca9b3666d83a6d3c958131e9a03f6010f940ebdd9a448` | text |
| `tools/environment/plugin-sources/f1-dev-tools/tests/packaging.test.mjs` | 1–17 | 994 | `9f3dc055d5dfd64b2882cd400c3222821e718ab5b6c789e3746b58a6351d18be` | text |
| `tools/environment/plugin-sources/f1-dev-tools/tests/readiness.test.mjs` | 1–80 | 4903 | `e248f90ab721c66632c2c87982d415254bd571570694c6d46c399117b91ae618` | text |
| `tools/environment/setup.sh` | 1–5 | 234 | `d642ae4e5b65fbf51186bcf11d391e300735eccf74eefaee685386e883a68139` | text |
| `tools/environment/test-plugin-build.py` | 1–82 | 3667 | `7007404a9abd4e98f46f44660b2b6741ada7d9bbba95bcf72a274bb3b8d14cbd` | text |
| `tools/environment/test-stdio-lifecycle.py` | 1–53 | 3114 | `8ea819efd59310f6fe0a17ba21fdaa6c3b92a591ca2e266745a1f013b57c0281` | text |
