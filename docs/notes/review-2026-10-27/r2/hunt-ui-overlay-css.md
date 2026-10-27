# R2 Opus hunt: js/ui, js/overlay, css, index.html
F1 low perf js/ui/sheet-shape.js:650 (+ scroll-fade.js:283-284) — one rotation runs ~4-5 reclassify/paintAll passes plus ~9 timer passes over ~76 sheets. Coalesce behind one rAF / skip unchanged viewport; drop ScrollFade's own listeners. PLAUSIBLE
F2 low dead index.html:3855 — js/overlay/render.js loaded in the game shell, inert (needs main#overlay[role=region], only overlay.html). Remove from tools/manifest.cjs shell list, regen. CODE-TRACED
F3 low css/responsive.css:316 — #tl-handle 22x22 px (half --tap-min), only drag-resize path; thumb starts a move at 844x390. Enlarge hit area or add pinch. CODE-TRACED (also in R1)
Clean: modal/layers Escape+focus, loading-screen stop(), hud-arrange pinch/cancel, title-layout drag, watch-transport scrub, no dead #id CSS.
Not covered: menu-nav, select-screen, settings-export, results-sheet, photo-studio, hud-* submodules, class-selector dead CSS.
