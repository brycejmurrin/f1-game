# Feedback recipes — depth for `game-feel`

Detail [the game-feel SKILL.md](../SKILL.md) defers here: the shake math, which easing
curve for which job, the rest of the feedback menu, importance tiers and accessibility.
Plain JS/CSS for this codebase; every value is a render/audio input, never a physics one.

## Contents
- 1. The trauma model (why shake feels good)
- 2. Easing cheat sheet
- 3. The rest of the feedback menu
- 4. Importance tiers
- 5. Accessibility

## 1. The trauma model (why shake feels good)

Track one `trauma` value in `[0, 1]`. Events **add** trauma; it **decays** linearly each
frame. The applied shake is `trauma ** 2`, so small frequent events barely nudge the view,
big ones punch, and shake always ends on its own.

Offset and roll are `max * shake * noise(t)`. Sample summed sines (or value noise) across
time — never a fresh `Math.random()` per frame: that buzzes instead of shaking, and an RNG
draw in the frame loop is how cosmetic code breaks headless determinism.

```js
const axis = (seed, t) => 0.6 * Math.sin(t * 11 + seed) + 0.4 * Math.sin(t * 23 + seed * 2);
// per render frame, camera only:
trauma = Math.max(0, trauma - decay * dt);
const s = trauma * trauma;
camOffsetX = maxOffset * s * axis(1.7, t);
camRoll    = maxRoll   * s * axis(4.2, t);
```

Starting points: `maxRoll` 0.03–0.08 rad, `decay` 1.0–1.5 /s, per-event trauma 0.15 (light)
→ 0.8 (heavy). In Apex `feel.shake` (js/game.js) is the existing accumulator; feed it rather
than adding a second one.

## 2. Easing cheat sheet

| Goal | Curve | CSS | Notes |
|------|-------|-----|-------|
| HUD/element "pop" in | overshoot | `cubic-bezier(.34,1.56,.64,1)` | shoots past, settles back |
| Settle / decelerate | ease-out | `cubic-bezier(.22,1,.36,1)` | the default "comes to rest" |
| Wind-up before a fast action | ease-in | `cubic-bezier(.55,0,1,.45)` | slow start |
| Smooth A→B both ends | ease-in-out | `ease-in-out` | camera moves, menu slides |
| Bouncy land | elastic | JS spring only | sparingly; reads as cartoonish |

Prefer CSS transitions for DOM/HUD (no per-frame JS). In the render loop, a critically
damped follow (`x += (target - x) * (1 - Math.exp(-k * dt))`) is frame-rate independent.

## 3. The rest of the feedback menu

- **Flash:** tint the HUD element or material toward white for 1–3 frames on hit, then ease
  back. Cheap, hugely legible.
- **Knockback:** a physics impulse, so out of scope here (it changes `obs()`); in Apex
  the collision response belongs to **race-incidents-control** / **tune-physics**.
- **Particles:** a short burst at the contact point (sparks, dust, debris) via
  `js/fx/particles.js`. Respect the `js/perf/governor.js` budget; never allocate per hit.
- **Freeze frame:** in Apex a render-only hold (see workflow.md, hit-stop); scale duration
  to importance (0.04 s light → 0.15 s heavy). The sim never pauses.
- **Audio layer:** a transient on the event (thud, scrape, shift clunk) in
  `js/audio/engine.js`, scaled from the same impact value as the shake.
- **Chromatic/vignette/zoom punch:** post-process nudges for big moments; keep brief.

## 4. Importance tiers

Assign every event to one tier so the game is neither dead nor exhausting.

| Tier | Trauma | Freeze | Particles | Extra | Apex examples |
|------|:------:|:------:|:---------:|-------|---------------|
| small | 0.10–0.20 | none | 0–4 | tick sfx | kerb entry, gear shift |
| medium | 0.30–0.50 | none | 6–12 | flash | light car contact, gravel entry |
| large | 0.70–1.00 | 0.10–0.15 s render hold | 20–40 | flash + zoom | heavy wall hit, big car-car crash |

## 5. Accessibility

- **Reduce screen shake:** scale trauma output by a 0–100 % setting.
- **Reduce flashing** (photosensitivity): replace white flashes with a static tint.
- **Reduce camera motion:** cut roll and zoom punches.

Expose these through the existing settings UI (**ui-menu-a11y** owns the menu), and honour
`prefers-reduced-motion` for DOM effects.
