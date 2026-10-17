# track-switch-memory on Metal (2026-10-17)

Red: `renderer-macos` job, `track-switch-memory.spec.js` fails attempt 1 and passes on retry
(`monza: heap 133 → 150.4 → 164.8 MB`, bound 10 MB; #2604 run 39012574309, #2634 run 39014200140).
The 10 MB bound was calibrated on SwiftShader (0.4–1.0 MB a round).

Diagnosis: pending a Metal run of the instrumented spec (heap re-reads after repeated GC, backend path,
`renderer.info` counts per reading). Numbers go here.
