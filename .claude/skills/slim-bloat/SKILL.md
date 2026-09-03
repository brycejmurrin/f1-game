---
name: slim-bloat
description: Use when files, skills, docs, or the tree have grown too large for agents — fat SKILL.md, saturated size ratchet, dead or duplicate code, stale comments, extract/split candidates, or "simplify this / too much context". Claude-simplify analog for Apex 26. Not for physics tune, circuit accuracy, CSS restructure (restructure-screens-css), or pre-push verify (check-changes).
---

# Cut agent bloat (Claude-simplify for Apex 26)

Scan first. Dispatch **bloat-auditor**. Parent applies **one carve**.
Preserve behaviour. Lower ratchets. Do not "simplify" a load-bearing
quirk — the measured list is [references/do-not.md](references/do-not.md).

## Entry

```sh
node tools/bloat-scan.mjs --json              # size + ratchet slack
node tools/extract-module.mjs js/game.js 100 180   # analyse free refs
```

Spawn `bloat-auditor` with a **named scope** (one file, one skill, or
`HEAD` / last-touched). It returns `BLOAT` rows only. The parent edits,
locksteps, and bumps cache.

## Hard don'ts (always)

1. **One carve per commit.** Extraction leftovers are the measured failure
   (`ARCHITECTURE.md` §Reorg — copied constants, leftover `_cautionOn`).
2. **Never raise a ratchet to hide growth.** `node tools/ratchets.mjs --update`
   in the same commit as the extract. Same for skill line caps.
3. **Never convert IIFE → ESM.** New-file lockstep: file + `<script>` +
   `tools/manifest.cjs` (+ `HARD_EDGES` if eval-time) + cache bump.
4. **Never hand the auditor a browser run.** Dead `__apex` hooks: parent
   confirms with **mcp-probe** / `mcp-cli.mjs probe` after `apex_status`.
   Context7 / WebFetch are fine (Agent Skills caps, library docs).
5. **Never "simplify" physics, the timestep, or `updateCar`/`render()`.**
   See do-not.md.

CSS/DOM count work → **restructure-screens-css**. Pre-push →
**check-changes** / `verify-agent`.

## Load on demand

- Measured "do not simplify" table → [references/do-not.md](references/do-not.md)
- Carve recipes (extract / tree / comments / dead proof) → [references/carves.md](references/carves.md)
