---
name: slim-bloat
description: "Use when files or docs are too big: a full size ratchet blocks a commit, dead or duplicate code, unused CSS, repeated doc rules, stale comments, or a file to split. Not for: CSS restructure → css-play; a fat SKILL.md → agent-config."
---

# Cut bloat — shrink, split, dedupe, prove dead

Scan first. Dispatch **bloat-auditor**. Parent applies **one carve**.
Preserve behaviour. Lower ratchets. Do not "simplify" a load-bearing
quirk — the measured list is [references/do-not.md](references/do-not.md).

## Entry

```sh
node tools/check/bloat-scan.mjs --json              # size + ratchet slack (evidence, NOT candidates)
node tools/check/ratchets.mjs --json                # per-metric lines/codeLines/gMembers/topLets slack
node tools/check/extract-module.mjs js/game.js <start> <end>   # free refs of ONE whole function: its range from apex-lsp lsp_outline (skill code-nav)
#   write mode: … [--mutable a,b] [--out <file>] [--g-out <file>]  (carves.md §1)
```

`ratchets.mjs` is the verdict; `bloat-scan` only ranks (it reads `ratchets.json` `lines`, not the branch's
`ratchets.d` delta or the other metrics).

**Over the ceiling** (an `OVER` row; the commit is blocked): the commit hook's absorb is
`tools/hooks/ratchet-reason.mjs` (a small silent allowance, a larger one with a `Ratchet-Reason:` trailer — read
the constants there); past it every commit on the branch blocks until the carve lands. Run
`node tools/check/ratchets.mjs --base origin/claude/f1-game-project-26h3ng` (your own raise vs an inherited one),
then carve until value ≤ ceiling and `--update --lower-only`: a carve that is too small prints `SKIP RAISE` and the
row stays OVER. The raise `ratchets.mjs` suggests is Bryce's alone (`.claude/rules/game-code.md`); never type it.

Slack 0 on every row = saturated: the scan names no block. First `node tools/check/ratchets.mjs --base origin/<ship>` (`<ship>` = the deploy branch, `claude/f1-game-project-26h3ng`)
(names raises: a blocked commit may be a raise, not saturation). Seed the auditor with
`docs/notes/DEFECT-LEDGER.md` §8 and `docs/ARCHITECTURE.md` §Extraction lessons (sort by boundary crossings). Candidates come
only from `bloat-auditor` (a cohesive block with few free names — `extract-module`
prints them as `name×count`; `let`s are the `G` accessors the carve costs).
Done = ratchet `--update` lowers the ceiling; `ratchets.mjs` ends `all at or under`.
No cohesive block (every candidate crosses too many `G` boundaries) = stop: report that the ratchet
is the limit, with the auditor's top three rows and their crossing counts — never force a carve.

A fat SKILL.md (its cap, a split into `references/`) → **agent-config**; `bloat-scan`'s `skill`
rows are the evidence it reads.

The line range must bracket WHOLE statements — it is parsed, not sliced, so a
range that opens mid-function exits 1 on a bare `SyntaxError` that reads like a
broken file rather than a badly chosen range.

Spawn `bloat-auditor` with a **named scope** (one file, one skill, or
`HEAD` / last-touched). It returns `BLOAT` rows plus ONE `COVERED:` line; scope it did not
cover is not clean — re-spawn on the remainder. Seed its scope with `prior-art-scout`
(rejected / already-fixed items) and run `finding-verifier` on dead-code rows before the carve. The parent edits and
locksteps; if `tools/manifest.cjs` changed, run `npm run gen`
([shell/cache](../check-changes/references/bump.md)).

## Hard don'ts (always)

1. **One carve per commit.** Extraction leftovers are the measured failure
   (`ARCHITECTURE.md` §Reorg — copied constants, leftover `_cautionOn`).
2. **Ratchets only go down here** (`.claude/rules/game-code.md`): `node tools/check/ratchets.mjs --update --lower-only`
   in the same commit as the extract (two calls, AGENTS.md rule 12: the hook reads the working tree).
3. **Never convert IIFE → ESM**; a carved-out file follows the new-file recipe in
   `.claude/rules/game-code.md`.
4. **Never hand the auditor a browser run** (AGENTS.md rule 10, `bash-guard.sh`).
   Dead `__apex` hooks: the parent confirms with **mcp-probe**.
5. **Never "simplify" physics, the timestep, or `updateCar`/`render()`.**
   See do-not.md.

Consolidating a rule repeated across AGENTS.md and `docs/` into one canonical copy is this skill; a fat
skill, a skill's description, routing queries, an agent, a hook or AGENTS.md's budgets → **agent-config**.
Dead CSS selectors/tokens are proved HERE (carves.md §4); restructuring screens/DOM/tokens → **css-play**
(`references/restructure.md`). Pre-push → **check-changes** / `verify-agent`.

## Load on demand

- Measured "do not simplify" table → [references/do-not.md](references/do-not.md)
- Carve recipes (extract / tree / comments / dead proof) → [references/carves.md](references/carves.md)
