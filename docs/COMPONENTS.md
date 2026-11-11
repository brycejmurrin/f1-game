# UI reference — components, ownership, and the layout axes

Two halves. **The component inventory** (below) is what exists in `css/`, who
owns it, and what is shared. **Layout axes** (further down, absorbed from the
old `LAYOUT-AUDIT.md`) is the screen x viewport grid: which mechanism owns which
layout decision, what the probe measures, and how to read the results. Why the
UI is sized the way it is stays in
[`research/UI-DESIGN-PRINCIPLES.md`](research/UI-DESIGN-PRINCIPLES.md) —
`tests/unit/css-token-adoption.test.mjs` cites it by path.

## The component inventory — what exists, who owns it, what is shared

Until this document there was no list of the class families in `css/`. That
absence has a cost, and it has already been paid: `.res-*` is defined in
`overlays.css` *and* `career.css`, which is something I found by grepping in the
middle of fixing an unrelated cascade-layer bug rather than by looking it up.
Cross-file coupling you cannot see is cross-file coupling you break by accident.

Measured from comment-stripped selectors in `css/` and cross-checked against
`index.html` and `js/`. `tests/unit/component-inventory.test.mjs` asserts the
family table (every family, its owner, every other file that defines it), the
"Defined in more than one file" list (every shared class, with its exact file
set) and the dead-class list, so none of them can drift without a red test. The
total class count is the `cssClasses` ratchet in `tests/data/ratchets.json`
(`node tools/check/tree-counts.mjs --offenders`), not a number here.

---

## Stylesheet source families

Three logical stylesheets are split into contiguous physical files. Their order
and loading mode are asserted by `tests/unit/css-layers.test.mjs`; the source
map is `CSS_SOURCES` in `tools/lib/css-source.mjs`. Historical reuse notes below
use `components`, `menus`, and `overlays` for these logical families. The
ownership table lists the physical files that contain the rules now.

| logical family | physical files, in cascade order |
|---|---|
| components | `components.css` → `dialogs.css` → `settings.css` → `settings-controls.css` → `dialog-platform.css` |
| menus | `title.css` → `menus.css` → `select.css` → `race-setup.css` |
| overlays | `touch-controls.css` → `overlays.css` → `loading.css` → `a11y-loading.css` |

## Shared layout primitives

Everything else is built on these. The base rules of `.screen`, `.sheet`,
`.pane` and `.balanced-row` live in `css/components.css`; `.pane-pair` lives in
`css/overlays.css`.

| primitive | what it is |
|---|---|
| `.screen` | a full-viewport overlay, inset by the OS safe area, that centres its child |
| `.sheet` | a card with a fixed head, ONE scrolling body and a pinned foot. Its default column can shrink; long headings and footer labels wrap within it. Screen-specific columns retain their own templates; also the `sheet` **query container** every layout decision inside it keys on. Dense sheets may declare `--fit-at` (minimum functional local height); `SheetShape` then caps only that panel's effective zoom when the safe viewport cannot supply it. Each sheet sets its own phone-landscape density floor, `--compact-at`, next to its `--sheet-w`; the `@property` initial value in `css/tokens.css` is the generic floor (380px) |
| `.pane` | a shrinkable scroll region with contained vertical overscroll and focus scroll padding — an edge fade on whichever side has more |
| `.pane-pair` | the shared **list-detail** layout (`.pair-side` + `.pair-main`), used by `#season-setup`, `#carsetup` and `#career` (`#select` left it in the 2026-09 picker redesign: a flag strip over a hero is one column). Default foot sits under the side column; `.pair-foot-full` spans BACK / YOUR CAR / NEXT (and season APPLY) across both. Slots are named by POSITION, not role — see the note in `css/overlays.css` |
| `.balanced-row` | a content-driven control cluster: items wrap from their preferred local width, every line shares its space evenly, and a lone final item fills the line without child-count-specific CSS |

## Selection grammar — how a control says "this one"

Three grammars used to coexist, sometimes on one screen (survey 2026-09-05): a
ringed chip (STEERING, RACE SETTINGS, the garage, the data hub); a `KEY: VALUE`
button that cycled on tap with the value word painted gold / red / green / cyan
(the whole CONTROLS page, the HUD fold, Spotify REPEAT); and an ON | OFF pair
with no ring where only the chosen word was coloured (MUSIC, SOUND). The ringed
chip itself lit two ways — a red side bar plus halo (`--plate-on-glow`) in nine
files, switched off again inside Settings. Now there are two controls, chosen
by what the screen is FOR, and both are checkable:

| what | rule | where it is held |
|---|---|---|
| **a preference on a settings sheet, or a property of the race about to start** (Settings pages, RACE SETTINGS, the Spotify panel, the injected RENDERER / GRAPHICS / METRICS rows) | the **setting row**: `LABEL  ‹ VALUE ›` — `.set-row` holding a `.tune-label`, then a `div` with `button[data-step=-1]`, a native `<select>`, `button[data-step=1]`. One line at every UI SIZE; the ‹ select › cluster drops to its own line, right-aligned, only when the label cannot share it. Tap the value for the platform picker (every option, a real combo box for a screen reader); the chevrons step for a finger or a mouse and are pointer-only (out of the focus order, `aria-hidden`) — on a keyboard or a pad the select itself answers Left/Right and Up/Down move to the next row; a disabled option (CUSTOM, SPOTIFY unconnected) is shown but skipped. Booleans are the same row, ‹ ON \| OFF › | `js/ui/setting-row.js` (`wire` / `paint` / `disable` / `optionDisabled` / `build`); the rows are static DOM in `index.html`, the options come from the owning module's own value list; CSS in `css/settings-controls.css` |
| **a pick that is the screen's content** (garage tabs and parts, team and track lists, data-hub pills, steering PRESETS, the circuit filter) and **multi-select toggles** (engine layers) | chips — `.opt-btn` / `.sel-chip` / `.cs-tab` / `.dh-*` etc., one `.active` (or several for toggles), wrapping through `.balanced-row` | their owning files |
| the chosen chip look | `background: var(--plate-on); border-color: var(--red)` and nothing else — no glow, no side bar, no coloured word inside the control | `css/tokens.css` "THE ONE SELECTED LOOK"; every `.active` chip / tab / pill rule uses exactly those two declarations |
| a full-card tile | the STRONG tier: `--plate-on-strong` + `--lift-sel` (team tile, career flavour / seat / slot) | `css/tokens.css` |
| a small square control (a row's ‹ ›, the NOW PLAYING ⏮ ⏸ ⏭ transport on the MUSIC page and in the pause menu) | one shape: a `--chip-h` plate square, `--r-sm` corners; play/pause is the same square, filled | `css/settings-controls.css` `.set-row > div > button`, `css/tuner.css` `.as-tbtn` |
| a status word | gold ON / red OFF via `[data-fold]` — on READOUTS only: the closed fold summaries (`MUSIC · ON · ALL`) and the title-screen sound button. `AriaState.paintOnOff` skips `.opt-btn` | `css/settings-controls.css`, `js/ui/aria-state.js` |

Why a row and not a chip row for settings — measured, not argued.
`tools/ui/layout-audit.mjs` over the four settings pages at UI SIZE 100 / 150 /
200 on phone, tablet and desktop: the labelled chip rows never clipped and never
fell under the tap floor, but each setting cost a label, one to three chip lines
and a help line — CONTROLS ran 3.8 screens deep at landscape 150% for THREE
settings, and LAYOUT's five chips wrapped to three lines at 200%. A setting row
costs one line however many options it has, which is also why console racing
games settle on `‹ VALUE ›` for their options screens. Chips stay where seeing
every option side by side IS the task. RACE SETTINGS was the last screen on
chips (2026-09-05, later the same day): its seven chip groups needed ~130 lines
of shape- and density-keyed grid placement to fit a landscape phone, CAUTIONS
had drifted into the coloured-word grammar, and DIFFICULTY squeezed to three
cramped chips in portrait. The rows fit
two columns at every shape with two CSS rules, and MIXED weather became its own
CONDITIONS row instead of a toggle hiding among the weathers. Two things the row learned there, both measured with
`scratch`-style Playwright probes rather than eyeballed: a grid that holds rows
needs `grid-auto-rows: max-content`, because Chromium sizes an `auto` track from
a wrapping row's single-line height and wrapped rows painted over each other at
150%; and the ‹ › squares may shrink to `--tap-min` so that at 200% on a 393px
phone the value keeps its room (MANUAL / DEFAULT no longer clip; values of eight
or more characters still do there — the only shape that clips anything).

Deliberate exceptions, each carrying a meaning red would erase: the livery
`NONE` / palette pills use a white ring because colour IS their content;
`.cs-opt.exclusive.active` is gold because the part is exclusive; `#cs-aero`
lights cyan because that is the X-mode colour the in-race HUD uses for the same
system.

`tests/unit/ui-improve-pass.test.mjs` asserts the glow token is gone from every
file, that no Settings exception restates the chip look, that `paintOnOff` skips
chips, and that every Settings pick is a `.set-row`; `tests/unit/hud-metrics-layout.test.mjs`
pins the HUD fold's rows.

## Families, and the file that owns each

A family is the prefix before a class's first hyphen. "Owner" is the file with
the most selector rules naming that family (a rule counts once per file however
many of the family's classes it names); "also in" is every other file with at
least one such rule. A family with more than one file is a coupling — usually
deliberate (`responsive.css` and `touch-controls.css` re-tune `hud-*`),
occasionally not. The test prints the expected row when one drifts. Sizes are
not tabled: they move with every edit and nothing reads them.

| family | owner | also in | note |
|---|---|---|---|
| `adv-` | `tuner.css` | `carsetup.css`, `components.css`, `overlays.css`, `photo-studio.css`, `race-setup.css`, `settings-controls.css` |  |
| `as-` | `tuner.css` | `components.css`, `dialogs.css`, `overlays.css`, `settings.css` |  |
| `ax-` | `hud.css` | — |  |
| `balanced-` | `menus.css` | `components.css`, `photo-studio.css`, `race-setup.css`, `settings-controls.css`, `tuner.css` | `.balanced-row`, the shared wrap primitive |
| `bc-` | `hud.css` | `helmet-visor.css`, `watch-transport.css` |  |
| `btn-` | `menus.css` | `menu-destinations.css`, `title.css` |  |
| `budget-` | `carsetup.css` | — |  |
| `build-` | `dialogs.css` | `menus.css` |  |
| `cap-` | `hud.css` | — |  |
| `cg-` | `career.css` | — |  |
| `chip-` | `select.css` | — |  |
| `co-` | `career.css` | — |  |
| `cockpit-` | `track-detail.css` | — |  |
| `cr-` | `career.css` | `career-experience.css` |  |
| `cs-` | `carsetup.css` | `components.css`, `garage-experience.css`, `player-tools.css`, `tokens.css` |  |
| `cz-` | `race-setup.css` | `components.css`, `settings-controls.css` |  |
| `dh-` | `data.css` | `components.css`, `dialog-platform.css`, `tokens.css` |  |
| `dock-` | `touch-controls.css` | — |  |
| `duel-` | `race-setup.css` | — |  |
| `editor-` | `tuner.css` | — | shared tuner workspace: the Preview/Edit container |
| `ew-` | `tuner.css` | — | shared tuner workspace: toolbar, scope note and disclosure |
| `fb-` | `tuner.css` | — |  |
| `flag-` | `hud.css` | — |  |
| `hud-` | `hud.css` | `helmet-visor.css`, `overlays.css`, `responsive.css`, `tokens.css`, `touch-controls.css`, `watch-transport.css` |  |
| `in-` | `overlays.css` | `hud.css`, `loading.css`, `tokens.css`, `touch-controls.css` |  |
| `input-` | `hud.css` | — | pause input review and its static chart |
| `ld-` | `loading.css` | — |  |
| `limits-` | `hud.css` | — |  |
| `lt-` | `tuner.css` | `components.css`, `hud.css` |  |
| `mb-` | `menu-destinations.css` | `experience.css`, `menus.css` |  |
| `menu-` | `menu-destinations.css` | — | title destination headings and groups |
| `mirror-` | `touch-controls.css` | `hud.css` |  |
| `music-` | `tuner.css` | — |  |
| `opt-` | `tuner.css` | `components.css`, `settings-controls.css`, `settings.css` |  |
| `ot-` | `hud.css` | — |  |
| `over-` | `carsetup.css` | — |  |
| `pad-` | `responsive.css` | — | `.pad-ring`, the phone controller focus ring (below) |
| `pair-` | `overlays.css` | `race-setup.css` | `.pane-pair` slots (`.pair-side`, `.pair-main`, `.pair-foot-full`) |
| `pane-` | `overlays.css` | — | `.pane-pair` and its foot variants |
| `pc-` | `hud.css` | `helmet-visor.css`, `photo-studio.css`, `tuner.css` |  |
| `photo-` | `photo-studio.css` | `experience.css`, `overlays.css`, `tuner.css`, `watch-transport.css` |  |
| `player-` | `player-tools.css` | — |  |
| `pm-` | `settings-controls.css` | `components.css`, `hud.css`, `player-tools.css`, `settings.css`, `tokens.css` |  |
| `preset-` | `tuner.css` | `components.css`, `race-setup.css`, `settings-controls.css`, `settings.css` |  |
| `q-` | `career.css` | `overlays.css` |  |
| `race-` | `player-tools.css` | — |  |
| `res-` | `overlays.css` | `career.css`, `tokens.css` | results row, reused by the championship table |
| `rotate-` | `overlays.css` | — |  |
| `save-` | `save-health.css` | — |  |
| `season-` | `race-setup.css` | `components.css`, `select.css` |  |
| `sec-` | `hud.css` | — |  |
| `sel-` | `editor.css` | `career-experience.css`, `career.css`, `carsetup.css`, `components.css`, `overlays.css`, `race-setup.css`, `select.css`, `tokens.css` |  |
| `session-` | `race-setup.css` | — | `.session-summary` (below) |
| `set-` | `settings-controls.css` | `appearance-studio.css`, `experience.css`, `race-setup.css`, `select.css`, `settings.css`, `tuner.css` |  |
| `settings-` | `player-tools.css` | — |  |
| `sf-` | `components.css` | `data.css`, `menu-destinations.css`, `photo-studio.css`, `race-setup.css`, `tuner.css` |  |
| `sheet-` | `overlays.css` | `appearance-studio.css`, `career.css`, `carsetup.css`, `components.css`, `data.css`, `dialogs.css`, `editor.css`, `hud.css`, `photo-studio.css`, `player-tools.css`, `race-setup.css`, `select.css`, `settings.css`, `tuner.css` | the shared sheet head / body / foot |
| `sp-` | `tuner.css` | — |  |
| `steer-` | `touch-controls.css` | — |  |
| `sur-` | `race-setup.css` | `select.css` |  |
| `td-` | `editor.css` | — |  |
| `tdc-` | `track-detail.css` | — |  |
| `tdd-` | `track-detail.css` | — |  |
| `tdf-` | `track-detail.css` | — |  |
| `tds-` | `track-detail.css` | — |  |
| `team-` | `select.css` | `components.css` |  |
| `tm-` | `select.css` | `tokens.css` |  |
| `track-` | `select.css` | `components.css`, `race-setup.css` |  |
| `trb-` | `race-setup.css` | — |  |
| `tune-` | `settings.css` | `components.css`, `garage-experience.css`, `photo-studio.css`, `race-setup.css`, `settings-controls.css`, `tuner.css` |  |
| `vs-` | `overlays.css` | — |  |
| `watch-` | `watch-transport.css` | `helmet-visor.css` | WATCH replay transport and its race layout context |
| *(unprefixed)* | `overlays.css` | most files | state classes (below) |

`.pad-ring` (`responsive.css`) is the PHONE CONTROLLER's focus ring: `PhonePad`
(`js/input/phone-pad.js`) puts it on the element the phone's D-pad focused,
because a browser need not draw `:focus-visible` for a scripted focus (Safari
after a touch) or any focus while its window is not the focused one.
`.session-summary` lives in `race-setup.css`: it keeps the circuit count and
race setup summary readable in their sheet headers, truncating when the header
narrows.

**A family leaves this list when it leaves `css/`.** The title screen's old
`.mb-stack` / `.mb-sub` pair was replaced by `#mb-career > span` and
`#mb-career-sub` when each dressed one element in one button; `.mb-sub`
RETURNED in round 10 as the shared door sub-line recipe — the hero's save line
plus the static mode answers on the title doors, which is the reuse the original
pair lacked. `.mb-label` is a span hook (`js/ui/title-menu.js` reads it) with no
stylesheet rule. The season-status chips on `#menu-status` left with that
dashboard chrome. Unused `.ui-panel` / `.ui-kicker` / `.ui-value` / `.ui-muted`
placeholders were removed rather than inventoried as dead.

A family can also shrink without disappearing, and `cs-` did: the garage's
preview bar had `.cs-view-btn` plus two variants that existed only to restate a
font-size, a padding and a line-height (`.cs-view-zoom`, `.cs-view-nudge`) on
buttons that all carry ids anyway, so those became `--vb-fs` / `--vb-pad` set on
the ids. `.cs-cam-lbl` went with them — its single declaration duplicated the
value `#cs-cam` already passed down by inheritance, so it could not change a
pixel. This table proves a family left; the `cssClasses` ratchet
(`tests/data/ratchets.json`) proves the total came down.

`sel-` shrank the same way and for the same reason: `.sel-section` set one
declaration on one element in the whole app, and that element already had an id.

**The `(unprefixed)` row is the one to watch.** It spans most files, on state
classes rather than components — `.active`, `.on`, `.armed`, `.desktop`, `.p1`,
`.you`, `.dim`. State is *meant* to be cross-cutting, so this is not a defect,
but it is the least discoverable part of the system.

## Defined in more than one file

This is the list worth keeping in view. Every entry is a place where editing one
file changes a screen owned by another. Each bullet names its classes, then
EXACTLY the files (without `.css`) that define every one of them;
`tests/unit/component-inventory.test.mjs` parses the bullets and fails on a
missing class, a file that left, or a file that joined.

**Deliberate sharing — one component, re-tuned elsewhere:**

- `.screen` — `carsetup` + `components` + `dialog-platform` + `dialogs` + `experience` + `hud` + `overlays` + `responsive` + `watch-transport`. The full-viewport overlay primitive.
- `.sheet` — `career` + `career-experience` + `components` + `dialog-platform` + `dialogs` + `menus` + `overlays` + `race-setup` + `select` + `settings` + `settings-controls` + `tokens`
- `.sheet-head` — `career` + `carsetup` + `components` + `data` + `dialogs` + `editor` + `overlays` + `photo-studio` + `race-setup` + `select` + `settings`
- `.sheet-foot` — `appearance-studio` + `career` + `carsetup` + `components` + `dialogs` + `overlays` + `photo-studio` + `race-setup` + `select` + `settings` + `tuner`. The most-shared component class in the project.
- `.sheet-body` — `career` + `components` + `dialogs` + `hud` + `overlays` + `player-tools`. How to Play, Career guide and Career history place the shared body on the sheet grid for the wide contents rail (`#htp-contents` / `#cg-contents` / `#ch-contents`); idle ink and wide/compact placement stay on the screen sheets.
- `.pane` — `components` + `race-setup` + `select`
- `.pair-side` / `.pair-main` — `overlays` + `race-setup`
- `.balanced-row` — `components` + `menus` + `photo-studio` + `race-setup` + `settings-controls` + `tuner`. Flex wrap that derives its column count from `--balance-basis` / `--balance-min` instead of `repeat(N, ...)`.
- `.bigbtn` — `career` + `carsetup` + `components` + `dialogs` + `experience` + `menu-destinations` + `menus` + `overlays` + `photo-studio` + `responsive` + `select` + `title` + `tokens`
- `.alt` — `career` + `components` + `dialogs` + `experience` + `menus`. Alternate `.bigbtn` look; defined on `.bigbtn.alt` in `components`, re-tinted per screen elsewhere.
- `.minibtn` — `menus` + `responsive`
- `.btn-ico` — `menu-destinations` + `menus` + `title`
- `.mb-sub` — `experience` + `menu-destinations` + `menus`
- `.build-tag` — `dialogs` + `menus`. The footer version tag: styled in `menus`, overridden by the pause card's compact-density selector in `dialogs`.
- `.hud-box` / `.hud-value` — `hud` + `overlays` + `tokens` + `touch-controls`
- `.hud-label` — `hud` + `overlays` + `touch-controls`
- `.hud-gaps` — `hud` + `overlays` + `watch-transport`
- `.hud-top` — `hud` + `watch-transport`
- `.hud-bottom` — `hud` + `touch-controls` + `watch-transport`
- `.hud-unit` — `hud` + `touch-controls`
- `.touchbtn` — `hud` + `overlays` + `tokens` + `touch-controls` + `watch-transport`
- `.hud-hidden` — `helmet-visor` + `hud` + `responsive` + `touch-controls`. Hides the driving HUD, including manually positioned instruments detached from the bottom cluster; the visor refraction filter also steps aside so a clean frame stays unbent.
- `.hud-hide-map` — `hud` + `overlays`. Body class for MAP OFF: `hud` parks the gap strip in the map's corner; the ≥1200px tier in `overlays` (which wins the layer order whatever the specificity) steps aside with `body:not(.hud-hide-map)` so its 178px beside-the-map anchor cannot leave the strip floating.
- `.dock` — `hud` + `touch-controls`. The touch-controls dock: laid out in `touch-controls`; `hud` hides it with the rest of the chrome and stills it under reduced motion.
- `.mirror-controls` — `hud` + `touch-controls`. LEFT-HANDED body class (`js/game.js`): `touch-controls` reverses `#hud-dock`, so `#dock-right` paints on the left; `hud` re-points TYRES's `--apex-dock-left` anchor to it, and `js/ui/hud.js` `pickDocks()` hands the fit the docks by painted side.
- `.bc-on` — `helmet-visor` + `hud`. Body class for the broadcast HUD (a REAL RACE WATCH / HIGHLIGHTS run): `hud` hides the driving chrome, the touch buttons and CAM; `helmet-visor` skips refraction while broadcast is up.
- `.bc-head` — `hud` + `watch-transport`. Timing header button semantics.
- `.watch-controls-on` — `helmet-visor` + `watch-transport`. Body class for the WATCH transport strip: `watch-transport` hides the driving HUD chrome and the helmet `::before` shield; `helmet-visor` also drops the world refraction filter so the replay view is not bent.
- `.pc-stickwrap` / `.pc-move-wrap` / `.pc-look-wrap` / `.pc-altcol` / `.pc-btn` — `hud` + `photo-studio`. Photo Studio borrows the camera controls, then fits their zoom and anchors around its side or bottom dock while it is open.
- `.pc-uihidden` — `helmet-visor` + `hud`. Photo-mode HIDE HUD: `hud` clears the driving chrome for an unobstructed frame; `helmet-visor` drops the refraction filter with it.
- `.pc-nopanel` — `hud` + `tuner`
- `.photo-mode` — `photo-studio` + `tuner` + `watch-transport`. Hides playback chrome during composition.
- `.photo-studio-open` — `experience` + `overlays` + `photo-studio`. Scene-only composition.
- `.cs-liv-editor` / `.cs-liv-ed-row` / `.cs-opt-desc` / `.cs-liv-ed-btns` / `.cs-liv-ed-prev` — `carsetup` + `garage-experience`. The paint editor's rows are built in carsetup.css; garage-experience.css owns the greyed-row look and its visible reason line (`[data-liv-why]`), and shows the editor's live feedback (`.cs-opt-desc[role=status]`, `[aria-live]`) on the compact tier that otherwise hides `.cs-opt-desc`. The car-area tabs pin `.cs-liv-ed-btns` (CANCEL / SAVE) at the foot of the pane and shrink the `.cs-liv-ed-prev` swatch to a strip.
- `.cs-opt` — `carsetup` + `components` + `garage-experience`
- `.cs-tab` / `.cs-unlimited-btn` — `carsetup` + `components`
- `.cr-nextrace` / `.cr-nr-name` — `career` + `career-experience`. The real next-race brief.
- `.dh-tab` / `.dh-row` / `.dh-pill` / `.dh-dchip` / `.dh-sortbtn` / `.dh-race-sub` / `.dh-error-msg` — `components` + `data`
- `.dh-card` — `data` + `dialog-platform`
- `.sf-b` — `components` + `data`. ScrollFade's more-below class; `data` paints an inset box-shadow on `.dh-content.sf-b` because the shared mask fade is too weak on the translucent hub panel (phones).
- `.sf-scroll` — `components` + `data` + `menu-destinations` + `photo-studio` + `race-setup` + `tuner`
- `.cs-liv-swatch` — `carsetup` + `tokens`
- `.tm-colour` — `select` + `tokens`
- `.swatch` — `editor` + `select` + `tokens`
- `.res-swatch` — `overlays` + `tokens`
- `.dh-swatch` — `data` + `tokens`
- `.pm-accent-chip` — `settings` + `tokens`. This and the five swatches above appear once more in `tokens`' single `forced-colors` block: colour IS the content on a swatch, so they all opt out of forced-color-adjust together — one rule, deliberately, rather than six copies of the same carve-out.

**Cross-SCREEN reuse — a component borrowed by a screen that does not own it:**

- `.res-row` / `.res-pos` / `.res-name` / `.res-pts` — `career` + `overlays`. The championship table deliberately reuses the results-screen row so standings do not look like a different game depending on where you are; compact Career history / qualifying / standings / results wrap the shared points cell instead of ellipsizing it. **This is the one that bit us**: it is invisible from either file alone.
- `.q-time` — `career` + `overlays`. Shared timing text; race result gaps sit on a second line inside the driver name so they remain readable on phones.
- `.sel-label` — `career` + `carsetup` + `overlays` + `select`. The skewed red section heading.
- `.sel-chip` — `career` + `career-experience` + `carsetup` + `components` + `editor` + `race-setup` + `select` + `tokens`
- `.sel-edit` — `carsetup` + `components` + `editor` + `select`
- `.team-tile` — `components` + `select`
- `.track-row` / `.season-upcoming-row` — `components` + `race-setup` + `select`
- `.cz-liv-none` — `components` + `race-setup`
- `.lt-tab` — `components` + `tuner`
- `.adv-sec` — `components` + `photo-studio` + `settings-controls` + `tuner`
- `.adv-help` — `carsetup` + `components` + `overlays` + `race-setup` + `settings-controls` + `tuner`
- `.adv-item` — `settings-controls` + `tuner`
- `.adv-more-btn` — `components` + `settings-controls` + `tuner`
- `.as-note` — `components` + `tuner`
- `.as-tbtn` — `dialogs` + `overlays` + `settings` + `tuner`. The NOW PLAYING transport square, owned by `tuner`; `settings` restates its size inside Settings over the broad group button rules, the same way the setting-row chevrons are, and `dialogs` / `overlays` keep the pause card's door rules off it.
- `.opt-btn` — `components` + `settings` + `settings-controls` + `tuner`
- `.preset-btn` — `components` + `race-setup` + `settings` + `settings-controls` + `tuner`
- `.preset-row` — `settings-controls` + `tuner`
- `.tune-label` — `components` + `race-setup` + `settings` + `settings-controls` + `tuner`
- `.tune-row` — `garage-experience` + `photo-studio` + `settings` + `settings-controls` + `tuner`
- `.set-row` — `appearance-studio` + `experience` + `race-setup` + `select` + `settings` + `settings-controls` + `tuner`
- `.pm-group` / `.pm-group-h` — `components` + `settings` + `settings-controls`. Pause-settings group and its heading.
- `.pm-doors` — `components` + `player-tools` + `settings` + `settings-controls`
- `.pm-groups` — `hud` + `settings` + `settings-controls`

**Sharing within extracted source families** — these classes already belonged
to one logical stylesheet; extraction makes that relationship visible across
its physical files:

- `.pm-accent-swatches` / `.pm-look-h` / `.pm-pad-tools` / `.pm-replay-intro` — `settings` + `settings-controls`
- `.season-upcoming-head` / `.sur-country` / `.sur-name` / `.sur-rnd` / `.track-group-head` / `.track-row-meta` / `.track-row-name` / `.track-row-rec` / `.trb` — `race-setup` + `select`

**State classes** (`.active`, `.on`, `.armed`, `.desktop`, `.dim`, `.in-race`,
`.p1`, `.you`) are shared by design and are listed here only so nobody mistakes
them for components; the test exempts this line from the file-set check.

## Dead classes

None — no class is defined in `css/` and referenced from neither `index.html`
nor any `js/` file. The three this section used to name (`dh-leg-swatch`,
`dh-sectors`, `foot-end`) have since been deleted from `css/`, and the last of
them took its whole class family with it — which is why no "foot" prefix is
listed above any more.

That the list reached empty is the real headline of this exercise: the
stylesheet was never carrying rot, it was just carrying no map. Keep this
section even when empty — `tests/unit/component-inventory.test.mjs` asserts that
every dead class is named here, so a new one is a prompt to decide whether the
class is unfinished work or a leftover, and an empty list is a claim worth
being held to.

---

## How to use this

- **Before editing a class, check whether it appears above under "more than one
  file".** If it does, you are editing more than one screen.
- **Before adding a family**, ask whether an existing one already covers it. The
  audit grid (below; `SCREENS` in `tools/ui/menu-screens.mjs`) measures every
  screen cell; a new family usually means a new one-off, and one-offs are what
  `.pane-pair` was built to retire.
- **When the tables drift**, `node --test tests/unit/component-inventory.test.mjs`
  says so first and prints the expected row or file set.

## Layout axes — the screen x viewport grid

Every layout bug this project has shipped lived in a **cell of a matrix**, not in
a screen: the circuit list stopped 49px above the sheet floor *only* in the
two-column branch; the garage stacked its category rail *only* at the sheet's
430px floor width; the preview card clipped its chip row *only* where the column
was shorter than the card; a full-width map band left the circuit list two pixels
*only* on a rotated monitor, where a portrait window holds a landscape-shaped
sheet. Each was found by looking at one screenshot, and each was invisible in
every other screenshot taken that day.

The cure is not more screenshots. It is enumerating the matrix and measuring it.

```sh
node tools/ui/layout-audit.mjs --help
node tools/ui/layout-audit.mjs --list
node tools/ui/layout-audit.mjs                          # geometry matrix
node tools/ui/layout-audit.mjs --shots --dom            # + PNG / DOM per cell
node tools/ui/layout-audit.mjs --screens=select,garage --viewports=ios-*
node tools/ui/layout-audit.mjs --scale=100,130,150       # each viewport at each UI size
node tools/ui/layout-audit.mjs --gallery                 # fast PNG+DOM (no geometry probe)
node tools/ui/layout-audit.mjs --screen=settings         # one cell
node tools/ui/layout-audit.mjs --survey                  # title-path recipe (+ shots)
```

Geometry output: `artifacts/layout-audit/{audit.json,index.html}`.
Gallery output: `artifacts/layout-audit/gallery/{manifest.json,shots/,dom/}`.
npm: `ui:audit` / `ui:gallery` / `ui:survey`.

---

### Measure first, look second

Screenshots are slow here — the renderer is SwiftShader, and a 1440x900 capture
of a live 3D scene can take minutes — and they prove nothing you can grep. A
geometry probe reads the same truth out of the DOM in milliseconds:

| what it asks | why it is the question |
|---|---|
| does any visible box escape the thing that clips it | this is "text is cut off", stated in a way a machine can check. Scroll containers are exempt on **either** axis they scroll — that is what scrolling is |
| is any interactive element outside the viewport | a button you cannot reach is worse than one that looks wrong. "Reachable" means *some ancestor's computed `overflow` scrolls to it*, asked of the DOM rather than of a list of known pane selectors |
| is any tap target under 24px | WCAG 2.2 SC 2.5.8 (AA) — a conformance floor, so red |
| is any tap target under the `--tap` token | the house comfort floor (44 base, raised to 52 on touch — the tool reads the live `--tap` token). Above 24px this is a preference, so amber |
| is any text ellipsised | not always a bug — often the point — but it is the difference between SUSPENSION and SUSPENSI… |
| does the document scroll horizontally | always a bug on a fixed-viewport game |
| for each scroll region: how much is hidden, and how far it stops above the sheet floor | the measurement that caught the action bar stealing a row from the circuit list |
| did the page throw | a layout that only looks right because a script died is not right |

Only after the grid says *where* is a screenshot worth waiting for. `--shots`
takes them, and the gallery links each cell to its own.

**Stop the render loop first.** The probe calls `__apex.headless(true)` before
opening anything: the 3D scene starves the compositor, which makes every wait and
every capture an order of magnitude slower. A desktop screenshot that timed out
at four minutes took twenty seconds with the loop stopped.

**But stopping the loop also starves `requestAnimationFrame`, and that makes
every OBSERVER-dependent measurement unreliable.** ResizeObserver and
IntersectionObserver deliver on the frame loop, so with the loop stopped they
fire late or not at all inside the probe's window — and the grid then records
the *pre-observer* state as if it were the final layout. MEASURED 2026-08-13 at
834x1194 under the audit's own conditions: the first rAF after a click took
**5346 ms** and the card's ResizeObserver fired at 5402 ms; with the render loop
running the same observer fired in **29 ms**.

This is not hypothetical. It is how the circuit preview map came to be reported
as `map 80x119` — a cosmetic-looking resolution note — when the real behaviour
on deploy was a map rendering permanently at a tenth of its size in a 762x500
card. The metric was right about the pixels and wrong about the cause, and the
cause was the probe.

**So: any check whose answer arrives via an observer must be confirmed with the
loop RUNNING before it is believed, in either direction** — a clean cell may be
hiding a defect the observer would have fixed, and a dirty one may be reporting
a state no player ever sees. `__apex.headless(false)`, or drive it through the
Chrome DevTools MCP without calling `headless` at all.

---

### The viewports, and what each one is for

These are shapes a display can be, not devices people own. Each exists because
some branch turns on or off at it.

| viewport | why it is in the matrix |
|---|---|
| `ios-iphone-portrait` 393x852 | the phone as most people hold it |
| `ios-iphone-landscape` 852x393 | the shape the game is PLAYED in — 343px of sheet height for everything |
| `ios-iphone-landscape-safari` 852x344 | landscape Safari with the toolbar collapsed. The device descriptor's 393px is the FULL-SCREEN/PWA height; a browser tab is ~50px shorter, and until 2026-08 no cell sat between 344 and 393 — the hole that hid the fixed-chrome sheets' worst case |
| `ios-iphone-landscape-844` 844x390 | iPhone 12-14 and common Android phones in landscape, full screen. The 852x344 / 852x393 cells never land on it; a title-screen overlap (INSTALL APP over ANIMATE BACKGROUND) showed only here |
| `ios-ipad-portrait` 834x1194 | wide sheet, tall window: wants bands, not columns |
| `ios-ipad-landscape` 1194x834 | the two-column case at its smallest |
| `desktop-1280x800` | a small laptop |
| `desktop-1440x900` | the common desktop |
| `desktop-1920x1080` | full screen on a 1080p monitor |
| `desktop-windowed-1920x937` | the same monitor with browser chrome — 143px less, and browser chrome is why a "desktop" can land on a phone branch |
| `desktop-narrow-860x560` | a small window, or a maximised one at 125% zoom; below the 900x600 large-screen gate |
| `desktop-portrait-1080x1920` | a rotated monitor: a PORTRAIT window. `#sel-inner` is capped at `min(100%, max(720px, 78svh))` (menu-zoom units, `css/overlays.css`), so here the sheet is genuinely TALL and takes the band layout — it used to be capped landscape at a flat 720px, which is what made the circuit list two pixels high |

The last two are the ones that keep finding bugs. A viewport's orientation does
not tell you the sheet's shape, and the sheet is what the layout keys on.

---

### The screens, and how to reach each one

The other half of the matrix. `SCREENS` in `tools/ui/menu-screens.mjs` is the
executable version of this table — **it is the inventory**, so a screen missing
from it is a screen nobody measures.

The first draft of this grid held twelve entries and reported "130 cells, 0 red",
which read as full coverage. It was not: the app has far more screen roots than
that (the top-level ones are tabled below; `SCREENS` in
`tools/ui/menu-screens.mjs` adds the sub-views and more — that inventory, not
this prose, is the count that matters), and
several change shape entirely between states behind one root. Qualifying, the
livery editor, the standings table, both tuner panels and every career
sub-screen had never been measured once. The first sweep that included them
found a real WCAG failure in the lighting tuner within a minute.

**Top-level screens** — one root each, reached the way a player reaches it:

| cell | root | route |
|---|---|---|
| `title` | `#overlay` | boot |
| `select` | `#select` | `#mb-race` |
| `garage` | `#carsetup` | `#mb-garage` → ENGINE tab |
| `career` | `#career` | `#mb-career` (new-career SETUP state) |
| `datahub` | `#datahub` | `#mb-data` |
| `trackdesigner` | `#trackdesigner` | `#mb-designer` |
| `howtoplay` | `#howtoplay` | `#mb-help` |
| `settings` | `#pmsettings` | `#mb-settings` |
| `vsfriend` | `#vsfriend` | `#mb-vs` |
| `teampicker` | `#teampicker` | garage → TEAM tab → `#cs-team-card` |
| `racesettings` | `#race-settings` | select → `#sel-go` (NEXT) |
| `season-setup` | `#season-setup` | `#mb-season` → SETUP |
| `trackdetail` | `#track-detail` | select → `#sel-map-btn` / `#sel-detail-chip` |
| `quali` | `#quali` | race settings → QUALIFYING LAP **on** → `#rs-go` |
| `standings` | `#standings` | in-race → pause → `#pm-standings` |
| `customize` | `#customize` | garage → **TEAM** tab → `#cs-customize` |
| `advanced` | `#advanced` (in `#pmsettings`) | settings → `#pm-open-controls` → `#pm-advanced` |
| `audioset` | `#audioset` (in `#pmsettings`) | settings → `#pm-audio` |
| `spotify` | `#spotifypanel` | shown directly (no account to connect) |
| `careerguide` | `#career-guide` | career → HOW CAREER WORKS |
| `careerhistory` | `#career-history` | career → SEASON BY SEASON |
| `careeroffers` | `#career-offers` | `__apex.careerRollover()` → `#cr-go` |
| `results` | `#results` | `__apex.race()` → `__apex.finishRace()` |
| `pause` | `#pausemenu` | in-race, `#pausemenu` unhidden |
| `hud` | `#hud` | `SurveyHud.apply()` (no race) |

**Sub-views** — same root, materially different layout. These are not extra
polish: a screen measured in one state is a screen measured once, and the
lighting tuner's failure was in a state the grid had no entry for.

| cell | why it is its own cell |
|---|---|
| `careerhub` | `#career` is the new-career SETUP on a fresh profile and the SEASON HUB once one exists — two layouts, one root. Hub left: next race + contract/car + `#cr-funds` disclosure; right: upcoming + championship + market ladder |
| `garagelivery` | colour pickers and swatch grids, not option rows |
| `garageteam` | team card + driver chips + EDIT MY TEAM |
| `datatelemetry` | the trace viewer/map/playback — the densest thing in the app |
| `dataschedule` | a wide table, the case that wants horizontal scroll |
| `lightingtuner` | `#lighting`, a docked slider panel; `#lt-rail` goes `display: contents` when wide |
| `cameratuner` | `#camtune`, the same shape for the camera modes |
| `hudmanual` | MANUAL moves the gearbox into the right thumb column and relocates BOOST/OT/AERO — a different control stack, not a restyle |

Also measured, added when the gaps above were closed: `datastandings`,
`dataresults`, `datalive`, `dataexport` (the rest of the hub's tabs),
`resultsseason` (the same root carrying a championship table, ten rows taller
than a Grand Prix classification), `hudtouch` and `hudbuttons` (the two remaining
steering modes — "touch" hides the gas pedal, "buttons" adds an explicit GAS), and
`garagewheels`; later, one cell per Settings page (`settings*`), `duelpicker`, `loading`,
`flybyeditor`, `lightingtunerfly`, `photocontrols`, `photostudio`, `bench` and
`hudpause`.

**`garagewheels` exists to MEASURE a claim rather than assert it.** The line used
to read "the garage's other ten part tabs share one layout, so one stands for
all", which is the kind of statement that is true until it is not. WHEELS is the
last tab, so it also exercises the rail scrolled to its end. It measures clean,
which is what earns the other part tabs their exemption.

**One real gap remains:** a screen that needs `page.reload()` to reach cannot be
a cell. Reload destroys the execution context, and the first version of the
steering-mode cells did exactly that — every screen AFTER them failed with
"Execution context was destroyed", and two viewports ran out of budget and failed
to boot: 98 skipped cells, not one a layout finding. Reach the state through the
app's own controls (`#pm-steer-sel` sets the mode) or leave it unmeasured.

---

### Seven axes, and which mechanism owns each

**Read this before adding any layout rule.** Every layout bug this project has
had was one axis being answered by a mechanism that belongs to a different one —
not a missing technique, a misrouted question. The rotated monitor was *viewport
shape* answering for *container shape*. The garage/select divergence was two
screens answering *container size* with two different sets of hand-picked
thresholds.

| axis | the question it asks | mechanism that owns it |
|---|---|---|
| **viewport size** | how big is the window | `@media (min-width: …)` |
| **viewport shape** | is the WINDOW tall or wide | `@media (orientation: …)` — and almost nothing should need this |
| **container size** | how much room did this PANEL get | `@container sheet (min-width: …)` |
| **container shape** | is the PANEL tall or wide | `data-shape="tall\|wide"`, written by `js/ui/sheet-shape.js` — CSS cannot ask (see below) |
| **input modality** | finger, mouse, or both | `pointer` / `any-pointer` / `any-hover`; `body.desktop` |
| **density** | how big should a target be | the `--tap` / `--pad` / `--gap` token ladder in `css/tokens.css` |
| **safe area** | what hardware is in the way | `env(safe-area-inset-*)` via the `--safe-t/r/b/l` tokens |

Two axes are worth extra care because they *look* like each other:

- **Viewport shape is not container shape.** A portrait window can hold a
  landscape sheet — `#sel-inner` used to be capped at a flat 720px tall, so on a
  rotated 1080x1920 monitor the sheet was wider than it was tall inside a portrait
  window. Gating a band layout on `@media (orientation: portrait)` gave that
  screen the tablet layout and left the circuit list two pixels high.
- **Input modality is not size.** A 1024px iPad is not a desktop. `body.desktop`
  comes from `pointer: coarse`, which is the right kind of question; use it for
  affordances, never for room.

**Why container shape needs JavaScript at all:** querying height, `aspect-ratio`
or `orientation` on a container requires `container-type: size`, which applies
size containment in both axes — and a size container may not take its size from
its contents, which every sheet here does. So `sheet-shape.js` measures with a
`ResizeObserver` and writes the answer to an attribute. An attribute rather than
a custom property deliberately: attribute selectors carry specificity, and
container queries add none (see the trap below).

### The three mechanisms in detail, and their traps

The table above says which axis owns what. This is how the three CSS mechanisms
behind it actually behave, including the ways they have misled us:

1. **Container queries on the sheet** (`@container sheet (min-width: …)`) — the
   default, and right for anything that depends on the room a panel actually got.
   **A container query cannot style its own container.** `#sel-inner` *is* the
   `sheet` container, so a rule for it inside `@container sheet` silently never
   applies; the column template has to live outside the block. This has now cost
   two debugging sessions.
2. **Media queries on the viewport** (`@media (orientation: …)`, `(max-height: …)`)
   — for what the *window* is, not what a panel got: orientation, the density
   token ladder in `css/tokens.css`, `body.desktop` behaviour.
3. **A class on `<body>`** — `desktop` is set from `pointer: coarse`, which is
   input, not size. Use it for input affordances, never for room.

Traps worth writing on the wall:

- **Specificity ties are decided by source order, and container queries add
  none.** A single-ID rule inside `@container` loses to an identical single-ID
  rule declared later in the file. The fix is inheritance through a custom
  property (the retired `--sel-map-w` did this for the circuit map; the header of
  `js/ui/sheet-shape.js` keeps the story) or, where that is not available, a
  second ID in the selector.
- **An `auto` grid track's growth limit is max-content.** A scroll region that
  spans into an `auto` row hands that row its entire content height — a 24-row
  circuit list turned a 76px action bar into 358px. Use `min-content` for a track
  a scroller spans into.
- **A modal in the TOP LAYER ignores z-index entirely.** Every `.screen.dim` is a
  `<dialog>` opened with `showModal()` (`js/ui/modal.js`), so nothing in the
  document can paint over it and no `overflow: hidden` or transformed ancestor
  can clip it. Do not add a `z-index` to one — it does nothing, and an inert
  number that looks like a working ladder is worse than a ladder. Ordering
  between two open modals is the order `showModal()` was called in.
- **Anything outside a cascade layer beats everything inside one.** Unlayered
  normal declarations outrank every `@layer`, so a one-ID unlayered rule defeats a
  two-ID layered one and no amount of specificity closes the gap. A stray `}` put
  200 lines of `css/menus.css` outside `@layer components` and quietly defeated
  the phone layout's own overrides. `tests/unit/css-layers.test.mjs` guards it now.
  (`!important` inverts the order: unlayered `!important` is the *weakest*, and
  the first layer declared wins — that is the emergency hatch, not a habit.)

---

### A finding is a claim about the probe until something else confirms it

Five times on this work a first reading was wrong, and each time the wrongness
looked exactly like a real bug:

1. A scroll measurement taken while Chromium was still *animating* the wheel
   scroll — the starved software compositor landed it seconds later. Fixed by
   `__apex.headless(true)` plus settle-polling.
2. A sweep that reported 100 clean cells and had measured nothing: in the
   **JavaScript** Playwright client `page.evaluate("(x) => …", arg)` evaluates the
   string as an expression and the argument never arrives. Pass a real function.
3. Two "unreachable control" findings (the data hub's tab strip, the career hub's
   slot list) that came from asking a hardcoded list of selectors whether an
   ancestor scrolls, instead of asking the computed style. `#cr-body` had 319px
   of scroll range; scrolling it moved SLOT 3 from y=728 to y=409.
4. Thirty-four "clipped" findings on the lighting tuner, the first time that
   screen was ever measured. `#lt-rail` is `display: contents` on a wide sheet,
   so it has a 0x0 rect while its children lay out normally — and the probe was
   treating it as a clipper everything escaped. The tell was in the numbers: an
   element cannot overflow its clipper by 1071px on the left AND 1413px on the
   right. A clipper must generate a box.
5. "Every checkbox in the app is a 13x13 WCAG failure" — the probe was measuring
   the `<input>`, but these are wrapped in a `<label>`, and clicking the label is
   what toggles them. The activation target is the union of the two. Correcting
   it did not make the finding go away, it made it TRUE: the real target was
   342x16, and 16 still fails the 24px floor. A miscalibrated probe does not just
   cry wolf, it hides the size of the actual wolf.

There is a matching harness lesson about ORDER. The sweep boots once per viewport
and walks the screens in sequence, so a cell can be poisoned by its predecessor:
forcing `#pmsettings.hidden = false` desynced that screen's internal state, and
every tuner cell in the sweep skipped while passing in isolation. **Reach a screen
through the app's own door** (`pause` -> SETTINGS) rather than by unhiding its
element, and add its root to `OVERLAY_IDS` so the reset closes it.

So: **before fixing a cell the grid turned red, confirm the finding by a route
that does not run the probe's code** — a script that actually scrolls the
container, or a screenshot. A probe bug and a layout bug present identically, and
only one of them is fixed in `css/`.

---

### Reading the grid

- **green** — nothing clipped, nothing off screen, no horizontal overflow, no
  page errors.
- **amber** — every finding is a control below the house `--tap` floor but at or
  above WCAG's 24px. Expected on a landscape phone, where compact rows sit
  under the touch ladder's `--tap: 52px`, and on the circuit list, whose full-width rows are spaced well apart — the
  case SC 2.5.8 explicitly allows.
- **red** — the count of real findings, tap targets under 24px among them. Hover
  for the list; `audit.json` has the element, its clipper, and how many pixels it
  escaped by.

  **`starved` is the one finding here that is not about POSITION.** Every other
  check asks whether something is in the wrong place — clipped, off screen, under
  the notch. A scroll region crushed to a couple of pixels is in exactly the
  right place: it clips nothing, it overflows nothing, it sits inside its parent,
  and until 2026-08-12 every one of those cells scored **green**.

  Three real ones, all found by eye, none by this tool:

  - `#sel-tracks` got TWO PIXELS on a rotated monitor. `js/ui/sheet-shape.js`
    exists because of it; the header of that file is the write-up.
  - `#sel-tracks` again, on a landscape phone at UI SIZE 150% — the same two
    pixels down a different path (flex shrink), while portrait scored green at
    80, 100 and 130 the whole time it was broken.
  - `#cs-options`, the garage's parts list, NINE PIXELS on a portrait phone at
    150%. A screen whose entire purpose is choosing parts, showing none.

  The shape never varies: `scrollHeight` says there is content, `clientHeight`
  says there is nowhere to put it. Both numbers were already being recorded under
  `scrollers` and nothing compared them. The floor is **44 DEVICE px**, not own
  units — this asks what a player can see and touch, so it is asked in the pixels
  their eyes are on, the same reasoning as `tinyTaps`. `hidden > 8` keeps an
  empty list out of it (that is a data state, not a layout defect), and it tests
  `overflow-y` only so a horizontal chip strip is not dragged in by its height.

  A green cell means *nothing was found*, which is not the same as *nothing is
  wrong* — it is only ever as strong as the list of questions above it. This
  check turned four green cells red on its first run.
- **skipped** — the screen could not be reached in that viewport, so **nothing
  was measured**. A skip is not a pass and it is not a finding; the reason is in
  the tooltip and the summary line counts skips on their own, with the command to
  re-run exactly those cells.

  **A click timeout is almost always the box, not the app.** The runner sets a
  12 s default timeout so an unreachable cell costs seconds instead of thirty,
  and on a loaded four-core SwiftShader machine that budget lapses on clicks that
  are fine. Measured 2026-08-12: five cells across a full matrix came back
  `page.click: Timeout 12000ms exceeded`, survived a `--jobs=1` re-run, and read
  for an afternoon like a button that could not be clicked. Probed on a quiet
  box, every one of those clicks landed in ~200 ms, and re-running the two
  viewports gave 78 cells / 0 findings / 0 skips. **Re-run a skipped cell alone
  before drawing any conclusion from it** — the same rule AGENTS.md states for a
  Playwright timeout, for the same reason.

  This was folded into the "something to look at" total until 2026-08-12, which
  made both readings wrong at once: a run with 40 skips looked like a run with 40
  defects, and once the eye learned to discount that number, a run with 5 skips
  read as clean. It cost time three times before the number was split.

A cell going from green to red between builds is a regression with an address:
screen, viewport, element, and the number of pixels involved.

---

## Layout tokens

> Merged from `LAYOUT-TOKENS.md` on 2026-11-03 (docs/plans/2026-11-03-agent-surface-reset.md §4.9, D-001); links that named that page land here.

The shared sizes every screen should use. Declared in `css/tokens.css`.
`js/ui/scale.js` writes `html[data-fold]` for foldables. A media query cannot
read a custom property, so a breakpoint that also needs `@media` repeats the
pixel value; `tests/unit/layout-tokens.test.mjs` fails if the copies drift.
The width tier reaches the DOM through CSS only: `html[data-layout]` is gone
(it called an 852/844 landscape phone
"tablet" and nothing read it).

### Spacing, type, safe area

| Token | Role |
|---|---|
| `--gap` `--pad` `--gut` | Space between controls, sheet padding, minimum edge air. Short landscape tightens all three. |
| `--fs-1` … `--fs-6` | Type scale. `--fs-micro` is the floor (14px at the base type step; the larger UI type steps raise it). Do not invent a size below it except the touch dock label floor (below). |
| `--tap` `--chip-h` `--tap-sm` `--tap-min` | Control heights. `--tap-min` is the painted 24px floor under UI SIZE zoom. |
| `--sal` `--sar` `--sat` `--sab` | `env(safe-area-inset-*)`. Notch and home indicator. |
| `--safe-t` `--safe-r` `--safe-b` `--safe-l` | Inset plus `--gut`. Use these for padding. |
| `--safe-w` `--safe-h` | Usable viewport. Width is `100svw` minus the side safe tokens; height is `svh` minus the block safe tokens, in menu-zoom units (`--svhz`). |
| `--vwz` `--svhz` | `1vw` / `1svh` divided by `--ui-scale`. Required inside a zoomed menu. |

`svh` / `svw` are the house viewport units. `dvh` / `dvw` change while the
browser toolbar moves and re-layout mid-scroll, so they are not tokens.
Raw `vh` (and the odd `dvh`) still appears in some sheet-local caps and type
or gap clamps; new rules use `svh` / `--svhz`.

### Colour (HUD)

| Token | Role |
|---|---|
| `--hud-glance` | Secondary HUD ink: `color-mix` of `--text` and `--dim` so labels stay readable on translucent plates and follow LIGHT / HIGH CONTRAST remaps (#4183). |

### Touch controls

Declared in `css/tokens.css`; consumed in `css/touch-controls.css`. The fixed
portrait/landscape ladder (`--btn`, `--steer`, `--btn-pitch`, …) stays local
because those controls are `position:fixed` with literal safe-area anchors.

| Token | Role |
|---|---|
| `--touch-label-floor` | 11px painted minimum for dock/action labels after dock zoom divides it (`--touch-label-z`, local). Allowed below `--fs-micro` so HUD zoom cannot shrink glyphs past readability. |
| `--touch-pedal-radius` | Squircle corner radius for pedal buttons (circles unchanged). |
| `--touch-tablet-btn` | Action button diameter from 744px portrait width (tablet slab; not `--bp-tablet`, which is 700px). |
| `--touch-tablet-steer` | Steer button diameter on the same portrait-tablet tier. |

`--touch-label-z` stays in `css/touch-controls.css` on the dock rule: it tracks
`--hud-z-dock` / `--hud-btn-scale` and is not a layout width token.

### Width tiers

Tiers are widths, not device names: a landscape phone is wider than `--bp-tablet`,
which is why no tier name is stamped on the document.

| Tier | Token | Min width |
|---|---|---|
| phone | `--bp-phone` | under 700px (the token itself is 480px, the small-phone ceiling) |
| tablet | `--bp-tablet` | 700px |
| laptop | `--bp-laptop` | 900px |
| desktop | `--bp-desktop` | 1440px |
| wide | `--bp-wide` | 1920px |
| ultra | `--bp-ultra` | 2200px |

`--layout-active` is the token for the tier the viewport is in, stepped from
phone up to wide (no step reads `--bp-ultra`). `--col-max`
(660px) is the widest a control column grows. Wide landscape
(`css/responsive.css`, min-width 1920px and landscape) centres the title's two columns at
that cap so a 2560-wide monitor does not pin the wordmark to the left edge.
That rule is `@layer layout`, ordered after `@layer responsive`, because the
live title's column tracks are set in `css/menu-destinations.css`. 1440×900
is the title desktop golden and stays on the older rule.

```css
width: min(100%, var(--col-max), var(--layout-active));
padding: var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l);
```

### Foldables

Chrome 138+ reports a folded dual-pane screen as
`horizontal-viewport-segments: 2` or `vertical-viewport-segments: 2`
([Viewport Segments API](https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API/Using)).
An open, flat foldable is one segment; the width tiers cover it.

| Token | Meaning |
|---|---|
| `--seg-w` `--seg-h` | First segment. Fallback: the whole viewport. |
| `--fold-gap` `--fold-gap-y` | Hinge thickness. Fallback: 0. |

`css/responsive.css` keeps `#overlay` and `.screen` on the first segment
when two exist. `html[data-fold]="horizontal"|"vertical"` is the same answer
for a rule that cannot use the media feature. One screen matches neither,
so the value stays unset.

### Menu fit caps

Shared overlay and sheet widths. Three are declared on `:root` in
`css/tokens.css` and read by `css/dialogs.css`, `css/select.css` and
`css/settings.css`; two are local to the title's 1680px-and-up rule in
`css/menu-destinations.css`. `tests/unit/layout-tokens.test.mjs` locks the
width-tier copies only — fit caps are asserted where a unit test pins the
consuming rule.

| Token | Declared in | Role |
|---|---|---|
| `--menu-fit-sheet` | `css/tokens.css` | Results, standings, circuit select and Settings sheet cap on large monitors (1180px) |
| `--menu-fit-sheet-wide` | `css/tokens.css` | Results, standings and circuit select on ultrawide (1360px) |
| `--menu-fit-pause` | `css/tokens.css` | Pause menu sheet cap (480px) |
| `--menu-fit-brand` | `css/menu-destinations.css` (`#overlay`) | Title wide brand column (34rem) |
| `--menu-fit-doors` | `css/menu-destinations.css` (`#overlay`) | Title wide door column (40rem) |

Every other sheet cap (the Data Hub card, the garage sheet floor and caps, the
car reserve, the Photo Studio dock, the compact utility tile floor) is still a
literal in its own sheet. Naming them is the next migration; until a token is
declared it is not listed here.

---

## UI experience and studio acceptance contract

> Merged from `ui-experience-studio.md` on 2026-11-03 (docs/plans/2026-11-03-agent-surface-reset.md §4.9, D-001); links that named that page land here.

APEX's UI combines a team paddock home, clear race preparation, broadcast replay
controls and an appearance/photo studio. This document defines the agreed
experience and its acceptance checks. It is a product and engineering contract;
an unchecked criterion is not a claim that a feature has shipped or passed.
Current architecture and navigation remain documented in [UI-MAP.md](UI-MAP.md),
[ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

### Visual direction

The three concept references show a garage scene beside a readable home action
panel, an appearance workspace with preset/profile controls beside a large
preview, and a broadcast replay with persistent transport under the action.
Their composition and hierarchy are the target: car and team atmosphere, one
obvious next action, stable information surfaces and progressive detail. The
main home/garage background must render APEX's actual in-game 3D car and garage
assets. Generated concept photographs are not runtime backgrounds or fallback
assets. The existing static SVG can remain an optional static/recovery look;
personal photos are a separate optional background choice. Photorealism,
illustrative brand marks and exact concept button count are not promises.

Dark surfaces, a restrained accent, clear type and consistent spacing carry
across screens. Light theme and high contrast receive the same deliberate
treatment. Decorative scenes must never determine whether a user can read a
button, finish setup or leave a dialog. Phone layouts retain the same actions in
a single useful reading order rather than shrinking desktop columns.

Existing depth is the foundation: live 3D Garage and arrivals, tuners, title
layout controls, standard/minimal/broadcast HUD profiles, reduced motion,
per-screen appearance, career saves, telemetry, replay seek/director/PIP and
photo free camera. Improvements expose and connect these capabilities.

### Acceptance matrix

Each row describes observable behavior and the current source seam to preserve.
Use deterministic state/DOM checks for behavior and screenshots for visual
review. Rendered verification belongs to the root verification process; do not
run a second browser process to check these rows.

| ID | Area | Required behavior and useful checks | Existing source seam |
| --- | --- | --- | --- |
| A1 | Appearance presets | Preset cards show a selected state and a meaningful sample. A preset changes appearance settings coherently; driving, career and audio state are untouched. | `js/ui/appearance-opts.js`, `js/ui/screen-looks.js`, `css/tokens.css` |
| A2 | Named profiles | Save/load/delete profiles preserves valid appearance values across reload. Invalid or older stored fields safely fall back. A profile's name is treated as text. Built-in choices remain recoverable. | `js/core/store.js`, appearance modules |
| A3 | Scope | Global versus current-screen scope is visible. Changing one screen does not silently change another. Reset explicitly identifies and clears its scope; inherited versus overridden values remain understandable. | Screen looks and title/pause/selection options |
| A4 | Preview and undo | Home, Career, Race Setup, HUD and Popup examples use the effective theme, accent, scale, density and contrast. Preview/device changes do not mutate a career or start a race. Undo/Revert restores the stated snapshot; live autosave versus unapplied draft is clearly identified. | Appearance controls and existing live per-screen previews |
| A5 | Accent ink | Named, custom, pale and team accents produce readable text on filled buttons, selected cards and chips in both themes. Menu and HUD accents stay independent. Tyre/flag/sector colors retain their racing meaning. | `AppearanceOpts.pickInk` behavior, `css/tokens.css`, `js/ui/hud.js` |
| A6 | Motion | Effective OS/app reduced motion governs CSS and JavaScript arrivals, ambient camera/sky, part focus and result reveals. Motion Off is stable. Essential replay/racing continues; Skip remains available for cinematic sequences. | Appearance/motion preferences, view transitions, garage arrival, render loop |
| H1 | Home scene | Selected team/car is consistent with Garage. Home supports Garage, Night garage, Studio, Circuit and Pit lane, plus Mix environments. Auto camera varies Hero/Front/Side/Rear each Home visit; fixed angles persist in appearance profiles. These use actual in-game 3D assets through the existing renderer seam, not generated photography. The existing SVG/static look provides an optional legible recovery path. Menu actions remain usable before scene compilation completes. | `js/ui/title-menu.js`, `js/game.js`, `js/garage/scene.js` |
| H2 | Scene lifecycle | Leaving/reopening home, rotating or changing scenes avoids duplicate loops/resources and stale presentation. Photo keeps the chosen environment and angle through composition; a later Home visit advances Mix once. Hidden documents stop unnecessary visual work. Menu/studio preview never advances race physics or changes the next event. | Game render/tick separation, renderer readiness, visibility lifecycle |
| H3 | Home doors | Watch Real Races, Practice and Photo Studio are discoverable. Existing conditional Continue, multiplayer, season and controller doors remain reachable. Continue identifies the save/mode and next event. | Title action wiring and career summary |
| W1 | Transport | WATCH visibly exposes play/pause, speed, followed driver and camera/director state. Pointer, touch and keyboard operate the same underlying replay. Controls do not accidentally become driving inputs. | `js/race/real-replay.js`, `js/race/broadcast.js` |
| W2 | Timeline and events | Seek is bounded; current time/lap updates after seeking. Previous/next moment and event markers derive from available race events. Empty/no-events/end states remain useful and do not invent incidents. | Real replay seek/skip and race-book events |
| W3 | Follow ownership | AUTO, temporary manual selection and FOLLOW LOCK are understandable. Lock prevents automatic retargeting; returning to AUTO restores existing director behavior. Driver/camera/timing tower selections agree. | Existing director manual override and selected-driver state |
| W4 | Race invitation and data | Watch/Drive routes clearly distinguish selected driver, distance and trace availability. Large position downloads retain focus, scroll and expanded rows. Progress/failure/retry is visible; cached/stale/historical context remains explicit. | `js/data/real-race-tab.js`, `js/data/hub.js` |
| W5 | Telemetry guidance | Comparison shortcuts configure existing channels and lane roles. Reference/compare roles are explicit; existing full traces, speed markers and cross-session behavior remain available. No unavailable metric is fabricated. | `js/data/telemetry.js` |
| G1 | Part focus | Selecting a category/part frames and identifies its relevant physical region. Reduced motion uses an immediate or static equivalent. Manual camera controls and reset still work; no permanent debug highlight remains. | `js/garage/setup-sheet.js`, setup camera and car mesh |
| G2 | Fit feedback | Fitted/owned/research states and before/after stats/cost stay truthful. Focus/highlight cannot purchase or fit a part on its own. Contextual Done clearly names Race Setup or the actual destination. | Part economy and Garage opener/Done flow |
| G3 | Facility atmosphere | Visible facility/achievement dressing reflects the active career and valid facility state. Loading a different save removes stale dressing. Free-build and unavailable facility states degrade cleanly. | Career facilities, Garage scene |
| C1 | Career brief | Next event, funds, objectives and pending signing/offers are visible before dense management. The primary action follows career state; recovered/conflicted/unsaved saves remain correctly communicated. | `js/career/career-ui.js`, `docs/CAREER.md` |
| C2 | Career sections | Calendar, car/development, team and season record reduce scrolling without hiding wages, sponsor, regulations, slots or backup controls. Navigation/focus order follows the displayed sections on desktop and phone. | Existing Season Hub and native dialog root |
| C3 | Season story | Timeline/milestones derive from existing rounds, results, contracts and regulations. Unplayed rounds are visually distinct from completed ones; empty/new seasons remain clear. Selection opens appropriate existing detail. | Career history/calendar/season state |
| C4 | Result explanation | Personal result, gains, penalties, stints, awards and championship/career settlement are grouped clearly. Reveal motion happens once and respects reduced motion. Required settlement/next action remains reachable and existing results Escape restrictions remain intact. | `js/ui/results-sheet.js` |
| P1 | Pause brief | Circuit, lap, position and current race status reflect the paused session. Resume remains dominant. Strategy, Practice and Debrief doors open the intended existing controls directly and return predictably. | Pause markup, Driving settings, coach/pit/journal |
| P2 | Context and Back | Pre-race mode/circuit/car context survives nested dialogs. Back/Close describes or reaches the actual origin, including title versus pause, Garage versus picker and nested Data Hub comparisons. | `js/ui/modal.js`, `js/ui/settings-tabs.js`, opener callbacks |
| P3 | Dialog/save grammar | Native modal focus/inert behavior remains. Closing returns focus to the originating control where possible. Autosaved preferences, draft setups and explicit livery saves are labeled consistently; destructive inline confirmation states have clear consequences and disarm behavior. | Modal wrapper, save/import/delete and livery/season flows |
| F1 | Photo composition | Existing free camera gains useful aspect/frame/grid choices and a clear creation entry. From Home, a SUBJECT row switches between the garage car and the free camera on the circuit for that visit; the stored Home scene is not changed. Framing guides are UI-only; exported crop matches the selected aspect. Exit restores prior pause/replay/HUD state and camera ownership. | `js/camera/photo-cam.js`, `js/camera/free-cam.js` |
| F2 | Image export | Capture uses the current presented backend frame; export produces a nonblank image with the intended scene/crop and no composition controls. Busy/failure/success feedback is honest. Export does not globally change renderer retention or graphics quality. | `js/render/gfx.js`, software present seam, capture integration |
| F3 | Photo background | Set as Background stores a bounded image and a durable reference, survives reload when storage succeeds, and falls back safely if missing/evicted. Reset/remove releases image resources and does not clear unrelated settings or saves. | Appearance scene choice, `js/core/store.js`, local image storage |
| X1 | Responsive/input | Essential actions are reachable at phone widths, landscape, desktop and large text/UI scale. No two-direction scrolling is required for settings. Touch/pad/keyboard focus and safe areas remain supported. | Existing layout tooling, SettingsNav and menu input |
| X2 | Recovery | Renderer/storage/API failures offer useful task-specific feedback and recovery while preserving context. Existing session-only and stale-data behavior remains truthful. Contributor Export remains accessible with a clear purpose. | Renderer picker, GameStore, Data Hub error handling |

### Browser API contracts and integration risks

#### Capture the presented image

`HTMLCanvasElement.toBlob()` defaults to PNG, can call its callback with `null`,
and can throw `SecurityError` if the canvas is not origin-clean. Treat all three
outcomes explicitly. A `download` attribute is a request to download and a
suggested name; it is not evidence that the browser wrote a file.

WebGL's drawing buffer may be cleared after compositing. Capture immediately
after drawing or enqueue capture in the existing render loop. Globally enabling
`preserveDrawingBuffer` prevents possible optimizations and is not required for
a properly timed capture. Calling a draw helper for capture must not step
physics, advance a replay or alter camera state.

APEX also has asynchronous/software presentation. Select the actually presented
surface and respect backend readiness, including `awaitSoftPresent()` and
`#game-soft` where applicable. A nonzero main-canvas size alone is not proof of
a fresh rendered frame. Backend boot/capture evidence remains subject to the
renderer rules; a software capture does not establish real-device performance.

#### Bound image lifetime and storage

IndexedDB accepts image `Blob`s directly and is suitable for image payloads;
small appearance metadata remains in the existing `apex26.*` preference store.
Do not persist an object URL as a permanent reference. A transaction's `complete`
event establishes successful commit; a request's `onsuccess` does not by itself
establish transaction completion. Handle open/blocked/error/abort/quota outcomes
and only report durable storage after the transaction commits.

Browser storage is best effort by default and may be cleared or evicted. A missing
stored image needs a deliberate default background. Avoid replacing a valid
background reference before the new image is available. If image import is
asynchronous, ignore obsolete completions after the user resets or selects
another image.

`createImageBitmap()` supports decoding and resizing, including orientation
options. Close decoded bitmaps after use. Object URLs retain their backing
objects until released; revoke them after removal/replacement or when export
consumption is safely finished, rather than before a preview or download can
use them. Bound imported image dimensions and output size to avoid turning a
single background choice into unbounded CPU/memory work.

#### Motion and performance

`prefers-reduced-motion` reports an operating-system preference for reducing
nonessential motion. Apply the effective preference to JavaScript scene/camera
animation as well as CSS. Background-motion controls and cinematic Skip are
separate useful controls. WCAG 2.3.3 is **AAA** and concerns interaction-triggered
animation; automatically initiated moving content is addressed separately by
2.2.2. This contract does not claim whole-product WCAG conformance.

Use `transform` and `opacity` for short UI transitions where appropriate, and
measure repaint/layout work before animating other properties. Stop unnecessary
ambient updates when `document.visibilityState` is `hidden`. Preserve the
existing renderer governor and fallback behavior; proposed home imagery is not
a reason to invent frame-rate or device-performance claims.

### Research provenance

The source facts below informed the design and API contracts. The acceptance
matrix is an APEX proposal, not a claim that these references implement APEX.
Public sources were read on 2026-10-01.

| Source | Verified fact used |
| --- | --- |
| [GT7 Garage manual](https://www.gran-turismo.com/us/gt7/manual/home/01) | Garage includes movies of the current car alongside settings/collection. |
| [GT7 Scapes manual](https://www.gran-turismo.com/gb/gt7/manual/scapes/01) | Curated locations, favorites, random picks and time/weather filters. |
| [GT7 settings sheets](https://www.gran-turismo.com/us/gt7/manual/carsettings/02) | Named, duplicated and applied saved settings sheets. |
| [Forza visual accessibility](https://support.forza.net/hc/en-us/articles/46524064744851-Forza-Motorsport-Accessibility-Support) | Independent menu/HUD scale/contrast, UI/world colors and moving-background control. |
| [F1 Manager broadcast presentation](https://news.xbox.com/en-us/2023/07/27/f1-manager-23-launches-july-31/) | Timing tower, incident replay and immersive broadcast cameras. |
| [Xbox UI navigation guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112) | Consistent control placement, logical focus and digital-input navigation. |
| [Xbox motion guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/117) | Pause/disable background motion and optional opaque surfaces behind text. |
| [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) | PNG fallback, null callback, origin-clean requirement. |
| [WebGL screenshot timing](https://webglfundamentals.org/webgl/lessons/webgl-tips.html) | Capture after draw or inside render loop; retained buffers prevent optimizations. |
| [Canvas context attributes](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext) | Context acquisition and `preserveDrawingBuffer` meaning. |
| [Anchor download](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement/download) | Download intent/name does not establish actual download completion. |
| [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) and [transaction completion](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event) | Blob storage and successful commit semantics. |
| [Storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | Best-effort storage, quota errors, private browsing and eviction. |
| [ImageBitmap decoding](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) and [close](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close) | Resize/orientation options and decoded resource disposal. |
| [Blob URL lifetime](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob) | Backing-object retention, explicit revocation and premature-revocation pitfalls. |
| [Reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) and [WCAG 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | OS preference and exact scope of interaction-animation guidance. |
| [Animation performance](https://web.dev/articles/animations-guide) and [visibility lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event) | Compositing-friendly properties and stopping hidden-page tasks. |

### Validation record

The focused unit suites check visual-only profile scope and persistence,
contrast ink, effective reduced motion, camera ownership/restoration, replay
seek and follow lock, asynchronous photo capture/storage, career-derived
calendar/facility data and practice-versus-race result scoring. Home framing
projects the real car silhouette at desktop, landscape phone and portrait phone
sizes. The front Home camera stays inside the doorway; circuit and pit-lane
subjects use the free menu pane. Native Garage camera presets keep their own
framing and controls.

Rendered browser checks cover changing/fixed Home angles, mixed environments,
actual garage preview capture, circuit/pit-lane backgrounds, PNG download,
Photo Mode return paths, readable Appearance presets and landscape phone
layouts. Browser evidence and verdicts belong in `artifacts/ui-experience/`
and `artifacts/logs/`; the six static menu identity snapshots deliberately hide
the renderer. Generated concepts are design references only.

The Appearance examples represent the selected theme and screen; the native
advanced controls provide exact layout previews. Circuit/pit-lane thumbnails
do not reuse a stale garage capture. Software-rendered screenshots establish
composition and capture behavior, not performance on a player's GPU. Live
OpenF1 download/retry behavior and full remote browser groups need separate
coverage; a visible Watch entry or a replay fixture does not establish a live
API result. The acceptance matrix above remains a checklist, not a blanket
claim that every criterion has passed.
