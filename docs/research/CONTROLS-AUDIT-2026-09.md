> **Dated record (2026-09-14).** A whole-surface control audit: what Apex 26
> ships on every device and in every mode, measured against four parallel
> external research passes (mobile touch, Apple platform, gamepad, desktop).
> The status column is as of writing — **the code is the authority on what
> shipped**.
>
> Companions, and what each already settles so this file does not re-litigate
> it: `DRIVING-CONTROLS-RESEARCH.md` (assists, the brake cue, speed-sensitive
> steering, slider arithmetic), `PLATFORM-INPUT-NOTES.md` (the per-device
> platform traps and the pad menu-nav mapping), `steering-research.md` (the
> One-Euro choice and the preset-first argument).

# Controls audit — every device, every mode

## Method, and its one weakness

Four research agents were run in parallel against the public web, each briefed
on our surface from a written summary rather than from the tree. That kept them
independent — none could pattern-match our code and call it good — but it also
means **two of their headline findings were wrong about us**, because the brief
was wrong. Both corrections are recorded in full below rather than quietly
dropped: a research note whose errors are invisible is worse than one with none,
because the next reader cannot tell which claims were checked.

Everything attributed to Apex 26 below was then re-read from the tree.

---

## What this concluded, at a glance

| Decision | Status |
|---|---|
| **The pad steer deadzone 0.14 is 3–7× the racing-game norm** and is not adjustable | **Confirmed defect.** F1 ships 0, ACC 2–4 %, Forza 5, Rocket League pros 0.03–0.10. Ours silently eats the first 14 % of stick travel — the small-correction band |
| **The d-pad is an instant full-lock teleport** (`ax = ±1`, no ramp) | **Confirmed defect.** Every other digital source in the file ramps through `digitalStep`; the d-pad bypasses it entirely |
| **`STEER_EXPO` is one curve shared by every device** | **Confirmed design debt.** Not "no gamma" (we have 2.4, at the top of ACC's pad band) — the defect is that tilt, keys, arrows, drag and stick all get a value that can only be tuned for one of them |
| **TOUCH mode has no sensitivity knob and `touchRangeFrac` is dead code** | **Confirmed defect.** Declared, read by `touchRangePx()`, never assigned. TILT has three settings, BUTTONS has one, TOUCH has none — and `DRIVING-CONTROLS-RESEARCH.md` already concluded in 2026-08 that it "should be exposed as a slider regardless" |
| **`js/ui/onboard.js` teaches the wrong key** | **Confirmed defect.** Says `ACTIVE AERO — A`; the bind is `KeyZ`. All three coach marks hardcode defaults and ignore rebinds, while HOW TO PLAY is rewritten from live bindings |
| **Steer and pause are unrebindable on both devices** | **Confirmed guideline miss.** XAG 107 requires remapping *all* controls "including the Esc key on PC games" |
| **No look-back, and no manual reset/recover bind** | **Confirmed gap.** Look-back is standard (FH5 ↓, F1 End, iRacing Z/X) and functional in wheel-to-wheel racing; recover is `R` almost everywhere |
| **We already ship haptics** — the brief said we did not | **Correction.** `Input.rumble()` + `navigator.vibrate` on crash, kerb, front-axle saturation, brake cue |
| **We already ship the mobile P0 platform layer** | **Correction.** `viewport-fit=cover`, safe-area tokens consumed by the dock, non-passive canvas `preventDefault`, orientation-aware tilt axis, rotate prompt, wake lock, `prefers-reduced-motion`/`-contrast`/`-reduced-transparency` |
| **Pad rumble is dead on iOS and always will be** | **Hard platform limit.** `Gamepad.vibrationActuator` is `false` on Safari iOS; `navigator.vibrate` unsupported. Our graceful degradation is already correct |
| **Never build traction control or ABS** | **Unchanged** from `DRIVING-CONTROLS-RESEARCH.md` — no longitudinal slip model exists for either to act on |
| **Never build a virtual steering wheel** | **New negative.** The category expects it; reviewers actively warn against it; it costs the most screen and the most thumb travel per degree |

---

## 1. The surface we actually ship

### 1.1 The priority ladder

`Input.steer()` (`js/input/input.js`) resolves one command from five sources:

```
keyboard (held OR still ramping back to centre)
  > gamepad (only while the stick is deflected past 0.001)
    > on-screen arrows   (steerMode "buttons")
      > tilt             (steerMode "tilt", sensor seen)
        > canvas drag    (steerMode "touch")
```

Throttle and brake are an OR across key / on-screen / pad, with `throttleLevel()`
and `brakeLevel()` carrying 0–1 travel so an analog trigger and an on-screen pedal
can both modulate. A key is always full travel, and wins, so a desktop player can
never be modulated by a stray pad axis.

Every digital source (keys, on-screen arrows) shares `digitalStep`, which ramps in
**shaped** road-wheel space and hands back the exact inverse so `game.js`'s expo
undoes it — 4 units/s toward lock, 8 units/s back, unwinding at the release rate
and building at the build rate with the switch at centre. That is a genuinely
careful piece of work and nothing below proposes changing it.

### 1.2 The three touch modes

| Mode | Steering | Pedals | Gears | Settings it has |
|---|---|---|---|---|
| **TILT** | gyro → One-Euro → 2.5° dead → 36° full lock → slew cap | manual GAS + BRAKE | manual allowed | TILT RANGE, SMOOTHING, CALIBRATE, plus a simple combined notch |
| **BUTTONS** | on-screen arrows through `digitalStep` | manual GAS + BRAKE | forced auto | ADAPTIVE BUTTONS |
| **TOUCH** | drag from a touch-down anchor, 12 % of the **long** screen edge = full lock | **auto-throttle**, brake only | forced auto | **none** |

Default is `"buttons"` — deliberate, and right: a first-time phone player should
not be handed a tilt control.

Both pedals *and* the steer arrows carry an analog slide gesture: touch is 100 %
travel, sliding away eases to a 0.12 floor over 90 px with a 12 px deadzone. Four
independent nets guard against a ghost pointer latching a pedal on. This is ahead
of the shipped mobile field — Real Racing 3 and Asphalt 9 give no analog throttle
at all, and GRID's equivalent is a separate throttle slider.

### 1.3 Desktop and pad

Ten rebindable keyboard actions and eight rebindable pad actions, two physical
slots each, keyed on `e.code` so WASD sits under the same fingers on AZERTY.
Defaults: Arrow/WASD steer and pedals, Space boost, X overtake, Z active aero,
E up / Q or Shift down, C camera, P/Escape pause. Pad: RT/A gas, LT/B brake
(analog value read), X boost, Y overtake, d-pad-up aero, LB/RB shift, View camera,
Menu pause.

Full gamepad menu navigation is shipped on the settled UWP mapping — d-pad and
both sticks synthesize arrows with 450 ms/130 ms hold-repeat, A activates, B backs
(via a real `cancel` event for `<dialog>` layers, because a synthetic Escape is
untrusted and a close-watcher ignores it), triggers page.

### 1.4 Modes

GP, Season, Career (Driver / My Team), Time Trial, Qualifying, VS Friend (2–4
player WebRTC), plus photo mode with its own free-fly camera.

**Controls are identical across every racing mode.** The only mode-dependent
input behaviour anywhere is `autoThrottle()` (TOUCH on a coarse pointer) and
`gearsManual()` (manual gears need a free thumb, so BUTTONS and TOUCH force auto).
That uniformity is a strength and no finding below asks to break it.

Photo mode is the exception and is worth noting for a reason that has nothing to
do with photo mode: **it already ships a working virtual thumbstick** (`.pc-stick`
/ `.pc-nub`, with the zoom-correct radius maths already solved). A joystick steer
mode would not start from zero.

---

## 2. Two corrections to the record

### 2.1 We already have haptics

The gamepad brief asserted "no rumble/haptics at all" and the agent built a
punch-list item on it. Wrong. `Input.rumble()` calls
`playEffect("dual-rumble", …)` with a `weakMagnitude` at 0.7 of strong, and it is
wired alongside `navigator.vibrate` at four sites: crash impact
(`js/game.js:3535`), kerb strike (`:4137`, on a 0.12 s re-arm), front-axle
saturation (`:4678`, scaled by bite), car contact (`:4861`), and the brake cue
(`js/physics/brake-cue.js:76`).

The research is still worth keeping, for three things the agent got right
independently:

- **Compat is narrower than we assume.** `vibrationActuator` is Chrome 68+,
  Safari 16.4+, **`false` on Safari iOS**, and Firefox has never shipped
  `playEffect` — it has only the non-standard `hapticActuators[0].pulse()`. Our
  silent no-op degradation is correct, but we have no Firefox path at all.
- **A new effect preempts the running one**, and the spec recommends a 5 s
  maximum duration — so a sustained rumble must be re-issued, not fired once.
- **The Game Accessibility Guidelines make a haptics slider a *Basic* item**, not
  an advanced one: "Include toggle/slider for any haptics." We have neither.

### 2.2 We already have a steering gamma — that is the problem

The gamepad agent's #3 was "no steering linearity/gamma at all". We have one:
`js/game.js:4433` applies `shaped = sign(s)·|s|^STEER_EXPO` with `STEER_EXPO`
defaulting to **2.4**, exposed as the `pm-expo` LINEARITY slider.

At 2.4 that sits at the top of ACC's recommended pad band (gamma 2–3) and well
past F1's community-consensus linearity of 30–40. So the curve is not missing and
is not obviously mis-valued.

The real defect is one the external agent could not have seen: **it is a single
curve applied to the unified steer command, so every source shares it.** The
comment in `steer-tuning.js` is explicit that this was a deliberate correction —
an older note claimed it was "tilt + keys" only and would have misled anyone
tuning for a gamepad. But documenting the sharing does not fix it. A player who
tunes LINEARITY for the drag mode on a phone has, by the same act, re-tuned their
gamepad; a value that makes a thumbstick precise near centre makes the on-screen
arrows mushy, and `digitalStep` has to invert it on every frame just to stay
linear in the space that matters.

This is the highest-leverage structural finding in the audit and it is not a bug
report — it is a design decision to re-open.

---

## 3. Findings by device

### 3.1 Mobile / touch

**Already at or above the field:** three steer modes is broader than Asphalt or
F1 Mobile and matches RR3/GRID; One-Euro filtering on the gyro is better than
anything the shipped racers document; the analog pedal slide is ahead of the
category; `viewport-fit=cover`, safe-area insets on the dock, a 24 px painted tap
floor across the whole HUD-zoom range, non-passive canvas `preventDefault` (which
is also the edge-swipe guard the research recommends), and an orientation-aware
tilt axis across all four rotations are all shipped.

**Gaps, in order:**

1. **TOUCH mode has no sensitivity setting**, and `touchRangeFrac`
   (`js/input/input.js:665`) is dead — declared, read, never assigned. The 12 %
   long-edge default is ~80 px of thumb travel for full lock on an iPhone SE in
   landscape, which RR3 player feedback puts on the sensitive side ("anything
   beyond 0–3 sensitivity is making micro turns impossible"). A community survey
   of RR3 gyro users found **~70 % self-select medium-to-low sensitivity** —
   people want *more* travel for full lock, not less.
2. **No speed-sensitive gain on the drag mode.** ADAPTIVE BUTTONS gives the rate
   half to keys and arrows only. Drag is where it matters most, because a thumb
   flick at 320 km/h is the same gesture as one in a hairpin.
3. **No affordance for drag mode.** It is an invisible control — the classic
   discoverability failure. Mario Kart Tour ships exactly the fix as a
   "Steer/Drift Button Display" option: a transient indicator at the anchor.
4. **No on-screen control resize or left/right mirroring.** Rush Rally 3's
   control-resize tab is the single most consistently praised control feature in
   its reviews; F1 Mobile ships left- and right-handed wheel configs as
   first-class enumerated options. We have a BUTTON SIZE slider for the dock, but
   no mirroring and no per-control placement.
5. **No tilt invert toggle.** Codemasters maintains a dedicated support article
   for inverted tilt, which is what a real support load looks like.
6. **No named beginner mode.** TouchDrive is Asphalt 9's *default* and the biggest
   onboarding lever in the category. We have every ingredient already — road-follow
   help, racing-line pull, auto-throttle, brake cue — but they are four separate
   sliders in ADVANCED rather than one named thing. Note the counter-evidence:
   Asphalt players resent discovering TouchDrive's ceiling late, so such a mode has
   to say what it costs.
7. **Coalesced pointer events are not used.** Since Chrome 60 the browser aligns
   continuous input to `requestAnimationFrame`, so we get ~1 `pointermove` per
   frame regardless of the digitizer's 120 Hz. `getCoalescedEvents()` recovers the
   merged samples with their true timestamps — which the One-Euro filter is
   already timestamp-driven and would consume for free. Chromium-only; feature-detect.
   **Do not use `getPredictedEvents` for steering** — prediction overshoot on a
   direction reversal is exactly the failure mode that makes a car feel twitchy.

### 3.2 Apple platform

Numbers below are from Apple's own HIG content API, not secondary summaries.

**The HIG numbers we should be holding ourselves to:** iOS button minimum
**44×44 pt** default / 28×28 pt for secondary controls; body text 17 pt default,
**11 pt minimum**; contrast 4.5:1 to 17 pt and 3:1 at 18 pt or bold; ~12 pt padding
around bezelled elements, 24 pt around unbezelled; support 200 % text enlargement.

Our dock's `--hold: 72px` / `--tap: 54px` clears 44 pt comfortably. The 24 px
painted floor at minimum HUD scale does **not** — it is a WCAG 2.5.8 floor, and
Apple's game-controls guidance wants 44×44 pt for frequently-used controls. Worth
re-reading that floor as a *game* control rather than a generic target.

**Three HIG lines that read as direct criticism of our dock:**

- *"position buttons where they don't overlap system features like the Home
  indicator or Dynamic Island"* — we inset by `env(safe-area-inset-*)`, which is
  the mechanism, so this is satisfied. Keep it that way.
- *"Always include visible and tactile press states… a visual press state effect,
  such as a glow, that they can see **even when their finger is covering the
  control**."* Our `.steerbtn:active` changes background fill *under* the thumb.
  A glow or ring that extends **outside** the button's own footprint is the
  documented fix, and we do not have one.
- *"Avoid using abstract shapes or controller-based naming like A, X, or R1 as
  artwork."* Our dock uses `OT` and `AERO` as text labels. `OT` in particular is
  an abbreviation a new player cannot decode.

**Hard platform limits — record these so they stop being re-investigated:**

| Limit | Consequence |
|---|---|
| **No element fullscreen on iPhone Safari** (iPad only, with an undismissable overlay button) | Stop treating fullscreen as the answer. **Add to Home Screen is the only real fullscreen on iPhone** |
| **`screen.orientation.lock()` is `false` in every Safari**, and manifest `orientation` is ignored on iOS | Our rotate-to-landscape prompt is the correct and only answer. It already exists, with a "RACE IN PORTRAIT" escape — which matters, because iOS Rotation Lock can otherwise make the prompt a dead end |
| **No `preferredScreenEdgesDeferringSystemGestures` equivalent on the web** | We cannot defer the home-indicator swipe. The bottom safe-area band must stay a no-critical-controls zone — which our dock inset already achieves |
| **`Gamepad.vibrationActuator` false on Safari iOS**; `navigator.vibrate` unsupported | No haptics of any kind on iOS. Our degradation is right; never make a cue haptic-only |
| **rAF throttled to 30 fps in Low Power Mode**, not overridable | Already handled by the fixed-step loop, and already recorded in `DRIVING-CONTROLS-RESEARCH.md` |
| **`overscroll-behavior` has no effect on non-scrollable containers in Safari** | The CSS-only rubber-band fix does not work for a game page. Our non-passive `preventDefault` on the canvas is what actually does the work |
| **`user-scalable=no` ignored since iOS 10** | `index.html:5` still carries `maximum-scale=1`; the comment at line 9 already acknowledges it is ignored. Harmless, but `touch-action` is the mechanism that works |
| **Arrow and Tab `keydown` unreliable with an external keyboard on iPadOS** (WebKit 149054) | Our WASD co-defaults already mitigate this. Worth stating in HOW TO PLAY |

**One thing that changed in our favour:** as of iOS 26 / Safari 26.0, *every*
website added to the Home Screen opens as a web app by default, no manifest
metadata required. The Add-to-Home-Screen path now reliably yields a chromeless
standalone launch with a stable visual viewport — no toolbar reveal mid-race, no
pull-to-refresh reachable. **That is worth an explicit in-game prompt.**

**Motion permission persistence is the trap we have not designed for.** WebKit
does not durably cache the `DeviceOrientationEvent.requestPermission()` grant per
origin the way Chrome does — it is effectively per-session, so a cold PWA launch
re-prompts. Our `setSteerMode("tilt") → enableTilt()` path requests inside the tap,
which is correct. What is missing is the *recovery* affordance: a player who is
already on TILT from a previous session gets no prompt on a fresh load until
something calls `requestGyro()` again.

### 3.3 Gamepad

The single clearest finding of the audit: **our pad layer is a well-built
keyboard-emulation surface with essentially none of the analog tuning that racing
games have shipped for fifteen years.**

| Knob | Us | F1 | ACC | Forza | iRacing |
|---|---|---|---|---|---|
| Steer inner deadzone | **0.14 fixed** | 0 (3–5 if drift) | 2–4 % | 5 | — |
| Steer saturation / outer | **none** | 0–20 | — | 95 | — |
| Steer linearity / gamma | 2.4, **shared with every other device** | 30–40 recommended | gamma 2–3 | — | 60–70 % |
| Steering rate limit | **none** | Steering Rate, 100 % default, 160 max | Steer Speed / Filter | — | — |
| Speed sensitivity | **none** | — | 70–80 % recommended | — | — |
| Trigger deadzone / curve | 0.12 boolean only | brake DZ 5, brake lin 35, throttle lin 50 | — | 0/98, 2/98 | — |
| Calibration / visualiser | **none** | — | — | — | — |

Four of those are real defects rather than missing luxuries:

1. **Deadzone 0.14.** XInput's suggested 0.2395 is the outlier nobody uses for
   driving; every shipped racer is between 0 and 0.05. We permanently discard the
   first 14 % of stick travel, which on an F1 car is exactly the small-correction
   band. Worse, it is applied *without an outer rescale* — so the useful range is
   compressed as well as shifted. The scaled-radial form
   `(|x| − dz) / (1 − dz − sat)` removes both problems and has no step at the
   boundary.
2. **The d-pad teleports to full lock.** `if (btnDown(pad, 15)) ax = 1; else if
   (btnDown(pad, 14)) ax = -1;` bypasses `digitalStep` entirely. Every other
   digital source in the file ramps; this one does not. At 300 km/h a d-pad tap is
   an instant full-lock input. XAG 107 explicitly requires the digital path to
   *work*, not merely exist.
3. **Stick drift has no answer.** Nearly every pad shipped in the last decade uses
   a resistive potentiometer whose wiper grooves the track — Nintendo confirmed
   Switch 2 Joy-Cons are still not Hall effect. The correct shape is a *small*
   deadzone plus a rest-offset calibration stored per `gamepad.id`, plus a
   saturation slider so a worn stick can still reach lock. A single large fixed
   deadzone is the wrong shape of solution and punishes good hardware to
   accommodate bad.
4. **Steer and pause are unrebindable.** `PAD_RESERVED = {9, 14, 15}` and the
   keyboard's `KEY_RESERVED` lock Escape, Enter, Tab, P, Backquote, F9. XAG 107:
   remap *all* controls "including the Esc key on PC games", and "assign an action
   to all potential game inputs, as opposed to simply swapping button assignments".
   The defensible design is **reserved by default, rebindable with a warning**,
   with only the genuinely undeliverable chords documented as impossible.

**Things we already get right**, worth stating so they are not "improved" away:
the standard-mapping indices all match the W3C spec; the analog brake path reads
`.value` (`brakeLvl = max(0.15, Input.brakeLevel())`) so trail braking survives
and the 0.12 is edge-detection only, exactly as the research recommends; the menu
stick deadzone (0.22) is deliberately larger than the driving one; `padPrevButtons`
is kept across a blur so a held button is not re-read as a fresh edge;
`clearEdges()` stops a mashed pause menu from spending boost and grabbing a gear
on the first frame after RESUME. That last one is a bug class most games ship with.

**Two gaps at the seams:**

- **Disconnect does not pause.** We zero every input and clear the nav state on
  `gamepaddisconnected`, and we correctly check whether *another* pad is still
  present rather than assuming the last one left. But the race keeps running. The
  convention is pause + a reconnect overlay naming the lost pad.
- **Button labels are id-sniffed with no override.** That is genuinely the state
  of the art — the spec says the `id` format is "left unspecified", and
  standardising `vendorId`/`productId` is still an open W3C issue. But it will get
  Switch Pro (whose physical A/B are swapped relative to Xbox), 8BitDo in Nintendo
  layout mode, and MFi pads wrong, and Safari may not return enough string to
  decide. An Auto / Xbox / PlayStation / Nintendo override is the fix.

### 3.4 Desktop

**Ahead of the field:** `e.code` for layout independence; two physical binds per
action (F1 22–24 offer two whole *presets*, not two binds per action); Arrow
**and** WASD live by default, which is ahead of F1 24's `A/Z` + `,/.`; E up /
Q down matching the modern Forza Horizon convention; blur and `visibilitychange`
both clearing held state, which Emscripten/GLFW and p5.js both have open bugs for.

**Gaps:**

1. **No steering rate control of any kind.** Our 250 ms to lock / 125 ms to centre
   is one designer's taste imposed on everyone. Unity's legacy default is 333/333;
   AC exposes speed sensitivity + gamma + filter; BeamNG exposes filters +
   linearity; DiRT Rally 2.0 players repurpose *saturation* as the ramp-rate
   control; F1 23 added Steering Rate. DiRT Rally 1's *absence* of one was a
   standing community complaint. Note the specific warning from the AC Advanced
   Gamepad Assist author: **keyboard wants a lower rate than a controller**, and
   250 ms to full lock is on the fast side for a 300 km/h car.
2. **ADAPTIVE BUTTONS damps turn-in and countersteer identically.** It halves the
   *build* rate with speed and never touches release. Good implementations split
   the two deliberately — "small course corrections on a high speed straight are
   damped, while oversteer control remains intact" — because damping a countersteer
   is damping the recovery. This is the assist's central design flaw and it is not
   a tuning value; it is a missing distinction.
3. **No look-back / look-left / look-right.** FH5 binds ↓/←/→, F1 binds End,
   iRacing Z/X. In a game about defending a position this is functional.
4. **No manual reset / recover bind.** Rescue is automatic only. `R` is the
   universal default (FH5 rewind, PolyTrack, Slow Roads).
5. **Space = boost fights two priors**: Space is handbrake in Forza/NFS and gear-up
   in F1. It is the default most likely to produce a wrong-reflex moment.
6. **Shift as the advertised downshift is a Windows hazard.** Five consecutive
   Shift presses opens the Sticky Keys prompt; holding right Shift for 8 s opens
   Filter Keys. Both steal focus mid-lap, and downshifting through a gearbox is
   exactly a rapid-repeat Shift pattern. E/Q primary is right; Shift should not be
   in the advertised path.
7. **Fullscreen + Escape is broken outside Chromium.** In fullscreen on Firefox
   and Safari, Escape exits fullscreen and never reaches our pause handler.
   `navigator.keyboard.lock(['Escape'])` fixes it in Chrome 80+ — and the
   permission prompt Chrome announced for 131 was **cancelled**, so it is not
   permission-gated. We do not call it. Because `KeyP` is also *reserved*, a player
   who wanted pause elsewhere has no path at all.
8. **`e.code` with no layout-aware label.** `keyLabel()` maps `KeyW → "W"`
   unconditionally, so an AZERTY player rebinding sees "W" on a key their board
   calls Z. `navigator.keyboard.getLayoutMap()` is the API; Chromium-only and
   experimental, so it needs a fallback — but the current state is actively
   misleading on non-QWERTY hardware.
9. **The rebind capture has no IME guard.** `js/ui/key-binds.js` checks
   `e.isTrusted` but not `e.isComposing`/`keyCode === 229`. A CJK player opening
   the binder with an IME active captures garbage.
10. **No Meta-key release-all.** On macOS the OS does not deliver key-up while
    Command is held, so `keydown W → Cmd → release W` produces no `keyup` and the
    key sticks — reproduced in Chrome, Firefox and Safari. Meta is in
    `KEY_RESERVED`, which stops it being *bound*, but nothing releases held keys
    when it goes down. The same argument applies to Alt on Windows (Alt+Tab).
11. **No toggle / auto-accelerate on desktop.** XAG 107's worked example is
    literally "holding down RT to keep the car accelerating throughout a 3-minute
    race", and notes that remapping does not fix fatigue — only a toggle does.
    We auto-throttle in TOUCH mode already; the mechanism exists.
12. **Wheels are a partial story, not a blank one.** We warn on
    `mapping !== "standard"` and then read `axes[0]` anyway — which is the steering
    axis on most wheels, so steering likely works by accident. Pedals will not:
    they are not buttons 6/7 on a wheel. Real FFB is Chromium-only via WebHID, is
    per-vendor (Logitech's report format ≠ Thrustmaster's ≠ Fanatec's), and is a
    project in itself; a guided "turn the wheel / press throttle" axis-mapping
    wizard is the cheap 80 %.

---

## 4. Ranked improvements

Ordered by (player impact × confidence) ÷ cost. Nothing here is committed work.

### Tier 1 — defects, small, high confidence

1. **Fix `js/ui/onboard.js` to read `Input.keyBindings()`.** It teaches `A` for a
   control bound to `Z`, and hardcodes all three marks so a rebind is never
   reflected. HOW TO PLAY already does this correctly; the pattern exists to copy.
2. **Ramp the d-pad through `digitalStep`** instead of assigning `ax = ±1`.
3. **Drop the pad steer deadzone to ~0.05 and rescale after it** —
   `(|x| − dz)/(1 − dz)` — so there is no step at the boundary and no lost range.
4. **Add an IME guard and a Meta release-all** to the key handling. Two lines each.
5. **Wire `touchRangeFrac` to a TOUCH SENSITIVITY slider.** The knob already exists
   in the code and the 2026-08 research already asked for it.

### Tier 2 — the knobs players expect and cannot find

6. **Per-device steering curves.** Split `STEER_EXPO` so tilt / drag / digital /
   stick can each carry their own, defaulting every one to today's 2.4 so nothing
   moves for an existing player. This is the structural item; everything in Tier 2
   is cheaper after it.
7. **A steering rate slider on desktop**, and a saturation/outer-deadzone slider on
   the pad. Both are universal in the category and both are single values.
8. **Speed-sensitive gain for TOUCH and the stick**, matching what ADAPTIVE BUTTONS
   already gives the digital sources. Legal under the `docs/PHYSICS.md` arc rule —
   it reads own speed, never curvature — but it should be assist-gated or a slider,
   not silent.
9. **Split ADAPTIVE BUTTONS' damping** so it slows turn-in without slowing
   countersteer.
10. **Make steer and pause rebindable**, reserved-by-default with a warning rather
    than permanently locked.
11. **A haptics slider.** GAG rates it *Basic*; we ship haptics with no way to
    turn them down.

### Tier 3 — reach, and worth prototyping

12. **A named beginner mode** bundling road-follow + line pull + auto-throttle +
    brake cue, reversible from Settings, honest about its ceiling.
13. **Look-back and manual recover binds.**
14. **A drag-mode anchor affordance** — transient, fading, at the touch-down point.
15. **On-screen control mirroring** for left-handed play, and per-control
    placement beyond the existing size slider.
16. **`keyboard.lock(['Escape'])` in fullscreen**, plus a browser-aware pause prompt.
17. **`getLayoutMap()` for bind labels**, with a `key`-capture fallback.
18. **Pause + reconnect overlay on `gamepaddisconnected`.**
19. **Pad label override** (Auto / Xbox / PlayStation / Nintendo).
20. **A wheel axis-mapping wizard.** Not FFB — just "turn the wheel, now press
    throttle" so a G29 owner can drive.
21. **Coalesced pointer events** feeding the existing One-Euro filter on the drag
    axis. Feature-detected; no prediction.
22. **A press-state glow outside the button footprint**, per Apple's explicit
    "visible even when their finger is covering the control".
23. **An in-game Add to Home Screen prompt on iOS**, now that Safari 26 makes every
    site installable as a standalone web app.

---

## 5. Negative decisions — do not build these

Recorded so they are not re-litigated in six months.

- **Traction control and ABS.** Unchanged from `DRIVING-CONTROLS-RESEARCH.md`:
  no longitudinal slip model exists for either to act on, so both would be
  switches that visibly do nothing. The prerequisite is a slip model, not a menu
  entry.
- **A virtual steering wheel.** The category ships one (RR3 methods D/E, GRID
  Wheel Touch, F1 Mobile configs 4–7) and reviewers actively warn against it —
  "it actually makes steering unnecessarily difficult". Linear finger travel on
  glass has no ergonomic relationship to gripping and rotating a wheel. It costs
  the most screen and the most thumb travel per degree of any archetype. If the
  touch settings screen ever looks thin, a *thumbstick* mode is the better spend —
  and photo mode has already solved the widget.
- **`getPredictedEvents()` for steering.** Prediction overshoot on a direction
  reversal is precisely the twitchiness we would be adopting it to avoid.
- **Chasing the Fullscreen API on iPhone.** It does not exist there and has not
  for six years. Add to Home Screen is the answer and is now the default path.
- **Force feedback as a headline feature.** Chromium-only, per-vendor, and a
  project in itself. The axis-mapping wizard captures most of the value.
- **A single larger pad deadzone to paper over stick drift.** It punishes good
  hardware to accommodate worn hardware. Calibration plus saturation is the
  shape that works.

---

## 6. Unverified — do not cite these as fact

Carried forward from the research passes with their doubts intact.

- **"Tilt or Touch?" (2018)** quantitative results — 30 % fewer collisions, ~12 s
  faster, 55 % prefer touch. ResearchGate returned 403; these came from a
  search-engine synthesis only. The *direction* (tilt objectively faster, touch
  subjectively preferred) is corroborated by the RR3 community evidence; the
  numbers are not sourced.
- **MacKenzie et al., "Comparing Order of Control for Tilt and Touch Games"** —
  returned 503, unread. This is the most relevant primary source to our drag mode
  (position control vs velocity control: does drag distance set the steering
  *angle* or the steering *rate*?) and remains the biggest hole in this audit.
- **F1 24/25/26 "defaults"** quoted in §3.3 are community *recommendations*. The
  only primary-source defaults confirmed are F1 22's, from EA's own calibration
  pages: all nine values default to 0 on a 0–100 range.
- **Forza and GT7 factory defaults** are a guide author's recommendations, not a
  Turn 10 / Polyphony source.
- **The exact maths of Codemasters' "linearity" and "saturation"** is undocumented
  by EA. "Linearity ≈ exponent" is an inference.
- **iOS 26.5 breaking the `<input switch>` haptic trick** — one search summary,
  no primary source. The verified breakpoint is **iOS 18.4** (interaction required,
  grant lapses after ~1 s), which already makes the trick useless for continuous
  kerb feedback and marginal for discrete events.
- **Landscape safe-area inset point values** and a claimed "phantom top dead zone"
  on iOS come from a community gist, not Apple. The HIG gives numeric insets only
  for tvOS and visionOS. Read them at runtime from `env()`; never hardcode.
- **Analog trigger fidelity in Safari on iOS** — standard mapping *should* expose
  `buttons[6].value` continuously, but no primary WebKit source confirms Safari iOS
  returns anything but 0/1. This decides whether analog throttle/brake works from a
  pad on an iPhone and needs a device test.
- **No playtest data of our own was taken.** Every number of ours quoted here —
  36°, 12 %, 90 px, 4/8 units/s, 0.14, 2.4 — is evaluated against published
  guidance, not against measurement. The tuning claims in Tier 2 are hypotheses,
  and `tools/check/physics-tune-sweep.mjs` is where they should be settled.
