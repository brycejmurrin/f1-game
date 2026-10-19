#!/usr/bin/env node
// @doc Full structural floor or `--changed` diff-aware edit-loop runner; timing, buffered output, `--jobs=N`; exports the list.
// @section runner
/**
 * tooling-fast.mjs — run the structural unit suites with per-file progress.
 *
 * `npm run test:tooling-fast` used to dump ~80 files into one `node --test`
 * invocation, which parallelises by default and floods the terminal. This
 * runner owns the scheduling instead, and BUFFERS each file's output to emit it
 * whole on completion. The buffering is what made the log readable; running one
 * file at a time was never the part that fixed it.
 *
 * So `--jobs=N` runs N files at once and the log reads exactly as before: one
 * START and one PASS/FAIL per file, each with its own index and duration.
 * DEFAULT 1, so every existing caller is byte-identical; local runs pass --jobs=3
 * (AGENTS.md rule 4: a CPU-wide default is the box load that times runs out).
 *
 * WHY, measured here: the serial suite is ~230 s and the deploy pays it once per
 * push ATTEMPT. With five or six agent sessions landing on the deploy branch at
 * a median gap of 165 s, a 230 s window loses the race often — two of one
 * session's deploys were rejected once each and paid a full re-verify. Shrinking
 * the window shrinks the race for EVERY attempt, and it is the only lever left:
 * deploy.mjs cannot narrow a shipped-code retry, because pick-tests maps any
 * js/ or css/ edit to the whole tooling-fast group (see its RULES).
 *
 *   node tools/ci/tooling-fast.mjs                  # full suite, serial
 *   node tools/ci/tooling-fast.mjs --changed        # vs origin/<deploy>: affected files only
 *   node tools/ci/tooling-fast.mjs --jobs=3         # …three at a time
 *   node tools/ci/tooling-fast.mjs --stop           # stop the registered run's whole process tree (artifacts/run/tooling-fast.json); never pkill -f / a PID kill
 *   node tools/ci/tooling-fast.mjs --bail           # stop STARTING files after the first failure (CI guard shards)
 *   node tools/ci/tooling-fast.mjs tests/unit/x…    # subset (same logging)
 *   … --order=list                                   # list order, not longest-first
 *   … --record                                       # rewrite tests/data/tooling-fast-timings.json
 *   … --test-timeout=S --file-timeout=S              # per-test / per-file bounds (seconds)
 *
 * `--jobs=N`, never `--jobs N`: a flag whose value is a bare positional gets
 * swallowed into the file list by the `!a.startsWith("--")` filter below. This
 * repo has shipped that bug once already — tools/ci/pick-tests.mjs documents
 * `--since HEAD~3` being read as a changed FILE. The `=` form cannot do it.
 *
 * The file list is the source of truth for coverage (test-coverage-audit
 * imports TOOLING_FAST_FILES). Keep package.json as `node tools/ci/tooling-fast.mjs`.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { augmentNodeCompileCache } = require("../lib/node-compile-cache.cjs");
import { changedPaths } from "../lib/changed-files.mjs";
import { loadGroups } from "../gen/gen-test-groups.mjs";
import { workTreeId } from "../lib/work-tree-id.mjs";
import { DEPLOY_BRANCH, selectionReceipt } from "./pick-tests.mjs";
import { TRACKED, circuitsTouched, isDocsOnly } from "./select-specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOGDIR = path.join(ROOT, "artifacts/logs");
// NOT "tooling-fast.log": that is the path tools/ci/test-bg.mjs gives the
// tooling-fast GROUP log, and writing the suite summary there truncated the
// group's START header out from under the child's appends.
const LOGFILE = path.join(LOGDIR, "tooling-fast-suite.log");

/** @type {readonly string[]} */
export const TOOLING_FAST_FILES = Object.freeze([
  // @gen-test-groups:begin — generated from tests/groups.json; do not hand-edit
  // The 2026-09-27 a11y/PWA pass: pad choice, landscape lock, CAM label in
  // name, manifest display_override. VM-executed
  // source, no browser, ~0.2 s.
  // Round-2 (2026-10-10): visible text is contained in every control's accessible name (WCAG 2.5.3); static shell scan.
  "tests/unit/a11y-label-in-name.test.mjs",
  // Flyby skip hint (#ld-card::after): dark plate holds WCAG over bright sky (#1896).
  "tests/unit/a11y-loading-hint.test.mjs",
  // SETTINGS › ACCESSIBILITY: reduce motion Auto/On/Off, high focus ring,
  // colourblind S/M/H/I/W cues. VM + shell pins, < 0.2 s.
  "tests/unit/a11y-opts.test.mjs",
  "tests/unit/a11y-pwa-pass.test.mjs",
  // 2026 aero defaults for catalog options that omit beam/drs/board (item 4).
  "tests/unit/aero-defaults-2026.test.mjs",
  "tests/unit/aero-flap-travel.test.mjs",
  "tests/unit/aero-zone-tables.test.mjs",
  "tests/unit/aero-zones-turns.test.mjs",
  // Host configs — the three MCP catalogs, Claude rules → Cursor .mdc via
  // gen-cursor-rules, the hooks — asserted instead of described; under a second.
  "tests/unit/agent-config.test.mjs",
  // The orchestrator/worker contract (skill agent-fleet): host-correct PR
  // subscribe tools, one fleet block, the mandated launch fields. < 0.1 s.
  "tests/unit/agent-fleet.test.mjs",
  // Generated agent index, hook page, coverage page and per-hook help. No browser.
  "tests/unit/agent-indexes.test.mjs",
  "tests/unit/agent-surface.test.mjs",
  "tests/unit/ai-band.test.mjs",
  "tests/unit/ai-corridor.test.mjs",
  "tests/unit/ai-drive.test.mjs",
  // Pass-completion: passHunger / coverConcede / tow+fire+latch extras. Permanent
  // only; streets stay at the prior baselines. No VM. < 0.1 s.
  "tests/unit/ai-pass-complete.test.mjs",
  // Pure Pearson / style-zero-mean helpers for ai-ratings.mjs — the personality
  // dial census. No VM. Failing-first pin: craft-cluster |r| is still >0.85.
  "tests/unit/ai-ratings-math.test.mjs",
  // ...and the field's strategy: the plan scales with the distance, a 20-car
  // grid does not converge on one plan, strategies mix, and the reactive
  // rules (free stop, weather, spent set) fire in the right order. ~0.1 s.
  "tests/unit/ai-strategy.test.mjs",
  "tests/unit/albert-park-foundation.test.mjs",
  "tests/unit/all-lights-fill.test.mjs",
  // The pack's wildcard environment fills in only what the palette did not author;
  // an exact <track>|<tod> key still overrides. VM-executed atmosphere.js, ~0.1 s.
  "tests/unit/always-lamp-floor.test.mjs",
  "tests/unit/ambient-env-override.test.mjs",
  // The PRE-RACE ANNOUNCER: the derived script, and the Daniel-first voice
  // ladder on the platforms that do not have Daniel.
  "tests/unit/announcer.test.mjs",
  "tests/unit/apca-timing.test.mjs",
  "tests/unit/apex-arg-guards.test.mjs",
  "tests/unit/apex-career-delete.test.mjs",
  // Cross-host .claude/memory CLI (list/show/retire); no assume-unchanged.
  "tests/unit/apex-memory.test.mjs",
  "tests/unit/apex-server-fixes.test.mjs",
  "tests/unit/apex-tools-mcp.test.mjs",
  "tests/unit/appearance-opts.test.mjs",
  "tests/unit/appearance-studio.test.mjs",
  // Sunlight/Broadcast Appearance chrome: preset label wrap, selected ring,
  // theme-stable art, light --gold, light .sheet-foot (css pins).
  "tests/unit/appearance-sunlight-chrome.test.mjs",
  // Every AUTHORED activation-zone turn table resolves against the BUILT
  // centreline. One unresolvable pair discards a circuit's whole table and
  // falls through to ZONE_COUNT — silently, which is how monza shipped a
  // table nobody read. Node-side via verify-track.cjs, so it is cheap.
  "tests/unit/assert-audit.test.mjs",
  "tests/unit/assets-pack.test.mjs",
  "tests/unit/audio-mix-improvements.test.mjs",
  // Round-2: MUSIC OFF never decodes the menu track (setMusic before setSound) and rows changed before the race bundle lands reach the store, not the stub.
  "tests/unit/audio-panel-boot.test.mjs",
  "tests/unit/audio-recovery.test.mjs",
  "tests/unit/audio-sample-upgrade.test.mjs",
  "tests/unit/audio-tune.test.mjs",
  "tests/unit/audit-circuit.test.mjs",
  "tests/unit/backend-surface-parity.test.mjs",
  "tests/unit/badges.test.mjs",
  "tests/unit/bahrain-grandstand-rake.test.mjs",
  // A pack model placed N times is ONE instanced batch when the backend draws
  // batches (TrackGraph.meshModel/meshPlace); the VM sweeps keep the copies.
  // Four Monza builds with the batch API injected, ~15 s.
  "tests/unit/baked-model-instancing.test.mjs",
  "tests/unit/baked-model-road-guard.test.mjs",
  "tests/unit/baku-migration.test.mjs",
  // Barrier run-off lateral teleports (ledger 2026-09-26): synthetic cliff / featherBarrierEnds + fleet caps (monza/spa/bahrain/silverstone/monaco maxOver < 3). Pure helper + a few track-build-vm builds, ~6 s.
  "tests/unit/barrier-runoff-jumps.test.mjs",
  "tests/unit/base-green.test.mjs",
  "tests/unit/bash-guard-hardening.test.mjs",
  "tests/unit/battle-earcon.test.mjs",
  "tests/unit/behind-ship.test.mjs",
  // BitmapDecode worker (js/workers/*): Blob to ImageBitmap off the page thread.
  "tests/unit/bitmap-decode-worker.test.mjs",
  "tests/unit/blip-voice-pool.test.mjs",
  // Pure-VM physics/career suites added 2026-09-22 (the coverage census's
  // zero-reference module and the two thin spots): each under a second.
  "tests/unit/body-attitude.test.mjs",
  "tests/unit/body-split.test.mjs",
  // ...and the DIFF[difficulty] family, one door further out: three readers
  // that took a stored index or object on trust. Executes the shipped source
  // (idxOr, loadCustomTeam, DebrisWorld.reset), no browser. Well under a second.
  "tests/unit/boot-idle-prefetch.test.mjs",
  "tests/unit/boot-input-shape.test.mjs",
  "tests/unit/bootstrap-doctor.test.mjs",
  "tests/unit/brake-cue.test.mjs",
  // ...and the branch audit it deletes by: ancestry, the merge-tree dry merge
  // and line presence, pinned against real git in a throwaway repo. ~1 s.
  "tests/unit/branch-audit.test.mjs",
  // Phone browser MCP over streamable HTTP (token gate + tools/list) and the
  // reuse/start decision for its public tunnel. Pure Node, no Chromium.
  "tests/unit/browser-http-mcp.test.mjs",
  "tests/unit/browser-http-up.test.mjs",
  // GL-aware capture / remote-group worker defaults (llvmpipe vs SwiftShader).
  "tests/unit/browser-workers.test.mjs",
  "tests/unit/build-client-drop.test.mjs",
  "tests/unit/build-gallery.test.mjs",
  "tests/unit/cam-avoid.test.mjs",
  "tests/unit/cam-comfort.test.mjs",
  "tests/unit/cam-motion.test.mjs",
  // Round-2 camera: corridor-clamped hang, wall clamp on street circuits, look-free director/PiP, NaN hold, bend hysteresis, frame-rate-free drone; 30/60/144 Hz sweep.
  "tests/unit/cam-round2.test.mjs",
  "tests/unit/camera-defaults.test.mjs",
  "tests/unit/camera-feel.test.mjs",
  "tests/unit/camera-ride.test.mjs",
  "tests/unit/camera-tuner-a11y.test.mjs",
  "tests/unit/captions.test.mjs",
  "tests/unit/capture-tools-regressions.test.mjs",
  // ~22 s, the slowest entry here, and deliberately in THIS list rather than
  // test:sweeps: sweeps is skipped by ci.yml when a push cannot move circuit
  // geometry, and a parts-mesh regression is exactly the kind that would then
  // sail through. tooling-fast runs unconditionally in the deploy gate, which is
  // the whole point — the front-wing assertion this file ports sat red on the
  // deploy tip through five consecutive green Pages runs because the browser
  // group that held it is not gated at all.
  // car-fx.js (plank sparks, AI lock-up marks) + the particle pool's scrape /
  // flare / spray-plume discipline, in a VM with seeded Math.random; ~0.2 s.
  // Round-2: decal LRU trims by bytes, the hi-res grave is reaped on the garage path, failed hi-res builds stop retrying.
  "tests/unit/car-draw-decal-budget.test.mjs",
  "tests/unit/car-fx.test.mjs",
  "tests/unit/car-materials.test.mjs",
  "tests/unit/car-mesh-anchors.test.mjs",
  "tests/unit/car-mesh-crew-cache.test.mjs",
  "tests/unit/car-multi-shot-tools.test.mjs",
  "tests/unit/car-presentation-canary.test.mjs",
  "tests/unit/car-shade.test.mjs",
  "tests/unit/car-wing-foil.test.mjs",
  "tests/unit/career-ai-dev.test.mjs",
  "tests/unit/career-backup.test.mjs",
  "tests/unit/career-data-audio-improvements.test.mjs",
  // js/career/*.js never consumes simRnd and uses Math.random only at two allowlisted non-draw sites; source scan, < 50 ms.
  "tests/unit/career-determinism.test.mjs",
  "tests/unit/career-experience.test.mjs",
  "tests/unit/career-hire-rating.test.mjs",
  "tests/unit/career-legends.test.mjs",
  "tests/unit/career-regulations.test.mjs",
  // Round-2 (2026-10-10) career: the save carries its calendar (calIds), beatRival offers sign the rival they show, weakerSeat before the team moves, no re-hire of the sitting hire, rep before market value, podium p>0, NEW CAREER number 1, null-team slots.
  "tests/unit/career-round2.test.mjs",
  "tests/unit/career-seat-rollover.test.mjs",
  "tests/unit/career-settle.test.mjs",
  "tests/unit/career-ui-lazy.test.mjs",
  "tests/unit/carve-a-modules.test.mjs",
  "tests/unit/catalog-discovery.test.mjs",
  "tests/unit/cdmcp-measure.test.mjs",
  // gpu-census.yml's real-GPU Verdict as functions (tools/gfx/census-verdict.mjs)
  // plus its plan gate (nightly skip, push request) executed on a scratch repo; < 1 s.
  "tests/unit/census-verdict.test.mjs",
  "tests/unit/centreline-kinks.test.mjs",
  "tests/unit/change-driver-tools.test.mjs",
  "tests/unit/change-kind.test.mjs",
  "tests/unit/changed-files.test.mjs",
  "tests/unit/changelog-fragments.test.mjs",
  // Opt-in checkJs: files marked // @ts-check type-check clean under tsc (~0.5 s).
  "tests/unit/check-js-types.test.mjs",
  "tests/unit/chrome-server-fixes.test.mjs",
  // resolveChromium finds Playwright's headless shell when the full archive
  // was never unpacked — the cloud-agent / MCP bootstrap path.
  "tests/unit/chromium-shell.test.mjs",
  "tests/unit/chunked-index-ranges.test.mjs",
  "tests/unit/ci-coverage.test.mjs",
  // CI guards born 2026-10-15: ci-rerun.mjs refuses a superseded/live/green/re-run run; ci-cancel-on-close.yml joins ci.yml's PR group. Pure, no network or browser.
  "tests/unit/ci-guard-tools.test.mjs",
  "tests/unit/ci-pr-base.test.mjs",
  "tests/unit/ci-verdict.test.mjs",
  "tests/unit/ci-watch.test.mjs",
  "tests/unit/circuit-axis.test.mjs",
  "tests/unit/circuit-corner-anchors.test.mjs",
  // Round-2: manifest.json / meta description circuit counts pinned to Tracks.LIST.
  "tests/unit/circuit-count-shell.test.mjs",
  "tests/unit/circuit-def-fields.test.mjs",
  "tests/unit/circuit-meta.test.mjs",
  "tests/unit/circuit-scope.test.mjs",
  // ...and the same question one level down: a def may name a tree species or
  // a grandstand livery the engine has no entry for, and every lookup has a
  // fallback, so the circuit renders as something else in silence. ~0.2 s.
  "tests/unit/circuit-vocab.test.mjs",
  // ...and the fourth: the component inventory only ever guarded DEFINED-
  // but-unapplied. This is the mirror — a class the markup wears that no rule
  // matches, which reads as styled and is not. Pure source scan, ~0.3 s.
  "tests/unit/class-usage.test.mjs",
  // tools/lib/cli-args.mjs: unknown flag is an error with the near miss, =/space forms agree, --help (#1697).
  "tests/unit/cli-args.test.mjs",
  // ApexClipboard.write/read + preferSync order (clipboard carve). Pure VM,
  // well under a second; must run where the helper or a call-site is edited.
  "tests/unit/clipboard.test.mjs",
  // The coach's rewind clone replaced JSON.parse(JSON.stringify()); restore()
  // reads back what capture() wrote, so any drift from JSON semantics is a
  // rewind into a state the car was never in. Tested AGAINST the round trip.
  "tests/unit/coach-clone.test.mjs",
  // Sibling of cockpit-pale-surfaces, which moved to test:node-slow for costing
  // 69 s. This one is 2.5 s — 178 differential builds, no rasteriser — so it
  // stays in the edit loop where a cockpit geometry change is actually made.
  "tests/unit/cockpit-crest-stripe.test.mjs",
  "tests/unit/cockpit-preview.test.mjs",
  // The COCKPIT WHEEL choice: option, meshes per style, draw path, HUD gate.
  "tests/unit/cockpit-wheels.test.mjs",
  "tests/unit/comment-citations.test.mjs",
  // No screenshot outside a *-snapshots/ baseline under tests/, no image over
  // 4 MB outside assets/: a June burst left ~750 MB in history. ~0.1 s.
  "tests/unit/committed-images.test.mjs",
  "tests/unit/component-inventory.test.mjs",
  "tests/unit/conflict-cure.test.mjs",
  "tests/unit/contact-geometry.test.mjs",
  "tests/unit/controller-profiles.test.mjs",
  // coverage-merge is the only consumer of the raw V8 lists a flagged run
  // writes (APEX_JS_COVERAGE=1 / NODE_V8_COVERAGE); a url shape that stops
  // mapping reads as 0 %, not as an error, so its filters are pinned here. ~2 s.
  "tests/unit/coverage-merge.test.mjs",
  "tests/unit/cross-file-paths.test.mjs",
  // cross-tool-guards: Cursor/Codex reach bash-guard through one adapter; .githooks
  // pre-push refuses deploy-branch, delete and rewrite pushes. Real git, ~2 s.
  "tests/unit/cross-tool-guards.test.mjs",
  "tests/unit/css-comments.test.mjs",
  "tests/unit/css-critical-path.test.mjs",
  "tests/unit/css-faces.test.mjs",
  "tests/unit/css-has-scope.test.mjs",
  "tests/unit/css-layers.test.mjs",
  "tests/unit/css-media-disjoint.test.mjs",
  "tests/unit/css-play.test.mjs",
  // Round-2: no @media (prefers-*/pointer/hover/orientation) declaration is dead under the layer cascade (node port of dead_decl.py).
  "tests/unit/css-prefers-cascade.test.mjs",
  "tests/unit/css-token-adoption.test.mjs",
  "tests/unit/css-tokens.test.mjs",
  "tests/unit/curvature-channels.test.mjs",
  // The track designer's registry (js/editor/custom-tracks.js + track-themes.js):
  // stored designs become Tracks.LIST entries through TrackDef.fromRaw, after
  // the 52 and never in SEASON; hostile stored input is repaired or dropped.
  // Runs the TRACK_VM engine over a stub store, ~3 s.
  "tests/unit/custom-tracks.test.mjs",
  // COLOUR VISION palette: off matches today's tokens, Machado + CIEDE2000.
  "tests/unit/cvd-palette.test.mjs",
  // The three suites the feature batches added. Each is pure rules over a
  // store or a source string — no DOM, no rasteriser — so all three together
  // cost under a second and belong where the rule they guard is edited.
  "tests/unit/daily-challenge.test.mjs",
  "tests/unit/damage.test.mjs",
  "tests/unit/data-api-status.test.mjs",
  // Data Hub EXPORT zip: mock OpenF1 → hand-rolled ZIP, CRC-32, empty/fail. ~0.3 s.
  "tests/unit/data-export.test.mjs",
  "tests/unit/data-hub-layout.test.mjs",
  "tests/unit/data-hub-offline.test.mjs",
  // The shared session picker against a late answer (FIFO stub F1API, ~0.1 s).
  "tests/unit/data-hub-picker.test.mjs",
  "tests/unit/data-lazy-loader.test.mjs",
  // The RESULTS tab drives OpenF1's session_result, whose duration and gap
  // change SHAPE with the session type. Pure rules over a stub DOM, ~0.1 s.
  "tests/unit/data-replay-improvements.test.mjs",
  "tests/unit/data-results.test.mjs",
  // The SCHEDULE tab's date and start time from one instant in the viewer's
  // zone (TZ pinned to Los Angeles), and NEXT against the clock. ~0.1 s.
  "tests/unit/data-schedule-tz.test.mjs",
  // The STANDINGS tab: API row order, gap to P1, the head-to-head bar and the
  // empty state, on mini-dom with the real Dom.el. ~0.1 s.
  "tests/unit/data-standings.test.mjs",
  "tests/unit/day-sky-palette-storm-deck.test.mjs",
  "tests/unit/debris-step-skip.test.mjs",
  "tests/unit/debug-chrome.test.mjs",
  "tests/unit/deep-link.test.mjs",
  // ...and a third of the same family: two widgets keyed on ONE sign convention
  // were painted opposite colours. Neither half is wrong alone, so only a test
  // comparing the PAIR can see it. Pure text, well under a second.
  "tests/unit/delta-sign-colour.test.mjs",
  "tests/unit/deploy-pr-rest.test.mjs",
  "tests/unit/deploy-staging-build.test.mjs",
  "tests/unit/deploy-staging.test.mjs",
  // that touches the LUT rather than on every edit.
  // The three raster/spawn-heavy car files (cockpit-pale-surfaces 69 s,
  // crest-marks 41 s, slider-effect 42 s — 48 % of this loop, measured
  // 2026-09-01) run in test:node-slow: CI guards always, locally when
  // pick-tests names it (js/car/ or tools/lighting/slider-effect.mjs).
  "tests/unit/deploy-stamp.test.mjs",
  "tests/unit/deploy-tool.test.mjs",
  // The track designer's drawing surface (js/editor/canvas.js) alone: long-press
  // → onContext, the stamp tool's ghost polyline, the drag / span measurement
  // chip, the wider touch hit radius. Recording 2D context, hand-driven timers.
  "tests/unit/designer-canvas.test.mjs",
  // Headless designer share-code CLI (tools/track/designer-code.mjs): decode via
  // editor-vm + TrackValidate/TrackInsight; exit 1 on corrupt or RED geometry. ~1 s.
  "tests/unit/designer-code-cli.test.mjs",
  // The designer's elevation strip (js/editor/profile.js) alone: tap adds a hill,
  // a grip drag sets height (8 % cap) / place / Shift length and commits once,
  // long-press and Delete remove, data-arrows own/pass, the hill's aria-label.
  "tests/unit/designer-profile.test.mjs",
  // TrackDesignerProps (js/editor/props.js): capped place/remove scenery props; sanitize, caps, place/remove, CustomTracks id, APXT1/APXT2 codec. ~0.3 s.
  "tests/unit/designer-props.test.mjs",
  "tests/unit/desktop-app-protocol.test.mjs",
  "tests/unit/desktop-builder-config.test.mjs",
  "tests/unit/desktop-native.test.mjs",
  "tests/unit/desktop-notices.test.mjs",
  "tests/unit/desktop-pack-dry-run.test.mjs",
  // Electron desktop spike: stage allow-list + stamp, native SW/Spotify gates,
  // app:// Range/MIME/traversal (Electron #38749), unpacked-bin helper,
  // ship-filter staged path list (stage-files.mjs).
  "tests/unit/desktop-stage.test.mjs",
  "tests/unit/desktop-unpacked-bin.test.mjs",
  "tests/unit/desktop-version.test.mjs",
  "tests/unit/destructure-usage.test.mjs",
  // DevFlags: query/hash/storage resolution for boot toggles (js/core/dev-flags.js).
  "tests/unit/dev-flags.test.mjs",
  "tests/unit/diagnostics-tools.test.mjs",
  "tests/unit/digital-steer.test.mjs",
  // Live TV director (js/camera/director.js): pure cut dwell/battles + dbgCam publish without car forces. ~0.05 s.
  "tests/unit/director.test.mjs",
  // Dirty-air wake shapes (js/physics/consts.js DirtyAir): classic linear
  // fade stays bit-compatible; CFD is exp×Gaussian; OFF is identity mul.
  "tests/unit/dirty-air.test.mjs",
  "tests/unit/dock-layout.test.mjs",
  "tests/unit/docs-integrity.test.mjs",
  // Decorrelated DriverRatings.BASE + skill()/overall personality pins.
  "tests/unit/driver-ratings-personality.test.mjs",
  "tests/unit/driving-coach.test.mjs",
  "tests/unit/driving-cues.test.mjs",
  // Droplets lens overlay gates (rain rate, onboard-only, caps, reduced motion, LOW off) + spray scaling / nearest-N. ~0.2 s.
  "tests/unit/droplets-spray.test.mjs",
  // …and the DUEL ROW that reaches it: one control carrying OFF / ON / a
  // named legend has to round-trip through two setters, and the inert VM DOM
  // builds no SettingRow children, so painting the row would assert nothing.
  "tests/unit/duel-row.test.mjs",
  // The duel format's two behaviours (js/race/duel.js): the bump lifts
  // racecraft harder than pace, and asLegend hands over the legend's OWN
  // axes rather than bumping whoever was fastest. Pure module load, ~0.1 s.
  "tests/unit/duel.test.mjs",
  "tests/unit/editor-workspace.test.mjs",
  // ElevPresets (js/editor/elev-presets.js): Flat / Rolling / Hilly → per-node
  // heights[]; sanitize pads missing heights to flat zeros. Pure VM, ~0.05 s.
  "tests/unit/elev-presets.test.mjs",
  "tests/unit/elevation-smoothness.test.mjs",
  "tests/unit/engine-note-quality.test.mjs",
  // Engine rpm for net/replay puppets and finish coast (game.js updateCar early-outs). ~15 s.
  "tests/unit/engine-revs-replay-vm.test.mjs",
  // ...and the race engineer's ladder: it ADVISES and never arms a stop,
  // graining and blistering say different things (one heals, one does not),
  // the axle call names an end of the car, and it does not nag. ~0.1 s.
  "tests/unit/engineer.test.mjs",
  // The Cloud Agent bootstrap contract (.cursor/environment.json). The last docs-guards
  // file tooling-fast lacked (ACTIONS-AUDIT-2026-10-14 finding 5; the workflow retired 2026-10-15), ~0.3 s.
  "tests/unit/environment-json.test.mjs",
  // Job 6: MGU-K electric deploy/harvest + overtake boost cue (fake-audio VM).
  "tests/unit/ers-audio-layer.test.mjs",
  "tests/unit/evaluate-scope-lint.test.mjs",
  // ...and the race radio: every phrasebook line fits its card when spoken,
  // pools deal like a deck, gaps come from the timing loop, a pass must hold,
  // lines wait for the straight and die when stale, commentary only while
  // the player is watching. ~0.1 s.
  "tests/unit/event-journal.test.mjs",
  "tests/unit/extra-rigs.test.mjs",
  "tests/unit/f1-dev-tools.test.mjs",
  "tests/unit/factory-ai-setup.test.mjs",
  // Rival-car distance LOD (js/car/field-lod.js): the table, the shadow-caster
  // gate, the mirror cap and the launch warm. Real shadow/mirror passes in VMs, ~0.1 s.
  "tests/unit/field-lod.test.mjs",
  // The tail DESIGN picks (fin shape / tail style / fin badge / spine logo):
  // Car3D outline maths and the atlas painter, headless, ~0.5 s.
  "tests/unit/fin-design.test.mjs",
  "tests/unit/finish-coast-rev-vm.test.mjs",
  "tests/unit/fixture-consumer-audit.test.mjs",
  "tests/unit/flags.test.mjs",
  // Nightly flake tally (tools/ci/flake-tally.mjs): report.json / live-reporter
  // / junit parsers + exact-name artifact URL shape; fixture-only, < 0.2 s.
  "tests/unit/flake-tally.test.mjs",
  // The flaky policy behind APEX_FAIL_ON_FLAKY=1: quarantine rows are a ledger
  // (spec exists, owner, date, why) and the verdict is pure; < 1 s.
  "tests/unit/flaky-quarantine.test.mjs",
  // fleet-board: the derived `claimed` label, the PR closing-keyword parse and the
  // pinned board body, all pure; < 1 s. It guards the backlog's phone view.
  "tests/unit/fleet-board.test.mjs",
  "tests/unit/fleet-flags.test.mjs",
  // The rendered flicker gate's metric (tools/lib/flicker-metric.mjs) on
  // synthetic frames, plus its site table: ~0.1 s, no browser. The gate itself
  // runs only in ci.yml's non-blocking flicker-gate job.
  "tests/unit/flicker-metric.test.mjs",
  "tests/unit/floodmast-lamp-register.test.mjs",
  // The ORDERING that lights the flyby: raceIntro() applies the race settings
  // before the loading screen starts, so a dawn race stops showing a day sky.
  "tests/unit/flyby-lighting.test.mjs",
  // The FLYBY SHOT EDITOR's list algebra and the bake validator that stands
  // between a pasted blob and the shipped DEFAULT. Pure data, ~0.1 s, and it
  // belongs in the edit loop because tools/gen/bake-flyby.mjs is a FULL REPLACE.
  "tests/unit/flyby-panel.test.mjs",
  "tests/unit/flyby-pose-inverse.test.mjs",
  "tests/unit/flyby-shots.test.mjs",
  "tests/unit/flying-start.test.mjs",
  "tests/unit/followup-platform.test.mjs",
  "tests/unit/followup-update-check.test.mjs",
  "tests/unit/font-digits.test.mjs",
  // The weather FORECAST (js/race/forecast.js): timeline off the arc's own road lag (drift-guarded against
  // weather-arc.js), bounded seeded uncertainty, and the engineer's early / 2-lap / 1-lap / here / drying calls. VM, < 0.5 s.
  "tests/unit/forecast.test.mjs",
  // Portrait HFOV floor + landscape HFOV cap (js/camera/fov-fit.js); pure VM, <0.1 s.
  "tests/unit/fov-fit.test.mjs",
  // The FRAMING REPORT fleet diff (tools/lib/frame-fleet.mjs): frame identity across
  // a shot-list edit, flag-name comparison, worst-frame summary. Pure, ~0.1 s.
  "tests/unit/frame-fleet.test.mjs",
  // The hitch instrument's own arithmetic (tools/gfx/frame-hitch.mjs), on
  // synthetic series with known answers; gpu-census's driven window imports it.
  "tests/unit/frame-hitch-analyse.test.mjs",
  // Race-loop GC/CPU trims (perf(frame)): TLX cull indexed-for + identity
  // poolModelMat, GLX shadow colour skip + uf4 pit/uTime cache, countdown
  // setGridIdle opts pool. Source pins, no browser, ~0.1 s.
  "tests/unit/frame-hotpath-alloc.test.mjs",
  // Ranked-set cache distance/time budget: at 60 m/s the heap is not rebuilt
  // every frame, the mirror viewLights shares that budget, standstill does not
  // churn on the clock, and the rear window stays flash-free. ~0.2 s.
  "tests/unit/frame-lights-rank-cache.test.mjs",
  "tests/unit/frame-lights-shed.test.mjs",
  // The FRAMING REPORT's math (tools/lib/frame-math.mjs): projection handedness,
  // ray-vs-box, occlusion, horizon, motion and the flags an agent acts on without
  // a picture. Hand-built worlds, no game VM, ~0.1 s.
  "tests/unit/frame-math.test.mjs",
  "tests/unit/free-cam.test.mjs",
  // ...and the front-wing endplate decal, whose plate moves with every aero
  // recipe: measured against the real built car, not against literals.
  "tests/unit/front-wing-decal.test.mjs",
  // Every freezable module surface stays frozen (pure file read; < 1 s).
  "tests/unit/frozen-globals.test.mjs",
  "tests/unit/frustum-buckets.test.mjs",
  // Seeded fuzz over every door that decodes player-shaped data (ghost hash,
  // invite paste, peer snapshot, settings/garage import, career migrate,
  // store reads). Hash32-seeded, N=2000/surface, <10 s; a red prints the seed.
  "tests/unit/fuzz-untrusted-inputs.test.mjs",
  "tests/unit/gallery-capture-draws.test.mjs",
  "tests/unit/game-ctx-surface.test.mjs",
  // Expensive game-systems CLIs (ai-pace/field/line/human, player-dyn,
  // physics-tune-sweep, career-economy) must answer --help without booting
  // the VM / Chromium. Measured 2026-10-01: --help silently ran the full work.
  "tests/unit/game-tools-help.test.mjs",
  // The Node VM game harness (tools/lib/game-vm.cjs): boots js/game.js headless in
  // ~300 ms and reproduces tests/data/physics-baseline.json EXACTLY, so the
  // driving-model gate runs here in seconds rather than in a browser job.
  "tests/unit/game-vm.test.mjs",
  "tests/unit/garage-arrival.test.mjs",
  // Garage before GitHub API: retry on 5xx/429/network + ?name= filter (mocked fetch).
  "tests/unit/garage-before-api.test.mjs",
  // Garage before pack: recipe, MANIFEST, fetch --help / no-pack, workflow is
  // not Car shot. Pure + spawn, no network / Chromium.
  "tests/unit/garage-before.test.mjs",
  // The pit crew (layout, board up as it rolls, never in the path) and GARAGE ANGLE's plan of the bay.
  "tests/unit/garage-crew.test.mjs",
  "tests/unit/garage-defaults.test.mjs",
  "tests/unit/garage-followups.test.mjs",
  "tests/unit/garage-interior-gate.test.mjs",
  "tests/unit/garage-mesh.test.mjs",
  "tests/unit/garage-panel-side.test.mjs",
  // The garage personality: shutter swell, drive-out engine, rain light, pit-exit radio line.
  "tests/unit/garage-personality.test.mjs",
  // The garage pre-built while the title idles (js/garage/prebuild.js): the gate,
  // the keyed car/room/frames sequence and the tap-to-first-frame measure. VM, ~0.3 s.
  "tests/unit/garage-prebuild.test.mjs",
  // ...and the garage's SIGNS: no prop mounted within half a metre in front of
  // a wall quad. Two shipped cut-off wordmarks and one never-visible live
  // trace were each found by a screenshot; this puts them in the edit loop.
  // Round-2 garage: era bans never delete fitted parts, the wall board reads FREE BUILD, stats include career development, badges and legend chips.
  "tests/unit/garage-sheet-round2.test.mjs",
  "tests/unit/garage-sign-occlusion.test.mjs",
  "tests/unit/gen-arch-table.test.mjs",
  "tests/unit/generated-docs.test.mjs",
  "tests/unit/geom-mountain-lowmat.test.mjs",
  "tests/unit/geometry-paths-baseline.test.mjs",
  "tests/unit/gfx-backend-canary.test.mjs",
  "tests/unit/gfx-debug-overlay.test.mjs",
  "tests/unit/ghost-share.test.mjs",
  "tests/unit/ghost.test.mjs",
  // #1807: a git hook's GIT_DIR / GIT_INDEX_FILE must not reach fixture git (a decoy
  // repo stays untouched; every fixture-repo test imports the scrub first). ~2.5 s.
  "tests/unit/git-fixture-env.test.mjs",
  "tests/unit/global-registry.test.mjs",
  // Round-2: GLX createTexture resets UNPACK flags and frees the texture when texImage2D throws (mock).
  "tests/unit/glx-failure-paths.test.mjs",
  "tests/unit/glx-multidraw.test.mjs",
  "tests/unit/glx-occlusion.test.mjs",
  // GLX output-target (VR task 30): source-scan of bindFramebuffer(null) plus a recording-mock proof that setOutputTarget routes the final pass.
  "tests/unit/glx-output-target.test.mjs",
  // #2153: GLX resize() snaps a ±1 px present/render jitter (WGX hysteresis) so the post chain is not rebuilt (mock).
  "tests/unit/glx-resize-hysteresis.test.mjs",
  "tests/unit/glx-resource-balance.test.mjs",
  "tests/unit/godray-keep-nearest.test.mjs",
  "tests/unit/grip-steer.test.mjs",
  "tests/unit/handback.test.mjs",
  "tests/unit/harness-display.test.mjs",
  "tests/unit/helmets.test.mjs",
  "tests/unit/home-world.test.mjs",
  "tests/unit/hooks-documented.test.mjs",
  // ...and an HTML-sink audit over js/: every innerHTML/outerHTML/
  // insertAdjacentHTML writes a constant or is in the reasoned allowlist
  // (the 2026-09-24 stored XSS went through one). Pure source scan, ~1 s.
  "tests/unit/html-sink-lint.test.mjs",
  "tests/unit/hud-announce-lane-cache.test.mjs",
  "tests/unit/hud-control-clearance.test.mjs",
  "tests/unit/hud-dock-pack.test.mjs",
  "tests/unit/hud-elements.test.mjs",
  "tests/unit/hud-feel.test.mjs",
  // fitHud zTop/#minimap zoom idempotence (Pages compact mm flip).
  "tests/unit/hud-fit-idempotent.test.mjs",
  "tests/unit/hud-gap-decimals.test.mjs",
  "tests/unit/hud-helmet-placement.test.mjs",
  "tests/unit/hud-inputs.test.mjs",
  "tests/unit/hud-layout.test.mjs",
  "tests/unit/hud-metrics-layout.test.mjs",
  "tests/unit/hud-minimap-pitmark.test.mjs",
  // Behaviour pins that must survive the band allocator (PR #1375 audit; todo = known red on ship).
  "tests/unit/hud-pins.test.mjs",
  // Portrait phone bottom cluster: TYRES stays in the column (landscape-only
  // dock anchor), fitHud caps --hud-z-bot vs AERO/OT, tip clash shapes.
  "tests/unit/hud-portrait-cluster.test.mjs",
  // One radio home per HUD profile: BROADCAST lights hud-radio-top /
  // data-radio-corner; leftover 14svh #announce home is gone.
  "tests/unit/hud-radio-slot.test.mjs",
  "tests/unit/hud-readouts.test.mjs",
  "tests/unit/hud-relative.test.mjs",
  "tests/unit/hud-speed-parity.test.mjs",
  // phoneL broadcast @150%: announce/flag/LIMITS/TYRES/REL stack (queue item 1).
  "tests/unit/hud-status-stack.test.mjs",
  "tests/unit/hud-strategy.test.mjs",
  "tests/unit/hud-survey.test.mjs",
  "tests/unit/hud-tyres.test.mjs",
  // Round-2: hwZones are control-point index fractions — every zone with a curated turn inside its window narrows that corner.
  "tests/unit/hw-zones.test.mjs",
  // i18n contribution lint + migrated-file guard (Slice 2 / #1601): fixtures + ship locales + --guard.
  "tests/unit/i18n-lint.test.mjs",
  "tests/unit/i18n.test.mjs",
  "tests/unit/image-grade-shaders.test.mjs",
  "tests/unit/import-models-workflow.test.mjs",
  "tests/unit/import-models.test.mjs",
  "tests/unit/incident-gate.test.mjs",
  "tests/unit/incident-rpm.test.mjs",
  "tests/unit/init-owner-resize-observer.test.mjs",
  // InputBindings factory alone (conflict claim, reset/isDefault, persistence,
  // brand labels) — no input.js. Complements key-binds.test.mjs. ~0.1 s.
  "tests/unit/input-bindings.test.mjs",
  "tests/unit/input-ghost.test.mjs",
  "tests/unit/js-debugger-lifecycle-fixes.test.mjs",
  "tests/unit/js-debugger-mcp.test.mjs",
  "tests/unit/js-debugger-trace.test.mjs",
  "tests/unit/key-binds.test.mjs",
  "tests/unit/keyboard-first-audio-vm.test.mjs",
  // knob-ab.mjs fails a visual knob whose ON vs OFF frame does not beat the noise floor (#1885 puddles). Pure.
  "tests/unit/knob-ab.test.mjs",
  "tests/unit/lamp-bake.test.mjs",
  "tests/unit/lamp-chunks.test.mjs",
  "tests/unit/lamp-density.test.mjs",
  // The night lamp-shadow map holds one flood while the car sits between two:
  // the real frame-lights.js feeding the real ShadowPass.lampPass. ~0.3 s.
  "tests/unit/lamp-shadow-pick.test.mjs",
  // Round-2: the m:ss formatters round before splitting (no 1:60.00) and signed deltas never print -0.000.
  "tests/unit/lap-format-rollover.test.mjs",
  "tests/unit/layers-nav-memo.test.mjs",
  "tests/unit/lazy-audio-firstbind-vm.test.mjs",
  "tests/unit/lazy-bundles-prefetch.test.mjs",
  "tests/unit/lazy-track-build.test.mjs",
  // …and the PERIOD CAR reaching the garage SHEET, not just the team
  // record. Twelve legends share one `legends` id, so the write policy is
  // the behaviour: seed an empty sheet, reseed on a real switch, never on a
  // boot or a same-seat re-sync (that would wipe a paid-for build).
  "tests/unit/legend-parts-seed.test.mjs",
  // The LEGENDS TEAM as a grid entry: its own id (not the custom slot), the
  // whole roster in `drivers` so the driver picker is the legend picker, and
  // the one-seat rule — drivers.length is 12, so anything counting seats by
  // it puts twelve legends on the grid.
  "tests/unit/legends-team.test.mjs",
  "tests/unit/legends.test.mjs",
  "tests/unit/lexical-window-guard.test.mjs",
  "tests/unit/light-grid.test.mjs",
  "tests/unit/light-presets-extreme-knobs.test.mjs",
  "tests/unit/light-presets-knob-range.test.mjs",
  "tests/unit/light-presets.test.mjs",
  "tests/unit/light-store-cond-layer.test.mjs",
  "tests/unit/light-store-copy.test.mjs",
  "tests/unit/light-store-perchunk-pin.test.mjs",
  "tests/unit/lighting-reapply.test.mjs",
  "tests/unit/lighting-rebuild.test.mjs",
  "tests/unit/lighting-tuner-reset-weather.test.mjs",
  "tests/unit/lighting-tuner-sweep.test.mjs",
  // GATE GAP (2026-09-10): these three garage files and the three steering
  // files below sat in test:garage-unit / test:steering-unit, which ran in NO
  // gate — not here, not ci.yml's node step, so not deploy.mjs either. Each is
  // under 3 s (livery-decal-surfaces 2.8 s, body-split and helmets 0.3 s);
  // livery-contrast (9.7 s) and cover-legibility (7.4 s) stay CI-only.
  "tests/unit/livery-decal-surfaces.test.mjs",
  // Pure artwork and paint-editor VM regression; selected for all source edits.
  "tests/unit/livery-design.test.mjs",
  "tests/unit/livery-draft-mesh-cache.test.mjs",
  "tests/unit/livery-finish-contract.test.mjs",
  "tests/unit/livery-helmet-style.test.mjs",
  // Livery sidewallInk (S5): unset = byte-identical wheels, set = band/lettering colour only. VM, ~1 s.
  "tests/unit/livery-sidewall.test.mjs",
  "tests/unit/livery-tier.test.mjs",
  // Livery rimTint / caliperTint (S2): unset = byte-identical wheels, set = colour-only, caches keyed. VM, ~1 s.
  "tests/unit/livery-wheels.test.mjs",
  "tests/unit/livery-zone-finish.test.mjs",
  "tests/unit/load-order.test.mjs",
  // The LOADING CARD's geometry: the three numbers the flyby editor authors,
  // clamped out of localStorage before they reach a CSS custom property, where
  // a NaN is not an error but a silently dropped declaration.
  "tests/unit/loading-card.test.mjs",
  "tests/unit/loading-screen-pack-gate.test.mjs",
  // The garage -> flyby hand-off sweep: fires once, after the garage only, in the team colour.
  "tests/unit/loading-wipe.test.mjs",
  // answerInFlight serializes acceptAnswer so a second SDP does not start a parallel negotiation (and is not blacklisted — the guest retries).
  "tests/unit/lobby-answer-flight.test.mjs",
  // LobbyCodes.codeFrom / paintQr / canShare (lobby-codes peel). Pure VM.
  "tests/unit/lobby-codes.test.mjs",
  "tests/unit/lobed-trees.test.mjs",
  // lockup-bench.mjs sweep (speed × pedal × brake bias × weather) pinned on
  // Monza; VM pins dry/rain shapes for bias- and speed-dependent wheelLock.
  "tests/unit/lockup-bench-vm.test.mjs",
  "tests/unit/log-namespaces.test.mjs",
  // LoopHealth fault policy: RUN_CAP / TOTAL_CAP / quiet expiry / clean recovery.
  // VM-executed js/perf/loop-health.js (seedLog), controllable clock, ~0.1 s.
  "tests/unit/loop-health.test.mjs",
  // Low-speed lock plateau pin (1.06× → ≈0.371 rad at notch 7) + high-speed
  // Object.is vs pre-boost raw; companion to steer-lock-taper. Source + VM, ~3 s.
  "tests/unit/low-speed-lock.test.mjs",
  "tests/unit/lsp-caller-fixes.test.mjs",
  "tests/unit/lsp-config-freshness.test.mjs",
  // apex-lsp as an MCP client: shared warmed child for definition / references / callers / symbols on the real js/ tree via tsc --lsp; guarded typeof / || {} head aliases (PC.VMAX). Pipelined alias fan-out; test:mcp runs --test-concurrency=1 (docs/notes/LSP-MCP-TIMEOUT-2026-10-19.md).
  "tests/unit/lsp-mcp.test.mjs",
  "tests/unit/lsp-navigation-efficiency.test.mjs",
  "tests/unit/lsp-reference-fixes.test.mjs",
  "tests/unit/lsp-workflow-fixes.test.mjs",
  // The marshal posts' light panels show race control: a waved yellow in the
  // sector, steady yellow under VSC/SC, red, a green after the clear. VM, ~0.1 s.
  "tests/unit/marshal-panels.test.mjs",
  // marshalPost style roofs seat on walls and the signal pole chains to the
  // hut (ground-audit unsupported on monaco/spa/suzuka kiosk posts). ~0.1 s.
  "tests/unit/marshal-post-grounding.test.mjs",
  "tests/unit/mcp-cli.test.mjs",
  "tests/unit/mcp-http-origin.test.mjs",
  "tests/unit/mcp-smoke.test.mjs",
  "tests/unit/measure-pr-ci-after-close.test.mjs",
  "tests/unit/mechanics-coherence.test.mjs",
  "tests/unit/meeting-picker-labels.test.mjs",
  // The track-switch growth verdict (mem-census sustainedGrowthMB) replayed on the #773 / 2026-10-04 leak numbers and the Metal warm-up step. ~0.1 s.
  "tests/unit/mem-census-growth.test.mjs",
  // memory-sync.sh's three-way sync: a stale session never reverts other
  // sessions' memories (2026-10-02, twice). Real hook, throwaway repo. ~1 s.
  "tests/unit/memory-sync.test.mjs",
  "tests/unit/menu-a11y-audit.test.mjs",
  "tests/unit/menu-capture.test.mjs",
  "tests/unit/menu-nav-spatial.test.mjs",
  // loadTrack sentinel is race/count only; window resize is rAF-coalesced;
  // menuKey has no pane rect (survey-A findings 5–6). VM, no browser.
  "tests/unit/menu-sentinel-resize.test.mjs",
  "tests/unit/merge-hygiene.test.mjs",
  "tests/unit/metrics.test.mjs",
  // Night sky-tint fallback on the cockpit mirror glass: dim env bands + matte
  // material so Monaco night glass no longer reads 7–10× the road. ~0.1 s.
  "tests/unit/mirror-glass-night.test.mjs",
  "tests/unit/mirror-lights.test.mjs",
  // The HUD rear-view mirror's game side (js/render/shared/mirror-pass.js) in a VM:
  // when it shows, the pass order, and the main camera handed back. ~0.1 s.
  "tests/unit/mirror-pass.test.mjs",
  // Job 5: mix duck under announcer/radio. Fake-audio VM: SFX bus −8 dB
  // via setTargetAtTime (80 ms / 400 ms), overlap hold, interrupt/rebuild
  // restore, zero per-frame nodes. ~0.2 s.
  "tests/unit/mix-duck-radio.test.mjs",
  // Capacitor Android (task 45): frozen identity, config shape, manifest,
  // Gradle version wiring, sync-web stamp gate, NativeDownload via Plugins.
  "tests/unit/mobile-config.test.mjs",
  "tests/unit/mobile-native-download.test.mjs",
  "tests/unit/mobile-sync-web.test.mjs",
  "tests/unit/model-pack-format.test.mjs",
  "tests/unit/move-tree.test.mjs",
  // needs-sync: the sync predicate (conflict | stale-red | no) that sync-pr and pr-board run first.
  "tests/unit/needs-sync.test.mjs",
  "tests/unit/net-audio-revs-vm.test.mjs",
  "tests/unit/night-washout-presets.test.mjs",
  "tests/unit/nightly-group.test.mjs",
  "tests/unit/no-bare-console.test.mjs",
  "tests/unit/node-compile-cache.test.mjs",
  "tests/unit/node-plan.test.mjs",
  "tests/unit/nontext-contrast.test.mjs",
  // Round-2: a slow/offline navigation to controller.html never gets the game shell; controller.html is precached as optional.
  "tests/unit/offline-precache-nav.test.mjs",
  "tests/unit/onboard.test.mjs",
  // updateCar OT ahead-scan gate: skip the O(n) walk when gapAhead is unused.
  "tests/unit/ot-ahead-scan-gate.test.mjs",
  "tests/unit/over-road-scan.test.mjs",
  // Stream overlay v1 schema/diffs, transform painter, TV pass/battle/fastest cards, and staged root page.
  "tests/unit/overlay-feed.test.mjs",
  "tests/unit/overtake-mode.test.mjs",
  // PaceMath (js/race/pace-math.js): vTop/vStd/aStd + X-mode/ERS/gearHi pins from pre-extract goldens. ~0.1 s.
  "tests/unit/pace-math.test.mjs",
  "tests/unit/pad-haptics.test.mjs",
  // particles.js dirty latch: parked rain skips expand/upload until eye cell moves.
  "tests/unit/particles-dirty.test.mjs",
  // ~29 s of pure geometry (measured 2026-09-24): builds every catalog option ONCE and hashes each
  // mesh, so a part that stops changing the car is caught where the catalog
  // is edited rather than in a 2-hour render sweep nobody runs.
  "tests/unit/parts-distinct-mesh.test.mjs",
  // Both node-only and both under half a second: the catalog LADDER (no paid
  // option dominated by a cheaper one, no row that is never optimal) and the
  // garage's per-vertex MATERIAL column. Neither was in the edit loop, which
  // for the garage one defeats its whole purpose — a dropped material column
  // looks exactly like the bug it guards against.
  "tests/unit/parts-ladder.test.mjs",
  // Locked SIGNATURE → equivalent (not DEFAULTS). ~0.1 s; without it a
  // Faenza Street fit on McLaren silently photographed as medium.
  "tests/unit/parts-locked-equivalent.test.mjs",
  "tests/unit/pause-hud-layout.test.mjs",
  "tests/unit/pause-key-tools.test.mjs",
  "tests/unit/pause-opts.test.mjs",
  "tests/unit/perf-frametime.test.mjs",
  "tests/unit/perf-governor.test.mjs",
  "tests/unit/perf-race-entry.test.mjs",
  "tests/unit/perf-sentinel.test.mjs",
  // PerfSpans ring/percentiles/off-switch + __apex.perf() in the game VM; profile lib noise rule; apex_profile argv pins.
  "tests/unit/perf-spans.test.mjs",
  "tests/unit/perf-try.test.mjs",
  "tests/unit/phone-input-improvements.test.mjs",
  // ...and PHONE AS CONTROLLER: the wire codec, the shared roll math, and a
  // phone sample reaching Input's tilt pipeline over the in-process loopback
  // transport — same VM harness, no browser, ~0.3 s.
  "tests/unit/phone-pad.test.mjs",
  // PhoneRecorder (#1633): sampler cadence, JSON serializer, SHARE/COPY fallbacks. VM, < 0.5 s.
  "tests/unit/phone-recorder.test.mjs",
  "tests/unit/phone-touch-surface.test.mjs",
  "tests/unit/photo-kit.test.mjs",
  "tests/unit/photo-studio.test.mjs",
  "tests/unit/photomode-hold.test.mjs",
  // The physics baseline's provenance stamp (_blessed): reason, data hash,
  // blessing commit. One file read and one git call, well under a second, and
  // it must fail where the baseline is edited, not on a nightly.
  "tests/unit/physics-baseline-provenance.test.mjs",
  "tests/unit/physics-characterization-vm.test.mjs",
  "tests/unit/pick-tests.test.mjs",
  "tests/unit/pick-unit-slices.test.mjs",
  // Pit canopy lamps on Bahrain working lane: real setFrameLights cull, tail reserve, phone 24 / TLX-lite 16. ~0.5 s.
  "tests/unit/pit-canopy-cull.test.mjs",
  // ...and the pit lane's pure geometry: the window WRAPS the start/finish
  // line, the lane is metres not a fraction of the lap, the box is long
  // enough to stop in, and the COMMITMENT that replaced the pit button tells
  // a driven pit entry from a car that ran wide there. ~0.2 s.
  "tests/unit/pit-lane.test.mjs",
  "tests/unit/platform-session-install.test.mjs",
  // Player collision stereo side: default centred blip path; optional pan via contact pool.
  "tests/unit/player-collision-side.test.mjs",
  // PlayerForces carve (carve-headroom A): combined-slip / Fy / yaw from updateCar.
  "tests/unit/player-forces.test.mjs",
  "tests/unit/player-tools-backup.test.mjs",
  "tests/unit/player-tools-ui.test.mjs",
  "tests/unit/poll-live-shell.test.mjs",
  // CI Watch board: every open PR with its SUGGESTION, GET-only, cap shared with ready-full-cap.
  "tests/unit/pr-board.test.mjs",
  // PR plumbing (#2387, #2397): pr-body.mjs transforms, handback.mjs, post-merge.mjs.
  "tests/unit/pr-body.test.mjs",
  // test-coverage-audit answers "is this file in SOME topical group"; this one
  // answers the question that actually bites, "does the pre-push gate RUN it" —
  // two deploys (2026-09-02) and one (2026-09-18) went red on pins that no
  // pre-push command executes. It must be IN the gate to guard the gate.
  "tests/unit/prepush-gate-coverage.test.mjs",
  // Nightly process dashboard reducer (tools/ci/process-dashboard.mjs): fixture
  // percentiles, tier walls, push-to-live, time-ratchet skip. No network, < 0.2 s.
  "tests/unit/process-dashboard.test.mjs",
  "tests/unit/profile-lib.test.mjs",
  "tests/unit/profile-mcp.test.mjs",
  // The branch-prune rule behind prune-branches.yml: merged-only, never an
  // open PR's head, claims on age; pure fixtures, under a second.
  "tests/unit/prune-branches.test.mjs",
  "tests/unit/pu-harvest-audio.test.mjs",
  // Evidence archive round-trip, provenance and non-overwriting release publication; no live GitHub writes.
  "tests/unit/publish-evidence.test.mjs",
  // shots/<topic> evidence-branch publisher: validations, dry run, full publish into a throwaway bare repo.
  "tests/unit/publish-shots.test.mjs",
  // STANDING-WATER PUDDLES: js/render/shared/puddles.js reference mask (sample pins, growth/drying, edge bias) + every constant mirrored in GLX/TLX/WGX + the PUDDLES knob plumbing. Pure, < 1 s.
  "tests/unit/puddles.test.mjs",
  // Push hold: queued + running Actions JOBS by OS vs the 40 Linux / 5 macOS slots, never runs. Fixtures.
  "tests/unit/queue-depth.test.mjs",
  "tests/unit/quick-validate.test.mjs",
  "tests/unit/race-control.test.mjs",
  "tests/unit/race-entry-profile.test.mjs",
  "tests/unit/race-insights.test.mjs",
  "tests/unit/race-radio.test.mjs",
  "tests/unit/race-session-fixes.test.mjs",
  "tests/unit/race-session-lazy.test.mjs",
  // Race Settings CUSTOM preset + WEEKEND · QUALIFYING FIRST header, plus
  // Season SETUP scroll/chip pins (layer on #1082 chrome).
  "tests/unit/race-setup-sheets.test.mjs",
  // Field-step pose snapshots: traffic scans read last tick's prog/x/speed so
  // a car updated earlier in the same tick cannot look like a pass. Source
  // pin of game.js's snap loop + red-flag first-gear restart + coast estimate.
  // ~instant.
  "tests/unit/race-step-snap.test.mjs",
  // Race-radio card life vs RadioVoice speech budget (phrasebook, longest slots).
  "tests/unit/radio-duration.test.mjs",
  // radio-lines phrasebook: slot fill, recent-history pick, variant counts.
  "tests/unit/radio-lines.test.mjs",
  "tests/unit/radio-voice.test.mjs",
  // LOCALIZED RAIN: a drifting shower over a window of the lap, per-segment closed-form lag, lap mean = old global. VM, ~0.3 s.
  "tests/unit/rain-cells.test.mjs",
  // Two PRs auto-raising one module's ceiling merge clean (ratchets.d fragments, #2291).
  "tests/unit/ratchet-merge-hotspot.test.mjs",
  "tests/unit/ratchet-reason.test.mjs",
  "tests/unit/ratchets-fold-schedule.test.mjs",
  "tests/unit/ratchets.test.mjs",
  // Merge Desk: refuse mark-ready when ≥3 ready PRs already hold full-tier CI.
  "tests/unit/ready-full-cap.test.mjs",
  // ...and the REAL RACE: the OpenF1 timing of the 2026 Azerbaijan GP
  // (tests/fixtures/openf1-baku-2026-race.json) becomes a race script, and the
  // director lays it over a stub field — grid, plans, the pace loop, the
  // flag windows. Pure rules in a VM, ~0.3 s together.
  "tests/unit/ready-gate.test.mjs",
  "tests/unit/real-race-script.test.mjs",
  // WATCH recording-gap cache (#2465): explicit refresh replaces a stale interior hole and keeps a pit stop and a red flag. VM, under a second.
  "tests/unit/real-race-tab-gap-refresh.test.mjs",
  "tests/unit/real-race.test.mjs",
  // Replay caption validity across seeks, reel cuts and session changes; isolated VM.
  "tests/unit/real-replay-captions.test.mjs",
  // ...and the REAL REPLAY on the real Baku build: OpenF1's x/y fitted onto the
  // centreline, the highlights list, the field as puppets (follow, speed, a car
  // whose data ends, the flag) and the exact JUMP IN. Four game boots, ~12 s.
  "tests/unit/real-replay-vm.test.mjs",
  "tests/unit/red-flag-fuel-vm.test.mjs",
  // ...and its sibling over js/: a try/catch cannot swallow a promise
  // REJECTION, and index.html turns an unhandled one into a full-screen
  // overlay over the running race. Pure source scan, well under a second.
  "tests/unit/reject-lint.test.mjs",
  "tests/unit/release-provenance.test.mjs",
  // js/race/reliability.js (random DNFs) had no unit test — only career.spec,
  // over budget and nightly-only. Pure VM with a stub hash, well under a second.
  "tests/unit/reliability.test.mjs",
  // tools/ci/remote-group.mjs + browser-group.yml: the group/shard validation
  // that stands between a dispatch input and a shell, and the run pick. Pure, instant.
  "tests/unit/remote-group.test.mjs",
  // Renderer ownership, post health, material detail and particle residency; isolated VM.
  "tests/unit/render-final-contracts.test.mjs",
  // render() lighting-prep pure-move: renderLightingPrep owns sky/lightning/lamps; call-order pin. ~0.05 s.
  "tests/unit/render-lighting-prep.test.mjs",
  // RenderRate (#2652): a phone halves the draw rate on a 100 Hz+ rAF; desktop and XR never; no time lost. VM, ~0.1 s.
  "tests/unit/render-rate.test.mjs",
  "tests/unit/renderer-boot-timeout.test.mjs",
  "tests/unit/renderer-soft-lifecycle.test.mjs",
  // Instant-replay ring (js/camera/replay-buf.js): budget, wrap, restore, solo/net scrub gates. ~0.05 s.
  "tests/unit/replay-buf.test.mjs",
  // repo-size.yml's full-history size report: refuses a shallow clone (one
  // sized this repo wrong on 2026-10-01), real-git fixture. ~1 s.
  "tests/unit/repo-size.test.mjs",
  "tests/unit/report-server.test.mjs",
  "tests/unit/res-scale-census.test.mjs",
  // Results cam (js/camera/results-cam.js): chequered→orbit, highlights reel, results early-return pin. ~0.05 s.
  "tests/unit/results-cam.test.mjs",
  "tests/unit/ribbon-cpu-release.test.mjs",
  "tests/unit/rival-attach-init.test.mjs",
  "tests/unit/rival-audio.test.mjs",
  "tests/unit/rival-contact-sfx.test.mjs",
  "tests/unit/rival-passby-pool.test.mjs",
  // The WebGPU road-marking frame. Three circuits (~3 s); the full 40-circuit
  // sweep is `node tools/gfx/road-lut-census.mjs --all` (~34 s), run before a deploy
  "tests/unit/road-lut-frame.test.mjs",
  "tests/unit/road-position-checks.test.mjs",
  "tests/unit/run-pid.test.mjs",
  // PERF-HUNT-2 S8: caution/coach/radio once per frame (_audioParamStep + G._s8Stamp).
  "tests/unit/s8-once-per-frame.test.mjs",
  "tests/unit/save-durability.test.mjs",
  "tests/unit/save-migrate.test.mjs",
  "tests/unit/save-schema-registry.test.mjs",
  "tests/unit/scale-defaults.test.mjs",
  // The garage LIVE atlas on a LAZY_CIRCUIT stub: paintLive skips the map instead of
  // throwing, and ctxKey re-keys on hydration. VM, ~0.3 s.
  "tests/unit/scene-live.test.mjs",
  "tests/unit/scenery-api-contract.test.mjs",
  "tests/unit/scenery-guards.test.mjs",
  "tests/unit/scenery-kits.test.mjs",
  "tests/unit/screen-looks.test.mjs",
  "tests/unit/script-loader-throw.test.mjs",
  "tests/unit/scroll-strips.test.mjs",
  "tests/unit/season-cal.test.mjs",
  "tests/unit/select-budget.test.mjs",
  // Round-2: re-tapping the active team tile keeps the seat (Legends keeps its build); unstarring the active circuit under FAVOURITES keeps the selection.
  "tests/unit/select-screen-fixes.test.mjs",
  "tests/unit/select-specs.test.mjs",
  "tests/unit/selected-gate-verdict.test.mjs",
  "tests/unit/session-contracts.test.mjs",
  "tests/unit/session-entry-vm.test.mjs",
  "tests/unit/session-status.test.mjs",
  "tests/unit/session-stub-surface.test.mjs",
  "tests/unit/session-transcript.test.mjs",
  "tests/unit/setting-deps.test.mjs",
  "tests/unit/settings-defaults.test.mjs",
  "tests/unit/settings-export.test.mjs",
  "tests/unit/settings-one-home.test.mjs",
  "tests/unit/settings-search.test.mjs",
  // Round-2: MUSIC & SOUND asks the audio bundle once per open and reveals the stub page with a note when it cannot load.
  "tests/unit/settings-tabs.test.mjs",
  "tests/unit/settings-ttlb-backup.test.mjs",
  // R19 guards. Both belong in the EDIT LOOP rather than a slow topical group:
  // each re-derives a fact the source depends on (which livery fields move a
  // vertex; that js/track/ reads the build's NIGHT, not the def's), so they are
  // only useful if they run right after the edit that would break them.
  "tests/unit/setup-preview-hull.test.mjs",
  "tests/unit/setup-screens-state.test.mjs",
  "tests/unit/setup-trial-session.test.mjs",
  "tests/unit/setup-tune.test.mjs",
  // tools/check/shader-validate.mjs: glslang over the GLX GLSL, naga (advisory) over the WGX WGSL. Extraction runs
  // unconditionally; the compilers SKIP loudly when absent (tools/env/install-lint-bins.sh) and the CI `lints` job fails a SKIP. ~3 s.
  "tests/unit/shader-validate.test.mjs",
  // The sun shadow map's depth span holds a 250 m caster: drives the real
  // ShadowPass.sunPass on a stub renderer and projects through its light VP.
  "tests/unit/shadow-pass-depth.test.mjs",
  "tests/unit/share-card-data.test.mjs",
  "tests/unit/share-card-layout.test.mjs",
  "tests/unit/share-card.test.mjs",
  "tests/unit/share-code.test.mjs",
  "tests/unit/shared-math.test.mjs",
  "tests/unit/sheet-per-screen.test.mjs",
  "tests/unit/sheetshape-density-scale.test.mjs",
  "tests/unit/sheetshape-keyboard.test.mjs",
  "tests/unit/sheetshape-registry.test.mjs",
  "tests/unit/shell-ids.test.mjs",
  "tests/unit/ship-filter-paths.test.mjs",
  // shot.mjs --batch / --jpeg / --raster parse (no Chromium).
  "tests/unit/shot-jobs.test.mjs",
  // Shared survey runner: CLI and MCP manifests match, and colliding gallery names stay distinct.
  "tests/unit/shot-survey-runner.test.mjs",
  // The physics step's functions (update, updateCar…) compile under 48 KB of bytecode — TurboFan's
  // cap is 61,440 B and past it the whole race runs deoptimized (PERF-HUNT-2 S11); one node child, ~2 s.
  "tests/unit/sim-bytecode-budget.test.mjs",
  // skidmarks.js lays marks per SECOND of laying (was per frame): a VM run of
  // the ring buffer at three refresh rates, ~0.1 s.
  "tests/unit/skidmarks-cadence.test.mjs",
  // 2026-10-18 skill-surface retest pins (gameplay + render/UI prose), < 1 s.
  "tests/unit/skill-gameplay-surface.test.mjs",
  "tests/unit/skill-hint-hook.test.mjs",
  "tests/unit/skill-progressive.test.mjs",
  "tests/unit/skill-render-ui-surface.test.mjs",
  // skill-routing-eval.py against a fake `claude` on PATH (no model calls), ~1.5 s.
  "tests/unit/skill-routing-eval.test.mjs",
  "tests/unit/skill-smoke.test.mjs",
  // SoakRun (AUTO SOAK): idle until start, input-only driver, soak-gated, ends and hands the input back. VM, < 0.5 s.
  "tests/unit/soak-run.test.mjs",
  // Round-2: removeTrack frees its MUSIC_CACHE slot.
  "tests/unit/soundtrack-cache.test.mjs",
  "tests/unit/source-integrity.test.mjs",
  "tests/unit/source-pin-hygiene.test.mjs",
  "tests/unit/span-kinds.test.mjs",
  // The duration HISTORY behind the budget: junit/live-reporter merge,
  // the bounded rolling record, the CI-bucket fallback and the growth flag.
  // Pure fixtures plus one pass over the committed tests/data/spec-timings.json,
  // ~1 s — and it belongs in the edit loop because the file it guards is
  // rewritten by a tool, so drift shows up as a commit nobody meant to make.
  "tests/unit/spec-timings.test.mjs",
  // Lateral→longitudinal bicycle couple (v·r − Fyf·sin δ) in player-forces:
  // straight coast bit-identical to tip; held-steer coast matches couple
  // within tol; COUPLE_V_MIN=3; yaw damp untouched. createGame once, ~2.5 s.
  "tests/unit/speed-coupling.test.mjs",
  // Round-2 track engine: surfaceFolds / centreline diagnostics, running-surface fold clamp, opt-in splineAlpha (unset = byte-identical path).
  "tests/unit/spline-fold-diagnostics.test.mjs",
  "tests/unit/sporting-regs.test.mjs",
  "tests/unit/spotter-lifecycle.test.mjs",
  // The start gantry's five lamps follow the countdown: one additive glow per
  // lit lamp, on the gantry nearest the line, out at green. VM, ~0.1 s.
  "tests/unit/start-lights.test.mjs",
  "tests/unit/start-race-latch.test.mjs",
  "tests/unit/steel-role.test.mjs",
  // Mid-corner lift-off snap cap (COAST_YAW_* in consts + player-forces): yaw
  // must still rise >1.05× (player-dynamics shape) but stay ≤1.25× in 0.75 s
  // at 45 m/s / lock 0.8. createGame once, ~2.5 s.
  "tests/unit/steer-feel-lift-off.test.mjs",
  // Hairpin lock hold: lockTaper = 1.06× for vs≤15, blend 15–30, raw ≥30 so
  // ≥60 m/s stays bit-identical to the old hyperbolic taper. Source + VM, ~3 s.
  "tests/unit/steer-lock-taper.test.mjs",
  // ...and the two steer-tuning tables that MUST agree: every PRESET bundle
  // lands exactly on its FEEL level, or clicking RELAX reads CUSTOM. Stated
  // in comments and checked by nothing until it drifted for a week. ~0.05 s.
  "tests/unit/steer-presets.test.mjs",
  // STEER LOCK slider: notch 7 = 0.35 rad after #1206 lockTaper hold. Source pin, ~0 s.
  "tests/unit/steer-tuning-lock.test.mjs",
  "tests/unit/storage-key-prefix.test.mjs",
  "tests/unit/store-cross-tab.test.mjs",
  // ...and its sibling: the PREFIX is not the whole contract. Two features
  // once owned apex26.brakeCue with incompatible types (fixed by renaming the
  // ribbon flag to lineBrakeCue); this still asks that one key means one type.
  "tests/unit/store-key-types.test.mjs",
  "tests/unit/store-registry.test.mjs",
  // STORM (js/race/storm.js): above rain on the arc ladder, rain's grip and tread, heavier rain,
  // a seeded frame-rate-independent lightning schedule, the storm safety car, no STORM chip in rooms. VM, < 1 s.
  "tests/unit/storm-weather.test.mjs",
  "tests/unit/stuck-census.test.mjs",
  // SubagentStop report-contract hook (.claude/hooks/subagent-contract.py): spawns it on fake payloads, < 1 s.
  "tests/unit/subagent-contract-hook.test.mjs",
  "tests/unit/surface-id-parity.test.mjs",
  // APEX_SURVEY_HUD=1: flag parse (query|hash|localStorage) + HUD-visible stub without race warm. Pure, ~0.1 s.
  "tests/unit/survey-hud.test.mjs",
  // Suzuka figure-8 green span must sit flush on the lifted ribbon (clearance ≤ 0.5 m) — a prior overheadSpan at clearance 8.6 hung ~8 m above the SRTM-baked back-straight. Pure verify-track diagnostics, ~2 s.
  "tests/unit/suzuka-crossover-span.test.mjs",
  "tests/unit/sweep-shards.test.mjs",
  "tests/unit/sync-pr-robust.test.mjs",
  "tests/unit/team-livery.test.mjs",
  "tests/unit/team-style-relief.test.mjs",
  "tests/unit/telemetry-trace.test.mjs",
  // Round-2: a DPR change under unchanged boxes refits the telemetry map canvas.
  "tests/unit/telemetry-view-resize.test.mjs",
  "tests/unit/terrain-falloff.test.mjs",
  "tests/unit/terrain-normals.test.mjs",
  "tests/unit/terrain-y.test.mjs",
  "tests/unit/test-bg-outcome.test.mjs",
  "tests/unit/test-coverage-audit.test.mjs",
  "tests/unit/test-groups-generated.test.mjs",
  "tests/unit/test-groups.test.mjs",
  "tests/unit/test-observed.test.mjs",
  "tests/unit/tex-census.test.mjs",
  "tests/unit/thermal-drift.test.mjs",
  "tests/unit/three-inspector.test.mjs",
  // ...and THROTTLE = LATCH, which shares digital-steer's VM harness and runs
  // in 0.1 s: the pedal is the one control that can be left ON, so the drop on
  // blur/reset belongs in the edit loop rather than in a browser group.
  "tests/unit/throttle-latch.test.mjs",
  "tests/unit/title-art.test.mjs",
  // Round-2: VS FRIEND writes flow/selection only after the net bundle lands and announces a refused load.
  "tests/unit/title-flow.test.mjs",
  "tests/unit/title-home-scene-prepaint.test.mjs",
  "tests/unit/title-menu-even.test.mjs",
  // three's per-frame tick once per drawn frame on WebGL2 (the pump), WebGPU untouched: the real pumpAnimation over a fake three Animation, and the install gate.
  "tests/unit/tlx-anim-pump.test.mjs",
  "tests/unit/tlx-car-shadow-cpu.test.mjs",
  "tests/unit/tlx-chunked-lifecycle.test.mjs",
  "tests/unit/tlx-cull-shadow-pack.test.mjs",
  // A throw in one TLX subsystem costs that subsystem only: the car/lamp shadow
  // pass no longer clears the SUN flag; a retired post chain is rebuilt at the
  // next realloc and a post-only death keeps the bound label.
  "tests/unit/tlx-fail-scope.test.mjs",
  // TLX perf hunt 3 (lane TLX-1): three's real WebGPURenderer over a no-op WebGL2 compiles the real lit material; GLSL pins (no env cube when opted out) + tlx.js source pins.
  "tests/unit/tlx-hunt3.test.mjs",
  // TLX perf hunt 4 (lane RENDER-S, A-H1): bufferSubData bytes over three r186 on the fake WebGL2 — the plain-Mesh instance streams (batches, mirror views, R1 runs, FX streams) upload 0 B unchanged and exactly the written range when written; the real InstancedMesh caster keeps Dynamic.
  "tests/unit/tlx-hunt4.test.mjs",
  // TLX perf hunt 4 (lane TLX-W): A-W2 4-byte vertex strides on three's WebGL2 path (the real packer, both ways; the lit GLSL reads the widened colour as vec3); A-H5 the mirror target's capped mip chain (the real prepareMirrorTarget over three r186); A-P1 the scene depth invalidated on frames whose post reads none of it (the real post chain); A-W1 the program warm's draw stage (the real startProgramWarm: 1x1 draws, never the canvas, state restored).
  "tests/unit/tlx-hunt4b.test.mjs",
  // TLX perf hunt 4 (lane TLX-H4): A-H4 the real tlx-shadow caster as a plain attribute-instanced Mesh (Stream, no UBO pad) over three r186 on the fake WebGL2 with a GPU-buffer model — each pass's draw reads its own rows, bytes = rows written, 0 on a render that wrote none; apex26.tlxCasterAttr=0 is the padded Dynamic InstancedMesh. B-F3.1 the real program warm defers the mirror stage on AUTO to the first mirrorBegin (apex26.tlxMirWarmLazy=0 eager).
  "tests/unit/tlx-hunt4c.test.mjs",
  // TLX's instanced cull reuses its resident pack by surviving CELL SET
  // (InstCells, GLX/WGX parity); lifts the real cullInstances/updateInstances.
  "tests/unit/tlx-inst-cells.test.mjs",
  // TLX's material cache key is memoised on the opts object; the memo's
  // failure mode is a STALE key, which returns the wrong material and shows
  // up only on screen. Fuzzes the real lifted source over every field.
  "tests/unit/tlx-mat-key-memo.test.mjs",
  // TLX post P2 / audit #6: fixed H/V blur + per-mip bloom materials (no .tex.value ping-pong).
  "tests/unit/tlx-post-fixed-mats.test.mjs",
  // TLX drops a createTexture() source canvas once three has uploaded it,
  // and freeTexture retires the decal materials bound to it (lifted source
  // against three r186's real Texture). The pit-crew mesh cache is capped.
  // Round-2 TLX: post chain retries after death, shadowStr 0 when the sun pass failed, DPR cap on mobileTier, caster geometry clone, warm-guarded releaseGeometry, true-LRU materials, pack CPU copy dropped, devtools-gated globals.
  "tests/unit/tlx-round2.test.mjs",
  "tests/unit/tlx-texture-release.test.mjs",
  // Fixed render targets (#2655): the viewport helper + the raw-screenUV canary. VM + source scan, ~0.1 s.
  "tests/unit/tlx-viewport.test.mjs",
  // tools/check/tolerance-diff.mjs: a widened test tolerance next to production changes fails unless excepted (#1685).
  "tests/unit/tolerance-diff.test.mjs",
  "tests/unit/tooling-fast-runner.test.mjs",
  // Round-2 tooling: dup-keys scans js/render/three, stage/garage-angles refuse unsafe --out, wait-polling-lint parses scripts, generators reject unknown flags, Chromium cache key carries the runner image, pages.yml fast_tier_run expression.
  "tests/unit/tools-a12-guards.test.mjs",
  "tests/unit/tools-runnable.test.mjs",
  "tests/unit/touch-drag-anchor.test.mjs",
  // Drag range widens with speed by the same fraction digitalRateIn sheds.
  // Low / mid / high, the OFF knob, and the same finger travel. VM, < 0.2 s.
  "tests/unit/touch-drag-speed.test.mjs",
  "tests/unit/track-accuracy-validator.test.mjs",
  // Perf hunt 2 (T1/T2/T4): the build's spatial short-cuts answer exactly what the slow path did. Engine prelude in a VM, < 1 s.
  "tests/unit/track-build-grids.test.mjs",
  "tests/unit/track-build-vm-release.test.mjs",
  "tests/unit/track-build-wait.test.mjs",
  "tests/unit/track-centerline-seam.test.mjs",
  "tests/unit/track-codec.test.mjs",
  // js/track/core/def.js (TrackDef) is the ONE raw-def → LIST-entry path for the
  // 52 shipped circuits and the designer's runtime defs: a golden hash per
  // circuit (metadata + materialised points) pins the extraction byte-for-byte.
  "tests/unit/track-def-factory.test.mjs",
  // The track designer SCREEN (js/editor/designer.js + canvas.js) booted over the
  // engine and a minimal DOM: init builds the rail before a design exists, the
  // rail's edits keep the verdict coherent, SAVE / RACE land, the canvas routes a
  // nudge back on the lattice. The 300 ms twin of tests/specs/track-designer.spec.js.
  "tests/unit/track-designer-dom.test.mjs",
  // The track designer's pure core (js/editor/shape|stamps|randomise|validate|codec.js)
  // over the real engine: Dubins lands on its goal for all six words, stamps
  // build as the requested turn, the randomiser is deterministic and valid, the
  // validator reads the engine's centreline; the share code round-trips on the
  // lattice and refuses every bad code with a reason. ~15 s together.
  "tests/unit/track-editor-geometry.test.mjs",
  // The designer's one-click remedies (js/editor/fixes.js) over the real engine:
  // per code a design TrackValidate judges RED, the fix, the re-check; point 0
  // and the zones stay put, apply never throws, fixAll clears a tiny loop and a
  // figure-8 within three rounds and leaves a green RANDOMISE loop alone. ~2 s.
  "tests/unit/track-fixes.test.mjs",
  "tests/unit/track-foundation.test.mjs",
  "tests/unit/track-graph.test.mjs",
  // The designer's insight (js/editor/insight.js): the speed profile is the lap
  // estimate's bit for bit, TURNS bands and their control spans, REPLACE with the
  // fitted arc re-stamps seed 7 green, each FIA Grade 1 amber fires on a crafted
  // design and never RED, TRACK OF THE DAY per UTC day, START FROM traces. ~2 s.
  "tests/unit/track-insight.test.mjs",
  "tests/unit/track-line-circuits.test.mjs",
  "tests/unit/track-line.test.mjs",
  "tests/unit/track-maps-corners.test.mjs",
  "tests/unit/track-night-override.test.mjs",
  "tests/unit/track-preview-plan.test.mjs",
  // RANDOMISE builds clockwise (Σk < 0 through the engine) with the grid side
  // of the start straight ≥ the exit side, over 30 seeds; ~3 s.
  "tests/unit/track-randomise.test.mjs",
  "tests/unit/track-retained-state.test.mjs",
  "tests/unit/track-shot-survey.test.mjs",
  "tests/unit/trackside.test.mjs",
  // Wrap-aware arc buckets vs the O(n) updateCar traffic / slipstream / OT-ahead
  // walks (collide.js helper). Seeded 22-car old-vs-new characterization, no browser.
  "tests/unit/traffic-arc-buckets.test.mjs",
  // Trail-brake turn-in: pedal + yaw damp scale by max(1, mods.braking) so
  // shipped kits keep ≥0.6× coasting yaw (was −0.224). createGame×2 ~5 s.
  "tests/unit/trail-brake-turnin.test.mjs",
  "tests/unit/tree-counts-catch.test.mjs",
  "tests/unit/trim-comments.test.mjs",
  // TUMFTM racetrack-database CSV → designer envelope (tools/track/tumftm-import.mjs).
  // Synthetic fixture only — no network, no LGPL geometry in the tree. ~1 s.
  "tests/unit/tumftm-import.test.mjs",
  "tests/unit/twin-drift.test.mjs",
  "tests/unit/twin-fidelity.test.mjs",
  "tests/unit/twinned-specs.test.mjs",
  // The tyre model's rules (js/physics/tyre-model.js): OFF is a true no-op,
  // life is a fraction of the SCHEDULED distance, the catalog's life ladder
  // is a usable strategy range, the thermal layer warms/grains/blisters, and
  // the axle shares average to 1. Pure numbers in a VM, ~0.25 s.
  "tests/unit/tyre-model.test.mjs",
  // Front peak slip abscissa (CURVE_PEAK_X_F): 6–9° at CS_FRONT, rear path frozen.
  "tests/unit/tyre-peak-slip.test.mjs",
  // Factory/sig tyre recipes after #1190 open rims: distinct geom + cover copy needs cover:1.
  "tests/unit/tyre-recipes-open-rim.test.mjs",
  // Job 4: slip-driven tyre squeal — threshold, lat/long monotonic gain+pitch,
  // setTargetAtTime ramps, zero per-frame nodes. Fake-audio VM, < 1 s.
  "tests/unit/tyre-squeal-slip.test.mjs",
  "tests/unit/ui-experience.test.mjs",
  "tests/unit/ui-explorer-core.test.mjs",
  "tests/unit/ui-explorer-report.test.mjs",
  "tests/unit/ui-explorer.test.mjs",
  // ui-fit r7: camera tuner rail-off portrait — #ct-previews placed in grid
  // row 3, one minmax column, #ct-close / #ct-prev-* --tap-paint floors
  // (#camtune-inner / #ct-* only; lighting untouched).
  "tests/unit/ui-fit-camtune-portrait-r7.test.mjs",
  // ui-fit round 5: camera tuner compact foot/preview/copy-from --tap-paint
  // floors (#camtune-inner only; lighting untouched).
  "tests/unit/ui-fit-camtune-tap-r5.test.mjs",
  // ui-fit round 6: flyby editor compact foot / pose-select --tap-paint
  // floors (#flyby-inner / #fb-* only; camera/lighting untouched).
  "tests/unit/ui-fit-flyby-tap-r6.test.mjs",
  // ui-fit round 6: Garage LIVERY grid chips floor at --tap/--tap-paint
  // (survey rank 1; 26×26 vs 52, 82 soft taps) and SATIN/CHROME tags do
  // not ellipsis (20 trunc). css/carsetup.css #cs-options.cs-liv-grid only.
  "tests/unit/ui-fit-garage-livery-r6.test.mjs",
  // ui-fit r6 rank 5: lighting over flyby stacked dock — side-by-side on
  // wide short, #lt-rows 3-row floor; camera / #fb-* tap floors untouched.
  "tests/unit/ui-fit-lighting-flyby-stack.test.mjs",
  // ui-fit round 6: lighting tuner compact foot / short-tab --tap-paint
  // floors (#lighting-inner / #lt-* only; camera untouched).
  "tests/unit/ui-fit-lighttune-tap-r6.test.mjs",
  // ui-fit round 6: Photo Studio #ps-* setting-row selects floor at
  // --tap-paint (portrait 114×43 soft taps; landscape already clean).
  "tests/unit/ui-fit-photostudio-tap-r6.test.mjs",
  // ui-fit round 6: Settings ACCESSIBILITY #pm-panel-a11y pad / scroll-pad
  // so the last colourblind help clears BACK (survey rank 8; 844×390).
  "tests/unit/ui-fit-settings-a11y-r6.test.mjs",
  // ui-fit round 6: Settings APPEARANCE studio reflow + pad above BACK
  // (survey rank 7; 300×3604 @ 390×844, 222×5059 @ scale 200).
  "tests/unit/ui-fit-settings-appearance-r6.test.mjs",
  // ui-fit round 3: tap floors (settings HUD checklist, photo studio, How to
  // Play compact chips) and ScrollFade selectors for #cr-body / .td-rail.
  "tests/unit/ui-fit-tap-scroll-round3.test.mjs",
  // ui-fit round 6: Track Designer tool-strip labels wrap+balance and
  // floor taps at --tap (survey r5 rank 4; 36–57px clip on 390×844 / 844×390).
  "tests/unit/ui-fit-trackdesigner-toolbar-r6.test.mjs",
  "tests/unit/ui-fixer-uncommitted.test.mjs",
  "tests/unit/ui-improve-pass.test.mjs",
  "tests/unit/ui-inspector-audit.test.mjs",
  "tests/unit/ui-inspector-css.test.mjs",
  "tests/unit/ui-inspector-transitions.test.mjs",
  "tests/unit/ui-journey-career.test.mjs",
  "tests/unit/ui-journey-race.test.mjs",
  "tests/unit/ui-journey-session.test.mjs",
  "tests/unit/ui-sheets-audit.test.mjs",
  "tests/unit/uilayers-modal-order.test.mjs",
  "tests/unit/validation-cli.test.mjs",
  "tests/unit/verify-live.test.mjs",
  "tests/unit/vertex-pack.test.mjs",
  // tools/viewer: the 3D viewer page carries the engine-built car (within 0.5 mm) and circuit. ~6 s, no browser.
  "tests/unit/viewer.test.mjs",
  "tests/unit/visual-oracle.test.mjs",
  "tests/unit/vm-page-lifecycle.test.mjs",
  "tests/unit/voice-pack.test.mjs",
  "tests/unit/vstd-invariant.test.mjs",
  "tests/unit/wait-for.test.mjs",
  "tests/unit/wait-polling.test.mjs",
  "tests/unit/wall-clamp.test.mjs",
  "tests/unit/wall-end-face-vm.test.mjs",
  // The falling rain follows WETNESS through a weather arc: shown at 0.25, the
  // storm tier and rain loop at 0.72, hidden again when a drying arc drops below
  // 0.25 — six arcs sampled at 10 points each. VM-executed weather-arc.js, ~1 s.
  // Round-2: WATCH scrub `input` events coalesce to one seek per rAF; `change` seeks at once; stop() drops a pending seek.
  "tests/unit/watch-transport-scrub.test.mjs",
  "tests/unit/weather-arc-plan.test.mjs",
  "tests/unit/weather-arc-rain.test.mjs",
  // A weather-arc step cross-fades sun, cloud, ambient and fog over WX_BLEND_S;
  // a chip or __apex.weather() still cuts. VM-executed atmosphere.js, ~0.1 s.
  "tests/unit/weather-blend.test.mjs",
  "tests/unit/webgpu-lifecycle.test.mjs",
  // WET_GRIP orders the treads as treadFor picks them: inter owns the damp, full wet the storm. VM, < 0.2 s.
  "tests/unit/wet-grip-ladder.test.mjs",
  "tests/unit/wgsl-bindings.test.mjs",
  // The claim half of who-is-on-it (pure parse + the empty-tree commit shape)
  // and deploy --pr's REST fallback against a fake curl; both < 1 s, both
  // guard the two tools a session reaches for at push time.
  // Round-2 WGX: buffers freed while an encoder (or the pending shadow encoder) is live retire through _retiredBufs; the swapchain self-test pops its validation scope before its first await.
  "tests/unit/wgx-free-retire.test.mjs",
  "tests/unit/who-is-on-it.test.mjs",
  // Job 4: speed-scaled wind — crawl gate, monotonic gain+cutoff, pit-lane
  // quiet vs top-speed rush, setTargetAtTime ramps, zero per-frame nodes.
  "tests/unit/wind-speed.test.mjs",
  // WIND (js/race/wind.js): a pure function of (seed, circuit, weather, clock), fog calm and a storm gusty,
  // gusts and the side force capped, head/tail wind a few km/h of top speed, OFF a true no-op. VM, ~1 s.
  "tests/unit/wind.test.mjs",
  // tools/check/workflow-lint.mjs: actionlint + zizmor (offline) over .github/workflows; fails a planted bad workflow, passes the tree.
  // Skips loudly when a binary is absent; the CI `lints` job fails a SKIP. ~3 s.
  "tests/unit/workflow-lint.test.mjs",
  "tests/unit/xr-backend-pin.test.mjs",
  "tests/unit/xr-cull-union.test.mjs",
  "tests/unit/xr-opts.test.mjs",
  // ...and WebXR Phase 0: seated-rig compose, controller→remoteSample mapping,
  // sessionInit feature flags, vendored XRButton/WebGLXRFallback presence. ~0.1 s.
  "tests/unit/xr-phase0.test.mjs",
  // ...and XRPlan / XROpts (task 20): pure path selection table + bootPick
  // never writes apex26.gfxBackend. ~0.1 s.
  "tests/unit/xr-plan.test.mjs",
  "tests/unit/xr-visibility-pause.test.mjs",
  // Speed-scaled yaw damp (local SPEED_YAW_* in player-forces): step-steer
  // overshoot ≤12% at 61.1 m/s / ≤14% at 83.3 m/s; ≤50 m/s and lift-off
  // unchanged. createGame once, ~2.5 s.
  "tests/unit/yaw-damp-speed.test.mjs",
  // Low-speed yaw/vLat substep (LOW_YAW_V=8): kills period-2 Δr chatter at
  // 3–4 m/s full lock on pin + shipped seats; ≥8 m/s bit-identical. ~5 s.
  "tests/unit/yaw-low-speed-substep.test.mjs",
  // @gen-test-groups:end
]);

const loadavgLine = () => {
  try {
    const [a, b, c] = os.loadavg().map((n) => n.toFixed(2));
    return `loadavg=${a} ${b} ${c}`;
  } catch (_) {
    return "loadavg=?";
  }
};

const fmtDur = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

/* LONGEST FIRST (2026-09-25). The pool used to start files in LIST order, and
 * the list is ordered by when a file was added, so the ~30-60 s files (game-vm,
 * parts-distinct-mesh, car-mesh-anchors, session-entry-vm …) started wherever
 * they happened to sit — one of them starting last leaves the other workers
 * idle while it runs alone. Scheduling longest-processing-time first is the
 * textbook fix for that tail (Graham's LPT bound: within 4/3 of optimal).
 *
 * The durations come from the last full run on THIS box when there is one
 * (artifacts/logs/tooling-fast-timings.json, written at the end of every full
 * run) and otherwise from the committed tests/data/tooling-fast-timings.json,
 * which is what a fresh CI runner reads. A file with no recorded duration is
 * scheduled FIRST: an unmeasured file is the one that may be slow, and a few
 * fast files started early cost nothing. `--order=list` restores list order;
 * `--record` rewrites the committed table from this run. */
export const TIMINGS_FILE = path.join(ROOT, "tests/data/tooling-fast-timings.json");
const LOCAL_TIMINGS_FILE = path.join(LOGDIR, "tooling-fast-timings.json");

/** { <repo-relative file>: ms } — local measurements override committed ones. */
export function loadTimings(files = [TIMINGS_FILE, LOCAL_TIMINGS_FILE]) {
  const out = {};
  for (const f of files) {
    try { Object.assign(out, JSON.parse(fs.readFileSync(f, "utf8")).ms || {}); } catch (_) { /* absent or unreadable: no hint */ }
  }
  return out;
}

/** Longest recorded duration first; unmeasured files ahead of all of them, in
 *  list order; ties keep list order (the sort is stable). Pure. */
export function scheduleLongestFirst(files, timings = {}) {
  const key = (f) => { const v = timings[path.isAbsolute(f) ? path.relative(ROOT, f) : f]; return typeof v === "number" ? v : Infinity; };
  return files.map((f, i) => ({ f, i, ms: key(f) }))
    .sort((a, b) => (b.ms - a.ms) || (a.i - b.i)).map((x) => x.f);
}

/** Estimate the local worker critical path for a selected file set. The real
 * runner uses the same longest-first order and assigns each file to the least
 * loaded worker, so this is a useful pre-PR wall-time estimate rather than a
 * misleading sum. Unknown files remain visible in `unmeasured`; their cost is
 * intentionally not invented. */
export function estimateToolingFast(files, timings = loadTimings(), jobs = 1) {
  const workerCount = Math.max(1, Number(jobs) || 1);
  const loads = Array(workerCount).fill(0);
  const rows = files.map((file, index) => ({
    file,
    index,
    ms: typeof timings[file] === "number" ? timings[file] : null,
  })).sort((a, b) => (b.ms ?? -1) - (a.ms ?? -1) || a.index - b.index);
  const unmeasured = [];
  for (const row of rows) {
    if (row.ms === null) unmeasured.push(row.file);
    const worker = loads.indexOf(Math.min(...loads));
    loads[worker] += row.ms ?? 0;
  }
  return {
    totalMs: loads.reduce((sum, ms) => sum + ms, 0),
    criticalPathMs: Math.max(...loads),
    workerMs: loads,
    unmeasured,
  };
}

/** The `# tests / # pass / # fail / # skipped / # todo / # cancelled` footer of a TAP run (null for a missing one). */
export function tapSummary(text) {
  const out = {};
  for (const k of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const m = new RegExp(`^# ${k} (\\d+)\\s*$`, "m").exec(String(text || "").replace(/\r/g, ""));
    out[k] = m ? Number(m[1]) : null;
  }
  return out;
}

/** Files whose tests are LEGITIMATELY all-skipped on some machines (a precondition the runner cannot
 *  provide). Row = repo-relative file -> why. Empty by default: a skip-everything file is a red until
 *  somebody writes the reason down. */
export const ALL_SKIP_OK = Object.freeze({});

/**
 * Exit 0 is not a verdict: a file that registers no test, skips every test, or calls
 * `process.exit(0)` before its tests run all exit 0 with a green-looking TAP footer.
 * Returns the reason a CLEAN exit does not count as a pass, or null.
 * @param {string} text  the child's stdout+stderr
 * @param {string} [file] repo-relative path (for the ALL_SKIP_OK opt-out)
 */
export function emptyRunReason(text, file = "") {
  const s = tapSummary(text);
  if (s.tests === null) return "no TAP footer (the file exited before the runner finished; process.exit(0)?)";
  if (s.tests === 0) return "ran zero tests (an empty file, or process.exit(0) before the tests ran)";
  // Measured (node v-current): a file that registers no test — an empty module, or one that calls
  // process.exit(0) at import — is counted by `node --test` as ONE passing test named after the file.
  if (s.tests === 1 && file) {
    const only = /^(?:not )?ok \d+ - (.+)$/m.exec(String(text || "").replace(/\r/g, ""));
    const base = file.split("/").pop();
    if (only && only[1].trim().endsWith(base)) return "registered no tests (node counted the file itself as the one test; an empty module or process.exit(0) at import)";
  }
  const done = s.pass + s.fail + s.skipped + s.todo + s.cancelled;
  if (done !== s.tests) return `only ${done} of ${s.tests} registered tests reported (process.exit(0) mid-run?)`;
  if (s.pass === 0 && !Object.hasOwn(ALL_SKIP_OK, file)) {
    return `no test passed (${s.skipped} skipped, ${s.todo} todo) — a file that skips everything verifies nothing; `
      + "list it in ALL_SKIP_OK with the reason if the skip is legitimately conditional";
  }
  return null;
}

/** Pull the diagnosable TAP failure lines from a child's stdout+stderr.
 *  Node's TAP puts deepEqual diffs under `error: |-` and array members under
 *  `actual:` / `expected:` as `0: …` rows — keeping only the bare keys left
 *  Structural guards red on 2026-10-04 with empty Expected/Received
 *  (run 37171017859, ratchets.test.mjs). */
export function tapFailureDetail(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  let inError = false;
  for (const L of lines) {
    if (/^\s+(error:|name: 'AssertionError'|expected:|actual:|operator:)/.test(L)) {
      out.push(L);
      inError = /^\s+error:/.test(L);
      continue;
    }
    // Indexed actual/expected members: `    0: 'js/net/lobby.js lines: …'`
    if (/^\s+\d+:/.test(L)) { out.push(L); inError = false; continue; }
    // YAML block-scalar body under `error: |-` (the deepEqual +/- dump).
    if (inError && /^\s{4,}\S/.test(L)) { out.push(L); continue; }
    if (inError && /^\s*$/.test(L)) { out.push(L); continue; }
    inError = false;
  }
  return out;
}

/* A HUNG FILE FAILS BY NAME. Without a bound a file that never exits (an open
 * handle, a never-settled await) runs until the CI job's timeout-minutes, and
 * the job reports `cancelled` with every START line but no verdict — the shape
 * AGENTS.md rule 8 teaches everyone to read as a busy runner. Two layers:
 *   --test-timeout   node's own bound (ms, default Infinity:
 *                    https://nodejs.org/api/cli.html#--test-timeout). MEASURED:
 *                    under `node --test <file>` the FILE is itself a test of
 *                    the runner and inherits it, so this bounds each test AND
 *                    the file's tests as a whole — a stuck one fails as
 *                    `not ok … test timed out after Nms` with its name;
 *   the file timer   a hard wall per FILE, a minute later, because the
 *                    timeout cannot see work outside a test (a handle that
 *                    keeps the process alive after the last test). SIGKILLs
 *                    the child's whole process group, logs FAIL reason=timeout.
 * SIZED FOR A LOADED BOX: flyby-shots, the slowest file, measured 370 s at
 * loadavg ~15 on 4 cores (2026-09-25) and hit a 300 s bound at loadavg 20, so
 * 540 s; the 600 s wall still lands inside ci.yml's 15-minute guards job for a
 * file that starts first, which longest-first makes the slow ones do.
 * APEX_TOOLING_TEST_TIMEOUT_S / APEX_TOOLING_FILE_TIMEOUT_S override both. */
const PER_TEST_TIMEOUT_MS = (Number(process.env.APEX_TOOLING_TEST_TIMEOUT_S) || 540) * 1000;
const PER_FILE_TIMEOUT_MS = (Number(process.env.APEX_TOOLING_FILE_TIMEOUT_S) || 600) * 1000;

/**
 * Run the structural suites one file at a time.
 * @param {string[]} [files]
 * @param {{ logPath?: string, isolatedFiles?: string[] }} [opts]
 * @returns {{ ok: boolean, passed: number, failed: number, results: object[], notStarted: number }}
 */
export async function runToolingFast(files = [...TOOLING_FAST_FILES], opts = {}) {
  const jobs = Math.max(1, Number(opts.jobs) || 1);
  const logPath = opts.logPath || LOGFILE;
  const testTimeoutMs = Number(opts.testTimeoutMs) || PER_TEST_TIMEOUT_MS;
  const fileTimeoutMs = Number(opts.fileTimeoutMs) || PER_FILE_TIMEOUT_MS;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const timings = opts.order === "list" ? {} : (opts.timings || loadTimings());
  if (opts.order !== "list") files = scheduleLongestFirst(files, timings);
  const lines = [];
  const emit = (msg) => {
    const line = `[tooling-fast] ${msg}`;
    console.log(line);
    lines.push(line);
  };

  // The ready stamp names the tree this run MEASURED (tools/lib/work-tree-id.mjs),
  // not HEAD read afterwards: the edit loop runs the suite on a dirty tree, and
  // a stamp of HEAD blessed a committed tip the suite never saw (ledger M36).
  // Only a full suite stamps, so only a full suite pays for the tree hash.
  const rel = (f) => (path.isAbsolute(f) ? path.relative(ROOT, f) : f).replace(/\\/g, "/");
  // car-shade's unchanged CPU benchmark measured 1875 ms alongside other
  // files versus 293–562 ms alone. game-vm's unchanged 12 s boot/race wall
  // measured 40.5 s alongside other VM files versus 8.03 s alone. Run these
  // performance contracts exclusively; assertions, deadlines and pool limits stay intact.
  const isolated = new Set((opts.isolatedFiles || loadGroups().isolatedFiles || []).map(rel));
  const isolatedFiles = files.filter((file) => isolated.has(rel(file)));
  files = [...isolatedFiles, ...files.filter((file) => !isolated.has(rel(file)))];
  const ran = new Set(files.map(rel));
  const fullSuite = ran.size === TOOLING_FAST_FILES.length && TOOLING_FAST_FILES.every((f) => ran.has(f));
  const startHead = fullSuite ? spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim() : "";
  const startTree = fullSuite ? workTreeId(ROOT) : null;

  const suiteStart = Date.now();
  const startedAt = new Date(suiteStart).toISOString();
  emit(`suite start at=${startedAt} files=${files.length} concurrency=${jobs} ${loadavgLine()}`);
  const unmeasured = files.filter((f) => typeof timings[path.isAbsolute(f) ? path.relative(ROOT, f) : f] !== "number").length;
  emit(opts.order === "list" ? "order=list" :
    `order=longest-first (${files.length - unmeasured} with a recorded duration, ${unmeasured} unmeasured scheduled first) ` +
    `test-timeout=${fmtDur(testTimeoutMs)} file-timeout=${fmtDur(fileTimeoutMs)}`);

  if (isolatedFiles.length) emit(`isolated prefix=${isolatedFiles.map(rel).join(",")} before parallel pool; order applies within each phase`);

  const results = [];
  let passed = 0;
  let failed = 0;
  // Each child leads its own process group (see runOne), so a signal to THIS
  // process no longer reaches them by itself: forward it, then exit, or an
  // interrupted run (Ctrl-C, test-bg --stop) would orphan every file in flight.
  const live = new Set();
  // NODE_TEST_CONTEXT is how node's runner marks the process it spawned for a
  // test file. Inherited by a nested `node --test` (this runner called from a
  // test, e.g. tooling-fast-runner.test.mjs), it switches that child into
  // report-to-parent mode, where a failing or hung file exits 0 — measured:
  // both hang tests "passed" until this line. Each child is a fresh runner.
  const childEnv = { ...process.env, ...augmentNodeCompileCache(process.env, ROOT) };
  delete childEnv.NODE_TEST_CONTEXT;
  const reap = (sig) => {
    for (const c of live) { try { process.kill(-c.pid, "SIGKILL"); } catch (_) { /* already gone */ } }
    process.exit(sig === "SIGINT" ? 130 : 143);
  };
  const onSig = { SIGINT: () => reap("SIGINT"), SIGTERM: () => reap("SIGTERM") };
  for (const [s, fn] of Object.entries(onSig)) process.on(s, fn);

  // One file, start to verdict. spawnSync CANNOT be pooled — it blocks the only
  // thread, so N of them still run strictly one after another; the first draft of
  // this did exactly that and was serial with extra ceremony. Async spawn, awaited.
  const runOne = (file, n) => new Promise((resolve) => {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    const rel = path.relative(ROOT, abs);
    const t0 = Date.now();
    emit(`START ${n}/${files.length} ${rel} at=${new Date(t0).toISOString()} ${loadavgLine()}`);

    if (!fs.existsSync(abs)) {
      failed++;
      const dur = Date.now() - t0;
      emit(`FAIL  ${n}/${files.length} ${rel} duration=${fmtDur(dur)} reason=missing-file`);
      results.push({ file: rel, ok: false, durationMs: dur, exit: null, missing: true });
      return resolve();
    }

    // detached: the child leads its own process group, so the file timer can
    // kill `node --test` AND the per-file subprocess it spawns in one signal.
    // The failure parser below consumes TAP. Node 23+ defaults to spec even
    // when stdout is piped, so the wire format must be explicit.
    // https://nodejs.org/api/test.html#test-reporters
    const child = spawn(process.execPath,
                        ["--test", "--test-reporter=tap", "--test-concurrency=1", `--test-timeout=${testTimeoutMs}`, abs],
                        { cwd: ROOT, env: childEnv, detached: true });
    live.add(child);
    let out = "", err = "", timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, "SIGKILL"); } catch (_) { try { child.kill("SIGKILL"); } catch (_) { /* gone */ } }
    }, fileTimeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { err += String(e && e.message || e); });
    child.on("close", (status, signal) => {
    clearTimeout(timer);
    const r = { status, stdout: out, stderr: err };
    const dur = Date.now() - t0;
    const cleanExit = r.status === 0 && !timedOut;
    const empty = cleanExit ? emptyRunReason((r.stdout || "") + (r.stderr || ""), rel.replace(/\\/g, "/")) : null;
    const ok = cleanExit && !empty;
    if (ok) passed++; else failed++;
    const verdict = ok ? "PASS" : "FAIL";
    live.delete(child);
    emit(`${verdict}  ${n}/${files.length} ${rel} duration=${fmtDur(dur)} exit=${r.status ?? signal}` +
      `${timedOut ? ` reason=timeout (no exit within ${fmtDur(fileTimeoutMs)}; process group killed)` : ""}` +
      `${empty ? ` reason=empty-run (${empty})` : ""} ${loadavgLine()}`);
    if (!ok) {
      const text = ((r.stdout || "") + (r.stderr || "")).replace(/\r/g, "");
      const notoks = text.split("\n").filter((L) => /^not ok /.test(L));
      if (notoks.length) {
        emit(`  | failed ${notoks.length} subtest(s):`);
        for (const L of notoks) emit(`  | ${L}`);
      }
      // Assertion bodies sit under each `not ok` TAP block. Keep them short
      // (name/error/expected/actual + deepEqual body) so a FAIL is diagnosable
      // without dumping the whole TAP stream into the sequential log.
      const detail = tapFailureDetail(text);
      for (const L of detail.slice(0, 40)) emit(`  | ${L.trimEnd()}`);
      if (detail.length > 40) emit(`  | … ${detail.length - 40} more assertion lines`);
      if (!notoks.length && !detail.length) {
        const tail = text.trim().split("\n").slice(-20);
        for (const L of tail) emit(`  | ${L}`);
      }
    }
    results.push({ file: rel, ok, durationMs: dur, exit: r.status });
      resolve();
    });
  });

  // N in flight, each worker pulling the next index off a shared cursor. Node's
  // own --test-concurrency stays 1 INSIDE each child: the parallel unit is one
  // FILE per process, which is what these suites are isolated at. Two files
  // sharing a fixed path or port would surface here, which is why this was
  // measured against a serial run rather than assumed equivalent.
  // --bail (CI guard shards, 2026-10-16 CI jobs review): once any file has
  // failed, no further file STARTS; the files already in flight finish, so the
  // log still names every failure that was running. A red shard used to run a
  // mean 5.9 min after its first failure. The verdict line is unchanged.
  const bail = opts.bail === true;
  const entries = files.map((file, index) => ({ file, index }));
  const serialEntries = entries.filter((entry) => isolated.has(rel(entry.file)));
  const parallelEntries = entries.filter((entry) => !isolated.has(rel(entry.file)));
  let started = 0;
  for (const entry of serialEntries) {
    if (bail && failed > 0) break;
    started++;
    await runOne(entry.file, entry.index + 1);
  }
  let next = 0;
  const worker = async () => {
    while (true) {
      if (bail && failed > 0) return;
      const entry = parallelEntries[next++];
      if (!entry) return;
      started++;
      await runOne(entry.file, entry.index + 1);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, parallelEntries.length) }, worker));
  const notStarted = bail && failed > 0 ? files.length - started : 0;
  if (notStarted) emit(`bail: stopped starting files after the first failure; ${notStarted} of ${files.length} file(s) not started`);

  const suiteDur = Date.now() - suiteStart;
  const ok = failed === 0;
  emit(`suite end at=${new Date().toISOString()} duration=${fmtDur(suiteDur)} ` +
    `passed=${passed} failed=${failed} ${loadavgLine()}`);
  // The tree must be the same before and after the run: an edit made while
  // the suite ran (the edit hook blocks only a live BROWSER run) means the
  // verdict is about neither tree.
  const endTree = fullSuite && startTree ? workTreeId(ROOT) : null;
  const stampTree = ok && fullSuite && startTree && startTree === endTree ? startTree : null;
  if (stampTree) emit(`= tree ${stampTree} head ${startHead}`);
  emit(`= run ${ok ? "passed" : "failed"} (${passed} passed, ${failed} failed)`);
  for (const [s, fn] of Object.entries(onSig)) process.off(s, fn);

  fs.writeFileSync(logPath, lines.join("\n") + "\n");
  // Full-suite green on an UNCHANGED tree → stamp it for ready-gate.mjs
  // (draft→ready must not flip without tooling-fast evidence; #1111
  // designer-canvas). The stamp is the START head plus the tree hash the suite
  // measured; ready-gate compares that hash with the tip commit's tree, and
  // the `= tree` line above ties the log to the same run. Subset / shard runs
  // and failures leave any prior stamp alone so a partial re-run cannot bless
  // a tip that never passed the full suite. (`ran` is a set: longest-first
  // reorders `files`.)
  if (stampTree) {
    try {
      const { stampReadySha } = await import("./ready-gate.mjs");
      if (startHead) stampReadySha(startHead, { tree: stampTree });
    } catch (_) { /* stamp is advisory for ready-gate; never fail the suite */ }
  }
  // Every run teaches the next one: the passing files' durations go to the
  // local table (a timed-out or failed file's duration says nothing about its
  // normal cost). --record also rewrites the committed table CI reads.
  const measured = Object.fromEntries(results.filter((r) => r.ok).map((r) => [r.file, Math.round(r.durationMs / 10) * 10]));
  const merge = (file, note) => {
    let prev = {};
    try { prev = JSON.parse(fs.readFileSync(file, "utf8")).ms || {}; } catch (_) { /* first run */ }
    const ms = Object.fromEntries(Object.entries({ ...prev, ...measured }).sort(([a], [b]) => a.localeCompare(b)));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ _doc: note, jobs, ms }, null, 2) + "\n");
  };
  if (opts.localTimingsPath !== null) {
    try { merge(opts.localTimingsPath || LOCAL_TIMINGS_FILE, "local per-file durations from the last tooling-fast run on this box (ms); overrides tests/data/tooling-fast-timings.json"); }
    catch (_) { /* a hint cache; never fail a run over it */ }
  }
  if (opts.record) {
    merge(TIMINGS_FILE, "Per-file tooling-fast durations (ms) for longest-first scheduling (tools/ci/tooling-fast.mjs). " +
      "Rewritten by `node tools/ci/tooling-fast.mjs --jobs=3 --record`; order hints only — a missing or stale entry never fails anything.");
  }
  return { ok, passed, failed, results, logPath, notStarted };
}

export const DEFAULT_JOBS = 1;

/** Paths that force a full tooling-fast run in --changed mode (fail-safe). */
const TOOLING_FAST_CHANGED_RUN_ALL = [
  /^tests\/groups\.json$/,
  /^package(-lock)?\.json$/,
  /^playwright\.config\.js$/,
  /^tools\/gen\/gen-test-groups\.mjs$/,
  /^tools\/manifest\.cjs$/,
  /^index\.html$/,
  /^sw\.js$/,
  /^version\.json$/,
  /^\.github\/workflows\//,
  /^tests\/helpers\//,
  /^tools\/lib\//,
];

const PATH_PIN_RE = /["'`]((?:js|css|tools|types|desktop|docs|tests\/|index\.html|AGENTS\.md|CLAUDE\.md|README\.md|\.claude\/|\.cursor\/|sw\.js|version\.json)[^"'`]+)["'`]/g;

const DOCS_FAST_TESTS = /\/(docs-integrity|agent-config|skill-progressive|hooks-documented|generated-docs|environment-json|comment-citations|agent-surface|agent-fleet)\.test\.mjs$/;

let _pinIndex = null;

function indexPathKey(map, key, testFile) {
  const norm = key.replace(/\\/g, "/");
  let cur = norm;
  while (cur) {
    if (!map.has(cur)) map.set(cur, new Set());
    map.get(cur).add(testFile);
    const slash = cur.lastIndexOf("/");
    if (slash < 0) break;
    cur = cur.slice(0, slash);
  }
}

/** Map repo-relative paths → tooling-fast unit files that pin them in source. */
function buildToolingFastPinIndex(files = TOOLING_FAST_FILES, root = ROOT) {
  const map = new Map();
  for (const f of files) {
    if (f.startsWith("//")) continue;
    const abs = path.join(root, f);
    let src = "";
    try { src = fs.readFileSync(abs, "utf8"); } catch (_) { continue; }
    PATH_PIN_RE.lastIndex = 0;
    let m;
    while ((m = PATH_PIN_RE.exec(src))) indexPathKey(map, m[1], f);
  }
  return map;
}

function pinIndex() {
  if (!_pinIndex) _pinIndex = buildToolingFastPinIndex();
  return _pinIndex;
}

/** Which CI tooling-fast shards (1/2, 2/2) touch any of `files`. */
export function shardsCoveringFiles(files, allFiles = TOOLING_FAST_FILES, shardCount = 2) {
  const want = new Set(files);
  const out = [];
  for (let i = 1; i <= shardCount; i++) {
    const spec = `${i}/${shardCount}`;
    if (applyFileShard(allFiles, spec).some((f) => want.has(f))) out.push(spec);
  }
  return out;
}

/** Changed paths vs the deploy branch (merge-base with origin/DEPLOY_BRANCH). */
function changedVsDeploy(ref = `origin/${DEPLOY_BRANCH}`, root = ROOT) {
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", ref], { cwd: root, encoding: "utf8" }).trim();
    return changedPaths([base], { cwd: root });
  } catch (_) {
    try { return changedPaths(["HEAD~1"], { cwd: root }); } catch (_) { return []; }
  }
}

/** Select tooling-fast unit files for a changed-path list; fail-safe → full suite. */
export function selectToolingFastChanged(changed, opts = {}) {
  const allFiles = (opts.allFiles || TOOLING_FAST_FILES).filter((f) => !f.startsWith("//"));
  const tfSet = new Set(allFiles);
  // `changed` is the real diff size on EVERY path (it used to exist only on `empty`/`matched`, so a whole-floor
  // fallback printed `changed=0`); `because` names the first path that forced the fallback (#2663 follow-up).
  const full = (reason, extra = {}) => ({
    files: [...allFiles],
    reason,
    shards: shardsCoveringFiles(allFiles, allFiles),
    changed: changed.length,
    ...extra,
  });

  if (!changed.length) return { files: [], reason: "empty", shards: [], changed: 0 };

  if (isDocsOnly(changed)) {
    const docsTests = allFiles.filter((f) => DOCS_FAST_TESTS.test(f));
    const files = docsTests.length ? docsTests : allFiles;
    return { files, reason: "docs-only", shards: shardsCoveringFiles(files, allFiles), changed: changed.length };
  }

  const circ = circuitsTouched(changed, opts.ref || "");
  const tracked = changed.filter((f) => TRACKED.some((re) => re.test(f)) && !circ.dataResolved.includes(f));
  if (tracked.length) return full("tracked", { tracked, because: tracked[0] });

  const runAll = changed.find((f) => TOOLING_FAST_CHANGED_RUN_ALL.some((re) => re.test(f)));
  if (runAll) return full("run-all-path", { because: runAll });

  let scripts = opts.scripts;
  if (!scripts) {
    try {
      scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
    } catch (_) {
      return full("no-package-json");
    }
  }
  const receipt = selectionReceipt(changed, scripts);
  if (receipt.reason === "unmatched") return full("unmatched", { unclaimed: receipt.unclaimed, because: (receipt.unclaimed || [])[0] });

  const selected = new Set();
  const index = opts.pinIndex || pinIndex();

  for (const f of changed) {
    const norm = f.replace(/\\/g, "/");
    if (tfSet.has(norm)) selected.add(norm);
    // A file edit has a precise dependency key and may also inherit its
    // nearest directory pins. Do not fall through to the bare top-level
    // `js`/`css`/`tools` key: those generic pins describe the whole tree and
    // made one UI edit select hundreds of unrelated structural tests. A
    // directory edit still reaches its root and remains deliberately broad.
    const fileLike = /\.[^/]+$/.test(norm);
    let cur = norm;
    while (cur) {
      if (fileLike && !cur.includes("/")) break;
      const hits = index.get(cur);
      if (hits) for (const t of hits) selected.add(t);
      const slash = cur.lastIndexOf("/");
      if (slash < 0) break;
      cur = cur.slice(0, slash);
    }
    if (/^tools\/ci\/tooling-fast\.mjs$/.test(norm)) selected.add("tests/unit/tooling-fast-runner.test.mjs");
    if (/^tools\/ci\/test-bg\.mjs$/.test(norm)) selected.add("tests/unit/test-bg-outcome.test.mjs");
  }

  if (!selected.size) return full("no-pin-match");

  const files = allFiles.filter((f) => selected.has(f));
  if (!files.length) return full("no-listed-match");
  return { files, reason: "matched", shards: shardsCoveringFiles(files, allFiles), changed: changed.length };
}

/** The `--changed` header line: reason, the REAL diff size, the files chosen, and the path that forced a fallback. */
export function changedHeader(meta, fileCount) {
  return `[tooling-fast] --changed reason=${meta.reason} changed=${meta.changed ?? 0} files=${fileCount}` +
    `${meta.because ? ` because=${meta.because}` : ""} shards=${(meta.shards || []).join(",") || "none"}`;
}
export const EMPTY_DIFF_MESSAGE = `[tooling-fast] --changed: EMPTY diff against origin/${DEPLOY_BRANCH} — nothing was selected, nothing verified (exit 3).\n` +
  `  Commit or stage your edit, \`git fetch origin ${DEPLOY_BRANCH}\` if the ref is stale, or run without --changed for the whole floor.`;

/** Flags the CLI accepts. Anything else (incl. `--help` typo forms) must ERROR —
 *  never silently start the suite: `--help` used to launch all 300+ files. */
const TOOLING_FAST_FLAGS = Object.freeze([
  "--jobs", "--order", "--record", "--test-timeout", "--file-timeout", "--shard", "--changed", "--bail", "--stop", "--help", "-h",
]);

export const TOOLING_FAST_USAGE = `usage: node tools/ci/tooling-fast.mjs [--stop] [--jobs=N] [--changed] [--bail] [--shard=i/n] [--order=list|longest-first] [--record] [--test-timeout=S] [--file-timeout=S] [file…]
       node tools/ci/tooling-fast.mjs --help`;

/** Split a file list across CI jobs (`--shard=1/2`). Stride, not contiguous. */
export function applyFileShard(files, spec) {
  if (!spec) return files;
  const m = /^(\d+)\/(\d+)$/.exec(String(spec));
  if (!m) throw new Error(`bad --shard=${spec} (want i/n)`);
  const i = Number(m[1]), n = Number(m[2]);
  if (n < 1 || i < 1 || i > n) throw new Error(`bad --shard=${spec}`);
  return files.filter((_, idx) => idx % n === i - 1);
}

/** Parse argv for the CLI entry. Unknown flags throw; `--help`/`-h` set help. */
export function parseToolingFastArgv(argv) {
  const unknown = [];
  for (const a of argv) {
    if (!a.startsWith("--") && a !== "-h") continue;
    if (a === "--help" || a === "-h") continue;
    const name = a.includes("=") ? a.slice(0, a.indexOf("=")) : a;
    if (!TOOLING_FAST_FLAGS.includes(name)) unknown.push(name);
  }
  if (unknown.length) {
    throw new Error(`unknown flag ${unknown.join(", ")}\n${TOOLING_FAST_USAGE}`);
  }
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const args = argv.filter((a) => !a.startsWith("--") && a !== "-h");
  const val = (name) => {
    const a = argv.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : undefined;
  };
  return {
    help: false,
    files: args.length ? args : null, // null = full TOOLING_FAST_FILES
    changed: argv.includes("--changed"),
    bail: argv.includes("--bail"),
    stop: argv.includes("--stop"),
    jobs: val("jobs") ? Number(val("jobs")) : DEFAULT_JOBS,
    order: val("order"),
    record: argv.includes("--record"),
    shard: val("shard"),
    testTimeoutMs: val("test-timeout") ? Number(val("test-timeout")) * 1000 : undefined,
    fileTimeoutMs: val("file-timeout") ? Number(val("file-timeout")) * 1000 : undefined,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let parsed;
  try {
    parsed = parseToolingFastArgv(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (parsed.help) {
    console.log(TOOLING_FAST_USAGE);
    process.exit(0);
  }
  if (parsed.stop) {
    // The sanctioned stop (#2663): the registered run's whole process tree, never `pkill -f` or a hand-typed PID.
    const { stop } = await import("../lib/run-pid.mjs");
    const r = await stop("tooling-fast");
    console.log(r.state === "stopped" ? `[tooling-fast] stopped pid ${r.pid} (${r.killed} processes${r.forced ? `, ${r.forced} killed hard` : ""})`
      : r.state === "stale" ? `[tooling-fast] the registered run (pid ${r.pid}) is already gone` : "[tooling-fast] no registered run");
    process.exit(0);
  }
  {
    const { register, release } = await import("../lib/run-pid.mjs");
    if (register("tooling-fast").ok) process.on("exit", () => release("tooling-fast"));   // a nested run (a test) leaves the outer's record alone
  }
  let files0 = parsed.files;
  let changedMeta = null;
  if (parsed.changed) {
    changedMeta = selectToolingFastChanged(changedVsDeploy());
    files0 = changedMeta.files;
    console.log(changedHeader(changedMeta, files0.length));
    if (changedMeta.reason === "empty") {
      // An empty diff selects zero files and the runner printed `= run passed (0 passed, 0 failed)` with exit 0: a
      // vacuous green that read as proof. Nothing was verified, so say so and fail (exit 3, distinct from a test failure).
      console.error(EMPTY_DIFF_MESSAGE);
      process.exit(3);
    }
  } else if (!files0) {
    files0 = [...TOOLING_FAST_FILES];
  }
  const files = applyFileShard(files0, parsed.shard);
  const { ok } = await runToolingFast(files, {
    jobs: parsed.jobs,
    bail: parsed.bail,
    order: parsed.order,
    record: parsed.record,
    testTimeoutMs: parsed.testTimeoutMs,
    fileTimeoutMs: parsed.fileTimeoutMs,
  });
  process.exit(ok ? 0 : 1);
}
