# The component inventory — what exists, who owns it, what is shared

`css/` holds **516 classes in 55 families**, and until this document there was no
list of them. That absence has a cost, and it has already been paid: `.res-*` is
defined in `components.css` *and* `career.css`, which is something I found by
grepping in the middle of fixing an unrelated cascade-layer bug rather than by
looking it up. Cross-file coupling you cannot see is cross-file coupling you
break by accident.

Generated from `css/` and cross-checked against `index.html` and `js/`. The
family table is asserted by `tests/component-inventory.test.mjs`, so a new family
cannot appear without this document noticing.

---

## The three primitives, plus one pattern

Everything else is built on these. They live in `css/components.css`.

| primitive | what it is |
|---|---|
| `.screen` | a full-viewport overlay, inset by the OS safe area, that centres its child |
| `.sheet` | a card with a fixed head, ONE scrolling body and a pinned foot; also the `sheet` **query container** every layout decision inside it keys on |
| `.pane` | a scroll region that says so — an edge fade on whichever side has more |
| `.pane-pair` | the shared **list-detail** layout (`.pair-side` + `.pair-main`), used by `#select`, `#carsetup` and `#career`. Slots are named by POSITION, not role — see the note in `css/components.css` |

## Families, and the file that owns each

"Owner" is the file with the most rules for that prefix; "also" means other files
add to or override it. A family with more than one file is a coupling — usually
deliberate (`responsive.css` re-tunes `hud-*` for large screens), occasionally
not.

| family | rules | owner | also in |
|---|---|---|---|
| `dh-` | 368 | `data.css` | `components.css` |
| *(unprefixed)* | 226 | `overlays.css` | components, carsetup, career, menus, tuner, hud, responsive, tokens |
| `cs-` | 132 | `carsetup.css` | components, menus, responsive |
| `cr-` | 75 | `career.css` | — |
| `lt-` | 61 | `tuner.css` | hud, components |
| `pc-` | 56 | `hud.css` | tuner |
| `vs-` | 38 | `overlays.css` | — |
| `sheet-` | 37 | `components.css` | tuner, overlays, career, carsetup, menus |
| `sel-` | 37 | `menus.css` | components, career, carsetup |
| `res-` | 30 | `components.css` | career |
| `hud-` | 26 | `overlays.css` | hud, responsive, tokens |
| `adv-` | 25 | `tuner.css` | components |
| `as-` | 19 | `tuner.css` | components |
| `opt-` | 17 | `tuner.css` | components |
| `tune-` | 15 | `tuner.css` | components |
| `cz-` | 14 | `menus.css` | components |
| `photo-` | 14 | `tuner.css` | — |
| `preset-` | 12 | `tuner.css` | components |
| `track-` | 12 | `menus.css` | components |
| `sp-` | 12 | `tuner.css` | — |
| `team-` | 11 | `menus.css` | components |
| `steer-` | 10 | `overlays.css` | — |
| `tdc-` | 10 | `track-detail.css` | — |
| `co-`, `pm-`, `pane-`, `music-` | ~9 each | career / components / components / tuner | — |

The long tail (`sf-`, `q-`, `cg-`, `tm-`, `spf-`, `ot-`, `ax-`, `flag-`, `sec-`,
`sur-`, `trb-`, `tdf-`, `tds-`, `tdd-`, `mb-`, `rs-`, `no-`, `rotate-`,
`cockpit-`, `budget-`, `over-`, `dock-`, `in-`, `btn-`, `chip-`,
`season-`, `pair-`) is one file each and needs no map.

**The `(unprefixed)` row is the one to watch.** 226 rules across nine files, on
state classes rather than components — `.active`, `.on`, `.armed`, `.desktop`,
`.p1`, `.you`, `.dim`. State is *meant* to be cross-cutting, so this is not a
defect, but it is the least discoverable part of the system.

## Defined in more than one file

This is the list worth keeping in view. Every entry is a place where editing one
file changes a screen owned by another.

**Deliberate sharing — one component, re-tuned elsewhere:**

- `.bigbtn` — `components` + `menus` + `overlays` + `responsive` + `tokens`
- `.hud-box` / `.hud-label` / `.hud-value` / `.hud-gaps` — `hud` + `responsive` (+ `tokens`)
- `.hud-bottom` / `.hud-unit` / `.touchbtn` — `hud` + `overlays`
- `.minibtn` — `menus` + `responsive`
- `.cs-stat-*` (4 classes) — `carsetup` + `menus` + `responsive`
- `.dh-card` / `.dh-tab` / `.dh-row` / `.dh-pill` / `.dh-dchip` / `.dh-sortbtn` / `.dh-race-sub` / `.dh-error-msg` — `data` + `components`

**Cross-SCREEN reuse — a component borrowed by a screen that does not own it:**

- `.res-row` / `.res-pos` — `components` + `career`. The championship table
  deliberately reuses the results-screen row so standings do not look like a
  different game depending on where you are. **This is the one that bit us**: it
  is invisible from either file alone.
- `.sel-label` — `components` + `menus` + `career` + `carsetup`. The skewed red
  section heading, used by four screens.
- `.sel-chip` — `components` + `menus` + `career`; `.sel-edit` — `components` +
  `menus` + `carsetup`; `.sel-edit-row` — `menus` + `carsetup`.
- `.cs-tab` / `.cs-opt` / `.cs-unlimited-btn` — `carsetup` + `components`
- `.lt-tab` — `components` + `tuner`; `.pc-nopanel` — `hud` + `tuner`;
  `.adv-sec` / `.adv-help` / `.adv-intro` / `.as-note` — `components` + `tuner`

**State classes** (`.active`, `.on`, `.armed`, `.desktop`, `.p1`, `.you`,
`.screen`, `.dim`) are shared by design and are listed here only so nobody
mistakes them for components.

## Dead classes

**None.** The three this audit originally found — `dh-leg-swatch`, `dh-sectors`
and `foot-end`, defined in `css/` and referenced from neither `index.html` nor
any `js/` file — have since been deleted, and `foot-end` was the last member of
its prefix family, which therefore leaves this map too.

Three out of 516 was the real headline of the exercise, and it survives the
deletion: the stylesheet was never carrying rot, it was carrying no map.
`tests/component-inventory.test.mjs` is what keeps that true — it fails if this
document names a family that has left `css/`, which is exactly how these three
were noticed going.

---

## How to use this

- **Before editing a class, check whether it appears above under "more than one
  file".** If it does, you are editing more than one screen.
- **Before adding a family**, ask whether an existing one already covers it. The
  audit grid (`docs/LAYOUT-AUDIT.md`) measures 30 screens; a new family usually
  means a new one-off, and one-offs are what `.pane-pair` was built to retire.
- **Regenerate with the same method** the test uses if the numbers here drift:
  `node --test tests/component-inventory.test.mjs` will say so first.
