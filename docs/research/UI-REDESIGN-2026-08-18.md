# Apex 26 UI redesign — evidence, system, and rollout

Status: implementation plan and acceptance contract. Step 2 (catalogues) is in:
Circuit Select stacked/short uses a compact preview band plus one list scroller;
Garage stacked uses a horizontal category strip with options as the only
dominant vertical scroller. Wide pair-on layouts keep their split. The visual identity stays:
near-black surfaces, F1 red as the action accent, Titillium Web for interface
copy, Rajdhani for timing, compact technical labels, and the live car/track as
the hero. The redesign changes hierarchy and responsive behaviour, not the
brand.

## Why this pass exists

The current interface is visually coherent and its shared `.screen`, `.sheet`,
`.pane`, and `.pane-pair` primitives are sound. The remaining problems are
concentrated where a large catalogue and its navigation compete for a short
viewport:

- Circuit Select can expose only 135 px of a 2,211 px track list on a short
  landscape screen.
- Garage can expose 116–174 px of a 1,400–2,000 px options catalogue while its
  category rail consumes another scroll region.
- Lighting can expose 84–208 px of more than 2,000 px of controls.
- Settings at 200% UI size can spend almost the whole body on a 2×2 category
  grid before any setting appears.
- Last Race is the only confirmed clipping failure in the 410-cell baseline;
  its table is wider than the phone panel.

Long content is not itself a defect. A career guide or result table may scroll.
The failure is requiring a player to manage two nested scroll regions, or using
the scarce height for navigation chrome while the selected content is nearly
invisible.

## External constraints

The redesign follows these stable platform rules:

1. Content reflows at a 320 CSS-pixel viewport and at 200% text/interface
   enlargement without two-dimensional document scrolling.
2. Interactive targets never paint below 24×24 CSS px; the house ladder remains
   44/40/30 px where the viewport allows it.
3. Tabs use one sequential tab stop, arrow navigation, Home/End, selected state,
   and an explicitly controlled panel.
4. Components respond to their allocated container, not assumptions about the
   device. Viewport queries remain only for real viewport facts such as safe
   areas, orientation, and browser chrome.
5. Visual order, DOM order, keyboard order, and gamepad order remain the same
   after reflow.

Primary references:

- [WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow)
  and [Resize Text](https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html)
- [WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [Apple game-control accessibility](https://developer.apple.com/design/human-interface-guidelines/game-controls)
- [WAI-ARIA Authoring Practices, Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [CSS container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)
  and [CSS zoom](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/zoom)
- Xbox Accessibility Guidelines 101, 107, 112, 113, and 114

### Scale and pixel decisions

The numbers below are implementation thresholds, not device-resolution
assumptions. CSS pixels are density-independent reference pixels; DPR changes
raster sharpness, not the CSS-space hit target or layout breakpoint.

- **24 CSS px is the non-negotiable target floor.** WCAG 2.2 AA allows smaller
  controls only through defined spacing/equivalent/inline exceptions. The
  project uses `--tap-min: 24px` only for dense secondary controls.
- **44 CSS px is the default game-control target.** Apple specifies 44×44 pt
  for frequent game controls and 28×28 pt for less-important menu controls.
  Apex keeps 44 for primary/touch-driving controls and 30–40 for secondary
  controls, which stays above both the WCAG floor and Apple's secondary floor.
- **48 CSS px is an ergonomic preference, not the compliance floor.** Web
  platform guidance commonly recommends 48px for touch. Use it for isolated
  primary actions when it does not starve the selected content; do not force it
  into dense toolbars where 44px plus clear spacing is more usable.
- **200% is a functional release gate.** WCAG Resize Text requires no loss of
  content or functionality through 200% enlargement. The app's UI SIZE control
  is not identical to browser zoom, but it must meet the same outcome.
- **320 CSS px is the reflow reference width.** WCAG equates this to a 1280px
  starting viewport at 400% browser zoom. Menus, prose and forms must avoid
  two-dimensional scrolling there; maps, the live game canvas and data tables
  may use the criterion's essential two-dimensional-layout exception, while
  still keeping each label/cell readable.
- **256 CSS px is the short-axis stress height.** The landscape matrix includes
  568×320 and internal-scale combinations below 256 effective pixels because
  sticky chrome can otherwise consume the entire work area.
- **Breakpoints use effective local size.** CSS `zoom` participates in layout,
  and `getBoundingClientRect()` includes its painted effect. `SheetShape` reads
  the component's local box and effective zoom; viewport media queries remain
  only for actual viewport facts. Inline-size container queries handle width,
  while the existing measured density flag handles height without imposing the
  block-size containment that would break content-sized sheets.
- **Fixed/sticky chrome must not obscure focus.** Reflow guidance explicitly
  calls out sticky content as a risk. Every pinned footer/header is tested with
  keyboard focus at the first and last item in its body scroller.

## The redesigned system

### Screen shell

Every task screen has four perceptual zones, even when its existing DOM uses
only three grid rows:

1. **Context** — title plus the one state needed to understand the screen
   (round, team, circuit, session, or profile).
2. **Navigation** — categories or filters. It may be a side rail when the sheet
   has room, otherwise a single horizontal rail or compact grid.
3. **Work area** — the only dominant scroll region. It owns the content and
   preserves the selected item's context.
4. **Actions** — pinned Back/Cancel and one primary forward action.

Headers and footers do not scroll. A secondary pane may scroll independently
only in a genuine desktop list-detail composition where both panes remain at
least three useful rows tall.

### Hierarchy

- One red filled primary action per screen.
- Selected navigation uses the red edge/tint, but keyboard focus remains white.
- Neutral actions share one surface treatment; destructive actions are separated
  spatially and use muted red text rather than competing filled buttons.
- Section labels describe groups, not individual rows.
- Dense technical metadata can truncate only when its full value is available
  through an accessible name/title; names, prices, lap counts, and selected
  values wrap instead.

### Responsive states

Components use three states based on the *sheet's* available inline/block size:

- **Rail** — a side navigation rail and work pane, when both remain useful.
- **Strip** — one horizontal navigation strip above the work pane on narrow or
  short containers.
- **Stack** — document flow with one body scroller for prose and setup flows.

UI size is part of the layout matrix, not just a visual transform. Required
verification scales are 40, 90, 100, 115, 150, and 200 percent. The 40% and
200% endpoints are stress tests; 90/115/150 catch threshold crossings.

### Navigation and focus

- Fresh entry focuses the primary/default task, not a persistent toggle.
- Returning to a screen restores the selected category and its visible context.
- Tab/category rails scroll the selected item into view after keyboard, gamepad,
  or programmatic selection.
- Opening a dialog moves focus inside; closing restores it to the opener.
- No action button is exposed as a toggle unless it actually owns persistent
  pressed state.

## Screen-by-screen redesign

### Title

Keep the current Career hero, 2×2 quick-race group, and neutral utility group.
Preserve Career as the initial digital-navigation target. At short landscape
sizes, keep brand and actions side-by-side; at portrait sizes, keep the hero
first and utilities last. The audio master remains part of title metadata.

### Circuit Select

The circuit map is context, not a second document. Wide sheets retain the
preview/list split. Narrow and high-scale sheets use a compact preview band,
then one searchable/filterable track list. The filter and search controls stay
sticky within that list. Start remains pinned and always names the next step.

### Garage

Treat category buttons as a real tab system. Wide sheets retain the side rail
and live car preview. Narrow/portrait sheets use a single horizontal category
strip; the selected category is scrolled into view. Options get the remaining
height and are the only dominant scroller. Team, driver, parts, and livery use
the same selected/locked/price grammar. Career garages must lock identity to the
contracted team and seat.

### Race settings and qualifying

Keep all event-defining choices on one screen. Use balanced chip grids, never a
ragged wrapped row. On short landscape, spend width on columns; on portrait,
stack sections in one body scroller. The primary action reflects whether the
next step is qualifying, grid, or race.

### Career and Season

Use the list-detail primitive for desktop and stacked cards for portrait. The
current round, objective, funds, and next action form the context header.
Long history/guide content gets an internal contents rail only on wide sheets;
otherwise it is normal document flow in one scroller. Completed seasons replace
race actions with final standings/new-season actions.

### Settings

Keep the three shipped categories: Controls, Display, More. At sufficient
local width they are one row; at narrow portrait they are 2×2; at wide sheets
they become a side rail. A fourth Performance tab is a later journey — do not
paint a 4-column grid until that tab exists. High UI sizes must not spend more
than one primary control row of vertical space on navigation. Each panel is a
proper tabpanel and contains only one related task group at a time.

### Lighting and camera tuners

The live scene remains the preview. Category/mode navigation is a horizontal
strip on narrow/short sheets and a rail only when it leaves at least three
visible slider rows. Explanations are progressive disclosure and default off in
compact density. Slider labels and values remain visible together; irrelevant
knobs are absent rather than disabled noise. Reset actions state their scope.

### Audio and Spotify

Keep one Now Playing card, one transport group, and collapsible source sections.
Master-off remains off across boot and never initializes audio from unrelated
navigation. Source removal, decode failure, and natural advance update the open
panel immediately and leave source/playback state coherent.

### Data Hub

Portrait keeps the complete 2×3 destination grid; landscape uses a horizontal
tab strip. Each tab owns one vertical content scroller. Wide tables become
responsive row cards or hide secondary columns before they can overflow; driver,
position, time/status, and points remain visible. Loading, empty, stale, and
error states retain the card's geometry.

### Race-a-friend

Use a short step model: Choose method → Share/scan → Connected → Ready. Hide
transport diagnostics under details. Codes and QR remain dominant; peer state
and the one next action stay pinned. Cancellation must invalidate all pending
camera, rendezvous, transport, and wake-lock work.

### Results, standings, help, and history

Results and standings use the shared classification row. Keep headers sticky and
the player's row distinguishable without colour alone. Help/history can be long,
but use a contents rail on wide sheets and semantic headings so keyboard and
screen-reader users can jump between sections.

### Race HUD, pause, camera picker, and photo mode

HUD scaling remains separate from menu scaling. Core race information keeps its
screen-edge anchors and clears touch controls/notches at every orientation.
Pause is the sole owner of paused navigation; auxiliary pickers close with it.
Photo mode exposes one explicit way to restore hidden controls. Reduced-motion
mode removes nonessential pulses and animated camera transitions.

## Verification matrix

The release gate is screen × viewport × UI scale × pointer/input:

- 320×568 and 390×844 portrait touch
- 568×320, 667×375, and 852×393 landscape touch
- 860×560 constrained desktop
- 1280×800 and 1440×900 desktop
- 1080×1920 portrait desktop/tablet
- UI scale 40/90/100/115/150/200; HUD scale 40/100/150/200
- coarse pointer, mouse/keyboard, and digital/gamepad navigation

For every cell record: clipped descendants, document overflow, truncated
information, target dimensions, dominant/deep scroll regions, focus order,
selected-state semantics, console errors, and screenshot. A screen passes only
when its primary action and the current context are visible or reachable through
one obvious scroll region.

## Rollout

1. Foundation: shared shell hierarchy, settings category fit, tabs/focus
   contracts, and the Last Race clipping defect. **Done.**
2. Catalogues: Circuit Select search/filter and Garage category/options layout.
   **Done (2026-08-18).** Stacked Circuit Select: compact preview band, one
   `#sel-tracks` scroller, sticky filter/search, pinned Start. Stacked Garage:
   horizontal `#cs-tabs` strip (all stacked sheets, not only portrait),
   `#cs-options` is the only dominant vertical scroller. Pair-on rails kept.
3. Tuners: Lighting/camera rail/strip behaviour and progressive help.
   **Done (2026-08-18).** Compact tuners: one `#lt-rows`/`#ct-rows` scroller
   (`overflow: hidden` on the panel). Rail CSS is keyed on `data-rail` from
   local width **and** a three-slider-row budget, not viewport `min-width:
   720px`. Compact density forces explanations off (toggle hidden). Selected
   category/mode chips `scrollIntoView`. Camera RESET titles name their scope.
   COPY VALUES uses local `--svhz`, not `40svh`.
4. Journeys: Career, Season, Race-a-friend, Data Hub, results/help/history.
   **In progress (2026-08-18).** Data Hub short-height chrome keys on
   `body[data-density]` / `body[data-width]` (zoom-aware), not
   `orientation + max-height`. Portrait 2×3 destinations keep orientation as a
   viewport fact and use `data-width=narrow`. VS Friend sheet is
   `#vsfriend-inner` with `--fit-at`; host/join columns are an `@container sheet`
   split. Settings declares `--fit-at` and compact+narrow category tabs are one
   pan-x row. How to Play contents is a left rail on `data-shape=wide` sheets and
   a horizontal strip when compact.
5. Race layer: HUD, pause, camera picker, photo mode, orientation and zoom.
6. Final matrix: all screens, scales, inputs, screenshots, performance and
   accessibility checks; then cache/version bump as the final production edit.

The rollout deliberately preserves the current primitives and reduces one-off
screen rules. New variants belong in custom properties or ID-scoped context,
not new class families.
