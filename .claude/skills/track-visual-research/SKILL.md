---
name: track-visual-research
description: Capture real-world reference photos for a place/track by driving a headless browser to an image search engine (Google Images, with Bing/DuckDuckGo fallback), then screenshotting and scrolling the results grid so they can be Read as visual reference. Use when you need to SEE how something really looks (e.g. an F1 circuit's surroundings, a landmark, a skyline) before modelling or editing scenery. REQUIRES outbound web egress to the search engine — see Network requirement.
---

# Track visual research (image search → screenshots)

Drives a headless Chromium (Playwright) to an image-search engine, screenshots the
results grid, and scrolls to capture more — producing local PNGs you can Read as
real-world visual reference.

## Usage

```sh
node .claude/skills/track-visual-research/google-images.mjs "<query>" <outdir> [scrolls]
# examples:
node .claude/skills/track-visual-research/google-images.mjs "Suzuka circuit ferris wheel aerial" /tmp/ref/suzuka 6
node .claude/skills/track-visual-research/google-images.mjs "Monaco harbour casino square trackside" /tmp/ref/monaco 5
```

- `query` — what to search. Be specific: add `aerial`, `trackside`, `grandstand`,
  `skyline`, `run-off`, `kerbs`, the GP name, etc.
- `outdir` — where PNGs are written (`<slug>-00.png`, `-01.png`, …).
- `scrolls` — how many scroll-and-shoot passes after the first frame (default 5).
- Env `ENGINE=google|bing|duckduckgo` forces one engine; default tries all three
  in order and uses whichever the network allows.

After it runs, **Read the PNGs** to study the real-world appearance, then apply what
you see to the per-track `scenery()` in `js/tracks/<id>.js`. Pair it with
`tools/shoot-track.mjs <id>` to compare your in-game result against the reference.

## How it works

- Routes through `HTTPS_PROXY` if set; trusts the proxy's TLS (`ignoreHTTPSErrors`
  scoped to this research browser only — it does not change any other tool's TLS).
- Pre-seeds Google consent cookies and clicks an "Accept/Reject all" dialog if one
  still appears, so the EU consent wall doesn't block the grid.
- Prints a JSON summary: `{ query, files, note, errors }`.

## Network requirement (IMPORTANT)

This skill needs outbound HTTPS to the search engine host (e.g. `www.google.com`).
Some managed/remote sessions enforce an **egress allowlist** that returns `403` for
those hosts — in that case the script reports
`no reachable search engine (egress policy likely blocks them)` and writes no
images. Verify with:

```sh
curl -sS "$HTTPS_PROXY/__agentproxy/status"   # look for connect_rejected / 403 on the host
```

If blocked, either run this skill where web egress is allowed (e.g. local Claude
Code) or have the org allowlist the image-search host for the session. Do **not**
try to route around the policy. The fallback that always works in a locked-down
session is the `WebSearch` tool (text descriptions + source URLs), not viewable
images.
