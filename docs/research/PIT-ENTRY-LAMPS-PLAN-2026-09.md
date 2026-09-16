# Two coloured lamps flanking the pit entrance — plan (2026-09-16)

> Plan only; nothing built. Every claim carries a `file:line` against the tree
> at `8d3604596`. Companions: `PIT-LIGHTING-PLAN-2026-09.md` (the canopy
> luminaires and the exit signal — this plan reuses that pipeline end to end),
> `PIT-LANE-REDESIGN-2026-09.md` (the complex's model), `PIT-GUIDANCE-STRATEGY-PLAN-2026-09.md`
> (the HUD's cue, which these lamps are the world-side twin of).

## 1. Goal

A driver arriving at the pit entrance at night sees two lit, coloured lamps
standing one on each side of the entry road's mouth — a gate — and by day the
same two posts with their coloured heads. The colour is the PIT ENTRY signal:
green while the lane is open, red while it is closed (a red flag), and it is
the same on both posts so the pair reads as one instruction from 300 m out,
where the HUD's cue starts counting down (`js/race/pit-lane.js` `CUE_M` 550).
Both lamps carry a real light record so the peel-off is lit from a fixture the
player can see, the rule every lamp in the engine holds (`docs/SCENERY-API.md:124`
"no light without something visible emitting it").

## 2. Facts (verified)

**Where the entrance is.** `TrackPit` (`js/track/core/pit.js:201-210`) gives the
entry road as `sA → sIn` (`entryRoadM`, 70 m on Bahrain, shorter where the room is
short), peeling off the road's pit side (`side` ±1). Along it the lane's inner
edge IS the road edge (the wall grows only over the last `grow` metres,
`:211`, `:244-245`), so at `sA` the entry road's tarmac begins at `hw` and its
outer edge is `hw + off.fastIn + bands.fast` (`p.off`, `p.bands`;
`pits.js:211` uses `hwAt(p.sIn) + p.off.fastIn + p.bands.fast / 2` for the fast
lane's centre). The peel is what `js/race/pit-lane.js roadOf(c) === "entry"`
(`:634-641`) reads, and where the cue now says HOLD THE LANE (§3 of the
guidance plan, built at `8d3604596`).

**What already stands there.** `SceneryPits.build` (`js/track/scenery/pits.js`):
cones every 8 m on the road's pit-side edge from `sA + 6` until the wall's fade
begins (`:288-296`, `hw + 0.45`, `DARK`/`CONE`/`CBAND`); two "PIT ENTRY" boards
walked back from `sA` by `SIGN.boardM` [45, 110] (`:338-345`) on the verge at
`hw + 0.3 + boardW/2`, kept clear of the barrier and of any single-object prop
via `track.props` (`clear`, `:327-337`); the "PIT LANE <limit>" board on the
platform at the entry line (`:347`); the EXIT signal at `sOut` (`:349-361`): a
0.16 m `POST` 3.6 m tall, a `DARK` head, two 0.28 m aspects painted over-white
green `[0.30,1.40,0.45]` / dark red `[0.30,0.06,0.04]` at night, plain by day —
**no light record**, by design ("a halo would be 2 m wide on a 28 cm lamp",
`:357`). Nothing marks the ENTRY with a light: the boards are unlit signs.

**The lamp pipeline the pits pass already uses.** `ctx.registerLamp` is
`registerPitLamp` (`js/track/tracks.js:2021-2025`, cap `PIT_LAMP_CAP`, kind
forced to `led`, tag `pit`), whose records are appended to `track.lampPosts`
after the build (`:2252`) and baked by `TrackLights.buildTrackLights`
(`js/lighting/track-lights.js:193`). A record takes `pos/k/side/radius/energy/
aimAt` (`:2000-2003`); `aimAt` redirects the cone but the energy formula measures
throw to the racing road's near lane (`track-lights.js:352-364`, `:377-379`) — a
lamp 2 m off the road edge at 3.6 m needs no `energy` correction (the canopy's
soffit did, at 16 m: `energy 0.04`). `LAMP_KINDS.led` is 5000 K white
(`track-lights.js:56`, `col [0.92, 1.00, 1.15]`, `glareW 0.7`): **there is no
coloured kind**, and `registerPitLamp` overrides `kind` to `led` anyway. A record
with `glareW > 0` draws a lens-halo billboard, so it must sit within 1 m of a
drawn fixture (`tests/unit/lamp-fixture-anchor.test.mjs:67`, `ON_FIXTURE_M`).
Lamps are fed only in a flood-active session (night/dusk/dawn, `game.js:2208`)
or with DAYTIME LAMPS up; the per-frame cull keeps the nearest 48 (40 with
traffic, 24 mobile) — six canopy slots are already the complex's
(`pits.js:461-463`).

**Colour at night without a record.** Any over-white vertex colour in the props
mesh glows at night (`game.js:6182-6184` sets `floodEmit`; `glsl-lit.js:1606-1627`
adds `smoothstep(0.50, 0.95, max(albedo)) × emissive`) — that is how the exit
signal's green aspect, the bays' LED strips (`pits.js:480`) and the door neon
(`:497`) read as lit. It is BUILD-time: the aspect that glows is chosen when the
track is built (`night` in `ctx`, `pits.js:38`), so a signal that changes with
the race (red under a red flag) cannot come from the props mesh
(`PIT-LIGHTING-PLAN` §8.3).

**A per-frame coloured draw exists.** `PitSigns.draw` (`js/garage/pit-signs.js:161`,
called every frame from `game.js:7131` after the sky, gated by distance to the
row) draws `track.pitSigns` — the fascia cells, the boards, the panels and the
crests — as ONE textured decal from a canvas atlas (`TrackPit.SIGN`,
`pit.js:41-57`: 1024², `cells 12`, `boards 2`, `crests 12`). A quad added to
`track.pitSigns` costs nothing per frame beyond its two triangles; the atlas has
free rows below the crests (`crestY 512` + 2 rows of 160 px = 832 of 1024).

**Race control's state.** `G.cautionInfo()` (`js/race/race-control.js:68`,
`:119`, `:270`) carries `level` (0 green … 4 red flag, `LABEL`); `PitLane.estimate`
returns null at level ≥ 4 (`pit-lane.js:470-471`) — the lane is closed under a
red flag already, in the model; nothing in the world says so.

**Tests that count.** `tests/unit/pit-complex.test.mjs:386-412` asserts exactly
six `pit`-tagged lamps per circuit, all `led`, on the row, at the soffit height —
a new pair must be excluded from that count by a field or the test re-cut.
`tests/unit/pit-signs.test.mjs` indexes the decal's quads in order (fascias,
boards, panels, crests) — a signal quad goes AFTER the crests. The clip, float
and coplanar audits (`tools/track/{clip,float,coplanar}-audit.cjs`) run on the
deploy gate; the exit post passes them today (a post standing on `at(k, lat, 0.35)`
with its head 1.8 m up, `:350-353`).

## 3. What the real thing looks like

At an F1 pit entry there is no coloured lamp pair as such: the pit-entry
gantry carries the "PIT ENTRY" board, a light panel shows the lane's state (green
open / red closed) at the entry and again at the exit, and the pit straight's
floodlights light the peel. What is asked for here is a game reading of that: a
lit gate the driver can aim at from a distance, coloured with the lane's state.
Two posts, one each side of the road's mouth, are the clearest form of it —
the same form as the exit signal the complex already stands at `sOut`.

## 4. Design

**A. Two posts at the mouth.** In `SceneryPits.build` §2 (after the boards,
before the exit signal), when `p.v[kOf(p.sA)] < 0.5` and the entry road is real
(`!p.painted`, `entryRoadM > 20`):

| post | arc | lateral (× `sd`) | why there |
|---|---|---|---|
| road side | `sA − 2.5` | `hw + 0.45` | the cone line's own offset, just BEFORE the tarmac begins, so it stands on the verge, not on the peel |
| far side | `sA + 6` | `hw + off.fastIn + bands.fast + 0.6` | beyond the entry road's outer edge, 6 m in so the road has width there (the peel eases out from 0) |

Each is the exit signal's own geometry (`:350-353`): a 0.16 m `POST` 3.6 m
tall on a 0.35 m foot, a `DARK` head, ONE 0.28 m aspect facing the oncoming
driver (along `−t`, as the boards face, `:102`), and — new — a second, smaller
aspect on the head's lane face so a car already on the peel sees it too. Both
posts are `clear()`-checked against the barrier and `track.props` like the
boards, and skipped rather than placed through something.

**B. Colour = the lane's state, at build time AND live.**

1. *Build-time (props mesh):* the aspect is painted green over-white at night
   (`[0.30, 1.40, 0.45]`, the exit signal's own) and plain green by day. This is
   what every circuit gets on day one and what the headless audits see.
2. *Live (the signs decal):* one 0.28 × 0.28 m quad per aspect appended to
   `track.pitSigns` after the crests, with UVs into a new `SIGN.signal` row of
   the atlas (two 64 px cells: GREEN and RED, painted by `PitSigns` next to the
   crests). `PitSigns.draw` picks the cell by `G.cautionInfo().level >= 4` — the
   decal is drawn every frame already, so the aspect turns red under a red flag
   and back, with no new draw and no new uniform. The painted aspect under it
   stays green; the decal sits 1 cm proud (the crests' own idiom, `emitCrest`).
   The exit signal's two aspects join the same mechanism (`PIT-LIGHTING-PLAN`
   §8.3 closed).

**C. Two light records.** `ctx.registerLamp({ pos: head, k, side: sd, kind: "led",
radius: 14, aimAt: peel })` per post, `pos` at the aspect (so the halo billboard
sits on a drawn fixture, `lamp-fixture-anchor`), `aimAt` at the entry road's
centre 15 m down the peel so the cone lights the tarmac a driver is being asked
to take. `led` is white: the COLOUR of the pool is the lamp kind's, and adding a
`signal_green` kind to `LAMP_KINDS` (`col [0.55, 1.25, 0.70]`, `glareW 0.5`,
`eMul 0.6`) is the honest way to get a green pool — but `registerPitLamp` forces
`led` (`tracks.js:2024`). Two options:

   - (a) *Keep the pool white, colour the head.* The halo is drawn from the
     record's colour (`glx.js:2415-2446`), so a white record under a green
     aspect reads as a white lamp with a green lens — like a real signal on a
     floodlit straight. Zero pipeline change. **Recommended.**
   - (b) *A `kind` field on the pit registrar* (`registerPitLamp` passes
     `spec.kind || "led"`), and the `signal_green` kind. The pool goes green on
     the tarmac. Costs a kinds-table row, a test in `track-lights` for the new
     kind, and a night frame to judge it — the green pool may read as grass.

   Either way `radius 14` and default energy: 2 m off the road at 3.6 m the
   formula's `al` is ~2.5 m, and the pool lands on the peel and the road edge.
   Two of the 48 slots while the car is on the pit straight; the cull drops them
   with distance elsewhere, like the canopy's six.

**D. The tag.** The records carry `entry: true` alongside `pit: true` so
`pit-complex.test`'s "six canopy luminaires" reads `pit && !entry` and a new test
counts the pair.

## 5. Tests

- `tests/unit/pit-complex.test.mjs`: "two entrance lamps stand one each side of
  the entry road's mouth" — on FULL and LEFT builds, two `entry`-tagged records;
  the road-side one within 3 m before `sA` at `hw + 0.45 ± 0.2`; the far-side
  one 4–8 m past `sA` beyond `hw + off.fastIn + bands.fast`; both 3.4–3.9 m
  up; `aimAt` on the entry road (lateral between `hw` and the outer edge,
  10–20 m past `sA`); each within 1 m of a props-mesh box (the anchor rule,
  reusing `lamp-fixture-anchor`'s walk). The six-luminaire test re-cut to
  `pit && !entry`.
- `tests/unit/pit-signs.test.mjs`: after the crests, two (or four, with the
  exit signal's) SIGNAL quads, 0.28 m, facing `−t`, UVs inside `SIGN.signal`'s
  GREEN cell; the painter reports the two new cells; `PitSigns.draw` with a
  stubbed `cautionInfo` at level 4 binds the RED cell (a `uvOffset` or a second
  index range — whichever the decal path already has; if neither, the quad's UVs
  are rewritten in place before upload, which the texMesh upload already does
  once per frame for nothing else — measure first).
- `tests/unit/pit-lane.test.mjs`: nothing — the cue does not change.
- The float/clip/coplanar audits on Bahrain, Monza, Nürburgring, Jeddah
  (painted: no posts), via `node tools/track/verify-track.cjs <id>` then the
  sweeps (`npm run test:sweeps`) on the deploy gate.
- One night shot at the peel (`node tools/shot/shot.mjs bahrain <frac of sA> orbit
  --tod night --dist 30`) and one by day; a `gpu-census.yml` frame on
  `macos-latest` for the halo, as the lighting plan asked and never got
  (`PIT-OPEN-ITEMS-PLAN` §4).

## 6. Cost

`pits.js` ≈ +45 (two posts, two records, the aspect quads), `pit.js` +4 (`SIGN.signal`
row), `pit-signs.js` ≈ +25 (paint two cells, pick one at draw), `track-lights.js` +0
(option a) / +6 (option b), `tracks.js` +1 (option b), tests ≈ +60. Two light slots
on the pit straight. No new hook, no new group; `pit-complex`, `pit-signs`,
`lamp-fixture-anchor` and the sweeps cover it. Order: A + B1 + C(a) + D first
(one commit: the pair exists, lit, green); B2 second (live red under a red
flag), with the exit signal moved onto it in the same commit.

## 7. Open questions

1. Colour by TEAM instead of by state? Asked for "coloured"; the state is the
   only colour that means something at an entrance, and the bays already carry
   the team's. Recommend state; a team tint on the post's shaft is cheap if wanted.
2. Should the far-side post go on the platform's nose where the wall starts
   growing (`sIn − grow`) instead of 6 m down the peel? Further from the mouth,
   but on ground the platform already levels; the 6 m point is on the verge
   the entry road's outer band cuts through — check `p.w`/terrain there on the
   Nürburgring and Zandvoort builds before choosing.
3. Blue flashing on traffic at the exit (real pit exits) — the decal mechanism
   in B2 makes it a third cell and a timer; defer until the red aspect is in.
