# Spine zones + bind — evidence (2026-09-10)

Implements `docs/superpowers/specs/2026-09-09-spine-zones-bind-design.md`
and `docs/superpowers/plans/2026-09-09-spine-zones-bind.md`.

## Shipped

| Layer | What |
|---|---|
| Tints | `saddleTint`, `ridgeTint`, `airboxTint` (optional; omit = prior look) |
| Enums | `coverBind` (`independent`/`saddleWrap`/`spineOnly`), `finHandoff` (`match`/`contrast`/`hardCut`) |
| Crowns | `cap`, `ridge`, `fade` |
| Flanks | `rake`, `shoulder`, `starfield` (not `stars` — that remains `finStyle`) |
| Mesh | `airboxTint` via `Car3D`; wrap sun still wins |
| Factory | Mercedes, Ferrari, Williams, Audi retuned |

## Factory map (after)

| team | spineLogo | spineSide | coverBind | finHandoff | notes |
|---|---|---|---|---|---|
| mercedes | fade | starfield | spineOnly | (match) | keeps `finStyle: stars` |
| ferrari | cap | shoulder | saddleWrap | contrast | white `saddleTint`, red `fin` |
| williams | ridge | rake | independent | (match) | cyan `ridgeTint` |
| audi | cap | rake | independent | (match) | red saddle/spine, dark ridge |

Other factories unchanged.

## Gates

```bash
node --test tests/unit/fin-design.test.mjs \
  tests/unit/cover-legibility.test.mjs \
  tests/unit/team-livery.test.mjs \
  tests/unit/livery-contrast.test.mjs
# pass (incl. rake/shoulder re-picked against flankBgs so saddle×shelf is not 1:1)

node tools/car/spine-station.mjs --team=all --occlude
# rake / shoulder / starfield clear on surveyed crowns
```

## Lit sheets

`APEX_HEADED=1 xvfb-run -a node tools/shot/garage-angles.mjs --team=mercedes,ferrari,williams,audi --views=spine --out=/opt/cursor/artifacts/spine-zones-bind/after`

Contact sheet: `/opt/cursor/artifacts/spine-zones-bind/after/sheet.png`  
Per-team hero/top/rear/side PNGs in the same directory.
