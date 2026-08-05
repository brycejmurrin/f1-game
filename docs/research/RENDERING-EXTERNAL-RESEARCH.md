# Rendering — external research, checked against this repo

Companion to `RENDERING-IMPROVEMENTS.md`, which asks *what should we render
differently*. This one asks the narrower question: **what does the outside world
know that we have not applied, and where does our code already disagree with its
own documentation.**

Everything below was researched externally and then verified against the tree at
build 999 — every claim about Apex 26 carries a `file:line`, and every claim
about the platform carries a source. Nothing here has been implemented.

**The three findings that matter, in order:**

1. The instanced-draw pipeline is **complete and has no caller**. One build site
   away from live. `SCENE-GRAPH-PLAN.md` says the opposite, and is stale.
2. **Reversed-Z is impossible in WebGL2** and free in WebGPU. That is the single
   biggest lever on z-fighting and it is not available on our shipping backend.
3. **WebGPU now ships on iOS 26** — the assumption that WGX is unreachable for
   real users expired in September 2025.

---

## 1. Instancing: built, correct, unplugged

### What the platform says

WebGL2 instancing is core — no extension
([webgl2fundamentals][wf-inst]). The mechanism is `vertexAttribDivisor(loc, 1)`,
and the one non-obvious constraint is that **a `mat4` attribute occupies four
consecutive attribute slots**, because WebGL2 has no `mat4` attribute type.

For many copies of *one* mesh, instancing is the answer. For many *different*
meshes, it is not — the documented alternative is a per-vertex model-id attribute
plus a data texture, read with `texelFetch(perModelData, uvec2(off, modelId))`,
bounded by `MAX_TEXTURE_SIZE` models ([webglfundamentals Q&A][wf-many]). That is
the technique for whatever `graph.batches()` returns as `bakeOnly`, if we ever
want to cut those draws too.

### What we have

All of it, already:

| piece | where |
|---|---|
| attribute slots 5-8 (mat4 columns) + 9 (instance colour) | `js/render/shaders/lit.js:18-22` |
| `vertexAttribDivisor(loc, 1)`, stride 64, offset `c*16` | `js/render/glx.js:1085-1090` |
| `createInstancedBatch(data, matrices, colors, opts)` | `js/render/glx.js:1075` |
| `drawInstanced` → `drawElementsInstanced` | `js/render/glx.js:1183-1196` |
| shadow-pass instanced draw | `js/render/glx/shadow.js:218` |
| frustum culling for instances | `js/render/glx.js:1158` `cullInstances()` |
| the producer | `js/track/graph.js` `graph.batches()` |

It is also **more careful than the tutorials**. Two traps it already handles:

- A *disabled* vec4 attribute reads `(0,0,0,1)`, which as a mat4 is degenerate —
  so the shader gates on a `uInstanced` uniform rather than trusting the generic
  attribute value (`lit.js:22-26`). `aInstCol` needs no gate because GLX sets its
  generic value to `(1,1,1)` once at init, making the multiply an identity on
  every non-instanced draw.
- **WebGL2 has no `baseInstance`.** An instanced draw always starts at instance
  0, so a visible subset cannot be expressed as an offset — which is why
  `cullInstances()` re-uploads spatial buckets instead (`glx.js:1110-1113`).
  This is a real WebGL2-vs-desktop-GL gap and the code already names it.

### The gap

```
$ grep -rn createInstancedBatch js/ --include=*.js
js/render/glx.js:1075         (the definition)
js/render/glx.js:1445         (the export)
js/render/webgpu/wgx.js:2431  createInstancedBatch: undefined
```

**Nothing calls it.** Every prop is still fused into one soup at
`js/track/tracks.js:222`:

```js
track.meshes.props = G.createChunkedMesh ? G.createChunkedMesh(propsGeo, 72) : G.createMesh(propsGeo);
```

Wiring is five call sites: that build line, the draw (`js/game.js:5050`), the two
shadow casts (`js/game.js:5441`, `:5730`) and the free (`js/game.js:2083`).

### Correct the plan doc

`SCENE-GRAPH-PLAN.md:416` still reads *"What remains is one consumer per backend:
GLX via `drawElementsInstanced` … plus the same treatment in the three shadow
passes."* Both landed after that sentence was written. What actually remains is
the call site. Anyone reading the plan today will go and build something that
exists.

### What it is worth

The plan's own measurement: **54% of the fleet's scenery mass — 9.67 M vertices —
collapses to 24,585.** An independent census this session (all 40 circuits, day
and night, `geometryDiagnostics().props.vertices`) puts the current cost at:

```
median peak     680,414
vegas         1,825,925    singapore  1,271,799    mexico  1,267,806
baku          1,122,088    jacarepagua 1,095,959   miami   1,072,305
sparsest: paul_ricard 302,130   qatar 340,858
```

`ok=true` on all 40 — nothing is broken, it is simply all baked.

Two caveats: only 16 emitters are migrated, so 54% is what is reachable *today*,
not the ceiling; and WGX has no instanced path, so WebGPU needs the `bake()`
fallback that S2 deliberately kept.

---

## 2. Depth precision — the best fix is unavailable to us

### What the platform says

Depth is stored as a linear remap of `1/z`, so precision bunches at the near
plane. The near plane dominates: moving it from `1/10` to `1/1000` costs a factor
of ~100 in effective resolution across the whole range ([zero-radiance][zr]).
Pushing the far plane to infinity barely matters.

The fix everyone uses is **reversed-Z** — map near to `d=1`, far to `d=0`, with a
float depth buffer. Float's quasi-logarithmic spacing then cancels the `1/z`
nonlinearity. NVIDIA's simulation is stark ([Reed][nv]):

| setup | indistinguishable | swapped |
|---|---|---|
| standard projection, float32 | 45% | 18% |
| GL-style `[-1,1]`, float32 | 56% | 12% |
| **reversed-Z, float32** | **0%** | **0%** |

It also makes the precomposed-vs-separate matrix question and the finite-vs-
infinite far plane question stop mattering at all.

### Why we cannot have it

Reversed-Z needs a `[0,1]` clip range. OpenGL defaults to `[-1,1]`, where — as
Reed puts it — "all the precision is stuck uselessly in the middle", and **the
reversed-Z trick does nothing by symmetry**. Desktop GL fixes this with
`glClipControl` (core in 4.5).

> "Unfortunately, in GL ES, you're out of luck." — [Reed][nv]

WebGL2 is GL ES 3.0. **There is no clip control, so reversed-Z is not achievable
on GLX.** WebGPU, by contrast, uses `[0,1]` natively — the gpuweb issue asking
for reversed range was closed because the default already permits it
([gpuweb#497][gw497]).

So the single most effective z-fighting mitigation in existence is a **backend
capability**, not a tuning knob. That reframes WGX from "a nice-to-have second
backend" into "the only route to the good depth buffer".

### What this predicts about our code

Our main projection (`js/game.js:5252-5253`):

```js
const _nearM = (_projMode === "cockpit" || _projMode === "hood") ? 0.3 : 0.9;
M4.perspectiveTo(_mProj, fovY, gfx.aspect, dbgCam ? 0.3 : _nearM, farPlane);   // farPlane = 900
```

- chase and the broadcast cams: **0.9 → 900**, a 1000:1 ratio
- cockpit and hood: **0.3 → 900**, a 3000:1 ratio

Someone already understood this — 0.9 is not an accident, and 0.3 is forced
(a nearer plane is the only way not to clip through the car's own bodywork).

**The testable prediction: z-fighting should be measurably worse in cockpit and
hood than in chase, by roughly the near-plane ratio.** We have exactly the tools
to check it — `tools/coplanar-audit.cjs` is the ratchet and
`tools/motion-capture.mjs` catches flicker that static shots cannot. Nobody has
run that comparison. If it holds, the coplanar baseline arguably needs to be
per-camera, because a pair that is stable in chase can flicker in cockpit.

Other mitigations that *are* available to us, in order of value:

1. Raise `_nearM` for cockpit/hood as far as the bodywork allows. Cheapest
   possible win and it is one number.
2. Lower `farPlane` where the circuit allows. Weak — far plane barely matters.
3. Keep projection separate from view in the vertex shader (Upchurch & Desbrun).
   Reed measured this as turning *swaps* into *indistinguishables* — it does not
   lower the error rate, but an indistinguishable is a stable picture and a swap
   is a flicker. Worth checking which shape our lit VS uses.
4. Depth pre-pass / polygon offset — already partly handled by the coplanar
   ratchet's real answer, which is *do not author coplanar faces*.

---

## 3. WebGPU is now shipping everywhere, including iOS

`js/render/webgpu/wgx.js` was written on the assumption that WebGPU is a
future-facing experiment. That expired.

| browser | status | source |
|---|---|---|
| Chrome / Edge (Win, macOS, ChromeOS) | ✅ 113 | [gpuweb wiki][gw] |
| Chrome Android (ARM/Qualcomm/Intel, Android 12+) | ✅ 121 | " |
| Chrome Linux (Intel Gen12+) | ✅ 144 | " |
| Firefox Windows | ✅ 141 | " |
| Firefox macOS (Apple Silicon) | ✅ 145 / all macOS 147 | " |
| **Safari macOS Tahoe 26, iOS 26, iPadOS 26, visionOS 26** | ✅ **26** | [web.dev][webdev], [gpuweb wiki][gw] |

Still missing: Firefox Android (Mozilla expects work "in 2026"), Firefox Linux,
Windows ARM64 behind a flag.

That is the exact platform this game is played on — the user's own pairing is an
iPhone against a desktop.

**But shipping availability is not the same as our readiness.** WGX today:

```js
createInstancedBatch: undefined,   // TrackGraph.batches() consumer — GLX only
drawInstanced: undefined,
```

and per `CLAUDE.md` it has not ported the procedural material system either, so
the baked asset pack degrades to procedural on it. So the honest position is:
the *platform* argument for WebGPU is now settled, and the *port* is not started.
Worth a deliberate decision rather than drift, because the reversed-Z point above
means WGX is the only path to a depth buffer that does not fight itself.

WebGPU also brings **render bundles** — recorded, replayable command sets.
Babylon's Snapshot Rendering reports ~10× faster scene rendering with them
([web.dev][webdev]). For a scene that is overwhelmingly static geometry plus 20
moving cars, that shape fits us unusually well.

---

## 4. iOS Safari memory — the ceiling we are near

`SCENE-GRAPH-PLAN.md` opens by saying detail "added now makes a known iOS crash
worse". The external numbers put a figure on it.

- iOS Safari enforces roughly a **300–500 MB** ceiling on the WebGL heap, far
  below desktop; practical guidance is to stay under ~384 MB
  ([bugnet][bug]).
- Chromium caps GPU allocations at **1 GB** and fails them beyond that, because
  restoring a lost context from a fragmented heap is likely to fail too
  ([webgl-dev-list][wdl]).
- WebKit has open bugs for context loss specifically **on buffer upload** under
  iOS 18 ([bugs.webkit.org #286297][wk]).

That last one is the relevant failure mode for us: we upload one fused props
buffer of up to **1.83 M vertices** (Vegas) in a single shot at track build.
Instancing (§1) attacks this directly — it is not only a draw-call optimisation,
it is a *peak allocation* optimisation, and peak allocation is what loses the
context.

Other iOS notes worth having on file, all consistent with choices already made
here: audio must be gated behind a user gesture or the `NotAllowedError` can
cascade; 32-bit float render targets are unreliable; `isampler2D` and 3D textures
are best avoided; MSAA is expensive and poorly handled. We already gate audio and
already avoid the rest.

---

## 5. Shadows — cascades, and why we may not need them

The standard answer for a large outdoor scene is **cascaded shadow maps**: split
the view frustum by depth and give each slice its own map, so near geometry gets
texel density that a single map spread over 900 m cannot ([MS][ms],
[Tardif][at]). The universal artifact pair is *shadow acne* (bias too small) and
*peter-panning*, shadows detaching from their caster (bias too large); the
better-than-bias fix is **normal-offset** — displace the sample along the surface
normal rather than along depth.

We do not have cascades, but we have something close in spirit
(`js/render/glx/shadow.js:23-25`):

```js
const SHADOW_SIZE     = core.IS_MOBILE ? 1024 : 2048;   // the scene map
const CAR_SHADOW_SIZE = 1024;                            // dynamic car-only map
const LAMP_SHADOW_SIZE = 512;                            // nearest floodlight spot
```

A dedicated car map is effectively a hand-placed near cascade around the only
object whose shadow is inspected closely — which is the 80% of what cascades buy,
for a fraction of the complexity, and it is already tuned through `TUNE_DEFS`.

So the finding is a *negative* one worth recording: **cascades are probably not
the next shadow win here.** If shadow quality is revisited, normal-offset bias is
the cheaper and more targeted change, and it is a shader edit rather than an
architecture one.

---

## 6. What to do with this

Ranked by value over effort:

1. **Wire the instanced path** (§1). Five call sites, the machinery exists, the
   payoff is measured at 54% of scenery mass, and it reduces the peak upload that
   §4 says is losing iOS contexts. Gate with `npm run test:graph-parity`.
2. **Fix `SCENE-GRAPH-PLAN.md:416`** (§1). One paragraph. It currently sends the
   reader to build something already built.
3. **Run the cockpit-vs-chase coplanar comparison** (§2). Cheap, uses existing
   tools, and either confirms a real per-camera effect or closes the question.
4. **Decide about WGX deliberately** (§3). Availability is settled; reversed-Z is
   only reachable there; the port has not begun. This is a scope decision, not an
   engineering one, and it should be made rather than deferred by default.
5. **Leave shadows alone** (§5), unless normal-offset bias is wanted.

---

## Sources

- [wf-inst]: WebGL2 Fundamentals — Instanced Drawing.
  <https://webgl2fundamentals.org/webgl/lessons/webgl-instanced-drawing.html>
- [wf-many]: WebGL Fundamentals — Drawing Many Different Models in a Single Draw Call.
  <https://webglfundamentals.org/webgl/lessons/webgl-qna-drawing-many-different-models-in-a-single-draw-call.html>
- [nv]: Nathan Reed, *Visualizing Depth Precision*, NVIDIA Technical Blog, 2021-10-21.
  <https://developer.nvidia.com/blog/visualizing-depth-precision/>
- [zr]: *Quantitative Analysis of Z-Buffer Precision*, 2020-08-24.
  <https://zero-radiance.github.io/post/z-buffer/>
- [gw497]: gpuweb issue #497 — the case for Reversed Depth Range.
  <https://github.com/gpuweb/gpuweb/issues/497>
- [gw]: gpuweb Implementation Status wiki (rev. 2026-05-28).
  <https://github.com/gpuweb/gpuweb/wiki/Implementation-Status>
- [webdev]: *WebGPU is now supported in major browsers*, web.dev, 2025-11-25.
  <https://web.dev/blog/webgpu-supported-major-browsers>
- [bug]: *Fix: Unity WebGL Build Crashing on Safari iOS*, 2026-04-08.
  <https://bugnet.io/blog/how-to-fix-unity-webgl-build-crashing-on-safari-ios>
- [wdl]: webgl-dev-list — Detecting when WebGL is out of memory.
  <https://groups.google.com/g/webgl-dev-list/c/TrPjvxVk5rc>
- [wk]: WebKit bug 286297 — context lost on buffer upload, iOS 18.
  <https://bugs.webkit.org/show_bug.cgi?id=286297>
- [ms]: Microsoft — Cascaded Shadow Maps.
  <https://learn.microsoft.com/en-us/windows/win32/dxtecharts/cascaded-shadow-maps>
- [at]: Alex Tardif — Cascaded Shadow Maps with Soft Shadows.
  <https://alextardif.com/shadowmapping.html>

Prop census raw data (40 circuits, day/night) is reproducible with
`geometryDiagnostics()` per track; the probe used is not committed because
`tools/apex-eval.mjs` does the same job in one line.
