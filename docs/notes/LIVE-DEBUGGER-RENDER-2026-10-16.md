# Live debugger hunt — render backends (TLX / GLX / WGX), 2026-10-16

## Scope covered

Lane: live render hunt (TLX / GLX / WGX), PR #2555, branch `cursor/live-debug-render-7e3a`. Live in the debugger's
Chrome: TLX boot + 13 circuit builds, WGX boot + rebuild A/B + mirror/matTex/renderScale/resize sweep + `device.destroy()`.
On the recording GL mock: GLX resize, mesh churn, context loss, forced shader failure. Per-scenario detail: coverage
matrix below.

## Findings

| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue# |
|---|---|---|---|---|---|---|---|
| F1 | `js/render/shared/canvas-css-size.js:25` (from `tlx.js:3666`, lease in `gfx.js:236`) | medium | CONFIRMED-LIVE | caught-exception pause in `CanvasCssSize.create`, frame 1 `TlxCreate`; `canvas` is the init-owner Proxy; in-page `new ResizeObserver(cb).observe(new Proxy(canvas,…))` throws `parameter 1 is not of type 'Element'`; `watched` stays true so only window events invalidate the CSS box | fc1926e9 | `tests/unit/init-owner-resize-observer.test.mjs` (failed 1/2 → 2/2); fix re-verified live on TLX: breakpoint at `canvas-css-size.js:25`, step over lands on line 26 (not the `catch`), `observer` is a live object | — |
| O1 | `js/render/renderer-boot.js:153` | info | BY-DESIGN | unset default boots GLX when `navigator.gpu.requestAdapter()` is null: `diag().env.backend = "webgl2 (pick: three)"`, `backendFallback = null` | — | — | — |
| O2 | `js/render/webgpu/wgx.js:958` | low | CONFIRMED-LIVE, DevTools-only | after `device.destroy()` (device captured via a `createCommandEncoder` wrapper): `mirror().drawn` frozen at 3998, `gpuErrors` 0, no error event, no reload, `state` stays `race`, `device.lost` pending 10 s | none proposed | — | — |
| O3 | WGX mirror pass | info | BY-DESIGN | first `mirror("on")` allocates 4 textures, later off/on adds nothing: cached for the session, not leaked | — | — | — |
| O5 | `js/render/glx/glx.js:757` (TLX equivalent) | info | BY-DESIGN, CONFIRMED-LIVE clean | `WEBGL_lose_context.loseContext()` 300 ms into `race()` (state `race`, track null) on GLX and on TLX: `race()` rejects `Race start did not reach the grid` ~1 s later, no `error`/`unhandledrejection`, `pagehide` reload ~1.2 s after the loss, `apex26.ctxLostReloads=1`, the new page boots healthy; `envProbeOff` and `perChunkOff` latches written (persist in the profile) | — | — | — |
| O4 | `__apex.race()` | info | VM-ONLY (harness) | `silverstone` rejected `Race start did not reach the grid` while the GPU process was pegged; next build fine | — | — | — |

## Clean areas (do not re-hunt)

- WGX buffer/texture lifecycle across rebuilds, `matTex` re-upload, `renderScale`, resize: balanced, `gpuErrors` 0.
- GLX create/delete balance on resize, `createMesh`/`freeMesh`, lost context (mock); forced all-shader failure refuses
  cleanly and frees the program once.
- TLX `renderer.info.memory` over 13 builds: no monotonic growth (weak: SwiftShader, partly headless).
- GLX scenario sweep (night race, mirror, `renderScale`, box resize, hidden/pageshow, `matTex`, day rebuild): `gpuErrors` 0, no JS error, live counts flat after warm-up.
- Context loss mid-build on GLX and TLX: clean reject + single bounded reload (no stuck black frame).
- Boot-canary revert after a killed Chrome is designed (`apex26.gfxProbeStrikes`, reason string in `backendFallback`).

## Not run, and why

TLX/GLX resize, hidden/visible, context loss in a build, quality-tier NaN breakpoints, night, mirror, matTex, and the
WGX hidden/night rows: drawing under SwiftShader pins the GPU process (one drawing `race()` took 47 s) and headless
Chrome cannot flip `document.hidden`. Issue #2572. No `WEBGL_lose_context` run, no NaN-conditional breakpoints, no TLX
create-throw break (a sibling owns that fix).

## js-debugger tool problems hit

- `debugger_state` returns every operation since attach, so each poll grows; `debugger_detach` + `debugger_attach` resets it.
- After a page-busy timeout `debugger_detach` reports `cleanupErrors` (timeouts) and the next `attach` can time out too;
  a new attach worked once the page drained. The container reset between turns killed Chrome and the daemon each time.
- With `debugger_exceptions all`, the probe's own caught exceptions pause the page and read as findings; and an
  `evaluate` of `ResizeObserver.observe` is blocked as a side effect and returns the paused frame's EvalError text.
- `debugger_detach` removes the debugger's own breakpoints AND resumes a pause you have not read: inspect first, detach last.
- `evaluate` of `canvas.__element` on the init-owner Proxy is blocked as a possible side effect (the get trap); step over and read a local instead.
- `debugger_run` results are only readable through `debugger_state` (two calls per read).

## Next step

Fill the TLX drawn rows of #2572 on a runner that can draw; `ready-gate` on the pushed head.

## Method

Method: js-debugger MCP attached to a headless Chromium (SwiftShader, `--remote-debugging-port=9222`) serving the
working tree on :3456. Pause on caught + uncaught exceptions while booting; then scenario scripts through
`debugger_run`. SwiftShader: faults are real, perf numbers are not. Backends are pinned with
`localStorage apex26.gfxBackend` (`three` | `webgl2` | `webgpu`) and `apex26.tlxForceGL=1`; resource counts come
from `?three-devtools=1` (`renderer.info`) on TLX.

## Coverage matrix

`live` = driven in the debugger's Chrome; `mock` = the recording GL mock; `read` = code read only; `—` = not run.

| scenario | TLX | GLX | WGX |
|---|---|---|---|
| boot | live (F1, fix re-verified) | live (default boot, diag) | live (SwiftShader Vulkan), gpuErrors 0 |
| circuit rebuild ≥ 5 | live: 7 headless flat, 6 drawn bounded | live+mock: night→day rebuild buffers 192→178, balanced | live: same-circuit A/B x3 identical |
| backend switch mid-session | live: GLX → TLX → WGX by pin + reload | same | same |
| resize / orientation | — (box-resize needs a drawing TLX frame) | live: CSS box 844→400 px with NO window event is picked up after the next draw, back to 844 on restore; mock: 6 sizes x3 flat | live: resize events x3 flat |
| tab hidden / visible | live: `hidden`, `visibilitychange`, `pageshow(persisted)` — no errors | live: same, counts flat, no reload | read: `wgx.js:950-1010` |
| context loss | live: lost 300 ms into a build → clean reject + reload | live: same; mock: lost ctx creates nothing | live: `destroy()` freezes canvas (observation) |
| quality tier (`renderScale`) | live (headless): 0.5 releases 7 textures (52→45) | live: 3 cycles 0.5↔1 identical (Te 22/23, Fr 1/2); canvas 844→422 px | live: balanced |
| night + floodlights | live (headless): `lightState.floodEmit` 0.23 | live: 40 light records once drawing, no GPU errors | — |
| mirror on/off | live (headless, state only) | live: on/off adds nothing, `drawn` increments | live: retained, not leaked |
| asset pack on/off (`matTex`) | — | live: flat, no churn | live: flat live count |
| forced shader failure | — | mock: `GLX.init` refuses, program freed once | — |

Not run, and why: a drawing TLX frame under SwiftShader pins the GPU process (one drawing `race()` took 47 s), so TLX
drawn rows (box-resize, mirror drawn, matTex, NaN-conditional breakpoints on uniform uploads) still need a real-GPU or
llvmpipe runner (issue #2572). TLX `renderer.info` rows above are headless, i.e. weak for resources.

## Not a bug (environment)

- **Unset default boots GLX here.** `renderer-boot.js:153` keeps the unset default on GLX when no WebGPU adapter
  resolves (no `/dev/dri`); `diag().env.backend` reads `webgl2 (pick: three)` with no `backendFallback`. Pin
  `apex26.gfxBackend=three` to get TLX.

## Resource counts — TLX circuit rebuild (`renderer.info`, `?three-devtools=1`)

7 builds via `await __apex.race(id)` with `__apex.headless(true)` (drawing suppressed; lazily uploaded
resources may be uncounted, so this is weak evidence — the 20-circuit run below draws 1.2 s per build):

| circuit | build ms | geometries | textures | scene nodes |
|---|---|---|---|---|
| bahrain (first) | 2820 | 11 | 50 | 32 |
| monaco | 2216 | 11 | 42 | 29 |
| spa | 2108 | 11 | 42 | 41 |
| monza | 1967 | 11 | 42 | 40 |
| suzuka | 1861 | 11 | 42 | 36 |
| silverstone | 2151 | 11 | 42 | 49 |
| bahrain (again) | 1540 | 11 | 42 | 32 |

Verdict: flat after the first build (the 8 extra textures on build 1 are warm-up); node count follows the circuit, no
accumulation. Operator notes (not defects): a drawing build under SwiftShader pins the GPU process (~200 % CPU) and
the page stops answering CDP for minutes; killing Chrome mid-boot arms the boot canary (`apex26.gfxProbeStrikes`) and
the next boot lands on GLX with `backendFallback = "boot canary: three never presented a frame last load"` (designed).

### TLX with real draws (`headless(false)` 1.2 s per build, distinct circuits)

| circuit | geometries | textures | scene nodes | build ms |
|---|---|---|---|---|
| bahrain | 232 | 56 | 213 | 4450 |
| monaco | 254 | 58 | 188 | 3427 |
| spa | 264 | 58 | 231 | 3401 |
| monza | 256 | 59 | 229 | 12360 |
| suzuka | 286 | 59 | 236 | 15544 |
| singapore | 237 | 59 | 214 | 13409 |

Counts follow the circuit (they fall again at singapore), no monotonic growth across 6 builds. A same-circuit A/B
(bahrain, monaco, bahrain, …) on a drawing TLX did not finish: one drawing `race()` took 47 s and the loop stalled
behind SwiftShader. Not a leak finding; the clean same-circuit A/B is done on WGX below and GLX in the mock.
`silverstone` failed once with `Race start did not reach the grid` (the `__apex.race` countdown timeout while the
GPU process was pegged); the next build was fine — harness timeout under SwiftShader, not a renderer fault.

### WGX (booted live: `--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader`, `apex26.gfxBackend=webgpu`)

`device.createBuffer/createTexture` and `GPUBuffer/GPUTexture.destroy` wrapped after boot; live = made − freed since the
wrap (negative buffers are boot-time buffers freed after it). `headless(true)`, 1 s settle:

| build | buffers live | textures live | gpuErrors |
|---|---|---|---|
| bahrain | −36 | 19 | 0 |
| monaco | −45 | 19 | 0 |
| bahrain | −36 | 19 | 0 |
| monaco | −45 | 19 | 0 |
| bahrain | −36 | 19 | 0 |

Same circuit returns to the same live delta every time: no buffer/texture leak across WGX rebuilds. A WGX build takes
~2 s (TLX 3–15 s under the same SwiftShader).

WGX scenario sweep in one live race (drawing ON, `mirror`, `matTex`, `renderScale`, resize; counters as above):

| step | buffers live | textures live | textures made | gpuErrors |
|---|---|---|---|---|
| drawing, mirror auto | 95 | 18 | 26 | 0 |
| `mirror("on")` | 95 | 22 | 30 | 0 |
| `mirror("off")`, `mirror("on")` | 95 | 22 | 30 | 0 |
| `matTex` 0 → 1 → 0 → 1 | 95 | 22 | 33, 36, 36 | 0 |
| `renderScale` 0.5 | 105 | 34 | 51 | 0 |
| 1 → 0.75 → 1 | 105 | 34 | 54, 57, 60 | 0 |
| `resize` event ×3 | 105 | 34 | 60 | 0 |

Mirror: the 4 textures are allocated on first `on` and then retained (off/on adds nothing) — cached, not leaked; they
stay resident for the session once the mirror was ever on (observation, mobile memory). `matTex` toggles churn 3
textures per pack re-upload with matching frees (live count flat). `renderScale` allocates the post targets once
(+12 textures, +10 buffers) and later scale changes create and free equal numbers.

`device.destroy()` on the live WGX device (captured through a `createCommandEncoder` wrapper; `WGX` exposes no
device): drawing stops (`mirror().drawn` frozen), `gpuErrors` 0, no error event, no reload, game `state` stays `race`
and `device.lost` was still pending 10 s later in this SwiftShader adapter. `wgx.js:958` returns early for
`reason === "destroyed"` because every self-destroy (`wgx.js:585/616/631/796`) is on an init/failure path that already
fails the create. An externally destroyed device therefore leaves a frozen canvas with no recovery; nothing in the
product destroys the device after init, so this is DevTools-only (low severity, no fix proposed).

### GLX (recording mock, `tests/helpers/glx-mock.mjs`, `tests/unit/glx-resource-balance.test.mjs`)

Static create/delete counts in `js/render/glx` differ by design (singleton targets created lazily, reallocated on
resize). Live `created − deleted`: after the first resize round has allocated the lazy post/shadow targets (+3
textures), three more rounds over six sizes (incl. 390×844 ↔ 844×390) add nothing; 20 `createMesh` + `freeMesh`
return to baseline; a lost context creates nothing. A forced all-shader failure makes `GLX.init` throw `refused` and
release the failed program once (pinned in `gfx-backend-canary.test.mjs`).

## Findings

### F1 — TLX never observes its canvas: `ResizeObserver.observe(Proxy)` throws and is swallowed (fixed)

- **Repro:** pin `apex26.gfxBackend=three`, `apex26.tlxForceGL=1`, reload with exceptions set to `all`.
- **Pause:** `js/render/shared/canvas-css-size.js:25` (`observer.observe(canvas)`), called from `tlx.js:3666`
  (`CanvasCssSize.create(_layoutCanvas, …)`); `_layoutCanvas = canvas` (tlx.js:387) is the `Gfx.createInitOwner`
  lease, a `Proxy` of `#game` (`gfx.js:236`).
- **Evidence:** in the page, `new ResizeObserver(cb).observe(new Proxy(canvas, {...}))` throws
  `parameter 1 is not of type 'Element'`. The `catch` sets `observer = null` but `watched` stays true (window
  listeners), so `read()` only re-reads `clientWidth/Height` after a window `resize`/`orientationchange`.
- **Impact:** on TLX a canvas CSS-box change that is not a window resize (a layout/panel/safe-area change, the
  settle window after rotation relying on the observer) is not seen until the next window event. GLX/WGX-without-
  owner paths observe a real element and are fine.
- **Fix (2 lines):** the lease answers `__element` with the real canvas (`gfx.js`); `CanvasCssSize` observes
  `canvas.__element || canvas`. Test: `tests/unit/init-owner-resize-observer.test.mjs` (failing before, passing after).
- **Confidence:** high (reproduced live and in the unit test).
