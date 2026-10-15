# Workflows

Multi-agent orchestration scripts for the `Workflow` tool, saved from the
2026-08 cleanup campaign. Invoke by name (`Workflow({name: "total-audit"})`)
or by path. They are plain JS run in an async harness context — top-level
`return` is legal, so `node --check` false-positives on them; validate by
parsing as an async function body instead (`tests/unit/agent-surface.test.mjs`
does, and checks every `agentType:` names a file in `.claude/agents/`).

| Script | What it does | Reusable? |
|---|---|---|
| `code-survey.js` | Whole-tree **dead code / bugs / performance** survey. `prior-art-scout` seeds `known` when none is passed (one call) alongside static recon (haiku runs `scan-globals`, `shell-ids`, `dup-keys`, `tree-counts`) → 29 `code-hunter` slices, effort-tiered by reading shape (low on data files, high on game.js/physics/renderers/net/audio) → two perspective-diverse `finding-verifier` lenses (reachability + intent) per ≤15-claim chunk, a high-effort `finding-verifier` tiebreak on high-severity splits → opus completeness critic → `code-hunter` gap rounds (cap 3) → opus perf triage → opus report. Args (all optional): `known`, `knownKeys`, `maxGap`, `rounds`, `focus`. | Yes — periodic dead-code/perf sweep. |
| `total-audit.js` | Loop-until-dry whole-tree audit: `prior-art-scout` seed when `known` is empty → 19 domain finders over all code + docs (17 `code-hunter` slices; `docs-ref` on the default agent; `docs-idx`, the agent-surface lens, on `agent-surface-reviewer`, reports in `scratch/total-audit/`) → 2 independent `finding-verifier` skeptics per ≤15-claim chunk, tiebreak on splits → completeness-critic rounds (cap 3) → prioritized report. Args (all optional): `known` do-not-re-report list, `knownKeys`, `maxGap`. | Yes — periodic health sweep. |
| `test-semantics-audit.js` | Reads every test file in full → per-file semantic verdicts → group taxonomy + tests/ split map + change-aware CI design → feasibility skeptic. Produced `docs/archive/research/TEST-AUDIT-2026-08.md`. | Yes — re-run after big suite changes. |
| `redesign-judge-panel.js` | N independent architecture designs from different priors, scored by judges, synthesized. Produced `docs/research/ARCHITECTURE-REDESIGN-2026-08.md`. | Yes — next big design question. |

`code-survey` and `total-audit` are complements, not duplicates: `total-audit`
owns drift, contradictions and docs truth; `code-survey` owns dead code, runtime
bugs and frame budget, and is the one that reads tests/ and tools/ for defects.

Both scripts call these agents by `agentType`, so the agents' own definitions
carry the read-only rules, tool limits, model and row formats; the script
prompts pass only the slice, the lens and the claims (and a schema mapping).
Single-slice hunts do not need a workflow: agent `prior-art-scout` builds the
`known` list (also the input for either script's `known` arg), one
`code-hunter` per slice finds, and `finding-verifier` re-checks the rows (the
skeptic step) before anything is fixed (`.claude/agents/README.md`).

Ground rules baked into every script: agents are read-only (or worktree-
isolated), NEVER run browser/Playwright tests (4-core box — suites run in the
main loop, serially), and findings face adversarial verification before they
are believed. Completed campaign records go to `docs/archive/research/`; still-cited design notes stay in `docs/research/`.
