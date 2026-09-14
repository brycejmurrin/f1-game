# Mobile controls — second research pass (2026-09-14)

Follow-up to `CONTROLS-AUDIT-2026-09.md`, which implemented 23 items across three
tiers. Four parallel web-research passes (tilt/gyro, touch & buttons, competitive
scan, accessibility), each briefed with what we already ship and with the seven
ideas the first pass REJECTED, so nothing here re-proposes a virtual wheel,
traction control, `getPredictedEvents()`, iPhone fullscreen, or force feedback.

**Every checkable claim below was verified against our own source before being
written down.** Two recommendations turned out to be already implemented and one
turned out to be backwards — those are recorded as loudly as the gaps, because
the expensive mistake is rebuilding something we have.

## 0. Already ours — do NOT rebuild

- **Gravity-vector tilt.** The tilt pass recommended deriving steering from a
  gravity vector rather than raw `beta`/`gamma` (Euler angles gimbal-lock as
  `beta` → ±90°, i.e. a reclining player). `js/input/input.js` onOrient() already
  does exactly this: beta/gamma → `(gx, gy, gz)` → remap by
  `screen.orientation.angle` → `atan2(h, hypot(other two))`. The agent hedged the
  claim `[WEAK]` for shipped practice; it was right to.
- **One-Euro is the correct filter; no change indicated.** Kalman and
  complementary filters solve SENSOR FUSION, which the browser has already done
  before `deviceorientation` fires. Stacking one on a fused signal adds lag for
  nothing. (One-Euro: Casiez et al., CHI 2012.) No game-specific
  latency-vs-smoothness comparison exists in the literature — that was searched
  for and not found.
- **ANALOGUE THROTTLE ON THE TOUCH PEDAL — and this one is a competitive
  ADVANTAGE, not a gap.** The competitive scan named binary 100%-gas/100%-brake
  as "the category's real gap… what destroys car control", with GRID's Throttle
  Slider as the only full answer. We already have it: `wireHold("btn-throttle")`
  captures real travel into `btnThrottleVal`, `throttleLevel()` returns it, and
  `js/game.js:3903` drives `throttleLvl` from it. Verified end-to-end. The
  remaining half of that idea — COAST / one-pedal lift-off — is genuinely open.
- **Presets + granular sliders is the endorsed shape.** XAG 108 asks for "four or
  more" presets AND separate per-mechanic assists. ROOKIE/RELAX/STANDARD/PRO plus
  11 knobs is that pattern, and the names pass XAG's "must not denigrate the
  player" test. The claim that few presets beat many sliders on cognitive load is
  UNEVIDENCED — only forum opinion exists.

## 1. Defects in what we ship

- **The HAPTICS slider is a dead control on every iPhone.** `navigator.vibrate`
  has never shipped in Safari or iOS Safari (through 26.6), and all iOS browsers
  are WebKit; `Gamepad.vibrationActuator` is false there too, which `rumble()`
  already documents. `vibrate()` feature-detects and no-ops safely — but
  `index.html` renders the slider and `steer-tuning.js` wires it
  UNCONDITIONALLY, so an iPhone player gets a control that does nothing at either
  end. This is the CORNER LEAD bug class exactly: a control that lies about what
  it does. **Fix: feature-detect and hide.**
- **`vibrate()` needs priming on Chromium.** User activation is required, and
  `touchstart` no longer counts — it wants a click. An unprimed in-race cue is
  silently blocked with a console intervention. **Fix: one throwaway
  `vibrate(1)` from the GO/START click.**
- **Tilt is our DEFAULT** (`steerMode = "tilt"`). WCAG 2.2 SC 2.5.4 Motion
  Actuation (Level A) requires motion functionality to also be operable by UI
  components AND to be disableable; the "Essential" exception cannot apply
  because BUTTONS demonstrably works. Our permission-refusal fallback only fires
  on refusal. Game Accessibility Guidelines are stricter — complex input
  "included only as supplementary". **This is a first-run product decision, not a
  code detail: it changes what every new player gets.**

## 2. Highest-value additions

Ranked. The first two were named INDEPENDENTLY by more than one pass, which is
the strongest signal in this document.

1. **Handedness mirror** (competitive + accessibility passes). Swap which side
   carries throttle/brake. GRID ships "Mirrored Mode"; GAG lists left-hand mode
   as common practice. Cheapest one-handed/motor win available to us.
2. **Control resize / reposition / opacity** (all three non-competitive passes).
   XAG 107 states it as a REQUIREMENT, not a preference: "Allow players to adjust
   the size, spacing, and positioning of all touch targets at their discretion."
   TouchArcade made its absence a headline negative in the art of rally port
   review. Our "adaptive buttons" knob is not this.
3. **Unbundle AUTO-THROTTLE from ROOKIE, and add a LATCH.** XAG 107's Duration
   section uses literally our case — "holding down RT to keep the car
   accelerating throughout a 3-minute race… and become fatigued" — and prescribes
   toggles and auto-holds. Asphalt 9 offers auto-accel across ALL THREE of its
   control schemes. Coupling it to ROOKIE forces a player with a fatigue barrier
   to accept every other ROOKIE change, which XAG 108 argues against directly.
   Third state between hold and auto: tap-on/tap-off latch.
4. **A comfort block.** We have ZERO comfort knobs among the 11. XAG 117 wants
   FOV, camera shake, motion blur and speed lines individually adjustable — all
   four of which a chase cam at 300 km/h has. Free first step: honour
   `prefers-reduced-motion: reduce` at boot to preselect low shake / no blur.
5. **DOM controls with accessible names get iOS Switch Control and Voice Control
   FOR FREE.** Highest-leverage limited-mobility feature available to a browser
   game, and it costs markup rather than engine work.
6. **Per-scheme saved profiles.** GRID saves tuning PER control scheme (Tilt /
   Tilt Pro / Tilt Custom), so a player can A/B schemes without losing their
   tuning. Ours are global.
7. **Assist auto-disengage on player input** (Slow Roads): any steer input
   disengages autosteer, rather than the assist fighting the player. See §4.

## 3. Sizing and event-handling specifics

- **Apple HIG has a GAMES-specific rule that is not 44 everywhere:** frequently
  used controls ≥ **44×44 pt**, less important ones ≥ **28×28 pt**. So
  BRAKE/GAS/BOOST are primaries; PIT/CHASE/AERO may be secondaries (still legal
  under WCAG 2.5.8's 24 CSS px AA floor). We currently size the dock as ONE class.
- **HIG also says**: keep frequently used buttons out of "the circular regions
  where players expect movement and camera input" (our dock must not overlap the
  anchored-drag steer region); "show and hide virtual controls to reflect
  gameplay" (hide PIT outside the window, OT when unavailable); put secondary
  controls at the TOP; and press states must be visible AND tactile.
- **Corner penalty**: published tap-accuracy data needs ~7 mm at screen centre
  but ~12 mm at corners. Our dock lives in the corners — add hit-slop there, and
  treat visible glyph and hit area as separate.
- **Position the dock from the bottom corners with a clamped inset, never as a
  percentage of width**, or it walks to the middle of an iPad and becomes
  unreachable. (Phone thumb-zone maps do not transfer to tablets.)
- **Pointer Events over Touch Events**: `touch-action: none` signals intent
  BEFORE listeners run, and `pointercancel` is a first-class signal that the
  browser claimed the gesture. Key the steer anchor to one captured `pointerId`,
  ignore later pointers in the steer region, and on cancel HOLD last steer for a
  frame rather than snapping to centre — that is the "lost the anchor to a second
  finger" failure mode named in the research.
- **Tilt numbers**: the spec quantises to 0.1° as an anti-fingerprinting measure,
  so a deadzone below ~0.2° is meaningless and sub-0.1° "jitter" is quantization,
  not noise. A quadratic (expo ≈ 2.0) tilt→steer mapping is evidence-backed
  (Rahman et al., CHI 2009, on the wrist axis we steer with).

## 4. What players actually hate — avoid these

- **Assists that fight the player** is the best-documented complaint in the
  category. RR3's Steering Assist "limits your race line" and "snaps you
  parallel" when recovering; the competitive community runs every assist off. Our
  driving-help must never fight a deliberate input — hence §2.7.
- **The easy-mode trap.** Asphalt's TouchDrive is the post-tutorial default, has
  a hard skill ceiling, and permanently forks the playerbase into "TouchDrive vs
  manual" with recurring fights about leaderboards. **Lesson: keep assists as
  GRADED modifiers on one scheme with an explicit graduation path, never a
  separate mode that changes which leaderboard you belong to.**
- **Undocumented coupling.** Turning RR3's Steering Assist off requires raising
  sensitivity ~+3 to compensate and the game never says so. If our DRIVING HELP
  interacts with steer rate, the UI should say it.
- **Advanced control settings outside the game** (GRID puts tilt options in the
  iOS Settings app). Do not copy.
- **Accidental mode switching** (Asphalt maps the TouchDrive toggle to d-pad up).

## 5. Where the guidelines CONTRADICT our current design

Stated plainly so the gaps are deliberate and traceable rather than accidental.

1. **Landscape-only.** XAG 107 and GAG both ask for portrait AND landscape, with
   wheelchair- and bed-mounted devices as the rationale. This is the one
   straightforward conflict. Cheap partial mitigation: don't hard-block on
   orientation.
2. **Anchored-drag TOUCH is a "dragging movement"** under WCAG 2.5.7 (AA) and is
   on XAG 107's avoid-list. It passes ONLY because BUTTONS provides equivalent
   non-drag functionality — so **BUTTONS must remain fully equivalent, never a
   degraded mode.** Worth a comment at the steer-mode switch.
3. **Our TC/ABS rejection is not accessibility-neutral.** XAG 108 names Forza
   Horizon 4's traction and stability assists as the MODEL for discrete assists,
   and GAG lists "assisted steering". Rejecting them is a legitimate design call
   for a game about learning a real racing line, but it should be recorded as a
   deliberate gap with our knobs (driving help / rate / expo / taper) documented
   as the partial substitute — not as though the guidelines were silent.
4. **Sensitivity range**: XAG 107 wants at least ±50 % from default. Unaudited.

## 6. The unclaimed differentiator

**No game in the competitive scan ships a guided control onboarding or a tilt
calibration / neutral-angle step.** Not RR3, Asphalt, F1 Mobile, GRID, Rush
Rally, or art of rally. Tilt is simultaneously the most fragile mode in the
category — Gameloft publicly acknowledged tilt breakage, Codemasters' own FAQ
workaround for inverted tilt is "switch to wheel, start a race, switch back", and
F1 Mobile players report "I tilt my phone and the car goes straight into the
wall".

We already have onboarding and a CALIBRATE button. The gap is reaching the re-zero
MID-RACE without a permission round-trip, and showing a live tilt-response
indicator while calibrating so the player can see the mapping work.

## 7. Evidence quality — do not act on these alone

- **Haptics has no measured performance benefit.** n=59 experienced sim racers,
  Brands Hatch, four feedback conditions: mid-intensity force feedback improved
  lap times; NO level of vibrotactile feedback did — yet participants rated any
  feedback higher regardless. So sell the brake cue as FEEL, default the slider
  to MID not max, and note HIG's "avoid overusing haptics" against a
  continuously pulsing cue. (Driving-safety literature does support tactile as a
  discrete WARNING channel, which is what our cue is.)
- **Adaptive/assisted touch steering has no published study.** The transferable
  evidence is dynamic-difficulty-adjustment perception research: hidden
  adjustment reads as manipulation, and a fifth of achiever-type players told
  afterwards reported a diminished sense of achievement. **Implication: SURFACE
  the adaptive-buttons knob and show current assist strength — a silent assist
  that ramps with speed is exactly the shape that reads as cheating once
  discovered.**
- **Tablet thumb-zone maps** are secondary syntheses, not primary studies.
- **Position- vs velocity-control tilt**: position-control measured ~16 % faster
  with no accuracy cost, but 10 of 12 participants PREFERRED velocity-control. We
  use position-control (right call for a racer) — so expect some complaints that
  are preference, not defect.

## Sources

Primary, and each claim above carries its strength in-line. W3C WCAG 2.2
(2.5.1/2.5.2/2.5.4/2.5.7/2.5.8, 1.4.3, 1.4.11, 2.3.3); W3C DeviceOrientation §8;
Xbox Accessibility Guidelines 103/104/107/108/117/118; gameaccessibilityguidelines.com;
Apple HIG Game controls + Playing haptics; Material 3 target sizing; MDN Pointer
Events / touch-action / prefers-reduced-motion; Casiez et al. One-Euro (CHI 2012);
Rahman et al. tilt dexterity (CHI 2009); Constantin & MacKenzie (IEEE-GEM 2014);
Murphy et al. sim-racing haptics (2026); Forza Motorsport Blind Driving Assists;
Feral Interactive GRID mobile controls interview; GyroWiki (Jibb Smart).
