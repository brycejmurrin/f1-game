# Handoff: lighting-tuner distance sliders

Branch: `claude/lighting-tuner-sliders-mlkgfk`. Implementation is done and
committed; **browser/visual verification is NOT done** — that's the next
agent's job. Delete this file once verification is complete and folded into
the commit history (it's a handoff note, not permanent documentation).

## Prompt for the next agent

> Continue work on `claude/lighting-tuner-sliders-mlkgfk` in this repo. The
> previous session implemented three lighting-tuner changes (see "What was
> implemented" below and the full original plan appended at the bottom of
> this file) but could not verify them in a browser: Chrome DevTools MCP is
> misconfigured for this environment (see "MCP note" below — now fixed for
> *future* sessions, but the fix doesn't apply retroactively to an
> already-started session), and the session ran out of turns before finishing
> a Playwright-based verification pass after `npm ci` made Playwright
> available.
>
> Your job: verify the changes actually work, then report back / fix anything
> broken. Concretely:
>
> 1. `npm ci` (node_modules is gitignored, not committed).
> 2. Run the exact commands in the "Verification" section of the embedded
>    plan below — `node tools/apex-eval.mjs bahrain "..."` to confirm the new
>    `lampReach` / `renderDistMul` knobs exist in `__apex.lightTune()` with
>    the right defaults (1.0 / 1.0), and that pushing them to their extremes
>    (`lampReach: 4`, `renderDistMul: 2`, `moonShadow: 1`, `shadowRange: 300`)
>    doesn't throw or produce console errors while the game renders a few
>    frames (`__apex.step(1/60, 60)` after `race()`/`go()`/`jump()`).
> 3. Run `tests/specs/lighting-ab.spec.js` and `tests/specs/webgl-probes.spec.js`
>    via `node tools/test-bg.mjs ab webgl` in the background (never block/poll
>    — see `docs/TESTING.md` / `CLAUDE.md` for the watcher pattern), since
>    those are the specs most likely to catch a regression from the
>    `frame.moonK` → `frame.moonGate` swap or the `farPlane`/`cullDist`
>    change.
> 4. If you have a working Chrome DevTools MCP (check `/mcp` or try a
>    `mcp__chrome-devtools__*` tool), use it per `.claude/skills/mcp-probe` to
>    actually SEE the effect: load Bahrain at night, push `lampReach` and
>    `moonShadow` to their max via `__apex.lightTune(...)`, screenshot before
>    /after, and confirm the lit-lamp and shadow reach visibly extends ahead
>    of the car without changing the look at each knob's shipped default.
> 5. `npm run test:tooling-fast` should be clean except for pre-existing
>    unrelated failures (see "Known pre-existing failures" below) — confirm
>    the count hasn't grown.
> 6. Once verified, delete this handoff file, commit, and push to
>    `claude/lighting-tuner-sliders-mlkgfk`. Do NOT push to the deploy branch
>    (`claude/f1-game-project-26h3ng`) without the repo owner's explicit
>    review — see `CLAUDE.md` § Git branch & deploy.

## What was implemented (already committed)

Three lighting-tuner additions/fixes, all shipped as `TUNE_DEFS` knobs in
`js/game/lighting.js` (auto-render as sliders in the LIGHTING TUNER panel, no
panel code changes needed):

1. **`lampReach`** ("LAMP REACH AHEAD", LAMPS/BEHAVIOUR) — new knob. Gives
   lamps ahead of the camera priority in the nearest-lamp cull
   (`setFrameLights` in `js/game/lighting.js`), so a dense night circuit's lit
   zone reaches further down the road instead of lamps snapping on right in
   front of the car.
2. **`renderDistMul`** ("RENDER DISTANCE", ATMOSPHERE) — new knob. Scales the
   camera far-clip plane and the chunked-scenery draw-distance cull together
   (`js/game.js` `farPlane` / `frame.cullDist`), both previously hardcoded to
   900m.
3. **Shadow distance, three-part fix**: widened `shadowRange`'s ceiling
   (160m → 300m), gave `moonShadow` an escape hatch above 0.5 that overrides
   the clear-moon weather gate (`frame.moonGate`, new field, replaces
   `frame.moonK` at the two shadow-cast gate sites plus the GLX/TSL/WGX
   shadow-strength fade), and scaled the car's own cast-shadow box with
   `shadowRange` instead of a hardcoded ±42m.

Also raised the `js/game.js` module-size ratchet ceiling in
`tests/unit/module-size.test.mjs` (7980 → 7997 lines) with a comment
explaining why, and bumped `index.html`/`version.json` cache-busting to 1157.

Full diff is in commit `ccdce97` on this branch (and possibly later commits —
check `git log`).

## MCP note (already fixed for future sessions)

`.mcp.json`'s `chrome-devtools` server had a hardcoded absolute command path
(`/workspace/tools/chrome-devtools-mcp.sh`) that doesn't exist in this
environment (repo lives at `/home/user/f1-game` here). Changed to a relative
path (`tools/chrome-devtools-mcp.sh`) so it resolves regardless of clone
location — this fix is committed. It only takes effect on a **new** session
(MCP servers wire up at session start), and even then the local clone at
`scratch/chrome-devtools-mcp` isn't present (gitignored) so it'll fall back to
`npx chrome-devtools-mcp@latest` on first use, which needs network access —
should work through this environment's proxy but adds startup latency.

## Known pre-existing failures (NOT caused by this branch's changes)

Confirmed via `git stash` + re-run before making any changes — `npm run
test:tooling-fast` has 20 pre-existing failures unrelated to this work
(doc-count drift, an `espree` module-not-found in `wait-polling-lint.mjs`,
some capture-module contract tests, etc.). Don't treat these as regressions
to fix as part of this branch; only watch that the count doesn't grow.

---

## Full original plan (as approved, for reference)

# Lighting Tuner: light reach, shadow reach, render distance sliders

## Context

The player complaint: on a densely-lamped night circuit (Bahrain), street lamps
seem to "snap on" right in front of the car instead of being lit well ahead.
The user asked for three new tuner sliders: lamp light distance, shadow
distance (stronger), and render/draw distance.

Exploration (3 parallel Explore agents + 2 follow-up investigations) found:

- **Lamp distance** is genuinely a gap. Lamps aren't invisible beyond a fixed
  radius — the per-lamp pool radius (`lampRadiusMul`, already 28-36m reach) is
  fine. The real cause is the **nearest-N cull**: only the nearest `lampCap()`
  lamps (16-32, `lampCull` knob) are kept in the shader's 32-slot light list
  each frame (`setFrameLights` in `js/game/lighting.js`). On a dense track,
  lamps rank-drop out of that set until you're close, then rank-enter and fade
  in — reading as "lighting up right in front of me." There's already a
  behind-camera penalty (`lampBehindBias`) that biases the cull toward the
  road ahead, but nothing that extends how far ahead lamps are picked up.
- **Shadow distance** already has a shipped slider (`shadowRange`, "SHADOW
  DISTANCE", 16-160m, def 80) — but a deeper investigation (user asked to dig
  further) found it's **not the actual limiter** for the Bahrain-at-night
  complaint. Two independent, unrelated limits also gate shadow reach:
  1. Buildings/props stop casting shadows into the sun shadow map entirely at
     night unless there's a genuinely clear, dry, cloud-free moon
     (`game.js:5533`, gated on `frame.moonK`, itself zeroed by fog/cloud/wet).
  2. The car's own cast shadow is a hardcoded ±42m box (`game.js:5551`),
     completely decoupled from `shadowRange`.
  The user chose to fix both: widen `shadowRange`'s range AND relax the night
  prop-shadow gate AND scale the car shadow box with `shadowRange`.
- **Render distance** has no tuner knob at all today. The camera far-clip
  plane is a hardcoded `farPlane = 900` (`game.js:5312`), and the chunked-
  scenery radial draw-distance cull (`frame.cullDist`, consumed in
  `js/render/glx/chunked.js:165`) derives from that same hardcoded `900`
  (`game.js:5426-5428`), not from a player-facing setting.

All three fit the existing `TUNE_DEFS` architecture in `js/game/lighting.js`
(read via `LT.<id>`) — a new entry there auto-renders as a slider in the
LIGHTING TUNER panel (`js/game/tuner.js`) with no panel code changes needed,
and auto-persists via `LightStore` (`js/game/light-store.js`). No entry needs
`APPLY_RACE_IDS` since all three are read live, per-frame, not only inside
`applyRaceSettings()`.

## Changes

### 1. New knob: `lampReach` — "LAMP REACH AHEAD" (LAMPS / BEHAVIOUR)

`js/game/lighting.js` TUNE_DEFS, next to `lampBehindBias` (~line 117-118):
```js
{ id: "lampReach", label: "LAMP REACH AHEAD", group: "LAMPS", section: "BEHAVIOUR",
  min: 1, max: 4, step: 0.1, def: 1.0, help: "How much extra priority lamps AHEAD of the camera get in the nearest-lamp cull, so the lit zone reaches further down the road before a dense track's lamp budget runs out. 1 = as-shipped (pure distance + BEHIND-CAM BIAS), higher = lamps ahead win the budget over ones to the side/behind, pushing the boundary where lamps switch on further out. Only matters once a track has more lamps than the LAMP COUNT budget." }
```

`js/game/lighting.js`, `setFrameLights` heap-cull path (~line 735-755): mirror
the existing behind-camera penalty with a forward-boost branch that shrinks
`d` (the rank distance) for lamps roughly ahead of the camera, proportional to
how directly ahead they are — same cone-shaped `ratio2` term already used for
`lampBehindBias`, just applied as a divisor instead of a multiplier, gated
`else if (reach > 1)` so it's a no-op at the default.

### 2. New knob: `renderDistMul` — "RENDER DISTANCE" (ATMOSPHERE)

`js/game/lighting.js` TUNE_DEFS, end of the ATMOSPHERE group (~after
`lampVolCap`, line 148):
```js
{ id: "renderDistMul", label: "RENDER DISTANCE", group: "ATMOSPHERE", min: 0.5, max: 2, step: 0.05, def: 1.0, help: "Scales how far the camera can see — the far clipping plane AND the scenery draw-distance cull move together. 1 = as-shipped (900 m). Higher reveals more distant track/scenery at a real GPU cost (more chunks drawn every frame); lower saves performance on weak devices. Fog still fades distant geometry out visually regardless of this setting." }
```

`js/game.js`:
- Line 5312: `let fovY, farPlane = 900;` → seed with the knob:
  `let fovY, farPlane = 900 * (LT.renderDistMul != null ? LT.renderDistMul : 1);`
  (the `dbgCam` branch at line 5317 already overwrites `farPlane` with
  `dbgCam.far`, so debug/photo-mode camera behavior is untouched.)
- Lines 5426-5428: replace the hardcoded `900` literals with the same
  `farPlane` local (already in scope in `render(dt)`, and already holds
  either the tuned value or the debug-cam override):
  ```js
  const _fogCull = frame.fogDensity > 3 / farPlane ? Math.ceil(3 / frame.fogDensity) : 0;
  frame.cullDist = dbgCam ? (gfx.isMobile ? 700 : 0)
    : (PerfGov.tier() >= 3 ? Math.min(farPlane, _fogCull || farPlane) : _fogCull);
  ```
- Do NOT touch the unrelated `900` far-plane literals in `glx.js:762` /
  `wgx.js:1644` (env-cube reflection-probe camera for car paint) — different
  system, no reason to scale with player draw distance.

### 3. Shadow distance: widen `shadowRange`, relax the night prop gate, scale car shadow

`js/game/lighting.js` TUNE_DEFS (~line 81): widen the range and refresh help:
```js
{ id: "shadowRange", label: "SHADOW DISTANCE", group: "SHADOWS", min: 16, max: 300, step: 2, def: 80, u: "uShadowRange", help: "Half-size of the sun shadow box (m). Lower = crisper nearby shadows; higher = shadows reach further before fading. Car shadow reach and shadow-map texel density scale with this too, so very high values soften/blur shadows in exchange for reach." }
```

`js/game/lighting.js` TUNE_DEFS `moonShadow` (~line 85): keep id/range as-is,
extend the help text to document the new high-end escape hatch (see below):
add a sentence like "Above 0.5, this ALSO starts overriding the clear-moon
weather gate so buildings/props cast shadows at night through cloud/fog/wet
too — 1.0 = shadows cast regardless of weather."

`js/game.js` (~line 5438-5447, where `frame.moonK` is computed): add a
`frame.moonGate` alongside it — `frame.moonK` unchanged (still feeds sky/moon
rendering elsewhere), `moonGate` floors it with an escape hatch driven by the
`moonShadow` knob itself once pushed above 0.5:
```js
const _msh = LT.moonShadow != null ? LT.moonShadow : 0.25;
frame.moonGate = Math.max(frame.moonK, clamp((_msh - 0.5) * 2, 0, 1));
```
(`clamp` is already used inline a few lines above for `frame.moonK` itself.)

`js/game.js:5533` (prop-shadow cast gate): swap `frame.moonK` for the new
`frame.moonGate`:
```js
if (_shKey > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01)) gfx.castShadowChunked(track.meshes.props, MAT_IDENT);
```

`js/render/glx.js:969` (shadow-strength fade floor): same swap, from
`frame.moonK` to `frame.moonGate`:
```js
const _mSh = (T && T.moonShadow != null ? T.moonShadow : 0.25) * (frame.moonGate || 0);
```

`js/game.js:5551` (car shadow box, currently a fixed `±42`): scale
proportionally with `shadowRange`, anchored so the DEFAULT shadowRange (80)
reproduces exactly today's 42m box — no visual change unless the player moves
the slider:
```js
const cBox = 42 * Math.max(1, sBox / 80);
M4.orthoTo(_mCProj, -cBox, cBox, -cBox, cBox, 1.0, 320);
```
(`sBox` is already in scope from the `shadowRange` read a few lines above at
`game.js:5474`.)

## Cache bust

Per `CLAUDE.md` / `.claude/skills/bump-cache`: after all edits, bump every
`?v=N` in `index.html` to max+1 and set the matching `version.json` value —
last edit before commit.

## Verification

1. `node tools/pick-tests.mjs --staged` after the diff exists, to confirm
   which groups it flags (expect at least a lighting/webgl-probes-adjacent
   group given `js/game/lighting.js` + `js/game.js` + `js/render/glx.js`
   changes).
2. Use the **lighting-tuner** skill's before/after workflow:
   ```sh
   node tools/apex-eval.mjs bahrain "(a.setTimeOfDay('night'), a.lightState())" --raw
   ```
   before/after to confirm `numLights`/`lightState()` still look sane at
   defaults (no regression to the day/night light budget).
3. Manually drive Bahrain at night via `node tools/apex-eval.mjs` or a local
   `npx serve` session: confirm the three new/changed sliders exist in the
   LIGHTING TUNER panel (LAMP REACH AHEAD under LAMPS/BEHAVIOUR, RENDER
   DISTANCE under ATMOSPHERE, SHADOW DISTANCE's new 300m ceiling under
   SHADOWS), and that dragging `lampReach` and `moonShadow` visibly extends
   lit-lamp / shadow reach ahead of the car without changing the look at each
   knob's default value.
4. Run `npx playwright test tests/specs/lighting-ab.spec.js` (night light
   budget) and `tests/specs/webgl-probes.spec.js` (GL errors + render probes)
   via `node tools/test-bg.mjs` in the background, per `docs/TESTING.md`
   rules (never block/poll; watch the log for the terminal `= run <status>`
   line) — these are the two specs most likely to catch a regression from the
   `moonK`→`moonGate` swap or the `farPlane`/`cullDist` change.
5. `npm run test:tooling-fast` as the standard no-browser guard suite.
