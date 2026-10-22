# Omit unused SSR construction on the WebGPU phone tier

Three.js remains the primary renderer. This change concerns the optional custom
WGX backend, whose phone/WebKit (`WGX_LITE`) policy already excludes SSR targets,
bind groups and the reflection pass. Its post initializer nevertheless created
the SSR shader, pipeline layout, render pipeline and uniform buffer at boot.

The post core now receives the existing boot-constant `WGX_LITE` flag and skips
those constructions on that tier. Desktop SSR is unchanged. The placeholder
texture remains available for composite bindings; the existing target/readiness
guards prevent access to absent SSR resources. This does not change effect
quality, renderer selection or the phone SSR policy.

## Resource-request evidence

The production WGX module was executed against the existing lifecycle mock,
using phone policy and both packed-HDR feature states. Counts were:

| Boot resource | Before | After |
| --- | ---: | ---: |
| Shader modules | 22 | 21 |
| Render pipelines | 24 | 23 |
| Exact SSR shader modules | 1 | 0 |

The focused post-core test also verifies the SSR uniform buffer is absent only
on lite policy, while other post buffers remain present. The same all-effects-off
mock frame still issues two post passes. This is resource-request evidence,
not shader compilation timing, physical memory residency or iPhone FPS.

## Validation

Static WGX validation and 162 WebGPU/soft-renderer lifecycle tests passed.
Integrated tests cover desktop, iPhone, Mac Safari, forced-lite and minimal
policies, including a projected frame that selects SSR on desktop only.
Parent-owned Chromium/Dawn validation on Montreal passed with both lite and
desktop policy: actual `webgpu` backend, zero WGSL parse errors, zero GPU errors,
and no device-loss hint. The software adapter uses MSAA 1; physical-device,
hardware-MSAA and thermal performance are not established by these checks.

The live `gfx-probe --backend webgpu --iphone --retries 1 montreal` check also
passed on its first attempt: visible canvas, fresh frame after a camera move,
GPU readback and page capture, with zero GPU errors. This uses an emulated
phone viewport/user agent in Chromium, not physical Safari. An earlier
desktop-sized forced-lite probe passed rendering and the fresh-frame check but
exceeded its 60-second deadline during capture; that run is not counted as a
pass. No deadlines or rendering assertions were relaxed.

Ignored resource evidence: `artifacts/performance-audit/wgpu-resource-{baseline,candidate}.json`.
Validation logs: `artifacts/logs/wgpu-phone-ssr-{unit,dawn-lite,dawn-desktop}.log`.
Live phone evidence: `artifacts/performance-hunt/wgpu-ssr-phone-live/` and
`artifacts/logs/wgpu-phone-ssr-phone-live.log`. These local measurements do not establish physical-GPU or Safari performance.
