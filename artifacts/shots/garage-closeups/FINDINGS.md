# Garage close-ups — live pack (build 14034)

**Cmd (final, unique frames):**
```sh
node tools/shot/garage-angles.mjs --site --preset=closeup \
  --team=redbull,ferrari,mercedes,mclaren --full-views --sheet=1 \
  --view-settle=6 --out=artifacts/shots/garage-closeups --budget=45m
```

**Result:** 56/56 PNGs, **14/14 unique per team**, + 4 team sheets + matrix + sheet in 3608.4s (≈59.8s/shot). Soft `#game-soft`. Store path; no TEAM tab. Stale-hash retry fired once (ferrari/cover ×2) then succeeded.

## Stations (unique az each)
fwLow, fwSide, noseTip, endplate, rwRear, rwSide, rwTop, podInlet, podFloor, wheelF, wheelR, haloBehind, mirror, cover

## Findings (≤5)
1. Part-fill framing works — dist 1.7–2.6 m, `clamp:false`; each station owns its az.
2. First `--fast` pass was **stale soft blit** (27 unique of 56); fix = await soft present + MD5 retry vs previous shot.
3. Wings / wheels / halo / cover readable across RBR / FER / MER / MCL after retry pass.
4. Floor reflections strong on fwLow / podFloor; occasional garage props in foreground — not haze.
5. Contact sheets: `redbull|ferrari|mercedes|mclaren-sheet.png` (+ `sheet.png`, `matrix.png`).

## Handoff
OWNED: artifacts + small `--preset=closeup` / soft-blit fix only. **Do not push** until told (CI clogged). Do not merge — Apex CI Watch only.
