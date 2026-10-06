# Tracks UI shots — handoff

- Live: https://brycejmurrin.github.io/f1-game/
- `version.json`: `{ "build": 14034 }`
- Shots: **21** unique PNGs → `artifacts/shots/tracks-ui/`
- Viewport: 1440×900 desktop; 852×393 phone landscape
- Capture: `scratch/tracks-ui-capture/capture.mjs` (live URL; not apex_* — github.io blocked)

## Coverage

| Area | Shots |
|---|---|
| Track list / filters | `01` default, `02` season, `03` classics, `07` scrolled strip |
| Select previews | `04` Monza, `05` Spa, `06` Monaco |
| Circuit detail sheets | `08` Monza, `09` Spa, `10` Monaco, `11` Jeddah, `12` Singapore, `13` Bahrain |
| Track Designer | `14` main, `15` HOW TO, `16` RANDOMISE edit, `17` MY CIRCUITS |
| Race settings | `18` after Monza pick (header `MONZA · McLaren · …`) |
| Phone | `19` select, `20` Spa detail, `21` designer |

## Findings

See `FINDINGS.md` (5). None are mesh/scenery.

## Tooling note (not a UI finding)

Live `#sel-tracks` uses `.track-row` buttons (`data-search` / `aria-label`). Repo `tools/ui/circuit-axis.mjs` `pickCircuit` still looks for `[role="option"]` / `data-track` — that path misses every row on build 14034. Capture script uses the live selector.

## Handoff

- OWNED: artifacts only. No track geometry / merges.
- Branch: `cursor/shots-tracks-ui-4b4d` ← `claude/f1-game-project-26h3ng`
- Concurrent chrome PRs (`track-select-detail-ui`, `track-designer-ui`) may change these frames after 14034 — re-shot if they ship.
- No CI loops; draft PR optional for artifact delivery.
