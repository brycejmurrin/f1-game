# R2 Opus hunt: js/render, js/lighting, js/fx
F1 low js/render/shared/compatibility-recovery.js:52-60 — opening the card's own DETAILS re-raises the popover twice (flicker, scroll/focus lost). Skip targets inside the card. CODE-TRACED
F2 low dead js/render/shared/puddles.js:34 (+ manifest.cjs:156) — loaded every boot, no js caller (test-only). Move to fixture. CODE-TRACED
F3 low js/render/three/tlx.js:4475/:5819 — leftover _sizeOwned swallows the first resize after begin() on screens with no world frames (rotation on results). PLAUSIBLE
F4 low tlx.js:1070-1075 + wgx.js:845-850 — hidden-loss visibilitychange reload listener never undone on dispose → reload after backend switch. PLAUSIBLE
Not covered: glx/, shaders, most of tlx.js/wgx.js, lighting.
