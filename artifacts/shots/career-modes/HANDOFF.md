# Career + mode-hub chrome survey — handoff

**Live:** https://brycejmurrin.github.io/f1-game/  
**apex-sha (Pages):** `9be462a14a2d89a69bae45358e80e8eaf754b02c` (build meta 14034)  
**Served for shots:** local static of that SHA (`scratch/live-career-tip`) — container Chrome cannot open github.io (proxy CA / TinyFish key absent).  
**Branch:** `cursor/shots-career-a7f3` · OWNED: `artifacts/shots/career-modes/` only  
**Viewport:** 1280×800 · **Shots:** 19 · **GPU races:** not entered · Graphics unavailable: not hit

## Coverage map

| # | File | What |
|---|------|------|
| 01 | `01-title-mode-hub.png` | Title mode-hub (CAREER MODES, TT, Practice, Season, Daily chip) |
| 02 | `02-career-modes-slots.png` | CAREER MODES — 6 slots + IMPORT |
| 03 | `03-career-modes-backup-save-load.png` | BACKUP — SAVE/LOAD CAREER FILE + PROTECT LOCAL SAVES |
| 04 | `04-career-setup-driver-slot.png` | NEW CAREER setup (empty driver slot) |
| 05–06 | `05`/`06`-career-guide-*.png | HOW CAREER / HOW MY TEAM WORKS |
| 07–08 | `07`-hub / `08`-history | Active career hub + history |
| 09–13 | entry-*-*.png | TT / Practice / Season / Season setup / Daily |
| 14–16 | race-settings / assists / quali | Pre-drive chrome; Assists & Wear; Quali sheet |
| 17–19 | settings-* | Settings home, STEERING & ASSISTS, BACKUP & RESTORE |

## Findings (≤5)

1. **CAREER MODES left pane scrolls at 1280×800** — `#cr-left` scrollHeight 741 > clientHeight 637 (~104px). SAVE/LOAD are on-screen; **PROTECT LOCAL SAVES** sits at the bottom of that overflow (y≈733). Easy to miss without scrolling the left column.
2. **Practice entry reuses TIME TRIAL select chrome** — title stays `TIME TRIAL`; a `PRACTICE SESSION` band + goal dropdown distinguish it. Easy to misread as still TT.
3. **Daily entry is the same TT select shell** — differentiation is Montreal selected + `TODAY'S CHALLENGE · MONTREAL · DRY · DEFAULT` chip, not a DAILY title.
4. **Assists are split across two surfaces** — Race Settings › ASSISTS & WEAR (driving line / tyre wear / dirty air) vs Settings › STEERING & ASSISTS (presets + AIDS/LINE summary). No single “assists summary” sheet.
5. **Settings BACKUP & RESTORE excludes career by design** — copy points to GARAGE › TEAM for cars; career SAVE/LOAD lives only on CAREER MODES (cross-link in career BACKUP note is correct).

## Stop rule

Stopped before Drive / GPU race. Quali sheet reached (`DRIVE MY LAP` / `SIMULATE` offered). Graphics unavailable not encountered.

## Verify

```sh
ls artifacts/shots/career-modes/*.png | wc -l   # expect ≥15
cat artifacts/shots/career-modes/HANDOFF.md
```
