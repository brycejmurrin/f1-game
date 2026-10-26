# TLX-WebGPU `device.lost` under `apex26.forceMobileTier=1` is not phone evidence

2026-10-20, B·W10 (incident reported by B·H7). `forceMobileTier=1` on the macOS
gpu-census runner or on lavapipe lost the WebGPU device ~35-170 s into a race
("A valid external Instance reference no longer exists"), after `[Invalid
Texture] ... CreateView` errors, and three losses pinned the tab to three-WebGL2.

## What it was

Both machines are software-class adapters (lavapipe; the runner's Apple
Paravirtual device). TLX flags such an adapter `_softAdapter` and presents through
the 2D soft-blit overlay, because a software adapter cannot composite a native
WebGPU swapchain. The flag was `!isMobile && ...`, and `forceMobileTier=1` sets
`GLX.isMobile` on any machine, so the forced run skipped the verdict, configured
the native canvas once (922x518 bgra8unorm) and drew into an invalid swapchain
texture.

| arm (gpu-census, macos-latest, deploy tip 6a7318d8) | canvas `configure` calls | GPU errors | device |
|---|---|---|---|
| no flags (control) | 0 (soft blit) | 0 | up 90-107 s |
| `forceMobileTier=1` (+/- `gfxHigh=1`) | 1 | 3 | lost, reload |
| `forceMobileTier=1` with the software verdict forced | 0 | 0 | up 70 s |

Runs 39477339291, 39481775556, 39485625051, 39488541983. Not the cause: powerPreference
low-power, the 8-bit canvas, the mobile shadow set, post chain isMobile, per-pass instancing
(all four off together still lost), governor hold, render-rate off.

## Rule

`forceMobileTier` on the macOS or lavapipe census exercises the paravirtual
swapchain, not a phone: a `device.lost` there is **not** phone evidence. A real
handset still never gets the software verdict (WebKit trims `adapter.info`, so the
empty-info tie-break would misclassify it); `_phoneHw` in `js/render/three/tlx.js`
keys on a handset UA, so forced-mobile on a desktop now takes the soft-blit path.
Phone evidence needs a real handset.
