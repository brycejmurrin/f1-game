# CI + software rendering — research notes (2026-08)

Written while the CI gate (`.github/workflows/ci.yml`) was added, after several
local Playwright runs died to their own timeouts rather than to failures.

**Part 1 is external findings, not measurements on this repo** — every number in
it is somebody else's, and the section headings exist to say which claims are
worth spending an afternoon measuring here. **Part 2 is grounded**: its vertex
counts come from `tools/verify-track.cjs --all` and its byte arithmetic from the
real interleaved layout in `js/render/glx/glx.js`. Keep the two apart when quoting
this file.

This repo's culture is measure-then-decide (`playwright.config.js:29-42` is the
model: a table of rAF rates and click latencies, and a flag rejected because of
it). Nothing in this document should be adopted without the same treatment.

---

## 1. The headline: SwiftShader is not the only software renderer

`playwright.config.js:25` pins `--use-angle=swiftshader`. That is Chromium's
own software rasteriser. **Mesa's `llvmpipe` is reportedly ~3× faster** at the
same job, and the difference is not subtle — one report has canvas-heavy
three.js tests going 5 min → 1.6 min on llvmpipe alone, before any GPU is
involved.

Three facts that make this actionable, and one that makes it awkward:

1. **Headless Chromium does not use a GPU by default**, even on a machine that
   has one. Getting off software rendering at all requires headed mode under a
   virtual display — `xvfb-run npx playwright test` is the documented Playwright
   idiom, and `xvfb` is why headed works on a runner with no screen.
2. **`llvmpipe` requires Mesa to be installed.** The standard GitHub-hosted
   Ubuntu runner does **not** ship it; the GPU-optimised runner image does. On a
   standard runner you would need to install it (`libgl1-mesa-dri`, `mesa-utils`)
   and then *not* force `--use-angle=swiftshader`.
3. **A GPU runner does not give you a GPU for free.** On GitHub's NVIDIA image
   the driver is installed but the kernel modules are not loaded, so `/dev/nvidia0`
   does not exist and Chromium silently falls back to software. Two `modprobe`
   calls fixed it in the cited write-up.
4. The awkward part: **this repo deliberately forces SwiftShader**, and the
   comment block at `playwright.config.js:29-42` shows the author has already
   been burned once by a plausible-sounding flag that made things 7× worse.
   Treat §1 as a hypothesis with a good prior, not a patch.

**Worth measuring here:** does `xvfb-run` + Mesa + dropping the swiftshader pin
change wall-clock for `npm run test:tiny` and `test:render`? That is one CI job
and one afternoon, and the payoff is the difference between a 40-minute suite
and a ~13-minute one.

### Measured in this container (2026-08-17, mcp-probe + `wgpu-flag-test.mjs`)

Three software paths matter for Apex probing; they are **not interchangeable**:

| Preset | WebGPU binds? | Canvas pixels (headless) | Montreál lite wall-clock | Notes |
|--------|---------------|--------------------------|--------------------------|-------|
| **SwiftShader** (`WEBGPU_CHROMIUM_ARGS`) | yes | visible `#game` ~`[160,170,171,255]` after soft-present blit | ~11 s (`gfx-probe`) | Default for harness, MCP, Playwright. Native swapchain is blank; WGX 2D-blits final pass to `#game` (`wgxCapture=1` / software adapter auto). |
| **Lavapipe headless** (`WEBGPU_LAVAPE_*` + `--headless=new`) | yes | same soft-present colours | ~11 s (same wait loop) | Second Vulkan software stack (Mesa `lvp_icd.json`). Same validation signal as SwiftShader; upstream three.js e2e direction. |
| **Lavapipe + Xvfb headed** | yes | `[161,170,172,255]` (after soft-present blit) | ~2.3 min | Non-enumerable `adapter.info` hid `architecture=swiftshader` from JSON — WGX now reads fields directly; `wgxCapture` forces the 2D blit path. |
| **llvmpipe (WebGL2 only)** | n/a | GLX path renders | **9.5 s vs 25.8 s** SwiftShader on same montreal boot | Drop `--use-angle=swiftshader`; renderer string `ANGLE (Mesa, llvmpipe …)`. Does **not** expose `navigator.gpu`. Helps default GLX + TLX (`tlxForceGL=1`), not WGX probes. |

Commands that produced the table:

```sh
node tools/wgpu-flag-test.mjs                    # swiftshader / lavapipe / lavapipe_xvfb
node tools/gfx-probe.mjs --backend webgpu --lite montreal
node tools/wgx-lavapipe-probe.mjs montreal --lite
APEX_CHROME_ARGS="…lavapipe flags…" VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json \
  node tools/mcp-cli.mjs probe --backend webgpu --lite --wait 12000 --eval '…'
```

**Takeaways for probe tooling:**

1. **Keep SwiftShader as the default WebGPU preset** — simplest, documented in
   `tools/webgpu-chrome-args.cjs`, matches Playwright harness.
2. **Lavapipe headless is a viable A/B** for WGX lifecycle (adapter/device/shaders)
   when you want a second software Vulkan stack; swap flags only, not game code.
3. **MCP / Playwright WGX screenshots:** use visible `#game` after
   `GLX.awaitSoftPresent()` (`gfx-probe.mjs` pattern) — not the hidden WebGPU
   swapchain canvas. Readback oracle: `wgx-capture.mjs` / `render({what:"view"})`.
4. **For Playwright CI speed**, measure dropping the SwiftShader pin for the
   **WebGL2** suite (`llvmpipe`); that is independent of WebGPU backend choice.
5. **Real GPU + `xvfb-run`** remains the path for hardware WebGL/WebGPU visuals;
   GitHub GPU runners still need driver load — see §1 point 3.

### There is no hardware adapter here — and it was never the limit (2026-08-28)

Settled, so nobody spends another session hunting for a GPU flag:

```
$ vulkaninfo --summary
GPU0: deviceName = llvmpipe (LLVM 20.1.2, 256 bits)
      deviceType = PHYSICAL_DEVICE_TYPE_CPU
      driverID   = DRIVER_ID_MESA_LLVMPIPE
      conformanceVersion = 1.3.1.1
$ ls /dev/dri
ls: cannot access '/dev/dri': No such file or directory
```

One CPU device, no DRM node. This is a Firecracker microVM with no GPU
passthrough, so **no Chrome flag, no Xvfb headed run, and no MCP server can
produce a hardware adapter.** `--enable-unsafe-webgpu`,
`--use-angle=vulkan`, `--enable-features=Vulkan`,
`--enable-dawn-features=disable_adapter_blocklist` all change *which software
stack* answers; none of them conjure silicon.

Research surface, while here: the egress proxy allows `github.com` (and the
npm registry) and refuses `developer.chrome.com`, `threejs.org`,
`discourse.threejs.org`, `chromium.googlesource.com` with a 403 CONNECT. So
upstream research is WebSearch result snippets plus `github.com` fetches of
three.js sources, issues and PRs — not doc-site reads.

**But llvmpipe is a CONFORMANT Vulkan 1.3 implementation, so Dawn on top of it
validates exactly like Dawn on a player's GPU.** The reason a real-GPU bug was
unreproducible here was never the adapter. It was that TLX takes a *different
code path* on a software adapter: `softGpu()` / `softwareGL` gates skip the
env-probe world capture, the chunked city inside the probe, the real TSL sky
node, the instanced batches, and the authored shadow-map sizes. Those skips are
**budget** guards, not correctness fixes — so every in-container measurement ran
the half of the renderer no player runs, and a black player frame was
unreproducible *by construction*.

`apex26.tlxForceHw=<parts>` puts the hardware side back, one gate at a time
(`sky | env | chunked | batches | shadow`, or `1`/`all`); presentation stays
soft, which is the only part software genuinely cannot do. Force them
individually — forcing all of them at once costs more llvmpipe seconds than the
`awaitSoftPresent` budget has, and the timeout does not say which path did it
(measured: `tlxForceHw=1` timed out at 60 s twice; each single gate presents in
10–25 s). `tools/gfx-probe.mjs --ls key=value` sets any `apex26.*` knob before
boot.

Bisect on montreal, TLX + Dawn + Lavapipe, `GLX.gpuErrors()` after `park()`:

| forced gate | present | uncaptured Dawn errors |
|---|---|---|
| *(none — the CI default)* | ok | 0 |
| `sky` | ok | 0 |
| **`env`** | ok | **290** |
| `batches` | ok | 0 |
| `chunked` | ok | 0 |
| `shadow` | ok | 0 |

The env-probe path, and only it:

```
Attachment state of [RenderPipeline "renderPipeline_Background.material_48"]
is not compatible with [RenderPassEncoder].
  pass expects   { colorTargets: [0=RGBA16Float] }
  pipeline has   { colorTargets: [0=RGBA16Float, 1=RGBA16Float] }
```

Cause: `tlx.js` replaces three's `_nodes.getForRenderCacheKey` to kill a
593-program compile storm, and three's own key folds the attachment state in
through `contextNode.id`/`.version` — which the replacement dropped. A WGSL
fragment entry writes `@location(0..n-1)` for the pass it was built for, so the
2-target scene-pass Background program is not usable in the 1-target env-probe
pass. Dawn rejects the `SetPipeline`, discards the command buffer, and every
probe face comes back black — then the black cube is bound as the environment
for every lit surface. Fix: the key carries the fragment output
count (`attachKey()`: colour-target count + MRT flag) — that, and only that, is
what forks the WGSL, since formats/samples/blend really are pipeline state on
the separate pipeline cache. Keying on format and sample count as well re-opened
the compile storm and the default soft-present run then missed its 60 s budget
twice; count + MRT is two variants (the 2-target scene pass, and everything
else).

### There IS a real GPU in reach: `macos-latest` (2026-08-28)

The agent container has none (previous section) — but GitHub's Apple-silicon
image does, and the published answers about it contradict each other (the M1
runner announcement says GPU acceleration is on by default;
`actions/runner-images#7085` asks for Metal passthrough as a missing feature).
`tools/gpu-census.mjs` + `.github/workflows/gpu-census.yml` asked the images
instead of believing either:

| image | stock | `--enable-unsafe-webgpu` | `+Vulkan` | `+disable_adapter_blocklist` | anyHardware |
|---|---|---|---|---|---|
| `ubuntu-latest` | **no adapter** | swiftshader | swiftshader | swiftshader | false |
| `windows-latest` | **no adapter** | warp | warp | warp | false |
| `macos-latest` | **apple / Metal** | apple / Metal | **no adapter** | apple / Metal | **true** |

macOS WebGL string: `ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual
device)`. Not a string-match fluke — the capabilities separate it from every
software stack measured here:

| | SwiftShader / llvmpipe | macos-latest (Metal) |
|---|---|---|
| `maxBufferSize` | 1 GiB | **2 GiB** |
| `maxTextureDimension2D` | 8192 | **16384** |
| features | — | `shader-f16`, `dual-source-blending`, `texture-formats-tier2`, `subgroups` |

Two traps the census caught on the way, both of which would silently turn a
real-GPU run into a software one:

1. **`--use-angle=vulkan` BREAKS WebGPU on macOS.** It forces ANGLE onto
   SwiftShader and `requestAdapter()` returns null. That flag set is what most
   CI guides recommend; on this image it is the one combination that throws the
   GPU away. Use stock flags (or `--enable-unsafe-webgpu`) on macOS.
2. **Playwright's default browser is the headless SHELL, which has no
   `navigator.gpu` at all.** Census it and every machine on earth answers
   "no WebGPU" — a fact about the binary, not the machine. `channel:"chromium"`
   (or an explicit `executablePath`) is required.

And one fact worth carrying into the renderer: on `ubuntu-latest`, on
`windows-latest` and in this container, **stock Chrome — no flags — returns NO
adapter**. `navigator.gpu` exists and `requestAdapter()` resolves null. "WebGPU
is present" and "a usable adapter exists" are different questions, and the AUTO
backend pick has to survive the gap between them.

Practical consequence: `macos-latest` is the project's real-GPU surface. Dispatch
`gpu-census.yml` with `census_only: true` for the adapter answer in seconds, or
without it to run `tools/gpu-game-check.mjs` — the portable sibling of
`gfx-probe` that reports `GLX.gpuErrors()`, the env-probe state and the
`?gfxdebug=1` overlay text from the game itself.

**It GATES, it does not merely report** (2026-08-29). The workflow's Verdict step
fails the job on: a check that did not finish, `gpuErrors > 0`, any failed
env-probe face, a probe that stood down, or `softAdapter` true on an image the
census called hardware. Before it existed the job was green whatever the game
said — run `33228195259` concluded "success" on the commit where this same
macOS job reported `envFail: 81`. Appearance is reported and NOT gated:
`meanLuma` goes to the job summary, because a brightness floor is the kind of
threshold that goes flaky and then gets widened to pass.

What the real GPU has found so far, none of it visible to any software test:

| defect | signal | fixed in |
|---|---|---|
| `_softAdapter` read headless (and empty `adapter.info`) as software, so real hardware ran the degraded content path | `softAdapter: true` with `softwareGL: false` | `67d5616` |
| `releaseMirrors()` freed attribute arrays the node builder still needed, so every env-probe face threw | `envFail` 81 (WebGPU) / 41 (WebGL2), `env ready=false` | `69836ca` |
| the Verdict script itself: an apostrophe in a `node -e '…'` comment ("three's") closed the bash quote, node got half a program, the gate went red on a run where all four legs were clean | step 14 `SyntaxError: Unexpected end of input` after four `ok:true` legs (run `33757119814`) | 2026-09-03 (+ `ci-coverage.test.mjs` compiles every inline script) |

Run `33757119814` (2026-09-03, `0ea825d`, the first census after the WebKit
AUTO→three-WebGL2 deploy) is the current real-GPU baseline — all four legs
`ok:true`, `gpuErrors 0`, `softAdapter false`, env probe `fail 0`:

| leg | fps | tier | scale | `open.maxMs` (worst frame in the first 600) | meanLuma | note |
|---|---|---|---|---|---|---|
| three / WebGPU | 8 | 0 | 1 | 7615 | 37.8 | headless UA → soft-blit; `softRead.lastMs` 13 422 — the readback, not the render, is what is slow here |
| three / WebGL2 | 59.9 | 0 | 1 | **16 250** | 62.8 | `loop: +1 frames/16647ms`: ONE 16 s frame — three links its TSL programs on first render and ANGLE-Metal compiles them synchronously |
| GLX | 60.3 | 1 | 0.9 | 1850 | 67.7 | first-draw stall in the 1–2 s class the ANGLE-Metal research predicted (PSO + uniform resolve) |
| WGX | 59.4 | 0 | 1 | 1452 | 74.0 | headless → soft-present by design; native swapchain unproven on this image |

Two limits of this evidence: `meanLuma` is not comparable across legs (the
three-WebGPU leg is a blit of whatever the last readback returned), and the
`game-*.png` frames are uploaded to Azure blob storage that this container's
egress proxy denies (`CONNECT … 403`) — read them in the Actions UI, not from
an agent session. The 16 s three-WebGL2 first frame is the same first-draw
compile the phone pays (ANGLE-Metal, synchronous `MTLLibrary` build); it lands
inside the loading screen on a device but is worth a warm-up pass one day.

### Cursor Cloud agent environment (2026-08-17)

Cloud Agents here boot a **personal / dashboard-managed** environment (no
committed `.cursor/environment.json`). The stock image had **no**
`/usr/share/vulkan/icd.d/` — Lavapipe was missing until:

```sh
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mesa-vulkan-drivers vulkan-tools
# xvfb usually already present; install if missing
```

Persist by snapshotting the VM after install and **Save** on the environment
dashboard (see root `AGENTS.md` §Cursor Cloud). Until Save lands, every new
agent loses Lavapipe again.

| Want | Do this |
|------|---------|
| WGX visible `#game` | `node tools/gfx-probe.mjs --backend webgpu --lite montreal` |
| WGX readback oracle | `node tools/wgx-capture.mjs montreal --lite` → `frame.png` (optional; can flake on SwiftShader) |
| WGX on Lavapipe | `node tools/wgx-lavapipe-probe.mjs montreal --lite` |
| TLX pixels (ForceGL / SwiftShader WebGL2) | `node tools/gfx-probe.mjs --backend three --lite montreal` |
| TLX WebGPU pixels (Lavapipe soft-present) | `node tools/gfx-probe.mjs --backend three --tlx-webgpu --lavapipe --lite montreal` |
| Prove ICD | `test -f /usr/share/vulkan/icd.d/lvp_icd.json && vulkaninfo --summary \| head` |

Agent index: `AGENTS.md` §Seeing the game / §Cursor Cloud. Tool rows:
`tools/README.md` (`wgx-capture`, `wgx-lavapipe-probe`, `gfx-probe`).

**The stability argument is stronger than the speed one.** The cited report is
explicit that slow canvas init was the *cause* of its flakiness — timeouts,
elements not ready, interactions failing — and that the fix removed the need for
retry logic rather than merely making the same tests faster. This repo already
carries that scar tissue: `retries: 1` on CI, a 120 s timeout, a `--workers`
cap, and a comment explaining that a hanging menu click means the box is
oversubscribed. Those are all SwiftShader-shaped.

## 2. Sharding is the wrong first move

Consistent advice across sources, and it contradicts the obvious instinct:

- **The default GitHub runner has 2 cores.** Pushing workers past ~2-3 there
  buys nothing but memory pressure. This repo already caps CI workers at 2
  (`playwright.config.js:71`), which matches.
- **A larger (4-core) runner is the cheapest real speedup**, and is almost
  always skipped in favour of sharding, which is more complex and more machines.
- **Browser download dominates small suites.** One benchmark had 42 s of a
  3 min 18 s run being nothing but re-fetching browsers on every push. Caching
  the binaries, or using `mcr.microsoft.com/playwright:v<version>-noble` as a
  container, removes it. The container also pins the browser version, which
  kills the "Chrome updated over the weekend and the visual baselines moved"
  failure — **directly relevant if the 40 `tracks-visual` baselines are ever
  generated** (see `docs/TESTING.md`; the suite currently skips itself).
- **Measure CI time on bad days, not good ones.** With `retries: 1`, one flaky
  test adds its full duration again. A suite that is fast when green and slow
  when slightly flaky is a slow suite.

Sharding syntax, when it is finally the right move, is `--shard=x/y` across jobs
(Playwright's own `test-sharding-js` page, upstream `docs/src/`); a GitLab `parallel:matrix` example
and the GitHub equivalent are in Playwright's own CI docs.

**Applies to the gate as built:** `ci.yml` already splits by *cost* (guards /
sweeps / smoke) rather than by shard, which is the right first cut — the guards
job is ~1 min and browser-free, so the common red case is caught fast without
paying for Chromium at all. Sharding the full render suite is a later step and
only after §1 is measured.

## 3. WebGPU shipped everywhere — the `Gfx` seam assumption has moved

`docs/ARCHITECTURE.md` describes WGX as opt-in native WebGPU. **The
"Safari cannot run WebGPU" framing is out of date as a statement about the
platform**, whatever we decide about making it the default:

Per the GPUWeb wiki (the authoritative source — the secondary write-ups checked
out, but they flatten the gating that actually matters):

- **Safari: macOS Tahoe 26, iOS 26, iPadOS 26, visionOS 26 — enabled by
  default.** This is the big one: iOS Safari was the reason to treat WebGPU as
  unreachable, and it is the platform `../PLATFORM.md` exists for.
- **Chrome desktop** (Mac/Windows/ChromeOS): 113+, default on.
- **Chrome Android is gated by GPU vendor**, not just version: 121+ on
  ARM/Qualcomm/Intel (Android 12+), 139+ on Imagination (Android 16+), Samsung
  Xclipse still WIP.
- **Chrome Linux is barely there**: Intel Gen12+ from 144, NVIDIA on Wayland from
  147, everything else behind a flag. Worth knowing before anyone tries to use
  WebGPU to make CI faster — that is not a route.
- **Firefox**: 141+ Windows, 145+ macOS Apple Silicon (147+ for all macOS),
  elsewhere Nightly.

Roughly 70% support is the figure being quoted. The standing advice is still
feature-detect and fall back to WebGL2 automatically — **which is exactly what
`js/render/gfx.js` already does**, so the architecture is fine; only the
commentary about it is stale.

**What this does NOT imply.** It is not an argument to flip the default
renderer. §6 of `ARCHITECTURE-REVIEW.md` makes the real point: the cost
is *one look in three shading languages*. The 2026-08 WGX parity pass closed
the documented API/shader gaps (see [WEBGPU-PARITY.md](../research/WEBGPU-PARITY.md));
keeping two shader trees in sync is still the tax. Broader platform support
does not reduce that cost. The honest options are still "invest in one of
TLX/WGX" or "keep GLX and let the seam be insurance", and this finding only
changes the input to that decision, not the answer. The API recipes and
slice order live in
[WEBGPU-PARITY.md](../research/WEBGPU-PARITY.md) — every listed gap is implementable in
core WebGPU; the freeze was a cost call, not an API wall.

---

## Sources

- [Running Playwright with GPU powered Actions](https://davesnider.com/gputests) — the SwiftShader → llvmpipe → GPU walk-through, with numbers
- [Playwright on GitHub Actions: the setup that actually runs fast](https://www.reddit.com/r/Playwright/comments/1uvarel/playwright_on_github_actions_the_setup_that/) — worker counts, binary caching, why sharding is usually premature
- [Playwright CI docs](https://playwright.dev/docs/ci) and [test sharding](https://playwright.dev/docs/test-sharding) — `xvfb-run`, `--shard=x/y`, worker configuration
- [GPUWeb implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) and [web.dev: WebGPU in major browsers](https://web.dev/blog/webgpu-supported-major-browsers) — per-browser WebGPU support
- [Chromium: support GPU hardware in headless mode](https://issues.chromium.org/40540071) — the `--use-gl=angle` / `--use-angle=*` flag matrix

---

# Part 2 — iOS Safari memory, and what Vegas actually costs

Added the same day. This part **is** grounded in this repo: the vertex counts are
`tools/verify-track.cjs --all` output and the byte arithmetic is the real
interleaved layout in `js/render/glx/glx.js:479` (`fpv = 9 + mat + trk`).

## The external numbers

- iOS Safari's WebGL heap ceiling is quoted at **~300–500 MB**, and separately a
  **256 MB canvas memory** limit is reported. iOS 18.4 lowered limits further.
- More alarming, and more recent: a developer measuring on **iOS 26.2** could
  consistently crash a page at **~100 MB on an iPhone SE (3rd gen)** and
  **~200 MB on an iPad (8th gen)** by growing a JS array. Not a WebGL test — just
  page memory.
- **There is no JavaScript exception to catch.** `try/catch` does not help; the
  tab dies. So a memory kill cannot be logged from inside the page, which is
  exactly why `js/perf/governor.js`'s crash sentinel writes to localStorage BEFORE it
  can be told anything went wrong. That design is vindicated by this.

## What this repo uploads

Props are interleaved at **10 floats/vertex** — pos(3) + nrm(3) + col(3) + mat(1)
— so **40 B/vertex**, plus a `Uint32Array` index buffer (forced above 65,535
vertices, `glx.js`). Taking ~1.5 indices per vertex:

| circuit | prop verts | VBO | +indices | total |
|---|---:|---:|---:|---:|
| **vegas** | **1,825,925** | 69.7 MB | 10.4 MB | **80.1 MB** |
| suzuka | 684,869 | 26.1 MB | 3.9 MB | 30.0 MB |
| watkins_glen | 679,838 | 25.9 MB | 3.9 MB | 29.8 MB |
| zandvoort | 532,011 | 20.3 MB | 3.0 MB | 23.3 MB |
| monaco | 492,895 | 18.8 MB | 2.8 MB | 21.6 MB |

**Vegas alone is ~80 MB of GPU buffer**, before textures, the baked material
arrays, the car meshes, the shadow map, the post chain's render targets, or the
JS heap that built it. Against a page that a real iPhone SE kills at ~100 MB,
that is not a comfortable margin — it is the whole budget.

And the build is worse than the upload: `pos`/`nrm`/`col` are plain JS number
arrays until `toF32` runs, so peak transient cost during `buildProps` is
materially higher than the 80 MB the VBO settles at.

## Why this matters for a deferred item

`ARCHITECTURE-REVIEW.md` lists **"no vertex budget gate"** under deferred
structural work, noting that `verify-track vegas` prints 1,825,925 prop verts and
**exits 0**, "on a codebase whose own comment names that VBO as the iOS jetsam
trigger". This part supplies the number that item was missing. The gate is cheap
— `verify-track.cjs` already computes the count, so it is a threshold and a
non-zero exit — and the ratchet pattern already used by
`tools/clip-baseline.json` and `tools/coplanar-baseline.json` fits exactly: pin
today's per-circuit counts, fail on regression, let a deliberate increase be a
visible edit to the baseline.

**Recommended follow-up, in order:**
1. Add the budget gate as a ratchet (cheap, no behaviour change, catches the next
   circuit that doubles).
2. Measure real device memory before optimising — `__apex.diag()` already
   reports GL capabilities; a page that dies without an exception needs the
   sentinel, not a try/catch.
3. Only then consider reducing Vegas. `js/track/scenery/graph.js`'s `batches()` already
   returns instanced draws (canonical mesh + per-instance mat4), and
   `docs/research/SCENE-GRAPH-PLAN.md` measured 383,402 of 383,403 nodes as
   instanceable — so the mechanism to stop uploading a million duplicated
   vertices **already exists and is not being used for the upload path**. That is
   the real fix, and it is a much bigger piece of work than the gate.


### What instancing would and would not buy

The recommendation above says the real fix already exists half-built. Worth being
precise about which cost it removes, because instancing is routinely oversold:

- **It removes the MEMORY duplication, which is the problem here.** A baked
  scene stores every copy's vertices; an instanced one stores the canonical mesh
  once plus a per-instance transform. At this repo's 40 B/vertex and a
  column-major `mat4` at 64 B, a prop of even 50 vertices costs 2,000 B baked
  against 64 B instanced — and `SCENE-GRAPH-PLAN` measured **383,402 of 383,403
  nodes as instanceable**. That is the 80 MB.
- **It reduces CPU-side draw-call overhead**, which matters more in WebGL than
  on desktop GL — the per-call cost is repeatedly reported as high.
- **It does NOT reduce GPU shading cost, and can slightly increase it.** The
  same triangles are still rasterised; you have only stopped paying to store and
  submit them repeatedly. Anyone measuring this should expect the win in memory
  and CPU frame time, not in fragment throughput.

So the honest framing for the deferred item is: instancing is the fix for *the
iOS memory ceiling*, not a general "make it faster" change. The number to
measure first is `__apex.trackGraph().stats()` on vegas — unique models vs total
nodes — because that ratio IS the saving, and it is one hook call away.

## Sources (Part 2)

- [Mobile Safari web pages are severely limited by memory](https://lapcatsoftware.com/articles/2026/1/7.html) — the iOS 26.2 ~100 MB/~200 MB measurements, and that no exception is catchable
- [Fix: Unity WebGL build crashing on Safari iOS](https://bugnet.io/blog/how-to-fix-unity-webgl-build-crashing-on-safari-ios) — the 300–500 MB WebGL heap figure, iOS WebGL 2 feature gaps (float textures, integer samplers, AA)
- [Jetsam kills WebGL application on iOS](https://stackoverflow.com/questions/44258746/jetsam-kills-webgl-application-on-ios) — jetsam killing at ~25% of device RAM

# Part 3 — measurements moved out of AGENTS.md (2026-09-01)

AGENTS.md keeps the rules; the measurements behind them live here. Each
subsection names the AGENTS.md rule it backs.

## The red run that is a missing install (Verification §1)

`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` keeps a fresh container's
install to seconds, but the flag leaves the BROWSER absent, and the specs launch
`chromium-headless-shell`, not the `/opt/google/chrome` the box ships. Measured
2026-08-17: every `test:tiny` test red — 73 of them — on a container that had
run `npm install` but not `npx playwright install chromium-headless-shell`;
re-confirmed live 2026-08-27. The two signatures:

| first failure message | missing |
|---|---|
| `Cannot find module …` | `npm install` |
| `browserType.launch: Executable doesn't exist …chromium_headless_shell` | `npx playwright install chromium-headless-shell` |

Both read as a boot regression from the summary line alone, and the cure is
seconds — which is why the rule is "read the FIRST failure's message before
believing any red run".

## Software pixels: what the soft-present path does (§Seeing the game)

On SwiftShader/Lavapipe the native WebGPU swapchain never composites to the
screen, and a single `getCurrentTexture()` breaks `mapAsync` for the whole
device. WGX therefore routes the visible `#game` through a 2D soft-present
blit: final pass → `COPY_SRC` texture → readback → `putImageData` on `#game`,
never `getCurrentTexture()`. Cache **1342+** uses ephemeral per-frame staging
buffers + `onSubmittedWorkDone` before readback (a persistent staging buffer
could be mapped while the next frame's copy landed on it); `awaitSoftPresent()`
resolves only after a non-blank visible blit, so a probe that awaits it cannot
screenshot the pre-first-frame black. `GLX.capturePixels()` (`wgx-capture.mjs`)
is the optional readback oracle and can flake after soft-present on
SwiftShader — the visible-canvas `gfx-probe.mjs` is the primary gate. Measured
canvas colours per backend: §Measured above.

## Cursor Cloud bootstrap (AGENTS.md §Cursor Cloud)

The bootstrap IS `.cursor/environment.json` (committed 2026-09-03: its `install`
calls `bash tools/cloud-agent-install.sh` and its `mcpServerAllowlist` names the
repo's stdio servers; `tests/unit/environment-json.test.mjs` pins it). System
packages still persist only via snapshot + Save on the environment dashboard — an `apt-get` in a live agent does **not** survive
the next cold boot otherwise (§Cursor Cloud agent environment above has the
package list and the ICD proof).

Registering the servers is NOT enough on its own: a Cloud Agent still needs
**chrome-devtools enabled in the MCP dropdown** at https://cursor.com/agents
(or team Integrations & MCP) — the host catalog often loads only two of the
three until all three are registered there (2026-09-03). When `chrome_*` is
missing from the session catalog, the CLI fallback is
`python3 tools/probe-mcp.py chrome-start` (see `.claude/skills/mcp-probe`).

Fresh-agent bootstrap, matching AGENTS.md Verification §1:

```sh
bash tools/cloud-agent-install.sh
# equivalent manual steps when the script is not the dashboard install:
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --ignore-scripts --no-audit --prefer-offline
npx playwright install chromium-headless-shell
npx playwright install chromium
```

The dashboard `install` should call `bash tools/cloud-agent-install.sh`. A bare
`npm install` can die on `registry.npmjs.org` ECONNRESET with npm's "Exit
handler never called!" (measured 2026-08-17, `bld-20260817-e70b375f`) even when
`node_modules` is already usable — `--prefer-offline` is what the script adds.
`wgx-validate` / `wgx-capture` need full Chromium: the headless shell has no
`navigator.gpu`. Missing Lavapipe (`test -f
/usr/share/vulkan/icd.d/lvp_icd.json` fails) means reinstall
`mesa-vulkan-drivers` or re-Save the env snapshot.

MCP on this host: the three-server map is `docs/AGENT-SURFACE.md` (trimmed from seven on 2026-09; the CLI-only leftovers are tabled there). Keep
`apex-tools` in repo-root `.mcp.json` (and `.cursor/mcp.json`); the cloud host
catalog is often empty, in which case the shell wrappers
(`./tools/apex-tools-mcp.sh call`, `./tools/playwright-mcp.sh`,
`./tools/tinyfish-mcp.sh`, `python3 tools/probe-mcp.py`) are the same surface.
Never run Chrome MCP while Playwright is running, and do not attach
`mcp-probe` for a `version.json` check (`deploy-research` owns that).

## Which probe command for which backend (moved out of AGENTS.md, 2026-09-03)

Operational table, kept beside the measurements it depends on. On
SwiftShader/Lavapipe the **native WebGPU swapchain never composites** to the
screen — that path stays black, and one `getCurrentTexture()` breaks `mapAsync`
device-wide. WGX therefore routes the visible `#game` through a **2D
soft-present blit**, and `GLX.awaitSoftPresent()` resolves only after a
non-blank visible blit.

| Backend | Command / path | Checks |
|---------|----------------|--------|
| **WGX visible canvas** | `node tools/gfx-probe.mjs --backend webgpu [--lite] <track>` | `#game` screenshot + `getImageData` (primary gate) |
| **WGX readback** | `node tools/wgx-capture.mjs <track>` → `frame.png` | `GLX.capturePixels()` — optional; can flake after soft-present on SwiftShader |
| **WGX A/B** | `node tools/wgx-lavapipe-probe.mjs <track> [--lite]` | `mesa-vulkan-drivers` + `VK_ICD_FILENAMES=…/lvp_icd.json` |
| **TLX / three** | `node tools/gfx-probe.mjs --backend three [--lite] <track>` | CI pin WebGL2 (`tlxForceGL=1`). AUTO is WebGPU (lite stack). `mappedAtCreation` → `queue.writeBuffer`. |
| **TLX WebGPU** | `node tools/gfx-probe.mjs --backend three --tlx-webgpu --lavapipe [--lite] <track>` | Soft-present 2D blit (Lavapipe). Never `getCurrentTexture()` on software. |

### The real GPU, in one paragraph

GitHub's Apple-silicon image (`macos-latest`) reports a HARDWARE adapter
(Metal) on stock flags; ubuntu-latest is SwiftShader, windows-latest WARP, this
container llvmpipe. Dispatch `.github/workflows/gpu-census.yml` —
`census_only: true` for the adapter answer in seconds, without it to run
`tools/gpu-game-check.mjs` and read the Verdict step, which GATES on GPU
errors, failed env-probe faces, or `softAdapter` true on hardware. **Never pass
`--use-angle=vulkan` on macOS** — it drops WebGPU to SwiftShader and silently
turns a real-GPU run software. Census tables and what the real GPU has found:
§There IS a real GPU above.

### Cursor Cloud, measured

Fresh-agent bootstrap is `bash tools/cloud-agent-install.sh` (the dashboard
`install` should call it: the AGENTS.md §Verification session-shape sequence
plus full Chromium, which `wgx-validate` / `wgx-capture` need — the headless
shell has no `navigator.gpu`). System packages (`mesa-vulkan-drivers`,
`vulkan-tools`, `xvfb`) survive a cold boot only via snapshot + Save on the
environment dashboard; `test -f /usr/share/vulkan/icd.d/lvp_icd.json` proves
Lavapipe. The npm ECONNRESET note is in §Part 3.
