# Menu / Settings / How-to-Play screenshot survey

**Source:** live `https://brycejmurrin.github.io/f1-game/` (2026-10-05)  
**Shots:** `artifacts/shots/menus-settings-htp/` (35 PNGs + `manifest.json`)  
**Method:** Playwright Chromium against the live URL (host Playwright/Chrome MCP not attached in this Cloud catalog; CLI fallback).  
**bc:** `bc-258e9826-b9f2-5d79-8b20-6f85d8cdd9f6`

## Coverage

| Area | Slugs |
|---|---|
| Home | `home-desktop`, `home-portrait-500x800`, `home-narrow-500x385` |
| How to Play | `htp-controls` … `htp-friends`, `htp-scroll-mid` |
| Settings tabs | `settings-index`, `settings-controls`, `settings-driving`, `settings-display`, `settings-appearance`, `settings-files`, `settings-advanced`, `settings-audio` + portrait/narrow controls |
| Data Hub | `datahub-default`, schedule/standings/results/live/telemetry/race/export |
| Sheets/dialogs | `sheet-vsfriend`, `sheet-select`, `sheet-garage`, `sheet-career`, `sheet-race-settings`, `dialog-track-detail` |

## UI issues (≤5)

1. **Narrow home clips the lower dock** — `home-narrow-500x385.png` (~500×385). `WATCH REAL` / `PRACTICE` (and everything below) are cut by the viewport; no clear scroll affordance on the title chrome at this height.

2. **Narrow Settings → Controls clips helper copy** — `settings-controls-narrow-500x385.png`. Under `REPOSITION TOUCH CONTROLS`, body text truncates at the sheet floor while the red scrollbar still implies more content; foot `BACK` sits over the clipped line.

3. **Data Hub tab strip clips trailing tabs** — `datahub-schedule.png` (and siblings) @1280×800. `EXPORT` (and part of `WATCH & DRIVE`) sit past the right edge of `.dh-tabs` with only an implied horizontal scroll and no strong scroll cue.

4. **How to Play body ends mid-sentence against the foot** — `htp-controls.png`. With `CLOSE` pinned, the last visible `GEARS` sentence is cut mid-line; end padding above the foot is tight even when the section is scrolled into view.

5. **Portrait home is dense but intact** — `home-portrait-500x800.png` fits the full button stack; no defect beyond noting it as the healthy counterpart to finding (1).

## Handoff

- Paths: `artifacts/shots/menus-settings-htp/*.png`, `artifacts/findings.md`, `artifacts/shots/menus-settings-htp/manifest.json`
- Branch: `cursor/shots-menus-a4f2`
- Capture scripts (local, gitignored): `scratch/shots-menus/capture-live.mjs`, `capture-extra2.mjs`
- No game source / ratchet / merge changes.
