---
name: scenery-dress
description: "Use when adding or editing track scenery — buildings, trees, grandstands, barriers, mountains, billboards, floodlights, a denser Spa — fixing floating/sunken/missing props, a circuit scenery(api) callback, or TrackGraph.instance migration, graph parity, batches()/bakeOnly. Survey-first accuracy pass → survey-track."
---

# Dress a circuit's scenery

`buildProps` (`js/track/scenery/*.js`, orchestrated by `js/track/tracks.js`)
calls `def.scenery(api)` then merges one mesh. Full reference: `docs/SCENERY-API.md`.
The `api` surface is a FROZEN contract — its home is `js/track/AGENTS.md`; adding a member
means updating `tests/unit/scenery-api-contract.test.mjs` in the same commit.

## Placement model

Node-based helpers take `(k, side, dist, …)`:
- `k` — node index `0 … n-1`. Lap fraction: `Math.round(s * n) % n`.
- `side` — `-1` left / `+1` right of racing direction.
- `dist` — metres **beyond the road edge**.
- `s` — lap fraction `0 → 1` where helpers take it.

Destructure `out` from `api` first; `verify-track` catches a `scenery()` throw.

`K(s)` is AUTHORED-frame: pass it straight through, never pre-shift it. Frames, `along()`
and the `_sceneryShift` print command: [references/rules.md](references/rules.md) §Frames (one
home; the rule itself: `.claude/rules/game-code.md`). A non-zero shift means dropping
`sceneryStartFrac` re-bases every authored frac literal at once — `audit-circuit` baseline
before and after, never a one-line edit.

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
- Argument kinds: `grandstand` / `grandstandEx` take a lap fraction `(s,side,...)`; range
  helpers take fraction endpoints; raw primitives take world coordinates.
- **Floodlight masts/lamps:** the generic mast pass owns ordinary lamps; a hand-modelled
  luminaire uses `lampPost(spec)` (`docs/SCENERY-API.md`). Whether lights FIRE
  (dusk/dawn/night gate, lamp cap) → **lighting-tuner**.

```sh
node tools/track/verify-track.cjs <id>     # must print OK; catches scenery() THROW
node tools/track/float-audit.cjs <id>       # node-VM, ~1 s: floating props; `--why` names the emitting source line
node tools/track/ground-audit.cjs <id> --why  # ~12 s: buried / unsupported prims (--all --gate = ratchet)
node tools/track/clip-audit.cjs <id> --why    # ~3 s: prop-vs-prop clipping; `--all --gate` = tools/track/clip-baseline.json
node tools/track/props-tris.cjs <id>          # ~3 s: post-strip props tris; tests/unit/props-tri-ratchet.test.mjs fails past +0.5 %
```

Grounded = float-audit clean and ground-audit no worse than `tests/data/scenery-audit-baseline.json`;
added props must also stay inside the clip and props-tris baselines (a denser circuit raises the tris one in a commit that says why). Then `npm run gen:check` ([shell/cache](../check-changes/references/bump.md)).

**Generated:** `tools/shot/scenery-locations.json` goes stale when a prop moves. Regenerate with
`node tools/shot/gen-scenery-locations.cjs` (`--check` names drift); never hand-edit it
(`tools/lib/generated-paths.mjs`). It is NOT part of `npm run gen`.

Visual: **playwright-probe** `shot.mjs` (browser: parent only; a subagent reports it not run).
Picture-driven accuracy / floating-tree survey → **survey-track** (Montreal already ships `flatTerrain`).

## Load on demand

- Floating/sunk prop fix (find the emitter, footing, engine-fix gates) →
  [references/float-fix.md](references/float-fix.md).
- Rejection / `rejBox` / `RAW.*` / vertex budget / trees vs `blockAt` →
  [references/rules.md](references/rules.md).
- `TrackGraph.instance` migration, `apex_graph_parity` / `BASE=` parity,
  `batches()` / `bakeOnly`, `__apex.trackGraph()` stats →
  [references/instancing.md](references/instancing.md).
