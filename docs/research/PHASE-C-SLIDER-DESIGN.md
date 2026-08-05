# Phase C — the slider recalibration, with the numbers

The player's complaint was *"the overall speed is weighted too high and for most
sliders I feel like I end up on the lower end. Some sliders I don't even
understand."* Three of those are not a matter of taste — they are arithmetic
defects that can be stated in a table, which is what this document does. Every
number below is computed from the shipped mappings in `js/game/steer-tuning.js`
and the taper in `js/game.js`; regenerate with
`node artifacts/tmp/phase-c-tables.mjs` (the generator is kept with this doc's
history, not in the tree — it is 90 lines of arithmetic, not a tool).

**Status: DESIGN, not shipped.** Two of the four are safe on arithmetic alone;
two want `tools/tune-sweep.mjs` on a quiet box before they go in. Marked below.

---

## 1. RACE PACE — the resolution is backwards

`paceFromSlider` is piecewise linear with a kink at the default:

```js
v <= 5 ? 0.5 + (v - 1) * 0.125 : 1.0 + (v - 5) * 0.06
```

Below the default each notch is a **14-25 %** change in ground speed; above it,
**4.8-6 %**. So the half of the slider a player who wants a calmer car has to
use is the half with almost no resolution — four coarse steps — while the half
almost nobody uses is finely graded. That is precisely the "I end up on the
lower end" complaint, and it is a property of the mapping rather than of the
player.

| notch | today | step | | notch | proposed | step |
|---|---|---|---|---|---|---|
| 1 | 0.500 | — | | 1 | 0.469 | — |
| 2 | 0.625 | 25.0 % | | 2 | 0.497 | 6.0 % |
| 3 | 0.750 | 20.0 % | | … | … | 6.0 % |
| 4 | 0.875 | 16.7 % | | 11 **← new default** | 0.840 | 6.0 % |
| 5 **← default** | 1.000 | 14.3 % | | 14 *(reference)* | 1.000 | 6.0 % |
| 6 | 1.060 | 6.0 % | | … | … | 6.0 % |
| 10 | 1.300 | 4.8 % | | 19 | 1.338 | 6.0 % |

**Proposed: `pace(n) = 1.06^(n - 14)`, 19 notches, 6.0 % per notch.**

Three properties make this the right shape rather than merely a different one:

- **Equal percentage steps.** Pace is a multiplicative scale on ground speed, so
  a *ratio* is the natural unit; a linear grid on a multiplicative quantity is
  what produced the 5x asymmetry above.
- **1.0 stays exactly reachable, on notch 14.** It is not a nice round number by
  accident — it is the reference scale `vStd()` is defined against, several
  specs pin it, and `__apex.setPhysics({pace:1})` must keep meaning what it
  means. An anchored grid gets that for free; a "0.45 to 1.35 in 21 steps" grid
  does not, and would leave the reference unreachable from the UI.
- **The default moves DOWN to notch 11 = 0.84**, which is the change the player
  actually asked for, and it is now independent of the grid's shape.

### Migration is honest to 2.9 %

`STEER_SCHEMA` → 3, mapping each old notch to the nearest new one:

| old | old pace | → new | new pace | error |
|---|---|---|---|---|
| 1 | 0.500 | 2 | 0.497 | −0.61 % |
| 2 | 0.625 | 6 | 0.627 | +0.39 % |
| 3 | 0.750 | 9 | 0.747 | −0.37 % |
| 4 | 0.875 | 12 | 0.890 | +1.71 % |
| 5 | 1.000 | 14 | 1.000 | 0.00 % |
| 6 | 1.060 | 15 | 1.060 | 0.00 % |
| 7 | 1.120 | 16 | 1.124 | +0.32 % |
| 8 | 1.180 | 17 | 1.191 | +0.93 % |
| 9 | 1.240 | 18 | 1.262 | +1.81 % |
| 10 | 1.300 | 18 | 1.262 | **−2.89 %** |

Worst case is under half a new notch, so nobody's car changes character. Note
that old 9 and old 10 both land on new 18 — the top of today's range is finer
than the new grid, which is the asymmetry being removed, and it is the one place
the migration is lossy. It is worth the trade and it should be logged, not
silent: the migration rewrites a stored value, and a clamp nobody can see is how
a player's settings get quietly changed.

**A store that has never been written gets notch 11.** A store that HAS keeps
its own migrated value. Lowering a default and migrating existing values are
different acts and must not be conflated — doing only the first reaches nobody
who has ever opened the settings, and doing only the second reaches nobody at
all.

*Safe on arithmetic. The DEFAULT notch (11) is the one judgement call, and the
sweep should confirm 0.84 rather than 0.79 or 0.89.*

---

## 2. SPEED STEER — the slider that does nothing

```js
lockTaper = Math.max(0.4, 1 - vStd(Math.abs(c.speed)) / STEER_SPEED_REF)
```

with `STEER_SPEED_REF` running 44 → 124 m/s across the slider. The linear term
goes **negative** at any real racing speed, so the `0.4` floor is not a safety
net — it is the operating point, and the slider is inert exactly where a player
would reach for it.

Measured taper, today:

| notch | ref | @72 m/s | @50 m/s | @30 m/s |
|---|---|---|---|---|
| 1 | 44.0 | 0.400 | 0.400 | 0.400 |
| 5 | 79.6 | 0.400 | 0.400 | 0.623 |
| 9 | 115.1 | 0.400 | 0.566 | 0.739 |
| 10 | 124.0 | 0.419 | 0.597 | 0.758 |

**Spread across the entire slider at 72 m/s: 1.9 points.** Notches 1 through 9
are bit-for-bit identical. At 260 km/h this control does not exist.

**Proposed: `lockTaper = 1 / (1 + vStd(v) / ref)`, ref 15 → 75 m/s.**

A hyperbolic law never goes negative, so nothing is ever clamped and every notch
does something at every speed. The reference range drops a long way because the
*shape* changed, not because the feel did — under `1/(1+x)` the same amount of
taper needs a much smaller reference than under `1-x`.

| notch | ref | @72 m/s | @50 m/s | @30 m/s |
|---|---|---|---|---|
| 1 | 15.0 | 0.172 | 0.231 | 0.333 |
| 5 **← default** | 41.7 | 0.367 | 0.455 | 0.581 |
| 10 | 75.0 | 0.510 | 0.600 | 0.714 |

**Spread at 72 m/s: 33.8 points, up from 1.9.** At 50 m/s: 36.9. At 30: 38.1.

### What this costs at the default

| speed (std m/s) | today v5 | proposed v5 | delta |
|---|---|---|---|
| 10 | 0.874 | 0.806 | −0.068 |
| 20 | 0.749 | 0.676 | −0.073 |
| 30 | 0.623 | 0.581 | −0.042 |
| 40 | 0.497 | 0.510 | +0.013 |
| 50 | 0.400 | 0.455 | +0.055 |
| 60 | 0.400 | 0.410 | +0.010 |
| 72 | 0.400 | 0.367 | −0.033 |

Not a default-preserving change — the two curves have different shapes and no
choice of reference makes a hyperbola equal to a clamped line. The largest
divergence is ~7 points of lock at low speed (slightly less steering in slow
corners) and +5.5 points at 50 m/s (slightly more in fast ones). That reads as
*more* linear, which is the intent, but it is a feel change and must be play-
tested, not asserted.

The `1` at notch 1 also wants checking: 0.172 of `STEER_MAX_SLIP` at 72 m/s is
about 2.9° of road-wheel angle, which may simply be undriveable. If it is,
raise the bottom of the range rather than restoring a floor — a floor is what
broke this control in the first place.

**Also fold in the missing half.** Speed-sensitive steering in Assetto Corsa and
rFactor 2 is *two* mechanisms: a speed-scaled **rate** (how fast lock builds)
and a speed-scaled **limit** (how much is available). We ship only the limit. A
player reaching for "calmer at speed" is reaching for both, so one slider should
drive both, tuned together — otherwise a second knob appears later and the two
interact in a way nobody can predict from the labels.

*NOT safe on arithmetic. Needs the sweep and a drive.*

---

## 3. RESPONSE — the top half is below any real car

`WHEELBASE` runs 4.3 → 1.9 m. A 2026 F1 car is about **3.6 m** between the
axles, which lands at notch 3.6 — so notches 6-10 (2.97 → 1.90 m) are go-kart
geometry, and the player who "ends up on the lower end" is correctly finding the
only part of the range that corresponds to a car.

| notch | today (m) | proposed (m) |
|---|---|---|
| 1 | 4.30 | 4.40 |
| 3 | 3.77 | 4.00 |
| 5 **← default** | 3.23 | 3.60 |
| 7 | 2.70 | 3.20 |
| 10 | 1.90 | 2.60 |

**Proposed: 4.4 → 2.6 m, default 3.60 m.** The default becomes a real car, and
the travel that used to be spent below 2.6 m is redistributed across the range
people actually use.

This *is* a change at the default — today's default is already a 3.23 m
wheelbase, shorter than any F1 car — so the car will feel slightly calmer on
turn-in out of the box. Given the complaint, that is the right direction; given
that it moves the shipped feel, it is the one Phase C number that should not go
in on arithmetic alone.

*NOT safe on arithmetic. Sweep + drive.*

---

## 4. STEER SMOOTHING — linear in lag, not in Hz

The slider is linear in the One-Euro min-cutoff (2.2 → 0.4 Hz), but what a
player *feels* is lag, which goes as `1/(2π·fc)`. So the perceptual steps are
wildly uneven:

| notch | today fc | today lag | step | proposed lag | proposed fc |
|---|---|---|---|---|---|
| 1 | 2.20 | 72.3 ms | — | 55.0 ms | 2.894 |
| 2 | 2.00 | 79.6 ms | 7.2 ms | 70.6 ms | 2.256 |
| 6 **← default** | 1.20 | 132.6 ms | 18.9 ms | 132.8 ms | 1.199 |
| 9 | 0.60 | 265.3 ms | 66.3 ms | 179.4 ms | 0.887 |
| 10 | 0.40 | 397.9 ms | 132.6 ms | 195.0 ms | 0.816 |

Steps run **7.2 ms at the bottom to 132.6 ms at the top — a 9x variation** — and
the top of the range (398 ms of steering lag) is not a setting anyone can drive.

**Proposed: linear in lag, 55 → 195 ms.** A uniform 15.6 ms per notch, and the
default is preserved to within a rounding error (132.8 ms vs 132.6 ms, i.e. 1.20
Hz either way). Nobody's car changes; the slider just becomes usable along its
whole length.

*Safe on arithmetic — the default is unchanged and only the intermediate steps
move.*

---

## What is NOT changing, and why

- **RACING LINE** (Off / Corners / Full) and `STEER_LEVELS`
  (easy / assist / normal / sim) already match how the industry names these.
  Leave them.
- **DRIVING HELP** was fixed in its own right — it ships at a true zero and the
  v2 migration already reset it. Touching it again would re-open the migration
  question for no gain.
- **The readout stays relative, not km/h.** It is tempting to label RACE PACE
  with a top speed, but `dashKph` divides pace back out on purpose: the dial
  reads 0 → ~259 km/h at *every* setting, which is the whole point of the
  `vTop()`/`vStd()` discipline. A km/h label would contradict the instrument
  next to it.

## Known blocker

`migrateSteerStore()` is a single "have I run ANY migration" gate:

```js
if (store.get("steerSchema", 1) >= STEER_SCHEMA) return;
```

Bumping `STEER_SCHEMA` to 3 makes a store already at 2 fall through and receive
**v2's reset a second time**, silently discarding a `drivingHelp` or `raceLine`
value the player chose deliberately after v2 ran. Phase C must convert this to a
per-version ladder before it changes the constant.
`tests/steer-migration.spec.js` exists to make that failure loud.
