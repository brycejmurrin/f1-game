---
name: input-controls
description: "Use when steering or controls misbehave: stuck touch steering or buttons on iPhone, phone-as-controller, gamepad dead zone or drift, tilt, keys leaking into menus, assists or the GRIP STEER slider. Not for: grip or understeer → tune-physics; menu focus → ui-menu-a11y; screenshots → playwright-probe."
---

# Driving input — devices, not forces

`js/input/input.js` owns **how a device becomes a steer/throttle/brake command**; **tune-physics** owns the
bicycle model those commands hit. Phone pairing/connection (QR, room code) → **multiplayer-debug**; the roll once
paired stays here. Escape/focus paths → **ui-menu-a11y**.

## Gotchas

- A sticky gamepad is not understeer: fix the device path here, never a force. The STEER LOCK / LINEARITY /
  SPEED STEER sliders are player settings owned here; tune-physics owns them only as `setPhysics` A/B knobs.
- A new default reaches fresh installs only: add a `STEER_SCHEMA` step (`references/assists.md`).
- iOS user activation comes only from `touchend` / `pointerup` / `click`: a `requestGyro()` or audio request tied
  to `input.js`'s pointerdown handlers fails on the first tap (the phone page asks inside its CONNECT tap).
- A short decay after lift is the `KEY_RAMP_OUT` ramp, not a stuck latch: `btn.left` false with `btn.steerVal`
  falling = ramp; `btn.left` still true = latch.
- Gamepad has **no change events** — `Input.poll()` once per frame. The menu stick (`PAD_NAV_DEADZONE`) and tilt
  dead zones are separate from `padDeadzone`: do not conflate.
- `UiLayers` must eat keys while a menu is up (a leak is this skill); an Escape that opens a `<dialog>` must
  `preventDefault()` on that keydown (`docs/research/PLATFORM-INPUT-NOTES.md`).

## Workflow

1. Reproduce at Bryce's profile first: iPhone, 844×390 landscape, touch — before any desk device. Parent session
   only (skill **mcp-probe**, or Playwright MCP `browser_*` with touch at 844×390); a subagent cannot run a
   browser (AGENTS.md rule 10).
2. Read `__apex.inputState()`: `steerMode` first (buttons / drag / tilt), then `btn.*` (buttons),
   `touchSteer` / `touchActive` (drag), `pad.*` (gamepad) or `gate` (menu leak).
3. Find which source wins in `Input.steer()` and which file owns it → [references/sources-and-files.md](references/sources-and-files.md).
4. Route the symptom to its reference (below) and fix there.
5. Changed a default or a slider? Add the `STEER_SCHEMA` step and check `tests/specs/steer-migration.spec.js`
   → [references/assists.md](references/assists.md).
6. Verify: the node pins, then ONE browser spec in the background:

```sh
node --test tests/unit/key-binds.test.mjs tests/unit/ui-improve-pass.test.mjs   # node pins
node tools/ci/test-bg.mjs --spec tests/specs/tilt-pipeline.spec.js   # ONE spec per run; swap in the one that matches:
#   touch-buttons, touch-steer, touch-pedals, gamepad, steering, steer-migration or sliders
# whole group (test:input, camera specs too) only if one spec is not enough: node tools/ci/remote-group.mjs input,
# or, when Actions is jammed: node tools/ci/test-bg.mjs input (AGENTS.md verification table)
```

## References

- [references/menu-leak-touch.md](references/menu-leak-touch.md) — read when keys leak into a menu (or a menu eats
  the wheel), on-screen buttons stick after lift (the four release nets), canvas drag misbehaves, tilt is off after
  rotation, or the racing-line ribbon "stays highlighted".
- [references/pad-drift.md](references/pad-drift.md) — read when a gamepad stick drifts, never reaches full lock,
  or you touch `padDeadzone` / `padSaturation` / calibration / `padAxisShape`.
- [references/sources-and-files.md](references/sources-and-files.md) — read when two sources fight (keyboard vs
  pad vs phone vs tilt), for PHONE AS CONTROLLER / XR stick seams, or to find which `js/input/` file owns a symbol.
- [references/assists.md](references/assists.md) — read when changing an assist (`drivingHelp`, `raceLine`,
  `adaptiveButtons`, `brakeCue`, `gripSteer`) or any slider default.
- Platform traps (iPad tilt, dialog Escape) → `docs/research/PLATFORM-INPUT-NOTES.md`; control research →
  `docs/research/DRIVING-CONTROLS-RESEARCH.md`; feel / grip / pace → **tune-physics**.
