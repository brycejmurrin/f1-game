---
name: bryce-iphone-tlx-webgpu
description: "Bryce plays on iPhone with THREE.JS + THREE PATH WEBGPU (tlxForceGL=0) and says it works, unlike the AUTO WebKit→WebGL2 default"
metadata:
  node_type: memory
  type: user
  originSessionId: a4f50709-efa3-51c5-9919-ee260fa44283
  modified: 2026-10-22T04:53:29.084Z
---

Bryce (2026-10-22): "On my iPhone I use three js with web gpu and it works." His real play setup is TLX on
three's WebGPU backend (SETTINGS › RENDERER THREE.JS, THREE PATH: WEBGPU → `apex26.tlxForceGL="0"`), not the
AUTO path, which pins WebKit to three's WebGL2 ("WebKit WebGPU drew nothing on a phone", js/render/three/tlx.js).

**Why:** iPhone perf/visual work measured on AUTO measures a path Bryce does not play on.
**How to apply:** for iPhone perf or render checks, measure THREE PATH WEBGPU first (WebGL2 as the comparison);
a change to the AUTO WebKit gate is Bryce's call, backed by device evidence. Related: [[user-plays-on-phone]].
