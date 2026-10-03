# Cockpit rear-view mirror rendering contract

The cockpit mirror housings contain reflective glass, but their current material
does not show following cars. A physical rear-view image needs a depth-tested
surface in the main scene. This document defines that extension without adding
another world render for each mirror.

## Current reflection and its limits

[`js/car/car3d.js`](../../js/car/car3d.js), in the `mirrors` part, builds recessed,
canted cockpit glass with `SURFACES.mirror` (material 27). That material is also
the chrome livery finish; it is not a unique identifier for mirror glass.

The material has a glossy environment response in all three lighting shaders:
[`glsl-lit.js`](../../js/render/glx/shaders/glsl-lit.js),
[`tsl-lit.js`](../../js/render/three/tsl-lit.js) and
[`wgsl-chunks.js`](../../js/render/webgpu/wgsl-chunks.js). When a usable environment
cube is enabled, the surface blends that cube with its analytic sky/ground
reflection. With the probe disabled, unavailable or shed by the governor, the
analytic response remains. A preview must retain its `frame.noEnv` behavior so
a previous race's cube cannot appear on its car.

The environment producer in [`js/game.js`](../../js/game.js) captures world
meshes and sky around the player. It does not draw the rival cars. It updates
individual cube faces over time and is governor-gated. Consequently, describe
this glass as **environment-reflective**, not as a live rear-view mirror or a
reliable view of traffic.

## Reuse the existing rear camera

[`js/render/shared/mirror-pass.js`](../../js/render/shared/mirror-pass.js)
already draws the rear-facing world and nearby rival cars before the main pass.
It owns quality, resolution, cadence, camera pose and frame restoration. Its
single backend target also serves broadcast picture-in-picture, which uses a
different camera and does not flip the image.

The present renderer contract in [`js/render/gfx.js`](../../js/render/gfx.js)
exposes `mirrorBegin`, `mirrorEnd`, `mirrorRect` and `mirrorState`. It supports a
rectangle composited after the main scene, rather than a textured mesh:

| Backend | Target and current consumer | Required extension |
| --- | --- | --- |
| GLX | Private `mirTex` in [`post.js`](../../js/render/glx/post.js); `mirrorComposite` disables depth testing | Bind the completed HDR/LDR target to a main-scene textured surface draw |
| TLX | Private `mirRT` in [`tlx.js`](../../js/render/three/tlx.js); `mirrorEnd` renders the recorded draw list before main `begin` | A TSL material sampling the completed target, with normal main-scene depth and disposal behavior |
| WGX | Private `mirTex`/`mirSampleView` in [`wgx.js`](../../js/render/webgpu/wgx.js); `_mirrorComposite` uses the blit pipeline | A textured-surface pipeline/bind group using the completed target after its render submission |

A screen rectangle positioned over the housing is unsuitable: it would paint
over the bezel, halo and other occluders. It would also remain rectangular when
the camera turns or the car rotates during a crash. The main camera's normal
projection and depth test must determine the glass's visible pixels.

## Proposed surface API and geometry

Add an optional backend method:

```js
gfx.drawRearMirror(mesh, matrix, opts) // true when a valid rear image is drawn
```

It draws only the glass face in the main scene, using the completed rear target.
It returns false before the first successful rear pass, after target failure or
loss, when the target currently contains broadcast PiP, and on unsupported
backends. Deferred backends must record an explicit target generation/content
kind with the draw so a later target switch cannot silently change its meaning.
The method must never allocate a world-render target or initiate a camera pass.

Car3D should expose separate canted glass-face geometry or metadata for each
side: four local-space corners, UVs, side identifier and fallback material. The
housing and bezel stay in the regular body mesh. Material 27 alone cannot select
these faces because it also occurs in painted chrome surfaces. Reuse the same
placement calculation for body and glass so body variants cannot drift apart.

[`js/car/car-draw.js`](../../js/car/car-draw.js), in `drawCockpitRig`, applies the
car's actual body matrix to those faces. Draw a face through the proposed API
when available; otherwise draw its existing reflective material. Avoid duplicate
coplanar glass in the body mesh. Keep the reverse side opaque and retain the
bezel's depth occlusion.

A first implementation may share the current central rear-camera target between
the two surfaces. Document that approximation: it is not a separate optical
view from each housing. Side-specific crops can use explicit UV windows; they
must not suggest independent viewpoints. A later optical implementation needs
separate mirror positions, reflected viewing directions and its own measured
render budget.

## Image, lifecycle and performance rules

- Flip left/right once for the physical mirror. Backend render-target vertical
  conventions need explicit handling; do not inherit the HUD's post-composite
  flip a second time.
- Sample scene-linear color, then use the main scene's exposure/post chain.
  Avoid tone-mapping a rear image before it is tone-mapped again in the scene.
- Read only a completed target. Never sample the texture while it is attached
  to the pass drawing into it. Main `begin` must still follow the rear pass.
- Preserve HUD mirror, collapse chip, LOOK BACK and broadcast PiP behavior.
  Target content kind must distinguish rear view from broadcast.
- Keep the existing quality ladder, target-size caps and update cadence. Reuse
  one rear pass for HUD and physical glass, with no additional per-eye passes.
- Define physical-glass eligibility independently of HUD visibility. If that
  independence requires a rear render where none currently occurs, retain AUTO's
  software-renderer protection and explicit OFF semantics; measure the added
  work before enabling it by default.
- Garage, setup, debug and broadcast views use the reflective fallback unless
  their own supported rear-camera policy explicitly supplies a valid target.
- Resize, context/device loss, target replacement and backend disposal invalidate
  bindings and their readiness. A stale target must not display a prior race.

## Validation before enabling the extension

Unit tests should exercise rear/PiP content ownership, first-frame and failure
fallback, target generations, quality reuse, camera/frame restoration, disposal
and the absence of extra camera passes. Geometry checks should verify both
glass faces, UV orientation, bezel depth and all body variants.

Live browser probes must positively identify each active backend and inspect
following traffic, both mirror surfaces, daytime/night/wet rendering, low/high
seats, sideways and rearward looks, crashes, LOOK BACK, HUD hidden/collapsed,
OFF/AUTO/ON, broadcast transitions and previews. Check context loss/recovery and
zero GPU validation errors. Screenshots demonstrate framing and occlusion;
scripted state and draw counters establish behavior and render cost.

Follow [`render-tlx.md`](../../.claude/rules/render-tlx.md) and
[`render-wgx.md`](../../.claude/rules/render-wgx.md) for their live probes, WGSL
validation and macOS GPU census. Software rendering alone does not verify a
player's hardware path. Existing [`mirror-pass.test.mjs`](../../tests/unit/mirror-pass.test.mjs)
and [`hud-mirror.spec.js`](../../tests/specs/hud-mirror.spec.js) remain regression
coverage for the shared HUD/PiP pass.

Related geometry evidence: [cockpit datums](COCKPIT-DATUMS.md) and
[cockpit model references](COCKPIT-MODEL-REFERENCES.md).
