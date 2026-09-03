# Agent-view surface — tools, driving policy, staging

Load this when driving a lap, writing a policy, or debugging a typed error. The SKILL.md index is the entry points only.

## The tools, by the question they answer

**Where am I? (dynamic — read per decision)**
- `world({detail})` — the spine. `brief|drive|full`. `drive` adds the corner
  sequence, `pacenotes` (rally-style road ahead), rivals, affordances, ERS and
  penalty state, the ideal-line-free honest geometry to choose a line from.
  `world({since:seq})` returns only what *changed* since a prior payload.
- `field({detail})` — the whole grid: race order, gaps, interval, AI pace.
- `scene({radius, kinds, limit} | {visible})` — named scenery by distance +
  bearing. **`radius` is omnidirectional around the car**, NOT "metres ahead" —
  `scene({radius:80})` collects props within 80 m in every direction. For the
  road ahead use `world({detail:"drive"}).pacenotes` / `.ahead`. Or
  `{visible:true}` for the camera's on-screen list. Rows land in `props` (plus
  `lamps`); `counts.inRadius` / `truncated` flag clipping — check before
  concluding something isn't there. **Cross-reference props by `trackSide`, not
  `side`:** `trackSide` is centreline-left/right; `side` is egocentric (+ =
  your right).
- `atmosphere()` — the light as prose: day/night, sun/moon, floodlights, fog
  visibility, wet road.

**What is this place / thing? (static — fetch once)**
- `render({what:"circuit", detail})` (CLI `model`) — the WHOLE circuit as ONE
  document:
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
  the ~19 MESH components (wheels, wings, halo…), NOT the 12 upgrade categories; it
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
  circuit-document/`carView` payloads. Prefer the numeric tools to measure anything.

**Act & check**
- `rollout({seconds, policy|input})` — drive an interval at `policyHz` (default 10,
  physics still steps every tick), get a DIGEST (speed min/max/mean, off-track
  events, min clearance, per-corner min speed, terminal reason), not every frame.
  `policy` is `world => {steer,throttle,brake}`; use `world()`+`act()` for a single
  decision instead.
- `terminal()` — `{done, reason}`: retired | finished | wrong_way | rescued. Check it
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
lock**; note `+k` is a **LEFT**-hand turn, so full right lock is toward `-k`.
`throttle`/`brake` are **booleans** (any truthy = full, so
`throttle:0.5` is full throttle, not half). `act(input, dt, n)` applies it for `n`
ticks; `rollout({policy})` calls your policy repeatedly.

```
race("monza"); go(); jump(0.008, 70)   // Monza T1 — ~frac 0.008, ~70 m/s entry
                                      // STAGE FIRST — without this every read
                                      //   below returns PlayerNotPlacedError
objective()                       // once — what winning is
trackInfo({what:"corners"})       // once — the static map
loop:
  w = world({detail:"drive"})     // where am I, what's ahead
  act(policy(w), dt, n)           // or rollout({seconds, policy})
  terminal().done ? stop : repeat
```

A runnable starter policy — nulls heading error, recentres, brakes for the corner:

```js
const CAP = 33;                    // m/s — a FLAT cap, everywhere, not just in corners.
                                   //   This is the lever that makes the rest work; raise it
                                   //   once you finish laps, don't remove it.
const policy = w => {
  const e = w.ego, nc = w.nextCorner;
  const off = Math.abs(e.lateralM) > (e.halfWidthM || 6);  // in the grass?
  let steer = -e.headingErrDeg*0.045 - e.lateralM*(off ? 0.12 : 0.045);  // recentre HARDER off-track
  steer = Math.max(-1, Math.min(1, steer));
  const tgt = nc ? nc.apexSpeedKph/3.6*0.5 : 40;           // aim WELL under — hints are optimistic
  const hot  = nc && e.speed > tgt && nc.distM < nc.suggestBrakeM*6.0;  // brake EARLY
  const fast = e.speed > CAP;                              // over the governor anywhere
  const braking = hot || fast;
  return { steer,
           throttle: off ? e.speed < 15 : !braking,        // off-track: crawl, don't spin in the grass
           brake: braking && !off && e.speed > 3 };        // >3: below that, brake REVERSES
};
```

**Why `CAP` carries the policy.** `apexSpeedKph`/`suggestBrakeM` assume more grip
than default parts have, and corner-relative braking — however early — cannot
rescue an entry the preceding straight already over-fed. Without the governor the
same policy gets rescued within 5-40 s on Monza's fast corners; with it, a
measured lap completes. So **fix entry speed before anything else**: until it is
right, turn-in does nothing, the car washes wide and beaches, and the off-track
crawl above is all that stops it stalling there for the rest of the interval.
Once laps complete, raise `CAP`, then add a small feed-forward toward `nc.dir`
(∝ `1/nc.radiusM`) to sharpen turn-in.

Tune from the digest's `offTrack.pct` and `cornerMinSpeedKph`. This is a starting
point, not a steady-state-stable controller — a short interval can legitimately
end with the car off-line mid-recovery — so judge it by the digest *trend*, not
by wherever the last sample lands. Three gotchas the loop above hides:
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

An LLM can't decide at 60 Hz — that is what `rollout({policy})` is for.
**`seconds` is clamped to 120**, silently — ask for 300 and you get 120, which
reads as "my policy stalled" when it merely ran out of interval. One lap of Monza
at the pace above takes ~200 s, so a lap is 2-3 chained `rollout()` calls, not
one; carry your own distance/lap total across them and check `terminal()` between
each. Measured with the policy above: ~10.5 km over three 120 s calls, no rescue,
~7 % off-track. Those figures are illustrative, not reproducible to the digit —
the recipe drives a live AI field and pins no seed, so your run will differ.
Pin `seed(n)` before `race()` if you need to compare two runs.
**Reaching `finished` takes a real race.** The default is 3 laps, so ~600 s —
five-plus chained calls. `setLap(n)` only moves the counter: `finished` is set
by the line-crossing handler, so you must still drive across the line after it.

## Determinism — pin the seed before any comparison

The simulation is seeded. `seed(n)` sets it; `reset(frac, speed, x, seed)`
reproduces an episode exactly — **same seed + same inputs ⇒ same result**, and
`world({detail:"full"}).session.seed` makes a snapshot self-describing (replay it with
`reset(...,seed)`). Cosmetic randomness (particles, camera shake) is deliberately
unseeded so it can never perturb the sim.

**`seed(n)` must come before `race()`, not just before `go()`.** The AI grid —
start order, lane jitter, driver skill — is drawn from the seeded stream inside
`race()`/`tt()` (`tt` is the time-trial entry point — it stands in for
`race()`+`go()`), and `go()` only drops the lights. Seeding between `race()` and
`go()` (the natural spot, given the staging order below) applies one race too
late and silently does nothing: measured across isolated processes, seeds 777 and
888 set *after* `race()` produced a byte-identical grid, while the same seeds set
*before* `race()` diverged. `reset(frac, speed, x, seed)` is the exception — it
applies the seed before rebuilding the grid, which is why it takes an arg at all.

**What the seed controls.** The stream feeds AI grid order/lane/skill, the
start-lights hold, and per-tick AI overtake decisions. `reset(frac, speed, x,
seed)` applies the seed before `gridUp()`, so a reset-based episode is replayable
with the same seed and inputs; `seed(n)` before `reset(...)` is equivalent when
you do not use the fourth arg. So: A/B the player's own dynamics with
`reset()`+`rollout` and a fixed seed; A/B field-dependent behaviour from a
seeded `race()`/`go()` run or from seeded resets.

**A physics A/B uses `setPhysics({...})`** — whose keys are lowercase camelCase
(the full list is tabled in `docs/DEBUG-HOOKS.md` → `setPhysics`), NOT the
uppercase constant names (`PACE`, `FRONT_GRIP`) from the Physics reference. **Unknown keys are silently ignored** —
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
// scene({visible:true})/render({what:"view"}) read the LAST RENDERED frame — let frames draw
// scene() reads placed props — a heavy street circuit (Singapore, Monaco, Baku)
//   finishes its prop build a few frames after race(); an empty scene() means
//   "not built yet", not "nothing there" — let frames draw, or just re-call it
```

`node tools/shot/agent.mjs monza world --detail drive` does all of this for you.
**`apex-eval` does not** — it boots and calls `race()` only, so a player-placed
tool returns a not-placed error until you stage inside the expression:
`node tools/shot/apex-eval.mjs monza "(a.go(), a.jump(0.1,55), a.world())"`.

You rarely need to memorise this, because **the errors tell you the fix.** Every
agent-view failure is `{ok:false, error, message, fix, state}` — `fix` names the
exact call to make (`"call __apex.jump(frac, speed) first"`,
`"props are indexed 0..2834; call scene()/query()"`) and `state.playerReady`
says whether you are staged. Read `fix` and do what it says; the surface is
built to be driven by its own error messages.

