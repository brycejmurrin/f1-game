# Notes batch 06 — ceiling history, middle slice

This map covers the entire assigned byte interval `[52113,152113)` of `docs/notes/CEILING-HISTORY.md` (100,000 bytes), read in ten individually returned 10,000-byte chunks without truncation. Byte offsets are zero-based and end-exclusive. Both boundaries cut prose: the opening continues the game.js history from batch 05; the closing cuts the CSS spacing-history comment and continues in batch 07. No claim of whole-file semantic coverage is made.

Historical prose, commands, ceiling values, test outcomes and archive paths below are provenance, not current instructions or newly verified runtime facts. Current use is navigation and explanation of past ratchet decisions; consult the current rules and ratchet sources before acting. No historical commands, runtime, network, browser, tests, source edits or commits were performed for this map.

## Semantic map

The note is a cumulative ratchet-change register. Its producers are engineering sessions and merges, usually described as “this branch”, “deploy”, “theirs” or “mine”; individual authors are generally not identified in this slice. Dated entries span August 2026 through September 10, 2026. Numbers belong to the recorded lineage and measurement, and repeated merge corrections explicitly warn against adding ceilings arithmetically.

| Section in assigned slice | Topics and dated evidence | Producers, backlinks and current use | Limits |
|---|---|---|---|
| game.js continuation | Wet-tyre physics, two-pass wheel drawing, custom-emblem controls, portrait opt-in, lazy race/scenery/data/net loaders (Sep 1), async-loop recovery, shadow keep/defer reversals, boot-canary lifecycle, menu cars, display retry, garage fitting, generated rosters. | Parallel feature/performance/deploy sessions; points to PHYSICS, PERF-FINDINGS, net-stub-surface tests, manifest/gen-shell and ApexRoster. Explains placement constraints and why a correction superseded earlier rationale. | Opening section title and prior history are outside this batch; several shadow claims are explicitly retracted later in the slice. |
| js/agent/apex.js | Lighting diagnostics, lazy-track boundary wrapper, AI probes, network fake-peer clock/pump/seed behavior, rear-light observability, repro capture/identity restore, physics knob floors, career countback, GPU/backend diagnostics and garage effective framing. | Dev-API and multiplayer/performance sessions; DEBUG-HOOKS, transport, backend-parity, PERF-FINDINGS and garage camera hooks are the stated connections. Useful for why test instrumentation grew with behavior. | Reported last ceiling is historical; some changes are undated and authors unnamed. |
| js/agent/agentview.js | Career parts-cap reporting corrected from free-play cap. | Agent-view/career producer; parts hook is the backlink to inspect. | One short undated entry, no broader API audit. |
| js/car/car3d.js | Cockpit occlusion and pale/paint slabs, halo/wing visibility, realism kits, round halo, regulation dimensions, finishes, diffuser/exhaust, fin/stripe anchoring, mirror/fin recipes, proportions, running lights, and livery crest exclusion. | Car geometry/visual sessions and deploy unions; regulation citations, clamp-scan, front-wing-width test, pale-sweep/build-parity and archived render evidence. Useful for preserving measured geometry constraints and failed approaches. | Measurements and archived render/script paths are historical evidence, not present assets or current dimensional certification; latest slice heading says 3582. |
| js/track/tracks.js | Start-origin arc remapping, elevation alignment, mast budgets, inflated-grid equivalence, graph verdict cache, negative seam wrap, night override, lazy scenery closure resolution, grid decal call, baked models and suppression diagnostics. | Track/performance sessions; graph parity, clipping/grounding suites, scenery guards and PERF-FINDINGS are backlinks. Explains generic engine vs circuit data seams. | Forty-circuit results are reported historical results only; no circuit was rebuilt here. |
| js/lighting/presets.js | Large data-only increases, Aug 29 dusk/dawn/wet COPY VALUES bake (82 conditions), wildcard gating and TLX per-chunk capability limitation. | Bake-lighting/player-tuned producer; LightStore conditional layer and backend capability flag are the dependency. Helps distinguish authored data size from extraction targets. | Snapshot figures and backend limitation require current-source confirmation. |
| js/render/webgpu/wgx.js | Road LUT band/centreline and nearest-sample fixes, shared road buffer, per-chunk allocator/value/static-lane upload splits, empty-run merge evidence, GPU error surface, descriptor-copy hazard, separate shadow submit, index-buffer cache, Sep 2–3 resource/error/capture/device-loss audits. | WGX/performance/audit and deploy sessions; PERF-FINDINGS 2b/2e/2h/2u/2v/2x, backend parity, road-lut census and gpu-census. Navigates rendering state and resource ownership rationale. | Dense merged entries include reversals (envProbeReset/shadow latch); software measurements cannot establish player-GPU behavior. |
| js/render/three/tlx.js | Deferred dispose/backport, force-hardware test levers, GPU errors, presented target, node cache output count, probe error windows, adapter vs blit classification, mirror-release hazards, geometry census, memory counters, occurrence-keyed mesh pool, memoised MRT leak cure, phone shadow lever, null vs zero arrays, alpha context fallback and Sep 3 self-heal. | TLX bug/memory sessions and multiple unions; upstream three issues/PRs, PATCHES, PERF-FINDINGS 2m–2r/2u, real-GPU census and backend canary. Useful as a sequence of hypotheses, measurements, retractions and partial fixes. | Includes a misplaced WGX _setIB entry and repeated history. Explicitly corrects an upstream attribution and warns phone/default conclusions were not established by one knob. |
| js/render/glx/glx.js | Per-chunk dimmer retirement, cell-set cull cache, uniform upload redundancy caches, real GPU error counting, shadow armed observability, context-loss/FBO/sampler/CSS audits. | GLX performance/bug sessions; call census and PERF-FINDINGS 2c–2h/2u. Explains cache lifetime and float32 comparison traps. | Historical per-frame counts and ceiling are not remeasured here. |
| js/render/webgpu/wgsl-chunks.js | Along-lap tangent-neighbor window; Sep 1 conditional reconstruction gate. | WGX shader producer; road LUT census A/B is the stated measurement backlink. | “Belt-and-braces” assessment is specific to the recorded fixed bake. |
| js/render/three/tsl-lit.js | Finish parity and device-aware MAX_LIGHTS uniform row arithmetic for iOS link failures. | TSL parity/mobile rendering producer; GLX lit shader and fragment uniform floor form the connection. | Silent-link diagnosis and limits are historical context. |
| js/net/lobby.js | Transport close ownership, timer generations/deadlines, custom-team seat clash, Sep 2 async start await. | Multiplayer bug session; transport/finishStart and seat wire identity. Useful for teardown and host/peer sequencing. | Slice covers selected ceiling reasons, not a protocol specification. |
| Sep 3 renderer session / Phase 1-lite | TLX dead latch lowering, GLX FBO latch repair, TSL layout/carbon parity, WGX device loss and screenshot reconfigure, distinct-present escalation, preset MSAA read, env reset/sentinel resume, render-clock hold, cloud shading parity, boot caching/warming, parallel shader links, flyby rebuild scheduling. | Named branch rendering-bugs-optimizations-3pstxj plus deploy/boot sessions; backend canaries, image-grade visual spec, mock call-order tests and ratchets.json. Explains why values changed during the register migration. | Entries are a dated integration snapshot; no live renderer validation. |
| Sep 3–4 gameplay/UI additions | Field sector bests, player slipstream/lock-up/after-fire, towing hook, grid rules and lobby compatibility, changeable weather/daily challenge, red-flag restart, setup sheet/brake bias, onboarding, settings back stack, HUD/renderer shell folds and merge measurements. | Gameplay/UI/deploy sessions; AiDrive, SeasonCal, daily challenge, RaceControl, setup-tune, onboard and VM tests. Maps feature seams and stated invariant of keeping curvature off the driver. | Follow-up defects appear later: red-flag progress banking, S1 timing reset, weather-plan retention, retired tow exclusion and stale cue clearing. |
| Tree-wide ratchets, Sep 3 | Consolidation of cssClasses/shellNodes/bareCatches/waitNoPolling into tree-counts and ratchets; preservation of stricter slack. CSS class family reductions/additions; shell node growth and removal of generated script/link counting; silent-catch census distinction and comment rationale; rAF timeout polling migration. | Ratchet consolidation and UI/test sessions; STRUCTURE-REDECISION, architecture review, fixture-consumer audit and wait-polling tests are the explanatory backlinks. Useful for metric definitions and avoiding false equivalence between all catches and bare catches. | Frozen counts are migration-era values. Code blocks preserve old directions as provenance only. |
| waitForTimeout, Sep 10 | Fixed sleep census and conversion to rendered-clock conditions, default ceiling after two helper sleeps removed. | Test reliability producer; track helpers and __apex state waits. | Census is dated; no new wait inventory performed. |
| CSS token adoption, Sep 4 and embedded Aug history (partial) | Four exact-equality metrics migrate into shared ratchets with zero slack. Sub-floor font exceptions; exact-ratio spacing conversions; deliberate anchors/compact tiers; tuner/data/HUD migrations and atomic full-bleed spacing. | UI token migration sessions with commit identifiers and build references; tree-counts offenders, css-token-adoption history, token policy and density ladder. Helps explain why some raw px remained deliberate. | Assigned interval ends mid spacing-history sentence; raw colour histories and remaining adoption history are outside this batch. |

## Integrity ledger

The JSON strings below are raw archive/source provenance, not current Markdown links. SHA-256 covers raw file bytes. Whole-file identity matches the assigned manifest; only the assigned part was semantically read.

```json
{
  "group": "06",
  "source": "docs/notes/CEILING-HISTORY.md",
  "whole_bytes": 254073,
  "whole_sha256": "2f1510686d55c4eb70c08ad9b2f65b3dc4e7bb406931564440d70b857415e5f5",
  "part": {
    "start": 52113,
    "end": 152113,
    "bytes": 100000,
    "sha256": "e5b2c2d760b54e3a419fb0988523f706da3718e41a190c193133d88f71998043"
  },
  "chunks": [
    {
      "start": 52113,
      "end": 62113,
      "bytes": 10000,
      "sha256": "f1f336cf60f7b0c4be8702c70facaeee477ae6ce835e1a385d2f552f00b544b4",
      "read": "entire source returned without truncation"
    },
    {
      "start": 62113,
      "end": 72113,
      "bytes": 10000,
      "sha256": "068cbe35b47baf4eb600c305ec0718b35fb7b9da989ed458bced92a108ec8f3f",
      "read": "entire source returned without truncation"
    },
    {
      "start": 72113,
      "end": 82113,
      "bytes": 10000,
      "sha256": "ba4d82d03044326e04947cc9fc3facd09c157f04c9396eac6c1dd0c69898fba0",
      "read": "entire source returned without truncation"
    },
    {
      "start": 82113,
      "end": 92113,
      "bytes": 10000,
      "sha256": "ee397d0befdae100e33668be2e506e5a368d5a9e4adbda5191fb585b1b3656fc",
      "read": "entire source returned without truncation"
    },
    {
      "start": 92113,
      "end": 102113,
      "bytes": 10000,
      "sha256": "e66998df61bbb384505ea793365270de27149249d11c08855dda0441e5e381dc",
      "read": "entire source returned without truncation"
    },
    {
      "start": 102113,
      "end": 112113,
      "bytes": 10000,
      "sha256": "67ba9773168859ec11e77cf6b3eaff36f1bacfcc0d9c16f974d2b70b563fe6dd",
      "read": "entire source returned without truncation"
    },
    {
      "start": 112113,
      "end": 122113,
      "bytes": 10000,
      "sha256": "9353730a9f86434d07f747177ed8d7e41705181e6c91f88effdf2794dc275f9a",
      "read": "entire source returned without truncation"
    },
    {
      "start": 122113,
      "end": 132113,
      "bytes": 10000,
      "sha256": "d4b1c7745830fc2f015e5445ef811943d9d083edd5818f76b6637317436169c9",
      "read": "entire source returned without truncation"
    },
    {
      "start": 132113,
      "end": 142113,
      "bytes": 10000,
      "sha256": "171548ec81c02d1f9fe08334b50fe3aa09824fdab867100cd413fc30105e7e5e",
      "read": "entire source returned without truncation"
    },
    {
      "start": 142113,
      "end": 152113,
      "bytes": 10000,
      "sha256": "69b0dcbfcd70432dddfc58a1b7c82da94f2694e40873abed68113355ce082ddc",
      "read": "entire source returned without truncation"
    }
  ]
}
```
