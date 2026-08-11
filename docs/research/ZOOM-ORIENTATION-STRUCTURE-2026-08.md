# Can the screens be restructured for zoom and orientation?

Written 2026-08-08, after a session whose fixes were all instances of one fault.
This re-analyses every screen by the mechanism that decides its layout, rather
than by whether it currently looks right — the 380-cell survey already answered
that (1 finding) and it did not predict any of the defects a player actually
reported.

Companion to `UI-REMODEL-DECISION-2026-08.md`, which asked whether the menus
need remodelling and answered "not for correctness, yes for maintainability".
This one asks a narrower and more answerable question: **is the app deciding its
layout in the right coordinate space?**

---

## The fault, stated once

Four subtrees carry a CSS `zoom`: `.sheet` (every sheet, `--ui-scale`),
`#overlay > *` (`--ui-scale`), the HUD clusters and `.dock` (`--hud-scale`).
Inside a zoomed subtree the CSS is written in units that are NOT viewport pixels.
A `@media (max-height: 620px)` reads the viewport; the sheet it governs may be
557px tall in its own units at the same moment. **The query and the thing it
governs are measuring in different spaces**, and nothing in CSS reconciles them.

Measured instance, this session: the lighting tuner's compact head sits behind
`@media (max-height: 620px)`. On a 393x659 phone at UI SIZE 115% the query read
659 and never fired, while the sheet's own height was 557. The RESET/COPY/DONE
bar ended up at y=842 — off a 659px screen, reachable only by scrolling past 178
sliders. The file's own header says the fixed footer had solved exactly that.

## The inventory

| mechanism | count | can it see height? | can it see zoom? |
|---|---|---|---|
| `@media` dimension queries | 45 | 21 of them | **no** |
| `@container` queries | 29 | **no** — one declaration, `inline-size` | n/a |
| `data-shape` / `data-pair` | 2 | yes (JS measures the box) | shape/pair do not need it |
| `data-density` (added this session) | 1 | yes | **yes** — divides by `currentCSSZoom` |

Eight distinct viewport-height thresholds are in use — 500, 520, 560, 599, 600,
620, 640, 700 — asking one question ("is this screen short?") eight ways across
six files. `container: sheet / inline-size` is still the only container
declaration in the codebase, so all 29 container queries are blind to height,
which is the axis this game runs out of.

## Which of the 21 height queries are actually WRONG

This is the part the previous analysis got too broad. A viewport media query is
CORRECT for content that is not zoomed. Splitting by subtree:

| file | height queries | governs | zoomed? | verdict |
|---|---|---|---|---|
| `data.css` | 11 | `#datahub` | no | **correct as written** |
| `track-detail.css` | 1 | `#track-detail` | no | **correct as written** |
| `tuner.css` | 2 | `#lighting-inner`, `#camtune-inner` (`.sheet`) | yes | **wrong** — proven |
| `menus.css` | 3 | `#overlay`, `#sel-preview-*`, `#rs-body` | yes | **wrong** |
| `responsive.css` | 3 | `#overlay`, `#hud-sectors` | yes (ui + hud scale) | **wrong** |
| `tokens.css` | 1 | density tokens on `body` | consumed inside zoom | **wrong** |

So **9 of 21**, not all of them. `#datahub` and `#track-detail` are the two
screens that sit outside `.sheet` — the same two `UI-REMODEL-DECISION` wanted
brought INTO it. Worth noticing that being outside is what makes their queries
correct today: moving them in would break 12 working queries unless the
migration below happens first. That ordering is not obvious and is easy to get
backwards.

## What orientation needs, which is a different question

Orientation is the one axis `zoom` does not distort — portrait is portrait at
every UI SIZE — so `@media (orientation: …)` is sound wherever it appears, and
there are 14 such queries doing honest work.

What is missing is not a mechanism but a STRATEGY. Only one screen (the garage,
as of this session) changes its split AXIS with orientation: side-by-side when
wide, stacked with a preview band when tall. Every other screen keeps one axis
and simply gets tighter, which is why portrait phones spend their height on
chrome. The garage needed three things to make the switch pay:

1. something to give the reclaimed space to (the car preview),
2. a way to spend less on the category list (a horizontal scrolling strip, the
   pattern `tuner.css` already used), and
3. the renderer knowing which way the gap now lies.

Only (2) generalises for free. Screens without a hero element have nothing to
put in a band, so "split the other way in portrait" is not a global rule and
should not be applied as one.

## Recommendation

**Migrate the 9 wrong queries onto `data-density` + `--compact-at`. Leave the
other 12 alone.**

The mechanism already exists and shipped this session: `js/game/sheetshape.js`
measures a sheet's height, divides by its own `currentCSSZoom`, and writes
`data-density="compact|normal"` against a per-sheet `--compact-at` threshold —
the same idiom `--pair-at` already uses, for the same reason (screens disagree
only about the number). The tuner declares `620px` and now compacts correctly at
every scale; the shared `.sheet` tier reclaims head/foot padding everywhere.

Order, cheapest and safest first:

1. **`tokens.css` (1 query).** It sets density tokens for every zoomed subtree,
   so migrating it moves the most behaviour per line. Do it alone and re-run the
   380-cell survey — everything downstream shifts.
2. **`tuner.css` (2).** Half-migrated already: `--compact-at` is declared and the
   sticky foot makes the failure non-fatal, but the compact-head block is still
   behind `max-height: 620px`. ~20 selectors need an ancestor prefix.
3. **`menus.css` (3), `responsive.css` (3).** Mechanical once the tier exists.
4. **Then, and only then**, consider bringing `#datahub` and `#track-detail` onto
   `.sheet`. Their 12 queries are correct *because* they are outside it; move
   them in first and you convert 12 working queries into 12 broken ones.

**Do not** add `container-type: size` to make the container queries height-aware.
It sounds like the fix and is not: a size container needs a fixed block size to
avoid a layout loop, and every `.sheet` here is sized by its content or its
viewport. `data-density` exists because that door is shut.

**Do not** collapse the eight thresholds to one number while migrating. They are
not all the same question — 560 on a landscape phone and 700 on a desktop data
hub are different judgements — and flattening them during a coordinate-space
change would confuse two independent risks. Collapse afterwards, with the survey
as the check.

## Done, and what was deliberately left

Steps 1-4 landed. `tokens.css`, `tuner.css` (2), `menus.css` (3) and
`responsive.css` (2) now decide height with `data-density`, resolved per element
against a `--compact-at` — `@property … inherits: false`, because declared
plainly it cascaded into every sheet and moved their thresholds from 380 to 600.
Screens outside `.sheet` get a document-level twin on `body`
(`innerHeight / --ui-scale`), which is what `#overlay` needed: its zoom sits on
its children, so it has none of its own to divide by.

Every scope is a `:where()`. That is not stylistic — a plain ancestor prefix
adds a class and an attribute to every selector in the block, and that was
enough for `#sel-inner`'s height cap to start beating a rule it had always lost
to. `:where()` carries zero specificity, so the cascade is untouched and the
only change is the condition.

**`#hud-sectors` is left on its media query, and that is a decision rather than
an omission.** It is the LAST zoom-blind height rule, it is genuinely wrong (the
element carries `zoom: var(--hud-scale)`, so at HUD SIZE 150% on a 700px screen
its own height is 467 while the query reads 700), and it is exactly ONE rule
setting a top offset, a font size and a padding. The fix would be a second
document-level classifier — `data-hud-density` from `innerHeight / --hud-scale`
— duplicating the body one for a single consumer. That is machinery for
symmetry, not for a defect anybody can see.

**Trigger to revisit:** a SECOND rule appears that is height-conditioned and
governs a `--hud-scale`-zoomed element (`.hud-top`, `.hud-gaps`, `.hud-bottom`,
`#minimap`, `#hud-flag`, `#hud-sectors`, `#lights`, `#announce`, `.dock`). At
two the classifier pays for itself; at one it does not.

## The honest counter-argument

Nine queries is a small number, and eight of them are not currently causing a
visible defect — only the tuner's was proven broken, and that one is already
mitigated by a sticky foot that cannot regress. A reasonable person could leave
all nine and spend the time elsewhere.

The case for doing it anyway is the shape of what this session found. Every
defect a player actually hit — the unreadable garage at high zoom, the tuner's
unreachable DONE, the 242px car sliver, the category grid collapsing to a
wrapping grid — was a rule deciding in viewport pixels about content living in
zoomed ones. The survey scored 380 green cells and predicted none of them,
because a static test at one scale cannot see a coordinate-space error. Nine
remaining sites are nine remaining chances for the same bug, and each one costs
about an hour to find from a screenshot.
