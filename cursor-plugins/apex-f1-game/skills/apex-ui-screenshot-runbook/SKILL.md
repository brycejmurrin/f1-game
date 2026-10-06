---
name: Apex UI screenshot runbook
description: >-
  Use when capturing a systematic live screenshot set of Apex menus, garage
  tabs, HUD, and edge states.
---
# Apex UI screenshot runbook

Use when capturing live Apex UI screenshots systematically (menus, garage, HUD).

## Prep
1. Prefer code inventory first (UI surface checklist / `layout-audit` cells) before random clicks.
2. Site: `https://brycejmurrin.github.io/f1-game/`
3. Save under `/workspace/apex-shots/<slug>-YYYY-MM-DD/`
4. Only one computerUse desktop agent at a time.

## Capture order (P0→P8)
1. Boot/home → howtoplay, settings, datahub, trackdesigner, photostudio
2. Garage: all tabs TEAM…LIVERY + teampicker + customize
3. Race path: select → detail → race settings → loading → HUD → pause → results
4. Mode variants TT/Practice/Season/Daily/Quali
5. Career flows
6. VS Friend steps
7. Tuners (lighting/camera/flyby)
8. Edges: rotate-device, Graphics unavailable

## Rules
- Box may lack GPU: if race hangs or Graphics unavailable, save that state and stop race HUD; use user-provided cockpit shots for HUD overlaps.
- Share sampler with UI Survey / Cars via SendToAgent (FYI).
- Name files with stable slugs matching the checklist.
- Do not arm auto-merge yourself; Merge Desk owns merge-when-green (MERGE commit only). Model Auto/`default` only.
