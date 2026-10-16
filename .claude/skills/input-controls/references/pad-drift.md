# Triage: gamepad stick drifts / creeps when centred

1. Read the live state: `__apex.inputState()` carries `pad.steer`, `padDeadzone`,
   `padSaturation`, `padRestOffset`, `padAxisMap`, `padSteerAnalog` (reference: `docs/DEBUG-HOOKS.md` §inputState).
   Non-zero `pad.steer` at rest with `padRestOffset` 0 = never calibrated.
2. Wheel or wrong axis map? `padIsWheel` (input.js) is true for a non-standard pad with a saved map; at the
   default dead zone it forces dz 0, so a wheel "drift" is a map/rest problem. Compare `padAxisMap` with
   `getPadAxisMap()` defaults; `RESET CONTROLLER` (`pm-pad-reset`) restores them, `SET UP A WHEEL` (`pm-pad-wheel`) remaps.
3. Player fix, no code: CALIBRATE STICK (`pm-pad-calib`). The rest is per pad: `padRestMap` keyed by `padIdOf(pad)`;
   a legacy scalar `padRestLegacy` is handed to the first pad that drives.
4. Code fix: dead-zone default is `PAD_DZ_DEFAULT` (input.js). A raised default reaches fresh installs only; a stored
   `padDeadzone` needs a STEER_SCHEMA step (steer-migration.spec).
5. Repro in a spec: mock `navigator.getGamepads` as `tests/specs/gamepad.spec.js` does; poll once per frame.
