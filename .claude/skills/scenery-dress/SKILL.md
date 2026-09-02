---
name: scenery-dress
description: Use when the user asks to add/edit track scenery, dress a circuit, add buildings/trees/grandstands/barriers/mountains/billboards/floodlights, make Spa denser, fix floating/sunken/missing props, or work in a circuit scenery(api) callback, or migrate scenery emitters to TrackGraph.instance / check graph parity / debug batches()/bakeOnly. For a picture-driven accuracy pass (survey first) use survey-track.
---

# Dress a circuit's scenery

`buildProps` (`js/track/scenery-*.js`, orchestrated by `js/track/tracks.js`;
the 111-member `api` surface is frozen by
`tests/unit/scenery-api-contract.test.mjs`) calls `def.scenery(api)` then
merges one mesh. Full reference: `docs/SCENERY-API.md`.

## Placement model

Every helper takes `(k, side, dist, …)`:
- `k` — node index `0 … n-1`. Lap fraction: `Math.round(s * n) % n`.
- `side` — `-1` left / `+1` right of racing direction.
- `dist` — metres **beyond the road edge**.
- `s` — lap fraction `0 → 1` where helpers take it.

**Forgetting `out` is the #1 crash** — destructure it from `api` first.

## Helper families

- **Trackside boxes:** `place`, `prop`, `backdrop`, `groundPlane`.
- **Vegetation:** `tree`, `pine`/`conifer`, `palm`, `bush`, `hedge`,
  `forestEdge`.
- **Structures:** `building`, `tower`, `grandstand`, `billboard`, `gantry`,
  `marshalPost`.
- **Barriers** (tighten the driving boundary): `wall`, `fence`, `guardrail`,
  `tyreWall`.
- **Terrain/raw:** `mountain`, `addBox`/`addCyl`/`addCone`/`addPrism`/
  `addPyramid`/`addFrustum`.
- **Utilities:** `every`, `hash`, `anchor`, `groundYAt`, `onTrack`.

```sh
node tools/verify-track.cjs <id>     # must print OK; catches scenery() THROW
```

Then `node tools/bump-cache.mjs --apply`. Visual: **playwright-probe** `shot.mjs`. Picture-driven
accuracy / floating-tree survey → **survey-track** (Montreal already ships
`flatTerrain`). Instancing migration →
[references/instancing.md](references/instancing.md).

## Load on demand

- Rejection / `rejBox` / `RAW.*` / vertex budget / trees vs `blockAt` →
  [references/rules.md](references/rules.md).
- `TrackGraph.instance` migration, `apex_graph_parity` / `BASE=` parity,
  `batches()` / `bakeOnly`, `__apex.trackGraph()` stats →
  [references/instancing.md](references/instancing.md).
