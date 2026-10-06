# HUD survey handoff (2026-10-05)

Screenshot-only Wave-3 survey. **OWNED:** `artifacts/shots/hud-survey/` only. No HUD CSS/JS edits.

## Live path (`https://brycejmurrin.github.io/f1-game/?APEX_SURVEY_HUD=1`)

| Fact | Result |
|---|---|
| Live `apex-sha` | `9be462a14` (build 14034) |
| `js/ui/survey-hud.js` shipped? | **No** (404; PR #1034 still draft) |
| Race entry | Title → `#mb-race` → `#sel-go` (Race Setup) → `#rs-go` (Start Race) |
| Outcome | Soft-GPU box: loading then hang; `#nogl` text armed (`Sorry — this game needs WebGL2.`) while `#nogl` stays hidden until forced |

Live plates captured: race settings (`18`), loading (`19`, compositor-dark while canvases hidden), Graphics unavailable (`20`).

## Fixture path (local `cursor/survey-hud-bypass-7162` + `?APEX_SURVEY_HUD=1`)

Cockpit HUD / pause without `startRace` / scenery warm. Devices: phone landscape 844×390, phone short 640×360, phone portrait, desktop 1280, tablet.

## Shots (21)

| # | File | What |
|---|---|---|
| 01 | `01-live-boot-title.png` | Live title |
| 02–04 | `02`…`04-live-*.png` | Live circuit select (early nav / hang wait) |
| 05–07 | `05`…`07-phone-hud-*.png` | Phone HUD default / cockpit / helmet |
| 08 | `08-phone-pause.png` | Phone pause over HUD |
| 09–10 | `09`…`10-desktop-hud-*.png` | Desktop HUD |
| 11 | `11-desktop-pause.png` | Desktop pause |
| 12–14 | `12`…`14-*.png` | Phone-short / tablet / portrait HUD |
| 15–17 | `15`…`17-live-*.png` | Live select / setup attempts |
| 18 | `18-live-race-settings.png` | Live Race Settings (Bahrain · 3 laps) |
| 19 | `19-live-loading.png` | Live loading (dark; CDP w/ canvases hidden) |
| 20 | `20-live-graphics-unavailable.png` | Live WebGL2 unavailable plate |
| 21 | `21-phone-hud-strat-forced.png` | Phone cockpit: OT / BRAKE / strat / damage / minimap |

## Coverage checklist

| Element | Shown? | Evidence |
|---|---|---|
| OT | yes | `05`–`07`, `11`, `21` (`#hud-ot` / `#btn-ot`) |
| BRAKE | yes | pedal cluster GAS/BRAKE on touch docks |
| Strategy | yes (forced) | `21` (`#hud-strat`); ships off in default fixture |
| Helmet | body class only | `07` (no race cam; layout class `helmet-cam`) |
| Minimap | box present | dark `#minimap` square TL (no track bake in fixture) |
| Damage | yes | `FWING` chip TL (`#hud-damage`) |
| Pause | yes | `08`, `11` |

## Top overlap findings (≤5)

Measured via `probeHudElements` + `analyzeOverlap` on fixture cells (not live).

1. **btn-throttle × btn-brake** (area≈5776) — all fixture cells. Same pedal circle in touch stub (GAS/BRAKE stacked); expected for survey docks, not a free-floating clash.
2. **btn-throttle × btn-steer-left** (area≈5776) — phone/desktop/tablet HUD cells. Left-dock stack crowding.
3. **btn-brake × btn-steer-left** (area≈5776) — same cells as (2).
4. **tower × map** (area≈4798) — **phone-portrait-hud** only. Timing tower overlaps minimap in portrait.
5. **aero × shift-up** (area≈3116) — desktop / tablet / portrait. Right-side AERO chip vs shift-up.

Additional (not in top-5 cut): phone landscape often marks OT/AERO/docks **unsafe** vs notch insets (`--sal/--sar` 47px); `21` also sees `btn-ot×pausebtn` / `sectors×btn-ot` when strat forced.

## Handoff

- Production cannot run `APEX_SURVEY_HUD=1` until **#1034** ships; use fixture worktree or wait for merge.
- Live soft-GPU: stop after race-settings / loading / Graphics unavailable — do not wait for in-race HUD.
- Priority chrome follow-ups for HUD owners (out of this OWNED): (4) portrait tower×map, (5) aero×shift-up, notch-unsafe OT stack on phone landscape. Pedal GAS/BRAKE co-location is fixture/touch design, not a regression target.
- Artifacts only on branch `cursor/shots-hud-0a11-bd15`. No merge.
