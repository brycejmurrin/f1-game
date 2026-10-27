# Notes group 35 — renderer, track, tooling and UI provenance

Current AGENTS.md read. All 14 assigned parts (100,000 bytes) were read as individually returned, untruncated chunks of at most 9,000 bytes. Half-open byte ranges identify exact coverage. Historical instructions were read as provenance only; no note commands, runtime, network, browser, tests, source edits or commit were performed.

## [TLX-PERF-PLAN.md](../notes/TLX-PERF-PLAN.md)

Date / producer: 2026-09-24 onward results; author unnamed.
Whole source: 15090 bytes; SHA-256 `927215063a591b04b818dd93a64141645dccd402d74078e7bd4138ea82af6b5c`; manifest match: true.
Assigned [6458, 15090): 8632 bytes; part SHA-256 `c8694e69cf6dd4379ef34d441a304a4786b8349ec9c89570838d5faba23d4a5a`.

Read chunks:

- [6458, 15090): `c8694e69cf6dd4379ef34d441a304a4786b8349ec9c89570838d5faba23d4a5a`

Topics / findings: TLX night lamp caching, reduced godray blur, pooled records and packed material uniforms. L0/L1 saved lamp CPU in software; Metal exposed a ~2 s WebGL getParameter stall, so static lamp copies became WebGPU-only.
Backlinks / producers: TLX renderer/shadow/post modules; vendor PATCHES §9; GPU census runs 289 and 36042931057.
Use / limits: Useful for backend-specific regression reasoning. No pre-L1 real-GPU baseline; allocation saving structural; WebGL pixels unverified. Starts mid-sentence; earlier plan is group 34.

## [TLX-PHONE-PASS-CENSUS-2026-10-23.md](../notes/TLX-PHONE-PASS-CENSUS-2026-10-23.md)

Date / producer: 2026-10-23; Fleet A Phone perf A·W41.
Whole source: 7440 bytes; SHA-256 `52d9894ee589c029dcb2158469883ba1fc19e8c4c4f312b1d4ecc5fa10581e2e`; manifest match: true.
Assigned [0, 7440): 7440 bytes; part SHA-256 `52d9894ee589c029dcb2158469883ba1fc19e8c4c4f312b1d4ecc5fa10581e2e`.

Read chunks:

- [0, 7440): `52d9894ee589c029dcb2158469883ba1fc19e8c4c4f312b1d4ecc5fa10581e2e`

Topics / findings: Phone pass census rejects index-only LOD for now: 92–122 draws, 137–262k whole-frame triangles; far instanced boxes dominate street circuits. Corrects earlier origin-based distance bands.
Backlinks / producers: Issues #2657/#2631; mesh-census tool/helpers/test; AWS Device Farm and PERF-KNOWN-WINS notes; MESH-CENSUS erratum.
Use / limits: Counts transfer across backend scene graphs, software times do not. Device timing was Monza; Vegas/Jeddah device evidence would reopen the decision.

## [TOOLING-CONSOLIDATION-2026-10-26.md](../notes/TOOLING-CONSOLIDATION-2026-10-26.md)

Date / producer: 2026-10-26; PR #3785 lane S6.
Whole source: 7378 bytes; SHA-256 `a1d0b2b0f5933a1e641ae1fa77289a100d63ec480cd871d722c7188f977ad225`; manifest match: true.
Assigned [0, 7378): 7378 bytes; part SHA-256 `a1d0b2b0f5933a1e641ae1fa77289a100d63ec480cd871d722c7188f977ad225`.

Read chunks:

- [0, 7378): `a1d0b2b0f5933a1e641ae1fa77289a100d63ec480cd871d722c7188f977ad225`

Topics / findings: Consolidates GitHub REST retry/ETag client and PR snapshots; reduces queue queries; centralizes changed-file reads; removes generated tooling-fast list; records merge cures, dead probes and fleet bookkeeping.
Backlinks / producers: System audit §7; GitHub REST best practices and RFC 9111; github-api/pr-snapshot/changed-files modules.
Use / limits: Decision provenance for tool ownership and caching. Request savings are code counts, not live measurements; fleet/bus conventions may be superseded.

## [TOUCH-BOOST-FIRST-PRESS-2026-10-23.md](../notes/TOUCH-BOOST-FIRST-PRESS-2026-10-23.md)

Date / producer: 2026-10-23; Fleet A A·W15; PR #3611.
Whole source: 6233 bytes; SHA-256 `be0b208704c322bf42da0990e716274e2365c113f579cbbba651b87aa0bf91ab`; manifest match: true.
Assigned [0, 6233): 6233 bytes; part SHA-256 `be0b208704c322bf42da0990e716274e2365c113f579cbbba651b87aa0bf91ab`.

Read chunks:

- [0, 6233): `be0b208704c322bf42da0990e716274e2365c113f579cbbba651b87aa0bf91ab`

Topics / findings: First iPhone BOOST tap stalls 734–934 ms while later taps do not. Device event timing and helmet census isolate first ERS deploy doubleSided cockpit material missed by late warm. HUD warm attempt failed and was reverted.
Backlinks / producers: Renderer owner A·W14; car-draw rig FX; TLX late warm; devicefarm-iphone probe.
Use / limits: Cold-device cache effects matter. Suggested renderer warm fix is not proven applied here; local software cannot reproduce platform timing.

## [TRACK-ROSTER-RESEARCH-2026-09-14.md](../notes/TRACK-ROSTER-RESEARCH-2026-09-14.md)

Date / producer: 2026-09-14; author unnamed.
Whole source: 11461 bytes; SHA-256 `40695d06df3bcc48d5191680cf8d35901b108b9216363a0c5369fb2cb8ff4fad`; manifest match: true.
Assigned [0, 11461): 11461 bytes; part SHA-256 `40695d06df3bcc48d5191680cf8d35901b108b9216363a0c5369fb2cb8ff4fad`.

Read chunks:

- [0, 9000): `9ecc3d75cc191011533eecd19c86e729d477b140dde543bbef4ea3a816f269cc`
- [9000, 11461): `434d3d3852638c9daabe5f3d39c2a9c63eb31f21d5f3eb381b657dd1aacc4e5f`

Topics / findings: Roster gap research: exhausted 40-feature upstream; OSM stitching added eleven tracks; modern vs historic layout distinctions; Mosport singled out as next faithful import.
Backlinks / producers: tools/manifest.cjs; import-circuit-path and stitch-osm-ring; Wikipedia circuit list; Overpass/OSM.
Use / limits: Useful trace-source and layout provenance. Calendar and roster counts are dated, tables preserve pre-addition gaps; repeated section 6 headings.

## [TRACK-SWITCH-LEAKS-2026-10-02.md](../notes/TRACK-SWITCH-LEAKS-2026-10-02.md)

Date / producer: 2026-10-02; author unnamed.
Whole source: 4545 bytes; SHA-256 `5d87219f2c5807f9afde50fe3cbf081c9482e35498fb5edbf4f860388add77d6`; manifest match: true.
Assigned [0, 4545): 4545 bytes; part SHA-256 `5d87219f2c5807f9afde50fe3cbf081c9482e35498fb5edbf4f860388add77d6`.

Read chunks:

- [0, 4545): `5d87219f2c5807f9afde50fe3cbf081c9482e35498fb5edbf4f860388add77d6`

Topics / findings: Picker heap grew ~17 MB per pick despite stable geometry ledger: pooled Mesh RenderObjects retained old vertex arrays. Wrapper and shadow disposal plus cleanup made cycles plateau.
Backlinks / producers: TLX dropWrapper/releaseGeometry; chunked visibility scratch; gfx-backend-canary test.
Use / limits: Distinguish ledger from retained heap. Software picker path measured; GLX race-switch path flat; session-only harness is not durable evidence.

## [TRACK-SWITCH-METAL-2026-10-17.md](../notes/TRACK-SWITCH-METAL-2026-10-17.md)

Date / producer: 2026-10-17; author unnamed.
Whole source: 5491 bytes; SHA-256 `5c5184451d77c510fdea4eff241850c33553de298aab544576234598c38e876c`; manifest match: true.
Assigned [0, 5491): 5491 bytes; part SHA-256 `5c5184451d77c510fdea4eff241850c33553de298aab544576234598c38e876c`.

Read chunks:

- [0, 5491): `5c5184451d77c510fdea4eff241850c33553de298aab544576234598c38e876c`

Topics / findings: Metal memory test flake is bounded first-revisit ~13–17 MB step, not sustained old-world retention. Five-visit diagnostic contrasts constant caches and one alive track against #773.
Backlinks / producers: track-switch-memory spec; mem-census sustainedGrowthMB; #2604/#2634; diagnostic history 24359540.
Use / limits: Cause explicitly unnamed. Proposed spec policy NOT applied and follow-ups not done; does not authorize tolerance changes.

## [TRANSCRIPT-MINING-2026-10-16.md](../notes/TRANSCRIPT-MINING-2026-10-16.md)

Date / producer: 2026-10-16; Opus orchestrator session_015NYY5os8qCWtYUJjRUXAUu, 11 Sonnet workers.
Whole source: 16182 bytes; SHA-256 `09303a54b4f32b4084880b619303f811b0f315136a2466691a3e79631056cfaf`; manifest match: true.
Assigned [0, 16182): 16182 bytes; part SHA-256 `09303a54b4f32b4084880b619303f811b0f315136a2466691a3e79631056cfaf`.

Read chunks:

- [0, 9000): `07ffd9836c17cf97d7f7d9d5238f40ed3fdea105ca899c6aecf4c0e93795ea31`
- [9000, 16182): `3a59b4d69cdce26a5a37cbf2938eb3ecba2f58d79852d920aba87b57aefe123b`

Topics / findings: Transcript research ranks quota parking, context cost, queue holds, stop-hook conflicts, wait loops, CI noise, duplicates and handoff gaps; separates stale findings and eleven proposals.
Backlinks / producers: Issue #2379 and #2380–#2388; verified against e50540f0; agent-fleet transcript method.
Use / limits: 122/318 sessions cover 73% spend and all 61 failed sessions; giant-session middles unread. Proposals and historical commands are not current policy.

## [TREE-BUDGET-2026-10-19.md](../notes/TREE-BUDGET-2026-10-19.md)

Date / producer: 2026-10-19; author unnamed.
Whole source: 3325 bytes; SHA-256 `b4df85d4c7874708dc60a238156b1de2b6e7f258a923c1378d2bdaee617cee41`; manifest match: true.
Assigned [0, 3325): 3325 bytes; part SHA-256 `b4df85d4c7874708dc60a238156b1de2b6e7f258a923c1378d2bdaee617cee41`.

Read chunks:

- [0, 3325): `b4df85d4c7874708dc60a238156b1de2b6e7f258a923c1378d2bdaee617cee41`

Topics / findings: Option B keeps baked trees inside measured procedural budgets: pine 45/22, broadleaf 51/25, palm 156/78 LOD caps; 1:1 placements, no baseline raise. AX26 v3 adds sway byte.
Backlinks / producers: Issue #1619; caps/bake tools; pack-assets writer and assets reader; models-life plan.
Use / limits: Measured post-strip means at 484d7ea10. No models or circuit swaps in this slice; remaining integration explicitly future.

## [TUMFTM-RACETRACK-DATABASE.md](../notes/TUMFTM-RACETRACK-DATABASE.md)

Date / producer: 2026-10-01; author unnamed.
Whole source: 3715 bytes; SHA-256 `50d76c55bff11bc914b78852327c946de4fa0cc9b0fac229d267fe1f45e5478d`; manifest match: true.
Assigned [0, 3715): 3715 bytes; part SHA-256 `50d76c55bff11bc914b78852327c946de4fa0cc9b0fac229d267fe1f45e5478d`.

Read chunks:

- [0, 3715): `50d76c55bff11bc914b78852327c946de4fa0cc9b0fac229d267fe1f45e5478d`

Topics / findings: TUMFTM converter produces attributed designer envelopes; 22/25 circuit overlap, three missing venues and Nürburgring layout difference. Racelines remain offline sidecars.
Backlinks / producers: TUMFTM/racetrack-database LGPL-3.0, OSM ODbL; tumftm converter/CLI/test; RACING-LINE-RESEARCH.
Use / limits: Synthetic tests only; full fetch/import/race and metre fidelity not verified. No upstream CSV or converted presets vendored; attribution obligations documented.

## [TYRE-SEVERITY-AUTHORING-2026-09-30.md](../notes/TYRE-SEVERITY-AUTHORING-2026-09-30.md)

Date / producer: 2026-09-30 with 2026-10-18 slice A update; strategy/career workstream.
Whole source: 5138 bytes; SHA-256 `bdd7259ec18ff6fba11dca244ea2843d36cd5085c32ce3696453e328acdfd011`; manifest match: true.
Assigned [0, 5138): 5138 bytes; part SHA-256 `bdd7259ec18ff6fba11dca244ea2843d36cd5085c32ce3696453e328acdfd011`.

Read chunks:

- [0, 5138): `bdd7259ec18ff6fba11dca244ea2843d36cd5085c32ce3696453e328acdfd011`

Topics / findings: Severity separates surface/ambient from layout force load; normalization 0.0493 s/lap clamped 0.4–2.0; seven anchors plus sourced calendar values and legacy proxies cover 52 circuits.
Backlinks / producers: Issue #1562; TYRE-STRATEGY-DESIGN §5.5; tyre-model unit gate; linked Pirelli/Chronicle sources.
Use / limits: Values mix measured rates and proxy bands; fleet mean ~1.04 dated. Wear-OFF identity remains intended; current source must corroborate.

## [UI-FIX-GREYOUT-2026-10-18.md](../notes/UI-FIX-GREYOUT-2026-10-18.md)

Date / producer: 2026-10-18; Bryce report, LE audit and fix-side author unnamed.
Whole source: 7279 bytes; SHA-256 `9a7b9aef0f94725f780419e612bccb3f882bfacf3b3c52034744a75a9bd5b83e`; manifest match: true.
Assigned [0, 7279): 7279 bytes; part SHA-256 `9a7b9aef0f94725f780419e612bccb3f882bfacf3b3c52034744a75a9bd5b83e`.

Read chunks:

- [0, 7279): `9a7b9aef0f94725f780419e612bccb3f882bfacf3b3c52034744a75a9bd5b83e`

Topics / findings: SettingDeps RULES preserves disabled values and explains inactive rows; EXPLAIN adds reasons for owner-disabled controls with described labels and mutation observation.
Backlinks / producers: PR #2857; #2843–#2853; setting-deps/setting-row; setting-deps unit test; UI audit on LE branch.
Use / limits: Useful dependency ownership and accessibility rationale. Livery excluded, duplicates and regrouping separate; later PR states not a present UI audit.

## [UPSTREAM-THREE-ISSUES.md](../notes/UPSTREAM-THREE-ISSUES.md)

Date / producer: 2026-09-22 plus 2026-10-24 drafts; author unnamed.
Whole source: 10761 bytes; SHA-256 `75b51267ef744a553275843caa178dca9ae7ad44fede3f5883e7303ba83c9161`; manifest match: true.
Assigned [0, 10761): 10761 bytes; part SHA-256 `75b51267ef744a553275843caa178dca9ae7ad44fede3f5883e7303ba83c9161`.

Read chunks:

- [0, 9000): `b32e3b7e81663224c62c9586c6624f9dce009628eb9d648710e415b2ce74676b`
- [9000, 10761): `de7f00b5e45f74f66aa417809fe34e169f58bc828e34562008b91badfa7b5827`

Topics / findings: Five upstream issue drafts: texture swizzle feature gate, Safari 8 KiB private WGSL vars, rAF yield fallback, single-sample store discard, RGB fragment alpha blending.
Backlinks / producers: vendor three patches IDs 1/4/5/17/18; mrdoob/three.js issue #30560; Chrome feature status.
Use / limits: Draft filing status is dated; no authorization to post. Version/dev claims and patch numbering require current corroboration; proposed APIs are not upstream guarantees.

## [VOICE-LAG-IPHONE-2026-10-01.md](../notes/VOICE-LAG-IPHONE-2026-10-01.md)

Date / producer: 2026-10-01; author unnamed.
Whole source: 4332 bytes; SHA-256 `b502482610f788185fecd3704c502d0723c26e15f5de9a5e159b970a0078106e`; manifest match: true.
Assigned [0, 2420): 2420 bytes; part SHA-256 `dbc097b25a2f702d7faa76a1e29810b52e14eb996a413c26faf760eac0a30e33`.

Read chunks:

- [0, 2420): `dbc097b25a2f702d7faa76a1e29810b52e14eb996a413c26faf760eac0a30e33`

Topics / findings: iPhone voice-lag report contrasts negligible local game voice overhead with absent local speech engine; clip coverage leaves most non-engineer channels on Safari synthesis, leading to recorded-channel fix description.
Backlinks / producers: RadioVoice debug synth/PACK_VOICE; Kokoro-82M Apache-2.0; Chromium bugs 374263394/40720649.
Use / limits: Assigned prefix ends mid coach row; cannot claim full fix or verification. Chromium without speech engine cannot measure iPhone platform cost.

## Path handling

Archived, obsolete and session-only raw paths are recorded separately in [notes-35-paths.json](notes-35-paths.json). Their appearance is provenance, not evidence they exist or remain operational.
