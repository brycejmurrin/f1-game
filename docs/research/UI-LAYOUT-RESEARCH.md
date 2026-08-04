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

1. **`data-shape` on the sheet, written by one ResizeObserver** — would have
   prevented the rotated-monitor bug outright, and kills the container-query
   specificity trap. *(cheap, high value)*
2. **One `.pane-pair` primitive for select + garage + career** — would have made
   the garage fix and the select fix the same fix. *(medium, highest value)*
3. ~~**Recalibrate the tap-floor finding to WCAG 24px red / house-token amber**~~
   — **done**, see §5.
4. **`svh` as the house cap unit.** *(trivial, prevents a class of iOS bug we
   have not hit yet)*
5. **Switcher-style intrinsic wrap for the pane pair**, replacing hand-picked
   thresholds. *(medium; prototype on the garage and measure)*
6. **Six blessed pixel baselines** alongside the geometry audit. *(cheap)*

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
