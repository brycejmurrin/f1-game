# Manual test source map — complete

All 11 tracked files, 1,439 lines and 64,810 bytes under tests/manual were read as untruncated source. The two large Node suites were read in individual 90/100-line ranges; remaining files in complete bounded excerpts. Source identity is recorded below. This is source inspection: no suites, browser, daemon or API calls were run.

## Role and dependency flow

These are deliberately excluded from ordinary Playwright discovery by playwright.config.js. The README distinguishes human image review from assertions and moves checks that should gate changes into tests/specs or tests/unit. The Node suites are explicitly invoked with node:test; they launch Python/shell subprocesses or a mock local daemon when executed, so their manual classification does not imply browser coverage.

The gallery suites call the public window.__apex staging/camera API; output-paths helpers choose per-port galleries. circuits() derives its roster from circuit definition filenames and validates CIRCUITS overrides. The building and lap-audit galleries instead maintain fixed 24- and 40-entry rosters. Tracks-visual delegates cases to track-helpers and self-skips if no PNG baseline directory exists; finding any PNG enables its whole roster, so baseline existence is not completeness.

LSP evidence: direct queries for __apex.race/park/snapCam were rejected because window.__apex resolves to the initial shell object. ApexApi.race resolved by labelled module-file fallback to js/agent/apex.js:997, park to line274; ApexCam.snapCam resolved by fallback to js/agent/apex-cam.js:47. Export/caller coverage is explicitly unverified for those fallback results. Semantic references for ApexCam.hooks returned three references in apex-cam.js and apex.js. The actual bodies confirm that race returns a descriptor with a thenable that waits for startRace; park moves rivals back600m, jumps and freezes; snapCam calls snapGameCam(paint), with synchronous rendering only for truthy paint. Thus fixed sleeps and non-null track checks in these older suites are weaker readiness evidence than awaiting race and confirming the selected id.

## Per-file semantics and limits

| File | Behavior and evidence boundary |
|---|---|
| tests/manual/README.md | Explains manual discovery, gallery destinations and parked golden suite; historical archive provenance was read without adopting its old commands. |
| tests/manual/circuits.js | Reads sorted .js circuit definitions; no override returns all; comma-separated override rejects unknown ids, preserves requested order and duplicates. No source behavior executed in this audit. |
| tests/manual/blank-scan.spec.js | One registration expanded per derived circuit. Samples25 lap fractions after park/jump/snap; asserts no PNG below80,000bytes. Reads cull diagnostics but never asserts them. Compressed PNG size is a heuristic affected by viewport/settings, not a semantic intrusion detector. |
| tests/manual/inspect.spec.js | Same derived circuit roster; saves25 frames and a5×5 contact sheet at fixed waits. Has no expect assertions, so successful output is a review artifact. |
| tests/manual/tracks-visual.spec.js | Checks for any PNG in expected baseline folder, conditionally skips entire delegated describeTrack roster. Does not create baselines or prove all roster baselines exist. |
| tests/manual/galleries/all-tracks-buildings.spec.js |24 fixed circuits; serial shared page, one initial navigation, then race/go/freeze/hud. Optional cinematic images and unconditional orbit per track; no pixel or load assertions. Uses fixed delays and an outdated synchronous-race comment. |
| tests/manual/galleries/track-lap-audit.spec.js |40 fixed circuits,25 fractions,60m/s,400ms wait; writes frames plus HTML linking directories that exist. No expect assertions; historical output folders can enter a new gallery. |
| tests/manual/galleries/track-trace.spec.js |One TRACK (default Suzuka), FRAMES parsed from environment; asserts race descriptor, each park return and no page errors excluding favicon. Screenshots need human review; no finite/positive FRAMES validation. |
| tests/manual/timeout-probe.spec.js |Three quiet/throwing/busy wait shapes,3000ms requested bound,12000ms tolerance. Measures Node wall time. Asserts only upper elapsed bound, not that wait rejected or that elapsed was at least requested timeout; unexpected fast resolution could pass. |
| tests/manual/probe-mcp.test.mjs |12 registrations cover wrapper source/config, routing/status/help, static catalog, mock stdio handshake/daemon, error propagation and schema-aware page selection. Last case executes real Python ChromeBackend with a fake client, not a real Chrome target. Daemon health/routing uses mock mode, kills child in finally. |
| tests/manual/tinyfish-mcp.test.mjs |20 registrations cover executable wrapper/config/help, missing-key/build and .env fixture handling, credential-pattern absence, nested RPC decode/build comparison/error exit taxonomy, bounded retries/timeout source contracts, JSON shell body parsing and search-row rendering. Synthetic keys only; no live TinyFish API. Source regex checks do not establish upstream timeout or live deploy behavior. |

## Case sites and assertion spans

Rows count source registration sites, not the expanded per-circuit case count. Spans are inclusive AST call ranges. Python assertions embedded in a string are inside the final probe case and are not JavaScript assert-call rows. Top-level test.skip and imported describeTrack expansion belong to the per-file account above.

### tests/manual/blank-scan.spec.js

| Case | Range | JavaScript assertion calls |
|---|---|---|
| blank scan: ${circuit} | 38–63 | 62–62 |

### tests/manual/galleries/all-tracks-buildings.spec.js

| Case | Range | JavaScript assertion calls |
|---|---|---|
| ${id} — ${label} | 70–106 | none; output/fixture behavior above |

### tests/manual/galleries/track-lap-audit.spec.js

| Case | Range | JavaScript assertion calls |
|---|---|---|
| lap audit: ${circuit} | 73–90 | none; output/fixture behavior above |

### tests/manual/galleries/track-trace.spec.js

| Case | Range | JavaScript assertion calls |
|---|---|---|
| follow-cam sweep (${FRAMES} frames) | 21–69 | 39–39, 56–56, 68–68 |

### tests/manual/inspect.spec.js

| Case | Range | JavaScript assertion calls |
|---|---|---|
| inspect ${circuit} | 31–68 | none; output/fixture behavior above |

### tests/manual/probe-mcp.test.mjs

| Case | Range | JavaScript assertion calls |
|---|---|---|
| probe-mcp.py exists and says it is a CLI, not an attached server | 20–29 | 21–21, 23–23, 24–24, 25–25, 26–26, 27–27, 28–28 |
| .mcp.json does NOT register probe — chrome-devtools is the attached Chrome MCP | 31–51 | 34–40, 41–41, 42–42, 43–43, 44–44, 45–45, 46–46, 49–49, 50–50 |
| probe-mcp status stays usable when tinyfish is down | 53–65 | 55–55, 56–56, 62–62, 63–63, 64–64 |
| probe-mcp help lists serve / list-tools / call / status | 67–76 | 69–69, 70–70, 71–71, 72–72, 73–73, 74–74, 75–75 |
| probe-mcp route resolves chrome_ and tinyfish_ prefixes | 78–92 | 82–82, 83–83, 84–84, 89–89, 90–90, 91–91 |
| probe-mcp route rejects unprefixed tool names | 94–100 | 98–98, 99–99 |
| probe-mcp serve handshake (mock) advertises prefixed tools | 102–155 | 135–135, 140–140, 142–142, 143–143, 146–146, 147–147, 148–148, 149–149, 150–150, 152–153, 154–154 |
| chrome daemon (mock): healthz, /call routing, CLI auto-route to a live daemon | 157–245 | 186–186, 187–187, 191–191, 203–203, 213–214, 216–216, 226–226, 227–227, 228–228, 240–240, 241–241 |
| tools/list without mock does not spawn backends (Cursor discovery) | 247–268 | 261–261, 265–265, 266–266, 267–267 |
| tools/list still advertises both catalogs when a backend ensure() throws | 270–290 | 283–283, 287–287, 288–288, 289–289 |
| probe-mcp help documents the persistent daemon commands | 292–298 | 294–294, 295–295, 296–296, 297–297 |
| ChromeBackend follows each tool schema when supplying pageId | 303–352 | 350–350, 351–351 |

### tests/manual/timeout-probe.spec.js

| Case | Range | JavaScript assertion calls |
|---|---|---|
| a never-true predicate on a QUIET page respects its declared timeout | 45–53 | 52–52 |
| a predicate that THROWS every evaluation still respects its timeout | 55–66 | 65–65 |
| a never-true predicate on a BUSY page respects its declared timeout | 68–80 | 79–79 |

### tests/manual/tinyfish-mcp.test.mjs

| Case | Range | JavaScript assertion calls |
|---|---|---|
| tinyfish-mcp.sh and tinyfish-rpc.py exist | 47–51 | 48–48, 49–49, 50–50 |
| .mcp.json is the three-server catalog — tinyfish / probe are CLI-only now | 53–76 | 59–65, 66–66, 67–67, 68–68, 69–69, 70–70, 71–71, 72–72, 73–73, 75–75 |
| tinyfish-mcp.sh help lists setup / ensure / deploy-js / format | 78–91 | 80–80, 81–81, 82–82, 83–83, 84–84, 85–85, 86–86, 87–87, 88–88, 89–89, 90–90 |
| no key is shipped: missing TINYFISH_API_KEY is a clear exit 1, never a fallback | 93–144 | 100–100, 101–101, 102–102, 103–103, 104–104, 105–105, 119–119, 121–121, 122–122, 123–123, 124–124, 125–126, 137–137, 138–138, 139–140 |
| start persists the SHELL key into the gitignored .env (and nothing when there is none) | 146–176 | 159–159, 160–160, 171–171, 172–172 |
| no TinyFish credential literal and no tracked-fallback variable anywhere under tools/ or .claude/ | 178–207 | 206–206 |
| tinyfish-rpc live-build extracts N from nested version.json RPC | 209–216 | 214–214, 215–215 |
| tinyfish-rpc unwrap prints version.json body text from nested RPC | 218–225 | 223–223, 224–224 |
| tinyfish-rpc deploy-summary reports STALE when live != local | 227–237 | 233–233, 234–234, 235–235, 236–236 |
| tinyfish-rpc calls an upstream timeout transient (exit 3), not a parse failure | 253–263 | 258–258, 259–259, 260–260, 261–261 |
| tinyfish-rpc still reports a genuine parse failure as exit 2 | 265–272 | 270–270, 271–271 |
| tinyfish-mcp.sh asks for a per-URL timeout budget rather than eating the default | 274–287 | 279–279, 280–280, 281–281, 284–284, 286–286 |
| tinyfish-mcp.sh retries the live-build fetch and says the body is capped | 289–304 | 292–292, 293–293, 294–294, 297–297, 298–298, 299–299, 300–300, 302–302, 303–303 |
| tinyfish-rpc deploy-summary --tip-build is OK when live matches tip, even if local differs | 306–318 | 312–312, 313–313, 314–314, 315–315, 316–316, 317–317 |
| tinyfish-rpc deploy-summary --tip-build reports STALE when live != tip | 320–330 | 326–326, 327–327, 328–328, 329–329 |
| tinyfish-mcp.sh help lists --tip for deploy-check | 332–340 | 334–334, 335–335, 336–336, 338–338, 339–339 |
| tinyfish-rpc deploy-summary reports OK when builds match | 342–350 | 348–348, 349–349 |
| every mcp_post body in tinyfish-mcp.sh is valid JSON once splices are stubbed | 352–388 | 362–362, 383–386 |
| tinyfish-rpc unwrap renders search rows (title + url + snippet, not bare URLs) | 390–426 | 422–422, 423–423, 424–424, 425–425 |
| deploy-check --tip does not trip set -u on an empty rest array | 428–434 | 430–430, 431–431, 433–433 |

## Comment and maintenance candidates

- README:11/33 and blank-scan header still describe40 circuits; the derived roster currently follows all52 definitions. Keep historical replacement counts explicitly historical and avoid presenting40 as a current roster.
- Building gallery header and inner track switch describe race as synchronous. Current ApexApi source requires awaiting the descriptor to establish completion; fixed500ms delay plus a truthy prior track can race lazy scenery hydration. This is a source-supported review finding, not a reproduced failure.
- Lap-audit describes every circuit while its fixed roster is40 entries; building gallery similarly says every circuit for24. Their source roster scope should be named accurately or derived.
- Tinyfish test title calls .mcp.json a three-server catalog while its assertion lists five names. The assertion is clearer authority than the title.
- Timeout prose investigates a formerly misplaced options argument; current three wait calls correctly pass null before options. Its measured upper-bound assertion should not be described as proving a timeout rejection.
- Fixed screenshot delays do not guarantee one presented frame under software rendering. This mapping observed no pixels or timing.

## Full source identity

Every range below is fully read, inclusive. SHA-256 fingerprints the complete original source file.

| Source | Lines | Bytes | SHA-256 |
|---|---|---|---|
| tests/manual/README.md | 1–46 | 3760 | ff9c79a1149c8e1083fb6f5e72b99646d78eb8eafaefd475619e044b45dca192 |
| tests/manual/blank-scan.spec.js | 1–64 | 3116 | 34e8e3cc99b20207700381448144e7a1a5694b832a9fd28e136613e82d1e41e6 |
| tests/manual/circuits.js | 1–33 | 1329 | c81d9e2de777e507058bc2f72fe663b88b7f14d194bd78758e689ac9e7e6a53f |
| tests/manual/galleries/all-tracks-buildings.spec.js | 1–107 | 4847 | f28baaee9a651f845300988d6ae4230f1faa00e4ba031c4d6575d750dcd8da4f |
| tests/manual/galleries/track-lap-audit.spec.js | 1–150 | 6254 | 5fae503228073668d8620c529bf0091d21d7419f12682d61529f680b6159701a |
| tests/manual/galleries/track-trace.spec.js | 1–70 | 2638 | e349838a385c72f6fdb9fdcd3e42414be12c4c1042dcd87fef7915d32c357205 |
| tests/manual/inspect.spec.js | 1–69 | 3156 | df51bb81da1514e542fa47a7e689cee8d0f899a1ccc6cc0a4847d0db6bd6dd40 |
| tests/manual/probe-mcp.test.mjs | 1–352 | 15387 | 652f135696037c5bb760f43392ea21b44ff9cf694645b13fd330e560f8fba792 |
| tests/manual/timeout-probe.spec.js | 1–80 | 4092 | b6f2ccf5e89bcf44f1c44c3c484823cf1186c394c4c540b5f4c58ee9fa3654ea |
| tests/manual/tinyfish-mcp.test.mjs | 1–434 | 18417 | e7ab340ab80735ea573b821b7ec1ddf267b04e4b6026bab1cce8cbe958ebf295 |
| tests/manual/tracks-visual.spec.js | 1–34 | 1814 | 69e16e59e176e659c8f10fd4274ecc1fc2dc33f4b2b9a97bdf46effc51bd235a |
