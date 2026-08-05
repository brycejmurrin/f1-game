# Shared track foundation characterization baseline

Captured from remote default commit `d9587d3` before foundation changes.

- `node tools/verify-track.cjs --all`: 24/24 tracks built successfully.
- `npm run test:smoke`: 9/9 tests passed.
- Existing terrain audit: Hungaroring targeted basin check passed; the all-circuit audit was retained as the authoritative face-level overlap gate.
- Existing props audit: footprint suppression was primitive-by-primitive; intentional spans used raw emitters and had no required-model diagnostics.
- Existing wall behavior: boundaries were finite, but `recordBarrier(0, 1, ...)` reduced to one node because both modulo endpoints were zero.
- Existing mesh validation: `verify-track` counted vertices but did not reject non-finite positions/normals or invalid indices.

These observations are characterization data, not acceptance exceptions. The completed foundation must pass the strengthened gates.
