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

- [x] Write the test first — `tests/unit/tex-census.test.mjs`, against the REAL
      glx.js through `tests/helpers/glx-mock.mjs`. Asserts the EXACT mip-chain
      sum, not `w*h*4*1.333`: that rule assumes a square texture and the livery
      atlas is 1024×1280, so the test also asserts the rule-of-thumb answer is
      NOT what the census returns.
- [x] Confirm it fails (`texCensus is not a function`, 7/7 red).
- [x] Implement the accounting in GLX and the `texCensus()` hook.
- [x] Confirm it passes, including: an empty census reports 0 rather than
      `undefined`, a freed texture leaves the ledger, and a lost context reports
      nothing resident instead of the last number it held.
- [x] Declare `texCensus: undefined` in WGX and TLX. Not a silencer — game.js
      installs a backend by descriptor-copy onto GLX, so an absent NAME would
      keep GLX's own function and run it against a null `gl`.
- [x] Take the reading. **CONFIRMED, montreal, full grid, GLX:**

```
content2D      153,791,000 B   146.67 MB   22 livery atlases, 1024x1280
materialArray   11,883,816 B    11.33 MB   baked albedo + normal arrays
                               158.00 MB   total counted
```

**Done.** The estimate held (147 → 146.67, 11.9 → 11.33) and the liveries are
**10.6× the packed world VBO** at 13.8 MB on a mean circuit. Recorded in
`notes/PERF-FINDINGS.md` §2v.

### Task 2: A desktop AI livery tier — GATED ON TASK 1

Mobile already downshifts (512 for the player, 256 for AI; `liverytex.js`
~3041). Desktop gives all 22 cars the full 1024×1280. An AI car at racing
distance is a few hundred pixels; at 512 its atlas costs a quarter as much.

**Now backed by Task 1's measurement, not an estimate.** 22 atlases really are
resident and really do cost 146.67 MB. 21 AI cars at 512 plus the player at
full would be ~42 MB against that — the single largest saving available
anywhere in the renderer, and roughly TEN TIMES what this session's whole
vertex-packing effort returned per circuit.

**Files:**
- Modify: `js/car/liverytex.js` (the tier decision), `js/car/car-draw.js`
- Modify: `tests/unit/team-livery.test.mjs`

- [x] **THE POLICY, decided 2026-09-14 and written down before any code:**

      1. Desktop, in race: the player's car keeps the full 1024×1280 atlas;
         AI cars upload at 512×640 (`div` 2). Mobile is UNCHANGED — it already
         runs 512 player / 256 AI and has a tighter jetsam budget than this
         change is about.
      2. **Close-up contexts get the full tier for every car.** The garage and
         setup preview already do, because they pass `usePlayerSetup`. Photo
         mode is the gap the plan called out, and it is now an explicit
         exemption: while `G.photoMode` is on, `drawCarDecals` requests the
         full tier regardless of whose car it is.
      3. The upgrade is DEMAND-DRIVEN and costs nothing until it is needed.
         `getCarDecalTexture` is called from the per-drawn-car path, and the
         resolution tier is already part of the cache key (the `:P` suffix,
         which exists because a team the player switches to must not reuse a
         cached AI-resolution atlas). So flying the photo camera up to one car
         mints ONE full-res atlas, not twenty-one — there is no entry stall,
         and leaving photo mode falls back to the cached AI atlases.
      4. Mirrors and replays need nothing: both draw through the same
         per-car path, so if a close-up context is ever added it inherits
         the same exemption by passing the flag.

      What this does NOT do: upgrade an AI car that merely happens to be close
      during normal racing. At racing distance an AI car is a few hundred
      pixels and 512×640 is ample; buying the last few metres of approach
      would cost a per-frame distance test in the draw path and mint atlases
      mid-race, which is the wrong trade against a stutter.
- [x] Test first — `tests/unit/livery-tier.test.mjs`. Rasterising a livery needs
      a browser (the boundary `parts-sweep.mjs` draws), so the tier DECISION was
      extracted as a pure `atlasDiv()` and pinned headlessly instead: exact
      divisors per tier, mobile asserted UNCHANGED, the grid saving asserted to
      exceed 90 MB, plus an ordering guard so a swapped ternary cannot pass by
      rewriting the exact values together.
- [x] Implement; mobile policy untouched.
- [x] Re-take the Task 1 census. **MEASURED, montreal, full grid:**

```
before   146.67 MB   22 atlases, every car at 1024x1280
after     41.67 MB   player still 1024x1280 (census `biggest` confirms), 21 AI at 512x640
         -105.00 MB  -71.6 %
```

      For scale: that is ~18x what the entire world-VBO packing returned on a
      mean circuit (5.8 MB), from a change that touches one ternary.
- [ ] **NOT DONE — a dedicated AI close-up A/B.** The census proves the memory
      and `tex-census` proves the tier, but neither proves APPEARANCE. What is
      missing is a before/after render of an AI livery at racing distance and
      at photo-mode distance. The argument for shipping without it is that
      mobile already ships AI atlases at 256 and this is a gentler step to 512,
      and that photo mode now takes the full tier — an argument, not a
      measurement. Capture it before trusting this on a hero shot.
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

The 17-layer albedo + normal arrays measure **11.33 MB** (Task 1); UASTC would
take that to ~2.8 MB, so the prize is ~8.5 MB.

**Task 1 demoted this, on evidence.** "Compress the textures" is the obvious
move and it is the SMALL one: the liveries are 13× these arrays. Task 2 is
worth an order of magnitude more and costs a resolution policy rather than a
wasm transcoder. Do Task 2 first.

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
