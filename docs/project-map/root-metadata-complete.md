# Root metadata — complete source map

Scope: tracked files directly in the repository root, excluding the HTML/runtime shell, `sw.js`, `manifest.json`, `version.json`, `jsconfig.json`, and `tsconfig.checkjs.json` covered by `root-shell-complete.md`. Snapshot read on 2026-10-27. All 14 files below were read to EOF; the empty marker was inspected as a zero-byte file. No root binary is in this scope. SHA-256 values describe working-tree bytes, not a claim about a remote deployment.

Reading used numbered source slices capped at 150 lines and 10,000 characters per individual source output. An initial oversized AGENTS slice and a combined response that truncated were superseded by the complete bounded slices listed below. Git inventory and Python file inspection only; no project CLI, tests, config imports, browser, network, secrets, environment inspection, runtime changes, or commits. Static `process.env` references were read as source text, never evaluated. Named game globals were not navigated: these files expose package/configuration contracts, so direct source and text references establish their consumers.

## Complete path/hash/range/type ledger

| Path | Type | Bytes / lines | SHA-256 | Full read ranges |
|---|---|---:|---|---|
| `.gitattributes` | Git/tool text configuration | 1131 / 20 | `2775e34b288e9fc42df2a82916c34595f6f043541a595d6a09a825f6c2601787` | 1–20 |
| `.gitignore` | Git/tool text configuration | 2172 / 68 | `abe57f7a32443a3d87873b6d8dc8102e5a6bf923ff6344d3a4aa1f12811c8d8a` | 1–68 |
| `.mcp.json` | JSON configuration | 1677 / 83 | `62da68560e1725e09f58e55c8b37d5bca279f22382e809cb08504de1c04c1114` | 1–83 |
| `.nojekyll` | empty deployment marker | 0 / 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | empty; no line range |
| `.worktreeinclude` | Git/tool text configuration | 344 / 7 | `a6bd2e730eb328eef8d04d358cb40732ce374cfc8daf84e6d4adfb444687316d` | 1–7 |
| `AGENTS.md` | Markdown prose | 22722 / 199 | `b40fcb879153ce1c19bd2fe13aeaa771a21faa31b04d679828b01684b8295422` | 1–71; 72–141; 142–199 |
| `CHANGELOG.md` | Markdown prose | 10182 / 123 | `947818988668864882887ae634557178970f5e73464b7887cb0e10fb222637f6` | 1–89; 90–123 |
| `CLAUDE.md` | Markdown prose | 259 / 7 | `d8331c320c1f9761a73362042ed6baac5a3c41795273db9a9b136ecf66834a00` | 1–7 |
| `README.md` | Markdown prose | 13462 / 265 | `f93238b567df7cd0e5984f4c8ced42586e6dbd9e9204c25a7bfcae8c6304126f` | 1–131; 132–265 |
| `REPORT.md` | Markdown prose | 2193 / 51 | `d54eb6254e6ce85d92639b61e8e230c9923a531c930d31b980431fe160151023` | 1–51 |
| `package-lock.json` | JSON configuration | 103668 / 3039 | `dbaa9a8ac0354501182382cf11d5be019a857035c7eb6fdfcc5d2f43445b55bf` | 1–150; 151–300; 301–450; 451–600; 601–750; 751–900; 901–1050; 1051–1200; 1201–1350; 1351–1500; 1501–1650; 1651–1800; 1801–1950; 1951–2100; 2101–2250; 2251–2400; 2401–2550; 2551–2700; 2701–2850; 2851–3000; 3001–3039 |
| `package.json` | JSON configuration | 32921 / 110 | `d5ef4eaafe5d034da59e3fcb290f6765d510cd2515805bfa53855459aad83073` | 1–31; 32–52; 53–56; 57–84; 85–110 |
| `playwright.config.js` | JavaScript ES module configuration | 18956 / 341 | `1c03bd866d46c9fa78aa5d46e894dd10881b18391ad45978194e016b57619f4d` | 1–132; 133–257; 258–341 |
| `playwright.gpu.config.js` | JavaScript ES module configuration | 2270 / 47 | `b8ce3aab413fc9ccf859cb9738d966d091d74bc2fe30fc598385df9355ea41bb` | 1–47 |

## Runtime and ownership boundaries

- `README.md:5–10,175–199` gives the player/developer entry: static HTML/CSS/JavaScript, script-tag IIFEs, no app framework or runtime npm dependency. A static server serves the tree; HTTPS is required for phone motion sensors. `tools/manifest.cjs` owns module order; `js/game.js` is the game entry. Root package metadata is development infrastructure, not a browser bundle entry.
- `AGENTS.md:100–113` states the module boundary: track engine versus circuit data, generated picker roster and lazy hydration, `Module.create(G)` with `types/game-ctx.d.ts`, logging first, renderer selection through gfx, and `index.html` owning static DOM. These are references to subsystem contracts; their implementation is outside this root-metadata scope.
- `AGENTS.md:6–10,133–153,174–193` is canonical agent policy. `CLAUDE.md:3–7` imports it and explicitly forbids accumulating a second rulebook. Cursor and Codex consume it directly. Path rules, workflows, hooks and coordination each have separate named homes; `docs/WORKERS.md` owns coordination. User direction supersedes agent drafts. Historical report wording does not establish current ownership.
- `AGENTS.md:73–86,155–192` describes feature branches, generated-file boundaries, PR handoffs, merge/deploy gates and GitHub coordination. `package.json` test scripts are generated from `tests/groups.json`; changelog sections are generated from fragments. Ownership for an open PR is its diff until merged/closed; label state, not old report prose, governs holds. No coordination action was taken for this documentation read.

## Documentation files and important comments

| File / range | Meaning and consumers |
|---|---|
| `README.md:14–153` | Player-facing mechanics, controls, modes and garage setup. Links usage paths, career, multiplayer, real-race notes and Track Designer reference. Controls distinguish held versus toggled actions, mobile input modes, manual gear restrictions, and gamepad bindings. These are documented behavior, not freshly executed validation. |
| `README.md:155–173` | Data Hub contract: Jolpica schedule/standings/results; OpenF1 historical telemetry, session/weather/classification; localStorage TTL caching and historical-data delay. |
| `README.md:201–246` | Development/testing entrypoints and debug API examples; full groups/fixtures are delegated to docs/TESTING.md and debug hooks to docs/DEBUG-HOOKS.md. Counts/timing are README claims at this snapshot. |
| `README.md:248–265` | Music, sampled engine and synthetic voice attribution; links to asset credit files; fan-project disclaimer and API attribution. |
| `CHANGELOG.md:3–14` | Exact `version.json` build headings; PR authors add `docs/changelog.d/<slug>.md`; `tools/gen/gen-changelog.mjs --fold` owns sections. Allowed new categories: New, Improved, Fixed, Removed; internal tooling excluded. |
| `CHANGELOG.md:16–123` | Shipped build 1695 notes, including Track Designer, WATCH/replay, persistence, networking, audio, GPU resources, UI/phone layout and performance. Historical Gameplay/UI/Graphics/Performance/Multiplayer/Audio headings coexist with the newer category instruction; this map records the source without rewriting it. |
| `REPORT.md:1–51` | Historical W22h livery texture leak report linked to PR 3643, head 7b20d2ede and an Actions run. Describes retained old fitted atlas and a car-draw-only disposal fix, draft/CANCEL preservation, stubbed VM texture measurements and a three-test claim. `tests/unit/livery-tex-dispose.test.mjs:103` cites it as evidence context. It is not an active task assignment, live CI verdict or current hold. |
| `AGENTS.md:12–86` | Ordered edit/verify/handoff loop, docs-only fast path, tiered gate ladder, constrained browser concurrency, retry/quarantine rules, generated ownership and PR/CI evidence. Commands are indexed as policy only, never run here. |
| `AGENTS.md:115–132` | References game-code rules, physics units/no curvature assistance, asset fallback and model-ready deadline, and debug-hook initialization prerequisites. |
| `AGENTS.md:195–199` | Compaction continuity contract: retain branch/head/PR plan, owned/forbidden paths, labels, tasks/logs and grants; drop acted-on output. |

## Package command surface

`package.json:1–8,85–110` defines private `apex26` 1.0.0, ESM tooling, Node >=22, UNLICENSED repository metadata, no dependencies field, and development dependencies only. The package version is independent of shipped `version.json` builds. Browser libraries are vendored according to README, rather than resolved by the root package at runtime.

| Commands / source ranges | Dispatch and downstream ownership |
|---|---|
| `test`, browser `test:*` (`10–24,29–35,63–64,76,82–83`) | `tools/ci/run-playwright.mjs` wraps selected specs/projects. Topical groups cover gfx/hooks/circuits/collisions/aero/phone/performance/physics/car/input/UI/gallery/baselines/modes/network; `test:webkit` explicitly selects WebKit; `test:xr` selects emulated XR. The wrapper owns per-run ports; Playwright config owns discovery/launch/reporting. |
| Node groups (`25–28,32,34,39–42,50–62,81`) | Explicit Node unit-file manifests, some through `run-node-group.mjs`, others `node --test --test-timeout=900000`. Split VM groups and APEX_VM_PAGE_GROUP support bounded workloads. Generated test group membership originates in tests/groups.json (AGENTS.md:75). |
| `test:tooling`, `test:tooling-fast`, `test:guards` (`43–45`) | Tooling floor, sweep aggregation and commit guard verdict runners under tools/ci. Guard ⊂ tooling-fast ⊂ deploy gate is policy, not interchangeable green evidence. |
| `gen`, `gen:check`, `gen:docs`, `fold` (`46–49`) | Generators own circuit metadata, shell/roster, title art, test scripts, Cursor rules, generated documentation/locales and changelog validation/folding. Check mode detects drift; fold is an explicit release operation. |
| Track checks / typecheck (`65–69`) | Track graph parity, float and clip audits, coverage audit; game-context type check delegates to tools/check/check-gctx.mjs. |
| UI/WGX tools (`70–74`) | Layout audit/survey/gallery and WebGPU capture/gallery commands; artifact-producing development commands, not runtime boot. |
| `prepare` (`75`) | npm lifecycle sets core.hooksPath to .githooks, tolerating git-config failure. Installing packages is therefore not a read-only metadata operation. |
| `rtc:e2e*`, `debug:unit`, `memory:*` (`36–38,77–80`) | Network integration, unit debugging and managed memory commands; no execution performed. |

Development dependencies (`85–102`) divide into GLTF/image asset tooling (gltf-transform, validator, sharp), MCP SDK, Playwright/browser testing, accessibility/property testing (axe-core/fast-check), JS parsing/scope/minification, QR/XR support, coverage, TypeScript and YAML. `package-lock.json:1–33` repeats root constraints in lockfile v3. `34–3039` pins the full development graph with resolved tarball URLs, integrity, licenses, engine requirements, optional/native-platform selectors, bins and peer relationships. Sharp/libvips and TypeScript native packages are platform-specific optional alternatives; their presence in the lock is not evidence of installed binaries. The MCP SDK pulls HTTP/schema/auth dependencies; that does not make Express/Hono runtime game dependencies. Lock entries for Playwright/test/core consistently pin 1.63.0; sharp pins 0.35.4; TypeScript pins 7.0.2. No registry access or installation occurred.

## Playwright configuration contracts

- `playwright.config.js:1–20`: imports Playwright, OS CPU count and `tools/lib/chromium-path.mjs`; wrapper-managed or explicit APEX_PORT defaults to 3456; all artifact paths are port-suffixed. Chromium resolver honors documented executable/browser-cache choices. Only source text was inspected; resolver/config was not imported.
- `24–83`: common software launch pins SwiftShader, unsafe WebGPU and unthrottled background timers. The measured comment forbids unbounded frame-rate rendering because it worsens CPU actionability contention. APEX_GL=llvmpipe replaces ANGLE selection with GL plus blocklist bypass. Exported `probeGl(launch)` dynamically launches Chromium, reads WebGL renderer info and closes the browser in finally. The direct `--probe-gl` branch at `333–341` fails when requested llvmpipe silently falls back. It was not executed.
- `85–143`: RENDER_SPECS separates GL/screenshot/DOM work from headless assertions; tests/unit/test-groups.test.mjs guards names and classification. XR has separate spec/launch flags. WebKit is opt-in by APEX_WEBKIT or project CLI argument and is a WebKit desktop proxy, not proof about phone hardware.
- `145–193`: local CPU-derived worker cap (one on <=4 cores), APEX_WORKERS override, otherwise CI two; explicit specs-only default discovery preserves `testDir: ./tests` reporter keys. Manual paths opt in and propagate APEX_MANUAL_RUN to workers. Exported TEST_MATCH, MANUAL_IGNORE and GLOBAL_TIMEOUT_MS describe that contract. CI global timeout defaults to 45 minutes, local to zero; a nonnegative override is accepted.
- `195–263`: parallel tests, shared global setup, CI one isolated retry/local zero immediate retry, 120s test, 20s assertions, 60s actions. Trace first retry, failure screenshot, bypassCSP for injected test hooks, reduced motion for deterministic snapshots and avoiding software-rendered View Transition stalls. These options intentionally differ from shipped user behavior.
- `264–331`: headless/render/XR plus optional WebKit projects; project-level ignore lists repeat manual exclusions because they replace the parent setting. Python static server uses the same port, narrowly controlled reuse, 60s startup and quiet logs. Live/HTML/JUnit reporters always run; CI adds mergeable blob reports. Artifacts live under ignored artifacts/.
- `playwright.gpu.config.js:27–47`: imports base config, maps every project's launch via hardwareLaunch, removes executablePath and only the SwiftShader ANGLE flag, rejects any surviving ANGLE selector, and sets channel chromium. Comment at `14–26` explains real Metal requires full Chromium and must never receive Vulkan ANGLE. Test guards pin this contract. APEX_GL=llvmpipe base configuration would leave an ANGLE flag and deliberately fail this variant; do not infer arbitrary base overrides are supported.

Consumers confirmed by text-source references: `.github/workflows/ci.yml:1869` runs gfx with GPU config; `tools/perf/race-entry-timer.mjs:22` and `tests/specs/multiplayer-scan.spec.js:23` / `multiplayer-scan-cancel.spec.js:23` import base config. `tests/unit/load-order.test.mjs:164–166` pins CSP bypass; `tests/unit/browser-workers.test.mjs:133–145` aligns render-heavy classifications; `tests/unit/test-groups.test.mjs:192–288,392–428` checks discovery/config; `tests/helpers/live-reporter.js:13` names reporter wiring. These locations were searched as text, not treated as full-file reads or test results.

## Git, MCP and deployment metadata

| File / range | Contract / consumer |
|---|---|
| `.gitattributes:1–20` | Only docs/notes/CEILING-HISTORY.md receives built-in union merge. Comments explain append-only journals must preserve both additions; never apply union to JSON or order/comma-sensitive lists. tools/check/merge-hygiene.mjs:16 cites this policy. |
| `.gitignore:1–68` | Shared skills/agents/hooks/rules/settings/memory explicitly survive broad .claude exclusions. Ignores dependencies, scratch/artifacts, published galleries/shots, live status, screenshot runs, MCP browser profile, transient underscore tools, backups/worktrees, pack source, Python caches, staged desktop/mobile bundles/reports, Obsidian settings and local protection overrides. Comments document prior generated-image/cache incidents, explaining ownership and storage boundaries. |
| `.worktreeinclude:1–7` | Worktree-copy policy names .env and .env.local only; node_modules is deliberately not copied, and the driver symlinks it. Comment forbids production secrets. Only this tracked policy was read; neither named environment file nor any secret content was accessed. |
| `.nojekyll` | Empty tracked Pages marker: static tree publishes verbatim without Jekyll processing. `.github/workflows/pages.yml:333`, tools/desktop/stage-files.mjs:24 and tests/unit/net-trystero-api.test.mjs:92–96 document/consume its presence. |
| `.mcp.json:1–83` | Six stdio server launch definitions: apex-tools, playwright-official, chrome-devtools, js-debugger, apex-lsp, browserstack. All route through bash tools/mcp/output-level-mcp.sh with --server identity and then the relevant shell wrapper. apex-tools alone declares timeout 900000. This is attachment configuration, not proof any session transport is connected. No credential literals/env/header blocks appear in this file. |

MCP wrapper targets: apex-tools-mcp.sh serve (`3–16`); playwright-mcp.sh run (`17–29`); chrome-devtools-mcp.sh run (`30–42`); js-debugger-mcp.sh serve (`43–55`); lsp-mcp.sh serve (`56–68`); browserstack-mcp.sh run (`69–81`). Catalog ownership is mirrored to .cursor/mcp.json and .codex/config.toml: tests/unit/agent-surface.test.mjs:83–93,197–208 and agent-config.test.mjs:133–161 pin consistency/credential policy. Cursor allowlisting is checked by environment-json.test.mjs:266–298; output-level registration is consumed by gen-output-surface.mjs:66, mcp-listing-cost.mjs:117 and chat-gateway.mjs:17. Old comments naming three/four attached servers occur in legacy/manual source; the six actual definitions here are the snapshot truth.

## Verification limits

Pass: every scoped tracked root file read completely, ledger records byte hash and exact ranges, non-runtime command/config consumers traced by source text, empty marker accounted for. Skip: all tests, project CLIs, browser/runtime probes, deployment/CI/remote status and secret/environment access per task scope. Historical measurements and run links are documentation evidence only; no fresh functional or performance verdict is claimed.
