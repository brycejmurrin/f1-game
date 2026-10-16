# Lighting tuner wiring audit — 2026-10-06

**Audit only.** OWNED: `js/lighting/**` (+ related tests). No scenery/circuits
edits. No auto-merge. No Pages dispatch.

**Tip audited:** `9d0b47f76` (`claude/f1-game-project-26h3ng` after tip sync).
**Artifact JSON:** `/opt/cursor/artifacts/lighting-audit/lighting-tuner-audit.json`
(also `wiring-static.json`, `runtime-ab.json`, `runtime-ab-render.json`).

## Verdict

**No DEAD knobs.** All **189** `TUNE_DEFS` entries wire through to a real
consumer (uniform upload / per-frame / applyRace / rebuild / floodEmit).

| status | count | meaning |
|---|---|---|
| CONNECTED | 187 | Stored → LT → atmosphere/frame/shader/post |
| SUSPECT | 2 | Dependency-gated by design (`roadChunkLamps`, `matTexMix`) |
| DEAD | 0 | — |

Preset keys: **0** orphan keys outside `TUNE_DEFS`. Panel builds one slider per
`TUNE_DEFS` id (`js/lighting/tuner-panel.js`). `frame.tune = LT` each frame
(`js/game.js`).

## How verified

1. **Full-tree static scan** (`scratch/lighting-audit/audit-wiring.mjs`): every
   id has a `.id` / `PostCommon.knob(…,"id")` / `gk("id")` consumer, or a `u`
   uniform present in the shader tree with `frame.tune = LT`. Carved
   `Atmosphere.floodEmit` as per-frame (same premise as
   `tests/unit/lighting-reapply.test.mjs`). APPLY_RACE / rebuild gaps: **none**.
2. **Classifier** (`node tools/lighting/slider-effect.mjs --json`): useful for
   gates/tags; **over-flags** `inert` (~42 false positives — misses string
   `knob("id")` reads and most post uniforms) and falsely flags `floodEmitMul`
   as `reapply`.
3. **Runtime A/B** via `__apex.lightTune` / `lightState` (Playwright harness,
   not `#game` clicks): 44 knobs across TOD×weather buckets (night Singapore,
   dawn/day Monaco dry/wet/rain/fog/overcast, Bahrain day/night). Headless
   false-negatives re-probed with render on.

### Runtime evidence (selected)

| knob | condition | evidence | status |
|---|---|---|---|
| `nightAmbLift` | singapore night | `ambientSky`/`ambientGround` | CONNECTED |
| `cityGlowWarm` | singapore night | `ambientSky`/`ambientGround` | CONNECTED |
| `floodEmitMul` | singapore night + render | `floodEmit`, `meanLampRGB` | CONNECTED |
| `lampLevel` | singapore night + render | `meanLampRGB`/`meanPerChunkRGB` | CONNECTED |
| `floodDay` | monaco day | `meanLampRGB`, `bakedLights`, `perChunkLights` | CONNECTED |
| `weatherSunMute` | monaco overcast | `sunColor`/`skySunColor` | CONNECTED |
| `overcastFogMul` | monaco overcast | `fogDensity` | CONNECTED |
| `fogWxMul` | monaco fog | `fogDensity` | CONNECTED |
| `sunElev`/`sunAzim` | monaco dawn | `sunY`/`skySunDir` | CONNECTED |
| `ssrWetMul` / `hazeWetShare` / `drizzleCount` | monaco wet | `meanLampRGB` (frame path live) | CONNECTED |
| `lightning` | monaco rain | `meanLampRGB` | CONNECTED |
| `roadChunkLamps` | singapore night | needs `perChunkLights>0` | SUSPECT (gate) |
| `matTexMix` | monaco day | no-op without asset pack | SUSPECT (gate) |

Full 189-row table: artifact JSON `knobs[]` (`id`, `path`, `status`, `evidence`).

## Priority — not broken knobs, follow-ups

1. **Tooling mislabel:** `slider-effect.mjs --risk reapply` lists `floodEmitMul`.
   Fix: carve `floodEmit()` like `lighting-reapply.test.mjs` (knob is live
   every frame; not APPLY_RACE).
2. **Tooling mislabel:** ~40 uniforms/post knobs scored `inert` because
   `SCAN_FILES` misses `PostCommon.knob(T,"id")` / TLX/WGX post. Expand the
   classifier — do not treat those as DEAD.
3. **Probe gap (optional):** `lightState()` does not expose `cityGlow`,
   effective `exposureMul`/`ambientMul` scale, `lampFog`, AO strength, or
   volumetric beam level — those knobs are wired in source (`atmosphere.js` /
   `glx.js` / `game.js` post opts) but A/B via `lightState` alone looks quiet.
4. **Expected gates:** `roadChunkLamps` (needs `perChunkLights`), `matTexMix`
   (needs baked pack). Documented in `TUNE_DEFS.help`.

## Verify named

```sh
node tools/lighting/slider-effect.mjs --json   # classify
node --test tests/unit/lighting-reapply.test.mjs
# runtime (this audit): node scratch/lighting-audit/runtime-ab.mjs
#                       node scratch/lighting-audit/runtime-ab-render.mjs
```

No game/lighting code change in this PR — findings only.
