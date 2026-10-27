# Unit batch 60 — complete source map

Read-only source mapping of all 13 assigned files (4,326 lines). Every assigned line was returned and read in numbered chunks of at most 100 lines and 10,000 characters; weather-blend 1–200 was re-read after an aggregate response truncated. No test suite, browser, runtime mutation or commit was performed. SHA-256 values bind this map to exact source bytes. Assertions below are inventoried from parsed call expressions after the full manual reads; statement spans include multiline assertions. Case names supply the behavioral intent, and the quoted assertion expressions record exact operands, expected values, thresholds and messages. Per-file fixture/target/limit notes apply to every case in that file. Counts are declarations unless explicitly expanded.

## Production navigation evidence

Attached apex-lsp definition/reference/outline queries were used for production symbols. Definitions: VoicePack `js/audio/voice-pack.js:22` (actual create at 155, norm 64, compose 90, codecs 136); RadioVoice `js/audio/radio-voice.js:10` / create 300; Spotter `js/race/spotter.js:18` (fresh 33, occupancy 36, step 59, create 89); RaceWakeLock `js/core/wake-lock.js:3` / create 12; WallClamp `js/physics/wall-clamp.js:13` / apply 28; WallEndFace `js/physics/wall-end-face.js:16` / apply 27; WatchTransport `js/ui/watch-transport.js:2` / create 10; WeatherArc `js/race/weather-arc.js:2` / create 38; Atmosphere `js/lighting/atmosphere.js:10` / create 13; Tracks.terrainY `js/track/tracks.js:788` (export 859).

LSP references place RaceWakeLock, WallClamp, WeatherArc and Atmosphere in `js/game.js`; WallEndFace in WallClamp; WatchTransport in `js/race/real-replay.js`; VoicePack in radio-voice/lazy-bundles; RadioVoice in announcer/panel/race-radio/game/lazy-bundles/announce-banner/captions; Spotter in race-radio/lazy-bundles. Tracks.terrainY has 22 references across 10 files including scenery, camera and lamp-bake. Repeated reinjected globals cause LSP member queries for VoicePack.create and Spotter.create to select stubs; file-scoped outlines explicitly identify actual implementations above. Stub-selected results are not treated as proof of runtime dispatch. Tooling modules are imported directly by their tests and their export declaration locations were inspected statically.

## Parameterized registered case names

`wake-lock-vm`: lines 45–73 register held lock handles asynchronous release failure; held lock handles synchronous release failure; late grant handles asynchronous release failure; late grant handles synchronous release failure. `wall-clamp`: lines 395–411 register driving keeps pit road/lane and exit boundaries (side -1) and driving keeps pit road/lane and exit boundaries (side 1). `weather-arc-rain`: lines 80–89 register rain → dry, dry → rain, overcast → rain, rain → overcast, fog → rain, rain → fog, each followed by: falling rain and audio follow the atmosphere independently of surface water. Their body/assertion spans are shared as inventoried below. Total: 193 declaration sites, 202 registered cases, 852 assertion sites inside cases and 6 shared helper assertion sites. No registration was executed.

## Source and case inventory

## `tests/unit/voice-pack.test.mjs`

Full read: **1–1364**. SHA-256: `ea6620514a458d8b5eb796375bae1b3d2d81225a94f36c969dec4b09d1b75a22`. 65 test declarations; 351 assertion call sites inside cases.

Fixtures and cleanup: 30–43 sandbox/J/shared module realm; 82–93 committed all-voice × all-channel manifests and binary sizes; 114–138 offline text-audio encoder and synthesis counters; 406–429 fake pack/synthesis/store/radio; 527–531 fixed-step spotter runner; 903–910 wall-clock until; 1286–1308 codec/OfflineAudioContext fixture. Scratch generation fixtures use try/finally removal; timers are unrefed.

Exercised targets: Real VoicePack normalization, longest-key complete composition, pack selection, integrity, load/staging/gating, decode budget/cache/relevance/context generation, release/reselection, codec fallback; RadioVoice speech routing/tuning/preview/halt and Spotter occupancy/debounce/priority. Also voicepack generator integrity/cache/append/Opus encoding; audition request construction; RadioLines/Teams/RaceEngineer coverage and game pit-work source wiring.

Semantics and limits: Committed pack metadata/digest/coverage checks do not decode or listen to actual recorded audio. Fake encoders assert arguments and byte preservation, not codec quality. Offline request shapes never call providers. Speech/audio/network/device APIs are mocks; commentary branches explicitly skipped in channel and priority loops. GAP_S spacing case does not assert a minimum number of emitted calls. Header comments describe history, not new measurements.

### a lap time splices from number clips, the way the broadcast reads one

Case range: **47–51**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` J ``, `` VoicePack.norm ``, `` say ``.

Assertion spans and exact semantics:

- **48**: `` assert.deepEqual(J(VoicePack.norm(say("PERSONAL BEST, 1:32.4"))), ["personal", "best", { p: 0.05 }, "1", "32", "point", "4"]) ``
- **49**: `` assert.deepEqual(J(VoicePack.norm(say("FASTEST LAP 1:05.3."))), ["fastest", "lap", "1", "oh", "5", "point", "3"]) ``
- **50**: `` assert.deepEqual(J(VoicePack.norm("1.4 seconds")), ["1.4", "seconds"], "a gap is not a lap time") ``

### norm keeps a gap a word, and turns sentence punctuation into pauses

Case range: **53–59**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` J ``, `` VoicePack.norm ``, `` say ``.

Assertion spans and exact semantics:

- **54–55**: `` assert.deepEqual(J(VoicePack.norm(say("1.4s TO NORRIS. YOU'RE IN RANGE"))), ["1.4", "seconds", "to", "norris", { p: 0.1 }, "you're", "in", "range"]) ``
- **56**: `` assert.deepEqual(J(VoicePack.norm(say("P7. NICE MOVE"))), ["p", "7", { p: 0.1 }, "nice", "move"]) ``
- **57–58**: `` assert.deepEqual(J(VoicePack.norm("rain in 3 laps, be ready!")), ["rain", "in", "3", "laps", { p: 0.05 }, "be", "ready"], "a trailing pause is dropped: the squelch ends the line, not silence") ``

### compose takes the LONGEST key at each step and refuses a line it cannot cover whole

Case range: **61–68**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` keys.has ``, `` J ``, `` VoicePack.compose ``, `` say ``.

Assertion spans and exact semantics:

- **64**: `` assert.deepEqual(J(VoicePack.compose("box box box", has)), [{ k: "box box box" }], "one clip, not three") ``
- **65**: `` assert.deepEqual(J(VoicePack.compose(say("P3. BOX NEXT LAP"), has)), [{ k: "p 3" }, { p: 0.1 }, { k: "box" }, { k: "next lap" }]) ``
- **66**: `` assert.equal(VoicePack.compose(say("BOX NEXT LAP, VERSTAPPEN"), has), null, "one missing word and the pack stays out of it") ``
- **67**: `` assert.equal(VoicePack.compose("", has), null) ``

### a complete performance wins over fragments, including internal pauses and long circuit lore

Case range: **70–76**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` VoicePack.lineKey ``, `` VoicePack.norm(text).filter ``, `` VoicePack.norm ``, `` J ``, `` VoicePack.compose ``, `` keys.has ``.

Assertion spans and exact semantics:

- **74**: `` assert.deepEqual(J(VoicePack.compose(text, (k) => keys.has(k))), [{ k: full }]) ``
- **75**: `` assert.equal(VoicePack.compose("Welcome to a different circuit", (k) => keys.has(k)), null) ``

### integrity-only generation is deterministic and leaves recorded bytes unchanged

Case range: **95–110**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` stampIntegrity ``, `` createHash("sha256").update(bin).digest ``, `` createHash("sha256").update ``, `` createHash ``.

Assertion spans and exact semantics:

- **103**: `` assert.equal(stampIntegrity(dir), 1) ``
- **105**: `` assert.deepEqual(JSON.parse(generated).binary, { bytes: bin.length, sha256: createHash("sha256").update(bin).digest("hex") }) ``
- **107**: `` assert.equal(fs.readFileSync(path.join(dir, "test.json"), "utf8"), generated) ``
- **108**: `` assert.deepEqual(fs.readFileSync(path.join(dir, "test.bin")), bin) ``

### author-time cache distinguishes channel text and synthesis inputs while warm rebuilds preserve clips

Case range: **140–165**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` recordingFixture ``, `` phrases("george", "radio").find ``, `` phrases ``, `` phrases("george", "coach").find ``, `` recordClips ``, `` build ``, `` result.binary.toString().slice ``, `` result.binary.toString ``, `` decode ``, `` f.counts ``, `` f.calls().filter ``, `` f.calls ``, `` encodes.every ``, `` args.includes ``, `` encodes[0].indexOf ``, `` name.endsWith ``, `` f.close ``.

Assertion spans and exact semantics:

- **145**: `` assert.equal(radio.text, "Mediums") ``
- **145**: `` assert.equal(coach.text, "M") ``
- **150**: `` assert.equal(decode(first).text, "Mediums") ``
- **151**: `` assert.equal(decode(second).text, "M", "same key/speed/voice must never reuse another channel's speech") ``
- **152**: `` assert.notDeepEqual(first.binary, second.binary) ``
- **153**: `` assert.deepEqual(second.clips.m, [0, second.binary.length, 1.25]) ``
- **155**: `` assert.deepEqual(warm, second, "identical input preserves publishable bytes and clip offsets/durations") ``
- **156**: `` assert.deepEqual(f.counts(), { loads: 2, generations: 2 }) ``
- **158**: `` assert.deepEqual(f.counts(), { loads: 5, generations: 5 }, "each changed synthesis input invalidates the encode") ``
- **160**: `` assert.equal(encodes.length, 5) ``
- **161**: `` assert.ok(encodes.every((args) => args.includes("24000") && args.includes("libmp3lame") && args.includes("32k"))) ``
- **162**: `` assert.match(encodes[0][encodes[0].indexOf("-af") + 1], /silenceremove=.*areverse/) ``
- **163**: `` assert.equal(fs.readdirSync(f.dir).filter((name) => name.endsWith(".mp3")).length, 5) ``

### multiple cache misses load one model, and a no-op append touches neither model nor encoder

Case range: **167–197**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` recordingFixture ``, `` recordClips ``, `` f.counts ``, `` f.calls ``, `` appended.binary.subarray ``, `` appended.binary.subarray(offset, offset + length).toString ``, `` f.calls().filter ``, `` f.close ``.

Assertion spans and exact semantics:

- **172**: `` assert.deepEqual(f.counts(), { loads: 1, generations: 2 }) ``
- **176**: `` assert.deepEqual(noOp, first) ``
- **177**: `` assert.deepEqual(f.counts(), { loads: 1, generations: 2 }) ``
- **178**: `` assert.equal(f.calls().length, 4, "only initial encodes and duration probes ran") ``
- **183–184**: `` assert.deepEqual(appended.binary.subarray(0, first.binary.length), first.binary, "partial append preserves every previously published byte") ``
- **185–186**: `` assert.deepEqual(appended.clips[key], first.clips[key], "existing clip offsets, lengths and durations are unchanged") ``
- **188**: `` assert.equal(offset, first.binary.length, "new clip begins immediately after existing bytes") ``
- **189**: `` assert.equal(offset + length, appended.binary.length) ``
- **190**: `` assert.equal(duration, 1.25) ``
- **192**: `` assert.equal(recorded.text, extra.text, "the new index entry points to the requested speech") ``
- **193**: `` assert.deepEqual(f.counts(), { loads: 2, generations: 3 }, "partial append adds just one model load and generation") ``
- **194**: `` assert.equal(f.calls().length, 6, "partial append adds one encode and one duration probe") ``
- **195**: `` assert.equal(f.calls().filter((args) => args.length > 2).length, 3, "only the new clip is encoded") ``

### --opus records an Ogg Opus twin from the same render, and leaves the MP3 bytes untouched

Case range: **199–224**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` recordingFixture ``, `` recordClips ``, `` f.counts ``, `` f.calls().filter ``, `` f.calls ``, `` a.includes ``, `` opusEncodes.every ``, `` a.indexOf ``, `` f.calls()[0].indexOf ``, `` f.close ``.

Assertion spans and exact semantics:

- **205**: `` assert.deepEqual(both.binary, plain.binary, "the MP3 .bin is byte-identical with or without the twin") ``
- **206**: `` assert.deepEqual(both.clips, plain.clips) ``
- **207**: `` assert.deepEqual(f.counts(), { loads: 2, generations: 4 }, "a missing twin re-renders, it never transcodes the MP3") ``
- **209**: `` assert.equal(opusEncodes.length, 2) ``
- **210–211**: `` assert.ok(opusEncodes.every((a) => a.includes("ogg") && a.includes("20k") && a.includes("24000") && a[a.indexOf("-af") + 1] === f.calls()[0][f.calls()[0].indexOf("-af") + 1]), "same trim filter, 24 kHz mono, 20 kbps Ogg") ``
- **215**: `` assert.equal(o, off, key + " is contiguous in the twin") ``
- **216**: `` assert.equal(secs, 1.25) ``
- **219**: `` assert.equal(off, both.opus.binary.length, "the twin's index accounts for every byte") ``
- **222**: `` assert.deepEqual(warm.opus.binary, both.opus.binary, "cached twin clips rebuild without synthesis") ``

### CLI no-op append succeeds without an installed Kokoro package and preserves the published pack

Case range: **226–242**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fullPhrases("george", "radio").map ``, `` fullPhrases ``, `` binaryIntegrity ``, `` spawnSync ``.

Assertion spans and exact semantics:

- **238**: `` assert.equal(result.status, 0, result.stderr) ``
- **239**: `` assert.deepEqual(fs.readFileSync(path.join(dir, "george.bin")), binary) ``
- **240**: `` assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "george.json"))), man) ``

### a recorded pack rejects mixed, truncated, legacy, or unverifiable binary bytes

Case range: **244–260**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` binaryIntegrity ``, `` bin.slice ``, `` sandbox ``, `` sb.VoicePack.create ``, `` pack.load ``, `` pack.ready ``, `` pack.plan ``.

Assertion spans and exact semantics:

- **256**: `` assert.equal(await pack.load("george"), scenario === "valid", scenario) ``
- **257**: `` assert.equal(pack.ready("george"), scenario === "valid", scenario) ``
- **258**: `` assert.equal(pack.plan("george", "hello"), null, scenario + " never becomes playable") ``

### every pack is one contiguous, licensed, small file

Case range: **262–288**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` binaryIntegrity ``, `` k.startsWith ``, `` J ``, `` (total / 1048576).toFixed ``.

Assertion spans and exact semantics:

- **265**: `` assert.deepEqual(man.binary, binaryIntegrity(fs.readFileSync(path.join(ROOT, `assets/voice/${id}.bin`))), `${id}: digest and byte length bind the index to its recorded bytes`) ``
- **266**: `` assert.equal(man.licence, "Apache-2.0", `${id}: Kokoro-82M's weights and voices are Apache-2.0`) ``
- **270**: `` assert.equal(o, off, `${id}: ${k} starts where the last clip ended`) ``
- **271**: `` assert.ok(len > 100, `${id}: ${k} has audio`) ``
- **272**: `` assert.ok(secs > 0.05 && secs < (k.startsWith("@line:") ? 20 : 6), `${id}: ${k} lasts ${secs}s`) ``
- **275**: `` assert.equal(off, bin, `${id}: the index accounts for every byte of the .bin`) ``
- **280**: `` assert.ok(bin < 8 * 1024 * 1024, `${id} exceeds the 8 MB complete-recording budget`) ``
- **283**: `` assert.equal(Object.keys(PACKS).length, Object.keys(J(VoicePack.VOICES)).length * SPEAKERS_ALL.length, "every voice ships every channel") ``
- **285**: `` assert.ok(total < 120 * 1024 * 1024, `all ${Object.keys(PACKS).length} packs total ${(total / 1048576).toFixed(2)} MB`) ``
- **287**: `` assert.ok(defaults < 18 * 1024 * 1024, "selected defaults stay within an 18 MB race download; alternatives load only when selected") ``

### every voice's pack for every channel includes that channel's complete calls and fallback vocabulary

Case range: **290–302**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` J ``, `` key.startsWith ``, `` hasIn(pk) ``, `` hasIn ``, `` fullPhrases ``, `` VoicePack.compose ``.

Assertion spans and exact semantics:

- **293**: `` assert.equal(PACKS[pk].man.voice, J(VoicePack.VOICES)[id].voice, pk + " is " + id + "'s voice") ``
- **295**: `` assert.ok(hasIn(pk)(key), pk + ": " + key) ``
- **298**: `` assert.ok(hasIn(pk)(key), pk + ": " + text) ``
- **299**: `` assert.deepEqual(J(VoicePack.compose(text, hasIn(pk))), [{ k: key }]) ``

### provider auditions use the same 12 race calls and checked speech APIs

Case range: **304–317**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` requestFor ``, `` openai.body.instructions.includes ``, `` eleven.body.inputs[0].text.endsWith ``.

Assertion spans and exact semantics:

- **305**: `` assert.equal(SAMPLES.length, 12) ``
- **308**: `` assert.equal(openai.url, "https://api.openai.com/v1/audio/speech") ``
- **309**: `` assert.equal(openai.body.input, s.text) ``
- **310**: `` assert.ok(openai.body.instructions.includes(s.delivery)) ``
- **312**: `` assert.equal(eleven.url, "https://api.elevenlabs.io/v1/text-to-dialogue") ``
- **313**: `` assert.equal(eleven.body.inputs[0].voice_id, "chosen-voice") ``
- **314**: `` assert.ok(eleven.body.inputs[0].text.endsWith(s.text)) ``
- **315**: `` assert.equal(eleven.body.model_id, "eleven_v4") ``

### every commentary line composes from the commentator's pack, for every driver on the grid

Case range: **319–336**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` names.push ``, `` RadioLines.surname ``, `` pool.startsWith ``, `` names.forEach ``, `` RadioLines.fill ``, `` RadioLines.gapText ``, `` RadioLines.timeText ``, `` packsFor ``, `` VoicePack.compose ``, `` say ``, `` hasIn ``, `` misses.push ``.

Assertion spans and exact semantics:

- **334**: `` assert.ok(n > 300, "the sweep is real") ``
- **335**: `` assert.deepEqual([...new Set(misses)], [], "commentary the pack cannot say (re-run tools/gen/voicepack.mjs --id fable)") ``

### every line the game was heard saying in a race composes from its own channel's pack

Case range: **338–350**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` VoicePack.compose ``, `` hasIn ``, `` misses.push ``.

Assertion spans and exact semantics:

- **348**: `` assert.ok(n > 50, "the corpus is real: " + n) ``
- **349**: `` assert.deepEqual(misses, [], "re-run tools/gen/voicepack.mjs for the channel named") ``

### every engineer line, lap times included, composes from the pack, for every driver on the grid

Case range: **352–372**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` names.push ``, `` RadioLines.surname ``, `` pool.startsWith ``, `` names.forEach ``, `` RadioLines.fill ``, `` RadioLines.gapText ``, `` RadioLines.timeText ``, `` packsFor ``, `` VoicePack.compose ``, `` say ``, `` hasIn ``, `` misses.push ``.

Assertion spans and exact semantics:

- **370**: `` assert.ok(n > 1000, "the sweep is real") ``
- **371**: `` assert.deepEqual([...new Set(misses)], [], "lines the pack cannot say (re-run tools/gen/voicepack.mjs)") ``

### every tyre and pit call the engineer (js/race/engineer.js) makes composes from the pack

Case range: **374–396**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` RE.create ``, `` cases.push ``, `` E.callFor ``, `` VoicePack.compose ``, `` say ``, `` misses.push ``.

Assertion spans and exact semantics:

- **395**: `` assert.deepEqual([...new Set(misses)], [], "engineer calls the pack cannot say (re-run tools/gen/voicepack.mjs)") ``

### the positions, gaps and spotter calls a line can carry are all recorded

Case range: **398–402**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` hasKey ``, `` RadioLines.gapText ``.

Assertion spans and exact semantics:

- **399**: `` assert.ok(hasKey("p " + p), "P" + p) ``
- **400**: `` assert.ok(hasKey(RadioLines.gapText(g)), "gap " + g) ``
- **401**: `` assert.ok(hasKey(k), "spotter: " + k) ``

### a line the pack covers is played from it, after the courtesy figure, and synthesis stays quiet

Case range: **431–441**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` radio ``, `` r.v.say ``, `` r.packCalls.find ``, `` r.ducks.at ``, `` r.end ``.

Assertion spans and exact semantics:

- **433**: `` assert.equal(r.v.say("BOX BOX BOX", 3, "info", 0.5), true) ``
- **435**: `` assert.equal(call.id, "george") ``
- **436**: `` assert.equal(call.leadS, 0.5, "the words start after the figure, as synthesis' do") ``
- **437**: `` assert.deepEqual(r.spoken, [], "speech synthesis did not also say it") ``
- **438**: `` assert.equal(r.ducks.at(-1), true, "the music ducks under the recorded voice too") ``
- **440**: `` assert.equal(r.ducks.at(-1), false, "and comes back when it ends") ``

### a selected engineer is persisted, prepared and played; any voice may take any channel, an unknown one is refused

Case range: **443–463**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` radio ``, `` r.v.setRecordedVoice ``, `` r.v.recordedVoice ``, `` r.saved.get ``, `` r.reload().recordedVoice ``, `` r.reload ``, `` r.v.say ``, `` r.packCalls.find ``, `` r.v.recordedPack ``, `` r.ensures.at ``, `` J(VoicePack.choices(sp)).map((c) => c.id).sort ``, `` J(VoicePack.choices(sp)).map ``, `` J ``, `` VoicePack.choices ``.

Assertion spans and exact semantics:

- **445**: `` assert.equal(r.v.setRecordedVoice("radio", "michael"), true) ``
- **446**: `` assert.equal(r.v.recordedVoice("radio"), "michael") ``
- **447**: `` assert.equal(r.saved.get("voiceTune").radio.pack, "michael") ``
- **448**: `` assert.equal(r.reload().recordedVoice("radio"), "michael", "the selected pack survives reload") ``
- **449**: `` assert.equal(r.v.setRecordedVoice("radio", "missing"), false) ``
- **450**: `` assert.equal(r.v.say("BOX BOX BOX", 3, "info"), true) ``
- **451**: `` assert.equal(r.packCalls.find((c) => c.id).id, "michael", "a voice on its own channel speaks from its own pack") ``
- **453**: `` assert.equal(r.v.setRecordedVoice("radio", "bella"), true) ``
- **454**: `` assert.equal(r.v.recordedPack("radio"), "bella-radio") ``
- **455**: `` assert.equal(r.ensures.at(-1), "bella-radio", "the pick prepares the pack the channel speaks from, not bella's own (#3110)") ``
- **457**: `` assert.equal(r.v.say("BOX BOX BOX", 3, "info"), true) ``
- **458**: `` assert.equal(r.packCalls.find((c) => c.id).id, "bella-radio") ``
- **460**: `` assert.deepEqual(J(VoicePack.choices(sp)).map((c) => c.id).sort(), Object.keys(J(VoicePack.VOICES)).sort(), sp + " offers every voice") ``
- **461**: `` assert.equal(J(VoicePack.choices(sp))[0].id, RadioVoice.PACK_VOICE[sp], sp + ": the shipped default heads the list") ``

### pre-race announcer source is independent of the recorded race radio

Case range: **465–481**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` radio ``, `` old.v.announcerPackOn ``, `` old.v.packOn ``, `` r.v.announcerPackOn ``, `` r.v.setTune ``, `` r.v.packOn ``, `` r.v.setPackOn ``, `` r.v.setRecordedVoice ``, `` r.v.preview ``, `` r.packCalls.find ``, `` r.reload().announcerPackOn ``, `` r.reload ``.

Assertion spans and exact semantics:

- **467**: `` assert.equal(old.v.announcerPackOn(), false, "existing system announcer choices survive the upgrade") ``
- **468**: `` assert.equal(old.v.packOn(), true) ``
- **470**: `` assert.equal(r.v.announcerPackOn(), true) ``
- **472**: `` assert.equal(r.v.announcerPackOn(), false) ``
- **473**: `` assert.equal(r.v.packOn(), true) ``
- **476**: `` assert.equal(r.v.packOn(), false, "a recorded presenter does not change race-radio source") ``
- **477**: `` assert.equal(r.v.announcerPackOn(), true) ``
- **478**: `` assert.equal(r.v.preview("announcer"), true) ``
- **479**: `` assert.equal(r.packCalls.find((c) => c.id).id, "bella") ``
- **480**: `` assert.equal(r.reload().announcerPackOn(), true, "the independent presenter source survives reload") ``

### a cancelled recorded audition cannot start after its download; no platform speech while waiting

Case range: **483–492**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` radio ``, `` r.v.preview ``, `` r.v.stop ``, `` resolve ``, `` r.packCalls.filter ``.

Assertion spans and exact semantics:

- **487**: `` assert.equal(r.v.preview("radio"), true) ``
- **488**: `` assert.deepEqual(r.spoken, []) ``
- **491**: `` assert.equal(r.packCalls.filter((c) => c.id).length, 0) ``

### RECORDED never hands a race line to speech synthesis: a line no clip covers stays written; SYSTEM never asks the pack

Case range: **494–508**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` radio ``, `` miss.v.say ``, `` miss.v.debug ``, `` miss.v.busy ``, `` sys.v.say ``, `` sys.packCalls.filter ``.

Assertion spans and exact semantics:

- **498**: `` assert.equal(miss.v.say("BOX BOX BOX", 3, "info"), false, "not spoken") ``
- **500**: `` assert.deepEqual(miss.spoken, [], "and not by speech synthesis either") ``
- **501**: `` assert.equal(miss.v.debug().last.reason, "not-recorded", "the audio panel can say why") ``
- **502**: `` assert.equal(miss.v.busy(), false, "a written line does not hold the channel") ``
- **506**: `` assert.equal(sys.packCalls.filter((c) => c.id).length, 0, "the SYSTEM setting keeps every line on synthesis") ``
- **507**: `` assert.equal(sys.spoken.length, 1) ``

### every race channel speaks in its own recorded voice and its own sound

Case range: **510–523**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` J ``, `` radio ``, `` r.v.say ``, `` r.packCalls.find ``.

Assertion spans and exact semantics:

- **511**: `` assert.deepEqual(J(RadioVoice.PACK_VOICE), { radio: "george", announcer: "fable", control: "emma", coach: "heart" }) ``
- **518**: `` assert.equal(call && call.id, id, kind) ``
- **519**: `` assert.equal(call.fx, fx, kind + " has its own sound") ``
- **522**: `` assert.deepEqual(r.spoken, [], "no channel reached speech synthesis") ``

### a car alongside is called once, after the debounce, and 'clear' only follows a call

Case range: **533–541**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` Spotter.fresh ``, `` run ``.

Assertion spans and exact semantics:

- **535**: `` assert.deepEqual(run(st, 0, 1), [], "nothing alongside, nothing said") ``
- **536**: `` assert.deepEqual(run(st, 1, 0.1), [], "a car darting in for 0.1 s is not called") ``
- **537**: `` assert.deepEqual(run(st, 0, 0.5), [], "...and its leaving is not a 'clear' either") ``
- **538**: `` assert.deepEqual(run(st, 1, 1), ["car left"]) ``
- **539**: `` assert.deepEqual(run(st, 3, 1), ["three wide"]) ``
- **540**: `` assert.deepEqual(run(st, 0, 1), ["clear"]) ``

### one 'still there' when a car stays alongside, not one a second

Case range: **543–546**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` Spotter.fresh ``, `` run ``.

Assertion spans and exact semantics:

- **545**: `` assert.deepEqual(run(st, 2, 10), ["car right", "still there"]) ``

### occupancy: side by sign of lateral, across the start/finish wrap, pit-lane cars ignored

Case range: **548–558**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` Spotter.occupancy ``.

Assertion spans and exact semantics:

- **551**: `` assert.equal(Spotter.occupancy(me, [me, { s: 2, x: -2.5 }], LAP), 1, "4 m up the road over the line, on your left") ``
- **552**: `` assert.equal(Spotter.occupancy(me, [me, { s: 996, x: 2.5 }], LAP), 2, "on your right") ``
- **553**: `` assert.equal(Spotter.occupancy(me, [me, { s: 998, x: 0.3 }], LAP), 0, "dead in line is not alongside") ``
- **554**: `` assert.equal(Spotter.occupancy(me, [me, { s: 998, x: 6 }], LAP), 0, "a lane over is not alongside") ``
- **555**: `` assert.equal(Spotter.occupancy(me, [me, { s: 990, x: 2 }], LAP), 0, "8 m back is behind, not beside") ``
- **556**: `` assert.equal(Spotter.occupancy(me, [me, { s: 998, x: 2, pitState: "lane" }], LAP), 0) ``
- **557**: `` assert.equal(Spotter.occupancy(me, [me, { s: 998, x: 2, retired: true }], LAP), 0) ``

### the spotter speaks only from the pack, and not over the engineer

Case range: **560–580**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` ids.push ``, `` said.push ``, `` store.has ``, `` store.get ``, `` store.set ``, `` Spotter.create ``, `` s.update ``.

Assertion spans and exact semantics:

- **570**: `` assert.deepEqual(said, ["Car left."]) ``
- **571**: `` assert.deepEqual(ids, ["michael"], "the spotter uses the selected engineer") ``
- **575**: `` assert.equal(said.length, 1, "SPOTTER off is silent") ``
- **579**: `` assert.equal(said.length, 1, "no pack, no spotter — synthesis is too slow for 'car left'") ``

### a side change the spotter cannot say yet stays pending, and is said when the channel frees — never lost

Case range: **584–596**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` Spotter.fresh ``, `` Spotter.step ``, `` out.push ``.

Assertion spans and exact semantics:

- **592**: `` assert.deepEqual(out, [], "nothing said while the engineer has the channel") ``
- **595**: `` assert.deepEqual(out, ["car left"], "the call is made the moment it can be — not skipped to 'still there'") ``

### two spotter calls are at least GAP_S apart (lights-out is a wall of cars)

Case range: **598–605**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` Spotter.fresh ``, `` Spotter.step ``, `` at.push ``, `` at.map ``, `` x.toFixed ``.

Assertion spans and exact semantics:

- **604**: `` assert.ok(at[i] - at[i - 1] >= Spotter.GAP_S - 1e-9, `calls ${at.map((x) => x.toFixed(2))}`) ``

### the spotter is silent while paused and once the player has taken the flag

Case range: **607–625**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` said.push ``, `` Spotter.create ``, `` s.update ``.

Assertion spans and exact semantics:

- **617**: `` assert.deepEqual(said, []) ``
- **621**: `` assert.deepEqual(said, [], "not over an engineer line that is about to start") ``
- **624**: `` assert.deepEqual(said, ["Car left."], "and called as soon as the channel is clear") ``

### VoicePack keeps one transmission per channel: the engineer never cuts the spotter off

Case range: **627–652**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` integrity ``, `` handles.push ``, `` sandbox ``, `` sb.VoicePack.create ``, `` P.load ``, `` P.ready ``, `` P.speak ``, `` P.busy ``, `` P.stop ``, `` handles.every ``.

Assertion spans and exact semantics:

- **641**: `` assert.equal(P.ready("george"), true) ``
- **642**: `` assert.equal(P.speak("george", "car left", { channel: "spotter" }), true) ``
- **644**: `` assert.equal(P.busy("spotter"), true) ``
- **646**: `` assert.equal(handles[0].stopped, false, "an engineer preempt leaves the spotter call alone") ``
- **647**: `` assert.equal(P.speak("george", "box box box", { channel: "radio" }), true) ``
- **649**: `` assert.equal(handles[0].stopped, false, "a new engineer line does not cut the spotter either") ``
- **651**: `` assert.equal(handles.every((h) => h.stopped), true, "stop() with no channel cuts everything") ``

### a failed fetch is retried later instead of disabling the pack for the session

Case range: **654–670**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` sb.VoicePack.create ``, `` P.ensure ``, `` realNow ``, `` vm.runInContext ``.

Assertion spans and exact semantics:

- **663**: `` assert.equal(P.ensure("george"), "failed", "still failed inside the retry window") ``
- **669**: `` assert.ok(calls > n, "fetched again after the retry window") ``

### '40%' is spoken as a word, so the tyre call comes from the pack

Case range: **672–676**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` say ``, `` VoicePack.compose ``.

Assertion spans and exact semantics:

- **673**: `` assert.equal(say("TYRES AT 40%"), "tyres at 40 percent") ``
- **674**: `` assert.ok(VoicePack.compose(say("TYRES AT 85%"), hasKey), "85 and 'percent' are both recorded") ``
- **675**: `` assert.ok(VoicePack.compose(say("VER HAS BOXED — UNDERCUT ON, BOX NOW OR PUSH 2 LAPS"), hasKey), "a rival's code is its surname") ``

### an engineer line waits for a spotter call on the air, and RadioVoice reports itself busy meanwhile

Case range: **678–687**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` radio ``, `` r.v.say ``, `` r.packCalls.find ``, `` r.v.busy ``, `` r.end ``, `` RadioVoice.inert().busy ``, `` RadioVoice.inert ``.

Assertion spans and exact semantics:

- **680**: `` assert.equal(r.v.say("BOX BOX BOX", 3, "info", 0.2), true) ``
- **682**: `` assert.ok(call.leadS >= 0.58, `the line starts after the spotter's 0.5 s: lead ${call.leadS}`) ``
- **683**: `` assert.equal(r.v.busy(), true, "the spotter asks this before it keys up") ``
- **685**: `` assert.equal(r.v.busy(), false) ``
- **686**: `` assert.equal(RadioVoice.inert().busy(), false) ``

### an AudioContext rebuilt while a line decodes drops the line instead of scheduling it on the old clock

Case range: **689–709**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` integrity ``, `` sandbox ``, `` sb.VoicePack.create ``, `` P.load ``, `` P.speak ``, `` decodeRes ``, `` P.busy ``.

Assertion spans and exact semantics:

- **703**: `` assert.equal(P.speak("george", "car left", { channel: "spotter" }), true) ``
- **707**: `` assert.equal(played, 0, "the line was scheduled on the dead context's clock") ``
- **708**: `` assert.equal(P.busy("spotter"), false, "the channel is held for a line that will never play") ``

### spotter holds the overlap envelope and names the remaining side after three wide

Case range: **711–726**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` Spotter.occupancy ``, `` Spotter.fresh ``, `` run ``.

Assertion spans and exact semantics:

- **713**: `` assert.equal(Spotter.occupancy(me, [me, other], 1000), 0) ``
- **714**: `` assert.equal(Spotter.occupancy(me, [me, other], 1000, 1), 1) ``
- **716**: `` assert.equal(Spotter.occupancy(me, [me, other], 1000, 1), 0) ``
- **718**: `` assert.equal(Spotter.occupancy(me, [me, other], 1000), 0) ``
- **720**: `` assert.equal(Spotter.occupancy(me, [me, other], 1000), 0) ``
- **722**: `` assert.deepEqual(run(st, 3, 1), ['three wide']) ``
- **723**: `` assert.deepEqual(run(st, 1, 1), ['car left']) ``
- **724**: `` assert.deepEqual(run(st, 0, .25), [], 'clear needs sustained separation') ``
- **725**: `` assert.deepEqual(run(st, 1, .5), [], 'brief dropout does not repeat the warning') ``

### spotter never says still there while clearance is being debounced, and ignores invalid dt

Case range: **728–736**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` Spotter.fresh ``, `` run ``, `` Spotter.step ``, `` J ``.

Assertion spans and exact semantics:

- **732**: `` assert.equal(Spotter.step(st, 0, .05), '') ``
- **734**: `` assert.equal(Spotter.step(st, 1, Infinity), '') ``
- **735**: `` assert.deepEqual(J(st), before) ``

### routine speech yields to the spotter but race control and pit calls keep priority

Case range: **738–749**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` radio ``, `` r.v.say ``, `` ['info', 'coach'].includes ``, `` r.v.yieldToSpotter ``, `` r.v.busy ``, `` r.v.stop ``.

Assertion spans and exact semantics:

- **743**: `` assert.equal(r.v.say('BOX BOX BOX', 4, kind, .5), true) ``
- **745**: `` assert.equal(r.v.yieldToSpotter(), routine, kind) ``
- **746**: `` assert.equal(r.v.busy(), !routine, kind) ``

### spotter interrupts routine speech only with a ready clip, retains awareness when muted, and stops on retirement

Case range: **751–773**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` said.push ``, `` Spotter.create ``, `` s.update ``, `` valid ``, `` s.occupied ``.

Assertion spans and exact semantics:

- **761**: `` assert.equal(yielded, 0, 'a loading pack cannot cut a useful line') ``
- **763**: `` assert.deepEqual(said, ['Car left.']) ``
- **763**: `` assert.equal(yielded, 1) ``
- **764**: `` assert.equal(valid(), true) ``
- **766**: `` assert.equal(valid(), false, 'a car that left while decoding is not called') ``
- **768**: `` assert.deepEqual(said, ['Car left.'], 'discarded speech is not followed by an orphan clear call') ``
- **770**: `` assert.equal(s.occupied(), true, 'muting speech does not invite coach chatter alongside') ``
- **772**: `` assert.equal(s.occupied(), false) ``
- **772**: `` assert.ok(stopped > 0) ``

### recorded engineer and spotter packs do not depend on speechSynthesis existing

Case range: **775–788**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` calls.push ``, `` sandbox ``, `` sb.RadioVoice.create ``, `` v.setEnabled ``, `` v.say ``, `` J ``, `` v.voiceList ``, `` v.stop ``.

Assertion spans and exact semantics:

- **780**: `` assert.equal(v.pack, pack) ``
- **782**: `` assert.equal(v.say('BOX BOX BOX', 4, 'race'), true) ``
- **783**: `` assert.equal(calls.length, 1) ``
- **784**: `` assert.deepEqual(J(v.voiceList('radio')), []) ``
- **786**: `` assert.equal(v.say('KEEP INPUTS SMOOTH', 4, 'coach'), true, 'the coach has a recorded voice too') ``
- **787**: `` assert.equal(calls.length, 2) ``

### ensureStaged fetches lap-1 engineer before coach; announcer is not stage-fetched (D·DP8)

Case range: **790–848**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` integrity ``, `` order.push ``, `` pending.set ``, `` resolve ``, `` packResponse ``, `` pending.get ``, `` pending.delete ``, `` go ``, `` sandbox ``, `` sb.VoicePack.create ``, `` P.ensureStaged ``, `` drain ``, `` order.every ``, `` u.includes ``, `` resolveFetch ``, `` P.load ``, `` order.findIndex ``, `` u.endsWith ``, `` idx ``, `` P.ready ``, `` pending.keys ``, `` [...new Set(order)].sort ``.

Assertion spans and exact semantics:

- **808**: `` assert.ok(go, "unexpected resolve: " + url) ``
- **820**: `` assert.equal(order.length, 2, "tier 0 alone before engineer loads settle") ``
- **821**: `` assert.ok(order.every((u) => u.includes("george.")), "only engineer fetches started") ``
- **826**: `` assert.equal(order.length, 4, "coach tier starts; announcer stays off the wire") ``
- **828**: `` assert.ok(idx("george", "json") >= 0 && idx("george", "bin") >= 0, "engineer pack started") ``
- **830**: `` assert.ok(coachStart > idx("george", "bin"), "coach waits until engineer tier finishes") ``
- **831**: `` assert.equal(idx("fable", "bin"), -1, "fable.bin is not requested by ensureStaged") ``
- **832**: `` assert.equal(idx("fable", "json"), -1, "fable.json is not requested by ensureStaged") ``
- **833**: `` assert.equal(P.ready("george"), true, "engineer ready while coach was still fetching") ``
- **834**: `` assert.equal(P.ready("heart"), false, "coach still pending when engineer is ready") ``
- **835**: `` assert.equal(P.ready("fable"), false, "announcer never stage-fetched") ``
- **836**: `` assert.equal(pending.size, 2, "only coach fetches in flight") ``
- **839**: `` assert.equal(P.ready("heart"), true, "coach ready after tier 1 settles") ``
- **842**: `` assert.equal(pending.size, 2, "explicit load starts the announcer pair") ``
- **844**: `` assert.equal(await fableP, true, "announcer loads on explicit ensure/load after stage") ``
- **845**: `` assert.equal(P.ready("fable"), true) ``
- **846–847**: `` assert.deepEqual([...new Set(order)].sort(), ["assets/voice/fable.bin", "assets/voice/fable.json", "assets/voice/george.bin", "assets/voice/george.json", "assets/voice/heart.bin", "assets/voice/heart.json"]) ``

### race-load gate does not request fable.bin until the gate opens (D·DP8)

Case range: **850–872**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` integrity ``, `` sandbox ``, `` requested.push ``, `` sb.VoicePack.create ``, `` P.raceLoadGate ``, `` P.ensureStaged ``, `` P.ensure ``, `` P.load ``, `` requested.some ``, `` u.includes ``, `` J(P.debug().deferred).sort ``, `` J ``, `` P.debug ``, `` until ``, `` P.ready ``, `` u.endsWith ``.

Assertion spans and exact semantics:

- **864**: `` assert.equal(await P.load("fable"), false, "graceful no-voice while gated") ``
- **866**: `` assert.equal(requested.some((u) => u.includes("fable.")), false, "fable.bin not requested during race load") ``
- **867**: `` assert.ok(requested.some((u) => u.includes("george.")), "engineer still prefetches under the gate") ``
- **868**: `` assert.deepEqual(J(P.debug().deferred).sort(), ["fable"], "announcer queued for after lights-out") ``
- **870**: `` assert.ok(await until(() => P.ready("fable")), "flush after gate opens") ``
- **871**: `` assert.ok(requested.some((u) => u.endsWith("fable.bin")), "fable.bin fetched only after the gate opens") ``

### RadioVoice.prepare does not request fable.bin during race load (D·DP8)

Case range: **874–896**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` integrity ``, `` sandbox ``, `` requested.push ``, `` sb.RadioVoice.create ``, `` v.setEnabled ``, `` v.prepare ``, `` requested.some ``, `` u.includes ``, `` v.releaseRaceLoadGate ``, `` until ``, `` u.endsWith ``.

Assertion spans and exact semantics:

- **890**: `` assert.equal(requested.some((u) => u.includes("fable.")), false, "prepare must not pull fable.bin on the load path") ``
- **891**: `` assert.ok(requested.some((u) => u.includes("george.")), "prepare still warms the engineer pack") ``
- **894**: `` assert.ok(await until(() => requested.some((u) => u.endsWith("fable.bin"))), "announcer pack starts once the race-load gate opens") ``

### ensureStaged does not refetch a pack that is already ready

Case range: **912–925**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` integrity ``, `` sb.VoicePack.create ``, `` P.ensureStaged ``, `` until ``, `` P.ready ``.

Assertion spans and exact semantics:

- **920**: `` assert.ok(await until(() => P.ready("george")), "george is ready within the wall-clock bound") ``
- **921**: `` assert.equal(calls, 2) ``
- **923**: `` assert.ok(await until(() => P.ready("heart")), "heart is ready within the wall-clock bound") ``
- **924**: `` assert.equal(calls, 4, "only the not-yet-loaded pack is fetched") ``

### RadioVoice ensureVoices stages the engineer pack ahead of coach and announcer

Case range: **927–951**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` integrity ``, `` sandbox ``, `` order.push ``, `` delay(url.includes("george.") ? 40 : 5).then ``, `` delay ``, `` url.includes ``, `` sb.RadioVoice.create ``, `` v.setEnabled ``, `` v.say ``, `` Date.now ``, `` order.some ``, `` u.includes ``, `` order.findIndex ``, `` u.endsWith ``.

Assertion spans and exact semantics:

- **947**: `` assert.ok(order.some((u) => u.includes("heart.")), "coach pack fetch started") ``
- **950**: `` assert.ok(engBin >= 0 && coachJson > engBin, "first-race ensure starts engineer before coach") ``

### loading a selected pack is shared and never fetches the alternatives

Case range: **953–965**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` requested.push ``, `` integrity ``, `` sb.VoicePack.create ``, `` pack.load ``, `` requested.sort ``, `` pack.ready ``.

Assertion spans and exact semantics:

- **961**: `` assert.deepEqual(await Promise.all([pack.load("michael"), pack.load("michael")]), [true, true]) ``
- **962**: `` assert.deepEqual(requested.sort(), ["assets/voice/michael.bin", "assets/voice/michael.json"]) ``
- **963**: `` assert.equal(pack.ready("george"), false) ``
- **964**: `` assert.equal(pack.ready("bella"), false) ``

### VoicePack drops a spotter warning whose situation changed during decoding

Case range: **967–979**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` integrity ``, `` sb.VoicePack.create ``, `` pack.load ``, `` pack.speak ``, `` decode ``, `` pack.busy ``.

Assertion spans and exact semantics:

- **975**: `` assert.equal(pack.speak('george', 'car left', { channel: 'spotter', valid: () => relevant }), true) ``
- **978**: `` assert.equal(plays, 0) ``
- **978**: `` assert.equal(pack.busy(), false) ``

### the engineer TEST previews the selected recorded source; SYSTEM previews synthesis

Case range: **981–987**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` radio ``, `` rec.v.preview ``, `` rec.packCalls.some ``, `` rec.v.busy ``, `` rec.v.stop ``, `` sys.v.preview ``, `` sys.packCalls.filter ``, `` sys.v.stop ``.

Assertion spans and exact semantics:

- **982**: `` assert.equal(rec.v.preview('radio'),true) ``
- **983**: `` assert.ok(rec.packCalls.some(c=>c.id==='george')) ``
- **983**: `` assert.deepEqual(rec.spoken,[]) ``
- **984**: `` assert.equal(rec.v.busy(),true) ``
- **985**: `` assert.equal(sys.v.preview('radio'),true) ``
- **986**: `` assert.equal(sys.packCalls.filter(c=>c.id).length,0) ``
- **986**: `` assert.equal(sys.spoken.length,1) ``

### engineer waits for the full spotter clip, and behind a still-decoding one uses a bounded lead instead of being dropped

Case range: **990–1004**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` radio ``, `` long.v.say ``, `` long.packCalls.find ``, `` long.v.stop ``, `` pending.v.say ``, `` pending.packCalls.find ``, `` pending.v.stop ``.

Assertion spans and exact semantics:

- **992**: `` assert.equal(long.v.say('BOX BOX BOX', 5, 'info'), true) ``
- **993**: `` assert.ok(long.packCalls.find(c => c.id).leadS >= 1.88) ``
- **998**: `` assert.equal(pending.v.say('BOX BOX BOX', 5, 'info'), true) ``
- **1000**: `` assert.ok(call, 'the line is spoken') ``
- **1001**: `` assert.ok(call.leadS >= 0.6 && call.leadS < 1, 'behind a bounded 0.6 s lead, got ' + call.leadS) ``
- **1002**: `` assert.deepEqual(pending.spoken, []) ``

### recorded decoding consumes the card budget and pending clips have no known finish time

Case range: **1006–1025**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` plays.push ``, `` integrity ``, `` sb.VoicePack.create ``, `` pack.load ``, `` pack.speak ``, `` pack.remaining ``, `` resolve ``, `` pack.busy ``, `` pack.stop ``.

Assertion spans and exact semantics:

- **1017**: `` assert.equal(pack.speak('george','car left',{channel:'spotter',budgetS:1,onEnd(){ends++;}}),true) ``
- **1018**: `` assert.equal(pack.remaining('spotter'),Infinity,'decoding cannot promise an end time') ``
- **1020**: `` assert.equal(plays.length, delay < 1 ? 1 : 0) ``
- **1021**: `` assert.ok(Number.isFinite(pack.remaining('spotter'))) ``
- **1022**: `` assert.equal(pack.busy(),false) ``
- **1022**: `` assert.equal(ends,1) ``
- **1023**: `` assert.equal(ends,1,'completion fires once even after a late stop') ``

### the decoded clip cache is bounded by SECONDS per voice, oldest out first (perf-memory M-5)

Case range: **1027–1060**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` decoded.push ``, `` integrity ``, `` sb.VoicePack.create ``, `` P.load ``, `` P.speak ``, `` J ``, `` P.debug ``, `` run ``.

Assertion spans and exact semantics:

- **1042**: `` assert.equal(await P.load("george"), true) ``
- **1052**: `` assert.equal(phone.d.cacheS, 24) ``
- **1053**: `` assert.ok(phone.d.cache.george.secs <= 24, `phone holds ${phone.d.cache.george.secs} s`) ``
- **1054**: `` assert.equal(phone.d.cache.george.clips, 6) ``
- **1055**: `` assert.ok(phone.newestHit, "the most recent clip is still decoded") ``
- **1056**: `` assert.ok(phone.oldestRedecoded, "the oldest was evicted and decodes again from the kept .bin") ``
- **1058**: `` assert.equal(desk.d.cacheS, 90) ``
- **1059**: `` assert.equal(desk.d.cache.george.clips, 22, "desktop: the larger budget, still under the 80-clip count bound") ``

### the pit garage halts every radio channel the way the pause card does

Case range: **1067–1089**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` radio ``, `` r.v.say ``, `` r.v.busy ``, `` r.ducks.at ``, `` r.v.halt ``, `` r.packCalls.filter ``, `` RadioVoice.inert ``, `` game.slice ``, `` game.indexOf ``, `` body.indexOf ``.

Assertion spans and exact semantics:

- **1069**: `` assert.equal(r.v.say("BOX BOX BOX", 3, "info", 0.5), true) ``
- **1070**: `` assert.equal(r.v.busy(), true, "precondition: a line is on air") ``
- **1071**: `` assert.equal(r.ducks.at(-1), true, "precondition: the music is ducked under it") ``
- **1074**: `` assert.equal(r.v.busy(), false, "the line is gone") ``
- **1075**: `` assert.equal(r.ducks.at(-1), false, "the music comes back up") ``
- **1076**: `` assert.ok(r.packCalls.filter((c) => c === "stop").length >= 2, "the engineer channel and then every channel (the spotter's too) are cut") ``
- **1077**: `` assert.equal(typeof RadioVoice.inert().halt, "function", "the inert radio carries it, so the call site needs no guard") ``
- **1080**: `` assert.match(body, /paused = true;/, "precondition: found openPitWork") ``
- **1081**: `` assert.doesNotMatch(body, /setPaused\(/, "precondition: the garage pauses without the card (so the observer cannot help)") ``
- **1082–1083**: `` assert.ok(body.indexOf("radioVoice.halt();") > 0 && body.indexOf("radioVoice.halt();") < body.indexOf('openGarage("pit")'), "openPitWork halts the radio before the garage opens") ``
- **1084–1085**: `` assert.match(body, /GameAudio\.stopRain\(\)/, "openPitWork stops rain with the engine — the garage is a pause without the card") ``
- **1087–1088**: `` assert.match(close, /if \(wxArc\.viewRainfall\(\) > 0\.01\) GameAudio\.startRain\(\)/, "leaving the pit garage restarts rain the way RESUME does") ``

### the spotter's idle early-outs reset nothing: 600 steps off / in the menu / in the pits cost zero pack.stop() calls (bug-hunt 3, 2026-10-10)

Case range: **1091–1123**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` Spotter.create ``, `` sp.update ``, `` sp.occupied ``.

Assertion spans and exact semantics:

- **1104**: `` assert.equal(stops, 0, "menu: nothing to stop") ``
- **1110**: `` assert.equal(sp.occupied(), true, "race-radio still reads a car alongside with the spotter off") ``
- **1111**: `` assert.equal(stops, 0, "…and the off branch stops nothing") ``
- **1114**: `` assert.equal(stops, 0, "pits: nothing to stop") ``
- **1122**: `` assert.equal(stops, 1, "a state that was in use is reset — once") ``

### a stalled pack body times out, releases staged tiers, and respects retry delay

Case range: **1126–1149**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` timers.set ``, `` timers.delete ``, `` calls.push ``, `` integrity ``, `` url.includes ``, `` sb.VoicePack.create ``, `` P.ensureStaged ``, `` drain ``, `` [...timers.values()].find ``, `` timers.values ``, `` timeout.fn ``, `` calls.some ``, `` P.load ``, `` P.ready ``, `` late ``, `` P.ensure ``.

Assertion spans and exact semantics:

- **1139**: `` assert.equal(calls.length, 2) ``
- **1140**: `` assert.ok(timeout) ``
- **1142**: `` assert.ok(calls.some((url) => url.includes("heart")), "lower tier starts when the failed tier settles") ``
- **1144**: `` assert.equal(P.ready("heart"), true, "lower tiers proceed after fetch or body timeout") ``
- **1146**: `` assert.equal(P.ready("george"), false, "late body cannot revive a failed attempt") ``
- **1147**: `` assert.equal(calls.length, 4) ``
- **1148**: `` assert.equal(calls.length, 6) ``

### a voice picked over, or the recorded radio switched off, frees the packs no channel speaks from (#3110)

Case range: **1151–1173**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` radio ``, `` r.v.setRecordedVoice ``, `` r.kept.at ``, `` keep.includes ``, `` r.v.recordedPack ``, `` r.v.setPackOn ``, `` r.kept.at(-1).filter ``, `` sandbox ``, `` calls.push ``, `` integrity ``, `` sb.VoicePack.create ``, `` P.load ``, `` P.releaseExcept ``, `` P.ready ``, `` J ``, `` P.debug ``, `` calls.filter ``, `` u.includes ``.

Assertion spans and exact semantics:

- **1153**: `` assert.equal(r.v.setRecordedVoice("radio", "michael"), true) ``
- **1155**: `` assert.ok(keep.includes("michael") && !keep.includes("george"), "the replaced engineer pack is not kept: " + keep) ``
- **1156**: `` assert.ok(keep.includes(r.v.recordedPack("coach")), "the other channels keep theirs") ``
- **1158**: `` assert.deepEqual(r.kept.at(-1).filter((id) => id !== r.v.recordedPack("announcer")), [], "recorded radio off keeps at most the presenter's pack") ``
- **1168**: `` assert.equal(P.ready("george"), false, "the released pack is gone") ``
- **1169**: `` assert.equal(P.ready("heart"), true, "the kept pack stays") ``
- **1170**: `` assert.deepEqual(Object.keys(J(P.debug().voices)), ["heart"]) ``
- **1171**: `` assert.equal(await P.load("george"), true, "a released pack loads again on demand") ``
- **1172**: `` assert.equal(calls.filter((u) => u.includes("george")).length, 4) ``

### a voice deselected during fetch releases its pack when the load settles

Case range: **1175–1196**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` pending.push ``, `` sb.VoicePack.create ``, `` P.load ``, `` P.releaseExcept ``, `` P.debug ``, `` request.reject ``, `` request.resolve ``, `` integrity ``, `` J ``.

Assertion spans and exact semantics:

- **1183**: `` assert.equal(pending.length, 2, "one manifest and one binary request") ``
- **1185**: `` assert.equal(P.debug().voices.george, "loading", "the shared request can finish") ``
- **1192**: `` assert.equal(await loaded, false, fail ? "failed deselected pack stays unavailable" : "deselected pack is not retained ready") ``
- **1193**: `` assert.deepEqual(J(P.debug().voices), {}, "settlement releases ready and failed deselected entries") ``
- **1194**: `` assert.deepEqual(J(P.debug().cache), {}, "the removed entry owns no clip cache") ``

### keeping or requesting a pending voice again supersedes its deselection without refetching

Case range: **1198–1220**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` pending.push ``, `` sb.VoicePack.create ``, `` P.load ``, `` P.releaseExcept ``, `` P.ensure ``, `` resolve ``, `` integrity ``, `` P.ready ``, `` P.plan ``, `` J ``, `` P.debug ``.

Assertion spans and exact semantics:

- **1207**: `` assert.equal(P.ensure("george"), "loading") ``
- **1209**: `` assert.equal(pending.length, 2, "reselection reuses the in-flight manifest and binary") ``
- **1213**: `` assert.equal(await loaded, true, "the latest request keeps the settled pack") ``
- **1214**: `` assert.equal(P.ready("george"), true) ``
- **1215**: `` assert.ok(P.plan("george", "hello"), "the kept pack remains playable") ``
- **1216**: `` assert.deepEqual(J(P.debug().voices), { george: "ready" }) ``
- **1218**: `` assert.deepEqual(J(P.debug().voices), {}, "a subsequent deselection still frees it") ``

### deselected staged voices never start when the preceding pack settles

Case range: **1222–1244**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` pending.push ``, `` sb.VoicePack.create ``, `` P.ensureStaged ``, `` P.load ``, `` P.releaseExcept ``, `` request.reject ``, `` request.resolve ``, `` integrity ``, `` J ``, `` P.debug ``.

Assertion spans and exact semantics:

- **1231**: `` assert.equal(pending.length, 2, "only the first tier has fetched") ``
- **1239**: `` assert.equal(await first, false) ``
- **1241**: `` assert.equal(pending.length, 2, "stale lower tiers issue neither manifest nor binary fetches") ``
- **1242**: `` assert.deepEqual(J(P.debug().voices), {}, "no deselected tier becomes resident") ``

### a later keep, ensure, or staged request can reselect a queued voice

Case range: **1246–1280**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` sandbox ``, `` calls.push ``, `` pending.set ``, `` sb.VoicePack.create ``, `` pending.get ``, `` pending.delete ``, `` resolve ``, `` integrity ``, `` P.ensureStaged ``, `` P.load ``, `` P.releaseExcept ``, `` P.ensure ``, `` finish ``, `` calls.filter ``, `` url.includes ``, `` calls.some ``, `` J ``, `` P.debug ``.

Assertion spans and exact semantics:

- **1256**: `` assert.ok(resolve, "expected pending request: " + url) ``
- **1270**: `` assert.equal(await first, false, "the deselected predecessor still releases") ``
- **1272**: `` assert.equal(calls.filter((url) => url.includes("heart.")).length, 2, select + " reuses or starts exactly one pack load") ``
- **1273**: `` assert.equal(calls.some((url) => url.includes("fable.")), false, "the other stale queued voice stays deselected") ``
- **1276**: `` assert.equal(await selected, true) ``
- **1277**: `` assert.deepEqual(J(P.debug().voices), { heart: "ready" }, "only the selected voice remains") ``
- **1278**: `` assert.equal(calls.length, 4, "old and new queues share the reselected pack request") ``

### the Opus probe clips are real Ogg, WebM and CAF Opus files

Case range: **1310–1319**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` src.match ``, `` b64("ogg").subarray(0, 4).toString ``, `` b64("ogg").subarray ``, `` b64 ``, `` b64("ogg").includes ``, `` b64("webm").subarray ``, `` b64("webm").includes ``, `` b64("caf").subarray(0, 4).toString ``, `` b64("caf").subarray ``.

Assertion spans and exact semantics:

- **1313**: `` assert.equal(b64("ogg").subarray(0, 4).toString("latin1"), "OggS") ``
- **1314**: `` assert.ok(b64("ogg").includes(Buffer.from("OpusHead")), "an Ogg Opus stream") ``
- **1315**: `` assert.deepEqual([...b64("webm").subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], "an EBML (WebM) file") ``
- **1316**: `` assert.ok(b64("webm").includes(Buffer.from("A_OPUS")), "a WebM Opus track") ``
- **1317**: `` assert.equal(b64("caf").subarray(0, 4).toString("latin1"), "caff") ``
- **1318**: `` assert.ok(b64(k).length < 1024, `${k} probe stays tiny`) ``

### a browser that decodes Ogg Opus fetches the Opus twin and never the MP3

Case range: **1321–1330**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` opusSandbox ``, `` J ``, `` sb.VoicePack.codecs ``, `` sb.VoicePack.create ``, `` P.load ``, `` urls.map ``, `` u.split("/").pop ``, `` u.split ``, `` P.debug ``, `` J(P.plan("george", "hello")).secs.toFixed ``, `` P.plan ``.

Assertion spans and exact semantics:

- **1324**: `` assert.deepEqual(J(await sb.VoicePack.codecs()), { ogg: true, webm: true, caf: false }) ``
- **1326**: `` assert.equal(await P.load("george"), true) ``
- **1327**: `` assert.deepEqual(urls.map((u) => u.split("/").pop()), ["george.json", "george.opus.bin"]) ``
- **1328**: `` assert.deepEqual(J(P.debug().formats), { george: { fmt: "opus-ogg", bytes: 5 } }) ``
- **1329**: `` assert.equal(J(P.plan("george", "hello")).secs.toFixed(2), "0.48", "the twin's own clip table plans the line") ``

### a browser that cannot decode Opus keeps today's parallel MP3 fetch

Case range: **1332–1340**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` opusSandbox ``, `` J ``, `` sb.VoicePack.codecs ``, `` sb.VoicePack.create ``, `` P.ensure ``, `` urls.map((u) => u.split("/").pop()).sort ``, `` urls.map ``, `` u.split("/").pop ``, `` u.split ``, `` P.load ``, `` P.debug ``.

Assertion spans and exact semantics:

- **1334**: `` assert.deepEqual(J(await sb.VoicePack.codecs()), { ogg: false, webm: false, caf: false }) ``
- **1337**: `` assert.deepEqual(urls.map((u) => u.split("/").pop()).sort(), ["george.bin", "george.json"], "both requested at once, no twin") ``
- **1338**: `` assert.equal(await P.load("george"), true) ``
- **1339**: `` assert.equal(P.debug().formats.george.fmt, "mp3") ``

### an Opus twin that fails its digest or lacks one falls back to the MP3, not to silence

Case range: **1342–1352**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` "0".repeat ``, `` opusSandbox ``, `` sb.VoicePack.codecs ``, `` sb.VoicePack.create ``, `` P.load ``, `` P.debug ``, `` urls.map ``, `` u.split("/").pop ``, `` u.split ``, `` J(P.plan("george", "hello")).secs.toFixed ``, `` J ``, `` P.plan ``.

Assertion spans and exact semantics:

- **1347**: `` assert.equal(await P.load("george"), true) ``
- **1348**: `` assert.equal(P.debug().formats.george.fmt, "mp3") ``
- **1349**: `` assert.deepEqual(urls.map((u) => u.split("/").pop()), ["george.json", "george.opus.bin", "george.bin"]) ``
- **1350**: `` assert.equal(J(P.plan("george", "hello")).secs.toFixed(2), "0.50", "MP3 offsets, not the twin's") ``

### a twin naming an unknown container or a path is ignored

Case range: **1354–1364**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` integrity ``, `` opusSandbox ``, `` sb.VoicePack.codecs ``, `` sb.VoicePack.create ``, `` P.load ``, `` P.debug ``, `` urls.some ``, `` u.includes ``, `` u.endsWith ``, `` urls.join ``.

Assertion spans and exact semantics:

- **1360**: `` assert.equal(await P.load("george"), true) ``
- **1361**: `` assert.equal(P.debug().formats.george.fmt, "mp3") ``
- **1362**: `` assert.ok(!urls.some((u) => u.includes("..") || u.endsWith("opus.bin")), urls.join()) ``

## `tests/unit/vsfriend-head-200.test.mjs`

Full read: **1–63**. SHA-256: `2e9cd3cd3181766e7f823df30f1988a758b934519abdf7e68085dd1fa3d85f2f`. 2 test declarations; 9 assertion call sites inside cases.

Fixtures and cleanup: 18 CSS snapshot; 21–34 brace-counting exact selector block; 36–41 declaration reader; 43–44 compact head/title selectors. Helper assertions at 26 and 39 apply transitively to both cases.

Exercised targets: css/overlays.css compact VS FRIEND head and title declarations.

Semantics and limits: Textual declarations are pinned; CSS cascade, computed geometry, browser zoom, actual 200% clipping, font metrics and accessibility are not measured.

Shared helper assertion spans (invoked by cases):

- 26: `` assert.ok(m, `missing rule ${sel}`) ``
- 39: `` assert.ok(m, `${sel} missing ${prop}`) ``

### compact #vs-head zeros vertical padding so --tap-paint fits #dlg-vsfriend (#3306)

Case range: **46–58**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` decl ``.

Assertion spans and exact semantics:

- **47–48**: `` assert.equal(decl(HEAD, "padding-top"), "0", "compact head must beat .sheet-head padding-top (border-box + --tap-paint)") ``
- **49–50**: `` assert.equal(decl(HEAD, "padding-bottom"), "0", "compact head must beat .sheet-head padding-bottom") ``
- **51–52**: `` assert.equal(decl(HEAD, "min-height"), "var(--tap-paint)", "title band still clears absolute CLOSE") ``
- **53–54**: `` assert.equal(decl(HEAD, "height"), "var(--tap-paint)", "title band height stays locked with CLOSE") ``
- **55**: `` assert.equal(decl(HEAD, "max-height"), "var(--tap-paint)") ``
- **56**: `` assert.equal(decl(HEAD, "overflow"), "hidden") ``
- **57**: `` assert.equal(decl(HEAD, "box-sizing"), "border-box") ``

### compact #dlg-vsfriend keeps line-height 1 inside the --tap-paint band (#3306)

Case range: **60–63**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` decl ``.

Assertion spans and exact semantics:

- **61**: `` assert.equal(decl(TITLE, "line-height"), "1") ``
- **62**: `` assert.equal(decl(TITLE, "margin"), "0") ``

## `tests/unit/vstd-invariant.test.mjs`

Full read: **1–432**. SHA-256: `f60fc86a143404be9083b341b32a97e628cb5737a1dec294880a9ebd9c90c47f`. 13 test declarations; 55 assertion call sites inside cases.

Fixtures and cleanup: 46–279 ALLOWED expression/code/reason records; 291 empty SUSPECT; 293 approved union; 296 synthetic source scanner.

Exercised targets: tools/check/vstd-lint.mjs speedLiteralViolations, stripNonCode, readFiles and violationKey; production manifest-loaded speed thresholds are text scanned against justified rows.

Semantics and limits: Scanner grammar is intentionally bounded: divisions, shifts, unresolved lowercase values, single-word constants and non-bare numeric declarations may be unflagged. This does not prove physical PACE invariance by simulation. Empty SUSPECT iteration does not exercise positive defect-row validation. Exact source-line keys intentionally require re-approval after refactors.

### flags the A13 shape — a bare speed against a literal

Case range: **298–303**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` scan ``.

Assertion spans and exact semantics:

- **299–302**: `` assert.deepEqual( scan("c.otArmed = otEnabled() && gap < OT_GAP && c.speed > 15;"), ["c.speed > 15"], ) ``

### accepts the A13 fix and every other vStd()-wrapped threshold

Case range: **305–310**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` scan ``.

Assertion spans and exact semantics:

- **306**: `` assert.deepEqual(scan("c.otArmed = otEnabled() && vStd(c.speed) > OT_MIN_SPEED;"), []) ``
- **307**: `` assert.deepEqual(scan("const heating = braking && vStd(c.speed) > 12;"), []) ``
- **308**: `` assert.deepEqual(scan("const lockTaper = 1 - vStd(Math.abs(c.speed)) / STEER_SPEED_REF;"), []) ``
- **309**: `` assert.deepEqual(scan("if (vStd(Math.abs(c.speed)) > 25) foo();"), []) ``

### flags every comparison operator, in both operand orders

Case range: **312–317**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` scan ``.

Assertion spans and exact semantics:

- **313**: `` assert.deepEqual(scan("if (c.speed >= 20) f();"), ["c.speed >= 20"]) ``
- **314**: `` assert.deepEqual(scan("if (player.speed <= 4.5) f();"), ["player.speed <= 4.5"]) ``
- **315**: `` assert.deepEqual(scan("if (15 < c.speed) f();"), ["15 < c.speed"]) ``
- **316**: `` assert.deepEqual(scan("if (0 > c.speed) f();"), ["0 > c.speed"]) ``

### sees through Math.abs / a || 0 default / a wrapping paren

Case range: **319–324**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` scan ``.

Assertion spans and exact semantics:

- **320**: `` assert.deepEqual(scan("const lifted = Math.abs(c.speed) > 8;"), ["Math.abs(c.speed) > 8"]) ``
- **321**: `` assert.deepEqual(scan("if ((c.speed || 0) > 8) f();"), ["(c.speed || 0) > 8"]) ``
- **322**: `` assert.deepEqual(scan("if (Math.max(0, c.speed) > 12) f();"), ["Math.max(0, c.speed) > 12"]) ``
- **323**: `` assert.deepEqual(scan("if (ds < -0.03 &&\n c.speed >\n 15) f();"), ["c.speed > 15"]) ``

### flags a raw speed against an UPPER_SNAKE constant — the A13 shape with the number hidden behind a name

Case range: **326–336**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` scan ``.

Assertion spans and exact semantics:

- **329**: `` assert.deepEqual(scan("if (c.speed > OT_MIN_SPEED) f();"), ["c.speed > OT_MIN_SPEED"]) ``
- **330**: `` assert.deepEqual(scan("c.xArmed = !braking && c.speed > X_MIN_SPEED;"), ["c.speed > X_MIN_SPEED"]) ``
- **331**: `` assert.deepEqual(scan("if (Math.abs(c.speed) >= GRASS_V) f();"), ["Math.abs(c.speed) >= GRASS_V"]) ``
- **332**: `` assert.deepEqual(scan("if (OT_MIN_SPEED < c.speed) f();"), ["OT_MIN_SPEED < c.speed"]) ``
- **334**: `` assert.deepEqual(scan("if (vStd(c.speed) > OT_MIN_SPEED) f();"), []) ``
- **335**: `` assert.deepEqual(scan("if (vStd(c.speed) > X_MIN_SPEED) f();"), []) ``

### does not flag a division, a shift, a lowercase identifier or a single-word constant

Case range: **338–345**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` scan ``.

Assertion spans and exact semantics:

- **339**: `` assert.deepEqual(scan("if (c.speed > limit) f();"), []) ``
- **340**: `` assert.deepEqual(scan("if (c.speed > MAX) f();"), []) ``
- **341**: `` assert.deepEqual(scan("if (c.speed > OT_MIN_SPEED.value) f();"), []) ``
- **342**: `` assert.deepEqual(scan("const spN = clamp(c.speed / vTop(), 0, 1);"), []) ``
- **343**: `` assert.deepEqual(scan("const n = c.speed >> 2;"), []) ``
- **344**: `` assert.deepEqual(scan("const f = (c) => c.speed;"), []) ``

### flags a raw speed against a file-local numeric const — the A13 shape behind a lowercase name (#3009)

Case range: **347–356**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` scan ``.

Assertion spans and exact semantics:

- **349**: `` assert.deepEqual(scan("const lim = 30;\nif (c.speed > lim) f();"), ["c.speed > lim"]) ``
- **350**: `` assert.deepEqual(scan("const otMin = 15.5;\nc.otArmed = gap < 1 && c.speed >= otMin;"), ["c.speed >= otMin"]) ``
- **351**: `` assert.deepEqual(scan("const crawl = 7;\nif (Math.abs(c.speed) < crawl) f();"), ["Math.abs(c.speed) < crawl"]) ``
- **352**: `` assert.deepEqual(scan("const lim = 30;\nif (lim < c.speed) f();"), ["lim < c.speed"]) ``
- **353**: `` assert.deepEqual(scan("function g(c) {\n const v0 = 12;\n return (c.speed || 0) > v0;\n}"), ["(c.speed || 0) > v0"]) ``
- **355**: `` assert.deepEqual(scan("const lim = 30;\nif (vStd(c.speed) > lim) f();"), []) ``

### a local threshold that is not a bare numeric const stays unflagged (#3009 negatives)

Case range: **358–366**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` scan ``.

Assertion spans and exact semantics:

- **359**: `` assert.deepEqual(scan("const lim = vTop() * 0.3;\nif (c.speed > lim) f();"), []) ``
- **360**: `` assert.deepEqual(scan("let lim = 30;\nif (c.speed > lim) f();"), []) ``
- **361**: `` assert.deepEqual(scan("const lim = 30;\nfunction g(lim) { return c.speed > lim; }"), []) ``
- **362**: `` assert.deepEqual(scan("const lim = 30;\n{ const lim = vTop(); if (c.speed > lim) f(); }"), []) ``
- **363**: `` assert.deepEqual(scan("const lim = 30;\nif (c.speed > limit) f();"), []) ``
- **364**: `` assert.deepEqual(scan("const lim = 30;\nif (c.speed > lim.max) f();"), []) ``
- **365**: `` assert.deepEqual(scan("const lim = 30;\nif (c.speed > lim(c)) f();"), []) ``

### comments and strings are not code

Case range: **368–373**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` scan ``.

Assertion spans and exact semantics:

- **369**: `` assert.deepEqual(scan("// the old gate was c.speed > 15, see A13\nconst a = 1;"), []) ``
- **370**: `` assert.deepEqual(scan("/* c.speed > 15 */ const a = 1;"), []) ``
- **371**: `` assert.deepEqual(scan('Log.warn("game", "c.speed > 15");'), []) ``
- **372**: `` assert.deepEqual(scan("Log.warn(`game`, `c.speed > 15`);"), []) ``

### stripNonCode preserves every byte offset

Case range: **375–384**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` stripNonCode ``, `` out.split ``, `` src.split ``, `` l0.trimEnd ``, `` l1.replace ``, `` l2.trim ``.

Assertion spans and exact semantics:

- **378**: `` assert.equal(out.length, src.length) ``
- **379**: `` assert.equal(out.split("\n").length, src.split("\n").length) ``
- **381**: `` assert.equal(l0.trimEnd(), "const a = 1;") ``
- **382**: `` assert.equal(l1.replace(/ +/g, " "), 'const b = " ";') ``
- **383**: `` assert.equal(l2.trim(), "") ``

### js/game.js and every manifest module that reads a speed contain only APPROVED absolute speed thresholds

Case range: **387–415**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` speedLiteralViolations ``, `` readFiles ``, `` APPROVED.map ``, `` found.filter ``, `` approved.has ``, `` violationKey ``, `` unapproved.map ``, `` found.map ``, `` APPROVED.filter((a) => !seen.has(violationKey(a))).map ``, `` APPROVED.filter ``, `` seen.has ``.

Assertion spans and exact semantics:

- **392–400**: `` assert.deepEqual( unapproved.map((v) => `${v.file}:${v.line} ${v.expr}`), [], "A speed compared against a numeric literal is PACE-sensitive: the OVERALL SPEED\n" + "slider scales real m/s, so this threshold is a different fraction of the car's\n" + "envelope at every setting. Wrap it in vStd() — or, if it is genuinely absolute\n" + "(a force, a divide-by-zero floor, a sign test, the reverse crawl), add it to\n" + "ALLOWED in tests/unit/vstd-invariant.test.mjs WITH the reason.", ) ``
- **404–408**: `` assert.deepEqual( APPROVED.filter((a) => !seen.has(violationKey(a))).map((a) => `${a.file} ${a.expr}`), [], "stale entry: this site no longer exists (or its line changed). Delete the row.", ) ``
- **414**: `` assert.equal(found.length, APPROVED.length) ``

### every approved site carries a written justification

Case range: **417–422**. Fixture: the shared setup above plus inline values in this range. Calls exercised: .

Assertion spans and exact semantics:

- **419**: `` assert.ok(a.why && a.why.length > 20, `${a.file} ${a.expr}: no justification`) ``
- **420**: `` assert.ok(a.file && a.expr && a.code, `${a.file} ${a.expr}: incomplete row`) ``

### open findings are recorded, not quietly exempted

Case range: **424–432**. Fixture: the shared setup above plus inline values in this range. Calls exercised: .

Assertion spans and exact semantics:

- **428**: `` assert.match(s.why, /UNJUSTIFIED/, `${s.file} ${s.expr}: SUSPECT rows must say so`) ``
- **429**: `` assert.ok(s.note && s.note.length > 200, `${s.file} ${s.expr}: needs the measured detail`) ``
- **431**: `` assert.ok(SUSPECT.length <= 1, "a growing suspect list means the guard is being used as an allow-list") ``

## `tests/unit/wait-for.test.mjs`

Full read: **1–152**. SHA-256: `6d20d42ec105c8fc2906b46c118b8583454da6a6d9223da8895e855b60f58fb7`. 12 test declarations; 57 assertion call sites inside cases.

Fixtures and cleanup: 11 temporary directories in OS temp; 12 deterministic clock/sleep; injected load/alive/size/read/merged dependencies; CLI spawnSync and marker logs.

Exercised targets: tools/ci/wait-for.mjs parseArgs/check/waitFor/capForeground and constants; tools/lib/deploy-status.mjs stamp/readStatus/waitStatus; deploy CLI --status/--wait.

Semantics and limits: No actual merge fetch/network probe: --merged uses an injected boolean. CLI tests depend on process/PID environment and real short timeout. Temporary log directories are created without rm or after cleanup (cleanup opportunity); fake clocks cover deadlines without measuring scheduling.

### parseArgs: conditions, both flag spellings, defaults

Case range: **14–19**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` parseArgs ``.

Assertion spans and exact semantics:

- **16**: `` assert.deepEqual(a.conds, [{ kind: "load", max: 2.8 }, { kind: "file", path: "x.log" }, { kind: "pid", pid: 42 }]) ``
- **17**: `` assert.equal(a.timeoutMin, 5) ``
- **18**: `` assert.equal(parseArgs(["--pid-gone", "1"]).timeoutMin, 30) ``

### parseArgs: unknown flag, no condition, bad numbers are usage errors

Case range: **21–30**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` parseArgs ``, `` /unknown flag --nope/.test ``.

Assertion spans and exact semantics:

- **22**: `` assert.throws(() => parseArgs(["--nope"]), (e) => e instanceof UsageError && /unknown flag --nope/.test(e.message)) ``
- **23**: `` assert.throws(() => parseArgs([]), /at least one condition/) ``
- **24**: `` assert.throws(() => parseArgs(["--load-below", "abc"]), UsageError) ``
- **25**: `` assert.throws(() => parseArgs(["--pid-gone", "--timeout", "3"]), UsageError) ``
- **27**: `` assert.throws(() => parseArgs(["--pid-gone", pid]), UsageError, `invalid PID ${pid}`) ``
- **29**: `` assert.throws(() => parseArgs(["stray"]), UsageError) ``

### check: names what still blocks, ANDs conditions

Case range: **32–38**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` check ``.

Assertion spans and exact semantics:

- **35**: `` assert.equal(r.ok, false) ``
- **36**: `` assert.equal(r.pending.length, 3) ``
- **37**: `` assert.equal(check([{ kind: "load", max: 4 }], deps).ok, true) ``

### waitFor: held once the load drops; 124 on timeout with the blocker named

Case range: **40–49**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fakeClock ``, `` waitFor ``.

Assertion spans and exact semantics:

- **44**: `` assert.equal(held.code, 0) ``
- **47**: `` assert.equal(to.code, 124) ``
- **48**: `` assert.match(to.text, /pid 1 alive/) ``

### CLI: exit 2 on usage, 0 on a pid that is gone, 124 on a live pid

Case range: **51–57**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` spawnSync ``, `` String ``.

Assertion spans and exact semantics:

- **53**: `` assert.equal(spawnSync("node", [cli, "--bogus"]).status, 2) ``
- **54**: `` assert.equal(spawnSync("node", [cli, "--pid-gone", "1.5"]).status, 2) ``
- **55**: `` assert.equal(spawnSync("node", [cli, "--pid-gone", "2147483646", "--timeout", "1"]).status, 0) ``
- **56**: `` assert.equal(spawnSync("node", [cli, "--pid-gone", String(process.pid), "--timeout", "0.01", "--poll", "0.01"]).status, 124) ``

### waitFor caps polling at the deadline and Node's maximum timer delay

Case range: **59–75**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fakeClock ``, `` waitFor ``, `` c.now ``, `` sleeps.push ``, `` long.sleep ``.

Assertion spans and exact semantics:

- **64**: `` assert.equal(r.code, 124) ``
- **65**: `` assert.equal(c.now(), 600, "a 600 ms timeout must not wait for the 60 s poll") ``
- **73**: `` assert.equal(held.code, 0) ``
- **74**: `` assert.deepEqual(sleeps, [2147483647], "larger Node delays would collapse to 1 ms") ``

### readStatus: none / running / done / died map to exit codes

Case range: **77–88**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` tmp ``, `` readStatus ``, `` stamp ``.

Assertion spans and exact semantics:

- **79**: `` assert.equal(readStatus(f).code, 1) ``
- **81**: `` assert.deepEqual([readStatus(f, () => true).state, readStatus(f, () => true).code], ["running", 124]) ``
- **82**: `` assert.deepEqual([readStatus(f, () => false).state, readStatus(f, () => false).code], ["died", 1]) ``
- **84**: `` assert.deepEqual([readStatus(f, () => true).state, readStatus(f, () => true).code], ["done", 0]) ``
- **87**: `` assert.equal(readStatus(f).code, 1, "the LAST verdict wins over an earlier pass") ``

### waitStatus: returns when the run ends, 124 when it never does

Case range: **90–101**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` tmp ``, `` stamp ``, `` fakeClock ``, `` waitStatus ``.

Assertion spans and exact semantics:

- **96**: `` assert.equal(s.state, "died") ``
- **99**: `` assert.equal(to.code, 124) ``
- **100**: `` assert.match(to.text, /WAIT TIMEOUT/) ``

### deploy.mjs --status / --wait read the marker log (exit 0 / 1)

Case range: **103–112**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` tmp ``, `` stamp ``, `` spawnSync ``, `` run ``.

Assertion spans and exact semantics:

- **108**: `` assert.equal(run("--status").status, 0) ``
- **109**: `` assert.equal(run("--wait", "--timeout", "1").status, 0) ``
- **111**: `` assert.equal(run("--status").status, 1) ``

### --log-matches: holds once a log line matches; names the missing verdict; bad regex is a usage error

Case range: **114–125**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` parseArgs ``, `` check ``.

Assertion spans and exact semantics:

- **116**: `` assert.equal(a.conds[0].kind, "log") ``
- **118**: `` assert.equal(check(a.conds, deps).ok, true) ``
- **120**: `` assert.equal(miss.ok, false) ``
- **121**: `` assert.match(miss.pending[0], /x\.log has no line matching/) ``
- **122**: `` assert.equal(check(a.conds, { read: () => "" }).ok, false) ``
- **123**: `` assert.throws(() => parseArgs(["--log-matches", "x.log"]), UsageError) ``
- **124**: `` assert.throws(() => parseArgs(["--log-matches", "x.log", "("]), UsageError) ``

### capForeground: a foreground --timeout over 590 s is clamped and names run_in_background

Case range: **127–137**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` capForeground ``, `` /run_in_background/.test ``, `` /--background/.test ``, `` parseArgs ``.

Assertion spans and exact semantics:

- **128**: `` assert.equal(FOREGROUND_CAP_SEC, 590) ``
- **129**: `` assert.deepEqual(capForeground(5, false), { timeoutMin: 5, note: "" }) ``
- **131**: `` assert.equal(c.timeoutMin * 60, 590) ``
- **132**: `` assert.ok(/run_in_background/.test(c.note)) ``
- **133**: `` assert.ok(/--background/.test(c.note)) ``
- **134**: `` assert.deepEqual(capForeground(45, true), { timeoutMin: 45, note: "" }, "--background lifts the cap") ``
- **135**: `` assert.equal(parseArgs(["--pid-gone", "1", "--background"]).background, true) ``
- **136**: `` assert.equal(parseArgs(["--pid-gone", "1"]).background, false) ``

### --merged <sha>: parsed, polled no faster than 30 s, judged through the deps.merged probe (the sanctioned merge watch)

Case range: **139–152**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` parseArgs ``, `` check ``.

Assertion spans and exact semantics:

- **141**: `` assert.deepEqual(a.conds, [{ kind: "merged", sha: "0da70c389" }]) ``
- **142**: `` assert.equal(a.pollSec, 30, "a fetch per poll: never faster than 30 s") ``
- **143**: `` assert.throws(() => parseArgs(["--merged", "not-a-sha"]), UsageError) ``
- **144**: `` assert.throws(() => parseArgs(["--merged", "abc12"]), UsageError, "7-40 hex") ``
- **146**: `` assert.equal(sha, "0da70c389") ``
- **148**: `` assert.equal(r.ok, false) ``
- **149**: `` assert.equal(r.pending[0], "0da70c389 not yet on origin/claude/f1-game-project-26h3ng") ``
- **151**: `` assert.equal(check(a.conds, deps).ok, true) ``

## `tests/unit/wait-polling.test.mjs`

Full read: **1–159**. SHA-256: `c127b56c775de9cee39979addf5f938d2b20f3d3fbda9e7c0efc9f3fd9142037`. 15 test declarations; 26 assertion call sites inside cases.

Fixtures and cleanup: 35–47 and 56–100 synthetic Playwright source snippets; lintAll/count repository walks; 150–153 helper source slice/comment stripping.

Exercised targets: tools/check/wait-polling-lint.mjs lintSource/lintAll/count; tests/helpers/career-boot.js selectPartCategory lexical Parts retry guard.

Semantics and limits: Static AST/regex contract, not browser scheduling proof. Population count >20 is an anti-vacuity floor, not a ceiling. Optional row?.sites ?? [] in physics guard also passes if the target file disappears from scan. Synthetic spec path arguments are category fixtures, not evidence those files exist.

### an async predicate is flagged — Playwright treats a Promise as success (#2825)

Case range: **35–47**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintSource ``, `` sites.some ``.

Assertion spans and exact semantics:

- **42**: `` assert.ok(sites.some((s) => s.kind === "async-predicate"), src) ``
- **44–46**: `` assert.deepEqual( lintSource(`await page.waitForFunction(() => true, null, { polling: 100, timeout: 1000 });`).sites, []) ``

### no scanned file keeps an async waitForFunction predicate

Case range: **49–54**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintAll().flatMap ``, `` lintAll ``, `` (r.sites || [])     .filter ``.

Assertion spans and exact semantics:

- **53**: `` assert.deepEqual(bad, [], "async predicates never wait — make them synchronous (#2825)") ``

### a declared timeout with no polling is flagged

Case range: **56–61**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintSource ``.

Assertion spans and exact semantics:

- **59**: `` assert.equal(sites.length, 1) ``
- **60**: `` assert.equal(sites[0].kind, "missing-polling") ``

### passing polling clears it

Case range: **63–67**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintSource ``.

Assertion spans and exact semantics:

- **66**: `` assert.deepEqual(sites, []) ``

### an options-looking second argument is flagged because Playwright treats it as predicate data

Case range: **69–74**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintSource ``.

Assertion spans and exact semantics:

- **72**: `` assert.equal(sites.length, 1) ``
- **73**: `` assert.equal(sites[0].kind, "misplaced-options") ``

### a real object predicate argument is not mistaken for options

Case range: **76–80**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintSource ``.

Assertion spans and exact semantics:

- **79**: `` assert.deepEqual(sites, []) ``

### a wait with NO declared timeout is not flagged — it is honest

Case range: **82–87**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintSource ``.

Assertion spans and exact semantics:

- **86**: `` assert.deepEqual(sites, []) ``

### under tests/specs an option-less wait IS flagged (rAF-starved on a rendering page)

Case range: **89–100**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintSource ``.

Assertion spans and exact semantics:

- **93**: `` assert.equal(spec.length, 1) ``
- **94**: `` assert.equal(spec[0].kind, "no-options") ``
- **95–96**: `` assert.deepEqual(lintSource(`await page.waitForFunction(() => window.x === 1, null, { polling: 100 });`, "tests/specs/smoke.spec.js").sites, []) ``
- **97**: `` assert.deepEqual(lintSource(src, "tools/check/vstd-lint.mjs").sites, [], "outside tests/specs the option-less wait stays honest") ``
- **99**: `` assert.deepEqual(lintSource(src, "tests/specs/data-lifecycle.spec.js").sites, []) ``

### no spec under tests/specs carries an option-less waitForFunction

Case range: **102–106**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintAll().filter ``, `` lintAll ``, `` r.file.startsWith ``, `` r.sites.filter((x) => x.kind === "no-options").map ``, `` r.sites.filter ``.

Assertion spans and exact semantics:

- **105**: `` assert.deepEqual(bad, [], "add `null, { polling: 100 }` — the four foundation/time-trial sites were the proof") ``

### waitForSelector and locator.waitFor are NOT exposed to this

Case range: **108–115**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintSource ``.

Assertion spans and exact semantics:

- **114**: `` assert.deepEqual(lintSource(src).sites, []) ``

### tests/manual is exempt, and timeout-probe MUST stay exempt

Case range: **117–122**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintAll ``, `` rows.filter ``, `` r.file.startsWith ``.

Assertion spans and exact semantics:

- **121**: `` assert.deepEqual(rows.filter((r) => r.file.startsWith("tests/manual/")), []) ``

### every scanned file parses

Case range: **124–127**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintAll().filter ``, `` lintAll ``, `` bad.map ``.

Assertion spans and exact semantics:

- **126**: `` assert.deepEqual(bad.map((b) => `${b.file}: ${b.parseError}`), []) ``

### the tool finds real sites — anti-vacuity

Case range: **129–136**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` count ``.

Assertion spans and exact semantics:

- **135**: `` assert.ok(count() > 20, `expected 20+ sites (tools/ backlog), got ${count()}`) ``

### check-physics.mjs does not declare a timeout without polling

Case range: **138–144**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` lintAll().find ``, `` lintAll ``, `` r.file.replace(/\\/g, "/").endsWith ``, `` r.file.replace ``.

Assertion spans and exact semantics:

- **142–143**: `` assert.deepEqual(row?.sites ?? [], [], `check-physics.mjs still has waitForFunction timeout without polling: ${JSON.stringify(row?.sites)}`) ``

### career selectPartCategory retries the tab click on lexical Parts, not window.Parts

Case range: **146–159**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` src.slice ``, `` src.indexOf ``, `` body.replace ``.

Assertion spans and exact semantics:

- **154**: `` assert.match(code, /typeof Parts/) ``
- **155**: `` assert.doesNotMatch(code, /window\.Parts/) ``
- **156**: `` assert.match(code, /tab\.click\(\)/) ``
- **157**: `` assert.match(body, /polling:\s*100/) ``
- **158**: `` assert.match(body, /timeout:\s*BOOT_MS/) ``

## `tests/unit/wake-lock-vm.test.mjs`

Full read: **1–344**. SHA-256: `c17ac0b8abd4ca14f19f3cf963bce71cf7825cd4d2a6cc94b6a008a538ce25d9`. 11 test declarations; 18 assertion call sites inside cases.

Fixtures and cleanup: 43–75 four combinations of late/held × synchronous/asynchronous release failure; 77–113 isolated owner release-event fixture; 115–181 one shared game VM with before/after close, fresh() quits/settles/removes tracked visibility listeners/restores hidden/log, mock sentinel auto-release; waitFor assertion at 125.

Exercised targets: RaceWakeLock.create hold/drop/wanted plus js/game.js race start/end/quit/pause/resume integration and PlatformSession visibility handling through game-vm.

Semantics and limits: 11 test declarations expand to 14 registered cases (four combinations at 45). Mock logs and captured console/rejections demonstrate ordering, not real browser permission/screen power. Shared VM cleanup is deliberate. Header says 13 ported plus re-arm; current cases include newer release-failure matrix and should be counted from source.

Shared helper assertion spans (invoked by cases):

- 125: `` assert.ok(ok, `timed out waiting for ${what}; __wakeLog=${JSON.stringify(log())}`) ``

### ${late ? "late grant" : "held lock"} handles ${synchronous ? "synchronous" : "asynchronous"} release failure

Case range: **45–73**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` vm.createContext ``, `` messages.push ``, `` vm.runInContext ``, `` readFileSync ``, `` owner.hold ``, `` owner.drop ``, `` grant ``, `` owner.wanted ``.

Assertion spans and exact semantics:

- **70**: `` assert.equal(releases, 1) ``
- **71**: `` assert.equal(owner.wanted(), false) ``
- **72**: `` assert.deepEqual(messages, [late ? "late wake-lock release failed" : "wake lock was already released"]) ``

### a visible UA release with no visibilitychange re-acquires; drop and hidden do not

Case range: **77–113**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` vm.createContext ``, `` requests.push ``, `` vm.runInContext ``, `` readFileSync ``, `` absSrc ``, `` owner.hold ``, `` onRelease ``, `` owner.drop ``.

Assertion spans and exact semantics:

- **97**: `` assert.equal(requests.length, 1) ``
- **100**: `` assert.equal(requests.length, 2) ``
- **105**: `` assert.equal(requests.length, afterDrop) ``
- **112**: `` assert.equal(requests.length, whileHidden) ``

### starting a race requests the lock

Case range: **183–190**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fresh ``, `` mockWakeLock ``, `` g.apex.race ``, `` waitFor ``, `` log().includes ``, `` log ``, `` g.apex.info ``.

Assertion spans and exact semantics:

- **189**: `` assert.deepEqual(log(), ["request:screen"]) ``

### finishing the race releases it

Case range: **192–199**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fresh ``, `` mockWakeLock ``, `` race ``, `` waitFor ``, `` log().includes ``, `` log ``, `` finishRace ``, `` tick ``.

Assertion spans and exact semantics:

- **198**: `` assert.deepEqual(log(), ["request:screen", "release"]) ``

### quitting mid-race (no results screen) also releases it

Case range: **201–213**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fresh ``, `` mockWakeLock ``, `` race ``, `` waitFor ``, `` log().includes ``, `` log ``, `` doc().getElementById("pausebtn").click ``, `` doc().getElementById ``, `` doc ``, `` quit ``.

Assertion spans and exact semantics:

- **212**: `` assert.deepEqual(log(), ["request:screen", "release"]) ``

### hiding the page releases it; RESUME after the return re-acquires it

Case range: **215–235**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fresh ``, `` mockWakeLock ``, `` race ``, `` waitFor ``, `` log().includes ``, `` log ``, `` doc ``, `` visibilityChange ``, `` tick ``, `` doc().getElementById("pm-resume").onclick ``, `` doc().getElementById ``.

Assertion spans and exact semantics:

- **230**: `` assert.deepEqual(log(), ["request:screen", "release"], "still paused: the screen may sleep") ``
- **234**: `` assert.deepEqual(log(), ["request:screen", "release", "request:screen"]) ``

### pausing releases it; resuming re-acquires it

Case range: **237–248**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fresh ``, `` mockWakeLock ``, `` race ``, `` waitFor ``, `` log().includes ``, `` log ``, `` doc().getElementById("pausebtn").click ``, `` doc().getElementById ``, `` doc ``, `` doc().getElementById("pm-resume").onclick ``.

Assertion spans and exact semantics:

- **247**: `` assert.deepEqual(log(), ["request:screen", "release", "request:screen"]) ``

### a missing Wake Lock API (older iOS) degrades silently

Case range: **250–266**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fresh ``, `` win ``, `` mark ``, `` race ``, `` finishRace ``, `` tick ``, `` errorsSince ``, `` mockWakeLock ``, `` waitFor ``, `` log().includes ``, `` log ``.

Assertion spans and exact semantics:

- **260**: `` assert.deepEqual(errorsSince(m), []) ``

### a rejecting request() (permission denied) degrades silently

Case range: **268–283**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fresh ``, `` win ``, `` mark ``, `` race ``, `` waitFor ``, `` finishRace ``, `` tick ``, `` errorsSince ``.

Assertion spans and exact semantics:

- **281**: `` assert.deepEqual(errorsSince(m), []) ``
- **282**: `` assert.ok(asked >= 1, "the rejection was actually exercised: request() was called") ``

### a lock granted after the race ended is released immediately

Case range: **285–312**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fresh ``, `` win ``, `` log().push ``, `` log ``, `` resolve ``, `` listeners.release ``, `` race ``, `` waitFor ``, `` log().includes ``, `` finishRace ``, `` win().__grantWake ``.

Assertion spans and exact semantics:

- **311**: `` assert.deepEqual(log(), ["request:screen", "release"]) ``

### a late release event from an old sentinel cannot clear its replacement

Case range: **314–344**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` fresh ``, `` win ``, `` log().push ``, `` log ``, `` listeners.release ``, `` win().__wakeSentinels.push ``, `` race ``, `` waitFor ``, `` win().__wakeSentinels[0].release ``, `` visibilityChange ``, `` win().__wakeSentinels[0].fire ``, `` finishRace ``, `` log().includes ``.

Assertion spans and exact semantics:

- **343**: `` assert.deepEqual(log(), ["request:1", "release:1", "request:2", "fire:1", "release:2"]) ``

## `tests/unit/wall-clamp.test.mjs`

Full read: **1–412**. SHA-256: `1c342340e238060a2b2cd467f18cd51f680455066baa1cf39ba3c7b65c86179f`. 16 test declarations; 63 assertion call sites inside cases.

Fixtures and cleanup: 28–34 fixed dt/rearm and mirrored collideT decay; 37–44 human nose-in car; 46–90 VM loader real geometry/end-face/clamp with mocked ±5m tracks/audio/AI/debris/input/teams; 92–108 base context; 308–315 offline AI car.

Exercised targets: WallClamp.apply, ContactGeometry, WallEndFace and source-level js/game.js pooled _wallCtx integration.

Semantics and limits: Mocked track/AI/sound/haptics do not prove actual device effects or real circuit geometry. Non-player sound cooldown resides in GameAudio and is not exercised. Two side cases at 395 expand 16 declarations to 17 cases. Scrape rearm temporal checks manually mirror game collideT decay.

### WallClamp.apply is the exported surface

Case range: **110–115**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``.

Assertion spans and exact semantics:

- **112**: `` assert.equal(typeof WallClamp, "object") ``
- **113**: `` assert.equal(typeof WallClamp.apply, "function") ``
- **114**: `` assert.ok(Object.isFrozen(WallClamp), "frozen") ``

### car past wallR is pinned and wasOnWall set

Case range: **117–127**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` WallClamp.apply ``, `` baseCtx ``.

Assertion spans and exact semantics:

- **124**: `` assert.equal(c.x, 5, "clamped to wallR") ``
- **125**: `` assert.equal(c.wasOnWall, true) ``
- **126**: `` assert.ok(c.speed < 40, "AI scrub bleeds speed") ``

### human xPinned rebuilds px/pz via worldFromTrack

Case range: **129–143**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` WallClamp.apply ``, `` baseCtx ``.

Assertion spans and exact semantics:

- **137**: `` assert.equal(c.x, 5) ``
- **138**: `` assert.equal(c.vLat, 0, "slip killed against barrier") ``
- **139**: `` assert.equal(c.wasOnWall, true) ``
- **141**: `` assert.ok(Math.abs(c.px - (100 * 0.01 + 5)) < 1e-9, `px=${c.px}`) ``
- **142**: `` assert.equal(c.pz, 100) ``

### inside limits: human wallT decays, wasOnWall clears

Case range: **145–160**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` baseCtx ``, `` WallClamp.apply ``.

Assertion spans and exact semantics:

- **154**: `` assert.equal(c.wasOnWall, false) ``
- **155**: `` assert.ok(Math.abs(c.wallT - (0.2 - DT)) < 1e-9, `wallT=${c.wallT}`) ``
- **157**: `` assert.equal(c.px, 1) ``
- **158**: `` assert.equal(c.pz, 10) ``
- **159**: `` assert.equal(ctx.smp.t[2], 1) ``

### street wall FX gates on isPlayer (VS FRIEND is human, not local)

Case range: **162–203**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` vibes.push ``, `` rumbles.push ``, `` new Float64Array(100).fill ``, `` shakes.push ``, `` WallClamp.apply ``, `` baseCtx ``.

Assertion spans and exact semantics:

- **185**: `` assert.equal(friend.wasOnWall, true) ``
- **186**: `` assert.equal(shakes.length, 0, "remote friend must not shake local camera") ``
- **187**: `` assert.equal(vibes.length, 0, "remote friend must not vibrate local device") ``
- **188**: `` assert.equal(rumbles.length, 0, "remote friend must not rumble local pad") ``
- **189**: `` assert.equal(audioHits, 0, "remote friend must not play local collision SFX") ``
- **197**: `` assert.equal(local.wasOnWall, true) ``
- **198**: `` assert.ok(shakes.length >= 1, "local player street scrape shakes") ``
- **199**: `` assert.ok(vibes.length >= 1, "local player street scrape vibrates") ``
- **200**: `` assert.ok(rumbles.length >= 1, "local player street scrape rumbles") ``
- **201**: `` assert.equal(rumbles[0][2], "handles", "pad-haptics v2 channels wall rumble to handles") ``
- **202**: `` assert.ok(audioHits >= 1, "local player street scrape plays collision") ``

### permanent circuit: local player nose-in plays barrier SFX (not street-gated)

Case range: **205–212**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` noseInCar ``, `` WallClamp.apply ``, `` baseCtx ``.

Assertion spans and exact semantics:

- **210**: `` assert.equal(c.wasOnWall, true) ``
- **211**: `` assert.ok(audioHits >= 1, "street:false must still call GameAudio.collision") ``

### wall grind: throttled scrape re-arm while moving (not one per frame)

Case range: **214–231**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` baseCtx ``, `` noseInCar ``, `` WallClamp.apply ``, `` decayCollideT ``.

Assertion spans and exact semantics:

- **228**: `` assert.ok(audioHits > 1, "grind must re-arm scrape, not one-shot") ``
- **229**: `` assert.ok(audioHits <= maxCalls, `throttled: ${audioHits} calls, cap ${maxCalls}`) ``
- **230**: `` assert.ok(audioHits < frames, "must not fire every frame") ``

### wall grind: call count stable across frame rate (same wall time)

Case range: **233–254**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` baseCtx ``, `` noseInCar ``, `` WallClamp.apply ``, `` decayCollideT ``, `` grindCount ``.

Assertion spans and exact semantics:

- **250**: `` assert.ok(at60 > 1 && at30 > 1) ``
- **251**: `` assert.ok(Math.abs(at60 - at30) <= 1, `60fps=${at60} vs 30fps=${at30} should match re-arm, not dt`) ``
- **253**: `` assert.ok(at60 <= maxCalls && at30 <= maxCalls) ``

### barrier SFX: non-player and low incidence stay silent

Case range: **256–268**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` baseCtx ``, `` noseInCar ``, `` WallClamp.apply ``.

Assertion spans and exact semantics:

- **262**: `` assert.equal(audioHits, 0, "non-player") ``
- **265**: `` assert.equal(audioHits, 0, "incidence <= 0.12") ``
- **267**: `` assert.equal(audioHits, 1, "street player still one hit") ``

### stationary pinned to wall: no scrape re-arm

Case range: **270–284**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` baseCtx ``, `` noseInCar ``, `` WallClamp.apply ``, `` decayCollideT ``.

Assertion spans and exact semantics:

- **277**: `` assert.ok(afterFirst >= 1, "first pin may still scrape") ``
- **283**: `` assert.equal(audioHits, afterFirst, "stopped car must not re-arm") ``

### rival wall SFX: cars from different teams get distinct fieldContact keys (#2170)

Case range: **292–305**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` keys.push ``, `` noseInCar ``, `` mk ``, `` WallClamp.apply ``, `` baseCtx ``, `` keys.join ``.

Assertion spans and exact semantics:

- **298**: `` assert.equal(keys.length, cars.length, "every rival strike reaches fieldContact") ``
- **299**: `` assert.ok(Number.isInteger(k) && k >= 10000, `key ${k} is an integer in the wall range`) ``
- **300**: `` assert.equal(new Set(keys).size, keys.length, `distinct keys per car, got ${keys.join(",")}`) ``
- **304**: `` assert.deepEqual(keys, [10007]) ``

### offline AI wall SFX: first strike calls fieldContact with sane incidence (#2212)

Case range: **319–337**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` calls.push ``, `` offlineAiCar ``, `` WallClamp.apply ``, `` baseCtx ``.

Assertion spans and exact semantics:

- **327**: `` assert.equal(c.wasOnWall, true) ``
- **328**: `` assert.equal(c.human, false) ``
- **329**: `` assert.equal(calls.length, 1, "offline AI first strike must reach fieldContact") ``
- **331**: `` assert.ok(hit.inc > 0.12 && hit.inc <= 1, `incidence ${hit.inc} in (0.12, 1]`) ``
- **332**: `` assert.ok(hit.kind === "bump" || hit.kind === "scrape", `kind=${hit.kind}`) ``
- **333**: `` assert.ok(Number.isInteger(hit.key) && hit.key >= 10000, `key ${hit.key}`) ``
- **335**: `` assert.equal(hit.wx, 1) ``
- **336**: `` assert.equal(hit.wz, 10) ``

### offline AI wall SFX: below incidence threshold stays silent (#2212)

Case range: **339–350**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` offlineAiCar ``, `` WallClamp.apply ``, `` baseCtx ``.

Assertion spans and exact semantics:

- **345**: `` assert.equal(hits, 0, "first pin below 0.12 must not fire") ``
- **349**: `` assert.equal(hits, 0, "grind without slip or steer-in stays silent") ``

### offline AI wall SFX: grind is rate-limited — no per-frame spam without incidence (#2212)

Case range: **352–381**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` calls.push ``, `` baseCtx ``, `` offlineAiCar ``, `` WallClamp.apply ``, `` calls.every ``.

Assertion spans and exact semantics:

- **367**: `` assert.equal(calls.length, 1, `one first-strike only, got ${calls.length}`) ``
- **368**: `` assert.ok(calls[0].inc > 0.12 && calls[0].inc <= 0.55, `speed-floor incidence ${calls[0].inc}`) ``
- **378**: `` assert.ok(calls.length >= 1, "steer-into-wall grind reaches fieldContact") ``
- **379**: `` assert.ok(calls.every((h) => h.key === calls[0].key), "stable key for GameAudio cooldown") ``
- **380**: `` assert.ok(calls.every((h) => h.inc >= 0.2), "grind fxInc floored at 0.2") ``

### game.js hands WallClamp.apply a pooled ctx, not a per-call literal

Case range: **387–392**. Fixture: the shared setup above plus inline values in this range. Calls exercised: .

Assertion spans and exact semantics:

- **389**: `` assert.match(game, /WallClamp\.apply\(c, _wallCtx\);/) ``
- **390**: `` assert.doesNotMatch(game, /WallClamp\.apply\(c, \{/) ``
- **391**: `` assert.match(game, /const _wallCtx = \{[^\n]*addShake\(d\)/) ``

### driving keeps pit road/lane and exit boundaries (side ${side})

Case range: **395–411**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` load ``, `` noseInCar ``, `` WallClamp.apply ``, `` baseCtx ``.

Assertion spans and exact semantics:

- **408**: `` assert.equal(c.x, side * expected) ``

## `tests/unit/wall-end-face-vm.test.mjs`

Full read: **1–79**. SHA-256: `dd3d7826c36aceecdf3d3d61c4eb1d851f29e200ddb1358e0118339f98ac5dfc`. 2 test declarations; 9 assertion call sites inside cases.

Fixtures and cleanup: 18–20 one Monaco game VM/race before and close after; 23–37 scan real wallLimits every 0.5m on both sides for widest inward face; direct WEF fixture 68–73.

Exercised targets: ContactGeometry.wallLimits, WallEndFace.apply, real game physics through __apex jump/setInput/step/probe.

Semantics and limits: One selected widest Monaco face, not all tracks/faces or random collision scenarios. Input is cleared at 57 on normal path; no finally if a step throws. No rendered image/device physics validation.

### a player driven across a wall end face keeps x (|dx| < 1.5 m) and is scrubbed, not teleported

Case range: **39–61**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` widestFace ``, `` face.drop.toFixed ``, `` a.incident ``, `` a.jump ``, `` a.setInput ``, `` a.probe ``, `` a.step ``, `` a.clearInput ``, `` maxDx.toFixed ``, `` (face.drop - 0.5).toFixed ``, `` vMin.toFixed ``, `` vIn.toFixed ``.

Assertion spans and exact semantics:

- **42**: `` assert.ok(face.drop > 4, "anti-vacuity: Monaco has a face of " + face.drop.toFixed(1) + " m") ``
- **49**: `` assert.ok(Math.abs(Math.abs(p0.x) - Math.abs(x0)) < 0.6, "parked where asked: " + p0.x + " vs " + x0) ``
- **58**: `` assert.ok(crossed, "the car reached the face") ``
- **59**: `` assert.ok(maxDx < 1.5, "max per-step |dx| " + maxDx.toFixed(2) + " m (the old pin snapped " + (face.drop - 0.5).toFixed(1) + " m)") ``
- **60**: `` assert.ok(vMin < vIn * 0.5, "speed scrubbed at the face: " + vMin.toFixed(1) + " of " + vIn.toFixed(1)) ``

### the face scrub is per second, not per call, and marks the car on a wall (audit4 F6)

Case range: **63–79**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` widestFace ``, `` vm.runInContext ``, `` CG.wallLimits ``, `` WEF.apply ``, `` hit ``.

Assertion spans and exact semantics:

- **71**: `` assert.equal(WEF.apply(c, tr, lim, dt), true, "the face holds the car (dt " + dt + ")") ``
- **75**: `` assert.equal(a.speed, 10, "60 Hz: FACE_KEEP exactly, bit-identical to the per-tick scrub") ``
- **76**: `` assert.equal(a.wasOnWall, true, "a side wall next tick is not a second first strike") ``
- **78**: `` assert.ok(Math.abs(b.speed - 50 * 0.2 * 0.2) < 1e-9, "one 1/30 step scrubs what two 1/60 ticks do: " + b.speed) ``

## `tests/unit/watch-transport-scrub.test.mjs`

Full read: **1–196**. SHA-256: `cfd9fa5e18d50a0a095a3579f0689604128d1c4085ccbd1700a0e91b91dd44f5`. 9 test declarations; 58 assertion call sites inside cases.

Fixtures and cleanup: 9–17 minimal element tree/listener/attribute model; 19–37 replay API/state, optional queued RAF, seek/action captures, find and flush.

Exercised targets: WatchTransport.create start/stop/tick/paint; scrub coalescing/change commit, chapter/event navigation, director ownership and accessible names.

Semantics and limits: DOM and RAF are deterministic fakes without native keyboard/select behavior, layout, actual replay cost or screen-reader validation. Several final setup() instances are left active until realm collection; no external resources are opened. seekEvent lead-in is fixture logic, so tests prove UI delegation/preservation rather than production replay seekEvent implementation.

### WATCH director buttons include their visible labels in their accessible names across ownership changes

Case range: **39–68**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` setup ``, `` t.find ``, `` button.getAttribute("aria-label").toLowerCase().includes ``, `` button.getAttribute("aria-label").toLowerCase ``, `` button.getAttribute ``, `` button.textContent.toLowerCase ``, `` auto.getAttribute ``, `` lock.getAttribute ``, `` labels ``, `` lock.dispatch ``, `` auto.dispatch ``, `` t.ui.stop ``.

Assertion spans and exact semantics:

- **44–45**: `` assert.ok(button.getAttribute("aria-label").toLowerCase().includes(button.textContent.toLowerCase()), `${button.textContent} must remain usable by its visible name`) ``
- **46**: `` assert.equal(button.type, "button", "native button activation remains available") ``
- **48**: `` assert.match(auto.getAttribute("aria-label"), /TV director choose the driver and camera/) ``
- **49**: `` assert.match(lock.getAttribute("aria-label"), /keep following the selected driver and camera/) ``
- **52**: `` assert.equal(auto.getAttribute("aria-pressed"), "true") ``
- **53**: `` assert.equal(lock.getAttribute("aria-pressed"), "false") ``
- **55**: `` assert.deepEqual(t.actions, [["lock", true]], "FOLLOW LOCK still delegates its existing action") ``
- **56**: `` assert.equal(auto.getAttribute("aria-pressed"), "false") ``
- **57**: `` assert.equal(lock.getAttribute("aria-pressed"), "true") ``
- **60**: `` assert.deepEqual(t.actions, [["lock", true], ["auto", true]], "AUTO still delegates its existing action") ``
- **61**: `` assert.equal(auto.getAttribute("aria-pressed"), "true") ``
- **62**: `` assert.equal(lock.getAttribute("aria-pressed"), "false") ``
- **64**: `` assert.equal(t.state.paused, true) ``
- **65**: `` assert.equal(t.state.follow, "AAA") ``
- **66**: `` assert.deepEqual(t.seeks, [], "naming and ownership actions do not seek the replay") ``

### WATCH event availability writes only on change and updates at both seek boundaries

Case range: **70–101**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` setup ``, `` t.find ``, `` writes.push ``, `` t.ui.tick ``, `` t.ui.paint ``, `` writes.at ``, `` t.ui.stop ``.

Assertion spans and exact semantics:

- **82**: `` assert.equal(prev.disabled, true) ``
- **82**: `` assert.equal(next.disabled, false) ``
- **84**: `` assert.deepEqual(writes, [], "a paused replay must not mutate unchanged disabled attributes") ``
- **86**: `` assert.deepEqual(writes, [], "the previous event is unavailable at the exact one-second margin") ``
- **88**: `` assert.deepEqual(writes, [["prev", false]], "crossing the previous-event boundary enables it immediately") ``
- **90**: `` assert.deepEqual(writes, [["prev", false], ["next", true]], "the final event disables NEXT at the exact margin") ``
- **92**: `` assert.deepEqual(writes.at(-1), ["next", false], "a rewind re-enables NEXT immediately") ``
- **94**: `` assert.deepEqual(writes.at(-1), ["prev", true], "a rewind before the first event disables PREVIOUS") ``
- **99**: `` assert.deepEqual(writes, [], "follow, reel, director and play-state changes preserve unchanged availability") ``

### 50 scrub input events cost at most one seek (one paint) before the next frame

Case range: **103–117**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` setup ``, `` t.find ``, `` String ``, `` seek.dispatch ``, `` t.flush ``, `` t.seeks.at ``, `` t.ui.stop ``.

Assertion spans and exact semantics:

- **105**: `` assert.equal(t.find("event").textContent, "RACE IN PROGRESS", "a replay without highlight events has not finished") ``
- **108**: `` assert.ok(t.seeks.length <= 1, `seeks before the frame: ${t.seeks.length}`) ``
- **109**: `` assert.equal(t.find("time").textContent, "0:50", "the clock text still follows every event") ``
- **111**: `` assert.deepEqual(t.seeks, [50], "one seek with the latest value") ``
- **113**: `` assert.equal(t.seeks.at(-1), 61, "`change` seeks at once") ``
- **115**: `` assert.equal(t.seeks.at(-1), 61, "a stale pending value never overwrites the committed seek") ``

### a frame that fires after stop() seeks nothing

Case range: **119–126**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` setup ``, `` t.find ``, `` seek.dispatch ``, `` t.ui.stop ``, `` t.flush ``.

Assertion spans and exact semantics:

- **125**: `` assert.deepEqual(t.seeks, []) ``

### without requestAnimationFrame the scrub still seeks (no lost input)

Case range: **128–134**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` setup ``, `` t.find ``, `` seek.dispatch ``, `` t.ui.stop ``.

Assertion spans and exact semantics:

- **132**: `` assert.deepEqual(t.seeks, [12]) ``

### WATCH chapters name each lap, clock and event, seek with lead-in and preserve ownership

Case range: **137–170**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` setup ``, `` t.find ``, `` pick.getAttribute ``, `` pick.children.slice(1).map ``, `` pick.children.slice ``, `` seek.dispatch ``, `` String ``, `` pick.dispatch ``, `` t.seeks.at ``, `` jump.dispatch ``, `` t.flush ``, `` t.ui.stop ``, `` t.ui.start ``.

Assertion spans and exact semantics:

- **140**: `` assert.equal(t.find("chapters").hidden, false) ``
- **141**: `` assert.equal(t.find("chapter-jump").disabled, true, "blank choice cannot jump") ``
- **143**: `` assert.equal(pick.getAttribute("aria-label"), "RACE EVENT") ``
- **144**: `` assert.deepEqual(pick.children.slice(1).map(o => o.textContent), ["L1 · 0:03 · Start", "L2 · 1:30 · Safety car", "L3 · 1:39 · Pit stop"]) ``
- **150**: `` assert.equal(t.seeks.at(-1), target) ``
- **151**: `` assert.equal(pick.value, String(i), "native select retains the chapter for the next ArrowDown") ``
- **153**: `` assert.equal(jump.disabled, false) ``
- **156**: `` assert.equal(t.seeks.length, count + 1, "repeat action seeks once without changing selection") ``
- **157**: `` assert.equal(t.seeks.at(-1), target) ``
- **158**: `` assert.equal(pick.value, String(i)) ``
- **159**: `` assert.equal(t.state.paused, paused) ``
- **159**: `` assert.equal(t.state.follow, "AAA") ``
- **160**: `` assert.equal(t.state.broadcast.locked, true) ``
- **162**: `` assert.equal(t.seeks.at(-1), 91, "pending scrub cannot overwrite chapter") ``
- **165**: `` assert.equal(t.seeks.length, count, "blank choice does not seek") ``
- **166**: `` assert.equal(t.find("chapter-jump").disabled, true) ``
- **168**: `` assert.equal(t.find("chapter-jump").disabled, true, "re-entry starts with no selected chapter") ``
- **169**: `` assert.equal(t.find("chapter").children.length, 4, "re-entry rebuilds exactly one event choice set") ``

### empty or invalid WATCH events hide chapters

Case range: **172–177**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` setup ``, `` empty.find ``.

Assertion spans and exact semantics:

- **174**: `` assert.equal(empty.find("chapters").hidden, true) ``
- **175**: `` assert.equal(empty.find("chapter-jump").disabled, true) ``
- **176**: `` assert.equal(setup({ raf: false, events: [{ t: NaN, lap: 1, text: "Unknown" }] }).find("chapters").hidden, true) ``

### the timeline reaches footage before lights-out (#2202)

Case range: **179–188**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` setup ``, `` t.find ``, `` seek.dispatch ``, `` t.ui.stop ``, `` setup({ raf: false }).find ``.

Assertion spans and exact semantics:

- **182**: `` assert.equal(seek.min, "-10") ``
- **184**: `` assert.deepEqual(t.seeks, [-10]) ``
- **185**: `` assert.equal(seek.value, "-10", "the slider is not clamped at 0") ``
- **187**: `` assert.equal(setup({ raf: false }).find("seek").min, "0", "no pre-start footage: the timeline starts at 0") ``

### WATCH chapter lead-in includes available footage before lights-out

Case range: **191–196**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` setup ``, `` t.find ``, `` chapter.dispatch ``, `` t.ui.stop ``.

Assertion spans and exact semantics:

- **194**: `` assert.deepEqual(t.seeks, [-5]) ``

## `tests/unit/water-local-level.test.mjs`

Full read: **1–60**. SHA-256: `dc297f705b6b045eff97daee473985b2f24c550d2a8353d34eb22ab4726b4105`. 2 test declarations; 5 assertion call sites inside cases.

Fixtures and cleanup: 12–36 waterYRange builds real track geometry with keepGeometry, scans water vertices/lap minimum and samples terrain every 72 floats; shared helper assertions at 14 and 18.

Exercised targets: verify-track buildContext, Tracks.build/terrainY and scenery water geometry for Spa/Singapore.

Semantics and limits: Sparse corner sampling and broad bands do not validate all polygons, water normals, rendering or every circuit. keepGeometry is local to fresh contexts; no teardown or external resource ownership.

Shared helper assertion spans (invoked by cases):

- 14: `` assert.ok(def, id) ``
- 18: `` assert.ok(pos && pos.length >= 12, `${id} must emit water verts`) ``

### Spa Eau Rouge brook sits near local terrain, not the lap's pyMin floor

Case range: **38–51**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` buildContext ``, `` waterYRange ``, `` yMin.toFixed ``, `` pyMin.toFixed ``, `` (yMax - yMin).toFixed ``, `` maxAbsGap.toFixed ``.

Assertion spans and exact semantics:

- **44–45**: `` assert.ok(yMin > pyMin + 15, `spa water yMin ${yMin.toFixed(2)} still near pyMin ${pyMin.toFixed(2)}`) ``
- **46–47**: `` assert.ok(yMax - yMin < 8, `spa brook sheets should share a valley band, got span ${(yMax - yMin).toFixed(2)} m`) ``
- **48**: `` assert.ok(samples >= 1, "terrain under at least one water sample") ``
- **49–50**: `` assert.ok(maxAbsGap < 1.5, `spa water should track terrainY - 0.8 (max gap ${maxAbsGap.toFixed(2)} m)`) ``

### Singapore marina water stays within a few metres of pyMin (coastal)

Case range: **53–60**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` buildContext ``, `` waterYRange ``, `` yMin.toFixed ``, `` yMax.toFixed ``, `` pyMin.toFixed ``.

Assertion spans and exact semantics:

- **58–59**: `` assert.ok(yMin > pyMin - 4 && yMax < pyMin + 4, `singapore water [${yMin.toFixed(2)}, ${yMax.toFixed(2)}] vs pyMin ${pyMin.toFixed(2)}`) ``

## `tests/unit/weather-arc-plan.test.mjs`

Full read: **1–146**. SHA-256: `c23e24129d05a28699cd135ac4b55b5697230d3812c721ef3003a3fc17852d87`. 7 test declarations; 23 assertion call sites inside cases.

Fixtures and cleanup: 30 VM source rewrite; 33–37 deterministic stand-in hash; 39–59 boot with Career/SeasonCal/G/Particles stubs and changeable=true; 61–62 cross-realm plan serialization.

Exercised targets: WeatherArc.create planFor/previewPlan/startChangeable/startArc/tick/restoreBase, seed and distance selection.

Semantics and limits: Hash and seed services are stubs: verifies weather module precedence, not real Career/SeasonCal hashing. Finite seed/lap examples test memo/copies and clock restart behavior; no actual multiplayer transport, race/UI or rainfall renderer.

### the plan the lobby ships is the plan the green light uses, whatever lapsTarget was left at

Case range: **64–73**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` wa.planFor ``, `` wa.startChangeable ``.

Assertion spans and exact semantics:

- **70**: `` assert.equal(a.dur, shipped.dur, `seed ${seed}: arc ${a.dur}s vs shipped ${shipped.dur}s`) ``
- **71**: `` assert.equal(a.to, shipped.to) ``

### outside a live race the cap follows the sheet's raceLaps, not a stale lapsTarget

Case range: **75–83**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` plan ``, `` short.wa.planFor ``, `` live.wa.planFor ``.

Assertion spans and exact semantics:

- **78**: `` assert.deepEqual(plan(stale), plan(fresh), "a left-over lapsTarget of 1 must not shorten the plan") ``
- **80**: `` assert.ok(short.wa.planFor().dur <= 3 * (5800 / 48) * 0.72, "a 3-lap sheet still caps the plan") ``
- **82**: `` assert.ok(live.wa.planFor().dur <= 3 * (5800 / 48) * 0.72, "inside the race, the session's own distance caps it") ``

### planFor is remembered until an input changes

Case range: **85–98**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` wa.planFor ``, `` plain ``.

Assertion spans and exact semantics:

- **88**: `` assert.notEqual(first, wa.planFor(), "callers get their own copy") ``
- **89**: `` assert.deepEqual(plain(wa.planFor()), plain(first)) ``
- **91**: `` assert.notDeepEqual(plain(wa.planFor()), plain(first), "a new seed is a new plan") ``
- **93**: `` assert.notDeepEqual(plain(wa.planFor()), plain(first), "and so is a new round") ``
- **95**: `` assert.deepEqual(plain(wa.planFor()), plain(first), "back to the first inputs, back to the first plan") ``
- **97**: `` assert.notEqual(wa.planFor().to, "wet", "the target is never the weather we start on") ``

### a standalone Season replays its plan across reloads: the seed is the season's stamped luck seed

Case range: **100–108**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` plan ``, `` boot ``, `` seasonPlan ``, `` gp ``.

Assertion spans and exact semantics:

- **103**: `` assert.deepEqual(seasonPlan(7), seasonPlan(123456), "two page loads (two simSeeds) draw the same weather") ``
- **104**: `` assert.notDeepEqual(seasonPlan(7, 4243), seasonPlan(7), "a different season seed is a different plan") ``
- **107**: `` assert.notDeepEqual(gp(7), gp(123456)) ``

### a career draws from its season seed, ahead of the session's

Case range: **110–119**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` plan ``, `` careerPlan ``.

Assertion spans and exact semantics:

- **117**: `` assert.deepEqual(careerPlan(1, 99), careerPlan(2, 99)) ``
- **118**: `` assert.notDeepEqual(careerPlan(1, 99), careerPlan(1, 100)) ``

### previewPlan is the plan planFor would draw, for any staged laps, and caches nothing

Case range: **121–133**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` plain ``, `` b.wa.planFor ``, `` b.wa.previewPlan ``, `` staged.wa.planFor ``.

Assertion spans and exact semantics:

- **127**: `` assert.deepEqual(plain(b.wa.previewPlan({ laps })), plain(staged.wa.planFor()), `seed ${seed}, ${laps} laps`) ``
- **129**: `` assert.equal(b.wa.plan, null, "previewing never freezes a plan on the arc") ``
- **130**: `` assert.deepEqual(plain(b.wa.previewPlan()), live, "no override = the live plan") ``
- **131**: `` assert.deepEqual(plain(b.wa.planFor()), live, "and planFor's own memo is untouched by the previews") ``

### fresh-race arming from a live restart uses zero, while live retargets keep their clock

Case range: **136–146**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` wa.startChangeable ``, `` wa.restoreBase ``, `` wa.tick ``, `` wa.startArc ``.

Assertion spans and exact semantics:

- **140**: `` assert.equal(restarted.t0, 0) ``
- **143**: `` assert.equal(restarted.t, 90, "old race time never freezes the new weather") ``
- **145**: `` assert.equal(retarget.t0, 90, "ordinary live retargets retain the current clock") ``

## `tests/unit/weather-arc-rain.test.mjs`

Full read: **1–311**. SHA-256: `9e63e5a3ca52d12c5ceafd88f342745929f34d6454823dc02e9a8b5cfc2ebcc6`. 14 test declarations; 58 assertion call sites inside cases.

Fixtures and cleanup: 18–55 seeded RNG VM loads real mat4/physics/tyres/particles/rain-cells/weather; stub audio/G and captured particle draw counts; 61–77 100s transition walk at 0.1s sampled fractions through 400s; 214–219 shared race-clock boot.

Exercised targets: WeatherArc rain/wetness/viewRainfall/viewWetness/wetnessAt plans/sessions/retarget/tick; TyreModel treadFor/wetness; Particles seed/update/draw; source guards on game wetness and render wiring.

Semantics and limits: Six named transition variants at 80 expand 14 declarations to 19 cases. Particle float counts/audio booleans do not prove visual/audio quality. Two-peer test shares only a stub clock, not network synchronization. Local shower search asserts some plan produces a cell; no comprehensive seed/track rain-cell coverage.

### ${from} → ${to}: falling rain and audio follow the atmosphere independently of surface water

Case range: **80–89**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` walk ``, `` rows.map ``.

Assertion spans and exact semantics:

- **83**: `` assert.equal(r.saw, r.want, `f=${r.f} (${r.weather}, wetness ${r.w}): rain ${r.rain}\n${JSON.stringify(rows, null, 1)}`) ``
- **84**: `` assert.equal(r.audio, r.want, `f=${r.f} rain ${r.rain}: the rain loop is ${r.audio ? "on" : "off"}`) ``
- **86**: `` assert.equal(rows[rows.length - 1].weather, to, "the arc lands on its target") ``
- **87**: `` assert.equal(wa.arc, null, "and ends once the road has settled") ``
- **88**: `` assert.ok(new Set(rows.map((r) => r.want)).size >= 2, "the walk crosses at least one line") ``

### a field nobody updates is not drawn: the frozen box a drying race left behind

Case range: **92–104**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` P.init ``, `` P.rainSeed ``, `` P.rainShow ``, `` P.rainUpdate ``, `` P.draw ``.

Assertion spans and exact semantics:

- **100**: `` assert.ok(drawn > 200, `an updated storm draws (${drawn})`) ``
- **103**: `` assert.equal(drawn, 0, "no rainUpdate this frame → no streaks at a stale eye") ``

### source guard: grip predicates stay surface-based while render reads rainfall

Case range: **106–113**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` game.includes ``.

Assertion spans and exact semantics:

- **108**: `` assert.match(game, /function isWetRoad\(\) \{ return trackWetness\(\) >= 0\.25; \}/) ``
- **109**: `` assert.match(game, /function isRaining\(\) \{ return trackWetness\(\) >= 0\.72; \}/) ``
- **110**: `` assert.match(game, /function trackWetness\(\) \{ return wxArc \? wxArc\.wetness\(\) : TyreModel\.wetness\(raceWeather, null\); \}/) ``
- **111**: `` assert.ok(game.includes("Particles.rainSeed(!(wxArc && wxArc.arc) && isWetRoad() && !isRaining());")) ``
- **112**: `` assert.ok(game.includes("Particles.rainUpdate(dt, camEye, wxArc.viewRainfall())")) ``

### rain arrives before the road saturates, then stops while water remains

Case range: **115–128**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` raced ``, `` wa.startArc ``, `` frame ``, `` wetness ``.

Assertion spans and exact semantics:

- **119**: `` assert.ok(frame(0.1) > 0, "drops appear on the initially dry road") ``
- **120**: `` assert.ok(wetness() < 0.25) ``
- **122**: `` assert.ok(wetness() > 0.9) ``
- **125**: `` assert.equal(frame(0.1), 0, "no falling rain when the cloud clears") ``
- **126**: `` assert.equal(audio.on, false) ``
- **127**: `` assert.ok(wetness() > 0.72, "standing water persists for grip and spray") ``

### drizzle to heavier rain changes particle density continuously across 0.72

Case range: **130–139**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` raced ``, `` wa.startArc ``, `` frame ``.

Assertion spans and exact semantics:

- **137**: `` assert.ok(drizzle > 0 && heavier > drizzle) ``
- **138**: `` assert.ok(heavier / drizzle < 1.08, `no pool-size jump: ${drizzle} → ${heavier}`) ``

### cancelling an arriving cloud clears its early rain audio and particles

Case range: **141–150**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` raced ``, `` wa.startArc ``, `` frame ``.

Assertion spans and exact semantics:

- **145**: `` assert.ok(frame(0.1) > 0) ``
- **146**: `` assert.equal(audio.on, true) ``
- **148**: `` assert.equal(audio.on, false) ``
- **149**: `` assert.equal(frame(0.1), 0) ``

### MIXED plan duration finishes inside a short race; a host plan is not recapped

Case range: **152–164**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` wa.planFor ``, `` wa.startChangeable ``.

Assertion spans and exact semantics:

- **157**: `` assert.ok(p.dur < 417, "3-lap MIXED must not keep a ~7 min walk, got " + p.dur) ``
- **158–159**: `` assert.ok(p.dur >= 90 && p.dur <= Math.floor(3 * (3300 / 48) * 0.72), "cap is 72 % of estimated race time, got " + p.dur) ``
- **163**: `` assert.equal(armed.dur, 400, "lobby/host seconds stay as agreed") ``

### endSession(true) restores the chip's weather but keeps the plan; endSession() drops it

Case range: **170–184**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` wa.startChangeable ``, `` wa.endSession ``.

Assertion spans and exact semantics:

- **175**: `` assert.equal(wa.startChangeable().to, "fog") ``
- **178**: `` assert.equal(G.raceWeather, "dry", "the chip's pick is back") ``
- **179**: `` assert.equal(wa.arc, null, "the half-walked arc is dropped") ``
- **180**: `` assert.deepEqual({ ...wa.plan }, { to: "fog", dur: 200 }, "the plan for the next start survives") ``
- **181**: `` assert.equal(wa.startChangeable().to, "fog", "and the next start arms it") ``
- **183**: `` assert.equal(wa.plan, null, "the flag / a quit to the menu still forgets a solo plan") ``

### wetnessAt(s): a local shower wets the road unevenly, and the view reads the player's own spot

Case range: **186–206**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` wa.wetnessAt ``, `` wa.wetness ``, `` wa.endSession ``, `` wa.startChangeable ``, `` wa.tick ``, `` samples.push ``, `` samples.every ``, `` wa.viewWetness ``.

Assertion spans and exact semantics:

- **189**: `` assert.equal(wa.wetnessAt(1000), wa.wetness(), "no arc: every position reads the one scalar") ``
- **197**: `` assert.ok(wa.arc && wa.arc.cell, "a MIXED rain arc on a known circuit carries a rain cell for some plan") ``
- **201**: `` assert.ok(samples.every((w) => w >= 0 && w <= 1), "wetness stays in [0,1]") ``
- **202**: `` assert.ok(Math.max(...samples) - Math.min(...samples) > 0.02, "a shower is local: the road is not uniformly wet, spread " + (Math.max(...samples) - Math.min(...samples))) ``
- **204**: `` assert.equal(wa.viewWetness(), wa.wetnessAt(2500), "the view stands on the followed car's segment") ``
- **205**: `` assert.equal(wa.wetnessAt(NaN), wa.wetness(), "a non-finite position falls back to the scalar") ``

### fix 1 — two peers on one shared clock see the same wetness and stage, however many sim steps each ran

Case range: **221–237**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` raced ``, `` host.wa.startArc ``, `` guest.wa.startArc ``, `` host.wa.tick ``, `` guest.wa.tick ``, `` rows.push ``, `` host.wetness ``, `` guest.wetness ``.

Assertion spans and exact semantics:

- **234**: `` assert.ok(Math.abs(r.host - r.guest) < 1e-9, `t=${r.t}: host wetness ${r.host} vs guest ${r.guest}`) ``
- **235**: `` assert.equal(r.gw, r.hw, `t=${r.t}: stage`) ``

### fix 2 — the sky never reads dry over an inter-wet road (stage = TyreModel.treadFor of wetness)

Case range: **239–251**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` raced ``, `` wa.startArc ``, `` wa.tick ``, `` wetness ``, `` TM.treadFor ``, `` (i / 60).toFixed ``, `` w.toFixed ``.

Assertion spans and exact semantics:

- **247**: `` assert.equal(G.raceWeather, stageOf[tread], `${from}→${to} t=${(i / 60).toFixed(2)}: wetness ${w.toFixed(3)} (tread ${tread}) under a "${G.raceWeather}" sky`) ``
- **249**: `` assert.equal(G.raceWeather, to) ``

### fix 2 — the engineer's wetIn is the second the sky turns wet

Case range: **253–262**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` raced ``, `` wa.startArc ``, `` wa.tick ``.

Assertion spans and exact semantics:

- **256**: `` assert.ok(arc.wetIn > 0 && arc.wetIn < 120, "wetIn " + arc.wetIn) ``
- **259**: `` assert.equal(G.raceWeather, "dry", "just before wetIn") ``
- **261**: `` assert.equal(G.raceWeather, "wet", "just after wetIn") ``

### fix 3 — a dry→rain arc sent back to dry while the sky still reads dry re-targets without a grip jump

Case range: **264–279**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` raced ``, `` wa.startArc ``, `` wa.tick ``, `` wetness ``.

Assertion spans and exact semantics:

- **268**: `` assert.equal(G.raceWeather, "dry", "fixture: 20 s in, the sky still reads dry") ``
- **270**: `` assert.ok(before > 0.05, "fixture: the road has started to wet (" + before + ")") ``
- **272**: `` assert.ok(wa.arc && wa.arc.to === "dry", "the live arc now heads for dry, not the storm") ``
- **273**: `` assert.ok(Math.abs(wetness() - before) < 1e-9, `no jump: ${before} → ${wetness()}`) ``
- **276**: `` assert.ok(peak < 0.25, "the road never reached inter-wet (peak " + peak + ")") ``
- **277**: `` assert.equal(G.raceWeather, "dry") ``
- **278**: `` assert.equal(wa.arc, null) ``

### fix 4 — the road dries slower than it wets, frame-rate independent, and resets

Case range: **281–311**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` raced ``, `` wa.startArc ``, `` wa.tick ``, `` cross ``, `` wetness ``, `` timeTo ``, `` [1 / 240, 1 / 60, 0.25, 5, 150].map ``, `` ws.join ``, `` wa.endSession ``.

Assertion spans and exact semantics:

- **290**: `` assert.ok(dryIn > 90 + 5, `a storm must not be dry when a 90 s arc ends (dry in ${dryIn} s)`) ``
- **291**: `` assert.ok(dryIn > wetIn * 1.3, `drying (${dryIn} s) is slower than wetting (${wetIn} s)`) ``
- **301**: `` assert.ok(Math.abs(w - ws[0]) < 1e-9, `step-size independent: ${ws.join(", ")}`) ``
- **306**: `` assert.ok(wetness() > 0.25) ``
- **310**: `` assert.equal(wetness(), 0, "endSession: no wet road leaks into the next race") ``

## `tests/unit/weather-blend.test.mjs`

Full read: **1–608**. SHA-256: `e60f2ac044e77df59163ab665cfe78cbc2e1dfbc703f7a1f945a0249675652aa`. 25 test declarations; 120 assertion call sites inside cases.

Fixtures and cleanup: 29–81 real log/mat4/knobs/presets/atmosphere/profiles VM, real LightStore, fake Assets/LampBake/storage/G and optional real rain producer; host/sum 82–83; night palette boot 196–202; HELD/ARCS 301–302; walk 305–315 4/60fps snapshots.

Exercised targets: Atmosphere.create applyRaceSettings/tick/wxBlend/floodEmit, LightStore set/apply/reset and shipped lighting presets; real Particles drizzle regression; source guards weather-arc/game fade wiring.

Semantics and limits: Real numeric lighting state and presets, no GPU shader output or appearance sign-off. Broad sweep checks all shipped track keys × four TODs × eight arcs, ≥52 tracks and >10000 moved knobs; 60fps 10% keyMul bound only on steepest discovered pair plus two regressions. HELD rebuild/lamp/tail-light knobs deliberately stay put; lamp baking itself is mocked. Fog exp² opacity is computed numerically rather than rendered.

Shared helper assertion spans (invoked by cases):

- 74: `` assert.ok(rain, "boot with particles enabled to inspect the rain producer") ``

### shipped dawn wet produces drizzle, while explicit player zero still suppresses it

Case range: **85–103**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` b.atmo.applyRaceSettings ``, `` b.drawRain ``, `` b.ltStore.set ``, `` b.ltStore.reset ``.

Assertion spans and exact semantics:

- **90**: `` assert.ok(b.drawRain() > 0, `${track}: shipped dawn wet must contain falling drizzle`) ``
- **94**: `` assert.equal(b.LT.drizzleCount, 0, `${track}: player zero survives profile resolution`) ``
- **95**: `` assert.equal(b.drawRain(), 0, `${track}: the player's explicit suppression reaches the rain producer`) ``
- **98**: `` assert.ok(b.drawRain() > 0, `${track}: resetting player edits restores shipped drizzle`) ``
- **100**: `` assert.equal(b.LT.particleMul, 0) ``
- **101**: `` assert.ok(b.drawRain() > 0, `${track}: the separate smoke/spray control does not suppress falling rain`) ``

### dawn wet does not impose a crushing grade relative to rain, and reapplying does not compound it

Case range: **105–121**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` b.atmo.applyRaceSettings ``, `` host ``, `` snapshot ``.

Assertion spans and exact semantics:

- **111**: `` assert.ok(Math.abs(b.LT.contrast - rain.contrast) <= 0.2, `${track}: drizzle must not introduce a separate high-contrast grade`) ``
- **112**: `` assert.ok(b.LT.blacks >= rain.blacks - 0.1, `${track}: drizzle must not crush substantially more blacks than rain`) ``
- **113**: `` assert.ok(b.LT.midtones >= rain.midtones - 0.1, `${track}: drizzle must not suppress substantially more midtones than rain`) ``
- **119**: `` assert.deepEqual(snapshot(), first, `${track}: repeated weather/tuner applies reconstruct the same look`) ``

### the arc's step starts on the old look, walks the sun, cloud, ambient and fog, and lands on the new one

Case range: **123–150**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` host ``, `` twin.atmo.applyRaceSettings ``, `` sum ``, `` atmo.wxBlend ``, `` atmo.tick ``.

Assertion spans and exact semantics:

- **130**: `` assert.ok(sum(rain.sun) < sum(dry.sun) * 0.9 && rain.cloud > dry.cloud + 0.2, "rain must actually mute the sun and thicken the cloud, or the fade has nothing to show") ``
- **134**: `` assert.deepEqual(host(G.frame.sunColor), dry.sun, "the fade starts on the dry sun, not the rain one") ``
- **135**: `` assert.equal(G.frameSky.cloud, dry.cloud) ``
- **136**: `` assert.deepEqual(host(atmo.wxBlend()), { t: 0, dur: atmo.WX_BLEND_S }) ``
- **139**: `` assert.ok(mid < sum(dry.sun) - 1e-6 && mid > sum(rain.sun) + 1e-6, `half-way the sun is between dry and rain, got ${mid}`) ``
- **140**: `` assert.ok(G.frameSky.cloud > dry.cloud && G.frameSky.cloud < rain.cloud, "cloud cover walks too") ``
- **141**: `` assert.ok(sum(G.frame.ambientSky) !== sum(dry.amb), "ambient walks") ``
- **142**: `` assert.ok(G.frame.fogDensity > dry.fog && G.frame.fogDensity < rain.fog, "fog density walks") ``
- **143**: `` assert.ok(G.frame.groundMist !== twin.G.frame.groundMist, "ground mist walks too (it snapped until 2026-10-04)") ``
- **145**: `` assert.deepEqual(host(G.frame.sunColor), rain.sun, "the fade lands exactly on the rain look") ``
- **146**: `` assert.equal(G.frameSky.cloud, rain.cloud) ``
- **147**: `` assert.equal(G.frame.fogDensity, rain.fog) ``
- **148**: `` assert.equal(atmo.wxBlend(), null, "the fade is over") ``
- **149**: `` assert.equal(G.frame.skyHorizon, G.frameSky.horizon, "the frame's sky aliases stay bound to frameSky") ``

### a chip, a slider or __apex.weather() cuts; a cut during a fade ends the fade

Case range: **152–167**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` host ``, `` atmo.wxBlend ``, `` atmo.tick ``.

Assertion spans and exact semantics:

- **157**: `` assert.notDeepEqual(host(G.frame.sunColor), dry, "no blend argument → the rain look at once") ``
- **158**: `` assert.equal(atmo.wxBlend(), null) ``
- **161**: `` assert.deepEqual(host(G.frame.sunColor), rain, "a fade back starts on the rain look") ``
- **163**: `` assert.deepEqual(host(G.frame.sunColor), dry, "the cut snaps to the target") ``
- **164**: `` assert.equal(atmo.wxBlend(), null, "and ends the fade") ``
- **166**: `` assert.deepEqual(host(G.frame.sunColor), dry) ``

### the lightning's saved base follows the fade, so a strike restores to the look in flight

Case range: **169–176**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` atmo.tick ``, `` host ``.

Assertion spans and exact semantics:

- **174**: `` assert.deepEqual(host(G._ltBase.ambientSky), host(G.frame.ambientSky), "_ltBase.ambientSky is the blended value") ``
- **175**: `` assert.equal(G._ltBase.exposure, G.frame.exposure != null ? G.frame.exposure : 1.0) ``

### the weather arc asks for the fade and game.js ticks it

Case range: **178–187**. Fixture: the shared setup above plus inline values in this range. Calls exercised: .

Assertion spans and exact semantics:

- **180**: `` assert.match(arc, /if \(G\.track\) G\.applyRaceSettings\(blend\);/, "setWeatherLive forwards its blend flag") ``
- **181**: `` assert.match(arc, /setWeatherLive\(want, true\)/, "the arc's progression blends") ``
- **182**: `` assert.match(arc, /setWeatherLive\(arc\.to, true\)/, "the arc's landing blends") ``
- **183**: `` assert.doesNotMatch(arc, /return setWeatherLive\(w, true\)/, "__apex.weather() must still cut") ``
- **185**: `` assert.match(game, /applyRaceSettings: \(blendS\) => applyRaceSettings\(blendS\)/, "the façade forwards the blend") ``
- **186**: `` assert.match(game, /wxArc\.tick\(dt\);[^\n]*\n\s*_atmo\.tick\(dt\);/, "the fade ticks right after the arc") ``

### a night-default circuit keeps a night horizon in every weather

Case range: **204–214**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` bootNight ``, `` atmo.applyRaceSettings ``, `` lum ``, `` lum(G.frameSky.horizon).toFixed ``, `` lum(G.frame.fogColor).toFixed ``, `` boot ``, `` day.atmo.applyRaceSettings ``, `` host ``.

Assertion spans and exact semantics:

- **209**: `` assert.ok(lum(G.frameSky.horizon) <= 0.11, `${wx}: night horizon luminance ${lum(G.frameSky.horizon).toFixed(3)} > 0.11`) ``
- **210**: `` assert.ok(lum(G.frame.fogColor) <= 0.15, `${wx}: night fog luminance ${lum(G.frame.fogColor).toFixed(3)}`) ``
- **213**: `` assert.deepEqual(host(day.G.frameSky.horizon), [0.74, 0.73, 0.74], "a day overcast still flattens to the grey deck") ``

### dusk and dawn fog take the horizon's hue, not the midday grey

Case range: **216–231**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` host ``, `` sat ``, `` lum ``, `` day.atmo.applyRaceSettings ``.

Assertion spans and exact semantics:

- **223**: `` assert.notDeepEqual(fc, [0.74, 0.76, 0.78], `${tod}: still the midday grey`) ``
- **224**: `` assert.ok(fc[0] > fc[2], `${tod}: fog ${fc} is not warm like its horizon ${hz}`) ``
- **225**: `` assert.ok(sat(fc) < sat(hz), `${tod}: fog must be a desaturated horizon`) ``
- **226**: `` assert.ok(Math.abs(lum(fc) - lum(hz)) < 0.08, `${tod}: fog luminance ${lum(fc)} strays from the horizon's ${lum(hz)}`) ``
- **227**: `` assert.ok(G.frame.exposure <= Math.max(clearExp, 1.03) + 1e-9, `${tod}: fog lifted exposure to ${G.frame.exposure}`) ``
- **230**: `` assert.deepEqual(host(day.G.frame.fogColor), [0.74, 0.76, 0.78], "day fog keeps its grey") ``

### daytime rain and storm stay overcast daylight; night storm stays as dark as before

Case range: **233–262**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` dry.atmo.applyRaceSettings ``, `` lum ``, `` atmo.applyRaceSettings ``, `` z.toFixed ``, `` dryZ.toFixed ``, `` sum ``, `` night.atmo.applyRaceSettings ``.

Assertion spans and exact semantics:

- **247**: `` assert.ok(z >= 0.45, `${track} day ${wx}: zenith luminance ${z.toFixed(3)} reads like night`) ``
- **248**: `` assert.ok(G.frame.exposure >= 1.0, `${track} day ${wx}: exposure ${G.frame.exposure}`) ``
- **249**: `` assert.ok(z >= dryZ * 0.85, `${track} day ${wx}: zenith must not plunge below dry (${z.toFixed(3)} vs ${dryZ.toFixed(3)})`) ``
- **251–252**: `` assert.ok(sum(G.frame.sunColor) < sum(dry.G.frame.sunColor) * 0.55, `${track} day storm sun must be much softer than dry`) ``
- **260**: `` assert.ok(lum(night.G.frameSky.zenith) < 0.03, "night storm zenith stays near-black") ``
- **261**: `` assert.ok(night.G.frame.exposure < 0.85, "night storm exposure stays suppressed") ``

### daytime overcast and fog grey the zenith, not just the horizon (survey: blue sky under overcast)

Case range: **264–281**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` dry.atmo.applyRaceSettings ``, `` atmo.applyRaceSettings ``, `` blue.toFixed ``, `` blueDry.toFixed ``, `` lum ``.

Assertion spans and exact semantics:

- **277**: `` assert.ok(blue < blueDry * 0.5, `${track} day ${wx}: zenith blue excess ${blue.toFixed(3)} vs dry ${blueDry.toFixed(3)}`) ``
- **278**: `` assert.ok(lum(G.frameSky.zenith) >= 0.45, `${track} day ${wx}: zenith too dark`) ``

### wet and rain fog follow the sky's overcast grey, so terrain meets the skyline

Case range: **283–296**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` host ``, `` a.map ``, `` dist ``.

Assertion spans and exact semantics:

- **293**: `` assert.ok(d < last - 1e-6, `${wx}: fog ${host(G.frame.fogColor)} did not move toward the grey horizon (${d} vs ${last})`) ``

### a weather-arc flip walks every knob monotonically across the 25 s window, and no 60 fps frame moves keyMul > 10 %

Case range: **317–357**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` k.split ``, `` b.DEFS.map ``, `` walk ``, `` cut.atmo.applyRaceSettings ``, `` HELD ``, `` frames.every ``.

Assertion spans and exact semantics:

- **320**: `` assert.ok(tracks.length >= 52, `only ${tracks.length} preset tracks — the scan broke`) ``
- **330**: `` assert.ok(lightsKept, `${tag}: the flip nulled track._lights (a lamp rebuild + re-bake mid-race)`) ``
- **335**: `` assert.fail(`${tag}: held knob ${id} moved ${a} -> ${z}`) ``
- **336**: `` assert.fail(`${tag}: ${id} landed on ${z}, not the ${to} preset's ${cut.LT[id]}`) ``
- **337**: `` assert.fail(`${tag}: ${id} wandered`) ``
- **341**: `` assert.fail(`${tag}: ${id} not monotonic at frame ${i}: ${frames[i - 1][j]} -> ${frames[i][j]}`) ``
- **343**: `` assert.fail(`${tag}: keyMul snapped on the flip frame`) ``
- **346**: `` assert.fail(`${tag}: the weather moved the sun (${id})`) ``
- **348**: `` assert.ok(moved > 10000, `only ${moved} knob fades exercised — the presets did not load`) ``
- **354**: `` assert.fail(`${track}|${tod} ${from}->${to}: frame ${i} keyMul ${p} -> ${q} (> 10 %)`) ``

### a knob written mid-fade (a tuner drag) leaves the fade instead of being dragged back

Case range: **359–367**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` b.atmo.applyRaceSettings ``, `` b.atmo.tick ``.

Assertion spans and exact semantics:

- **366**: `` assert.equal(b.LT.bloomMul, 0.77, "the fade overwrote a knob the player just set") ``

### the sun is keyed by track x time of day: a weather never moves it, and the tuner writes it there

Case range: **369–383**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` b.atmo.applyRaceSettings ``, `` b.ltStore.set ``, `` b.ltStore.apply ``.

Assertion spans and exact semantics:

- **375**: `` assert.deepEqual([b.LT.sunElev, b.LT.sunAzim], dry, `${wx} moved the dawn sun`) ``
- **379**: `` assert.equal(b.ltStore.profiles["paul_ricard|dawn|dry"].sunElev, 7.5, "a sun edit in the rain lands on the track|tod (dry) profile") ``
- **380**: `` assert.ok(!b.ltStore.profiles["paul_ricard|dawn|rain"] || !("sunElev" in b.ltStore.profiles["paul_ricard|dawn|rain"])) ``
- **382**: `` assert.equal(b.LT.sunElev, 7.5, "and every weather at that time of day reads it") ``

### silverstone night dry→wet blends city skyglow, moon and the stamped knobs

Case range: **389–443**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` b.atmo.applyRaceSettings ``, `` cut.atmo.applyRaceSettings ``, `` stamp ``, `` glowLum ``, `` b.atmo.tick ``, `` host ``, `` at ``, `` between ``.

Assertion spans and exact semantics:

- **407–408**: `` assert.ok(Math.abs(stampDry.cityGlowMul - 2.35) < 1e-6 && Math.abs(stampWet.cityGlowMul - 0.88) < 1e-6, "endpoints use silverstone|night|dry cityGlow + *|night|wet stamps") ``
- **425**: `` assert.deepEqual(p0.horizon, [0.04, 0.03, 0.06], "night horizon stays on the dry palette at blend start") ``
- **426**: `` assert.equal(p0.cityGlowMul, stampDry.cityGlowMul, "cityGlowMul at 0%") ``
- **427**: `` assert.equal(p0.keyMul, stampDry.keyMul) ``
- **428**: `` assert.equal(p0.bloomMul, stampDry.bloomMul) ``
- **429**: `` assert.ok(Math.abs(p0.glow - dryGlow) < 1e-6, "city skyglow starts on the dry look") ``
- **431**: `` assert.ok(between(p1.cityGlowMul, stampDry.cityGlowMul, stampWet.cityGlowMul), "cityGlowMul mid-fade") ``
- **432**: `` assert.ok(between(p1.keyMul, stampDry.keyMul, stampWet.keyMul), "keyMul mid-fade") ``
- **433**: `` assert.ok(between(p1.bloomMul, stampDry.bloomMul, stampWet.bloomMul), "bloomMul mid-fade") ``
- **434**: `` assert.ok(between(p1.glow, dryGlow, wetGlow), "city skyglow mid-fade") ``
- **436**: `` assert.ok(between(p1.moonBright, stampDry.moonBright, stampWet.moonBright), "moonBright mid-fade") ``
- **438**: `` assert.equal(p2.cityGlowMul, stampWet.cityGlowMul) ``
- **439**: `` assert.equal(p2.keyMul, stampWet.keyMul) ``
- **440**: `` assert.equal(p2.bloomMul, stampWet.bloomMul) ``
- **441**: `` assert.ok(Math.abs(p2.glow - wetGlow) < 1e-6, "city skyglow lands on wet") ``
- **442**: `` assert.deepEqual(p2.horizon, p0.horizon, "night horizon unchanged across the fade") ``

### applyRaceSettings resolves floodEmit with the session, not on the next frame

Case range: **445–463**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` atmo.floodEmit ``.

Assertion spans and exact semantics:

- **450**: `` assert.equal(G.frameSky.stars, 1) ``
- **451**: `` assert.ok(night > 0, `night floodEmit ${night} must be lit`) ``
- **452**: `` assert.equal(night, atmo.floodEmit(G.frame.sunDir[1]), "the resolve and the frame share one formula") ``
- **453**: `` assert.equal(night, Math.min(1, LT.floodEmitMul * 0.78)) ``
- **457**: `` assert.equal(G.frameSky.stars, 0) ``
- **458**: `` assert.equal(G._lastFloodEmit, 0, "day must not inherit the night's prop emissive") ``
- **462**: `` assert.ok(G._lastFloodEmit > 0) ``

### a blended night→day/dusk/dawn clears city skyglow instead of leaking it

Case range: **469–495**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` glowLum ``, `` atmo.tick ``, `` atmo.wxBlend ``, `` cut.atmo.applyRaceSettings ``.

Assertion spans and exact semantics:

- **477**: `` assert.ok(nightGlow > 0.01, `${to}: night must author a cityGlow dome`) ``
- **481**: `` assert.ok(Math.abs(glowLum(G.frameSky.cityGlow) - nightGlow) < 1e-6, `${to}: fade starts on the night dome`) ``
- **484**: `` assert.ok(mid > 0 && mid < nightGlow - 1e-6, `${to}: mid-fade skyglow ${mid} did not ease toward clear`) ``
- **486**: `` assert.equal(G.frameSky.cityGlow, null, `${to}: blended land must clear cityGlow like a cut`) ``
- **487**: `` assert.equal(atmo.wxBlend(), null) ``
- **493**: `` assert.equal(cut.G.frameSky.cityGlow, null, `${to}: cut path still clears`) ``

### a blended day→night fades city skyglow in from clear

Case range: **497–519**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` night.atmo.applyRaceSettings ``, `` atmo.tick ``.

Assertion spans and exact semantics:

- **502**: `` assert.equal(G.frameSky.cityGlow, null) ``
- **511**: `` assert.equal(G.frameSky.cityGlow, null, "fade starts clear (no snap-on dome)") ``
- **514**: `` assert.ok(mid && mid[0] + mid[1] + mid[2] > 0, "mid-fade has a partial dome") ``
- **515**: `` assert.ok(mid[0] + mid[1] + mid[2] < nightGlow - 1e-6, "mid-fade is below the night end") ``
- **517–518**: `` assert.ok(Math.abs((G.frameSky.cityGlow[0] + G.frameSky.cityGlow[1] + G.frameSky.cityGlow[2]) - nightGlow) < 1e-6, "lands on the night dome") ``

### day FOG weather is opaque by ~500 m and its horizon IS the fog colour (survey: 'fog hazes ground only')

Case range: **521–528**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` host ``.

Assertion spans and exact semantics:

- **526**: `` assert.ok(1 - Math.exp(-fd * fd) > 0.97, `exp² haze at 500 m must be >97 %, density ${d}`) ``
- **527**: `` assert.deepEqual(host(G.frameSky.horizon), host(G.frame.fogColor), "sky horizon meets the fog colour seamlessly") ``

### FOG weather effective density stays in the readable band on shipped presets (#2256)

Case range: **534–552**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` seen.push ``, `` eff.toFixed ``, `` at ``.

Assertion spans and exact semantics:

- **545**: `` assert.ok(at(500) > 0.97, `${id}|${tod}|fog not opaque by 500 m (eff ${eff})`) ``
- **546**: `` assert.ok(at(150) < 0.65, `${id}|${tod}|fog is a white wall by 150 m (eff ${eff})`) ``
- **548**: `` assert.ok(at(150) > 0.5, `${id}|${tod}|fog does not read as fog by 150 m (eff ${eff})`) ``
- **551**: `` assert.equal(seen.length, 16) ``

### FOG BOOST still scales fog: the band follows the knob, so pea-soup stays reachable

Case range: **554–562**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` ltStore.set ``, `` atmo.applyRaceSettings ``, `` eff ``.

Assertion spans and exact semantics:

- **561**: `` assert.ok(eff(2.75) > eff(1.5) * 1.6, `FOG BOOST max must thicken well past the default (${eff(2.75)} vs ${eff(1.5)})`) ``

### dawn/dusk FOG: horizon IS the fog colour and the zenith is pulled to it (#2257)

Case range: **564–574**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` host ``.

Assertion spans and exact semantics:

- **570**: `` assert.deepEqual(host(G.frameSky.horizon), host(fc), `${tod}: horizon must meet the fog colour`) ``
- **572**: `` assert.ok(dist < 0.12, `${tod}: zenith ${JSON.stringify(host(z))} stays a clear-sky colour over fog ${JSON.stringify(host(fc))}`) ``

### NIGHT fog keeps its dark sky (the twilight fog deck must not reach it)

Case range: **576–582**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` host ``.

Assertion spans and exact semantics:

- **581**: `` assert.ok(Math.max(...z) < 0.2, `night fog zenith lifted to ${JSON.stringify(host(z))}`) ``

### day OVERCAST fog colour follows the grey deck, not the clear-sky blue

Case range: **584–590**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` host ``.

Assertion spans and exact semantics:

- **589**: `` assert.ok(f[2] - f[0] < 0.12, `overcast fog must be near-neutral grey, got ${JSON.stringify(host(f))}`) ``

### FOG ground mist out-thickens every other weather and clears the shaders' fill gate

Case range: **592–608**. Fixture: the shared setup above plus inline values in this range. Calls exercised: `` boot ``, `` atmo.applyRaceSettings ``, `` mist ``.

Assertion spans and exact semantics:

- **600**: `` assert.ok(m <= 0.7, `${id} day ${wx}: ground mist ${m} above the non-fog cap`) ``
- **601**: `` assert.ok(fog > m, `${id} day fog mist ${fog} must exceed ${wx} ${m}`) ``
- **603**: `` assert.ok(fog >= 0.6, `${id} day fog mist ${fog} too thin for the fill gate`) ``
- **606**: `` assert.ok(G.frame.groundMist <= 0.7, `${id} night fog mist ${G.frame.groundMist} must stay under the non-fog cap`) ``

## Cleanup findings and coverage boundaries

No production cleanup edits were made. Follow-up candidates supported by this read: remove temporary waiter log directories; make the physics polling guard fail if its scan row is absent; make the spotter GAP_S case require at least two calls; update wake-lock header counts to reflect current registered cases; use finally for the wall-end-face scripted input cleanup. These are opportunities, not runtime failures established by execution.

The VM helpers, mocked globals and source-pattern guards are intentionally different kinds of evidence: mock call order/numeric output and exact source shape do not establish browser rendering, device audio/haptics, networking or actual platform wake-lock behavior. Cross-realm serialization removes VM prototype differences only. Repository/corpus scans and preset/pack budgets pin current assets and can change when those assets change.
