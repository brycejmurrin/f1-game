# Pause + settings information architecture

Locked 2026-09-04. Scope is the pause sheet and the settings sheet only —
title rooms, SELECT, career, garage, and Data Hub stay out.

Cited from `js/ui/settings-tabs.js`.

## Why the tabs died

The 2026-08 critique measured ~49% of settings content below the fold
(`docs/archive/research/UI-LAYOUT-CRITIQUE-2026-08.md`). Three peer tabs
made that worse, not better:

- MORE was overflow dressed as a destination. Title Settings restored
  `settingsCategory`, so a player could land on MORE with no idea why.
- DISPLAY became a wall once METRICS, sliders, the HUD sample, renderer
  recovery, and cockpit options shared one panel.
- Tabs cost a sticky row of chrome on the phone-landscape sheet that
  already cannot spare height (`docs/research/UI-DESIGN-PRINCIPLES.md`).

External pattern: a pause first screen is Resume / Settings / Restart /
Quit; settings themselves are a stack, not three equal hops
(Sense Central pause/settings; CheatGrid mobile nav — tabs only when the
destinations are peers you bounce between).

## Locked decisions

**Pause stays a 1-2-1-1 action sheet.** RESUME full-width; RESTART |
SETTINGS one row; HOW TO PLAY one tap (do not bury it again); STANDINGS
championship-only; QUIT full-width; `#pm-build`. No extra pause
disclosure.

**Settings is a drill-down stack, not tabs, not one long scroll.**

Pages: `home` | `controls` | `display`.

Settings home (`#pm-settings-index`, `.pm-doors`) is a door list:

1. CONTROLS…
2. DISPLAY…
3. ADVANCED STEERING…
4. LIGHTING TUNER…
5. CAMERA TUNER…
6. MUSIC & SOUND…

Tuner doors stay on the index and still open their existing dialogs.
BACK on a page pops to home. BACK on home closes settings (to pause or
title). Escape / pause-key / gamepad B press the same BACK control, so
they pop the same way.

**Always open on home.** Do not restore `settingsCategory`. Title
Settings and pause Settings land on the same index.

**DISPLAY keeps its packing + ADVANCED fold + COCKPIT above ADVANCED.**
Player-facing stays HIDE HUD, METRICS, UI SIZE, HUD SIZE + sample,
RESOLUTION, renderer picker, GRAPHICS, COCKPIT, then ADVANCED.

**Control language stays.** Button = filled plate, no chevron. Door =
plate + `…`. Heading = steel + `--grad-rule`, not clickable. Disclosure
= steel + rule + left chevron. Picker = `‹ value ›`.

**No new class families.** Index reuses `.pm-doors`. Panels stay
`.pm-group`. Sheet `h2#dlg-settings` reads SETTINGS / CONTROLS / DISPLAY
so the first-child `.pm-group-h` on those pages stays hidden.

## Rejected

| Approach | Why not |
|---|---|
| Keep three tabs, restyle them | MORE is still a bin; DISPLAY is still a wall; sticky chrome still eats the phone row. |
| One long settings scroll | The 2026-08 fold measurement. Phone landscape cannot show 49% below. |
| Accordion of every group on one sheet | Same fold problem plus heading-vs-button confusion we just spent a pass killing. |
| Put HOW TO PLAY back under settings | It was buried there. Pause is the one-tap path. |
