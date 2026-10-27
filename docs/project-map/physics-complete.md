# Physics complete source map

## Goal, source and coverage
GPT-6.1 Sol complete_physics fully read all 20 physics files (8,454 lines) at c4dc493d9 in bounded chunks. All module consumers queried through attached LSP; PhysicsConsts results explicitly used text fallback. No runtime edits/browser.

| File | Coverage |
|---|---|
| js/physics/aero-zones.js | Full body and comments |
| js/physics/ai-band.js | Full body and comments |
| js/physics/ai-corridor.js | Full body and comments |
| js/physics/ai-drive.js | Full body and comments |
| js/physics/body-attitude.js | Full body and comments |
| js/physics/brake-cue.js | Full body and comments |
| js/physics/collide.js | Full body and comments |
| js/physics/consts.js | Full body and comments |
| js/physics/contact-geometry.js | Full body and comments |
| js/physics/debris-draw.js | Full body and comments |
| js/physics/debris-world.js | Full body and comments |
| js/physics/drive-tune.js | Full body and comments |
| js/physics/grip-steer.js | Full body and comments |
| js/physics/incident-sim.js | Full body and comments |
| js/physics/player-forces.js | Full body and comments |
| js/physics/tyre-model.js | Full body and comments |
| js/physics/vehicle.js | Full body and comments |
| js/physics/wall-clamp.js | Full body and comments |
| js/physics/wall-end-face.js | Full body and comments |
| js/physics/wheel-state.js | Full body and comments |

## Architecture and contracts
PhysicsConsts supplies shared constants. DriveTune produces a mutable tuning bag. PlayerForces.create(G).step receives an explicit tick context, integrates per-axle combined-slip forces, assists, yaw/lateral motion and longitudinal coupling; game owns world-to-road projection. Vehicle holds reusable scratch; TyreModel owns compound/load/wear/temperature/fuel policy, with no track curvature input for player force. GripSteer uses only own-state front-peak steering cap. WheelState is an optional torque/slip axle model, default off.

AiDrive supplies traits, passing/following/defense/rescue and tyre/pit strategy rules to game, pits and collision modules; many return values are shared scratch. AiBand supplies scripted/catchup pace, limited to half-lap gaps. AiCorridor chooses reachable traffic lanes without car writes. AeroZones resolves authored turn pairs before fallback runs.

ContactGeometry provides rectangle SAT/sweep/impulse and shared wall limits. Collide performs broadphase, sweep, alternating relaxation/separation and owner-aware writeback. WallClamp constrains boundaries; WallEndFace handles forward steps. BodyAttitude is visual spring motion. DebrisWorld manages an optional bounded Rapier world, hazards, settled-marble grip and incident promotion; DebrisDraw batches mesh poses. IncidentSim owns bounded temporary motion takeover and safe handback.

## Verified comment discrepancies
- ai-drive.js:459 says aggression changes probability by ±35%; expression at 461 uses ±22%.
- ai-drive.js:909 says yield lift 6%; TRAIL_YIELD_EASE=.90 represents 10% before further yield.
- tyre-model.js:77 says front utilization uses nominal peak; player-forces.js:351 uses front-specific peak.
- tyre-model.js:65 describes former front curve values; current front branch at 104 rescales peak and uses Gaussian falloff.
- aero-zones.js:44 says counts only and no turn-pair encoding; authored AERO_ZONE_TURNS at 106 is resolved first at 184.
- debris-world.js:64/488 says cosmetic marbles never affect grip; marbleGrip at 1160 is applied by PlayerForces.
- player-forces.js:151 claims marble grip does not affect longitudinal path; optional WheelState capG includes marbleMu at 247.
- collide.js:568 calls shapes capsules; implementation uses boxes/SAT. Absolute no-overlap wording exceeds finite solver guarantee.
- debris-world.js:1224 references xMesh wrappers; per-body fallback now lives in DebrisDraw poolMesh.

## Limits and next goal
Full source reading is complete for physics. All consumer bodies and real-device behavior are not certified. Parent owns documentation checks and commits. Continue game integration and remaining directories.
