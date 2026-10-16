# Feature roadmap: what to build next (2026-10-04)

**Date:** 2026-10-04  
**Status:** PLAN (ranking and scoping only; no code in this PR).  
**Scope:** a brainstorm across six angles (competitors, web platform,
engagement, F1 2026 content, presentation and creator tools, and an inventory
of what the game already does), reduced to a ranked list of what is *missing*.
Tier 1 has a full plan each; tiers 2 and 3 are summarised here and need their own
plan before work starts.

## How this was produced, and how far to trust it

Six read-only research agents ran in parallel on 2026-10-04. Treat the output as a
shortlist to verify, not as settled fact:

| Source | Quality |
|---|---|
| Feature inventory | Read the repo docs and code. The docs are a few days old, and about 200 PRs landed after some of them, so an item listed as "unbuilt" may have shipped since (rain, Kenney props and AI personality are the likely ones). Two of its claims were already wrong: it said there was no global colour-blind mode (there is one) and that the music playlist is CC0 (it is not; see Constraints). Check the code before starting any item. |
| 2026 F1 rules and data terms | Best grounded: the agent cited the FIA, F1, Pirelli, OpenF1 and Jolpica pages. It did not verify the 50/50 power-unit split, tyre rim size, steward thresholds or qualifying formats. |
| Web platform | Mostly the agent's background knowledge. Only WebGPU status, WebHID force feedback and Document Picture-in-Picture were checked against live sources. Every support claim in the Tier 1 plans was re-verified by that plan's author. |
| Competitors and engagement | Search-result summaries only. No Reddit or forum thread was read in full. |
| Presentation and creator tools | About seven searches, no full pages. |

## Already built: do not propose these again

Daily Challenge (UTC-seeded, streak, share line; `js/race/daily-challenge.js`),
ghost laps and shareable ghost links (`js/car/ghost.js`, `js/car/ghost-share.js`),
Photo Studio, Race a real GP from OpenF1 with jump-in and highlights, Overtake Mode,
active aero and the 2026 energy model, the penalty ladder and track limits, engineer
radio with synthetic voice, custom teams and liveries, track-designer share links
(`docs/TRACK-DESIGNER.md`), friend racing (WebRTC, 2-4 players), a 20-second
instant-replay ring, 20 camera modes, rumble and vibration, wake lock, the share
sheet, an installable offline PWA, phone-as-controller, 52 circuits including
Madrid, and a full career mode (`docs/CAREER.md`).

## Tier 1: the plans in this PR

| # | Idea | Why it ranks here | Plan |
|---|---|---|---|
| 1 | Result and share image cards | Share text exists but images are what spread; pairs with Photo Studio and the daily challenge | [share cards](2026-10-04-share-cards.md) |
| 2 | Stream overlay mode | Nothing exists; DOM-only, low risk, opens the game to streamers | [stream overlay](2026-10-04-stream-overlay.md) |
| 3 | Highlight reel and clip export | Larger follow-up that reuses the replay and highlight systems | [highlight reel and clip export](2026-10-04-highlight-reel-clip-export.md) |
| 4 | Install shortcuts and an `.ics` race-weekend calendar | The manifest has no shortcuts; the calendar gives a reminder without Web Push, which needs a server | [PWA shortcuts and calendar](2026-10-04-pwa-shortcuts-calendar.md) |
| 5 | Extend the colour-vision mode, and a captions pass | A colour-vision mode already ships (`cvdMode`: deutan, protan, tritan token remaps), but the plan's audit found 9 of 22 colour-coded meanings with no non-colour cue, and spotter calls with no caption | [colour-blind and captions](2026-10-04-colourblind-captions.md) |
| 6 | Localisation | No i18n exists at all; the biggest plan here | [localisation](2026-10-04-localisation.md) |

Suggested order: 1, 2, then 3 (it builds on 1). Plans 4 and 5 are independent and can
interleave. Plan 6 touches the most files and should not run in parallel with
other large UI work.

## Tier 2: deepens the racing (each needs its own plan)

| Idea | Existing material to start from |
|---|---|
| Pit strategy panel and rival windows | [pit guidance plan](../research/PIT-GUIDANCE-STRATEGY-PLAN-2026-09.md): written, unbuilt. Tyre severity is authored for only ~7 of 52 circuits ([strategy and career depth](2026-09-30-strategy-career-depth.md)), which caps how good strategy can be |
| Mechanics backlog: brake temperature and fade, true lock-up and wheelspin, handling damage | [mechanics survey](../research/MECHANICS-OPPORTUNITY-SURVEY-2026-09-14.md), [racing depth](2026-09-15-racing-depth.md) |
| Distinct AI personalities and visible mistakes | [AI personality plan](2026-09-30-ai-personality.md). Check what already merged before planning |
| Manual pit-stop mini-game; cooldown lap, parc fermé and podium flow | Repeatedly requested in the EA F1 25 forum wishlist (seen as a search snippet only) |
| Spectate a friend's race | Send only car state over the existing friend connection and render locally |
| Online play on track-designer circuits | Documented as unsupported in `docs/TRACK-DESIGNER.md` ("Limits", may be stale) |
| Fair-play online: reduced collisions and a clean-racing score | F1 25's online collisions are a top complaint (secondary source) |
| 2026 rules explainer ("why did I slow on the straight?") | Super-clipping and Overtake Mode already exist, so this is UI and onboarding |

## Tier 3: bigger bets and risks

- **Serverless leaderboards.** A pasted ghost is re-simulated by CI and a static
  board is published. The ghost envelope already exists, so the blocking question is
  whether the physics is deterministic across browsers. That is untested and has to
  be measured before any design work.
- **Prediction league and championship what-if calculator.** Jolpica allows 500
  requests an hour unauthenticated, so both need a request budgeter and caching.
- **Share-code livery gallery and mod packs.** Strict schema validation, size caps,
  and no script execution are mandatory.
- **Real-circuit import with elevation from open terrain data.** The TUM track CSV
  importer already exists. OpenStreetMap data is share-alike (ODbL), a forum thread
  reports a Copernicus DEM licence update that needs re-reading, and the TUM database
  is LGPL.
- **Quest 3 VR.** The mode has never been run on a real device
  ([notes](../notes/XR-QUEST-ON-DEVICE.md)). Verify before adding to it.

## Skip for now

Learned AI drivers (already ruled out in [AI field research](../notes/AI-FIELD-RESEARCH.md)),
wheel force feedback over WebHID (per-model reverse engineering, Chromium only), Web Push
(needs a server), WebGPU compute (small visible gain over WebGL2 instancing, needs real-GPU
evidence), Bluetooth accessories, and a live-session companion (OpenF1 live data needs a
paid key that a static site cannot hold).

## Constraints that apply to every plan

- **Trademarks.** Formula One's rights holder has had unlicensed fan mods removed
  (https://pcgamer.com/unlicensed-formula-1-mods-ordered-to-be-removed). Keep the
  "unofficial" notice, use no F1 logos or trade dress, and do not add real team
  liveries, driver likenesses or sponsor marks as new built-in assets. The existing
  real-driver and team roster is the largest exposure and may need a lawyer's view;
  this document is risk flagging, not legal advice.
- **OpenF1** (https://openf1.org/): non-commercial terms, 3 requests per second and
  30 per minute free, historical data only. No ads or paid tiers on anything built on
  it, credit it, cache and rate-limit.
- **Jolpica** ([rate limits](https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md)):
  4 requests per second burst and 500 per hour sustained. The calendar plan reports its
  data is CC BY-NC-SA 4.0, which makes a published static calendar file a redistribution
  that needs attribution; that was not independently confirmed, so read its terms before
  shipping the calendar or the prediction league.
- **Music.** `assets/music/CREDITS.txt` says the six shipping tracks were "provided by
  the project owner", not CC0 (the CC0 loops were removed). Anything that exports audio
  (clip export, share videos) must leave the playlist out until the owner says those
  tracks may be redistributed. Spotify audio must never be captured.
- **Engine rules** (`AGENTS.md`): `js/game.js` must not grow, so new logic goes in new
  modules. The arc must not reach the driver: nothing derived from track curvature may
  affect the player with assists off. Never hand-edit generated files.
- **Merge pacing** (`AGENTS.md` §Concurrent PRs): batch small tooling and doc fixes into
  one PR, and arm auto-merge on at most two PRs at a time per session.

## Open product questions for the owner

1. Is a visible leaderboard worth the determinism work, or is "share a ghost with a
   friend" enough?
2. Should real driver and team names stay as they are, move to fictional defaults with
   an opt-in real roster, or stay unchanged? This decides how far the sharing and
   export features can go.
3. Which languages first, and is English-only voice acceptable for a first release?
4. Is streaming a priority audience? It decides whether the overlay jumps ahead of
   the share cards.
