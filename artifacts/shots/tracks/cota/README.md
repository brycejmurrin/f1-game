# COTA survey captures (branch `cursor/cota-survey-fc61`)

30 PNG frames for `docs/tracks/surveys/cota.md`. Paths are gitignored under `artifacts/` until the fleet adds `!artifacts/shots/tracks/**`; commit with `git add -f artifacts/shots/tracks/cota/*.png`.

- **Day · dry sector tour:** sector-* and landmark-* plus anchor-*-day-dry.
- **Time of day (dry):** dawn/dusk/night on four anchors (`anchor-*-{dawn,dusk,night}-dry.png`).
- **Weather** (`wet`, `rain`, `overcast`, `fog`): deferred — re-capture after rebasing on shared shot tooling PR.

Regenerate supplement only:

```sh
node tools/shot/shot.mjs --batch artifacts/shots/tracks/cota/capture-jobs-supplement.jsonl --wait 150
```
