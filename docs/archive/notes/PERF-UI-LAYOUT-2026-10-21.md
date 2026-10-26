# Repeated preview and HUD layout work

The Three.js performance investigation found two avoidable DOM work paths.
These results measure operations and geometry, not iPhone frame-rate gains.

## Appearance preview

`AppearanceStudio.remember()` previously rendered while recording history.
`applySnapshot()` rendered again, and preset/reset wrappers rendered after
setting their final selection. History recording now leaves rendering to its
caller; preset/reset suppress the intermediate render. Undo clears the preset
selection before rendering, so its pressed state immediately reflects Undo.

The actual game was opened through Pause → Settings → Appearance in Chromium
at 844×390 with touch enabled. A MutationObserver counted replacements of the
preview and saved-profile options. Each tested action changed state.

| Action | Preview rebuilds before | After | Profile rebuilds before | After |
| --- | ---: | ---: | ---: | ---: |
| Home camera choice | 2 | 1 | 2 | 1 |
| Broadcast preset | 3 | 1 | 3 | 1 |
| Reset | 3 | 1 | 3 | 1 |

An isolated production-module fixture also confirms one rebuild for an external
visual-store change. Advanced controls can deliver both a click and a later
store subscription notification. The subscriber now skips rendering when the
click already recorded and rendered that snapshot, but still notifies scene
owners. A coupled-event regression fails with two rebuilds before that change
and passes with one afterward; unchanged clicks produce no rebuild or duplicate
scene event. Focused tests preserve choice focus, profile selection, advanced
controls, snapshot restoration, and preset highlighting after Undo.

The follow-up implementation passed 32 Appearance tests and a fresh actual
Three.js phone-tier browser check: one preview/profile rebuild per tested
operation, one rebuild for a real Home camera button tap, and Undo restoring
the previous camera with its announcement. That run reported no page or console
errors (`artifacts/performance-hunt/implementation-appearance.json`).

## HUD clearance

`findSlot()` returns its input rectangle when the panel already fits. The
previous caller still wrote two zero offsets and measured the painted box
again. The caller now reuses that rectangle as an obstacle for later panels.
Moved panels retain their painted-box measurement; reset, compact/drop recovery,
manual ownership and resize behavior are unchanged.

The production phone-tier Three.js/WebGL2 game ran Monaco. Shipped HUD toggles
enabled relative, strategy, inputs, damage and speed. Supported debug hooks
enabled real tyres, introduced damage and positioned the chase camera. After
freezing and refreshing the HUD, five synchronous clearance calls produced:

| Measurement | Before | After |
| --- | ---: | ---: |
| Style mutation records | 80 | 20 |
| Damage rectangle reads | 10 | 5 |
| Relative rectangle reads | 10 | 5 |
| Inputs rectangle reads | 10 | 5 |
| Strategy rectangle reads | 10 | 10 |

All eight observed target rectangles were identical between revisions. Each
revision was also stable across its repeated calls. The strategy panel required
a nonzero correction and retained its 20 mutation records. This controlled
workload does not measure natural clearance frequency or a frame-time speedup.

## Profiling limits and reproducibility

The ignored `scratch/performance-hunt/runtime-hunt.mjs` harness records source
hashes, settings, actual backend identity and rendered-present counts. Raw
evidence is under `artifacts/performance-hunt/`:

- `phone-baseline-cpu.json`: original Appearance counts; its CPU allocation
  interpretation is confounded by frequent expensive `memState()` polling.
- `phone-clean-baseline-cpu.json`: lightweight present counter, original HUD
  clearance, updated Appearance. The label is not a whole-tree baseline.
- `phone-allocation-hud-candidate-allocation.json`: updated HUD and Appearance;
  allocation sampling stopped before the DOM diagnostics.

The final two runs each sampled 12 actual rendered presents with the mobile
tier explicitly enabled. Diagnostic runs reported no page or console errors.
An earlier touch-only census actually used desktop graphics policy; it is not
phone evidence. Touch emulation does not satisfy this game's UA-based tier
selection, so verify `backendState().mobileTier` explicitly.

The environment uses SwiftShader, not an iPhone GPU. CPU samples, sampled
allocation estimates and nominal resource descriptors do not establish phone
FPS, physical VRAM use or thermal behavior. The allocation pass used the
[DevTools HeapProfiler protocol](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/)
with a 32,768-byte sampling interval and both collected-object flags enabled.
Those samples include temporary allocations and cannot be treated as retained
memory or exact allocation counts.
