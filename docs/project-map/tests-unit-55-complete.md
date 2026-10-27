# Unit batch 55 — complete source map

Read-only mapping on 2026-10-27. All 11 assigned files (4,703 lines) were read completely in individually returned slices of at most 100 lines. An initial aggregate response truncated; all obscured spans were re-read in smaller returned batches. No tests, browser sessions, runtime edits or commits were performed. Source hashes below identify the exact mapped bytes. Case ranges include complete test calls; assertion ranges identify assertion calls, including multiline predicates. Test names are source labels, not execution verdicts.

## Navigation evidence

AGENTS.md and `.claude/skills/code-nav/SKILL.md` were read. Attached apex-lsp definitions/references confirmed production ownership:

| Symbol | Definition | Production reference evidence (file counts include declaration/export rows) |
|---|---|---|
| `Input` | `js/input/input.js:4` | 301 references / 28 files; game, steering tuning, physics, agent, UI and XR |
| `TrackMesh.nodeGrid` | `js/track/core/mesh.js:602` | 4 / 3: mesh, build-props, nature |
| `TrackGeom.roundNormals` | `js/track/core/geom.js:59` | 3 / 2: geom, nature |
| `TrackHiddenFaces.strip` | `js/track/core/hidden-faces.js:540` | 3 / 2: hidden-faces, tracks |
| `Tracks.build` | `js/track/tracks.js:471` | 4 / 3: tracks, game, build-worker |
| `Tracks.buildCenterline` | `js/track/tracks.js:47` | 8 / 7: tracks, designer, followup-tools, insight, validate, build-worker, track-maps |
| `TrackDef.fromRaw` | `js/track/core/def.js:143` | 8 / 5: def, custom-tracks, validate, lobby-settings, tracks |
| `TrackCodec` | `js/editor/codec.js:15` | 15 / 3: codec, designer, custom-tracks |
| `CustomTracks` | `js/editor/custom-tracks.js:14` | 70 / 13: editor, game, networking, select-screen and settings-export |
| `DesignerCanvas` | `js/editor/canvas.js:10` | 10 / 4: canvas, designer, profile, followup-tools |
| `TrackDesigner` | `js/editor/designer.js:12` | 16 / 3: designer, custom-tracks, select-screen |

LSP resolved `touchSpeedFromSlider` at `js/input/steer-tuning.js:190` using module-file fallback and explicitly did not verify export/caller coverage. Tooling and test-helper exports outside js/ were located through bounded textual declaration search; they are not claimed as LSP production references.

## `tests/unit/touch-drag-anchor.test.mjs`

Full read: 1–236. SHA256: `5230b8b8c11c3049306b946344ae9ac0be26d74850733f8770b393bbb0a7264b`. 10 declared test calls.

Fixture/support: `boot` (18–104) provides fake elements/listeners, 844×390 viewport, manually advanced clock and real input modules; `dragOff` (106–110) reads the dot transform.

Exercised ownership: `Input` in `js/input/input.js`: init, steer modes, smoothing, reset, touch event listeners, debugState.

Limits: Synthetic event dispatch and shared fake class set do not establish browser layout, capture, real device rotation or rendering.

### "anchor sits at touch-down X and Y"

- Case: 112–119. Fixtures: `boot`; shared fixture and limits above apply.
- Exercised calls: `Input.setSteerMode`
- Assertion semantics and spans:
  - 116–116: `assert.ok(classOn.has("on"))`
  - 117–117: `assert.equal(dragEl.style.left, "220px")`
  - 118–118: `assert.equal(dragEl.style.top, "410px")`
### "offset dot tracks horizontal drag and clamps at full lock"

- Case: 121–134. Fixtures: `boot`; shared fixture and limits above apply.
- Exercised calls: `Input.setSteerMode`, `Input.setDragSmoothing`, `Input.debugState`
- Assertion semantics and spans:
  - 129–129: `assert.equal(dragOff(dragEl), "35px")`
  - 132–132: `assert.equal(dragOff(dragEl), range + "px")`
  - 133–133: `assert.equal(Input.debugState().touchSteer, 1)`
### "the drag range reads the viewport on resize, not on every touch (B·H11)"

- Case: 136–156. Fixtures: `boot`; shared fixture and limits above apply.
- Exercised calls: `Input.setSteerMode`, `Input.setDragSmoothing`
- Assertion semantics and spans:
  - 150–150: `assert.equal(lockAt(10), before + "px")`
  - 152–152: `assert.equal(lockAt(11), before + "px", "no live viewport read per touch")`
  - 154–154: `assert.equal(lockAt(12), touchRangePx(sb) + "px", "a resize re-reads the long edge")`
  - 155–155: `assert.notEqual(touchRangePx(sb), before)`
### "hides when the steering touch lifts"

- Case: 158–165. Fixtures: `boot`; shared fixture and limits above apply.
- Exercised calls: `Input.setSteerMode`
- Assertion semantics and spans:
  - 162–162: `assert.ok(classOn.has("on"))`
  - 164–164: `assert.ok(!classOn.has("on"))`
### "no-op without #drag-anchor or outside TOUCH steer mode"

- Case: 167–177. Fixtures: `boot`; shared fixture and limits above apply.
- Exercised calls: `Input.setSteerMode`
- Assertion semantics and spans:
  - 171–171: `assert.equal(noEl.classOn.size, 0)`
  - 176–176: `assert.ok(!classOn.has("on"))`
### "follows the touch that is actually steering (last press wins)"

- Case: 179–189. Fixtures: `boot`; shared fixture and limits above apply.
- Exercised calls: `Input.setSteerMode`
- Assertion semantics and spans:
  - 184–184: `assert.equal(dragEl.style.left, "520px")`
  - 185–185: `assert.equal(dragEl.style.top, "640px")`
  - 187–187: `assert.equal(dragEl.style.left, "80px")`
  - 188–188: `assert.equal(dragEl.style.top, "120px")`
### "hides while a menu overlay is open"

- Case: 191–197. Fixtures: `boot`; shared fixture and limits above apply.
- Exercised calls: `Input.setSteerMode`
- Assertion semantics and spans:
  - 196–196: `assert.ok(!classOn.has("on"))`
### "reset() clears the drag smoothing so the next press starts at the finger (B·H20)"

- Case: 199–213. Fixtures: `boot`; shared fixture and limits above apply.
- Exercised calls: `Input.setSteerMode`, `Input.setDragSmoothing`, `Input.steer`, `Input.reset`
- Assertion semantics and spans:
  - 208–208: `assert.ok(Input.steer() > 0.9, "the drag reached lock")`
  - 212–212: `assert.equal(Input.steer(), 0, "an anchored press reads 0, not the previous drag")`
### "a window touchend with no fingers left frees a steering finger whose canvas touchend was lost (B·H20)"

- Case: 215–225. Fixtures: `boot`; shared fixture and limits above apply.
- Exercised calls: `Input.setSteerMode`, `Input.setDragSmoothing`, `Input.steer`
- Assertion semantics and spans:
  - 221–221: `assert.equal(Input.steer(), 1)`
  - 224–224: `assert.equal(Input.steer(), 0, "the ghost finger no longer pins the wheel")`
### "a rotation drops a drag whose anchor lives in the old screen space (B·H20)"

- Case: 227–236. Fixtures: `boot`; shared fixture and limits above apply.
- Exercised calls: `Input.setSteerMode`, `Input.setDragSmoothing`, `Input.steer`
- Assertion semantics and spans:
  - 235–235: `assert.equal(Input.steer(), 0, "a finger that did not move reads no steer after a rotation")`

## `tests/unit/touch-drag-speed.test.mjs`

Full read: 1–175. SHA256: `01e15203c87a8821bf464f169d400081cefb6b24e2471b08728e04b0fb689809`. 8 declared test calls.

Fixture/support: `boot` (23–58) loads real input in a fake 1000×500 DOM; `arm` (65–76), `rangeAt` (78–80), REF=41.7, DEAD=5 and BASE=120 isolate speed adaptation.

Exercised ownership: `Input` in `js/input/input.js`; slider extraction and source guards in `js/input/steer-tuning.js`.

Limits: No driving physics or browser input; final slider case executes an extracted function and regex-checks wiring, so surrounding initialization is not exercised.

### "OPT-IN: with no DRAG AT SPEED choice the range is the tip's fixed range at rest and at 300 km/h"

- Case: 82–95. Fixtures: `boot`; shared fixture and limits above apply.
- Exercised calls: `Input` in `js/input/input.js`; slider extraction and source guards in `js/input/steer-tuning.js`.
- Assertion semantics and spans:
  - 92–92: `assert.equal(st.touchSpeedMix, 0, "the speed-sensitive range is off by default")`
  - 93–93: `assert.equal(st.touchRangePx, BASE, 'range at ${(speed * 3.6).toFixed(0)} km/h is the tip's ${BASE}px, got ${st.touchRangePx}')`
### "at rest the drag range is the old fixed fraction, with the assist on or off"

- Case: 97–104. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Input` in `js/input/input.js`; slider extraction and source guards in `js/input/steer-tuning.js`.
- Assertion semantics and spans:
  - 101–101: `assert.equal(off, BASE, 'static range is long edge × 0.12, got ${off}')`
  - 102–102: `assert.equal(on, off, "speed 0 with both mixes full is the same range")`
  - 103–103: `assert.equal(knobOnly, off, "ADAPTIVE BUTTONS off keeps the static range at rest")`
### "mid speed doubles the range when the assist is full on, high speed widens it further"

- Case: 106–115. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Math.abs`
- Assertion semantics and spans:
  - 111–111: `assert.ok(Math.abs(mid - rest * 2) < 1e-9, 'at ${REF} m/s range ${mid} should be 2 × ${rest}')`
  - 113–113: `assert.ok(Math.abs(high - rest * factor) < 1e-6, 'at 90 m/s range ${high} should be ${rest * factor}')`
  - 114–114: `assert.ok(high > mid && mid > rest, "the range only grows as speed rises")`
### "the widened range is the same fraction digitalRateIn sheds"

- Case: 117–129. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Input.debugState`, `Input.setAdaptiveButtons`, `Input.setSpeedStd`, `Math.abs`
- Assertion semantics and spans:
  - 126–127: `assert.ok(Math.abs(st.touchRangePx - base / scale) < 1e-6, 'at ${speed} m/s range ${st.touchRangePx} should be ${base} / ${scale} (rate ${st.rateIn})')`
### "the same finger travel steers less at mid speed and less again at high speed"

- Case: 131–143. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Input.steer`, `Math.abs`
- Assertion semantics and spans:
  - 140–140: `assert.ok(Math.abs(low - 0.5) < 1e-9, 'at rest half the range is half lock, got ${low}')`
  - 141–141: `assert.ok(Math.abs(mid - 0.25) < 1e-9, 'at ${REF} m/s the same travel is a quarter lock, got ${mid}')`
  - 142–142: `assert.ok(high < mid && high > 0, 'at 90 m/s ${high} should be less than mid ${mid} and still a turn')`
### "DRAG AT SPEED off, or ADAPTIVE BUTTONS off, restores the fixed range at every speed"

- Case: 145–151. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Input` in `js/input/input.js`; slider extraction and source guards in `js/input/steer-tuning.js`.
- Assertion semantics and spans:
  - 148–148: `assert.equal(rangeAt(speed, { adapt: 1, touch: 0 }), fixed, 'knob off at ${speed} m/s')`
  - 149–149: `assert.equal(rangeAt(speed, { adapt: 0, touch: 1 }), fixed, 'adaptive off at ${speed} m/s')`
### "a maxed assist at absurd speed keeps a fifth of the static range, not zero"

- Case: 153–157. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Math.abs`
- Assertion semantics and spans:
  - 156–156: `assert.ok(Math.abs(absurd - rest / 0.05) < 1e-6, 'floor keeps ${rest / 0.05} px, got ${absurd}')`
### "touchSpeedFromSlider: notch 1 is off, notch 10 is full, monotonic"

- Case: 159–175. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Math.abs`
- Assertion semantics and spans:
  - 162–162: `assert.ok(at >= 0, "touchSpeedFromSlider missing")`
  - 169–169: `assert.equal(f(1), 0)`
  - 170–170: `assert.equal(f(10), 1)`
  - 171–171: `assert.ok(Math.abs(f(5) - 4 / 9) < 1e-12)`
  - 172–172: `assert.ok(f(v + 1) > f(v), 'not increasing at notch ${v}')`
  - 173–173: `assert.match(src, /store\.get\("touchDragSpeed", 1\)/, "OPT-IN: an absent key is notch 1, the fixed range")`
  - 174–174: `assert.match(src, /wireTune\("pm-touchdragspeed", "touchDragSpeed", 1,/)`

## `tests/unit/track-accuracy-validator.test.mjs`

Full read: 1–38. SHA256: `4d756c816d0dcf25b518c4dcd7620cf2813e72990e597dd5387fd9c4c94658b7`. 4 declared test calls.

Fixture/support: Closed unit square (9), translated/scaled, reversed and distorted variants; synthetic mapping/object/Map entries.

Exercised ownership: `compareCircuit` (67), `MAX_SHAPE_ERROR` (3), `validateMappings` (84) in `tools/track/track-accuracy-validator.mjs`.

Limits: Synthetic planar shapes only: does not read external reference datasets or validate the shipped fleet.

### "validator accepts equivalent translated and scaled circuit shapes"

- Case: 11–15. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `compareCircuit` (67), `MAX_SHAPE_ERROR` (3), `validateMappings` (84) in `tools/track/track-accuracy-validator.mjs`.
- Assertion semantics and spans:
  - 13–13: `assert.equal(result.directionMatch, true)`
  - 14–14: `assert.ok(result.shapeError < 0.02)`
### "validator rejects a reversed circuit fixture"

- Case: 17–20. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `compareCircuit` (67), `MAX_SHAPE_ERROR` (3), `validateMappings` (84) in `tools/track/track-accuracy-validator.mjs`.
- Assertion semantics and spans:
  - 19–19: `assert.equal(result.directionMatch, false)`
### "validator rejects a materially distorted circuit fixture"

- Case: 22–26. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `compareCircuit` (67), `MAX_SHAPE_ERROR` (3), `validateMappings` (84) in `tools/track/track-accuracy-validator.mjs`.
- Assertion semantics and spans:
  - 25–25: `assert.ok(result.shapeError > MAX_SHAPE_ERROR)`
### "mapping validation reports every missing game and reference circuit"

- Case: 28–38. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `compareCircuit` (67), `MAX_SHAPE_ERROR` (3), `validateMappings` (84) in `tools/track/track-accuracy-validator.mjs`.
- Assertion semantics and spans:
  - 34–37: `assert.deepEqual(issues, [ 'missing reference "ref-a" for game circuit "alpha"', 'missing game circuit "beta" for reference "ref-b"', ])`

## `tests/unit/track-build-grids.test.mjs`

Full read: 1–129. SHA256: `d752c32755df6c0ce8a8ec81196c8c96926bf810606094104c639c2209c6f719`. 3 declared test calls.

Fixture/support: Manifest TRACK_VM engine prefix (30–42); seeded mulberry32 (45–54), 600 nodes/400 rectangle trials and mixed giant/small box scene.

Exercised ownership: `TrackMesh.nodeGrid` in `js/track/core/mesh.js:602`; `TrackGeom.roundNormals` in `js/track/core/geom.js:59`; `TrackHiddenFaces.strip` in `js/track/core/hidden-faces.js:540`; scratch/addBox support.

Limits: Deterministic finite fuzz and CPU geometry only; comments about fleet byte identity are historical context, not assertions executed here.

### "nodeGrid.queryRects = query() minus the nodes outside A ∪ B, order kept"

- Case: 56–79. Fixtures: `rng`; shared fixture and limits above apply.
- Exercised calls: `E.TrackMesh.nodeGrid`, `Math.floor`
- Assertion semantics and spans:
  - 75–75: `assert.deepEqual(got, want, 'trial ${t}')`
  - 78–78: `assert.ok(nonEmpty > 100 && twoRects > 100, 'the fuzz exercised the union (${nonEmpty} non-empty, ${twoRects} with B)')`
### "roundNormals leaves a non-array accumulator alone (no NaN integer keys)"

- Case: 81–95. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `E.TrackModels.scratch`, `E.TrackGeom.addBox`, `Object.keys`, `E.TrackGeom.roundNormals`
- Assertion semantics and spans:
  - 87–87: `assert.equal(Object.keys(acc.nrm).length, keys, "no keys were added to the accumulator")`
  - 93–93: `assert.notDeepEqual(out.nrm, before, "an indexable buffer still rounds")`
  - 94–94: `assert.ok(out.nrm.every(Number.isFinite))`
### "hidden-face strip: a giant box (coarse grid) hides exactly what a brute-force scan says"

- Case: 97–129. Fixtures: `rng`; shared fixture and limits above apply.
- Exercised calls: `E.TrackGeom.addBox`, `Math.abs`, `P.every`, `E.TrackHiddenFaces.strip`, `Array.from`
- Assertion semantics and spans:
  - 124–124: `assert.ok(hidden > 12 * 60 && want.length > 0, 'the scene exercises both grids (${hidden} hidden)')`
  - 126–126: `assert.equal(st.boxes, boxes.length)`
  - 127–127: `assert.equal(st.enclosed, hidden)`
  - 128–128: `assert.deepEqual(Array.from(geo.idx), want)`

## `tests/unit/track-build-load.test.mjs`

Full read: 1–60. SHA256: `4854eb9412e173aa7ef9feb26e1b3a0c243b6d0b56b9fed0b18832074e6d50fe`. 2 declared test calls.

Fixture/support: Real `buildContext` from `tools/track/verify-track.cjs`, Nürburgring def, VM Math.abs instrumentation; seeded 4000 unit-normal pairs.

Exercised ownership: `Tracks.build` in `js/track/tracks.js:471`; pine coplanar guard in `js/track/scenery/nature.js`.

Limits: Counts all Math.abs calls in one circuit build rather than pine-only work or wall time; second case proves a numerical window superset independently rather than calling the guard directly.

### "a Nürburgring build stays inside its Math.abs budget (the pine guard tests a window, not every pair)"

- Case: 25–39. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Tracks.LIST.find`, `Tracks.build`
- Assertion semantics and spans:
  - 33–33: `assert.ok(def, "nurburgring is in Tracks.LIST")`
  - 35–35: `assert.ok(track && track.meshes, "the build returned a world")`
  - 37–37: `assert.ok(n > 500_000, 'the counter saw the build (${n} calls)')`
  - 38–38: `assert.ok(n <= NURBURGRING_ABS_BUDGET, '${n} Math.abs calls in one Nürburgring build (budget ${NURBURGRING_ABS_BUDGET}) — a scan over every facet pair is back')`
### "the windowed guard finds the same parallel facet pairs as the full scan"

- Case: 41–60. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Math.sqrt`, `Math.cos`, `Math.sin`, `Math.hypot`, `G0.map`, `Math.abs`
- Assertion semantics and spans:
  - 57–57: `assert.ok(inWindow, 'parallel pair outside the window: F=${F} G=${G}')`
  - 59–59: `assert.ok(found > 1000, "the sample exercised parallel pairs (" + found + ")")`

## `tests/unit/track-build-vm-release.test.mjs`

Full read: 1–303. SHA256: `7a642380fab5d9381bb65e827aac735218621c5c09b3736d404bdb06d99c39e6`. 6 declared test calls.

Fixture/support: Cached real harness context (43–44), Monza; depth-8 deduplicating reachable-slot counter (49–62); Monaco/Monza STRIP constants (154–267); Monza/Vegas/Silverstone capacity loop.

Exercised ownership: `buildContext`, mark/trim/release in `tools/lib/track-build-vm.cjs` (48; trim 192, release 214–230); Tracks build, hidden-face strip and `js/track/scenery/build-props.js` allocation estimate.

Limits: Reachable slots and typed-array capacity are deterministic proxies, not GC/RSS proof; geometry snapshots deliberately require maintenance when scenery changes. Generated template case expands for Monaco and Monza.

### "an unreleased build really does pin millions of slots — the problem is real"

- Case: 64–75. Fixtures: `build`, `ctxOnce`; shared fixture and limits above apply.
- Exercised calls: `buildContext`, mark/trim/release in `tools/lib/track-build-vm.cjs` (48; trim 192, release 214–230); Tracks build, hidden-face strip and `js/track/scenery/build-props.js` allocation estimate.
- Assertion semantics and spans:
  - 72–74: `assert.ok(held > 3e6, 'a built track pinned only ${(held / 1e6).toFixed(2)} M slots. If a build no ' + 'longer holds the geometry, release() is obsolete — delete it and this file.')`
### "release() empties the geometry buffers and the mesh capture"

- Case: 77–99. Fixtures: `build`, `ctxOnce`; shared fixture and limits above apply.
- Exercised calls: `Object.keys`, `Array.isArray`, `ArrayBuffer.isView`, `Object.entries`
- Assertion semantics and spans:
  - 81–81: `assert.equal(ctxOnce().release(t), t, "release returns the track it was given")`
  - 83–85: `assert.ok(after < before / 10, 'release() freed ${(before / 1e6).toFixed(2)} M -> ${(after / 1e6).toFixed(2)} M slots; ' + "it must drop at least nine tenths of what a build pins")`
  - 91–91: `assert.equal(v.length, 0, 'track.${k}.${f} still holds ${v.length} slots')`
  - 97–97: `assert.equal(m.__cap.pos.length, 0, 'meshes.${name}.__cap.pos still holds vertices')`
### "release() keeps every measurement a sweep reads off the track"

- Case: 101–125. Fixtures: `build`, `ctxOnce`; shared fixture and limits above apply.
- Exercised calls: `buildContext`, mark/trim/release in `tools/lib/track-build-vm.cjs` (48; trim 192, release 214–230); Tracks build, hidden-face strip and `js/track/scenery/build-props.js` allocation estimate.
- Assertion semantics and spans:
  - 116–122: `assert.deepEqual({ n: t.n, total: t.total, px: t.px.length, py: t.py.length, pz: t.pz.length, hw: t.hw.length, graph: t.graph.nodes.length, boxes: t.pit.row.boxes.length, rowS0: t.pit.row.s0, side: t.pit.side, mode: t.pit.mode, lamps: (t.lampPosts \|\| []).length, roadVerts: t.meshes.road.verts, surface: typeof t.surface, uv: t.propsGeo.uv, }, keep, "release() changed something a sweep reads")`
  - 123–124: `assert.ok(keep.n > 100 && keep.boxes === 12 && keep.graph > 100, "the kept fields were non-trivial to begin with")`
### "trim(from) drops the primitive records and the live-buffer set"

- Case: 127–136. Fixtures: `ctxOnce`, `build`; shared fixture and limits above apply.
- Exercised calls: `buildContext`, mark/trim/release in `tools/lib/track-build-vm.cjs` (48; trim 192, release 214–230); Tracks build, hidden-face strip and `js/track/scenery/build-props.js` allocation estimate.
- Assertion semantics and spans:
  - 131–131: `assert.ok(ctx.prims.length > mark, "a build records primitives")`
  - 132–132: `assert.ok(ctx.liveBufs.size > 0, "…and the meshes they reached")`
  - 134–134: `assert.equal(ctx.prims.length, mark, "trim truncates to the mark")`
  - 135–135: `assert.equal(ctx.liveBufs.size, 0, "trim clears the live-buffer set")`
### `${id}: props index strip is at the measured share and deterministic`

- Case: 269–285. Fixtures: `build`, `ctxOnce`; shared fixture and limits above apply.
- Exercised calls: `Array.from`
- Assertion semantics and spans:
  - 274–274: `assert.equal(s.trisBefore, want.before, "props emission moved: re-measure STRIP")`
  - 275–276: `assert.equal(s.trisAfter, want.after, 'stripped ${s.trisBefore - s.trisAfter} (enclosed ${s.enclosed}, buried ${s.buried}, bottom ${s.bottom})')`
  - 277–277: `assert.equal(idxA.length, s.trisAfter * 3)`
  - 278–278: `assert.equal(s.enclosed + s.buried + s.bottom, s.trisBefore - s.trisAfter)`
  - 279–279: `assert.ok(idxA.every((i) => i >= 0 && i < V), "surviving indices in range")`
  - 282–282: `assert.equal(b.propsGeo.pos.length / 3, V, "vertex buffer untouched")`
  - 283–283: `assert.deepEqual(Array.from(b.propsGeo.idx), idxA, "deterministic across rebuilds")`
### "the props accumulators start at a per-circuit estimate and spare capacity stays small (M-6)"

- Case: 288–303. Fixtures: `build`, `ctxOnce`; shared fixture and limits above apply.
- Exercised calls: `JSON.stringify`
- Assertion semantics and spans:
  - 299–299: `assert.ok(ratios[id] < 1.3, '${id}: capacity ${ratios[id]}x the data')`
  - 302–302: `assert.match(src, /const out = TrackModels\.scratch\(Math\.round\(track\.total \* \d+\)\)/, "build-props passes a per-circuit estimate")`

## `tests/unit/track-build-wait.test.mjs`

Full read: 1–278. SHA256: `828b77e6b6451f763f435f1d719fb253b7aea58a2184a88a360593c2639af1dc`. 19 declared test calls.

Fixture/support: Bounded scripted `fakePage` (21–31), in-page `livePage` with temporary window restore (120–132), fake boot streams (161–162), HTTP EventEmitter mocks and injected time/deadline functions.

Exercised ownership: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.

Limits: Harness contracts rather than game runtime; most fake evaluate calls return scripted snapshots, while livePage explicitly executes predicates. Small real timers still depend on scheduling; no real HTTP server or browser.

### "resolves as soon as the track is there"

- Case: 33–37. Fixtures: `fakePage`; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 36–36: `assert.ok(page.calls >= 3, "returned before it saw the track")`
### "keeps waiting while the build is still LOGGING, however slow"

- Case: 39–48. Fixtures: `fakePage`; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 47–47: `assert.ok(page.calls > 200, "gave up on a build that was visibly progressing")`
### "FAILS on a stall, and says which of the two happened"

- Case: 50–62. Fixtures: `fakePage`; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 53–61: `assert.rejects( () => awaitTrackBuild(page, 30, 4000), (e) => { assert.match(e.message, /STALLED/, "the stall error must name the stall"); assert.match(e.message, /wedged build, not a slow box/, "the message must distinguish the two"); assert.match(e.message, /Log id 7/, "the message must carry the observed progress id"); return true; }, "a wedged build did not fail — the detector waits forever")`
  - 56–56: `assert.match(e.message, /STALLED/, "the stall error must name the stall")`
  - 57–57: `assert.match(e.message, /wedged build, not a slow box/, "the message must distinguish the two")`
  - 58–58: `assert.match(e.message, /Log id 7/, "the message must carry the observed progress id")`
### "the hard cap ends the wait even if the stall check is broken"

- Case: 64–75. Fixtures: `fakePage`; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 71–74: `assert.rejects( () => awaitTrackBuild(fakePage(steps, 400), 10_000, 60), /hard cap/, "the wait can loop forever — a broken stall check would hang the worker, not fail it")`
### "the stall budget is a real number, and shorter than the old deadline"

- Case: 77–84. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Number.isFinite`
- Assertion semantics and spans:
  - 78–79: `assert.ok(Number.isFinite(TRACK_HARD_MS) && TRACK_HARD_MS > TRACK_STALL_MS, "the hard cap must exist and sit above the stall budget")`
  - 82–82: `assert.ok(Number.isFinite(TRACK_STALL_MS) && TRACK_STALL_MS > 0, "TRACK_STALL_MS is not a usable budget")`
  - 83–83: `assert.ok(TRACK_STALL_MS < 45000, "the stall budget is no longer faster than the deadline it replaced")`
### "fixtures.js IMPORTS the names it calls, it does not merely re-export them"

- Case: 97–112. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 107–109: `assert.ok(imported, 'fixtures.js calls ${name}() but never imports it — ' + '\'export { ${name} } from …\' does NOT create a local binding, so every call is a ReferenceError')`
  - 110–110: `assert.ok(!(reExportOnly && !imported), '${name} is re-exported without being imported')`
### "raceFlag: a reused page's old world is not ready until this start settles"

- Case: 136–141. Fixtures: `livePage`; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 140–140: `assert.equal(page.calls, 5, "returned before the race() thenable settled, or long after")`
### "raceFlag: a start that rejects fails with its reason"

- Case: 143–148. Fixtures: `livePage`; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 146–147: `assert.rejects(() => awaitTrackBuild(page, 1000, 4000, { raceFlag: "__apexLoadTrack" }), /race start failed before the grid: Race start settings changed/)`
### "no raceFlag: the old predicate, unchanged"

- Case: 150–154. Fixtures: `livePage`; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 153–153: `assert.equal(page.calls, 1)`
### "awaitApexBoot: resolves once __apex binds"

- Case: 164–168. Fixtures: `bootPage`; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 167–167: `assert.equal(page.calls, 2)`
### "awaitApexBoot: keeps waiting while the boot still makes progress"

- Case: 170–177. Fixtures: `bootPage`; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 176–176: `assert.ok(page.calls > 200, "gave up on a boot that was visibly progressing")`
### "awaitApexBoot: FAILS on a silent boot, and names the stall"

- Case: 179–182. Fixtures: `bootPage`; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 180–181: `assert.rejects(() => awaitApexBoot(bootPage([{ ready: false, n: 3 }]), 30, 4000, FAST), /boot STALLED.*progress 3/, "a dead boot did not fail")`
### "awaitApexBoot: the hard cap ends a boot that never binds"

- Case: 184–188. Fixtures: `bootPage`; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 187–187: `assert.rejects(() => awaitApexBoot(bootPage(steps, 400), 10_000, 60, FAST), /hard cap/)`
### "awaitApexBoot: a destroyed execution context (navigation) counts as progress"

- Case: 190–197. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 196–196: `assert.equal(i, 50)`
### "awaitApexBoot: the stall window is the old BOOT_MS, never longer"

- Case: 199–204. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 203–203: `assert.equal(BOOT_STALL_MS, boot, "a silent boot must fail exactly when the old fixed wait did")`
### "track progress survives a full fixed-length log ring"

- Case: 206–219. Fixtures: `livePage`; shared fixture and limits above apply.
- Exercised calls: `Array.from`
- Assertion semantics and spans:
  - 218–218: `assert.equal(page.calls, 8)`
### "server preflight rejects HTTP errors and unrelated HTML"

- Case: 221–238. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Buffer.from`
- Assertion semantics and spans:
  - 235–235: `assert.rejects(globalSetup({ projects: [{ use: { baseURL: "http://localhost:3456" } }] }, { attempts: 1 }), /HTTP 500\|Apex shell/)`
### "server retry pauses and request timeouts share one overall deadline"

- Case: 241–252. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `awaitTrackBuild` (49), `awaitApexBoot` (103) and constants in `tests/helpers/await-track-build.js`; fixtures import guard; `waitForServer` (19), `ping` (47), globalSetup in `tests/helpers/global-setup.js`.
- Assertion semantics and spans:
  - 245–249: `assert.rejects(waitForServer("http://localhost:3456", { now: () => now, request: async (_url, budget) => { budgets.push(budget); now += budget; throw new Error("request deadline"); }, delay: async ms => { now += ms; }, }), /after 2 attempts \(budget 10000 ms\)/)`
  - 250–250: `assert.deepEqual(budgets, [5000, 4800])`
  - 251–251: `assert.equal(now, 10000, "pauses cannot extend the overall deadline")`
### "server preflight accepts the Apex marker and times out an unfinished body"

- Case: 254–278. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Buffer.from`
- Assertion semantics and spans:
  - 274–274: `assert.rejects(ping("http://localhost:3456", 5), /Timed out after 5 ms/)`
  - 275–275: `assert.equal(destroyed, true, "request is closed after either verdict")`

## `tests/unit/track-centerline-seam.test.mjs`

Full read: 1–46. SHA256: `41e9e62e66baadcf444f1953581b2246b920ce3c5ebc1df154ab7b41c32849f0`. 2 declared test calls.

Fixture/support: Real verification context; independent Catmull–Rom evaluator (8–10); Monza/Suzuka/Singapore/Mont Tremblant closing chords; empty renderer fixture.

Exercised ownership: `Tracks.buildCenterline` in `js/track/tracks.js:47`; `Tracks.build` at 471.

Limits: Four circuits and X/Z closing interpolation; Y is intentionally excluded because elevations can change it. No GPU upload/render evidence.

### "the final centerline node interpolates the actual dense closing chord"

- Case: 12–38. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Tracks.LIST.find`, `Tracks.buildCenterline`, `Math.hypot`, `Math.abs`, `Math.max`, `Math.min`, `Math.acos`, `Number.isFinite`
- Assertion semantics and spans:
  - 15–15: `assert.ok(def, '${id} is a shipped circuit')`
  - 24–24: `assert.ok(f > 0 && f < 1, '${id} final target lies in closing chord; f=${f}')`
  - 30–31: `assert.ok(Math.abs(actual - expected[axis]) < 0.001, '${id} axis ${axis}: closing-chord ${expected[axis]}, sampled ${actual}')`
  - 35–35: `assert.ok(Math.acos(seamDot) < Math.PI / 90, '${id} closing tangent turns <2 degrees per node')`
  - 36–36: `assert.ok(Number.isFinite(track.curv[0]) && Number.isFinite(track.curv[n - 1]))`
### "a full track build requires an upload-capable renderer"

- Case: 40–46. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `Tracks.LIST.find`, `Tracks.build`, `Tracks.buildCenterline`
- Assertion semantics and spans:
  - 42–43: `assert.throws(() => Tracks.build(def, { gfx: {} }), /requires gfx\.createMesh/, "a partial track would have neither barriers nor opened pit boundary")`
  - 44–45: `assert.ok(Tracks.buildCenterline(def).n > 0, "centerline-only callers retain the explicit CPU-only entry point")`

## `tests/unit/track-codec.test.mjs`

Full read: 1–313. SHA256: `5bd02557da518c7a4eb41d0c1b1620b38639daf312968d2b431e4db3701c0d3e`. 15 declared test calls.

Fixture/support: `bootEditor`, ellipse/design/plain from `tests/helpers/editor-vm.mjs`; real engine/editor codec and store stub, lattice design, EDGE fraction, sameId helper (137–147), compression streams and corrupt/checksum-repaired byte fixtures.

Exercised ownership: `TrackCodec` in `js/editor/codec.js:15`; `CustomTracks` in `js/editor/custom-tracks.js:14`; random/validate/theme support.

Limits: Node stream/browser-global substitutes and synthetic inputs; no clipboard, actual URL navigation, real files, persistence durability or renderer. Numerical tolerance and caps are explicit in assertions.

### "encode → decode is the identity on the lattice, and the id survives"

- Case: 12–32. Fixtures: `bootEditor`, `design`; shared fixture and limits above apply.
- Exercised calls: `C.sanitize`, `CD.encode`, `CD.decode`, `Math.abs`
- Assertion semantics and spans:
  - 19–19: `assert.match(code, /^APXT1\.[pz]\.[A-Za-z0-9_-]+$/)`
  - 20–20: `assert.ok(code.length < 1200, 'code is ${code.length} chars')`
  - 22–22: `assert.equal(back.ok, true, back.reason)`
  - 23–23: `assert.equal(back.id, it.id, "same content id on both ends")`
  - 24–24: `assert.deepEqual(plain(back.design.pts), plain(it.pts))`
  - 25–25: `assert.equal(back.design.theme, "harbour")`
  - 25–25: `assert.equal(back.design.baseHW, 6.5)`
  - 25–25: `assert.equal(back.design.seed, 123456789)`
  - 26–26: `assert.equal(back.design.name, "CTE D'AZUR GP", "the name is re-sanitised (printable ASCII, upper-case)")`
  - 28–28: `assert.ok(Math.abs(back.design.hwZones[0].s0 - 0.2) < 1e-4 && back.design.hwZones[0].hw === 5.5)`
  - 29–29: `assert.ok(Math.abs(back.design.bankZones[0].frac - 0.4) < 1e-4 && back.design.bankZones[0].angleDeg === 6 && back.design.bankZones[0].widthM === 120)`
  - 30–30: `assert.deepEqual(plain(back.design.elevations), [{ s: back.design.elevations[0].s, halfM: 150, rise: 5 }])`
  - 31–31: `assert.equal(back.design.bridges[0].rise, 8)`
### "the country rides as a label: round-trips, stays out of the content id, absent when unset"

- Case: 34–48. Fixtures: `bootEditor`, `design`; shared fixture and limits above apply.
- Exercised calls: `C.sanitize`, `C.toRaw`, `CD.decode`, `CD.encode`, `CD.encodeBytes`, `C.sanitizeCountry`
- Assertion semantics and spans:
  - 38–38: `assert.equal(withC.country, "Sweden")`
  - 39–39: `assert.equal("country" in without, false, "unset: nothing stored")`
  - 40–40: `assert.equal(withC.id, without.id, "a label: same content id")`
  - 41–41: `assert.equal(C.toRaw(withC).country, "Sweden", "the def carries it to the picker's flag")`
  - 43–43: `assert.equal(back.ok, true, back.reason)`
  - 44–44: `assert.equal(back.design.country, "Sweden")`
  - 46–46: `assert.equal(bytes[1] & CD.FLAG.country, 0, "a code without a country sets no country bit (older builds refuse it)")`
  - 47–47: `assert.equal(C.sanitizeCountry(" Côte d'Ivoire<script> "), "Côte d'Ivoirescript", "letters, digits, space . ' - only")`
### "second-order deltas keep a 150-point loop under ~700 chars; deflate is used only when shorter"

- Case: 50–63. Fixtures: `bootEditor`, `design`; shared fixture and limits above apply.
- Exercised calls: `TR.generate`, `CD.encodeBytes`, `CD.encode`, `CD.b64url`, `CD.decode`
- Assertion semantics and spans:
  - 54–54: `assert.ok(bytes.length < 600, '${g.pts.length} points in ${bytes.length} bytes')`
  - 57–57: `assert.ok(code.length < plainCode.length, "z. only when it wins")`
  - 58–58: `assert.equal(code, plainCode)`
  - 59–59: `assert.ok(code.length < 760, 'code ${code.length} chars')`
  - 61–61: `assert.equal(back.ok, true, back.reason)`
  - 62–62: `assert.deepEqual(plain(back.design.pts), plain(g.pts))`
### "every bad code is refused with a reason, never an exception"

- Case: 65–95. Fixtures: `bootEditor`, `design`, `ellipse`; shared fixture and limits above apply.
- Exercised calls: `CD.encode`, `CD.decode`, `C.sanitize`, `Object.assign`, `CD.decodeBytes`, `CD.encodeBytes`, `CD.fnv16`
- Assertion semantics and spans:
  - 79–79: `assert.equal(r.ok, false, code.slice(0, 20))`
  - 80–80: `assert.equal(r.reason, reason, code.slice(0, 24))`
  - 84–84: `assert.equal(raw({ pts: ellipse(7) }).reason, "bounds")`
  - 85–85: `assert.equal(raw({ pts: ellipse(201, 900, 500) }).reason, "bounds")`
  - 86–86: `assert.equal(raw({ pts: ellipse(36, 20000, 500) }).reason, "bounds")`
  - 87–87: `assert.equal(raw({ baseHW: 9 }).reason, "bounds")`
  - 88–88: `assert.equal(raw({ theme: "parkland" }).ok, true)`
  - 92–92: `assert.equal(CD.decodeBytes(fixed).reason, "theme")`
  - 93–93: `assert.equal(CD.decodeBytes(new Uint8Array(3)).reason, "bounds")`
  - 94–94: `assert.equal(CD.decodeBytes(null).reason, "bounds")`
### "full-lap hw zone 0→1 survives share encode/decode with the same content id"

- Case: 97–107. Fixtures: `bootEditor`, `design`; shared fixture and limits above apply.
- Exercised calls: `C.sanitize`, `CD.encode`, `CD.decode`
- Assertion semantics and spans:
  - 101–101: `assert.deepEqual(plain(it.hwZones[0]), { s0: 0, s1: 1, hw: 5.5, ease: 0.01 })`
  - 104–104: `assert.equal(back.ok, true, back.reason)`
  - 105–105: `assert.equal(back.id, it.id)`
  - 106–106: `assert.deepEqual(plain(back.design.hwZones[0]), { s0: 0, s1: 1, hw: 5.5, ease: 0.01 })`
### "URL fragment and file envelope helpers"

- Case: 109–132. Fixtures: `bootEditor`; shared fixture and limits above apply.
- Exercised calls: `CD.shareUrl`, `CD.fromHash`, `CD.withoutTrack`, `CD.fileEnvelope`, `CD.fromFile`
- Assertion semantics and spans:
  - 111–111: `assert.equal(CD.shareUrl("APXT1.p.AAA", "https://x.test/f1/"), "https://x.test/f1/#track=APXT1.p.AAA")`
  - 112–112: `assert.equal(CD.fromHash("#track=APXT1.p.AAA"), "APXT1.p.AAA")`
  - 113–113: `assert.equal(CD.fromHash("#ghost=zzz&track=APXT1.p.BBB"), "APXT1.p.BBB")`
  - 114–114: `assert.equal(CD.fromHash("#ghost=zzz"), null)`
  - 115–115: `assert.equal(CD.withoutTrack("#track=APXT1.p.AAA"), "")`
  - 116–116: `assert.equal(CD.withoutTrack("#ghost=zzz&track=APXT1.p.AAA"), "#ghost=zzz")`
  - 118–118: `assert.equal(env.format, "apex26.track")`
  - 118–118: `assert.equal(env.v, 1)`
  - 118–118: `assert.equal(env.code, "APXT1.p.AAA")`
  - 119–119: `assert.deepEqual(plain(CD.fromFile(env)), { code: "APXT1.p.AAA" })`
  - 120–120: `assert.deepEqual(plain(CD.fromFile({ format: "apex26.track", design: { pts: [] } })), { design: { pts: [] } })`
  - 121–121: `assert.equal(CD.fromFile({ format: "apex26-career-backup-v1" }), null)`
  - 122–122: `assert.equal(CD.fromFile(null), null)`
  - 126–126: `assert.equal(CD.shareUrl("APXT1.p.AAA"), "https://brycejmurrin.github.io/f1-game/#track=APXT1.p.AAA")`
  - 127–127: `assert.equal(CD.shareUrl("APXT1.p.AAA", "https://x.test/game/"), "https://x.test/game/#track=APXT1.p.AAA")`
  - 131–131: `assert.equal(CD.shareUrl("APXT1.p.AAA"), "https://x.test/game/#track=APXT1.p.AAA")`
### "fractional hill lengths retain the sender's content id in a share code"

- Case: 149–153. Fixtures: `bootEditor`, `design`; shared fixture and limits above apply.
- Exercised calls: `TrackCodec` in `js/editor/codec.js:15`; `CustomTracks` in `js/editor/custom-tracks.js:14`; random/validate/theme support.
- Assertion semantics and spans:
  - 151–152: `sameId(CD, C, design({ elevations: [{ s: 0.5, halfM: 22.2, rise: 60 }], bridges: [{ s: 0.8, halfM: 22.2, rise: -60 }] }), "fractional hills at both grade caps")`
### "id equality: an hwZone without `ease`, 24 of every zone list, and fractions ≈ 1"

- Case: 155–178. Fixtures: `bootEditor`, `design`; shared fixture and limits above apply.
- Exercised calls: `Object.values`, `Array.from`, `C.sanitize`, `CD.encodeBytes`
- Assertion semantics and spans:
  - 158–158: `sameId(CD, C, design({ hwZones: [{ s0: 0.2, s1: 0.3, hw: 5.5 }] }), "no ease")`
  - 160–160: `assert.deepEqual(Object.values(CD.ZONE_CAPS), [C.LIMITS.zones, C.LIMITS.zones, C.LIMITS.zones, C.LIMITS.zones], "ZONE_CAPS = CustomTracks.LIMITS.zones")`
  - 168–168: `sameId(CD, C, full, "24 of each")`
  - 169–169: `assert.equal(back.design[k].length, n, k + ": all " + n + " survive")`
  - 172–172: `assert.throws(() => CD.encodeBytes(over, true), /zones/)`
  - 175–176: `sameId(CD, C, design({ hwZones: [{ s0: 0.95, s1: EDGE, hw: 6, ease: 0.02 }], bankZones: [{ frac: EDGE, angleDeg: 6, widthM: 80 }], elevations: [{ s: EDGE, halfM: 100, rise: 2 }], bridges: [{ s: EDGE, halfM: 120, rise: 3 }] }), "frac ≈ 1", false)`
  - 177–177: `sameId(CD, C, design({ elevations: [{ s: 0, halfM: 100, rise: 2 }, { s: 1, halfM: 90, rise: 1 }] }), "frac 0 and 1")`
### "CustomTracks.sanitize is idempotent at a fraction ≈ 1 (the stored id survives a reload)"

- Case: 184–190. Fixtures: `bootEditor`, `design`; shared fixture and limits above apply.
- Exercised calls: `C.sanitize`
- Assertion semantics and spans:
  - 188–188: `assert.equal(C.sanitize(it).id, it.id, "sanitize(sanitize(x)) keeps the id")`
  - 189–189: `sameId(CD, C, d, "frac ≈ 1, re-sanitised")`
### "fromHash: a malformed %-escape is null, not a URIError"

- Case: 192–197. Fixtures: `bootEditor`; shared fixture and limits above apply.
- Exercised calls: `CD.fromHash`
- Assertion semantics and spans:
  - 194–194: `assert.equal(CD.fromHash("#track=%E0%A4%A"), null)`
  - 195–195: `assert.equal(CD.fromHash("#ghost=1&track=%"), null)`
  - 196–196: `assert.equal(CD.fromHash("#track=APXT1.p.%41"), "APXT1.p.A")`
### "inflate: an oversized stream is cut off under MAX_BYTES; no DecompressionStream reads as unsupported"

- Case: 199–221. Fixtures: `bootEditor`; shared fixture and limits above apply.
- Exercised calls: `CD.inflate`, `CD.decode`, `CD.b64url`
- Assertion semantics and spans:
  - 205–205: `assert.ok(bomb.length < 200, 'the bomb is ${bomb.length} bytes')`
  - 207–207: `assert.deepEqual([r.ok, r.reason], [false, "bounds"])`
  - 209–209: `assert.deepEqual([viaCode.ok, viaCode.reason], [false, "bounds"])`
  - 213–213: `assert.equal(ok.ok, true)`
  - 213–213: `assert.deepEqual([...ok.bytes], [1, 2, 3])`
  - 219–219: `assert.deepEqual([u.ok, u.reason], [false, "unsupported"])`
### "scenery options (FLAG.look): one byte only when off default, round-trips, moves the id; a bad byte or an unknown flag is refused"

- Case: 223–260. Fixtures: `bootEditor`, `design`; shared fixture and limits above apply.
- Exercised calls: `CD.encodeBytes`, `C.sanitize`, `Object.assign`, `CD.decode`, `CD.encode`, `CD.decodeBytes`, `CD.fnv16`
- Assertion semantics and spans:
  - 229–229: `assert.deepEqual([...dflt], [...plainBytes])`
  - 230–230: `assert.equal(C.sanitize(Object.assign({}, base, { look: { time: "auto" } })).id, C.sanitize(base).id, "default look → the same id")`
  - 233–233: `assert.notEqual(it.id, C.sanitize(base).id, "a look is a different circuit (rebuild)")`
  - 235–235: `assert.equal(bytes.length, plainBytes.length + 1, "one byte")`
  - 236–236: `assert.equal(bytes[1] & CD.FLAG.look, CD.FLAG.look)`
  - 238–238: `assert.equal(back.ok, true, back.reason)`
  - 239–239: `assert.deepEqual(plain(back.design.look), look)`
  - 240–240: `assert.equal(back.id, it.id)`
  - 245–245: `assert.equal(r.ok, true)`
  - 247–247: `assert.deepEqual(r.design.look ? plain(r.design.look) : undefined, want)`
  - 252–252: `assert.equal(CD.decodeBytes(reCheck(bad)).reason, "bounds")`
  - 254–254: `assert.equal(CD.decodeBytes(reCheck(high)).reason, "bounds")`
  - 256–256: `assert.equal(CD.decodeBytes(reCheck(flag)).reason, "corrupt", "an unknown flag bit is still refused")`
  - 258–258: `assert.equal(C.sanitize(Object.assign({}, base, { look: { time: "noon", trees: 7 } })).look, undefined)`
  - 259–259: `assert.deepEqual(plain(C.sanitize(Object.assign({}, base, { look: { crowd: "packed", time: "x" } })).look), { time: "auto", trees: "normal", crowd: "packed" })`
### "surface opts (kerb + berms): trailing byte only when off default; round-trips; moves the id; bad byte refused"

- Case: 262–295. Fixtures: `bootEditor`, `design`; shared fixture and limits above apply.
- Exercised calls: `CD.encodeBytes`, `C.sanitize`, `CD.surfaceByte`, `Object.assign`, `CD.decode`, `CD.encode`, `CD.fnv16`, `CD.decodeBytes`, `C.toRaw`
- Assertion semantics and spans:
  - 267–267: `assert.equal(CD.surfaceByte(C.sanitize(base)), 0)`
  - 268–268: `assert.equal(C.sanitize(Object.assign({}, base, { kerbStyle: "flat", berms: true })).id, C.sanitize(base).id)`
  - 270–270: `assert.notEqual(sausage.id, C.sanitize(base).id, "sausage kerbs are a different circuit")`
  - 271–271: `assert.equal(sausage.kerbStyle, "sausage")`
  - 273–273: `assert.equal(bytes.length, plainBytes.length + 1, "one trailing surface byte")`
  - 275–275: `assert.equal(back.ok, true, back.reason)`
  - 276–276: `assert.equal(back.design.kerbStyle, "sausage")`
  - 277–277: `assert.equal(back.id, sausage.id)`
  - 280–280: `assert.equal(both.berms, false)`
  - 282–282: `assert.equal(r2.ok, true, r2.reason)`
  - 283–283: `assert.equal(r2.design.kerbStyle, "rumble")`
  - 284–284: `assert.equal(r2.design.berms, false)`
  - 285–285: `assert.equal(r2.id, both.id)`
  - 289–289: `assert.equal(CD.decodeBytes(reCheck(bad)).reason, "bounds")`
  - 293–293: `assert.equal(raw.kerbStyle, "sausage")`
  - 294–294: `assert.equal(raw.berms, true)`
### "a hostile 282-char share code of a ~990 km loop is refused before anything builds it (13-F1)"

- Case: 297–304. Fixtures: `bootEditor`; shared fixture and limits above apply.
- Exercised calls: `CD.decode`
- Assertion semantics and spans:
  - 300–300: `assert.equal(code.length, 282)`
  - 302–302: `assert.equal(r.ok, false, "the base decoded this to lengthM 993532 and V.check then took 10 s / 227 MB")`
  - 303–303: `assert.equal(r.reason, "geometry")`
### "Unicode country labels round trip within the 32-unit storage limit"

- Case: 306–313. Fixtures: `bootEditor`, `design`; shared fixture and limits above apply.
- Exercised calls: `CD.decode`, `CD.encode`, `C.sanitizeCountry`
- Assertion semantics and spans:
  - 310–310: `assert.equal(back.ok, true, back.reason)`
  - 311–311: `assert.equal(back.design.country, C.sanitizeCountry(country))`

### Shared assertion helpers

- `sameId` (137–147): 139–139: `assert.ok(it, label + ": sanitises")`; 141–141: `assert.ok(code, label + ": encodes")`; 143–143: `assert.equal(back.ok, true, label + ": " + back.reason)`; 144–144: `assert.equal(back.id, it.id, label + ": same content id on both ends")`; 145–145: `assert.equal(C.sanitize(back.design).id, it.id, label + ": …and after the receiver's own sanitize")`.

## `tests/unit/track-def-factory.test.mjs`

Full read: 1–137. SHA256: `d57dd28bad997753e87e41f12af72e1a259b6014f2c647f78c4c80273a79807e`. 5 declared test calls.

Fixture/support: Real verify-track context; golden hashes `tests/data/def-factory-golden.json`; canonical hashEntry (31–37), synthetic ellipsePath (41–47), four width-zone controls and Suzuka raw def.

Exercised ownership: `TrackDef.fromRaw` in `js/track/core/def.js:143`; lazy points and width remaps; `Tracks.LIST`, `Tracks.buildCenterline`.

Limits: Golden hashes cover enumerable non-functions and points rounded to six decimals, excluding custom; first case name says builds but hashes LIST metadata/materialized points, not complete uploaded mesh bytes. Inline scenery is retained but deliberately not invoked.

### "every shipped circuit builds to the bytes it built to before the factory moved"

- Case: 49–62. Fixtures: `hashEntry`; shared fixture and limits above apply.
- Exercised calls: `Object.keys`, `Tracks.LIST.filter`
- Assertion semantics and spans:
  - 52–52: `assert.equal(typeof ctx.TrackDef, "object", "js/track/core/def.js must define TrackDef in the TRACK_VM context")`
  - 53–53: `assert.equal(typeof ctx.TrackDef.fromRaw, "function")`
  - 60–60: `assert.deepEqual(bad, [], "a LIST entry no longer matches the pre-extraction golden — the def factory changed how that circuit builds")`
  - 61–61: `assert.equal(Object.keys(GOLDEN).length, Tracks.LIST.filter((t) => !t.custom).length, "golden rows == shipped circuits")`
### "rotating or reversing a full-lap width zone still narrows the whole built road"

- Case: 64–83. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `TrackDefs.find`, `TrackDef.fromRaw`, `Tracks.buildCenterline`
- Assertion semantics and spans:
  - 76–76: `assert.equal(after.n, before.n, '${id}: the resample is unchanged')`
  - 77–77: `assert.equal(after.total, before.total, '${id}: lap length is unchanged')`
  - 78–78: `assert.deepEqual(after[axis], before[axis], '${id}: ${axis}')`
  - 79–79: `assert.ok(narrowed.points.every((p) => p[3] === 3), '${id}: every control point receives the zone')`
  - 80–80: `assert.ok(after.hw.every((hw) => hw === 3), '${id}: every resampled road node receives the zone')`
  - 81–81: `assert.ok(before.hw.some((hw) => hw > 3), '${id}: the width change is observable')`
### "fromRaw IS the LIST mapper: the same raw def yields the same entry"

- Case: 85–94. Fixtures: `hashEntry`; shared fixture and limits above apply.
- Exercised calls: `Tracks.LIST.find`, `Object.keys(again).sort`, `Object.keys`, `Object.keys(built).sort`
- Assertion semantics and spans:
  - 91–91: `assert.deepEqual(Object.keys(again).sort(), Object.keys(built).sort(), "same key set")`
  - 92–92: `assert.equal(hashEntry(again), hashEntry(built), "same metadata and materialised points")`
  - 93–93: `assert.equal(again.custom, false)`
### "a runtime def (no script tag, no scenery file) builds a centreline through the same factory"

- Case: 96–130. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `TrackDef.fromRaw`, `Number.isFinite`, `JSON.parse`, `JSON.stringify`, `Array.isArray`, `Tracks.buildCenterline`, `Math.abs`, `Math.max`
- Assertion semantics and spans:
  - 111–111: `assert.equal(def.custom, true)`
  - 112–112: `assert.equal(def.classic, false)`
  - 113–113: `assert.ok(Number.isFinite(def.gpLaps) && def.gpLaps > 10, "gpLaps derives from lengthKm")`
  - 114–114: `assert.deepEqual(JSON.parse(JSON.stringify(def.palette.grass)), [0.2, 0.4, 0.2], "pal merges over dayPal defaults")`
  - 115–115: `assert.ok(Array.isArray(def.palette.kerbA), "…which supply the rest")`
  - 116–116: `assert.equal(typeof def.scenery, "function", "an inline closure rides the def (build-props resolves def.scenery before the registry)")`
  - 119–119: `assert.equal(pts.length, 40)`
  - 120–120: `assert.ok(pts.every((p) => p.length === 5 && p.every(Number.isFinite)))`
  - 121–121: `assert.equal(pts[0][3], 7, "baseHW outside the window")`
  - 122–122: `assert.ok(pts[12][3] < 6, "hwZone 0.25–0.35 narrows index 12/40")`
  - 123–123: `assert.deepEqual(JSON.parse(JSON.stringify(def.elevations)), [{ s: 0.6, halfM: 150, rise: 6 }], "no startFrac → no remap")`
  - 125–125: `assert.ok(Math.abs(tr.total - path40.len) / path40.len < 0.03, 'total ${tr.total} ≈ chord length ${path40.len}')`
  - 126–126: `assert.ok(tr.n >= 200 && tr.curv.length === tr.n)`
  - 128–128: `assert.ok(kmax > 1 / 400 && kmax < 1 / 150, 'an 800x500 ellipse peaks near 1/312 m⁻¹ (got 1/${(1 / kmax).toFixed(0)})')`
  - 129–129: `assert.equal(marker.length, 0, "buildCenterline never runs scenery (that is build())")`
### "a def without a path still fails loudly, naming the circuit"

- Case: 132–137. Fixtures: local inline values / enclosing file fixture; shared fixture and limits above apply.
- Exercised calls: `TrackDef.fromRaw`
- Assertion semantics and spans:
  - 136–136: `assert.throws(() => def.points, /custom-nopath.*no 'path'/)`

## `tests/unit/track-designer-dom.test.mjs`

Full read: 1–2988. SHA256: `4b05f20d0e6e4793126779a85a98c78d1559788d71c4e5674ac3c89e19174655`. 98 declared test calls.

Fixture/support: `bootScreen` (20–47): real editor engine plus `makeDom` and no-op 2D canvas, fake G/title clicks; persisted boot (52–84) uses real GameStore serialization with Map disk/quota control and manual debounce; openGreen (340), shortLoop (897–905), bootCanvas (749–767), bootHooked (1337–1342), recordingCanvas (1625–1636), hilly/spy fixtures (2316–2320,2649–2663).

Exercised ownership: `TrackDesigner` in `js/editor/designer.js:12`; `DesignerCanvas` in `js/editor/canvas.js:10`; screen modules listed at line 18; CustomTracks/TrackCodec/TrackValidate, TrackDef, themes, props, insight, profile, followup tools, GameStore, MenuNav and game-source contract.

Limits: Mini DOM/no-op or recording canvas proves state, attributes, callback ordering, selected text/fills and serialization; it does not prove pixels, layout, focus behavior of native dialogs, trusted events, actual downloads/share sheets or full race integration. RaceIntro/startRace/render/hud are stubs; game handoff is a regex contract. Some cases intentionally swap globals with narrow doubles.

### "workspace remembers each mode and tab, reveals stamp controls, and routes persistent checks"

- Case: 86–111. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setTool`, `b.D.setMode`, `b.D.showPane`, `b.D.state`, `b.D.isOpen`
- Assertion semantics and spans:
  - 90–90: `assert.equal(fold.open, false, "unused stamp parameters begin collapsed")`
  - 91–91: `assert.equal(fold.open, true, "choosing a stamp reveals its parameters")`
  - 95–95: `assert.equal(rail.scrollTop, 85)`
  - 96–96: `assert.equal(rail.scrollTop, 180)`
  - 99–99: `assert.match(checks.textContent, /CHECKS/)`
  - 101–101: `assert.equal(b.D.state().mode, "test")`
  - 102–102: `assert.deepEqual(plain(b.D.state().design), before, "navigation never edits the circuit")`
  - 106–106: `assert.equal(menu.open, false)`
  - 106–106: `assert.equal(b.D.isOpen(), true, "Escape closes just the file menu")`
  - 109–109: `assert.equal(menu.open, false, "gamepad Back closes just the file menu too")`
  - 110–110: `assert.equal(b.D.isOpen(), true)`
### "workspace keeps validation failures reachable when save is blocked"

- Case: 113–122. Fixtures: `bootScreen`, `shortLoop`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.state`
- Assertion semantics and spans:
  - 117–117: `assert.equal(checks.disabled, false, "blocked save must not disable the review action")`
  - 118–118: `assert.match(checks.textContent, /TO FIX/)`
  - 120–120: `assert.equal(b.D.state().mode, "test")`
  - 121–121: `assert.equal(b.root.querySelector('[aria-label="Design checks"]').parentNode.hidden, false)`
### "init() builds the rail before any design exists; open() randomises a green loop; close() hides"

- Case: 124–150. Fixtures: `bootScreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.isOpen`, `b.D.open`, `b.D.state`, `b.D.randomise`, `b.D.preview`, `Number.isInteger`, `b.D.close`, `b.C.draft`
- Assertion semantics and spans:
  - 126–126: `assert.equal(b.D.init(b.G, { custom: b.C, root: b.root }), true, "init builds into the shell dialog")`
  - 127–127: `assert.equal(b.root.hidden, false, "the shell dialog stays as the shell left it (hidden is the open flag, flipped by open())")`
  - 128–128: `assert.equal(b.dom.byId("td-close").hidden, false, "the shell's close control is adopted and shown")`
  - 129–129: `assert.ok(b.root.querySelector(".td-body"), "body built")`
  - 130–130: `assert.ok(b.root.querySelector(".td-foot"), "foot built")`
  - 131–131: `assert.equal(b.D.isOpen(), false)`
  - 133–133: `assert.equal(b.D.isOpen(), true)`
  - 135–135: `assert.ok(st.design && st.design.pts.length >= 8, "open() with no draft randomises a loop")`
  - 136–136: `assert.equal(b.D.randomise(7), true, "seed 7 finds a loop the validator accepts")`
  - 138–138: `assert.equal(v.ok, true, "the engine-built preview is green: " + v.issues.map((i) => i.code + ":" + i.level).join(","))`
  - 140–140: `assert.equal(st.pending, false)`
  - 141–141: `assert.ok(st.lengthM >= 2500 && st.lengthM <= 7000, "lap length in bounds: " + st.lengthM)`
  - 142–142: `assert.ok(st.design.pts.every((p) => Number.isInteger(p[0] * 4) && Number.isInteger(p[1] * 4)), "lattice")`
  - 144–144: `assert.equal(again, true)`
  - 145–145: `assert.deepEqual(plain(b.D.state().design.pts), plain(st.design.pts), "deterministic per seed")`
  - 147–147: `assert.equal(b.D.isOpen(), false)`
  - 148–148: `assert.equal(b.root.hidden, true)`
  - 149–149: `assert.ok(b.C.draft(), "a draft is autosaved on close")`
### "the rail's edits: stamp, undo/redo, reverse, start, delete floor, theme, width, name"

- Case: 152–192. Fixtures: `bootScreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.randomise`, `b.D.preview`, `b.D.state`, `b.D.setTool`, `b.D.applyStamp`, `b.D.undo`, `b.D.redo`, `b.D.reverse`, `b.D.setStart`, `b.D.setTheme`, `b.D.setWidth`, `b.D.setName`, `b.C.sanitizeName`, `b.D.deletePoint`
- Assertion semantics and spans:
  - 158–158: `assert.equal(b.D.applyStamp(3, 3), true, "a CORNER stamps after point 4")`
  - 163–163: `assert.notDeepEqual(p1, p0, "the stamp changed the loop")`
  - 164–164: `assert.deepEqual(p1.slice(0, 4), p0.slice(0, 4), "…downstream of the anchor only")`
  - 165–165: `assert.equal(b.D.state().undo, u0 + 1)`
  - 166–166: `assert.equal(b.D.undo(), true)`
  - 167–167: `assert.deepEqual(plain(b.D.state().design.pts), p0)`
  - 168–168: `assert.equal(b.D.state().redo, 1)`
  - 169–169: `assert.equal(b.D.redo(), true)`
  - 170–170: `assert.deepEqual(plain(b.D.state().design.pts), p1)`
  - 173–173: `assert.equal(b.D.reverse(), true)`
  - 175–175: `assert.deepEqual(rev[0], plain(before[0]), "REVERSE keeps the start point")`
  - 176–176: `assert.deepEqual(rev[1], plain(before[before.length - 1]), "…and walks the loop the other way")`
  - 177–177: `assert.equal(b.D.setStart(5), true)`
  - 178–178: `assert.deepEqual(plain(b.D.state().design.pts[0]), rev[5], "START HERE rotates the chosen point to index 0")`
  - 179–179: `assert.equal(b.D.setStart(0), false, "the start itself is refused")`
  - 180–180: `assert.equal(b.D.setTheme("alpine"), true)`
  - 181–181: `assert.equal(b.D.state().design.theme, "alpine")`
  - 182–182: `assert.equal(b.D.setTheme("nope"), false)`
  - 183–183: `assert.equal(b.D.setWidth(9), true)`
  - 184–184: `assert.equal(b.D.state().design.baseHW, 8, "width clamps to the registry's cap")`
  - 186–186: `assert.equal(b.D.state().design.name, b.C.sanitizeName("my test!! loop that is far too long for the cap"))`
  - 190–190: `assert.equal(n, b.C.LIMITS.ptsMin)`
  - 191–191: `assert.equal(b.D.deletePoint(0), false, "the point floor holds")`
### "SAVE lands in CustomTracks + Tracks.LIST (same geometry updates, never duplicates); RACE presses the title door"

- Case: 194–214. Fixtures: `bootScreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.randomise`, `b.D.preview`, `b.D.save`, `JSON.stringify`, `b.D.state`, `b.Tracks.LIST.filter`, `b.D.race`, `b.D.isOpen`
- Assertion semantics and spans:
  - 200–200: `assert.equal(r.ok, true, "save: " + JSON.stringify(r))`
  - 201–201: `assert.match(r.id, /^custom-[0-9a-f]{8}$/)`
  - 202–202: `assert.equal(b.Tracks.LIST.length, base + 1)`
  - 204–204: `assert.equal(t.id, r.id)`
  - 204–204: `assert.equal(t.custom, true)`
  - 205–205: `assert.ok((t.turns \|\| []).length >= 3, "baked turns")`
  - 206–206: `assert.equal(typeof t.scenery, "function", "the theme's inline scenery closure rides the def")`
  - 207–207: `assert.deepEqual(plain(b.D.state().library), [r.id])`
  - 209–209: `assert.equal(b.Tracks.LIST.filter((x) => x.custom).length, 1, "re-saving the same geometry updates")`
  - 210–210: `assert.equal(b.D.race("tt"), true)`
  - 211–211: `assert.equal(b.D.isOpen(), false, "RACE closes the screen")`
  - 212–212: `assert.deepEqual(b.clicks, ["mb-tt"], "…and presses the TIME TRIAL door")`
  - 213–213: `assert.equal(b.Tracks.LIST[b.G.trackIdx].id, r.id, "the façade's trackIdx points at the saved circuit")`
### "a freehand stroke closes into a valid loop"

- Case: 216–227. Fixtures: `bootScreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `Math.cos`, `Math.sin`, `b.D.freehand`, `b.D.preview`
- Assertion semantics and spans:
  - 222–222: `assert.equal(b.D.freehand(path), true)`
  - 224–224: `assert.ok(v.tr, "the engine built the drawn loop")`
  - 225–225: `assert.ok(v.tr.total > 3000, "≈ the drawn perimeter: " + v.tr.total)`
  - 226–226: `assert.equal(b.D.freehand([[0, 0], [1, 1]]), false, "two points are not a loop")`
### "share out / in: a code, a link and an exported file all load back as the same design; a #track= link opens the screen"

- Case: 229–277. Fixtures: `bootScreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.randomise`, `b.D.preview`, `b.D.state`, `b.C.sanitize`, `b.D.shareCode`, `b.D.exportEnvelope`, `b.D.share`, `b.CD.shareUrl`, `JSON.stringify`, `b.D.loadFrom`, `b.D.close`, `b.C.create`, `b.C.consumeTrackHash`, `b.D.isOpen`
- Assertion semantics and spans:
  - 235–235: `assert.match(code, /^APXT1\.[pz]\./, "an APXT1 share code")`
  - 236–236: `assert.equal(b.D.state().lastCode, code)`
  - 238–238: `assert.equal(env.format, b.CD.FILE_FORMAT)`
  - 238–238: `assert.equal(env.code, code)`
  - 238–238: `assert.ok(env.design && env.design.pts.length === pts.length)`
  - 243–243: `assert.equal(url, b.CD.shareUrl(code))`
  - 244–244: `assert.deepEqual(plain(written), [url])`
  - 245–245: `assert.equal(msgText(b), "Share link copied", "no character-count noise in the status")`
  - 249–249: `assert.notDeepEqual(plain(b.D.state().design.pts), pts)`
  - 250–250: `assert.equal(await b.D.loadFrom(text), true, "loads from " + text.slice(0, 12))`
  - 251–251: `assert.deepEqual(plain(b.D.state().design.pts), pts)`
  - 252–252: `assert.equal(b.C.sanitize(b.D.state().design).id, id, "the content id survives the round trip")`
  - 254–254: `assert.equal(await b.D.loadFrom("APXT1.p.not-a-code"), false, "a bad code is refused, not thrown")`
  - 255–255: `assert.equal(await b.D.loadFrom("{\"format\":\"other\"}"), false, "a foreign file is refused")`
  - 256–256: `assert.equal(await b.D.loadFrom(""), false)`
  - 268–268: `assert.equal(await b.C.consumeTrackHash(), true)`
  - 269–269: `assert.equal(b.D.isOpen(), true, "the designer opened on the shared design")`
  - 270–270: `assert.deepEqual(plain(b.D.state().design.pts), pts)`
  - 271–271: `assert.deepEqual(plain(replaced), ["/?x=1"], "the fragment is stripped, the query kept")`
  - 273–273: `assert.equal(await b.C.consumeTrackHash(), false, "no link, no-op")`
  - 275–275: `assert.equal(await b.C.consumeTrackHash(), false, "a bad link is refused and still stripped")`
  - 276–276: `assert.equal(replaced.length, 2)`
### "the terrain material knob: desert and alpine presets name it, shipped defs carry only the allowlisted ones"

- Case: 279–293. Fixtures: `bootScreen`; shared fixture and limits above apply.
- Exercised calls: `b.T.defFields`, `Object.assign`
- Assertion semantics and spans:
  - 281–281: `assert.equal(b.T.defFields("alpine").terrainMat, "SNOW")`
  - 282–282: `assert.equal(b.T.defFields("oasis").terrainMat, "SAND")`
  - 283–283: `assert.equal(b.T.defFields("desertnight").terrainMat, "SAND")`
  - 284–284: `assert.equal("terrainMat" in b.T.defFields("parkland"), false)`
  - 288–288: `assert.equal(t.terrainMat, SHIPPED[t.id], t.id + " terrainMat")`
  - 290–290: `assert.equal(def.terrainMat, "SNOW")`
  - 292–292: `assert.equal("terrainMat" in bad, false, "only SAND / SNOW / CONCRETE are honoured")`
### "DesignerCanvas: fit() frames the loop; an arrow nudge comes back as a lattice-aligned edit"

- Case: 295–315. Fixtures: `bootScreen`; shared fixture and limits above apply.
- Exercised calls: `b.DC.create`, `Math.abs`, `JSON.stringify`
- Assertion semantics and spans:
  - 303–303: `assert.equal(v.w, 640)`
  - 303–303: `assert.equal(v.h, 400)`
  - 304–304: `assert.ok(Math.abs(v.cx - 50) < 1 && Math.abs(v.cz - 30) < 1, "centred on the loop: " + JSON.stringify(v))`
  - 305–305: `assert.ok(v.scale > 3 && v.scale < 6, "scaled to fit 100 m into 640 px with margin: " + v.scale)`
  - 308–308: `assert.equal(changes.length, 2)`
  - 309–309: `assert.deepEqual(plain(changes[0]), { begin: true })`
  - 310–310: `assert.equal(changes[1].kind, "nudge", "a keyboard nudge (the designer folds a run of them into one UNDO)")`
  - 311–311: `assert.deepEqual(plain(changes[1].pts[2]), [90.25, 60.25], "10 m left, snapped to the 0.25 m lattice")`
  - 312–312: `assert.deepEqual(pts[2], [100.125, 60.3], "the array it was handed is untouched")`
  - 314–314: `assert.ok(cv.view().scale > v.scale)`
### "RANDOMISE that finds no green loop leaves the current design alone"

- Case: 343–361. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `Object.assign`, `b.D.randomise`
- Assertion semantics and spans:
  - 354–354: `assert.equal(b.D.randomise(99), false)`
  - 355–355: `assert.deepEqual(plain(b.D.state().design), before, "failed RANDOMISE must not commit a RED candidate")`
  - 356–356: `assert.equal(b.D.state().undo, undo, "no history entry on refusal")`
  - 357–357: `assert.ok(String(msgText(b)).includes("No clean loop"), msgText(b))`
### "REVERSE and START HERE carry every zone type to the same place on the loop; a bank keeps its angle (sign included)"

- Case: 363–391. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `Object.assign`, `b.D.load`, `b.D.reverse`, `b.D.state`, `Object.keys(z).sort`, `Object.keys`, `b.D.setStart`, `Math.hypot`, `b.C.sanitize`, `b.C.toRaw`
- Assertion semantics and spans:
  - 367–367: `assert.equal(b.D.reverse(), true)`
  - 369–369: `near(r.bankZones[0].frac, 0.6, 1e-12, "bank frac → 1 − frac")`
  - 369–369: `near(r.bankZones[1].frac, 0.95, 1e-12, "bank frac → 1 − frac")`
  - 370–370: `assert.deepEqual([r.bankZones[0].angleDeg, r.bankZones[1].angleDeg, r.bankZones[0].widthM], [12, -6, 120], "angleDeg is never negated (its sign is not the camber side — mesh.js reads that off curvature)")`
  - 371–371: `assert.deepEqual(Object.keys(z).sort(), ["angleDeg", "frac", "widthM"], "no stray s0/s1/angle on a bank")`
  - 372–372: `near(r.hwZones[0].s0, 0.7, 1e-12, "hw s0 = 1 − s1")`
  - 372–372: `near(r.hwZones[0].s1, 0.8, 1e-12, "hw s1 = 1 − s0")`
  - 373–373: `near(r.elevations[0].s, 0.75, 1e-12, "elevation")`
  - 373–373: `near(r.bridges[0].s, 0.4, 1e-12, "bridge")`
  - 374–374: `samePlace(pointAt(d0.pts, f), pointAt(r.pts, g), 1e-6, "the reversed loop's zone sits where it was")`
  - 376–376: `assert.equal(b.D.setStart(5), true)`
  - 381–381: `near(s.bankZones[0].frac, w(before.bankZones[0].frac - sh), 1e-12, "bank frac shifts with the start")`
  - 382–382: `assert.equal(s.bankZones[1].angleDeg, -6)`
  - 383–383: `near(s.hwZones[0].s0, w(before.hwZones[0].s0 - sh), 1e-12, "hw s0")`
  - 383–383: `near(s.elevations[0].s, w(before.elevations[0].s - sh), 1e-12, "elevation")`
  - 383–383: `near(s.bridges[0].s, w(before.bridges[0].s - sh), 1e-12, "bridge")`
  - 384–384: `samePlace(pointAt(before.pts, f), pointAt(s.pts, g), 1e-6, "START HERE moves the line, not the zones")`
  - 388–388: `samePlace(pointAtIndex(it.pts, raw.hwZones[0].s0), pointAt(it.pts, it.hwZones[0].s0), 1e-6, "toRaw s0")`
  - 389–389: `samePlace(pointAtIndex(it.pts, raw.hwZones[0].s1), pointAt(it.pts, it.hwZones[0].s1), 1e-6, "toRaw s1")`
  - 390–390: `samePlace(pointAt(before.pts, before.hwZones[0].s0), pointAtIndex(it.pts, raw.hwZones[0].s0), 0.25, "end to end, within the u16 fraction grid")`
### "an insert / delete / stamp keeps zones before the edit at their distance from the start, after it at their distance to the finish"

- Case: 393–440. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `Math.hypot`, `Math.floor`, `b.D.load`, `Object.assign`, `b.D.deletePoint`, `b.D.state`, `b.D.setTool`, `b.D.applyStamp`, `Math.min`, `Math.max`
- Assertion semantics and spans:
  - 403–403: `assert.equal(b.D.deletePoint(i), true)`
  - 405–405: `assert.equal(d1.elevations.length, 2, "the zone on the edited span is dropped")`
  - 406–406: `near(d1.elevations[0].s * L1, fBefore * L0, 1e-6, "before the edit: same metres from the start")`
  - 407–407: `near(L1 - d1.elevations[1].s * L1, L0 - fAfter * L0, 1e-6, "after the edit: same metres to the finish")`
  - 408–408: `near(d1.bankZones[0].frac, d1.elevations[1].s, 1e-12, "banks ride the same map")`
  - 409–409: `samePlace(pointAt(d1.pts, d1.elevations[1].s), pointAt(d0.pts, fAfter), 1e-6, "…so it is still on the same piece of road")`
  - 413–413: `assert.equal(b.D.applyStamp(3, 3), true)`
  - 415–415: `assert.equal(d2.bankZones.length, 1)`
  - 416–416: `samePlace(pointAt(d2.pts, d2.bankZones[0].frac), pointAt(d0.pts, fAfter), 1.5, "a stamp upstream does not slide a zone off its corner")`
  - 417–417: `samePlace(pointAt(d2.pts, d2.elevations[0].s), pointAt(d0.pts, fBefore), 1e-6, "…nor one before the anchor")`
  - 437–437: `assert.equal(d3.pts.length, d2.pts.length + 1, "the tap inserted a point")`
  - 438–438: `samePlace(pointAt(d3.pts, d3.bankZones[0].frac), pointAt(d2.pts, d2.bankZones[0].frac), 1e-6, "an insert upstream leaves a downstream zone in place")`
  - 439–439: `samePlace(pointAt(d3.pts, d3.elevations[0].s), pointAt(d2.pts, d2.elevations[0].s), 1e-6, "…and an upstream one")`
### "full-lap width survives REVERSE and START HERE through storage and engine rebuild"

- Case: 442–455. Fixtures: `bootScreen`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.C.sanitize`, `b.D.reverse`, `b.D.setStart`, `b.D.deletePoint`, `b.D.open`, `b.D.state`, `b.V.build`, `Math.abs`, `b.D.close`
- Assertion semantics and spans:
  - 448–448: `assert.equal(change(), true)`
  - 450–450: `assert.deepEqual(plain(stored.hwZones), plain(item.hwZones))`
  - 452–452: `assert.ok([...tr.hw].every((hw) => Math.abs(hw - 5) < 1e-6), "the entire road retains its authored width")`
### "untouched shared and imported documents remain recoverable when replaced"

- Case: 457–475. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.C.sanitize`, `b.D.open`, `b.D.loadFrom`, `b.CD.encode`, `b.C.setDraftPrev`, `b.D.close`, `b.C.list`, `b.C.draftPrev`, `b.D.undo`, `b.D.state`
- Assertion semantics and spans:
  - 464–464: `assert.equal(await b.D.loadFrom(await b.CD.encode(first)), true)`
  - 468–468: `assert.equal(b.C.list().length, 0)`
  - 469–469: `assert.equal(b.C.draftPrev().name, first.name, '${source}: previous draft survives replacement')`
  - 470–470: `assert.equal(b.D.undo(), true)`
  - 471–471: `assert.equal(b.D.state().design.name, first.name)`
  - 472–472: `assert.equal(b.D.state().design.theme, first.theme)`
### "loading unchanged library content is exempt from stashing but an edited restored draft is protected"

- Case: 477–492. Fixtures: `bootScreen`, `openGreen`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.D.save`, `b.C.list`, `b.D.load`, `b.C.setDraftPrev`, `b.D.open`, `b.C.sanitize`, `b.C.draftPrev`, `b.D.state`, `b.D.close`
- Assertion semantics and spans:
  - 479–479: `assert.equal(b.D.save().ok, true)`
  - 484–484: `assert.equal(b.C.draftPrev(), null)`
  - 485–485: `assert.equal(b.D.state().undo, 0)`
  - 489–489: `assert.ok(b.C.draftPrev(), "a library origin does not make edited draft content saved")`
  - 490–490: `assert.notEqual(b.C.draftPrev().baseHW, saved.baseHW)`
### "open({design}), EDIT and IMPORT never drop unsaved work: UNDO brings it back and the previous draft is kept on disk"

- Case: 494–542. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setTheme`, `b.D.state`, `b.C.sanitize`, `Object.assign`, `b.D.open`, `b.C.draftPrev`, `b.D.close`, `b.C.draft`, `b.D.undo`, `b.D.preview`, `b.D.save`, `b.C.setDraftPrev`, `b.D.setWidth`, `b.C.list`, `b.D.load`, `b.D.setStart`, `b.D.loadFrom`, `b.CD.encode`
- Assertion semantics and spans:
  - 501–501: `assert.deepEqual(plain(b.D.state().design.pts), plain(other.pts), "the shared design is on screen")`
  - 502–502: `assert.match(msgText(b), /UNDO brings back/, "…and the player is told how to get theirs back")`
  - 503–503: `assert.deepEqual(plain(b.C.draftPrev().pts), mine.pts, "the unsaved design is kept under apex26.customTrackDraftPrev")`
  - 504–504: `assert.equal(b.C.draftPrev().theme, "alpine")`
  - 506–506: `assert.deepEqual(plain(b.C.draft().pts), plain(other.pts), "the autosave writes the new draft…")`
  - 507–507: `assert.deepEqual(plain(b.C.draftPrev().pts), mine.pts, "…and cannot clobber the kept one")`
  - 508–508: `assert.equal(b.D.undo(), true)`
  - 509–509: `assert.deepEqual(plain(b.D.state().design.pts), mine.pts, "UNDO restores it")`
  - 510–510: `assert.equal(b.D.state().design.theme, "alpine")`
  - 512–512: `assert.equal(b.D.save().ok, true)`
  - 515–515: `assert.equal(b.C.draftPrev(), null)`
  - 515–515: `assert.equal(b.D.state().undo, 0)`
  - 521–521: `assert.equal(b.D.state().design.baseHW, 6, "UNDO after EDIT is the edited design")`
  - 525–525: `assert.equal(await b.D.loadFrom(await b.CD.encode(b.C.sanitize(Object.assign({}, other, { theme: "oasis" })))), true)`
  - 526–526: `assert.equal(b.D.state().design.theme, "oasis")`
  - 528–528: `assert.deepEqual(plain(b.D.state().design.pts), turned, "UNDO after IMPORT is the edited design")`
  - 536–536: `assert.deepEqual(plain(b2.C.draft().pts), plain(other.pts))`
  - 537–537: `assert.deepEqual(plain(b2.C.draftPrev().pts), mineP, "the on-disk draft survived the share link")`
  - 538–538: `assert.equal(b2.C.draftPrev().theme, "harbour")`
  - 539–539: `assert.equal(b2.D.undo(), true)`
  - 540–540: `assert.deepEqual(plain(b2.D.state().design.pts), mineP)`
  - 541–541: `assert.equal(b2.D.state().design.theme, "harbour")`
### "SAVE durably updates the draft library link even after autosave has finished"

- Case: 544–570. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.save`, `b.D.setTheme`, `b.D.close`, `next.D.init`, `next.D.open`, `next.D.state`, `next.D.setTheme`, `next.D.save`, `next.C.list`, `next.D.close`
- Assertion semantics and spans:
  - 553–553: `assert.equal(a.ok, true)`
  - 556–556: `assert.ok(draft, "the edit scheduled the draft autosave")`
  - 558–558: `assert.equal(b.data.customTrackDraft.originId, a.id, "autosaved before SAVE")`
  - 559–559: `assert.equal(saved.ok, true)`
  - 560–560: `assert.notEqual(saved.id, a.id)`
  - 565–565: `assert.equal(next.D.state().design.originId, saved.id)`
  - 567–567: `assert.equal(next.D.save().ok, true)`
  - 568–568: `assert.equal(next.C.list().length, 1, "save after reload replaces, never duplicates")`
### "MY CIRCUITS recovers the previous unsaved draft after a fresh-page reload"

- Case: 572–591. Fixtures: `bootScreen`, `openGreen`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.D.setTheme`, `b.D.state`, `b.D.load`, `b.C.sanitize`, `b.D.close`, `next.D.init`, `next.D.open`, `next.D.state`, `next.D.showPane`, `next.C.draft`, `next.D.undo`, `next.D.close`
- Assertion semantics and spans:
  - 580–580: `assert.equal(next.D.state().design.theme, "oasis")`
  - 583–583: `assert.equal(recover.hidden, false, "recovery is reachable even with an empty library")`
  - 585–585: `assert.deepEqual(plain(next.D.state().design.pts), mine.pts)`
  - 586–586: `assert.equal(next.D.state().design.theme, "alpine")`
  - 587–587: `assert.equal(next.C.draft().theme, "alpine", "recovery immediately persists")`
  - 588–588: `assert.equal(next.D.undo(), true, "the current unsaved replacement is itself protected")`
  - 589–589: `assert.equal(next.D.state().design.theme, "oasis")`
### "MY CIRCUITS deletion reports whether the removal was saved"

- Case: 593–609. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.save`, `b.D.showPane`, `b.C.list`
- Assertion semantics and spans:
  - 596–596: `assert.equal(saved.ok, true)`
  - 605–605: `assert.equal(b.C.list().length, 0, "the circuit disappears in this session")`
  - 606–606: `assert.match(msgText(b), durable ? /^Deleted / : /could not be saved.*return after reload/i)`
  - 607–607: `assert.equal(b.root.querySelector(".td-msg").dataset.warn, durable ? "" : "1")`
### "recovering after reload keeps a name-only edit to a saved circuit in undo"

- Case: 611–625. Fixtures: `bootScreen`, `openGreen`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.D.setName`, `b.D.setTheme`, `b.D.load`, `b.C.sanitize`, `b.D.preview`, `b.D.save`, `b.D.close`, `next.D.init`, `next.D.open`, `next.D.showPane`, `next.D.state`, `next.C.draftPrev`, `next.D.undo`, `next.D.close`
- Assertion semantics and spans:
  - 615–615: `assert.equal(b.D.save().ok, true)`
  - 620–620: `assert.equal(next.D.state().design.name, "PREVIOUS A")`
  - 621–621: `assert.equal(next.C.draftPrev().name, "UNSAVED B NAME", "also protected across another reload")`
  - 622–622: `assert.equal(next.D.undo(), true)`
  - 623–623: `assert.equal(next.D.state().design.name, "UNSAVED B NAME")`
### "UNDO inside one design keeps its name and library link (setName and SAVE sit outside the history)"

- Case: 627–642. Fixtures: `bootScreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.randomise`, `b.D.preview`, `b.D.setTheme`, `b.D.setName`, `b.D.undo`, `b.D.state`, `b.C.sanitizeName`, `b.D.save`, `b.C.list`, `b.D.redo`
- Assertion semantics and spans:
  - 633–633: `assert.equal(b.D.undo(), true)`
  - 634–634: `assert.equal(b.D.state().design.theme !== "alpine", true, "the edit was undone")`
  - 635–635: `assert.equal(b.D.state().design.name, b.C.sanitizeName("Renamed Loop"), "…but not the rename")`
  - 636–636: `assert.equal(b.D.save().ok, true)`
  - 639–639: `assert.equal(b.D.state().design.originId, id, "the library link survives UNDO")`
  - 640–640: `assert.equal(b.D.save().ok, true)`
  - 641–641: `assert.equal(b.C.list().length, n, "SAVE replaces the circuit instead of adding a copy")`
### "a share link while the screen is open keeps the return focus; EDIT → SAVE replaces the circuit; a full library names its limit"

- Case: 644–675. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.open`, `b.C.sanitize`, `b.D.state`, `b.D.close`, `b.D.preview`, `b.D.save`, `b.C.get`, `b.D.setStart`, `b.D.setWidth`, `b.C.list`, `b.C.upsert`, `Object.assign`, `b.D.randomise`, `b.D.race`
- Assertion semantics and spans:
  - 652–652: `assert.equal(b.dom.document.activeElement, door, "close returns focus to the title door, not into the hidden dialog")`
  - 656–656: `assert.equal(first.ok, true)`
  - 662–662: `assert.equal(second.ok, true)`
  - 662–662: `assert.notEqual(second.id, first.id)`
  - 663–663: `assert.deepEqual(plain(b.D.state().library), [second.id], "replaced, not duplicated")`
  - 666–666: `assert.deepEqual(plain(b.D.state().library), [third.id], "…on every later SAVE too")`
  - 668–668: `assert.equal(b.D.state().design.originId, undefined, "a shared import never replaces a local design")`
  - 670–670: `assert.equal(b.C.upsert(Object.assign({}, b.C.get(third.id), { seed: 1000 + i })).ok, true)`
  - 672–672: `assert.equal(b.D.race("gp"), false)`
  - 673–673: `assert.match(msgText(b), /full \(24 circuits\).*to race/, msgText(b))`
  - 674–674: `assert.deepEqual(b.clicks, [], "no race door pressed")`
### "CHECKS is not a live region; count changes are announced once; an unbuildable loop never reads 'All checks pass'"

- Case: 677–691. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `Object.assign`, `Array.from`, `Math.round`, `Math.cos`, `Math.sin`, `b.D.load`, `b.D.preview`
- Assertion semantics and spans:
  - 681–681: `assert.equal(list.getAttribute("aria-live"), null, "the 80 ms rebuild is not read out")`
  - 685–685: `assert.equal(v.ok, false)`
  - 685–685: `assert.ok(v.red >= 1, "a ~630 m loop is RED, never a silent fail")`
  - 686–686: `assert.notEqual(list.children[0].dataset.level, "ok")`
  - 687–687: `assert.match(msgText(b), /CHECKS: \d+ red issue/, msgText(b))`
  - 690–690: `assert.equal(msgText(b), said, "the same counts are not announced again")`
### "IMPORT caps the file size; a malformed link or code is a message, never a throw"

- Case: 693–702. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.importFile`, `b.D.loadFrom`
- Assertion semantics and spans:
  - 696–696: `assert.equal(await b.D.importFile({ size: 1 << 20, text: async () => { throw new Error("must not read"); } }), false)`
  - 697–697: `assert.match(msgText(b), /too big/)`
  - 698–698: `assert.equal(await b.D.loadFrom("https://x.example/#track=%E0%A4%A"), false)`
  - 699–699: `assert.ok(msgText(b).length > 0, "a message, not silence")`
  - 700–700: `assert.equal(await b.D.loadFrom("APXT1.z.%%%"), false)`
  - 701–701: `assert.ok(msgText(b).length > 0)`
### "arrow nudges coalesce into one UNDO; arrows pass to MenuNav with nothing selected; Escape / B lets go of the canvas"

- Case: 704–746. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.undo`
- Assertion semantics and spans:
  - 712–712: `assert.equal(canvas.dataset.arrows, "pass", "nothing selected: MenuNav may walk focus off the canvas")`
  - 713–713: `assert.notEqual(key("ArrowLeft").defaultPrevented, true, "…so the canvas leaves the key alone")`
  - 715–715: `assert.equal(b.D.state().sel, 0)`
  - 716–716: `assert.equal(canvas.dataset.arrows, "own")`
  - 718–718: `assert.equal(key("ArrowRight").defaultPrevented, true)`
  - 719–719: `assert.deepEqual(plain(b.D.state().design.pts[0]), [p0[0] + 4, p0[1]])`
  - 720–720: `assert.equal(b.D.state().undo, u0 + 1, "four presses, one UNDO entry")`
  - 722–722: `assert.equal(b.D.state().undo, u0 + 2, "a new point starts a new entry")`
  - 724–724: `assert.deepEqual(plain(b.D.state().design.pts[0]), [p0[0] + 4, p0[1]])`
  - 726–726: `assert.deepEqual(plain(b.D.state().design.pts[0]), p0, "one UNDO takes back the whole run")`
  - 732–732: `assert.equal(sb.MenuNav.ownsArrows(canvas, "ArrowDown", { isTrusted: false }), true, "a selected point: the pad's arrows nudge it")`
  - 735–735: `assert.equal(back.length, 3, "file-menu Escape plus canvas Escape/cancel are captured before modal dismissal")`
  - 738–738: `assert.equal(cancel.defaultPrevented, true)`
  - 738–738: `assert.equal(cancel.stopped, true, "the screen's close door never sees it")`
  - 739–739: `assert.equal(b.D.state().sel, -1)`
  - 740–740: `assert.notEqual(b.dom.document.activeElement, canvas, "focus left the canvas")`
  - 741–741: `assert.equal(canvas.dataset.arrows, "pass")`
  - 742–742: `assert.equal(sb.MenuNav.ownsArrows(canvas, "ArrowDown", { isTrusted: false }), false)`
  - 745–745: `assert.equal(again.defaultPrevented, false, "a second B closes the screen as before")`
### "DesignerCanvas: lostpointercapture abandons a drag (no phantom pinch after a hidden dialog)"

- Case: 769–784. Fixtures: `bootCanvas`; shared fixture and limits above apply.
- Exercised calls: `h.cv.reset`
- Assertion semantics and spans:
  - 777–777: `assert.equal(h.ev.changes.length, 1, "the next touch is a drag, not the second finger of a pinch")`
  - 778–778: `assert.equal(h.ev.changes[0].kind, "move")`
  - 783–783: `assert.deepEqual(h.ev.picks, [9])`
### "DesignerCanvas: double-tap deletes only under SELECT and only the handle both taps picked"

- Case: 786–800. Fixtures: `bootCanvas`; shared fixture and limits above apply.
- Exercised calls: `h.cv.setTool`
- Assertion semantics and spans:
  - 791–791: `assert.deepEqual(h.ev.deletes, [], "a stamp tool's double-tap is two stamps, never a delete")`
  - 794–794: `assert.deepEqual(h.ev.deletes, [6], "two picks of one handle under SELECT")`
  - 798–798: `assert.equal(h.ev.changes.filter((c) => c.kind === "insert").length, 1)`
  - 799–799: `assert.deepEqual(h.ev.deletes, [6], "the inserted point is not deleted by the same double-tap")`
### "DesignerCanvas: a tap on the road at the point cap inserts nothing and says so (bug-hunt H10)"

- Case: 802–815. Fixtures: `bootCanvas`; shared fixture and limits above apply.
- Exercised calls: `h.cv.setPoints`, `h.cv.fit`
- Assertion semantics and spans:
  - 810–810: `assert.equal(h.ev.changes.filter((c) => c.kind === "insert").length, 0, "the 201st point is refused (validate.js and the registry both red it)")`
  - 811–811: `assert.deepEqual(h.ev.limits, ["points"], "the screen is told, so it can say why")`
  - 814–814: `assert.equal(h.ev.changes.filter((c) => c.kind === "insert").length, 1, "one under the cap still inserts")`
### "DesignerCanvas: a drag stops at the storage bounds; a preview landing mid-drag keeps the road stale"

- Case: 817–837. Fixtures: `bootCanvas`; shared fixture and limits above apply.
- Exercised calls: `h.cv.setBuilt`, `h.cv.zoom`
- Assertion semantics and spans:
  - 828–828: `assert.ok(h.fills.includes(h.b.DC.COL.roadStale) && !h.fills.includes(h.b.DC.COL.road), "still drawn stale: " + h.fills.join(","))`
  - 836–836: `assert.deepEqual(plain(p), [h.b.C.LIMITS.coord, -h.b.C.LIMITS.coord], "clamped to ±10 km, so the design stays saveable")`
### "DesignerCanvas: select-without-move — tap keeps coords; jitter below threshold keeps coords; drag on selected moves"

- Case: 839–865. Fixtures: `bootCanvas`; shared fixture and limits above apply.
- Exercised calls: `h.cv.selection`
- Assertion semantics and spans:
  - 841–841: `assert.equal(h.b.DC.DRAG_MOUSE, 6)`
  - 842–842: `assert.equal(h.b.DC.DRAG_TOUCH, 10)`
  - 843–843: `assert.equal(h.b.DC.HIT_TOUCH, 44)`
  - 849–849: `assert.deepEqual(h.ev.picks, [i], "tap picks the node")`
  - 850–850: `assert.equal(h.ev.changes.length, 0, "tap does not move")`
  - 851–851: `assert.equal(h.cv.selection().sel, i, "canvas selection follows the tap")`
  - 852–852: `assert.deepEqual(plain(h.pts[i]), before, "coordinates unchanged after tap")`
  - 857–857: `assert.equal(h.ev.changes.length, 0, "below-threshold jitter does not move")`
  - 862–862: `assert.equal(h.ev.changes.length, 1, "deliberate drag moves")`
  - 863–863: `assert.equal(h.ev.changes[0].kind, "move")`
  - 864–864: `assert.notDeepEqual(plain(h.ev.changes[0].pts[i]), before, "coordinates changed")`
### "DesignerCanvas: empty-space drag pans without moving nodes; touch tap does not move"

- Case: 867–888. Fixtures: `bootCanvas`; shared fixture and limits above apply.
- Exercised calls: `h.cv.view`, `Math.abs`
- Assertion semantics and spans:
  - 877–877: `assert.equal(h.ev.changes.length, 0, "pan never edits points")`
  - 878–878: `assert.deepEqual(plain(h.pts), before)`
  - 880–880: `assert.ok(Math.abs(v1.cx - v0.cx) > 0.01 \|\| Math.abs(v1.cz - v0.cz) > 0.01, "view panned")`
  - 886–886: `assert.equal(h.ev.changes.length, 0, "touch jitter below threshold does not move")`
  - 887–887: `assert.deepEqual(h.ev.picks.at(-1), i)`
### "FIX chips: only on rows TrackFixes can repair; FIX commits one UNDO entry and says so; the press never reaches the row"

- Case: 907–945. Fixtures: `bootScreen`, `shortLoop`; shared fixture and limits above apply.
- Exercised calls: `Object.assign`, `b.D.state`, `b.D.preview`, `b.D.undo`
- Assertion semantics and spans:
  - 919–919: `assert.equal(fixable.length, 1, "one FIX chip, on the length row")`
  - 920–920: `assert.match(fixable[0].textContent, /Lap is/)`
  - 921–921: `assert.ok(rows.filter((li) => li.dataset.level === "red").length > 1, "the start rows are red too, and carry no chip")`
  - 923–923: `assert.equal(fixAll.hidden, false, "FIX ALL shows while a red issue is fixable")`
  - 927–927: `assert.equal(ev.propagationStopped, true, "the chip's click stops at the chip (the row would refocus the canvas)")`
  - 928–928: `assert.deepEqual(plain(seen), [{ code: "length", built: true }], "apply(design, issue, the current verdict)")`
  - 929–929: `assert.equal(b.D.state().undo, u0, "preview does not commit")`
  - 931–931: `assert.equal(b.D.state().undo, u0 + 1, "one UNDO entry")`
  - 932–932: `assert.deepEqual(plain(b.D.state().design.pts), plain(green.pts))`
  - 933–933: `assert.equal(msgText(b), "Fixed: lap stretched to 3.2 km — UNDO to revert")`
  - 934–934: `assert.equal(b.D.preview().ok, true)`
  - 935–935: `assert.equal(chipsIn(b.root, "FIX ALL")[0].hidden, true, "nothing red, no FIX ALL")`
  - 936–936: `assert.equal(b.D.undo(), true)`
  - 937–937: `assert.equal(b.D.preview().ok, false, "UNDO takes the fix back")`
  - 939–939: `assert.equal(msgText(b), "No automatic fix for this one")`
  - 943–943: `assert.equal(chipsIn(b.root.querySelector('[aria-label="Design checks"]'), "FIX").length, 0)`
  - 944–944: `assert.equal(chipsIn(b.root, "FIX ALL")[0].hidden, true)`
### "FIX ALL runs fixAll(design, TrackValidate.check) and commits once, naming the codes it applied"

- Case: 947–976. Fixtures: `bootScreen`, `shortLoop`; shared fixture and limits above apply.
- Exercised calls: `Object.assign`, `b.D.state`, `b.D.preview`, `b.D.undo`
- Assertion semantics and spans:
  - 960–960: `assert.ok(chipsIn(b.root.querySelector('[aria-label="Design checks"]'), "FIX").length >= 2, "every fixable row has its chip")`
  - 963–963: `assert.deepEqual(calls, [true], "handed the validator's own check")`
  - 964–964: `assert.equal(b.D.state().undo, u0, "preview does not commit")`
  - 966–966: `assert.equal(b.D.state().undo, u0 + 1, "one UNDO entry for the whole batch")`
  - 967–967: `assert.equal(b.D.state().sel, 0, "a start remedy selects the new point 0, as START HERE does")`
  - 968–968: `assert.equal(fits, f0 + 1, "a length remedy rescales the loop, so the view refits")`
  - 969–969: `assert.equal(msgText(b), "Fixed length, start — UNDO to revert")`
  - 970–970: `assert.equal(b.D.preview().ok, true)`
  - 974–974: `assert.equal(b.D.state().undo, u0, "nothing applied, nothing committed")`
  - 975–975: `assert.match(msgText(b), /Nothing here can be fixed automatically/)`
### "HOW TO: a third tab lists every HOWTO step, every input and the limits; the limits match the registry"

- Case: 978–1045. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `H.STEPS.forEach`, `H.GESTURES.map`, `H.LIMITS.includes`
- Assertion semantics and spans:
  - 982–982: `assert.deepEqual(tabs.map((t) => t.textContent), ["DESIGN", "MY CIRCUITS", "HOW TO"])`
  - 983–983: `assert.equal(t.getAttribute("role"), "tab")`
  - 984–984: `assert.equal(b.root.querySelector('[role="tablist"]').getAttribute("aria-label"), "Track Designer workspace")`
  - 985–985: `assert.deepEqual(tabs.map((t) => t.getAttribute("aria-controls")), ["td-pane-design", "td-pane-library", "td-pane-howto"])`
  - 986–986: `assert.deepEqual(tabs.map((t) => t.tabIndex), [0, -1, -1])`
  - 988–988: `assert.equal(how.dataset.pane, "howto")`
  - 988–988: `assert.equal(how.getAttribute("role"), "tabpanel")`
  - 989–990: `assert.deepEqual([design.getAttribute("aria-labelledby"), lib.getAttribute("aria-labelledby"), how.getAttribute("aria-labelledby")], [tabs[0].id, tabs[1].id, tabs[2].id])`
  - 991–991: `assert.equal(how.hidden, true)`
  - 993–993: `assert.deepEqual([design.hidden, lib.hidden, how.hidden], [true, true, false])`
  - 994–994: `assert.deepEqual(tabs.map((t) => t.getAttribute("aria-selected")), ["false", "false", "true"])`
  - 995–995: `assert.deepEqual(tabs.map((t) => t.tabIndex), [-1, -1, 0])`
  - 996–996: `assert.equal(b.root.dataset.pane, "howto", "phone layout can give the guide its own space")`
  - 1000–1000: `assert.equal(b.root.dataset.pane, "library", "ArrowLeft activates the previous designer tab")`
  - 1001–1001: `assert.equal(b.dom.document.activeElement, tabs[1], "tab focus follows activation")`
  - 1004–1004: `assert.equal(b.root.dataset.pane, "design", "Home activates the first designer tab")`
  - 1005–1005: `assert.equal(b.dom.document.activeElement, tabs[0])`
  - 1008–1008: `assert.deepEqual(tasks.map(e => e.dataset.helpTask), ["selection", "height", "scenery", "draw", "test"])`
  - 1009–1009: `assert.equal(tasks[0].open, true)`
  - 1012–1012: `assert.equal(b.D.state().mode, "scenery")`
  - 1013–1013: `assert.equal(how.hidden, true)`
  - 1014–1014: `assert.equal(b.root.dataset.pane, "design")`
  - 1016–1016: `assert.equal(live.getAttribute("aria-pressed"), "true")`
  - 1018–1018: `assert.equal(live.getAttribute("aria-pressed"), "false")`
  - 1019–1019: `assert.equal(b.D.state().undo, history, "view and help navigation do not edit the circuit")`
  - 1022–1022: `assert.equal(r.dataset.level, "info", "info rows, the CHECKS recipe")`
  - 1024–1024: `assert.equal(H.STEPS.length, 7)`
  - 1026–1026: `assert.equal(st.n, i + 1)`
  - 1027–1027: `assert.ok(text.includes(st.n + " · " + st.title.toUpperCase() + " — " + st.text), "step " + st.n + " is listed")`
  - 1028–1028: `assert.ok(st.text.split(/(?<=[.?!])\s+(?=[A-Z])/).length <= 2, "≤ 2 sentences: " + st.title)`
  - 1030–1030: `assert.deepEqual(plain(H.GESTURES.map((g) => g.input)), ["Touch", "Mouse", "Keyboard", "Gamepad"])`
  - 1031–1031: `assert.ok(text.includes(g.input.toUpperCase() + " — " + g.text))`
  - 1032–1032: `assert.ok(text.includes(H.LIMITS))`
  - 1034–1034: `assert.ok(H.LIMITS.includes(VL.lenMin / 1000 + "–" + VL.lenMax / 1000 + " km"), "lap length limits")`
  - 1035–1035: `assert.ok(H.LIMITS.includes(L.ptsMin + "–" + L.ptsMax + " points"), "point limits")`
  - 1036–1036: `assert.ok(H.LIMITS.includes(L.items + " saved circuits"), "library limit")`
  - 1038–1038: `assert.deepEqual([design.hidden, lib.hidden, how.hidden], [false, true, true])`
  - 1042–1042: `assert.ok(empty, "empty library copy")`
  - 1043–1043: `assert.match(empty.textContent, /No saved circuits yet/)`
  - 1044–1044: `assert.ok(empty.parentNode.classList.contains("td-grid"), "lives in the card grid")`
### "the first-open card: shown once, HOW TO switches tab, GOT IT stores apex26.designerCoached; a later open has none"

- Case: 1047–1085. Fixtures: `bootScreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.state`, `b.D.close`
- Assertion semantics and spans:
  - 1053–1053: `assert.ok(card && card.classList.contains("td-group"), "coach card docks in the design pane (not over MODE/SHAPE)")`
  - 1055–1055: `assert.ok(shape, "1 SHAPE tools exist")`
  - 1056–1056: `assert.ok(design.children.indexOf(card) > design.children.indexOf(shape.parentNode \|\| shape) \|\| design.children.indexOf(card) > 0, "coach is below the tool groups")`
  - 1058–1058: `assert.ok(note.classList.contains("td-issue"))`
  - 1058–1058: `assert.equal(note.dataset.level, "info")`
  - 1059–1059: `assert.match(note.textContent, /RANDOMISE gave you a circuit/)`
  - 1060–1060: `assert.match(note.textContent, /EDIT shapes the road/)`
  - 1061–1061: `assert.deepEqual(chipsIn(card).map((c) => c.textContent), ["HOW TO", "GOT IT"])`
  - 1064–1064: `assert.equal(panes(b)[2].hidden, false, "HOW TO opens the guide")`
  - 1065–1065: `assert.equal(b.data.designerCoached, undefined, "…without dismissing the card")`
  - 1067–1067: `assert.equal(b.data.designerCoached, true, "GOT IT stores the flag")`
  - 1068–1068: `assert.ok(!design.contains(card), "…and removes the card")`
  - 1069–1069: `assert.equal(b.D.state().undo, u0, "UNDO / REDO untouched")`
  - 1071–1071: `assert.equal(chipsIn(panes(b)[0], "GOT IT").length, 0, "no card on a later open")`
  - 1078–1078: `assert.ok(card2 && card2.children[0] && /RANDOMISE gave you/.test(card2.children[0].textContent))`
  - 1080–1080: `assert.equal(b2.data.designerCoached, true)`
  - 1084–1084: `assert.equal(chipsIn(panes(b3)[0], "GOT IT").length, 0)`
### "the rail: per-tool hint under 1 SHAPE (the stage copy is hidden on a phone), the status line says it once, and the group labels"

- Case: 1087–1128. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setTool`, `b.D.setMode`, `b.D.state`
- Assertion semantics and spans:
  - 1093–1093: `assert.ok(hint && stageHint && hint !== stageHint)`
  - 1094–1094: `assert.ok(toolsGroup && toolsGroup.children.some((c) => c.classList.contains("td-chips") && c.children.every((t) => t.dataset.tool)), "the hint sits in the TOOLS group")`
  - 1095–1095: `assert.match(hint.textContent, /^EDIT: POINT selects one/)`
  - 1099–1099: `assert.match(hint.textContent, re, tool)`
  - 1100–1100: `assert.equal(stageHint.textContent, hint.textContent, "one string, two places")`
  - 1101–1101: `assert.equal(msgText(b), hint.textContent, "the status line says it once on a change")`
  - 1107–1107: `assert.deepEqual(labels().slice(0, 7), ["SELECT POINTS", "SHAPE", "CORNERS", "ELEVATION", "BANKING & KERBS", "SCENERY", "ROAD"])`
  - 1108–1108: `assert.ok(labels().includes("CHECKS"))`
  - 1110–1110: `assert.ok(shapeG && !shapeG.hidden, "CORNERS group stays visible under EDIT/SELECT")`
  - 1111–1111: `assert.match(shapeG.querySelector(".td-hint").textContent, /^Pick STRAIGHT/)`
  - 1112–1112: `assert.deepEqual(chipsIn(b.root).filter((c) => c.dataset.mode).map((c) => c.dataset.mode), ["draw", "edit", "elevation", "scenery", "test"])`
  - 1114–1114: `assert.equal(b.D.state().mode, "elevation")`
  - 1115–1115: `assert.match(hint.textContent, /^ELEVATION:/)`
  - 1121–1121: `assert.ok(m, cornerLabel \|\| all.join("\|"))`
  - 1125–1125: `assert.equal(labels().find((t) => t.startsWith("CORNERS ·")), "CORNERS · CORNER R " + (+m[1] + 5) + " m × 90° RIGHT", "live from the steppers")`
  - 1127–1127: `assert.equal(labels().find((t) => t.startsWith("CORNERS ·")), "CORNERS · STRAIGHT 200 m")`
### "the canvas's press-and-hold row: DELETE · START HERE · CLOSE act on that point, anchored at the press; a canvas press hides it; a stamp tool hands the canvas a ghost"

- Case: 1130–1196. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.setMode`, `b.D.close`, `b.D.open`, `b.D.setTool`
- Assertion semantics and spans:
  - 1144–1144: `assert.equal(typeof hooks.onContext, "function", "the designer offers the hook")`
  - 1146–1146: `assert.ok(stage.children.includes(row), "anchored in the stage")`
  - 1146–1146: `assert.equal(row.hidden, true)`
  - 1147–1147: `assert.ok(row.classList.contains("td-chips"))`
  - 1149–1149: `assert.equal(row.hidden, false)`
  - 1150–1150: `assert.equal(b.D.state().sel, 5, "the point is selected")`
  - 1151–1151: `assert.deepEqual([row.style.right, row.style.top, row.style.left, row.style.bottom], ["40px", "50px", "", ""], "opens away from the right edge (canvas 640 × 400)")`
  - 1152–1152: `assert.equal(row.getAttribute("aria-label"), "Point 6")`
  - 1154–1154: `assert.equal(row.hidden, true)`
  - 1155–1155: `assert.equal(b.D.state().design.pts.length, d0.pts.length - 1)`
  - 1156–1156: `assert.deepEqual(plain(b.D.state().design.pts[5]), plain(d0.pts[6]), "point 6 (index 5) went")`
  - 1159–1159: `assert.deepEqual([row.style.left, row.style.bottom], ["10px", "10px"], "opens away from the bottom edge")`
  - 1161–1161: `assert.deepEqual(plain(b.D.state().design.pts[0]), before[4], "START HERE on that point")`
  - 1163–1163: `assert.equal(chipsIn(row, "START HERE")[0].disabled, true, "the start itself cannot be the new start")`
  - 1165–1165: `assert.equal(row.hidden, true)`
  - 1170–1170: `assert.equal(row.hidden, true, "the next press on the canvas hides it")`
  - 1175–1175: `assert.equal(row.hidden, true, "switch to " + mode + " dismisses point actions")`
  - 1177–1177: `assert.deepEqual(plain(b.D.state().design.pts), points, "stale action cannot delete a point")`
  - 1182–1182: `assert.equal(row.hidden, true, "closing the screen hides it")`
  - 1184–1184: `assert.equal(row.hidden, true, "an index off the loop is ignored")`
  - 1189–1189: `assert.equal(name, "corner")`
  - 1189–1189: `assert.equal(typeof fn, "function")`
  - 1191–1191: `assert.deepEqual(plain(g.pts[0]), plain(pts[3]), "the ghost starts on the point")`
  - 1192–1192: `assert.ok(g.pts.length > 3, "…and runs the corner")`
  - 1193–1193: `assert.equal(fn(-1), null)`
  - 1195–1195: `assert.equal(toolCalls[toolCalls.length - 1][1], undefined, "SELECT clears the ghost")`
### "TURNS: one info row per corner; a row selects its span, prefills the tool and REPLACE re-stamps it green"

- Case: 1201–1231. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.preview`
- Assertion semantics and spans:
  - 1205–1205: `assert.equal(list.getAttribute("aria-label"), "Corners, in driving order")`
  - 1206–1206: `assert.ok(st.corners.length >= 3, st.corners.length + " corners")`
  - 1207–1207: `assert.equal(list.children.length, st.corners.length, "one row per corner")`
  - 1209–1209: `assert.equal(li.dataset.level, "info")`
  - 1209–1209: `assert.equal(li.tabIndex, 0)`
  - 1210–1210: `assert.match(li.textContent, /^T\d+ · (LEFT\|RIGHT) \d+° · R \d+ m · \d+ km\/h · \d+ m$/)`
  - 1215–1215: `assert.deepEqual([now.sel, now.span, now.tool], [c.i0, c.i1, c.fit.kind], "the row's span, the fitted tool")`
  - 1216–1216: `assert.ok(now.sel !== now.span && !(now.span > 0 && now.span < now.sel), "point 0 is never inside the span")`
  - 1218–1218: `assert.equal(label.textContent, c.fit.kind === "corner" ? "CORNERS · CORNER R " + c.fit.R + " m × " + c.fit.deg + "° " + dir : "CORNERS · HAIRPIN R " + c.fit.R + " m " + dir)`
  - 1219–1219: `assert.equal(now.design.pts.length, st.design.pts.length, "selecting changes nothing")`
  - 1220–1220: `assert.equal(now.undo, u0)`
  - 1222–1222: `assert.ok(replace, "CORNERS offers REPLACE THE SELECTED SPAN")`
  - 1225–1225: `assert.equal(v.red, 0, "the re-stamped turn is green: " + v.issues.map((i) => i.code + ":" + i.level).join(","))`
  - 1226–1226: `assert.equal(b.D.state().undo, u0 + 1, "one UNDO entry")`
  - 1230–1230: `assert.deepEqual([b.D.state().sel, b.D.state().span], [c0.i0, c0.i1])`
### "4 DETAILS: RANDOMISE · TRACK OF THE DAY · START FROM… over the edit row, which ends in SPEED then TEST HERE (#766)"

- Case: 1233–1259. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.trackOfTheDay`
- Assertion semantics and spans:
  - 1237–1237: `assert.equal(chipsIn(design, "RANDOMISE").length, 1, "RANDOMISE moved, not copied")`
  - 1239–1239: `assert.deepEqual(seedRow.children.map((c) => c.textContent), ["RANDOMISE", "TRACK OF THE DAY", "START FROM…"])`
  - 1241–1241: `assert.deepEqual(editRow.children.map((c) => c.textContent), ["REVERSE", "START HERE", "DELETE POINT", "PREV POINT", "NEXT POINT", "SELECT END", "SPEED", "TEST HERE"])`
  - 1244–1244: `assert.ok(toolbar, "stage toolbar")`
  - 1245–1245: `assert.deepEqual([...toolbar.children].map((c) => c.textContent), ["UNDO", "REDO", "FIT VIEW", "OUTLINE", "LIVE SCENERY", "HEIGHT"])`
  - 1247–1247: `assert.equal(speed.getAttribute("aria-pressed"), "false")`
  - 1247–1247: `assert.equal(b.D.state().heat, false)`
  - 1249–1249: `assert.equal(speed.getAttribute("aria-pressed"), "true")`
  - 1249–1249: `assert.equal(b.D.state().heat, true)`
  - 1251–1251: `assert.equal(speed.getAttribute("aria-pressed"), "false")`
  - 1251–1251: `assert.equal(b.D.state().heat, false)`
  - 1255–1255: `assert.match(msgText(b), /^Track of the day \(\d{4}-\d{2}-\d{2}\) — seed \d+$/)`
  - 1256–1256: `assert.equal(b.D.trackOfTheDay(), true)`
  - 1257–1257: `assert.deepEqual(plain(b.D.state().design.pts), a, "deterministic for the day")`
  - 1258–1258: `assert.equal(b.D.state().design.seed >>> 0, b.D.state().design.seed)`
### "HEIGHT maps engine elevation, survives scenery and undo, and excludes SPEED without editing the design"

- Case: 1261–1284. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.setMode`, `b.D.applyElevPreset`, `b.D.preview`, `b.D.undo`, `b.D.toggleHeat`
- Assertion semantics and spans:
  - 1266–1266: `assert.equal(height.getAttribute("aria-pressed"), "true")`
  - 1267–1267: `assert.equal(b.D.state().elevationHeat, true)`
  - 1268–1268: `assert.deepEqual(plain(b.D.state().design), before.design)`
  - 1269–1269: `assert.equal(b.D.state().undo, before.undo)`
  - 1272–1272: `assert.equal(b.D.state().elevationHeat, true)`
  - 1274–1274: `assert.deepEqual(plain(b.D.state().design.heights), before.design.heights)`
  - 1275–1275: `assert.equal(b.D.state().elevationHeat, true)`
  - 1277–1277: `assert.equal(height.getAttribute("aria-pressed"), "false")`
  - 1278–1278: `assert.equal(b.D.state().heat, true)`
  - 1280–1280: `assert.equal(b.D.state().heat, false)`
  - 1281–1281: `assert.equal(b.D.state().elevationHeat, true)`
  - 1283–1283: `assert.equal(b.D.state().elevationHeat, false)`
### "START FROM…: a card per shipped circuit; a pick traces it into a new design, one UNDO away"

- Case: 1286–1317. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.Tracks.LIST.filter`, `b.D.state`, `b.D.preview`, `b.Tracks.buildCenterline`, `Math.abs`, `Math.round`, `b.D.undo`, `b.D.startFrom`
- Assertion semantics and spans:
  - 1291–1291: `assert.equal(grid.hidden, true, "closed until asked")`
  - 1293–1293: `assert.equal(grid.hidden, false)`
  - 1293–1293: `assert.equal(from.getAttribute("aria-expanded"), "true")`
  - 1295–1295: `assert.equal(grid.children.length, shipped.length, "one card per shipped circuit")`
  - 1297–1297: `assert.ok(card.classList.contains("td-card"))`
  - 1298–1298: `assert.equal(card.children[0].tagName, "CANVAS")`
  - 1298–1298: `assert.equal(card.children[0].getAttribute("aria-hidden"), "true")`
  - 1299–1299: `assert.match(card.children[1].textContent, /^\d+\.\d\d km · \d+ corners$/)`
  - 1304–1304: `assert.equal(st.design.name, "MONZA REMIX")`
  - 1305–1305: `assert.ok(st.design.pts.length >= 60 && st.design.pts.length <= 120, st.design.pts.length + " points")`
  - 1306–1306: `assert.equal(st.design.originId, undefined, "SAVE adds a new circuit")`
  - 1307–1307: `assert.deepEqual(plain([st.design.hwZones, st.design.bankZones, st.design.elevations, st.design.bridges]), [[], [], [], []])`
  - 1308–1308: `assert.equal(st.undo, u0 + 1)`
  - 1309–1309: `assert.equal(grid.hidden, true, "the cards fold away")`
  - 1311–1311: `assert.equal(v.red, 0, "Monza traces green: " + v.issues.map((i) => i.code + ":" + i.level).join(","))`
  - 1313–1313: `assert.ok(Math.abs(v.tr.total / real - 1) < 0.03, "Monza's length: " + Math.round(v.tr.total) + " vs " + Math.round(real))`
  - 1314–1314: `assert.equal(b.D.undo(), true)`
  - 1315–1315: `assert.deepEqual(plain(b.D.state().design.pts), d0.pts, "UNDO brings the design back")`
  - 1316–1316: `assert.equal(b.D.startFrom("custom-nope"), false)`
### "START FROM… memoises a small outline per circuit, not its whole centreline"

- Case: 1321–1331. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.Tracks.LIST.filter`, `b.D.state`
- Assertion semantics and spans:
  - 1329–1329: `assert.equal(th.cached, shipped, "every card drew")`
  - 1330–1330: `assert.ok(th.maxPts > 32 && th.maxPts <= 256, "an outline of at most 256 points: " + th.maxPts)`
### "SPIRAL m: a stepper for CORNER / HAIRPIN / CHICANE / S-BEND only, 0–80 in 5s, named in the label and carried by STAMP"

- Case: 1345–1380. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setTool`, `b.D.state`, `b.D.applyStamp`, `b.D.undo`
- Assertion semantics and spans:
  - 1349–1349: `assert.ok(row, "the row exists")`
  - 1350–1350: `assert.match(row.parentNode.children[0].textContent, /^CORNERS/, "inside CORNERS")`
  - 1354–1354: `assert.equal(!row.hidden && !row.parentNode.hidden, curved, tool + (curved ? " shows" : " hides") + " SPIRAL m")`
  - 1358–1358: `assert.equal(val.textContent, "0")`
  - 1359–1359: `assert.equal(val.textContent, "15")`
  - 1360–1360: `assert.equal(val.textContent, "80", "clamps at 80")`
  - 1362–1362: `assert.match(label(), /^CORNERS · CORNER R \d+ m × \d+° (LEFT\|RIGHT) · SPIRAL 80 m$/)`
  - 1363–1363: `assert.equal(val.textContent, "80", "the value rides across the curved tools")`
  - 1364–1364: `assert.equal(val.textContent, "0", "clamps at 0")`
  - 1365–1365: `assert.doesNotMatch(label(), /SPIRAL/, "no spiral, no mention")`
  - 1370–1370: `assert.match(label(), /^CORNERS · CORNER R 60 m × 90° /)`
  - 1372–1372: `assert.equal(b.D.applyStamp(3, 3), true)`
  - 1374–1374: `assert.equal(b.D.undo(), true)`
  - 1376–1376: `assert.equal(b.D.applyStamp(3, 3), true)`
  - 1378–1378: `assert.notDeepEqual(spiral, flat, "SPIRAL 40 m changes the stamp")`
  - 1379–1379: `assert.deepEqual(spiral.slice(0, 4), d0.pts.slice(0, 4), "upstream of the anchor nothing moves")`
### "SPAN WIDTH m: one hwZone on the span's control points, merged on repeat, cleared at the base width, capped at 24, carried by an insert and a delete"

- Case: 1382–1452. Fixtures: `bootHooked`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `Math.round`, `b.C.sanitize`, `b.C.toRaw`, `b.D.preview`, `Math.hypot`, `Math.abs`, `b.D.setSpanWidth`, `P.slice(0, 2).concat`, `P.slice`, `b.D.deletePoint`, `b.D.load`, `Object.assign`, `b.D.state().design.hwZones.filter`
- Assertion semantics and spans:
  - 1387–1387: `assert.ok(/^ROAD/.test(details.children[0].textContent), "in 4 DETAILS")`
  - 1388–1388: `assert.equal(details.children[details.children.indexOf(rowOf(b.root, "HALF-WIDTH m")) + 1], row, "right under HALF-WIDTH")`
  - 1389–1389: `assert.equal(row.getAttribute("aria-disabled"), "true", "no span: disabled")`
  - 1390–1390: `assert.equal(row.children[1].getAttribute("aria-disabled"), "true")`
  - 1391–1391: `assert.equal(val.textContent, "—")`
  - 1393–1393: `assert.match(msgText(b), /^Select a span first/)`
  - 1394–1394: `assert.deepEqual(plain(b.D.state().design.hwZones), [])`
  - 1397–1397: `assert.deepEqual([b.D.state().sel, b.D.state().span], [5, 9])`
  - 1398–1398: `assert.equal(row.getAttribute("aria-disabled"), "false")`
  - 1399–1399: `assert.equal(val.textContent, d0.baseHW.toFixed(1))`
  - 1403–1403: `assert.equal(d.hwZones.length, 1, "ten presses, one zone")`
  - 1405–1405: `assert.equal(z.hw, hw)`
  - 1405–1405: `assert.equal(val.textContent, hw.toFixed(1))`
  - 1406–1406: `assert.equal(z.ease, 0.025, "a 1 m step tapers over the engine's default")`
  - 1407–1407: `assert.equal(b.D.state().undo, u0 + 10, "one UNDO per press")`
  - 1408–1408: `assert.deepEqual(plain(d.pts), d0.pts, "no point moves")`
  - 1409–1409: `samePlace(pointAt(d.pts, z.s0), d.pts[5], 1e-6, "s0 on point 6")`
  - 1409–1409: `samePlace(pointAt(d.pts, z.s1), d.pts[9], 1e-6, "s1 on point 10")`
  - 1412–1412: `samePlace(pointAtIndex(it.pts, raw.hwZones[0].s0), d.pts[5], 0.25, "toRaw s0")`
  - 1415–1415: `assert.ok(Math.abs(v.tr.hw[k] - hw) < 0.05, "built half-width " + v.tr.hw[k] + " under the span")`
  - 1417–1417: `assert.equal(b.D.setSpanWidth(d0.baseHW + 1), true, "over the base clamps to it…")`
  - 1418–1418: `assert.deepEqual(plain(b.D.state().design.hwZones), [], "…which clears the zone")`
  - 1419–1419: `assert.equal(b.D.setSpanWidth(d0.baseHW), false, "nothing left to clear")`
  - 1420–1420: `assert.equal(b.D.setSpanWidth(5.5), true)`
  - 1421–1421: `assert.equal(b.D.setSpanWidth(5.5), false, "the same width again is no edit")`
  - 1422–1422: `assert.equal(b.D.setSpanWidth(2), true, "under the registry's 5 m floor clamps to it")`
  - 1424–1424: `assert.equal(d.hwZones.length, 1)`
  - 1424–1424: `assert.equal(d.hwZones[0].hw, 5)`
  - 1429–1429: `assert.equal(e.pts.length, P.length + 1)`
  - 1430–1430: `samePlace(pointAt(e.pts, e.hwZones[0].s0), P[5], 1e-6, "insert before: s0 still on the same point")`
  - 1430–1430: `samePlace(pointAt(e.pts, e.hwZones[0].s1), P[9], 1e-6, "…and s1")`
  - 1431–1431: `assert.equal(b.D.deletePoint(14), true)`
  - 1433–1433: `samePlace(pointAt(e.pts, e.hwZones[0].s0), P[5], 1e-6, "delete after: s0 still on the same point")`
  - 1433–1433: `samePlace(pointAt(e.pts, e.hwZones[0].s1), P[9], 1e-6, "…and s1")`
  - 1436–1436: `assert.equal(b.D.setSpanWidth(6), true)`
  - 1438–1438: `assert.equal(e.hwZones.length, 1, "an overlapping span replaces the zone")`
  - 1438–1438: `assert.equal(e.hwZones[0].hw, 6)`
  - 1445–1445: `assert.equal(b.D.setSpanWidth(6), false)`
  - 1446–1446: `assert.match(msgText(b), /24 width zones at most/)`
  - 1447–1447: `assert.equal(b.D.state().design.hwZones.length, 24)`
  - 1449–1449: `assert.equal(b.D.setSpanWidth(6), true, "over zones it replaces, the cap is not reached")`
  - 1450–1450: `assert.equal(b.D.state().design.hwZones.filter((q) => q.hw === 6).length, 1)`
  - 1451–1451: `assert.ok(b.D.state().design.hwZones.length <= 24)`
### "BANK °: the SELECTED TURN banks its apex — {frac, angleDeg, widthM: the corner's length}; over 5.7° is FIA amber; 0 flattens it; TURNS reads it back"

- Case: 1454–1505. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.state`, `b.D.preview`, `Math.round`, `Math.min`, `Math.max`, `b.D.setCornerBank`, `b.D.setSpanWidth`, `b.D.setTool`, `b.D.undo`
- Assertion semantics and spans:
  - 1458–1458: `assert.ok(pick, "a SELECTED TURN block inside TURNS")`
  - 1459–1459: `assert.equal(pick.hidden, true, "hidden until a turn is selected")`
  - 1463–1463: `assert.equal(b.D.state().mode, "elevation", "selecting a turn keeps the banking workspace")`
  - 1464–1464: `assert.equal(pick.hidden, false)`
  - 1465–1465: `assert.equal(pick.children[0].textContent, "SELECTED TURN · T2")`
  - 1466–1466: `assert.equal(val.textContent, "FLAT")`
  - 1469–1469: `assert.equal(c.bankDeg, 0)`
  - 1469–1469: `assert.equal(c.hwSpan, null)`
  - 1473–1473: `assert.equal(d.bankZones.length, 1, "three presses, one zone")`
  - 1474–1474: `assert.deepEqual(plain(d.bankZones[0]), { frac: c.sApex / v0.tr.total, angleDeg: 6, widthM: Math.round(Math.min(600, Math.max(20, c.lenM))) })`
  - 1475–1475: `assert.equal(b.D.state().undo, u0 + 3)`
  - 1476–1476: `assert.deepEqual(plain(d.pts), st.design.pts, "no point moves")`
  - 1477–1477: `assert.equal(val.textContent, "6°")`
  - 1479–1479: `assert.ok(v.issues.some((i) => i.code === "fia-bank" && i.level === "amber"), "6° is over the FIA's 5.7°: " + v.issues.map((i) => i.code).join(","))`
  - 1480–1480: `assert.equal(v.red, 0)`
  - 1481–1481: `assert.match(turnsList(b).children[1].textContent, / · BANK 6°$/, "TURNS says so")`
  - 1482–1482: `assert.equal(b.ctx.TrackInsight.corners(v.tr, d.pts, null, v.turns)[1].bankDeg, 6)`
  - 1483–1483: `assert.equal(pick.hidden, false, "still selected after the preview")`
  - 1486–1486: `assert.equal(b.D.state().design.bankZones[0].angleDeg, 4)`
  - 1487–1487: `assert.ok(!v.issues.some((i) => i.code === "fia-bank"), "4° is within Grade 1")`
  - 1489–1489: `assert.deepEqual(plain(b.D.state().design.bankZones), [], "down past 2° is flat: the zone goes")`
  - 1490–1490: `assert.equal(val.textContent, "FLAT")`
  - 1491–1491: `assert.equal(b.D.setCornerBank(2, 99), true, "by number; clamps to 30")`
  - 1492–1492: `assert.equal(b.D.state().design.bankZones[0].angleDeg, 30)`
  - 1493–1493: `assert.equal(b.D.setCornerBank(2, 30), false, "the same again is no edit")`
  - 1494–1494: `assert.equal(b.D.setCornerBank(2, 0), true)`
  - 1495–1495: `assert.equal(b.D.setCornerBank(99, 6), false, "no such turn")`
  - 1498–1498: `assert.equal(b.D.setSpanWidth(6), true)`
  - 1500–1500: `assert.match(turnsList(b).children[1].textContent, / · 12 m WIDE$/)`
  - 1504–1504: `assert.equal(pick.hidden, true, "UNDO clears the selection")`
### "elevation: presets + node height undo/redo; strip selects a point; Escape lets go first"

- Case: 1508–1563. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.state`, `Math.floor`, `b.D.setNodeHeight`, `b.D.undo`, `b.D.redo`, `b.D.state().design.heights.every`, `Object.assign`, `b.D.load`
- Assertion semantics and spans:
  - 1519–1519: `assert.ok(strip, "the strip is built")`
  - 1520–1520: `assert.ok(stage.contains(strip), "strip under the stage")`
  - 1521–1521: `assert.equal(strip.tabIndex, 0)`
  - 1523–1523: `assert.deepEqual([...presets.children].map((c) => c.textContent), ["FLAT", "ROLLING", "HILLY"])`
  - 1526–1526: `assert.equal(kinds.at(-1), "elev:rolling")`
  - 1528–1528: `assert.equal(st.undo, u0 + 1)`
  - 1529–1529: `assert.equal(st.design.heights.length, st.design.pts.length)`
  - 1530–1530: `assert.ok(st.design.heights.some((h) => h !== 0), "rolling moves nodes")`
  - 1531–1531: `assert.deepEqual(st.design.elevations, [], "presets clear legacy cosine hills")`
  - 1538–1538: `assert.equal(kinds.at(-1), "elev:node")`
  - 1539–1539: `assert.equal(b.D.state().design.heights[pick], 5)`
  - 1550–1550: `assert.equal(b.D.undo(), true)`
  - 1551–1551: `assert.notEqual(b.D.state().design.heights[pick], 5)`
  - 1552–1552: `assert.equal(b.D.redo(), true)`
  - 1553–1553: `assert.equal(b.D.state().design.heights[pick], 5)`
  - 1556–1556: `assert.ok(b.D.state().design.heights.every((h) => h === 0))`
  - 1560–1560: `assert.ok(b.D.state().design.heights.every((h) => h === 0), "missing heights → flat")`
  - 1561–1561: `assert.equal(b.D.state().design.heights.length, b.D.state().design.pts.length)`
### "DESIGNED RANDOMISE: FAST fills four cards (busy while it runs), USE loads one in one UNDO, MORE LIKE THIS replaces them"

- Case: 1565–1621. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.designed`, `b.D.state`, `b.D.preview`, `b.D.undo`, `b.D.moreLikeThis`, `b.D.useCandidate`
- Assertion semantics and spans:
  - 1569–1569: `assert.deepEqual(row.children.map((c) => c.textContent), ["FAST", "TECHNICAL", "MIXED"])`
  - 1570–1570: `assert.ok(row.children.every((c) => c.getAttribute("aria-pressed") === "false"))`
  - 1572–1572: `assert.equal(grid.hidden, true, "no cards before a style is pressed")`
  - 1573–1573: `assert.equal(row.parentNode, grid.parentNode, "the style row and the cards share 4 DETAILS")`
  - 1576–1576: `assert.equal(grid.getAttribute("aria-busy"), "true", "aria-busy while designing")`
  - 1577–1577: `assert.ok(row.children.every((c) => c.disabled), "style chips disabled while designing")`
  - 1578–1578: `assert.equal(msgText(b), "Designing 16 circuits…")`
  - 1579–1579: `assert.equal(fast.getAttribute("aria-pressed"), "true")`
  - 1580–1580: `assert.equal(chipsIn(design, "TECHNICAL")[0].getAttribute("aria-pressed"), "false")`
  - 1581–1581: `assert.equal(await run, true)`
  - 1582–1582: `assert.equal(grid.hasAttribute("aria-busy"), false, "aria-busy cleared")`
  - 1583–1583: `assert.ok(row.children.every((c) => !c.disabled))`
  - 1584–1584: `assert.equal(grid.hidden, false)`
  - 1585–1585: `assert.equal(grid.children.length, 4, "four cards")`
  - 1587–1587: `assert.equal(st.candidates.length, 4)`
  - 1588–1588: `assert.ok(st.candidates[i - 1].score >= st.candidates[i].score, "best first")`
  - 1590–1590: `assert.ok(card.classList.contains("td-card"))`
  - 1591–1591: `assert.equal(card.children[0].tagName, "CANVAS")`
  - 1591–1591: `assert.equal(card.children[0].getAttribute("aria-hidden"), "true")`
  - 1592–1592: `assert.match(card.children[1].textContent, /^\d+\.\d km · \d+ corners · \d+ passing$/)`
  - 1593–1593: `assert.deepEqual(chipsIn(card).map((c) => c.textContent), ["USE", "MORE LIKE THIS"])`
  - 1595–1595: `assert.match(msgText(b), /^FAST: the best 4 of 16/)`
  - 1598–1598: `assert.deepEqual(plain(b.D.state().candidates), plain(st.candidates))`
  - 1603–1603: `assert.equal(now.undo, u0 + 1, "one UNDO entry")`
  - 1604–1604: `assert.equal(now.design.seed, st.candidates[1].seed)`
  - 1605–1605: `assert.equal(now.design.originId, undefined, "SAVE adds a new circuit")`
  - 1606–1606: `assert.equal(b.D.preview().ok, true, "the card is green")`
  - 1607–1607: `assert.equal(b.D.undo(), true)`
  - 1608–1608: `assert.deepEqual(plain(b.D.state().design.pts), d0, "UNDO brings the design back")`
  - 1611–1611: `assert.equal(grid.getAttribute("aria-busy"), "true")`
  - 1612–1612: `assert.equal(await more, true)`
  - 1613–1613: `assert.equal(grid.hasAttribute("aria-busy"), false)`
  - 1615–1615: `assert.ok(after.length >= 2 && after.length <= 4 && grid.children.length === after.length, after.length + " variants")`
  - 1616–1616: `assert.ok(after.every((c) => !st.candidates.some((o) => o.seed === c.seed)), "new seeds: the cards were replaced")`
  - 1617–1617: `assert.match(msgText(b), /circuits like design 1/)`
  - 1618–1618: `assert.equal(b.D.useCandidate(0), true)`
  - 1619–1619: `assert.equal(b.D.preview().ok, true, "a variant is green")`
  - 1620–1620: `assert.equal(b.D.useCandidate(9), false, "no such card")`
### "CARD: a share link too long for the card is not cut mid-code; the card points at SHARE instead"

- Case: 1639–1652. Fixtures: `bootScreen`, `openGreen`, `recordingCanvas`; shared fixture and limits above apply.
- Exercised calls: `b.D.shareCard`, `b.D.state`, `b.CD.shareUrl`
- Assertion semantics and spans:
  - 1648–1648: `assert.ok(b.CD.shareUrl(code).length > 400, "a real code is far longer than the card's link column")`
  - 1650–1650: `assert.equal(lines.some((t) => t.length > 6 && code.includes(t.replace(/…$/, ""))), false, "no fragment of the code on the card: " + lines.join(" \| "))`
  - 1651–1651: `assert.ok(lines.includes("#track=…") && lines.includes("full link: SHARE"), lines.join(" \| "))`
### "CARD: a 640×360 PNG to the share sheet when canShare({files}) allows, else NativeDownload, else <a download>; a dismissed sheet is silent; red refuses"

- Case: 1654–1709. Fixtures: `bootScreen`, `openGreen`, `recordingCanvas`, `SHORT_LOOP`; shared fixture and limits above apply.
- Exercised calls: `Array.isArray`, `b.D.shareCard`, `b.CD.shareUrl`, `b.D.state`, `Object.assign`, `b.D.load`, `b.D.preview`
- Assertion semantics and spans:
  - 1663–1663: `assert.deepEqual(chipsIn(foot).map((c) => c.textContent).slice(3, 6), ["SHARE", "CARD", "EXPORT"], "CARD sits after SHARE in the foot")`
  - 1664–1664: `assert.equal(await b.D.shareCard(), true)`
  - 1666–1666: `assert.deepEqual([c.width, c.height], [640, 360], "an offscreen 640×360 card")`
  - 1668–1668: `assert.equal(shared.length, 1)`
  - 1670–1670: `assert.match(f.name, /^apex26-track-[a-z0-9-]+-card\.png$/)`
  - 1671–1671: `assert.equal(f.type, "image/png")`
  - 1672–1672: `assert.deepEqual([shared[0].title, shared[0].text], [name, url], "the full link always rides the share text")`
  - 1673–1673: `assert.ok(texts.includes(name) && texts.includes("APEX 26 · TRACK DESIGNER"), "name and mark drawn: " + texts.join(" \| "))`
  - 1674–1674: `assert.ok(texts.some((t) => /km · \d+ corners · est lap \d+:\d\d\.\d$/.test(t)), "the facts line")`
  - 1676–1676: `assert.ok(urlLines.length >= 1 && urlLines.length <= 3, "the link in at most three lines: " + urlLines.join(" \| "))`
  - 1678–1678: `assert.equal(urlLines.some((t) => /#trac$/i.test(t) \|\| /^k=/i.test(t)), false, "no mid-word #track wrap: " + urlLines.join(" \| "))`
  - 1679–1679: `assert.ok(urlLines.some((t) => /#track=/.test(t) \|\| t === "#track="), "#track= token stays whole: " + urlLines.join(" \| "))`
  - 1680–1680: `assert.equal(msgText(b), "Card shared")`
  - 1684–1684: `assert.equal(await b.D.shareCard(), true)`
  - 1685–1685: `assert.deepEqual(native, [["image/png", f.name]])`
  - 1686–1686: `assert.equal(msgText(b), "Card saved as " + f.name)`
  - 1693–1693: `assert.equal(await b.D.shareCard(), true)`
  - 1694–1694: `assert.deepEqual(anchors, [["blob:card", f.name]])`
  - 1699–1699: `assert.equal(await b.D.shareCard(), false)`
  - 1700–1700: `assert.equal(anchors.length, 1)`
  - 1700–1700: `assert.equal(native.length, 1)`
  - 1701–1701: `assert.equal(msgText(b), before)`
  - 1705–1705: `assert.equal(b.D.preview().ok, false)`
  - 1706–1706: `assert.equal(await b.D.shareCard(), false)`
  - 1707–1707: `assert.equal(canvases.length, n0)`
  - 1708–1708: `assert.match(msgText(b), /Fix the red issues before sharing/)`
### "CARD re-entry: a second shareCard while the first is mid-share is refused (no double download)"

- Case: 1711–1737. Fixtures: `bootScreen`, `openGreen`, `recordingCanvas`; shared fixture and limits above apply.
- Exercised calls: `Array.isArray`, `b.D.shareCard`
- Assertion semantics and spans:
  - 1732–1732: `assert.equal(typeof release, "function", "first call entered nav.share")`
  - 1733–1733: `assert.equal(await b.D.shareCard(), false, "re-entry refused while busy")`
  - 1735–1735: `assert.equal(await first, true)`
  - 1736–1736: `assert.equal(msgText(b), "Card shared")`
### "TEST HERE: saves, arms the return, starts a TIME TRIAL on the circuit, drops the car at rest on the selected point and goes green; a failed start comes back with the reason"

- Case: 1739–1856. Fixtures: `bootScreen`, `openGreen`, `SHORT_LOOP`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.V.check`, `Object.assign`, `b.D.isOpen`, `Promise.resolve().then`, `Promise.resolve`, `b.C.consumeTrackHash`, `b.C.create`, `b.D.testHere`, `b.Tracks.LIST.findIndex`, `Math.abs`, `Math.min`, `b.Tracks.sample`, `Math.atan2`, `b.C.afterStart`, `b.D.load`, `b.D.close`
- Assertion semantics and spans:
  - 1761–1761: `assert.equal(chip.parentNode.children[chip.parentNode.children.length - 1], chip, "appended to the actions row")`
  - 1762–1762: `assert.ok(b.root.querySelector('.td-chips[data-role="toolbar"]'), "FIT VIEW lives on the stage toolbar")`
  - 1763–1763: `assert.ok(chipsIn(b.root.querySelector(".td-stage"), "FIT VIEW").length === 1)`
  - 1765–1765: `assert.equal(ctxRow.children[ctxRow.children.length - 1].textContent, "TEST HERE", "…and to the press-and-hold row")`
  - 1766–1766: `assert.equal(chip.getAttribute("aria-disabled"), "true")`
  - 1767–1767: `assert.equal(await b.D.testHere(), false, "no point, no drive")`
  - 1768–1768: `assert.match(msgText(b), /Select a point/)`
  - 1769–1769: `assert.equal(calls.length, 0)`
  - 1771–1771: `assert.equal(chip.getAttribute("aria-disabled"), "false")`
  - 1772–1772: `assert.equal(await b.D.testHere(), true)`
  - 1774–1774: `assert.ok(id && b.D.state().design.originId === id, "saved first")`
  - 1775–1775: `assert.deepEqual(plain(calls), [["raceIntro"], ["startRace", b.Tracks.LIST.findIndex((t) => t.id === id), true, false, false], ["snap"], ["hud"], ["goRolling"]], "trackIdx + time trial + gp flow, closed, the pre-race screen, then the drop and the green")`
  - 1776–1776: `assert.equal(b.G.state, "race")`
  - 1782–1782: `assert.ok(wrapD <= 20, "placed at s " + p.s + " vs " + sExp)`
  - 1785–1785: `assert.deepEqual([p.px, p.pz, p.head], [smp.p[0], smp.p[2], Math.atan2(smp.t[0], smp.t[2])], "world pose from the track sample")`
  - 1786–1786: `assert.equal(p.prog, p.s - tr.total, "an out-lap: the first crossing starts the timed lap")`
  - 1787–1787: `assert.equal(p._prevS, p.s)`
  - 1788–1788: `assert.deepEqual([p.x, p.xVis, p.speed, p.vLat, p.yawRateCur, p.yawVis, p.steerVis, p.rescueT, p.wallT, p.wasOnWall, p.wrongT, p.wrongWay, p.offT], [0, 0, 0, 0, 0, 0, 0, 0, 0, false, 0, false, 0], "at rest, every transient cleared")`
  - 1789–1789: `assert.deepEqual([p.rPrevPx, p.rPrevPz, p.rPrevS, p.rPrevX, p.rPrevHead, p.rPrevYawVis], [p.px, p.pz, p.s, 0, p.head, 0], "render anchors seeded")`
  - 1794–1794: `assert.deepEqual(plain(calls), [["snap"], ["hud"], ["goRolling"]], "a restart drops the car on the point again and goes green")`
  - 1795–1795: `assert.equal(b.G.state, "race")`
  - 1796–1796: `assert.equal(b.G.player.s, sTest, "…the same point, not the grid line")`
  - 1797–1797: `assert.equal(b.G.player.speed, 0)`
  - 1799–1799: `assert.equal(calls.length, 0, "a race already rolling is left alone")`
  - 1805–1805: `assert.deepEqual(plain(calls), [["snap"], ["hud"]], "late afterStart relocates without a second goRolling")`
  - 1806–1806: `assert.equal(b.G.state, "race")`
  - 1807–1807: `assert.equal(b.G.player.s, sTest, "…onto the armed point, not the grid")`
  - 1808–1808: `assert.equal(b.G.player.speed, 0)`
  - 1809–1810: `assert.match(gameSource(), /request\.outcome\.then\(\(r\) => \{ if \(r\.kind === "committed" && sessionEntry\.owns\(r\)\) CustomTracks\.afterStart\(\); \}/, "game.js starts the custom-track handoff only for its owning committed session")`
  - 1815–1815: `assert.equal(await b.C.consumeTrackHash(), null, "mid-race it waits")`
  - 1816–1816: `assert.equal(b.D.isOpen(), false)`
  - 1818–1818: `assert.equal(await b.C.consumeTrackHash(), true)`
  - 1819–1819: `assert.equal(b.D.isOpen(), true)`
  - 1820–1820: `assert.equal(b.D.state().sel, 12, "the selected point is back")`
  - 1822–1822: `assert.equal(calls.length, 0, "the return was taken: a later start is an ordinary one")`
  - 1823–1823: `assert.equal(msgText(b), "Back from the test drive")`
  - 1827–1827: `assert.equal(await b.D.testHere(), true)`
  - 1828–1828: `assert.deepEqual(plain(calls.map((c) => c[0])), ["startRace", "snap", "hud", "goRolling"], "headless: straight to the start, no pre-race screen")`
  - 1830–1830: `assert.equal(await b.C.consumeTrackHash(), true, "back on the designer for the next scenario")`
  - 1835–1835: `assert.equal(await b.D.testHere(), true)`
  - 1836–1836: `assert.deepEqual(plain(calls.map((c) => c[0])), ["raceIntro", "startRace", "snap", "hud", "goRolling"])`
  - 1838–1838: `assert.equal(await b.C.consumeTrackHash(), true)`
  - 1844–1844: `assert.equal(await b.D.testHere(), false)`
  - 1846–1846: `assert.deepEqual(plain(calls), [["raceIntro"], ["startRace"], ["quit"]], "never a frozen race")`
  - 1847–1847: `assert.equal(b.D.isOpen(), true)`
  - 1848–1848: `assert.match(msgText(b), /could not start/)`
  - 1853–1853: `assert.equal(await b.D.testHere(), false)`
  - 1854–1854: `assert.equal(calls.length, 0)`
  - 1855–1855: `assert.match(msgText(b), /Fix the red issues before racing/)`
### "consumeTrackHash: an armed return reopens with sel/span (only for the same design), defers mid-race keeping it, and is taken once"

- Case: 1858–1889. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.save`, `b.C.create`, `b.D.close`, `b.C.consumeTrackHash`, `b.C.armReturn`, `b.D.isOpen`, `b.D.state`, `b.D.open`, `b.D.randomise`, `b.D.preview`, `Object.keys(b.data).some`, `Object.keys`
- Assertion semantics and spans:
  - 1862–1862: `assert.equal(r.ok, true)`
  - 1866–1866: `assert.equal(await b.C.consumeTrackHash(), false, "nothing armed, no link: a no-op")`
  - 1869–1869: `assert.equal(await b.C.consumeTrackHash(), null)`
  - 1870–1870: `assert.equal(await b.C.consumeTrackHash(), null, "still armed while racing")`
  - 1871–1871: `assert.equal(b.D.isOpen(), false)`
  - 1873–1873: `assert.equal(await b.C.consumeTrackHash(), true)`
  - 1874–1874: `assert.equal(b.D.isOpen(), true)`
  - 1875–1875: `assert.deepEqual([b.D.state().sel, b.D.state().span], [5, 9])`
  - 1876–1876: `assert.equal(msgText(b), "Back from the test drive")`
  - 1878–1878: `assert.equal(await b.C.consumeTrackHash(), false, "taken once: the second call is a no-op")`
  - 1879–1879: `assert.equal(b.D.isOpen(), false)`
  - 1883–1883: `assert.equal(await b.C.consumeTrackHash(), true)`
  - 1884–1884: `assert.equal(b.D.isOpen(), true)`
  - 1885–1885: `assert.equal(b.D.state().sel, -1)`
  - 1886–1886: `assert.notEqual(msgText(b), "Back from the test drive")`
  - 1887–1887: `assert.equal(b.data.customTrackReturn, undefined, "memory only — nothing stored")`
  - 1888–1888: `assert.ok(!Object.keys(b.data).some((k) => /return/i.test(k)), "no stored return key")`
### "3 LOOK: a chip per theme (thirty), dual-colour swatches, the theme's blurb, and TIME OF DAY / TREES / CROWD rows that set design.look in one UNDO each"

- Case: 1891–1964. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `T.ORDER.slice`, `Array.isArray`, `T.swatchCss`, `T.get`, `b.D.state`, `b.D.setTheme`, `b.D.setLook`, `b.C.sanitize`, `b.D.undo`
- Assertion semantics and spans:
  - 1901–1901: `assert.equal(T.ORDER.length, 30)`
  - 1903–1903: `assert.deepEqual([...T.ORDER.slice(0, 20)], LEGACY_20, "legacy ORDER ids never reorder")`
  - 1904–1904: `assert.deepEqual([...T.ORDER.slice(20, 25)], SLICE_I, "slice I appends shipyard…island")`
  - 1905–1905: `assert.deepEqual([...T.ORDER.slice(25, 27)], ["blossom", "volcanic"], "new worlds append without shifting old share codes")`
  - 1906–1906: `assert.equal(typeof T.swatchCss, "function", "swatchCss helper for LOOK tiles")`
  - 1910–1910: `assert.ok(p && T.DRESS[id], id + " has PRESET + DRESS")`
  - 1911–1911: `assert.ok(Array.isArray(p.swatch) && p.swatch.length === 2, id + " has a swatch pair")`
  - 1912–1912: `assert.match(p.swatch[0], /^#[0-9a-fA-F]{6}$/, id + " swatch[0] hex")`
  - 1913–1913: `assert.match(p.swatch[1], /^#[0-9a-fA-F]{6}$/, id + " swatch[1] hex")`
  - 1914–1914: `assert.equal(T.swatchCss(id), "linear-gradient(135deg," + p.swatch[0] + " 50%," + p.swatch[1] + " 50%)")`
  - 1917–1918: `assert.equal(T.swatchCss(id), "linear-gradient(135deg," + T.PRESETS[id].swatch[0] + " 50%," + T.PRESETS[id].swatch[1] + " 50%)", id + " swatchCss matches its pair")`
  - 1921–1921: `assert.deepEqual(themeChips.map((e) => e.dataset.theme), [...T.ORDER], "one chip per preset, in share-code order")`
  - 1924–1924: `assert.equal(chip.getAttribute("aria-label"), p.label \|\| chip.dataset.theme)`
  - 1926–1926: `assert.ok(sw, chip.dataset.theme + " has a swatch")`
  - 1927–1927: `assert.equal(sw.getAttribute("aria-hidden"), "true")`
  - 1928–1928: `assert.equal(sw.style.background, T.swatchCss(chip.dataset.theme), chip.dataset.theme + " paints its swatch pair")`
  - 1930–1930: `assert.ok(lab && lab.textContent === (p.label \|\| chip.dataset.theme.toUpperCase()), chip.dataset.theme + " keeps a visible label")`
  - 1933–1933: `assert.ok(blurb, "the active theme's blurb is shown")`
  - 1934–1934: `assert.equal(blurb.textContent, T.get(b.D.state().design.theme).blurb)`
  - 1935–1935: `assert.equal(b.D.setTheme("winter"), true)`
  - 1936–1936: `assert.equal(blurb.textContent, T.PRESETS.winter.blurb, "…and follows the theme")`
  - 1938–1938: `assert.ok(look(key, v), key + ":" + v + " chip")`
  - 1939–1939: `assert.equal(b.D.state().design.look, undefined, "a new design stores no look")`
  - 1940–1940: `assert.equal(look("time", "auto").getAttribute("aria-pressed"), "true")`
  - 1943–1943: `assert.deepEqual(plain(b.D.state().design.look), { time: "night", trees: "normal", crowd: "normal" })`
  - 1944–1944: `assert.equal(b.D.state().undo, u0 + 1, "one UNDO entry")`
  - 1945–1945: `assert.equal(look("time", "night").getAttribute("aria-pressed"), "true")`
  - 1946–1946: `assert.equal(look("time", "auto").getAttribute("aria-pressed"), "false")`
  - 1947–1947: `assert.equal(b.D.setLook("time", "night"), false, "no-op on the same value")`
  - 1948–1948: `assert.equal(b.D.setLook("time", "midnight"), false, "unknown values are refused")`
  - 1949–1949: `assert.equal(b.D.setLook("trees", "many"), true)`
  - 1950–1950: `assert.equal(b.D.setLook("crowd", "packed"), true)`
  - 1951–1951: `assert.deepEqual(plain(b.D.state().design.look), { time: "night", trees: "many", crowd: "packed" })`
  - 1955–1955: `assert.equal(b.D.state().design.look, undefined, "all defaults → no look stored")`
  - 1956–1956: `assert.notEqual(b.C.sanitize(b.D.state().design).id, idLook)`
  - 1957–1957: `assert.equal(b.D.undo(), true)`
  - 1958–1958: `assert.deepEqual(plain(b.D.state().design.look), { time: "auto", trees: "normal", crowd: "packed" }, "UNDO restores the previous look")`
  - 1961–1961: `assert.match(css, /#trackdesigner \.td-chips\[data-role="themes"\]\s*\{/, "theme grid")`
  - 1962–1962: `assert.match(css, /#trackdesigner \.td-chips\[data-role="themes"\] \.swatch\s*\{/, "theme swatch paint box")`
  - 1963–1963: `assert.match(css, /forced-colors: active[\s\S]*\[data-role="themes"\][\s\S]*forced-color-adjust:\s*none/, "swatch colour survives forced-colors")`
### "ELEVATION mode exposes BANKING & KERBS: FLAT/SAUSAGE/RUMBLE + BERMS ON/OFF; undo restores"

- Case: 1967–1997. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.state`, `b.D.setKerbStyle`, `b.D.setBerms`, `b.D.undo`
- Assertion semantics and spans:
  - 1971–1971: `assert.ok(bank, "bank-kerbs group is built")`
  - 1972–1972: `assert.equal(bank.hidden, true, "hidden outside elevation")`
  - 1974–1974: `assert.equal(bank.hidden, false, "shown in elevation")`
  - 1976–1976: `assert.deepEqual([...kerbs.children].map((c) => c.textContent), ["FLAT", "SAUSAGE", "RUMBLE"])`
  - 1977–1977: `assert.equal(kerbs.children[0].getAttribute("aria-pressed"), "true", "flat is default")`
  - 1980–1980: `assert.equal(b.D.state().design.kerbStyle, "sausage")`
  - 1981–1981: `assert.equal(b.D.state().undo, u0 + 1)`
  - 1982–1982: `assert.equal(kerbs.children[1].getAttribute("aria-pressed"), "true")`
  - 1983–1983: `assert.equal(b.D.setKerbStyle("sausage"), false, "same style is no edit")`
  - 1984–1984: `assert.equal(b.D.setKerbStyle("rumble"), true)`
  - 1985–1985: `assert.equal(b.D.state().design.kerbStyle, "rumble")`
  - 1987–1987: `assert.deepEqual([...berms.children].map((c) => c.textContent), ["BERMS ON", "BERMS OFF"])`
  - 1988–1988: `assert.equal(berms.children[0].getAttribute("aria-pressed"), "true", "berms on by default")`
  - 1989–1989: `assert.equal(b.D.setBerms(false), true)`
  - 1990–1990: `assert.equal(b.D.state().design.berms, false)`
  - 1991–1991: `assert.equal(berms.children[1].getAttribute("aria-pressed"), "true")`
  - 1992–1992: `assert.equal(b.D.setBerms(false), false)`
  - 1993–1993: `assert.equal(b.D.undo(), true)`
  - 1994–1994: `assert.equal(b.D.state().design.berms, undefined, "undo restores default (absent = ON)")`
  - 1995–1995: `assert.equal(b.D.undo(), true)`
  - 1996–1996: `assert.equal(b.D.state().design.kerbStyle, "sausage")`
### "HOWTO elevation step names bank, kerb styles and berms"

- Case: 1999–2007. Fixtures: `bootScreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.HOWTO.STEPS.find`
- Assertion semantics and spans:
  - 2002–2002: `assert.ok(elev, "Elevation step exists")`
  - 2003–2003: `assert.match(elev.text, /BANK/i)`
  - 2004–2004: `assert.match(elev.text, /sausage/i)`
  - 2005–2005: `assert.match(elev.text, /rumble/i)`
  - 2006–2006: `assert.match(elev.text, /BERMS/i)`
### "SCENERY props palette: place at selected point, remove last, caps, UNDO, save keeps props"

- Case: 2009–2052. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `P.KINDS.join`, `b.D.state`, `b.D.setPropKind`, `b.D.cyclePoint`, `b.D.placeProp`, `b.D.removeProp`, `b.D.undo`, `P.counts`, `b.D.save`, `JSON.stringify`, `b.C.get`, `b.Tracks.LIST.find`
- Assertion semantics and spans:
  - 2014–2014: `assert.ok(P, "TrackDesignerProps is on the FULL boot")`
  - 2016–2016: `assert.equal(chips.map((e) => e.dataset.prop).join(","), P.KINDS.join(","), "one chip per kind")`
  - 2017–2017: `assert.ok(walk(b.root).find((e) => e.dataset && e.dataset.role === "props"), "props row")`
  - 2018–2018: `assert.ok(walk(b.root).find((e) => e.dataset && e.dataset.role === "prop-actions"), "place/remove")`
  - 2020–2020: `assert.equal(b.D.state().propKind, "stand", "default kind")`
  - 2021–2021: `assert.equal(b.D.setPropKind("stand"), false, "no-op on the same kind")`
  - 2022–2022: `assert.equal(b.D.setPropKind("gantry"), true)`
  - 2023–2023: `assert.equal(b.D.setPropKind("stand"), true)`
  - 2024–2024: `assert.equal(b.D.state().propKind, "stand")`
  - 2028–2028: `assert.equal(b.D.placeProp(), true)`
  - 2029–2029: `assert.equal(b.D.state().design.props.length, 1)`
  - 2030–2030: `assert.equal(b.D.state().design.props[0].kind, "stand")`
  - 2031–2031: `assert.equal(b.D.state().undo, u0 + 1)`
  - 2032–2032: `assert.equal(b.D.setPropKind("billboard"), true)`
  - 2033–2033: `assert.equal(b.D.placeProp("billboard"), true)`
  - 2034–2034: `assert.equal(b.D.state().design.props.length, 2)`
  - 2035–2035: `assert.equal(b.D.removeProp("billboard"), true)`
  - 2036–2036: `assert.equal(b.D.state().design.props.length, 1)`
  - 2037–2037: `assert.equal(b.D.state().design.props[0].kind, "stand")`
  - 2038–2038: `assert.equal(b.D.undo(), true)`
  - 2039–2039: `assert.equal(b.D.state().design.props.length, 2, "UNDO restores the removed board")`
  - 2044–2044: `assert.equal(P.counts(b.D.state().design.props).stand, P.CAPS.stand)`
  - 2045–2045: `assert.equal(b.D.placeProp("stand"), false, "at the stand cap")`
  - 2047–2047: `assert.equal(saved.ok, true, JSON.stringify(saved))`
  - 2049–2049: `assert.ok(stored.props && stored.props.length >= 1, "props persist in CustomTracks")`
  - 2051–2051: `assert.equal(typeof listed.scenery, "function", "saved def still carries scenery")`
### "scenery discovery filters without changing the circuit; atmosphere presets undo atomically"

- Case: 2054–2083. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.state`, `b.D.undo`
- Assertion semantics and spans:
  - 2061–2061: `assert.deepEqual(visible(), ["desertnight", "marina", "twilight", "stadium"])`
  - 2063–2063: `assert.deepEqual(visible(), ["desertnight"], "search includes descriptions and intersects the category")`
  - 2065–2065: `assert.deepEqual(visible(), [])`
  - 2066–2066: `assert.match(by("role", "theme-results").textContent, /No themes found/)`
  - 2068–2068: `assert.equal(visible().length, 30)`
  - 2069–2069: `assert.deepEqual(plain(b.D.state().design), before, "browsing never edits the circuit")`
  - 2070–2070: `assert.equal(b.D.state().undo, undo)`
  - 2072–2072: `assert.deepEqual(plain(b.D.state().design.look), { time: "dusk", trees: "many", crowd: "few" })`
  - 2073–2073: `assert.equal(b.D.state().undo, undo + 1)`
  - 2074–2074: `assert.equal(by("preset", "golden").getAttribute("aria-pressed"), "true")`
  - 2076–2076: `assert.equal(b.D.state().undo, undo + 1, "reapplying the same preset is a no-op")`
  - 2077–2077: `assert.deepEqual(plain(b.D.state().design), before)`
  - 2079–2079: `assert.equal(b.D.state().design.look.time, "night")`
  - 2080–2080: `assert.equal(b.D.state().design.look.crowd, "packed")`
  - 2082–2082: `assert.equal(b.D.state().design.look, undefined, "default stays compatible with old designs")`
### "prop inspector places on either side, clamps gaps, removes exactly one object and round-trips"

- Case: 2085–2112. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.placeProp`, `b.D.state`, `b.D.setPropKind`, `b.D.removeProp`, `b.D.undo`, `b.CD.decode`, `b.D.shareCode`, `b.D.save`, `b.C.get`, `b.D.state().design.props.at`
- Assertion semantics and spans:
  - 2090–2090: `assert.equal(b.D.placeProp(), true)`
  - 2091–2091: `assert.equal(b.D.state().design.props[0].side, -1)`
  - 2092–2092: `assert.equal(b.D.state().design.props[0].gap, 20)`
  - 2094–2094: `assert.equal(b.D.state().design.props[1].side, 1)`
  - 2095–2095: `assert.equal(b.D.state().design.props[1].gap, 9, "each kind keeps its own spacing")`
  - 2097–2097: `assert.equal(b.D.state().design.props[2].gap, 6, "matches the renderer clearance floor")`
  - 2100–2100: `assert.deepEqual(plain(b.D.state().design.props), original.slice(1))`
  - 2101–2101: `assert.equal(b.D.removeProp("stand"), false, "missing kind never removes a different prop")`
  - 2102–2102: `assert.deepEqual(plain(b.D.state().design.props), original)`
  - 2104–2104: `assert.equal(decoded.ok, true)`
  - 2105–2105: `assert.deepEqual(plain(decoded.design.props), original)`
  - 2106–2106: `assert.equal(saved.ok, true)`
  - 2107–2107: `assert.deepEqual(plain(b.C.get(saved.id).props), original)`
  - 2109–2109: `assert.equal(by("role", "prop-side").hidden, true)`
  - 2110–2110: `assert.equal(by("role", "prop-gap").hidden, true, "gantries span the road")`
  - 2111–2111: `assert.equal(b.D.state().design.props.at(-1).gap, 0)`
### "scenery sections are navigable without edits; paired section placement and object edits undo atomically"

- Case: 2114–2155. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.state`, `b.D.undo`, `b.D.setPropKind`, `b.D.selectRange`, `b.D.placeProp`, `Math.abs`, `b.D.state().design.props.slice`, `b.D.copyPropAt`, `b.D.close`
- Assertion semantics and spans:
  - 2119–2119: `assert.equal(themes.getAttribute("aria-selected"), "true")`
  - 2120–2120: `assert.equal(by("role", "prop-inspector").hidden, true)`
  - 2122–2122: `assert.equal(atmosphere.getAttribute("aria-selected"), "true")`
  - 2123–2123: `assert.equal(b.dom.document.activeElement, atmosphere)`
  - 2125–2125: `assert.equal(by("role", "prop-inspector").hidden, false)`
  - 2126–2126: `assert.equal(by("role", "atmosphere").hidden, true)`
  - 2127–2127: `assert.equal(b.D.state().undo, undo, "tab navigation never changes the design")`
  - 2129–2129: `assert.deepEqual(plain(b.D.state().design.look), { time: "dusk", trees: "many", crowd: "packed" })`
  - 2133–2133: `assert.equal(b.D.placeProp(), true)`
  - 2135–2135: `assert.equal(placed.length, 6)`
  - 2135–2135: `assert.equal(b.D.state().undo, undo + 1)`
  - 2136–2136: `assert.deepEqual(placed.map((p) => p.side), [-1, 1, -1, 1, -1, 1])`
  - 2137–2137: `assert.equal(b.D.placeProp(), false, "a whole over-cap row is refused")`
  - 2138–2138: `assert.equal(b.D.state().undo, undo + 1)`
  - 2140–2140: `assert.equal(by("role", "prop-editor").hidden, false)`
  - 2144–2144: `assert.ok(Math.abs(b.D.state().design.props[0].s - 0.35) < 1e-4)`
  - 2145–2145: `assert.equal(b.D.state().design.props[0].gap, 22)`
  - 2146–2146: `assert.deepEqual(plain(b.D.state().design.props.slice(1)), placed.slice(1))`
  - 2147–2147: `assert.deepEqual(plain(b.D.state().design.props), placed)`
  - 2148–2148: `assert.equal(b.D.state().design.props, undefined)`
  - 2150–2150: `assert.equal(b.D.copyPropAt(0), true)`
  - 2151–2151: `assert.equal(b.D.state().design.props.length, 2)`
  - 2152–2152: `assert.notEqual(b.D.state().design.props[0].s, b.D.state().design.props[1].s)`
  - 2153–2153: `assert.equal(b.D.state().design.props.length, 1)`
### "object categories, numeric gap and section swap are preferences; new objects undo and save"

- Case: 2157–2181. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.state`, `b.D.selectRange`, `b.D.placeProp`, `b.D.state().design.props.every`, `b.D.save`, `b.C.get`, `b.D.undo`, `b.D.close`
- Assertion semantics and spans:
  - 2162–2162: `assert.equal(by("prop", "pines").hidden, false)`
  - 2162–2162: `assert.equal(by("prop", "marshal").hidden, true)`
  - 2168–2168: `assert.equal(b.D.state().sel, 16)`
  - 2168–2168: `assert.equal(b.D.state().span, 4)`
  - 2169–2169: `assert.equal(b.D.state().undo, undo, "browsing and placement preferences do not create edits")`
  - 2170–2170: `assert.equal(b.D.state().design.props.length, 3)`
  - 2171–2171: `assert.ok(b.D.state().design.props.every((p) => p.kind === "pines" && p.gap === 33))`
  - 2172–2172: `assert.equal(saved.ok, true)`
  - 2172–2172: `assert.equal(b.C.get(saved.id).props.length, 3)`
  - 2173–2173: `assert.equal(b.D.state().design.props, undefined)`
  - 2174–2174: `assert.equal(gap.value, "20")`
  - 2175–2175: `assert.equal(gap.value, "28")`
  - 2177–2177: `assert.equal(by("prop", "pines").hidden, true)`
  - 2177–2177: `assert.equal(by("prop", "marshal").hidden, false)`
  - 2179–2179: `assert.equal(b.D.state().design.props[0].kind, "marshal")`
### "SCENERY props: REVERSE / START HERE remap s; RANDOMISE clears props"

- Case: 2183–2221. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.cyclePoint`, `b.D.state`, `b.D.placeProp`, `b.D.reverse`, `Math.abs`, `Math.floor`, `Math.hypot`, `b.D.setStart`, `Math.min`, `b.D.deletePoint`, `b.D.randomise`
- Assertion semantics and spans:
  - 2189–2189: `assert.ok(sel > 0)`
  - 2190–2190: `assert.equal(b.D.placeProp("stand"), true)`
  - 2193–2193: `assert.equal(b.D.reverse(), true)`
  - 2195–2195: `assert.ok(Math.abs(sRev - expectFlip) < 1e-6, "REVERSE flips prop s: " + s0 + " → " + sRev + " (want " + expectFlip + ")")`
  - 2209–2209: `assert.equal(b.D.setStart(iStart), true)`
  - 2211–2211: `assert.ok(Math.abs(sStart - expectStart) < 1e-6, "START HERE remaps prop s: " + sRev + " → " + sStart + " (want " + expectStart + ")")`
  - 2215–2215: `assert.equal(b.D.deletePoint(delAt), true)`
  - 2216–2216: `assert.ok(b.D.state().design.props && b.D.state().design.props.length === 1, "delete keeps the prop")`
  - 2217–2217: `assert.notEqual(b.D.state().design.props[0].s, sBeforeDel, "delete remaps prop s away from the pre-delete fraction")`
  - 2219–2219: `assert.equal(b.D.randomise(42), true)`
  - 2220–2220: `assert.equal(b.D.state().design.props, undefined, "RANDOMISE clears props")`
### "map ranges have immediate LOWER / RAISE controls in EDIT; offsets preserve hills, limits, selection and undo"

- Case: 2223–2256. Fixtures: `bootHooked`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `Array.from`, `b.D.setHeights`, `b.D.setMode`, `b.D.setSelectionMode`, `b.D.undo`, `b.D.selectRange`
- Assertion semantics and spans:
  - 2234–2234: `assert.equal(b.root.querySelector('.td-rail').scrollTop, 0, "map selection reveals height controls")`
  - 2235–2235: `assert.equal(box.hidden, false)`
  - 2236–2236: `assert.match(box.children[0].textContent, /HEIGHT CHANGE \(m\) · 4 POINTS/)`
  - 2240–2240: `assert.equal(after.mode, "edit")`
  - 2240–2240: `assert.equal(after.selectionMode, "range")`
  - 2241–2241: `assert.deepEqual([after.sel, after.span], [n - 2, 1])`
  - 2242–2242: `assert.equal(after.undo, before.undo + 1)`
  - 2243–2243: `assert.equal(after.design.heights[i], heights[i] + (i >= n - 2 \|\| i <= 1 ? 2.5 : 0))`
  - 2244–2244: `assert.equal(after.elevationHeat, true)`
  - 2245–2245: `assert.deepEqual(plain(b.D.state().design.heights), heights)`
  - 2247–2247: `assert.equal(b.D.state().design.heights[i], heights[i] - (i >= n - 2 \|\| i <= 1 ? 2.5 : 0))`
  - 2253–2253: `assert.equal(after.design.heights[0], limit)`
  - 2253–2253: `assert.equal(after.design.heights[1], limit - 3, "whole group stops together")`
  - 2254–2254: `assert.equal(b.D.state().undo, after.undo, "at limit is a no-op")`
  - 2255–2255: `assert.equal(box.hidden, true)`
### "SELECT END arms a touch-friendly span; stamp REPLACE uses it; group elev offsets the span"

- Case: 2258–2296. Fixtures: `bootHooked`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.armSpanEnd`, `b.D.state`, `b.D.setTool`, `b.D.applyStamp`, `b.D.undo`, `b.D.setMode`, `b.D.setHeights`, `b.D.setNodeHeight`
- Assertion semantics and spans:
  - 2262–2262: `assert.ok(end, "SELECT END chip in 4 DETAILS")`
  - 2263–2263: `assert.equal(end.disabled, true, "disabled with no selection")`
  - 2266–2266: `assert.equal(b.D.armSpanEnd(), true)`
  - 2267–2267: `assert.equal(b.D.state().spanArm, true)`
  - 2269–2269: `assert.deepEqual([b.D.state().sel, b.D.state().span, b.D.state().spanArm], [4, 8, false])`
  - 2270–2270: `assert.equal(end.textContent, "SPAN 5–9", "chip names the selected group")`
  - 2274–2274: `assert.ok(replace, "CORNERS offers REPLACE for the group")`
  - 2276–2276: `assert.equal(b.D.applyStamp(4, 8), true)`
  - 2277–2277: `assert.notDeepEqual(plain(b.D.state().design.pts), pts0, "REPLACE rewrites the span")`
  - 2279–2279: `assert.equal(b.D.undo(), true, "UNDO the stamp")`
  - 2283–2283: `assert.deepEqual([b.D.state().sel, b.D.state().span], [5, 9])`
  - 2286–2286: `assert.equal(hs0[i], 0)`
  - 2290–2290: `assert.equal(b.D.setHeights(seeded, 5), true)`
  - 2291–2291: `assert.equal(b.D.setNodeHeight(5, 3), true, "POINT m on a span offsets the group")`
  - 2293–2293: `assert.equal(hs[i], (i - 5) + 3, "point " + i)`
  - 2294–2294: `assert.equal(hs[0], 0, "outside the span stays flat")`
  - 2295–2295: `assert.deepEqual([b.D.state().sel, b.D.state().span], [5, 9], "span selection survives group elev")`
### "POINT m range offsets stop the whole selection at either height bound"

- Case: 2298–2313. Fixtures: `bootHooked`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state().design.heights.map`, `b.D.state`, `b.D.setHeights`, `b.D.selectRange`, `b.D.setNodeHeight`, `b.D.state().design.heights.slice`, `b.D.undo`, `b.D.close`
- Assertion semantics and spans:
  - 2304–2304: `assert.equal(b.D.setNodeHeight(3, sign * 60), true)`
  - 2305–2305: `assert.deepEqual(plain(b.D.state().design.heights.slice(3, 5)), [sign * 59, sign * 60])`
  - 2307–2307: `assert.equal(b.D.setNodeHeight(3, sign * 60), false, "limit is a no-op, not a flattened hill")`
  - 2308–2308: `assert.equal(b.D.state().undo, undoCount)`
  - 2309–2309: `assert.equal(b.D.state().design.heights[2], 0)`
  - 2310–2310: `assert.deepEqual(plain(b.D.state().design.heights), heights)`
### "RANDOMISE · TRACK OF THE DAY · FAST judge a candidate against the look only, never the old loop's elevations"

- Case: 2322–2341. Fixtures: `bootScreen`, `design`, `ellipse`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.load`, `b.D.randomise`, `b.C.sanitize`, `b.D.trackOfTheDay`, `b.D.state`, `b.D.designed`
- Assertion semantics and spans:
  - 2327–2327: `assert.equal(b.D.randomise(101), true, "RANDOMISE finds a clean loop after an ELEVATION edit")`
  - 2331–2331: `assert.equal(b.D.trackOfTheDay(day), true)`
  - 2334–2334: `assert.equal(b.D.trackOfTheDay(day), true)`
  - 2336–2336: `assert.deepEqual(rolled.pts, flat.pts, "same pts from a hilly start as from a flat one")`
  - 2337–2337: `assert.equal(rolled.seed, flat.seed)`
  - 2339–2339: `assert.equal(await b.D.designed("FAST", 4242), true)`
  - 2340–2340: `assert.equal(b.D.state().candidates.length, 4, "FAST fills four cards from a hilly start")`
### "every action that starts a new loop clears the old loop's zones, bridges, turns and props"

- Case: 2343–2372. Fixtures: `bootScreen`, `design`, `ellipse`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.C.sanitize`, `b.D.state`, `b.D.load`, `b.D.randomise`, `Math.cos`, `Math.sin`, `b.D.freehand`, `b.D.designed`, `b.D.useCandidate`, `b.D.startFrom`
- Assertion semantics and spans:
  - 2357–2357: `assert.deepEqual(plain([d.hwZones, d.bankZones, d.elevations, d.bridges, d.turns]), [[], [], [], [], []], what + ": zone lists empty")`
  - 2358–2358: `assert.equal(d.props, undefined, what + ": no authored props")`
  - 2360–2360: `assert.ok(b.D.state().design.props.length === 1, "the fixture carries a prop")`
  - 2361–2361: `assert.equal(b.D.randomise(101), true)`
  - 2361–2361: `clean("RANDOMISE")`
  - 2365–2365: `assert.equal(b.D.freehand(path), true)`
  - 2365–2365: `clean("DRAW")`
  - 2367–2367: `assert.equal(await b.D.designed("FAST", 4242), true)`
  - 2369–2369: `assert.equal(b.D.useCandidate(0), true)`
  - 2369–2369: `clean("USE")`
  - 2371–2371: `assert.equal(b.D.startFrom("monza"), true)`
  - 2371–2371: `clean("START FROM")`
### "REVERSE keeps each authored prop on the same bank (its side is relative to the travel direction)"

- Case: 2374–2395. Fixtures: `bootScreen`, `ellipse`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.load`, `b.C.sanitize`, `b.D.state`, `Math.hypot`, `b.D.reverse`, `b.D.setStart`, `b.D.state().design.props.map((p) => p.kind + p.side).sort`, `b.D.state().design.props.map`
- Assertion semantics and spans:
  - 2383–2383: `assert.equal(b.D.reverse(), true)`
  - 2388–2388: `assert.ok(o[0] * r[0] + o[1] * r[1] > 0.99, kind + " stays on the same bank after REVERSE: " + o + " vs " + r)`
  - 2390–2390: `assert.deepEqual(after.props.map((p) => p.kind + p.side).sort(), ["billboard1", "stand-1"], "the stored side is flipped with the travel direction")`
  - 2393–2393: `assert.equal(b.D.setStart(5), true)`
  - 2394–2394: `assert.deepEqual(b.D.state().design.props.map((p) => p.kind + p.side).sort(), sides, "START HERE leaves prop sides alone")`
### "an inserted point takes the heights of its neighbours, not 0 m (no notch mid-hill)"

- Case: 2397–2412. Fixtures: `bootScreen`, `ellipse`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.load`, `b.C.sanitize`, `b.D.state`, `b.D.setTool`, `b.D.applyStamp`, `P.findIndex`
- Assertion semantics and spans:
  - 2406–2406: `assert.equal(b.D.applyStamp(10, 10), true)`
  - 2408–2408: `assert.equal(h.length, P.length)`
  - 2410–2410: `assert.equal(h[k10], 10, "the kept point keeps its height")`
  - 2411–2411: `assert.ok(h[k10 + 1] > 0, "the point inserted after a 10 m point is not a 0 m notch: " + h.slice(k10, k10 + 4))`
### "selection controls synchronize both views; elevation edits keep the range and undo once"

- Case: 2414–2442. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.setMode`, `b.D.setSelectionMode`, `b.D.selectRange`, `b.D.undo`, `b.D.setNodeHeight`, `b.D.adjustElevation`, `b.D.close`
- Assertion semantics and spans:
  - 2421–2421: `assert.match(strip.getAttribute("aria-label"), /Span 3–6 \(4 points\)/)`
  - 2422–2422: `assert.equal(b.D.state().undo, before.undo, "selection stays outside history")`
  - 2425–2425: `assert.equal(b.D.state().span, 5, "switching to height dragging retains the group")`
  - 2429–2429: `assert.equal(raised.undo, before.undo + 1)`
  - 2430–2430: `assert.deepEqual([raised.sel, raised.span], [2, 5])`
  - 2431–2431: `assert.equal(raised.design.heights[i], i >= 2 && i <= 5 ? 3.25 : 0)`
  - 2433–2433: `assert.deepEqual(b.D.state().design.heights, before.design.heights)`
  - 2434–2434: `assert.doesNotMatch(strip.getAttribute("aria-label"), /Span 3–6/, "undo clears selection on both views")`
  - 2438–2438: `assert.equal(wrap[i], i >= n - 2 \|\| i <= 1 ? 2 : 0, "wrapped range follows driving order")`
  - 2440–2440: `assert.equal(b.D.adjustElevation("zero"), false, "empty selection cannot edit the whole track")`
### "level, smooth and zero affect only selected heights and retain smooth endpoints"

- Case: 2444–2461. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.setHeights`, `b.D.selectRange`, `b.D.adjustElevation`, `b.D.state().design.heights.slice`, `b.D.state().design.heights.every`, `b.D.close`
- Assertion semantics and spans:
  - 2450–2450: `assert.equal(b.D.adjustElevation("smooth"), true)`
  - 2452–2452: `assert.equal(out.undo, undo + 1)`
  - 2453–2453: `assert.deepEqual(plain(out.design.heights.slice(2, 6)), [2, 6, 4.5, 4])`
  - 2454–2454: `assert.equal(out.design.heights[1], 0)`
  - 2454–2454: `assert.equal(out.design.heights[6], 0)`
  - 2455–2455: `assert.equal(b.D.adjustElevation("level"), true)`
  - 2456–2456: `assert.deepEqual(plain(b.D.state().design.heights.slice(2, 6)), [2, 2, 2, 2])`
  - 2457–2457: `assert.equal(b.D.adjustElevation("zero"), true)`
  - 2458–2458: `assert.ok(b.D.state().design.heights.every((h) => h === 0))`
  - 2459–2459: `assert.equal(b.D.adjustElevation("zero"), false, "no-op does not add undo")`
### "deleting the start point retains every surviving point's elevation, with undo"

- Case: 2463–2471. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.load`, `b.D.deletePoint`, `b.D.state`, `b.D.undo`, `b.D.close`
- Assertion semantics and spans:
  - 2467–2467: `assert.deepEqual(plain(b.D.state().design.heights), d.heights.slice(1))`
  - 2468–2468: `assert.deepEqual(plain(b.D.state().design.pts), d.pts.slice(1))`
  - 2469–2469: `assert.deepEqual(plain(b.D.state().design.heights), d.heights)`
### "dragging an interior elevation grip keeps both ends of the selected span"

- Case: 2473–2487. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.selectRange`, `b.D.setSelectionMode`, `Math.hypot`, `b.D.state`, `b.D.close`
- Assertion semantics and spans:
  - 2483–2483: `assert.deepEqual([b.D.state().sel, b.D.state().span], [2, 8])`
  - 2485–2485: `assert.ok(h[5] > 0)`
  - 2485–2485: `assert.equal(h[2], h[5])`
  - 2485–2485: `assert.equal(h[8], h[5])`
  - 2485–2485: `assert.equal(h[1], 0)`
### "save after undo and redo replaces the current library record without duplicating"

- Case: 2489–2499. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.save`, `b.D.setWidth`, `b.D.preview`, `b.D.undo`, `b.D.state`, `b.D.redo`, `b.D.close`
- Assertion semantics and spans:
  - 2491–2491: `assert.equal(first.ok, true)`
  - 2493–2493: `assert.equal(second.ok, true)`
  - 2493–2493: `assert.notEqual(second.id, first.id)`
  - 2495–2495: `assert.equal(restored.id, first.id)`
  - 2495–2495: `assert.deepEqual(plain(b.D.state().library), [first.id])`
  - 2497–2497: `assert.equal(redone.id, second.id)`
  - 2497–2497: `assert.deepEqual(plain(b.D.state().library), [second.id])`
### "MY CIRCUITS collection controls import atomically and leave the working draft intact"

- Case: 2501–2529. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.importLibraryFile`, `JSON.stringify`, `b.C.list`, `b.D.commitLibraryImport`, `JSON.parse`, `b.D.exportLibraryFile`, `b.D.loadFrom`, `b.D.loadCollection`, `b.D.close`
- Assertion semantics and spans:
  - 2503–2503: `assert.deepEqual(walk(b.root).find((e) => e.dataset.role === "library-files").children.map((e) => e.textContent), ["RECOVER PREVIOUS DRAFT", "EXPORT ALL", "IMPORT LIBRARY"])`
  - 2505–2505: `assert.equal(await b.D.importLibraryFile({ size: 1000, text: async () => JSON.stringify(envelope) }), true)`
  - 2506–2506: `assert.match(msgText(b), /Nothing imported yet/)`
  - 2506–2506: `assert.equal(b.C.list().length, 0)`
  - 2507–2507: `assert.equal(b.D.commitLibraryImport(), true)`
  - 2508–2508: `assert.match(msgText(b), /Imported 1 circuits/)`
  - 2508–2508: `assert.equal(b.C.list().length, 1)`
  - 2509–2509: `assert.deepEqual(plain(b.D.state().design), draft)`
  - 2513–2513: `assert.equal(await b.D.exportLibraryFile(), true)`
  - 2514–2514: `assert.equal(exported.name, "apex26-circuits.apextracks.json")`
  - 2515–2515: `assert.equal(exported.data.format, b.C.COLLECTION_FORMAT)`
  - 2515–2515: `assert.equal(exported.data.items.length, 1)`
  - 2516–2516: `assert.equal(await b.D.loadFrom(JSON.stringify(envelope)), true)`
  - 2517–2517: `assert.equal(b.D.commitLibraryImport(), true)`
  - 2518–2518: `assert.match(msgText(b), /Imported 0 circuits.*1 duplicates/)`
  - 2519–2519: `assert.equal(await b.D.importLibraryFile({ size: 1000, text: async () => JSON.stringify({ ...envelope, items: [draft, { pts: [] }] }) }), false)`
  - 2520–2520: `assert.match(msgText(b), /Circuit 2 failed validation.*Nothing imported/)`
  - 2520–2520: `assert.equal(b.C.list().length, 1)`
  - 2521–2521: `assert.equal(await b.D.importLibraryFile({ size: 2000000, text: async () => { throw new Error("must not read"); } }), false)`
  - 2522–2522: `assert.match(msgText(b), /too large/)`
  - 2524–2524: `assert.equal(await b.D.loadCollection({ ...envelope, items: [{ ...draft, seed: 17 }] }), true)`
  - 2525–2525: `assert.equal(b.D.commitLibraryImport(), false)`
  - 2526–2526: `assert.match(msgText(b), /Library storage write failed.*Nothing imported/)`
  - 2527–2527: `assert.equal(b.C.list().length, 1)`
  - 2527–2527: `assert.deepEqual(plain(b.D.state().design), draft)`
### "first-save history keeps its library identity without linking another imported document"

- Case: 2531–2546. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setWidth`, `b.D.preview`, `b.D.save`, `b.D.undo`, `b.D.state`, `b.D.setName`, `b.D.load`, `b.C.list`, `b.C.get`, `b.D.close`
- Assertion semantics and spans:
  - 2535–2535: `assert.equal(restored.ok, true)`
  - 2535–2535: `assert.notEqual(restored.id, first.id)`
  - 2536–2536: `assert.deepEqual(plain(b.D.state().library), [restored.id], "pre-first-save undo replaces, rather than adds")`
  - 2540–2540: `assert.equal(other.ok, true)`
  - 2540–2540: `assert.equal(b.C.list().length, 2)`
  - 2542–2542: `assert.equal(back.id, restored.id)`
  - 2542–2542: `assert.equal(b.C.list().length, 2)`
  - 2543–2543: `assert.equal(b.C.get(other.id).name, "OTHER DOCUMENT", "saving the restored document does not replace the imported one")`
  - 2544–2544: `assert.equal(b.C.get(restored.id).name, "MY UNSAVED LABEL")`
### "SAVE persists the current library identity across reload, even with 24 circuits"

- Case: 2548–2570. Fixtures: `bootPersistedScreen`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.preview`, `b.D.save`, `b.C.upsert`, `b.D.setWidth`, `JSON.parse`, `restored.D.init`, `restored.D.open`, `restored.D.setWidth`, `restored.D.preview`, `restored.D.save`, `JSON.stringify`, `restored.C.list`, `restored.C.get`, `b.D.close`, `restored.D.close`
- Assertion semantics and spans:
  - 2553–2553: `assert.equal(first.durable, true)`
  - 2554–2554: `assert.equal(b.C.upsert(design({ seed: 100 + i })).ok, true)`
  - 2556–2556: `assert.equal(JSON.parse(b.disk.get("apex26.customTrackDraft")).originId, first.id)`
  - 2557–2557: `assert.equal(saved.durable, true)`
  - 2557–2557: `assert.notEqual(saved.id, first.id)`
  - 2559–2559: `assert.equal(draft.id, saved.id)`
  - 2559–2559: `assert.equal(draft.originId, saved.id)`
  - 2564–2564: `assert.equal(edited.ok, true, JSON.stringify(edited))`
  - 2565–2565: `assert.equal(restored.C.list().length, count, "reload edits replace rather than duplicate")`
  - 2566–2566: `assert.equal(restored.C.get(saved.id), null)`
  - 2567–2567: `assert.equal(restored.C.get(edited.id).baseHW, 8)`
### "SAVE preserves its nondurable warning and retries the draft identity when storage recovers"

- Case: 2572–2591. Fixtures: `bootPersistedScreen`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.preview`, `b.D.save`, `b.D.setWidth`, `b.D.state`, `JSON.parse`, `b.D.close`
- Assertion semantics and spans:
  - 2576–2576: `assert.equal(first.durable, true)`
  - 2581–2581: `assert.equal(failedDisk.ok, true)`
  - 2581–2581: `assert.equal(failedDisk.durable, false)`
  - 2582–2582: `assert.match(msgText(b), /storage is full.*may not survive a reload/)`
  - 2583–2583: `assert.equal(b.D.state().design.originId, failedDisk.id, "the session keeps its edited circuit")`
  - 2584–2584: `assert.equal(b.disk.get("apex26.customTrackDraft"), before, "failed disk writes do not change persisted identity")`
  - 2585–2585: `assert.equal(JSON.parse(b.disk.get("apex26.customTracks")).items[0].id, first.id)`
  - 2587–2587: `assert.equal(b.D.save().durable, true)`
  - 2588–2588: `assert.equal(JSON.parse(b.disk.get("apex26.customTrackDraft")).originId, failedDisk.id)`
  - 2589–2589: `assert.equal(JSON.parse(b.disk.get("apex26.customTracks")).items[0].id, failedDisk.id)`
### "a refused SAVE leaves the draft's persisted library identity unchanged"

- Case: 2593–2607. Fixtures: `bootPersistedScreen`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.C.upsert`, `b.D.init`, `b.D.open`, `b.D.preview`, `b.D.save`, `b.D.setWidth`, `b.D.state`, `b.C.list`, `b.C.get`, `b.D.close`
- Assertion semantics and spans:
  - 2602–2602: `assert.equal(b.D.save().ok, false)`
  - 2603–2603: `assert.equal(b.D.state().design.originId, first.id)`
  - 2604–2604: `assert.equal(b.disk.get("apex26.customTrackDraft"), before)`
  - 2605–2605: `assert.equal(b.C.list().length, 1)`
  - 2605–2605: `assert.ok(b.C.get(first.id))`
### "an autosaved draft of an oversize loop is rejected on open instead of freezing the tab (13-F1)"

- Case: 2609–2620. Fixtures: `bootScreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.state`, `Math.hypot`, `Math.round`
- Assertion semantics and spans:
  - 2616–2616: `assert.ok(st.design && st.design.name !== "HOSTILE", "the oversize draft was not restored")`
  - 2618–2618: `assert.ok(per <= b.C.LIMITS.loopMaxLoose, "the opened design is a sane loop: " + Math.round(per) + " m")`
### "DELETE POINT 0 and a stamp over the start line keep every surviving point's own height (13-F2)"

- Case: 2622–2645. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.applyElevPreset`, `b.D.state`, `b.D.deletePoint`, `b.D.undo`, `b.D.setTool`, `b.D.applyStamp`
- Assertion semantics and spans:
  - 2625–2625: `assert.equal(b.D.applyElevPreset("hilly"), true)`
  - 2627–2627: `assert.ok(d0.heights.filter(Boolean).length > 10, "the hilly preset left real heights to misalign")`
  - 2633–2633: `assert.equal(b.D.deletePoint(0), true)`
  - 2635–2635: `assert.notDeepEqual(d1.pts[0], d0.pts[0], "the start point itself was deleted")`
  - 2636–2636: `assert.equal(bad(d0, d1), 0, "DELETE POINT 0: no survivor carries its neighbour's height")`
  - 2640–2640: `assert.equal(b.D.applyStamp(N - 2, 2, "corner"), true, "a stamp whose span wraps the start line")`
  - 2642–2642: `assert.ok(after.pts.filter((p) => before.pts.some((q) => key(q) === key(p))).length > 20, "plenty of shared points to check")`
  - 2643–2643: `assert.equal(bad(before, after), 0, "wrapping stamp: heights stay keyed to their points")`
  - 2644–2644: `assert.equal(green.pts.length > 0, true)`
### "RANDOMISE judges candidates on a clean base: the same seed gives the same loop on a hilly and a flat base, and the fresh loop carries none of the old edits"

- Case: 2665–2676. Fixtures: `bootScreen`, `openGreen`, `hillyBase`, `spyCheck`; shared fixture and limits above apply.
- Exercised calls: `flat.D.randomise`, `hilly.D.randomise`, `hilly.D.state`, `flat.D.state`, `JSON.stringify`, `Number.isFinite`
- Assertion semantics and spans:
  - 2669–2669: `assert.equal(flat.D.randomise(11), true)`
  - 2669–2669: `assert.equal(hilly.D.randomise(11), true)`
  - 2670–2670: `assert.deepEqual(plain(hilly.D.state().design.pts), plain(flat.D.state().design.pts), "TRACK OF THE DAY: a seed means one loop, whatever the player had open")`
  - 2671–2671: `assert.ok(seenHilly.length >= 1 && seenHilly.every(CLEAN), "every candidate was judged flat: " + JSON.stringify(seenHilly.find((s) => !CLEAN(s))))`
  - 2673–2673: `assert.deepEqual(plain([d.hwZones, d.bankZones, d.elevations, d.bridges, d.turns]), [[], [], [], [], []], "fraction-keyed edits of the old loop are gone")`
  - 2674–2674: `assert.equal(d.props, undefined)`
  - 2674–2674: `assert.ok(Number.isFinite(d.baseHW), "committed on the width it was judged on")`
  - 2675–2675: `assert.ok(d.heights.every((h) => h === 0))`
### "DESIGNED, USE and MORE LIKE THIS judge on a clean base and USE commits a fresh loop; DRAW and START FROM clear the old loop's edits"

- Case: 2678–2706. Fixtures: `bootScreen`, `openGreen`, `hillyBase`, `spyCheck`; shared fixture and limits above apply.
- Exercised calls: `flat.D.designed`, `hilly.D.designed`, `hilly.D.state`, `flat.D.state`, `JSON.stringify`, `hilly.D.moreLikeThis`, `hilly.D.useCandidate`, `Number.isFinite`, `hilly.D.startFrom`, `Math.cos`, `Math.sin`, `hilly.D.freehand`
- Assertion semantics and spans:
  - 2682–2682: `assert.equal(await flat.D.designed("FAST", 21), true)`
  - 2682–2682: `assert.equal(await hilly.D.designed("FAST", 21), true)`
  - 2683–2683: `assert.deepEqual(plain(hilly.D.state().candidates), plain(flat.D.state().candidates), "the same seeds give the same cards on either base")`
  - 2684–2684: `assert.ok(seen.length >= 16 && seen.every(CLEAN), "designed(): every check was on the clean base: " + seen.length + " " + JSON.stringify(seen.find((s) => !CLEAN(s))))`
  - 2686–2686: `assert.equal(await hilly.D.moreLikeThis(0), true)`
  - 2687–2687: `assert.ok(seen.length >= 1 && seen.every(CLEAN), "moreLikeThis(): every check was on the clean base")`
  - 2688–2688: `assert.equal(hilly.D.useCandidate(0), true)`
  - 2690–2690: `assert.deepEqual(plain([d.hwZones, d.bankZones, d.elevations, d.bridges, d.turns]), [[], [], [], [], []])`
  - 2691–2691: `assert.equal(d.props, undefined)`
  - 2691–2691: `assert.ok(Number.isFinite(d.baseHW))`
  - 2694–2694: `assert.equal(hilly.D.startFrom("monza"), true)`
  - 2696–2696: `assert.equal(d.props, undefined, "START FROM clears the old loop's props")`
  - 2697–2697: `assert.deepEqual(plain([d.hwZones, d.bankZones, d.elevations, d.bridges]), [[], [], [], []])`
  - 2702–2702: `assert.equal(hilly.D.freehand(path), true)`
  - 2704–2704: `assert.deepEqual(plain([d.hwZones, d.bankZones, d.elevations, d.bridges, d.turns]), [[], [], [], [], []], "DRAW clears the old loop's zones and bridges")`
  - 2705–2705: `assert.equal(d.props, undefined)`
### "export uses one snapshot while edits and replacements continue"

- Case: 2708–2724. Fixtures: `bootScreen`, `design`, `ellipse`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.load`, `b.D.exportEnvelope`, `b.D.setName`, `b.CD.decode`, `b.D.close`
- Assertion semantics and spans:
  - 2718–2718: `assert.equal(env.design.name, "BEFORE")`
  - 2719–2719: `assert.deepEqual(plain(env.design.pts), encoded.pts)`
  - 2721–2721: `assert.deepEqual(plain(back.design.pts), encoded.pts)`
  - 2722–2722: `assert.equal(back.design.name, env.design.name)`
### "hidden-page lifecycle flushes a pending draft before its debounce"

- Case: 2726–2735. Fixtures: `bootScreen`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.load`, `b.D.setName`, `b.C.draft`, `b.D.close`
- Assertion semantics and spans:
  - 2732–2732: `assert.equal(b.C.draft().name, "LAST EDIT")`
  - 2732–2732: `assert.equal(flushes, 1)`
  - 2733–2733: `assert.equal(flushes, 1)`
### "newer imports and manual edits supersede pending decodes"

- Case: 2737–2748. Fixtures: `bootScreen`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.load`, `b.D.loadFrom`, `b.D.state`, `b.D.setName`, `b.D.close`
- Assertion semantics and spans:
  - 2742–2742: `assert.equal(await latest, true)`
  - 2743–2743: `assert.equal(await old, false)`
  - 2744–2744: `assert.equal(b.D.state().design.name, "LATEST")`
  - 2746–2746: `assert.equal(await edited, false)`
  - 2747–2747: `assert.equal(b.D.state().design.name, "MANUAL")`
### "designer tabs link panels and use one tab stop with wrapping arrows, Home and End"

- Case: 2753–2769. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.close`
- Assertion semantics and spans:
  - 2758–2758: `assert.ok(panel)`
  - 2758–2758: `assert.equal(panel.getAttribute("aria-labelledby"), t.id)`
  - 2760–2760: `assert.deepEqual(tabs.map(t => t.tabIndex), [0,-1,-1])`
  - 2762–2762: `assert.equal(b.dom.document.activeElement,tabs[2])`
  - 2763–2763: `assert.deepEqual(tabs.map(t => t.tabIndex), [-1,-1,0])`
  - 2764–2764: `assert.equal(b.dom.document.activeElement,tabs[0])`
  - 2765–2765: `assert.equal(b.dom.document.activeElement,tabs[2])`
  - 2766–2766: `assert.equal(b.dom.document.activeElement,tabs[0])`
  - 2767–2767: `assert.deepEqual(tabs.map(t => t.tabIndex), [-1,0,-1])`
### "imported clearance and copy/move destination labels match effective placement"

- Case: 2771–2780. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.load`, `b.D.setMode`, `b.D.state`, `b.D.copyPropAt`, `b.D.selectRange`, `b.D.close`
- Assertion semantics and spans:
  - 2773–2773: `assert.match(followupText(list),/14 m \(stored 0 m\)/)`
  - 2776–2776: `assert.equal(move.disabled,true)`
  - 2776–2776: `assert.equal(copy.disabled,true)`
  - 2777–2777: `assert.equal(b.D.copyPropAt(0),false)`
  - 2777–2777: `assert.equal(b.D.state().undo,u)`
  - 2778–2778: `assert.equal(move.textContent,"MOVE TO POINT 4")`
  - 2778–2778: `assert.equal(copy.getAttribute("aria-label"),"COPY TO POINT 4")`
  - 2779–2779: `assert.equal(move.disabled,false)`
  - 2779–2779: `assert.equal(copy.disabled,false)`
### "recipe preview/cancel preserve history; whole mixed recipe applies and undoes once"

- Case: 2782–2793. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.selectRange`, `b.D.state`, `b.D.state().design.props.map`, `b.D.undo`, `b.D.close`
- Assertion semantics and spans:
  - 2785–2785: `assert.equal(b.D.state().undo,u)`
  - 2785–2785: `assert.deepEqual(plain(b.D.state().design),d)`
  - 2786–2786: `assert.match(followupText(walk(b.root).find(e=>e.dataset.role==="scenery-recipes")),/2 objects/)`
  - 2787–2787: `assert.equal(b.D.state().undo,u)`
  - 2789–2789: `assert.deepEqual(plain(b.D.state().design.props.map(p=>p.kind)),["marshal","camera"])`
  - 2789–2789: `assert.equal(b.D.state().undo,u+1)`
  - 2790–2790: `assert.deepEqual(plain(b.D.state().design),d)`
  - 2792–2792: `assert.equal(b.D.state().design.props.length,3)`
  - 2792–2792: `assert.equal(b.D.state().undo,u+1)`
### "repair comparison cancels without edits and refuses a changed base before apply"

- Case: 2795–2805. Fixtures: `bootScreen`, `shortLoop`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.setName`, `b.D.close`
- Assertion semantics and spans:
  - 2801–2801: `assert.equal(panel.hidden,false)`
  - 2801–2801: `assert.match(followupText(panel),/CURRENT · BLOCKED/)`
  - 2801–2801: `assert.match(followupText(panel),/PROPOSED · PASS/)`
  - 2802–2802: `assert.deepEqual(plain(b.D.state().design),d)`
  - 2802–2802: `assert.equal(b.D.state().undo,u)`
  - 2804–2804: `assert.equal(b.D.state().undo,u)`
  - 2804–2804: `assert.equal(b.D.state().design.name,"CHANGED")`
  - 2804–2804: `assert.match(followupText(panel),/Design changed/)`
### "Spa corner memory cards highlight three apexes and reveal labels without authoring edits"

- Case: 2807–2814. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.close`
- Assertion semantics and spans:
  - 2810–2810: `assert.equal(walk(panel).filter(e=>e.tagName==="CANVAS").length,3)`
  - 2811–2811: `assert.match(followupText(panel),/T1/)`
  - 2812–2812: `assert.match(followupText(panel),/Recall this turn/)`
  - 2812–2812: `assert.match(followupText(panel),/T1/)`
  - 2813–2813: `assert.deepEqual(plain(b.D.state().design),d)`
  - 2813–2813: `assert.equal(b.D.state().undo,u)`
  - 2813–2813: `assert.equal(b.D.state().sel,sel)`
### "CARD keeps its outline facts name link and native title on one pre-compression snapshot"

- Case: 2817–2832. Fixtures: `bootScreen`, `openGreen`, `recordingCanvas`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.cardCanvas`, `b.D.setName`, `b.D.setTheme`, `b.D.preview`, `b.D.close`
- Assertion semantics and spans:
  - 2825–2825: `assert.ok(release)`
  - 2826–2826: `assert.equal(card.title, original.name)`
  - 2826–2826: `assert.ok(texts.includes(original.name))`
  - 2826–2826: `assert.ok(!texts.includes("CHANGED AFTER CLICK"))`
  - 2827–2827: `assert.match(card.name, new RegExp(original.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")))`
  - 2829–2829: `assert.equal(decoded.design.name, original.name)`
  - 2829–2829: `assert.equal(decoded.design.theme, original.theme)`
  - 2830–2830: `assert.deepEqual(started, original)`
### "library review is cancellable mid-preflight and on close, and stale approval never writes"

- Case: 2834–2846. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.loadCollection`, `b.D.cancelLibraryImport`, `b.C.list`, `b.C.upsert`, `b.D.commitLibraryImport`, `b.D.close`
- Assertion semantics and spans:
  - 2838–2838: `assert.equal(await pending, false)`
  - 2838–2838: `assert.equal(b.C.list().length, 0)`
  - 2839–2839: `assert.equal(await b.D.loadCollection(env), true)`
  - 2840–2840: `assert.equal(b.C.list().length, 0, "review makes no write")`
  - 2842–2842: `assert.equal(b.D.commitLibraryImport(), false)`
  - 2842–2842: `assert.match(msgText(b), /changed.*Nothing imported/)`
  - 2843–2843: `assert.equal(b.C.list().length, 1)`
  - 2845–2845: `assert.equal(await closing, false)`
  - 2845–2845: `assert.equal(b.C.list().length, 1)`
### "native CARD share title remains captured when the design changes during PNG encoding"

- Case: 2849–2866. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.shareCard`, `b.D.setName`, `b.CD.decode`, `b.CD.fromHash`, `b.D.close`
- Assertion semantics and spans:
  - 2861–2861: `assert.equal(typeof finishPng, "function")`
  - 2863–2863: `assert.equal(await pending, true)`
  - 2863–2863: `assert.equal(shared.title, name)`
  - 2864–2864: `assert.equal((await b.CD.decode(b.CD.fromHash(shared.text.slice(shared.text.indexOf("#"))))).design.name, name)`
### "close cancels pending single-file and decoded imports without blocking a new closed API load"

- Case: 2869–2882. Fixtures: `bootScreen`, `design`; shared fixture and limits above apply.
- Exercised calls: `b.D.init`, `b.D.open`, `b.D.load`, `b.D.importFile`, `b.D.loadFrom`, `b.D.close`, `JSON.stringify`, `b.D.state`, `b.C.draft`, `b.D.isOpen`
- Assertion semantics and spans:
  - 2877–2877: `assert.equal(await pending,false,path+" loses ownership on close")`
  - 2878–2878: `assert.equal(JSON.stringify(b.D.state().design),before)`
  - 2878–2878: `assert.equal(JSON.stringify(b.C.draft()),draft)`
  - 2878–2878: `assert.equal(b.D.isOpen(),false)`
  - 2879–2879: `assert.equal(await b.D.loadFrom(JSON.stringify({format:"apex26.track",v:1,design:design({name:"EXPLICIT CLOSED"})})),true,"a new intentional closed API import remains supported")`
  - 2880–2880: `assert.equal(b.D.state().design.name,"EXPLICIT CLOSED")`
  - 2880–2880: `assert.equal(b.D.isOpen(),false)`
### "mode workspaces show only their own controls and navigation never edits the circuit"

- Case: 2884–2906. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.state`, `b.D.setMode`, `Object.entries`
- Assertion semantics and spans:
  - 2898–2898: `assert.equal(visible(node), owner === mode, owner + " controls in " + mode)`
  - 2899–2899: `assert.equal(chipsIn(b.root.querySelector(".td-rail"), "TEST HERE").some(visible), mode === "test")`
  - 2900–2900: `assert.equal(visible(b.root.querySelector('[aria-label="Circuit name"]')), mode === "test")`
  - 2901–2901: `assert.equal(visible(button("SELECT END")), false, "RANGE replaces the duplicate selection chip")`
  - 2902–2902: `assert.equal(visible(button("UNDO")), true, "history stays shared")`
  - 2904–2904: `assert.deepEqual(plain(b.D.state().design), plain(before.design))`
  - 2905–2905: `assert.equal(b.D.state().undo, before.undo)`
### "authored road bridge adds, refuses overlap/unsafe inputs, edits, undoes and survives save/share"

- Case: 2908–2953. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.selectRange`, `b.D.state`, `b.D.preview`, `b.V.build`, `Object.assign`, `b.D.undo`, `b.C.sanitize`, `b.CD.encode`, `b.CD.decode`, `b.C.upsert`, `b.C.list`, `b.D.close`, `b.D.open`
- Assertion semantics and spans:
  - 2916–2916: `assert.equal(add.disabled, true)`
  - 2918–2918: `assert.equal(add.disabled, false)`
  - 2921–2921: `assert.match(status.textContent, /grade budget/)`
  - 2922–2922: `assert.equal(b.D.state().undo, before.undo, "invalid bridge creates no history entry")`
  - 2925–2925: `assert.equal(added.design.bridges.length, 1)`
  - 2926–2926: `assert.equal(added.undo, before.undo + 1)`
  - 2927–2927: `assert.equal(added.design.bridges[0].halfM, 160)`
  - 2930–2930: `assert.ok(v.tr.py.some((y, i) => y > flat.py[i] + 1), "native track build raises the actual road")`
  - 2932–2932: `assert.match(status.textContent, /overlap/)`
  - 2933–2933: `assert.equal(b.D.state().undo, added.undo)`
  - 2937–2937: `assert.equal(b.D.state().design.bridges[0].rise, 9)`
  - 2938–2938: `assert.equal(b.D.undo(), true)`
  - 2939–2939: `assert.equal(b.D.state().design.bridges[0].rise, 8)`
  - 2942–2942: `assert.equal(decoded.ok, true)`
  - 2943–2943: `assert.deepEqual(plain(decoded.design.bridges), plain(stored.bridges))`
  - 2945–2945: `assert.equal(saved.ok, true)`
  - 2946–2946: `assert.deepEqual(plain(b.C.list()[0].bridges), plain(stored.bridges))`
  - 2948–2948: `assert.equal(b.D.state().design.bridges.length, 0)`
  - 2949–2949: `assert.equal(b.D.undo(), true)`
  - 2950–2950: `assert.equal(b.D.state().design.bridges.length, 1)`
  - 2952–2952: `assert.equal(b.D.state().design.bridges.length, 1, "draft reopens with its bridge")`
### "share clipboard fallback opens the workspace containing its copy field"

- Case: 2955–2967. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.showPane`, `b.D.share`, `b.D.state`
- Assertion semantics and spans:
  - 2959–2959: `assert.ok(url && url.includes("#track="))`
  - 2960–2960: `assert.equal(b.D.state().mode, "test")`
  - 2962–2962: `assert.equal(field.value, url)`
  - 2963–2963: `assert.equal(field.parentNode.hidden, false)`
  - 2964–2964: `assert.equal(b.root.dataset.pane, "design")`
  - 2965–2965: `assert.equal(field.parentNode.open, true, "fallback expands the copy field's disclosure")`
  - 2966–2966: `assert.equal(b.dom.document.activeElement, field)`
### "terrain library search filters without editing; landscapes place, undo and save"

- Case: 2970–2988. Fixtures: `bootScreen`, `openGreen`; shared fixture and limits above apply.
- Exercised calls: `b.D.setMode`, `b.D.state`, `b.D.selectRange`, `b.D.placeProp`, `b.D.save`, `b.C.get`, `b.D.undo`, `b.D.close`
- Assertion semantics and spans:
  - 2975–2975: `assert.equal(by("prop", "snowpeak").hidden, false)`
  - 2975–2975: `assert.equal(by("prop", "pond").hidden, true)`
  - 2977–2977: `assert.equal(by("prop", "snowpeak").hidden, false)`
  - 2977–2977: `assert.equal(by("prop", "mountain").hidden, true)`
  - 2979–2979: `assert.match(by("role", "object-results").textContent, /No objects found/)`
  - 2981–2981: `assert.equal(b.D.state().undo, undo)`
  - 2983–2983: `assert.equal(b.D.state().design.props[0].kind, "snowpeak")`
  - 2984–2984: `assert.equal(saved.ok, true)`
  - 2984–2984: `assert.equal(b.C.get(saved.id).props[0].kind, "snowpeak")`
  - 2985–2985: `assert.equal(b.D.state().design.props, undefined)`
  - 2986–2986: `assert.equal(b.D.state().design.theme, theme)`

### Shared assertion helpers

- `bootPersistedScreen` (52–84): 80–80: `assert.ok(draft, "an edit scheduled the draft autosave")`.
- `near` (318–318): 318–318: `assert.ok(Math.abs(a - b) <= tol, '${what}: ${a} vs ${b}')`.
- `samePlace` (333–333): 333–333: `assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol, '${what}: ${p} vs ${q}')`.
- `shortLoop` (897–905): 903–903: `assert.equal(v.ok, false)`.
- `clean` (2355–2359): 2357–2357: `assert.deepEqual(plain([d.hwZones, d.bankZones, d.elevations, d.bridges, d.turns]), [[], [], [], [], []], what + ": zone lists empty")`; 2358–2358: `assert.equal(d.props, undefined, what + ": no authored props")`.
- `hillyBase` (2649–2656): 2654–2654: `assert.ok(b.D.state().design.props.length >= 1 && b.D.state().design.hwZones.length === 1, "the base carries the old loop's edits")`.

## Cleanup findings

- No source changes proposed or performed. The designer suite is broad integration coverage in a VM despite its unit location; splitting by workspace/persistence/canvas/share/race handoff could improve navigation while retaining the shared boot boundary.
- Release suite historical STRIP commentary dominates lines 138–267; current assertions pin only current Monaco/Monza values. Move historical rationale to a separate structured history record if cleanup is authorized; do not weaken current geometry pins.
- `track-def-factory` first case label overstates mesh coverage: the canon hashes materialized points and metadata. Preserve the check and clarify wording if edited.
- Designer elevation case 1508–1563 dispatches Escape but does not assert its claimed selection-release behavior (1541–1548); stronger assertions would be needed before claiming Escape coverage from that case. The dedicated canvas Escape/B case asserts its own path.
- Native CARD title case 2849–2866 waits up to 40 zero-delay ticks for PNG entry; re-entry case 1711–1737 already uses an explicit entered signal. A signal-based helper could remove scheduling sensitivity.
- Load-budget Math.abs wrapper is restored in finally; window and Date.now substitutions in build-wait also restore in finally; HTTP mocks restore after each verdict (final ping case uses finally). Several designer cases leave the screen open, so pending preview/autosave timers can outlive case assertions; isolated VMs limit shared state but do not prove timer cleanup.
- No nonexistent JavaScript fixture filenames are promoted as module ownership. Historical/archive paths are intentionally omitted from this report.

Declared test-call total: 172. Runtime template loop in the release suite expands one declaration into two circuit cases. Assertion text is recorded as source evidence; no pass/fail conclusion was inferred.
