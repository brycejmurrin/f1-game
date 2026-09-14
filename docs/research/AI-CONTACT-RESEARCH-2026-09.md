# AI racecraft and car-to-car contact — research (2026-09)

Web research into how to make the AI and the contact model better, run as a
six-lens workflow (`racecraft-ml`, `overtake-game-theory`, `rubber-band`,
`pbd-contact`, `frenet-vs-world`, `netcode-determinism`) and synthesised by a
seventh agent. 7 agents, 0 errors, 26 minutes, 1.1 M subagent tokens; 31 raw
proposals and 52 distinct external sources reduced to the eight below.

**Nothing here is implemented.** This is a research note, not a plan of record.

Every lens was given the real architecture and the five hard constraints, and
required to reject its own ideas that break them — the rejections are kept in
Appendix B, because a re-proposal costs more than a written-down no:

- no build step, no frameworks, no ES modules (one IIFE per file, script tags);
- determinism for 2-4 player WebRTC and the seeded `__apex.seed` replay;
- ~20 cars at 60 fps, on a 4-core box with software rendering;
- **nothing derived from track curvature or the racing line may reach the
  PLAYER with assists off** — AI may use it freely;
- physics changes answer to `tests/specs/physics-characterization.spec.js`.

Claims marked **[verified]** below were read in the tree by the synthesiser. I
re-read the three headline ones myself — `ai-drive.js:623`, `collide.js:144`,
and `incident-sim.js:223-224` against `:298`/`:315` — and they are accurate.
The rest is each lens's own reading and is NOT independently re-checked: treat
a citation here as a pointer, not a proof.

---
# Apex 26 — racecraft, contact, and the seams between them

Synthesis of six research lenses (racecraft-ml, overtake-game-theory, rubber-band, pbd-contact, frenet-vs-world, netcode-determinism). Nothing here was implemented. Repo claims marked **[verified]** I read in the tree this session; everything else is the lens's reading, which I did not independently re-check.

## What would actually change the game

The biggest single lever on how the racing *feels* is in the AI, and it is one line: `AiDrive.defendPull` opens with `if (Math.abs(kA) <= 0.004) return 0;` **[verified, js/physics/ai-drive.js:623]**, so an AI car is structurally incapable of defending anywhere the track is straight — no covering the inside into turn 1, no slipstream break, nothing until the road already bends. Three of six lenses arrived at this independently (racecraft-ml via GT Sophy's symmetric passing reward, overtake-game-theory twice via Spica's α-sensitivity and Game AI Pro ch.38's defend state), which is the strongest convergence in the whole set. But the *cheapest certain* wins are not there — they are two arithmetic defects in the contact/handback path that I verified in source and that no tuning pass would ever find: `sideContact = penLat < penLong` **[verified, collide.js:144]** expands to "classify as a side rub whenever `|dProg| < |dX| + 2.8`", so a car sitting 2.5 m directly behind another under braking is a *side* contact and gets squirted 0.68 m sideways instead of bumped (and `forceRear` cannot save it — it requires `penLat < 0.5`, i.e. the cars 1.5 m apart laterally, *and* a human in the pair **[verified]**); and `handbackCar` reads the Rapier body's velocity as `Math.hypot(vx, vz)` and sets `c.vLat = 0` **[verified, incident-sim.js:298,315,401]**, which is not the inverse of the promote map, so a car that spins during a takeover is handed back facing backwards and driven the wrong way at ≥0.43× its pre-crash speed.

The trade I would make: fix the two verified defects first because they are bounded and provable, then spend the risk budget on straight-line defence and accept that it will *reduce* overtake counts. That reads like a regression on the obvious metric and is almost certainly an improvement — the repo's own calibration already says the field produces 29 settled passes in 240 s against ~31 overtakes per *real race*, i.e. roughly an order of magnitude too many **[verified, docs/notes/AI-FIELD-RESEARCH.md]**. Fewer passes, each one meaning more, is the goal; anyone judging this change on pass count will kill the right change for the wrong reason.

## Do these

Ordered by player-visible value per unit of risk. Every entry states how it stays inside the determinism and arc-rule constraints.

---

### 1. Make the Rapier handback the algebraic inverse of the promote
*(frenet-vs-world P2 + P4, merged — same file, same seam, same test)*

**Change.** `startIncident` maps bespoke state to world velocity exactly (`vWx = spd*fx + vLat*fz; vWz = spd*fz - vLat*fx` **[verified, incident-sim.js:223-224]**). Invert it properly on handback using the body's *new* heading: `speed = vx*fx' + vz*fz'`, `vLat = vx*fz' - vz*fx'`. Four multiplies; substituting the forward map returns the originals identically. Apply the RETAIN clamp to `|speed|` and restore the sign. Separately, gate the `RETAIN_FLOOR` (0.43) on the body actually still moving — a car that visibly stopped in the gravel should hand back stopped and let `rescuePlayer`/`rescueAI` own it, as they were written to (both already apply their own pace-scaled floors).

**Files.** `js/physics/incident-sim.js`, `tests/unit/incident-gate.test.mjs`, `tests/specs/physics-characterization.spec.js`.
**Effort.** Local (the floor gate is genuinely one line). **Per-frame cost.** ~6 flops, once per handback, a handful of times per race. Zero steady-state.
**Determinism.** Arithmetic on a pose already read deterministically. Strictly *safer* than today: it removes an information-destroying step rather than adding a source. The rest of the engine already expects signed speed (`REVERSE_MAX`/`REVERSE_ACCEL`, `dirS = c.speed < 0 ? -1 : 1`, and the comment at game.js:4965 that reversing "correctly DECREASES prog").
**Cheapest experiment.** Unit-level, no browser: construct a pose with the car's yaw rotated 180° at a known speed, run the current `postStep` path and the proposed one, assert the proposed one reproduces the promote input and the current one does not. `tests/unit/incident-gate.test.mjs` already exists as the home. If that passes, a `__apex` rollout with a scripted wall hit and a `physState()` read at handback confirms sign and `vLat` survive. No human eye needed.

---

### 2. Fix the contact-normal choice: normalized penetration, plus a guard at dX ≈ 0
*(pbd-contact P2)*

**Change.** Replace `sideContact = penLat < penLong` with the scaled comparison `(penLat / WCAR) < (penLong / LCAR)`. Raw least-penetration on a 2.4:1 box is structurally biased to the short axis. At `dX = 0` the current code also hits `sgn = dX >= 0 ? 1 : -1` → always +1, pushing every directly-behind car the same direction for a contact with no lateral separation at all; add an explicit epsilon guard so the side branch cannot be entered there. Leave `forceRear`/`nestEdge` alone — they patch the diagonal-nest case and are orthogonal.

**Files.** `js/physics/collide.js` (+ `tests/specs/collisions.spec.js`, `tests/unit/collision-contact-vm.test.mjs`, `physics-characterization.spec.js`).
**Effort.** Local. **Per-frame cost.** Two divides per contact per pass, or zero with hoisted reciprocals (`LCAR`/`WCAR` are already module consts).
**Determinism.** Pure comparison change, no new state, no time dependence. It *is* a behaviour change and will move the characterization spec — that is the point, and the delta is measurable rather than felt.
**Cheapest experiment.** The pure-function path: `tests/unit/collision-contact-vm.test.mjs` already exercises `pairContact` in a VM. Sweep a synthetic grid of (dProg, dX) and dump the classification map before/after. The bug is visible as a table, not a feeling. Then a headless rollout counting rear-vs-side classifications per race shows how often the queue case is being hit in practice — which is also the honest check on whether this matters at all (see Open questions).

---

### 3. Ship the instruments before any behaviour change
*(racecraft-ml P3 + rubber-band P4 + netcode P1, merged — three lenses independently said "measure first")*

**Change.** Three read-only additions, no sim effect:
- **Contact blame.** A pure `contactBlame(dProg, dX, penLong, penLat, aSp, bSp, ...)` returning `{sev: 0|1|2|4, at: -1|0|1}` on GT Sophy's three-case taxonomy (rear-end / sideswipe / corner contact you were not rear-ended in), with iRacing's severity quantisation as the ladder shape. Accumulate onto `c.incPts`, expose via `__apex`, teach `tools/check/ai-field.mjs` to report incident points per field-lap split by severity and player involvement. **Must be hoisted out of `_colResolvePair`** — that runs inside the 4-pass relaxation loop **[verified, PASSES = 4, collide.js:293]** — into one post-resolution sweep.
- **Rubber-band tells.** A hook correlating (a) per-car lap pace against gap to the lead human, and (b) mistake rate against `pressT`. Speed-based catch-up shows as a pace↔gap correlation; legitimate error-driven spread shows as an error↔pressure correlation. This turns the folk diagnostic ("identical lap times, different finishing positions") into an assertion.
- **Net divergence.** A loopback bench (`NetTransport.loopback()` already injects reproducible latency/jitter) logging each peer's view of the same contact pair, reporting Δprog/Δx as a distribution against injected latency. The "~1 m disagreement under heavy contact" in docs/MULTIPLAYER.md is a design note, not a measurement.

**Files.** `js/physics/ai-drive.js`, `js/physics/collide.js`, `js/agent/apex.js`, `js/agent/agentview.js`, `tools/check/ai-field.mjs`, `js/net/transport.js`, `docs/DEBUG-HOOKS.md`.
**Effort.** Local. **Per-frame cost.** Blame: 0–3 calls per step (contacting pairs only), a dozen comparisons, module-scratch return. The other two are dev-only paths, zero in shipped builds.
**Determinism.** Nothing writes back into the sim; the counters are diagnostic state in the same category as `c.errCount`. **Arc-rule note:** do *not* key the straight-vs-corner test on `Tracks.curvature()` — use each car's own lateral acceleration. That keeps the classifier a state read rather than an arc read even where it touches the player's row, and `tests/unit/curvature-channels.test.mjs` stays green without an argument about which column it belongs in.
**Cheapest experiment.** It *is* the experiment. Land it, run `tools/check/ai-field.mjs` on the existing Monza/Monaco baselines, and see whether the incident numbers are boring or alarming. That answer reorders everything below it.

---

### 4. Give the AI a straight-line defence
*(racecraft-ml P1 + overtake-game-theory P1 and P6, merged — three independent arrivals)*

**Change.** The three lenses proposed the same move via different routes; the merge is: replace the `|kA| <= 0.004` hard return with a decision that does not require curvature. Two candidate decision rules, and I would build the simpler one first.
- *Simple (racecraft-ml).* `defendStraight(ctx)` fires when the chaser is inside roughly a 20 m window **and closing**, returns a cover side (the side the chaser has more room on), magnitude `lerp(0.2, 1.1, craft) · clamp(1 − gap/20, 0, 1) · clamp(coverRoom/2, 0, 1) · houseMulCtx(ctx, 0.90, 1.12, "hold")` — the same factor stack `defendPull` already uses, so the tuning surface does not grow.
- *Principled (overtake-game-theory).* Cover iff `α·theirCost − myCost > h`, with α derived from the existing house `hold` and driver `craft` (no new trait axis), and `h` a hysteresis margin per Game AI Pro ch.38.

Either way, extend the cover side to the inside of the *next* corner when `_atk.toTurnIn` is inside a braking distance — `_atk` is already computed in scope. The FIA constraints are already implemented and would simply start being exercised: `defendOnce` is the one-change-of-direction rule, `clamp(coverRoom/2,…)` is the one-car-width-on-return rule, `holdLineGap` is no-direction-change-after-deceleration. Copy the guidelines' slipstream-break carve-out — allow a bigger move at 12–20 m, shrink toward zero inside ~8 m — which is the opposite ramp from a corner cover and is what makes it read as breaking the tow rather than blocking.

**Files.** `js/physics/ai-drive.js`, `js/game.js` (~4291-4302), `tools/check/ai-field.mjs`.
**Effort.** Local. **Per-frame cost.** O(1) per AI car; `chaser`, `chaserGap`, `chaserSpeed`, `roomL`, `roomR` are already computed in the same `updateCar` pass for the existing `defendPull` call. One subtraction and one branch on ≤20 cars at 60 Hz. Write into the existing `_aiDefend` scratch — no allocation.
**Determinism.** Pure function of sim state; **no `simRnd()` draw**. The seeded stream's draw *count* is a contract (see the `launchPlan` comment: drawn from a hash, not from `simRnd()`), so if any variant later wants randomness it must go through `DriverRatings.hash32(simSeed() + …)` as `mistakeChance` already does. The one piece of new state is a cached previous chaser `dProg` per car, which must be reset in the race-reset path (js/game.js ~1830, alongside `c.cuts`/`c.penalty`) or a restart reads stale.
**Cheapest experiment.** `tools/check/ai-race.mjs field` / `ai-field.mjs` against the recorded Monza-normal and Monaco-normal baselines: settled passes, oscillation share, nose-to-tail dwell. **Predict the sign before running it** — settled passes should *fall* toward the calibration target and oscillation should fall too; if passes fall and oscillation *rises*, the defence is producing trains, not racing, and that is the kill condition. This is a headless bench, no browser group.

---

### 5. Yaw-aware contact extents — close the spun-car hole
*(frenet-vs-world P1)*

**Change.** `LCAR`/`WCAR` are fixed *combined* extents **[verified]**, which makes every car axis-aligned in the Frenet frame: heading relative to the tangent never enters the contact test. A car sideways across the track is, to the collider, a 2.0 m sliver while the renderer draws it correctly at 4.8 m wide. Replace the constants with per-car support half-widths from `psi` (yaw-to-tangent), which is already stored as `c.yawVis`: `eLong = 2.4|cos psi| + 1.0|sin psi|`, `eLat = 2.4|sin psi| + 1.0|cos psi|`. Blend the yaw term in from ~20° to ~45° so ordinary cornering slip does not silently widen every car. **Required companion edit:** `COL_BUCKET_M = LCAR` (4.8) **[verified, collide.js:62]** is no longer a valid bucket width — worst-case combined longitudinal extent becomes `2·sqrt(2.4² + 1²) = 5.2 m`, so the bucket must grow or the adjacent-bucket walk can miss a pair.

**Files.** `js/physics/collide.js`, `js/game.js`, `tests/specs/collisions.spec.js`, `tests/unit/collision-contact-vm.test.mjs`.
**Effort.** Local. **Per-frame cost.** 2 cos + 2 abs per car per step, cached (~40 trig calls/step at 20 cars), zero per pair, zero allocation. Two adds in the narrow phase.
**Determinism.** Pure function of `c.yawVis`, already sim state written before `resolveCollisions` runs **[verified: the `updateCar` loop at game.js:3421 completes before collide at :3423]**. No new inputs, no RNG. The ordering hazard is reading `yawVis` after the update loop, which is where the call already sits.
**Cheapest experiment.** Same VM harness as #2: synthesise a pair at psi = 90° and assert the current code reports no contact where the proposed code does. Then a headless rollout that forces a spin (`__apex` + a scripted incident) and counts pass-throughs. The bucket-width change needs its own assertion that no pair is missed — a brute-force all-pairs check against the bucketed result over a randomised field is the cheap version, and it also guards #8.

---

### 6. Latch the corner-priority verdict instead of recomputing it every frame
*(racecraft-ml P2 + overtake-game-theory P2, merged — GT Sophy/FIA route and the Prignoli right-of-way route converge on the same mechanism)*

**Change.** `sideYieldsA` decides who concedes from the *instantaneous* overlap against a hard `SIDE_LEVEL = 2.4`, and is called three times per step from two files (inside the relaxation loop at collide.js, plus the `squeezed` test and the rub clamp in game.js). Two cars crossing ±2.4 m of relative arc through a corner can flip the verdict many times — and the consequences are large (a full lateral clamp, a vmax cap, `squeezeBrake`). This is the exact pathology the repo already diagnosed and cured once for the pass latch (the `passTarget` comment records `|dx|` crossing 2.2 eighty-eight times in one 43 s dwell). Latch it: evaluate once when `_atk.toTurnIn` crosses zero for a pair that is alongside, store `prioOf`/`prioYield`/`prioUntil`, release at the next zone or when the pair separates by more than a car length; all three call sites read the latched verdict while live.

Two refinements worth folding in from the game-theory lens: use **two thresholds**, not one — an inside overtaker needs front axle past the mirror (`dProg > -2.4`), an outside overtaker needs front axle *ahead* (`dProg > 0`), which is the 2025 FIA asymmetry Apex does not model at all; and sample-and-hold the *room that existed* at the moment priority was acquired (Prignoli's crossing state), so the space owed is measured from when right-of-way was won, not from whenever the defender happens to look.

**Files.** `js/physics/ai-drive.js`, `js/physics/collide.js`, `js/game.js`, `js/track/core/line.js`.
**Effort.** Local, but it touches three call sites with real consequences — treat as the riskiest of the AI entries.
**Per-frame cost.** **Net negative.** `sideYieldsA` currently runs inside the relaxation loop (~8 × 20 cars × 60 Hz per the file's own comment) plus twice per AI car in `updateCar`; a latched read replaces ~10⁴ evaluations/s with a field read, against a few dozen latch evaluations per lap for the whole field.
**Determinism.** Deterministic and pure. Latch fields must be reset in the race-reset path, and **must not be replicated over the wire** — recompute locally from the same `_nProg`/`_nX` predicted values both peers already agree on. That is the specific thing to check in the multiplayer spec.
**Cheapest experiment.** Instrument first (#3): count verdict flips per corner per pair over a headless race on the current tree. If the number is small, this is theory and should not be built. If it is the 88-crossings shape the pass-latch comment records, the latch is justified by the same evidence that justified the last one.

---

### 7. Three cheap ones that need no argument

- **Publish each AI's corner-entry limit** *(overtake-game-theory P3)*. `brakeTarget` already computes `vLim` every frame; stash it as `c._vLimNow` exactly as `c._vmaxNow` is stashed, and let `attackOK` compare its own `vLim` against the blocker's. That is one-corner anticipation — "the car ahead is not slow *now*, but it will be at turn-in" — which neither `closing` nor `deficit` can see. One float store, one load. Human blockers have no `_vLimNow`, so fall through the chain `otWant` already uses. *Experiment:* `ai-field.mjs` attack-then-abandon churn should fall.
- **Braking-aware net extrapolation** *(netcode-determinism P2)*. `snapshot.js` decodes `F_BRAKE` onto every remote car **[verified, :55]** and then never uses it: `advance()` moves `s` at constant `st.speed` **[verified, :137-149]**. Integrate a small bounded deceleration when `braking` is set so a follower's *predicted contact pose* stops overshooting a braking car. This is the documented failure mode from real racing P2P netcode (the iRacing "last-millisecond brake" asymmetry). It changes only each peer's own local guess — no cross-peer bit-exactness is required or assumed, so no new float-determinism hazard, and no new trig (which Rapier's own determinism docs warn against). *Experiment:* the loopback bench from #3, before/after, at fixed injected latency.
- **Per-circuit `noPass` spans** *(racecraft-ml P5)*. Accept `noPass: [[frac0, frac1], …]` on the circuit def, zero `attackQ` across those spans at bake time, and expose the flag on `_atk` so `attackOK`'s pace-deficit floor cannot override it. GT Sophy needed exactly this and could not learn it — they hand-masked the Sarthe chicanes. Zero runtime cost, purely additive, deterministic by construction. **Must be consumed via the `def._sceneryShift` path** like `bankingProfile`/`buildCenterline`, or the mask lands two thirds of a lap away; `tools/track/verify-track.cjs <id>` is the 2-second check.

---

### 8. The collide.js solver refactor — last, and only after #2 and #5
*(pbd-contact P1, P3, P4, P5, P6, P7 — bundled because they share one prerequisite)*

**Change.** Five related fixes that all want the same missing thing: per-pair state that survives from one relaxation pass to the next.
1. **Build the manifold once.** Today `resolveCollisions` walks the broadphase five times (4 relax + 1 separation) and re-derives `sideContact` from scratch each visit **[verified]** — so a marginal pair can be classified side, then rear, then side within one frame, each branch pushing orthogonally to the last. Emit a pooled manifold list once with an expanded-bounds margin (XPBD's `k·Δt·v`, k=2), then re-evaluate only the penetration depths per pass with the axis latched.
2. **XPBD compliance instead of three magic factors** (0.35 side, 0.4 rear, 0.6 separation, with nothing carried between passes, so effective stiffness is a function of `PASSES` and is per-pass rather than per-second). Accumulate λ per contact; contact hardness becomes one number in physical units and `PASSES` becomes a pure accuracy knob.
3. **Real Coulomb friction** on the side rub instead of a flat `rubDecel` tax applied to one car. The flat tax is symmetric and is what the file's own comments record producing throttle-vs-scrub deadlocks that `squeezeEase` had to break from the AI side. Real friction is asymmetric by construction — the faster car loses, the slower gains — so there is no equilibrium to sink into.
4. **Cap depenetration speed per step** (`max(d0 − v_max·Δt, 0)`), which vanishes when there is no pre-existing overlap so normal contacts stay hard. This is the "explosive" half of bad contact: something goes wrong upstream, the resolver sees a metre, and the player is teleported. It also makes the position correction dt-aware for the first time.
5. **Pre-step restitution reference** and **SSOR bucket ordering**. Snapshot `_preColSpd` alongside the existing `_preColS`/`_preColX` so bump bounciness stops depending on who is behind you in a concertina; and sort/alternate the bucket sweep, which the ≤12-car all-pairs path already does (`fwd = (pass & 1) === 0`) and the bucket path — the one every real race uses — does not.

**Files.** `js/physics/collide.js` (+ `js/physics/ai-drive.js` for `rubDecel` → `rubMu`).
**Effort.** Refactor. **Per-frame cost.** Net negative on (1) — one broadphase walk instead of five, then sweeps over a <20-record pooled list. (4)/(5)/(6) are free. `tests/specs/physics-hotpath.spec.js` is the existing allocation contract any pooling must satisfy.
**Determinism.** All deterministic; build order is the existing fixed `ranked` order. Note the two *asymmetries that must survive*: `humanInvMass` makes the player heavier so AI cannot shove them, and `sepShares` gives a network-posed car zero of the correction. Both are ownership policy, not physics, and a naive solver rewrite erases them.
**Cheapest experiment.** Items 4, 5 and the pre-step restitution snapshot are separable and individually one-liners — do those alone first, with a scripted three-car concertina at fixed speeds asserting order-independent post-impulse speeds. Only if the contact-blame counters from #3 show real per-pass classification churn is the full manifold refactor justified.

## Measured since — two entries above are now settled (2026-09-14)

Both were taken to the experiment this document prescribes for them, and both
came back NO. Recorded here rather than in a commit message because the list
above is what the next session reads.

### #6 (latch the priority verdict) — DO NOT BUILD, on its own criterion

The entry sets the bar itself: *"count verdict flips per corner per pair over a
headless race on the current tree. If the number is small, this is theory and
should not be built. If it is the 88-crossings shape the pass-latch comment
records, the latch is justified."*

Counted over 240 s at monza, every pair inside the 5.5 m alongside window,
`sideYieldsA` re-evaluated per frame:

| | |
|---|---|
| alongside episodes (≥ 0.5 s) | 221 |
| median episode | 2.35 s |
| **median flips per episode** | **1** |
| episodes with 3+ flips | 15 of 221 (6.8 %) |
| **flips per second while alongside** | **0.24** |

The pass latch was justified by ~88 crossings in one 43 s dwell — about 2/s.
This is 0.24/s, and a median episode flipping ONCE is not flip-flop: it is one
car completing a pass, which is the verdict correctly changing. The entry called
itself "the riskiest of the AI entries"; it buys nothing. Left unbuilt.

### #5 (yaw-aware contact extents) — BUILT

The hole was real and bigger than "a sideways car is a sliver". Per-car half
extents are 2.4 x 1.0; support half-widths at yaw psi to the tangent are
`eLong = 2.4|cos psi| + 1.0|sin psi|`, `eLat = 2.4|sin psi| + 1.0|cos psi|`.
Against a normally-oriented rival alongside, the pair's lateral reach:

| psi | old | geometric truth | **shipped** | hole closed |
|---|---|---|---|---|
| 20° | 2.00 m | 2.76 m | 2.00 m | 0 % (the blend floor) |
| 30° | 2.00 m | 3.07 m | 2.17 m | 16 % |
| 45° | 2.00 m | 3.40 m | 2.96 m | 68 % |
| **60°** | 2.00 m | **3.58 m** | **3.58 m** | **100 %** |
| 75° | 2.00 m | 3.58 m | 3.58 m | 100 % |
| 90° | 2.00 m | 3.40 m | 3.40 m | 100 % |

A rival passing a properly sideways car at |dX| between 2.0 and 3.4 m used to
drive straight through the bodywork the renderer was drawing. It cannot now.
Below 60° the closure is deliberately partial — the price of a blend floor that
keeps ordinary cornering out of the physics entirely.

TWO CORRECTIONS TO THE ENTRY, both from the table:

1. The worst case is **60-75°, not 90°**. The entry frames this as the sideways
   car and fades the term in from 20° to 45°; the peak miss is the
   three-quarters-on car, so the blend runs to **60°**.
2. At 90° the LONGITUDINAL extent shrinks to 3.40 m against the fixed 4.80 m, so
   there the old code over-detected. Yaw-aware extents REMOVE contacts at high
   yaw as well as adding them. That is not a regression.

WHOSE YAW, which the entry does not settle and which decides the whole scope.
`c.yawVis` is the real yaw-to-tangent only for the PLAYER. AI cars are
kinematic — game.js writes `head = atan2(tangent)` for them and their `yawVis`
is a cosmetic damped lean reaching ~36°, which is presentation, not a pose;
widening a car because it LOOKS tilted would be the renderer entering the
physics. And a car in a genuine spin is owned by the incident sim, which
`pairContact`'s callers skip outright. So the extents read psi for the player
only, every AI car keeps exactly 2.4 x 1.0, and an unyawed field is bit-identical
to before. The reachable half of the hole — an AI driving through a spun PLAYER
— is the half that closes.

The companion edit was required, exactly as flagged: the widest contacting pair
is `sqrt(2.4² + 1²) + 2.4` = **5.0 m** against `COL_BUCKET_M = LCAR = 4.8`. The
bucket walk only compares a bucket with itself and the next, so it is correct
only while the bucket is at least as wide as the widest pair — widen the extents
without it and the broadphase silently drops the very pairs the change was made
to catch. `LCAR_MAX = 5.0` now feeds both the bucket and the cheap reject, and a
test pins that relationship rather than the number.

Verified: collision-contact-vm 13/13 (5 new), test:game-vm 292/292,
test:tooling-fast 187/187, test:guards 178/178, and in the browser
physics-characterization + collisions + collision-ai-fixes 18/18 — the
characterization gate did NOT move, because a clean driving trace never yaws
the player past the blend floor.

### #7, second bullet (braking-aware net extrapolation) — BUILT

`F_BRAKE` was encoded, decoded into the view, and then read by nothing:
`advance()` moved `s` at a flat `st.speed`. A remote car standing on the brakes
was predicted to keep coming at the speed it had when the packet left.

Worse than the entry suggests: `predict()` is `sample(now + delayMs)`, so it
extrapolates on EVERY frame, not only during a stall. The follower's predicted
contact pose — `c._nProg` / `c._nSpd`, what the collision solver actually reads
— overshot continuously, which is the last-millisecond-brake asymmetry the
netcode lens cited.

The rate is OBSERVED from the last two packets, not taken from a constant. A
literal here would be a second copy of `BRAKE` to keep in step with the physics
and re-derive against `PACE` — the coupling `aStd` exists to prevent — and the
wire already carries the answer correctly scaled. Gated on the flag, so a
momentary dip between two packets is not extrapolated as if sustained; clamped
so the prediction never runs past a stop, never reverses, and never sheds more
than a third of the speed however absurd a jittery packet pair implies.

Speed follows `s` out of `advance()`, because they are one claim about one car:
a pose that slowed with a speed that did not is two predictions that disagree,
and the contact solver reads both.

Determinism is untouched — this changes only each peer's own local guess, no
cross-peer bit-exactness is claimed or required, and no new trig.

Verified: net-snapshot 25/25 (5 new), test:net-unit 203/203, test:tooling-fast
187/187, test:guards 178/178, and in the browser multiplayer-session +
multiplayer-npeer 24/24. The primary new test fails with the fix neutered, so it
is pinning the behaviour rather than the arithmetic.

### #7, first bullet (publish `_vLimNow`, compare corner-entry limits) — REVERTED

Built exactly as described — `c._vLimNow = br.vLim` stashed beside `_vmaxNow`,
`attackOK` comparing its own limit against the blocker's, as a bounded ±25 %
multiplier on the attack score, cutting both ways so it damps the attack the car
was going to abandon at the apex. Human blockers publish nothing, so the
multiplier is exactly 1 for them.

It does not work, and the interesting part is HOW it looked like it did.

| `ai-field.mjs` | before | after |
|---|---|---|
| 5 seeds — oscillationShare | 0.634 [0.549–0.653] | 0.568 [0.489–0.616] |
| **9 seeds — oscillationShare** | **0.634 [0.457–0.667]** | **0.599 [0.489–0.734]** |
| 9 seeds — noseToTailPct | 25.6 [23.9–31.8] | 26.8 [22.1–28.0] (worse) |
| 9 seeds — settledPasses | 32 [22–39] | 38 [18–55] |

At five seeds the target metric fell 10 % and the before-median sat above the
whole after-range — enough to read as a win. At nine the ranges swallow it, the
after-range reaches HIGHER than before, and nose-to-tail share moves the wrong
way. `paceSpreadPct` is identical throughout (1.43), which confirms the change
touched no pace and that the metric's spread is the race reshuffling.

So: five seeds was not enough for this metric, and `--runs 5` — the number
ai-field.mjs's own usage line suggests — would have shipped it. For an
oscillation-share comparison use nine or more, and treat the 5-seed number as a
smoke test. The entry's claim that this one "needs no argument" is withdrawn: it
needs the argument, and loses it.

Not re-litigated: the publication of `_vLimNow` alone is free and harmless, but
an unread field is bloat, so it went out with the consumer.

## Tempting but wrong

**Ship a learned policy (GT Sophy / Forza 8 Drivatar).** Rejected by three lenses independently. No build step to bake weights into, no training harness, and decisively: the AI field is *kinematic*, so there is no throttle/brake/steer action space for a learned policy to control. Even the clever version — distil to a 32-unit MLP as a `const W = [...]` float array, which genuinely fits the budget at ~2.4 Mflop/s — fails on process fit: a weight blob is the least defensible artefact possible in a codebase where every constant carries the measurement that produced it.

**Correct `dProg` with the Frenet stretch factor `h = 1 + k·x`.** The obvious one-multiplier fix, and `frenetH` already exists in game.js. It is curvature by another name, and putting it in the *player's* contact path violates the flat rule on sight — `tests/unit/curvature-channels.test.mjs` asserts every curvature-reading file appears in docs/PHYSICS.md's table, and `collide.js` is not in it. If the stretch error turns out to matter (see Open questions), the legitimate route is sampled positions and tangents only — the same class as `worldFromTrack` — never `Tracks.curvature()`.

**Rollback / deterministic lockstep netcode.** Requires snapshotting the whole physics state including the vendored Rapier side-world every frame, and it *inverts* a decision already made on purpose: netplay.js guarantees "your own car is NEVER corrected — no rollback, no reconciliation, no host advantage." A shipped P2P vehicular-contact game (AutoAge: Standoff) converged independently on exactly the local-authority compromise Apex already ships. Same verdict for host-authoritative correction and for disabling contact online.

**Move car-to-car contact into Rapier, or write a world-space impulse solver.** Rapier is vendored so the packaging constraint is satisfied, but: WASM float reproducibility across two browsers on two machines is not something anyone in this research could assert, and both the WebRTC and seeded-replay contracts depend on it; 20 permanently-dynamic bodies blows the budget the side-world was explicitly bounded to avoid; and the AI has no real body velocities to exchange impulses with, so a Newtonian solver would be inventing the very state the design deliberately does not simulate.

**Full SAT / OBB narrow phase with an MTV normal.** The technically correct answer, and it dissolves the side-vs-rear branch the entire resolver is built on — five consumers (`sideYieldsA`, the rub scrub, the rear momentum exchange with `humanPuntCap`, `DebrisWorld.carImpact`, `incidentSim.notifyCar`) have no contract for a diagonal normal. Proposal 5 gets most of the benefit inside the existing branch.

**Substepping the physics step** (the Small Steps headline result). Right finding, wrong system. `collide.js` is not integrating — it is a post-hoc position fixup over state `updateCar` already finalised. Substepping would mean re-running `updateCar` n times per frame on a 4-core software-rendering box, and lap-line crossing, `_pushD` banking, race-control flags and the netplay tick all key off exactly one physics step per frame.

**Cross-frame warm starting of the positional λ.** The standard stacking fix, and Catto's own writeup argues against it: at equilibrium the position impulse should be zero, so zero is always the best guess, and accumulation can make contacts pull back. Worse for racing specifically — neighbours churn every corner, so stale anchors survive on separated pairs, reintroducing exactly the sticky feel this work is meant to remove.

**Raising `PASSES` from 4.** Linear cost for sublinear gain, and *worse* tuning: effective stiffness is a function of the pass count, so raising it silently hardens every contact in the game and moves the characterization spec for no principled reason. Only safe after proposal 8 decouples stiffness from pass count.

**A fault-accurate blame model driving AI aggression.** The idea the racecraft lens went in wanting, and GT Sophy's measured result says it is wrong: the approaches that modelled blame more accurately produced policies judged *much too aggressive* by the stewards and drivers. Sony shipped a blunt fault-blind penalty plus three narrow geometry-specific extras. Hence #3 ships read-only.

**Increasing a global caution/politeness knob.** Same source, same measurement: "merely increasing the any-collision penalty resulted in very timid agent behavior."

**A sixth trait axis ("aggression" / "risk").** `driver-ratings.js`'s `AXES` array and its 22-row base table are a frozen data shape that career and season code reads — adding an axis is a migration. The existing axes plus the house attack/hold pair already span it; derive α from `(hold, craft)` instead.

**Any new `simRnd()` draw in an AI decision.** The seeded stream's draw *count* is a contract. Every proposal above that wants randomness must route through `DriverRatings.hash32(simSeed() + …)`, as `mistakeChance` already does. This is the trap every one of these ideas otherwise falls into.

**Rubber-banding, in any form the player could detect.** Including a Mario-Kart-style catch-up item, which trades one legible cheat for a more legible one, and is undefined here anyway: with 2-4 humans there is no single position to band to. Note the existing `dd.band` should be *bounded and redirected*, not deleted — its own comments say it exists so a lapped car can physically rejoin the lead lap within race distance, which is lap-count integrity, not feel.

**F1 Manager-style driver confidence, as shipped.** Its own player base calls it unbalanced — a driver's entire confidence collapsing from one Safety Car incident, or from swapping positions twice on a DRS straight and finishing ahead. If a "rattled" state is ever built, it must be bounded and fast-decaying from day one, and it belongs after #3 can measure it.

**Angular / yaw contact response (a rear-corner tap spins you).** The most requested-sounding feature and the clearest constraint violation: it needs a contact point offset, an inertia tensor, and `r × p` coupling into a world-space yaw state — the full rigid-body solver the architecture excludes. `incident-sim.js` already owns spins by handing the car to Rapier.

**Speculative contacts / CCD.** Checked with numbers rather than assumed: at 80 m/s and 1/60 s a car moves 1.33 m against a 4.8 m longitudinal extent. Tunnelling is not reachable at any speed the game hits.

**MCTS / N-step rollout over overtake options.** The kinematic AI does give a cheap forward model, but a rollout needs a model of the other cars' policies — and they run the same `AiDrive` code, so a naive rollout is recursive and a non-recursive one (freeze opponents at constant velocity) collapses to a one-ply comparison, which is exactly what `otWant` and `queueBrake` already are.

**Re-proposing fixed-timestep.** Already implemented: `PHYS_DT = 1/60` with an accumulator and a 5-step catch-up cap.

## Open questions

**Does the arc-length-vs-world-distance error actually matter at Apex's radii?** The frenet lens found *counter*-evidence to its own proposal: Reiter et al.'s ablation says car-sized vehicles on |κ| ≤ 0.05 (R ≥ 20 m) barely deform, and that the correction only mattered for 13 m truck chassis. Apex is a 4.8 m car on ~25–60 m corners — inside the regime their experiment calls fine. But a 25 m hairpin at x = ±5 m is a 0.8–1.2 stretch, which is 0.8 m of interpenetration nose-to-tail on the inside line. *Settled by:* a headless rollout logging `(dProg, x, R)` at every contact on Monaco and counting how many contacts fall outside a chosen error band. That is a bench, not a browser run, and it decides whether the world-metre measurement in the pbd/frenet proposals is worth a refactor.

**How often is the `sideContact` misclassification actually reached in a real race?** I verified the algebra and that `forceRear` cannot cover the AI-vs-AI queue case. I did *not* verify that AI cars spend meaningful time at `|dProg| < |dX| + 2.8` — `queueBrake` may hold them further back than that in practice. *Settled by:* the classification counters from #3, before any fix. If the count is near zero, #2 is a correctness cleanup rather than a feel change, and should be described that way in the PR.

**Is Rapier 0.19.3 bit-identical across peers and browsers?** Nobody established this. It bounds how far the side-world can be widened (the frenet lens's validity-gated promote proposal, which I did not recommend for exactly this reason) and it is a latent risk in the *current* design too, since incident outcomes already decide race results. *Settled by:* run the same seeded incident on two browsers and diff the handback pose. Cheap, and worth knowing regardless.

**What is the real cross-peer contact divergence?** The "~1 m" figure in docs/MULTIPLAYER.md is a design note. Everything in the netcode lens is calibrated against a number nobody has measured. *Settled by:* #3's loopback bench.

**Does straight-line defence improve the race or just slow it?** The literature says the mechanism is right and the repo's calibration says pass counts should fall. Neither tells you whether the resulting races are better to sit in. `ai-field.mjs`'s settled-passes / oscillation / dwell split is the right instrument for "did it produce trains", but the final call — does a covered inside line read as skill or as a wall — is one of the few things in this note that genuinely needs a human in the seat.

**Sources I could not verify, flagged so nobody treats them as load-bearing.** The Nature GT Sophy paper is paywalled; every Sophy claim above comes from the open preprint (`https://scholar.archive.org/work/w5xjvzopsfhrpoieoqm5qlrf7q/access/wayback/https://assets.researchsquare.com/files/rs-795954/v1_covered.pdf`). The iRacing incident ladder (0x/1x/2x/4x) is from search snippets only, not a fetched page. Wang et al. (T-RO 2021, `https://msl.stanford.edu/papers/wang_game-theoretic_2021.pdf`) failed to fetch twice; the α-sensitivity claims are cited to `https://arxiv.org/pdf/1801.02302` instead. The Unreal physics-blend-weight page is a snippet, not a fetch. `https://publications.syscop.de/Reiter2023.pdf` served a *different* paper than its search title. Guendelman's shock-propagation paper and `https://arxiv.org/abs/2311.09327` were never fetched and nothing rests on them.

---

# Appendix A — sources

Every URL a lens reported fetching or searching.

### racecraft-ml

- https://scholar.archive.org/work/w5xjvzopsfhrpoieoqm5qlrf7q/access/wayback/https://assets.researchsquare.com/files/rs-795954/v1_covered.pdf — the full GT Sophy preprint (Wurman et al.), fetched and read. This is where the load-bearing detail is: the eight reward components with formulas (passing bonus Rps with its b=20/f=40 m window and its symmetry, rear-end penalty Rr with ||Δv||², the flat any-collision −5, the three-case unsporting-collision table), the negative results (bigger blanket penalty → timid; accurate blame model → too aggressive), and the self-play limitations section including the human-brakes-early scenario and the exposure problem.
- https://www.nature.com/articles/s41586-021-04357-7 — the published Nature version, found via search but NOT fetched (paywalled). I used the open preprint instead; the reward-component details I cite are all from the preprint text quoted above.
- https://www.formula1.com/en/latest/article/explained-everything-you-need-to-know-about-f1s-driving-standards-guidelines.6VnN5LyImVruJmzaq7kZbh — F1's official explainer of the FIA Driving Standards Guidelines, fetched. Gave the inside-pass mirror-at-apex rule, the outside-pass front-axle-ahead rule, the chicane element rule, the straight-line rules (one change of direction, one car width on the return, slipstream-break carve-out, no direction change after deceleration begins), and the stewards' contextual checklist.
- https://www.the-race.com/formula-1/not-natural-anymore-the-flaw-exposed-in-2025-f1-racing-rules/ — fetched. Gave the verbatim three demands for an inside pass, the 2025 change removing the room-to-exit obligation, and the responsibility-flip sentence ("it is the responsibility of the defending driver to avoid a collision or forcing off the overtaking driver").
- https://ai.sony/blog/gran-turismo-sophy-five-years-on-from-nature-cover-to-open-frontier — fetched. Sony AI's five-year retrospective: the pre-event testers' "would be disqualified for poor conduct" verdict, "just how thin the line is between an agent that wins at all costs and one that races competitively", Devlic on the absence of precise rules or a dataset, and the 2.x product direction toward tunable sportsmanship/temperament.
- https://www.iracing.com (iRacing 101: Incident Points) and https://simracingcockpit.gg (Safety Rating explained) — search snippets only, not fetched in full. Both give the same quantised incident ladder (0x light contact with no advantage or damage, 1x off-track, 2x loss of control or barrier, 4x heavy car-to-car), which I use as the severity quantisation shape.
- https://arxiv.org/abs/2204.13070 — Thakkar et al., Hierarchical Control for Cooperative Teams in Competitive Autonomous Racing. Abstract fetched. The structure (a high-level tactical planner building a small DISCRETE game with simplified dynamics, feeding a low-level path planner) is the search-based analogue of what Apex already does with the pass latch; I cite it in dead ends for why a real rollout does not fit the budget.
- https://arxiv.org/abs/2509.05777 — game-theoretic decision-making survey for interactive driving. Search result only, not fetched; used only to confirm the bilevel/Stackelberg family is the state of the art here and is optimisation-shaped, i.e. wrong for an IIFE.
- docs/notes/AI-FIELD-RESEARCH.md (in-repo) — the existing prior-art ledger. It already records Game AI Pro ch.38/ch.42, Jimenez's "The Pure Advantage" and iRacing's persona axes, and explicitly rules Drivatar and GT Sophy out of scope as needing training pipelines. My job was to find the part of Sophy that is NOT the pipeline; this note is what told me not to re-propose the parts already surveyed.

### overtake-game-theory

- https://arxiv.org/abs/1712.03913 — Liniger & Lygeros, 'A Non-Cooperative Game Approach to Autonomous Racing'. Abstract fetched (full PDF not retrieved). Gave: the three-game hierarchy; that Stackelberg/Nash equilibria are computable by sequential maximization thanks to the leader-follower structure; and crucially that BLOCKING is produced by adding a terminal reward for staying ahead at the end of the horizon, which changes the Stackelberg equilibrium but barely moves the Nash equilibria.
- https://arxiv.org/pdf/2508.20203 — Prignoli, Borrelli, Falcone & Pustilnik, 'Regulation-Aware Game-Theoretic Motion Planning for Autonomous Racing' (IEEE ITSC 2025). Full text fetched. Gave: the formal three-rule overtaking regulation (right-of-way acquisition / yielding obligation / attacker owns collision avoidance), the sample-and-hold 'crossing state' that freezes the space owed at the instant right-of-way was acquired, the concrete thresholds (2.0 car lengths longitudinal, 0.5 car width lateral, 1.5 car width granted space), and the headline measurement: 29 % overtake success for a fixed-opponent-prediction baseline vs 96 % when the attacker reasons over the defender's rule-bound behaviour.
- https://arxiv.org/pdf/1801.02302 — Spica, Cristofalo, Wang, Montijano & Schwager, real-time game-theoretic planner for two-player racing. Full text fetched. Gave: the sensitivity-enhanced iterated-best-response cost `s_i(θ_i) − α·s*_j(θ_i)` with α ≥ 0 a free parameter, and the explicit claim that blocking behaviours 'naturally emerge from the use of sensitivity analysis' whereas in Liniger's work they are 'hardcoded in the cost function'.
- https://msl.stanford.edu/papers/wang_game-theoretic_2021.pdf — Wang, Wang, Talbot, Gerdes & Schwager, 'Game-Theoretic Planning for Self-Driving Cars in Multivehicle Competitive Scenarios' (IEEE T-RO 2021). ATTEMPTED TWICE AND NOT FETCHED (target_unreachable both times). I did not read it; I make no claim from it beyond what the search snippet showed, and every sensitivity claim above is cited to arXiv:1801.02302 instead.
- http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter38_An_Architecture_Overview_for_AI_in_Racing_Games.pdf — Tomlinson & Melder, 'An Architecture Overview for AI in Racing Games', Game AI Pro ch.38. Full text fetched. The richest shipped-game source: four-layer architecture (persona / strategic / tactical / control), utility-with-hysteresis behaviour arbitration on a [0,1000] scale, the anticipation requirement for overtaking, abort-and-lockout on a failed attempt, the defend-and-block trigger on 'current or future potential speed advantage', the danger-complaint abort, the biorhythm on skill, and the position that AI-vs-player balance belongs in vehicle physics rather than in the behaviour layer.
- https://www.aiandgames.com/p/how-forza-rebuilt-their-drivatar — Tommy Thompson, June 2026. Fetched. Gave shipped-game practice on skill tiers: Forza Motorsport 8 abandoned human-imitation Drivatars for independently trained controllers with ~19 discovered racing lines per car configuration refined over ~26,000 laps per circuit; 8 difficulty tiers implemented as grip / acceleration / top-speed boosts and nerfs on the CAR, not as behaviour changes; Turn 10's stated goal of matching the fastest humans 'without any cheats, hacks, and rubber banding'; and a separate set of racing lines swapped in for traffic conditions.
- https://arxiv.org/abs/2503.05421 — Fieni et al., 'Game Theory in Formula 1: From Physical to Strategic Interactions'. Abstract fetched (the ResearchGate PDF was unreachable). Gave: the F1-specific framing of the two-agent minimum-lap-time problem as either a Nash or a Stackelberg game, with slipstream/wake and energy allocation determining where on the lap an overtake is optimal — corroborating that the tow and ERS state belong in the attack/defend trigger (proposal 5a), but I did not read the model itself so I make no numeric claim from it.
- TinyFish search (domain_type=research_paper) for game-theoretic head-to-head racing, Stackelberg/IBR, and MCTS-for-overtaking — used to map the field. The MCTS query returned nothing on real-time overtaking decisions in games; the 'blocking as a repeated game with reputation' query returned only international-relations deterrence literature, no motorsport treatment.

### rubber-band

- https://www.gamedeveloper.com/design/rubber-banding-as-a-design-requirement — Dave Mark's Gamasutra/Game Developer piece distinguishing Mario Kart-style rubber-banding ('do well, then lose a bit to stay competitive') from Split/Second's power-play-driven design requirement; source of the 'blue shell can't fire from first place' framing
- https://game-wisdom.com/critical/rubber-banding-ai-game-design — design-critical explainer of rubber-banding as 'the developer altering the game experience outside of the player's control', used for the general framing of why it's resented
- https://www.howtogeek.com/what-is-rubber-banding-in-video-games-and-why-does-everyone-hate-it/ — general-audience explainer naming Split/Second and NFS: Underground as the poorly-implemented (speed-exceeding-vehicle-limits) end of the spectrum vs. Burnout 3/Mario Kart's subtler version
- https://allthetropes.org/wiki/Rubber_Band_AI — source of the concrete 'tell': identical achieved lap times at very different finishing positions is how players detect speed-based rubber-banding from the outside; used directly in Proposals A and D
- https://bugnet.io/blog/how-to-fix-racing-ai-rubber-banding-feeling-unfair — three-rule fix pattern ('bound the catch-up', 'adjust behavior not just speed', 'let skill matter') used as the direct design template for Proposal A
- https://www.aiandgames.com/p/how-forza-rebuilt-their-drivatar — Tommy Thompson's writeup of Turn 10's Drivatar rework, including the direct quote that their old system 'nerf[ed] or boost[ed] the drivers courtesy of rubber banding... by messing with the capabilities of the cars themselves, rather than tweaking the AI behaviour' and their stated goal to be competitive 'without any cheats, hacks, and rubber banding' — central evidence for Proposal A
- https://sites.google.com/site/myvracelog/rfactor/rfactor-hosting-your-own-server/rfactor-ai-compulations — rFactor's ISI-sourced RCD documentation of the Composure stat driving frequency of 'bad driving zones' and intentional mistakes (missed braking points, wide turns) — the model this repo's own mistakeChance comment already cites, used to ground Proposal B
- https://automobilista-2.fandom.com/wiki/Custom_AI — Automobilista 2's shipped Custom AI parameter list: Consistency, Forced Mistakes (pressure-scaled error chance), Mistake Avoidance, and Vehicle Reliability as a SEPARATE axis from driving error — direct precedent for the two-tier error-vs-mechanical-DNF split proposed in B
- https://www.reddit.com/r/F1Manager/comments/1efn6jd/race_driver_confidence_is_unbalanced/ — player thread on F1 Manager's driver-confidence system reacting too hard to single events with inadequate decay ('unbalanced', 'extremely surface level', confidence 'destroyed' by a few DRS swaps) — used as the negative case study/failure mode Proposal C is designed to avoid
- https://www.mtreiber.de (MOBIL: General Lane-Changing Model for Car-Following Models, Treiber/Kesting/Helbing) — confirms the MOBIL traffic model already referenced in this repo's ai-drive.js overtake-incentive comments is a real, citable traffic-engineering model (background verification only, not a new proposal)

### pbd-contact

- https://matthias-research.github.io/pages/publications/PBDBodies.pdf — Müller, Macklin, Chentanez, Jeschke, Kim, 'Detailed Rigid Body Simulation with Extended Position Based Dynamics' (SCA 2020). FETCHED IN FULL. The load-bearing source: §1 on PBD's known defects (iteration/timestep-dependent stiffness, order dependence, and SSOR/Jacobi as the fix), §3.3.1 the XPBD Δλ update with compliance, §3.5 collect pairs once per step with an expanded-bounds margin (k=2), §3.6 eq (30) the unconditionally-stable explicit Coulomb friction with the min() clamp and eq (34) restitution against the PRE-solve normal velocity plus the zero-e jitter threshold.
- https://matthias-research.github.io/pages/publications/smallsteps.pdf — Macklin, Storey, Lu, Terdiman, Chentanez, Jeschke, Müller, 'Small Steps in Physics Simulation' (SCA 2019). FETCHED IN FULL. Gave me: §4 eqs (4)-(7) the XPBD projection I am proposing to adopt, §4.2 amortizing collision detection to once per frame with a margin, §4.3 eq (10) the maximum-depenetration-speed clamp that is proposal 5 verbatim, §4.4 eq (12) the Coulomb clamp Δλ_f ≤ μΔλ_n, and §7 confirming Gauss-Seidel order dependence and SSOR as the mitigation. Also the substeps-beat-iterations result, which I ended up rejecting for this repo (see deadEnds).
- https://box2d.org/posts/2024/02/solver2d/ — Erin Catto, 'Solver2D' (Feb 2024). FETCHED IN FULL. The practitioner counterweight to the papers. Gave me: accumulated-impulse clamping as the anti-jitter mechanism ('crucial to avoid jitter'); why warm starting positional impulses is a bad idea ('At equilibrium the position impulse should be zero ... Accumulation can be problematic because it can lead to contacts pulling back') — this is what killed one of my own proposals; NGS position solving as pseudo-velocity that does not inject kinetic energy, which is why I rejected adding a relax pass; contact-point persistence across sub-steps; TGS_Sticky's result that friction anchors alone give stable stacking, which is the argument for proposal 4; and the relaxation pass definition.
- https://allenchou.net/2014/01/game-physics-stability-slops/ — Allen Chou, 'Game Physics: Stability – Slops'. FETCHED IN FULL. Penetration slop and restitution slop (~0.5 m/s closing-speed tolerance). Used only to CONFIRM that `AiDrive.bumpRestitution`'s existing 1 m/s zero-band and `COL_SLOP` already implement both correctly, so I did not propose them.
- https://arxiv.org/abs/2311.09327 — Seabra, Lopes, Pereira, 'Survey of rigid body simulation with extended position based dynamics' (2023). SEARCH RESULT ONLY — I did NOT fetch this. I list it as a follow-up pointer for whoever implements proposal 3 (it surveys PBRBD's additions to XPBD and static/dynamic friction handling). No claim in this report rests on it.
- https://graphics.stanford.edu — Guendelman et al., 'Nonconvex Rigid Bodies with Stacking' (shock propagation). SEARCH RESULT ONLY — I did NOT fetch this and could not verify the URL resolves to the paper. It is the classic reference for constraint ordering in stacks, which is adjacent to proposal 6, but proposal 6 rests entirely on the SSOR statements I DID fetch from the two Müller/Macklin papers. No claim rests on this source.
- Repo files read directly (not web): /home/user/f1-game/js/physics/collide.js (all 378 lines), /home/user/f1-game/js/physics/ai-drive.js (humanInvMass/rubDecel/bumpRestitution/humanPuntCap/sideYieldsA/squeezeEase, lines ~150-200 and ~610-620), /home/user/f1-game/js/game.js (ranked sort at 3411, updateCar→resolveCollisions order at 3421-3423, _pushD consumption at 4979-4984, speed as genuine state for both player and AI), /home/user/f1-game/tests/specs/physics-hotpath.spec.js (the allocation-free hot-path contract any manifold pooling must satisfy).

### frenet-vs-world

- https://arxiv.org/pdf/2212.13115 — Reiter, Nurkanovic, Frey, Diehl, 'Frenet-Cartesian Model Representations for Automotive Obstacle Avoidance within Nonlinear MPC'. Fetched in full. The load-bearing source: convex shapes become nonconvex under the Frenet transform, shapes become state-dependent, over-approximation is the standard Frenet-native remedy and is 'strikingly conservative ... especially for long vehicles and low curve radii'. Crucially also the counter-evidence — their ablation found car-sized vehicles on |kappa| <= 0.05 roads barely deform, which is Apex's regime.
- https://publications.syscop.de/Reiter2023.pdf — fetched, but WARNING: this URL served a different paper than its search title, namely Reiter/Hoffmann/Boedecker/Diehl, 'A Hierarchical Approach for Strategic Motion Planning in Autonomous Racing'. Used for the Frenet vehicle ODE with the explicit 1/(1 - n*kappa(s)) stretch/singularity term, and for the design precedent of keeping the model in Frenet while doing the collision check in Cartesian (ellipse for the opponent, circle for ego).
- https://commonroad.in.tum.de/docs/commonroad-drivability-checker/sphinx/api_pythonbindings_geometry.html — fetched. Documents the 'unique projection domain' as a first-class bounded object with a lateral limit and a `cartesian_point_inside_projection_domain` validity predicate, and `convert_rectangle_to_cartesian_coords` returning a polygon plus a triangle mesh (a Frenet rectangle is not a Cartesian rectangle).
- https://commonroad.in.tum.de/docs/commonroad-drivability-checker/sphinx/06_curvilinear_coordinate_system.html — fetched. Tutorial-level statement of the projection domain: 'the area around the reference path, in which any point can uniquely be converted from the cartesian frame to the curvilinear frame and vice versa.'
- https://rapier.rs/docs/user_guides/javascript/rigid_bodies/ — fetched in full. Kinematic bodies 'will simply ignore any contact force and go through walls and the ground'; dominance groups as the engine-native way to make one body immune to another's contact forces (the principled version of Apex's humanInvMass); CCD off by default and only relevant for fast movers; sleeping needs 'a few seconds' of low motion, which is why IncidentSim's `pose.sleeping` branch is near-dead against its own SETTLE_HOLD_S of 0.30 s.
- https://arxiv.org/abs/2505.03695 — Tariq et al., 'Frenet Corridor Planner'. Abstract only. Independent confirmation that 'safety-augmented bounding boxes ... in the Frenet space' is the standard remedy when the formulation stays Frenet-native.
- https://shawnhargreaves.com/blog/hysteresis.html — fetched in full. Game-dev statement of the hysteresis pattern for boolean decisions on noisy analog values; directly applicable to a validity-gated promote/demote trigger.
- https://www.physicsbasedanimation.com/2019/08/01/small-steps-in-physics-simulation/ — fetched. Macklin et al. abstract: n substeps of one iteration beat one step of n iterations. Read, considered, and rejected for this codebase (see deadEnds).
- https://dev.epicgames.com (search snippet only, NOT fetched) — 'Set Physics Body Physics Blend Weight: Controls the amount that the simulation is blended back into the target bones.' Cited for the pattern only; I could not verify the page.
- FAILED FETCHES, cited nowhere: https://rudolfreiter.github.io/project/frenetcartesian/ returned 404, and https://pages.cs.wisc.edu/~schenney/research/papers/lod.pdf (Chenney, 'Simulation Level-Of-Detail' — proxy simulations) was unreachable. I do not cite either as evidence.

### netcode-determinism

- https://rapier.rs/docs/user_guides/javascript/determinism/ — Rapier's own determinism docs; confirms Math.sin/cos are NOT cross-platform-deterministic even in a deterministic physics engine, which validates why Apex 26's Frenet-plane collision code (no trig) is already the correct design and why new proposals must avoid introducing trig into shared/networked state.
- https://gafferongames.com/post/floating_point_determinism/ — Glenn Fiedler's survey of IEEE-754 cross-platform (non-)determinism from real shipped games (Supreme Commander, MotoGP, Battlezone 2); establishes that bit-exact determinism across machines/compilers is achievable only with heavy, specific engineering discipline (SSE-only, no x87 transcendentals, forced rounding modes) — the cost side of the 'why not deterministic lockstep' argument.
- https://gafferongames.com/post/fix_your_timestep/ — canonical fixed-timestep-accumulator pattern; used to confirm (by reading js/game.js) that Apex 26 already implements this correctly (PHYS_DT=1/60, accumulator, 5-step catch-up cap), so it was NOT proposed as new work.
- https://yal.cc/preparing-your-game-for-deterministic-netcode/ — practical breakdown of lockstep vs rollback tradeoffs (bandwidth, fairness, scaling to N players, desyncs, tooling fit) and which genres actually use deterministic netcode; used to ground why full lockstep/rollback is a poor fit here.
- https://www.reddit.com/r/iRacing/comments/sia74i/netcode_is_just_lag/ — first-hand, detailed description of exactly the failure mode this lens targets: a P2P/hybrid racing sim's prediction code causing asymmetric, braking-related phantom contact between two drivers who each see a different outcome of the same corner. Directly grounds proposal 2.
- https://discussions.unity.com/t/multiplayer-physics-game-where-collisions-between-players-is-the-core/744970 — includes a first-hand postmortem from the shipped P2P car-combat game AutoAge: Standoff describing the identical 'each peer has local authority over its own vehicle, accept a bounded discontinuity between screens' compromise Apex 26's js/net/netplay.js already implements — used both to validate the existing architecture and to source proposal 3's 'soften response under stale prediction' idea.
- https://www.researchgate.net (search result) 'An Auto-Adaptive Dead Reckoning Algorithm for [Distributed Interactive Simulation]' — origin-discipline citation for adaptive, motion-state-aware dead-reckoning extrapolation of vehicles, supporting proposal 2's braking-aware extrapolation as an established technique rather than an ad hoc guess.
- https://gamedev.net (search result, page itself bot-blocked, snippet only) and https://gamefaqs.gamespot.com (search result) — general corroboration that P2P racing-game netcode is widely considered hard/unusual specifically because of car-car contact, and that some racing games avoid the problem by disabling collision online (informed deadEnd #5).

---

# Appendix B — what each lens rejected, and why

Kept deliberately. An idea that reads well and cannot survive this codebase gets re-proposed by the next agent unless the no is written down.

### racecraft-ml

Rejected, with reasons.

**Ship a learned policy.** QR-SAC, a replay buffer, 1000+ PS4s, multi-table experience replay — none of it exists here and none of it can. The repo's own notes already put this out of scope ("Forza's Drivatar and GT Sophy both need training pipelines this project does not have"). Not re-litigated.

**Distil a trained policy into a tiny MLP shipped as a float array in an IIFE.** This one is genuinely tempting and I checked the budget: a 2-layer 32-unit net is ~1.5 KB of weights and ~2k multiply-adds per car per decision, which at 20 cars and even 60 Hz is ~2.4 Mflop/s — comfortably inside budget on a 4-core box, and it needs no build step (a `const W = [...]` in an IIFE is legal). It fails on three other counts. There is no trainer and nothing to train against except the game itself, which would need a headless self-play harness this project does not have and which the tooling rules would make painful (one Playwright process, one browser group). Determinism across peers would require pinning float summation order and avoiding `Math.exp`/`Math.tanh` (a polynomial approximation is fine, so this is solvable, but it is real work for the netplay contract). And decisively: the physics gate demands changes be "defensible and measurable, not vibes", and a weight blob is the least defensible artefact imaginable in a codebase whose every constant carries a paragraph explaining the measurement that produced it. Rejected on process fit, not on budget.

**MCTS or N-step rollout over lane/brake options (the "search" half of my lens).** The kinematic AI actually gives Apex a cheap forward model, which is more than most games have, and the hierarchical-control literature (Thakkar et al.) shows a discrete high-level game does produce coordinated overtaking and multi-car defence. But the rollout needs a model of the OTHER cars' policies, and here the other cars run the same `AiDrive` code — so a naive rollout is recursive, and a non-recursive one (freeze opponents on constant velocity) collapses to a one-ply comparison, which is precisely what `otWant`'s free-pace-vs-blocker-pace test and `queueBrake`'s time-to-collision gate already are. Cost also scales as O(cars × branches × horizon) per decision against a hard 20-car/60 Hz budget. Rejected: the surviving 1-ply version is already shipped.

**A fault-accurate blame model driving AI aggression.** This is the idea I came in wanting, and the paper says it is wrong: "The approaches that tried to more accurately model blame assignment resulted in policies that were judged much too aggressive by the stewards and drivers in our test races." Sony shipped the blunt fault-blind penalty plus three geometry-specific extras instead. So my classifier proposal ships as read-only instrumentation, and the behavioural proposal is three narrow multipliers, not a blame→aggression loop. Rejected on their measured evidence, not on fit.

**Self-play, curriculum, mixed-opponent populations, mixed-scenario training.** These are training-time machinery with no runtime residue at all. The only piece with a runtime shadow is the exposure problem — "If that opponent always drives only on the right, you will learn to pass only on the left" — and Apex already addresses it: `otSide`'s tiebreak deliberately splits a queue both ways and `adaptLane` fans out a train. Nothing left to steal.

**Time penalties on the player for contact.** Sophy's rear-end penalty punishes the AGENT. Porting it to the human would mean issuing time penalties off a Frenet position-based collision model (`collide.js` is relaxation passes and a separation pass, explicitly "closer to position-based dynamics than to Newtonian contact") that was never built to attribute contact at that fidelity. In an arcade game that would feel arbitrary. Rejected; the classifier stays diagnostic on the player's row.

**Reading `Tracks.curvature()` to classify straight-vs-corner for a contact verdict that touches the player.** The flat project rule is about the player's car physics, and the existing track-limits penalty at js/game.js:4100 is precedent for geometry-derived penalties — so this might survive a ruling. I declined to rely on that: the classifier keys on each car's own lateral acceleration instead, which is a state read, costs the same, and is closer to the FIA's own framing (what the drivers could see and do, not where the centreline went). Recorded here because the cheaper version is the one that would have leaked.

**Any new `simRnd()` draw.** Several of these ideas naturally want a per-car roll (which side to defend, whether to take a marginal move). Adding one shifts the seeded stream's draw count, which the repo treats as a contract — the `launchPlan` comment is explicit that the launch roll comes "from a hash, NOT from simRnd(): the seeded stream's draw count is a contract". Any randomness in these proposals must go through `DriverRatings.hash32(simSeed() + ...)`, the same way `mistakeChance`'s roll does at js/game.js:4199. Not a proposal, but it is the trap every one of these would otherwise fall into.

**Putting the contact classifier inside `_colResolvePair`.** The obvious place, and wrong: that callback runs inside the relaxation loop, which collide.js's own comment puts at "~8 × 20 cars × 60 Hz". It has to be hoisted to a single post-resolution sweep in `resolveCollisions`, which also makes the verdict a property of the settled contact rather than of an intermediate relaxation state.

### overtake-game-theory

"1. A REAL IBR / MPC LOOP. Every planner in the literature above (Liniger's sequential maximization, Prignoli's RA-GTP, Spica's sensitivity-IBR) solves an optimisation over a multi-step horizon per pair per replan — Prignoli runs N=20 steps at Ts=0.05 s through CasADi and Gurobi. Apex's whole AI field has to fit inside a 60 fps frame with ~20 cars on a 4-core software-rendering box, and the hard constraints forbid npm at runtime, a bundler, and non-vendorable WASM (CasADi/Gurobi are all three). Rejected as a solver; only the DECISION-RULE SHAPE transfers, which is what proposals 1 and 2 take.\n\n2. MCTS OVER OVERTAKE MANOEUVRES. Even a small tree (3 actions x 4 plies) per attacking car means hundreds of forward rollouts of the kinematic model per frame, and it would need a hand-rolled allocation-free node pool to avoid exactly the per-frame allocation storm the brief calls a regression. It also buys nothing: at any instant the action set really is {hold, cover/attack left, cover/attack right}, so the 'tree' collapses to a bimatrix small enough to evaluate in closed form — which is proposal 1. Rejected as cost with no payoff.\n\n3. RUBBER-BANDING THE ATTACK/DEFEND DECISION TO THE PLAYER. The obvious cheap way to make races feel close, and explicitly what the brief says must not read as the result. It is also what the shipped state of the art moved AWAY from: Turn 10's stated aim for Forza Motorsport 8 was 'to create AI opponents as fast as the fastest human drivers, we had to do it without any cheats, hacks, and rubber banding', with difficulty applied to car grip/accel/top speed instead — and Game AI Pro ch.38 §38.8 makes the same architectural point, that balance belongs in the vehicle physics, not the behaviour layer. Decisively, it is undefined under Apex's own constraints: with 2-4 humans over WebRTC there is no single position to band to, so any implementation breaks determinism. Rejected.\n\n4. A LEARNED POLICY (GT Sophy / Forza-8 style RL). Both shipped systems train neural controllers offline over tens of thousands of laps per circuit. Apex has no build step to bake weights into, no way to evaluate a network inside the frame budget on a software-rendering box, and — decisively — its AI field is KINEMATIC: cars are advanced by a controller, not by the player's rigid-body/tyre model, so there is no throttle/brake/steer action space for a learned policy to control. Rejected on architecture, not just budget.\n\n5. A SIXTH TRAIT AXIS ('aggression' or 'risk'). Tempting: Game AI Pro ch.38 §38.4 names aggression as the primary secondary characteristic, and a dedicated α axis would be the literal translation of the sensitivity parameter. But js/data/driver-ratings.js's AXES array and its 22-row BASE table are a frozen data shape that career and season code reads, so adding an axis is a migration. And the existing axes already span it: craft is commitment, awareness is patience, and the team house-style attack/hold pair is the risk appetite. Rejected in favour of DERIVING α from (hold, craft) — no data migration, no new tuning surface.\n\n6. A REPUTATION / REPEATED-GAME LAYER ('this driver always yields, so lunge at him'). I searched specifically for a citable treatment of blocking as a repeated game with reputation and found none in motorsport — the hits were deterrence-theory literature about international crises, which is not evidence about racing. Without a source and without a metric on tools/check/ai-field.mjs it would be vibes, which the brief rules out. Apex also already has the only piece of it with a measured payoff: passFailOf / passFailT implement rFactor 2's 'threshold endured' lockout, and the game.js:4224 comment records the measurement behind it (74 % of order changes at monza were the same pairs trading places before the lockout). Rejected as unsupported.\n\n7. ANY VERSION OF THIS THAT REACHES THE PLAYER'S CAR. Every proposal here consumes track curvature (kA), the baked racing line, TrackLine.attackAt's toTurnIn and attackQ, or a blocker's derived pace ceiling. All of it is confined to the `else` branch of `if (c.human)` at js/game.js:4142 and to AiDrive.defendPull / attackOK / brakeTarget, which are only ever called for AI cars. I specifically considered and rejected a 'defensive line assist' that would nudge the PLAYER's target line to cover an attacker: with assists off that is the arc reaching the driver, which the project rule forbids on sight, and gating it behind an assist would still put a curvature-derived lateral demand inside the player's control path. Not proposed in any form.\n\n8. USING simRnd() ANYWHERE IN THESE DECISIONS. The seeded stream's draw COUNT is a contract (js/game.js:1568-1579 and 1721 both exist purely to keep it), so a new conditional draw inside an AI decision would desync replay and netplay even though each individual value is seeded. Proposal 4 therefore reuses the existing unconditional per-braking-zone hash draw (DriverRatings.hash32 at js/game.js:4199) rather than adding a roll. Any variant of these proposals that wants fresh randomness must go through a hash of (seed, car, lap, zone), never simRnd()."

### rubber-band

Rejected: a literal Mario Kart/Split-Second style catch-up item or visible power-play mechanic. gamedeveloper.com's own analysis shows this trades one detectable-cheat problem for another (an AI 'blue shell' is even more legible as a rubber-band than a speed multiplier), and it has no home in a physically-simulated F1 sim's genre expectations; also orthogonal to the flat-project rule since it would need to hand the AI a track-position-aware trigger with no equivalent for the player.

Rejected: adopting Forza Motorsport 8 / GT Sophy-style deep-reinforcement-learning or cloud-trained-Drivatar racing lines (aiandgames.com: 19 lines/track refined over 26,000 laps in the cloud). This needs a training pipeline, model weights, and (for inference) a runtime ML framework — flatly incompatible with 'no build step, no frameworks, no ES modules... every file is an IIFE... static files on GitHub Pages'. Even a pre-baked, vendored inference-only model would risk floating-point nondeterminism across browsers/GPUs, breaking both the WebRTC lockstep contract and the seeded-replay contract. The existing kinematic-controller-plus-baked-TrackLine architecture is the right ceiling for this codebase, not a gap to fill.

Rejected: building a from-scratch multi-line 'search the racing line per corner' system (the non-ML half of what Forza 8 does) so the AI can find its own line rather than follow the baked TrackLine family. This is a redesign-scale change to js/track/'s generic tables and TrackLine.bake, not an incremental fix to rubber-banding; it also doesn't address the actual complaint (a visible SPEED multiplier), so the effort-to-benefit ratio for this specific lens is poor. Filed as out of scope for a rubber-band-focused pass.

Rejected: copying F1 Manager's driver-confidence system as-is (large, event-triggered swings in mistake rate with slow/no normalization). The Reddit thread cited above is direct evidence that shipped players experienced this as broken and 'stupid' — a driver's ENTIRE confidence wiped by a couple of DRS swaps that ended in their favor. Folded into Proposal C only in bounded, fast-decaying form; the unbounded version is explicitly rejected.

Rejected: removing js/game.js's dd.band mechanism outright rather than redirecting part of it (Proposal A only halves it). The in-repo comments make clear the band exists to solve a real, non-cosmetic problem — a lapped AI car must be able to physically unlap itself within a finite race distance, and without ANY catch-up term a car that fell a lap down at pace 0.851 (easy) could mathematically never close 400m+ of empty track before the flag. Zeroing it would break race completion/lap-count integrity, not just 'feel'; bounding and redirecting (not deleting) is the defensible move.

Rejected: a season-long persistent 'hot streak / cold streak' driver-morale system spanning multiple races (an F1-Manager-adjacent idea but scoped to career mode instead of a single race). This belongs to js/career/ (contracts, R&D, seat-swap logic already own driver-quality drift across a season) and is a different subsystem with its own gate; conflating single-race error-injection (this lens) with season-arc narrative is scope creep beyond what a rubber-band/field-spread pass should touch.

### pbd-contact

Nine things I looked into and rejected for this repo.

1. FULL SUBSTEPPING (the Small Steps / TGS headline result). The papers' central claim is that n substeps × 1 iteration beats 1 step × n iterations, and collide.js's 4 relaxation passes are exactly the losing side of that trade. Rejected anyway. Substepping means substepping the whole sim, and the field is KINEMATIC: cars are advanced in `updateCar` (20 cars, a large function), which would have to run n times per frame on a 4-core software-rendering box, and lap-line crossing, `_pushD` banking, race-control flags and the netplay tick all key off exactly one physics step per frame. Worse, the actual value of TGS is mostly already present: `pairContact` recomputes penetration and the contact direction on every pass, so this is already non-linear Gauss-Seidel with fresh constraint directions — the thing the Müller paper says velocity-level and global solvers cannot do. The budget is better spent on convergence-per-sweep (proposal 3) than on more sweeps.

2. MOVING CAR-TO-CAR CONTACT INTO RAPIER. Rapier is already vendored, so the "no npm at runtime / vendor your WASM" constraint is satisfied, and `debris-world.js` + `incident-sim.js` prove the integration works. Rejected on two counts. Determinism: WebRTC play needs bit-identical results across two browsers on two machines, and a WASM rigid-body solver's cross-platform float reproducibility is not something I can assert for this build; the seeded replay contract (`__apex.seed`) has the same exposure. Budget: 20 dynamic bodies with contacts every frame, permanently, versus the side-world's current event-scoped takeover. And architecturally the Frenet formulation is what makes `Tracks.wallAt` barrier clamping, lane logic and the arc-bucket broadphase cheap — all of that would need reinventing in world space.

3. CATTO'S RELAXATION PASS (re-solve with the bias off, to drain the energy the bias added). Looked like an obvious fit for the 4-pass structure. It is not: relaxation exists to remove extra VELOCITY energy that Baumgarte or soft constraints injected. collide.js's position corrections — `shiftLong` and `c.x +=` — never touch `c.speed`, so they are pseudo-velocity in the NGS sense and inject no kinetic energy at all. Catto's own description of NGS covers this: "the position constraint solver doesn't affect kinetic energy." A relax pass here would be a fifth sweep that provably removes nothing.

4. JACOBI INSTEAD OF GAUSS-SEIDEL to kill order dependence. Both papers list Jacobi as a valid way to remove ordering bias. Rejected: Jacobi converges more slowly for the same sweep budget (stated in Müller §1 and Small Steps §1), needs a per-car accumulator buffer that the pooled-scratch discipline would have to grow, and its real payoff is parallelism, which single-threaded JS cannot collect. SSOR (proposal 6) buys the same debiasing for the cost of sorting twenty integers.

5. CROSS-FRAME WARM STARTING OF THE NORMAL POSITIONAL λ. This is the standard stacking fix and I wanted it. Rejected on Catto's own reasoning, quoted from Solver2D: "It doesn't make sense to accumulate or warm start the position impulses. At equilibrium the position impulse should be zero, so zero is always the best guess for the position impulse. This makes warm starting irrelevant. Accumulation can be problematic because it can lead to contacts pulling back." On top of that, a persistent pair cache is a bad fit for racing specifically: neighbours churn every corner, so stale anchors would survive on pairs that separated — reintroducing exactly the sticky feel the brief asks to remove. λ stays frame-local in proposal 3. The one variant that might survive is Catto's TGS_Sticky friction ANCHOR warm start (anchors reset when Coulomb is exceeded), but that needs the same stable pair identity and I would not ship it before proposals 1-4 are measured.

6. ANGULAR / YAW CONTACT RESPONSE — torque from an off-centre hit, so a rear corner tap spins you. The most requested-sounding feature and the one that most clearly violates the brief. It needs a contact point offset r, an inertia tensor, and r × p coupling into a yaw state that the player integrates in world space — that is the full rigid-body solver the brief excludes, and `incident-sim.js` already owns spins by handing the car to Rapier. Rejected.

7. SPECULATIVE CONTACTS / CCD widening to stop tunnelling. Checked the numbers rather than assuming: LCAR is 4.8 m, and the worst realistic per-frame relative closing at 60 Hz is roughly 20 m/s × 1/60 ≈ 0.33 m — an order of magnitude under the reject radius. No tunnelling is reachable in the racing case, and genuine high-energy shunts are handed to Rapier anyway. The only piece worth keeping is the closing-speed margin on the manifold BUILD (proposal 1), which is there for a different reason: pairs that come into contact during the passes after the single broadphase walk.

8. ADDING A RESTITUTION SLOP KNOB (Chou's ~0.5 m/s closing-speed tolerance). Already implemented: `AiDrive.bumpRestitution` returns 0 below 1 m/s and ramps to 0.1 by 3 m/s, and the source comment cites Box2D's velocity threshold for exactly this reason. Nothing to do. Same verdict on penetration slop — `COL_SLOP` 0.05 is doing its job.

9. RAISING `PASSES` FROM 4. The cheapest-looking knob, and the wrong one. Cost is linear across every pair for sublinear convergence gain, and it makes the tuning worse rather than better, because the three under-relaxation factors' effective stiffness is a function of the pass count — so raising `PASSES` silently hardens every contact in the game and moves the characterization spec for no principled reason. Proposals 1 and 3 buy the convergence at four sweeps or fewer, and decouple stiffness from the pass count so this knob becomes safe to touch afterwards.

### frenet-vs-world

"1. REWRITE CAR-TO-CAR CONTACT AS A WORLD-SPACE IMPULSE SOLVER, OR PROMOTE ALL 20 CARS TO RAPIER. Rejected on three independent grounds. (a) The AI field is kinematic by design — js/physics/ai-drive.js advances cars by a controller, and its own comment says 'AI has no heading slide' — so there are no real body velocities to exchange impulses with; a Newtonian solver would be inventing the very state the design deliberately does not simulate. (b) 20 dynamic Rapier bodies stepping every frame blows the budget the side-world was explicitly bounded to avoid (MAX_TAKEOVER 8, MAX_INCIDENTS 3, WINDOW_MAX_S 3.0), on a 4-core software-rendering dev box. (c) collide.js's two asymmetries have no clean expression in a symmetric impulse solver: AiDrive.humanInvMass makes the player 'heavier' so the AI cannot shove them, and `sepShares` gives a network-posed car ZERO of the positional correction because its owner will re-pose it next packet. Both are ownership policy, not physics, and a real solver would erase them.\n\n2. CORRECT dProg WITH THE FRENET STRETCH FACTOR h = 1 + k*x — THE OBVIOUS ONE-MULTIPLIER FIX, AND THE FIRST THING I REACHED FOR. `frenetH(s, x)` already exists in js/game.js:681 and is already used for the player's own line length at :4491. Rejected on the project's own flat rule: h is curvature by another name, and putting it in the player's contact path is a curvature-derived quantity affecting the player with assists off. docs/PHYSICS.md's curvature-channel table has four legitimate columns (AI-only, assist-gated, broadcast-only, surface) and a hard constraint on the player fits none of them; tests/unit/curvature-channels.test.mjs asserts every curvature-reading file appears in that table and js/physics/collide.js is not in it. Proposal 3 reaches the same accuracy through sampled positions and tangents only — the same class as worldFromTrack/trackFrom — which is precisely why it survived and this did not.\n\n3. FULL SAT / OBB NARROW PHASE WITH A MINIMUM-TRANSLATION-VECTOR NORMAL. The technically correct answer, rejected as a first move rather than forever. It dissolves the side-vs-rear branch the entire resolver is built on: `ct.sideContact` gates AiDrive.sideYieldsA, the rub scrub, the rear momentum exchange with its `AiDrive.humanPuntCap()` human cap, `DebrisWorld.carImpact` severity and `incidentSim.notifyCar`. An MTV pointing diagonally has no home in that structure and every one of those five consumers would need a new contract. Proposal 1's support-width bound gets most of the benefit inside the existing branch, at a fraction of the blast radius.\n\n4. BANKING CORRECTION TO dX. Measured the magnitude and dropped it. `worldFromTrack` normalises the right vector to horizontal (js/game.js:673, with a long comment about why: an un-normalised r shrinks to cos(bank) and drags the car to the centreline), so c.x is a HORIZONTAL lateral offset while the cars sit on a banked surface. On Zandvoort-class 18 deg banking the along-surface gap is x/cos(18 deg) ~ 1.05x. Five percent of a 2.0 m width is 10 cm — smaller than twice COL_SLOP (0.05) and far below anything a player can perceive. Not worth a code path.\n\n5. SUBSTEPPING resolveCollisions (Macklin et al. 2019: n substeps of one iteration beat one step of n iterations). Right finding, wrong system. collide.js is not integrating anything — it runs 4 relaxation passes over positions that updateCar has already finalised for the step. Substepping it would require re-running updateCar's integration per substep, which is the entire physics step, at 4x cost. The paper's result is about implicit integrators with stiff constraints; it does not transfer to a post-hoc position fixup.\n\n6. SPECULATIVE CONTACTS / CCD FOR TUNNELING. Checked and dropped. At 80 m/s and dt = 1/60 a car moves 1.33 m per step against a 4.8 m longitudinal extent, so the Frenet AABB test cannot tunnel at any speed the game reaches; and Rapier's CCD (off by default per its docs) is irrelevant because the side-world only ever holds crashed cars, which are slower still.\n\n7. A 'BACKWARDS CAR' SPECIAL CASE IN THE BROADPHASE. Dropped after checking the wrap arithmetic. `prog` stays well defined for a reversing car, `_colFillBuckets` folds prog into s-space wrap-aware, and pairContact's cheap reject `adProg > LCAR && adProg < L - LCAR` plus the half-lap wrap is symmetric in sign — including the lapper-vs-lapped case at dProg ~ L, which correctly resolves to a real contact. There is no broadphase hole. The genuine backwards problems are the handback sign (proposal 2) and the footprint (proposal 1), both narrow-phase/seam issues.\n\n8. TIGHTENING SETTLE DETECTION VIA pose.sleeping. Noticed that Rapier's docs say a body sleeps after 'a few seconds' of low motion, while IncidentSim's SETTLE_HOLD_S is 0.30 s and WINDOW_MAX_S caps the whole takeover at 3.0 s — so the `pose.sleeping ||` arm of the settle test almost never fires and the velocity bands do all the work. I could not verify Rapier 0.19.3's exact default sleep time (the vendored build at vendor/rapier-0.19.3/rapier.mjs is a wasm-glue bundle with the constant compiled away), so I am recording this as an unverified observation rather than a proposal. Removing the dead arm would be cosmetic anyway."

### netcode-determinism

Investigated and rejected before proposing anything:

1. **Full deterministic lockstep / GGPO-style rollback for car-car contact.** Rollback requires the entire physics state to be snapshottable and replayable every frame (yal.cc; the HN thread on rollback physics engines: "the entire physics engine state has to be snapshotted every frame ... infeasible for large worlds"). Apex 26's per-car state plus the vendored Rapier side-world (js/physics/debris-world.js, 1259 lines) makes that snapshot large and non-trivial to serialize deterministically. Worse, it fights the project's own documented design goal in js/net/netplay.js / docs/MULTIPLAYER.md: "your own car is NEVER corrected — no rollback, no reconciliation, no host advantage." Rollback is specifically a correction mechanism — adopting it inverts a decision the team already made on purpose. A real shipped P2P vehicular-contact game (AutoAge: Standoff, described firsthand on discussions.unity.com) hit this exact wall and converged on the same "each peer has local authority over its own vehicle, accept a discontinuity between screens" compromise Apex 26 already ships — that is independent confirmation the existing architecture, not a rollback rewrite, is the right target to refine.
2. **Bit-exact deterministic lockstep relying on Math.sin/cos-based shared state.** rapier.rs's own determinism docs warn that "transcendental functions like Math.sin, Math.cos are not cross-platform determinism[-preserving]." Apex 26's collision code (js/physics/collide.js) already avoids this correctly — it works entirely in the (prog, x) Frenet plane with subtraction/modulo, never trig, and worldFromTrack's sin/cos only feeds rendering, never collision. Any proposal that pulls new trig-based arithmetic into shared/networked contact state would reintroduce exactly the hazard the current design sidesteps — rejected.
3. **Switch dt to a fixed-step accumulator for determinism.** This is a standard mitigation (Gaffer On Games, "Fix Your Timestep!") but checking js/game.js's tick()/tickBody() shows it is already implemented: `PHYS_DT = 1/60` with `while (physAcc >= PHYS_DT && steps < 5) update(PHYS_DT)` (js/game.js ~line 7459-7557), capped at 5 catch-up steps (the documented "spiral of death" guard) with `renderAlpha` for render-only interpolation. Proposing this again would be redundant with existing, already-correct code — recorded as a dead end, not a proposal.
4. **Host-authoritative correction of remote-predicted cars (always give the host's view priority in contact).** Rejected on sight against the flat/authority rule: js/net/netplay.js's own comment block states the authority model as deliberate predicates (`ownsRaceControl`/`ownsClassification`) precisely so a third role never has to touch per-car contact, and docs/MULTIPLAYER.md is explicit that "no host advantage" is a chosen tradeoff, not an oversight. Star topology also means two guests never have a direct channel to reconcile against each other anyway (the host only relays, per netplay.js: "Authority does not move; it is a courier").
5. **Disable car-car collision in multiplayer ("ghost" cars, as some P2P kart racers reportedly do) to sidestep the fairness problem entirely.** Technically the cheapest possible fix and mentioned as a real pattern in racing-netcode discussion (gamefaqs.gamespot.com thread on P2P racing). Rejected because it removes a core, already-shipped gameplay system (car-to-car contact is a first-class feature per collide.js's extensive tuning comments) rather than improving it — out of scope for "make contact fair," and not something this lens should propose unasked.
6. **Full server-style client-prediction + reconciliation with periodic hard position snaps (Gambetta's classic pattern) for the LOCAL player's own car.** Rejected: this pattern assumes an authoritative server that can override the client; Apex 26 has no backend and explicitly guarantees a human's own car is never corrected by anything (not even the host). Applying reconciliation to the player's own car would be a determinism/fairness regression, not an improvement, and there's no server to be authoritative.
