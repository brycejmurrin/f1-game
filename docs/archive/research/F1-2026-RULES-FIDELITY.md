> **Dated record (2026-08).** Gap list of Apex 26's 2026-rules model against
> the published regulations as of writing. None of the gaps had been acted on
> when this was filed (the HUD still reads X-MODE) — check the code before
> assuming any entry is either fixed or still true.

# The 2026 rules we model, checked against the 2026 rules

Apex 26 is built explicitly on the 2026 regulations — moveable wings, Overtake
mode replacing DRS, a much larger electrical contribution. Those regulations
were still in draft when much of this was written, and they have since been
**renamed and refined**. This is the gap list.

Source: Racecar Engineering's terminology guide (Jan 2026), the F1.com
beginner's guide, and Honda's regulations overview.

---

## 1. The mode names we ship were deliberately retired

> When the flaps are open, drag will be reduced. This is known as **Straight
> mode (formerly X-mode)**. As the car approaches a corner, the flaps will
> close… This is known as **Corner mode (formerly Y-mode)**.

We ship **X-MODE** and **Z-MODE** — on the HUD chip (`js/game/hud.js:132-135`),
in `index.html`, and throughout the physics as `xOn` / `aeroX` / `X_VMAX_GAIN`.

Two things are wrong, not one:

- **X/Y were the draft names and are now Straight/Corner.** F1 stated the goal
  was to *"avoid gimmicks and jargon"* in favour of *"simple, more objective and
  meaningful language"*, and tested the replacements against a survey of 50 000
  fans. So the names we display are exactly the jargon the sport chose to drop.
- **The closed mode was never Z.** The draft called it **Y-mode**; we call it
  Z-mode, which appears to be our own invention on top of an already-outdated
  name.

"STRAIGHT" and "CORNER" are also plainly better for the player — they say what
the mode is *for*, which is the entire reason the FIA changed them. A HUD chip
reading `CORNER` / `STRAIGHT` needs no explanation; `Z-MODE` needs a manual.

**Note the size of this change before doing it.** The internal names (`aeroX`,
`xOn`, `xArmed`, `X_OPEN_RATE`, `xVmaxGain`) are load-bearing across
`js/game.js`, `js/game/hud.js`, `js/car/car3d.js`, `__apex.aero()`,
`physState()`, `docs/DEBUG-HOOKS.md` and `tests/specs/active-aero.spec.js` (23 tests).
The *display* strings are a small, safe change; renaming the internals is a
large mechanical one with no gameplay benefit. Do the first, and only consider
the second if it stops confusing readers.

---

## 2. Overtake mode is missing its activation zone

This is the substantive one.

> It will provide 0.5 MJ of additional electrical energy to a driver that is
> **within one second of the driver ahead when passing over a designated
> activation zone**. As was the case for DRS, the Overtake mode detection and
> activation lines will be marked by a yellow line across the track.

We model Overtake as proximity-gated but **positionally unrestricted** —
`CLAUDE.md`'s own comparison table says `where: anywhere` for OVERTAKE against
`inside an ACTIVATION ZONE only` for active aero. Per the regulations, Overtake
needs *both* the 1 s gap *and* a zone.

The irony is that we already have the machinery: `AeroZones.build()` scans each
built circuit for qualifying straights and `aeroZoneAt()` answers the question
per position. Overtake could consume the same zones — or its own set — with no
new geometry work.

**This is a design decision, not just a bug.** Gating Overtake on zones would
make it rarer and more tactical, and it would give MONACO (which has no zones at
all, and `tests/specs/aero-zones.spec.js` pins that) no Overtake either — which is
arguably correct under the real rules and arguably terrible for the game.
Worth deciding deliberately rather than leaving it unmodelled by accident.

---

## 3. Our deploy taper sits far lower than the real one

> In standard configuration, a 2026 F1 car's energy deployment will **taper off
> from 290 km/h**, whereas a car using Overtake mode can use a full 350 kW **up
> to 337 km/h**.

Ours: `TAPER_LO = 41, TAPER_HI = 53` m/s — a **148–191 km/h** band (`js/game.js`),
and Overtake bypasses the taper entirely (`deployTaper` returns 1).

Expressed as a fraction of top speed, so the comparison survives our lower
`VMAX` of 259 km/h:

| | taper starts | full power until |
|---|---|---|
| **Real 2026** | 86 % of top speed (290 of 337) | 100 % in Overtake |
| **Apex 26** | 57 % of `VMAX` | 100 % in Overtake |

So our deployment starts fading **much earlier in the speed range** than the
rules describe. The structure is right — a taper, bypassed by Overtake — but the
band is in the wrong place, which makes ERS feel like a low-speed launch aid
rather than something that pulls all the way down a straight.

Moving `TAPER_LO`/`TAPER_HI` up toward ~0.85 of the envelope would match the
regulations and change how the battery feels on a long straight. It is a feel
change, so it wants the sweep rather than a guess.

---

## 4. Partial-throttle harvesting is newly reachable

> **Recharge**: the capture of energy from braking, **lift-and-coast or partial
> throttle application through corners**.

We regenerate on braking, on coasting, and on throttle below half `vmax`. The
middle case — *partial throttle* — was literally unrepresentable until now,
because the throttle was a boolean: `Input.throttleLevel()` existed with no
consumer and every press was 100 %.

That changed with the analog-pedal work, so `throttleLvl` is now a real 0..1 in
`updateCar`. Modelling "part throttle through a corner harvests" is suddenly a
few lines, and it would give the new analog pedals a *reason to exist* beyond
feel — lifting slightly through a long corner becomes a strategic choice rather
than just a smoother one.

Good candidate for the phase after the recalibration.

---

## 5. What we already have right

- **Boost mode** — *"deployment of electrical energy that has been stored…
  can be used anywhere on the track at any time, making it a continuous
  strategic tool."* Ours matches exactly: `BOOST` spends the battery, anywhere.
- **Active aero as standard operation, not an overtaking aid.** *"This drag
  reduction will be a standard part of F1 car operation, and not a
  differentiator used in overtaking."* Our model is emphatic about this — the
  CLAUDE.md table exists precisely to stop the two rule sets being crossed, and
  active aero is available to the leader and the backmarker alike.
- **Moveable flaps on the front wing too**, not just the rear. `Car3D.aeroFlaps()`
  actuates the front cascade's top two flaps alongside the rear wing's top two
  planes, all from the one `aeroX`.
- **The 400 ms transition cap** driving `X_OPEN_RATE` rather than a feel value.
