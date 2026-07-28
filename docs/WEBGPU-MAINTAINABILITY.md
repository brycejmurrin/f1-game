# WebGPU maintainability review + refactor design — Apex 26

Companion / critical review of [`docs/WEBGPU-MIGRATION.md`](./WEBGPU-MIGRATION.md).
Where that document asks *"how do we add WebGPU?"*, this one asks *"what should we
refactor so the current renderer is easier to maintain — and, as a side effect,
so a future WebGPU port is cheaper?"*

**Scope note:** this is a design/review document. It proposes no source edits by
itself. All line citations are against the tree as read on 2026-07-03
(`js/render/glx.js` = 3770 lines, `js/game.js` = 8002 lines, `js/track/tracks.js` = 3465).

> **Status update:** the review below treats the WebGPU backend (roadmap steps
> 8-12) as gated future work. It has since been **built and wired in, opt-in,
> through Phase 4b** — `index.html` loads `js/render/webgpu/wgx.js` (+ the WGSL chunk /
> post / fx files) and `js/render/gfx.js`, activated only via
> `localStorage apex26.gfxBackend = "webgpu"` with WebGL2/GLX as the default
> fallback. The maintainability arguments here still stand; treat the "if
> committing to WebGPU" framing as historical.

---

## A. Critique of the migration plan

### A.1 Verdict up front

The plan is **substantially correct and unusually honest**. Its headline call —
*do Phase 0 (the abstraction seam), then stop unless a concrete payoff appears* —
is the right call, and the Risk register names the real dominant cost (R1: two
hand-tuned shader languages, no build step, no compiler to catch drift) rather
than hiding it. Two facts it verified against code are load-bearing and correct:
there are **no UBOs** (lights are loose uniform arrays uploaded per frame,
`js/render/glx.js:2946-2977`) and **no MRT / no instancing**. I would ship the plan's
recommendation essentially as written. The critique below is about *emphasis and
sequencing*, not direction.

### A.2 Is "Phase 0: abstraction seam first" the right first move?

**Mostly yes, with one important reframing.** A seam that both a WebGL2 and a
WebGPU backend implement is obviously the prerequisite for ever having two
backends. But the plan slightly over-sells Phase 0 as a *pure* win, and slightly
mis-locates the effort:

- **The seam already exists.** The plan itself says so (Migration Step 3: "the
  interface *is* today's `GLX` return object", `js/render/glx.js:3693-3769`). `game.js`
  already talks to the renderer only through those ~35 methods — 109 `GLX.` call
  sites (`js/game.js`, boot at `js/game.js:39`), every one of them a method on
  that object, no reaching into GL internals. So Phase 0 is not "introduce an
  abstraction"; it is "**give the existing abstraction a name, a second
  implementer, and an async boot**." That is a smaller, safer change than
  "abstraction seam" implies — good — but it also means Phase 0's standalone
  maintainability value is **lower than billed**: renaming `GLX.` to `gfx.` at
  109 sites and making boot async (`js/game.js:39`) does not by itself make
  `glx.js` easier to maintain. It makes it *swappable*, which only pays off if
  something is actually swapped in.

- **The real maintainability lever is inside `glx.js`, not at its boundary.**
  The 3,770-line file's maintenance cost is dominated by (a) the two monster
  fragment shaders and (b) the per-draw imperative GL state mutation
  (`draw()`, `js/render/glx.js:2982-3024`) — neither of which Phase 0 touches. So I
  push back on the framing that Phase 0 is "genuinely worth it on its own
  merits." It is worth doing *if* WebGPU is on the table; as a pure
  maintainability play it is near-neutral (a rename + an `await`). The
  refactors in Section C are the ones that pay off regardless.

**Reframing:** keep Phase 0 in the plan, but demote its billing from "worth it
anyway" to "cheap prerequisite, do it when committing to WebGPU." Promote the
Section C refactors (shader-chunking, render-target table, light-upload
extraction, draw-state enumeration) to "do anyway" — several of them *are* the
de-risking that Phase 2/4 need, and all of them help today.

### A.3 Where is the biggest maintenance risk?

The plan's R1 is exactly right and is the crux of this whole review:
**maintaining two textual copies of `LIT_FS` (~850 lines, `js/render/glx.js:39-889`)
and `COMPOSITE_FS` (~390 lines, `js/render/glx.js:1594-1987`) in two shading languages
with no build step and no compiler to diff them.** These shaders are under
active art-direction churn (the density of tuning comments and NaN-guard
comments proves it). Every future tweak would have to be made twice, by hand,
with the only "test" being a pixel-diff that runs after the divergence already
shipped.

One reinforcement the plan under-states: **the duplication problem already
exists *within the single GLSL codebase today*.** `vnoise` is defined in `LIT_FS`
(`js/render/glx.js:133`) and then **re-defined verbatim as `vnoise2` in `SKY_FS`**
(`js/render/glx.js:926`) because the two shaders are independent strings that cannot
share a function. `hash21` (`js/render/glx.js:128`), `cloudFBM` (`js/render/glx.js:323`),
`D_GGX` (`js/render/glx.js:107`), `acesTonemap` (`js/render/glx.js:1644`), `colourGrade`
(`js/render/glx.js:1652`) are each authored once but are *structurally* the kind of
math that other passes want and currently can't reach. So the "shared math has no
single source" problem is not a *future WebGPU* problem — it is a **present-day
GLSL** problem that a chunk system (Section B) fixes now, and that happens to be
the exact mechanism that makes a second language survivable later. This is the
single most important insight in this document.

### A.4 Is "Phase 0 only, prefer WebGL2 instancing" sound?

**Yes.** Two independent arguments both land on it:

1. **The crash-prone devices get nothing from WebGPU (plan R2).** Correct and
   decisive. `MOBILE_TIER` iPhones on the WKWebView jetsam budget
   (`js/render/glx.js` mobile caps; `createTargets` goes out of its way to
   bind-before-delete to avoid transient double-resident surfaces,
   `js/render/glx.js:2276-2296`) are pre-iOS-26 and cannot run WebGPU at all. Spending
   XL+XL of shader-port effort on a path those devices can't execute, to
   *match* the current look, is poor ROI for a fan project.

2. **WebGL2 already has the one feature that would actually help every device:
   `drawElementsInstanced` / `vertexAttribDivisor`.** The plan's own "Alternative
   that beats a WebGPU port on ROI" is the strongest paragraph in the document.
   The chunked prop path (`createChunkedMesh`/`drawChunked`, and
   `castShadowChunked` at `js/render/glx.js:3707`) frustum-culls per chunk but still
   issues one draw per chunk; wheels, skid marks, and glow billboards are natural
   instance batches. **Instancing in `glx.js` lands on iOS 15 too.** This is a
   genuinely better use of the same graphics-engineering hours.

**One caveat I'd add to the plan:** don't let "prefer WebGL2 instancing" become
"rewrite the draw path for instancing speculatively." Instancing is only a win
where the scene is *draw-call bound*. Before doing it, measure with the existing
`perf-profile` skill on a dense night street circuit; if frame time is
fragment-bound (likely, given the 850-line `LIT_FS`), instancing buys little and
the effort should go to shader cost / LOD instead. The plan gestures at this
("real perf win only on draw-call-bound scenes") but should make measurement a
gate, not an afterthought.

### A.5 Smaller corrections / pushback

- **Async boot is a bigger blast radius than "Med" (plan R5) if done naively.**
  `js/game.js:39` is `if (!GLX.init(canvas)) {…}` at top-level module eval.
  Making it `await Gfx.create(...)` forces the entire top-level IIFE to become
  async, which changes *when* every subsequent top-level `const` initializes
  relative to the rest of the page. The plan's façade contains it, but the
  safe pattern is to keep `GLX.init` synchronous and have the façade return a
  **ready WebGL2 device synchronously** while only the *opt-in* WebGPU path
  awaits — i.e. don't pay the async tax on the default path at all. Worth
  spelling out in the plan.

- **Phase 2 and Phase 4 are correctly both XL, but the plan lets them look
  parallel.** They are not: Phase 4's composite SSR march reads the scene
  colour+depth that Phase 2 produces, and its tonemap/grade must match the
  WebGL2 composite *pixel-for-pixel enough* to pass visual regression. Sequence
  is forced. Fine — just flag that "XL + XL" is really "XL then XL," ~a
  quarter of a solo-dev year of specialist work, which reinforces "don't."

---

## B. The core maintainability problem: shader duplication

### B.1 The problem, precisely

`LIT_FS` and `COMPOSITE_FS` carry essentially all of the game's visual identity
and are edited often. A WebGPU port would fork them into WGSL with no tool to
keep the fork in sync. But even *without* WebGPU, the GLSL is already
un-DRY across passes (`vnoise` vs `vnoise2`, `js/render/glx.js:133` / `926`). Any fix
must work in a **no-build, pure-IIFE, static-hosted** project: no npm build, no
runtime transpiler blob, no `#include` preprocessor from disk.

### B.2 Options evaluated

**(i) Lightweight JS "shader chunk" system (minimal three.js `ShaderChunk`).**
> **EXECUTED (2026-07 reorg):** this is now the shipped shape — `js/render/shaders/chunks.js`
> holds the shared leaves as the `GLXChunks` global, and `lit.js`/`sky.js`/`fx.js`/`post.js`
> compose them into the `GLXShaders` sources (replacing the old monolithic `glx-shaders.js`).

Factor shared GLSL leaves — `hash21`, `vnoise`, `cloudFBM`, the GGX `D`/`V`/`F`
trio, `acesTonemap`, `colourGrade` — into named JS string constants, and
concatenate them into each program's source at load time.

```js
// js/render/shaders/chunks.js  (IIFE global — shipped as GLXChunks)
const NOISE = `float hash21(vec2 p){…} float vnoise(vec2 p){…}`;
const BRDF  = `float D_GGX(float NoH,float a){…} vec3 F_schlick(…){…}`;
const TONE  = `vec3 acesTonemap(vec3 x){…} vec3 colourGrade(vec3 c){…}`;
// js/render/glx.js  (unchanged authoring style — still template strings):
const LIT_FS = `#version 300 es
precision highp float;
${NOISE}\n${BRDF}
… body …`;
```

- **Pros:** zero build step (it's just JS string concatenation, works on GitHub
  Pages verbatim). Immediately removes the *present-day* `vnoise`/`vnoise2`
  duplication and makes the noise/BRDF/tonemap math **single-source across all
  passes today**. When WGSL arrives, the *same chunk names* have a `.wgsl`
  sibling constant, so a shared-math change is "edit two small leaves" instead
  of "hand-diff two 850-line files" — the shared structure is guaranteed
  identical because both languages compose the *same set of named pieces*.
- **Cons:** does **not** unify the language-specific glue (uniform decls, varying
  structs, control flow) — GLSL `uniform`/`in`/`out` vs WGSL `@group`/`struct`
  cannot be one string. So it de-duplicates the *leaves* (math), not the
  *trunk* (the big procedural-material switch, the composite pass structure).
  Line offsets in shader compile errors shift by the length of the prepended
  chunks (a debugging papercut — mitigate by keeping chunks short and by
  prepending a `#line` directive after them; GLSL ES 3.00 supports `#line`).

**(ii) Common-subset authoring + tiny runtime GLSL→WGSL shim.**
Author shaders in a restricted GLSL-ish subset and string-transform to WGSL at
load (regex `texture(`→`textureSample(`, `vec3`→`vec3<f32>`, etc.).

- **Pros:** one authored source, in principle.
- **Cons:** **rejected.** The two languages diverge exactly where these shaders
  are hardest: texture+sampler *splitting* (GLSL `texture(s,uv)` → WGSL needs a
  separate `texture_2d` and `sampler` binding, not a syntactic swap),
  `sampler2DShadow`+compare → `texture_depth_2d`+`sampler_comparison`+
  `textureSampleCompare`, loose uniforms → bind groups, and WGSL's strict typing
  (`1.0` not `1`, explicit `f32()` casts). A regex shim that handled all of that
  correctly *is* a compiler, and a wrong transform is a **silent visual bug** with
  no compile error — the worst failure mode in a no-build project. The
  NaN-guard `pow` footguns the plan flags (R4) are precisely the kind of thing a
  naive shim mangles. Net: this trades a visible, testable duplication for an
  invisible, untestable one. Do not build this.

**(iii) Fully separate, co-located, "edit both" checklist + test.**
Keep two independent shader files; enforce sync via a code-review checklist and a
test that fails if one changed without the other.

- **Pros:** zero cleverness, maximum clarity per language, no concatenation
  offset issues.
- **Cons:** relies on human discipline for the hot path; a checklist does not
  survive contact with a Friday-night art tweak. A test that only checks "both
  files touched in the same commit" is trivially defeated and catches nothing
  semantic. This is the *fallback* posture the migration plan's R1 already
  assumes, and it is exactly the risk we're trying to reduce.

### B.3 Recommendation

**Adopt (i) — the minimal chunk system — and do it NOW, before any WebGPU
decision.** Reasoning:

1. It pays for itself in the *current* single-language codebase by killing the
   `vnoise`/`vnoise2` duplication and giving every pass access to one BRDF/noise/
   tonemap source. That is a real maintainability win with no WebGPU commitment.
2. It is the *only* option compatible with no-build static hosting that reduces
   the two-language drift without introducing an invisible-bug transpiler.
3. It converts the future WGSL fork from "two 850-line files drift silently"
   into "the math leaves are shared by name; only the language-specific trunk is
   duplicated, and the trunk is the part a human *can* eyeball." That is the
   difference between an unmaintainable fork and a merely-annoying one.

Combine (i) with the *disciplined part* of (iii): once chunks exist, add a tiny
test asserting that each named chunk is referenced by every program that should
use it (cheap structural check), so a new pass can't silently re-inline its own
`vnoise` again.

Scope it small: a `ShaderChunks` IIFE global holding ~6-10 named string
constants, loaded before `glx.js`. Do **not** build a dependency graph, a
`#include` resolver, or `#define` injection — that is three.js-scale machinery
this project doesn't need.

---

## C. Refactors worth doing NOW (regardless of whether WebGPU ever happens)

Each entry: **what**, **why it helps maintenance today**, **effort (S/M/L)**,
**risk**, **does it de-risk the port?**

### C.1 Shader chunk system for shared GLSL math

> **Status: EXECUTED** in the 2026-07 architecture reorg — `js/render/shaders/chunks.js`
> (`GLXChunks`) + `lit.js`/`sky.js`/`fx.js`/`post.js` assembling `GLXShaders`.

- **What:** Section B option (i). Extract `hash21`/`vnoise`/`cloudFBM`
  (`js/render/glx.js:128/133/323`), the GGX trio around `D_GGX` (`js/render/glx.js:107`),
  `acesTonemap`/`colourGrade` (`js/render/glx.js:1644/1652`) into named string
  constants in a new `js/render/shaders/chunks.js`; concatenate into the program
  sources. Delete `vnoise2` (`js/render/glx.js:926`) in favour of the shared chunk.
- **Why (today):** single source for the game's core procedural math; removes an
  existing verbatim duplication; a noise/tonemap tweak stops being a
  find-all-copies exercise.
- **Effort:** **S-M** (mechanical extraction + one careful `#line` fix for error
  offsets).
- **Risk:** **Low** — output is byte-identical GLSL after concatenation;
  visual-regression pixel-diff proves zero delta.
- **De-risks port:** **Yes, strongly.** This is the mechanism that makes a
  two-language shader fork survivable (Section B).

### C.2 Split `glx.js` into cohesive modules behind the same `GLX` object

> **Status: EXECUTED (variant)** in the 2026-07 reorg — shipped as
> `js/render/glx/post.js` / `shadow.js` / `chunked.js` (`GLXPost`/`GLXShadow`/`GLXChunked`,
> wired through a shared `GLXCore` context object), with the shader strings split
> separately under `js/render/shaders/` (see C.1).

- **What:** Physically split the 3,770-line file into `js/glx/shaders.js`
  (all the VS/FS template strings + chunk composition), `js/glx/targets.js`
  (`createTargets`, `initPost`, the render-target set, `js/render/glx.js:2200-2453`),
  `js/glx/passes.js` (shadow/env/post pass orchestration), and keep
  `js/render/glx.js` as the thin IIFE that wires them and **returns the identical ~35-
  method object** (`js/render/glx.js:3693-3769`). No public surface change.
- **Why (today):** the file is too big to hold in one head; shaders, target
  allocation, and pass sequencing are three independent concerns edited by
  different skills (`webgl-debug`, `lighting-tuner`, `bake-lighting`). Splitting
  lets an art tweak touch `shaders.js` without scrolling past target allocation.
- **Effort:** **M** (must preserve the closure-shared mutable state — `gl`,
  target handles, `litU` uniform maps — which currently all live in one lexical
  scope; splitting means passing a shared context object or keeping them in a
  small core module the others import via globals). This is the fiddly part.
- **Risk:** **Med** — pure mechanical move, but the shared-closure refactor can
  introduce load-order bugs; guard with the full visual suite. No-build means
  script-tag order in `index.html` matters (cache-bust bump required).
- **De-risks port:** **Yes** — `js/render/webgpu/wgx.js` mirrors `passes.js`/`targets.js`
  cleanly when they're already separated by concern; the port becomes
  "reimplement three cohesive modules" not "re-derive one 3,700-line blob."

### C.3 Make the ~35-method draw API an explicit, documented interface

- **What:** Write down the contract that the `GLX` return object
  (`js/render/glx.js:3693-3769`) already *is*: for each method, its signature, the
  shape of the `frame` object `begin()` consumes and the `opts` object
  `present()`/`draw()` consume, and the required call ordering (`shadowBegin` →
  `castShadow*` → `shadowEnd` → env faces → `begin` → `drawSky` → `draw*` →
  `present`, per Migration Step 1e). This is a doc + optional JSDoc typedefs, not
  code.
- **Why (today):** 109 call sites in `game.js` depend on undocumented object
  shapes; `frame` and `opts` are grab-bags assembled far from where they're
  read. A written contract is the difference between "safe to refactor either
  side" and "grep and pray."
- **Effort:** **S** (documentation).
- **Risk:** **None** (no code change).
- **De-risks port:** **Yes** — this *is* the backend seam. `wgx.js` needs an
  exact spec of `frame`/`opts`; writing it down now is Phase 0's real content,
  extracted from the risky async-boot rename.

### C.4 Extract the light-upload + flat-stride layout into one place

- **What:** The stride-15 light layout is decoded inline in `begin()`
  (`js/render/glx.js:2952-2977`) into six scratch `Float32Array`s and uploaded with
  six `uniform*fv` calls. Pull the layout constants (`stride=15`, field offsets)
  and the unpack loop into one small named unit with the offsets as named
  constants; `begin()` calls it.
- **Why (today):** the magic numbers `o+0..o+14` and the parallel
  `_luPos/_luCol/_luRad/_luDir/_luCone/_luBleed` scratch arrays are error-prone;
  field 13 (`volW`) and 14 (`glareW`) are consumed in *other* passes
  (god-ray, `drawGlow` at `js/render/glx.js:3281`) with the offsets duplicated there.
  One layout definition removes the "which index is `cosOuter` again?" hazard.
- **Effort:** **S**.
- **Risk:** **Low** (visual suite catches any mis-indexing).
- **De-risks port:** **Yes** — the plan calls this flat layout "a gift" for
  WebGPU because it maps onto a storage buffer verbatim (Migration 2b/2c). A
  single named layout unit is exactly what the WGSL struct-writer mirrors; the
  offsets become the buffer offsets.

### C.5 Enumerate and name the render-state combos (kill scattered GL toggles)

- **What:** `draw()` imperatively toggles `setDepthMask`, `setBlend`,
  `colorMask` (`noAlphaWrite`), `disable(CULL_FACE)` (`doubleSided`), plus
  polygon-offset for shadows/marks (`js/render/glx.js:3006-3023`). Enumerate the actual
  combinations used (opaque / alpha-blend / additive × cull-on/off ×
  alpha-write-on/off — a handful) and represent each as a named state descriptor
  the draw path selects, instead of ad-hoc per-call `enable`/`disable`.
- **Why (today):** the "each draw declares full state, no restores" convention
  (`js/render/glx.js:3006`) is clever but means the legal state space is implicit and
  spread across `draw`/`drawGlow`/`drawMark`/`drawSkidBatch`. Naming the combos
  documents what states exist and makes the state-cache logic auditable.
- **Effort:** **M**.
- **Risk:** **Med** — touches the hot draw path; behaviour must stay identical,
  and the existing per-state caching (`setBlend`/`setDepthMask` short-circuits)
  must be preserved. Visual + collision/behaviour suites as guard.
- **De-risks port:** **Yes, strongly.** WebGPU pipelines are **immutable** and
  each blend/cull/depth combo is a distinct pipeline object baked at init
  (Migration 2e). Enumerating the combos now *is* the pipeline inventory the
  WebGPU backend needs — you'd do this work either way, so do it in a form that
  also cleans up the WebGL2 path.

### C.6 Consolidate render-target management into a described table

- **What:** `createTargets` (`js/render/glx.js:2261+`) allocates ~14 targets
  (scene/depth/MSAA/bloom mips/SSAO/god-ray/LDR/shadow/blocker/env) with the
  careful bind-before-delete discipline (`js/render/glx.js:2276-2296`). Represent the
  target set as data (a table of `{name, format, sizeRule}`) driven through one
  allocate/free helper, rather than ~14 hand-written blocks.
- **Why (today):** the bind-before-delete jetsam-avoidance rule
  (`js/render/glx.js:2276`) must be repeated correctly for *every* target; a
  data-driven allocator applies it once. Resize/render-scale changes currently
  re-run the whole hand-written sequence.
- **Effort:** **M** (formats and size rules vary — half-res, mip chain, cube;
  the table needs a few size-rule kinds).
- **Risk:** **Med** — memory-management code on the exact path that kills mobile
  if botched; needs careful review, not just pixel tests (a leak passes
  pixel-diff). Lower priority than C.1/C.3/C.4 for that reason.
- **De-risks port:** **Yes** — maps directly onto the WebGPU
  `GPUTexture`/`GPURenderPassDescriptor` set (Migration 2d); a target table is
  what `wgx.js` iterates to build its passes.

### C.7 (Adjacent) WebGL2 instancing for props/wheels/skids — measure first

- **What:** Move the chunked prop draws, car wheels, skid batch, and glow
  billboards to `drawElementsInstanced` in `glx.js`.
- **Why (today):** real frame-time win on **every** device including the
  crash-prone ones (unlike WebGPU) — the plan's best ROI alternative.
- **Effort:** **M-L**.
- **Risk:** **Med**, and **gated on measurement** — only worth it if
  `perf-profile` shows a draw-call-bound frame (see A.4). May be fragment-bound,
  in which case skip.
- **De-risks port:** **Yes** — instancing is Phase 5 of the plan; doing it in
  WebGL2 first proves the batching boundaries.

---

## D. Prioritized, incremental refactor roadmap

Ordered so each step is independently shippable, behaviour-preserving, and
verifiable with the **existing** harness (`npm run test:visual` pixel-diff,
`test:fast`, `playwright-probe` deterministic screenshots,
`__apex.lightState/probe/wallStats` numeric asserts, `verify-track.cjs` for any
tracks.js touch). Every JS/CSS edit requires the `?v=N` + `version.json` bump
(see `CLAUDE.md` / `bump-cache` skill).

| # | Step | Section | Effort | Category | Gate |
|---|------|---------|--------|----------|------|
| 1 | **Document the draw-API contract** (`frame`/`opts` shapes, call ordering) as `docs/` + JSDoc typedefs. No code change. | C.3 | S | **Do anyway** | Doc review; no pixel change possible. |
| 2 | **Shader chunk system**: extract shared noise/BRDF/tonemap to `js/render/shaders/chunks.js`; delete `vnoise2`; add `#line` fix. **EXECUTED** (2026-07 reorg: `GLXChunks`). | C.1 / B | S-M | **Done** | `test:visual` shows **zero** delta (concatenation is byte-identical GLSL). |
| 3 | **Extract light-upload + stride-15 layout** into one named unit with offset constants. | C.4 | S | **Do anyway** | `test:visual` + `__apex.lightState()` unchanged. |
| 4 | **Enumerate render-state combos** into named descriptors; keep the state-cache short-circuits. | C.5 | M | **Do anyway** (also the WebGPU pipeline inventory) | `test:visual` + `test:behaviour`/`test:collision`. |
| 5 | **Split `glx.js`** into `shaders.js` / `targets.js` / `passes.js` behind the unchanged `GLX` return object. | C.2 | M | **Do anyway** | Full `test:visual`; verify `index.html` script order + cache bump. |
| 6 | **Consolidate render targets** into a data-driven table through one allocate/free helper (preserving bind-before-delete). | C.6 | M | **Do anyway** (memory hygiene) | `test:visual` **plus** a manual mobile-memory review (pixel-diff can't see a leak). |
| 7 | **(Measure)** `perf-profile` a dense night street circuit. If draw-call-bound → **WebGL2 instancing** for props/wheels/skids/glow. | C.7 | M-L | **Do anyway *if* measured win** | `perf-profile` flame chart shows lower CPU frame time; `test:visual` unchanged. |
| — | ↓↓↓ everything below is **only if committing to WebGPU** ↓↓↓ | | | | |
| 8 | **`Gfx` façade + async-safe boot** (WebGL2 synchronous on the default path; only opt-in WebGPU awaits). Route the 109 `GLX.` sites through the handle. Expose `__apex.gfxBackend()`. | Plan Phase 0 | M | WebGPU-only | `test:fast` + `test:visual` zero delta on the WebGL2 path. |
| 9 | **WGSL chunk siblings** for the shared math (`.wgsl` constants paired with step 2's names). | B.3 | S-M | WebGPU-only | N/A until a WebGPU pass exists. |
| 10 | **WebGPU device/clear/swapchain stub** (`js/render/webgpu/wgx.js`). | Plan Phase 1 | M | WebGPU-only | iOS 26/Chrome boots + clears; old iOS still WebGL2. |
| 11 | **Lit + Sky WebGPU pass** (buffers from step 3's layout, pipelines from step 4's combos, dynamic-offset per-draw). | Plan Phase 2 | XL | WebGPU-only | Side-by-side `__apex.park()` screenshots, 5 tracks day+night. |
| 12 | **Shadow + env probe**, then **post chain**, then **instancing/perf**. | Plan Phase 3-5 | L+XL+L | WebGPU-only | Per-backend golden images; `perf-profile`. |

**Read of the table:** steps **1-6 are pure maintainability wins** with no
WebGPU commitment — they shrink and document `glx.js`, and each is independently
shippable behind the existing pixel-diff gate. Step 7 is a real perf win for all
devices if (and only if) measurement justifies it. Steps 1, 3, 4, and 6 also
happen to *be* the artifacts a WebGPU backend needs (the contract, the light
layout, the pipeline inventory, the target table), so doing them first makes a
future Phase 0-2 dramatically cheaper — **without paying for WebGPU up front.**
Steps 8-12 stay gated on the plan's "named concrete payoff" test.

The key sequencing insight: the migration plan puts the `Gfx` façade (step 8)
first as "Phase 0." This review moves the *internal* refactors (1-6) ahead of it,
because they are the ones that actually reduce maintenance cost today, they
de-risk the eventual port more than the rename does, and they're strictly lower
risk. Do the seam when — and only when — WebGPU is genuinely committed.

---

## Summary

- **Verdict on the plan:** sound and honest; adopt its recommendation ("Phase 0,
  then stop unless a concrete payoff appears"). One reframing: Phase 0 (the
  `Gfx` façade + async boot) is a cheap *prerequisite*, not a standalone
  maintainability win — the seam it "introduces" already exists as the `GLX`
  return object (`js/render/glx.js:3693-3769`). The real maintenance cost lives *inside*
  `glx.js` (the two ~850/390-line hand-tuned shaders and the per-draw imperative
  GL state), which Phase 0 doesn't touch. Biggest risk (plan R1) is correctly
  identified: two shader languages, no build, no compiler to catch drift — and
  that duplication problem *already exists today* (`vnoise` at `js/render/glx.js:133` is
  re-inlined as `vnoise2` at `js/render/glx.js:926`).

- **Recommended shader-sharing approach:** a **minimal JS "shader chunk"
  system** (three.js `ShaderChunk`, stripped to ~6-10 named string constants
  concatenated at load). It's the only no-build-compatible option that reduces
  drift without introducing an invisible-bug runtime transpiler; it pays off in
  the current single-language codebase immediately, and it makes an eventual WGSL
  fork survivable by sharing the math leaves by name.

- **Top 3 "do-anyway" refactors:** (1) shader chunk system for shared
  noise/BRDF/tonemap math; (2) document the ~35-method draw-API contract and its
  `frame`/`opts` shapes — that *is* the backend seam, written down at zero risk;
  (3) extract the stride-15 light-upload layout (`js/render/glx.js:2952-2977`) into one
  named unit with offset constants. All three are low-risk, pixel-diff-verifiable,
  useful today, and each is exactly an artifact a future WebGPU backend would
  need anyway.
