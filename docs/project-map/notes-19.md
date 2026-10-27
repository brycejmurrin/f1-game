# Notes batch 19 — debugging, concurrency and performance evidence

Historical provenance index, not executable guidance. Read all 100,000 assigned bytes on 2026-10-27 in individually returned source chunks of at most 10,000 bytes. Byte intervals below are zero-based, end-exclusive. Whole-file hashes identify sources; part and chunk hashes identify precisely the evidence read. No runtime, network, browser or test work was performed.

## Reading map

- **NIGHT-MAST-POOLS-2026-10-05, tail only (3875–6604):** 2026-10-05 TLX lighting measurements; producer is the unnamed tuning session, with #917 and #923 lineage. Covers round-2 lightState/accepted appearance, mast-radius and bake lessons, and compatibility with Atmosphere.floodEmit session resolution. Useful for separating diffuse pools from emissive ramps. Limits: preceding tuning setup/table omitted; screenshots and unit passes are historical claims. Backlinks: #917, #923, profiles.js, weather-blend test; adjacent batch owns the opening.
- **NODE-DEBUGGING-2026-10-19, entire note:** Bryce's 2026-10-19 question prompted an unnamed research author; DEBUGGER-A and physics-1 supplied corroboration. Q1 covers vm URL forms, scriptId fallback, runner children, breakpoint overhead, coverage omission and opt-in preload prototype. Q2 maps debugger blind spots across shaders, wasm, audio, netplay, workers, frame loops, determinism and XR. Q3 ranks R1–R8; Sweep records 71 paired files; MCP status describes #2967; reproduction, full prototype appendix and external sources preserve derivation. Useful for debugger capability and measurement design. Limits: Node v22.22.0 snapshot, prototype explicitly uncommitted, future-version behavior requires remeasurement; issues are historical state. Backlinks: #2952, #2957, #2960–#2967, TESTING, DEBUG-HOOKS, game-vm and vm-script-cache.
- **OCCLUSION-PROBE, entire note:** unnamed cockpit investigation author; case study dated 2026-08-14. Sections 1–3 explain screenshot/near-plane/bbox traps, geometry and real-matrix capture, depth raster and named-part attribution. Section 4 records wheel clipping and chassis-cap occlusion, then the follow-up nose occlusion caused by the repair; section 5 identifies use cases. Useful for evidence-driven camera/geometry diagnosis. Limits: historical GLX hooks and vertex-count selectors, coarse raster and code sample are not current verified tooling; wheel acceptance did not establish nose acceptance. Backlinks: ARCHITECTURE, mcp-probe, AGENTS, car3d, game.js.
- **PACK-CACHE-CONTENT-ADDRESS-2026-10-25, entire note:** load-hunt L3 / cursor/load-hunt-a15c / #3704 producer lineage. Before/after describes md5 query URLs, SW cache-first valid hashes and network-first manifest/fallback; counted fetch results and material-hash side fix. SECOND section records reverted pine scalar experiment and negligible GC benefit. Useful for warm-cache request mechanism and avoiding a repeated negative optimization. Limits: explicitly not yet deploy at writing; fetch counts are not timing, pine VM results are circuit/sample bound. Backlinks: assets.js, sw.js, assets.mjs, pack-content-address test, nature.js.
- **PARALLEL-HUNT-2026-10-24, entire note:** Fleet A wave 34 lane A·H14, collaborating A·H15, A·H13 and renderer lanes. Sections 1–2 revisit isolation/iOS/worker/determinism constraints and existing levers. Section 3 ranks opportunities; section 4 records default-OFF strip-decode worker, byte equivalence, 1×/4× A/B and fallback; 4b records Rapier snapshot build/restore ratios and ball equivalence; section 5 proposes device verification/default change and full-world determinism follow-up. Useful for off-thread candidate prioritization. Limits: Chromium throttling is a phone proxy, no iPhone result, Rapier whole-world restore unverified, pipeline compile remains GPU-side. Backlinks: MULTITHREADING-PLAN-2026-09-16, BOOT-LOAD-TOOLING-RESEARCH, DEVICE-FARM-ANALYSIS, #1175, #3385, #3584, worker-pack-strip test.
- **PARALLEL-WORK, entire note:** unnamed session retrospective; no explicit date. Governing-fact section records 117 Chromium processes/load 50.7 and timeout-only false failures. Parallel/nonparallel sections separate read analysis from shared CPU costs; worktree section covers baseline comparisons, isolation, dependency/output caveats and cleanup; B0–B4 section applies it to component restructuring; sources cite worktree literature. Useful for understanding concurrency failure mechanisms. Limits: historical four-core box and old concurrency wording; current AGENTS is authoritative. Shell recipes are provenance only. Backlinks: AGENTS, ARCHITECTURE-REVIEW, graph-parity, layout/menu/fit audits.
- **PERF-ALLOC-HUNT-2026-10-17, entire note:** perf-hunter lane / cursor/perf-alloc-hunt-5d2c / #2591. Method records sampled heap with collected objects, caller attribution and load dependence. Results separate HUD and collision-bucket site wins from overlapping whole-frame ranges; remaining-sites table gives owners and rejected numerical change; Not run names missing circuit/device/physics characterization evidence. Useful for per-site allocation prioritization and equivalence constraints. Limits: Monaco chase 22-car SwiftShader JS heap only, sampling and physics substep dependence, no GPU or GC-pause claim. Backlinks: TLX-PERF-HUNT-5-2026-10-16, hud-layout, collide, traffic-arc-buckets test.
- **PERF-FINDINGS, opening part only (0–26808):** unnamed four-way audit and follow-up sessions, dated measurements 2026-08-13 through 2026-08-15. Section 0 maps instruments, software-rendering timing limits and stable counts; baseline includes corrected boot-byte attribution and superseded debris self-time dismissal. Further subsections record work-count verification, ineffective GL cache, pairContact equivalence, environment-sensitive goldens, retired visual skip, API harness rot, cancellation caveat, producer wrapping for lamp fade, shadow yaw fix, VM timer/profiler distinction, negative emit rewrite and lighting-spec timeout/const-global/fixture/expect lessons. Section 1 compares claimed/measured/taken results; section 2 lists accepted shader/UI/audio/allocation changes and ends at the opening of the next dated round. Useful for measurement design and historical correction trails. Limits: remaining 288607 bytes not assigned/read; section 3 references are forward pointers, not evidence reviewed here; old rules/paths/counts are historical and sometimes explicitly superseded. Backlinks: CHROME-DEVTOOLS-MCP, profile-gameloop, gpu-census, frame-hitch, verify-track, track-build-vm, perf-governor, lighting-tuner-grade and test-solo.

## Evidence ledger

### NIGHT-MAST-POOLS-2026-10-05.md

Source: [NIGHT-MAST-POOLS-2026-10-05.md](../notes/NIGHT-MAST-POOLS-2026-10-05.md). Whole file: 6604 bytes; SHA-256 `6c79688c4f67c77c3bdaeb64e79b1760a45d3a0ecab60125aee898a54599db78`. Assigned part [3875,6604): 2729 bytes; SHA-256 `69c288ab88e86bbad92287bdf63381e00d367b8a154f42e9d1de0b9d6428d447`.

- Read chunk [3875,6604): SHA-256 `69c288ab88e86bbad92287bdf63381e00d367b8a154f42e9d1de0b9d6428d447`.

### NODE-DEBUGGING-2026-10-19.md

Source: [NODE-DEBUGGING-2026-10-19.md](../notes/NODE-DEBUGGING-2026-10-19.md). Whole file: 30507 bytes; SHA-256 `270d2d79e29219a9e37b46fa364d23671eeacf7340800ac1031bf71225422f94`. Assigned part [0,30507): 30507 bytes; SHA-256 `270d2d79e29219a9e37b46fa364d23671eeacf7340800ac1031bf71225422f94`.

- Read chunk [0,10000): SHA-256 `ce72af91dc44f6a27413188407b6ca0abfd754be5b6ec9535382d0557fd2b134`.
- Read chunk [10000,20000): SHA-256 `b40920f80973393a2a7bcb6ca0a4dc6716bd774c66c52cf42949d8a5252e72b0`.
- Read chunk [20000,30000): SHA-256 `d9dda50fe64004ca61952c4675c78b3523902aec69f41d802e8d4e16619a1494`.
- Read chunk [30000,30507): SHA-256 `efa32e4ab33215cea09149000250ab6731bb47815d2222235724a28035422c6e`.

### OCCLUSION-PROBE.md

Source: [OCCLUSION-PROBE.md](../notes/OCCLUSION-PROBE.md). Whole file: 11924 bytes; SHA-256 `d14b9ea21d467181dd281e7f1f2d3ecf8559b1d2e4e85445e6e59062d50dab64`. Assigned part [0,11924): 11924 bytes; SHA-256 `d14b9ea21d467181dd281e7f1f2d3ecf8559b1d2e4e85445e6e59062d50dab64`.

- Read chunk [0,10000): SHA-256 `86277fa46f84d6783a9ff63b042ef7a9fb6780eed870542f0a5dd683dcb43768`.
- Read chunk [10000,11924): SHA-256 `790b6c79c82087ae200f03e30a6909af230b02b449023a1740b26cd28b7f5aac`.

### PACK-CACHE-CONTENT-ADDRESS-2026-10-25.md

Source: [PACK-CACHE-CONTENT-ADDRESS-2026-10-25.md](../notes/PACK-CACHE-CONTENT-ADDRESS-2026-10-25.md). Whole file: 2176 bytes; SHA-256 `796dcbfecdf7ac1fd22ef67fd303f6844a90d8bbec0f67f0c8994777b14c1818`. Assigned part [0,2176): 2176 bytes; SHA-256 `796dcbfecdf7ac1fd22ef67fd303f6844a90d8bbec0f67f0c8994777b14c1818`.

- Read chunk [0,2176): SHA-256 `796dcbfecdf7ac1fd22ef67fd303f6844a90d8bbec0f67f0c8994777b14c1818`.

### PARALLEL-HUNT-2026-10-24.md

Source: [PARALLEL-HUNT-2026-10-24.md](../notes/PARALLEL-HUNT-2026-10-24.md). Whole file: 14379 bytes; SHA-256 `2fb16199a7a6679d3bb4ea8ba0108e5426d6766960fcc8c65cc073738e6d485a`. Assigned part [0,14379): 14379 bytes; SHA-256 `2fb16199a7a6679d3bb4ea8ba0108e5426d6766960fcc8c65cc073738e6d485a`.

- Read chunk [0,10000): SHA-256 `722da3125e55ca57ce4d027f17cefa54e0e57c0a9cd4d1731d57980566184691`.
- Read chunk [10000,14379): SHA-256 `05cb50b63566c17ff214e87ba2d0b6dc649d8ed65259790d880810fb11c727f1`.

### PARALLEL-WORK.md

Source: [PARALLEL-WORK.md](../notes/PARALLEL-WORK.md). Whole file: 7491 bytes; SHA-256 `95456357fd760b446953657fd1cbd8ffd7a0bd7e845bb603fc36c3426052e9da`. Assigned part [0,7491): 7491 bytes; SHA-256 `95456357fd760b446953657fd1cbd8ffd7a0bd7e845bb603fc36c3426052e9da`.

- Read chunk [0,7491): SHA-256 `95456357fd760b446953657fd1cbd8ffd7a0bd7e845bb603fc36c3426052e9da`.

### PERF-ALLOC-HUNT-2026-10-17.md

Source: [PERF-ALLOC-HUNT-2026-10-17.md](../notes/PERF-ALLOC-HUNT-2026-10-17.md). Whole file: 3986 bytes; SHA-256 `e87eb3ecc196515d671195155ce18ffd552902d4938f70ec2d8190a3b5fac07e`. Assigned part [0,3986): 3986 bytes; SHA-256 `e87eb3ecc196515d671195155ce18ffd552902d4938f70ec2d8190a3b5fac07e`.

- Read chunk [0,3986): SHA-256 `e87eb3ecc196515d671195155ce18ffd552902d4938f70ec2d8190a3b5fac07e`.

### PERF-FINDINGS.md

Source: [PERF-FINDINGS.md](../notes/PERF-FINDINGS.md). Whole file: 315415 bytes; SHA-256 `42609863766b91d5e8e4358bdb2a8c8abc0e001b057a739ad441af28f26c0cdb`. Assigned part [0,26808): 26808 bytes; SHA-256 `17d954b88a9d39092a846d7872937aa817546bb86244edc4cc816562ea3c3308`.

- Read chunk [0,10000): SHA-256 `12cfd4d503201ca806d3555ed77be56409167d5ea7360f2a11361052f2956556`.
- Read chunk [10000,20000): SHA-256 `b35fa3d4f5fed6af23fd06d8ca160444efaceecce1bd66e81efda79d7eaa4867`.
- Read chunk [20000,26808): SHA-256 `bd0873531c100f2af063064efebe8f7a19eff3accb8f2a8e9978f4b2f54c7327`.

