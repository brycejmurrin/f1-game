---
name: agent-view
description: The text-native way to perceive and DRIVE the Apex 26 F1 game as an LLM agent — no screenshots. The window.__apex agent-view API (world/field/trackInfo/scene/atmosphere/describe/query/carView/render/survey/rollout/objective/terminal/seed/agentHelp) and the tools/agent.mjs CLI compose the ~90 debug hooks into one egocentric, typed, compact surface. Use this whenever you need to "see" or "drive" the game without eyes — read the car's situation, understand the track/scenery/car as JSON, run a closed-loop driving policy, reproduce a run deterministically, or check what winning even means. Triggers - "let the agent drive", "perceive the game as text", "what does the car see", "drive a lap headless", "agent world view", "world() / field() / rollout()", "read the track as JSON", "play the game without screenshots", "reproduce this run", "what is the agent trying to do".
---

# Agent view — perceive and drive the game as text

**TL;DR** — Perceive and drive Apex 26 as text, no screenshots. From a shell:
`node tools/agent.mjs <track> <tool> [flags]` (it stages `race`/`go`/`jump` +
frames for you). In-page: `window.__apex.<tool>(...)`. Read `agentHelp()` +
`objective()` once, then loop `world({detail:"drive"})` → decide →
`act(...)`/`rollout({policy})` → `terminal()`. Pin `seed(n)` for a **field** A/B
(`go()` races; it's a no-op for a solo `reset()`). Failures are typed
(`{ok:false, error, message, fix}`), never `null` — but two reads fail *quietly*
instead: `scene()` on a street circuit still building props returns a SUCCESSFUL
empty list, and `visible()`/`render({what:"view"})` reuse the last **rendered**
frame. Stage first (see Staging) — an empty scene means "not built yet", not
"nothing there".

`window.__apex` composes the ~90 raw debug hooks into one small surface that is
**egocentric** (framed around the car), **typed** (failures are `{ok:false,
error, message, fix}`, never `null`), **compact** (returns an identifier, not a
whole record), and **self-describing** (`agentHelp()` is the manifest,
`objective()` is the game). LLMs drive *worse* from an image than from structured
text (BALROG, VideoGameBench) — so use these, not screenshots.

Two ways in — same surface, different cost:
- `node tools/agent.mjs <track> <tool> [flags]` from a shell — it does the
  `race`/`go`/`jump` + render-frames staging correctly so you don't hand-roll it.
  **Each call boots its own browser (~30–40 s)**, so it is one read per boot:
  great for a single question, wasteful for many. Don't chain several in one
  shell command — they run serially and blow your timeout. If you parallelise,
  cap it at **2–3 background jobs**: rendering is CPU-side (SwiftShader), so more
  browsers starve the box and reads stall for minutes. A few CLI subcommands are
  **renamed** from the in-page tool — `trackInfo`→`track`, `carView`→`car`,
  `worldModel`→`model`, `agentHelp`→`help`; `terminal`/`seed` are in-page only.
  Run `agent.mjs` with no args (or `-h`) for the exact list.
- `node tools/apex-eval.mjs <track> "<expr>"` — boots once and evaluates one
  expression where `a` = `window.__apex`. The door for **anything past a single
  read**: a multi-call sequence, a custom driving policy, a seeded A/B. Batch
  reads into one expression (`JSON.stringify({x:a.world(), y:a.field()})`) and pay
  one boot instead of N. Catch: it stages `race()` only, so prop-dependent reads
  (`scene`/`query`/`describe(prop:…)`) come back empty until frames draw — stage
  and render inside the expression, or use the CLI, which does it for you.
- `window.__apex.<tool>(...)` inside a live page (Playwright `page.evaluate`, the
  browser console) when you already have one open. **Nothing is readable until
  you stage** — `race(id)` → `go()` → `jump(frac, speed)`, then let two frames
  draw. Skip it and you get a `PlayerNotPlacedError` at best, a stale camera at
  worst. Full rules in Staging, below.

Two words used throughout: **`frac`** is position round the lap as 0→1, and
**`s`** is that same position in metres along the centreline (0 → `track.total`).
`lateralM` is metres from the centreline, + to the right.

**Start every session with `agentHelp()` and `objective()`.** The first names
the whole surface and a `fields` glossary (what each number means in terms of
*what to do about it*); the second says what the game is — win condition, the
trade-offs (track limits, ERS, overtake window, parts budget), the constraints.
Read both once; do not re-fetch per tick.

## The tools, by the question they answer

**Where am I? (dynamic — read per decision)**
- `world({detail})` — the spine. `brief|drive|full`. `drive` adds the corner
  sequence, `pacenotes` (rally-style road ahead), rivals, affordances, ERS and
  penalty state, the ideal-line-free honest geometry to choose a line from.
  `world({since:seq})` returns only what *changed* since a prior payload.
- `field({detail})` — the whole grid: race order, gaps, interval, AI pace.
- `scene({radius, kinds, limit} | {visible})` — named scenery by distance +
  bearing (radius around the car), or `{visible:true}` for the camera's on-screen
  list. Rows land in `props` (plus `lamps`); `counts.inRadius` is how many were in
  range and `truncated` flags that `limit` clipped the list — check it before
  concluding something isn't there. A row's `side` is
  EGOCENTRIC (which side of your nose, from `bearingDeg`); its `trackSide` is the
  CENTRELINE side — the one `worldModel()`/`describe()` report — so cross-reference
  the same prop between tools by `trackSide`, not `side`.
- `atmosphere()` — the light as prose: day/night, sun/moon, floodlights, fog
  visibility, wet road.

**What is this place / thing? (static — fetch once)**
- `worldModel({detail})` (CLI `model`) — the WHOLE circuit as ONE document:
  repeated dressing clustered into features, named landmarks with sizes, barrier
  spans, and a corner-by-corner walk (`dir`/`radiusM`/`severity` only — for
  banking, signed `k`, gradient/elevation, kerbs and apex speed, pull
  `trackInfo({what:"corners"})` and join by turn id). `summary|sections|full`.
  The first call for "understand a place I can't see."
- `trackInfo({what})` (CLI `track`) — corners (with signed `k` and `bankingDeg`) /
  sectors / elevation profile; grounded in the real circuit (`gp`, `realLengthKm`,
  `lengthErrorPct`).
- `carView({detail})` (CLI `car`) — the car as JSON: team, the CHOSEN parts spec +
  net `mods` multipliers, measured geometry. `detail:"parts"` adds per-part boxes —
  the ~19 MESH components (wheels, wings, halo…), NOT the 8 upgrade categories; it
  reads the current loadout, not the catalog of options — to CHOOSE a build, read
  `Parts.CATALOG` (cost + stat multipliers per option) from `js/car/parts.js`, and
  verify a candidate in-page with `Parts.getMods(setup, teamEngine)`/`Parts.getCost`.
- `objective()` — what the game is (see above).

**Drill down (pull, never dump)**
- `describe(id)` — everything about ONE thing: `prop:1980`, `corner:T3`,
  `car:4`, `span:2`. Ids come from the list rows.
- `query({kind, near, fromS, toS})` — a bounded slice as prototype + instances
  (6 pines cost ~1 KB, not 6 records), and it reports what it withheld.

**Show it (optional)**
- `render({what})` — a visual aid. `view`/`map` are APPROXIMATE character-grid
  rasters (composition/debugging, not geometry — a glyph grid reads worse than the
  numbers it is drawn from); `circuit`/`car` just route to the structured
  `worldModel`/`carView` payloads. Prefer the numeric tools to measure anything.

**Act & check**
- `rollout({seconds, policy|input})` — drive an interval at `policyHz` (default 10,
  physics still steps every tick), get a DIGEST (speed min/max/mean, off-track
  events, min clearance, per-corner min speed, terminal reason), not every frame.
  `policy` is `world => {steer,throttle,brake}`; use `world()`+`act()` for a single
  decision instead.
- `terminal()` — `{done, reason}`: finished | wrong_way | rescued. Check it
  between rollouts: `rescued`/`wrong_way` means the car was picked up and put
  back, so lap timing and any distance you were accumulating are no longer
  comparable. Start a fresh episode with `reset(frac, speed, x, seed)` rather
  than driving on from a rescued state — `__apex.resetPlayer()` forces the
  rescue immediately if you want to stop fighting a beached car.
- `survey({stations, lats, reachM, limit, profile})` — geometry DEFECTS for track
  authoring, not driving: 8 buckets (floating/buried props, `overVoid`, terrain
  holes/cliffs, terrain-through-road, props over the line). Its
  `propsOverRoadCandidates` are BROAD-PHASE — a large `lateralM` is a bounding-box
  false positive, not a prop on the line. The payload self-documents (read
  `thresholds.note` and `authoritative`).
  **It always scans the WHOLE lap and cannot be aimed at one corner** — `stations`
  is a sample *count*, not a position, so to study one stretch raise it and filter
  the rows by `frac`. CLI flag is `--stations <n>` (`--at` stays the staging
  fraction). Why that is, and why `groundY()` is not an independent check of a
  hit, are in `docs/DEBUG-HOOKS.md` → `survey()`.

## The driving loop

Action space: `{steer, throttle, brake}`. `steer` ∈ [−1,1], **+1 = full right
lock** (matches `+k`); `throttle`/`brake` are **booleans** (any truthy = full, so
`throttle:0.5` is full throttle, not half). `act(input, dt, n)` applies it for `n`
ticks; `rollout({policy})` calls your policy repeatedly.

```
objective()                       // once — what winning is
trackInfo({what:"corners"})       // once — the static map
loop:
  w = world({detail:"drive"})     // where am I, what's ahead
  act(policy(w), dt, n)           // or rollout({seconds, policy})
  terminal().done ? stop : repeat
```

A runnable starter policy — nulls heading error, recentres, brakes for the corner:

```js
policy = w => {
  const e = w.ego, nc = w.nextCorner;
  const off = Math.abs(e.lateralM) > (e.halfWidthM || 6);  // in the grass?
  let steer = -e.headingErrDeg*0.045 - e.lateralM*(off ? 0.12 : 0.045);  // recentre HARDER off-track
  steer = Math.max(-1, Math.min(1, steer));
  const tgt = nc ? nc.apexSpeedKph/3.6*0.75 : 55;          // aim WELL under — hints are optimistic
  const braking = nc && e.speed > tgt && nc.distM < nc.suggestBrakeM*3.0;
  return { steer,
           throttle: off ? e.speed < 15 : !braking,        // off-track: crawl, don't spin in the grass
           brake: braking && !off };                       // brake WELL before the hint
};
```

`apexSpeedKph`/`suggestBrakeM` assume more grip than default parts have — brake
well before the hint and aim under the apex speed, then tune from the digest's
`offTrack.pct` and `cornerMinSpeedKph`. It is a starting point, not a
steady-state-stable controller: a short interval can legitimately end with the
car off-line mid-recovery, so judge it by the digest *trend* — `offTrack.pct`
plus the per-sample `speedKph`/`lateralM` trail — and not by wherever the last
sample happens to land. **The single biggest lever is not in the snippet above:
add a flat speed cap** (never exceed some fixed m/s *anywhere*, not just inside a
corner's brake window). Corner-relative braking alone, however early, cannot save
an entry the straight already over-fed — a measured Monza lap needed a ~33 m/s
governor plus much harder braking than the constants above (which get rescued
within 5-40 s on the fast corners). Slow and finishing beats quick and beached.
**Fix braking FIRST:** on a too-hot entry
the car washes wide and beaches (the baseline would then hold throttle in the
grass and stall for the rest of the interval — hence the off-track crawl above),
and turn-in does nothing until entry speed is right. Once it is, add a small
feed-forward toward `nc.dir` (∝ `1/nc.radiusM`) to sharpen turn-in. Two gotchas
the loop above hides:
- **`rollout`'s policy receives `world({detail:"brief"})`** — which carries `ego`
  and a single `nextCorner` but NOT `pacenotes`/`rivals`/`nextCorners`. Reading
  those inside a rollout policy returns `undefined`; call `world({detail:"drive"})`
  yourself between decisions if you need them.
- **`rollout` runs the full `seconds` regardless of a terminal event.** A rescue
  or wrong-way lands in `digest.terminal` but does not stop the interval (the car
  keeps being simulated, often stalled). Shorten `seconds`, or gate in the policy,
  to end on the event. Only the FIRST event is reported — a second rescue in the
  same window is invisible, so scoring an interval off `digest.terminal` alone
  undercounts incidents. Cross-check `offTrack.events`.
- **`brake:true` at a standstill drives you BACKWARDS.** Below walking pace the
  brake becomes reverse (deliberate — it lets a human ease off a wall). A natural
  "brake whenever clearance is low" rule therefore reverse-loops against the
  barrier: speed oscillates roughly +60/−18 kph for a minute while lap distance
  barely moves. Gate it — `brake: braking && e.speed > 3`.

An LLM can't decide at 60 Hz — that is what `rollout({policy})` is for: a lap from
one call. Use `world()`+`act()` only for a single decision.

## Determinism — pin the seed before any comparison

The simulation is seeded. `seed(n)` sets it; `reset(frac, speed, x, seed)`
reproduces an episode exactly — **same seed + same inputs ⇒ same result**, and
`world({full}).session.seed` makes a snapshot self-describing (replay it with
`reset(...,seed)`). Cosmetic randomness (particles, camera shake) is deliberately
unseeded so it can never perturb the sim.

**`seed(n)` must come before `race()`, not just before `go()`.** The AI grid —
start order, lane jitter, driver skill — is drawn from the seeded stream inside
`race()`/`tt()`, and `go()` only drops the lights. Seeding between `race()` and
`go()` (the natural spot, given the staging order below) applies one race too
late and silently does nothing: measured across isolated processes, seeds 777 and
888 set *after* `race()` produced a byte-identical grid, while the same seeds set
*before* `race()` diverged. `reset(frac, speed, x, seed)` is the exception — it
applies the seed before rebuilding the grid, which is why it takes an arg at all.

**What the seed actually controls: the AI field, not a lone car.** A `reset()`
episode is *solo* — no live field — so with fixed inputs it is already
deterministic and the seed there is a **no-op** (verified: seed 1 vs 2 → identical
digests). `reset()` re-solos **even after a `go()`**, so its seed arg is inert in
ANY reset()-based path; the seed only bites when you drive the live field directly
— `go()` then `act()`/`rollout` with **no `reset()` between**. So: A/B the player's
own dynamics with a solo `reset()`+`rollout` (seed irrelevant); A/B field-dependent
behaviour from a `go()` race, no reset.

**A physics A/B uses `setPhysics({...})`** — whose keys are lowercase camelCase
(`pace, drift, frontGrip, playerGrip, roadFollow, wheelbase, expo, maxSlip,
speedRef, yawDamp, yawInertia`), NOT the uppercase constant names (`PACE`,
`FRONT_GRIP`) from the Physics reference. **Unknown keys are silently ignored** —
the one hook with no typed error — so a mistyped key looks like "the tweak did
nothing." Confirm it took from the object `setPhysics` returns; `physState()` does
not carry these params.

## Staging (the sharp edges the CLI handles for you)

In-page you must stage before reading, or you get plausible-but-wrong answers:

```js
__apex.race("monza"); __apex.go(); __apex.jump(0.1, 55);  // load, start, place
// obs()/physState()/world()/describe() need player.px — jump() or one step() first
// jump() moves ONLY the player — it DESYNCS you from the AI field (a forward
//   jump lands you P1 with the pack seconds behind). To race/overtake, drive
//   from the grid after go() without jumping ahead (you start ~P12, mid-pack).
//   aiPlace(idx, frac, speed?, x?) moves an AI car by cars[] index and REFUSES
//   the player index; to sit up-to-speed in a pack, jump() yourself, THEN
//   aiPlace the RIVALS around your frac.
// visible()/render({what:"view"}) read the LAST RENDERED frame — let frames draw
// scene() reads placed props — a heavy street circuit (Singapore, Monaco, Baku)
//   finishes its prop build a few frames after race(); an empty scene() means
//   "not built yet", not "nothing there" — let frames draw, or just re-call it
```

`node tools/agent.mjs monza world --detail drive` does all of this for you.
**`apex-eval` does not** — it boots and calls `race()` only, so a player-placed
tool returns a not-placed error until you stage inside the expression:
`node tools/apex-eval.mjs monza "(a.go(), a.jump(0.1,55), a.world())"`.

You rarely need to memorise this, because **the errors tell you the fix.** Every
agent-view failure is `{ok:false, error, message, fix, state}` — `fix` names the
exact call to make (`"call __apex.jump(frac, speed) first"`,
`"props are indexed 0..2834; call scene()/query()"`) and `state.playerReady`
says whether you are staged. Read `fix` and do what it says; the surface is
built to be driven by its own error messages.

## Reference

- `docs/DEBUG-HOOKS.md` → "Agent world view" — the full per-tool reference (every
  field, every option, the typed errors).
- `docs/AGENT-WORLD-API.md` — the design and the research behind each choice.
- `__apex.agentHelp()` — the live manifest, including the `fields` glossary and
  the `read`/`control` sections listing the raw hooks and the drive/stage verbs.
- Tests: `npm run test:agent` (`tests/agent-view.spec.js`,
  `tests/agent-drive-bench.spec.js`, `tests/agent-determinism.spec.js`).
