# Plan: agent skills, instructions, and tools for ~10 parallel cloud agents

**Date:** 2026-09-30  
**Scope:** read-only review of the agent surface and CI tooling on ship tip
`claude/f1-game-project-26h3ng`. **No code changes in this plan's PR** — this
file only.  
**Owner ask (Bryce):** agents should plan first, extract before growing files,
fix CI at the root cause, and never loosen tests. About ten cloud agents now
work in parallel on the same repo.

**Related (do not duplicate; cite):**

| Doc | Role vs this plan |
|---|---|
| [`docs/notes/AGENT-TOOLING-RESEARCH-2026-09-22.md`](../notes/AGENT-TOOLING-RESEARCH-2026-09-22.md) | Prior research; many §5 items landed the same day (§6). This plan starts from what is still open for *parallel Cloud agents* in 2026-09-30. |
| [`docs/notes/CI-CAPACITY-2026-09-29.md`](../notes/CI-CAPACITY-2026-09-29.md) | Measured jam (20 slots → Pro 40); selector / node-plan / selected-verdict work that landed. |
| [`docs/notes/CONCURRENT-PRS-CI-HYGIENE-2026-09-30.md`](../notes/CONCURRENT-PRS-CI-HYGIENE-2026-09-30.md) | Concurrent-PR protocol (drafts, sync-once, no unsanctioned ratchet raises). |
| [`docs/notes/PREPUSH-GATE-LADDER.md`](../notes/PREPUSH-GATE-LADDER.md) | Why tooling-fast ≠ the deploy gate (three reds). |
| [`docs/notes/SHARED-BRANCH-COORDINATION.md`](../notes/SHARED-BRANCH-COORDINATION.md) | Three sessions / one bug / one revert (2026-09-18). |
| [`docs/plans/2026-09-16-process-speedup-next.md`](2026-09-16-process-speedup-next.md) | Earlier process backlog; mostly CI speed, not skill gaps. |

---

## 1. Snapshot (evidence, not vibes)

Measured on this checkout after `git fetch origin claude/f1-game-project-26h3ng`
(2026-09-30).

| Surface | Count / size | Notes |
|---|---|---|
| `AGENTS.md` | 194 lines | At the ~200-line adherence ceiling (`AGENT-TOOLING-RESEARCH` §2.1). |
| `docs/TESTING.md` | 1 760 lines | Canonical test bible; too big to load every turn. |
| `docs/notes/DEFECT-LEDGER.md` | 3 929 lines | Open + history register; no skill routes into it. |
| Skills | 27 `SKILL.md` bodies (~2 196 lines total) | Index: `.claude/skills/README.md`. |
| Subagents | 6 | `ci-red-triage`, `verify-agent`, `bloat-auditor`, `deploy-research`, `track-surveyor`, `physics-contract-auditor`. |
| Cursor always-on | `.cursor/rules/apex-shared.mdc` | Pointers only; path-scoped `render-wgx` / `render-tlx`. |
| `tools/ci/` | 34 `.mjs` files (~8.8 k lines) | `deploy`, `verify-change`, `select-specs`, `node-plan`, `ci-watch`, `who-is-on-it`, `sync-pr`, … |
| `tools/check/` | 36 check scripts | `ratchets`, `extract-module`, `bloat-scan`, `merge-hygiene`, `twin-fidelity`, `vm-portable`, … |
| Ratchet slack | **0** on every saturated file row | `game.js` 9913/9913, `gMembers` 280/280, `topLets` 159/159 (`ratchets.mjs --json` / `bloat-scan`). |
| Open PRs (sample) | few ready | Concurrent protocol caps ~6 ready (`CONCURRENT-PRS` L9–10). |

**Bryce's four norms vs what is written today:**

| Norm | Where it lives today | Gap |
|---|---|---|
| Plan first | `docs/plans/` exists; no Apex skill; not in `AGENTS.md` loop | Agents jump to edits; plan docs are owner-driven, not agent-default. |
| Extract before growing | `slim-bloat` + `extract-module.mjs` + ≤40 auto-raise (`AGENTS.md` L112–116; `bash-guard.sh` L239–244) | Soft. Saturated ceilings + auto-raise means growth is the default path. |
| Fix CI at root cause | `ci-red-triage` agent + `steward` skill + rule 9 | Pieces exist; no one-command "what is red on my PR and why"; agents still re-run / sync to "refresh". |
| Never loosen tests | Rule 9 (`AGENTS.md` L66); flaky quarantine; `wait-polling-lint`; CI `ratchets --base` | Prose + some lints. **No diff lint** that fails a PR when a numeric tolerance was widened alongside a production fix. |

---

## 2. Instruction gaps and contradictions

### 2.1 Stale "develop directly on the deploy branch" (high confusion)

**Evidence.**

- `AGENTS.md` L170–173: branch protection refuses direct pushes (2026-09-30), **then** still says "Other sessions develop directly on it, so a deploy is a merge of THEIR work… they also all see one red at once".
- `docs/notes/SHARED-BRANCH-COORDINATION.md` L35–40: still frames the shared-red problem as every session developing on the ship branch.

**Why it hurts.** Since branch protection, work lands by **PR**. The shared-red class is now "many PRs see a red tip / inherited red", not "ten agents push to the same ref". Agents still follow the old claim/stand-down dance as if they were about to push the tip. `who-is-on-it.mjs` remains valuable for tip reds and overlapping path claims; the prose should match PR-first reality.

**Fix shape.** One AGENTS.md paragraph rewrite (stay under 200 lines: cut the old shared-push sentence). Point SHARED-BRANCH note at "PR into ship + tip red" and keep the claim tool.

### 2.2 Branch naming: `claude/<topic>` vs `cursor/<name>-10ac`

**Evidence.** `AGENTS.md` L170, L71 require `claude/<topic>`. Cursor Cloud task instructions require `cursor/<descriptive-name>-10ac`. Claims live under `claude/claims/<slug>` (`SHARED-BRANCH` L73–76; `who-is-on-it` usage).

**Why it hurts.** Claim slug = session branch. A `cursor/…` agent either cannot claim cleanly or invents a parallel naming story. Routing and `who-is-on-it` docs assume `claude/`.

**Fix shape.** AGENTS.md one line: "host may prefix (`claude/` or `cursor/`); claims follow the session branch slug; ship base is always `claude/f1-game-project-26h3ng`". Do not fork the protocol.

### 2.3 "Plan first" is absent from the always-on loop

**Evidence.** The loop in `AGENTS.md` L17–28 is serve → pick-tests → edit → tooling-fast → browser → gate-only → commit/push. `docs/plans/` has dated plans, but nothing routes a multi-file task there. Cursor plugin skills (`writing-plans`, `brainstorming`) are not Apex skills and do not show in `.claude/skills/README.md`.

**Why it hurts.** Ten parallel agents default to coding. File growth, overlapping PRs, and ratchet raises happen before anyone writes a plan that other agents can see.

**Fix shape.** New skill `write-plan` (draft below) + one bullet in AGENTS.md Agent extensions: multi-file / ratchet-touching / CI-touching work opens or updates `docs/plans/YYYY-MM-DD-<topic>.md` before source edits. Keep AGENTS under 200 lines by cutting a duplicated sentence elsewhere.

### 2.4 Extract-before-grow is soft; auto-raise makes growth easy

**Evidence.**

- Saturated ratchets (`bloat-scan` table: slack 0 on `game.js`, `presets.js`, `car3d.js`, …).
- Commit hook `--auto-raise` absorbs ≤40 lines and **stages** `ratchets.json` (`bash-guard.sh` L239–244; `AGENTS.md` L112–116).
- Extraction recipe lives in `slim-bloat/references/carves.md` §1 — only loaded when slim-bloat matches. Growing `game.js` for a feature does **not** trigger that skill.

**Why it hurts.** Bryce's "extract before growing" loses to the path of least resistance: add lines → auto-raise ≤40 → commit. Concurrent PRs then conflict on `ratchets.json` (`CONCURRENT-PRS` L17–23; CI-CAPACITY L56–60 merge-ordering class).

**Fix shape.** New skill `extract-and-lower` (draft below) with triggers that include "game.js growth", "ratchet blocked", "slack 0". Optional later: commit-hook advisory when touching a zero-slack file without an extract in the same commit (hook, not prose).

### 2.5 Gate ladder still mis-taught by tool names

**Evidence.** `check-changes` SKILL.md L27–39 correctly says `--fast` ≠ top rung; `PREPUSH-GATE-LADDER.md` documents three historical reds. Agents still treat `verify-change --fast` / `test:tooling-fast` as "ready to push".

**Why it hurts.** Same failure class as 2026-09-02 / 09-10 / 09-18 (`PREPUSH-GATE-LADDER` L30–57).

**Fix shape.** Not more prose. One helper: `node tools/ci/<prepush>.mjs` (alias that only runs `deploy.mjs --gate-only` and prints "this is the push gate"). Session-start already prints ladder figures — add one short phrase: "push gate = deploy.mjs --gate-only".

### 2.6 CI diagnosis is split across four surfaces

**Evidence.**

- Watcher: `tools/ci/ci-watch.mjs` (annotations on red jobs).
- Triage subagent: `.claude/agents/ci-red-triage.md` (status line + base already-red?).
- Claims / paths: `who-is-on-it.mjs`.
- Handoff block: `session-status.mjs` (git + local logs — **no PR check-runs**).
- Steward skill: overrides for cancelled / sync / gate.

There is **no** single CLI that prints: PR URL, head SHA, failing check name, assertion, lane, already-red-on-base, next action.

**Why it hurts.** Agents invent `gh run` loops, re-sync "to refresh CI" (steward §2 forbids casual sync; CI-CAPACITY: re-syncs were ~80% of tip commits on 09-29), or re-run flakes.

**Fix shape.** `node tools/ci/<pr-red>.mjs` (or `ci-watch --pr --once --why`) composing check-runs + first failed annotation + optional base-verdict. Skill `pr-red-diagnose` is thin glue over that CLI + `ci-red-triage`.

### 2.7 Never-loosen-tests has no mechanical teeth on tolerances

**Evidence.** Rule 9 forbids widening tolerances (`AGENTS.md` L66). `wait-polling-lint.mjs` enforces polling. Flaky quarantine is ledger-only. Ratchets refuse looser `slack` than default (`ratchets.mjs` L108). **Nothing** diffs `toBeCloseTo(…, n)`, numeric thresholds, or baseline caps in a PR and fails when they loosen without a named exception.

**Why it hurts.** Agents under CI pressure edit the assertion. DEFECT-LEDGER and PERF-FINDINGS already record past widenings as defects.

**Fix shape.** New check `tools/check/<tolerance-diff>.mjs --base <ref>`: fail if a test file decreases a decimal place / raises an allowed delta / lowers a ratchet baseline cap in the same commit set as non-test production changes, unless `tests/data/<tolerance-exceptions>.json` names it. Wire into guards / Structural guards on PRs.

### 2.8 Onboarding / time-to-first-green-PR

**Evidence.** Session-start installs deps and prints branch/load/ladder (`.claude/hooks/session-start.sh`). Bootstrap map: `docs/AGENT-SURFACE.md` L17–60. A prose-only commit runs docs-integrity only (`AGENTS.md` L51; `bash-guard.sh` L236). A code PR still requires: pick-tests → edits → tooling-fast → gate-only → draft PR → ci-watch → steward on red — learned from a 194-line always-on file plus skills the model must auto-select.

**Measured shape of "first green" (docs-only):** create branch → one doc → commit → draft PR → docs-guards / ci early path → undraft. Should be minutes if prose-only path is understood.

**Measured shape of "first green" (code):** hours for a new agent that discovers the gate ladder the hard way.

**Fix shape.** Skill `first-pr` (checklist) + session-start one-liner pointing at it. Do not dump TESTING.md into AGENTS.md.

### 2.9 DEFECT-LEDGER and TESTING.md as context sinks

**Evidence.** 3 929 + 1 760 lines. No skill says "grep DEFECT-LEDGER for OPEN near your paths before fixing". Agents either ignore the ledger or try to load it whole.

**Fix shape.** Thin skill section or `agent-view`/`steward` pointer: `rg -n 'OPEN|TODO' docs/notes/DEFECT-LEDGER.md` scoped; never attach the whole file. TESTING.md stays reference; check-changes remains the test entry.

### 2.10 Prior research still open (do not re-open closed items)

From `AGENT-TOOLING-RESEARCH-2026-09-22.md` §5–§6: hook holes, ci-red-triage, flake policy, who-is-on-it claims, description rewrites — **landed**. Still relevant to this plan's theme:

- Claim-before-work mechanical form (partially landed as `--claim`; needs Cursor-branch awareness).
- Deny/allow settings (landed for Claude settings; Cloud agents may not share the same permission file).
- Mutation / suite honesty (ongoing; out of scope for skills-first slice).

---

## 3. Ranked improvements (value ÷ effort)

Scale: **V** = value for parallel Cloud agents (1–5), **E** = effort (1=small doc/skill, 5=multi-day CI), **Score** = V−E (higher first). Implementation order ≠ score alone when dependencies exist.

| # | Improvement | V | E | Score | Type |
|---|---|---|---|---|---|
| **A** | One-command `pr-red` / `ci-watch --why` + thin skill | 5 | 2 | 3 | tool + skill |
| **B** | AGENTS.md: plan-first bullet; fix deploy-branch contradiction; host branch prefixes | 5 | 1 | 4 | instructions |
| **C** | Skill `extract-and-lower` (promote carves.md §1) + README trigger | 5 | 1 | 4 | skill |
| **D** | Skill `write-plan` + plans naming convention in AGENTS | 4 | 1 | 3 | skill |
| **E** | `tolerance-diff` guard (never loosen tests mechanically) | 5 | 3 | 2 | tool + CI |
| **F** | Ratchet-slack dashboard one-liner (`bloat-scan` default already close) + "zero slack → extract" session nudge | 4 | 1 | 3 | tool/docs |
| **G** | Skill `sync-to-ship` (who-is-on-it → sync-pr --plan → gate-only) | 4 | 1 | 3 | skill |
| **H** | Skill `add-test-twin` (vm-portable → twin → twinned-specs → fidelity) | 3 | 2 | 1 | skill |
| **I** | `prepush.mjs` alias of `--gate-only` + session-start phrase | 4 | 1 | 3 | tool |
| **J** | Final-report template (PR template extension or skill) | 3 | 1 | 2 | instructions |
| **K** | game.js / ratchet merge helper (beyond sync-pr + merge-hygiene) | 3 | 3 | 0 | tool |
| **L** | Skill `first-pr` onboarding checklist | 4 | 1 | 3 | skill |
| **M** | DEFECT-LEDGER OPEN index (generated short file) | 3 | 2 | 1 | gen tool |
| **N** | Lower auto-raise absorb (40→20) or require extract note in commit when raising | 4 | 2 | 2 | hook policy |

**Do next (slice plan):** B → C → D → A → I → L in one or two small PRs (instructions/skills first, then `pr-red` + `prepush`). Then E (tolerance-diff) as its own gated PR. Defer K/M until A/E prove out.

---

## 4. Draft text — top skills / instruction changes

### 4.1 AGENTS.md deltas (keep ≤200 lines)

Replace the contradictory ship-branch sentence (`AGENTS.md` ~L170–173) with:

> Work happens on a topic branch (`claude/<topic>` or host prefix such as
> `cursor/<topic>`). The deploy branch is `claude/f1-game-project-26h3ng`:
> direct pushes are refused (branch protection); land via PR (`deploy.mjs
> --pr`). A tip red is shared across open PRs — before fixing a red you did
> not cause, run `node tools/ci/who-is-on-it.mjs` and claim or stand down.

Add under Agent extensions (one bullet):

> Multi-file, ratchet-touching, or CI/workflow changes: write or update
> `docs/plans/YYYY-MM-DD-<topic>.md` **before** source edits (`write-plan`
> skill). Zero ratchet slack on a file you will grow: `extract-and-lower`
> first. Red PR checks: `pr-red-diagnose` / `node tools/ci/<pr-red>.mjs`, not a
> speculative re-sync.

Cut an equal amount of duplicated deploy prose so the file stays under the
line cap (`tests/unit/agent-config.test.mjs` / skill-progressive caps).

### 4.2 New skill — `write-plan`

```markdown
---
name: write-plan
description: Use when starting multi-file work, a ratchet or CI/workflow
  change, a cross-cutting refactor, or when Bryce/user asks for a plan
  first — write docs/plans/YYYY-MM-DD-<topic>.md before editing js/css/tests
  tooling. Not for a one-line bugfix; not for deploy-research / live
  version.json.
---

# Plan before editing

1. `node tools/ci/who-is-on-it.mjs` + list open draft PRs (overlap?).
2. Create `docs/plans/YYYY-MM-DD-<topic>.md` with: Goal, Evidence (paths),
   Non-goals, Ranked steps, Verify (pick-tests groups / gate-only), Risks
   (ratchets, shared files).
3. Open a **docs-only draft PR** for the plan when the work is large or
   contested; otherwise keep the plan on the feature branch's first commit.
4. Only then edit sources. Refresh the plan's "Verified" section at each push.
5. Do not commit a per-session work log outside the PR body
   (AGENTS.md rule 12).
```

### 4.3 New skill — `extract-and-lower`

```markdown
---
name: extract-and-lower
description: Use when a size ratchet blocks a commit, bloat-scan shows slack
  0 on a file you must grow, game.js/car3d/apex/presets growth is required,
  or the user says extract before growing — run extract-module, one carve,
  lockstep manifest/shell, ratchets --update to LOWER ceilings. Not for
  physics tune or CSS restructure (slim-bloat still owns dead-code / fat
  skills).
---

# Extract one module; lower ratchets

1. `node tools/check/bloat-scan.mjs` and `ratchets.mjs --json` — confirm slack.
2. Dispatch **bloat-auditor** for a named scope; pick ONE carve.
3. Analyse: `node tools/check/extract-module.mjs <file> <start> <end>`.
4. Write the IIFE module; lockstep `tools/manifest.cjs` + `gen-shell.mjs`;
   never ESM; never reach into game.js from the module.
5. Same commit: `node tools/check/ratchets.mjs --update` (ceilings drop).
6. `npm run test:tooling-fast`; near game.js name physics-characterization
   as required. Never raise a ratchet to hide growth.
```

(Body can link `slim-bloat/references/carves.md` rather than copy it.)

### 4.4 New skill — `pr-red-diagnose`

```markdown
---
name: pr-red-diagnose
description: Use when a PR check is red or cancelled, "what failed on my
  PR", or after ci-watch reports failure — compose pr-red.mjs / ci-watch
  --once and dispatch ci-red-triage; fix the named assertion at the root.
  Never loosen a tolerance; never sync-pr just to refresh CI. Pre-push is
  check-changes; driving the PR to green after the diagnosis is steward.
---

# What is red on this PR, and why

1. `node tools/ci/<pr-red>.mjs` (or `ci-watch.mjs --sha <head> --once`) —
   print failing job, step, first annotation.
2. Dispatch **ci-red-triage** with the run URL / SHA — get the AGENTS.md
   status line (test, assertion, lane, already-red-on-base).
3. If not your failure: `who-is-on-it.mjs` → stand down or claim.
4. If yours: fix root cause; `deploy.mjs --gate-only`; push once; re-arm
   ci-watch. One re-run only for timeout/infra. Never widen tolerances;
   quarantine only via `tests/data/flaky-quarantine.json`.
```

### 4.5 New skill — `sync-to-ship` (thin)

```markdown
---
name: sync-to-ship
description: Use when GitHub reports a merge conflict with the deploy
  branch, or a required check is red on the tip and the fix is already
  there — sync-pr.mjs only when you must; never hand-merge ratchets. Not
  for routine tip movement (SYNC ONLY WHEN YOU MUST).
---

# Sync a PR to ship safely

1. `node tools/ci/who-is-on-it.mjs` (overlapping claims?).
2. `node tools/ci/sync-pr.mjs <branch> --plan` — names conflicts.
3. `node tools/ci/sync-pr.mjs <branch>` then `--push` when clean.
4. You may be on `sync-pr-<branch>` — check `git rev-parse --abbrev-ref HEAD`
   (check-changes SKILL.md §After sync-pr).
5. Hand-written conflicts: abort, merge by hand, `merge-hygiene --fix`,
   `npm run gen`, `deploy.mjs --gate-only`, plain push (never force).
```

### 4.6 Final-report template (PR body / user reply)

Extend `.github/pull_request_template.md` with an optional section agents paste
into the user-facing final message (not a second session log):

```markdown
## Final report
- PR: <url>
- Head SHA: <sha>
- Verified: <gate / groups>
- Not run: <named>
- Top findings / next: <≤5 bullets>
```

---

## 5. Proposed tool helpers (one-command)

| Command | Behaviour | Replaces today's multi-step |
|---|---|---|
| `node tools/ci/<pr-red>.mjs [--pr N\|--sha S]` | Newest runs on the PR head; failing checks; first annotation; optional `base-verdict`; exit 1 if red | `gh` + ci-watch + manual log grep + ci-red-triage briefing |
| `node tools/ci/<prepush>.mjs` | Exec `deploy.mjs --gate-only`; banner: "this matches the deploy/Pages node gate" | Agents stopping at tooling-fast |
| `node tools/check/ratchets.mjs --dashboard` | Human table of slack 0 / near-cap files (or document that `bloat-scan` *is* the dashboard) | Ad-hoc `--json` parsing |
| `node tools/check/<tolerance-diff>.mjs --base <ref>` | Fail on loosened numeric assertions / baseline caps without exception row | Hope + rule 9 prose |
| Optional later: `tools/check/<merge-game>.mjs` | Guided conflict resolution for `game.js` / ratchets after sync-pr abort | Hand merge fear |

`deploy.mjs --gate-only` already **is** the pre-push gate that matches CI's
node half (`PREPUSH-GATE-LADDER` L59–65; `check-changes` L31–35). The gap is
discoverability, not absence.

---

## 6. Guardrails (stop accidental loosen / raise)

| Guardrail | Status | Proposed |
|---|---|---|
| Ratchet hand-edit blocked | Landed (`protect-files.sh`) | Keep |
| Auto-raise ≤40 on commit | Landed | Consider 20, or require `Ratchet-Reason:` trailer when any ceiling rises |
| CI `ratchets --base` | Landed (`ci.yml` ~L411) | Keep; surface in `pr-red` output |
| Never widen tolerance (prose) | Rule 9 | Add `tolerance-diff` |
| Flaky pass = red under `APEX_FAIL_ON_FLAKY` | Landed | Keep; name flakes in PR |
| Skip test to get green | Forbidden in prose | Optional: refuse `test.skip` / `xtest` growth in diff without quarantine row |
| Unsanctioned ratchet raise in concurrent PRs | Prose in CONCURRENT-PRS | `pr-red` / Structural guards already warn; make raises past absorb fail the PR (non-advisory) consistently |

---

## 7. Slice plan (implementation PRs after this docs PR)

### Slice 0 — this PR (docs only)
- Land this plan file.
- Draft until CI green on head; then undraft; **do not merge** from the agent.

### Slice 1 — instructions + skills only (no CI behaviour change)
1. AGENTS.md deltas (§4.1) under the line cap.
2. Add skills: `write-plan`, `extract-and-lower`, `pr-red-diagnose` (calling existing ci-watch until Slice 2), `sync-to-ship`, `first-pr`.
3. Update `.claude/skills/README.md` trigger table; run `npm run gen` if required; `skill-progressive` / `docs-integrity`.
4. Soften SHARED-BRANCH note intro to PR-first (one paragraph).
5. Verify: `npm run test:tooling-fast` (or docs-only commit path).

### Slice 2 — one-command helpers
1. Implement `tools/ci/<pr-red>.mjs` (+ unit test with fake API).
2. Implement `tools/ci/<prepush>.mjs` wrapper; session-start one phrase.
3. Document `bloat-scan` as the ratchet-slack dashboard (or `--dashboard` alias).
4. Verify: unit tests + one real `--once` against an open PR.

### Slice 3 — never-loosen mechanical guard
1. `tolerance-diff.mjs` + exceptions ledger + wire into guards.
2. Pin with synthetic fixture tests (widened `toBeCloseTo` fails; excepted row passes).
3. Verify: tooling-fast + a dry PR.

### Slice 4 — policy knobs (optional, measure first)
1. Auto-raise absorb 40→20 **or** require trailer on raise.
2. Generated DEFECT-LEDGER OPEN index.
3. game.js merge helper only if Slice 1–3 still show merge pain.

Each slice: draft PR, gate-only / tooling-fast as appropriate, watch CI, undraft when green, human merges.

---

## 8. What not to do

- Do not paste TESTING.md or DEFECT-LEDGER into AGENTS.md (ceiling + adherence).
- Do not add `.cursor/skills/` forks (AGENT-SURFACE bootstrap; apex-shared rule).
- Do not re-propose landed 09-22 items (ci-red-triage exists; flake quarantine exists).
- Do not require sync-on-every-tip-move (CI-CAPACITY / SYNC ONLY WHEN YOU MUST).
- Do not widen suite timeouts or tolerances to "help" agents.
- Do not force-push ship or merge this plan PR from an agent.

---

## 9. Success metrics (after slices land)

| Metric | How to read it |
|---|---|
| Time to first green PR (docs-only) | Session clock: branch → green checks; target = one CI cycle. |
| Time to first green PR (small code) | Includes gate-only before push; fewer "tooling-fast was green, CI red" loops. |
| Ratchet raise rate | Count of `kind: raise` on PR tips (`ratchets --base`); expect down after extract-and-lower. |
| Speculative sync-pr / re-run rate | Anecdote in PR bodies + Actions; expect down after pr-red. |
| Tolerance edits | Count of tolerance-diff hits; should be rare and excepted. |
| Plan-before-edit adherence | Presence of `docs/plans/` commit before js/ on multi-file PRs. |

---

## 10. Appendix — command cheat sheet agents should learn first

```sh
node tools/ci/who-is-on-it.mjs
node tools/ci/pick-tests.mjs
node tools/ci/verify-change.mjs --fast          # edit loop only
node tools/ci/deploy.mjs --gate-only            # THE pre-push gate
node tools/ci/session-status.mjs                # PR body Status block
node tools/ci/ci-watch.mjs --sha <head> --once  # until pr-red exists
node tools/ci/sync-pr.mjs <branch> --plan       # only when you must
node tools/check/bloat-scan.mjs                 # ratchet slack dashboard
node tools/check/extract-module.mjs <file> <a> <b>
node tools/check/ratchets.mjs --update          # after extract (lowers)
node tools/check/merge-hygiene.mjs --fix
```

End of plan.
