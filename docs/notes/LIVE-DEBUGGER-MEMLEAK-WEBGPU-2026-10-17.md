# Live debugger — memory leaks and TLX WebGPU follow-ups, 2026-10-17

Lane: perf-4. Session `bc-d1bfb5c7-1980-5c4a-b5bc-fb9d4a631575`. Tree: deploy tip
`bf2b3dd5` (`claude/f1-game-project-26h3ng`). One hunt round. Did not re-report
the rows from PR #2753 (that note is on its branch, not on this tip).

No WebGPU adapter in this container (SwiftShader / no `navigator.gpu` device
that three will bind). Counts below are live object counts from the real
`postChain` against stub three targets, not GPU-process bytes. SwiftShader
frame time is not evidence and was not collected.

## Findings

| id | file:line | severity | verdict | evidence | retainer |
|---|---|---|---|---|---|
| MEM-1 | `js/render/three/tlx-post.js:271-301` (ensureAO / ensureGR / ensureBloom, before the shed) | med | CONFIRMED-LIVE | SSAO, godray and bloom targets are created on the first open frame and were never disposed when the gate shut. Plan M-11. Unit harness: one SSAO present takes the live `RenderTarget` count from 2 (scene + LDR) to 4; eight following presents with `ssao/godray/bloom` 0 left it at 4 (`held.ssao` stayed true). Same failure with the shed calls removed. | `ownedRTs` plus `ssaoRT` / `godrayRT` / `bloomLv` closed over by `postChain` |
| MEM-2 | `js/perf/gfx-debug-overlay.js` (no heap line before this round); `tools/gfx/gpu-game-check.mjs` (no `usedJSHeapSize`) | med | CONFIRMED-LIVE | Issue #1648 done-when. `grep usedJSHeapSize` was empty in both files on `bf2b3dd5`. | n/a (missing instrument) |
| MEM-3 | vendored three r186 WebGPU attribute upload (`createAttribute`, the Uint16-to-Uint32 patch) | med | CODE-TRACED | #1639. See the root-cause section. Fix is a vendor bump or a packer change in `js/render/three/tlx-chunked.js`. Both are outside this lane. | n/a |
| MEM-4 | `js/render/three/tlx-shadow.js:518` `pools` | — | REFUTED | The map gains one entry per depth target. The targets are the chain's own sun/car/lamp RTs, created once. `freeInstanced` / `releaseGeometry` drop casters. Not a per-switch growth. | n/a |
| MEM-5 | `js/render/three/tsl-fx.js:273` `_decalGraph` | — | REFUTED | Keyed by the glow number. Callers pass a fixed set (`0`, `0.62`, `0.7`, `1.6`). `decalCache` is capped at 24 and evicts. | n/a |
| MEM-6 | `tools/gfx/census-verdict.mjs` | low | CODE-TRACED | The verdict step will not print `gfx.mem` until that file grows a row. Outside this lane's owned globs. The game-check JSON and the `[game-check] mem` log line carry the numbers. | n/a |

## #1639 — why Float16 colour is darker on TLX WebGPU

Root cause, from the vendored r186 source (same text as
https://raw.githubusercontent.com/mrdoob/three.js/r186/src/renderers/webgpu/utils/WebGPUAttributeUtils.js ,
the file three names WebGPUAttributeUtils)
and the bisect already in `tlx-chunked.js` `packAttr` (control 45.6, unorm8
colour 42.9, `Float16BufferAttribute` itemSize 4 → 39.1). The half encoder is
not the fault: `_toHalf` agrees with `vertex-pack.js`.

`Float16BufferAttribute` stores the half bits in a `Uint16Array`.
`createAttribute` then does this for every non-normalized, non-interleaved
attribute whose array is a `Uint16Array`:

```js
array = new Uint32Array(array);
bufferAttribute.array = array;
```

Each half is zero-extended into a uint32. `_getVertexFormat` still selects
`float16` because `typedAttributeToVertexFormatPrefix` is keyed on
`Float16BufferAttribute`, and the stride becomes `itemSize * 4`. A `float16x4`
colour therefore reads eight bytes as (R, 0, G, 0): the high half of each
widened word is padding, so green lands in blue and green itself is 0. That is
a darker frame, and it is backwards on precision grounds because the values
are no longer the encoded colour. WebGL takes the other branch
(`isFloat16BufferAttribute ? HALF_FLOAT`) and does not widen.

Not fixed here. Shipping half-float colour on the WebGPU leg needs either a
three change that skips that widen for `Float16BufferAttribute`, or a pack
that three will not rewrite. Both files are outside this lane. No census A/B
of a fix: there is no fix on this branch, and this container has no WebGPU
adapter. Do not close #1639 on this note alone.

## Before / after (MEM-1)

Live undisposed `RenderTarget`s in the unit harness (base chain = scene + LDR).

| | after 1 SSAO present | after 8 closed presents | after a second open + 8 closed |
|---|---|---|---|
| before (shed calls removed) | 4, `held.ssao` true | 4, `held.ssao` true | would stay 4 |
| after | 4, `held.ssao` true | 2, `held.ssao` false | 2 |

The failing assertion on the unfixed tree was `held.ssao` still `true` after
eight closed presents (`tests/unit/renderer-soft-lifecycle.test.mjs`).

## Not run

No player-facing change. No heap snapshot across circuits: a track-switch
browser run is the gfx group, dispatched with `remote-group` after the push,
not timed locally. WebGPU versus WebGL2 byte counts need a machine with an
adapter (`--mem-switch` on `gpu-game-check`, or `mem-census.mjs`).
