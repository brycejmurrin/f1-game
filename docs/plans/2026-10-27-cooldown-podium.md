# Cooldown lap, parc fermé and podium flow — plan (2026-10-27)

Status: **PLAN** — docs-only (#1584). Build is blocked on this note landing; slices
below become sub-issues of #1584 / parent #1583. No product code in the plan PR.

Date: 2026-10-27
Parent: #1583 (feature roadmap tier 2) · Issue: #1584
Scope of *this* PR: `docs/plans/2026-10-27-cooldown-podium.md` (+ NOTES-INDEX /
roadmap pointer). Implementation PRs own `js/`, `css/`, tests.

A path written `js/<new>/…` is a PROPOSED file. Backticked paths without `<new>`
already exist on disk (verified 2026-10-28 tip via apex-lsp).

## Related (do not duplicate)

| Doc / module | Relationship |
|---|---|
| `docs/FLOW.md` §Leaving a session | Canonical post-flag table today: `endRace` → ResultsCam + results surface. This plan *inserts* phases before the full sheet owns the session. |
| `docs/USAGE-PATHS.md` R11–R12, finish-camera table | Journey IDs to extend; do not invent a parallel path language. |
| `docs/plans/2026-10-04-feature-roadmap.md` tier 2 | Named this idea; row should point here once this plan lands. |
| `docs/plans/2026-10-04-highlight-reel-clip-export.md` | Owns HIGHLIGHTS *export*; this plan only reuses the live ResultsCam highlights phase as an optional exit from ceremony. |
| `docs/plans/2026-10-04-share-cards.md` | Share cards stay on the results / standings surfaces; ceremony does not mint a new share surface. |
| skill `f1-animation-cameras` | Camera ownership when a build slice edits ResultsCam or chase blends. |
| Manual pit-stop mini-game (roadmap same cell) | **Out of scope** for every slice below — later tier; do not couple cooldown to a mini-game. |

## Goal

After the chequered flag in eligible solo GP / sprint / season / career rounds,
play a short **ceremony sequence** — cooldown lap → parc fermé park → podium
beat — then hand off to the existing results sheet (classification, career
settlement, RACE AGAIN / MENU). Reuse `ResultsCam`, `ResultsStory` podium DOM,
and `#results` rather than inventing a second results stack. Phone landscape
844×390 touch is a first-class layout, not a desktop leftover.

## Non-goals

- Manual pit-stop mini-game (roadmap neighbour; separate issue later).
- Friend-race / netplay ceremony (ResultsCam already refuses `netPlay.active()`).
- WATCH / real-race replay ceremony (replay owns the picture).
- TT / qualifying / practice ceremony (those modes already skip `ResultsCam.onFlag`
  or use a different surface — keep that).
- New share card kinds, highlight *export*, or a dedicated podium scenery mesh
  per circuit (use existing chase / orbit / generic pit framing first).
- Raising size ratchets; `js/game.js` must not grow a ceremony megafunction —
  extract to a small module.

## Current state (file evidence, tip 2026-10-28)

### Post-flag today
- `endRace` in `js/game.js` (~L2908): classification, championship/career award,
  then `dbgCam = null; resultsCam.onFlag(); buildResults(…); els.results.hidden =
  false` (~L3027–3029). State flips to `"results"` *before* the sheet is shown
  (~L2931). There is **no** cooldown drive or parc fermé park.
- Mode matrix: `docs/FLOW.md` — ResultsCam only for solo GP/sprint/practice/duel
  and season/career when `ResultsCam.enabled(G)` (false on mobile /
  `PerfGov.tier() >= 2`); TT / quali / friend / WATCH skip `onFlag` paths as
  documented.

### ResultsCam (reuse target)
- `js/camera/results-cam.js`: phases `idle | chequered | orbit | highlights |
  done` (`create` ~L79). `onFlag()` → `chequered` (~L161); after `CHEQ_S` (2.2 s)
  → `orbit`; optional `startHighlights()` from `#res-highlights`.
  `status()` → `{ phase, age, live, clips, clip }` (~L106). Publishes
  `G.dbgCam` with `_resultsCam: true`.
- Wired in `js/game.js`: create ~L3509; tick under `state === "results"` ~L8612;
  render early-return when results and cam not live ~L7302.
- Unit coverage: `tests/unit/results-cam.test.mjs` (chequered→orbit, mobile off,
  highlights reel). **No** browser `results-flow` spec yet.

### Results / podium UI (reuse target)
- `js/ui/results-story.js`: `summary()` / `render()` — podium `<ol class="podium">`
  for top three when `order.length >= 3` and not duel/practice (~L40–51). Pure
  data in `summary()` is the ceremony caption source.
- `js/ui/results-sheet.js` `GameResults.create`: `buildResults` / TT / standings /
  champion. Sheet shell is `<dialog id="results">` in `index.html` (~L2951) with
  `#res-menu` / `#res-next`. Compact-wide phone layout already tuned in
  `css/overlays.css` (`data-density="compact"`, 844×390 notes).
- `PODIUM` place classes in results-sheet / quali-sheet (`[" p1"," p2"," p3"]`).

### Driving / pits (cooldown inputs)
- `js/race/pit-lane.js` `PitLane`: entry windows, boxes, zones — enough to detect
  “player entered pit / parked at box” without a new track format.
- `Tracks.inPitLane` / `pitLaneAt` in `js/track/tracks.js` — geometric tests for
  cooldown exit triggers.
- Director auto-spectate after finish (`js/camera/director.js`) already exists for
  the *player finished, field still running* wait (`USAGE-PATHS` R11). Cooldown
  is different: **player still drives** after the session is classified.

### `__apex` today
- `finishRace()` (`js/agent/apex.js` ~L1269) marks finishers and calls `endRace` —
  jumps straight to today's results. No ceremony phase read/write.
- `ResultsCam.status()` exists on the camera API but is **not** exported on
  `__apex`. `agentHelp()` stage string lists `finishRace()` only.

## Design

### Phase machine

Insert a ceremony owner between classification and full sheet ownership.
Proposed module: `js/<new>/race/ceremony.js` → `RaceCeremony` (name bikeshed OK;
one IIFE global). `endRace` still classifies and awards **once**; ceremony never
re-scores.

| Phase id | Trigger in | Trigger out | Player input | Camera | UI |
|---|---|---|---|---|---|
| `classified` | `endRace` finished award (internal, 0-frame) | auto → `cooldown` when ceremony eligible; else today's path | — | — | none yet |
| `cooldown` | eligible GP-like session, player finished (not retired DSQ), not mobile-frozen path *or* mobile with simplified skip | pit entry / box park **or** ~1 lap / time budget **or** SKIP | drive (throttle/brake/steer); no attack AI on player; AI cools or parks | keep chase / cockpit; optional soft ResultsCam orbit only if player skips drive | thin HUD: lap remnant, SKIP TO PARC FERMÉ (touch ≥44 CSS px) |
| `parcFerme` | cooldown exit | timed (~6–10 s) **or** SKIP | none (controls hidden) | **reuse ResultsCam**: new phase `parcFerme` *or* `orbit` re-aimed at pit/box subject | dim caption “PARC FERMÉ”; SKIP |
| `podium` | parc fermé exit; only if `ResultsStory.summary(order).podium.length === 3` (else skip to results) | timed (~5–8 s) **or** CONTINUE | none | ResultsCam orbit / side vantage on P1 (winner subject already in `subject()`) | reuse `ResultsStory.render` podium fragment as overlay (not a second dialog) |
| `results` | podium exit / skip chain | existing `#results` buttons | sheet buttons | today's `chequered→orbit` **or** resume orbit; HIGHLIGHTS unchanged | `buildResults` + `#results` as today |

Eligibility (ceremony on): same spirit as ResultsCam for session kind — solo GP /
sprint / season / career race; **off** for TT, quali, practice, duel, friend,
WATCH. Retired / DSQ player: skip `cooldown` drive, still allow short
parc-ferméskip → results (no fake podium if not top three).

Mobile / `PerfGov.tier() >= 2`: **do not** enable full ResultsCam orbit (cost).
Instead: freeze last frame (today) **or** one static `dbgCam` park pose; ceremony
phases still advance on timers + SKIP so phone players get the flow without
paid redraw. Document the choice in the phone slice; default = timers + SKIP +
frozen frame, matching FLOW.md consequence (2).

### Camera plan (reuse ResultsCam)

1. Keep `CHEQ_S` chequered cut as the **first frame of ceremony** (or of
   `results` when ceremony is skipped) — do not invent a second flag cut.
2. Extend `ResultsCam` phase enum with `parcFerme` (and optionally `podium`)
   *or* map those ceremony ids onto `orbit` with a `subjectHint: "pit"|"winner"`
   field on `status()`. Prefer **one** camera owner: ResultsCam. Director stays
   off during ceremony (`wantOn` false while ceremony live).
3. Cooldown drive uses the normal race camera stack (chase), not ResultsCam.
4. Highlights remain an opt-in from the results foot (`#res-highlights`), not a
   forced ceremony beat.
5. Skill `f1-animation-cameras` owns any blend / cut-jump fixes when poses change.

### Reuse of results / podium screens

- **Do not** add `#podium` dialog. Mount `ResultsStory.render(…)` (or its podium
  `<ol>` only) into a lightweight overlay host already in `#results` / a single
  new `#ceremony` region in `index.html` if the sheet must stay `hidden` until
  `results` phase.
- `buildResults` runs once at classification (as today) **or** defers DOM paint
  until `results` phase — prefer **defer show** (`els.results.hidden = false`
  only on entering `results`) so cooldown is not under a dim dialog. Career
  settlement object stays computed in `endRace`; only visibility moves.
- Standings / champion / TT builders untouched.

### Phone landscape 844×390 (touch)

- Primary verify viewport: 844×390 landscape, touch first (AGENTS.md §Coordination).
- SKIP / CONTINUE: one row of `.bigbtn` in the sheet-foot pattern; min height
  `--tap`; no hover-only affordances.
- Cooldown: keep on-screen steer/throttle if the session already showed them;
  hide cam / pause chrome that fights SKIP.
- Compact density: follow `#results` compact-wide rules in `css/overlays.css`
  when the podium overlay shares that sheet; if ceremony uses a separate host,
  mirror those paddings — do not invent a third density system.
- Spec matrix: at least one Playwright path at 844×390 in `results-flow`.

### `__apex` hooks

Expose ceremony without forcing a full drive:

| Hook | Behaviour |
|---|---|
| `__apex.ceremony()` | Read: `{ phase, age, eligible, skipped }` mirroring / wrapping `RaceCeremony.status()` + ResultsCam `phase` when cam owns the beat. |
| `__apex.ceremony("cooldown"\|"parcFerme"\|"podium"\|"results")` | Seek/skip to that phase (test harness). No-op / false when ineligible. |
| `__apex.finishRace({ ceremony?: true\|false })` | Default stays **today's** instant results for existing tests; `ceremony:true` runs the new path. Or add `__apex.finishCeremony()` — pick one in slice 1 and pin it in `agentHelp()`. |
| `agentHelp()` | Document the hooks under stage / results. |

Update `docs/DEBUG-HOOKS.md` in the same build slice as the hooks (not in this
plan PR).

### Mode / skip matrix (summary)

| Mode | Ceremony | Notes |
|---|---|---|
| Solo GP / sprint | on | Full table above |
| Season / career race | on | Settlement still in `endRace`; sheet later |
| Practice / duel / TT / quali | off | unchanged surfaces |
| Friend / WATCH | off | unchanged |
| Mobile / high PerfGov | on (timers) | no live ResultsCam orbit |
| Player retired / DSQ | partial | skip cooldown drive; no podium unless classified P≤3 |

## Test plan

### New browser spec (required for build)
- Add `tests/specs/<new>results-flow.spec.js` (drop the `<new>` segment when
  creating it) and a `tests/groups.json` group row + `docs/TESTING.md` §5 line +
  `npm run gen` (build PR, not this one).
- Cases (minimum):
  1. Eligible GP: `race` → `finishRace({ceremony:true})` → phase `cooldown` →
     `ceremony("parcFerme")` → `podium` (fixture with ≥3 cars) → `results` →
     `#results` visible, `#res-next` enabled.
  2. SKIP chain: from cooldown, one tap reaches `results` without soft-lock.
  3. Ineligible TT: `finishRace` still opens TT results; `ceremony().eligible
     === false`.
  4. Phone 844×390: SKIP targets ≥ tap; podium overlay does not clip foot
     buttons (DOM box asserts, not pixels).
  5. `__apex.ceremony()` phase string matches UI host `data-ceremony-phase`
     (pin a data attribute on the host for a11y + tests).

### Unit / VM (build slices)
- Extend `tests/unit/results-cam.test.mjs` for any new ResultsCam phase.
- New `tests/unit/<new>race-ceremony.test.mjs` (or similar): pure transitions,
  eligibility, no double `endRace` award.
- Pin `finishRace` default backward compatibility (`end-race-music-vm`,
  classification VM tests stay green without ceremony).

### Docs-only (this PR)
- `node --test tests/unit/docs-integrity.test.mjs tests/unit/agent-config.test.mjs`

## Build slices (checklist → sub-issues)

File each as a sub-issue of #1584 (or of epic #1583 if #1584 closes on plan
merge). One PR per slice unless a later steward joins 4+5.

- [ ] **Slice 0 — Plan (this doc)** — docs-only; #1584 plan acceptance.
- [ ] **Slice 1 — Ceremony state machine + `__apex`** — `js/<new>/race/ceremony.js`
  (or agreed path), wire from `endRace` without showing `#results` early;
  `__apex.ceremony` / `finishRace` option; DEBUG-HOOKS; unit tests. No new
  visuals beyond `data-ceremony-phase`.
- [ ] **Slice 2 — Cooldown lap** — player drive after classify; AI cool-down /
  park policy; pit/time/SKIP exits; chase cam; touch SKIP on 844×390.
- [ ] **Slice 3 — Parc fermé** — park poses / pit subject; ResultsCam extension
  or aimed orbit; caption; timer + SKIP; mobile frozen-frame path.
- [ ] **Slice 4 — Podium beat** — mount `ResultsStory` podium overlay; camera on
  winner; CONTINUE → show `#results` (`buildResults`); career/season buttons
  unchanged.
- [ ] **Slice 5 — `results-flow` spec + FLOW/USAGE-PATHS** — Playwright group;
  update `docs/FLOW.md` / `USAGE-PATHS.md` finish tables; quarantine policy if
  flaky.

**Deferred (not a slice of #1584):** manual pit-stop mini-game; per-circuit podium
tower cam anchors; friend-race ceremony.

## Risks

| Risk | Mitigation |
|---|---|
| Double settlement if ceremony re-enters `endRace` | Classify/award once; ceremony only gates visibility + input. |
| `js/game.js` ratchet | Extract `RaceCeremony`; game.js only calls `ceremony.start(order)`. |
| Mobile cost if ResultsCam forced on | Explicit frozen-frame path; never flip `enabled()` on for tier≥2 without evidence. |
| Existing `__apex.finishRace` callers expect instant results | Default preserves today; opt-in ceremony flag. |
| Soft-lock without SKIP | Every phase has SKIP/CONTINUE; Esc policy documented in slice 1 (likely = SKIP). |
| Podium without three finishers | Skip `podium` phase; go `parcFerme` → `results`. |

## Decision log

- **2026-10-16 (issue #1584):** plan-first; no code before this note.
- **2026-10-27/28 (this plan):** reuse ResultsCam + ResultsStory; defer sheet
  show; mobile = timers + freeze; manual pit mini-game deferred; Closes #1584
  on plan merge; build = new sub-issues.

## Open questions (defaults if unanswered)

1. Cooldown length: **one lap or 45 s wall, whichever first**, plus pit shortcut —
   change only with a measured feel pass.
2. Does practice keep today's instant results? **Yes** (eligibility off).
3. Should season “NEXT ROUND” appear only after `results`? **Yes** — do not put
   championship navigation on the podium overlay.
