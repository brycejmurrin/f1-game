> Coverage update: Implementation pass retained as provenance. light-presets-complete.md closes the entire remaining preset table, so the directory union is complete.

# Lighting and FX implementation map; preset continuation pending

Read 2026-10-27 in `/workspace/f1-game`. All 14 implementation files (5,716 lines) were fully inspected in bounded, untruncated reads. The fifteenth file, `js/lighting/presets.js`, is PARTIAL: only lines 1–200 of 7,228 were read. Total assigned scope is 15 files / 12,944 lines. This report filename is retained for the planned complete scope, but does **not** assert that the preset data pass is complete. Source hashes below bind the exact inspected bytes. Local HEAD at ledger capture was `212adc24b985b120a63507c988abea69e7740e74`; concurrent parent documentation commits may advance it. No runtime source was edited. No browser, runtime execution, tests, or commit was performed by this lane.

Read repository `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`; used attached apex-lsp reference and hover tools for symbol contracts/consumers. An initial combined terminal read was truncated and is not counted; all claimed implementation ranges were subsequently re-read through untruncated calls.

## Source read ledger

| Path under `js/` | Lines | Inclusive ranges visibly inspected | SHA-256 |
|---|---:|---|---|
| `lighting/atmosphere.js` | 852 | 1–225; 226–450; 451–675; 676–852 | `ec92281afd7017ffa361419ca0d9f226a88a5923e3ae582a106f52b8e2077982` |
| `lighting/frame-lights.js` | 769 | 1–260; 261–520; 521–769 | `f491413e9d00405865c3033be7b092107b7f1acbf5418d9df5303ba62457957e` |
| `lighting/knobs.js` | 258 | 1–120; 121–258 | `ddcb861d37e0b881cd0dcd46eea21b0858552f30e3bcf1442b9fb3796cf8165d` |
| `lighting/lamp-bake.js` | 559 | 1–280; 281–559 | `45d2bc33ba3557469a6aa7e77d98a03b81c559163a500a2444e5f9143bebdeeb` |
| `lighting/lighting.js` | 16 | 1–16 | `40226712d4f67c8a8c7473dd83377757c744a4d559a734bb9a1c1a5e2c2e8774` |
| `lighting/presets.js` | 7228 | 1–200 ONLY; remaining 201–7228 | `3fd21c305419049ba13bd7f3616afd84725053bdb9c375ad111c6c17ceea9012` |
| `lighting/profiles.js` | 386 | 1–386 | `dd27530244bd9a7f0d269c356d1b589ba54153bc52d76e3c81294491874a76d8` |
| `lighting/track-lights.js` | 450 | 1–230; 231–450 | `9c486661688c520f3f50344643b9031156ee31ca8e9c75c10f5023a8ebc8aed3` |
| `lighting/tuner-panel.js` | 465 | 1–240; 241–465 | `88ecca2398df0f26ff1a892946450038bd358e378439c021054fb8e5f54f9a55` |
| `fx/car-fx.js` | 154 | 1–154 | `1a20bb9779da8d1548a4150cde8958d5f824f524794aa7fb5ec664f524f4d89b` |
| `fx/droplets.js` | 247 | 1–247 | `b462bc1117774a9eb90dd19d7bb330675be5caac3b070f3b7b01e08e5795f353` |
| `fx/grade-tint.js` | 49 | 1–49 | `4a453aa56e77f5cbe1379f5dd0546834dc7bda9530f38f3e34c61aa9dbcc262f` |
| `fx/particles.js` | 693 | 1–240; 241–480; 481–693 | `6894f2e774105d99a83e6684dc1067363b0db2c236414582bc94b6e4c00d535b` |
| `fx/skidmarks.js` | 124 | 1–124 | `7e156b4f20d8fb38f23d0e6264dc1fc498450172d3fa0a0151c241168f4f414f` |
| `fx/visor-optics.js` | 694 | 1–240; 241–470; 471–694 | `0ad9f124a7bcaae4b06e1fd6a62a4c8c40d61eebc2987eef04672442cd64e32c` |

## Boot and principal contracts

`LightKnobs` allocates the registry and one mutable `LT` object. `TrackLights` and `FrameLights` destructure LT at evaluation. `LightTune` is a frozen façade re-exporting the registry, live LT, track builder/stride, and frame assembly methods; freezing the façade does not freeze LT. The manifest HARD_EDGES at 892–898 corroborate that evaluation order. Presets are a separate lazy layer (`tools/manifest.cjs:1028–1032`), read from `window.LightPresets` at call time by the store. Manifest context was searched for literal paths and those matching lines inspected; the entire manifest was not read.

`LightStore.create(G)`, `Atmosphere.create(G)`, `TunerPanel.create(G)`, and `CarFx.create(G,{skids})` are factory boundaries. LSP identifies their game creation at `game.js:3511`, 4150, and 4126 respectively (LightStore references identify the sole game owner). Store captures stable store/clamp helpers while track, conditions, gfx, state, rainfall and rain initialization are read live through G. `types/game-ctx.d.ts:506–507` declares `frame`/`frameSky` as FrameState; LSP hover for `G.frame` currently presents `Opaque`, so the runtime record layouts documented here come from the inspected implementations rather than a claim of strong inferred types. Supporting type read was 496–515 only.

The central point-light record has 15 numeric lanes: world XYZ; RGB energy; radius; aim XYZ; inner/outer cosine; bleed; volumetric weight; glare weight. Track builders return ordinary arrays; frame assembly writes reused arrays and generation counters. `LightBudget` owns MAX 48, MOBILE 24, LITE 16, CHUNK 24, TAIL_RESERVE 5 and bound backend slots. Its full 1–31 source was supporting context, outside the assigned ledger. Light identity, not just value equality, is an important cache boundary.

## Lighting dataflow and lifecycle

1. `profiles.js` loads legacy flat or nested local settings, filters nested imported values to finite numeric members, migrates weather-specific sun angles into a shared dry slot where unambiguous, and resolves condition keys (`default` uses track night/day; storm uses rain). Sun elevation/azimuth resolve and write through the dry condition for every weather. Ordinary precedence is registry default → shipped global → shared TOD/weather → track condition → capability conditional TOD → player global → player condition, then clamp. For perChunkLights, an authored track pin is protected with max(track pin, conditional layer), before player layers. The conditional layer checks `gfx.hasPerChunkLights`, while measured render-time shedding is downstream.

2. Store apply/set collect rebuild, atmosphere reapply and rain-reseed effects once per call. Rebuild nulls `_lights` and `_alwaysLights`; atmosphere reapply avoids recursive calls and menu/select; rain knobs only reseed while rainfall/wetness is active. `holdRebuild` retains rebuild flags plus lampNearClamp/lampBake/tailLightEmit during blended weather. Stored deltas are compared against the effective inherited base, not simply registry defaults. Set is live immediately; persistence is explicit. Copy sends only stored edits or all current values to other tracks at the same TOD/weather, returns per-key undo snapshots, and does not reapply the unchanged current condition. Restore may affect the live key and reapplies. Reset removes current edits, applicable shared sun entries and the legacy global layer; callers then apply/persist.

3. `track-lights.js` maps themes/locales and fixture kinds to energy, cone and tint. Registered posts first have road node indices resolved from actual world positions with a WeakMap memo. Density thins or synthesizes fixtures; gap fill restores unlit spans; always-on subset skips both density and gap insertion. Beam aim/aimAt and true lens-to-road throw set inverse-square energy with a bounded incidence divisor. Mast radius is a floor over theme radius; bespoke radius remains authoritative. Synth lamps suppress halos, and the three start-gantry downlights have no halo/volumetric beam. All positions and geometry lanes remain stable until rebuilding produces a new source array.

4. `frame-lights.js` chooses a lamp cap against traffic tuning, mobile/backend slots and a held/sliding governor limit. Main and rear-view viewpoints own independent heap membership caches, eye/yaw/time thresholds and entry ramps. Ranking favors forward reach, while geometric distance sets the broad fade and a narrow biased boundary guard prevents abrupt membership loss. RGB carries per-lamp flicker, staggered warm-up, shared scale and cull fade; lampLum excludes flicker for stable shadow selection. allLights is the reusable transformed full set for chunk/grid paths, rate-limited at 20 Hz for unchanged source/scale, with a generation counter when values change. lampSetGen changes only with set/scale, avoiding env-probe churn from flicker. WeakRef track ownership, explicit release and pooled car-reference clearing protect track switches.

5. Tail selection uses wrap-aware arc distance from player, keeps at most five cars, samples road basis and appends rear/downward red cones. Default paint mode appends into glowLights only, preserving shader light slots and leaving tailStart/tailCount empty. Emit mode evicts static entries only against the total shed/backend slot budget, then records the dynamic range authoritatively. Brake heat and fade affect glow. The mirror re-ranks static lamps from its own eye and copies the forward dynamic range.

6. `lamp-bake.js` sums static upward diffuse and bounce into a sparse tile atlas: 16-texel tiles, one-texel gutter, half-float RGBA diffuse/bounce layers and an indirection texture. Road surface splatting includes bank height, rejects teleport seams, and upper decks win texel overlaps; terrain fills missing height. Unknown-ground sentinel and low/tight live-only lamps hand illumination back to live loops. Bakes key on source identity, clamp and texel budget; desktop budget is 600k atlas texels per layer versus 300k mobile. Initial/sync work can drain immediately, menu prebake yields a bounded step function, and live rebakes debounce 300 ms then advance generator steps within 3 ms slices while the old bake remains visible. New installs invalidate shadow lookup and increment bake gen. reset drops track/source/jobs/atlas references. shadowCol reconstructs the shadowed lamp from baked source colour times shared scale; liveOnlyAt supplies backend packer flags.

7. `atmosphere.js` resolves light profiles first, builds lamps if needed, and requests bake sync outside race/count or sliced during them. Every atmosphere apply derives explicit TOD or palette default bases afresh, then applies asset environment fill, weather cloud/fog/exposure/key modifiers, ground mist and tuner colour/angle/saturation changes. Night skyglow clears on leaving night. Fog uses an effective-density band, twilight colour and separate night exposure/mist constraints. Lightning stores ambient/exposure bases rather than accumulating a flash. floodEmit is one shared prop-emissive formula. Weather arcs snapshot frame/sky/LT and cross-fade over 25 s using smoothstep; null cityGlow fades to zero then clears. Held bake knobs avoid rebaking during weather fronts; a concurrent direct knob write opts that id out of the active fade. Array reuse avoids aliasing snapshots. Menu prebake applies the same resolved key and returns a step closure.

8. `tuner-panel.js` builds tabs/sections/sliders from registry metadata, supports keyboard tab navigation, persists on range change rather than each drag input, and shows capability/crash/governor dependency notes. Preview captures TOD/weather/weatherArc and restores all three on close. Copy-all arms for 20 s, stores one undo snapshot for the panel lifetime, and computes track count dynamically. COPY VALUES exports only `window.LightEdits`, preserving shared sun slots/current condition first; the distinct name protects snapshot-replacement tools. Clipboard copy uses the synchronous-first helper. Close clears undo/timers and restores settings display state.

Supporting game reads: 4120–4138, 6678–6702, 7110–7155, 8243–8270. These show façade wrappers, frame gates, sliced bake use, and Particles/Droplets order; they do not constitute another full game.js pass.

## FX dataflow and lifecycle

`Particles` owns a fixed struct-of-arrays CPU pool (96 mobile / 256 desktop), alpha/additive vertex buffers and separate one-frame flare buffer. Emission reads particleMul and measured autoShed. Continuous emitters stochastically round count requests, clamp bursts to 24, and reserve pool headroom for plank sparks (60%) and spray (75%); full general pools recycle greatest age/life. Spray has rooster-tail, lingering mist and plume branches, and a previous-frame nearest-car admission threshold with hysteresis. update caps dt at 0.1 s, rolls the spray threshold, swap-removes expired particles and advances drag/gravity. draw expands pooled billboards into two batches, appends steady flares and world-space rain, and latches dirty state to avoid unchanged uploads; one-frame flares force their later removal. Clear drops transient pool/flares and caches but intentionally preserves the rain seed.

Rain uses a camera-relative bounded box with wrap, seeded at mobile/desktop caps 140/1000 and continuous density/shape from numeric rainfall. Storm multipliers affect seed; drizzle knobs alter count/speed/length. Camera finite difference controls apparent rain direction/length, reset on cuts over 40 m. Falling offsets update each tick and force geometry refresh near 30 Hz even with a stationary camera. Dirty checks include eye cells, speed buckets and relevant knobs. Rain draws only after rainUpdate fed that frame; otherwise stale rain geometry is removed. Quads are pre-expanded with size zero and merged into the same alpha call as smoke/spray for all backends.

`CarFx` reads grounded car matrix, scrape/pitch, lock state and pace-normalized speed; it writes no car state. Plank scrape emits at the lowest longitudinal floor position, and AI lock-up marks use per-car WeakMap cadence. Heat haze chooses one sustained-on-power anchor, nearest ahead for onboard views, fades old anchor before switching, marks wake position from body matrix, then projects a near-field post anchor into a reused {u,v,str}. `SkidMarks` stores 120 matrices in a dirty ring and rebuilds one batched vertex buffer only when changed; player cadence is 5/60 s, AI slots at most 40 and oldest AI slots are replaced at cap. reset clears all session state. draw first asks backend for a batched path then falls back to distance-culled individual marks.

`GradeTint` provides four wet/dry × night/day paint bases and a single synchronous draw scratch scaled/clamped by LT. hue/saturation are pure colour helpers except no-op paths return their original input. The scratch must not be retained for deferred per-car use.

`Droplets` owns a lazy static-or-created overlay canvas, cached three-meniscus atlas and desktop-sized struct-of-arrays. Canvas DPR caps and live-drop caps depend on cached device class. Onboard/rain/quality/photo gating clears off state; helmet water may drain after rainfall stops. Motion uses gravity, adhesion, speed-squared pressure and exponential velocity response; reduced motion uses smaller stationary fading populations. Paused dt freezes water, changed atlas/resize may redraw, and per-tick dt caps at 0.1 s. clear also clears visor optics. The droplet heartbeat ticks VisorOptics before gating water, so dry helmets still have a shield.

`VisorOptics` is three coordinated surfaces: viewport/tint cached SVG eye-port background, lazy Canvas2D reflection layer and cached 128² SVG displacement map. Scene lighting comes from __apex.visorScene or camState/lightState fallback; sceneFromG returns current frame/camera arrays read-only. The pure lightMap projects sun/ghost/rim and at most eight brightest lamp glints with daylight adaptation; optional beams/stars/fringe/bloom follow settings. Paint throttles at 15 Hz / reduced 8 Hz. Backend blend mode chooses additive only for WebGPU and plain over elsewhere, rechecking once/second; tuner bloom/glare reads cache for two seconds. Helmet/quality/visor/reflection state gates paint; clear hides reflection canvas, while port/refraction styling follows its own settings. Paint failures clear glass, count errors and warn only once. Test reset helpers forget cached DOM/device state rather than representing production teardown.

## LSP corroboration

Attached apex-lsp full file-count results (2026-10-27):

| Symbol | References / files | Main consumers |
|---|---|---|
| LightTune | 43 / 12 | photo-studio 16, particles 6, scenery/build-props 5, game 3, garage/setup-camera 3, car-draw 2, atmosphere 2; agent/apex, profiles, tuner, shadow-pass |
| LightStore | 11 / 5 | tuner-panel, quality-preset, photo-studio, game |
| LampBake | 29 / 7 | game, three/tsl-lit, webgpu/wgx, atmosphere, glx/glx, three/tlx |
| FrameLights | 8 / 4 | mirror-pass, game, lighting façade |
| Particles | 45 / 8 | game 21, weather-arc 10, car-draw 3, atmosphere 3, car-fx, marshal-panels, start-lights |
| VisorOptics | 8 / 3 | droplets 4, game 2 |
| SkidMarks | 3 / 2 | game |
| GradeTint | 6 / 2 | game |

Member queries show LightTune.setFrameLights and appendCarTailLights delegated at game:6693/6696; LampBake.forTrack called by game renderLightingPrep:7141 and atmosphere:221; Droplets.tick called by game render:8258; VisorOptics.sceneFromG delegated at game:79. LightStore.reapply has uses in quality-preset:181 and photo-studio:99; this confirms call sites but does not turn its stale quality-gating comment into current behavior. LSP is source navigation evidence, not runtime validation.

## Proven comment cleanup candidates

No source comments were changed. These are concrete source/comment discrepancies, not unverified visual defects:

- `knobs.js:4` names `light-store.js`; the fully inspected profile owner is `js/lighting/profiles.js`. `tuner-panel.js:349,365` similarly names the old `light-presets.js`; current manifest path is `js/lighting/presets.js` and manifest rename map retains the old path. Update paths while retaining historical measurement context.
- `profiles.js:4–5,121,377–380` describes a quality-gated conditional layer / resolution through GfxQuality. The actual `condLayer` (122–145) uses only track/TOD and `G.gfx.hasPerChunkLights`; GfxQuality.set still calls reapply but is not the resolver gate. Describe capability resolution and distinguish the remaining hook from a quality-dependent layer.
- `frame-lights.js:493` says “Sort just those 32”; the heap length is CAP, derived from lampCull/device/backend/shed and can reach 48. Use “selected lamps” or CAP.
- `particles.js:44–46` says stationary rain stops re-uploading and does not dirty every falling step. The later rainUpdate explicitly forces dirty near 30 Hz (608–612); the current behavior is bounded refresh, not a frozen upload at rest.
- `visor-optics.js:21` claims ≤14 gradients per repaint. `_paint` can draw eight glints, each `_glow` creating two gradients when bloom is on, already 16 before sun, rim, haze, beams and stars. Replace the obsolete upper bound with a measured/current cost description or calculate a valid bound.
- `visor-optics.js:21,385` says “1 css px per device px”; `_size` uses window.innerWidth/innerHeight directly as canvas backing dimensions with no devicePixelRatio multiplier. Describe one backing pixel per CSS pixel.
- `atmosphere.js:577–578` says fogWxMul “has just TRIPLED” density; current default is 1.5 and the effective density is band-clamped at 559–568. This present-tense numeric description no longer matches the code. Retain history only if explicitly marked historical.

Other long historical rationale blocks are not classified as stale merely because their old values differ: many explicitly explain a repaired prior implementation. Parent can decide prose shortening separately from source behavior changes.

## Exact continuation

Resume by reading `js/lighting/presets.js` **201–7228 inclusive**, in bounded untruncated chunks (e.g. 201–800, 801–1400, etc., reducing chunk size if needed). Hash must remain `3fd21c305419049ba13bd7f3616afd84725053bdb9c375ad111c6c17ceea9012`. Do not re-credit implementation reads from summaries alone if any source hash differs. Lines 1–200 establish global grade, capability TOD layers and several shared condition stamps; no claim has been made about the remaining per-track data, complete key coverage, duplicate keys or range validity. After the full data pass, add its exact read ranges and data exceptions/proven comments, remove this pending status and let the parent run required docs checks and serialize commits. No remaining implementation file ranges are unread.
