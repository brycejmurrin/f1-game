Fixed: Failed synchronous texture-layer uploads and readbacks no longer suppress the existing pixel fallback.
Fixed: Failed chunked GLX mesh builds delete unpublished GPU buffers and vertex arrays before preserving the original error.
Fixed: Mirrors refresh their instance pack on the first full pass after an interruption.
Improved: Material PNG inflation fills a bounded scanline buffer as chunks arrive, reducing simultaneous application-buffer retention without changing decoded pixels.
