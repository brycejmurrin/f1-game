# Driving controls & assists — what shipped games do, and what it means here

Research notes gathered while recalibrating the pause-menu sliders and the input
layer (the "sliders I don't understand / I always end up at the bottom" pass).
Sources are the F1 24/25 assist and setup guides, EA's own F1 25 accessibility
documentation, and sim-racing forum discussion of speed-sensitive steering.

The point of writing this down is that several of the conclusions are *negative*
— features worth deliberately NOT building — and a negative decision with no
record gets re-litigated every six months.

---

## 1. Two assists we should never ship, and the reason is structural

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

## 2. Braking assist: EA ships two different things under one name

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

## 2b. Forza's Blind Driving Assists — the best-documented prior art there is

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

## 3. Our racing-line assist already matches the industry vocabulary

F1 uses **Off / Corners Only / Full**. `LINE_LEVELS = { off: 0, corner: 3,
full: 5 }` in `js/game/steer-tuning.js`, with OFF / CORNERS / FULL buttons, is
character-for-character the same taxonomy. Traction control uses **Off / Medium /
Full**, which is the same three-step shape.

Conclusion: **do not rename the racing-line control.** It is already the name
players arrive with. The renaming pass should target `RESPONSE`, `LINEARITY`,
`SPEED STEER` and `STEER LOCK`, which are engineering names with no external
referent at all.

---

## 4. Speed-sensitive steering is TWO halves, and we ship only one

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

## 5. Setup-sheet semantics, with the correct signs

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

## 6. Touch sensitivity: default conservative

Real Racing 3 player feedback is consistent that high touch sensitivity destroys
fine control — *"anything beyond 0–3 sensitivity is making micro turns
impossible"*. Our anchored-drag range (`TOUCH_RANGE_FRAC = 0.12`, so ~80 px of
thumb travel for full lock on an iPhone SE in landscape) is on the sensitive
side of that, though `STEER_EXPO ≈ 2.4` softens the centre considerably — half
travel is only ~0.19 of lock.

Leave the default where it is for now, but it is a prime candidate for
`tools/tune-sweep.mjs` to check, and it should be exposed as a slider regardless.

---

## 7. The understeer cue is doing work expensive hardware demonstrably fails at

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

## 8. iOS frame pacing: the 120 Hz worry is mostly misplaced, the 30 Hz one is not

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

## 9. Framing to keep

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
