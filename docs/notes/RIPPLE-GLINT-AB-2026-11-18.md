# Rain ripples and the sun highlight on puddles: built, measured, withdrawn (2026-11-18)

Summary: the TLX/WGX re-dot of the sun-specular terms after the rain-ripple tilt (#5777 row 1) was built, measured and withdrawn: no measurable movement toward the GLX reference on TLX, further from it on WGX, slightly more flicker; the patch is kept here.

Kind: measurement · Re-measure-by: 2026-12-20

Rendering lane A3, PR #5781. **Nothing shipped: the shaders are unchanged.** "Before" below is the deploy tip
9261395b; "after" is that tip plus the patch at the end of this note. **Evidence class of every number here: `software`** (this container, SwiftShader, no
GPU). Nothing here was measured on a phone or a real GPU.

## Read this first: the TLX frames here took TLX's software fallbacks

Every TLX capture in this note ran on three's WebGL2 backend on SwiftShader (`apex26.tlxForceGL=1`) with no
`apex26.tlxForceHw` pin. On a software adapter TLX swaps content paths for budget, not correctness
(`softContent(part)`, `tlx.js:913`): `sky` (a zenith-only fallback sky), `env` (a cleared env probe), `shadow`
(shrunk maps) and `chunked`. Which of them were active was NOT recorded in these captures
(`GLX.__tlx.skyState().fallback` would say); by the code, all four were. So:

- The cross-backend numbers (TLX against GLX, including "the larger finding" below) are **not evidence about a real
  GPU**. A darker, less blue wet road is what a fallback sky and a cleared env probe would produce. Repeat with
  `--ls apex26.tlxForceHw=env,sky` (or on real hardware) before reading anything into that gap.
- "The broad sun patch already ripples via the env reflection" was observed on those software frames and on WGX and
  GLX; the source order (the env reflection reads the rippled normal on all three) does not depend on the fallback.
- The withdraw decision rests on before-versus-after on the SAME backend and path, which the fallback does not
  affect.

## What was wrong, exactly

GLX tilts the normal for rain ripples and re-dots the sun-specular terms against it (`keySpecNoL/NoV/NoH`). TLX and
WGX cached `NoL/NoV/NoH` before the tilt. #5777 row 1 described that as "rain ripples do not reach the sun glint".
That overstates what a player sees: the broad sun patch on a puddle is the **env-reflection sun flash**, which reads
the rippled normal on all three backends already. Only the Cook-Torrance key lobe was flat, and on pooled water
roughness is 0.02, so that lobe is a pinpoint.

## The scene

Monza, `day|rain`, `lightTune({wetness: 1})`. The first try (track-level camera, `eyeAt`) showed no sun glint on any
backend: `day|rain` is overcast (sun colour 0.565, 0.475, 0.36; keyMul 0.85) and puddles are sparse (gutters and the
low side of camber). The scene that works is placed on purpose:

1. Start the race in rain and let it run about 20 s at render scale 0.25 before freezing. `frame.rain` eases per
   rendered frame; a freeze right after `weather("rain")` leaves it near 0 and the ripple branch never runs.
2. Find standing water with the shared reference: scan `Puddles.mask(x, z, {wetness: 1, lat})` over the lap at
   3.5 and 4.5 m off the centreline (best: lap fraction 0.048, 4.5 m left, mask 1.0).
3. Put the camera opposite the sun at the sun's own elevation (48 degrees here), 7 m from that point, so the puddle
   mirrors the sun into the lens (`freeCam({eye, target, fov: 40})`).
4. Pin the render clock (`renderClock(123.4, true)`) so the ripple phase is the same in every capture.

## Stills: GLX | TLX before | TLX after (glint box, 1280x720 frame)

The stills are NOT in the repo and not published. An image under `docs/` is refused by
`tests/unit/committed-images.test.mjs` (a first version of this note committed one and turned CI red), and
`tools/shot/publish-evidence.mjs --publish` was refused for this cloud session ("Creating, editing, or deleting
releases is not permitted for this session type"). They exist only in the session's container
(`artifacts/ripple-evidence/`: the GLX | TLX before | TLX after sheet, the x6 difference image, the scene). What they
show, in words: on all three the puddle carries a bright sun patch about a metre across, broken into ripple rings;
TLX before and TLX after cannot be told apart by eye at 1:1.

TLX before vs after inside the 400x330 px glint box: 4,879 pixels differ at all, 83 by more than 8 (of 765 summed
RGB), 5 by more than 30, max 41. Luma in the box: mean 83.7 and p99 144.6 in both. The x6 difference image is faint
concentric rings with one small bright spot: the lobe now follows the ripples, as designed.

WGX (stills through `gfx-probe`'s readback, `GLX.capturePixels()`; `backend-compare` captures WGX as a black frame
on this box): the same scene shows the same rippled sun patch before and after; both probes pass with `gpuErrors` 0.
The change is LARGER on WGX than on TLX, and above its noise floor. Inside the same 400x330 px glint box: two
captures of the fixed tree differ in 315 pixels by more than 8 and 0 by more than 30 (falling rain streaks); before
vs after differ in 3,124 by more than 8 and 614 by more than 30 (max 179). Why WGX moves about forty times more
pixels than TLX in the same scene is NOT explained: `D_GGX`, `V_SmithGGX` and the roughness-to-alpha step read the
same on both. One candidate is TLX's analytic road micro-normal (a different normal field under the same puddle).
Open question, recorded on #5777.

## Dry identity

Dry Monza, same camera, TLX: the deploy tip (9261395b), this branch, and this branch again produce the same PNG
(sha256 `d1fb0e33…`): 0 of 921,600 pixels differ in all three pairings. This is one scene on software pixels, not a
general bit-identity claim; the op-level argument is in the PR (with the ripple branch not taken the copies equal
`NoL/NoV/NoH` and the glint scale uses the operand order of the diffuse `litNoL`).

## Shimmer in motion (the aliasing risk)

A roughness-0.02 lobe on a tilting normal is what sparkles. Check agreed before running it: 959x414 buffer (the
phone's size at render scale 0.75), `apex26.forceMobileTier=1`, 18 consecutive frames with the render clock stepped
1/60 s and the camera gliding along the track at 60 m/s, rain particles at the knob minimum (20). Metric: per-pixel
frame-to-frame absolute luma difference inside a 160x130 px glint box, racing-line arrow pixels masked out (9,201 of
20,800 pixels kept, 156,417 pixel pairs).

| state | mean | p99 | pairs that flip by more than 30 |
|---|---|---|---|
| TLX before | 5.223 | 31.20 | 1,709 |
| TLX after | 5.513 | 32.80 | 1,924 |
| TLX after, repeated | 5.514 | 32.80 | 1,924 |
| GLX (has shipped with this lobe) | 4.716 | 31.28 | 1,705 |

The repeat shows the capture is deterministic (same-frame difference between the two runs: mean 0.002, no pixel
over 30), so the before/after gap is real: p99 x1.05, flips x1.13. The bound fixed beforehand was "within 1.25x of
BEFORE, or no worse than GLX"; the patch is inside it on the first clause, and a little worse than GLX on flips
(1,924 against 1,705). Inside the bound means "not harmful enough to block", not "worth shipping".

Cut for time: 18 frames rather than 60, and the 831x359 buffer (render scale 0.65) was not run; a phone-sized TLX
frame with a moved camera takes about 35 s here.

## Distance to the GLX reference (what decided it)

"Both backends now match GLX in source order" is a claim about text. The claim a player cares about is pixels, so:
pixels in the 400x330 px glint box (132,000 px) that differ from the GLX capture of the same scene, same camera
maths and clock. Caveats: GLX and TLX frames come from one harness (`backend-compare`-based), WGX from `gfx-probe`'s
readback; the rain ramp was 20 s against 8 s; falling rain streaks are random in every capture. Cross-backend
distance is dominated by how differently the backends look (next section), so only the before-to-after MOVEMENT
means anything.

| capture | differs from GLX by more than 8 | by more than 30 | mean abs diff (summed RGB) |
|---|---|---|---|
| TLX before | 75,332 | 28,729 | 21.51 |
| TLX after | 75,331 | 28,721 | 21.50 |
| WGX before | 65,081 | 16,707 | 15.30 |
| WGX after | 65,752 | 17,260 | 15.58 |
| WGX after, repeated | 65,915 | 17,261 | 15.61 |

TLX does not move. WGX moves AWAY from GLX: +671 and +553 pixels against a repeat-to-repeat noise of about 160
and 1.

Statistics that point the other way on WGX (a per-pixel distance punishes any added sparkle that does not land on
GLX's exact pixel). Luma in the glint box:

| capture | mean | p99 | pixels above 150 | above 170 | mean luma gradient |
|---|---|---|---|---|---|
| GLX | 81.91 | 140.9 | 730 | 291 | 2.650 |
| TLX before | 83.67 | 144.6 | 888 | 257 | 2.847 |
| TLX after | 83.67 | 144.6 | 886 | 258 | 2.847 |
| WGX before | 84.54 | 148.7 | 831 | 297 | 2.457 |
| WGX after | 84.54 | 148.7 | 899 | 297 | 2.561 |

WGX's texture energy moves toward GLX (2.457 to 2.561 against 2.650) while its count of bright pixels moves away
(831 to 899 against 730). On TLX nothing moves on any measure.

## Conclusion

Built, measured, withdrawn. On the default renderer the patch has no measurable benefit (one pixel in 75,332 closer
to the reference), a small measured cost (flicker flips x1.13), and an unmeasured risk (a roughness-0.02 lobe on a
tilting normal aliasing on a phone at render scale 0.65 to 0.75). On WGX it moves the backend further from the
reference per pixel. A default-pixel change in rain with no demonstrable gain is not worth shipping for source-order
tidiness, and a `?lab=` toggle would be a shader variant carried for no shown gain. The three backends therefore
still differ in this one ordering; `tests/unit/puddles.test.mjs` pins the GLX side only.

## The larger finding in these captures

In this rain + sun scene the DEFAULT renderer is far from the reference across the whole frame, and that dwarfs the
ripple ordering. Whole 1280x720 frame against the GLX capture (same caveats as above):

| backend | mean abs diff per channel (of 255) | summed RGB (of 765) | pixels with summed diff over 30 | mean luma |
|---|---|---|---|---|
| GLX | reference | reference | reference | 55.1 |
| TLX | 15.4 | 46.3 | 32.9% | 50.5 |
| WGX | 4.1 | 12.2 | 5.2% | 56.4 |

TLX's mean colour is (46.9, 51.3, 55.8) against GLX (47.7, 57.5, 62.5): red matches, green and blue are lower, and
the gap is on the wet road (luma -5.7 in the middle third of the frame, -7.6 in the bottom third, -0.6 in the top
third, which is verge and grass). Which terms account for it is NOT traced. Candidates: TLX opts out of the env probe
by default (analytic sky on the wet road), wet darkening, env reflection strength, exposure and grade, fog, the
analytic road micro-normal. Filed on #5777.

## The patch (withdrawn; applies to 9261395b)

```diff
diff --git a/js/render/three/tsl-lit.js b/js/render/three/tsl-lit.js
index 5ab3f125..c98f01cc 100644
--- a/js/render/three/tsl-lit.js
+++ b/js/render/three/tsl-lit.js
@@ -1643,6 +1643,9 @@
         const NoV = max(dot(N, V), 1e-4).toVar();
         const NoH = max(dot(N, H), 0.0).toVar();
         const VoH = max(dot(V, H), 0.0).toVar();
+        // Sun-specular copies: the rain-ripple branch re-dots them against the
+        // tilted N (GLX keySpecNoL/NoV/NoH); the diffuse keeps NoL.
+        const kNoL = NoL.toVar(), kNoV = NoV.toVar(), kNoH = NoH.toVar();
 
         const albedo = vec3(albedoIn).toVar();
 
@@ -1849,6 +1852,7 @@
             };
             const rg = ring(1.7, 0.0, 0.0, 0.8).add(ring(2.9, 7.3, 19.0, 1.3)).toVar();
             N.assign(normalize(N.add(vec3(rg.x, 0.0, rg.y).mul(U.rain.mul(puddle).mul(0.10)))));
+            kNoL.assign(max(dot(N, L), 0.0)); kNoV.assign(max(dot(N, V), 1e-4)); kNoH.assign(max(dot(N, H), 0.0));
           });
           // Porous as a FRACTION of the road result — mirrors js/render/glx/shaders/glsl-lit.js.
           // The two coefficients were transposed here as they were in GLX: mix(a,b,t)
@@ -1892,7 +1896,7 @@
         // thrown away on back-faces (litNoL *= NoL) except clearcoat, which
         // shades on Ngeo. Skip the taps when the result cannot contribute.
         const shadow = float(1.0).toVar();
-        If(NoL.greaterThan(0.0).or(clearcoat.greaterThan(0.001)), () => {
+        If(NoL.greaterThan(0.0).or(kNoL.greaterThan(0.0)).or(clearcoat.greaterThan(0.001)), () => {
           if (!sampleShadow) { shadow.assign(cloudShadow(wp).mul(U.cloudShadowDim).oneMinus()); return; }
           // S1 exact-zero gate: sunSh (>= 0) == 0 makes the product 0 whatever the cloud FBM returns.
           shadow.assign(sampleShadow(wp, Nvary));
@@ -2131,11 +2135,12 @@
         color.assign(max(color, vec3(0.0)));
 
         // sun Cook-Torrance specular, soft-clipped (js/render/glx/shaders/glsl-lit.js)
-        If(NoL.greaterThan(0.0), () => {
-          const D = D_GGX(NoH, a);
-          const Vis = V_SmithGGX(NoV, NoL, a, smithViewRoot(NoV, a));
+        // Reads the k* copies: the glint moves with the rain ripples (GLX).
+        If(kNoL.greaterThan(0.0), () => {
+          const D = D_GGX(kNoH, a);
+          const Vis = V_SmithGGX(kNoV, kNoL, a, smithViewRoot(kNoV, a));
           const F = F_Schlick(VoH, f0, clamp(rough.oneMinus(), 0.0, 1.0));
-          const specCol = F.mul(D.mul(Vis)).mul(vec3(U.sunColor)).mul(litNoL).toVar();
+          const specCol = F.mul(D.mul(Vis)).mul(vec3(U.sunColor)).mul(kNoL.mul(shadow).mul(U.keyMul)).toVar();
           // soft knee, asymptote U.specKnee (def 4): sun glints can reach bloom (GLX)
           specCol.assign(specCol.div(specCol.div(U.specKnee).add(1.0)));
           color.addAssign(specCol);
diff --git a/js/render/webgpu/wgsl-chunks.js b/js/render/webgpu/wgsl-chunks.js
index 95c067e8..4924c7b2 100644
--- a/js/render/webgpu/wgsl-chunks.js
+++ b/js/render/webgpu/wgsl-chunks.js
@@ -1278,6 +1278,9 @@ fn fs_main(in : VSOut, @builtin(front_facing) ff : bool) -> @location(0) vec4<f3
   let NoV = max(dot(N, V), 1e-4);
   let NoH = max(dot(N, H), 0.0);
   let VoH = max(dot(V, H), 0.0);
+  // Sun-specular copies: the rain-ripple branch re-dots them against the tilted
+  // N (GLX keySpecNoL/NoV/NoH); the diffuse keeps NoL.
+  var kNoL = NoL; var kNoV = NoV; var kNoH = NoH;
 
   var albedo    = in.col;
   var emissive  = D.mat0.x;
@@ -1520,6 +1523,7 @@ fn fs_main(in : VSOut, @builtin(front_facing) ff : bool) -> @location(0) vec4<f3
         rg += cos(ph) * (cf / r) * amp;
       }
       N = normalize(N + vec3<f32>(rg.x, 0.0, rg.y) * (0.10 * F.params4.z * puddle));
+      kNoL = max(dot(N, L), 0.0); kNoV = max(dot(N, V), 1e-4); kNoH = max(dot(N, H), 0.0);
     }
     // POROUS MUST BE DARKER THAN THE ROAD, not lighter. Two independently
     // clamped coefficients transpose the order: 0.42 fades SLOWER than 0.58, so
@@ -1580,7 +1584,7 @@ fn fs_main(in : VSOut, @builtin(front_facing) ff : bool) -> @location(0) vec4<f3
   //   * NoL / clearcoat gate — back-faces throw the result away (litNoL *= NoL)
   //     except clearcoat on Ngeo, so skip the taps when they cannot contribute.
   var shadow = 1.0;
-  if (NoL > 0.0 || clearcoat > 0.001) {
+  if (NoL > 0.0 || kNoL > 0.0 || clearcoat > 0.001) {
     if (F.params2.x > 0.5 && F.params2.y > 0.0) {
       let sc = F.lightVP * vec4<f32>(in.wpos, 1.0);
       let ndc = sc.xyz / sc.w;
@@ -1767,11 +1771,12 @@ fn fs_main(in : VSOut, @builtin(front_facing) ff : bool) -> @location(0) vec4<f3
 
   // Cook-Torrance sun specular, soft-clipped so highlights sheen not clip.
   // specCol is * litNoL; a backface paid two GGX evals for 0.
-  if (NoL > 0.0) {
-    let Dg = D_GGX(NoH, a);
-    let Vg = V_SmithGGX(NoV, NoL, a);
+  // Reads the k* copies: the glint moves with the rain ripples (GLX).
+  if (kNoL > 0.0) {
+    let Dg = D_GGX(kNoH, a);
+    let Vg = V_SmithGGX(kNoV, kNoL, a);
     let Fg = F_Schlick(VoH, f0, clamp(1.0 - rough, 0.0, 1.0));
-    var specCol = (Dg * Vg) * Fg * F.sunColor.xyz * litNoL;
+    var specCol = (Dg * Vg) * Fg * F.sunColor.xyz * (kNoL * keyMul * shadow);
     // soft knee, asymptote params4.w (SUN GLINT RANGE, def 4): sun glints can reach bloom (GLX uSpecKnee)
     specCol = specCol / (1.0 + specCol / max(F.params4.w, 0.5));
     color = color + specCol;
```

A test that pins the patched ordering, should it ever be re-applied, is in the history of #5781 (commit 5dcaeeea,
`tests/unit/puddles.test.mjs`: TLX and WGX twins of the GLX test that evaluate the shipped expressions).

## Not run

- Any real GPU or phone. The device check that matters: a wet race in rain with the sun out on the default
  renderer, pause menu RENDER SCALE at 0.75 and then 0.65, watching puddles in the gutters while moving.
- WGX in motion (opt-in backend; stills only).
- `gpu-census` on real Metal: one run was dispatched on the branch while the patch was still in; it says nothing
  about the final tree, which has no shader change.
- Stills not published: this session type may not create a release (`publish-evidence.mjs --publish` refused). The
  prepared bundle is `artifacts/evidence-uploads/ripple-glint-5781-*/` in the session container only.
