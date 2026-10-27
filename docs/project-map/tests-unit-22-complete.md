# Unit batch 22 — complete source map

Read-only semantic inventory, 2026-10-27. All 20 assigned test files (4,737 lines) were read in full; no tests, browser, live GPU, Git fixture or network requests were executed. This is a map of what assertions establish, not a passing-test report. Full test names and assertion spans below are anchored to SHA-256 ledger bytes. Generated families are one source row with explicit expansion values; nested tests have separate rows and parents overlap their children.

Navigation: read root AGENTS.md and .claude/skills/code-nav/SKILL.md. Shell apex-lsp outline successfully resolved Ghost, GhostShare, GfxEscalation, GfxDebug, GLXChunked, GripSteer, GpuTestRun, TrackMesh, PostCommon, SessionRecords, TitleFlow and GameResults; bounded source reads then inspected owners and test harnesses. Test/helper/tool text inspected directly. Source addresses below are repository-relative; numeric ranges denote inspected owner regions, not whole-file coverage. Fictional URL/track/file strings used as fixture data are descriptive examples, never asserted live references.

## Read/hash ledger

All test coverage intervals are inclusive. Initial oversized combined output was truncated; affected content was re-read in smaller bounded outputs, so truncated output is not the sole reading evidence.

| File | Full read range | SHA-256 |
|---|---|---|
| `tests/unit/gfx-debug-overlay.test.mjs` | 1–162 | `05531d3b964082695dc45345bf41a69abc2f0f8eb0a3254da06eed805f6feb3e` |
| `tests/unit/gfx-escalation.test.mjs` | 1–179 | `85d0c41109214330def916468f8e94d0b4b1d7b9847f2e935f85d0612983e9c1` |
| `tests/unit/ghost-share.test.mjs` | 1–830 | `8fd9014107867f1b06a26e1ff147dedfa7f6c89a7fd94003fa534a4fc54f6bc7` |
| `tests/unit/ghost.test.mjs` | 1–618 | `96017cbae3a269a43980fe7f008a37aca376a1e7fd9512c897ad8df7b9e7c550` |
| `tests/unit/git-fixture-env.test.mjs` | 1–141 | `82d54a5961dd1c9d9756ab1d797aba4737727d007724117eadc7cbe89b6377fa` |
| `tests/unit/github-api.test.mjs` | 1–100 | `2e618cb4edf7d9e05b631a2e93cd665cbb4fb75966b0e3a92a1f066bf75b2455` |
| `tests/unit/global-registry.test.mjs` | 1–299 | `3cf2300ec538f16bb02b5b704c9c5767be17ae400863bf9f056625f8825d4d6c` |
| `tests/unit/glx-failure-paths.test.mjs` | 1–115 | `2738d6a2ae08efc717ec2f0621cd582cba0bbe5159a270e476d48e363c8cec5f` |
| `tests/unit/glx-lamp-shadow-slot.test.mjs` | 1–161 | `5a7974d18d3ffcae606ce49914332557a1411e1e3b66e5c539bccd8cc2249553` |
| `tests/unit/glx-multidraw.test.mjs` | 1–286 | `3b9d7a636ac259c55493fb47cafd46090cc8050bcc4ca865c1afecbacb0b01e9` |
| `tests/unit/glx-occlusion.test.mjs` | 1–395 | `0b9d92f186a6f877ac1fe97821c5afa5bf031ae29d8ad7547ed2b63565e4d470` |
| `tests/unit/glx-output-target.test.mjs` | 1–132 | `ad214297175433640c6e2435bfe7b7d35ff661a782bdad7ee0949905f20dc3e6` |
| `tests/unit/glx-resize-hysteresis.test.mjs` | 1–63 | `d0b43e1ddeecbc4e11c6676a7f38f0fb93a7e13c93cd09c207d54f024a347834` |
| `tests/unit/glx-resource-balance.test.mjs` | 1–100 | `01429c05a06d2d35423af4e8b492d87e6648fb440f3761076ddd19557b393a81` |
| `tests/unit/godray-keep-nearest.test.mjs` | 1–105 | `4512861d45ebf92ee42e3408a44131fc8cb1478074cd50f58abc7ad5ed373cb9` |
| `tests/unit/gpu-allocation-estimator.test.mjs` | 1–73 | `cc27f343de8515ca7a78c5d7315842a3bead27e7953c0523435952ae0ea67d74` |
| `tests/unit/gpu-test-run.test.mjs` | 1–187 | `f244b174caa50201e363a83770499ad7422a5627aa406933779051549b0e4f91` |
| `tests/unit/grid-boxes.test.mjs` | 1–307 | `bec498365efeb6b4c2d24de9e2b7332981b82d1934fbd557e40a721d0edffaed` |
| `tests/unit/grip-steer.test.mjs` | 1–204 | `1cf04467cae46d85456658bd2e17d82b6c85d2058fac280b2f63784e0af7c74e` |
| `tests/unit/harness-display.test.mjs` | 1–280 | `192ea978d453d2d634d20bf37e1a7d095714155364f2de0fee9c069df953cc5e` |

## Case ledger

`A` lists assertion statement spans (including callback assertions); each row’s target is the owner listed directly above its table. Fixture/harness setup is shared by its section unless the meaning column names a specialized branch. Assertions inside shared helpers are explained in fixture prose; outer module assertions are noted there. The GripSteer module-presence assertion is at test line 24.

### gfx-debug-overlay.test.mjs

Target T: `js/perf/gfx-debug-overlay.js:28–289; tools/gfx/gpu-game-check.mjs; js/core/clipboard.js; tools/manifest.cjs; index.html`.

Fixture and limits: Source pins plus overlayText VM at 74–91 (two pixels 40/80), memory VM 113–128; no browser clipboard or GPU.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| gfx-debug is opt-in and silent otherwise (27–39) | 28–29, 30–31, 34–35, 37–38 | T | Opt-in registry/storage gates installation; two deferred install sites are structural counts. |
| gfx-debug reports the facts that separate the bug classes (41–51) | 45, 46, 47, 48, 49, 50 | T | Required diagnostics name error count/message, environment, backend refusal and canvas engine; presence only. |
| gfx-debug reads only existing hooks and guards every one (53–70) | 56–57, 58–59, 63–64, 68–69 | T | Bare-global guard and honest no-readback/unpainted labels; source shape only. |
| gfx-debug asks the backend whether it soft-presents before saying native (hunt 4 I6) (93–107) | 97, 98, 99, 101, 103, 104, 106 | T | Backend softPresent selects game or game-soft readback, computes mean 60/max 80 and labels unreadable/native honestly. |
| gfx-debug prints the memory line a crash report can paste (#1648) (109–130) | 110, 111, 112, 129 | T | 80 MiB heap and TLX object/geometry/texture counters plus tier/strike appear together in VM text. |
| gpu-game-check reports heap, three memory and an opt-in A-B-A switch (#1648) (132–141) | 134, 135, 136, 137, 138, 139, 140 | T | Capture tool exposes heap/TLX counts and memory-switch option/log; source presence, no A-B-A run. |
| gfx-debug can hand the reporter the text (143–149) | 144, 146, 147–148 | T | Copy routes through ApexClipboard with native and HTTP fallback source hooks; copying unexercised. |
| gfx-debug obeys the file conventions (151–162) | 152, 153, 154, 155, 157–158, 160–161 | T | Module header/global/export and roster/generated shell tag stay wired; no boot proof. |

### gfx-escalation.test.mjs

Target T: `js/perf/gfx-escalation.js:14–111; js/render/glx/glx.js:646–753; js/render/three/tlx.js loss handler; gameSource carve-outs`.

Fixture and limits: Real escalation VM with storage/window.name stubs (77–86); final family executes extracted real loss handlers with fake timers and hidden document (130–178).

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| onReloadBudgetExceeded prefers menu recovery while RaceEntryProfile is armed (15–33) | 31, 32 | T | Armed race entry invokes registered menu recovery once and avoids unavailable panel. |
| onReloadBudgetExceeded paints unavailable when race entry is not armed (35–51) | 50 | T | Unarmed budget exhaustion routes to supplied unavailable panel. |
| GLX dedupes repeated webglcontextlost before spending reload budget (53–56) | 55 | T | Repeated-loss latch exists before reload counting; structural pin. |
| game.js wires GfxEscalation to quitToMenuAfterCtxLost (58–63) | 60, 61, 62 | T | Game union registers menu recovery/soften and escalation never persists envProbeOff; structural wiring. |
| race-entry soften does not persist envProbeOff to storage (65–75) | 68, 69, 70, 71, 72, 73, 74 | T | Extracted soften uses session flag, software/environment options and scale 0.72 without persistent localStorage writes. |
| reload budget survives fresh documents (denied get=${getDenied}, set=${setDenied}) (89–97) | 93, 94, 95 | T | Four get/set-denial combinations preserve increasing 1–5 strikes across fresh documents and retain caller window name. |
| partial storage recovery and a clean race preserve the same recovery episode (100–118) | 102, 103, 105, 107, 108, 111, 113, 114, 116, 117 | T | Partial storage recovery cannot erase fallback; failed reset leaves durable zero marker; later clean reset removes both stores. |
| legacy whole-name marker migrates and clean reset preserves unrelated names (120–128) | 122, 124, 127 | T | Legacy owned whole-name marker migrates and reset preserves lookalike caller text. |
| ${backend} visible losses after boot stop reloading across denied-storage documents (133–178) | 138, 139, 161, 163, 164, 173, 174, 176, 177 | T | Both three/glx: six fresh documents dedupe duplicate visible events, stop at backend reload budget (3/2), route remaining to terminal; hidden loss reloads on return without strike. |

### ghost-share.test.mjs

Target T: `js/car/ghost-share.js:29–400; js/ui/title-flow.js:17–153; js/ui/results-sheet.js:521–751; js/race/session-records.js:22–135; js/ui/hud.js; tools/manifest.cjs`.

Fixture and limits: ghost-monza-short.json; portable VM 27–71 rejects localStorage access; trace 118–124; title consume extraction 20–25; observer/titleLink/queued harnesses 321–423; mini-dom results VM 533–589; lapContext 610–612. URLs example.test and imaginary-ring are synthetic inputs.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| APXG1 encode/decode round-trip preserves lap time and samples (73–89) | 76, 77, 78, 81, 82, 83, 84, 85, 86, 87, 88 | T | APXG1 code/link round-trip retains time, track/context/day and array lengths; not per-sample equality. |
| plain APXG1 fallback round-trips when stream compression is unavailable (91–97) | 94, 95, 96 | T | Missing stream compression chooses plain mode and decodes successfully. |
| corrupt APXG1 payload is refused without throwing (99–105) | 101–104 | T | Malformed compressed payload returns structured corrupt result rather than throwing. |
| a ghost for an unknown circuit is refused (107–115) | 110, 111–114 | T | Sender can export unknown synthetic circuit but receiver roster refuses it. |
| a long lap still shares: the LINK's copy is thinned to fit, the file keeps every sample (126–140) | 132, 133, 134, 135, 137, 138, 139 | T | 3500 samples/130 seconds: link thins below 14 KiB, keeps finish and at least eight samples; downloaded file retains every sample. |
| fragment sharing softly refuses what no thinning fits, while retaining a file export (142–155) | 151, 152, 153, 154 | T | 12000 dense samples exceed link thinning capacity: too-large response retains JSON download. |
| the downloaded file's own JSON text decodes as a ghost (157–165) | 161, 162, 163, 164 | T | File export text reimports with correct circuit/count; malformed JSON rejected. |
| guest install, replay interpolation, and clear stay in memory (167–179) | 170, 171, 172, 173, 174, 175, 177, 178 | T | Install/replay/timeAt/clear guest operate without localStorage access; interpolation checked by lower bounds. |
| a guest is inactive away from its shared circuit (181–187) | 184, 185, 186 | T | Guest stays in session slot but hasGuest/at are inactive on another current circuit. |
| consumeHash installs the guest and removes only #ghost (189–202) | 196, 197, 198, 199, 200, 201 | T | Successful consume installs once, removes only ghost parameter, preserves query/other fragment/history state and announces. |
| consumeHash clears a corrupt ghost fragment and reports the refusal (204–213) | 209, 210, 211, 212 | T | Corrupt fragment clears only ghost and announces refusal without guest. |
| consumeHash is a no-op when the fragment has no ghost (215–221) | 218, 219, 220 | T | Fragment without ghost has no history or notification side effects. |
| a replaced link survives the older decode without installing or announcing it (223–238) | 232, 233, 234, 235, 236, 237 | T | An older decode cannot install, announce or strip a replacement link; subsequent read installs newest circuit. |
| overlapping reads of the same link install and notify only once (240–251) | 247, 248, 249, 250 | T | Concurrent reads of same link select one completion with one announcement/history replacement. |
| starting a race during ghost decoding preserves the link until returning to the menu (253–281) | 270, 271, 272, 273, 274, 275, 277, 278, 279, 280 | T | Race beginning across await preserves link and session until later title consumption opens TT once. |
| a ghost link landing over a non-title layer waits, fragment intact, for the title (287–316) | 305, 306, 307, 308, 309, 312, 313, 314, 315 | T | Results/quali/loading/career/hidden-title layers preserve link and original session/flow; live title finally consumes. |
| a link held over the picker or a title layer lands on BACK to the title (321–357) | 344, 345, 346, 347, 352, 353, 354, 355 | T | Picker/settings deferral arms one observer watching overlay; simulated BACK retries once into TT. |
| queued Race navigation defers real ghost/setup links before the title DOM changes (425–457) | 435, 436, 438, 439, 440, 441, 442, 443, 445, 447, 448, 449, 451, 452, 453, 455 | T | Queued Race transition owns navigation while title DOM still visible: real ghost/setup links defer then apply once on BACK. |
| Settings opened during ghost decoding defers both valid and corrupt links until BACK (459–484) | 467, 468, 469, 470, 471, 472, 473, 474, 475, 476, 478, 479, 480, 481, 482 | T | Settings opened across decode preserves valid and corrupt ghost links silently; BACK installs or reports refusal once. |
| Settings opened while a share link is staged holds its setup and Garage until BACK (486–508) | 491, 497, 498, 499, 500, 502, 503, 504, 505, 506 | T | Settings across setup staging blocks garage/store/notice until BACK; valid setup writes once, corrupt only refuses, never starts TT. |
| BACK consumes the latest link once after overlapping decodes defer under Settings (510–531) | 520, 521, 522, 523, 524, 526, 527, 528, 529, 530 | T | Overlapping old/new decodes under Settings share one observer; BACK applies latest Spa link once. |
| time-trial results offer link, code, and file only for a shareable local ghost (591–600) | 593, 594, 597, 598, 599 | T | Local shareable ghost exposes link/code/download controls; absent ghost has none. Does not click the controls. |
| time-trial results identify a loaded guest as the rival ghost (602–608) | 606, 607 | T | Results label guest RIVAL GHOST and display unavailable-settings notice. |
| rival context compares actual weather, setup, model and controls independent of object key order (614–623) | 618, 620–621, 622 | T | Context stable ordering ignores object insertion order; changed weather/car/model/controls are named without mutating original. |
| older and partial ghost contexts never claim full compatibility (625–636) | 628, 631–632, 634–635 | T | Legacy/malformed/empty/deep contexts avoid full-match claim; partial current state explicitly names un-compared car/layout. |
| TT results keep the guest comparison visible beside its delta (638–642) | 641 | T | TT result text keeps mismatched car setup alongside rival delta; mini DOM only. |
| starting TT compares the built car once per rival and session configuration (644–667) | 658, 659, 662, 663, 666 | T | Session begin compares built-car context once per guest/config; weather change reannounces; off-circuit guest ignored. |
| Phase 1 wires sharing into load order, results, boot/hashchange, HUD, and world replay (669–695) | 676, 677, 678, 679, 680, 681, 686–688, 690–691, 692, 693, 694 | T | Load-order, results IDs, boot/hashchange, early race guard, quit retry, HUD/world guest preference exist structurally. |
| a link whose lap time does not match its own trace is refused (700–718) | 703–704, 706, 707, 710, 714, 717 | T | Claimed time must bind to trace; edited hash mismatch refused; hashless legacy trace accepted only when time still binds. Unkeyed hash is not authentication. |
| a thinned link keeps its time bound to the trace (720–729) | 724, 725, 727, 728 | T | 9000-sample Spa link thins yet retains bound 135-second finish and decodes. |
| a crafted ghost with absurd x, s, t or sample count is refused (CORRUPT) (735–757) | 740, 749, 750, 753, 755, 756 | T | Absurd lateral/distance/count/time payloads rejected with/without hash; ±60 lateral edge accepted. Family title mentions t, but mutations primarily x/s and combined long count/time. |
| s is bounded by the circuit's own length when the circuit declares one (759–768) | 765, 767 | T | Declared 5.8 km circuit allows three laps of arc exactly and rejects 1% above it. |
| shared ghost meta keeps only the whitelisted keys, strings <= 32 chars (770–784) | 777, 778, 779, 780, 781, 783 | T | Metadata whitelist keeps short scalar known fields, strips prototype/name/object/long string; same policy on export. |
| TT records find historical wear classes without crossing other settings (787–830) | 813, 814, 815, 816, 816, 817, 821, 822, 823, 825, 825, 829 | T | Historical TT real/light/off wear keys normalize into one class across ghost/input/board and new PB; weather still partitions, race-session wear remains distinct. |

### ghost.test.mjs

Target T: `js/car/ghost.js:55–408; js/core/store.js persistence adapter; js/game.js off-race/rebuild plumbing; symbolSource quit carve-out`.

Fixture and limits: createHarness 24–76 loads real GameStore/Ghost with Map disk, seeded Log/migration, controlled timers/idles/clock/lifecycle and quota errors; recordLap 452–457. Track/setup identifiers are synthetic.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| Ghost lap recording and playback basics (78–116) | 81, 82, 94, 95, 96, 100, 101, 102, 105, 106, 109, 110, 114, 115 | T | Records ten finite samples, selects PB and clamps/interpolates playback at start/middle/end/negative time. |
| Ghost drops a lap left open past MAX_LAP_S; the next lap records (120–133) | 123, 127, 128, 131, 132 | T | Recording beyond 600-second/sample cap drops lap and next ordinary lap records successfully. |
| Ghost.snapshot returns a defensive shareable copy of the current PB (135–150) | 143, 144, 145, 148, 149 | T | Snapshot copies arrays and metadata so caller mutation cannot alter playback/medal. |
| Ghost.timeAt(s) inverse lookup with bounds protection (152–172) | 163, 166, 167, 170, 171 | T | Inverse arc lookup interpolates interior and clamps exact/outside endpoints. |
| Ghost ignores non-beating laps (174–193) | 179, 180, 185, 186, 191, 192 | T | Slower lap preserves PB; faster lap replaces it. |
| Ghost clear and track switching (195–211) | 201, 204, 207, 210 | T | Track selection restores per-track ghost; exact clear removes it. |
| finishLap meta rides with the ghost lap, survives a reload, and a slower lap keeps it (213–232) | 218, 219, 220, 222, 223, 225, 226, 228, 230, 231 | T | Medal/pole follow winning lap across track reselection; slower lap keeps metadata and faster metadata-free lap clears it. No fresh VM reload here despite title. |
| a ghost store that is not a plain object starts empty and still saves (234–251) | 242, 245, 247, 248, 249 | T | Truthy primitive/array stored values recover to empty object and permit subsequent durable PB. |
| ghost persistence is capped by UTF-8 bytes and evicts the least-recently-used context (253–279) | 259, 268, 273, 275, 276, 277, 278 | T | 512 KiB UTF-8 budget evicts oldest untouched class, promotes selected oldest and keeps newest; generated traces exercise store policy, not valid real race times. |
| ghost quota failures flow through GameStore persistence health (281–288) | 286, 287 | T | Quota refusal keeps session PB and marks GameStore persistence health broken. |
| loading an inherited over-budget store trims it before other saves compete for quota (290–313) | 310, 311–312 | T | Inherited oversized store repairs in microtask after comparable-context selection, preserving selected class. |
| one oversized valid trace is thinned to fit instead of evicting its own personal best (315–334) | 323, 326, 328, 329, 330, 331, 332, 333 | T | Historical 40000-sample oversized trace thins to fit while preserving time, endpoints and matched arrays. |
| an invalid selected entry is discarded before valid ghosts during budget repair (336–350) | 348, 349 | T | Malformed preferred entry loses budget priority to valid history. |
| a pending PB rebases onto a foreign tab's newer ghost blob (352–377) | 367, 371, 375, 376 | T | Pending slower local PB rebases onto foreign faster PB while preserving unrelated circuit. |
| a foreign site-data clear cancels pending PBs instead of recreating the ghost blob (379–391) | 388, 390 | T | Foreign whole-site clear cancels pending writes and leaves disk absent. |
| clearing one ghost cancels its pending PB before a foreign merge (393–409) | 407, 408 | T | Exact clear cancels pending PB before foreign merge without erasing unrelated ghost. |
| clearing a track removes every context and pending write without prefix collisions (411–432) | 417, 424, 428, 429, 430–431 | T | Track-wide clear removes sibling contexts/pending writes without matching longer track prefix. |
| clearing an exact context key preserves sibling contexts and clears the selected ghost (434–450) | 440, 445, 448, 449 | T | Exact v2 context clear preserves sibling class and clears selected ghost. |
| refused idle and off-race saves remain retryable on a later ordinary flush (459–480) | 469, 470, 471, 477, 478 | T | Idle/explicit/timer refusals remain session-visible and retryable through ordinary flush after quota recovery. |
| manual SAVE RETRY persists a refused pose PB and leaves ordinary flush safe (482–491) | 487, 488, 490 | T | Manual GameStore retry durably saves refused PB; later flush/idle cannot corrupt it. |
| failed pose retries honor supersede, exact clear and foreign faster or clear controls (493–514) | 511–512 | T | Supersede/exact-clear/foreign-faster/foreign-clear control stale retry ownership; only correct faster record or deletion survives. |
| a new record is written in a LONG idle slot only, never a short mid-race one (516–528) | 519, 520, 521, 523, 524, 526, 527 | T | Short 8 ms idle slots requeue; long 40 ms slot persists PB exactly once. |
| a record waits for a long idle slot, but not forever: a 60 Hz loop never offers one (530–540) | 536, 539 | T | Repeated short idles prefer deferral until capped wait passes, then save despite short slot. |
| a record still pending when the page goes away is flushed on pagehide (542–550) | 547, 549 | T | Pagehide synchronously flushes pending PB. |
| the render loop never leaves a long idle slot: flush() and a HIDDEN tab write the record (552–569) | 559, 561, 568 | T | Explicit flush and hidden-document transition both persist PB even when rendering offers only short idles. |
| game.js flushes the ghost at its off-race moments (571–577) | 573, 575, 576 | T | Game source pins endRace/pause/quit flush ordering; does not execute navigation. |
| a same-circuit rebuild does not re-key the ghost (sameCircuit reads the id from BEFORE the reset) (579–594) | 587, 590, 591, 592, 593 | T | Normal and stepped track rebuild capture previous ID before reset, forwarding sameCircuit comparison; source-order proof only. |
| Ghost.record drops non-finite samples so a NaN frame cannot become the best lap (live debugger hunt C1) (596–609) | 604, 606, 607, 608 | T | NaN t/s/x samples are discarded while remaining trace and interpolation stay finite. |
| Ghost.finishLap refuses a trace that fails validation (611–618) | 616, 617 | T | Infinite lap claim fails validation and leaves no ghost. |

### git-fixture-env.test.mjs

Target T: `tests/helpers/git-fixture-env.mjs:27–74; .githooks/pre-commit; fixture-repo users under tests/unit and tests/helpers`.

Fixture and limits: decoyRepo 26–50 and child fixtureScript/runFixture 55–75 use throwaway Git repos; poison is deliberately pointed at decoy, never checkout.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| the helper's list is git's own, and the strip keeps everything else (77–87) | 79, 82, 85, 86 | T | Git own local-env list is covered; stripping drops repo/config payload names but keeps PATH/identity/editor; import scrubs process environment. |
| a hook's GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE: the fixture uses its own .git, the decoy is untouched (89–114) | 98, 99, 100, 106, 107, 108, 109, 110–111 | T | Negative control actually rewrites decoy through poisoned hook env; scrubbed hook/wide forms leave decoy bytes/refs/index intact and create independent two-commit feature repo including child tool. |
| every unit test that builds a fixture repo imports the helper first (118–134) | 132, 133 | T | Source scan finds at least ten repo-building test/helper users and requires first scrub import; heuristic detector can miss unusual spawn syntax. |
| .githooks/pre-commit runs test:guards with the repository-local variables unset (136–141) | 138, 139–140 | T | Pre-commit runs guard command in unset-local-env subshell after ratchet staging; structural ordering only. |

### github-api.test.mjs

Target T: `tools/ci/github-api.mjs:33–115`.

Fixture and limits: Injected run/env/sleep callbacks; no network or credentials consumed.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| api() reads past spawnSync's 1 MB default (ENOBUFS on 100 open PRs, 2026-10-14) (6–13) | 10, 12 | T | Curl maxBuffer permits large PR pages; native ENOBUFS named in error. |
| api() retries a transient 502 then returns JSON (W18f — shared curl door had no backoff) (15–27) | 24, 25, 26 | T | Transient 502 retries once using first delay and returns parsed JSON. |
| api() does not retry a permanent 404 (29–37) | 34, 35, 36 | T | 404 returns HTTP error with one call and no sleep. |
| api() with an ETag store sends If-None-Match and reuses the body on a 304; without one it never does (42–55) | 46, 47, 48, 50, 53, 54 | T | ETag store supplies conditional header/304 cached body, absent store omits header, bounded insertion eviction drops oldest. |
| request(): a JSON body and the token ride curl's stdin config, never argv; a 4xx keeps its status (57–68) | 61, 62, 63, 64, 66, 67 | T | PATCH payload/token stay off argv in stdin config; 422 preserves status/body and api wrapper returns HTTP error. |
| request(): full URLs pass through, anonymous GETs carry no -K, follow adds -L (70–81) | 71, 72, 76, 77, 78, 80 | T | URL construction, anonymous no-config GET, bad text JSON, absent-token hint and redirect flag are checked. |
| request(): a 429 is retried like a 5xx (83–89) | 87, 88 | T | 429 uses retry policy and returns subsequent JSON. |
| request(): a 429's Retry-After is honoured up to MAX_RETRY_AFTER_S, and a longer one is returned at once (91–100) | 95, 96, 99, 99, 99 | T | Retry-After 3 seconds overrides backoff; above cap returns 429 immediately with header duration. |

### global-registry.test.mjs

Target T: `tools/check/scan-globals.mjs:184–425; tools/manifest.cjs and manifest-listed runtime files; index.html/window reader table`.

Fixture and limits: One real scanRepo/buildGraph/checkGraph at 50–52; MULTI_GLOBAL 61–79, SHARED_GLOBALS 87–99, growable rules 108–120, externals 124–153, window readers 262–270. fixture-a/b are dictionary keys, not files.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| every manifest file parses (the scan itself is whole) (157–160) | 158, 159 | T | All manifest files parse and scan cardinality matches manifest. |
| one file, one global — every file eval-assigns exactly its declared global (162–178) | 175–177 | T | Every evaluated file assigns exactly one global except exact enumerated multi-global sets. |
| every global has one writer, except the declared accumulators (180–200) | 195–199 | T | Single writer default, frozen accumulator caps and growable writer-home restrictions prevent collisions. |
| eval-time reads resolve in load order (manifest FULL is a topological sort) (202–206) | 203–205 | T | No eval-time reads depend on later FULL provider; static graph only. |
| deferred-backend globals are never eval-read by tagged files (208–215) | 212–214 | T | Tagged files cannot eval-read globals provided solely by deferred backend. |
| call-time reads resolve to SOME manifest global, or a documented external (217–230) | 226–229 | T | Call-time externals require known host/global or documented per-file exception. |
| the unscannable window[<expr>] class stays extinct (241–247) | 243–246 | T | Unresolved dynamic window indexing remains absent except explicit site baseline. |
| positive control: an unscannable site is reported unless baselined (249–254) | 252, 253 | T | Synthetic unresolved site is reported and explicit baseline suppresses it, validating classifier. |
| every window.__* write has a named reader (no write-only probes) (272–299) | 292–293, 295, 297 | T | Window double-underscore assignment roster has separate named reader whose text contains name; textual reader is not proof of actual execution. |

### glx-failure-paths.test.mjs

Target T: `js/render/glx/glx.js:2393–2436,1222–1260,646–753; js/perf/gfx-escalation.js:14–43`.

Fixture and limits: bootGlx recording WebGL2 helper; identity/reflection matrices 13–51 and injected upload/draw/storage faults. No GPU.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| reflected draws correct facing with culling disabled and restore the following draw (15–38) | 26, 29, 30, 33, 34, 37 | T | Single reflected axis uses CW even when double-sided, restores CCW; following normal draw restores culling and double reflection adds no facing calls. |
| a throwing reflected draw restores counter-clockwise facing (40–51) | 44, 48, 49, 50 | T | Thrown reflected draw propagates fault but finally restores facing exactly once. |
| R2-GW-2: createTexture resets the UNPACK flags and deletes the texture when texImage2D throws (53–66) | 59, 63, 64, 65 | T | Throwing texImage2D returns no handle, resets both unpack flags and deletes created texture; permits null or propagated exception. |
| storage-denied context losses keep the two-reload budget across page boots (68–91) | 82, 84, 86, 87, 88, 89 | T | Denied storage across three boots retains window marker, only first two loss/restore cycles reload, exhausted episode records ring without full overlay. |
| GLX boot retains its retry marker until an explicit clean boundary (93–115) | 104, 106, 107, 109, 110, 111, 112, 113 | T | Boot callbacks preserve valid marker; explicit reset removes only owned suffix, clears storage and restores strike one, preserving unrelated/invalid names. |

### glx-lamp-shadow-slot.test.mjs

Target T: `js/render/glx/glx.js:357–371,811,1659–1988; js/render/glx/chunked.js:438–665`.

Fixture and limits: Source stripped comments and fnSource; synthetic eight-cell alternating lamp clusters (47–97); real chunker/light-budget/lamp-chunks/vertex-pack, fault on second upload; bootGlx uniform recorder.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| setLampShadowSlot uploads through ufI with begin()'s lampShadowIdx key (#3291) (30–39) | 33–34, 35–36, 37–38 | T | setLampShadowSlot and begin share ufI lampShadowIdx cache; raw bypass forbidden structurally. |
| drawChunkedBody restores the lamp-shadow slot in finally (#3291) (41–45) | 43–44 | T | Chunk body finally restores global slot structurally. |
| a throw mid per-chunk upload still restores the global lamp-shadow slot (#3291) (99–138) | 133, 134, 135, 136–137 | T | Injected second per-group upload fault propagates but last slot returns to global index 5. |
| begin() re-uploads uLampShadowIdx when lampIdx changes; same idx skips via ufI (#3291) (140–161) | 152, 155, 160 | T | Begin uploads index 2 once, skips unchanged value, then uploads changed index 0. |

### glx-multidraw.test.mjs

Target T: `js/render/glx/chunked.js:19–73,137–157,300–665; js/render/shared/light-budget.js; js/render/shared/lamp-chunks.js; js/render/shared/vertex-pack.js`.

Fixture and limits: Recording makeGL 33–64; real module loader 66–79, grid 83–95, covered byte oracle 99–103; lit loader/lamps/altGrid 175–250. No timing/GPU equivalence claim.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| multi-draw submits exactly the indices drawElements would (114–123) | 117, 118, 119, 120, 121–122 | T | Extension path submits same index-byte multiset as ordinary drawElements and issues no duplicate ordinary draws. |
| without the extension it silently stays on drawElements (125–132) | 128, 129, 130, 131 | T | Missing extension disables switch and fallback covers same bytes. |
| toggling it off returns the draw path to drawElements (134–147) | 144, 145, 146 | T | Toggling feature off returns to ordinary drawing with zero multidraw calls. |
| the lamp branch groups by light SET, not by neighbour (252–261) | 257, 258–259, 260 | T | Eight alternating chunks yield eight neighbour groups but two distinct lamp sets. |
| multi-draw issues one call per light set, not one per chunk (263–273) | 265, 266, 267, 268, 270–271, 272 | T | Two light sets produce two multi calls/two uploads carrying eight ranges; at least four ranges per call. |
| the lamp branch submits exactly what drawElements would, holes included (275–286) | 281, 282–283, 284, 285 | T | Two radially culled interior cells remain absent: six surviving chunks have identical byte coverage under plain/multi and still use two light-set calls. |

### glx-occlusion.test.mjs

Target T: `js/render/glx/chunked.js:201–298,425–436,713–828`.

Fixture and limits: makeGL/load/grid/setup 27–109 uses real chunker/vertex-pack, seeded frustum and mock query results; stateRecorder from tests/helpers/gl-state.mjs. Nested rows are explicit child cases; parent spans overlap by design.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| it ships OFF, and off means the draw path is untouched (111–121) | 113, 116, 118, 120 | T | Default disabled mode does no proxy draws and preserves draw count shape. |
| a query that says HIDDEN culls the chunk — and only after it has answered (123–137) | 128, 130, 135, 136 | T | Hidden query affects geometry only after issued/harvested response, with positive culled count. |
| query ownership is released on toggle and mesh free (139–157) | 145, 148, 154, 156 | T | Toggle deletes first query generation; free deletes next generation exactly. |
| query allocation failure remains fail-visible and never begins a null query (159–168) | 164, 167 | T | Null query allocation never reaches beginQuery and leaves chunks visible. |
| free removes a mesh queued for the next occlusion pass (170–177) | 176 | T | Freeing queued mesh prevents query allocation in later pass. |
| every way of not knowing resolves to VISIBLE (179–215) | 185, 189, 192, 196, 198, 210, 213 | T | Parent runs four fail-visible subcases below; its assertion spans include descendants. |
| a result that has not landed yet (180–186) | 185 | T | Pending-result fixture still draws; limitation: this subcase calls passes before any draw queues queries, so it does not prove an in-flight unavailable-result branch. |
| a program that will not link (187–193) | 189, 192 | T | Failed link reports unsupported and geometry remains visible. |
| a shader that will not compile (194–199) | 196, 198 | T | Failed compile reports unsupported and geometry remains visible. |
| turning the flag back off (200–214) | 210, 213 | T | After confirmed hidden state, disabling flag restores draws. |
| the occlusion pass hands the context back at LEQUAL (217–230) | 228–229 | T | Pass leaves baseline LEQUAL depth test required by sky; no sky pixels asserted. |
| the occlusion pass restores EVERY piece of context state it touched (232–272) | 270–271 | T | Recorded baseline program/color/depth/cull/blend state returns unchanged; recorder scope limits completeness claim. |
| occlusion setup releases shaders and owns only complete draw resources (275–296) | 287, 288, 289, 290, 291, 292, 293, 295 | T | Successful setup deletes two temporary shaders, retains one program/VAO/two buffers and reuses them on toggle. |
| each partial occlusion setup failure releases exactly its allocated handles (298–342) | 317, 327, 329, 330, 331, 333, 335, 337–338, 339 | T | Parent enumerates twelve allocation/compile/link/uniform/upload failures; nested case below owns assertions. |
| failure (301–340) | 317, 327, 329, 330, 331, 333, 335, 337–338, 339 | T | For program, vertex/fragment shader, vertex/fragment compile, link, uniform, VAO, vertex/index buffer and vertex/index upload failures: every allocated handle deleted once, VAO unbound, unsupported state latched, no reallocation/query on retry. |
| occlusion setup invalidates the core VAO cache after direct bindings (345–368) | 359, 361, 364, 365 | T | Parent covers successful and early-compile-failure VAO-cache invalidation. |
| compileFails ? "early compile failure" : "successful setup" (347–366) | 359, 361, 364, 365 | T | Both setup outcomes unbind raw VAO and force formerly cached mesh to bind once again. |
| proxy queries restore culling ${enabled} after a thrown draw (370–381) | 378, 379, 380, 380 | T | For initially enabled/disabled culling, thrown proxy draw propagates and restores exact prior cull state. |
| eye-inside and near-plane-crossing proxies reset stale hidden results (383–395) | 390, 394 | T | Eye-inside proxy becomes visible and near-plane-crossing proxies clear stale hidden flags. |

### glx-output-target.test.mjs

Target T: `js/render/glx/glx.js:140–156,1017–1076,1659–1988; js/render/glx/post.js; js/render/glx/shadow.js; js/render/glx/chunked.js`.

Fixture and limits: Four-file default framebuffer scan 30–43 and bootGlx; fake output FBO/viewport and forced framebuffer-incomplete direct path.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| every default-FB unbind is outputFBO() or a class-C reset marker (45–53) | 47–49, 51–52 | T | Exactly ten default-FBO unbind sites remain explicitly output-aware or marked reset-only; line-regex structural scope. |
| setOutputTarget routes the final pass (glx-mock present) (81–99) | 83, 84, 87, 91, 93–94, 96, 98 | T | Custom framebuffer and rectangle reach final present; no draws hit null; clear resets exposed state. |
| two clipped viewports do not clear each other on the direct path (101–123) | 108, 115, 116, 121, 122 | T | Forced post-disabled path scissors each eye rectangle before clear, protecting adjacent viewport at call level; no XR device/pixels. |
| setRenderSizeOverride changes getSize via resize (125–132) | 129, 130 | T | Render size override applies 512×256 through resize. |

### glx-resize-hysteresis.test.mjs

Target T: `js/render/glx/glx.js:1017–1076; js/render/glx/post.js target allocation`.

Fixture and limits: bootGlx, CSS/inner viewport helper 20–26, createFramebuffer oracle; forceMobileTier storage opts.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| a ±1 px CSS jitter does not rebuild the post targets (28–36) | 34, 35 | T | Alternating one-pixel CSS dimensions leave applied size and FBO allocation unchanged. |
| a real change (≥ 2 px) still rebuilds, once (38–48) | 43, 44, 47 | T | Two-pixel change reallocates and updates width; same size does not allocate again. |
| #3311 equal-pixel orientation swap does not rebuild post targets on mobile (50–63) | 55, 58, 59, 62 | T | Mobile square-cover allocation permits 800×400/400×800 transpose and back without new FBO while logical dimensions follow. |

### glx-resource-balance.test.mjs

Target T: `js/render/glx/glx.js:1017–1131,2702 onward; js/render/glx/chunked.js:300–423,820–828`.

Fixture and limits: bootGlx create-minus-delete counters for nine GL kinds; tri/three-bucket geometry 16–31, resizeRound 33–39; Uint16Array Proxy injection.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| repeated resizes allocate nothing once the lazy targets exist (41–47) | 46 | T | Warm resize rounds maintain live-object balance; does not assert literally no new allocations despite title. |
| createMesh/freeMesh returns every buffer and VAO (49–57) | 53, 54, 56 | T | Twenty meshes add exactly forty buffers/twenty VAOs and free back to full baseline. |
| a lost context creates nothing and frees nothing twice (59–67) | 64, 66 | T | Lost context refuses new mesh and freeing old mesh issues no duplicate native deletes. |
| healthy chunked mesh churn returns every buffer and VAO (69–79) | 73, 74, 75, 77 | T | Three chunked churn rounds each own two buffers/one VAO and return to baseline. |
| chunked index allocation failure in bucket ${failBucket} retires unpublished GPU handles (81–100) | 93, 94, 95, 96, 99 | T | First/third bucket typed-index failure propagates identical error, retires unpublished handles, unbinds raw VAO and invalidates prior cache for next draw. |

### godray-keep-nearest.test.mjs

Target T: `js/render/shared/post-common.js:77–99; aliases in js/render/webgpu/wgx.js, js/render/glx/post.js, js/render/three/tlx-post.js`.

Fixture and limits: Extracted keepNearest (27–39) and reused ten-object pool; edge table 84–93. Pure algorithm/source integration, no beams rendered.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| keep-nearest keeps the pool a permutation and selects the true top-k over moving frames (44–70) | 59, 60–61, 64–65, 67–68 | T | Five moving-eye frames select true nearest six while preserving all ten object identities and unique selected lamp offsets. |
| every backend aliases _grKeepNearest to the shared PostCommon.keepNearest (no private clone) (72–80) | 75–76, 77, 78 | T | Three backend source aliases use shared selector; private function/full list sort absent. |
| keepNearest edge: ${c.name} (95–104) | 100, 101, 102, 103 | T | Eight edges: k above/equal total, all ties, k one, empty total, zero k nonempty/empty, negative k; count and nearest distances match and object permutation/length preserved. |

### gpu-allocation-estimator.test.mjs

Target T: `tools/gfx/gpu-mem-census.mjs:75–148 and nativeFailure/report verdict block`.

Fixture and limits: Extracted real installWrap against class GL stubs 6–16; shared registry/WeakRef; verdict snippet VM 66–73. Requested allocation estimates, not physical VRAM.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| requested allocation arithmetic handles array mips, float uploads and exact nonsquare chains (17–23) | 19, 20, 21, 22 | T | Arithmetic covers array mip chain 336 bytes, float upload 64, nonsquare mip 28 and replacement 52. |
| bindings isolate contexts, active texture units and cube faces (24–32) | 29, 29, 29, 31 | T | Context/unit isolation assigns correct 16/64/4 bytes and six cube faces aggregate 96. |
| zero samples, buffer subranges and large sizes retain allocation bytes (33–38) | 34, 35, 36, 37 | T | Zero samples still one storage copy, typed subrange counts 16 bytes, >32-bit size preserved and delete removes buffer. |
| unknown formats remain visible and native errors reject accounting without swallowing errors (39–42) | 40, 41, 41, 41, 41 | T | Unknown formats explicitly recorded; native invalid-value allocation not counted and GL error remains readable once. |
| VAO element buffers and indexed generic buffer bindings retain ownership (44–52) | 49, 49, 50, 51 | T | Element binding follows VAO; indexed generic binding updates current uniform-buffer owner. |
| compressed replacements remove stale estimates and metadata exceptions remain observational (53–58) | 55, 56, 57 | T | Compressed replacement removes obsolete byte estimate; metadata getter faults do not change native observable call and are logged unknown. |
| lifecycle counts ignore failed and duplicate deletes through one native wrapper (60–64) | 62, 62, 62, 63, 63, 63 | T | Failed delete retains bytes/live count and error; subsequent successful/duplicate delete counted once. |
| measurement outcome separates stub coverage and rejects native failures (66–73) | 69, 69, 70, 71, 71, 72, 72 | T | Stub-link outcome is unverified but runnable; real success passes; failed/no links, native allocation failure or page errors fail correctness. |

### gpu-test-run.test.mjs

Target T: `js/perf/gpu-test-run.js:19–195; js/perf/bench-capture.js timer ownership`.

Fixture and limits: VM phase readers 11–14 and lifecycle 48–85: fake time/rAF, timer serial/age and SoakRun, real BenchCapture/GpuTestRun; no phone/GPU.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| gpu-test-run: the plan is default, the 0.5/0.75/1.0 sweep, mirror off, default again, under 3 min (16–22) | 18, 19, 20, 21 | T | Six fixed phases include half/three-quarter/full scale sweep and mirror-off then repeat, budget ≤180 seconds and initially inactive. |
| gpu-test-run phaseStats: nearest-rank percentiles, fps, share over 50 ms, GPU ms only when >= 0 (24–35) | 27, 28, 29, 30, 31, 32, 33, 34 | T | Nearest-rank frame/GPU quantiles, FPS and >50 ms share calculated; negative GPU readings ignored and empty GPU null. |
| gpu-test-run fillSlope: frame p50 against scale squared; flat when the frame is not fill-bound (37–45) | 41, 43, 44 | T | Regression on scale squared recovers 20 ms slope/10 ms intercept; flat slope zero, insufficient points null. |
| GPU TEST completion restores an enclosing BenchCapture timer (initially on=${initiallyOn}) (88–100) | 91, 92, 94, 95, 96, 99 | T | Initially off/on outer BenchCapture temporarily enables timer; inner completion preserves outer ownership and outer end restores original. |
| GPU TEST restores a prior enabled timer when ${outcome} (104–115) | 111, 113, 114 | T | Stopped/refused/rejected/synchronous-throw start restores previous enabled timer and inactive state. |
| GPU TEST safely restores standalone timer state (${JSON.stringify(config)}) (119–125) | 121, 123, 124 | T | Default/unsupported/query-throws standalone configurations complete safely restoring off state. |
| cancelled GPU TEST's late ${settle} start cannot finish a newer run (129–144) | 134, 135, 136, 139, 140, 141, 143 | T | Cancelled run late accepted/refused/rejected start cannot finish newer run or steal timer ownership. |
| GPU TEST counts new resolutions once, including equal-duration results, and excludes prior phases (148–169) | 160, 161, 162, 163, 164, 166, 167 | T | Fresh timer resolution serial counts once, equal-duration new serial counts independently, stale source timestamps/prior phases excluded and labeled. |
| GPU TEST labels ${mode} timing without counting cached readouts (172–186) | 183, 184–185 | T | Unsupported/inactive/missing-serial timing yields null GPU quantiles and explicit unavailable-state labels. |

### grid-boxes.test.mjs

Target T: `js/track/core/mesh.js:1198–1283; tools/lib/track-build-vm.cjs; tools/track/startline-probe.cjs; Tracks build/centerline`.

Fixture and limits: Real VM Monza/Monaco builds and captured startline buffer; slotQuads 57–72; all circuit centerlines in fleet case; four fake curvature/output CLI cases 271–307.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| every slot gets a box, appended to the start-line decal (77–89) | 81, 83–84, 87 | T | Default 22 slots append nonempty whole-quad grid tail while retaining startline geometry; count alone cannot identify each box. |
| a box measures 2.7 m wide by 5.0 m long, in 0.12 m paint (91–109) | 97–98, 99–100, 102–103, 104–105 | T | All Monza/Monaco front/side dimensions match 2.7×5 metres and 0.20 m paint within tolerances; test name stale at 0.12. |
| the yellow guide line clears the front line instead of z-fighting it (111–127) | 121–122, 123–124 | T | Guide/front midpoint gap exceeds paint width but stays below half metre, preventing geometric overlap. |
| the guide line reaches wider than the box, and stays on the tarmac (129–144) | 137, 138–139, 141 | T | Guide span exceeds box, stays ≤3.95 m and vertices finite; title claims on-tarmac but test does not directly check local road boundary. |
| the paint sits where the cars stand — the drift guard (146–174) | 164–165, 168–169, 170–171 | T | Shared gridSlot car point lies near box center, balanced laterally and near front line; distance tests approximate containment. |
| slots follow the real 8 m pitch, staggered, pole 14 m before the line (176–191) | 180–181, 182, 185–186, 187, 188 | T | Pole 14 m behind line; slots alternate sides with 8 m pitch and ≤3 m lateral offset. |
| the painted grid is as long as the field the track was built for (203–211) | 208–209 | T | Explicit 22/23/24/26 fields grow captured vertices by exactly sixteen per added slot. |
| a build with no field still paints the default, so tools and sweeps are unchanged (213–217) | 215–216 | T | Omitted field has same buffer length as explicit 22; not full byte comparison. |
| the extra boxes are real slots, on the grid, not degenerate quads (219–231) | 227, 229–230 | T | Extra box 22 has plausible 6–10 m pitch and similar width to box 21. |
| every grid slot of every circuit sits on a straight, or is allowlisted with a reason (245–268) | 255–256, 258, 260, 261, 266–267 | T | Every roster centerline grid span ~201 m is straight or has reasoned bounded allowance; ≥52 circuits, no unknown allow entries. Geometry metric, not visual adjudication. |
| startline CLI ${asJson ? "JSON" : "human"} preserves ${curvature ? "failure" : "success"} verdict (274–305) | 288, 293, 295, 297, 298, 299, 300, 301, 303 | T | Four CLI combinations: curvature zero/0.01 × human/JSON; success/failure exitCode and clean structured or human stdout survive without forced exit. |

### grip-steer.test.mjs

Target T: `js/physics/grip-steer.js:13–142; js/physics/player-forces.js; js/input/steer-tuning.js PRESETS; js/physics/tyre-model.js; js/physics/consts.js`.

Fixture and limits: Pure VM M4 clamp/lerp stub 16–24; final case loads actual consts/TyreModel; fixed bicycle states and smoothing iterations. No driven lap.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| source never names Tracks, curvature, or kCur (26–30) | 27, 28, 29 | T | Source excludes track/curvature identifiers; lexical guard does not establish all transitive data provenance. |
| assistK: notch 1 is OFF, 10 is full (32–38) | 33, 34, 35, 36, 37 | T | Slider notch 0/1 maps off, 10 full, intermediate response monotonic at sampled 6/8. |
| apply at k=0 is identity (characterization bit-identical path) (40–44) | 43 | T | Zero assist preserves exact demand value. |
| apply at rest / reverse is identity even when k>0 (46–50) | 48, 49 | T | Rest/reverse preserve demand despite full assist. |
| at speed with full lock demand, \|delta\| is capped near the front peak (52–69) | 66, 67–68 | T | After thirty steps full-lock speed demand settles below original near front-peak fallback bound. |
| normal cornering (βr opposite steer) stays on the peak-slip cap, not the tight countersteer blend (71–95) | 84, 93, 94 | T | Opposite-sign rear slip during ordinary hairpin retains >0.22 lock within 8% of driver after smoothing. |
| rear slide opens countersteer room (cap tracks same-sign s·βr) and preserves correction (97–126) | 110, 112, 113, 125 | T | Rear-slide countersteer retains direction, authority/floor and ≥95% modest corrective demand at notch eight. |
| VX_FLOOR matches the player-forces slip \|vx\| floor (4 m/s) (128–130) | 129 | T | Velocity slip floor is exactly four m/s; cross-module match described, only this constant asserted here. |
| forPlayer is identity at OFF and pools without changing the apply result (132–142) | 136, 140, 141 | T | forPlayer off is identity; enabled repeated outputs finite/bounded. Does not directly assert pool identity or equality to apply despite title. |
| PlayerForces hands GripSteer the SHAPED lock \|stick\|^STEER_EXPO, not the raw stick (audit4 P1, DECISIONS #5) (144–155) | 147, 153, 154 | T | PlayerForces raw-shaped assignment forbidden; standalone apply distinguishes exponent-shaped half stick from raw. Actual handoff asserted in separate vehicle-tick-alloc suite, not here. |
| PRESETS bundle gripSteer: ROOKIE/RELAX on, STANDARD/PRO off (157–180) | 160, 171, 173, 176, 177, 178, 179 | T | Source PRESETS pin rookie=8, relax=6, standard/pro=1. |
| the cap aims at the FRONT curve's own peak slip (CURVE_PEAK_X_F), not the nominal pi/2 (182–204) | 192, 200, 202, 203 | T | Real tyre model front peak earlier than nominal; sixty-step cap converges within 0.001 to front target, remains before peak and yields >99% normalized grip. |

### harness-display.test.mjs

Target T: `tools/lib/harness.mjs:84–125,156–197,199–327,329–431; tools/shot/probe-page.mjs:7–159`.

Fixture and limits: Source pins and dynamically imported pure helpers; fake Chromium/server/EventEmitter 136–148, mini storage VM; temporary static server files 202–234 and real detached Node child 251–269. /fixture/chrome, /fixture/bin and ws fixture are synthetic descriptive inputs, never live browser references.

| Case (test range) | A spans | Target | Meaning and specific limits |
|---|---|---|---|
| harness exports display helpers and clears a dead DISPLAY for headless (17–68) | 19, 20, 21, 22, 27, 28, 29, 30–31, 41, 42, 43, 46–50, 51, 54–58, 59, 62–66, 67 | T | Local socket parsing and dead-headless DISPLAY clear/log are exercised; headed, live and opt-out display retained. Default probe uses process env. |
| chromiumArgsForBackend pins unsafe SwiftShader for GLX/TLX (70–76) | 72–73, 74–75 | T | Software flags and diagnostic boot-timeout strings present in probe source; no Chromium run. |
| hardware WebGPU launch explicitly selects full Chromium and rejects software or unknown adapters (78–116) | 82, 83, 84, 85–86, 88, 90, 92–94, 96, 97, 98, 99, 106, 110, 115 | T | Hardware settings request full Chromium/GPU, platform-correct flags; classifier accepts named Apple, rejects software/fallback/unknown; fake page adapter check rejects software and invalid mode fails. |
| Three.js hardware screenshot init selects TLX WebGPU, native presentation and Ultra preset (118–134) | 129, 130, 131, 132, 133 | T | Serialized probe init stores three/WebGPU/native/Ultra preferences using VM storage. |
| owned BrowserServer returns Browser API, preserves close options and reports selection (150–164) | 154, 156, 156, 157, 157, 158, 159, 161, 162, 163 | T | Owned BrowserServer yields original Browser API, strips helper flavor, pins localhost, preserves close args and reports executable selection; owner closes once. |
| hung direct Browser.close and shutdown retain the owned group until bounded force (166–175) | 172, 173, 174 | T | Hung Browser.close concurrent shutdown coalesces one close and forces negative-PID group plus owner kill via injected spy. |
| failed connect and unexpected disconnect close BrowserServer ownership (177–187) | 180, 181, 186 | T | Connect failure and unexpected disconnect both close server owner once. |
| shutdown during server launch reaps a late owner instead of returning an orphan (189–200) | 197, 198, 199 | T | Shutdown during pending launch rejects late acquisition, closes owner and never connects. |
| snapshot cache pins immutable bytes, keeps absolute requests consistent and rejects unread edits (202–234) | 213, 215, 216, 217, 218, 222, 222, 224, 224, 225, 226, 227, 231, 231, 232 | T | HTTP snapshot pins bytes after first read, keeps absolute requests consistent, rejects changed unread file with 409, honors ETag/HEAD and namespace; plain mode serves edited bytes without caching. |
| explicit launch environments clear dead local DISPLAY without mutating caller state (237–249) | 242, 243, 243, 247 | T | Explicit environment copy clears only launch DISPLAY, preserves caller PATH/DISPLAY; headed launch retains it. |
| a hanging Browser close remains owned and shutdown kills its process group (251–269) | 266, 267 | T | Real detached Node child stands in for browser: hung close remains tracked until shutdown SIGKILLs group; no browser launched. |
| graceful Browser close closes the supported process owner too (271–280) | 279 | T | Graceful facade close preserves reason and closes supported owner once, including subsequent shutdown. |

## Boundary notes

The GLX suites exercise production JS control flow and recorded API/state ownership. They cannot establish actual shader compilation, visual output, XR presentation, GPU driver resource lifetime, occlusion savings or multidraw speed. Source pins establish syntax/integration presence and can pass without the intended live behavior. VM title/DOM tests do not establish browser focus, accessibility, real view-transition scheduling or clipboard/download success. Ghost quota/tab tests use a real persistence layer over controlled storage, not browser multi-process storage delivery.

Important coverage distinctions are preserved in rows: pending-result occlusion child never queues a real query; grid paint name says 0.12 while assertions use 0.20; guide-on-tarmac and box containment titles exceed distance checks; live-object balance is not zero allocation; ghost metadata “reload” reselects within one harness; counter pooling and shaped-input plumbing are only partial proofs here. APXG1 trace hash is unkeyed integrity checking, not sender authentication.
