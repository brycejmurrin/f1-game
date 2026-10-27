# Unit tests group 03 — complete source map

Scope: all 17 exact paths in `unit-batches.json`, 4,258 source lines. 167 test declarations indexed (body-split loop expands two declarations across both smooth modes). Full bodies read; no tests or browser sessions executed. Report describes asserted contracts, not passing results. Parent owns verification.

## Read ledger

SHA-256 is over raw bytes. Inclusive ranges partition every file; no sampled file stands in for another. Initial oversized combined output was re-read in bounded chunks for its truncated middle.

| File | Lines read (inclusive) | SHA-256 |
|---|---|---|
| `tests/unit/bahrain-grandstand-rake.test.mjs` | 1–100 | `ff43ea7505c04b727ddf7fd4c39b13d05a7479db6046e209cf51c8c4a486d8b8` |
| `tests/unit/baked-model-instancing.test.mjs` | 1–134 | `f6f9666068a04a080b4be44de3adf39f6d8a457c953566c78900984d7787e47d` |
| `tests/unit/baked-model-road-guard.test.mjs` | 1–121 | `cd88b38a17d7226232bd590dc50dd3e53f6d048706be4ee45c7fa52088b9ec67` |
| `tests/unit/baku-migration.test.mjs` | 1–153 | `e61671bf9ab9fee50593b4b5fd2e4cc90ff79051ecfde141033e01092b5481a9` |
| `tests/unit/baku-night-orbit.test.mjs` | 1–39 | `8bd976756f4acc5a0d7d23bbafbef46da9433e001e02aa51f775fd8ac77b0d17` |
| `tests/unit/bank-zone-claim.test.mjs` | 1–55 | `b76e1ca653fcc637cd4da164a4ddca978cfbda8b4122a8bf7a7b9899144d8621` |
| `tests/unit/barrier-runoff-jumps.test.mjs` | 1–200, 201–217 | `fc406b66badd00f290c2c3639ca1a1f81963bd1079454c51a2054a2fe3512f7b` |
| `tests/unit/base-green.test.mjs` | 1–58 | `5575df699fd9b4098c8fec1f8f3cdd700283a9caf3008e5504d0528f83363d51` |
| `tests/unit/bash-guard-hardening.test.mjs` | 1–200, 201–400, 401–600, 601–800, 801–1000, 1001–1200, 1201–1400, 1401–1493 | `ce9f0b54be5251a48035fd2c958a5a38d2e09c63d884ebe2e14d984cefae854c` |
| `tests/unit/battle-earcon.test.mjs` | 1–173 | `d1146e5e6bf30607755f7be89fc826d1115ce3da60bf428006d08cf1bf515bb6` |
| `tests/unit/behind-ship.test.mjs` | 1–68 | `d1adadbbb1e1d62010f10cd841057162f4c1bb25f96f2ae0e7226ea506446b53` |
| `tests/unit/bench-capture.test.mjs` | 1–191 | `34e12173339db700cdaa6789b5ef5eea227cb486ba12ec49753d8caf38d46fe3` |
| `tests/unit/bench-run.test.mjs` | 1–192 | `6280374a9b3de4aad3f1a3a5dda8eeb501392cb44fe1dd3702c5822e58188ec0` |
| `tests/unit/bitmap-decode-worker.test.mjs` | 1–200, 201–350 | `1cc08a83e33b4a800c8ba1a12249fc54b90123a46333dc5c6af96d3f59c0b312` |
| `tests/unit/blip-voice-pool.test.mjs` | 1–185 | `ca542de47b90ab022494978cb637c969a8042f52a0491897be01d485f59ef502` |
| `tests/unit/body-attitude.test.mjs` | 1–200, 201–370 | `c39b0b2350deb5d61e7e57b2cc6aa8d5486d961f41be5709247699ce650fb0d0` |
| `tests/unit/body-split.test.mjs` | 1–200, 201–359 | `7603f39673a42e1477704f24b9383a3f1766b3d8715b8aa9f12f307ce8caa10f` |

## Navigation evidence

Read root AGENTS.md and `.claude/skills/code-nav/SKILL.md`. Local `tools/mcp/lsp-mcp.sh def` resolved BodyAttitude, TrackMesh.bankingProfile, BattleEarcon, BitmapDecode, GameAudioSignal, CarShade.lowerZone/upperZone, BenchRun, BenchCapture, FlybySeq.insideProp, FlybySight.transmit, TrackGraph.meshModel and TrackGeom.addMesh. References confirmed CarShade.lowerZone → Car3D.build and BodyAttitude → agent hooks. BankingProfile/meshModel were explicitly reported as module-file fallback with export/caller coverage unverified; GameAudioSignal also has an audio stub definition, excluded by these fixture loads. Tool/hook targets were read via source/import references (outside js/, as code-nav permits).

Shared helper contracts: `abs-src.mjs` gives absolute VM filenames, not runtime behavior. `git-fixture-env.mjs` removes repository-local git environment before fixture git runs. `track-build-vm.cjs` follows manifest TRACK_VM, captures mesh geometry, instruments emitters before build-props/tracks destructure them, and loads pack Assets by default unless assets:false. Stubbed GLX never uploads real GPU resources.

## bahrain-grandstand-rake.test.mjs

Production target: TrackScenery.bahrain → Tracks.build → scenery toolkit grandstandEx in js/track/scenery/nature.js:1003 (delegated by build-props.js); tools/lib/track-build-vm.cjs captures primitive bounds.

Imports/fixtures: buildContext; Bahrain actual callback wrapped to collect every stand; least-squares height/lateral slope, short primitive seating filter. Second fixture replaces callback with known fold s=.985, side +1, gap90.

Coverage, contract and comment assessment: Emitted stands need ≥40 primitives, ≥20 seating samples, slope≥.5; ≥20 authored calls; complete suppression allowed. Known failed placement must emit zero. Geometry proxy does not prove roof appearance; no comment defect identified.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L50–80: `test("bahrain grandstandEx calls keep positive seating rake (no hollow shells)", () => {`
  - `L53 assert.ok(def, "bahrain def");`
  - `L55 assert.equal(typeof orig, "function", "bahrain scenery callback");`
  - `L67 assert.ok(calls.length >= 20, 'expected many grandstandEx calls, got ${calls.length}');`
  - `L78 assert.deepEqual(bad, [], "bahrain hollow / backwards stands:\n  " + bad.join("\n  "));`
- L81–100: `test("grandstandEx suppresses a shell when seating cannot clear rejBox", () => {`
  - `L97 assert.ok(probe, "probe ran");`
  - `L98 assert.equal(probe.prims, 0,`

## baked-model-instancing.test.mjs

Production target: js/track/scenery/build-props.js:1830 bakedModel, :1885 threshold, flushModels; js/track/scenery/graph.js:333 meshModel; js/track/core/geom.js:323 addMesh.

Imports/fixtures: buildContext + actual Monza and pack manifest; injected GLX.createInstancedBatch, localStorage opt-out; host array copies avoid cross-realm prototype failures.

Coverage, contract and comment assessment: Three tests cover batch/copy partition and exact soup triangle savings, matrix expansion vs addMesh (positions1e-3/normals1e-4/colors1e-6/material exact), deterministic records/matrices and source pack checksums. Threshold read from source checks consistency rather than independently freezing policy. Pack immutability sums can miss balanced mutations.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L56–84: `test("the batch API on: repeated placements leave the soup, one-offs stay copies", () => {`
  - `L59 assert.ok(rec && Object.keys(rec).length >= 2, "no placements recorded");`
  - `L61 assert.ok(inst.length >= 1, "nothing was instanced");`
  - `L62 assert.ok(copies.length >= 1, "nothing was copied");`
  - `L63 for (const r of inst) assert.ok(r.n >= 2 && (r.n - 1) * r.verts >= MIN_SAVED, '${r.id} instanced below the saving threshold');`
  - `L64 for (const r of copies) assert.ok(r.n < 2 || (r.n - 1) * r.verts < MIN_SAVED, '${r.id} copied above the saving threshold');`
  - `L66 assert.ok(Object.values(off.modelInstances).every((r) => !r.inst), "apex26.modelInst=0 still instanced");`
  - `L67 assert.deepEqual([...Object.keys(off.modelInstances)], [...Object.keys(rec)], "the flag changed WHICH models were placed");`
  - `L70 assert.equal(off.propsGeo._hidden.trisBefore - on.propsGeo._hidden.trisBefore, saved,`
  - `L75 assert.deepEqual([...bs.map((b) => b.model)].sort(), [...inst.map((r) => "mesh:" + Object.keys(rec).find((k) => rec[k] === r))].sort());`
  - `L78 assert.equal(b.count, r.n); assert.equal(b.matrices.length, r.n * 16); assert.equal(b.colors.length, r.n * 3);`
  - `L79 assert.equal(b.geo.pos.length / 3, r.verts); assert.equal(b.geo.idx.length / 3, r.tris);`
  - `L81 assert.ok(on.meshes.propBatches.some((p) => p.geo && p.geo.idx && bs.some((b) => b.geo === p.geo)), "the mesh batches were not uploaded");`
- L85–117: `test("a batch expands to what addMesh would have copied, triangle for triangle", () => {`
  - `L96 assert.equal(ref.idx.length, b.geo.idx.length);`
  - `L104 assert.ok(Math.abs(wx - ref.pos[a]) < 1e-3 && Math.abs(wy - ref.pos[a + 1]) < 1e-3 && Math.abs(wz - ref.pos[a + 2]) < 1e-3,`
  - `L109 assert.ok(Math.abs(rx - ref.nrm[a]) < 1e-4 && Math.abs(ry - ref.nrm[a + 1]) < 1e-4 && Math.abs(rz - ref.nrm[a + 2]) < 1e-4, '${r.id}[${i}] normal ${k}');`
  - `L110 for (let q = 0; q < 3; q++) assert.ok(Math.abs(g.col[d + q] * c[q] - ref.col[a + q]) < 1e-6, '${r.id}[${i}] colour ${k}');`
  - `L111 assert.equal(g.mat[g.idx[k]], ref.mat[ref.idx[k]], '${r.id}[${i}] material ${k}');`
- L118–134: `test("the record and the batch order are deterministic; the pack's arrays are untouched", () => {`
  - `L126 assert.deepEqual(strip(a), strip(b));`
  - `L127 assert.deepEqual(meshBatches(a).map((x) => [x.model, x.count, Array.from(x.matrices)]), meshBatches(b).map((x) => [x.model, x.count, Array.from(x.matrices)]));`
  - `L128 for (const id of Object.keys(before)) { const m = Assets.modelSync(id); assert.deepEqual([sum(m.pos), sum(m.col), sum(m.idx), m.pos.length], before[id], id); }`
  - `L131 assert.ok(Object.values(c.modelInstances).every((r) => !r.inst));`
  - `L132 assert.equal(c.graph.batches().batches.filter((x) => x.model.startsWith("mesh:")).length, 0);`

## baked-model-road-guard.test.mjs

Production target: js/track/scenery/build-props.js:1830 bakedModel/rejBox; tools/lib/pack-assets.cjs parseModel/readModel; tools/lib/track-build-vm.cjs:80 pack injection.

Imports/fixtures: Explicit assets:false/true Monza builds with retained geometry; manifest all-model decoder counts; 1200 rounded racing-line samples and inferred half-width, triangle centroids in .2..5m height band.

Coverage, contract and comment assessment: Decoder model count≥30 and vertex/triangle counts; anti-vacuity geometry grows with Assets; Monza intrusion ≤.20m. Intro is stale: harness now loads Assets by default, guard moved from tracks.js to build-props.js, decoder is imported rather than local mirrored implementation. Footprint/centroid sampling does not prove all meshes or fleet overhang clearance; unused parseModel import.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L88–102: `test("the mirrored pack decoder agrees with the manifest on every model", () => {`
  - `L90 assert.ok(ids.length >= 30, 'the pack should carry its models; manifest lists ${ids.length}');`
  - `L98 assert.deepEqual(bad, [],`
- L103–113: `test("the pack is actually stamped when Assets is there — the guard is not passing vacuously", () => {`
  - `L110 assert.ok(on.verts > off.verts,`
- L114–121: `test("no baked model puts geometry over monza's racing line", () => {`
  - `L116 assert.ok(r.max <= 0.20,`

## baku-migration.test.mjs

Production target: js/circuits/baku.js, js/circuits/scenery/baku.js; Tracks.build through tools/manifest.cjs TRACK_VM.

Imports/fixtures: Custom VM with fake GLX mesh counts; load-order manifest narrowed to Baku definition and scenery; build both day/night.

Coverage, contract and comment assessment: Exact racing coordinate/exclusion rules; all geometry diagnostics okay, no required model failure, flame/maiden/forecourt/Caspian IDs emitted; both barrier sides >97% tight outside pit ownership; crest≥13.5 at .44..48; seafront trend<.05 and derived undulation envelope. Mesh renderer is stubbed; emitted IDs and diagnostics cannot prove visual quality. No comment defect identified.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L48–71: `test("Baku owns its coordinate space and protected scenery sectors", () => {`
  - `L50 assert.equal(def.sceneryCoordinates, "racing");`
  - `L51 assert.deepEqual(`
- L72–153: `test("Baku builds finite grounded landmarks, water, and full street boundaries", () => {`
  - `L76 assert.ok(track.geometryDiagnostics.every((entry) => entry.ok));`
  - `L83 assert.deepEqual(requiredFailures, []);`
  - `L86 assert.ok(emitted.has("baku-flame-towers"));`
  - `L87 assert.ok(emitted.has("baku-maiden-tower"));`
  - `L88 assert.ok(emitted.has("baku-maiden-forecourt"));`
  - `L89 assert.ok([...emitted].some((id) => id.startsWith("baku-caspian-")));`
  - `L105 assert.ok(tightFraction(track.barL, -1) > 0.97);`
  - `L106 assert.ok(tightFraction(track.barR, 1) > 0.97);`
  - `L115 assert.ok(crest >= 13.5);`
  - `L116 assert.ok(crestFrac >= 0.44 && crestFrac <= 0.48);`
  - `L141 assert.ok(trend < 0.05, 'seafront trends ${trend.toFixed(3)} m across its length');`
  - `L150 assert.ok(range <= envelope,`

## baku-night-orbit.test.mjs

Production target: js/agent/apex-cam.js orbit; js/camera/flyby-seq.js:172 insideProp; js/camera/flyby-sight.js:237 transmit; Baku exclusions/scenery.

Imports/fixtures: tools/lib/game-vm.cjs createGame({track:baku}); before/after lifecycle; three fixed Caspian fraction .8333 camera survey cells.

Coverage, contract and comment assessment: Pose must exist, eye outside solids at margin1, transmission≥.5. Despite title/night fixture labels, createGame has no explicit night option in this file: this test pins geometric sightline, not demonstrated night rendering/lighting. No browser raster evidence.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L29–39: `test("Baku Caspian night orbit sightline clears the +1 glass canyon (#3340)", () => {`
  - `L33 assert.ok(r && r.eye && r.target, '${cell.name}: orbit returned a pose');`
  - `L35 assert.equal(inside, null, '${cell.name}: eye must not sit inside a solid (${inside && inside.kind})');`
  - `L37 assert.ok(T >= 0.5, '${cell.name}: transmit T=${T} (want ≥ 0.5 so asphalt / boulevard is visible)');`

## bank-zone-claim.test.mjs

Production target: js/track/core/mesh.js:90 bankingProfile.

Imports/fixtures: abs-src VM load; 1000 nodes/10000m synthetic path, two .02-curvature left corners at .25/.75, half-width6; stub spline/geometry/space/M4.

Coverage, contract and comment assessment: On-corner10° claims first apex; loose20° zone re-seats second; first remains below15° bound; straight zero. Lone loose zone picks nearest apex and leaves other untouched. Exact production profile with synthetic curvature; no actual road mesh/banked driving test.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L38–49: `test("an on-corner frac zone claims its apex: the loose zone re-seats onto the other corner", () => {`
  - `L44 assert.ok(prof, "a profile is built");`
  - `L45 assert.ok(near(prof.lift, 0.75) > 1, "the loose zone banks corner 2 (it no longer merges onto corner 1)");`
  - `L46 assert.ok(near(prof.lift, 0.25) < 2 * 6 * Math.tan(15 * Math.PI / 180), "corner 1 keeps its own 10° zone, not the 20° one");`
  - `L47 assert.equal(near(prof.lift, 0.33), 0, "nothing is left on the straight");`
- L50–55: `test("a lone loose zone still re-seats onto its nearest apex", () => {`
  - `L53 assert.ok(near(prof.lift, 0.25) > 1);`
  - `L54 assert.equal(near(prof.lift, 0.75), 0);`

## barrier-runoff-jumps.test.mjs

Production target: tools/track/barrier-jumps.cjs numerical probes; tests/helpers/barrier-runoff-probe.cjs fleet caps; js/track/scenery/build-props.js:22 featherBarrierEnds/:60 featherAfterOpen; streetBarrier graph panels.

Imports/fixtures: Ratchets barrierRunoffJumpCaps plus immutable initial open7.9/street9.75; synthetic Float32 cliffs; cached full-fleet VM; withTrack finally trims/releases; actual Monza/Spa/Bahrain/Silverstone/Monaco and odd-node Vegas/Singapore/Baku.

Coverage, contract and comment assessment: Eleven cases pin detector sanity, over-cap rejection, lower-only caps, fleet≥50 both classes, authored ramps, feather<1.5 preserving tight face, hw-step invariance, pit-side exemption only, Monaco keep open, ≥40 opposite pit-window checks, seam panels shorter than1.5ds. Helper mirrors production feather math so synthetic success alone is weaker than actual fleet builds; no comment defect identified.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L48–55: `test("synthetic one-node cliff of 7.9 is detected as maxAdj / maxWallStep", () => {`
  - `L52 assert.ok(Math.abs(maxAdjDelta(arr) - 7.9) < 1e-5, 'maxAdj=${maxAdjDelta(arr)}');`
  - `L53 assert.ok(maxWallAtStep(arr) > 7.5, 'maxWallStep=${maxWallAtStep(arr)}');`
- L56–66: `test("fleet cap rejects a synthetic over-cap jump", () => {`
  - `L64 assert.throws(() => assertFleetCaps([row], CAPS), /synthetic-over-cap \(open\)/);`
- L67–75: `test("barrier jump caps are lower-only", () => {`
  - `L68 assert.deepEqual(Object.keys(CAPS).sort(), ["open", "street"]);`
  - `L70 assert.ok(Number.isFinite(CAPS[className]) && CAPS[className] > 0, '${className} cap must be positive');`
  - `L71 assert.ok(CAPS[className] <= INITIAL_CAPS[className],`
- L76–82: `test("fleet: every circuit, including pit edges, stays within its class cap", () => {`
  - `L78 assert.ok(rows.length >= 50, 'only ${rows.length} circuits probed');`
  - `L79 assert.deepEqual(new Set(rows.map((row) => row.className)), new Set(["open", "street"]));`
- L83–89: `test("a 3-node authored ramp stays under 3 m (helper sanity)", () => {`
  - `L86 assert.ok(maxAdjDelta(arr) < 3.0, 'feathered maxAdj=${maxAdjDelta(arr)}');`
  - `L87 assert.ok(maxWallAtStep(arr) < 3.0, 'feathered maxWallStep=${maxWallAtStep(arr)}');`
- L90–104: `test("featherBarrierEnds turns a 7.9 cliff into steps under 1.5 m (would fail before)", () => {`
  - `L98 assert.ok(maxAdjOver(arr, hw) > 7.5, "precondition: cliff present");`
  - `L100 assert.ok(maxAdjOver(arr, hw) < 1.5, 'after feather maxOver=${maxAdjOver(arr, hw)}');`
  - `L102 assert.ok(Math.abs((arr[10] - hw[10]) - 1.1) < 1e-5, 'tight face raised to ${arr[10] - hw[10]}');`
- L105–116: `test("maxAdjOver ignores a pure hw step with constant clearance", () => {`
  - `L113 assert.equal(maxAdjOver(bar, hw), 0);`
  - `L114 assert.ok(maxAdjDelta(bar) >= 2); // absolute bar still steps with hw`
- L117–153: `test("fleet: open-circuit tyre termini stay under 1.5 m after feather (Slice 2)", () => {`
  - `L142 assert.ok(maxOver < 1.5, '${id} maxOver=${maxOver} (want < 1.5, off-pit)');`
  - `L143 assert.ok(maxWall < 1.5, '${id} maxWallStep=${maxWall} (want < 1.5, off-pit)');`
  - `L150 assert.ok(over < 2.0, 'mid-stack over should be ~1.1, got ${over} at k=${kTight}');`
- L154–181: `test("monaco pit keep nodes stay open; non-pit maxOver under 1.5 m", () => {`
  - `L159 assert.ok(p && !p.painted, "monaco has a street pit complex");`
  - `L164 assert.ok(bar[k] > track.hw[k] + 2, 'keep node ${k} bar ${bar[k]} not opened');`
  - `L167 assert.ok(checked >= 5, "expected keep nodes to check");`
  - `L178 assert.ok(maxOffPit < 1.5, 'off-pit maxOver=${maxOffPit}');`
- L182–195: `test("fleet: the NON-pit side inside the pit window has no clearance step over 1.5 m (M43)", () => {`
  - `L192 assert.ok(pitRows.length >= 40, 'only ${pitRows.length} pit complexes checked');`
  - `L193 assert.deepEqual(bad, [], 'non-pit side steps >= 1.5 m inside the pit window: ${bad.join(", ")}');`
- L196–217: `test("street barrier: the last panel closes on node 0, not past it (10-F2, odd n)", () => {`
  - `L207 assert.equal(n % 2, 1, '${id} is no longer an odd-node circuit');`
  - `L212 assert.ok(nd.s[2] < 1.5 * ds, '${id} side ${m.side}: the n-1 panel is ${nd.s[2].toFixed(2)} m long (one node is ${ds.toFixed(2)}): it wraps onto node 1');`
  - `L216 assert.ok(seen >= 3, 'only ${seen} seam panels found');`

## base-green.test.mjs

Production target: tools/ci/base-green.sh.

Imports/fixtures: Temporary fake gh executable prints workflow_runs fixtures or fails; injected PATH/GITHUB_REPOSITORY/GH_TOKEN; subprocess bash.

Coverage, contract and comment assessment: Completed ci/pages success green; failed/cancelled gates red even unrelated success; missing/in-progress/error/malformed/empty/null SHA/no gh unknown and advisory exit0. Fake gh does not assert API argv or returned head_sha; exact SHA guarantee relies on production head_sha request filter. No comment defect identified.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L36–41: `test("green: a completed successful ci.yml or pages.yml run on the sha", () => {`
  - `L37 assert.equal(run(runs([".github/workflows/ci.yml", "completed", "success"])).out, "green");`
  - `L38 assert.equal(run(runs([".github/workflows/ci.yml", "completed", "failure"], [".github/workflows/pages.yml", "completed", "success"])).out, "green",`
- L42–47: `test("red: runs exist, none succeeded — including a run of another workflow succeeding", () => {`
  - `L43 assert.equal(run(runs([".github/workflows/ci.yml", "completed", "failure"])).out, "red");`
  - `L44 assert.equal(run(runs([".github/workflows/ci.yml", "completed", "cancelled"], [".github/workflows/docs-guards.yml", "completed", "success"])).out, "red",`
- L48–58: `test("unknown: no gate run yet, an in-progress one, an API error, a bad body, no sha, no gh", () => {`
  - `L49 assert.equal(run(runs()).out, "unknown");`
  - `L50 assert.equal(run(runs([".github/workflows/ci.yml", "in_progress", null])).out, "unknown");`
  - `L51 assert.equal(run(null).out, "unknown", "API failure");`
  - `L52 assert.equal(run("not json").out, "unknown");`
  - `L53 assert.equal(run(runs([".github/workflows/ci.yml", "completed", "success"]), "").out, "unknown", "empty sha");`
  - `L54 assert.equal(run(runs([".github/workflows/ci.yml", "completed", "success"]), "0000000000000000000000000000000000000000").out, "unknown", "the null sha of a first push");`
  - `L56 assert.equal(r.stdout.trim(), "unknown", "no gh on PATH");`
  - `L57 assert.equal(r.status, 0, "advisory: never a non-zero exit");`

## bash-guard-hardening.test.mjs

Production target: .claude/hooks/bash-guard.sh, shellparse.py, protect-files.sh/.py, github-mcp-guard.sh, mcp-browser-guard.sh, post-edit.sh, lsp-hint.py; .claude/settings.json; gate-receipt.mjs and merge/ready gates copied to fixture.

Imports/fixtures: FIRST git-fixture-env scrubs repository-local git env; artifacts temporary git repos, fake hook JSON and APEX_GUARD_PROBE; real hook subprocesses classify commands without executing their quoted mutations. Some fixtures execute local git init/commit/worktree and stub npm/docs guards; gate receipts hash committed copied gate files.

Coverage, contract and comment assessment: Per-case inventory below covers complete file, including shell/argv wrappers, prose false positives, dangerous push/ref/contents/kill/cancel, commit classification, timeout fail-closed, browser parent ownership, reporter writes, symlinks, receipt head/TTL/hash/committed gate, additionalContext, worktree modules, queue/live warnings, generated restore, staging simulation, post-edit advice, conflict hunks, memory stop/unmark, generic API clients, polls, help, MCP timeout/matchers, LSP hints and merge stash. Comment at THE CLOG says push hold is enforced but later retirement comment/test explicitly removes queue hold; historical opening alone should not be read as current policy. Many tests pin regex/source/settings shape as well as behavior; gate authorization network behavior is not exercised.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L56–63: `test("shellparse reports the commit inside every compound-command shape (L12)", () => {`
  - `L59 assert.notEqual(out, "[]", 'shellparse missed the commit in: ${JSON.stringify(cmd)}');`
  - `L60 assert.equal(JSON.parse(out).length, 1, cmd);`
- L64–71: `test("shellparse says 'null' (not '[]') for text it cannot tokenise, and '[]' for non-commits", () => {`
  - `L65 for (const cmd of UNPARSEABLE) assert.equal(commitJson(cmd), "null", cmd);`
  - `L67 assert.equal(commitJson(cmd), "[]", cmd);`
  - `L69 assert.equal(commitJson("cat <<EOF\ngit commit -m inside\nEOF\ngit commit -m real").match(/"all"/g).length, 1);`
- L72–98: `test("the guard SEES a commit behind compound syntax or an unparseable line, and still ignores prose", () => {`
  - `L83 assert.equal(r.status, 0, '${JSON.stringify(cmd)}: ${r.stderr}');`
  - `L84 assert.match(r.stderr, /bash-guard probe: commit/, 'the guard must SEE this commit: ${JSON.stringify(cmd)}');`
  - `L87 for (const cmd of COMPOUND) assert.match(run(cmd).stderr, /probe: commit docs-only/, cmd);`
  - `L88 for (const cmd of UNPARSEABLE) assert.match(run(cmd).stderr, /probe: commit code/, cmd);`
  - `L93 assert.equal(r.status, 0, cmd);`
  - `L94 assert.doesNotMatch(r.stderr, /probe: commit/, 'not a guarded commit: ${JSON.stringify(cmd)}');`
- L99–112: `test("the pkill guard blocks -f however the flags are spelled (M36)", () => {`
  - `L108 ]) assert.equal(run(cmd).status, 2, 'bash-guard must block: ${cmd}');`
  - `L110 assert.equal(run(cmd).status, 0, 'bash-guard must allow: ${cmd}');`
- L113–166: `test("settings.json no longer sets APEX_MERGE_DESK for everyone, and the gate receipts decide merges and ready flips (2026-10-19)", () => {`
  - `L116 assert.equal(Object.hasOwn(settings.env || {}, "APEX_MERGE_DESK"), false, "APEX_MERGE_DESK is not in the shared env");`
  - `L125 assert.match(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), /"deny".*merge-gate\.mjs --pr 1/, "no receipt, no merge, desk or not");`
  - `L126 assert.match(run("mcp__github__update_pull_request", { pullNumber: 1, draft: false }), /"deny".*ready-gate\.mjs --pr 1/, "no receipt, no ready flip");`
  - `L129 assert.equal(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), "", "a gated merge-commit merge passes silently");`
  - `L130 assert.match(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge" }), /"deny".*pin expectedHeadSha/, "the merge must pin the gated head");`
  - `L131 assert.match(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: "d".repeat(40) }), /"deny".*not the gated head/);`
  - `L132 assert.equal(run("mcp__github__update_pull_request", { pullNumber: 1, draft: false }), "", "a gated draft→ready passes silently");`
  - `L134 assert.match(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: m, expectedHeadSha: head }), /"deny".*MERGE-COMMIT-ONLY/, '${m} stays denied');`
- L167–178: `test("settings.json registers bash-guard once, without unsupported per-step filters", () => {`
  - `L173 assert.equal(hooks.length, 1, "one Bash call must start one imported Claude bash-guard");`
  - `L174 assert.equal(Object.hasOwn(hooks[0], "if"), false, "Cursor does not document Claude hook-step 'if' filters");`
  - `L175 assert.equal(hooks[0].timeout, 360);`
  - `L176 assert.equal(hooks[0].onFailure, "block");`
- L179–195: `test("bash-guard fast-exits non-trigger commands (trigger union pinned)", () => {`
  - `L182 assert.ok(trigger, "bash-guard declares its fast-path trigger union");`
  - `L184 assert.ok(words, "whole words: \\b(a|b|…)\\b (2026-10-26: the substring union matched .claude/skills, digit, evaluate)");`
  - `L187 assert.ok(words[1].split("|").includes(w), 'the fast path covers ${w}');`
  - `L192 assert.equal(r.status, 0, r.stderr);`
  - `L193 assert.equal(r.stdout, "");`
- L196–211: `test("pkill -f blocks whatever its pattern names: it always matches its own shell (#2125)", () => {`
  - `L206 ]) assert.equal(run(cmd).status, 2, 'bash-guard must block: ${cmd}');`
  - `L209 assert.equal(run(cmd).status, 0, 'bash-guard must allow: ${cmd}');`
- L212–228: `test("settings.json denies a force push or a deploy-branch push however it is spelled (M36)", () => {`
  - `L224 ]) assert.ok(denied(cmd), 'settings.json must deny: ${cmd}');`
  - `L226 assert.ok(!denied(cmd), 'settings.json must allow: ${cmd}');`
- L229–247: `test("the SCAN heredoc scanner does not swallow the line after '<<<' or an arithmetic shift (M36 pkill)", () => {`
  - `L234 assert.equal(run("read x <<< hi\npkill -f chrome").status, 2);`
  - `L235 assert.equal(run("echo $((1 << n))\npkill -f chrome").status, 2);`
  - `L236 assert.equal(run("cat <<EOF\npkill -f chrome\nEOF").status, 0, "a real heredoc body is still prose");`
- L248–259: `test("shellparse reads a commit inside a heredoc a shell runs; a plain heredoc stays prose (15-F6)", () => {`
  - `L251 assert.notEqual(out, "[]", 'shellparse missed the commit in: ${JSON.stringify(cmd)}');`
  - `L252 assert.equal(JSON.parse(out).length, 1, cmd);`
  - `L254 assert.equal(commitJson("cat <<EOF\ngit commit -m x\nEOF"), "[]");`
  - `L255 assert.equal(commitJson("python3 - <<EOF\nprint('git commit')\nEOF"), "[]");`
  - `L257 assert.equal(JSON.parse(commitJson("git commit -F - <<EOF\nthe message\nEOF")).length, 1);`
- L260–279: `test("the guard SEES a commit in a shell heredoc, even one the parser cannot tokenise (15-F6)", () => {`
  - `L271 assert.equal(r.status, 0, '${JSON.stringify(cmd)}: ${r.stderr}');`
  - `L272 assert.match(r.stderr, /bash-guard probe: commit/, 'the guard must SEE this commit: ${JSON.stringify(cmd)}');`
  - `L275 assert.doesNotMatch(run("cat <<EOF\ngit commit -m x\nEOF").stderr, /probe: commit/);`
  - `L276 assert.doesNotMatch(run("python3 - <<EOF\nprint('git commit -m x')\nEOF").stderr, /probe: commit/);`
- L280–297: `test("'cd <other tree> && git commit' guards THAT tree, not the hook's own (15-F6)", () => {`
  - `L290 assert.match(run('cd ${target.dir} && git commit -m x').stderr, /probe: commit docs-only/);`
  - `L291 assert.match(run('git -C ${target.dir} commit -m x').stderr, /probe: commit docs-only/);`
  - `L292 assert.match(run('cd ${path.dirname(target.dir)} && git -C ${path.basename(target.dir)} commit -m x').stderr, /probe: commit docs-only/);`
  - `L294 assert.match(run("git commit -m x").stderr, /probe: commit code/);`
- L298–310: `test("the pkill guard sees through timeout / xargs / setsid wrappers (15-F7)", () => {`
  - `L306 ]) assert.equal(run(cmd).status, 2, 'bash-guard must block: ${cmd}');`
  - `L308 assert.equal(run(cmd).status, 0, 'bash-guard must allow: ${cmd}');`
- L311–342: `test("settings.json auto-approves curl only to a loopback PORT, never a lookalike host (15-F8, Bryce 2026-10-10)", () => {`
  - `L317 assert.ok(allowed(cmd), 'settings.json must allow: ${cmd}');`
  - `L319 assert.ok(!allowed(cmd), 'settings.json must NOT auto-approve: ${cmd}');`
- L343–373: `test("the edit guard blocks a generated file written by git checkout/restore/--output, sed w, curl -o (R4-SUPPLY-4)", () => {`
  - `L352 assert.equal(run("cp docs/PHYSICS.md js/roster.js").status, 2, "control: a cp onto the generated file is blocked");`
  - `L355 assert.equal(r.status, 2, 'must block: ${cmd} (${r.stderr})');`
  - `L356 assert.match(r.stderr, /js\/roster\.js \(via Bash: (git-|sed-w|curl)/, 'the refusal names the write: ${cmd}');`
  - `L360 assert.equal(r.status, 0, 'a read must stay open: ${cmd} (${r.stderr})');`
- L374–414: `test("a commit guard that outlives its time cap BLOCKS (rc 124 → exit 2), for test:guards and docs-integrity", () => {`
  - `L390 assert.equal(r.status, 2, r.stderr);`
  - `L391 assert.match(r.stderr, /npm run test:guards did not finish within 1 s/);`
  - `L392 assert.ok(Date.now() - t < 15000, "the cap, not the stub, ended the run");`
  - `L397 assert.equal(r.status, 2, r.stderr);`
  - `L398 assert.match(r.stderr, /docs-integrity did not finish within 1 s/);`
  - `L403 assert.ok(/GUARD_T=160/.test(hookSrc), "default inner guard cap");`
  - `L405 assert.ok(inner + 15 <= bg.timeout, 'inner guard cap ${inner} s must sit below the hook timeout ${bg.timeout} s');`
  - `L411 assert.equal(h.onFailure, "block", '${h.command}: a PreToolUse guard that crashes or times out must block');`
- L415–432: `test("a subagent cannot boot Chromium through the capture CLIs either (tools/shot, tools/ui audits, gfx-probe)", () => {`
  - `L428 for (const c of browser) assert.equal(run(c).status, 2, 'a subagent must not run: ${c}');`
  - `L429 for (const c of open) assert.equal(run(c).status, 0, 'a subagent may run: ${c}');`
  - `L430 for (const c of browser) assert.equal(run(c, false).status, 0, 'the main session may run: ${c}');`
- L433–463: `test("the push guard refuses force / mirror / delete / deploy-branch pushes in every shell shape", () => {`
  - `L449 assert.equal(r.status, 2, 'must block: ${c} (${r.stderr})');`
  - `L450 assert.match(r.stderr, /BLOCKED/, c);`
  - `L455 assert.equal(run(c).status, 0, 'must allow: ${c} (${run(c).stderr})');`
  - `L459 assert.equal(run(c).status, 2, 'on the deploy branch, must block: ${c}');`
  - `L460 assert.equal(run("git push origin HEAD:cursor/topic-1234").status, 0, "an explicit topic destination is fine from any branch");`
- L464–487: `test("protect-files scopes track-surveyor writes to circuit pairs, scratch/ and artifacts/", () => {`
  - `L471 assert.equal(write(rel, "track-surveyor").status, 0, 'surveyor may write ${rel}');`
  - `L474 assert.equal(r.status, 2, 'surveyor must not write ${rel}');`
  - `L475 assert.match(r.stderr, /track-surveyor writes only/);`
  - `L477 assert.equal(write("js/track/core/def.js", "worker").status, 0, "the scope is the surveyor's alone");`
  - `L480 assert.deepEqual([ro.status, ro.stderr.includes("read-only reporter")], [2, true], "a reporter agent never writes the tree");`
  - `L481 assert.equal(write("js/track/core/def.js").status, 0, "the main session is unaffected");`
  - `L483 assert.equal(bash("sed -i s/a/b/ js/track/core/def.js").status, 2);`
  - `L484 assert.equal(bash("echo x > js/circuits/scenery/monza.js").status, 0);`
- L488–507: `test("protect-files scopes agent-surface-reviewer to its scratch/**.md report and refuses its Bash writes", () => {`
  - `L494 assert.equal(write("scratch/survey/x.md").status, 0, "the reviewer may write its report");`
  - `L497 assert.equal(r.status, 2, 'reviewer must not write ${rel}');`
  - `L498 assert.match(r.stderr, /agent-surface-reviewer writes only/);`
  - `L503 assert.equal(bash(c).status, 2, 'reviewer Bash must not write: ${c}');`
  - `L504 for (const c of ["git log -n 5", "wc -l AGENTS.md"]) assert.equal(bash(c).status, 0, 'reviewer may read: ${c}');`
- L508–520: `test("guards that fail open say so on stderr; the MCP browser guard fails CLOSED (round 2)", () => {`
  - `L510 assert.equal(r.status, 0);`
  - `L511 assert.match(r.stderr, /WARNING .*did NOT run/, "protect-files must warn when it cannot read the payload");`
  - `L514 assert.equal(m.status, 2);`
  - `L515 assert.match(m.stderr, /BLOCKED: mcp-browser-guard could not read the hook payload/);`
  - `L516 assert.match(fs.readFileSync(path.join(ROOT, ".claude/hooks/protect-files.py"), "utf8"),`
- L521–582: `test("github-mcp-guard: merge commits only, a receipt before merge/arm and the draft→ready flip, passes other PR edits", () => {`
  - `L524 const decision = (r) => { assert.equal(r.status, 0, r.stderr); return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null; };`
  - `L531 assert.equal(d?.permissionDecision, "deny", '${name} ${JSON.stringify(input)} ${JSON.stringify(env)}');`
  - `L532 assert.match(d.permissionDecisionReason, /MERGE-COMMIT-ONLY/);`
  - `L542 assert.equal(d?.hookEventName, "PreToolUse");`
  - `L543 assert.equal(d?.permissionDecision, "deny", '${name} ${JSON.stringify(input)} ${JSON.stringify(env)}');`
  - `L544 assert.match(d.permissionDecisionReason, new RegExp('${gate}\\.mjs --pr 1'));`
  - `L545 assert.doesNotMatch(d.permissionDecisionReason, /ready-full-cap/, "the ready cap was retired 2026-10-16");`
  - `L554 assert.equal(decision(run(name, input)), null, 'gated ${name} passes');`
  - `L556 assert.match(decision(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head })).permissionDecisionReason, /31 min old/);`
  - `L558 assert.match(decision(run("mcp__github__update_pull_request", { pullNumber: 1, draft: false })).permissionDecisionReason, /refused \(plan-open/);`
  - `L560 assert.equal(decision(run("mcp__github__update_pull_request", input)), null, 'silent pass: ${JSON.stringify(input)}');`
  - `L562 assert.equal(decision(hook("github-mcp-guard.sh", "not json")).permissionDecision, "ask", "an unreadable payload asks");`
  - `L564 assert.ok(!settings.permissions.deny.includes("mcp__github__merge_pull_request"), "merges are gated by the hook's receipt check, not denied outright");`
  - `L567 for (const n of ["mcp__github__enable_pr_auto_merge", "mcp__github__update_pull_request", "mcp__github__merge_pull_request"]) assert.ok(re.test(n), n);`
  - `L569 assert.ok(!re.test(n), 'matcher must not catch ${n}');`
- L583–608: `test("agent-run: wrapped pushes and gh merges receive the direct command's policy", () => {`
  - `L591 assert.equal(direct.status, 2, command);`
  - `L592 assert.equal(compact.status, direct.status, '${command}: ${compact.stderr}');`
  - `L593 assert.match(compact.stderr, /BLOCKED/);`
  - `L598 assert.equal(decisionOf(run(command, env)), expected);`
  - `L599 assert.equal(decisionOf(run(wrapped(command, "--output-level=diagnostic"), env)), expected);`
  - `L600 assert.equal(decisionOf(run(wrapped(command), { APEX_MERGE_DESK: "1" })), expected);`
  - `L604 assert.equal(run(wrapped('git -C '${repo.dir}' push origin HEAD')).status, 2);`
  - `L605 assert.equal(run('cd '${repo.dir}' && ${wrapped("git push origin HEAD")}').status, 2);`
- L609–632: `test("agent-run: subagent browser checks unwrap argv, while help/read and literal data never execute", () => {`
  - `L612 assert.equal(run(command).status, 2, command);`
  - `L613 assert.equal(run(wrapped(command)).status, 2, command);`
  - `L614 assert.equal(run(wrapped(command, '--progress')).status, 2, command);`
  - `L620 assert.equal(result.status, 0, '${command}: ${result.stderr}');`
  - `L621 assert.equal(decisionOf(result), null);`
  - `L627 'node '${AGENT_RUN}' help -- npm test']) assert.equal(run(command).status, 0, command);`
  - `L629 assert.equal(run("node /unrelated/tools/agent-run.mjs -- npm test").status, 0);`
  - `L630 assert.equal(run('node other.mjs '${AGENT_RUN}' -- npm test').status, 0);`
- L633–651: `test("agent-run: invalid wrapper forms fail closed and literal argv operators stay arguments", () => {`
  - `L642 assert.equal(result.status, 2, '${command}: ${result.stderr}');`
  - `L643 assert.match(result.stderr, /cannot (inspect|parse) agent-run/);`
  - `L648 assert.equal(result.status, 0, result.stderr);`
  - `L649 assert.deepEqual(JSON.parse(result.stdout), [["printf", "%s", ";", "&&", "2", ">", "|", "\n", "git push --force origin x"]]);`
- L652–681: `test("agent-run: raw cancellation/process rules retain direct policy, exceptions and quote defenses", () => {`
  - `L657 assert.equal(direct.status, 2, command);`
  - `L658 assert.equal(compact.status, direct.status, '${command}: ${compact.stderr}');`
  - `L664 assert.equal(run(command, env).status, 0, command);`
  - `L669 assert.equal(result.status, 0, '${command}: ${result.stderr}');`
  - `L674 assert.equal(run(wrapped(urlData)).status, run(urlData).status);`
  - `L675 assert.equal(run('node '${AGENT_RUN}' --help -- pkill -f chrome').status, 0);`
  - `L676 assert.equal(run('node '${AGENT_RUN}' --read 'artifacts/agent-output/gh run cancel 123'').status, 0);`
  - `L677 assert.equal(run("node tools/agent-run.mjs -- pkill -f chrome").status, 2, "relative trusted path");`
  - `L678 assert.equal(run("./tools/agent-run.mjs -- pkill -f chrome").status, 2, "direct executable trusted path");`
  - `L679 assert.equal(run("./tools/agent-run.mjs -- git push --force origin topic").status, 2);`
- L682–717: `test("round 2 push: refspec DWIM, @, globs, --prune, config, abbreviations, aliases and wrappers all block", () => {`
  - `L700 assert.equal(r.status, 2, 'must block: ${c} (${r.stderr})');`
  - `L701 assert.match(r.stderr, /BLOCKED/, c);`
  - `L706 assert.equal(run(c).status, 0, 'must allow: ${c} (${run(c).stderr})');`
  - `L709 assert.equal(run(c).status, 2, 'on the deploy branch, must block: ${c}');`
  - `L713 assert.equal(run("git push").status, 2, "push.default=matching in git config");`
  - `L714 assert.equal(run("git push origin cursor/cfg-1").status, 0, "an explicit refspec ignores push.default");`
- L718–734: `test("round 2 commit detection: wrapped commits and aliases still run the guards", () => {`
  - `L728 assert.match(r.stderr, /bash-guard probe: commit/, 'the guard must SEE this commit: ${c}');`
  - `L731 assert.doesNotMatch(run(c).stderr, /probe: commit/, 'not a guarded commit: ${c}');`
- L735–787: `test("round 2 gh: squash/rebase denied, merges / ready flips need the gate receipt, API-by-id calls still ask", () => {`
  - `L754 assert.equal(decisionOf(r), "deny", '${c} ${JSON.stringify(env)}: ${r.stdout}');`
  - `L755 assert.match(r.stdout, /MERGE-COMMIT-ONLY/);`
  - `L761 assert.equal(decisionOf(r), "deny", '${c} ${JSON.stringify(env)}: ${r.stdout}');`
  - `L762 assert.match(r.stdout, /(merge|ready)-gate\.mjs --pr 12/, 'the reason names the gate: ${c}');`
  - `L767 assert.equal(decisionOf(r), "ask", '${c}: ${r.stdout}');`
  - `L768 assert.equal(decisionOf(run(c, { APEX_MERGE_DESK: "1" })), "ask", 'the desk no longer silences ${c} (2026-10-26)');`
  - `L770 assert.match(run("gh pr merge 12").stdout, /merge-gate\.mjs/, "the reason is merge_policy's");`
  - `L771 for (const c of pass) assert.equal(decisionOf(run(c)), null, 'silent pass: ${c}');`
  - `L779 assert.equal(decisionOf(run(c)), want, 'gated ${want ? "unpinned merge denied" : "pass"}: ${c}');`
  - `L781 assert.ok(run("gh pr merge 12 --merge").stdout.includes("match-head-commit"), "the unpinned reason names the pin");`
  - `L782 assert.equal(decisionOf(run('gh pr merge 12 --merge --match-head-commit ${"b".repeat(40)}')), "deny", "a pin to another head");`
  - `L783 assert.equal(decisionOf(run('gh pr merge 12 --merge --match-head-commit ${head}')), null, "a pin to the gated head");`
  - `L784 assert.equal(decisionOf(run("gh pr merge --merge")), "deny", "no PR number: no receipt can match");`
- L788–808: `test("round 2 subagent ban: decided on the parsed argv, every runner spelling, node-only checks stay open", () => {`
  - `L803 for (const c of browser) assert.equal(sub(c).status, 2, 'a subagent must not run: ${c}');`
  - `L804 for (const c of open) assert.equal(sub(c).status, 0, 'a subagent may run: ${c} (${sub(c).stderr})');`
  - `L805 assert.equal(sub("npm t", { agent_type: "verify-agent" }).status, 2, "agent_type alone marks a subagent");`
  - `L806 for (const c of browser.slice(0, 6)) assert.equal(hook("bash-guard.sh", bashCall(c)).status, 0, 'the main session may run: ${c}');`
- L809–829: `test("round 2 mcp-browser-guard: agent_type counts, the apex browser list matches the MCP catalog and the matcher", () => {`
  - `L811 assert.equal(run({ tool_name: "mcp__playwright-official__browser_navigate", agent_type: "general-purpose" }).status, 2);`
  - `L812 assert.equal(run({ tool_name: "mcp__apex-tools__apex_hud_mock", agent_id: "a1" }).status, 2);`
  - `L813 assert.equal(run({ tool_name: "mcp__apex-tools__apex_hud_mock" }).status, 0, "the main session keeps its browser");`
  - `L819 assert.ok(browserTools.includes("apex_hud_mock") && browserTools.length >= 10, 'catalog parse: ${browserTools}');`
  - `L824 assert.ok(matcher.test('mcp__apex-tools__${t}'), 'settings matcher must select ${t}');`
  - `L825 assert.equal(run({ tool_name: 'mcp__apex-tools__${t}', agent_id: "a1" }).status, 2, 'hook must block ${t}');`
  - `L826 assert.match(parse, new RegExp('"${t}"'), 'shellparse APEX_BROWSER must list ${t} (apex-tools-mcp.sh call)');`
- L830–853: `test("round 2 protect-files: a symlink resolves before the rules; surveyor removals and whole-tree git verbs block", () => {`
  - `L838 assert.equal(w.status, 2, w.stderr);`
  - `L839 assert.match(w.stderr, /version\.json.*GENERATED/);`
  - `L843 assert.equal(surv(c).status, 2, 'surveyor must not: ${c}');`
  - `L846 assert.equal(surv(c).status, 0, 'surveyor may: ${c} (${surv(c).stderr})');`
  - `L849 assert.equal(run({ tool_name: "Bash", tool_input: { command: c } }).status, 2, c);`
  - `L850 assert.equal(run({ tool_name: "Bash", tool_input: { command: "rm -rf scratch/x" } }).status, 0);`
- L854–871: `test("round 2 github-mcp-guard: falsy draft spellings need the ready receipt; an arm must name MERGE", () => {`
  - `L859 assert.equal(run("mcp__github__update_pull_request", { pullNumber: 1, draft }), "deny", 'draft ${JSON.stringify(draft)} without a receipt');`
  - `L860 for (const draft of [true, 1, "true", null]) assert.equal(run("mcp__github__update_pull_request", { pullNumber: 1, draft }), null);`
  - `L862 assert.equal(run("mcp__github__enable_pr_auto_merge", { pullNumber: 1 }, desk), "ask", "an omitted method is the repo default");`
  - `L863 assert.equal(run("mcp__github__enable_pr_auto_merge", { pullNumber: 1, mergeMethod: "MERGE" }, desk), "deny", "MERGE named, but no receipt");`
  - `L866 assert.equal(run("mcp__github__enable_pr_auto_merge", { pullNumber: 1, mergeMethod: "MERGE", expectedHeadSha: "f".repeat(40) }, desk), null);`
  - `L867 for (const draft of [false, "0", "off"]) assert.equal(run("mcp__github__update_pull_request", { pullNumber: 1, draft }), null, 'draft ${JSON.stringify(draft)} with a receipt');`
  - `L868 for (const m of ["Squash-merge", ["squash"], "REBASE "]) assert.equal(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: m }), "deny", JSON.stringify(m));`
- L872–911: `test("a PASSING commit tells the model which guard path ran: additionalContext + systemMessage JSON, exit 0", () => {`
  - `L885 const out = (r) => { assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };`
  - `L889 assert.equal(j.hookSpecificOutput.hookEventName, "PreToolUse");`
  - `L890 assert.equal(j.hookSpecificOutput.permissionDecision, undefined, "context only: the allow is unchanged");`
  - `L891 assert.match(j.hookSpecificOutput.additionalContext, /docs-only commit — ran tests\/unit\/docs-integrity\.test\.mjs only \(green, \d+ s\)/);`
  - `L892 assert.equal(j.systemMessage, j.hookSpecificOutput.additionalContext);`
  - `L897 assert.match(j.hookSpecificOutput.additionalContext, /code commit — ratchets --auto-raise \(0 raised\/lowered\) then npm run test:guards \(green, \d+ s/);`
  - `L900 assert.equal(j.hookSpecificOutput.permissionDecision, "deny");`
  - `L901 assert.equal(j.hookSpecificOutput.additionalContext, undefined, "a denied command runs no commit guards");`
  - `L905 assert.equal(j.hookSpecificOutput.permissionDecision, undefined);`
  - `L906 assert.match(j.hookSpecificOutput.additionalContext, /code commit/);`
  - `L908 assert.equal(hook("bash-guard.sh", bashCall("git status", { cwd: repo.dir }), { cwd: repo.dir }).stdout, "");`
- L912–955: `test("a commit in a linked worktree borrows the main checkout's node_modules instead of blocking (2026-10-15)", () => {`
  - `L927 assert.equal(fs.existsSync(path.join(wt, "node_modules")), false, "a fresh worktree has no node_modules");`
  - `L931 assert.equal(r.status, 0, r.stderr);`
  - `L932 assert.doesNotMatch(r.stderr, /node_modules is missing/);`
  - `L933 assert.equal(fs.realpathSync(path.join(wt, "node_modules")), fs.realpathSync(path.join(repo.dir, "node_modules")));`
  - `L934 assert.equal(spawnSync("git", ["status", "--porcelain"], { cwd: wt, encoding: "utf8" }).stdout.includes("node_modules"), false,`
  - `L941 assert.equal(m.status, 2, "a main checkout with no install still blocks");`
  - `L942 assert.match(m.stderr, /node_modules is missing/);`
- L956–992: `test("2026-10-15: an Actions run cancel is refused at both doors; a re-run asks", () => {`
  - `L963 assert.equal(r.status, 2, 'must block: ${c} (${r.stderr})');`
  - `L964 assert.match(r.stderr, /BLOCKED: cancelling an Actions run/);`
  - `L968 assert.equal(run(c).status, 0, 'must allow: ${c}');`
  - `L969 assert.equal(run("gh run cancel 1", { APEX_RUN_CANCEL_OK: "1" }).status, 0, "the user asked: env override");`
  - `L970 assert.equal(run("APEX_RUN_CANCEL_OK=1 gh run cancel 1").status, 0, "the user asked: command override");`
  - `L972 assert.equal(mcp({ method: "cancel_workflow_run", run_id: 1 }), "deny");`
  - `L973 assert.equal(mcp({ method: "force_cancel_workflow_run", run_id: 1 }), "deny");`
  - `L974 assert.equal(mcp({ method: "cancel_workflow_run", run_id: 1 }, { APEX_RUN_CANCEL_OK: "1" }), null, "the user asked");`
  - `L976 assert.equal(mcp({ method: "rerun_failed_jobs", run_id: 1 }, noDesk), "ask", "a re-run is at most once, infra only");`
  - `L977 assert.equal(mcp({ method: "rerun_workflow_run", run_id: 1 }, noDesk), "ask");`
  - `L981 assert.equal(mcp({ method, run_id: 1 }, { APEX_MERGE_DESK: "1" }), null, 'desk passes ${method}');`
  - `L982 assert.equal(mcp({ method: "cancel_workflow_run", run_id: 1 }, { APEX_MERGE_DESK: "1" }), "deny", "the desk never cancels");`
  - `L984 assert.equal(mcp({ method: "run_workflow", workflow_id: wf, ref: "x" }, { APEX_MERGE_DESK: "1" }), "ask", 'a ${wf} dispatch asks (2026-10-26)');`
  - `L985 assert.equal(mcp({ method: "run_workflow", workflow_id: "gpu-census.yml", ref: "x" }), null, "another workflow's dispatch passes");`
  - `L988 assert.ok(new RegExp(g.matcher).test("mcp__github__actions_run_trigger"), "the matcher must route actions_run_trigger through the guard");`
- L993–1009: `test("2026-10-16: a git push is not held on the queue gauge", () => {`
  - `L1003 assert.equal(r.status, 0, 'never held: ${c} (${r.stderr})');`
  - `L1004 assert.doesNotMatch(r.stderr, /queue hold/);`
- L1010–1049: `test("protect-files: a git conflict-side or committed-source restore of a generated file passes; any other ref still blocks", () => {`
  - `L1025 assert.equal(r.status, 2, 'no merge in progress, so not a resolution: ${c}');`
  - `L1026 assert.match(r.stderr, /GENERATED/, c);`
  - `L1037 assert.equal(r.status, 0, 'conflict resolution is not a hand edit: ${c} (${r.stderr})');`
  - `L1044 assert.equal(r.status, 2, 'must still block: ${c}');`
  - `L1045 assert.match(r.stderr, /GENERATED/, c);`
- L1050–1079: `test("bash-guard: 'git add X && git commit' in one command counts X as staged (census: 7 false blocks)", () => {`
  - `L1059 assert.equal(r.status, 0, r.stderr);`
  - `L1060 assert.match(r.stderr, /probe: commit docs-only/, "the added doc is the whole commit");`
  - `L1063 assert.equal(r.status, 2, "docs/PHYSICS.md is still unstaged");`
  - `L1064 assert.match(r.stderr, /unstaged changes[\s\S]*docs\/PHYSICS\.md/);`
  - `L1065 assert.doesNotMatch(r.stderr, /^\s+js\/core\/log\.js$/m, "the added file is not reported as unstaged");`
  - `L1067 assert.equal(r.status, 0, r.stderr);`
  - `L1068 assert.match(r.stderr, /probe: commit code/, "a code path in the add makes it a code commit");`
  - `L1071 assert.equal(r.status, 0, '${c}: ${r.stderr}');`
  - `L1072 assert.match(r.stderr, /probe: commit code/, '${c} stages everything, so it is never docs-only');`
  - `L1075 assert.equal(run("git commit -m x").status, 2);`
  - `L1076 assert.equal(run("echo 'git add js/core/log.js' && git commit -m x").status, 2, "a quoted add is prose");`
- L1080–1109: `test("bash-guard: survey images and reports commit on the docs-only path; a code file or an image elsewhere does not", () => {`
  - `L1090 assert.equal(r.status, 0, r.stderr);`
  - `L1091 assert.match(r.stderr, /probe: commit docs-only/, "survey images, reports and prose are the docs-only path");`
  - `L1095 assert.match(r.stderr, /probe: commit code/, "a code file in the commit runs the full guards");`
  - `L1100 assert.match(r.stderr, /probe: commit code/, '${rel} is not a survey asset');`
- L1110–1129: `test("post-edit circuit advice leaves verification until all edits are complete", () => {`
  - `L1122 assert.equal(r.status, 0, r.stderr);`
  - `L1124 assert.equal(advice.trim(), '[post-edit] ${rel} changed: after all circuit and scenery edits, run \'node tools/track/verify-track.cjs monza\' once; no intermediate build was checked');`
  - `L1125 assert.equal(fs.existsSync(marker), false, "no intermediate verification runs");`
- L1130–1144: `test("post-edit group guidance edits the source instead of generated package scripts", () => {`
  - `L1138 assert.equal(r.status, 0, r.stderr);`
  - `L1140 assert.equal(advice.trim(), "[post-edit] groups.json changed: package.json test:* scripts are STALE — finish the source group " +`
- L1145–1164: `test("post-edit.sh hands its advice to the model as PostToolUse additionalContext JSON, and stays silent with none", () => {`
  - `L1153 assert.equal(r.status, 0, r.stderr);`
  - `L1155 assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");`
  - `L1156 assert.match(out.hookSpecificOutput.additionalContext, /\[post-edit\] js\/core\/log\.js does not parse/);`
  - `L1159 assert.equal(r.status, 0, r.stderr);`
  - `L1160 assert.equal(r.stdout.trim(), "", "no advice, no output");`
- L1165–1184: `test("git checkout --theirs/--ours warns when the file has several conflict hunks", () => {`
  - `L1173 assert.equal(r.status, 0, r.stderr);`
  - `L1174 assert.doesNotMatch(r.stderr, /conflict hunks/, "one hunk is silent");`
  - `L1177 assert.equal(r.status, 0, 'advisory, not a block: ${c}');`
  - `L1178 assert.match(r.stderr, /three\.txt has 3 conflict hunks; this keeps one side for all of them/, c);`
  - `L1180 assert.doesNotMatch(run("git checkout three.txt").stderr, /conflict hunks/, "no side flag, no warning");`
- L1185–1204: `test("a commit in a tree with no tools/ skips the guards unless it stages code", () => {`
  - `L1193 assert.equal(r.status, 0, r.stderr);`
  - `L1194 assert.match(r.stderr, /guards skipped: no tools\/ in this tree/);`
  - `L1199 assert.doesNotMatch(r.stderr, /guards skipped/, "staged js/ is still guarded");`
  - `L1200 assert.match(r.stderr, /probe: commit code/);`
- L1205–1233: `test("H4: a push over a red tooling-fast run is refused; && chains, green logs and the override pass", () => {`
  - `L1213 assert.equal(r.status, 2, r.stderr); assert.match(r.stderr, /tooling-fast \.\.\.; git push/);`
  - `L1215 assert.equal(r.status, 2, r.stderr);`
  - `L1216 assert.notEqual(push("node tools/ci/tooling-fast.mjs && git push -u origin x").status, 2, "&& is the safe join");`
  - `L1220 assert.equal(r.status, 2, r.stderr); assert.match(r.stderr, /= run failed \(39 passed, 1 failed\)/);`
  - `L1221 assert.notEqual(push("git push -u origin x", { APEX_PUSH_FAILED_OK: "1" }).status, 2, "override");`
  - `L1222 assert.notEqual(push("APEX_PUSH_FAILED_OK=1 git push -u origin x").status, 2, "inline override");`
  - `L1223 assert.notEqual(push("git status").status, 2, "only a push is held");`
  - `L1225 assert.notEqual(push("git push -u origin x").status, 2, "green log");`
  - `L1229 assert.notEqual(push("git push -u origin x").status, 2, "stale log");`
- L1234–1254: `test("#1714: git push prints the live-run WARN from live-run-check and still passes; non-push stays silent", () => {`
  - `L1243 assert.notEqual(r.status, 2, r.stderr);`
  - `L1244 assert.equal(`
  - `L1248 assert.doesNotMatch(push("git push -u origin x", quiet).stderr, /live ci\.yml/, "no live run, no line");`
  - `L1249 assert.doesNotMatch(push("git status", stub).stderr, /live ci\.yml/, "only a push warns");`
  - `L1250 assert.doesNotMatch(push("git push -u origin x", path.join(repo.dir, "missing.mjs")).stderr, /live ci\.yml/, "a missing check is silent");`
- L1255–1284: `test("H1: stop-hook-git-check.sample treats synced memory and a held push as clean (Bryce applies the same to ~/.claude)", () => {`
  - `L1268 assert.equal(run().status, 0, "only .claude/memory dirty must not nag");`
  - `L1270 assert.equal(run().status, 2, "dirty prose outside memory still nags");`
  - `L1279 assert.equal(run().status, 2, 'unpushed commits nag without push-hold (${run().stderr})');`
  - `L1281 assert.equal(run().status, 0, "push-hold clears the unpushed nag while CI is live");`
- L1285–1304: `test("H5: a loaded box gets the longer guard cap, above it sits the hook timeout; H2 unmark runs before git verbs", () => {`
  - `L1287 assert.match(src, /\/proc\/loadavg[^\n]*GUARD_T=300/);`
  - `L1290 assert.ok(h.timeout >= 300 + 15, 'bash-guard hook timeout ${h.timeout} must clear the loaded cap');`
  - `L1297 assert.match(repo.g("ls-files", "-v").stdout, /^h \.claude\/memory\/a\.md/m);`
  - `L1300 assert.notEqual(r.status, null);`
  - `L1301 assert.match(repo.g("ls-files", "-v").stdout, /^H \.claude\/memory\/a\.md/m, "unmarked before the git verb");`
- L1305–1352: `test('diagnostics and UI browser entry points remain parent-owned across MCP and shell', () => {`
  - `L1323 assert.equal(sub(command).status, 2, command);`
  - `L1324 assert.equal(hook('bash-guard.sh', bashCall(command)).status, 0, 'parent may run: ' + command);`
  - `L1334 ]) assert.equal(sub(command).status, 0, 'browser-free plan/VM remains open: ' + command);`
  - `L1339 assert.ok(matcher.test(name));`
  - `L1340 assert.equal(hook('mcp-browser-guard.sh', { tool_name: name, agent_type: 'worker' }).status, 2);`
  - `L1341 assert.equal(hook('mcp-browser-guard.sh', { tool_name: name }).status, 0);`
  - `L1345 assert.equal(matcher.test(name), false);`
  - `L1346 assert.equal(hook('mcp-browser-guard.sh', { tool_name: name, agent_type: 'worker' }).status, 0);`
- L1353–1387: `test("GitHub API through curl, wget, node -e fetch and python -c gets the gh api policy (squash deny, ref/contents refuse, close/dispatch ask)", () => {`
  - `L1363 for (const c of deny) { const r = run(c); assert.equal(decisionOf(r), "deny", '${c}\n${r.stdout}${r.stderr}'); assert.match(r.stdout, /MERGE-COMMIT-ONLY/); }`
  - `L1369 for (const [c, why] of refuse) { const r = run(c); assert.equal(r.status, 2, c); assert.match(r.stderr, why, c); }`
  - `L1379 for (const [c, why] of ask) { const r = run(c); assert.equal(decisionOf(r), "ask", '${c}\n${r.stdout}${r.stderr}'); assert.match(r.stdout, why, c); }`
  - `L1384 for (const c of pass) { const r = run(c); assert.equal(r.status, 0, '${c}: ${r.stderr}'); assert.equal(decisionOf(r), null, 'silent pass: ${c} ${r.stdout}'); }`
- L1388–1402: `test("shell poll loops are refused: for/while … (ci-watch|gh run|git log|…) … sleep, and seq … sleep", () => {`
  - `L1394 assert.equal(r.status, 2, 'must refuse: ${c}');`
  - `L1395 assert.match(r.stderr, /shell poll loop/);`
  - `L1399 assert.notEqual(/shell poll loop/.test(run(c).stderr), true, 'not a poll loop: ${c}');`
  - `L1400 assert.equal(run("APEX_POLL_OK=1 for i in $(seq 1 3); do git ls-remote origin; sleep 2; done").status, 0, "the command's own override");`
- L1403–1411: `test("a subagent may print --help / -h of a launcher that honours it; a test-bg run and the census producers stay refused", () => {`
  - `L1407 assert.equal(sub(c).status, 0, 'help is not a browser run: ${c} ${sub(c).stderr}');`
  - `L1409 assert.equal(sub(c).status, 2, 'still a browser run: ${c}');`
- L1412–1442: `test("github-mcp-guard: close asks, pages/ci dispatch asks, file-write tools are denied; the receipt's gate files must be committed", () => {`
  - `L1416 assert.equal(decisionOf(run("mcp__github__update_pull_request", { pullNumber: 1, state: "closed" })), "ask");`
  - `L1417 assert.equal(decisionOf(run("mcp__github__update_pull_request", { pullNumber: 1, body: "x", state: "open" })), null);`
  - `L1420 assert.equal(decisionOf(r), "deny", t); assert.match(r.stdout, /no PR and no CI/);`
  - `L1422 assert.equal(decisionOf(run("push_files", { branch: "x" })), "deny", "the Cursor/Codex bare name maps to the same rule");`
  - `L1427 assert.equal(merge().stdout.trim(), "", "a committed gate's receipt passes");`
  - `L1431 assert.match(merge().stdout, /"deny".*not the file that wrote this receipt/, "an edited gate file");`
  - `L1436 assert.match(merge().stdout, /"deny".*differ from HEAD/, "an UNCOMMITTED gate edit is refused even when the hash matches");`
  - `L1439 assert.match(merge().stdout, /"deny".*no gate-file hashes/, "a receipt from an older gate");`
- L1443–1460: `test("settings.json: file-write MCP tools denied, every hook has an explicit timeout, browser guard covers debug chrome and browser-use", () => {`
  - `L1446 assert.ok(settings.permissions.deny.includes(t), 'deny ${t}');`
  - `L1448 for (const g of groups) for (const h of g.hooks) assert.ok(Number.isFinite(h.timeout), '${ev} ${h.command}: explicit timeout (the default is 600 s)');`
  - `L1451 assert.match(t, new RegExp(browser.matcher), t);`
  - `L1452 assert.doesNotMatch("mcp__apex-tools__apex_status", new RegExp(browser.matcher));`
  - `L1454 assert.match("mcp__github__push_files", new RegExp(gh.matcher));`
  - `L1456 assert.equal(sub("mcp__apex-tools__apex_debug_chrome", { action: "start" }), 2);`
  - `L1457 assert.equal(sub("mcp__apex-tools__apex_debug_chrome", { action: "status" }), 0);`
  - `L1458 assert.equal(sub("mcp__plugin_browser-use_browser-use__navigate", {}), 2);`
- L1461–1468: `test("lsp-hint stays quiet for SCREAMING_CASE env names; a CapitalisedSymbol or Head.member still fires", () => {`
  - `L1465 for (const c of ["grep -rn RELAY_URL js/", "grep -rn APEX_MERGE_DESK js", "grep -n TURN js/ui/hud.js"]) assert.equal(hint(c), false, c);`
  - `L1466 for (const c of ["grep -rn GameHud js/", "grep -rn Tracks.curvature js", "grep -rn MAT.tarmac js"]) assert.equal(hint(c), true, c);`
- L1469–1493: `test("a 'git stash' while a merge is in progress is refused (MERGE_HEAD would be dropped); reads, pop and a stash after abort pass", () => {`
  - `L1483 assert.equal(repo.g("rev-parse", "-q", "--verify", "MERGE_HEAD").status, 0, "fixture: a merge is in progress");`
  - `L1486 assert.equal(r.status, 2, '${cmd}\n${r.stderr}');`
  - `L1487 assert.ok(r.stderr.trim().startsWith("BLOCKED: 'git stash' while a merge is in progress drops MERGE_HEAD"), r.stderr);`
  - `L1489 for (const cmd of ["git stash list", "git stash show -p", "git stash pop", "git status"]) assert.equal(run(cmd).status, 0, cmd);`
  - `L1491 assert.equal(run("git stash").status, 0, "no merge in progress: a stash is fine");`

## battle-earcon.test.mjs

Production target: js/audio/battle-earcon.js:3; js/audio/radio-voice.js; js/race/race-radio.js and radio-lines.js.

Imports/fixtures: VM fake clock/context generation/decode/voices; deferred decoder resolutions; controlled RaceFacts/Spotter; document/window events plus one MutationObserver.

Coverage, contract and comment assessment: Six cases cover finite nearest valid trend/motif, PCM16mono16kHz clips/cache/busy/mute/error, late cancel/supersede/global stops, actual opt-in request cold fallback/no replay, ten unsafe suppression modes and four stop modes, inert speech plus visibility/pause/pagehide. Audio fake validates event ownership/metadata rather than audibility. Defaults-off case explicitly passes false, so does not independently establish absent-store default.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L23–36: `test("battle motif selection uses finite measured trend, current opponent and nearest valid gap", () => {`
  - `L25 assert.equal(B.select(f), "ahead:closing");`
  - `L26 assert.equal(B.select({ ...f, gapB: 0.5 }), "behind:opening");`
  - `L27 assert.equal(B.select({ ...f, ahead: null }), "behind:opening");`
  - `L28 assert.equal(B.select({ ...f, rateA: null, rateB: NaN }), "");`
  - `L29 assert.equal(B.select({ ...f, rateA: 0.02, rateB: -0.03 }), "");`
  - `L30 assert.equal(B.select({ ...f, gapA: Infinity, rateB: -0.2 }), "behind:closing");`
  - `L31 assert.equal(B.select({ ...f, rateA: 0.2 }), "ahead:opening");`
  - `L32 assert.equal(B.select(null), "");`
  - `L33 assert.equal(B.select({ ...f, ahead: { pitState: "lane" }, behind: null }), "");`
  - `L34 assert.equal(B.select({ ...f, ahead: null, behind: { pitState: "box" } }), "");`
  - `L35 assert.equal(B.select({ ...f, ahead: { finished: true }, behind: null }), "");`
- L37–66: `test("four small finite PCM motifs cache per context; refused/muted/occupied playback stays silent", async () => {`
  - `L39 assert.equal(b.play("ahead:closing", 0.2), false);`
  - `L40 assert.equal(await b.prepare(), true); assert.equal(A.decoded.length, 4);`
  - `L41 assert.equal(await b.prepare(), true); assert.equal(A.decoded.length, 4);`
  - `L44 assert.equal(v.getUint16(20, true), 1); assert.equal(v.getUint16(22, true), 1);`
  - `L45 assert.equal(v.getUint32(24, true), 16000); assert.equal(v.getUint16(34, true), 16);`
  - `L46 assert.ok(bytes.byteLength < 12000);`
  - `L48 assert.equal(b.play("ahead:closing", 0), false);`
  - `L49 A.setEnabled(false); assert.equal(b.play("ahead:closing", 0.2), false);`
  - `L50 A.setEnabled(true); A.setVoices(1); assert.equal(b.play("ahead:closing", 0.2), false);`
  - `L51 A.setVoices(0); assert.equal(b.play("ahead:closing", 0.2), true);`
  - `L52 assert.equal(A.played[0].opts.channel, "coach");`
  - `L53 assert.equal(b.play("behind:opening", 0.2), false, "one finite motif at a time");`
  - `L54 b.stop(); assert.equal(A.stops.length, 1); assert.equal(b.busy(), false);`
  - `L55 A.setGen(2); assert.equal(b.ready(), false); assert.equal(b.play("ahead:closing", 0.2), false);`
  - `L56 assert.equal(await b.prepare(), true); assert.equal(A.decoded.length, 8);`
  - `L59 assert.equal(await retried.prepare(), false); assert.equal(retried.ready(), false);`
  - `L60 bad = false; assert.equal(await retried.prepare(), true, "null decode permits same-context retry");`
  - `L62 assert.equal(retried.play("ahead:closing", 0.2), false); assert.equal(retried.busy(), false);`
  - `L65 assert.equal(await noClip.prepare(), false); assert.equal(noClip.ready(), false);`
- L67–106: `test("late canceled and superseded decode completions neither play nor install", async () => {`
  - `L73 assert.equal(await old, false); assert.equal(b.ready(), false); assert.equal(A.played.length, 0);`
  - `L76 assert.equal(await next, false); assert.equal(b.ready(), false); assert.equal(A.played.length, 0);`
  - `L79 assert.equal(await third, false); assert.equal(b.ready(), false);`
  - `L80 assert.equal(A.played.length, 0, "global stop cancels unpublished preparations");`
- L107–118: `test("actual request defaults off, falls back until prepared and never replays a cold request", async () => {`
  - `L109 assert.ok(off.radio.request()); assert.equal(off.A.played.length, 0); assert.equal(off.A.decoded.length, 0);`
  - `L111 assert.ok(r.radio.request(), "cold cache keeps usual spoken/card status");`
  - `L113 assert.equal(r.A.played.length, 0, "decode completion itself never plays");`
  - `L114 assert.equal(r.radio.request(), ""); assert.equal(r.A.played.length, 1);`
  - `L116 assert.ok(r.radio.request(), "unknown trend keeps honest status");`
  - `L117 assert.equal(r.A.played.length, 1);`
- L119–146: `test("actual opt-in requests suppress unsafe cases and reset/WATCH/off/mute stop finite playback", async () => {`
  - `L133 assert.equal(r.radio.request(), "", mode); assert.equal(r.A.played.length, 0, mode);`
  - `L138 assert.equal(r.A.played.length, 1);`
  - `L143 assert.equal(r.A.stops.length, 1, mode);`
- L147–173: `test("no-speech inert stop/halt and singleton visibility/pause/pagehide cancel owned finite sources", async () => {`
  - `L162 const b = c.BattleEarcon.create(A); assert.equal(await b.prepare(), true);`
  - `L163 assert.equal(b.play("ahead:closing", 0.2), true);`
  - `L170 assert.equal(A.stops.length, before + 1, mode); assert.equal(b.busy(), false);`
  - `L172 assert.equal(observers.length, 1, "one observer shared across services and preparations");`

## behind-ship.test.mjs

Production target: tools/ci/behind-ship.mjs exports SHIP/WARN_BEHIND/measure/reportLine/warningAnnotation and CLI.

Imports/fixtures: Injected git argv-response function plus actual-checkout CLI process.

Coverage, contract and comment assessment: Five tests freeze ship/10 threshold, count12, unresolved safe result, strict >10 warning/no error, advisory CLI0. CLI second call passes --ship so BEHIND_SHIP_SHIP missing-ref environment is shadowed by CLI precedence: title says unresolved but that branch is not isolated there; unresolved behavior separately unit-tested.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L13–17: `test("defaults name the ship branch and warn threshold of 10", () => {`
  - `L14 assert.equal(SHIP, "claude/f1-game-project-26h3ng");`
  - `L15 assert.equal(WARN_BEHIND, 10);`
- L18–31: `test("measure counts commits on ship not in head", () => {`
  - `L27 assert.equal(m.ok, true);`
  - `L28 assert.equal(m.behind, 12);`
  - `L29 assert.equal(m.warnAt, 10);`
- L32–40: `test("measure reports unresolved refs without throwing", () => {`
  - `L35 assert.equal(m.ok, false);`
  - `L36 assert.equal(m.behind, null);`
  - `L37 assert.match(reportLine(m), /could not measure/);`
  - `L38 assert.equal(warningAnnotation(m), null);`
- L41–51: `test("warning annotation only when behind exceeds threshold", () => {`
  - `L43 assert.equal(warningAnnotation({ ...base, behind: 10 }), null);`
  - `L44 assert.equal(warningAnnotation({ ...base, behind: 0 }), null);`
  - `L46 assert.match(w, /^::warning /);`
  - `L47 assert.match(w, /11 commits behind/);`
  - `L48 assert.match(w, /threshold 10/);`
  - `L49 assert.doesNotMatch(w, /::error/);`
- L52–68: `test("CLI always exits 0 even when over threshold or unresolved", () => {`
  - `L66 assert.equal(run(), 0);`
  - `L67 assert.equal(run({ BEHIND_SHIP_SHIP: "refs/does-not-exist-behind-ship" }), 0);`

## bench-capture.test.mjs

Production target: js/perf/bench-capture.js:15; js/perf/bench-run.js:19 schema/scenes/summarize compatibility.

Imports/fixtures: VM fake localStorage/time/intervals; memory and Log records; timestamp Map and renderer frame identity with fake gpuTimer.

Coverage, contract and comment assessment: Ten tests cover caps/sampled logs/query stripping, gap buckets/render timestamps, compile windows, unsupported optional APIs, MB/log boundaries/crumb recovery, budget trimming retaining p50, v1/v2 summary compatibility, stale/delayed frame exclusion, timer ownership at leg end, missing identity unavailable. Comment claims phone required for real profiling correctly; no actual GPU or physical memory measurement.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L27–41: `test("bench-capture: logs keep every warn/error, sample info after the first CAP.info, cap the total and strip URL queries", () => {`
  - `L33 assert.ok(out.length <= B.CAP.logs);`
  - `L34 assert.ok(out.every((r) => r.level !== "debug"));`
  - `L35 assert.ok(out.every((r) => !/token|secret/.test(r.msg) && r.msg.includes("https://x.io/a.js")));`
  - `L37 assert.equal(all.filter((r) => r.level === "warn").length, 2);`
  - `L38 assert.equal(all.filter((r) => r.level === "info").length, B.CAP.info + 7);   // 58 info: 20 kept, then every 5th of 21..58 (25..55)`
  - `L39 assert.ok(J(B.sampleLogs([{ level: "error", msg: "x".repeat(5000) }]))[0].msg.length <= B.CAP.msg);`
- L42–54: `test("bench-capture: rAF gap buckets and per-render-call GPU times from three's timestamp uids", () => {`
  - `L44 assert.deepEqual(J(B.gapStats([16, 17, 40, 60, 120, 300, 1500])), { frames: 7, max: 1500, over33: 5, over50: 4, over100: 3, over250: 2, over1000: 1 });`
  - `L47 assert.equal(p.frame, 11);`
  - `L48 assert.equal(p.calls, 2);`
  - `L49 assert.equal(p.totalMs, 6);`
  - `L50 assert.deepEqual(p.top.map((r) => r.call), ["r1", "r0"]);`
  - `L51 assert.equal(B.passTimes(new Map()), null);`
  - `L52 assert.equal(B.passTimes(null), null);`
- L55–63: `test("bench-capture: compile stats split by window and kind", () => {`
  - `L59 assert.deepEqual([entry.n, entry.ms, entry.max], [2, 42, 40]);`
  - `L60 assert.deepEqual(entry.byKind.pipeAsync, { n: 1, ms: 40 });`
  - `L61 assert.deepEqual([after.n, after.ms], [1, 10]);`
- L64–89: `test("bench-capture: a page with none of the optional APIs captures a leg without throwing and says unsupported", () => {`
  - `L66 assert.equal(B.active(), false);`
  - `L67 assert.equal(B.step(), null);`
  - `L68 assert.equal(B.legEnd(), null);`
  - `L69 assert.equal(B.legStart({ label: "Monza dry" }, { state: "menu" }), true);`
  - `L70 assert.equal(B.active(), true);`
  - `L72 assert.equal(st.heap, "unsupported");`
  - `L73 assert.equal(st.gpuPasses, null);`
  - `L75 assert.equal(B.active(), false);`
  - `L76 assert.equal(c.v, B.VERSION);`
  - `L77 assert.equal(c.start.heapMB, "unsupported");`
  - `L78 assert.equal(c.longTasks, "unsupported");`
  - `L79 assert.equal(c.loaf, "unsupported");`
  - `L80 assert.equal(c.gpu.timer, "unsupported");`
  - `L81 assert.equal(c.gpu.passes, "unsupported");`
  - `L82 assert.equal(c.entry, "unsupported");`
  - `L83 assert.equal(c.warm, "unsupported");`
  - `L84 assert.equal(c.device.thermal, "unavailable");`
  - `L85 assert.equal(c.device.battery, "unsupported");`
  - `L86 assert.ok(String(c.uaMemory).startsWith("unsupported"));`
  - `L87 assert.ok(JSON.stringify(c).length < 8000);`
- L90–106: `test("bench-capture: performance.memory, Log and the device-loss breadcrumb", () => {`
  - `L97 assert.equal(st.heap, 50);`
  - `L99 assert.deepEqual(c.logs.map((r) => r.msg), ["TLX GPU error #1"]);   // the line before legStart is not this leg's`
  - `L100 assert.equal(c.end.heapLimitMB, 4096);`
  - `L102 assert.equal(J(B.recover()).label, "Spa rain");`
  - `L103 assert.equal(store.has(B.CRUMB), false);`
  - `L104 assert.equal(B.recover(), null);`
- L107–122: `test("bench-capture: budget() trims logs, then timelines, then step captures, until the plan fits", () => {`
  - `L114 assert.deepEqual(small.trimmed, []);`
  - `L115 assert.equal(small.bytes, before);`
  - `L117 assert.ok(r.bytes <= 30000, "fits: " + r.bytes);`
  - `L118 assert.ok(r.trimmed.length >= 1 && r.trimmed[0] === "logs");`
  - `L119 assert.ok(JSON.stringify(plan).length <= 30000);`
  - `L120 assert.equal(plan.legs[0].steps[0].p50, 17);   // frame stats are never trimmed`
- L123–145: `test("bench-run: schema /2 with the capture hooks; /1 plans still resume and summarize/scenes read /2 legs unchanged", () => {`
  - `L125 assert.equal(R.SCHEMA, "apex26.bench/2");`
  - `L126 assert.deepEqual(J(R.SCHEMAS), ["apex26.bench/1", "apex26.bench/2"]);   // resume() reads both`
  - `L130 assert.deepEqual(J(R.scenes([v2])), J(R.scenes([v1])));`
  - `L131 assert.deepEqual(J(R.summarize([v2])), J(R.summarize([v1])));`
- L146–170: `test("bench-capture: retained timestamps and delayed prior-window rows are not fresh step measurements", () => {`
  - `L150 assert.equal(step.gpuPasses, null);`
  - `L151 assert.equal(step.gpuSample.state, "no fresh resolved frame");`
  - `L155 assert.equal(step.gpuPasses.frame, 12);`
  - `L156 assert.equal(step.gpuSample.state, "fresh");`
  - `L157 assert.equal(step.gpuSample.timerOn, true);`
  - `L158 assert.equal(step.gpuSample.capturedAtMs, 100);`
  - `L160 assert.equal(h.B.step().gpuPasses, null, "re-reading frame12 is not another sample");`
  - `L162 assert.equal(h.B.step().gpuPasses, null, "frame13 was already submitted at this window's boundary");`
  - `L165 assert.equal(step.gpuPasses, null);`
  - `L166 assert.equal(step.gpuSample.state, "timer inactive");`
  - `L168 assert.equal(capture.gpu.passes, "timer inactive");`
- L171–184: `test("bench-capture: leg end samples before releasing its timer and excludes earlier legs", () => {`
  - `L177 assert.equal(capture.gpu.passes.frame, 11);`
  - `L178 assert.equal(capture.gpu.sample.state, "fresh");`
  - `L179 assert.equal(capture.gpu.sample.scope, "leg");`
  - `L180 assert.equal(h.gfx.gpuTimer().on, false, "capture still releases only its own timer");`
  - `L182 assert.equal(h.B.legEnd().gpu.passes, "no fresh resolved frame", "the prior leg's retained map is not this leg");`
- L185–191: `test("bench-capture: missing frame identity is unavailable rather than a claimed fresh GPU measurement", () => {`
  - `L189 assert.equal(h.B.step().gpuSample.state, "freshness unavailable");`
  - `L190 assert.equal(h.B.legEnd().gpu.passes, "freshness unavailable");`

## bench-run.test.mjs

Production target: js/perf/bench-run.js:19 TESTS/newPlan/pathPrefs/median/scenes/summarize/overs/growth/wake/create/run/stop.

Imports/fixtures: VM fake performance; synthetic gpu/race/garage/lap/livery legs; optional navigator wakeLock sentinel and fake DOM/store/reload.

Coverage, contract and comment assessment: Thirteen tests pin alternating path ABBA seed42, own-renderer races/garage, summary rows and unfinished reasons, preferences, median/nulls, finished-only/API fallback summaries, lap/quick/livery plans and timing copy, help labels/unique IDs, overs/growth math, lap/edit/growth display, wake-lock acquire/reacquire/release and unsupported/refused API. reload actually completing benchmark is outside unit scope; first wake test title includes silent-without-API but next test covers it.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L21–34: `test("bench-run: the path test alternates WebGPU, WebGL2, WebGL2, WebGPU and seeds 42; nothing runs at load", () => {`
  - `L24 assert.deepEqual(J(paths.legs.map((l) => l.path)), ["webgpu", "webgl2", "webgl2", "webgpu"]);`
  - `L25 assert.ok(paths.legs.every((l) => l.kind === "gpu"));`
  - `L26 assert.equal(B.SEED, 42);`
  - `L28 assert.equal(plan.state, "running");`
  - `L29 assert.equal(plan.i, 0);`
  - `L30 assert.deepEqual(J(plan.legs.map((l) => l.state)), ["pending", "pending", "pending", "pending"]);`
  - `L31 assert.deepEqual(J(plan.prefs), { backend: null, threePath: null });`
  - `L32 assert.equal(B.newPlan("nope", {}).test, "paths");`
- L35–45: `test("bench-run: WEATHER & TRACKS and GARAGE run on the player's own renderer (no path switch)", () => {`
  - `L38 assert.ok(races.legs.length >= 4 && races.legs.every((l) => l.kind === "race" && l.path === null && l.track && l.weather && l.tod));`
  - `L39 assert.ok(races.legs.some((l) => l.weather === "rain") && races.legs.some((l) => l.tod === "night"));`
  - `L40 assert.deepEqual(J(garage.legs.map((l) => [l.kind, l.path])), [["garage", null]]);`
  - `L42 assert.equal(plan.legs[0].track, races.legs[0].track);`
  - `L43 assert.notEqual(plan.legs[0], races.legs[0]);   // a copy: running a plan never edits the test table`
- L46–61: `test("bench-run scenes: one row per race and per garage step; an unfinished leg keeps a row with its state", () => {`
  - `L55 assert.deepEqual(rows.map((r) => r.label), ["Monza rain", "Spa rain", "Garage · idle", "Garage · livery 1"]);`
  - `L56 assert.equal(rows[0].p99, 31);`
  - `L57 assert.equal(rows[0].coldMs, 5000);`
  - `L58 assert.deepEqual([rows[1].state, rows[1].reason], ["failed", "race ended early: hidden"]);`
  - `L59 assert.equal(rows[3].coldMs, 1200);`
- L62–69: `test("bench-run pathPrefs: three.js plus THREE PATH (tlxForceGL 0 = WebGPU, 1 = WebGL2); null keeps the player's", () => {`
  - `L64 assert.deepEqual(J(B.pathPrefs("webgpu", null)), { backend: "three", threePath: "0" });`
  - `L65 assert.deepEqual(J(B.pathPrefs("webgl2", null)), { backend: "three", threePath: "1" });`
  - `L67 assert.equal(B.pathPrefs(null, mine), mine);`
- L70–77: `test("bench-run median: odd, even, empty, and nulls skipped", () => {`
  - `L72 assert.equal(B.median([3, 1, 2]), 2);`
  - `L73 assert.equal(B.median([4, 1, 2, 3]), 2.5);`
  - `L74 assert.equal(B.median([]), null);`
  - `L75 assert.equal(B.median([null, 5, undefined]), 5);`
- L78–96: `test("bench-run summarize: per bound api, medians over finished legs only; failed and reloaded legs do not count", () => {`
  - `L85 assert.deepEqual(Object.keys(s).sort(), ["webgl2", "webgpu"]);`
  - `L86 assert.equal(s.webgpu.legs, 2);`
  - `L87 assert.equal(s.webgpu.phases.default.p50, 18);`
  - `L88 assert.equal(s.webgpu.phases.s100.p50, 32);`
  - `L89 assert.equal(s.webgl2.phases.default.p95, 25);`
  - `L90 assert.equal(s.webgl2.fill, 6);`
  - `L91 assert.equal(s.webgl2.coldMs, 4000);`
  - `L92 assert.equal(s.webgl2.warmMs, 900);`
  - `L93 assert.equal(s.webgl2.links, 2);`
  - `L94 assert.equal(s.webgpu.gpuTimer, false);`
- L97–102: `test("bench-run summarize: a leg that fell back is filed under the api that actually drew", () => {`
  - `L100 assert.deepEqual(Object.keys(s), ["webgl2"]);`
- L103–113: `test("bench-run: ONE LAP, QUICK PATHS and LIVERY EDIT plans; QUICK PATHS is one Monza lap per three.js path", () => {`
  - `L106 assert.deepEqual(J(one.legs.map((l) => [l.kind, l.path, l.track, l.weather])), [["lap", null, "monza", "dry"]]);`
  - `L107 assert.deepEqual(J(quick.legs.map((l) => [l.kind, l.path])), [["lap", "webgpu"], ["lap", "webgl2"]]);`
  - `L108 assert.deepEqual(J(liv.legs.map((l) => [l.kind, l.path])), [["livery", null]]);`
  - `L110 assert.deepEqual(J(plan.legs.map((l) => [l.state, l.label])), [["pending", "Lap WEBGPU"], ["pending", "Lap WEBGL2"]]);`
  - `L111 assert.deepEqual(J(B.pathPrefs(plan.legs[1].path, null)), { backend: "three", threePath: "1" });`
- L114–122: `test("bench-run: every test names its duration in its help line and keeps a short chip label", () => {`
  - `L117 assert.ok(/About \d+ min\.$/.test(t.help), t.id + " help names its duration: " + t.help);`
  - `L118 assert.ok(t.label.length <= 16, t.id + " label " + t.label);`
  - `L120 assert.equal(new Set(B.TESTS.map((t) => t.id)).size, B.TESTS.length);`
- L123–130: `test("bench-run overs / growth: frames past 33 and 50 ms; counter growth only where both samples hold a number", () => {`
  - `L125 assert.deepEqual(J(B.overs([16, 17, 34, 40, 51, 16, 16, 16, 16, 16])), { n33: 3, n50: 1, over33: 30 });`
  - `L126 assert.deepEqual(J(B.overs([])), { n33: 0, n50: 0, over33: null });`
  - `L127 assert.deepEqual(J(B.growth({ textures: 40, geometries: 70, texMB: 12.5, flapSets: null }, { textures: 40, geometries: 72, texMB: 12.25, flapSets: 2 })),`
- L131–148: `test("bench-run scenes: a lap row carries its lap time; livery edits carry edit ms and a GPU growth row", () => {`
  - `L140 assert.deepEqual(rows.map((r) => r.label), ["Lap WEBGPU", "Lap WEBGL2", "Livery · finish", "Livery · sponsors (none)", "Livery · GPU growth"]);`
  - `L141 assert.deepEqual([rows[0].time, rows[0].n33, rows[0].coldMs], ["92.4 s", 1, 3000]);`
  - `L142 assert.equal(rows[1].state, "failed");`
  - `L143 assert.deepEqual([rows[2].time, rows[2].coldMs], ["41 ms", 250]);`
  - `L144 assert.equal(rows[3].time, null);`
  - `L145 assert.deepEqual([rows[4].state, rows[4].reason], ["growth", "textures 0 · geometries +3 · texture MB +0.5"]);`
  - `L146 assert.equal(J(B.scenes([{ kind: "livery", label: "Livery", state: "done", steps: [], mem: { growth: {} } }]))[0].reason, "no counters on this renderer");`
- L149–178: `test("bench-run: wake lock is held while a plan runs, re-acquired on visible, released on stop, silent without the API", async () => {`
  - `L159 s.request = async (t) => { assert.equal(t, "screen"); s.n++; const x = { released: false, release: async () => { x.released = true; s.released++; } }; s.sentinels.push(x); return x; };`
  - `L164 assert.equal(typeof handlers.visibilitychange, "function");`
  - `L168 assert.equal(api.n, 1);`
  - `L172 assert.equal(api.n, 2);`
  - `L175 assert.equal(api.sentinels[1].released, true);`
- L179–192: `test("bench-run: no wake lock API is silent; a refused request is logged and does not throw", async () => {`
  - `L186 assert.deepEqual(none.logs, []);   // unsupported: nothing logged, nothing shown`
  - `L190 assert.equal(asked, 1);`
  - `L191 assert.ok(refuse.logs.some((m) => /wake lock refused NotAllowedError/.test(m)));`

## bitmap-decode-worker.test.mjs

Production target: js/workers/bitmap-decode-worker.js; js/workers/bitmap-decode-client.js:12 BitmapDecode.

Imports/fixtures: VM fake Worker, createImageBitmap, postMessage transfer, explicit controlled timers and AbortController; abs-src filenames.

Coverage, contract and comment assessment: Fifteen tests cover transfer/errors/crop overload and close-on-transfer-failure, Worker absence fallback/options, worker URL/success, timeout/messageerror/drop once with late disposal, duplicate ownership, malformed replies/crops, worker/page abort, failed error post swallowed, terminated corpse respawn, old-worker reply disposal, decode and strip deadline retirement. Fakes prove ownership transitions, not real transferable/decoder compatibility.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L15–42: `test("bitmap-decode-worker posts a transferred ImageBitmap for a Blob", async () => {`
  - `L20 assert.ok(blob && blob.size >= 0);`
  - `L22 assert.equal(rest.length, 5, "crop overload includes opts");`
  - `L34 assert.equal(posted.length, 1);`
  - `L35 assert.equal(posted[0].m.type, "decoded");`
  - `L36 assert.equal(posted[0].m.seq, 1);`
  - `L37 assert.equal(posted[0].m.bmp, fakeBmp);`
  - `L38 assert.ok(Array.isArray(posted[0].transfer));`
  - `L39 assert.equal(posted[0].transfer.length, 1);`
  - `L40 assert.equal(posted[0].transfer[0], fakeBmp);`
- L43–56: `test("bitmap-decode-worker answers error without throwing", async () => {`
  - `L52 assert.equal(posted[0].type, "error");`
  - `L53 assert.equal(posted[0].seq, 7);`
  - `L54 assert.match(posted[0].message, /bad png/);`
- L57–97: `test("bitmap-decode-worker closes only its own bitmap when transfer fails", async () => {`
  - `L68 assert.equal(args.length, crop ? 6 : 2, "preserve cropped and full-image overloads");`
  - `L74 assert.equal(m.bmp, bmp);`
  - `L75 assert.equal(transfer.length, 1);`
  - `L76 assert.equal(transfer[0], bmp);`
  - `L89 assert.equal(closes, mode === "transfer-fails" || mode === "close-fails" ? 1 : 0, mode);`
  - `L90 assert.equal(posted.length, 1, mode);`
  - `L91 assert.equal(posted[0].seq, 13);`
  - `L92 assert.equal(posted[0].type, mode === "success" ? "decoded" : "error");`
  - `L93 if (mode !== "success") assert.equal(posted[0].message, mode === "decode-fails" ? "bad png" : "transfer failed");`
- L98–118: `test("BitmapDecode client falls back to main-thread createImageBitmap without Worker", async () => {`
  - `L113 assert.equal(out, bmp);`
  - `L114 assert.equal(calls.length, 1);`
  - `L115 assert.equal(calls[0].opts.premultiplyAlpha, "none");`
  - `L116 assert.equal(calls[0].opts.imageOrientation, "none");`
- L119–159: `test("BitmapDecode client posts to a Worker and resolves the transferred bitmap", async () => {`
  - `L143 assert.equal(out, bmp);`
  - `L144 assert.match(worker.src, /bitmap-decode-worker\.js/);`
- L160–173: `test("bitmap deadline and messageerror fallback settle once and close late replies", async () => {`
  - `L167 assert.equal(await result, h.bmp); assert.equal(h.fallbacks, 1); assert.equal(h.clears, 1);`
  - `L170 assert.equal(closed, 1); assert.equal(h.fallbacks, 1);`
- L174–182: `test("matched bitmap ownership is transferred and duplicate replies close", async () => {`
  - `L179 h.worker.onmessage(reply); assert.equal(await result, bmp); assert.equal(closed, 0);`
  - `L180 h.worker.onmessage(reply); assert.equal(closed, 1); assert.equal(h.clears, 1);`
- L183–199: `test("malformed bitmap replies fallback and malformed crops reject before dispatch", async () => {`
  - `L187 assert.equal(await result, h.bmp); assert.equal(h.fallbacks, 1);`
  - `L191 await assert.rejects(h.api.decode({ size: 1 }, null, crop), /invalid crop/);`
  - `L192 assert.equal(h.worker, undefined); assert.equal(h.fallbacks, 0);`
  - `L196 assert.match(posted[0].message, /invalid crop/);`
- L200–217: `test("explicit bitmap abort skips fallback and closes a late worker reply", async () => {`
  - `L211 await assert.rejects(pending, { name: "AbortError" });`
  - `L214 assert.equal(fallbacks, 0); assert.equal(closed, 1);`
  - `L215 await assert.rejects(ctx.BitmapDecode.decode({}, null, null, controller.signal), { name: "AbortError" });`
- L218–228: `test("aborted page decode disposes its completed bitmap", async () => {`
  - `L226 await assert.rejects(pending, { name: "AbortError" }); assert.equal(closed, 1);`
- L229–244: `test("bitmap worker swallows a failed error postMessage (no unhandled rejection)", async () => {`
  - `L242 assert.equal(bmp.closed, 1);`
- L245–283: `test("BitmapDecode clears a terminated corpse so the next decode can respawn", async () => {`
  - `L272 assert.equal(workers, 1);`
  - `L275 assert.equal(await ctx.BitmapDecode.decode({ size: 1 }), bmp);`
  - `L276 assert.equal(workers, 1, "fallback does not spawn; corpse must be cleared");`
  - `L279 assert.equal(workers, 2, "respawn after corpse postMessage failure");`
  - `L281 assert.equal(await revived, bmp);`
- L284–318: `test("stale worker replies after drop+respawn close their bitmap and do not settle", async () => {`
  - `L306 await assert.rejects(pending, /must use worker|bitmap worker dropped/);`
  - `L310 assert.equal(workers.length, 2);`
  - `L313 assert.equal(closed, 1, "orphan bitmap from the terminated worker is closed");`
  - `L315 assert.equal(await next, bmp);`
- L319–331: `test("bitmap deadline retires the stalled worker before a later request", async () => {`
  - `L324 assert.equal(await first, h.bmp);`
  - `L326 assert.notEqual(h.worker, old, "a deadline must retire the unresponsive worker");`
  - `L328 assert.equal(await next, h.bmp);`
- L332–350: `test("client strip deadline retires its worker and lets a later strip respawn", async () => {`
  - `L344 assert.equal(await pending, null);`
  - `L345 assert.equal(workers[0].dead, true);`
  - `L347 assert.equal(workers.length, 2);`
  - `L349 assert.deepEqual(Array.from((await next)[0]), [1,2,3,4]);`

## blip-voice-pool.test.mjs

Production target: js/audio/signal.js:4 GameAudioSignal; js/audio/engine.js overrun via tone-model/soundtrack/radio-fx; M4 helper.

Imports/fixtures: Counting fake AudioContext/node/AudioParam; three-hundred-frame clock progression; held fetches resolved for actual engine init.

Coverage, contract and comment assessment: Three tests require 300 fires within poolCap8 oscillators/gains; schedule final type/frequency/envelope/start0 and reuse; sustained lift≥20 overrun fires and at least one square pop within8 oscillator additions. Fake params retain final values so full timing curve is not asserted despite envelope-schedule title; noise gains explicitly out of scope.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L88–107: `test("blip pool: 300 pops allocate at most poolCap oscillators and gains", () => {`
  - `L99 assert.equal(stats.fired, 300, "every blip still fires");`
  - `L100 assert.equal(stats.poolCap, 8);`
  - `L101 assert.ok(oscN <= stats.poolCap, 'createOscillator bounded: got ${oscN}, cap ${stats.poolCap}');`
  - `L102 assert.ok(gainN <= stats.poolCap, 'createGain bounded: got ${gainN}, cap ${stats.poolCap}');`
  - `L103 assert.equal(stats.pool, oscN, "pool size matches allocated oscillators");`
  - `L105 assert.ok(oscN < 300 / 10, 'regression: osc alloc ${oscN} must be far below one-per-pop');`
- L108–139: `test("blip pool: envelope and frequency schedule match the one-shot contract", () => {`
  - `L126 assert.ok(osc && g, "one voice created");`
  - `L127 assert.equal(osc.type, "sawtooth");`
  - `L128 assert.equal(osc.frequency.value, 880, "slideTo lands on frequency (fake param stores last set)");`
  - `L129 assert.equal(g.gain.value, 0.0001, "envelope ends at the near-zero floor");`
  - `L130 assert.equal(osc.startedAt, 0, "pooled oscillator starts once at 0, not per pop");`
  - `L135 assert.equal(nodes.length, nBefore, "reuse allocates no new osc/gain");`
  - `L136 assert.equal(api.blipStats().fired, 2);`
  - `L137 assert.equal(api.blipStats().pool, 1);`
- L140–185: `test("sustained lift: GameAudio overrun blips stay within the pool cap", async () => {`
  - `L181 assert.ok(ovr >= 20, 'overrun still crackles across 300 frames (fired=${ovr})');`
  - `L183 assert.ok(fires >= 1, 'some square overrun pops still fire (blipFireTotal Δ=${fires})');`
  - `L184 assert.ok(oscDelta <= 8, 'createOscillator during lift bounded: Δ=${oscDelta} (gain Δ=${gainDelta} is noise+blip)');`

## body-attitude.test.mjs

Production target: js/physics/body-attitude.js:2; PhysicsConsts.LAT_MAX; js/game.js pitch rotation extracted and executed; js/camera/vantage.js documented pitch sign.

Imports/fixtures: VM mat4/consts/body-attitude plus seedLog and fake GameStore; held sixty-Hz input, instrumented Math.exp, independent analytic spring oracle and kerb timelines.

Coverage, contract and comment assessment: Fifteen cases cover human/AI sign, monotonic critical damping, pitch/roll/heave bounds, dt clamp, three shared decay factors and independent exact state, disabled/null optimization, load stiffening/dive/rake/plank clearance, speed-scaled one-shot kerbs, deterministic body-only shiver, persisted off/reset, executed rotation sign/unit lengths. Camera sign is comment regex only; test title says orthonormal but block checks lengths, not dot-product. Intro zero-coverage is dated historical context.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L69–84: `test("human and AI cars lean the same way through the same corner", () => {`
  - `L78 assert.notEqual(human.roll, 0);`
  - `L79 assert.notEqual(ai.roll, 0);`
  - `L80 assert.equal(Math.sign(human.roll), Math.sign(ai.roll),`
- L85–100: `test("the spring is critically damped: monotone approach, no overshoot, converged in 2 s", () => {`
  - `L91 assert.ok(target < 0, "power squats the nose up (negative — c.baPitch > 0 is a dive)");`
  - `L93 assert.ok(Math.abs(trace[i]) >= Math.abs(trace[i - 1]) - 1e-12, 'overshoot or reversal at frame ${i}');`
  - `L94 assert.ok(Math.abs(trace[i]) <= Math.abs(target) + 1e-12, 'passed the target at frame ${i}');`
  - `L98 assert.ok(Math.abs(trace[45] - target) < Math.abs(target) * 0.02, "not converged at 0.75 s");`
- L101–116: `test("pitch and roll are capped and heave saturates below its ceiling", () => {`
  - `L104 assert.ok(Math.abs(p.pitch) <= 0.024 + 1e-9, 'pitch ${p.pitch} above the ≈1.4° cap');`
  - `L106 assert.ok(Math.abs(r.roll) <= 0.055 + 1e-9, 'roll ${r.roll} above the ≈3.1° cap');`
  - `L107 assert.ok(Math.abs(r.roll) > 0.05, "full lateral load should reach the cap, not stop short");`
  - `L112 assert.ok(worst > 0.01, "a ground impulse must move the body");`
  - `L113 assert.ok(worst < 0.05, 'heave ${worst} reached the ±5 cm rail — the tanh knee is gone');`
  - `L114 assert.equal(consts.LAT_MAX > 0, true, "the roll scale is the model's own LAT_MAX");`
- L117–125: `test("a stalled frame is clamped: dt=10 s behaves like dt=MAX_DT and stays finite", () => {`
  - `L122 assert.ok(Number.isFinite(big));`
  - `L123 assert.equal(big, clamped);`
- L126–141: `test("cars reuse only the latest clamped dt's three spring decay factors", () => {`
  - `L136 assert.equal(calls.length - before, clamped === previous ? 0 : 3, 'dt=${dt}');`
  - `L137 if (clamped !== previous) assert.deepEqual(calls.slice(before), [-9 * clamped, -7 * clamped, -20 * clamped]);`
- L142–183: `test("shared decay preserves the uncached closed-form spring state and body offsets exactly", () => {`
  - `L175 assert.deepEqual({ ...actual }, { pitch, roll, heave }, 'offsets frame=${frame}, car=${i}');`
  - `L176 assert.deepEqual({ ...c._ba.p }, r.p);`
  - `L177 assert.deepEqual({ ...c._ba.r }, r.r);`
  - `L178 assert.deepEqual({ ...c._ba.z }, r.z);`
  - `L179 assert.equal(c.baScrape, scrape);`
- L184–205: `test("disabled and null cars do no decay work, and re-enabling refreshes the current dt", () => {`
  - `L192 assert.equal(calls, 3);`
  - `L196 assert.equal(calls, 3);`
  - `L197 assert.equal(c.baPitch, 0);`
  - `L200 assert.equal(calls, 6);`
  - `L203 assert.equal(calls, 6, "resetting a car cannot invalidate pure dt factors");`
- L206–217: `test("downforce stiffens heave: the same impulse moves the body less at full load", () => {`
  - `L215 assert.ok(t < s, 'full downforce (${t}) should heave less than none (${s})');`
- L218–233: `test("the pitch sign: braking dives (+), power squats (−) — player and AI alike", () => {`
  - `L226 assert.ok(pBrake > 0 && aBrake > 0, 'braking must DIVE (c.baPitch > 0, vantage.js's sign): player ${pBrake}, AI ${aBrake}');`
  - `L227 assert.ok(pPower < 0 && aPower < 0, 'power must squat (nose up, < 0): player ${pPower}, AI ${aPower}');`
  - `L228 assert.ok(Math.abs(pBrake) <= 0.024 + 1e-9, "the dive keeps the ≈1.4° cap");`
  - `L230 assert.equal(settle(api, { human: true, corridorAccel: -30 }, 60).pitch, 0);`
  - `L231 assert.equal(settle(api, { human: false, axEstSm: -30 }, 60).pitch, 0);`
- L234–248: `test("the aero load sits the car down and rakes it nose-down, and only the load does", () => {`
  - `L238 assert.equal(still.heave, 0);`
  - `L239 assert.equal(still.pitch, 0);`
  - `L240 assert.ok(loaded.heave < -0.008 && loaded.heave > -0.02, 'full load drops the body ~12 mm: ${loaded.heave}');`
  - `L241 assert.ok(loaded.pitch > 0 && loaded.pitch < 0.006, 'full load rakes the nose down (+) a few mrad: ${loaded.pitch}');`
  - `L243 assert.ok(Math.abs(half.heave) < Math.abs(loaded.heave), "the drop scales with the load (∝ v²)");`
- L249–272: `test("the plank bottoms out: the floor never passes the bump stop, and the overshoot is the scrape", () => {`
  - `L254 assert.equal(cruise.baScrape, 0, "a settled car at full load does not scrape");`
  - `L264 assert.ok(worst >= 0.008 - 1e-9, 'the floor went ${worst} m from the road — under the 8 mm stop');`
  - `L265 assert.ok(peak > 0.3, 'a dive into a compression at full load must scrape: peak ${peak}');`
  - `L266 assert.ok(peak <= 1, "scrape is a 0..1 intensity");`
  - `L270 assert.equal(slow.baScrape, 0, "a light brake at low speed does not scrape");`
- L273–308: `test("a kerb strike kicks the body up and kerb-side up, once, scaled by speed", () => {`
  - `L290 assert.ok(right.maxH > 0.008 && right.maxH < 0.05, 'a strike at speed jolts the body up 1-2 cm: ${right.maxH}');`
  - `L291 assert.ok(right.roll > 0.005, 'a RIGHT kerb lifts the right side (+roll): ${right.roll}');`
  - `L292 assert.ok(left.roll < -0.005, 'a LEFT kerb lifts the left side (−roll): ${left.roll}');`
  - `L295 assert.deepEqual(fl.heaves, right.heaves, "a flag flickering at the node rate must not re-strike");`
  - `L298 assert.ok(slow.maxH < right.maxH * 0.5, 'a slow strike is gentler: ${slow.maxH} vs ${right.maxH}');`
  - `L299 assert.equal(strike(5, 0, false).maxH, 0, "no speed, no strike");`
  - `L306 assert.ok(minH < -0.002, 'dropping off the kerb dips the body: ${minH}');`
- L309–331: `test("riding a kerb shivers the body but not the channel the onboard camera reads", () => {`
  - `L316 assert.deepEqual(oa, ob, "the shiver is deterministic — keyed on metres ridden, no clock");`
  - `L321 assert.ok(diffs > 30, 'the returned body offsets must shiver on the kerb (${diffs}/60 frames)');`
  - `L322 assert.ok(maxJ <= 0.004 + 1e-9, 'a shiver, not a bounce: ${maxJ}');`
  - `L327 assert.equal(o.heave, off.baHeave);`
  - `L328 assert.equal(o.roll, off.baRoll);`
- L332–350: `test("off is off: disabled returns zeros, resets state, and the switch persists under apex26.", () => {`
  - `L337 assert.notEqual(c.baPitch, 0);`
  - `L339 assert.equal(st.enabled, false);`
  - `L340 assert.equal(raw.get("apex26.bodyAttitude"), "0");`
  - `L341 assert.equal(c.baPitch, 0, "disabling settles every car to rigid at once");`
  - `L343 assert.deepEqual({ ...off }, { pitch: 0, roll: 0, heave: 0 });`
  - `L344 assert.equal(api.active(), false);`
  - `L346 assert.equal(raw.get("apex26.bodyAttitude"), "1");`
  - `L347 assert.deepEqual({ ...api.offsets(null) }, { pitch: 0, roll: 0, heave: 0, enabled: true }, "no player yet: zeros, never a throw");`
  - `L348 assert.deepEqual({ ...api.update(null, 0, DT, 0, 0) }, { pitch: 0, roll: 0, heave: 0 });`
- L351–370: `test("one pitch sign end to end: game.js dives the body for +pitch, the convention vantage.js reads", () => {`
  - `L356 assert.ok(rot, "body pitch rotation in game.js is present");`
  - `L362 assert.ok(tmpF[1] < 0, '+pitch must dive the nose (forward y ${tmpF[1]})');`
  - `L363 assert.ok(tmpU[2] > 0, "...and tip the roof toward the tail's opposite: up gains +forward");`
  - `L364 assert.ok(Math.abs(Math.hypot(...tmpF) - 1) < 1e-9 && Math.abs(Math.hypot(...tmpU) - 1) < 1e-9, "rotation keeps unit length");`
  - `L367 assert.deepEqual(rigid, [[0, 0, 1], [0, 1, 0]], "zero pitch leaves the basis untouched");`
  - `L369 assert.match(cam, /baPitch > 0 = nose-down = braking/, "the chase g-response's documented sign");`

## body-split.test.mjs

Production target: js/car/car3d.js:1332 lowerZone/:1333 upperZone and bodySplit build; js/car/car-shade.js:778 lowerZone/:783 upperZone (heightZone); Teams liveries.

Imports/fixtures: tools/car/parts-sweep.mjs loadParts with/without shade; Cadillac/McLaren/Haas/Mercedes actual defaults; distinct probe colors; rounded and flat builds; independently derived .80 pod-height line over z[-2,1.05], triangle interior/raycast/depth raster.

Coverage, contract and comment assessment: Fifteen declared cases (two inside smooth loop expand to four) cover lr and absence, shipped lower, both geometry styles vertex/interior area and append-only/no-blend, exact seam/downwash, sponsor opacity/edge, 15–40% side-view lower share, absent/null/carshade-free identity and cockpit/silhouette/lr precedence; Mercedes upper metadata/above-line/lower primary/null, other factory identities and exclusion modes. Upper test uses McLaren-derived signed line for Mercedes rather than Mercedes anchors; may be valid shared flat pod dimensions but weakly couples fixture. No browser lighting/paint proof.

Per-test assertion ledger (source starts and assertion sites; parameterized loops retain their source template):

- L36–39: `test("cadillac ships bodySplit lr", () => {`
  - `L37 assert.equal(team.livery.bodySplit, "lr");`
- L40–53: `test("bodySplit lr recolours left body to c1 and right body to c2", () => {`
  - `L42 assert.equal(liv.bodySplit, "lr");`
  - `L48 assert.ok(left, "found a left-side paint vert");`
  - `L49 assert.ok(right, "found a right-side paint vert");`
  - `L50 assert.ok(near(left, team.color), 'left ${left} ≈ c1 ${team.color}');`
  - `L51 assert.ok(near(right, team.color2), 'right ${right} ≈ c2 ${team.color2}');`
- L54–103: `test("absent bodySplit keeps a single body colour", () => {`
  - `L62 assert.ok(left && right);`
  - `L63 assert.ok(near(left, right, 0.02), "both sides match without bodySplit");`
- L104–113: `test("McLaren and Haas ship a lower body colour", () => {`
  - `L107 assert.ok(Array.isArray(l) && l.length === 3 && l.every((v) => v >= 0 && v <= 1), '${id} livery.lower is an rgb triple');`
  - `L109 assert.deepEqual(mcl.livery.lower, mcl.color2, "the MCL40's lower is its anthracite c2");`
- L114–150: `test('lower (${name}): the body below the line takes it, above stays primary — per vertex and inside every triangle', () => {`
  - `L121 assert.equal(two.mat[v], PAINT, "only paint takes the lower colour");`
  - `L122 assert.ok(signed(y, z, smooth) <= 1e-6 || Math.abs(z - FRONT) < 1e-6, 'lower vertex above the line at y ${y.toFixed(4)} z ${z.toFixed(4)}');`
  - `L124 assert.ok(signed(y, z, smooth) >= -1e-6, 'primary vertex below the line at y ${y.toFixed(4)} z ${z.toFixed(4)}');`
  - `L127 assert.ok(low > 300, 'only ${low} lower vertices: the zone did not run');`
  - `L144 assert.ok(isLow ? d < 0.001 : d > -0.001,`
  - `L148 assert.ok(area > 1, 'lower paints ${area.toFixed(2)} m2 — the pods and chassis sides, not a sliver');`
- L151–173: `test('lower (${name}): recolours and appends only — nothing moves, no other colour changes, no triangle mixes the two', () => {`
  - `L153 assert.ok(added > 0, "a crossing triangle is cut, so vertices are appended");`
  - `L154 assert.equal(liveryEnd(two), end + added, "the appended vertices close the zone's own range");`
  - `L156 for (let k = 0; k < 3; k++) assert.equal(two.pos[v * 3 + k], plain.pos[v * 3 + k], "a zone vertex moved");`
  - `L157 assert.equal(two.mat[v], plain.mat[v], "a surface changed");`
  - `L158 if (!is(plain, v, C1)) assert.deepEqual(colAt(two, v), colAt(plain, v), 'a non-primary colour changed at vertex ${v}');`
  - `L159 else assert.ok(is(two, v, C1) || is(two, v, LOW), "a primary vertex became neither primary nor lower");`
  - `L165 assert.ok(a.length === b.length && a.every((x, i) => Object.is(x, b[i])), '${k} changed after the zone');`
  - `L169 assert.ok(!(q.some((v) => is(two, v, C1)) && q.some((v) => is(two, v, LOW))), "a triangle blends primary into lower");`
- L174–215: `test("lower: the line sits at pod fraction 0.80 down the sidepod flank — the sponsor board's top edge", () => {`
  - `L186 assert.ok(Math.abs(y - lineY(z)) < 1e-6, 'seam vertex ${((y - lineY(z)) * 1000).toFixed(3)} mm off the line at z ${z.toFixed(3)}');`
  - `L190 assert.ok(Math.abs((y - p.bottom) / (p.top - p.bottom) - 0.80) < 1e-6, "the flank seam is at pod fraction 0.80");`
  - `L193 assert.ok(seam > 50 && flank >= 12, 'seam ${seam}, on the pod flanks ${flank}: the line was not cut');`
  - `L196 for (const z of [0.46, 0, -0.38]) assert.equal(lineY(z, true), lineY(z, false), 'the line moved at z ${z}, ahead of the ramp');`
  - `L197 assert.ok(lineY(-1.48, true) < lineY(-1.48, false) - 0.003, "the rounded line does not follow the downwash ramp");`
- L216–237: `test("lower: the sponsor board is opaque over the flank and its top edge IS the line, so the seam never shows on it", () => {`
  - `L224 assert.ok(v >= 0 && two.mat[v] === S.Car3D.SURFACES.panel, '${smooth ? "rounded" : "flat"}: the flank shows through the board at z ${z.toFixed(2)} fraction ${f}');`
  - `L233 assert.ok(Math.abs(top - lineY(z)) < 1e-9, 'board top ${top.toFixed(4)} vs line ${lineY(z).toFixed(4)} at z ${z}');`
- L238–264: `test("lower READS from the side: 15-40 % of the body paint seen from the side (the 0.31 line showed 8 %)", () => {`
  - `L261 assert.ok(share > 0.15 && share < 0.40, '${smooth ? "rounded" : "flat"}: lower is ${(share * 100).toFixed(1)} % of the side-view body paint');`
- L265–271: `test("lower absent is today's car: no lower = lower:null, and the flat build matches one that never heard of CarShade", () => {`
  - `L266 assert.ok(same(builds[true].plain, buildMcl(null), ALL), "lower: null (resolveLivery's shape) changed the build");`
  - `L269 assert.ok(same(builds[false].plain, today, ALL), "a flat no-lower build with CarShade loaded differs from the CarShade-free build");`
- L272–298: `test("lower is ignored by the cockpit and silhouette builds, and under bodySplit lr", () => {`
  - `L274 assert.ok(same(buildMcl(undefined, o), buildMcl(LOW, o), ALL), '${Object.keys(o)[0]}: lower changed the build');`
  - `L280 assert.equal(cad.livery.bodySplit, "lr");`
  - `L281 assert.ok(same(b({}), b({ lower: LOW }), ALL), "bodySplit lr must win over lower");`
- L299–303: `test("Mercedes ships an upper body colour matching its cover silver", () => {`
  - `L300 assert.ok(Array.isArray(mer.livery.upper) && mer.livery.upper.length === 3);`
  - `L301 assert.deepEqual(mer.livery.upper, mer.livery.cover, "W17 upper band is the same silver as the engine cover");`
- L304–327: `test("upper: the body above the line takes it, below stays primary", () => {`
  - `L313 assert.equal(two.mat[v], PAINT, "only paint takes the upper colour");`
  - `L315 assert.ok(signed(y, z, false) >= -1e-6 || Math.abs(z - FRONT) < 1e-6,`
  - `L322 assert.ok(up > 200, 'only ${up} upper vertices: the zone did not run');`
  - `L323 assert.ok(primBelow > 100, 'only ${primBelow} primary verts below the line — lower chassis vanished');`
  - `L325 assert.ok(same(plain, buildMer(null, { smooth: false }), ALL), "upper: null changed the build");`
- L328–349: `test("upper absent leaves every non-Mercedes factory car byte-identical to today", () => {`
  - `L336 assert.equal(liv.upper, undefined, '${t.id} must not ship upper (FORBIDDEN team edits)');`
  - `L342 assert.ok(same(a, b, ALL), '${t.id}: upper:null changed a team that never set upper');`
  - `L347 assert.equal(same(withU, without, ["col"]), false, "Mercedes upper must recolour the body");`
- L350–359: `test("upper is ignored by the cockpit and silhouette builds, and under bodySplit lr", () => {`
  - `L352 assert.ok(same(buildMer(undefined, o), buildMer(UP, o), ALL), '${Object.keys(o)[0]}: upper changed the build');`
  - `L358 assert.ok(same(b({}), b({ upper: UP }), ALL), "bodySplit lr must win over upper");`

