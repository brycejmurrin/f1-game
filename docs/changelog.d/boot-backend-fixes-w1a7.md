Fixed: the "Graphics reset" notice now explains an automatic graphics-loss reload on the default three.js renderer and on WebGPU, not only on WebGL2 (#3513).
Fixed: one crash each on two different renderers no longer permanently switches a hand-picked renderer to WebGL2 — the boot canary counts crashes per renderer (#3514).
Fixed: when the first boot can only guess the renderer, it fetches that guess's scripts at low priority, so a wrong guess no longer competes with the renderer that actually loads (#3515).
