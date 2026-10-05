# Garage close-ups — live pack (build 14034)

**Cmd:**
```sh
node tools/shot/garage-angles.mjs --site --fast --preset=closeup \
  --team=redbull,ferrari,mercedes,mclaren --full-views --sheet=1 \
  --out=artifacts/shots/garage-closeups --budget=35m
```

**Result:** 56/56 PNGs + 4 team sheets + matrix + sheet in 1723.1s (≈27.3s/shot). Soft `#game-soft`. Store path (`garageTeam`); no TEAM tab grind — no white-haze hang.

## Stations (unique az each)
fwLow, fwSide, noseTip, endplate, rwRear, rwSide, rwTop, podInlet, podFloor, wheelF, wheelR, haloBehind, mirror, cover

## Findings (≤5)
1. Part-fill framing works — dist 1.7–2.6 m with `clamp:false`; each station owns its az (no shared-az duplicates).
2. Wings readable — fwLow/fwSide/endplate and rwRear/rwSide/rwTop show flaps/endplates; RW side/top expose element gaps.
3. Wheels fill frame at 1.7 m — rim / cover / sidewall stripe clear on wheelF/wheelR.
4. HaloBehind / mirror / cover hit cockpit + engine-cover marks across all four teams.
5. Floor reflections strong on low shots (fwLow, podFloor); occasional foreground garage props in wheelR/podFloor — not haze.

## Sheets
- `redbull-sheet.png`, `ferrari-sheet.png`, `mercedes-sheet.png`, `mclaren-sheet.png`
- `sheet.png`, `matrix.png`

## Handoff
OWNED: artifacts + small `--preset=closeup` tool option only. No mesh/CSS. Do not merge — Apex CI Watch only.
