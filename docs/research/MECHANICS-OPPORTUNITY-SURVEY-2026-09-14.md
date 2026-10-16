# Apex 26: mechanics survey and development opportunities

Survey date: 14 September 2026
Repository: [brycejmurrin/f1-game](https://github.com/brycejmurrin/f1-game)
Revision surveyed: [b8eb25af8f984396128f0636c0fe9611eabb3f36](https://github.com/brycejmurrin/f1-game/tree/b8eb25af8f984396128f0636c0fe9611eabb3f36)
Branch: `claude/f1-game-project-26h3ng`

**Overall assessment**

Apex 26 already has a broad game around its driving model: races, qualifying, sprints, time trials, ghosts, daily challenges, season and career progression, tyre strategy, race control, setup tuning, multiplayer, multiple renderers, and extensive input support.

The biggest opportunity is to make those systems agree and communicate clearly. Player physics and AI planning use different grip assumptions; weather changes discrete grip states; setup controls do not yet express all their real mechanical relationships; and ghosts are not fully separated by the conditions that produced them. Improving these connections should produce a more convincing game than adding another large simulation subsystem.

This is a code survey with primary-source research, not a handling review from driving the game. One collision candidate-rejection issue was reproduced by executing the actual collision module in an isolated Node harness. No full test suite, multiplayer race, browser visual review, or real-device performance session was run during this survey. Source files were left unchanged. Recommendations below are design proposals unless explicitly identified as existing behavior or a reproduced finding.

**1. What the game already contains**

| Area | Current implementation | Best next opportunity |
|---|---|---|
| Architecture | Static JavaScript modules use IIFE globals and a shared `G` façade. There are 274 JavaScript files, 52 circuit definitions and 52 scenery modules. Three.js, Rapier, Trystero and jsQR are vendored. | Preserve lightweight deployment; extract shared physics contracts where discrepancies are costly. |
| Simulation clock | Fixed 60 Hz physics, accumulator, rendering interpolation, maximum five steps per rendered frame and backlog dropping after the cap. | Measure sustained overload and simulation-time loss on slower devices. |
| Player motion | World-space position and heading integrate forces; track position is projected back for rules and gameplay. | Preserve independent player motion: the track must not steer an unassisted car. |
| Lateral handling | Front/rear slip angles feed saturating tyre forces, with yaw inertia and damping. | Make the limit progressive and legible; investigate transient force response and post-peak behavior. |
| Longitudinal handling | Engine/gear acceleration, braking, drag and a combined-grip allowance interact with cornering. | Explicit wheel rotation and slip ratio would unlock richer locking, wheelspin and traction behavior. |
| Aero and load | Speed-dependent aero, dirty air, longitudinal load transfer, banking and vertical-road effects influence grip. | Align their interpretation across player, AI and reference lap models. |
| Transmission and energy | Eight gears, automatic/manual shifting, boost battery and harvesting, deployment taper, proximity overtake logic and active-aero zones. | Make energy planning and deployment intent understandable over a lap. |
| Tyres | Optional off/light/real models include surface/core heat, front/rear wear, graining, blistering, compounds and wet tread. The model defaults off. | Improve feedback and strategy before adding more state variables. |
| Weather | Dry/wet/rain affect grip; weather arcs progress between discrete states. | Introduce continuous track wetness shared by physics, AI, strategy and rendering. |
| Setup | A broad garage plus five fine-tuning controls for front/rear bars, front/rear ride height and brake bias. Some settings map to generic performance modifiers. | Give axle balance and load transfer direct, comprehensible effects. |
| Pit stops | Entry/commitment logic, speed limits, lane cues, service hold and automatic compound selection; AI already plans and reacts to stops. The route remains based on the road ribbon. | Estimate actual pit loss and offer a deliberate next-compound choice; later add a separate pit route. |
| AI racecraft | Traits, team styles, defending, alongside constraints, braking protection, passing states, stuck recovery, traffic checks, slipstream, dirty air and team orders. | Unify the speed planner and steering controller's feasible grip envelope. |
| Collision handling | Track-coordinate candidate checks, yaw-expanded extents, repeated separation, rear impulses and capped rubbing/punting responses. | Repair the reproduced extent bound, then improve oblique contact geometry and angular response. |
| Major incidents | Optional Rapier ownership for bounded airborne/contact/pileup events, with handback to normal driving. | Test transitions and ownership carefully before broadening rigid-body use. |
| Race control | Yellow flags, VSC, safety car and red flag states, limits warnings, time penalties, finish classification and rescue handling. | Explain incidents and penalties better; assess whether hazards actually block the racing corridor. |
| Sessions and progression | Grand Prix, qualifying, sprint, season, time trial, Driver Career and My Team. The internal roster contains 24 season circuits and 28 classics. | Link practice, setup learning and race objectives into a more useful progression loop. |
| Career depth | Six save slots, migration and backup paths, contracts, teammate recruitment, sponsors, facilities, R&D, objectives, reliability and season rollover. | Add meaningful choices and clearer consequences to existing systems. |
| Time trials | Ghost recording/playback and medals against a modeled reference lap. | Version records and ghosts by physics, setup, conditions and assist class. |
| Daily play | Seeded circuit/weather/time-of-day challenge, streak and share text. | Add a standardized event class; current challenge selection does not lock every performance variable. |
| Multiplayer | Two to four players over a WebRTC star, owner-simulated human cars, host AI/race control, compact 20 Hz snapshots, buffered interpolation and capped extrapolation. | Replicate strategic state and negotiate compatibility; collision ownership needs explicit scenario testing. |
| Graphics | WebGL2, native WebGPU and Three/TSL paths; PBR materials, car paint, reflections, shadows, sky/weather and postprocessing. | Establish material/color parity and stable motion before adding expensive effects. |
| Performance | Chunking, culling, instancing, mip/anisotropy support, quality tiers and an adaptive performance governor. | Profile whole-frame bottlenecks and sustained mobile behavior rather than adding another automatic scaler. |
| Audio and feedback | Engine synthesis/sample behavior, drivetrain/wind/tyre cues, spatial nearby rivals, engineer messages, music and haptics. | Prioritize actionable cues and distinguish front washout from rear instability. |
| Input and onboarding | Keyboard, touch, filtered gyro, gamepad, remapping/calibration, assists, auto throttle, camera options and initial coaching. | Make saved profiles, assist behavior and learning drills easier to discover. |

Code anchors: [main simulation](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/game.js), [AI](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/physics/ai-drive.js), [tyres](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/physics/tyre-model.js), [collision](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/physics/collide.js), [career](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/career/career.js).

**2. Highest-priority changes**

Effort is relative: small means a localized change; medium spans several modules; large changes simulation, content or network contracts. These are estimates, not delivery commitments.

| Priority | Proposal | Player benefit | Effort / main risk |
|---|---|---|---|
| 1 | Repair collision extent rejection and build repeatable contact scenarios | Fewer inexplicable missed contacts | Small / changes to established collision feel |
| 2 | Share the feasible grip envelope between AI planning and control | More believable pace, overtaking and defending | Medium / AI pace must be recalibrated |
| 3 | Version time-trial records and standardize a daily event class | Trustworthy improvement and comparison | Small–medium / migrate old records without deleting them |
| 4 | Instrument and tune the approach to the tyre limit | Better confidence under braking and cornering | Medium / avoid adding input lag or sudden loss of control |
| 5 | Blend track wetness and improve pit advice | Readable conditions and meaningful strategy | Medium / many systems consume weather |
| 6 | Establish renderer parity and a sustained device benchmark | Consistent visuals and smoother racing | Medium / requires real devices and stable reference scenes |
| 7 | Give setup controls clearer mechanical consequences | Tuning becomes a useful skill | Medium–large / lateral load-transfer model needed |
| 8 | Replicate pit/tyre events and negotiate multiplayer compatibility | Fewer strategic state disagreements | Medium / protocol versioning and reconnect behavior |

**3. Driving physics and feel**

The current lateral tyre function is a smooth hyperbolic tangent: force approaches a limit without a pronounced post-peak falloff. This is a reasonable accessibility choice. It may, however, reduce the distinction between approaching the limit, exceeding it slightly, and asking far too much of the tyre. That is a handling hypothesis to test, not a conclusion from play.

Start with a telemetry view showing steering command, actual steering, front/rear slip angle, lateral force utilization, brake demand, combined-grip budget and yaw rate. Record a constant-radius corner, a brake release into a turn, a rapid direction change and power application on exit. This will reveal whether a complaint comes from inputs, tyre response, steering geometry or camera feedback.

Then prototype one change at a time:

- A controllable shoulder and modest post-peak drop in the lateral force curve.
- Short, speed-aware force relaxation, if telemetry reveals implausibly instantaneous response.
- Better axle-specific brake/traction saturation cues.
- Separate camera response from vehicle dynamics so camera smoothing does not conceal the onset of oversteer.

PhysX's vehicle documentation is a useful reference for load-dependent stiffness and friction-versus-slip behavior. MathWorks describes Fiala as a lower-parameter alternative to more elaborate tyre models, with limits under combined slip. Neither source supplies validated coefficients for this game's cars; fit an approachable model to repeatable maneuvers rather than importing a name or arbitrary parameter set. [PhysX vehicle model](https://nvidia-omniverse.github.io/PhysX/physx/5.4.1/docs/Vehicles.html), [MathWorks Fiala wheel](https://www.mathworks.com/help/vdynblks/ref/fialawheel2dof.html).

Explicit wheel angular velocity is a larger, separate step. Current braking demand is not the same thing as measuring a wheel that has stopped rotating. A wheel model would support genuine lockup, wheelspin, traction-control interventions and flat spots; adding those effects without wheel state would remain heuristic. Rotational torque balance and longitudinal relaxation are documented here: [MathWorks longitudinal wheel](https://www.mathworks.com/help/autoblks/ref/longitudinalwheel.html).

Keep the fixed-step architecture. The existing accumulator and interpolation follow a sound approach, but the five-step cap means persistent overload can lose simulation time. Measure that loss alongside frame times. A higher physics frequency should be justified by a demonstrated instability, not assumed to improve everything. [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/).

**4. AI: consistency before complexity**

The clearest architectural discrepancy is between the AI's corner-speed planner and the actuator that follows its line. The planner uses a flat lateral limit; the controller includes a speed-related lateral grip reduction. Comments in the AI code explicitly explain that planner aero was reverted because the controller could not execute the faster plan. The player meanwhile gains downforce-related grip.

Create a shared function that answers: “At this speed, on this surface, with these tyres and aero conditions, how much lateral acceleration is feasible?” Use it in both AI braking planning and steering/yaw limits. Preserve conservative margins for skill and traffic. Only then recalibrate difficulty.

Existing AI already has passing and defending states. Extend those states to score a small set of reachable corridors over a short horizon: stay, attack inside, attack outside, yield, and prepare a better exit. Score progress, required braking, overlap, track edge, likely collision, dirty air and exit speed. Keep commitment long enough to avoid oscillation.

Gran Turismo Sophy's published approach distinguishes control, tactics and racing etiquette and uses targeted scenarios. The useful transfer here is a scenario-based evaluation process, rather than starting an expensive reinforcement-learning program. Build cases for a slower car at corner exit, side-by-side braking, a defended hairpin, a blue-flag pass, a spun car and a safety-car restart. [Gran Turismo Sophy technology](https://www.gran-turismo.com/us/gran-turismo-sophy/technology/).

Track “clean completed passes,” avoidable contacts, aborted attacks, recovery time and pace consistency separately. Lap time alone rewards an AI that may be unpleasant to race. Expose its target corridor and decision reason in a developer overlay. Difficulty can adjust pace, reaction margin and consistency independently; aggressive driving should not automatically mean faster driving.

**5. Collisions: one reproduced issue and a staged improvement**

The normal collision solver works mainly in road coordinates with yaw-expanded extents. This is economical and intentionally forgiving, but it approximates oblique contacts and normally lacks a full contact-point angular impulse.

A specific candidate-bound problem was reproduced against the actual `Collide.pairContact` implementation:

| Quantity | Reproduction |
|---|---|
| Cars | Two human cars, stationary, same lateral position |
| Visual yaw | Opposite signs of approximately 157.380135 degrees |
| Longitudinal separation | 5.1 m |
| Combined longitudinal support under the module's own extent formula | 5.2 m |
| Early longitudinal rejection bound | 5.0 m |
| Actual result | `null` contact candidate |

This demonstrates that the early bound can reject a pair that passes the later extent test. It does not establish that a precise oriented-box solver would report contact, nor that this exact pose has been observed in a multiplayer race. Fix the bound so it is conservative for both bodies, then verify rotated human–human and human–AI cases.

For further improvement, keep the inexpensive broadphase and add oriented-box/SAT narrowphase only where needed. Generate a stable contact normal and contact point; introduce bounded angular and tangential response; check that separation does not create energy. Repeated-contact stabilization should distinguish velocity impulses from positional correction. Erin Catto's discussion of accumulated impulses, warm starting and stabilization is a useful implementation reference. [Box2D Solver2D](https://box2d.org/posts/2024/02/solver2d/).

Use swept tests for high-relative-speed normal-driving contacts where a discrete check can miss an intersection. Rapier's continuous collision detection is a separate mechanism for the bodies it owns, and carries a cost; it is not proof that every bespoke driving collision is covered. [Rapier CCD](https://rapier.rs/docs/user_guides/javascript/rigid_body_ccd/).

Retain clear ownership during incident simulation and handback. Before expanding Rapier, test: no duplicate integration, no teleport on ownership change, no sudden speed creation, sensible road reattachment and consistent damage settlement. Inspect [incident simulation](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/physics/incident-sim.js).

**6. Tyres, weather, pits and setup**

The tyre model is already unusually rich for this delivery format. Its next improvements should help players understand what they have:

- Show surface temperature and deeper heat with a readable qualitative distinction.
- Connect sustained sliding to wear and damage through engineer explanations.
- Explain whether the fronts or rears are limiting the car.
- Keep the off/light/real choice visible when comparing records.

First introduce a continuous global wetness value. Blend dry and wet grip and visual water coherently; let AI and compound evaluation consume the same value. Then, if useful, add sector wetness, drainage and a drying racing line. Local standing water and aquaplaning belong after that shared foundation. Otherwise graphics may show one condition while physics and strategy act on another.

The pit engineer already advises on forecasts, wear, graining and blistering. Improve its confidence and cost model: “A stop costs about X seconds; your current gap is Y; this tyre should reach the finish.” A safety-car stop is reduced-cost, not literally free—the current “FREE STOP” wording can overpromise. Model actual pit loss before stronger strategic recommendations.

Offer next-compound selection with a sensible automatic default. Add a real pit-lane branch later, with its own entry/exit geometry, limiter line and merge priorities. That is a content and path-routing feature, not just a visual lane marking. Relevant code: [pit lane](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/race/pit-lane.js), [engineer](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/race/engineer.js).

Front/rear anti-roll settings currently lack a direct axle-balance contract. Build a modest lateral load-transfer model before presenting them as precise understeer/oversteer tools. A bicycle model cannot represent left/right load transfer by itself; a four-corner representation can. [MathWorks vehicle-body model](https://www.mathworks.com/help/vdynblks/ref/vehiclebody3dof.html). Pair each setup change with a short expected effect and a practice maneuver. Body pitch/roll/heave is currently visual spring response; do not confuse that animation with a fully simulated suspension. [Setup tuning](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/garage/setup-tune.js), [body attitude](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/physics/body-attitude.js).

**7. Fair competition, practice and multiplayer**

Ghosts are organized by track, with some metadata, but do not fully identify setup and physics version. Daily selection fixes circuit, weather, time of day and seed, while leaving other performance-affecting choices available. This is a comparison-design gap, not evidence of cheating or a broken ranked backend.

Define an event fingerprint containing circuit/layout revision, physics revision, car/performance specification, setup, weather policy, pace scale and assist category. Offer a fixed-spec daily class and an open class. Preserve older records as legacy entries instead of deleting personal history. Make medals comparable to the selected class; a modeled reference lap is only as coherent as its vehicle assumptions. [Ghost storage](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/car/ghost.js), [daily challenge](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/race/daily-challenge.js).

High-value practice ideas include sector retry, braking-point exercises, trail-braking drills, ghost speed differences and a “why this lap was invalid” timeline. Full rewind is substantially larger: it must restore random state, tyres, flags, timers and pending actions, and avoid duplicate career settlement. Start with practice-only checkpoints.

Multiplayer snapshots efficiently cover motion, but tyre/pit strategic state is not equivalently represented in the inspected protocol. Add versioned reliable events for pit service, compound changes and significant race-state transitions, with a compact state snapshot for reconnects. Negotiate physics/event compatibility during the handshake.

Tune interpolation to observed jitter, retaining a latency ceiling. Hermite interpolation is useful when appropriate velocity data exists; scalar road speed alone is not a complete world-space velocity for a sliding car. Prediction also fails around discontinuities such as collisions, so higher snapshot frequency cannot solve ownership disagreement. [Snapshot interpolation](https://gafferongames.com/post/snapshot_interpolation/). Relevant code: [snapshot format](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/net/snapshot.js), [network play](https://github.com/brycejmurrin/f1-game/blob/b8eb25af8f984396128f0636c0fe9611eabb3f36/js/net/netplay.js).

**8. Graphics and performance**

The game already has PBR, reflection and shadow systems, weather, substantial postprocessing and three rendering paths. A more useful next milestone is consistent material response and stable motion.

Create a small reference scene with neutral illumination, matte colors, rough metals, glossy car paint and a bright sky. Capture identical cameras and exposure settings across all renderers. Check color-space handling, roughness, clearcoat energy and tone mapping. Filament's material and lighting documentation provides a good reference for evaluating physical consistency. [Filament rendering documentation](https://google.github.io/filament/main/filament.html).

Then test high-speed road markings, barriers, distant fencing, shiny bodywork and wet highlights. Reduce shimmer through appropriate mip selection, texture filtering, roughness treatment and geometry detail before committing to temporal antialiasing. The native WebGPU path has disabled TAA scaffolding; enabling jitter alone is not a complete solution. A robust temporal implementation needs motion/history handling, rejection and camera-cut behavior.

The existing governor already adjusts resolution and quality. Profile CPU time, GPU work and presentation behavior separately, plus p50/p95/p99 frame times and simulation backlog. Optional WebGPU timestamp queries can help, but isolated GPU timings and cross-device comparisons need care. [WebGPU timing](https://webgpufundamentals.org/webgpu/lessons/webgpu-timing.html).

A compressed-texture experiment could reduce memory and upload pressure. KTX2/Basis supports transcoding for device formats, but the current material-array pipeline would need integration and fallback handling. Preserve layer indexing and correct color-space treatment; measure decoded peak memory as well as final GPU allocation. [KTX2 specification](https://github.khronos.org/KTX-Specification/ktxspec.v2.html). Continue prioritizing batching, capability checks and avoiding blocking graphics calls. [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

Artistically, prioritize readable braking markers, clear track edges, coherent scale and convincing contact shadows. Shared wetness should drive the visual weather upgrade. These changes support racing on small screens more directly than uniformly increasing polygon counts.

**9. Additional ideas worth exploring**

These are original design proposals informed by the inspected systems, not claims about currently missing code in every detail.

| Area | Idea | Scope / prerequisite |
|---|---|---|
| Energy | A lap energy forecast with save/attack suggestions | Medium; reliable projected consumption |
| Energy | Optional preplanned deployment by sector | Medium; clear manual override |
| Driving | A brief post-corner “front limited / rear limited / brake limited” coaching cue | Small–medium; trustworthy telemetry |
| Driving | Brake-temperature behavior only if it creates a readable decision | Large; avoid hidden random loss of braking |
| Driving | Progressive, optional contact damage with specific handling consequences | Large; collision consistency first |
| Strategy | Undercut/overcut estimate using actual pit loss and tyre pace | Medium; communicate uncertainty |
| Strategy | Race-length-aware stint wear calibration | Medium; compare short and long events |
| Strategy | Limited weekend tyre allocations as an optional realism setting | Medium; keep separate from owned inventory |
| Race control | Hazard severity based on blocked width and approach speed | Medium; scenario validation |
| Race control | Clear incident and penalty timeline after a race | Small–medium; event log |
| AI | Rival tendencies visible through repeated behavior | Medium; use existing traits consistently |
| AI | Explainable team orders and strategic cooperation | Medium; avoid unexplained pace changes |
| Career | Practice objectives that teach setup and tyre management | Medium; reuse drills |
| Career | Sponsor choices with competing goals and visible consequences | Medium; extend existing sponsors |
| Career | Reliability forecasts with understandable risk and maintenance choices | Medium; avoid surprise-only penalties |
| Career | Optional regulation changes between seasons | Large; stable multi-season balance first |
| Progression | Circuit mastery through sectors and clean-race goals | Medium; versioned records |
| Social | Shareable daily result cards and short race highlights | Medium–large; replay/event capture |
| Audio | Distinct front scrub, rear slip and proximity cues | Medium; prioritize rather than stack sounds |
| Audio | Engineer verbosity and interruption priorities | Small–medium; critical calls override flavor |
| Accessibility | Low-motion camera preset and separately adjustable shake | Small; inspect existing camera options first |
| Accessibility | Persistent device profiles and discoverable touch targets | Small–medium; build on existing remapping |
| Accessibility | Captions or visual equivalents for every critical audio instruction | Small–medium; information parity |
| Graphics | Trackside detail concentrated around braking and passing zones | Medium; content/performance balance |
| Graphics | Photo mode after camera and renderer consistency is established | Medium; reuse scene controls |
| Multiplayer | Connection-quality indicator and honest reconnect status | Small–medium; network telemetry |
| Multiplayer | Separate casual ownership model from any future ranked authority model | Large; a product decision, not a quick patch |

Existing auto throttle, remapping, gyro and assist support are good foundations. Accessibility work should improve discoverability and provide alternatives to sustained holds or motion-only input, rather than merely adding more bindings. [Xbox Accessibility Guideline 107](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/107).

**10. Development sequence and acceptance evidence**

**First: establish trust.** Fix the collision bound; add regression scenarios; version record identity; capture baseline handling, AI and performance traces. Deliverables should be small enough to compare against the current revision.

**Second: improve the core lap.** Align AI planning/control grip, tune limit behavior from telemetry, improve feedback and prototype meaningful setup balance. Recalibrate reference laps and AI difficulty after the physics changes.

**Third: make conditions and strategy coherent.** Introduce shared wetness, improve pit-loss advice and compound choice, then expand pit geometry if it earns its content cost.

**Fourth: improve presentation and online consistency.** Validate renderer parity, sustained performance and strategic state replication. Bring in larger features such as wheel dynamics, richer damage, replay or ranked authority only with a specific gameplay goal.

| Test scenario | Evidence to collect |
|---|---|
| Straight acceleration and repeated braking | Gear transitions, stopping-distance consistency, frame-rate independence |
| Constant-radius corner and slalom | Front/rear saturation, yaw response, recovery and input-to-motion delay |
| Fast aero corner versus slow hairpin | Whether player and AI use coherent grip assumptions |
| Parallel rub, rear contact, oblique contact, rotated pair | Candidate detection, bounded energy, separation and stable heading |
| Spin into traffic and Rapier handback | Ownership, continuity, recovery and repeatability |
| Dry-to-wet transition and mixed tyre choices | Smooth grip evolution and consistent AI/engineer/rendered conditions |
| Side-by-side braking and defended corner | Clean completion, avoidable contacts and decision stability |
| Pit entry, service, exit and reconnect | State agreement, compound identity and merge behavior |
| Identical ghost/event after setup or physics change | Correct category separation and preserved history |
| Busy wet race on real desktop/mobile devices | Sustained frame percentiles, thermal degradation, memory and physics backlog |

Use representative contrasting tracks—for example Monza, Monaco, Suzuka, Spa and Singapore—rather than testing every change everywhere. Use keyboard, touch/gyro and gamepad for handling checks, because good controller behavior does not establish good touch behavior. Set numerical acceptance thresholds from the baseline and intended device class; none are claimed to have passed here.

The repository already has a substantial test base (248 Node test files and 117 root Playwright specs identified in this checkout). Reuse targeted tests and scenarios; broad suites and real-device sessions should validate the changes when implementation begins.

**Recommended first package**

Bundle the conservative collision-bound repair, shared AI grip-envelope work, event/ghost identity and a developer handling trace. This package addresses a reproduced defect, a documented internal inconsistency and a fairness gap while producing the measurements needed to make subsequent driving changes confidently.
