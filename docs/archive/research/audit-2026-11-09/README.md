# Whole-project audit, 2026-11-09 (Pacific)

A read-everything audit of commit `e8082307`, asked for by Bryce: eight
sibling sessions, each with its own slice and its own subagents, plus the
`code-survey` workflow and seven gap hunters in the coordinating session.
Each finding was re-checked by a second, independent agent before it was
reported, unless its row says UNVERIFIED. This directory is the register:
every report as received, one file per stream.

It is a dated record, not a live list. Fixes are tracked on the pull requests
in the table below and on the GitHub issues that link here.

## What is here

| File | Stream | Rows kept here | Rows withheld |
|---|---|---|---|
| `A-docs-truth.md` | Docs truth and drift | 84 | 6 |
| `B-tests.md` | Tests and testing gaps | 96 | 2 |
| `C-tools-ci.md` | Tools and CI | 68 | 13 |
| `D-agent-surface.md` | Rules, hooks, skills, dispatch | 79 | 42 |
| `F-external-truth.md` | Platform APIs and real-world data | 146 | 17 |
| `G-simulation.md` | Physics, AI and race logic, by reading and by headless runs | 34 | 0 |
| `L-local-hunters.md` | Gap hunters: track designer, overlay / share / workers / VR / assets, the middle 12 circuits | 34 | 0 |
| `W-code-survey-report.md`, `W-code-survey-rows.md` | `code-survey` workflow | 45 | 0 |
| (not in this repo) | Security, privacy and network | 0 | 38 |

704 finding rows in all: 586 here, 118 withheld. The repo is public, so rows
that describe unpatched security holes, ways round the merge gate or the
agent hooks, and intellectual-property exposure are kept out of it at the
owner's request and held in his private page. A withheld row leaves a marker
line in its file.

## What is not here

- **Live play in a browser (sibling E)** had not reported when this was
  written. It will be added as `E-live-play.md`.
- **The `total-audit` workflow's own low-severity list** (about 130 rows) was
  not retrieved: the agent sending it was stopped, and the docs-truth session
  declined to resend. Its eleven high-severity rows are in `A-docs-truth.md`
  as W-01 to W-11.
- **About 330 single-reader low-severity doc rows** (docs-truth DT-77) and
  **about 370 unverified test-reader rows** (tests §2g) stayed in those
  sessions' containers. They are summarised, not listed.

## How far to trust it

- The audited tree was agent-written, and so is this audit. A row marked
  VERIFIED was confirmed by a second agent from `file:line` and the claim
  alone, or by a command whose output is quoted. It was not checked by a
  person.
- Rows the implementing workers later refuted are listed below. Expect more.
- Nothing here was seen on a GPU or a phone. Renderer, audio and layout rows
  say so.
- The owner asked for Opus subagents part-way through. Streams C and the
  `code-survey` workflow ran entirely on Opus; G's readers and some of A, B,
  D and F's first-pass readers ran on the session's default model before the
  instruction arrived. Each file's own model note says which.
- The 2026-season facts in `F-external-truth.md` come from that session's web
  sources, cited per row.

## Rows refuted or corrected after the audit

| Row | Outcome | By |
|---|---|---|
| G S5 (`trackFrom` 7-15 m off) | Size overstated: 0.6-2.4 m past the inside edge; fixed anyway | W2, PR #5268 |
| D K24 / A19 ("phone bridge never had a live run") | Wrong: live runs #5135 and #5168 exist | W16, PR #5275 |
| D K11 (css-play 852x393 "vs 844x390") | 852x393 is the tool's real default | W16 |
| D K18 (`PAD_DZ_DEFAULT` missing) | It exists | W16 |
| D K39 (ui-menu-a11y Escape claim) | The skill was right; the unit test's premise is false | W16 |
| D K05 (audio-debug dead pointers) | They resolve | W16 |
| C TC-66 / F LIC-11 (`examples/` unshipped and unused) | Used by two tools and two tests; kept | W17, PR #5267 |
| F LIC-11 (gpu-capture and Inspector are dead weight on the site) | Both load behind opt-in flags; kept | W13, PR #5276 |

## Fix work

Opus worker sessions, one work item and one draft pull request each, against
`claude/f1-game-project-26h3ng`. No worker merges, adds `land`, or flips a PR
ready.

| # | Work item | Branch | PR |
|---|---|---|---|
| W1 | Deploy stamp misses lazy bundles and the overlay page | `claude/audit-fix-deploy-stamp` | #5260 |
| W2 | `game.js` state bugs, weather grip step, curvature-contract test | `claude/audit-fix-game-state` | #5268 |
| W3 | Points table, help text, lore facts | `claude/audit-fix-rules-text` | |
| W4 | Stream overlay | `claude/audit-fix-overlay` | #5257 |
| W5 | Circuit data in the wrong lap frame (eleven circuits, fleet test) | `claude/audit-fix-circuit-frames` | |
| W6 | Test selection holes in the local floor and CI groups | `claude/audit-fix-test-selection` | #5265 |
| W7 | Guards and tools that pass when they should fail | `claude/audit-fix-guards` | |
| W8 | Dispatch and merge-gate trust checks | `claude/audit-fix-dispatch-trust` | #5261 |
| W9 | Multiplayer relay, seat and reconnect bugs | `claude/audit-fix-netplay` | #5274 |
| W10 | Track designer and VR entry | `claude/audit-fix-editor-xr` | #5263 |
| W11 | three.js r187 renderer mismatches | `claude/audit-fix-tlx-r187` | #5270 |
| W12 | Circuits vs the real places: start lines, pit sides, turn numbers, zones | `claude/audit-fix-circuit-reality` | |
| W13 | Credits, notices, fan-content exposure | `claude/audit-fix-credits-notices` | #5276 |
| W14 | Agent hooks | `claude/audit-fix-hooks` | |
| W15 | Workflow hardening and broken scheduled jobs | `claude/audit-fix-workflows` | |
| W16 | Skills, agent cards, agent docs, the two audit workflows | `claude/audit-fix-agent-docs` | #5275 |
| W17 | Dead tools and stale packaging | `claude/audit-fix-dead-tools` | #5267 |
| W18 | Default season is the real 2026 calendar; career save safety | `claude/audit-fix-season-career` | #5269 |
| W19 | Audio | `claude/audit-fix-audio` | |
| W20 | Lighting knobs, presets, fog slider | `claude/audit-fix-lighting` | |
| W21 | Scenery engine placement and materials | `claude/audit-fix-scenery-engine` | |
| W22 | HUD, broadcast and boot-cover bugs the unit VMs hide | `claude/audit-fix-hud-perf-covers` | |
| W23 | Data Hub feeds | `claude/audit-fix-data-hub` | |
| W24 | Service worker, offline play, install | `claude/audit-fix-pwa-offline` | |
| W25 | Agent tooling, MCP servers, headless hooks | `claude/audit-fix-agent-tooling` | |
| W26 | AI pace and line, input paths, phone controller | `claude/audit-fix-ai-input` | |
| W27 | Reference docs, plans, docs guards | `claude/audit-fix-reference-docs` | |
| W28 | Desktop and mobile packaging | `claude/audit-fix-packaging` | #5293 |
| W29 | Unit tests that cannot fail: game, physics, race, career, net | `claude/audit-fix-tests-behaviour-a` | |
| W30 | Unit tests that cannot fail: CSS, HUD, renderers, helpers, never-run | `claude/audit-fix-tests-behaviour-b` | |
| W31 | Spec and unit-test selection that lets a red merge | `claude/audit-fix-spec-selection` | |
| W32 | Browser specs that cannot fail | `claude/audit-fix-specs` | |

A blank PR cell means the worker had not opened one when this was written.

## Not assigned to a worker yet

- Multiplayer design: longer room codes, a verify step that gates READY, TURN.
- Jerez's start line, and official turn lists for the eleven circuits W5 holds.
- Renderer rows that need a real GPU to judge: upscaler gather sampling and
  ambient-occlusion tap pattern on all three backends, the 16-lamp cap on
  WebKit, shader sampler precision, the opt-in WebGPU backend's FXAA layout
  and frame bind groups.
- The circuit picker's SEASON tab still filters on the `classic` flag.
- Small tool leftovers named by workers: the page list in
  `tools/ci/verify-live.mjs`, the hand-kept list in
  `tests/unit/load-order.test.mjs`, the overlay page's build meta, a duplicated
  condition in `tools/ci/release-provenance.mjs`.
- Whatever the live-play report adds.

## Only the owner can do

- Replacement or provenance for the engine sample, the music and the team
  crests.
- Repository settings that close the remaining gate and secrets findings.
- The `config-ok` label on PRs that touch the gate, hooks or workflows, and
  the ready flip on each PR.
- A look on the phone at the PRs that change handling, scenery, the render
  path, audio or menus. Each such PR says what to look at.
