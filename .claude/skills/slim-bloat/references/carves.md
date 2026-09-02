# Carve recipes

Parent applies **one** carve after `bloat-auditor` returns rows. Record
before/after counts (`bloat-scan.mjs --json`).

## 1. Extract from `game.js` / a ratchet file

1. Name the block (start/end lines). Reject if it is `updateCar` / `render`
   or needs ~15 new `G` members (`do-not.md`).
2. Analyse only (no write):

   ```sh
   node tools/extract-module.mjs js/game.js <start> <end>
   ```

   Classify FREE names: `let` → `--mutable` rewrite; `const`/`function`
   that should move, move — do not copy.
3. New file is hyphenated IIFE: `"use strict"; var Name = { create(G) { … } };`
   Module never reaches into `game.js`. `Module.create(G)` at the existing
   roster site.
4. Lockstep the same commit: file + `index.html` `<script>` position +
   `tools/manifest.cjs` (+ `HARD_EDGES` if eval-time destructure) + lower
   the ceiling in `tests/unit/module-size.test.mjs`.
5. `grep` every removed symbol. Then `npm run test:tooling-fast`. Near
   `game.js`: `physics-characterization` is the master gate — parent names
   leftover browser groups as not-run.
6. Last edit: `node tools/bump-cache.mjs --apply` (check-changes/references/bump.md).

`extract-module.mjs` does **not** write the module, manifest, or tags.

## 2. Split a fat skill / always-on doc

- `SKILL.md` stays when / entry / don'ts / dispatch. War stories go to
  `references/*.md`. Official body cap is 500 lines; this repo's template
  is thinner (`mcp-probe` ≤ 120). Confirm caps via Context7
  `/websites/platform_claude_en_agents-and-tools_agent-skills` if they
  may have moved.
- Do not paste `AGENTS.md` into a skill. Point at it.
- The `total-audit` workflow (`docs-ref` / `docs-idx` lenses) first if the prose may be stale.
- New skill: list it in `.claude/skills/README.md` (docs-integrity).

## 3. Split the tree (new directory / file family)

- Engine vs data: `js/track/` vs `js/circuits/<id>.js`.
- New `js/game/` file: hyphenated name; grandfathered squashed names stay.
- `tools/` subdir: `tools/README.md` must name the file (or `family/`).
- `tests/` split is done — do not invent a third layout. Guards in
  `tests-split.test.mjs` / `load-order.test.mjs` / `docs-integrity.test.mjs`.

## 4. Dead code, duplicates, stale comments

**Dead** needs two proofs: no remaining read, and not a ratchet/allow-list
row. Grep the symbol; check `hooks-documented`, `global-registry`,
`scenery-api-contract`, `css-tokens`. A suspected dead `__apex` hook is
**unverified** until the parent pokes `agentHelp()` via **mcp-probe**
(`chrome-start` only when Playwright is down; `chrome-stop` after).

**Duplicate:** keep one seam. Shared scalars already live on `M4`
(`clamp`/`lerp`/`wrapDelta`) — do not add a private copy
(`shared-math.test.mjs`).

**Comments to remove:** `//` that restates the next line; dated "TODO
remove after X" where X shipped; commented-out code blocks. **Keep:**
bug-at-site comments, physics-column labels, silent-catch whys, port
mirrors that cite a **symbol**.

## 5. After the carve

```sh
node tools/bloat-scan.mjs --json
npm run test:tooling-fast
node tools/verify-change.mjs --plan --json
```

Do not start a browser group from this skill. `verify-agent` for `--fast`.
