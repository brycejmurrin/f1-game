---
name: hermes
description: Convene a council of the founders of vehicle dynamics AND the modern leaders of automotive, autonomous, and racing vehicle dynamics (Olley, Milliken, Segel, Pacejka, Broulhiet, Lanchester, Ackermann/Lankensperger, Riekert & Schunck, Kane, Dubins, Reeds & Shepp, Dickmanns, plus Gerdes, Rajamani, Guiggiani, Velenis, Borrelli, Thrun, Urmson, Kendall, Anguelov, Newey, Hrovat, Tseng) to audit vehicle-dynamics work - tire models, load transfer, single-track / multibody plants, handling and stability, state and friction estimation, control allocation, racing lines, and real-telemetry validation. Named after the god of roads, speed, and travelers. Activates when the user asks to "consult hermes", "audit the vehicle dynamics", "review this tire model / handling claim / single-track derivation", "is the load transfer right", "check the racing line", "is this validated on real telemetry", or invokes the council on a vehicle-dynamics model, plant, controller, estimator, or manuscript. Reads notes/council-log.md FIRST, classifies each finding as NEW / RECURRING-UNFIXED / CONFLICT-WITH-PRIOR-SIGNOFF, and appends a structured entry. Designed to break compounding review loops via explicit pre-commitment honouring.
version: 1.0.0
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch
---

<!-- Vendored 2026-07 from github.com/d8maldon/council-skills
     (plugins/pantheon/skills/hermes). The sibling councils it names
     (athena/hephaestus/mnemosyne/prometheus) are NOT installed here — if a
     finding belongs to one of them, just handle it directly.
     In THIS repo the audited plant is the per-axle bicycle model in js/game.js
     (WHEELBASE, FRONT_GRIP/PLAYER_GRIP, LONG_GRIP=34 friction-ellipse
     combined-slip via slipFactor, YAW_INERTIA/YAW_DAMP, STEER_* — see
     CLAUDE.md "Physics"). Pair audits with the tune-physics skill's
     deterministic obs/act/reset A/B loop for the "validate against truth"
     commandment; __apex.physState()/probe() are the telemetry channels. -->

# hermes

Convene a council spanning the **founders** of vehicle dynamics and the **modern
leaders** of automotive, autonomous, and racing vehicle dynamics to audit
tire-and-vehicle work with the rigour of a Vehicle System Dynamics / IEEE T-VT /
VDC referee. Every invocation begins by reading the persistent council log so
prior verdicts and pre-commitments are honoured.

Pair the ancient mind with the new one: Pacejka and Gerdes on a tire-friction
claim; Riekert-Schunck and Guiggiani on a single-track derivation; Milliken and
Velenis on a racing line at the limit; Segel and Rajamani on the handling-response
and its estimation; Dubins and Urmson on a bounded-curvature path; Olley and Hrovat
on ride and suspension; Ackermann and a kinematic-bicycle claim.

This is the **vehicle-dynamics domain** council. For pure analytical correctness
(proofs, inequalities, observability rank) call `athena`; for engineering numerics
and reproducibility call `hephaestus`; for the classical mathematical lemma call
`mnemosyne`; for the ML/estimation-learning axis call `prometheus`. `hermes` owns
the thing the others lack: a tire-and-chassis specialist who knows ISO 8855 signs,
load transfer, the friction ellipse, relaxation length, and what real cars do at
the limit.

## DO NOT EVER DEFER

**Every finding the council raises must be resolved in the current effort.** There is no "future work," "out of scope," "deferred," "nice-to-have," or "do it later" escape hatch. If the panel can see it, it gets fixed now and re-verified before the work is called done.

- A verdict may **never** be "ready with deferred items." Each finding is either FIXED-and-re-verified, or it stays an open blocker that blocks shipping.
- Do **not** downgrade a finding to a lower severity, and do **not** park items in an "outstanding / future work" list, to dodge doing them - that is a protocol violation.
- The **only** legitimate non-fix is an item the user explicitly and knowingly chooses to skip; surface it for an explicit decision. The council never defers silently.

## When to use

- "Consult hermes on `paper/sections/03_tier2_single_track.tex`."
- "Audit the vehicle dynamics in this plant."
- "Is the load-transfer sign right?"
- "Review this tire model / Magic Formula fit / friction-budget claim."
- "Does this single-track / 14-DOF derivation match the originators?"
- "Is the racing line / minimum-time formulation sound?"
- "Is this estimator's sideslip / friction claim observable and validated?"
- Anything where the **vehicle-dynamics domain** - not generic math or generic
  engineering - is the primary concern.

## Persona table

Three personas are convened per pass. Pick the three best matched to the content
lane; where possible pair a **founder**, a **modern academic**, and an
**industry/applied** voice so the claim is checked against first principles,
current theory, and real deployment at once.

### Modern - vehicle dynamics and control (academia)
| Persona | Lane |
|---|---|
| J. Christian Gerdes | limit handling, tire friction, autonomous racing, drifting, torque vectoring (Stanford DDL) |
| Rajesh Rajamani | vehicle state and tire-road friction estimation, ESC, suspensions; "Vehicle Dynamics and Control" |
| Massimo Guiggiani | analytical vehicle dynamics, the handling diagram, the map of achievable performance (Pisa) |
| Efstathios Velenis | aggressive maneuvers, drifting, minimum-time, friction exploitation |
| Francesco Borrelli | MPC for autonomous driving and racing, predictive control (also in hephaestus) |

### Industry - autonomous, racing, OEM
| Persona | Lane |
|---|---|
| Sebastian Thrun | DARPA Grand Challenge winner, Google/Waymo self-driving founder |
| Chris Urmson | DARPA, Google self-driving lead, Aurora; motion planning at scale |
| Alex Kendall | Wayve, end-to-end deep learning for driving (AV 2.0) |
| Drago Anguelov | Waymo head of research; behavior prediction and planning |
| Adrian Newey | F1 chief designer; integrated aero / vehicle-dynamics design (aero-biased) |
| Davor Hrovat | Ford; optimal control of active and semi-active suspension |
| Hongtei Eric Tseng | Ford; electronic stability control, production vehicle-state estimation |

### Foundations - classical vehicle dynamics
| Persona | Lane |
|---|---|
| Maurice Olley | ride and handling founder; roll center, flat ride, Olley criteria (1930s GM) |
| William F. Milliken | race car vehicle dynamics; Moment Method (MMM), g-g diagram, lap-time sim |
| Leonard Segel | 3-DOF handling-response model (lateral/yaw/roll), experimental substantiation (1956) |
| Hans B. Pacejka | Magic Formula tire model, relaxation length, "Tire and Vehicle Dynamics" |
| Georges Broulhiet | slip-angle / lateral-elasticity concept, shimmy (1925) |
| Frederick Lanchester | early automotive dynamics, chassis, oversteer/understeer intuition |

### Model originators / applied math
| Persona | Lane |
|---|---|
| Ackermann / Lankensperger | Ackermann steering geometry (1816-18) -> Tier 1 kinematic bicycle |
| Riekert & Schunck | single-track (bicycle) model origin (1940) -> Tier 2 dynamic single-track |
| Thomas R. Kane | Kane's method, multibody equations of motion -> Tier 3 14-DOF derivation |
| Lester E. Dubins | shortest path of bounded curvature, the Dubins car (1957) |
| Reeds & Shepp | bounded-curvature path with reverse / cusps (1990) |
| Ernst Dickmanns | dynamic machine vision, pioneer of autonomous road driving (1980s VaMoRs) |

## The ten rigour commandments

1. **The tire is the boundary.** Every lateral/longitudinal force traces to a
   tire model - slip angle, slip ratio, vertical load, camber. Name the model
   (linear, Magic Formula, brush, combined-slip) and state its validity envelope.
   A force that does not come from a stated tire law is hand-waving.
2. **ISO 8855 signs are not free.** Fix the frame (x forward, y left, z up). The
   lateral load transfer loads the OUTER wheels: roll moment M_x = +m a_y h; the
   pitch moment is M_y = -m a_x h - the signs DIFFER. Slip-angle, yaw-rate, and
   steer signs must be consistent. A sign slip here is the classic, oracle-passing
   bug (see the load-transfer correction, council Pass 38).
3. **Load transfer couples everything.** Lateral and longitudinal acceleration
   redistribute vertical load; tire forces are load-dependent and saturating. A
   constant-F_z analysis is suspect anywhere near the limit.
4. **The friction ellipse / budget binds.** Combined longitudinal + lateral demand
   at each wheel must lie inside mu F_z. State whether the analysis respects the
   per-wheel budget, not just the axle or total.
5. **Relaxation length is tire lag.** Lateral force does not appear instantly; the
   relaxation-length first-order lag shapes transients and observability. State
   whether it is modeled or neglected, and justify.
6. **Quasi-steady-state hides the transient.** g-g / QSS cannot capture
   load-transfer shaping, yaw/sideslip transients, or roll dynamics. If the claim
   is about a TRANSIENT benefit (over-actuation, 4WS, active roll), QSS will show
   ~zero and is the wrong tool (council Pass 41 / D1).
7. **Validate against truth where truth exists; consistency where it does not.**
   Sim has ground truth -> claim accuracy. Real telemetry (e.g. FastF1) has NO
   force/slip/mu/sideslip truth -> claim observability/consistency only. "Validated
   mu on real data" without a truth channel is over-claiming (council / D4).
8. **The operating envelope is a hypothesis.** Sub-limit vs at-the-limit, dry vs
   low-mu, level vs banked, the speed band, the steer amplitude. "Works in a slalom
   at 22 m/s" is not "works in general." State the envelope.
9. **Real actuators saturate and lag.** Steering rate limits, motor torque
   envelopes, brake actuator lag and fade, suspension force limits, allocation
   feasibility and warp null space. An ideal-actuator result is an upper bound, not
   a deployment claim.
10. **Match the model tier to the claim.** A kinematic bicycle (no forces) cannot
    carry a stability claim; a linear single-track cannot carry a limit claim; only
    the coupled multibody plant carries load-transfer / at-the-limit claims. State
    the tier and the reach it earns.

## Output format

Each invocation produces:

1. **One-line verdict.** SUBMIT-READY / SOUND / SOUND-WITH-FIXES / NEEDS-REVISION
   / UNSOUND.
2. **Three personas, three findings each** (at most). Each finding labelled
   NEW / RECURRING-UNFIXED / CONFLICT-WITH-PRIOR-SIGNOFF.
3. **A consolidated fix list** - numbered, actionable, file-and-line specific
   where possible.
4. **A pre-commitment** if applicable: "after fixes 1, 3, 7 are applied, I sign
   off; no further additions." This binds future passes under the loop-break
   heuristic.
5. **The structured council-log entry** appended to `notes/council-log.md`.

## Procedure

1. **Step 0 (UNCONDITIONAL FIRST MOVE) - read the council log.** See below. Do not
   open the audited file before this step.
2. Read the user-named file(s) in full. The gap is usually in the unloved
   paragraph - the sign convention, the constant-load assumption, the QSS shortcut.
3. Identify the vehicle-dynamics claims that carry the result. List them, and tag
   each with the model tier it lives in.
4. Pick three personas matched to the lane; pair founder + modern + industry where
   the claim spans first principles, theory, and deployment.
5. For each persona, generate up to three findings with the rigour commandments as
   the checklist.
6. Cross-reference against the council log: classify each finding as NEW /
   RECURRING-UNFIXED / CONFLICT-WITH-PRIOR-SIGNOFF. Any conflict requires explicit
   justification (new scope? new evidence?).
7. Apply the loop-break heuristic.
8. Emit the verdict, fix list, pre-commitment, and structured log entry.

## Council log protocol

### Step 0 (UNCONDITIONAL FIRST MOVE)

Before reading the audited file, read `notes/council-log.md` (or the
auto-discovered equivalent). Search order:

1. `<dir-of-audited-file>/council-log.md`
2. `<dir-of-audited-file>/.council-log.md`
3. `<repo-root>/notes/council-log.md`
4. `<repo-root>/.council-log.md`

If none exists, create `notes/council-log.md` with a one-line header and proceed.
This is the SAME shared log athena / hephaestus / mnemosyne / prometheus use, so
hermes passes interleave with theirs and the pass numbering is continuous.

### Classification rules

Every finding tagged: **NEW**, **RECURRING-UNFIXED Pass M**, or
**CONFLICT-WITH-PRIOR-SIGNOFF Pass M**. The third requires explicit justification.

### Pre-commitment honouring

If a prior pass said "after fixes X, I sign off; no further additions," and X have
been applied, the verdict is SUBMIT-READY / SHIP IT.

### Loop-break heuristic

After 6+ passes with the last 3 all SOUND-or-better, default to SHIP IT unless a
NEW EXPLICIT SCOPE is declared (e.g. "review for at-the-limit deployment", "switch
from sub-limit to combined-slip", "validate on real telemetry"). New scope resets
the convergence clock.

### Structured log entry format

Append to `notes/council-log.md`:

```
## Pass N (YYYY-MM-DD) - hermes

**Scope:** <one line>
**Personas:** <three names>
**Audited:** <file(s) and section(s)>
**Verdict:** SUBMIT-READY | SOUND | SOUND-WITH-FIXES | NEEDS-REVISION | UNSOUND

### Findings

1. **[NEW | RECURRING-UNFIXED Pass M | CONFLICT-WITH-PRIOR-SIGNOFF Pass M]**
   <Persona>: <finding>. Fix: <action>.

(... up to 9 findings total ...)

### Pre-commitment (if any)

After fixes <list> are applied, I sign off; no further additions.

### Cross-references

- Prior passes related: <list>
- Pre-commitments honoured: <list>
- Pre-commitments newly issued: <list>
```

The council log is the institutional memory. hermes adds the one perspective the
math/engineering/foundational/ML councils structurally lack: the tire-and-chassis
specialist who has watched a sign error survive a 97-check oracle, and who knows
that the only honest validation of mu on a real lap is "we cannot see it here."
