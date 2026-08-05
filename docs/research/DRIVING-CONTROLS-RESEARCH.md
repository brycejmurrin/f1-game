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
| **Braking assist is OFF / CUE / LIGHT / FULL** — starts with information, not intervention | Designed, not yet built |
| **The braking cue is a pulse RATE, not a pitch ramp**, with a player-set lookahead | Designed. Corrects my first instinct |
| **A FULL braking level brakes for corners only**, never to avoid rear-ending | Designed |
| **RACE PACE becomes geometric**, ~5.65 %/notch over 0.45–1.35 | Designed; default deferred to `tools/tune-sweep.mjs` |
| **Its readout must not be km/h** — `dashKph` divides pace out, so the dial reads ~259 km/h at every setting | Settled |
| **Value-preserving migration is honest** — worst case 2.6 %, under the old scale's smallest step | Verified by calculation |
| **Do not rename the racing-line assist** — already matches the industry's Off/Corners/Full | Settled |
| **Speed-sensitive steering is two halves and we ship one** — the rate half belongs in the SPEED STEER retune | Designed |
| **Setup sheet: wing trim / brake bias / suspension**; gears and diff cut | Designed |
| **Brake bias belongs in the friction ellipse**, which currently charges both axles for grip one spends | Designed — highest-risk item |
| **Understeer cue is signalling, not simulating** | **Built** |
| **`js/game.js` had zero `Log` calls** | **Fixed** — one envelope line at race start |

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
`tests/sliders.spec.js` pins that to within 1 km/h. A label saying "top speed
207 km/h" would print a number the speedometer will never show. A percentage of
standard pace is the honest alternative.

The **default** is deliberately left to `tools/tune-sweep.mjs` rather than
picked here — that is the whole point of building the sweep.

---

## Our racing-line assist already matches the industry vocabulary

F1 uses **Off / Corners Only / Full**. `LINE_LEVELS = { off: 0, corner: 3,
full: 5 }` in `js/game/steer-tuning.js`, with OFF / CORNERS / FULL buttons, is
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
`js/log.js` defines the `game` namespace as covering *"game loop, race logic,
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
- **`tests/fixtures.js` attaches the ring to EVERY failure**, as `apex-logs`,
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
