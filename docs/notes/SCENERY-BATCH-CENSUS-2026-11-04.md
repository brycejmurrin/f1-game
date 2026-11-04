# Scenery batch merge (#4746): census and the wall split

Kind: measurement · Re-measure-by: 2026-12-04

Measured on deploy tip `e2432a0c` (slices #4759, #4847, #4875 landed). Command:
`node tools/perf/mesh-census.mjs --backend tlx --mobile --tracks monaco,silverstone,singapore,spa`
(software-blit container, so draw-call counts are valid, timings are not).

## Wall split: tried, reverted
Splitting `wall` into a colour-free slab model plus a colour-free coping model (each colour on the
placement via `NODE_COLOR`) was built and measured against the tip, counting `graph.models` keys:

| circuit | models before | models after | `wall*` models before | after |
|---|---|---|---|---|
| monaco | 23 | 29 | 6 | 12 |
| silverstone | 34 | 34 | 0 | 0 |
| singapore | 49 | 49 | 0 | 0 |
| spa | 31 | 33 | 2 | 4 |

The model count rose: every circuit already keys a wall by `(thickness, height, colour)`, and each key
became two. The cap colour is the slab colour times a fixed factor, so a circuit never has more cap
colours than slab colours and nothing merges. Do not split the wall. A real win needs a model that
holds one colour per placement for slab and cap together (a second per-instance colour channel), which
is an engine change.

## Whole-change before/after (tip with vs without the wall split; main pass, calls / tris)
| circuit | tip | wall split |
|---|---|---|
| monaco | 52 / 191038 | 58 / 191694 |
| silverstone | 68 / 213750 | 67.8 / 213195 |
| singapore | 71.4 / 352194 | 71.7 / 352089 |
| spa | 63 / 135558 | 65 / 136222 |

Differences are inside the frame-to-frame noise of the census (camera phase), except monaco, which
moved the wrong way with the wall split. Slices 1-3 have no pre-change census (never run), so their
combined gain stays unmeasured.

## Still open on #4746
Billboard face (colour of the face plus `postCol` for the bezel, mixed in one model); wall (see
above); audio row 4 (needs a device listening pass); GLX `drawGlow` row 8.
