# Image and Colour Grading Controls

Date: 2026-07-17
Status: Approved design

## Goal

Expand the LIGHTING TUNER's `IMAGE & COLOUR` group into a professional tonal
grading tool while keeping the existing single-pass post-processing architecture.
The shipped baseline will be retuned toward a modern F1 broadcast look: clean
blacks, restrained highlights, natural vivid colour, and preserved track and car
detail across day, night, dawn, overcast, and wet conditions.

The feature must have matching WebGL2 and WebGPU output, remain safe at every
slider extreme, preserve existing saved preset compatibility, and add no render
passes or texture reads.

## Research basis

The design follows the common real-time grading sequence and safety practices
described by:

- John Hable, [Minimal Color Grading Tools](https://filmicworlds.com/blog/minimal-color-grading-tools/)
- Unity, [Color Grading](https://docs.unity3d.com/Packages/com.unity.postprocessing@2.3/manual/Color-Grading.html)
- Krzysztof Narkowicz, [ACES Filmic Tone Mapping Curve](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)
- [WebGPU Fundamentals: Memory Layout](https://webgpufundamentals.org/webgpu/lessons/webgpu-memory-layout.html)
- [WGSL specification](https://www.w3.org/TR/WGSL/)

Web research and Context7 references agree on the important implementation
constraints: grade in HDR before tone mapping, compose bloom before tone mapping,
use neutral identity defaults, clamp inputs before `pow` and other transcendental
operations, and respect 16-byte WGSL uniform alignment.

The game intentionally writes its existing tone-mapped values directly to its
RGBA8 canvas without adding a new display-gamma conversion. This feature does not
change that established output transfer because doing so would invalidate every
lighting preset and visual baseline.

## Rendering pipeline

The composite pass remains the only final-image pass. Its order becomes:

1. Read and combine the HDR scene, AO, reflections, shafts, and other existing
   scene effects.
2. Apply existing exposure and bloom composition.
3. Apply the new HDR grade:
   - RGB Lift/Gamma/Gain
   - five overlapping tonal-zone adjustments
   - Toe and Shoulder shaping
4. Apply the existing ACES approximation.
5. Apply the existing display-domain colour grade: Contrast, Vibrance,
   Saturation, Warm/Cool, and split toning.
6. Apply existing flare, vignette, grain, sharpening, chromatic aberration,
   speed blur, and dithering.

ACES and bloom extraction/composition are not replaced. The new controls add
arithmetic only; they do not add render targets, passes, or samples.

### RGB Lift/Gamma/Gain

Lift, Gamma, and Gain each expose red, green, and blue sliders. The transform is
defined so that neutral values are an exact identity, input black maps to Lift,
input white maps to Gain, and Gamma controls the midpoint:

```text
graded = lift + (gain - lift) * pow(max(colour, 0), inverseGamma)
```

The implementation must clamp divisors and `pow` inputs to finite safe values.
It must not clamp HDR output to 0–1 before ACES.

### Tonal zones

Blacks, Shadows, Midtones, Highlights, and Whites are signed luminance controls.
They use smooth, overlapping masks calculated from log luminance relative to
middle grey. Each control adjusts exposure in its zone, so RGB ratios are
preserved:

```text
luminance = max(dot(colour, Rec709Luma), epsilon)
zoneStops = weighted sum of the five signed controls
colour *= exp2(zoneStops)
```

Masks must be continuous, have no hard boundaries, cover the complete tonal
range, and remain finite for black and negative intermediate values. Overlap is
intentional so adjacent controls produce smooth transitions.

### Toe and Shoulder

Toe and Shoulder are signed, luminance-preserving, monotonic curve adjustments
applied after the five tonal zones and before ACES:

- positive Toe compresses/deepens the lowest tones; negative Toe lifts them
- positive Shoulder compresses and protects highlights; negative Shoulder
  expands them
- zero is an exact identity

The curve operates on luminance and rescales RGB by the luminance ratio to avoid
colour shifts. It must be continuous at its pivots and safe at zero.

## Tuner controls

All controls remain in the existing `IMAGE & COLOUR` top-level tab. A new
optional `section` field on `TUNE_DEFS` inserts compact subheadings within that
tab. It does not change profile keys, group tabs, or the generic slider API.

### Tonal Range

- `exposureMul` — existing Exposure
- `blacks` — signed, -1 to +1, neutral 0
- `shadows` — signed, -1 to +1, neutral 0
- `midtones` — signed, -1 to +1, neutral 0
- `highlights` — signed, -1 to +1, neutral 0
- `whites` — signed, -1 to +1, neutral 0
- `toe` — signed, -1 to +1, neutral 0
- `shoulder` — signed, -1 to +1, neutral 0
- `contrast` — existing control
- `blackLift` — existing ID, relabelled `BLACK FLOOR`
- `whitePoint` — existing ID, relabelled `ACES WHITE SCALE`

### RGB Lift/Gamma/Gain

- `liftR`, `liftG`, `liftB` — -0.15 to +0.15, neutral 0
- `gammaR`, `gammaG`, `gammaB` — 0.5 to 2.0, neutral 1
- `gainR`, `gainG`, `gainB` — 0.5 to 1.5, neutral 1

### Colour

The existing Saturation, Vibrance, Warm/Cool, Grade Strength, Shadow Tint Hue,
and Highlight Tint Hue controls move under this internal heading without
changing IDs or behavior.

### Lens and Finish

The existing Vignette, Vignette Reach, Chromatic Aberration, Film Grain, Lens
Dirt, Lens Flare, Sharpen, and Speed Blur controls move under this internal
heading without changing IDs or behavior.

Every new `TUNE_DEFS` default is neutral. The revised shipped look is stored in
the global `"*"` entry in `js/light-presets.js`, allowing track/time/weather
profiles to continue layering above it.

## WebGL2 and WebGPU integration

WebGL2 adds packed uniforms to the existing composite program.

WebGPU expands `CompositeU` from 144 bytes to 224 bytes with five aligned
`vec4<f32>` records:

1. `tone0`: Blacks, Shadows, Midtones, Highlights
2. `tone1`: Whites, Toe, Shoulder, padding
3. `lift`: Lift R/G/B, padding
4. `gamma`: Gamma R/G/B, padding
5. `gain`: Gain R/G/B, padding

Both backends use equivalent helper functions, operation order, constants,
clamps, and neutral fallbacks. JavaScript upload defaults match `TUNE_DEFS`
exactly.

## Persistence and compatibility

The existing generic profile resolution, localStorage persistence, Reset, Copy
Values export, and `__apex.lightTune()` API automatically include the new IDs.
No storage migration is required.

Existing IDs keep their meaning. In particular, `exposureMul`, `contrast`,
`blackLift`, and `whitePoint` are not reinterpreted. Existing file and user
profiles therefore remain valid. Only labels and internal panel organization
change for `blackLift` and `whitePoint`.

## Broadcast baseline

After the neutral implementation is verified, tune the global shipped profile
against fixed captures representing:

- clear daytime
- dawn or dusk
- overcast daytime
- floodlit night
- wet or rainy conditions

The baseline should:

- retain detail in dark tyre, asphalt, cockpit, and barrier regions
- avoid broad areas of clipped white in clouds, sun glare, floodlights, and
  reflective bodywork
- keep neutral surfaces neutral unless an intentional time-of-day grade applies
- preserve recognisable team-livery hues
- provide stronger separation than the current image without an arcade-style
  black crush or oversaturation

Exact global values are selected from visual A/B captures and histogram
measurements rather than fixed in this design.

## Verification

Automated coverage must verify:

- neutral settings are identity transforms
- all new IDs resolve, clamp, persist, reset, export, and update live
- tuner section headings appear in the correct order
- every value is uploaded to WebGL2 and packed into the expected WebGPU offsets
- `CompositeU` is 224 bytes and WGSL alignment remains valid
- GLSL and WGSL contain equivalent grading operations
- minimum and maximum settings cannot produce NaN or infinity
- directional behavior is correct: Blacks affect dark regions more than Whites,
  Highlights affect bright regions more than Shadows, and each RGB LGG channel
  primarily affects its matching output channel

Visual validation uses fixed camera captures and image histograms across the
representative condition matrix. Relevant smoke, lighting, tuner UI, WebGPU
lifecycle, and visual-regression tests run before completion. The asset cache and
`version.json` build are bumped together only after the final baseline is chosen.

## Out of scope

- replacing ACES
- adding LUT textures or a LUT authoring workflow
- adding colour wheels, curve editors, or eyedroppers
- changing the canvas display transfer or introducing explicit sRGB encoding
- adding render passes, render targets, or post-processing texture samples
