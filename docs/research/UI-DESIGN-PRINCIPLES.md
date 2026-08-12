# Design principles for the component restructure

Why the UI is sized the way it is, and the two rules that should govern B1
(the type scale) and B2 (collapsing duplicated primitives). Sourced and dated
August 2026. Companion to `docs/archive/research/UI-SCALE-AND-ZOOM.md`, which covers the mechanism;
this one covers the intent.

---

## 1. "Secretly console first" — and why this codebase got it backwards

The load-bearing rule from David Sinclair's
[multi-platform UI piece](https://www.gamedeveloper.com/design/secretly-console-first-a-better-approach-to-multi-platform-game-ui-design)
(Game Developer, 2018):

> If something is legible at the 10ft view, then it's legible up close — every
> time … This isn't true the other way around.

and the first item of his checklist:

> Information density, general UI element scale, and text legibility targets the
> **greatest reasonable viewing distance**.

**This game's "10ft view" is not a TV — it is a phone.** A phone mounted on a
desk or held at arm's length, glanced at mid-corner, on a 393px-tall landscape
window with the driver's attention on the road. That is the hardest legibility
case this UI has, and everything else — an iPad on a lap, a 27" monitor two feet
away — is easier.

The codebase grew the other way round. It was developed on a desktop, where
`--ui-scale` is 1 and every hard-coded px looks fine, and the phone was reached
afterwards by putting `zoom: 1.15` on four subtrees. The direct consequence is
the report that started this whole restructure: *"on iOS my HUD and buttons are
smaller than they were."* Sinclair's rule predicts exactly that failure — a
design solved at the near distance does not survive the far one.

**What this means for B1.** The type scale's rungs should be chosen so that the
smallest rung is legible **on a landscape phone at arm's length**, and the
desktop is then allowed to be generous. Concretely, when the census says a value
is used at both 11px (a phone label) and 11px (a desktop caption), those are not
the same rung — the phone one is at the floor and the desktop one has room. Do
not average them into a single middle value that is slightly wrong for both.

The corollary the article is blunt about is worth keeping in view: the *layout*
should be one design with platform-specific bits swapped, not two designs.
`@container sheet` already gives us that — it is the right mechanism and should
absorb more of what `responsive.css` still does by media query.

**Where the analogy stops.** Sinclair's second and third ingredients are about
controller-vs-mouse interaction, and this game's split is touch-vs-keyboard
instead. But the shape holds: `Input.touchControlsNeeded()` already switches
whole control affordances (the dock, the gas pedal, tilt calibration) rather
than just relabelling them, which is the Overwatch pattern he recommends over
the cheaper Dishonored-style prompt swap. That part of the codebase is already
doing the right thing.

---

## 2. "Design systems should do less" — the governor on B2

B2 wants to collapse list rows, chips and option buttons onto single primitives.
The failure mode of that work is over-collapsing, and
[Josh Cusick](https://joshcusick.substack.com/p/design-systems-should-do-less)
gives a usable test. Both must be true before something becomes a shared
primitive:

> 1. Is this component used in three or more places across products?
> 2. Is this component generic enough to be useful in future cases?

Applied here, "products" means screens — menus, career, garage, data hub,
tuner. A row style that appears in the circuit list and the standings table and
the driver list passes. A row style that appears twice does not, and should stay
local.

The second half is the more useful warning:

> a design system shouldn't cover 100% of your UI screens. A reasonable goal is
> 80/20, where the design system's components get you 80% of the way, and the
> remaining 20% comes from localized components.

And on API shape:

> Favor using children for customization over top-level props to avoid an overly
> complex API surface.

In CSS terms that argues for **composition over modifier explosion**: a `.row`
that carries structure plus slots (`.row-lead`, `.row-body`, `.row-meta`) beats
a `.row` with `.row--tall .row--bordered .row--accent .row--compact` stacked on
it. The moment a primitive needs a fifth modifier to express one screen's
variant, that screen wanted a local class instead.

**This repo already has the enforcement half.** `docs/COMPONENTS.md` plus
`tests/unit/component-inventory.test.mjs` assert which class families exist and which
are defined in more than one file. That is the governance layer Cusick says most
teams lack — the gap here is not process, it is that nobody has done the
collapsing yet.

---

## 3. What follows for the plan

1. **B1 sizes for the phone first.** Pick rungs from the phone's legibility
   floor upward, not from the desktop's comfortable middle. A rung that forces
   the smallest label *up* is a feature, not a regression — that was the
   original complaint.
2. **B2 collapses only what passes the two-question test**, and prefers slots to
   modifiers. Expect to leave ~20 % local and to be right about it.
3. **Neither stage should add a component.** Both are subtractive. If either
   ends with more class families than it started with, it went wrong.
4. **`@container sheet` is the platform switch**, not media queries. Anything in
   `responsive.css` that reads "on a phone, move this control" belongs in a
   container query on the sheet — the file's own header already says so, and B2
   is the moment to act on it.

---

## Sources

- David Sinclair, [Secretly console first](https://www.gamedeveloper.com/design/secretly-console-first-a-better-approach-to-multi-platform-game-ui-design) — Game Developer, Oct 2018
- Josh Cusick, [Design systems should do less](https://joshcusick.substack.com/p/design-systems-should-do-less) — Sep 2024
