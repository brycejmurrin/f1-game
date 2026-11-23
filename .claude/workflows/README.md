# Workflows

Multi-agent orchestration scripts for the `Workflow` tool, saved from the
2026-08 cleanup campaign. Invoke by name (`Workflow({name: "total-audit"})`)
or by path. They are plain JS run in an async harness context — top-level
`return` is legal, so `node --check` false-positives on them; validate by
parsing as an async function body instead (`tests/unit/agent-surface.test.mjs`
does, checks every `agentType:` names a file in `.claude/agents/`, and that every js/ dir is owned by a slice's `dirs:`).

| Script | What it does | Reusable? |
|---|---|---|
| `code-survey.js` | Whole-tree **dead code / bugs / performance** survey. `prior-art-scout` seeds `known` when none is passed (one call) alongside static recon (haiku runs `scan-globals`, `shell-ids`, `dup-keys`, `tree-counts`) and the run-time slice plan (haiku lists every circuit and js/ dir; `args.plan` skips it) → the static `code-hunter` slices plus one per circuit chunk and per js/ dir no static slice owns, tiered by reading shape (`TIER_MODEL`: haiku+low on data files, sonnet+medium on domains, opus+high on game.js/physics/renderers/net/audio) → two perspective-diverse `finding-verifier` lenses (reachability + intent) per ≤15-claim chunk, a high-effort tiebreak on high-severity splits (a high finding dies on two refutes, or when every verifier that answered refuted it); a `needsBrowser` verdict is reported under its own heading (`needsBrowser` in the result), never refuted → opus completeness critic → `code-hunter` gap rounds (cap 3) → opus perf triage → opus report. Args (all optional): `known`, `knownKeys`, `maxGap`, `rounds`, `focus`, `plan`. The result carries `coverage` (finders that returned), `notCovered` and `agentsSpawned`; the run logs the agent count. | Yes — periodic dead-code/perf sweep. |
| `total-audit.js` | Loop-until-dry whole-tree audit: `prior-art-scout` seed when `known` is empty → domain finders over all code + docs (static `code-hunter` slices with the same `TIER_MODEL` tiering, plus circuit chunks and unowned js/ dirs from the run-time slice plan; `docs-ref` on the default agent; `docs-idx`, the agent-surface lens, on `surface-reviewer`, reports in `scratch/total-audit/`) → 2 independent `finding-verifier` skeptics per ≤15-claim chunk, tiebreak on splits, the same kill rule, `needsBrowser` claims kept under their own heading, a failed finder logged and listed in `notCovered` → completeness-critic rounds (cap 3) → prioritized report (Fix now / Needs a browser / Defer / Coverage). No slice quotes a line count or file list: each finder lists its own scope. Args (all optional): `known` do-not-re-report list, `knownKeys`, `maxGap`, `plan`. The result carries `coverage`, `notCovered` and `agentsSpawned`. | Yes — periodic health sweep. |

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
