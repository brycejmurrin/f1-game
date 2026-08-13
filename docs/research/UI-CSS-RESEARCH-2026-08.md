# UI / CSS research — 2026-08-13

> **STATUS: all six recommendations in §5 are implemented on this branch.** What
> follows is the research as written; this box records where acting on it
> corrected it. Read both — the corrections are the more useful half.
>
> | § | claim as written | what implementing it showed |
> |---|---|---|
> | 1 | four sheets read no spacing token | **five** — `responsive.css` too, found by writing the guard rather than by grepping. It is a different case and stays listed rather than migrated: a media-query sheet legitimately holds viewport-absolute values |
> | 1 | 126 sub-floor font sizes | correct; all 126 migrated, ratchet now 0. Raw spacing 529 → 479 |
> | 2 | the map bug | correct and fixed — but the deploy branch had meanwhile rewritten the same function. Its budget logic supersedes the caps described below; the first-paint pin guard was rebased onto it |
> | 4 | "`emulate` reloads the page and resets app state" | **wrong as stated.** It sometimes does and sometimes does not. Corrected in the playbook: assert which screen is open before measuring |
> | 4 | "use dpr 1 for layout review" | **too narrow.** dpr 1 failed too — the same screen captured with the whole brand column missing, animations finished, while the DOM had it at x=86 w=348 opacity 1. The rule is not a dpr setting: do not judge layout from an MCP screenshot on this shell at all. Measure with `evaluate_script`; take pictures with Playwright (`layout-audit --shots`) |
> | — | "18 pre-existing test failures" | **wrong.** `node_modules` had never been installed in this container. With dependencies present the suite is **426 pass / 0 fail** |
> | — | the audit matrix | 14 flagged cells → **7**, and six of the seven removed were *probe* defects, not layout ones (see the `content-visibility` finding below) |
>
> Two defects found only by verifying: the title screen's brand column had no
> shrink floor (`grid-template-columns: auto auto`), and `tools/layout-audit.mjs`
> was counting collapsed `<details>` content as unreachable controls, because
> Chromium hides it with `content-visibility: hidden` on the `::details-content`
> *pseudo-element* — which no ancestor walk can see, while
> `getBoundingClientRect` still returns real boxes for every descendant.
> `checkVisibility()` is the question that was actually meant.
>
> Still open and NOT addressed here: `garagelivery` reports **68 tap targets
> under WCAG 2.5.8's 24px floor** in five viewports. Pre-existing, unchanged by
> this branch, and the largest real defect the matrix knows about.

Why the menus still feel wrong after a year of layout fixes, what modern CSS
actually offers now, and which tools are worth adding. Measured against the
working tree at `claude/ui-redesign-css-research-lh445o`, live in Chromium via
the Chrome DevTools MCP at 852x393 (the landscape phone — the shape the game is
played in) and 1440x900.

**The headline: the problem is not that this project lacks technique.** The
mechanism docs (`docs/LAYOUT-AUDIT.md`), the intent docs
(`docs/research/UI-DESIGN-PRINCIPLES.md`) and the 15 rules in
`.claude/skills/restructure-screens-css` are all correct and all ahead of what
most codebases have. The problem is that **the design system is declared but not
adopted**, and one first-paint ordering bug is disfiguring the most-used screen.

---

## 1. The token ladder exists and is bypassed

`css/tokens.css` defines a phone-first type scale whose floor is deliberate:
`--fs-micro: 14px`, chosen (per `UI-DESIGN-PRINCIPLES.md` §1) so the smallest
rung is legible on a landscape phone at arm's length. That is the right floor,
set for the right reason.

**126 font-size declarations in `css/` sit below it.**

| measurement | value |
|---|---|
| `font-size` declarations total | 372 |
| …via `var(--fs-*)` | 158 (42%) |
| …as a raw literal | 198 (53%) |
| …**below the 14px floor** | **126** |
| distinct classes across `css/` | 543 |
| custom properties declared | 69 |

Raw sub-floor sizes by file: `menus.css` 40, `tuner.css` 28, `overlays.css` 16,
`hud.css` 14, `data.css` 10, `track-detail.css` 8, `responsive.css` 4,
`carsetup.css` 3, `career.css` 2.

Live confirmation at 852x393, measured on the rendered DOM:

| screen | text elements below 14px |
|---|---|
| title | 7 (`F1 DATA HUB`, `GARAGE`, `SETTINGS`, `HOW TO PLAY` all at **12px**) |
| circuit picker | **78** (37 at 12px, 41 at 13px) |
| circuit picker @1440x900 | **91** |

The four secondary buttons on the title screen render at 12px while
`RACE` / `TIME TRIAL` render at 17px — visible in
`artifacts/ui-research/04-title-dpr1.png`. This *is* the original complaint
("on iOS my HUD and buttons are smaller than they were"), still shipping.

**The spacing tokens are worse.** `--pad` / `--gap` do respond to density —
measured live on the landscape phone, `--pad` resolves to 13px and `--gap` to
8px (down from 22/12). But whole files never read them:

| file | raw px padding/gap/margin | via `var(--pad/--gap)` |
|---|---|---|
| `data.css` | 156 | **0** |
| `tuner.css` | 82 | 7 |
| `menus.css` | 62 | 25 |
| `carsetup.css` | 53 | 27 |
| `overlays.css` | 51 | **0** |
| `career.css` | 40 | 22 |
| `hud.css` | 29 | **0** |
| `components.css` | 27 | 25 |
| `track-detail.css` | 17 | **0** |

Five files — including the two densest screens in the app — do not resize with
the density ladder at all. **This is the literal mechanism behind "things don't
resize."** Nothing is broken; those files simply never opted in.

### The missing ratchet

`tests/unit/css-tokens.test.mjs` asserts *every token has a consumer* — it
catches dead tokens. Nothing asserts the converse: that a consumer uses a token.
That asymmetry is why 126 sub-floor literals accumulated under a guard suite
that otherwise ratchets everything.

This is the single highest-value thing to add, and it fits the repo's existing
shape exactly (ratchet the count, lower the ceiling on each pass):

```js
// tests/unit/css-token-adoption.test.mjs
// Ratchet: no NEW raw font-size below --fs-micro, no NEW raw padding/gap.
const CEILING = { subFloorFontSize: 126, rawSpacing: 517 };
```

Freeze at today's number, then drive it down file by file. `data.css`,
`overlays.css`, `hud.css` and `track-detail.css` are the whole spacing problem
(253 of 517 raw values, zero token reads).

---

## 2. A real bug: the circuit map overflows its card on first paint

Found live, root-caused, reproduced from a cold load. **This is on the screen
every player reaches first after RACE.**

**Reproduction** — load, emulate 852x393, click RACE, touch nothing:

| | |
|---|---|
| map rendered height | **344px** (Monaco) / **385px** (Bahrain) |
| card (`#sel-track-preview`) height | **260px** |
| overflows its card by | **90px** |
| runs past the viewport bottom by | **23px** |
| track facts visible | **0 of 4** |

The whole caption block — circuit name, GP, length, turn count, and all four
facts (`↻ Clockwise`, `▲ 5 m elevation`, `5 DRS zones`, `T12 slowest`) — is
pushed out of the card and never seen. Screenshot:
`artifacts/ui-research/06-select-map-overflow-firstpaint.png`.

**Root cause.** `updateTrackPreview()` (`js/game/menus.js:249`) caps the map at
half the card height, correctly, at `js/game/menus.js:277-278`. It is guarded by
`if (cardH > 0)`. Instrumenting `TrackMaps.fitCanvas` and then opening the
screen through the app's own door captured the single call:

```json
{ "maxW": 260, "maxH": 344, "cardClientH": 0, "cardOffsetParent": false,
  "pair": null, "shape": null }
```

At call time the card is still hidden (`clientHeight: 0`, no `offsetParent`) and
`js/game/sheetshape.js` has not yet written `data-pair` / `data-shape` — both
`null`. So the cap is skipped, and `fitCanvas` pins the *uncapped* size inline:

```
aspect-ratio: 0.756608 / 1; width: 260px; height: 344px;
max-width: 260px; max-height: 344px;
```

Those inline pins include `max-height`, which **permanently defeats**
`css/menus.css:468`'s `max-height: 50%` — an inline style beats any stylesheet
rule. Nothing re-runs `updateTrackPreview()` once the card has a height, so it
stays wrong.

**It self-heals the moment you click any circuit row** — the same instrument
then reports `maxH: 124`, producing 94x124 and fitting the card with room to
spare (`overflowsCardBy: -124`). A `resize` event does *not* fix it.

Three things make this worth fixing beyond the bug itself:

1. **It is invisible to the audit tool.** `tools/layout-audit.mjs` reaches
   screens and measures them — but this defect is repaired by the first
   interaction, and any probe that clicks before measuring erases it.
2. **It is aspect-dependent.** A wide circuit stays inside the card; a tall one
   overflows. Exactly the "cell of a matrix" phenomenon `LAYOUT-AUDIT.md` opens
   with.
3. **The pattern is general.** `fitCanvas`'s comment says the inline
   `max-*` pins exist to "defeat stylesheet max-height/max-width caps." That is
   a deliberate inversion of the cascade, and it is load-bearing in seven other
   canvases (`#minimap`, `#sel-preview-elev`, `#track-detail-canvas`, …).

**Fix shape** (not applied — this is a research pass): re-run
`updateTrackPreview()` once the card is measurable, rather than trusting the
open sequence. `js/game/sheetshape.js` already owns a `ResizeObserver` on the
sheet and already writes `data-pair`/`data-shape`; having the select screen
recompute its preview when those attributes first land is the smallest change
that closes the class, not just the instance.

---

## 3. Modern CSS: what is actually available now

Support verified against MDN's Baseline banners on 2026-08-13, not from memory.
The binding constraint is iOS Safari — `restructure-screens-css` rule 6 already
states the house rule ("a one-year-old iPhone is this project's primary
target").

**Safe to adopt now**

| feature | Baseline | why it earns its place here |
|---|---|---|
| `@container` (size) | Widely available, Feb 2023 | already 35 uses — keep migrating `responsive.css` into it |
| `text-wrap: balance / pretty` | Newly available, Mar 2024 | menu headings and the `mb-sub` strapline wrap raggedly at 852px; one property, no layout risk |
| `@starting-style` | Newly available, Aug 2024 | entrance transitions for `<dialog>` without JS classes |
| `@scope` | Newly available, **Dec 2025** | the real prize — see below |

**`@scope` is the one structural addition worth considering.** This codebase
carries **254 distinct ID selectors** in CSS, many of them purely to win
specificity fights that `LAYOUT-AUDIT.md` documents at length (the two-ID
`#sel-track-preview #sel-preview-map` workaround; the `--sel-map-w` custom
property invented *because* container queries add no specificity). `@scope`
gives proximity-based matching without specificity inflation, which dissolves
that class of workaround. It is nine months into Baseline, so it is a candidate
for *new* screens, not a migration of the existing 254.

**Not yet — do not adopt**

| feature | status | note |
|---|---|---|
| `animation-timeline` (scroll-driven) | Limited availability | **already tried and rejected here** — `js/game/scrollfade.js`'s header documents that a scroll timeline resolves once at animation creation, and these regions are created inside `[hidden]` overlays. That reasoning is still correct. |
| `interpolate-size` / `calc-size()` | Limited availability | animating to `auto` height still needs JS |
| `corner-shape` | Limited availability | cosmetic |
| `reading-flow` / `reading-order` | Limited availability | would be genuinely useful for the garage's reordered rail; not yet |
| `text-box-trim` | Limited availability | would help the vertical-centring fudges; not yet |
| `field-sizing: content` | Newly available, **Jun 2026** | two months old — too new for the primary target |

**One to watch: `@container scroll-state()`.** This is the correct long-term
home for `ScrollFade`. Unlike a scroll timeline it is evaluated continuously
rather than resolved once, so the exact failure that killed the CSS-only
attempt does not apply. WebKit support only landed in Safari 26.4, so it is a
2027 item — but when it lands, `js/game/scrollfade.js` becomes deletable, and
that is worth a note in that file's header so the next person does not
re-litigate the rejected approach.

**Explicitly still correct to reject:** Tailwind, Open Props, CUBE, ITCSS-as-
folders. Nothing found in this pass changes the reasoning already recorded in
`restructure-screens-css`.

---

## 4. Tooling: one MCP finding that matters more than any new server

### `deviceScaleFactor: 3` produces phantom UI in screenshots

`docs/research/CHROME-DEVTOOLS-MCP.md` recommends
`emulate` with `852x393x3`. **At dpr 3, captures contain duplicated, offset
copies of real elements.** Measured this session: the title screen rendered
ghost copies of `TIME TRIAL` and `RACE A FRIEND` about 131px below their true
positions, surviving a 1.5s settle, `display:none` on the WebGL canvas, and a
forced repaint.

The DOM was clean throughout — 20 painted elements, no duplicates, no overlaps.
Re-capturing the identical page at `852x393x1` produced a correct image
(`04-title-dpr1.png` vs `02-title-settled.png`).

This is a capture artifact, not a product bug, and it is the exact trap
`LAYOUT-AUDIT.md` §"A finding is a claim about the probe" warns about — it cost
four probes here before the dpr experiment settled it. **Recommendation: use
dpr 1 for any layout or visual review; reserve dpr 3 for checking bitmap
crispness only.** That line belongs in the MCP playbook.

Second, smaller trap: calling `emulate` with a different viewport **reloads the
page and resets app state**. Re-navigate through the app's own controls after
every `emulate` call, or measurements silently describe the title screen.

### Do you need more MCPs? No.

Chrome DevTools MCP (connected) plus Playwright plus `tools/layout-audit.mjs`
already cover inspection, and the survey skills cover the matrix. The
alternatives found in this pass — Figma-bridge servers, generic "QA audit"
servers — all assume a design-file source of truth or a component framework,
and this project has neither. Adding one would be adopting a workflow, not a
tool.

### The one capability actually missing: cheap structural regression detection

`docs/TESTING.md` notes golden baselines exist for menus only, and
`npm run test:visual` is skip-gated because circuit baselines were never
generated — reasonably, since SwiftShader captures are minutes each.

**Playwright ARIA snapshots close that gap without pixels.** `toMatchAriaSnapshot`
stores a diffable YAML tree of roles and accessible names in `.aria.yml` files,
updated with `--update-snapshots`:

```js
await expect(page.locator("#overlay")).toMatchAriaSnapshot();
```

For a restructure whose whole risk is *"did a screen lose a control, or gain a
duplicate, or lose its accessible name"*, this is the right assertion — it is
milliseconds, deterministic, readable in a diff, and needs no renderer. The
title screen's snapshot is 13 lines. It would not have caught the map overflow
(that is geometry, which `layout-audit.mjs` owns) but it directly covers the
failure mode a 543-class consolidation actually has.

---

## 5. What to do, in order

1. **Fix the first-paint map overflow** (§2) — a real defect on the most-used
   screen, with a known root cause and a fix that closes the class.
2. **Add the token-adoption ratchet** (§1) — freeze at 126 / 517, then drive it
   down. Without this, any consolidation regresses silently.
3. **Migrate the zero-token files** — `data.css`, `overlays.css`, `hud.css`,
   `track-detail.css`, plus `responsive.css`, which the guard found and which is
   a different case (a media-query sheet holds viewport-absolute values by
   design, so it stays listed rather than migrated). This is where "things
   don't resize" lives, and it is mechanical work with a number attached.
4. **Amend the MCP playbook** — dpr 1 for layout review; and *check which screen
   is open*, because `emulate` resets page state only sometimes.
5. **Add ARIA snapshots** for the 22 top-level screens before restructuring.
6. **Then** consider `@scope` for new screens, and `text-wrap: pretty` on
   headings — both cheap, both safe.

Steps 1–3 are the ones that change what a player sees. Nothing in this list
requires a new dependency, a build step, or a methodology.

---

## Sources

- MDN Baseline banners, fetched 2026-08-13: `@container`, `@scope`,
  `animation-timeline`, `field-sizing`, `anchor-name`, `interpolate-size`,
  `text-wrap`, `corner-shape`, `reading-flow`, `@starting-style`,
  `text-box-trim`
- MDN, [Using container scroll-state queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Conditional_rules/Container_scroll-state_queries)
- Playwright docs, ARIA snapshots (`toMatchAriaSnapshot`, `page.ariaSnapshot()`)
- [What's new in DevTools (Chrome 146)](https://developer.chrome.com/blog/new-in-devtools-146) — DevTools MCP 0.19.0: Lighthouse via MCP, `--slim` mode, a11y debugging skills
- This repo: `docs/LAYOUT-AUDIT.md`, `docs/research/UI-DESIGN-PRINCIPLES.md`,
  `.claude/skills/restructure-screens-css`, `js/game/scrollfade.js` header
- Live measurements and screenshots: `artifacts/ui-research/`
