# The draw-call bound across all three backends (2026-09-16)

The bound test found that this frame pays for DRAW CALLS, not vertices: props
as one mesh — every vertex, no cull — beat 152 culled draws
(`RENDER-PERF-PLAN-2026-09-16.md` §2). `WEBGL_multi_draw` is the GLX answer and
is implemented. This note asks what the other two backends can do about the
same bound, and the first finding is that **all three have it**.

## 1. None of the three escapes it today

| backend | how chunks reach the GPU | draws/frame |
|---|---|---|
| GLX | one `drawElements` per chunk run, merged only where CONTIGUOUS | ~152 |
| WGX | per-draw uniform carrying `(offset, count)` | per chunk |
| TLX | pooled meshes, one shared material, lamps resolved per FRAGMENT | **184** (measured) |

The TLX number is `renderer.info.render.drawCalls` read straight out of a
census run, and it matters because `tsl-lit.js` describes TLX's design as the
"deliberate difference from the other two backends". The difference is real —
TLX resolves lamps per fragment through a grid texture rather than per draw —
but it is a difference in how LIGHTING is bound, not in how many draws are
issued. TLX pays the same per-draw cost, and `tlx.js` already says so in its own
words: "three refreshes every OBJECT-group uniform per draw (r185 NodeManager),
so the draw count is the CPU lever on a phone."

## 2. TLX: `BatchedMesh`, and it pays twice

three.js has shipped `BatchedMesh` since r156 (the tree vendors r185). It packs
many geometries into one vertex/index buffer and draws them in a single call,
**using `WEBGL_multi_draw` underneath with a slower fallback when the extension
is absent** — the same mechanism just added to GLX, already written and
maintained upstream.

The second payment is the interesting one. `tsl-lit.js` currently walks a grid
texture per fragment to find a chunk's lamp set, and explains why it cannot do
the obvious thing instead:

> `drawIndex` looks like the way out and is not — in vendor/three-0.185.1 both
> the declaration of `nodeUniformDrawId` and its only assignment are gated on
> `object.isBatchedMesh`, so a plain Mesh reads nothing.

So the per-fragment grid walk is a workaround for not being a `BatchedMesh`.
Adopting one collapses the draws AND unlocks the per-draw id that would replace
the workaround. One change, two problems.

Caveat worth carrying: upstream notes that BatchedMesh used
`multiDraw*Instanced` in earlier versions and now emulates instancing by
repeating multi-draw parameters, which is slower than the instanced form. Fine
here — these chunks are not instanced — but it means the win is the draw-call
collapse, not free instancing.

## 3. WGX: render bundles are the wrong tool, and the right one is not shipped

**Render bundles do not apply.** They pre-record a command sequence and replay
it with one call, and the WebGPU best-practice guidance is explicit about the
limit: they reduce the CPU-side cost of submitting commands, and "if an
application is GPU-bound, render bundles won't improve performance". This frame
is GPU-bound — the census measured GPU 19 ms against CPU floor 17 ms, and the
bound test moved GPU TIME by changing draw count. Bundles would cut the wrong
half.

**`multi-draw-indirect` is the right tool and is not available.** In Chrome it
exists only as `chromium-experimental-multi-draw-indirect`, behind
`chrome://flags/#enable-unsafe-webgpu`, not standardised. Shipping a renderer
path on a flag no player has is not an option.

So WGX has no equivalent lever today. What it CAN do is reduce draws the
ordinary way — merge chunks into fewer, larger draws and accept a coarser
frustum cull, which the bound test says is a good trade: the unchunked mesh
submitted every vertex with no culling at all and still won. That is a
measurement WGX can take with the flag that already exists
(`apex26.propsUnchunked`), on its own path, before any new code.

## 4. What this changes about the plan

- GLX multi-draw stays first: implemented, measuring, and the only backend where
  the mechanism is standard and available.
- **TLX `BatchedMesh` is the second item, and is now better justified than
  anything else on the list** — upstream code rather than ours, and it deletes a
  documented workaround rather than adding one.
- WGX gets a measurement, not an implementation. `propsUnchunked` on the WGX leg
  answers whether coarser chunking pays there, and costs one census run.
- Nothing here helps Firefox on GLX (1.4 % extension support) or WGX anywhere.
  The `drawElements` path stays the floor, and its cost is the reason the bound
  test matters: fewer, larger draws help EVERY backend, with or without an
  extension.

## Sources

- [WebGPU Render Bundle best practices — Toji](https://toji.dev/webgpu-best-practices/render-bundles.html)
- [GPURenderBundleEncoder — MDN](https://developer.mozilla.org/en-US/docs/Web/API/GPURenderBundleEncoder)
- [What's New in WebGPU (Chrome 131) — multi-draw-indirect](https://developer.chrome.com/blog/new-in-webgpu-131)
- [three.js BatchedMesh docs](https://threejs.org/docs/pages/BatchedMesh.html)
- [BatchedMesh multiDraw*Instanced discussion](https://github.com/mrdoob/three.js/issues/31935)
- [WEBGL_multi_draw support survey](https://web3dsurvey.com/webgl/extensions/WEBGL_multi_draw)
