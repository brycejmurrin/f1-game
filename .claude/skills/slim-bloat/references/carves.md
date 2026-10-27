# Carve recipes

Parent applies **one** carve after `bloat-auditor` returns rows. Record
before/after counts (`bloat-scan.mjs --json`).

## 1. Extract from `game.js` / a ratchet file

1. Name the block: its start/end lines from apex-lsp `lsp_outline` (whole functions; skill code-nav), not
   `grep -n`. Reject if it is `updateCar` / `render` or needs many new `G` members (`do-not.md`).
2. Analyse only (no write):

   ```sh
   node tools/check/extract-module.mjs js/game.js <start> <end>
   ```

   Classify FREE names: `let` → `--mutable` rewrite; `const`/`function`
   that should move, move — do not copy.
3. New file is hyphenated IIFE: `"use strict"; var Name = { create(G) { … } };`
   Module never reaches into `game.js`. `Module.create(G)` at the existing
   roster site.
4. Lockstep the same commit: file + its `tools/manifest.cjs` row (+ `HARD_EDGES` if eval-time
   destructure), then `npm run gen` (writes the `index.html` `<script>` tag — generated, never
   hand-edited) + lower
   the ceilings: `node tools/check/ratchets.mjs --update --lower-only` (a delta in tests/data/ratchets.d on a topic branch).
5. `lsp_references` every removed symbol (grep for text and comments). Then
   `node tools/ci/tooling-fast.mjs --changed --jobs=3` (the full tier in the background only, AGENTS.md rule 4).
   Near `game.js`: `tests/specs/physics-characterization.spec.js` is the master gate (`test-bg.mjs --spec`) —
   parent names leftover browser groups as not-run.
6. Commit in two calls (AGENTS.md rule 12); the hook must pass with the lowered ceiling.
7. No bump — `bump-cache` is deploy-only (`.claude/rules/game-code.md`); `npm run gen` only if the manifest changed.

`extract-module.mjs` does **not** write the module, manifest, or tags.

## 2. Split an always-on doc

- A fat skill is **agent-config** (`docs/notes/DECISIONS-2026-10-26.md` #8); this section covers docs.
- Do not paste `AGENTS.md` into a doc. Point at it.
- The `total-audit` workflow (`.claude/workflows/total-audit.js`, `docs-ref` / `docs-idx` lenses) first if the
  prose may be stale.

## 3. Split the tree (new directory / file family)

- Engine vs data: `js/track/` vs `js/circuits/<id>.js`.
- New module: it goes in the DOMAIN directory (`js/physics/`, `js/race/`,
  `js/ui/`, …). Entry state lives in `js/game.js` (`G` façade); there is no
  `js/game/` directory after the 2026-09 restructure.
  Hyphenated name; grandfathered squashed names stay.
- `tools/` subdir: `tools/README.md` must name the file (or `family/`).
- `tests/` split is done — do not invent a third layout. Guards in
  `load-order.test.mjs` / `docs-integrity.test.mjs`.

## 4. Dead code, duplicates, stale comments

**Dead** needs two proofs: no remaining read, and not a ratchet/allow-list
row. Grep the symbol; check `hooks-documented`, `global-registry`,
`scenery-api-contract`, `css-tokens`. A suspected dead `__apex` hook is
**unverified** until the parent pokes `agentHelp()` via **mcp-probe**
(one browser at a time: `mcp-probe/references/traps-chrome.md`).

**Dead CSS** (a selector or `--token` nothing uses): grep every `css/*.css`, `index.html`, `js/**` (class
names built in JS: grep the stem too) and `controller.html`; the proof is a green
`tests/unit/css-tokens.test.mjs` after the cut plus one screenshot of the touched screen by the parent
(844×390 touch first). Restructuring what is left is **css-play**.

**Duplicate:** keep one seam. Shared scalars already live on `M4`
(`clamp`/`lerp`/`wrapDelta`) — do not add a private copy
(`shared-math.test.mjs`).

**Comments to remove:** `//` that restates the next line; dated "TODO
remove after X" where X shipped; commented-out code blocks. **Keep:**
bug-at-site comments, physics-column labels, silent-catch whys, port
mirrors that cite a **symbol**.

## 5. After the carve

```sh
node tools/check/bloat-scan.mjs --json
node tools/ci/tooling-fast.mjs --changed --jobs=3
node tools/ci/verify-change.mjs --plan --json
```

Do not start a browser group from this skill. `verify-agent` for `--fast`.
