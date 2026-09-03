---
name: season-mode
description: Use when standalone Season calendar, weekend format, sprint, quali-on/off, points table, Season SETUP (#season-setup), season-cal.js, or season-ui.js are being changed. Do not use for DRIVER CAREER / MY TEAM (career-mode) — career always races Tracks.SEASON.
---

# Standalone Season — calendar vs format

`js/career/season-cal.js` is **rules, no DOM**. `js/career/season-ui.js` is
the SETUP screen. Career is **not** customisable and stays on
`Tracks.SEASON` — do not wire `SeasonCal` calendar reads into a career
weekend.

## Two gates (getting this wrong is a real bug)

| Kind | When the player's config applies | Neutral otherwise |
|---|---|---|
| **Calendar** (`rounds` / `track` / `trackIndex`) | flow is **not** `"career"` | career uses `Tracks.SEASON` |
| **Format** (`quali` / `laps` / `stage` / `pointsTable` / `grid`) | flow is **`"season"`** only | GP / TT / VS FRIEND keep one-off defaults |

A `"not career"` gate on format would give a one-off Grand Prix the
season sprint distance and its points table. Persist at `apex26.seasonCfg`
(`CFG_KEY` in `season-cal.js`; `GameStore` adds the prefix).

## Do not

- Edit career saves or `Career.*` from here → **career-mode**
- Assume SETUP DOM lives in `season-cal.js`
- Recommend `test:career` — there is no such group

```sh
node tools/ci/test-bg.mjs modes
```

`modes` is season + career + quali + TT. `season-(cal|ui).js` also
routes to `ui` (the SETUP screen).
