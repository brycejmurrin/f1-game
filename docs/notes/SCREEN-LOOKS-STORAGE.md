# Existing per-screen appearance storage

Kind: design
ScreenLooks: one engine for every per-screen fold under SETTINGS ›
APPEARANCE (PAUSE MENU's extra knobs, DATA HUB, TRACK SELECTOR, RACE SETTINGS,
CAREER, GARAGE, POPUPS) and the see-through PEEK every fold previews with.

Self-wiring like js/ui/pause-opts.js: GameStore at eval (HARD_EDGES), no G
façade and no line in js/game.js. SettingRow, SheetShape, PauseOpts, TitleFx
and Tracks are read when called, never at eval.

THE REGISTRY IS THE CONTRACT. SCREENS lists each screen's knobs; css/ keys
off what apply() writes, and tests/unit/screen-looks.test.mjs checks every
non-default value and every range token has a rule:
  - an enum knob at a non-default value  → <html data-look-<screen>-<k>="<v>">
  - a range knob off its default         → inline --look-<screen>-<k> on :root
    (v / 100 unitless, or "<v>%" for token:"pct") AND a presence attribute
    data-look-<screen>-<k>, so a rule matches only while it is custom.
At its CSS base (`def`) a knob writes NOTHING, so the desktop's shipped
screen is the absence of every attribute and token. A PHONE (touch, short
side <= 500 px) ships its own value for the knobs that carry `phone`
(#5358, the owner's 2026-11-10 profile at UI SIZE 70 %): shipDef() is what
an unset knob reads there, and apply() stamps it like any value off `def`. Nothing here paints on first frame (only the
title screen does, and TitleLayout / TitleFx own it), so there is no boot
copy in index.html: apply() runs at eval, before js/game.js can open any of
these screens.

STORE: one object per screen, apex26.look<Screen> (lookPause, lookDatahub,
…), holding only the knobs off their defaults; all-default stores null.
normalize() drops unknown keys, checks enums and clamps / snaps ranges, so a
hand-edited value reads as shipped.

PEEK: the settings page is a modal in the top layer, so whatever screen a
fold describes is hidden underneath it — or not open at all (settings opens
from the title screen or the pause card). While a knob changes,
<html data-appearance-peek="<screen>"> fades the settings page to a ghost and
css/responsive.css (@layer overlays) DISPLAYS that screen behind it, without
ever touching its `hidden` / `open` attributes: TopModal, UiLayers,
SheetShape and input gating all key on those, and none of them should
believe the screen opened. A screen that is empty because it was never
built this session gets a STAND-IN (existing classes, aria-hidden, removed
when the peek ends). A peek ends on its timer, Esc (consumed — it does not
also close SETTINGS), the gamepad's cancel, a tap outside the fold, the
settings page hiding, or the tab hiding. The PEEK button holds one until
dismissed, for keyboard and screen-reader players.

## Settings backup

SettingsExport: SETTINGS › SAVES & DATA,
which carries a player's state OUT of the browser and back IN. THREE files,
deliberately separate:

  SETTINGS  preferences, tuners and control bindings — how you like the game
            to behave. CHANGED lists only what differs from the shipped
            default, each with the default it replaced and the source file
            that owns it, so "make my settings the defaults" is a list of
            edits rather than a hunt; ALL lists every key's effective value.
  GARAGE    parts, liveries, setup sheets and an invented team — what you
            BUILT. A new phone wants the first file; a friend wants the
            second.
  CAREER    the six save slots (driver.0..2, myteam.0..2) and the live
            slot pointer — what a long championship is. Mounted from the
            CAREER MODES screen the way GARAGE injects its row, so shell
            node count does not grow.

Loading any one overwrites what is stored and reloads the page, so the
button asks twice. SETTINGS may carry time-trial leaderboards in an optional
`ttlb` section (merged on import, never overwriting blindly). GARAGE and
SETTINGS still never carry career or season saves, ghosts, replays, or anything
account-shaped, in either direction.

SPEC below is the allowlist — every player-facing preference, tuner and
control binding under the `apex26.` prefix, grouped the way SETTINGS is.
Nothing else is ever read: the garage (parts, liveries, setup sheets, MY
TEAM), saves (career, season, ghosts, replays, daily bests), accounts
and network (Spotify tokens, TURN credentials, relays) and the renderer's
self-healing latches stay out by construction, and the unit test asserts
that a poisoned store leaks none of them. Two lanes, like the store: `json`
values went through store.set (JSON), `raw` values are the bare strings the
settings panels keep with store.rawSet ("1"/"0", ids).
SettingsExport.create(G) is wired from js/game.js; `collect(mode)` is the
pure half (__apex.settingsFile). Consumes GameStore, GameAudio,
GfxQuality, Input when present.

## Race HUD

HudLayout: move and size each race HUD element, as a player
setting under SETTINGS › DISPLAY › HUD › MOVE & SIZE.

Explicit entries own their geometry: finite screen-share X/Y offsets and
a positive SIZE percentage. Untouched widgets retain the automatic layout.
Manual widgets use stable homes and global HUD zoom, independently of the
adaptive bands; bottom instruments leave the transformed flex/grid cluster.

HUD STYLE × CAMERA SET keeps independent layouts for STANDARD / MINIMAL /
BROADCAST and COCKPIT / HELMET / OTHER. apex26.hudLayout stores:
{v: 4, standard: {cockpit: {id: {x, y, s}}, helmet: {…},
other: {…}}, minimal: {…}, broadcast: {…}}.
An explicit entry remains manual even at shipped values. RESET removes the
entry and restores its shipped automatic layout, which need not be zero.

Older layout formats start from the shipped automatic layout.
The live camera/style selects the race layout; the settings fold previews
and edits its chosen set without changing other saved layouts.

HIDDEN ELEMENTS: hiddenReason(id) says why an element is not on screen in
the current mode (MINIMAL, a LAYOUT, a broadcast camera, the cockpit wheel,
TYRE WEAR off, MAP/GAPS off, a per-element toggle) so the fold can grey out
sliders that would move nothing — from the classes that hide it while the
HUD is up (live element has the last word: display none / hidden / zero
rect), or from the store / fold preview under SETTINGS where those classes
lag. A "soft" reason is one a move cures (a touch cockpit shows a chip the
player places) or a chip that only appears on an event: its sliders stay.

PRESETS are pure data (PRESETS): a partial {id: {x?, y?, s?}} laid over the
edited set's shipped layout, so CLEAN in the cockpit keeps the chips beside
the wheel. Applying one writes the set and can still be tweaked; a set that
matches no preset reads CUSTOM (presetOf).

PEEK: the race HUD is hidden under the settings page, so a slider would
move things nobody can see. While a slider is held (or just moved),
js/ui/screen-looks.js's html[data-appearance-peek="hud"] ghosts the page
and shows the HUD with the selected element outlined. Only in a race.

Needs GameStore at eval (HARD_EDGES). ScreenLooks is read at call time.

## HUD editing

Apex 26 — HudArrange: ARRANGE HUD, the on-screen editor for MOVE & SIZE.

The numeric editor (js/ui/hud-layout.js, SETTINGS › DISPLAY › HUD › MOVE & SIZE)
edits one element at a time behind a settings sheet. This is the
same setting edited by hand: a button on the pause card, every HUD element
gets a dashed outline, DRAG moves it, a PINCH (or the toolbar's − / +) sizes
it, and a pair of elements — or an element and a touch control — that overlap
turn red. It writes the offsets HudLayout already stores (x / y as a share of
the screen in %, s as a percent, per HUD style and camera set), so presets,
RESET and camera sets keep working; explicit placements bypass automatic fitting.

Mirrors DockLayout's REPOSITION editor: entering hides SETTINGS and PAUSED
(showModal dialogs make the rest of the document inert, so a drag could not
start), a floating toolbar ends it; so does Escape, or any dialog opening
while it is on. Pointer events are taken in the CAPTURE phase so a press on
a piece over GAS never reaches the pedal (THROTTLE = LATCH would launch the
car on RESUME).

Pieces the race hides until something happens (the radio card, the caution
flag, the LIMITS chip, DAMAGE) are shown with sample content while
arranging and put back exactly as they were on exit.

## HUD geometry measurements

SHIPPED per set — what RESET returns to. The wheel covers roughly the middle 40% of the width (30..70vw) and the bottom 45% at 16:9, so the strip moves 30vw out from the centre line: centred at 20vw / 80vw, a 130px bar spans 104..234px at 844 wide (wheel from 253) and 319..449px at 1920 (wheel from 576). ENERGY/TYRES (seconds and laps) go left; OVERTAKE/AERO — the readouts for the right-hand buttons — go right, raised more because they are the bottom of the stack: level with the left pair at phone landscape, and clear of the pedal/shift row the touch docks keep in both bottom corners. PER STYLE the strip is the same: every style keeps the bottom band centred (BROADCAST moves only the TOWER, top-left, and parks map + gaps under it), so the wheel is the only thing to clear. MINIMAL hides ENERGY / OVERTAKE / AERO / BRAKE BIAS, which leaves TYRES alone at its shipped spot. They are three entries rather than one so a style can diverge without a migration.

HELMET — the VISOR HUD (js/camera/cam-groups.js HELMET_LAYOUT): the same wheel, but nothing is left to its LCD. DESKTOP: the cockpit strip plus GEAR and SPEED stacked left of the wheel above ENERGY / TYRES (1280x720: gear x-30 y-20 → fit() pins it at the left edge, 4..266 y438-503; speed 123..210 y366-413; ENERGY from y577 — measured by the hud-survey helmet cells, docs/notes/HELMET-VISOR-HUD-2026-10-05.md). TOUCH (HELMET_TOUCH, read through shippedEl while body lacks .desktop): the steer and pedal columns sit beside the wheel, so ENERGY stacks in the left bottom strip above TYRES (css/hud.css anchor-positioning on helmet touch — the old y-37 centre lift read as an ERS pill floating mid-visor, 2026-10-07). TYRES stays in the left corner between STRATEGY and the steer buttons: y-2 is 232..273 at 844×390 dock zoom 0.865. GEAR takes the LCD's place and SPEED sits right of it; only OVERTAKE / AERO / BRAKE BIAS stay with the touch buttons that carry them (css/track-detail.css, the helmet touch hide).

GEAR and SPEED on a touch helmet replace the LCD: the gearbox chip sits where the wheel's screen is (the chase row's own centre, one step down), SPEED sits right of it and one step up, clear of ENERGY and AERO (the owner asked for the chip on the visor, 2026-10-05; the opaque pill covers the LCD's speed digits, so SPEED stays).

BIG: tower/map grow in the top band; gaps stay between map and tower (x+7 clears the grown map without meeting the tower); gearbox x-32 y-18 s:115 sits left and above the TYRE row (detached home is bottom:12; y-12 still clipped TYRES by ~14px at 1280) and clear of SPEED at 1280 and 1920. CORNERS: gearbox x+38 y-18 is the right corner ABOVE the chip row; ENERGY x-32 and TYRES x-44 take the vacated left strip (both forced to 130px wide under data-hl-v4; x-42 still kissed ENERGY by 2px at 1280) clear of the reflowed SPEED / BB row at both widths.

## Touch dock and phone wheel coordinates

Each steering scheme in `apex26.dockLayout` keeps its own left and right dock positions. Offsets are signed fractions of the viewport after subtracting safe insets. Zero means the shipped position, positive X moves toward the centre and positive Y moves up. The editor measures the visible controls when it limits travel and compensates for effective CSS zoom. A legacy pair of offsets still loads. Optional fields store arrow spacing, driving layout and individual control overrides by button ID. An omitted field follows the normal layout or global button size and shape. Settings files and combined Appearance profiles can restore those choices. Reset Dock Layout clears overrides for the current steering scheme.

The landscape phone wheel stores button offsets as viewport percentages in `apex26.padLayout`. Apply commits the wheel draft. Pairing and menu-pad regions use the shared orientation-specific `apex26.screenPlacement` store on the controller device.

## Menu text and button dimensions

In Appearance, select a screen, choose Arrange, pick a region, and open Controls. Text size adjusts the region’s typography relative to the global accessibility setting. Button width uses a percentage of the space available in its container. Button height sets a minimum in CSS pixels so a wrapped label can grow taller. The separate Width, Height and Scale controls apply to the whole region.

Apply saves the current drafts in the existing orientation-specific `screenPlacement` record. Older records inherit the shipped text and button sizes. Reset region restores that region in the current orientation. Reset screen covers both orientations. Home text and buttons shares this storage while Arrange Home owns title geometry.
