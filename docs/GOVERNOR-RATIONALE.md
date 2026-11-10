# PerfGov — the governor's design rationale (`js/perf/governor.js`)

Moved verbatim out of `js/perf/governor.js` (2026-11-10) so the eager boot wall stops parsing ~42 KB of
comments on every visit; the same method as [GFX-CONTRACT.md](GFX-CONTRACT.md). Each long comment block in the
source became a one-line `// Why: docs/GOVERNOR-RATIONALE.md §gov-N.` pointer; §gov-N below is that block, word
for word, with the code line it sat above. Edit the rationale here. The tier table stays in the source (a test
pins it). Line numbers are from the tip before the move (`9adb7a38`).

### gov-1

Above `let _frameEMA = 16.7;` (was line 14).

```text
Holds framerate by scaling the 3D render resolution (gfx.setRenderScale) when
frames run slow, restoring sharpness when there's headroom. Conservative:
only downscales when clearly missing THIS DEVICE'S OWN observed budget (see
_floorMs below — ~19 ms EMA at the 60 fps default) so a healthy vsync-capped
display never degrades; upscales slowly to avoid oscillation.

SETTLE, don't HUNT: every scale change reallocates all HDR/bloom targets
(setRenderScale -> resize -> createTargets) — a visible hitch. The old
governor bounced around the budget edge (down at >19 ms, straight back up at
<14 ms, with a coarse 0.1 down-step that easily overshot the up threshold),
so a phone on GRAPHICS: HIGH — which sits right at that edge (DPR 2.0 + the
haze/lamp-volumetric passes STANDARD keeps off) — oscillated ~once a second
and each realloc read as a "jump". Now: snap down promptly, then HOLD the
lower scale (_downHold) and only creep back up under clear, sustained
headroom (<12.5 ms below the derived budget — see _floorMs). Desktop /
STANDARD-tier sit at scale 1 and never enter these branches, so their
(already smooth) behaviour is unchanged.
```

### gov-2

Above `let _govT = 0;            // frames since the last evaluation` (was line 32).

```text
TWO CLOCKS. `_frameEMA` settles per FRAME (alpha 0.1 a frame), so the
windows that exist only to let it settle before a verdict — the 45-frame
evaluation cadence and the short post-step verify windows in `_govCool` —
stay frame-counted: they are the same number of samples at any refresh
rate. The waits this file PROMISES IN SECONDS — the recovery hold, the
refused-climb backoff, the restore and verify-fail cooldowns — were frame
counts too, and every comment translated them at 60 fps: a 120/144 Hz
display ran each ~2x faster than designed, weakening exactly the settling
guarantees described below on the devices most likely to run the game.
Those now run on `_govCoolMs` / `_downHold` in ms of the dtMs tick() gets.
```

### gov-3

Above `let _live = false;` (was line 50).

```text
A COOLDOWN ONLY MEANS SOMETHING WHILE FRAMES ARE BEING MEASURED. Boot arms
two of them before the first race tick — js/ui/scale.js applyResMode() ->
setAutoRes(true) on every load, js/perf/quality-preset.js applyLive() -> setUserTier(2)
on every phone — and tick() only counts them down in a race, so the first
300 race frames were spent inside a cooldown that protected nothing. That
window is the ONLY one in which a device slow from frame 1 is catchable:
`_frameEMA` (alpha 0.1) outruns `_floorMs` (0.02 upward) over roughly frames
10–95, then the floor arrives at the same number and the device reads as
externally capped for the rest of the session. A phone steady at 33 ms from
lights-out was never degraded at all. So: arm a cooldown only while live
(menu-time changes are settled by the race-start reset in sentinelArm
anyway), and re-open the window at every race start.
```

### gov-4

Above `const CLIMB_SURVIVE_MS = 30000;` (was line 70).

```text
A CLIMB IS NOT PROVED BY SURVIVING ONE EVALUATION — IT IS PROVED BY SURVIVING
THE LOAD. `_pendingVerify` reverts a climb that was wrong within one
evaluation window; it cannot see a climb that the next heavy corner undoes
eight seconds later. Both are the same mistake — the headroom was A GAP IN
THE LOAD, not the device getting faster — but only the first one cost the
governor any patience, and `_upBackoff` was then reset by every climb that
merely passed its verify. So on a circuit with one heavy section per lap,
which is every circuit, the governor cut in the heavy part, climbed back
through the light part, and did the same again next lap, for the whole race.
Each end of that cycle reallocates every HDR/bloom/SSAO/god-ray target
(setRenderScale -> resize -> createTargets) — what this file's header already
calls "a visible hitch". Measured against this same tick() (a 26 ms section
for 8 s of a 35 s lap, 13 ms elsewhere): 30 reallocations in a 300 s race, a
median 8.1 s apart, clustering at 4.7 s, and the scale ends back at 1.0 —
every one of them bought nothing, which is the whole complaint. A cut that
lands while a climb is still on probation is therefore charged exactly like a
verify-refused climb, and patience is restored only by a climb that OUTLIVES
the window. The governor then settles on the scale that holds through the
heavy section instead of chasing the track layout around the lap.
One lap's worth of load variance: shorter, and the next lap's heavy section
still reads as a fresh, uncharged cut, which is the bug.
```

### gov-5

Above `let _scaleCap = Infinity;` (was line 92).

```text
A CUT IS EVIDENCE ABOUT THE SCALE IT CUT FROM, and nothing kept it.
`_scaleFutile` records that the scale LEVER bought nothing; no state recorded
that a particular scale VALUE did not hold. So one hold later the restore
ladder climbed straight back toward the resolution the governor had just
measured as too expensive, the next heavy section proved it too expensive
again, and the pair repeated for the whole race. Patience alone cannot fix
that — it only spaces the same wrong climb further apart. Keeping the
ceiling ends it: never climb to within one down-step of a scale that missed.
THE SENTINEL MUST NOT BE A VALUE THE MEASUREMENT CAN PRODUCE. This was
initialised to 1 and compared with `>= 1`, which made "nothing refused yet"
and "scale 1.0 missed the budget" the same state — and 1.0 is the scale a
cut most often comes FROM. So on the single most common shape, a device
that holds the budget at 0.9 and misses only at full resolution (this
file's own header example: "a phone on GRAPHICS: HIGH... sits right at that
edge"), the ceiling stayed 1, the ladder climbed straight back into the
resolution that had just missed, and the cap contributed nothing. Verified
against the unfixed code: byte-identical reallocation timestamps. Infinity
is unreachable by any cut or refused climb, so `> 1` now means exactly
"no measurement yet".
```

### gov-6

Above `let _capProbeMs = CLIMB_SURVIVE_MS;` (was line 117).

```text
The ceiling EXPIRES, or a device that was slower for one stretch — a weather
effect, a full field on lap one, a thermal excursion that passed — could
never have its resolution back. UNBROKEN headroom is the whole
discriminator, and it is the SAME question the survival window above asks
from the other side: a climb is believed once it has outlived a lap's load
variance, so a ceiling is forgotten once it has gone that long unchallenged.
One constant, both directions. It lifts the ceiling ALL THE WAY rather than
a step at a time — a genuine recovery should not buy its resolution back one
reallocation per minute — and a ceiling that was right is simply re-measured
by the one climb that follows, at the doubling patience every refusal earns.
```

### gov-7

Above `const DEGRADE_CONFIRM = 2;` (was line 142).

```text
THE OTHER SIDE OF THE SAME LOOP, from PR #190. The state above damps the
RESTORE side — a climb must outlive the load, and a scale that missed is
remembered so the ladder stops walking back into it. This damps the DEGRADE
side: a repeat cut must be confirmed before it is paid for. They are
independent and both are kept; between them the cut and the climb each have
to mean something before a reallocation is spent on it.
Consecutive evaluations over the degrade threshold before the governor spends
a render-target reallocation. Two is one confirmation, ~0.75 s apart at 60 fps
(tick() evaluates every 45 frames) — long enough that a transient cannot move
the scale, short enough that real overload is still caught promptly.
```

### gov-8

Above `let _scaleFutile = false;` (was line 156).

```text
The scale lever is INEFFECTIVE on this device right now — set when a
scale-down step was reverted for buying nothing, cleared once a tier has been
shed (the next rung may change that) or once headroom returns.

Without it the ladder cannot be reached on a CPU-bound frame. The degrade
branch sheds a tier only in the `else` of "did setRenderScale move?", and
setRenderScale only refuses at the 0.5 clamp or its 0.02 dead zone — so while
the scale can still nominally step, `stepped` is true every time and the
tier branch is never evaluated. On a frame whose cost is not fill-bound,
every one of those steps is then reverted by the verify below for failing to
improve the EMA, and the governor loops forever on the one lever that cannot
help while shedding nothing. Measured on an iPhone at Bahrain/night, build
1284, 25 s per backend: WebGL2 sat at scale 0.80 / tier 0 / 23 fps, while
WebGPU and three.js — where the scale lever did bite — reached tier 2 and ran
at 60 and 40 fps. The slowest backend was shedding the least work.

"Reverted for buying nothing" is the honest signal that the lever is wrong,
and it is already computed; this just stops throwing it away.
```

### gov-9

Above `let _computeBound = false;` (was line 192).

```text
THE §2au DISCRIMINATOR (docs/notes/PERF-FINDINGS.md §2au). The floor below does
what it was built to do — and that is the defect: on a genuinely slow phone
it converges on the sustained frame time within ~2.7 s, `degradeAt` becomes
unreachable, and only the ladder's FIRST rung is ever taken (live capture:
Suzuka, 32.2 fps, scale 0.5, tier 0, nothing shed). The floor cannot tell a
slow device from an externally capped one, but `_pendingVerify` already
can: an external cap is INDIFFERENT to render scale, a compute-bound frame
is not. So a verified step — a down-step the EMA felt, or an up-step it
refused — latches `_computeBound`: the floor rewinds to the lowest value
observed this race (`_floorMinMs`, the budget the device had when the
episode began) and may then only creep at FLOOR_UP_A_BOUND, so the ladder
keeps shedding rather than restoring until the rungs run out or stop
helping. A verified INDIFFERENCE — a down-step that bought nothing, big
probe included, or a tier probe rolled back — clears the latch, as do the
restore branch (the device meeting its pre-episode budget again), a frame
below the race's best cadence (a cheap moment: the budget is intact), and
race start. The capped-clock protection is untouched: a capped device never
produces the evidence that latches this, so its floor still converges on
the cap and it still settles at full quality.

Two guards keep the held floor from overshooting. The ceiling's headroom
test in _ageClocks reads `_floorShadowMs` — a shadow floor that adapts at
the normal rates and never rewinds — because against the held floor a
plateaued EMA would read as "still missing" forever and a measured ceiling
could never age out. And a latched degrade step must clear the held
threshold by DEGRADE_OVER a second time: the margin over a stale minimum
is weaker evidence than the margin over a live floor, so it is asked for
twice — the same conservatism DEGRADE_CONFIRM applies in time, applied in
magnitude. A lap's heavy section, ~1 ms over the held threshold after two
cuts, is absorbed; a §2au device, several ms over it at every rung, is not.
```

### gov-10

Above `let _floorMs = 16.7;` (was line 231).

```text
THE BUDGET IS DERIVED, NOT HARDCODED. "> 19 ms" only ever meant "slower than
a 60 Hz display can go" — it silently assumed the frame INTERVAL is a proxy
for frame COST, which is true only while the display is what you are
competing with. Under an external cap (iOS Low Power Mode throttles rAF to
30 fps, a 30 Hz panel, a browser background throttle) the two decouple: every
frame lands at ~33.3 ms no matter how cheap it is to draw, an interval-driven
governor downscales to the floor and sheds every optional feature within ~27 s,
and NONE of it can help — the clock is capped externally and has nothing to
do with how long the frame takes to draw. `_floorMs` tracks the FLOOR of
observed frame intervals (a low percentile, not the mean — the fastest this
display has actually gone) and the thresholds below are relative to it, so a
60 Hz panel keeps the plain numbers (floor settles near 16.7 ms) while
a capped device is correctly judged to be MEETING its budget instead of
chasing a number it cannot move. Pulled toward a faster observed frame
quickly (that is direct evidence the device can go there); crept toward a
slower one slowly, so a single stray heavy frame can't redefine the budget —
only a SUSTAINED absence of fast frames (exactly what a hard rAF cap looks
like) moves it.
```

### gov-11

Above `const SPIKE_MS = 100;` (was line 253).

```text
DEGRADE_OVER sits ABOVE the floor; RESTORE_WITHIN also sits above it, just
barely. That asymmetry is what lets the governor go both ways: a restore
threshold 4.2 ms BELOW the floor, `_frameEMA < _floorMs - 4.2`, is
UNSATISFIABLE: `_floorMs` chases dt down at alpha 0.3 and
up at 0.02 while `_frameEMA` moves at 0.1 in both directions, so from their
shared 16.7 start `_floorMs <= _frameEMA` is an invariant and the EMA can
never get 4.2 ms below a floor that is already at or under it. Simulated
over 60 million frames across constant 8.3/16.7/33.3, bimodal, uniform
1-96 ms and load-then-recover sequences: the predicate fired ZERO times and
its closest approach was exactly 4.2000 ms — the threshold itself, at every
steady state. Any device that degraded once would stay degraded for the
whole session, and the crash sentinel's pre-drop at js/game.js could never
climb back either.

The reason no statistic over dt could have worked: the frame INTERVAL is
clamped from below by vsync. A frame costing 4 ms and one costing 15 ms both
report 16.7 ms on a 60 Hz panel, so headroom is invisible in the interval by
construction. Degrade works because slowness genuinely stretches the
interval; restore cannot be the mirror of it. What IS observable is the EMA
settling back ONTO the floor — that means frames have stopped missing — so
restore asks for exactly that, and the up-step is verified like the down-step.
SPIKE_MS is the "this frame is not evidence" cap; SPIKE_RUN is how many
consecutive over-cap frames stop being a spike and start being the device.
3 at <10 fps is ~0.3-0.6 s — long enough that a resume or a GC pause never
reaches it, short enough that a genuinely slow device is seen almost at once.
SLOW_CAP is the ceiling on a sample from inside such a run. It is NOT
SPIKE_MS: clamping a run to 100 would make every sub-10-fps state read as
exactly 100 ms, and `_pendingVerify` judges a step by whether the EMA MOVED —
so the governor could see that it was slow but never whether a cut helped,
and would revert every step it took. 1 s keeps real magnitude across the
whole 10-fps-to-1-fps range while still bounding a pathological hitch; a tab
resume never reaches it at all, because one frame is not a run.
```

### gov-12

Above `let _pendingVerify = null;   // {kind:"scale"|"tier", prev, ema} for the last unverified step` (was line 291).

```text
MAKE THE DEGRADE CAUSAL. The derived budget above is the right model but
takes a couple of seconds to settle; this is the net for while it does, and
for any cause of capping the model does not anticipate. Every downscale/
feature-shed step is provisional until the NEXT evaluation: if the EMA did
not improve by a meaningful margin, the step bought nothing, so fill rate
was not the bottleneck — revert it and hold off rather than immediately
repeating the same failed step, which is what turned one bad guess into
"runs to the bottom of the ladder and stays there for the session".
VERIFY_MARGIN is deliberately SMALL, not "how much better should this look":
a genuinely GPU-bound step (fill rate really was the cost) still shows a
real, if partial, improvement — a 0.1 scale cut rarely halves the frame,
because plenty of per-frame cost does not shrink with the render target —
so a margin sized for "meaningfully better" discarded real, working steps
and re-tried them every cycle, which is a slower version of the exact
oscillation _downHold exists to prevent (measured while tuning this: at
margin 2 a genuinely slow device cycled its scale down and back up every
~7 s forever instead of settling). A capped clock, by contrast, shows
~zero improvement — the frame time was never coupled to the render target
at all — so even a small margin still tells the two apart.
```

### gov-13

Above `const STALL_TRIM = 2;` (was line 313).

```text
ONE STALL IS NOT A VERDICT EITHER, and the verify above is where it lands.
A single 50-100 ms frame (a compositor hitch, a GC: SPIKE_MS lets anything
under 100 ms through) lifts `_frameEMA` 3-8 ms, decaying over ~10 frames.
Taken just before an evaluation it crosses `degradeAt`, the cut is priced
against that inflated EMA, and 75-135 frames later the EMA has relaxed back,
so the step "verifies" by regression to the mean, whatever it bought. On a
phone a verified shed then latches `_phoneSlowLatch` for the session (raised
by #3657; replays: docs/notes/PERF-GOVERNOR-QUANTUM-2026-10-23.md). So the degrade
gate and both ends of a verify read `_evEMA`: the same alpha-0.1 average,
fed the same samples, except that a multi-vsync stall (over 2.5 floors)
enters as ONE missed vsync (2 floors), for at most STALL_TRIM per evaluation
window. A 16.7/33.3 mixture, the shape of real overload at 60 Hz, is fed
unchanged; so is every frame of a run of stalls past the second, and onset
is as fast as the EMA's (a boxcar window mean was tried first: it lags a step
in load, and replay D's slow-from-lights-out device was never cut). The
restore gate keeps the plain EMA, so a stall can still only delay a climb.
```

### gov-14

Above `const SENT_ACTIVE = "apex26.raceActive";` (was line 345).

```text
Crash sentinel.
A jetsam/OOM kill leaves NO signal — no pagehide, no contextlost, no error.
The only detectable trace is the in-race flag persisted at race start still
being set at the NEXT boot. Mobile tier only: desktop tabs don't get
jetsam-killed, and the desktop test suite must never enter safe mode. The
flag is disarmed whenever the tab is hidden (a background kill is normal iOS
housekeeping, not our crash) and re-armed on return. Strikes pre-degrade the
governor at boot so a phone that died mid-race last session starts
conservative instead of dying the same way again; each cleanly FINISHED race
pays one strike back down, so a recovered device climbs back to full quality.
```

### gov-15

Above `const SENT_BUILD = "apex26.crashStrikesBuild";` (was line 363).

```text
The build those strikes were earned against. A strike is evidence that THIS
CODE killed this device — and the moment the code is replaced that evidence
expires. Without this the safe mode is a one-way door: a build that ran the
phone out of memory leaves two strikes behind, the floor pins at tier 4 with
the render scale pre-dropped to 0.7, and the ONLY way back is finishing whole
races on a game that now looks broken enough that nobody wants to. Exactly
that happened: shipping vendor/ switched a Rapier world on, phones started
dying, and fixing it changed nothing on the devices already in safe mode.
```

### gov-16

Above `let _autoShed = 0;` (was line 387).

```text
How many rungs the GOVERNOR has shed on its own measurements, net of what it
has restored. This is NOT _perfTier, and the difference is a bug that shipped:
the degrade branch steps from `_floorTier()`, so on a device whose player had
chosen GRAPHICS: MEDIUM (_userTier 2) the first measured shed wrote
`_perfTier = 3` — the governor ADOPTED the preset as its own evidence — and
the restore branch walks back down only as far as `_floorTier()`, i.e. 2. So
`autoTier()`, which reads _perfTier, was pinned at >= 2 for the rest of the
session however completely the device recovered, and every gate spelled
`autoTier() >= 1` (PER-CHUNK LAMPS and the PER-CHUNK ROAD rider on it) stayed
off for good. Reported from a MEDIUM preset as "chunk lights isn't working
even with the slider", while the tuner's own note promised it "returns on its
own when frames recover" — which below GRAPHICS: HIGH it could not.

autoTier() cannot simply be redefined as floor + this count: the degrade
branch stops once the EFFECTIVE tier reaches 4, so the count saturates at
`4 - _userTier` and the tier-4 post consumers (bloom, SSAO, god rays) would
become UNSHEDDABLE on exactly the low presets that most need them shed — the
post-mortem recorded above autoTier(). So the two answers stay two accessors:
autoTier() is WHERE THE LADDER STANDS (still _perfTier, still reaches 4), and
autoShed() is HOW MUCH THE GOVERNOR SHED BY EVIDENCE, which is what a feature
held off "because this device is missing frames" has to ask.
```

### gov-17

Above `let _tierHold = false;` (was line 409).

```text
HOLD THE LADDER. A measurement that compares two captures of the same scene
(the image-grade tonal tests, lighting-ab's fog glow) is only a measurement of
the thing it changed if the tier is the same at both captures. On the Metal
runner it was not: at 26-38 fps the governor stepped 0 -> 2 -> 4 between a
baseline and its "changed" frame, and the tests read bloom/SSR/lamp-budget
sheds as a grade curve darkening highlights by 44/255 (run 3469). Pinning the
scale made it WORSE — with the scale lever gone the ladder is the only lever
left (see the degrade branch). setUserTier() is a floor, so it cannot hold a
tier at 0; this is the missing pin. Held: no shed, no restore; the scale
lever and every accessor keep working. Never set by the game itself.
```

### gov-18

Above `const OPEN_FRAMES = 600;   // ~10 s at 60 fps, ~20 s at 30` (was line 422).

```text
THE OPENING WINDOW, recorded so a player's own device can answer a question
this repo's containers cannot. "WebGPU lags for the first few seconds and
then runs fine" is a report about frames that have already gone by the time
anyone can read `perf()`, and every EMA in this file is designed to forget
them — `_frameEMA` at alpha 0.1 has lost a 400 ms frame within a second.
R23 measured four candidate causes on SwiftShader and excluded all four
(docs/PERF-FINDINGS.md §2x); what was missing was not another hypothesis but
the ability to see the stall on the hardware that has it. So: over the first
OPEN_FRAMES after a race starts, keep the single worst frame and a count of
how many ran over twice the derived budget. Two numbers, no allocation, and
they survive into `__apex.perf()` for as long as the race does.
```

### gov-19

Above `let _userTier = 0;` (was line 437).

```text
The USER's floor, from the GRAPHICS preset (js/perf/quality-preset.js). It is a
third term in tier()'s max(), and that is the whole interaction rule:

  a manual choice sets the FLOOR of degradation, never the ceiling.

The player may always ask for LESS than the governor would run, and never for
MORE than the device has measurably earned. `_perfTier` is evidence about
THIS device THIS session (the derived _floorMs budget); `_userTier` is a
prior, and a prior may narrow the search downward but may not assert the
device is faster than it measured — GRAPHICS: ULTRA on a thermally throttled
laptop must not re-enable the god-ray march the governor just proved
unaffordable. Folding it in HERE rather than at the eight PerfGov.tier() call
sites in js/game.js means the render path needs no edit at all, and it makes
the crash-sentinel floor undefeatable by CONSTRUCTION — it is a term in the
same max(), so no caller can forget to check it.
```

### gov-20

Above `st.rawSet(SENT_BUILD, build);` (was line 492).

```text
New code, clean slate for the LADDER: a strike is evidence about code
that no longer exists, so the safe-mode floor must not outlive it.

The ticked-session evidence was recorded first. SENT_ACTIVE is the trace a
jetsam kill leaves, and a busy day ships a fresh build every ~8 minutes
(the shell version guard pushes returning players straight onto it), so
dropping it here wipes the record between a crash and the next launch
and `crashStrikes: 0` reads as "no OOM kill has happened", which the
field cannot say either way. This counter is DIAGNOSTIC ONLY —
it feeds no tier, no floor, nothing the player can feel — so it can
survive a deploy without the safe-mode one-way door the comment on
SENT_BUILD warns about.
```

### gov-21

Above `function sentinelResume() {` (was line 534).

```text
RE-ARM WITHOUT THE RESET. The visibilitychange handler used sentinelArm(true)
for a tab RETURN, which is not a race start: it dragged the boot-window reset
along, snapping _frameEMA and _floorMs back to 16.7 on a device whose budget
the governor had already derived. On a 30 Hz capped display (Low Power Mode)
that re-armed the exact "degrade a capped clock" bug _floorMs exists to
prevent — one scale step down, a revert 45 frames later, two visible target
re-allocs per app switch — and it made __apex.perf().open describe the last
un-hide instead of the race start. This only re-arms the sentinel.
```

### gov-22

Above `if (on) { _frameEMA = _floorMs = 16.7; _slowRun = 0; _openN = 0; _openMax = 0; _openSlow = 0;` (was line 555).

```text
Race start / return to a live session: re-open the boot window described
at `_live` — both averages restart from their shared 16.7 so the EMA can
outrun the floor once more. Desktop too (above the mobile-only guard):
the governor runs everywhere, only the sentinel is mobile.
_scaleMoves resets with the race so every race gets one prompt cut; the
confirmation gate then applies to the repeats within it. The ceiling and
the probation reset with it for the same reason: a new race is a fresh
device, and neither half may carry a verdict into it.
```

### gov-23

Above `_setCrashFloor();` (was line 592).

```text
RECOMPUTE THE FLOOR. Paying a strike down must move the floor, not just
the counter, or _perfTierFloor stays at whatever init() derived for the
WHOLE session. One strike floors the tier at 2, and tier() >= 2 is exactly
the gate that sheds dry SSR and lamp shadows (wet roads use a smaller budget),
while tier() >= 1 sheds PER-CHUNK LAMPS and the env probe — so a single
crash (or one sentinel trip that was never a crash) would pin those
features off until a reload, whatever GRAPHICS says. On mobile only ULTRA
forces that reload (it flips the mobileHigh bit, see
js/perf/quality-preset.js syncBootTier), so the symptom reads as "wet
sheen and per-chunk only work on ULTRA" rather than as a stuck floor.
clearStrikes() recomputes the floor the same way; both go through
_setCrashFloor() so they cannot drift apart.
```

### gov-24

Above `function _ageClocks(stepMs) {` (was line 636).

```text
JUDGE DRAWN FRAMES ONLY. RenderRate (js/perf/render-rate.js) skips rAFs on
purpose: every second one on a 120 Hz phone, a credit-paced share in its
"45"/"30" tiers. The interval after a skipped rAF is the bare vsync, no draw
in it, and judging it dragged `_floorMs` down to the fast cadence: replayed
against this tick(), a 120 Hz phone holding a steady half-rate draw made 4
reallocations, and a 60 Hz phone on "30" (33.3/16.7 alternating) made 10 and
shed to tier 4. Judging the summed interval between DRAWN frames instead was
tried and is worse: the tiers' credit pacing draws some rAFs back to back, so
those intervals jitter by a whole vsync and a cheap 120 Hz phone on "45" shed
to tier 4. So `drawn === false` (game.js passes RenderRate.drew(), the
verdict on the rAF this interval began at) keeps only the wall clocks
running, since every hold in this file is a promise in ms, and the frame is
not evidence. Omitted or true: exactly the old path.
```

### gov-25

Above `_live = true;` (was line 688).

```text
`_autoRes` gates the RESOLUTION stage ONLY — it must not return early here,
or a user-facing control silently disables a safety system: RESOLUTION:
LOW/MED/HIGH (js/game.js, applyResMode) calls setAutoRes(false) to stop
the governor fighting the pinned scale, and an early return takes stage 2
down with it. A player who pins the resolution — a control shown to
EVERYONE, desktop included — would get no feature shedding at all for the
session: `_perfTier` frozen at whatever init() left it, and a pre-degraded
crash floor never paid back down (cleanRace() alone does not move `_perfTier`).
Pinning the resolution is a statement about SHARPNESS, not a request to
stop adapting; it makes stage 2 MORE important, not less, because the
cheaper lever is now unavailable. So the EMA and the derived floor are
tracked unconditionally (stage 2 judges against the same budget and needs
the data), and `_autoRes` is consulted only at the two places that actually
move the scale.
Ignore huge spikes (tab resume, GC): they'd yank the scale. But a SPIKE is
one frame: a bare `if (dtMs < SPIKE_MS)` that drops every sample above the
cap makes the governor BLIND ON EXACTLY THE DEVICES IT EXISTS FOR. Below
~10 fps every frame is over the cap, nothing reaches the EMA, and
`_frameEMA` sits at the 16.7 that sentinelArm() left it: the governor reads
59.9 fps, `degradeAt` is never crossed, and the whole ladder stays parked
at tier 0 during a slideshow. Measured 2026-09-02 in a live browser
(bahrain, GLX): 2 rAF frames in 17.5 s — 0.11 fps real — while
`__apex.perf()` reported `{fps: 59.9, floorMs: 16.7, tier: 0, scale: 1}`.

A backgrounded tab cannot fake a run: js/game.js hides -> setPaused(true),
and the tick call site is gated on `!paused`, so Chrome's ~1 Hz background
rAF throttle never reaches the governor at all. Checked, not assumed.
So: keep discarding an ISOLATED over-cap frame (tab resume, a GC pause),
and stop discarding a RUN of them. SPIKE_RUN consecutive slow frames is not
a spike, it is the device's actual speed, and from there the sample is fed
clamped to SLOW_CAP — enough for the EMA to outrun the floor and trip
`degradeAt`, and to still MOVE when a step helps, without letting a
pathological hitch enter at its full value.
```

### gov-26

Above `const failed = v.up ? (ev > v.ema + VERIFY_MARGIN)` (was line 765).

```text
A DOWN step is a bet that frames get cheaper: revert unless the EMA fell
by at least VERIFY_MARGIN. An UP step is the opposite bet — that the
headroom was real — so it is judged the other way round: revert if the
EMA got WORSE by that margin. Same instrument, mirrored, because a step
that made things worse should be undone whichever direction it went.
The floor probe (below) must buy back at least half the miss: crossing a
quantum moves the average by a whole vsync, and a probe that deep must
not be kept on the 0.5 ms of evaluation-phase noise a small step is.
```

### gov-27

Above `const now = _gfx.getRenderScale ? _gfx.getRenderScale() : 1, big = 0.5;` (was line 787).

```text
ONE QUANTUM PROBE BEFORE "FUTILE". The interval is vsync-quantised:
a fill-bound phone whose frame costs 18-22 ms presents every 33.3 ms,
and a 0.1 cut that takes it to 17-19.5 ms still presents at 33.3, so
the EMA cannot move and the cut reads as buying nothing. Replayed, cost
c*(0.4+0.6*s^2) with c = 22 or 20 ended at scale 1, floor 33.3: 30 fps
for good where ~0.75 scale gives 60. So a small cut that failed is
retried ONCE as a big one, judged against the same pre-cut EMA. A
capped clock or a CPU-bound frame fails that too and is declared
futile exactly as before, at the price of one more cut and revert; a
cut that crossed climbs back through the usual verified restore steps
under the ceiling.
THE PROBE GOES TO THE FLOOR, not to half the pixels. Half the pixels
crosses only while the fixed share leaves room: replayed with 40 %
fixed cost, c = 24-30 ms ended at scale 1 / 33.3 ms, where 0.5-0.7
holds 60 (sweep: docs/notes/PERF-GOVERNOR-QUANTUM-2026-10-23.md).
The floor is the one probe that answers "can the scale lever cross a
quantum at all"; a second, deeper probe would cost every Low Power
Mode phone one more reallocation per race. The climb then finds the
highest scale that holds: the ceiling (one step under the small cut)
and the verified halving climb do the search.
```

### gov-28

Above `if (ev <= degradeAt) _degradeArm = 0;` (was line 856).

```text
ONE SPIKE IS NOT A TREND. Every scale change reallocates all HDR/bloom
targets, and on TLX tlx-post.js disposes each texture and the depth texture
before reallocating, so the node renderer rebuilds the post chain's bind
groups too — a visible hitch either way. Acting on a single evaluation
therefore spends a hitch on any load spike, and a race is made of them: a
restart with the field bunched, rain arriving, a pile-up spawning debris.

MEASURED against the real tick() over ten simulated minutes. Steady load
never degrades at all, and neither does a smooth swing of up to 12 ms
(_floorMs is derived, so it rises to meet sustained cost — the EMA came
within 1.1 ms of the threshold and never crossed). But load that STEPS
faster than the floor estimator adapts produced 35-83 reallocations per ten
minutes, gaps of 1-5 s: exactly "a lag spike every few seconds". Requiring
the condition twice took the same six cases from 424 reallocations to 126,
and to ZERO wherever the step was 10 ms or less, while still degrading on
genuinely sustained overload. A doubling backoff on held climbs was also
measured and is noise (424 -> 383), so it is not here.
THE FIRST CUT OF A RACE STAYS PROMPT. A device that is slow from lights-out
is catchable only for about frames 10-95 — the EMA (alpha 0.1) outruns the
derived floor (0.02 upward) for that long and then the floor catches up and
a steady cost reads as an external cap for good. That window is barely two
evaluations wide, so confirming inside it means never degrading such a
device at all; perf-governor.test.mjs pins exactly that case, and it failed
when this gate applied to every step. Confirmation is therefore only asked
of REPEAT cuts, which is where the oscillation lives: one spike costs at
most one reallocation per race instead of dozens.
```

### gov-29

Above `let stepped = false;` (was line 885).

```text
With the scale PINNED (_autoRes false) the ladder is the only lever left,
so fall straight through to shedding instead of skipping the evaluation.
THE RENDERER'S BOOLEAN IS THE "SCALE LEVER EXHAUSTED" SIGNAL — ask it,
don't predict it from `cur > 0.5`. This was `if (_autoRes && cur > 0.5) {
if (setRenderScale(...)) {...} } else if (shed)`, and that structure made
the WHOLE LADDER DEAD CODE in the shipped default. Traced in floats:
stepping 1.0 by -0.1 gives 1 -> 0.9 -> 0.8 -> 0.7000000000000001 ->
0.6000000000000001 -> 0.5000000000000001. That last value is one ULP
ABOVE 0.5, so `cur > 0.5` is true forever; setRenderScale then clamps the
request to 0.5 and rejects it as a 1.1e-16 change against its own
`Math.abs(s - renderScale) < 0.02` dead zone in GLX.setRenderScale; and
because the outer `if` was ENTERED, the `else if` that sheds a feature was
never evaluated. Net effect: with _autoRes on (the default) the governor
could scale down and then did nothing at all, forever — no tier was ever
shed by evidence. Only the GRAPHICS preset's _userTier still bit, because
that is a separate term in tier()'s max().
Using the return value removes the epsilon dependency entirely rather than
chasing the constant; tests/unit/perf-governor.test.mjs pins that boolean
as the gfx contract PerfGov.tick() relies on.
```

### gov-30

Above `_pendingVerify = { kind: "tier", prev: _perfTier, shed: _autoShed, ema: ev };` (was line 913).

```text
Step from the EFFECTIVE tier, not from _perfTier alone. A rung at or
below the floor (crash sentinel, or the player's GRAPHICS preset) is
already shed, so incrementing onto it changes nothing the EMA can see:
the causal check would read "this step bought nothing", revert it, and
re-try the same dead rung every cycle while frames keep missing —
_pendingVerify's own failure mode, reached from a direction it cannot
distinguish, because the step genuinely did not help and the reason
(redundant, not mis-targeted) is invisible to a frame-time delta.
Skipping to floor+1 guarantees every step is one that can be felt.

THE GUARD READS _perfTier, NOT THE EFFECTIVE TIER, and that is the
whole point. Gating on `Math.max(_perfTier, _floorTier()) < 4` made
GRAPHICS: LOW (_userTier 4, so _floorTier() 4) false on its very first
evaluation: _perfTier and _autoShed could never leave 0, so autoTier()
and autoShed() — which exclude the user floor ON PURPOSE — returned 0
for the whole session and bloom, SSAO, god-rays, contact shadows and
per-chunk lamps were UNSHEDDABLE on the preset that exists to make the
game cheap. That is verbatim the failure the autoTier() comment below
says it fixed ("_perfTier is the effective tier and can always climb to
4"); the accessor was corrected and the producer that feeds it was not.
Stepping still starts from the floor, so LOW takes one felt 0 -> 4 step
and every other preset behaves exactly as before.
```

### gov-31

Above `let stepped = false;` (was line 952).

```text
The up-step is VERIFIED like the down-step. Restoring is a guess that the
headroom is real, and the same _pendingVerify machinery that reverts a
useless cut reverts a premature restore one evaluation later — without
it, a governor that can finally go up could climb straight back into the
frame misses it just escaped, which is the oscillation the header warns
about arriving from the other side.
SAME SHAPE AS THE DEGRADE BRANCH, and for the same reason. Climbing from
the floor at +0.06 reaches 0.9800000000000004, and the next request —
Math.min(1, cur + 0.06) === 1 — is a delta of 0.019999999999999574, just
under setRenderScale's 0.02 dead zone, so it is rejected and the scale
pins at 0.98 for the session. That is a 4% pixel deficit nobody asked for,
but the real damage was structural: `cur < 1` then stays true forever, so
the tier-restore `else if` below was unreachable and a shed feature could
never come back. That is the same one-way door the RESTORE_UNDER = 4.2
post-mortem in this header was written to close, reintroduced by a float
epsilon. Falling through on a rejected step lets the ladder restore.
THE SNAP HAS TO HAPPEN A STEP EARLY, not at the end. Going to 1 only once
cur + 0.06 exceeds 1 does not work: from 0.9800000000000004 the request IS
exactly 1, and |1 - 0.98000000000000043| = 0.019999999999999574, still
inside the 0.02 dead zone. The last 0.02 of the range is unreachable by
any step that starts inside it. So snap when the remaining gap is under
one and a half steps and take it in one 0.08 move, which clears the zone:
0.5 -> ... -> 0.9200000000000004 -> 1. (Verified by float trace; the
recovery test in tests/unit/perf-governor.test.mjs asserts it lands on
exactly 1.)
```

### gov-32

Above `const gap = ceil - cur;` (was line 984).

```text
HALVE THE GAP, don't crawl it. A fixed +0.06 needs eight steps to get
from the 0.5 floor back to full — eight target reallocations, eight
hitches, to undo one cut — and the crawl was the only thing protecting
the climb from overshooting, because nothing remembered a scale that
had already missed. `_scaleCap` is that memory now, so a bigger step is
the SAFER one: it converges on the ceiling in four, and a step that
does overshoot is reverted by the same verify and lowers the ceiling
onto the rung it refused, which a crawl never learned to do.
SNAP FROM ONE DOWN-STEP OUT, not from 0.09. The threshold has to clear
the width of a CUT (0.1) or the commonest climb there is — undoing a
single cut, 0.9 back to 1.0 — costs two reallocations instead of one:
0.1 is not under 0.09, so it stepped to 0.96 and snapped from there.
Every snap delta this admits is at least 0.03, still far outside
setRenderScale's 0.02 dead zone.
```

### gov-33

Above `let _drift = null;` (was line 1022).

```text
Forget the crash history and lift the floor NOW, without waiting for whole
finished races to pay it down one at a time. The escape hatch behind
__apex.safeMode(false).
#2652 thermal drift (opt-in, apex26.thermalDrift=1): a phone that heats up gets
slower minutes before frames MISS, so ThermalDrift's slow-drift detector may take
ONE existing rung early. It is the degrade branch minus the verify: the step is
a bet on the future, not on the next EMA, so a verify would revert it at once.
_scaleCap = cur keeps the restore gate from climbing straight back; the cap
ages out on unbroken headroom exactly as for a measured miss.
```

### gov-34

Above `function driftRenderRate() {` (was line 1035).

```text
Thermal drift, first resort on a phone: cap the PRESENTED rate before
trading quality. RenderRate's 45 tier draws 3 of every 4 vsyncs at
60 Hz — a quarter less work per second to sustain — while every drawn
frame keeps full quality; the governor rungs (driftStep) trade pixels
and features instead. Only an UNDECIDED player is moved: mode "auto"
means no explicit DISPLAY choice, and setMode is session-only
(js/perf/render-rate.js: persisting is the caller's job) — a hot
afternoon must not rewrite the stored preference, so the next boot
re-reads the store and starts at "auto" again. An explicit mode
(off / half / 45 / 30) is the player's word and is never overridden,
and desktops keep the governor rung: render-rate tiers are a mobile
facility (state().mobile). Once this engages, the mode is no longer
"auto", so a later drift step in the same session falls through to
driftStep — the response still escalates, one mechanism per step.
```

### gov-35

Above `autoTier: () => Math.max(_perfTierFloor, _perfTier),` (was line 1085).

```text
Crash + measured only — no GRAPHICS user floor. Wet-road SSR and the
lighting-tuner "why off" path still read this: a healthy LOW must keep a
reduced wet-reflection budget (post-common.roadReflection) without the
crash floor, and raising the preset must not need a reload to undo a
measured shed. READS _perfTier ON PURPOSE — see the degrade-branch note
above autoShed(). Do NOT gate bloom/SSAO/god-rays/contact/lampVol on this
alone: that left GRAPHICS: LOW with the full look-post stack on a healthy
phone (autoTier 0 while tier() is already 4), which measured slower than
MEDIUM on iPhone WebGPU (BrowserStack 2026-10-21). Those passes read
lookPostShed() instead.
```

### gov-36

Above `if (t < prev) {` (was line 1124).

```text
RAISING QUALITY MUST RELEASE WHAT THE OLD PRESET CAUSED. The degrade
branch steps from _floorTier(), which folds in _userTier, so a shed taken
while the player sits on MEDIUM writes _perfTier = 3 — the governor
adopting the preset as its own evidence, exactly what the note below
forbids. Without this, GRAPHICS is one-way on a phone (default MEDIUM):
raising to HIGH leaves tier() at 3, so SSR, per-chunk lamps and both
shadow maps stay off until a reload (ULTRA only seems to work because it
flips the mobileHigh bit and forces one). Dropping to the new floor on a
RAISE gives the device a clean chance to prove itself; if it still cannot
hold the budget the governor re-sheds within a couple of evaluations, on
its own measurements. Also clears the phone slow latch: the player opted
back into more effects.
```

### gov-37

Above `_pendingVerify = null;` (was line 1140).

```text
_perfTier is deliberately NOT touched here. It is the governor's OWN
evidence-based tier; the floors are applied at READ time in tier(). An
earlier draft pulled _perfTier up to the new floor, which conflated "shed
because the device struggled" with "shed because the player asked" — and
then lowering the preset could not release what the preset itself had
caused, because the governor had adopted it as its own finding. The
redundant-step problem that motivated the pull-up is solved where it
actually lives, in the degrade branch, which skips rungs the floor
already covers.
Both feature and resolution attribution expire when the preset changes
frame cost. Keep the current provisional scale: restoring its old value
here would override a potentially necessary cut without new evidence.
```

### gov-38

Above `scaleFutile: () => _scaleFutile,` (was line 1170).

```text
THE TWO LATCHES THAT CAN DISABLE A LEVER FOR THE REST OF THE SESSION,
exported rather than left private so "why did this device shed nothing?"
is answerable from a hook, not by re-deriving this file's state by hand
against a diagnostic payload (docs/notes/PERF-FINDINGS.md §2au). A latch is
not a fault on its own: the restore branch clears both the moment headroom
returns, so reading them TRUE means a lever is currently parked, not that
it is broken. Read them
beside floorMs and autoShed — floorMs says what budget the device is being
judged against, and autoShed (not tier, which folds in the crash floor and
the player's GRAPHICS preset) says what the governor shed on its own
evidence.
```
