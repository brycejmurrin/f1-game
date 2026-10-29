# Apex 26 — docs

Start here. This page is a **reading order**: what to read, in what order. The
notes, research, archive and plans tables live in [NOTES-INDEX.md](NOTES-INDEX.md)
(split out 2026-10-26); open one only when something cites it.

## Read in this order

**If you are an agent:** `AGENTS.md` → `WORKERS.md` → `VERIFICATION.md` → `ARCHITECTURE-MAP.md` →
`ARCHITECTURE.md` (the section you edit) → `TESTING.md` §1-2 → the one area doc
your change touches → the skill that drives it.

| # | Read | Why |
|---|---|---|
| 1 | [`../AGENTS.md`](../AGENTS.md) | The rules; every flat prohibition lives there. Read all of it. |
| 2 | [WORKERS.md](WORKERS.md) | The worker contract: find and claim work, draft PR, local floor, `land`, cost cap, takeover, labels, the dispatcher. |
| 3 | [VERIFICATION.md](VERIFICATION.md) | Edit-loop, pre-push, docs-only, CI and Pages commands and what each proves. |
| 4 | [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md) | Boot path, layer map, data flow, where to edit what. Ten minutes. |
| 5 | [ARCHITECTURE.md](ARCHITECTURE.md) | The module contract, the `G` façade, the loop, the three renderers. Read your directory's section. |
| 6 | [TESTING.md](TESTING.md) §1-2 | Which GROUP a change needs and how to run it. Per-file table: [TESTING-COVERAGE.md](TESTING-COVERAGE.md); one hook: [AGENT-HOOKS.md](AGENT-HOOKS.md). |
| 7 | the area doc | One row below, only when the task touches it. |
| 8 | the skill | `.claude/skills/README.md` picks it. |

**If you are a person:** [`../README.md`](../README.md) → [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md)
→ [ARCHITECTURE.md](ARCHITECTURE.md) → [PHYSICS.md](PHYSICS.md) or [CAREER.md](CAREER.md) → [TESTING.md](TESTING.md) §1.

## Area docs (load one on demand)

| Doc | Covers |
|---|---|
| [PHYSICS.md](PHYSICS.md) | Driving model, tuning variables, aero/X-mode, overtake gate, the curvature columns. |
| [CAREER.md](CAREER.md) | Career flow, save slots, ratings, economy and R&D. |
| [FLOW.md](FLOW.md) / [USAGE-PATHS.md](USAGE-PATHS.md) | Session state machine; end-to-end player journeys. |
| [SCENERY-API.md](SCENERY-API.md) / [SCENERY-AND-TRACK-BUILD.md](SCENERY-AND-TRACK-BUILD.md) | The `scenery(api)` contract; the track/scenery build pipeline. |
| [LIGHTING.md](LIGHTING.md) / [LIGHTING-TUNER-SLIDERS.md](LIGHTING-TUNER-SLIDERS.md) | Light records, time of day, lamps; every tuner slider (generated). |
| [MULTIPLAYER.md](MULTIPLAYER.md) | The `js/net/` wire, rendezvous, snapshots, phone as controller. |
| [UI-MAP.md](UI-MAP.md) / [UI-EXPLORER.md](UI-EXPLORER.md) / [ui-experience-studio.md](ui-experience-studio.md) | Navigation web and screens; browser exploration toolkit; appearance and Photo Studio contracts. |
| [COMPONENTS.md](COMPONENTS.md) / [CODE-STANDARDS.md](CODE-STANDARDS.md) | CSS class families and owners; JavaScript house style. |
| [TRACK-DESIGNER.md](TRACK-DESIGNER.md) | Player guide to the in-game track designer. |
| [STREAMING.md](STREAMING.md) | Streamer guide to `overlay.html`: the OBS setup, page options, accessibility. |
| [PLATFORM.md](PLATFORM.md) / [PACKAGING.md](PACKAGING.md) | iOS/Safari and static-host limits; Electron and Capacitor packaging. |
| [BUGS.md](BUGS.md) | The current verified bug shortlist. |
| [CAPTURE-REVIEW.md](CAPTURE-REVIEW.md) | Car capture matrices and portable site exports. |

## Agent surface and evidence

| Doc | Covers |
|---|---|
| [AGENT-SURFACE.md](AGENT-SURFACE.md) | Skills vs MCP vs `tools/` CLIs: which `apex_*` wraps exist and why. |
| [DEBUG-HOOKS.md](DEBUG-HOOKS.md) | The `window.__apex` dev API (generated) and the agent world view. |
| [EVIDENCE-STORAGE.md](EVIDENCE-STORAGE.md) / [evidence/historical-catalog.json](evidence/historical-catalog.json) | Publishing captures as release assets; the reviewed historical catalog. |
| [agent-output/](agent-output/README.md) | Selectable tool output levels and saved evidence. |
| [DESIGN-TOOLS.md](DESIGN-TOOLS.md) | Free design tooling: private MCP recovery, token/accessibility evidence, screenshot reviews, procedural room/glTF checks. |

Redirect stubs (cited from source comments; follow the link): [RENDERERS.md](RENDERERS.md),
[SCENERY-GROUNDING.md](SCENERY-GROUNDING.md), [LAYOUT-AUDIT.md](LAYOUT-AUDIT.md),
[LAYOUT-TOKENS.md](LAYOUT-TOKENS.md),
[AGENT-WORLD-API.md](AGENT-WORLD-API.md), [CONSOLE-RECIPES.md](CONSOLE-RECIPES.md),
[PERF-FINDINGS.md](PERF-FINDINGS.md), [ARCHITECTURE-REVIEW.md](ARCHITECTURE-REVIEW.md).

## Directories

[notes/](NOTES-INDEX.md) dated ledgers · [research/](NOTES-INDEX.md) source-cited research ·
[plans/](NOTES-INDEX.md) plans · [archive/](NOTES-INDEX.md) provenance only (archive/research/,
archive/notes/, archive/superpowers/, archive/slider-effect/, archive/manual-probes/, archive/webgpu/,
archive/tracks/, archive/workflows/, archive/moves/, archive/tools/) · [changelog.d/](changelog.d/README.md)
per-PR changelog fragments · [tracks/](tracks) per-circuit reference · [look-survey/](look-survey/README.md)
contact sheets · [surveys/](surveys) and survey/ profiling surveys · perf/ device measurements ·
[evidence/](evidence/historical-catalog.json) capture catalog.

For day-to-day workflows, see the skills (`.claude/skills/README.md`) and the
tools (`tools/README.md`).
