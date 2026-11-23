# Bloat audit: js/camera and js/fx (2026-10-16, #1665)

Two read-only `bloat-auditor` passes at deploy tip `2452c1bc`. No code changed: no carve lowers a ratchet
(neither directory has a ratchet row), and AGENTS.md says an extract that raises or leaves no ceiling lower is wrong
to pay for.

## js/camera (27 files, ~9.6k lines)

| Rank | Block | Cost | Verdict |
|---|---|---|---|
| 1 | `flyby-seq.js` easing + `lerpPose` + `trackAnchored` (~856-903) | 48 lines, 6 free names (`_smp`×6) | Safest carve; give `lerpPose` its own scratch, register before `flyby-seq.js` in `tools/manifest.cjs`, add to the tests' `CAM_FILES` lists. Do first. |
| 2 | `flyby-seq.js` circuit read (~238-497) | 260 lines, `_smp`×9, `Tracks`×4 | New scan module; confirm where `roleCorner`/`extremeCorner`/`loreCorner` live first. |
| 3 | `flyby-seq.js` corners + grid (~498-708) | 210 lines, 22 free names | Move with #2 or skip; constants must move, not be copied. |
| 4 | `flyby-seq.js` tree/canopy plan (~1196-1380) | 185 lines | After #1 so `lerpPose` crossings drop. |
| - | Merge `drive-broadcast/chase/onboard` into one table | saves ~15, not the ~60 hunt-2 estimated | REJECT: 81 lines over 3 files, but the merge edits `manifest.cjs`, `frozen-globals.json`, ARCHITECTURE.md, 5 test lists and 2 shot tools. At most dedupe the `n()`/`abs()` helpers (~6). |

`flyby-seq.js` (1971 lines, 87 functions) is the only large single file and is not in `ratchets.json`; add a row
before extracting so a carve is measurable. Not audited: `vantage.js` (967), `flyby-editor.js` (659),
`flyby-sight.js` (596), `replay-buf.js` (549) and the other small files.

## js/fx (4 files, ~1.1k lines)

Nothing worth carving. `particles.js` (638): the rain field (407-632, 215 lines) shares `_dirty`/`_vertA` with the
pool and has 13 free names, so the coupling only moves. Local dedupes only (`LT.x != null ? LT.x : d` ×~14,
`count * Math.min(m,2) / shedDiv()` ×5, 6-vertex quad loop ×2 in a hot path): ~13 lines total. `droplets.js`,
`car-fx.js`, `skidmarks.js` were only skimmed.

## Follow-ups to file (GitHub writes were rate-limited when this was written)

1. Add `js/camera/flyby-seq.js` to `tests/data/ratchets.json`, then carve the easing block (rank 1).
2. Carve the flyby circuit-read block (ranks 2-3) into a new scan module.
3. Audit `vantage.js`, `flyby-editor.js`, `flyby-sight.js`, `replay-buf.js`.
