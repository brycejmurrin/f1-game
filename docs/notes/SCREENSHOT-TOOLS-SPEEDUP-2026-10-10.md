# Screenshot and track-survey tools — what costs time, what to change (2026-10-10)

Measured in the Cursor cloud dev container (4 cores, 16 GB, Chromium 1194, Mesa 25.2.8 /
LLVM 20.1.2, nothing else heavy running). Single runs unless a range is given; run-to-run
noise on one shot was large (the same llvmpipe single shot measured 10.7, 13.5, 17.0 and 18.5 s
across runs), so read the ratios, not the decimals. Scratch scripts were not committed; the recipes
below reproduce each number. Web sources are cited at the end.

## 1. The tools, by what they cost

**Browser tools (all boot their own Chromium, all hard-code `--use-angle=swiftshader`).**
~35 call sites pin SwiftShader (`grep -rn use-angle tools/`); only `hud-survey.mjs` (`--gl
llvmpipe`) and `track-session.mjs` (`APEX_GL=llvmpipe`) have any llvmpipe switch.

| Tool | Shape | Cost (SwiftShader) |
|---|---|---|
| `shot.mjs` | one shot per boot | 38-45 s per shot |
| `apex-eval.mjs` / `agent.mjs` | one expression per boot (`--vm` = Node VM, no browser, ~4 s) | boot-bound |
| `track-session.mjs --serve` (`apex_track` MCP) | boot once, JSON-line ops | boot 15 s + build 8 s, then 8-9 s per shot (mean 11.9 s over 8 shots) |
| `apex-capture.mjs` | N processes, dynamic queue, `APEX_WORKERS` (default 2) | see §2 |
| `shot-survey.mjs`, `survey-track.mjs`, `pit-shots.mjs`, `garage-*.mjs` | one boot per circuit or per sweep | amortised |

**Node-VM tools (no browser).** `verify-track`, `clip-audit`, `float-audit`, `coplanar-audit`,
`ground-audit`, `props-tris`, `audit-circuit`. A circuit build is ~1.1-1.7 s (`buildContext`
82 ms). `audit-circuit <id>` runs its six checks as six serial subprocesses, each rebuilding
the circuit: 18.8 s for miami (verify 3.4, float 2.9, clip 2.3, coplanar 3.3, props 2.8,
ground 4.1). `--all` sweeps are single-process: `clip-audit --all` 82 s, `float-audit --all`
102 s. `tools/lib/game-vm-pool.cjs` (worker pool) exists but only `elevation-tracks-vm` uses it.

## 2. Measurements

### 2.1 Renderer: llvmpipe is 2-4x faster than SwiftShader, and works here

`docs/notes/CI-RENDERING-PERFORMANCE.md` §"llvmpipe for WebGL2 does not reproduce in this
container (2026-09-16)" says not to retry. It does work now. The WebGL renderer string
resolves to `ANGLE (Mesa, llvmpipe (LLVM 20.1.2 256 bits), OpenGL 4.5)` with:

```sh
xvfb-run -a -s "-screen 0 1280x720x24" node <tool>      # a LIVE X display is the requirement
# Chromium args: --use-gl=angle --use-angle=gl --ignore-gpu-blocklist
```

Isolated by probe (`getContext("webgl2")` renderer string):

| Launch | Renderer |
|---|---|
| `--use-gl=angle --use-angle=gl` under `xvfb-run`, with or without `LIBGL_ALWAYS_SOFTWARE=1` | llvmpipe |
| same, no Xvfb | SwiftShader (silent fallback) |
| `--use-angle=gl` without `--use-gl=angle`, under Xvfb | no WebGL2 |
| any of the above + `--enable-unsafe-webgpu` | probe says llvmpipe, but the **game page crashes** ("Target crashed") |

`--enable-unsafe-webgpu` is the trap: `shot.mjs`, `track-session.mjs`, `apex-capture.mjs`,
`apex-eval.mjs` and others pass it, and `track-session.mjs`'s existing `APEX_GL=llvmpipe`
path keeps it and never starts a display, so that path cannot have worked here. The
2026-09-16 trial's "hanging outright" rows are consistent with that crash. I did not
re-run its exact rows, so treat "the note was wrong" as likely, not proven.

One cota shot (`shot.mjs cota 0.635 orbit --az 90 --dist 40`), whole process:

| Renderer | Wall |
|---|---|
| SwiftShader | 38-45 s |
| llvmpipe (`--use-gl=angle --use-angle=gl --ignore-gpu-blocklist`) | 13.5-18.5 s |
| llvmpipe, `--use-angle=gl-egl` | 44 s (no gain) |

Frames are not pixel-identical across renderers (mean abs diff 17.7/255, 11% of pixels
>40 levels on one frame): fine for surveys, not for SwiftShader-pinned pixel baselines.

### 2.2 Concurrency: separate processes, 4 distinct tracks, one shot each

| Renderer | N | wall | s/shot |
|---|---|---|---|
| SwiftShader | 1 | 38 | 38 |
| SwiftShader | 2 | 85 | 42 |
| SwiftShader | 4 | 319 | **80** (load 12) |
| llvmpipe | 1 | 17 | 17 |
| llvmpipe | 2 | 19.6 | **9.8** |
| llvmpipe | 4 | 41.7 | 10.4 |
| llvmpipe, N=4, `LP_NUM_THREADS=1` or `2` | 4 | 43-44 | 10.8-11.0 (no help) |

SwiftShader gets *worse* per shot past one process; llvmpipe's best is 2 processes. One
Chromium with N pages instead of N processes:

| Renderer | N pages | s/shot |
|---|---|---|
| llvmpipe | 1 / 2 / 4 | 16.5 / 10.1 / 11.0 (same as processes) |
| SwiftShader | 2 | 62 (worse than 2 processes, 42) |

So: no gain from tabs over processes; cap workers at 2 on this 4-core box.
`apex-capture.mjs`'s existing default of 2 (and its comment "4+ OOMs SwiftShader") is right.

### 2.3 Persistent session (boot once)

`track-session.mjs` with llvmpipe flags (my local copy: gl flags, no unsafe-webgpu, under
Xvfb), cota, 8 orbit shots: boot 10.1 s, build 7.6 s, then 2.2/2.2/2.1/1.9 s for the first
four shots and 5.2/6.8/7.7/6.5 s for the next four (mean 4.3 s). SwiftShader: mean 11.9 s
(8-9 s typical, the first shot 27 s). Why the later llvmpipe shots cost 3x more is not
established (different frac ranges, shader/pipeline warm-up, or scene weight).

### 2.4 Geometry audits across processes (no code change)

`APEX_CIRCUITS` (comma list) already narrows every `--all` audit. Splitting the 52
circuits round-robin into N partitions and running N processes:

| Audit | serial | 2 procs | 4 procs |
|---|---|---|---|
| `clip-audit --all --json` | 81.7 s | 45.4 s | **34.0 s** (2.4x) |
| `float-audit --all --json` | 101.7 s | n/a | **43.3 s** (2.35x) |

All 52 circuits came back merged. `APEX_CIRCUIT_SHARD=i/n` is **not** honoured by these
audits (only the VM suites use `shard()`): four "shards" each ran the full fleet and took
longer (120 s vs 82 s serial for clip-audit; 164 s vs 102 s for float-audit).

## 3. Recommendations, ranked by measured gain per effort

1. **Make llvmpipe the default for the screenshot tools, centrally.** One change in
   `harness.launchChromium` (or one shared `softwareGlArgs()`): when Mesa and Xvfb are
   available, rewrite `--use-angle=swiftshader` to `--use-gl=angle --use-angle=gl
   --ignore-gpu-blocklist`, **drop `--enable-unsafe-webgpu`**, and start/own an Xvfb
   (teardown through the existing registry) instead of requiring `xvfb-run`. Gain 2-4x
   for every tool, no per-tool edits. Keep SwiftShader as the opt-out and for pixel
   baselines. Verify the renderer string at launch and fail loudly if it silently fell
   back (no X display falls back to SwiftShader without an error).
2. **Prefer `track-session` for any multi-shot job.** 45 s/shot becomes 9 s (SwiftShader)
   or 2-7 s (llvmpipe). Give `shot.mjs` a `--session` path or point agents at
   `apex_track`.
3. **Parallelism: at most 2 browser workers on 4 cores; never 3+ on SwiftShader.** Processes
   and tabs perform the same, so keep processes (isolation). Two llvmpipe workers each
   running a persistent session is the likely best combination (not measured together).
4. **Parallelise the node audits.** Add `--jobs N` (partition via `APEX_CIRCUITS`, merge the
   JSON) to the `--all` audits: 2.4x for free on 4 cores. In `audit-circuit.cjs`, run the six
   checks concurrently instead of serially (about 19 s to about 4-5 s for one circuit), or
   build once per circuit and run all six audits on it. Make `scope()` apply
   `APEX_CIRCUIT_SHARD` so the documented variable works for every `--all` audit; then
   CI's `Per-circuit geometry sweeps` (1231 s on #1379's ready run) can matrix-shard.
5. **Use `game-vm-pool.cjs` for fleet audits** (one booted VM per worker, circuits fed
   dynamically) rather than one process per partition: circuit cost is uneven, so a
   queue beats a static split.

Not measured: JPEG vs PNG capture and CDP `Page.captureScreenshot` options (no benchmark
found, see sources; capture is a small part of a 2 s llvmpipe shot), `connectOverCDP` or
`launchServer` warm-browser reuse, the 1-core case.

## 4. Risks and caveats

- Chromium's own SwiftShader doc says automatic SwiftShader WebGL fallback is deprecated
  ("will soon fail instead of falling back") and that opt-in needs
  `--enable-unsafe-swiftshader`. Many pinned tools pass only `--use-angle=swiftshader`.
  Another reason to centralise the flag choice.
- Pixel baselines (menu-baseline etc.) are SwiftShader-pinned; llvmpipe frames differ.
  CI already uses llvmpipe for smoke / selected shards and excludes `menu-baseline`.
- A live X display is required for llvmpipe; a dead `DISPLAY` is cleared by the harness,
  which would silently select SwiftShader.
- **A renderer can hide or show a defect.** On cota the T12 tecpro wall (instanced batch)
  is invisible on SwiftShader but draws on llvmpipe. Do not treat SwiftShader-only absence
  as a product bug without a second renderer or `gpu-census`.
- Side finding: `audit-circuit miami` reports ground FAIL on ship (flatCoplanar 19 vs
  baseline 17; buried 7, unsupported 8). `scenery-ground-audit.test.mjs` samples circuits
  that do not include miami, so CI is green; the baseline was not raised for #1365.

## Sources

- [Microlink — faster WebGL screenshots (SwiftShader to llvmpipe)](https://microlink.io/blog/faster-webgl-screenshots):
  `--use-angle=gl` needs a display even headless; 23.6 s to 7-14 s in production, ~6 s isolated.
- [Chromium docs — Using Chromium with SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md):
  automatic WebGL fallback deprecated; `--enable-unsafe-swiftshader` opt-in.
- [Playwright — Parallelism](https://playwright.dev/docs/test-parallel): each worker is a
  separate process with its own browser.
- Web searches on `Page.captureScreenshot` options, `launchServer`/`connectOverCDP`, and
  llvmpipe thread tuning returned no benchmarks, so none of those are claimed above.
