# Should the menus be remodelled? — the decision, after measuring all of them

Written 2026-08-08 at the end of a full survey: **380 cells, 38 screens, 0
skipped, 0 boot failures**, run at UI scale **115** (the value that ships on a
coarse pointer, not the 100 that guards had been testing). Plus an interactive
sweep of eight viewport shapes, both phone and tablet orientations, three desktop
sizes, the rotated monitor, the narrow-landscape band, all five UI-scale settings
and all five HUD-scale settings.

Companion to `UI-REDESIGN-2026-08.md` (the architecture proposal, whose §9
records four errors in its own first draft) and `UI-LAYOUT-CRITIQUE-2026-08.md`
(the per-screen evidence). This document answers the question those two raised.

---

## The headline, and it is not what the critique implied

**The UI does not need a remodel to be CORRECT. It needs one to be
MAINTAINABLE — and those are different projects with different urgency.**

After the seven fixes this session, the complete matrix at the shipped scale
produced **two hard findings across 380 cells**, and both were the same defect
(the two tuner panels hanging off a portrait phone, one root cause). Everything
else — every clip, every truncation, every unreachable control — is fixed or was
never there.

That is a strong result and it should change the plan. A codebase with two
defects in 380 cells is not one to restructure for reliability. The critique
listed seven defects and read like a system in trouble; measured end to end, the
system is sound and the defects were *instances*, each with a local cause:

| defect | cause | fix |
|---|---|---|
| garage panel over the camera bar (61px at ship default) | `--cs-sheet-w` read from two zoom spaces | correction at the consumption site |
| tuner panels off a portrait phone (-14px) | `88vw` inside `zoom` | `88 * var(--vwz)` |
| circuit info panel unreachable in a whole region of landscape | three `@media` branches with a hole between them | delete the ceiling |
| preview controls 30px on an iPad | a touch question gated on width | gate on `body:not(.desktop)` |
| garage rail truncating "SUSPENSION" | rail floor and rail share, at opposite ends | two different knobs |
| circuit facts clipped and unreachable | `overflow: hidden` on a non-`.pane` | make it scroll |
| six race-settings chips truncated | fixed grid track below its own label | wrap |

None of those is an argument for a new architecture. Six of the seven are an
argument that **`zoom` and hand-picked breakpoints are expensive**, which is a
narrower claim.

## What the survey did NOT find, and why that matters

Things the critique predicted would hurt, which measured clean:

- **No horizontal overflow anywhere.** Not one cell, at any scale, on any shape.
- **No WCAG 2.5.8 failures.** Zero controls under 24 CSS px across 38 screens.
- **The rotated monitor is clean** — the cell `docs/LAYOUT-AUDIT.md` says "keeps
  finding bugs" found nothing this time.
- **`data-shape` resolves correctly everywhere** it is consumed.
- **The scroll-fade system works.** The lighting tuner's rail *looks* clipped in
  a screenshot — a tab bisected at the boundary — and is not: `#lt-rail` is a
  `.pane` carrying `sf-b` with a live 26px mask over 170px of hidden content.
  Reported here as a NEGATIVE result on purpose: the eye said defect, the
  measurement and the affordance both said fine, and the measurement was right.

That last one is the general lesson. **Three times this session a visual read was
wrong** and the instrument was right; twice the instrument was wrong and had to
be corrected (`min(width,height)` on tap targets; `--tap` off `:root`). Neither
eye nor probe is authoritative alone.

## So what IS the case for remodelling?

Not correctness. **Cost of change.** Four numbers, all measured:

1. **538 distinct classes against 102 custom properties.** Pico ships a complete
   design system at **16 classes / 251 properties**. The ratio is inverted, and
   the repo already demonstrates the right pattern once: `--sheet-w` gives one
   `.sheet` class fourteen per-screen contexts and zero variant classes.
2. **47 interactive class families**, of which roughly six clusters are one
   surface each — six career classes render one card; `.lt-tab` and
   `.dh-sortbtn` differ by 1px of padding.
3. **24 breakpoints, 12 used exactly once**, and eight of them are height
   thresholds asking the same question five different ways. Material gets three
   height tiers from two breakpoints. Two of this session's defects were holes
   *between* hand-picked numbers.
4. **Type has no range.** ~90% of text sits at 11/12/13px, so hierarchy migrated
   to weight — which is why `800` is the most common weight in the app, ahead of
   both 700 and 400. And only one italic face ships, so a large share of that
   800 is browser-synthesised and not really rendering.

Those are maintenance costs, not user-visible faults. They predict *future*
defects rather than describing current ones.

## The recommendation

**Do the subtractive half. Defer the mechanism half.**

**DO NOW — each independently shippable, none changes behaviour:**

- **Collapse the six one-surface clusters** onto slot-based primitives, using
  `--sheet-w` as the template: one class, N `--property` contexts. Ratchet the
  distinct-class count (start at 538) the way `module-size.test.mjs` ratchets
  game.js, so it cannot creep back.
- **Collapse the eight height thresholds to two**, resolved once into a single
  `data-density` attribute. This is the change that would have made two of this
  session's seven defects impossible rather than fixed.
- **Tokenise type on six rungs** (13/16/20/26/34/48 — see `UI-REDESIGN` §9.4;
  the seven-rung 1.2-ratio version in §3 had 2px steps at the bottom and repeated
  the failure it diagnosed). Raising the floor from 8-9px to 13px is a deliberate
  behaviour change and will cost a row on some 393px screens. Say so.
- **Bring `#overlay`, `#datahub` and `#track-detail` onto `.sheet`.** Those three
  are the only screens outside it, and they are the three that cannot use
  container queries, do not scale with UI SIZE, and miss the type ladder.

**DO NOT:**

- **Do not split `index.html`.** 969 body nodes against Lighthouse's 800 warn /
  1400 error bands, and `display: none` subtrees never enter the render tree.
  The real cost is 538 classes of selector matching, not node count. On GitHub
  Pages, fetched partials additionally cost an RTT per screen and break the
  service-worker precache, which is seeded from the shell's own script tags.
- **Do not restructure the screen inventory** on this evidence. 38 screens
  measured clean; the argument for merging them is taste, and taste is not what
  380 green cells justify.
- **Do not adopt a CSS methodology.** Require a before/after class count from any
  proposal. Renaming 538 classes into BEM or CUBE produces 538 differently-named
  classes.

**DEFER — with the trigger written down:**

- **Retiring `zoom` for a `--u` length token.** It is the change that deletes a
  bug *class* rather than instances: three of this session's seven defects were
  `zoom` interactions. But `zoom` reaches ~2,046 raw px sites that a token
  reaches only where someone migrated, and a half-migration is worse than either.
  **Trigger:** the type/space/radius tokens have landed AND a `uiunit-lint`
  reports zero un-allow-listed bare px in the files feeding one scope. Then
  retire that scope — there are four, and they can go one at a time.

## The honest counter-argument

The case against doing even the subtractive half: **it has no user-visible
payoff.** A player cannot see a class count. The seven defects fixed this session
were worth fixing because each was something a player hits; collapsing
`.cr-flavour` and `.cr-teamtile` into one primitive is worth doing only if it
prevents a future defect, and that is a prediction, not a measurement.

The strongest evidence for it is the shape of what was found. Two defects came
from a variable read in two coordinate spaces, one from a hole between
hand-picked breakpoints, one from a touch question gated on width, and two from
the same label being too wide for two different reasons at two ends of a ladder.
**Every one is a coordination failure between rules that did not know about each
other** — which is exactly the failure mode a smaller vocabulary prevents and a
larger one guarantees.

That is the argument. It is a real one, but it is about the next twelve months,
not about anything a player sees today.
