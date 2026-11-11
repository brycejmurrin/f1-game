# BEFORE pack — fetch, do not recapture

Car/garage agents MUST NOT capture their own full-grid garage BEFORE pack
(`garage-angles.mjs --budget=12m` / wheels-tyres runs). That costs 12–28 min
on llvmpipe and is why **Garage before** exists.

```sh
node tools/garage-angles-fetch.mjs                  # merge-base with ship
node tools/garage-angles-fetch.mjs --sha HEAD --out artifacts/garage-before
gh workflow run garage-before.yml -f ref=claude/f1-game-project-26h3ng
```

The pack is `garage-before-<sha>` (MANIFEST.json: team, preset, file, sha,
timestamp). If the exact SHA has no pack, the script takes the nearest
ancestor and prints compare-API staleness (commits + js/car|garage|render
files). Capture only AFTER shots for the angles you changed, then
`--baseline=` / `--against=` against the fetched pack. Workflow:
`.github/workflows/garage-before.yml` (its runner, shards and schedule live
there) — scheduled when watched paths moved, or on dispatch; not a required
check, so a car change merged today has no pack until its next run. The car studio
(`carview.html`) has no garage room, so it cannot stand in for this pack.
