# Apex 26 — JavaScript code standards

The house style for every file under `js/`. Sources: the Airbnb JavaScript
Style Guide, the Google JavaScript Style Guide, MDN's JavaScript code style
guide and *clean-code-javascript*, filtered through what this repo already
proves with tests (`AGENTS.md` §Critical conventions, `tests/unit/global-registry.test.mjs`,
`tests/unit/shared-math.test.mjs`, `tests/data/ratchets.json`). Where a
published guide and a repo guard disagree, the guard wins — it was written after
a measured failure.

This page is a checklist, not an essay. Each rule is short enough to apply while
reading a file top to bottom.

## 0. What never changes in a style pass

A style pass preserves behaviour byte-for-byte where a test can see it. Before
renaming or deleting ANY symbol, grep for it outside its file:

```sh
grep -rn "<symbol>" js tests tools docs types css index.html
```

Frozen surfaces (rename = a broken guard or a broken player save):

| Surface | Guard |
|---|---|
| The one global each file assigns (`const Foo = (function () { … })();`) | `global-registry.test.mjs` |
| `G` façade member names and `Module.create(G)` shape | `check-gctx.mjs`, `types/game-ctx.d.ts` |
| `window.__apex` hook names | `hooks-documented.test.mjs`, `docs/DEBUG-HOOKS.md` |
| The 112-member `scenery(api)` contract | `scenery-api-contract.test.mjs` |
| Cross-file method names (`Tracks.curvature`, `M4.clamp`, …) | `scan-globals.mjs` + the caller |
| `apex26.*` localStorage keys, DOM ids and CSS classes | player saves; `shell-ids.mjs`, `css-*` tests |
| Shader uniform/attribute names, GLSL/WGSL/TSL source | `backend-surface-parity`, render specs |
| Physics numbers, the order of float operations, `dt` clamps | `physics-characterization`, `*-vm` tests |
| Script load order, `HARD_EDGES`, eval-time destructures | `load-order.test.mjs` |
| Generated files (`js/roster.js`, `index.html` `@gen-shell` blocks, …) | `protect-files.sh` |
| Any function a test reads by source (`fnSource(src, "function quitToMenu")`) | `grep -rn "<name>" tests/` |

Anything in `.claude/skills/slim-bloat/references/do-not.md` stays as it is.

## 1. Module shape

Every file is one strict-mode IIFE assigning one global (`AGENTS.md`). Inside
it, in this order:

1. One-line header comment: what the module is and the one fact a reader must
   know before editing it. Keep any `@doc` / `@skill` tags — generators read them.
2. Eval-time destructures of other globals (each is a `HARD_EDGES` pair).
3. Module constants (`UPPER_SNAKE_CASE`).
4. Module-private helpers.
5. The public surface (`create(G)` or the returned object), last.

```js
/* Apex 26 — RELIABILITY: whether a car reaches the flag at all. */
const Reliability = (function () {
  "use strict";

  const { TDEV_MAX } = Career;             // eval-time read: HARD_EDGES pins career.js first
  const LEVELS = { off: 0, low: 0.5, real: 1 };

  function riskFor(teamId) { … }

  return { create, LEVELS };
})();
```

No ES modules, no `import`/`export`, no top-level `await`, no bare
`console.*` (use `Log`). New shared helpers go in the existing home
(`M4` for scalar math, `Dom` for DOM, `PostCommon` for post chains) — a new
file costs a manifest entry and `gen-shell`, so flag it rather than add it
inside a style pass.

## 2. Naming

| Kind | Style | Examples |
|---|---|---|
| Module global, constructor, class | `PascalCase` | `GameHud`, `TrackGraph` |
| Function, method, variable, property | `camelCase` | `buildCenterline`, `lapTime` |
| Module-level immutable constant | `UPPER_SNAKE_CASE` | `MAX_RPM`, `TIER_RISK` |
| Function-local constant | `camelCase` | `const span = …` |
| Boolean | `is` / `has` / `can` / `should` prefix, or a clear adjective | `isNight`, `hasGrip`, `redlineOn` |
| Collection | plural noun | `cars`, `lightSlots` |
| Count / index / measure | say the unit or role | `lapCount`, `slotIndex`, `gapMetres`, `dtSeconds` |
| Event handler | `on` + event | `onPointerDown` |
| Factory / builder | verb phrase | `makeMesh`, `buildProps`, `createStore` |
| Private-by-convention field on a SHARED object | leading underscore | `def._sceneryShift` |
| IIFE-local state | no underscore — the closure already hides it | `let minimapBg` not `let _mmBg` |

Rules:

- **Descriptive over short.** No dropped letters (`cstmr`), no group-only
  abbreviations. Words a reader in this domain knows are fine: `rpm`, `ers`,
  `drs`, `hud`, `aero`, `sfx`, `dt`.
- **Single letters** only in a scope of ~10 lines or less, or for the repo's
  measured math idioms: `x y z` (metres), `s` (arc length), `k` (curvature),
  `t` (0–1 or seconds), `dt`, `i j n` (loop), `a b` (operands), `m` (matrix).
- **Acronyms** camel-case like words: `sdpOffer`, `parseUrl`, `hdrMode` — not
  `SDPOffer`, `parseURL`.
- **Don't repeat the container** in a member: `car.speed`, not `car.carSpeed`.
- **One name per concept per file.** If a file says `cfg`, `conf` and
  `settings` for the same thing, pick one.
- **Functions are verbs**; values are nouns. `speedOf(car)` returns; `setSpeed`
  mutates; `isFast(car)` answers yes/no.
- Renaming is worth it when a name is wrong or cryptic to a new reader. It is
  not worth it for a long-lived name that is merely terse and appears 200
  times — a diff that touches every line hides the real changes.

## 3. Declarations and values

- `const` by default; `let` only when reassigned; never `var`.
- One declaration per line for anything with an initialiser. A run of related
  scratch scalars may share a line only inside a hot loop (`let a = 0, b = 0;`).
- Object and array literals, never `new Object()` / `new Array(n)` (typed
  arrays excepted).
- Property shorthand `{ x, y }` and method shorthand `draw() {}`.
- Template literals for interpolation; plain quotes otherwise. Double quotes
  (the repo's existing majority).
- `===` / `!==` always. `== null` is the one allowed loose compare (it means
  "null or undefined") and it is written exactly that way.
- Default parameters, not `opts = opts || {}` inside the body.
- Numbers get a name when they are reused or when the reader cannot tell why
  that value: `const REDLINE_ON = 0.92`. A literal that is obviously a unit
  conversion or a 0/1/2 needs no name.

## 4. Functions

- One job per function; the name says which. A function that does A then B is
  two functions and a caller.
- **Early return.** Guard clauses first, no `else` after a `return`, no
  `else { if … }` ladders.
- Up to three positional parameters; more than that is an options object.
  Do not change an existing PUBLIC signature for this — apply it to new and
  private functions.
- No boolean flag parameters in new code (`render(true)`): split the function
  or pass a named option.
- Do not reassign parameters; do not mutate an argument the caller still
  reads unless mutation IS the contract (a scratch vector, a `G` slot).
- Arrow functions for callbacks; `function` declarations for anything named
  at module scope (they hoist, and their name shows in a stack trace).
- Arrow parameters always in parentheses: `(x) => x * x`.
- Ternaries for a value, `if` for control flow. Never nested ternaries; never
  `cond && doThing()` as a statement.

## 5. Control flow and loops

- Braces on every multi-line body. A one-line guard `if (!el) return;` on one
  line is the repo idiom and stays.
- `for…of` over index loops, except in per-frame code (the game loop,
  physics, render, HUD tick) where the index loop is measured and stays.
- Never `for…in` over arrays.
- `switch`: `default` last; a `case` that declares a variable gets braces.
- `try`/`catch` only around the call that can throw. An empty `catch` needs
  the one-line reason (`bareCatches` ratchet); a `catch` that only logs uses
  `Log.warn`. Omit the binding when unused: `catch {`.

## 6. Duplication and helpers

- Two copies of the same 3+ lines is one helper. Three copies is a bug
  waiting for a fourth.
- Scalar math is `M4.clamp` / `M4.lerp` / `M4.wrapDelta` — never a private
  copy (`shared-math.test.mjs`).
- A helper lives at the narrowest scope that reaches every caller: inside the
  function, then the module, then the shared home. Copy-out of a constant
  from another module is a defect (`ARCHITECTURE.md` §Reorg leftovers).
- A lookup table beats an `if` ladder over the same key.
- Consolidate near-identical functions with one parameter that differs, unless
  the differing parameter would be a boolean flag — then keep two thin
  wrappers over one implementation.
- Dead code needs two proofs before deletion: no remaining read anywhere in
  the repo (the grep in §0) and no ratchet or allow-list row naming it.

## 7. Comments

The rule is *why, not what*. Code says what it does; a comment says what the
code cannot: the constraint, the measurement, the bug it prevents.

**Remove:**

- A comment that restates the next line (`// increment i`).
- Divider bars (`// ─────`), section banners that name the obvious.
- Commented-out code. Version control has it.
- Journal comments: dates, "moved from", "was `foo` until 2026-08", "session X
  added". History lives in `docs/notes/`, not at the call site.
- `TODO`s whose condition has shipped. A live `TODO` is `// TODO(topic): …`.
- Narrative essays. A 15-line paragraph that ends in one rule becomes that
  rule in one to three lines.
- Line-number citations of another file (`glx.js:412`). Cite the symbol
  (`LIT_FS in glsl-lit.js`); the ceiling for numeric citations is zero.

**Keep (and keep short):**

- The one-line file header and its `@doc` / `@skill` tags.
- A comment that names a fixed bug, a measurement, a platform quirk (iOS,
  Safari, SwiftShader), or a load-order fact. These are the test the suite
  cannot write.
- Physics-column labels (AI-only / assist-gated / broadcast-only / surface).
- The reason on every empty `catch`.
- Port mirrors in WGX / TLX that name the GLSL symbol they mirror.
- Coordinate and unit notes where a sign or unit is easy to get wrong.

**Form:** `//` for everything except the file header and JSDoc on a public
function. A space after `//`. Sentence case, no trailing period on one-liners.
Comment above the line, not trailing, unless it labels one value in a table.

## 8. Formatting

Two-space indent, semicolons, double quotes, spaces around infix operators,
no trailing whitespace, one blank line between functions, lines ≤ 100
characters where the content allows (data tables and shader source excepted).
There is no formatter in the build: match the surrounding file.

## 9. The pass, per module

1. Read the whole file first. Note every symbol another file or a test
   reaches (§0 grep). Those are off-limits.
2. Comments (§7) — the safest edit, do it first.
3. Duplicates and dead code (§6) — each deletion carries its two proofs.
4. Naming (§2) — internal symbols only, one concept per rename, grep first.
5. Structure (§3–5) — early returns, `const`, helpers. No behaviour change.
6. Verify: the module's own `node --test` files, `node tools/check/scan-globals.mjs --check`,
   `npm run test:guards`. Lower any ratchet you freed
   (`node tools/check/ratchets.mjs --update`); never raise one.
7. Report what you renamed and what you left alone and why.
