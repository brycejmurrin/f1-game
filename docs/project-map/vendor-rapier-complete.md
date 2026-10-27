# Rapier 0.19.3: complete wrapper map and embedded binary ledger

Snapshot: 2026-10-27. This supplement replaces the Rapier prefix-only status in [vendor-map.md](vendor-map.md). All non-binary JavaScript in `vendor/rapier-0.19.3/rapier.mjs` was read in bounded, nontruncated source ranges. The embedded base64 is encoded binary, not semantic JavaScript source: it was located with Acorn, decoded with Python's strict base64 decoder, hashed and parsed as WASM metadata without loading, compiling, instantiating or executing the library. No network, browser, tests or commit occurred. No vendor or application source changed.

## Exact read and byte ledger

All offsets are zero-based, end-exclusive bytes in the pinned file. The file is entirely ASCII, so UTF-8 byte offsets equal Acorn character offsets. Acorn parsed the whole file as an ESM program; its only string literal longer than 10,000 characters is the WASM token `[141674,2234460)`. Its opening quote is byte 141674 and closing quote is byte 2234459. No escaped characters occur in its base64 content.

| Component | Interval / construction | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Whole module | `[0,2238719)` | 2238719 | `bce2c762b440101ebf8cbff038a71fe1884488becd0a53b9a7c0a7e3daf13a2b` |
| Embedded base64 content | `[141675,2234459)` | 2092784 | `118b532b89f8f2ee3f8f677d59ff69353bf6de1f8b2ee1c35e67f68bccd25210` |
| Read JS wrapper, including both quotes | `[0,141675)` concatenated with `[2234459,2238719)` | 145935 | `ac7f5858360850c5df8b96c7e2650b3bc9fb578dd7db3940180d84d2b052b98b` |
| Decoded WASM | strict base64 decode of content above | 1569588 | `1ce1c8c4036b4dcd3bde86c6efdb0f270cf5e274979b1de6ab8052947ef166c5` |

Reconciliation: 145,935 + 2,092,784 = 2,238,719 source-container bytes. Excluding the entire quoted token instead gives 145,933 bytes of surrounding JS; the two delimiters explain the difference. Decoded WASM bytes are a second representation and must not be added to source-container totals.

Source read batches: `[0,12000)`, `[12000,24000)`, `[24000,36000)`, `[36000,48000)`, `[48000,60000)`, `[60000,72000)`, `[72000,84000)`, `[84000,96000)`, `[96000,108000)`, `[108000,120000)`, `[120000,132000)`, `[132000,141675)`, and `[2234459,2238719)`. Each appeared in a separate tool call without truncation. **Remaining JS source: none.** The binary code/data sections were counted and bounded, not disassembled or semantically audited; binary metadata inspection is not a proof of solver correctness.

## Boot, ABI and ownership

The module has no static imports and no top-level WASM instantiation. Evaluation creates the object-reference heap, typed-array view caches, raw wrapper classes and finalizers, descriptor/enumeration classes, a base64 codec and a frozen default API object. Public `init` (`dg`) decodes the embedded string with `Lg.toByteArray` and passes its `ArrayBuffer` to internal asynchronous `xA`. `xA` caches module-global WASM exports `A`; a later call returns them. There is no separate in-flight promise in `xA`, so concurrent callers before the first completion are not coalesced there. The game coalesces its own load with `_loadPromise`.

`xA` constructs the `wbg` import object. Its generic input path accepts `{module_or_path}`, deprecated direct parameters, URL/Request/string and Response values. URL-like inputs cause `fetch`; Response inputs try instantiateStreaming and fall back to byte instantiation for a MIME mismatch. The shipped public `init` always supplies embedded bytes, so this branch is not a required second WASM download. The generic default URL contains the literal base `"<deleted>"`; it is not the public compat initialization path. These are source facts; none of these APIs ran in this audit.

Raw objects store unsigned `__wbg_ptr` pointers. `__wrap` creates prototype-backed wrappers and registers them with `FinalizationRegistry`; `__destroy_into_raw` zeros the pointer and unregisters; explicit `free` calls the corresponding WASM deallocator with flag 0 and finalization calls it with flag 1. Without FinalizationRegistry, registration is a no-op. Explicit lifetime management therefore matters. A raw object is invalid after free; wrapper methods generally do not guard double free or use-after-free.

The heap `I` starts with 128 undefined entries plus undefined/null/true/false sentinels. `B` allocates references from a free list; `G` extracts and drops non-sentinel handles. Temporary callback references use the decreasing stack `K`, fail at `K == 1` with `out of js stack`, and are cleared in finally blocks. `Q` catches JavaScript exceptions and passes their heap reference through `__wbindgen_export_0`. `k` enforces raw-class instance identity. Optional values use explicit presence flags, zero pointers, or sentinel values such as 4294967297; those sentinels are ABI details, not normal handles.

UTF-8 text is decoded with fatal TextDecoder. Cached Uint8Array/Int32Array/Uint32Array/Float32Array/DataView views are recreated after memory replacement/growth. Array arguments are copied into WASM allocations with `__wbindgen_export_2`; several returned arrays are copied with `.slice()` before `__wbindgen_export_1` frees their backing allocation. Debug render buffers instead come through the JS reference heap. Numeric vectors/quaternions are plain public JS objects; `VectorOps.intoRaw` and `RotationOps.intoRaw` allocate raw temporaries and `fromRaw` copies fields and frees them.

`World` owns integration parameters, islands, broad/narrow phases, rigid-body/collider/joint sets, CCD, physics/serialization/debug pipelines and controller sets. It links deserialized references between bodies, colliders and impulse joints. `World.free()` frees these components and controllers, then clears its fields; it is not an idempotent destructor. Body/collider/joint public objects are handle views owned by their sets, rather than individually freed raw allocations. Set removal updates JS maps and related collider/joint maps. `KI` indexes handles via the low Uint32 word of a Float64 representation; treat handles as opaque engine values, not consecutive application IDs.

`World.step(events,hooks)` chooses the events pipeline when events are provided, otherwise the ordinary solver. Broad-phase queries translate public vectors/shapes into raw objects, map returned handles to colliders and free temporaries. Narrow-phase `contactPair` reuses `TempContactManifold` during callbacks and frees each raw manifold afterward. EventQueue similarly reuses `TempContactForceEvent` during `drainContactForceEvents`; callers must copy values inside the callback rather than retain the temporary wrapper. `takeSnapshot` and restore use the serialization pipeline; debug rendering returns vertices/colors. Controllers for characters, PID correction and raycast vehicles belong to World sets and are freed through corresponding removal methods or World teardown.

## Public contracts and scope

The ESM export list has **95 names**, comprising the default frozen namespace and **94 named APIs**. Default exposes the corresponding named APIs, including enum getters. The complete alias and class-member inventories below retain exact generated names and offsets so this map is navigable without pretending the minified file has useful line numbers.

Main API families: World and pipeline/set owners; RigidBody/Collider descriptors and handle views; impulse/multibody joint classes and JointData; vector/quaternion/symmetric-matrix helpers; shapes including rounded forms, meshes, heightfields and voxels; ray/point/shape-cast/contact results; events, hooks, solver/query/collision flags; character, PID and raycast-vehicle controllers; debug buffers; `init`, `version`, `reserveMemory`. `version` reads/frees a WASM-returned UTF-8 string, so its value was not queried by execution. Package metadata pins `@dimforge/rapier3d-compat` 0.19.3 / Apache-2.0; package CJS/types and the source-map URL are not proof those files ship in this ESM subset.

Descriptors are fluent mutable JS data until passed to a World/set. `RigidBodyDesc` defaults to enabled, unit gravity, identity rotation, zero velocity/damping, sleep enabled, CCD disabled. `ColliderDesc` defaults to density 1, friction .5, restitution 0, collision and solver groups 0xffffffff, default active collision types and no events/hooks. Mass/density/mass-properties modes are distinct. `ColliderDesc.cuboid` takes half-extents; mesh descriptors take numeric typed vertex/index data. Creation converts/copies these into WASM and releases temporary vectors/shapes. Float32 vectors/data in the ABI impose precision limits independently of JS number precision.

Static wrapper quirks relevant to future maintenance, not runtime reproductions:

- `PidController.setKi` and `setKd` both call raw `set_kp`, although distinct `set_ki`/`set_kd` bindings exist. DebrisWorld does not construct a PID controller.
- The vehicle forward-axis setter is named `setIndexForwardAxis`, while its getter is `indexForwardAxis`. Several high-level wheel suspension/max-force methods call raw members absent from the raw class shown in the member inventory. DebrisWorld does not use the raycast vehicle controller.
- Some temporary raw allocations are not explicitly freed on normal paths (for example KinematicCharacterController.setUp and Collider.setHalfExtents); ordinary paths often free after a call rather than in a finally block. Finalizers are fallback reclamation, not deterministic cleanup. No leak measurement was performed.
- Several WASM export names share function indices, so seemingly unrelated calls in minified wrappers (for example rawvector x using the integration-parameter dt accessor) can be valid deduplicated ABI functions. A name mismatch alone is not evidence of a wrong offset or physics defect.

## Proven application consumer

`js/physics/debris-world.js:9` resolves the vendored URL relative to its script. `_load` at :171 dynamically imports it and awaits `m.default.init()`, then saves `m.default`. States are 0 idle / 1 loading / 2 ready / -1 failed. Explicit retry adds a fresh `?retry=` URL; failures log and resolve false. `ready` at :196 races this load against a 4,000 ms cap; a later successful load can activate and build lazily. `create` at :213 reads raw debris setting `"1"` to opt in; the shipped default is off. Idle loading uses requestIdleCallback timeout 5,000 ms or a 2,500 ms timer fallback.

`buildWorld` at :435 creates a gravity `(0,-9.81,0)` World, fixed timestep from PhysicsConsts (fallback 1/60), and `EventQueue(true)`. Road geometry becomes a fixed trimesh with Float32 vertices, Uint32 indices, `TriMeshFlags.FIX_INTERNAL_EDGES` and friction 1. Cars are kinematic-position cuboid mirrors with force events and a 40 N threshold. Dynamic cuboid shard/marble pools start disabled; desktop/mobile shard defaults are 48/16, marble defaults 16/6, shard override capped at 256. Furniture cones use dynamic cuboid colliders. Promoted barrier panels pair dynamic bodies with fixed anchors through `JointData.fixed` / `createImpulseJoint`; excessive force removes the joint and cleanup removes bodies.

The runtime uses descriptor mass/friction/restitution/pose chains; body enabled/pose/velocity/sleep/type APIs; collider force-event flags and handles; World create/remove/step/free; and EventQueue draining/free. It does not require the public character/PID/vehicle controllers, generic queries, snapshot or debug render APIs shown in the wider vendor surface. `step` at :891 may skip idle/asleep worlds, updates kinematic targets, skips dynamically owned incident mirrors, solves via `world.step(_events)`, ages pools and drains forces. A trapped solve disables the side-world and destroys it. `reset` at :558 rearms active only when enabled and WASM already ready. `destroyWorld` at :388 frees the separately owned EventQueue before World, catches teardown errors and clears application maps/pools.

Incident takeover at :299/:325/:336 promotes a mirror to Dynamic, seeds current pose/velocity, then reads pose/velocities only while owned. IncidentSim performs guarded car writeback; the opening comment that this side-world “NEVER moves a car” needs that qualification. `worldGen` invalidates stale takeover ownership after rebuild. Group B hazard/grip/flag consumers also mean “render-only” is not the full current integration contract.

Attached apex-lsp resolved `DebrisWorld` to :2, reported its 24 exported and 148 internal members, and found 63 references in 10 files: game (17), apex (16), incident-sim (10), player-forces (6), collide (4), wall-clamp (3), debris-opts (3), race-control (2), debris-world (1), driving-coach (1). This is semantic source-navigation evidence; no runtime behavior was observed. The local code-nav skill supplied the LSP navigation procedure.

## Static WASM metadata

Header is `00 61 73 6d 01 00 00 00` (WASM version 1). Metadata contains 164 function types, 32 imported functions, 1,978 defined functions and 1,978 code bodies, one table, one unshared memory (flags 0, initial 18 pages = 1,179,648 bytes, no declared maximum), one global, one element segment and 25 data segments. There is no start section and no WASI import. The one custom `producers` section records `processed-by`: walrus 0.23.3 and wasm-bindgen 0.2.100. These are embedded labels, not independently verified build provenance.

There are **538 exports**: memory plus 537 function names referring to 495 unique function indices. Shared indices explain 42 additional function-name aliases. Raw physics APIs dominate, alongside version, reserve_memory, allocation/free/exception and stack-pointer helpers. All **32 imports** are functions from `wbg`, implemented by the JS glue: reference management, value conversion, callback call/bind, global discovery, performance clock, typed arrays, memory exposure and throwing. `__wbg_newnoargs_*` constructs a Function from decoded text when invoked; this audit did not invoke it. No import establishes a network/file dependency inside WASM.

Section table uses decoded-WASM byte offsets, separate from module offsets. Payload size excludes section ID and LEB128 length header.

| Section | ID | Whole interval | Payload bytes | Entries |
| --- | ---: | --- | ---: | ---: |
| Type | 1 | `[8,1652)` | 1641 | 164 |
| Import | 2 | `[1652,2850)` | 1195 | 32 |
| Function | 3 | `[2850,4868)` | 2015 | 1978 |
| Table | 4 | `[4868,4877)` | 7 | 1 |
| Memory | 5 | `[4877,4882)` | 3 | 1 |
| Global | 6 | `[4882,4893)` | 9 | 1 |
| Export | 7 | `[4893,25133)` | 20236 | 538 |
| Element | 9 | `[25133,27404)` | 2268 | 1 |
| Data count | 12 | `[27404,27407)` | 1 | 25 |
| Code | 10 | `[27407,1495351)` | 1467940 | 1978 |
| Data | 11 | `[1495351,1569526)` | 74171 | 25 |
| Custom producers | 0 | `[1569526,1569588)` | 60 | — |

### Exact WASM imports

All rows have module `wbg` and function kind 0. Type is the binary type-section index.

| Import | Type |
| --- | ---: |
| `__wbindgen_number_new` | 59 |
| `__wbindgen_boolean_get` | 4 |
| `__wbindgen_object_drop_ref` | 6 |
| `__wbindgen_number_get` | 0 |
| `__wbindgen_is_function` | 4 |
| `__wbg_rawraycolliderintersection_new` | 4 |
| `__wbg_rawcontactforceevent_new` | 4 |
| `__wbg_performance_7a3ffd0b17f663ad` | 4 |
| `__wbindgen_is_undefined` | 4 |
| `__wbg_now_2c95c9de01293173` | 16 |
| `__wbindgen_object_clone_ref` | 4 |
| `__wbg_newnoargs_105ed471475aaf50` | 3 |
| `__wbg_call_672a4d21634d4a24` | 3 |
| `__wbg_call_7cccdd69e0791ae2` | 5 |
| `__wbg_call_833bed5770ea2041` | 17 |
| `__wbg_call_b8adc8b1d0a0d8eb` | 32 |
| `__wbg_bind_c8359b1cba058168` | 17 |
| `__wbg_buffer_609cc3eee51ed158` | 4 |
| `__wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0` | 21 |
| `__wbg_static_accessor_SELF_37c5d418e4bf5819` | 21 |
| `__wbg_static_accessor_WINDOW_5de37043a91a9c40` | 21 |
| `__wbg_static_accessor_GLOBAL_88a902d13a557d07` | 21 |
| `__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a` | 5 |
| `__wbg_new_a12002a7f91c75be` | 4 |
| `__wbg_set_65595bdd868b3009` | 1 |
| `__wbg_length_a446193dc22c12f8` | 4 |
| `__wbg_newwithbyteoffsetandlength_e6b7e69acd4c7354` | 5 |
| `__wbg_set_10bad9bee0e9c58b` | 1 |
| `__wbg_length_3b4f022188ae8db6` | 4 |
| `__wbg_newwithlength_5a5efe313cfd59f1` | 4 |
| `__wbindgen_throw` | 0 |
| `__wbindgen_memory` | 21 |

### Complete ESM export aliases

| Public export | Local binding |
| --- | --- |
| `ActiveCollisionTypes` | `wI` |
| `ActiveEvents` | `EI` |
| `ActiveHooks` | `iI` |
| `Ball` | `uI` |
| `BroadPhase` | `mI` |
| `CCDSolver` | `TI` |
| `Capsule` | `Ag` |
| `CharacterCollision` | `yg` |
| `CoefficientCombineRule` | `AI` |
| `Collider` | `Yg` |
| `ColliderDesc` | `cg` |
| `ColliderSet` | `qg` |
| `ColliderShapeCastHit` | `fI` |
| `Cone` | `Gg` |
| `ConvexPolyhedron` | `ig` |
| `Cuboid` | `vI` |
| `Cylinder` | `wg` |
| `DebugRenderBuffers` | `Ug` |
| `DebugRenderPipeline` | `Jg` |
| `DynamicRayCastVehicleController` | `Fg` |
| `EventQueue` | `Rg` |
| `FeatureType` | `II` |
| `FixedImpulseJoint` | `MI` |
| `FixedMultibodyJoint` | `HI` |
| `GenericImpulseJoint` | `RI` |
| `HalfSpace` | `_I` |
| `HeightFieldFlags` | `CI` |
| `Heightfield` | `og` |
| `ImpulseJoint` | `JI` |
| `ImpulseJointSet` | `qI` |
| `IntegrationParameters` | `UI` |
| `IslandManager` | `OI` |
| `JointAxesMask` | `$A` |
| `JointData` | `cI` |
| `JointType` | `_A` |
| `KinematicCharacterController` | `Mg` |
| `MassPropsMode` | `SI` |
| `MotorModel` | `vA` |
| `MultibodyJoint` | `lI` |
| `MultibodyJointSet` | `eI` |
| `NarrowPhase` | `XI` |
| `PhysicsPipeline` | `Kg` |
| `PidAxesMask` | `QI` |
| `PidController` | `Ng` |
| `PointColliderProjection` | `WI` |
| `PointProjection` | `bI` |
| `Polyline` | `Bg` |
| `PrismaticImpulseJoint` | `aI` |
| `PrismaticMultibodyJoint` | `tI` |
| `Quaternion` | `XA` |
| `QueryFilterFlags` | `oI` |
| `Ray` | `nI` |
| `RayColliderHit` | `jI` |
| `RayColliderIntersection` | `ZI` |
| `RayIntersection` | `dI` |
| `RevoluteImpulseJoint` | `sI` |
| `RevoluteMultibodyJoint` | `pI` |
| `RigidBody` | `GI` |
| `RigidBodyDesc` | `kI` |
| `RigidBodySet` | `hI` |
| `RigidBodyType` | `uA` |
| `RopeImpulseJoint` | `NI` |
| `RotationOps` | `PA` |
| `RoundCone` | `kg` |
| `RoundConvexPolyhedron` | `Dg` |
| `RoundCuboid` | `$I` |
| `RoundCylinder` | `Sg` |
| `RoundTriangle` | `Cg` |
| `SdpMatrix3` | `VA` |
| `SdpMatrix3Ops` | `zA` |
| `Segment` | `Ig` |
| `SerializationPipeline` | `hg` |
| `Shape` | `zI` |
| `ShapeCastHit` | `xI` |
| `ShapeContact` | `VI` |
| `ShapeType` | `gI` |
| `SolverFlags` | `DI` |
| `SphericalImpulseJoint` | `YI` |
| `SphericalMultibodyJoint` | `rI` |
| `SpringImpulseJoint` | `FI` |
| `TempContactForceEvent` | `sg` |
| `TempContactManifold` | `PI` |
| `TriMesh` | `Eg` |
| `TriMeshFlags` | `BI` |
| `Triangle` | `gg` |
| `UnitImpulseJoint` | `yI` |
| `UnitMultibodyJoint` | `LI` |
| `Vector3` | `fA` |
| `VectorOps` | `mA` |
| `Voxels` | `Qg` |
| `World` | `ag` |
| `default` | `bg` |
| `init` | `dg` |
| `reserveMemory` | `jg` |
| `version` | `Zg` |

### Complete JS class/member inventory

Generated mechanically from the parsed AST after the source reads. Raw classes are private; friendly names identify public exports. Ranges use original module bytes. `static`, `get` and `set` are retained; ordinary member names denote instance methods. This is an inventory, not runtime type checking.

| Class / public name | Byte interval | Extends | Members |
| --- | --- | --- | --- |
| `H` / private raw/helper | `[2895,6498)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `constructor`, `castRay`, `castRayAndGetNormal`, `intersectionsWithRay`, `intersectionWithShape`, `projectPoint`, `projectPointAndGetFeature`, `intersectionsWithPoint`, `castShape`, `intersectionsWithShape`, `collidersWithAabbIntersectingAabb` |
| `p` / private raw/helper | `[6649,6932)` | — | `__destroy_into_raw`, `free`, `constructor` |
| `e` / private raw/helper | `[7092,8141)` | — | `__destroy_into_raw`, `free`, `constructor`, `handle`, `translationDeltaApplied`, `translationDeltaRemaining`, `toi`, `worldWitness1`, `worldWitness2`, `worldNormal1`, `worldNormal2` |
| `O` / private raw/helper | `[8294,17807)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `coTranslation`, `coRotation`, `coTranslationWrtParent`, `coRotationWrtParent`, `coSetTranslation`, `coSetTranslationWrtParent`, `coSetRotation`, `coSetRotationWrtParent`, `coIsSensor`, `coShapeType`, `coHalfspaceNormal`, `coHalfExtents`, `coSetHalfExtents`, `coRadius`, `coSetRadius`, `coHalfHeight`, `coSetHalfHeight`, `coRoundRadius`, `coSetRoundRadius`, `coVoxelData`, `coVoxelSize`, `coSetVoxel`, `coPropagateVoxelChange`, `coCombineVoxelStates`, `coVertices`, `coIndices`, `coTriMeshFlags`, `coHeightFieldFlags`, `coHeightfieldHeights`, `coHeightfieldScale`, `coHeightfieldNRows`, `coHeightfieldNCols`, `coParent`, `coSetEnabled`, `coIsEnabled`, `coSetContactSkin`, `coContactSkin`, `coFriction`, `coRestitution`, `coDensity`, `coMass`, `coVolume`, `coCollisionGroups`, `coSolverGroups`, `coActiveHooks`, `coActiveCollisionTypes`, `coActiveEvents`, `coContactForceEventThreshold`, `coContainsPoint`, `coCastShape`, `coCastCollider`, `coIntersectsShape`, `coContactShape`, `coContactCollider`, `coProjectPoint`, `coIntersectsRay`, `coCastRay`, `coCastRayAndGetNormal`, `coSetSensor`, `coSetRestitution`, `coSetFriction`, `coFrictionCombineRule`, `coSetFrictionCombineRule`, `coRestitutionCombineRule`, `coSetRestitutionCombineRule`, `coSetCollisionGroups`, `coSetSolverGroups`, `coSetActiveHooks`, `coSetActiveEvents`, `coSetActiveCollisionTypes`, `coSetShape`, `coSetContactForceEventThreshold`, `coSetDensity`, `coSetMass`, `coSetMassProperties`, `constructor`, `len`, `contains`, `createCollider`, `remove`, `isHandleValid`, `forEachColliderHandle` |
| `d` / private raw/helper | `[17969,18798)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `colliderHandle`, `time_of_impact`, `witness1`, `witness2`, `normal1`, `normal2` |
| `j` / private raw/helper | `[18957,19761)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `collider1`, `collider2`, `total_force`, `total_force_magnitude`, `max_force_direction`, `max_force_magnitude` |
| `W` / private raw/helper | `[19918,22059)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `normal`, `local_n1`, `local_n2`, `subshape1`, `subshape2`, `num_contacts`, `contact_local_p1`, `contact_local_p2`, `contact_dist`, `contact_fid1`, `contact_fid2`, `contact_impulse`, `contact_tangent_impulse_x`, `contact_tangent_impulse_y`, `num_solver_contacts`, `solver_contact_point`, `solver_contact_dist`, `solver_contact_friction`, `solver_contact_restitution`, `solver_contact_tangent_velocity` |
| `f` / private raw/helper | `[22212,22814)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `collider1`, `collider2`, `numContactManifolds`, `contactManifold` |
| `X` / private raw/helper | `[22975,23619)` | — | `__destroy_into_raw`, `free`, `constructor`, `vertices`, `colors`, `render` |
| `V` / private raw/helper | `[23778,25102)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `takeGravity`, `takeIntegrationParameters`, `takeIslandManager`, `takeBroadPhase`, `takeNarrowPhase`, `takeBodies`, `takeColliders`, `takeImpulseJoints`, `takeMultibodyJoints` |
| `u` / private raw/helper | `[25275,32100)` | — | `__destroy_into_raw`, `free`, `constructor`, `current_vehicle_speed`, `chassis`, `index_up_axis`, `set_index_up_axis`, `index_forward_axis`, `set_index_forward_axis`, `add_wheel`, `num_wheels`, `update_vehicle`, `wheel_chassis_connection_point_cs`, `set_wheel_chassis_connection_point_cs`, `wheel_suspension_rest_length`, `set_wheel_suspension_rest_length`, `wheel_max_suspension_travel`, `set_wheel_max_suspension_travel`, `wheel_radius`, `set_wheel_radius`, `wheel_suspension_stiffness`, `set_wheel_suspension_stiffness`, `wheel_suspension_compression`, `set_wheel_suspension_compression`, `wheel_suspension_relaxation`, `set_wheel_suspension_relaxation`, `wheel_max_suspension_force`, `set_wheel_max_suspension_force`, `wheel_brake`, `set_wheel_brake`, `wheel_steering`, `set_wheel_steering`, `wheel_engine_force`, `set_wheel_engine_force`, `wheel_direction_cs`, `set_wheel_direction_cs`, `wheel_axle_cs`, `set_wheel_axle_cs`, `wheel_friction_slip`, `set_wheel_friction_slip`, `wheel_side_friction_stiffness`, `set_wheel_side_friction_stiffness`, `wheel_rotation`, `wheel_forward_impulse`, `wheel_side_impulse`, `wheel_suspension_force`, `wheel_contact_normal_ws`, `wheel_contact_point_ws`, `wheel_suspension_length`, `wheel_hard_point_ws`, `wheel_is_in_contact`, `wheel_ground_object` |
| `v` / private raw/helper | `[32252,32809)` | — | `__destroy_into_raw`, `free`, `constructor`, `drainCollisionEvents`, `drainContactForceEvents`, `clear` |
| `AA` / private raw/helper | `[32963,34232)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `static generic`, `static spring`, `static rope`, `static spherical`, `static prismatic`, `static fixed`, `static revolute` |
| `gA` / private raw/helper | `[34390,37113)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `jointType`, `jointBodyHandle1`, `jointBodyHandle2`, `jointFrameX1`, `jointFrameX2`, `jointAnchor1`, `jointAnchor2`, `jointSetAnchor1`, `jointSetAnchor2`, `jointContactsEnabled`, `jointSetContactsEnabled`, `jointLimitsEnabled`, `jointLimitsMin`, `jointLimitsMax`, `jointSetLimits`, `jointConfigureMotorModel`, `jointConfigureMotorVelocity`, `jointConfigureMotorPosition`, `jointConfigureMotor`, `constructor`, `createJoint`, `remove`, `len`, `contains`, `forEachJointHandle`, `forEachJointAttachedToRigidBody` |
| `BA` / private raw/helper | `[37277,39388)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `constructor`, `get dt`, `get contact_erp`, `get normalizedAllowedLinearError`, `get normalizedPredictionDistance`, `get numSolverIterations`, `get numInternalPgsIterations`, `get minIslandSize`, `get maxCcdSubsteps`, `get lengthUnit`, `set dt`, `set contact_natural_frequency`, `set normalizedAllowedLinearError`, `set normalizedPredictionDistance`, `set numSolverIterations`, `set numInternalPgsIterations`, `set minIslandSize`, `set maxCcdSubsteps`, `set lengthUnit` |
| `EA` / private raw/helper | `[39544,40078)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `constructor`, `forEachActiveRigidBodyHandle` |
| `DA` / private raw/helper | `[40249,43518)` | — | `__destroy_into_raw`, `free`, `constructor`, `up`, `setUp`, `normalNudgeFactor`, `setNormalNudgeFactor`, `offset`, `setOffset`, `slideEnabled`, `setSlideEnabled`, `autostepMaxHeight`, `autostepMinWidth`, `autostepIncludesDynamicBodies`, `autostepEnabled`, `enableAutostep`, `disableAutostep`, `maxSlopeClimbAngle`, `setMaxSlopeClimbAngle`, `minSlopeSlideAngle`, `setMinSlopeSlideAngle`, `snapToGroundDistance`, `enableSnapToGround`, `disableSnapToGround`, `snapToGroundEnabled`, `computeColliderMovement`, `computedMovement`, `computedGrounded`, `numComputedCollisions`, `computedCollision` |
| `wA` / private raw/helper | `[43678,45509)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `jointType`, `jointFrameX1`, `jointFrameX2`, `jointAnchor1`, `jointAnchor2`, `jointContactsEnabled`, `jointSetContactsEnabled`, `jointLimitsEnabled`, `jointLimitsMin`, `jointLimitsMax`, `constructor`, `createJoint`, `remove`, `contains`, `forEachJointHandle`, `forEachJointAttachedToRigidBody` |
| `GA` / private raw/helper | `[45663,46438)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `constructor`, `contact_pairs_with`, `contact_pair`, `intersection_pairs_with`, `intersection_pair` |
| `KA` / private raw/helper | `[46596,49082)` | — | `__destroy_into_raw`, `free`, `constructor`, `set_profiler_enabled`, `is_profiler_enabled`, `timing_step`, `timing_collision_detection`, `timing_broad_phase`, `timing_narrow_phase`, `timing_solver`, `timing_velocity_assembly`, `timing_velocity_resolution`, `timing_velocity_update`, `timing_velocity_writeback`, `timing_ccd`, `timing_ccd_toi_computation`, `timing_ccd_broad_phase`, `timing_ccd_narrow_phase`, `timing_ccd_solver`, `timing_island_construction`, `timing_user_changes`, `step`, `stepWithEvents` |
| `UA` / private raw/helper | `[49238,50525)` | — | `__destroy_into_raw`, `free`, `constructor`, `set_kp`, `set_ki`, `set_kd`, `set_axes_mask`, `reset_integrals`, `apply_linear_correction`, `apply_angular_correction`, `linear_correction`, `angular_correction` |
| `yA` / private raw/helper | `[50691,51420)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `colliderHandle`, `point`, `isInside`, `featureType`, `featureId` |
| `NA` / private raw/helper | `[51578,52015)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `point`, `isInside` |
| `aA` / private raw/helper | `[52172,52611)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `colliderHandle`, `timeOfImpact` |
| `RA` / private raw/helper | `[52777,53512)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `colliderHandle`, `normal`, `time_of_impact`, `featureType`, `featureId` |
| `cA` / private raw/helper | `[53670,54313)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `normal`, `time_of_impact`, `featureType`, `featureId` |
| `lA` / private raw/helper | `[54468,61907)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `rbTranslation`, `rbRotation`, `rbSleep`, `rbIsSleeping`, `rbIsMoving`, `rbNextTranslation`, `rbNextRotation`, `rbSetTranslation`, `rbSetRotation`, `rbSetLinvel`, `rbSetAngvel`, `rbSetNextKinematicTranslation`, `rbSetNextKinematicRotation`, `rbRecomputeMassPropertiesFromColliders`, `rbSetAdditionalMass`, `rbSetAdditionalMassProperties`, `rbLinvel`, `rbAngvel`, `rbVelocityAtPoint`, `rbLockTranslations`, `rbSetEnabledTranslations`, `rbLockRotations`, `rbSetEnabledRotations`, `rbDominanceGroup`, `rbSetDominanceGroup`, `rbEnableCcd`, `rbSetSoftCcdPrediction`, `rbMass`, `rbInvMass`, `rbEffectiveInvMass`, `rbLocalCom`, `rbWorldCom`, `rbInvPrincipalInertia`, `rbPrincipalInertiaLocalFrame`, `rbPrincipalInertia`, `rbEffectiveWorldInvInertia`, `rbEffectiveAngularInertia`, `rbWakeUp`, `rbIsCcdEnabled`, `rbSoftCcdPrediction`, `rbNumColliders`, `rbCollider`, `rbBodyType`, `rbSetBodyType`, `rbIsFixed`, `rbIsKinematic`, `rbIsDynamic`, `rbLinearDamping`, `rbAngularDamping`, `rbSetLinearDamping`, `rbSetAngularDamping`, `rbSetEnabled`, `rbIsEnabled`, `rbGravityScale`, `rbSetGravityScale`, `rbResetForces`, `rbResetTorques`, `rbAddForce`, `rbApplyImpulse`, `rbAddTorque`, `rbApplyTorqueImpulse`, `rbAddForceAtPoint`, `rbApplyImpulseAtPoint`, `rbAdditionalSolverIterations`, `rbSetAdditionalSolverIterations`, `rbUserData`, `rbSetUserData`, `rbUserForce`, `rbUserTorque`, `constructor`, `createRigidBody`, `remove`, `len`, `contains`, `forEachRigidBodyHandle`, `propagateModifiedBodyPositionsToColliders` |
| `HA` / private raw/helper | `[62058,62791)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `constructor`, `static identity`, `get x`, `get y`, `get z`, `get w` |
| `pA` / private raw/helper | `[62944,63291)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `elements` |
| `eA` / private raw/helper | `[63455,64150)` | — | `__destroy_into_raw`, `free`, `constructor`, `serializeAll`, `deserializeAll` |
| `OA` / private raw/helper | `[64298,68413)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `static cuboid`, `static roundCuboid`, `static ball`, `static halfspace`, `static capsule`, `static cylinder`, `static roundCylinder`, `static cone`, `static roundCone`, `static voxels`, `static voxelsFromPoints`, `static polyline`, `static trimesh`, `static heightfield`, `static segment`, `static triangle`, `static roundTriangle`, `static convexHull`, `static roundConvexHull`, `static convexMesh`, `static roundConvexMesh`, `castShape`, `intersectsShape`, `contactShape`, `containsPoint`, `projectPoint`, `intersectsRay`, `castRay`, `castRayAndGetNormal` |
| `dA` / private raw/helper | `[68568,69257)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `time_of_impact`, `witness1`, `witness2`, `normal1`, `normal2` |
| `jA` / private raw/helper | `[69412,70145)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `distance`, `point1`, `point2`, `normal1`, `normal2` |
| `WA` / private raw/helper | `[70294,71509)` | — | `static __wrap`, `__destroy_into_raw`, `free`, `static zero`, `constructor`, `get x`, `set x`, `get y`, `set y`, `get z`, `set z`, `xyz`, `yxz`, `zxy`, `xzy`, `yzx`, `zyx` |
| `fA` / Vector3 | `[75659,75715)` | — | `constructor` |
| `mA` / VectorOps | `[75715,75966)` | — | `static new`, `static intoRaw`, `static zeros`, `static fromRaw`, `static copy` |
| `XA` / Quaternion | `[75966,76033)` | — | `constructor` |
| `PA` / RotationOps | `[76033,76266)` | — | `static identity`, `static fromRaw`, `static intoRaw`, `static copy` |
| `VA` / SdpMatrix3 | `[76266,76589)` | — | `constructor`, `get m11`, `get m12`, `get m21`, `get m13`, `get m31`, `get m22`, `get m23`, `get m32`, `get m33` |
| `zA` / SdpMatrix3Ops | `[76589,76664)` | — | `static fromRaw` |
| `GI` / RigidBody | `[76899,82369)` | — | `constructor`, `finalizeDeserialization`, `isValid`, `lockTranslations`, `lockRotations`, `setEnabledTranslations`, `restrictTranslations`, `setEnabledRotations`, `restrictRotations`, `dominanceGroup`, `setDominanceGroup`, `additionalSolverIterations`, `setAdditionalSolverIterations`, `enableCcd`, `setSoftCcdPrediction`, `softCcdPrediction`, `translation`, `rotation`, `nextTranslation`, `nextRotation`, `setTranslation`, `setLinvel`, `gravityScale`, `setGravityScale`, `setRotation`, `setAngvel`, `setNextKinematicTranslation`, `setNextKinematicRotation`, `linvel`, `velocityAtPoint`, `angvel`, `mass`, `effectiveInvMass`, `invMass`, `localCom`, `worldCom`, `invPrincipalInertia`, `principalInertia`, `principalInertiaLocalFrame`, `effectiveWorldInvInertia`, `effectiveAngularInertia`, `sleep`, `wakeUp`, `isCcdEnabled`, `numColliders`, `collider`, `setEnabled`, `isEnabled`, `bodyType`, `setBodyType`, `isSleeping`, `isMoving`, `isFixed`, `isKinematic`, `isDynamic`, `linearDamping`, `angularDamping`, `setLinearDamping`, `recomputeMassPropertiesFromColliders`, `setAdditionalMass`, `setAdditionalMassProperties`, `setAngularDamping`, `resetForces`, `resetTorques`, `addForce`, `applyImpulse`, `addTorque`, `applyTorqueImpulse`, `addForceAtPoint`, `applyImpulseAtPoint`, `userForce`, `userTorque` |
| `kI` / RigidBodyDesc | `[82369,85264)` | — | `constructor`, `static dynamic`, `static kinematicPositionBased`, `static kinematicVelocityBased`, `static fixed`, `static newDynamic`, `static newKinematicPositionBased`, `static newKinematicVelocityBased`, `static newStatic`, `setDominanceGroup`, `setAdditionalSolverIterations`, `setEnabled`, `setTranslation`, `setRotation`, `setGravityScale`, `setAdditionalMass`, `setLinvel`, `setAngvel`, `setAdditionalMassProperties`, `enabledTranslations`, `restrictTranslations`, `lockTranslations`, `enabledRotations`, `restrictRotations`, `lockRotations`, `setLinearDamping`, `setAngularDamping`, `setCanSleep`, `setSleeping`, `setCcdEnabled`, `setSoftCcdPrediction`, `setUserData` |
| `KI` / private raw/helper | `[85264,85893)` | — | `constructor`, `set`, `len`, `delete`, `clear`, `get`, `forEach`, `getAll`, `index` |
| `hI` / RigidBodySet | `[85893,87445)` | — | `constructor`, `free`, `finalizeDeserialization`, `createRigidBody`, `remove`, `len`, `contains`, `get`, `forEach`, `forEachActiveRigidBody`, `getAll` |
| `UI` / IntegrationParameters | `[87445,88558)` | — | `constructor`, `free`, `get dt`, `get contact_erp`, `get lengthUnit`, `get normalizedAllowedLinearError`, `get normalizedPredictionDistance`, `get numSolverIterations`, `get numInternalPgsIterations`, `get minIslandSize`, `get maxCcdSubsteps`, `set dt`, `set contact_natural_frequency`, `set lengthUnit`, `set normalizedAllowedLinearError`, `set normalizedPredictionDistance`, `set numSolverIterations`, `set numInternalPgsIterations`, `set minIslandSize`, `set maxCcdSubsteps` |
| `JI` / ImpulseJoint | `[89002,90281)` | — | `constructor`, `static newTyped`, `finalizeDeserialization`, `isValid`, `body1`, `body2`, `type`, `frameX1`, `frameX2`, `anchor1`, `anchor2`, `setAnchor1`, `setAnchor2`, `setContactsEnabled`, `contactsEnabled` |
| `yI` / UnitImpulseJoint | `[90281,90992)` | JI | `limitsEnabled`, `limitsMin`, `limitsMax`, `setLimits`, `configureMotorModel`, `configureMotorVelocity`, `configureMotorPosition`, `configureMotor` |
| `MI` / FixedImpulseJoint | `[90992,91013)` | JI |  |
| `NI` / RopeImpulseJoint | `[91013,91034)` | JI |  |
| `FI` / SpringImpulseJoint | `[91034,91055)` | JI |  |
| `aI` / PrismaticImpulseJoint | `[91055,91100)` | yI | `rawAxis` |
| `sI` / RevoluteImpulseJoint | `[91100,91145)` | yI | `rawAxis` |
| `RI` / GenericImpulseJoint | `[91145,91166)` | JI |  |
| `YI` / SphericalImpulseJoint | `[91166,91187)` | JI |  |
| `cI` / JointData | `[91187,92685)` | — | `constructor`, `static fixed`, `static spring`, `static rope`, `static generic`, `static spherical`, `static prismatic`, `static revolute`, `intoRaw` |
| `qI` / ImpulseJointSet | `[92685,93453)` | — | `constructor`, `free`, `finalizeDeserialization`, `createJoint`, `remove`, `forEachJointHandleAttachedToRigidBody`, `unmap`, `len`, `contains`, `get`, `forEach`, `getAll` |
| `lI` / MultibodyJoint | `[93453,93914)` | — | `constructor`, `static newTyped`, `isValid`, `setContactsEnabled`, `contactsEnabled` |
| `LI` / UnitMultibodyJoint | `[93914,93935)` | lI |  |
| `HI` / FixedMultibodyJoint | `[93935,93956)` | lI |  |
| `tI` / PrismaticMultibodyJoint | `[93956,94001)` | LI | `rawAxis` |
| `pI` / RevoluteMultibodyJoint | `[94001,94046)` | LI | `rawAxis` |
| `rI` / SphericalMultibodyJoint | `[94046,94067)` | lI |  |
| `eI` / MultibodyJointSet | `[94067,94759)` | — | `constructor`, `free`, `createJoint`, `remove`, `unmap`, `len`, `contains`, `get`, `forEach`, `forEachJointHandleAttachedToRigidBody`, `getAll` |
| `TI` / CCDSolver | `[94872,94964)` | — | `constructor`, `free` |
| `OI` / IslandManager | `[94964,95130)` | — | `constructor`, `free`, `forEachActiveRigidBodyHandle` |
| `nI` / Ray | `[95243,95401)` | — | `constructor`, `pointAt` |
| `dI` / RayIntersection | `[95401,95722)` | — | `constructor`, `static fromRaw` |
| `ZI` / RayColliderIntersection | `[95722,96089)` | — | `constructor`, `static fromRaw` |
| `jI` / RayColliderHit | `[96089,96267)` | — | `constructor`, `static fromRaw` |
| `bI` / PointProjection | `[96267,96428)` | — | `constructor`, `static fromRaw` |
| `WI` / PointColliderProjection | `[96428,96783)` | — | `constructor`, `static fromRaw` |
| `xI` / ShapeCastHit | `[96783,97089)` | — | `constructor`, `static fromRaw` |
| `fI` / ColliderShapeCastHit | `[97089,97383)` | xI | `constructor`, `static fromRaw` |
| `mI` / BroadPhase | `[97383,99289)` | — | `constructor`, `free`, `castRay`, `castRayAndGetNormal`, `intersectionsWithRay`, `intersectionWithShape`, `projectPoint`, `projectPointAndGetFeature`, `intersectionsWithPoint`, `castShape`, `intersectionsWithShape`, `collidersWithAabbIntersectingAabb` |
| `XI` / NarrowPhase | `[99289,99847)` | — | `constructor`, `free`, `contactPairsWith`, `intersectionPairsWith`, `contactPair`, `intersectionPair` |
| `PI` / TempContactManifold | `[99847,101116)` | — | `constructor`, `free`, `normal`, `localNormal1`, `localNormal2`, `subshape1`, `subshape2`, `numContacts`, `localContactPoint1`, `localContactPoint2`, `contactDist`, `contactFid1`, `contactFid2`, `contactImpulse`, `contactTangentImpulseX`, `contactTangentImpulseY`, `numSolverContacts`, `solverContactPoint`, `solverContactDist`, `solverContactFriction`, `solverContactRestitution`, `solverContactTangentVelocity` |
| `VI` / ShapeContact | `[101116,101400)` | — | `constructor`, `static fromRaw` |
| `zI` / Shape | `[101400,104875)` | — | `static fromRaw`, `castShape`, `intersectsShape`, `contactShape`, `containsPoint`, `projectPoint`, `intersectsRay`, `castRay`, `castRayAndGetNormal` |
| `uI` / Ball | `[105879,105993)` | zI | `constructor`, `intoRaw` |
| `_I` / HalfSpace | `[105993,106150)` | zI | `constructor`, `intoRaw` |
| `vI` / Cuboid | `[106150,106334)` | zI | `constructor`, `intoRaw` |
| `$I` / RoundCuboid | `[106334,106568)` | zI | `constructor`, `intoRaw` |
| `Ag` / Capsule | `[106568,106724)` | zI | `constructor`, `intoRaw` |
| `Ig` / Segment | `[106724,106910)` | zI | `constructor`, `intoRaw` |
| `gg` / Triangle | `[106910,107141)` | zI | `constructor`, `intoRaw` |
| `Cg` / RoundTriangle | `[107141,107422)` | zI | `constructor`, `intoRaw` |
| `Bg` / Polyline | `[107422,107605)` | zI | `constructor`, `intoRaw` |
| `Qg` / Voxels | `[107605,107853)` | zI | `constructor`, `intoRaw` |
| `Eg` / TriMesh | `[107853,108033)` | zI | `constructor`, `intoRaw` |
| `ig` / ConvexPolyhedron | `[108033,108241)` | zI | `constructor`, `intoRaw` |
| `Dg` / RoundConvexPolyhedron | `[108241,108522)` | zI | `constructor`, `intoRaw` |
| `og` / Heightfield | `[108522,108789)` | zI | `constructor`, `intoRaw` |
| `wg` / Cylinder | `[108789,108947)` | zI | `constructor`, `intoRaw` |
| `Sg` / RoundCylinder | `[108947,109155)` | zI | `constructor`, `intoRaw` |
| `Gg` / Cone | `[109155,109305)` | zI | `constructor`, `intoRaw` |
| `kg` / RoundCone | `[109305,109505)` | zI | `constructor`, `intoRaw` |
| `Kg` / PhysicsPipeline | `[109505,109878)` | — | `constructor`, `free`, `step` |
| `hg` / SerializationPipeline | `[109878,110186)` | — | `constructor`, `free`, `serializeAll`, `deserializeAll` |
| `Ug` / DebugRenderBuffers | `[110186,110243)` | — | `constructor` |
| `Jg` / DebugRenderPipeline | `[110243,110527)` | — | `constructor`, `free`, `render` |
| `yg` / CharacterCollision | `[110527,110537)` | — |  |
| `Mg` / KinematicCharacterController | `[110537,113263)` | — | `constructor`, `free`, `up`, `setUp`, `applyImpulsesToDynamicBodies`, `setApplyImpulsesToDynamicBodies`, `characterMass`, `setCharacterMass`, `offset`, `setOffset`, `normalNudgeFactor`, `setNormalNudgeFactor`, `slideEnabled`, `setSlideEnabled`, `autostepMaxHeight`, `autostepMinWidth`, `autostepIncludesDynamicBodies`, `autostepEnabled`, `enableAutostep`, `disableAutostep`, `maxSlopeClimbAngle`, `setMaxSlopeClimbAngle`, `minSlopeSlideAngle`, `setMinSlopeSlideAngle`, `snapToGroundDistance`, `enableSnapToGround`, `disableSnapToGround`, `snapToGroundEnabled`, `computeColliderMovement`, `computedMovement`, `computedGrounded`, `numComputedCollisions`, `computedCollision` |
| `Ng` / PidController | `[113490,114476)` | — | `constructor`, `free`, `setKp`, `setKi`, `setKd`, `setAxes`, `resetIntegrals`, `applyLinearCorrection`, `applyAngularCorrection`, `linearCorrection`, `angularCorrection` |
| `Fg` / DynamicRayCastVehicleController | `[114476,118131)` | — | `constructor`, `free`, `updateVehicle`, `currentVehicleSpeed`, `chassis`, `get indexUpAxis`, `set indexUpAxis`, `get indexForwardAxis`, `set setIndexForwardAxis`, `addWheel`, `numWheels`, `wheelChassisConnectionPointCs`, `setWheelChassisConnectionPointCs`, `wheelSuspensionRestLength`, `setWheelSuspensionRestLength`, `wheelMaxSuspensionTravel`, `setWheelMaxSuspensionTravel`, `wheelRadius`, `setWheelRadius`, `wheelSuspensionStiffness`, `setWheelSuspensionStiffness`, `wheelSuspensionCompression`, `setWheelSuspensionCompression`, `wheelSuspensionRelaxation`, `setWheelSuspensionRelaxation`, `wheelMaxSuspensionForce`, `setWheelMaxSuspensionForce`, `wheelBrake`, `setWheelBrake`, `wheelSteering`, `setWheelSteering`, `wheelEngineForce`, `setWheelEngineForce`, `wheelDirectionCs`, `setWheelDirectionCs`, `wheelAxleCs`, `setWheelAxleCs`, `wheelFrictionSlip`, `setWheelFrictionSlip`, `wheelSideFrictionStiffness`, `setWheelSideFrictionStiffness`, `wheelRotation`, `wheelForwardImpulse`, `wheelSideImpulse`, `wheelSuspensionForce`, `wheelContactNormal`, `wheelContactPoint`, `wheelSuspensionLength`, `wheelHardPoint`, `wheelIsInContact`, `wheelGroundObject` |
| `ag` / World | `[118131,126903)` | — | `constructor`, `free`, `static fromRaw`, `takeSnapshot`, `static restoreSnapshot`, `debugRender`, `step`, `propagateModifiedBodyPositionsToColliders`, `get timestep`, `set timestep`, `get lengthUnit`, `set lengthUnit`, `get numSolverIterations`, `set numSolverIterations`, `get numInternalPgsIterations`, `set numInternalPgsIterations`, `get maxCcdSubsteps`, `set maxCcdSubsteps`, `createRigidBody`, `createCharacterController`, `removeCharacterController`, `createPidController`, `removePidController`, `createVehicleController`, `removeVehicleController`, `createCollider`, `createImpulseJoint`, `createMultibodyJoint`, `getRigidBody`, `getCollider`, `getImpulseJoint`, `getMultibodyJoint`, `removeRigidBody`, `removeCollider`, `removeImpulseJoint`, `removeMultibodyJoint`, `forEachCollider`, `forEachRigidBody`, `forEachActiveRigidBody`, `castRay`, `castRayAndGetNormal`, `intersectionsWithRay`, `intersectionWithShape`, `projectPoint`, `projectPointAndGetFeature`, `intersectionsWithPoint`, `castShape`, `intersectionsWithShape`, `collidersWithAabbIntersectingAabb`, `contactPairsWith`, `intersectionPairsWith`, `contactPair`, `intersectionPair`, `set profilerEnabled`, `get profilerEnabled`, `timingStep`, `timingCollisionDetection`, `timingBroadPhase`, `timingNarrowPhase`, `timingSolver`, `timingVelocityAssembly`, `timingVelocityResolution`, `timingVelocityUpdate`, `timingVelocityWriteback`, `timingCcd`, `timingCcdToiComputation`, `timingCcdBroadPhase`, `timingCcdNarrowPhase`, `timingCcdSolver`, `timingIslandConstruction`, `timingUserChanges` |
| `sg` / TempContactForceEvent | `[127043,127427)` | — | `free`, `collider1`, `collider2`, `totalForce`, `totalForceMagnitude`, `maxForceDirection`, `maxForceMagnitude` |
| `Rg` / EventQueue | `[127427,127709)` | — | `constructor`, `free`, `drainCollisionEvents`, `drainContactForceEvents`, `clear` |
| `Yg` / Collider | `[128618,135388)` | — | `constructor`, `finalizeDeserialization`, `ensureShapeIsCached`, `get shape`, `clearShapeCache`, `isValid`, `translation`, `translationWrtParent`, `rotation`, `rotationWrtParent`, `isSensor`, `setSensor`, `setShape`, `setEnabled`, `isEnabled`, `setRestitution`, `setFriction`, `frictionCombineRule`, `setFrictionCombineRule`, `restitutionCombineRule`, `setRestitutionCombineRule`, `setCollisionGroups`, `setSolverGroups`, `contactSkin`, `setContactSkin`, `activeHooks`, `setActiveHooks`, `activeEvents`, `setActiveEvents`, `activeCollisionTypes`, `setContactForceEventThreshold`, `contactForceEventThreshold`, `setActiveCollisionTypes`, `setDensity`, `setMass`, `setMassProperties`, `setTranslation`, `setTranslationWrtParent`, `setRotation`, `setRotationWrtParent`, `shapeType`, `halfExtents`, `setHalfExtents`, `radius`, `setRadius`, `roundRadius`, `setRoundRadius`, `halfHeight`, `setHalfHeight`, `setVoxel`, `propagateVoxelChange`, `combineVoxelStates`, `vertices`, `indices`, `heightfieldHeights`, `heightfieldScale`, `heightfieldNRows`, `heightfieldNCols`, `parent`, `friction`, `restitution`, `density`, `mass`, `volume`, `collisionGroups`, `solverGroups`, `containsPoint`, `projectPoint`, `intersectsRay`, `castShape`, `castCollider`, `intersectsShape`, `contactShape`, `contactCollider`, `castRay`, `castRayAndGetNormal` |
| `cg` / ColliderDesc | `[135488,138555)` | — | `constructor`, `static ball`, `static capsule`, `static segment`, `static triangle`, `static roundTriangle`, `static polyline`, `static voxels`, `static trimesh`, `static cuboid`, `static roundCuboid`, `static heightfield`, `static cylinder`, `static roundCylinder`, `static cone`, `static roundCone`, `static convexHull`, `static convexMesh`, `static roundConvexHull`, `static roundConvexMesh`, `setTranslation`, `setRotation`, `setSensor`, `setEnabled`, `setContactSkin`, `setDensity`, `setMass`, `setMassProperties`, `setRestitution`, `setFriction`, `setFrictionCombineRule`, `setRestitutionCombineRule`, `setCollisionGroups`, `setSolverGroups`, `setActiveHooks`, `setActiveEvents`, `setActiveCollisionTypes`, `setContactForceEventThreshold` |
| `qg` / ColliderSet | `[138555,139934)` | — | `constructor`, `free`, `castClosure`, `finalizeDeserialization`, `createCollider`, `remove`, `unmap`, `get`, `len`, `contains`, `forEach`, `getAll` |

### Complete WASM export names and indices

`memory` is memory kind 2, index 0. Every remaining entry below is function kind 0; `name=index` records the original export index and preserves aliases. Grouping is only for navigation. No instructions were executed.

**version (1)**

`version=1623`

**deallocators (34)**

`__wbg_rawkinematiccharactercontroller_free=1083`, `__wbg_rawcharactercollision_free=1196`, `__wbg_rawpidcontroller_free=1197`, `__wbg_rawdynamicraycastvehiclecontroller_free=876`, `__wbg_rawccdsolver_free=1198`, `__wbg_rawimpulsejointset_free=973`, `__wbg_rawintegrationparameters_free=1199`, `__wbg_rawislandmanager_free=810`, `__wbg_rawgenericjoint_free=1200`, `__wbg_rawmultibodyjointset_free=974`, `__wbg_rawrigidbodyset_free=1006`, `__wbg_rawbroadphase_free=975`, `__wbg_rawcolliderset_free=842`, `__wbg_rawshapecontact_free=1201`, `__wbg_rawnarrowphase_free=1077`, `__wbg_rawcontactmanifold_free=1202`, `__wbg_rawpointprojection_free=1203`, `__wbg_rawpointcolliderprojection_free=1204`, `__wbg_rawrayintersection_free=1205`, `__wbg_rawraycolliderhit_free=1206`, `__wbg_rawshape_free=969`, `__wbg_rawshapecasthit_free=1207`, `__wbg_rawcollidershapecasthit_free=1208`, `__wbg_rawdebugrenderpipeline_free=976`, `__wbg_raweventqueue_free=898`, `__wbg_rawcontactforceevent_free=1209`, `__wbg_rawphysicspipeline_free=977`, `__wbg_rawdeserializedworld_free=1008`, `__wbg_rawcontactpair_free=1202`, `__wbg_rawraycolliderintersection_free=1204`, `__wbg_rawrotation_free=1203`, `__wbg_rawvector_free=1206`, `__wbg_rawsdpmatrix3_free=1205`, `__wbg_rawserializationpipeline_free=1198`

**rawkinematiccharactercontroller (28)**

`rawkinematiccharactercontroller_new=972`, `rawkinematiccharactercontroller_setUp=756`, `rawkinematiccharactercontroller_normalNudgeFactor=1512`, `rawkinematiccharactercontroller_setNormalNudgeFactor=1556`, `rawkinematiccharactercontroller_offset=1513`, `rawkinematiccharactercontroller_setOffset=1514`, `rawkinematiccharactercontroller_slideEnabled=1515`, `rawkinematiccharactercontroller_setSlideEnabled=1550`, `rawkinematiccharactercontroller_autostepMaxHeight=1452`, `rawkinematiccharactercontroller_autostepMinWidth=1453`, `rawkinematiccharactercontroller_autostepIncludesDynamicBodies=1438`, `rawkinematiccharactercontroller_autostepEnabled=1499`, `rawkinematiccharactercontroller_enableAutostep=1419`, `rawkinematiccharactercontroller_disableAutostep=1557`, `rawkinematiccharactercontroller_maxSlopeClimbAngle=1516`, `rawkinematiccharactercontroller_setMaxSlopeClimbAngle=1558`, `rawkinematiccharactercontroller_minSlopeSlideAngle=1517`, `rawkinematiccharactercontroller_setMinSlopeSlideAngle=1559`, `rawkinematiccharactercontroller_snapToGroundDistance=1454`, `rawkinematiccharactercontroller_enableSnapToGround=1518`, `rawkinematiccharactercontroller_disableSnapToGround=1560`, `rawkinematiccharactercontroller_snapToGroundEnabled=1500`, `rawkinematiccharactercontroller_computeColliderMovement=328`, `rawkinematiccharactercontroller_computedMovement=1108`, `rawkinematiccharactercontroller_computedGrounded=1519`, `rawkinematiccharactercontroller_numComputedCollisions=1520`, `rawkinematiccharactercontroller_computedCollision=855`, `rawkinematiccharactercontroller_up=1109`

**rawcharactercollision (9)**

`rawcharactercollision_new=1392`, `rawcharactercollision_handle=1521`, `rawcharactercollision_translationDeltaApplied=1109`, `rawcharactercollision_translationDeltaRemaining=1110`, `rawcharactercollision_toi=1522`, `rawcharactercollision_worldWitness1=1111`, `rawcharactercollision_worldWitness2=723`, `rawcharactercollision_worldNormal1=1112`, `rawcharactercollision_worldNormal2=782`

**rawpidcontroller (10)**

`rawpidcontroller_new=1364`, `rawpidcontroller_set_kp=1060`, `rawpidcontroller_set_ki=1061`, `rawpidcontroller_set_kd=1062`, `rawpidcontroller_set_axes_mask=1464`, `rawpidcontroller_reset_integrals=1262`, `rawpidcontroller_apply_linear_correction=432`, `rawpidcontroller_apply_angular_correction=433`, `rawpidcontroller_linear_correction=393`, `rawpidcontroller_angular_correction=394`

**rawdynamicraycastvehiclecontroller (50)**

`rawdynamicraycastvehiclecontroller_new=1420`, `rawdynamicraycastvehiclecontroller_current_vehicle_speed=1523`, `rawdynamicraycastvehiclecontroller_chassis=1524`, `rawdynamicraycastvehiclecontroller_index_up_axis=1525`, `rawdynamicraycastvehiclecontroller_set_index_up_axis=1561`, `rawdynamicraycastvehiclecontroller_index_forward_axis=1526`, `rawdynamicraycastvehiclecontroller_set_index_forward_axis=1562`, `rawdynamicraycastvehiclecontroller_add_wheel=470`, `rawdynamicraycastvehiclecontroller_num_wheels=1527`, `rawdynamicraycastvehiclecontroller_update_vehicle=397`, `rawdynamicraycastvehiclecontroller_wheel_chassis_connection_point_cs=889`, `rawdynamicraycastvehiclecontroller_set_wheel_chassis_connection_point_cs=725`, `rawdynamicraycastvehiclecontroller_wheel_suspension_rest_length=1343`, `rawdynamicraycastvehiclecontroller_set_wheel_suspension_rest_length=1161`, `rawdynamicraycastvehiclecontroller_wheel_max_suspension_travel=1344`, `rawdynamicraycastvehiclecontroller_set_wheel_max_suspension_travel=1162`, `rawdynamicraycastvehiclecontroller_wheel_radius=1345`, `rawdynamicraycastvehiclecontroller_set_wheel_radius=1163`, `rawdynamicraycastvehiclecontroller_wheel_suspension_stiffness=1346`, `rawdynamicraycastvehiclecontroller_set_wheel_suspension_stiffness=1164`, `rawdynamicraycastvehiclecontroller_wheel_suspension_compression=1347`, `rawdynamicraycastvehiclecontroller_set_wheel_suspension_compression=1165`, `rawdynamicraycastvehiclecontroller_wheel_suspension_relaxation=1348`, `rawdynamicraycastvehiclecontroller_set_wheel_suspension_relaxation=1166`, `rawdynamicraycastvehiclecontroller_wheel_max_suspension_force=1349`, `rawdynamicraycastvehiclecontroller_set_wheel_max_suspension_force=1167`, `rawdynamicraycastvehiclecontroller_wheel_brake=1350`, `rawdynamicraycastvehiclecontroller_set_wheel_brake=1168`, `rawdynamicraycastvehiclecontroller_wheel_steering=1351`, `rawdynamicraycastvehiclecontroller_set_wheel_steering=1169`, `rawdynamicraycastvehiclecontroller_wheel_engine_force=1352`, `rawdynamicraycastvehiclecontroller_set_wheel_engine_force=1170`, `rawdynamicraycastvehiclecontroller_wheel_direction_cs=890`, `rawdynamicraycastvehiclecontroller_set_wheel_direction_cs=726`, `rawdynamicraycastvehiclecontroller_wheel_axle_cs=891`, `rawdynamicraycastvehiclecontroller_set_wheel_axle_cs=727`, `rawdynamicraycastvehiclecontroller_wheel_friction_slip=1353`, `rawdynamicraycastvehiclecontroller_set_wheel_friction_slip=1171`, `rawdynamicraycastvehiclecontroller_wheel_side_friction_stiffness=1354`, `rawdynamicraycastvehiclecontroller_set_wheel_side_friction_stiffness=1172`, `rawdynamicraycastvehiclecontroller_wheel_rotation=1355`, `rawdynamicraycastvehiclecontroller_wheel_forward_impulse=1356`, `rawdynamicraycastvehiclecontroller_wheel_side_impulse=1357`, `rawdynamicraycastvehiclecontroller_wheel_suspension_force=1358`, `rawdynamicraycastvehiclecontroller_wheel_contact_normal_ws=892`, `rawdynamicraycastvehiclecontroller_wheel_contact_point_ws=893`, `rawdynamicraycastvehiclecontroller_wheel_suspension_length=1359`, `rawdynamicraycastvehiclecontroller_wheel_hard_point_ws=894`, `rawdynamicraycastvehiclecontroller_wheel_is_in_contact=1365`, `rawdynamicraycastvehiclecontroller_wheel_ground_object=1191`

**rawimpulsejointset (26)**

`rawimpulsejointset_jointType=903`, `rawimpulsejointset_jointBodyHandle1=993`, `rawimpulsejointset_jointBodyHandle2=994`, `rawimpulsejointset_jointFrameX1=783`, `rawimpulsejointset_jointFrameX2=784`, `rawimpulsejointset_jointAnchor1=785`, `rawimpulsejointset_jointAnchor2=786`, `rawimpulsejointset_jointSetAnchor1=731`, `rawimpulsejointset_jointSetAnchor2=732`, `rawimpulsejointset_jointContactsEnabled=995`, `rawimpulsejointset_jointSetContactsEnabled=1084`, `rawimpulsejointset_jointLimitsEnabled=896`, `rawimpulsejointset_jointLimitsMin=931`, `rawimpulsejointset_jointLimitsMax=932`, `rawimpulsejointset_jointSetLimits=947`, `rawimpulsejointset_jointConfigureMotorModel=900`, `rawimpulsejointset_jointConfigureMotorVelocity=966`, `rawimpulsejointset_jointConfigureMotorPosition=967`, `rawimpulsejointset_jointConfigureMotor=968`, `rawimpulsejointset_new=1366`, `rawimpulsejointset_createJoint=838`, `rawimpulsejointset_remove=1177`, `rawimpulsejointset_len=1525`, `rawimpulsejointset_contains=1113`, `rawimpulsejointset_forEachJointHandle=787`, `rawimpulsejointset_forEachJointAttachedToRigidBody=1178`

**rawintegrationparameters (19)**

`rawintegrationparameters_new=1439`, `rawintegrationparameters_dt=1528`, `rawintegrationparameters_contact_erp=1375`, `rawintegrationparameters_normalizedAllowedLinearError=1529`, `rawintegrationparameters_normalizedPredictionDistance=1530`, `rawintegrationparameters_numSolverIterations=1531`, `rawintegrationparameters_minIslandSize=1532`, `rawintegrationparameters_maxCcdSubsteps=1533`, `rawintegrationparameters_set_dt=1563`, `rawintegrationparameters_set_contact_natural_frequency=1564`, `rawintegrationparameters_set_normalizedAllowedLinearError=1565`, `rawintegrationparameters_set_normalizedPredictionDistance=1566`, `rawintegrationparameters_set_numSolverIterations=1567`, `rawintegrationparameters_set_minIslandSize=1568`, `rawintegrationparameters_set_maxCcdSubsteps=1569`, `rawintegrationparameters_set_lengthUnit=1570`, `rawintegrationparameters_set_numInternalPgsIterations=1561`, `rawintegrationparameters_numInternalPgsIterations=1525`, `rawintegrationparameters_lengthUnit=1543`

**rawislandmanager (2)**

`rawislandmanager_new=1465`, `rawislandmanager_forEachActiveRigidBodyHandle=806`

**rawgenericjoint (7)**

`rawgenericjoint_generic=334`, `rawgenericjoint_spring=566`, `rawgenericjoint_rope=577`, `rawgenericjoint_spherical=581`, `rawgenericjoint_prismatic=322`, `rawgenericjoint_fixed=298`, `rawgenericjoint_revolute=348`

**rawmultibodyjointset (16)**

`rawmultibodyjointset_jointType=833`, `rawmultibodyjointset_jointFrameX1=710`, `rawmultibodyjointset_jointFrameX2=711`, `rawmultibodyjointset_jointAnchor1=712`, `rawmultibodyjointset_jointAnchor2=713`, `rawmultibodyjointset_jointContactsEnabled=883`, `rawmultibodyjointset_jointSetContactsEnabled=924`, `rawmultibodyjointset_jointLimitsEnabled=823`, `rawmultibodyjointset_jointLimitsMin=849`, `rawmultibodyjointset_jointLimitsMax=850`, `rawmultibodyjointset_new=1367`, `rawmultibodyjointset_createJoint=839`, `rawmultibodyjointset_remove=1186`, `rawmultibodyjointset_contains=1069`, `rawmultibodyjointset_forEachJointHandle=1182`, `rawmultibodyjointset_forEachJointAttachedToRigidBody=1179`

**rawrigidbodyset (76)**

`rawrigidbodyset_rbTranslation=788`, `rawrigidbodyset_rbRotation=789`, `rawrigidbodyset_rbSleep=1157`, `rawrigidbodyset_rbIsSleeping=1013`, `rawrigidbodyset_rbIsMoving=1054`, `rawrigidbodyset_rbNextTranslation=790`, `rawrigidbodyset_rbNextRotation=791`, `rawrigidbodyset_rbSetTranslation=1218`, `rawrigidbodyset_rbSetRotation=1212`, `rawrigidbodyset_rbSetLinvel=774`, `rawrigidbodyset_rbSetAngvel=775`, `rawrigidbodyset_rbSetNextKinematicTranslation=1014`, `rawrigidbodyset_rbSetNextKinematicRotation=818`, `rawrigidbodyset_rbRecomputeMassPropertiesFromColliders=805`, `rawrigidbodyset_rbSetAdditionalMass=1015`, `rawrigidbodyset_rbSetAdditionalMassProperties=437`, `rawrigidbodyset_rbLinvel=792`, `rawrigidbodyset_rbAngvel=793`, `rawrigidbodyset_rbVelocityAtPoint=584`, `rawrigidbodyset_rbLockTranslations=836`, `rawrigidbodyset_rbSetEnabledTranslations=714`, `rawrigidbodyset_rbLockRotations=837`, `rawrigidbodyset_rbSetEnabledRotations=715`, `rawrigidbodyset_rbDominanceGroup=1016`, `rawrigidbodyset_rbSetDominanceGroup=984`, `rawrigidbodyset_rbEnableCcd=1114`, `rawrigidbodyset_rbSetSoftCcdPrediction=1141`, `rawrigidbodyset_rbMass=963`, `rawrigidbodyset_rbInvMass=1017`, `rawrigidbodyset_rbEffectiveInvMass=794`, `rawrigidbodyset_rbLocalCom=795`, `rawrigidbodyset_rbWorldCom=796`, `rawrigidbodyset_rbInvPrincipalInertia=797`, `rawrigidbodyset_rbPrincipalInertiaLocalFrame=798`, `rawrigidbodyset_rbPrincipalInertia=845`, `rawrigidbodyset_rbEffectiveWorldInvInertia=716`, `rawrigidbodyset_rbEffectiveAngularInertia=814`, `rawrigidbodyset_rbWakeUp=979`, `rawrigidbodyset_rbIsCcdEnabled=1018`, `rawrigidbodyset_rbSoftCcdPrediction=1019`, `rawrigidbodyset_rbNumColliders=1020`, `rawrigidbodyset_rbCollider=904`, `rawrigidbodyset_rbBodyType=1021`, `rawrigidbodyset_rbSetBodyType=1004`, `rawrigidbodyset_rbIsFixed=980`, `rawrigidbodyset_rbIsKinematic=981`, `rawrigidbodyset_rbIsDynamic=985`, `rawrigidbodyset_rbLinearDamping=1022`, `rawrigidbodyset_rbAngularDamping=1023`, `rawrigidbodyset_rbSetLinearDamping=1142`, `rawrigidbodyset_rbSetAngularDamping=1143`, `rawrigidbodyset_rbSetEnabled=1115`, `rawrigidbodyset_rbIsEnabled=1024`, `rawrigidbodyset_rbGravityScale=1025`, `rawrigidbodyset_rbSetGravityScale=933`, `rawrigidbodyset_rbResetForces=1116`, `rawrigidbodyset_rbResetTorques=1117`, `rawrigidbodyset_rbAddForce=776`, `rawrigidbodyset_rbApplyImpulse=777`, `rawrigidbodyset_rbAddTorque=778`, `rawrigidbodyset_rbApplyTorqueImpulse=779`, `rawrigidbodyset_rbAddForceAtPoint=593`, `rawrigidbodyset_rbApplyImpulseAtPoint=541`, `rawrigidbodyset_rbAdditionalSolverIterations=1026`, `rawrigidbodyset_rbSetAdditionalSolverIterations=1144`, `rawrigidbodyset_rbUserData=1005`, `rawrigidbodyset_rbSetUserData=1101`, `rawrigidbodyset_rbUserForce=851`, `rawrigidbodyset_rbUserTorque=852`, `rawrigidbodyset_new=1378`, `rawrigidbodyset_createRigidBody=225`, `rawrigidbodyset_remove=378`, `rawrigidbodyset_len=1534`, `rawrigidbodyset_contains=1145`, `rawrigidbodyset_forEachRigidBodyHandle=1183`, `rawrigidbodyset_propagateModifiedBodyPositionsToColliders=897`

**rawbroadphase (11)**

`rawbroadphase_new=1173`, `rawbroadphase_castRay=281`, `rawbroadphase_castRayAndGetNormal=266`, `rawbroadphase_intersectionsWithRay=228`, `rawbroadphase_intersectionWithShape=212`, `rawbroadphase_projectPoint=308`, `rawbroadphase_projectPointAndGetFeature=311`, `rawbroadphase_intersectionsWithPoint=283`, `rawbroadphase_castShape=200`, `rawbroadphase_intersectionsWithShape=215`, `rawbroadphase_collidersWithAabbIntersectingAabb=325`

**rawcolliderset (82)**

`rawcolliderset_coTranslation=799`, `rawcolliderset_coRotation=800`, `rawcolliderset_coTranslationWrtParent=759`, `rawcolliderset_coRotationWrtParent=760`, `rawcolliderset_coSetTranslation=986`, `rawcolliderset_coSetTranslationWrtParent=964`, `rawcolliderset_coSetRotation=815`, `rawcolliderset_coSetRotationWrtParent=1231`, `rawcolliderset_coIsSensor=1027`, `rawcolliderset_coShapeType=1180`, `rawcolliderset_coHalfspaceNormal=692`, `rawcolliderset_coHalfExtents=675`, `rawcolliderset_coSetHalfExtents=864`, `rawcolliderset_coRadius=1085`, `rawcolliderset_coSetRadius=1246`, `rawcolliderset_coHalfHeight=1086`, `rawcolliderset_coSetHalfHeight=1247`, `rawcolliderset_coRoundRadius=1087`, `rawcolliderset_coSetRoundRadius=1248`, `rawcolliderset_coVoxelData=824`, `rawcolliderset_coVoxelSize=697`, `rawcolliderset_coSetVoxel=920`, `rawcolliderset_coPropagateVoxelChange=1213`, `rawcolliderset_coCombineVoxelStates=1232`, `rawcolliderset_coVertices=825`, `rawcolliderset_coIndices=826`, `rawcolliderset_coTriMeshFlags=872`, `rawcolliderset_coHeightFieldFlags=873`, `rawcolliderset_coHeightfieldHeights=827`, `rawcolliderset_coHeightfieldScale=673`, `rawcolliderset_coHeightfieldNRows=846`, `rawcolliderset_coHeightfieldNCols=847`, `rawcolliderset_coParent=921`, `rawcolliderset_coSetEnabled=934`, `rawcolliderset_coIsEnabled=987`, `rawcolliderset_coSetContactSkin=1146`, `rawcolliderset_coContactSkin=1028`, `rawcolliderset_coFriction=1029`, `rawcolliderset_coRestitution=1030`, `rawcolliderset_coDensity=1055`, `rawcolliderset_coMass=1056`, `rawcolliderset_coVolume=1057`, `rawcolliderset_coCollisionGroups=952`, `rawcolliderset_coSolverGroups=953`, `rawcolliderset_coActiveHooks=1031`, `rawcolliderset_coActiveCollisionTypes=1032`, `rawcolliderset_coActiveEvents=1033`, `rawcolliderset_coContactForceEventThreshold=1034`, `rawcolliderset_coContainsPoint=662`, `rawcolliderset_coCastShape=264`, `rawcolliderset_coCastCollider=405`, `rawcolliderset_coIntersectsShape=359`, `rawcolliderset_coContactShape=220`, `rawcolliderset_coContactCollider=693`, `rawcolliderset_coProjectPoint=535`, `rawcolliderset_coIntersectsRay=474`, `rawcolliderset_coCastRay=439`, `rawcolliderset_coCastRayAndGetNormal=349`, `rawcolliderset_coSetSensor=982`, `rawcolliderset_coSetRestitution=1147`, `rawcolliderset_coSetFriction=1148`, `rawcolliderset_coFrictionCombineRule=1035`, `rawcolliderset_coSetFrictionCombineRule=1088`, `rawcolliderset_coRestitutionCombineRule=1036`, `rawcolliderset_coSetRestitutionCombineRule=1089`, `rawcolliderset_coSetCollisionGroups=916`, `rawcolliderset_coSetSolverGroups=917`, `rawcolliderset_coSetActiveHooks=1070`, `rawcolliderset_coSetActiveEvents=1090`, `rawcolliderset_coSetActiveCollisionTypes=1091`, `rawcolliderset_coSetShape=728`, `rawcolliderset_coSetContactForceEventThreshold=1149`, `rawcolliderset_coSetDensity=1150`, `rawcolliderset_coSetMass=1151`, `rawcolliderset_coSetMassProperties=449`, `rawcolliderset_new=1175`, `rawcolliderset_len=1535`, `rawcolliderset_contains=1152`, `rawcolliderset_createCollider=232`, `rawcolliderset_remove=539`, `rawcolliderset_forEachColliderHandle=1184`, `rawcolliderset_isHandleValid=1152`

**rawnarrowphase (5)**

`rawnarrowphase_new=1440`, `rawnarrowphase_contact_pairs_with=1192`, `rawnarrowphase_contact_pair=874`, `rawnarrowphase_intersection_pairs_with=1193`, `rawnarrowphase_intersection_pair=1007`

**rawcontactpair (4)**

`rawcontactpair_collider1=1441`, `rawcontactpair_collider2=1442`, `rawcontactpair_numContactManifolds=1443`, `rawcontactpair_contactManifold=1158`

**rawcontactmanifold (20)**

`rawcontactmanifold_normal=1037`, `rawcontactmanifold_local_n1=1038`, `rawcontactmanifold_local_n2=1039`, `rawcontactmanifold_subshape1=1444`, `rawcontactmanifold_subshape2=1445`, `rawcontactmanifold_num_contacts=1446`, `rawcontactmanifold_contact_local_p1=880`, `rawcontactmanifold_contact_local_p2=881`, `rawcontactmanifold_contact_dist=1332`, `rawcontactmanifold_contact_fid1=1333`, `rawcontactmanifold_contact_fid2=1334`, `rawcontactmanifold_contact_impulse=1335`, `rawcontactmanifold_contact_tangent_impulse_x=1336`, `rawcontactmanifold_contact_tangent_impulse_y=1337`, `rawcontactmanifold_num_solver_contacts=1447`, `rawcontactmanifold_solver_contact_point=882`, `rawcontactmanifold_solver_contact_dist=1338`, `rawcontactmanifold_solver_contact_friction=1300`, `rawcontactmanifold_solver_contact_restitution=1301`, `rawcontactmanifold_solver_contact_tangent_velocity=912`

**rawpointprojection (2)**

`rawpointprojection_point=1118`, `rawpointprojection_isInside=1536`

**rawpointcolliderprojection (5)**

`rawpointcolliderprojection_colliderHandle=1537`, `rawpointcolliderprojection_point=1119`, `rawpointcolliderprojection_isInside=1538`, `rawpointcolliderprojection_featureType=1539`, `rawpointcolliderprojection_featureId=1455`

**rawshape (29)**

`rawshape_cuboid=1421`, `rawshape_roundCuboid=1410`, `rawshape_ball=1456`, `rawshape_halfspace=811`, `rawshape_capsule=1236`, `rawshape_cylinder=1448`, `rawshape_roundCylinder=1422`, `rawshape_cone=1449`, `rawshape_roundCone=1423`, `rawshape_voxels=884`, `rawshape_voxelsFromPoints=885`, `rawshape_polyline=1281`, `rawshape_trimesh=1214`, `rawshape_heightfield=677`, `rawshape_segment=706`, `rawshape_triangle=537`, `rawshape_roundTriangle=536`, `rawshape_convexHull=1282`, `rawshape_roundConvexHull=1275`, `rawshape_convexMesh=1219`, `rawshape_roundConvexMesh=1215`, `rawshape_castShape=139`, `rawshape_intersectsShape=268`, `rawshape_contactShape=180`, `rawshape_containsPoint=384`, `rawshape_projectPoint=350`, `rawshape_intersectsRay=320`, `rawshape_castRay=309`, `rawshape_castRayAndGetNormal=256`

**rawshapecasthit (5)**

`rawshapecasthit_witness1=1120`, `rawshapecasthit_normal1=1121`, `rawshapecasthit_normal2=1122`, `rawshapecasthit_witness2=1125`, `rawshapecasthit_time_of_impact=1528`

**rawcollidershapecasthit (6)**

`rawcollidershapecasthit_time_of_impact=1540`, `rawcollidershapecasthit_witness1=1123`, `rawcollidershapecasthit_witness2=1124`, `rawcollidershapecasthit_normal1=1109`, `rawcollidershapecasthit_normal2=1110`, `rawcollidershapecasthit_colliderHandle=1521`

**rawrotation (6)**

`rawrotation_new=1582`, `rawrotation_identity=1624`, `rawrotation_w=1541`, `rawrotation_x=1528`, `rawrotation_y=1513`, `rawrotation_z=1540`

**rawvector (14)**

`rawvector_zero=1637`, `rawvector_new=1597`, `rawvector_set_y=1571`, `rawvector_set_z=1572`, `rawvector_xyz=1249`, `rawvector_yxz=1250`, `rawvector_zxy=1251`, `rawvector_xzy=1252`, `rawvector_yzx=1253`, `rawvector_zyx=1254`, `rawvector_set_x=1563`, `rawvector_x=1528`, `rawvector_y=1513`, `rawvector_z=1540`

**rawsdpmatrix3 (1)**

`rawsdpmatrix3_elements=970`

**rawdebugrenderpipeline (4)**

`rawdebugrenderpipeline_new=1276`, `rawdebugrenderpipeline_vertices=1153`, `rawdebugrenderpipeline_colors=1154`, `rawdebugrenderpipeline_render=278`

**rawcontactforceevent (6)**

`rawcontactforceevent_collider2=1542`, `rawcontactforceevent_total_force=1125`, `rawcontactforceevent_total_force_magnitude=1543`, `rawcontactforceevent_max_force_direction=1126`, `rawcontactforceevent_max_force_magnitude=1544`, `rawcontactforceevent_collider1=1521`

**raweventqueue (4)**

`raweventqueue_new=1237`, `raweventqueue_drainCollisionEvents=1227`, `raweventqueue_drainContactForceEvents=1228`, `raweventqueue_clear=996`

**rawphysicspipeline (21)**

`rawphysicspipeline_new=561`, `rawphysicspipeline_set_profiler_enabled=1551`, `rawphysicspipeline_is_profiler_enabled=1545`, `rawphysicspipeline_timing_step=1424`, `rawphysicspipeline_timing_collision_detection=1381`, `rawphysicspipeline_timing_broad_phase=1382`, `rawphysicspipeline_timing_narrow_phase=1383`, `rawphysicspipeline_timing_solver=1384`, `rawphysicspipeline_timing_velocity_assembly=1425`, `rawphysicspipeline_timing_velocity_resolution=1385`, `rawphysicspipeline_timing_velocity_update=1386`, `rawphysicspipeline_timing_velocity_writeback=1426`, `rawphysicspipeline_timing_ccd=1387`, `rawphysicspipeline_timing_ccd_toi_computation=1427`, `rawphysicspipeline_timing_ccd_broad_phase=1428`, `rawphysicspipeline_timing_ccd_narrow_phase=1429`, `rawphysicspipeline_timing_ccd_solver=1430`, `rawphysicspipeline_timing_island_construction=1388`, `rawphysicspipeline_timing_user_changes=1431`, `rawphysicspipeline_step=201`, `rawphysicspipeline_stepWithEvents=184`

**rawdeserializedworld (9)**

`rawdeserializedworld_takeGravity=1046`, `rawdeserializedworld_takeIntegrationParameters=562`, `rawdeserializedworld_takeIslandManager=667`, `rawdeserializedworld_takeBroadPhase=997`, `rawdeserializedworld_takeNarrowPhase=668`, `rawdeserializedworld_takeBodies=767`, `rawdeserializedworld_takeColliders=734`, `rawdeserializedworld_takeImpulseJoints=486`, `rawdeserializedworld_takeMultibodyJoints=487`

**rawserializationpipeline (3)**

`rawserializationpipeline_serializeAll=194`, `rawserializationpipeline_deserializeAll=861`, `rawserializationpipeline_new=1711`

**rawrayintersection (4)**

`rawrayintersection_featureId=1455`, `rawrayintersection_normal=1123`, `rawrayintersection_featureType=1539`, `rawrayintersection_time_of_impact=1540`

**rawraycolliderintersection (5)**

`rawraycolliderintersection_featureId=1455`, `rawraycolliderintersection_normal=1123`, `rawraycolliderintersection_colliderHandle=1537`, `rawraycolliderintersection_featureType=1539`, `rawraycolliderintersection_time_of_impact=1540`

**reserve (1)**

`reserve_memory=1467`

**rawshapecontact (5)**

`rawshapecontact_normal2=1109`, `rawshapecontact_point1=1118`, `rawshapecontact_point2=1123`, `rawshapecontact_normal1=1124`, `rawshapecontact_distance=1516`

**rawraycolliderhit (2)**

`rawraycolliderhit_colliderHandle=1521`, `rawraycolliderhit_timeOfImpact=1540`

**rawccdsolver (1)**

`rawccdsolver_new=1711`

**wasm-bindgen ABI (4)**

`__wbindgen_export_0=1854`, `__wbindgen_add_to_stack_pointer=1939`, `__wbindgen_export_1=1813`, `__wbindgen_export_2=1700`

## Limits and continuation

Wrapper reading is complete at the pinned whole-file hash; no source continuation remains. The 2,092,784-byte encoded payload is fully accounted for and its decoded metadata is inspected. This document does not claim an instruction-by-instruction WASM audit, upstream reproducibility, actual memory-use ceiling, deterministic physics across platforms, browser support, leak measurement, or tested behavior. No tests ran by assignment. Future binary semantics work starts from decoded code payload `[27411,1495351)` and data payload `[1495355,1569526)`, using the decoded hash above; that work is distinct from unfinished JS reading.
