# Unit batch 42 — complete semantic map

Read-only mapping of all 14 assigned files (4,134 lines), 166 test declarations including two parameterized nested declarations. Source was read in individual untruncated pages of at most 100 lines; no tests, browser, commits, or production edits were performed. A declaration inside a loop represents every loop expansion, not one runtime case. Assertions nested in a subtest appear in its parent span list as well. `t.after`/before/after cleanup is fixture behavior, not a test result.

## Production targets and navigation evidence

JavaScript owners were located with attached apex-lsp definitions/outlines (RadioVoice, RadioLines, RainCells, WeatherArc, DataRealRace, RealRace, update and updateCar). `update` is ambiguous across five modules; the relevant definition is game.js:4460. G.gripMult resolves to the GameCtx contract at types/game-ctx.d.ts:709; its implementation is game.js:639. Function ranges below were checked against source/AST; tooling ESM imports are explicit paths. Target keys in case rows mean these concrete ranges, narrowed by the named operation.

| Key | Owner and ranges |
|---|---|
| S | js/game.js:4430–4444 stable ranking; 4589–4641 running/parked buffers, snapshots and collisions; 4820–6530 updateCar and parts. |
| D | js/race/race-radio.js:59–68 durFor; js/audio/radio-voice.js:234–282 plan/card sizing; js/race/announce-banner.js:51–101 card/voice integration. |
| L | js/race/radio-lines.js:27–134 pools, 136–144 fill, 169–243 seeded anti-repeat/peek/commit. |
| V | js/audio/radio-voice.js:15–111 channel/default constants; 127–153 tune/normalization; 188–224 band/squelch plans; 234–298 planner/sizing/inert; 300–997 instance. Instance: 367–487 squelch ownership/pool; 524–529 owned cancellation; 531–581 tune/voice choice; 632–654 halt/stop; 655–784 say/pack/synth; 804–812 unlock; 881–912 preview. |
| W | js/race/rain-cells.js:40–53 plan, 55–79 coverage/strength, 82–129 flips/lag, 135–166 sample/sectors; js/race/weather-arc.js:176–200 changeable lifecycle, 248–383 local views/lag/sector picture, 430–515 arc/tick/frame; js/game.js:638–639 mean/tread/local grip. |
| R | tools/check/ratchets.mjs:62–122 metric registries; 155–204 pin shapes; 264–338 mode/entry/slack; 364–389 fragments/load; 412–485 changed scope/write/fold; 488–548 measure/relative verdict; 558–666 update/auto raise; 671–825 base diff/comparison; 827–839 seed; 841 onward CLI. |
| H | tools/hooks/ratchet-reason.mjs:20–44 trailer/bounds/message; tools/check/ratchets.mjs:629–666 auto raise and CLI default absorb routing. |
| F | tools/check/ratchets.mjs:452–485 absolute write/fold/history references; .github/workflows/ratchets-fold.yml daily bot-branch/PR/CI contract. |
| G | tools/ci/ready-gate.mjs:45–85 newest/guards; 87–137 SHA/local stamp; 139–200 PR shape/resolve; 202–232 judge/output; 234–305 Plan/memory; 309–322 stamp; 328 onward CLI. tools/lib/work-tree-id.mjs:28–65 working/commit tree IDs. |
| B | js/data/real-race-tab.js:56–256 identity/build; 287–463 passes/boards/book/weather; 466–495 raw download/purge; 501–571 IndexedDB/LRU; 573–677 packing/coverage/fetch; 679–712 script cache; 714–1181 controller/rendering. Controller: 729–745 cancel/script; 759–802 load; 840–913 replay/refresh; 916–945 launch/WATCH; 947–982 pit duel; 986–1067 lap/board; 1070–1173 seats/paint/JUMP IN. js/data/hub.js:257–455 open/close/tab cache; 605–789 picker invalidation; js/race/real-race.js:92–112 cumulative timing, 406–442 stage, 484–494 stop. |

Cross-owner V source guards additionally target js/race/announce-banner.js:42–101 radio label/lead and 174 clear; js/audio/radio-fx.js:45–59 channel table and 171–193 sting; js/audio/panel.js spotter fold; js/game.js:4340 quit and 9249 pause, 2903 endRace reload reset; js/audio/engine.js running-context recovery and context/SFX exports; js/render/three/tlx.js context loss budget; js/garage/setup-camera.js dialog-aware Escape; js/audio/announcer.js voice ladder; js/audio/race-mix-audition.js generation-owned preview; js/audio/stub.js null title context. Ratchets ancillary guards read current removed-export owner modules and tests/specs/terrain-over-road.spec.js; they assert absence, not LSP reachability. Rain source guards also read tools/manifest.cjs and docs/PHYSICS.md.

## Fixtures and limits

- Common VM helpers: tests/helpers/seed-log.mjs seeds logging; tests/helpers/abs-src.mjs labels evaluated source; tests/helpers/game-source.mjs:49–83 derives the game-plus-created-module union and uniquely extracts declarations. Direct game.js readers remain narrower than that union.
- tools/lib/game-vm.cjs creates the inert DOM/game harness for snapshot, rank and rain VM files; Monza, fixed placement, headless stepping and explicit cleanup exercise real simulation without browser rendering. The snapshot getter negative control changes only fixture object behavior.
- Radio fixtures include synth call logs, empty/local/remote lists, Map-backed persistence, real short timers, deterministic timer Maps, delayed cancellation ends, synchronous speak ends, fake document/MutationObserver events, fake voice packs, context generations and recording WebAudio graphs. tests/unit/fake-audio-vm.cjs:1–36 records context/node creation and parameter state without decoding or output. Real engine integration loads mat4, tone-model, signal, soundtrack, radio-fx and engine in one VM; desktop/phone pool variants share that fake audio backend.
- Rain boot fixtures use Spa-sized 7,004 m geometry, two sector cuts, wet/dry lag constants, stub Career/Particles/GameAudio, seeded weather plans and controlled race time. Numeric reference uses independent 1 ms Euler integration; it is not a real circuit weather observation.
- Git/tooling fixtures use tests/helpers/git-fixture-env.mjs, artifact scratch repos, copied real ratchet/reason/merge tools, synthetic source and fragment/history files, deterministic branch graphs and explicit deletion cleanup. Synthetic module names, deliberately missing stamps, removed entries and unavailable refs in cases are fixture identities, not claims that those paths exist in this checkout.
- Ready gate uses fake GitHub check/file pages, injected receipts/sleep/tree resolver, actual PR template text and a scratch Git tree-ID fixture. No external PR is changed.
- Real-race fixture tests/fixtures/openf1-baku-2026-race.json is a single JSON line (203,289 bytes): session metadata, 22 drivers, 983 lap rows, 58 stints, 36 pits, 141 race-control messages, 14 weather samples, 22 classifications, 22 grid-position rows, 160 overtakes, 31 team-radio rows and five location excerpts. This group uses timing/build bodies, not the radio/location excerpts as replay geometry. rawBaku clones before mutation and adds meeting name. Team matching in the main loader is reduced fixture logic, whereas hub tests use explicit public fake-DOM routes. The shipped season calendar is extracted from js/career/season-cal.js; Tracks is a small eight-circuit table.
- WATCH fixtures generate dense/sparse/truncated/duplicate/invalid positions, deferred API promises and fake IndexedDB/localStorage stores. Coverage tests check time extents and sample sufficiency, and gap tests preserve interior gaps rather than fabricate coordinates. Gap refresh uses a synthetic three-driver script with an ordinary stale gap, pit gap and red-flag gap. All DOM fixtures model only touched methods; no layout, native browser activation, network service or audible quality is established.

## Source ledger

| Source | Fully read test ranges / SHA-256 |
|---|---|
| tests/unit/race-step-snap.test.mjs | 1–68; `9e737b911d83fe77dfd1fe13fe7954c5d73c6e77af5d8e0c127bc127d9c46b69` |
| tests/unit/radio-duration.test.mjs | 1–78; `ae0939862c8bef2915d777f57aa7e8838104ba126146cca12e159efff7ff5525` |
| tests/unit/radio-lines.test.mjs | 1–75; `73afca72ce3970c0299b98bd1d52fefca97ef585900eeffd9d928ac7e04d85f7` |
| tests/unit/radio-voice.test.mjs | 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–700, 701–800, 801–900, 901–1000, 1001–1100, 1101–1200, 1201–1300, 1301–1330; `9893e4ad2a0ad09412af5c24a6af1abd4b27e626f339e81256f526ee39b4cbfc` |
| tests/unit/rain-cells-vm.test.mjs | 1–70; `5295094f66049084e240377dd377621440b95f143f69c41328e9431127ef6213` |
| tests/unit/rain-cells.test.mjs | 1–100, 101–200, 201–231; `21893bee9694b70ab4369d8ec30eea7029a3cd892a54a4ad1831ea1062e4420f` |
| tests/unit/rank-sort-alloc-vm.test.mjs | 1–82; `7e7c6a2e3e8ea5b59006ca6a059663409c889d7e18d0857005826c6ee12c02d6` |
| tests/unit/ratchet-merge-hotspot.test.mjs | 1–100, 101–200, 201–235; `6d057e0cec9adc5dca0c245d062caad3223f2fb42f8b35b18bda0b1ce4b3f80c` |
| tests/unit/ratchet-reason.test.mjs | 1–33; `73ee369ac1a5de76ef115392f5a49bf05b30375faf27dd2bf3c294da5bf88402` |
| tests/unit/ratchets-fold-schedule.test.mjs | 1–68; `4d1151ba527576a54c5192cf2b0bbbe0963381197a8e7582a238e9535649fdca` |
| tests/unit/ratchets.test.mjs | 1–100, 101–200, 201–300, 301–398; `b330ef0070521404b5d1389494696d69d19d9d595b1f7e3585162f789e348a5d` |
| tests/unit/ready-gate.test.mjs | 1–100, 101–200, 201–224; `6494e0e8d92b2cd6a2a371a97b7b42abaec37fb569f091904a768e931b01bfa5` |
| tests/unit/real-race-script.test.mjs | 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–700, 701–800, 801–900, 901–1000, 1001–1015; `465e41286a602f6ab44855e1377c64e57e73c6c818f6897fb3d848f632213328` |
| tests/unit/real-race-tab-gap-refresh.test.mjs | 1–100, 101–200, 201–227; `c8fae8a473faf1c93c417abe4af7d5900f24525fc549cb99d1c6f90ede47f415` |

Fixture/helper and production snapshots (hashes bind this map to the inspected working tree; production ranges above are navigation evidence, not a claim of full production-file reading):

| Path | SHA-256 |
|---|---|
| tests/fixtures/openf1-baku-2026-race.json | `90733ce5cee211dd9fc470a883e802ce1a24cba3aa5768dbd17d3b8f7583df12` |
| tests/unit/fake-audio-vm.cjs | `bf3d952dddc793d791b722d55c1349d62e5a9e5b7987340086987356f94f7ec7` |
| tests/helpers/seed-log.mjs | `b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1` |
| tests/helpers/abs-src.mjs | `f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47` |
| tests/helpers/game-source.mjs | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
| tests/helpers/git-fixture-env.mjs | `4c1552f60e11920ca758fd7f913db6604ac90adcbd59437a694576f2e7f9cf82` |
| tools/lib/game-vm.cjs | `2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0` |
| tools/lib/work-tree-id.mjs | `d18032a182d084d12f15415aa8f18b1df7b4eeef8e1409c2f0444bc79304decf` |
| tools/check/ratchets.mjs | `07b89ad6faab17e1f3e93e5761022db26307b35c16d6c57b12875a6baaab2b73` |
| tools/hooks/ratchet-reason.mjs | `9488110b9b3f536f4138e80132c0c0184b9ed9d82d63f610e2ae7bf347e42ed5` |
| tools/check/merge-hygiene.mjs | `a02e1d53424c89c749c287f209fac9be2adbc7c9744f1c0ba27c64a27e5c0bab` |
| tools/check/tree-counts.mjs | `e7010e3cbfbfafd7838e2e5071991ad9c1cd7973142fff959eeb6fd4b9cae762` |
| tools/lib/css-source.mjs | `74cd73af69b01e54a727ccf09d7eb4b27f2611fdbeec02519ff5ab9741b5e25a` |
| tools/ci/ready-gate.mjs | `1e5f097b44a397ce5d0b1c60d23489a67e51732cd5754352f506a3759c3031b9` |
| .github/workflows/ratchets-fold.yml | `b0d4b23c5ea57bc6ffd37eed4e484483c3705cbfff13d45f9a78978da71fde6c` |
| .github/pull_request_template.md | `9b702489beb5b8b21a1d5baf2c106c7e5ae6ce828d2ae9c14be3416d4d48377b` |
| tests/data/ratchets.json | `b1c5a90b9b49cd0e37b68f307d189f62cfc932e2706034996e6f44ce85718cf6` |
| js/game.js | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| js/audio/radio-voice.js | `f8a98e7ab66d88105f2db793bea781da8ecfb49bfdc86fb2618e6a248248968a` |
| js/audio/radio-fx.js | `dbd267abfb3c9e9afee92757122a2b6abcb1b9b99fcaaa7ad06841ae97426c35` |
| js/audio/race-mix-audition.js | `4954a4f848219074cb351dce4c5b8e74c1c35b9c438b7ea24a1c7582e9c67b48` |
| js/audio/announcer.js | `19c82de159d84765d1ed8e65d2dc412a0276d18b37c8bbd2efc8cf2df545543f` |
| js/audio/engine.js | `4d3957e1c67cf8575b4cc452c2a06afe3336b5595633aa14ec1ae1a626a9aa71` |
| js/audio/stub.js | `e8ec8b7096ece9d6a174aefe1545c1bb74f59e8effc7047e9a9475d23ba70133` |
| js/audio/panel.js | `98827c14c630498887f5c1d64c0d7ffa931baafea8ab34341597b5e102e4704b` |
| js/race/radio-lines.js | `947f41fc4181ac09642c80056cef4fc9217a405c2572b4afe2850e77f13bd021` |
| js/race/race-radio.js | `0a2a4008e68347afffea98bc1b5de29e1dc459c0d98a2431576683535ce12196` |
| js/race/race-facts.js | `2b742656c2b681033316d33b94f49600a206ef93c941820824c1ae55e51a94c4` |
| js/race/announce-banner.js | `8ac250c9f99150e7acad993e88a5a2937b8070895cf677ace50d1f22568809eb` |
| js/race/rain-cells.js | `cd852c75a88704ff7abd3ca53ddd65016f2075633fa8cf3de3bb129e8bc2b675` |
| js/race/weather-arc.js | `f37f07774dd376bb19dfaa88c0894b099cb7b542b46caf8ebbd81f2370bc8b1f` |
| js/physics/tyre-model.js | `e106913104138c815ed086a6ba34753b3393770de166e1a80d3eb9404c98aea1` |
| js/physics/consts.js | `5b4ca20dff59b0139fa2e4bb531d092a54738274dcca666a40067cad42c005aa` |
| js/data/real-race-tab.js | `66a53dd8451e268658c52130ff44da3078fece6f16fe3aea1c6e50af7170a1d7` |
| js/data/hub.js | `7d040bfe1a4e6e1069adc523763efcc1716e870a60e01538c9b666872f7a6627` |
| js/data/teams.js | `6ff73b5e60b9d510d9a9d4a17129f1947811ce217fda0dc8c1ccf8b64fdfe838` |
| js/race/real-race.js | `1b3bada58c2751a5a2b53aca082f6626a209933a130616f3e9513e72a6e5cd11` |
| js/career/season-cal.js | `f7a455b7b37beeed3b796b8608569662ecbcabb157e5de342adf52de63b9163f` |
| js/render/three/tlx.js | `58669a10791324112e956d2b63adefd0c2b793147945a148d2eda447340922a2` |
| js/garage/setup-camera.js | `15edc407088a93398cfa04a8ec828867e956d2d832c1cfffafb2c94589843637` |
| tools/manifest.cjs | `bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb` |
| docs/PHYSICS.md | `17eaa6db7667488427de7a6be529f3f84c2741bd53bfe37f0bc573e7cfc41374` |
| index.html | `198787c00ff4055628ee7c524dff5453c5bc90ee6724948304d4f41d32499348` |
| tests/specs/terrain-over-road.spec.js | `fe9641792fb7e0509902552f04a37d76f38d39b8f1cdbf3174b95095c43e47d9` |

## tests/unit/race-step-snap.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| updateCar reads neighbours only through the snapshot (20–30) | 25, 27, 28, 29 | S | Neighbor pose reads stay frozen across updateCar helpers; lexical guard only. |
| two-car queue decision is invariant to update order by stable identity (58–63) | 60, 61, 62 | S | Identity-matched two-car output is order invariant after one Monza step; no broad field proof. |
| queue fixture detects the live-neighbour speed regression (65–68) | 67 | S | Getter-based live-speed negative control exposes order bias; fixture sensitivity only. |

## tests/unit/radio-duration.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| durFor and cardLifeS agree with js/game.js showAnnounce (52–59) | 56, 58 | D | Radio duration and banner life share the voice sizing policy; equation agreement, not real speech timing. |
| every phrasebook line fits its card when spoken (no truncation) (61–78) | 75, 76, 77 | D | Every nonempty phrasebook expansion fits its estimated card budget; synthetic longest values and estimator only. |

## tests/unit/radio-lines.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| every template fills every slot with longest plausible values (30–37) | 34 | L | All template slots accept the supplied long values; no natural-language quality check. |
| pick never repeats the same line back to back across 50 draws per pool (39–51) | 46, 47 | L | Seeded picks avoid adjacent repeats in multi-line pools over 50 draws; finite sample. |
| frequent pools have at least five variants (53–60) | 58 | L | Eight frequent pools have enough variants; count guard only. |
| a peeked pick counts as heard only once committed (refused cards must not burn variants) (62–75) | 68, 73 | L | Peeks vary without entering heard-memory; committing excludes the heard line; seeded sample. |

## tests/unit/radio-voice.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| no speechSynthesis: create() returns an inert instance and nothing throws (71–78) | 74, 75, 77 | V | Missing speech API returns inert callable shape; no browser platform exercised. |
| create() never reads the voice list — boot must not wait on a speech API (80–87) | 83–84, 85, 86 | V | Creation is synchronous and never probes voices; recorded API-call count. |
| plan refuses for exactly one reason at a time, and names it (91–100) | 92, 93, 94, 96, 97, 98, 99 | V | Policy returns named refusal reasons and permits countdown; synthetic options. |
| a line that cannot fit its card is REFUSED, never trimmed (102–117) | 109, 110, 114, 115, 116 | V | Oversize lines are refused whole and medium lines accelerate only within cap; estimator. |
| every ANN_PRI kind resolves to a speaker, and the map agrees with radioWho (121–136) | 127, 131, 132, 134 | V | Every parsed announcement kind has a speaker/prosody and matching label; source-scraped ANN_PRI. |
| speakable strips what the card shows and fixes what engines mispronounce (140–154) | 142, 143, 144, 145, 148, 151, 152, 153 | V | Normalization handles punctuation, units, positions and initialisms without spelling ordinary codes; listed strings. |
| no shipped radio line outlives its card (156–182) | 171, 180–181 | V | Scraped literal announcement calls fit estimated life except two named prose exceptions; dynamic/nonliteral calls excluded. |
| a preempt is cancel-then-speak-then-RESUME, which is the bug workaround (186–205) | 194, 195, 197, 202, 204 | V | Preemption performs deferred speech but synchronous owned cancel then resume workaround; stub sequence. |
| an empty voice list still speaks — that is the Safari path, not a refusal (207–216) | 212, 215 | V | Empty voice list still speaks using null system default; no Safari engine. |
| a REMOTE voice is never chosen — its lead-in is unbounded (218–226) | 225 | V | Remote engineer voice is excluded in favor of local voice; two-voice fixture. |
| a card that will not be spoken still ends the words of the card it replaced (228–240) | 233, 235, 237, 239 | V | Refused replacement still cancels old commentary; default channel settings fixture. |
| the setting round-trips, and turning it off stops a line in flight (242–257) | 245, 249, 250, 251, 252, 255, 256 | V | Disabling cancels, volume clamps, fresh store stays off without creation writes; store stub. |
| toneFor is the shipped default until a tune overrides it, per channel (273–282) | none (nested cases below) | V | Per-channel prosody defaults persist until explicit channel override; pure values. |
| a junk or out-of-range tune falls back rather than silencing a channel (284–298) | 291–292, 293–294, 297 | V | Junk/out-of-range tunes produce valid bounded fields; enumerated malformed values. |
| a tuned rate reaches plan, and the card budget still wins over it (300–312) | 302, 303, 304, 310–311 | V | Tuned rate/pitch reach planner but fitting budget can override/refuse slow preference; estimator. |
| the tune cannot reach a channel that does not exist (314–323) | none (nested cases below) | V | Unknown tune keys cannot alter valid channels and unknown speaker falls back to radio; pure map. |
| every channel has a preview line, and it survives speakable() (325–337) | 328, 330, 331–332, 336 | V | Each channel has a normalized preview sample and control sample expands penalty units; source data. |
| a tune round-trips through the store, per channel, and resets (346–366) | 349, 351, 352, 353, 355, 356, 360, 361, 363, 364, 365 | V | Tune store writes one channel, leaves others default and supports reset/unknown refusal; Map store. |
| a stored tune is read at create() and reaches the utterance (368–380) | 377, 378, 379 | V | Stored voice name and rate reach utterance; stub omits pitch recording. |
| a stored voice that is no longer installed falls back, it does not silence the channel (382–396) | 391, 394, 395 | V | Missing installed voice name falls back without suppressing speech; two local choices. |
| preview speaks the channel being tuned, with the TEAM RADIO switch either way (398–419) | 401, 403, 404, 416, 417–418 | V | Preview uses requested channel and works with team radio off while normal say remains off; direct preview stub. |
| master sound silences a preview — that switch means silence (421–426) | 425 | V | Master sound blocks preview; one mute condition. |
| a cancelled line's late end does not un-duck the line that replaced it (476–490) | 479, 481, 484, 486, 487–489 | V | Stale cancelled end cannot release replacement music duck; queued synthetic ends. |
| a cancelled line's late end does not disarm the replacement's hard stop (492–509) | 501, 506–508 | V | Stale cancelled end cannot clear replacement hard stop; real short timer without full browser events. |
| an engine that ends an utterance inside speak() releases ownership without a stale deadline (511–544) | 536, 538, 539, 540, 541–543 | V | Synchronous end inside speak clears ownership, timers and duck; deterministic timer map. |
| unlock() does not cancel the utterance that primes the engine (564–571) | 568–570 | V | Unlock primes without same-task cancel; call trace only. |
| unlock() primes with an audible-volume utterance, not a muted one (573–581) | 577, 578–580 | V | Priming utterance uses positive volume; audibility/unlock on iOS not verified. |
| LAZY_AUDIO: after the inert stub, create() re-primes on the next valid gesture only (583–637) | 620, 623, 626, 629–630, 633, 636 | V | Lazy binding waits for valid gesture, filters Escape and removes one-shot listeners after priming; fake document. |
| debug() separates what we asked for from what the engine started (648–678) | 667, 671, 672–674, 677 | V | Debug asked and started counters distinguish submission from onstart; synthetic begin event. |
| the settings preview counts too — it speaks directly, bypassing plan() (680–688) | 687 | V | Settings preview increments asked counter; no successful onstart required. |
| every channel the radio partitions into is a considered decision in the engine (690–710) | 699, 706–707, 709 | V | All speaker channels are either radio-effect entries or deliberate silent omissions; parsed table membership. |
| the sting is gated on the session, exactly as plan() is (712–723) | 717, 721, 722 | V | Cue and voice share session gate and cue lead; source shape guard. |
| waiting for the courtesy figure costs no shipped line its voice (725–763) | 736, 745, 746, 761, 762 | V | Actual parsed courtesy lengths do not newly refuse scraped literal messages; estimator and finite corpus. |
| a preempt during the cue cancels the line waiting behind it (765–794) | 789, 790, 793 | V | Stop during lead invalidates scheduled speech; deterministic live/cancelled task list. |
| quitting to the title ends the radio, not just the card (796–813) | 802–803, 804, 805, 811–812 | V | Quit clears queue, sting and all voice-pack channels; source union guard. |
| the radio never cancels speech that is not its own (the announcer shares the synth) (817–825) | 824 | V | Idle radio never globally cancels another synth owner; stub speaking flag. |
| a line's own preempt cancels synchronously, before anything else can start speaking (827–839) | 834, 838 | V | Owned stop cancels immediately before external same-task speech, with no delayed cancel; call trace. |
| the settings TEST sample is not cancelled a task later (841–851) | 847, 850 | V | Preview sample survives later task even when synth reports speaking; stub call ordering. |
| a line still waiting out its cue when the race ends is dropped, not read over the results (853–860) | 856, 859 | V | Delayed accepted line is dropped after race moves to results; real short timer. |
| the SPOTTER row lives in the TEAM RADIO section, and the folded summary shows its state (862–870) | 865, 866, 869 | V | Spotter row belongs once in radio section and folded state includes spotter; HTML/source slice. |
| hunt fixes: an 'interrupted' resume() never counts as recovered; TLX stops reloading after the fallback; Escape in the garage yields to a dialog (872–883) | 874, 876–877, 878, 880, 882 | V | Audio recovery, renderer reload budget and garage dialog Escape guards stay wired; unrelated lexical regression bundle. |
| the pause card and a hidden tab cut the SPOTTER channel too, not only the engineer's (885–909) | 903, 905, 908 | V | Pause observer and tab visibility halt every voice-pack channel; fake document/observer. |
| a rotate-block pause that re-hides the card in the same task still halts radio (920–972) | 947, 948, 949, 956, 965, 967, 968, 969, 970, 971 | V | Same-task rehidden pause still explicitly halts pack, sting and duck and clears busy; extracted pause audio block. |
| every message channel uses the same speaker for its HUD label and its voice (974–985) | 982, 984 | V | Explicit channel map aligns planner speaker and HUD label; source-union extracted function. |
| in-race commentary uses the announcer voice ladder while excluding network voices (987–998) | 995, 996 | V | Commentary chooses local announcer ladder voice with channel prosody despite stored remote preference; stub voices. |
| an audition owns its utterance: stop cancels it and an old callback cannot release its replacement (1000–1012) | 1005, 1007, 1009, 1010, 1011 | V | Preview owns utterance and old callback cannot release replacement; stop cancels only current preview. |
| squelchPlan puts a 40–80 ms burst at the start and end of an engineer line (1016–1026) | 1019, 1020, 1021, 1022, 1023, 1024–1025 | V | Engineer squelch opens/closes with bounded seeded burst durations; pure schedule. |
| squelchPlan is absent with TEAM RADIO off, vol 0, a pause, results, or a non-engineer channel (1028–1041) | 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1039, 1040 | V | Squelch refuses disabled/muted/paused/results/nonradio cases; mobile uses lite plan; synthetic options. |
| radioBand is a light 300–3400 Hz pair and is deterministic for a seed (1043–1051) | 1045, 1046, 1047, 1048, 1049, 1050 | V | Band-pass parameters repeat per seed and differ across two seeds within bounds; pure parameters. |
| an engineer say schedules open and close; a spotter cut kills the close (1053–1068) | 1056, 1059, 1060, 1061, 1062, 1063, 1064, 1066, 1067 | V | Engineer squelch schedules open/close and spotter yield cuts pending close; debug schedule, no sound quality. |
| TEAM RADIO off does not schedule a squelch — ENGINEER NORMAL cards stay as they were (1070–1077) | 1073, 1074, 1075–1076 | V | Team radio off arms no squelch; default store fixture. |
| a coach line is spoken but does not get a radio squelch (1079–1087) | 1082, 1085, 1086 | V | Coach speech remains free of engineer squelch; debug refusal reason. |
| squelch reuses a two-voice band-pass pool; a second line does not allocate new filters (1116–1131) | 1121, 1123, 1124, 1126, 1128, 1129, 1130 | V | Two reusable filter voices serve subsequent lines while one-shot sources increase; recording audio graph. |
| setting radio volume to zero stops its live squelch and cannot revive a stale close (1167–1204) | 1170, 1171, 1175, 1176, 1177, 1178, 1180, 1181, 1183, 1184, 1185, 1187, 1188, 1191, 1192, 1200–1201, 1202, 1203 | V | Mute cuts owned bursts, invalidates stale callbacks across replacements, preserves speech task/deadline and allows fresh line; deterministic clock. |
| mute invalidates squelch for accepted speech still waiting on its lead (1206–1217) | 1209, 1211, 1212–1213, 1214, 1215, 1216 | V | Mute invalidates delayed squelch generation even after unmute while legacy speech proceeds; deterministic clock. |
| selective focus follows actual audible synth start and rejects stale mute/context callbacks (1220–1238) | 1226, 1227, 1228, 1229, 1230, 1232, 1233, 1234, 1236, 1237 | V | Focus starts only with audible synth onstart and ignores stale mute/context/end callbacks; fake generation/holds. |
| race mix audition stops only the preview generation it started (1240–1259) | 1248, 1251, 1252, 1255, 1256, 1257, 1258 | V | Audition stop respects preview generation and cannot cancel later independent preview; fake timers. |
| `squelch rides GameAudio's context and SFX bus, one AudioContext (#2189, ${mobile ? "phone" : "desktop"})` (1297–1322) | 1299, 1300, 1302, 1303, 1313, 1316, 1317, 1318, 1319, 1320, 1321 | V | Desktop/phone real engine wiring uses one context and SFX destination with two/one pool voices; recording AudioContext. |
| the title stub exposes context() → null, and the squelch stays silent on it (#2189) (1325–1330) | 1328, 1329 | V | Title audio stub exports null context and null SFX bus; no actual audio. |

## tests/unit/rain-cells-vm.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| gripMult differs by s: the car in the shower has wet grip, the car outside it dry grip (32–43) | 35, 36, 37, 39, 41, 42 | W | Local slick/wet grip and sector publication follow car position; inert-DOM Monza VM. |
| treadFor reads the LAP-WEIGHTED wetness — a narrow shower keeps slicks the call, a wide one wants inters (45–58) | 49, 50, 52, 55, 56, 57 | W | Tread recommendation uses lap mean while grip uses local road; two synthetic widths. |
| with no cell every position reads the one global wetness (the default is unchanged) (60–70) | 66, 67, 69 | W | No cell retains uniform global grip and no sector picture; one arc time. |

## tests/unit/rain-cells.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| local rainfall has a soft fringe, wraps the lap and dissipates before the road dries (58–76) | 63, 65, 66, 68, 70, 72, 73, 75 | W | Wrap, fringe, fade and persistent wet road separate rainfall from surface lag; stub scene. |
| re-targeting a shower preserves the dry sectors and starts from the current cloud (78–91) | 83, 84, 86, 87, 89, 90 | W | Retargeting preserves dry road and blends from current local cloud; sampled times. |
| a local cell wets only its window (93–109) | 101, 102, 104, 106, 108 | W | Only covered window wets and publishes sector 2 with bounded lap mean; sampled positions. |
| segment wetness lags with the same τ — closed form vs a fine numeric integration through a DRIFTING cell (111–149) | 133, 140, 141, 147 | W | Closed-form drifting-cell wetness agrees with 1 ms Euler reference and exact drying/global ramp; selected segments/times. |
| a cell over the WHOLE lap reproduces the old global wetness (lap mean = wetAt) (151–168) | 161, 162, 166, 167 | W | Whole-lap cells match global wetness within settle tolerance; selected times. |
| the cell is deterministic per plan (and so per seed); a third of wetting plans go local (170–191) | 174, 181, 187, 188, 189, 190 | W | Plan hashing repeats and distributes local wetting cells with valid geometry; finite duration sweep. |
| startChangeable arms the plan's cell, a shower ends and the arc lets go (193–209) | 201, 202, 205, 206, 207, 208 | W | Changeable plan arms the deterministic cell and eventually returns to dry after its life; synthetic clock. |
| frame.wetness follows the CAMERA's position under a local shower (211–222) | 217, 220, 221 | W | Camera-position wetness follows the player under a stationary shower; no renderer output. |
| source guards: gripMult reads the surface at the car, tread advice the lap mean; manifest order (224–231) | 226, 227, 229, 230 | W | Integration source, manifest ordering and physics classification are present; lexical contract. |

## tests/unit/rank-sort-alloc-vm.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| a race step sorts and concatenates nothing from update() (56–59) | 58 | S | Direct update caller performs no builtin sort over 60 steps; stack-filtered call count, not heap measurement. |
| ranks match the stable built-in sort, step after step (61–68) | 66 | S | Every running car rank matches stable builtin reference over 40 steps; ordinary race fixture. |
| a car parked on the road: no concat per step, still collides as part of the field (70–82) | 76, 77, 80, 81 | S | Parked retired car remains excluded from ranks without direct concat calls; does not assert actual collision response. |

## tests/unit/ratchet-merge-hotspot.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| two PRs auto-raising the SAME module's ceiling merge clean, in either order (72–87) | 77, 80, 84, 86 | R | Same-module branch deltas merge and effective ceilings match merged source; one landing order actually executed. |
| PRs raising different modules, and a tip that LOWERED one, never share a hunk (89–107) | 106 | R | Different-module growth and tip extraction avoid ratchet conflict; scratch Git graph. |
| --fold sums the fragments into ratchets.json and deletes them, ceilings unchanged (109–121) | 115, 119, 120 | R | Fold deletes delta fragments while retaining effective ceilings; real CLI copy. |
| --update on a topic branch writes a ratchets.d delta and leaves ratchets.json alone (137–150) | 143, 145, 146, 148, 149 | R | Topic update writes only negative branch delta and leaves base bytes; scratch source. |
| two branches that each --update the SAME ceiling merge clean and sum (152–159) | 157, 158 | R | Two deliberate lowerings merge cleanly; does not inspect a landed summed verdict. |
| --update --absolute snaps ratchets.json in place; a detached HEAD does too (161–175) | 167, 168, 173, 174 | R | Explicit absolute update and detached update rewrite base ceiling without fragments; scratch Git. |
| two PRs raising the same TREE metric as fragments merge clean in either order, leaving ratchets.json alone (179–217) | 193–195, 196, 200, 201, 206, 208, 211, 213, 214, 216 | R | Tree metrics refuse automatic/unreasoned raises, accept reasoned deltas, merge and fold preserving sum; scratch bare-catch metric. |
| --update on a topic branch lowers only files the branch changed (221–235) | 233, 234 | R | Only branch-touched files receive lowering deltas; inherited headroom is excluded. |

## tests/unit/ratchet-reason.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| no trailer keeps the silent cap, so 21 lines are refused and a trailer of 'extract' allows them (11–23) | 12, 13, 14, 15, 16, 17, 19, 20, 21, 22 | H | Trailer presence selects silent/reasoned bounds and refuses growth beyond each; synthetic metric row. |
| the auto-raise CLI with no =N asks absorbLimit for the commit message (25–28) | 27 | H | Default CLI absorb routes through commit-message reader; source shape guard. |
| a shell with no hook env sees no commit message (30–33) | 31, 32 | H | Commit message defaults empty and honors injected env text; no hook process. |

## tests/unit/ratchets-fold-schedule.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| --fold --min-fragments=N does nothing below N and folds at N, ceilings unchanged (27–37) | 30, 31, 32, 33, 34, 35 | F | Fold threshold is inert below count and preserves sum at threshold; scratch fragments. |
| --fold rewrites CEILING-HISTORY paths to folded fragments so docs-integrity stays green (39–51) | 48, 49 | F | Fold replaces deleted-fragment history references with folded names; synthetic history prose. |
| the workflow is daily + dispatch, starts its own CI, pushes a bot branch to a PR, never the deploy branch (53–68) | 55, 56, 57, 58, 59, 61, 62–63, 64, 65, 66, 67 | F | Daily/dispatch workflow uses bot PR and CI dispatch with env-mediated input; YAML/source inspection only. |

## tests/unit/ratchets.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| every ratcheted metric is at or under its ceiling (27–42) | 35–38, 40–41 | R | Live effective metrics stay below ceilings with no missing files; read-only measurement, environment-relative pins. |
| no ceiling is left far above the value it guards (one slack rule) (44–60) | 55, 58–59 | R | Excess slack is fatal locally/PR and diagnostic elsewhere; live measured rows. |
| a LOOSE line names the rule the entry is held to: its own slack, or the default (62–72) | 67, 68, 71 | R | Loose diagnostics distinguish entry slack from default rule; doctored ceilings. |
| LOOSE is advisory on push / schedule / Pages events and fatal on a PR or locally; OVER is fatal everywhere (74–91) | 75, 76, 77, 78, 83, 84, 86, 87, 89, 90 | R | Event policy changes only loose verdicts while overage stays fatal; measured CSS count. |
| the data names only known metrics, and game.js carries the carve metrics (93–99) | 96, 97–98 | R | Metric keys are known and game facade carve metrics stay configured; data schema guard. |
| every declared tree metric actually resolves (101–115) | 111, 112, 114 | R | Every declared metric is callable and returns finite nonnegative count; no correctness oracle for each count. |
| the ratchet bites, in both directions (117–131) | 124, 125, 129, 130 | R | Doctored CSS ceilings force both over and loose failures; anti-vacuity. |
| an entry may tighten the slack rule, never widen it (133–140) | 137–139 | R | Entries may tighten slack but cannot widen its default; rejection path. |
| the commit hook's auto-raise absorbs small growth and blocks big growth (142–170) | 153, 154, 155, 163, 164, 165, 166, 168, 169 | R | Dry-run auto raise honors the per-file growth bound and writes nothing; synthetic ceiling on real tool source. |
| auto-raise absorbs only a per-file LINE count; a tree metric, slack 0 or another metric blocks with its reason (172–199) | 177, 179, 180, 181, 182, 183, 184, 185, 191, 192, 196, 197, 198 | R | Only ordinary per-file line metrics can auto raise; tree/exact/other/missing rows block, including mixed batch. |
| --base names every ceiling that moved, and only a raise past the hook's absorb fails (201–272) | 211, 212, 213, 214, 215, 216, 217, 218, 228, 229, 237, 238, 240–242, 243, 245–247, 248, 254–256, 257, 258, 264–266, 267, 270, 271 | R | Base diff classifies all changes, catches source growth, permits catch-up/advisory/history, and distinguishes missing ref; injected growth oracle. |
| 15-F10: --base blocks a loosened slack and a deleted entry whose file still exists (274–295) | 277, 280, 281, 283, 286, 290, 291, 293, 294 | R | Base comparison rejects slack loosening and removal of a live-file guard; synthetic current data. |
| baked data files are excluded from the size ratchet (#1659) (297–305) | 298, 302, 303, 304 | R | Excluded baked data drops from effective rows even with fragments; other deltas apply. |
| hunt-2 zero-ref exports stay deleted (#1673) (312–325) | 323–324 | R | Removed unused exports/DOM ids stay absent in seven source searches; absence is not semantic dead-code analysis. |
| terrain-over-road does not treat a missing gap as a pass (#1674) (327–331) | 329–330 | R | Terrain spec cannot accept missing gap as success; lexical negative guard. |
| ratchet data is validated: own keys only, finite numbers, a clear error (333–345) | 336, 337, 340, 341, 343, 344 | R | Own metric keys, finite ceilings/slack, nonnegative slack and nonnull entries are required; rejection fixtures. |
| applyFragments: a delta is matched on own keys and must be a finite number (347–355) | 351, 353, 354 | R | Fragment matching ignores inherited/unknown keys and rejects invalid deltas for real entries; synthetic objects. |
| pin counters: APEX_RATCHET_ABSOLUTE judges the tree alone, a named base judges this change's growth (2026-10-26) (357–372) | 359, 361, 362, 363, 370, 371 | R | Absolute mode overrides base; named base resolves SHA; missing base falls back and tight absolute pin fails; relative inherited pass is commentary, not asserted. |
| assertPinsAll counts every source-pin SHAPE, loop arrays element by element (audit4 E1) (374–398) | 385, 388, 389, 390, 392, 393, 395, 396, 397 | R | Pin-shape counter handles listed expression forms and regex-loop arrays, preserves old counter, and refuses reseeding/unknown seed; finite syntax samples. |

## tests/unit/ready-gate.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| guardsVerdict: the aggregator decides; its shards are the fallback when it was cancelled/skipped; a red or running shard blocks (25–35) | 26, 27, 28, 30, 31, 32, 33, 34 | G | Aggregator/shard priority refuses red or active evidence and requires recognized names; synthetic check runs. |
| newestByName: the newest attempt per name wins; a skipped run never hides a real result (#3862) (37–42) | 39, 40, 41 | G | Latest meaningful attempt wins and skipped attempts cannot mask verdict; synthetic timestamps/ids. |
| shaPrefixMatch: mutual prefixes of at least 7 hex (44–49) | 45, 46, 47, 48 | G | SHA matching requires mutual hex prefix length; four boundary samples. |
| localVerdict: a bare-sha stamp matches the tip by prefix; the suite log must say passed; a tree stamp must be the tip's tree and the log's run (61–77) | 72, 73, 74, 75 | G | Local stamp requires matching SHA/tree and final passed suite verdict; fixture files and injected tree resolver. |
| a tree stamp agrees with the tip once exactly the verified edits are committed (work-tree-id) (79–97) | 86, 89, 92, 94 | G | Dirty work-tree identity becomes committed tree identity and validates stamp; scratch Git. |
| evaluate: CI decides when it has; a pending/none CI falls back to a green local stamp; an API error with no stamp is exit 3 (99–119) | 103, 105, 107, 109, 111, 112, 116, 117 | G | CI final result wins, pending/API errors use local fallback, pagination failure fails closed; fake API. |
| planVerdict: ticked, struck, deferred and `land:` items close; unticked ones stay open; only the Plan section counts (123–134) | 124, 126, 127, 128, 129, 131, 133 | G | Only selected Plan section counts; terminal/deferred/comment rules and Cursor body selection; template fixture. |
| withPlan: an open Plan turns a green tip into plan-open (exit 1); no Plan warns; red and no-PR pass through (136–144) | 138, 139, 140, 141, 142, 143 | G | Open plan converts green to failure; missing plan warns, prior red stays red; pure wrapper. |
| memoryVerdict / withMemory: .claude/memory/ edits need `memory-change: <reason>` or the label; a missing file list fails closed (146–157) | 147, 148, 149, 150, 151, 152, 153, 154, 155, 156 | G | Memory edits require reason marker/label and file-list failures close gate; synthetic paths. |
| resolveSha --pr: head, body, labels, draft/state and the full file list (both rename paths); a short or failed list is filesError (170–182) | 173, 175, 176, 178, 179, 180, 181 | G | PR resolution gathers full file list, rename old paths and metadata, rejecting short/failed list; fake paginated API. |
| the PR shape: an open draft that is not conflicting; dirty refuses, unknown asks for a re-read, ready/closed have nothing to flip (184–191) | 185, 186, 187, 188, 189, 190 | G | Only open nonconflicting draft is eligible; verdict line carries full SHA; pure shape checks. |
| main --pr: green draft + closed Plan exits 0 and writes an ok receipt; each refusal exits 1 with a refused receipt; unknown re-reads; API error exits 3 (193–224) | 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 213, 214, 216, 217, 219, 220, 221, 222 | G | CLI writes success/refusal receipts, retries unknown mergeability, preserves API-error distinction and local-only behavior; injected API/sleep/receipt. |

## tests/unit/real-race-script.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| WATCH downloads cannot launch a replaced view and keep the seat selected when requested (76–95) | 86, 91, 92, 93 | B | Pending WATCH rejects detached/replaced view and snapshots requested seat; deferred positions. |
| WATCH can start after the followed driver's retirement while JUMP IN still protects its seat (97–113) | 106, 107, 108, 110, 111, 112 | B | WATCH may follow beyond retirement while JUMP IN clamps to last completed lap and stop clears pose ownership; staged director. |
| the 2026 Baku race builds into a 22-driver, 51-lap script with the pre-start grid (115–146) | 118, 119, 120, 121, 122, 123, 124, 125, 127, 128, 129, 130, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 144, 145 | B | Baku timing builds versioned complete 22-driver/51-lap script with correct grid, weather, teams, stints and pits; fixed recording. |
| retirements carry the lap they stopped on; a missing lap time ends the row (148–157) | 152, 153, 154, 155, 156 | B | Retirements carry last completed lap and null next duration; Baku fixture. |
| the race-control feed becomes safety-car windows on the leader's lap (159–179) | 162–165, 174–178 | B | SC/VSC/red messages become separate inclusive leader-lap windows; Baku plus mixed synthetic events. |
| the circuit resolves by name before country, and the weather and hour read off the session (181–205) | 183, 184, 185, 186, 187, 188, 192, 193, 194–195, 196–197, 198, 199, 200, 201, 202, 203, 204 | B | Circuit aliases/name/date/country precedence, local hour, weather share and earliest position grid are resolved; finite inputs. |
| a lapped finisher stays on the final lap board as '+N LAP'; a retirement stays OUT; fmtLap never prints :60 (209–233) | 220, 221, 224, 225, 226, 227, 228, 229, 230, 231, 232 | B | Lapped finishers remain classified with lap gap while retirements are OUT; lap formatting rounds before splitting. |
| rain by lap aligns the weather samples to the leader's lap windows; an unfinished race is not complete (235–256) | 242, 243, 249, 250, 255 | B | Weather samples align to leader lap windows and unfinished timing cannot be served from script cache; synthetic weather/Baku truncation. |
| the script cache round-trips through localStorage and rejects a stale shape (258–270) | 262, 265, 267, 269 | B | Complete current-version scripts round-trip, stale version/malformed JSON are rejected; Map localStorage. |
| the script cache keeps only the newest CACHE_MAX sessions, LRU by use (275–297) | 286, 288, 289, 290, 292, 294, 295, 296 | B | Cache caps at newest eight sessions, prunes legacy entries, promotes reads and preserves other settings; synthetic 200 writes. |
| WATCH launch failures keep cached and downloaded positions retryable in the open Hub (368–392) | 374, 376, 377, 378, 379, 380, 382, 384, 385, 386, 387, 388, 389 | B | WATCH launch refusal/throw leaves Hub open with usable positions and retry reuses download; four nested permutations. |
| `${cached ? "cached" : "downloaded"} positions, ${throws ? "throw" : "refusal"}` (370–390) | 374, 376, 377, 378, 379, 380, 382, 384, 385, 386, 387, 388, 389 | B | Nested cached/downloaded refusal/exception permutation; parent row specifies shared checks. |
| JUMP IN launch refusal and exception keep its entry point open for retry (394–406) | 398, 399, 400, 402, 403, 404 | B | JUMP IN refusal/throw leaves entry open, retries launch then closes without requesting positions; two nested permutations. |
| throws ? "throw" : "refusal" (395–405) | 398, 399, 400, 402, 403, 404 | B | Nested refusal/exception permutation; parent row specifies shared checks. |
| pending WATCH snapshots its seat, camera, session and lap before positions arrive (408–424) | 411, 413, 417, 419, 420, 421, 422, 423 | B | Pending WATCH captures seat/camera/session/lap/reel before positions resolve; deferred API. |
| cancel/reopen and session replacement discard stale WATCH completions (426–446) | 433, 435, 436, 438, 439, 445 | B | Cancel/reopen and new-session load suppress stale launches and stale trace installation; deferred API. |
| the hub cancels pending WATCH immediately when year or Grand Prix changes (448–471) | 463, 465, 469, 470 | B | Year/GP selection cancels pending WATCH before outstanding metadata settles; fake picker. |
| leaving and returning to WATCH rebuilds its cancelled controller while other tabs stay cached (519–537) | 522, 525, 527, 528, 530, 533, 535, 536 | B | Leaving WATCH invalidates controller DOM while schedule retains ordinary cache; Hub public tab route. |
| a WATCH load completing after leaving cannot repopulate its invalidated tab cache (539–552) | 545, 547, 548, 551 | B | Late cancelled WATCH load cannot repopulate invalidated tab cache or active panel; deferred loader. |
| the RACE IT tab: the entry list, DRIVE AS, the race lap by lap, and JUMP IN at any lap in any seat (554–695) | 599, 600, 601, 605, 607, 608, 609, 610, 612, 614, 616, 617, 618, 621, 623, 624, 625, 628, 630, 631, 632, 633, 634, 635, 638, 640, 641, 642, 643, 646, 652, 653, 658, 659, 663, 664, 667, 668, 670, 671, 672, 673, 674, 675, 676, 677, 681, 682, 683, 684, 685, 686, 687, 692, 693, 694 | B | Race tab requests race timing uncached, renders entry/lap boards and accessible controls, preserves descendant keyboard activation, launches selected seat/lap/distance and caches script; fake DOM/launch. |
| the passes, the lap board and the race book read straight off the real timing (697–736) | 702, 703, 705, 706, 707, 708, 710, 711, 713, 714, 715, 716, 717, 719, 720, 721, 722, 723, 724, 725, 726, 735 | B | Passes exclude retirement streaming and align timestamp/lap fractions; boards/book derive gaps/pits/flags/outs; raw cache purge stays session-specific; Baku fixture. |
| real position retries retain successful cars, report partial failures, and never mix race sessions (738–762) | 750, 751, 752, 755, 756, 757, 759, 761 | B | Partial position retries retain successful cars and stable progress, isolate sessions and reject all-failed downloads; fake API. |
| position caches refresh when race coverage grows, and never persist unfinished timing (764–803) | 785, 786, 790, 791, 792, 794, 796, 798, 802 | B | Position cache invalidates clock/window/completion/roster changes and skips unfinished persistence; fake IDB. |
| WATCH and JUMP IN reject stale in-memory coverage; reopening drops unfinished positions (805–825) | 816, 818, 819, 821, 823, 824 | B | WATCH refetches stale coverage, JUMP IN omits stale traces but captures usable incomplete traces before close; fake launch. |
| race scripts read lane_duration after OpenF1 removes pit_duration (828–835) | 834 | B | Pit timing prefers lane_duration and falls back to old pit_duration; modified fixture. |
| complete timing covers every classified distance, including retired and explicitly untimed laps (838–856) | 841, 844, 847, 850, 855 | B | Completion needs all classified distances, tolerates published untimed first lap and DNS, rejects winner-only/mid-lap placeholders; modified fixture. |
| empty and two-point location responses cannot become a complete replay cache (858–869) | 863, 865, 867, 868 | B | Empty/two-point positions cannot cache as complete; dense feed succeeds and DNS is exempt; generated rows. |
| reading an old trace cache refreshes recency before capacity eviction (872–897) | 894, 895, 896 | B | IDB reads refresh LRU without rewriting body and evict unread oldest; eight-record fake store. |
| session picker cancels owned WATCH requests before selecting and repainting (899–914) | 913 | B | Session picker cancels owned transport before updating selection and repainting; fake picker. |
| a dense winner cannot permanently cache a full-distance peer's sparse positions (917–927) | 924, 926 | B | Dense winner cannot hide sparse full-distance peer; retry requests only peer; generated positions. |
| positions accessible action follows LOAD and failed RETRY (929–938) | 932, 933, 936, 937 | B | LOAD action updates visible and accessible RETRY label on failure; fake DOM. |
| dense truncated WATCH windows remain retryable, including matching memory records (940–968) | 950, 954, 955, 959, 960, 966, 967 | B | Dense but truncated temporal coverage remains partial and repairs only affected car even with matching metadata; generated windows. |
| a matching complete IndexedDB record still needs actual per-driver temporal coverage (970–991) | 988, 990 | B | Matching complete IDB record still validates actual driver time span and redownloads corrupted clocks once; fake DB. |
| WATCH packing sorts valid positions and keeps the first valid duplicate timestamp (993–999) | 998 | B | Packing sorts valid coordinates, discards bad rows and keeps first valid duplicate timestamp; exact typed-array result. |
| SC ending notice keeps its inclusive lap but releases only at TRACK CLEAR (1001–1015) | 1010, 1011, 1012, 1013, 1014 | B | SC ending lap stays inclusive while exact release waits for TRACK CLEAR; dated synthetic messages. |

## tests/unit/real-race-tab-gap-refresh.test.mjs

| Case (declaration range) | Assertion spans | Target | Meaning / limits |
|---|---|---|---|
| explicit refresh replaces a stale interior gap and keeps pit and red-flag gaps (79–117) | 90, 92, 93, 94, 95, 98, 99, 103, 104, 105, 106, 107, 108, 109, 112, 115, 116 | B | Refresh bypasses every cache and replaces stale hole, retains genuine gaps, and preserves old recording on partial failure; mocked API/IDB. |
| the positions control offers refresh while WATCH stays available (138–182) | 171, 172, 173, 175, 176, 180, 181 | B | Saved gapped recording offers accessible refresh while WATCH remains enabled; fake DOM, no browser events/layout. |
| WATCH STOP DUEL follows a SEATED duellist, never an unseated one (186–227) | 217, 221, 226 | B | Pit-duel WATCH follows roster-seated participant even when first duellist lacks seat; mocked launch. |

## Shared helper assertions

These executable assertions sit outside case declarations and supplement the per-case spans:

| Helper assertion span | Consumers / meaning / limit |
|---|---|
| tests/unit/radio-voice.test.mjs:265–266 | sameTone compares pitch and rate across VM realms; used by default/override/unknown-channel cases (273–323). It does not compare voice identity. |
| tests/unit/radio-voice.test.mjs:1158 | squelchClock.advance bounds timer execution below 100 jobs to detect nonsettling fixture queues; supports mute/focus cases (1167–1238), not a production scheduling limit. |
| tests/unit/real-race-script.test.mjs:47 | realCalendar requires extraction of the shipped frozen REAL_2026 declaration before evaluating it; supports circuit date-window case (181–205), and is a lexical extraction precondition. |
| tests/unit/real-race-script.test.mjs:363 | launchRecoveryHarness requires the rendered replay status node; supports WATCH/JUMP IN recovery and accessible retry cases (368–406, 929–938), with fake DOM only. |

## Coverage boundary

Complete reading and semantic indexing covers the entire assigned group. This report records what assertions would establish, not a passing verdict. Lexical guards can fail after harmless refactors or miss equivalent behavior outside their scanned scope. VM speech/audio/DOM/IDB fixtures do not establish real platform behavior. Rank allocation checks count selected direct builtin calls rather than allocations; parked-car case does not assert collision impulse. The ratchet pin-mode test asserts absolute failure and mode selection but does not assert the relative inherited-overage success described in its comment. No execution was authorized for this mapping lane.
