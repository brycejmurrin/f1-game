# Recent performance regressions — repair design

## Scope

Repair the confirmed regressions introduced during the preceding 24 hours
without removing explicit renderer, quality, capture, or upscaling controls.

## Design

1. Restore the no-preference touch-device renderer to WebGL2 and the mobile
   graphics preset to MEDIUM. Existing stored THREE, WEBGPU, HIGH, and ULTRA
   choices remain authoritative.
2. Give field and silhouette helmets a simple paint mode. They retain the
   traced shell and smooth normals but avoid evaluating detailed helmet artwork
   for every triangle. Player, cockpit, and garage helmets keep detailed paint.
3. Coalesce livery colour-input preview rebuilds behind one short trailing
   timer. DOM colour previews remain immediate; closing or saving flushes the
   latest draft so the rendered and saved liveries cannot diverge.
4. Preserve GLX's headless overlay, but update it only for an
   `awaitSoftPresent()` request. Capture tools already use that synchronization
   point; ordinary WebDriver frames stop paying readback and CPU-copy costs.
5. Build SGSR shaders, pipelines, buffers, and bind groups only when spatial
   upscaling is requested. Runtime enablement initializes the resources before
   resizing; failure continues to fall back to legacy presentation.
6. Make each soft-present benchmark leg configure storage before application
   scripts and navigate once. Three measured legs therefore perform three
   application boots.
7. Pin each behavior with focused Node unit tests, including a relative
   field-helmet build-cost contract rather than a machine-specific duration.

## Verification

Use test-driven development for each behavior. Run the affected unit tests,
`npm run test:guards`, the change-aware fast verifier, and the repository's
selected browser specification if test selection identifies one. Renderer
validation remains software-only here; no claim will be made about real-GPU
frame rate.
