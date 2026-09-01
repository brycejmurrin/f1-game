# Attic — records removed from the archive (2026-09-01)

One line per file deleted from `docs/` on 2026-09-01. Each was cited by nothing
outside `docs/archive/` (`spike/README.md` still cites the WebGPU migration plan and
maintainability review, so those two stay) (grep over AGENTS.md, `.claude/`, `tests/`, `tools/`,
`js/`, `css/`, `docs/`, `#anchor` links included); the four `research/` rows
were indexed only by `docs/README.md`. Recover any of them with
`git show <sha>:<path>` — the SHA is the last commit that touched the file.

| Title | Original path | Last SHA | What it was |
|---|---|---|---|
| Pre-Race Circuit Briefing Screen Design Report | docs/archive/research/CIRCUIT-BRIEFING-DESIGN.md | 88ee80b | June-2026 design guide for a pre-race briefing screen, synthesised from F1 games, GT7, Forza and broadcast graphics; never built. |
| Pre-Race Circuit Briefing UI/UX Design Patterns Research Report | docs/archive/research/CIRCUIT-BRIEFING-UI-RESEARCH.md | 88ee80b | Companion UX-pattern survey (mandatory-readiness vs optional-mastery data) for the same unbuilt briefing screen. |
| Whole-repo cleanup session — dated record (2026-08-13) | docs/archive/research/CLEANUP-2026-08-13.md | 88ee80b | Register of the 2026-08-13 cleanup session: what ran, what landed, what the gates said; its deep records (W4-AUDIT, STRUCTURE-REDECISION) remain. |
| The driving/physics test surface — a review | docs/archive/research/DRIVING-TEST-REVIEW.md | 88ee80b | Read-through of the 17 driving specs (172 tests) before the steering recalibration; the fixture conversion and vStd lint it recommended shipped. |
| The 2026 rules we model, checked against the 2026 rules | docs/archive/research/F1-2026-RULES-FIDELITY.md | 88ee80b | Gap list between the modelled 2026 regulations (moveable wings, Overtake mode) and the published rules as of writing. |
| DRIVER CAREER — what F1 25 does, what we have, what to build | docs/archive/research/F1-25-DRIVER-CAREER.md | 88ee80b | Source-read comparison of Apex 26 Driver Career against EA F1 25, with a build list. |
| F1 25 — a study, and what Apex 26 should take from it | docs/archive/research/F1-25-GAME-STUDY.md | 88ee80b | 2026-08-14 whole-game study of F1 25: mode roster, reception, what to take and refuse. |
| F1 25 "My Team 2.0" — what it is, what we have, what to build | docs/archive/research/F1-25-MY-TEAM.md | 88ee80b | My Team comparison grounded line-by-line in `career.js` / `career-ui.js`, with proposals. |
| F1 25 research — the merged roadmap | docs/archive/research/F1-25-ROADMAP.md | 88ee80b | Index and merged priority list over the four F1-25 research passes. |
| The race weekend and season shell — what F1 25 does, what we have, what to build | docs/archive/research/F1-25-WEEKEND-STRUCTURE.md | 88ee80b | Weekend/season-shell comparison against F1 25; source-read only, nothing run in a browser. |
| Up to four players, and seats you can't both take | docs/archive/research/MULTIPLAYER-4P-PLAN.md | 88ee80b | Plan to grow VS FRIEND from two to four players with exclusive seat claims (superseded by the shipped 2-4 player net). |
| Multiplayer — feasibility investigation | docs/archive/research/MULTIPLAYER-RESEARCH.md | 88ee80b | The option-space survey that preceded the WebRTC / no-backend / distributed-authority decision. |
| Arcade Racing Steering Physics Research Report | docs/archive/research/STEERING-PHYSICS-RESEARCH.md | 88ee80b | Survey of steering models across 15+ arcade and sim racers; endorsed the heading/slip-angle model already in use. |
| Mobile Tilt Steering Controls: Comprehensive Research Report | docs/archive/research/TILT-STEERING-RESEARCH.md | 88ee80b | June-2026 survey of tilt-steering jitter/drift/lag causes and the filtering practices of mobile racers. |
| Steering & Physics — Research Findings and Next Steps | docs/archive/research/physics-future.md | 88ee80b | Synthesis of the steering and tilt research against the kinematic bicycle model then shipping. |
| Generated Output Layout Implementation Plan | docs/archive/superpowers/plans/2026-07-16-generated-output-layout.md | 88ee80b | Task-by-task plan that put every regenerable output under `artifacts/` or `scratch/`. |
| Multi-round Quality Pass Implementation Plan | docs/archive/superpowers/plans/2026-07-16-quality-pass.md | 88ee80b | Plan for the July-2026 gameplay/lifecycle/data/test defect pass. |
| Scenery Identity Pass — Implementation Plan | docs/archive/superpowers/plans/2026-07-16-scenery-identity-pass.md | 88ee80b | Plan for the per-track Top-3 scenery identity fixes over the then-24 circuits. |
| All-Track Scenery Dress Pass Implementation Plan | docs/archive/superpowers/plans/2026-07-17-all-track-scenery-dress-pass.md | 88ee80b | One-agent-per-circuit scenery dress plan (pre-reorganisation `js/tracks/<id>.js` paths). |
| Circuit Scenery Expansion Implementation Plan | docs/archive/superpowers/plans/2026-07-17-circuit-scenery-expansion.md | 88ee80b | Plan that introduced `SceneryThemes`, `LandmarkKit` and `CircuitKit`. |
| Image and Colour Grading Controls Implementation Plan | docs/archive/superpowers/plans/2026-07-17-image-colour-grading-controls.md | 88ee80b | Plan for the five-zone tonal grading stack in the LIGHTING TUNER. |
| Full confirmed-findings quality pass | docs/archive/superpowers/specs/2026-07-16-full-quality-fix-pass-design.md | 88ee80b | Design for fixing every confirmed defect from the July-16 audits. |
| Generated output directory consolidation | docs/archive/superpowers/specs/2026-07-16-generated-output-layout-design.md | 88ee80b | The `artifacts/` / `scratch/` directory contract design. |
| Multi-round quality pass | docs/archive/superpowers/specs/2026-07-16-quality-pass-design.md | 88ee80b | Bounded defect-fix design preserving the touch-input work of the time. |
| Scenery identity pass — all 24 circuits | docs/archive/superpowers/specs/2026-07-16-scenery-identity-pass-design.md | 88ee80b | Design: every circuit should read as itself within ~0.5 s at race speed. |
| Rear-light state cues: fuel-tinted exhaust, ERS-driven LED brightness, real-F1 deploy flash | docs/archive/superpowers/specs/2026-07-16-tail-lights-fuel-ers-design.md | 88ee80b | Design for tail-light brightness/colour driven by fuel, ERS and Overtake. |
| Circuit Scenery Expansion Design | docs/archive/superpowers/specs/2026-07-17-circuit-scenery-expansion-design.md | 88ee80b | Design for reusable circuit infrastructure, themes and landmark forms. |
| Exhaustive Lighting Tuning Campaign | docs/archive/superpowers/specs/2026-07-17-exhaustive-lighting-tuning-campaign-design.md | 88ee80b | Approved design for shipped lighting defaults per track x time-of-day x weather. |
| Image and Colour Grading Controls | docs/archive/superpowers/specs/2026-07-17-image-colour-grading-controls-design.md | 88ee80b | Implemented design for the IMAGE & COLOUR tuner group (Toe/Shoulder, Lift/Gamma/Gain). |
| Shared track foundation characterization baseline | docs/archive/superpowers/specs/2026-07-17-shared-track-foundation-baseline.md | 88ee80b | Baseline numbers captured at `d9587d3` before the shared-foundation refactor. |
| Shared Track Foundation Refactor | docs/archive/superpowers/specs/2026-07-17-shared-track-foundation-design.md | 88ee80b | Design for the shared track foundation (terrain, props, walls) refactor. |
| WebGPU Phase 0 + Phase 1 skeleton — build notes | docs/archive/webgpu/WEBGPU-PHASE0-NOTES.md | 88ee80b | Build log for the `Gfx` seam and the device/clear/sky skeleton. |
| WebGPU Phase 2 — real geometry + the lit shading pipeline — build notes | docs/archive/webgpu/WEBGPU-PHASE2-NOTES.md | 88ee80b | Build log for GPUBuffers, FRAME UBO, light storage, lit pipeline and tonemap blit. |
| WebGPU migration — Phase 3 notes (sun shadows) | docs/archive/webgpu/WEBGPU-PHASE3-NOTES.md | 88ee80b | Build log for the WGX shadow passes. |
| WebGPU migration — Phase 4 notes (post chain + foreground FX) | docs/archive/webgpu/WEBGPU-PHASE4-NOTES.md | 88ee80b | Build log for the WGX post chain, SSR, image FX and env-probe cube. |
| TLX PCSS — how to close the one stubbed shadow gap | docs/research/TLX-PCSS-RESEARCH.md | d742ddb | 2026-08-17 research on giving TLX a PCSS blocker map despite three's sampler limits; a blocker map has since shipped on WebGPU + desktop WebGL2 (`docs/RENDERERS.md` §Parity). |
| Every menu, page and pop-up: the systematic review | docs/research/MENU-REVIEW-2026-08.md | 88ee80b | 1990-cell layout-audit pass over 40 screens with a leave/change/blocked verdict per screen; the changes it asked for landed. |
| Whole-tree audit synthesis — 268 verified findings (2026-08-28) | docs/research/AUDIT-2026-08-28.md | 8b155bf | Total-audit synthesis at shell 1599: Batch A/B/Feed/Defer queue; Batch A crash/hang fixes landed 2026-08-28. |
| External CSS/UI scaling practices vs Apex 26 | docs/research/UI-SCALE-EXTERNAL-VS-APEX-2026-08-19.md | 88ee80b | 2024-2026 adaptive-UI / zoom / safe-area practice cross-checked against the Apex implementation. |

Dropped from `docs/PERF-FINDINGS.md` the same day: the pre-2026-08-18 "Left on
the table" narrative, now `research/PERF-LEDGER-2026-08.md` in this directory.
