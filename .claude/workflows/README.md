# Workflows

Multi-agent orchestration scripts for the `Workflow` tool, saved from the
2026-08 cleanup campaign. Invoke by name (`Workflow({name: "total-audit"})`)
or by path. They are plain JS run in an async harness context — top-level
`return` is legal, so `node --check` false-positives on them; validate by
parsing as an async function body instead (`tests/unit/agent-surface.test.mjs`
does, and checks every `agentType:` names a file in `.claude/agents/`).

| Script | What it does | Reusable? |
|---|---|---|
| `code-survey.js` | Whole-tree **dead code / bugs / performance** survey. `prior-art-scout` seeds `known` when none is passed (one call) alongside static recon (haiku runs `scan-globals`, `shell-ids`, `dup-keys`, `tree-counts`) → 29 `code-hunter` slices, tiered by reading shape (`TIER_MODEL`: haiku+low on data files, sonnet+medium on domains, opus+high on game.js/physics/renderers/net/audio) → two perspective-diverse `finding-verifier` lenses (reachability + intent) per ≤15-claim chunk, a high-effort tiebreak on high-severity splits; a `needsBrowser` verdict is reported, not refuted → opus completeness critic → `code-hunter` gap rounds (cap 3) → opus perf triage → opus report. Args (all optional): `known`, `knownKeys`, `maxGap`, `rounds`, `focus`. | Yes — periodic dead-code/perf sweep. |
| `total-audit.js` | Loop-until-dry whole-tree audit: `prior-art-scout` seed when `known` is empty → 19 domain finders over all code + docs (17 `code-hunter` slices with the same `TIER_MODEL` tiering; `docs-ref` on the default agent; `docs-idx`, the agent-surface lens, on `surface-reviewer`, reports in `scratch/total-audit/`) → 2 independent `finding-verifier` skeptics per ≤15-claim chunk, tiebreak on splits, `needsBrowser` claims kept under their own heading → completeness-critic rounds (cap 3) → prioritized report (Fix now / Needs a browser / Defer / Coverage). Slice facts (game.js lines, the spec count) are computed at run time, never quoted. Args (all optional): `known` do-not-re-report list, `knownKeys`, `maxGap`. | Yes — periodic health sweep. |

`code-survey` and `total-audit` are complements, not duplicates: `total-audit`
owns drift, contradictions and docs truth; `code-survey` owns dead code, runtime
bugs and frame budget, and is the one that reads tests/ and tools/ for defects.

Both scripts call these agents by `agentType`, so the agents' own definitions
carry the read-only rules, tool limits and row formats; the script prompts
pass only the slice, the lens and the claims (and a schema mapping), and the
model TIER for each `code-hunter` slice (`.claude/agents/README.md` §Models).
Single-slice hunts do not need a workflow: agent `prior-art-scout` builds the
`known` list (also the input for either script's `known` arg), one
`code-hunter` per slice finds (`focus: dead-code` for the former bloat-auditor
recipe), and `finding-verifier` re-checks the rows (the skeptic step) before
anything is fixed (`.claude/agents/README.md`).

Ground rules baked into every script: agents are read-only (or worktree-
isolated), NEVER run browser/Playwright tests (4-core box — suites run in the
main loop, serially), and findings face adversarial verification before they
are believed. Completed campaign records go to `docs/archive/research/` — the run-once
`test-semantics-audit.js` and `redesign-judge-panel.js` scripts moved to
`docs/archive/research/workflows/` on 2026-10-26 (provenance only; copy one back
to re-run it); still-cited design notes stay in `docs/research/`.
