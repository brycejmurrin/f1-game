# Streaming Apex 26 with OBS

`overlay.html` is a broadcast graphic for a stream: a timing tower, the battle
card, sector times and radio captions, drawn as real text on a transparent page.
It never loads the game or a renderer, so it costs OBS almost nothing. The design
and its evidence are in [plans/2026-10-04-stream-overlay.md](plans/2026-10-04-stream-overlay.md).

## What works today: layout with `?demo=1`

Open
`https://brycejmurrin.github.io/f1-game/overlay.html?demo=1&chroma=green`
in a browser (or paste that URL into an OBS **Browser Source**). The page paints
a synthetic race so you can place the graphic, pick scale/side/rows, and check
chroma keying without a live game feed.

For Window Capture instead of a Browser Source: open the same URL in a normal
window, capture it, and add a **Chroma Key** filter (Key Color Type **Green**).
Window capture has no alpha, which is why the page is keyed. Keep the window
unminimised — browsers throttle hidden pages.

## Same-browser live feed

The same-browser publisher (#1551, PR #4056) sends live race frames from the game tab to
`overlay.html` over `BroadcastChannel`. That channel only reaches pages of the
same origin **and** the same browser profile, so the overlay must be open in the
browser you play in. An OBS Browser Source runs its own embedded Chromium with
its own profile and does not receive that feed (the spectator link below is what
will fix that).

To use the live feed:

1. Open the game and start a race.
2. In a second window of the same browser, open
   `https://brycejmurrin.github.io/f1-game/overlay.html?chroma=green`.
   The tower fills within a second; until then it shows "Waiting for a broadcast feed".
3. In OBS: Sources, +, **Window Capture**, pick that window. Add Filters,
   **Chroma Key**, Key Color Type **Green**.
4. Keep the overlay window unminimised.
5. Hide the in-game HUD (SETTINGS, HUD) if you don't want the timing shown twice.

The game page only publishes while an overlay window is open (it listens for the
overlay's heartbeat, and stops about six seconds after the last one).

## Not built yet: the spectator link for an OBS Browser Source

Slice 3 of the plan (#1552) adds a SETTINGS row, STREAM OVERLAY, that mints a room
and gives you an overlay link to paste into an OBS **Browser Source** (width 1920,
height 1080, 30 FPS, Local file unticked, default Custom CSS). That path keeps real
transparency, needs no chroma key, and works when the game runs on a phone. Until it
ships, use `?demo=1` for layout and the same-browser window above for live timing.

## Page options

| Parameter | Values | Effect |
|---|---|---|
| `?chroma=` | `green`, `blue`, `magenta` | A solid key colour instead of transparency; glows are dropped and text gets a 1 px outline so the key does not fringe. |
| `?only=captions` | `captions` | Radio and race-control captions only: no tower, battle card or sectors. |
| `?rows=` | `1`–`20` (default 20) | How many tower rows to show. |
| `?scale=` | `0.5`–`2` (default 1) | Scales the whole graphic. |
| `?side=` | `left`, `right` | Which side the tower sits on. |
| `?demo=1` | — | A synthetic feed with no game: use it to lay the overlay out in OBS. |

## Accessibility

- The tower's position plates are tinted in the team colour with black or white
  numbers, whichever reads better: every plate meets WCAG AA (4.5:1;
  `tests/unit/overlay-render.test.mjs` checks the whole team palette).
- Sector colours follow the HUD's purple / green / yellow rule and always carry
  a glyph (★ ▼ ▲), so colour is never the only cue.
- With the system's reduce-motion setting on, the tower rows stop sliding and a
  new sector time shows as a static outline instead of a flash.
- The overlay is a viewer graphic. The player keeps the in-game HUD and its
  screen-reader announcements.

## Before a stream: checklist

```
[ ] overlay.html?demo=1&chroma=green lays out cleanly in OBS
[ ] chroma key leaves no green fringe at 1080p
[ ] live overlay window shows the tower within a second of the race starting
[ ] a radio message appears as a caption and clears
[ ] a new sector time flashes (or outlines, with reduce motion on)
[ ] the game's frame rate is the same with the overlay window open and closed
```
