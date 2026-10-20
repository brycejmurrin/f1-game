# Concept bodies (B·D1d, PR #3162) — measurement kit

Rift / Keel / Delta / Serpent BODY_STYLES rows. Gallery: https://claude.ai/artifact/UkMYBoXeRp59rtT2pTTk38

- `node design-preview/concept-bodies/envelope.mjs` — size table; each new body must stay ≤ p75 of the
  shipped styles (also ≤ `p75-3160.json`, the same envelope measured on #3160's resized tree).
- `SKIP=rift,keel,delta,serpent node design-preview/concept-bodies/identical.mjs` — hash of every factory
  car and shipped body (square + rounded); must equal the base (`a333ba0d…` on #3145 @42dbbf57).
- Fit: `node tools/car/car-fit-audit.mjs --base <base>` (factory, 0 NEW/WORSE) and, for the bodies,
  `car-fit-audit --bodies=rift,keel,delta,serpent --json > a.json` vs a zero-offset `probe0` body row
  (all style fields 0, `fitSeat: 1`, added temporarily) audited the same way into `probe.json`:
  `BASE=body:probe0 BASE_JSON=probe.json node design-preview/concept-bodies/fit-diff.mjs a.json`.
- Garage frames: `apex_garage` (team mercedes, backend three), az 0.75 / 2.45 / 1.5708, el 0.24 / 0.26 / 0.06,
  dist 7 / 7 / 7.5; crops + `build-gallery.mjs` republish the gallery.
