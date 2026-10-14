# The TRACK DESIGNER — player-built circuits (`js/editor/`)

The designer authors a CUSTOM circuit, not a `js/circuits/<id>.js` def: a saved
design is a closed control-point loop stored under `apex26.customTracks`
(`CustomTracks`, key `customTracks`), rebuilt through `TrackDef.fromRaw` and
appended to `Tracks.LIST` with an id `custom-<fnv1a hash>` and `custom: true`.
The player guide is `docs/TRACK-DESIGNER.md`; the HOW TO tab text is
`TrackDesigner`'s `HOWTO` table in `designer.js`.

## Load order (`tools/manifest.cjs`)

- FULL (boot): `track-themes.js`, `props.js`, `custom-tracks.js` — so a stored
  custom `trackId` resolves at boot.
- `LAZY_EDITOR` (behind the title-menu TRACK DESIGNER door,
  `CustomTracks.ensureEditor()`), in order: `shape.js` → `stamps.js` →
  `randomise.js` → `validate.js` → `insight.js` → `fixes.js` → `codec.js` →
  `scenery-preview.js` → `canvas.js` → `elev-presets.js` → `profile.js` →
  `selection-panel.js` → `scenery-panel.js` → `designer.js` (last; reads every
  module above at init). Most destructure `TrackShape` at eval
  (`LAZY_EDITOR_EDGES`).

## Files

| File | Global | Does |
|---|---|---|
| `designer.js` | `TrackDesigner` | the `#trackdesigner` screen: modes DRAW / EDIT / ELEVATION / SCENERY / TEST, tools SELECT / DRAW / STRAIGHT / CORNER / HAIRPIN / CHICANE / S-BEND, undo, 600 ms draft autosave, SAVE / RACE / SHARE |
| `canvas.js` | `DesignerCanvas` | the 2D drawing surface (pointer / wheel / keys → callbacks; canvas ink, never CSS colours) |
| `profile.js` | `DesignerProfile` | the elevation strip under the canvas (per-node height grips) |
| `selection-panel.js` | `DesignerSelection` | shared point/range selection controls |
| `shape.js` | `TrackShape` | pure 2D geometry: headings, signed area (< 0 = LEFT loop), arcs, Dubins, resample, crossing/clearance scans |
| `stamps.js` | `TrackStamps` | STRAIGHT / CORNER / HAIRPIN / CHICANE / S-BEND stamps + the Dubins rejoin, pre-compensated for the engine's two Laplacian passes |
| `randomise.js` | `TrackRandom` | RANDOMISE: seeded hull + displacement + `fixAngles` (Maciel's method) |
| `validate.js` | `TrackValidate` | WYSIWYG checks on the road the ENGINE builds (`Tracks.buildCenterline`): RED blocks SAVE / RACE / SHARE, AMBER is advice (length, crossing, clearance, grade, hairpin floor, pit straights from `TrackPit`) |
| `insight.js` | `TrackInsight` | TURNS bands, point-mass speed profile, crests/dips, passing zones, FIA Grade 1 ambers, START FROM templates |
| `fixes.js` | `TrackFixes` | one-click FIX remedies for validator issues (start, length, spacing, smoothing, bridge, clearance) |
| `codec.js` | `TrackCodec` | share code `APXT1.p.<base64url>` / `APXT2` (props), the `#track=` fragment, file envelope; bit layout is append-only |
| `elev-presets.js` | `ElevPresets` | Flat / Rolling / Hilly per-node heights on the 0.25 m lattice (no DOM) |
| `track-themes.js` | `TrackThemes` | theme presets (def fields + generated scenery closure); list order is the share-code index — append only |
| `props.js` | `TrackDesignerProps` | capped trackside props (kind order = codec index, append only) |
| `scenery-panel.js` / `scenery-preview.js` | `DesignerScenery` / `DesignerSceneryPreview` | theme/atmosphere/prop inspector; live overhead footprint preview |
| `custom-tracks.js` | `CustomTracks` | registry + sanitiser: every stored field rebuilt to `LIMITS` on load (a share code is untrusted input), drafts, EXPORT ALL / IMPORT LIBRARY (`apex26.tracks` format) |

## Check a design without a browser

```sh
node tools/track/designer-code.mjs '<APXT1.…|APXT2.…>'   # decode + validate + insight; exit 1 on RED; --json, --file
```

## Tests

```sh
node --test tests/unit/custom-tracks.test.mjs tests/unit/track-codec.test.mjs tests/unit/track-editor-geometry.test.mjs \
  tests/unit/track-randomise.test.mjs tests/unit/track-fixes.test.mjs tests/unit/track-insight.test.mjs \
  tests/unit/designer-canvas.test.mjs tests/unit/designer-profile.test.mjs tests/unit/designer-props.test.mjs \
  tests/unit/elev-presets.test.mjs tests/unit/track-themes-build.test.mjs tests/unit/track-designer-dom.test.mjs \
  tests/unit/designer-code-cli.test.mjs
node --test tests/unit/track-validate-fleet.test.mjs     # the validator's ORACLE: no shipped circuit reads RED
npm test -- tests/specs/track-designer.spec.js           # BROWSER (group modes): door → randomise → SAVE → RACE → reload; background it
```

The VM tests share `tests/helpers/editor-vm.mjs` (the real track engine + the
LAZY_EDITOR files). A validator rule change must keep the fleet oracle green.

## Pitfalls

- Never reorder `TrackThemes`, prop kinds or codec flag bits — old share codes
  decode by index. A new field rides a new bit or a trailing byte.
- Judge geometry on the BUILT road (TrackValidate), never the control polygon.
- A custom circuit is not a `js/circuits/` file: `verify-track.cjs` covers the
  shipped fleet; a designer bug is tested through the editor VM.
