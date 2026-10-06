# Track Designer overhaul — UX audit and slices

Date: 2026-10-05. Base: `claude/f1-game-project-26h3ng`. Live survey: build 14034 / PR [#1042](https://github.com/brycejmurrin/f1-game/pull/1042). Chrome fixes in flight: PR [#1039](https://github.com/brycejmurrin/f1-game/pull/1039) (rail `2 CORNERS`, flat elev labels) — **this work builds on that branch**.

Bryce pain: designer hard to understand/use; elevation hard on mobile; wants themes/scenery options + berms/kerbs/banked corners.

## UX audit (short)

| ID | Problem | Evidence / root |
|---|---|---|
| UX-1 | Coach card covers SHAPE tools after RANDOMISE | Shots `16-designer-edit-randomise.png`; `showCoach()` inserts above the tool row |
| UX-2 | Rail numbering gap `1 SHAPE → 3 LOOK` | Fixed in #1039 — do not re-do |
| UX-3 | Dual flat `0 m` elev labels | Fixed in #1039 |
| UX-4 | Tool modes mixed with stamp kinds | One chip row: SELECT/DRAW + STRAIGHT…S-BEND |
| UX-5 | Elevation strip hidden on phone landscape | `css/editor.css` `@media (max-height:500px)` sets `display:none` on `[data-role=profile]` |
| UX-6 | Hills are cosine bumps, not node heights | `elevations[{s,halfM,rise}]`; `pts` are `[x,z]` only |
| UX-7 | Banking buried; kerbs engine-auto | `bankZones` exist; no kerb style enum |
| UX-8 | UNDO/REDO easy to miss | Chips only under DETAILS |
| UX-9 | Themes text chips; no props palette | 20 themes already; no place/remove props |

## Elevation model (this PR)

**True per-node height.** Design stores `heights: number[]` parallel to `pts` (0.25 m lattice, clamped). `CustomTracks.toRaw` puts optional `path.pts[i][2] = y`; `TrackDef.realPoints` reads it. Old saves without `heights` load as **flat** (zeros). Legacy cosine `elevations[]` still race if present; presets and height edits clear them so the strip matches the road. Bridges stay cosine bumps.

Why not keep cosine-only: Bryce asked for per-node height; the control spline already interpolates Y at control points (`buildCenterline` Catmull-Rom on `points[i][1]`). Per-node Y is the natural authoring model once the codec carries it.

## PR-sized slices (ordered)

### Done / in this PR — slices A–C (+ #1039 base)

| Slice | Goal | Pinned |
|---|---|---|
| **0** | Land #1039 rail numbering + elev labels | `designer.js`, `profile.js`, `css/editor.css`, unit tests — **base of this branch** |
| **A** | Coach never blocks tools; HOW TO count; UNDO/REDO on canvas toolbar + shortcuts | `designer.js`, `css/editor.css`, designer unit/spec |
| **B** | Mode tabs: draw / edit / elevation / scenery / test | `designer.js`, `canvas.js`, css |
| **C** | Mobile elev strip + Flat/Rolling/Hilly presets writing **node heights**; ≥44 px grips | `profile.js`, `elev-presets.js`, `custom-tracks.js`, `codec.js`, `def.js` (Y read), designer, css |

### Follow-up PRs

| Slice | Goal | Notes |
|---|---|---|
| **D** | Theme previews + LOOK polish | Swatches from existing 20 `ORDER` ids; no reorder |
| **E+F** | Banking UI + kerb styles | Reuse `bankZones`; kerbs (**flat / sausage / rumble**) ship **with** the banking slice — not a separate early PR |
| **G** | Berms on banked corners | After E+F; mesh + surface |
| **H** | Scenery: theme-first + small props palette | Themes stay primary; palette = capped place/remove (stand, gantry, trees, water, flood, billboard) |
| **I** | Optional new themes | Append-only if Bryce still wants more after D |
| **J** | Quick in-editor test lap | Later follow-up (after modes land): short drive/flyby without a full race boot if Perf allows; else clearer RACE/TT CTA |

## Parallelism

```
#1039 → A → B → C (this PR)
           ↘ D ∥ carefully
           ↘ E+F (bank + kerbs) → G (berms)
           ↘ H (props) after B
           ↘ J (test lap) after B
```

Hard-serialize on `js/editor/designer.js`. Do not touch `js/track/scenery/*.js` kits or circuit scenery files from this lane.

## Verify (this PR)

- `node --test tests/unit/elev-presets.test.mjs tests/unit/designer-profile.test.mjs tests/unit/track-designer-dom.test.mjs` (and codec/custom-tracks pins for heights)
- `npm run test:tooling-fast` (or `node tools/ci/tooling-fast.mjs --jobs=3`)
- Screenshots: desktop 1280×800 + phone 390×844 — draw mode, elevation + profile strip, finished elevated track in 3D → `/opt/cursor/artifacts/designer-*.png`
