# Workflows

Multi-agent orchestration scripts for the `Workflow` tool, saved from the
2026-08 cleanup campaign. Invoke by name (`Workflow({name: "total-audit"})`)
or by path. They are plain JS run in an async harness context — top-level
`return` is legal, so `node --check` false-positives on them; validate by
parsing as an async function body instead.

| Script | What it does | Reusable? |
|---|---|---|
| `total-audit.js` | Loop-until-dry whole-tree audit (19 domain finders over all code + docs, 2 adversarial skeptics per finding batch, completeness-critic rounds, cap 3) → prioritized report. Args (all optional): `known` do-not-re-report list, `knownKeys`, `maxGap`. | Yes — periodic health sweep. |
| `test-semantics-audit.js` | Reads every test file in full → per-file semantic verdicts → group taxonomy + tests/ split map + change-aware CI design → feasibility skeptic. Produced `docs/archive/research/TEST-AUDIT-2026-08.md`. | Yes — re-run after big suite changes. |
| `redesign-judge-panel.js` | N independent architecture designs from different priors, scored by judges, synthesized. Produced `docs/research/ARCHITECTURE-REDESIGN-2026-08.md`. | Yes — next big design question. |

Ground rules baked into every script: agents are read-only (or worktree-
isolated), NEVER run browser/Playwright tests (4-core box — suites run in the
main loop, serially), and findings face adversarial verification before they
are believed. Completed campaign records go to `docs/archive/research/`; still-cited design notes stay in `docs/research/`.
