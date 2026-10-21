# B·H8 probes (handoff 2026-10-21): not shipped, force-added for the next session

- `boot-probe.mjs <url> --cpu 4 --net fast4g --backend three|webgl2|unset --tap [--runs N]`: phone-profile boot (cold + warm), long tasks, resources, first tap. `boot-ab.sh` serves two trees on 3461/3462 and alternates.
- `tap-probe.mjs <url> --target race|garage --at <ms>`: one cold boot, a tap `at` ms after the title wires, tap→screen. `tap-ab.sh` is the #3386 A/B matrix.
- `title-lt-profile.mjs <url> [three|webgl2]`: CPU profile of the biggest long task after the title wires (found the garage prebuild).
- `h8-boot-ab.mjs`, `h8-stages.mjs`, race/paced/warm probes: race-entry timing and raceEntryStages.
