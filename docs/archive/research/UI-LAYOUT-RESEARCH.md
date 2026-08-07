# What the rest of the world does about panels, and what we should steal

Research pass (August 2026) prompted by a run of layout bugs that all had the
same shape: a panel that was right on one screen and wrong on another. Sources at
the bottom. The point of this document is not a survey — it is a shortlist of
things worth doing to `css/menus.css`, `css/carsetup.css` and
`tools/layout-audit.mjs`.

---

## 1. Our layouts have no names, and that is the root problem

Material 3 and Android's adaptive guidance both settle on the same small set of
**canonical layouts**: *list-detail*, *supporting pane*, *feed* — chosen by a
**window size class** (compact / medium / expanded / large), with the framework
supplying `ListDetailPaneScaffold` and `SupportingPaneScaffold` so a screen
declares WHICH pattern it is and the system decides how many panes to show.

We have exactly those two patterns and no names for either:

| our screen | what it actually is | today |
|---|---|---|
| `#select` — circuit list + preview card | **list-detail** | hand-rolled grid, three branches |
| `#carsetup` — category rail + option list | **list-detail** | a second hand-rolled grid, different branches |
| `#career` — hub + guide panes | **supporting pane** | a third |
| `#datahub` — tab strip + content | **feed / tabbed** | a fourth |

Every one of those re-derives the same decisions (when do the panes sit side by
side; who gets the scroll; where does the action bar go) in its own idiom, which
is why fixing the garage taught us nothing about the select screen. **Idea: one
`.pane-pair` primitive** — two children, a `--pair-split` custom property, the
detail pane spanning the action-bar row, the list pane owning the scroll — and
both screens become instances rather than one-offs. The audit grid then measures
the primitive, not four lookalikes.

## 2. Size containment explains the trap we hit twice

`container-type: inline-size` lets you query width only. Querying **height,
`aspect-ratio` or `orientation` requires `container-type: size`**, which applies
size containment in both axes — and a size container **cannot take its size from
its contents**, because that would loop.

That is the precise reason `#sel-inner` cannot answer "am I a tall sheet or a
wide one?" from inside a container query, and why I fell into gating a
portrait-shaped LAYOUT on a portrait-shaped VIEWPORT — which is false on a
rotated monitor, where `#sel-inner { height: min(100%, 720px) }` makes a
landscape sheet inside a portrait window. The list ended up two pixels tall.

Two legitimate ways out, both better than what we do now:

- give the sheet a **definite height** (it nearly has one already:
  `max-height: 100%` plus the 720px cap) and switch it to `container-type: size`,
  which buys `@container sheet (orientation: portrait)` and `(aspect-ratio < 1)`
  honestly; or
- compute the shape **once in JS** with a `ResizeObserver` and write
  `data-shape="tall|wide"` on the sheet, then key CSS off the attribute. One
  place decides, everything else reads. This also dodges the specificity trap
  below, because attribute selectors can be given whatever weight we want.

Related: a container query **adds no specificity**, so a single-ID rule inside
`@container` ties with an identical single-ID rule elsewhere and loses on source
order. That has now cost this project two debugging sessions (the map's width
knob exists solely to dodge it). A `data-shape` attribute plus
`:where()`/`:is()` for deliberate low weight is a cleaner contract.

## 3. Quantum layouts: the pane pair that needs no query at all

Every Layout's **Sidebar** and **Switcher** get side-by-side-until-it-does-not-fit
out of flexbox alone: `flex-wrap: wrap`, a fixed `flex-basis` on one child, and a
percentage `min-inline-size` on the other that forces the wrap when the pair
would be squeezed past a threshold. Jen Simmons' *intrinsic web design* is the
same idea — algorithmic layouts that self-govern instead of being told what to do
at N breakpoints.

For us this is not academic. The garage's rail/options split and the select
screen's preview/list split are both "side by side until the panel is narrow,
then stacked", and both are currently spelled as explicit branches with hand-
picked thresholds (400px, 620px) that we have already had to move twice. A
Switcher-style rule would express the SAME intent as a property of the content:
*wrap when the detail pane would go under ~30ch*. Worth prototyping on the
garage, which is the simpler of the two, and measuring with the audit before
adopting.

## 4. Viewport units: we should be using `svh`, not `%` guesses

`dvh/svh/lvh` are ~95% supported now. The received wisdom is **`svh` for layout,
`dvh` almost never** — `dvh` changes during scroll as browser chrome retracts,
which produces jumps and animation jitter, and in-app browsers (Instagram,
Twitter) make `svh` behave like `dvh` anyway.

We use `min(40svh, 300px)` in exactly one place (`#sel-tracks` on narrow sheets)
and percentages everywhere else. The sheets already handle the notch properly via
`--safe-t/r/b/l` and `env(safe-area-inset-*)`, which is the half most projects
get wrong. Idea: make `svh` the house unit for sheet caps, and keep the
`max()`-with-safe-area pattern we already have.

## 5. Our tap-target finding is stricter than the standard

The audit flags controls under the `--tap` token (44/40). Worth calibrating
against the actual criteria: **WCAG 2.2 SC 2.5.8 (AA) is 24x24 CSS px**, with
exceptions for adequate spacing; **2.5.5 (AAA) is 44x44**; Apple HIG says 44pt,
Material 48dp.

So the 40 circuit rows the audit reports at 40px on an iPhone are **AA-conformant
and Apple-adjacent**, not violations — they are a full-width row with 24px+ of
spacing, which is the case the standard explicitly allows for. The probe should
say so rather than implying a defect: keep counting, label it "below house floor"
(amber), and reserve red for < 24px or overlapping targets.

**Done.** The probe now records two lists: `smallTaps` (under the `--tap` token —
amber, a house preference) and `tinyTaps` (under WCAG's 24px — red, a real
defect). The console line reports `tapUnder24` and `tapSoft` separately. The 40
circuit rows and the 23 race-settings controls the grid used to shout about are
amber where they belong.

## 6. Where our harness sits next to the industry

The visual-testing field (Percy, Chromatic, Applitools, BackstopJS, Playwright's
`toHaveScreenshot`) is overwhelmingly **pixel-diff against a baseline**. That
catches "something changed" and needs a human to say whether the change was
wanted — plus a baseline per cell, which on this software renderer is minutes of
capture each.

`tools/layout-audit.mjs` is deliberately the other kind: **assertions about
geometry** (does anything escape its clipper, is anything unreachable, does the
document scroll sideways) which need no baseline, no approval step, and produce a
diffable JSON. The two are complementary, and the industry's own advice for
design systems — pair token audits with automated checks rather than relying on
screenshots — is the same conclusion.

Worth adding from the pixel-diff world: a **small** set of blessed cells
(title/select/garage x phone-portrait, phone-landscape, desktop) under
`toHaveScreenshot`, so identity-level regressions (colour, type, spacing) get
caught too. Not 120 baselines — six.

One concrete gotcha now documented in the tool: in the **JavaScript** Playwright
client, `page.evaluate("(x) => …", arg)` evaluates the string as an EXPRESSION
and the argument never arrives, so the call returns a function object that
serialises to `undefined`. Function-source-as-string is only first class in the
Python/Java clients. My first full sweep reported 100 clean cells and had
measured nothing.

## 7. Ideas ranked by what they would have prevented

1. ~~**`data-shape` on the sheet, written by one ResizeObserver**~~ — **done**,
   `js/game/sheetshape.js`. See §8 for what it did and did not settle.
2. **One `.pane-pair` primitive for select + garage + career** — would have made
   the garage fix and the select fix the same fix. *(medium, highest value)*
3. ~~**Recalibrate the tap-floor finding to WCAG 24px red / house-token amber**~~
   — **done**, see §5.
4. **`svh` as the house cap unit.** *(trivial, prevents a class of iOS bug we
   have not hit yet)*
5. **Switcher-style intrinsic wrap for the pane pair**, replacing hand-picked
   thresholds. *(medium; prototype on the garage and measure)*
6. **Six blessed pixel baselines** alongside the geometry audit. *(cheap)*

---

# Second pass — a system for orientations and devices

The first pass asked "why did these particular bugs happen". This one asks the
question that follows: what would a deliberate setup look like, given every shape
of display this game can land on. Sources for this pass at the bottom too.

## 8. We have been treating one question as seven

Every layout bug in this project so far came from answering one axis with a
mechanism that belongs to a different one. There are at least seven independent
axes, and until now none of them had a name:

| axis | what it actually asks | right mechanism | where we stand |
|---|---|---|---|
| **viewport size** | how big is the window | `@media (min-width)` | used, fine |
| **viewport shape** | is the WINDOW tall or wide | `@media (orientation)` | over-used — it was standing in for the row below |
| **container size** | how much room did this PANEL get | `@container sheet (min-width)` | used, correct |
| **container shape** | is the PANEL tall or wide | *nothing in CSS* → `data-shape` | fixed, see §9 |
| **input modality** | finger, mouse, or both | `pointer` / `any-pointer` / `any-hover` | half-done, see §11 |
| **density** | how big should a target be | `--tap` token ladder | used, correct |
| **safe area** | what hardware is in the way | `env(safe-area-inset-*)` | used, but untested — see §12 |
| **display segments** | is there a hinge across this | `@media (horizontal-viewport-segments)` | not handled, see §13 |

The rotated-monitor bug was the *viewport shape* mechanism answering the
*container shape* question. The garage-versus-select divergence was two screens
answering *container size* with two different sets of hand-picked thresholds.
Nothing here needed a new technique — it needed the table.

**This table belongs in `docs/LAYOUT-AUDIT.md`** (which already has a shorter
three-row version) as the thing to consult before adding any layout rule.

## 9. `data-shape` works, but check whether CSS can now do it alone

`js/game/sheetshape.js` measures the sheet and writes `data-shape="tall"|"wide"`.
It fixed the bug. Two things worth knowing about the alternatives before this
calcifies:

**Style queries are now everywhere.** `@container style(--foo: bar)` for custom
properties shipped Chrome/Edge 111, Safari 18, Firefox 128 — every evergreen
browser. So the shape could be a custom property instead of an attribute, and
shape rules would then *compose* with the size queries they currently sit beside:

```css
@container sheet (min-width: 620px) and style(--shape: tall) { … }
```

That is genuinely tidier than today's `#sel-inner[data-shape="tall"] …` prefix on
every rule. The catch is the one that bit us before: **container queries add no
specificity**, so a style query would put us straight back into source-order
ties, whereas the attribute selector carries weight and wins on merit. Attribute
was the right call for a codebase that has lost that race twice. Revisit only if
the pane-pair primitive (idea #2) makes the rules few enough that ordering is
obvious.

**`container-type: size` is not off the table either.** It is only forbidden when
the container sizes itself from its contents. `.sheet` is close to having a
definite height already (`max-height: 100%` plus the 720px cap in
css/responsive.css), and Tailwind treats block-size containment as an ordinary
opt-in (`@container-size`, with `cqb`/`cqh` units) rather than an exotic mode. If
the sheet were given a definite height, `@container sheet (aspect-ratio < 1)`
would work natively and `sheetshape.js` could be deleted. Worth costing — one
fewer moving part, and no first-frame gap where the attribute is unset.

## 10. The cascade-layer bug we shipped is the documented #1 pitfall

Worth recording that this was not an exotic failure. Every guide to `@layer`
leads with the same warning: **unlayered normal declarations beat every layer**,
so what you leave outside is a priority bomb. We had 380 lines outside across four
files and it silently defeated a two-ID rule with a one-ID one.

Two further details we should not have to rediscover:

- **`!important` inverts the whole order.** Unlayered `!important` has the
  *lowest* precedence, and the first layer declared wins. So `!important` inside
  `@layer reset` outranks `!important` anywhere else — which is the emergency
  hatch if a third-party sheet ever fights us.
- **3–6 top-level layers is the consensus band.** We have five (`reset, base,
  components, hud, overlays`), declared once in `css/tokens.css`. That is right;
  the problem was never the design, only that files leaked out of it.

`tests/unit/css-layers.test.mjs` now enforces the boundary. The remaining gap is that
it checks *structure*, not *intent* — a rule can be in the wrong layer and still
pass. Nothing cheap fixes that; the structural check is what caught the real bug.

## 11. Input modality is a separate axis from size, and we only half-model it

`body.desktop` comes from `pointer: coarse`, which is correct in kind — input is
not size, and a 1024px iPad is not a desktop. But `pointer`/`hover` describe the
**primary** input only. `any-pointer`/`any-hover` describe the union of all of
them, and the difference is exactly the hybrid case: an iPad with a trackpad or a
Surface reports a coarse primary pointer while also having a fine one.

For this game that matters in two concrete places — the menu's keyboard/pointer
navigation (`js/game/menunav.js`) and whether the GAS pedal is hidden
(`autoThrottle()` in touch mode). A player driving an iPad with a controller
currently gets the finger-shaped UI throughout.

The received advice is to use these features *sparingly*, because both directions
produce wrong assumptions. The narrow, safe version: keep `body.desktop` as the
density/affordance switch it is, and add `any-hover: hover` only where a hover
affordance would otherwise be unreachable.

## 12. Safe areas are orientation-dependent, and nothing tests them

The tokens (`--safe-t/r/b/l` over `env(safe-area-inset-*)`, with `viewport-fit=cover`)
are the part most projects get wrong and we already got right. But the insets are
**different in landscape** — the notch moves to the side, and landscape is the
shape this game is *played* in. The `max()`-with-token pattern we use is the
recommended one; what is missing is any assertion that it works.

**Concrete addition to `tools/layout-audit.mjs`:** a check that no interactive
element's box intersects the safe-area inset region. It is a few lines — the
insets are readable from computed style — and it turns "we handled the notch"
from a claim into a measurement, on the axis where emulators are least
trustworthy and hardware testing is hardest.

## 13. Foldables are the one device class we have never considered

Viewport segments and the Device Posture API went to origin trial in Chrome 125
and are the standard answer for a display split by a hinge. On a dual-screen or
folded device, a centred `.sheet` lands across the fold — the circuit list cut in
half by hardware.

This is not urgent and does not deserve a layout. It deserves a **guard**: when
`@media (horizontal-viewport-segments: 2)` matches, constrain the sheet to one
segment rather than centring it across both. A handful of lines that turn a
broken screen into a merely unoptimised one, and DevTools can emulate it, so it
is testable without the hardware.

## 14. What "use a framework" can and cannot mean here

Asked to take advantage of available components or frameworks, the honest first
answer is what is **ruled out by the architecture, not by taste**. This project
is `"use strict"` IIFE files loaded by `<script>` tags, no build step, static on
GitHub Pages, with exactly one ES-module island (vendored three.js). So:

| candidate | verdict |
|---|---|
| React / Vue / Svelte | out — needs a build, and a rewrite of every screen |
| Tailwind | out — its whole value is a build-time scan; the CDN build is explicitly not for production |
| Material Web (`@material/web`) | out — ES modules, realistically a bundler |
| Open Props | *possible* (one `<link>`, no build), but it is a token library and `css/tokens.css` already is ours |
| **Open Props UI** | usable as a **source**, not a dependency — it is explicitly copy-and-paste, no install |
| **Every Layout** | patterns to copy, already cited in §3 |
| **the platform** | **the actual answer** — see below |

The framework worth adopting is the web platform, and the case is measurable.

**The layering evidence.** `css/` carries a hand-maintained `z-index` ladder of
**25 distinct values across 49 declarations**, topping out at 9000; 54 sites
toggle `.hidden` to show or hide an overlay; ESC is handled in two files;
no overlay traps focus. `<dialog>.showModal()` supplies the **top layer**
(which no `z-index` can reorder, and which no `overflow: hidden` or transformed
ancestor can clip), `::backdrop`, ESC-to-close, focus containment and an inert
background — all of it deleting code rather than adding it. It would also have
prevented a bug hit while writing this: forcing `hidden = false` on `#pmsettings`
desynced that screen's own state and made every subsequent panel button a no-op.

That migration is real work — 12 `.screen.dim` modals — but it is **incremental**:
one helper that opens a screen, screens converted one at a time, each verified by
its row in the audit grid.

**The adaptivity evidence** is §15.

## 15. `.pane-pair`: the primitive, and what building it taught

Idea #2 is now built (`css/components.css`). `#select`, `#carsetup` and `#career`
were three hand-rolled copies of one canonical list-detail layout, and the copies
had each rediscovered the same bugs separately. What they actually shared, once
the incidental numbers were stripped out: columns declared on the **sheet** (a
container query cannot style its own container), children spanning both by
default, `display: contents` on the body when split, the detail pane spanning the
body row **and** the foot row, and a `min-content` foot track.

Screens now set four custom properties — `--pair-at`, `--pair-split`,
`--pair-detail`, `--pair-gap` — and nothing else. `#carsetup` and `#career` are
migrated and measured clean; `#select` is not, because it carries a second axis
(`data-shape` decides bands versus columns) and composing the two attributes is a
design decision worth taking deliberately rather than as the tail of a long
change. Everything it needs is listed at the end of §16.

**Why an attribute and not a container query.** A query condition cannot take a
custom property, so `(min-width: 400px)` and `(min-width: 620px)` are two
different blocks and the shared body would have to be duplicated into both —
exactly the duplication being removed. `js/game/sheetshape.js` already ran one
ResizeObserver over every sheet; it now reads `--pair-at` and writes `data-pair`.
Attributes also carry specificity, which container queries do not.

Two things this cost, both worth writing down:

- **A class-based primitive loses to the ID rules it replaces.**
  `.pane-pair[data-pair="on"] > .sheet-body` is (0,3,0); `#cs-body` is (1,0,0).
  The body stayed a flex column while the sheet was already two grid tracks —
  the rail rendered 402px wide inside a 115px track and the option list came out
  **10px tall**. Screens must gate their stacked-layout rules with
  `:not([data-pair="on"])`, and `:not(...)` rather than `[data-pair="off"]` so an
  unmeasured sheet still stacks.
- **Do not leave two sources of truth for one threshold.** The `@container sheet
  (min-width: 400px)` block still held pair-dependent rules after the attribute
  took over the decision. The two agree eventually but not instantly — the query
  applies the frame a screen is shown, the attribute waits on an observer — and
  in that window the rail lost its height cap while the body was still stacked,
  so fourteen categories grew past the sheet and five were unreachable below it.
  Anything true only *when the panes split* belongs on `[data-pair="on"]`.

## 16. `<dialog>`: a seam, not a rewrite

The z-index case in §14 is now acted on for 12 of the 16 `.screen.dim` modals.
The interesting part was not the feature — `showModal()` is one call — but how to
adopt it without a sixty-site rewrite of a state machine that had already proved
fragile.

**The seam.** A migrated screen becomes a `<dialog>` in the markup and gains
nothing else. `js/game/topmodal.js` watches its `hidden` attribute and mirrors it
onto `showModal()` / `close()`. Every existing `.hidden = false` call site keeps
working, unchanged and unaware, and screens migrate one at a time. `hidden` stays
authoritative on purpose: making `open` the source of truth would force every
reader of `.hidden` — menus.js, the pause flow, the audit harness, the specs — to
learn a second way to ask the same question on a staggered schedule.

**Escape is where the free feature turns into a trap.** A native dialog closes
itself on Escape, but closing the ELEMENT is not closing the SCREEN. The VS
FRIEND lobby's own close path stops the camera and tears down a half-built
RTCPeerConnection *before* hiding anything, and CLAUDE.md is explicit that a
camera outliving its screen is a privacy bug nothing on screen would reveal. A
bare Escape leaves both running. So `data-esc-close="<id>"` names the control
Escape should press, and Escape then does exactly what that button does — no
second code path to keep in step. `data-esc="none"` refuses Escape for a screen
that is a gate rather than an overlay (`#results`, whose buttons are MENU and
NEXT — neither of which means "dismiss").

Verified behaviourally, not just geometrically: opens through the app's existing
call site; is in the top layer; the background is genuinely inert (the element
over the main menu's RACE button is the dialog's content, not the button); focus
moves inside; Escape closes AND puts `hidden` back in step so the screen reopens;
Escape on the lobby calls the lobby's own close button; `#results` refuses it.
`npm run test:net` 65/65 with the lobby as a `<dialog>`, and 300 audit cells clean.

**The four flow screens are done too**, in a second pass with the flow reasoned
about rather than the tag swapped. All sixteen `.screen.dim` modals are now
`<dialog>`s. What each one means by "leave this screen" already existed in the
app, so Escape was pointed at that control rather than given a new meaning:

| screen | Escape presses | because |
|---|---|---|
| `#pausemenu` | `#pm-resume` | that is what the pause key already does |
| `#pmsettings` | `#pm-settings-close` | it must go BACK to the pause menu, not out of both |
| `#race-settings` | `#rs-cancel` | it is a gate; cancelling is the only "leave" |
| `#quali` | `#q-back` | which also clears a session nobody ran |
| `#results` | *(refused)* | MENU and NEXT, and neither means "dismiss" |

Verified the exact interaction that carved these out in the first place: pause →
settings → Escape lands back on the PAUSE MENU (not out of both), Escape again
resumes, re-pausing works, and `#pm-advanced` inside settings still opens. That
last one is the bug that started this — forcing `#pmsettings.hidden = false`
desynced the screen and made every button inside it a silent no-op — and it is
the thing the seam had to survive.

`#pmsettings` and `#pausemenu` are mutually exclusive by construction
(`setPaused` and `closeSettings` toggle one as they toggle the other), so the
top layer never has to arbitrate between them.

## 17. Ranked, second pass

1. ~~**Write the seven-axis table into `docs/LAYOUT-AUDIT.md`**~~ — **done**.
2. ~~**`.pane-pair` primitive**~~ — **built**, and `#carsetup` + `#career` are on
   it (§15). **`#select` is the one left**: it needs `data-shape="tall"` to win
   over `[data-pair="on"]` (it already does on specificity — `#sel-inner[data-shape]`
   is (1,1,0) against the primitive's (0,3,0)), plus one rule returning the foot
   to `grid-column: 1 / -1` in the band layout, and its `:not([data-shape="tall"])`
   column extras moved off the container query onto `[data-pair="on"]`.
3. ~~**Migrate the `.screen.dim` modals to `<dialog>.showModal()`**~~ — **all 16
   done** (`js/game/topmodal.js`), and the z-index ladder they made inert is
   deleted: 49 declarations down to 39, with none left on a migrated screen.
   See §16.
4. **Safe-area assertion in the audit probe.** The one axis we claim to handle
   and never verify, on the orientation the game is played in. *(cheap)*
5. ~~**Cost out `container-type: size` on the sheet**~~ — **costed, and the
   answer is no.** Size containment forbids a container from taking its size
   from its contents, and that is exactly how every sheet is sized: `.sheet` sets
   `width` and `max-height: 100%` but no `height`, and sits in a
   `display: grid; place-items: center` screen, so it SHRINKS TO FIT. The only
   exception is `#sel-inner`, and only in one branch
   (`css/responsive.css: height: min(100%, 720px)`). Making the rest definite
   means `height: 100%` on every sheet — every modal becomes a full-height card
   instead of hugging its content, which is a visual redesign, not a refactor.
   `js/game/sheetshape.js` stays, and its 90 lines are the cheaper side of that
   trade.
6. **Foldable guard** — one media query, turns broken into unoptimised. *(cheap)*
7. ~~**`svh` as the house cap unit**~~ — **done**. Every layout cap and fixed
   overlay position now uses it; the type and gap clamps deliberately stay on
   `vh` (a font-size that changed as the toolbar slid would be worse than the
   imprecision). House rule recorded in css/tokens.css.
8. ~~**Six blessed pixel baselines**~~ — **done**, `tests/specs/menu-baseline.spec.js`.
   Proved they can fail before trusting them: swapping `--red` to blue fails four
   of six, restoring it passes all six.
9. ~~**`any-hover` for hybrid devices**~~ — **done, in exactly one place.**
   `.pc-hint` (the keyboard-shortcut hint) was hidden on `(pointer: coarse)`,
   which describes the PRIMARY input only — so an iPad with a Magic Keyboard or a
   Surface lost the hint, telling the one user who definitely has the keys
   nothing about them. Now `(not (any-pointer: fine))`, which asks the whole
   device. Left everywhere else alone, per §11.
10. ~~**The rotated-monitor sheet cap**~~ — **done**. `#sel-inner` was capped at
   a flat 720px, so a 1080x1920 portrait monitor showed a 720px sheet in ~1896px
   of room — about 60 % of the screen empty. Now `min(100%, max(720px, 78svh))`:
   the fraction follows the screen and the 720 floor leaves every landscape
   desktop untouched (78 % of 800-937px is under 720 anyway). Measured, the
   rotated monitor goes 720 -> 1498px tall, `data-shape` flips it to TALL, and it
   takes the BAND layout with a 974x922 list instead of a 573x661 one. Worth
   noting this was only safe to do AFTER the shape system existed: under the old
   orientation proxy a taller sheet there would have kept the columns and merely
   stretched them.

## What the audit found while this was being written (build 923) — and why it was wrong

The first calibrated sweep reported two findings, both iPhone portrait: the data
hub's TELEMETRY and EXPORT tabs clipped by `.dh-tabs` and unreachable at x=409 in
a 393px viewport, and the career hub's SLOT 3 (y=728) and `#cr-guide-myteam`
(y=812) sitting past a 659px viewport with "no scrollable ancestor".

**Both were false positives, and from the same mistake.** The probe decided
"can this scroll?" by matching against a hardcoded list of the project's known
scroll regions (`.pane, #sel-body, …`). `.dh-tabs` is a plain
`overflow-x: auto` strip and `#cr-body` is a plain `overflow-y: auto` div;
neither is on the list, so content that a swipe brings into view was reported as
content nobody can reach. Scrolling `#cr-body` to its end moves SLOT 3 from
y=728 to y=409 — there is 319px of scroll range and both controls are reachable.

Two lessons, both now baked into the tool:

- **Ask the computed style, not a list of names.** `scrollerAncestor` now tests
  `overflow-x/y` against real `scrollWidth/Height` overflow on every ancestor.
  A curated list of selectors is a claim about the DOM that goes stale silently,
  which is precisely the failure mode the audit exists to prevent.
- **A clipping check must exempt BOTH scroll axes.** The old rule exempted only
  Y, so every horizontal scroll strip in the app read as a clipping bug.

The honest score for build 923 is therefore **120 cells, zero real findings** —
which is a weaker headline and a better tool. It is also the third time on this
task that measurement disagreed with a first reading, after the animated-scroll
misread and the string-`pageFunction` sweep that measured nothing. The pattern is
consistent enough to state as a rule: **a finding from a new probe is a claim
about the probe until something independent confirms it.** The career check above
was run as a separate script that actually scrolled the container, not as a
second opinion from the same code.

---

## Sources

- [Canonical layouts — Material Design 3](https://m3.material.io/foundations/layout/canonical-examples/overview)
- [Canonical layouts | Adaptive Apps — Android Developers](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts)
- [Get started with adaptive apps — Android Developers](https://developer.android.com/develop/adaptive-apps/guides/get-started-with-adaptive-apps)
- [Using container size and style queries — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_size_and_style_queries)
- [`container-type` — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/container-type)
- [`@container` — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@container)
- [Container queries — web.dev](https://web.dev/learn/css/container-queries)
- [Container queries in 2026: powerful, but not a silver bullet — LogRocket](https://blog.logrocket.com/container-queries-2026/)
- [CSS container queries and subgrid — SitePoint](https://www.sitepoint.com/css-container-queries-subgrid-component-layouts-2026/)
- [Subgrid — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Subgrid)
- [The Sidebar — Every Layout](https://every-layout.dev/layouts/sidebar/)
- [A revisit of the Every Layout sidebar with `:has()` — Piccalilli](https://piccalil.li/blog/a-revisit-of-the-every-layout-sidebar-with-has-and-selector-performance/)
- [CSS `dvh`, `svh` and `lvh`: mobile viewport units explained — CSS Toolkit](https://csstoolkit.net/blog/css-dvh-svh-lvh-guide/)
- [When 100vh lies: fixing mobile viewport issues — OpenReplay](https://blog.openreplay.com/fix-100vh-mobile-viewport/)
- [WCAG 2.5.8 Target Size (Minimum) implementation guide — AllAccessible](https://www.allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide)
- [Mobile touch target size — AccessiTool](https://www.accessitool.com/blog/mobile-touch-target-size-complete-guide-fixes-accessibility-2026)
- [Open source visual regression testing tools — Percy](https://percy.io/blog/open-source-visual-regression-testing-tools)
- [Visual regression testing for design systems, 2026 guide](https://lastest.cloud/blog/visual-regression-testing-design-systems-2026)
- [`Frame.evaluate` / passing arguments — Playwright docs (via Context7, /microsoft/playwright v1.61.0)](https://github.com/microsoft/playwright/blob/v1.61.0/docs/src/evaluating.md)
- [react-resizable-panels — full code guide](https://viprasol.com/blog/react-resizable-panels/) (framework-bound, but its Panel/PanelGroup/ResizeHandle split and persisted sizes are the shape of a docking API if we ever want draggable panes)

### Sources — second pass (§8-14)

Cascade layers:

- [Cascade Layers Guide — CSS-Tricks](https://css-tricks.com/css-cascade-layers/)
- [Cascade layers — MDN](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Cascade_layers)
- [CSS `@layer`: the complete guide for 2026 — DevToolbox](https://devtoolbox.dedyn.io/blog/css-cascade-layers-complete-guide)
- [csswg-drafts #6323 — allow authors to place unlayered styles in the layer order](https://lists.w3.org/Archives/Public/public-css-archive/2024Jul/0102.html) (the ergonomics complaint behind the pitfall that bit us)

Style queries and containment:

- [How to use container queries now — web.dev](https://web.dev/blog/how-to-use-container-queries-now)
- [Style queries — CSS CodeLab](https://csscodelab.com/style-queries-container-style-queries/)
- [Responsive design: container queries, named containers, `@container-size` — Tailwind CSS docs (via Context7, /websites/tailwindcss)](https://tailwindcss.com/docs/responsive-design)

Input modality:

- [Touch devices should not be judged by their size — CSS-Tricks](https://css-tricks.com/touch-devices-not-judged-size/)
- [Interaction media features and their potential for incorrect assumptions — CSS-Tricks](https://css-tricks.com/interaction-media-features-and-their-potential-for-incorrect-assumptions/)
- [A guide to hover and pointer media queries — Smashing Magazine](https://www.smashingmagazine.com/2022/03/guide-hover-pointer-media-queries/)
- [Interaction — web.dev Learn Design](https://web.dev/learn/design/interaction)

Safe areas:

- [Understanding `env()` safe area insets in CSS — Mohammad Shehadeh](https://mohammadshehadeh.com/css/safe-area-insets)
- [Make your PWAs look handsome on iOS — DEV](https://dev.to/karmasakshi/make-your-pwas-look-handsome-on-ios-1o08)

Foldables and dual screen:

- [Building web layouts for dual-screen and foldable devices — Smashing Magazine](https://www.smashingmagazine.com/2022/03/building-web-layouts-dual-screen-foldable-devices/)
- [Origin trial for foldable APIs — Chrome for Developers](https://developer.chrome.com/blog/foldable-apis-ot)
- [CSS media query for viewport segments — Microsoft Learn](https://learn.microsoft.com/en-us/previous-versions/dual-screen/web/css-viewport-segments)

Testing the matrix:

- [Test projects: browsers and device configurations — Playwright docs (via Context7, /microsoft/playwright v1.61.0)](https://github.com/microsoft/playwright/blob/v1.61.0/docs/src/test-projects-js.md)
- [Emulation: viewport, `isMobile`, device descriptors — Playwright docs (via Context7)](https://github.com/microsoft/playwright/blob/v1.61.0/docs/src/emulation.md)
