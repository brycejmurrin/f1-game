
## 6. #34535 — `getDynamicCacheKey` mints an array per render object per frame

`src/nodes/core/NodeUtils.js` exports `hash = ( ...params ) => cyrb53( params )`, so
every call allocates a rest array. `RenderObject.getDynamicCacheKey()` calls it up to
three times — once for an array camera, once for a shadow receiver, once for the
context node's id and version — and `get needsUpdate()` calls
`getDynamicCacheKey()` for EVERY render object on EVERY draw. The arrays hold two or
three small integers, are read once by `cyrb53`, and are garbage the moment it
returns; the count is (objects x frames).

Measured on this project's three.js/WebGPU path before the patch, on the NATIVE
present path (`apex26.wgxCapture=0` — the soft blit halves the rendered frames and so
halves this number too): **255 KB per frame, 28.4 MB/s, a collection about once a
second freeing a median 25.8 MB** (`tools/gfx/frame-hitch.mjs`, 150 s,
`artifacts/hitch-native-tlxwgpu.json`). Upstream measured the same shape at 120,000
arrays per second for 1,000 meshes at 120 fps.

The patch is upstream's: one module-scope scratch array, filled by index, hashed with
`hashArray` — which is already in this bundle, and already used exactly this way by
`Nodes.getCacheKey()` a few thousand lines further down. The key VALUE changes (a flat
hash of five slots replaces three nested hashes); that is safe because this one method
is the only producer and the only consumer, and it is the change upstream shipped.

Fixed upstream by PR #34553 (issue #34535), milestone **r187** — RETIRE THIS PATCH ON
THE r187 BUMP.
