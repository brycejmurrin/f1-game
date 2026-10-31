# Helmet visor rain impacts

User request: rain should hit the visor so it reads as a physical screen. Source base:
`b8b04c2d7116f72da06d3aad9cda6f109bfcdb99`, fetched from the deploy branch into
`cursor/visor-rain-b8b04c2`; the shared checkout is unchanged.

The existing overlay rendered only a fast fade into an immediately moving bead.
Helmet water now arrives visibly, spreads to 1.65 times its radius at 90 ms,
settles at 180 ms and releases through a 140 ms adhesion delay followed by a
280 ms velocity ramp. Three short-lived, asymmetric satellite beads mark the
contact. A separate physical contact clock keeps impact timing independent of
runoff preference and speed-dependent lifetime burn. Larger helmet beads help
the near surface read against distant rain; transparent interiors preserve the
road. This is illustrative Canvas 2D water, not scene-sampled refraction.

The original cached atlas, pool limits, resolution limits, graphics LOW gate,
nonhelmet movement, reduced-motion fade-only path, runoff settings and renderer
heartbeat remain. The HUD bezel occludes water outside the helmet opening.
No camera pose, simulation, renderer backend, shared CSS or settings default
changes are needed. Open-PR filename checks found visor-optics owned by #4316;
this change uses only droplets.js and its existing unit-test owner.

Current API references consulted for atlas destination sizing and screenshot
capture: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
and https://playwright.dev/docs/screenshots . Browser evidence records direct
controlled overlay ticks separately from renderer-driven frame traces.

Tests cover same-frame visibility, satellite size, physical impact clock,
pinning and release, spreading and settling, pause, exit/clear, reduced motion
and nonhelmet paths. Native software captures cannot verify a real iPhone's
GPU, Safari composition or touch interruptions. Measured validation and current
CI status belong to the PR's living Plan and Hand-off block.
