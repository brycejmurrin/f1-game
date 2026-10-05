# Garage angles — live pack (build 14034)

**Cmd:** `node tools/shot/garage-angles.mjs --site --fast --team=redbull --views=hero,front,side,rear,top,wingFront,wingRear --az=45deg,135deg --out=artifacts/shots/garage-angles --budget=12m`

**Result:** 14/14 PNGs + `redbull-angles.json` in 400.5s (≈25.5s/shot). Soft `#game-soft` CDP. TEAM tab not clicked (`garageTeam` store path, `switched=false` 29ms) — no white-haze hang this run.

## Findings (≤5)

1. **Default TEAM/livery OK** — Red Bull default reads across orbit: NITROX / SKYSTRIKE / VOLTRUSH / ADRENYX marks legible on hero/side/front.
2. **Orbit az45 vs az135** — both useful; az135 opens rear-quarter / flank; az45 keeps nose-forward three-quarter.
3. **Wings reachable** — `wingFront_*` frames FW endplates + nose #3; `wingRear_*` frames RW endplate #3 + diffuser/light.
4. **Wheels / yellow rim accents** — clear on side + hero; top shows all four slicks + pit-box lines.
5. **TOP framing** — overhead bay beams cut into frame at `top_az*`; car still fully visible, not a hang.

## Not run / skipped

- TEAM tab DOM grind (known hang) — intentionally avoided.
- LIVERY tab / alternate paint jobs.
- Multi-team matrix.

## Handoff

- OWNED: `artifacts/shots/garage-angles/` only.
- Live: https://brycejmurrin.github.io/f1-game/ `version.json` build **14034**.
- Mesh / GarageDefaults / CSS: out of scope (no code).
