# Opus hunt: js/render, js/lighting, js/fx (2026-10-27)
F1 low bug js/render/glx/glx.js:740-745 — webglcontextrestored reloads immediately even when document.hidden (loss handler defers to visibility; WGX/TLX do too). Fix: defer on hidden. PLAUSIBLE
F2 low perf js/fx/visor-optics.js:247,255 — lightMap allocates objects+arrays per light per paint (15 Hz, up to 48 lights). Pool like frame-lights _tlPool. CODE-TRACED
No high/med. Covered only part of wgx.js/tlx.js (very large); suggested next slices: wgx.js 2320-6100, tlx.js create/teardown.
