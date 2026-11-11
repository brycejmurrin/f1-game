# Apex 26 — docs

Start here. This page is a **reading order**: what to read, in what order. The
notes, research, archive and plans tables live in [NOTES-INDEX.md](NOTES-INDEX.md)
(split out 2026-10-26); open one only when something cites it.

## Read in this order

**If you are an agent:** `AGENTS.md` → skill `steward` → `VERIFICATION.md` → `ARCHITECTURE-MAP.md` →
`ARCHITECTURE.md` (the section you edit) → `TESTING.md` §1-2 → the one area doc
your change touches → the skill that drives it.

| # | Read | Why |
|---|---|---|
| 1 | [`../AGENTS.md`](../AGENTS.md) | The rules; every flat prohibition lives there. Read all of it. |
| 2 | [steward](../.claude/skills/steward/SKILL.md) | The PR lifecycle: claim, draft PR, push, red, `land`, after land; labels in its `references/labels.md`, the dispatcher in skill `dispatcher`. |
| 3 | [VERIFICATION.md](VERIFICATION.md) | Edit-loop, pre-push, docs-only, CI and Pages commands and what each proves. |
| 4 | [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md) | Boot path, layer map, data flow, where to edit what. Ten minutes. |
| 5 | [ARCHITECTURE.md](ARCHITECTURE.md) | The module contract, the `G` façade, the loop, the three renderers. Read your directory's section. |
| 6 | [TESTING.md](TESTING.md) §1-2 | Which GROUP a change needs and how to run it. Per-file table: `node tools/docs/gen-coverage-table.mjs` builds `artifacts/TESTING-COVERAGE.md`; one hook: [AGENT-HOOKS.md](AGENT-HOOKS.md). |
| 7 | the area doc | One row below, only when the task touches it. |
| 8 | the skill | `.claude/skills/README.md` picks it. |

**If you are a person:** [`../README.md`](../README.md) → [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md)
→ [ARCHITECTURE.md](ARCHITECTURE.md) → [PHYSICS.md](PHYSICS.md) or [CAREER.md](CAREER.md) → [TESTING.md](TESTING.md) §1.

## Area docs (load one on demand)

| Doc | Covers |
|---|---|
| [PHYSICS.md](PHYSICS.md) | Driving model, tuning variables, aero/X-mode, overtake gate, the curvature columns. |
| [CAREER.md](CAREER.md) | Career flow, save slots, ratings, economy and R&D. |
| [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md) §Session flow / §Usage paths | Session state machine; end-to-end player journeys (the former FLOW and USAGE-PATHS pages, merged 2026-11-03). |
| [SCENERY-API.md](SCENERY-API.md) / [SCENERY-AND-TRACK-BUILD.md](SCENERY-AND-TRACK-BUILD.md) | The `scenery(api)` contract; the track/scenery build pipeline. |
| [LIGHTING.md](LIGHTING.md) / [LIGHTING-TUNER-SLIDERS.md](LIGHTING-TUNER-SLIDERS.md) | Light records, time of day, lamps; every tuner slider (generated). |
| [GFX-CONTRACT.md](GFX-CONTRACT.md) | The renderer backend seam: the interface every backend (GLX, TLX, WGX) implements for `js/render/gfx.js`. |
| [GOVERNOR-RATIONALE.md](GOVERNOR-RATIONALE.md) | Why `js/perf/governor.js` (PerfGov) cuts, holds and climbs the render scale and sheds tiers: its long comment blocks, moved verbatim. |
| [MULTIPLAYER.md](MULTIPLAYER.md) | The `js/net/` wire, rendezvous, snapshots, phone as controller. |
| [UI-MAP.md](UI-MAP.md) | Navigation web and screens, DOM IDs; the UI explorer toolkit and the capture/publish review flow (merged 2026-11-03). |
| [COMPONENTS.md](COMPONENTS.md) / [CODE-STANDARDS.md](CODE-STANDARDS.md) | CSS class families and owners, layout axes, layout tokens, the UI experience and studio acceptance contract; JavaScript house style. |
| [TRACK-DESIGNER.md](TRACK-DESIGNER.md) | Player guide to the in-game track designer. |
| [STREAMING.md](STREAMING.md) | Streamer guide to `overlay.html`: the OBS setup, page options, accessibility. |
| [PLATFORM.md](PLATFORM.md) / [PACKAGING.md](PACKAGING.md) | iOS/Safari and static-host limits; Electron and Capacitor packaging. |
| [BUGS.md](BUGS.md) | A pointer: open defects are the `bug`-labelled issues; fixed classes are in the defect ledger. |
| [DECISIONS.md](DECISIONS.md) | The `D-NNN` ledger of Bryce's decisions; rules and tests cite a row instead of quoting. |

## Agent surface and evidence

| Doc | Covers |
|---|---|
| [AGENT-SURFACE.md](AGENT-SURFACE.md) | Skills vs MCP vs `tools/` CLIs: which `apex_*` wraps exist and why. |
| [DEBUG-HOOKS.md](DEBUG-HOOKS.md) | The `window.__apex` dev API (generated) and the agent world view. |
| [EVIDENCE-STORAGE.md](EVIDENCE-STORAGE.md) / [evidence/historical-catalog.json](evidence/historical-catalog.json) | Publishing captures as release assets; the reviewed historical catalog. |
| [agent-output/](agent-output/README.md) | Selectable tool output levels and saved evidence. |
| [DESIGN-TOOLS.md](DESIGN-TOOLS.md) | Free design tooling: private MCP recovery, token/accessibility evidence, screenshot reviews, procedural room/glTF checks. |

[WORKERS.md](WORKERS.md) is a retired stub (2026-11-03): the lane contract is skill `steward`.
One redirect stub remains: [PERF-FINDINGS.md](PERF-FINDINGS.md) → `notes/PERF-FINDINGS.md`
(dozens of `js/` comments cite the old path; repoint them and delete the stub together). The other six went on 2026-11-03.

## Directories

[notes/](NOTES-INDEX.md) dated ledgers (retention: `node tools/docs/knowledge-gc.mjs`, a note nothing
live cites for 21 days is archived) · [research/](NOTES-INDEX.md) source-cited research ·
[plans/](NOTES-INDEX.md) live plans (shipped and superseded ones are under archive/plans/) ·
[DECISIONS.md](DECISIONS.md) the `D-NNN` ledger of what Bryce decided · [archive/](NOTES-INDEX.md)
provenance only (archive/research/, archive/notes/, archive/plans/, [archive/survey/](archive/survey), [archive/surveys/](archive/surveys),
archive/superpowers/, archive/slider-effect/, archive/manual-probes/, archive/webgpu/,
archive/tracks/, archive/workflows/, archive/moves/, archive/tools/) · [changelog.d/](changelog.d/README.md)
per-PR changelog fragments · [tracks/](tracks) per-circuit reference · [look-survey/](look-survey/README.md)
contact sheets · [perf/](perf) device measurements · [superpowers/](superpowers) the newest workflow specs · [evidence/](evidence/historical-catalog.json) capture catalog.

For day-to-day workflows, see the skills (`.claude/skills/README.md`) and the
tools (`tools/README.md`).
