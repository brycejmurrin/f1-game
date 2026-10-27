# Unit group 57 — complete source map

Read-only inventory of all 18 assigned files and 4,529 lines. No tests, browser, runtime modifications, commits or mutation runs were performed. Case spans and assertion spans below are one-based inclusive AST source locations; loop assertions represent every iteration in the stated fixture, not additional registered cases. Assertion expressions list the checked operands; diagnostic messages are omitted. Shared-helper assertions are listed separately and are inherited by their callers. All supporting paths are plain code references.

LSP evidence: attached references resolved TyreModel at `js/physics/tyre-model.js:29` (98 references / 15 files: pit-lane, wheel-state, player-forces, game, forecast, real-race, weather-arc, car-draw, engineer, lobby-settings, grip-steer, tyre-model, race-control, race-settings, apex). TyreModel.create resolves at :723 (export :1069). UiExperience at `js/ui/experience.js:2` has 18 references in game/select-screen/race-settings/experience; create resolves :155 (export :599). Shell LSP definition for GameAudio.setSkid resolves engine :2303 and stub noop :13, explicitly warns of reinjected-global ambiguity: engine :2317 separates raw axes from scalar, scalar :2323 has dry 0.16 / wet 0.10 gain, :2330 caches glide values and :2333 schedules pitch. This confirms seams and consumers, not execution.

## tests/unit/trail-brake-turnin.test.mjs

Source SHA256: `0ef873a6b4ac3721af473dc445a9cea6d47c67473c7a5965b63ff7ec14fcd45b`. Fully read lines 1–109; 6 registered case declarations. Read chunks: 1–100, 101–109.

Fixture: before/after at 32–43 boots two Monza game VMs (pin and shipped, normal difficulty, auto throttle off), measures both through `tools/check/player-dyn.mjs` measure at fraction 0, closes both. Targets `js/physics/player-forces.js` capacity-scaled longBudget/yawBrakeCap and real player dynamics. Helper assertions 60–74 require positive coast, brake yaw ≥60%, front fraction (0.3,0.9), ≤15% midcorner rise and optional ≤8° rear. Pin explicitly uses a weaker <2.6 rear-slip ratio and <25% yaw rise; source and step/skidpad anchors are separate checks. Limit: deterministic bench at one circuit/fraction, no road-feel/browser claim.

Shared/module assertion spans: 62–62 assert.ok; 63–63 assert.ok; 64–65 assert.ok; 71–71 assert.ok; 73–73 assert.ok.

- **source: pedal and yaw damp key off brakeScale / yawBrakeCap, not bare BRAKE** — case 46–58.
  - 48–48: `assert.ok(/brakeScale\s*=\s*Math\.max\(\s*1\s*,/.test(forces))`.
  - 49–49: `assert.ok(/longBudget\s*\*\s*brakeScale/.test(forces))`.
  - 50–51: `assert.ok(/yawBrakeCap\s*=\s*BRAKE\s*\*\s*\(1\s*\+\s*\(brakeScale\s*-\s*1\)\s*\*\s*brakeMix\)/.test(forces))`.
  - 52–52: `assert.ok(/clamp\(\s*decel\s*\/\s*yawBrakeCap/.test(forces))`.
  - 53–54: `assert.ok(!/clamp\(\s*-\(c\.axEstSm\s*\?\?\s*0\)\s*\/\s*BRAKE/.test(forces))`.
  - 56–56: `assert.ok(/LOW_YAW_V\s*=\s*8/.test(forces))`.
  - 57–57: `assert.ok(/LOW_YAW_SUBS\s*=\s*4/.test(forces))`.
- **pin seat: braked turn-in ≥ 0.6× coast; still rotates more than coasting** — case 77–81.
  - 79–80: `assert.ok(mPin.turnIn_brake.yaw > mPin.turnIn_coast.yaw * 1.02)`.
- **shipped seat: braked turn-in ≥ 0.6× coast (was −0.224 vs 1.037)** — case 83–86.
  - 85–85: `assert.ok(mShip.turnIn_brake.yaw > 0.5)`.
- **shipped mid-corner brake stamp: rear ≤ 8°, yaw rise ≤ 15%** — case 88–90.
  - Delegates assertions to the shared helper described above.
- **pin mid-corner: yaw rise ≤ 25% relative pin (#1266 aRmax stays ~14.6° when mods.braking ≤ 1)** — case 92–99.
  - 97–97: `assert.ok(br.aRmax < co.aRmax * 2.6)`.
  - 98–98: `assert.ok(br.yawMean < co.yawMean * 1.25)`.
- **step-steer and skidpad magnitudes barely move on either seat** — case 101–109.
  - 103–103: `assert.ok(Math.abs(mPin.stepSteer.final - 0.435) < 0.02)`.
  - 104–104: `assert.ok(Math.abs(mShip.stepSteer.final - 0.447) < 0.02)`.
  - 107–107: `assert.ok(Math.abs(skPin.ay_g - 3.46) < 0.08)`.
  - 108–108: `assert.ok(Math.abs(skShip.ay_g - 5.35) < 0.08)`.

## tests/unit/transcripts-cli.test.mjs

Source SHA256: `44dd164ed6aa3aa12926746487a1c18f085bc80756f53941ca6314dbd482ab2c`. Fully read lines 1–170; 7 registered case declarations. Read chunks: 1–100, 101–170.

Fixture: capture Writable 27–39, synchronous CLI wrapper 41–46 (15 s, 2 MiB), sample and malformed Grok JSONL files 24–25. Targets `tools/transcripts/cli.mjs` parseArgs/run/matchRecord/createDigest/digestRecord/formatDigest/streamPaths. Pins 12 sample lines, five malformed-fixture lines with one bad JSON record, role/type/tool filtering, case insensitive query, NDJSON export and caller-error status. No network or real transcript corpus. No persistent writes; missing-path case is intentionally absent.

- **parseArgs: help, search requires --query, rejects unknown flags** — case 48–56.
  - 49–49: `assert.equal(parseArgs([]).help, true)`.
  - 50–50: `assert.equal(parseArgs(["--help"]).help, true)`.
  - 51–51: `assert.equal(parseArgs(["search", FIXTURE]).error.includes("query"), true)`.
  - 52–52: `assert.equal(parseArgs(["search", "--query", "x", FIXTURE]).cmd, "search")`.
  - 53–53: `assert.equal(parseArgs(["search", "--query", "x", FIXTURE]).query, "x")`.
  - 54–54: `assert.equal((parseArgs(["nope"]).error || "").includes("unknown command"), true)`.
  - 55–55: `assert.equal((parseArgs(["search", "--nope", FIXTURE, "--query", "a"]).error || "").includes("unknown flag"), true)`.
- **matchRecord: role / type / tool / query (case-insensitive)** — case 58–74.
  - 68–68: `assert.equal(matchRecord(rec, { role: "user" }).ok, false)`.
  - 69–69: `assert.equal(matchRecord(rec, { query: "mom" }).ok, true)`.
  - 70–70: `assert.equal(matchRecord(rec, { query: "mom" }).blocks[0].type, "text")`.
  - 71–71: `assert.equal(matchRecord(rec, { type: "tool_use", tool: "sendtouser" }).ok, true)`.
  - 72–72: `assert.equal(matchRecord(rec, { type: "thinking" }).ok, false)`.
  - 73–73: `assert.equal(matchRecord(rec, { query: "sendtouser" }).ok, true)`.
- **digest counts roles/types/tools on sample fixture via stream** — case 76–93.
  - 82–82: `assert.equal(state.files, 1)`.
  - 83–83: `assert.equal(state.lines, 12)`.
  - 84–84: `assert.equal(state.bad, 0)`.
  - 85–85: `assert.ok(state.roles.assistant >= 1)`.
  - 86–86: `assert.ok(state.roles.tool >= 1)`.
  - 87–87: `assert.ok(state.types.tool_use >= 1)`.
  - 88–88: `assert.ok(state.types.tool_result >= 1)`.
  - 89–89: `assert.ok(state.tools.SendToUser >= 1)`.
  - 91–91: `assert.equal(text.includes("files=1"), true)`.
  - 92–92: `assert.equal(text.includes("SendToUser="), true)`.
- **run digest / search / export against fixture** — case 95–126.
  - 99–99: `assert.equal(dCode, 0)`.
  - 100–100: `assert.equal(dOut.text().includes("files=1"), true)`.
  - 101–101: `assert.equal(dOut.text().includes("lines=12"), true)`.
  - 109–109: `assert.equal(sCode, 0)`.
  - 110–110: `assert.equal(sOut.text().includes("Mom"), true)`.
  - 111–111: `assert.equal(sOut.text().includes(":1\t"), true)`.
  - 119–119: `assert.equal(eCode, 0)`.
  - 121–121: `assert.ok(rows.length >= 1)`.
  - 124–124: `assert.ok(types.includes("tool_use"))`.
- **bad JSON lines skipped with stderr count; unreadable path exits 1** — case 128–145.
  - 132–132: `assert.equal(code, 0)`.
  - 133–133: `assert.equal(err.text().includes("bad_json_lines=1"), true)`.
  - 134–134: `assert.equal(out.text().includes("lines=5"), true)`.
  - 135–135: `assert.equal(out.text().includes("bad_json_lines=1"), true)`.
  - 143–143: `assert.equal(code2, 1)`.
  - 144–144: `assert.equal(err2.text().includes("unreadable path"), true)`.
- **spawn: help exit 0; search --json emits NDJSON** — case 147–164.
  - 149–149: `assert.equal(help.status, 0)`.
  - 150–150: `assert.equal(help.stdout.includes("Usage:"), true)`.
  - 153–153: `assert.equal(bare.status, 0)`.
  - 154–154: `assert.equal(bare.stdout.includes("Usage:"), true)`.
  - 157–157: `assert.equal(search.status, 0)`.
  - 159–159: `assert.ok(lines.length >= 1)`.
  - 161–161: `assert.ok(row.file)`.
  - 162–162: `assert.ok(Number.isInteger(row.line))`.
  - 163–163: `assert.ok(row.snippet || row.type)`.
- **fixture file exists and is non-empty JSONL** — case 166–170.
  - 168–168: `assert.equal(raw.length, 12)`.

## tests/unit/tree-counts-catch.test.mjs

Source SHA256: `01d89eaefef5dede6460a6a5de648f8470127c55aac8f6b61a179454f2df1860`. Fully read lines 1–24; 2 registered case declarations. Read chunks: 1–24.

Inline synthetic try/catch strings only. Target `tools/check/tree-counts.mjs` bareCatchSites. Empty optional/ordinary catch bindings count (including next-line braces); handler bodies and explanation comments do not. Limit: regex-site classification over supplied snippets, not parser-wide correctness.

- **bareCatchSites counts an empty catch with and without a binding** — case 12–17.
  - 13–13: `assert.equal(bareCatchSites("try { a(); } catch (e) {}").length, 1)`.
  - 14–14: `assert.equal(bareCatchSites("try { a(); } catch {}").length, 1)`.
  - 15–15: `assert.equal(bareCatchSites("try { a(); } catch { }\ntry { b(); } catch (_) { }").length, 2)`.
  - 16–16: `assert.equal(bareCatchSites("try { a(); } catch\n{\n}").length, 1)`.
- **a catch that handles, or says why it swallows, is not bare** — case 19–24.
  - 20–20: `assert.equal(bareCatchSites("try { a(); } catch (e) { Log.warn(e); }").length, 0)`.
  - 21–21: `assert.equal(bareCatchSites("try { a(); } catch { fallback(); }").length, 0)`.
  - 22–22: `assert.equal(bareCatchSites("try { a(); } catch { /* storage may be blocked */ }").length, 0)`.
  - 23–23: `assert.equal(bareCatchSites("try { a(); } catch (e) { // private mode\n}").length, 0)`.

## tests/unit/trim-comments.test.mjs

Source SHA256: `d023112b851573535214233a33f348a5daa9a34698c63efaef00e77702e2dd91`. Fully read lines 1–180; 9 registered case declarations. Read chunks: 1–100, 101–180.

Each mutation case creates an isolated scratch directory and source-text fixture, invokes `tools/check/trim-comments.mjs` with spawnSync, reads output and removes the directory. Pins dividers, location-pointer and low-value narrative removal, substantive KEEP/boxed/open-banner/attribution preservation, explicit-path requirement and dry-run unchanged bytes with stderr candidate location. Limit: textual fixtures and CLI statuses; most cleanup follows assertions rather than finally, so failed assertions leave scratch directories (KEEP case uses finally). Synthetic source filenames are fixture-only.

- **trim-comments.mjs --help exits 0** — case 12–16.
  - 14–14: `assert.equal(r.status, 0)`.
  - 15–15: `assert.match(r.stdout, /--dry-run/)`.
- **trim-comments removes dividers and loc pointers on a fixture** — case 18–45.
  - 37–37: `assert.equal(r.status, 0)`.
  - 39–39: `assert.doesNotMatch(out, /---------- section/)`.
  - 40–40: `assert.doesNotMatch(out, /lives in js\//)`.
  - 41–41: `assert.doesNotMatch(out, /^\/\/ keyboard/m)`.
  - 42–42: `assert.doesNotMatch(out, /=== helpers ===/)`.
  - 43–43: `assert.match(out, /const x = 1/)`.
- **trim-comments removes dividers embedded in // comment runs** — case 47–65.
  - 59–59: `assert.equal(r.status, 0)`.
  - 61–61: `assert.doesNotMatch(out, /---------- section/)`.
  - 62–62: `assert.match(out, /prose block above/)`.
  - 63–63: `assert.match(out, /const x = 1/)`.
- **trim-comments preserves KEEP keywords in narrative blocks and removes plain ones** — case 67–89.
  - 82–82: `assert.equal(r.status, 0)`.
  - 84–84: `assert.doesNotMatch(out, /quick brown fox/)`.
  - 85–85: `assert.match(out, /measured on Bahrain/)`.
  - 86–86: `assert.match(out, /ladder cannot be reached/)`.
  - 87–87: `assert.match(out, /let a = 1;/)`.
- **trim-comments keeps whitespace-padded boxed prose in /* */** — case 91–109.
  - 103–103: `assert.equal(r.status, 0)`.
  - 105–105: `assert.match(out, /parked cars, boundary planting/)`.
  - 106–106: `assert.match(out, /marshal posts and camera positions/)`.
  - 107–107: `assert.doesNotMatch(out, /={10,}/)`.
- **trim-comments keeps an open divider run followed by prose, removes closed banners** — case 111–133.
  - 125–125: `assert.equal(r.status, 0)`.
  - 127–127: `assert.match(out, /Photo mode: a free-fly camera/)`.
  - 128–128: `assert.match(out, /prose continues/)`.
  - 129–129: `assert.match(out, /FAR HORIZON/)`.
  - 130–130: `assert.doesNotMatch(out, /---------- DOM/)`.
  - 131–131: `assert.doesNotMatch(out, /─{5,}/)`.
- **trim-comments --narrative keeps licence / attribution blocks** — case 135–155.
  - 149–149: `assert.equal(r.status, 0)`.
  - 151–151: `assert.match(out, /OpenStreetMap contributors/)`.
  - 152–152: `assert.match(out, /ODbL/)`.
  - 153–153: `assert.doesNotMatch(out, /Plain narrative/)`.
- **trim-comments --narrative with no explicit path exits 2** — case 157–161.
  - 159–159: `assert.equal(r.status, 2)`.
  - 160–160: `assert.match(r.stderr, /--narrative needs explicit paths/)`.
- **trim-comments --dry-run --narrative lists candidates on stderr and writes nothing** — case 163–180.
  - 176–176: `assert.equal(r.status, 0)`.
  - 177–177: `assert.match(r.stderr, /list\.js:2 {2}\/\/ Plain narrative that restates/)`.
  - 178–178: `assert.equal(fs.readFileSync(file, "utf8"), src)`.

## tests/unit/tt-lap-validity-vm.test.mjs

Source SHA256: `6835a1206f6adcbc1bdf1c97f5bec3205fb864277b4e9180e143e563a6297fd7`. Fully read lines 1–311; 9 registered case declarations. Read chunks: 1–100, 101–200, 201–300, 301–311.

Fixtures/helpers 24–81 and 171–179 boot actual Monza game VM, stop daily work, select TT/race and headless stepping, jump through the production placement API, record real ghost samples, drive off road until the real detector counts cuts, cross line with 600-step bound; crossLine assertion at 53 is inherited by crossing cases. Targets `js/game.js` cut ladder/accepted timing, IncidentSim invalid latch, Ghost/InputGhost durable storage, coach practice and pace-input class changes. TT cut preserves accepted best/record/both tapes, resets latch and permits next clean replacement; half-second excursion remains valid. Race strikes price [0,0,0,5,10,15], retain [1..6], delete timing while retaining distance. Quali marks NO TIME with no seconds; AI first strike mirrors invalidation; practice and settings-spoiled TT cannot replace accepted timing. Limits: VM/headless synthetic placement; AI case exercises first strike only. Cleanup gap: brief excursion, TT ladder, race ladder and race deleted-lap cases never close their VM; first TT closes only on success; latter four use finally.

Shared/module assertion spans: 53–53 assert.notEqual.

- **a time-trial lap with a counted cut sets no record and no ghost** — case 83–126.
  - 93–93: `assert.ok(isFinite(p.best) && p.best < 43)`.
  - 96–96: `assert.ok(isFinite(cleanRecord))`.
  - 100–100: `assert.ok(saved.pose?.t.length >= 8)`.
  - 101–101: `assert.ok(saved.input?.steer.length >= 30)`.
  - 102–102: `assert.ok(saved.poseStore && saved.inputStore)`.
  - 105–105: `assert.ok(cut.counted)`.
  - 106–106: `assert.equal(p.incidentInvalidLap, true)`.
  - 110–110: `assert.equal(p.incidentInvalidLap, true)`.
  - 112–112: `assert.equal(p.best, cleanBest)`.
  - 113–113: `assert.equal(G.ttRecord, cleanRecord)`.
  - 114–114: `assert.equal(p.incidentInvalidLap, false)`.
  - 115–115: `assert.equal(ghostState(g), cleanGhosts)`.
  - 121–121: `assert.ok(replacement.pose.time < saved.pose.time)`.
  - 122–122: `assert.ok(replacement.input.time < saved.input.time)`.
  - 123–123: `assert.notEqual(replacement.poseStore, saved.poseStore)`.
  - 124–124: `assert.notEqual(replacement.inputStore, saved.inputStore)`.
- **a brief excursion under the cut threshold still sets a record** — case 128–147.
  - 135–135: `assert.ok(isFinite(before))`.
  - 141–141: `assert.equal(p.cuts | 0, cutsBefore)`.
  - 142–142: `assert.equal(p.incidentInvalidLap, false)`.
  - 146–146: `assert.ok(p.best < before)`.
- **time trial never applies the +5s track-limits ladder** — case 149–169.
  - 159–159: `assert.ok(cut.counted)`.
  - 160–160: `assert.equal(p.incidentInvalidLap, true)`.
  - 166–166: `assert.equal(p.penalty, 0)`.
  - 167–167: `assert.equal(p.cutWarn, 0)`.
  - 168–168: `assert.ok((p.cuts | 0) >= 4)`.
- **a race: 3rd strike is the black-and-white flag, 4th AND EACH ADDITIONAL +5s, no reset (FIA 2026)** — case 181–202.
  - 193–193: `assert.ok(cut.counted)`.
  - 194–194: `assert.equal(p.incidentInvalidLap, true)`.
  - 199–199: `assert.deepEqual(pens, [0, 0, 0, 5, 10, 15])`.
  - 200–200: `assert.deepEqual(warns, [1, 2, 3, 4, 5, 6])`.
  - 201–201: `assert.ok((p.cuts | 0) >= 6)`.
- **a race lap with a counted cut is DELETED — no best/last lap — but still counts for distance** — case 204–228.
  - 215–215: `assert.ok(isFinite(p.best))`.
  - 219–219: `assert.ok(cut.counted)`.
  - 220–220: `assert.equal(p.incidentInvalidLap, true)`.
  - 224–224: `assert.equal(p.lap, lapBefore + 1)`.
  - 225–225: `assert.equal(p.best, cleanBest)`.
  - 226–226: `assert.equal(p.lastLap, cleanLast)`.
  - 227–227: `assert.equal(p.incidentInvalidLap, false)`.
- **a qualifying cut is NO TIME: the lap is deleted, qualiCut is set and no seconds are priced** — case 232–251.
  - 241–241: `assert.ok(cut.counted)`.
  - 242–242: `assert.equal(p.incidentInvalidLap, true)`.
  - 243–243: `assert.equal(p.qualiCut, true)`.
  - 244–244: `assert.equal(p.penalty, 0)`.
  - 248–248: `assert.equal(p.lastLap, lastBefore)`.
  - 249–249: `assert.equal(p.best, bestBefore)`.
- **an AI car's counted cut deletes its lap and pays the race ladder like the player's** — case 253–271.
  - 266–266: `assert.ok(ai.cuts > 0)`.
  - 267–267: `assert.equal(ai.incidentInvalidLap, true)`.
  - 268–268: `assert.equal(ai.cutWarn, 1)`.
  - 269–269: `assert.equal(ai.penalty, 0)`.
- **a practice lap (checkpoint set) is not a timed lap, with no cut involved** — case 273–288.
  - 280–280: `assert.ok(isFinite(cleanBest))`.
  - 281–281: `assert.equal(G.coach.armPractice(), true)`.
  - 282–282: `assert.equal(G.coach.mark(), true)`.
  - 283–283: `assert.equal(G.coach.practiceActive(), true)`.
  - 286–286: `assert.equal(p.best, cleanBest)`.
- **a settings-spoiled TT lap cannot replace accepted timing, including the next slower clean lap** — case 291–311.
  - 296–296: `assert.equal(g.G.ttLaps.length, 1)`.
  - 300–300: `assert.equal(p.best, accepted)`.
  - 301–301: `assert.equal(p.lastLap, accepted)`.
  - 302–302: `assert.equal(g.G.ttLaps.length, 1)`.
  - 303–303: `assert.equal(g.G.records.board("monza").length, 0)`.
  - 305–305: `assert.ok(p.best > 85 && p.best < 86)`.
  - 306–306: `assert.equal(p.best, p.lastLap)`.
  - 307–307: `assert.equal(p.best, g.G.ttRecord)`.
  - 308–308: `assert.equal(g.G.records.board("monza")[0].t, p.best)`.
  - 309–309: `assert.equal(g.G.ttLaps.length, 2)`.

## tests/unit/tumftm-import.test.mjs

Source SHA256: `ecf30b27137af00ad5a86ff2010c6a9985655135bdad049fe4ae7414d3f72232`. Fully read lines 1–158; 10 registered case declarations. Read chunks: 1–100, 101–158.

Uses `tools/lib/tumftm.mjs` syntheticOvalCsv/syntheticRacelineCsv only (no fetched upstream data), bootEditor from `tests/helpers/editor-vm.mjs`, and real track verifier context. Targets parser, decimator, quarter-metre design lattice, widthZones, negative inset raceline offsets, deterministic seed, LGPL envelope, CLI `tools/track/tumftm-import.mjs` and CustomTracks/codec/Tracks.buildCenterline round trip. Catalog expected 25 stems and four unshipped/layout differences; synthetic offset mean (-2.1,-1.7), each (-3,-1); build >2000 m with curv length n. Writes `artifacts/tumftm-test` and removes after assertions (failure can retain output). Limits: synthetic oval proves conversion plumbing, not upstream dataset accuracy/licensing completeness.

- **catalog: 25 upstream stems, four with no shipped circuit (Nuerburgring flagged layout-diff)** — case 28–47.
  - 29–29: `assert.equal(CATALOG.length, 25)`.
  - 30–30: `assert.equal(LICENSE, "LGPL-3.0")`.
  - 31–31: `assert.match(SOURCE_URL, /TUMFTM\/racetrack-database/)`.
  - 33–35: `assert.deepEqual(miss.map((e) => e.tumftm).sort(), [ "MoscowRaceway", "Norisring", "Nuerburgring", "Oschersleben", ])`.
  - 36–36: `assert.equal(catalogEntry("norisring").status, "missing")`.
  - 37–37: `assert.equal(catalogEntry("Monza").apexId, "monza")`.
  - 38–38: `assert.equal(catalogEntry("Nuerburgring").status, "layout-diff")`.
  - 44–44: `assert.ok(ids.has(e.apexId))`.
  - 45–45: `assert.equal(e.status === "missing" || e.status === "unknown", true)`.
- **parse + design: synthetic oval lands inside designer limits and sanitizes** — case 49–68.
  - 51–51: `assert.ok(rows.length >= 60)`.
  - 53–53: `assert.ok(design.pts.length >= 8 && design.pts.length <= PTS_MAX)`.
  - 54–54: `assert.ok(design.baseHW >= 5 && design.baseHW <= 8)`.
  - 55–55: `assert.equal(design.theme, "harbour")`.
  - 56–56: `assert.equal(design.name, "Test Oval")`.
  - 59–59: `assert.equal(x, Math.round(x * 4) / 4)`.
  - 60–60: `assert.equal(z, Math.round(z * 4) / 4)`.
  - 64–64: `assert.ok(it)`.
  - 65–65: `assert.match(it.id, /^custom-[0-9a-f]{8}$/)`.
  - 66–66: `assert.equal(it.name, "TEST OVAL")`.
  - 67–67: `assert.ok(it.lengthM > 1500)`.
- **decimate never exceeds the designer ptsMax and keeps the start sample** — case 70–76.
  - 73–73: `assert.ok(slim.length <= 100)`.
  - 74–74: `assert.equal(slim[0].x, rows[0].x)`.
  - 75–75: `assert.equal(slim[0].y, rows[0].y)`.
- **widthZones: marked widenings become ≤ 16 hwZones** — case 78–88.
  - 86–86: `assert.ok(zones.length >= 1 && zones.length <= 16)`.
  - 87–87: `assert.ok(zones.some((z) => z.hw >= 7))`.
- **racelineOffsets: inset raceline reports a consistent bias** — case 90–101.
  - 95–95: `assert.equal(off.length, design.pts.length)`.
  - 99–99: `assert.ok(mean < -1.7 && mean > -2.1)`.
  - 100–100: `assert.ok(off.every((v) => v < -1 && v > -3))`.
- **fileEnvelope carries LGPL attribution and the designer format key** — case 103–111.
  - 106–106: `assert.equal(env.format, "apex26.track")`.
  - 107–107: `assert.equal(env.attribution.license, "LGPL-3.0")`.
  - 108–108: `assert.match(env.attribution.notice, /OpenStreetMap/)`.
  - 109–109: `assert.equal(env.attribution.tumftm, "Norisring")`.
  - 110–110: `assert.equal(env.design.theme, "parkland")`.
- **seedFrom is stable** — case 113–116.
  - 114–114: `assert.equal(seedFrom("NORISRING"), seedFrom("NORISRING"))`.
  - 115–115: `assert.notEqual(seedFrom("A"), seedFrom("B"))`.
- **CLI --help / --list / --self-check exit cleanly** — case 118–124.
  - 119–119: `assert.equal(await tumftmMain(["--help"]), 0)`.
  - 120–120: `assert.equal(await tumftmMain(["--self-check"]), 0)`.
  - 122–122: `assert.equal(await tumftmMain(["--list"]), 0)`.
  - 123–123: `assert.equal(await tumftmMain(["--missing"]), 0)`.
- **CLI --source writes an importable envelope under artifacts/** — case 126–146.
  - 132–132: `assert.equal(code, 0)`.
  - 134–134: `assert.ok(fs.existsSync(out))`.
  - 136–136: `assert.equal(env.format, "apex26.track")`.
  - 137–137: `assert.equal(env.design.theme, "alpine")`.
  - 138–138: `assert.equal(env.attribution.license, "LGPL-3.0")`.
  - 142–142: `assert.ok(parsed && parsed.design)`.
  - 143–143: `assert.ok(C.sanitize(parsed.design))`.
- **converted design builds a centreline through the real track VM** — case 148–158.
  - 154–154: `assert.equal(custom.length, 1)`.
  - 156–156: `assert.ok(tr.total > 2000)`.
  - 157–157: `assert.ok(tr.line && tr.curv.length === tr.n)`.

## tests/unit/twin-drift.test.mjs

Source SHA256: `b6755a85fa457a948f65aa6131216f15766f350a008465e84cfee72d5ef69a14`. Fully read lines 1–120; 2 registered case declarations. Read chunks: 1–100, 101–120.

Local test helpers testsOf 41–54, thresholds 60–74 and pairs 76–82 enumerate VM/browser pairs. Reads `tests/unit` and `tests/specs`, matching normalized titles, stripping comments/message strings and collecting numbers in assertion statements. Empty ALLOW map. Failure occurs only when BOTH sides have unique numeric thresholds. Anti-vacuity ≥12 pairs plus three named pairs. Targets test-maintenance consistency rather than game runtime. Limits: text scanning, ignores missing titles and one-sided numbers, cannot prove semantic equivalence; title coverage belongs to other guards.

- **every VM twin and its browser spec assert the same thresholds** — case 84–109.
  - 104–108: `assert.deepEqual(found, [])`.
- **the twins this guard covers are actually paired up** — case 111–120.
  - 115–115: `assert.ok(ps.length >= 12)`.
  - 118–118: `assert.ok(named.includes(must))`.

## tests/unit/twin-fidelity.test.mjs

Source SHA256: `b5a71cc1aeaeb601590496fd02b33628461af8aa56465a09d522aee86572e14e`. Fully read lines 1–127; 11 registered case declarations. Read chunks: 1–100, 101–127.

Reads `tests/data/mutants.json` and `tools/check/twin-fidelity.mjs` exports. Fixtures include inline TAP, catcher maps, forbidden dependency functions, injected mutate/spec runners and child CLI processes (10 s). Needles must exist once, matrix nonempty, each mutant asymmetric with a >40-character why and real spec, catcher title text/template present; open questions retain evidence. Planning rejects typos before any dependency work, and help/list/dry do not mutate/run specs; valid injected execution runs exactly selected mutant. Limits: default suite validates machinery/needles, does not execute actual mutations; title existence uses string/template matching, not parsed test registration.

- **every gating mutant's needle still exists, exactly once, in its file** — case 14–18.
  - 16–16: `assert.deepEqual(bad, [])`.
  - 17–17: `assert.ok(MUTANTS.length > 0)`.
- **every mutant is ASYMMETRIC — it must spare at least one test** — case 20–29.
  - 23–23: `assert.ok(vals.some((v) => v === true))`.
  - 24–25: `assert.ok(vals.some((v) => v === false))`.
  - 26–26: `assert.ok(m.why && m.why.length > 40)`.
  - 27–27: `assert.ok(fs.existsSync(new URL('../../${m.spec}', import.meta.url)))`.
- **the TAP parser reads both outcomes, which is what the verdict turns on** — case 31–35.
  - 33–33: `assert.equal(got.get("alpha"), true)`.
  - 34–34: `assert.equal(got.get("beta"), false)`.
- **a twin that sleeps through a mutant FAILS, and a missing test never reads as a pass** — case 37–46.
  - 41–41: `assert.equal(slept.find((r) => r.name === "a").ok, false)`.
  - 43–43: `assert.ok(caught.every((r) => r.ok))`.
  - 45–45: `assert.equal(absent.find((r) => r.name === "a").ok, false)`.
- **the open questions keep their evidence rather than being deleted** — case 48–55.
  - 50–50: `assert.ok(open.length > 0)`.
  - 52–52: `assert.ok(q.finding && q.measured && q.sowhat)`.
  - 53–53: `assert.ok(!MUTANTS.some((m) => m.id === q.id))`.
- **twin-fidelity --help exits 0 without running mutants** — case 57–64.
  - 61–61: `assert.equal(r.status, 0)`.
  - 62–62: `assert.match(r.stdout, /usage:.*twin-fidelity/)`.
  - 63–63: `assert.doesNotMatch(r.stdout, /^PASS /m)`.
- **every named catcher is a real test title in the mutant's spec (a renamed test must not leave a dead name)** — case 66–79.
  - 75–76: `assert.ok(templated || variants.some((v) => src.includes(v)))`.
- **invalid fidelity selectors and flags fail before even checking needles** — case 81–91.
  - 88–88: `assert.throws(() => runFidelity(args, dependencies), /unknown (mutant id|flag)|cannot be combined/)`.
  - 90–90: `assert.equal(calls, 0)`.
- **fidelity planning preserves all-mutant, explicit selection, help, list and dry modes** — case 93–103.
  - 94–94: `assert.deepEqual(planFidelity([]), { mode: "run", run: MUTANTS })`.
  - 95–95: `assert.deepEqual(planFidelity([MUTANTS[0].id]).run, [MUTANTS[0]])`.
  - 96–96: `assert.equal(planFidelity(["-h"]).mode, "help")`.
  - 97–97: `assert.equal(planFidelity(["--list"]).mode, "list")`.
  - 98–98: `assert.equal(planFidelity(["--dry"]).mode, "dry")`.
  - 99–99: `assert.fail("help/list/dry must not mutate or run specs")`.
  - 100–100: `assert.equal(runFidelity(["--help"], { needles: forbidden, mutate: forbidden, spec: forbidden }), 0)`.
  - 101–101: `assert.equal(runFidelity(["--list"], { needles: forbidden, mutate: forbidden, spec: forbidden }), 0)`.
  - 102–102: `assert.equal(runFidelity(["--dry"], { needles: () => [], mutate: forbidden, spec: forbidden }), 0)`.
- **a valid fidelity selection runs only its declared mutant through the injected runner** — case 105–118.
  - 112–112: `assert.equal(spec, current.spec)`.
  - 116–116: `assert.equal(status, 0)`.
  - 117–117: `assert.deepEqual(selected, [MUTANTS[0].id])`.
- **the fidelity CLI reports an unknown selector as a caller error** — case 120–127.
  - 123–123: `assert.equal(r.status, 1)`.
  - 124–124: `assert.match(r.stderr, /unknown mutant id.*no-such-mutant/)`.
  - 125–125: `assert.doesNotMatch(r.stdout, /0\/0|^PASS /m)`.
  - 126–126: `assert.doesNotMatch(r.stderr, /\n\s+at /)`.

## tests/unit/twinned-specs.test.mjs

Source SHA256: `fb74c19ef2d268c60685c700ebd41490dc353c0f6e42c247bdbbbe7b4b1e1eb8`. Fully read lines 1–295; 12 registered case declarations. Read chunks: 1–100, 101–200, 201–295.

Targets `tools/ci/twinned-specs.mjs`, select-specs fit, select-budget declaredTests, `tools/ci/run-playwright.mjs`, `tests/groups.json`, .github/workflows/ci.yml and deploy source-derived groups. Real pair metadata plus temporary two-test/one-test fixtures. Pins paired/adapted substitution, gated coverage and derived ungated complement, local flags/environment overrides and empty-run arithmetic, job-boundary parsing, train-twins reachability and deduplicated train plan. Default runner checks are source contracts; E2E case is explicitly skipped unless APEX_RUNNER_E2E=1 and then launches the real runner with 180 s timeout. Limits: count equality/threshold guard do not prove assertion equivalence; workflow parsers are format-sensitive. Temp pair directory removed in finally but uses system temporary root, contrary to current regenerable-output convention. No browser or E2E was run for this map.

- **every twin still covers its spec, and still runs on a gate** — case 22–26.
  - 24–25: `assert.deepEqual(problems, [])`.
- **the selected gate actually skips them, and says so** — case 28–35.
  - 31–31: `assert.deepEqual(r.selected, [])`.
  - 32–32: `assert.deepEqual(r.coveredByVmTwin.map((x) => x.file).sort(), Object.keys(TWINNED).sort())`.
  - 34–34: `assert.ok(row.twin && row.tests > 0)`.
- **an ADAPTED spec is its own twin: skipped on the gate, dropped locally, run under APEX_VM_PAGE=1** — case 37–67.
  - 41–41: `assert.ok(specs.length > 0)`.
  - 43–43: `assert.ok(fs.existsSync(path.join(ROOT, spec)))`.
  - 44–44: `assert.equal(twinOf(spec), spec)`.
  - 45–45: `assert.ok(isTwinned(spec) && isAdapted(spec))`.
  - 46–46: `assert.ok(!(spec in TWINNED))`.
  - 47–47: `assert.ok(!(spec in BROWSER_ONLY))`.
  - 48–48: `assert.ok(typeof ADAPTED[spec] === "string" && ADAPTED[spec].length > 20)`.
  - 49–50: `assert.ok(!/from "@playwright\/test"/.test(fs.readFileSync(path.join(ROOT, spec), "utf8")))`.
  - 54–54: `assert.deepEqual(r.selected, [])`.
  - 55–55: `assert.deepEqual(r.coveredByVmTwin.map((x) => x.file).sort(), specs.sort())`.
  - 56–56: `assert.equal(row.twin, row.file)`.
  - 59–59: `assert.deepEqual(partitionArgs([one], {}).dropped, [{ spec: one, twin: one, adapted: true }])`.
  - 60–60: `assert.equal(partitionArgs([one], {}).nothingToRun, true)`.
  - 61–61: `assert.deepEqual(partitionArgs([one], { APEX_WITH_TWINNED: "1" }).dropped, [])`.
  - 63–63: `assert.ok(gatedNodeFiles().has(ADAPTED_RUNNER))`.
  - 65–65: `assert.match(runner, /APEX_VM_PAGE: "1"/)`.
  - 66–66: `assert.match(runner, /delete env\.NODE_TEST_CONTEXT/)`.
- **a twin that loses a test is caught** — case 69–90.
  - 81–81: `assert.equal(declaredTests(rel(spec)), 2)`.
  - 82–83: `assert.equal(declaredTests(rel(twin)), 1)`.
  - 89–89: `assert.equal(specTests, twinTests)`.
- **the gated-node set is derived from ci.yml, not copied** — case 92–102.
  - 96–96: `assert.ok(files.size > 100)`.
  - 98–98: `assert.ok(files.has(twin))`.
  - 100–101: `assert.ok(ci.includes("- name: Pure-node unit suites"))`.
- **the LOCAL runner skips twins too, says so, and never hands Playwright an empty list** — case 104–126.
  - 112–112: `assert.deepEqual(r.args, ["--workers=1", "tests/specs/smoke.spec.js", "--timeout=900000"])`.
  - 113–113: `assert.deepEqual(r.dropped, [{ spec: twin, twin: TWINNED[twin] }])`.
  - 114–114: `assert.equal(r.nothingToRun, false)`.
  - 117–117: `assert.equal(all.nothingToRun, true)`.
  - 118–118: `assert.deepEqual(all.args, ["--workers=1"])`.
  - 120–120: `assert.deepEqual(partitionArgs([twin, "--with-twinned"], {}).args, [twin])`.
  - 121–121: `assert.deepEqual(partitionArgs([twin], { APEX_WITH_TWINNED: "1" }).dropped, [])`.
  - 123–123: `assert.ok(!partitionArgs([twin, "--with-twinned"], {}).args.includes("--with-twinned"))`.
  - 125–125: `assert.equal(partitionArgs(["--project=render"], {}).nothingToRun, false)`.
- **a fully twinned group RUNS its twins, and an empty run never reports a pass** — case 128–159.
  - 150–150: `assert.ok(isTwinned(spec))`.
  - 151–151: `assert.equal(partitionArgs([spec], {}).nothingToRun, true)`.
  - 153–154: `assert.match(runner, /spawnSync\(process\.execPath, \["--test", "--test-reporter=tap", \.\.\.twins\]/)`.
  - 155–156: `assert.match(runner, /const ok = r\.status === 0 && failed === 0 && passed > 0;/)`.
  - 157–158: `assert.match(runner, /passed === null \|\| failed === null[\s\S]{0,300}= run failed/)`.
- **run-playwright on a fully twinned spec runs only the node twin (E2E, APEX_RUNNER_E2E=1)** — case 161–176.
  - 167–167: `assert.ok(m)`.
  - 168–168: `assert.equal(m[1], "passed")`.
  - 169–170: `assert.ok(+m[2] > 0 && +m[3] > 0)`.
  - 171–171: `assert.equal(+m[4], 0)`.
  - 172–172: `assert.equal(r.status, 0)`.
  - 173–173: `assert.ok(out.includes(TWINNED[spec]))`.
  - 175–175: `assert.ok(!/\[playwright\] port=/.test(out))`.
- **the ungated set is derived, and is the exact complement of the gated one** — case 191–207.
  - 194–194: `assert.ok(Array.isArray(ungated))`.
  - 196–196: `assert.equal(gated.has(f), false)`.
  - 203–204: `assert.ok(gated.has(f) || ungated.includes(f))`.
- **every ungated file is covered by a group deploy.mjs actually runs** — case 209–243.
  - 234–235: `assert.ok(covering.has("test:sweeps"))`.
  - 239–242: `assert.deepEqual(stranded, [])`.
- **the gated slice stops at its job — the bare-'run:' swallow** — case 245–276.
  - 259–259: `assert.ok(from >= 0)`.
  - 264–265: `assert.equal(gated.has(f), false)`.
  - 266–267: `assert.ok(!nodeJob.includes("test:sweeps-parts"))`.
  - 272–272: `assert.ok(inStep.length >= 3)`.
  - 275–275: `assert.ok(gated.has(f))`.
- **the train runs the twins of every spec its plan drops (ci-7d C2): read from the jobs' if:, not assumed** — case 278–295.
  - 282–282: `assert.equal(live.nodeJob, false)`.
  - 283–283: `assert.equal(live.twinJob, true)`.
  - 285–285: `assert.equal(trainCoverage(yml.replace(" - train-twins\n", "")).covered, false)`.
  - 286–286: `assert.equal(trainCoverage(yml.replace(/(\n train-twins:[\s\S]*?\n if: .*?)inputs\.concurrency_key != ''/, "$1inputs.concurrency_key == ''")).covered, false)`.
  - 288–288: `assert.equal(trainCoverage(yml.replace(/(\n node-suites:[\s\S]*?\n if: .*?)inputs\.concurrency_key == '' && /, "$1")).nodeJob, true)`.
  - 293–293: `assert.deepEqual(plan, { twins: [TWINNED[spec]], adapted: ["tests/specs/pit-lane.spec.js"], circuits: "monza" })`.
  - 294–294: `assert.deepEqual(trainTwinPlan({}), { twins: [], adapted: [], circuits: "" })`.

## tests/unit/tyre-model.test.mjs

Source SHA256: `1d2ad34b0942025e98d45d5801e62693e23ac864cd11fbe7a75c6e515b431c06`. Fully read lines 1–1240; 78 registered case declarations. Read chunks: 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–700, 701–800, 801–900, 901–1000, 1001–1100, 1101–1200, 1201–1240.

Fixture load 33–44 executes real `js/core/mat4.js`, `js/physics/consts.js`, `js/data/teams.js`, `js/car/parts.js` and `js/physics/tyre-model.js` in seeded logging VM. ctxFor 109–120 is a minimal G (default 25 laps, 5386 m, LAT_MAX22, aTop7, vTop60, dry); run 125–137 integrates one-second distance ticks and lap crossings; freshCar 138–142 fits synthetic life records. Targets TyreModel public static/session API, Parts tyre catalog, `js/game.js` source wiring and all circuit definitions severity data. Cases cover fit/reset/tread/modifier rebuilding; off identity; distance-fraction life/minimum floor/severity/fuel; grip cliff and longitudinal share; thermal surface/core/grain/blister; per-axle split; stint log; AI/human load calibration and finite guards; catalog class letters/life; shipped default/cold-boot synchronization; storm/aquaplane weather; physical age across pre-line pits/scoring rewinds and historical baseline overrides. Exact thresholds and assertion expressions are inventoried below. Limits: stand-in G rather than full race, coarse one-second integration in many cases, source regex checks cannot prove live wiring. The public-step-chain equality checks shared model logic, so independent physical realism is not established. No external resources or teardown required.

- **fitting a set owns explicit tread and rebuilds modifiers without accumulation** — case 46–65.
  - 54–54: `assert.equal(car.flatSpot, 0)`.
  - 55–55: `assert.equal(car.tread, 2)`.
  - 56–56: `assert.equal(car.mods.speed, base.speed * 0.88)`.
  - 57–57: `assert.equal(car.mods.cornering, base.cornering * 0.90)`.
  - 62–62: `assert.deepEqual(car.mods, once)`.
  - 63–63: `assert.equal(car.mods.speed, base.speed * 0.97)`.
  - 64–64: `assert.equal(car.mods.cornering, base.cornering * 1.12)`.
- **fitting preserves the ordinary AI null-tread competent-field sentinel** — case 67–73.
  - 71–71: `assert.equal(car.tread, null)`.
  - 72–72: `assert.equal(car.tyre.tread, 0)`.
- **…but an AI with a pit plan (wear on) carries the tread of the set it is fitted** — case 75–83.
  - 80–80: `assert.equal(car.tread, 2)`.
  - 82–82: `assert.equal(car.tread, 0)`.
- **an AI plan overrides a MY TEAM mate's saved starting tyre** — case 85–94.
  - 89–89: `assert.equal(rec.id, "hard")`.
  - 90–90: `assert.equal(rec.tread, 0)`.
  - 93–93: `assert.equal(T.startRecord(player).id, "wet_full")`.
- **an AI car starts a WET race on the tread the weather wants, not the plan's slick** — case 96–105.
  - 100–100: `assert.equal(T.startRecord(ai, 0).id, "hard")`.
  - 101–101: `assert.equal(T.startRecord(ai, 1).tread, 1)`.
  - 102–102: `assert.equal(T.startRecord(ai, 2).tread, 2)`.
  - 104–104: `assert.equal(T.startRecord(player, 2).tread, 0)`.
- **OFF: every multiplier is exactly 1 and nothing wears** — case 146–156.
  - 148–148: `assert.equal(s.level(), "off")`.
  - 151–151: `assert.equal(c.tyreWear, 0)`.
  - 154–154: `assert.equal(v, 1)`.
- **OFF: the multipliers are 1 even on a car that is already worn** — case 158–167.
  - 165–165: `assert.equal(s.gripMul(c), 1)`.
  - 166–166: `assert.equal(s.tractionMul(c), 1)`.
- **wear reaches 1.0 after 'life x lapsTarget' laps at load 1** — case 171–185.
  - 183–184: `assert.ok(c.tyreWear > 0.85 && c.tyreWear < 1.25)`.
- **one NaN tick does not wipe a set's accumulated wear (bug-hunt 7.10)** — case 187–204.
  - 193–193: `assert.ok(w > 0.1)`.
  - 199–199: `assert.ok(Number.isFinite(c.tyreWear))`.
  - 200–200: `assert.ok(c.tyreWear >= w - 1e-12)`.
  - 203–203: `assert.ok(c.tyreWear > w)`.
- **the SAME compound lasts proportionally longer in a longer race** — case 206–219.
  - 217–218: `assert.ok(Math.abs(a.tyreWear - b.tyreWear) / b.tyreWear < 0.01)`.
- **a very short race cannot demand a stop: MIN_LIFE_LAPS floors the stint** — case 221–233.
  - 226–227: `assert.ok(T.lifeLaps(softest, 3) >= T.MIN_LIFE_LAPS)`.
  - 232–232: `assert.ok(c.tyreWear < 1)`.
- **LIGHT wears strictly slower than REAL, and both wear** — case 235–240.
  - 238–238: `assert.ok(light > 0 && real > 0)`.
  - 239–239: `assert.ok(light < real)`.
- **circuit severity scales wear, and is clamped either side** — case 242–249.
  - 244–244: `assert.ok(mk(1.6) > mk(1.0) && mk(1.0) > mk(0.6))`.
  - 246–246: `assert.equal(ctxFor({ severity: 99 }).severity(), 2.0)`.
  - 247–247: `assert.equal(ctxFor({ severity: -5 }).severity(), 0.4)`.
  - 248–248: `assert.equal(ctxFor({ severity: null }).severity(), 1)`.
- **a set that is GONE costs real grip: the cliff bites, and the floor is a car you nurse home** — case 251–258.
  - 254–254: `assert.ok(T.gripFor(1.5) <= 0.72)`.
  - 255–255: `assert.equal(T.gripFor(2), T.GRIP_FLOOR)`.
  - 256–256: `assert.ok(T.GRIP_FLOOR <= 0.6)`.
  - 257–257: `assert.ok(T.gripFor(1.05) > 0.9)`.
- **qualifying runs light, on a set its out-lap has warmed** — case 260–274.
  - 267–267: `assert.equal(s.fuelAccelMul(c), 1)`.
  - 268–268: `assert.equal(s.fuelVmaxMul(c), 1)`.
  - 269–269: `assert.equal(c.tyreTs, T.optTemp(0.74))`.
  - 272–272: `assert.ok(race.fuelAccelMul(r) < 1)`.
  - 273–273: `assert.equal(r.tyreTs, T.T_BLANKET)`.
- **the player's top speed pays for worn rubber, as the AI's does** — case 276–298.
  - 282–283: `assert.match(src, /else if \(c\.human\) vmax \*= (?:tyres\.tractionMul\(c\)|trMul)/)`.
  - 286–286: `assert.ok(init)`.
  - 294–294: `assert.equal(traction(model, T, car), model.tractionMul(car))`.
- **ambient temperature follows a weather arc, not the flip of raceWeather** — case 300–315.
  - 307–307: `assert.equal(s.info(c).ambient, T.T_AMBIENT.dry)`.
  - 310–310: `assert.ok(Math.abs(mid - (T.T_AMBIENT.dry + T.T_AMBIENT.rain) / 2) < 1e-9)`.
  - 312–312: `assert.equal(s.info(c).ambient, T.T_AMBIENT.rain)`.
  - 314–314: `assert.equal(s.info(c).ambient, T.T_AMBIENT.rain)`.
- **lapsLeft: the laps a set has left, at the rate this car has been wearing it** — case 317–329.
  - 321–321: `assert.ok(Math.abs(s.lapsLeft(c) - s.planLaps(0.74, 20)) < 1e-9)`.
  - 324–324: `assert.ok(Math.abs(s.lapsLeft(c) - 7) < 1e-9)`.
  - 326–326: `assert.equal(s.lapsLeft(c), 0)`.
  - 328–328: `assert.equal(off.lapsLeft(freshCar(off, 0.74)), null)`.
- **planLaps plans against the circuit's severity, as the wear does** — case 331–343.
  - 337–338: `assert.ok(Math.abs(austria.planLaps(0.74, 20) - neutral.planLaps(0.74, 20) / 1.97) < 1e-9)`.
  - 342–342: `assert.ok(Math.abs(a / n - 1) < 0.05)`.
- **the minimum life holds AFTER severity: a 5-lap race at Austria is one set** — case 345–356.
  - 349–349: `assert.equal(s.planLaps(0.48, 5), T.MIN_LIFE_LAPS)`.
  - 353–353: `assert.ok(c.tyreWear > 0.7 && c.tyreWear < 1.3)`.
  - 355–355: `assert.ok(half.tyreWear < 0.65)`.
- **a 5-lap race on the softest set ends on usable tyres, fuel and all** — case 358–365.
  - 364–364: `assert.ok(c.tyreWear <= 1.05)`.
- **grip falls linearly across the stint, then falls off a cliff** — case 369–379.
  - 371–371: `assert.equal(g(0), 1)`.
  - 373–373: `assert.ok(g(0.5) < g(0) && g(1) < g(0.5))`.
  - 374–374: `assert.ok(Math.abs((g(0) - g(0.5)) - (g(0.5) - g(1))) < 1e-9)`.
  - 377–377: `assert.ok(past > inLife * 4)`.
  - 378–378: `assert.ok(g(9) >= T.GRIP_FLOOR)`.
- **traction loses a smaller share of the same drop than cornering** — case 381–389.
  - 386–386: `assert.ok(lng > 0 && lng < lat)`.
  - 387–387: `assert.ok(Math.abs(lng - lat * T.LONG_SHARE) < 1e-9)`.
- **a full tank wears the tyre faster than an empty one** — case 391–402.
  - 399–400: `assert.ok(full.tyreWear > empty.tyreWear)`.
  - 401–401: `assert.ok(full.tyreWear / empty.tyreWear < 1 + T.FUEL_LOAD + 1e-6)`.
- **fuel runs from a full tank at the start to empty at the flag** — case 404–420.
  - 407–407: `assert.equal(T.fuelFrac(c, 20), 1)`.
  - 411–411: `assert.equal(T.fuelFrac(c, 20), 1)`.
  - 413–413: `assert.ok(Math.abs(T.fuelFrac(c, 20) - 1 / 20) < 1e-12)`.
  - 415–415: `assert.equal(T.fuelFrac(c, 20), 0)`.
  - 419–419: `assert.ok(s.fuelAccelMul(c) > full)`.
- **a fresh set comes out of blankets BELOW its window — that is the out-lap** — case 424–438.
  - 430–430: `assert.equal(c.tyreTs, T.T_BLANKET)`.
  - 432–432: `assert.ok(T.T_BLANKET < opt - T.T_WINDOW)`.
  - 434–434: `assert.ok(cold < 1)`.
  - 437–437: `assert.ok(cold > 0.95)`.
- **driving brings a cold set INTO its window, and it then holds there** — case 440–452.
  - 445–446: `assert.ok(Math.abs(c.tyreTs - opt) < T.T_WINDOW)`.
  - 447–447: `assert.ok(s.gripMul(c) > 0.99 * T.gripFor(c.tyreWear))`.
  - 451–451: `assert.ok(Math.abs(c.tyreTs - was) < 8)`.
- **a softer compound switches on faster than a harder one** — case 454–473.
  - 470–470: `assert.ok(soft < hard)`.
  - 471–471: `assert.ok(Number.isFinite(hard))`.
  - 472–472: `assert.ok(T.warmRate(0.48) > T.warmRate(1.05))`.
- **the bulk lags the surface — which is what tells graining from blistering** — case 475–487.
  - 479–479: `assert.ok(c.tyreTs > c.tyreTb)`.
  - 485–486: `assert.ok(c.tyreTb > c.tyreTs + 1)`.
- **a cold, sliding tyre GRAINS, and graining heals once it is warm again** — case 489–502.
  - 494–494: `assert.ok(c.tyreGrain > 0)`.
  - 496–496: `assert.ok(s.gripMul(c) < T.gripFor(c.tyreWear))`.
  - 501–501: `assert.ok(c.tyreGrain < grained)`.
- **a cooked CORE blisters, and blistering never heals** — case 504–516.
  - 510–510: `assert.ok(blistered > 0)`.
  - 511–511: `assert.ok(T.BLIST_GRIP > T.GRAIN_GRIP)`.
  - 515–515: `assert.ok(c.tyreBlister >= blistered)`.
- **a stop resets temperature and BOTH defects, because it is a new tyre** — case 518–527.
  - 523–523: `assert.equal(c.tyreGrain, 0)`.
  - 524–524: `assert.equal(c.tyreBlister, 0)`.
  - 525–525: `assert.equal(c.tyreTs, T.T_BLANKET)`.
  - 526–526: `assert.equal(c.tyreTb, T.T_BLANKET)`.
- **colder weather means a colder tyre** — case 529–540.
  - 538–538: `assert.ok(run("rain") < run("dry"))`.
  - 539–539: `assert.ok(T.T_AMBIENT.rain < T.T_AMBIENT.dry)`.
- **OFF: temperature never costs grip** — case 542–549.
  - 547–547: `assert.equal(s.gripMul(c), 1)`.
  - 548–548: `assert.equal(s.tractionMul(c), 1)`.
- **the two axle shares always average to exactly 1** — case 553–562.
  - 560–560: `assert.ok(Math.abs((f + r) / 2 - 1) < 1e-12)`.
- **braking wears the FRONT, traction wears the REAR** — case 564–569.
  - 567–567: `assert.ok(brake[0] > brake[1] + 0.5)`.
  - 568–568: `assert.ok(drive[1] > drive[0] + 0.5)`.
- **an AI car braking (corridorAccel < 0) loads its FRONT, and its load sees the stop** — case 575–582.
  - 578–578: `assert.ok(f > r + 0.5)`.
  - 579–579: `assert.ok(T.aiLoad(stale, 7) > T.aiLoad({ ...stale, corridorAccel: 2 }, 7))`.
  - 581–581: `assert.equal(T.axleShare({ human: false, accSm: 7 }, 7)[0], T.axleShare({ human: false, accSm: 7, corridorAccel: undefined }, 7)[0])`.
- **a forward brake bias moves wear onto the front, a rearward one off it** — case 584–591.
  - 586–586: `assert.ok(at(0.62) > at(T.BB_REF))`.
  - 587–587: `assert.ok(at(0.50) < at(T.BB_REF))`.
  - 590–590: `assert.equal(drive(0.62), drive(0.50))`.
- **a braking-heavy stint leaves the fronts more worn than the rears** — case 593–601.
  - 598–598: `assert.ok(c.tyreWearF > c.tyreWearR)`.
  - 600–600: `assert.ok(Math.abs(mean - c.tyreWear) < 1e-9)`.
- **worn fronts cost front grip and leave the rear alone — that is the point** — case 603–615.
  - 608–608: `assert.ok(ax.f < 1)`.
  - 609–609: `assert.ok(ax.r > 1)`.
  - 613–613: `assert.equal(s.axleSplit(c).f, 1)`.
  - 614–614: `assert.equal(s.axleSplit(c).r, 1)`.
- **update() is exactly the public step chain — the scratch refactor moved no bit** — case 620–640.
  - 629–629: `assert.equal(c.tyreTs, t[0])`.
  - 629–629: `assert.equal(c.tyreTb, t[1])`.
  - 630–630: `assert.equal(c.tyreGrain, T.stepGrain(0.1, { ts: t[0], life, slide: 0.4, dt }))`.
  - 631–631: `assert.equal(c.tyreBlister, T.stepBlister(0.05, { tb: t[1], life, dt }))`.
  - 633–633: `assert.ok(c.tyreWear > 0)`.
  - 634–634: `assert.equal(c.tyreWearF, c.tyreWear * sh[0])`.
  - 634–634: `assert.equal(c.tyreWearR, c.tyreWear * sh[1])`.
  - 636–636: `assert.equal(ax0.f, 1)`.
  - 636–636: `assert.equal(ax0.r, 1)`.
  - 638–638: `assert.ok(a.f < 1 && a.r > 1)`.
  - 639–639: `assert.equal(s.axleSplit(c), a)`.
- **OFF: the axle split is exactly 1/1, and a stop resets both axles** — case 642–651.
  - 646–646: `assert.equal(s.axleSplit(c).f, 1)`.
  - 647–647: `assert.equal(s.axleSplit(c).r, 1)`.
  - 649–649: `assert.equal(c.tyreWearF, 0)`.
  - 650–650: `assert.equal(c.tyreWearR, 0)`.
- **every set fitted opens a stint, and the previous one closes at that lap** — case 655–672.
  - 669–669: `assert.deepEqual([...st.map((e) => e.code)], ["M", "M", "H"])`.
  - 670–670: `assert.deepEqual([...st.map((e) => e.laps)], [8, 7, 5])`.
  - 671–671: `assert.equal(st.reduce((n, e) => n + e.laps, 0), 20)`.
- **the set the car is ON runs to the current lap, with no end recorded yet** — case 674–680.
  - 678–678: `assert.equal(s.stints(c)[0].laps, 6)`.
  - 679–679: `assert.equal(c.tyreLog[0].lap1, null)`.
- **closeStints ends the last stint where the CAR stopped, not where the leader is** — case 682–690.
  - 688–688: `assert.equal(s.stints(c)[0].lap1, 3)`.
  - 689–689: `assert.equal(s.stints(c)[0].laps, 3)`.
- **closeStints is idempotent, and a car that never ran has an empty strip** — case 692–698.
  - 696–696: `assert.equal(s.stints(c)[0].lap1, 4)`.
  - 697–697: `assert.deepEqual([...s.stints({})], [])`.
- **a tidy lap is materially cheaper than a scrappy one** — case 702–710.
  - 707–707: `assert.ok(scrappy > tidy * 1.5)`.
  - 709–709: `assert.ok(off > tidy)`.
- **a mid-rated AI driver scores ~1.0 — the scale everything else is read against** — case 712–726.
  - 723–723: `assert.ok(mid > 0.85 && mid < 1.25)`.
  - 725–725: `assert.ok(T.aiLoad({ consistency: 0.4, accSm: 2 }, 7) > T.aiLoad({ consistency: 1, accSm: 2 }, 7))`.
- **every tyre row carries a life inside the model's clamp** — case 730–737.
  - 735–736: `assert.deepEqual(bad, [])`.
- **life trends against grip across the catalog** — case 739–752.
  - 751–751: `assert.ok(slope < -0.5)`.
- **the life spread is a real strategy range at a real race distance** — case 754–766.
  - 762–762: `assert.ok(longest >= laps)`.
  - 763–763: `assert.ok(shortest < laps / 2)`.
  - 764–765: `assert.ok(longest / shortest > 2 && longest / shortest < 4)`.
- **a signature compound lasts exactly as long as the row it reskins** — case 768–775.
  - 774–774: `assert.deepEqual(drift, [])`.
- **optionRecord reads a catalog row, classRecord an AI draw, and both agree in shape** — case 777–787.
  - 781–781: `assert.ok(k in fromRow && k in fromClass)`.
  - 783–784: `assert.equal(fromRow.off, 0)`.
  - 785–785: `assert.equal(T.optionRecord(TYRES.find((o) => o.id === "wet_full")).code, "W")`.
  - 786–786: `assert.equal(T.optionRecord(TYRES.find((o) => o.id === "intermediate")).code, "I")`.
- **the SHIPPED default turns the pit feature on** — case 789–811.
  - 802–802: `assert.ok(m)`.
  - 803–803: `assert.ok(T.isLevel(m[1]))`.
  - 804–805: `assert.notEqual(m[1], "off")`.
  - 809–809: `assert.ok(f)`.
  - 810–810: `assert.equal(f[1], m[1])`.
- **a mid-grid AI on a clean lap scores about one, like the player's path** — case 822–836.
  - 829–829: `assert.ok(load > 0.85 && load < 1.05)`.
  - 833–833: `assert.ok(ragged > load && load > tidy)`.
  - 835–835: `assert.ok(T.aiLoad({ consistency: 0.75, accSm: 0, offroad: true }, aTop) > ragged)`.
- **every catalog compound prints the letter its life says** — case 845–864.
  - 858–859: `assert.equal(rec.code, want)`.
  - 863–863: `assert.ok(seen.includes(id))`.
- **the AI's compound classes agree with the same classifier** — case 866–871.
  - 869–870: `assert.equal(T.codeForLife(cls.life, cls.tread), cls.code)`.
- **the TYRE WEAR setting reaches the live model, not just the store** — case 873–885.
  - 880–880: `assert.ok(setter)`.
  - 881–882: `assert.match(setter[0], /tyres\.setLevel\(/)`.
  - 884–884: `assert.match(setter[0], /isTimeTrial\(\) \? "off" : v/)`.
- **TyreModel.create seeds level from G.raceTyreWear (cold-boot sync)** — case 887–911.
  - 895–895: `assert.equal(real.level(), "real")`.
  - 896–896: `assert.equal(real.on(), true)`.
  - 897–898: `assert.ok(real.planLaps(0.74, 53) < 53)`.
  - 901–901: `assert.equal(light.level(), "light")`.
  - 902–903: `assert.ok(light.planLaps(0.74, 53) > real.planLaps(0.74, 53))`.
  - 906–906: `assert.equal(off.level(), "off")`.
  - 907–907: `assert.equal(off.planLaps(0.74, 53), 53)`.
  - 910–910: `assert.equal(missing.level(), "off")`.
- **every circuit def declares tyreSeverity in [0.4, 2.0] and the seven P5 anchors hold** — case 913–934.
  - 922–922: `assert.equal(files.length, 52)`.
  - 926–926: `assert.ok(m)`.
  - 928–928: `assert.ok(v >= 0.4 && v <= 2.0)`.
  - 931–931: `assert.equal(v, anchors[id])`.
- **severity default is 1.0 for circuits without authored data** — case 936–939.
  - 937–937: `assert.equal(ctxFor({ severity: null }).severity(), 1.0)`.
  - 938–938: `assert.equal(T.SEVERITY_DEFAULT ?? 1.0, 1.0)`.
- **sliding heats the surface faster than a clean rolling load (slip × force)** — case 941–951.
  - 950–950: `assert.ok(scrub[0] > clean[0])`.
- **pathological NaN dt must not poison tyre temps (clamp alone is not enough)** — case 953–964.
  - 961–961: `assert.ok(Number.isFinite(t[0]) && Number.isFinite(t[1]))`.
  - 962–962: `assert.equal(t[0], 95)`.
  - 963–963: `assert.equal(t[1], 90)`.
- **cooling sinks toward ambient and a warmer track surface** — case 966–983.
  - 981–981: `assert.ok(onHotTrack > onColdTrack)`.
  - 982–982: `assert.ok(onColdTrack < 120)`.
- **wear rises with slip speed at the same load (load × slip)** — case 985–992.
  - 990–991: `assert.ok(slide.tyreWear > roll.tyreWear)`.
- **tempGrip peaks near optTemp and falls either side** — case 994–1000.
  - 997–997: `assert.equal(T.tempGrip(opt, life), 1)`.
  - 998–998: `assert.ok(T.tempGrip(opt - 50, life) < 1)`.
  - 999–999: `assert.ok(T.tempGrip(opt + 50, life) < 1)`.
- **info() reports trackTemp above ambient in the dry** — case 1002–1007.
  - 1006–1006: `assert.ok(info.trackTemp > info.ambient)`.
- **belowWindow preserves info's rounding, missing-state and non-finite behavior** — case 1009–1031.
  - 1027–1027: `assert.equal(s.belowWindow(c), expected)`.
  - 1028–1028: `assert.deepEqual(c, before)`.
- **NaN / Infinity in any load input never poisons the wear, temperature or grip state** — case 1037–1064.
  - 1053–1053: `assert.ok(Number.isFinite(c[k]))`.
  - 1055–1055: `assert.ok(c.tyreWear >= last)`.
  - 1059–1059: `assert.ok(Number.isFinite(g) && Number.isFinite(a.f) && Number.isFinite(a.r))`.
- **non-finite inputs read as the neutral value, finite ones are untouched** — case 1066–1077.
  - 1073–1073: `assert.equal(run({ consistency: NaN }), run({ consistency: 0.75 }))`.
  - 1074–1074: `assert.equal(run({ consistency: undefined }), run({ consistency: 0.75 }))`.
  - 1075–1075: `assert.equal(run({ accSm: NaN }), run({ accSm: 0 }))`.
  - 1076–1076: `assert.ok(run({ consistency: 0.2 }) > run({ consistency: 0.9 }))`.
- **STORM reads rain's ambient and track temperature, fixed or under an arc** — case 1083–1096.
  - 1088–1088: `assert.deepEqual(at("storm"), at("rain"))`.
  - 1089–1089: `assert.notDeepEqual(at("storm"), at("dry"))`.
  - 1091–1091: `assert.deepEqual(at("dry", { from: "dry", to: "storm", t, dur: 90 }), at("dry", { from: "dry", to: "rain", t, dur: 90 }))`.
  - 1093–1093: `assert.equal(T.wetness("storm", null), T.wetness("rain", null))`.
  - 1094–1094: `assert.equal(T.treadFor("storm"), T.treadFor("rain"))`.
  - 1095–1095: `assert.equal(T.asRain("storm"), "rain")`.
- **AQUAPLANING: exactly 1 below standing water, and the onset orders slick < inter < full wet** — case 1099–1120.
  - 1101–1101: `assert.equal(T.aquaplane(v, w, tr), 1)`.
  - 1106–1106: `assert.ok(s < i && i < f)`.
  - 1107–1107: `assert.ok(s * 3.6 > 83)`.
  - 1108–1108: `assert.ok(f * 3.6 > 260)`.
  - 1113–1113: `assert.ok(m > 0 && m <= 1 && m <= prev)`.
  - 1114–1114: `assert.ok(prev - m < 0.06)`.
  - 1117–1117: `assert.ok(T.aquaplane(60, 1, 0) < T.aquaplane(60, 0.85, 0))`.
  - 1118–1118: `assert.equal(T.aquaplane(-60, 1, 0), T.aquaplane(60, 1, 0))`.
  - 1119–1119: `assert.equal(T.aquaplane(NaN, 1, 0), 1)`.
- **AQUAPLANING: the AI's lift speed sits just past onset, ordered by tread, and never binds on a damp road** — case 1122–1133.
  - 1124–1124: `assert.ok(sv[0] < sv[1] && sv[1] < sv[2])`.
  - 1126–1126: `assert.ok(sv[tr] > T.AQUA_ONSET[tr])`.
  - 1127–1127: `assert.ok(Math.abs(T.aquaplane(sv[tr], 1, tr) - 0.9) < 1e-9)`.
  - 1129–1129: `assert.equal(T.aquaplaneSafeV(0.6, 0), Infinity)`.
  - 1131–1131: `assert.equal(a, T.aquaplane(70, 1, T.treadFor("rain", 1)))`.
  - 1132–1132: `assert.equal(T.aquaInto({ tread: 0 }, 70, "rain", 1).mul, T.aquaplane(70, 1, 0))`.
- **red-flag scoring rewinds preserve physical set age and refits reset it** — case 1136–1156.
  - 1144–1144: `assert.equal(s.info(c).lapsOn, before.lapsOn)`.
  - 1145–1145: `assert.equal(s.lapsLeft(c), lifeBefore)`.
  - 1146–1146: `assert.equal(c.tyreWear, 0.5)`.
  - 1149–1149: `assert.equal(s.info(c).lapsOn, 0)`.
  - 1151–1151: `assert.equal(s.info(c).lapsOn, 1)`.
  - 1155–1155: `assert.equal(s.info(grid).lapsOn, 0)`.
- **physical tyre clock preserves public historical/network age baseline overrides** — case 1159–1172.
  - 1163–1163: `assert.equal(s.lapsOn(c), 0)`.
  - 1165–1165: `assert.equal(s.lapsOn(c), 4)`.
  - 1167–1167: `assert.equal(s.lapsOn(c), 4)`.
  - 1169–1169: `assert.equal(s.lapsOn(c), 0)`.
  - 1171–1171: `assert.equal(s.lapsOn(c), 1)`.
- **R1: ambient and track temperature are continuous across a local shower's end** — case 1178–1197.
  - 1186–1186: `assert.ok(Math.abs(aAfter - aBefore) < 1)`.
  - 1187–1187: `assert.ok(Math.abs(tAfter - tBefore) < 1)`.
  - 1192–1192: `assert.ok(Math.abs(now - prev) < 2)`.
  - 1196–1196: `assert.equal(temps(cell.life - 1, false)[1], temps(cell.life, false)[1] + 0)`.
- **lapsOn: a stop in a box BEFORE the line is not a lap old at the next crossing** — case 1199–1221.
  - 1206–1206: `assert.equal(s.lapsOn(after), 1)`.
  - 1211–1211: `assert.equal(s.lapsOn(before), 0)`.
  - 1213–1213: `assert.equal(s.lapsOn(before), 1)`.
  - 1218–1218: `assert.equal(s.lapsOn(grid), 0)`.
  - 1220–1220: `assert.equal(s.lapsOn(grid), 1)`.
- **physical set age keeps pre-line pit adjustment across a red-flag scoring rewind** — case 1223–1240.
  - 1228–1228: `assert.equal(s.lapsOn(c), 0)`.
  - 1230–1230: `assert.equal(s.lapsOn(c), 0)`.
  - 1232–1232: `assert.equal(s.lapsOn(c), 1)`.
  - 1235–1235: `assert.equal(s.lapsOn(c), 1)`.
  - 1236–1236: `assert.equal(s.lapsLeft(c), remaining)`.
  - 1237–1237: `assert.equal(c.tyreWear, 0.4)`.
  - 1239–1239: `assert.equal(s.lapsOn(c), 2)`.

## tests/unit/tyre-peak-slip.test.mjs

Source SHA256: `d7015cf2664c3911bd1078a27f3a95fab15f362a3a29734a0982ac10d798a479`. Fully read lines 1–82; 4 registered case declarations. Read chunks: 1–82.

Minimal seeded VM loads mat4/PhysicsConsts/TyreModel 17–27. front uses lateralCurve default; rear passes explicit rear floor/fall/hold 29–30. Pins front peak below pi/2, representative 6–9.05 degrees, exact 801-point rear reference sweep, monotonic front rise, numerical C1 derivative <0.02 and nonoscillating positive postpeak sweep through 8. Limit: analytic curve sampling, no full chassis dynamics; DEG constant is unused.

- **front peak abscissa is below π/2 and exported util divisor unchanged** — case 32–36.
  - 33–33: `assert.equal(TM.CURVE_PEAK_X, Math.PI / 2)`.
  - 34–34: `assert.ok(TM.CURVE_PEAK_X_F > 0 && TM.CURVE_PEAK_X_F < TM.CURVE_PEAK_X)`.
  - 35–35: `assert.ok(Math.abs(front(TM.CURVE_PEAK_X_F) - 1) < 1e-6)`.
- **front peak slip angle sits in 6–9° for representative μ at the limit** — case 38–48.
  - 46–46: `assert.ok(alphaDeg >= 6 && alphaDeg <= 9.05)`.
- **rear path bit-identical to sin/plateau/fall reference across x sweep** — case 50–63.
  - 61–61: `assert.equal(rear(x), ref(x))`.
- **front curve: monotonic to peak, C¹ at peak, non-negative, no oscillation** — case 65–82.
  - 69–69: `assert.ok(samples[i] >= samples[i - 1] - 1e-9)`.
  - 70–70: `assert.ok(samples[i] >= 0)`.
  - 75–75: `assert.ok(Math.abs(dLeft) < 0.02 && Math.abs(dRight) < 0.02)`.
  - 79–79: `assert.ok(v >= 0 && v <= last + 1e-9)`.

## tests/unit/tyre-recipes-open-rim.test.mjs

Source SHA256: `e15f2b20d5e08e392ec2430320977902a9d967f77465b3c0ad364bc87af3455f`. Fully read lines 1–95; 6 registered case declarations. Read chunks: 1–95.

loadParts from `tools/car/parts-sweep.mjs` supplies Parts catalog/factory presets. Module precondition assertion 16 verifies category. geomSig 27–37 selects geometry keys plus band/nut materials. Pins resolving/distinct factory recipes, distinct signature versus equivalent, cover-description honesty, no inert vanes and open factory rims. Target `js/car/parts.js` data consumed by car-wheels. Limits: distinct JSON signatures do not establish visual distinctness or rendered geometry; empty signature category can pass some loops.

Shared/module assertion spans: 16–16 assert.ok.

- **every FACTORY_PRESETS tyre id resolves to a catalogue option** — case 39–42.
  - 41–41: `assert.equal(missing.length, 0)`.
- **each factory tyre recipe is visually distinct from every other factory tyre** — case 44–55.
  - 53–54: `assert.equal(collisions.length, 0)`.
- **each SIGNATURE tyre is distinct from its equivalent's recipe** — case 57–68.
  - 67–67: `assert.equal(bad.length, 0)`.
- **any tyre description that mentions a cover opts in with visual.cover** — case 70–79.
  - 78–78: `assert.equal(bad.length, 0)`.
- **coverVanes without cover is never left on a tyre recipe** — case 81–89.
  - 87–88: `assert.equal(bad.length, 0)`.
- **open-rim factory tyres keep cover unset (open rim stays the default)** — case 91–95.
  - 93–94: `assert.equal(coveredFactory.length, 0)`.

## tests/unit/tyre-squeal-race-vm.test.mjs

Source SHA256: `f6ed3ee96e3e150ef1874ca1d9859b69681b707e4224866920a6562e44e3c5bf`. Fully read lines 1–79; 2 registered case declarations. Read chunks: 1–79.

createGame with fake-audio-vm.cjs install; bootRaceAudio 34–45 dispatches pointer unlock, waits stub replacement, drains turns and starts real Monza race. Engine-on assertion 43 is common. pin 25–32 prevents production updates overwriting skidIntensity/wheelLock/speed. Targets `js/game.js` race audio -> GameAudio.setSkid and CarSfx lock. Scalar 0.10 has audible exact dry gain 0.016; lock raises pitch >40 with CarSfx.lock>0.5. Both cases close in finally. Limit: fake audio and pinned intensity bypass actual slip generation; proves integration scalar seam, not acoustics.

Shared/module assertion spans: 43–43 assert.equal.

- **race-normalised intensity 0.10 (onset at 0.10 rad) makes skidLevel audible** — case 47–61.
  - 55–55: `assert.equal(player.skidIntensity, 0.10)`.
  - 57–58: `assert.ok(level > 0)`.
  - 59–59: `assert.ok(Math.abs(level - 0.10 * 0.16) < 1e-9)`.
- **lock-up raises skid pitch via CarSfx.lock without game.js {lat,long}** — case 63–79.
  - 75–75: `assert.ok(sb.GameAudio.carSfx().lock > 0.5)`.
  - 76–77: `assert.ok(sb.GameAudio.skidPitch() > basePitch + 40)`.

## tests/unit/tyre-squeal-slip.test.mjs

Source SHA256: `545750ee4b7d09bec4277a035c5e8f2c40a059f982ca4504a0970d9b3d5c2d73`. Fully read lines 1–184; 5 registered case declarations. Read chunks: 1–100, 101–184.

Fixture 20–94 concatenates actual tone-model/signal/soundtrack/radio-fx/engine sources, rewrites top-level const to var for VM, fakes AudioContext/node/AudioParam/fetch decode (44.1 kHz sine sample). live Set resets on boot. Targets GameAudio.squealFromSlip, setSkid, setCarSfx and glide scheduling. Threshold 0.10 raw axes versus positive scalar intensity, monotone lat/long gain/pitch, exact scalar gain, lock pitch +50, exact release zero; 30 steady frames allocate/schedule zero and never setValueAtTime skid gain. Limit: fake parameters apply immediately, no real timing/audio signal proof; contexts are isolated but not explicitly disposed.

- **squealFromSlip is silent at or below the grip threshold** — case 96–103.
  - 98–98: `assert.equal(A.squealFromSlip(0, 0, false).gain, 0)`.
  - 99–99: `assert.equal(A.squealFromSlip(0.10, 0, false).gain, 0)`.
  - 100–100: `assert.equal(A.squealFromSlip(0, 0.09, false).gain, 0)`.
  - 101–101: `assert.equal(A.squealFromSlip(0.05, 0.05, false).gain, 0)`.
  - 102–102: `assert.ok(A.squealFromSlip(0.11, 0, false).gain > 0)`.
- **squeal gain and pitch rise monotonically with lat and long slip** — case 105–125.
  - 110–110: `assert.ok(q.gain > prevG)`.
  - 111–111: `assert.ok(q.hz > prevHz)`.
  - 117–117: `assert.ok(q.gain > prevG)`.
  - 118–118: `assert.ok(q.hz > prevHz)`.
  - 123–123: `assert.ok(both.gain > latOnly.gain)`.
  - 124–124: `assert.ok(both.hz > latOnly.hz)`.
- **setSkid follows the slip map, glides, and lands an exact 0** — case 127–148.
  - 132–132: `assert.ok(A.skidLevel() > 0)`.
  - 133–133: `assert.equal(A.skidLevel(), 0.6 * 0.16)`.
  - 135–135: `assert.ok(A.skidLevel() > 0)`.
  - 137–137: `assert.equal(A.skidLevel(), 0)`.
  - 139–139: `assert.equal(A.skidLevel(), 0)`.
  - 143–143: `assert.ok(A.skidLevel() > mid)`.
  - 145–145: `assert.ok(pitch > 760)`.
  - 147–147: `assert.equal(A.skidLevel(), 0)`.
- **scalar setSkid lifts pitch from carSfx lock without {lat,long}** — case 150–158.
  - 156–156: `assert.ok(A.skidPitch() > base + 50)`.
- **setSkid ramps via setTargetAtTime and creates no nodes per frame** — case 160–184.
  - 169–169: `assert.ok(filt)`.
  - 172–172: `assert.ok(gainNode)`.
  - 173–173: `assert.equal(gainNode.gain.lastMethod, "target")`.
  - 174–174: `assert.equal(filt.frequency.lastMethod, "target")`.
  - 178–178: `assert.equal(created, 0)`.
  - 179–179: `assert.equal(filt.frequency.sets + gainNode.gain.sets, sets0)`.
  - 182–182: `assert.ok(gainNode.gain.sets > 0 && gainNode.gain.lastMethod === "target")`.
  - 183–183: `assert.equal(gainNode.gain.snaps, 0)`.

## tests/unit/tyre-strategy-vm.test.mjs

Source SHA256: `841af5a96c8da3ffadafa71392e4b8c4116ad47510f0293fec391b28ad211393`. Fully read lines 1–397; 17 registered case declarations. Read chunks: 1–100, 101–200, 201–300, 301–397.

Shared game VM before/after 22–24 stores tyreWear real, starts real redbull/bahrain/monaco races, exercises G.tyres/G.pits and AiDrive strategy at controlled lap/wear/progress states. auditPlans 187–216 asserts planned field >5, stints sum distance, two classes where rule applies and each stint <= independently computed severity/fuel life +1.5 (title says a lap). Targets `js/race/pit-lane.js` planner/replan/pick/think/lane baseline and `js/physics/tyre-model.js` with real grid/tick. Cases pin no-stop sprint, diverse plans, fuel-neutral re-cut, single direct-rival cover, compound legality, wet tread/no needless stop, caution reach, wet advice/pins/fractional life, physical progress clocks and future fuel budgets. Additional census VM closes in finally; shared VM closes after. Temporary announce override restored; caution/wet test edits restored. Limits: grid audits and hand-set state, not full-race census or browser UI; default ordering shares one VM and races reset scenarios.

Shared/module assertion spans: 195–195 assert.ok; 198–198 assert.equal; 199–199 assert.ok; 211–211 assert.ok.

- **the plan prices the circuit: Austria's sets last half what a neutral circuit's do** — case 26–43.
  - 30–30: `assert.equal(G.tyres.level(), "real")`.
  - 32–32: `assert.ok(sev > 1.9)`.
  - 35–36: `assert.ok(Math.abs(planned - T.lifeLaps(T.AI_CLASS.hard.life, 10) / sev) < 1e-9)`.
  - 39–39: `assert.ok(p.pitPlan)`.
  - 42–42: `assert.equal(p.pitPlan.seq[0], cls)`.
- **a NO STOP plan becomes a stop when the set is going faster than planned — through the live tick** — case 45–61.
  - 53–53: `assert.match(G.pits.planInfo(p).text, /NO STOP/)`.
  - 59–59: `assert.ok(p.pitPlan.stops >= 1)`.
  - 60–60: `assert.match(G.pits.planInfo(p).text, /BOX|1-STOP|2-STOP/)`.
- **a 5-lap race at Austria is a no-stop race: the minimum life holds after severity** — case 63–72.
  - 69–69: `assert.ok(ai.length > 5)`.
  - 71–71: `assert.equal(stopping.length, 0)`.
- **the grid runs several strategies: the roll is the driver's, not the grid slot's** — case 74–80.
  - 79–79: `assert.ok(seqs.size >= 3)`.
- **an AI re-cuts its own plan from the wear it measures, quietly** — case 82–101.
  - 88–88: `assert.ok(c)`.
  - 93–93: `assert.equal(G.tyres.lapsOn(c), 4)`.
  - 96–96: `assert.ok(c.pitPlan.lapsAt[0] < before)`.
  - 97–97: `assert.equal(c.pitReplans, 1)`.
  - 98–98: `assert.equal(c.pitPlan.stints.reduce((a, v) => a + v, 0), 25)`.
  - 99–99: `assert.ok(!said.some((m) => /PLAN B/.test(m)))`.
- **an AI set wearing at the planned, fuel-adjusted rate is not re-cut** — case 103–124.
  - 118–118: `assert.equal(G.tyres.lapsOn(c), onSet)`.
  - 121–121: `assert.ok(Math.abs(c.pitPlan.loadK - 1) < 0.08)`.
  - 122–122: `assert.equal(c.pitPlan.lapsAt.join(), before.join())`.
  - 123–123: `assert.ok(T)`.
- **an alert AI covers a rival's stop from behind; a slow wall does not** — case 126–153.
  - 140–140: `assert.equal(G.pits.think(c), "")`.
  - 142–142: `assert.equal(G.pits.think(c), "cover")`.
  - 148–148: `assert.equal(G.pits.think(c), "")`.
  - 151–151: `assert.equal(G.pits.think(c), "")`.
- **AUTO never fits the letter a car owing its second dry compound has run** — case 155–166.
  - 159–159: `assert.equal(G.pits.twoCompoundApplies(), true)`.
  - 164–164: `assert.ok(next && next.code !== run)`.
- **a wet race puts the AI field on the tread the weather wants, and nobody pits for it** — case 168–180.
  - 173–173: `assert.ok(want > 0)`.
  - 175–175: `assert.ok(ai.length > 5)`.
  - 176–176: `assert.equal(c.tyre && c.tyre.tread, want)`.
  - 179–179: `assert.equal(armed.length, 0)`.
- **every AI plan covers the race, meets the two-compound rule, and no stint outlives its set by more than a lap** — case 218–220.
  - Delegates assertions to the shared helper described above.
- **the census grid's plans pass the same audit at Austria, 10 and 5 laps** — case 225–233.
  - 231–231: `assert.equal(stopping.length, 0)`.
- **an early safety car does not pull a stop onto a set that cannot reach the flag** — case 237–264.
  - 248–248: `assert.ok(c)`.
  - 256–256: `assert.equal(G.cautionLevel(), 3)`.
  - 258–258: `assert.equal(G.pits.think(c), "")`.
  - 262–262: `assert.equal(G.pits.think(c), "caution")`.
- **on the right wet tyre the stop comes from the wet's life, not the dry plan's lap** — case 266–288.
  - 273–273: `assert.ok(c)`.
  - 281–281: `assert.equal(G.pits.think(c), "")`.
  - 283–283: `assert.equal(G.pits.think(c), "plan")`.
  - 284–284: `assert.equal(c.pitNext && c.pitNext.tread, c.tyre.tread)`.
  - 286–286: `assert.equal(G.pits.think(c), "worn")`.
- **with wear on an AI runs on the tread it is fitted; with no plan it keeps the competent-field sentinel** — case 290–306.
  - 294–294: `assert.ok(c)`.
  - 295–295: `assert.equal(c.tread, c.tyre.tread)`.
  - 299–299: `assert.equal(c.tread, 0)`.
  - 300–300: `assert.ok(G.gripMult(c) < wetGrip - 0.1)`.
  - 305–305: `assert.equal(fixed.tread, null)`.
- **player wet advice uses remaining set life and keeps wet stints** — case 309–358.
  - 317–317: `assert.equal(G.tyres.lapsOn(c), 3)`.
  - 320–320: `assert.equal(G.tyres.lapsLeft(c), 3)`.
  - 322–322: `assert.ok(c.pitPlan.stops > 0)`.
  - 323–323: `assert.ok(c.pitPlan.lapsAt[0] <= 6)`.
  - 324–324: `assert.ok(c.pitPlan.seq.every(s => s === cls))`.
  - 325–325: `assert.match(G.pits.planInfo(c).text, /BOX/)`.
  - 326–326: `assert.equal(c.pitPlan.stints.reduce((a, b) => a + b, 0), 10)`.
  - 331–331: `assert.ok(G.tyres.lapsLeft(c) > 2 && G.tyres.lapsLeft(c) < 3)`.
  - 332–332: `assert.equal(G.pits.replan(c), true)`.
  - 333–333: `assert.equal(c.pitPlan.lapsAt[0], 5)`.
  - 335–335: `assert.equal(G.pits.replan(c), true)`.
  - 336–336: `assert.equal(c.pitPlan.lapsAt[0], 5)`.
  - 340–340: `assert.equal(c.pitPlan.stops, 0)`.
  - 341–341: `assert.match(G.pits.planInfo(c).text, /NO STOP/)`.
  - 342–342: `assert.equal(c.pitPlan.seq[0], cls)`.
  - 345–345: `assert.equal(c.pitPlan.stops, 2)`.
  - 346–346: `assert.ok(c.pitPlan.lapsAt[0] < c.pitPlan.lapsAt[1])`.
  - 350–350: `assert.ok(c.pitPlan.stops > 0)`.
  - 355–355: `assert.equal(G.pits.replan(c), false)`.
  - 356–356: `assert.equal(JSON.stringify(c.pitPlan), plan)`.
- **an abandoned local lane pass drops its position baseline before the next call** — case 360–371.
  - 366–366: `assert.equal(c.pitState, "none")`.
  - 367–367: `assert.equal(c.pitPos0, 0)`.
  - 370–370: `assert.equal(c.pitPos0, 1)`.
- **future player wet stints include the fuel they will carry** — case 374–397.
  - 381–381: `assert.equal(G.tyres.lapsOn(c), 3)`.
  - 389–389: `assert.ok(stops.length >= 2)`.
  - 394–395: `assert.ok(len * (1 + fuelWear * meanFuel) <= budget + 1e-8)`.

## tests/unit/ui-experience.test.mjs

Source SHA256: `39747980ffb754a2616dffe79271d580ce08b627e03cd5b65e10c1ed7d3d67b0`. Fully read lines 1–549; 22 registered case declarations. Read chunks: 1–100, 101–200, 201–300, 301–400, 401–500, 501–549.

Source `js/ui/experience.js` loaded into isolated VMs, `tests/helpers/mini-dom.mjs` supplies DOM; race-insights.js loaded for create cases. Stubs: HomeWorld/setupCam/GarageExperience/AppearanceStudio/store/TitleFx, MutationObserver, listeners, timers, gfx captures. Targets UiExperience.create/raceBrief/openPhoto/homeVariation and index.html canonical doors. Covers solo goal filtering/sync, race/TT/career/WATCH copy, persisted visit variation, camera ownership/manual-photo preservation/restore, resize debounce, software capture skip/hardware 512px cap, subject swap success/failure/supersession/navigation/race/timeout, detached-query handling, dead-home yielding (ambient/reduce), live motion selection, race-frame zero teardown and cached pane measurement. Limits: mini DOM and synthetic renderers cannot establish pixels/accessibility/real GPU performance. preview canvas replacement delegates noncanvas creation through the replaced method (latent recursion if that branch is reached). Real timers exist in some sandboxes; no explicit disposal API is exercised.

- **Home solo practice stays in sync with the coach and does not offer goals requiring rivals** — case 8–36.
  - 25–25: `assert.ok(offered.includes('lap') && offered.includes('launch'))`.
  - 26–26: `assert.ok(!offered.includes(id))`.
  - 27–27: `assert.equal(goal.value, 'lap')`.
  - 27–27: `assert.equal(opens, 1)`.
  - 28–28: `assert.equal(local.api.isPracticePick(), true)`.
  - 29–29: `assert.equal(selected, 'corner')`.
  - 30–30: `assert.equal(goal.value, 'sector')`.
  - 31–31: `assert.equal(goal.value, 'free')`.
  - 31–31: `assert.equal(selected, 'free')`.
  - 32–32: `assert.equal(dom.byId('practice-brief').hidden, false)`.
  - 34–34: `assert.equal(local.api.isPracticePick(), false)`.
  - 35–35: `assert.equal(dom.byId('practice-brief').hidden, true)`.
- **pause context reads live classification and distinguishes online practice** — case 37–43.
  - 40–40: `assert.equal(b.title, 'Monza')`.
  - 40–40: `assert.match(b.detail, /P2/)`.
  - 40–40: `assert.match(b.detail, /LAP 2 \/ 12/)`.
  - 40–40: `assert.match(b.detail, /PRACTICE/)`.
  - 40–40: `assert.match(b.detail, /RACE CONTINUES/)`.
  - 42–42: `assert.doesNotMatch(ctx.api.raceBrief(G).detail, /P2|\/ 12|ONLINE/)`.
- **pause context carries the career brief line from CareerExperience** — case 44–50.
  - 48–48: `assert.equal(local.api.raceBrief(G).objective, 'OBJECTIVE · TARGET P6 · NOW P8')`.
  - 49–49: `assert.equal(ctx.api.raceBrief(G).objective, '')`.
- **task doors retain canonical close and settings destinations** — case 51–65.
  - 53–53: `assert.match(html, new RegExp('id="'+id+'"'))`.
  - 54–54: `assert.match(html, /id="menu-explore"[\s\S]*id="mb-watch"[\s\S]*id="mb-practice"[\s\S]*id="mb-photo"[\s\S]*id="mb-garage"/)`.
  - 55–55: `assert.doesNotMatch(html, /id="menu-secondary"[\s\S]*id="mb-photo"/)`.
  - 56–56: `assert.doesNotMatch(html, /id="menu-secondary"[\s\S]*id="mb-garage"/)`.
  - 57–57: `assert.match(html, /id="mb-photo"[\s\S]*CAPTURE/)`.
  - 58–58: `assert.match(code, /function setDoorLabel/)`.
  - 59–60: `assert.match(code, /sub && sub\.parentNode/)`.
  - 61–61: `assert.doesNotMatch(code, /photoButton\.textContent\s*=/)`.
  - 62–62: `assert.match(html, /id="photo-studio"[^>]*data-esc-close="ps-close"/)`.
  - 63–63: `assert.match(code, /openSettingsPage\("strategy", "pm-pit-panel"\)/)`.
  - 64–64: `assert.match(code, /openSettingsPage\("review", "pm-session-review"\)/)`.
- **Home varies real environments and shots per visit, preserving the shot through redraws** — case 67–80.
  - 71–71: `assert.deepEqual(JSON.parse(JSON.stringify(picker.enter('auto','auto'))), {mode:'garage',shot:'hero'})`.
  - 73–73: `assert.equal(writes.length, 1)`.
  - 74–74: `assert.equal(picker.enter('auto','auto').mode, 'track')`.
  - 75–75: `assert.equal(picker.enter('garage','side').shot, 'side')`.
  - 76–76: `assert.equal(picker.enter('auto','auto').mode, 'pitlane')`.
  - 78–78: `assert.equal(reload.enter('auto','auto').mode, 'studio')`.
  - 79–79: `assert.deepEqual(writes, [1,2,3,4,5])`.
- **Invalid visit metadata is bounded; a fixed Home camera survives changing environments** — case 82–86.
  - 84–84: `assert.equal(picker.enter('track','front').shot, 'front')`.
  - 85–85: `assert.equal(picker.enter('night','front').shot, 'front')`.
- **an unready outdoor Photo request retains its caller instead of acquiring a garage camera** — case 88–94.
  - 92–92: `assert.equal(ctx.api.openPhoto(G,deps), false)`.
  - 93–93: `assert.equal(opened, 0)`.
  - 93–93: `assert.equal(waiting, 1)`.
  - 93–93: `assert.equal(settings.hidden, false)`.
  - 93–93: `assert.equal(pause.hidden, false)`.
  - 93–93: `assert.equal(G.paused, false)`.
- **Photo retains the selected mixed environment after Settings covers Home, then the next Home visit advances once** — case 96–103.
  - 99–99: `assert.deepEqual(JSON.parse(JSON.stringify(picker.enter('auto','auto',true))), JSON.parse(JSON.stringify(original)))`.
  - 100–100: `assert.equal(writes, 1)`.
  - 101–101: `assert.equal(picker.enter('auto','auto').mode, 'track')`.
  - 101–101: `assert.equal(writes, 2)`.
  - 102–102: `assert.equal(writes, 2)`.
- **Home Photo keeps its manual camera through resize and temporary hiding, then releases it on DONE** — case 105–141.
  - 129–129: `assert.deepEqual(current, { shot: 'manual-top-orbit', dist: 4.6 })`.
  - 130–130: `assert.equal(ui.renderHome(1 / 60), false)`.
  - 132–132: `assert.deepEqual(current, { shot: 'manual-top-orbit', dist: 4.6 })`.
  - 135–135: `assert.deepEqual(current, { shot: 'manual-top-orbit', dist: 4.6 })`.
  - 137–137: `assert.equal(current.shot, 'hero')`.
  - 139–139: `assert.equal(current.shot, 'hero')`.
  - 140–140: `assert.deepEqual(current, { shot: 'garage-before-Home', dist: 8 })`.
- **narrow resize does not stopHome/beginHome; debounced settle only calls gfx.resize** — case 143–187.
  - 144–144: `assert.match(code, /const sig = s\.mode \+ ":" \+ s\.shot \+ ":" \+ motion \+ ":" \+ photoOpen;/)`.
  - 145–145: `assert.doesNotMatch(code, /const sig = [^;\n]*innerWidth/)`.
  - 146–146: `assert.match(code, /HOME_RESIZE_MS/)`.
  - 147–147: `assert.match(code, /viewKey\s*=\s*String\(homeViewGen\)/)`.
  - 174–174: `assert.equal(begins, 1)`.
  - 177–177: `assert.equal(begins, 1)`.
  - 178–178: `assert.equal(ends, 0)`.
  - 179–179: `assert.equal(dom.byId('overlay').dataset.homeReady, '1')`.
  - 180–180: `assert.ok(listeners.resize && listeners.resize.length)`.
  - 182–182: `assert.equal(resizes, 0)`.
  - 183–183: `assert.equal(timers.length, 1)`.
  - 185–185: `assert.equal(resizes, 1)`.
  - 186–186: `assert.equal(begins, 1)`.
- **previewScene skips software GL and downscales capture edges** — case 189–258.
  - 190–190: `assert.match(code, /previewSoftGfx/)`.
  - 191–191: `assert.match(code, /PREVIEW_MAX_EDGE\s*=\s*512/)`.
  - 192–192: `assert.doesNotMatch(code, /previewKey\s*=\s*\[[^\]]*innerWidth/)`.
  - 225–225: `assert.equal(begins, 0)`.
  - 226–226: `assert.equal(frames.length, 0)`.
  - 255–255: `assert.equal(begins, 1)`.
  - 256–256: `assert.equal(frames.length, 1)`.
  - 257–257: `assert.match(frames[0], /512x384/)`.
- **a Home Photo SUBJECT pick restores and reopens after an owned preparation failure; DONE restores** — case 260–283.
  - 268–268: `assert.equal(ctx.api.openPhoto(G,deps), true)`.
  - 269–269: `assert.equal(typeof opened.subject, 'function')`.
  - 270–270: `assert.equal(settings.hidden, true)`.
  - 271–271: `assert.equal(await opened.subject('circuit'), true)`.
  - 272–272: `assert.deepEqual(log, ['open:home','close:false','subject:circuit','reopen'])`.
  - 273–273: `assert.equal(settings.hidden, false)`.
  - 275–275: `assert.equal(await opened.subject('garage'), true)`.
  - 276–276: `assert.deepEqual(log, ['close:false','subject:garage','subject:null','reopen'])`.
  - 278–278: `assert.deepEqual(log, ['done'])`.
  - 279–279: `assert.equal(settings.hidden, false)`.
  - 281–281: `assert.equal(ctx.api.openPhoto(G,race), true)`.
  - 282–282: `assert.equal(opened.subject, null)`.
- **a Home Photo swap completion cannot reopen over a race** — case 285–296.
  - 294–294: `assert.equal(await pending, false)`.
  - 295–295: `assert.equal(reopens, 0)`.
- **photoSubject lays a scene over the stored one for the visit only, resolves on the rendered swap, and never writes the store** — case 298–360.
  - 317–317: `assert.equal(ui.state().scene.mode, 'garage')`.
  - 319–319: `assert.equal(overlay.dataset.homeReady, '1')`.
  - 321–321: `assert.equal(ui.state().scene.mode, 'track')`.
  - 322–322: `assert.equal(overlay.dataset.homeReady, undefined)`.
  - 323–323: `assert.equal(dom.byId('mb-photo').textContent, 'SCENE LOADING…')`.
  - 325–325: `assert.equal(ui.state().scene.mode, 'track')`.
  - 327–327: `assert.equal(await swap, true)`.
  - 328–328: `assert.equal(dom.byId('mb-photo').textContent, 'PHOTO STUDIO')`.
  - 330–330: `assert.equal(ui.state().scene.mode, 'garage')`.
  - 331–331: `assert.deepEqual(writes.filter(([k]) => k === 'homeScene'), [])`.
  - 339–339: `assert.equal(await first, false)`.
  - 339–339: `assert.equal(await second, true)`.
  - 342–342: `assert.equal(ui.state().scene.mode, 'garage')`.
  - 346–346: `assert.equal(await navigation, false)`.
  - 347–347: `assert.equal(ui.state().scene.mode, 'garage')`.
  - 349–349: `assert.equal(await subpage, false)`.
  - 351–351: `assert.equal(await racing, false)`.
  - 352–352: `assert.equal(ui.state().scene.mode, 'garage')`.
  - 353–353: `assert.equal(reopens, 0)`.
  - 357–357: `assert.equal(await timeout, true)`.
  - 358–358: `assert.equal(reopens, 1)`.
  - 359–359: `assert.equal(ui.state().scene.mode, 'garage')`.
- **Home stamp survives game-vm's detached querySelector stub** — case 362–378.
  - 376–376: `assert.doesNotThrow(() => local.api.create(G, { trackReady: () => true }))`.
  - 377–377: `assert.equal(btn.textContent, "PHOTO STUDIO")`.
- **renderHome yields the game loop when setupCam Home ended out-of-band** — case 380–406.
  - 402–402: `assert.equal(ui.renderHome(1 / 24), true)`.
  - 403–403: `assert.equal(begins, 1)`.
  - 405–405: `assert.equal(ui.renderHome(1 / 24), false)`.
- **renderHome yields under still/reduce when setupCam Home ended out-of-band** — case 408–436.
  - 432–432: `assert.equal(ui.renderHome(1 / 60), true)`.
  - 433–433: `assert.equal(ui.renderHome(1 / 60), true)`.
  - 435–435: `assert.equal(ui.renderHome(1 / 60), false)`.
- **Home ambient motion comes from AppearanceStudio, never a stale variation own-property** — case 438–441.
  - 439–439: `assert.match(code, /s\.motion = selected\.motion;/)`.
  - 440–440: `assert.doesNotMatch(code, /s\.motion = \(varied && varied\.motion\) \|\| selected\.motion;/)`.
- **PERF-4: renderHome does no per-frame teardown work while racing with Home already stopped** — case 443–477.
  - 464–464: `assert.equal(ui.renderHome(1 / 24), true)`.
  - 464–464: `assert.equal(owned, true)`.
  - 466–466: `assert.equal(ui.renderHome(1 / 60), false)`.
  - 467–467: `assert.equal(owned, false)`.
  - 471–471: `assert.equal(ui.renderHome(1 / 60), false)`.
  - 472–472: `assert.equal(removed, 0)`.
  - 473–473: `assert.equal(scenes, 0)`.
  - 474–474: `assert.equal(ends, 0)`.
  - 476–476: `assert.equal(ui.renderHome(1 / 24), true)`.
- **track Home measures the menu pane once per scene/viewport key, not every title frame (bug-hunt 2 P8)** — case 479–500.
  - 498–498: `assert.ok(begun > 0)`.
  - 499–499: `assert.ok(rects <= 1 && panes <= 1)`.
- **paused WATCH and HIGHLIGHTS describe the replay and followed driver without a driving objective** — case 503–518.
  - 509–509: `assert.match(brief.detail, /WATCH/)`.
  - 510–510: `assert.match(brief.detail, /FOLLOWING LEC/)`.
  - 511–511: `assert.doesNotMatch(brief.detail, /RACE|P1/)`.
  - 512–512: `assert.equal(brief.objective || '', '')`.
  - 515–515: `assert.match(brief.detail, /HIGHLIGHTS/)`.
  - 517–517: `assert.match(local.api.raceBrief(G).detail, /RACE · P1/)`.
- **WATCH pause omits driving strategy copy and restores the strategy door for a live race** — case 521–549.
  - 542–542: `assert.equal(dom.byId('pm-strategy').hidden, true)`.
  - 543–543: `assert.equal(dom.byId('pm-strategy').disabled, true)`.
  - 544–544: `assert.doesNotMatch(Array.from(dom.byId('pm-race-context').children, el => el.textContent).join(' '), /AUTO|pit loss|RACE · P1/)`.
  - 546–546: `assert.equal(dom.byId('pm-strategy').hidden, false)`.
  - 547–547: `assert.equal(dom.byId('pm-strategy').disabled, false)`.
  - 548–548: `assert.match(Array.from(dom.byId('pm-race-context').children, el => el.textContent).join(' '), /AUTO will fit/)`.

## tests/unit/ui-explorer-core.test.mjs

Source SHA256: `fcc3a0095063eb45b510f7c8caa828653171c846c1b2af8af915e7dc64506b7a`. Fully read lines 1–231; 15 registered case declarations. Read chunks: 1–100, 101–200, 201–231.

Imports pure `tools/ui/explorer/core.mjs.` Fixture scenario/checkpoint/snapshot 5–11 models 844x390 controls. Targets validateScenario/stateKey/addGraphStep/minimizeActions/catalogCoverage. Pins declarative normalized detached inputs, rejects executable/unbounded shapes and nonfinite values, state normalization vs interaction differences, graph 256-node/1024-edge atomic bounds, ddmin order/isolation/baseline/error/budget/empty behavior (1-minimal only), shared-root subview coverage and key identity. Limits: pure data and injected replay callbacks, no browser execution or actual explorer capture.

- **validates and normalizes every bounded replay action without executing data** — case 13–29.
  - 23–23: `assert.equal(normalized.version, 1)`.
  - 24–24: `assert.equal(normalized.actions[0].exact, true)`.
  - 25–25: `assert.equal(normalized.actions[9].state, 'visible')`.
  - 27–27: `assert.deepEqual(source.actions[11].cameras, ['orbit'])`.
  - 28–28: `assert.equal(source.actions[0].exact, undefined)`.
- **rejects unsafe identifiers, executable shapes, ambiguous locators and unbounded actions** — case 31–63.
  - 62–62: `assert.throws(() => validateScenario(input), TypeError)`.
- **normalizes declarative oracles and refuses arbitrary code or regex objects** — case 65–79.
  - 72–72: `assert.equal(validateScenario({ ...scenario([]), oracle }).oracle.type, oracle.type)`.
  - 73–73: `assert.equal(validateScenario({ ...scenario([]), oracle: oracles[0] }).oracle.state, 'visible')`.
  - 78–78: `assert.throws(() => validateScenario({ ...scenario([]), oracle }), TypeError)`.
- **binding replay assertions accept finite data and reject executable or unknown fields** — case 81–87.
  - 84–84: `assert.deepEqual(result.actions[0].oracle, oracle)`.
  - 86–86: `assert.throws(() => validateScenario(scenario([{ type: 'assert', oracle: bad }])), TypeError)`.
- **state signature ignores timers, logs and source ordering but preserves interaction states** — case 89–103.
  - 98–98: `assert.equal(stateKey(first), stateKey(later))`.
  - 99–99: `assert.notEqual(stateKey(first), stateKey({ ...later, dialogs: [{ role: 'dialog', name: 'Settings' }] }))`.
  - 100–100: `assert.notEqual(stateKey(first), stateKey({ ...later, viewport: { width: 390, height: 844 } }))`.
  - 101–101: `assert.notEqual(stateKey(first), stateKey({ ...later, controls: later.controls.map(c => ({ ...c, disabled: true })) }))`.
  - 102–102: `assert.throws(() => stateKey(snapshot({ controls: [{ value: Infinity }] })), /finite/)`.
- **atlas reuses deterministic nodes and edges, records different actions and does not split on time** — case 105–121.
  - 111–111: `assert.equal(graph.nodes.length, 2)`.
  - 112–112: `assert.equal(graph.edges.length, 1)`.
  - 113–113: `assert.deepEqual(addGraphStep(other, before, after, click), edge)`.
  - 115–115: `assert.equal(graph.edges.length, 2)`.
  - 116–116: `assert.equal(graph.nodes.length, 2)`.
  - 117–117: `assert.equal('time' in graph.nodes[0].snapshot, false)`.
  - 120–120: `assert.equal(self.nodes.length, 1)`.
- **atlas capacity is atomic: rejected steps leave the existing graph untouched** — case 123–134.
  - 128–128: `assert.throws(() => addGraphStep(graph, base, snapshot({ roots: ['overflow'] }), checkpoint('visit')), RangeError)`.
  - 129–129: `assert.deepEqual(graph, original)`.
  - 132–132: `assert.throws(() => addGraphStep(edgeFull, base, base, checkpoint('overflow')), RangeError)`.
  - 133–133: `assert.equal(edgeFull.edges.length, 1024)`.
- **ddmin removes chunks, preserves order, checks baseline first and isolates caller mutation** — case 136–152.
  - 145–145: `assert.deepEqual(seen[0], actions.map(a => a.label))`.
  - 146–146: `assert(seen.some(labels => labels.length === 4))`.
  - 147–147: `assert.deepEqual(result.actions.map(a => a.label), ['setup', 'trigger'])`.
  - 148–148: `assert.equal(result.reproduced, true)`.
  - 149–149: `assert.equal(result.complete, true)`.
  - 150–150: `assert.equal(result.attempts, seen.length)`.
  - 151–151: `assert.equal(actions.length, 8)`.
- **ddmin handles nonmonotonic reproduction and reports 1-minimal rather than globally shortest** — case 154–162.
  - 159–159: `assert.equal(result.reproduced, true)`.
  - 160–160: `assert.equal(result.complete, true)`.
  - 161–161: `assert.equal(result.actions.length, 4)`.
- **false baseline and baseline replay errors do not claim reproduction** — case 164–173.
  - 168–168: `assert.deepEqual(absent, { actions, attempts: 1, reproduced: false, complete: false, reason: 'baseline-not-reproduced' })`.
  - 169–169: `assert.equal(attempts, 1)`.
  - 171–171: `assert.equal(failed.reproduced, false)`.
  - 172–172: `assert.equal(failed.reason, 'baseline-replay-error')`.
- **candidate replay errors are unresolved, never a reproduced bug or a complete proof** — case 175–185.
  - 181–181: `assert.deepEqual(result.actions, actions)`.
  - 182–182: `assert.equal(result.reproduced, true)`.
  - 183–183: `assert.equal(result.complete, false)`.
  - 184–184: `assert.equal(result.reason, 'candidate-replay-error')`.
- **minimizer strictly honors replay budget, including baseline and empty trial** — case 187–200.
  - 192–192: `assert.equal(callbacks, 2)`.
  - 193–193: `assert.equal(result.attempts, 2)`.
  - 194–194: `assert.equal(result.complete, false)`.
  - 195–195: `assert.equal(result.reason, 'budget-exhausted')`.
  - 196–196: `assert.equal(result.actions.length, 3)`.
  - 198–198: `assert.rejects(minimizeActions([], async () => true, { maxAttempts }), TypeError)`.
- **a bug that reproduces without actions reduces to an empty replay; invalid verdicts are errors** — case 202–207.
  - 204–204: `assert.deepEqual(result, { actions: [], attempts: 2, reproduced: true, complete: true })`.
  - 206–206: `assert.equal(invalid.reason, 'baseline-replay-error')`.
- **catalog coverage requires the observed subview for shared roots** — case 210–223.
  - 218–219: `assert.deepEqual(catalogCoverage(catalog, seen).map(c => [c.id, c.visited]), [['home', true], ['display', false], ['legacy', false], ['garage', true]])`.
  - 220–220: `assert.equal(catalogCoverage(catalog, seen)[2].basis, 'shared-root-unidentified')`.
  - 221–221: `assert.equal(catalogCoverage(catalog, [{ roots: ['other'], views: ['#display'] }])[1].visited, false)`.
  - 222–222: `assert.equal(catalogCoverage(catalog, [...seen, { roots: [{ id: 'settings' }], views: ['#display'] }])[1].visited, true)`.
- **visible subview identity survives graph normalization and changes state keys** — case 225–231.
  - 227–227: `assert.notEqual(stateKey(before), stateKey(after))`.
  - 230–230: `assert.deepEqual(graph.nodes.map(n => n.snapshot.views), [['#home'], ['#display']])`.

## tests/unit/ui-explorer-report.test.mjs

Source SHA256: `a91297f6fce543b3f0abe7f7ec0babb29ea1bcb0a84a86dde4663fa3f0626b72`. Fully read lines 1–178; 11 registered case declarations. Read chunks: 1–100, 101–178.

Fixture 8–20 is partial missions bundle with screenshot/aria/repro, error, finding and graph. Targets `tools/ui/explorer/report.mjs` renderReport/writeReport/missingEvidence. Pins all eight truthful capability statuses, escaped text/encoded local evidence, inert JSON data download, path-traversal/protocol rejection, shell quoting including substitutions, archive links, script-free native controls, faithful HTML/JSON and input nonmutation, missing file inventory. Filesystem cases remove in finally; missingEvidence uses os tmpdir rather than artifacts. Limit: string/file assertions and a shell argument roundtrip, no browser rendering, CSP or full hostile-input proof.

- **offline report presents partial coverage and all eight capabilities truthfully** — case 22–32.
  - 24–24: `assert.equal((html.match(/class="capability"/g) ?? []).length, 8)`.
  - 25–25: `assert.match(html, /Race launch was not reached/)`.
  - 26–26: `assert.match(html, /This capability was not included in this run/)`.
  - 27–27: `assert.match(html, /No observations recorded\. This is not evidence of a pass/)`.
  - 28–28: `assert.match(html, /No real GPU/)`.
  - 29–29: `assert.match(html, /class="badge partial"/)`.
  - 30–30: `assert.match(html, /<strong>7<\/strong>not run/)`.
  - 31–31: `assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|fetch\(/)`.
- **linked evidence includes screenshot, console error, graph and action history** — case 34–45.
  - 36–36: `assert.match(html, /src="shots\/garage%20wide.png"/)`.
  - 37–37: `assert.match(html, /href="aria\/garage.txt"/)`.
  - 38–38: `assert.match(html, /Console \/ page errors \(1\)/)`.
  - 39–39: `assert.match(html, /Missing texture/)`.
  - 40–40: `assert.match(html, /Action history/)`.
  - 41–41: `assert.match(html, /href="#state-1">Garage/)`.
  - 42–42: `assert.match(html, /href="#record-0-0">Open captured state/)`.
  - 43–43: `assert.match(html, /href="#record-0-0">View observation/)`.
  - 44–44: `assert.match(html, /node tools\/ui\/explorer.mjs replay/)`.
- **untrusted strings cannot close script, title or attributes** — case 47–63.
  - 57–57: `assert.doesNotMatch(html, /<script\b/)`.
  - 58–58: `assert.doesNotMatch(html, /<img src=x|<title><\/script>/)`.
  - 59–59: `assert.match(html, /&lt;img src=x onerror=&quot;bad&quot;&gt;/)`.
  - 61–61: `assert.doesNotMatch(embedded, /[<>&\u2028\u2029]/)`.
  - 62–62: `assert.deepEqual(JSON.parse(decodeURIComponent(embedded)), bundle)`.
- **unsafe or escaping artifact paths never produce href, src or replay commands** — case 65–75.
  - 72–72: `assert.doesNotMatch(html, /class="shot"|Replay instructions|>trace<\/a>/)`.
  - 73–73: `assert.match(html, /No screenshot captured/)`.
- **artifact names containing HTML and shell metacharacters stay inert** — case 77–87.
  - 84–84: `assert.match(html, /src="shots\/%22%20onerror%3D%22bad.png"/)`.
  - 85–85: `assert.match(html, /replay &#39;repros\/\$\(touch nope\)'echo no'&#39;\\&#39;&#39;&quot;&lt;x&gt;.json&#39;/)`.
  - 86–86: `assert.doesNotMatch(html, /<img[^>]+ onerror=/)`.
- **missing evidence and unknown statuses never silently become successful** — case 89–99.
  - 94–94: `assert.match(html, /No screenshot captured/)`.
  - 95–95: `assert.match(html, /No linked observation/)`.
  - 96–96: `assert.match(html, /<strong>0<\/strong>passed/)`.
  - 97–97: `assert.match(html, /<strong>8<\/strong>not run/)`.
  - 98–98: `assert.doesNotMatch(html, /Open captured state/)`.
- **replay resolves local evidence under absolute output directory and shell-quotes every character** — case 101–115.
  - 112–112: `assert.equal(parsed.status, 0)`.
  - 113–113: `assert.equal(parsed.stdout, '${bundle.meta.outputDir}/evidence/garage's settings.json')`.
  - 114–114: `assert.match(parsed.stdout, /\$\(printf INJECTED\)'printf BAD'/)`.
- **archived run links accept relative evidence only and escape labels** — case 117–130.
  - 126–126: `assert.match(html, /aria-label="Run history"/)`.
  - 127–127: `assert.match(html, /href="history\/first%20run\/index.html">First run &lt;unfixed&gt;/)`.
  - 128–128: `assert.match(html, /href="history\/corrected\/index.html">Corrected run/)`.
  - 129–129: `assert.doesNotMatch(html, />Bad external<|>Bad traversal</)`.
- **offline report uses native capability links and JSON downloads without dead script controls** — case 132–140.
  - 134–134: `assert.doesNotMatch(html, /<script\b|<select\b|type="search"|<button\b|\sonclick=/i)`.
  - 135–135: `assert.match(html, /aria-label="Capabilities"/)`.
  - 136–136: `assert.match(html, /href="#capability-0">First race/)`.
  - 137–137: `assert.match(html, /id="capability-0"/)`.
  - 138–138: `assert.match(html, /href="report.json" download/)`.
  - 139–139: `assert.match(html, /<details><summary>Action history/)`.
- **writeReport creates portable HTML and faithful JSON together** — case 142–157.
  - 149–149: `assert.equal(path, join(directory, 'nested', 'index.html'))`.
  - 151–151: `assert.equal(await readFile(path, 'utf8'), renderReport(stamped))`.
  - 152–152: `assert.deepEqual(JSON.parse(await readFile(join(directory, 'nested', 'report.json'), 'utf8')), stamped)`.
  - 153–153: `assert.equal(bundle.meta.outputDir, undefined)`.
- **missingEvidence names linked evidence files absent from the output directory** — case 159–178.
  - 167–167: `assert.deepEqual(missingEvidence(bundle, dir).map((m) => m.kind), ['screenshot', 'aria', 'repro'])`.
  - 168–168: `assert.equal(missingEvidence(bundle, dir)[0].path, 'shots/garage wide.png')`.
  - 173–173: `assert.deepEqual(missingEvidence(bundle, dir).map((m) => m.kind), ['repro'])`.
  - 176–176: `assert.deepEqual(missingEvidence(bundle, dir).map((m) => m.kind), ['repro'])`.

## Cleanup and interpretation findings

Keep the regression suites: they protect distinct seams (source contracts, isolated model behavior, full game VM integration and tool output). None supplies browser visual/audio/GPU evidence. Follow-up candidates are the unclosed lap-validity VMs, failure-safe cleanup for trimming/import fixtures, temporary-root convention alignment in twinned/report fixtures, unused DEG, and the title-versus-actual +1.5-lap strategy audit wording. These findings were observed statically and no cleanup edits were made. Numeric twin matching, recipe JSON distinctness, mutation title string scanning and regex workflow derivation all have explicit limits above; their passing outcomes would not prove broader equivalence.
