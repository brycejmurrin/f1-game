> **Dated record (2026-08).** Research notes from the driving-controls
> recalibration, kept for the negative decisions and citations. The status
> column below is as of writing — the code is the authority on what shipped.
>
> Errata: `tools/tune-sweep.mjs` has since been renamed
> `tools/physics-tune-sweep.mjs`.

# Driving controls & assists — what shipped games do, and what it means here

Research notes gathered while recalibrating the pause-menu sliders and the input
layer (the "sliders I don't understand / I always end up at the bottom" pass).
Sources are the F1 24/25 assist and setup guides, EA's own F1 25 accessibility
documentation, and sim-racing forum discussion of speed-sensitive steering.

The point of writing this down is that several of the conclusions are *negative*
— features worth deliberately NOT building — and a negative decision with no
record gets re-litigated every six months.

## What this concluded, at a glance

Sections are unnumbered on purpose: numbering rots the moment one is inserted.

| Decision | Status |
|---|---|
| **Never ship traction control or ABS** — no longitudinal slip model exists for either to act on | Settled. Reopening needs a slip model first, not a menu entry |
| **Braking assist is OFF / CUE / LIGHT / FULL** — starts with information, not intervention | **CUE shipped** (2026-08-18). LIGHT/FULL takeover is still not built |
| **The braking cue is a pulse RATE, not a pitch ramp**, with a player-set lookahead | Designed. Corrects my first instinct |
| **A FULL braking level brakes for corners only**, never to avoid rear-ending | Designed |
| **RACE PACE becomes geometric** — `pace(n) = 1.06^(n-14)`, 19 notches, 6.0 %/notch, default down to 0.84 | **Shipped.** Live boot 2026-08-18: `tuning().pace === 0.84` |
| **Its readout must not be km/h** — `dashKph` divides pace out, so the dial reads ~259 km/h at every setting | Settled |
| **Value-preserving migration is honest** — worst case **2.89 %**, under half a new notch | Verified by calculation, per-notch table in `PHASE-C-SLIDER-DESIGN.md`. Old 9 and old 10 both land on new 18: the one lossy pair, and it must be LOGGED rather than silent |
| **Do not rename the racing-line assist** — already matches the industry's Off/Corners/Full | Settled |
| **Speed-sensitive steering is two halves** — lock taper on SPEED STEER; rate half is Adaptive Buttons, default OFF, not the same knob | **Split-shipped; default now ON (notch 6)** so keys/arrows get the rate half without opening Advanced |
| **SPEED STEER is inert at speed** — was a 1.9-point spread under `max(0.4, 1 − v/ref)` | **Fixed** (hyperbola, ref 15..75). Live 2026-08-18: lock kept @72 dial is 17.2 / 36.7 / 51.0 % (n1/n5/n10) = **33.8 points**. On-tarmac yawRate n10/n1 = **2.94×** |
| **RESPONSE spends its top half below any real wheelbase** — 3.6 m lands at notch 3.6; notches 6-10 run 2.97 → 1.90 m | **Shipped** 4.4 → 2.6 m. Live boot: `tuning().wheelbase === 3.6` |
| **SMOOTHING should map linearly in LAG, not in Hz** — steps run 7.2 ms at one end to 132.6 ms at the other, and the top is 398 ms | **Shipped** 55 → 195 ms |
| **Setup sheet: wing trim / brake bias / suspension**; gears and diff cut | Designed |
| **Brake bias belongs in the friction ellipse**, which currently charges both axles for grip one spends | Designed — highest-risk item |
| **Understeer cue is signalling, not simulating** | **Built** |
| **`js/game.js` had zero `Log` calls** | **Fixed** — one envelope line at race start |
| **Rain spray and launch smoke were pace-broken** — full spray unreachable below pace ~0.8, launch smoke never fired at all at pace 0.5 | **Fixed** (A16), and the lint that found them now runs in `tooling-fast` |
| **The tilt chain, the touch drag and the store migration had no tests** | **Fixed** — `tilt-pipeline`, `touch-steer`, `steer-migration` specs |
| **"The arc must not reach the driver" holds** — swept every `Tracks.curvature`/`kCur` read in `js/game.js` and `js/game/*` | Audited clean. All 12 are AI-only, assist-gated, broadcast, surface, or post-flag. The one that looks wrong is not: `bodyattitude.js` rolls the chassis from `speed × yawRateCur` for HUMAN cars and only falls back to `speed² × kCur` for AI, which has no world heading to compute a real yaw rate from |
| **iOS/iPad platform plumbing is already sound** — `touch-action: none`, `overscroll-behavior: none`, `-webkit-touch-callout`, safe-area tokens, `passive: false` touch listeners, the `DeviceOrientationEvent.requestPermission` gate | Audited, nothing to fix. The iPad gap was input SEMANTICS (absolute-position steering, on/off pedals), which Phase B closed — not the platform layer |

---

## Two assists we should never ship, and the reason is structural

The industry-standard assist list is: steering assist, braking assist, ABS,
traction control, racing line, auto gearbox, pit assist, ERS assist, DRS assist.
Two of those cannot mean anything in this game, and it is worth being precise
about why rather than calling it a scope decision.

**Traction control** exists to solve one problem, stated plainly in the F1 25
guide: *"it can become hard to manage the throttle without spinning your rear
wheels."* Apex 26 has **no longitudinal tyre-slip model at all** — the throttle
adds acceleration directly (`js/game.js`, the `--- integrate speed ---` block)
and there is no wheel-speed state to diverge from ground speed. `DRIFT` also
ships at 0, so the rear axle cannot step out. There is no wheelspin for a
traction-control switch to control.

**ABS** is the same shape. Lock-up exists in this codebase only as `axFrac`,
handed to `DebrisWorld.tyreMarble()` so a hard stop sheds cosmetic marbles. It
never costs grip and never extends a braking distance. An anti-lock switch would
prevent nothing.

Both would be switches that visibly do nothing — worse than their absence,
because a player who enables them and gets no change learns that the settings
menu lies. If either is ever wanted, the prerequisite is a longitudinal slip
model, not a menu entry.

Related: the friction ellipse is deliberately asymmetric in the throttle's
favour (`js/game.js`, the note above `axFrac`), so power-on already costs far
less cornering grip than braking does. That IS the arcade traction forgiveness,
applied silently and for free.

---

## Braking assist: EA ships two different things under one name

This is the most useful single finding, and it changes the design.

- The **gameplay** braking assist "completely takes over the braking for you".
  The guide's own recommendation is to never use it — *"the kind of assist you
  enable when your nan wants to play"* — because it removes so much of the car.
- The **accessibility** braking assist (EA's F1 25 accessibility resources) is an
  **audio cue**: *"a constant tone means hard braking is required"*, escalating
  from beeps for light braking. It takes over nothing at all.

The second is a much better fit for this game's actual failure case. On an iPad
in touch mode the car already auto-throttles, so the thing that loses the corner
is not being unable to brake — it is **not knowing when**. An audio cue answers
that without touching the driving.

So the assist ladder should start with information and only then escalate to
intervention:

| Level | What it does |
|---|---|
| OFF | nothing |
| **CUE** | audio only — a tone that hardens as the corner-entry speed you need approaches. Takes over nothing |
| LIGHT | intervenes only when the corner would certainly be missed |
| FULL | brakes for you |

`GameAudio` already exists and the corner-speed model is already there (the AI's
`vCorner`), so CUE is cheap. It is also the only level that is honestly
recommendable to a player who wants to get better, which is the level most
players should be sitting on.

---

## Forza's Blind Driving Assists — the best-documented prior art there is

Microsoft published the mechanics of Forza Motorsport's Blind Driving Assists in
full, and it is the most useful single source found. Several details change the
design of our audio cue, and several more are worth stealing later.

**The deceleration cue is a PULSE RATE, not a pitch ramp.** This is the detail I
would have got wrong:

> The playback of these cues will vary in **speed** to indicate the **rate of
> deceleration required**. At its fastest speed, players may need to fully engage
> the brakes, while a slower rate may mean you only need to let up on the
> throttle a little.

A repeating tick whose *frequency* encodes how hard you must slow is better than
a tone whose pitch rises, because it separates two things a pitch ramp conflates:
"a corner is coming" and "how much of the car you need to use". It also degrades
gracefully — a slow tick is easy to ignore on a straight, a fast one is
impossible to.

**Lookahead is a player setting, not a constant.** Both the steering guide and
the deceleration cues carry their own adjustable lookahead offset, explicitly so
a player can buy themselves reaction time at some cost in lap time. Any cue we
ship should have the same knob rather than a hard-coded "brake in 60 m".

**Their steering ladder is ours.** Forza: FULLY ASSISTED / PARTIALLY ASSISTED /
NORMAL ("dampens certain physical effects to make driving easier") / SIMULATION
("eliminates any damping and steering speed assistance… counter-steering much
quicker. This mode is difficult with a controller"). Our `STEER_LEVELS` is
`easy / assist / normal / sim` — the same four-step ladder with almost the same
names. Another naming decision to leave alone.

**Their throttle assist exists for fatigue, not for thumbs.** Forza's ASSISTED
throttle "automatically applies throttle, so the driver doesn't need to hold the
input constantly, **reducing muscle tension and fatigue**." Ours
(`autoThrottle()`) is gated on `steerMode === "touch"` with the rationale that
screen-half taps occupy the thumb. Forza's rationale is better and more general:
holding an input for a whole race is tiring on *any* device. Worth considering
un-gating it into an explicit setting available in every mode.

**Braking levels, and an honest downside.** Forza splits FULLY ASSISTED
(brakes for corners *and* to avoid rear-ending other cars) from PARTIALLY
ASSISTED (corners only), and states the cost of the former outright: *"NOTE:
This can make it more challenging to pass other cars."* If we ship a FULL level
it should brake for corners only, for exactly that reason.

**Deadzones are per-axis and player-editable** — steering, acceleration,
deceleration, clutch, handbrake each get their own. That validates exposing a
deadzone per input device rather than the single hidden tilt constant we have.

Worth stealing later, all of which we already have the data for:

- **Track-limit cues** — panned hard left/right, rising in pitch *and* repetition
  as the edge nears, a constant tone when very close, two quick cues when you
  drop out and the same two reversed when you return. We already track
  `c.offroad`, the road half-width and a cut count.
- **Turn navigation** — spoken pace notes graded 1–6 (lower = sharper), plus
  "Hairpin Left" and "Left 3 Long". `__apex.corners()`, `CircuitMarkings` and the
  agent view's `nextCorner.apexSpeedKph` already carry everything this needs.
- **Steering guide by panning** — Forza pans the car's *own* engine and tyre
  audio toward where you should steer, rather than adding a new tone. Cheaper and
  less noisy than a fresh cue, and `GameAudio` already synthesises the engine.

One framing note from the same page, worth keeping: the Blind Driving Assists
"were never intended to be an *easy mode*". Cues that tell you what is happening
are a different category from assists that drive for you, and the settings menu
should not present them as points on one scale.

---

## The RACE PACE slider, measured — the complaint is arithmetic

The report was "overall speed is weighted too high and I always end up at the
lower end". That is not a matter of taste; it falls out of `paceFromSlider`:

| notch | pace | ground top | step from previous |
|---|---|---|---|
| 1 | 0.500 | 130 km/h | — |
| 2 | 0.625 | 162 km/h | **+25.0 %** |
| 3 | 0.750 | 194 km/h | **+20.0 %** |
| 4 | 0.875 | 227 km/h | **+16.7 %** |
| 5 | 1.000 | 259 km/h | **+14.3 %** ← default |
| 6 | 1.060 | 275 km/h | +6.0 % |
| 7 | 1.120 | 290 km/h | +5.7 % |
| 8 | 1.180 | 306 km/h | +5.4 % |
| 9 | 1.240 | 321 km/h | +5.1 % |
| 10 | 1.300 | 337 km/h | +4.8 % |

**The resolution is backwards.** The half below the default moves in 14-25 %
jumps; the half above moves in 5-6 % ones. A player who wants a calmer car is
handed the coarsest part of the control, and there is no setting between "full
F1 pace" and "a third slower". Anyone living at notch 2-4 is choosing between
32 km/h increments.

The fix is a **geometric** scale, so every notch is the same *proportional*
change. Over `0.45 .. 1.35` in 21 notches that is **5.65 % per notch** — the
current top-end fineness, applied across the whole range:

| notch | pace | | notch | pace | | notch | pace |
|---|---|---|---|---|---|---|---|
| 1 | 0.450 | | 8 | 0.661 | | 15 | 0.971 |
| 3 | 0.502 | | 10 | 0.738 | | 16 | 1.026 |
| 5 | 0.561 | | 12 | 0.823 | | 18 | 1.145 |
| 7 | 0.626 | | 14 | 0.919 | | 21 | 1.350 |

**Value-preserving migration is honest here**, which is the thing that had to be
checked before committing to a remap. Mapping each old notch to the nearest new
one by *value* lands within **2.6 % in the worst case** — smaller than the
smallest step the old scale could express (4.8 %), so nobody's car changes
perceptibly on upgrade:

```
old 1 (0.500) -> new  3 (0.502)   old  6 (1.060) -> new 17 (1.084)
old 2 (0.625) -> new  7 (0.626)   old  7 (1.120) -> new 18 (1.145)
old 3 (0.750) -> new 10 (0.738)   old  8 (1.180) -> new 19 (1.210)
old 4 (0.875) -> new 13 (0.870)   old  9 (1.240) -> new 19 (1.210)
old 5 (1.000) -> new 16 (1.026)   old 10 (1.300) -> new 20 (1.278)
```

(Old 8 and 9 collide on 19. Harmless — they were 6 % apart and the new notch
sits between them.)

**The readout must not be km/h.** `dashKph()` divides pace back out, so the
in-game dial reads 0 → ~259 km/h at *every* setting and
`tests/specs/sliders.spec.js` pins that to within 1 km/h. A label saying "top speed
207 km/h" would print a number the speedometer will never show. A percentage of
standard pace is the honest alternative.

The **default** is deliberately left to `tools/tune-sweep.mjs` rather than
picked here — that is the whole point of building the sweep.

---

## The handling sliders, measured — one of them is inert

Same treatment as RACE PACE, and it found worse. Each column is what the notch
*does*, not what it stores:

| notch | RESPONSE wheelbase | LINEARITY (lock at half-stick) | STEER LOCK | SPEED STEER (lock kept @72 m/s) | SMOOTHING lag |
|---|---|---|---|---|---|
| 1 | 4.30 m | 8.8 % | 10.3° | 40 % | 72 ms |
| 3 | 3.77 m | 13.0 % | 13.4° | 40 % | 88 ms |
| 5 | 3.23 m | 19.1 % | 16.4° | **40 %** | 114 ms |
| 7 | 2.70 m | 28.1 % | 19.5° | 40 % | 159 ms |
| 10 | 1.90 m | 50.0 % | 24.1° | 42 % | 398 ms |

### SPEED STEER does nothing at speed — a 2-point spread across ten notches

`lockTaper = max(0.4, 1 − vStd(|v|)/STEER_SPEED_REF)`. The `0.4` floor is not a
safety net, it is the operating point: at 72 m/s **notches 1 through 9 all return
exactly 40 %**, and notch 10 returns 42 %. The entire slider is worth **two
percentage points** at racing speed. It only separates in the middle of the range
(at 40 m/s: 40 % → 68 %), which is not where anyone reaches for it — you reach for
it because the car feels nervous *flat out*.

A hyperbolic taper with no floor fixes it without changing the idea:

| ref (notch) | shipped @72 m/s | `1/(1 + v/ref)` @72 m/s |
|---|---|---|
| 44 (n1) | 40 % | 38 % |
| 80 (n5) | 40 % | 52 % |
| 124 (n10) | 42 % | 63 % |

**Spread at top speed: 2 points → 25 points.** It also never reaches a hard
floor, so the control stays live everywhere instead of saturating, and it is the
same shape sims use. This is where the missing *rate* half of speed-sensitive
steering belongs too — one knob, both halves, tuned together.

### RESPONSE spends half its range below any real car

A real F1 wheelbase is ~3.6 m, which lands at **notch 4**. Notches 6–10 run
2.97 m down to 1.90 m — shorter than any F1 car, and 1.9 m is go-kart territory.
So the top half of the slider is a car that does not exist, the default (3.23 m)
is already shorter than real, and "I keep ending up at the lower end" is a player
correctly finding the only part of the range where the car is plausible. The
recentred range should put ~3.6 m mid-slider and buy its extra travel at the
*stable* end.

### SMOOTHING's useful range is the bottom third

Lag runs 72 ms → 398 ms, but not evenly: notches 1–5 span 42 ms of it and notches
8–10 span 199 ms. The top of the slider is unusable — 398 ms of steering lag is
a third of a second — while the half people actually live in is barely
differentiated. The cutoff is linear in Hz and lag goes as `1/(2πf)`, so the
mapping should be linear in *lag* instead, over a range whose top is somewhere
usable.

LINEARITY is the one that is broadly fine (8.8 % → 50 % at half-stick), though
notch 1 is very numb.

---

## Our racing-line assist already matches the industry vocabulary

F1 uses **Off / Corners Only / Full**. `LINE_LEVELS = { off: 0, corner: 3,
full: 5 }` in `js/input/steer-tuning.js`, with OFF / CORNERS / FULL buttons, is
character-for-character the same taxonomy. Traction control uses **Off / Medium /
Full**, which is the same three-step shape.

Conclusion: **do not rename the racing-line control.** It is already the name
players arrive with. The renaming pass should target `RESPONSE`, `LINEARITY`,
`SPEED STEER` and `STEER LOCK`, which are engineering names with no external
referent at all.

---

## Speed-sensitive steering is TWO halves, and we ship only one

This one reverses an instinct worth recording, because the instinct was wrong.

I had assumed that adding a speed-scaled input ramp on top of the existing lock
taper would be double-dipping — two speed-dependent terms fighting each other.
The sim-racing sources say otherwise. From the Assetto Corsa forums, on what
"speed sensitivity" means as a shipped setting:

> it doesn't just reduce the **rate of change** of steering angle as the vehicle
> speed increases, crucially, it also **limits** [the maximum angle]

rFactor 2's documentation agrees ("speed sensitivity slows steering as you gain
speed"), and BeamNG's rationale states the failure mode it prevents: *"without
this, precise steering at high speed becomes difficult to achieve — even the
smallest input causes high side acceleration."*

Apex 26 implements only the **limit** half, in `lockTaper`
(`js/game.js`, `max(0.4, 1 - vStd(|v|)/STEER_SPEED_REF)`). The **rate** half —
the wheel taking longer to travel at speed — is simply missing.

So it is not double-dipping; it is the other half of one standard feature. But
the two halves have to be **tuned as a single knob**, which means it belongs in
the SPEED STEER recalibration, not bolted on separately to the input layer. That
is where it should land.

---

## Setup-sheet semantics, with the correct signs

For the per-track setup sheet. Signs matter — a setup knob wired backwards is
worse than no setup knob.

### Brake bias

- 50 % is even. Under heavy braking, weight shifts forward and the front tyres
  gain grip, so **more front bias is genuinely faster**; ~55 % front is the
  typical starting point.
- **More front** → stability under braking, but *reduces turning ability* and
  makes a front lock-up easier.
- **More rear** → helps the car rotate into the corner, at the cost of rear
  stability.
- Heavy braking zones want more front (55–56 %); light braking zones want more
  neutral (51–53 %).

**Mapping onto our model is not obvious, and the obvious mapping is wrong.**
Braking here is a scalar deceleration on `c.speed`, not a per-axle force, so
there is no brake force to split. The physically correct place is the **friction
ellipse**: `slipFactor` is currently computed once and applied to `muBase`, i.e.
braking costs *both* axles their cornering grip equally. Real cars do not do
that — the axle doing the braking is the one that loses lateral grip. Making the
ellipse per-axle and weighting the longitudinal consumption by brake bias would
give the knob its real meaning (front bias → front loses grip under braking →
understeer on entry → stability; rear bias → front stays free → rotation).

That is a genuine improvement to the tyre model, and also the highest-risk part
of the setup work: it changes cornering-under-braking for every car, so it needs
measuring before it ships, not after.

### Differential

- **Open (low)** → rear wheels free → stable under acceleration, slower out of
  corners.
- **Locked (high)** → both rears driven together → big push on exit, but much
  easier to spin the rears into oversteer.
- Mostly a mid-to-late-corner effect. Fast corners want more lock; slow corners
  want more open.

**Deliberately excluded from the first pass.** The only lever it maps to here is
`DRIFT`, and letting a player raise `DRIFT` makes the car able to step out —
which silently invalidates the reasoning in §1 for shipping no stability
control. Either both arrive together or neither does.

### Wing / downforce trim

F1 24's usable band is roughly front 20–30, rear 10–20 across most circuits —
i.e. real setups live in the middle of the range, not at its ends. We already
carry `c.aeroLoad` (0..1) from the aero part, and the active-aero trade already
scales with it, so a bounded per-track *trim offset* is the natural shape.

### Brake bias is a mid-lap control, not just a setup value

Worth recording as future work: real drivers, and F1 25 players, adjust brake
bias **several times per lap** — more front for the heavy stop into turn 1, more
neutral for a fast sweeper. F1 25 exposes it on the MFD and players commonly map
it to a stick. Our setup sheet should treat a per-track value as the first step,
not the end state.

---

## Touch sensitivity: default conservative

Real Racing 3 player feedback is consistent that high touch sensitivity destroys
fine control — *"anything beyond 0–3 sensitivity is making micro turns
impossible"*. Our anchored-drag range (`TOUCH_RANGE_FRAC = 0.12`, so ~80 px of
thumb travel for full lock on an iPhone SE in landscape) is on the sensitive
side of that, though `STEER_EXPO ≈ 2.4` softens the centre considerably — half
travel is only ~0.19 of lock.

Leave the default where it is for now, but it is a prime candidate for
`tools/tune-sweep.mjs` to check, and it should be exposed as a slider regardless.

---

## The understeer cue is doing work expensive hardware demonstrably fails at

Worth recording because it justifies a few lines of `navigator.vibrate`.

A real steering wheel goes **light** when the front tyres let go — the
self-aligning torque collapses. That is the canonical way a driver feels
understeer, and it is the thing force feedback exists to reproduce. Except sim
racers consistently report that it does not arrive, on any hardware:

> I never felt the understeer effect (wheel going lighter when losing grip) in
> any games. I tried Assetto Corsa, Project Cars 2, Raceroom…
> — Simucube 2 community

> In LMU there is pretty well zero feel of grip loss, via FFB. Or nothing I have
> tried in settings, for LMU or the DD wheel
> — Le Mans Ultimate community

So on a phone or a pad, where there is no wheel to go light at all, an explicit
rumble on front-axle saturation is not a poor substitute for force feedback — it
is a channel that direct-drive wheels costing four figures are widely agreed to
be failing to deliver. The purpose, as Logitech puts it for TRUEFORCE, is that
slip sensations "let you detect loss of grip **earlier**".

Be honest about it in the code, though: this is **signalling, not simulating**.
We are not modelling self-aligning torque; we are choosing to tell the player a
fact about `Fyf` saturation that they have no other way to learn.

---

## iOS frame pacing: the 120 Hz worry is mostly misplaced, the 30 Hz one is not

- **Safari does not run rAF at 120 Hz by default.** ProMotion in Safari sits
  behind a "prefer page rendering near 60fps" feature flag that ships *on*, so
  the common iPad case is ~60 Hz, matching `PHYS_DT`. The ProMotion analysis is
  therefore lower priority than it first appeared.
- **Low Power Mode throttles rAF to 30 fps.** This is the case that matters, and
  it is common on a phone deep into a race. At 30 fps the accumulator runs two
  substeps per frame, which the fixed-step loop handles correctly — but
  `Input.steer()` is called once per *substep* on wall-clock deltas, so the first
  substep of a frame absorbs the entire frame's ramp and the second sees ~0. The
  aggregate rate stays right; the distribution within the frame does not.
  Harmless today, worth knowing before anything else starts reading input
  per-substep.
- Apple's own guidance is that an animation "requesting 120 Hz but unable to keep
  up may render poorly", where the same content at a lower fixed rate holds a
  steady cadence — which is an argument for the fixed-step design already here.

---

## Logging: the channel this work should have been using all along

Investigated while building the above, and the finding is blunt: **`js/game.js`
contained zero `Log` calls.** Not "few" — zero, alongside zero bare `console.*`.
`js/core/log.js` defines the `game` namespace as covering *"game loop, race logic,
physics (js/game.js, js/game/**)"*, and the file it was created for never used
it. Across `js/game/` only `apex.js` (5 calls) and `debrisworld.js` (1) log at
all.

That is a bigger loss than it sounds, because of how the module is built:

- **The buffer retains at `info` whether or not anything prints.** The console
  threshold defaults to `warn`, the ring buffer to `info`, and they are
  independent. So an `info` line costs a player nothing and is still there
  afterwards via `__apex.logs({ns:"game"})`. As `CLAUDE.md` puts it, "a failure
  that has already happened still has a record" — except the physics had no
  record to leave.
- **`tests/helpers/fixtures.js` attaches the ring to EVERY failure**, as `apex-logs`,
  and `live-reporter.js` echoes its tail into the group log. So a physics spec
  that failed on *"speed was 43, expected > 50"* produced an attachment that said
  nothing about what the car's top speed even was on that run — pace, weather
  grip, parts multipliers and assist gains were all invisible.

**Fixed with one line**, at the green light in `startRace()`: circuit, session,
laps, `PACE`, `vTop()`, `gripMult()`, weather, time of day, the four parts
multipliers, `aeroLoad`, and the two assist gains. That single record makes the
whole class of pace/parts/weather failures self-explaining, and it is exactly
the kind of thing that is invisible when you need it and free when you do not.

Where else this work should use it, in decreasing order of value:

1. **The `STEER_SCHEMA` v3 migration.** It rewrites stored slider values, and
   one clamped key silently changes someone's car. An `info` line naming every
   key it moved, from what to what, and which fell outside the new range, is the
   difference between a bug report of "my steering feels different" being
   diagnosable or not. This is also what should drive the one-time in-panel
   notice.
2. **Braking-assist interventions**, at `debug`. "Why did the car slow down?" is
   otherwise unanswerable, and a cue/assist that fires when the player did not
   expect it is the single most likely complaint.
3. **Resolved setup + parts at race start** — already folded into the envelope
   line above, and the reason to put a setup sheet's values there too.

Two rules the module imposes that matter for anything in the driving path:

- **Hot paths must guard.** Arguments are evaluated whether or not they print,
  so a per-frame line needs `if (Log.enabled("game", Log.DEBUG))` around it. The
  understeer cue is per-frame and deliberately does **not** log for this reason —
  it is already rate-limited to a haptic pulse, and a per-frame string build in
  `updateCar` would cost more than the cue.
- **The namespace is prefixed automatically**, so never repeat it in the message.

For a test run, `APEX_LOG=game:debug` turns the whole thing up without touching
a spec — and `APEX_LOG=buffer:debug` retains more without printing more, which is
usually what you actually want when chasing an intermittent failure.

---

## Framing to keep

The F1 25 guide is explicit that assists are a **trade**, not a difficulty
setting: they stabilise the car and they cap what it can do. *"Some assists are
so powerful that they take a lot of the car control away from you."* Our own
settings copy should say the same rather than implying assists are free, because
a player who does not know an assist costs them anything has no reason to ever
turn one off.

This pairs with the parts/setup split the game already has: **parts decide what
the car is, setup decides where in that envelope you sit at this circuit,
assists decide how much of the driving you do yourself.** None of the three
should quietly do another's job.

---

## Live mcp-probe, 2026-08-18 — what the car actually does

Working-tree canvas at `http://127.0.0.1:3456/` (shell `?v=` hash `7eb65822effc`),
`node tools/mcp-cli.mjs probe --eval artifacts/driving-controls-probe.js` then
`…-v2.js`. Track: Monza. `__apex.headless(true)` + `act()` — JSON, no pixels.
v1 closed-loop trials at full lock ran into the barrier (`x≈7.9`, `wall=0`);
those yaw numbers are discarded. v2 uses 18-frame / 0.35-stick pulses on the
start/finish straight and a 33 m/s entry to T4 (Lesmo 1, r = 43 m). Every v2
row below has `off === 0` and `wall > 1` unless noted.

### Boot identity (STANDARD, Adaptive Buttons OFF)

`tuning()` after `race("monza")`: pace **0.840**, SPEED STEER ref **41.67**,
wheelbase **3.60 m**, expo **2.389**, maxSlip **0.287**, ROAD_FOLLOW **0**,
racing line **0**, DRIFT **0**, `inputState().adaptiveMix === 0`.
`game.js`'s leftover `let STEER_SPEED_REF = 60` is dead; `applySteerTuning()`
wins.

### SPEED STEER — the hyperbola is the operating point

`lockTaper = 1 / (1 + vStd / ref)` with `vStd(v) = v / max(PACE, 0.05)`.
The slider is a point on the *dial*, not a ground-speed constant. At default
pace 0.84, 72 m/s on the dial is 60.5 m/s on the ground.

Lock kept at 72 dial (formula, matches `PHASE-C-SLIDER-DESIGN.md` §2):

| notch | ref | @30 | @50 | @72 |
|---|---|---|---|---|
| 1 | 15 | 33.3 % | 23.1 % | **17.2 %** |
| 5 (default) | 41.7 | 58.2 % | 45.5 % | **36.7 %** |
| 10 | 75 | 71.4 % | 60.0 % | **51.0 %** |

Spread at 72 dial: **33.8 points** (was 1.9 under the old floor).

Same pulse on tarmac, 18 frames, steer 0.35, ground = 72 × 0.84, wall ≥ 9.8 m:

| notch | yawRate | heading error | vLat |
|---|---|---|---|
| 1 | 0.0439 | 0.0105 | −0.264 |
| 5 | 0.0931 | 0.0221 | −0.562 |
| 10 | 0.1292 | 0.0306 | −0.782 |

yawRate n10 / n1 = **2.94×**; lockTaper n10 / n1 = 0.510 / 0.172 = **2.97×**.
The slider now moves the car at racing speed, not just the label.

Pace check, same 55 m/s *ground*, ref 41.7: yawRate 0.0937 at pace 0.84 vs
0.1037 at pace 1.0 (**1.11×**). Predicted from `vStd` alone: lockTaper
0.389 vs 0.431 = **1.11×**. Same ground speed is a higher fraction of a
slower envelope, so more taper — that is the dial contract, not a bug.

### Adaptive Buttons — the rate half is opt-in

`digitalRateIn()` is the same hyperbola, mixed by the Adaptive Buttons
slider (v1 = OFF = mix 0). Live `Input.setSpeedStd` / `debugState().rateIn`:

| mix | 0 dial | 72 dial | ms to 95 % lock @72 |
|---|---|---|---|
| OFF (shipped default) | 6.000 | **6.000** | **158** |
| mid (notch 6, old ON) | 6.000 | 3.889 | 244 |
| full (notch 10) | 6.000 | **2.199** | **432** |

Keyboard and on-screen arrows still reach 95 % lock in **158 ms at 259 km/h**
unless the player finds Advanced → Adaptive Buttons. SPEED STEER only limits
*how far* the wheels go; Adaptive Buttons limits *how fast* a digital hold
gets there. The 2026-08 research said those halves belong on **one** knob.
They shipped as two, and the rate half defaults off — which is why digital
steer can still feel twitchy after the lock-taper fix.

Analog sources (pad stick, tilt, canvas drag) never see `digitalRateIn()`.
That is correct: they already have travel.

### The arc does not steer the player

Hands-off 50 frames at T4, 33 m/s, ROAD_FOLLOW 0: `yawRate === 0`, heading
error 0.98 rad (the road rotated under a car that kept world heading),
`wall === 0`, `off === 0.25`. The bicycle model does not read curvature
for the driver.

Same input, ROAD_FOLLOW 0.70: `yawRate === -0.2335` (into the left-hander),
heading error 0.58, `wall === 3.31`, `off === 0.08`. Driving Help is a
real takeover, not a label. It stays opt-in (notch 1 = 0).

### Combined slip is one-sided, on purpose

T4, 0.35 left stick, 28 frames, start x = −1.5 (all `off === 0`):

| input | axFrac | slipFactor | x | wall |
|---|---|---|---|---|
| brake | **0.641** | **0.768** | 5.01 | 3.09 |
| coast | 0.175 | 0.985 | 6.35 | 1.75 |
| throttle | 0.050 | 0.999 | 7.02 | 1.08 |

Braking spends ~23 % of the lateral budget (`1 − 0.768`). Throttle spends
none that a player can feel. That *is* the arcade traction-control we must
not also ship as a switch. Trail-brake stays tighter and more rotated into
the road (heading error 0.79 vs 0.84 on throttle). A braking *cue* still
earns its keep: the model will rotate the car if you brake, but nothing
tells a thumb when to start.

### Presets are different cars

Same T4 pulse, steer −0.40, 30 frames:

| preset | ROAD_FOLLOW | yawRate | x | slipDeg | wall |
|---|---|---|---|---|---|
| RELAX | 0.544 | −0.634 | 3.55 | 2.76 | 4.56 |
| STANDARD | 0 | −0.122 | 5.31 | 0.36 | 2.79 |
| PRO | 0 | −0.230 | 4.98 | 0.78 | 3.12 |

RELAX's extra yaw is the assist, not the wheelbase. PRO vs STANDARD is
**1.89×** yawRate from the RESPONSE / LOCK / SPEED STEER bundle with
helps still off — presets-first still matches the industry table in
`steering-research.md`.

### What is still worth building (unchanged, now with live reasons)

1. **Braking CUE — shipped 2026-08-18** (`js/physics/brake-cue.js`). Pulse rate
   + lookahead slider (1 = OFF). LIGHT/FULL takeover is still not built.
2. **Rate half on the simple sheet — shipped.** Adaptive Buttons defaults to
   notch 6 and sits next to Racing Line, not inside Advanced.
3. **Do not ship TC / ABS.** `slipFactor` under throttle is already ~1.0.
4. **Do not raise ROAD_FOLLOW's default.** Hands-off with help on is a
   different driver.
5. Setup-sheet brake bias still belongs in this ellipse (highest-risk
   designed item; not re-probed here).

Raw JSON: `artifacts/logs/driving-controls-probe-v1.json`,
`artifacts/logs/driving-controls-probe-v2.json`.
