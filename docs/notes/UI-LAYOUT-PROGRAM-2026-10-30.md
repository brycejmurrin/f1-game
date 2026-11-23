# UI layout program — measure, adapt, customize (2026-10-30)

Bryce (2026-10-30): "Let's go deeper with ui work, consider layouts options improve our tools to measure and adapt
and customize." The profile is Bryce's own: iPhone landscape 844×390, touch, three.js on WebGPU.

Inputs: the flow hunt `docs/notes/UI-HUNT-FLOWS-2026-10-29.md` (12 findings; 1–4 and 6–9 already fixed by
`c8249e9c`, `01b02b90`, `c79ae672`), plus two read-only surveys run on 2026-10-30. Their findings are summarised
below, with file:line anchors on the tree at `9b915ca0`.

## What exists

**Customization.** It comes from three systems.

- `ScreenLooks` (`js/ui/screen-looks.js:156-250`) gives eight screens core knobs `w, density, btn, corners, dim,
  head` plus per-screen extras, written to `data-look-<screen>-<k>` and applied live.
- Separate title (`js/ui/title-layout.js`) and pause (`js/ui/pause-opts.js`) layouts.
- The HUD move-and-size editor (`js/ui/hud-layout.js`) with presets per camera set.

The UI/HUD/button scale (`js/ui/scale.js`) goes from 40 % to 200 %. `SettingsExport` saves every key to a file,
and loading one reloads the page.

**Adaptation.** `SheetShape` (`js/ui/sheet-shape.js`) measures each sheet and writes `data-shape` / `data-density`
/ `data-fit`. `UiScale` writes `data-layout` tiers. The CSS has about 273 `@media`/`@container` rules in 29 files,
and its short-landscape bands cluster at max-height 500 px. Only a few screens have a dedicated short-landscape
layout (dialogs, title destinations, watch transport, appearance studio, photo studio, editor); the rest shrink.

**Measurement.** Three tools measure static geometry: `layout-audit` (clip, offscreen, tap floors, starved
scrollers, maps), `menu-mock` and `fit-audit`. `explorer` covers missions, a11y and roundtrip.

## Gaps this program closes

| # | Gap | Track |
|---|---|---|
| G1 | The overlay reset hides layers with `hidden = true` instead of closing them. `layout-audit` was fixed in `c79ae672`; `menu-capture.resetToTitle` (`tools/ui/menu-capture.mjs:118-140`, used by `menu-mock` and the gallery), `menu-mock.leaveToMenu` (`:122-143`) and `menu-fit` still desync `DataHub`'s `openFlag`. `OVERLAY_IDS` lacks `rotate-device` / `ios-install`. | measure |
| G2 | Tap floors are defined three ways (layout-audit: body `--tap` + WCAG 24; menu-mock: 44/24; fit-audit: 44/24), so results from different tools don't compare. | measure |
| G3 | No tool measures interaction FLOWS. Missing: double-tap bleed per door, focus return after close, Escape and browser back, settings persistence across reload, rotation round trip, a search box that survives close. These are the 2026-10-29 hunt's probes, which were never committed. | measure |
| G4 | No tool checks that a customization knob changes the picture. A knob value that renders identically to the default is dead (cf. Bryce's "they all look the same"). | measure |
| G5 | No thumb-reach or layout-efficiency score. At 844×390 a two-thumb grip reaches the side edges and the bottom band easily and the top centre badly; nothing scores where a screen's primary action sits, or how much area is dead. | measure |
| G6 | Theme is not an axis: `layout-audit` hard-codes `colorScheme: "dark"` (`tools/ui/layout-audit.mjs:704`). | measure |
| G7 | Open hunt rows: #5 Settings search query survives close; #10 Data Hub ✕ unreachable by D-pad; #12 Career focused control off-screen after rotating. | adapt |
| G8 | The knob vocabulary is inconsistent. `side` takes four value sets (`auto/swap`, `centre/left/right`, `right/left`, `shipped/swapped`); `rows` means row height, strip rows or table rows; `density`/`dim` are missing on some screens. | customize |
| G9 | There is no whole-UI layout preset ("thumb", "compact", "broadcast") that applies live. The only bundle is a settings file, and loading it reloads the page. | customize |
| G10 | Most screens have no dedicated short-landscape layout; they shrink to fit. | adapt |

## Plan

1. **Tools (this PR).**
   - One shared reset that closes each layer through its own door / module close and verifies the title (G1).
   - One tap-floor definition shared by the three tools (G2).
   - a new flows CLI (planned name flows.mjs): the interaction probes as a repeatable matrix with `--diff` (G3).
   - a new look-diff CLI: each ScreenLooks knob value against the default, pixel-diffed (G4).
   - a new reach-score CLI: thumb-reach and dead-space scoring over layout-audit's DOM dump (G5).
   - A `--theme` axis in layout-audit (G6).
2. **Adapt.** Fix G7's three rows (small, separate PR).
3. **Customize, Bryce picks.** Run the new tools over every screen at 844×390. Publish ONE living gallery of
   layout options per screen, each option visibly different in the picture, with reach scores. Bryce picks
   per screen, then G8/G9/G10 land against his picks.

Not in scope: the in-race HUD (another lane owns it), and renderer work.
