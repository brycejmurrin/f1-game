# Apex 26 dev tools

Headless Node scripts for verifying and inspecting the game without a browser
window. Most pair with a **skill** in `.claude/skills/` (which explains when/how
to use them) — this index is the quick map. Run from the repo root. Disposable output never goes to `/tmp`: use `artifacts/tmp/` for batch logs/probes and `scratch/` for human-reviewed captures, renders, and profiles.

| Tool | Does | Paired skill |
|---|---|---|
| **verify-track.cjs** | Headless build guard — loads the track defs + engine in a VM (file list from `manifest.cjs` `TRACK_VM`), runs `buildRoad/Terrain/Props/Gate`, fails on any THROW. `verify-track.cjs <id>` or `--all`. The fast pre-push check for any `js/circuits/*` or `js/track/*` edit. | debug-tracks |
| **ssr-probe.mjs** | Captures the wet-road screen-space reflection and reports why it looks as it does — the SSR counterpart to the lighting probes. | webgl-debug |
| **manifest.cjs** | The **load-order single source of truth** — every `js/` file in dependency order, `HARD_EDGES` (eval-time load dependencies), and `TRACK_VM` (the subset verify-track/VM tests load). `index.html` script tags must match it; `tests/load-order.test.mjs` (`npm run test:tooling`) asserts they do. Adding a file = script tag + manifest entry. | check-changes |
| **extract-module.mjs** | Assists further `game.js` extractions — moves a block into a new `js/game/` module with the `Module.create(G)` boilerplate and updates the manifest + script tags. | — |
| **apex-eval.mjs** | Boot the game headless, evaluate one `__apex` expression, print JSON. `apex-eval.mjs '__apex.corners()'`. | playwright-probe |
| **apex-capture.mjs** | Parallel headless screenshot capture across cameras/tracks/modes for visual validation. Default output lives under `scratch/captures/apex-capture/<purpose>/`. | playwright-probe |
| **motion-capture.mjs** | Capture RENDERED MOTION (screenshots can't — headless rAF is frozen at 0 fps). Records a driven clip via `recordVideo` (which ticks the loop), extracts frames, scores per-frame flicker. For temporal artifacts (z-fight/clipping flicker, shadow crawl, pop-in) and A/B-verifying a renderer fix. Default output: `scratch/captures/motion-capture/<track>/`. `motion-capture.mjs <track> [sec] [speed]`. | motion-capture |
| **survey-track.mjs** | One-command circuit survey — self-boots the game and emits screenshots (aerial + orbit + driver's-eye per spot → `scratch/captures/survey-track/<id>/`) **and** a lateral ground-profile probe table with auto-flagged holes/steps. `survey-track.mjs <id> [label] [fracs]`. | survey-track |
| **carshot.mjs** | Cropped studio-orbit car JPEG (+ paint report). Self-boots. `carshot.mjs [az] [tod] [teamIdx] [outPath]` → `artifacts/tmp/carshot.jpg`. | playwright-probe / car-viewer |
| **check-bank.mjs**, **check-grip.mjs**, **check-roadfollow.mjs**, **check-steer.mjs** | Physics stability probes — verify no-NaN / forward-motion / banking grip / steering authority via the headless loop. | tune-physics |
| **audio-test.cjs** | Objective engine-audio pitch test (we can't listen headless). | audio-debug |
| **bake-elevation.mjs** | Offline elevation baker — precompute per-track elevation profiles. | new-track |
| **gltf-selftest.mjs** | Self-test for the `js/render/gltf.js` GLB loader (Node ESM, no deps). | webgl-debug |
| **quick-validate.mjs** | Fast refactor gate — boots the game headless ONCE and probes critical paths (page loads clean, `__apex`/globals exist, race starts, physics steps, telemetry/lighting respond) in ~30-60 s, no test-runner overhead. `quick-validate.mjs [port]`. | — |
| **aerial-survey.mjs** | Top-down + high-oblique aerial survey of ONE circuit — spots floor gaps, floating models, terrain holes, props off the ground. `TRACK=monaco PORT=3510 aerial-survey.mjs [label]` → `scratch/captures/aerial-survey/<track>/`. | survey-track |
| **measure-props-over-road.mjs** | Measures prop geometry on/above the racing line; JSON report, `--shots` writes PNGs to `artifacts/tmp/`. `TRACK=redbull PORT=3471 measure-props-over-road.mjs [--shots]`. | scenery-dress |
| **ab-lighting.mjs** | A/B harness for every tunable lighting constant — renders each knob twice (committed vs swapped value, in-memory), gates on whether the swap changes the frame. `ab:light` npm script; out → `scratch/captures/ab-lighting/`. | lighting-tuner |
| **carview.html** | Standalone, isolated car "photo studio" (no track / no game.js) — procedural Car3D + LiveryTex on a studio backdrop via GLX. URL params or mouse/keys; headless API `window.CARVIEW`. | car-viewer |
| **render-car.mjs** | Headless batch renderer for `carview.html` — screenshots preset orbit angles with studio lighting, writes frames + an HTML contact sheet to `scratch/renders/cars/<team>/`. `render-car.mjs [--views=a,b,c]`. Needs a server on :3456. | car-viewer |
| **audit-parts.mjs** | Renders EVERY option of chosen part categories through `carview.html` (one page load) at the best view for each; per-category contact sheets → `scratch/renders/parts/<category>/`. `audit-parts.mjs [--cats=brakes,gearbox,ers] [--team=mclaren]`. | car-viewer |
| **audit-aero.mjs** | Renders EVERY aero option from 3 wing views into one comparison sheet → `scratch/renders/aero/`. `audit-aero.mjs [--team=mclaren]`. | car-viewer |

### Test runner & coverage

| Tool | Does |
|---|---|
| **run-playwright.mjs** | The engine behind every `npm run test:*` — allocates a free port and port-suffixed report/artifact paths so independent test runs never share or tear down each other's web server. Forwards args to Playwright. |
| **pick-tests.mjs** | *"What do I actually have to run for THIS change?"* (`npm run test:pick`) — maps changed files to the `test:<group>` scripts that exercise them and prints a ready-to-paste command. The whole suite is ~40 minutes of software rendering; running nothing is how a regression ships. Rules live in `RULES` at the top and are deliberately biased toward running too much. `--staged`, `--since <ref>`, explicit paths, `--bg`. |
| **test-bg.mjs** | Starts test groups in the BACKGROUND and hands back a log to tail (`npm run test:bg -- smoke api`). Returns as soon as the children are up, so the terminal stays yours. `--status` (what is running / how it ended), `--wait`, `--stop`, `--tail <group>`. Each group gets its own free port, report dir and `artifacts/logs/<group>.log`. |
| **test-coverage-audit.mjs** | Coverage guard (`npm run test:audit`) — every `tests/*.spec.js`, `*.test.mjs` and `*.test.cjs` must be reachable from at least one topical `test:<group>` npm script, so a pre-push group run can't silently skip a test. Exit 1 if any is orphaned. |
| **layout-audit.mjs** | Every screen crossed with every viewport shape, MEASURED rather than eyeballed — a layout bug here is a bug in a CELL of that matrix, not in a screen. Reports what escapes its clipper, what no scroll can reach, what is under WCAG's 24px, what scrolls sideways. Writes `artifacts/layout-audit/{audit.json,index.html}`; `--shots` adds a PNG per cell, and `--screens=`/`--viewports=` top the grid up rather than replacing it. See docs/LAYOUT-AUDIT.md. |
| **test-shards.sh** | Runs whole npm test groups concurrently, one port + log per group, with a pass/fail summary — the BLOCKING counterpart to `test-bg.mjs`. `tools/test-shards.sh smoke api collision`; `WORKERS=N` sets workers per group. |

| **career-economy.mjs** | Measures the CAREER economy against the catalog it buys from — sims a season per starting team through the real `Career.settleRound()` and reports how many median parts a year's income actually affords. `RESEARCH_MULT` is the one knob; re-measure after changing it. Exists because `QUALI_TRIM` shipped as a reasoned guess and was 27% wrong, and the economy is the same class of number. `--years N` follows the arc. | — |
| **agent.mjs** | The agent toolbelt as a CLI — boots the game headless and calls one agent-view surface (`world`/`track`/`scene`/`rollout`/`help`) with the staging done correctly. `agent.mjs <track> <cmd> [flags]`. | agent-view |
| **import-models.mjs** | Batch glTF → AX26 model importer. Separate from `assets.mjs bake-model`, which takes one local `.glb` through the game's own `js/render/gltf.js`: real CC0 model PACKS are directories of `.gltf` + sidecar `.bin` + textures, so this repacks them. Gated by `tests/import-models.test.mjs`. | — |
| **assets.mjs** | Asset bake CLI (AUTHOR-TIME ONLY — never loaded by the game). `bake-synthetic` rebuilds `assets/pack` with no network or deps; `verify` checks the licence allow-list, md5s and size budget. | — |
| **float-audit.cjs** | Exhaustive FLOATING-scenery detector — wraps `TrackGeom`'s emitters to record every primitive, then reports props hanging above (or buried under) the ground. `--all` sweeps the fleet. | survey-track |
| **clip-audit.cjs** | PROP-VS-PROP interpenetration detector — the third axis after road (`rejBox`) and ground (float-audit). Uses emission-order adjacency to tell "one assembly" from "two models fighting". Gated by `tests/prop-clipping.test.mjs` against `clip-baseline.json`. | scenery-dress |
| **clip-baseline.json** | The per-circuit interpenetration caps clip-audit's `--gate` and `tests/prop-clipping.test.mjs` both read, so the tool and the test can never disagree. | — |
| **coplanar-audit.cjs** | Z-FIGHTING detector — SAME-FACING coplanar faces (`dot(nA,nB) ≥ 0.999`), the configuration where both faces draw and both write depth. Deliberately not a flag on clip-audit, whose `DEPTH_MIN = 0.5` discards exactly this bucket and whose `ADJ = 8` adjacency filter excuses exactly the defect. Severity is a DISTANCE — the range beyond which the gap collapses to one depth unit — so it re-derives itself if the near/far planes move. `--why` attributes to file:line (aggregated across `--all`, so a shared emitter's reach shows as one row), `--raw` dumps stacks + extents. | scenery-dress |
| **coplanar-baseline.json** | The per-circuit same-facing-coplanar spot counts `coplanar-audit --gate` ratchets against, so the count can fall but never grow. | — |
| **graph-parity.cjs** | The gate for the scenery scene-graph migration — builds every circuit TWICE (a baseline git ref via `git archive`, and the working tree) and diffs the prop geometry vertex for vertex, then reports per-emitter instancing reuse. `BASE=<ref> graph-parity.cjs --all` / `npm run test:graph-parity`. | scenery-dress |
| **track-build-vm.cjs** | The shared "run the REAL track build headless in a Node VM" harness, extracted from float-audit so the audits and VM tests load the engine one way. | — |
| **harness.mjs** | Shared process harness for the headless `__apex` tools — in-process static server + Chromium launch, so each tool doesn't reinvent port/browser handling. | playwright-probe |
| **track-sweep.mjs** | Parallel DATA sweep across circuits (JSON, no screenshots) — the numbers counterpart to `apex-capture.mjs`. | debug-tracks |
| **shot-sweep.mjs** | Parallel, LOGGED screenshot sweep. | playwright-probe |
| **chase-shots.mjs** | N chase-camera screenshots evenly spaced around a lap. | playwright-probe |
| **profile-gameloop.mjs** | Headless V8 CPU profile of the game loop → a `.cpuprofile` for Chrome DevTools. | perf-profile |
| **menu-fit.mjs** | Audits every menu screen for cramped/clipped layout at a given viewport. | — |
| **ui-scale-axis.mjs** | The `--scale=` axis the three fit tools above share. The player can size the interface 80–150 % (SETTINGS ▸ DISPLAY), so "does this screen fit?" is one question per size, not one question — this turns each tool's screen × viewport matrix into screen × viewport × scale. Library, not a command. | — |
| **track-accuracy-validator.mjs** | Shape-error maths (`MAX_SHAPE_ERROR`, `signedArea`, …) shared by the circuit-accuracy tests. | new-track |
| **refresh-f1-circuit-reference.mjs** | Explicit maintenance tool that refreshes the offline F1 circuit reference data. Tests never call it and never touch the network. | new-track |
| **import-circuit-path.mjs** | Projects a `bacinger/f1-circuits` (ODbL) GeoJSON feature into a `CircuitPaths` entry for `js/track/geo-paths.js`; `--self-check` regenerates the committed traces and diffs them so the projection can't silently drift. | new-track |
| **fixture-consumer-audit.mjs** | RATCHET on `tests/fixtures.js` adoption: counts specs importing it, fails if the count drops, and pins the four load-bearing consumers. Raise its `FLOOR` when you migrate specs; never lower it. | — |
| **output-paths.mjs** | Path-containment helpers enforcing the `artifacts/` vs `scratch/` output contract; `tests/output-paths.spec.js` gates it. | — |
| **lighting-campaign/** | Batch lighting-sweep runner + its captures, driven by `tests/lighting-campaign.test.mjs`. | lighting-tuner |

## Conventions

- **The capture tools are a family, not duplicates.** They keep getting flagged
  as redundant, so: `apex-capture.mjs` is the canonical parallel sweep
  (cameras/modes/tracks/identity/lap-tour); `shot-sweep.mjs` is the same shape
  but LOGGED per step with a self-check on eye-to-car distance, for when a sweep
  looks hung; `chase-shots.mjs` drives the real in-game CHASE camera rather than
  the debug free-cam; `track-sweep.mjs` emits JSON and no images at all;
  `carshot.mjs` is the ~5 KB cropped studio probe and `render-car.mjs` the full
  contact sheet. Four tools that WERE redundant — `shot-car.mjs`,
  `photoshoot.mjs`, `fit-audit.mjs` and the one-shot `migrate-output-layout.mjs`
  — were deleted rather than merged. `menu-fit.mjs` survives `layout-audit.mjs`
  only because of `--safe=` notch-inset simulation, which headless Chromium
  cannot otherwise produce (it reports every `env(safe-area-inset-*)` as 0).
- **Surveying a track:** `survey-track.mjs <id>` is the one-stop pass (shots +
  flagged probe). For a one-off framed shot use `.claude/skills/playwright-probe/shot.mjs`;
  for a parallel multi-track screenshot sweep use `apex-capture.mjs`; for a quick
  numbers-only terrain re-probe use `.claude/skills/survey-track/ground-profile.mjs`.
- **Chromium:** prefer `CHROME` / `PW_CHROMIUM`, then `/opt/pw-browsers/...`
  when present; otherwise Playwright's bundled browser. Servers bind a free
  port (or `:3456`).
- Anything that edits `js/*`/`css/*` still needs a `?v=N` cache bump (bump-cache).
- Never write disposable output to `/tmp`; use `artifacts/tmp/` or the standard `scratch/` subtrees.
- `rtc-e2e.mjs` — a REAL WebRTC handshake between two pages (`npm run rtc:e2e`).
- `rtc-e2e-3p.mjs` — THREE real WebRTC peers in one room, which is the only
  thing that can test the multi-peer path: the loopback transport has no SDP
  and the lobby specs use a fake one, so `test:net` cannot see it. Checks that
  a second invite does not drop the first guest, and that guest B can see
  guest C — which is only possible via the host relay. Run by hand
  (`npm run rtc:e2e-3p`, or `rtc:e2e-3p-relay` to force every pair through
  TURN — the leg a developer never exercises and a phone behind
  carrier-grade NAT always does).
- `nostr-local.cjs` — a Nostr relay on localhost, so the ROOM CODE path can be
  tested without depending on somebody else's server. The smallest relay
  Trystero needs (ephemeral events, `since: now()`, live fan-out only). Needs
  `npm i --no-save ws`. `--reject` makes it a HOSTILE relay — every publish
  comes back `["OK", id, false, "blocked: …"]`, as a real spam policy does —
  and `--reject-after=N` accepts N first, which is the shape of a rate limit
  rather than a ban. Without that mode the code that DETECTS a refusal had no
  test at all, because the only relay we can run accepted everything; and a
  refusal is invisible from outside, since Trystero turns it into a
  `console.warn` while the socket stays open.
- `rtc-e2e-room.mjs` — drives the ROOM CODE path end to end against that relay
  (`--peers=3` for three). The only test of `exchange()` there is: the loopback
  has no SDP and the lobby specs use a fake transport, so four regressions
  shipped through that gap before this existed. Against a relay we run, a
  failure is ours by construction rather than somebody's server having a bad
  day. Needs `tools/nostr-local.cjs` running. `--delay=SECONDS` makes the host
  sit on its offer before any guest joins, which is what a human carrying a
  six-character code across a room actually does — the harness otherwise joins
  within a second of hosting and cannot model it. (Measured: 45 s still
  connects, so offer staleness is NOT what breaks room codes on real
  hardware.)
- `nostr-probe.mjs` — which public relays will actually CARRY our signalling.
  Publishes what the game publishes (ephemeral kind-22xxx, freshly generated
  key) to each candidate and records the NIP-01 verdict. This is the only
  criterion that decides whether room codes work: relays increasingly refuse
  anonymous ephemeral events, and all six of the shipped list pass
  reachability, popularity and uptime while room codes still fail. The list has
  been changed three times on reasoning; change it on this instead. Prints a
  paste-ready `RELAYS` block and exits non-zero if nothing accepts. Needs
  `npm i --no-save ws @noble/curves`.
- `turn-local.cjs` — a TURN server on localhost, which is what makes that relay
  mode testable at all: on one machine ICE forms a direct pair instantly and
  TURN is never touched. Needs `npm i --no-save node-turn` — a test fixture,
  deliberately not a dependency. See its header for a known, unattributed drop.
  Covers the one path nothing else can: the loopback transport has no SDP, and
  the lobby spec uses a fake transport because a real `RTCPeerConnection` never
  finishes ICE gathering in a sandboxed CI browser. Deliberately outside every
  test group — it takes minutes and depends on the host's network stack. Run it
  by hand after touching `js/net/handshake.js` or `js/net/transport.js`.
