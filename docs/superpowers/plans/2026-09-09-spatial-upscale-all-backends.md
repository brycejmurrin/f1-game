# Plan: spatial upscale settings + WGX/TLX

1. Shell + `js/ui/scale.js`: `#pm-upscale` SettingRow; wire to gfx.setSpatialUpscale / localStorage key.
2. WGX: present/render size split in `resize`; FXAA→intermediate; SGSR WGSL→present; soft blit at present size when active.
3. TLX: same split in `tlx.js`/`tlx-post.js`; TSL SGSR after FXAA; fix soft blit to final present tex when upscaling.
4. Canaries: shell id, SettingRow wiring, no raw textureGather in GLX, WGX/TLX expose API + SGSR markers.
5. `test:tooling-fast`; smoke GLX (existing); note WGX/TLX visual unverified on SwiftShader.
