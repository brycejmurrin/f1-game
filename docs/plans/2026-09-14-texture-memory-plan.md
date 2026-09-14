# Texture Memory Plan — where the bytes actually are

> **Status:** written 2026-09-14, after the vertex-format packing landed
> (`vertex-pack.js`, GLX/WGX/TLX). Steps use checkbox (`- [ ]`) syntax.

**Goal:** the world GEOMETRY is done — packed to 28 B/vertex and, separately,
measured to be at its theoretical ordering optimum. What is left is TEXTURE
memory, where the single biggest number in the game has never been measured.

**Architecture:** no change to how anything is drawn. Task 1 adds an
instrument; Task 2 changes a resolution policy that already exists for mobile;
Tasks 4-5 are decisions, not implementations.

**Tech stack:** browser IIFE JavaScript, Node test runner, WebGL2, WebGPU,
Playwright tooling.

## Global constraints

- **Measure before acting.** `notes/PERF-FINDINGS.md` §0 exists because picking
  the wrong instrument here does not give a worse number, it gives a confident
  number about the wrong thing. Task 1 blocks Task 2 for that reason.
- No new runtime dependencies and no generated-file edits without an explicit
  decision (Task 4 is exactly that decision, and is NOT pre-approved).
- The player's own car, the garage, photo mode and the car studio keep their
  current fidelity. Any resolution policy is about AI cars at racing distance.
- A software probe is not evidence about a player's GPU. Anything touching
  sampling or format goes through `gpu-census.yml` on `macos-latest`.

---

## What is already settled — do not re-derive these

**The world VBO is packed.** 40 → 28 B/vertex on GLX (−29.5 %: 784.8 MB → 553.3
MB across the fleet, a mean circuit 19.6 → 13.8 MB), 36 → 28 on WGX, 40 → 36 on
the TLX WebGPU leg. `js/render/shared/vertex-pack.js` owns the quantisers.

**Vertex-cache reordering would gain NOTHING — measured, 2026-09-14.**
meshoptimizer is the obvious next lever on 20.2 M static vertices and it is a
dead end here. ACMR looks alarming on props (2.00–2.26 against a 3.0 worst
case) but ACMR is FLOORED by verts/tris, and props are quad soup at 2.0
verts/tri because flat shading needs unshared normals. The metric that is not
misleading is ATVR — vertex-shader invocations per vertex, best case 1.0:

| mesh | tris | verts | v/tri | ACMR(32) | **ATVR** |
|---|---|---|---|---|---|
| props (vegas) | 265,524 | 531,048 | 2.00 | 2.00 | **1.000** |
| props (monza) | 171,830 | 370,224 | 2.15 | 2.15 | **0.998** |
| props (spa) | 141,270 | 319,866 | 2.26 | 2.26 | **0.998** |
| road | 66,372 | 38,720 | 0.58 | 0.58 | **0.994** |
| terrain | 57,760 | 31,768 | 0.55 | 0.55 | **1.000** |

Every large mesh transforms each vertex exactly once. There is no reordering
win available, on road, terrain or props. Do not re-open this.

---

### Task 1: An instrument for texture bytes

**This blocks Task 2.** The 147 MB figure below is ARITHMETIC from source
constants, not a measurement — `liverytex.js` `SIZE = 1024`, `SIZE_H = 1280`,
RGBA, mipmapped through `createTexture`, one atlas per car:

```
one livery atlas    1024 x 1280 x 4       =  5.00 MB
with mips           x 1.333               =  6.67 MB
a full 22-car grid                        =  147 MB
the packed world VBO, mean circuit        =  13.8 MB
```

If that arithmetic holds, car liveries are roughly TEN TIMES the world geometry
this session spent its time packing. Nothing in the tree can currently confirm
or refute it: there is no texture-memory hook, and `__tlx.memState()` covers
three's retained counts on the TLX leg only.

**Files:**
- Modify: `js/render/glx/glx.js` (record dimensions + format per `createTexture`
  / `createTextureArray`, freed on `deleteTexture`)
- Modify: `js/agent/agentview.js` (expose `texCensus()`)
- Modify: `docs/DEBUG-HOOKS.md`, `docs/AGENT-WORLD-API.md`
- Add: a new texture-census suite under `tests/unit/` (this plan creates it;
  it is deliberately not named as a live path until it exists)

- [ ] Write the test first: a stub GL context, three textures of known size,
      one deleted; assert the census reports the surviving two and the exact
      byte total including the 1.333 mip factor.
- [ ] Confirm it fails (no census exists).
- [ ] Implement the accounting in GLX and the `texCensus()` hook.
- [ ] Confirm the test passes, and that a census with NO textures reports zero
      rather than `undefined` — `notes/PERF-FINDINGS.md` §2i/§2j are both about
      instruments that could not say "I measured nothing".
- [ ] Take the reading: `node tools/shot/apex-eval.mjs montreal "a.texCensus()"`
      on a full grid. Record the livery share in `notes/PERF-FINDINGS.md`.

**Done when:** the 147 MB is confirmed, refuted, or replaced by the real
number, and that number is in the ledger.

### Task 2: A desktop AI livery tier — GATED ON TASK 1

Mobile already downshifts (512 for the player, 256 for AI; `liverytex.js`
~3041). Desktop gives all 22 cars the full 1024×1280. An AI car at racing
distance is a few hundred pixels; at 512 its atlas costs a quarter as much.

Indicative only — the real figures come from Task 1: 21 AI cars at 512 plus the
player at full would be ~42 MB against ~147.

**Files:**
- Modify: `js/car/liverytex.js` (the tier decision), `js/car/car-draw.js`
- Modify: `tests/unit/team-livery.test.mjs`

- [ ] Decide the policy and WRITE IT DOWN before coding: which cars, what
      trigger, and what happens when an AI car fills the screen — a mirror, a
      photo-mode frame, a replay close-up, the podium. A fixed downshift with
      no upgrade path WILL be visible in photo mode.
- [ ] Test first: assert the player's atlas is unchanged and an AI atlas is the
      reduced size, on the desktop tier.
- [ ] Implement; keep the existing mobile policy untouched.
- [ ] Re-take the Task 1 census and record before/after.
- [ ] Visual check that this is NOT a look regression: `playwright-probe` car
      studio renders of an AI livery at racing distance and at photo-mode
      distance, before and after.
- [ ] `gpu-census.yml` on `macos-latest` — real hardware, not lavapipe.

**Risk:** this is the one task here that can visibly degrade the game. The
census number is large enough to be worth it; the policy is what decides
whether anyone notices.

### Task 3: Record the negative results — cheap, do any time

**Files:**
- Modify: `docs/notes/PERF-FINDINGS.md`

- [ ] Add the ATVR table above under "Recorded negative results", with the
      reasoning that ACMR alone is misleading because it is floored by
      verts/tris. The value of this entry is stopping the next session from
      spending a day on meshoptimizer.
- [ ] Add the TLX colour rows from the 2026-09-14 bisect (control 45.6 / normal
      45.6 / colour 42.9 / both 42.8 / Float16BufferAttribute 39.1).

### Task 4: KTX2 / UASTC material arrays — DECISION FIRST, NOT PRE-APPROVED

Supersedes the earlier "strips → lossless WebP" idea, which was the wrong
frame: WebP saves 525 KB of DOWNLOAD and nothing else, because image formats
decompress to full RGBA on upload. Block-compressed formats stay compressed in
VRAM — 4–8× less memory, 4–8× faster upload, and better sampling cache
behaviour on every textured fragment.

The 17-layer albedo + normal arrays are ~11.9 MB of VRAM at the 256 tier;
UASTC would take that to ~3 MB.

**Why this is a decision and not a task.** It needs an offline encoder in the
bake pipeline, a Basis transcoder (~300 KB of wasm) at runtime, and compressed
texture-array upload paths in all three backends. That is a build step and a
dependency, against the standing rule in `AGENTS.md`. It also has a real cost:
Basis transcoding is SLOWER than decoding WebP/AVIF and its files are often
larger than AVIF — so this is a VRAM-and-bandwidth play, not a download one.

- [ ] Decide whether ~9 MB of VRAM and better sampling locality justify a wasm
      dependency and a bake-time encoder. If NO, record the refusal here and
      close it; a standing "maybe" costs more than a decided "no".
- [ ] If yes: UASTC, **not** ETC1S. ETC1S is fine for colour and poor for
      normal maps, and half of this pack IS normal maps.

### Task 5: Two open TLX colour questions — need real hardware

- [ ] The WebGL2 leg quantises vertex colour to a byte today. The 2026-09-14
      bisect measured that cost at ~6 % of mean luma on the WebGPU leg; the
      WebGL2 leg is probably paying the same where nobody can see it, because
      the probe cannot read a frame there. Find an instrument that can.
- [ ] three's `Float16BufferAttribute` at itemSize 4 measured DARKER (39.1) than
      the 8-bit path (42.9), which is backwards on precision grounds. The
      encoder was ruled out — `tlx-chunked.js` `_toHalf` now rounds and agrees
      with `vertex-pack.js` on 400 k samples. So the fault is in how three
      hands that array to the WebGPU backend. Unexplained; do not ship colour
      packing on that leg until it is understood.

---

## Order

Task 1, then Task 2. Task 3 any time. Task 4 is a decision to be taken, not
work to be started. Task 5 is blocked on an instrument that does not exist yet.

The through-line: this session's geometry work was real but it was one order of
magnitude below the biggest number in the game, and nobody knew that because
nobody had measured textures. Task 1 is the whole point of this plan.
