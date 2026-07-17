# Multi-round Quality Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the approved gameplay, lifecycle, data, test, and maintenance-guidance defects while preserving the user's existing touch-input work.

**Architecture:** Keep fixes inside existing IIFE modules and public test hooks. Each behavioral task follows RED→GREEN with a focused Playwright regression, receives an independent review, and leaves the one cache-version bump until integration.

**Tech Stack:** Browser JavaScript IIFEs, WebGL/WebGPU backend facade, Playwright, static GitHub Pages assets.

## Global Constraints

- Preserve existing modifications to `index.html`, `js/input.js`, and `version.json`, plus untracked `_probe-autosteer.mjs`.
- Do not alter touch/pointer behavior in `js/input.js`.
- Do not add dependencies or introduce ES modules.
- Do not expand scope into CI, service-worker redesign, WebGPU tuner parity, fixture migration, or architectural extraction.
- Use TDD for every behavior change: add the regression, observe the expected failure, implement the minimum fix, and observe it pass.
- Run implementation tasks sequentially because several touch `js/game.js`; run independent review rounds in parallel.
- Do not create git commits unless the user separately requests them.
- Apply one final cache bump from build 541 to build 542 after all JavaScript edits.

---

### Task 1: Correct sector timing lifecycle

**Files:**
- Modify: `js/game.js` (`startRace()`, player sector transition in `updateCar()`)
- Modify: `tests/time-trial.spec.js`

**Interfaces:**
- Consumes: existing `__apex.sectorState()`, `__apex.go()`, `__apex.jump()`, and `__apex.step()`
- Produces: sector state initialized to the grid's actual sector and completed `last[2]` S3 values

- [ ] **Step 1: Add failing sector regressions**

Add tests equivalent to:

```js
test("initializes sector timing from the player's grid sector", async ({ page }) => {
  await enterTT(page);
  const sector = await page.evaluate(() => window.__apex.sectorState());
  expect(sector.idx).toBe(2);
});

test("records S3 before resetting timing at the finish line", async ({ page }) => {
  await enterTT(page);
  const result = await page.evaluate(() => {
    window.__apex.go();
    window.__apex.jump(0.999, 80, 0);
    window.__apex.step(1 / 60, 10);
    return {
      timing: window.__apex.timing(),
      sectors: window.__apex.sectorState()
    };
  });
  expect(result.timing.lap).toBeGreaterThanOrEqual(1);
  expect(result.sectors.idx).toBe(0);
  expect(result.sectors.last[2]).not.toBeNull();
  expect(result.sectors.last[2]).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Verify RED**

Run:

```sh
npx playwright test tests/time-trial.spec.js --grep "grid sector|records S3"
```

Expected: initial sector is `0`, and/or S3 remains `null`.

- [ ] **Step 3: Implement minimal sector-state fix**

Add a private sector lookup based on normalized track progress. In
`startRace()`, initialize `sectorIdx` from `player.s`. In `updateCar()`, detect
and record a 2→0 transition before the finish-line block resets lap timing.
Keep the existing forward-progress guard and public `sectorState()` shape.

- [ ] **Step 4: Verify GREEN**

Run the focused command above, then:

```sh
npx playwright test tests/time-trial.spec.js
```

Expected: all tests pass.

---

### Task 2: Record only flying-lap ghost samples

**Files:**
- Modify: `js/game.js` (lights-out and finish-line ghost lifecycle)
- Modify: `tests/time-trial.spec.js`
- Read only: `js/ghost.js`

**Interfaces:**
- Consumes: `Ghost.startLap()`, `Ghost.record()`, `onTTLap()`
- Produces: persisted ghost samples beginning near `s=0` and monotonically increasing through one flying lap

- [ ] **Step 1: Add the failing ghost regression**

Create a deterministic time-trial test that starts from the grid, crosses the
line once to begin the flying lap, completes that lap, and then inspects
`localStorage["apex26.ghost.v1"].monza`.

Assert:

```js
expect(ghost.s.length).toBeGreaterThanOrEqual(8);
expect(ghost.s[0]).toBeLessThan(total * 0.02);
expect(ghost.s.every((s, i) => i === 0 || s >= ghost.s[i - 1])).toBe(true);
```

- [ ] **Step 2: Verify RED**

Run:

```sh
npx playwright test tests/time-trial.spec.js --grep "flying lap"
```

Expected: the first sample is near the circuit end or the sequence wraps backward.

- [ ] **Step 3: Implement the flying-lap boundary**

Remove `Ghost.startLap()` from lights-out. On the first valid forward
finish-line crossing in time trial, start recording instead of finishing a lap.
For later crossings, let `onTTLap()` finish the completed recording and start
the next one. Record the current tick only after finish-line lifecycle handling,
so wrapped start-line samples belong to the new lap.

- [ ] **Step 4: Verify GREEN**

Run the focused command and then:

```sh
npx playwright test tests/time-trial.spec.js
```

Expected: all tests pass and persisted distance is monotonic.

---

### Task 3: Preserve configured race duration and forced field order

**Files:**
- Modify: `js/game.js` (`update()`, `finishRace()`, optionally `endRace(forcedOrder)`)
- Modify: `tests/season.spec.js`
- Modify: `tests/dev-tools.spec.js`

**Interfaces:**
- Produces: emergency cutoff `360 * lapsTarget`; `finishRace()` results matching current `fieldState()` order

- [ ] **Step 1: Add failing long-race regressions**

Extend the season helper to select a requested lap chip, then test 10, 25, and
57 laps:

```js
for (const laps of [10, 25, 57]) {
  test(`does not end a ${laps}-lap race at 360 seconds`, async ({ page }) => {
    await startSeasonRace(page, laps);
    const state = await page.evaluate(() => {
      window.__apex.go();
      window.__apex.headless(true);
      window.__apex.step(1, 361);
      return window.__apex.info().state;
    });
    expect(state).toBe("race");
  });
}
```

- [ ] **Step 2: Verify long-race RED**

Run:

```sh
npx playwright test tests/season.spec.js --grep "does not end"
```

Expected: current state is `results`.

- [ ] **Step 3: Implement lap-scaled cutoff**

Replace the fixed `raceT > 360` fallback with:

```js
raceT > 360 * lapsTarget
```

Keep winner-finished handling unchanged.

- [ ] **Step 4: Add failing forced-order regression**

In `tests/dev-tools.spec.js`, arrange distinct car progress using the existing
debug car seam, capture expected driver codes from `fieldState()`, call
`finishRace()`, and assert results rows use that same order.

- [ ] **Step 5: Verify forced-order RED**

Run:

```sh
npx playwright test tests/dev-tools.spec.js --grep "current field order"
```

Expected: results follow construction order instead.

- [ ] **Step 6: Implement forced-order classification**

Have `finishRace()` capture the current progress-sorted order before marking all
cars finished. Pass that order to `endRace()` through an optional private
argument used only by this development hook. Preserve normal finish-time and
penalty sorting for organic races.

- [ ] **Step 7: Verify GREEN**

Run:

```sh
npx playwright test tests/season.spec.js --grep "does not end"
npx playwright test tests/dev-tools.spec.js --grep "current field order"
npm run test:modes
npm run test:api
```

Expected: all commands pass.

---

### Task 4: Invalidate custom-team decal textures

**Files:**
- Modify: `js/game.js` (`_decalTexCache`, `syncCustomTeam()`)
- Create: `tests/custom-team.spec.js`

**Interfaces:**
- Produces: private `invalidateDecalTextures(teamId)` that frees and deletes all matching cache entries

- [ ] **Step 1: Add failing cache invalidation test**

Instrument `GLX.createTexture` and `GLX.freeTexture`, create a custom-team setup
preview, change only a custom-team color, save, reopen the preview, and assert:

```js
expect(freedTextureIds).toContain(firstTextureId);
expect(secondTextureId).not.toBe(firstTextureId);
```

- [ ] **Step 2: Verify RED**

Run:

```sh
npx playwright test tests/custom-team.spec.js --grep "frees and rebuilds" --workers=1
```

Expected: no old texture is freed and the cache reuses it.

- [ ] **Step 3: Implement minimal invalidation**

Beside `_decalTexCache`, add:

```js
function invalidateDecalTextures(teamId) {
  const prefix = teamId + ":";
  Object.keys(_decalTexCache).forEach(function (key) {
    if (key.indexOf(prefix) !== 0) return;
    const tex = _decalTexCache[key];
    if (tex && gfx.freeTexture) gfx.freeTexture(tex);
    delete _decalTexCache[key];
  });
}
```

Call `invalidateDecalTextures("custom")` from `syncCustomTeam()` before the
updated team can render. Do not alter mesh or livery selection keys.

- [ ] **Step 4: Verify GREEN**

Run the focused command. Expected: pass.

---

### Task 5: Refresh recent session lists and reject stale picker responses

**Files:**
- Modify: `js/api.js`
- Modify: `js/data.js`
- Modify: `js/data-telemetry.js`
- Create: `tests/data-lifecycle.spec.js`

**Interfaces:**
- Produces: meeting-date registry, `meetingTtl(meetingKey)`, picker generation counter, telemetry driver generation counter

- [ ] **Step 1: Add meeting-TTL regressions**

Mock meetings started two and eight days ago. After the first
`sessionsForMeeting()` call, age the cache entry by eleven minutes.

Assert:

```js
expect(recentMeetingSessionRequests).toBe(2);
expect(historicMeetingSessionRequests).toBe(1);
```

- [ ] **Step 2: Verify meeting-TTL RED**

Run:

```sh
npx playwright test tests/data-lifecycle.spec.js --grep "meeting session lists" --workers=1
```

Expected: the recent meeting makes only one request.

- [ ] **Step 3: Implement meeting-aware TTL**

Add `meetingDates = {}`. While mapping `meetings()`, record each valid
`meetingKey -> dateStart`. Add:

```js
function meetingTtl(meetingKey) {
  const ds = meetingDates[meetingKey];
  if (!ds) return TTL_HISTORIC;
  const age = Date.now() - Date.parse(ds);
  return isFinite(age) && age >= 0 && age <= 7 * 24 * HOUR
    ? TTL_LATEST
    : TTL_HISTORIC;
}
```

Use `meetingTtl(meetingKey)` in `sessionsForMeeting()`.

- [ ] **Step 4: Add stale-response regressions**

Use deferred API promises to assert:

```js
expect(finalYearOptions).toEqual(optionsForLastSelectedYear);
expect(finalSessionOptions).toEqual(optionsForLastSelectedMeeting);
expect(finalDriverChips).toEqual(driversForLastSelectedSession);
```

Resolve older requests after newer requests. The older responses must not
mutate the visible picker or telemetry panes.

- [ ] **Step 5: Verify stale-response RED**

Run:

```sh
npx playwright test tests/data-lifecycle.spec.js --grep "latest year response|latest meeting response|latest telemetry driver response" --workers=1
```

Expected: at least one late response overwrites the latest selection.

- [ ] **Step 6: Implement generation guards**

In `js/data.js`, keep a module-level monotonically increasing `pickerGen`.
Capture `++pickerGen` for each picker request chain and return from both success
and failure handlers unless the captured value still equals `pickerGen`.

In `js/data-telemetry.js`, add `driverGen`. Increment it at
`renderTelemetryBody()` entry, increment existing `telGen` to invalidate
in-flight telemetry bundles, and guard `sessionDrivers()` handlers before any
DOM mutation.

- [ ] **Step 7: Verify GREEN**

Run all tests in `tests/data-lifecycle.spec.js`. Expected: pass.

---

### Task 6: Restore race music and strengthen smoke coverage

**Files:**
- Modify: `js/game.js` (`setSound()`)
- Modify: `tests/audio-smoke.spec.js`
- Modify: `tests/smoke.spec.js`

**Interfaces:**
- Produces: race music restart through existing `GameAudio.startMusic(trackIdx)`

- [ ] **Step 1: Add failing race-music regression**

Wrap `GameAudio.startMusic`, start Monza, clear startup calls, toggle
`#pm-sound` off and on, then assert one call with Monza's track index.

- [ ] **Step 2: Verify RED**

Run:

```sh
npx playwright test tests/audio-smoke.spec.js --grep "re-enabling sound during a race" --workers=1
```

Expected: no race `startMusic()` call.

- [ ] **Step 3: Implement minimal music restoration**

In the enabled branch of `setSound()`, preserve menu behavior and add:

```js
else if (state === "race") GameAudio.startMusic(trackIdx);
```

Do not start the engine here; pause/resume retains that responsibility.

- [ ] **Step 4: Strengthen the existing jump smoke test**

After `__apex.jump(0.5, 60, 2)`, assert:

```js
expect(probe.s / info.total).toBeCloseTo(0.5, 2);
expect(probe.speed).toBeCloseTo(60, 1);
expect(probe.x).toBeCloseTo(2, 1);
```

Use the actual current `info()`/`probe()` field names from the neighboring tests.
This is an assertion correction for existing behavior, so the new assertions
should pass without a production change.

- [ ] **Step 5: Verify GREEN**

Run:

```sh
npx playwright test tests/audio-smoke.spec.js --grep "re-enabling sound during a race" --workers=1
npx playwright test tests/smoke.spec.js --grep "jump\\(\\) sets player speed and lateral offset"
npm run test:smoke
```

Expected: all commands pass.

---

### Task 7: Correct verified stale comments and maintenance docs

**Files:**
- Modify: `js/data.js`
- Modify: `js/gfx.js`
- Modify: `js/webgpu/wgx.js`
- Modify: `js/webgpu/wgsl-fx.js`
- Modify: `js/game.js`
- Modify: `js/game/tables.js`
- Modify: `tests/camera.spec.js`
- Modify: `tools/apex-capture.mjs`
- Modify: `.claude/skills/playwright-probe/SKILL.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEBUG-HOOKS.md`
- Modify: `tools/README.md`
- Modify: `tools/audio-test.cjs`

**Interfaces:**
- Documentation/comment-only; no runtime behavior changes

- [ ] **Step 1: Apply narrow factual corrections**

Make only these verified updates:

- List all six Data Hub tabs, including TELEMETRY and EXPORT.
- Describe GLX as default and WGX as opt-in through the active Gfx selection
  seam; replace obsolete line-number references with stable function names.
- Make renderer-mesh comments backend neutral.
- Describe all 13 camera modes; update capture-tool counts from 12 to 13.
- Remove the hard-coded architecture build number and describe the `_site`
  runtime subset deployed by Pages.
- Replace nonexistent tool references with `render-car.mjs`, `car-viewer`, and
  `.claude/skills/playwright-probe/shot.mjs`.
- Correct `audio-test.js` examples to `audio-test.cjs`.

- [ ] **Step 2: Verify documentation references**

Run:

```sh
rg -n "track-batch-verify|shot-car\\.mjs|inspect-scene|tools/carshot\\.mjs|audio-test\\.js|currently 539" docs tools js .claude
npx playwright test tests/camera.spec.js
```

Expected: no stale-reference matches; camera tests pass.

---

### Task 8: Bump cache once and validate integration

**Files:**
- Modify narrowly: `index.html`
- Modify narrowly: `version.json`
- Do not modify: `js/input.js`

**Interfaces:**
- Produces: all asset URLs, `window.__APEX_BUILD`, and `version.json.build` at 542

- [ ] **Step 1: Re-read protected diffs**

Run:

```sh
git diff -- index.html js/input.js version.json
git status --short
```

Confirm the pointer-capture change is intact and note the exact existing build-541 diff.

- [ ] **Step 2: Apply only the 541→542 cache bump**

Change all current `?v=541` values and `window.__APEX_BUILD = 541` in
`index.html` to 542. Change only `"build": 541` to 542 in `version.json`.
Do not replace either file wholesale.

- [ ] **Step 3: Validate cache consistency**

Run:

```sh
test "$(rg -o '\\?v=542' index.html | wc -l | tr -d ' ')" = 57
! rg -n '\\?v=541|__APEX_BUILD = 541|"build": 541' index.html version.json
rg -n '__APEX_BUILD = 542|"build": 542' index.html version.json
```

Expected: all checks exit zero.

- [ ] **Step 4: Run targeted integration**

Run independent Playwright groups on distinct ports:

```sh
APEX_PORT=3461 npx playwright test tests/time-trial.spec.js tests/season.spec.js tests/dev-tools.spec.js --reporter=line
APEX_PORT=3462 npx playwright test tests/custom-team.spec.js tests/data-lifecycle.spec.js tests/audio-smoke.spec.js --reporter=line
APEX_PORT=3463 npx playwright test tests/smoke.spec.js tests/camera.spec.js --reporter=line
```

Then run:

```sh
npm run test:fast
git diff --check
git status --short
```

Expected: all tests and checks pass.

- [ ] **Step 5: Run parallel final reviews**

Dispatch independent reviewers for:

1. Gameplay/mode correctness.
2. Async lifecycle, resource cleanup, and audio behavior.
3. Test quality, documentation accuracy, protected-diff preservation, and
   cache-version consistency.

Fix confirmed Critical/Important findings in one consolidated fix round, rerun
covering tests, and dispatch the affected reviewers again.

