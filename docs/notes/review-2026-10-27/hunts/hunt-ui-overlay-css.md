# Opus hunt: js/ui, js/overlay, css, index.html (2026-10-27)
F1 MED perf js/ui/title-layout.js:505 — title-edit drag: each pointermove does localStorage write + remove/re-set all CSS vars on <html> + forced layout → judder on iPhone. Batch per rAF, persist on up (like hud-arrange.js:533-556). CODE-TRACED
F2 low css/responsive.css:315 — #tl-handle 22 px hit area < --tap-min; hard to drag on phone. Expand hit box. CODE-TRACED
F3 low js/ui/hud.js:1029 — aero nudge cleared each stamp → up to 8 fit passes per cycle on clash. PLAUSIBLE
F4 low js/ui/photo-studio.js:723 — createImageBitmap resizeWidth:1024 upscales small photos; resizeQuality support. PLAUSIBLE
F5 low css/carsetup.css:1894 — #cs-arrival raw env(safe-area-inset-bottom), no side insets → under notch in landscape. PLAUSIBLE
Not covered: most of hud.js, menu-nav, select-screen, most CSS, index.html, dead-CSS sweep.
