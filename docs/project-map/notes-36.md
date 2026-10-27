# Notes group 36 — audio, physics, XR and orchestration provenance

Current AGENTS.md read. All 13 assigned parts (100,000 bytes) were read in 19 individually returned, untruncated chunks of at most 9,000 bytes. Ranges are half-open. Historical instructions are provenance only; no source edits, tests, browser, network or commits were performed.

## [VOICE-LAG-IPHONE-2026-10-01.md](../notes/VOICE-LAG-IPHONE-2026-10-01.md)

Date / producer: 2026-10-01; author unnamed.
Whole source: 4332 bytes; SHA-256 `b502482610f788185fecd3704c502d0723c26e15f5de9a5e159b970a0078106e`; manifest match: true.
Assigned [2420, 4332): 1912 bytes; part SHA-256 `99c24e029861e2dd023d488c8be4279803bc03fa7ad81a8a2d02d3390c5c9a67`.

Read chunks:

- [2420, 4332): `99c24e029861e2dd023d488c8be4279803bc03fa7ad81a8a2d02d3390c5c9a67`

Topics / findings: Recorded radio packs cover phrase pools, emitted cards, captured corpus, slots and words; shared audio nodes reduce per-line work. RECORDED suppresses uncovered synthesis; announcer remains synthesized outside races.
Backlinks / producers: RadioVoice, VoicePack.norm, voicepack and voice-corpus generators; announcer.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. Tail begins mid coach row; prefix belongs to group 35. Implementation claims need current source corroboration.

## [VOICE-OPUS-TWINS-2026-10-25.md](../notes/VOICE-OPUS-TWINS-2026-10-25.md)

Date / producer: 2026-10-25; A·W51, option A.
Whole source: 691 bytes; SHA-256 `e6bba2ec3bd770f9995d8f73d6ec8048a1f0f454f09c6901cee925b973e55bf4`; manifest match: true.
Assigned [0, 691): 691 bytes; part SHA-256 `e6bba2ec3bd770f9995d8f73d6ec8048a1f0f454f09c6901cee925b973e55bf4`.

Read chunks:

- [0, 691): `e6bba2ec3bd770f9995d8f73d6ec8048a1f0f454f09c6901cee925b973e55bf4`

Topics / findings: Opus twins generated for four default voices while MP3 binaries stay identical.
Backlinks / producers: PR #3729; iPhone decode probe A·D2 #3708; Kokoro and ffmpeg.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. Other 20 packs await decision; device decode not measured here.

## [WEATHER-ROADMAP-2026-10-14.md](../notes/WEATHER-ROADMAP-2026-10-14.md)

Date / producer: 2026-10-14; unnamed research/implementation lane.
Whole source: 9306 bytes; SHA-256 `d9078397419d771043a33eb0eea16196812cd0c180b63ee3072fab9593ff9fbb`; manifest match: true.
Assigned [0, 9306): 9306 bytes; part SHA-256 `d9078397419d771043a33eb0eea16196812cd0c180b63ee3072fab9593ff9fbb`.

Read chunks:

- [0, 9000): `e8d4bb31a2e02351f8e1942a3341dcfe908be2f81e2ef6c09330b20bc10d6443`
- [9000, 9306): `af62a6a3a88998bf85ef9253d340da9af3125ae69b09bb3d7aa6f93d9aa92e15`

Topics / findings: Weather research distinguishes sourced pages from snippets; plans storm, forecast, sector water and effects. Built addendum describes aquaplane grip/AI caps and seeded heading-based wind.
Backlinks / producers: AMS, Pirelli, NASA, iRacing, GT7 research; PHYSICS surface rules; TyreModel and wind subsystem.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. Lap-wide wetness remains; settings/HUD/room wind wiring incomplete. Bench data is VM evidence; proposals are not current policy.

## [WHEEL-STATE-2026-10-19.md](../notes/WHEEL-STATE-2026-10-19.md)

Date / producer: 2026-10-19; #1628 scoped wheel-state lane.
Whole source: 6465 bytes; SHA-256 `159cae381a4a36566f2d5f2b8e94f05f62a57f499e0d034eb7832655e60adeca`; manifest match: true.
Assigned [0, 6465): 6465 bytes; part SHA-256 `159cae381a4a36566f2d5f2b8e94f05f62a57f499e0d034eb7832655e60adeca`.

Read chunks:

- [0, 6465): `159cae381a4a36566f2d5f2b8e94f05f62a57f499e0d034eb7832655e60adeca`

Topics / findings: Per-axle torque/slip state starts opt-in OFF. Later slice calibrates demand, feeds shortfall to speed and synchronizes placement; dry stops remain equal, storm lock/grass spin alter delivery.
Backlinks / producers: Mechanics-coherence Tier2 §5; WheelState, PlayerForces, player-dynamics and characterization VM tests; #2924 ownership.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. Earlier missing Fx wiring is superseded within this note. Default ON still requires ABS/TC and remeasurement; no current flag audit.

## [WHY-BOTH-LEVERS-COST-2026-09-16.md](../notes/WHY-BOTH-LEVERS-COST-2026-09-16.md)

Date / producer: 2026-09-16; author unnamed.
Whole source: 5307 bytes; SHA-256 `d0ce42dcd58bbd41e126d9a654fcfe0e2f42573a89f75ab9f3807a478c6d9160`; manifest match: true.
Assigned [0, 5307): 5307 bytes; part SHA-256 `d0ce42dcd58bbd41e126d9a654fcfe0e2f42573a89f75ab9f3807a478c6d9160`.

Read chunks:

- [0, 5307): `d0ce42dcd58bbd41e126d9a654fcfe0e2f42573a89f75ab9f3807a478c6d9160`

Topics / findings: Multi-draw CPU submission benefit cannot be priced with GPU timers. Occlusion query costs depend on GPU architecture; both flags remain OFF in the dated decision.
Backlinks / producers: GPU census 146; GLX multi-draw test; MDN/Khronos, Apple, Imagination, Arm and Vulkan documentation.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. Architecture explanation is dated research, not universal performance proof; real immediate-mode GPU measurements absent.

## [XR-PHASE0-ARCHITECTURE.md](../notes/XR-PHASE0-ARCHITECTURE.md)

Date / producer: 2026-09-29 research onward; author unnamed.
Whole source: 4347 bytes; SHA-256 `17ef08ff33fd439bb6a3f4eb3d7f8baf4603686ff4812a6a8a67b0c4883e3b99`; manifest match: true.
Assigned [0, 4347): 4347 bytes; part SHA-256 `17ef08ff33fd439bb6a3f4eb3d7f8baf4603686ff4812a6a8a67b0c4883e3b99`.

Read chunks:

- [0, 4347): `17ef08ff33fd439bb6a3f4eb3d7f8baf4603686ff4812a6a8a67b0c4883e3b99`

Topics / findings: Manual XR layer, per-eye matrices, XR-owned frame loop and offset seat preserve engine camera contract. Post disabled and immersive buffer sizing protected. IWER workaround and single-evaluation frame waiter documented.
Backlinks / producers: three r186 and issues #32538/#32151/#33497/#33414; Meta IWER 2.5.0; XR boot/session/rig; lifecycle suite and Quest checklist.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. LOW half-resolution software emulation covers lifecycle only; cannot establish headset performance, multiview or projection layers.

## [XR-QUEST-ON-DEVICE.md](../notes/XR-QUEST-ON-DEVICE.md)

Date / producer: Phase 0; author unnamed, date not explicit.
Whole source: 4263 bytes; SHA-256 `f36b80dfa041eaf1fd53c9dc2777155bc7548a7bb48e46cddaf6089b8b275980`; manifest match: true.
Assigned [0, 4263): 4263 bytes; part SHA-256 `f36b80dfa041eaf1fd53c9dc2777155bc7548a7bb48e46cddaf6089b8b275980`.

Read chunks:

- [0, 4263): `f36b80dfa041eaf1fd53c9dc2777155bc7548a7bb48e46cddaf6089b8b275980`

Topics / findings: Quest checklist separates emulation from headset stereo, controls, foveation, thermal and compositor verification.
Backlinks / producers: Meta remote debugging/performance documentation; IWER #196; XR architecture note; XrBoot diagnostics.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. Checklist unchecked; no Quest-ready claim. Experimental WebGPU feature grant must be confirmed on device.

## [garage-perf-2026-10-20.md](../notes/garage-perf-2026-10-20.md)

Date / producer: 2026-10-20; B·L24 with B·H7 remeasurement.
Whole source: 5301 bytes; SHA-256 `da470c4be6e4ad66113a626ba86d060ed02b563d6fd414dae17fec5f3e56fd9e`; manifest match: true.
Assigned [0, 5301): 5301 bytes; part SHA-256 `da470c4be6e4ad66113a626ba86d060ed02b563d6fd414dae17fec5f3e56fd9e`.

Read chunks:

- [0, 5301): `da470c4be6e4ad66113a626ba86d060ed02b563d6fd414dae17fec5f3e56fd9e`

Topics / findings: Garage census isolates program relink and shader growth from small mesh changes. Pipeline lifetime fix removes observed relinks; atlas-only livery taps avoid full rebuild; finish taps still rebuild.
Backlinks / producers: Bryce report via OrchB21; #3145/#3160/#3169/#3176; garage-census; pipeline lifecycle and mesh-free unit guards.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. Software timings are CPU proxies; baseline loaded by parallel suite. Original idle-trigger hypothesis corrected later in same note.

## [README.md](../notes/orchestration-redesign-2026-10-27/README.md)

Date / producer: 2026-10-27; reviewer-agent evidence index.
Whole source: 2409 bytes; SHA-256 `62131537013a5d9834230df76cdb43e8beb50abdaceaca3bbc5f043df830a5f6`; manifest match: true.
Assigned [0, 2409): 2409 bytes; part SHA-256 `62131537013a5d9834230df76cdb43e8beb50abdaceaca3bbc5f043df830a5f6`.

Read chunks:

- [0, 2409): `62131537013a5d9834230df76cdb43e8beb50abdaceaca3bbc5f043df830a5f6`

Topics / findings: Indexes eight source reviews supporting orchestration redesign across bus, tooling, rulebook, outcomes, platforms and host transcripts.
Backlinks / producers: Orchestration redesign plan; sibling evidence reviews.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. Index provenance only; counts belong to dated reviews, not a live fleet inventory.

## [bus.md](../notes/orchestration-redesign-2026-10-27/bus.md)

Date / producer: 2026-10-27; unnamed read-only bus reviewer.
Whole source: 13057 bytes; SHA-256 `82d10f515e0d19ea3463619d15a5b0ec1492dbb1ab102b7a002bced0ca1723d4`; manifest match: true.
Assigned [0, 13057): 13057 bytes; part SHA-256 `82d10f515e0d19ea3463619d15a5b0ec1492dbb1ab102b7a002bced0ca1723d4`.

Read chunks:

- [0, 9000): `d37b05c4707681ac6ec8311f8fa06f6045c10a666dca675a8fd96f8f02d39c50`
- [9000, 13057): `814666113abfa6b027c5f2250ce8176efa8537e439ca0ca7eab46cb32e3e3a9c`

Topics / findings: 3735 lines show broadcast/status overload, stale identities, frequent rotations and weak strict addressed replies. READY/DONE and incident accounting expose duplicate traffic; typed chat reduced HANDOFF share.
Backlinks / producers: Fleet bus commit log 10-19 to 10-27; scratch analysis scripts; cross-host traffic and phantom merger incidents.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. Timestamp correction applied to Pacific-stamping senders; broad reply tiers are upper bounds and off-bus DAD replies missing. No current coordination authority.

## [claude-sessions.md](../notes/orchestration-redesign-2026-10-27/claude-sessions.md)

Date / producer: 2026-10-27; unnamed read-only Claude reviewer.
Whole source: 20418 bytes; SHA-256 `dc23881ac9a9b08d141052d59e1c1e9500a54c1b5bc36cb5a357710f939d386f`; manifest match: true.
Assigned [0, 20418): 20418 bytes; part SHA-256 `dc23881ac9a9b08d141052d59e1c1e9500a54c1b5bc36cb5a357710f939d386f`.

Read chunks:

- [0, 9000): `6a03db69304e8b8e2de7b60f56b752418fe32bb53af80546164adfb2ee235e68`
- [9000, 18000): `dfc13018fe8c54995313d8784c7e0c92b2a8a18fc0b3b35fead0cdffca777ae1`
- [18000, 20418): `8a5a78680796138f4df52b197a36ea493858cf78fa8b906b5b4b8503f10d3c3d`

Topics / findings: 24-session sample classifies no-op wakes, relay and rotation cost, launch gates, archive errors and stale messaging. Recommends simpler boot, durable addressing and status interface.
Backlinks / producers: 60 transcript pages; session-transcript digest; prior Fleet B and system-audit transcript reviews; redesign plan.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. Only one whole session end-to-end; other newest-page windows, three page collisions and unavailable Fleet A sessions limit totals. Proposals conflict with later GitHub-only coordination.

## [codex.md](../notes/orchestration-redesign-2026-10-27/codex.md)

Date / producer: 2026-10-27; unnamed read-only Codex reviewer.
Whole source: 18617 bytes; SHA-256 `1bc48840708c33eb8b8d58f25113881eca807386299cefa8b879c4e118efdfdf`; manifest match: true.
Assigned [0, 18617): 18617 bytes; part SHA-256 `1bc48840708c33eb8b8d58f25113881eca807386299cefa8b879c4e118efdfdf`.

Read chunks:

- [0, 9000): `63cd983ff9505373aab0c6fe86a6acf8224bdf7f3c53579068fb8c397f21f132`
- [9000, 18000): `750b9d0e0d0f121a747892541c631de52f75b9414b4cc89cd67f905264848351`
- [18000, 18617): `7b29e2de5f6bd7f7308e0ded6052af089a468ba6a1bcf8cdb8d86f54ee87c62c`

Topics / findings: 409 export threads plus two full recent sessions show verification dominates tool time, reviewer-heavy children, human merge intervention and lack of inbound fleet wakes. Proposes bounded PR lanes and remote verdicts.
Backlinks / producers: Drive export/index, fleet bus, #3856 and two-session export; redesign plan.
Use / limits: Decision and investigation provenance; corroborate with current code and WORKERS.md. Fleet-era full parts 032–061 missing; index counts and bus substitute. Classification regex, overlapping message categories and missing usage fields limit conclusions; current tool capabilities must be rechecked.

## [cursor-agents.md](../notes/orchestration-redesign-2026-10-27/cursor-agents.md)

Date / producer: 2026-10-27 ~02:00Z; unnamed Fleet D reviewer.
Whole source: 14546 bytes; SHA-256 `5dc8c4a2f66b69912ba56d1cb0dbd249f8d883e0179123c36a95e8af13a1bd49`; manifest match: true.
Assigned `notes-36-paths.json`. Obsolete queue branches, retired bus/relay roles, external transcript exports, temporary analysis scripts and local worktrees are provenance, not runnable instructions.
