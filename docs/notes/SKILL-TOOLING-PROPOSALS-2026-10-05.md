# Skill and MCP tooling proposals — 2026-10-05 (round 2)

Thirty read-only Sonnet agents, one per skill, each asked the same five
questions of its own skill: which tool was missing for a realistic task, which
commands have an `apex_*` wrap, where its description collides with a
neighbour, whether it should merge or split, and what in its references no
step uses. One more agent audited the apex-tools wrap map. The parent ran the
browser-side wraps live. Evidence lines (file:line, commands) are in each
agent's report; this note keeps the conclusions.

## 1. One number explains most "keep" verdicts

The always-on skill descriptions total **1595 of the 1600-word budget**
(`tests/unit/agent-config.test.mjs` "always-on instruction surface"). Every
split that the agents found defensible on audience grounds was blocked by that
number alone:

| split | why defensible | lines that would move |
|---|---|---|
| tune-physics → game-feel | juice (shake, hit-stop, audio polish) never co-occurs with a driving-model A/B; different tool chain; it was a separate skill until 2026-09-03 | SKILL.md:80-86 + the three game-feel references, ~192 of 363 |
| agent-view → agent-geometry | geometry is VM-only and never co-occurs with driving policy | track-geometry.md, debug-tracks-sweeps.md |
| playwright-probe car studio → garage-parts-livery **references** (no new skill) | the car chain (carview, render-car, garage-angles) co-occurs with livery edits, which garage already owns; tools/README already tags 9 car tools playwright-probe and 7 garage | SKILL.md:58-64, :117-121, car-studio.md, car-viewer-presets.md (~155 of 720) |

So the first move is a **description word diet**, not a restructure: drop
filler ("being changed or debugged", "in Apex 26", "Use when the user asks
to"), merge doubled clauses, and the budget frees 60–100 words. Then the
tune-physics split becomes affordable; the playwright car-studio move costs
nothing because it is a reference move, not a new description.

**One merge is worth doing: webgl-debug + webgpu-debug → `renderer-debug`**
(hub of ~40 lines: which backend answered, the `diag()` fields, the
soft-present overlay, the fallback ladder, a handoff table; references
`glx.md`, `wgx.md`, `tlx.md`). The bodies share only step 0, so it fails the
mechanical ">50 % shared steps" test, but three facts outweigh it: TLX, the
DEFAULT backend, has no skill at all (only `.claude/rules/render-tlx.md:28`
routes it, to the GLX and WGX skills); every black-canvas report starts with
"which backend am I on?"; and two ~65-word descriptions become one ~100-word
one, which is the only merge that FREES budget. The webgpu-debug agent voted
keep on the same question; its objections (different tool chains, the
"subagents may run only `wgx-validate --static`" rule) are met by keeping the
chains in separate references and the rule at the top of `wgx.md`. Costs:
merge the two routing query files, two smoke recipes, 11 `@skill` tool
headers, `.claude/rules/render-*.md`, the agent-surface and skill-progressive
tests, the README rows.

**One merge was proposed and refuted.** The f1-animation-cameras agent argued
replay-camera should fold into it (both thin, both parent-owned). The
replay-camera agent's counter-case holds: the bodies share under half their
steps (source-owner trace vs an ffmpeg-prerequisite probe chain every garage
task would then load), the smoke recipes and routing queries are separate, and
the name is the only thing that disambiguates "seek to lap 3 keeps the old
anchor". Keep both; fix the descriptions instead (next section).

## 2. Routing hazards: fix with words, not skills

Each row is a pair of descriptions that share words with no handoff, or a
handoff in one direction only. All are a few words each.

| hazard | fix |
|---|---|
| f1-animation-cameras claims "replay seeks" and "Data Hub WATCH" | drop both phrases; replay-camera and data-hub own them |
| data-hub claims WATCH/HIGHLIGHTS "wrong driver" but has no replay-camera handoff; wrong driver after a SEEK is follow-owner state | add "camera snaps / anchor after a seek → replay-camera" to data-hub's body |
| css-play and ui-menu-a11y both match "cramped on short landscape phones" (css-play's own query file routes it to ui-menu-a11y) | ui-menu-a11y owns "cramped / clipped / short landscape phone, UI scale"; css-play keeps the edit loop |
| "stuck" means a stuck AI car (ai-racecraft) and a safety car stuck out (race-incidents-control); neither body states the discriminator | both bodies: flag level ≠ 0 or `caution().sinceT` growing → race-incidents; level 0 with `speed < 7` and `stuckT` growing → ai-racecraft |
| check-changes' pick-tests says physics-core for ai-drive.js; ai-racecraft says `test-bg collisions` | one line in ai-racecraft: pick-tests wins; collisions is optional behaviour evidence |
| survey-track and agent-view both say "terrain-over-road"; only survey-track points back | agent-view description: "an edit to fix it → survey-track / new-track" |
| scenery-dress' description says "floodlights" but its body has no mast helper or lamp pointer | one Helper-families line: masts → docs/SCENERY-API.md §lamps; whether they FIRE → lighting-tuner |
| phone-as-controller pairing is routed by input-controls to a doc, not a skill | pairing/connection → multiplayer-debug (+10 lines, "phone-as-controller pairing" in its description); steering stays input-controls |
| playwright-probe's description lists "number" (livery number legibility is garage's) | drop "number" from playwright-probe |
| asset-pack vs lighting-tuner "flat / plasticky" | asset-pack step 0: read `__apex.assets().uploaded` first |
| tune-physics' steer knobs (maxSlip/expo/speedRef) ARE input-controls' sliders; `grip-steer.js` is in neither knob table | one ownership line each way; add GRIP STEER to both tables |
| nobody owns TLX, the default backend (webgl-debug is GLX-only, webgpu-debug WGX-only) | the renderer-debug merge above; until then, asset-pack's workflow covers TLX material garble and webgl-debug's "Not" clause should say so |
| "black screen after an HDR format change" sits in both renderer descriptions | the merge, or a body line "if `diag().env.backend` != webgl2, stop" in webgl-debug |

## 3. Tools to build, ranked by how many skills asked for the same primitive

1. **`apex-eval.mjs --vm`** (and `agent.mjs --vm`): route the same `a`
   expression through `tools/lib/game-vm.cjs` instead of Chromium. Six
   agents independently proved the VM route in a scratch script (geometry
   stats 20 s for two circuits, lighting resolve 4 s, caution trace, season
   weekend, sponsor settle, ground sweep). One flag unlocks all of them and
   removes a 30–45 s SwiftShader boot from every numeric question. The VM
   reports `bakedLights`/`lampPosts`, not `numLights` (no render loop).
2. **`apex_unit_test {file, pattern?}`**: `node --test` of one file under
   `tests/unit/`. Eight skills run exactly that every session and none has a
   wrap. Browser-free, seconds.
3. **`audit-circuit.cjs <id> [--json]` (new, under tools/track)** = verify-track + clip +
   coplanar + float + props-tris (+ ground) against their baselines, and
   `apex_track_audit` gains a `checks` enum. The same five-command block is
   copied into new-track, scenery-dress and survey-track with different
   subsets and timings; the parent ran all four in 10.6 s.
4. **`--backend`** on `apex_eval`, `apex_hud_shot`, `apex_hud_survey` (the
   CLIs already take `three|webgl2`; a `GLX.*()` expression over MCP today
   silently answers for TLX). `shot.mjs` needs the flag first (copy
   `installProbeInit` from apex-eval); `backend-compare` becomes an
   `apex_job_start` kind (three boots exceed the 180 s sync timeout), and
   gains `--against <git-ref>` for before/after on both backends.
5. **`layout-audit.mjs --size=WxH`**: free-form viewport over the 49-screen
   catalog (today names only, shortest 852x344; an unknown name silently
   selects zero cells).
6. **`ci-watch.mjs --pr N`** and a cancelled-job classification
   (dedupe | superseded | timeout-cap, with elapsed vs `timeout-minutes`):
   today `--sha 917` reads a PR number as a short SHA and prints "no run".
   Exit codes 1/2/3/4/124 are undocumented in the steward skill.
7. Per-domain VM probes, all thin once (1) exists: `caution-trace`,
   `season-weekend`, `sponsor-trace`, `pad-shape`, `seat-probe`,
   `light-why`, `geometry-stats`, `ground-sweep`, `audio-curve`,
   `data-hub-vm` (stubbed clock/fetch: nothing today can set the clock),
   `elevation-preview` (racing-frame in, handles `_sceneryShift`; the
   workflow's "mutate def.elevations on the VM def" recipe is a frame trap:
   LIST defs hold fmap'd `s`, raw TrackDefs hold authored `s`, and the shift
   is undefined before the first `buildCenterline`).
8. `replay-camera-probe.mjs --seek-lap N` (seek is hard-coded to 120 s),
   `arrival-pose.mjs` (sweep `pose()`; the garage snap is a deliberate
   `angle:"cut"` at 1.8 s, eye step 7.9 m), `hud-watch.mjs` (per-tick HUD
   text vs `field()`; note `step()` never runs `updateHud`, only rAF/jump/park
   do, so "step then snapshot" reads stale gap chips, and `field().gapAhead`
   is a progress difference while the HUD shows seconds),
   `esc-chain.mjs` (static Escape-door walk), `number-ink.mjs` (per-surface
   number WCAG ratio), `wgx-validate --tod night` (the night lamp path is
   never compiled by the default validate), `player-dyn --set k=v --speed`,
   `bloat-scan --refs` (the scan cannot see references today),
   `shell-stale.mjs` (live build/meta/sha verdict), `pr-status.mjs`.

## 4. Wrap map (26 `apex_*`)

No skill's numbered workflow depends on a wrap; wraps appear only in example
blocks (real in-step cites: `apex_garage`, `apex_hud_*`, `apex_graph_parity`).
Live today: `apex_track` open/shot/eval/track/sheet/diff/close all work
(boot 20 s, build 5–8 s, shot 10–25 s); `apex_ui_fit` 14 s; `apex_hud_shot`
131 s and it found a real medium overlap (flag × announce on the short phone
at HUD 120). **`apex_shot` is broken**: the wrap passes `out` (a directory) as
shot.mjs's 4th positional, which is `[out.png]`, so it dies after 84 s with
"unsupported mime type null". `cam: "park"` renders the cockpit (a parked car
in the current camera), which the enum does not say.

Audit verdicts: orphan wraps `frame_report` (zero cites), `select_specs`,
`rotate_markings_check`, `doctor` (pins `--tree`, refuses the `--catalog` form
skills use); wire the others into their skills with one line each
(`session_status`, `who_is_on_it`, `ci_status`, `track`, `job_*`,
`car_audit`, `track_audit`). Combine `ui_fit + ui_shot` → `apex_ui`,
`job_start/status/cancel` → `apex_job {op}`, `select_specs` → `pick_tests
specs:true`. Add `apex_job_start` kinds `tooling_fast`, `gate_only`,
`net_unit`, `skill_smoke`, `backend_compare`; retire the foreground
`apex_verify_change_fast` (180 s timeout for a 2–9 min gate). Contract risks:
`apex_job_start` is labelled "Tree" but four kinds boot Chromium and dryRun
skips occupancy; CPU-heavy kinds ignore loadavg and a live test-bg;
`who_is_on_it` git-fetches by default; `url`/`target` sit on all 26 schemas
only to be refused; `apex_agent help` boots Chromium. Doc drift: AGENT-SURFACE
"twelve CLIs", the test title "sixteen" asserting 26.

## 5. Dead weight and doc bugs (per skill, in the reports)

Recurring: "When to use" blocks that restate the frontmatter (career-mode,
pwa, asset-pack, tune-physics, instancing.md); duplicated audit/test command
blocks; stale measured counts in prose. Real doc bugs: mcp-probe recipes
261-324 verdicts on a version.json build number, which deploy-research
forbids (delete, keep "tinyfish" for skill-progressive.test.mjs:54); lighting
bake.md 136-152 claims "no --dry-run" but bake.mjs has it; assets.mjs header
calls ASPHALT a Poly Haven scan (manifest says procedural); new-track's
elevation preview recipe (frame trap above); game-feel-feedback-recipes.md is
Godot/Unity code in a vanilla-JS repo. `gen-shell.mjs` treats an unknown flag
as WRITE mode (an agent's `--help` regenerated every block); `shot.mjs`,
`livery-contrast.mjs`, `rtc-e2e.mjs`, `graph-parity.cjs`, `glx-call-census.mjs`
still boot or run on `--help`. A `glx-triage.mjs` (one GLX boot, one verdict:
lost-context / no-float-FBO / stale-tuner / NaN-exposure / backend-not-GLX /
real-shader-defect) would replace the four hand-run steps of webgl-debug
SKILL.md:33-38.

## 6. Order of work

1. Tool fixes with tests (this branch): `apex_shot` out path, `--help` gates
   on the four tools above, `gen-shell` refuse unknown flags.
2. Description word diet + the hazard rows in §2, then re-run
   `skill-routing-eval.py` (baseline 213/224 under load, ~218 quiet).
3. `apex-eval --vm`, `apex_unit_test`, `audit-circuit` + `track_audit` checks,
   `--backend` on the three wraps.
4. The playwright-probe car-studio reference move; the tune-physics split once
   the budget allows.
