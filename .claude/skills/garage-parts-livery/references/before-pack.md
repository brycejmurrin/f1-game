# BEFORE pack — fetch, do not recapture

Car/garage agents MUST NOT capture their own 11-team garage BEFORE grid
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
`.github/workflows/garage-before.yml` — macos, 4 team shards, daily
(10:23 UTC, only when watched paths moved) or on dispatch, not a
required check; a car change merged today has no pack until then. The car studio
(`carview.html`) has no garage room, so it cannot stand in for this pack.
