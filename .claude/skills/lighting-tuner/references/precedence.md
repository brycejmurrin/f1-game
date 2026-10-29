# Lighting precedence, layers and fan-out

## Precedence, lowest → highest (a later layer wins)

1. `TUNE_DEFS.def` (`js/lighting/knobs.js`)
2. shipped `js/lighting/presets.js` `"*"`
3. shipped `"*|tod|wx"` (shared stamp, e.g. `"*|night|dry"`)
4. shipped `"track|tod|weather"`
5. shipped `"*|tod"` — only when `gfx.hasPerChunkLights` (all presets/device classes)
6. localStorage `"*"`
7. localStorage **`track|tod|weather`**

`__apex.lightTune()` reads the resolved knobs; `lightTune({ id: value })` sets one live.

## Which layer to edit

- One-track complaint → that track's `"<id>|tod|wx"` row.
- `"*|tod|wx"` stamp or `lightCopy()` → EVERY circuit; only for a fleet complaint, named in the PR.
- Just one number to change, no blob → edit that one key by hand in `presets.js`; never hand
  `bake.mjs` a one-key object (it is a FULL REPLACE).
- `applyRaceSettings` (`js/lighting/atmosphere.js`) only for STRUCTURAL changes.

## localStorage and live sliders

Live slider edits write the **current condition** key (`LightStore.set` → `profiles[key()]`), not
global `"*"`. localStorage (`apex26.lightTune`) outranks shipped presets — RESET in the LIGHTING
TUNER drops the current track/tod/weather back to shipped. Legacy `"*"` profiles may still win;
clear that key if a global override sticks.

## One condition, every circuit

`__apex.lightCopy()` spreads knobs tuned here (merged) across `Tracks.LIST`; `lightCopy("look")`
sends every live value. Both persist and return `undo` — `lightCopy({undo})` reverts the fan-out.
