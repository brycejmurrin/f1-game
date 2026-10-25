# Helmet visor: the sun-behind dusk wash (A·W46, 2026-10-24)

Bryce's report: on an iPhone, using the HELMET camera at COTA at dusk on lap 1, "sometimes depending on if the sun is behind me
it lights up [the] screen". The whole helmet aperture read as flat amber fog, the mirror was clear, and the dash showed
through a veil.

## Measured

Setup: COTA, dry, helmet camera, 844×390 touch, WebGL2 capture (`tools/shot/ab-gallery.mjs --capture`, visor off vs
CLEAR). The spots are `park()` fracs chosen by heading against the sun: 0.02 is the start straight with the sun behind
(cos −0.99), 0.78 has the sun beside (cos 0.1), and 0.82 has the sun ahead (cos 0.99). For each scene, `visorScene()`
(with the lamp list) was dumped, then the visor layer was repainted per term on a real 2D canvas. That layer was
composited over the visor-off frame both ways: `source-over` is the WebGL2 path's `mix-blend-mode: normal` (#3657), and
`lighter` is plus-lighter, the WebGPU path. The table gives the luma change in the centre 40 % box (scripts:
`scratch/w46/{dump,paint}.mjs`, output in `artifacts/w46/`).

| scene | REFLECTIONS STRONG, add | lamp glints removed | rim only |
|---|---|---|---|
| dusk, sun behind | +28.4 (sat .386→.382) | +1.7 | 0 |
| dusk, sun beside | +64.1 (sat .634→.401) | +1.7 | 0 |
| day, sun behind | +2.4 | +2.4 | 0 |

- **The wash is the lamp glints, not the sun.** At dusk the pit-lane and start-straight lamps are on (40 in the frame
  list), and each one got its NIGHT glint strength, `1.5·√(energy/d²)`. The result was eight core ellipses
  140–280 px wide, plus bloom halos and smears, all amber. The core makes up most of it: removing the halo leaves
  +44 of +64, and removing smear or beams barely changes it. Against a dusk sky those discs flatten contrast just as
  in the screenshot. With the sun behind you on COTA's start straight, the lamps line both sides, which is why it
  looked tied to the sun.
- **The rim sheen did peak with the sun behind.** `rake = 0.35 + 0.65·clamp(−z) + 0.3·side` was written to be
  "brightest when the sun is beside or behind the eye", and its k reached 1.0 at STRONG with the sun dead behind.
  That is physically backwards: the helmet shell shades the shield from behind. It lights the aperture edge rather
  than the centre.
- The renderer's own sun terms are direction-gated correctly. The TLX god-ray HG phase, fog in-scatter and flare all
  use `max(dot(rd, sunDir), 0)` or `sunScreen()`'s `cw > 0`.

## Fix (`js/fx/visor-optics.js`)

- `lampAdapt(daylight)`: each lamp glint scales by `1/(1 + 3·max(0, key·sunUp + sky − 0.2))`. Night (≈ 0.14) is unchanged;
  dusk (≈ 0.95) keeps ≈ 0.3, and the glints under the existing 0.15 floor drop out.
- `sunFacing(z)`: the rim sheen is `sunFacing(z)·(0.35 + 0.3·side)`. That is full for a sun ahead or level with the eye
  and fades to 0 once the sun is ~120° behind. The sun-ahead value is identical to before.

After the fix, dusk behind measures +1.7 and dusk beside +3.3 (saturation back to the visor-off value). The day frames
are byte-identical in the centre, and the sun-ahead glint and rays are unchanged.
