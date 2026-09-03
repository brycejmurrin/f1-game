# Asset API research — external models, textures and normal maps

How Apex 26 could ingest real 3D models and PBR texture/normal maps without
giving up the things that make it what it is: no build step, no ES modules,
static hosting, offline-first.

Companion to the rendering and scenery research in `docs/README.md`.

Status: **implemented** (2026-08). See §7 for what shipped, what is stubbed and
what is still open. The research below is kept as the rationale.

---

## 1. Where the game stands today

### 1.1 There are no image textures on the world

The lit pipeline is **vertex colour + a per-vertex procedural material id**.
The interleaved lit vertex is `pos(3) + nrm(3) + col(3) [+ mat(1)] [+ trk(3)]`
(`createMesh()` in `js/render/glx/glx.js`) — **there is no UV channel at all** on
the lit path, and none on the chunked prop path either (`createTexMesh()` is
the *separate* textured-decal layout, and the only one carrying `uv`).

Surface detail comes from `js/render/glx/shaders/glsl-lit.js`:

- `matBumpHeight(mid, uv)` (`lit.js:196`) — a scalar relief height per material
- `applyMaterialNormal(mid, N, vd)` (`lit.js:247`) — 3-tap gradient → real
  normal perturbation, consumed *before* the lighting terms
- `applyMaterial(mid, albedo, rough, vd)` (`lit.js:779`) — albedo + roughness

All of it is triplanar world-space value noise. Wall-like materials key off
`(hc, y)`; organic/horizontal ones key off world `(x, z)` (`lit.js:242-280`).
**This is the single most important fact for everything below:** the shader
already has a UV-free coordinate convention with grazing-angle `fwidth()`
antialiasing (`lit.js:266-267`) and distance fades. A texture can drop straight
into that convention without the game ever needing to unwrap anything.

`TrackGeom.MAT` (`js/track/core/geom.js:14-30`) is 17 ids: `FLAT, CONCRETE, BRICK,
GLASS, METAL, WOOD, FOLIAGE, FABRIC, SAND, GRASS, ROCK, SNOW, ROOF, STONE,
RUST, FLAG, ASPHALT`.

### 1.2 Image textures exist, but only on the car

Two paths already carry real textures:

| path | source | where |
|---|---|---|
| livery / sponsor decals | `LiveryTex.buildAtlas()` — canvas 2D, generated at runtime | `game.js:1048-1055`, `carmesh.js:126-176` |
| lens-dirt for the flare | procedural canvas | `glx/post.js:174-180` |

`gfx.createTexture(src)` (`createTexture()` in `glx.js`) takes a canvas/image, mipmaps it,
and applies anisotropy. `createTexMesh({pos,nrm,uv,idx})` + `drawDecal()` are
the UV-carrying pair. So the *plumbing* for images exists — it has simply never
been pointed at anything but a canvas.

Texture units in use: 0 (shadow), 5 (env cube), 6, 7 (blocker), 8 (car shadow),
9 (lamp shadow). **Units 1–4 and 10+ are free**; WebGL2 guarantees ≥16.

### 1.3 There is already a model-import seam — and it is unused

`js/render/shared/gltf.js` is a 453-line binary-glTF reader that produces plain
`{pos, nrm, col, idx}`. Its header is explicit about what it drops
(`gltf.js:24-25`): *"Intentionally NOT supported: textures/UVs, external .bin or
image URIs, Draco / meshopt compression, animations, skins/morphs."* Material
colour comes from `baseColorFactor` only (`gltf.js:348-351`).

`loadCarModel(url)` (`game.js:1395-1411`) fetches a `.glb`, validates it through
`GLTF.toMesh`, and on success rebuilds every team mesh from it. It is
**deliberately never auto-called** — the comment says *"Drop in a model then
call this once a CC-licensed .glb is available."* It is exposed as
`__apex.loadCarModel` (`js/agent/apex.js:874`).

So a previous pass already built the door and left it unlocked. Nobody has
walked through it because there is no asset acquisition story.

### 1.4 The constraints that any proposal has to respect

- **No build step, no ES modules.** Every file is a `"use strict"` IIFE
  assigning one global, listed in `tools/manifest.cjs` and `index.html`.
- **Static GitHub Pages.** No server, no API keys at runtime.
- **Offline-first PWA.** `sw.js` discovers its precache by parsing the shell's
  own tags, and caches `assets/` **opportunistically** on first fetch
  (`sw.js:10-13`). New binary assets therefore inflate the *warm* cache, not
  the install.
- **Vendoring is already accepted practice.** `vendor/three-0.184.0/` is ~1 MB
  of committed third-party code (`sw.js:36-45`), marked optional so GLX users
  never pay for it. That is the precedent for committed binary assets.
- **RENDERING-IMPROVEMENTS.md Part 2 rejected impostors and billboard
  vegetation** on the grounds that they *"require a baked RGBA atlas and UVs —
  violates no-external-assets, no-build-step."* The proposal below is the
  argument for relaxing exactly one half of that: **no build step at *runtime*,
  but an offline bake tool in `tools/` is fine** — the same category as
  `tools/verify-track.cjs`. `assets/` already ships fonts, icons, music and sfx.

---

## 2. The asset APIs — what is actually usable

> **VERIFIED 2026-08-01, from a real browser.** The sandbox this was written in
> has no egress to either host (403 on `CONNECT`), so the shapes below were
> originally taken from the published specs. They have since been probed live.
> Three corrections, recorded here because two of them change the design:
>
> 1. **Poly Haven CORS is OPEN** (`/assets` and `/files/{id}` both 200 from a
>    browser). **ambientCG is BLOCKED** cross-origin ("Load failed"). §2.2's
>    recommendation of ambientCG as the first choice for tarmac only holds from
>    node; it cannot be reached from an in-browser importer.
> 2. **The `/files/{id}` shape is `body[MAP][RES][FORMAT] = {size, md5, url}`.**
>    The maps are `Diffuse`, `nor_gl`, `nor_dx`, `arm`, `AO`, `Rough`,
>    `Displacement`, `rough_ao`, plus `blend`/`gltf`/`mtlx` bundles carrying an
>    `include` map. **`arm`** (AO+roughness+metalness packed into RGB) is the
>    one to take — 296 KB at 1k JPG against 544 KB for `Rough` alone. And it
>    must be **`nor_gl`, not `nor_dx`**: the DirectX convention has an inverted
>    green channel and would invert every bump in the game.
> 3. Poly Haven carries motorsport-specific surfaces the original survey missed:
>    `asphalt_track`, `asphalt_pit_lane`, `worn_asphalt`, `clean_asphalt`,
>    `asphalt_01`–`07`, `gravel`, `tarred_gravel` — plus a match for all 14
>    baked `MAT` slots.

### 2.1 Poly Haven — the best fit for materials and HDRIs

Public API at `https://api.polyhaven.com`, **no key, no login, no premium
tier**. Everything is CC0. Spec:
[Poly-Haven/Public-API](https://github.com/Poly-Haven/Public-API).

| endpoint | returns |
|---|---|
| `GET /assets?type=textures\|models\|hdris` | catalog: `name`, `categories`, `tags`, `max_resolution`, `authors`, `thumbnail_url` |
| `GET /info/{id}` | one asset's metadata |
| `GET /files/{id}` | **the download map** — per resolution, per format, each file `{url, md5, size}` |
| `GET /taxonomy`, `GET /categories/{type}` | facets |

`/files/{id}` for a texture gives you the individual PBR maps at every
resolution (1k/2k/4k/8k) in several encodings; for a model it gives
`gltf`/`blend`/`fbx`/`usd` with an `include` map of dependent texture files.
The `md5` per file is what makes a reproducible, verifiable bake possible.

Caveat worth honouring: assets are CC0 and need no attribution, but building on
the **live API** asks for a small *"Powered by Poly Haven"* credit.

Relevance: their texture library is exactly the 17 `MAT` ids — asphalt,
concrete, brick, rusty metal, grass, gravel, rock, wood planks, roof tiles.
Their model library (~30-odd assets) is mostly household/nature props, not
motorsport, so it is a weak model source but a superb *material* source.

### 2.2 ambientCG — the deepest material library

~3000 CC0 PBR materials. REST API v2 at `https://ambientcg.com/api/v2/`;
`/full_json` returns metadata + every downloadable file, `/downloads_csv`
returns a flat parseable list. Endpoints take the same filter parameters as the
website's `/list` page, so you can build a query in the UI and copy it. Two link
kinds per file: `downloadLink` (redirects via download stats — the polite one)
and `rawLink` (direct). v1 is frozen; use v2.
Docs: [docs.ambientcg.com/api/v2](https://docs.ambientcg.com/api/v2/).

Relevance: the widest selection of tarmac, kerb, gravel-trap and concrete-
barrier materials anywhere under CC0. First choice for `MAT.ASPHALT`.

### 2.3 Model sources — ranked by how little friction they cause

1. **Quaternius** — CC0, direct glTF/FBX/OBJ download, no login, no API. Stylised
   low-poly, which suits a game whose props are opaque low-poly by design.
2. **Kenney** — CC0, 60k+ assets including 3D kits. Distributed as zip packs
   from kenney.nl / itch.io; no programmatic API, so this is a *manual*
   curate-then-vendor source.
3. **poly.pizza** — aggregator over Quaternius/Kenney/Poly with a public API and
   per-model licence in the payload. Good discovery layer.
4. **Sketchfab** — 700k+ downloadable models, but the Download API requires
   **OAuth 2.0 bearer tokens** and returns temporary signed URLs
   ([docs](https://sketchfab.com/developers/download-api)). Licences are
   per-model (CC-BY, CC-BY-SA, CC0…), so attribution obligations vary per
   asset. **Recommend against automating this.** Interactive, human-reviewed
   sourcing only.

### 2.4 What this rules out

No runtime fetching from any of these. All four are cross-origin, none is
guaranteed CORS-open, none is fast enough to sit in a track load, and an
offline PWA cannot depend on them. **Every byte gets pulled at author time and
committed.**

---

## 3. Proposal

Three independent pieces, each shippable and revertible on its own. Ordered by
value-per-risk.

### 3.1 The bake tool — `tools/gen/assets.mjs` (author-time only)

A Node CLI alongside `tools/verify-track.cjs`. Never loaded by the game, never
runs in CI for a normal test pass. Network access only here.

```sh
node tools/gen/assets.mjs search materials asphalt      # query PH + aCG, print candidates
node tools/gen/assets.mjs bake-material asphalt ambientcg:Asphalt026A --mat ASPHALT
node tools/gen/assets.mjs bake-model grandstand ./src/stand.glb --mat-map metal=METAL
node tools/gen/assets.mjs verify                        # md5s, licences, sizes, manifest
node tools/gen/assets.mjs credits                       # regenerate assets/pack/CREDITS.md
```

Outputs, all committed:

```
assets/pack/manifest.json     ids → files, MAT ids, source URL, licence, md5, bytes
assets/pack/mat-albedo.ktx2   TEXTURE_2D_ARRAY, layer index == MAT id
assets/pack/mat-normal.ktx2   same layer order
assets/pack/models/<id>.bin   baked meshes in the game's own vertex layout
assets/pack/CREDITS.md        per-asset author + licence + source URL
```

`verify` is the guard that matters: it re-checks every md5, refuses any licence
that is not CC0 or an explicitly allow-listed permissive one, and fails if a
manifest entry has no `source` URL. Wire it into `npm run test:tooling`
alongside the existing `tests/unit/load-order.test.mjs` so licence drift is a red
test, not a discovery three years later.

For the model path, [glTF-Transform](https://gltf-transform.dev/cli) is the
right dependency (dev-only) — `optimize`, `dedup`, `prune`, `weld`, `simplify`,
`resize`, `uastc`/`etc1s` are all one CLI call and it is the de-facto standard
for this job.

### 3.2 Textures + normal maps: a `MAT`-indexed texture array

**This is the recommendation.** It is the one change that turns the existing
material system from "17 hand-written noise functions" into "17 real scanned
PBR materials" without touching a single circuit file, without a UV channel,
and without changing a vertex layout.

The idea: upload a `TEXTURE_2D_ARRAY` whose **layer index is the `MAT` id**.
`lit.js` already has `vMat` flat-interpolated per face and already computes the
triplanar coordinate. So `applyMaterial` / `applyMaterialNormal` gain a texture
branch:

```glsl
// lit.js — inside applyMaterial(), keyed on the SAME (hc,y) / (x,z) convention
vec4 an = texture(uMatAlbedo, vec3(uv * uMatScale[mid], float(mid)));  // rgb=albedo, a=roughness
vec4 nm = texture(uMatNormal, vec3(uv * uMatScale[mid], float(mid)));  // rg=normal.xy, b=AO
albedo = mix(albedo, albedo * an.rgb * 2.0, uMatTexMix * fade);
```

Why this fits so well:

- **No UVs.** World-space triplanar, exactly as today.
- **No new vertex attribute.** `aMat` already exists and is already `flat`.
- **One extra sampler each**, on free units. No uniform-array churn, so none of
  the Safari UBO hazard that Part 2 flagged.
- **The existing fades and the `fwidth()` grazing guard apply unchanged** — a
  scanned normal map aliases exactly the way the procedural bump does, and the
  mitigation is already written (`lit.js:266-267`).
- **`uMatTexMix` becomes a `TUNE_DEFS` knob.** 0 = today's look byte-for-byte,
  1 = full texture, stored per (track, tod, weather) profile like every other
  lighting value. Ship it at 0, A/B it in the LIGHTING TUNER, bake the winner
  into `light-presets.js`. That is this project's existing culture for exactly
  this kind of change, and it makes the whole feature revertible by a slider.

**Prerequisite — already satisfied.** An earlier draft of this section claimed
road and terrain were permanently `MAT.FLAT`, inherited from a stale line in
RENDERING-IMPROVEMENTS.md. That is wrong: `buildRoad` stamps
`MAT.ASPHALT`/`MAT.GRASS` per cross-section column (`mesh.js:412-424`) and
`buildTerrain` stamps `MAT.ROCK`/`MAT.GRASS` (`mesh.js:713`). The racing
surface is already in the material system, so the texture array reaches it on
day one and no prerequisite work was needed.

#### The VRAM arithmetic — why format choice is not a detail

17 layers. Uncompressed RGBA8:

| layout | VRAM |
|---|---:|
| 1024², 3 separate maps (albedo/normal/ORM) | **204 MB** — dead on arrival |
| 512², channel-packed to 2 maps (albedoRGB+roughA, normalRG+aoB) | **35 MB** + mips |
| 512², packed, **KTX2 / Basis Universal** | **~5-9 MB** |

KTX2 transcodes to a GPU-native format (BC7 desktop, ASTC/ETC2 mobile) and
**stays compressed in VRAM**, typically 4-8× less than PNG/JPG/WebP — all of
which decode to raw pixels on upload, so a 2048² RGBA is 16 MB in VRAM no
matter how small the file was. See
[don mccurdy on web texture formats](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)
and the [KTX artist guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md).

Recommended split, per the standard guidance: **UASTC for normal maps** (they
tolerate no banding), **ETC1S for albedo/ORM** (much smaller). The cost is a
~250 KB Basis transcoder wasm — vendored, lazily fetched, exactly the shape of
the existing optional `vendor/three-0.184.0/` arrangement.

**Suggested v1 path:** ship WebP at 512² first (zero new vendor code, decode via
`createImageBitmap` → `texSubImage3D` per layer), measure on the mobile tier,
then upgrade the *container* to KTX2 behind the same `Assets` API if the 35 MB
bites. The shader does not change between the two.

Mobile guard: `gfx.isMobile` / `mobileTier` already exist. Tier down to 256² or
skip the array entirely and fall back to the procedural path — which is a
genuine fallback, not a placeholder, because it is what ships today.

### 3.3 Models: bake to the game's own format, don't texture props at runtime

The props buffer is **1.8 M verts on Vegas** — 20-60× road+terrain. Adding UVs
and textured materials to the chunked prop path would inflate that buffer, add
per-material draw state to a path that currently gets ~1 draw per visible chunk,
and gain little: at the distances props are viewed, `MAT`-array texturing from
§3.2 already covers them.

So: **the model pipeline is a geometry pipeline.** `tools/gen/assets.mjs bake-model`
takes a `.glb`, runs it through glTF-Transform (`weld`, `simplify` for LODs,
`dedup`, `prune`), bakes each source material down to a vertex colour +
a `MAT` id via an explicit `--mat-map`, and writes the game's existing
interleaved layout. At runtime it is just another buffer — **zero new renderer
code, zero new shader code**, and it inherits chunked culling, shadows and the
material system for free.

This is what unlocks the SCENERY-UPGRADE-PLAN problem directly:
`grandstand()` is one template called **248 times** across 24 circuits, and nine
independent circuit reviews named "all our grandstands look identical" a top-3
issue. Six or eight baked stand/pit-building variants, dropped into the existing
`scenery(api)` calls, fixes that without an engine change.

Keep `js/render/shared/gltf.js` runtime-only for the **car** — that seam
(`loadCarModel`) is already built, already validated, already exposed on
`__apex`, and wants no changes.

### 3.4 Bonus, nearly free: HDRIs into the existing env probe

`glx.js`'s `envInit()`/`envFaceBegin()`/`envFaceEnd()` already maintain an env cube (`envTex`, `ENV_SIZE`) and the
lit shader already blends it for sheen and the wet-road mirror
(`lit.js:1130`). Poly Haven's HDRIs are CC0 and its API serves them at 1k.
Baking one per (track, time-of-day) into a small pre-filtered cube + a
hemisphere ambient pair feeds `ambientSky`/`ambientGround` — values the game
already consumes. **No shader change at all**, and it targets the flat-lighting
complaint more cheaply than anything in §3.2.

---

## 4. Proposed runtime API

One new IIFE global, `js/render/shared/assets.js` → `Assets`, loaded before `glx.js`.

```js
Assets.manifest()                  // the baked catalog (id → files, MAT, licence)
Assets.ready()                     // bool — material array uploaded?
Assets.load(opts)                  // Promise — fetch + upload; {tier:"low"|"high"}
Assets.model(id)                   // {pos,nrm,col,mat,idx} | null (cached)
Assets.materialLayer(matId)        // layer index, or -1 if that MAT has no map
Assets.credits()                   // [{id, author, licence, source}]
```

Two additions to the `Gfx` backend contract (`js/render/gfx.js:37-42`), so GLX,
WGX and TLX stay interchangeable:

```js
createTextureArray({layers, width, height, format, data})   // TEXTURE_2D_ARRAY
setMaterialMaps({albedo, normal})                           // bind for the lit pass
```

And the `__apex` surface, matching the existing hook style:

```js
__apex.assets()                    // {ready, layers, bytes, vram, tier, missing:[…]}
__apex.assetTier("low"|"high")     // force a tier for testing
__apex.matTex(0..1)                // live uMatTexMix — the A/B knob
__apex.credits()                   // licence roll, for a settings-screen credits page
```

`__apex.matTex()` is the important one: it makes a screenshot A/B of the whole
feature a two-line Playwright test, and `tests/specs/lighting-ab.spec.js` already
does exactly that kind of pixel comparison.

---

## 5. Rollout

| phase | work | status |
|---|---|---|
| 0 | `MAT` ids for road/terrain | **was already done** — `mesh.js:412-424`, `:713` |
| 1 | `tools/gen/assets.mjs` + manifest + licence `verify` | **shipped**, guarded by `tests/unit/assets-pack.test.mjs` |
| 2 | `Assets` global + `createTextureArray` + `uMatTexMix` at 0 | **shipped** on GLX, TLX, and WGX |
| 3 | Tune `matTexMix` per profile, bake into `light-presets.js` | **open** — needs a human eye on a real screen |
| 4 | KTX2 container + vendored transcoder | **open** — the 561 KB PNG pack is far under budget, so this is not yet needed |
| 5 | `bake-model` | **shipped**, round-tripped in test; no circuit consumes a baked model yet |
| 6 | HDRI → env ambient | **partial** — `bake-env` + `Assets.env()` exist; nothing reads them yet |

---

## 6. Risks, honestly

- **Repo weight.** GitHub Pages soft-limits a published site to ~1 GB and
  individual files to 100 MB, but the real cost is clone time for a repo that
  has been fast. Budget: **≤8 MB of baked assets total**, enforced by
  `assets.mjs verify`. KTX2 is what makes that number reachable.
- **Licence hygiene.** Mixed-licence sources (Sketchfab) are the trap. The
  allow-list in `verify` should default to CC0 only, and every entry must carry
  a source URL. `CREDITS.md` must be generated, never hand-edited.
- **This walks back a documented decision.** RENDERING-IMPROVEMENTS.md Part 2
  rejected baked atlases as violating "no-external-assets, no-build-step." The
  distinction being drawn here — *runtime* has no build step, `tools/` may —
  is a real one and matches `verify-track.cjs`, but it is a change of stance
  and should be an explicit decision, not a side effect of a PR.
- **Mobile VRAM.** 35 MB of uncompressed array on a phone alongside a 2048²
  shadow map, a 1024² car map and an env cube is not obviously safe. Phase 2
  must *measure* before phase 3 turns the knob up.
- **Aliasing.** Scanned normal maps at grazing angles on a road viewed at
  80 m/s is precisely the failure the `ASPHALT` material comment warns about
  (`geom.js:23-29`: *"anything with real relief crawls"*). The `fwidth()` guard
  and `matBumpHeight`'s deliberate restraint are hard-won; a texture must
  inherit both, and `tests/motion-capture`-style driven capture — not a static
  screenshot — is the only thing that will catch it.
- **The procedural system is genuinely good.** It has real bump feeding real
  lighting, distance fades, grazing-angle antialiasing and a wet remap close to
  Lagarde's numbers. The honest framing is *augmentation behind a mix knob*, not
  replacement.

---

## Sources

- [Poly Haven Public API](https://github.com/Poly-Haven/Public-API) ·
  [API page](https://polyhaven.com/our-api)
- [ambientCG API v2 docs](https://docs.ambientcg.com/api/v2/) ·
  [/downloads_csv](https://docs.ambientcg.com/api/v1/downloads_csv/)
- [Sketchfab Download API](https://sketchfab.com/developers/download-api) ·
  [guidelines](https://sketchfab.com/developers/download-api/guidelines)
- [Kenney assets](https://kenney.nl/assets) ·
  [Quaternius](https://quaternius.com/) · [poly.pizza](https://poly.pizza/)
- [glTF-Transform CLI](https://gltf-transform.dev/cli)
- [Choosing texture formats for WebGL and WebGPU — don mccurdy](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)
- [KTX artist guide (Khronos)](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md) ·
  [KTX2 spec](https://github.khronos.org/KTX-Specification/ktxspec.v2.html) ·
  [Basis Universal WebGL](https://github.com/BinomialLLC/basis_universal/blob/master/webgl/README.md)

---

## 7. What actually shipped

### Landed

**`tools/gen/assets.mjs`** — the author-time bake CLI. `bake-synthetic` needs no
network and no dependencies: it generates all 14 material layers from
multi-octave tiling noise and encodes them with node's own zlib (a ~90-line PNG
encoder), which is what makes the whole runtime path testable in CI and in a
sandbox with no egress. `bake-model` runs the game's *own* `js/render/shared/gltf.js`
in a VM, stamps a `MAT` id per vertex and writes the game's interleaved format.
`bake-env`, `verify` (licence allow-list + md5 + 8 MB budget) and `credits` are
there too. `APEX_PACK_DIR` redirects every write so tests can bake into a temp
dir.

**`assets/pack/`** — a committed 561 KB pack: 14 material layers at 128², albedo
+roughness and normal+AO, as two PNG filmstrips of `size × size*17` with layer
N at `y = N*size`. One request, seventeen `createImageBitmap` crops, no canvas
round-trip. It is `Apex26-Procedural`-licensed — generated by our own tool from
our own noise, so it carries no third-party obligation at all. A real CC0 scan
bake replaces it byte-for-byte through the same manifest.

**`js/render/shared/assets.js`** — the loader. Feature-detects
`gfx.createTextureArray`, tiers on `gfx.isMobile`/`mobileTier`, and treats "no
pack", "malformed pack" and "backend can't do it" as ordinary states that leave
the procedural render untouched. Nothing it does is awaited by boot.

**The shader** — `matTexUV()` / `applyMaterialTexNormal()` in `lit.js`, sampling
a `sampler2DArray` at `layer == MAT id` on the *same* triplanar convention as
the procedural noise, with the same `fwidth()` grazing-angle guard. Albedo is
**multiplicative** (`albedo * t.rgb * 2.0`) so the per-track tarmac tint, the
racing-line rubber wear and the per-vertex grain all survive. `matWallLike()`
is now the single source of truth for the wall-vs-ground coordinate split.

**TLX (three/TSL)** — ported. `tsl-lit.js` gets the same two functions against a
`DataArrayTexture`; the nodes bind 1×1×17 placeholders at factory time and
`setMaterialMaps()` swaps `.value`, because materials compile once at init and
the pack lands asynchronously. That is the same trick `setEnvCube` already used.

**Hooks** — `__apex.assets()`, `__apex.assetLoad(tier)`, `__apex.matTex(v)`,
`__apex.credits()`. `matTex` is the A/B control for the entire feature.

### Deliberately not done

- **WGX baked pack — done.** WGX now has `createTextureArray` / `setMaterialMaps`
  / `materialMapState`, WGSL `texture_2d_array` sampling, and ownership-aware
  release on unload/replace (same contract as GLX). Remaining WGX deltas are
  look/VRAM (aniso, phone post formats, TAA resolve) — see `WEBGPU-PARITY.md`.
- **`bake-material`** (real CC0 scans → a layer) **is implemented** (2026-08).
  Needs `sharp` (`npm i -D sharp`) and network for `fetch`. It mean-normalises
  Diffuse albedo, packs `nor_gl` + `arm` exactly like `assets/pack/webbake.js`,
  and patches a single MAT layer into the committed filmstrips. `search` now
  correctly lists ambientCG `foundAssets[].assetId` (previously always empty).
  The browser `webbake.js` path remains the fastest full-pack bake; CLI is for
  single-layer swaps without a DevTools session.
- **`bake-atlas`** (2026-08). Slices a 4×4 albedo/normal sheet onto named MAT
  layers (`--preset generated` or `--map BRICK=1,0`). Mean-normalises, heals
  tile seams, derives a normal from luminance when the sheet is albedo-only,
  and leaves unmapped slots (ASPHALT by default) on the photoscans. The
  committed `generated` preset now also covers WOOD / FABRIC / SNOW from
  `atlas-variety-*.png`.
  Sources: `assets/atlases/`.
- **KTX2.** The pack is ~5.4 MB against an 8 MB budget. The VRAM argument in §3.2
  still stands for a full-resolution scan bake — revisit at that point, not now.

### Known gaps

- `search`/`fetch`/`bake-material` are exercised against live Poly Haven (and
  ambientCG search) endpoints. Treat the first ambientCG *download* bake as
  still experimental — only the Poly Haven path auto-pulls maps today.
- The TSL port of `applyMaterial` covers `mid < 14.5`, so `MAT.ASPHALT` (16)
  never reaches the *procedural* branch on TLX. Pre-existing, unrelated to this
  work, but it means TLX and GLX already differ on tarmac. The baked path added
  here covers the full 1..16 range on both.
### Adoption (second pass)

Both consumers now exist:

- **`Assets.env()` is wired into `applyRaceSettings`** (`js/lighting/atmosphere.js`),
  applied straight after the palette base and before the weather branches — so a
  measured sky replaces the hand-picked hemisphere colours while overcast/rain/fog
  still scale it. No shader change, as predicted in §3.4.
- **`api.bakedModel(id, k, side, dist, opts)`** is on the scenery surface
  (`js/track/tracks.js`, geometry in `TrackGeom.addMesh`). It returns `false` and
  emits nothing without a pack, so circuits keep their procedural fallback and
  `verify-track` passes on a checkout with no models. Models are prefetched at
  boot because prop placement is synchronous — a circuit must build identically
  every time, not differently depending on network timing.

No circuit calls `bakedModel` yet: that needs actual CC0 grandstand/pit-building
meshes, which needs the network-capable `bake-material`/`fetch` path. The
SCENERY-UPGRADE-PLAN win is now one asset-sourcing session away rather than one
engine change away.

### Next graphics wins (2026-08 research pass)

Measured after the 2k→256 full-pack rebake + Chromium A/B (`matTex` 0 vs 1):

1. **Tune world scales** — **done**: sand 6→11, rock 5→8, grass 3→4.5,
   foliage 3→4, snow 6→7, asphalt 4→3.5 (finer grit). Synced in
   `tools/gen/assets.mjs` SCALES, `webbake.js`, and `manifest.json` layers.
2. **HDRI → `Assets.env()`** — **done** for `*|default|day|dusk|dawn` via
   `bake-env-hdri` (Poly Haven 1k `.hdr` hemisphere sample). Night skipped on
   purpose. `atmosphere.js` now applies env after every non-night TOD base.
3. **KTX2 / Basis Universal** when (if) we want 512² or more layers — VRAM stays
   compressed; PNG/WebP always expand.
4. **Prop geometry, not prop textures.** Trees/grandstands still read flat —
   `bakedModel` + Quaternius/Kenney CC0 stands.
5. **Motion-capture before raising ASPHALT normals.** Shader clamps asphalt
   baked normals (`mid==16 ? 0.10`); validate with `test:shimmer`.
6. **Per-profile `matTexMix`.** Night/wet may want <1.0 so procedural wet remap
   stays dominant.

### Also fixed on the way

The TSL port bounded its material branches at `mid < 14.5`, so **`MAT.ASPHALT`
(16) reached neither `matBumpHeight` nor `applyMaterial` on the three backend** —
the road, the surface on screen for the entire race, had no procedural treatment
at all there while GLX gave it aggregate grain, wear patches and roughness
variation. Both branches are ported and the range widened to `1..16` minus
`GLASS`/`FLAG`. Pre-existing, unrelated to the asset work, found by reading the
port while adding the baked path beside it.
