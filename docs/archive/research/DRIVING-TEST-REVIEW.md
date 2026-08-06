> **Dated record (2026-08), since acted on.** Review of the driving/physics
> test surface as it stood before the recalibration; the fixture conversion,
> the vStd lint (`tests/vstd-invariant.test.mjs`) and the pace-pinning it
> recommends have since shipped. Spec/test counts are historical.

# The driving/physics test surface — a review

Read-through of the 17 specs covering steering, input, physics, off-track,
aero and collisions: **172 tests**. Written while recalibrating the driving
controls, so the lens is "will these catch the class of bug this work
produces, and will they explain themselves when they don't".

| Spec | Tests | Covers |
|---|---|---|
| `active-aero.spec.js` | 23 | flap travel, the downforce/drag trade, the 400 ms cap |
| `touch-steer.spec.js` | 21 | anchored-drag touch steering, arrow ramp, pedal travel |
| `aero-zones.spec.js` | 16 | fixed activation zones, Monaco having none, the overtake gate |
| `collisions-deep.spec.js` | 16 | car-to-car in the (prog, x) plane |
| `steering.spec.js` | 15 | the player heading model in `updateCar` |
| `sliders.spec.js` | 15 | every pause-menu slider is wired and persists |
| `gamepad.spec.js` | 9 | pad mapping, latches, blur release |
| `offtrack.spec.js` | 9 | grass, reversing, wrong-way, auto-rescue |
| `elevation-tracks.spec.js` | 8 | slope gravity, banking grip on graded circuits |
| `world-physics.spec.js` | 7 | world-space integration, the RESPONSE slider |
| `longitudinal.spec.js` | 7 | throttle/coast/brake ordering, top speed, grass drag |
| `drift.spec.js` | 7 | the per-axle slip model, `DRIFT` stability |
| `presets.spec.js` | 5 | RELAX / STANDARD / PRO ordering |
| `projection.spec.js` | 4 | Frenet continuity near hairpins |
| `collisions.spec.js` | 4 | driver↔AI, driver↔wall, kerbs |
| `autopilot.spec.js` | 3 | a closed-loop driver completing laps |
| `physics-fixes.spec.js` | 3 | the robustness pass |

---

## 1. Not one of them explains its own failure

**All 17 import raw `@playwright/test`.** None import `./fixtures.js`, so none
of those 172 tests attaches `apex-state`, `apex-logs` or `page-console` when it
goes red. A physics failure reads *"expected 43 to be greater than 50"* and
stops there — no pace, no grip multiplier, no parts multipliers, no slip state,
no log ring.

This is not a sanctioned exemption. `tools/fixture-consumer-audit.mjs` holds a
`FIXTURE_CONSUMERS` allow-list of exactly **four** specs (`smoke`, `audio-smoke`,
`f1-track-accuracy`, `ui-audit`) that *must* use fixtures; everything else is
simply unenforced, and the driving suite never opted in. `CLAUDE.md`'s new-test
checklist says to import from `fixtures.js` "unless you have a reason not to",
and its rule 3 — *"make failures explain themselves"* — describes the three
attachments as though they were broadly available. On the physics surface they
are available nowhere.

**Swapping the import is close to free**, which is the part worth knowing before
proposing it. `fixtures.js` adds three things: the failure attachments (only
collected when red — "free on a passing test"), Jolpica/OpenF1 route mocks
(physics specs never call those), and `window.__TEST_MODE = true`. That last one
**has no consumer anywhere in the repo** — set by the fixture, read by nothing —
so it cannot change behaviour. The risk of conversion is therefore close to zero
and the payoff is every future physics failure arriving with the car's state
attached.

`tests/touch-steer.spec.js` has been converted as the first one. It originally
copied its neighbour `gamepad.spec.js` and took the raw import, which is exactly
how the pattern propagates.

**Recommended:** convert the driving specs and extend `FIXTURE_CONSUMERS` to
cover them, so the next one written by copying a neighbour inherits the right
habit instead of the wrong one.

---

## 2. Several specs have an unstated dependency on the PACE default

`offtrack.spec.js`, `autopilot.spec.js` and `longitudinal.spec.js` — 19 tests —
contain **no reference to pace at all**, yet assert on distances and speeds:

```js
expect(r.dProg).toBeGreaterThan(50);      // offtrack.spec.js:28 — 2 s of throttle
expect(ds).toBeGreaterThan(35);           // world-physics.spec.js:43 — "~46 m at ~46 m/s"
expect(r.offSpeed).toBeLessThan(45);      // offtrack.spec.js:98 — grass floor is GRASS_V*0.6*PACE
expect(r.distPct).toBeGreaterThan(40);    // autopilot.spec.js:185 — lap progress
```

Every one of those quantities scales with `PACE`, and every one of those specs
inherits whatever the stored default happens to be. **The pace default is an
unstated input to nineteen tests.**

That matters directly, because the recalibration lowers it. When one of these
goes red the failure is ambiguous between "the physics broke" and "the car is
slower now, on purpose" — and ambiguity is the one thing a regression test is
supposed to remove.

**Recommended, and it should land BEFORE the pace default moves:** have these
specs pin pace explicitly (`setPhysics({pace: 1})`) so they measure the physics
rather than the setting, or express the assertion in pace-normalised terms.
Either makes them independent of a default that is about to change.

---

## 3. The bug class that just slipped through has no guard

`A13` (overtake's speed floor compared against a raw literal instead of
`vStd()`) was found by reading, not by a test — and it is the *second* instance
of that class, after `A5`. `CLAUDE.md` states the invariant plainly: *"anything
that divides a speed by `VMAX`, or compares one against a literal, must pick
`vTop()` or `vStd()`"*. Nothing checks it.

This repo already knows the answer to that shape of problem. `A10` was five
circuit-def fields silently dropped by a copy, fixed once for one field and then
recurring — and the disposition reads *"plus `tests/circuit-def-fields.test.mjs`
— the guard is the real fix"*.

**Recommended:** a `node --test` unit suite that reads `js/game.js` as text and
flags `c.speed`/`speed` compared against a numeric literal outside an approved
list. It is a lint, not a physics test, so it costs milliseconds and runs in
`tooling-fast`. The approved list is short and each entry documents why it is a
force or a genuinely absolute quantity rather than a threshold. That converts a
prose invariant — which the review notes has drifted twice — into an asserted
one.

---

## 4. Genuine coverage gaps

- **The tilt pipeline.** `Input.simTilt` exists precisely so tilt can be driven
  headlessly, and only `autopilot.spec.js` uses it, for one lap. Nothing covers
  calibration, the dead zone, the One-Euro filter's behaviour, or the
  asymmetric slew — on the input method that is the mobile default. Note also
  that `simTilt` **restates `tiltSteering`'s body** rather than calling it, so
  the two can drift and no test would notice.
- **The understeer cue** (just added) has no spec. It is haptic-only, so a test
  would assert on the front-saturation condition rather than the vibration.
- **`STEER_SCHEMA` migration** has none, and the v3 migration will rewrite
  stored slider values — the highest-consequence untested code in this area.
- **Nothing asserts the assists stay off by default** except
  `steering.spec.js:128`. That single test is load-bearing for the whole "the arc
  must not reach the driver" contract and deserves company.

---

## 5. What is good, and should not be changed

Worth recording so a future pass does not "tidy" it:

- **`presets.spec.js` asserts ORDERING, not values** (`relax.roadFollow >
  pro.roadFollow`), with a comment explaining that the previous version pinned
  `wheelbase 3.2 / expo 2.4` and broke on every retune. It will survive the
  recalibration untouched. This is the model the others should follow.
- **Most absolute thresholds are deliberately wide bounds**, not pins —
  `acc > 20 && acc < 150` is commented *"sane physical ceiling, not an exact
  VMAX pin"*. Leave them.
- **`aero-zones.spec.js` drives a real opening lap** rather than calling
  `setLap()`, because `setLap` moves only the player's counter and the overtake
  gate reads the *leader's*. That is a test that understood the thing it tests.
- **`drift.spec.js` sweeps `DRIFT` to 0.7** and asserts no NaN and no
  fly-off — which is why a bounded differential setting would be landing in
  already-tested territory.
