---
name: slim-bloat
description: "Use when files, docs or the tree grow too large — saturated size ratchet, dead or duplicate code, dead CSS selectors, repeated docs rules, stale comments, extract/split candidates, too much context. CSS restructure → css-play; fat skill → agent-config."
---

# Cut bloat — shrink, split, dedupe, prove dead

Scan first. Dispatch **bloat-auditor**. Parent applies **one carve**.
Preserve behaviour. Lower ratchets. Do not "simplify" a load-bearing
quirk — the measured list is [references/do-not.md](references/do-not.md).

## Entry

```sh
node tools/check/bloat-scan.mjs --json              # size + ratchet slack (evidence, NOT candidates)
node tools/check/ratchets.mjs --json                # per-metric lines/codeLines/gMembers/topLets slack
node tools/check/extract-module.mjs js/game.js <start> <end>   # free refs of ONE whole function: take its line range from grep -n first
#   write mode: … [--mutable a,b] [--out <file>] [--g-out <file>]  (carves.md §1)
```

Slack 0 on every row = saturated: the scan names no block. First `node tools/check/ratchets.mjs --base origin/<ship>` (`<ship>` = the deploy branch, `claude/f1-game-project-26h3ng`)
(names raises: a blocked commit may be a raise, not saturation). Seed the auditor with
`docs/ARCHITECTURE.md` §Deferred follow-ups / §Extraction lessons (sort by boundary crossings). Candidates come
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
   in the same commit as the extract.
3. **Never convert IIFE → ESM**; a carved-out file follows AGENTS.md §Critical
   conventions' new-file recipe.
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
