# Image and Colour Grading Controls

Date: 2026-07-17
Status: Implemented

## Goal

Expand the LIGHTING TUNER's `IMAGE & COLOUR` group into a professional tonal
grading tool and retune the shipped image toward a modern F1 broadcast look:
clean blacks, restrained highlights, natural vivid colour, and preserved detail
across day, night, dawn, overcast, and wet conditions.

## Pipeline

The existing composite pass remains the only final-image pass:

1. combine the HDR scene, AO, shafts, exposure, and bloom
2. apply RGB Lift/Gamma/Gain
3. apply smooth log-luminance Blacks, Shadows, Midtones, Highlights, and Whites
4. apply luminance-preserving Toe and Shoulder shaping
5. apply the existing ACES approximation
6. apply existing contrast, vibrance, saturation, tint, split tone, and lens FX

The implementation adds arithmetic only—no render pass, target, texture read,
LUT, replacement tone mapper, or display-gamma conversion.

## Controls

The existing `IMAGE & COLOUR` tab gains internal sections without changing
profile keys or top-level tabs:

- `TONAL RANGE`: Blacks, Shadows, Midtones, Highlights, Whites, Toe, Shoulder
- `RGB LIFT / GAMMA / GAIN`: independent red, green, and blue controls
- `COLOUR`: existing saturation, vibrance, white balance, and split-tone controls
- `LENS & FINISH`: existing vignette, grain, flare, sharpening, and motion FX

Tonal controls range from −1 to 1 with neutral 0. Lift ranges from −0.15 to
0.15 with neutral 0; Gamma ranges from 0.5 to 2 with neutral 1; Gain ranges from
0.5 to 1.5 with neutral 1.

Existing IDs retain their meaning. `blackLift` and `whitePoint` are relabelled
**BLACK FLOOR** and **ACES WHITE SCALE** to distinguish them from Blacks and
Whites. Generic localStorage resolution, Reset, COPY VALUES, and
`__apex.lightTune()` automatically include the new IDs.

## Backend parity

WebGL exposes five packed records as `uTone0`, `uTone1`, `uLift`, `uGamma`, and
`uGain`. WebGPU appends the equivalent records to `CompositeU`, expanding it
from 144 to 224 bytes:

- bytes 144–159: Blacks, Shadows, Midtones, Highlights
- bytes 160–175: Whites, Toe, Shoulder, padding
- bytes 176–191: Lift RGB, padding
- bytes 192–207: Gamma RGB, padding
- bytes 208–223: Gain RGB, padding

Both shaders share operation order, Rec.709 luminance coefficients, mask
boundaries, neutral fallbacks, and finite-value guards.

## Shipped baseline and verification

All new registry defaults are neutral. The broadcast baseline lives in
`LightPresets["*"]`, preserving existing track/time/weather and local override
precedence.

Verification covers registry clamping/persistence/reset/export, GLSL/WGSL
contracts, WebGPU offsets and uploads, neutral/extreme math, rendered tonal and
RGB directionality, and clipping/dynamic-range guards across Bahrain day,
Monaco dawn, Silverstone overcast, Singapore night, and Spa rain.

Research references:

- [Minimal Color Grading Tools](https://filmicworlds.com/blog/minimal-color-grading-tools/)
- [Unity Color Grading](https://docs.unity3d.com/Packages/com.unity.postprocessing@2.3/manual/Color-Grading.html)
- [ACES Filmic Tone Mapping Curve](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)
- [WebGPU Memory Layout](https://webgpufundamentals.org/webgpu/lessons/webgpu-memory-layout.html)
