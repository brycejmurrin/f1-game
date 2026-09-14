# Workflows

Multi-agent orchestration scripts for the `Workflow` tool, saved from the
2026-08 cleanup campaign. Invoke by name (`Workflow({name: "total-audit"})`)
or by path. They are plain JS run in an async harness context — top-level
`return` is legal, so `node --check` false-positives on them; validate by
parsing as an async function body instead.

| Script | What it does | Reusable? |
|---|---|---|
| `code-survey.js` | Whole-tree **dead code / bugs / performance** survey. Static recon (haiku runs `scan-globals`, `shell-ids`, `dup-keys`, `tree-counts`) → 29 model-tiered scope finders: haiku on data-shaped scopes, sonnet on domains, opus on game.js/physics/renderers/net/audio → two perspective-diverse skeptics per batch (reachability + intent) with an opus tiebreak on high-severity splits → opus completeness critic → gap rounds (cap 3) → opus perf triage → opus report. Args (all optional): `known`, `knownKeys`, `maxGap`, `rounds`, `focus`. | Yes — periodic dead-code/perf sweep. |
| `total-audit.js` | Loop-until-dry whole-tree audit (19 domain finders over all code + docs, 2 adversarial skeptics per finding batch, completeness-critic rounds, cap 3) → prioritized report. Args (all optional): `known` do-not-re-report list, `knownKeys`, `maxGap`. | Yes — periodic health sweep. |
| `test-semantics-audit.js` | Reads every test file in full → per-file semantic verdicts → group taxonomy + tests/ split map + change-aware CI design → feasibility skeptic. Produced `docs/archive/research/TEST-AUDIT-2026-08.md`. | Yes — re-run after big suite changes. |
| `redesign-judge-panel.js` | N independent architecture designs from different priors, scored by judges, synthesized. Produced `docs/research/ARCHITECTURE-REDESIGN-2026-08.md`. | Yes — next big design question. |

`code-survey` and `total-audit` are complements, not duplicates: `total-audit`
owns drift, contradictions and docs truth; `code-survey` owns dead code, runtime
bugs and frame budget, and is the one that reads tests/ and tools/ for defects.

Ground rules baked into every script: agents are read-only (or worktree-
isolated), NEVER run browser/Playwright tests (4-core box — suites run in the
main loop, serially), and findings face adversarial verification before they
are believed. Completed campaign records go to `docs/archive/research/`; still-cited design notes stay in `docs/research/`.
