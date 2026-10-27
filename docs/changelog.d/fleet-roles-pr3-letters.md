New: fleet-bus.mjs who <letter>` names a fleet's live orchestrator from the newest `ORCH <letter> LIVE <host>:<id>` bus line, so a fleet block can say `orchestrator: A` instead of a session id that goes stale at every rotation.
Improved: `tools/ci/pr-board.mjs` shows each PR's fleet letter and slot (FL and SLOT columns; `fleetLetter` and `slot` in `--json`), read from the PR body's fleet block.
Improved: `tools/ci/ready-gate.mjs --pr` refuses a `cursor/` branch whose PR body lacks the fleet block's `fleet:` and `orchestrator:` lines, naming the missing field.
