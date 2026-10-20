# Issue triage — 2026-10-19 (B·W2·L1)

Scope: all 108 open issues on `brycejmurrin/f1-game`, oldest first (#1518 … #3064), read in four pages. Grant: Bryce, 2026-10-19 ~11:37 PT, "Close with evidence": close only with a merged PR or commit that covers the whole issue, on the deploy branch, with an evidence comment first. Anything uncertain goes here.

Result: **0 closed, 4 unsure, 104 kept.** No issue met all of the closing rules. The backlog was filed on 2026-10-14 from plans, with a "check first" note where the import could not prove the work undone. Every one of those checked here is still undone on tip `39d4ac7a`. The only merged PRs found that mention open issues (#2873, #2943, #3011, #3012, #3023) file or split follow-ups; none implements one.

Not looked at, by rule: issues labelled `claimed` or `blocked`, epics and trackers with open sub-issues, ORCH12 wave 5 (#3064 #2797 #3044 #2688 #2978 #2974 #2961 #2965). They are in the KEEP count.

## CLOSED

| # | Title | Evidence | Reason |
|---|---|---|---|
| — | none | — | — |

## UNSURE

| # | What is missing | Suggested next step |
|---|---|---|
| #2194 | Step 1 shipped: the `index.html` repair now checks `navigator.onLine === false` and the fetch probe before sweeping `apex26-*` caches (`index.html:416-425`). The offline-precache check, the two-generation repro (steps 2–3) and the regression spec (step 4) have no evidence. | Find the PR that landed the gate; if the owner accepts it as slice 1, split steps 2–4 into a new issue and close this one as completed. Needs a call. |
| #1553 | `?only=captions` shipped (`js/overlay/render.js:13`, `overlay.html:53`). `?rows=`, reduced-motion sector outline, team-plate contrast ≥ 4.5:1 and the streamer docs page not checked. | Check each acceptance line; close only if all are present. |
| #1551 | `js/overlay/feed.js` has `fieldBest`, but `__apex.sectorState` in `js/agent/apex.js` has none (the issue's own grep check), and the publisher/BroadcastChannel spec was not located. | Locate the overlay PR, then check the "Done when" grep and spec. |
| #1565 | Asks "decide, and if wanted, build". No decision note found in `docs/notes/`. | Bryce decision: close in favour of the shipped scripted default, or build. |

## KEEP — 104

Counts by kind, as far as the labels show: the epics and trackers (#1543, #1549, #1554, #1563, #1567, #1576, #1583, #1593, #1599, #1608, #1613, #1616, #1626, #1635, #1640, #1650, #1653, #1675, #1677, #1710, #1745, #2501, #2952, board #1780, flaky tally #2394), the `claimed`, `blocked` and wave-5 sets above, and the open feature slices below.

Checked on the tree and still open:

- #1546, #1547: no `fromRace` / `fromGhost` / `fromCareerYear` builder in `js/`.
- #1557: no `reel-*` or `clip-*` file.
- #1566: `STYLE_AXES` is still `["aggression","optimism"]` (`js/data/driver-ratings.js:10`).
- #1580, #1629: no `energyPlan`, `deployPlan` or `energyForecast`.
- #1595: `css/hud.css` still holds 19 `#rrggbb` literals.
- #1602: no pseudo-locale module; #1610: no calendar-export module; #1606: no `radio.*` keys in `locales/en.json`.
- #2881: `.claude/settings.json` still allows `mcp__plugin_browser-use_browser-use` top-level; the guard has no match for it.
- #2944: `latestPerWorkflow` still breaks a created_at tie to the higher run id (`tools/ci/ci-watch.mjs:20-21`).
- #3013: `ready-full-cap (deleted, #3013)` and its test still exist.
- #3024: `preflight()` in `tools/ci/deploy.mjs:112` still takes no `cwd`.
- #2977: the `todo` pin is still in `tests/unit/hud-pins.test.mjs:199`; the fix branch `cursor/hud-band-allocator-5e2c` is not on origin.
- #2994: `memory: local` is absent from `.claude/agents/track-surveyor.md`.

Needs a real device or Bryce, not an agent:

- #1633, #1651, #1652, #2788 (real-GPU numbers), #1638, #1639.
- #3041 (Track Designer toolbar overflow at 200% UI scale) is a measured, still-open bug.
- #1825 (garage exterior follow shot) is a real, unbuilt feature.

Stopped at: none — all 108 issues classified, under the 150 cap. Issue bodies and comments were not edited and no labels were changed.
