# Unit tests 02a: complete static reading

Completed the previously unread ranges for group 02 positions 41, 49 and 50. All 4,865 lines were read in the bounded, nontruncated chunks below. This report supersedes the incomplete reading status for these three files only in [tests-unit-02-complete.md](tests-unit-02-complete.md). No test, browser, workload, commit or source edit was performed. Parent owns verification.

Navigation followed AGENTS.md and .claude/skills/code-nav/SKILL.md. Attached apex-lsp outlines resolved Announcer, RecordedAnnouncer, apex-tools-mcp, apex-extras and job-admission; definitions confirmed runSpawn, createExtras and createUITools. Source reads additionally examined Announcer.create/factsFor/storyFor/wrapUp/scriptFor, fitting, RecordedAnnouncer lifecycle, admission publication, and extras job cancellation/status/admission. RadioVoice.pickVoice lookup correctly reported no such member: voice selection belongs to Announcer.pickVoice.

## Read ledger

Hashes cover exact UTF-8 bytes; range hashes include original newline bytes.

| File | Lines | SHA-256 | Fully read ranges |
|---|---:|---|---|
| tests/unit/announcer.test.mjs | 1325 | 1facd23167650ecdaf7a6bb5c47c9f657cc13a91ace8e958c681eee43a02a836 | 1–450, 451–900, 901–1325 |
| tests/unit/apex-server-fixes.test.mjs | 375 | aaf17ba2128d677d5d084f011c3bdfc95d9fce9940706f46cf2e318380e3c997 | 1–375 |
| tests/unit/apex-tools-mcp.test.mjs | 3165 | a53fa8f5f0b909a27b7ca506eb126c130d5702fcfed61c05fb8427d2c54e1808 | 1–450, 451–900, 901–1350, 1351–1800, 1801–2250, 2251–2700, 2701–3165 |

| File | Read range | SHA-256 of range |
|---|---|---|
| announcer.test.mjs | 1–450 | 7a29eba0f86991ba59b98aa951b2a1cadc10fe7bfbf820432a8f643a4045fe39 |
| announcer.test.mjs | 451–900 | b6354201586570cd78787cb3b6f9dc88c43a3f3ed4cfa344d02390a5919400d6 |
| announcer.test.mjs | 901–1325 | 6f8b6db3276fe23647ce01d628a622973399b2fe6eae166babcdf8b795ef662a |
| apex-server-fixes.test.mjs | 1–375 | aaf17ba2128d677d5d084f011c3bdfc95d9fce9940706f46cf2e318380e3c997 |
| apex-tools-mcp.test.mjs | 1–450 | 08071f078b92988e3994c2f6f2ef809c5edb55c1ea517ed350496d690f039f1d |
| apex-tools-mcp.test.mjs | 451–900 | 190eb6533eba02cdfbdcb85fd88b9a48c9563bf32ee8fc0b09e0fcb15a54a8aa |
| apex-tools-mcp.test.mjs | 901–1350 | b83488e86484f1cee7cc336f635c8e139913689c0791c9a4a8630fac48167793 |
| apex-tools-mcp.test.mjs | 1351–1800 | 73ad1d7322951279adfaa15ffad9c775c1e6384bf8a4d50cf28475ff669907fe |
| apex-tools-mcp.test.mjs | 1801–2250 | 612fb16ef5f2d7377e5adab9bd0b0eda3cdd9998a65a6bc99d654e32b8f9b25a |
| apex-tools-mcp.test.mjs | 2251–2700 | 945a30cf22c0d74f1485aef081f1960128f11a059f9ea55c77c00b5602dc8d0d |
| apex-tools-mcp.test.mjs | 2701–3165 | 089a352f1c0558240af3a7eddd7288e1f6b7577c667e49076958ca3638270b2d |

## Production and fixture map

Each assertion below inherits its test's target entry. Assertion source is retained exactly apart from whitespace normalization, so compound predicates, expected values, fixtures and loops remain auditable. Lines name assertion call sites; dynamic subtests describe a matrix rather than a measured execution count.

- **AN-script**: js/audio/announcer.js:97 broadcast, :106 inCountry, :114 character, :132 loreFor, :146 sessionLine, :175 conditionsLine, :187 rows, :294 realRows, :397 storyRows, :453 wrapRows, :485 seconds, :503 fit, :519 script. Fixtures: info/said/tail defaults; STORY championship/forecast; BAKU40 lap-40 race situation; bakuJoin watch/grid switches. CircuitLore data is loaded from js/data/circuit-lore.js and compared with js/circuits directory.
- **AN-instance**: js/audio/announcer.js:540 create, nested volume/stop/factsFor/storyFor/wrapUp/scriptFor/speak; RadioVoice in js/audio/radio-voice.js supplies normalizer, tone, sample, remote channel policy and tuning. load() builds a VM with seedLog/absSrc, storage Map, fake speech synthesis and optional document/clock. finishLine, spoken and readThrough inspect callbacks rather than platform speech. fakeClock advances ordered timers and Date together.
- **AN-recorded**: js/audio/announcer-recorded.js:5 create, nested planLine/play/valid/readMs/stop. Stub packs inject pending load/rejection, duration plans, clip callbacks and volume; recordedLifecycle crosses paused/hidden/muted with load/rejection/timer/decode/end. pausedRecordedAudition distinguishes explicit previews/samples from automatic introductions/wrapUp.
- **MCP-core**: tools/mcp/apex-tools-mcp.mjs:494 CATALOG, :1423 describeSchema, :1435 nearestKey, :1475 checkUnknownKeys, :1498 validateValue, :1547 validateArgs, :1813 buildArgv, :2369 pinOk, :2671 dispatch, :2865 toolAnnotations, :2954 toolOutputSchema, :2976 compactSchema, :3016 listTools, :3215 cmdServe, :3277 cmdServeHttp. rpc/callCli spawn mock server or dry-run CLI; these fixtures inspect transport/plans and do not establish that browser commands work.
- **MCP-path/occupancy**: same file :108 classifyUrl, :145 gateTreeArgs, :158 gateBrowserArgs, :216 playwrightLive, :227 testBgStatus, :249 lockInfo, :270 occupancyRefuse, :326 acquireLock, :347 releaseLock, :1247 assertSafeOut, :1302 assertSafeIn. tools/ci/playwright-occupancy.mjs classifies tokenized process lines; tools/ci/test-bg.mjs aliveRun verifies PID identity. withFakeRegistry isolates APEX_TEST_BG_STATE. LOCK uses scratch/apex-browser.lock; mkOutsideTemp and symlinks prove output confinement without writing outside.
- **MCP-process/results**: same file :1997 splitOut, :2017 slimBody, :2054 runSpawn, :2159 rotateReport, :2173 withCursorVerdict, :2292 serverFreshness, :2314 browserTimeoutMs, :2555 garageOpen, :2513 garageClose, :2664 syncStructured, :3211 exitOnSignals. Child fixtures are Node-only, fake EventEmitter/PassThrough streams, preload exit marker, or loopback HTTP sibling process.
- **EX-jobs**: tools/mcp/apex-extras.mjs:51 createExtras, :369 jobPlan, :490 onward manifests/processBirth/cleanup/refresh/pruning/capping, :716 jobStart, :820 jobStatus, :839 jobStatusWait, :858 jobCancel, :1071 JOB_KINDS, :1073 HUD_JOB_ARGV. tools/mcp/job-admission.mjs:7 publishJobManifest, :13 jobOwnerGone, :22 takeJobAdmission; tools/lib/process-tree.mjs supplies alive/processTree/killTreeAndWait. Fixtures create private ROOT trees, executable Node stand-ins, controlled pid/birth manifests, exclusive cancellation markers, injected spawn/kill/filesystem failures and multiple independent owners.
- **EX-track/survey**: tools/mcp/apex-extras.mjs:79 sessClose, :96 sessSend, :118 trackOpen, :180 handleShotSurvey, :316 handleTrack; tools/shot/track-session.mjs page camera forwarding; tools/lib/track-shot-survey.mjs and tools/shot/lib/survey-runner.mjs plan/execute surveys; tools/lib/custom-survey-locations.mjs loads editor designs; tools/lib/survey-scenarios.mjs discovers authored locations; saved report galleries use portable image copies and reject escapes.
- **MCP-specialists**: tools/mcp/ui-tools.mjs:58 summarizeUIInspection, :81 createUITools (inspector, saved diff, mission planning); tools/mcp/garage-plan.mjs; tools/mcp/catalog-discovery.mjs; tools/mcp/diagnostics-tools.mjs. Injected inspector writes inspection.json with matches/unavailable/unmapped controls and advisory issues; diff fixtures change control values/viewports and exceed file limits. tools/shot/frame-report.mjs readShots rejects executable sources unless explicit trusted CLI mode; tools/track/graph-parity.cjs materialiseBaseline/main clean partial archive/load/build/comparison failures.
- **MCP-Cursor**: tools/mcp/apex-tools-mcp.mjs:383 cursorAgentsArgv, :2173 withCursorVerdict, :2369 pinOk; tools/ci/cursor-agents.mjs supplies launch environment allowlist and canonical verb CLI. AID is a syntactically valid fixture bc UUID; all launch/control checks are mock/dry-run or pure verdict wrapping, not actual external agent operations.

## Semantic coverage and limits

Announcer covers derived facts, title/event normalization, country fallback, density/elevation, weather/night exclusivity including storm, punctuation, voice quality/name/language ladders, explicit selection, inert/sound/toggle gates, volume changes and stale callbacks, remote voice channel differences, session/duel/qualifying/sprint copy, authored lore completeness, priority fitting with pauses and final landing, recorded coverage and cancellation at every async gate, story and real-race narration, classified results/penalties/DSQ/fastest-lap eligibility, and ownership release. Two explicit TODO tests remain: Baku night lore bake and Istanbul corner duration wording. They are recorded gaps, not verified fixes. Speech engines, real WebAudio decoding and browser visibility behavior are stubbed.

MCP coverage freezes catalogs/configuration and audited package pins; stdio/HTTP envelope recovery; local-only URL handling; schema argument admission and self-explaining refusals; flag pinning; safe input/output paths and symlinks; distinct idle host MCP versus live browser occupancy; stale/zombie/reused PID handling; sessions, abort and tree cleanup; durable job identity, admission ceilings, release failure recovery and workload publication gates; cancellation markers and birth identity portability; bounded status/results/help/discovery schemas; exact argv forwarding, async routing and estimates; gallery construction and specialist UI/garage/diagnostic planning; Cursor verb argument/security/verdict contracts. Source-shape regex guards coexist with behavioral fixture checks and are explicitly identifiable below. Mock/dry-run assertions do not prove renderer boot, real surveys, UI correctness, remote API behavior or actual deployment.

## Per-test assertion inventory

### tests/unit/announcer.test.mjs

#### 86–93: it opens with the game's own name, every time

Targets/fixtures: AN-script.

- L90: `assert.equal(A.script(info())[0], "Welcome to Apex 26.")`
- L91: `assert.equal(A.script(info({ track: {} }))[0], "Welcome to Apex 26.")`
- L92: `assert.equal(A.script(null)[0], "Welcome to Apex 26.")`

#### 95–97: it names the circuit AND the event — both, because either alone reads as a placeholder

Targets/fixtures: AN-script.

- L96: `assert.match(said(info()), /This is Monza, home of the Italian Grand Prix\./)`

#### 99–108: "Bahrain GP" is SPOKEN as a Grand Prix, not as two letters

Targets/fixtures: AN-script; AN-instance.

- L106: `assert.match(line, /Italian Grand Prix/)`
- L107: `assert.ok(!/\bGP\b/.test(RV.speakable(line)), RV.speakable(line))`

#### 110–118: an ALL-CAPS circuit name is title-cased for the printed script, multi-word ones included

Targets/fixtures: AN-script.

- L114: `assert.match(said(info({ track: { name: "MONZA", lengthKm: 5.793 } })), /This is Monza/)`
- L115: `assert.match(said(info({ track: { name: "RED BULL RING", lengthKm: 4.318 } })), /This is Red Bull Ring/)`
- L117: `assert.match(said(info({ track: { name: "Mont-Tremblant", lengthKm: 4.265 } })), /This is Mont-Tremblant/)`

#### 120–125: a circuit with no Grand Prix falls back to the country, not to an empty clause

Targets/fixtures: AN-script.

- L123: `assert.match(s, /This is Brands Hatch, in the United Kingdom\./)`
- L124: `assert.ok(!/home of the \./.test(s), "an empty gp left a dangling clause")`

#### 127–131: no name and no event leaves out the venue line rather than saying 'This is .'

Targets/fixtures: AN-script.

- L129: `assert.ok(!lines.some((l) => /^This is/.test(l)), lines.join(" | "))`
- L130: `assert.equal(lines[0], "Welcome to Apex 26.")`

#### 133–138: every number it speaks is the number it was given

Targets/fixtures: AN-script.

- L135: `assert.match(s, /7\.004 kilometres/)`
- L136: `assert.match(s, /19 corners/)`
- L137: `assert.match(s, /8 laps\./)`

#### 140–146: a circuit with no built world yet omits the corner count instead of claiming zero

Targets/fixtures: AN-script.

- L144: `assert.ok(!/corners/.test(s), s)`
- L145: `assert.match(s, /5\.793 kilometres\./)`

#### 150–159: corner DENSITY separates the circuits, not corner count

Targets/fixtures: AN-script.

- L156: `assert.match(monaco, /tight, technical lap/)`
- L157: `assert.match(monza, /fast, flowing lap/)`
- L158: `assert.match(spa, /mixes rhythm/)`

#### 161–166: relief is only mentioned when there is some, and the figure is rounded DOWN into a round number

Targets/fixtures: AN-script.

- L162: `assert.ok(!/climbs|rolling/.test(said(info({ relief: 3 }))), "flat ground got an elevation clause")`
- L163: `assert.match(said(info({ relief: 22 })), /rolling ground/)`
- L165: `assert.match(hilly, /climbs and falls more than 100 metres/)`

#### 168–178: night and weather are stated, and only one of them

Targets/fixtures: AN-script.

- L170: `assert.match(said(info({ track: sgp, tod: "default" })), /under the lights/, "a night circuit at its own time is a night race")`
- L171: `assert.doesNotMatch(said(info({ track: sgp, tod: "day" })), /under the lights/, "TIME set to DAY (or a real race run in daylight) is lit by day: no floodlights in the read")`
- L173: `assert.match(said(info({ tod: "night" })), /under the lights/)`
- L175: `assert.ok(!/under the lights/.test(wet), "a wet night is about the water, not the floodlights")`
- L176: `assert.equal(/rain|wet|grey|fog/i.test(said(info({ weather: "dry" }))), false, "a dry day says nothing about the weather at all")`

#### 180–191: each weather state gets its OWN line — one clause for five conditions said nothing

Targets/fixtures: AN-script.

- L187: `assert.ok(hit, ˋweather "${w}" produced no conditions line: ${rows.join(" | ")}ˋ)`
- L190: `assert.equal(new Set(lines).size, 4, "two weather states share a line: " + lines.join(" / "))`

#### 193–197: it ends on the same line whatever it found, so the voice never trails off

Targets/fixtures: AN-script.

- L195: `assert.match(A.script(o).slice(-1)[0], /Let's go racing\.$/)`

#### 199–201: every line is a sentence — the synth pauses on the full stop, and a missing one runs two facts together

Targets/fixtures: AN-script; AN-instance.

- L200: `assert.match(l, /\.$/, ˋ"${l}" is not punctuatedˋ)`

#### 203–208: the whole script survives speakable() — it is spoken through the radio's normaliser

Targets/fixtures: AN-script.

- L206: `assert.ok(words.length > 40, words)`
- L207: `assert.ok(!/undefined|NaN|\[object/.test(words), words)`

#### 218–221: Daniel in en-GB wins outright — the voice the request named

Targets/fixtures: AN-script.

- L220: `assert.equal(A.pickVoice(mac, "").name, "Daniel")`

#### 223–227: a Daniel in the wrong language still beats a stranger in the right one

Targets/fixtures: AN-script.

- L226: `assert.equal(A.pickVoice([V("Serena", "en-GB"), V("Daniel", "en-US")], "").name, "Daniel")`

#### 229–233: no Daniel: another British male, then any en-GB, then any English

Targets/fixtures: AN-script.

- L230: `assert.equal(A.pickVoice([V("Zira", "en-US"), V("George", "en-GB")], "").name, "George")`
- L231: `assert.equal(A.pickVoice([V("Zira", "en-US"), V("Hazel", "en-GB")], "").name, "Hazel")`
- L232: `assert.equal(A.pickVoice([V("Zira", "en-US"), V("Amelie", "fr-FR")], "").name, "Zira")`

#### 235–238: an en-GB FEMALE voice is not preferred over an en-GB one whose name says nothing

Targets/fixtures: AN-script.

- L237: `assert.equal(A.pickVoice(list, "").name, "Google UK English")`

#### 240–245: nothing English at all returns null, and the platform picks — never a throw and never a French announcer

Targets/fixtures: AN-script.

- L241: `assert.equal(A.pickVoice([V("Amelie", "fr-FR"), V("Yuna", "ko-KR")], ""), null)`
- L242: `assert.equal(A.pickVoice([], ""), null)`
- L243: `assert.equal(A.pickVoice(null, ""), null)`
- L244: `assert.equal(A.pickVoice([null, undefined], ""), null)`

#### 247–253: THE PLAYER'S PICK OUTRANKS THE WHOLE LADDER — that is what the settings row is for

Targets/fixtures: AN-script.

- L249: `assert.equal(A.pickVoice(list, "Yuna").name, "Yuna")`
- L252: `assert.equal(A.pickVoice(list, "Samantha").name, "Daniel")`

#### 257–267: no speechSynthesis: create() is inert and every method is safe to call

Targets/fixtures: AN-script; AN-instance.

- L260: `assert.equal(a.available(), false)`
- L261: `assert.equal(a.play(info(), 1000), false)`
- L262: `assert.equal(a.preview(info()), false)`
- L263: `assert.equal(a.sample(), false)`
- L264: `assert.equal(a.scriptFor(info()).length, 0)`
- L266: `assert.equal(An.inert().play(), false)`

#### 269–273: create() never reads the voice list — a speech API on the boot path is the defect radio-voice.js already pins

Targets/fixtures: AN-script; AN-instance.

- L272: `assert.equal(synth.calls.filter((c) => c.m === "getVoices").length, 0)`

#### 275–279: ON by default, and the stored OFF is honoured

Targets/fixtures: AN-script; AN-instance.

- L276: `assert.equal(load().A.create(load().G).enabled(), true)`
- L278: `assert.equal(off.A.create(off.G).enabled(), false)`

#### 281–287: MASTER SOUND OFF is silence, for play and preview alike — speech is outside the audio graph, so nothing else would stop it

Targets/fixtures: AN-script; AN-instance.

- L284: `assert.equal(a.play(info(), 1000), false)`
- L285: `assert.equal(a.preview(info()), false)`
- L286: `assert.equal(synth.calls.filter((c) => c.m === "speak").length, 0)`

#### 289–294: the switch OFF stops play() but not preview() — pressing PLAY in the editor IS the consent

Targets/fixtures: AN-script; AN-instance.

- L292: `assert.equal(a.play(info(), 1000), false)`
- L293: `assert.equal(a.preview(info()), true)`

#### 296–304: setEnabled writes through to the store, so the panel and the editor cannot disagree

Targets/fixtures: AN-script; AN-instance.

- L300: `assert.equal(saved.get("announcer"), false)`
- L301: `assert.equal(a.enabled(), false)`
- L303: `assert.equal(saved.get("announcer"), true)`

#### 306–316: speaking picks the voice by name off the live synth, at the announcer channel's prosody

Targets/fixtures: AN-script; AN-instance.

- L309: `assert.equal(a.play(info(), 24000), true)`
- L311: `assert.ok(spoke, "nothing was spoken")`
- L312: `assert.equal(spoke.voice && spoke.voice.name, "Daniel")`
- L313: `assert.equal(spoke.rate, RV.TONE.announcer.rate)`
- L314: `assert.equal(spoke.pitch, RV.TONE.announcer.pitch)`
- L315: `assert.match(spoke.text, /welcome to apex 26/i)`

#### 318–323: a cancel precedes every utterance and a resume follows it — Bugzilla 1522074, the same one the radio documents

Targets/fixtures: AN-script; AN-instance.

- L322: `assert.deepEqual(order, ["cancel", "speak", "resume"], order.join(","))`

#### 325–329: VOICE VOLUME reaches it — one slider for everything the game speaks

Targets/fixtures: AN-script; AN-instance.

- L328: `assert.equal(synth.calls.find((c) => c.m === "speak").volume, 0.3)`

#### 331–347: synth reads the current voice volume for each new line

Targets/fixtures: AN-script; AN-instance.

- L339: `assert.notEqual(first, second)`
- L340: `assert.equal(first.volume, 0.8, "already submitted speech is not rewritten")`
- L341: `assert.equal(second.volume, 0.2, "the next line follows the slider")`
- L343: `assert.equal(synth.calls.filter((c) => c.m === "speak").length, 2, "stale terminal callbacks cannot advance the next line")`
- L344: `assert.equal(ann.speaking(), true)`
- L346: `assert.equal(synth.calls.filter((c) => c.m === "speak").length, 2, "stop still retires the updated chain")`

#### 349–364: zero voice volume retires the synth read instead of submitting more speech

Targets/fixtures: AN-script; AN-instance.

- L356: `assert.equal(synth.calls.filter((c) => c.m === "speak").length, 1, "no fresh utterance at zero volume")`
- L357: `assert.equal(ann.speaking(), false, "a muted read no longer holds the voice channel")`
- L360: `assert.equal(synth.calls.filter((c) => c.m === "speak").length, 1, "raising volume cannot revive retired copy")`
- L362: `assert.equal(synth.calls.filter((c) => c.m === "speak").at(-1).volume, 0.6, "an explicit new read remains available")`

#### 368–384: `announcer` is a real RadioVoice channel, with prosody and a preview line

Targets/fixtures: AN-script.

- L373: `assert.ok(RV.TONE[A.CHANNEL], "no prosody for the announcer channel")`
- L374: `assert.ok(RV.SAMPLE[A.CHANNEL], "no TEST line for the announcer channel")`
- L375: `assert.ok(RV.TONE[A.CHANNEL].rate < RV.TONE.radio.rate, "the announcer reads a paragraph over a still screen; it must not be quicker than the pit call")`
- L381: `assert.deepEqual(kinds, ["comm"])`
- L383: `assert.equal(menu.reason, "not-racing")`

#### 395–409: the script is spoken one line per utterance, in order

Targets/fixtures: AN-script; AN-instance.

- L400: `assert.equal(spoken(synth).length, 1, "only the FIRST line may be handed over up front")`
- L404: `assert.ok(said.length >= 4, "the whole script must be read, one line at a time: " + said.length)`
- L405: `assert.match(said[0], /welcome to apex 26/i, "and in order, opening with the welcome")`
- L406: `assert.match(said.at(-1), /racing/i, "…and ending with the last line of the script")`
- L407: `assert.ok(said.every((t) => !/welcome to apex 26.*monza/i.test(t)), "no utterance may carry two lines — that is the join() this split replaced")`

#### 411–434: no single utterance can hit Chrome's ~14 s cap

Targets/fixtures: AN-script; AN-instance.

- L431: `assert.ok(secs < 14, ˋ"${text}" is ${secs.toFixed(1)} s — Chrome drops an utterance past ~14 sˋ)`

#### 436–447: a stopped read does not wake up and carry on talking

Targets/fixtures: AN-script; AN-instance.

- L446: `assert.equal(spoken(synth).length, first, "stop() must end the chain, not pause it")`

#### 449–461: a cancel from OUTSIDE the announcer ends its read instead of skipping to the next line

Targets/fixtures: AN-script; AN-instance.

- L460: `assert.equal(spoken(synth).length, first, "an interrupted line ends the chain")`

#### 464–480: `a system utterance settled by ${firstEvent} cannot disturb its successor`

Targets/fixtures: AN-script; AN-instance.

- L471: `assert.equal(spoken(synth).length, 2, "a terminal event starts exactly the next line")`
- L475: `assert.equal(spoken(synth).length, 2, "settled line events cannot skip or queue later lines")`
- L476: `assert.equal(ann.speaking(), true, "a settled line cannot retire the active line")`
- L478: `assert.equal(spoken(synth).length, 3, "the active line still owns progression")`

#### 483–504: the announcer may use a network voice; the race radio may not

Targets/fixtures: AN-script; AN-instance.

- L497: `assert.ok(!forRadio.some((n) => /Online \(Natural\)/.test(n)), "a race-radio line cannot wait on a network round trip")`
- L499: `assert.ok(forAnn.some((n) => /Online \(Natural\)/.test(n)), "the announcer has no card to miss, and this is the voice the channel is for")`
- L501: `assert.ok(forRadio.length < forAnn.length)`
- L502: `assert.equal(RV.REMOTE_OK.announcer, true)`
- L503: `assert.ok(!RV.REMOTE_OK.radio && !RV.REMOTE_OK.control && !RV.REMOTE_OK.coach)`

#### 506–529: pickVoice prefers the neural and enhanced voices over the compact ones

Targets/fixtures: AN-script.

- L510: `assert.match(A.pickVoice([ { name: "Microsoft George - English (United Kingdom)", lang: "en-GB" }, { name: "Microsoft Ryan Online (Natural) - English (United Kingdom)", lang: "en-GB" }, ], "").name, /Ryan/)`
- L515: `assert.match(A.pickVoice([ { name: "Daniel", lang: "en-GB" }, { name: "Daniel (Enhanced)", lang: "en-GB" }, ], "").name, /Enhanced/)`
- L520: `assert.match(A.pickVoice([ { name: "Google US English", lang: "en-US" }, { name: "Google UK English Male", lang: "en-GB" }, ], "").name, /UK English Male/)`
- L525: `assert.equal(A.pickVoice([ { name: "Daniel (Enhanced)", lang: "en-GB" }, { name: "Microsoft George - English (United Kingdom)", lang: "en-GB" }, ], "Microsoft George - English (United Kingdom)").name, "Microsoft George - English (United Kingdom)")`

#### 540–547: the last line names the session — and it IS the last line, whatever else was said

Targets/fixtures: AN-script.

- L541: `assert.match(tail(info()), /^12 laps\. Let's go racing\.$/)`
- L542: `assert.match(tail(info({ session: "quali" })), /Qualifying\./)`
- L543: `assert.match(tail(info({ session: "quali", practice: true })), /Qualifying practice\./)`
- L544: `assert.match(tail(info({ session: "tt" })), /Time trial\./)`
- L545: `assert.match(tail(info({ practice: true })), /^Practice\./)`
- L546: `assert.match(tail(info({ duel: true })), /^A duel\. Just the two of you/)`

#### 549–554: a duel names the rival when there is one to name

Targets/fixtures: AN-script; AN-instance.

- L551: `assert.match(withLegend, /A duel with Senna\./, "the legend id is shouted for the picker's chip; a broadcast says the name")`
- L553: `assert.ok(!/SENNA/.test(withLegend), "all-caps reaches the synth as spelled-out letters")`

#### 556–559: the session outranks the laps, so a quali read never promises a race

Targets/fixtures: AN-script.

- L558: `assert.ok(!/12 laps/.test(q), "qualifying is one lap — the race distance is not part of it")`

#### 563–573: every circuit has a lore row, and every lore row has a circuit

Targets/fixtures: AN-script.

- L571: `assert.deepEqual(lore.filter((id) => !onDisk.includes(id)), [], "a lore row names no circuit")`
- L572: `assert.deepEqual(onDisk.filter((id) => !lore.includes(id)), [], "a circuit has no lore row")`

#### 575–590: every lore line is one spoken sentence the synth can read

Targets/fixtures: AN-script; AN-instance.

- L578: `assert.ok(row.line, ˋ${id} has no identity lineˋ)`
- L581: `assert.match(text, /[.!?]$/, ˋ${where} is not punctuated — the synth runs it into the next lineˋ)`
- L582: `assert.ok(!/\bGP\b/.test(text), ˋ${where} says "GP"; speakable() reads that as two lettersˋ)`
- L586: `assert.deepEqual(shouty, [], ˋ${where} carries ALL-CAPS ${shouty.join(", ")}ˋ)`
- L587: `assert.ok(text.length < 160, ˋ${where} is ${text.length} chars — one sentence, not a paragraphˋ)`

#### 595–602: every night circuit has a night line, so the announcer has something to say after dark

Targets/fixtures: AN-script.

- L600: `assert.ok(nights.includes("baku") && nights.length >= 7, ˋonly found ${nights.join(", ")}ˋ)`
- L601: `assert.deepEqual(nights.filter((id) => !BAKED_GAP.includes(id) && !CircuitLore.LORE[id].night), [], "a night circuit has no ˋnightˋ lore slot")`

#### 604–607: Baku's night line is a known gap (voice bake pending)

Targets/fixtures: AN-script.

- L606: `assert.ok(CircuitLore.LORE.baku.night, "Baku is night: true but has no night lore line")`

#### 611–614: no lore line states a duration the circuit does not have (Istanbul turn eight is seconds, not a minute)

Targets/fixtures: AN-script.

- L613: `assert.doesNotMatch(CircuitLore.LORE.istanbul.corner, /minute/)`

#### 616–629: the circuit's own line is spoken, and outranks the numbers when the budget is tight

Targets/fixtures: AN-script.

- L618: `assert.match(said(spa), /Ardennes/, "Spa's identity line never reached the script")`
- L619: `assert.match(said(spa), /Eau Rouge/, "…nor the corner it is known for")`
- L626: `assert.match(kept, /Ardennes/, ˋat ${ms} ms the length survived and the circuit's own line did notˋ)`

#### 631–637: a wet circuit reads its OWN wet line, not the generic one

Targets/fixtures: AN-script.

- L633: `assert.match(said(info({ track: spa, weather: "rain" })), /rain on one half of this circuit/i)`
- L636: `assert.match(said(plain), /Heavy rain/)`

#### 641–657: the script fits the flyby, and never loses the line that ends it

Targets/fixtures: AN-script.

- L652: `assert.ok(fitted.length < full.length, "the worst case already fits — this test is not measuring anything")`
- L654: `assert.ok(secs <= 24, ˋthe fitted read is ${secs.toFixed(1)} s against a 24 s flybyˋ)`
- L655: `assert.match(fitted.slice(-1)[0], /Let's go racing\.$/, "the cue the player waits for was dropped")`
- L656: `assert.match(fitted[0], /^Welcome to Apex 26\.$/)`

#### 659–666: an impossible budget keeps the must-haves rather than falling silent

Targets/fixtures: AN-script.

- L664: `assert.deepEqual(fitted, ["Welcome", "This", "12"], "welcome, venue and session are priority 0 — a one-millisecond budget still says them")`

#### 694–720: recorded introductions preserve voice identity, skip unknown stories and cancel pending downloads

Targets/fixtures: AN-script; AN-instance; AN-recorded.

- L706: `assert.equal(a.play(["Welcome", "unknown career detail", "Let's go racing"], 5000, true), true)`
- L707: `assert.equal(a.speaking(), true)`
- L709: `assert.equal(calls.filter((c) => c.id).length, 0, "skip retires the pending load")`
- L713: `assert.equal(spoken[0].id, "bella")`
- L714: `assert.equal(spoken[0].o.fx, "announcer")`
- L717: `assert.deepEqual(spoken.map((c) => c.text), ["Welcome", "Let's go racing"])`
- L718: `assert.ok(spoken.every((c) => c.id === "bella"))`
- L719: `assert.equal(a.speaking(), false)`

#### 735–767: recorded preview aborts release ownership at every asynchronous gate

Targets/fixtures: AN-script; AN-recorded.

- L751: `assert.equal(spoken[0].options.valid(), false)`
- L754: `assert.equal(a.speaking(), false, "an aborted unbudgeted preview releases its ownership")`
- L755: `assert.deepEqual(stops, ["intro", "intro"], "abort stops the owned channel once")`
- L758: `assert.equal(spoken.length, before, "resume cannot restart the abandoned read")`
- L761: `assert.equal(spoken.at(-1).text, "replacement")`
- L763: `assert.equal(a.speaking(), false, "a subsequent preview completes normally")`

#### 738–764: `${state} during ${stage}`

Targets/fixtures: AN-script; AN-recorded.

- L751: `assert.equal(spoken[0].options.valid(), false)`
- L754: `assert.equal(a.speaking(), false, "an aborted unbudgeted preview releases its ownership")`
- L755: `assert.deepEqual(stops, ["intro", "intro"], "abort stops the owned channel once")`
- L758: `assert.equal(spoken.length, before, "resume cannot restart the abandoned read")`
- L761: `assert.equal(spoken.at(-1).text, "replacement")`
- L763: `assert.equal(a.speaking(), false, "a subsequent preview completes normally")`

#### 769–794: stale recorded callbacks cannot release a replacement preview

Targets/fixtures: AN-script; AN-recorded.

- L784: `assert.equal(old.options.valid(), false)`
- L787: `assert.equal(a.speaking(), true, "only the current generation can release ownership")`
- L788: `assert.equal(stops.length, stopCount, "old callbacks cannot stop the current channel")`
- L789: `assert.equal(spoken.length, count, "old callbacks cannot schedule another line")`
- L791: `assert.equal(a.speaking(), false)`

#### 771–792: stage

Targets/fixtures: AN-script; AN-recorded.

- L784: `assert.equal(old.options.valid(), false)`
- L787: `assert.equal(a.speaking(), true, "only the current generation can release ownership")`
- L788: `assert.equal(stops.length, stopCount, "old callbacks cannot stop the current channel")`
- L789: `assert.equal(spoken.length, count, "old callbacks cannot schedule another line")`
- L791: `assert.equal(a.speaking(), false)`

#### 808–824: `explicit recorded ${method} plays while the race is paused`

Targets/fixtures: AN-script; AN-recorded.

- L811: `assert.equal(f.ann[method] (info()), true)`
- L813: `assert.equal(f.spoken.length, 1, "an accepted audition must reach the recorded pack")`
- L814: `assert.equal(f.spoken[0].options.valid(), true, "decode validity also permits this paused audition")`
- L820: `assert.equal(g.spoken[0].options.valid(), false, ˋ${gate} still aborts an explicit auditionˋ)`
- L821: `assert.equal(g.ann.speaking(), false)`
- L822: `assert.equal(g.ann[method] (info()), false, ˋ${gate} also refuses a new auditionˋ)`

#### 828–835: `automatic recorded ${method} still aborts while paused`

Targets/fixtures: AN-script; AN-instance; AN-recorded.

- L833: `assert.equal(f.spoken.length, 0)`
- L834: `assert.equal(f.ann.speaking(), false)`

#### 838–854: recorded introductions reserve the closing cue before adding optional colour

Targets/fixtures: AN-script; AN-instance; AN-recorded.

- L852: `assert.deepEqual(calls, ["welcome", "venue", "closing"], "optional colour cannot consume the lights-out cue's time")`
- L853: `assert.equal(a.speaking(), false)`

#### 856–877: unrecorded numbered sprints and named duels retain a recorded closing cue and its timing

Targets/fixtures: AN-script; AN-instance; AN-recorded.

- L870: `assert.equal(a.readMs([original]), 2850)`
- L873: `assert.equal(calls.at(-1).text, generic[i])`
- L874: `assert.equal(calls.at(-1).at, start + 2400, "the generic closing still lands before the flyby ends")`

#### 892–912: play() holds the LAST line so it finishes ~600 ms before the flyby's budget ends

Targets/fixtures: AN-script; AN-instance.

- L897: `assert.equal(An.create(G).play(info(), budget), true)`
- L899: `assert.ok(starts.length >= 3, "the whole script was read: " + starts.length)`
- L901: `assert.match(last.text, /racing/i, "the held line is the session cue")`
- L905: `assert.ok(starts[k].at - starts[k - 1].at <= 50, ˋline ${k} was delayed: ${JSON.stringify(starts)}ˋ)`
- L909: `assert.ok(Math.abs(last.at - want) <= 50, ˋlast line started at +${last.at - t0} ms, want +${Math.round(want - t0)} ms (budget ${budget}, est ${Math.round(est)})ˋ)`
- L911: `assert.ok(last.at - starts.at(-2).at > 1000, "…which is a real hold, not the chain's own pace")`

#### 914–923: the hold never makes the read LATER than the chain would reach the last line anyway

Targets/fixtures: AN-script; AN-instance.

- L921: `assert.ok(starts.length >= 2, JSON.stringify(starts))`
- L922: `assert.ok(starts[k].at - starts[k - 1].at <= 50, JSON.stringify(starts))`

#### 925–932: preview() is NOT held — the editor's PLAY reads straight through

Targets/fixtures: AN-script; AN-instance.

- L930: `assert.match(starts.at(-1).text, /racing/i)`
- L931: `assert.ok(starts[k].at - starts[k - 1].at <= 50, JSON.stringify(starts))`

#### 934–945: a stop() during the hold means the held line is never spoken

Targets/fixtures: AN-script; AN-instance.

- L941: `assert.ok(!/racing/i.test(spoken(synth).at(-1)), "still holding the cue at +3 s")`
- L944: `assert.equal(spoken(synth).length, before, "the skip that ended the flyby ended the held cue too")`

#### 960–972: the story reads the seat, the championship, the target and the forecast — before the lights cue

Targets/fixtures: AN-script.

- L963: `assert.match(all, /Lando Norris for McLaren, with Piastri in the sister car\./)`
- L964: `assert.match(all, /Round 5 of 24\. Verstappen leads the championship; you are 3rd, 18 points back\./)`
- L965: `assert.match(all, /The target this season: finish P5 or better in the championship\./)`
- L966: `assert.match(all, /Rain is on the way, in about 5 minutes\./)`
- L967: `assert.match(lines.at(-1), /Let's go racing\.$/, "the session cue stays last")`
- L969: `assert.match(l, /\.$|!$/, ˋ"${l}" is not a sentenceˋ)`
- L970: `assert.doesNotMatch(l, /undefined|NaN|\[object/)`

#### 974–982: leading the championship, and the final round, read as themselves

Targets/fixtures: AN-script.

- L976: `assert.match(lead, /The final round, and you lead the championship by 7 points\./)`
- L978: `assert.match(chase, /It all comes down to this\./)`
- L981: `assert.doesNotMatch(r1, /championship/)`

#### 984–989: a forecast that matches the current weather says nothing; dry race, no rain words

Targets/fixtures: AN-script.

- L986: `assert.doesNotMatch(same, /on the way/)`
- L988: `assert.doesNotMatch(dry, /rain|wet|fog/i)`

#### 991–995: the story never displaces a must-keep: at a 1 ms budget the same three lines survive

Targets/fixtures: AN-script.

- L993: `assert.deepEqual(JSON.parse(JSON.stringify(kept.map((l) => l.split(" ")[0]))), ["Welcome", "This", "12"])`
- L994: `assert.ok(r.prio >= 1, ˋ"${r.text}" is priority ${r.prio}ˋ)`

#### 997–1000: a sprint states the sprint distance, and still ends on the lights cue

Targets/fixtures: AN-script.

- L999: `assert.match(lines.at(-1), /^The sprint\. 8 laps, flat out from the start\. Let's go racing\.$/)`

#### 1002–1011: the venue line rotates between visits and always opens 'This is'

Targets/fixtures: AN-script.

- L1006: `assert.match(venue, /^This is /)`
- L1007: `assert.match(venue, /Monza/)`
- L1007: `assert.match(venue, /Italian Grand Prix/)`
- L1010: `assert.equal(seen.size, 3)`

#### 1013–1034: the wrap-up names the winner, the margin, your race against your grid slot, and the fastest lap

Targets/fixtures: AN-script.

- L1019: `assert.deepEqual(JSON.parse(JSON.stringify(lines)), [ "Fernando Alonso wins the Italian Grand Prix, 1.2 seconds ahead of Ocon.", "You finish 6th, up 6 places from 12th on the grid.", "Fastest lap to Piastri, a 1 21.5.", ])`
- L1025: `assert.equal(won[0], "And you win the Italian Grand Prix, 3.1 seconds clear.")`
- L1027: `assert.equal(podium[1], "A podium for you, 3rd.")`
- L1029: `assert.match(out[1], /retirement/)`
- L1032: `assert.ok(RV.estimate(RV.speakable(l), 0.92) < 14, ˋ"${l}" is too long for one utteranceˋ)`

#### 1036–1041: a photo-finish margin is read as a tenth, never '0.0 seconds'

Targets/fixtures: AN-script.

- L1039: `assert.doesNotMatch(txt, /0\.0 seconds/)`
- L1040: `assert.match(txt, /0\.1 seconds ahead of Norris/)`

#### 1043–1050: a margin that rounds up to ten is read as '10', never '10.0 seconds'

Targets/fixtures: AN-script.

- L1046: `assert.doesNotMatch(txt, /10\.0/)`
- L1047: `assert.match(txt, /10 seconds ahead of Norris/)`
- L1048: `assert.match(A.wrapRows({ event: "x", n: 20, winner: { name: "Max Verstappen" }, second: "Lando Norris", margin: 9.94, you: { pos: 5, grid: 5 } }).join(" "), /9\.9 seconds ahead/)`

#### 1053–1067: `the public wrap-up reports player disqualification instead of a finish or retirement (retired=${retired})`

Targets/fixtures: AN-script; AN-instance.

- L1063: `assert.match(text, /you have been disqualified/i)`
- L1064: `assert.doesNotMatch(text, /you finish|podium|up 5 places|retirement|fastest lap to you/i)`
- L1065: `assert.doesNotMatch(text, /seconds ahead of piastri/i, "DSQ is not a classified runner-up")`

#### 1070–1080: the public wrap-up omits a DSQ runner-up margin when the player wins

Targets/fixtures: AN-script; AN-instance.

- L1077: `assert.match(spoken(synth)[0], /you win/i)`
- L1078: `assert.doesNotMatch(spoken(synth).join(" "), /seconds clear|ahead of/i)`

#### 1082–1093: the wrap-up reads the result the stewards gave: a penalty is part of the margin, and a sprint is the sprint

Targets/fixtures: AN-script; AN-instance.

- L1088: `assert.equal(a.wrapUp([you, ver], info({ sprint: true })), true)`
- L1091: `assert.match(text, /win the sprint, 2\.0 seconds clear/, text)`
- L1092: `assert.doesNotMatch(text, /7\.0|Grand Prix/, text)`

#### 1095–1111: the wrap-up credits the fastest lap among cars that took the flag, never a retired car

Targets/fixtures: AN-script; AN-instance.

- L1102: `assert.equal(a.wrapUp([ver, you, lec], info()), true)`
- L1109: `assert.doesNotMatch(text, /fastest lap to leclerc/i, text)`
- L1110: `assert.match(text, /fastest lap to you/i, text)`

#### 1113–1127: the wrap-up credits a fastest lap set by a car still running at the flag

Targets/fixtures: AN-script; AN-instance.

- L1120: `assert.equal(a.wrapUp([ver, you, lec], info()), true)`
- L1126: `assert.match(text, /fastest lap to (charles )?leclerc/i, text)`

#### 1129–1134: a flyby with no room before the grid shot plays nothing — a zero budget used to mean 'no limit'

Targets/fixtures: AN-script; AN-instance.

- L1132: `assert.equal(a.play(info(), -1), false)`
- L1133: `assert.equal(synth.calls.filter((c) => c.m === "speak").length, 0)`

#### 1137–1152: a real race says whose car you took and from which lap, and a rolling join is not a grid

Targets/fixtures: AN-script.

- L1140: `assert.match(join, /You take over Charles Leclerc's car on lap 12 of 53\./, "no timing to read: the plain line")`
- L1141: `assert.match(join, /A rolling start\. The car is yours in a few seconds\.$/, "a mid-race join is a rolling start, not 'N laps'")`
- L1142: `assert.doesNotMatch(join, /12 laps\. Let's go racing/)`
- L1145: `assert.match(grid, /You start from Charles Leclerc's grid slot/)`
- L1146: `assert.match(grid, /12 laps\. Let's go racing\.$/, "from lap 1 it is a race of the staged distance")`
- L1149: `assert.match(watch, /Your camera follows Charles Leclerc\./)`
- L1150: `assert.match(watch, /The highlights\. Sit back and watch it unfold\.$/)`
- L1151: `assert.doesNotMatch(watch, /You take over|Let's go racing/, "a replay is watched, not raced")`

#### 1154–1159: a real race's story is the script's driver, never the roster seat's name, season or contract

Targets/fixtures: AN-script.

- L1157: `assert.match(body, /const race = [^;]*&& !info\.real;/, "the seat / championship / goal / forecast rows stand down for a real race")`
- L1158: `assert.match(body, /if \(info\.real\) st\.real = info\.real;/)`

#### 1189–1207: a mid-race JUMP IN reads the race as it stands: lap, leader, your place and gap, neighbours, tyres, flags, retirements

Targets/fixtures: AN-script.

- L1204: `assert.ok(lines.includes(want), ˋmissing: "${want}"\n${lines.join("\n")}ˋ)`
- L1205: `assert.doesNotMatch(all, /under the lights/, "a daytime Baku is not a night race")`
- L1206: `assert.ok(lines.indexOf("Lap 40 of 51, and 12 laps to go.") < lines.indexOf("A rolling start. The car is yours in a few seconds."))`

#### 1209–1226: the race story outranks the circuit's own lines when the budget is short

Targets/fixtures: AN-script.

- L1212: `assert.ok(fitted.length < full.length, "24 s cannot hold all of it")`
- L1214: `assert.ok(fitted.includes(keep), ˋkept: ${keep}\n${fitted.join("\n")}ˋ)`
- L1220: `assert.ok(at[i] >= at[i - 1], ˋ"${order[i]}" (${at[i]} ms) arrives before "${order[i - 1]}" (${at[i - 1]} ms)ˋ)`
- L1221: `assert.ok(at[at.length - 1] <= 60000, ˋthe essentials fit the stretched flyby (LoadingScreen.FLY_MAX_MS, 60 s): ${at.join(", ")}ˋ)`
- L1222: `assert.ok(!fitted.includes("107 passes on track in this race so far."), "the counts go first")`
- L1225: `assert.ok(!fitted.includes(l), ˋa circuit fact outlived the story: ${l}ˋ)`

#### 1228–1243: a WATCH names the driver where a join says 'you', and a lap-1 join reads the real grid

Targets/fixtures: AN-script.

- L1230: `assert.match(w, /Your camera follows Charles Leclerc, fifth, 3\.3 seconds off the lead, down three places from second on the grid\./)`
- L1231: `assert.match(w, /Hadjar is 0\.6 seconds ahead, and Hamilton 0\.6 seconds behind\./)`
- L1232: `assert.match(w, /Leclerc is on mediums, 8 laps old/)`
- L1233: `assert.doesNotMatch(w, /You take over|\byou\b/i.test(w) ? /You take over/ : /x^/)`
- L1241: `assert.ok(g.includes(want), ˋmissing: "${want}"\n${g.join("\n")}ˋ)`
- L1242: `assert.match(g[g.length - 1], /laps\. Let's go racing\.$/)`

#### 1245–1258: recorded readMs only stretches the flyby for covered audio, with a bounded loading fallback

Targets/fixtures: AN-script; AN-instance; AN-recorded.

- L1254: `assert.equal(a.readMs(bakuJoin()), 0, "loading keeps the ordinary flyby length")`
- L1256: `assert.equal(a.readMs(bakuJoin()), 2850, "unrecorded story copy does not add silent waiting")`
- L1257: `assert.deepEqual(ids, ["bella", "bella"])`

#### 1260–1271: readMs is the full read's length at the channel's rate, and 0 when nothing will be said

Targets/fixtures: AN-script; AN-instance.

- L1265: `assert.ok(ms > (words / 2.4) * 1000 * 0.8 && ms < (words / 2.4) * 1000 * 1.6 + 10000, ˋ${ms} ms for ${words} wordsˋ)`
- L1266: `assert.ok(ms > 24000, "the race-so-far read is longer than a normal flyby — which is why it stretches (to LoadingScreen.FLY_MAX_MS, then fitted)")`
- L1268: `assert.equal(off.A.create(off.G).readMs(bakuJoin()), 0, "announcer off: nothing to wait for")`
- L1270: `assert.equal(mute.A.create(mute.G).readMs(bakuJoin()), 0, "sound off: nothing to wait for")`

#### 1273–1278: turning off an idle announcer does not cancel a different speaker

Targets/fixtures: AN-script; AN-instance.

- L1277: `assert.equal(synth.calls.filter(c=>c.m==='cancel').length,before)`

#### 1280–1284: starting an announcer audition releases the radio owner and pending cue

Targets/fixtures: AN-script; AN-instance.

- L1283: `assert.equal(ann.sample(),true)`
- L1283: `assert.equal(stops,1)`

#### 1291–1301: a fitted read fits AS SPOKEN — the pauses between lines and the landing count, or the cue is the line the cut takes

Targets/fixtures: AN-script.

- L1297: `assert.ok(lines.length === must || spokenS(lines, rate) <= b / 1000 + 1e-9, ˋ${lines.length} lines take ${spokenS(lines, rate).toFixed(2)} s spoken, over a ${b / 1000} s budgetˋ)`

#### 1303–1316: the read is fitted at the PLAYER'S announcer rate: a slow voice is trimmed to fit, a fast one keeps more

Targets/fixtures: AN-script; AN-instance.

- L1310: `assert.ok(lines.length === must || spokenS(lines, r) <= 24 + 1e-9, ˋrate ${r}: ${spokenS(lines, r).toFixed(2)} s over 24 sˋ)`
- L1314: `assert.ok(slow < dflt, ˋa slow voice keeps fewer lines (${slow} vs ${dflt}) — fitted at the default it was cut mid-read at 24 sˋ)`
- L1315: `assert.ok(fast > dflt, ˋa fast voice keeps more (${fast} vs ${dflt})ˋ)`

#### 1319–1325: storm introductions warn of heavy rain and preserve the existing wet circuit read

Targets/fixtures: AN-script; AN-recorded.

- L1321: `assert.match(said(plain), /heavy rain/i, "storm is wet weather, not an unmentioned dry default")`
- L1323: `assert.match(said(spa), /rain on one half of this circuit/i, "reuse the authored wet read and its recorded coverage")`
- L1324: `assert.equal(said(spa), said({ ...spa, weather: "rain" }), "storm keeps the established heavy-rain narration")`

### tests/unit/apex-server-fixes.test.mjs

#### 48–57: runSpawn treats byte-bounded truncation as an explicit failure

Targets/fixtures: MCP-core; MCP-process/results.

- L52: `assert.equal(r.ok, false)`
- L53: `assert.equal(r.error, "output_truncated")`
- L54: `assert.equal(r.out, null, "a missing terminal verdict cannot be success")`
- L55: `assert.equal(Buffer.byteLength(r.stdout), 8 * 1024 * 1024, "returned output is byte-bounded")`
- L56: `assert.deepEqual(r.truncated, { stdout: true, stderr: false, stdoutBytes: n + 11, stderrBytes: 0, capBytes: 8 * 1024 * 1024 })`

#### 59–86: durable jobs have exclusive cross-owner identities and cancellation converges

Targets/fixtures: MCP-core; EX-jobs.

- L70: `assert.notEqual(one.jobId, two.jobId)`
- L72: `assert.ok(fs.existsSync(path.join(dir, ˋ${one.jobId}.jsonˋ)) && fs.existsSync(path.join(dir, ˋ${two.jobId}.jsonˋ)))`
- L73: `assert.equal(body(await b.apex_job_cancel({ jobId: one.jobId })).state, "cancelled")`
- L74: `assert.equal(body(await a.apex_job_cancel({ jobId: two.jobId })).state, "cancelled")`
- L80: `assert.equal(body(await a.apex_job_status({ jobId: one.jobId })).state, "cancelled", "original owner adopts disk cancellation")`
- L82: `assert.ok(filtered.jobs.some((j) => j.jobId === one.jobId), "state filter reconciles before filtering")`
- L83: `assert.equal(body(await a.apex_job_status({ jobId: one.jobId, wait: 1 })).state, "cancelled", "wait loop reconciles before waiting")`
- L84: `assert.ok(fs.existsSync(path.join(dir, ˋ${one.jobId}.cancelledˋ)), "exclusive marker survives stale manifest writes")`

#### 88–117: job reservation failure removes owned files and releases a browser lock

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L99: `assert.equal(r.error, "job_spawn_failed")`
- L100: `assert.equal(attempts, attempt, "released admission permits another spawn attempt")`
- L101: `assert.equal(f.locks(), 0, "failed reservation releases its browser lock")`
- L102: `assert.deepEqual(fs.readdirSync(dir), [".admission"], "no starting manifest, job log or reservation remains")`
- L106: `assert.deepEqual(epochs, expected, "only the latest two coordination epochs survive; no temporary files leak")`
- L109: `assert.equal(claim.state, "released", "persistent coordination cannot leave admission held")`
- L110: `assert.equal(claim.owner.pid, process.pid)`
- L111: `assert.equal(typeof claim.owner.birth, "string")`
- L112: `assert.ok(claim.owner.birth.length > 0)`
- L113: `assert.match(claim.token, /^[0-9a-f-]{36}$/i, "each released epoch retains complete ownership identity")`

#### 119–131: abort closes a persistent track open and releases its lock

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-track/survey.

- L127: `assert.equal(r.error, "cancelled")`
- L128: `assert.equal(f.locks(), 0)`
- L129: `assert.equal(body(await x.apex_track({ op: "status" })).error, "track_not_open")`

#### 133–147: abort of an active persistent track request closes the session

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-track/survey.

- L137: `assert.equal(body(await x.apex_track({ op: "open", track: "monza" })).ok, true)`
- L142: `assert.equal(r.error, "cancelled")`
- L144: `assert.equal(f.locks(), 0)`
- L145: `assert.equal(body(await x.apex_track({ op: "status" })).error, "track_not_open")`

#### 149–157: track survey receives the dispatch abort signal before spawning

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-track/survey.

- L154: `assert.equal(r.error, "cancelled")`
- L155: `assert.equal(f.locks(), 0)`

#### 161–212: cross-owner browser cancellation retains occupancy until detached descendants are gone

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; EX-jobs.

- L183: `assert.equal(job.ok, true)`
- L185: `assert.ok(fs.existsSync(ready), "Node descendant installed its SIGTERM handler")`
- L191: `assert.equal(alive(rootPid), false, "root exited during cancellation grace period")`
- L192: `assert.equal(alive(childPid), true, "detached descendant still needs escalation")`
- L193: `assert.equal(held, true, "original owner's exit callback must retain the lock")`
- L197: `assert.equal(observer.runningBrowserJob()?.id, job.jobId, "disk cleanup state retains occupancy without an owner lock")`
- L199: `assert.equal(refused.error, "occupied")`
- L201: `assert.equal(cancelled.state, "cancelled")`
- L202: `assert.equal(cancelled.survivors, 0)`
- L203: `assert.equal(alive(childPid), false)`
- L204: `assert.equal(observer.runningBrowserJob(), null)`
- L205: `assert.equal(owner.runningBrowserJob(), null, "original owner converges with durable completion")`
- L206: `assert.equal(held, false)`

#### 215–247: surviving cleanup remains occupied and another owner can retry it

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L231: `assert.equal(left.ok, false, "cleanup with survivors must not claim success")`
- L232: `assert.equal(left.survivors, 1)`
- L233: `assert.equal(held, true)`
- L234: `assert.equal(retry.runningBrowserJob()?.id, job.jobId)`
- L236: `assert.equal(waiting.cleanupPending, true)`
- L237: `assert.equal(waiting.stillRunning, true, "status wait includes unfinished cleanup")`
- L238: `assert.equal(body(await retry.handlers.apex_job_cancel({ jobId: job.jobId })).survivors, 0)`
- L240: `assert.equal(held, false, "persistent owner releases only after durable completion")`
- L241: `assert.equal(retry.runningBrowserJob(), null)`
- L242: `assert.equal(alive(rootPid), false)`

#### 250–273: same-owner cancellation clears the old watcher before a new lock is acquired

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L262: `assert.equal(body(await owner.handlers.apex_job_cancel({ jobId: job.jobId })).survivors, 0)`
- L263: `assert.equal(held, false)`
- L267: `assert.equal(held, true, "old cleanup cannot unlink the next operation's lock")`
- L268: `assert.equal(releases, released, "successful cancellation releases exactly once")`

#### 276–316: durable cleanup excludes reused PIDs and keeps unknown live identities occupied

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L293: `assert.equal(unknown.ok, false)`
- L294: `assert.equal(unknown.survivors, 1)`
- L295: `assert.equal(observer.runningBrowserJob()?.id, id, "unknown identity fails closed")`
- L296: `assert.equal(alive(unrelated.pid), true)`
- L301: `assert.equal(incompatible.ok, false)`
- L302: `assert.equal(incompatible.survivors, 1)`
- L303: `assert.equal(observer.runningBrowserJob()?.id, id, "incompatible birth schemes retain occupancy")`
- L304: `assert.equal(alive(unrelated.pid), true, "incompatible identity cannot authorize a signal")`
- L309: `assert.equal(stale.survivors, 0, "original identity is gone")`
- L310: `assert.equal(alive(unrelated.pid), true, "PID-reusing process must never be signalled")`
- L311: `assert.equal(observer.runningBrowserJob(), null)`

#### 318–375: portable cleanup identities survive timezone changes and retain legacy ambiguity

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L342: `assert.equal(first.ok, false)`
- L343: `assert.deepEqual(signalled, [child.pid])`
- L345: `assert.match(marker.cleanup.identities[0].birth, /^ps-utc-v1:/)`
- L349: `assert.equal(retry.ok, false)`
- L350: `assert.deepEqual(signalled, [child.pid], "timezone/locale changes still identify the same live process")`
- L351: `assert.equal(observer.runningBrowserJob()?.id, id)`
- L357: `assert.equal(legacy.ok, false)`
- L358: `assert.equal(legacy.cleanupPending, true)`
- L359: `assert.deepEqual(signalled, [], "legacy ps identity cannot authorize a signal or prove PID reuse")`
- L360: `assert.equal(observer.runningBrowserJob()?.id, id)`
- L361: `assert.equal(alive(child.pid), true)`
- L365: `assert.equal(finished.ok, true, "legacy cleanup completes once the original PID is actually gone")`
- L366: `assert.equal(observer.runningBrowserJob(), null)`

### tests/unit/apex-tools-mcp.test.mjs

#### 70–80: apex-tools-mcp.mjs and shell entry exist

Targets/fixtures: MCP-core.

- L71: `assert.ok(fs.existsSync(MCP))`
- L72: `assert.ok(fs.existsSync(SH))`
- L74: `assert.match(src, /apex-tools-mcp/)`
- L75: `assert.match(src, /apex_/)`
- L78: `assert.doesNotMatch(src, /name:\s*"chrome_/)`
- L79: `assert.doesNotMatch(src, /name:\s*"tinyfish_/)`

#### 82–101: .mcp.json registers apex-tools alongside the separate debugger server

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L85: `assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [ "apex-lsp", "apex-tools", "browserstack", "chrome-devtools", "js-debugger", "playwright-official", ])`
- L93: `assert.equal(cfg.mcpServers["apex-tools"].type, "stdio")`
- L94: `assert.equal(cfg.mcpServers["apex-tools"].command, "bash")`
- L95: `assert.deepEqual(cfg.mcpServers["apex-tools"].args, ["tools/mcp/apex-tools-mcp.sh", "serve"])`
- L96: `assert.deepEqual(cfg.mcpServers["apex-tools"].args, catalog.stdio.args)`
- L97: `assert.equal(catalog.stdio.command, "bash")`
- L98: `assert.equal(catalog.http.bind, "127.0.0.1")`
- L99: `assert.equal(catalog.http.port, 3713)`
- L100: `assert.deepEqual(catalog.http.args, ["serve-http"])`

#### 103–123: playwright-official pin matches the wrapper's audited package and never @latest

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L112: `assert.equal(cfg.mcpServers["playwright-official"].command, "bash")`
- L113: `assert.deepEqual(cfg.mcpServers["playwright-official"].args, ["tools/mcp/playwright-mcp.sh", "run"])`
- L114: `assert.equal(pw, "@playwright/mcp@0.0.79")`
- L115: `assert.deepEqual(cursorCfg.mcpServers["playwright-official"], cfg.mcpServers["playwright-official"])`
- L118: `assert.equal(cfg.mcpServers["chrome-devtools-official"], undefined)`
- L119: `assert.match(fs.readFileSync(path.join(ROOT, "tools/mcp/chrome-devtools-mcp.sh"), "utf8"), /MCP_NPM_PACKAGE="chrome-devtools-mcp@1\.11\.0"/)`
- L121: `assert.doesNotMatch(JSON.stringify(cfg), /@latest/)`
- L122: `assert.doesNotMatch(JSON.stringify(cursorCfg), /@latest/)`

#### 125–151: browserstack pin matches the wrapper's audited package and never @latest; credentials stay env-only

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L133: `assert.equal(cfg.mcpServers["browserstack"].command, "bash")`
- L134: `assert.deepEqual(cfg.mcpServers["browserstack"].args, ["tools/mcp/browserstack-mcp.sh", "run"])`
- L135: `assert.equal(pin, "@browserstack/mcp-server@2.2.4")`
- L136: `assert.deepEqual(cursorCfg.mcpServers["browserstack"], cfg.mcpServers["browserstack"])`
- L139: `assert.equal(cfg.mcpServers["browserstack"].env, undefined)`
- L144: `assert.equal(run.status, 1)`
- L145: `assert.ok(run.stderr.includes("BROWSERSTACK_USERNAME") && run.stderr.includes("BROWSERSTACK_ACCESS_KEY"), run.stderr)`
- L148: `assert.equal(status.status, 0)`
- L149: `assert.ok(!status.stdout.includes(secret), "status must never print credential values")`
- L150: `assert.doesNotMatch(wrapper, /BROWSERSTACK_(USERNAME|ACCESS_KEY)=["']?[A-Za-z0-9]/)`

#### 153–159: .cursor/mcp.json locksteps the root catalog (Cloud/Claude load .mcp.json)

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-Cursor.

- L156: `assert.deepEqual(Object.keys(cursorCfg.mcpServers).sort(), Object.keys(rootCfg.mcpServers).sort())`
- L157: `assert.deepEqual(cursorCfg.mcpServers["apex-tools"], rootCfg.mcpServers["apex-tools"])`
- L158: `assert.equal(rootCfg.mcpServers["apex-tools"].type, "stdio")`

#### 161–175: help lists serve / list-tools / call / status

Targets/fixtures: MCP-core.

- L163: `assert.equal(r.status, 0, r.stderr)`
- L164: `assert.match(r.stdout, /serve/)`
- L165: `assert.match(r.stdout, /list-tools/)`
- L166: `assert.match(r.stdout, /call/)`
- L167: `assert.match(r.stdout, /status/)`
- L168: `assert.match(r.stdout, /apex_/)`
- L169: `assert.match(r.stdout, /apex_select_specs/)`
- L170: `assert.match(r.stdout, /apex_graph_parity/)`
- L171: `assert.match(r.stdout, /apex_shot/)`
- L172: `assert.doesNotMatch(r.stdout, /apex_carshot|apex_select_recall|apex_ui_survey|apex_gfx_probe|apex_wgx_validate_static/, "trimmed wraps must not be advertised — the last two wrapped CLIs that left with the 2026-09-03 WGX/TLX spike-out")`
- L174: `assert.match(r.stdout, /serve-http/)`

#### 177–181: shell help exits 0

Targets/fixtures: MCP-core.

- L179: `assert.equal(r.status, 0, r.stderr)`
- L180: `assert.match(r.stdout, /apex_/)`

#### 183–197: apex_status reports the chrome-devtools stdio known gap

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L185: `assert.equal(r.status, 0, r.stderr)`
- L187: `assert.equal(body.ok, true)`
- L188: `assert.match(body.knownGap.chromeDevtoolsStdio, /3712/)`
- L189: `assert.match(body.knownGap.hostPlaywrightMcp, /@playwright\/mcp/)`
- L190: `assert.match(body.knownGap.playwrightMcpStdio, /playwright/)`
- L191: `assert.ok(body.knownGap.outsideLock.includes("layout-audit"))`
- L192: `assert.ok(body.knownGap.outsideLock.includes("playwright-mcp"))`
- L193: `assert.equal(body.playwright.live, false)`
- L194: `assert.equal(body.playwright.suite, false)`
- L195: `assert.equal(body.playwright.hostMcp, false)`
- L196: `assert.equal(body.playwright.hostBrowser, false)`

#### 199–278: initialize → serverInfo.name === apex-tools-mcp; tools are apex_* only

Targets/fixtures: MCP-core; EX-jobs; EX-track/survey.

- L213: `assert.equal(out[0].result.serverInfo.name, "apex-tools-mcp")`
- L214: `assert.ok(out[0].result.capabilities.tools)`
- L217: `assert.deepEqual([...names].sort(), [ "apex_agent", "apex_bump_cache_check", "apex_car_audit", "apex_catalog", "apex_cursor_agents", "apex_debug_chrome", "apex_diagnostics", "apex_doctor", "apex_eval", "apex_frame_report", "apex_garage", "apex_garage_plan", "apex_graph_parity", "apex_help", "apex_hud_mock", "apex_hud_shot", "apex_hud_survey", "apex_job_cancel", "apex_job_start", "apex_job_status", "apex_locations", "apex_pick_tests", "apex_profile", "apex_profile_query", "apex_rotate_markings_check", "apex_select_specs", "apex_shot", "apex_shot_survey", "apex_status", "apex_track", "apex_track_audit", "apex_ui_diff", "apex_ui_fit", "apex_ui_inspect", "apex_ui_mission_plan", "apex_ui_shot", "apex_unit_test", "apex_verify_change_fast", "apex_viewer", ])`
- L259: `assert.match(n, /^apex_/)`
- L260: `assert.doesNotMatch(n, /^chrome_/)`
- L261: `assert.doesNotMatch(n, /^tinyfish_/)`
- L276: `assert.ok(!names.includes(never), ˋmust not wrap ${never}ˋ)`

#### 280–290: dryRun / mock apex_verify_change_fast pins --fast --json, never --wait or test-bg

Targets/fixtures: MCP-core.

- L282: `assert.equal(r.status, 0, r.stderr)`
- L284: `assert.equal(body.ok, true)`
- L285: `assert.ok(body.argv.includes("--fast"), body.argv)`
- L286: `assert.ok(body.argv.includes("--json"), body.argv)`
- L287: `assert.ok(!body.argv.includes("--wait"), body.argv)`
- L289: `assert.doesNotMatch(blob, /test-bg/)`

#### 292–301: apex_bump_cache_check argv never contains --apply

Targets/fixtures: MCP-core.

- L294: `assert.equal(r.status, 0, r.stderr)`
- L296: `assert.ok(body.argv.includes("--check"), body.argv)`
- L297: `assert.ok(body.argv.includes("--json"), body.argv)`
- L298: `assert.ok(!body.argv.includes("--apply"), body.argv)`
- L299: `assert.ok(!body.argv.includes("--at"), body.argv)`
- L300: `assert.ok(!body.argv.includes("--merge"), body.argv)`

#### 303–313: apex_shot: a directory `out` becomes the CLI's default file inside it

Targets/fixtures: MCP-core.

- L307: `assert.equal(r.status, 0, r.stderr)`
- L310: `assert.match(outArg, /mcp-track-test\/monaco-52-trackside\.png$/, body.argv)`
- L312: `assert.match(JSON.parse(r2.stdout).argv.find((a) => a.includes("mcp-track-test")), /x\.png$/)`

#### 315–326: apex_shot_survey dryRun plans a multi-shot session

Targets/fixtures: MCP-core; EX-track/survey.

- L317: `assert.equal(r.status, 0, r.stderr)`
- L319: `assert.equal(body.ok, true)`
- L320: `assert.equal(body.dryRun, true)`
- L321: `assert.equal(body.shots.length, 4)`
- L322: `assert.match(body.out, /artifacts\/track-survey\/monza-survey/)`
- L323: `assert.equal(typeof body.estimateMs, "number")`
- L325: `assert.equal(body.asyncDefault, true)`

#### 328–336: apex_shot_survey dryRun multi-track prefers async job

Targets/fixtures: MCP-core; EX-track/survey.

- L330: `assert.equal(r.status, 0, r.stderr)`
- L332: `assert.equal(body.ok, true)`
- L333: `assert.deepEqual(body.tracks, ["monza", "spa"])`
- L334: `assert.equal(body.asyncDefault, true)`
- L335: `assert.equal(body.shots.length, 4)`

#### 338–348: apex_shot_survey dryRun single-shot stays sync by default

Targets/fixtures: MCP-core; EX-track/survey.

- L345: `assert.equal(r.status, 0, r.stderr)`
- L347: `assert.equal(body.asyncDefault, false)`

#### 350–366: apex_job_start shot_survey dryRun builds shot-survey.mjs argv

Targets/fixtures: MCP-core; EX-jobs; EX-track/survey.

- L358: `assert.equal(r.status, 0, r.stderr)`
- L360: `assert.equal(body.ok, true)`
- L361: `assert.equal(body.kind, "shot_survey")`
- L362: `assert.ok(body.browser)`
- L363: `assert.ok(body.argv.some((a) => String(a).endsWith("shot-survey.mjs")), body.argv)`
- L364: `assert.ok(body.argv.includes("monza,spa"), body.argv)`
- L365: `assert.ok(body.argv.includes("dual_lite"), body.argv)`

#### 368–374: apex_pick_tests argv never contains --bg; includes --json

Targets/fixtures: MCP-core.

- L370: `assert.equal(r.status, 0, r.stderr)`
- L372: `assert.ok(body.argv.includes("--json"), body.argv)`
- L373: `assert.ok(!body.argv.includes("--bg"), body.argv)`

#### 376–384: target=deploy on a tree tool → tree_only

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L378: `assert.equal(r.status, 1, r.stderr)`
- L380: `assert.equal(body.ok, false)`
- L381: `assert.equal(body.error, "tree_only")`
- L382: `assert.match(body.fix || "", /deploy-research/i)`
- L383: `assert.doesNotMatch(body.fix || "", /tinyfish/i, "tree_only must not route to TinyFish")`

#### 386–396: url with github.io → github_io_blocked (no fetch)

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L390: `assert.equal(r.status, 1, r.stderr)`
- L392: `assert.equal(body.ok, false)`
- L393: `assert.equal(body.error, "github_io_blocked")`
- L394: `assert.match(body.fix || "", /deploy-research/i)`
- L395: `assert.doesNotMatch(body.fix || "", /tinyfish-mcp\.sh/, "the in-repo tinyfish wrapper is not the route any more")`

#### 398–426: tools/call preserves isError on tool failure (not JSON-RPC error)

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L421: `assert.equal(failed.error, undefined)`
- L422: `assert.equal(failed.result.isError, true)`
- L424: `assert.equal(text.ok, false)`
- L425: `assert.equal(text.error, "tree_only")`

#### 428–450: serve stdout is JSON-RPC only (no log lines)

Targets/fixtures: MCP-core.

- L446: `assert.equal(r.status, 0, r.stderr)`
- L448: `assert.doesNotThrow(() => JSON.parse(line), ˋnon-JSON stdout: ${line.slice(0, 120)}ˋ)`

#### 466–512: playwright occupancy matches `playwright test` tokens, not MCP JSON

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L468: `assert.equal( classifyPlaywrightLine("4321 /usr/bin/npx playwright test --reporter=line")?.kind, "suite", )`
- L472: `assert.equal( classifyPlaywrightLine(ˋ2430 /bin/bash -c timeout 1500 bash -c 'until grep -q done log; do sleep 15; done'; npx playwright test tests/specs/ui-scale.spec.js -g xˋ), null, "a shell whose command string merely mentions the suite is not a live suite", )`
- L477: `assert.equal(classifyPlaywrightLine("77 sh -c npx playwright test --reporter=line"), null)`
- L478: `assert.equal( classifyPlaywrightLine("5492 node /home/runner/work/f1-game/node_modules/.bin/playwright test tests/specs/hud-layout.spec.js")?.kind, "suite", )`
- L482: `assert.equal( classifyPlaywrightLine('12 /exec-daemon/cursor-exec-daemon --mcp-config {"playwright":{"command":"npx","args":["@playwright/mcp@latest"]}}'), null, "Cursor --mcp-config JSON is not a live Playwright process", )`
- L487: `assert.equal( classifyPlaywrightLine("88 node /opt/cursor/node_modules/@playwright/mcp/cli.js --headless")?.kind, "hostMcp", )`
- L491: `assert.equal( classifyPlaywrightLine("99 /opt/google/chrome/chrome --user-data-dir=/workspace/.playwright-mcp --headless")?.kind, "hostBrowser", )`
- L495: `assert.equal( classifyPlaywrightLine("260 node /root/.npm/_npx/51691537fc71f2b0/node_modules/.bin/playwright-mcp --isolated --headless --browser chromium --executable-path /opt/pw-browsers/chromium-1194/chrome-linux/chrome --no-sandbox --output-dir /home/user/f1-game/artifacts/playwright-mcp")?.kind, "hostMcp", "the idle server names a Chromium path and an output dir as ARGUMENTS — it is not the browser", )`
- L500: `assert.equal( classifyPlaywrightLine("137 npm exec @playwright/mcp@0.0.79 --isolated --headless --browser chromium --executable-path /opt/pw-browsers/chromium-1194/chrome-linux/chrome --no-sandbox")?.kind, "hostMcp", )`
- L508: `assert.equal(scan.live, true)`
- L509: `assert.equal(scan.hostMcp, true)`
- L510: `assert.equal(scan.suite, false)`
- L511: `assert.deepEqual(scan.pids, [2])`

#### 514–519: browser tool target=deploy → local_only

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L516: `assert.equal(r.status, 1, r.stderr)`
- L518: `assert.equal(body.error, "local_only")`

#### 521–530: browser tool github.io url → github_io_blocked (no fetch)

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L527: `assert.equal(r.status, 1, r.stderr)`
- L529: `assert.equal(body.error, "github_io_blocked")`

#### 532–540: apex_select_specs dryRun pins --since --json, never --bg

Targets/fixtures: MCP-core.

- L534: `assert.equal(r.status, 0, r.stderr)`
- L536: `assert.ok(body.argv.includes("--since"), body.argv)`
- L537: `assert.ok(body.argv.includes("HEAD~1"), body.argv)`
- L538: `assert.ok(body.argv.includes("--json"), body.argv)`
- L539: `assert.ok(!body.argv.includes("--bg"), body.argv)`

#### 542–548: apex_agent describe passes its id as --id (agent.mjs describe needs one)

Targets/fixtures: MCP-core.

- L544: `assert.equal(r.status, 0, r.stderr)`
- L546: `assert.equal(argv[argv.indexOf("--id") + 1], "corner:T1", argv)`
- L547: `assert.equal(callCli("apex_agent", { dryRun: true, command: "describe", id: "--url" }).status, 1, "id is flag-guarded")`

#### 550–555: apex_select_specs without since → bad_args

Targets/fixtures: MCP-core.

- L552: `assert.equal(r.status, 1, r.stderr)`
- L554: `assert.equal(body.error, "bad_args")`

#### 557–584: apex_garage: open spawns garage-angles --serve; ops refuse until open; call ends the session

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results.

- L562: `assert.equal(open.status, 0, open.stderr)`
- L564: `assert.ok(body.argv.some((a) => a.endsWith("garage-angles.mjs")), body.argv)`
- L565: `assert.ok(body.argv.includes("--serve") && body.argv.includes("ferrari"), body.argv)`
- L566: `assert.ok(!body.argv.includes("--url"))`
- L568: `assert.equal(three.status, 0, three.stderr)`
- L570: `assert.equal(threeArgv[threeArgv.indexOf("--backend") + 1], "three")`
- L571: `assert.equal(threeArgv[threeArgv.indexOf("--livery") + 1], "shipped")`
- L573: `assert.equal(shot.status, 0, shot.stderr)`
- L575: `assert.deepEqual(cmd, { design: { spineLogo: "wrap" }, frame: "spineTop", shot: "a" }, "keys ride along, applied design → frame → shot")`
- L577: `assert.equal(cold.status, 1)`
- L578: `assert.equal(JSON.parse(cold.stdout).error, "garage_not_open")`
- L580: `assert.equal(JSON.parse(esc.stdout).error, "path_escaped")`
- L582: `assert.match(src, /garageClose\("call ended"\)/, "a one-shot call cannot keep the child alive")`
- L583: `assert.match(src, /acquireLock\("apex_garage"\)/, "the session holds the browser lock while open")`

#### 586–591: apex_shot out outside artifacts/scratch → path_escaped

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L588: `assert.equal(r.status, 1, r.stderr)`
- L590: `assert.equal(body.error, "path_escaped")`

#### 593–615: tree pins: rotate-markings --check only, graph-parity needs base

Targets/fixtures: MCP-core.

- L595: `assert.equal(rot.status, 0, rot.stderr)`
- L597: `assert.ok(rotBody.argv.includes("--check"), rotBody.argv)`
- L598: `assert.ok(!rotBody.argv.includes("--write"), rotBody.argv)`
- L601: `assert.equal(gp.status, 0, gp.stderr)`
- L603: `assert.match(gpBody.argv.join(" "), /graph-parity\.cjs/)`
- L604: `assert.equal(gpBody.env.BASE, "HEAD~1")`
- L605: `assert.ok(gpBody.argv.includes("monza"), gpBody.argv)`
- L608: `assert.equal(gpMiss.status, 1, gpMiss.stderr)`
- L609: `assert.equal(JSON.parse(gpMiss.stdout).error, "bad_args")`
- L613: `assert.equal(gone.status, 1)`
- L614: `assert.equal(JSON.parse(gone.stdout).error, "unknown_tool")`

#### 617–676: apex_frame_report: tree tool, validated track / u / frames / shots, never --out or --fleet

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L620: `assert.equal(ok.status, 0, ok.stderr)`
- L622: `assert.match(argv.join(" "), /shot\/frame-report\.mjs --track monaco --u=0\.25,0\.5 --json$/)`
- L623: `assert.ok(!argv.some((a) => a.startsWith(bad)), bad)`
- L626: `assert.match(src, /name: "apex_frame_report",\s*week: 5,\s*kind: "tree"/)`
- L629: `assert.equal(fr.status, 0, fr.stderr)`
- L630: `assert.ok(body(fr).argv.includes("--frames=12"))`
- L652: `assert.equal(r.status, 1, ˋ${JSON.stringify(args)} should be refused: ${r.stdout}ˋ)`
- L654: `assert.equal(b.error, error, JSON.stringify(args))`
- L655: `assert.match(b.message, msg, JSON.stringify(args))`
- L658: `assert.equal(body(gone).error, "tree_only")`
- L668: `assert.equal(s.status, 0, s.stdout)`
- L670: `assert.equal(sa[sa.indexOf("--shots") + 1], fs.realpathSync(path.join(dir, "shots.json")))`
- L672: `assert.equal(body(l).error, "path_escaped")`

#### 678–688: committed catalog JSON matches tools/list and never binds 0.0.0.0

Targets/fixtures: MCP-core.

- L681: `assert.equal(r.status, 0, r.stderr)`
- L683: `assert.deepEqual(names, catalog.tools)`
- L685: `assert.match(src, /127\.0\.0\.1/)`
- L686: `assert.doesNotMatch(src, /listen\([^)]*0\.0\.0\.0/)`
- L687: `assert.match(src, /serve-http/)`

#### 690–742: serve-http /healthz and /mcp stay on loopback

Targets/fixtures: MCP-core.

- L713: `assert.equal(health.status, 200)`
- L715: `assert.equal(body.ok, true)`
- L716: `assert.equal(body.bind, "127.0.0.1")`
- L727: `assert.equal(rpc.status, 200)`
- L730: `assert.ok(names.includes("apex_graph_parity"), names)`
- L731: `assert.ok(names.every((n) => n.startsWith("apex_")))`
- L735: `assert.equal((await failed.json()).error.code, code, payload)`
- L737: `assert.deepEqual((await ping.json()).result, {})`

#### 744–751: apex_verify_change_fast classifies --fast partial (exit 2) as ok

Targets/fixtures: MCP-core.

- L746: `assert.match( src, /name === "apex_verify_change_fast" \? new Set\(\[0, 2\]\)/, "partial is the success outcome of --fast when browser groups remain", )`

#### 753–762: browser tool loopback url → url_not_supported in v1

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L759: `assert.equal(r.status, 1, r.stderr)`
- L761: `assert.equal(body.error, "url_not_supported")`

#### 765–776: tree tools do not take or refuse the browser lock

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L770: `assert.equal(r.status, 0, r.stderr)`
- L772: `assert.equal(body.ok, true)`

#### 778–789: week-1 tools do not take or refuse the browser lock

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L783: `assert.equal(r.status, 0, r.stderr)`
- L785: `assert.equal(body.ok, true)`

#### 791–803: week-2 dryRun refuses lock_held by a live PID (no Chromium)

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L796: `assert.equal(r.status, 1, r.stderr)`
- L798: `assert.equal(body.error, "lock_held")`
- L799: `assert.ok(body.fix)`

#### 805–817: the HUD survey wraps are browser tools: a held lock refuses both

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L811: `assert.equal(r.status, 1, r.stderr)`
- L812: `assert.equal(JSON.parse(r.stdout).error, "lock_held", name)`

#### 819–831: week-2 dryRun steals a stale lock (dead PID)

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L824: `assert.equal(r.status, 0, r.stderr + r.stdout)`
- L826: `assert.equal(body.ok, true)`
- L827: `assert.ok(!fs.existsSync(LOCK), "stale lock must be reaped")`

#### 833–840: week-2 dryRun refuses playwright_live from test-bg.json (no Chromium)

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L836: `assert.equal(r.status, 1, r.stderr)`
- L838: `assert.equal(body.error, "playwright_live")`

#### 842–879: a completed zombie supervisor cannot block browser tools

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L868: `assert.match(fs.readFileSync(ˋ/proc/${pid}/statˋ, "utf8"), /\) Z /)`
- L869: `assert.doesNotThrow(() => process.kill(pid, 0), "kill(0) alone incorrectly calls this zombie live")`
- L872: `assert.equal(r.status, 0, r.stderr + r.stdout)`
- L873: `assert.equal(JSON.parse(r.stdout).ok, true)`
- L877: `assert.equal(await closed, 0, "the fixture supervisor must reap its child and exit")`

#### 881–887: a reused PID with a different start identity cannot block browser tools

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L884: `assert.equal(r.status, 0, r.stderr + r.stdout)`
- L885: `assert.equal(JSON.parse(r.stdout).ok, true)`

#### 889–907: an IDLE host Playwright MCP server is reported, not occupancy; its launched browser is

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L895: `assert.equal(r.status, 0, r.stderr + r.stdout)`
- L896: `assert.equal(JSON.parse(r.stdout).ok, true, "an idle server must not refuse")`
- L899: `assert.equal(pw.hostMcp, true, "…but it is still reported")`
- L900: `assert.equal(pw.busy, false)`
- L903: `assert.equal(b.status, 1, b.stderr + b.stdout)`
- L905: `assert.equal(body.error, "playwright_live")`
- L906: `assert.match(body.message, /Playwright MCP browser/)`

#### 909–922: a live Node-only test-bg group does not impersonate Playwright

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L919: `assert.equal(r.status, 0, r.stderr + r.stdout)`
- L920: `assert.equal(JSON.parse(r.stdout).ok, true)`

#### 924–961: week-2 dryRun refuses chrome_daemon_up when /healthz answers

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L955: `assert.equal(r.status, 1, r.stderr + r.stdout)`
- L957: `assert.equal(body.error, "chrome_daemon_up")`

#### 966–998: every tool carries title and honest MCP annotations; tool-specific outputSchemas only; results mirror structuredContent

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs; EX-track/survey.

- L973: `assert.match(t.title, /^Apex 26 · /, t.name)`
- L978: `assert.equal(t.outputSchema.type, "object", t.name)`
- L979: `assert.equal(typeof t.outputSchema.properties.ok, "object", t.name)`
- L982: `assert.equal(typeof a[k], "boolean", ˋ${t.name}.${k}ˋ)`
- L986: `assert.equal(a.idempotentHint, true, ˋ${t.name}: read-only implies idempotentˋ)`
- L987: `assert.equal(a.readOnlyHint, false, ˋ${t.name} takes the browser lock and writes artifactsˋ)`
- L989: `assert.deepEqual(withSchema.sort(), ["apex_bump_cache_check", "apex_car_audit", "apex_catalog", "apex_doctor", "apex_help", "apex_hud_mock", "apex_hud_shot", "apex_hud_survey", "apex_job_status", "apex_locations", "apex_pick_tests", "apex_select_specs", "apex_status", "apex_track_audit", "apex_viewer"], "exactly the tools with a measured result shape")`
- L992: `assert.deepEqual(destructive, ["apex_cursor_agents", "apex_job_cancel"])`
- L993: `assert.deepEqual(openWorld.sort(), ["apex_cursor_agents"])`
- L994: `assert.ok(readOnly.includes(n), ˋ${n} is read-onlyˋ)`
- L995: `assert.ok(!readOnly.includes(n), ˋ${n} is not read-onlyˋ)`
- L997: `assert.deepEqual(call.structuredContent, JSON.parse(call.content[0].text), "structuredContent mirrors the first text block")`

#### 1000–1034: real results of the fast tree tools conform to their advertised outputSchema

Targets/fixtures: MCP-core; EX-jobs; EX-track/survey.

- L1027: `assert.ok(r.structuredContent && typeof r.structuredContent === "object", ˋ${name}: structuredContent presentˋ)`
- L1028: `assert.deepEqual(validate(r.structuredContent, schemaOf(name), name, []), [], ˋ${name} conforms to its outputSchemaˋ)`
- L1031: `assert.equal(t.outputSchema.additionalProperties, true, ˋ${t.name}: a CLI may grow a key before the schema doesˋ)`
- L1032: `assert.equal(t.outputSchema.required, undefined, ˋ${t.name}: refusal and dryRun bodies share the tool, so nothing is requiredˋ)`

#### 1036–1064: all advertised schemas reject unknown keys; argument shapes, enums and bounds are enforced

Targets/fixtures: MCP-core.

- L1039: `assert.equal(tool.inputSchema.additionalProperties, false, tool.name)`
- L1041: `assert.equal(r.status, 1, tool.name)`
- L1042: `assert.equal(JSON.parse(r.stdout).error, "bad_args", tool.name)`
- L1060: `assert.equal(r.status, 1, ˋ${name}: ${r.stdout} ${r.stderr}ˋ)`
- L1061: `assert.equal(JSON.parse(r.stdout).error, "bad_args", ˋ${name}: ${r.stdout}ˋ)`
- L1062: `assert.doesNotMatch(r.stderr, /TypeError|uncaught/i)`

#### 1066–1081: positional values cannot replace pinned CLI flags

Targets/fixtures: MCP-core.

- L1077: `assert.equal(r.status, 1, r.stdout)`
- L1078: `assert.equal(JSON.parse(r.stdout).error, "bad_args")`
- L1080: `assert.equal(callCli("apex_eval", { dryRun: true, expr: "-1" }).status, 0)`

#### 1083–1102: output preflight resolves existing and nearest ancestors without creating paths

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L1094: `assert.equal(r.status, 1, r.stdout)`
- L1095: `assert.ok(["path_escaped", "bad_args"].includes(JSON.parse(r.stdout).error))`
- L1098: `assert.equal(callCli("apex_shot", { dryRun: true, out: safe }).status, 0)`
- L1099: `assert.equal(fs.existsSync(path.dirname(safe)), false)`
- L1100: `assert.equal(fs.readFileSync(path.join(outside, "file.png"), "utf8"), "untouched")`

#### 1104–1132: read-only framing refuses executable shot sources; legacy literals require explicit CLI mode

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L1114: `assert.deepEqual(readShots(json), [shot])`
- L1115: `assert.throws(() => readShots(legacy), /JSON data/)`
- L1116: `assert.deepEqual(readShots(legacy, { trustedJs: true }), [shot])`
- L1117: `assert.throws(() => readShots(malicious), /JSON data/)`
- L1118: `assert.equal(globalThis.__apexFrameSurveyExecuted, undefined)`
- L1121: `assert.equal(r.status, 1, r.stdout)`
- L1122: `assert.equal(JSON.parse(r.stdout).error, "bad_args")`
- L1123: `assert.match(JSON.parse(r.stdout).message, /JSON/)`
- L1125: `assert.equal(callCli("apex_frame_report", { dryRun: true, track: "monza", shots: json, trustedShotsJs: true }).status, 1)`
- L1127: `assert.throws(() => readShots(json), /no string id/)`
- L1128: `assert.equal(callCli("apex_frame_report", { dryRun: true, track: "monza", shots: json }).status, 1)`
- L1130: `assert.deepEqual(readShots(json), [])`

#### 1134–1149: stdio survives null/scalar/batch/malformed envelopes and invalid arguments

Targets/fixtures: MCP-core.

- L1145: `assert.equal(errors.length, 13)`
- L1146: `assert.deepEqual(errors.filter((r) => r.error).map((r) => r.error.code).sort(), [-32600, -32600, -32600, -32600, -32600, -32700, -32600, -32600, -32602, -32602, -32602].sort())`
- L1147: `assert.deepEqual(errors.find((r) => r.id === 99).result, {})`
- L1148: `assert.ok(errors.find((r) => r.id === 100).result.tools.some((t) => t.name === "apex_doctor"))`

#### 1151–1158: doctor wrapper pins inspection only and rejects caller-supplied command/root/catalog

Targets/fixtures: MCP-core.

- L1153: `assert.equal(r.status, 0, r.stderr)`
- L1154: `assert.deepEqual(JSON.parse(r.stdout).argv.slice(1), [path.join(ROOT, "tools/check/doctor.mjs"), "--tree", "--json"])`
- L1156: `assert.equal(callCli("apex_doctor", { dryRun: true, [key]: "untrusted" }).status, 1, key)`

#### 1160–1174: probe backend and wait errors fail before dispatch; integer boundary plans remain exact

Targets/fixtures: MCP-core.

- L1164: `assert.equal(r.status, 2, ˋ${args}: ${r.stdout} ${r.stderr}ˋ)`
- L1165: `assert.match(r.stderr, /probe:/)`
- L1166: `assert.doesNotMatch(r.stderr, /TypeError|uncaught|stack/i)`
- L1167: `assert.equal(r.stdout.trim(), "")`
- L1171: `assert.equal(r.status, 0, r.stderr)`
- L1172: `assert.ok(JSON.parse(r.stdout).at(-1).arguments.function.includes(ˋsetTimeout(r, ${wait})ˋ))`

#### 1176–1199: atomic browser claim preserves the competing owner that wins after preflight

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L1191: `assert.equal(inserted, true)`
- L1192: `assert.equal(JSON.parse(result.content[0].text).error, "lock_held")`
- L1193: `assert.equal(JSON.parse(fs.readFileSync(LOCK, "utf8")).tool, "winner")`

#### 1201–1210: partially written or malformed lock cannot be stolen during an atomic claim

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L1207: `assert.equal(JSON.parse(result.content[0].text).error, "lock_held")`
- L1208: `assert.equal(fs.readFileSync(LOCK, "utf8"), "")`

#### 1212–1261: fake garage early exits, spawn errors and timeout settle open and retain ownership until child exit

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results.

- L1228: `assert.equal(body(await earlyOpen).error, "garage_boot_failed")`
- L1229: `assert.equal(fs.existsSync(LOCK), false)`
- L1233: `assert.equal(body(await failed).error, "garage_boot_failed")`
- L1234: `assert.equal(fs.existsSync(LOCK), false)`
- L1237: `assert.equal(body(thrown).error, "garage_boot_failed")`
- L1238: `assert.equal(fs.existsSync(LOCK), false)`
- L1242: `assert.equal(body(timeout).error, "garage_boot_failed")`
- L1243: `assert.equal(fs.existsSync(LOCK), true, "timed-out child still owns its browser until exit")`
- L1244: `assert.equal(body(acquireLock("another")).error, "lock_held")`
- L1246: `assert.equal(fs.existsSync(LOCK), false)`
- L1250: `assert.equal(body(recovered).ok, true, "a fresh session recovers after earlier failures")`
- L1252: `assert.equal(closed.closed, true)`
- L1253: `assert.equal(fs.existsSync(LOCK), true, "close alone cannot release the browser")`
- L1254: `assert.equal(body(acquireLock("another")).error, "lock_held")`
- L1256: `assert.equal(fs.existsSync(LOCK), false)`

#### 1263–1303: graph-parity cleans partial archives and every load/build failure using small scratch fixtures

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-specialists.

- L1273: `assert.throws(() => materialiseBaseline("HEAD", { scratchRoot: fixture, run(command, args) { commands.push(command); if (command === "tar") fs.writeFileSync(path.join(args.at(-1), "partial.json"), "fixture"); if (command === failedStage) throw new Error(ˋfixture ${command} failedˋ); return Buffer.from("fixture archive"); } }), new RegExp(ˋfixture ${failedStage} failedˋ))`
- L1279: `assert.deepEqual(fs.readdirSync(fixture), [], ˋ${failedStage} failure leaked its treeˋ)`
- L1280: `assert.deepEqual(commands, failedStage === "git" ? ["git"] : ["git", "tar"])`
- L1295: `assert.equal(code, stage === "success" ? 0 : 1, stage)`
- L1296: `assert.equal(fs.existsSync(dir), false, ˋ${stage} leaked baselineˋ)`
- L1297: `assert.deepEqual(fs.readdirSync(fixture), [], stage)`

#### 1305–1315: splitOut takes the trailing JSON block, never a number from inside it

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results.

- L1310: `assert.deepEqual(parseOut(shot), { frame: { tgt: [-285.6, 563.528] } })`
- L1311: `assert.equal(parseOut("42"), 42, "a whole-stdout scalar is still apex_eval's answer")`
- L1312: `assert.equal(parseOut("plain text\n 7"), null, "an indented scalar line is not a result")`
- L1313: `assert.deepEqual(parseOut('log\n{"a":1}'), { a: 1 })`
- L1314: `assert.equal(parseOut(""), null)`

#### 1317–1324: splitOut returns the JSON once: in out, and only the text before it in rest

Targets/fixtures: MCP-core; MCP-process/results.

- L1320: `assert.deepEqual(splitOut(shot), { out: { frame: 1 }, rest: "wrote x.png (20 KB)" })`
- L1321: `assert.deepEqual(splitOut('{"a":1}'), { out: { a: 1 }, rest: "" }, "pure JSON leaves no stdout")`
- L1322: `assert.deepEqual(splitOut("plain text"), { out: null, rest: "plain text" }, "unparsed text is kept whole")`
- L1323: `assert.deepEqual(splitOut(""), { out: null, rest: "" })`

#### 1327–1347: runSpawn never blocks, and a cancel or timeout kills the child's process group

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results.

- L1336: `assert.equal(cancelled.error, "cancelled")`
- L1337: `assert.equal(cancelled.ok, false)`
- L1338: `assert.ok(Date.now() - t0 < 5000, ˋcancel took ${Date.now() - t0} msˋ)`
- L1341: `assert.equal(timedOut.error, "timeout")`
- L1344: `assert.equal(fine.ok, true)`
- L1345: `assert.deepEqual(fine.out, { a: 1 })`
- L1346: `assert.equal(fine.stdout, "note")`

#### 1349–1361: rotateReport lifts rotate-markings --check rows into out

Targets/fixtures: MCP-core; MCP-process/results.

- L1357: `assert.equal(r.wouldChange, 2)`
- L1358: `assert.deepEqual(r.circuits[0], { id: "abudhabi", shiftPct: 10.15, turns: 16, sectorsLeftAlone: true })`
- L1359: `assert.equal(r.circuits[1].sectorsLeftAlone, false)`
- L1360: `assert.deepEqual(rotateReport(""), { wouldChange: 0, circuits: [] })`

#### 1363–1423: 2026-10-03 tools: track session, jobs, UI and audits pin their argv and refuse bad input

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs; EX-track/survey.

- L1367: `assert.equal(r.status, 0, ˋ${name} ${JSON.stringify(args)}: ${r.stdout}${r.stderr}ˋ)`
- L1369: `assert.match(JSON.stringify(b.argv ?? b.command), re, name)`
- L1374: `assert.equal(b.ok, false, ˋ${name} ${JSON.stringify(args)} should refuseˋ)`
- L1375: `assert.equal(b.error, code, ˋ${name} ${JSON.stringify(args)}: ${b.message}ˋ)`
- L1385: `assert.equal(typeof matrix.estimateMs, "number", "ui_matrix dryRun names estimateMs (hud_survey-style)")`
- L1386: `assert.ok(matrix.estimateMs > 0 && matrix.cells >= 2, ˋui_matrix cells/estimate: ${JSON.stringify(matrix)}ˋ)`
- L1403: `assert.match(JSON.stringify(audit.argv), /verify-track\.cjs","monza","--quiet".*float-audit\.cjs","monza","--json/)`
- L1408: `assert.match(JSON.stringify(full.argv), /audit-circuit\.cjs","monza","--json","--checks","clip,coplanar"/)`
- L1413: `assert.match(JSON.stringify(unit.argv), /"--test","tests\/unit\/hud-layout\.test\.mjs"\]$/)`
- L1415: `assert.match(JSON.stringify(pat.argv), /"--test","--test-name-pattern","HELMET","tests\/unit\/hud-layout\.test\.mjs"\]$/)`
- L1421: `assert.match(src, new RegExp(ˋname: "${n}",\\s*week: 7,\\s*kind: "browser"ˋ), ˋ${n} takes the browser lockˋ)`
- L1422: `assert.match(src, new RegExp(ˋname: "${n}",\\s*week: 7,\\s*kind: "tree"ˋ), ˋ${n} is a tree toolˋ)`

#### 1425–1437: resources/list and resources/read serve the agent references

Targets/fixtures: MCP-core.

- L1433: `assert.ok(byId(1).result.capabilities.resources)`
- L1434: `assert.deepEqual(byId(2).result.resources.map((r) => r.name), ["DEBUG-HOOKS.md", "AGENT-SURFACE.md", "APEX-TOOLS-MCP.md"])`
- L1435: `assert.match(byId(3).result.contents[0].text, /__apex/)`
- L1436: `assert.equal(byId(4).error.code, -32002, "only the listed docs are readable")`

#### 1439–1452: thumbBlock returns an MCP image block a client can render

Targets/fixtures: MCP-core; MCP-path/occupancy.

- L1447: `assert.equal(b.type, "image")`
- L1448: `assert.equal(b.mimeType, "image/jpeg")`
- L1450: `assert.equal(meta.width, 640)`

#### 1456–1495: a job's reported log is the file holding its output, and status tails it

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; EX-jobs.

- L1481: `assert.match(started.log, /^artifacts\/logs\/apex-jobs\/verify_all-.*\.log$/)`
- L1483: `assert.equal(done.state, "done", JSON.stringify(done))`
- L1485: `assert.match(logText, /52\/52 circuits ok/, "the reported log holds the CLI's output, not 0 bytes")`
- L1486: `assert.match(fs.readFileSync(path.join(fake, done.stderr), "utf8"), /a warning/)`
- L1487: `assert.equal(done.tail, undefined, "a finished job whose log parsed carries out, not the same text again (#2672)")`
- L1488: `assert.deepEqual(done.out, { ok: true, n: 52 })`
- L1489: `assert.ok(!fs.readdirSync(path.join(fake, "artifacts/logs/apex-jobs")).some((f) => f.endsWith(".out")), "no unreported side file")`
- L1493: `assert.match((await settle(gp.jobId)).tail, /BASE=HEAD~1 args=--all/)`

#### 1501–1555: job exit code survives the parent (disk-only status) and a huge result is capped

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; EX-jobs.

- L1532: `assert.equal(fs.readFileSync(path.join(dir, ˋ${ok.jobId}.exitˋ), "utf8"), "0")`
- L1533: `assert.equal(fs.readFileSync(path.join(dir, ˋ${bad.jobId}.exitˋ), "utf8"), "3")`
- L1546: `assert.equal(okS.state, "done", "plain-text last line, exit 0: done")`
- L1547: `assert.equal(okS.exit, 0)`
- L1548: `assert.equal(body(second.handlers.apex_job_status({ jobId: bad.jobId })).exit, 3)`
- L1550: `assert.equal(bigS.out.truncated, true, "over the cap")`
- L1551: `assert.deepEqual(bigS.out.counts, { total: 4000 }, "headline keys survive")`
- L1552: `assert.ok(bigS.out.keys.includes("cells") && !("cells" in bigS.out), "the big array is named, not returned")`
- L1553: `assert.ok(JSON.stringify(bigS).length < 40000, ˋstatus reply stays small (${JSON.stringify(bigS).length})ˋ)`

#### 1559–1565: shot-survey --plan-json carries cams into the plan

Targets/fixtures: MCP-core; EX-track/survey.

- L1562: `assert.equal(run().shotsPerTrack, 1)`
- L1564: `assert.deepEqual(two.shots.map((x) => x.cam), ["orbit", "eye"])`

#### 1570–1592: hud_shot / hud_survey jobs take a server-pinned argv only

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; EX-jobs.

- L1574: `assert.equal(bare.error, "bad_args", ˋ${kind} without a pinned argv must refuseˋ)`
- L1576: `assert.equal(smuggled.error, "bad_args", ˋ${kind} must reject a caller argvˋ)`
- L1579: `assert.ok(JOB_KINDS.includes("hud_shot") && JOB_KINDS.includes("hud_survey"))`
- L1580: `assert.equal(typeof HUD_JOB_ARGV, "symbol")`
- L1587: `assert.equal(planned.ok, true, JSON.stringify(planned))`
- L1588: `assert.deepEqual(planned.argv, argv)`
- L1589: `assert.equal(planned.browser, true, "hud jobs hold the browser lock")`
- L1591: `assert.equal(viaString.error, "bad_args", "a string key never stands in for the Symbol")`

#### 1594–1610: apex_graph_parity all:true routes to the graph_parity_all job, never the 180 s spawn

Targets/fixtures: MCP-core; EX-jobs.

- L1597: `assert.equal(all.status, 0, all.stdout + all.stderr)`
- L1599: `assert.equal(b.kind, "graph_parity_all")`
- L1600: `assert.equal(b.routed, "apex_job_start graph_parity_all")`
- L1601: `assert.deepEqual(b.env, { BASE: "HEAD~1" })`
- L1602: `assert.match(JSON.stringify(b.argv), /graph-parity\.cjs","--all"\]$/)`
- L1604: `assert.deepEqual(job.env, { BASE: "origin/main" })`
- L1607: `assert.equal(r.error, "bad_args", JSON.stringify(args))`
- L1609: `assert.equal(body(callCli("apex_graph_parity", { dryRun: true, all: true })).error, "bad_args", "base stays required")`

#### 1612–1631: apex_track shot carries el and h: eye pitch / eye height, orbit aim height

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-track/survey.

- L1615: `assert.equal(eye.ok, true, JSON.stringify(eye))`
- L1616: `assert.equal(eye.command.el, -12)`
- L1617: `assert.equal(eye.command.h, 206)`
- L1619: `assert.deepEqual([orbit.command.cam, orbit.command.h, orbit.command.dist], ["orbit", 206, 120])`
- L1622: `assert.equal(r.error, "bad_args", JSON.stringify(bad))`
- L1624: `assert.equal(body(callCli("apex_track", { op: "shot", h: 10 })).error, "track_not_open", "a real shot still needs a session")`
- L1627: `assert.match(ts, /a\.eyeAt\(o\.frac, o\.lat \|\| 0, o\.h == null \? 2\.5 : o\.h, o\.lookFrac\)/)`
- L1628: `assert.match(ts, /a\.view\(\{ eye: r\.eye, yaw, pitch: o\.pitch \}\)/)`
- L1629: `assert.match(ts, /a\.orbit\(o\.frac, o\.az, o\.el, o\.dist, o\.h == null \? 1\.5 : o\.h, \{ clear: o\.clear \}\)/)`
- L1630: `assert.match(ts, /clear: !op\.through/, "survey shots step round blockers like shot.mjs unless op.through")`

#### 1633–1647: apex-eval: the shapeOf helper it injects into the page parses (named fn expr, no source rewrite)

Targets/fixtures: MCP-core.

- L1639: `assert.ok(!/SHAPE\.replace\(/.test(src), "the injected helper must not be source-rewritten")`
- L1645: `assert.equal(typeof win.__shape, "function")`
- L1646: `assert.equal(win.__shape([1, 2]).startsWith("Array(2)"), true)`

#### 1679–1695: every tool answers a minimal valid call (mock): ok, not a bad_args refusal

Targets/fixtures: MCP-core; EX-jobs; EX-track/survey.

- L1682: `assert.ok(tools.length >= 28, ˋcatalog has ${tools.length} toolsˋ)`
- L1694: `assert.deepEqual(bad.map(([n, r]) => ˋ${n}: ${r.body.message}ˋ), [], "a minimal valid call must not be refused as bad_args")`

#### 1697–1711: bad_args names the way forward: required hint, did-you-mean, valid keys, got-type

Targets/fixtures: MCP-core.

- L1705: `assert.match(needs.fix, /Pass "file": string/, "required key: what to pass")`
- L1706: `assert.match(anyOf.message, /id or all:true/, "anyOf: the alternatives, not 'one of the advertised types'")`
- L1707: `assert.match(anyOf.fix, /Required: base/)`
- L1708: `assert.match(key.fix, /Did you mean "frac"\?.*Valid: track, frac, cam/, "unknown key: nearest + the valid list")`
- L1709: `assert.match(en.fix, /Did you mean "orbit"\?/)`
- L1710: `assert.match(type.message, /frac must be number, got string/)`

#### 1713–1722: apex_ui_fit / apex_ui_shot refuse an id the audit does not know instead of ok:true, out:null

Targets/fixtures: MCP-core.

- L1719: `assert.equal(b.ok, false)`
- L1719: `assert.equal(b.error, "bad_args")`
- L1720: `assert.match(typo.fix, /Did you mean settings\?/)`
- L1721: `assert.match(vp.fix, /ios-iphone-landscape-844/, "the phone-landscape id is in the list")`

#### 1724–1732: apex_hud_shot aliases layout-audit viewport ids and did-you-means a near miss

Targets/fixtures: MCP-core.

- L1726: `assert.equal(aliased.ok, true, JSON.stringify(aliased))`
- L1727: `assert.match(JSON.stringify(aliased.argv), /phone-landscape-844x390/, "alias rewrites before the CLI")`
- L1729: `assert.equal(miss.ok, false)`
- L1730: `assert.equal(miss.error, "bad_args")`
- L1731: `assert.match(miss.fix, /Did you mean "phone-landscape-844x390"\?/, miss.fix)`

#### 1734–1741: image and inlineImage are aliases across shot / ui_shot / hud_shot

Targets/fixtures: MCP-core.

- L1736: `assert.equal(hud.ok, true, ˋhud image→inlineImage: ${JSON.stringify(hud)}ˋ)`
- L1738: `assert.equal(ui.ok, true, ˋui_shot inlineImage→image: ${JSON.stringify(ui)}ˋ)`
- L1740: `assert.equal(shot.ok, true, ˋshot inlineImage→image: ${JSON.stringify(shot)}ˋ)`

#### 1743–1766: apex_job_status {} is bounded: newest first, limit, state filter, total

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; EX-jobs.

- L1759: `assert.deepEqual(two.jobs.map((j) => j.jobId), ["float_all-t5", "float_all-t4"], "newest first")`
- L1760: `assert.equal(two.total, 5)`
- L1761: `assert.match(two.hint, /3 older job\(s\) not shown/)`
- L1763: `assert.deepEqual(failed.jobs.map((j) => j.jobId), ["float_all-t4", "float_all-t2"])`
- L1764: `assert.equal(failed.hint, undefined, "nothing hidden, no hint")`

#### 1768–1799: apex_job_status {} prunes manifests older than 7 days and re-judges a pre-.exit failed job whose log says ok:true

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; EX-jobs.

- L1794: `assert.deepEqual(state, { "stale-failed": "done", "real-failed": "failed", "exit-failed": "failed" })`
- L1795: `assert.equal(res.total, 3)`
- L1796: `assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith("old-")), [], "json, log, err and exit of an expired job are all gone")`
- L1797: `assert.ok(fs.existsSync(path.join(dir, "real-failed.log")), "recent jobs keep their files")`

#### 1802–1831: serve-http answers /healthz and a JSON-RPC tools/list on loopback, then stops

Targets/fixtures: MCP-core; MCP-process/results.

- L1819: `assert.ok(health, "serve-http never answered /healthz")`
- L1820: `assert.equal(health.status, 200)`
- L1821: `assert.equal(health.body.ok, true)`
- L1822: `assert.equal(health.body.bind, "127.0.0.1", "loopback only, never 0.0.0.0")`
- L1823: `assert.ok(health.body.tools >= 28, ˋtools ${health.body.tools}ˋ)`
- L1825: `assert.equal(list.status, 200)`
- L1826: `assert.ok(list.body.result.tools.some((t) => t.name === "apex_status"))`
- L1828: `assert.match(JSON.parse(bad.body.result.content[0].text).fix, /Did you mean "frac"/, "the same self-explaining refusals over HTTP")`
- L1829: `assert.equal((await req("GET", "/nope")).status, 404)`

#### 1834–1853: jobs_busy names the running jobs and the limit

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; EX-jobs.

- L1848: `assert.equal(r.error, "jobs_busy")`
- L1849: `assert.match(r.message, /hud_survey-a \(hud_survey, \d+s\)/)`
- L1850: `assert.match(r.message, /frame_fleet-b \(frame_fleet, \d+s\)/)`
- L1851: `assert.match(r.fix, /At most 2 run at once/)`

#### 1856–1869: apex_catalog lists the ids the other tools accept, from their own schemas and the UI audit catalogs

Targets/fixtures: MCP-core; EX-track/survey.

- L1858: `assert.equal(r.status, 0, r.stderr)`
- L1860: `assert.equal(b.ok, true)`
- L1863: `assert.deepEqual(b.tracks, enumOf("apex_shot", "track"))`
- L1864: `assert.deepEqual(b.hudDevices, enumOf("apex_hud_shot", "device"))`
- L1865: `assert.deepEqual(b.shotPresets, enumOf("apex_shot_survey", "preset"))`
- L1866: `assert.ok(b.uiScreens.includes("settings") && b.uiViewports.includes("ios-iphone-landscape"), "the UI audit's catalogs")`
- L1867: `assert.ok(b.jobKinds.includes("ui_matrix") && b.jobKinds.includes("float_all"))`
- L1868: `assert.ok(!b.uiViewports.includes("phone-landscape-844x390"), "the two viewport families stay distinct")`

#### 1870–1888: apex_locations discovers authored turns and scenery names for shot surveys

Targets/fixtures: MCP-core; EX-track/survey.

- L1872: `assert.equal(list.ok, true)`
- L1873: `assert.deepEqual(list.locations.map(l => l.id), ["monaco/turn-1"])`
- L1875: `assert.deepEqual(named.locations.map(l => l.id), ["spa/eau-rouge"])`
- L1878: `assert.equal(plan.shots[0].location, "monaco/turn-1")`
- L1879: `assert.equal(plan.options.profile, 'preview')`
- L1882: `assert.equal(batch.ok, true)`
- L1883: `assert.equal(batch.plans.spa.shots[0].location, 'spa/eau-rouge')`
- L1884: `assert.equal(batch.plans.monaco.shots[0].location, 'monaco/turn-1')`
- L1885: `assert.equal(batch.options.profile, 'preview')`
- L1887: `assert.equal(comparison.options.profile, 'comparison')`

#### 1890–1912: custom survey collection flows through location catalog and async job argv

Targets/fixtures: MCP-core; EX-jobs; EX-track/survey.

- L1898: `assert.equal(catalog.ok, true)`
- L1899: `assert.equal(catalog.locations[0].id, ˋ${id}/pond-1ˋ)`
- L1901: `assert.equal(plan.ok, true)`
- L1902: `assert.equal(plan.options.profile, 'preview')`
- L1903: `assert.deepEqual(plan.shots[0].target, catalog.locations[0].target)`
- L1907: `assert.equal(job.ok, true)`
- L1908: `assert.equal(job.argv[job.argv.indexOf('--designs') + 1], file)`
- L1909: `assert.equal(job.argv[job.argv.indexOf('--profile') + 1], 'preview')`
- L1910: `assert.equal(job.argv[job.argv.indexOf('--select') + 1], selected)`

#### 1915–1922: a misspelled key is reported with a did-you-mean before the missing required argument

Targets/fixtures: MCP-core; EX-track/survey.

- L1917: `assert.match(msg("apex_unit_test", { fil: "x" }), /unknown argument fil \| Did you mean "file"\?/)`
- L1918: `assert.match(msg("apex_graph_parity", { bse: "HEAD", id: "monza" }), /unknown argument bse \| Did you mean "base"\?/)`
- L1919: `assert.match(msg("apex_shot_survey", { trak: "monza" }), /unknown argument trak \| Did you mean "track"\?/)`
- L1921: `assert.match(msg("apex_unit_test", {}), /tool needs file \| Pass "file"/)`

#### 1925–1941: apex_verify_change_fast routes to a background verify_change_fast job, pinned --fast --json, sync:true opts out

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L1928: `assert.equal(job.ok, true)`
- L1929: `assert.deepEqual(job.argv.slice(1).map((a) => a.replace(/^.*\/tools\//, "tools/")), ["tools/ci/verify-change.mjs", "--fast", "--json", "--since", "HEAD~1", "--staged"])`
- L1930: `assert.equal(job.browser, false, "a tree job: no browser lock")`
- L1931: `assert.match(body(callCli("apex_job_start", { kind: "verify_change_fast", since: "--wait", dryRun: true })).message, /may not start with a CLI flag|since must be a git ref/)`
- L1933: `assert.equal(body(callCli("apex_verify_change_fast", { dryRun: true })).out.plan, true)`
- L1935: `assert.equal(routed.routed, "apex_job_start verify_change_fast", JSON.stringify(routed))`
- L1936: `assert.equal(routed.kind, "verify_change_fast")`
- L1937: `assert.match(routed.hint, /apex_job_status/)`
- L1940: `assert.ok(sync.argv.includes("--fast") && sync.argv.includes("--json") && !sync.argv.includes("--wait"))`

#### 1944–1967: a verify_change_fast job that exits 2 (partial) is done; any other non-zero exit is failed

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; EX-jobs.

- L1960: `assert.equal(vc.state, "done", JSON.stringify(vc))`
- L1961: `assert.equal(vc.exit, 2)`
- L1962: `assert.equal(vc.out.verdict, "partial")`
- L1965: `assert.equal(other.state, "failed", JSON.stringify(other))`

#### 1971–1981: syncStructured makes structuredContent match the refined text body, and leaves consistent results alone

Targets/fixtures: MCP-core; MCP-process/results.

- L1974: `assert.deepEqual(syncStructured(stale).structuredContent, { ok: true, out: { clean: true } })`
- L1976: `assert.deepEqual(syncStructured(same).structuredContent, { ok: true })`
- L1979: `assert.deepEqual(syncStructured(bare).structuredContent, { ok: true, keep: 1 })`
- L1980: `assert.deepEqual(syncStructured({ content: [{ type: "text", text: "{}" }] }), { content: [{ type: "text", text: "{}" }] })`

#### 2033–2064: every optional argument of every dry-run-able tool changes the plan (or is exempt with a reason)

Targets/fixtures: MCP-core.

- L2061: `assert.deepEqual(dead, [], "these optional arguments change nothing in the dry-run plan: wire them, or exempt each in ARG_EXEMPT with a reason")`
- L2063: `assert.deepEqual(stale, [], "these exemptions are no longer needed (the argument now has an effect) or name no argument: remove them")`

#### 2068–2080: serverFreshness: stale only when a loaded file is newer than the server; a missing file is not stale

Targets/fixtures: MCP-core; MCP-process/results.

- L2073: `assert.equal(fresh.stale, false)`
- L2074: `assert.deepEqual(fresh.staleFiles, [])`
- L2075: `assert.equal(fresh.fix, undefined)`
- L2077: `assert.equal(stale.stale, true)`
- L2078: `assert.deepEqual(stale.staleFiles, [path.join("fixture-dir", "beta.mjs")])`
- L2079: `assert.match(stale.fix, /restart the apex-tools MCP server/)`

#### 2082–2091: apex_status reports the server and the open sessions

Targets/fixtures: MCP-core.

- L2084: `assert.equal(r.status, 0, r.stderr)`
- L2086: `assert.equal(b.server.stale, false, "a one-shot call is a fresh process")`
- L2087: `assert.ok(b.server.watched >= 3, ˋwatched ${b.server.watched}ˋ)`
- L2088: `assert.ok(b.server.startedAt && b.server.version)`
- L2089: `assert.deepEqual(b.sessions.garage, null)`
- L2090: `assert.deepEqual(b.sessions.track, null)`

#### 2095–2104: a bad `out` is the normal refusal (with its fix), not a thrown error

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-track/survey.

- L2098: `assert.equal(r.status, 1, ˋ${tool}: ${r.stderr}ˋ)`
- L2100: `assert.equal(b.error, "path_escaped")`
- L2101: `assert.match(b.fix, /under artifacts\/ or scratch\//)`
- L2102: `assert.doesNotMatch(r.stderr, /at assertSafeOut|node:internal/, "no stack trace")`

#### 2108–2144: apex_job_status wait holds until the job is done; a capped survey result carries topFindings

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; EX-jobs.

- L2131: `assert.equal(short.state, "running")`
- L2132: `assert.equal(short.stillRunning, true, "a wait that ran out says so")`
- L2133: `assert.ok(short.waitedS >= 1)`
- L2135: `assert.equal(done.state, "done")`
- L2136: `assert.equal(done.stillRunning, undefined)`
- L2137: `assert.equal(done.out.truncated, true)`
- L2138: `assert.equal(done.out.findingsTotal, 33)`
- L2139: `assert.equal(done.out.topFindings.length, 10, "the worst ten")`
- L2140: `assert.deepEqual(done.out.topFindings.slice(0, 2).map((f) => f.cell), ["worst", "worst2"], "high before medium before info")`
- L2141: `assert.ok(done.out.topFindings.every((f) => f.detail.length <= 200), "long details are cut")`
- L2142: `assert.deepEqual(body(await x.handlers.apex_job_status({ jobId: j.jobId })).state, "done", "no wait: unchanged")`

#### 2148–2158: apex_agent describe without an id is refused up front, with the id forms

Targets/fixtures: MCP-core.

- L2153: `assert.equal(bad.error, "bad_args")`
- L2154: `assert.match(bad.message, /describe needs id/)`
- L2155: `assert.match(bad.fix, /corner:T3/)`
- L2156: `assert.equal(ok.ok, true)`
- L2157: `assert.deepEqual(ok.argv.slice(-4), ["monza", "describe", "--id", "corner:T3"])`

#### 2160–2175: a CLI that fails with its own {error, message, fix} has them lifted out of `out`

Targets/fixtures: MCP-core; MCP-process/results.

- L2165: `assert.equal(b.ok, false)`
- L2166: `assert.equal(b.exit, 2)`
- L2167: `assert.equal(b.error, "BadArgumentError")`
- L2168: `assert.equal(b.message, "describe(id) needs an id")`
- L2169: `assert.equal(b.fix, "ids look like corner:T3")`
- L2170: `assert.equal(b.out.error, "BadArgumentError", "ˋoutˋ still holds the CLI's own JSON")`
- L2173: `assert.equal(plain.ok, false)`
- L2174: `assert.equal(plain.error, undefined)`

#### 2179–2187: browserTimeoutMs: 180 s, 420 s for an apex_agent call that changes weather or time of day

Targets/fixtures: MCP-core; MCP-process/results.

- L2181: `assert.equal(browserTimeoutMs("apex_agent", { command: "world" }), 180000)`
- L2182: `assert.equal(browserTimeoutMs("apex_agent", { command: "atmosphere" }), 180000, "reading the atmosphere changes nothing")`
- L2183: `assert.equal(browserTimeoutMs("apex_agent", { command: "atmosphere", weather: "wet" }), 420000)`
- L2184: `assert.equal(browserTimeoutMs("apex_agent", { command: "atmosphere", tod: "dusk" }), 420000)`
- L2185: `assert.equal(browserTimeoutMs("apex_shot", { tod: "night" }), 180000, "only apex_agent rebuilds the scene on a tod")`
- L2186: `assert.ok(browserTimeoutMs("apex_agent", { weather: "wet" }) > 269000, "above the measured duration")`

#### 2190–2214: apex_shot_survey reports rebuilds portable multi-custom-track HTML without a browser

Targets/fixtures: MCP-core; EX-track/survey.

- L2202: `assert.equal(r.status, 0, r.stderr)`
- L2204: `assert.equal(body.ok, true)`
- L2205: `assert.equal(body.browser, false)`
- L2207: `assert.match(html, /custom-first/)`
- L2208: `assert.match(html, /custom-second/)`
- L2209: `assert.equal(fs.readdirSync(path.join(out, "assets")).length, 2)`
- L2211: `assert.equal(cli.status, 0, cli.stderr)`
- L2212: `assert.equal(JSON.parse(cli.stdout).browser, false)`

#### 2216–2225: apex_shot_survey report images cannot escape artifact roots

Targets/fixtures: MCP-core; EX-track/survey.

- L2222: `assert.equal(JSON.parse(r.stdout).ok, false)`
- L2223: `assert.match(JSON.stringify(JSON.parse(r.stdout)), /artifacts|scratch/)`

#### 2228–2242: saved gallery cannot write through an assets directory symlink

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-track/survey.

- L2238: `assert.equal(JSON.parse(r.stdout).ok, false)`
- L2239: `assert.equal(fs.readdirSync(outside).length, 0)`
- L2240: `assert.equal(fs.existsSync(path.join(out, "index.html")), false)`

#### 2244–2257: slimBody (#2672): doctor keeps failures + pass count, unit_test keeps counts + failing names, select_specs drops shard spec lists; full restores

Targets/fixtures: MCP-core; MCP-process/results.

- L2248: `assert.deepEqual(d.out.checks.map((c) => c.id), ["b"])`
- L2248: `assert.equal(d.out.passed, 2)`
- L2249: `assert.equal(slimBody("apex_doctor", doc, { full: true }).out.checks.length, 3)`
- L2252: `assert.deepEqual(ok.out, { tests: 2, pass: 2, fail: 0, failing: [] })`
- L2252: `assert.equal(ok.stdout, "")`
- L2254: `assert.deepEqual(bad.out.failing, ["broken thing"])`
- L2254: `assert.match(bad.stdout, /not ok 2/)`
- L2256: `assert.deepEqual(sel.out.shards, [{ name: "s1", specCount: 2 }])`

#### 2260–2270: hudEstimateMs (#2673): tracks measured cost and scales with cells; the kill budget is not the estimate

Targets/fixtures: MCP-core.

- L2263: `assert.ok(hudEstimateMs("apex_hud_shot", {}) <= 90000 && hudEstimateMs("apex_hud_mock", {}) <= 90000)`
- L2267: `assert.ok(one <= 90000, ˋone cell ~47 s measured, got ${one}ˋ)`
- L2268: `assert.ok(all > one * 3, "the full quick matrix costs several times one cell")`
- L2269: `assert.ok(all < 20 * 60000, "and far less than the old 18-minute claim for one cell")`

#### 2272–2300: tools/list stays compact and apex_help returns the full text it shortens

Targets/fixtures: MCP-core; EX-jobs; EX-track/survey.

- L2279: `assert.ok(JSON.stringify(listed).length < 55000, ˋtools/list is ${JSON.stringify(listed).length} bytesˋ)`
- L2281: `assert.equal(help.annotations.readOnlyHint, true)`
- L2282: `assert.ok(help.outputSchema && help.outputSchema.type === "object")`
- L2285: `assert.equal(full.ok, true)`
- L2286: `assert.ok(full.description.length > short.description.length, "help carries the uncompacted description")`
- L2287: `assert.match(short.description, /apex_help/)`
- L2288: `assert.ok(Object.keys(full.inputSchema.properties.camera.properties).includes("fov"), "nested object bodies live in apex_help")`
- L2289: `assert.ok(t.inputSchema.properties[k], ˋ${t.name} keeps required ${k}ˋ)`
- L2294: `assert.equal(track.enum, undefined, ˋ${name}.track lists no idsˋ)`
- L2295: `assert.ok(track.description.includes("apex_catalog"), ˋ${name}.track points at apex_catalogˋ)`
- L2297: `assert.ok(Array.isArray(listed.tools.find((t) => t.name === "apex_job_start").inputSchema.properties.kind.enum))`
- L2299: `assert.equal(miss.isError, true)`

#### 2302–2380: tools/list preserves every accepted top-level input for compact discovery tools

Targets/fixtures: MCP-core; EX-jobs.

- L2312: `assert.ok(Buffer.byteLength(JSON.stringify(listed)) < 55000, "retain the discovery byte budget")`
- L2348: `assert.deepEqual(Object.keys(published.properties).sort(), Object.keys(full.properties).sort(), ˋ${name}: optional inputs remain discoverableˋ)`
- L2349: `assert.deepEqual(published.required || [], full.required || [], ˋ${name}: required inputs retainedˋ)`
- L2350: `assert.equal(published.additionalProperties, false, name)`
- L2358: `assert.ok(accepts(args, full), ˋ${name}.${key}: fixture is valid against the full schemaˋ)`
- L2359: `assert.ok(accepts(args, published), ˋ${name}.${key}: valid full-schema value ${JSON.stringify(value)} survives discoveryˋ)`
- L2363: `assert.deepEqual(advertised.enum, spec.enum, ˋ${name}.${key}: advertised enum stays accurateˋ)`
- L2364: `assert.equal(accepts({ ...base, [key]: "unsupported-enum-value" }, published), false, ˋ${name}.${key}: advertised enum rejects invalid valuesˋ)`
- L2366: `assert.equal(accepts({ ...base, [key]: advertised.minimum - 1 }, published), false, ˋ${name}.${key}: advertised minimum rejects values below itˋ)`
- L2367: `assert.equal(accepts({ ...base, [key]: advertised.maximum + 1 }, published), false, ˋ${name}.${key}: advertised maximum rejects values above itˋ)`
- L2369: `assert.equal(advertised[bound], spec[bound], ˋ${name}.${key}.${bound}ˋ)`
- L2375: `assert.equal(accepts(missing, published), false, ˋ${name}: missing ${key} rejectedˋ)`
- L2377: `assert.equal(accepts({ ...base, unsupportedDiscoveryInput: true }, published), false, ˋ${name}: client rejects unknown keysˋ)`
- L2378: `assert.equal(out.find((m) => m.id === ˋ${name}:unknownˋ).result.isError, true, ˋ${name}: server still rejects unknown keysˋ)`

#### 2382–2386: tool descriptions state the host ceiling and the per-call boot (#2673)

Targets/fixtures: MCP-core; EX-jobs.

- L2384: `assert.match(src, /name: "apex_job_status"[\s\S]{0,400}~120 s/)`
- L2385: `assert.match(src, /name: "apex_agent"[\s\S]{0,300}COLD-BOOTS/)`

#### 2388–2405: servers boot with no node_modules: static import graphs (apex-tools, js-debugger) name only node: and relative modules

Targets/fixtures: MCP-core.

- L2403: `assert.ok(seen.size > 3, ˋwalked ${seen.size} filesˋ)`
- L2404: `assert.deepEqual(bare, [], "load npm packages with a lazy ˋawait import()ˋ at the call site")`

#### 2409–2430: UI inspector schema bounds sizes, selectors, flags and local target

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-specialists.

- L2418: `assert.equal(r.status, 1, JSON.stringify(args))`
- L2419: `assert.equal(JSON.parse(r.stdout).error, 'bad_args')`
- L2422: `assert.equal(r.status, 0, r.stderr)`
- L2424: `assert.ok(b.argv.includes('--selector=--help'), 'selector cannot turn into CLI option')`
- L2425: `assert.ok(b.argv.includes('844x390'))`
- L2426: `assert.equal(b.lockOwner, 'tools/ui/explorer.mjs')`
- L2428: `assert.equal(callCli('apex_ui_inspect', { ...args, dryRun: true }).status, 1)`

#### 2432–2464: UI inspector delegates locking to the canonical CLI and summarizes unknown bindings

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; MCP-specialists.

- L2446: `assert.equal(options.timeoutMs, 180000)`
- L2454: `assert.equal(spawned, 1)`
- L2454: `assert.equal(b.ok, true)`
- L2455: `assert.equal(b.records[0].bindings.unavailable, 1)`
- L2456: `assert.equal(b.records[0].bindings.unmapped, 1)`
- L2457: `assert.equal(b.records[0].advisoryTotal, 1)`
- L2458: `assert.equal(b.records[0].settlement.stable, false)`
- L2459: `assert.match(b.limitation, /not a UI pass/)`
- L2461: `assert.equal(JSON.parse((await busy.apex_ui_inspect({})).content[0].text).error, 'lock_held')`
- L2462: `assert.equal(spawned, 1, 'busy check must prevent CLI spawn')`

#### 2466–2488: saved UI diffs are browser free, reject incompatible or oversized evidence, and bound findings

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; MCP-specialists.

- L2479: `assert.equal(b.ok, true)`
- L2479: `assert.equal(b.browser, false)`
- L2480: `assert.equal(b.comparisons[0].changedTotal, 1)`
- L2480: `assert.equal(b.comparisons[0].issues.length, 100)`
- L2480: `assert.equal(b.comparisons[0].totals.issues, 101)`
- L2482: `assert.equal(JSON.parse(handler({ before: 'before', after: 'after' }).content[0].text).error, 'incompatible_inspections')`
- L2484: `assert.equal(JSON.parse(handler({ before: 'before', after: 'after' }).content[0].text).error, 'bad_args')`
- L2486: `assert.equal(JSON.parse(handler({ before: 'before', after: 'after' }).content[0].text).error, 'bad_args')`

#### 2490–2500: named UI mission plans cannot supply actions or unbounded capture budgets

Targets/fixtures: MCP-core; MCP-specialists.

- L2492: `assert.equal(callCli('apex_ui_mission_plan', { ...args, dryRun: true }).status, 1)`
- L2495: `assert.equal(r.status, 0, r.stderr)`
- L2497: `assert.equal(b.planOnly, true)`
- L2497: `assert.equal(b.written, false)`
- L2498: `assert.equal(b.limits.missions, 1)`
- L2498: `assert.equal(b.limits.maxShots, 2)`
- L2498: `assert.equal(b.limits.timeoutMs, 60000)`
- L2499: `assert.ok(b.argv.includes('replay'))`

#### 2502–2519: garage plan uses canonical frame/paint/team selectors and explicit budgets without a browser

Targets/fixtures: MCP-core; MCP-specialists.

- L2508: `assert.equal(callCli('apex_garage_plan', { ...args, dryRun: true }).status, 1, JSON.stringify(args))`
- L2510: `assert.equal(r.status, 0, r.stderr)`
- L2512: `assert.equal(b.browser, false)`
- L2512: `assert.equal(b.planOnly, true)`
- L2513: `assert.equal(b.plan.shotCount, 1)`
- L2513: `assert.equal(b.plan.budget, 180)`
- L2515: `assert.equal(gloss.status, 0, gloss.stderr + gloss.stdout)`
- L2517: `assert.equal(finishPlan.browser, false)`
- L2517: `assert.equal(finishPlan.planOnly, true)`
- L2518: `assert.equal(finishPlan.plan.shotCount, 2)`
- L2518: `assert.equal(finishPlan.withinBudget, true)`

#### 2521–2537: canonical catalog and car filters integrate with the published MCP schemas

Targets/fixtures: MCP-core; EX-jobs; MCP-specialists.

- L2523: `assert.equal(r.status, 0, r.stderr)`
- L2525: `assert.equal(b.section, 'parts')`
- L2525: `assert.ok(b.rows.length <= 2)`
- L2526: `assert.ok(b.rows.every(row => row.category === 'fuel'))`
- L2532: `assert.equal(r.status, 0, r.stderr)`
- L2534: `assert.ok(b.argv.includes('--cats=fuel'))`
- L2534: `assert.ok(b.argv.includes('--team=haas'))`
- L2535: `assert.equal(callCli(name, { ...args, team: 'invented', dryRun: true }).status, 1)`

#### 2539–2551: diagnostics registry exposes bounded capabilities and all four named job kinds

Targets/fixtures: MCP-core; EX-jobs; MCP-specialists.

- L2541: `assert.equal(r.status, 0, r.stderr)`
- L2542: `assert.deepEqual(JSON.parse(r.stdout).jobs, ['memory_census', 'gpu_memory_census', 'renderer_probe', 'vm_lifecycle'])`
- L2545: `assert.equal(run.status, 0, run.stderr + run.stdout)`
- L2547: `assert.equal(plan.kind, kind)`
- L2548: `assert.ok(plan.argv.some(s => s.endsWith('/tools/perf/diagnostics.mjs')), 'persistent bounded supervisor owns execution')`
- L2550: `assert.equal(callCli('apex_diagnostics', { op: 'run', kind: 'shell', dryRun: true }).status, 1)`

#### 2553–2557: track-session accepts the flags shot-survey passes (--output-root, --designs): apex_shot_survey died with 'unknown flag'

Targets/fixtures: MCP-core; EX-track/survey.

- L2556: `assert.doesNotMatch(r.stderr, /unknown flag/)`

#### 2560–2578: serve exits through process.on('exit') on SIGTERM, so its child cleanup hooks run

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results.

- L2574: `assert.equal(sig, null, "the server exits itself instead of dying on the signal")`
- L2575: `assert.equal(code, 143)`
- L2576: `assert.equal(fs.readFileSync(marker, "utf8"), "143", "process.on('exit') hooks ran")`

#### 2588–2604: closeAll ends an open apex_track session and frees its lock; a stdin EPIPE does not crash the server

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs; EX-track/survey.

- L2596: `assert.equal(open.ok, true, JSON.stringify(open))`
- L2597: `assert.doesNotThrow(() => child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" })))`
- L2599: `assert.equal(ex.sessionInfo(), null, "the session is gone at once")`
- L2601: `assert.equal(done.closed, true)`
- L2602: `assert.equal(released.n, 1, "the browser lock is released once the tree is gone")`
- L2603: `assert.equal(await ex.closeAll("again"), null, "closeAll with nothing open is a no-op")`

#### 2606–2623: garage stdin EPIPE on a dying child is logged, not an unhandled 'error'

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results.

- L2617: `assert.equal(JSON.parse(r.content[0].text).ok, true)`
- L2618: `assert.doesNotThrow(() => child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" })))`

#### 2625–2645: a running browser job on disk is occupancy even after its one-shot `call` owner died

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L2633: `assert.equal(ex.runningBrowserJob(), null)`
- L2637: `assert.equal(ex.runningBrowserJob(), null, "a node-only job is not browser occupancy")`
- L2639: `assert.deepEqual(ex.runningBrowserJob(), { id: "hud_shot-x-2", kind: "hud_shot", pid: process.pid })`
- L2641: `assert.equal(ex.runningBrowserJob(), null, "the job's recorded exit frees it")`
- L2644: `assert.match(src, /function occupancyRefuse\(\) \{[^}]*?lockInfo\(\)[\s\S]{0,800}?runningBrowserJob\(\)/, "occupancyRefuse consults the job list")`

#### 2647–2652: apex_locations with an unreadable designs file is bad_args, not internal_error

Targets/fixtures: MCP-core.

- L2650: `assert.equal(b.ok, false)`
- L2651: `assert.equal(b.error, "bad_args")`

#### 2654–2665: chrome-devtools-mcp.sh run tolerates a missing Chromium instead of exiting under set -e

Targets/fixtures: MCP-core.

- L2658: `assert.ok(fn, "wait_chrome()")`
- L2659: `assert.match(sh, /run_mcp\(\) \{[\s\S]*?\n local chrome\n chrome="\$\(wait_chrome\)"/)`
- L2662: `assert.equal(r.status, 0, r.stderr)`
- L2663: `assert.match(r.stdout, /rc=0 c=\[\] n=1/)`
- L2664: `assert.match(r.stderr, /starting without --executablePath/)`

#### 2683–2698: apex_cursor_agents publishes four properties and stays inside the tools/list byte budget

Targets/fixtures: MCP-core; MCP-Cursor.

- L2686: `assert.deepEqual(Object.keys(t.inputSchema.properties), ["verb", "id", "options", "dryRun"])`
- L2687: `assert.deepEqual(t.inputSchema.required, ["verb"])`
- L2689: `assert.equal(t.inputSchema.additionalProperties, false)`
- L2691: `assert.equal(t.inputSchema.properties.verb.enum, undefined)`
- L2694: `assert.ok(Buffer.byteLength(JSON.stringify(t)) < 800, ˋthe entry is ${Buffer.byteLength(JSON.stringify(t))} bytesˋ)`
- L2696: `assert.ok(help.description.includes(needle), needle)`
- L2697: `assert.ok(!listed.tools.some((x) => x.name === "apex_cursor_agents" && /createPr|envFile/.test(JSON.stringify(x.inputSchema))))`

#### 2700–2722: apex_cursor_agents maps each verb to cursor-agents.mjs argv

Targets/fixtures: MCP-core; MCP-Cursor.

- L2701: `assert.deepEqual(cursorArgv({ verb: "list" }), ["list", "--limit", "20"])`
- L2702: `assert.deepEqual(cursorArgv({ verb: "list", options: { limit: 130, pr: "https://github.com/o/r/pull/9", includeArchived: true } }), ["list", "--limit", "130", "--pr", "https://github.com/o/r/pull/9", "--include-archived"])`
- L2703: `assert.deepEqual(cursorArgv({ verb: "status", id: AID }), ["status", AID])`
- L2704: `assert.deepEqual(cursorArgv({ verb: "wait", id: AID }), ["wait", AID, "--timeout", "40", "--interval", "5"])`
- L2705: `assert.deepEqual(cursorArgv({ verb: "wait", id: AID, options: { timeoutS: 12 } }).slice(2, 4), ["--timeout", "12"])`
- L2706: `assert.deepEqual(cursorArgv({ verb: "artifact", id: AID, options: { path: "artifacts/a.md" } }), ["artifact", AID, "artifacts/a.md"])`
- L2707: `assert.deepEqual(cursorArgv({ verb: "transcript", id: AID, options: { run: "000000b2", only: ["tools", "errors"], tool: "task", grep: "ERR", results: true, summary: true, width: 90, noFetch: true } }), ["transcript", AID, "--run", "000000b2", "--no-fetch", "--only", "tools,errors", "--tool", "task", "--grep", "ERR", "--results", "--summary", "--width", "90"])`
- L2709: `assert.deepEqual(cursorArgv({ verb: "transcript", id: AID, options: { all: true, json: true } }), ["transcript", AID, "--all", "--json"])`
- L2711: `assert.deepEqual(cursorArgv({ verb: "call", id: AID, options: { ref: "4b8dc871#2", max: 500, noFetch: true } }), ["call", AID, "4b8dc871#2", "--no-fetch", "--max", "500"])`
- L2712: `assert.deepEqual(cursorArgv({ verb: "digest" }), ["digest"])`
- L2713: `assert.deepEqual(cursorArgv({ verb: "allowed" }), ["allowed"])`
- L2714: `assert.deepEqual(cursorArgv({ verb: "archive", id: AID }), ["archive", AID])`
- L2715: `assert.deepEqual(cursorArgv({ verb: "followup", id: AID, options: { text: "go", mode: "plan", mcpFile: "scratch/m.json" } }), ["followup", AID, "--text", "go", "--mode", "plan", "--mcp-file", "scratch/m.json"])`
- L2716: `assert.deepEqual(cursorArgv({ verb: "followup", id: AID, options: { textFile: "artifacts/t.txt" } }), ["followup", AID, "--text-file", "artifacts/t.txt"])`
- L2717: `assert.deepEqual(cursorArgv({ verb: "launch", options: { prompt: "do it", name: "n", model: "composer-2.5", branch: "main", mode: "agent", allowTwin: true, mcpFile: "scratch/m.json", subagentFile: "scratch/s.json", envNames: ["APEX_FLEET_AS", "APEX_AGENT_WEBHOOK_URL"] } }), ["launch", "--prompt", "do it", "--name", "n", "--model", "composer-2.5", "--ref", "main", "--mode", "agent", "--allow-twin", "--mcp-file", "scratch/m.json", "--subagent-file", "scratch/s.json", "--env", "APEX_FLEET_AS", "--env", "APEX_AGENT_WEBHOOK_URL"])`
- L2719: `assert.deepEqual(cursorArgv({ verb: "launch", options: { promptFile: "scratch/p.txt", pr: "https://github.com/o/r/pull/3", repo: "https://github.com/o/r" } }), ["launch", "--prompt-file", "scratch/p.txt", "--repo", "https://github.com/o/r", "--pr", "https://github.com/o/r/pull/3"])`
- L2720: `assert.deepEqual(cursorArgv({ verb: "cancel", id: AID, options: { confirm: AID, run: "run-3d266b1c" } }), ["cancel", AID, "--run", "run-3d266b1c"])`
- L2721: `assert.deepEqual(cursorArgv({ verb: "delete", id: AID, options: { confirm: AID } }), ["delete", AID])`

#### 2724–2779: apex_cursor_agents refuses what must never reach the CLI

Targets/fixtures: MCP-core; MCP-Cursor.

- L2726: `assert.ok(/verb must be one of list, status, wait, usage, artifacts, artifact, transcript, call, digest, allowed, launch, followup, cancel, archive, delete/.test(msg({ verb: "nope" })))`
- L2727: `assert.ok(/needs id = a bc-<uuid>/.test(msg({ verb: "status" })))`
- L2728: `assert.ok(/id may not start|needs id/.test(msg({ verb: "status", id: "--help" })))`
- L2729: `assert.ok(/needs id = a bc-<uuid>/.test(msg({ verb: "status", id: "bc-nothex" })))`
- L2731: `assert.ok(/needs options\.confirm equal to the agent id/.test(msg({ verb: "delete", id: AID })))`
- L2732: `assert.ok(/needs options\.confirm/.test(msg({ verb: "delete", id: AID, options: { confirm: "bc-99999999-8888-7777-6666-555555555555" } })))`
- L2733: `assert.ok(/needs options\.confirm/.test(msg({ verb: "cancel", id: AID, options: {} })))`
- L2736: `assert.ok(/unknown option promt for launch/.test(typo.message))`
- L2737: `assert.ok(/Did you mean "prompt"\?/.test(typo.fix))`
- L2738: `assert.ok(/unknown option limit for status/.test(msg({ verb: "status", id: AID, options: { limit: 3 } })))`
- L2739: `assert.ok(/unknown option createPr for launch/.test(msg({ verb: "launch", options: { prompt: "x", createPr: true } })))`
- L2740: `assert.ok(/unknown option envFile/.test(msg({ verb: "launch", options: { prompt: "x", envFile: "scratch/e" } })))`
- L2741: `assert.ok(/exactly one of options\.prompt or options\.promptFile/.test(msg({ verb: "launch", options: {} })))`
- L2742: `assert.ok(/exactly one/.test(msg({ verb: "launch", options: { prompt: "x", promptFile: "scratch/p" } })))`
- L2743: `assert.ok(/prompt must be 1\.\.100000/.test(msg({ verb: "launch", options: { prompt: " " } })))`
- L2744: `assert.ok(/exclusive/.test(msg({ verb: "launch", options: { prompt: "x", branch: "main", pr: "https://github.com/o/r/pull/1" } })))`
- L2746: `assert.ok(/not starting with CURSOR_/.test(msg({ verb: "launch", options: { prompt: "x", envNames: ["CURSOR_API_KEY"] } })))`
- L2747: `assert.ok(/variable names/.test(msg({ verb: "launch", options: { prompt: "x", envNames: ["has space"] } })))`
- L2748: `assert.ok(/array of variable NAMES/.test(msg({ verb: "launch", options: { prompt: "x", envNames: "A" } })))`
- L2752: `assert.ok(new RegExp(ˋ${n} is not in the launch env allowlist \\(APEX_FLEET_AS, APEX_SESSION_ID, APEX_AGENT_WEBHOOK_URL, APEX_AGENT_WEBHOOK_AUTH\\)ˋ).test(m), m)`
- L2755: `assert.ok(/under scratch\/ or artifacts\//.test(msg({ verb: "launch", options: { promptFile: f } })), f)`
- L2757: `assert.ok(/mcpFile must be a file under/.test(msg({ verb: "launch", options: { prompt: "x", mcpFile: "/tmp/m.json" } })))`
- L2758: `assert.ok(/subagentFile must be a file under/.test(msg({ verb: "launch", options: { prompt: "x", subagentFile: "src/s.json" } })))`
- L2759: `assert.ok(/repo is not valid/.test(msg({ verb: "launch", options: { prompt: "x", repo: "https://evil.example/o/r" } })))`
- L2760: `assert.ok(/pr is not valid/.test(msg({ verb: "launch", options: { prompt: "x", pr: "https://github.com/o/r/issues/1" } })))`
- L2761: `assert.ok(/model is not valid/.test(msg({ verb: "launch", options: { prompt: "x", model: "-rf" } })))`
- L2762: `assert.ok(/mode is not valid/.test(msg({ verb: "launch", options: { prompt: "x", mode: "yolo" } })))`
- L2763: `assert.ok(/artifacts\/\.\.\. path/.test(msg({ verb: "artifact", id: AID, options: { path: "../etc/passwd" } })))`
- L2764: `assert.ok(/artifacts\/\.\.\. path/.test(msg({ verb: "artifact", id: AID, options: { path: "artifacts/../x" } })))`
- L2765: `assert.ok(/timeoutS must be 1\.\.50/.test(msg({ verb: "wait", id: AID, options: { timeoutS: 51 } })))`
- L2766: `assert.ok(/ref is not valid/.test(msg({ verb: "call", id: AID, options: {} })))`
- L2767: `assert.ok(/ref is not valid/.test(msg({ verb: "call", id: AID, options: { ref: "x y" } })))`
- L2768: `assert.ok(/max must be 100\.\.20000/.test(msg({ verb: "call", id: AID, options: { ref: "a", max: 50 } })))`
- L2769: `assert.ok(/only must be a non-empty array/.test(msg({ verb: "transcript", id: AID, options: { only: ["nope"] } })))`
- L2770: `assert.ok(/width must be 20\.\.1000/.test(msg({ verb: "transcript", id: AID, options: { width: 5 } })))`
- L2771: `assert.ok(/limit must be 1\.\.200/.test(msg({ verb: "list", options: { limit: 500 } })))`
- L2772: `assert.ok(/options must be (an )?object/.test(msg({ verb: "list", options: "x" })))`
- L2775: `assert.equal(top.error, "bad_args")`
- L2776: `assert.ok(/unknown argument confirm/.test(top.message))`
- L2777: `assert.ok(/Valid: verb, id, options, dryRun/.test(top.fix))`
- L2778: `assert.ok(/Did you mean "options"\?/.test(cursorBody(callCli("apex_cursor_agents", { verb: "digest", option: {} })).fix))`

#### 2781–2817: withCursorVerdict turns the CLI's typed lines and exit codes into verdicts; only exit 0 is ok

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; MCP-Cursor.

- L2789: `assert.equal(b.ok, true)`
- L2790: `assert.equal(r.isError, undefined)`
- L2791: `assert.deepEqual(b.out, { verdict: "LAUNCH", lines: [ˋLAUNCH ${AID} run=run-1 model=composer-2.5ˋ] })`
- L2792: `assert.equal(b.stdout, "")`
- L2803: `assert.equal(b.ok, false, line)`
- L2804: `assert.equal(b.error, error, line)`
- L2805: `assert.equal(r.isError, true, line)`
- L2806: `assert.equal(b.message, line)`
- L2807: `assert.ok(fix.test(b.fix), line)`
- L2808: `assert.equal(b.out.verdict, line.split(" ")[0])`
- L2812: `assert.deepEqual(b.out, { verdict: null, agent: AID, rows: [{ kind: "run" }] })`
- L2815: `assert.equal(b.error, "timeout")`
- L2816: `assert.equal(b.stdout, "partial")`

#### 2819–2829: apex_cursor_agents is not read-only, is destructive and open-world, and runs nothing in mock mode

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-Cursor.

- L2821: `assert.equal(r.status, 0, r.stderr)`
- L2823: `assert.equal(body.ok, true)`
- L2824: `assert.equal(body.mock, true, "mock mode answers without spawning the CLI or touching the network")`
- L2826: `assert.ok(/name: "apex_cursor_agents",\s*week: 6,\s*kind: "tree"/.test(src), "no browser lock")`
- L2828: `assert.deepEqual(listed.annotations, { title: "Apex 26 · cursor agents", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true })`

#### 2831–2844: the apex_cursor_agents pin refuses --wait, dump, a verb outside the catalog and any other script

Targets/fixtures: MCP-core; MCP-Cursor.

- L2834: `assert.equal(pinOk("apex_cursor_agents", ok), null)`
- L2842: `assert.equal(JSON.parse(r.content[0].text).error, "pin_violated", argv.join(" "))`

#### 2847–2888: MCP concurrency: starting reservations enforce the cross-owner two-job ceiling

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L2859: `assert.match(args[1], /read -r gate/)`
- L2860: `assert.equal(options.stdio[0], "pipe")`
- L2863: `assert.ok(manifests.filter(m => m.state === "starting").every(m => m.owner?.birth && m.owner.pid === process.pid))`
- L2869: `assert.equal(gate, "go\n")`
- L2871: `assert.equal(published.state, "running", "workload gate follows durable running publication")`
- L2878: `assert.deepEqual(reservations, [1, 2])`
- L2879: `assert.equal(answers.filter(a => a.ok).length, 2)`
- L2880: `assert.equal(answers[2].error, "jobs_busy")`
- L2881: `assert.equal(body(owners[2].handlers.apex_job_start({ kind: "parts_sweep" })).error, "jobs_busy", "sequential refusal remains intact")`
- L2884: `assert.equal(next.ok, true, JSON.stringify(next))`
- L2886: `assert.ok(fs.readdirSync(path.join(dir, ".admission")).filter(f => f.endsWith(".json")).length <= 2, "provably retired history stays bounded")`

#### 2890–2928: MCP concurrency: failed spawns and stale reservations free slots; live unknown owners remain reserved

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L2906: `assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "job_spawn_failed")`
- L2907: `assert.equal(fs.readdirSync(dir).filter(f => f.endsWith(".json")).length, 0)`
- L2910: `assert.equal(first.ok, true)`
- L2912: `assert.equal(body(ex.handlers.apex_job_status({ jobId: first.jobId })).state, "failed")`
- L2919: `assert.equal(next.ok, true, JSON.stringify(next))`
- L2922: `assert.equal(retired.state, "failed")`
- L2923: `assert.match(retired.exit, /owner exited/)`
- L2925: `assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "jobs_busy", "unknown identity of a live owner must fail closed")`

#### 2930–2961: MCP concurrency: abandoned admission epochs recover while live claims refuse without spawning

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L2945: `assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "jobs_busy")`
- L2946: `assert.equal(spawned, 0)`
- L2949: `assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "jobs_busy", "uncertain latest ownership fails closed")`
- L2950: `assert.equal(spawned, 0)`
- L2954: `assert.equal(started.ok, true, JSON.stringify(started))`
- L2955: `assert.equal(spawned, 1)`
- L2956: `assert.equal(acquired, 1, "browser admission still takes the separate browser lock")`
- L2957: `assert.equal(JSON.parse(fs.readFileSync(path.join(admission, "2.json"), "utf8")).state, "released")`
- L2959: `assert.equal(released, 1)`

#### 2963–3005: MCP concurrency: simultaneous OS owners cannot publish more than two running jobs

Targets/fixtures: MCP-core; MCP-path/occupancy; MCP-process/results; EX-jobs.

- L2991: `assert.ok((await Promise.all(ready)).every(r => r.ready))`
- L2996: `assert.ok(accepted >= 1 && accepted <= 2, JSON.stringify(results))`
- L2997: `assert.ok(results.filter(r => !r.ok).every(r => r.error === "jobs_busy"))`
- L3000: `assert.equal(manifests.filter(m => m.state === "running").length, accepted)`

#### 3007–3030: MCP concurrency: failed running publication withholds the workload gate and frees admission

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L3023: `assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "job_spawn_failed")`
- L3024: `assert.deepEqual(gates, [undefined], "EOF aborts the wrapper before it executes the workload")`
- L3027: `assert.equal(fs.readdirSync(dir).filter(f => f.endsWith(".json")).length, 0)`
- L3028: `assert.equal(body(ex.handlers.apex_job_status({})).total, 0)`

#### 3032–3056: MCP concurrency: job wrapper aborts on owner EOF and executes normally after publication

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L3047: `assert.equal(started.ok, true)`
- L3049: `assert.equal(aborted.status, 125, aborted.stderr)`
- L3050: `assert.equal(fs.existsSync(marker), false, "owner EOF never runs the workload")`
- L3052: `assert.equal(healthy.status, 0, healthy.stderr)`
- L3053: `assert.equal(fs.readFileSync(marker, "utf8"), "ok")`
- L3054: `assert.equal(fs.readFileSync(options.env.APEX_JOB_EXIT_FILE, "utf8"), "0", "durable exit format remains unchanged")`

#### 3058–3092: MCP concurrency: a delayed pruned-epoch contender cannot enter or replace current admission

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L3075: `assert.equal(fs.existsSync(path.join(dir, "2.json")), false)`
- L3079: `assert.equal(takeJobAdmission(dir, owner, birth), null)`
- L3080: `assert.equal(fs.readFileSync(path.join(dir, "4.json"), "utf8"), current, "a stale contender never replaces or removes the current peer claim")`
- L3081: `assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "2.json"), "utf8")).state, "released", "losing own claim retires without entering")`
- L3088: `assert.equal(fs.readFileSync(path.join(dir, "0.json"), "utf8"), "broken")`
- L3089: `assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "1.json"), "utf8")).state, "held")`
- L3090: `assert.equal(fs.existsSync(path.join(dir, "2.json")), false, "retired stale contender may be pruned by current owner")`

#### 3094–3148: MCP concurrency: admission release failure cleans prelaunch resources and retries after recovery

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L3103: `assert.equal(held, false)`
- L3104: `assert.equal(held, true)`
- L3120: `assert.equal(failed.error, "job_spawn_failed")`
- L3121: `assert.match(failed.message, /owned admission release failure/)`
- L3122: `assert.equal(spawns, 0)`
- L3123: `assert.equal(held, false)`
- L3124: `assert.equal(acquired, 1)`
- L3124: `assert.equal(released, 1)`
- L3125: `assert.equal(descriptors.length, 2)`
- L3126: `assert.throws(() => fs.fstatSync(fd), { code: "EBADF" }, "prelaunch log descriptors close")`
- L3127: `assert.deepEqual(fs.readdirSync(dir).filter(f => !f.startsWith(".")), [], "failed launch owns no leftover reservation or logs")`
- L3129: `assert.equal(JSON.parse(fs.readFileSync(epoch, "utf8")).state, "held", "failed release keeps cross-owner admission closed")`
- L3130: `assert.equal(body(peer.handlers.apex_job_start({ kind: "parts_sweep" })).error, "jobs_busy")`
- L3131: `assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "job_spawn_failed", "retry stays closed while release publication still fails")`
- L3132: `assert.equal(spawns, 0)`
- L3133: `assert.equal(acquired, 1, "release recovery precedes any new reservation or browser lock")`
- L3137: `assert.equal(recovered.ok, true, JSON.stringify(recovered))`
- L3138: `assert.equal(spawns, 1)`
- L3139: `assert.deepEqual(gates, ["go\n"])`
- L3140: `assert.equal(JSON.parse(fs.readFileSync(epoch, "utf8")).state, "released")`
- L3141: `assert.equal(JSON.parse(fs.readFileSync(path.join(dir, ".admission/2.json"), "utf8")).state, "released")`
- L3143: `assert.equal(held, false)`
- L3143: `assert.equal(acquired, 2)`
- L3143: `assert.equal(released, 2)`

#### 3150–3165: MCP concurrency: retrying admission release never replaces uncertain peer identity

Targets/fixtures: MCP-core; MCP-path/occupancy; EX-jobs.

- L3157: `assert.throws(release, /owned release failure/)`
- L3161: `assert.throws(release, /ownership changed/)`
- L3162: `assert.equal(fs.readFileSync(file, "utf8"), peer)`
- L3163: `assert.equal(takeJobAdmission(dir, owner, birth), null)`

## Shared assertion helpers

These call sites run through tests that use the helpers; their production targets are MCP-core transport/admission or MCP-Cursor argument construction as named.

- apex-tools-mcp.test.mjs:48: `assert.equal(r.status, 0, r.error?.message || r.stderr)`

- apex-tools-mcp.test.mjs:1674: `assert.ok(r && r.result, ˋno reply for ${calls[i][0]}ˋ)`

- apex-tools-mcp.test.mjs:2674: `assert.equal(r.status, 0, r.stderr)`

- apex-tools-mcp.test.mjs:2679: `assert.equal(cursorBody(r).error, "bad_args", JSON.stringify(args))`
